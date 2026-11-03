/* Paint: a color value can be more than a plain color.
     '#RRGGBB'                       a color
     '#RRGGBBAA'                     a color you can see through (AA 00 = fully transparent)
     'grad:linear:90:#F00@0,#00F@1'  a gradient: linear (at an angle in degrees) or radial (angle unused), stops color@0…1;
                                     an optional ':cx,cy,len' places it: its middle (0…1 across the box) and its length (1 = fits the box)
     'tex:<picture id>:<scale>'      a picture repeated as a pattern (the brush pictures: starters and your own)
   SB.paint.style(ctx, value, box) gives what to put in fillStyle / strokeStyle (box: the area it covers, in the same space);
   SB.paint.solid(value) one plain color for places that need one (exports, morphs, grain textures). */
'use strict';
(function (SB) {
  const U = SB.util;
  const kind = v => typeof v !== 'string' ? 'none' : v.startsWith('grad:') ? 'grad' : v.startsWith('tex:') ? 'tex' : 'solid';
  function parse(v) {
    const k = kind(v);
    if (k === 'grad') { const [, type, ang, stops, geo] = v.split(':'), [gx, gy, gl] = (geo || '').split(',').map(Number); return { kind: k, type: type === 'radial' ? 'radial' : 'linear', angle: +ang || 0, cx: isFinite(gx) && geo ? gx : 0.5, cy: isFinite(gy) && geo ? gy : 0.5, len: isFinite(gl) && gl > 0 ? gl : 1, stops: (stops || '').split(',').map(x => { const [c, p] = x.split('@'); return { c: c || '#000000', p: U.clamp(+p || 0, 0, 1) }; }).filter(x => x.c) }; }
    if (k === 'tex') { const parts = v.split(':'), sc = +parts[parts.length - 1]; return { kind: k, id: parts.slice(1, isFinite(sc) && parts.length > 2 ? -1 : undefined).join(':'), scale: isFinite(sc) && parts.length > 2 ? sc : 1 }; }
    return { kind: k, c: v };
  }
  const grad = (type, angle, stops, geo) => `grad:${type}:${Math.round(angle)}:${stops.map(s => `${s.c}@${U.r2(s.p)}`).join(',')}` + (geo && (Math.abs(geo.cx - 0.5) > 1e-3 || Math.abs(geo.cy - 0.5) > 1e-3 || Math.abs(geo.len - 1) > 1e-3) ? `:${U.r3(geo.cx)},${U.r3(geo.cy)},${U.r3(geo.len)}` : '');
  /** Where gradient p lies over box b: its middle (x, y), direction (dx, dy) and half length L (linear), or radius L (radial). */
  function geom(p, b) {
    const w = Math.max(1, b.x1 - b.x0), hh = Math.max(1, b.y1 - b.y0), x = b.x0 + (p.cx ?? 0.5) * w, y = b.y0 + (p.cy ?? 0.5) * hh, a = p.angle * Math.PI / 180, dx = Math.cos(a), dy = Math.sin(a);
    const L0 = p.type === 'radial' ? Math.hypot(w, hh) / 2 : (Math.abs(w * dx) + Math.abs(hh * dy)) / 2; return { x, y, dx, dy, L: L0 * (p.len ?? 1), L0, w, hh };
  }
  const tex = (id, scale = 1) => `tex:${id}:${U.r2(scale)}`;
  /** One plain color standing for v. */
  function solid(v) {
    const p = parse(v); if (p.kind === 'grad') return (p.stops[0] || { c: '#000000' }).c; if (p.kind === 'tex') { const t = SB.brushTex && SB.brushTex.texOf && SB.brushTex.texOf(p.id); return (t && t.avg) || '#8A879F'; }
    return v;
  }
  /** 0…1: how much you can see v (the alpha of #RRGGBBAA). */
  const alpha = v => { const c = solid(v); return typeof c === 'string' && /^#[0-9a-f]{8}$/i.test(c) ? parseInt(c.slice(7, 9), 16) / 255 : 1; };
  /** v as #RRGGBB (no alpha) and its alpha. */
  const split = v => { const c = typeof v === 'string' && /^#[0-9a-f]{6,8}$/i.test(v) ? v : '#000000'; return { hex: c.slice(0, 7).toUpperCase(), a: c.length === 9 ? parseInt(c.slice(7), 16) / 255 : 1 }; };
  const withAlpha = (hex, a) => a >= 0.999 ? hex.slice(0, 7).toUpperCase() : hex.slice(0, 7).toUpperCase() + Math.round(U.clamp(a, 0, 1) * 255).toString(16).padStart(2, '0').toUpperCase();
  const okBox = b => b && isFinite(b.x0) && isFinite(b.x1) && b.x1 > b.x0 - 1e-9 && b.y1 > b.y0 - 1e-9;
  function style(c, v, box) {
    const p = parse(v); if (p.kind === 'solid' || p.kind === 'none') return v;
    const b = okBox(box) ? box : { x0: -50, y0: -50, x1: 50, y1: 50 };
    if (p.kind === 'grad') {
      const q = geom(p, b); let g;
      if (p.type === 'radial') g = c.createRadialGradient(q.x, q.y, 0, q.x, q.y, Math.max(0.5, q.L));
      else g = c.createLinearGradient(q.x - q.dx * q.L, q.y - q.dy * q.L, q.x + q.dx * q.L, q.y + q.dy * q.L);
      const st = p.stops.length ? p.stops : [{ c: '#000000', p: 0 }]; for (const s of st) { try { g.addColorStop(s.p, s.c); } catch (e) {} } return g;
    }
    const img = SB.brushTex && SB.brushTex.image && SB.brushTex.image(p.id); if (!img) return solid(v); // still loading
    const pat = c.createPattern(img, 'repeat'); if (!pat) return solid(v);
    const t = SB.brushTex.texOf && SB.brushTex.texOf(p.id), iw = (t && t.w) || img.width || 64, k = (p.scale || 1) * 96 / Math.max(1, iw); // a tile about 96 units across at scale 1
    if (pat.setTransform) pat.setTransform(new DOMMatrix().translateSelf(b.x0, b.y0).scaleSelf(k, k)); return pat;
  }
  /** Two paints part-way (u): colors blend (alpha too); anything else switches half way. */
  function mix(a, b, u) {
    const ha = /^#[0-9a-f]{6}([0-9a-f]{2})?$/i, sa = typeof a === 'string' && ha.test(a), sb = typeof b === 'string' && ha.test(b);
    if (!sa || !sb) return u < 0.5 ? a : b;
    const A = split(a), B = split(b), rgb = U.hexRgb(A.hex).map((v, i) => U.lerp(v, U.hexRgb(B.hex)[i], u)); return withAlpha(U.rgbHex(...rgb), U.lerp(A.a, B.a, u));
  }
  SB.paint = { kind, parse, grad, geom, tex, solid, alpha, split, withAlpha, style, mix };
})(window.SB);
