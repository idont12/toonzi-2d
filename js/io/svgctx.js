/* A canvas 2D context that writes SVG: the app's renderer draws into it exactly as into a canvas, and what it draws comes
   out as SVG (paths, fills, lines, text, gradients, pictures, clips and blend modes).
   Every call also goes to a hidden real canvas (the shadow). When the renderer does something SVG can't show
   (erasing modes like destination-out, filters, shadows, patterns, reading pixels back), what is drawn so far becomes
   one picture from the shadow, and drawing goes on as vectors on top of it: the result always looks like the app.
   SB.svgCtx(w, h) → ctx; ctx.svg(idPrefix) → { body, defs, raster } (raster: how many times it had to fall back). */
'use strict';
(function (SB) {
  const r = v => Math.round(v * 100) / 100, esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const BLEND = new Set(['multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity']);
  const imgCache = new WeakMap();
  /** A picture as a data URL (canvases each time: they change; images once). */
  function dataUrl(src, crop) {
    const isCanvas = src instanceof HTMLCanvasElement || (typeof OffscreenCanvas !== 'undefined' && src instanceof OffscreenCanvas);
    if (!crop && !isCanvas && imgCache.has(src)) return imgCache.get(src);
    const w = crop ? crop[2] : src.videoWidth || src.naturalWidth || src.width, h = crop ? crop[3] : src.videoHeight || src.naturalHeight || src.height;
    if (!w || !h) return null;
    if (!crop && src instanceof HTMLImageElement && /^data:/.test(src.src)) { imgCache.set(src, src.src); return src.src; }
    const cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round(w)); cv.height = Math.max(1, Math.round(h)); const x = cv.getContext('2d');
    try { if (crop) x.drawImage(src, crop[0], crop[1], crop[2], crop[3], 0, 0, cv.width, cv.height); else x.drawImage(src, 0, 0); } catch (e) { return null; }
    const url = cv.toDataURL('image/png'); if (!crop && !isCanvas) imgCache.set(src, url); return url;
  }
  /** The part of a canvas that isn't see-through: [x, y, w, h], or null when it is empty. */
  function opaqueBox(cv) {
    const w = cv.width, h = cv.height; let d; try { d = cv.getContext('2d').getImageData(0, 0, w, h).data; } catch (e) { return [0, 0, w, h]; }
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) { const row = y * w * 4; for (let x = 0; x < w; x++) if (d[row + x * 4 + 3]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; y1 = y; } }
    return x1 < 0 ? null : [x0, y0, x1 - x0 + 1, y1 - y0 + 1];
  }

  class SvgCtx {
    constructor(w, h) {
      this.canvas = document.createElement('canvas'); this.canvas.width = w; this.canvas.height = h; this.sh = this.canvas.getContext('2d', { willReadFrequently: true }); // the shadow
      this.base = null; this.out = []; this.defs = []; this.n = 0; this.raster = 0; this.d = []; this.cur = null; this.start = null;
      this.mute = 0; this.st = { m: new DOMMatrix(), fill: '#000', stroke: '#000', lw: 1, cap: 'butt', join: 'miter', miter: 10, alpha: 1, gco: 'source-over', font: '10px sans-serif', align: 'start', baseline: 'alphabetic', dir: 'inherit', dash: [], dashOff: 0, filter: 'none', shadow: 0, clip: null };
      this.stack = [];
    }
    // ---------- state
    save() { this.sh.save(); this.stack.push(Object.assign({}, this.st, { m: DOMMatrix.fromMatrix(this.st.m), dash: this.st.dash.slice() })); }
    restore() { this.sh.restore(); if (this.stack.length) this.st = this.stack.pop(); }
    setTransform(a, b, c, d, e, f) { const m = typeof a === 'object' ? DOMMatrix.fromMatrix(a) : new DOMMatrix([a, b, c, d, e, f]); this.st.m = m; this.sh.setTransform(m); }
    resetTransform() { this.setTransform(1, 0, 0, 1, 0, 0); }
    getTransform() { return DOMMatrix.fromMatrix(this.st.m); }
    transform(a, b, c, d, e, f) { this.st.m = this.st.m.multiply(new DOMMatrix([a, b, c, d, e, f])); this.sh.transform(a, b, c, d, e, f); }
    translate(x, y) { this.st.m = this.st.m.translate(x, y); this.sh.translate(x, y); }
    rotate(a) { this.st.m = this.st.m.rotate(a * 180 / Math.PI); this.sh.rotate(a); }
    scale(x, y) { this.st.m = this.st.m.scale(x, y); this.sh.scale(x, y); }
    set fillStyle(v) { this.st.fill = v; this.sh.fillStyle = v && v._real ? v._real : v; } get fillStyle() { return this.st.fill; }
    set strokeStyle(v) { this.st.stroke = v; this.sh.strokeStyle = v && v._real ? v._real : v; } get strokeStyle() { return this.st.stroke; }
    set lineWidth(v) { this.st.lw = v; this.sh.lineWidth = v; } get lineWidth() { return this.st.lw; }
    set lineCap(v) { this.st.cap = v; this.sh.lineCap = v; } get lineCap() { return this.st.cap; }
    set lineJoin(v) { this.st.join = v; this.sh.lineJoin = v; } get lineJoin() { return this.st.join; }
    set miterLimit(v) { this.st.miter = v; this.sh.miterLimit = v; } get miterLimit() { return this.st.miter; }
    set globalAlpha(v) { this.st.alpha = v; this.sh.globalAlpha = v; } get globalAlpha() { return this.st.alpha; }
    set globalCompositeOperation(v) { this.st.gco = v; this.sh.globalCompositeOperation = v; } get globalCompositeOperation() { return this.st.gco; }
    set font(v) { this.st.font = v; this.sh.font = v; } get font() { return this.sh.font; }
    set textAlign(v) { this.st.align = v; this.sh.textAlign = v; } get textAlign() { return this.st.align; }
    set textBaseline(v) { this.st.baseline = v; this.sh.textBaseline = v; } get textBaseline() { return this.st.baseline; }
    set direction(v) { this.st.dir = v; this.sh.direction = v; } get direction() { return this.st.dir; }
    set lineDashOffset(v) { this.st.dashOff = v; this.sh.lineDashOffset = v; } get lineDashOffset() { return this.st.dashOff; }
    set filter(v) { this.st.filter = v || 'none'; this.sh.filter = v; } get filter() { return this.st.filter; }
    set shadowBlur(v) { this.st.shadow = v; this.sh.shadowBlur = v; } get shadowBlur() { return this.st.shadow; }
    set shadowColor(v) { this.sh.shadowColor = v; } get shadowColor() { return this.sh.shadowColor; }
    set shadowOffsetX(v) { this.sh.shadowOffsetX = v; } get shadowOffsetX() { return this.sh.shadowOffsetX; }
    set shadowOffsetY(v) { this.sh.shadowOffsetY = v; } get shadowOffsetY() { return this.sh.shadowOffsetY; }
    set imageSmoothingEnabled(v) { this.sh.imageSmoothingEnabled = v; } get imageSmoothingEnabled() { return this.sh.imageSmoothingEnabled; }
    set imageSmoothingQuality(v) { this.sh.imageSmoothingQuality = v; } get imageSmoothingQuality() { return this.sh.imageSmoothingQuality; }
    set letterSpacing(v) { this.sh.letterSpacing = v; } get letterSpacing() { return this.sh.letterSpacing; }
    setLineDash(a) { this.st.dash = (a || []).slice(); this.sh.setLineDash(a); } getLineDash() { return this.st.dash.slice(); }
    measureText(t) { return this.sh.measureText(t); }
    isPointInPath(...a) { return this.sh.isPointInPath(...a); }
    getImageData(...a) { return this.sh.getImageData(...a); }
    putImageData(...a) { this.sh.putImageData(...a); this.flush(); }
    createLinearGradient(x0, y0, x1, y1) { return this.grad('linear', [x0, y0, x1, y1], this.sh.createLinearGradient(x0, y0, x1, y1)); }
    createRadialGradient(x0, y0, r0, x1, y1, r1) { return this.grad('radial', [x0, y0, r0, x1, y1, r1], this.sh.createRadialGradient(x0, y0, r0, x1, y1, r1)); }
    createConicGradient(a, x, y) { const g = this.sh.createConicGradient(a, x, y); return { _real: g, _bad: true, addColorStop: (o, c) => g.addColorStop(o, c) }; }
    createPattern(img, rep) { const p = this.sh.createPattern(img, rep); return { _real: p, _bad: true, setTransform: m => p && p.setTransform(m) }; }
    grad(kind, a, real) { const g = { _real: real, kind, a, stops: [], addColorStop(o, c) { real.addColorStop(o, c); g.stops.push([o, c]); } }; return g; }

    // ---------- paths (kept in window pixels: each point goes through the transform when it is added, like a canvas does)
    P(x, y) { const q = this.st.m.transformPoint(new DOMPoint(x, y)); return [r(q.x), r(q.y)]; }
    beginPath() { this.d = []; this.cur = null; this.start = null; this.sh.beginPath(); }
    moveTo(x, y) { const p = this.P(x, y); this.d.push(`M${p[0]} ${p[1]}`); this.cur = this.start = [x, y]; if (!this.mute) this.sh.moveTo(x, y); }
    lineTo(x, y) { if (!this.cur) return this.moveTo(x, y); const p = this.P(x, y); this.d.push(`L${p[0]} ${p[1]}`); this.cur = [x, y]; if (!this.mute) this.sh.lineTo(x, y); }
    bezierCurveTo(a, b, c, d, e, f) { if (!this.cur) this.moveTo(a, b); const p = [this.P(a, b), this.P(c, d), this.P(e, f)]; this.d.push(`C${p[0]} ${p[1]} ${p[2]}`.replace(/,/g, ' ')); this.cur = [e, f]; if (!this.mute) this.sh.bezierCurveTo(a, b, c, d, e, f); }
    quadraticCurveTo(a, b, c, d) { if (!this.cur) this.moveTo(a, b); const p = [this.P(a, b), this.P(c, d)]; this.d.push(`Q${p[0]} ${p[1]}`.replace(/,/g, ' ')); this.cur = [c, d]; if (!this.mute) this.sh.quadraticCurveTo(a, b, c, d); }
    closePath() { if (this.d.length) this.d.push('Z'); if (this.start) this.cur = this.start.slice(); if (!this.mute) this.sh.closePath(); }
    rect(x, y, w, h) { this.mute++; this.moveTo(x, y); this.lineTo(x + w, y); this.lineTo(x + w, y + h); this.lineTo(x, y + h); this.closePath(); this.mute--; if (!this.mute) this.sh.rect(x, y, w, h); this.cur = this.start = [x, y]; }
    /** An arc as cubic curves (in the drawing's own space, then transformed). */
    arcPts(cx, cy, rx, ry, rot, a0, a1, ccw) {
      let da = a1 - a0; const TAU = Math.PI * 2;
      if (!ccw && da < 0) da = da % TAU + TAU; if (ccw && da > 0) da = da % TAU - TAU; if (Math.abs(a1 - a0) >= TAU) da = ccw ? -TAU : TAU;
      const n = Math.max(1, Math.ceil(Math.abs(da) / (Math.PI / 2))), step = da / n, k = 4 / 3 * Math.tan(step / 4), cr = Math.cos(rot), sr = Math.sin(rot);
      const at = (a, d) => { const x = Math.cos(a) * rx - d * Math.sin(a) * rx, y = Math.sin(a) * ry + d * Math.cos(a) * ry; return [cx + x * cr - y * sr, cy + x * sr + y * cr]; };
      const pt = a => at(a, 0), out = [pt(a0)];
      for (let i = 0; i < n; i++) { const s = a0 + i * step, e = s + step; const p1 = [Math.cos(s) * rx - k * Math.sin(s) * rx, Math.sin(s) * ry + k * Math.cos(s) * ry], p2 = [Math.cos(e) * rx + k * Math.sin(e) * rx, Math.sin(e) * ry - k * Math.cos(e) * ry];
        const T = q => [cx + q[0] * cr - q[1] * sr, cy + q[0] * sr + q[1] * cr]; out.push([T(p1), T(p2), pt(e)]); }
      return out;
    }
    pushArc(pts) { this.mute++; const s = pts[0]; if (this.cur) this.lineTo(s[0], s[1]); else this.moveTo(s[0], s[1]); for (let i = 1; i < pts.length; i++) { const [a, b, c] = pts[i]; this.bezierCurveTo(a[0], a[1], b[0], b[1], c[0], c[1]); } this.mute--; }
    arc(x, y, rad, a0, a1, ccw) { this.pushArc(this.arcPts(x, y, rad, rad, 0, a0, a1, !!ccw)); if (!this.mute) this.sh.arc(x, y, rad, a0, a1, ccw); }
    ellipse(x, y, rx, ry, rot, a0, a1, ccw) { this.pushArc(this.arcPts(x, y, rx, ry, rot, a0, a1, !!ccw)); if (!this.mute) this.sh.ellipse(x, y, rx, ry, rot, a0, a1, ccw); }
    arcTo(x1, y1, x2, y2, rad) {
      this.mute++; const p0 = this.cur || [x1, y1];
      const v1 = [p0[0] - x1, p0[1] - y1], v2 = [x2 - x1, y2 - y1], l1 = Math.hypot(...v1), l2 = Math.hypot(...v2), ang = Math.acos(Math.max(-1, Math.min(1, (v1[0] * v2[0] + v1[1] * v2[1]) / (l1 * l2 || 1))));
      if (!l1 || !l2 || !rad || Math.abs(Math.sin(ang)) < 1e-6) { this.lineTo(x1, y1); this.mute--; if (!this.mute) this.sh.arcTo(x1, y1, x2, y2, rad); return; }
      const t = rad / Math.tan(ang / 2), u1 = [v1[0] / l1, v1[1] / l1], u2 = [v2[0] / l2, v2[1] / l2], s = [x1 + u1[0] * t, y1 + u1[1] * t], e = [x1 + u2[0] * t, y1 + u2[1] * t];
      const bis = [u1[0] + u2[0], u1[1] + u2[1]], bl = Math.hypot(...bis), dist = rad / Math.sin(ang / 2), c = [x1 + bis[0] / bl * dist, y1 + bis[1] / bl * dist];
      const a0 = Math.atan2(s[1] - c[1], s[0] - c[0]), a1 = Math.atan2(e[1] - c[1], e[0] - c[0]), cross = v1[0] * v2[1] - v1[1] * v2[0];
      this.pushArc(this.arcPts(c[0], c[1], rad, rad, 0, a0, a1, cross > 0)); this.mute--; if (!this.mute) this.sh.arcTo(x1, y1, x2, y2, rad);
    }
    roundRect(x, y, w, h, rr) {
      this.mute++; let q = Array.isArray(rr) ? rr[0] : rr; q = typeof q === 'object' ? q.x || 0 : q || 0; q = Math.min(q, Math.abs(w) / 2, Math.abs(h) / 2);
      this.moveTo(x + q, y); this.arcTo(x + w, y, x + w, y + h, q); this.arcTo(x + w, y + h, x, y + h, q); this.arcTo(x, y + h, x, y, q); this.arcTo(x, y, x + w, y, q); this.closePath();
      this.mute--; if (!this.mute) this.sh.roundRect(x, y, w, h, rr);
    }

    // ---------- painting
    /** Can SVG show what comes next as it is? (else: fall back to the shadow picture) */
    plain(paint) { const g = this.st.gco; return (g === 'source-over' || BLEND.has(g)) && (!this.st.filter || this.st.filter === 'none') && !this.st.shadow && !(paint && paint._bad); }
    /** Bake everything drawn so far into one picture (the shadow), then go on drawing vectors on top. */
    flush() { if (!this.base) { this.base = document.createElement('canvas'); this.base.width = this.canvas.width; this.base.height = this.canvas.height; } const b = this.base.getContext('2d'); b.setTransform(1, 0, 0, 1, 0, 0); b.clearRect(0, 0, this.base.width, this.base.height); b.drawImage(this.canvas, 0, 0); this.out = []; this.raster++; }
    paint(v, box) {
      if (v && v.kind) { const id = 'g' + (++this.n), m = this.st.m, st = v.stops.map(([o, c]) => `<stop offset="${r(o)}" stop-color="${esc(c)}"/>`).join('');
        this.defs.push(v.kind === 'linear' ? `<linearGradient id="${this.pre}${id}" gradientUnits="userSpaceOnUse" x1="${r(v.a[0])}" y1="${r(v.a[1])}" x2="${r(v.a[2])}" y2="${r(v.a[3])}" gradientTransform="${this.mat(m)}">${st}</linearGradient>`
          : `<radialGradient id="${this.pre}${id}" gradientUnits="userSpaceOnUse" fx="${r(v.a[0])}" fy="${r(v.a[1])}" fr="${r(v.a[2])}" cx="${r(v.a[3])}" cy="${r(v.a[4])}" r="${r(v.a[5])}" gradientTransform="${this.mat(m)}">${st}</radialGradient>`);
        return `url(#${this.pre}${id})`; }
      return esc(v); void box;
    }
    mat(m) { return `matrix(${r(m.a)} ${r(m.b)} ${r(m.c)} ${r(m.d)} ${r(m.e)} ${r(m.f)})`; }
    common() { const s = this.st, a = []; if (s.alpha < 1) a.push(`opacity="${r(s.alpha)}"`); if (BLEND.has(s.gco)) a.push(`style="mix-blend-mode:${s.gco}"`); if (s.clip) a.push(`clip-path="url(#${s.clip})"`); return a.join(' '); }
    emit(el) { this.out.push(el); }
    fill(a, b) {
      const rule = typeof a === 'string' ? a : b, isPath = a && typeof a === 'object'; if (isPath) this.sh.fill(a, rule); else this.sh.fill(rule);
      if (isPath || !this.plain(this.st.fill)) return this.flush();
      if (!this.d.length) return; this.emit(`<path d="${this.d.join('')}" fill="${this.paint(this.st.fill)}"${rule === 'evenodd' ? ' fill-rule="evenodd"' : ''} ${this.common()}/>`);
    }
    strokeAttrs() { const s = this.st, m = s.m, k = Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) || 1; let a = `stroke="${this.paint(s.stroke)}" stroke-width="${r(s.lw * k)}"`;
      if (s.cap !== 'butt') a += ` stroke-linecap="${s.cap}"`; if (s.join !== 'miter') a += ` stroke-linejoin="${s.join}"`; else if (s.miter !== 4) a += ` stroke-miterlimit="${r(s.miter)}"`;
      if (s.dash.length) a += ` stroke-dasharray="${s.dash.map(v => r(v * k)).join(' ')}"${s.dashOff ? ` stroke-dashoffset="${r(s.dashOff * k)}"` : ''}`; return a; }
    stroke(p) {
      if (p && typeof p === 'object') { this.sh.stroke(p); return this.flush(); } this.sh.stroke();
      if (!this.plain(this.st.stroke)) return this.flush(); if (!this.d.length) return;
      this.emit(`<path d="${this.d.join('')}" fill="none" ${this.strokeAttrs()} ${this.common()}/>`);
    }
    clip(a, b) {
      const rule = typeof a === 'string' ? a : b; if (a && typeof a === 'object') { this.sh.clip(a, rule); return; } this.sh.clip(rule);
      const id = this.pre + 'c' + (++this.n); this.defs.push(`<clipPath id="${id}"${this.st.clip ? ` clip-path="url(#${this.st.clip})"` : ''}><path d="${this.d.join('') || 'M0 0'}"${rule === 'evenodd' ? ' clip-rule="evenodd"' : ''}/></clipPath>`); this.st.clip = id;
    }
    /** A box path in SVG terms without touching the current path (fillRect and strokeRect don't). */
    boxD(x, y, w, h) { const keep = [this.d, this.cur, this.start]; this.d = []; this.cur = null; this.mute++; this.rect(x, y, w, h); this.mute--; const d = this.d.join(''); [this.d, this.cur, this.start] = keep; return d; }
    fillRect(x, y, w, h) { this.sh.fillRect(x, y, w, h); if (!this.plain(this.st.fill)) return this.flush(); this.emit(`<path d="${this.boxD(x, y, w, h)}" fill="${this.paint(this.st.fill)}" ${this.common()}/>`); }
    strokeRect(x, y, w, h) { this.sh.strokeRect(x, y, w, h); if (!this.plain(this.st.stroke)) return this.flush(); this.emit(`<path d="${this.boxD(x, y, w, h)}" fill="none" ${this.strokeAttrs()} ${this.common()}/>`); }
    clearRect(x, y, w, h) {
      this.sh.clearRect(x, y, w, h); const m = this.st.m, a = m.transformPoint(new DOMPoint(x, y)), b = m.transformPoint(new DOMPoint(x + w, y + h));
      if (Math.min(a.x, b.x) <= 0 && Math.min(a.y, b.y) <= 0 && Math.max(a.x, b.x) >= this.canvas.width && Math.max(a.y, b.y) >= this.canvas.height) { this.out = []; this.base = null; } // the whole picture: start over
      else if (this.out.length || this.base) this.flush();
    }
    text(t, x, y, stroke) {
      const s = this.st, anchor = { center: 'middle', right: 'end', end: s.dir === 'rtl' ? 'start' : 'end', left: 'start', start: s.dir === 'rtl' ? 'end' : 'start' }[s.align] || 'start';
      const base = { top: 'text-before-edge', hanging: 'hanging', middle: 'middle', bottom: 'text-after-edge', ideographic: 'ideographic' }[s.baseline];
      const paint = stroke ? `fill="none" ${this.strokeAttrs()}` : `fill="${this.paint(s.fill)}"`;
      this.emit(`<text transform="${this.mat(s.m)}" x="${r(x)}" y="${r(y)}" style="font:${esc(this.sh.font)};white-space:pre${BLEND.has(s.gco) ? ';mix-blend-mode:' + s.gco : ''}" text-anchor="${anchor}"${base ? ` dominant-baseline="${base}"` : ''}${s.dir === 'rtl' ? ' direction="rtl"' : ''} ${paint}${s.alpha < 1 ? ` opacity="${r(s.alpha)}"` : ''}${s.clip ? ` clip-path="url(#${s.clip})"` : ''}>${esc(t)}</text>`);
    }
    fillText(t, x, y, mw) { this.sh.fillText(t, x, y, mw); if (!this.plain(this.st.fill) || mw) return this.flush(); this.text(t, x, y, false); }
    strokeText(t, x, y, mw) { this.sh.strokeText(t, x, y, mw); if (!this.plain(this.st.stroke) || mw) return this.flush(); this.text(t, x, y, true); }
    drawImage(src, ...a) {
      this.sh.drawImage(src, ...a); if (!this.plain()) return this.flush();
      let sx = 0, sy = 0, sw = src.videoWidth || src.naturalWidth || src.width, sh = src.videoHeight || src.naturalHeight || src.height, dx, dy, dw = sw, dh = sh;
      if (a.length === 2) [dx, dy] = a; else if (a.length === 4) [dx, dy, dw, dh] = a; else [sx, sy, sw, sh, dx, dy, dw, dh] = a;
      const isCanvas = src instanceof HTMLCanvasElement; let crop = a.length === 8 ? [sx, sy, sw, sh] : null;
      if (isCanvas && !crop) { const b = opaqueBox(src); if (!b) return; if (b[2] < src.width || b[3] < src.height) { crop = b; const fx = dw / src.width, fy = dh / src.height; dx += b[0] * fx; dy += b[1] * fy; dw = b[2] * fx; dh = b[3] * fy; } }
      const url = dataUrl(src, crop); if (!url) return;
      this.emit(`<image href="${url}" x="${r(dx)}" y="${r(dy)}" width="${r(dw)}" height="${r(dh)}" preserveAspectRatio="none" transform="${this.mat(this.st.m)}" ${this.common()}/>`);
    }
    /** The SVG of everything drawn: the fallback picture first (if any), then the vectors on top. */
    svg() {
      let head = ''; if (this.base) { const b = opaqueBox(this.base); if (b) head = `<image href="${dataUrl(this.base, b)}" x="${b[0]}" y="${b[1]}" width="${b[2]}" height="${b[3]}"/>`; }
      return { body: head + this.out.join(''), defs: this.defs.join(''), raster: this.raster };
    }
  }
  /** pre: a prefix for ids (several frames in one file must not share them). */
  SB.svgCtx = (w, h, pre = '') => { const c = new SvgCtx(w, h); c.pre = pre; return c; };
})(window.SB);
