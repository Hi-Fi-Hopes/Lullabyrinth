package com.hifihopes.lullabyrinth;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Insets;
import android.media.AudioManager;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.window.OnBackInvokedDispatcher;

public class MainActivity extends Activity {

    static MainActivity instance;
    private WebView web;
    private FrameLayout root;
    private boolean askedNotif = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        instance = this;
        setVolumeControlStream(AudioManager.STREAM_MUSIC);

        Window w = getWindow();
        w.setStatusBarColor(Color.rgb(6, 5, 13));
        w.setNavigationBarColor(Color.rgb(6, 5, 13));

        root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(6, 5, 13));
        if (Build.VERSION.SDK_INT >= 30) {
            w.setDecorFitsSystemWindows(false);
            root.setOnApplyWindowInsetsListener((v, insets) -> {
                Insets i = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                v.setPadding(i.left, i.top, i.right, i.bottom);
                return WindowInsets.CONSUMED;
            });
        }
        setContentView(root);
        buildWebView();

        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                    OnBackInvokedDispatcher.PRIORITY_DEFAULT, () -> moveTaskToBack(true));
        }
    }

    private void buildWebView() {
        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(6, 5, 13));
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(true);
        // Keep the audio renderer at high priority even when the screen is off.
        web.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false);
        web.addJavascriptInterface(new Bridge(), "Android");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                stopService(new Intent(MainActivity.this, DreamService.class));
                root.removeView(view);
                view.destroy();
                buildWebView();
                return true;
            }
        });
        root.addView(web, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        web.loadUrl("file:///android_asset/index.html");
    }

    @SuppressWarnings("deprecation")
    @Override
    public void onBackPressed() {
        // Back sends the app to the background instead of closing it, so the dream keeps playing.
        moveTaskToBack(true);
    }

    // Deliberately no web.onPause() in onPause(): audio must keep running with the screen off.

    @Override
    protected void onDestroy() {
        if (isFinishing()) stopService(new Intent(this, DreamService.class));
        if (web != null) web.destroy();
        if (instance == this) instance = null;
        super.onDestroy();
    }

    static void stopFromNotification() {
        final MainActivity a = instance;
        if (a == null || a.web == null) return;
        a.runOnUiThread(() -> a.web.evaluateJavascript("window.LB && LB.remoteStop()", null));
    }

    private void setDim(boolean dim) {
        WindowManager.LayoutParams lp = getWindow().getAttributes();
        lp.screenBrightness = dim ? 0.01f : WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE;
        getWindow().setAttributes(lp);
    }

    private class Bridge {
        @JavascriptInterface
        public void setPlaying(boolean playing, String title) {
            runOnUiThread(() -> {
                Intent i = new Intent(MainActivity.this, DreamService.class);
                if (playing) {
                    if (Build.VERSION.SDK_INT >= 33 && !askedNotif
                            && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                        askedNotif = true;
                        requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 7);
                    }
                    i.putExtra("title", title);
                    try {
                        startForegroundService(i);
                    } catch (Exception e) {
                        // If Android refuses (e.g. app already backgrounded), audio still plays while the app is open.
                    }
                } else {
                    stopService(i);
                }
            });
        }

        @JavascriptInterface
        public void setDim(boolean dim) {
            runOnUiThread(() -> MainActivity.this.setDim(dim));
        }

        @JavascriptInterface
        public void save(String json) {
            getSharedPreferences("lullabyrinth", MODE_PRIVATE).edit().putString("state", json).apply();
        }

        @JavascriptInterface
        public String load() {
            SharedPreferences p = getSharedPreferences("lullabyrinth", MODE_PRIVATE);
            return p.getString("state", "");
        }
    }
}
