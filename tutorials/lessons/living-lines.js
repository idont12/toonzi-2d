/* Tutorial: living lines. The animated brush "Boiling ink" and the Hand-drawn boil effect (format: js/tours/tours.js). */
'use strict';
(function (SB) {
  const S = SB.state, tree = SB.tree, U = SB.util, at = SB.tours.at, is = SB.tours.is, art = SB.tours.art;
  const doodle = T => T.o('Doodle'), house = T => T.o('House');
  const frame = T => SB.frames.current(doodle(T));
  /** Lines drawn with an animated brush ("boil") on the Doodle layer. */
  const alive = T => frame(T).strokes.filter(s => !s.f && !s.er && s.bs && s.bs.an && s.bs.an.k === 'boil');
  const wide = s => { const b = SB.paths.bounds([s]); return b.x1 - b.x0; };
  const G = T => { const W = T.W, H = T.H, y0 = Math.round(H * 0.8); return { house: [W * 0.28, y0], sun: [W * 0.72, H * 0.34, 120], cloud: [W * 0.5, H * 0.14, 150, 60],
    rays: [[W * 0.72, H * 0.34 - 170, W * 0.72, H * 0.34 - 290], [W * 0.72 - 170, H * 0.34, W * 0.72 - 290, H * 0.34], [W * 0.72 + 170, H * 0.34, W * 0.72 + 290, H * 0.34], [W * 0.72, H * 0.34 + 170, W * 0.72, H * 0.34 + 290]] }; };
  const ring = (cx, cy, r, n = 40) => { const p = []; for (let i = 0; i <= n + 3; i++) { const a = i / n * Math.PI * 2; p.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r); } return p; };
  /** A line in with the Boiling ink brush (what Skip does). */
  const dense = pts => { const out = [pts[0], pts[1]]; for (let i = 2; i < pts.length; i += 2) { const x0 = pts[i - 2], y0 = pts[i - 1], n = Math.max(1, Math.ceil(Math.hypot(pts[i] - x0, pts[i + 1] - y0) / 8)); for (let k = 1; k <= n; k++) out.push(x0 + (pts[i] - x0) * k / n, y0 + (pts[i + 1] - y0) * k / n); } return out; };
  const add = (T, pts) => { const o = doodle(T), st = { c: '#24213F', s: 14, pts: art.local(o, dense(pts)) }; SB.brush.apply(S.brushes.find(b => b.id === 'boil'), st, false); SB.frames.current(o).strokes.push(st); tree.select([o.id]); };
  const closeMenus = () => document.querySelectorAll('.pop').forEach(p => p.remove());
  const has = (o, id) => !!o && (o.effects || []).some(e => e.type === id);
  const menuRun = (o, path) => { tree.select([o.id]); let list = SB.menus.layerItems(o); for (const name of path) { const it = list.find(x => x && x.label && x.label.startsWith(name)); if (!it) return false; if (it.sub) list = it.sub; else { SB.menu.close(); it.run(); return true; } } return false; };
  const openMenu = o => { const r = document.getElementById('stageDoc').getBoundingClientRect(); tree.select([o.id]); SB.menu.open(r.left + r.width * 0.5, r.top + r.height * 0.45, SB.menus.layerItems(o)); };
  SB.tours.add({
    id: 'living-lines', group: '6 Quick and powerful', title: 'Living lines: animated brush', minutes: 3, level: 'Easy', duration: 4,
    blurb: 'Draw with Boiling ink and your lines wiggle like a hand-drawn cartoon.',
    desc: 'Some brushes are animated: Boiling ink redraws every line by hand a few times a second. You draw a sun with it, then give a still house the same wobbly life with one effect.',
    learn: ['Animated brushes, like Boiling ink', 'Seeing them move on play', 'The Hand-drawn boil effect for lines you already have'],
    preview(c, t, w, h) {
      c.fillStyle = '#FFF9E8'; c.fillRect(0, 0, w, h); const st = Math.floor(t * 8), j = (i, k) => (Math.sin(st * 12.9898 + i * 78.233 + k * 37.7) * 43758.5453 % 1) * 2.4;
      c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = '#24213F'; c.lineWidth = 5; const x = w * 0.5, y = h * 0.52;
      c.beginPath(); for (let i = 0; i <= 36; i++) { const a = i / 36 * Math.PI * 2; c.lineTo(x + Math.cos(a) * 48 + j(i, 0), y + Math.sin(a) * 48 + j(i, 1)); } c.stroke();
      for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; c.beginPath(); c.moveTo(x + Math.cos(a) * 66 + j(i, 2), y + Math.sin(a) * 66 + j(i, 3)); c.lineTo(x + Math.cos(a) * 88 + j(i, 4), y + Math.sin(a) * 88 + j(i, 5)); c.stroke(); }
      c.fillStyle = '#24213F'; c.beginPath(); c.arc(x - 16 + j(1, 6), y - 10, 5, 0, 7); c.arc(x + 16 + j(2, 7), y - 10, 5, 0, 7); c.fill(); c.beginPath(); c.arc(x + j(3, 8), y + 4, 20, 0.3, Math.PI - 0.3); c.stroke();
    },
    setup(T) {
      const D = S.project.duration, g = G(T), [hx, hy] = g.house; S.project.bg = '#FFF9E8';
      const d = tree.make('draw', { name: 'Doodle', start: 0, dur: D, play: 'loop' }), hs = tree.make('draw', { name: 'House', start: 0, dur: D, play: 'loop' });
      S.objects.push(d, hs); tree.reindex();
      art.poly(hs, [hx - 200, hy - 270, hx + 200, hy - 270, hx + 200, hy, hx - 200, hy], true, { s: 9, fc: '#FFE3B5' }); art.poly(hs, [hx - 240, hy - 270, hx, hy - 470, hx + 240, hy - 270], true, { s: 9, fc: '#F28B82' });
      art.poly(hs, [hx - 45, hy, hx - 45, hy - 150, hx + 45, hy - 150, hx + 45, hy], true, { s: 9, fc: '#B98A5E' }); art.circle(hs, hx + 112, hy - 185, 42, { s: 8, fc: '#BFE3FF' });
      S.brush.color = '#24213F'; S.brush.size = 9; S.brushId = 'pen'; S.brushMode = 'free'; S.stab = false; tree.select([d.id]); SB.tool.set('select');
    },
    steps: [
      { say: 'Some brushes are alive. Boiling ink makes every line wiggle like a hand-drawn cartoon.' },
      { say: 'Pick the Brush.', key: 'tBrush', show: at.toolIn('Brush'), mouse: at.toolHow('Brush'), task: { check: () => S.tool === 'brush', doIt: () => SB.tool.set('brush') } },
      { say: 'Click the brush chip and choose Boiling ink.', show: '#ctxbar .brushchip', mouse: 'left', task: { check: () => S.brushId === 'boil', hint: 'Click the brush name in the bar above the stage, then pick Boiling ink from the list.', doIt: () => { S.brushId = 'boil'; S.brush.size = 14; closeMenus(); SB.invalidate('ctxbar'); } } },
      { say: 'Draw the sun’s face: one round line on the dashed circle.', allow: ['stage'], mouse: 'drag', at: T => [G(T).sun[0] - G(T).sun[2], G(T).sun[1]], ghost: T => [{ circle: G(T).sun, label: 'sun' }], keys: ['Shift'],
        task: { check: T => alive(T).some(s => wide(s) > 180), hint: 'Hold the mouse button and go around the dashed circle once.', doIt: T => add(T, ring(...G(T).sun)) } },
      { say: 'Add three sun rays: one short line on each dashed line.', allow: ['stage'], mouse: 'drag', at: T => [G(T).rays[0][0], G(T).rays[0][1]], ghost: T => G(T).rays.map(l => ({ line: l })), keys: ['Shift'], enter: T => { T.data.n = alive(T).length; },
        task: { check: T => alive(T).length >= T.data.n + 3, hint: 'Three short lines are enough. Each one is a quick drag.', doIt: T => G(T).rays.slice(0, 3).forEach(l => add(T, l)) } },
      { say: 'Press play. The sun’s lines redraw by themselves, while the house stays still.', key: 'play', show: '#btnPlay', enter: () => { SB.time.pause(); SB.time.set(0); }, task: { check: () => S.playing, doIt: () => SB.time.play() } },
      { say: 'Stop it.', key: 'play', show: '#btnPlay', task: { check: () => !S.playing, doIt: () => SB.time.pause() } },
      { say: 'The house was drawn with a plain pen. Give it life too: right-click it.', allow: ['stage'], mouse: 'right', at: T => [G(T).house[0] - 120, G(T).house[1] - 120], task: { check: is.menuOpen, hint: 'Right-click the house walls.', doIt: T => openMenu(house(T)) } },
      { say: 'Choose Effects, then Animated effects, then Hand-drawn boil.', show: at.item('Hand-drawn boil', 'Animated effects', 'Effects'), mouse: 'left', task: { check: T => has(house(T), 'boil'), doIt: T => { SB.menu.close(); menuRun(house(T), ['Effects', 'Animated effects', 'Hand-drawn boil']); } } },
      { say: 'Go back to the start and play: everything is alive now.', key: 'play', show: '#btnPlay', enter: () => { SB.time.pause(); SB.time.set(0); }, task: { check: () => S.playing, doIt: () => SB.time.play() } },
      { tip: true, free: true, say: 'Right-click the brush chip to edit a brush. In its Animation section pick Boil, Marching dashes, Pulse or Flow, and set the speed and amount.' },
      { practice: true, free: true, say: 'Pick the Brush and draw a cloud with Boiling ink, above the house.', allow: ['stage', '#rail', '#ctxbar', '#btnPlay'], keys: ['B', 'Space'], mouse: 'drag', at: T => [G(T).cloud[0] - G(T).cloud[2], G(T).cloud[1]], ghost: T => [{ ellipse: G(T).cloud, label: 'cloud' }],
        enter: T => { SB.time.pause(); tree.select([doodle(T).id]); T.data.n = alive(T).length; if (S.tool !== 'brush') SB.tool.set('brush'); if (S.brushId !== 'boil') { S.brushId = 'boil'; SB.invalidate('ctxbar'); } },
        task: { check: T => alive(T).length > T.data.n && T.near(doodle(T), [G(T).cloud[0], G(T).cloud[1]], 170).some(s => s.bs && s.bs.an), hint: 'A bumpy cloud shape, in the dashed area. Any wobbly line works.', doIt: T => add(T, ring(G(T).cloud[0], G(T).cloud[1], 60)) } },
    ],
    outro: 'Living lines, drawn once. Use Boiling ink for new drawings and the Hand-drawn boil effect for art you already have.',
  });
})(window.SB);
