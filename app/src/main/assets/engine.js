/* Lullabyrinth — generative ambient engine (Web Audio)
   Everything is scheduled ahead on the audio clock, so the sound keeps
   flowing even if the page's timers get throttled while the screen is off. */
'use strict';
(function (G) {

const NOTE_NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];

const SCALES = {
  'Lydian':           [0, 2, 4, 6, 7, 9, 11],
  'Ionian':           [0, 2, 4, 5, 7, 9, 11],
  'Mixolydian':       [0, 2, 4, 5, 7, 9, 10],
  'Dorian':           [0, 2, 3, 5, 7, 9, 10],
  'Aeolian':          [0, 2, 3, 5, 7, 8, 10],
  'Phrygian':         [0, 1, 3, 5, 7, 8, 10],
  'Harmonic Minor':   [0, 2, 3, 5, 7, 8, 11],
  'Major Pentatonic': [0, 2, 4, 7, 9],
  'Minor Pentatonic': [0, 3, 5, 7, 10],
  'Hirajoshi':        [0, 2, 3, 7, 8],
  'In Sen':           [0, 1, 5, 7, 10],
  'Whole Tone':       [0, 2, 4, 6, 8, 10],
};

// layers: relative weight of each voice family in the style
const STYLES = {
  'Glass Cathedral': { hue: [205, 270], layers: { pad: 1, drone: .55, bell: .85, mel: .55, choir: .35, air: .3 },
    bell: 'glass', padOct: 3, wind: 1, ocean: 0, still: .3, scales: ['Lydian', 'Ionian', 'Major Pentatonic', 'Mixolydian'] },
  'Abyssal Lullaby': { hue: [212, 248], layers: { pad: .85, drone: 1, bell: .35, mel: .2, choir: .25, air: .65 },
    bell: 'bowl', padOct: 2, wind: .25, ocean: 1, still: .8, scales: ['Aeolian', 'Dorian', 'Phrygian', 'Minor Pentatonic'] },
  'Moth Choir': { hue: [280, 330], layers: { pad: .6, drone: .6, bell: .3, mel: .25, choir: 1, air: .3 },
    bell: 'glass', padOct: 3, wind: 1, ocean: 0, still: .4, scales: ['Dorian', 'Aeolian', 'Lydian', 'Mixolydian'] },
  'Frost Garden': { hue: [168, 205], layers: { pad: .5, drone: .35, bell: 1, mel: 1, choir: .15, air: .35 },
    bell: 'glass', padOct: 3, wind: 1, ocean: 0, still: .2, scales: ['Major Pentatonic', 'Hirajoshi', 'In Sen', 'Lydian'] },
  'Tidal Drift': { hue: [185, 222], layers: { pad: .9, drone: .75, bell: .2, mel: .12, choir: .35, air: 1 },
    bell: 'bowl', padOct: 3, wind: .2, ocean: 1, still: .6, scales: ['Ionian', 'Mixolydian', 'Major Pentatonic', 'Dorian'] },
  'Singing Stones': { hue: [24, 52], layers: { pad: .4, drone: 1, bell: 1, mel: .15, choir: .5, air: .3 },
    bell: 'bowl', padOct: 2, wind: 1, ocean: 0, still: .9, scales: ['Minor Pentatonic', 'In Sen', 'Hirajoshi', 'Dorian', 'Whole Tone'] },
};

const MACROS = [
  { k: 'tide',  name: 'Slow Tide', sub: 'how much happens', hint: 'Note density, chord pace, and how often sleeping voices wake up.', def: .32 },
  { k: 'aph',   name: 'Aphelion',  sub: 'how far away',     hint: 'Reverb depth, echo trails — how far the sound is from you.', def: .62 },
  { k: 'moth',  name: 'Mothlight', sub: 'how much light',   hint: 'Brightness, high chimes, and ghost octaves floating over the pads.', def: .38 },
  { k: 'under', name: 'Undertow',  sub: 'how deep',         hint: 'Drone weight, sub-bass, and how far the harmony sinks.', def: .45 },
  { k: 'petri', name: 'Petrichor', sub: 'the weather',      hint: 'Wind, rain, vinyl dust, and tape drift.', def: .28 },
];

// Base loudness per layer (before style + section weighting)
const LEVEL = { pad: .62, drone: .55, bell: .55, mel: .5, choir: .55, air: .7, weather: 1 };
// [dry, reverb, delay] sends per layer
const SENDS = { pad: [1, 1, .12], drone: [1, .55, 0], bell: [.75, 1, .55], mel: [.7, 1, .8],
  choir: [.75, 1.1, .18], air: [1, .35, 0], weather: [1, .3, 0] };
const VOWELS = { u: [320, 800, 2240], o: [500, 860, 2400], a: [700, 1100, 2450], e: [480, 1720, 2480] };

const NAME_A = ['Velvet', 'Drowned', 'Lantern', 'Hollow', 'Silver', 'Sleeping', 'Paper', 'Amber', 'Glass', 'Lunar',
  'Moth-Eaten', 'Slow', 'Distant', 'Borrowed', 'Quiet', 'Salt', 'Cobalt', 'Woolen', 'Sunken', 'Unlit', 'Feathered', 'Foggy'];
const NAME_N = ['Orrery', 'Cathedral', 'Lighthouse', 'Garden', 'Archive', 'Choir', 'Meridian', 'Reservoir', 'Observatory',
  'Atlas', 'Harbor', 'Labyrinth', 'Comet', 'Planetarium', 'Greenhouse', 'Aquarium', 'Ferry', 'Attic', 'Bell Tower', 'Snowfield'];
const NAME_OF = ['Unsent Letters', 'Small Hours', 'Lost Rivers', 'Distant Bells', 'Folded Maps', 'Half-Remembered Rooms',
  'Quiet Machines', 'Slow Weather', 'Sleeping Moths', 'Far Lighthouses', 'Warm Static', 'Paper Moons'];

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

const CURVES = {};
function curve(from, to) {
  const key = from + ':' + to;
  if (CURVES[key]) return CURVES[key];
  const n = 64, c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const s = 0.5 - 0.5 * Math.cos(Math.PI * i / (n - 1));
    c[i] = from + (to - from) * s;
  }
  return (CURVES[key] = c);
}
// smooth rise, hold, smooth fall — on a fresh param only
function swell(param, t0, att, hold, rel, peak) {
  param.setValueAtTime(0, t0);
  param.setValueCurveAtTime(curve(0, peak), t0, att);
  param.setValueCurveAtTime(curve(peak, 0), t0 + att + hold + 0.003, rel);
}

class Engine {
  constructor(ctx, opts = {}) {
    this.ctx = ctx;
    this.clock = opts.clock || (() => ctx.currentTime);
    this.useInterval = opts.useInterval !== false;
    this.onChange = opts.onChange || (() => {});
    this.onSleepEnd = opts.onSleepEnd || (() => {});
    const macros = {};
    MACROS.forEach(m => macros[m.k] = m.def);
    this.state = Object.assign({ root: 2, scale: 'Lydian', style: 'Glass Cathedral', macros, dream: true, wander: false,
      volume: .8, name: 'The Lantern Orrery', seed: 1234 }, opts.state || {});
    this.state.macros = Object.assign(macros, (opts.state && opts.state.macros) || {});
    this.live = Object.assign({}, this.state.macros);
    this.rng = mulberry32((this.state.seed ^ (Date.now() & 0xffff)) >>> 0);
    this.bellRatio = 3.5;
    this.newPhases();
    this.chords = [];
    this.deg = 0;
    this.sec = { pad: 1, drone: 1, bell: 1, mel: 1, choir: 1, air: 1 };
    this.secS = Object.assign({}, this.sec);
    this.running = false;
    this.started = false;
    this.sleepEnd = 0; this.sleepTotal = 0;
    this.build();
  }

  /* ---------- graph ---------- */
  build() {
    const c = this.ctx;
    const X = this.X = G.LB_BENCH || {}; // test-only switches for cost profiling
    const g = v => { const n = c.createGain(); n.gain.value = v; return n; };
    const bq = (type, f, q) => { const n = c.createBiquadFilter(); n.type = type; n.frequency.value = f; if (q != null) n.Q.value = q; return n; };
    this.g = g; this.bq = bq;

    // master chain
    this.mix = g(1);
    this.lowShelf = bq('lowshelf', 140); this.highShelf = bq('highshelf', 3200);
    this.darkLP = bq('lowpass', 9000, .5);
    // slow, gentle leveler: evens out quiet and busy settings without pumping on bell strikes
    this.comp = c.createDynamicsCompressor();
    this.comp.threshold.value = -24; this.comp.knee.value = 12; this.comp.ratio.value = 3;
    this.comp.attack.value = .25; this.comp.release.value = 1.5;
    this.makeup = g(2.0);
    this.limiter = c.createDynamicsCompressor();
    this.limiter.threshold.value = -2; this.limiter.knee.value = 4; this.limiter.ratio.value = 12;
    this.limiter.attack.value = .004; this.limiter.release.value = .4;
    this.sleepGain = g(1);
    this.vol = g(this.state.volume);
    this.out = g(0);
    this.analyser = c.createAnalyser(); this.analyser.fftSize = 1024;
    // tape drift: one modulated delay on the whole mix (instead of modulating every oscillator)
    this.wob = c.createDelay(.1); this.wob.delayTime.value = .015;
    this.wobDepth = g(.0005);
    const w1 = c.createOscillator(); w1.frequency.value = .11; w1.connect(this.wobDepth);
    const w2 = c.createOscillator(); w2.frequency.value = .29; const w2g = g(.5); w2.connect(w2g).connect(this.wobDepth);
    this.wobDepth.connect(this.wob.delayTime);
    w1.start(); w2.start();
    const pre = this.mix.connect(this.wob).connect(this.lowShelf).connect(this.highShelf).connect(this.darkLP);
    (X.noComp ? pre : pre.connect(this.comp).connect(this.makeup).connect(this.limiter)).connect(this.sleepGain).connect(this.vol).connect(this.out);
    this.out.connect(this.analyser);
    this.out.connect(c.destination);

    // reverb
    this.dry = g(1); this.dry.connect(this.mix);
    this.revIn = g(.6);
    this.revHP = bq('highpass', 140, .5);
    this.conv = c.createConvolver(); this.conv.normalize = true; this.conv.buffer = this.makeImpulse(this.state.lite ? 2.2 : 3.2);
    this.revLP = bq('lowpass', 5000, .5);
    this.revOut = g(1.15);
    (X.noConv ? this.revIn.connect(this.revHP) : this.revIn.connect(this.revHP).connect(this.conv)).connect(this.revLP).connect(this.revOut).connect(this.mix);

    // ping-pong delay
    this.dlyIn = g(.3);
    this.dL = c.createDelay(4); this.dR = c.createDelay(4);
    this.dL.delayTime.value = 1; this.dR.delayTime.value = 1;
    this.fbA = g(.4); this.fbB = g(.4);
    const fbLP = bq('lowpass', 2600, .5), fbHP = bq('highpass', 220, .5);
    this.dlyIn.connect(this.dL);
    this.dL.connect(fbLP).connect(fbHP).connect(this.fbA).connect(this.dR);
    this.dR.connect(this.fbB).connect(this.dL);
    const pL = c.createStereoPanner(), pR = c.createStereoPanner(); pL.pan.value = -.75; pR.pan.value = .75;
    this.dlyOut = g(.75);
    this.dL.connect(pL).connect(this.dlyOut); this.dR.connect(pR).connect(this.dlyOut);
    this.dlyOut.connect(this.mix);
    const d2r = g(.45); this.dlyOut.connect(d2r).connect(this.revIn);

    const cs = v => { const n = c.createConstantSource(); n.offset.value = v; n.start(); return n; };
    this.subLvl = cs(0);

    // layers
    this.layers = {};
    for (const k of Object.keys(SENDS)) {
      const s = SENDS[k];
      const bus = g(k === 'weather' ? 1 : 0);
      const td = g(s[0]), tr = g(s[1]), tl = g(s[2]);
      bus.connect(td).connect(this.dry);
      bus.connect(tr).connect(this.revIn);
      if (s[2] > 0) bus.connect(tl).connect(this.dlyIn);
      this.layers[k] = { bus, in: bus };
    }
    const lfoTo = (param, rate, depth) => {
      const o = c.createOscillator(); o.frequency.value = rate; const d = g(depth);
      o.connect(d).connect(param); o.start();
    };
    this.padLP = bq('lowpass', 1200, .7); this.padLP.connect(this.layers.pad.bus); this.layers.pad.in = this.padLP;
    lfoTo(this.padLP.frequency, .031, 260); lfoTo(this.padLP.frequency, .073, 120);
    this.bellLP = bq('lowpass', 5000, .5); this.bellLP.connect(this.layers.bell.bus); this.layers.bell.in = this.bellLP;
    this.melLP = bq('lowpass', 2500, .6); this.melLP.connect(this.layers.mel.bus); this.layers.mel.in = this.melLP;
    // choir: shared formant bank that slowly morphs between vowels
    const choirIn = g(1); this.layers.choir.in = choirIn;
    [[500, 180, 7, 1, .017], [1100, 420, 10, .5, .023], [2420, 120, 12, .22, .029]].forEach(([f, dep, q, amp, rate]) => {
      const bp = bq('bandpass', f, q); lfoTo(bp.frequency, rate, dep);
      const a = g(amp * 2.2); choirIn.connect(bp).connect(a).connect(this.layers.choir.bus);
    });

    // waves
    const N = 32, re = new Float32Array(N), warm = new Float32Array(N), bright = new Float32Array(N);
    for (let k = 1; k < N; k++) {
      warm[k] = Math.pow(k, -1.75) * (k % 2 ? 1 : .55);
      bright[k] = 1 / k;
    }
    this.waves = { warm: c.createPeriodicWave(re, warm), bright: c.createPeriodicWave(re, bright) };
  }

  makeImpulse(sec) {
    const c = this.ctx, sr = c.sampleRate, len = Math.floor(sec * sr);
    const buf = c.createBuffer(2, len, sr);
    const r = mulberry32(777);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let y = 0;
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        const env = Math.exp(-t * 6.9 / sec) * Math.min(1, t / .03);
        const a = lerp(.7, .05, Math.min(1, t / sec)); // darker as it decays
        y += a * ((r() * 2 - 1) - y);
        d[i] = y * env;
      }
    }
    return buf;
  }

  makePink(sec, seed) {
    const c = this.ctx, sr = c.sampleRate, len = Math.floor(sec * sr);
    const buf = c.createBuffer(2, len, sr);
    const r = mulberry32(seed);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < len; i++) {
        const w = r() * 2 - 1;
        b0 = .99886 * b0 + w * .0555179; b1 = .99332 * b1 + w * .0750759; b2 = .969 * b2 + w * .153852;
        b3 = .8665 * b3 + w * .3104856; b4 = .55 * b4 + w * .5329522; b5 = -.7616 * b5 - w * .016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * .5362) * .11;
        b6 = w * .115926;
      }
    }
    return buf;
  }

  makeCrackle(sec) {
    const c = this.ctx, sr = c.sampleRate, len = Math.floor(sec * sr);
    const buf = c.createBuffer(2, len, sr);
    const r = mulberry32(99);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let amp = 0;
      for (let i = 0; i < len; i++) {
        if (r() < 7 / sr) amp = Math.pow(r(), 3) * (r() < .5 ? -1 : 1) * .9;
        else if (r() < 40 / sr) amp = (r() - .5) * .08;
        d[i] = amp + (r() - .5) * .004;
        amp *= .55;
      }
    }
    return buf;
  }

  newPhases() {
    this.phases = {};
    for (const m of MACROS) {
      this.phases[m.k] = { p1: 80 + this.rng() * 120, p2: 190 + this.rng() * 260, a: this.rng() * 6.28, b: this.rng() * 6.28 };
    }
  }

  /* ---------- helpers ---------- */
  osc(type, f, t0, t1, detune, cleanup) {
    const o = this.ctx.createOscillator();
    if (typeof type === 'string') o.type = type; else o.setPeriodicWave(type);
    o.frequency.value = f;
    o.detune.value = detune || 0;
    o.start(t0);
    o.stop(t1);
    o.onended = () => {
      try { o.disconnect(); } catch (e) {}
      if (cleanup) try { cleanup(); } catch (e) {}
    };
    return o;
  }
  pan(v) { const p = this.ctx.createStereoPanner(); p.pan.value = clamp(v, -1, 1); return p; }
  pick(arr) { return arr[Math.floor(this.rng() * arr.length)]; }
  get scale() { return SCALES[this.state.scale] || SCALES.Lydian; }
  get style() { return STYLES[this.state.style] || STYLES['Glass Cathedral']; }
  degToMidi(deg, oct) {
    const sc = this.scale, L = sc.length;
    const o = Math.floor(deg / L), i = deg - o * L;
    return 12 * (oct + 1) + this.state.root + sc[i] + 12 * o;
  }
  chordAt(t) {
    let best = null;
    for (const ch of this.chords) if (!ch.killed && ch.t <= t + .5) best = ch;
    return best || { degs: [0, 2, 4] };
  }

  /* ---------- persistent voices ---------- */
  startPersistent(t) {
    const c = this.ctx, g = this.g, bq = this.bq;
    // wind / breath
    const wind = c.createBufferSource(); wind.buffer = this.makePink(11, 5); wind.loop = true; wind.playbackRate.value = .8;
    const wbp = bq('bandpass', 900, .9);
    const wl = c.createOscillator(); wl.frequency.value = .023; const wlg = g(550); wl.connect(wlg).connect(wbp.frequency);
    this.windW = g(this.style.wind);
    wind.connect(wbp).connect(this.windW).connect(this.layers.air.bus);
    // ocean
    const sea = c.createBufferSource(); sea.buffer = this.makePink(13, 8); sea.loop = true;
    this.seaLP = bq('lowpass', 300, .7);
    this.seaEnv = g(.1);
    this.oceanW = g(this.style.ocean);
    sea.connect(this.seaLP).connect(this.seaEnv).connect(this.oceanW).connect(this.layers.air.bus);
    // rain
    const rain = c.createBufferSource(); rain.buffer = this.makePink(9, 11); rain.loop = true;
    this.rainG = g(0);
    rain.connect(bq('highpass', 1800, .5)).connect(bq('lowpass', 7000, .5)).connect(this.rainG).connect(this.layers.weather.bus);
    // vinyl dust
    const crk = c.createBufferSource(); crk.buffer = this.makeCrackle(7); crk.loop = true;
    this.crackG = g(0);
    crk.connect(bq('lowpass', 3000, .5)).connect(bq('highpass', 400, .5)).connect(this.crackG).connect(this.layers.weather.bus);
    if (!this.X.noAir) [wind, wl, sea, rain, crk].forEach(n => n.start(t));
    this.nextWave = t;
    this.drone = this.makeDrone(t, 10);
  }

  makeDrone(t, fadeIn) {
    const c = this.ctx, g = this.g;
    let base = 36 + this.state.root; if (base > 43) base -= 12;
    const f = mtof(base);
    const lp = this.bq('lowpass', 1100, .5);
    const breath = g(.82);
    const bl = c.createOscillator(); bl.frequency.value = .04 + this.rng() * .03; const blg = g(.16);
    bl.connect(blg).connect(breath.gain); bl.start(t);
    const fade = g(0), kill = g(1);
    lp.connect(breath).connect(fade).connect(kill).connect(this.layers.drone.bus);
    fade.gain.setValueAtTime(0, t); fade.gain.setValueCurveAtTime(curve(0, 1), t, fadeIn);
    const far = 1e6;
    const oscs = [bl];
    for (const [semi, type, amp, det] of [[0, 'sine', 1, 0], [12, 'triangle', .5, 4], [12, 'sine', .3, -5], [19, 'sine', .2, 2], [24, 'sine', .1, -3]]) {
      const a = g(amp);
      const o = this.osc(type, f * Math.pow(2, semi / 12), t, t + far, det);
      o.connect(a).connect(lp); oscs.push(o);
    }
    const sub = g(0); this.subLvl.connect(sub.gain);
    const so = this.osc('sine', f / 2, t, t + far, 0, () => { try { this.subLvl.disconnect(sub.gain); } catch (e) {} });
    so.connect(sub).connect(kill); oscs.push(so);
    return { kill, oscs, root: this.state.root };
  }

  fadeDrone(d, t, dur) {
    if (!d || d.dead) return;
    d.dead = true;
    d.kill.gain.setValueAtTime(1, t);
    d.kill.gain.setValueCurveAtTime(curve(1, 0), t, dur);
    d.oscs.forEach(o => { try { o.stop(t + dur + .1); } catch (e) {} });
  }

  /* ---------- harmony ---------- */
  nextDegree(L) {
    const st = this.style, cur = this.deg;
    const moves = [[1, 2], [-1, 2], [2, 1.5], [-2, 1.5], [3, 1.2], [-3, 1], [4, .8], [0, st.still * .6]];
    const cands = moves.map(([s, w]) => {
      const nd = ((cur + s) % L + L) % L;
      let wt = w;
      if (nd === 0) wt *= 1.6;
      if (nd === cur && s !== 0) wt *= .1;
      return [nd, wt];
    });
    let tot = cands.reduce((a, b) => a + b[1], 0), r = this.rng() * tot;
    for (const [nd, w] of cands) { r -= w; if (r <= 0) return nd; }
    return 0;
  }

  scheduleChord(t, opt = {}) {
    const st = this.style, L = this.scale.length, T = this.live.tide, U = this.live.under;
    const dur = lerp(75, 20, T) * (.75 + .5 * this.rng());
    const att = opt.att || clamp(dur * .5, 6, 20);
    const rel = clamp(dur * .55, 8, 22);
    const hold = Math.max(0, dur - att);
    const deg = this.deg = this.nextDegree(L);
    const degs = [deg, deg + 2, deg + 4];
    if (!this.state.lite && this.rng() < .25) degs.push(deg + 6);
    const oct = st.padOct;
    const notes = degs.map((d, i) => {
      let m = this.degToMidi(d, oct + (i > 0 && this.rng() < .5 ? 1 : 0));
      if (i === 0 && U > .66) m -= 12;
      if (i > 0) { while (m < 46) m += 12; while (m > 79) m -= 12; }
      else { while (m < 34) m += 12; while (m > 60) m -= 12; }
      return m;
    });
    const cg = this.g(1); cg.connect(this.layers.pad.in);
    const ch = { t, dur, end: t + att + hold + rel + .2, degs, g: cg, oscs: [], killed: false };
    const lvl = .085 / Math.sqrt(notes.length / 3);
    notes.forEach((m, i) => {
      const pan = (i / Math.max(1, notes.length - 1) - .5) * 1.1 + (this.rng() - .5) * .3;
      if (!this.X.noPads) ch.oscs.push(...this.padNote(m, t + this.rng() * 1.5, att, hold, rel, lvl, pan, cg));
    });
    // choir
    const pc = this.X.noChoir ? 0 : st.layers.choir * this.sec.choir * .9;
    if (this.rng() < pc) {
      const n = 2 + (this.rng() < .4 ? 1 : 0);
      const cAtt = clamp(dur * .55, 8, 20), cRel = clamp(dur * .5, 8, 20);
      const cg2 = this.g(1); cg2.connect(this.layers.choir.in); ch.g2 = cg2;
      for (let i = 0; i < n; i++) {
        let m = this.degToMidi(degs[i % degs.length], 3 + (i === 2 ? 1 : 0));
        while (m < 50) m += 12; while (m > 74) m -= 12;
        const off = this.rng() * 5;
        ch.oscs.push(...this.choirVoice(m, t + off, cAtt, Math.max(0, hold - off), cRel, .16, (this.rng() - .5) * 1.2, cg2));
      }
    }
    this.chords.push(ch);
    return dur;
  }

  padNote(midi, t0, att, hold, rel, level, pan, dest) {
    const f = mtof(midi), end = t0 + att + hold + rel + .1;
    const spread = 4 + 12 * this.live.petri;
    const env = this.g(0); swell(env.gain, t0, att, hold, rel, level);
    const p = this.pan(pan);
    const o1 = this.osc(this.waves.warm, f, t0, end, -spread, () => { try { p.disconnect(); } catch (e) {} });
    const o2 = this.osc(this.waves.warm, f, t0, end, spread);
    o1.connect(env); o2.connect(env); env.connect(p); p.connect(dest);
    return [o1, o2];
  }

  choirVoice(midi, t0, att, hold, rel, level, pan, dest) {
    const f = mtof(midi), end = t0 + att + hold + rel + .1;
    const o1 = this.osc(this.waves.bright, f, t0, end, -6);
    const o2 = this.osc(this.waves.bright, f, t0, end, 7);
    const env = this.g(0); swell(env.gain, t0, att, hold, rel, level);
    o1.connect(env); o2.connect(env);
    env.connect(this.pan(pan)).connect(dest);
    return [o1, o2];
  }

  /* ---------- ornaments ---------- */
  scheduleBells(now, to) {
    const st = this.style, T = this.live.tide;
    const rate = this.X.noBells ? 0 : (this.state.lite ? .6 : 1) * st.layers.bell * this.sec.bell * (.012 + .26 * Math.pow(T, 1.2));
    if (this.nextBell < now) this.nextBell = now + this.rng() * 2;
    if (rate < .002) { this.nextBell = to + 1; return; }
    while (this.nextBell < to) {
      this.bellEvent(this.nextBell);
      this.nextBell += -Math.log(1 - this.rng() * .999) / rate + .4;
    }
  }

  bellEvent(t) {
    const st = this.style, M = this.live.moth;
    const ch = this.chordAt(t);
    const n = this.rng() < .25 ? 2 + (this.rng() < .4 ? 1 : 0) : 1;
    let tt = t;
    for (let i = 0; i < n; i++) {
      const deg = this.rng() < .7 ? this.pick(ch.degs) : Math.floor(this.rng() * this.scale.length);
      const vel = .55 + .45 * this.rng();
      const pan = (this.rng() - .5) * 1.4;
      if (st.bell === 'bowl') {
        const m = this.degToMidi(deg, 3 + (this.rng() < .3 + .3 * M ? 1 : 0));
        this.bowl(clamp(m, 45, 76), tt, vel, pan);
      } else {
        let m = this.degToMidi(deg, 5 + (this.rng() < M * .6 ? 1 : 0));
        while (m > 96) m -= 12;
        this.glassBell(m, tt, vel, pan);
      }
      tt += .08 + this.rng() * .3;
    }
  }

  glassBell(m, t, vel, pan) {
    const f = mtof(m), M = this.live.moth;
    const dec = 3.5 + 5 * this.rng();
    const end = t + dec * 1.6;
    const car = this.osc('sine', f, t, end);
    const mod = this.osc('sine', f * this.bellRatio, t, end);
    const mg = this.g(0);
    mg.gain.setValueAtTime(f * (.3 + 2.2 * M) * vel, t);
    mg.gain.setTargetAtTime(0, t, dec * .15);
    mod.connect(mg).connect(car.frequency);
    const env = this.g(0);
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(vel * .1, t + .012 + .02 * this.rng());
    env.gain.setTargetAtTime(0, t + .04, dec * .3);
    car.connect(env).connect(this.pan(pan)).connect(this.layers.bell.in);
  }

  bowl(m, t, vel, pan) {
    const f = mtof(m);
    const dec = 10 + 12 * this.rng();
    const end = t + dec * 1.4;
    const out = this.pan(pan); out.connect(this.layers.bell.in);
    for (const [r, a] of [[1, 1], [2.76, .42], [5.4, .2]]) {
      if (f * r > 9000) continue;
      const env = this.g(0);
      const at = .06 + .06 * this.rng();
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(a * vel * .055, t + at);
      env.gain.setTargetAtTime(0, t + at, dec * .3 / (1 + r * .2));
      const o1 = this.osc('sine', f * r, t, end);
      const o2 = this.osc('sine', f * r + .5 + 1.5 * this.rng(), t, end);
      o1.connect(env); o2.connect(env); env.connect(out);
    }
  }

  scheduleMel(now, to) {
    const st = this.style, T = this.live.tide;
    const rate = this.X.noBells ? 0 : st.layers.mel * this.sec.mel * (.004 + .05 * T);
    if (this.nextPhrase < now) this.nextPhrase = now + 2 + this.rng() * 6;
    if (rate < .001) { this.nextPhrase = to + 1; return; }
    while (this.nextPhrase < to) {
      const len = this.phrase(this.nextPhrase);
      this.nextPhrase += len + -Math.log(1 - this.rng() * .999) / rate;
    }
  }

  phrase(t) {
    const M = this.live.moth, T = this.live.tide, L = this.scale.length;
    const ch = this.chordAt(t);
    const n = 3 + Math.floor(this.rng() * 5);
    let deg = this.pick(ch.degs);
    const oct = 4 + (M > .5 && this.rng() < .5 ? 1 : 0);
    let pan = (this.rng() - .5) * 1.2;
    const dp = (this.rng() - .5) * .25;
    let tt = t;
    for (let i = 0; i < n; i++) {
      if (this.rng() > .15) {
        let m = this.degToMidi(deg, oct);
        while (m > 88) m -= 12; while (m < 55) m += 12;
        this.pluck(m, tt, .5 + .5 * this.rng(), pan);
      }
      deg += this.pick([-2, -1, -1, 1, 1, 2, 3, -3]);
      if (deg > L * 2) deg -= L; if (deg < -L) deg += L;
      pan = clamp(pan + dp, -.9, .9);
      tt += (.7 + this.rng() * 1.8) * lerp(1.6, .8, T);
    }
    return tt - t;
  }

  pluck(m, t, vel, pan) {
    const f = mtof(m), M = this.live.moth;
    const dec = 1.2 + this.rng() * 1.2;
    const end = t + dec * 5;
    const o1 = this.osc('triangle', f, t, end);
    const o2 = this.osc('sine', f * 2, t, end, 4);
    const g2 = this.g(.3);
    const env = this.g(0);
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(vel * .1, t + .015);
    env.gain.setTargetAtTime(0, t + .02, dec);
    o1.connect(env); o2.connect(g2).connect(env);
    env.connect(this.pan(pan)).connect(this.layers.mel.in);
  }

  scheduleWaves(to) {
    if (this.nextWave < this.clock()) this.nextWave = this.clock();
    while (this.nextWave < to) {
      const t = this.nextWave, P = 7 + this.rng() * 7, pk = .5 + .5 * this.rng();
      this.seaEnv.gain.setTargetAtTime(pk, t, P * .18);
      this.seaEnv.gain.setTargetAtTime(.06, t + P * .45, P * .22);
      this.seaLP.frequency.setTargetAtTime(700 + 700 * pk, t, P * .18);
      this.seaLP.frequency.setTargetAtTime(260, t + P * .45, P * .25);
      this.nextWave += P;
    }
  }

  /* ---------- evolution ---------- */
  newSection(now) {
    const st = this.style, T = this.live.tide;
    for (const k of Object.keys(this.sec)) {
      const base = st.layers[k];
      let m = base * (.45 + this.rng() * .9);
      if ((k === 'bell' || k === 'mel' || k === 'choir') && this.rng() < .2) m = 0;
      this.sec[k] = m;
    }
    if (this.sec.pad < .3 && this.sec.drone < .3) this.sec.pad = .6;
    this.nextSection = now + lerp(420, 150, T) * (.7 + .6 * this.rng());
  }

  updateLive(now) {
    for (const m of MACROS) {
      const s = this.state.macros[m.k];
      if (this.state.dream) {
        const ph = this.phases[m.k];
        const n = .6 * Math.sin(6.2832 * now / ph.p1 + ph.a) + .4 * Math.sin(6.2832 * now / ph.p2 + ph.b);
        this.live[m.k] = clamp(s + .16 * n, 0, 1);
      } else this.live[m.k] = s;
    }
  }

  sleepFrac(now) {
    if (!this.sleepEnd) return 0;
    const fade = this.sleepFade;
    return clamp((now - (this.sleepEnd - fade)) / fade, 0, 1);
  }

  applyMacros(now, tc) {
    const { tide: T, aph: A, moth: M, under: U, petri: P } = this.live;
    const st = this.style, s = this.secS;
    if (this.X.noAuto && this.autoDone) return;
    this.autoDone = true;
    // only touch a parameter when its target has really moved: fewer automation events = less audio-thread work
    const set = (p, v, k) => {
      const last = p.__lb;
      if (last !== undefined && Math.abs(v - last) <= Math.abs(last) * .008 + 1e-6) return;
      p.__lb = v;
      p.setTargetAtTime(v, now, k || tc);
    };
    set(this.dry.gain, 1 - .5 * A);
    set(this.revIn.gain, .25 + .95 * A);
    set(this.dlyIn.gain, .12 + .5 * A);
    set(this.fbA.gain, .2 + .42 * A); set(this.fbB.gain, .2 + .42 * A);
    const dt = .5 + .9 * A;
    set(this.dL.delayTime, dt, 6); set(this.dR.delayTime, dt, 6);
    set(this.revLP.frequency, 1800 + 6500 * M);
    set(this.highShelf.gain, -10 + 13 * M);
    const sf = this.sleepFrac(now);
    set(this.darkLP.frequency, (1800 + 15000 * M * M) * (1 - .8 * sf) + 200);
    set(this.padLP.frequency, 650 + 2600 * M);
    set(this.bellLP.frequency, 2500 + 7000 * M);
    set(this.melLP.frequency, 900 + 3200 * M);
    set(this.lowShelf.gain, -4 + 8 * U);
    set(this.subLvl.offset, Math.max(0, U - .4) * .9);
    set(this.wobDepth.gain, .0003 + .0045 * P * P);
    if (this.rainG) {
      set(this.rainG.gain, Math.max(0, P - .45) * .2);
      set(this.crackG.gain, Math.max(0, P - .6) * .5);
      set(this.windW.gain, st.wind, 4); set(this.oceanW.gain, st.ocean, 4);
    }
    const L = this.layers;
    set(L.pad.bus.gain, LEVEL.pad * s.pad);
    set(L.drone.bus.gain, LEVEL.drone * s.drone * (.15 + 1.1 * U));
    set(L.bell.bus.gain, LEVEL.bell * s.bell);
    set(L.mel.bus.gain, LEVEL.mel * s.mel);
    set(L.choir.bus.gain, LEVEL.choir * s.choir);
    set(L.air.bus.gain, LEVEL.air * s.air * (.15 + 1.2 * P));
  }

  tick() {
    if (!this.running) return;
    const now = this.clock();
    const dt = Math.max(0, now - (this.lastTick || now));
    this.lastTick = now;
    this.updateLive(now);
    if (now >= this.nextSection) this.newSection(now);
    const k = 1 - Math.exp(-dt / 25);
    for (const key of Object.keys(this.sec)) this.secS[key] += (this.sec[key] - this.secS[key]) * k;
    this.applyMacros(now, .8);
    if (this.nextChordAt < now) this.nextChordAt = now + .2;
    while (this.nextChordAt < now + 30) {
      const opt = this.freshAtt ? { att: this.freshAtt } : {};
      this.freshAtt = 0;
      this.nextChordAt += this.scheduleChord(this.nextChordAt, opt);
    }
    this.scheduleBells(now, now + 4);
    this.scheduleMel(now, now + 4);
    this.scheduleWaves(now + 40);
    if (this.state.wander && now >= this.nextWander) this.wanderKey(now);
    this.chords = this.chords.filter(ch => ch.end > now);
    if (this.sleepEnd && now >= this.sleepEnd) {
      this.sleepEnd = 0;
      this.stop(.5);
      this.onSleepEnd();
    }
  }

  /* ---------- transport ---------- */
  startAt(now) {
    if (!this.started) {
      this.started = true;
      this.startPersistent(now);
      this.nextChordAt = now + .1;
      this.nextBell = now + 4 + this.rng() * 6;
      this.nextPhrase = now + 12 + this.rng() * 20;
      this.nextWander = now + 900;
      this.newSection(now);
      Object.assign(this.secS, this.sec);
      this.updateLive(now);
      this.applyMacros(now, .01);
    }
    this.running = true;
    this.lastTick = now;
    if (!this.sleepEnd) { this.holdParam(this.sleepGain.gain, now); this.sleepGain.gain.setTargetAtTime(1, now, .3); }
    const o = this.out.gain;
    o.cancelScheduledValues(now);
    o.setValueAtTime(o.value, now);
    o.linearRampToValueAtTime(1, now + 6);
    this.tick();
  }

  async start() {
    if (this.ctx.state !== 'running') await this.ctx.resume();
    this.startAt(this.clock());
    if (this.useInterval) {
      clearInterval(this.timer);
      this.timer = setInterval(() => this.tick(), 500);
    }
  }

  stop(fade) {
    if (!this.running) return;
    this.running = false;
    clearInterval(this.timer);
    const now = this.clock(), f = fade == null ? 3 : fade;
    const o = this.out.gain;
    o.cancelScheduledValues(now);
    o.setValueAtTime(o.value, now);
    o.linearRampToValueAtTime(0, now + f);
    clearTimeout(this.suspendT);
    if (this.useInterval) this.suspendT = setTimeout(() => { if (!this.running) this.ctx.suspend(); }, f * 1000 + 300);
  }

  setVolume(v) {
    this.state.volume = v;
    this.vol.gain.setTargetAtTime(v, this.clock(), .08);
  }

  holdParam(p, now) {
    try { if (p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(now); else p.cancelScheduledValues(now); }
    catch (e) { p.cancelScheduledValues(now); }
  }

  setSleep(minutes) {
    const now = this.clock(), p = this.sleepGain.gain;
    this.holdParam(p, now);
    p.setTargetAtTime(1, now, .5);
    if (!minutes) { this.sleepEnd = 0; return; }
    const total = minutes * 60;
    this.sleepFade = Math.min(total * .4, 600);
    this.sleepEnd = now + total;
    this.sleepTotal = total;
    const fs = this.sleepEnd - this.sleepFade;
    p.setValueAtTime(1, fs);
    p.setValueCurveAtTime(curve(1, 0), fs, this.sleepFade);
  }
  sleepRemaining() { return this.sleepEnd ? Math.max(0, this.sleepEnd - this.clock()) : 0; }

  /* ---------- changes ---------- */
  retune(fade) {
    const now = this.clock();
    for (const ch of this.chords) {
      if (ch.killed) continue;
      ch.killed = true;
      for (const gn of [ch.g, ch.g2]) {
        if (!gn) continue;
        if (ch.t > now) gn.gain.setValueAtTime(0, now);
        else { gn.gain.setValueAtTime(1, now); gn.gain.linearRampToValueAtTime(0, now + fade); }
      }
      ch.oscs.forEach(o => { try { o.stop(now + fade + .1); } catch (e) {} });
    }
    this.chords = [];
    this.deg = 0;
    if (this.started) {
      this.nextChordAt = now + .3;
      this.freshAtt = 6;
      if (this.drone && this.drone.root !== this.state.root) {
        this.fadeDrone(this.drone, now, 12);
        this.drone = this.makeDrone(now, 10);
      }
      this.nextBell = now + 3 + this.rng() * 3;
      this.nextPhrase = now + 6 + this.rng() * 8;
      this.newSection(now);
      if (this.running) this.tick();
    }
    this.onChange();
  }

  setRoot(r) { if (r === this.state.root) return; this.state.root = r; this.retune(6); }
  setScale(s) { if (s === this.state.scale) return; this.state.scale = s; this.retune(6); }
  setStyle(s) { if (s === this.state.style) return; this.state.style = s; this.retune(8); }
  setMacro(k, v) { this.state.macros[k] = clamp(v, 0, 1); }

  wanderKey(now) {
    const sc = this.scale, L = sc.length, cands = [];
    for (let k = 1; k < L; k++) {
      const rot = sc.map(x => (x - sc[k] + 12) % 12).sort((a, b) => a - b).join(',');
      for (const [name, arr] of Object.entries(SCALES)) {
        if (arr.join(',') === rot) cands.push({ root: (this.state.root + sc[k]) % 12, scale: name }, { root: (this.state.root + sc[k]) % 12, scale: name });
      }
    }
    cands.push({ root: (this.state.root + 7) % 12, scale: this.state.scale }, { root: (this.state.root + 5) % 12, scale: this.state.scale });
    const c = this.pick(cands);
    this.state.root = c.root; this.state.scale = c.scale;
    this.nextWander = now + 600 + this.rng() * 900;
    this.retune(14);
  }

  makeName() {
    const r = this.rng();
    if (r < .45) return 'The ' + this.pick(NAME_A) + ' ' + this.pick(NAME_N);
    if (r < .8) return this.pick(NAME_N) + ' of ' + this.pick(NAME_OF);
    return this.pick(NAME_A) + ' ' + this.pick(NAME_OF);
  }

  conjure(locks = {}) {
    const seed = (Math.random() * 4294967296) >>> 0;
    this.rng = mulberry32(seed);
    this.state.seed = seed;
    const names = Object.keys(STYLES);
    if (!locks.style) this.state.style = this.pick(names);
    if (!locks.scale) this.state.scale = this.rng() < .75 ? this.pick(this.style.scales) : this.pick(Object.keys(SCALES));
    if (!locks.root) this.state.root = Math.floor(this.rng() * 12);
    if (!locks.knobs) {
      const m = this.state.macros;
      m.tide = .12 + .5 * this.rng(); m.aph = .35 + .6 * this.rng(); m.moth = .15 + .65 * this.rng();
      m.under = .2 + .6 * this.rng(); m.petri = this.rng() < .4 ? .05 + .3 * this.rng() : .3 + .55 * this.rng();
    }
    this.bellRatio = this.pick([2, 3, 3.5, 4, 2.5]);
    this.state.name = this.makeName();
    this.newPhases();
    this.retune(6);
  }
}

const API = { Engine, SCALES, STYLES, MACROS, NOTE_NAMES };
G.Lullabyrinth = API;
if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
