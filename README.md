# Lullabyrinth

A set-it-and-forget-it generative ambient sound machine for Android, built for falling asleep.

- **Engine** (`app/src/main/assets/engine.js`): Web Audio, all sound synthesized live — pads, drone, glass bells / singing bowls, melody fragments, formant choir, wind / ocean / rain / vinyl dust, through a 9.5 s convolution reverb and ping-pong delay. Everything is scheduled ahead on the audio clock so it keeps flowing with the screen off.
- **Five macros**: Slow Tide (density/pace), Aphelion (distance/space), Mothlight (brightness), Undertow (depth/drone), Petrichor (weather/tape drift). "Let the knobs dream" makes each one wander slowly around its setting.
- **Keys, scales, styles**: 12 keys, 12 scales, 6 styles. **Conjure** rolls a new dream (with per-item hold).
- **Sleep timer** with a long, gentle fade; **night veil** dims the screen after 45 s.
- **Android wrapper**: WebView + foreground media service + partial wake lock so playback survives screen-off.

GitHub Actions builds `lullabyrinth.apk` on every push to `main` (see Releases) and renders an offline audio preview of the engine in headless Chrome as a regression check.
