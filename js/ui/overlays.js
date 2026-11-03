/* Everything drawn over the stage that is not part of the picture:
   faint content outside the canvas, onion skin, selection boxes and handles,
   snap guides, the marquee, point handles. Drawn in device pixels on #ovl. */
'use strict';
(function (SB) {
  const U = SB.util, S = SB.state, tree = SB.tree, X = SB.xf, G = SB.paths;
  const BRAND = '#5B3DF5', HOT = '#FF4F8B';

  const OV = SB.overlays = {
    extra: [], under: [],
    draw(O) {
      if (S.exporting) return;
      for (const f of OV.under) f(O); // the board: other screens (js/ui/board.js)
      outside(O); onion(O);
      if (S.tool !== 'select' && S.tool !== 'points') dashedSelection(O);
      for (const f of OV.extra) f(O); // rigs, controllers, physics (js/rig/ui.js)
      const t = SB.tool.cur(); if (t.overlay) t.overlay(O);
      if (S.tool === 'select') SB.motionPath.draw(O);
      guides(O);
    },
    /** Selection outlines, resize/rotate handles and the pivot. */
    selection(O) {
      if (S.playing && !S.recording) return; const c = O.c, d = O.dpr, prim = tree.sel();
      for (const m of tree.selected()) {
        if (S.textEdit === m.id || !SB.types.get(m.type).visual || SB.types.get(m.type).render === false || !tree.inRange(m) || tree.hidden(m)) continue;
        const box = SB.scene.box(m); if (!box) continue; const P = box.pts.map(p => O.P(p.x, p.y));
        c.save(); c.strokeStyle = BRAND; c.lineWidth = (m === prim ? 1.5 : 1) * d; c.setLineDash(m.type === 'group' ? [8 * d, 4 * d] : []);
        c.beginPath(); P.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.closePath(); c.stroke(); c.setLineDash([]);
        if (m === prim && !tree.locked(m) && !m.rigLock && !(SB.framebox && SB.framebox.target()) && !(SB.groupBox && SB.groupBox.items())) { // several layers: the group box has the handles
          const hs = (matchMedia('(pointer:coarse)').matches ? 7 : 5) * d; c.fillStyle = '#fff';
          P.forEach(([x, y]) => { c.beginPath(); c.rect(x - hs, y - hs, hs * 2, hs * 2); c.fill(); c.stroke(); });
          for (let i = 0; i < 4; i++) { const a = P[i], b = P[(i + 1) % 4], mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, ang = Math.atan2(b[1] - a[1], b[0] - a[0]); c.save(); c.translate(mx, my); c.rotate(ang); c.beginPath(); c.roundRect(-hs * 1.5, -hs * 0.75, hs * 3, hs * 1.5, hs * 0.6); c.fill(); c.stroke(); c.restore(); }
          const [tx, ty] = O.P(box.top.x, box.top.y), rx = tx + box.dir.x * 26 * d, ry = ty + box.dir.y * 26 * d;
          c.beginPath(); c.moveTo(tx, ty); c.lineTo(rx, ry); c.stroke(); c.beginPath(); c.arc(rx, ry, 6 * d, 0, Math.PI * 2); c.fill(); c.stroke();
          const [ax, ay] = O.P(box.anchor.x, box.anchor.y), R = (S.pivotMode ? 8 : 5) * d;
          c.strokeStyle = HOT; c.lineWidth = 2 * d; c.fillStyle = 'rgba(255,255,255,.9)'; c.beginPath(); c.arc(ax, ay, R, 0, Math.PI * 2); c.fill(); c.stroke();
          c.beginPath(); c.moveTo(ax - R * 1.7, ay); c.lineTo(ax + R * 1.7, ay); c.moveTo(ax, ay - R * 1.7); c.lineTo(ax, ay + R * 1.7); c.stroke();
        }
        c.restore();
      }
    },
    marquee(O) {
      const d = SB.tool.drag; if (!d || d.kind !== 'marquee' || !d.P1) return; const c = O.c, [x0, y0] = O.P(d.P0.x, d.P0.y), [x1, y1] = O.P(d.P1.x, d.P1.y);
      c.save(); c.fillStyle = 'rgba(91,61,245,.08)'; c.strokeStyle = BRAND; c.lineWidth = O.dpr; c.setLineDash([5 * O.dpr, 3 * O.dpr]); c.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0)); c.strokeRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0)); c.restore();
    },
    /** Points tool: selected parts, path anchors and handles, freehand points. */
    parts(O) {
      const o = tree.sel(); if (!o || !SB.types.get(o.type).frames || tree.hidden(o) || S.playing) return;
      const fr = SB.frames.current(o), M = O.M(X.world(o)), q = (x, y) => M.transformPoint(U.pt(x, y)), c = O.c, d = O.dpr;
      c.save();
      for (const s of fr.strokes) {
        if (s.er) continue; const sel = S.selStrokes.has(s);
        if (sel) { c.strokeStyle = 'rgba(255,79,139,.9)'; c.lineWidth = 2 * d; c.setLineDash(s.f ? [4 * d, 3 * d] : []); for (const L of G.lines(s)) { c.beginPath(); for (let i = 0; i < L.length; i += 2) { const p = q(L[i], L[i + 1]); i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y); } c.stroke(); } c.setLineDash([]); }
        if (s.b) {
          for (const sub of s.subs) {
            const p = sub.p, n = (p.length - 2) / 6 + 1;
            if (sel) { c.strokeStyle = 'rgba(91,61,245,.6)'; c.lineWidth = d; for (const hd of SB.pathEdit.shownHandles(fr)) { if (hd.sub !== sub) continue; const k = hd.j % 6 === 2 ? hd.j - 2 : hd.j + 2, a = q(p[k], p[k + 1]), hh = q(p[hd.j], p[hd.j + 1]); c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(hh.x, hh.y); c.stroke(); c.beginPath(); c.arc(hh.x, hh.y, 3.5 * d, 0, Math.PI * 2); c.fillStyle = '#fff'; c.fill(); c.stroke(); } }
            const picked = S.selPts.length ? new Set(S.selPts.filter(pt => pt.s === s && s.subs[pt.si] === sub).map(pt => pt.i)) : null, some = S.selPts.some(pt => pt.s === s);
            for (let i = 0; i < n - (sub.cl ? 1 : 0); i++) { const a = q(p[6 * i], p[6 * i + 1]), on = picked && picked.has(i), hs = (on ? 5.5 : sel ? 4.5 : 3) * d; c.beginPath(); c.rect(a.x - hs, a.y - hs, hs * 2, hs * 2); c.fillStyle = on ? HOT : '#fff'; void some; c.strokeStyle = on ? HOT : BRAND; c.lineWidth = 1.2 * d; c.fill(); c.stroke(); }
          }
          if (S.selPt && S.selPt.s === s && s.subs[S.selPt.si]) { const sp = s.subs[S.selPt.si].p, a = q(sp[6 * S.selPt.i], sp[6 * S.selPt.i + 1]); c.beginPath(); c.arc(a.x, a.y, 9 * d, 0, Math.PI * 2); c.strokeStyle = HOT; c.lineWidth = 2 * d; c.stroke(); }
        } else if (sel) {
          for (const L of (s.f ? s.loops : [s.pts])) { const st = Math.max(2, Math.floor(L.length / 160) * 2); for (let i = 0; i < L.length; i += st) { const a = q(L[i], L[i + 1]); c.beginPath(); c.arc(a.x, a.y, 2.6 * d, 0, Math.PI * 2); c.fillStyle = '#fff'; c.strokeStyle = BRAND; c.lineWidth = 1.2 * d; c.fill(); c.stroke(); } }
        }
      }
      const dg = SB.tool.drag; if (dg && dg.snapTo && dg.sp && dg.sp.fr === fr) { const a = q(dg.snapTo.x, dg.snapTo.y); c.beginPath(); c.arc(a.x, a.y, 10 * d, 0, Math.PI * 2); c.strokeStyle = HOT; c.lineWidth = 2 * d; c.stroke(); } // snapped onto another point
      c.restore();
    },
  };
  function dashedSelection(O) {
    const c = O.c; for (const m of tree.selected()) {
      if (!SB.types.get(m.type).visual || SB.types.get(m.type).render === false || tree.hidden(m)) continue; const box = SB.scene.box(m); if (!box) continue;
      c.save(); c.strokeStyle = 'rgba(91,61,245,.55)'; c.lineWidth = O.dpr; c.setLineDash([5 * O.dpr, 4 * O.dpr]); c.beginPath(); box.pts.forEach((p, i) => { const [x, y] = O.P(p.x, p.y); i ? c.lineTo(x, y) : c.moveTo(x, y); }); c.closePath(); c.stroke(); c.restore();
    }
  }
  function guides(O) {
    const g = S.guides; if (!g || !SB.tool.drag) return; const c = O.c; c.save(); c.strokeStyle = HOT; c.lineWidth = O.dpr; c.setLineDash([4 * O.dpr, 3 * O.dpr]);
    if (g.x != null) { const [x] = O.P(g.x, 0); c.beginPath(); c.moveTo(x, 0); c.lineTo(x, c.canvas.height); c.stroke(); }
    if (g.y != null) { const [, y] = O.P(0, g.y); c.beginPath(); c.moveTo(0, y); c.lineTo(c.canvas.width, y); c.stroke(); }
    c.restore();
  }
  /** Onion skin: neighbouring frames of the selected layer, tinted. */
  function onion(O) {
    const o = tree.sel(), on = S.onionOpt; if (!S.onion || S.playing || !o || !SB.types.get(o.type).frames || o.frames.length < 2 || !tree.inRange(o) || tree.hidden(o)) return;
    const n = o.frames.length, i = SB.frames.index(o, tree.rawLocal(o)), wrap = o.play !== 'once' && o.play !== 'library', seen = new Set([i]), c = O.c;
    c.save(); c.setTransform(O.M(X.world(o)));
    const layer = (cnt, dir, col) => { for (let k = cnt; k >= 1; k--) { let j = i + dir * k; if (wrap) j = ((j % n) + n) % n; if (j < 0 || j >= n || seen.has(j)) continue; seen.add(j); c.globalAlpha = on.alpha * (1 - (k - 1) / (cnt + 0.5)); SB.strokes.draw(c, o.frames[j].strokes, { tint: col, skipErase: true }); } };
    layer(on.before, -1, on.cb); layer(on.after, 1, on.ca); c.restore();
  }
  /** Layers that hang past the canvas edge show faintly around it, so you can grab them. */
  function outside(O) {
    const p = S.project, outs = [];
    for (const o of S.objects) { const def = SB.types.get(o.type); if (!def.visual || def.render === false || tree.hidden(o) || !tree.inRange(o)) continue; const b = SB.scene.box(o); if (!b) continue; const q = b.aabb; if (q.x0 < -0.5 || q.y0 < -0.5 || q.x1 > p.w + 0.5 || q.y1 > p.h + 0.5) outs.push(o); }
    if (!outs.length || S.playing || S.ixPlay) return; // only a helper for grabbing them: not while it plays
    const c = O.c, W = c.canvas.width, H = c.canvas.height, g = U.poolCtx(W, H, ':ghost'), list = S.objects.filter(o => outs.includes(o));
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, W, H);
    // just the layers that hang out, without effects (a faint outline is enough, and it keeps dragging fast)
    SB.scene.renderList(g, list, S.time, O.M(), { T: S.time, preview: true, noFx: new Set(tree.all(list).map(o => o.id)) }, O.sc, 0);
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'destination-out'; g.fillRect(O.ox, O.oy, p.w * O.sc, p.h * O.sc); g.globalCompositeOperation = 'source-over';
    c.save(); c.globalAlpha = 0.38; c.drawImage(g.canvas, 0, 0); c.restore();
  }
})(window.SB);
