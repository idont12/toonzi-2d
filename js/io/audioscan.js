/* Sound → motion: controllers that move with the music, and lip sync (mouth shapes from a voice).
   SB.audioScan.analyse(src) mixes the chosen sound (an audio or video layer, or 'all'), on the main timeline's clock, and
   measures it 60 times a second (an FFT of each moment):
     bands: bass (20–250 Hz), mid (the melody, 250–4000 Hz), high (4–11 kHz), vol (loudness), each 0…1
     speech: e (loudness), f1 (200–900 Hz), f2 (900–1800), f3 (1800–3500), fr (3.5–8 kHz, hiss), shares of the voice
   Nothing is played or uploaded: it all runs here. The results are keyframes (so they play everywhere, exports included,
   and stay editable):
     SB.audioScan.bake(c)         a controller's c.audio = { src, band, from, to, amt, smooth, gate } → x/y keys
     SB.audioScan.lipSync(t)      a drawing's frames or a controller's points, each with a mouth shape (t.mouth = { index: shape }),
                                  and t.lip = { src, detail } → 'frame' keys (drawing) or x/y keys (controller), held */
'use strict';
(function (SB) {
  const U = SB.util, S = SB.state, tree = SB.tree, TR = SB.tracks;
  const RATE = 60, SR = 22050, N = 1024; // measurements a second, sample rate for listening, FFT size (46 ms)

  // ---------- FFT (radix 2, in place)
  function fft(re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
    for (let len = 2; len <= n; len <<= 1) {
      const a = -2 * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a);
      for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let k = 0; k < len / 2; k++) {
        const p = i + k, q = p + len / 2, tr = re[q] * cr - im[q] * ci, ti = re[q] * ci + im[q] * cr;
        re[q] = re[p] - tr; im[q] = im[p] - ti; re[p] += tr; im[p] += ti; const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr; } }
    }
  }
  const pct = (arr, q) => { const a = Array.from(arr).filter(v => v > 0).sort((x, y) => x - y); return a.length ? a[Math.min(a.length - 1, Math.floor(q * a.length))] : 1; };

  /** The sound sources of this screen: audio and video layers with their file. */
  const sources = () => tree.all().filter(o => (o.type === 'audio' || o.type === 'video') && o.mediaId && SB.media.get && SB.media.get(o.mediaId));
  const srcName = id => id === 'all' ? 'All sound' : (tree.find(id) || {}).name || '?';
  /** Where a source plays on the main timeline: [from, to] (everything: the whole screen). */
  function span(src) {
    const D = S.project.duration, o = src !== 'all' && tree.find(src); if (!o) return [0, D];
    const w = tree.windows(o); return w.length ? [Math.max(0, Math.min(...w.map(x => x[0]))), Math.min(D, Math.max(...w.map(x => x[1])))] : [0, 0];
  }

  const cache = new Map();
  /** Measure a source (cached until it or the screen's length changes). */
  async function analyse(src) {
    const D = S.project.duration, o = src !== 'all' ? tree.find(src) : null; if (src !== 'all' && !o) throw new Error('That sound layer is gone.');
    const key = JSON.stringify([src, D, (o ? [o] : sources()).map(x => [x.mediaId, x.start, x.dur, x.parts, x.inPoint, x.tracks && x.tracks.speed, x.speed, tree.windows(x)])]);
    if (cache.has(key)) return cache.get(key);
    const buf = await SB.media.mix(D, { only: o ? [o] : null, sr: SR, ch: 1 }); if (!buf) throw new Error('No sound to listen to: add an audio (or video) layer first.');
    const d = buf.getChannelData(0), n = Math.max(1, Math.floor(D * RATE)), hop = SR / RATE, bin = SR / N, win = new Float32Array(N);
    for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1));
    const B = { bass: [20, 250], mid: [250, 4000], high: [4000, 11000] }, SP = { f1: [200, 900], f2: [900, 1800], f3: [1800, 3500], fr: [3500, 8000] };
    const out = { n, dt: 1 / RATE, bands: {}, speech: {} }; for (const k of ['bass', 'mid', 'high', 'vol']) out.bands[k] = new Float32Array(n); for (const k of ['e', 'f1', 'f2', 'f3', 'fr']) out.speech[k] = new Float32Array(n);
    const re = new Float32Array(N), im = new Float32Array(N), sum = (lo, hi) => { let s = 0; for (let k = Math.max(1, Math.floor(lo / bin)); k <= Math.min(N / 2 - 1, Math.ceil(hi / bin)); k++) s += re[k] * re[k] + im[k] * im[k]; return s; };
    for (let i = 0; i < n; i++) {
      const c = Math.round(i * hop); let rms = 0;
      for (let j = 0; j < N; j++) { const v = d[c - N / 2 + j] || 0; rms += v * v; re[j] = v * win[j]; im[j] = 0; }
      fft(re, im); out.bands.vol[i] = Math.sqrt(rms / N);
      for (const k in B) out.bands[k][i] = Math.sqrt(sum(B[k][0], B[k][1]));
      const sp = {}; let tot = 1e-12; for (const k in SP) { sp[k] = sum(SP[k][0], SP[k][1]); tot += sp[k]; }
      for (const k in SP) out.speech[k][i] = sp[k] / tot; out.speech.e[i] = out.bands.vol[i];
      if (i % 400 === 399) await new Promise(r => setTimeout(r)); // keep the page responsive on long sounds
    }
    for (const k in out.bands) { const p = pct(out.bands[k], 0.98) || 1; for (let i = 0; i < n; i++) out.bands[k][i] = Math.min(1, out.bands[k][i] / p); }
    { const e = out.speech.e, p = pct(e, 0.95) || 1; for (let i = 0; i < n; i++) e[i] = Math.min(1, e[i] / p); }
    if (cache.size > 6) cache.clear(); cache.set(key, out); return out;
  }

  /** A band as a motion curve: quiet parts left out (gate), stronger or weaker (amt), smoothed (rises fast, falls slower). */
  function envelope(an, band, { amt = 1, smooth = 0.3, gate = 0.05 } = {}) {
    const src = an.bands[band] || an.bands.vol, n = an.n, out = new Float32Array(n), up = Math.exp(-an.dt / (0.008 + smooth * 0.06)), down = Math.exp(-an.dt / (0.03 + smooth * 0.6));
    let y = 0; for (let i = 0; i < n; i++) { let v = src[i]; v = v <= gate ? 0 : (v - gate) / Math.max(0.01, 1 - gate); v = Math.min(1, v * amt); const a = v > y ? up : down; y = a * y + (1 - a) * v; out[i] = y; }
    return out;
  }
  /** Fewer points with the same shape: keeps a point where a straight line from the last one would miss by more than tol. */
  function simplify(ts, vs, tol) {
    const keep = [0], go = (a, b) => { let best = -1, bd = tol; for (let i = a + 1; i < b; i++) { const u = (ts[i] - ts[a]) / ((ts[b] - ts[a]) || 1), d = Math.abs(vs[i] - (vs[a] + (vs[b] - vs[a]) * u)); if (d > bd) { bd = d; best = i; } } if (best >= 0) { go(a, best); keep.push(best); go(best, b); } };
    go(0, ts.length - 1); keep.push(ts.length - 1); return [...new Set(keep)].sort((a, b) => a - b);
  }
  /** Main-timeline time → o's own time (where its keyframes are). */
  const localOf = (o, T) => tree.inner(o, tree.parentTime(o, T), true) - o.start;
  /** Replace o's keys of property id between lt0 and lt1 with keys (sorted { t, v, e }). */
  function putKeys(o, id, lt0, lt1, keys) {
    const old = (o.tracks[id] || []).filter(k => k.t < lt0 - 1e-4 || k.t > lt1 + 1e-4);
    o.tracks[id] = old.concat(keys).sort((a, b) => a.t - b.t); if (!o.tracks[id].length) delete o.tracks[id];
  }

  // ---------- controllers that move with sound
  const BANDS = { bass: 'Bass (drums, beat)', mid: 'Melody (voices, instruments)', high: 'Highs (cymbals, hiss)', vol: 'Volume (everything)' };
  const defaults = c => { const sl = SB.controls.slotsFor(c).map(s => s.k); return { src: (sources()[0] || {}).id || 'all', band: 'bass', from: 'center', to: sl.includes('top') ? 'top' : sl.includes('right') ? 'right' : sl[sl.length - 1], amt: 1, smooth: 0.3, gate: 0.05 }; };
  async function bake(c) {
    const st = c.audio = Object.assign(defaults(c), c.audio || {}), C = SB.controls, a = C.slotOf(c, st.from), b = C.slotOf(c, st.to); if (!a || !b) throw new Error('Pick where it moves from and to.');
    const an = await analyse(st.src), env = envelope(an, st.band, st), [T0, T1] = span(st.src); if (T1 <= T0) throw new Error('That sound doesn’t play in this screen.');
    const fps = S.project.fps || 24, ts = [], vs = []; for (let T = T0; T <= T1 + 1e-6; T += 1 / fps) { ts.push(T); vs.push(env[Math.min(an.n - 1, Math.round(T * RATE))] || 0); }
    const keep = simplify(ts, vs, 0.015 + st.smooth * 0.02), rx = c.rx ?? c.x, ry = c.ry ?? c.y, RX = C.RX(c), RY = C.RY(c), lt0 = localOf(c, T0), lt1 = localOf(c, T1);
    const keysX = [], keysY = []; for (const i of keep) { const lt = U.r3(localOf(c, ts[i])), w = vs[i]; keysX.push({ t: lt, v: U.r1(rx + (a.u + (b.u - a.u) * w) * RX), e: 'linear' }); keysY.push({ t: lt, v: U.r1(ry + (a.v + (b.v - a.v) * w) * RY), e: 'linear' }); }
    if (a.u !== b.u) putKeys(c, 'x', lt0, lt1, keysX); if (a.v !== b.v) putKeys(c, 'y', lt0, lt1, keysY);
    delete c._live; SB.commit(); return keep.length;
  }

  // ---------- lip sync
  /** Mouth shapes (the classic animation set). Missing ones fall back to the next in their list. */
  const SHAPES = [['rest', 'Rest (quiet)'], ['MBP', 'M B P (lips closed)'], ['AI', 'A I (wide open)'], ['E', 'E (wide, teeth)'], ['O', 'O (round)'], ['U', 'U W Q (small round)'], ['FV', 'F V (teeth on lip)'], ['L', 'L Th (tongue)'], ['etc', 'C D G K N S T… (teeth)']];
  const FALL = { rest: ['MBP', 'etc'], MBP: ['rest', 'etc'], AI: ['O', 'E', 'etc'], E: ['etc', 'AI'], O: ['U', 'AI'], U: ['O', 'MBP'], FV: ['MBP', 'etc', 'rest'], L: ['etc', 'E', 'AI'], etc: ['E', 'AI', 'rest'] };
  /** The shape each moment sounds like (from loudness and where the voice's energy sits; no words are recognized). */
  function shapesOf(an, detail) {
    const sp = an.speech, n = an.n, out = new Array(n), quiet = 0.07 + (1 - detail) * 0.05;
    // a little smoothing of the measurements (more at low detail)
    const k = Math.max(1, Math.round(1 + (1 - detail) * 4)), sm = a => { const o = new Float32Array(n); for (let i = 0; i < n; i++) { let s = 0, c = 0; for (let j = i - k; j <= i + k; j++) if (j >= 0 && j < n) { s += a[j]; c++; } o[i] = s / c; } return o; };
    const e = sm(sp.e), f1 = sm(sp.f1), f2 = sm(sp.f2), f3 = sm(sp.f3), fr = sm(sp.fr);
    for (let i = 0; i < n; i++) {
      let s;
      if (e[i] < quiet) s = 'rest';
      else if (fr[i] > 0.42) s = e[i] < 0.35 && fr[i] < 0.6 ? 'FV' : 'etc'; // hiss: s, t, f…
      else if (e[i] < 0.2) s = f1[i] > 0.7 ? 'MBP' : 'etc'; // a hum with the lips closed, or a soft consonant
      else if (f1[i] > 0.72 && f3[i] < 0.08) s = e[i] > 0.55 ? 'O' : 'U'; // energy low down: round vowels
      else if (f3[i] + fr[i] > 0.3) s = f2[i] > 0.28 ? 'L' : 'E'; // energy high up: e, i
      else s = e[i] > 0.4 ? 'AI' : 'etc';
      // less detail: fewer kinds of shape
      if (detail < 0.34) s = { rest: 'rest', MBP: 'MBP', etc: 'MBP', FV: 'MBP', U: 'O', O: 'O', L: 'AI', E: 'AI', AI: 'AI' }[s];
      else if (detail < 0.67) s = { L: 'E', FV: 'MBP' }[s] || s;
      out[i] = s;
    }
    // hold each shape long enough to read: short runs join the one before
    const minHold = Math.round(RATE * (0.24 - detail * 0.19)), runs = []; for (let i = 0; i < n; i++) { if (!runs.length || runs[runs.length - 1].s !== out[i]) runs.push({ s: out[i], a: i, b: i + 1 }); else runs[runs.length - 1].b = i + 1; }
    const merged = []; for (const r of runs) { const last = merged[merged.length - 1]; if (last && (r.b - r.a < minHold || last.s === r.s)) last.b = r.b; else merged.push(Object.assign({}, r)); }
    if (merged.length > 1 && merged[0].b - merged[0].a < minHold) { merged[1].a = 0; merged.shift(); }
    return merged.map(r => ({ s: r.s, t: r.a / RATE }));
  }
  /** What a target offers: its frames (a drawing) or points (a controller), and the shape tagged on each. */
  function slotsOf(t) {
    if (t.type === 'null') return (t.points || []).map((p, i) => ({ i, name: p.name || `Point ${i + 1}` }));
    return (t.frames || []).map((f, i) => ({ i, name: f.name || `Frame ${i + 1}` }));
  }
  /** First guess: the shapes in order, one per frame or point. */
  function guessMouth(t) { const m = {}; slotsOf(t).forEach((x, i) => { if (SHAPES[i]) m[i] = SHAPES[i][0]; }); return m; }
  function pick(map, shape) {
    const by = {}; for (const i in map) if (map[i] && by[map[i]] == null) by[map[i]] = +i;
    const seen = new Set(), walk = s => { if (by[s] != null) return by[s]; if (seen.has(s)) return null; seen.add(s); for (const f of FALL[s] || []) { const r = walk(f); if (r != null) return r; } return null; };
    const r = walk(shape); return r != null ? r : (by.rest ?? by.MBP ?? +Object.keys(by)[0] ?? 0);
  }
  async function lipSync(t) {
    const lip = t.lip = Object.assign({ src: (sources()[0] || {}).id || 'all', detail: 0.5 }, t.lip || {}), map = t.mouth || (t.mouth = guessMouth(t));
    if (!Object.values(map).some(Boolean)) throw new Error('Give at least one frame or point a mouth shape.');
    const an = await analyse(lip.src), [T0, T1] = span(lip.src); if (T1 <= T0) throw new Error('That sound doesn’t play in this screen.');
    const segs = shapesOf(an, lip.detail).filter(g => g.t < T1 + 1e-6), lt0 = localOf(t, T0), lt1 = localOf(t, T1);
    // the shape at the sound's start, then each change inside it
    const at = T => { let s = segs[0].s; for (const g of segs) { if (g.t <= T + 1e-6) s = g.s; else break; } return s; };
    const list = [{ T: T0, s: at(T0) }].concat(segs.filter(g => g.t > T0 + 1e-6 && g.t < T1 - 1e-6).map(g => ({ T: g.t, s: g.s })));
    const keys = []; let last = null; for (const g of list) { const idx = pick(map, g.s); if (idx === last) continue; last = idx; keys.push({ t: U.r3(localOf(t, g.T)), idx }); }
    if (t.type === 'null') {
      const C = SB.controls, rx = t.rx ?? t.x, ry = t.ry ?? t.y, pts = t.points || [];
      putKeys(t, 'x', lt0, lt1, keys.map(k => ({ t: k.t, v: U.r1(rx + ((pts[k.idx] || {}).u || 0) * C.RX(t)), e: 'hold' })));
      if (pts.some(p => p.v)) putKeys(t, 'y', lt0, lt1, keys.map(k => ({ t: k.t, v: U.r1(ry + ((pts[k.idx] || {}).v || 0) * C.RY(t)), e: 'hold' })));
      delete t._live;
    } else { t.play = 'library'; putKeys(t, 'frame', lt0, lt1, keys.map(k => ({ t: k.t, v: k.idx, e: 'hold' }))); }
    SB.commit(); return keys.length;
  }
  SB.audioScan = { analyse, envelope, bake, lipSync, shapesOf, sources, srcName, span, BANDS, SHAPES, guessMouth, slotsOf, defaults, RATE };
})(window.SB);
