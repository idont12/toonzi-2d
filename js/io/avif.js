/* AVIF images without a library: the browser's AV1 video encoder (WebCodecs) encodes the picture
   as one key frame, and this file wraps it in the small AVIF (HEIF) container. Transparency is a
   second AV1 picture (the alpha as gray) linked as an "alpha" auxiliary image.
     const enc = await SB.avif.encoder(w, h, quality)   quality: 0 (small) … 1 (best)
     const blob = await enc.encode(canvas, keepAlpha); enc.close();
   SB.avif.supported() tells whether this browser can encode AV1. */
'use strict';
(function (SB) {
  // ---------- bytes
  const cat = parts => { const list = parts.flat(Infinity).filter(Boolean), n = list.reduce((a, p) => a + p.length, 0), out = new Uint8Array(n); let o = 0; for (const p of list) { out.set(p, o); o += p.length; } return out; };
  const u8 = (...a) => Uint8Array.from(a), u16 = n => u8(n >> 8 & 255, n & 255), u32 = n => u8(n >>> 24 & 255, n >> 16 & 255, n >> 8 & 255, n & 255);
  const str = s => new TextEncoder().encode(s), cstr = s => cat([str(s), u8(0)]);
  const box = (type, ...parts) => { const body = cat(parts); return cat([u32(body.length + 8), str(type), body]); };
  const full = (type, v, flags, ...parts) => box(type, u8(v, flags >> 16 & 255, flags >> 8 & 255, flags & 255), ...parts);

  // ---------- AV1 bitstream: OBUs and the sequence header (for the av1C box)
  function obus(d) {
    const out = []; let p = 0;
    while (p < d.length) {
      const h0 = d[p], type = (h0 >> 3) & 15, ext = (h0 >> 2) & 1, hasSize = (h0 >> 1) & 1; let q = p + 1 + ext, size;
      if (hasSize) { size = 0; for (let i = 0; ; i++) { const b = d[q++]; size += (b & 127) * Math.pow(2, 7 * i); if (!(b & 128)) break; } } else size = d.length - q;
      out.push({ type, bytes: d.subarray(p, q + size), payload: d.subarray(q, q + size) }); p = q + size;
    }
    return out;
  }
  function bits(b) { let p = 0; const f = n => { let v = 0; for (let i = 0; i < n; i++) { v = v * 2 + ((b[p >> 3] >> (7 - (p & 7))) & 1); p++; } return v; }; return { f, uvlc() { let lz = 0; while (!f(1) && lz < 32) lz++; return lz >= 32 ? 0 : f(lz) + Math.pow(2, lz) - 1; } }; }
  /** The fields av1C needs, read from a sequence header OBU payload (AV1 spec 5.5). */
  function seqInfo(pl) {
    const r = bits(pl), s = { profile: r.f(3) }; r.f(1); const reduced = r.f(1); let tier = 0, level = 0, dmi = false, bdl = 0;
    if (reduced) level = r.f(5);
    else {
      if (r.f(1)) { r.f(32); r.f(32); if (r.f(1)) r.uvlc(); if ((dmi = !!r.f(1))) { bdl = r.f(5) + 1; r.f(32); r.f(5); r.f(5); } }
      const idd = r.f(1), cnt = r.f(5) + 1;
      for (let i = 0; i < cnt; i++) { r.f(12); const lv = r.f(5), tr = lv > 7 ? r.f(1) : 0; if (i === 0) { level = lv; tier = tr; } if (dmi && r.f(1)) { r.f(bdl); r.f(bdl); r.f(1); } if (idd && r.f(1)) r.f(4); }
    }
    const wb = r.f(4) + 1, hb = r.f(4) + 1; r.f(wb); r.f(hb);
    if (!reduced && r.f(1)) { r.f(4); r.f(3); }
    r.f(1); r.f(1); r.f(1);
    if (!reduced) { r.f(1); r.f(1); r.f(1); r.f(1); const oh = r.f(1); if (oh) { r.f(1); r.f(1); } const sfsct = r.f(1) ? 2 : r.f(1); if (sfsct > 0) { if (!r.f(1)) r.f(1); } if (oh) r.f(3); }
    r.f(1); r.f(1); r.f(1);
    const hbd = r.f(1); let twelve = 0; if (s.profile === 2 && hbd) twelve = r.f(1); const bd = twelve ? 12 : hbd ? 10 : 8;
    const mono = s.profile === 1 ? 0 : r.f(1); let cp = 2, tc = 2, mc = 2; if (r.f(1)) { cp = r.f(8); tc = r.f(8); mc = r.f(8); }
    let ssx = 1, ssy = 1, csp = 0;
    s.cp = cp; s.tc = tc; s.mc = mc; if (mono) r.f(1);
    else if (cp === 1 && tc === 13 && mc === 0) { ssx = ssy = 0; }
    else { r.f(1); if (s.profile === 0) { ssx = ssy = 1; } else if (s.profile === 1) { ssx = ssy = 0; } else if (bd === 12) { ssx = r.f(1); ssy = ssx ? r.f(1) : 0; } else { ssx = 1; ssy = 0; } if (ssx && ssy) csp = r.f(2); }
    return Object.assign(s, { level, tier, hbd, twelve, mono, ssx, ssy, csp });
  }
  /** One encoded key frame → { data (item bytes, with the sequence header), av1C box }. */
  function prepare(chunk) {
    const list = obus(chunk), seq = list.find(o => o.type === 1); if (!seq) throw new Error('The AV1 encoder gave no sequence header.');
    const i = seqInfo(seq.payload), data = cat(list.filter(o => o.type !== 2).map(o => o.bytes)); // no temporal delimiters in an image item
    const av1C = box('av1C', u8(0x81, (i.profile << 5) | i.level, (i.tier << 7) | (i.hbd << 6) | (i.twelve << 5) | (i.mono << 4) | (i.ssx << 3) | (i.ssy << 2) | i.csp, 0), seq.bytes);
    return { data, av1C };
  }
  /** The AVIF file: one color image (item 1) and, when given, its alpha (item 2). */
  function container(w, h, color, alpha) {
    const items = [{ id: 1, ...color }].concat(alpha ? [{ id: 2, ...alpha }] : []);
    const ftyp = box('ftyp', str('avif'), u32(0), str('avif'), str('mif1'), str('miaf'));
    const ispe = full('ispe', 0, 0, u32(w), u32(h)), pixi = full('pixi', 0, 0, u8(3, 8, 8, 8));
    const N = SB.avif.nclx, colr = box('colr', str('nclx'), u16(N[0]), u16(N[1]), u16(N[2]), u8(N[3] ? 0x80 : 0)); // how the colors were turned into YUV
    const ipco = box('ipco', ispe, color.av1C, pixi, colr, alpha ? [alpha.av1C, full('auxC', 0, 0, cstr('urn:mpeg:mpegB:cicp:systems:auxiliary:alpha'))] : null);
    const ipma = full('ipma', 0, 0, u32(items.length), u16(1), u8(4, 1, 0x80 | 2, 3, 4), alpha ? [u16(2), u8(4, 1, 0x80 | 5, 3, 0x80 | 6)] : null);
    const meta = offs => full('meta', 0, 0,
      full('hdlr', 0, 0, u32(0), str('pict'), u32(0), u32(0), u32(0), cstr('')),
      full('pitm', 0, 0, u16(1)),
      full('iloc', 0, 0, u8(0x44, 0x00), u16(items.length), items.map((it, k) => [u16(it.id), u16(0), u16(1), u32(offs[k]), u32(it.data.length)])),
      full('iinf', 0, 0, u16(items.length), items.map(it => full('infe', 2, 0, u16(it.id), u16(0), str('av01'), cstr('')))),
      alpha ? full('iref', 0, 0, box('auxl', u16(2), u16(1), u16(1))) : null,
      box('iprp', ipco, ipma));
    const mlen = meta(items.map(() => 0)).length; let at = ftyp.length + mlen + 8; const offs = items.map(it => { const o = at; at += it.data.length; return o; });
    return new Blob([ftyp, meta(offs), box('mdat', items.map(it => it.data))], { type: 'image/avif' });
  }

  // ---------- encoding
  const level = (w, h) => { const a = w * h, mx = Math.max(w, h); return a <= 2228224 && mx <= 4096 ? '08' : a <= 8912896 && mx <= 8192 ? '12' : '16'; }; // AV1 levels 4.0, 5.0, 6.0
  const cfgFor = (w, h, quant, q) => Object.assign({ codec: `av01.0.${level(w, h)}M.08`, width: w, height: h, latencyMode: 'quality' }, quant ? { bitrateMode: 'quantizer' } : { bitrate: Math.round(Math.max(3e5, w * h * (2 + q * 10))) });
  async function supported() { if (!('VideoEncoder' in window)) return false; try { return !!(await VideoEncoder.isConfigSupported(cfgFor(64, 64, false, 0.5))).supported; } catch (e) { return false; } }
  /** An encoder for pictures of one size (reused for every frame of an export). */
  async function encoder(w, h, quality = 0.8) {
    if (!('VideoEncoder' in window)) throw new Error('this browser can’t encode AVIF. Try PNG or WebP.');
    let quant = false; try { quant = !!(await VideoEncoder.isConfigSupported(cfgFor(w, h, true))).supported; } catch (e) {}
    const cfg = cfgFor(w, h, quant, quality); if (!(await VideoEncoder.isConfigSupported(cfg)).supported) throw new Error(`this browser can’t encode a ${w}×${h} AVIF. Try a smaller size, or PNG or WebP.`);
    const qv = Math.round(52 - quality * 44), make = () => { const st = { out: null, err: null }; st.enc = new VideoEncoder({ output: ch => { const b = new Uint8Array(ch.byteLength); ch.copyTo(b); st.out = b; }, error: e => st.err = e }); st.enc.configure(cfg); return st; };
    const color = make(); let alphaEnc = null, n = 0, gray = null;
    const one = async (st, src) => { const vf = new VideoFrame(src, { timestamp: n * 1000, alpha: 'discard' }); st.enc.encode(vf, quant ? { keyFrame: true, av1: { quantizer: qv } } : { keyFrame: true }); vf.close(); await st.enc.flush(); if (st.err) throw st.err; return prepare(st.out); };
    return {
      async encode(cv, keepAlpha) {
        n++; let src = cv, a = null;
        if (keepAlpha) {
          const x = cv.getContext('2d'), img = x.getImageData(0, 0, w, h), d = img.data; let opaque = true;
          for (let i = 3; i < d.length; i += 4) if (d[i] < 255) { opaque = false; break; }
          if (!opaque) { // colors without their transparency, and the transparency as a gray picture
            const al = new Uint8ClampedArray(d.length); for (let i = 0; i < d.length; i += 4) { al[i] = al[i + 1] = al[i + 2] = d[i + 3]; al[i + 3] = 255; d[i + 3] = 255; }
            if (!gray) gray = [0, 1].map(() => Object.assign(document.createElement('canvas'), { width: w, height: h }));
            gray[0].getContext('2d').putImageData(img, 0, 0); gray[1].getContext('2d').putImageData(new ImageData(al, w, h), 0, 0);
            src = gray[0]; alphaEnc = alphaEnc || make(); a = await one(alphaEnc, gray[1]);
          }
        }
        const c = await one(color, src);
        return container(w, h, c, a);
      },
      close() { try { color.enc.close(); } catch (e) {} if (alphaEnc) try { alphaEnc.enc.close(); } catch (e) {} },
    };
  }
  // Chrome's AV1 encoder turns RGB into BT.601 limited-range YUV; the colr box says so (cp 1, tc 13, mc 6, limited)
  SB.avif = { nclx: [1, 13, 6, 0], supported, encoder, container, prepare, seqInfo };
})(window.SB);
