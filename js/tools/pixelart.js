/* Pixel art.
   A screen can be pixel art (the Project / This screen panel › Pixel art; S.project.pixel = { on, w, hard }):
   it is drawn at w pixels across (and as many down as its shape needs), then shown big with no smoothing, so every
   layer (shapes, text, images, vector drawings, particles) turns into pixels on the same grid, on the stage and in
   every export. hard: each pixel is fully on or off (no soft, half-see-through edges).
   The Pixel brush (tool 'pixel', Shift+B) paints the squares of a Pixel art layer (type 'pixels'):
     frames[i].px = { 'x,y': color }   one entry per painted square, frame by frame like a drawing
     o.cs                              the size of a square in the layer's own units (the screen's pixel size when made)
   Modes: Draw, Erase, Fill. On a pixel art screen Fill (and the Fill tool, G) fills the joined pixels of one color as the
   screen shows them, so lines drawn with any tool hold it in; elsewhere it fills the layer's own squares.
   Alt-click picks a color. The Eraser tool erases squares too.
   The Gradient tool fills pixel art with an editable gradient (Normal, Dithering or Halftone; see below). */
'use strict';
(function (SB) {
  const U = SB.util, S = SB.state, tree = SB.tree, W = SB.w, h = U.h, X = SB.xf, scene = SB.scene;
  const SIZES = [32, 48, 64, 96, 128, 160, 192, 256, 320, 480, 640];

  const PX = SB.pixel = {
    SIZES,
    on: () => !!(S.project.pixel && S.project.pixel.on),
    /** The screen's pixel grid: w × h pixels, each cs screen units wide. */
    size(p = S.project) { const w = U.clamp(Math.round((p.pixel && p.pixel.w) || 160), 8, 1024); return { w, h: Math.max(1, Math.round(w * p.h / p.w)), cs: p.w / w }; },
    set(v) { S.project.pixel = Object.assign({ on: false, w: 160, hard: true }, S.project.pixel, v); SB.commit(); SB.invalidate('inspector', 'ctxbar'); SB.dirty(); },
  };

  // ---------- the screen filter: draw small, show big
  const R0 = scene.render, buf = document.createElement('canvas'), bgBuf = document.createElement('canvas'); let busy = false;
  const fit = (cv, w, h) => { if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; } const c = cv.getContext('2d', { willReadFrequently: true }); c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over'; c.clearRect(0, 0, w, h); return c; };
  scene.render = function (ctx, t, sc, opt = {}) {
    if (!PX.on() || busy || opt.noPixel) return R0.call(this, ctx, t, sc, opt);
    const z = PX.size(), o = opt.origin || [0, 0], k = z.w / S.project.w, lc = fit(buf, z.w, z.h);
    busy = true; try { R0.call(this, lc, t, k, Object.assign({}, opt, { origin: [0, 0], noBg: true })); } finally { busy = false; } // the layers, on their own…
    if (S.project.pixel.hard !== false) { const id = lc.getImageData(0, 0, z.w, z.h), d = id.data; for (let i = 3; i < d.length; i += 4) d[i] = d[i] < 110 ? 0 : 255; lc.putImageData(id, 0, 0); } // …so their edges can be fully on or off
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.imageSmoothingEnabled = false;
    if (!opt.noBg) { SB.stamp++; const bc = fit(bgBuf, z.w, z.h); scene.drawBackground(bc, t, k, [0, 0]); ctx.drawImage(bgBuf, o[0], o[1], S.project.w * sc, S.project.h * sc); } // …and the background under them, in pixels too
    ctx.drawImage(buf, o[0], o[1], S.project.w * sc, S.project.h * sc); ctx.restore();
  };

  // ---------- the Pixel art layer
  const cellsOf = k => { const n = k.indexOf(','); return [+k.slice(0, n), +k.slice(n + 1)]; };
  SB.types.add({
    id: 'pixels', label: 'Pixel art', icon: 'pixel', color: '--c-draw', visual: true, frames: true, fx: true,
    defaults: () => ({ play: 'library', cs: PX.size().cs }),
    bounds(o) { const b = U.emptyBox(), cs = o.cs || 1; for (const f of o.frames || []) for (const k in f.px || {}) { const [i, j] = cellsOf(k); U.growBox(b, i * cs, j * cs); U.growBox(b, (i + 1) * cs, (j + 1) * cs); } return U.boxOk(b) ? b : null; },
    draw(c, v, fr) {
      const px = fr && fr.px; if (!px) return; const cs = v.cs || 1, by = new Map();
      for (const k in px) { const col = px[k]; if (!by.has(col)) by.set(col, []); by.get(col).push(k); }
      for (const [col, ks] of by) { c.fillStyle = col; c.beginPath(); for (const k of ks) { const [i, j] = cellsOf(k); c.rect(i * cs, j * cs, cs + 0.05, cs + 0.05); } c.fill(); } // a hair over, so no seams show between squares
    },
    hit(o, l, fi) { const f = o.frames && o.frames[fi], cs = o.cs || 1; return !!(f && f.px && f.px[Math.floor(l.x / cs) + ',' + Math.floor(l.y / cs)]); },
  });

  // ---------- painting
  const ok = o => o && o.type === 'pixels' && !tree.locked(o) && !tree.hidden(o);
  /** The Pixel art layer to paint on: the selected one, the one under the pointer, or a new one (at the screen's corner, so its squares sit on the screen's grid). */
  function target(P, create) {
    let o = tree.sel(); if (ok(o)) return o;
    if (P) { const hit = scene.hit(P); if (ok(hit)) { tree.select([hit.id]); return hit; } }
    const any = tree.all().find(x => ok(x) && tree.inRange(x)); if (any) { tree.select([any.id]); return any; } // keep painting on the screen's pixel art layer
    if (!create) return null;
    const n = tree.all().filter(x => x.type === 'pixels').length + 1;
    o = tree.make('pixels', { name: 'Pixel art ' + n, x: 0, y: 0, ax: 0, ay: 0, cs: PX.size().cs, frames: [{ strokes: [], px: {} }] });
    S.objects.unshift(o); tree.reindex(); tree.select([o.id]); return o;
  }
  /** Square under stage point P in o's grid. */
  const cellAt = (o, P) => { const l = X.world(o).inverse().transformPoint(U.pt(P.x, P.y)), cs = o.cs || 1; return [Math.floor(l.x / cs), Math.floor(l.y / cs)]; };
  const brush = () => U.clamp(Math.round(S.pxSize || 1), 1, 32);
  function stamp(fr, i, j, erase, col) {
    const n = brush(), a = Math.floor((n - 1) / 2), px = fr.px || (fr.px = {});
    for (let y = j - a; y < j - a + n; y++) for (let x = i - a; x < i - a + n; x++) { const k = x + ',' + y; if (erase) delete px[k]; else px[k] = col; }
  }
  /** Every square from (i0, j0) to (i1, j1), so a quick stroke has no gaps. */
  function line(fr, i0, j0, i1, j1, erase, col) {
    let dx = Math.abs(i1 - i0), dy = -Math.abs(j1 - j0), sx = i0 < i1 ? 1 : -1, sy = j0 < j1 ? 1 : -1, err = dx + dy, n = 0;
    for (;;) { stamp(fr, i0, j0, erase, col); if ((i0 === i1 && j0 === j1) || ++n > 4000) break; const e2 = 2 * err; if (e2 >= dy) { err += dy; i0 += sx; } if (e2 <= dx) { err += dx; j0 += sy; } }
  }
  /** Fill: the joined squares of the clicked color (or the empty ones), up to the edges of the screen. */
  function flood(o, fr, i, j, col, keys) {
    const px = fr.px || (fr.px = {}), from = px[i + ',' + j] || null; if (from === col) return; // (col may be a function of the square: a gradient; keys collects the squares filled)
    const M = X.world(o).inverse(), cs = o.cs || 1, a = M.transformPoint(U.pt(0, 0)), b = M.transformPoint(U.pt(S.project.w, S.project.h));
    const x0 = Math.floor(Math.min(a.x, b.x) / cs), x1 = Math.ceil(Math.max(a.x, b.x) / cs) - 1, y0 = Math.floor(Math.min(a.y, b.y) / cs), y1 = Math.ceil(Math.max(a.y, b.y) / cs) - 1;
    const st = [[i, j]], seen = new Set(); let n = 0;
    const colAt = typeof col === 'function' ? col : null;
    while (st.length && n < 400000) { const [x, y] = st.pop(), k = x + ',' + y; if (seen.has(k) || x < x0 || x > x1 || y < y0 || y > y1 || (px[k] || null) !== from) continue; seen.add(k); px[k] = colAt ? colAt(x, y) : col; if (keys) keys.push(k); n++; st.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]); }
  }
  /** Fill on a pixel art screen: the joined pixels of one color, as the screen shows them (every layer: lines drawn
      with the brush, shapes, text…), become squares of the Pixel art layer o. Returns how many. */
  function screenFill(o, fr, P, col, keys) {
    const z = PX.size(), sx = Math.floor(P.x / z.cs), sy = Math.floor(P.y / z.cs); if (sx < 0 || sy < 0 || sx >= z.w || sy >= z.h) return 0;
    const cv = document.createElement('canvas'); cv.width = z.w; cv.height = z.h; const c = cv.getContext('2d', { willReadFrequently: true });
    busy = true; try { R0.call(scene, c, S.time, z.w / S.project.w, { noBg: true }); } finally { busy = false; }
    const d = c.getImageData(0, 0, z.w, z.h).data, cut = S.project.pixel.hard !== false ? 110 : 8;
    const at = i => d[i * 4 + 3] < cut ? 0 : ((d[i * 4] << 16) | (d[i * 4 + 1] << 8) | d[i * 4 + 2]) + 1; // 0: empty
    const from = at(sy * z.w + sx), seen = new Uint8Array(z.w * z.h), st = [sy * z.w + sx], M = X.world(o).inverse(), cs = o.cs || 1, px = fr.px || (fr.px = {}); let n = 0;
    while (st.length) {
      const i = st.pop(); if (seen[i]) continue; seen[i] = 1; if (at(i) !== from) continue;
      const x = i % z.w, y = (i - x) / z.w, sx2 = (x + 0.5) * z.cs, sy2 = (y + 0.5) * z.cs, l = M.transformPoint(U.pt(sx2, sy2)), ci = Math.floor(l.x / cs), cj = Math.floor(l.y / cs), k = ci + ',' + cj; px[k] = typeof col === 'function' ? col(ci, cj) : col; if (keys) keys.push(k); n++;
      if (x > 0) st.push(i - 1); if (x < z.w - 1) st.push(i + 1); if (y > 0) st.push(i - z.w); if (y < z.h - 1) st.push(i + z.w);
    }
    return n;
  }
  function down(P, e, eraseTool) {
    const mode = eraseTool ? 'erase' : S.pxMode || 'draw', o = target(P, mode !== 'erase'); if (!o) return SB.toast('Select a Pixel art layer to erase on.');
    const [i, j] = cellAt(o, P);
    if (e && e.altKey && !eraseTool) { const fr = SB.frames.current(o), c = fr && fr.px && fr.px[i + ',' + j]; if (c) { S.brush.color = c; SB.invalidate('ctxbar'); SB.toast('Color picked.'); } return; }
    if (mode !== 'erase') SB.frames.autoFrame(o); const fr = SB.frames.current(o); if (!fr) return;
    if (mode === 'fill') { if (PX.on()) screenFill(o, fr, P, S.brush.color); else flood(o, fr, i, j, S.brush.color); SB.commit(); return; } // a pixel art screen: fill what the screen shows; else this layer's own squares
    stamp(fr, i, j, mode === 'erase', S.brush.color); SB.tool.drag = { kind: 'pixel', o, fr, erase: mode === 'erase', last: [i, j] }; SB.bump();
  }
  function move(P) { const d = SB.tool.drag; if (!d || d.kind !== 'pixel') return; const [i, j] = cellAt(d.o, P); if (i === d.last[0] && j === d.last[1]) return; line(d.fr, d.last[0], d.last[1], i, j, d.erase, S.brush.color); d.last = [i, j]; SB.bump(); }
  function up() { const d = SB.tool.drag; if (d && d.kind === 'pixel') SB.commit(); }

  // ---------- the grid and the brush square on the stage
  function grid(O) {
    if (!(S.tool === 'pixel' || (S.tool === 'eraser' && ok(tree.sel())))) return;
    const c = O.c, z = PX.size(), [x0, y0] = O.P(0, 0), [x1] = O.P(S.project.w, 0), step = (x1 - x0) / z.w; if (step < 5) return;
    c.save(); c.strokeStyle = 'rgba(91,61,245,.16)'; c.lineWidth = 1; c.beginPath();
    const [, y1] = O.P(0, S.project.h), W0 = c.canvas.width, H0 = c.canvas.height;
    for (let i = Math.max(0, Math.floor(-x0 / step)); i <= z.w; i++) { const x = Math.round(x0 + i * step) + 0.5; if (x > W0) break; c.moveTo(x, Math.max(0, y0)); c.lineTo(x, Math.min(H0, y1)); }
    for (let j = Math.max(0, Math.floor(-y0 / step)); j <= z.h; j++) { const y = Math.round(y0 + j * step) + 0.5; if (y > H0) break; c.moveTo(Math.max(0, x0), y); c.lineTo(Math.min(W0, x1), y); }
    c.stroke(); c.restore();
  }
  function cursor(O, erase) {
    if (!S.hover) return; const o = ok(tree.sel()) ? tree.sel() : null, cs = o ? o.cs || 1 : PX.size().cs, M = o ? X.world(o) : new DOMMatrix();
    const l = M.inverse().transformPoint(U.pt(S.hover.x, S.hover.y)), n = erase ? Math.max(1, Math.round(S.pxSize || 1)) : brush(), a = Math.floor((n - 1) / 2), i = Math.floor(l.x / cs) - a, j = Math.floor(l.y / cs) - a;
    const pts = [[i, j], [i + n, j], [i + n, j + n], [i, j + n]].map(([x, y]) => M.transformPoint(U.pt(x * cs, y * cs))).map(p => O.P(p.x, p.y));
    const c = O.c; c.save(); c.beginPath(); pts.forEach(([x, y], k) => k ? c.lineTo(x, y) : c.moveTo(x, y)); c.closePath();
    if (!erase && (S.pxMode || 'draw') === 'draw') { c.globalAlpha = 0.45; c.fillStyle = S.brush.color; c.fill(); c.globalAlpha = 1; }
    c.lineWidth = 1.5 * O.dpr; c.strokeStyle = '#fff'; c.stroke(); c.setLineDash([3 * O.dpr, 3 * O.dpr]); c.strokeStyle = '#24213F'; c.stroke(); c.restore();
  }
  SB.overlays.extra.push(grid);

  /** The screen's pixel art switch and size, for the tool bar and the panel. */
  function sizeSelect(cls) {
    const z = PX.size(), opts = SIZES.includes(z.w) ? SIZES : SIZES.concat(z.w).sort((a, b) => a - b);
    return W.select(String(z.w), opts.map(v => [String(v), `${v} × ${Math.round(v * S.project.h / S.project.w)} pixels`]), v => PX.set({ w: +v, on: true }), 'Pixels across the screen');
  }
  SB.tools.add({
    id: 'pixel', label: 'Pixel brush', icon: 'pixel', key: 'Shift+B', tip: 'Pixel art: paints squares on the pixel grid (Alt-click picks a color)', cursor: 'crosshair',
    down: (P, e) => down(P, e, false), move: P => move(P), up, cancel: () => SB.revert(),
    overlay(O) { cursor(O, (S.pxMode || 'draw') === 'erase'); },
    bar() {
      return [W.colorBtn(S.brush.color, { label: 'Color', paint: true, input: c => { S.brush.color = c; } }), h('span.vsep'),
        W.popSlider('Size', brush(), { min: 1, max: 32, unit: ' px', title: 'Brush size in pixels of the grid', input: v => { S.pxSize = v; SB.dirty(); } }),
        W.seg(S.pxMode || 'draw', [['draw', 'Draw', 'Paint squares'], ['erase', 'Erase', 'Remove squares'], ['fill', 'Fill', 'Fill the joined squares of one color (or an empty area)']], v => { S.pxMode = v; SB.invalidate('ctxbar'); }),
        h('span.vsep'), W.check(PX.on(), 'Pixel art screen', v => PX.set({ on: v })), PX.on() ? sizeSelect() : null,
        ok(tree.sel()) ? W.btn('To vector', () => PX.toVector(tree.sel()), { cls: 'sm ghost', icon: 'pen', title: 'Turn this Pixel art layer into a vector drawing you can edit (one shape per color, every frame)' }) : null,
        W.info(['Paints squares on the screen\'s pixel grid, on a Pixel art layer (made for you when you start). Frame by frame works like a drawing.', 'Pixel art screen: everything on this screen, shapes, text and drawings too, turns into pixels of this size, on the stage and in exports.', 'Alt-click picks a color. The Eraser tool erases squares too.'], 'Pixel brush')];
    },
  });
  // the Eraser on a Pixel art layer erases squares
  const er = SB.tools.get('eraser');
  if (er) { const d0 = er.down, m0 = er.move, u0 = er.up, o0 = er.overlay;
    er.down = (P, e) => { const o = tree.sel(); if (ok(o)) { const n0 = S.pxSize; S.pxSize = Math.max(1, Math.round(S.eraser / (o.cs || 1) / 2)); down(P, e, true); S.pxSize = n0; if (SB.tool.drag) SB.tool.drag.n = Math.max(1, Math.round(S.eraser / (o.cs || 1) / 2)); return; } return d0(P, e); };
    er.move = (P, e) => { const d = SB.tool.drag; if (d && d.kind === 'pixel') { const n0 = S.pxSize; S.pxSize = d.n; move(P); S.pxSize = n0; return; } return m0(P, e); };
    er.up = (P, e) => { const d = SB.tool.drag; if (d && d.kind === 'pixel') return up(); return u0(P, e); };
    er.overlay = O => { const o = tree.sel(); if (ok(o)) { const n0 = S.pxSize; S.pxSize = Math.max(1, Math.round(S.eraser / (o.cs || 1) / 2)); cursor(O, true); S.pxSize = n0; return; } return o0(O); };
  }

  // the Fill tool on a pixel art screen (or on a Pixel art layer) fills squares
  const fl = SB.tools.get('fill');
  if (fl) { const d0 = fl.down; fl.down = function (P, e) {
    if (!PX.on() && !ok(tree.sel())) return d0.call(this, P, e);
    const o = target(P, true); if (!o) return; SB.frames.autoFrame(o); const fr = SB.frames.current(o); if (!fr) return;
    const n = PX.on() ? screenFill(o, fr, P, S.brush.color) : (flood(o, fr, ...cellAt(o, P), S.brush.color), 1);
    if (n) SB.commit(); else SB.toast('Click inside the screen to fill.');
  }; }

  // ---------- the Gradient tool on pixel art: drag across an area, and its pixels get the colors in bands (Steps), as
  // Normal bands, Dithering (a 4 × 4 checker pattern between bands, like old games) or Halftone (dots that grow from one
  // color into the next), along the line or around its start (Radial). It stays editable: the frame keeps it
  //   fr.pg = [{ id, cells: ['i,j'], a: [x, y], b: [x, y] (the layer's own space), stops: [{ c, p }], type, style, steps, dot }]
  // and the tool shows its line, like the vector Gradient tool: drag its ends or the line, slide the color dots,
  // double-click the line for a new color. Squares painted over since keep their paint.
  // "To vector" makes it a vector drawing: one path with a real (editable) gradient, or one path per color.
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const STYLES = [['normal', 'Normal', 'Plain bands of color'], ['dither', 'Dithering', 'A checker pattern mixes the bands, like old games'], ['halftone', 'Halftone', 'Halftone and dotwork: dots that grow from one color into the next']];
  const halfCache = new Map();
  /** Halftone order for a D × D dot cell: from the middle out, so each dot grows round. */
  function halfMat(D) {
    let m = halfCache.get(D); if (m) return m; const cells = [];
    for (let y = 0; y < D; y++) for (let x = 0; x < D; x++) cells.push([x, y, Math.hypot(x + 0.5 - D / 2, y + 0.5 - D / 2) + ((x * 7 + y * 13) % D) * 1e-3]);
    m = new Float32Array(D * D); cells.slice().sort((p, q) => p[2] - q[2]).forEach((c, r) => { m[c[1] * D + c[0]] = (r + 0.5) / (D * D); }); halfCache.set(D, m); return m;
  }
  const hex = c => SB.paint ? SB.paint.split(c).hex : String(c).slice(0, 7).toUpperCase(); // squares are solid
  const stopColor = (L, t) => { if (t <= L[0].p) return L[0].c; for (let i = 1; i < L.length; i++) if (t <= L[i].p) { const a = L[i - 1], b = L[i]; return U.lerpColor(a.c, b.c, b.p > a.p ? (t - a.p) / (b.p - a.p) : 0); } return L[L.length - 1].c; };
  /** The color of square (i, j) (of a layer whose squares are cs wide) in gradient g. */
  function colorFn(g, cs) {
    const n = U.clamp(Math.round(g.steps || 4), 2, 64), [ax, ay] = g.a, [bx, by] = g.b, dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1, D = U.clamp(Math.round(g.dot || 4), 2, 16), hm = g.style === 'halftone' ? halfMat(D) : null;
    const L = (g.stops && g.stops.length >= 2 ? g.stops : [{ c: '#000000', p: 0 }, { c: '#FFFFFF', p: 1 }]).map(q => ({ c: hex(q.c), p: q.p })).sort((p, q) => p.p - q.p), cache = new Map();
    return (i, j) => {
      const x = (i + 0.5) * cs, y = (j + 0.5) * cs, t = U.clamp(g.type === 'radial' ? Math.hypot(x - ax, y - ay) / Math.sqrt(L2) : ((x - ax) * dx + (y - ay) * dy) / L2, 0, 1), v = t * (n - 1), f = Math.floor(v);
      const th = g.style === 'dither' ? (BAYER[((j & 3) << 2) | (i & 3)] + 0.5) / 16 : hm ? hm[(((j % D) + D) % D) * D + (((i % D) + D) % D)] : null;
      const k = th == null ? Math.round(v) : Math.min(n - 1, f + (v - f > th ? 1 : 0));
      let c = cache.get(k); if (!c) cache.set(k, c = hex(stopColor(L, k / (n - 1)))); return c;
    };
  }
  /** The editable gradients of layer o's current frame, and the one being edited (made or clicked last). */
  const pgList = o => { const fr = o && SB.frames.current(o); return (fr && fr.pg) || []; };
  const pgActive = o => { if (!o || !S.pxGradSel || S.pxGradSel.oid !== o.id) return null; return pgList(o).find(g => g.id === S.pxGradSel.id) || null; };
  const copyG = g => JSON.parse(JSON.stringify(Object.assign({}, g, { cells: null })));
  /** Gradient g changed (it was g0): its squares that still show g0's colors take g's. */
  function recolor(o, fr, g0, g) {
    const cs = o.cs || 1, f0 = colorFn(g0, cs), f1 = colorFn(g, cs), px = fr.px || {};
    for (const k of g.cells) { const cur = px[k]; if (cur == null) continue; const [i, j] = cellsOf(k); if (cur === f0(i, j)) px[k] = f1(i, j); }
  }
  /** Settings for new gradients (and the bar): the last ones used. */
  const defaults = () => ({ stops: [{ c: hex(S.brush.color), p: 0 }, { c: hex(S.pxGrad2 || '#FFFFFF'), p: 1 }], type: S.pxRadial ? 'radial' : 'linear', style: S.pxGStyle || (S.pxDither === false ? 'normal' : 'dither'), steps: U.clamp(Math.round(S.pxSteps || 4), 2, 64), dot: U.clamp(Math.round(S.pxDot || 4), 2, 16) });
  /** Its line on the stage: { A, B (stage points), stops: [[x, y, color, i]] }. */
  function pgHandles(o, g) {
    const M = X.world(o), A = M.transformPoint(U.pt(g.a[0], g.a[1])), B = M.transformPoint(U.pt(g.b[0], g.b[1]));
    return { A, B, stops: g.stops.map((q, i) => [A.x + (B.x - A.x) * q.p, A.y + (B.y - A.y) * q.p, q.c, i]) };
  }
  const near = (q, x, y, r) => Math.hypot(q.x - x, q.y - y) <= r;
  const segDist = (P0, A, B) => { const vx = B.x - A.x, vy = B.y - A.y, l = vx * vx + vy * vy || 1, u = U.clamp(((P0.x - A.x) * vx + (P0.y - A.y) * vy) / l, 0, 1); return [Math.hypot(A.x + vx * u - P0.x, A.y + vy * u - P0.y), u]; };
  /** Change the active gradient with fn(g), recoloring its squares; fin: an undo step. */
  function editG(fn, fin = true) {
    const o = tree.sel(), g = pgActive(o), fr = o && SB.frames.current(o); if (!g || !fr) return false; const g0 = copyG(g); fn(g); recolor(o, fr, g0, g);
    if (fin) SB.commit(); else SB.bump(); SB.invalidate('ctxbar'); return true;
  }

  // ---------- To vector: the gradient's squares become a vector drawing (js/tools/gradient.js edits its gradient)
  /** The outline of a set of squares ('i,j' keys) as closed loops of corner points (square units), holes running the other way. */
  function outlineOf(keys) {
    const set = new Set(keys), out = new Map(), edges = []; const add = (x0, y0, x1, y1) => { const e = [x0, y0, x1, y1]; edges.push(e); const k = x0 + ',' + y0; if (!out.has(k)) out.set(k, []); out.get(k).push(e); };
    for (const k of set) { const [i, j] = cellsOf(k); if (!set.has(i + ',' + (j - 1))) add(i, j, i + 1, j); if (!set.has((i + 1) + ',' + j)) add(i + 1, j, i + 1, j + 1); if (!set.has(i + ',' + (j + 1))) add(i + 1, j + 1, i, j + 1); if (!set.has((i - 1) + ',' + j)) add(i, j + 1, i, j); }
    const used = new Set(), loops = [];
    for (const e0 of edges) {
      if (used.has(e0)) continue; const pts = []; let e = e0;
      while (e && !used.has(e)) { used.add(e); pts.push(e[0], e[1]); const nx = (out.get(e[2] + ',' + e[3]) || []).filter(q => !used.has(q)); if (nx.length > 1) { const dx = e[2] - e[0], dy = e[3] - e[1]; nx.sort((p, q) => ((p[2] - p[0]) * dy - (p[3] - p[1]) * dx) - ((q[2] - q[0]) * dy - (q[3] - q[1]) * dx)); } e = nx[0]; } // at a corner where two loops touch: turn the same way each time
      const n = pts.length / 2, keep = []; for (let i = 0; i < n; i++) { const px = pts[((i - 1 + n) % n) * 2], py = pts[((i - 1 + n) % n) * 2 + 1], x = pts[i * 2], y = pts[i * 2 + 1], qx = pts[((i + 1) % n) * 2], qy = pts[((i + 1) % n) * 2 + 1]; if ((x - px) * (qy - y) - (y - py) * (qx - x) !== 0) keep.push(x, y); } // only the corners
      if (keep.length >= 6) loops.push(keep);
    }
    return loops;
  }
  /** Turn the active gradient into a vector drawing above the layer. how: 'grad' (one path, a smooth vector gradient
      you can edit with the Gradient tool) or 'colors' (one path per color: the same pixels, as shapes). */
  function toVector(how) {
    const o = tree.sel(), g = pgActive(o), fr = o && SB.frames.current(o); if (!g || !fr) return;
    const cs = o.cs || 1, f = colorFn(g, cs), px = fr.px || {}, mine = g.cells.filter(k => px[k] != null && px[k] === f(...cellsOf(k))); if (!mine.length) return SB.toast('Nothing of this gradient is left on the layer.');
    const list = tree.listOf ? tree.listOf(o) : (tree.parentOf(o) ? tree.parentOf(o).children : S.objects), d = tree.make('draw', { name: `${o.name} gradient (vector)`, x: 0, y: 0 });
    list.splice(Math.max(0, list.indexOf(o)), 0, d); tree.reindex();
    const Md = X.world(d).inverse().multiply(X.world(o)), map = (x, y) => { const q = Md.transformPoint(U.pt(x * cs, y * cs)); return [q.x, q.y]; };
    const path = keys => outlineOf(keys).map(L => { const pts = []; for (let i = 0; i < L.length; i += 2) pts.push(...map(L[i], L[i + 1])); return SB.paths.poly(pts, true); });
    if (how === 'grad') {
      const subs = path(mine), st = { b: 1, subs, c: '#24213F', s: 0, fc: '#000000' }, box = SB.paths.bounds([st]), a = map(g.a[0] / cs, g.a[1] / cs), b = map(g.b[0] / cs, g.b[1] / cs);
      st.fc = SB.gradientTool.placed({ type: g.type === 'radial' ? 'radial' : 'linear', stops: g.stops.map(q => ({ c: hex(q.c), p: q.p })) }, { box }, U.pt(a[0], a[1]), U.pt(b[0], b[1]));
      d.frames = [{ strokes: [st] }];
    } else {
      const by = new Map(); for (const k of mine) { const c = px[k]; if (!by.has(c)) by.set(c, []); by.get(c).push(k); }
      d.frames = [{ strokes: [...by].map(([c, ks]) => ({ b: 1, subs: path(ks), c: '#24213F', s: 0, fc: c })) }];
    }
    for (const k of mine) delete px[k]; fr.pg = (fr.pg || []).filter(x => x !== g); if (!fr.pg.length) delete fr.pg; S.pxGradSel = null;
    tree.select([d.id]); SB.commit(); SB.invalidate();
    SB.toast(how === 'grad' ? 'Now a vector path with a gradient: drag its ends or color dots with the Gradient tool to change it.' : 'Now vector shapes, one per color: edit them with the Path tool or recolor them.');
  }

  /** A whole Pixel art layer becomes a vector drawing: every frame, one filled path per color (the same squares,
      as shapes you can edit). It keeps its place, id, keys, timing and effects, so rigs and controllers still find it. */
  PX.toVector = o => {
    if (!o || o.type !== 'pixels') return null; const cs = o.cs || 1;
    const frames = (o.frames && o.frames.length ? o.frames : [{ px: {} }]).map(fr => {
      const by = new Map(); for (const k in fr.px || {}) { const c = fr.px[k]; if (!c) continue; if (!by.has(c)) by.set(c, []); by.get(c).push(k); }
      const strokes = [...by].map(([c, ks]) => ({ b: 1, subs: outlineOf(ks).map(L => SB.paths.poly(L.map(v => v * cs), true)), c: '#24213F', s: 0, fc: c })).filter(st => st.subs.length);
      const f = Object.assign(U.deep(fr), { strokes }); delete f.px; delete f.pg; return f;
    });
    const d = Object.assign(U.deep(o), { type: 'draw', frames }); delete d.cs;
    const l = tree.listOf(o); l.splice(l.indexOf(o), 1, d); tree.reindex(); tree.select([d.id]); if (S.pxGradSel && S.pxGradSel.oid === d.id) S.pxGradSel = null; SB.commit(); SB.invalidate();
    SB.toast(frames.length > 1 ? `Now a vector drawing with ${frames.length} frames: one shape per color. Double-click a shape to move its points.` : 'Now a vector drawing: one shape per color. Double-click a shape to move its points.');
    return d;
  };

  const gr = SB.tools.get('gradient');
  const pxGrad = () => { const s = tree.sel(); return ok(s) || (PX.on() && !(s && ['shape', 'draw', 'text'].includes(s.type))); };
  if (gr) {
    const g0 = { down: gr.down, move: gr.move, up: gr.up, overlay: gr.overlay, bar: gr.bar, dbl: gr.dbl, cancel: gr.cancel };
    gr.down = function (P, e) {
      if (!pxGrad()) return g0.down.call(this, P, e);
      const o = tree.sel(), g = ok(o) && pgActive(o), k = SB.view.k(), R = 10 / k;
      if (g) { // a handle of the gradient being edited
        const H = pgHandles(o, g), fr = SB.frames.current(o), begin = (part, extra) => { SB.tool.drag = Object.assign({ kind: 'pxgedit', part, o, fr, g, gs: copyG(g), prev: copyG(g), p0: P, moved: false }, extra); };
        const st = H.stops.find(q => near(P, q[0], q[1] - 14 / k, R)); if (st) { S.pxStop = st[3]; SB.invalidate('ctxbar'); return begin('stop', { i: st[3], H }); }
        if (near(P, H.A.x, H.A.y, R)) return begin('a', { H }); if (near(P, H.B.x, H.B.y, R)) return begin('b', { H });
        if (segDist(P, H.A, H.B)[0] <= R * 0.7) return begin('line', { H });
      }
      SB.tool.drag = { kind: 'pxgrad', A: P, B: P };
    };
    gr.move = function (P, e) {
      const d = SB.tool.drag;
      if (d && d.kind === 'pxgrad') { d.B = e && e.shiftKey ? SB.tool.straight(d.A, P, e) : P; SB.dirty(); return; }
      if (d && d.kind === 'pxgedit') {
        d.moved = d.moved || Math.hypot(P.x - d.p0.x, P.y - d.p0.y) * SB.view.k() > 2; if (!d.moved) return;
        const Mi = X.world(d.o).inverse(), loc = Q => { const q = Mi.transformPoint(U.pt(Q.x, Q.y)); return [U.r2(q.x), U.r2(q.y)]; }, g = d.g, s0 = d.gs;
        if (d.part === 'stop') { const [, u] = segDist(P, d.H.A, d.H.B); g.stops = s0.stops.map((q, i) => i === d.i ? { c: q.c, p: U.r2(u) } : Object.assign({}, q)); }
        else {
          const Q = d.part === 'b' && e && e.shiftKey ? SB.tool.straight(d.H.A, P, e) : P, L1 = loc(Q), L0 = loc(d.p0), dx = L1[0] - L0[0], dy = L1[1] - L0[1];
          if (d.part === 'a') g.a = L1; else if (d.part === 'b') g.b = L1; else { g.a = [U.r2(s0.a[0] + dx), U.r2(s0.a[1] + dy)]; g.b = [U.r2(s0.b[0] + dx), U.r2(s0.b[1] + dy)]; }
          if (d.part === 'a' && g.type === 'radial') g.b = [U.r2(s0.b[0] + dx), U.r2(s0.b[1] + dy)]; // radial: its middle carries the edge along
        }
        recolor(d.o, d.fr, d.prev, g); d.prev = copyG(g); SB.bump(); return;
      }
      return g0.move && g0.move.call(this, P, e);
    };
    gr.up = function (P, e) {
      const d = SB.tool.drag;
      if (d && d.kind === 'pxgedit') { if (d.moved) SB.commit(); SB.invalidate('ctxbar'); return; }
      if (!d || d.kind !== 'pxgrad') return g0.up && g0.up.call(this, P, e);
      const o = target(d.A, true); if (!o) return;
      if (Math.hypot(d.B.x - d.A.x, d.B.y - d.A.y) * SB.view.k() < 4) { // a click: pick the gradient under it, to edit it
        const [i, j] = cellAt(o, d.A), k = i + ',' + j, g = pgList(o).slice().reverse().find(x => x.cells.includes(k));
        S.pxGradSel = g ? { oid: o.id, id: g.id } : null; SB.invalidate('ctxbar'); SB.dirty();
        return g ? null : SB.toast('Drag across an area to fill it with a gradient (a click picks one to edit).');
      }
      SB.frames.autoFrame(o); const fr = SB.frames.current(o); if (!fr) return;
      const Mi = X.world(o).inverse(), a = Mi.transformPoint(U.pt(d.A.x, d.A.y)), b = Mi.transformPoint(U.pt(d.B.x, d.B.y));
      const g = Object.assign(defaults(), { id: U.uid(), a: [U.r2(a.x), U.r2(a.y)], b: [U.r2(b.x), U.r2(b.y)], cells: [] }), col = colorFn(g, o.cs || 1);
      if (PX.on()) screenFill(o, fr, d.A, col, g.cells); else flood(o, fr, ...cellAt(o, d.A), col, g.cells);
      if (!g.cells.length) return SB.toast('Drag across an area of the screen to fill it.');
      g.cells = [...new Set(g.cells)]; // the newest on top: an older gradient lets go of the squares this one took
      for (const x of fr.pg || []) { const mine = new Set(g.cells); x.cells = x.cells.filter(k => !mine.has(k)); }
      fr.pg = (fr.pg || []).filter(x => x.cells.length).concat(g); S.pxGradSel = { oid: o.id, id: g.id }; S.pxStop = null; SB.commit(); SB.invalidate('ctxbar');
    };
    gr.dbl = function (P, e) { // on the line: a new color there
      const o = tree.sel(), g = ok(o) && pgActive(o); if (!g) return g0.dbl && g0.dbl.call(this, P, e);
      const H = pgHandles(o, g), [dd, u] = segDist(P, H.A, H.B); if (dd * SB.view.k() > 10) return;
      editG(x => { const L = x.stops.slice().sort((p, q) => p.p - q.p); x.stops = x.stops.concat({ c: hex(stopColor(L.map(q => ({ c: hex(q.c), p: q.p })), u)), p: U.r2(u) }); S.pxStop = x.stops.length - 1; });
    };
    gr.cancel = function () { const d = SB.tool.drag; if (d && (d.kind === 'pxgedit' || d.kind === 'pxgrad')) { if (d.moved) SB.revert(); SB.tool.drag = null; SB.dirty(); return; } return g0.cancel && g0.cancel.call(this); };
    gr.overlay = function (O) {
      const d = SB.tool.drag, c = O.c, dpr = O.dpr;
      const line = (A, B, c1, c2) => { const [ax, ay] = O.P(A.x, A.y), [bx, by] = O.P(B.x, B.y); c.save(); c.lineWidth = 2 * dpr; c.strokeStyle = '#fff'; c.setLineDash([5 * dpr, 4 * dpr]); c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, by); c.stroke(); c.strokeStyle = '#24213F'; c.lineDashOffset = 4.5 * dpr; c.stroke(); c.setLineDash([]); for (const [x, y, f] of [[ax, ay, c1], [bx, by, c2]]) { c.fillStyle = f; c.beginPath(); c.arc(x, y, 6 * dpr, 0, Math.PI * 2); c.fill(); c.stroke(); } c.restore(); };
      if (d && d.kind === 'pxgrad') { const df = defaults(); return line(d.A, d.B, df.stops[0].c, df.stops[1].c); }
      if (!pxGrad()) return g0.overlay && g0.overlay.call(this, O);
      const o = tree.sel(), g = ok(o) && pgActive(o); if (!g || S.playing) return;
      const H = pgHandles(o, g), [ax, ay] = O.P(H.A.x, H.A.y), [bx, by] = O.P(H.B.x, H.B.y); c.save();
      if (g.type === 'radial') { c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineWidth = 3 * dpr; c.beginPath(); c.arc(ax, ay, Math.hypot(bx - ax, by - ay), 0, Math.PI * 2); c.stroke(); c.strokeStyle = 'rgba(36,33,63,.7)'; c.lineWidth = 1 * dpr; c.setLineDash([5 * dpr, 4 * dpr]); c.stroke(); c.setLineDash([]); }
      c.lineCap = 'round'; c.strokeStyle = '#fff'; c.lineWidth = 4 * dpr; c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, by); c.stroke(); c.strokeStyle = '#24213F'; c.lineWidth = 1.5 * dpr; c.stroke();
      c.fillStyle = '#fff'; c.strokeStyle = '#24213F'; c.lineWidth = 1.5 * dpr; c.beginPath(); c.arc(ax, ay, 6 * dpr, 0, Math.PI * 2); c.fill(); c.stroke(); c.beginPath(); c.rect(bx - 5 * dpr, by - 5 * dpr, 10 * dpr, 10 * dpr); c.fill(); c.stroke();
      for (const [x, y, col, i] of H.stops) { const [sx, sy] = O.P(x, y), r = (S.pxStop === i ? 8 : 6.5) * dpr; c.beginPath(); c.arc(sx, sy - 14 * dpr, r, 0, Math.PI * 2); c.fillStyle = hex(col); c.fill(); c.lineWidth = 2.5 * dpr; c.strokeStyle = '#fff'; c.stroke(); c.lineWidth = 1 * dpr; c.strokeStyle = S.pxStop === i ? '#5B3DF5' : '#24213F'; c.stroke(); c.beginPath(); c.moveTo(sx, sy - 14 * dpr + r); c.lineTo(sx, sy); c.stroke(); }
      c.restore();
    };
    gr.bar = function () {
      if (!pxGrad()) return g0.bar.call(this);
      const o = tree.sel(), g = ok(o) && pgActive(o), cur = g || defaults();
      const set = (fn, fin = true) => { if (g) editG(fn, fin); else { fn(cur); SB.invalidate('ctxbar'); } // the settings also become the ones for the next gradient
        S.pxGStyle = cur.style; S.pxSteps = cur.steps; S.pxRadial = cur.type === 'radial'; S.pxDot = cur.dot; };
      const colors = g
        ? h('span.grad-stops', { title: 'The gradient’s colors: click one to change it' }, ...g.stops.map((q, i) => ({ q, i })).sort((x, y) => x.q.p - y.q.p).map(({ q, i }) => { const cb = W.colorBtn(hex(q.c), { label: `Color ${i + 1} (at ${Math.round(q.p * 100)}%)`, paint: true, input: c => editG(x => { x.stops[i] = { c: hex(c), p: x.stops[i].p }; }, false), change: () => { S.pxStop = i; SB.commit(); } }); if (S.pxStop === i) cb.classList.add('on'); return cb; }))
        : [W.colorBtn(S.brush.color, { label: 'First color', paint: true, input: c => { S.brush.color = c; } }), W.colorBtn(S.pxGrad2 || '#FFFFFF', { label: 'Second color', paint: true, input: c => { S.pxGrad2 = c; } })];
      return [colors, h('span.vsep'),
        W.seg(cur.style, STYLES, v => set(x => { x.style = v; })),
        W.seg(cur.type === 'radial' ? 'radial' : 'linear', [['linear', 'Linear'], ['radial', 'Radial', 'Around where you start']], v => set(x => { x.type = v; })),
        W.popSlider('Steps', cur.steps, { min: 2, max: 64, title: 'How many colors from the first to the last (bands)', input: v => set(x => { x.steps = v; }, false), change: () => g && SB.commit() }),
        cur.style === 'halftone' ? W.popSlider('Dot size', cur.dot, { min: 2, max: 16, unit: ' px', title: 'How many pixels across each halftone dot cell is', input: v => set(x => { x.dot = v; }, false), change: () => g && SB.commit() }) : null,
        g ? W.btn('Reverse', () => editG(x => { x.stops = x.stops.map(q => ({ c: q.c, p: U.r2(1 - q.p) })); }), { cls: 'sm ghost' }) : null,
        g && S.pxStop != null && g.stops.length > 2 ? W.btn('Remove color', () => { editG(x => { x.stops = x.stops.filter((q, i) => i !== S.pxStop); }); S.pxStop = null; }, { cls: 'sm ghost', icon: 'trash' }) : null,
        g ? h('span.vsep') : null,
        g ? W.btn('To vector', e => { const r = e.currentTarget.getBoundingClientRect(); SB.menu.open(r.left, r.bottom + 4, [{ head: 'Make it editable vector art' }, { label: 'A vector gradient (smooth, edit it with the Gradient tool)', icon: 'gradient', run: () => toVector('grad') }, { label: 'Vector shapes (the same pixels, one shape per color)', icon: 'pen', run: () => toVector('colors') }]); }, { cls: 'sm', title: 'Turn this gradient into a vector drawing you can edit' }) : null,
        g ? W.btn('Done', () => { S.pxGradSel = null; S.pxStop = null; SB.invalidate('ctxbar'); SB.dirty(); }, { cls: 'sm ghost' }) : null,
        W.info(['Pixel art: drag across an area. Its pixels (the joined ones of one color, as the screen shows them) get the colors, from where you press to where you let go. Shift: level or upright.',
          'Then change it: drag the ends or the line on the stage, slide the color dots, double-click the line for another color. Click a gradient you made to edit it again.',
          'Normal: plain bands (Steps). Dithering: a checker pattern between the bands, like old games. Halftone: dots that grow from one color into the next (Dot size).',
          'To vector turns it into a vector drawing: a smooth gradient you can keep editing, or one shape per color.'], 'Pixel gradient')];
    };
  }

  // ---------- the panel: Pixel art for this screen
  if (SB.inspector) (SB.inspector.project = SB.inspector.project || []).push(() => {
    const p = S.project, on = PX.on(), z = PX.size();
    return SB.fields.section('Pixel art', [
      W.row('', W.check(on, 'This screen is pixel art', v => PX.set({ on: v }))),
      on ? W.row('Size', sizeSelect()) : null,
      on ? W.row('Pixels across', W.num(z.w, { min: 8, max: 1024, step: 1, label: 'Pixels across the screen (any number)', change: v => PX.set({ w: U.clamp(Math.round(+v || z.w), 8, 1024) }) }), h('span.hint', null, `× ${z.h} down`)) : null,
      on ? W.row('Each pixel', W.num(U.r2(z.cs), { min: 1, max: p.w / 8, step: 0.5, label: 'Screen px per pixel (the pixel ratio)', change: v => PX.set({ w: U.clamp(Math.round(p.w / Math.max(1, +v || z.cs)), 8, 1024) }) }), h('span.hint', null, 'screen px')) : null,
      on ? W.row('', W.check(p.pixel.hard !== false, 'Sharp edges (each pixel on or off)', v => PX.set({ hard: v }))) : null,
      h('p.hint', null, on ? `${z.w} × ${z.h} pixels; each one is ${U.r1(z.cs)} screen px. Everything on this screen turns into pixels, on the stage and in exports. Draw with the Pixel brush (Shift+B).`
        : 'Turn it on to make everything on this screen pixels on one grid (shapes, text and drawings too), then draw with the Pixel brush (Shift+B).'),
    ], { key: 'pixelart', closed: !on });
  });
})(window.SB);
