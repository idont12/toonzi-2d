/* Frame-by-frame playback for drawings, text and images.
   o.frames: list of { strokes, name?, hold?, text?, mediaId? }
   o.play:   'loop' | 'once' | 'pingpong' | 'library' (library = pick a frame with keyframes on 'frame') */
'use strict';
(function (SB) {
  const U = SB.util, S = SB.state, TR = SB.tracks, tree = SB.tree;
  SB.PLAY_MODES = { library: 'Hold', loop: 'Loop', once: 'Play once', pingpong: 'Ping-pong' }; // Hold: a frame shows until a Frame keyframe picks another (the frame library)

  /** Frame library: frames after `from` moved by d (a frame was added or deleted), so every keyframe keeps showing the same drawing. */
  function renumber(o, from, d) {
    const fix = v => v >= from ? Math.max(0, v + d) : v; (o.tracks.frame || []).forEach(k => k.v = fix(Math.round(k.v))); if (typeof o.frame === 'number') o.frame = fix(o.frame); if (d > 0 && o._sfi != null && o._sfi >= from) o._sfi += d; // a shape's frame on screen keeps its place
  }
  /** Frame library: show frame i at the playhead. With Auto key on it gets a keyframe there, so you can draw on it right away. */
  function libShow(o, i) {
    const lt = tree.localTime(o); SB.time.pause();
    if (S.autoKey) { TR.put(o, 'frame', lt, i, 'hold'); S.frameOverride = null; SB.commit(); SB.toast(`New frame keyed at ${U.r2(S.time)}s. Keep drawing.`); }
    else if (!TR.animated(o, 'frame')) { TR.setBase(o, 'frame', i); S.frameOverride = null; SB.commit(); }
    else { const k = TR.keyAt(o.tracks.frame, lt); if (k) { k.v = i; S.frameOverride = null; } else S.frameOverride = { id: o.id, i }; SB.commit(); if (!k) SB.toast('Showing the new frame here. Press the keyframe button (or turn on Auto key) to keep it.'); }
    SB.invalidate('frames', 'inspector', 'timeline'); SB.dirty();
  }
  const F = SB.frames = {
    hold: f => Math.max(1, Math.round(f.hold || 1)),
    /** Total length in frame units when some frames are held longer, else 0. */
    units(o) { let t = 0, any = false; for (const f of o.frames) { const h = F.hold(f); if (h > 1) any = true; t += h; } return any ? t : 0; },
    unitToFrame(o, u) { for (let i = 0; i < o.frames.length; i++) { const h = F.hold(o.frames[i]); if (u < h) return i; u -= h; } return o.frames.length - 1; },
    before: (o, i) => o.frames.slice(0, i).reduce((a, f) => a + F.hold(f), 0),
    /** Which frame shows at local time lt. */
    index(o, lt) {
      const n = o.frames.length; if (n <= 1) return 0;
      if (S.frameOverride && S.frameOverride.id === o.id && !S.playing && !S.exporting) return Math.min(S.frameOverride.i, n - 1);
      if (S.ixPlay && o._ixFrame != null) return U.clamp(o._ixFrame, 0, n - 1); // an interaction chose the frame
      if (o.play === 'library') return U.clamp(Math.round(TR.value(o, 'frame', lt)), 0, n - 1);
      const i = Math.floor((lt + (o.phase || 0)) * o.fps + 1e-6), held = F.units(o), tot = held || n; let u;
      if (o.play === 'once') u = U.clamp(i, 0, tot - 1);
      else if (o.play === 'pingpong') { const P = Math.max(1, 2 * tot - 2), k = ((i % P) + P) % P; u = k < tot ? k : P - k; }
      else u = ((i % tot) + tot) % tot;
      return held ? F.unitToFrame(o, u) : u;
    },
    current: o => o.frames[F.index(o, tree.localTime(o))] || o.frames[0],
    currentIndex: o => F.index(o, tree.localTime(o)),
    /** Move the playhead to show frame i of o. */
    go(o, i) {
      const t = F.before(o, i) / o.fps;
      if (o.play !== 'library' && t < o.dur - 1e-3 && !o.phase && o.play !== 'pingpong') tree.goLocal(o, t + 0.0005);
      else { tree.goLocal(o, U.clamp(tree.rawLocal(o), 0, o.dur - 0.001)); S.frameOverride = { id: o.id, i }; }
      SB.time.pause(); F.shapeSync([o]); SB.invalidate('frames', 'inspector', 'ctxbar'); SB.dirty();
    },
    act(kind) {
      const o = tree.sel(); if (!SB.types.get(o && o.type) || !SB.types.get(o.type).frames) return;
      if (!tree.inRange(o)) tree.goLocal(o, 0.0001);
      const i = F.currentIndex(o);
      const lib = o.play === 'library';
      if (kind === 'add' || kind === 'dup') {
        const c = kind === 'add' ? { strokes: [] } : U.deep(o.frames[i]); if (c.name) c.name += ' copy';
        o.frames.splice(i + 1, 0, c); if (lib) { renumber(o, i + 1, 1); return libShow(o, i + 1); }
        SB.commit(); F.go(o, i + 1);
      }
      else if (kind === 'del') { if (o.frames.length <= 1) o.frames[0] = { strokes: [] }; else { o.frames.splice(i, 1); if (lib) renumber(o, i, -1); } SB.commit(); F.go(o, Math.max(0, i - 1)); }
      else if (kind === 'prev') F.go(o, (i - 1 + o.frames.length) % o.frames.length);
      else if (kind === 'next') F.go(o, (i + 1) % o.frames.length);
      SB.dirty();
    },
  };

  /** Drawing with Auto key on a frame library (Hold): where no Frame keyframe sits at the playhead, a new blank frame
      is made and keyed there, so each new drawing is its own frame (storyboards and frame-by-frame animation). The first keyframe
      at the start shows the first frame. Returns true when it made a frame. */
  /** Auto key on a frame library (Hold): drawing where there is no keyframe makes a new frame keyed here. dup: the new
      frame starts as a copy of the one shown (reshaping tools: Pull, Width, Smooth), and the start keeps showing that one. */
  /** Blank keyframe (like Animate's F7): a new empty frame shown from the playhead on. The start keeps showing what it showed.
      A shape gets a copy of its shape (a shape frame can't be empty). Returns false when o has no frames. */
  /** Why a blank keyframe can't go on o now (the button greys out with this as its tooltip), or '' when it can. */
  F.blankWhy = (o = tree.sel()) => !o ? 'Select a drawing layer first' : !SB.types.get(o.type) || !SB.types.get(o.type).frames ? `A ${SB.types.get(o.type) ? SB.types.get(o.type).label.toLowerCase() : 'layer'} has no frames: select a drawing` : tree.locked(o) ? 'This layer is locked' : S.playing ? 'Pause first' : '';
  /** Frames that play by themselves (Loop, Play once, Ping-pong) become held frames picked by keyframes, showing exactly the same. */
  F.toKeys = o => {
    if (o.play === 'library') return; const fps = Math.max(1, o.fps || 8), keys = []; let last = -1; const keep = S.frameOverride; S.frameOverride = null;
    for (let i = 0; i / fps < o.dur - 1e-6; i++) { const t = i / fps, fi = F.index(o, t); if (fi !== last) { keys.push({ t: Math.floor(t * 1000 + 1e-6) / 1000, v: fi, e: 'hold' }); last = fi; } }
    S.frameOverride = keep; o.play = 'library'; delete o.phase; o.tracks.frame = keys.length ? keys : [{ t: 0, v: 0, e: 'hold' }]; F.morphToKeys(o); SB.bump();
  };
  F.blankKey = (o = tree.sel()) => {
    const why = F.blankWhy(o); if (why) { SB.toast(why + ': a blank keyframe starts an empty frame on a drawing.'); return false; }
    if (!tree.inRange(o)) tree.goLocal(o, 0.0001);
    if (o.play !== 'library') { if (o.frames.length > 1) { F.toKeys(o); SB.toast('Its frames now hold until a keyframe picks another (they play the same).'); } else o.play = 'library'; }
    const lt = tree.localTime(o), tol = TR.tol(), cur = F.index(o, lt);
    const tr = o.tracks.frame || []; if (!tr.some(k => k.t <= tol) && lt > tol) TR.put(o, 'frame', 0, cur, 'hold');
    const i = cur + 1; renumber(o, i, 1); o.frames.splice(i, 0, { strokes: [] }); // right after the frame showing here
    TR.put(o, 'frame', lt, i, 'hold'); S.frameOverride = null; F.shapeSync([o]); SB.commit();
    SB.invalidate('frames', 'timeline', 'inspector'); SB.dirty(); SB.toast(`Blank keyframe at ${U.r2(S.time)}s: frame ${i + 1} is empty, draw on it.`); return true;
  };
  F.autoFrame = (o, dup) => {
    if (!o || o.play !== 'library' || !S.autoKey || S.playing || S.recording || !SB.types.get(o.type).frames) return false;
    const T = SB.tracks, lt = tree.localTime(o), tol = T.tol ? T.tol() : 1e-3, tr = o.tracks.frame || [], cur = F.index(o, lt);
    if (tr.some(k => Math.abs(k.t - lt) <= tol)) return false; // a keyframe here: draw on its frame
    if (!tr.some(k => k.t <= tol)) T.put(o, 'frame', 0, dup ? cur : 0, 'hold'); // the start shows the first frame (or the one copied)
    if (lt <= tol) { S.frameOverride = null; return false; }
    // the new frame goes right after the one showing here, so the library keeps the order of the timeline (frames after it move up one)
    const at = cur + 1, nf = dup ? U.deep(o.frames[cur] || { strokes: [] }) : { strokes: [] }; if (dup) delete nf.name;
    renumber(o, at, 1); o.frames.splice(at, 0, nf); T.put(o, 'frame', lt, at, 'hold'); S.frameOverride = null;
    SB.invalidate('frames', 'timeline'); SB.toast(dup ? `Frame ${cur + 1} copied to a new frame ${at + 1}, keyed at ${U.r2(S.time)}s.` : `New frame ${at + 1} keyed at ${U.r2(S.time)}s.`); return true;
  };
  // ---------- between frames
  // Frame library (frames picked with keyframes): a "frame" keyframe with k.morph = an ease name morphs from its frame to
  // the next keyframe's frame over the whole time between the two keys, with that ease. Played frames (loop, once…) use the
  // layer setting o.morph = { mode: 'morph' | 'fade', dur: seconds, ease } at the start of each frame.
  /** While a drawing's frame is changing: { a: the frame it leaves, b: the frame it goes to, u: 0…1 eased, mode }, else null. */
  F.change = (o, lt, after) => {
    if (!o.frames || o.frames.length < 2) return null;
    const cm = SB.controls && SB.controls.frameMorph && SB.controls.frameMorph(o, lt); if (cm) return Object.assign(cm, { mode: 'morph' }); // a controller morphing between frames
    if (o.play === 'library') {
      const tr = o.tracks && o.tracks.frame; if (!tr || tr.length < 2) return null; const n = o.frames.length, val = k => U.clamp(Math.round(k.v), 0, n - 1);
      let j = -1; for (let q = tr.length - 1; q >= 0; q--) if (tr[q].t <= lt + 1e-6) { j = q; break; }
      if (j < 0 || j >= tr.length - 1 || !tr[j].morph) return null; const k = tr[j], k2 = tr[j + 1], a = val(k), b = val(k2); if (a === b) return null;
      const fn = SB.tracks.easeOf({ e: k.morph, bz: k.mbz, bzp: k.mbzp, ep: k.mep }); return { a, b, u: fn(U.clamp((lt - k.t) / Math.max(1e-6, k2.t - k.t), 0, 1)), mode: 'morph', t0: k.t, t1: k2.t };
    }
    const m = o.morph; if (!m || !m.mode || m.mode === 'cut') return null; const dur = Math.max(0.01, m.dur ?? 0.25);
    const fps = o.fps || 8, i = Math.floor((lt + (o.phase || 0)) * fps + 1e-6), t0 = i / fps - (o.phase || 0); if (t0 <= 1e-6 && o.play === 'once') return null;
    const a = F.index(o, t0 - 1e-4);
    if (lt < t0 || (lt - t0 >= dur && !after)) return null; const b = F.index(o, lt); if (a == null || a === b) return null;
    const E = SB.tracks.EASES[m.ease || 'smooth'] || SB.tracks.EASES.smooth; return { a, b, u: lt - t0 >= dur ? 1 : E.fn(U.clamp((lt - t0) / dur, 0, 1)), mode: m.mode };
  };
  /** Older files: a frame-library drawing with a layer-wide morph gets it on its keyframes instead. */
  F.morphToKeys = o => {
    if (o.play !== 'library' || !o.morph || !o.morph.mode || o.morph.mode === 'cut') return; const tr = o.tracks && o.tracks.frame;
    if (tr) tr.forEach((k, j) => { const nx = tr[j + 1]; if (nx && Math.round(nx.v) !== Math.round(k.v)) k.morph = o.morph.ease || 'smooth'; });
    delete o.morph;
  };
  // morphing lines: strokes pair up one to one (same count, same kinds); lines and outlines are resampled to the same
  // number of points, bezier paths split their longest curves until both have as many. Anything else crossfades.
  const kind = s => s.er ? 'er' : s.f ? 'f' : s.b ? 'b' : 'l';
  function resample(pts, N, closed) {
    const P = []; for (let i = 0; i < pts.length; i += 2) P.push([pts[i], pts[i + 1]]); if (closed && P.length) P.push(P[0]); if (P.length < 2) return Array.from({ length: N }, () => P[0] || [0, 0]).flat();
    const L = [0]; for (let i = 1; i < P.length; i++) L.push(L[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1])); const tot = L[L.length - 1] || 1, out = [];
    for (let k = 0, j = 1; k < N; k++) { const d = tot * k / (closed ? N : N - 1); while (j < L.length - 1 && L[j] < d) j++; const s = (d - L[j - 1]) / Math.max(1e-9, L[j] - L[j - 1]); out.push(P[j - 1][0] + (P[j][0] - P[j - 1][0]) * s, P[j - 1][1] + (P[j][1] - P[j - 1][1]) * s); }
    return out;
  }
  /** Split curve k of a path sub in half (de Casteljau). */
  function splitSeg(p, k) {
    const o = 6 * k, [x0, y0, x1, y1, x2, y2, x3, y3] = p.slice(o, o + 8), m = (a, b) => (a + b) / 2;
    const ax = m(x0, x1), ay = m(y0, y1), bx = m(x1, x2), by = m(y1, y2), cx = m(x2, x3), cy = m(y2, y3), dx = m(ax, bx), dy = m(ay, by), ex = m(bx, cx), ey = m(by, cy), fx = m(dx, ex), fy = m(dy, ey);
    p.splice(o + 2, 6, ax, ay, dx, dy, fx, fy, ex, ey, cx, cy, x3, y3);
  }
  function grow(p, segs) { p = p.slice(); while ((p.length - 2) / 6 < segs) { let best = 0, bl = -1; for (let k = 0; k < (p.length - 2) / 6; k++) { const o = 6 * k, l = Math.hypot(p[o + 6] - p[o], p[o + 7] - p[o + 1]); if (l > bl) { bl = l; best = k; } } splitSeg(p, best); } return p; }
  function pairOf(x, y) {
    const k = kind(x); if (k !== kind(y) || k === 'er') return null;
    if (k === 'l') { const N = Math.max(2, Math.max(x.pts.length, y.pts.length) / 2); return { k, x, y, A: resample(x.pts, N, false), B: resample(y.pts, N, false) }; }
    if (k === 'f') { if (x.loops.length !== y.loops.length) return null; const A = [], B = []; x.loops.forEach((l, i) => { const N = Math.max(3, Math.max(l.length, y.loops[i].length) / 2); A.push(resample(l, N, true)); B.push(resample(y.loops[i], N, true)); }); return { k, x, y, A, B }; }
    if (x.subs.length !== y.subs.length || x.subs.some((s, i) => !!s.cl !== !!y.subs[i].cl)) return null;
    const A = [], B = []; x.subs.forEach((s, i) => { const n = Math.max((s.p.length - 2) / 6, (y.subs[i].p.length - 2) / 6), a = grow(s.p, n); A.push(a); B.push(s.cl ? align(a, grow(y.subs[i].p, n)) : grow(y.subs[i].p, n)); }); return { k, x, y, A, B };
  }
  /** A closed outline b turned to start where a starts (and run the same way round), so a morph doesn't twist through itself. */
  function align(a, b) {
    const n = (b.length - 2) / 6; if (n < 2) return b;
    const segs = []; for (let k = 0; k < n; k++) segs.push(b.slice(6 * k, 6 * k + 8));
    const anchors = p => { const r = []; for (let k = 0; k < n; k++) r.push([p[6 * k], p[6 * k + 1]]); return r; }, area = q => q.reduce((t, c, i) => { const d = q[(i + 1) % q.length]; return t + c[0] * d[1] - d[0] * c[1]; }, 0);
    const mid = q => q.reduce((m, c) => [m[0] + c[0] / q.length, m[1] + c[1] / q.length], [0, 0]);
    const qa = anchors(a); let sg = segs; if (area(qa) * area(anchors(b)) < 0) sg = segs.slice().reverse().map(z => [z[6], z[7], z[4], z[5], z[2], z[3], z[0], z[1]]);
    const qb = sg.map(z => [z[0], z[1]]), ca = mid(qa), cb = mid(qb); let best = 0, bd = Infinity;
    for (let r = 0; r < n; r++) { let d = 0; for (let k = 0; k < n; k++) { const P = qa[k], Q = qb[(k + r) % n]; d += (P[0] - ca[0] - Q[0] + cb[0]) ** 2 + (P[1] - ca[1] - Q[1] + cb[1]) ** 2; } if (d < bd) { bd = d; best = r; } }
    const R = sg.slice(best).concat(sg.slice(0, best)), out = [R[0][0], R[0][1]]; R.forEach(z => out.push(z[2], z[3], z[4], z[5], z[6], z[7])); return out;
  }
  // the cache key covers where the points are, not only how many: moving a shape on one frame must change its morph
  const sumOf = a => { let t = a.length; for (let i = 0; i < a.length; i++) t = (t * 31 + Math.round(a[i] * 10)) % 1000000007; return t; };
  const cache = new WeakMap(), sig = st => st.map(s => s.pts ? sumOf(s.pts) : s.loops ? s.loops.map(sumOf).join('.') : s.subs ? s.subs.map(b => sumOf(b.p)).join('.') : 0).join('|');
  /** Can frames a and b morph? Returns the paired strokes (cached), or null (they crossfade). */
  F.morphPairs = (sa, sb) => {
    let m = cache.get(sa); if (!m) cache.set(sa, m = new WeakMap()); const key = sig(sa) + ':' + sig(sb), hit = m.get(sb); if (hit && hit.key === key) return hit.pairs;
    let pairs = null; if (sa.length === sb.length && sa.length) { pairs = sa.map((x, i) => pairOf(x, sb[i])); if (pairs.some(p => !p)) pairs = null; }
    m.set(sb, { key, pairs }); return pairs;
  };
  const mix = (a, b, u) => a.map((v, i) => v + (b[i] - v) * u), col = (a, b, u) => typeof a === 'string' && typeof b === 'string' && /^#[0-9a-f]{6}$/i.test(a) && /^#[0-9a-f]{6}$/i.test(b) ? U.lerpColor(a, b, u) : (u < 0.5 ? a : b), num = (a, b, u) => typeof a === 'number' && typeof b === 'number' ? a + (b - a) * u : (u < 0.5 ? a : b);
  /** The strokes part-way (u) from one frame to the next. */
  F.morphAt = (pairs, u) => pairs.map(P => {
    const s = Object.assign({}, u < 0.5 ? P.x : P.y);
    if (P.k === 'l') { s.pts = mix(P.A, P.B, u); s.s = num(P.x.s, P.y.s, u); s.c = col(P.x.c, P.y.c, u); }
    else if (P.k === 'f') { s.loops = P.A.map((l, i) => mix(l, P.B[i], u)); s.c = col(P.x.c, P.y.c, u); delete s.seed; delete s.links; }
    else { s.subs = P.A.map((p, i) => ({ p: mix(p, P.B[i], u), cl: P.x.subs[i].cl })); s.c = col(P.x.c, P.y.c, u); s.fc = col(P.x.fc, P.y.fc, u); s.s = num(P.x.s, P.y.s, u); if (P.x.op != null || P.y.op != null) s.op = num(P.x.op ?? 1, P.y.op ?? 1, u); }
    return s;
  });

  // ---------- shapes with several frames: each frame keeps its own shape (kind, size, corners, fill, outline)
  // The frame on screen is edited through the layer's own values (so every control works as usual); the other frames
  // keep theirs in frame.shp. Switching frames swaps them; each undo step stores them all.
  const SHAPE_KEYS = ['shape', 'w', 'h', 'radius', 'sides', 'fill', 'fillOn', 'stroke', 'strokeW'];
  const pickShape = o => { const r = {}; for (const k of SHAPE_KEYS) if (o[k] !== undefined) r[k] = o[k]; return r; };
  const multiShape = o => o.type === 'shape' && o.frames && o.frames.length > 1;
  /** Keep the layer's values and its frames' shapes in step (call when the shown frame may have changed). */
  F.shapeSync = (list = tree.all()) => {
    for (const o of list) {
      if (!multiShape(o)) { if (o._sfi !== undefined) delete o._sfi; continue; }
      const fi = U.clamp(F.index(o, tree.localTime(o)), 0, o.frames.length - 1);
      if (o._sfi === undefined || !o.frames[o._sfi]) { const f = o.frames[fi]; if (f.shp) Object.assign(o, f.shp); const now = pickShape(o); o.frames.forEach(g => { if (!g.shp) g.shp = Object.assign({}, now); }); o._sfi = fi; continue; } // frames without their own shape yet start with this one
      if (o._sfi === fi) continue;
      o.frames[o._sfi].shp = pickShape(o); // what was edited on the frame we leave
      const f = o.frames[fi]; if (f.shp) Object.assign(o, f.shp); else f.shp = pickShape(o);
      o._sfi = fi;
    }
  };
  /** The shape of the frame shown at lt when that isn't the one on screen (exports, thumbnails, playback ahead). Animated values keep their keyframes. */
  F.shapeView = (o, lt) => {
    if (!multiShape(o)) return null; const fi = F.index(o, lt); if (fi === o._sfi) return null; const f = o.frames[fi]; if (!f || !f.shp) return null;
    let out = null; for (const k in f.shp) if (!TR.animated(o, k)) (out || (out = {}))[k] = f.shp[k]; return out;
  };
  /** The view v as frame i of shape o (its own shape on that frame). */
  F.shapeAt = (o, i, v) => { if (!multiShape(o) || i === o._sfi) return v; const f = o.frames[i]; if (!f || !f.shp) return v; const r = Object.assign({}, v); for (const k in f.shp) if (!TR.animated(o, k)) r[k] = f.shp[k]; return r; };
  SB.beforeCommit.push(() => { for (const o of tree.all()) if (multiShape(o) && o._sfi !== undefined && o.frames[o._sfi]) o.frames[o._sfi].shp = pickShape(o); });
  SB.on('time', () => F.shapeSync()); SB.on('restore', () => F.shapeSync());
})(window.SB);
