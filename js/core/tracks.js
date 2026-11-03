/* Animatable properties and keyframes.

   A property id is a plain key like 'x', 'fontSize', 'fill', or a prefixed
   key like 'fx:<effectId>:amt'. o.tracks[id] is a sorted list of keys
   { t: localTime, v: value, e: ease }. Without keys, the value lives on the
   object itself (or wherever the prefix handler stores it).

   To animate something new, add a prefix handler with SB.tracks.prefix(). */
'use strict';
(function (SB) {
  const U = SB.util, S = SB.state;
  let depth = 0; // guards against loops (A follows B follows A)

  const TRANSFORM = ['x', 'y', 'scale', 'scx', 'scy', 'rot', 'opacity', 'ax', 'ay'];
  const COLOR = new Set(['color', 'fill', 'stroke', 'bg', 'outlineColor']);
  const PERCENT = new Set(['scale', 'scx', 'scy', 'opacity', 'volume', 'phys:bounce', 'speed', 'lnSp', 'lnAmt']);
  const STEPPED = new Set(['showAt']); // numbers that jump from key to key (a held video frame)
  const MULTIPLY = new Set(['scale', 'scx', 'scy', 'w', 'h', 'fontSize', 'strokeW']);
  const DEFAULTS = { radius: 18, scx: 1, scy: 1, outlineW: 14, hlPadX: 45, hlPadY: 27, hlRadius: 40, hlAlpha: 100, volume: 1, speed: 1, paused: false, showAt: -1, 'ctrl:on': true, lnSp: 1, lnAmt: 1 };

  // ---------- easing (add your own here)
  const backOut = (u, c1) => { const c3 = c1 + 1; return 1 + c3 * Math.pow(u - 1, 3) + c1 * Math.pow(u - 1, 2); };
  const EASES = {
    smooth: { label: 'Smooth', fn: u => u * u * (3 - 2 * u) },
    linear: { label: 'Linear', fn: u => u },
    easeIn: { label: 'Speed up', fn: u => u * u * u },
    easeOut: { label: 'Slow down', fn: u => 1 - Math.pow(1 - u, 3) },
    back: { label: 'Overshoot', fn: u => backOut(u, 1.9) },
    bounce: { label: 'Bounce', fn: u => { const n = 7.5625, d = 2.75; if (u < 1 / d) return n * u * u; if (u < 2 / d) return n * (u -= 1.5 / d) * u + 0.75; if (u < 2.5 / d) return n * (u -= 2.25 / d) * u + 0.9375; return n * (u -= 2.625 / d) * u + 0.984375; } },
    elastic: { label: 'Elastic', fn: u => u === 0 || u === 1 ? u : Math.pow(2, -10 * u) * Math.sin((u * 10 - 0.75) * (2 * Math.PI / 3)) + 1 },
    spline: { label: 'Curved path', fn: u => u },
    hold: { label: 'Hold', fn: () => 0 },
  };
  /** A custom curve (k.e = 'bez', k.bz = [x1, y1, x2, y2]) like CSS cubic-bezier; y may go past 0..1 to overshoot. */
  function bezier([x1, y1, x2, y2], u) {
    if (u <= 0) return 0; if (u >= 1) return 1;
    const X = t => 3 * x1 * t * (1 - t) * (1 - t) + 3 * x2 * t * t * (1 - t) + t * t * t, Y = t => 3 * y1 * t * (1 - t) * (1 - t) + 3 * y2 * t * t * (1 - t) + t * t * t;
    let lo = 0, hi = 1, t = u; for (let i = 0; i < 30; i++) { const x = X(t); if (Math.abs(x - u) < 1e-5) break; if (x < u) lo = t; else hi = t; t = (lo + hi) / 2; }
    return Y(t);
  }
  /** A custom curve with more points (k.bzp): anchors [x, y, inX, inY, outX, outY, smooth] from (0,0) to (1,1),
      x growing; between two anchors the curve is a cubic bezier through their handles. */
  function bezierPath(P, u) {
    if (u <= 0) return 0; if (u >= 1) return 1; let i = 0; while (i < P.length - 2 && u > P[i + 1][0]) i++;
    const A = P[i], B = P[i + 1], x0 = A[0], x3 = B[0], x1 = Math.min(Math.max(A[4], x0), x3), x2 = Math.min(Math.max(B[2], x0), x3), y0 = A[1], y1 = A[5], y2 = B[3], y3 = B[1];
    const X = t => { const m = 1 - t; return m * m * m * x0 + 3 * m * m * t * x1 + 3 * m * t * t * x2 + t * t * t * x3; };
    let lo = 0, hi = 1, t = (u - x0) / Math.max(1e-9, x3 - x0); for (let k = 0; k < 40; k++) { const x = X(t); if (Math.abs(x - u) < 1e-6) break; if (x < u) lo = t; else hi = t; t = (lo + hi) / 2; }
    const m = 1 - t; return m * m * m * y0 + 3 * m * m * t * y1 + 3 * m * t * t * y2 + t * t * t * y3;
  }
  EASES.bez = { label: 'Custom curve', fn: u => u };
  const easeOf = k => k.e === 'pw' ? (u => Math.pow(u, k.ep || 1)) : k.e === 'bez' && k.bzp && k.bzp.length > 1 ? (u => bezierPath(k.bzp, u)) : k.e === 'bez' && k.bz ? (u => bezier(k.bz, u)) : (EASES[k.e] || EASES.smooth).fn;

  // ---------- prefix handlers: where non-plain properties are stored
  const prefixes = {};
  const fxById = (o, id) => (o.effects || []).find(e => e.id === id);
  prefixes.fx = {
    get(o, [fid, p]) { const e = fxById(o, fid); if (!e) return 0; if (p === 'on') return e.on !== false; const d = SB.effects.get(e.type); return e[p] ?? (d && d.params[p] ? d.params[p].def : 0); },
    set(o, [fid, p], v) { const e = fxById(o, fid); if (e) e[p] = p === 'on' ? !!v : v; },
  };

  const T = SB.tracks = {
    TRANSFORM, TRANSFORM_SET: new Set(TRANSFORM), EASES, easeOf, bezier, bezierPath, MULTIPLY,
    prefix(name, handler) { prefixes[name] = handler; },
    type: id => COLOR.has(id) || id.endsWith(':color') ? 'color' : id === 'frame' ? 'int' : id.endsWith(':on') || id === 'paused' ? 'bool' : 'num',
    uiMul: id => PERCENT.has(id) || id.startsWith('bonesx:') || id.startsWith('bonesy:') ? 100 : 1,

    base(o, id) {
      const i = id.indexOf(':'); if (i > 0 && prefixes[id.slice(0, i)]) return prefixes[id.slice(0, i)].get(o, id.slice(i + 1).split(':'));
      const v = o[id]; return v === undefined ? (DEFAULTS[id] ?? 0) : v;
    },
    setBase(o, id, v) {
      const i = id.indexOf(':'); if (i > 0 && prefixes[id.slice(0, i)]) return prefixes[id.slice(0, i)].set(o, id.slice(i + 1).split(':'), v);
      o[id] = v;
    },
    animated: (o, id) => !!(o.tracks && o.tracks[id] && o.tracks[id].length),
    anyKeys: o => Object.keys(o.tracks || {}).length > 0,

    /** Value of property id at local time lt. */
    value(o, id, lt) {
      if (o._live && o._live[id] !== undefined) return o._live[id]; // being recorded right now
      if (o._pend && o._pend.v[id] !== undefined && Math.abs(lt - o._pend.t) <= T.tol()) return o._pend.v[id]; // changed but not keyed yet
      if (T.override && o.drv) { const v = T.override(o, id, lt); if (v !== undefined) return v; } // set by a controller (js/rig/controls.js)
      if (T.seq) { const v = T.seq(o, id, lt); if (v !== undefined) return v; } // a rig's action strips (js/rig/actseq.js)
      if (T.mixer) { const v = T.mixer(o, id, lt); if (v !== undefined) return v; }
      if (o.kloop) lt = T.loopT(o, lt); // Loop keyframes: after the last keyframe it starts again from the first // the interactive player (js/ui/interact.js): other actions, and mixes between them
      return T.evalTrack(o, id, o.tracks && o.tracks[id], lt);
    },
    /** Loop keyframes (o.kloop): the time inside the cycle from o's first to its last keyframe (every property on the same cycle). */
    loopT(o, lt) {
      if (o._kls !== SB.stamp) { let a = Infinity, b = -Infinity; for (const id in o.tracks || {}) for (const k of o.tracks[id]) { if (k.t < a) a = k.t; if (k.t > b) b = k.t; } o._klA = a; o._klB = b; o._kls = SB.stamp; }
      const a = o._klA, b = o._klB; return b - a > 1e-3 && lt > b ? a + (lt - a) % (b - a) : lt;
    },
        /** Value of keyframes tr (of property id of o) at local time lt; without keyframes, o's own value. */
    evalTrack(o, id, tr, lt) {
      if (!tr || !tr.length) return T.base(o, id);
      let p0 = null, a = null, b = null, p3 = null;
      for (const k of tr) { if (k.t <= lt) { p0 = a; a = k; } else if (!b) b = k; else { p3 = k; break; } }
      if (!a) return b.v; if (!b) return a.v;
      const ty = T.type(id); if (ty === 'bool' || ty === 'int' || a.e === 'hold') return a.v;
      const u = (lt - a.t) / Math.max(1e-6, b.t - a.t);
      if (ty === 'color') return (SB.paint ? SB.paint.mix : U.lerpColor)(a.v, b.v, easeOf(a)(u)); // colors with alpha blend; gradients and patterns switch half way
      if (a.e === 'spline') return U.catmull((p0 || a).v, a.v, b.v, (p3 || b).v, u);
      return U.lerp(a.v, b.v, easeOf(a)(u));
    },
    now: (o, id) => T.value(o, id, SB.tree.localTime(o)),

    tol: () => 0.5 / S.project.fps,
    keyAt: (tr, lt) => tr && tr.find(k => Math.abs(k.t - lt) <= T.tol()),
    put(o, id, lt, v, e) {
      if (o._pend && o._pend.v[id] !== undefined) { delete o._pend.v[id]; if (!Object.keys(o._pend.v).length) { delete o._pend; T.pending.delete(o); } }
      const tr = o.tracks[id] || (o.tracks[id] = []); let k = T.keyAt(tr, lt);
      if (!k) { const ty = T.type(id); k = { t: U.r3(lt), v, e: e || (ty === 'bool' || ty === 'int' || STEPPED.has(id) ? 'hold' : 'smooth') }; tr.push(k); tr.sort((a, b) => a.t - b.t); }
      else { k.v = v; if (e) k.e = e; }
      SB.bump(); return k;
    },
    /** Auto key: keying a value later in the layer while that value has no keyframe before the playhead
        also keys it at the layer's start with the value it had there, so the change tweens from the start.
        Only this value is checked, not the layer's other keyframes. */
    startKey(o, id, lt) {
      if (lt <= T.tol()) return; const tr = o.tracks && o.tracks[id];
      if (tr && tr.some(k => k.t < lt - T.tol())) return;
      const v0 = T.value(o, id, 0); T.put(o, id, 0, typeof v0 === 'object' ? U.deep(v0) : v0);
    },
    /** Set a property:
        - no keyframes yet: the value just changes (with Auto key on it gets its first keyframe)
        - keyframes, and one at the playhead (or Auto key on): that keyframe is set
        - keyframes but none at the playhead, Auto key off: the change is held as a preview until you
          press the keyframe button (K), which keeps it, or move the playhead, which drops it. */
    set(o, id, v) {
      const lt = SB.tree.localTime(o);
      if (!T.animated(o, id)) { if (S.autoKey && !T.noAuto && !S.poseLink && SB.tree.inRange && SB.tree.inRange(o)) { T.startKey(o, id, lt); T.put(o, id, lt, v); return; } T.setBase(o, id, v); SB.bump(); return; }
      if (S.autoKey || T.keyAt(o.tracks[id], lt)) { if (S.autoKey) T.startKey(o, id, lt); T.put(o, id, lt, v); return; }
      if (!o._pend || Math.abs(o._pend.t - lt) > T.tol()) o._pend = { t: lt, v: {} };
      o._pend.v[id] = v; T.pending.add(o); SB.bump();
      if (!T._pendHint) { T._pendHint = true; SB.toast('Not keyed yet: press the keyframe button (K) to keep this change, or turn on Auto key. Moving the playhead drops it.'); }
    },
    /** Layers with a change that is not keyed yet (see set). */
    pending: new Set(),
    dropPending() { if (!T.pending.size) return; T.pending.forEach(o => delete o._pend); T.pending.clear(); SB.bump(); },
    /** Shift (or scale) every keyframe of id so the value at the playhead becomes v. */
    offset(o, id, v) {
      const tr = o.tracks[id]; if (!tr || !tr.length) return T.set(o, id, v); if (T.type(id) !== 'num') return T.set(o, id, v);
      const lt = SB.tree.localTime(o), cur = T.value(o, id, lt);
      if (MULTIPLY.has(id) && Math.abs(cur) > 1e-6) { const f = v / cur; tr.forEach(k => k.v *= f); }
      else { const d = v - cur; tr.forEach(k => k.v += d); if (id === 'x' || id === 'y') (o.tracks.x || []).forEach(k => { if (k.cx != null) { if (id === 'x') k.cx += d; else k.cy += d; } }); }
      SB.bump();
    },
    setMany(o, vals) { for (const id in vals) T.set(o, id, vals[id]); },
    keyMany(o, vals) { const lt = SB.tree.localTime(o); for (const id in vals) T.put(o, id, lt, vals[id]); },
    start(o, id) { const lt = SB.tree.localTime(o); T.put(o, id, lt, T.value(o, id, lt)); },
    stop(o, id) { const v = T.now(o, id); delete o.tracks[id]; T.setBase(o, id, v); SB.bump(); },
    remove(o, id, k) { const tr = o.tracks[id]; if (!tr) return; const i = tr.indexOf(k); if (i >= 0) tr.splice(i, 1); if (!tr.length) { delete o.tracks[id]; T.setBase(o, id, k.v); } SB.bump(); },
    toggleKey(o, id) {
      const lt = SB.tree.localTime(o);
      if (!T.animated(o, id)) { T.start(o, id); return 'added'; }
      const k = T.keyAt(o.tracks[id], lt); if (k) { T.remove(o, id, k); return 'removed'; }
      T.put(o, id, lt, T.value(o, id, lt)); return 'added';
    },
    drop(o, prefix) { for (const id in o.tracks) if (id === prefix || id.startsWith(prefix)) delete o.tracks[id]; },
    shift(o, d) { for (const id in o.tracks) o.tracks[id].forEach(k => k.t = U.r3(k.t + d)); },
    times(o) { const s = new Set(); for (const id in o.tracks) o.tracks[id].forEach(k => s.add(k.t)); return [...s].sort((a, b) => a - b); },
    keysAt(o, t) { const r = []; for (const id in o.tracks) o.tracks[id].forEach(k => { if (Math.abs(k.t - t) < 1e-4) r.push([k, id]); }); return r; },
    tidy(o) { const tol = T.tol() * 0.5; for (const id in o.tracks) { const tr = o.tracks[id].sort((a, b) => a.t - b.t); for (let i = tr.length - 1; i > 0; i--) if (Math.abs(tr[i].t - tr[i - 1].t) < tol) tr.splice(i - 1, 1); if (!tr.length) delete o.tracks[id]; } },
    /** Remove keys that change nothing. Returns how many were removed. */
    clean(o) {
      let n = 0;
      for (const id in o.tracks) {
        const ty = T.type(id);
        for (const k of o.tracks[id].slice()) {
          const tr = o.tracks[id], i = tr.indexOf(k); tr.splice(i, 1);
          const nv = tr.length ? T.value(o, id, k.t) : T.base(o, id);
          const same = ty === 'num' ? Math.abs(nv - k.v) <= (T.uiMul(id) > 1 ? 0.002 : 0.05) : nv === k.v;
          if (same) n++; else tr.splice(i, 0, k);
        }
        if (!o.tracks[id].length) delete o.tracks[id];
      }
      SB.bump(); return n;
    },
    clear(o) { const lt = SB.tree.localTime(o); for (const id in o.tracks) T.setBase(o, id, T.value(o, id, lt)); o.tracks = {}; delete o.rec; SB.bump(); },

    /** Transform values from keyframes alone (curved paths and live recording included). */
    keyed(o, lt) {
      if (o.kloop) lt = T.loopT(o, lt);
      const r = {}; for (const P of TRANSFORM) r[P] = T.value(o, P, lt);
      pathCurve(o, lt, r);
      if (o._live) Object.assign(r, o._live);
      return r;
    },
    /** Final transform at lt: keyframes, then every hook (controllers, constraints, physics). */
    transform(o, lt) {
      const r = T.keyed(o, lt);
      if (T.transformHooks.length && depth < 6) { depth++; try { for (const h of T.transformHooks) h.fn(o, lt, r); } finally { depth--; } }
      return r;
    },
    /** Hooks adjust the transform after keyframes. Lower order runs first.
        SB.tracks.hook(order, (o, lt, r) => { r.x += ... }) */
    transformHooks: [],
    override: null,
    hook(order, fn) { T.transformHooks.push({ order, fn }); T.transformHooks.sort((a, b) => a.order - b.order); },
    pathSegment,
  };

  // a change that was not keyed is dropped when the playhead moves (like Blender without Auto key)
  let lastT = null; SB.on('time', () => { if (lastT !== S.time) T.dropPending(); lastT = S.time; });

  // Curved motion paths: the X keys hold bezier handles (ho: out, hi: in, offsets from the point);
  // files from before keep a single bend point (cx, cy) for the segment after a key.
  function pathSegment(o, lt) {
    const X = o.tracks && o.tracks.x, Y = o.tracks && o.tracks.y; if (!X || X.length < 2 || !Y || !Y.length) return null;
    for (let j = 0; j < X.length - 1; j++) if (lt >= X[j].t && lt < X[j + 1].t) { const a = X[j], b = X[j + 1], ya = T.keyAt(Y, a.t), yb = T.keyAt(Y, b.t); return ya && yb ? { a, b, ya, yb } : null; }
    return null;
  }
  function pathCurve(o, lt, r) {
    if (!o.tracks || !o.tracks.x || !o.tracks.x.some(k => k.cx != null || k.ho || k.hi)) return;
    const s = pathSegment(o, lt); if (!s || s.a.e === 'hold') return; const a = s.a, b = s.b;
    if (a.cx == null && !a.ho && !b.hi) return;
    const u = easeOf(a)((lt - a.t) / Math.max(1e-6, b.t - a.t)), m = 1 - u;
    if (a.cx != null) { r.x = m * m * a.v + 2 * m * u * a.cx + u * u * b.v; r.y = m * m * s.ya.v + 2 * m * u * a.cy + u * u * s.yb.v; return; }
    const ho = a.ho || [0, 0], hi = b.hi || [0, 0], c0 = m * m * m, c1 = 3 * m * m * u, c2 = 3 * m * u * u, c3 = u * u * u;
    r.x = c0 * a.v + c1 * (a.v + ho[0]) + c2 * (b.v + hi[0]) + c3 * b.v; r.y = c0 * s.ya.v + c1 * (s.ya.v + ho[1]) + c2 * (s.yb.v + hi[1]) + c3 * s.yb.v;
  }
})(window.SB);
