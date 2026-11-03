/* GIF encoder (animated GIF89a), small and dependency-free.
   const enc = SB.gif.encoder(w, h, { loop: true, transparent: false, colors: 256, dither: true });
   enc.add(imageData, delayCs); … const blob = enc.finish();
   Each frame gets its own palette (median cut over a sample of its pixels), optionally dithered (Floyd–Steinberg).
   Transparent: pixels under half opacity become the transparent color (GIF has no partial transparency). */
'use strict';
(function (SB) {
  /** Median cut: up to n colors for the pixels in px (Uint8ClampedArray RGBA); skip: pixel indexes to leave out (transparent). */
  function palette(px, n, transparent) {
    const pts = [], step = Math.max(1, Math.floor(px.length / 4 / 40000));
    for (let i = 0; i < px.length; i += 4 * step) { if (transparent && px[i + 3] < 128) continue; pts.push([px[i], px[i + 1], px[i + 2]]); }
    if (!pts.length) pts.push([0, 0, 0]);
    let boxes = [pts];
    while (boxes.length < n) {
      let bi = -1, best = -1, ch = 0;
      boxes.forEach((b, k) => { if (b.length < 2) return; for (let c = 0; c < 3; c++) { let lo = 255, hi = 0; for (const p of b) { if (p[c] < lo) lo = p[c]; if (p[c] > hi) hi = p[c]; } if (hi - lo > best) { best = hi - lo; bi = k; ch = c; } } });
      if (bi < 0 || best <= 0) break;
      const b = boxes[bi].sort((p, q) => p[ch] - q[ch]), m = b.length >> 1; boxes.splice(bi, 1, b.slice(0, m), b.slice(m));
    }
    return boxes.map(b => { let r = 0, g = 0, bl = 0; for (const p of b) { r += p[0]; g += p[1]; bl += p[2]; } return [Math.round(r / b.length), Math.round(g / b.length), Math.round(bl / b.length)]; });
  }
  /** Nearest palette index for r, g, b (cached by 5-bit color). */
  function nearest(pal, cache) {
    return (r, g, b) => {
      const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3); let v = cache[key]; if (v >= 0) return v;
      let bi = 0, bd = Infinity; for (let i = 0; i < pal.length; i++) { const p = pal[i], d = (p[0] - r) * (p[0] - r) * 2 + (p[1] - g) * (p[1] - g) * 4 + (p[2] - b) * (p[2] - b) * 3; if (d < bd) { bd = d; bi = i; } }
      cache[key] = bi; return bi;
    };
  }
  /** GIF LZW of index data with minimum code size mcs; returns sub-blocks. */
  function lzw(idx, mcs, out) {
    const clear = 1 << mcs, eoi = clear + 1; let size = mcs + 1, next = eoi + 1, dict = new Map(), buf = 0, nb = 0; const bytes = [];
    const emit = c => { buf |= c << nb; nb += size; while (nb >= 8) { bytes.push(buf & 255); buf >>>= 8; nb -= 8; } };
    emit(clear); let cur = idx[0];
    for (let i = 1; i < idx.length; i++) {
      const k = idx[i], key = cur * 4096 + k, hit = dict.get(key);
      if (hit !== undefined) { cur = hit; continue; }
      emit(cur); if (next < 4096) { dict.set(key, next++); if (next > (1 << size) && size < 12) size++; } else { emit(clear); dict = new Map(); size = mcs + 1; next = eoi + 1; }
      cur = k;
    }
    emit(cur); emit(eoi); if (nb > 0) bytes.push(buf & 255);
    out.push(mcs); for (let i = 0; i < bytes.length; i += 255) { const n = Math.min(255, bytes.length - i); out.push(n); for (let j = 0; j < n; j++) out.push(bytes[i + j]); } out.push(0);
  }
  function encoder(w, h, opt = {}) {
    const chunks = [], head = [], ncol = Math.max(2, Math.min(256, opt.colors || 256)), tr = !!opt.transparent;
    const str = s => { for (const c of s) head.push(c.charCodeAt(0)); }, u16 = (a, v) => a.push(v & 255, (v >> 8) & 255);
    str('GIF89a'); u16(head, w); u16(head, h); head.push(0x70, 0, 0); // no global color table: each frame has its own
    if (opt.loop !== false) { head.push(0x21, 0xFF, 11); str('NETSCAPE2.0'); head.push(3, 1); u16(head, 0); head.push(0); } // loop forever
    chunks.push(new Uint8Array(head));
    return {
      add(img, delayCs) {
        const px = img.data, n = w * h, pal = palette(px, tr ? ncol - 1 : ncol, tr), tIdx = tr ? pal.length : -1, near = nearest(pal, new Int16Array(32768).fill(-1)), idx = new Uint8Array(n);
        if (opt.dither) { // Floyd–Steinberg on a float copy
          const e = new Float32Array(n * 3); for (let i = 0; i < n; i++) { e[i * 3] = px[i * 4]; e[i * 3 + 1] = px[i * 4 + 1]; e[i * 3 + 2] = px[i * 4 + 2]; }
          for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            const i = y * w + x; if (tr && px[i * 4 + 3] < 128) { idx[i] = tIdx; continue; }
            const r = Math.max(0, Math.min(255, e[i * 3])), g = Math.max(0, Math.min(255, e[i * 3 + 1])), b = Math.max(0, Math.min(255, e[i * 3 + 2])), k = near(r | 0, g | 0, b | 0), p = pal[k]; idx[i] = k;
            const er = r - p[0], eg = g - p[1], eb = b - p[2], add = (j, f) => { e[j * 3] += er * f; e[j * 3 + 1] += eg * f; e[j * 3 + 2] += eb * f; };
            if (x + 1 < w) add(i + 1, 7 / 16); if (y + 1 < h) { if (x > 0) add(i + w - 1, 3 / 16); add(i + w, 5 / 16); if (x + 1 < w) add(i + w + 1, 1 / 16); }
          }
        } else for (let i = 0; i < n; i++) idx[i] = tr && px[i * 4 + 3] < 128 ? tIdx : near(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]);
        let bits = 1; while ((1 << bits) < pal.length + (tr ? 1 : 0)) bits++; bits = Math.max(1, bits); const size = 1 << bits;
        const out = [0x21, 0xF9, 4, (tr ? 1 : 0) | (tr ? 2 << 2 : 1 << 2), delayCs & 255, (delayCs >> 8) & 255, tr ? tIdx : 0, 0]; // graphic control: delay, dispose (restore to background when transparent)
        out.push(0x2C); u16(out, 0); u16(out, 0); u16(out, w); u16(out, h); out.push(0x80 | (bits - 1)); // local color table
        for (let i = 0; i < size; i++) { const p = pal[i] || [0, 0, 0]; out.push(p[0], p[1], p[2]); }
        lzw(idx, Math.max(2, bits), out); chunks.push(new Uint8Array(out));
      },
      finish() { chunks.push(new Uint8Array([0x3B])); return new Blob(chunks, { type: 'image/gif' }); },
    };
  }
  SB.gif = { encoder };
})(window.SB);
