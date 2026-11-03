/* Tutorial: Drawing 1 of 2. The brush, its size, the eraser and the smooth tool, while drawing a happy sun (format: js/tours/tours.js). */
'use strict';
(function (SB) {
  const S = SB.state, tree = SB.tree, U = SB.util, at = SB.tours.at;
  const sun = T => T.o('Sun');
  /** Where things go (stage pixels). */
  const G = T => { const x = T.W / 2, y = T.H / 2 + 30, r = 190; return {
    face: [x, y, r], eyeL: [x - 65, y - 40], eyeR: [x + 65, y - 40], smile: [x - 80, y + 50, x - 40, y + 100, x, y + 115, x + 40, y + 100, x + 80, y + 50],
    rays: [[x, y - r - 30, x, y - r - 110], [x, y + r + 30, x, y + r + 110], [x - r - 30, y, x - r - 110, y], [x + r + 30, y, x + r + 110, y]],
    oops: [x - 640, y - 260, x - 560, y - 330, x - 500, y - 250, x - 430, y - 330, x - 370, y - 250] }; };
  const frame = T => SB.frames.current(sun(T));
  const lines = T => frame(T).strokes.filter(s => !s.f && !s.er && !s.fc);
  const wide = s => { const b = SB.paths.bounds([s]); return b.x1 - b.x0; };
  const snap = T => JSON.stringify(frame(T).strokes.map(s => s.pts || s.subs || s.loops || s.er));
  const ring = (cx, cy, r, n = 40) => { const p = []; for (let i = 0; i <= n; i++) { const a = i / n * Math.PI * 2; p.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r); } return p; };
  /** Put a stroke in at stage points (what Skip does). */
  const add = (T, pts, extra = {}) => { const o = sun(T), M = SB.xf.world(o).inverse(), q = []; for (let i = 0; i < pts.length; i += 2) { const l = M.transformPoint(U.pt(pts[i], pts[i + 1])); q.push(U.r1(l.x), U.r1(l.y)); } SB.frames.current(o).strokes.push(Object.assign({ c: '#24213F', s: 10, pts: q }, extra)); };
  const closeMenus = () => document.querySelectorAll('.pop').forEach(p => p.remove());
  SB.tours.add({
    id: 'drawing', group: '1 Basics', title: 'Drawing: brush and eraser', minutes: 4, level: 'Easy',
    blurb: 'Draw a happy sun with the brush, eraser and smooth tool.',
    desc: 'Meet the tools you will use all the time. You pick a brush, change its size, draw a sun, rub out a mistake with the Eraser and round a wobbly line with Smooth.',
    learn: ['The Brush and its brushes', 'Brush size', 'Stabilize for round shapes', 'The Eraser', 'The Smooth tool'],
    preview(c, t, w, h) {
      c.fillStyle = '#FFF9E8'; c.fillRect(0, 0, w, h); const x = w / 2, y = h / 2, k = Math.min(1, (t % 4) / 2.2);
      c.lineCap = 'round'; c.strokeStyle = '#24213F'; c.lineWidth = 5;
      c.beginPath(); c.arc(x, y, 46, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k); c.stroke();
      if (k > 0.99) { c.fillStyle = '#FFC93C'; c.beginPath(); c.arc(x, y, 43, 0, 7); c.fill(); }
      if (k > 0.99) { c.lineWidth = 5; for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2 + t * 0.6; c.beginPath(); c.moveTo(x + Math.cos(a) * 62, y + Math.sin(a) * 62); c.lineTo(x + Math.cos(a) * 82, y + Math.sin(a) * 82); c.stroke(); } c.fillStyle = '#24213F'; c.beginPath(); c.arc(x - 16, y - 10, 5, 0, 7); c.arc(x + 16, y - 10, 5, 0, 7); c.fill(); c.lineWidth = 4; c.beginPath(); c.arc(x, y + 6, 18, 0.25, Math.PI - 0.25); c.stroke(); }
    },
    setup(T) {
      const o = tree.make('draw', { name: 'Sun', start: 0, dur: S.project.duration, play: 'loop' }); S.objects.push(o); tree.reindex(); tree.select([o.id]);
      S.brush.color = '#24213F'; S.brush.size = 10; S.brushId = 'pen'; S.brushMode = 'free'; S.stab = false;
      add(T, G(T).oops, { s: 8, c: '#E5484D' }); /* a scribble to rub out later */
    },
    steps: [
      { say: 'Hi! I’m your guide. Let’s draw a happy sun and meet the drawing tools.' },
      { say: 'Pick the Brush.', key: 'tBrush', show: at.toolIn('Brush'), mouse: at.toolHow('Brush'), task: { check: () => S.tool === 'brush', doIt: () => SB.tool.set('brush') } },
      { say: 'Click the brush chip, then pick Ink. It draws lines with thin ends.', show: '#ctxbar .brushchip', mouse: 'left', task: { check: () => S.brushId !== 'pen', hint: 'Click the brush name in the bar above the stage, then choose any other brush.', doIt: () => { S.brushId = 'ink'; closeMenus(); SB.invalidate('ctxbar'); } } },
      { say: 'Stabilize helps with perfect round shapes. Turn it on.', show: () => [...document.querySelectorAll('#ctxbar label')].find(l => /Stabilize/.test(l.textContent)), mouse: 'left', task: { check: () => !!S.stab, doIt: () => { S.stab = true; SB.invalidate('ctxbar'); } } },
      { say: 'Draw the sun’s face: one big circle on the dashed ring.', allow: ['stage'], mouse: 'drag', at: T => [G(T).face[0] - G(T).face[2], G(T).face[1]], ghost: T => [{ circle: G(T).face, label: 'face' }], keys: ['Shift'],
        task: { check: T => T.near(sun(T), G(T).face, 90).some(s => wide(s) > 280), hint: 'Hold the mouse button and go all the way around the dashed ring.', doIt: T => add(T, ring(...G(T).face)) } },
      { say: 'Make the brush bigger: click Size and drag the slider, or press ] a few times.', key: 'bigger', show: () => [...document.querySelectorAll('#ctxbar button')].find(b => (b.getAttribute('title') || b.dataset.tip) === 'Size'), allow: ['#ctxbar'], mouse: 'left', enter: T => { T.data.size0 = S.brush.size; }, task: { check: T => S.brush.size > T.data.size0 + 1, hint: 'Click Size in the bar above the stage and slide it right, or press ] on your keyboard. [ makes it smaller.', doIt: () => { S.brush.size += 8; SB.invalidate('ctxbar'); } } },
      { say: 'Now four sun rays: one line on each dashed line.', allow: ['stage'], mouse: 'drag', at: T => [G(T).rays[0][0], G(T).rays[0][1]], enter: () => { S.stab = false; SB.invalidate('ctxbar'); }, keys: ['Shift'], ghost: T => G(T).rays.map(l => ({ line: l })),
        task: { check: T => G(T).rays.filter(l => T.near(sun(T), [(l[0] + l[2]) / 2, (l[1] + l[3]) / 2], 60).length).length >= 3, hint: 'Short straight lines, one per dashed line. Three is enough.', doIt: T => G(T).rays.forEach(l => add(T, l, { s: 18 })) } },
      { say: 'Two eyes: one dot on each pink dot.', allow: ['stage'], mouse: 'left', at: T => G(T).eyeL, ghost: T => [{ dot: G(T).eyeL }, { dot: G(T).eyeR }],
        task: { check: T => T.near(sun(T), G(T).eyeL, 45).length > 0 && T.near(sun(T), G(T).eyeR, 45).length > 0, hint: 'Just click once on each dot. A click makes a dot.', doIt: T => { add(T, ring(...G(T).eyeL, 8, 12), { s: 16 }); add(T, ring(...G(T).eyeR, 8, 12), { s: 16 }); } } },
      { say: 'Oops, a red scribble! Pick the Eraser to rub it out.', key: 'tEraser', show: at.toolIn('Eraser'), mouse: at.toolHow('Eraser'), task: { check: () => S.tool === 'eraser', doIt: () => SB.tool.set('eraser') } },
      { say: 'Rub over the red scribble, inside the pink box.', allow: ['stage'], mouse: 'drag', at: T => [G(T).oops[0], G(T).oops[1]], enter: T => { T.data.snap = snap(T); }, ghost: T => { const p = G(T).oops, x0 = p[0] - 40, y0 = p[1] - 90, x1 = p[8] + 40, y1 = p[1] + 50; return [{ rect: [x0, y0, x1, y1], label: 'erase' }]; },
        task: { check: T => snap(T) !== T.data.snap, hint: 'Hold the mouse button and rub back and forth over the red line.', doIt: T => { const o = sun(T), f = SB.frames.current(o); f.strokes = f.strokes.filter(s => s.c !== '#E5484D'); } } },
      { say: 'Great. Now the Smooth tool: it rounds wobbly lines.', key: 'tSmooth', show: at.toolIn('Smooth'), mouse: at.toolHow('Smooth'), task: { check: () => S.tool === 'smooth', doIt: () => SB.tool.set('smooth') } },
      { say: 'Brush slowly over the face line a few times. Watch it get rounder.', allow: ['stage'], mouse: 'drag', at: T => [G(T).face[0], G(T).face[1] - G(T).face[2]], ghost: T => [{ circle: G(T).face }], enter: T => { T.data.snap2 = snap(T); },
        task: { check: T => snap(T) !== T.data.snap2, hint: 'Hold the mouse button and move along the circle line, slowly.', doIt: T => { const s = lines(T).find(x => wide(x) > 280); if (s && s.pts) { s.pts = s.pts.map(v => v + 0.1); SB.paths.touch(s); } else T.data.snap2 = ''; } } },
      { tip: true, free: true, say: 'Hold Ctrl and drag across lines with the brush to trim loose ends. Right-click the brush chip to edit a brush.' },
      { say: 'Pick the Brush and draw a smile on the sun.', practice: true, free: true, allow: ['stage', '#rail', '#ctxbar'], keys: ['B', 'Shift'], mouse: 'drag', at: T => [G(T).smile[0], G(T).smile[1]], ghost: T => [{ poly: G(T).smile, label: 'smile' }],
        enter: T => { T.data.n = lines(T).length; },
        task: { check: T => lines(T).length > T.data.n && T.near(sun(T), [T.W / 2, T.H / 2 + 100], 70).length > 0, hint: 'A little curve under the eyes, like a smile.', doIt: T => add(T, G(T).smile, { s: 12 }) } },
    ],
    outro: 'What a happy sun! Next: “Keyframes and tweens” makes things move, or “Drawing: fills and shaping” to color it.',
  });
})(window.SB);
