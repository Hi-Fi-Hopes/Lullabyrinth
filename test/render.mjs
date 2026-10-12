// Renders the engine offline in headless Chrome and reports levels/errors.
// Usage: node test/render.mjs  (needs puppeteer-core and Chrome at $CHROME)
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME || '/usr/bin/google-chrome',
  args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
  protocolTimeout: 1800000,
});
const page = await browser.newPage();
page.on('console', m => { const t = m.text(); if (!t.includes('outside nominal range')) console.log('[page]', t); });
page.on('pageerror', e => console.log('[pageerror]', e.message));
await page.goto(pathToFileURL(path.join(here, 'render.html')).href);
await page.waitForFunction('window.ready === true');
const report = [];
let failed = false;

// 0) CPU benchmark: how many times faster than real time each engine renders (single thread, like the audio thread)
const benchUrl = e => pathToFileURL(path.join(here, 'render.html')).href + '?engine=' + encodeURIComponent(e);
await page.goto(benchUrl('../app/src/main/assets/engine.js'));
await page.waitForFunction('window.ready === true');
const variants = [['baseline', {}], ['no reverb', { noConv: 1 }], ['no compressors', { noComp: 1 }], ['no param updates', { noAuto: 1 }],
  ['no bells/melody', { noBells: 1 }], ['no pads', { noPads: 1 }], ['no choir', { noChoir: 1 }], ['no air/noise', { noAir: 1 }],
  ['nothing but drone', { noConv: 1, noComp: 1, noAuto: 1, noBells: 1, noPads: 1, noChoir: 1, noAir: 1 }]];
for (const style of ['Glass Cathedral', 'Singing Stones']) {
  for (const [label, flags] of variants) {
    await page.evaluate(f => { window.LB_BENCH = f; }, flags);
    const r = await page.evaluate(o => window.render(o), { seconds: 60, sampleRate: 48000,
      state: { style, root: 2, scale: 'Dorian', dream: true, macros: { tide: .9, aph: .9, moth: .8, under: .7, petri: .8 } } });
    const line = `BENCH ${style.padEnd(16)} ${label.padEnd(18)} ${String(r.speed).padStart(6)}x realtime`;
    console.log(line); report.push(line);
  }
}
await page.evaluate(() => { window.LB_BENCH = {}; });
await page.goto(benchUrl('../app/src/main/assets/engine.js'));
await page.waitForFunction('window.ready === true');

const styles = ['Glass Cathedral', 'Abyssal Lullaby', 'Moth Choir', 'Frost Garden', 'Tidal Drift', 'Singing Stones'];

// 1) Level check per style at default knobs and at extreme knobs
for (const style of styles) {
  for (const [label, macros] of [['default', null], ['max', { tide: 1, aph: 1, moth: 1, under: 1, petri: 1 }], ['min', { tide: 0, aph: 0, moth: 0, under: 0, petri: 0 }]]) {
    const state = { style, root: 2, scale: 'Dorian', dream: false };
    if (macros) state.macros = macros;
    const r = await page.evaluate(o => window.render(o), { seconds: 90, sampleRate: 22050, state });
    const body = r.rms5s.slice(3);
    const line = `${style.padEnd(16)} ${label.padEnd(8)} peak ${String(r.peakDb).padStart(6)} dB  rms(min/avg/max) ${Math.min(...body)}/${(body.reduce((a, b) => a + b, 0) / body.length).toFixed(1)}/${Math.max(...body)} dB  errors ${r.errors.length} nan ${r.nan}`;
    console.log(line); report.push(line);
    if (r.errors.length || r.nan) { failed = true; console.log(r.errors.slice(0, 10).join('\n')); }
  }
}

// 2) Scenario: style change, conjure, extreme knobs, sleep timer — plus a listenable preview
const scenario = [
  { t: 50, call: 'setStyle', args: ['Abyssal Lullaby'] },
  { t: 85, call: 'conjure', args: [{}] },
  { t: 120, call: 'setScale', args: ['Hirajoshi'] },
  { t: 150, call: 'setSleep', args: [0.5] },
];
const r = await page.evaluate(o => window.render(o), {
  seconds: 185, sampleRate: 44100, wav: true,
  state: { style: 'Glass Cathedral', root: 2, scale: 'Lydian', dream: true, name: 'Preview' }, script: scenario,
});
const line = `scenario peak ${r.peakDb} dB errors ${r.errors.length} nan ${r.nan}\nrms per 5s: ${r.rms5s.join(' ')}\nended as: ${r.final.name} — ${r.final.style}, ${r.final.scale}`;
console.log(line); report.push(line);
if (r.errors.length || r.nan) { failed = true; console.log(r.errors.slice(0, 10).join('\n')); }
fs.mkdirSync(path.join(here, 'out'), { recursive: true });
fs.writeFileSync(path.join(here, 'out', 'preview.wav'), Buffer.from(r.wav, 'base64'));
fs.writeFileSync(path.join(here, 'out', 'report.txt'), report.join('\n') + '\n');
await browser.close();
if (failed) { console.log('ENGINE ERRORS FOUND'); process.exit(1); }
