/* Sculpt tools for drawings.
   Width (like OpenToonz's Pump): brush over part of a line to make it thicker there (Alt: thinner).
     A line keeps its widths as a profile: s.wp (or sub.wp for each part of a path) holds factors
     at even steps from the line's start to its end, so editing the points keeps the shape of the widths.
   Pull (like a magnet): drag to pull the nearby part of a line or shape; closer points move more. */
'use strict';
(function (SB) {
  const U = SB.util, S = SB.state, G = SB.paths, h = U.h, W = SB.w;
  const K = 48; // width samples along a line
  const ring = (O, R, col) => {
    if (!S.hover || S.playing) return; const c = O.c, [x, y] = O.P(S.hover.x, S.hover.y);
    c.save(); c.lineWidth = 1.5 * O.dpr; c.strokeStyle = col; c.fillStyle = col.replace(/[\d.]+\)$/, '.08)'); c.beginPath(); c.arc(x, y, R * O.sc, 0, Math.PI * 2); c.fill(); c.stroke(); c.restore();
  };
  const target = P => { const o = SB.tool.drawTarget(P, false); if (!o) SB.toast('Select a drawing first.'); return o; };
  /** Points at even steps (u = 0…1) along a polyline. */
  function samples(L, n) {
    const m = L.length / 2, al = [0]; for (let i = 1; i < m; i++) al.push(al[i - 1] + Math.hypot(L[i * 2] - L[i * 2 - 2], L[i * 2 + 1] - L[i * 2 - 1]));
    const tot = al[m - 1] || 1, out = []; let j = 0;
    for (let k = 0; k < n; k++) { const d = tot * k / (n - 1); while (j < m - 2 && al[j + 1] < d) j++; const seg = al[j + 1] - al[j] || 1, f = U.clamp((d - al[j]) / seg, 0, 1); out.push(L[j * 2] + (L[j * 2 + 2] - L[j * 2]) * f, L[j * 2 + 1] + (L[j * 2 + 3] - L[j * 2 + 1]) * f); }
    return out;
  }

  // ---------- Width
  function widthDown(P, e) {
    if (SB.mirror.down(P)) return; const o = target(P); if (!o) return; SB.frames.autoFrame(o, true); const sp = SB.tool.space(o), items = [];
    for (const s of sp.fr.strokes) {
      if (s.er || s.f || !(s.s > 0)) continue;
      G.lines(s).forEach((L, li) => { if (L.length < 4) return; const owner = s.b ? s.subs[li] : s; if (!owner) return; items.push({ s, owner, at: samples(L, owner.wp ? owner.wp.length : K) }); });
    }
    SB.tool.drag = { kind: 'width', o, sp, items, touched: new Set(), mx: SB.mirror.active() ? SB.mirror.local(sp) : null }; widthMove(P, e);
  }
  function widthMove(P, e) {
    const d = SB.tool.drag; if (d && d.kind === 'mirror') return SB.mirror.move(P, e); if (!d || d.kind !== 'width') return; const l0 = d.sp.Minv.transformPoint(U.pt(P.x, P.y)), R = S.widthR / d.sp.ws; // size in drawing pixels: it grows when you zoom in, like the brush
    const thin = (S.widthMode === 'down') !== !!(e && e.altKey), k = 0.12 * (S.widthK ?? 0.5);
    for (const l of d.mx ? [l0, SB.mirror.pt(d.mx, l0)] : [l0]) for (const it of d.items) {
      const a = it.at, n = a.length / 2; let wp = it.owner.wp;
      for (let j = 0; j < n; j++) {
        const dd = Math.hypot(a[j * 2] - l.x, a[j * 2 + 1] - l.y); if (dd >= R) continue;
        if (!wp) wp = it.owner.wp = new Array(n).fill(1);
        const f = Math.pow(1 - dd / R, 2) * k; wp[j] = U.r3(U.clamp(thin ? wp[j] * (1 - f) : wp[j] * (1 + f), 0.05, 8)); d.touched.add(it.s);
      }
      if (d.touched.has(it.s)) G.touch(it.s);
    }
    SB.bump();
  }
  function widthUp() {
    const d = SB.tool.drag; if (d && d.kind === 'mirror') return SB.mirror.up(); if (!d || d.kind !== 'width') return;
    for (const it of d.items) if (it.owner.wp && it.owner.wp.every(v => Math.abs(v - 1) < 0.01)) delete it.owner.wp; // back to even: no profile
    if (d.touched.size) SB.commit();
  }
  /** Even widths again on the current frame of the selected drawing. */
  function resetWidths() {
    const o = SB.tree.sel(); if (!o || !SB.types.get(o.type).frames) return SB.toast('Select a drawing first.'); let n = 0;
    for (const s of SB.frames.current(o).strokes) { if (s.wp) { delete s.wp; n++; } if (s.b) s.subs.forEach(sb => { if (sb.wp) { delete sb.wp; n++; } }); G.touch(s); }
    SB.commit(); SB.toast(n ? 'Lines have even widths again.' : 'No widths to reset on this frame.');
  }
  SB.tools.add({
    id: 'width', label: 'Width', icon: 'width', key: 'W', tip: 'Brush over a line to make that part thicker (Alt: thinner)', cursor: 'none',
    down: widthDown, move: (P, e) => widthMove(P, e), up: widthUp, cancel: () => SB.revert(),
    overlay: O => { ring(O, S.widthR, 'rgba(91,61,245,.9)'); SB.mirror.overlay(O); },
    bar: () => [W.seg(S.widthMode || 'up', [['up', 'Thicker', 'Brush over a line to make it thicker there'], ['down', 'Thinner', 'Brush over a line to make it thinner there']], v => { S.widthMode = v; SB.invalidate('ctxbar'); }),
      W.popSlider('Size', S.widthR, { min: 5, max: 200, unit: 'px', input: v => { S.widthR = v; SB.dirty(); } }),
      W.popSlider('Strength', Math.round((S.widthK ?? 0.5) * 100), { min: 5, max: 100, unit: '%', input: v => S.widthK = v / 100 }),
      W.btn('Even widths', resetWidths, { cls: 'sm ghost', title: 'Give every line on this frame one even width again' }),
      h('span.vsep'), ...SB.mirror.bar(), h('span.lbl', null, 'Hold Alt to do the opposite.')],
  });

  // ---------- Pull
  /** Pulling the middle of a long curve: put a point on the curve where you grab it (when no point is close), so that part bends. */
  function splitNear(sub, l, R) {
    const p = sub.p; let best = null;
    for (let i = 2; i + 5 < p.length; i += 6) for (let k = 1; k < 40; k++) {
      const u = k / 40, m = 1 - u, x = m * m * m * p[i - 2] + 3 * m * m * u * p[i] + 3 * m * u * u * p[i + 2] + u * u * u * p[i + 4], y = m * m * m * p[i - 1] + 3 * m * m * u * p[i + 1] + 3 * m * u * u * p[i + 3] + u * u * u * p[i + 5];
      const d = Math.hypot(x - l.x, y - l.y); if (!best || d < best.d) best = { d, i, u };
    }
    if (!best || best.d > R * 0.6) return;
    const i = best.i, u = best.u, near = Math.min(Math.hypot(p[i - 2] - l.x, p[i - 1] - l.y), Math.hypot(p[i + 4] - l.x, p[i + 5] - l.y)); if (near < R * 0.5) return;
    const L = (a, b) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u], P0 = [p[i - 2], p[i - 1]], P1 = [p[i], p[i + 1]], P2 = [p[i + 2], p[i + 3]], P3 = [p[i + 4], p[i + 5]];
    const A = L(P0, P1), B = L(P1, P2), C = L(P2, P3), D = L(A, B), E = L(B, C), F = L(D, E);
    p.splice(i, 6, ...A, ...D, ...F, ...E, ...C, ...P3); p.forEach((v, k) => p[k] = U.r2(v)); if (sub.m) sub.m.splice((i - 2) / 6 + 1, 0, 's');
  }
  /** How much a point moves with the pull, by its distance (t: 0 at the pointer, 1 at the edge of the size), like Blender's proportional editing. */
  const FALLOFF = {
    smooth: { label: 'Smooth', f: t => 0.5 * (1 + Math.cos(Math.PI * t)) },
    sphere: { label: 'Sphere', f: t => Math.sqrt(Math.max(0, 1 - t * t)) },
    root: { label: 'Root', f: t => Math.sqrt(1 - t) },
    sharp: { label: 'Sharp', f: t => (1 - t) * (1 - t) },
    linear: { label: 'Linear', f: t => 1 - t },
    constant: { label: 'Constant', f: () => 1 },
  };
  const falloff = () => FALLOFF[S.pullFall] || FALLOFF.smooth;
  /** A small picture of a falloff: how high each point is pulled across the size (the middle is the pointer). */
  const fallSvg = (k, w = 44, hgt = 22) => { const f = FALLOFF[k].f, pts = []; for (let i = 0; i <= 32; i++) { const x = -1 + i / 16, y = Math.abs(x) >= 1 ? 0 : f(Math.abs(x)); pts.push(`${U.r1((x + 1) / 2 * (w - 4) + 2)},${U.r1(hgt - 2 - y * (hgt - 5))}`); } return `<svg viewBox="0 0 ${w} ${hgt}" width="${w}" height="${hgt}" aria-hidden="true"><path d="M2 ${hgt - 2}H${w - 2}" stroke="currentColor" stroke-opacity=".25" fill="none"/><polyline points="${pts.join(' ')}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>`; };
  /** The falloff picker: a button with the current curve, a pop-up with every curve. */
  function fallBtn() {
    const cur = S.pullFall && FALLOFF[S.pullFall] ? S.pullFall : 'smooth', b = h('button.btn.sm.fallbtn', { type: 'button', title: 'Falloff: how the pull fades from the pointer to the edge', html: fallSvg(cur, 36, 18) + `<span>${FALLOFF[cur].label}</span>` });
    b.onclick = () => SB.popover(b, h('div.fall-pop', null, ...Object.keys(FALLOFF).map(k => h('button.fall-opt' + (k === cur ? '.on' : ''), { type: 'button', html: fallSvg(k) + `<span>${FALLOFF[k].label}</span>`, onclick: () => { S.pullFall = k; SB.popover.close(); SB.invalidate('ctxbar'); } }))));
    return b;
  }
  /** A path has few points, so pulling one would bend it the same whatever the falloff: within reach (R of l), its curves get
      points every R/4, each pulled by its own weight, so Smooth, Sphere, Sharp… shape the bend as they do on freehand lines. */
  function subdivide(sub, l, R) {
    const p = sub.p, n = (p.length - 2) / 6, out = [p[0], p[1]], m = sub.m ? [sub.m[0]] : null, step = R / 4; let added = 0;
    const lerp = (a, b, u) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u], at = (Q, u) => { const v = 1 - u; return [0, 1].map(k => v * v * v * Q[0][k] + 3 * v * v * u * Q[1][k] + 3 * v * u * u * Q[2][k] + u * u * u * Q[3][k]); };
    for (let k = 0; k < n; k++) {
      let Q = [0, 1, 2, 3].map(j => [p[6 * k + 2 * j], p[6 * k + 2 * j + 1]]), len = 0, dmin = Infinity, prev = Q[0];
      for (let j = 0; j <= 16; j++) { const q = at(Q, j / 16); len += Math.hypot(q[0] - prev[0], q[1] - prev[1]); dmin = Math.min(dmin, Math.hypot(q[0] - l.x, q[1] - l.y)); prev = q; }
      for (let q = dmin < R ? Math.min(16, Math.ceil(len / step)) : 1; q > 1; q--) { // split off 1/q of what is left (de Casteljau)
        const u = 1 / q, A = lerp(Q[0], Q[1], u), B = lerp(Q[1], Q[2], u), C = lerp(Q[2], Q[3], u), D = lerp(A, B, u), E = lerp(B, C, u), F = lerp(D, E, u);
        out.push(...A, ...D, ...F); if (m) m.push('s'); Q = [F, E, C, Q[3]]; added++;
      }
      out.push(...Q[1], ...Q[2], ...Q[3]); if (m) m.push(sub.m[k + 1]);
    }
    if (added) sub.p = out.map(U.r2), sub.m = m || sub.m;
  }
  function pullDown(P) {
    if (SB.mirror.down(P)) return; const o = target(P); if (!o) return; SB.frames.autoFrame(o, true); const sp = SB.tool.space(o), l0 = sp.Minv.transformPoint(U.pt(P.x, P.y)), R = S.pullR / sp.ws, moves = [], touched = new Set();
    const mx = SB.mirror.active() ? SB.mirror.local(sp) : null, lm = mx ? SB.mirror.pt(mx, l0) : null, FF = falloff().f;
    const wt0 = (q, dd) => dd >= R ? 0 : FF(dd / R), wt = dd => wt0(null, dd), wm = (x, y) => lm ? wt0(null, Math.hypot(x - lm.x, y - lm.y)) : 0; // full at the pointer, nothing at the edge; and the same around the mirrored pointer
    const segD = (px, py, ax, ay, bx, by) => { const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy, t = L ? U.clamp(((px - ax) * dx + (py - ay) * dy) / L, 0, 1) : 0; return Math.hypot(px - ax - dx * t, py - ay - dy * t); };
    const near = (arr, closed) => { for (let i = 0; i + 3 < arr.length + (closed ? 2 : 0); i += 2) { const j = (i + 2) % arr.length; for (const c of lm ? [l0, lm] : [l0]) if (segD(c.x, c.y, arr[i], arr[i + 1], arr[j], arr[j + 1]) < R) return true; } return false; };
    const addFlat = (arr, s) => { for (let i = 0; i < arr.length; i += 2) { const w = wt(Math.hypot(arr[i] - l0.x, arr[i + 1] - l0.y)), w2 = wm(arr[i], arr[i + 1]); if (w > 0 || w2 > 0) { moves.push({ arr, i, w, w2, x: arr[i], y: arr[i + 1] }); touched.add(s); } } };
    const step = Math.max(1, R / 6);
    for (const s of sp.fr.strokes) {
      if (s.er) continue;
      if (s.f) { s.loops = s.loops.map(L => near(L, true) ? G.densify(L, step, true).map(U.r1) : L); s.loops.forEach(L => addFlat(L, s)); continue; }
      if (s.b) { for (const sb of s.subs) { splitNear(sb, l0, R); if (lm) splitNear(sb, lm, R); subdivide(sb, l0, R); if (lm) subdivide(sb, lm, R); } for (const sb of s.subs) { const p = sb.p; for (let i = 0; i < p.length; i += 2) { const a = Math.min(p.length - 2, Math.round(i / 6) * 6), ax = p[a], ay = p[a + 1], w = wt(Math.hypot(ax - l0.x, ay - l0.y)), w2 = wm(ax, ay);
          /* a handle turns with the pull's slope at its point (both handles of a point the same way), so the curve bends smoothly instead of in steps */
          const e = Math.max(0.5, R * 0.02), g = (fx, fy) => [(fx(ax + e, ay) - fx(ax - e, ay)) / (2 * e), (fx(ax, ay + e) - fx(ax, ay - e)) / (2 * e)], wf = (x, y) => wt(Math.hypot(x - l0.x, y - l0.y));
          const G1 = i !== a ? g(wf) : null, G2 = i !== a && lm ? g(wm) : null;
          if (w > 0 || w2 > 0 || (G1 && (G1[0] || G1[1])) || (G2 && (G2[0] || G2[1]))) { moves.push({ arr: p, i, w, w2, x: p[i], y: p[i + 1], h: i !== a ? { a, vx: p[i] - ax, vy: p[i + 1] - ay, g: G1, g2: G2 } : null }); touched.add(s); } } } continue; }
      if (near(s.pts, false)) s.pts = G.densify(s.pts, step).map(U.r1); addFlat(s.pts, s);
    }
    touched.forEach(G.touch);
    SB.tool.drag = { kind: 'pull', o, sp, l0, moves, touched, mx };
    if (!moves.length) SB.toast('Start pulling on or near a line.');
  }
  function pullMove(P, e) {
    const d = SB.tool.drag; if (d && d.kind === 'mirror') return SB.mirror.move(P, e); if (!d || d.kind !== 'pull' || !d.moves.length) return; const l = d.sp.Minv.transformPoint(U.pt(P.x, P.y)), dx = l.x - d.l0.x, dy = l.y - d.l0.y;
    const [mdx, mdy] = d.mx ? SB.mirror.vec(d.mx, dx, dy) : [0, 0]; // the mirrored side moves the mirrored way
    for (const m of d.moves) {
      let x = m.x + dx * m.w + mdx * (m.w2 || 0), y = m.y + dy * m.w + mdy * (m.w2 || 0);
      if (m.h) { const k = m.h.g[0] * m.h.vx + m.h.g[1] * m.h.vy, k2 = m.h.g2 ? m.h.g2[0] * m.h.vx + m.h.g2[1] * m.h.vy : 0; x += dx * k + mdx * k2; y += dy * k + mdy * k2; } // the handle also turns with the slope of the pull
      m.arr[m.i] = U.r2(x); m.arr[m.i + 1] = U.r2(y);
    }
    d.touched.forEach(G.touch); d.moved = true; SB.bump();
  }
  function pullUp() {
    const d = SB.tool.drag; if (d && d.kind === 'mirror') return SB.mirror.up(); if (!d || d.kind !== 'pull') return;
    if (d.moved) { SB.raster.refreshFills(d.sp.fr, new Set([...d.touched].filter(s => !s.f)), false); SB.commit(); }
  }
  SB.tools.add({
    id: 'pull', label: 'Pull', icon: 'pull', key: 'U', tip: 'Drag to pull and stretch the nearby part of a line or shape', cursor: 'none',
    down: pullDown, move: (P, e) => pullMove(P, e), up: pullUp, cancel: () => SB.revert(),
    overlay: O => { ring(O, S.pullR, 'rgba(255,99,71,.9)'); SB.mirror.overlay(O); },
    bar: () => [W.popSlider('Size', S.pullR, { min: 5, max: 400, unit: 'px', title: 'How far around the pointer the pull reaches', input: v => { S.pullR = v; SB.dirty(); } }),
      fallBtn(), h('span.vsep'), ...SB.mirror.bar(),
      h('span.lbl', null, 'Drag on a line or shape. The falloff sets how the pull fades toward the edge of the size.')],
  });
})(window.SB);
