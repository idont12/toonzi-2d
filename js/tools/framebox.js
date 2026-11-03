/* The frame box: a box with handles that changes the drawing itself, not the layer.
     - Select tool with "This frame" on in the drawing bar: the box holds every line of the frame you see.
     - Edit points: the box holds the selected parts, or the selected points when you pick several
       (one point alone has no box: you edit just that point).
   Drag inside to move (Shift: straight), a corner to resize keeping the proportions (Shift: freely,
   Alt: from the middle), a side to stretch, the round handle to turn (Shift: 15° steps). */
'use strict';
(function (SB) {
  const U = SB.util, S = SB.state, tree = SB.tree, G = SB.paths;
  const BRAND = '#5B3DF5';

  /** What the box holds now: { o, sp, list, b } (b = bounds in the drawing's own space), or null.
      In Edit points: several selected points (pts: their anchors and handles), or the selected parts when no single point is picked. */
  function target() {
    if (S.playing || S.recording) return null;
    const o = tree.sel(); if (!o || o.type !== 'draw' || tree.locked(o) || tree.hidden(o) || !tree.inRange(o) || o.rigLock) return null;
    const fr = SB.frames.current(o); if (!fr) return null; let list, pts = null, b;
    if (S.tool === 'points') {
      if (S.selPts.length > 1) {
        pts = SB.pathEdit.groupPts(S.selPts, fr); if (!pts.length) return null; list = pts.map(g => g.s); b = U.emptyBox();
        pts.forEach(g => g.idx.forEach(j => { if (j % 6 === 0) U.growBox(b, g.sub.p[j], g.sub.p[j + 1]); }));
      } else if (S.selPts.length === 0 && S.selStrokes.size) list = fr.strokes.filter(s => S.selStrokes.has(s));
      else if (S.selPts.length === 0) list = fr.strokes.slice(); // nothing picked: the box holds the whole frame, as "This frame" does
      else return null;
    }
    else if (S.tool === 'select') { if (S.recolorAll !== false || tree.selected().length !== 1 || S.pivotMode) return null; list = fr.strokes.slice(); } // eraser marks move with the lines
    else return null;
    if (!list.length) return null; const sp = SB.tool.space(o); if (!b) b = G.bounds(list); if (!U.boxOk(b)) return null;
    if (S.tool === 'points') { const pad = 12 / (SB.view.k() * sp.ws); b = { x0: b.x0 - pad, y0: b.y0 - pad, x1: b.x1 + pad, y1: b.y1 + pad }; } // handles sit off the points, so the points stay clickable
    return { o, sp, list, b, pts, fr };
  }
  const corners = b => [[b.x0, b.y0], [b.x1, b.y0], [b.x1, b.y1], [b.x0, b.y1]];
  /** Handle spots in stage space, with M (drag in progress) applied. */
  function geo(t, M) {
    const W = M ? t.sp.M.multiply(M) : t.sp.M, P = (x, y) => W.transformPoint(U.pt(x, y)), b = t.b, cs = corners(b).map(([x, y]) => P(x, y));
    const sides = [0, 1, 2, 3].map(i => ({ x: (cs[i].x + cs[(i + 1) % 4].x) / 2, y: (cs[i].y + cs[(i + 1) % 4].y) / 2 }));
    const mid = P((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2), top = sides[0], dl = Math.hypot(top.x - mid.x, top.y - mid.y) || 1, gap = 26 / SB.view.k();
    return { cs, sides, mid, rot: { x: top.x + (top.x - mid.x) / dl * gap, y: top.y + (top.y - mid.y) / dl * gap }, top };
  }
  const SIDES = ['t', 'r', 'b', 'l'];
  /** Which part of the box is at P: 'rotate', 'c0'…'c3', 'st'/'sr'/'sb'/'sl', 'move' (inside) or null. */
  function hit(t, P, e) {
    const g = geo(t), tol = ((e && e.pointerType === 'touch') ? 18 : 10) / SB.view.k(), near = q => Math.hypot(P.x - q.x, P.y - q.y) < tol;
    if (near(g.rot)) return 'rotate';
    for (let i = 0; i < 4; i++) if (near(g.cs[i])) return 'c' + i;
    for (let i = 0; i < 4; i++) if (near(g.sides[i])) return 's' + SIDES[i];
    const l = t.sp.Minv.transformPoint(U.pt(P.x, P.y)), b = t.b, pad = 4 / (SB.view.k() * t.sp.ws);
    return l.x >= b.x0 - pad && l.x <= b.x1 + pad && l.y >= b.y0 - pad && l.y <= b.y1 + pad ? 'move' : null;
  }
  const CURSORS = { rotate: 'grab', move: 'move', c0: 'nwse-resize', c2: 'nwse-resize', c1: 'nesw-resize', c3: 'nesw-resize', st: 'ns-resize', sb: 'ns-resize', sl: 'ew-resize', sr: 'ew-resize' };

  /** Start dragging part h of the box. Sets SB.tool.drag with its own move / up / cancel. */
  function start(t, h, P) {
    const copies = t.pts ? null : t.list.map(s => U.deep(s)), b = t.b, c = { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 }, l0 = t.sp.Minv.transformPoint(U.pt(P.x, P.y));
    const d = SB.tool.drag = { kind: 'framebox', t, h, P0: P, l0, M: new DOMMatrix(), moved: false,
      move(P1, e) {
        let M = new DOMMatrix(), k = 1;
        if (h === 'move') { const q = e && e.shiftKey ? SB.tool.straight(P, P1, e) : P1, l = t.sp.Minv.transformPoint(U.pt(q.x, q.y)); M = M.translate(l.x - l0.x, l.y - l0.y); }
        else {
          const l = t.sp.Minv.transformPoint(U.pt(P1.x, P1.y));
          if (h === 'rotate') { let a = Math.atan2(l.y - c.y, l.x - c.x) - Math.atan2(l0.y - c.y, l0.x - c.x); a *= 180 / Math.PI; if (e && e.shiftKey) a = Math.round(a / 15) * 15; M = M.translate(c.x, c.y).rotate(a).translate(-c.x, -c.y); }
          else {
            const cs = corners(b), alt = e && e.altKey; let gx, gy, ax, ay, fx = true, fy = true;
            if (h[0] === 'c') { const i = +h[1]; [gx, gy] = cs[i]; [ax, ay] = alt ? [c.x, c.y] : cs[(i + 2) % 4]; }
            else { const sd = h[1]; fx = sd === 'l' || sd === 'r'; fy = !fx; gx = sd === 'l' ? b.x0 : sd === 'r' ? b.x1 : c.x; gy = sd === 't' ? b.y0 : sd === 'b' ? b.y1 : c.y; ax = alt ? c.x : sd === 'l' ? b.x1 : sd === 'r' ? b.x0 : c.x; ay = alt ? c.y : sd === 't' ? b.y1 : sd === 'b' ? b.y0 : c.y; }
            const f = (g, a, v) => Math.abs(g - a) < 1e-6 ? 1 : (g + v - a) / (g - a);
            let sx = fx ? f(gx, ax, l.x - l0.x) : 1, sy = fy ? f(gy, ay, l.y - l0.y) : 1;
            if (h[0] === 'c' && !(e && e.shiftKey)) { const s = Math.abs(sx) > Math.abs(sy) ? sx : sy; sx = sy = s; } // corners keep the proportions
            const nz = v => Math.abs(v) < 0.01 ? (v < 0 ? -0.01 : 0.01) : v; sx = nz(sx); sy = nz(sy);
            M = M.translate(ax, ay).scale(sx, sy).translate(-ax, -ay); k = Math.sqrt(Math.abs(sx * sy));
          }
        }
        d.M = M; d.moved = true;
        if (t.pts) t.pts.forEach(g => { const p = g.sub.p; g.idx.forEach(j => { const q = M.transformPoint(U.pt(g.orig[j], g.orig[j + 1])); p[j] = U.r2(q.x); p[j + 1] = U.r2(q.y); }); G.touch(g.s); });
        else t.list.forEach((s, i) => { const n = G.transformStroke(copies[i], M, k); for (const key of Object.keys(s)) delete s[key]; Object.assign(s, n); G.touch(s); });
        SB.bump();
      },
      up() { if (d.moved) { SB.raster.refreshFills(t.fr, new Set(t.list.filter(s => !s.f)), false); SB.commit(); } },
      cancel() { if (d.moved) SB.revert(); },
    };
    return d;
  }

  function overlay(O) {
    const dr = SB.tool.drag, live = dr && dr.kind === 'framebox' ? dr : null, t = live ? live.t : target(); if (!t) return; const M = live ? live.M : null; // while dragging: the box as it was, moved along
    const g = geo(t, M), c = O.c, d = O.dpr, P = q => O.P(q.x, q.y), hs = (matchMedia('(pointer:coarse)').matches ? 7 : 5) * d;
    c.save(); c.strokeStyle = BRAND; c.lineWidth = 1.5 * d; c.setLineDash([6 * d, 4 * d]);
    c.beginPath(); g.cs.forEach((q, i) => { const [x, y] = P(q); i ? c.lineTo(x, y) : c.moveTo(x, y); }); c.closePath(); c.stroke(); c.setLineDash([]);
    c.fillStyle = '#fff';
    const [tx, ty] = P(g.top), [rx, ry] = P(g.rot); c.beginPath(); c.moveTo(tx, ty); c.lineTo(rx, ry); c.stroke(); c.beginPath(); c.arc(rx, ry, 6 * d, 0, Math.PI * 2); c.fill(); c.stroke();
    g.cs.forEach(q => { const [x, y] = P(q); c.beginPath(); c.rect(x - hs, y - hs, hs * 2, hs * 2); c.fill(); c.stroke(); });
    g.sides.forEach(q => { const [x, y] = P(q); c.beginPath(); c.arc(x, y, hs * 0.8, 0, Math.PI * 2); c.fill(); c.stroke(); });
    const tag = S.tool === 'points' ? (t.pts ? `${S.selPts.length} points` : S.selStrokes.size ? 'Selected parts' : 'This frame only') : 'This frame only', [lx, ly] = P(g.cs[0]);
    c.font = `${11 * d}px system-ui, sans-serif`; const w = c.measureText(tag).width + 10 * d;
    c.fillStyle = BRAND; c.beginPath(); c.roundRect(lx, ly - 22 * d, w, 17 * d, 4 * d); c.fill(); c.fillStyle = '#fff'; c.textBaseline = 'middle'; c.fillText(tag, lx + 5 * d, ly - 13.5 * d);
    c.restore();
  }
  /** For a tool's down(P, e): start a box drag when P is on the box. Returns true when it took the click. */
  function down(P, e, allowMove = true) {
    const t = target(); if (!t) return false; const h = hit(t, P, e); if (!h || (h === 'move' && !allowMove)) return false;
    start(t, h, P); return true;
  }
  function cursor(P, e) { const t = target(); const h = t && hit(t, P, e); return h ? CURSORS[h] : null; }
  SB.framebox = { target, hit, start, down, overlay, cursor };
})(window.SB);
