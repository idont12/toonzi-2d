/* Image brushes (your own textures) and animated lines.
   A picture for a brush is kept by id in S.brushTex (this device's brush library) and copied into S.doc.brushTex
   (the project) as soon as a line uses it, so the drawing keeps its look anywhere: { src (data URL), w, h, name }.
   A line drawn with it has tx: 'img' and bs: { img (id), im (mode), isp (spacing), isc (scatter), irot (turn), isz (size change), ikeep (own colors) }.
     'stamp'    copies of the picture along the line (Illustrator's scatter brush)
     'stretch'  one picture bent along the whole line (an art brush)
     'pattern'  the picture repeats along the line, bending with it (a pattern brush)
     'grain'    the picture fills the line like a paper texture
   Animated lines: bs.an = { k, sp (speed), a (amount) } with k:
     'boil' (the line redraws by hand a few times a second), 'march' (dashes run along it),
     'pulse' (a wave of thickness travels along it), 'flow' (its texture slides along it). */
'use strict';
(function (SB) {
  const U = SB.util, S = SB.state, G = SB.paths;
  const imgs = new Map(), tints = new Map();
  const texOf = id => (S.doc && S.doc.brushTex && S.doc.brushTex[id]) || (S.brushTex && S.brushTex[id]) || (id && id.startsWith('b:') ? builtIn()[id] : null) || null;
  /** The decoded picture for id, or null while it loads (the stage redraws when it is ready). */
  function image(id) {
    const t = texOf(id); if (!t) return null; let e = imgs.get(id);
    if (!e || e.src !== t.src) { const img = new Image(); e = { img, ok: false, src: t.src }; imgs.set(id, e); img.onload = () => { e.ok = true; tints.clear(); SB.stamp++; if (SB.dirty) SB.dirty(); if (SB.invalidate) SB.invalidate('frames', 'ctxbar'); }; img.src = t.src; }
    return e.ok ? e.img : null;
  }
  /** The picture recolored with the line's color (its shape and soft edges stay; its own colors go). */
  function tint(id, img, col) {
    const key = id + col; let cv = tints.get(key); if (cv) return cv;
    cv = document.createElement('canvas'); cv.width = img.naturalWidth || img.width; cv.height = img.naturalHeight || img.height; const x = cv.getContext('2d');
    x.drawImage(img, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = col; x.fillRect(0, 0, cv.width, cv.height);
    if (tints.size > 120) tints.clear(); tints.set(key, cv); return cv;
  }
  /** Copy a brush picture into the project (lines that use it keep it). */
  function keep(id) { const t = (S.brushTex && S.brushTex[id]) || (id && id.startsWith('b:') ? builtIn()[id] : null); if (!t) return; S.doc.brushTex = S.doc.brushTex || {}; if (!S.doc.brushTex[id]) S.doc.brushTex[id] = Object.assign({}, t); }
  /** A file (image) → a texture id in this device's library. The picture is scaled down to at most 256 px. */
  function fromFile(file) {
    return new Promise((res, rej) => {
      const r = new FileReader(); r.onerror = rej;
      r.onload = () => { const img = new Image(); img.onerror = () => rej(new Error('That file is not a picture.')); img.onload = () => {
        const k = Math.min(1, 256 / Math.max(img.width, img.height)), w = Math.max(1, Math.round(img.width * k)), h = Math.max(1, Math.round(img.height * k)), cv = document.createElement('canvas'); cv.width = w; cv.height = h; cv.getContext('2d').drawImage(img, 0, 0, w, h);
        let src = cv.toDataURL('image/webp', 0.92); if (!src.startsWith('data:image/webp')) src = cv.toDataURL('image/png');
        const id = 'tx' + U.uid(); S.brushTex = Object.assign({}, S.brushTex, { [id]: { src, w, h, name: (file.name || 'Texture').replace(/\.[a-z0-9]+$/i, '') } }); res(id); }; img.src = r.result; };
      r.readAsDataURL(file);
    });
  }
  /** Made-up pictures to start from (no file needed): a dot, a star, a leaf, a bristle streak, a rope link. */
  function builtins() {
    const make = (name, w, h, paint) => { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const x = cv.getContext('2d'); x.fillStyle = '#000'; x.strokeStyle = '#000'; paint(x, w, h); return { name, src: cv.toDataURL('image/png'), w, h }; };
    return {
      'b:dot': make('Soft dot', 64, 64, (x, w) => { const g = x.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.6, 'rgba(0,0,0,.6)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, w, w); }),
      'b:star': make('Star', 64, 64, x => { x.beginPath(); for (let i = 0; i < 10; i++) { const r = i % 2 ? 12 : 30, a = -Math.PI / 2 + i * Math.PI / 5; x.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r); } x.closePath(); x.fill(); }),
      'b:leaf': make('Leaf', 96, 48, x => { x.beginPath(); x.moveTo(4, 24); x.quadraticCurveTo(48, -8, 92, 24); x.quadraticCurveTo(48, 56, 4, 24); x.fill(); x.globalCompositeOperation = 'destination-out'; x.lineWidth = 2; x.beginPath(); x.moveTo(8, 24); x.lineTo(88, 24); x.stroke(); }),
      'b:bristle': make('Bristles', 256, 48, (x, w, h) => { for (let i = 0; i < 16; i++) { const y = 4 + (h - 8) * i / 15, a = 0.35 + 0.65 * ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1; x.globalAlpha = a; x.lineWidth = 2.6 + (i % 3) * 1.1; x.lineCap = 'round'; x.beginPath(); x.moveTo(6 + (i * 7) % 18, y); x.bezierCurveTo(w * 0.3, y + Math.sin(i) * 3, w * 0.7, y - Math.cos(i) * 3, w - 6 - (i * 11) % 24, y); x.stroke(); } }),
      'b:pencil': make('Pencil grain', 96, 96, (x, w) => grainInto(x, w, 'pencil')), 'b:chalk': make('Chalk grain', 96, 96, (x, w) => grainInto(x, w, 'chalk')),
      'b:rope': make('Rope', 32, 32, x => { x.lineWidth = 13; x.beginPath(); x.moveTo(-8, 30); x.lineTo(24, -2); x.moveTo(8, 34); x.lineTo(40, 2); x.stroke(); x.globalCompositeOperation = 'destination-out'; x.lineWidth = 1.6; x.beginPath(); x.moveTo(-4, 34); x.lineTo(30, 0); x.stroke(); }),
    };
  }
  /** The pencil and chalk grain (as in strokes.js) as a black picture, so they can be used like any other texture. */
  function grainInto(x, n, kind) {
    const id = x.createImageData(n, n);
    for (let i = 0; i < n * n; i++) { const px = i % n, py = (i / n) | 0, h1 = (U.hash(i * 0.731) + 1) / 2, h2 = (U.noise(px * 0.18 + py * 0.07, 3) + U.noise(py * 0.21, 9)) / 2; id.data[i * 4 + 3] = kind === 'pencil' ? (h1 > 0.3 ? 120 + h1 * 135 : 0) : (h2 + h1 * 0.6 > 0.15 ? 255 : 0); }
    x.putImageData(id, 0, 0);
  }
  let BUILT = null; const builtIn = () => BUILT || (BUILT = builtins());
  /** A canvas → a texture id in this device's library (scaled down to 256 px, trimmed to what is drawn). */
  function fromCanvas(src, name) {
    const sx = src.getContext('2d').getImageData(0, 0, src.width, src.height).data; let x0 = src.width, y0 = src.height, x1 = -1, y1 = -1;
    for (let y = 0; y < src.height; y++) for (let x = 0; x < src.width; x++) if (sx[(y * src.width + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < 0) return null; const bw = x1 - x0 + 1, bh = y1 - y0 + 1, k = Math.min(1, 256 / Math.max(bw, bh)), w = Math.max(1, Math.round(bw * k)), h = Math.max(1, Math.round(bh * k)), cv = document.createElement('canvas'); cv.width = w; cv.height = h; cv.getContext('2d').drawImage(src, x0, y0, bw, bh, 0, 0, w, h);
    let data = cv.toDataURL('image/webp', 0.92); if (!data.startsWith('data:image/webp')) data = cv.toDataURL('image/png');
    const id = 'tx' + U.uid(); S.brushTex = Object.assign({}, S.brushTex, { [id]: { src: data, w, h, name: name || 'Picture' } }); return id;
  }
  /** A layer as it looks now (its frame on screen, without its position or effects) → a texture id. */
  function fromLayer(o) {
    const def = SB.types.get(o.type), lt = SB.tree.localTime(o), v = SB.scene.viewOf(o, lt), fi = o.frames && o.frames.length ? SB.frames.index(o, lt) : 0, fr = (o.frames && o.frames[fi]) || { strokes: [] };
    const b = SB.scene.bounds(v, lt, fi); if (!b || !isFinite(b.x0)) return null; const pad = 2, w = b.x1 - b.x0 + pad * 2, h = b.y1 - b.y0 + pad * 2, k = Math.min(4, 512 / Math.max(w, h));
    const cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round(w * k)); cv.height = Math.max(1, Math.round(h * k)); const c = cv.getContext('2d'); c.setTransform(k, 0, 0, k, (pad - b.x0) * k, (pad - b.y0) * k);
    const st = SB.fx.state(v, lt, SB.tracks.transform(o, lt), { noFx: true }); if (def.draw) def.draw.call(def, c, v, fr, st, {}); SB.strokes.draw(c, fr.strokes, {});
    return fromCanvas(cv, o.name);
  }

  // ---------- walking along a line
  function arcOf(p) { const n = p.length / 2, a = new Float64Array(n); for (let i = 1; i < n; i++) a[i] = a[i - 1] + Math.hypot(p[i * 2] - p[i * 2 - 2], p[i * 2 + 1] - p[i * 2 - 1]); return a; }
  /** Point and direction at distance d along p (a is its running length). j: a hint where to start looking. */
  function at(p, a, d, j = 0) {
    const n = a.length; if (j >= n - 1) j = 0; if (a[j] > d) j = 0; while (j < n - 2 && a[j + 1] < d) j++;
    const seg = a[j + 1] - a[j] || 1e-6, f = U.clamp((d - a[j]) / seg, 0, 1), x0 = p[j * 2], y0 = p[j * 2 + 1], x1 = p[j * 2 + 2], y1 = p[j * 2 + 3];
    return { x: x0 + (x1 - x0) * f, y: y0 + (y1 - y0) * f, ang: Math.atan2(y1 - y0, x1 - x0), j };
  }
  /** How thick the line is at u (0…1 along it): thin start and end, its width profile. */
  function widthK(s, u, wp) {
    const bs = s.bs || {}; let k = 1; if (bs.ts) k = Math.min(k, Math.pow(Math.min(1, u / bs.ts), 0.6)); if (bs.te) k = Math.min(k, Math.pow(Math.min(1, (1 - u) / bs.te), 0.6));
    return Math.max(0.04, wp ? k * G.prof(wp, u) : k);
  }
  const rnd = (i, seed) => { const v = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453; return v - Math.floor(v); };

  /** Draw a line p (flat x,y list) with its image brush. wp: width profile, T: time (for 'flow' and 'boil'). Returns false when the picture isn't there (yet). */
  function drawLine(c, s, col, p, wp, T = 0, anim) {
    const bs = s.bs || {}, img0 = image(bs.img); if (!img0 || p.length < 4) return false;
    const img = bs.ikeep ? img0 : tint(bs.img, img0, col), iw = img.width, ih = img.height, ar = iw / ih, a = arcOf(p), L = a[a.length - 1]; if (L < 0.5) return true;
    const mode = bs.im || 'stamp', size = s.s, base = c.getTransform(), an = anim !== undefined ? anim : bs.an, speed = an ? an.sp ?? 1 : 0, flow = an && an.k === 'flow' ? T * speed * size * 3 : 0, boilSeed = an && an.k === 'boil' ? Math.floor(T * 8 * (speed || 1)) : 0;
    const place = (x, y, ang) => c.setTransform(base.translate(x, y).rotate(ang * 180 / Math.PI));
    if (mode === 'grain') { // the picture as a repeating texture inside the line
      const pat = c.createPattern(img, 'repeat'); if (pat.setTransform) pat.setTransform(new DOMMatrix().translate(flow, 0).scale(size / ih * 1.5)); c.strokeStyle = c.fillStyle = pat;
      if (bs.ts || bs.te || wp) SB.strokes.taperFill(c, p, s, pat, wp); else { c.lineWidth = size; SB.strokes.pathOf(c, p); c.stroke(); }
      return true;
    }
    if (mode === 'stamp') { // copies along the line
      const sp = Math.max(1, size * (bs.isp ?? 0.6)), seed = 3 + boilSeed * 17; let j = 0, i = 0;
      for (let d = ((flow % sp) + sp) % sp + (flow ? 0 : sp * 0.15); d <= L; d += sp, i++) {
        const q = at(p, a, d, j); j = q.j; const k = widthK(s, d / L, wp), id = i - Math.floor(flow / sp); // each copy keeps its own size and turn while it flows
        const h = size * k * (1 + ((rnd(id, seed) - 0.5) * 2) * (bs.isz || 0)); if (h < 0.3) continue;
        const off = (rnd(id, seed + 1) - 0.5) * 2 * (bs.isc || 0) * size, ang = (bs.ifix ? 0 : q.ang) + (rnd(id, seed + 2) - 0.5) * 2 * Math.PI * (bs.irot || 0);
        place(q.x - Math.sin(q.ang) * off, q.y + Math.cos(q.ang) * off, ang); c.drawImage(img, -h * ar / 2, -h / 2, h * ar, h);
      }
      c.setTransform(base); return true;
    }
    // 'stretch' (one picture over the whole line) and 'pattern' (it repeats): thin strips of the picture, each turned along the line
    const tile = mode === 'stretch' ? L : Math.max(2, size * ar * (bs.isp ?? 1)), step = Math.max(1.5, Math.min(8, tile / 16, size / 2)); // longer strips: fewer seams; they still bend smoothly
    // Seams: strips that overlap would add up where the picture is see-through. So the picture's see-through-ness (a gray copy, white =
    // solid) is laid down strip by strip with 'lighten' (where two strips meet, the more solid one wins, nothing adds up), and the
    // colors on their own; then the gray becomes the line's see-through-ness. Very large lines skip this and just draw the strips.
    const sc = U.matScale(base) || 1, cw = c.canvas.width, chh = c.canvas.height; let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < p.length; i += 2) { const q = base.transformPoint(U.pt(p[i], p[i + 1])); x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y); }
    const m = size * sc + 4; x0 = Math.max(0, Math.floor(x0 - m)); y0 = Math.max(0, Math.floor(y0 - m)); x1 = Math.min(cw, Math.ceil(x1 + m)); y1 = Math.min(chh, Math.ceil(y1 + m));
    const bw = x1 - x0, bh = y1 - y0; if (bw <= 0 || bh <= 0) return true;
    const fine = bw * bh <= 2.5e6, A = fine ? scratch(0, bw, bh) : null, B = fine && bs.ikeep ? scratch(1, bw, bh) : null, gray = fine ? grayOf(bs.img, img0) : null;
    const M = new DOMMatrix([1, 0, 0, 1, -x0, -y0]).multiply(base), pad = 1 / sc;
    if (A) { A.setTransform(1, 0, 0, 1, 0, 0); A.globalCompositeOperation = 'source-over'; A.fillStyle = '#000'; A.fillRect(0, 0, bw, bh); A.globalCompositeOperation = 'lighten'; }
    if (B) { B.setTransform(1, 0, 0, 1, 0, 0); B.clearRect(0, 0, bw, bh); }
    let j = 0;
    for (let d = 0; d < L; ) {
      const u0 = ((d + flow) % tile + tile) % tile, room = tile - u0, len = Math.min(step, L - d, room > 0.05 ? room : step);
      const q = at(p, a, d, j); j = q.j; const q2 = at(p, a, Math.min(L, d + len), j), k = widthK(s, (d + len / 2) / L, wp), h = size * k;
      const sx = u0 / tile * iw, sw = Math.max(0.5, len / tile * iw), ang = Math.atan2(q2.y - q.y, q2.x - q.x), dl = Math.hypot(q2.x - q.x, q2.y - q.y);
      if (h > 0.2 && dl > 1e-3) {
        const s0 = Math.min(sx, iw - sw), k2 = sw / dl, back = Math.min(pad, s0 / k2), fwd = Math.min(pad, (iw - s0 - sw) / k2), R = (isFinite(ang) ? ang : q.ang) * 180 / Math.PI; // each strip reaches a pixel into its neighbours
        const put = (x, src, Mx) => { x.setTransform(Mx.translate(q.x, q.y).rotate(R)); x.drawImage(src, s0 - back * k2, 0, sw + (back + fwd) * k2, ih, -back, -h / 2, dl + back + fwd, h);
          if (mode === 'pattern') { // where one copy ends and the next begins, reach into the other copy too
            if (back < pad) x.drawImage(src, iw - (pad - back) * k2, 0, (pad - back) * k2, ih, -pad, -h / 2, pad - back, h);
            if (fwd < pad) x.drawImage(src, 0, 0, (pad - fwd) * k2, ih, dl + fwd, -h / 2, pad - fwd, h); } };
        if (A) { put(A, gray, M); if (B) put(B, img, M); } else { put(c, img, base); }
      }
      d += len;
    }
    if (!A) { c.setTransform(base); return true; }
    const ga = A.getImageData(0, 0, bw, bh), g = ga.data, out = B ? B.getImageData(0, 0, bw, bh) : ga, o = out.data, [r, gg, bb] = B ? [0, 0, 0] : U.hexRgb(/^#/.test(col) ? col : '#000000');
    for (let i = 0; i < g.length; i += 4) { const al = g[i]; if (B) o[i + 3] = al; else { o[i] = r; o[i + 1] = gg; o[i + 2] = bb; o[i + 3] = al; } }
    const C = scratch(2, bw, bh); C.setTransform(1, 0, 0, 1, 0, 0); C.clearRect(0, 0, bw, bh); C.putImageData(out, 0, 0);
    c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.drawImage(C.canvas, 0, 0, bw, bh, x0, y0, bw, bh); c.restore(); return true;
  }
  /** The picture's see-through-ness as gray on black (white: solid). */
  function grayOf(id, img) { const key = id + '|gray'; let cv = tints.get(key); if (cv) return cv; cv = document.createElement('canvas'); cv.width = img.naturalWidth || img.width; cv.height = img.naturalHeight || img.height; const x = cv.getContext('2d'); x.fillStyle = '#000'; x.fillRect(0, 0, cv.width, cv.height); x.drawImage(tint(id, img, '#ffffff'), 0, 0); tints.set(key, cv); return cv; }
  const SCR = []; const scratch = (i, w, h) => { let x = SCR[i]; if (!x) x = SCR[i] = document.createElement('canvas').getContext('2d', { willReadFrequently: true }); if (x.canvas.width < w || x.canvas.height < h) { x.canvas.width = Math.max(w, x.canvas.width); x.canvas.height = Math.max(h, x.canvas.height); } return x; };
  /** A pulse: a wave of thickness running along the line (combined with its own width profile). */
  function pulse(wp, an, T) { const n = 48, out = new Array(n), A = U.clamp(an.a ?? 0.5, 0, 1) * 0.7; for (let i = 0; i < n; i++) { const u = i / (n - 1); out[i] = Math.max(0.05, (wp ? G.prof(wp, u) : 1) * (1 + A * Math.sin(Math.PI * 2 * (u * 2.5 - T * (an.sp ?? 1))))); } return out; }
  /** The line moved by an animation: 'boil' redraws it by hand a few times a second. */
  function animate(p, s, T, anim) { const an = anim !== undefined ? anim : s.bs && s.bs.an; if (!an || an.k !== 'boil') return p; return G.jitter(p, { amp: Math.max(0.6, s.s * 0.3 * (an.a ?? 0.5) + 0.4), step: Math.floor(T * 8 * (an.sp ?? 1)), seed: 5 }); }
  /** Dashes running along a line ('march'). */
  function march(c, s, T, anim) { const an = anim !== undefined ? anim : s.bs && s.bs.an; if (!an || an.k !== 'march') return false; const a = 0.4 + (an.a ?? 0.5); c.setLineDash([s.s * 2 * a, s.s * 1.6 * a]); c.lineDashOffset = -T * (an.sp ?? 1) * s.s * 8; return true; }

  SB.brushTex = { image, tint, keep, fromFile, fromCanvas, fromLayer, builtIn, texOf, drawLine, pulse, animate, march, widthK,
    MODES: [['stamp', 'Copies along the line', 'Copies of the picture along the line (spacing, scatter, turn)'], ['stretch', 'Stretched along the line', 'One picture bent along the whole line'], ['pattern', 'Repeats along the line', 'The picture repeats along the line and bends with it'], ['grain', 'Texture inside the line', 'The picture fills the line like paper grain']],
    ANIMS: [['', 'Still'], ['boil', 'Boil', 'The line redraws itself by hand a few times a second'], ['march', 'Marching dashes', 'Dashes run along the line'], ['pulse', 'Pulse', 'A wave of thickness travels along the line'], ['flow', 'Flow', 'The texture slides along the line (picture and grain brushes)']] };
})(window.SB);
