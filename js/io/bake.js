/* Baking: the scene sampled frame by frame, the way the renderer places it. Lottie and FBX export use
   this, so everything that moves a layer (keyframes, effects that move, scale, turn or fade it,
   controllers, constraints, physics, bones it follows) ends up in the file as plain animation.
     SB.bake.walk(T, visit)  visits every visible-type layer at main time T, front to back:
       { o, parent, M (DOMMatrix, layer → stage px), alpha (0 when hidden or outside its clip), visible,
         lt (local time), st (render state), v (view: animated values filled in), fi (frame shown), T }
     SB.bake.decompose(m)    { x, y, rot (degrees), sx, sy } of a 2D matrix (shear is dropped) */
'use strict';
(function (SB) {
  const U = SB.util, S = SB.state, TR = SB.tracks, tree = SB.tree;
  /** Engines that can't morph lines (Unity, Godot, Blender, Rive) get a morph as in-between pictures: steps of them
      between the two frames. Returns { fi, strokes, label } for an in-between, { fi } for a plain frame, or null. */
  const MORPH_BASE = 100000;
  function morphShown(o, lt, steps) {
    if (o.expMorph != null) steps = o.expMorph; /* this layer's own count (right-click › Game engine frames…) */
    if (!steps || (o.type !== 'draw' && o.type !== 'shape') || !o.frames || o.frames.length < 2) return null;
    const c = SB.frames.change(o, lt); if (!c || c.mode !== 'morph') return null;
    const sh = o.type === 'shape', v = sh ? SB.scene.viewOf(o, lt) : null, def = SB.types.get(o.type), withShape = (i, list) => sh ? [def.asPath(SB.frames.shapeAt(o, i, v))].concat(list) : list; // a shape morphs its outline too
    const pa = withShape(c.a, (o.frames[c.a] || { strokes: [] }).strokes), pb = withShape(c.b, (o.frames[c.b] || { strokes: [] }).strokes), pairs = SB.frames.morphPairs(pa, pb); if (!pairs) return null;
    const q = Math.round(U.clamp(c.u, 0, 1) * (steps + 1)); if (q <= 0) return { fi: c.a }; if (q >= steps + 1) return { fi: c.b };
    return { fi: MORPH_BASE + (c.a * 1000 + c.b) * 64 + q, strokes: SB.frames.morphAt(pairs, q / (steps + 1)), noBase: sh, label: `${c.a + 1} to ${c.b + 1} ${Math.round(q / (steps + 1) * 100)}%` };
  }
  /** walk options: { morphSteps } in-between pictures per morph (0: the frame just changes). */
  function walk(T, visit, wopt = {}) {
    SB.stamp++; const root = new DOMMatrix(), opt = { T, root };
    (function rec(list, time, M, alpha, parent, vis) {
      for (const o of list) {
        const def = SB.types.get(o.type); if (!def || !def.visual || def.render === false) continue;
        const u = tree.inner(o, time); let lt = u == null ? NaN : u - o.start; const inClip = lt >= 0 && lt < o.dur, on = vis && !o.hidden && inClip;
        if (!inClip) lt = U.clamp(tree.inner(o, time, true) - o.start, 0, Math.max(0, o.dur - 1e-4));
        const v = SB.scene.viewOf(o, lt), st = SB.fx.state(v, lt, TR.transform(o, lt), { sc: 1 }); if (o.blend) st.blend = o.blend;
        const Mo = SB.scene.placed(o, M, st, opt), a = alpha * U.clamp(st.opacity, 0, 1);
        const ms = morphShown(o, lt, wopt.morphSteps);
        visit({ o, parent, M: Mo, alpha: on ? a : 0, visible: on && a > 0.001, lt, st, v, fi: ms ? ms.fi : o.frames && o.frames.length ? SB.frames.index(o, lt) : 0, morph: ms && ms.strokes ? ms : null, T });
        if (o.type === 'group') rec(o.children, o.seq ? lt + (o.inPoint || 0) : o.start + lt, Mo, a, o, on);
      }
    })(S.objects, T, root, 1, null, true);
  }
  function decompose(m) {
    const sx = Math.hypot(m.a, m.b), det = m.a * m.d - m.b * m.c;
    return { x: m.e, y: m.f, rot: Math.atan2(m.b, m.a) * 180 / Math.PI, sx, sy: sx > 1e-9 ? det / sx : Math.hypot(m.c, m.d) };
  }
  /** Keep only the samples needed to redraw the series within tol (piecewise linear). vals: arrays of numbers per frame. */
  function simplify(vals, tol) {
    const n = vals.length; if (n <= 2) return vals.map((_, i) => i);
    const keep = new Uint8Array(n); keep[0] = keep[n - 1] = 1; const st = [[0, n - 1]];
    while (st.length) {
      const [a, b] = st.pop(); let md = tol, mi = -1;
      for (let i = a + 1; i < b; i++) { const u = (i - a) / (b - a); let d = 0; for (let k = 0; k < vals[i].length; k++) d = Math.max(d, Math.abs(vals[a][k] + (vals[b][k] - vals[a][k]) * u - vals[i][k])); if (d > md) { md = d; mi = i; } }
      if (mi >= 0) { keep[mi] = 1; st.push([a, mi], [mi, b]); }
    }
    const out = []; for (let i = 0; i < n; i++) if (keep[i]) out.push(i); return out;
  }
  /** Angles without jumps of 360° between frames. */
  const unwrap = list => { for (let i = 1; i < list.length; i++) { while (list[i] - list[i - 1] > 180) list[i] -= 360; while (list[i] - list[i - 1] < -180) list[i] += 360; } return list; };
  /** A colour as [r, g, b, a] from 0 to 1. */
  function rgba(c) {
    if (SB.paint && c && typeof c === 'string' && SB.paint.kind(c) !== 'solid') c = SB.paint.solid(c); // a gradient or pattern exports as its main color
    if (!c || typeof c !== 'string') return [0, 0, 0, 1]; c = c.trim();
    if (c[0] === '#') { let hx = c.slice(1); if (hx.length <= 4) hx = hx.split('').map(x => x + x).join(''); const n = i => parseInt(hx.slice(i, i + 2), 16) / 255; return [n(0), n(2), n(4), hx.length >= 8 ? n(6) : 1]; }
    const m = c.match(/rgba?\(([^)]+)\)/); if (m) { const p = m[1].split(',').map(parseFloat); return [p[0] / 255, p[1] / 255, p[2] / 255, p[3] ?? 1]; }
    return [0, 0, 0, 1];
  }
  /** The strokes a baked frame number shows (an in-between picture keeps its own). */
  const strokesOf = (o, f, info) => info && info.morph && info.morph.fi === f ? info.morph.strokes : (o.frames[f] || o.frames[0] || { strokes: [] }).strokes;
  SB.bake = { walk, decompose, simplify, unwrap, rgba, morphShown, strokesOf, MORPH_BASE };
})(window.SB);
