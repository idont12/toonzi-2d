/* Drawing strokes onto a canvas, and the brush presets.
   To add a brush texture: add an entry to TEXTURES with a draw(ctx, stroke, color, strokeIt) function. */
'use strict';
(function (SB) {
  /** A dashed line's dashes: dash length and space between them, as times its width (bs.dl, bs.dg; set in the brush). Round ends add half a width to each end of a dash. */
  const dashOf = s => { const b = s.bs || {}, w = Math.max(0.1, s.s || 1); return [w * (b.dl ?? 1.8), w * (b.dg ?? 1.4)]; };
  const U = SB.util, G = SB.paths, BT = () => SB.brushTex; // brushtex.js (pictures and animated lines) loads after this file

  // ---------- grain patterns for pencil and chalk
  const grain = new Map();
  function grainPattern(kind, color) {
    const key = kind + color; if (grain.has(key)) return grain.get(key);
    const n = 96, cv = document.createElement('canvas'); cv.width = cv.height = n; const x = cv.getContext('2d'), id = x.createImageData(n, n), [r, g, b] = U.hexRgb(color);
    for (let i = 0; i < n * n; i++) {
      const px = i % n, py = (i / n) | 0, h1 = (U.hash(i * 0.731) + 1) / 2, h2 = (U.noise(px * 0.18 + py * 0.07, 3) + U.noise(py * 0.21, 9)) / 2;
      const a = kind === 'pencil' ? (h1 > 0.3 ? 120 + h1 * 135 : 0) : (h2 + h1 * 0.6 > 0.15 ? 255 : 0);
      id.data.set([r, g, b, a], i * 4);
    }
    x.putImageData(id, 0, 0); const pat = U.measureCtx.createPattern(cv, 'repeat');
    if (grain.size > 60) grain.clear(); grain.set(key, pat); return pat;
  }
  const devScale = c => U.matScale(c.getTransform());
  /** A plain color for col (a gradient or pattern stands in with its main color, where a texture needs one). */
  const plain = (col, s) => typeof col === 'string' && !col.startsWith('grad:') && !col.startsWith('tex:') ? col : SB.paint.solid(s && s.c);
  /** What to paint a stroke's color key k with (a color, a gradient or a pattern over the stroke's box). */
  const paintOf = (c, s, k = 'c') => { const v = s[k]; return SB.paint.kind(v) === 'solid' ? v : SB.paint.style(c, v, G.bounds([s])); };
  const scaledPattern = (c, kind, col) => { const p = grainPattern(kind, col); if (p.setTransform) p.setTransform(new DOMMatrix().scaleSelf(1 / devScale(c), 1 / devScale(c))); return p; };

  const TEXTURES = SB.brushTextures = {
    solid: { label: 'Smooth', draw: (c, s, col, go) => go() },
    pencil: { label: 'Pencil grain', draw: (c, s, col, go) => { c.strokeStyle = scaledPattern(c, 'pencil', plain(col, s)); go(); } },
    chalk: { label: 'Chalk grain', draw: (c, s, col, go) => { c.strokeStyle = scaledPattern(c, 'chalk', plain(col, s)); c.lineCap = 'butt'; go(); } },
    marker: { label: 'Marker', draw: (c, s, col, go) => { c.globalAlpha *= 0.55; c.lineCap = 'square'; go(); } },
    soft: { label: 'Soft edge', draw: (c, s, col, go) => { c.shadowColor = plain(col, s); c.shadowBlur = s.s * 0.9 * devScale(c); c.lineWidth = s.s * 0.55; go(); } },
    dashed: { label: 'Dashed', draw: (c, s, col, go) => { c.setLineDash(dashOf(s)); go(); } },
    // pl: the polylines to draw when they were trimmed (draw-on) or bent; else the stroke's own line
    img: { label: 'Your picture', draw: (c, s, col, go) => go() }, // drawn by brushtex.js; a plain line while its picture loads
    rough: { label: 'Sketchy lines', draw: (c, s, col, go, pl) => { c.lineWidth = s.s * 0.5; for (const L of pl || [G.resampled(s)]) { if (!L || L.length < 4) continue; for (let k = 0; k < 2; k++) { pathOf(c, G.jitter(L, { amp: Math.max(1, s.s * 0.35), step: k * 7 + 1, seed: 11 + k })); c.stroke(); } } } },
  };

  // ---------- brush presets (editable in the brush editor)
  SB.BRUSH_PRESETS = [
    { id: 'pen', name: 'Pen', tx: 'solid', size: 8, op: 1, ts: 0, te: 0, jit: 0 },
    { id: 'ink', name: 'Ink', tx: 'solid', size: 12, op: 1, ts: 0.45, te: 0.7, jit: 0 },
    { id: 'brushpen', name: 'Brush pen', tx: 'solid', size: 22, op: 0.95, ts: 0.25, te: 0.6, jit: 0.06 },
    { id: 'pencil', name: 'Pencil', tx: 'pencil', size: 6, op: 0.9, ts: 0.1, te: 0.15, jit: 0 },
    { id: 'chalk', name: 'Chalk', tx: 'chalk', size: 18, op: 1, ts: 0, te: 0, jit: 0.05 },
    { id: 'marker', name: 'Marker', tx: 'marker', size: 24, op: 1, ts: 0, te: 0, jit: 0 },
    { id: 'air', name: 'Airbrush', tx: 'soft', size: 30, op: 0.8, ts: 0, te: 0, jit: 0 },
    { id: 'sketch', name: 'Sketchy', tx: 'rough', size: 6, op: 1, ts: 0, te: 0, jit: 0 },
    { id: 'dash', name: 'Dashed', tx: 'dashed', size: 6, op: 1, ts: 0, te: 0, jit: 0 },
    // picture brushes (brushtex.js) and an animated one
    { id: 'leaves', name: 'Leaves', tx: 'img', img: 'b:leaf', im: 'stamp', isp: 0.9, isc: 0.35, irot: 0.12, isz: 0.3, size: 20, op: 1, ts: 0, te: 0, jit: 0 },
    { id: 'stars', name: 'Stars', tx: 'img', img: 'b:star', im: 'stamp', isp: 1.2, isc: 0.8, irot: 0.5, isz: 0.5, size: 16, op: 1, ts: 0, te: 0, jit: 0 },
    { id: 'bristle', name: 'Dry brush', tx: 'img', img: 'b:bristle', im: 'stretch', size: 22, op: 0.95, ts: 0.15, te: 0.25, jit: 0 },
    { id: 'rope', name: 'Rope', tx: 'img', img: 'b:rope', im: 'pattern', isp: 1, size: 14, op: 1, ts: 0, te: 0, jit: 0 },
    { id: 'boil', name: 'Boiling ink', tx: 'solid', size: 9, op: 1, ts: 0.3, te: 0.4, jit: 0, an: { k: 'boil', sp: 1, a: 0.5 } },
  ];
  SB.BRUSHES_V40 = ['leaves', 'stars', 'bristle', 'rope', 'boil']; // added to older brush lists once
  SB.state.brushes = U.deep(SB.BRUSH_PRESETS);
  SB.brush = {
    current: () => SB.state.brushes.find(b => b.id === SB.state.brushId) || SB.state.brushes[0],
    /** Copy a brush's look onto a stroke. */
    apply(b, st, keepTex = true) {
      delete st.tx; delete st.bs; if (b.tx && b.tx !== 'solid') st.tx = b.tx; const bs = {}; if (b.op < 1) bs.op = b.op; if (b.ts) bs.ts = b.ts; if (b.te) bs.te = b.te; if (b.jit) bs.jit = b.jit; if (b.tx === 'dashed') { if (b.dl != null) bs.dl = b.dl; if (b.dg != null) bs.dg = b.dg; }
      if (b.tx === 'img' && b.img) { bs.img = b.img; bs.im = b.im || 'stamp'; ['isp', 'isc', 'irot', 'isz'].forEach(k => { if (b[k] != null) bs[k] = b[k]; }); if (b.ikeep) bs.ikeep = 1; if (b.ifix) bs.ifix = 1; if (SB.brushTex && keepTex) SB.brushTex.keep(b.img); } // the picture goes into the project with the line
      if (b.an && b.an.k) bs.an = Object.assign({}, b.an);
      if (Object.keys(bs).length) st.bs = bs; G.touch(st);
    },
    /** The brush a stroke looks like (same texture and shape), or null. */
    matching(st) {
      const bs = st.bs || {}, same = (a, b) => Math.abs((a || 0) - (b || 0)) < 1e-3;
      return SB.state.brushes.find(b => (b.tx || 'solid') === (st.tx || 'solid') && same(b.op < 1 ? b.op : 0, bs.op) && same(b.ts, bs.ts) && same(b.te, bs.te) && same(b.jit, bs.jit) && (b.tx !== 'img' || b.img === bs.img) && ((b.an && b.an.k) || '') === ((bs.an && bs.an.k) || '')) || null;
    },
    /** A sample line drawn with brush b on canvas cv. T: time (animated brushes); press: show pen pressure (thin to thick). */
    preview(cv, b, color, T = 0, press = false) {
      const c = cv.getContext('2d'), W = cv.width, H = cv.height; c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, W, H);
      const pts = []; for (let i = 0; i <= 40; i++) { const u = i / 40; pts.push(U.r1(W * 0.08 + u * W * 0.84), U.r1(H / 2 + Math.sin(u * Math.PI * 2) * H * 0.22)); }
      const st = { c: color || '#24213F', s: Math.min(b.size, H * 0.42), pts }; SB.brush.apply(b, st, false);
      if (press && (b.pr ?? 1) > 0) st.wp = SB.brush.pressureProfile(pts, pts.map((v, i) => i % 2 ? null : 0.15 + 0.85 * Math.sin(i / pts.length * Math.PI)).filter(v => v != null), b.pr ?? 1);
      draw(c, [st], { T });
    },
    /** Pen pressure → a width profile (the same kind the Width tool makes): pr says how much pressure changes the size. */
    pressureProfile(pts, prs, pr = 1) {
      const n = pts.length / 2; if (n < 2 || prs.length < 2) return null; const a = [0]; for (let i = 1; i < n; i++) a.push(a[i - 1] + Math.hypot(pts[i * 2] - pts[i * 2 - 2], pts[i * 2 + 1] - pts[i * 2 - 1]));
      const L = a[n - 1] || 1, K = 48, out = []; let j = 0;
      for (let k = 0; k < K; k++) { const d = L * k / (K - 1); while (j < n - 2 && a[j + 1] < d) j++; const f = U.clamp((d - a[j]) / ((a[j + 1] - a[j]) || 1), 0, 1), q = (prs[j] ?? 0.5) + ((prs[j + 1] ?? prs[j] ?? 0.5) - (prs[j] ?? 0.5)) * f;
        out.push(U.r3(Math.max(0.05, 1 - pr + pr * Math.pow(U.clamp(q, 0, 1), 0.8)))); }
      return out;
    },
  };

  /** A line's animation with the layer's amount (keyframed 'lnAmt') applied; 0 stops it. */
  const scaleAn = (an, amt) => !an || !an.k ? null : amt == null || amt === 1 ? an : amt <= 0.001 ? null : Object.assign({}, an, { a: (an.a ?? 0.5) * amt });
  // ---------- drawing
  function pathOf(c, pts) {
    c.beginPath(); const n = pts.length / 2; c.moveTo(pts[0], pts[1]);
    if (n === 1) { c.lineTo(pts[0] + 0.01, pts[1]); return; }
    for (let i = 1; i < n - 1; i++) { const x = pts[i * 2], y = pts[i * 2 + 1]; c.quadraticCurveTo(x, y, (x + pts[i * 2 + 2]) / 2, (y + pts[i * 2 + 3]) / 2); }
    c.lineTo(pts[(n - 1) * 2], pts[(n - 1) * 2 + 1]);
  }
  function polyPath(c, p, close) { c.moveTo(p[0], p[1]); for (let i = 2; i < p.length; i += 2) c.lineTo(p[i], p[i + 1]); if (close) c.closePath(); }
  function taperFill(c, p, s, col, wp) {
    const n = p.length / 2; if (n < 2) return; const bs = s.bs || {}, ts = bs.ts || 0, te = bs.te || 0, arc = [0];
    for (let i = 1; i < n; i++) arc.push(arc[i - 1] + Math.hypot(p[i * 2] - p[i * 2 - 2], p[i * 2 + 1] - p[i * 2 - 1]));
    const L = arc[n - 1] || 1, Lp = [], Rp = [];
    for (let i = 0; i < n; i++) {
      const u = arc[i] / L; let k = 1; if (ts) k = Math.min(k, Math.pow(Math.min(1, u / ts), 0.6)); if (te) k = Math.min(k, Math.pow(Math.min(1, (1 - u) / te), 0.6));
      if (wp) k *= G.prof(wp, u); const w = s.s * Math.max(wp ? 0.02 : 0.08, k) / 2, a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1); let dx = p[b * 2] - p[a * 2], dy = p[b * 2 + 1] - p[a * 2 + 1]; const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
      Lp.push(p[i * 2] - dy * w, p[i * 2 + 1] + dx * w); Rp.push(p[i * 2] + dy * w, p[i * 2 + 1] - dx * w);
    }
    c.beginPath(); c.moveTo(Lp[0], Lp[1]); for (let i = 2; i < Lp.length; i += 2) c.lineTo(Lp[i], Lp[i + 1]); for (let i = Rp.length - 2; i >= 0; i -= 2) c.lineTo(Rp[i], Rp[i + 1]); c.closePath();
    c.fillStyle = (s.tx === 'pencil' || s.tx === 'chalk') ? scaledPattern(c, s.tx, plain(col, s)) : col;
    if (s.tx === 'marker') c.globalAlpha *= 0.55;
    if (s.tx === 'soft') { c.shadowColor = plain(col, s); c.shadowBlur = s.s * 0.6 * devScale(c); }
    c.fill();
    if (wp && (!ts || !te)) { c.beginPath(); // round ends
      if (!ts) { const r = s.s * Math.max(0.02, G.prof(wp, 0)) / 2; c.moveTo(p[0] + r, p[1]); c.arc(p[0], p[1], r, 0, Math.PI * 2); }
      if (!te) { const r = s.s * Math.max(0.02, G.prof(wp, 1)) / 2, x = p[(n - 1) * 2], y = p[(n - 1) * 2 + 1]; c.moveTo(x + r, y); c.arc(x, y, r, 0, Math.PI * 2); }
      c.fill(); }
  }

  /** Dashed and sketchy lines with changing width (pen pressure, thin ends, the Width tool): drawn in short pieces,
      each as wide as the line is there, so they keep their look (a filled outline would lose it). */
  function varStroke(c, p, s, col, wp) {
    const n = p.length / 2; if (n < 2) return; const bs = s.bs || {}, ts = bs.ts || 0, te = bs.te || 0, arc = [0];
    for (let i = 1; i < n; i++) arc.push(arc[i - 1] + Math.hypot(p[i * 2] - p[i * 2 - 2], p[i * 2 + 1] - p[i * 2 - 1]));
    const L = arc[n - 1] || 1, K = arc.map(d => { const u = d / L; let k = 1; if (ts) k = Math.min(k, Math.pow(Math.min(1, u / ts), 0.6)); if (te) k = Math.min(k, Math.pow(Math.min(1, (1 - u) / te), 0.6)); if (wp) k *= G.prof(wp, u); return Math.max(0.04, k); });
    const rough = s.tx === 'rough', lines = rough ? [0, 1].map(k => G.jitter(p, { amp: Math.max(1, s.s * 0.35), step: k * 7 + 1, seed: 11 + k })) : [p], wk = rough ? 0.5 : 1;
    c.strokeStyle = col; c.lineCap = 'round'; c.lineJoin = 'round'; if (s.tx === 'dashed') c.setLineDash(dashOf(s));
    for (const q of lines) for (let i = 0; i < n - 1; ) {
      let j = i + 1; while (j < n - 1 && arc[j] - arc[i] < Math.max(2, s.s * 0.5) && Math.abs(K[j] - K[i]) < 0.08) j++;
      c.beginPath(); c.moveTo(q[i * 2], q[i * 2 + 1]); for (let m = i + 1; m <= j; m++) c.lineTo(q[m * 2], q[m * 2 + 1]);
      c.lineWidth = s.s * wk * (K[i] + K[j]) / 2; if (s.tx === 'dashed') c.lineDashOffset = arc[i]; c.stroke(); i = j;
    }
    c.setLineDash([]);
  }
  /**
   * Draw strokes. opt: { tint, skipErase, boil, map(x,y)->[x,y], prog (0..1 draw-on), dash {T,amt} }
   */
  function draw(c, strokes, opt = {}) {
    if (!strokes || !strokes.length) return;
    c.lineCap = 'round'; c.lineJoin = 'round';
    const { tint, boil, map, dash } = opt, prog = opt.prog ?? 1, T = opt.T || 0;
    let budget = Infinity, fillA = 1;
    if (prog < 1) { const tot = strokes.reduce((a, s) => a + (s.f || s.er ? 0 : G.lines(s).reduce((q, L) => q + G.length(L), 0)), 0); budget = tot * Math.min(1, prog / 0.85); fillA = U.clamp((prog - 0.75) / 0.25, 0, 1); }
    for (const s of strokes) {
      if (s.f) { // bucket fill
        if (!s.loops || !s.loops.length || fillA <= 0) continue;
        c.save(); c.globalAlpha *= fillA; c.fillStyle = tint || paintOf(c, s); c.beginPath();
        for (const L of s.loops) { let p = L; if (boil) p = G.jitter(p, boil); if (map) p = G.mapList(G.densify(p, 12, true), map); polyPath(c, p, true); }
        c.fill('evenodd'); c.restore(); continue;
      }
      if (s.b) { budget = drawPath(c, s, opt, budget, fillA, T); continue; }
      const bs = s.er ? {} : (s.bs || {}), an = scaleAn(bs.an, opt.amt), Tl = bs.an && bs.an.fz != null ? bs.an.fz : T /* fz: a baked frame shows one moment of the animation */, img = !s.er && s.tx === 'img', col = tint || (s.er ? s.c : paintOf(c, s));
      let wp = s.er ? null : s.wp; if (an && an.k === 'pulse') wp = BT().pulse(wp, an, Tl);
      const taper = !!(bs.ts || bs.te || wp);
      let p = null;
      if (boil || map || budget < Infinity || taper || bs.jit || an || img) {
        p = G.resampled(s);
        if (bs.jit) p = G.jitter(p, { amp: Math.max(0.5, s.s * bs.jit), step: 0, seed: 7 });
        if (an) p = BT().animate(p, s, Tl, an);
        if (boil) p = G.jitter(p, boil); if (map) p = G.mapList(G.densify(p), map);
        if (budget < Infinity && !s.er) { const L = G.length(p); if (budget <= 0.01) continue; if (budget < L) { p = G.trim(p, budget); budget = 0; } else budget -= L; }
      }
      c.save();
      if (s.er) { if (opt.skipErase) { c.restore(); continue; } c.globalCompositeOperation = 'destination-out'; c.strokeStyle = '#000'; }
      else { c.strokeStyle = col; if (bs.op != null && bs.op < 1) c.globalAlpha *= bs.op; }
      c.lineWidth = s.s;
      if (img && BT().drawLine(c, s, plain(col, s), p, wp, Tl, an)) { c.restore(); continue; }
      if (taper && !s.er) { if (s.tx === 'dashed' || s.tx === 'rough') varStroke(c, p, s, col, wp); else taperFill(c, p, s, col, wp); c.restore(); continue; }
      pathOf(c, p || s.pts);
      if (an && !dash) BT().march(c, s, Tl, an);
      if (dash && !s.er) { const a = Math.max(0.2, dash.amt); c.setLineDash([s.s * 2.2 * a, s.s * 1.6 * a]); c.lineDashOffset = -dash.T * s.s * 6; }
      (TEXTURES[s.tx] || TEXTURES.solid).draw(c, s, col, () => c.stroke(), p ? [p] : null);
      c.restore();
    }
    c.globalCompositeOperation = 'source-over';
  }
  function drawPath(c, s, opt, budget, fillA, T) {
    const { tint, boil, map, dash } = opt, col = tint || (s.c && paintOf(c, s)), fill = tint || (s.fc && paintOf(c, s, 'fc'));
    const simple = !boil && !map && budget === Infinity; let trimmed = null;
    c.save(); if (s.op != null && s.op < 1) c.globalAlpha *= s.op;
    if (simple) { c.beginPath(); G.trace(c, s.subs); }
    else { c.beginPath(); for (const L of G.lines(s)) { let p = L; if (boil) p = G.jitter(p, boil); if (map) p = G.mapList(G.densify(p), map); polyPath(c, p, false); } }
    if (fill && fillA > 0) { c.save(); c.globalAlpha *= fillA; const ft = s.ftx; // ftx: a fill made from a textured line keeps the brush's look
      c.fillStyle = ft === 'pencil' || ft === 'chalk' ? scaledPattern(c, ft, plain(fill, { c: s.fc })) : fill; if (ft === 'marker') c.globalAlpha *= 0.55; if (ft === 'soft') { c.shadowColor = plain(fill, { c: s.fc }); c.shadowBlur = (s.ftw || 6) * 0.6 * devScale(c); }
      c.fill(s.fr === 'evenodd' ? 'evenodd' : 'nonzero'); c.restore(); }
    const outline = s.s > 0 && col;
    if (outline || (budget < Infinity && fill)) {
      if (budget < Infinity) { // draw-on: trim the outline
        c.beginPath(); trimmed = [];
        for (const L of G.lines(s)) { if (budget <= 0.01) break; let p = L; if (boil) p = G.jitter(p, boil); if (map) p = G.mapList(G.densify(p), map); const len = G.length(p); if (budget < len) p = G.trim(p, budget); budget -= len; polyPath(c, p, false); trimmed.push(p); }
        if (!outline) c.globalAlpha *= 1 - fillA; // fill-only shapes draw on with a thin line in their color
      }
      c.lineWidth = outline ? s.s : 3; c.strokeStyle = outline ? col : fill; c.lineJoin = s.lj || 'round'; c.lineCap = s.lc || 'round';
      const bs = outline ? (s.bs || {}) : {};
      if (bs.op != null && bs.op < 1) c.globalAlpha *= bs.op;
      const wps = outline && s.subs.some(sb => sb.wp), an = outline ? scaleAn(bs.an, opt.amt) : null, img = outline && s.tx === 'img', Tl = bs.an && bs.an.fz != null ? bs.an.fz : T;
      if ((bs.ts || bs.te || bs.jit || wps || an || img) && (budget === Infinity || an || img)) { // a brush with thin ends, wobble, a picture or an animation, or widths set with the Width tool: drawn along the flattened path, like a freehand line
        const lines = trimmed || G.lines(s);
        for (const [li, L] of lines.entries()) { let wp = wps ? (s.subs[li] || {}).wp : null; if (an && an.k === 'pulse') wp = BT().pulse(wp, an, Tl);
          let p = G.densify(L, Math.max(2, s.s * 0.6)); if (!trimmed) { if (bs.jit) p = G.jitter(p, { amp: Math.max(0.5, s.s * bs.jit), step: 0, seed: 7 }); if (boil) p = G.jitter(p, boil); if (map) p = G.mapList(p, map); } if (an) p = BT().animate(p, s, Tl, an);
          if (img && BT().drawLine(c, s, plain(col, s), p, wp, Tl, an)) continue;
          if (bs.ts || bs.te || wp) { if (s.tx === 'dashed' || s.tx === 'rough') varStroke(c, p, s, col, wp); else taperFill(c, p, s, col, wp); } else { c.beginPath(); polyPath(c, p, false); if (an) BT().march(c, s, Tl, an); (TEXTURES[s.tx] || TEXTURES.solid).draw(c, s, col, () => c.stroke()); }
        }
        c.restore(); return budget;
      }
      if (s.dash) c.setLineDash(s.dash); else if (bs.an) BT().march(c, s, Tl, scaleAn(bs.an, opt.amt));
      if (dash) { const a = Math.max(0.2, dash.amt); c.setLineDash([s.s * 2.2 * a, s.s * 1.6 * a]); c.lineDashOffset = -dash.T * s.s * 6; }
      (TEXTURES[s.tx] || TEXTURES.solid).draw(c, s, col, () => c.stroke(), trimmed || (!simple ? G.lines(s).map(L => map ? G.mapList(G.densify(L), map) : L) : G.lines(s)));
    } else if (budget < Infinity) budget -= G.lines(s).reduce((q, L) => q + G.length(L), 0);
    c.restore();
    return budget;
  }
  SB.strokes = { draw, pathOf, polyPath, grainPattern, taperFill };
})(window.SB);
