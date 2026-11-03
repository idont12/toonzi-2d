/* Shape maths for the parts of a drawing: join, subtract, intersect and exclude (Edit points › Combine),
   and the Cut eraser, which really cuts lines and shapes apart.
   Every part is turned into areas (lines count with their width), the areas are combined with
   polygon-clipping (vendor/polygon-clipping.min.js, MIT), and the result is fitted back into
   editable bezier paths. */
'use strict';
(function (SB) {
  const U = SB.util, G = SB.paths, PC = () => window.polygonClipping;
  const r2 = v => Math.round(v * 100) / 100;
  const ring = flat => { const r = []; for (let i = 0; i + 1 < flat.length; i += 2) { const q = [r2(flat[i]), r2(flat[i + 1])]; const l = r[r.length - 1]; if (!l || l[0] !== q[0] || l[1] !== q[1]) r.push(q); } if (r.length > 2 && (r[0][0] !== r[r.length - 1][0] || r[0][1] !== r[r.length - 1][1])) r.push(r[0].slice()); return r.length >= 4 ? r : null; };
  const area = r => { let a = 0; for (let i = 0; i + 1 < r.length; i++) a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]; return a / 2; };
  const safe = (fn, ...a) => { try { return fn(...a); } catch (e) { console.warn('shape maths', e); return null; } };
  const union = list => { list = list.filter(m => m && m.length); if (!list.length) return []; if (list.length === 1) return list[0]; return safe(PC().union, ...list) || list[0]; };

  /** Closed loops to an area. evenodd: overlaps cancel; otherwise loops turning the other way from the biggest one are holes. */
  function loopsArea(loops, evenodd) {
    const rs = loops.map(ring).filter(Boolean); if (!rs.length) return [];
    if (evenodd) return rs.slice(1).reduce((m, r) => safe(PC().xor, m, [[r]]) || m, [[rs[0]]]);
    const big = rs.reduce((a, b) => Math.abs(area(b)) > Math.abs(area(a)) ? b : a), sg = Math.sign(area(big));
    const outs = rs.filter(r => Math.sign(area(r)) === sg), holes = rs.filter(r => Math.sign(area(r)) !== sg);
    const A = union(outs.map(r => [[r]])); return holes.length ? safe(PC().difference, A, ...holes.map(r => [[r]])) || A : A;
  }
  /** Everything a part covers on the page (fill and line), as a polygon-clipping MultiPolygon. */
  function areaOf(s) {
    if (s.er) return [];
    if (s.f) return loopsArea(s.loops, true);
    const parts = [];
    if (s.b && s.fc) parts.push(loopsArea(s.subs.filter(sb => sb.cl).map(sb => { const f = G.flatten(sb, 0.4); f.push(f[0], f[1]); return f; }), s.fr === 'evenodd'));
    if (s.s > 0) { const o = G.outlineStroke(s); if (o) parts.push(loopsArea(o.subs.map(sb => { const f = G.flatten(sb, 0.4); f.push(f[0], f[1]); return f; }), false)); }
    return union(parts);
  }
  /** A closed ring ([[x, y]…], last = first) as one closed bezier sub: sharp turns and long straight sides stay
      sharp, the parts between them are fitted into smooth curves. */
  function fitRing(r, err) {
    const P = r.slice(0, -1), n = P.length; if (n < 3) return null;
    const segL = i => { const a = P[i], b = P[(i + 1) % n]; return Math.hypot(b[0] - a[0], b[1] - a[1]); };
    const lens = P.map((_, i) => segL(i)), avg = lens.reduce((a, b) => a + b, 0) / n, long = Math.max(err * 12, avg * 4), lim = Math.cos(35 * Math.PI / 180);
    const corner = P.map((q, i) => { const a = P[(i - 1 + n) % n], b = P[(i + 1) % n], ux = q[0] - a[0], uy = q[1] - a[1], vx = b[0] - q[0], vy = b[1] - q[1], lu = Math.hypot(ux, uy) || 1, lv = Math.hypot(vx, vy) || 1;
      return (ux * vx + uy * vy) / (lu * lv) < lim || lens[i] > long || lens[(i - 1 + n) % n] > long; });
    const c0 = corner.indexOf(true); if (c0 < 0) return G.fitSub(r.flat(), err, { closed: true });
    const p = [P[c0][0], P[c0][1]], m = ['f']; let run = [P[c0]];
    const flush = () => {
      const a = run[0], b = run[run.length - 1];
      const segs = run.length === 2 ? [{ b: [a, [a[0] + (b[0] - a[0]) / 3, a[1] + (b[1] - a[1]) / 3], [b[0] - (b[0] - a[0]) / 3, b[1] - (b[1] - a[1]) / 3], b] }] : G.fitBeziers(run.flat(), err, { corner: 180 });
      segs.forEach((sg, k) => { p.push(sg.b[1][0], sg.b[1][1], sg.b[2][0], sg.b[2][1], sg.b[3][0], sg.b[3][1]); m.push(k < segs.length - 1 ? 's' : 'f'); });
    };
    for (let k = 1; k <= n; k++) { const i = (c0 + k) % n; run.push(P[i]); if (corner[i]) { flush(); run = [P[i]]; } }
    m[m.length - 1] = 'f';
    return { p: p.map(U.r2), cl: 1, m };
  }
  /** A MultiPolygon back to bezier subs. */
  function toSubs(mp, err = 0.3) {
    const subs = [];
    for (const poly of mp || []) for (const r of poly) { if (r.length < 4) continue; const f = safe(fitRing, r, err); subs.push(f && f.p.length >= 8 ? f : G.poly(r.flat().slice(0, -2), true)); }
    return subs;
  }
  /** Drop slivers: pieces smaller or thinner than about w. */
  function clean(mp, w) {
    return (mp || []).filter(poly => {
      const A = Math.abs(area(poly[0])) - poly.slice(1).reduce((a, r) => a + Math.abs(area(r)), 0); let per = 0;
      for (const r of poly) for (let i = 0; i + 1 < r.length; i++) per += Math.hypot(r[i + 1][0] - r[i][0], r[i + 1][1] - r[i][1]);
      return A > w * w * 4 && 2 * A / Math.max(per, 1e-6) > w * 0.6;
    });
  }
  const OPS = { union: 'Join', subtract: 'Subtract front', intersect: 'Keep overlap', exclude: 'Exclude overlap' };
  /** Combine parts of one frame. The back-most part keeps its place and look; returns the new part or null. */
  function combine(fr, list, op, ws = 1) {
    const parts = fr.strokes.filter(s => list.includes(s) && !s.er); if (parts.length < 2) return null;
    const [back, ...front] = parts, A = parts.map(areaOf), f = { union: PC().union, subtract: PC().difference, intersect: PC().intersection, exclude: PC().xor }[op];
    const res = safe(f, A[0], ...A.slice(1)); if (!res) return null;
    const subs = toSubs(clean(res, 0.5 / ws), 0.3 / ws);
    const color = back.f ? back.c : back.b && back.fc ? back.fc : back.c, keepLine = back.b && back.fc && back.s > 0;
    const out = { b: 1, subs, fc: color, fr: 'evenodd', s: keepLine ? back.s : 0, c: keepLine ? back.c : color };
    if (keepLine && back.bs) out.bs = U.deep(back.bs); if (keepLine && back.tx) out.tx = back.tx;
    const i = fr.strokes.indexOf(back); fr.strokes = fr.strokes.filter(s => !parts.includes(s)); if (subs.length) fr.strokes.splice(Math.min(i, fr.strokes.length), 0, out);
    return subs.length ? out : null;
  }

  // ---------- the Cut eraser
  /** Cut what the eraser stroke er covers out of the frame. Lines are split, shapes lose that area. Returns how many parts changed. */
  /** The eraser's middle line as it is drawn on screen (soft curves through its points, js/render/strokes.js pathOf). */
  function drawnLine(pts) {
    const n = pts.length / 2; if (n < 3) return pts.slice(); const out = [pts[0], pts[1]]; let cx = pts[0], cy = pts[1];
    for (let i = 1; i < n - 1; i++) { const x = pts[i * 2], y = pts[i * 2 + 1], ex = (x + pts[i * 2 + 2]) / 2, ey = (y + pts[i * 2 + 3]) / 2;
      for (let k = 1; k <= 6; k++) { const u = k / 6, m = 1 - u; out.push(m * m * cx + 2 * m * u * x + u * u * ex, m * m * cy + 2 * m * u * y + u * u * ey); } cx = ex; cy = ey; }
    out.push(pts[(n - 1) * 2], pts[(n - 1) * 2 + 1]); return out;
  }
  /** Take thin spikes off a ring (closed, [[x, y]…]): a corner sharper than ~18° near the eraser (near(x, y)) is a sliver left
      where the eraser's edge meets the shape's edge, not part of the drawing. */
  function despike(r, near) {
    let P = r.slice(0, -1); const lim = Math.cos(18 * Math.PI / 180);
    for (let guard = 0, changed = true; changed && guard < 400 && P.length > 3; guard++) {
      changed = false;
      for (let i = 0; i < P.length && P.length > 3; i++) {
        const a = P[(i - 1 + P.length) % P.length], q = P[i], b = P[(i + 1) % P.length], ux = a[0] - q[0], uy = a[1] - q[1], vx = b[0] - q[0], vy = b[1] - q[1], lu = Math.hypot(ux, uy), lv = Math.hypot(vx, vy);
        if (lu < 1e-9 || lv < 1e-9) { P.splice(i, 1); changed = true; i--; continue; } // a repeated point
        if ((ux * vx + uy * vy) / (lu * lv) > lim && near(q[0], q[1])) { P.splice(i, 1); changed = true; i--; }
      }
    }
    return P.length >= 3 ? P.concat([P[0]]) : [];
  }
  function cut(fr, er, ws = 1) {
    const C = drawnLine(er.pts), R = er.s / 2, nC = C.length / 2;
    // the erased area: the eraser line at its width, in short overlapping pieces (a long wiggly line would cross itself)
    // the erased area: a round "stadium" for every short stretch of the eraser's path (always convex, so a scribble that turns back
    // sharply leaves no spikes, as an outline of the whole line could)
    const chunks = [], K = 18, step = Math.max(R * 0.6, 0.5 / ws), Q = [C[0], C[1]];
    for (let i = 2; i < C.length; i += 2) { const lx = Q[Q.length - 2], ly = Q[Q.length - 1]; if (Math.hypot(C[i] - lx, C[i + 1] - ly) >= step || i === C.length - 2) Q.push(C[i], C[i + 1]); }
    const stadium = (ax, ay, bx, by) => { const a0 = Math.atan2(by - ay, bx - ax), out = [];
      for (let k = 0; k <= K; k++) { const t = a0 - Math.PI / 2 + Math.PI * k / K; out.push([r2(bx + Math.cos(t) * R), r2(by + Math.sin(t) * R)]); }
      for (let k = 0; k <= K; k++) { const t = a0 + Math.PI / 2 + Math.PI * k / K; out.push([r2(ax + Math.cos(t) * R), r2(ay + Math.sin(t) * R)]); }
      out.push(out[0].slice()); return out; };
    if (Q.length <= 2) chunks.push([[stadium(Q[0], Q[1], Q[0] + 1e-3, Q[1])]]);
    for (let i = 0; i + 3 < Q.length; i += 2) chunks.push([[stadium(Q[i], Q[i + 1], Q[i + 2], Q[i + 3])]]);
    const E = union(chunks); if (!E.length) return 0;
    const b = U.emptyBox(); for (let i = 0; i < C.length; i += 2) U.growBox(b, C[i], C[i + 1]); b.x0 -= R; b.y0 -= R; b.x1 += R; b.y1 += R;
    /** Distance from (x, y) to the eraser's middle line. */
    const dist = (x, y) => { let d = Infinity; for (let i = 0; i + 3 < C.length; i += 2) { const ax = C[i], ay = C[i + 1], dx = C[i + 2] - ax, dy = C[i + 3] - ay, L = dx * dx + dy * dy, t = L ? U.clamp(((x - ax) * dx + (y - ay) * dy) / L, 0, 1) : 0; d = Math.min(d, Math.hypot(x - ax - dx * t, y - ay - dy * t)); } if (nC === 1) d = Math.hypot(x - C[0], y - C[1]); return d; };
    let changed = 0; const out = [];
    for (const s of fr.strokes) {
      if (s === er || s.er) { if (s !== er) out.push(s); continue; }
      const sb = U.emptyBox(); G.bounds([s], sb); if (!U.boxOk(sb) || sb.x1 < b.x0 || sb.x0 > b.x1 || sb.y1 < b.y0 || sb.y0 > b.y1) { out.push(s); continue; } // (bounds include the line's width)
      if (s.f || (s.b && s.fc)) { // a shape: take the eraser's area away
        const A = s.f ? loopsArea(s.loops, true) : loopsArea(s.subs.filter(q => q.cl).map(q => { const f = G.flatten(q, 0.4); f.push(f[0], f[1]); return f; }), s.fr === 'evenodd');
        const hitA = safe(PC().intersection, A, E); if (!hitA || !hitA.length) { out.push(s); continue; } // the eraser missed it: keep it exactly as it was
        let res = safe(PC().difference, A, E); if (!res) { out.push(s); continue; } changed++;
        res = res.map(poly => poly.map(r => despike(r, (x, y) => dist(x, y) < R * 1.4 + 2 / ws)).filter(r => r.length >= 4)).filter(poly => poly.length); // no thin spikes where the eraser's edge meets the shape's
        // every piece left becomes its own part, so the pieces move and edit apart; slivers thinner than a pixel go
        for (const poly of clean(res, 1 / ws)) {
          if (s.f) { const n = U.deep(s); n.loops = poly.map(r => r.flat()); delete n.seed; delete n.gap; out.push(n); }
          else { const n = U.deep(s); n.subs = toSubs([poly], 0.3 / ws); n.fr = 'evenodd'; if (n.subs.length) out.push(n); }
        }
        continue;
      }
      // a line: keep the pieces outside the eraser
      const lines = G.lines(s), pieces = []; let hit = false;
      lines.forEach((L, li) => {
        const step = Math.max(0.5, Math.min(er.s, s.s || er.s) / 4), D = G.densify(L, step), n = D.length / 2, ins = [];
        const al = [0]; for (let i = 1; i < n; i++) al.push(al[i - 1] + Math.hypot(D[i * 2] - D[i * 2 - 2], D[i * 2 + 1] - D[i * 2 - 1]));
        const reach = R + (s.s || 0) / 2 * G.wmax(s); // the line's round end stops at the eraser's edge, not inside it
        for (let i = 0; i < n; i++) { const x = D[i * 2], y = D[i * 2 + 1]; ins.push(x >= b.x0 - s.s && x <= b.x1 + s.s && y >= b.y0 - s.s && y <= b.y1 + s.s && dist(x, y) < reach); }
        if (!ins.some(Boolean)) { pieces.push({ li, pts: L, whole: true }); return; } hit = true;
        let run = null; const runs = [];
        for (let i = 0; i < n; i++) { if (!ins[i]) { if (!run) run = { a: i, pts: [] }; run.pts.push(D[i * 2], D[i * 2 + 1]); run.b = i; } else if (run) { runs.push(run); run = null; } }
        if (run) runs.push(run);
        const closed = s.b && s.subs[li] && s.subs[li].cl;
        if (closed && runs.length > 1 && runs[0].a === 0 && runs[runs.length - 1].b === n - 1) { const last = runs.pop(); runs[0] = { a: last.a, b: runs[0].b, pts: last.pts.concat(runs[0].pts.slice(2)), wrap: true }; }
        const tot = al[n - 1] || 1, wp = s.b ? (s.subs[li] || {}).wp : s.wp;
        const tiny = Math.max(1.5 / ws, (s.s || 0) * 0.3), len = q => { let L = 0; for (let i = 2; i < q.length; i += 2) L += Math.hypot(q[i] - q[i - 2], q[i + 1] - q[i - 1]); return L; };
        runs.forEach(r => { if (r.pts.length < 4 || len(r.pts) < tiny) return; /* crumbs left between eraser strokes go too */ const u0 = al[r.a] / tot, u1 = r.wrap ? al[r.b] / tot + 1 : al[r.b] / tot;
          const nwp = wp ? Array.from({ length: wp.length }, (_, k) => { const u = u0 + (u1 - u0) * k / (wp.length - 1); return G.prof(wp, u > 1 ? u - 1 : u); }) : null; pieces.push({ li, pts: r.pts, wp: nwp }); });
      });
      if (!hit) { out.push(s); continue; } changed++;
      for (const pc of pieces) {
        if (pc.whole && s.b) { const n = U.deep(s); n.subs = [U.deep(s.subs[pc.li])]; out.push(n); continue; }
        if (s.b) { const n = U.deep(s); delete n.fc; const sub = G.fitFreehand(pc.pts, 0.35 / ws, false); if (pc.wp) sub.wp = pc.wp.map(U.r3); else delete sub.wp; n.subs = [sub]; out.push(n); }
        else { const n = U.deep(s); n.pts = G.rdp(pc.pts, 0.25 / ws).map(U.r1); if (pc.wp) n.wp = pc.wp.map(U.r3); else delete n.wp; if (n.pts.length >= 4) out.push(n); }
      }
    }
    fr.strokes = out; return changed;
  }
  SB.bool = { OPS, areaOf, combine, cut, toSubs, ok: () => !!PC() };
})(window.SB);
