/* Tutorial: Drawing 2 of 2. The Fill bucket, the Fill brush, Width and Pull, while coloring a little house (format: js/tours/tours.js). */
'use strict';
(function (SB) {
  const S = SB.state, tree = SB.tree, U = SB.util, at = SB.tours.at;
  const house = T => T.o('House');
  /** Where things go (stage pixels). */
  const G = T => { const x = T.W / 2, y = T.H / 2 + 60; return {
    body: [x - 200, y - 80, x + 200, y - 80, x + 200, y + 220, x - 200, y + 220, x - 200, y - 80],
    roof: [x - 235, y - 80, x, y - 270, x + 235, y - 80, x - 235, y - 80],
    door: [x - 35, y + 220, x - 35, y + 90, x + 35, y + 90, x + 35, y + 220],
    window: [x + 100, y + 20, 34], wall: [x - 140, y + 140], roofIn: [x, y - 150], tip: [x, y - 270], doorSide: [x - 35, y + 155], bush: [x + 330, y + 150, 62] }; };
  const frame = T => SB.frames.current(house(T));
  const fills = T => frame(T).strokes.filter(s => s.f || s.fc);
  const snap = T => JSON.stringify(frame(T).strokes);
  const ring = (cx, cy, r, n = 36) => { const p = []; for (let i = 0; i <= n; i++) { const a = i / n * Math.PI * 2; p.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r); } return p; };
  const art = SB.tours.art;
  const local = (o, pts) => { const M = SB.xf.world(o).inverse(), q = []; for (let i = 0; i < pts.length; i += 2) { const l = M.transformPoint(U.pt(pts[i], pts[i + 1])); q.push(U.r1(l.x), U.r1(l.y)); } return q; };
  /** A solid shape (what Skip does for the fill tools). */
  const pathAt = (T, i) => frame(T).strokes.filter(s => s.b)[i];
  const fillPath = (T, i, color) => { const s = pathAt(T, i); if (s) { s.fc = color; SB.paths.touch(s); } };
  const fillShape = (T, pts, color, front) => { const o = house(T), f = { f: 1, c: color, loops: [local(o, pts)] }; const st = SB.frames.current(o).strokes; if (front) st.push(f); else st.unshift(f); };
  const closeMenus = () => document.querySelectorAll('.pop').forEach(p => p.remove());
  SB.tours.add({
    id: 'drawing-fills', group: '3 Drawing', title: 'Drawing: fills and shaping', minutes: 4, level: 'Easy',
    blurb: 'Color a little house and shape its lines.',
    desc: 'The second drawing lesson. You color with the Fill bucket and the Fill brush, make a line thicker with Width, and pull the roof taller with Pull.',
    learn: ['The Fill bucket and colors', 'The Fill brush', 'The Width tool', 'The Pull tool'],
    preview(c, t, w, h) {
      c.fillStyle = '#F2F8FF'; c.fillRect(0, 0, w, h); const x = w / 2, y = h / 2 + 24, k = (t % 4) / 4, lift = Math.sin(Math.min(1, k * 1.6) * Math.PI) * 18;
      c.lineWidth = 5; c.lineJoin = 'round'; c.strokeStyle = '#24213F';
      c.fillStyle = k > 0.2 ? '#FFB45C' : '#fff'; c.fillRect(x - 55, y - 30, 110, 80); c.strokeRect(x - 55, y - 30, 110, 80);
      c.fillStyle = k > 0.4 ? '#E5484D' : '#fff'; c.beginPath(); c.moveTo(x - 68, y - 30); c.lineTo(x, y - 82 - lift); c.lineTo(x + 68, y - 30); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = k > 0.6 ? '#5BA8FF' : '#fff'; c.beginPath(); c.arc(x + 28, y - 2, 12, 0, 7); c.fill(); c.stroke(); c.strokeRect(x - 20, y + 14, 22, 36);
    },
    setup(T) {
      const o = tree.make('draw', { name: 'House', start: 0, dur: S.project.duration, play: 'loop' }); S.objects.push(o); tree.reindex(); tree.select([o.id]);
      const g = G(T); /* pen paths with exact corners: the walls, roof and door are dead straight, and each one is a closed shape the Fill bucket can fill */
      art.poly(o, g.body.slice(0, 8), true, { s: 8 }); art.poly(o, g.roof.slice(0, 6), true, { s: 8 }); art.poly(o, g.door, true, { s: 8 }); art.circle(o, ...g.window, { s: 6 });
      S.brush.color = '#24213F'; S.brush.size = 10; S.brushId = 'pen'; SB.tool.set('select');
    },
    steps: [
      { say: 'Here’s a little house made of lines. Let’s color it, then reshape it.' },
      { say: 'Pick the Fill bucket. It fills a closed area.', key: 'tFill', show: at.toolIn('Fill'), mouse: at.toolHow('Fill'), task: { check: () => S.tool === 'fill', doIt: () => SB.tool.set('fill') } },
      { say: 'Click the color chip and pick orange.', show: '#ctxbar .colorbtn', mouse: 'left', enter: T => { T.data.c0 = S.brush.color; }, task: { check: T => S.brush.color !== T.data.c0, hint: 'Click the round color chip in the bar above the stage and choose a color.', doIt: () => { S.brush.color = '#FFB45C'; closeMenus(); SB.invalidate('ctxbar'); } } },
      { say: 'Click inside the wall to fill it.', allow: ['stage'], mouse: 'left', at: T => G(T).wall, ghost: T => [{ dot: G(T).wall, label: 'click' }], enter: T => { T.data.f = fills(T).length; },
        task: { check: T => fills(T).length > T.data.f, hint: 'Click once on the pink dot, inside the walls. If it says the area is open, a line has a gap.', doIt: T => fillPath(T, 0, S.brush.color) } },
      { say: 'Now the roof. Pick red, then click inside the roof.', allow: ['stage', '#ctxbar'], mouse: 'left', at: T => G(T).roofIn, ghost: T => [{ dot: G(T).roofIn, label: 'click' }], enter: T => { T.data.f = fills(T).length; },
        task: { check: T => fills(T).length > T.data.f, hint: 'Click once inside the triangle. Any color works.', doIt: T => fillPath(T, 1, '#E5484D') } },
      { say: 'The Fill brush paints solid shapes with no outline, like a marker. It hides under the Brush: right-click (or hold) the Brush button and pick it.', key: 'tFillBrush', show: at.toolIn('Fill brush', 'Brush'), allow: ['.toolgrp'], mouse: at.toolHow('Fill brush'), task: { check: () => S.tool === 'fillbrush', hint: 'Right-click or press and hold the Brush button, then click Fill brush in the little list. Shift+G does it too.', doIt: () => SB.tool.set('fillbrush') } },
      { say: 'Pick blue, then paint around the round window. The shape fills!', allow: ['stage', '#ctxbar'], mouse: 'drag', at: T => [G(T).window[0] - G(T).window[2], G(T).window[1]], ghost: T => [{ circle: G(T).window }], enter: T => { T.data.f = fills(T).length; },
        task: { check: T => fills(T).length > T.data.f, hint: 'Draw one round line around the dashed circle, then let go.', doIt: T => fillShape(T, ring(G(T).window[0], G(T).window[1], G(T).window[2] - 3), '#5BA8FF', true) } },
      { say: 'Next, Width. It makes a line thicker where you brush over it. It hides under Smooth: right-click (or hold) that button and pick Width.', key: 'tWidth', show: at.toolIn('Width', 'Smooth', 'Pull'), allow: ['.toolgrp'], mouse: at.toolHow('Width'), task: { check: () => S.tool === 'width', hint: 'Right-click or press and hold the Smooth button, then click Width in the little list. W does it too.', doIt: () => SB.tool.set('width') } },
      { say: 'Brush over the left side of the door a few times.', allow: ['stage'], mouse: 'drag', at: T => [G(T).doorSide[0], G(T).doorSide[1] - 50], ghost: T => [{ line: [G(T).doorSide[0], G(T).doorSide[1] - 60, G(T).doorSide[0], G(T).doorSide[1] + 60] }], enter: T => { T.data.snap = snap(T); },
        task: { check: T => snap(T) !== T.data.snap, hint: 'Hold the mouse button and go up and down along the door line.', doIt: T => { const s = pathAt(T, 2); if (s) { s.s = (s.s || 8) + 6; SB.paths.touch(s); } } } },
      { tip: true, free: true, say: 'Hold Alt while you brush with Width to make a line thinner instead.' },
      { say: 'Last tool: Pull. It stretches the part of a line you drag. It is in the same list: right-click (or hold) the button and pick Pull.', key: 'tPull', show: at.toolIn('Pull', 'Smooth', 'Width'), allow: ['.toolgrp'], mouse: at.toolHow('Pull'), task: { check: () => S.tool === 'pull', hint: 'Right-click or press and hold the button that shows Width, then click Pull in the little list. U does it too.', doIt: () => SB.tool.set('pull') } },
      { say: 'Drag the tip of the roof up. The roof gets taller!', allow: ['stage'], mouse: 'drag', at: T => G(T).tip, ghost: T => [{ arrow: [G(T).tip[0], G(T).tip[1], G(T).tip[0], G(T).tip[1] - 110] }], enter: T => { T.data.snap2 = snap(T); },
        task: { check: T => snap(T) !== T.data.snap2, hint: 'Press on the top corner of the roof and drag straight up.', doIt: T => { const s = pathAt(T, 1); if (s) { const p = s.subs[0].p; [5, 7, 9].forEach(j => { p[j] = U.r1(p[j] - 70); }); SB.paths.touch(s); } } } },
      { practice: true, free: true, say: 'Pick the Fill brush and paint a round green bush next to the house.', allow: ['stage', '#ctxbar', '#rail', '.toolgrp'], keys: ['Shift', 'G'], mouse: 'drag', at: T => [G(T).bush[0] - G(T).bush[2], G(T).bush[1]], ghost: T => [{ circle: G(T).bush, label: 'bush' }], enter: T => { T.data.f = fills(T).length; },
        task: { check: T => fills(T).length > T.data.f && T.near(house(T), G(T).bush, 100).some(s => s.f), hint: 'Right-click or hold the Brush button to find the Fill brush (or press Shift+G). Draw around the dashed circle.', doIt: T => fillShape(T, ring(...G(T).bush), '#3DBE6B', true) } },
    ],
    outro: 'Nice little house! Try the Pen next for neat, editable curves: “Vectors: the Pen”.',
  });
})(window.SB);
