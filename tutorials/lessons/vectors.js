/* Tutorial: vectors. The Pen tool, points, handles and the Edit points tool (format: js/tours/tours.js). */
'use strict';
(function (SB) {
  const S = SB.state, tree = SB.tree, U = SB.util, at = SB.tours.at;
  const lay = T => T.o('Vectors');
  const frame = T => SB.frames.current(lay(T));
  const paths = T => frame(T).strokes.filter(s => s.b && s.subs && s.subs[0]);
  const tri = T => paths(T)[0] || null, curve = T => paths(T)[1] || null;
  const nA = sub => SB.pathEdit.nA(sub);
  /** Where the dots go (stage pixels). */
  const G = T => { const W = T.W, H = T.H; return {
    tri: [[W * 0.2, H * 0.7], [W * 0.34, H * 0.3], [W * 0.48, H * 0.7]],
    cur: [[W * 0.58, H * 0.68], [W * 0.7, H * 0.3], [W * 0.82, H * 0.68]], drag: [[110, -130], [120, 0], [0, 0]], free: [W * 0.5, H * 0.18] }; };
  const world = (T, s, i) => { const p = s.subs[0].p, q = SB.xf.world(lay(T)).transformPoint(U.pt(p[6 * i], p[6 * i + 1])); return [q.x, q.y]; };
  const apex = T => { const s = tri(T); return s ? world(T, s, 1) : G(T).tri[1]; };
  const snap = T => JSON.stringify(paths(T).map(s => s.subs));
  const curvy = sub => { const p = sub.p; for (let i = 0; i < nA(sub); i++) for (const j of [6 * i + 2, 6 * i - 2]) if (j >= 0 && j + 1 < p.length && Math.hypot(p[j] - p[6 * i], p[j + 1] - p[6 * i + 1]) > 12) return true; return false; };
  const smoothAt = (s, i) => { const p = s.subs[0].p; return [6 * i - 2, 6 * i + 2].some(j => j >= 0 && j + 1 < p.length && Math.hypot(p[j] - p[6 * i], p[j + 1] - p[6 * i + 1]) > 1); };
  /** Put a pen path in (what Skip does): anchors [x, y, outX, outY] in stage pixels (the out handle is relative); closed or open. */
  const addPath = (T, anchors, closed) => {
    const o = lay(T), M = SB.xf.world(o).inverse(), L = (x, y) => { const q = M.transformPoint(U.pt(x, y)); return [U.r1(q.x), U.r1(q.y)]; }, A = anchors.map(a => { const q = L(a[0], a[1]), h = L(a[0] + (a[2] || 0), a[1] + (a[3] || 0)); return { q, out: h, inn: L(a[0] - (a[2] || 0), a[1] - (a[3] || 0)) }; });
    const p = [A[0].q[0], A[0].q[1]]; for (let i = 1; i < A.length; i++) p.push(A[i - 1].out[0], A[i - 1].out[1], A[i].inn[0], A[i].inn[1], A[i].q[0], A[i].q[1]);
    if (closed) p.push(A[A.length - 1].out[0], A[A.length - 1].out[1], A[0].q[0], A[0].q[1], A[0].q[0], A[0].q[1]);
    const s = { b: 1, subs: [{ p, cl: closed ? 1 : 0 }], c: '#24213F', s: 8 }; SB.frames.current(o).strokes.push(s); SB.paths.touch(s); return s; };
  SB.tours.add({
    id: 'vectors', group: '3 Drawing', title: 'Vectors: the Pen', minutes: 5, level: 'Medium',
    blurb: 'Draw clean shapes with points and handles, then edit them.',
    desc: 'A vector shape is made of points joined by lines or curves, so you can always change it. You draw a triangle and a curve with the Pen, then move points and bend them with handles in the Edit points tool.',
    learn: ['The Pen: click for corners, drag for curves', 'Closing a shape', 'Editing points', 'Smooth points and handles'],
    preview(c, t, w, h) {
      c.fillStyle = '#F6F2FF'; c.fillRect(0, 0, w, h); const x = w / 2, y = h / 2 + 20, k = 0.5 + Math.sin(t * 2) * 0.5, hx = 60 * k;
      c.strokeStyle = '#24213F'; c.lineWidth = 5; c.lineJoin = 'round'; c.beginPath(); c.moveTo(x - 80, y + 50); c.bezierCurveTo(x - 80 + hx, y - 90, x + 80 - hx, y - 90, x + 80, y + 50); c.stroke();
      c.strokeStyle = '#5B3DF5'; c.lineWidth = 2; c.beginPath(); c.moveTo(x - 80, y + 50); c.lineTo(x - 80 + hx, y - 90); c.moveTo(x + 80, y + 50); c.lineTo(x + 80 - hx, y - 90); c.stroke();
      for (const [px, py, r] of [[x - 80, y + 50, 7], [x + 80, y + 50, 7], [x - 80 + hx, y - 90, 5], [x + 80 - hx, y - 90, 5]]) { c.fillStyle = r > 5 ? '#FF4F8B' : '#fff'; c.beginPath(); c.arc(px, py, r, 0, 7); c.fill(); c.stroke(); }
    },
    setup(T) {
      const o = tree.make('draw', { name: 'Vectors', start: 0, dur: S.project.duration, play: 'loop' }); S.objects.push(o); tree.reindex(); tree.select([o.id]);
      S.brush.color = '#24213F'; S.brush.size = 8; SB.tool.set('select');
    },
    steps: [
      { say: 'Vectors are shapes made of points. You can move any point later. Let’s try the Pen.' },
      { say: 'Pick the Pen.', key: 'tPen', show: at.toolIn('Pen'), mouse: at.toolHow('Pen'), task: { check: () => S.tool === 'pen', doIt: () => SB.tool.set('pen') } },
      { say: 'Click dot 1, 2 and 3 for a triangle. Then click dot 1 again to close it.', allow: ['stage'], mouse: 'left', at: T => G(T).tri[0], ghost: T => G(T).tri.map((p, i) => ({ dot: p, label: String(i + 1) })), keys: ['Shift'],
        task: { check: T => { const s = tri(T); return !!s && !!s.subs[0].cl && nA(s.subs[0]) >= 4 && !S.pen; }, hint: 'Just click, don’t drag. The 4th click goes on dot 1 again.', doIt: T => { S.pen = null; addPath(T, G(T).tri.map(p => [p[0], p[1]]), true); } } },
      { say: 'Now curves! Click and drag at each dot, along the arrows. When you are done, double-click the last dot, press Enter or click Finish path.', allow: ['stage', '#ctxbar'], mouse: 'drag', at: T => G(T).cur[0], keys: ['Shift', 'Enter'],
        ghost: T => [...G(T).cur.map((p, i) => ({ dot: p, label: String(i + 1) })), ...G(T).cur.map((p, i) => ({ arrow: [p[0], p[1], p[0] + G(T).drag[i][0], p[1] + G(T).drag[i][1]] })).filter((a, i) => i < 2)],
        task: { check: T => { const s = curve(T); return !!s && nA(s.subs[0]) >= 3 && curvy(s.subs[0]) && !S.pen; }, hint: 'Press the mouse button on a dot, move away, and let go. The line bends. Enter finishes.', doIt: T => { S.pen = null; addPath(T, G(T).cur.map((p, i) => [p[0], p[1], G(T).drag[i][0] * 0.5, G(T).drag[i][1] * 0.5]), false); } } },
      { tip: true, free: true, say: 'Click makes a sharp corner. Drag makes a smooth curve. The long thin lines are handles: they steer the curve.' },
      { say: 'To edit the shape, pick the Points tool. It hides under the Pen: right-click (or hold) the Pen button and pick Points.', key: 'tPoints', show: at.toolIn('Points', 'Pen'), allow: ['.toolgrp'], mouse: at.toolHow('Points'), task: { check: () => S.tool === 'points', hint: 'Right-click or press and hold the Pen button, then click Points in the little list. A does it too.', doIt: () => SB.tool.set('points') } },
      { say: 'Click the triangle’s line to select it. Its points appear.', allow: ['stage'], mouse: 'left', at: T => [(G(T).tri[0][0] + G(T).tri[1][0]) / 2, (G(T).tri[0][1] + G(T).tri[1][1]) / 2], task: { check: T => !!tri(T) && S.selStrokes.has(tri(T)), doIt: T => { S.selStrokes = new Set([tri(T)]); SB.invalidate('ctxbar'); SB.dirty(); } } },
      { say: 'Drag the top point up to make a taller triangle.', allow: ['stage'], mouse: 'drag', at: apex, ghost: T => [{ arrow: [...apex(T), apex(T)[0], apex(T)[1] - 140] }], enter: T => { T.data.snap = snap(T); },
        task: { check: T => snap(T) !== T.data.snap, hint: 'Press on the white square at the top and drag it.', doIt: T => { const s = tri(T), p = s.subs[0].p; for (const j of [4, 5, 6, 7, 8, 9]) if (j % 2) p[j] -= 100; SB.paths.touch(s); SB.commit(); } } },
      { say: 'Double-click that point. It turns smooth and shows its handles.', allow: ['stage'], mouse: 'double', at: apex, task: { check: T => !!tri(T) && smoothAt(tri(T), 1), hint: 'Double-click right on the point at the top.', doIt: T => { const s = tri(T), p = s.subs[0].p, ax = p[6], ay = p[7]; p[4] = ax - 50; p[5] = ay; p[8] = ax + 50; p[9] = ay; SB.paths.touch(s); SB.commit(); } } },
      { say: 'Drag one of the round handles. The corner becomes a curve!', allow: ['stage'], mouse: 'drag', at: T => { const a = apex(T); return [a[0] + 60, a[1]]; }, enter: T => { T.data.snap = snap(T); },
        task: { check: T => snap(T) !== T.data.snap, hint: 'The handles are the little circles next to the point. Drag one up or down.', doIt: T => { const s = tri(T), p = s.subs[0].p; p[9] += 40; p[5] += 40; SB.paths.touch(s); SB.commit(); } } },
      { tip: true, free: true, say: 'Double-click a line to add a point. Alt-click a point to delete it. Hold Shift while dragging a handle to keep it level.' },
      { practice: true, free: true, say: 'Pick the Pen and draw any closed shape with four or more points. Click the first point to close it.', allow: ['stage', '#rail', '.toolgrp', '#ctxbar'], keys: ['P', 'Shift', 'Enter'], mouse: 'left', at: T => G(T).free, enter: T => { T.data.n = paths(T).length; },
        task: { check: T => paths(T).length > T.data.n && paths(T).slice(T.data.n).some(s => s.subs[0].cl && nA(s.subs[0]) >= 5) && !S.pen, hint: 'Press P, click four corners, then click the first corner again.', doIt: T => { S.pen = null; const [x, y] = G(T).free; addPath(T, [[x - 90, y], [x, y - 60], [x + 90, y], [x, y + 60]], true); } } },
    ],
    outro: 'You can now draw and reshape any vector. Next: “Auto key: a hop with a flip” starts the animation lessons.',
  });
})(window.SB);
