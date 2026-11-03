/* Geometry for drawings.

   A frame holds a list of strokes. There are four kinds:
     freehand  { c, s, pts:[x,y,...], tx?, bs? }          brush lines
     eraser    { er:1, s, pts }                            cuts the strokes below it
     fill      { f:1, c, loops:[[x,y,...]], seed?, links? }  bucket fills
     path      { b:1, subs:[{ p, cl }], c, s, fc, fr, op }  bezier paths (pen, shapes, SVG)
   A path sub's p is [x0,y0, c1x,c1y, c2x,c2y, x1,y1, ...]: a start point
   followed by one (control, control, anchor) triple per curve segment. */
'use strict';
(function (SB) {
  const U = SB.util;
  const K = 0.5523; // circle-to-bezier constant

  const G = SB.paths = {
    // ---------- building bezier subs
    /** Straight polygon or polyline to a bezier sub (handles sit on the anchors). */
    poly(pts, closed) { const p = [pts[0], pts[1]]; const n = pts.length / 2; for (let i = 1; i < n + (closed ? 1 : 0); i++) { const a = (i - 1) % n, b = i % n; p.push(pts[a * 2], pts[a * 2 + 1], pts[b * 2], pts[b * 2 + 1], pts[b * 2], pts[b * 2 + 1]); } return { p: p.map(U.r1), cl: closed ? 1 : 0 }; },
    ellipse(cx, cy, rx, ry) { const kx = rx * K, ky = ry * K; return { cl: 1, p: [cx + rx, cy, cx + rx, cy + ky, cx + kx, cy + ry, cx, cy + ry, cx - kx, cy + ry, cx - rx, cy + ky, cx - rx, cy, cx - rx, cy - ky, cx - kx, cy - ry, cx, cy - ry, cx + kx, cy - ry, cx + rx, cy - ky, cx + rx, cy].map(U.r2) }; },
    roundRect(x, y, w, h, r) {
      r = Math.min(r, w / 2, h / 2); if (r <= 0.01) return G.poly([x, y, x + w, y, x + w, y + h, x, y + h], true); const k = r * (1 - K), x1 = x + w, y1 = y + h;
      const p = [x + r, y], L = (ax, ay) => p.push(p[p.length - 2], p[p.length - 1], ax, ay, ax, ay), C = (a, b, c, d, e, f) => p.push(a, b, c, d, e, f);
      L(x1 - r, y); C(x1 - k, y, x1, y + k, x1, y + r); L(x1, y1 - r); C(x1, y1 - k, x1 - k, y1, x1 - r, y1); L(x + r, y1); C(x + k, y1, x, y1 - k, x, y1 - r); L(x, y + r); C(x, y + k, x + k, y, x + r, y);
      return { p: p.map(U.r2), cl: 1 };
    },
    /** Catmull-Rom spline through points to bezier (exact). corners[i] makes point i sharp. */
    fromSpline(pts, closed, corners) {
      const n = pts.length / 2; if (n < 2) return { p: pts.slice(), cl: 0 };
      const W = i => closed ? ((i % n) + n) % n : U.clamp(i, 0, n - 1), P = i => [pts[W(i) * 2], pts[W(i) * 2 + 1]], C = i => !!(corners && corners[W(i)]);
      const p = [pts[0], pts[1]], segs = closed ? n : n - 1;
      for (let i = 0; i < segs; i++) {
        const p1 = P(i), p2 = P(i + 1), p0 = C(i) ? p1 : P(i - 1), p3 = C(i + 1) ? p2 : P(i + 2);
        p.push(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6, p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]);
      }
      return { p: p.map(U.r2), cl: closed ? 1 : 0 };
    },
    /** Freehand points to a light bezier path (used by "Simple curve" brush mode): as few points as keep
        the line within eps of where you drew it; sharp turns stay sharp. */
    fitFreehand(pts, eps, closed) { return G.fitSub(pts, eps, { closed }); },
    /** Points to a bezier sub { p, cl, m }: fitted curves (Schneider's method) within err; corners where the
        line turns more than `corner` degrees within `r` (they get free handles), smooth points elsewhere. */
    fitSub(pts, err, opt = {}) {
      const segs = fitBeziers(pts, err, opt), p = [], m = [];
      if (!segs.length) return { p: pts.slice(0, 2).map(U.r2), cl: 0 };
      p.push(segs[0].b[0][0], segs[0].b[0][1]); m.push(0);
      segs.forEach((sg, i) => { const b = sg.b; p.push(b[1][0], b[1][1], b[2][0], b[2][1], b[3][0], b[3][1]); m.push(i < segs.length - 1 ? (segs[i + 1].corner ? 'f' : 's') : 0); });
      const sub = { p: p.map(U.r2), cl: opt.closed ? 1 : 0 }; if (m.some(Boolean)) sub.m = m; return sub;
    },
    fitBeziers: (pts, err, opt) => fitBeziers(pts, err, opt),
    /** Smooth the bezier subs of path s where weight(x, y) > 0 (0..1): anchors move towards the middle of
        their neighbours and their handles line up along the curve. Returns true when something changed. */
    smoothSubs(s, weight) {
      let hit = false;
      for (const sub of s.subs) {
        const p = sub.p, n = (p.length - 2) / 6 + 1; if (n < 2) continue; const q = p.slice();
        for (let i = 0; i < n; i++) {
          const closedEnd = sub.cl && (i === 0 || i === n - 1); if (!sub.cl && (i === 0 || i === n - 1)) continue; if (sub.cl && i === n - 1) continue;
          const ax = q[6 * i], ay = q[6 * i + 1], w = U.clamp(weight(ax, ay), 0, 1); if (w < 0.002) continue;
          const pi = i > 0 ? i - 1 : n - 2, ni = i < n - 1 ? i + 1 : 1, px = q[6 * pi], py = q[6 * pi + 1], nx = q[6 * ni], ny = q[6 * ni + 1];
          const inI = i > 0 ? 6 * i - 2 : 6 * (n - 1) - 2, outI = 6 * i + 2;
          const dx = ((px + nx) / 2 - ax) * w * 0.35, dy = ((py + ny) / 2 - ay) * w * 0.35, Ax = ax + dx, Ay = ay + dy;
          let tx = nx - px, ty = ny - py; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
          const li = Math.hypot(q[inI] - ax, q[inI + 1] - ay) || tl / 6, lo = Math.hypot(q[outI] - ax, q[outI + 1] - ay) || tl / 6;
          p[6 * i] = Ax; p[6 * i + 1] = Ay;
          p[inI] = U.lerp(q[inI] + dx, Ax - tx * li, w); p[inI + 1] = U.lerp(q[inI + 1] + dy, Ay - ty * li, w);
          p[outI] = U.lerp(q[outI] + dx, Ax + tx * lo, w); p[outI + 1] = U.lerp(q[outI + 1] + dy, Ay + ty * lo, w);
          if (closedEnd) { p[6 * (n - 1)] = Ax; p[6 * (n - 1) + 1] = Ay; }
          if (sub.m && sub.m[i] && sub.m[i] !== 's' && w > 0.3) sub.m[i] = 's';
          hit = true;
        }
        if (hit) for (let k = 0; k < p.length; k++) p[k] = U.r2(p[k]);
      }
      return hit;
    },
    /** Fewer points on a path: fit its curves again within err. */
    refit(s, err) { s.subs = s.subs.map(sub => { const f = G.flatten(sub, Math.max(0.2, err / 4)); if (sub.cl) f.push(f[0], f[1]); const r = G.fitSub(f, err, { closed: !!sub.cl }); return r.p.length >= 8 || !sub.cl ? r : sub; }); G.touch(s); },

    // ---------- built-in shapes as bezier subs (so shapes draw, boil, and convert like paths)
    star(w, h, n = 5) { const a = [], k = 2 * n, inner = n === 5 ? 0.45 : U.clamp(0.62 - 0.3 / n, 0.35, 0.6); for (let i = 0; i < k; i++) { const t = -Math.PI / 2 + i * Math.PI / n, r = i % 2 ? inner : 1; a.push(Math.cos(t) * r, Math.sin(t) * r); } return G.fitBox(a, w, h); },
    /** A regular polygon with n corners, the first at the top, stretched to fill a w × h box (3 corners: the old triangle). */
    polygon(w, h, n = 3) { const a = []; for (let i = 0; i < n; i++) { const t = -Math.PI / 2 + i * 2 * Math.PI / n; a.push(Math.cos(t), Math.sin(t)); } return G.fitBox(a, w, h); },
    /** Points [x, y, …] scaled and moved to fill the box centred on 0 (w × h). */
    fitBox(a, w, h) { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (let i = 0; i < a.length; i += 2) { x0 = Math.min(x0, a[i]); x1 = Math.max(x1, a[i]); y0 = Math.min(y0, a[i + 1]); y1 = Math.max(y1, a[i + 1]); }
      const sx = w / ((x1 - x0) || 1), sy = h / ((y1 - y0) || 1); return a.map((v, i) => i % 2 ? (v - y0) * sy - h / 2 : (v - x0) * sx - w / 2); },
    arrow(w, h) { const x = -w / 2, y = -h / 2, bh = h * 0.42, hx = x + w * 0.6; return [x, -bh / 2, hx, -bh / 2, hx, y, w / 2, 0, hx, h / 2, hx, bh / 2, x, bh / 2]; },
    shape(kind, w, h, round, sides) {
      const x = -w / 2, y = -h / 2;
      switch (kind) {
        case 'rect': return [G.poly([x, y, x + w, y, x + w, y + h, x, y + h], true)];
        case 'round': return [G.roundRect(x, y, w, h, Math.min(w, h) * U.clamp(round ?? 18, 0, 50) / 100)]; // round: % of the short side (50 = pill)
        case 'ellipse': return [G.ellipse(0, 0, w / 2, h / 2)];
        case 'triangle': return [G.poly(G.polygon(w, h, U.clamp(Math.round(sides || 3), 3, 60)), true)];
        case 'star': return [G.poly(G.star(w, h, U.clamp(Math.round(sides || 5), 3, 60)), true)];
        case 'arrow': return [G.poly(G.arrow(w, h), true)];
        case 'bubble': { const bh = h * 0.78; return [G.roundRect(x, y, w, bh, Math.min(w, bh) * 0.3), G.poly([x + w * 0.22, y + bh - 1, x + w * 0.14, h / 2, x + w * 0.4, y + bh - 1], true)]; }
        case 'line': return [G.poly([x, 0, w / 2, 0], false)];
      }
      return [G.poly([x, y, x + w, y, x + w, y + h, x, y + h], true)];
    },

    // ---------- drawing and flattening
    trace(ctx, subs, map) {
      for (const s of subs) {
        const p = map ? mapList(s.p, map) : s.p; if (p.length < 2) continue;
        ctx.moveTo(p[0], p[1]);
        for (let i = 2; i + 5 < p.length; i += 6) ctx.bezierCurveTo(p[i], p[i + 1], p[i + 2], p[i + 3], p[i + 4], p[i + 5]);
        if (s.cl) ctx.closePath();
      }
    },
    /** Bezier sub to a polyline (for bounds, hit tests, fills, draw-on). */
    flatten(sub, tol = 0.5) {
      const p = sub.p, out = [p[0], p[1]];
      for (let i = 2; i + 5 < p.length; i += 6) {
        const x0 = p[i - 2], y0 = p[i - 1], [a, b, c, d, e, f] = p.slice(i, i + 6);
        const L = Math.hypot(a - x0, b - y0) + Math.hypot(c - a, d - b) + Math.hypot(e - c, f - d);
        if (Math.abs(a - x0) + Math.abs(b - y0) + Math.abs(c - e) + Math.abs(d - f) < 1e-6) { out.push(e, f); continue; }
        const straight = Math.abs((a - x0) * (f - y0) - (b - y0) * (e - x0)) + Math.abs((c - x0) * (f - y0) - (d - y0) * (e - x0)) < 1e-3 * (L * L + 1); // handles on the line: no curve
        const n = straight ? 1 : U.clamp(Math.ceil(L / (tol * 4)), 12, 160); // at least 12 steps, so a curve stays round even when the drawing is scaled up or zoomed in
        for (let j = 1; j <= n; j++) { const u = j / n, m = 1 - u; out.push(m * m * m * x0 + 3 * m * m * u * a + 3 * m * u * u * c + u * u * u * e, m * m * m * y0 + 3 * m * m * u * b + 3 * m * u * u * d + u * u * u * f); }
      }
      return out;
    },
    /** Polylines of any stroke (cached). Closed bezier subs repeat their first point. */
    lines(s) {
      if (s.f) return s.loops;
      if (!s.b) return [s.pts];
      const key = s._k || 0; if (s._flat && s._flatK === key) return s._flat;
      const r = s.subs.map(sub => { const f = G.flatten(sub); if (sub.cl) f.push(f[0], f[1]); return f; });
      Object.defineProperty(s, '_flat', { value: r, writable: true, configurable: true, enumerable: false }); s._flatK = key; return r;
    },
    /** Width along a line drawn with the Width tool: wp holds factors at even steps from start (u 0) to end (u 1). */
    prof(wp, u) { if (!wp || !wp.length) return 1; const x = U.clamp(u, 0, 1) * (wp.length - 1), i = Math.floor(x), f = x - i; return i >= wp.length - 1 ? wp[wp.length - 1] : wp[i] * (1 - f) + wp[i + 1] * f; },
    /** The widest a stroke's width profile goes (1 when it has none). */
    wmax(s) { let m = s.wp ? Math.max(...s.wp) : 1; if (s.b) for (const sb of s.subs) if (sb.wp) m = Math.max(m, ...sb.wp); return m; },
    /** A line as filled outlines at width w (round ends and joins): closed point lists (a ring gives an outer and a reversed inner loop). */
    lineOutline(pts, w, wp) {
      const P = []; for (let i = 0; i < pts.length; i += 2) { const q = [pts[i], pts[i + 1]]; if (!P.length || Math.hypot(q[0] - P[P.length - 1][0], q[1] - P[P.length - 1][1]) > 1e-3) P.push(q); }
      const r = Math.max(0.5, w / 2), arc = (c, a0, a1, out, rr = r) => { const n = Math.max(3, Math.ceil(Math.abs(a1 - a0) / 0.35)); for (let k = 1; k < n; k++) { const a = a0 + (a1 - a0) * k / n; out.push(U.r2(c[0] + Math.cos(a) * rr), U.r2(c[1] + Math.sin(a) * rr)); } };
      if (P.length < 2) { const o = [], c = P[0] || [0, 0]; for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2; o.push(U.r2(c[0] + Math.cos(a) * r), U.r2(c[1] + Math.sin(a) * r)); } return [o]; }
      const closed = P.length > 3 && Math.hypot(P[0][0] - P[P.length - 1][0], P[0][1] - P[P.length - 1][1]) < Math.max(0.5, r * 0.2); if (closed) P.pop();
      const n0 = P.length, al = [0]; for (let i = 1; i < n0; i++) al.push(al[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
      const RA = al.map(a => wp ? r * Math.max(0.05, G.prof(wp, a / (al[n0 - 1] || 1))) : r);
      const n = P.length, nrm = (a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1; return [-dy / L, dx / L]; };
      const side = sgn => { const o = []; for (let i = 0; i < n; i++) {
        const nA = i > 0 ? nrm(P[i - 1], P[i]) : closed ? nrm(P[n - 1], P[0]) : null, nB = i < n - 1 ? nrm(P[i], P[i + 1]) : closed ? nrm(P[n - 1], P[0]) : null;
        const m = nA && nB ? [nA[0] + nB[0], nA[1] + nB[1]] : nA || nB, L = Math.hypot(m[0], m[1]), d = nA && nB ? (L > 0.3 ? 2 / L : 1) : 1, u = L > 1e-6 ? [m[0] / L, m[1] / L] : (nA || nB);
        const k = Math.min(3, nA && nB ? d / Math.max(1e-6, (u[0] * nA[0] + u[1] * nA[1])) / d : 1); o.push(U.r2(P[i][0] + sgn * u[0] * RA[i] * k), U.r2(P[i][1] + sgn * u[1] * RA[i] * k)); } return o; };
      const left = side(1), right = side(-1), rev = a => { const o = []; for (let i = a.length - 2; i >= 0; i -= 2) o.push(a[i], a[i + 1]); return o; };
      if (closed) return [left, rev(right)];
      const out = left.slice(), a = P[n - 1], b = P[n - 2], ae = Math.atan2(a[1] - b[1], a[0] - b[0]);
      arc(a, ae + Math.PI / 2, ae - Math.PI / 2, out, RA[n - 1]); out.push(...rev(right));
      const s0 = P[0], s1 = P[1], as = Math.atan2(s0[1] - s1[1], s0[0] - s1[0]); arc(s0, as + Math.PI / 2, as - Math.PI / 2, out, RA[0]); return [out];
    },
    /** Outline Stroke: a line (or a path's line) as a filled bezier shape of the same width and color; null when there is no line. */
    outlineStroke(s, look) { // look: follow the brush as drawn (thin ends, wobble, dashes, rough doubled lines) and keep its texture and opacity
      if (s.f || s.er || !(s.s > 0)) return null;
      if (look) return G.outlineLook(s);
      const subs = []; G.lines(s).forEach((L, li) => { for (const loop of G.lineOutline(L, s.s, s.b ? (s.subs[li] || {}).wp : s.wp)) { const f = loop.length >= 40 ? G.fitSub(loop.concat(loop[0], loop[1]), Math.max(0.15, s.s * 0.012), { closed: true }) : null; subs.push(f && f.p.length >= 8 ? f : G.poly(loop, true)); } });
      return subs.length ? { b: 1, subs, c: s.c, s: 0, fc: s.c } : null;
    },
    /** Line → fill keeping the brush: the outline of the line as the brush draws it (js/render/strokes.js), a fill with its texture (ftx) and opacity. */
    outlineLook(s) {
      const bs = s.bs || {}, ts = bs.ts || 0, te = bs.te || 0, styled = ts || te || bs.jit || s.tx === 'dashed' || s.tx === 'rough', subs = [];
      const cut = (p, arc, a, b) => { const out = [], at = t => { let i = 1; while (i < arc.length - 1 && arc[i] < t) i++; const f = (t - arc[i - 1]) / ((arc[i] - arc[i - 1]) || 1); return [p[i * 2 - 2] + (p[i * 2] - p[i * 2 - 2]) * f, p[i * 2 - 1] + (p[i * 2 + 1] - p[i * 2 - 1]) * f]; };
        out.push(...at(a)); for (let i = 0; i < arc.length; i++) if (arc[i] > a && arc[i] < b) out.push(p[i * 2], p[i * 2 + 1]); out.push(...at(b)); return out; };
      const dashes = (p, wp) => { const n = p.length / 2, arc = [0]; for (let i = 1; i < n; i++) arc.push(arc[i - 1] + Math.hypot(p[i * 2] - p[i * 2 - 2], p[i * 2 + 1] - p[i * 2 - 1]));
        const L = arc[n - 1], w = Math.max(0.1, s.s), on = Math.max(0.01, w * (bs.dl ?? 1.8)), off = w * (bs.dg ?? 1.4), out = [];
        for (let t = 0; t < L - 1e-6; t += on + off) { const t1 = Math.min(L, t + on); out.push([cut(p, arc, t, t1), wp ? Array.from({ length: 8 }, (_, k) => G.prof(wp, (t + (t1 - t) * k / 7) / (L || 1))) : null]); }
        return out.length ? out : [[p, wp]]; };
      G.lines(s).forEach((L, li) => {
        const wp0 = s.b ? (s.subs[li] || {}).wp : s.wp; let p = styled ? (s.b ? G.densify(L, Math.max(2, s.s * 0.6)) : G.resampled(s)) : L, wp = wp0;
        if (bs.jit) p = G.jitter(p, { amp: Math.max(0.5, s.s * bs.jit), step: 0, seed: 7 });
        if (ts || te) { wp = []; for (let k = 0; k < 48; k++) { const u = k / 47; let f = 1; if (ts) f = Math.min(f, Math.pow(Math.min(1, u / ts), 0.6)); if (te) f = Math.min(f, Math.pow(Math.min(1, (1 - u) / te), 0.6)); wp.push(U.r3(Math.max(0.08, f * G.prof(wp0, u)))); } }
        const lines = s.tx === 'rough' ? [0, 1].map(k => [G.jitter(p, { amp: Math.max(1, s.s * 0.35), step: k * 7 + 1, seed: 11 + k }), s.s * 0.5]) : [[p, s.s]];
        for (const [q, w] of lines) for (const [d, wq] of (s.tx === 'dashed' ? dashes(q, wp) : [[q, wp]])) for (const loop of G.lineOutline(d, w, wq)) {
          const f = loop.length >= 40 ? G.fitSub(loop.concat(loop[0], loop[1]), Math.max(0.15, s.s * 0.012), { closed: true }) : null; subs.push(f && f.p.length >= 8 ? f : G.poly(loop, true)); }
      });
      if (!subs.length) return null;
      const out = { b: 1, subs, c: s.c, s: 0, fc: s.c }, op = (s.op ?? 1) * (bs.op ?? 1);
      if (['pencil', 'chalk', 'marker', 'soft'].includes(s.tx)) { out.ftx = s.tx; out.ftw = s.s; } if (op < 1) out.op = U.r3(op);
      return out;
    },
    /** Call after editing a stroke's points so caches refresh. */
    touch(s) { s._k = (s._k || 0) + 1; s._flat = null; s._res = null; },
    bounds(strokes, b = U.emptyBox()) {
      for (const s of strokes) { if (s.er) continue; const h = s.f ? 0 : (s.s || 0) / 2 * G.wmax(s); for (const L of G.lines(s)) for (let i = 0; i < L.length; i += 2) { U.growBox(b, L[i] - h, L[i + 1] - h); U.growBox(b, L[i] + h, L[i + 1] + h); } }
      return b;
    },
    length(p) { let L = 0; for (let i = 2; i < p.length; i += 2) L += Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]); return L; },
    trim(p, len) { const out = [p[0], p[1]]; for (let i = 2; i < p.length; i += 2) { const d = Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]); if (len <= d) { const u = d ? len / d : 0; out.push(p[i - 2] + (p[i] - p[i - 2]) * u, p[i - 1] + (p[i + 1] - p[i - 1]) * u); return out; } len -= d; out.push(p[i], p[i + 1]); } return out; },
    /** Evenly spaced points along a freehand line (cached), for boil and draw-on. */
    resampled(s) {
      if (s.b) return G.lines(s)[0];
      if (s._res && s._resN === s.pts.length) return s._res;
      const p = s.pts, out = [p[0], p[1]];
      for (let i = 2; i < p.length; i += 2) { const ax = p[i - 2], ay = p[i - 1], bx = p[i], by = p[i + 1], k = Math.max(1, Math.floor(Math.hypot(bx - ax, by - ay) / 10)); for (let j = 1; j <= k; j++) out.push(ax + (bx - ax) * j / k, ay + (by - ay) * j / k); }
      Object.defineProperty(s, '_res', { value: out, writable: true, configurable: true, enumerable: false }); s._resN = p.length; return out;
    },
    /** More points along long straight stretches (so a line bends smoothly when bones deform it). */
    densify(p, step = 12, closed) {
      if (p.length < 4) return p; const out = [p[0], p[1]]; if (closed) p = p.concat([p[0], p[1]]);
      for (let i = 2; i < p.length; i += 2) { const ax = p[i - 2], ay = p[i - 1], bx = p[i], by = p[i + 1], k = Math.min(200, Math.ceil(Math.hypot(bx - ax, by - ay) / step)); for (let j = 1; j < k; j++) out.push(ax + (bx - ax) * j / k, ay + (by - ay) * j / k); out.push(bx, by); }
      if (closed) out.length -= 2;
      return out;
    },
    /** Ramer–Douglas–Peucker simplification. */
    rdp(p, eps, closed) {
      let pts = closed ? p.concat([p[0], p[1]]) : p; const n = pts.length / 2; if (n < 3) return p.slice();
      const keep = new Uint8Array(n); keep[0] = keep[n - 1] = 1; const st = [[0, n - 1]];
      while (st.length) { const [a, b] = st.pop(); let md = eps, mi = -1; for (let i = a + 1; i < b; i++) { const d = Math.sqrt(U.distSeg2(pts[i * 2], pts[i * 2 + 1], pts[a * 2], pts[a * 2 + 1], pts[b * 2], pts[b * 2 + 1])); if (d > md) { md = d; mi = i; } } if (mi >= 0) { keep[mi] = 1; st.push([a, mi], [mi, b]); } }
      const out = []; for (let i = 0; i < n; i++) if (keep[i]) out.push(U.r1(pts[i * 2]), U.r1(pts[i * 2 + 1])); if (closed) out.splice(-2, 2); return out;
    },
    smoothPts(p, iters, closed) {
      let a = p.slice(); const n = a.length / 2;
      for (let it = 0; it < iters; it++) { const b = a.slice(); for (let i = 0; i < n; i++) { if (!closed && (i === 0 || i === n - 1)) continue; const pi = ((i - 1) + n) % n, ni = (i + 1) % n; b[i * 2] = (a[pi * 2] + 2 * a[i * 2] + a[ni * 2]) / 4; b[i * 2 + 1] = (a[pi * 2 + 1] + 2 * a[i * 2 + 1] + a[ni * 2 + 1]) / 4; } a = b; }
      return a.map(U.r1);
    },
    jitter(pts, b) { const o = new Array(pts.length), t = b.step * 13.7; for (let i = 0; i < pts.length; i += 2) { const n = i * 0.13; o[i] = pts[i] + U.noise(n + t, b.seed) * b.amp; o[i + 1] = pts[i + 1] + U.noise(n + t + 41, b.seed + 3) * b.amp; } return o; },
    /** Transform every point of a stroke by matrix M (and widths by k). Returns a copy. */
    transformStroke(s, M, k = U.matScale(M)) {
      const c = U.deep(s), tp = a => { const o = []; for (let i = 0; i < a.length; i += 2) { const q = M.transformPoint(U.pt(a[i], a[i + 1])); o.push(U.r2(q.x), U.r2(q.y)); } return o; };
      if (c.f) { c.loops = c.loops.map(tp); if (c.seed) { const q = M.transformPoint(U.pt(c.seed[0], c.seed[1])); c.seed = [U.r1(q.x), U.r1(q.y)]; } }
      else if (c.b) { c.subs.forEach(sb => sb.p = tp(sb.p)); if (c.s) c.s = U.r2(c.s * k); }
      else { c.pts = tp(c.pts); c.s = U.r2(c.s * k); }
      return c;
    },
    /** Old project files used spline lines (v:1) and polylines (v:2); turn them into bezier paths. */
    migrate(s) {
      if (!s.v || s.b) return s;
      const sub = s.v === 2 ? G.poly(s.pts, !!s.cl) : G.fromSpline(s.pts, !!s.cl, s.cn);
      const n = { b: 1, subs: [sub], c: s.c, s: s.s || 0 }; if (s.fc) n.fc = s.fc; if (s.id) n.id = s.id; if (s.tx) n.tx = s.tx; if (s.bs) n.bs = s.bs; return n;
    },

    // ---------- arcs (for SVG "A" commands)
    arcToBez(x1, y1, rx, ry, phi, fa, fs, x2, y2) {
      if (!rx || !ry) return [[x1, y1, x2, y2, x2, y2]];
      const sin = Math.sin(phi * Math.PI / 180), cos = Math.cos(phi * Math.PI / 180);
      const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2, x1p = cos * dx + sin * dy, y1p = -sin * dx + cos * dy;
      rx = Math.abs(rx); ry = Math.abs(ry); const lam = x1p * x1p / (rx * rx) + y1p * y1p / (ry * ry); if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam); }
      const sign = fa === fs ? -1 : 1, num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p, den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
      const co = sign * Math.sqrt(Math.max(0, num / den)), cxp = co * rx * y1p / ry, cyp = -co * ry * x1p / rx;
      const cx = cos * cxp - sin * cyp + (x1 + x2) / 2, cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
      const ang = (ux, uy, vx, vy) => { const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy); return a; };
      let t1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry), dt = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
      if (!fs && dt > 0) dt -= 2 * Math.PI; else if (fs && dt < 0) dt += 2 * Math.PI;
      const n = Math.ceil(Math.abs(dt) / (Math.PI / 2)), d = dt / n, k = 4 / 3 * Math.tan(d / 4), out = [];
      const P = t => [cx + rx * Math.cos(t) * cos - ry * Math.sin(t) * sin, cy + rx * Math.cos(t) * sin + ry * Math.sin(t) * cos];
      const D = t => [-rx * Math.sin(t) * cos - ry * Math.cos(t) * sin, -rx * Math.sin(t) * sin + ry * Math.cos(t) * cos];
      for (let i = 0; i < n; i++) { const a = t1 + i * d, b = a + d, pa = P(a), pb = P(b), da = D(a), db = D(b); out.push([pa[0] + k * da[0], pa[1] + k * da[1], pb[0] - k * db[0], pb[1] - k * db[1], pb[0], pb[1]]); }
      return out;
    },
  };
  // ---------- curve fitting (after P. J. Schneider, "An Algorithm for Automatically Fitting Digitized Curves")
  const v2 = { sub: (a, b) => [a[0] - b[0], a[1] - b[1]], add: (a, b) => [a[0] + b[0], a[1] + b[1]], mul: (a, k) => [a[0] * k, a[1] * k], dot: (a, b) => a[0] * b[0] + a[1] * b[1],
    len: a => Math.hypot(a[0], a[1]), norm: a => { const l = Math.hypot(a[0], a[1]) || 1; return [a[0] / l, a[1] / l]; } };
  const bzAt = (b, t) => { const m = 1 - t; return [m * m * m * b[0][0] + 3 * m * m * t * b[1][0] + 3 * m * t * t * b[2][0] + t * t * t * b[3][0], m * m * m * b[0][1] + 3 * m * m * t * b[1][1] + 3 * m * t * t * b[2][1] + t * t * t * b[3][1]]; };
  const bzD1 = (b, t) => { const m = 1 - t; return [3 * (m * m * (b[1][0] - b[0][0]) + 2 * m * t * (b[2][0] - b[1][0]) + t * t * (b[3][0] - b[2][0])), 3 * (m * m * (b[1][1] - b[0][1]) + 2 * m * t * (b[2][1] - b[1][1]) + t * t * (b[3][1] - b[2][1]))]; };
  const bzD2 = (b, t) => { const m = 1 - t; return [6 * (m * (b[2][0] - 2 * b[1][0] + b[0][0]) + t * (b[3][0] - 2 * b[2][0] + b[1][0])), 6 * (m * (b[2][1] - 2 * b[1][1] + b[0][1]) + t * (b[3][1] - 2 * b[2][1] + b[1][1]))]; };
  /** Flat points to cubic segments [{ b: [p0, p1, p2, p3], corner }] (corner: a sharp turn at the segment's start). */
  function fitBeziers(flat, err, opt = {}) {
    const P = []; for (let i = 0; i + 1 < flat.length; i += 2) { const q = [flat[i], flat[i + 1]]; if (!P.length || v2.len(v2.sub(q, P[P.length - 1])) > 1e-6) P.push(q); }
    if (opt.closed && P.length > 2 && v2.len(v2.sub(P[0], P[P.length - 1])) > 1e-6) P.push(P[0].slice());
    if (P.length < 2) return [];
    if (P.length === 2) { const d = v2.len(v2.sub(P[1], P[0])) / 3, t = v2.norm(v2.sub(P[1], P[0])); return [{ b: [P[0], v2.add(P[0], v2.mul(t, d)), v2.sub(P[1], v2.mul(t, d)), P[1]], corner: false }]; }
    const cuts = corners(P, opt.corner ?? 55, opt.r ?? err * 5), out = [];
    for (let c = 0; c + 1 < cuts.length; c++) {
      const a = cuts[c], b = cuts[c + 1], start = out.length;
      if (b - a === 1) { const d = v2.len(v2.sub(P[b], P[a])) / 3, t = v2.norm(v2.sub(P[b], P[a])); out.push({ b: [P[a], v2.add(P[a], v2.mul(t, d)), v2.sub(P[b], v2.mul(t, d)), P[b]] }); }
      else fitCubic(P, a, b, endTan(P, a, b, 1, opt.r ?? err * 5), endTan(P, b, a, -1, opt.r ?? err * 5), err * err, out, 0);
      if (out[start]) out[start].corner = c > 0;
    }
    return out;
  }
  /** Direction into the curve at index i (towards j), averaged over a short stretch so jitter does not tip it. */
  function endTan(P, i, j, dir, r) { let k = i + dir; while (k !== j && v2.len(v2.sub(P[k], P[i])) < r) k += dir; return v2.norm(v2.sub(P[k], P[i])); }
  /** Indices where the line turns sharply (plus both ends). */
  function corners(P, deg, r) {
    const n = P.length, out = [0], lim = Math.cos(deg * Math.PI / 180), turn = new Array(n).fill(1);
    for (let i = 1; i < n - 1; i++) {
      let a = i - 1; while (a > 0 && v2.len(v2.sub(P[i], P[a])) < r) a--; let b = i + 1; while (b < n - 1 && v2.len(v2.sub(P[b], P[i])) < r) b++;
      turn[i] = v2.dot(v2.norm(v2.sub(P[i], P[a])), v2.norm(v2.sub(P[b], P[i])));
    }
    for (let i = 2; i < n - 2; i++) if (turn[i] < lim && turn[i] <= turn[i - 1] && turn[i] <= turn[i + 1] && i - out[out.length - 1] > 1) out.push(i);
    out.push(n - 1); return out;
  }
  function fitCubic(P, first, last, t1, t2, err2, out, depth) {
    if (last - first === 1) { const d = v2.len(v2.sub(P[last], P[first])) / 3; out.push({ b: [P[first], v2.add(P[first], v2.mul(t1, d)), v2.add(P[last], v2.mul(t2, d)), P[last]] }); return; }
    let u = chord(P, first, last), bz = generate(P, first, last, u, t1, t2), [e, split] = maxErr(P, first, last, bz, u);
    if (e < err2) { out.push({ b: bz }); return; }
    if (e < err2 * 16) for (let it = 0; it < 16; it++) { const u2 = reparam(bz, P, first, last, u); bz = generate(P, first, last, u2, t1, t2); [e, split] = maxErr(P, first, last, bz, u2); if (e < err2) { out.push({ b: bz }); return; } u = u2; }
    if (depth > 30) { out.push({ b: bz }); return; }
    let tc = v2.sub(P[split - 1], P[split + 1]); if (v2.len(tc) < 1e-9) tc = v2.sub(P[split - 1], P[split]); tc = v2.norm(tc);
    fitCubic(P, first, split, t1, tc, err2, out, depth + 1); fitCubic(P, split, last, v2.mul(tc, -1), t2, err2, out, depth + 1);
  }
  function chord(P, first, last) { const u = [0]; for (let i = first + 1; i <= last; i++) u.push(u[u.length - 1] + v2.len(v2.sub(P[i], P[i - 1]))); const L = u[u.length - 1] || 1; return u.map(x => x / L); }
  function generate(P, first, last, u, t1, t2) {
    const p0 = P[first], p3 = P[last]; let c00 = 0, c01 = 0, c11 = 0, x0 = 0, x1 = 0;
    for (let i = 0; i < u.length; i++) {
      const t = u[i], m = 1 - t, b0 = m * m * m, b1 = 3 * t * m * m, b2 = 3 * t * t * m, b3 = t * t * t, a1 = v2.mul(t1, b1), a2 = v2.mul(t2, b2);
      c00 += v2.dot(a1, a1); c01 += v2.dot(a1, a2); c11 += v2.dot(a2, a2);
      const tmp = v2.sub(P[first + i], v2.add(v2.mul(p0, b0 + b1), v2.mul(p3, b2 + b3))); x0 += v2.dot(a1, tmp); x1 += v2.dot(a2, tmp);
    }
    const det = c00 * c11 - c01 * c01, seg = v2.len(v2.sub(p3, p0)); let al = det ? (x0 * c11 - x1 * c01) / det : 0, ar = det ? (c00 * x1 - c01 * x0) / det : 0;
    if (al < seg * 1e-3 || ar < seg * 1e-3 || al > seg * 3 || ar > seg * 3) al = ar = seg / 3;
    return [p0, v2.add(p0, v2.mul(t1, al)), v2.add(p3, v2.mul(t2, ar)), p3];
  }
  function maxErr(P, first, last, bz, u) { let mx = 0, at = Math.floor((first + last) / 2); for (let i = first + 1; i < last; i++) { const d = v2.sub(bzAt(bz, u[i - first]), P[i]), e = v2.dot(d, d); if (e >= mx) { mx = e; at = i; } } return [mx, at]; }
  function reparam(bz, P, first, last, u) { return u.map((t, i) => { const d = v2.sub(bzAt(bz, t), P[first + i]), q1 = bzD1(bz, t), q2 = bzD2(bz, t), den = v2.dot(q1, q1) + v2.dot(d, q2); if (!den) return t; return U.clamp(t - v2.dot(d, q1) / den, 0, 1); }); }

  function mapList(p, f) { const o = new Array(p.length); for (let i = 0; i < p.length; i += 2) { const q = f(p[i], p[i + 1]); o[i] = q[0]; o[i + 1] = q[1]; } return o; }
  G.mapList = mapList;
})(window.SB);
