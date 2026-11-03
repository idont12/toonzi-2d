/* Motion path of the selected animated layer: the route it travels, a tick per frame, and the
   keyframes as points you edit like a vector path:
     drag a point        moves that keyframe          drag a handle        bends the path (cubic)
     double-click a point  sharp ↔ smooth              Alt-click a point    removes that keyframe
     double-click the path  adds a keyframe there (the curve keeps its shape)
     drag the round dot  bends the part between two points; double-click a tick sets its spacing (ease)
   A point's handles move in line (smooth), mirrored (symmetric) or on their own (free, or hold Alt);
   pick it in the bar above the stage. Handles live on the X keys: k.ho (out) and k.hi (in) as offsets,
   k.hm the mode; older files' single bend point (k.cx, k.cy) still plays and turns into handles when edited. */
'use strict';
(function (SB) {
  const U = SB.util, S = SB.state, TR = SB.tracks, tree = SB.tree, X = SB.xf;
  const keysAt = (o, t) => ({ xk: o.tracks.x && TR.keyAt(o.tracks.x, t), yk: o.tracks.y && TR.keyAt(o.tracks.y, t) });
  const SPACING = [['linear', 'Even spacing'], ['easeIn', 'Start slow, end fast'], ['easeOut', 'Start fast, end slow'], ['smooth', 'Slow at both ends'], ['back', 'Overshoot'], ['bounce', 'Bounce'], ['hold', 'Hold, then jump']];

  /** Old quadratic bends become cubic handles. */
  function toCubic(o) {
    const XT = o.tracks.x || []; for (let i = 0; i < XT.length - 1; i++) { const a = XT[i], b = XT[i + 1]; if (a.cx == null) continue; const ya = TR.keyAt(o.tracks.y || [], a.t), yb = TR.keyAt(o.tracks.y || [], b.t);
      if (ya && yb) { a.ho = [U.r1((a.cx - a.v) * 2 / 3), U.r1((a.cy - ya.v) * 2 / 3)]; b.hi = [U.r1((a.cx - b.v) * 2 / 3), U.r1((a.cy - yb.v) * 2 / 3)]; } delete a.cx; delete a.cy; }
  }
  function build(o) {
    if (!o || !SB.types.get(o.type).visual || !tree.inRange(o) || tree.locked(o) || S.playing || S.tool !== 'select') return null;
    const XT = o.tracks.x, YT = o.tracks.y; if (!((XT && XT.length > 1) || (YT && YT.length > 1))) return null;
    const times = [...new Set([...(XT || []), ...(YT || [])].map(k => U.r3(k.t)))].sort((a, b) => a - b), t0 = times[0], t1 = times[times.length - 1]; if (t1 - t0 < 1e-3) return null;
    const fps = S.project.fps, PW = X.parentWorld(o), at = t => { const k = TR.transform(o, t); return PW.transformPoint(U.pt(k.x, k.y)); };
    const fine = []; for (let n = Math.min(1200, Math.ceil((t1 - t0) * fps * 4)), i = 0; i <= n; i++) { const t = t0 + (t1 - t0) * i / n, q = at(Math.min(t, t1 - 1e-6)); fine.push({ t, x: q.x, y: q.y }); }
    const ticks = []; for (let f = Math.ceil(t0 * fps - 1e-6); f <= t1 * fps + 1e-6; f++) { const t = f / fps, q = at(Math.min(t, t1 - 1e-6)), q2 = at(Math.min(t1 - 1e-6, t + 0.25 / fps)), q1 = at(Math.max(t0, t - 0.25 / fps)); const dx = q2.x - q1.x, dy = q2.y - q1.y, l = Math.hypot(dx, dy) || 1; ticks.push({ t, x: q.x, y: q.y, nx: -dy / l, ny: dx / l }); }
    const keys = times.map((t, i) => { const q = at(t), K = keysAt(o, t), lx = K.xk ? K.xk.v : TR.transform(o, t).x, ly = K.yk ? K.yk.v : TR.transform(o, t).y, xk = K.xk, hs = {};
      if (xk && i > 0 && xk.hi) hs.hin = PW.transformPoint(U.pt(lx + xk.hi[0], ly + xk.hi[1]));
      if (xk && i < times.length - 1 && xk.ho) hs.hout = PW.transformPoint(U.pt(lx + xk.ho[0], ly + xk.ho[1]));
      return { t, x: q.x, y: q.y, lx, ly, i, hs }; });
    const segs = []; for (let i = 0; i < keys.length - 1; i++) { const a = keys[i], b = keys[i + 1], xk = XT && TR.keyAt(XT, a.t), xb = XT && TR.keyAt(XT, b.t), mid = at((a.t + b.t) / 2); segs.push({ i, a, b, xk, curved: !!(xk && (xk.cx != null || xk.ho)) || !!(xb && xb.hi), mid }); }
    return { o, fine, ticks, keys, segs, PW };
  }
  const active = mp => S.pathKey && mp && S.pathKey.id === mp.o.id ? mp.keys.find(k => Math.abs(k.t - S.pathKey.t) < 1e-3) : null;

  const MP = SB.motionPath = {
    build,
    draw(O) {
      const mp = build(tree.sel()); if (!mp) return; const c = O.c, d = O.dpr, now = tree.localTime(mp.o), act = active(mp);
      c.save(); c.lineWidth = 1.5 * d; c.strokeStyle = 'rgba(91,61,245,.75)'; c.beginPath(); mp.fine.forEach((q, i) => { const [x, y] = O.P(q.x, q.y); i ? c.lineTo(x, y) : c.moveTo(x, y); }); c.stroke();
      c.strokeStyle = 'rgba(36,33,63,.6)'; c.lineWidth = 1.2 * d; const L = 6 * d;
      for (const t of mp.ticks) { const [x, y] = O.P(t.x, t.y); c.beginPath(); c.moveTo(x - t.nx * L, y - t.ny * L); c.lineTo(x + t.nx * L, y + t.ny * L); c.stroke(); }
      for (const s of mp.segs) { if (s.curved) continue; const [x, y] = O.P(s.mid.x, s.mid.y); c.beginPath(); c.arc(x, y, 4 * d, 0, Math.PI * 2); c.fillStyle = '#fff'; c.fill(); c.strokeStyle = '#5B3DF5'; c.lineWidth = 1.5 * d; c.stroke(); }
      for (const k of mp.keys) for (const hp of Object.values(k.hs)) { // handles: a line from the point and a dot
        const [x, y] = O.P(k.x, k.y), [hx, hy] = O.P(hp.x, hp.y); c.strokeStyle = 'rgba(91,61,245,.7)'; c.lineWidth = d; c.beginPath(); c.moveTo(x, y); c.lineTo(hx, hy); c.stroke();
        c.beginPath(); c.arc(hx, hy, 4 * d, 0, Math.PI * 2); c.fillStyle = '#5B3DF5'; c.fill(); }
      for (const k of mp.keys) { const [x, y] = O.P(k.x, k.y), on = Math.abs(k.t - now) < TR.tol(), sharp = !k.hs.hin && !k.hs.hout; c.beginPath(); if (sharp) c.rect(x - 5 * d, y - 5 * d, 10 * d, 10 * d); else c.arc(x, y, 5.5 * d, 0, Math.PI * 2); c.fillStyle = on ? '#FF4F8B' : '#fff'; c.fill(); c.strokeStyle = '#5B3DF5'; c.lineWidth = 2 * d; c.stroke();
        if (act === k) { c.beginPath(); c.arc(x, y, 10 * d, 0, Math.PI * 2); c.strokeStyle = '#FF4F8B'; c.lineWidth = 2 * d; c.stroke(); } }
      c.restore();
    },
    hit(P) {
      const mp = build(tree.sel()); if (!mp) return null; const k = SB.view.k(), dist = q => Math.hypot(q.x - P.x, q.y - P.y) * k;
      for (const q of mp.keys) for (const [side, hp] of Object.entries(q.hs)) if (dist(hp) < 8) return { kind: side, mp, key: q };
      for (const q of mp.keys) if (dist(q) < 10) return { kind: 'key', mp, key: q };
      for (const s of mp.segs) if (!s.curved && dist(s.mid) < 9) return { kind: 'bend', mp, seg: s };
      let bt = null, bd = 99; for (const t of mp.ticks) { const dx = (P.x - t.x) * k, dy = (P.y - t.y) * k, perp = Math.abs(dx * t.nx + dy * t.ny), along = Math.abs(dx * t.ny - dy * t.nx); if (along < 3.5 && perp < 9 && along + perp * 0.2 < bd) { bd = along + perp * 0.2; bt = t; } }
      if (bt) return { kind: 'tick', mp, tick: bt, seg: mp.segs.find(s => bt.t >= s.a.t - 1e-6 && bt.t <= s.b.t + 1e-6) };
      let bf = null; bd = 6; for (const q of mp.fine) { const dd = dist(q); if (dd < bd) { bd = dd; bf = q; } }
      if (bf) return { kind: 'line', mp, at: bf, seg: mp.segs.find(s => bf.t >= s.a.t - 1e-6 && bf.t <= s.b.t + 1e-6) };
      return null;
    },
    down(h, P, e) {
      const o = h.mp.o; toCubic(o);
      if (h.kind === 'key' && e && e.altKey) { MP.removeKey(o, h.key.t); return; }
      if (h.kind === 'key' || h.kind === 'hin' || h.kind === 'hout') { S.pathKey = { id: o.id, t: h.key.t }; SB.invalidate('ctxbar'); }
      SB.tool.drag = { kind: 'path', h, o, moved: false, P0: P, alt: !!(e && e.altKey) }; if (h.kind === 'key') { SB.time.pause(); SB.tree.goLocal(o, h.key.t + 0.0001); }
    },
    move(P) {
      const d = SB.tool.drag, o = d.o, h = d.h; if (!d.moved && Math.hypot(P.x - d.P0.x, P.y - d.P0.y) * SB.view.k() < 3) return; d.moved = true;
      const PI = h.mp.PW.inverse(), l = PI.transformPoint(U.pt(P.x, P.y));
      if (h.kind === 'key') { const K = keysAt(o, h.key.t); if (K.xk) K.xk.v = U.r1(l.x); else TR.put(o, 'x', h.key.t, U.r1(l.x)); if (K.yk) K.yk.v = U.r1(l.y); else TR.put(o, 'y', h.key.t, U.r1(l.y)); SB.bump(); return; }
      if (h.kind === 'hin' || h.kind === 'hout') {
        const K = keysAt(o, h.key.t); if (!K.xk) return; const v = [U.r1(l.x - h.key.lx), U.r1(l.y - h.key.ly)], own = h.kind === 'hout' ? 'ho' : 'hi', opp = own === 'ho' ? 'hi' : 'ho';
        K.xk[own] = v; const mode = d.alt ? 'f' : K.xk.hm || 's', other = K.xk[opp];
        if (other && mode !== 'f') { const L = mode === 'y' ? Math.hypot(v[0], v[1]) : Math.hypot(other[0], other[1]), a = Math.atan2(v[1], v[0]); K.xk[opp] = [U.r1(-Math.cos(a) * L), U.r1(-Math.sin(a) * L)]; }
        SB.bump(); return;
      }
      if (!h.seg) return; const s = h.seg, A = keysAt(o, s.a.t), B = keysAt(o, s.b.t);
      if (!A.xk || !A.yk || !B.xk || !B.yk) { SB.toast('Key both X and Y at both ends to bend this part of the path.'); d.kind = 'none'; return; }
      if (h.kind === 'bend' || h.kind === 'line') { // the curve passes through the pointer: a quadratic bend, written as handles
        let u = 0.5; if (h.kind === 'line') u = U.clamp(TR.easeOf(A.xk)((h.at.t - s.a.t) / Math.max(1e-6, s.b.t - s.a.t)), 0.15, 0.85);
        const m = 1 - u, cx = (l.x - m * m * A.xk.v - u * u * B.xk.v) / (2 * m * u), cy = (l.y - m * m * A.yk.v - u * u * B.yk.v) / (2 * m * u);
        A.xk.ho = [U.r1((cx - A.xk.v) * 2 / 3), U.r1((cy - A.yk.v) * 2 / 3)]; B.xk.hi = [U.r1((cx - B.xk.v) * 2 / 3), U.r1((cy - B.yk.v) * 2 / 3)]; SB.bump(); return;
      }
      if (h.kind === 'tick') { // slide the frame spacing: fit a power curve so this frame lands near the pointer
        const sf = (h.tick.t - s.a.t) / Math.max(1e-6, s.b.t - s.a.t); if (sf <= 0.02 || sf >= 0.98) return;
        let best = 0.5, bd = Infinity; const P0 = [A.xk.v, A.yk.v], P3 = [B.xk.v, B.yk.v], P1 = [P0[0] + (A.xk.ho ? A.xk.ho[0] : 0), P0[1] + (A.xk.ho ? A.xk.ho[1] : 0)], P2 = [P3[0] + (B.xk.hi ? B.xk.hi[0] : 0), P3[1] + (B.xk.hi ? B.xk.hi[1] : 0)];
        for (let i = 1; i < 200; i++) { const u = i / 200, m = 1 - u, b = (k) => m * m * m * P0[k] + 3 * m * m * u * P1[k] + 3 * m * u * u * P2[k] + u * u * u * P3[k], w = h.mp.PW.transformPoint(U.pt(b(0), b(1))), dd = Math.hypot(w.x - P.x, w.y - P.y); if (dd < bd) { bd = dd; best = u; } }
        const ep = U.r2(U.clamp(Math.log(best) / Math.log(sf), 0.15, 6)); [A.xk, A.yk].forEach(k => { k.e = 'pw'; k.ep = ep; }); SB.bump();
      }
    },
    dbl(h, e) {
      const o = h.mp.o; toCubic(o);
      if (h.kind === 'tick') {
        const s = h.seg; if (!s) return; const A = keysAt(o, s.a.t), cur = A.xk ? A.xk.e : 'smooth';
        return SB.menu.open(e.clientX, e.clientY, [{ head: `Spacing from ${U.r2(s.a.t)}s to ${U.r2(s.b.t)}s` }, ...SPACING.map(([k, v]) => ({ label: (cur === k ? '✓ ' : '') + v, run: () => { [A.xk, A.yk].forEach(kk => { if (kk) { kk.e = k; delete kk.ep; } }); SB.commit(); } })), '-', { label: 'Tip: drag a tick to slide the spacing', disabled: true }]);
      }
      if (h.kind === 'key') return MP.setMode(o, h.key.t, h.key.hs.hin || h.key.hs.hout ? 'c' : 's');
      if (h.kind === 'line' || h.kind === 'bend') return MP.addKey(o, h.kind === 'line' ? h.at.t : (h.seg.a.t + h.seg.b.t) / 2);
    },
    /** A new keyframe on the path at local time t; the curve keeps its shape (the bezier is split there). */
    addKey(o, t) {
      toCubic(o); t = SB.time.qLocal ? SB.time.qLocal(o, t) : t; const XT = o.tracks.x, YT = o.tracks.y; if (!XT || !YT) return;
      const j = XT.findIndex((k, i) => XT[i + 1] && t > k.t + 1e-3 && t < XT[i + 1].t - 1e-3); if (j < 0) return;
      const a = XT[j], b = XT[j + 1], ya = TR.keyAt(YT, a.t), yb = TR.keyAt(YT, b.t); if (!ya || !yb) return SB.toast('Key both X and Y at both ends first.');
      const u = TR.easeOf(a)((t - a.t) / (b.t - a.t)), L = (p, q) => [p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u];
      const P0 = [a.v, ya.v], P3 = [b.v, yb.v], P1 = a.ho ? [P0[0] + a.ho[0], P0[1] + a.ho[1]] : P0, P2 = b.hi ? [P3[0] + b.hi[0], P3[1] + b.hi[1]] : P3;
      const A = L(P0, P1), Bm = L(P1, P2), C = L(P2, P3), D = L(A, Bm), Ee = L(Bm, C), F = L(D, Ee), curved = !!(a.ho || b.hi), e0 = a.e, ep = a.ep;
      TR.put(o, 'x', t, U.r1(F[0]), e0); TR.put(o, 'y', t, U.r1(F[1]), e0);
      const nk = TR.keyAt(o.tracks.x, t); if (ep != null) { nk.ep = ep; TR.keyAt(o.tracks.y, t).ep = ep; }
      if (curved) { a.ho = [U.r1(A[0] - P0[0]), U.r1(A[1] - P0[1])]; nk.hi = [U.r1(D[0] - F[0]), U.r1(D[1] - F[1])]; nk.ho = [U.r1(Ee[0] - F[0]), U.r1(Ee[1] - F[1])]; b.hi = [U.r1(C[0] - P3[0]), U.r1(C[1] - P3[1])]; }
      S.pathKey = { id: o.id, t: nk.t }; SB.commit(); SB.invalidate('ctxbar'); SB.toast('Point added: a new keyframe on the path.');
    },
    removeKey(o, t) {
      const XT = o.tracks.x || [], n = new Set([...XT, ...(o.tracks.y || [])].map(k => U.r3(k.t))).size; if (n <= 2) return SB.toast('A path needs at least two points.');
      ['x', 'y'].forEach(id => { const tr = o.tracks[id]; if (!tr) return; const k = TR.keyAt(tr, t); if (k) tr.splice(tr.indexOf(k), 1); });
      S.pathKey = null; SB.commit(); SB.invalidate('ctxbar'); SB.toast('Point removed.');
    },
    /** How a point's handles behave: 'c' sharp, 's' smooth, 'y' symmetric, 'f' free. */
    setMode(o, t, v) {
      toCubic(o); const XT = o.tracks.x || [], i = XT.findIndex(k => Math.abs(k.t - t) < 1e-3), K = keysAt(o, t); if (i < 0 || !K.xk) return;
      const k = K.xk, prev = XT[i - 1], next = XT[i + 1], val = (xk, tt) => [xk.v, (TR.keyAt(o.tracks.y || [], tt) || { v: TR.transform(o, tt).y }).v];
      if (v === 'c') { delete k.hi; delete k.ho; delete k.hm; }
      else {
        if (!k.hi && !k.ho) { const p = prev ? val(prev, prev.t) : val(k, t), q = next ? val(next, next.t) : val(k, t), dx = (q[0] - p[0]) / 6, dy = (q[1] - p[1]) / 6; if (prev) k.hi = [U.r1(-dx), U.r1(-dy)]; if (next) k.ho = [U.r1(dx), U.r1(dy)]; }
        else if (v !== 'f' && k.hi && k.ho) { const lo = Math.hypot(...k.ho), li = Math.hypot(...k.hi), main = lo >= li ? k.ho : k.hi, a = Math.atan2(main[1], main[0]), L = v === 'y' ? Math.max(lo, li) : (main === k.ho ? li : lo) || Math.max(lo, li), other = [U.r1(-Math.cos(a) * L), U.r1(-Math.sin(a) * L)]; if (main === k.ho) k.hi = other; else k.ho = other; }
        k.hm = v;
      }
      S.pathKey = { id: o.id, t }; SB.commit(); SB.invalidate('ctxbar');
    },
    /** The bar above the stage while a path point is picked. */
    bar(o) {
      if (!o || !S.pathKey || S.pathKey.id !== o.id) return null; const K = keysAt(o, S.pathKey.t); if (!K.xk) return null;
      const W = SB.w, h = U.h, m = !K.xk.hi && !K.xk.ho ? 'c' : K.xk.hm || 's';
      return [h('span.lbl', null, h('b', null, 'Path point')), W.seg(m, [['c', 'Sharp', 'A corner: no handles'], ['s', 'Smooth', 'Handles stay in line; each keeps its length'], ['y', 'Symmetric', 'Handles stay in line and the same length'], ['f', 'Free', 'Each handle moves on its own (or hold Alt while dragging)']], v => MP.setMode(o, S.pathKey.t, v)),
        W.iconBtn('trash', 'Remove this point (its keyframe)', () => MP.removeKey(o, S.pathKey.t), 'sm'), h('span.lbl', null, 'Double-click the path to add a point.')];
    },
  };
  SB.on('select', () => { if (S.pathKey && S.pathKey.id !== S.sel) S.pathKey = null; });
})(window.SB);
