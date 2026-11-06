/* Tutorial: pixel art. A pixel art screen, the Pixel brush, Fill, a dithered or halftone gradient you can edit, and tips
   on frames, To vector and game engines (format: js/tours/tours.js). */
'use strict';
(function (SB) {
  const S = SB.state, tree = SB.tree, U = SB.util, at = SB.tours.at;
  const layer = () => tree.all().find(o => o.type === 'pixels') || null;
  const cells = () => { const o = layer(), f = o && SB.frames.current(o); return f && f.px ? Object.keys(f.px).length : 0; };
  const grads = () => { const o = layer(), f = o && SB.frames.current(o); return (f && f.pg) || []; };
  const inBar = (sel, text) => () => [...document.querySelectorAll('#ctxbar ' + sel)].find(b => b.textContent.trim().startsWith(text)) || null;
  const box = T => [T.W * 0.38, T.H * 0.5, T.W * 0.62, T.H * 0.86]; // where the house goes
  const sky = T => [T.W * 0.16, T.H * 0.08, T.W * 0.16, T.H * 0.46]; // the gradient's line
  /** "Do it for me": paint squares (stage points) on the pixel layer, making it when needed. */
  function paint(T, test, color) {
    SB.pixel.set({ on: true }); const z = SB.pixel.size(); let o = layer();
    if (!o) { o = tree.make('pixels', { name: 'Pixel art', x: 0, y: 0, cs: z.cs, frames: [{ strokes: [], px: {} }] }); S.objects.unshift(o); tree.reindex(); }
    const f = SB.frames.current(o) || o.frames[0]; f.px = f.px || {};
    for (let j = 0; j < z.h; j++) for (let i = 0; i < z.w; i++) { const x = (i + 0.5) * z.cs, y = (j + 0.5) * z.cs; if (test(x, y, f.px[i + ',' + j])) f.px[i + ',' + j] = color; }
    tree.select([o.id]); SB.commit();
  }
  const dragGrad = T => { if (grads().length) return; const g = SB.tools.get('gradient'), [x0, y0, x1, y1] = sky(T); SB.tool.set('gradient'); S.pxGradSel = null; /* a press on an active gradient's end would move it */ S.pxGStyle = 'halftone'; g.down({ x: x0, y: y0 }); g.move({ x: x1, y: y1 }); g.up({ x: x1, y: y1 }); SB.tool.drag = null; SB.dirty(); };

  SB.tours.add({
    id: 'pixel-art', group: '3 Drawing', title: 'Pixel art', minutes: 5, level: 'Easy', duration: 2,
    blurb: 'Paint a little pixel scene with a retro gradient sky.',
    desc: 'Turn the screen into pixel art, paint squares with the Pixel brush, fill the sky in one click, then give it a dithered or halftone gradient you can keep changing. The guide shares tips on animating pixel art frame by frame, turning it into vector shapes and exporting it sharp for games.',
    learn: ['A pixel art screen and its size', 'The Pixel brush: Draw, Erase, Fill', 'Pixel gradients: Normal, Dithering, Halftone', 'Changing a gradient after you made it', 'Frames, To vector and game engines'],
    preview(c, t, w, h) {
      const cs = 8, cols = Math.ceil(w / cs), rows = Math.ceil(h / cs), B = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5], sk = ['#1D2B53', '#7E2553', '#FF77A8', '#FFCCAA'];
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) { const v = j / rows * 3, k = Math.min(3, Math.floor(v) + ((v % 1) > (B[(j & 3) * 4 + (i & 3)] + 0.5) / 16 ? 1 : 0)); c.fillStyle = sk[k]; c.fillRect(i * cs, j * cs, cs, cs); }
      c.fillStyle = '#008751'; c.fillRect(0, h - 3 * cs, w, 3 * cs);
      const hx = Math.round(w * 0.55 / cs) * cs, hy = h - 3 * cs - 6 * cs; c.fillStyle = '#AB5236'; c.fillRect(hx, hy, 7 * cs, 6 * cs); c.fillStyle = '#5F574F'; for (let k = 0; k < 4; k++) c.fillRect(hx - cs + k * cs, hy - (k + 1) * cs, (9 - 2 * k) * cs, cs);
      c.fillStyle = '#FFEC27'; c.fillRect(hx + 2 * cs, hy + 2 * cs, 2 * cs, 2 * cs);
      const bx = Math.round((w * 0.2 + Math.sin(t * 2) * w * 0.08) / cs) * cs, by = Math.round((h - 4 * cs - Math.abs(Math.sin(t * 4)) * 5 * cs) / cs) * cs; c.fillStyle = '#29ADFF'; c.fillRect(bx, by - cs, 2 * cs, 2 * cs);
    },
    setup() { SB.tool.set('select'); },
    steps: [
      { say: 'Let’s make pixel art: a tiny house under a retro sky. Everything stays on a grid of squares.' },
      { say: 'Pick the Pixel brush.', key: 'tPixel', show: at.toolIn('Pixel brush'), mouse: at.toolHow('Pixel brush'), task: { check: () => S.tool === 'pixel', doIt: () => SB.tool.set('pixel') } },
      { say: 'In the bar at the top, turn on Pixel art screen. Now the whole screen is made of big pixels.', show: inBar('label', 'Pixel art screen'), mouse: 'left', task: { check: () => SB.pixel.on(), hint: 'It is a check box in the bar above the stage.', doIt: () => { SB.pixel.set({ on: true }); SB.invalidate('ctxbar'); } } },
      { tip: true, free: true, say: 'The size next to it is how many pixels across the screen is. Fewer pixels: chunkier art. The Pixel art panel on the right has any number you like.' },
      { say: 'Paint the house: drag inside the dashed box until it is mostly filled.', allow: ['stage'], mouse: 'drag', draw: true, at: T => [T.W / 2, T.H * 0.68], ghost: T => { const [x0, y0, x1, y1] = box(T); return [{ poly: [x0, y0, x1, y0, x1, y1, x0, y1] }]; },
        task: { check: () => cells() >= 30, hint: 'Press on the stage inside the box and scribble.', doIt: T => { const [x0, y0, x1, y1] = box(T); paint(T, (x, y) => x > x0 && x < x1 && y > y0 && y < y1, '#AB5236'); } } },
      { say: 'Now choose Fill in the bar.', show: inBar('.seg button', 'Fill'), mouse: 'left', task: { check: () => S.pxMode === 'fill', doIt: () => { S.pxMode = 'fill'; SB.invalidate('ctxbar'); } } },
      { say: 'Click the empty sky. The whole empty area fills in one go.', allow: ['stage'], mouse: 'left', at: T => [T.W * 0.2, T.H * 0.2], enter: T => { T.data.c0 = cells(); },
        task: { check: T => cells() > (T.data.c0 || 0) + 300, hint: 'Click anywhere outside the house.', doIt: T => paint(T, (x, y, cur) => !cur, '#1D2B53') } },
      { say: 'Time for a gradient sky. Pick the Gradient tool: it shares a button with Fill.', key: 'tGradient', enter: () => { S.brush.color = '#1D2B53'; S.pxGrad2 = '#FF77A8'; }, /* an evening sky: deep blue to pink */ show: at.toolIn('Gradient', 'Fill'), allow: ['.toolgrp'], mouse: at.toolHow('Gradient'), task: { check: () => S.tool === 'gradient', doIt: () => SB.tool.set('gradient') } },
      { say: 'Choose Halftone in the bar: dots that grow from one color into the next. Dithering is the checker kind, Normal is plain bands.', show: inBar('.seg button', 'Halftone'), mouse: 'left', task: { check: () => S.pxGStyle === 'halftone' || grads().some(g => g.style === 'halftone'), doIt: () => { S.pxGStyle = 'halftone'; SB.invalidate('ctxbar'); } } },
      { say: 'Drag down the sky along the arrow, from where the first color starts to where the second ends.', allow: ['stage'], mouse: 'drag', at: T => sky(T).slice(0, 2), ghost: T => [{ arrow: sky(T) }],
        task: { check: () => grads().length > 0, hint: 'Press at the top of the arrow and let go at its tip.', doIt: dragGrad } },
      { practice: true, free: true, say: 'It stays editable. Drag its ends or the color dots, try Dithering or more Steps, or double-click the line for a third color.', allow: ['stage', '#ctxbar'], enter: T => { T.data.g0 = JSON.stringify(grads().map(g => [g.a, g.b, g.stops, g.style, g.steps, g.type])); },
        task: { check: T => JSON.stringify(grads().map(g => [g.a, g.b, g.stops, g.style, g.steps, g.type])) !== T.data.g0, hint: 'The line with the dots is on the stage: drag its square end, or pick Dithering in the bar.', doIt: () => { const b = inBar('.seg button', 'Dithering')(); if (b) b.click(); } } },
      { tip: true, free: true, say: 'To animate pixel art, add frames in the frame bar under the stage, like a flip book. 8 to 12 frames a second feels just right.' },
      { tip: true, free: true, say: 'Want smooth shapes after all? Right-click a pixel layer › Convert to vector drawing. A gradient can turn into vector art too: To vector in its bar.' },
      { tip: true, free: true, say: 'For Unity or Godot, the export keeps the pixels sharp: each frame of a pixel art screen goes as one crisp picture.' },
    ],
    outro: 'Your pixel scene is ready. Add a hero with the Pixel brush, give it two frames, and make it walk.',
  });
})(window.SB);
