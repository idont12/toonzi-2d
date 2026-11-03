/* Photoshop (.psd) reader: 8-bit RGB layers (with names, opacity, visibility, clipping and layer masks)
   and the flattened picture.
   Ported from the original app; works for files saved by Photoshop, Photopea, Krita and Affinity. */
'use strict';
(function (SB) {
  function psdParse(ab) {
    const dv = new DataView(ab); let p = 0;
    const u8 = () => dv.getUint8(p++), u16 = () => { const v = dv.getUint16(p); p += 2; return v; }, i16 = () => { const v = dv.getInt16(p); p += 2; return v; }, u32 = () => { const v = dv.getUint32(p); p += 4; return v; }, i32 = () => { const v = dv.getInt32(p); p += 4; return v; };
    const str = n => { let s = ''; for (let i = 0; i < n; i++) s += String.fromCharCode(u8()); return s; };
    if (str(4) !== '8BPS') throw new Error("This isn't a Photoshop file.");
    const ver = u16(); if (ver !== 1) throw new Error('Large documents (PSB) aren\u2019t supported. Save as PSD.'); p += 6;
    const nch = u16(), H = u32(), W = u32(), depth = u16(), mode = u16();
    if (depth !== 8 || mode !== 3) throw new Error('Only 8-bit RGB Photoshop files are supported. In Photoshop use Image, Mode, RGB Color and 8 Bits/Channel.');
    const skip = () => { const n = u32(); p += n; }; skip(); skip();
    const rle = (w, h, src, at, counts) => { const out = new Uint8Array(w * h); let q = at, o = 0; for (let y = 0; y < h; y++) { const end = q + counts[y]; o = y * w; while (q < end) { let n = dv.getInt8(q++); if (n >= 0) { for (let i = 0; i <= n; i++) out[o++] = dv.getUint8(q++); } else if (n !== -128) { const v = dv.getUint8(q++); for (let i = 0; i < 1 - n; i++) out[o++] = v; } } q = end; } return out; };
    const readChan = (w, h, len) => { const st = p, comp = u16(); let data;
      if (comp === 0) { data = new Uint8Array(ab, p, w * h).slice(); }
      else if (comp === 1) { const counts = []; for (let y = 0; y < h; y++) counts.push(u16()); data = rle(w, h, null, p, counts); }
      else data = null; p = st + len; return data; };
    const layers = []; const lmLen = u32(), lmEnd = p + lmLen;
    if (lmLen > 0) { const liLen = u32(), liEnd = p + liLen;
      if (liLen > 0) { let cnt = i16(); cnt = Math.abs(cnt);
        for (let i = 0; i < cnt; i++) {
          const top = i32(), left = i32(), bottom = i32(), right = i32(), nc = u16(), ch = []; for (let c = 0; c < nc; c++) ch.push({ id: i16(), len: u32() });
          p += 4; p += 4; const opacity = u8(), clipping = u8(), flags = u8(); p += 1; const exLen = u32(), exEnd = p + exLen;
          let mask = null; { const mLen = u32(), mEnd = p + mLen; if (mLen >= 18) { const mt = i32(), ml = i32(), mb = i32(), mr = i32(), def = u8(), mf = u8(); if (!(mf & 2) && mr > ml && mb > mt) mask = { top: mt, left: ml, bottom: mb, right: mr, def, invert: !!(mf & 4) }; } p = mEnd; } // layer mask
          skip(); const nl = u8(); let name = str(nl); p += (4 - ((nl + 1) % 4)) % 4;
          let divider = 0; while (p + 12 <= exEnd) { const sig = str(4), key = str(4), len = u32(), st = p; if (sig !== '8BIM' && sig !== '8B64') break;
            if (key === 'luni') { const n = u32(); let s = ''; for (let k = 0; k < n; k++) s += String.fromCharCode(u16()); name = s || name; }
            if (key === 'lsct' || key === 'lsdk') divider = u32(); p = st + len + (len % 2); }
          p = exEnd; layers.push({ top, left, bottom, right, ch, opacity, clipping, hidden: !!(flags & 2), name, divider, mask });
        }
        for (const L of layers) { const w = L.right - L.left, h = L.bottom - L.top; L.data = {};
          for (const c of L.ch) { if (w > 0 && h > 0 && c.id >= -1) L.data[c.id] = readChan(w, h, c.len); else if (c.id === -2 && L.mask) L.mask.data = readChan(L.mask.right - L.mask.left, L.mask.bottom - L.mask.top, c.len); else p += c.len; }
          if (L.mask && L.mask.data) bakeMask(L); }
      }
      p = lmEnd; }
    let comp = null; try { const cm = u16(); if (cm === 0 || cm === 1) { const chans = []; if (cm === 1) { const counts = []; for (let i = 0; i < nch * H; i++) counts.push(u16()); let q = p; for (let c = 0; c < Math.min(nch, 4); c++) { const cc = counts.slice(c * H, (c + 1) * H); chans.push(rle(W, H, null, q, cc)); q += cc.reduce((a, b) => a + b, 0); } } else for (let c = 0; c < Math.min(nch, 4); c++) { chans.push(new Uint8Array(ab, p, W * H).slice()); p += W * H; } comp = chans; } } catch (e) { comp = null; }
    return { W, H, layers: layers.filter(L => !L.divider && L.right > L.left && L.bottom > L.top), comp };
  }
  /** Apply a layer mask to the layer's own transparency (white shows, black hides). */
  function bakeMask(L) {
    const w = L.right - L.left, h = L.bottom - L.top, M = L.mask, mw = M.right - M.left, A = L.data[-1] || new Uint8Array(w * h).fill(255);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const mx = x + L.left - M.left, my = y + L.top - M.top; let m = mx >= 0 && my >= 0 && mx < mw && my < M.bottom - M.top ? M.data[my * mw + mx] : M.def; if (M.invert) m = 255 - m;
      A[y * w + x] = A[y * w + x] * m / 255;
    }
    L.data[-1] = A;
  }
  function toCanvas(w, h, R, G, B, A) { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const x = cv.getContext('2d'), id = x.createImageData(w, h), d = id.data; for (let i = 0, n = w * h; i < n; i++) { d[i * 4] = R ? R[i] : 0; d[i * 4 + 1] = G ? G[i] : 0; d[i * 4 + 2] = B ? B[i] : 0; d[i * 4 + 3] = A ? A[i] : 255; } x.putImageData(id, 0, 0); return cv; }
  SB.psd = { parse: psdParse, toCanvas };
})(window.SB);
