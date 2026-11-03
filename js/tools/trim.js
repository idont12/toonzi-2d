/* Trim loose ends (like Moho's or Animate's cut-to-the-crossing): hold Ctrl and drag with the Brush or the Eraser.
   Every line the drag crosses loses the piece between the two nearest places where it crosses other lines or itself (or its own
   end), so overhangs past a corner vanish in one stroke. A line that crosses nothing goes away whole.
     SB.trim.cut(fr, a, b, r)  trim what segment a→b (frame space) crosses, r: how near a tap must be. Returns the count. */
'use strict';
(function (SB) {
  const U = SB.util, S = SB.state, G = SB.paths;
  const EPS = 1e-9;
  /** Where segments p1→p2 and p3→p4 cross: [t on the first, u on the second] or null. */
  function cross(x1, y1, x2, y2, x3, y3, x4, y4) {
    const d = (x2 - x1) * (y4 - y3) - (y2 - y1) * (x4 - x3); if (Math.abs(d) < EPS) return null;
    const t = ((x3 - x1) * (y4 - y3) - (y3 - y1) * (x4 - x3)) / d, u = ((x3 - x1) * (y2 - y1) - (y3 - y1) * (x2 - x1)) / d;
    return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? [t, u] : null;
  }
  const boxOf = L => { const b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }; for (let i = 0; i < L.length; i += 2) U.growBox(b, L[i], L[i + 1]); return b; };
  const meet = (a, b, pad = 0) => a.x0 <= b.x1 + pad && b.x0 <= a.x1 + pad && a.y0 <= b.y1 + pad && b.y0 <= a.y1 + pad;
  /** Arc lengths along polyline L at each point. */
  const arcs = L => { const r = [0]; for (let i = 2; i < L.length; i += 2) r.push(r[r.length - 1] + Math.hypot(L[i] - L[i - 2], L[i + 1] - L[i - 1])); return r; };
  /** Every place (as arc length) where polyline L crosses polyline M. pull (optional): for each, how far a new end there must step
      back so its round cap stays under M: [arc, distance]. wL, wM: the two lines' widths there (wM(j, t): M's width on its segment j). */
  function crossings(L, AL, M, out, pull, wL, wM) {
    for (let i = 0; i + 3 < L.length; i += 2) for (let j = 0; j + 3 < M.length; j += 2) {
      const c = cross(L[i], L[i + 1], L[i + 2], L[i + 3], M[j], M[j + 1], M[j + 2], M[j + 3]); if (!c) continue;
      const d = AL[i / 2] + (AL[i / 2 + 1] - AL[i / 2]) * c[0]; out.push(d); if (!pull) continue;
            const ax = L[i + 2] - L[i], ay = L[i + 3] - L[i + 1], bx = M[j + 2] - M[j], by = M[j + 3] - M[j + 1], sin = Math.abs(ax * by - ay * bx) / ((Math.hypot(ax, ay) * Math.hypot(bx, by)) || 1);
      const back = (wL(d) / 2 - wM(j / 2, c[1]) / 2) / Math.max(0.25, sin); if (back > 0.05) pull.push([d, back + 0.3]); // the round end reaches half its width across M, which covers half its own
    }
  }
  /** A line's width at arc length d (tot: its length): its width times its pressure profile. */
  const widthAt = (s, li, tot) => d => (s.s || 0) * (s.b ? G.prof(s.subs[li] && s.subs[li].wp, d / (tot || 1)) : G.prof(s.wp, d / (tot || 1)));
  /** M's width on segment j at t (M: line mi of stroke y). */
  const widthOn = (y, mi, M) => { const n = M.length / 2 - 1, s = y.s; return (j, t) => (s.f ? 0 : (s.s || 0) * G.prof(s.b ? s.subs[mi] && s.subs[mi].wp : s.wp, (j + t) / Math.max(1, n))); };
  /** Index and fraction along L at arc length d. */
  const at = (AL, d) => { let i = 0; while (i < AL.length - 2 && AL[i + 1] < d) i++; return [i, U.clamp((d - AL[i]) / Math.max(EPS, AL[i + 1] - AL[i]), 0, 1)]; };
  /** Where polyline L crosses itself (a loop drawn in one stroke): both places on it, as arc lengths. */
  function selfCrossings(L, AL, out, closed) {
    const n = L.length / 2 - 1; // segments
    for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) {
      if (closed && i === 0 && j === n - 1) continue; // neighbours round the loop
      const c = cross(L[2 * i], L[2 * i + 1], L[2 * i + 2], L[2 * i + 3], L[2 * j], L[2 * j + 1], L[2 * j + 2], L[2 * j + 3]); if (!c) continue;
      if ((c[0] > 1 - 1e-6 && j === i + 1) || (c[0] < 1e-6 && c[1] > 1 - 1e-6)) continue;
      out.push(AL[i] + (AL[i + 1] - AL[i]) * c[0], AL[j] + (AL[j + 1] - AL[j]) * c[1]);
    }
  }
  /** Line ends that stop on L (a T where one line meets another, or the end left by an earlier trim): where on L, as arc lengths.
      ends: [[x, y, reach, ownArc]] (ownArc: where the end sits on L itself, so L's own ends don't count at that spot). */
  function touches(L, AL, ends, out) {
    for (const [x, y, reach, own] of ends) {
      let best = reach, at = null;
      for (let i = 0; i + 3 < L.length; i += 2) {
        const vx = L[i + 2] - L[i], vy = L[i + 3] - L[i + 1], ll = vx * vx + vy * vy || EPS, t = U.clamp(((x - L[i]) * vx + (y - L[i + 1]) * vy) / ll, 0, 1), d = Math.hypot(L[i] + vx * t - x, L[i + 1] + vy * t - y), q = AL[i / 2] + (AL[i / 2 + 1] - AL[i / 2]) * t;
        if (d <= best && (own == null || Math.abs(q - own) > reach * 4)) { best = d; at = q; }
      }
      if (at != null) out.push(at);
    }
  }
  /** The points of L between arc lengths d0 and d1 (cut exactly there). */
  function slice(L, AL, d0, d1) {
    const [i0, f0] = at(AL, d0), [i1, f1] = at(AL, d1), P = (i, f) => [U.r1(L[2 * i] + (L[2 * i + 2] - L[2 * i]) * f), U.r1(L[2 * i + 1] + (L[2 * i + 3] - L[2 * i + 1]) * f)];
    const out = P(i0, f0); for (let i = i0 + 1; i <= i1; i++) out.push(L[2 * i], L[2 * i + 1]); out.push(...P(i1, f1)); return out;
  }
  /** A bezier sub flattened with the curve and its t kept for each point, so a cut lands exactly on the curve. */
  const STEPS = 24;
  function flatSub(sub) {
    const p = sub.p, L = [p[0], p[1]], K = [[0, 0]];
    for (let k = 0; 6 * k + 7 < p.length; k++) { const o = 6 * k; for (let j = 1; j <= STEPS; j++) { const t = j / STEPS; L.push(...bez(p, o, t)); K.push([k, t]); } }
    return { L, K };
  }
  const bez = (p, o, t) => { const m = 1 - t; return [0, 1].map(c => m * m * m * p[o + c] + 3 * m * m * t * p[o + 2 + c] + 3 * m * t * t * p[o + 4 + c] + t * t * t * p[o + 6 + c]); };
  /** Curve k of p from t0 to t1 as [c1, c2, end] (de Casteljau). */
  function part(p, o, t0, t1) {
    const split = (q, t) => { const l = (a, b) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], [A, B, C, D] = q, ab = l(A, B), bc = l(B, C), cd = l(C, D), abc = l(ab, bc), bcd = l(bc, cd), m = l(abc, bcd); return [[A, ab, abc, m], [m, bcd, cd, D]]; };
    let q = [[p[o], p[o + 1]], [p[o + 2], p[o + 3]], [p[o + 4], p[o + 5]], [p[o + 6], p[o + 7]]];
    if (t1 < 1) q = split(q, t1)[0]; if (t0 > 0) q = split(q, t0 / Math.max(EPS, t1))[1];
    return q;
  }
  /** The piece of a bezier sub between arc lengths d0 and d1 of its flattening. */
  function subPiece(sub, F, AL, d0, d1) {
    const pos = d => { const [i, f] = at(AL, d), A = F.K[i], B = F.K[i + 1]; return B[0] === A[0] ? [A[0], A[1] + (B[1] - A[1]) * f] : f < 1 ? [B[0], B[1] * f] : B; };
    const [k0, t0] = pos(d0), [k1, t1] = pos(d1), p = sub.p, q0 = part(p, 6 * k0, t0, k0 === k1 ? t1 : 1), out = [...q0[0], ...q0[1], ...q0[2], ...q0[3]];
    for (let k = k0 + 1; k < k1; k++) out.push(...p.slice(6 * k + 2, 6 * k + 8));
    if (k1 > k0) { const q1 = part(p, 6 * k1, 0, t1); out.push(...q1[1], ...q1[2], ...q1[3]); }
    return out.map(U.r1);
  }
  /** Arc ranges [a, b] of a line left once the part around h (between its nearest crossings X, sorted) is gone.
      A loop keeps one range that may run past its end (b > tot: it wraps round to the start). */
  function keep(rg, X, h, tot, loop) {
    const tol = Math.max(0.5, tot * 1e-3);
    if (loop) { // a whole loop needs a crossing on each side; the rest of it stays as one open line
      if (X.length < 2) return [];
      let lo = X.filter(x => x < h).pop(), hi = X.find(x => x > h); if (lo == null) lo = X[X.length - 1] - tot; if (hi == null) hi = X[0] + tot;
      const s0 = (hi + tot) % tot; let s1 = (lo + tot) % tot; if (s1 <= s0) s1 += tot; return [[s0, s1]];
    }
    const XX = X.concat(X.map(x => x + tot)).filter(x => x > rg[0] + tol && x < rg[1] - tol), lo = XX.filter(x => x < h).pop() ?? rg[0], hi = XX.find(x => x > h) ?? rg[1], out = [];
    if (lo > rg[0] + tol) out.push([rg[0], lo]); if (hi < rg[1] - tol) out.push([hi, rg[1]]); return out;
  }
  /** Width profile wp of a whole line, for the piece from arc fraction u0 to u1. */
  const subWp = (wp, u0, u1) => { if (!wp) return null; const n = Math.max(2, Math.round(wp.length * (u1 - u0)) + 1); return Array.from({ length: n }, (_, k) => U.r2(G.prof(wp, u0 + (u1 - u0) * k / (n - 1)))); };
  /** How near a line end must stop to another line to meet it. */
  const reachOf = s => 1.5 + (s.s || 0) * 0.5;
  const trimmable = s => !s.er && !s.f && (s.b ? s.subs && s.subs.length : s.pts && s.pts.length >= 4);

  function cut(fr, a, b, r, changed) {
    const gest = [a.x, a.y, b.x, b.y], gb = boxOf(gest), tap = Math.hypot(b.x - a.x, b.y - a.y) < 1e-6; let n = 0;
    const all = fr.strokes.filter(s => !s.er).map(s => ({ s, lines: G.lines(s) }));
    all.forEach(x => { x.boxes = x.lines.map(boxOf); x.ends = x.s.f ? [] : x.lines.flatMap((L, li) => (x.s.b && x.s.subs[li] && x.s.subs[li].cl) || L.length < 4 ? [] : [[L[0], L[1], reachOf(x.s), null, li], [L[L.length - 2], L[L.length - 1], reachOf(x.s), null, li]]); });
    for (const x of all) {
      const s = x.s; if (!trimmable(s) || !x.boxes.some(bx => meet(bx, gb, r))) continue;
      const res = []; let hit = false;
      x.lines.forEach((L0, li) => {
        const sub = s.b ? s.subs[li] : null, F = sub ? flatSub(sub) : null, L = F ? F.L : L0, closed = !!(sub && sub.cl), AL = arcs(L), tot = AL[AL.length - 1];
        if (L.length < 4 || tot <= 0) return res.push(null);
        // where the drag meets it (a tap: the nearest point within reach)
        let hs = []; if (!tap) crossings(L, AL, gest, hs);
        else { let best = r, bd = null; for (let i = 0; i + 3 < L.length; i += 2) { const vx = L[i + 2] - L[i], vy = L[i + 3] - L[i + 1], ll = vx * vx + vy * vy || EPS, t = U.clamp(((a.x - L[i]) * vx + (a.y - L[i + 1]) * vy) / ll, 0, 1), dd = Math.hypot(L[i] + vx * t - a.x, L[i + 1] + vy * t - a.y); if (dd <= best) { best = dd; bd = AL[i / 2] + (AL[i / 2 + 1] - AL[i / 2]) * t; } } if (bd != null) hs = [bd]; }
        if (!hs.length) return res.push(null);
        const X = [], pull = []; selfCrossings(L, AL, X, closed); touches(L, AL, x.ends.filter(en => en[4] !== li).concat(closed ? [] : [[L[0], L[1], reachOf(s), 0], [L[L.length - 2], L[L.length - 1], reachOf(s), tot]]), X); all.forEach(y => { if (y !== x) touches(L, AL, y.ends, X); }); all.forEach(y => y.lines.forEach((M, mi) => { if (y === x && mi === li) return; if (meet(x.boxes[li], y.boxes[mi])) crossings(L, AL, M, X, pull, widthAt(s, li, tot), widthOn(y, mi, M)); })); // its own crossings count too: a loop drawn in one stroke keeps its loop
        X.sort((p, q) => p - q);
        let ranges = [[0, tot]], whole = closed;
        for (const h0 of hs) { // each place the drag crossed takes out its own piece
          const next = [];
          for (const rg of ranges) { const h = h0 >= rg[0] - 1e-6 && h0 <= rg[1] + 1e-6 ? h0 : h0 + tot >= rg[0] && h0 + tot <= rg[1] ? h0 + tot : null; if (h == null) { next.push(rg); continue; } next.push(...keep(rg, X, h, tot, whole)); }
          ranges = next; whole = false; hit = true;
        }
        // a new end at a crossing steps back, so its round end doesn't show on the other side of the line it stops at
        const backAt = v => { let best = 0; for (const [d, b] of pull) if (Math.abs(d - v) < 1e-6 || Math.abs(d + tot - v) < 1e-6 || Math.abs(d - tot - v) < 1e-6) best = Math.max(best, b); return best; };
        if (pull.length) ranges = ranges.map(([a0, b0]) => [a0 + backAt(a0), b0 - backAt(b0)]).filter(([a0, b0]) => b0 - a0 > 0.5);
        const piece = ([d0, d1]) => d1 <= tot + 1e-6 ? (sub ? subPiece(sub, F, AL, d0, Math.min(d1, tot)) : slice(L, AL, d0, Math.min(d1, tot))) : sub ? subPiece(sub, F, AL, d0, tot).concat(subPiece(sub, F, AL, 0, d1 - tot).slice(2)) : slice(L, AL, d0, tot).concat(slice(L, AL, 0, d1 - tot).slice(2));
        res.push(ranges.map(rg => ({ pts: piece(rg), u0: rg[0] / tot, u1: rg[1] / tot })));
      });
      if (!hit) continue; n++;
      const i = fr.strokes.indexOf(s), add = [];
      if (s.b) { // a path: what is left of each crossed sub stays as open curves, exactly on the old ones
        const subs = []; s.subs.forEach((sub, li) => { const R = res[li]; if (!R) return subs.push(sub); for (const p of R) if (p.pts.length >= 8) { const ns = { p: p.pts, cl: 0 }; const w = subWp(sub.wp, p.u0, p.u1); if (w) ns.wp = w; subs.push(ns); } });
        if (subs.length) { const c = Object.assign({}, s, { subs }); G.touch(c); add.push(c); }
      } else for (const p of res[0] || []) if (p.pts.length >= 4) { const c = Object.assign({}, U.deep(s), { pts: p.pts }); const w = subWp(s.wp, p.u0, p.u1); if (w) c.wp = w; else delete c.wp; G.touch(c); add.push(c); }
      fr.strokes.splice(i, 1, ...add); S.selStrokes.delete(s); if (changed) { changed.add(s); add.forEach(c => changed.add(c)); }
    }
    if (n) SB.bump(); return n;
  }

  // ---------- the gesture (the Brush and Eraser call these when Ctrl is held)
  const trail = [];
  function down(P, o) {
    const sp = SB.tool.space(o), l = sp.Minv.transformPoint(U.pt(P.x, P.y)); trail.length = 0; trail.push(P.x, P.y);
    SB.tool.drag = { kind: 'trim', o, sp, last: l, n: 0, moved: false, changed: new Set() };
  }
  function move(P) {
    const d = SB.tool.drag; if (!d || d.kind !== 'trim') return; const l = d.sp.Minv.transformPoint(U.pt(P.x, P.y));
    if (Math.hypot(l.x - d.last.x, l.y - d.last.y) * d.sp.ws < 2) return;
    d.n += cut(d.sp.fr, d.last, l, 0, d.changed); d.last = l; d.moved = true; trail.push(P.x, P.y); SB.dirty();
  }
  function up() {
    const d = SB.tool.drag; if (!d || d.kind !== 'trim') return; trail.length = 0;
    if (!d.moved) d.n += cut(d.sp.fr, d.last, d.last, 10 / d.sp.ws, d.changed); // a tap trims the line under the pointer
    if (d.n) { SB.raster.refreshFills(d.sp.fr, d.changed, false); SB.commit(); } else SB.toast('Ctrl-drag across the loose end of a line to trim it back to where it crosses another line.');
    SB.dirty();
  }
  function overlay(O) {
    const c = O.c; if (trail.length >= 4) { c.save(); c.strokeStyle = 'rgba(232,58,90,.95)'; c.lineWidth = 2 * O.dpr; c.setLineDash([5 * O.dpr, 4 * O.dpr]); c.beginPath(); for (let i = 0; i < trail.length; i += 2) { const [x, y] = O.P(trail[i], trail[i + 1]); if (i) c.lineTo(x, y); else c.moveTo(x, y); } c.stroke(); c.restore(); }
    if (S.hover && held && !S.playing) { const [x, y] = O.P(S.hover.x, S.hover.y); c.save(); c.font = `${14 * O.dpr}px system-ui, sans-serif`; c.fillStyle = 'rgba(232,58,90,.95)'; c.fillText('✂', x + 8 * O.dpr, y - 8 * O.dpr); c.restore(); }
  }
  // Ctrl held over the stage with a drawing tool: show the scissors so it's clear a drag trims
  let held = false; const set = v => { if (v !== held) { held = v; SB.dirty(); } };
  addEventListener('keydown', e => set(e.ctrlKey || e.metaKey)); addEventListener('keyup', e => set(e.ctrlKey || e.metaKey)); addEventListener('blur', () => set(false));
  SB.trim = { cut, down, move, up, overlay, is: e => !!(e && (e.ctrlKey || e.metaKey)) };
})(window.SB);
