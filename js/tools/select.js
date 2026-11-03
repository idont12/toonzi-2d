/* Select tool: pick, move, resize, stretch, rotate, set the pivot, box-select.
   Clicking picks layers at the level you are working in: top-level layers first,
   double-click enters a group. Ctrl-click picks the deepest layer directly; Alt-drag drags a copy. */
'use strict';
(function (SB) {
  const U = SB.util, S = SB.state, TR = SB.tracks, tree = SB.tree, X = SB.xf, scene = SB.scene;

  /** Which layer a click at P should pick, at the current group level. */
  function pick(P, deep, enter) {
    const leaf = scene.hit(P); if (!leaf || deep) return leaf;
    const sel = tree.sel(), allowed = new Set([tree.ctx(), ...(sel ? tree.ancestors(sel) : [])]);
    if (enter && sel && sel.type === 'group') allowed.add(sel);
    for (let x = leaf; x; x = tree.parentOf(x)) { if (allowed.has(tree.parentOf(x)) && !tree.locked(x)) return x; }
    return leaf;
  }
  /** Which handle of the selection box is under the pointer. */
  function handleAt(o, e) {
    const box = scene.box(o); if (!box) return null;
    const r = SB.view.rect(), k = r.width / S.project.w, px = e.clientX - r.left, py = e.clientY - r.top, tol = e.pointerType === 'touch' ? 18 : 10;
    const t = { x: box.top.x * k + box.dir.x * 26, y: box.top.y * k + box.dir.y * 26 };
    if (Math.hypot(px - t.x, py - t.y) < tol + 2) return 'rotate';
    // the pivot is only grabbed in pivot mode, so dragging a layer by its middle always moves it (Alt-drag copies it)
    if (!S.recording && S.pivotMode && Math.hypot(px - box.anchor.x * k, py - box.anchor.y * k) < tol + 4) return 'origin';
    for (const p of box.pts) if (Math.hypot(px - p.x * k, py - p.y * k) < tol) return 'scale';
    const sides = ['side-t', 'side-r', 'side-b', 'side-l'];
    for (let i = 0; i < 4; i++) { const a = box.pts[i], b = box.pts[(i + 1) % 4]; if (Math.hypot(px - (a.x + b.x) / 2 * k, py - (a.y + b.y) / 2 * k) < tol) return sides[i]; }
    return null;
  }
  const editable = o => o && SB.types.get(o.type).visual && SB.types.get(o.type).render !== false && tree.inRange(o) && !tree.locked(o) && !tree.hidden(o);

  function startXform(o, mode, P) {
    if (o.rigLock && o.bind && mode !== 'origin') { if (!(SB.rigUI && SB.rigUI.poseFromLayer(o, P))) SB.toast('Rig lock is on: the rig moves this layer. Turn it off in the Rig section to move it.'); return; }
    const lt = tree.localTime(o), tr = TR.transform(o, lt), W = X.world(o), PInv = X.parentWorld(o).inverse(), aw = W.transformPoint(U.pt(tr.ax, tr.ay));
    // tr (with controllers, constraints, physics) places the handles; tr0 (keyframes only) is what the drag edits,
    // so a layer that follows something moves by exactly what you drag, keeping its offset from what it follows
    const k0 = TR.keyed(o, lt), full = c => c.space !== 'local' && tree.find(c.target) && TR.value(o, 'cn:' + c.id + ':amt', lt) >= 0.999;
    const cons = (o.cons || []).filter(full).map(c => ({ c, ox: c.ox || 0, oy: c.oy || 0, off: c.offset || 0, k: c.k || 1 }));
    if (cons.length && !o._consHint) { o._consHint = 1; const t = tree.find(cons[0].c.target); SB.toast(`This changes ${o.name}'s offset from ${t ? t.name : 'its target'}.`); }
    const d = SB.tool.drag = { kind: 'xf', mode, o, P0: P, tr0: k0, cons, PInv, aw, Winv: W.inverse(), pl0: PInv.transformPoint(U.pt(P.x, P.y)), d0: Math.max(1, Math.hypot(P.x - aw.x, P.y - aw.y)), a0: Math.atan2(P.y - aw.y, P.x - aw.x), acc: 0, moved: false };
    d.lastA = d.a0;
    if (mode === 'move' && !S.recording) {
      const moving = new Set(tree.selected().map(x => x.id).concat(o.id)), bx = scene.box(o);
      const cx = [0, S.project.w / 2, S.project.w], cy = [0, S.project.h / 2, S.project.h];
      (function walk(list) { for (const x of list) { if (moving.has(x.id) || x.hidden || !tree.inRange(x) || !SB.types.get(x.type).visual || x.isMask) continue; if (x.type === 'group') { walk(x.children); continue; } const b = scene.box(x); if (!b) continue; const q = b.aabb; if (q.x1 - q.x0 > S.project.w * 0.95 && q.y1 - q.y0 > S.project.h * 0.9) continue; cx.push(q.x0, (q.x0 + q.x1) / 2, q.x1); cy.push(q.y0, (q.y0 + q.y1) / 2, q.y1); } })(S.objects);
      d.snapB = bx ? bx.aabb : null; d.cands = { x: cx, y: cy };
      d.others = tree.selected().filter(x => x !== o && (editable(x) || (x.type === 'null' && tree.inRange(x) && !tree.locked(x) && !tree.hidden(x))) && !x.rigLock && !tree.isDesc(x, o) && !tree.isDesc(o, x)).map(x => { const PI = X.parentWorld(x).inverse(); return { o: x, tr0: TR.keyed(x, tree.localTime(x)), PInv: PI, pl0: PI.transformPoint(U.pt(P.x, P.y)) }; });
    }
    if (mode.startsWith('side')) {
      const b = scene.bounds(o, lt), side = mode.slice(5), my = (b.y0 + b.y1) / 2, mx = (b.x0 + b.x1) / 2;
      d.side = { side, b, useWH: ['shape', 'image', 'video'].includes(o.type), w0: TR.value(o, 'w', lt), h0: TR.value(o, 'h', lt), sx0: tr.scx ?? 1, sy0: tr.scy ?? 1,
        F0: W.transformPoint(U.pt(side === 'r' ? b.x0 : side === 'l' ? b.x1 : mx, side === 'b' ? b.y0 : side === 't' ? b.y1 : my)), C0: W.transformPoint(U.pt(mx, my)) };
    }
    if (S.recording && mode !== 'origin') SB.record.begin(d);
  }

  function snapMove(d, P, e) {
    if (!d.snapB || !S.snap || e.altKey || S.recording) { S.guides = null; return P; }
    const b = d.snapB, dx = P.x - d.P0.x, dy = P.y - d.P0.y, thr = 7 / SB.view.k();
    const best = (vals, cands) => { let m = null; for (const v of vals) for (const c of cands) { const dd = c - v; if (Math.abs(dd) < thr && (!m || Math.abs(dd) < Math.abs(m.d))) m = { d: dd, at: c }; } return m; };
    const sx = best([b.x0 + dx, (b.x0 + b.x1) / 2 + dx, b.x1 + dx], d.cands.x), sy = best([b.y0 + dy, (b.y0 + b.y1) / 2 + dy, b.y1 + dy], d.cands.y);
    S.guides = { x: sx ? sx.at : null, y: sy ? sy.at : null };
    return { x: P.x + (sx ? sx.d : 0), y: P.y + (sy ? sy.d : 0) };
  }

  /** With Snap on, a controller's knob dragged near one of its points (center, left, right… or a designed point) sits on it. */
  function ctrlSnap(c, v) {
    const C = SB.controls; if (!C) return null; const rx = c.rx ?? c.x, ry = c.ry ?? c.y, tol = 12 / (SB.view.k() * U.matScale(X.parentWorld(c))); let best = null;
    for (const s of C.slotsFor(c)) { const x = rx + s.u * C.RX(c), y = ry + s.v * C.RY(c), dd = Math.hypot(x - v.x, y - v.y); if (dd < tol && (!best || dd < best.d)) best = { d: dd, x: U.r1(x), y: U.r1(y) }; }
    return best && { x: best.x, y: best.y };
  }
  function moveXform(d, P, e) {
    const { o, tr0 } = d; d.moved = true; let vals;
    if (d.mode === 'move') { const ctl = o.type === 'null'; P = ctl ? SB.tool.straight(d.P0, P, e) : snapMove(d, SB.tool.straight(d.P0, P, e), e); const pl = d.PInv.transformPoint(U.pt(P.x, P.y)); vals = { x: U.r1(tr0.x + pl.x - d.pl0.x), y: U.r1(tr0.y + pl.y - d.pl0.y) };
      if (ctl) { S.guides = null; const q = !e.altKey && S.snap && ctrlSnap(o, vals); d.ctrlSnap = q || null; if (q) vals = q; } } // a controller's knob snaps only to its own points
    else if (d.mode === 'scale') vals = { scale: U.r3(U.clamp(tr0.scale * Math.hypot(P.x - d.aw.x, P.y - d.aw.y) / d.d0, 0.02, 50)) };
    else if (d.mode === 'rotate') { const a = Math.atan2(P.y - d.aw.y, P.x - d.aw.x); let da = a - d.lastA; if (da > Math.PI) da -= 2 * Math.PI; if (da < -Math.PI) da += 2 * Math.PI; d.acc += da; d.lastA = a; let r = tr0.rot + d.acc * 180 / Math.PI; if (e.shiftKey) r = Math.round(r / 15) * 15; vals = { rot: U.r1(r) }; }
    else if (d.mode === 'origin') {
      let l = d.Winv.transformPoint(U.pt(P.x, P.y)); const b = scene.bounds(o), k = SB.view.k(), Wf = d.Winv.inverse();
      if (b && !e.altKey) for (const ox of [0, 0.5, 1]) for (const oy of [0, 0.5, 1]) { const c = { x: b.x0 + (b.x1 - b.x0) * ox, y: b.y0 + (b.y1 - b.y0) * oy }, wc = Wf.transformPoint(U.pt(c.x, c.y)); if (Math.hypot(wc.x - P.x, wc.y - P.y) * k < 9) l = c; }
      X.setOrigin(o, l.x, l.y); return;
    } else if (d.mode.startsWith('side')) {
      const sd = d.side, b = sd.b, l = d.Winv.transformPoint(U.pt(P.x, P.y)), horiz = sd.side === 'l' || sd.side === 'r';
      const alt = e.altKey, full = horiz ? b.x1 - b.x0 : b.y1 - b.y0; // Alt: both sides move, the center stays
      const nw = alt ? 2 * Math.abs(horiz ? l.x - (b.x0 + b.x1) / 2 : l.y - (b.y0 + b.y1) / 2) : sd.side === 'r' ? l.x - b.x0 : sd.side === 'l' ? b.x1 - l.x : sd.side === 'b' ? l.y - b.y0 : b.y1 - l.y;
      const f = Math.max(0.02, nw / Math.max(1e-6, full));
      if (sd.useWH) TR.set(o, horiz ? 'w' : 'h', U.r1(Math.max(2, (horiz ? sd.w0 : sd.h0) * f))); else TR.set(o, horiz ? 'scx' : 'scy', U.r3((horiz ? sd.sx0 : sd.sy0) * f));
      const b1 = scene.bounds(o), my = (b1.y0 + b1.y1) / 2, mx = (b1.x0 + b1.x1) / 2;
      const F1 = X.world(o).transformPoint(alt ? U.pt(mx, my) : U.pt(sd.side === 'r' ? b1.x0 : sd.side === 'l' ? b1.x1 : mx, sd.side === 'b' ? b1.y0 : sd.side === 't' ? b1.y1 : my)), F0 = alt ? sd.C0 : sd.F0;
      const a = d.PInv.transformPoint(U.pt(F1.x, F1.y)), c = d.PInv.transformPoint(U.pt(F0.x, F0.y)), cur = TR.keyed(o, tree.localTime(o));
      TR.setMany(o, { x: U.r1(cur.x + c.x - a.x), y: U.r1(cur.y + c.y - a.y) }); return;
    }
    if (S.recording && d.rec) { SB.record.sample(d, vals); return; }
    // a constraint that fully sets this value: edit its offset instead (its "ideal position")
    for (const q of d.cons || []) {
      const c = q.c;
      if (c.type === 'copyPos' && 'x' in vals) { c.ox = U.r1(q.ox + vals.x - tr0.x); c.oy = U.r1(q.oy + vals.y - tr0.y); delete vals.x; delete vals.y; }
      if ((c.type === 'copyRot' || c.type === 'lookat') && 'rot' in vals) { c.offset = U.r1(q.off + vals.rot - tr0.rot); delete vals.rot; }
      if (c.type === 'copyScale' && 'scale' in vals) { c.k = U.r3(q.k * vals.scale / (tr0.scale || 1)); delete vals.scale; }
    }
    TR.setMany(o, vals); SB.bump(); if (o.rec) delete o.rec;
    if (d.others) for (const x of d.others) { const pl = x.PInv.transformPoint(U.pt(P.x, P.y)); TR.setMany(x.o, { x: U.r1(x.tr0.x + pl.x - x.pl0.x), y: U.r1(x.tr0.y + pl.y - x.pl0.y) }); }
  }

  function finishMarquee(d) {
    if (!d.P1 || Math.hypot(d.P1.x - d.P0.x, d.P1.y - d.P0.y) * SB.view.k() < 4) { if (!d.add && S.sel) tree.select([]); return; }
    const r = { x0: Math.min(d.P0.x, d.P1.x), y0: Math.min(d.P0.y, d.P1.y), x1: Math.max(d.P0.x, d.P1.x), y1: Math.max(d.P0.y, d.P1.y) };
    const inR = b => b.x0 >= r.x0 && b.x1 <= r.x1 && b.y0 >= r.y0 && b.y1 <= r.y1, found = [];
    for (const o of tree.rootList()) { const def = SB.types.get(o.type); if (o.hidden || o.locked || !tree.inRange(o) || !def.visual || def.render === false) continue; const b = scene.box(o); if (b && inR(b.aabb)) found.push(o.id); }
    tree.select(d.add ? [...new Set([...S.multi, ...found])] : found);
  }

  SB.tools.add({
    id: 'select', label: 'Select', icon: 'select', key: 'V', tip: 'Select, move, resize and rotate', cursor: 'default',
    down(P, e) {
      const o = tree.sel();
      for (const f of SB.select.pre) if (f(P, e)) return; // rigs, controllers, physics handles (also while recording)
      if (!S.recording) { const ph = SB.motionPath.hit(P); if (ph && (ph.kind !== 'line' || !(o && scene.inside(o, P)))) return SB.motionPath.down(ph, P, e); }
      // "This frame" in the drawing bar: the box changes the lines of this frame, not the layer
      if (SB.framebox.target()) { const t = SB.framebox.target(), hh = SB.framebox.hit(t, P, e), other = hh === 'move' && pick(P, e.altKey || e.ctrlKey || e.metaKey); if (hh && (!other || other === o)) return SB.framebox.start(t, hh, P); }
      else if (SB.groupBox.items()) { const gh = SB.groupBox.hit(e); if (gh && SB.groupBox.start(gh, P, e)) return; } // two or more layers: one box around all of them
      else if (editable(o)) { const hnd = handleAt(o, e); if (hnd) return startXform(o, hnd, P); }
      const hit = pick(P, e.ctrlKey || e.metaKey);
      if (hit && e.altKey && !S.recording && editable(hit)) { // Alt-drag: a copy, right above it, comes along with the pointer
        const items = S.multi.has(hit.id) ? tree.selected().filter(editable) : [hit], copies = SB.ops.duplicate(items, 0), c = copies[items.indexOf(hit)] || copies[0];
        if (c) { S.sel = c.id; startXform(c, 'move', P); } return;
      }
      if (hit) {
        // Shift: a click adds or removes it from the selection; a drag moves the selection along one direction only
        const was = S.multi.has(hit.id);
        if (e.shiftKey) { if (!was) tree.toggle(hit.id); }
        else if (!was) tree.select([hit.id]);
        if (S.multi.has(hit.id) && S.sel !== hit.id) { S.sel = hit.id; SB.invalidate(); }
        startXform(hit, 'move', P); const d = SB.tool.drag; if (d && e.shiftKey && was) d.unpick = hit.id;
        return;
      }
      SB.tool.drag = { kind: 'marquee', P0: P, P1: null, add: e.shiftKey };
    },
    move(P, e) {
      const d = SB.tool.drag; if (!d) return;
      if (d.move) return d.move(P, e);
      if (d.kind === 'marquee') { d.P1 = P; return; }
      if (d.kind === 'path') return SB.motionPath.move(P);
      if (d.kind === 'xf') { moveXform(d, P, e); SB.fields.refresh(U.$('#inspector')); if (d.mode === 'move' && SB.board) SB.board.hover([d.o]); }
    },
    up(P, e) {
      const d = SB.tool.drag; if (!d) return; S.guides = null;
      if (d.up) return d.up(P, e);
      if (d.kind === 'marquee') return finishMarquee(d);
      if (d.kind === 'path') { if (d.moved) SB.commit(); return; }
      if (d.kind === 'xf') { if (d.rec) return SB.record.end(d); if (!d.moved && d.unpick) return tree.toggle(d.unpick); if (d.moved) { SB.commit(); if (d.mode === 'move' && SB.board) SB.board.dropOnScreen([d.o, ...(d.others || []).map(x => x.o)]); } }
    },
    cancel() { const d = SB.tool.drag; if (d && d.cancel) d.cancel(); else if (d && d.moved) SB.revert(); S.guides = null; },
    hover(P, e) { const o = tree.sel(); const w = U.$('#stage'); if (SB.framebox.target()) { w.style.cursor = SB.framebox.cursor(P, e) || 'default'; return; } if (SB.groupBox.items()) { w.style.cursor = SB.groupBox.cursorOf(SB.groupBox.hit(e)) || 'default'; return; } if (editable(o)) { const hnd = handleAt(o, e); w.style.cursor = hnd === 'rotate' ? 'grab' : hnd === 'origin' ? 'move' : hnd ? 'nwse-resize' : 'default'; } },
    dbl(P, e) {
      const ph = SB.motionPath.hit(P), on = tree.sel() && scene.inside(tree.sel(), P); if (ph && (ph.kind !== 'line' || !on)) return SB.motionPath.dbl(ph, e);
      const sel = tree.sel(), hit = pick(P, false, true);
      if (sel && sel.seq && hit === sel) return tree.enter(sel); // double-click a shot to open it
      if (sel && sel.type === 'group' && hit && hit !== sel) return tree.select([hit.id]);
      const leaf = scene.hit(P); if (!leaf) return;
      if (leaf.type === 'text') return SB.textEdit.start(leaf);
      if (leaf.type === 'shape') { tree.select([leaf.id]); return SB.toast('Use “Convert to editable path” in the panel to edit its points.'); }
      if (SB.types.get(leaf.type).frames) {
        const sp = SB.tool.space(leaf), l = sp.Minv.transformPoint(U.pt(P.x, P.y)), s = SB.raster.strokeAt(sp.fr, l, 9 / (SB.view.k() * sp.ws));
        if (s) { tree.select([leaf.id]); SB.tool.set('points'); S.selStrokes = new Set([s]); SB.invalidate('ctxbar'); SB.toast('Editing points. Press Esc to go back.'); }
      }
    },
    overlay(O) { SB.overlays.selection(O); SB.groupBox.overlay(O); SB.framebox.overlay(O); SB.overlays.marquee(O); },
    bar() {
      const o = tree.sel(), h = U.h, W = SB.w;
      if (S.recording) return [h('span.lbl', { html: '<b>Recording.</b> Drag a layer to record its path (a corner for size, the round handle for rotation), a bone tip or bone to record the pose, or a controller knob.' })];
      const pivot = o ? W.btn('Move pivot', () => { S.pivotMode = !S.pivotMode; SB.invalidate('ctxbar'); SB.dirty(); }, { cls: 'sm' + (S.pivotMode ? ' on' : ''), title: 'Drag the pink cross to change the point the layer rotates and scales around' }) : null;
      const pathBar = !S.pivotMode && SB.motionPath.bar(o); if (pathBar) return [...pathBar, h('span.vsep'), pivot];
      if (o && !S.pivotMode && o.isMask) return [...SB.bars.mask(o), h('span.vsep'), ...(SB.bars[o.type] ? SB.bars[o.type](o).slice(1) : []), pivot];
      if (o && !S.pivotMode && SB.bars[o.type]) return [...SB.bars[o.type](o), h('span.vsep'), SB.types.get(o.type).render === false ? null : pivot];
      return [h('span.lbl', null, S.pivotMode ? 'Drag the pink cross to move the pivot.' : o ? (o.type === 'group' ? 'Double-click to work inside the group. Ctrl-click picks a layer inside. Alt-drag drags a copy.' : 'Drag to move (Alt-drag: a copy). Corners resize, sides stretch (Alt: from the center), the round handle rotates.') : 'Click a layer to select it. Drag on empty space to box-select.'), pivot];
    },
  });
  /** pre: functions (P, e) => true when they took the click (rig joints, controller knobs, throw handles). */
  SB.select = { pick, handleAt, startXform, moveXform, pre: [] };
})(window.SB);
