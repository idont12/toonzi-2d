/* The group box: with two or more layers selected, one box goes around all of them (like PowerPoint).
   Its corners stretch every layer together, in width and height freely (around the opposite corner; Alt: around the middle;
   Shift: the ratio stays), its sides stretch one way (Shift: the ratio stays), and its round handle turns them all around
   the middle (Shift: 15° steps).
   Each layer keeps its place in the group: its position moves with the box, its own size and angle change with it.
   The Select tool (js/tools/select.js) asks hit() before the handles of one layer. */
'use strict';
(function (SB) {
  const U = SB.util, S = SB.state, TR = SB.tracks, tree = SB.tree, X = SB.xf, scene = SB.scene;
  const BRAND = '#5B3DF5';
  const editable = o => o && SB.types.get(o.type).visual && SB.types.get(o.type).render !== false && tree.inRange(o) && !tree.locked(o) && !tree.hidden(o) && !o.rigLock;
  /** The layers the box holds (none of them inside another), or null when fewer than two. */
  function items() {
    if (S.recording || S.pivotMode || S.tool !== 'select' || S.multi.size < 2 || (SB.framebox && SB.framebox.target())) return null;
    const list = tree.selected().filter(editable); return list.length >= 2 ? list : null;
  }
  /** Around all of them, on the stage: { x0, y0, x1, y1 }. */
  function box(list = items()) {
    if (!list) return null; const b = U.emptyBox();
    for (const o of list) { const q = scene.box(o); if (q) { U.growBox(b, q.aabb.x0, q.aabb.y0); U.growBox(b, q.aabb.x1, q.aabb.y1); } }
    return U.boxOk(b) ? b : null;
  }
  const corners = b => [{ x: b.x0, y: b.y0 }, { x: b.x1, y: b.y0 }, { x: b.x1, y: b.y1 }, { x: b.x0, y: b.y1 }];
  const ROT = 26; // the round handle: this many screen pixels above the box
  /** Which handle is under the pointer: { k: 'corner', i } | { k: 'side', s: 't'|'r'|'b'|'l' } | { k: 'rot' } | null. */
  function hit(e) {
    const b = box(); if (!b) return null; const r = SB.view.rect(), k = r.width / S.project.w, px = e.clientX - r.left, py = e.clientY - r.top, tol = e.pointerType === 'touch' ? 18 : 10;
    const near = (x, y, t = tol) => Math.hypot(px - x * k, py - y * k) < t;
    if (Math.hypot(px - (b.x0 + b.x1) / 2 * k, py - (b.y0 * k - ROT)) < tol + 2) return { k: 'rot' };
    const C = corners(b); for (let i = 0; i < 4; i++) if (near(C[i].x, C[i].y)) return { k: 'corner', i };
    const mx = (b.x0 + b.x1) / 2, my = (b.y0 + b.y1) / 2, sides = [['t', mx, b.y0], ['r', b.x1, my], ['b', mx, b.y1], ['l', b.x0, my]];
    for (const [s, x, y] of sides) if (near(x, y)) return { k: 'side', s };
    return null;
  }
  const cursorOf = h => !h ? null : h.k === 'rot' ? 'grab' : h.k === 'side' ? (h.s === 't' || h.s === 'b' ? 'ns-resize' : 'ew-resize') : h.i % 2 ? 'nesw-resize' : 'nwse-resize';

  /** Start dragging a handle of the box. */
  function start(h, P, e) {
    const list = items(), b = box(list); if (!b) return false;
    const its = list.map(o => { const lt = tree.localTime(o), tr = TR.transform(o, lt), W = X.world(o); return { o, k0: TR.keyed(o, lt), aw: W.transformPoint(U.pt(tr.ax, tr.ay)), PInv: X.parentWorld(o).inverse(), xAxis: Math.abs(W.a) + Math.abs(W.b) >= Math.abs(W.c) + Math.abs(W.d) ? Math.abs(W.a) >= Math.abs(W.b) : Math.abs(W.c) >= Math.abs(W.d) }; });
    const C = { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 };
    const d = SB.tool.drag = { kind: 'gbox', h, b, C, P0: P, its, a0: Math.atan2(P.y - C.y, P.x - C.x), map: p => p, moved: false,
      move: (P2, e2) => drag(d, P2, e2), up: () => { if (d.moved) SB.commit(); else SB.dirty(); }, cancel: () => { if (d.moved) SB.revert(); } };
    return true;
  }
  /** Set only what differs from now (so Auto key doesn't add keys for sizes that didn't change). */
  const setChanged = (o, vals) => { const cur = TR.keyed(o, tree.localTime(o)); for (const id in vals) if (Math.abs((cur[id] ?? (id === 'scx' || id === 'scy' ? 1 : 0)) - vals[id]) > 1e-6) TR.set(o, id, vals[id]); };
  /** Where a stage point of the group goes for this drag (used for the layers' positions and to draw the box). */
  function drag(d, P, e) {
    const { b, C, h } = d; let map, f = 1, fx = 1, fy = 1, ang = 0;
    if (h.k === 'corner') { // width and height change freely; Shift keeps the ratio
      const Cs = corners(b), F = e.altKey ? C : Cs[(h.i + 2) % 4], v0 = { x: d.P0.x - F.x, y: d.P0.y - F.y }, L = v0.x * v0.x + v0.y * v0.y || 1;
      if (e.shiftKey) { f = U.clamp(((P.x - F.x) * v0.x + (P.y - F.y) * v0.y) / L, 0.02, 50); map = p => ({ x: F.x + (p.x - F.x) * f, y: F.y + (p.y - F.y) * f }); }
      else { fx = Math.abs(v0.x) < 1 ? 1 : U.clamp((P.x - F.x) / v0.x, 0.02, 50); fy = Math.abs(v0.y) < 1 ? 1 : U.clamp((P.y - F.y) / v0.y, 0.02, 50); map = p => ({ x: F.x + (p.x - F.x) * fx, y: F.y + (p.y - F.y) * fy }); }
    } else if (h.k === 'side') { // Shift: the ratio stays (the box grows from this side)
      const horiz = h.s === 'l' || h.s === 'r', Fx = e.altKey ? C.x : h.s === 'r' ? b.x0 : b.x1, Fy = e.altKey ? C.y : h.s === 'b' ? b.y0 : b.y1;
      const g = horiz ? U.clamp((P.x - Fx) / ((d.P0.x - Fx) || 1), 0.02, 50) : U.clamp((P.y - Fy) / ((d.P0.y - Fy) || 1), 0.02, 50);
      if (e.shiftKey) { f = g; const F = horiz ? { x: Fx, y: C.y } : { x: C.x, y: Fy }; map = p => ({ x: F.x + (p.x - F.x) * f, y: F.y + (p.y - F.y) * f }); }
      else if (horiz) { fx = g; map = p => ({ x: Fx + (p.x - Fx) * fx, y: p.y }); }
      else { fy = g; map = p => ({ x: p.x, y: Fy + (p.y - Fy) * fy }); }
    } else {
      ang = Math.atan2(P.y - C.y, P.x - C.x) - d.a0; if (e.shiftKey) ang = Math.round(ang / (Math.PI / 12)) * (Math.PI / 12);
      const c = Math.cos(ang), s = Math.sin(ang); map = p => ({ x: C.x + (p.x - C.x) * c - (p.y - C.y) * s, y: C.y + (p.x - C.x) * s + (p.y - C.y) * c });
    }
    d.map = map; d.moved = true;
    for (const it of d.its) {
      const nw = map(it.aw), a = it.PInv.transformPoint(U.pt(nw.x, nw.y)), z = it.PInv.transformPoint(U.pt(it.aw.x, it.aw.y)), k = it.k0, vals = { x: U.r1(k.x + a.x - z.x), y: U.r1(k.y + a.y - z.y) };
      if (h.k === 'rot') vals.rot = U.r1(k.rot + ang * 180 / Math.PI);
      else { // sizes count from the start of the drag, so Shift keeps the ratio the layers had then
        vals.scale = U.r3(k.scale * f); vals.scx = k.scx ?? 1; vals.scy = k.scy ?? 1;
        if (f === 1) { const gx = it.xAxis ? fx : fy, gy = it.xAxis ? fy : fx; vals.scx = U.r3((k.scx ?? 1) * gx); vals.scy = U.r3((k.scy ?? 1) * gy); } } // each layer stretches along its own axes
      setChanged(it.o, vals);
    }
    SB.bump();
  }
  /** The box, its handles, and while dragging the box as it changes. */
  function overlay(O) {
    if (S.playing) return; const d = SB.tool.drag, live = d && d.kind === 'gbox', b = live ? d.b : box(); if (!b) return;
    const c = O.c, dp = O.dpr, P = corners(b).map(p => live ? d.map(p) : p).map(p => O.P(p.x, p.y)), hs = (matchMedia('(pointer:coarse)').matches ? 7 : 5) * dp;
    c.save(); c.strokeStyle = BRAND; c.lineWidth = 1.5 * dp; c.beginPath(); P.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.closePath(); c.stroke();
    c.fillStyle = '#fff'; P.forEach(([x, y]) => { c.beginPath(); c.rect(x - hs, y - hs, hs * 2, hs * 2); c.fill(); c.stroke(); });
    for (let i = 0; i < 4; i++) { const a = P[i], q = P[(i + 1) % 4], ang = Math.atan2(q[1] - a[1], q[0] - a[0]); c.save(); c.translate((a[0] + q[0]) / 2, (a[1] + q[1]) / 2); c.rotate(ang); c.beginPath(); c.roundRect(-hs * 1.5, -hs * 0.75, hs * 3, hs * 1.5, hs * 0.6); c.fill(); c.stroke(); c.restore(); }
    const tx = (P[0][0] + P[1][0]) / 2, ty = (P[0][1] + P[1][1]) / 2, ux = P[1][0] - P[0][0], uy = P[1][1] - P[0][1], ul = Math.hypot(ux, uy) || 1, nx = uy / ul, ny = -ux / ul, rx = tx + nx * ROT * dp, ry = ty + ny * ROT * dp;
    c.beginPath(); c.moveTo(tx, ty); c.lineTo(rx, ry); c.stroke(); c.beginPath(); c.arc(rx, ry, 6 * dp, 0, Math.PI * 2); c.fill(); c.stroke(); c.restore();
  }
  SB.groupBox = { items, box, hit, start, overlay, cursorOf };
})(window.SB);
