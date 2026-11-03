/* Shared helpers for the tutorials' practice art (loaded first, see config.js). Clean setup art: pen paths with exact
   points (straight lines stay straight), filled discs and rounded shapes, all given in stage pixels.
   SB.tours.art.path(o, anchors, closed, extra)  a pen path; anchors: [x, y, outX, outY] (the out handle is relative; none = a corner)
   SB.tours.art.poly(o, pts, closed, extra)      a path of straight lines through [x0, y0, x1, y1, …]
   SB.tours.art.circle(o, cx, cy, r, extra)      a round path
   SB.tours.art.disc(o, cx, cy, r, color, front) a solid round fill (front: on top of the lines, else behind them)
   SB.tours.art.solid(o, pts, color, front)      a solid fill of straight sides
   SB.tours.art.rrect(o, cx, cy, w, h, r, color, front) a solid rounded box
   SB.tours.art.cloud(o, cx, cy, k, color)       a flat-bottomed cloud made of solid fills (k: size, 1 = 340 px wide)
   SB.tours.art.local(o, pts)                    stage pixels to the layer's own coordinates */
'use strict';
(function (SB) {
  const U = SB.util, A = SB.tours.art = {};
  const frameOf = (o, i = 0) => { while (o.frames.length <= i) o.frames.push({ strokes: [] }); return o.frames[i]; };
  A.local = (o, pts) => { const M = SB.xf.world(o).inverse(), q = []; for (let i = 0; i < pts.length; i += 2) { const l = M.transformPoint(U.pt(pts[i], pts[i + 1])); q.push(U.r1(l.x), U.r1(l.y)); } return q; };
  /** Put a stroke in frame i of a layer (the layer must be in the project already, so its place is known). */
  A.put = (o, st, i = 0, back = false) => { const f = frameOf(o, i); if (back) f.strokes.unshift(st); else f.strokes.push(st); if (SB.paths && SB.paths.touch && st.b) SB.paths.touch(st); return st; };
  A.path = (o, anchors, closed, extra = {}, i = 0) => {
    const q = anchors.map(a => { const P = A.local(o, [a[0], a[1], a[0] + (a[2] || 0), a[1] + (a[3] || 0), a[0] - (a[2] || 0), a[1] - (a[3] || 0)]); return { q: [P[0], P[1]], out: [P[2], P[3]], inn: [P[4], P[5]] }; });
    const p = [q[0].q[0], q[0].q[1]]; for (let k = 1; k < q.length; k++) p.push(q[k - 1].out[0], q[k - 1].out[1], q[k].inn[0], q[k].inn[1], q[k].q[0], q[k].q[1]);
    if (closed) { const n = q.length - 1; p.push(q[n].out[0], q[n].out[1], q[0].inn[0], q[0].inn[1], q[0].q[0], q[0].q[1]); }
    return A.put(o, Object.assign({ b: 1, subs: [{ p, cl: closed ? 1 : 0 }], c: '#24213F', s: 8 }, extra), i);
  };
  A.poly = (o, pts, closed, extra, i) => { const a = []; for (let k = 0; k < pts.length; k += 2) a.push([pts[k], pts[k + 1]]); return A.path(o, a, closed, extra, i); };
  A.circle = (o, cx, cy, r, extra, i) => { const k = r * 0.5523; return A.path(o, [[cx + r, cy, 0, k], [cx, cy + r, -k, 0], [cx - r, cy, 0, -k], [cx, cy - r, k, 0]], true, extra, i); };
  A.ringPts = (cx, cy, r, n = 48) => { const p = []; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; p.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r); } return p; };
  A.solid = (o, pts, color, front, i) => A.put(o, { f: 1, c: color, loops: [A.local(o, pts)] }, i, !front);
  A.disc = (o, cx, cy, r, color, front, i) => A.solid(o, A.ringPts(cx, cy, r), color, front, i);
  A.rrect = (o, cx, cy, w, h, r, color, front, i) => { const p = [], c = [[cx + w / 2 - r, cy - h / 2 + r, -90], [cx + w / 2 - r, cy + h / 2 - r, 0], [cx - w / 2 + r, cy + h / 2 - r, 90], [cx - w / 2 + r, cy - h / 2 + r, 180]];
    c.forEach(([x, y, a0]) => { for (let k = 0; k <= 9; k++) { const a = (a0 + k * 10) * Math.PI / 180; p.push(x + Math.cos(a) * r, y + Math.sin(a) * r); } }); return A.solid(o, p, color, front, i); };
  A.cloud = (o, cx, cy, k = 1, color = '#FFFFFF') => { /* one single outline (so it stays one solid shape when it fades) */
    const discs = [[-140, 22, 62], [-52, -22, 84], [52, -12, 96], [142, 24, 60]], inside = (x, y) => (x >= -140 && x <= 142 && y >= 20 && y <= 84) || discs.some(([a, b, r]) => Math.hypot(x - a, y - b) <= r), pts = [];
    for (let i = 0; i < 240; i++) { const a = i / 240 * Math.PI * 2, dx = Math.cos(a), dy = Math.sin(a); let r = 0; for (let t = 0; t < 320; t += 0.5) if (inside(dx * t, 10 + dy * t)) r = t; pts.push(cx + dx * r * k, cy + (10 + dy * r) * k - 10 * k); }
    return A.solid(o, pts, color, true);
  };
})(window.SB);
