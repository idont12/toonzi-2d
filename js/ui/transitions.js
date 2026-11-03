/* Designed transitions: animate how a layer arrives (or leaves) on a small timeline.
   0% is the layer gone, 100% the layer as it normally is. As an In transition it plays forward
   at the start of the clip; as an Out transition it plays backward at the end.

   A transition { id, name, kind: 'in' | 'out', dur, layer, shapes } has tracks of keys { t, … }:
     layer   the whole layer: x, y (move, in units of the layer's longer side), sx, sy (scale),
             rot (degrees), op (opacity 0–1), blur (px)
     shapes  [{ id, kind: 'ellipse'|'rect'|'triangle'|'path', mode, keys, pts? }]
             a 'path' (drawn, or made with the pen) has pts [[u, q, hu?, hq?]]: corners from -1 to 1
             inside its box, with an optional curve handle (the line leaves along +h, arrives along -h)
             mode 'show'  only what is inside the show shapes is drawn (a mask)
                  'cut'   what is inside is cut away
                  'piece' that part of the layer becomes a piece that moves on its own
             keys: x, y, w, h, rot (the shape, from the layer's center, in units of its longer side)
                   and for pieces px, py (move), prot (turn), ps (scale), pop (opacity)
   Between keys values ease smoothly; before the first key and after the last they hold.
   Saved in the project (S.doc.transitions); each one is the effect 'tr:<id>'. The scene calls
   SB.transitions.composite() on the layer's own canvas (js/render/scene.js). */
'use strict';
(function (SB) {
  const U = SB.util, S = SB.state, h = U.h, W = SB.w, G = SB.paths;
  const smooth = u => u * u * (3 - 2 * u);
  const DEF = { x: 0, y: 0, w: 0.5, h: 0.5, rot: 0, sx: 1, sy: 1, op: 1, blur: 0, px: 0, py: 0, prot: 0, ps: 1, pop: 1 };
  const LAYER_P = ['x', 'y', 'sx', 'sy', 'rot', 'op', 'blur'], SHAPE_P = ['x', 'y', 'w', 'h', 'rot'], PIECE_P = ['px', 'py', 'prot', 'ps', 'pop'];

  /** Values of a track at t. */
  function at(track, t) {
    const ks = (track && track.keys) || [], out = Object.assign({}, DEF); if (!ks.length) return out;
    const val = (k, p) => k[p] ?? DEF[p], props = Object.keys(DEF);
    if (t <= ks[0].t) { props.forEach(p => out[p] = val(ks[0], p)); return out; } const last = ks[ks.length - 1]; if (t >= last.t) { props.forEach(p => out[p] = val(last, p)); return out; }
    let i = 0; while (i < ks.length - 2 && t > ks[i + 1].t) i++; const a = ks[i], b = ks[i + 1], u = SB.tracks.easeOf(a)((t - a.t) / Math.max(1e-6, b.t - a.t));
    props.forEach(p => out[p] = U.lerp(val(a, p), val(b, p), u)); return out;
  }
  const modeOf = sh => sh.mode || 'show';
  /** Add the outline of shape sh at t to the path (layer coordinates; cx, cy the layer's center, D its longer side). */
  function shapePath(c, sh, t, cx, cy, D, v = at(sh, t)) {
    const w = Math.abs(v.w) * D / 2, hh = Math.abs(v.h) * D / 2, a = (v.rot || 0) * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a), X0 = cx + v.x * D, Y0 = cy + v.y * D;
    if (w < 0.01 || hh < 0.01) return;
    const P = (px, py) => [X0 + px * ca - py * sa, Y0 + px * sa + py * ca];
    if (sh.kind === 'ellipse') { const [sx, sy] = P(w, 0); c.moveTo(sx, sy); c.ellipse(X0, Y0, w, hh, a, 0, Math.PI * 2); c.closePath(); return; }
    if (sh.kind === 'path' && sh.pts) { traceLoop(c, sh.pts, (u, q) => P(u * w, q * hh), true); return; } // a shape you drew: points from -1 to 1 inside its box
    const pts = sh.kind === 'triangle' ? [[0, -hh], [w, hh], [-w, hh]] : [[-w, -hh], [w, -hh], [w, hh], [-w, hh]];
    pts.forEach(([px, py], i) => { const [x, y] = P(px, py); i ? c.lineTo(x, y) : c.moveTo(x, y); }); c.closePath();
  }
  /** Trace points [x, y, hx?, hy?] (a point with h is round: the curve leaves along +h and arrives along -h). */
  function traceLoop(c, pts, map, closed) {
    const n = pts.length; if (!n) return; const [x0, y0] = map(pts[0][0], pts[0][1]); c.moveTo(x0, y0);
    for (let i = 1; i < (closed ? n + 1 : n); i++) {
      const a = pts[i - 1], b = pts[i % n], [bx, by] = map(b[0], b[1]);
      if (a.length > 2 || b.length > 2) { const [c1x, c1y] = map(a[0] + (a[2] || 0), a[1] + (a[3] || 0)), [c2x, c2y] = map(b[0] - (b[2] || 0), b[1] - (b[3] || 0)); c.bezierCurveTo(c1x, c1y, c2x, c2y, bx, by); }
      else c.lineTo(bx, by);
    }
    if (closed) c.closePath();
  }
  /** Round handles along the line between each point's neighbours (Catmull-Rom). */
  const roundAll = pts => pts.map((p, i) => { const a = pts[(i - 1 + pts.length) % pts.length], b = pts[(i + 1) % pts.length]; return [p[0], p[1], U.r3((b[0] - a[0]) / 6), U.r3((b[1] - a[1]) / 6)]; });
  const geo = b => { const bw = b.x1 - b.x0, bh = b.y1 - b.y0; return { cx: b.x0 + bw / 2, cy: b.y0 + bh / 2, D: Math.max(bw, bh, 1) }; };
  /** Where a piece goes: around its own center it moves, turns and scales. */
  function pieceM(v, cx, cy, D) { const sx = cx + v.x * D, sy = cy + v.y * D; return new DOMMatrix().translateSelf(sx + v.px * D, sy + v.py * D).rotateSelf(v.prot).scaleSelf(v.ps, v.ps).translateSelf(-sx, -sy); }
  const fresh = (key, Wd, Ht) => { const c = U.poolCtx(Wd, Ht, key); c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1; c.filter = 'none'; c.clearRect(0, 0, Wd, Ht); return c; };
  /** Masks, cuts and pieces on a layer drawn alone on canvas cv. M: layer coordinates → canvas pixels, b: the layer's box. */
  function composite(cv, M, b, tr, t) {
    if (!b || !tr.shapes || !tr.shapes.length) return cv;
    const { cx, cy, D } = geo(b), Wd = cv.width, Ht = cv.height, shows = tr.shapes.filter(s => modeOf(s) === 'show'), holes = tr.shapes.filter(s => modeOf(s) !== 'show'), pieces = tr.shapes.filter(s => modeOf(s) === 'piece');
    const L = fresh(':trA', Wd, Ht); L.drawImage(cv, 0, 0);
    const fillShapes = (list, op) => { L.save(); L.setTransform(M); L.globalCompositeOperation = op; L.beginPath(); list.forEach(sh => shapePath(L, sh, t, cx, cy, D)); L.fillStyle = '#000'; L.fill(); L.restore(); };
    if (shows.length) fillShapes(shows, 'destination-in');
    if (holes.length) fillShapes(holes, 'destination-out'); // cuts are gone, pieces leave the body and move on their own
    for (const sh of pieces) {
      const v = at(sh, t), P = pieceM(v, cx, cy, D), MP = M.multiply(P);
      L.save(); L.setTransform(MP); L.beginPath(); shapePath(L, sh, t, cx, cy, D, v); L.clip();
      L.setTransform(MP.multiply(M.inverse())); L.globalAlpha = U.clamp(v.pop, 0, 1); L.drawImage(cv, 0, 0); L.restore();
    }
    return L.canvas;
  }
  /** The layer track applied to a render state (move, scale, turn, fade, blur). */
  function applyLayer(r, T, t, o, sc) {
    if (!T.layer || !T.layer.keys || !T.layer.keys.length) return; const v = at(T.layer, t), b = SB.scene.bounds(o), D = b ? Math.max(b.x1 - b.x0, b.y1 - b.y0) : 200;
    r.x += v.x * D * Math.abs(r.sx); r.y += v.y * D * Math.abs(r.sy); r.sx *= v.sx; r.sy *= v.sy; r.rot += v.rot; r.opacity *= U.clamp(v.op, 0, 1);
    if (v.blur > 0.05) r.filters.push(`blur(${(v.blur * (sc || 1)).toFixed(2)}px)`);
  }

  // ---------- effects: every designed transition is a transition like the built-in ones
  const find = id => (S.doc.transitions || []).find(x => x.id === id);
  function sync() {
    const list = S.doc.transitions || [];
    SB.effects.where(d => d.id.startsWith('tr:') && !list.some(t => 'tr:' + t.id === d.id)).forEach(d => SB.effects.remove(d.id));
    list.forEach(tr => SB.effect({ id: 'tr:' + tr.id, label: tr.name + ' ★', cat: tr.kind, params: ['dur'], defaultDur: tr.dur || 0.8, designed: true,
      apply(r, x) { const T = find(tr.id); if (!T || x.u >= 1) return; applyLayer(r, T, x.u, x.o, x.sc); r.trx = { tr: T, t: x.u }; } }));
    SB.invalidate && SB.invalidate('inspector');
  }
  SB.on('doc', sync);

  // ---------- presets (0 = gone, 1 = as normal)
  const K = (t, o) => Object.assign({ t }, o);
  const shp = (kind, mode, keys) => ({ id: U.uid(), kind, mode, keys });
  const lay = keys => ({ keys });
  const PRESETS = {
    pop: ['Pop and spin', () => ({ layer: lay([K(0, { sx: 0, sy: 0, rot: -120, op: 0 }), K(0.7, { sx: 1.12, sy: 1.12, rot: 6, op: 1 }), K(1, {})]), shapes: [] })],
    rise: ['Rise and unblur', () => ({ layer: lay([K(0, { y: 0.35, op: 0, blur: 18 }), K(1, {})]), shapes: [] })],
    stretch: ['Slide and stretch', () => ({ layer: lay([K(0, { x: -1.2, sx: 1.6, sy: 0.7 }), K(0.7, { x: 0.05, sx: 0.9, sy: 1.1 }), K(1, {})]), shapes: [] })],
    iris: ['Iris (circle mask)', () => ({ layer: lay([]), shapes: [shp('ellipse', 'show', [K(0, { w: 0, h: 0 }), K(1, { w: 1.5, h: 1.5 })])] })],
    wipe: ['Wipe (box mask)', () => ({ layer: lay([]), shapes: [shp('rect', 'show', [K(0, { x: -1.1, w: 1.1, h: 1.1 }), K(1, { x: 0, w: 1.1, h: 1.1 })])] })],
    blinds: ['Blinds', () => ({ layer: lay([]), shapes: [-0.4, -0.2, 0, 0.2, 0.4].map((y, i) => shp('rect', 'show', [K(i * 0.08, { y, w: 1.1, h: 0 }), K(0.6 + i * 0.08, { y, w: 1.1, h: 0.21 })])) })],
    split: ['Split in two (pieces)', () => ({ layer: lay([K(0, { op: 0 }), K(0.25, {})]), shapes: [shp('rect', 'piece', [K(0, { x: -0.27, w: 0.56, h: 1.1, px: -0.7, prot: -12 }), K(1, { x: -0.27, w: 0.56, h: 1.1 })]), shp('rect', 'piece', [K(0, { x: 0.27, w: 0.56, h: 1.1, px: 0.7, prot: 12 }), K(1, { x: 0.27, w: 0.56, h: 1.1 })])] })],
    shatter: ['Four pieces fly in', () => ({ layer: lay([]), shapes: [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b], i) => shp('rect', 'piece', [K(0, { x: a * 0.25, y: b * 0.15, w: 0.505, h: 0.31, px: a * 0.6, py: b * 0.5, prot: a * b * 40, ps: 0.5, pop: 0 }), K(0.5 + i * 0.1, { x: a * 0.25, y: b * 0.15, w: 0.505, h: 0.31 })])) })],
    hole: ['Hole closes (cut)', () => ({ layer: lay([]), shapes: [shp('ellipse', 'cut', [K(0, { w: 1.6, h: 1.6 }), K(1, { w: 0, h: 0 })])] })],
  };

  // ---------- the designer
  const CW = 520, CH = 300, BOX = { x0: 150, y0: 85, x1: 370, y1: 215 }; // the sample layer inside the preview
  const LABELS = { x: 'Move X', y: 'Move Y', sx: 'Scale X %', sy: 'Scale Y %', rot: 'Rotation', op: 'Opacity %', blur: 'Blur', w: 'Width', h: 'Height', px: 'Move X', py: 'Move Y', prot: 'Turn', ps: 'Scale %', pop: 'Opacity %' };
  const PCT = new Set(['sx', 'sy', 'op', 'ps', 'pop']);
  function open(tr0, onSaved) {
    const base = { id: U.uid(), name: `Transition ${(S.doc.transitions || []).length + 1}`, kind: 'in', dur: 0.8, layer: lay([]), shapes: [] };
    const tr = tr0 ? Object.assign(base, U.deep(tr0)) : Object.assign(base, PRESETS.pop[1]()); if (!tr.layer) tr.layer = lay([]); tr.shapes.forEach(s => s.mode = modeOf(s));
    let t = tr0 ? 1 : 0.5, sel = 'layer', pieceEdit = 'shape', playing = 0, drawing = null; // drawing: { mode, tool: 'draw' | 'pen', pts } while you draw a shape
    let drawSmooth = 50, ptEdit = false, selPt = -1; // smoothing of the Draw tool (0–100); editing the points of a drawn shape
    // undo inside the designer (Ctrl+Z / Ctrl+Shift+Z)
    const hist = [], snapNow = () => JSON.stringify(tr); let hi = -1;
    const remember = () => { const s0 = snapNow(); if (hist[hi] === s0) return; hist.splice(hi + 1); hist.push(s0); if (hist.length > 80) hist.shift(); hi = hist.length - 1; };
    const restore = d => { if (hi + d < 0 || hi + d >= hist.length) return; hi += d; const o = JSON.parse(hist[hi]); Object.keys(tr).forEach(k => delete tr[k]); Object.assign(tr, o); if (sel !== 'layer' && !tr.shapes.some(x => x.id === sel)) sel = 'layer'; render(true); };
    const onKey = e => { if (drawing && e.key === 'Enter') { e.preventDefault(); return finishDrawing(); } if (drawing && e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); drawing = null; return render(); } if (e.target.closest('input,textarea,select')) return;
      if (ptEdit && selPt >= 0 && (e.key === 'Delete' || e.key === 'Backspace')) { const sh = track(); e.preventDefault(); e.stopPropagation(); if (sh && sh.pts && sh.pts.length > 3) { sh.pts.splice(selPt, 1); selPt = -1; render(); } else SB.toast('A shape needs at least three points.'); return; }
      if (!(e.ctrlKey || e.metaKey)) return; const k = e.key.toLowerCase(); if (k === 'z') { e.preventDefault(); e.stopPropagation(); restore(e.shiftKey ? 1 : -1); } else if (k === 'y') { e.preventDefault(); e.stopPropagation(); restore(1); } };
    addEventListener('keydown', onKey, true);
    const dpr = Math.min(2, devicePixelRatio || 1), cv = h('canvas.td-cv', { width: CW * dpr, height: CH * dpr }), c = cv.getContext('2d');
    const bw = BOX.x1 - BOX.x0, bh = BOX.y1 - BOX.y0, D = Math.max(bw, bh), CX = BOX.x0 + bw / 2, CY = BOX.y0 + bh / 2;
    const card = h('canvas', { width: CW * dpr, height: CH * dpr }), cc = card.getContext('2d');
    const track = () => sel === 'layer' ? tr.layer : tr.shapes.find(s => s.id === sel);
    /** Layer coordinates → preview pixels with the layer track applied at t. */
    const layerM = (v = at(tr.layer, t)) => new DOMMatrix().translateSelf(CX + v.x * D, CY + v.y * D).rotateSelf(v.rot).scaleSelf(v.sx, v.sy).translateSelf(-CX, -CY);
    /** Change the selected track at the playhead: a key there is updated, otherwise one is added. */
    function setAt(trk, vals) { let k = trk.keys.find(q => Math.abs(q.t - t) < 0.012); if (!k) { const cur = at(trk, t); k = { t: U.r3(t) }; (trk === tr.layer ? LAYER_P : SHAPE_P.concat(PIECE_P)).forEach(p => k[p] = U.r3(cur[p])); trk.keys.push(k); trk.keys.sort((a, b) => a.t - b.t); } for (const p in vals) k[p] = U.r3(vals[p]); }
    function drawCard(ctx, alpha) { ctx.save(); ctx.globalAlpha = alpha; const g = ctx.createLinearGradient(BOX.x0, BOX.y0, BOX.x1, BOX.y1); g.addColorStop(0, '#7B5CFF'); g.addColorStop(1, '#FF4F8B'); ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(BOX.x0, BOX.y0, bw, bh, 16); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = '600 26px Lexend, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('Your layer', CX, CY); ctx.restore(); }
    function draw() {
      c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, CW, CH); drawCard(c, 0.12);
      const v = at(tr.layer, t), LM = new DOMMatrix().scaleSelf(dpr, dpr).multiply(layerM(v));
      cc.setTransform(1, 0, 0, 1, 0, 0); cc.clearRect(0, 0, card.width, card.height); cc.setTransform(LM); drawCard(cc, 1);
      const out = composite(card, LM, BOX, tr, t);
      c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = U.clamp(v.op, 0, 1); if (v.blur > 0.05) c.filter = `blur(${(v.blur * dpr).toFixed(1)}px)`; c.drawImage(out, 0, 0); c.restore();
      // outlines: the layer box, every shape (a piece also where it is now)
      const LMc = layerM(v); c.save(); c.setTransform(new DOMMatrix().scaleSelf(dpr, dpr).multiply(LMc)); c.lineWidth = 1.5 / Math.max(0.2, Math.abs(v.sx));
      c.setLineDash(sel === 'layer' ? [] : [5, 4]); c.strokeStyle = sel === 'layer' ? '#5B3DF5' : 'rgba(91,61,245,.35)'; c.strokeRect(BOX.x0, BOX.y0, bw, bh);
      tr.shapes.forEach(sh => { const sv = at(sh, t), on = sh.id === sel, col = { show: '#E8730C', cut: '#E5484D', piece: '#0F8F82' }[modeOf(sh)]; c.strokeStyle = col; c.globalAlpha = on ? 1 : 0.55; c.setLineDash(on ? [] : [5, 4]);
        c.beginPath(); shapePath(c, sh, t, CX, CY, D, sv); c.stroke();
        if (modeOf(sh) === 'piece') { c.save(); const pm = pieceM(sv, CX, CY, D); c.transform(pm.a, pm.b, pm.c, pm.d, pm.e, pm.f); c.setLineDash([2, 3]); c.beginPath(); shapePath(c, sh, t, CX, CY, D, sv); c.stroke(); c.restore(); } });
      c.restore();
      handles().forEach(([x, y, kind]) => { c.setTransform(dpr, 0, 0, dpr, 0, 0); c.beginPath(); kind === 'rot' ? c.arc(x, y, 6, 0, Math.PI * 2) : c.rect(x - 5, y - 5, 10, 10); c.fillStyle = '#fff'; c.fill(); c.strokeStyle = sel === 'layer' ? '#5B3DF5' : '#E8730C'; c.lineWidth = 2; c.stroke(); });
      if (drawing && drawing.pts.length) {
        const M2 = new DOMMatrix().scaleSelf(dpr, dpr).multiply(layerM()), pen = drawing.tool === 'pen'; c.save(); c.setTransform(M2); c.strokeStyle = '#E8730C'; c.lineWidth = 2; c.setLineDash([5, 4]);
        c.beginPath(); traceLoop(c, drawing.pts, (x, y) => [x, y], false); c.stroke(); c.setLineDash([]);
        if (pen) drawing.pts.forEach((p, i) => { c.beginPath(); c.arc(p[0], p[1], i ? 3.5 : 5, 0, Math.PI * 2); c.fillStyle = i ? '#E8730C' : '#fff'; c.fill(); if (!i) c.stroke(); if (p.length > 2 && i === drawing.pts.length - 1) { c.beginPath(); c.moveTo(p[0] - p[2], p[1] - p[3]); c.lineTo(p[0] + p[2], p[1] + p[3]); c.lineWidth = 1; c.stroke(); [1, -1].forEach(k => { c.beginPath(); c.arc(p[0] + k * p[2], p[1] + k * p[3], 3, 0, Math.PI * 2); c.fillStyle = '#fff'; c.fill(); c.stroke(); }); } });
        c.restore();
      }
      if (ptEdit) { const ph = ptHandles(); c.save(); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.strokeStyle = '#E8730C'; c.lineWidth = 1.5;
        ph.filter(q => q.kind === 'hd').forEach(q => { c.beginPath(); c.moveTo(q.ax, q.ay); c.lineTo(q.x, q.y); c.stroke(); c.beginPath(); c.arc(q.x, q.y, 4.5, 0, Math.PI * 2); c.fillStyle = '#fff'; c.fill(); c.stroke(); });
        ph.filter(q => q.kind === 'pt').forEach(q => { c.beginPath(); c.rect(q.x - 4.5, q.y - 4.5, 9, 9); c.fillStyle = q.i === selPt ? '#E8730C' : '#fff'; c.fill(); c.stroke(); }); c.restore(); }
      drawTracks();
    }
    /** Handles of what is selected, in preview pixels: four corners and a turn dot. */
    function handles() {
      if (ptEdit) return [];
      const v = at(tr.layer, t), LM = layerM(v), T = p => { const q = LM.transformPoint(new DOMPoint(p[0], p[1])); return [q.x, q.y]; };
      let quad, top;
      if (sel === 'layer') { quad = [[BOX.x0, BOX.y0], [BOX.x1, BOX.y0], [BOX.x1, BOX.y1], [BOX.x0, BOX.y1]]; top = [CX, BOX.y0 - 22 / Math.max(0.2, Math.abs(v.sy))]; }
      else { const sh = track(); if (!sh) return []; const sv = at(sh, t), M2 = modeOf(sh) === 'piece' && pieceEdit === 'motion' ? pieceM(sv, CX, CY, D) : new DOMMatrix(), a = sv.rot * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a), X0 = CX + sv.x * D, Y0 = CY + sv.y * D, w = Math.abs(sv.w) * D / 2, hh = Math.abs(sv.h) * D / 2;
        const P = (px, py) => { const q = M2.transformPoint(new DOMPoint(X0 + px * ca - py * sa, Y0 + px * sa + py * ca)); return [q.x, q.y]; }; quad = [P(-w, -hh), P(w, -hh), P(w, hh), P(-w, hh)]; top = P(0, -hh - 20); }
      return [...quad.map(p => [...T(p), 'size']), [...T(top), 'rot']];
    }
    // drawing your own shape: click to add corners, or drag to draw freely; double-click, Enter or Finish ends it
    function finishDrawing() {
      const d = drawing; drawing = null; if (!d || d.pts.length < 3) { render(); return; }
      let P = d.pts;
      if (d.tool === 'draw') { // freehand: smooth the hand movement, keep fewer points, then make it round
        const sm = drawSmooth / 100; let f = G.smoothPts(P.flat(), Math.round(sm * 4), true); f = G.rdp(f, 0.6 + sm * 5, true); if (f.length < 6) f = P.flat();
        P = []; for (let i = 0; i < f.length; i += 2) P.push([f[i], f[i + 1]]); if (sm > 0.04) P = roundAll(P);
      }
      d.pts = P; const xs = d.pts.map(p => p[0]), ys = d.pts.map(p => p[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys), w = Math.max(1, x1 - x0), hh = Math.max(1, y1 - y0);
      const s1 = shp('path', d.mode, [K(U.r3(t), { x: U.r3(((x0 + x1) / 2 - CX) / D), y: U.r3(((y0 + y1) / 2 - CY) / D), w: U.r3(w / D), h: U.r3(hh / D) })]);
      s1.pts = d.pts.map(p => { const q = [U.r3((p[0] - (x0 + x1) / 2) / (w / 2)), U.r3((p[1] - (y0 + y1) / 2) / (hh / 2))]; if (p.length > 2) q.push(U.r3(p[2] / (w / 2)), U.r3(p[3] / (hh / 2))); return q; });
      tr.shapes.push(s1); sel = s1.id; pieceEdit = 'shape'; render();
    }
    // editing the points of a drawn shape: its own -1..1 space ↔ preview pixels
    function shapeM(sh) { const sv = at(sh, t), w = Math.abs(sv.w) * D / 2, hh = Math.abs(sv.h) * D / 2; if (w < 0.5 || hh < 0.5) return null; return layerM().translate(CX + sv.x * D, CY + sv.y * D).rotate(sv.rot || 0).scale(w, hh); }
    function ptHandles() {
      const sh = track(), m = sh && sh.pts && shapeM(sh); if (!m) return []; const out = [], T = (u, q) => { const r = m.transformPoint(new DOMPoint(u, q)); return [r.x, r.y]; };
      sh.pts.forEach((p, i) => { const [x, y] = T(p[0], p[1]); out.push({ x, y, kind: 'pt', i }); if (p.length > 2 && (i === selPt || sh.pts.length < 9)) [1, -1].forEach(s => { const [hx, hy] = T(p[0] + s * p[2], p[1] + s * p[3]); out.push({ x: hx, y: hy, kind: 'hd', i, s, ax: x, ay: y }); }); });
      return out;
    }
    /** Click on the outline: a new point there (on a curve, its handle follows the curve). */
    function insertAt(sh, m, px, py) {
      const n = sh.pts.length; let best = null;
      for (let i = 0; i < n; i++) {
        const a = sh.pts[i], b = sh.pts[(i + 1) % n], P0 = [a[0], a[1]], P1 = [a[0] + (a[2] || 0), a[1] + (a[3] || 0)], P2 = [b[0] - (b[2] || 0), b[1] - (b[3] || 0)], P3 = [b[0], b[1]];
        for (let j = 1; j < 24; j++) { const s = j / 24, z = 1 - s, f = k => z * z * z * P0[k] + 3 * z * z * s * P1[k] + 3 * z * s * s * P2[k] + s * s * s * P3[k], q = m.transformPoint(new DOMPoint(f(0), f(1))), d = Math.hypot(q.x - px, q.y - py); if (d < 7 && (!best || d < best.d)) best = { d, i, s, P0, P1, P2, P3 }; }
      }
      if (!best) return -1; const { s, P0, P1, P2, P3 } = best, L = (A, B) => [A[0] + (B[0] - A[0]) * s, A[1] + (B[1] - A[1]) * s];
      const Q0 = L(P0, P1), Q1 = L(P1, P2), Q2 = L(P2, P3), R0 = L(Q0, Q1), R1 = L(Q1, Q2), S0 = L(R0, R1), a = sh.pts[best.i], b = sh.pts[(best.i + 1) % n];
      const np = [U.r3(S0[0]), U.r3(S0[1])]; if (a.length > 2 || b.length > 2) np.push(U.r3((R1[0] - R0[0]) / 2), U.r3((R1[1] - R0[1]) / 2));
      sh.pts.splice(best.i + 1, 0, np); return best.i + 1;
    }
    cv.addEventListener('dblclick', e => {
      if (drawing) return finishDrawing();
      if (!ptEdit) return; const r = cv.getBoundingClientRect(), k = CW / r.width, px = (e.clientX - r.left) * k, py = (e.clientY - r.top) * k, sh = track();
      const hit = ptHandles().find(q => q.kind === 'pt' && Math.hypot(q.x - px, q.y - py) < 9); if (!hit || !sh) return;
      const p = sh.pts[hit.i]; if (p.length > 2) p.length = 2; else { const rp = roundAll(sh.pts)[hit.i]; p.push(rp[2], rp[3]); } selPt = hit.i; render();
    });
    cv.addEventListener('pointerdown', e => {
      if (drawing) { e.preventDefault(); const r0 = cv.getBoundingClientRect(), k0 = CW / r0.width, inv = layerM().inverse(), toL = ev => { const q = inv.transformPoint(new DOMPoint((ev.clientX - r0.left) * k0, (ev.clientY - r0.top) * k0)); return [U.r1(q.x), U.r1(q.y)]; };
        const p0 = toL(e), d = drawing; cv.setPointerCapture(e.pointerId);
        if (d.tool === 'pen') { // click: a sharp corner, click and drag: a round point (drag sets its curve)
          if (d.pts.length > 2 && Math.hypot(p0[0] - d.pts[0][0], p0[1] - d.pts[0][1]) < 8) return finishDrawing();
          const last = d.pts[d.pts.length - 1]; let p = last; if (!last || Math.hypot(p0[0] - last[0], p0[1] - last[1]) > 2) { p = p0; d.pts.push(p); } draw();
          const mv = ev => { const q = toL(ev); if (Math.hypot(q[0] - p[0], q[1] - p[1]) > 3) { p[2] = U.r1(q[0] - p[0]); p[3] = U.r1(q[1] - p[1]); } else p.length = 2; draw(); };
          const up = () => { cv.removeEventListener('pointermove', mv); cv.removeEventListener('pointerup', up); render(); }; cv.addEventListener('pointermove', mv); cv.addEventListener('pointerup', up); return;
        }
        d.pts = [p0]; draw(); // draw: one stroke is the outline; letting go closes it
        const mv = ev => { (ev.getCoalescedEvents ? ev.getCoalescedEvents() : [ev]).forEach(ce => { const q = toL(ce), l = d.pts[d.pts.length - 1]; if (Math.hypot(q[0] - l[0], q[1] - l[1]) > 2) d.pts.push(q); }); draw(); };
        const up = () => { cv.removeEventListener('pointermove', mv); cv.removeEventListener('pointerup', up); if (d.pts.length >= 3) finishDrawing(); else { d.pts = []; draw(); } }; cv.addEventListener('pointermove', mv); cv.addEventListener('pointerup', up); return; }
      const r = cv.getBoundingClientRect(), k = CW / r.width, pxy = ev => [(ev.clientX - r.left) * k, (ev.clientY - r.top) * k], [px, py] = pxy(e);
      if (ptEdit) { // drag a point or a curve handle; click the outline to add a point
        const sh = track(), m = sh && sh.pts && shapeM(sh);
        if (m) {
          const ph = ptHandles(); let hit = ph.find(q => q.kind === 'hd' && Math.hypot(q.x - px, q.y - py) < 8) || ph.find(q => q.kind === 'pt' && Math.hypot(q.x - px, q.y - py) < 9);
          if (!hit) { const i = insertAt(sh, m, px, py); if (i >= 0) hit = { kind: 'pt', i }; }
          if (hit) {
            e.preventDefault(); cv.setPointerCapture(e.pointerId); selPt = hit.i; const p = sh.pts[hit.i], inv = m.inverse(); draw();
            const mv = ev => { const [qx, qy] = pxy(ev), q = inv.transformPoint(new DOMPoint(qx, qy)); if (hit.kind === 'pt') { p[0] = U.r3(q.x); p[1] = U.r3(q.y); } else { p[2] = U.r3((q.x - p[0]) * hit.s); p[3] = U.r3((q.y - p[1]) * hit.s); } draw(); };
            const up = () => { cv.removeEventListener('pointermove', mv); cv.removeEventListener('pointerup', up); render(); }; cv.addEventListener('pointermove', mv); cv.addEventListener('pointerup', up); return;
          }
          selPt = -1;
        }
      }
      const v0 = at(tr.layer, t), LMinv = layerM(v0).inverse(), toLayer = (x, y) => { const q = LMinv.transformPoint(new DOMPoint(x, y)); return [q.x, q.y]; };
      let mode = null; const hs = handles(), hit = hs.find(([x, y]) => Math.hypot(x - px, y - py) < 11); if (hit) mode = hit[2];
      if (!mode) { // pick what is under the pointer: a shape, else the layer
        const [lx, ly] = toLayer(px, py); c.save(); c.setTransform(1, 0, 0, 1, 0, 0);
        const sh = tr.shapes.slice().reverse().find(s => { c.beginPath(); shapePath(c, s, t, CX, CY, D); if (c.isPointInPath(lx, ly)) return true; if (modeOf(s) !== 'piece') return false; c.save(); const m = pieceM(at(s, t), CX, CY, D); c.setTransform(m); c.beginPath(); shapePath(c, s, t, CX, CY, D); const hitP = c.isPointInPath(lx, ly); c.restore(); return hitP; });
        c.restore(); sel = sh ? sh.id : 'layer'; mode = 'move'; render();
      }
      e.preventDefault(); cv.setPointerCapture(e.pointerId);
      const trk = track(), s0 = Object.assign({}, at(trk, t)), [lx0, ly0] = toLayer(px, py), piece = sel !== 'layer' && modeOf(trk) === 'piece' && pieceEdit === 'motion';
      const mv = ev => {
        const [qx, qy] = pxy(ev), [lx, ly] = toLayer(qx, qy);
        if (sel === 'layer') {
          if (mode === 'move') setAt(trk, { x: s0.x + (qx - px) / D, y: s0.y + (qy - py) / D });
          else if (mode === 'rot') { const m = layerM(s0), cxy = m.transformPoint(new DOMPoint(CX, CY)); let d = Math.atan2(qy - cxy.y, qx - cxy.x) * 180 / Math.PI + 90; if (ev.shiftKey) d = Math.round(d / 15) * 15; setAt(trk, { rot: d }); }
          else { const m = new DOMMatrix().rotateSelf(-s0.rot), cxy = layerM(s0).transformPoint(new DOMPoint(CX, CY)), q = m.transformPoint(new DOMPoint(qx - cxy.x, qy - cxy.y)); let sx = Math.abs(q.x) / (bw / 2), sy = Math.abs(q.y) / (bh / 2); if (ev.shiftKey) { const m2 = Math.max(sx, sy); sx = sy = m2; } setAt(trk, { sx, sy }); }
        } else if (piece) {
          const cxs = CX + s0.x * D, cys = CY + s0.y * D;
          if (mode === 'move') setAt(trk, { px: s0.px + (lx - lx0) / D, py: s0.py + (ly - ly0) / D });
          else if (mode === 'rot') { let d = Math.atan2(ly - (cys + s0.py * D), lx - (cxs + s0.px * D)) * 180 / Math.PI + 90 - s0.rot; if (ev.shiftKey) d = Math.round(d / 15) * 15; setAt(trk, { prot: d }); }
          else { const d0 = Math.hypot(lx0 - (cxs + s0.px * D), ly0 - (cys + s0.py * D)) || 1, d1 = Math.hypot(lx - (cxs + s0.px * D), ly - (cys + s0.py * D)); setAt(trk, { ps: Math.max(0, s0.ps * d1 / d0) }); }
        } else {
          if (mode === 'move') setAt(trk, { x: s0.x + (lx - lx0) / D, y: s0.y + (ly - ly0) / D });
          else if (mode === 'rot') { let d = Math.atan2(ly - (CY + s0.y * D), lx - (CX + s0.x * D)) * 180 / Math.PI + 90; if (ev.shiftKey) d = Math.round(d / 15) * 15; setAt(trk, { rot: d }); }
          else { const a = -s0.rot * Math.PI / 180, dx = (lx - CX) / D - s0.x, dy = (ly - CY) / D - s0.y; let w = Math.abs(dx * Math.cos(a) - dy * Math.sin(a)) * 2, hh = Math.abs(dx * Math.sin(a) + dy * Math.cos(a)) * 2; if (ev.shiftKey || (trk.kind === 'ellipse' && Math.abs(s0.w - s0.h) < 1e-3 && !ev.altKey)) { const m = Math.max(w, hh); w = hh = m; } setAt(trk, { w, h: hh }); }
        }
        draw();
      };
      const up = () => { cv.removeEventListener('pointermove', mv); cv.removeEventListener('pointerup', up); render(); };
      cv.addEventListener('pointermove', mv); cv.addEventListener('pointerup', up);
    });
    // ---------- timeline: one row per track with its keys
    const tracksEl = h('div.td-tracks'), side = h('div.td-side'), bar = h('div.td-bar'), fields = h('div.td-fields');
    const rowName = sh => sh === tr.layer ? 'Layer' : `${{ ellipse: 'Circle', rect: 'Box', triangle: 'Triangle', path: 'Drawn shape' }[sh.kind]} ${tr.shapes.indexOf(sh) + 1} · ${{ show: 'mask', cut: 'cut', piece: 'piece' }[modeOf(sh)]}`;
    function drawTracks() {
      const rows = [tr.layer, ...tr.shapes].map(trk => { const id = trk === tr.layer ? 'layer' : trk.id;
        const lane = h('div.td-lane', null, ...trk.keys.map((k, ki) => h('button.td-key' + (Math.abs(k.t - t) < 0.012 && id === sel ? '.on' : '') + (k.e && k.e !== 'smooth' ? '.eased' : ''), { type: 'button', title: `Key at ${Math.round(k.t * 100)}%. Drag to move it, right-click for its easing`, style: { left: k.t * 100 + '%' }, dataset: { tk: id, ki } })));
        return h('div.td-row' + (id === sel ? '.on' : ''), { dataset: { id } }, h('button.td-name', { type: 'button', onclick: () => { sel = id; render(); } }, rowName(trk)), lane); });
      tracksEl.replaceChildren(h('div.td-row.td-ruler', null, h('span.td-name', null, `${Math.round(t * 100)}%`), h('div.td-lane', null, h('i.td-ph', { style: { left: t * 100 + '%' } }))), ...rows);
      tracksEl.querySelectorAll('.td-lane').forEach(l => l.appendChild(h('i.td-ph', { style: { left: t * 100 + '%' } })));
    }
    const keyOf = el => { const trk = el.dataset.tk === 'layer' ? tr.layer : tr.shapes.find(x => x.id === el.dataset.tk); return trk ? [trk, trk.keys[+el.dataset.ki]] : [null, null]; };
    // drag a key along its row to change when it happens; a click without moving goes to it
    tracksEl.addEventListener('pointerdown', e => {
      const kb = e.target.closest('.td-key'); if (!kb || e.button === 2) return; e.preventDefault(); e.stopPropagation(); const [trk, k] = keyOf(kb); if (!k) return;
      const lane = kb.parentElement, r = lane.getBoundingClientRect(), x0 = e.clientX; let moved = false; tracksEl.setPointerCapture(e.pointerId);
      const mv = ev => { if (Math.abs(ev.clientX - x0) > 3) moved = true; if (!moved) return; k.t = U.r3(U.clamp((ev.clientX - r.left) / r.width, 0, 1)); kb.style.left = k.t * 100 + '%'; t = k.t; draw(); };
      const up = () => { tracksEl.removeEventListener('pointermove', mv); tracksEl.removeEventListener('pointerup', up); trk.keys.sort((a, b) => a.t - b.t); sel = kb.dataset.tk; t = k.t; render(); };
      tracksEl.addEventListener('pointermove', mv); tracksEl.addEventListener('pointerup', up);
    }, true);
    // right-click a key: its easing (how it moves on to the next key)
    tracksEl.addEventListener('contextmenu', e => {
      const kb = e.target.closest('.td-key'); if (!kb) return; e.preventDefault(); const [trk, k] = keyOf(kb); if (!k) return; sel = kb.dataset.tk; t = k.t; render();
      const E = SB.tracks.EASES, cur = k.e || 'smooth';
      SB.menu.open(e.clientX, e.clientY, [{ head: `Key at ${Math.round(k.t * 100)}%` }, ...['smooth', 'linear', 'easeIn', 'easeOut', 'back', 'bounce', 'elastic', 'hold'].map(id => ({ label: (cur === id ? '✓ ' : '') + E[id].label, run: () => { k.e = id; delete k.bz; delete k.bzp; render(); } })),
        '-', { label: (cur === 'bez' ? '✓ ' : '') + 'Custom curve…', icon: 'curve', run: () => SB.curves.open([k], { x: e.clientX, y: e.clientY, onChange: draw }) }, '-', { label: 'Delete key', icon: 'trash', run: () => { trk.keys = trk.keys.filter(q => q !== k); render(); } }]);
    });
    tracksEl.addEventListener('pointerdown', e => { const lane = e.target.closest('.td-lane'); if (!lane || e.target.closest('.td-key')) return; const r = lane.getBoundingClientRect(), set = ev => { t = U.r3(U.clamp((ev.clientX - r.left) / r.width, 0, 1)); draw(); }; set(e); tracksEl.setPointerCapture(e.pointerId); const up = () => { tracksEl.removeEventListener('pointermove', set); tracksEl.removeEventListener('pointerup', up); render(); }; tracksEl.addEventListener('pointermove', set); tracksEl.addEventListener('pointerup', up); });
    function play() { cancelAnimationFrame(playing); const t0 = performance.now(), d = (tr.dur || 0.8) * 1000; const step = now => { t = U.clamp((now - t0) / d, 0, 1); draw(); if (t < 1) playing = requestAnimationFrame(step); else { playing = 0; render(); } }; playing = requestAnimationFrame(step); }
    let addKind = 'ellipse';
    const add = mode => { if (addKind === 'draw' || addKind === 'pen') { drawing = { mode, tool: addKind, pts: [] }; ptEdit = false; render(); SB.toast(addKind === 'pen' ? 'Click for sharp corners, click and drag for curves. Click the first point, double-click or press Enter to close.' : 'Draw the outline in one stroke. Letting go closes the shape.'); return; } const s = shp(addKind, mode, [K(U.r3(t), { w: 0.4, h: 0.4 })]); tr.shapes.push(s); sel = s.id; pieceEdit = 'shape'; render(); };
    /** Number boxes for the selected track at the playhead. */
    function drawFields() {
      const trk = track(); if (!trk) return fields.replaceChildren();
      const v = at(trk, t), props = trk === tr.layer ? LAYER_P : modeOf(trk) === 'piece' ? (pieceEdit === 'motion' ? PIECE_P : SHAPE_P) : SHAPE_P;
      fields.replaceChildren(...props.map(p => { const mul = PCT.has(p) ? 100 : ['x', 'y', 'w', 'h', 'px', 'py'].includes(p) ? 100 : 1, inp = W.num(U.r2(v[p] * mul), { step: 1, label: LABELS[p], change: n => { setAt(trk, { [p]: n / mul }); render(); } });
        return h('label.td-f', { title: ['x', 'y', 'w', 'h', 'px', 'py'].includes(p) ? '% of the layer’s longer side' : '' }, h('span', null, LABELS[p]), inp); }));
    }
    let lastSel = sel;
    function render(fromUndo) {
      if (sel !== lastSel) { lastSel = sel; pieceEdit = 'shape'; ptEdit = false; selPt = -1; }
      { const s0 = track(); if (!s0 || !s0.pts || s0.kind !== 'path' || pieceEdit === 'motion') ptEdit = false; }
      if (!fromUndo) remember();
      const trk = track(), key = trk && trk.keys.find(q => Math.abs(q.t - t) < 0.012);
      bar.replaceChildren(W.iconBtn(playing ? 'pause' : 'play', 'Play the transition', play, 'sm'), h('span.hint', null, '0% gone · 100% as normal'), h('span.spacer'),
        trk ? W.btn(key ? 'Delete key' : 'Add key', () => { if (key) trk.keys = trk.keys.filter(q => q !== key); else setAt(trk, {}); render(); }, { cls: 'sm ghost', icon: 'key' }) : null);
      const presetSel = W.select('', [['', 'Start from a preset…'], ...Object.entries(PRESETS).map(([k, v]) => [k, v[0]])], v => { if (!v) return; Object.assign(tr, PRESETS[v][1]()); if (/^Transition \d+$/.test(tr.name)) tr.name = PRESETS[v][0].replace(/ \(.*\)/, ''); sel = 'layer'; render(); }, 'Preset');
      const nameIn = h('input', { type: 'text', value: tr.name, 'aria-label': 'Name' }); nameIn.oninput = () => tr.name = nameIn.value;
      const sh = trk && trk !== tr.layer ? trk : null;
      side.replaceChildren(...[W.row('Name', nameIn), W.row('Kind', W.seg(tr.kind, [['in', 'In', 'Plays forward at the start of the clip'], ['out', 'Out', 'Plays backward at the end of the clip']], v => { tr.kind = v; render(); })),
        W.row('Length s', W.num(tr.dur || 0.8, { min: 0.1, max: 6, step: 0.1, label: 'Length', change: v => tr.dur = U.clamp(v, 0.1, 6) })), h('div.td-preset', null, presetSel),
        h('h4.subh', null, 'Add a shape'), W.seg(addKind, [['ellipse', 'sEllipse', 'Circle'], ['rect', 'sRect', 'Box'], ['triangle', 'sTriangle', 'Triangle'], ['draw', 'brush', 'Draw: one freehand stroke'], ['pen', 'pen', 'Pen: click for corners, drag for curves']], v => { addKind = v; render(); }),
        addKind === 'draw' ? W.row('Smoothing', W.range(drawSmooth, { min: 0, max: 100, label: 'Smoothing', input: v => drawSmooth = v })) : null,
        drawing ? h('div.row.td-drawing', null, h('span.hint', null, drawing.tool === 'pen' ? `Pen · ${{ show: 'mask', cut: 'cut', piece: 'piece' }[drawing.mode]}: ${drawing.pts.length} points` : `Draw the ${{ show: 'mask', cut: 'cut', piece: 'piece' }[drawing.mode]} on the preview`), drawing.tool === 'pen' ? W.btn('Finish', finishDrawing, { cls: 'sm primary' }) : null, W.btn('Cancel', () => { drawing = null; render(); }, { cls: 'sm ghost' }))
          : h('div.row', null, W.btn('Mask', () => add('show'), { cls: 'sm', icon: 'mask', title: 'A shape that shows only what is inside it' }), W.btn('Cut', () => add('cut'), { cls: 'sm', icon: 'split', title: 'A shape that cuts away what is inside it' }), W.btn('Piece', () => add('piece'), { cls: 'sm', icon: 'sRect', title: 'A part of the layer that moves on its own' })),
        h('h4.subh', null, sel === 'layer' ? 'Layer at the playhead' : rowName(trk)),
        sh ? h('div.row', null, W.seg(sh.kind, [['ellipse', 'sEllipse', 'Circle'], ['rect', 'sRect', 'Box'], ['triangle', 'sTriangle', 'Triangle']].concat(sh.pts ? [['path', 'pen', 'The shape you drew']] : []), v => { sh.kind = v; render(); }), W.seg(modeOf(sh), [['show', 'Mask'], ['cut', 'Cut'], ['piece', 'Piece']], v => { sh.mode = v; render(); })) : null,
        sh && modeOf(sh) === 'piece' ? h('div.row', null, h('span.hint', null, 'Edit'), W.seg(pieceEdit, [['shape', 'Its shape'], ['motion', 'Its motion']], v => { pieceEdit = v; render(); })) : null,
        sh && sh.kind === 'path' && sh.pts && pieceEdit !== 'motion' ? h('div.row', null, W.btn(ptEdit ? 'Done with points' : 'Edit points', () => { ptEdit = !ptEdit; selPt = -1; render(); }, { cls: 'sm' + (ptEdit ? ' primary' : ''), icon: 'points' }),
          ptEdit ? W.btn('Round all', () => { sh.pts = roundAll(sh.pts); render(); }, { cls: 'sm ghost', title: 'Make every point a smooth curve' }) : null,
          ptEdit ? W.btn('Sharp all', () => { sh.pts = sh.pts.map(p => p.slice(0, 2)); render(); }, { cls: 'sm ghost', title: 'Make every point a sharp corner' }) : null) : null,
        fields,
        sh ? h('div.row', null, W.btn('Duplicate', () => { const d = Object.assign(U.deep(sh), { id: U.uid() }); d.keys.forEach(k => { k.x = (k.x || 0) + 0.08; k.y = (k.y || 0) + 0.08; }); tr.shapes.push(d); sel = d.id; render(); }, { cls: 'sm ghost', icon: 'copy' }), W.btn('Delete', () => { tr.shapes = tr.shapes.filter(x => x !== sh); sel = 'layer'; render(); }, { cls: 'sm ghost', icon: 'trash' })) : null,
        h('p.hint', null, ptEdit ? 'Drag a point to move it and its round handles to bend the line. Click the outline to add a point, double-click a point to make it sharp or round, Delete removes the selected point.' : sel === 'layer' ? 'Drag the layer to move it, a corner to scale it (Shift: evenly), the dot above to turn it. Every change makes a key at the playhead.' : 'Drag to move, a corner to size (Shift keeps it round), the dot to turn. Masks show only what is inside them, cuts remove it, pieces fly on their own.')].filter(Boolean));
      drawFields(); draw();
    }
    const save = () => {
      const list = S.doc.transitions = (S.doc.transitions || []).filter(x => x.id !== tr.id); tr.name = (tr.name || '').trim() || 'My transition'; list.push(tr);
      sync(); dlg.close(); SB.commit(); SB.toast(`${tr.name} saved. Find it in Transitions (★).`); onSaved && onSaved(tr);
    };
    const dlg = SB.dialog.sheet([h('h2', null, tr0 ? `Edit ${tr0.name}` : 'Design a transition'), h('div.td', null, h('div.td-main', null, cv, bar, tracksEl), side),
      h('div.sheet-actions', null, W.btn('Cancel', () => dlg.close(), { cls: 'ghost' }), W.btn('Save transition', save, { cls: 'primary' }))], { size: 'wide', onClose: () => { cancelAnimationFrame(playing); removeEventListener('keydown', onKey, true); } });
    render();
  }
  function remove(tr) { S.doc.transitions = (S.doc.transitions || []).filter(x => x.id !== tr.id); SB.tree.all().forEach(o => { if (o.effects) o.effects = o.effects.filter(e => e.type !== 'tr:' + tr.id); }); sync(); SB.commit(); }
  function duplicate(tr) { const c = Object.assign(U.deep(tr), { id: U.uid(), name: tr.name + ' copy' }); (S.doc.transitions = S.doc.transitions || []).push(c); sync(); SB.commit(); return c; }
  SB.transitions = { at, composite, applyLayer, open, remove, duplicate, sync, PRESETS };
  sync();
})(window.SB);
