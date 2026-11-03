/* Pen tool (bezier paths) and the Points tool (edit any drawing part).

   Anchor indexing in a path sub's p array:
     anchor i      p[6i], p[6i+1]
     in-handle i   p[6i-2], p[6i-1]   (i ≥ 1)
     out-handle i  p[6i+2], p[6i+3]   (not on the last anchor)
   A closed sub ends with an anchor on top of anchor 0; they move together. */
'use strict';
(function (SB) {
  const U = SB.util, S = SB.state, tree = SB.tree, G = SB.paths, h = U.h, W = SB.w;
  const nA = sub => (sub.p.length - 2) / 6 + 1;
  const twin = (sub, i) => { if (!sub.cl) return -1; const n = nA(sub); return i === 0 ? n - 1 : i === n - 1 ? 0 : -1; };
  /** The handle before and after anchor i (a closed path wraps around), or -1. */
  const pairOf = (sub, i) => { const n = nA(sub); let a = i, inI = -1, outI = -1; if (sub.cl && a === n - 1) a = 0; if (a > 0) inI = 6 * a - 2; else if (sub.cl) inI = 6 * (n - 1) - 2; if (a < n - 1) outI = 6 * a + 2; return { a, inI, outI }; };
  /** How the two handles of an anchor move: 's' smooth (in line), 'y' symmetric (mirrored), 'f' free, 'c' sharp. */
  const modeOf = (sub, i) => { const { a, inI, outI } = pairOf(sub, i), m = sub.m && sub.m[a]; if (m) return m; const p = sub.p, at = j => j < 0 || Math.hypot(p[j] - p[6 * a], p[j + 1] - p[6 * a + 1]) < 0.5; return at(inI) && at(outI) ? 'c' : 's'; };
  const setMode = (sub, i, v) => { const { a } = pairOf(sub, i); sub.m = sub.m || []; while (sub.m.length < nA(sub)) sub.m.push(0); sub.m[a] = v; };
  const handleIdx = (sub, i) => { const n = nA(sub), r = []; if (i > 0) r.push(6 * i - 2); if (i < n - 1) r.push(6 * i + 2); const t = twin(sub, i); if (t > 0) r.push(6 * t - 2); if (t === 0) r.push(2); return r; };

  // ---------- pen
  const finish = () => {
    const p = S.pen; if (!p) return; S.pen = null;
    const sub = p.s.subs[0]; if (nA(sub) < 2) { const i = p.fr.strokes.indexOf(p.s); if (i >= 0) p.fr.strokes.splice(i, 1); }
    G.touch(p.s); SB.tool.centerFresh(p.o); SB.commit();
  };
  /** The last placed point of the path being drawn, on the stage. */
  function lastAnchor() { if (!S.pen) return null; const p = S.pen.s.subs[0].p, M = SB.xf.world(S.pen.o).transformPoint(U.pt(p[p.length - 2], p[p.length - 1])); return { x: M.x, y: M.y }; }
  SB.tools.add({
    id: 'pen', label: 'Pen', icon: 'pen', key: 'P', tip: 'Click for corners, drag for curves', cursor: 'crosshair',
    leave: finish, finish,
    down(P, e) {
      if (S.pen) P = SB.tool.straight(lastAnchor(), P, e); // Shift: level or upright from the last point
      if (!S.pen) SB.frames.autoFrame(SB.tool.drawTarget(null, true));
      const o = S.pen ? S.pen.o : SB.tool.drawTarget(null, true), sp = SB.tool.space(o), l = sp.Minv.transformPoint(U.pt(P.x, P.y)), x = U.r1(l.x), y = U.r1(l.y);
      if (!S.pen) {
        const s = { b: 1, subs: [{ p: [x, y], cl: 0 }], c: S.brush.color, s: U.r1(S.brush.size / sp.ws) }; if (S.penFill) s.fc = S.penFillC || S.brush.color;
        sp.fr.strokes.push(s); S.pen = { o, fr: sp.fr, s, out: [x, y], sp };
      } else {
        const sub = S.pen.s.subs[0], p = sub.p, k = SB.view.k() * sp.ws;
        if (nA(sub) >= 3 && Math.hypot(x - p[0], y - p[1]) * k < 12) { p.push(S.pen.out[0], S.pen.out[1], p[0], p[1], p[0], p[1]); sub.cl = 1; G.touch(S.pen.s); finish(); SB.toast('Path closed.'); return; }
        p.push(S.pen.out[0], S.pen.out[1], x, y, x, y); S.pen.out = [x, y]; G.touch(S.pen.s);
      }
      SB.tool.drag = { kind: 'penHandle', A: [x, y] }; SB.invalidate('ctxbar'); SB.bump();
    },
    move(P, e) {
      const d = SB.tool.drag; if (!d || !S.pen) return; P = SB.tool.straight(S.pen.sp.M.transformPoint(U.pt(d.A[0], d.A[1])), P, e); // Shift: a level or upright handle
      const l = S.pen.sp.Minv.transformPoint(U.pt(P.x, P.y)), p = S.pen.s.subs[0].p, [ax, ay] = d.A;
      S.pen.out = [U.r1(l.x), U.r1(l.y)];
      if (p.length > 2) { p[p.length - 4] = U.r1(2 * ax - l.x); p[p.length - 3] = U.r1(2 * ay - l.y); }
      G.touch(S.pen.s); SB.bump();
    },
    up() {}, dbl: finish, cancel: () => { S.pen = null; SB.revert(); },
    overlay(O) {
      const p = S.pen; if (!p) return; const c = O.c, M = O.M(SB.xf.world(p.o)), sub = p.s.subs[0].p, q = (x, y) => M.transformPoint(U.pt(x, y));
      c.save(); c.strokeStyle = '#5B3DF5'; c.lineWidth = 1.2 * O.dpr;
      const last = q(sub[sub.length - 2], sub[sub.length - 1]), out = q(p.out[0], p.out[1]);
      c.beginPath(); c.moveTo(last.x, last.y); c.lineTo(out.x, out.y); c.stroke(); c.beginPath(); c.arc(out.x, out.y, 3.5 * O.dpr, 0, Math.PI * 2); c.fillStyle = '#fff'; c.fill(); c.stroke();
      for (let i = 0; i < sub.length; i += 6) { const a = q(sub[i], sub[i + 1]); c.beginPath(); c.rect(a.x - 4 * O.dpr, a.y - 4 * O.dpr, 8 * O.dpr, 8 * O.dpr); c.fillStyle = i ? '#fff' : '#FF4F8B'; c.fill(); c.stroke(); }
      if (S.hover && !SB.tool.drag) { const hv = SB.tool.straight(lastAnchor(), S.hover), [hx, hy] = O.P(hv.x, hv.y); c.setLineDash([5 * O.dpr, 4 * O.dpr]); c.beginPath(); c.moveTo(last.x, last.y); c.lineTo(hx, hy); c.stroke(); }
      c.restore();
    },
    bar: () => [...SB.drawBars.colorBar(c => { if (S.pen) { S.pen.s.c = c; SB.bump(); } }), h('span.vsep'),
      ...SB.drawBars.sizeBar(() => S.brush.size, v => { S.brush.size = v; if (S.pen) S.pen.s.s = U.r1(v / S.pen.sp.ws); }, 80),
      W.check(S.penFill, 'Fill', v => { S.penFill = v; if (S.pen) { if (v) S.pen.s.fc = S.penFillC || S.brush.color; else delete S.pen.s.fc; SB.bump(); } SB.invalidate('ctxbar'); }), S.penFill ? W.colorBtn(S.penFillC || S.brush.color, { label: 'Fill color (its own color, not the line’s)', paint: true, input: c => { S.penFillC = c; if (S.pen) { S.pen.s.fc = c; SB.bump(); } } }) : null,
      S.pen ? W.btn('Finish path', finish, { cls: 'sm primary' }) : null,
      h('span.lbl', null, S.pen ? 'Click the first point to close. Shift keeps lines level or upright. Enter or double-click finishes.' : 'Click to place corners, drag to pull out curves. Shift keeps lines level or upright.')],
  });

  // ---------- points: select drawing parts, move them, edit anchors and handles
  function partsDown(P, e) {
    if (SB.select.ctrlDown && SB.select.ctrlDown(P, e)) return; // controllers can be dragged here too
    if (SB.framebox.down(P, e, false)) return; // the box around the selected parts or points: its corners, sides and turn handle
    let o = tree.sel(); const under = SB.scene.hit(P), hasF = x => x && SB.types.get(x.type).frames;
    if (hasF(under) && under !== o && !(o && SB.scene.inside(o, P))) { tree.select([under.id]); o = under; }
    if (!hasF(o)) o = SB.tool.drawTarget(P, false);
    if (!o) return SB.toast('Select a drawing to edit its points.');
    const sp = SB.tool.space(o), fr = sp.fr, l = sp.Minv.transformPoint(U.pt(P.x, P.y)), tol = (e.pointerType === 'touch' ? 16 : 9) / (SB.view.k() * sp.ws);
    // 1. an anchor of a path (any path of this drawing, like Figma's vector edit), or a handle of the one selected point
    clearTimeout(collapseT); collapseT = 0;
    let bestA = null, bestH = null;
    for (const s of fr.strokes) {
      if (!s.b || s.er) continue;
      s.subs.forEach((sub, si) => { const p = sub.p, n = nA(sub); for (let i = 0; i < n; i++) { const d = Math.hypot(p[6 * i] - l.x, p[6 * i + 1] - l.y); if (d < tol && (!bestA || d < bestA.d - 1e-6 || (S.selStrokes.has(s) && !S.selStrokes.has(bestA.s) && d <= bestA.d + tol * 0.3))) bestA = { s, si, j: 6 * i, d, isA: true }; } });
    }
    for (const hd of shownHandles(fr)) { const p = hd.sub.p, d = Math.hypot(p[hd.j] - l.x, p[hd.j + 1] - l.y); if (d < tol && (!bestH || d < bestH.d)) bestH = { s: hd.s, si: hd.si, j: hd.j, d, isA: false }; }
    const best = bestH && (!bestA || bestH.d < bestA.d - tol * 0.25) ? bestH : bestA; // a handle wins only when it is clearly nearer than an anchor
    if (best) {
      const sub = best.s.subs[best.si];
      if (!S.selStrokes.has(best.s)) { if (!(e.ctrlKey || e.metaKey || e.shiftKey)) { S.selStrokes = new Set([best.s]); S.selPts = []; S.selPt = null; } else S.selStrokes.add(best.s); }
      if (best.isA && e.altKey) { removeAnchor(sub, best.j / 6); G.touch(best.s); SB.raster.refreshFills(fr, new Set([best.s]), false); SB.commit(); return; }
      if (best.isA) {
        const pt = { s: best.s, si: best.si, i: anchorOf(sub, best.j / 6) }, had = ptIndex(pt) >= 0;
        const add = (e.ctrlKey || e.metaKey) !== e.shiftKey; // Shift or Ctrl (like Figma and Illustrator): add or remove one point; both: every point between
        if (add) { if (had) { S.selPts.splice(ptIndex(pt), 1); S.selPt = S.selPts[S.selPts.length - 1] || null; SB.invalidate('ctxbar'); SB.bump(); return; } S.selPts.push(pt); }
        else if (e.shiftKey && (e.ctrlKey || e.metaKey) && S.selPt && S.selPt.s === pt.s && S.selPt.si === pt.si) { // Ctrl+Shift: every point between the last one and this one
          const a = Math.min(S.selPt.i, pt.i), b = Math.max(S.selPt.i, pt.i); for (let k = a; k <= b; k++) if (ptIndex({ s: pt.s, si: pt.si, i: k }) < 0) S.selPts.push({ s: pt.s, si: pt.si, i: k });
        } else if (!had) S.selPts = [pt];
        S.selPt = pt; SB.invalidate('ctxbar');
        if (S.selPts.length > 1) { SB.tool.drag = { kind: 'anchors', sp, list: groupPts(S.selPts, fr), l0: l, moved: false, pt, plain: !(e.ctrlKey || e.metaKey || e.shiftKey) && had }; return; }
      }
      SB.tool.drag = { kind: best.isA ? 'anchor' : 'handle', sp, s: best.s, sub, j: best.j, orig: sub.p.slice(), l0: l, alt: e.altKey }; return;
    }
    // 2. a freehand point or a fill point of the selected part: only with "Drag: Bend" (S.partDrag), or Alt to delete it.
    //    By default a drag on a selected brush line or fill moves the whole part (step 3), like on a path.
    for (const s of S.partDrag === 'bend' || e.altKey ? S.selStrokes : []) {
      if (!fr.strokes.includes(s) || s.b || s.er) continue; const arrs = s.f ? s.loops : [s.pts];
      for (let ai = 0; ai < arrs.length; ai++) { const p = arrs[ai]; for (let j = 0; j < p.length; j += 2) if (Math.hypot(p[j] - l.x, p[j + 1] - l.y) < tol) {
        if (e.altKey) { if (p.length > (s.f ? 6 : 4)) { p.splice(j, 2); G.touch(s); SB.commit(); } return; }
        const arc = [0]; for (let i = 2; i < p.length; i += 2) arc.push(arc[arc.length - 1] + Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]));
        SB.tool.drag = { kind: 'pt', sp, s, p, j, orig: p.slice(), arc, l0: l, soft: s.f ? 0 : S.softEdit / sp.ws }; return;
      } }
    }
    // 3. a part: select it and move it
    if (S.selPt || S.selPts.length) { S.selPt = null; S.selPts = []; SB.invalidate('ctxbar'); }
    const hit = SB.raster.strokeAt(fr, l, tol);
    if (hit && e.altKey) { // Alt-drag: copies of the parts, in the same drawing, come along with the pointer
      const src = S.selStrokes.has(hit) ? fr.strokes.filter(s => S.selStrokes.has(s)) : [hit], copies = src.map(s => U.deep(s));
      fr.strokes.splice(Math.max(...src.map(s => fr.strokes.indexOf(s))) + 1, 0, ...copies); S.selStrokes = new Set(copies);
      SB.tool.drag = { kind: 'parts', sp, l0: l, moved: true, origs: copies.map(s => [s, U.deep(s)]) }; SB.invalidate('ctxbar'); SB.bump(); return;
    }
    if (hit) {
      if (e.shiftKey) { S.selStrokes.has(hit) ? S.selStrokes.delete(hit) : S.selStrokes.add(hit); } else if (!S.selStrokes.has(hit)) S.selStrokes = new Set([hit]);
      const moving = [...S.selStrokes].filter(s => fr.strokes.includes(s));
      SB.tool.drag = { kind: 'parts', sp, l0: l, moved: false, origs: moving.map(s => [s, U.deep(s)]) };
    } else { SB.tool.drag = { kind: 'marquee', P0: P, P1: null, add: e.shiftKey || e.ctrlKey || e.metaKey, sp, keep: new Set(S.selStrokes) }; if (!e.shiftKey && !e.ctrlKey && !e.metaKey) S.selStrokes.clear(); }
    SB.invalidate('ctxbar'); SB.bump();
  }
  let collapseT = 0;
  /** The handles you can see and grab: those of the one selected point, when it has any (a sharp point has none until you double-click it). */
  function shownHandles(fr) {
    if (S.selPts.length !== 1) return []; const pt = S.selPts[0], s = pt.s, sub = s.subs && s.subs[pt.si]; if (!sub || (fr && !fr.strokes.includes(s))) return [];
    const p = sub.p, i = pt.i, a = 6 * i; return handleIdx(sub, i).filter(j => Math.hypot(p[j] - p[a], p[j + 1] - p[a + 1]) >= 0.5).map(j => ({ s, si: pt.si, sub, j }));
  }
  // ---------- several points at once
  /** The anchor index of i in sub (the closing point of a closed sub is anchor 0). */
  const anchorOf = (sub, i) => sub.cl && i === nA(sub) - 1 ? 0 : i;
  const ptIndex = pt => S.selPts.findIndex(q => q.s === pt.s && q.si === pt.si && q.i === pt.i);
  /** Selected points per sub, with the indexes in p they move (anchor, its handles, its twin), for a drag or a nudge. */
  function groupPts(pts, fr) {
    const by = new Map();
    for (const pt of pts) { const sub = pt.s.subs && pt.s.subs[pt.si]; if (!sub || (fr && !fr.strokes.includes(pt.s))) continue; const key = sub; if (!by.has(key)) by.set(key, { s: pt.s, sub, idx: new Set(), orig: sub.p.slice() });
      const g = by.get(key), t = twin(sub, pt.i); [6 * pt.i, ...handleIdx(sub, pt.i)].forEach(j => g.idx.add(j)); if (t >= 0) g.idx.add(6 * t); }
    return [...by.values()];
  }
  function movePts(list, dx, dy, fromOrig) { list.forEach(g => { const p = g.sub.p; g.idx.forEach(j => { p[j] = U.r2((fromOrig ? g.orig[j] : p[j]) + dx); p[j + 1] = U.r2((fromOrig ? g.orig[j + 1] : p[j + 1]) + dy); }); G.touch(g.s); }); }
  /** Arrow keys with points selected: move them (dx, dy in stage pixels). Returns true when it did. */
  function nudgePts(dx, dy) {
    const o = tree.sel(); if (S.tool !== 'points' || !S.selPts.length || !o) return false; const fr = SB.frames.current(o), list = groupPts(S.selPts, fr); if (!list.length) return false;
    const Mi = SB.tool.space(o).Minv, a = Mi.transformPoint(U.pt(0, 0)), b = Mi.transformPoint(U.pt(dx, dy)); movePts(list, b.x - a.x, b.y - a.y, false);
    SB.raster.refreshFills(fr, new Set(list.map(g => g.s)), false); SB.commit(); return true;
  }
  /** Delete the selected points (a path keeps at least two). */
  function deletePts() {
    const o = tree.sel(); if (S.tool !== 'points' || !S.selPts.length || !o) return false; const fr = SB.frames.current(o);
    const bySub = new Map(); S.selPts.forEach(pt => { const sub = pt.s.subs && pt.s.subs[pt.si]; if (!sub) return; if (!bySub.has(sub)) bySub.set(sub, { s: pt.s, is: [] }); bySub.get(sub).is.push(pt.i); });
    bySub.forEach(({ s, is }, sub) => { [...new Set(is)].sort((a, b) => b - a).forEach(i => removeAnchor(sub, i)); G.touch(s); });
    S.selPts = []; S.selPt = null; SB.raster.refreshFills(fr, new Set([...bySub.values()].map(v => v.s)), false); SB.commit(); SB.invalidate('ctxbar'); return true;
  }
  function removeAnchor(sub, i) {
    const n = nA(sub); if (n <= 2 || (sub.cl && n <= 3)) return; if (sub.m) sub.m.splice(i, 1); S.selPt = null;
    if (sub.cl && (i === 0 || i === n - 1)) { const p = sub.p; p.splice(p.length - 6, 6); p[0] = p[p.length - 2]; p[1] = p[p.length - 1]; return; }
    if (i === 0) sub.p.splice(0, 6); else if (i === n - 1) sub.p.splice(sub.p.length - 6, 6); else sub.p.splice(6 * i - 2, 6);
  }
  /** With Snap on: the nearest path point or line end within a few screen pixels of local point (x, y) on this frame, or null.
      skip(sub, i): leave out the points that move along. */
  function snapPoint(sp, x, y, skip) {
    if (!S.snap) return null; const tol = 9 / (SB.view.k() * sp.ws); let best = null;
    const see = (px, py) => { const dd = Math.hypot(px - x, py - y); if (dd < tol && (!best || dd < best.d)) best = { d: dd, x: px, y: py }; };
    for (const s of sp.fr.strokes) {
      if (s.er || s.f) continue;
      if (s.b) s.subs.forEach(sub => { const n = (sub.p.length - 2) / 6 + 1; for (let i = 0; i < n; i++) if (!skip(sub, i)) see(sub.p[6 * i], sub.p[6 * i + 1]); });
      else if (s.pts && s.pts.length >= 4) { see(s.pts[0], s.pts[1]); see(s.pts[s.pts.length - 2], s.pts[s.pts.length - 1]); }
    }
    return best;
  }
  function partsMove(P, e = {}) {
    const d = SB.tool.drag; if (!d) return; if (d.move) return d.move(P, e); if (d.kind === 'xf') return SB.select.moveXform(d, P, e);
    if (d.kind === 'marquee') { d.P1 = P; return; }
    if (d.kind !== 'handle' && d.sp && d.l0) P = SB.tool.straight(d.sp.M.transformPoint(U.pt(d.l0.x, d.l0.y)), P); // Shift: along the main direction only
    const l = d.sp && d.sp.Minv.transformPoint(U.pt(P.x, P.y));
    let dx = l.x - d.l0.x, dy = l.y - d.l0.y; d.snapTo = null;
    if (d.kind === 'anchors' || d.kind === 'anchor') { // Snap on: the dragged point lands on another path point (or line end) close by
      const sub = d.kind === 'anchor' ? d.sub : d.pt.s.subs[d.pt.si], i = d.kind === 'anchor' ? d.j / 6 : d.pt.i;
      if (!d.o0) d.o0 = d.kind === 'anchor' ? [d.orig[d.j], d.orig[d.j + 1]] : [sub.p[6 * i], sub.p[6 * i + 1]];
      const moving = d.kind === 'anchors' ? new Set(S.selPts.map(q => q.s.subs[q.si]).filter(Boolean)) : null;
      const hit = !e.altKey && snapPoint(d.sp, d.o0[0] + dx, d.o0[1] + dy, (sb, k) => sb === sub && (k === i || k === twin(sub, i)) || (moving && moving.has(sb) && S.selPts.some(q => q.s.subs[q.si] === sb && (q.i === k || twin(sb, q.i) === k))));
      if (hit) { dx = hit.x - d.o0[0]; dy = hit.y - d.o0[1]; d.snapTo = hit; }
    }
    if (d.kind === 'anchors') { d.moved = true; movePts(d.list, dx, dy, true); const now = performance.now(); if (!d.lastFill || now - d.lastFill > 110) { d.lastFill = now; SB.raster.refreshFills(d.sp.fr, new Set(d.list.map(g => g.s)), true); } return SB.bump(); }
    if (d.kind === 'anchor') {
      const p = d.sub.p, i = d.j / 6, idx = [d.j, ...handleIdx(d.sub, i)], t = twin(d.sub, i); if (t >= 0) idx.push(6 * t);
      for (const j of idx) { p[j] = U.r2(d.orig[j] + dx); p[j + 1] = U.r2(d.orig[j + 1] + dy); }
    } else if (d.kind === 'handle') {
      const p = d.sub.p, j = d.j; p[j] = U.r2(d.orig[j] + dx); p[j + 1] = U.r2(d.orig[j + 1] + dy);
      if (e.shiftKey) { // Shift: the handle lies flat or upright from its point; Shift+Ctrl: in 45° steps, keeping its length
        const a0 = (j % 6 === 2) ? j - 2 : j + 2, ax = p[a0], ay = p[a0 + 1], vx = p[j] - ax, vy = p[j + 1] - ay;
        if (e.ctrlKey || e.metaKey) { const L = Math.hypot(vx, vy), an = Math.round(Math.atan2(vy, vx) / (Math.PI / 4)) * Math.PI / 4; p[j] = U.r2(ax + Math.cos(an) * L); p[j + 1] = U.r2(ay + Math.sin(an) * L); }
        else if (Math.abs(vx) >= Math.abs(vy)) p[j + 1] = ay; else p[j] = ax;
      }
      // the opposite handle: in line (smooth), mirrored (symmetric) or left alone (free, or hold Alt)
      const aj = (j % 6 === 2) ? j - 2 : j + 2, ai = aj / 6, opp = handleIdx(d.sub, ai).find(k => k !== j), mode = d.alt ? 'f' : modeOf(d.sub, ai);
      if (mode !== 'f' && opp != null) { const ax = p[aj], ay = p[aj + 1], L = mode === 'y' ? Math.hypot(p[j] - ax, p[j + 1] - ay) : Math.hypot(d.orig[opp] - ax, d.orig[opp + 1] - ay), a = Math.atan2(p[j + 1] - ay, p[j] - ax); if (L > 0.5 || mode === 'y') { p[opp] = U.r2(ax - Math.cos(a) * L); p[opp + 1] = U.r2(ay - Math.sin(a) * L); } }
      if (mode === 'c') setMode(d.sub, ai, 's'); // pulled out of a sharp point: it is smooth now
    } else if (d.kind === 'pt') {
      const p = d.p, a0 = d.arc[d.j / 2];
      for (let j = 0; j < p.length; j += 2) { const w = j === d.j ? 1 : d.soft > 0 ? Math.exp(-2 * Math.pow((d.arc[j / 2] - a0) / d.soft, 2)) : 0; if (w < 0.002) { p[j] = d.orig[j]; p[j + 1] = d.orig[j + 1]; continue; } p[j] = U.r1(d.orig[j] + dx * w); p[j + 1] = U.r1(d.orig[j + 1] + dy * w); }
    } else if (d.kind === 'parts') {
      d.moved = true; const mv = a => a.map((v, i) => U.r2(v + (i % 2 ? dy : dx)));
      d.origs.forEach(([s, o]) => { if (s.f) { s.loops = o.loops.map(mv); if (o.seed) s.seed = mv(o.seed); } else if (s.b) s.subs.forEach((sb, i) => sb.p = mv(o.subs[i].p)); else s.pts = mv(o.pts); G.touch(s); });
    }
    if (d.s) { G.touch(d.s); const now = performance.now(); if (!d.lastFill || now - d.lastFill > 110) { d.lastFill = now; SB.raster.refreshFills(d.sp.fr, new Set([d.s]), true); } }
    SB.bump();
  }
  function partsUp(P, e) {
    const d = SB.tool.drag; if (!d) return; if (d.up) return d.up(P, e); if (d.kind === 'xf') { if (d.moved) SB.commit(); return; }
    if (d.kind === 'marquee') return partsMarquee(d);
    if (d.kind === 'parts' && !d.moved) return SB.invalidate('ctxbar');
    if (d.kind === 'anchors') { if (!d.moved) { if (d.plain) collapseT = setTimeout(() => { collapseT = 0; if (S.tool !== 'points') return; S.selPts = [d.pt]; S.selPt = d.pt; SB.invalidate('ctxbar'); SB.bump(); }, 320); return SB.invalidate('ctxbar'); } SB.raster.refreshFills(d.sp.fr, new Set(d.list.map(g => g.s)), false); return SB.commit(); }
    const fr = d.sp.fr, changed = new Set(d.s ? [d.s] : d.origs.map(([s]) => s).filter(s => !s.f));
    SB.raster.refreshFills(fr, changed, false); SB.commit();
  }
  function partsMarquee(d) {
    if (!d.P1 || !d.sp) return SB.invalidate('ctxbar'); const r = { x0: Math.min(d.P0.x, d.P1.x), y0: Math.min(d.P0.y, d.P1.y), x1: Math.max(d.P0.x, d.P1.x), y1: Math.max(d.P0.y, d.P1.y) };
    const M = d.sp.M, inBox = (x, y) => { const q = M.transformPoint(U.pt(x, y)); return q.x >= r.x0 && q.x <= r.x1 && q.y >= r.y0 && q.y <= r.y1; };
    // a box around points of the selected paths selects those points (Shift or Ctrl adds); otherwise it selects parts
    const pts = []; d.sp.fr.strokes.forEach(s => { if (!s.b || s.er) return; s.subs.forEach((sub, si) => { const n = nA(sub); for (let i = 0; i < n - (sub.cl ? 1 : 0); i++) if (inBox(sub.p[6 * i], sub.p[6 * i + 1])) pts.push({ s, si, i }); }); });
    if (pts.length) { S.selStrokes = new Set([...(d.add ? d.keep : []), ...pts.map(pt => pt.s)]); if (!d.add) S.selPts = []; pts.forEach(pt => { if (ptIndex(pt) < 0) S.selPts.push(pt); }); S.selPt = S.selPts[S.selPts.length - 1]; SB.invalidate('ctxbar'); return SB.bump(); }
    const set = d.add ? new Set(S.selStrokes) : new Set();
    d.sp.fr.strokes.forEach(s => { if (s.er) return; if (G.lines(s).some(a => { for (let i = 0; i < a.length; i += 2) { const q = M.transformPoint(U.pt(a[i], a[i + 1])); if (q.x >= r.x0 && q.x <= r.x1 && q.y >= r.y0 && q.y <= r.y1) return true; } return false; })) set.add(s); });
    S.selStrokes = set; SB.invalidate('ctxbar');
  }
  /** Double-click: on an anchor toggles sharp / smooth, on a curve adds an anchor. */
  function partsDbl(P) {
    if (collapseT || S.selPts.length > 1) { clearTimeout(collapseT); collapseT = 0; return; } // several points selected: a double-click keeps them as they are (no handles)
    const o = tree.sel(); if (!o || !SB.types.get(o.type).frames) return; const sp = SB.tool.space(o), l = sp.Minv.transformPoint(U.pt(P.x, P.y)), tol = 12 / (SB.view.k() * sp.ws);
    for (const s of sp.fr.strokes) {
      if (!s.b) continue;
      for (const sub of s.subs) {
        const p = sub.p, n = nA(sub);
        for (let i = 0; i < n; i++) if (Math.hypot(p[6 * i] - l.x, p[6 * i + 1] - l.y) < tol) {
          const hs = handleIdx(sub, i), sharp = hs.every(j => Math.hypot(p[j] - p[6 * i], p[j + 1] - p[6 * i + 1]) < 0.5);
          if (sharp) { // make smooth: handles along the line between neighbours
            const prev = i > 0 ? 6 * (i - 1) : (sub.cl ? 6 * (n - 2) : null), next = i < n - 1 ? 6 * (i + 1) : (sub.cl ? 6 : null);
            const ax = p[6 * i], ay = p[6 * i + 1], px = prev != null ? p[prev] : ax, py = prev != null ? p[prev + 1] : ay, nx = next != null ? p[next] : ax, ny = next != null ? p[next + 1] : ay;
            const tx = (nx - px) / 6, ty = (ny - py) / 6;
            hs.forEach(j => { const out = j === 6 * i + 2 || j === 2; p[j] = U.r2(ax + (out ? tx : -tx)); p[j + 1] = U.r2(ay + (out ? ty : -ty)); });
          } else hs.forEach(j => { p[j] = p[6 * i]; p[j + 1] = p[6 * i + 1]; });
          setMode(sub, i, sharp ? 's' : 'c'); const pt = { s, si: s.subs.indexOf(sub), i: anchorOf(sub, i) }; S.selStrokes = new Set([s]); S.selPts = [pt]; S.selPt = pt;
          G.touch(s); SB.raster.refreshFills(sp.fr, new Set([s]), false); SB.commit(); SB.invalidate('ctxbar'); SB.toast(sharp ? 'Smooth point: drag its handles to bend the curve.' : 'Sharp point.'); return;
        }
      }
    }
    // add a point on the nearest curve (split the bezier at the closest t)
    let best = null;
    for (const s of sp.fr.strokes) { if (!s.b) continue; s.subs.forEach(sub => { const p = sub.p; for (let i = 2; i + 5 < p.length; i += 6) for (let k = 1; k < 40; k++) { const u = k / 40, m = 1 - u, x = m * m * m * p[i - 2] + 3 * m * m * u * p[i] + 3 * m * u * u * p[i + 2] + u * u * u * p[i + 4], y = m * m * m * p[i - 1] + 3 * m * m * u * p[i + 1] + 3 * m * u * u * p[i + 3] + u * u * u * p[i + 5], d = Math.hypot(x - l.x, y - l.y); if (!best || d < best.d) best = { s, sub, i, u, d }; } }); }
    if (!(best && best.d < tol * 2) && !SB.raster.strokeAt(sp.fr, l, tol)) { S.selStrokes.clear(); S.selPts = []; S.selPt = null; return SB.tool.set('select'); } // double-click on empty space: back to Select
    if (best && best.d < tol * 2) {
      const p = best.sub.p, i = best.i, u = best.u, L = (a, b) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
      const P0 = [p[i - 2], p[i - 1]], P1 = [p[i], p[i + 1]], P2 = [p[i + 2], p[i + 3]], P3 = [p[i + 4], p[i + 5]];
      const A = L(P0, P1), B = L(P1, P2), C = L(P2, P3), D = L(A, B), E = L(B, C), F = L(D, E);
      p.splice(i, 6, ...A, ...D, ...F, ...E, ...C, ...P3); p.forEach((v, k) => p[k] = U.r2(v)); if (best.sub.m) best.sub.m.splice((i - 2) / 6 + 1, 0, 's');
      S.selStrokes = new Set([best.s]); G.touch(best.s); SB.commit(); SB.invalidate('ctxbar');
    }
  }
  /** Two selected end points of paths (ends of open curves) that can be joined: [a, b] or null. */
  function joinable() {
    if (S.selPts.length !== 2) return null; const [a, b] = S.selPts, end = pt => { const sub = pt.s.b && pt.s.subs[pt.si]; if (!sub || sub.cl) return false; const n = nA(sub); return pt.i === 0 || pt.i === n - 1; };
    if (!end(a) || !end(b) || (a.s === b.s && a.si === b.si && a.i === b.i)) return null; const o = tree.sel(), fr = o && SB.frames.current(o); if (!fr || !fr.strokes.includes(a.s) || !fr.strokes.includes(b.s)) return null; return [a, b];
  }
  /** A curve backwards (its points and handles in reverse order). */
  function reverseSub(sub) { const p = sub.p, q = []; for (let i = p.length - 2; i >= 0; i -= 2) q.push(p[i], p[i + 1]); sub.p = q; if (sub.m) sub.m.reverse(); if (sub.wp) sub.wp.reverse(); }
  /** Join the two selected ends: mode 'merge' makes them one point in the middle; 'line' adds a straight piece between them. Same curve: it closes. */
  function joinPts(mode = 'merge') {
    const j = joinable(); if (!j) return SB.toast('Select two end points of paths (Shift-click the second) to join them.'); const o = tree.sel(), fr = SB.frames.current(o); let [a, b] = j;
    const A = a.s.subs[a.si], B = b.s.subs[b.si], P = (sub, i) => [sub.p[6 * i], sub.p[6 * i + 1]], pa = P(A, a.i), pb = P(B, b.i), mid = [U.r2((pa[0] + pb[0]) / 2), U.r2((pa[1] + pb[1]) / 2)];
    const shift = (sub, i, to) => { const n = nA(sub), [x, y] = P(sub, i), dx = to[0] - x, dy = to[1] - y; [6 * i, ...handleIdx(sub, i)].forEach(k => { sub.p[k] = U.r2(sub.p[k] + dx); sub.p[k + 1] = U.r2(sub.p[k + 1] + dy); }); void n; };
    if (A === B) { // the two ends of one curve: close it
      const n = nA(A); if (mode === 'merge') { shift(A, 0, mid); shift(A, n - 1, mid); A.p[6 * (n - 1)] = A.p[0]; A.p[6 * (n - 1) + 1] = A.p[1]; A.cl = 1; }
      else { const p = A.p, k = p.length; p.push(p[k - 2], p[k - 1], p[0], p[1], p[0], p[1]); A.cl = 1; if (A.m) A.m.push(A.m[0] || 0); }
      G.touch(a.s);
    } else { // two curves: one curve, A then B (A turned to end at its point, B to start at its point)
      if (a.i === 0) reverseSub(A); if (b.i !== 0) reverseSub(B);
      if (mode === 'merge') { shift(A, nA(A) - 1, mid); shift(B, 0, mid); }
      const join = mode === 'merge' ? B.p.slice(2) : [A.p[A.p.length - 2], A.p[A.p.length - 1], B.p[0], B.p[1], B.p[0], B.p[1], ...B.p.slice(2)];
      const mA = A.m || B.m ? Array.from({ length: nA(A) }, (_, k) => (A.m && A.m[k]) || 0) : null, mB = mA ? Array.from({ length: nA(B) }, (_, k) => (B.m && B.m[k]) || 0) : null;
      A.p = A.p.concat(join); if (mA) A.m = mA.concat(mode === 'merge' ? mB.slice(1) : mB); delete A.wp;
      b.s.subs.splice(b.s.subs.indexOf(B), 1); if (!b.s.subs.length) { fr.strokes.splice(fr.strokes.indexOf(b.s), 1); S.selStrokes.delete(b.s); }
      G.touch(a.s); if (b.s !== a.s && fr.strokes.includes(b.s)) G.touch(b.s);
    }
    S.selPts = []; S.selPt = null; SB.raster.refreshFills(fr, new Set([a.s]), false); SB.commit(); SB.invalidate('ctxbar'); SB.toast(A === B ? 'The path is closed.' : 'Joined into one path.');
  }
  /** Change how the selected point's handles behave. */
  function pointMode(v) {
    if (S.selPts.length > 1) { const keep = S.selPt, all = S.selPts.slice(); all.forEach(pt => { S.selPt = pt; pointMode1(v, true); }); S.selPt = keep; SB.commit(); SB.invalidate('ctxbar'); return; }
    pointMode1(v);
  }
  function pointMode1(v, batch) {
    const sp0 = S.selPt; if (!sp0) return; const o = tree.sel(), fr = o && SB.frames.current(o); if (!fr || !fr.strokes.includes(sp0.s)) return;
    const sub = sp0.s.subs[sp0.si]; if (!sub) return; const p = sub.p, n = nA(sub), { a, inI, outI } = pairOf(sub, sp0.i), ax = p[6 * a], ay = p[6 * a + 1], tw = twin(sub, a);
    const put = (j, x, y) => { if (j < 0) return; p[j] = U.r2(x); p[j + 1] = U.r2(y); };
    const len = j => j < 0 ? 0 : Math.hypot(p[j] - ax, p[j + 1] - ay);
    if (v === 'c') { put(inI, ax, ay); put(outI, ax, ay); }
    else {
      if (len(inI) < 0.5 && len(outI) < 0.5) { // no handles yet: along the line between the neighbours
        const prev = a > 0 ? 6 * (a - 1) : (sub.cl ? 6 * (n - 2) : null), next = a < n - 1 ? 6 * (a + 1) : (sub.cl ? 6 : null);
        const px = prev != null ? p[prev] : ax, py = prev != null ? p[prev + 1] : ay, nx = next != null ? p[next] : ax, ny = next != null ? p[next + 1] : ay, tx = (nx - px) / 6, ty = (ny - py) / 6;
        put(inI, ax - tx, ay - ty); put(outI, ax + tx, ay + ty);
      } else if (v !== 'f' && inI >= 0 && outI >= 0) { // line them up behind the longer handle
        const main = len(outI) >= len(inI) ? outI : inI, other = main === outI ? inI : outI, ang = Math.atan2(p[main + 1] - ay, p[main] - ax), L = v === 'y' ? len(main) : len(other) || len(main);
        put(other, ax - Math.cos(ang) * L, ay - Math.sin(ang) * L);
      }
    }
    if (tw === 0 || (sub.cl && a === 0)) { const last = 6 * (n - 1); p[last] = p[0]; p[last + 1] = p[1]; }
    setMode(sub, a, v); G.touch(sp0.s); SB.raster.refreshFills(fr, new Set([sp0.s]), false); if (batch) return; SB.commit(); SB.invalidate('ctxbar');
  }
  /** A part with a line (width and line color), with a fill (fill color). */
  const hasLine = s => !s.f && !s.er && !(s.b && !s.s), hasFill = s => !s.er && (s.f || (s.b && !!s.fc));
  function partEdit(act, v) {
    const o = tree.sel(); if (!o) return; const fr = SB.frames.current(o), list = [...S.selStrokes].filter(s => fr.strokes.includes(s)), ws = SB.tool.space(o).ws;
    if (act === 'color') list.forEach(s => { if (s.b && s.fc && !s.s) s.fc = v; else { s.c = v; if (s.fc) s.fc = v; } });
    else if (act === 'lineColor') list.forEach(s => { if (hasLine(s)) s.c = v; });
    else if (act === 'fillColor') list.forEach(s => { if (s.f) s.c = v; else if (s.b && (s.fc || v)) s.fc = v; });
    else if (act === 'width') list.forEach(s => { if (!s.f) s.s = v; });
    else if (act === 'brush') { const br = S.brushes.find(b => b.id === v); if (br) list.forEach(s => { if (!s.f && !s.er) SB.brush.apply(br, s); }); }
    else if (act === 'smooth') list.forEach(s => { if (s.f) s.loops = s.loops.map(L => G.smoothPts(L, 2, true)); else if (s.b) G.smoothSubs(s, () => 0.6); else s.pts = G.smoothPts(s.pts, 3); G.touch(s); });
    else if (act === 'simplify') list.forEach(s => { if (s.f) s.loops = s.loops.map(L => G.rdp(L, 1.5 / ws, true)); else if (s.b) G.refit(s, 2 / ws); else s.pts = G.rdp(s.pts, 1.5 / ws); G.touch(s); });
    else if (act === 'toPath') list.forEach(s => { if (s.b || s.er) return; const i = fr.strokes.indexOf(s), n = s.f ? { b: 1, subs: s.loops.map(L => G.fitSub(L, 1.2 / ws, { closed: true })), fc: s.c, fr: 'evenodd', s: 0 } : { b: 1, subs: [G.fitFreehand(s.pts, 2 / ws)], c: s.c, s: s.s }; if (!s.f) { if (s.tx) n.tx = s.tx; if (s.bs) n.bs = U.deep(s.bs); if (s.wp) n.subs[0].wp = s.wp.slice(); } fr.strokes[i] = n; /* the brush look (texture, thin ends, wobble, widths) stays */ S.selStrokes.delete(s); S.selStrokes.add(n); });
    else if (act === 'close') list.forEach(s => { if (!s.b) return; s.subs.forEach(sub => { if (sub.cl) { sub.p.splice(sub.p.length - 6, 6); sub.cl = 0; } else { const p = sub.p, n = p.length; p.push(p[n - 2], p[n - 1], p[0], p[1], p[0], p[1]); sub.cl = 1; } }); G.touch(s); });
    else if (act === 'flipH' || act === 'flipV') { // mirror the parts around their middle
      const b = G.bounds(list); if (!U.boxOk(b)) return; const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2, M = new DOMMatrix().translateSelf(cx, cy).scaleSelf(act === 'flipH' ? -1 : 1, act === 'flipV' ? -1 : 1).translateSelf(-cx, -cy);
      list.forEach(s => { const i = fr.strokes.indexOf(s), n = G.transformStroke(s, M, 1); fr.strokes[i] = n; S.selStrokes.delete(s); S.selStrokes.add(n); });
    }
    else if (act === 'bool') { const r = SB.bool.combine(fr, list, v, ws); S.selStrokes = new Set(r ? [r] : []); if (!r) SB.toast(v === 'intersect' ? 'Those parts do not overlap.' : 'Nothing is left.'); }
    else if (act === 'outline') list.forEach(s => { const n = G.outlineStroke(s, true); if (!n) return; const i = fr.strokes.indexOf(s), add = s.b && s.fc ? [Object.assign(U.deep(s), { s: 0 }), n] : [n]; fr.strokes.splice(i, 1, ...add); S.selStrokes.delete(s); add.forEach(x => S.selStrokes.add(x)); });
    else if (act === 'delete') { fr.strokes = fr.strokes.filter(s => !S.selStrokes.has(s)); S.selStrokes.clear(); }
    else if (act === 'order') { // in front of or behind the other parts: 'front', 'fwd', 'bwd', 'back' (the picked parts keep their own order)
      const sel = fr.strokes.filter(s => S.selStrokes.has(s)), rest = fr.strokes.filter(s => !S.selStrokes.has(s)); if (!sel.length) return;
      if (v === 'front') fr.strokes = rest.concat(sel); else if (v === 'back') fr.strokes = sel.concat(rest);
      else { const a = fr.strokes.slice(), up = v === 'fwd', idx = a.map((s, i) => S.selStrokes.has(s) ? i : -1).filter(i => i >= 0); if (!up) idx.reverse();
        for (const i of idx) { const j = up ? i + 1 : i - 1; if (j < 0 || j >= a.length || S.selStrokes.has(a[j])) continue; [a[i], a[j]] = [a[j], a[i]]; } fr.strokes = a; }
    }
    if (['smooth', 'simplify', 'width', 'close'].includes(act)) SB.raster.refreshFills(fr, new Set(list), false);
    SB.commit(); SB.invalidate('ctxbar');
  }
  SB.tools.add({
    id: 'points', label: 'Points', icon: 'points', key: 'A', tip: 'Edit the points of drawings and paths', cursor: 'default',
    down: partsDown, move: partsMove, up: partsUp, dbl: partsDbl, cancel: () => { const d = SB.tool.drag; if (d && d.cancel) d.cancel(); else SB.revert(); }, edit: partEdit,
    leave() { S.selStrokes.clear(); S.selPt = null; S.selPts = []; },
    overlay(O) { SB.overlays.parts(O); SB.framebox.overlay(O); SB.overlays.marquee(O); },
    bar() {
      const n = S.selStrokes.size, one = n === 1 ? [...S.selStrokes][0] : null;
      if (!n) return [h('span.lbl', null, 'Click a point or box-select points (Shift or Ctrl adds). Drag to move them. Double-click a point to bend it (handles), double-click a line to add a point, Alt-click deletes one. Handles: Shift keeps them flat or upright, Shift+Ctrl in 45° steps, Alt moves one alone.'), h('span.vsep'), W.popSlider('Soft edit', S.softEdit, { min: 0, max: 200, title: 'Soft edit radius: nearby points follow', input: v => S.softEdit = v })];
      const col = one ? (one.f ? one.c : one.b && !one.s ? one.fc : one.c) : S.brush.color;
      const sp0 = S.selPt && S.selPt.s.subs && S.selPt.s.subs[S.selPt.si] ? S.selPt : null, pm = sp0 ? modeOf(sp0.s.subs[sp0.si], sp0.i) : null;
      const pointBar = sp0 ? [h('span.lbl', null, h('b', null, S.selPts.length > 1 ? `${S.selPts.length} points` : 'Point')), W.seg(pm, [['c', 'Sharp', 'A corner: no handles'], ['s', 'Smooth', 'Handles stay in line; each keeps its own length'], ['y', 'Symmetric', 'Handles stay in line and the same length'], ['f', 'Free', 'Each handle moves on its own (or hold Alt while dragging)']], v => pointMode(v)), h('span.vsep')] : [];
      const dragSeg = [...S.selStrokes].some(s => !s.b && !s.er) ? W.seg(S.partDrag === 'bend' ? 'bend' : 'move', [['move', 'Move', 'Drag a selected part to move it (arrows too: 1 px, Ctrl: 10 px)'], ['bend', 'Bend', 'Drag a point of a brush line or fill to bend it there (Soft edit: nearby points follow)']], v => { S.partDrag = v; SB.invalidate('ctxbar'); }) : null;
      const parts = () => { const o = tree.sel(), fr = o && SB.frames.current(o); return [...S.selStrokes].filter(s => fr && fr.strokes.includes(s)); };
      const lines = [...S.selStrokes].filter(hasLine), fills = [...S.selStrokes].filter(hasFill), mixed = (arr, f) => arr.length > 1 && arr.some(s => f(s) !== f(arr[0]));
      const common = [ // what every selected part shares: change it once for all of them (like Figma)
        lines.length ? h('span.part-prop', { title: mixed(lines, s => s.c) ? 'The lines have different colors: picking one sets all of them' : '' }, h('span.lbl', null, 'Line'), W.colorBtn(lines[0].c || '#24213F', { label: lines.length > 1 ? `Line color of ${lines.length} parts` : 'Line color', change: v => partEdit('lineColor', v) })) : null,
        !fills.length && [...S.selStrokes].some(s => s.b && s.subs.some(sb => sb.cl)) ? h('span.part-prop', { title: 'This shape is closed: give it a fill' }, h('span.lbl', null, 'Fill'), W.colorBtn('#FFFFFF', { label: 'Fill color (no fill yet)', change: v => partEdit('fillColor', v) })) : null,
        fills.length ? h('span.part-prop', null, h('span.lbl', null, 'Fill'), W.colorBtn((fills[0].f ? fills[0].c : fills[0].fc) || '#24213F', { label: fills.length > 1 ? `Fill color of ${fills.length} parts` : 'Fill color', change: v => partEdit('fillColor', v) })) : null,
        lines.length ? W.popSlider(mixed(lines, s => s.s) ? 'Width (mixed)' : 'Width', lines[0].s || 0, { min: 0, max: 80, step: 0.5, title: lines.length > 1 ? `Line width of ${lines.length} parts` : 'Line width', input: v => { parts().forEach(s => { if (hasLine(s)) s.s = v; }); SB.bump(); }, change: () => { const o = tree.sel(); SB.raster.refreshFills(SB.frames.current(o), new Set(parts()), false); SB.commit(); SB.invalidate('ctxbar'); } }) : null,
        !lines.length && !fills.length ? W.colorBtn(col || '#24213F', { label: 'Color', change: v => partEdit('color', v) }) : null,
        ...(() => { const dl = lines.filter(s => s.tx === 'dashed'); if (!dl.length) return []; const bs = s => s.bs || (s.bs = {}), set = (k, v) => { parts().forEach(s => { if (s.tx === 'dashed') { bs(s)[k] = v; G.touch(s); } }); SB.bump(); };
          return [W.popSlider('Dash', (dl[0].bs || {}).dl ?? 1.8, { min: 0, max: 12, step: 0.1, unit: '×', title: 'Dash length of the selected dashed lines, times their width', input: v => set('dl', v), change: () => SB.commit() }),
            W.popSlider('Space', (dl[0].bs || {}).dg ?? 1.4, { min: 0.2, max: 12, step: 0.1, unit: '×', title: 'Space between dashes, times the line width', input: v => set('dg', v), change: () => SB.commit() })]; })()];
      return [...pointBar, h('span.lbl', null, h('b', null, `${n} selected`)), dragSeg, ...common,
        [...S.selStrokes].some(s => !s.f && !s.er) ? SB.brushUI.styleBtn(() => { const o = tree.sel(), fr = o && SB.frames.current(o); return [...S.selStrokes].filter(s => fr && fr.strokes.includes(s) && !s.f && !s.er && !(s.b && !s.s)); }) : null,
        [...S.selStrokes].some(s => !s.b && !s.er) ? W.btn('Make editable path', () => partEdit('toPath'), { cls: 'sm', title: 'Turn brush lines and fills into bezier paths with handles' }) : null,
        [...S.selStrokes].some(s => s.b) ? W.btn('Open/close path', () => partEdit('close'), { cls: 'sm' }) : null,
        W.btn('Smooth', () => partEdit('smooth'), { cls: 'sm' }), W.btn('Fewer points', () => partEdit('simplify'), { cls: 'sm' }), W.iconBtn('flipH', 'Flip horizontally', () => partEdit('flipH'), 'sm flip'), W.iconBtn('flipV', 'Flip vertically', () => partEdit('flipV'), 'sm flip'),
        [...S.selStrokes].some(s => !s.f && !s.er && s.s > 0) ? W.btn('Line → fill', () => partEdit('outline'), { cls: 'sm', title: 'Turn the selected lines into filled shapes of the same width' }) : null,
        n > 1 ? W.btn('Combine', e => { const r = e.currentTarget.getBoundingClientRect(); SB.menu.open(r.left, r.bottom + 4, [
          { label: 'Join into one shape', icon: 'boolUnion', run: () => partEdit('bool', 'union') },
          { label: 'Subtract the front parts', icon: 'boolSub', run: () => partEdit('bool', 'subtract') },
          { label: 'Keep only the overlap', icon: 'boolInt', run: () => partEdit('bool', 'intersect') },
          { label: 'Remove the overlap', icon: 'boolXor', run: () => partEdit('bool', 'exclude') }]); }, { cls: 'sm', icon: 'boolUnion', title: 'Make one shape from the selected parts (lines count with their width)' }) : null,
        W.btn('New layer', e => { const r = e.currentTarget.getBoundingClientRect(); SB.menu.open(r.left, r.bottom + 4, [
          { label: `Copy to a new layer (${SB.keys.label('partsCopy')})`, run: () => SB.ops.partsToLayer(true) },
          { label: `Move to a new layer (${SB.keys.label('partsMove')})`, run: () => SB.ops.partsToLayer(false) }]); }, { cls: 'sm', icon: 'plus', title: 'Put these parts on their own layer: a copy, or moved out' }),
        h('span.vsep'), W.iconBtn('front', 'Bring to front (in front of the other parts)', () => partEdit('order', 'front'), 'sm'), W.iconBtn('fwd', 'Bring forward', () => partEdit('order', 'fwd'), 'sm'), W.iconBtn('bwd', 'Send backward', () => partEdit('order', 'bwd'), 'sm'), W.iconBtn('sendBack', 'Send to back (behind the other parts)', () => partEdit('order', 'back'), 'sm'), h('span.vsep'),
        joinable() ? W.btn('Join points', () => joinPts('merge'), { cls: 'sm primary', icon: 'link', title: 'Make the two selected end points one point (two curves become one; a curve’s two ends close it)' }) : null,
        W.btn('Delete', () => partEdit('delete'), { cls: 'sm ghost' }), W.btn('Done', () => SB.tool.set('select'), { cls: 'sm ghost', title: 'Back to Select (Esc)' })];
    },
  });
  SB.pathEdit = { nA, handleIdx, pairOf, modeOf, pointMode, nudgePts, deletePts, groupPts, shownHandles, joinable, joinPts };
})(window.SB);
