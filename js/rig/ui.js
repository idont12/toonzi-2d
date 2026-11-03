/* Rigs, physics, controllers and constraints in the interface:
   stage handles (pose bones, drag controllers, aim throws), the Bones,
   Weights and Collision tools, overlays, inspector sections, menu items,
   timeline rows and the bar above the stage. */
'use strict';
(function (SB) {
  const U = SB.util, S = SB.state, TR = SB.tracks, tree = SB.tree, X = SB.xf, R = SB.rig, PH = SB.physics, C = SB.controls, h = U.h, W = SB.w, FL = SB.fields, pt = U.pt, G = SB.paths;
  const sec = FL.section, RIG = '#C2369A', ORANGE = '#E8730C', HOT = '#FF4F8B', TEAL = '#0F8F82';
  S.selBone = null; S.boneDraft = null; S.boneMode = 'turn'; S.wpaint = { add: true, r: 60, k: 0.5 }; S.poseLink = null;
  const rigVisible = r => r.showBones || r.id === S.sel || S.tool === 'bone' || S.tool === 'weights' || !!(S.picking && S.picking.bones);
  const usable = o => o && tree.inRange(o) && !tree.locked(o) && !tree.hidden(o);
  /** A locked rig can still be posed: locking keeps its bones' setup and its place, not its pose. */
  const poseable = o => o && tree.inRange(o) && !tree.hidden(o);
  const rigLocked = r => !!r && tree.locked(r);
  const lockedMsg = () => SB.toast('The rig is locked: its bones can be posed but not changed. Unlock it to edit the bones.');
  const fxable = o => o && SB.types.get(o.type).fx;
  SB.on('select', () => { const o = tree.sel(); if (!o || o.type !== 'rig') S.selBone = null; if (S.poseLink && !S.poseLink.multi && (!o || o.id !== S.poseLink.oid)) C.cancelSlot(); }); /* editing a controller's layers: pick any layer meanwhile */

  // ================= stage handles (run before the Select tool picks layers)
  /** Controller knob or its dashed box under P. */
  function ctrlHit(P) {
    const k = SB.view.k(), list = tree.all().filter(c => c.type === 'null' && usable(c)).reverse();
    for (const c of list) { const tr = TR.transform(c, tree.localTime(c)), q = X.world(c).transformPoint(pt(tr.ax, tr.ay)); if (Math.hypot(q.x - P.x, q.y - P.y) * k < 18) return { c, part: 'knob' }; }
    for (const c of list) {
      const t = C.motion(c); if (t === 'free') continue; const l = X.parentWorld(c).inverse().transformPoint(pt(P.x, P.y)), Wd = C.RX(c), Hd = C.RY(c), rx = c.rx ?? c.x, ry = c.ry ?? c.y, pad = 12 / k;
      const inX = Math.abs(l.x - rx) <= Wd + pad, inY = Math.abs(l.y - ry) <= Hd + pad;
      if (C.isCircle(c) && t !== 'x' && t !== 'y') { const e = Math.hypot((l.x - rx) / Wd, (l.y - ry) / Hd); if (Math.abs(e - 1) * Math.min(Wd, Hd) < pad) return { c, part: 'box' }; continue; }
      if ((t === 'x' && inX && Math.abs(l.y - ry) <= pad) || (t === 'y' && inY && Math.abs(l.x - rx) <= pad) || ((t === 'xy' || t === 'custom') && inX && inY && (Math.abs(Math.abs(l.x - rx) - Wd) < pad || Math.abs(Math.abs(l.y - ry) - Hd) < pad))) return { c, part: 'box' };
    }
    return null;
  }
  /** Drag the whole controller (its box and rest point), not just the knob. */
  function ctrlBoxDrag(c, P) {
    const PI = X.parentWorld(c).inverse(), l0 = PI.transformPoint(pt(P.x, P.y)), rx = c.rx ?? c.x, ry = c.ry ?? c.y, x0 = c.x, y0 = c.y, tx = U.deep(c.tracks.x || null), ty = U.deep(c.tracks.y || null);
    const rests = []; tree.all().forEach(o => (o.cons || []).forEach(k => { if (k.target === c.id && k.rest && k.space === 'local') rests.push([k, Object.assign({}, k.rest)]); }));
    return { kind: 'ctrlbox', moved: false,
      move(P) { const l = PI.transformPoint(pt(P.x, P.y)), dx = U.r1(l.x - l0.x), dy = U.r1(l.y - l0.y); this.moved = true; c.rx = U.r1(rx + dx); c.ry = U.r1(ry + dy); c.x = U.r1(x0 + dx); c.y = U.r1(y0 + dy); if (tx) c.tracks.x = tx.map(k => Object.assign({}, k, { v: U.r1(k.v + dx) })); if (ty) c.tracks.y = ty.map(k => Object.assign({}, k, { v: U.r1(k.v + dy) })); rests.forEach(([k, r0]) => { k.rest.tx = U.r1(r0.tx + dx); k.rest.ty = U.r1(r0.ty + dy); }); SB.bump(); },
      up() { if (this.moved) SB.commit(); }, cancel() { if (this.moved) SB.revert(); } };
  }
  /** Dragging a controller's box with other controllers selected: all their boxes move together. */
  function boxesDrag(c, P) {
    const ds = [c, ...tree.selected().filter(x => x !== c && x.type === 'null' && usable(x))].map(x => ctrlBoxDrag(x, P)); if (ds.length === 1) return ds[0];
    return { kind: 'ctrlbox', moved: false, move(P) { this.moved = true; SB.batch ? SB.batch(() => ds.forEach(d => d.move(P))) : ds.forEach(d => d.move(P)); }, up() { if (this.moved) SB.commit(); }, cancel() { if (this.moved) SB.revert(); } };
  }
  /** Pose a rig: drag a tail (IK through the chain), a bone body (turn, move or scale it, by S.boneMode), or the root (move the rig). */
  function poseDrag(rig, hit, P, e) {
    if (S.selBone !== hit.bone.id) S.selSeg = null; S.selBone = hit.bone.id; SB.invalidate('inspector', 'ctxbar');
    if (hit.part === 'head') { if (rigLocked(rig)) { lockedMsg(); return; } SB.select.startXform(rig, 'move', P); return; }
    const lt = tree.localTime(rig), cur = ids => Object.fromEntries(ids.map(id => [id, TR.value(rig, id, lt)]));
    /** A bone drag. While recording (R), the angles are sampled as the animation plays and become keyframes. */
    const drag = (kind, ids, compute) => {
      const d = { kind, o: rig, moved: false, recProps: ids, rec0: cur(ids),
        move(P, e) { this.moved = true; const v = compute(P, e); if (this.rec) return SB.record.sample(this, Object.assign({}, this.cur, v)); for (const id in v) TR.set(rig, id, v[id]); SB.fields.refresh(); },
        up() { if (this.rec) return SB.record.end(this); if (this.moved) SB.commit(); }, cancel() { if (this.moved) SB.revert(); } };
      if (S.recording) SB.record.begin(d); SB.tool.drag = d;
    };
    const b = hit.bone, mode = S.boneMode || 'turn', AF = R.AF;
    if (hit.part === 'seg' && mode !== 'turn') hit = Object.assign({}, hit, { part: 'body' });
    const q0 = R.poseAt(rig, S.time)[b.id];
    if (q0.ch && (hit.part === 'seg' || (hit.part === 'tail' && e.altKey))) { // turn one segment of a B-bone around its first joint; the rest of the bone follows
      const k = hit.part === 'seg' ? hit.seg : q0.ch.n - 1, piv = q0.chain[k], id = `bseg:${b.id}:${k}`, s0 = TR.value(rig, id, lt), l0 = R.toRig(rig, P), a0 = Math.atan2(l0.y - piv[1], l0.x - piv[0]), flip = q0.m[0] * q0.m[3] - q0.m[1] * q0.m[2] < 0 ? -1 : 1;
      S.selSeg = { bone: b.id, k }; SB.invalidate('inspector');
      return drag('seg', [id], (P, e) => { const l = R.toRig(rig, P); let d = (Math.atan2(l.y - piv[1], l.x - piv[0]) - a0) * 180 / Math.PI; while (d > 180) d -= 360; while (d < -180) d += 360; let v = s0 + d * flip; if (e.shiftKey) v = Math.round(v / 15) * 15; return { [id]: U.r1(v) }; });
    }
    if (mode === 'scale' && hit.part !== 'head') { // drag along the bone: longer or shorter (Shift: evenly, Alt: only its width)
      const q = R.poseAt(rig, S.time)[b.id], ux = Math.cos(q.a * Math.PI / 180), uy = Math.sin(q.a * Math.PI / 180), l0 = R.toRig(rig, P), along = l => (l.x - q.hx) * ux + (l.y - q.hy) * uy;
      const d0 = along(l0), base = Math.abs(d0) < 4 ? 4 * Math.sign(d0 || 1) : d0, ix = 'bonesx:' + b.id, iy = 'bonesy:' + b.id, sx0 = TR.value(rig, ix, lt), sy0 = TR.value(rig, iy, lt);
      return drag('scale', [ix, iy], (P, e) => { const f = Math.max(0.05, along(R.toRig(rig, P)) / base); if (e.altKey) return { [iy]: U.r3(sy0 * f) }; if (e.shiftKey) return { [ix]: U.r3(sx0 * f), [iy]: U.r3(sy0 * f) }; return { [ix]: U.r3(sx0 * f) }; });
    }
    if (mode === 'move' && hit.part === 'body') { // drag the bone to move it (Shift: only along one axis)
      const ps = R.poseAt(rig, S.time), par = b.parent && ps[b.parent], base = par ? par.mEnd : AF.T(b.x, b.y), bi = AF.inv([base[0], base[1], base[2], base[3], 0, 0]);
      const l0 = R.toRig(rig, P), ix = 'bonex:' + b.id, iy = 'boney:' + b.id, x0 = TR.value(rig, ix, lt), y0 = TR.value(rig, iy, lt);
      return drag('bmove', [ix, iy], (P, e) => { const l = R.toRig(rig, P); let dx = l.x - l0.x, dy = l.y - l0.y; if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; } const [mx, my] = AF.ap(bi, dx, dy); return { [ix]: U.r1(x0 + mx), [iy]: U.r1(y0 + my) }; });
    }
    if (hit.part === 'tail') { const chain = e.altKey ? [hit.bone.id] : R.ikChain(rig, hit.bone); return drag('ik', chain.map(id => 'bone:' + id), P => R.solveIK(rig, hit.bone.id, R.toRig(rig, P), chain, false)); }
    const q = R.poseAt(rig, S.time)[hit.bone.id], l = R.toRig(rig, P), a0 = Math.atan2(l.y - q.hy, l.x - q.hx), id = 'bone:' + hit.bone.id, p0 = TR.value(rig, id, lt);
    drag('fk', [id], (P, e) => { const l = R.toRig(rig, P); let d = (Math.atan2(l.y - q.hy, l.x - q.hx) - a0) * 180 / Math.PI; while (d > 180) d -= 360; while (d < -180) d += 360; let v = p0 + d; if (e.shiftKey) v = Math.round(v / 15) * 15; return { [id]: U.r1(v) }; });
  }
  const velOrigin = o => { const tr = TR.transform(o, tree.localTime(o)); return X.world(o).transformPoint(pt(tr.ax, tr.ay)); };
  // ---------- a controller's name tag: double-click it and drag to move it (k.labelOff, project px from its usual place)
  let labelBoxes = [], labelDrag = null, lastTag = { id: null, t: 0 };
  SB.select.pre.unshift((P, e) => {
    const hit = labelBoxes.slice().reverse().find(b => P.x >= b.x0 && P.x <= b.x1 && P.y >= b.y0 && P.y <= b.y1); if (!hit || S.recording) return false;
    const k = hit.k, now = performance.now(), dbl = lastTag.id === k.id && now - lastTag.t < 450; lastTag = { id: k.id, t: now };
    if (!S.multi.has(k.id)) tree.select([k.id]);
    if (!dbl) { SB.tool.drag = { kind: 'tagclick', move() {}, up() {}, cancel() {} }; return true; }
    const o0 = Object.assign({ x: 0, y: 0 }, k.labelOff); labelDrag = { k };
    SB.tool.drag = { kind: 'tag', moved: false, move(P2) { this.moved = true; k.labelOff = { x: U.r1(o0.x + P2.x - P.x), y: U.r1(o0.y + P2.y - P.y) }; SB.dirty(); },
      up() { labelDrag = null; if (this.moved) { SB.commit(); SB.toast(`${k.label}’s name moved. Double-click it again to move it more.`); } else SB.toast('Double-click the name and drag to move it.'); SB.dirty(); }, cancel() { labelDrag = null; k.labelOff = o0.x || o0.y ? o0 : undefined; SB.dirty(); } };
    SB.dirty(); return true;
  });
  /** A controller under P: pick it and drag its knob (or its box). For tools other than Select (Edit points). */
  SB.select.ctrlDown = (P, e) => { const ch = ctrlHit(P); if (!ch) return false; if (S.sel !== ch.c.id) tree.select([ch.c.id]); if (ch.part === 'knob') SB.select.startXform(ch.c, 'move', P); else if (!S.recording) SB.tool.drag = ctrlBoxDrag(ch.c, P); return true; };
  SB.select.pre.push((P, e) => {
    const sel0 = tree.sel(), onSel = sel0 && sel0.type !== 'null' && sel0.type !== 'rig' && usable(sel0) && SB.scene.inside(sel0, P, 0); // the selected layer wins over a controller sitting on it
    const ch = onSel ? null : ctrlHit(P);
    if (ch) { if (e.shiftKey) { tree.toggle(ch.c.id); return true; } if (S.multi.has(ch.c.id)) { if (S.sel !== ch.c.id) { S.sel = ch.c.id; SB.invalidate(); } } else tree.select([ch.c.id]); /* one of several selected: keep them all, so they move together */ if (ch.part === 'knob') SB.select.startXform(ch.c, 'move', P); else if (!S.recording) SB.tool.drag = boxesDrag(ch.c, P); return true; }
    const o = tree.sel();
    if (o && o.type === 'rig' && poseable(o)) { const hit = R.hit(o, P, e.pointerType === 'touch' ? 16 : 10); if (hit) { poseDrag(o, hit, P, e); return true; } }
    if (o && o.phys && PH.mode(o) !== 'static' && usable(o) && !S.recording) {
      const O = velOrigin(o), lt = tree.localTime(o), tx = O.x + TR.value(o, 'phys:vx', lt) * PH.VEL_K, ty = O.y + TR.value(o, 'phys:vy', lt) * PH.VEL_K;
      if (Math.hypot(P.x - tx, P.y - ty) * SB.view.k() < 14) { SB.tool.drag = { kind: 'vel', moved: false, move(P) { this.moved = true; TR.set(o, 'phys:vx', Math.round((P.x - O.x) / PH.VEL_K)); TR.set(o, 'phys:vy', Math.round((P.y - O.y) / PH.VEL_K)); SB.fields.refresh(); }, up() { if (this.moved) SB.commit(); }, cancel() { if (this.moved) SB.revert(); } }; return true; }
    }
    for (const r of R.rigs().slice().reverse()) { // click a visible bone to select its rig and pose it
      if (r === o || !poseable(r) || !r.showBones) continue; const hit = R.hit(r, P); if (hit) { tree.select([r.id]); poseDrag(r, hit, P, e); return true; }
    }
    return false;
  });

  // ================= tools
  const customMove = (P, e) => { const d = SB.tool.drag; if (d && d.move) d.move(P, e); };
  const customUp = (P, e) => { const d = SB.tool.drag; if (d && d.up) d.up(P, e); };
  /** Where the next bone starts, on the stage. */
  function draftFrom(r) {
    const f = S.boneDraft.from, ps = R.poseAt(r, S.time), p = f.type === 'pt' ? { x: f.x, y: f.y } : f.type === 'tail' ? { x: ps[f.bone].tx, y: ps[f.bone].ty } : { x: ps[f.bone].hx, y: ps[f.bone].hy };
    const w = X.world(r).transformPoint(pt(p.x, p.y)); return { x: w.x, y: w.y };
  }
  function finishBones() { if (S.boneDraft) { S.boneDraft = null; SB.commit(); } SB.invalidate('ctxbar'); SB.dirty(); }
  SB.tools.add({
    id: 'bone', label: 'Bones', icon: 'bone', tip: 'Draw bones for a rig, then pose them', cursor: 'crosshair',
    down(P, e) {
      let rig = tree.sel(); if (!rig || rig.type !== 'rig') rig = null;
      if (rig && rigLocked(rig)) return lockedMsg();
      if (S.boneDraft) { const r = tree.find(S.boneDraft.rig); if (!r) { S.boneDraft = null; return; } P = SB.tool.straight(draftFrom(r), P, e); const b = R.addBone(r, S.boneDraft.from, R.toRig(r, P)); if (b) { S.boneDraft.from = { type: 'tail', bone: b.id }; S.selBone = b.id; SB.commit(); } return; }
      const j = rig && R.hit(rig, P);
      if (j && (j.part === 'head' || j.part === 'tail')) { // drag a joint to change the rest pose; click it to grow a new bone from it
        const snap = R.editSnap(rig); // what is attached stays where it is while the bones change
        SB.tool.drag = { kind: 'joint', moved: false,
          move(P, e) { this.moved = true; const b = j.bone, ps = R.poseAt(rig, S.time), q = ps[b.id]; if (j.part === 'tail') P = SB.tool.straight(X.world(rig).transformPoint(pt(q.hx, q.hy)), P, e); const l = R.toRig(rig, P);
            if (j.part === 'head' && b.parent && ps[b.parent]) { const E = ps[b.parent].mEnd, det = E[0] * E[3] - E[1] * E[2] || 1e-9, dx = l.x - E[4], dy = l.y - E[5]; b.ox = U.r1((E[3] * dx - E[2] * dy) / det - TR.now(rig, 'bonex:' + b.id)); b.oy = U.r1((-E[1] * dx + E[0] * dy) / det - TR.now(rig, 'boney:' + b.id)); } // a free bone's head
            else if (j.part === 'head') { b.x = U.r1(l.x); b.y = U.r1(l.y); } else { const par = b.parent && ps[b.parent]; b.len = U.r1(Math.max(4, Math.hypot(l.x - q.hx, l.y - q.hy) / (Math.hypot(q.m[0], q.m[1]) || 1))); b.ang = U.r1(Math.atan2(l.y - q.hy, l.x - q.hx) * 180 / Math.PI - (par ? par.a : 0) - TR.now(rig, 'bone:' + b.id)); } R.keepAttached(snap); },
          up() { if (this.moved) return SB.commit(); S.boneDraft = { rig: rig.id, from: j.part === 'tail' ? { type: 'tail', bone: j.bone.id } : { type: 'head', bone: j.bone.id } }; S.selBone = j.bone.id; SB.invalidate('ctxbar', 'inspector'); } };
        return;
      }
      if (j && (j.part === 'body' || j.part === 'seg')) { boneBodyDrag(rig, j.bone, P, e); return; } // grab a bone itself: move it, or turn it near its tip
      if (!rig) { rig = R.make(P); tree.rootList().unshift(rig); tree.reindex(); tree.select([rig.id]); }
      const l = R.toRig(rig, P); S.boneDraft = { rig: rig.id, from: { type: 'pt', x: U.r1(l.x), y: U.r1(l.y) } }; SB.invalidate('ctxbar');
    },
    move: customMove, up: customUp, cancel() { const d = SB.tool.drag; if (d && d.moved) SB.revert(); },
    hover(P) { // the pointer shows what a drag does: grow from a joint, move a bone, turn it by its tip end
      const rig = tree.sel(), w = U.$('#stage'); if (S.boneDraft || !rig || rig.type !== 'rig' || rigLocked(rig)) { w.style.cursor = 'crosshair'; return; }
      const j = R.hit(rig, P); w.style.cursor = !j ? 'crosshair' : j.part === 'head' || j.part === 'tail' ? 'pointer' : bodyMode(rig, j.bone, P) === 'turn' ? ROT_CURSOR : 'move';
    },
    dbl: finishBones, leave() { if (S.boneDraft) finishBones(); },
    overlay(O) {
      if (!S.boneDraft || !S.hover) return; const r = tree.find(S.boneDraft.rig); if (!r) return; const p = draftFrom(r), hv = SB.tool.straight(p, S.hover);
      const c = O.c, [ax, ay] = O.P(p.x, p.y), [bx, by] = O.P(hv.x, hv.y); c.save(); c.setLineDash([6 * O.dpr, 5 * O.dpr]); c.strokeStyle = RIG; c.lineWidth = 2 * O.dpr; c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, by); c.stroke(); c.restore();
    },
    bar() { const r = tree.sel(); return [r && r.type === 'rig' ? rigSteps(r, 'bones') : null, h('span.lbl', null, S.boneDraft ? 'Click to add joints (Shift: level or upright). Double-click or Enter finishes the chain.' : 'Click to start a chain of bones. Click a joint to branch from it, drag a joint to adjust it. Drag a bone to move it, or near its tip to turn it (Shift: 15° steps).'), S.boneDraft ? W.btn('Finish chain', finishBones, { cls: 'sm' }) : null, W.btn('Done', () => { finishBones(); SB.tool.set('select'); }, { cls: 'sm ghost' })]; },
  });
  addEventListener('keydown', e => { if (e.key === 'Enter' && S.boneDraft && !(e.target.closest && e.target.closest('input,textarea'))) { e.preventDefault(); finishBones(); } });

  SB.tools.add({
    id: 'weights', label: 'Weights', icon: 'weights', hidden: true, tip: 'Paint which parts follow the selected bone', cursor: 'crosshair',
    down(P) {
      const r = tree.sel(); if (!r || r.type !== 'rig') return SB.toast('Select the rig first.');
      if (S.wpaint.mode === 'goal') { // goal curve: draw how the edge should run in this pose (Straight: a line; Shift: level or upright)
        const A = { x: P.x, y: P.y }, pts = [P.x, P.y], sm = { x: P.x, y: P.y }, gsm = S.wpaint.gsm ?? 0.4, stab = S.wpaint.gstab ? 30 / SB.view.k() : 0;
        SB.tool.drag = { kind: 'wgoal', pts, straight: S.wpaint.gline === 'line',
          move(Q, e) {
            if (this.straight || (e && e.shiftKey)) { const B = e && e.shiftKey ? SB.tool.straight(A, Q, e) : Q; pts.length = 0; pts.push(A.x, A.y, B.x, B.y); this.line = true; SB.dirty(); return; }
            if (this.line) { this.line = false; pts.length = 2; sm.x = A.x; sm.y = A.y; } // let go of Shift: carry on freehand
            if (stab) { const dx = Q.x - sm.x, dy = Q.y - sm.y, d = Math.hypot(dx, dy); if (d <= stab) return; sm.x += dx / d * (d - stab); sm.y += dy / d * (d - stab); } // stabilizer: a rope behind the pointer
            else { const k = 1 - gsm * 0.88; sm.x += (Q.x - sm.x) * k; sm.y += (Q.y - sm.y) * k; } // smoothing: the line trails the pointer a little
            const l = pts.length; if (Math.hypot(sm.x - pts[l - 2], sm.y - pts[l - 1]) * SB.view.k() >= 3) { pts.push(sm.x, sm.y); SB.dirty(); } },
          up() { const line = this.line || this.straight; if (line ? pts.length < 4 || Math.hypot(pts[2] - pts[0], pts[3] - pts[1]) * SB.view.k() < 8 : pts.length < 6) return SB.toast('Drag along where the edge should be.');
            const curve = line ? G.densify(pts.slice(0, 4), 2 / SB.view.k()) : G.flatten(G.fitFreehand(pts, (2 + gsm * 8) / SB.view.k(), false), 0.5 / SB.view.k());
            const n = R.goalCurve(r, curve, { reach: S.wpaint.r / SB.view.k(), k: U.clamp(S.wpaint.k * 2, 0.1, 1), smooth: S.wpaint.gres ?? 0.3 });
            if (n === -1) return SB.toast('Pose the rig first: move it to the pose that looks wrong, then draw how it should look.');
            if (!n) return SB.toast('No edge near that line. Draw closer to the part that looks wrong (or raise Reach).');
            SB.commit(); SB.invalidate('ctxbar'); SB.toast(`Weights fixed for ${n} points near your line. The rest pose stays the same; check other poses too.`); }, cancel() { SB.dirty(); } };
        return;
      }
      if (!S.selBone) return SB.toast('Pick a bone in the panel first.');
      if (S.wpaint.mode === 'lasso') { // a loop: the bone takes (or loses) the area inside it
        const pts = [P.x, P.y]; SB.tool.drag = { kind: 'wlasso', pts, move(Q) { const l = pts.length; if (Math.hypot(Q.x - pts[l - 2], Q.y - pts[l - 1]) * SB.view.k() >= 3) { pts.push(Q.x, Q.y); SB.dirty(); } },
          up(Q, e) { if (pts.length < 8) return SB.toast('Draw a loop around the area.'); const k = SB.view.k(); let a = 0; for (let i = 0, n = pts.length / 2, j = n - 1; i < n; j = i++) a += (pts[j * 2] - pts[i * 2]) * (pts[j * 2 + 1] + pts[i * 2 + 1]); if (Math.abs(a / 2) * k * k < 200) return SB.toast('Draw a bigger loop around the area.');
            const mode = e && e.altKey ? (S.wpaint.lasso === 'sub' ? 'add' : 'sub') : S.wpaint.lasso || 'add', b = R.boneById(r, S.selBone);
            R.lasso(r, S.selBone, pts, mode, S.wpaint.soft ?? 6, U.clamp(S.wpaint.k * 2, 0.05, 1)); SB.commit();
            SB.toast(mode === 'only' ? `${b.name} now moves only the area inside the loop.` : mode === 'sub' ? `${b.name} no longer moves the area inside the loop.` : `${b.name} now fully moves the area inside the loop.`); }, cancel() { SB.dirty(); } };
        return;
      }
      if (S.wpaint.mode === 'gradient') { // a line: full weight where it starts, none where it ends
        SB.tool.drag = { kind: 'wgrad', A: P, B: P, move(Q) { this.B = Q; SB.dirty(); }, up() { if (Math.hypot(this.B.x - this.A.x, this.B.y - this.A.y) * SB.view.k() < 6) return SB.toast('Drag a line: from where the bone should move the layer fully to where it should not.');
          R.gradient(r, S.selBone, this.A, this.B, (S.wpaint.add ? 1 : -1) * U.clamp(S.wpaint.k * 2, 0.1, 1)); /* strength 50% and up: fully 100% (or 0%) at the start */ SB.commit(); }, cancel() { SB.revert(); } };
        return;
      }
      let last = null; const smooth = S.wpaint.mode === 'smooth', blur = smooth && (S.wpaint.smode || 'blur') === 'blur';
      const dab = P => { const Rd = S.wpaint.r / SB.view.k(); if (last && Math.hypot(P.x - last.x, P.y - last.y) < Rd * (blur ? 0.35 : 0.25)) return; last = P;
        if (blur) R.blurW(r, P, Rd, S.wpaint.k); else if (smooth) R.smoothW(r, P, Rd, S.wpaint.k * 0.5); else R.paint(r, S.selBone, P, Rd, (S.wpaint.add ? 1 : -1) * S.wpaint.k * 0.4); };
      SB.tool.drag = { kind: 'wpaint', move: dab, up() { SB.commit(); }, cancel() { SB.revert(); } }; dab(P);
    },
    move: customMove, up: customUp, cancel() { SB.revert(); },
    overlay(O) { weightOverlay(O); const d = SB.tool.drag;
      if (d && d.kind === 'wgoal') { const c = O.c; c.save(); c.strokeStyle = '#18A999'; c.lineWidth = 3 * O.dpr; c.lineCap = c.lineJoin = 'round'; c.setLineDash([8 * O.dpr, 5 * O.dpr]); c.beginPath(); for (let i = 0; i < d.pts.length; i += 2) { const [x, y] = O.P(d.pts[i], d.pts[i + 1]); i ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke(); c.restore(); return; }
      if (d && d.kind === 'wlasso') { const c = O.c, col = S.wpaint.lasso === 'sub' ? '#2F7FF0' : '#E5484D'; c.save(); c.strokeStyle = col; c.fillStyle = col + '22'; c.lineWidth = 2 * O.dpr; c.setLineDash([6 * O.dpr, 4 * O.dpr]); c.beginPath(); for (let i = 0; i < d.pts.length; i += 2) { const [x, y] = O.P(d.pts[i], d.pts[i + 1]); i ? c.lineTo(x, y) : c.moveTo(x, y); } c.closePath(); c.fill(); c.stroke(); c.restore(); return; }
      if (d && d.kind === 'wgrad') { const c = O.c, [ax, ay] = O.P(d.A.x, d.A.y), [bx, by] = O.P(d.B.x, d.B.y), g = c.createLinearGradient(ax, ay, bx, by); g.addColorStop(0, '#E5484D'); g.addColorStop(1, '#2F7FF0');
        c.save(); c.strokeStyle = g; c.lineWidth = 4 * O.dpr; c.lineCap = 'round'; c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, by); c.stroke(); [[ax, ay, '#E5484D'], [bx, by, '#2F7FF0']].forEach(([x, y, col]) => { c.beginPath(); c.arc(x, y, 7 * O.dpr, 0, Math.PI * 2); c.fillStyle = col; c.fill(); c.lineWidth = 2 * O.dpr; c.strokeStyle = '#fff'; c.stroke(); }); c.restore(); return; }
      if (!S.hover) return; const c = O.c, [x, y] = O.P(S.hover.x, S.hover.y), rig = tree.sel(); c.save();
      if (S.wpaint.mode === 'goal') { c.strokeStyle = '#18A999'; c.lineWidth = 1.5 * O.dpr; c.setLineDash([4 * O.dpr, 4 * O.dpr]); c.beginPath(); c.arc(x, y, S.wpaint.r * O.dpr, 0, Math.PI * 2); c.stroke(); c.setLineDash([]); } // how far the fix reaches
      else if (S.wpaint.mode !== 'gradient' && S.wpaint.mode !== 'lasso') { // the brush: its size, and its strength as the inner ring
        c.strokeStyle = S.wpaint.mode === 'smooth' ? '#8752F0' : S.wpaint.add ? '#E5484D' : '#2F7FF0'; c.lineWidth = 2 * O.dpr; c.beginPath(); c.arc(x, y, S.wpaint.r * O.dpr, 0, Math.PI * 2); c.stroke();
        c.setLineDash([3 * O.dpr, 3 * O.dpr]); c.beginPath(); c.arc(x, y, S.wpaint.r * O.dpr * Math.max(0.1, S.wpaint.k), 0, Math.PI * 2); c.stroke(); c.setLineDash([]);
      }
      const w = rig && rig.type === 'rig' && S.selBone ? weightAt(rig, S.hover) : null;
      if (w != null) { const t = `${Math.round(w * 100)}%`; c.font = `${600} ${12 * O.dpr}px system-ui, sans-serif`; const tw = c.measureText(t).width; c.fillStyle = 'rgba(20,18,40,.85)'; c.fillRect(x + 12 * O.dpr, y + 12 * O.dpr, tw + 10 * O.dpr, 18 * O.dpr); c.fillStyle = '#fff'; c.fillText(t, x + 17 * O.dpr, y + 25 * O.dpr); }
      c.restore(); },
    bar() {
      const r = tree.sel(), b = r && r.type === 'rig' && R.boneById(r, S.selBone), mode = S.wpaint.mode || 'brush', grad = mode === 'gradient', smooth = mode === 'smooth', goal = mode === 'goal', lasso = mode === 'lasso';
      return [rigSteps(r, 'weights'), h('span.lbl', null, h('b', null, b ? b.name : 'Pick a bone')),
        wModeBtn(mode), h('span.vsep'),
        lasso ? W.seg(S.wpaint.lasso || 'add', [['add', 'Add', 'Inside the loop the bone moves everything fully (100%)'], ['sub', 'Remove', 'Inside the loop the bone moves nothing (0%)'], ['only', 'Only here', 'The bone moves the area inside the loop and nothing outside it']], v => { S.wpaint.lasso = v; SB.invalidate('ctxbar'); }) : null,
        lasso ? W.popSlider('Soft edge', S.wpaint.soft ?? 6, { min: 0, max: 80, unit: 'px', title: 'How wide the weight eases across the loop’s edge', input: v => S.wpaint.soft = v }) : null,
        smooth || goal || lasso ? null : W.seg(S.wpaint.add ? 'add' : 'sub', [['add', 'Add'], ['sub', 'Remove']], v => { S.wpaint.add = v === 'add'; SB.invalidate('ctxbar'); }),
        smooth ? W.seg(S.wpaint.smode || 'blur', [['blur', 'Even out', 'Smooths both ways: strong spots (100%) come down, weak spots come up. Works on painted, lasso and goal-curve weights'], ['soft', 'Undo paint', 'Painted weight eases back to the automatic falloff']], v => { S.wpaint.smode = v; SB.invalidate('ctxbar'); }) : null,
        goal ? W.seg(S.wpaint.gline === 'line' ? 'line' : 'free', [['free', 'Freehand', 'Draw the edge freehand (Shift: a straight line, level or upright)'], ['line', 'Straight', 'A straight edge: drag from one end to the other (Shift: level or upright)']], v => { S.wpaint.gline = v; SB.invalidate('ctxbar'); }) : null,
        goal && S.wpaint.gline !== 'line' ? W.popSlider('Smoothing', Math.round((S.wpaint.gsm ?? 0.4) * 100), { min: 0, max: 100, unit: '%', title: 'How much your line is smoothed while you draw it', input: v => S.wpaint.gsm = v / 100 }) : null,
        goal && S.wpaint.gline !== 'line' ? W.check(!!S.wpaint.gstab, 'Stabilize', v => { S.wpaint.gstab = v; SB.invalidate('ctxbar'); }) : null,
        goal ? W.popSlider('Smooth result', Math.round((S.wpaint.gres ?? 0.3) * 100), { min: 0, max: 100, unit: '%', title: 'Higher: the fixed edge comes out rounder and cleaner (it follows your line a little less exactly)', input: v => S.wpaint.gres = v / 100 }) : null,
        (goal || (smooth && (S.wpaint.smode || 'blur') === 'blur')) && R.hasGoals(r) ? W.btn('Clear fixes', () => { R.clearGoals(r); SB.commit(); SB.invalidate('ctxbar'); SB.toast('Fixes removed (goal curves and Even out).'); }, { cls: 'sm ghost', icon: 'trash', title: 'Remove every goal-curve fix of this rig' }) : null,
        grad || lasso ? null : W.popSlider(goal ? 'Reach' : 'Size', S.wpaint.r, { min: 10, max: 200, input: v => { S.wpaint.r = v; SB.dirty(); } }), W.popSlider('Strength', Math.round(S.wpaint.k * 100), { min: 5, max: 100, unit: '%', input: v => S.wpaint.k = v / 100 }), h('span.vsep'),
        ib('fit', 'Normalize: make the strongest painted spot of this bone fully follow it (100%)', () => { if (!b) return; const f = R.normalizeW(r, b.id); SB.commit(); SB.toast(f === 0 ? `Nothing painted for ${b.name} yet.` : f === 1 ? `${b.name} already reaches 100% where painted.` : `${b.name} now reaches 100% where painted (paint ×${f}).`); }, false, 'Normalize'),
        ib('check', 'Clean up weights: find messy weights on the bending layers and tidy them, keeping the poses', () => SB.weightFix.open(r), false, 'Clean up'),
        ib('trash', 'Clear the weights painted for this bone (right-click: every bone)', () => { if (!b) return; R.clearW(r, b.id); SB.commit(); SB.toast(`Painted weights of ${b.name} cleared.`); }, false, 'Clear'),
        W.btn('Done', () => SB.tool.set('select'), { cls: 'sm ghost' })];
    },
  });
  addEventListener('keydown', e => {
    if (S.tool !== 'weights' || e.ctrlKey || e.metaKey || (e.target.closest && e.target.closest('input,textarea'))) return;
    if (e.key !== '[' && e.key !== ']' && e.key !== '{' && e.key !== '}') return; e.preventDefault(); const up = e.key === ']' || e.key === '}';
    if (e.shiftKey) S.wpaint.k = U.clamp(Math.round((S.wpaint.k + (up ? 0.1 : -0.1)) * 100) / 100, 0.05, 1); else S.wpaint.r = U.clamp(Math.round(S.wpaint.r * (up ? 1.2 : 1 / 1.2)), 10, 200);
    SB.invalidate('ctxbar'); SB.dirty();
  });
  /** The selected bone's weight under the pointer (on the bending layer there), or null. */
  function weightAt(rig, P) {
    for (const o of tree.all()) { if (!R.bendsWith(o, rig) || tree.hidden(o) || !tree.inRange(o) || !SB.scene.inside(o, P, 0)) continue;
      const B = o.bind, ids = R.bindBoneIds(B), bi = ids.indexOf(S.selBone); if (bi < 0) continue; return R.weights(B, ids, ids.map(id => B.seg[id]), P.x, P.y, Math.pow(B.soft || 60, 2))[bi]; }
    return null;
  }
  /** Weight heat map of the selected bone on every layer that bends with the rig. */
  function weightOverlay(O) {
    const rig = tree.sel(); if (!rig || rig.type !== 'rig' || !S.selBone || S.playing) return; const c = O.c, Wd = c.canvas.width, Ht = c.canvas.height;
    for (const o of tree.all()) {
      if (!R.bendsWith(o, rig) || tree.hidden(o) || !tree.inRange(o)) continue;
      const B = o.bind, ids = R.bindBoneIds(B), bi = ids.indexOf(S.selBone); if (bi < 0) continue; const b = SB.scene.bounds(o); if (!b) continue;
      const M = X.world(o), Md = O.M(M), def = SB.scene.deformer(o, S.time, Md, O.M()), segs = ids.map(id => B.seg[id]), s2 = Math.pow(B.soft || 60, 2), N = 30;
      const A = U.poolCtx(Wd, Ht, ':wh'), Bm = U.poolCtx(Wd, Ht, ':ws'); A.setTransform(1, 0, 0, 1, 0, 0); A.clearRect(0, 0, Wd, Ht); Bm.setTransform(1, 0, 0, 1, 0, 0); Bm.clearRect(0, 0, Wd, Ht);
      const cw = (b.x1 - b.x0) / N, chh = (b.y1 - b.y0) / N, rr = Math.max(cw, chh) * U.matScale(Md) * 0.75;
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const x = b.x0 + (i + 0.5) * cw, y = b.y0 + (j + 0.5) * chh, p = M.transformPoint(pt(x, y)), w = R.weights(B, ids, segs, p.x, p.y, s2)[bi];
        const q0 = def ? def(x, y) : [x, y], q = Md.transformPoint(pt(q0[0], q0[1])); A.fillStyle = `hsl(${Math.round((1 - w) * 230)},90%,52%)`; A.fillRect(q.x - rr, q.y - rr, rr * 2, rr * 2);
      }
      SB.scene.renderList(Bm, [o], tree.parentTime(o, S.time), O.M(X.parentWorld(o)), { T: S.time, root: O.M() }, O.sc, 0);
      A.globalCompositeOperation = 'destination-in'; A.drawImage(Bm.canvas, 0, 0); A.globalCompositeOperation = 'source-over';
      c.save(); c.globalAlpha = 0.7; c.drawImage(A.canvas, 0, 0); c.restore();
    }
  }

  SB.tools.add({
    id: 'collider', label: 'Collision shape', icon: 'collider', hidden: true, tip: 'Edit the shape physics uses', cursor: 'crosshair',
    down(P, e) {
      const o = tree.sel(); if (!o || !o.phys) return; const M = X.world(o), Minv = M.inverse(), hl = PH.hull(o, tree.localTime(o)), Wp = PH.worldPoly(M, hl), k = SB.view.k();
      for (let i = 0; i < Wp.length; i += 2) if (Math.hypot(Wp[i] - P.x, Wp[i + 1] - P.y) * k < 10) {
        o.phys.hull = hl.slice(); o.phys.colShape = 'custom';
        if (e.altKey) { if (o.phys.hull.length > 6) o.phys.hull.splice(i, 2); SB.commit(); return; }
        SB.tool.drag = { kind: 'hullpt', moved: false, move(P) { const l = Minv.transformPoint(pt(P.x, P.y)); o.phys.hull[i] = U.r1(l.x); o.phys.hull[i + 1] = U.r1(l.y); this.moved = true; SB.bump(); }, up() { SB.commit(); }, cancel() { SB.revert(); } }; return;
      }
    },
    move: customMove, up: customUp, cancel() { SB.revert(); },
    dbl(P) {
      const o = tree.sel(); if (!o || !o.phys) return; const l = X.world(o).inverse().transformPoint(pt(P.x, P.y)), hl = PH.hull(o, tree.localTime(o)).slice(), n = hl.length / 2; let bi = -1, bd = Infinity;
      for (let i = 0; i < n; i++) { const j = (i + 1) % n, d = R.distSeg2(l.x, l.y, [hl[i * 2], hl[i * 2 + 1], hl[j * 2], hl[j * 2 + 1]]); if (d < bd) { bd = d; bi = i; } }
      if (bi >= 0) { hl.splice((bi + 1) * 2, 0, U.r1(l.x), U.r1(l.y)); o.phys.hull = hl; o.phys.colShape = 'custom'; SB.commit(); }
    },
    overlay(O) {
      const o = tree.sel(); if (!o || !o.phys || !tree.inRange(o)) return; const Pp = PH.worldPoly(X.world(o), PH.hull(o, tree.localTime(o)) || []), c = O.c, d = O.dpr;
      c.save(); c.fillStyle = 'rgba(232,115,12,.12)'; c.strokeStyle = ORANGE; c.lineWidth = 2 * d; c.beginPath(); for (let i = 0; i < Pp.length; i += 2) { const [x, y] = O.P(Pp[i], Pp[i + 1]); i ? c.lineTo(x, y) : c.moveTo(x, y); } c.closePath(); c.fill(); c.stroke();
      for (let i = 0; i < Pp.length; i += 2) { const [x, y] = O.P(Pp[i], Pp[i + 1]); c.beginPath(); c.rect(x - 4 * d, y - 4 * d, 8 * d, 8 * d); c.fillStyle = '#fff'; c.fill(); c.stroke(); } c.restore();
    },
    bar() {
      const o = tree.sel(), ph = o && o.phys, m = ph ? ph.colShape || 'auto' : 'auto', n = o && ph ? PH.hull(o, tree.localTime(o)).length / 2 : 0;
      return [h('span.lbl', null, h('b', null, 'Collision shape')), W.seg(m, [['auto', 'Outline'], ['box', 'Box'], ['circle', 'Circle'], ['custom', 'Custom']], v => { if (ph) { ph.colShape = v; if (v === 'custom' && !ph.hull) ph.hull = PH.hull(o, tree.localTime(o)).slice(); SB.commit(); } }),
        m === 'auto' && ph ? W.popSlider('Detail', ph.detail || 16, { min: 4, max: 48, input: v => { ph.detail = v; SB.bump(); }, change: () => SB.commit() }) : null,
        h('span.lbl', null, `${n} points. Drag to edit, Alt-click removes, double-click adds.`), W.btn('Done', () => SB.tool.set('select'), { cls: 'sm ghost' })];
    },
  });

  // ---------- dragging a bone itself (Bones tool): the part near its start moves it, the part near its tip turns it
  const ROT_CURSOR = `url("data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><g fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12a7 7 0 1 1-2.1-5" stroke="#fff" stroke-width="4.5"/><path d="M17 3v4h-4" stroke="#fff" stroke-width="4.5"/><path d="M19 12a7 7 0 1 1-2.1-5" stroke="#1d1b2e" stroke-width="1.8"/><path d="M17 3v4h-4" stroke="#1d1b2e" stroke-width="1.8"/></g></svg>')}") 12 12, grab`;
  /** 'move' or 'turn' for a grab at P on bone b. */
  function bodyMode(rig, b, P) { const s = R.segsWorld(rig).find(x => x.b === b); if (!s) return 'move'; const dx = s.t.x - s.h.x, dy = s.t.y - s.h.y, L2 = dx * dx + dy * dy || 1, u = ((P.x - s.h.x) * dx + (P.y - s.h.y) * dy) / L2; return u > 0.6 ? 'turn' : 'move'; }
  function boneBodyDrag(rig, b, P0, e) {
    const mode = e && e.altKey ? 'turn' : bodyMode(rig, b, P0), snap = R.editSnap(rig), ps0 = R.poseAt(rig, S.time), q0 = ps0[b.id], l0 = R.toRig(rig, P0);
    const b0 = { x: b.x, y: b.y, ox: b.ox, oy: b.oy, ang: b.ang, parent: b.parent }, par0 = b.parent && ps0[b.parent];
    S.selBone = b.id; S.boneDraft = null; SB.invalidate('ctxbar', 'inspector');
    SB.tool.drag = { kind: 'bonebody', moved: false,
      move(P, ev) {
        this.moved = true; if (mode === 'move') P = SB.tool.straight(P0, P, ev); const l = R.toRig(rig, P), dx = l.x - l0.x, dy = l.y - l0.y;
        if (mode === 'move') {
          if (!b0.parent) { b.x = U.r1(b0.x + dx); b.y = U.r1(b0.y + dy); }
          else if (par0) { const E = par0.mEnd, det = E[0] * E[3] - E[1] * E[2] || 1e-9, hx = q0.hx + dx - E[4], hy = q0.hy + dy - E[5]; // its start leaves the parent's tip: a free bone, still following it
            b.ox = U.r1((E[3] * hx - E[2] * hy) / det - TR.now(rig, 'bonex:' + b.id)); b.oy = U.r1((-E[1] * hx + E[0] * hy) / det - TR.now(rig, 'boney:' + b.id)); if (Math.hypot(b.ox, b.oy) < 0.05) { delete b.ox; delete b.oy; } }
        } else { let a = (Math.atan2(l.y - q0.hy, l.x - q0.hx) - Math.atan2(l0.y - q0.hy, l0.x - q0.hx)) * 180 / Math.PI; if (ev && ev.shiftKey) a = Math.round(a / 15) * 15; b.ang = U.r1(b0.ang + a); }
        R.keepAttached(snap);
      },
      up() { if (this.moved) SB.commit(); else SB.dirty(); },
      cancel() { if (this.moved) SB.revert(); } };
  }
  /** The weight tools, as one button with a menu: Brush, Smooth, Gradient, Goal curve. */
  const WMODES = [['brush', 'Brush', 'brush', 'Paint weight with a brush ([ and ] change its size, Shift with them its strength)'], ['smooth', 'Smooth', 'smooth', 'Even out the weights: strong spots come down, weak spots come up (or undo painted weight)'],
    ['gradient', 'Gradient', 'curve', 'Drag a line: full weight where you start, none where you end'], ['lasso', 'Lasso', 'lasso', 'Draw a loop: the bone takes the area inside it, lets it go, or moves only that area (Alt: the opposite)'], ['goal', 'Goal curve', 'goal', 'Pose the rig, then draw how the bent edge should look: the weights change to match it (the rest pose stays the same)']];
  function wModeBtn(mode) {
    const m = WMODES.find(x => x[0] === mode) || WMODES[0];
    return W.btn(m[1] + ' ▾', e => { const rc = e.currentTarget.getBoundingClientRect(); SB.menu.open(rc.left, rc.bottom + 4, WMODES.map(([k, label, icon, tip]) => ({ label, icon, title: tip, run: () => { S.wpaint.mode = k; SB.tool.set('weights'); SB.invalidate('ctxbar', 'inspector'); SB.dirty(); } }))); },
      { cls: 'sm dd', icon: m[2], title: m[3] + ' (click to pick another weight tool)' });
  }
  /** Is bone x under bone b (its child, grandchild…)? */
  const isUnder = (rig, x, b) => { for (let y = x; y && y.parent; y = R.boneById(rig, y.parent)) if (y.parent === b.id) return true; return false; };
  // ================= overlays
  function drawRig(O, rig) {
    const segs = R.segsWorld(rig), sel = rig.id === S.sel, c = O.c, d = O.dpr; c.save();
    for (const s of segs) {
      const [hx, hy] = O.P(s.h.x, s.h.y), [tx, ty] = O.P(s.t.x, s.t.y), L = Math.hypot(tx - hx, ty - hy) || 1, nx = -(ty - hy) / L, ny = (tx - hx) / L, w = Math.min(L * 0.16, 11 * d);
      const mx = hx + (tx - hx) * 0.22, my = hy + (ty - hy) * 0.22, on = sel && s.b.id === S.selBone, dyn = s.b.dyn && s.b.dyn.on;
      if (s.curve) { // a B-bone: one slim bone per segment, with a dot at every joint you can drag to turn that segment
        const pts = s.curve.map(p => O.P(p.x, p.y)), ss = S.selSeg && S.selSeg.bone === s.b.id ? S.selSeg.k : -1;
        for (let k = 0; k < pts.length - 1; k++) {
          const [ax, ay] = pts[k], [bx, by] = pts[k + 1], l = Math.hypot(bx - ax, by - ay) || 1, ex = -(by - ay) / l, ey = (bx - ax) / l, ww = Math.min(l * 0.22, 7 * d), cx2 = ax + (bx - ax) * 0.3, cy2 = ay + (by - ay) * 0.3, hot = on && k === ss;
          c.beginPath(); c.moveTo(ax, ay); c.lineTo(cx2 + ex * ww, cy2 + ey * ww); c.lineTo(bx, by); c.lineTo(cx2 - ex * ww, cy2 - ey * ww); c.closePath();
          c.fillStyle = hot ? 'rgba(255,79,139,.75)' : on ? 'rgba(255,79,139,.4)' : dyn ? 'rgba(24,169,153,.42)' : 'rgba(194,54,154,.3)'; c.fill(); c.strokeStyle = on ? HOT : dyn ? TEAL : RIG; c.lineWidth = 1.2 * d; c.stroke();
        }
        if (sel) for (let k = 1; k < pts.length - 1; k++) { c.beginPath(); c.arc(pts[k][0], pts[k][1], (on ? 4 : 3) * d, 0, Math.PI * 2); c.fillStyle = on && k - 1 === ss ? HOT : '#fff'; c.fill(); c.strokeStyle = on ? HOT : RIG; c.lineWidth = 1.4 * d; c.stroke(); }
        continue;
      }
      c.beginPath(); c.moveTo(hx, hy); c.lineTo(mx + nx * w, my + ny * w); c.lineTo(tx, ty); c.lineTo(mx - nx * w, my - ny * w); c.closePath();
      c.fillStyle = on ? 'rgba(255,79,139,.55)' : dyn ? 'rgba(24,169,153,.42)' : 'rgba(194,54,154,.32)'; c.fill(); c.strokeStyle = on ? HOT : dyn ? TEAL : RIG; c.lineWidth = 1.5 * d; c.stroke();
    }
    const big = matchMedia('(pointer:coarse)').matches ? 1.4 : 1;
    for (const s of segs) if (s.float && s.par) { const [ax, ay] = O.P(s.par.x, s.par.y), [bx, by] = O.P(s.h.x, s.h.y); c.save(); c.setLineDash([4 * d, 4 * d]); c.strokeStyle = RIG; c.globalAlpha = 0.7; c.lineWidth = 1.2 * d; c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, by); c.stroke(); c.restore(); } // a free bone: a dashed line to the bone it follows
    for (const s of segs) for (const [p, root] of s.root || s.float ? [[s.h, true], [s.t, false]] : [[s.t, false]]) {
      const [x, y] = O.P(p.x, p.y); c.beginPath(); c.arc(x, y, (root ? 6 : 4.5) * d * big, 0, Math.PI * 2); c.fillStyle = '#fff'; c.fill(); c.strokeStyle = s.b.pin && !root ? '#24213F' : RIG; c.lineWidth = (s.b.pin && !root ? 2.5 : 1.8) * d; c.stroke();
    }
    c.restore();
  }
  SB.overlays.extra.push(O => {
    const c = O.c, d = O.dpr, o = tree.sel(); labelBoxes = [];
    // controllers: the knob and the box (or line) it moves in
    for (const k of tree.all()) {
      if (k.type !== 'null' || tree.hidden(k) || !tree.inRange(k) || (S.playing && k.id !== S.sel)) continue;
      const tr = TR.transform(k, tree.localTime(k)), q = X.world(k).transformPoint(pt(tr.ax, tr.ay)), [x, y] = O.P(q.x, q.y), Rr = 12 * d, on = S.multi.has(k.id), t = C.motion(k), col = k.color || ORANGE, colA = a => U.hexRgba ? U.hexRgba(col, a) : col;
      c.save(); if (TR.now(k, 'ctrl:on') === false) c.globalAlpha *= 0.35; // turned off: faded
      if (t !== 'free') {
        const PW = X.parentWorld(k), rgx = C.RX(k), rgy = C.RY(k), rx = k.rx ?? k.x, ry = k.ry ?? k.y, P2 = (a, b) => { const w = PW.transformPoint(pt(a, b)); return O.P(w.x, w.y); };
        c.strokeStyle = colA(0.6); c.lineWidth = (on ? 2 : 1.2) * d; c.setLineDash([5 * d, 4 * d]); c.beginPath();
        if (C.isCircle(k) && t !== 'x' && t !== 'y') { for (let i = 0; i <= 48; i++) { const a = i / 48 * Math.PI * 2, [px, py] = P2(rx + Math.cos(a) * rgx, ry + Math.sin(a) * rgy); i ? c.lineTo(px, py) : c.moveTo(px, py); } } else
        (t === 'x' ? [[rx - rgx, ry], [rx + rgx, ry]] : t === 'y' ? [[rx, ry - rgy], [rx, ry + rgy]] : [[rx - rgx, ry - rgy], [rx + rgx, ry - rgy], [rx + rgx, ry + rgy], [rx - rgx, ry + rgy], [rx - rgx, ry - rgy]]).forEach(([a, b], i) => { const [px, py] = P2(a, b); i ? c.lineTo(px, py) : c.moveTo(px, py); });
        c.stroke(); c.setLineDash([]); const [cx, cy] = P2(rx, ry); c.beginPath(); c.arc(cx, cy, 3 * d, 0, Math.PI * 2); c.fillStyle = colA(0.7); c.fill();
        if (k.ctype === 'custom' && k.points && !S.playing) { // the designed key points, with their names when selected
          c.font = `${11 * d}px system-ui, sans-serif`; c.textAlign = 'center';
          k.points.forEach(p => { const [px, py] = P2(rx + p.u * rgx, ry + p.v * rgy); c.beginPath(); c.arc(px, py, 4 * d, 0, Math.PI * 2); c.fillStyle = '#fff'; c.fill(); c.strokeStyle = col; c.lineWidth = 1.5 * d; c.stroke(); if (on) { c.fillStyle = col; c.fillText(p.name, px, py - 8 * d); } });
        }
      }
      c.strokeStyle = on ? HOT : col; c.lineWidth = 2 * d; c.fillStyle = 'rgba(255,255,255,.8)'; c.beginPath(); c.arc(x, y, Rr, 0, Math.PI * 2); c.fill(); c.stroke();
      c.beginPath(); c.moveTo(x - Rr * 1.6, y); c.lineTo(x + Rr * 1.6, y); c.moveTo(x, y - Rr * 1.6); c.lineTo(x, y + Rr * 1.6); c.stroke();
      if (k.label && !S.playing) { c.font = `600 ${12 * d}px Lexend, system-ui, sans-serif`; c.textAlign = 'left'; c.textBaseline = 'middle'; const tw = c.measureText(k.label).width, pad = 5 * d; // its name sits at the top left of the controller (of its box or line, or of the knob when it moves freely)
        let [lx, ly] = t === 'free' ? [x - Rr * 1.6, y - Rr * 1.6] : (() => { const w = X.parentWorld(k).transformPoint(pt((k.rx ?? k.x) - (t === 'y' ? 0 : C.RX(k)), (k.ry ?? k.y) - (t === 'x' ? 0 : C.RY(k)))); return O.P(w.x, w.y); })();
        if (t === 'y') lx -= Rr; ly -= 6 * d; if (k.labelOff) { lx += k.labelOff.x * O.sc; ly += k.labelOff.y * O.sc; } // moved by double-click and drag
        c.fillStyle = col; c.beginPath(); c.roundRect(lx, ly - 20 * d, tw + pad * 2, 20 * d, 6 * d); c.fill(); if (labelDrag && labelDrag.k === k) { c.strokeStyle = HOT; c.lineWidth = 2 * d; c.stroke(); } c.fillStyle = '#fff'; c.fillText(k.label, lx + pad, ly - 9.5 * d);
        labelBoxes.push({ k, x0: (lx - O.ox) / O.sc, y0: (ly - 20 * d - O.oy) / O.sc, x1: (lx + tw + pad * 2 - O.ox) / O.sc, y1: (ly - O.oy) / O.sc }); }
      c.restore();
    }
    // constraints of the selected layer: a dashed line to what it follows
    if (o && o.cons && o.cons.length && tree.inRange(o) && !S.playing) {
      const tr = TR.transform(o, tree.localTime(o)), a = X.world(o).transformPoint(pt(tr.ax, tr.ay)), [ax, ay] = O.P(a.x, a.y);
      for (const k of o.cons) { const t = tree.find(k.target); if (!t || !tree.inRange(t)) continue; const tt = TR.transform(t, tree.localTime(t)), b = X.world(t).transformPoint(pt(tt.ax, tt.ay)), [bx, by] = O.P(b.x, b.y);
        c.save(); c.strokeStyle = 'rgba(232,115,12,.8)'; c.lineWidth = 1.5 * d; c.setLineDash([4 * d, 4 * d]); c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, by); c.stroke(); c.setLineDash([]); c.beginPath(); c.arc(bx, by, 6 * d, 0, Math.PI * 2); c.stroke(); c.restore(); }
    }
    // rigs
    for (const r of R.rigs()) if (!tree.hidden(r) && tree.inRange(r) && rigVisible(r) && (!S.playing || r.id === S.sel)) drawRig(O, r);
    // physics of the selected layer: colliders, path, rope, throw handle
    if (!o || !o.phys || o.type === 'rig' || (S.playing && !S.recording)) return;
    const poly = Pp => { c.beginPath(); for (let i = 0; i < Pp.length; i += 2) { const [x, y] = O.P(Pp[i], Pp[i + 1]); i ? c.lineTo(x, y) : c.moveTo(x, y); } c.closePath(); c.stroke(); };
    c.save(); c.setLineDash([6 * d, 4 * d]); c.strokeStyle = 'rgba(232,115,12,.8)'; c.lineWidth = 1.5 * d;
    for (const st of PH.statics()) { const cl = PH.collider(st, S.time); if (cl) poly(cl.poly); }
    if (PH.mode(o) !== 'static' && tree.inRange(o) && S.tool !== 'collider') { const hl = PH.hull(o, tree.localTime(o)); if (hl) poly(PH.worldPoly(X.world(o), hl)); }
    if (PH.mode(o) === 'hang') { const A = PH.hangAnchor(o, S.time); if (A) { const Ov = velOrigin(o), [ax, ay] = O.P(A.x, A.y), [bx, by] = O.P(Ov.x, Ov.y); c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, by); c.stroke(); c.beginPath(); c.arc(ax, ay, 5 * d, 0, Math.PI * 2); c.stroke(); } }
    c.setLineDash([]);
    if (PH.mode(o) !== 'static' && !tree.hidden(o)) {
      if (PH.active(o) && o.phys.path !== false) { const dt = PH.data(o); c.setLineDash([3 * d, 5 * d]); c.strokeStyle = 'rgba(232,115,12,.75)'; c.lineWidth = 2 * d; c.beginPath(); let started = false; for (let i = 0; i < dt.n; i += 4) { if (dt.out[i * 4 + 3] !== 1) { started = false; continue; } const [x, y] = O.P(dt.out[i * 4], dt.out[i * 4 + 1]); started ? c.lineTo(x, y) : c.moveTo(x, y); started = true; } c.stroke(); c.setLineDash([]); }
      if (tree.inRange(o) && S.tool === 'select') {
        const Ov = velOrigin(o), lt = tree.localTime(o), vx = TR.value(o, 'phys:vx', lt), vy = TR.value(o, 'phys:vy', lt), [ox, oy] = O.P(Ov.x, Ov.y), [tx, ty] = O.P(Ov.x + vx * PH.VEL_K, Ov.y + vy * PH.VEL_K);
        if (Math.hypot(vx, vy) > 1) { const a = Math.atan2(ty - oy, tx - ox), hl = Math.min(18 * d, Math.hypot(tx - ox, ty - oy) * 0.5); c.strokeStyle = ORANGE; c.fillStyle = ORANGE; c.lineWidth = 3 * d; c.beginPath(); c.moveTo(ox, oy); c.lineTo(tx, ty); c.stroke(); c.beginPath(); c.moveTo(tx, ty); c.lineTo(tx - Math.cos(a - 0.45) * hl, ty - Math.sin(a - 0.45) * hl); c.lineTo(tx - Math.cos(a + 0.45) * hl, ty - Math.sin(a + 0.45) * hl); c.closePath(); c.fill(); }
        c.beginPath(); c.arc(tx, ty, 7 * d, 0, Math.PI * 2); c.fillStyle = '#fff'; c.fill(); c.strokeStyle = ORANGE; c.lineWidth = 2.5 * d; c.stroke();
      }
    }
    c.restore();
  });

  // ================= inspector
  const btn = (label, run, cls, icon) => W.btn(label, run, { cls: 'sm' + (cls ? ' ' + cls : ''), icon });
  const row = (...els) => h('div.row.btns', null, ...els);
  const note = t => h('p.hint', null, t);
  const pick = (title, items) => e => SB.menu.open(e.clientX || e.currentTarget.getBoundingClientRect().left, e.clientY || e.currentTarget.getBoundingClientRect().bottom, [{ head: title }, ...items]);
  const sel = (value, options, onChange, label) => W.select(value, options, onChange, label);

  /** Back to rest: the whole pose of a bone (all), or only its bend and segments. */
  function resetBone(o, b, all) {
    const lt = tree.localTime(o), ids = (all ? [['bone', 0], ['bonex', 0], ['boney', 0], ['bonesx', 1], ['bonesy', 1]] : []).map(([p, v]) => [p + ':' + b.id, v]);
    if (R.nSegs(b)) { ids.push(['bonebend:' + b.id, 0]); for (let k = 0; k < R.nSegs(b); k++) ids.push([`bseg:${b.id}:${k}`, 0]); }
    ids.forEach(([id, v]) => { if (TR.value(o, id, lt) !== v || TR.animated(o, id)) TR.set(o, id, v); });
  }
  function rigSection(o) {
    const b = R.boneById(o, S.selBone), bound = tree.all().filter(x => x.bind && (x.bind.rig === o.id || R.bendsWith(x, o)) && x !== o), others = R.rigs().filter(r => r !== o && !tree.isDesc(r, o));
    const out = [sec('Rig', [
      FL.row(o, { k: 'ik', label: 'Drag a tip moves', type: 'select', options: { 1: '1 bone', 2: '2 bones (arm, leg)', 3: '3 bones', 99: 'Whole chain' }, get: x => String(x.ik || 2), set: (x, v) => x.ik = +v }),
      FL.row(o, { k: 'showBones', label: 'Bones', type: 'check', text: 'Always show on the stage' }),
      R.hasDyn(o) ? FL.row(o, { k: 'phys:on', label: 'Dynamics', type: 'check', anim: true, text: 'On at the playhead' }) : null,
      row(rigLocked(o) ? null : btn('Add bones', () => SB.tool.set('bone'), '', 'bone'), btn('Keyframe the pose', () => SB.ops.addKey(), 'ghost', 'key'), btn(o.locked ? 'Unlock the rig' : 'Lock the rig', () => { o.locked = !o.locked; if (o.locked && S.tool === 'bone') SB.tool.set('select'); SB.commit(); }, 'ghost', o.locked ? 'unlock' : 'lock')),
      rigLocked(o) ? note('Locked: the bones can still be posed and keyframed, but not moved, added or changed.') : null,
      o.bind ? [note(`Attached to ${(R.boneById(tree.find(o.bind.rig), o.bind.bone) || {}).name || '?'} of ${(tree.find(o.bind.rig) || {}).name || '?'}.`), row(btn('Reattach here', () => { R.rebind(o); SB.commit(); }), btn('Detach', () => { delete o.bind; SB.commit(); }, 'ghost'))]
        : others.length ? row(btn('Attach to another rig…', () => pickBone([o]), 'ghost', 'link')) : null,
      bound.some(y => R.bendsWith(y, o)) ? row(btn('Clean up weights…', () => SB.weightFix.open(o), 'ghost', 'check')) : null,
      bound.length ? note('Bound: ' + bound.map(x => x.name).join(', ')) : note('Select a layer and use “Attach to a bone” or “Bend with rig” to connect it.'),
    ], { key: 'rig' }),
    sec('Bones', [h('div.bonelist', null, o.bones.length ? o.bones.map(x => { const on = x.id === S.selBone, wt = S.tool === 'weights';
      const nameBtn = h('button' + (on ? '.on' : ''), { type: 'button', onclick: () => { S.selBone = x.id; SB.invalidate('inspector', 'ctxbar'); SB.dirty(); } }, h('span', null, x.name), h('small', null, x.dyn && x.dyn.on ? 'dynamic' : x.pin ? 'pinned' : U.r1(TR.now(o, 'bone:' + x.id)) + '°'));
      if (!on) return nameBtn;
      // the selected bone: its weights, right under its name
      const wbtn = (mode, label, icon, title) => { const b = W.btn(label, () => { S.wpaint.mode = mode; SB.tool.set('weights'); SB.invalidate('inspector', 'ctxbar'); }, { cls: 'sm' + (wt && (S.wpaint.mode || 'brush') === mode ? ' on' : ''), icon, title }); return b; };
      return h('div.bone-sel', null, nameBtn, bound.some(y => R.bendsWith(y, o)) ? h('div.bone-w', null, wbtn('brush', 'Paint weights', 'weights', 'Paint where the layers follow this bone'), wbtn('gradient', 'Gradient', 'curve', 'Drag a line: full weight where you start, none where you end'), wbtn('lasso', 'Lasso', 'lasso', 'Draw a loop: the bone takes the area inside it, or lets it go'), wbtn('goal', 'Goal curve', 'goal', 'Pose the rig, then draw how the bent edge should look'),
        W.iconBtn('trash', 'Clear the weights painted for this bone', () => { tree.all().forEach(y => { if (R.bendsWith(y, o) && y.bind.paint) delete y.bind.paint[x.id]; }); R.wChanged(); SB.commit(); }, 'sm')) : null); }) : note('No bones yet. Use the Bones tool and click on the stage.'))], { key: 'bones' })];
    if (b) out.push(sec(b.name, [
      FL.row(b, { k: 'name', label: 'Name', type: 'text', single: true, after: () => SB.invalidate('timeline') }),
      h('div.subhead', null, 'Pose'),
      FL.row(o, { k: 'bone:' + b.id, label: 'Turn', type: 'range', min: -180, max: 180, anim: true, single: true }),
      FL.row(o, { k: 'bonex:' + b.id, label: 'Move X', type: 'num', anim: true, single: true }), FL.row(o, { k: 'boney:' + b.id, label: 'Move Y', type: 'num', anim: true, single: true }),
      FL.row(o, { k: 'bonesx:' + b.id, label: 'Length %', type: 'range', min: 5, max: 400, anim: true, single: true }), FL.row(o, { k: 'bonesy:' + b.id, label: 'Width %', type: 'range', min: 5, max: 400, anim: true, single: true }),
      row(btn('Reset pose', () => { resetBone(o, b, true); SB.commit(); }, 'ghost'), h('span.hint', null, 'Children move and scale with it.')),
      h('div.subhead', null, 'Segments'),
      rigLocked(o) ? null : FL.row(b, { label: 'Segments', type: 'num', min: 1, max: 16, step: 1, single: true, get: x => x.segs || 1, set: (x, v) => { v = Math.round(U.clamp(v, 1, 16)); const was = R.nSegs(x); if (v > 1) x.segs = v; else delete x.segs; S.selSeg = null; if (v > 1 && !was) bendCtrl(o, x); }, rerender: true }),
      R.nSegs(b) ? [
        FL.row(o, { k: 'bonebend:' + b.id, label: 'Bend', type: 'range', min: -360, max: 360, anim: true, single: true }),
        S.selSeg && S.selSeg.bone === b.id && S.selSeg.k < R.nSegs(b) ? FL.row(o, { k: `bseg:${b.id}:${S.selSeg.k}`, label: `Segment ${S.selSeg.k + 1}`, type: 'range', min: -180, max: 180, anim: true, single: true })
          : note('Drag the dots on the bone to turn its segments (Alt-drag the tip turns the last one).'),
        row(btn('Straighten', () => { resetBone(o, b, false); SB.commit(); }, 'ghost'))]
        : note('Split the bone into segments to make it bend smoothly: a tail, a spine, a rubber arm.'),
      rigLocked(o) ? null : [FL.row(b, { k: 'len', label: 'Rest length', type: 'num', min: 4, single: true }), FL.row(b, { k: 'ang', label: 'Rest angle', type: 'num', single: true })],
      FL.row(b, { k: 'pin', label: 'Pin', type: 'check', text: 'IK stops at this bone', single: true }),
      FL.row(b, { label: 'Dynamic', type: 'check', text: 'Swings with follow-through', single: true, get: x => !!(x.dyn && x.dyn.on), set: (x, v) => { x.dyn = Object.assign(x.dyn || { stiff: 0.35, damp: 0.25, grav: 1 }, { on: v }); }, rerender: true }),
      b.dyn && b.dyn.on ? [FL.row(b, { label: 'Stiffness %', type: 'range', min: 0, max: 100, single: true, get: x => Math.round((x.dyn.stiff ?? 0.35) * 100), set: (x, v) => x.dyn.stiff = v / 100 }), FL.row(b, { label: 'Damping %', type: 'range', min: 0, max: 100, single: true, get: x => Math.round((x.dyn.damp ?? 0.25) * 100), set: (x, v) => x.dyn.damp = v / 100 }), FL.row(b, { label: 'Gravity', type: 'range', min: 0, max: 3, step: 0.05, single: true, get: x => x.dyn.grav ?? 1, set: (x, v) => x.dyn.grav = v })] : null,
      rigLocked(o) ? null : W.row('Parent', W.select(b.parent || '', [['', 'None (a free bone)'], ...o.bones.filter(x => x !== b && !isUnder(o, x, b)).map(x => [x.id, x.name])], v => { const sn = R.editSnap(o); if (R.setParent(o, b.id, v || null)) { R.keepAttached(sn); SB.commit(); SB.toast(v ? `${b.name} now follows ${R.boneById(o, v).name}, staying where it is.` : `${b.name} is free now.`); } }, 'Parent bone'),
        W.info('A bone follows its parent. When its start is not on the parent’s tip it is a free bone (dashed line): it still follows the parent, good for ears, eyes or hair. Drag its start dot with the Bones tool to move it.')),
      rigLocked(o) ? null : row(btn('Delete bone', () => { const sn = R.editSnap(o); R.deleteBoneOnly(o, b.id); R.keepAttached(sn); SB.commit(); }, 'ghost', 'trash'), btn('Delete with its children', () => { R.deleteBone(o, b.id); SB.commit(); }, 'ghost')),
    ], { key: 'bone' }));
    return out;
  }
  /** A bone split into segments gets a controller that bends it: drag it to one side of the bone and the
      bone curls that way (it sits at the bone's tip; its box moves both ways). */
  function bendCtrl(rig, b) {
    const id = 'bonebend:' + b.id; if ((rig.drv || []).some(L => L.states.some(st => st.p && id in st.p))) return null;
    const q = R.poseAt(rig, S.time)[b.id]; if (!q) return null; const RW = X.world(rig), H = RW.transformPoint(pt(q.hx, q.hy)), Tp = RW.transformPoint(pt(q.tx, q.ty));
    const th = Math.atan2(Tp.y - H.y, Tp.x - H.x), nx = -Math.sin(th), ny = Math.cos(th), B = 140; // bending one way curls toward the clockwise side
    const c = tree.make('null', { name: `${b.name} bend`, ctype: 'xy', rw: 70, rh: 70, x: U.r1(Tp.x), y: U.r1(Tp.y), rx: U.r1(Tp.x), ry: U.r1(Tp.y) });
    tree.rootList().unshift(c); tree.reindex();
    const st = (slot, u, v) => ({ slot, u, v, p: { [id]: U.r1(B * (u * nx + v * ny)) } });
    (rig.drv = rig.drv || []).push({ id: U.uid(), ctrl: c.id, amt: 1, space: 'local', states: [st('center', 0, 0), st('left', -1, 0), st('right', 1, 0), st('top', 0, -1), st('bottom', 0, 1)] });
    SB.toast(`${c.name} added: drag it to either side of ${b.name} to bend it. Record other poses for it in the rig's Controls.`);
    return c;
  }
  /** How a layer is connected to a rig: a card like a controller's (what it follows, change it, remove it). */
  function bindSection(o) {
    const B = o.bind; if (!B || o.type === 'rig') return null;
    const lockRow = h('div.rl-row', null, h('button.btn.sm.rl-btn' + (o.rigLock ? '.on' : ''), { type: 'button', 'aria-pressed': String(!!o.rigLock), title: o.rigLock ? 'Rig lock is on: dragging it poses the bones. Click to move it freely' : 'Rig lock is off: you can move, turn and scale it. Click to let the rig move it', html: SB.icon('rigLock') + '<span>Rig lock</span>', onclick: () => { o.rigLock = !o.rigLock; SB.commit(); SB.invalidate('inspector'); } }),
      W.info(['Rig lock: the rig moves this layer, so you can’t move, turn or scale it by accident. Dragging it on the stage poses the bones instead (it pulls the bone it is on).', 'You can still select it, draw on it, and right-click it for effects and everything else.', 'It turns on by itself when you attach a layer to a rig. Turn it off to place the layer again, then use Keep it here (or Rebind) to attach it where it is.'], 'What is Rig lock?'));
    if (B.mode === 'deform') {
      const rs = R.bindRigs(B).map(tree.find).filter(Boolean), more = R.rigs().filter(x => !rs.includes(x));
      const cards = rs.map(r => h('div.fxitem', null, h('div.hd', null,
        h('button.linkbtn', { type: 'button', title: 'Select this rig', onclick: () => tree.select([r.id]) }, h('span', { html: SB.icon('rig') }), `Bends with ${r.name}`),
        W.iconBtn('x', 'Stop bending with this rig', () => { R.unbendFrom(o, r); SB.commit(); }, 'sm'))));
      return sec('Rig', [...cards,
        h('div.fxitem', null, FL.row(B, { k: 'soft', label: 'Softness', type: 'range', min: 10, max: 300, single: true }), lockRow,
          row(btn('Rebind at this pose', () => { R.rebind(o); SB.commit(); }, 'ghost'), more.length ? btn('Also bend with…', () => pickBend([o]), 'ghost', 'target') : null)),
        note('It stretches with the bones. Paint where each bone moves it in the rig’s Bones list (Paint weights, Gradient).')], { key: 'bind', badge: h('span.badge', null, 'bends') });
    }
    const r = tree.find(B.rig), b = r && R.boneById(r, B.bone);
    const card = h('div.fxitem', null,
      h('div.hd', null,
        h('button.linkbtn', { type: 'button', title: 'Select the rig and this bone', onclick: () => { if (r) { tree.select([r.id]); S.selBone = B.bone; SB.invalidate('inspector'); } } }, h('span', { html: SB.icon('bone') }), b ? `${b.name} · ${r.name}` : 'A deleted bone'),
        W.iconBtn('target', 'Attach to another bone: pick it on the stage', () => pickBone(tree.selected()), 'sm'),
        W.iconBtn('x', 'Detach from the rig', () => { delete o.bind; SB.commit(); }, 'sm')),
      r ? W.row('Bone', W.select(B.bone, r.bones.map(x => [x.id, x.name]), v => { R.bindTo(o, r, v, 'follow'); SB.commit(); }, 'Bone')) : null,
      lockRow,
      row(btn('Keep it here', () => { R.rebind(o); SB.commit(); }, 'ghost', 'link'), h('span.hint', null, 'Moved it? Attach again where it is now.')));
    return sec('Rig', [card, note('It moves and turns with the bone. Use Physics › Hang to let it swing from the bone instead.')], { key: 'bind', badge: h('span.badge', null, 'on bone') });
  }
  /** The three kinds of physics as tiles: the same grid with physics on or off (none chosen yet). */
  function kindTiles(o, m) {
    const ph = o.phys, hasRig = R.rigs().length > 0;
    const pick = k => {
      if (k === 'hang') { if (!hasRig) return SB.toast('Add a rig with the Bones tool first.'); if (!ph) return pickHang(o); ph.mode = k; SB.commit(); if (!ph.rig) pickHang(o); return; }
      if (!ph) { const items = k === 'static' ? tree.selected().filter(fxable) : [o]; (items.length ? items : [o]).forEach(x => PH.add(x, k === 'static' ? { mode: 'static' } : undefined)); if (!tree.inRange(o)) tree.goLocal(o, 0.0001); SB.commit(); if (k === 'dynamic') SB.toast('Physics on. Press play. Drag the orange handle to throw it.'); return; }
      ph.mode = k; SB.commit();
    };
    return h('div.ph-kinds', null, [['dynamic', 'phys', 'Body', 'Falls and bounces'], ['static', 'collider', 'Surface', 'Others land on it'], ['hang', 'bone', 'Hang', hasRig ? 'Swings from a bone' : 'Needs a rig']].map(([k, icon, label, tip]) =>
      h('button.ph-kind' + (m === k ? '.on' : '') + (k === 'hang' && !hasRig ? '.off' : ''), { type: 'button', title: tip, 'aria-pressed': String(m === k), onclick: () => pick(k) }, h('span', { html: SB.icon(icon) }), h('b', null, label), h('small', null, tip))));
  }
  /** Physics: what kind, on or off, the few settings that matter most, the rest folded away. */
  function physicsSection(o) {
    const ph = o.phys; if (!ph || o.type === 'rig') return null; const m = ph.mode || 'dynamic';
    const kinds = kindTiles(o, m);
    const f = [kinds, FL.row(o, { k: 'phys:on', label: m === 'static' ? 'Solid' : 'Simulate', type: 'check', anim: true, text: 'On at the playhead' })];
    if (m === 'hang') {
      const r = tree.find(ph.rig), hb = r && R.boneById(r, ph.bone);
      f.push(h('div.fxitem', null, h('div.hd', null,
        h('button.linkbtn', { type: 'button', title: 'Select the rig', onclick: () => r && tree.select([r.id]) }, h('span', { html: SB.icon('bone') }), hb ? `Hangs from ${hb.name} · ${r.name}` : 'Pick a bone to hang from'),
        W.iconBtn('target', 'Pick the bone on the stage', () => pickHang(o), 'sm')),
        FL.row(ph, { k: 'rope', label: 'Rope', type: 'range', min: 0, max: 800, single: true }),
        FL.row(ph, { k: 'ropeMode', label: 'Kind', type: 'seg', single: true, options: [['rope', 'Rope'], ['spring', 'Spring']] }),
        h('div.ph-checks', null, FL.row(ph, { k: 'swing', label: '', type: 'check', single: true, text: 'Tilts as it swings' }), FL.row(ph, { label: '', type: 'check', single: true, text: 'Draw the rope', get: x => x.drawRope !== false, set: (x, v) => x.drawRope = v }))));
    }
    if (m !== 'static') {
      f.push(h('div.subhead', null, 'Motion'),
        FL.row(o, { k: 'phys:weight', label: 'Weight', type: 'range', min: -2, max: 5, step: 0.05, anim: true, single: true }), FL.row(o, { k: 'phys:bounce', label: 'Bounce %', type: 'range', min: 0, max: 100, anim: true, single: true }),
        FL.row(ph, { k: 'edges', label: 'Hits', type: 'seg', single: true, options: [['floor', 'Ground', 'It lands on the bottom of the screen'], ['box', 'Ground + walls', 'The screen edges keep it in'], ['none', 'Only surfaces', 'It falls through the bottom: only layers set as Solid stop it']], get: x => x.edges || 'floor' }),
        m === 'dynamic' ? FL.row(o, { k: 'phys:spin', label: 'Spin °/s', type: 'range', min: -720, max: 720, step: 5, anim: true, single: true }) : null,
        h('div.ph-throw', null, FL.row(o, { k: 'phys:vx', label: 'Throw →', type: 'num', anim: true, single: true, step: 10 }), FL.row(o, { k: 'phys:vy', label: '↓', type: 'num', anim: true, single: true, step: 10 })),
        note('Drag the orange handle on the stage to aim the throw.'));
    }
    const more = h('details.ph-more', null, h('summary', null, 'More'),
      FL.row(ph, { k: 'colShape', label: 'Shape', type: 'select', single: true, options: { auto: 'Its outline', box: 'Box', circle: 'Circle', custom: 'Custom' }, get: x => x.colShape || 'auto' }),
      row(btn('Edit the shape', () => SB.tool.set('collider'), S.tool === 'collider' ? 'on' : 'ghost', 'collider')),
      m !== 'static' ? [
        FL.row(ph, { label: 'Friction %', type: 'range', min: 0, max: 100, single: true, get: x => Math.round(x.friction * 100), set: (x, v) => x.friction = v / 100 }), FL.row(ph, { label: 'Air drag %', type: 'range', min: 0, max: 100, single: true, get: x => Math.round(x.drag * 100), set: (x, v) => x.drag = v / 100 }),
        FL.row(ph, { k: 'after', label: 'When off', type: 'select', single: true, options: { hold: 'Stays where it is', anim: 'Back to keyframes' } }),
        FL.row(ph, { k: 'inherit', label: 'Start', type: 'check', single: true, text: 'Keep the keyframed motion' }), FL.row(ph, { label: 'Path', type: 'check', single: true, text: 'Show the predicted path', get: x => x.path !== false, set: (x, v) => x.path = v }),
        FL.row(S.project, { k: 'gravity', label: 'Gravity', type: 'range', min: 0, max: 5000, step: 50, single: true, get: p => p.gravity ?? 1800 })] : null);
    if (SB.fields.open['phmore']) more.open = true; more.addEventListener('toggle', () => { SB.fields.open['phmore'] = more.open; });
    f.push(more, row(btn('Remove physics', () => { PH.remove(o); SB.commit(); }, 'ghost', 'trash')));
    return sec('Physics', f, { key: 'physics', badge: TR.animated(o, 'phys:on') ? h('span.badge', null, 'keyed') : null });
  }
  function controllerSection(o) {
    if (o.type !== 'null') return null; const [u, v] = C.value(o, S.time), users = C.usersOf(o), t = C.motion(o);
    const onNow = TR.now(o, 'ctrl:on') !== false;
    return sec('Controller', [
      W.row('On', h('span.row', null, FL.keyButton(o, 'ctrl:on'), W.check(onNow, onNow ? 'It moves its layers' : 'Off: its layers stay as they are', v => { TR.set(o, 'ctrl:on', v); SB.commit(); })), W.info('Off: the controller changes nothing (its layers show their own animation). The ◇ keys it, so it can be off for part of the animation.')),
      W.row('Interactive', W.check(!!o.ixGrab, 'The viewer can drag it', v => SB.controls.setGrab(o, v)), W.info('In Preview, the interactive web page and Rive, the controller shows on the stage and the viewer drags its knob to move what it drives (a mouth, eyes, a switch…).')),
      o.ixGrab ? W.row('Shows', W.check(o.ixLine !== false, 'Its line or box', v => { if (v) delete o.ixLine; else o.ixLine = false; SB.commit(); }), W.check(o.ixKnob !== false, 'Its knob', v => { if (v) delete o.ixKnob; else o.ixKnob = false; SB.commit(); }), W.info('What the viewer sees while it plays. Hidden parts still work: the viewer can drag where the knob is.')) : null,
      FL.row(o, { k: 'ctype', label: 'Moves', type: 'select', options: ctypeOptions(o), single: true, get: x => x.ctype || 'xy' }),
      FL.row(o, { k: 'label', label: 'Name on stage', type: 'text', single: true, get: x => x.label || '', set: (x, v) => { if (v.trim()) x.label = v; else delete x.label; } }),
      W.row('Color', W.colorBtn(o.color || ORANGE, { label: 'Controller color', input: v => { o.color = v; SB.dirty(); }, change: () => SB.commit() }), o.color ? W.btn('Default', () => { delete o.color; SB.commit(); }, { cls: 'sm ghost' }) : null),
      o.toggle ? toggleEditor(o) : o.ctype === 'custom' && o.points ? pointsEditor(o) : null,
      row(btn(o.ctype === 'custom' && o.points ? 'Edit the design…' : 'Design your own…', () => SB.ctrlDesigner.open(o), '', 'ctrl')),
      t !== 'y' ? FL.row(o, { label: 'Width px', type: 'range', min: 10, max: 600, single: true, get: x => C.RX(x), set: (x, v) => x.rw = v }) : null,
      t !== 'x' ? FL.row(o, { label: 'Height px', type: 'range', min: 10, max: 600, single: true, get: x => C.RY(x), set: (x, v) => x.rh = v }) : null,
      note(`Value ${t !== 'y' ? 'x ' + U.r2(u) : ''}${t !== 'x' && t !== 'y' ? ', ' : ''}${t !== 'x' ? 'y ' + U.r2(v) : ''}`),
      ctlLayers(o), (() => { const f = users.filter(x => !(x.drv || []).some(l => l.ctrl === o.id)); return f.length ? h('div.row.btns', null, h('span.hint', null, 'Follow it: '), ...f.map(x => btn(x.name, () => tree.select([x.id]), 'ghost'))) : null; })(),
      row(btn('Set rest here', () => { const k = TR.keyed(o, tree.localTime(o)); o.rx = U.r1(k.x); o.ry = U.r1(k.y); SB.commit(); }), btn('Back to rest', () => { TR.setMany(o, { x: o.rx ?? o.x, y: o.ry ?? o.y }); SB.commit(); }, 'ghost')),
      tree.selected().filter(x => x.type === 'null').length > 1 ? row(h('span.hint', null, 'Line them up: '), btn('In a row', () => arrangeCtrls(tree.selected().filter(x => x.type === 'null'), 'row'), 'ghost'), btn('In a column', () => arrangeCtrls(tree.selected().filter(x => x.type === 'null'), 'column'), 'ghost')) : null,
    ], { key: 'ctrl' });
  }
  // ---------- the layers a controller moves: see them, pick them, take them out; add and edit several at once at one point
  /** The controller's points as a small map: the point being edited is big, recorded ones are filled. Clicking one picks it. */
  function pointsMap(c, cur, pick) {
    const t = C.motion(c), lock = t === 'x' || t === 'y' ? t : null, Wd = lock === 'y' ? 40 : 168, Hd = lock === 'x' ? 40 : Math.max(40, Math.min(110, 168 * C.RY(c) / Math.max(1, C.RX(c)))), links = C.linksOf(c);
    return h('div.ctl-map' + (C.isCircle(c) ? '.circle' : '') + (lock ? '.line' : ''), { style: { width: Wd + 'px', height: Hd + 'px' } }, C.slotsFor(c).map(q => {
      const has = links.some(({ L }) => C.stateOf(L, q.k)), on = q.k === cur;
      return h('button' + (on ? '.on' : '') + (has ? '.has' : ''), { type: 'button', title: q.name + (has ? ' (recorded)' : ''), 'aria-label': q.name, style: { left: (q.u + 1) / 2 * 100 + '%', top: (q.v + 1) / 2 * 100 + '%' }, onclick: () => pick(q.k) });
    }));
  }
  /** The layers in this edit: the ones c moves, and the ones you changed that it will move after Save (new). */
  function layerChips(c, pl) {
    const links = C.linksOf(c), fresh = pl ? C.changedOthers(pl) : [], chip = (o, kind) => h('span.ctl-chip.' + kind + (S.multi.has(o.id) ? '.sel' : ''), null,
      h('button', { type: 'button', title: kind === 'new' ? 'Changed: the controller moves it after Save. Click to select it' : 'Select it', onclick: () => tree.select([o.id]) }, o.name, kind === 'new' ? h('small', null, ' new') : null),
      W.iconBtn('x', kind === 'new' ? 'Undo its change (it stays out)' : 'The controller stops moving it', () => {
        if (kind === 'new') { const z = pl.others[o.id]; if (z.tr) o.tracks = U.deep(z.tr); for (const P in z.was) if (!TR.animated(o, P)) TR.setBase(o, P, z.was[P]); SB.bump(); SB.invalidate('ctledit', 'inspector'); }
        else C.unlink(c, o);
      }, 'sm'));
    const list = [...links.map(({ o }) => chip(o, 'in')), ...fresh.map(({ o }) => chip(o, 'new'))];
    return list.length ? h('div.ctl-chips', null, list) : h('p.hint', null, pl ? 'Select any layers and move, scale or turn them: each one you change is added.' : 'It moves no layers yet.');
  }
  const editing = c => S.poseLink && S.poseLink.multi && S.poseLink.cid === c.id ? S.poseLink : null;
  const startPoint = c => { const sl = C.slotsFor(c), [u, v] = C.value(c, S.time); return (sl.slice().sort((a, b) => Math.hypot(a.u - u, a.v - v) - Math.hypot(b.u - u, b.v - v))[0] || { k: 'center' }).k; };
  /** In the Controller section: the layers it moves, and "Add and edit layers". */
  function ctlLayers(c) {
    if (c.toggle) return null; const pl = editing(c);
    return h('div.fxitem.ctl-layers', null, h('div.hd', null, h('b', null, 'Layers it moves')), layerChips(c, pl),
      pl ? [pointsMap(c, pl.slot, k => k !== pl.slot && C.saveMulti(k)), h('div.row.btns', null, btn('Save', () => C.saveSlot(), 'primary'), btn('Cancel', () => C.cancelSlot(), 'ghost'))]
        : row(btn('Add and edit layers', () => C.enterMulti(c, startPoint(c)), '', 'plus'), W.info(['Pick a point of the controller, then select any layers and move, scale or turn them (several at once).', 'Save keeps that pose for every layer; layers you changed are added. Click another point to save and go on there.'], 'Add and edit layers')));
  }
  /** While editing: a small window that stays when you pick other layers. */
  let ced = null;
  SB.panel('ctledit', () => {
    const pl = S.poseLink && S.poseLink.multi ? S.poseLink : null, c = pl && tree.find(pl.cid); if (!c) { if (ced) { ced.remove(); ced = null; } return; }
    if (!ced) { ced = h('div.ctl-edit', { role: 'dialog', 'aria-label': 'Editing a controller' }); document.body.appendChild(ced); }
    const name = (C.slotOf(c, pl.slot) || { name: pl.slot }).name, isCtl = tree.sel() === c;
    ced.replaceChildren(
      h('div.ctl-edit-h', null, h('button.ctl-name' + (isCtl ? '.on' : ''), { type: 'button', title: 'Show the controller in the panel', onclick: () => tree.select([c.id]) }, h('span', { html: SB.icon('ctrl') }), c.name), h('span.ctl-pt', null, 'Point ', h('b', null, name))),
      h('div.ctl-edit-b', null, pointsMap(c, pl.slot, k => k !== pl.slot && C.saveMulti(k)), layerChips(c, pl)),
      h('div.ctl-edit-f', null, h('span.hint', null, 'Select layers on the stage and change them.'), btn('Cancel', () => C.cancelSlot(), 'ghost'), btn('Save', () => C.saveSlot(), 'primary')));
  });
  ['select', 'commit'].forEach(ev => SB.on(ev, () => S.poseLink && S.poseLink.multi && SB.invalidate('ctledit')));
  /** A designed controller's points: rename, place (−1…1 across its box), reorder, snap, delete. */
  function pointsEditor(c) {
    const users = tree.all().filter(x => (x.drv || []).some(L => L.ctrl === c.id)), linksOf = () => users.flatMap(x => x.drv.filter(L => L.ctrl === c.id));
    const move = (i, d) => { const j = i + d; if (j < 0 || j >= c.points.length) return; const a = c.points; [a[i], a[j]] = [a[j], a[i]]; SB.commit(); };
    const rows = c.points.map((p, i) => {
      const snapOn = linksOf().some(L => (C.stateOf(L, p.k) || {}).snap);
      const name = h('input.pt-name', { type: 'text', value: p.name || '', 'aria-label': 'Point name' }); name.onchange = () => { p.name = name.value.trim() || p.name; SB.commit(); };
      const num = (k, label) => W.num(p[k], { min: -1, max: 1, step: 0.05, label, change: v => { p[k] = U.r2(U.clamp(v, -1, 1)); linksOf().forEach(L => { const st = C.stateOf(L, p.k); if (st) { st.u = p.u; st.v = p.v; } L._rbf = null; }); SB.commit(); } });
      return h('div.pt-row', null, h('span.pt-i', null, String(i + 1)), name, c.lock !== 'y' ? num('u', 'Across') : null, c.lock !== 'x' ? num('v', 'Down') : null,
        W.iconBtn('magnet', snapOn ? 'Snaps: the layers jump to this point near it. Click to blend' : 'Blends. Click to snap here (no in-between near this point)', () => { linksOf().forEach(L => { const st = C.stateOf(L, p.k); if (st) { if (snapOn) delete st.snap; else st.snap = true; } }); SB.commit(); }, 'sm' + (snapOn ? ' on' : '')),
        W.iconBtn('up', 'Move up', () => move(i, -1), 'sm'), W.iconBtn('down', 'Move down', () => move(i, 1), 'sm'),
        W.iconBtn('trash', 'Delete this point (and what the layers do there)', () => { if (c.points.length <= 2) return SB.toast('A controller needs at least two points.'); c.points.splice(i, 1); linksOf().forEach(L => { L.states = L.states.filter(st => st.slot !== p.k); L._rbf = null; }); SB.commit(); }, 'sm'));
    });
    return [h('div.subhead', null, `Points (${c.points.length})`), h('div.pt-list', null, rows)];
  }
  /** Line up controllers in a row or a column, evenly spaced around where they are (their rest moves with them). */
  function arrangeCtrls(list, dir) {
    if (list.length < 2) return SB.toast('Select two or more controllers.');
    const k = dir === 'row' ? 'x' : 'y', sorted = list.slice().sort((a, b) => TR.keyed(a, 0)[k] - TR.keyed(b, 0)[k]), size = c => (dir === 'row' ? C.RX(c) : C.RY(c)) * 2 + 40;
    const total = sorted.reduce((a, c) => a + size(c), 0), ks = sorted.map(c => TR.keyed(c, tree.localTime(c))), cx = ks.reduce((a, q) => a + q.x, 0) / ks.length, cy = ks.reduce((a, q) => a + q.y, 0) / ks.length;
    let at = (dir === 'row' ? cx : cy) - total / 2;
    sorted.forEach((c, i) => { const q = ks[i], s = size(c), nx = dir === 'row' ? at + s / 2 : cx, ny = dir === 'row' ? cy : at + s / 2; at += s;
      const dx = nx - q.x, dy = ny - q.y; TR.setMany(c, { x: U.r1(q.x + dx), y: U.r1(q.y + dy) }); c.rx = U.r1((c.rx ?? q.x) + dx); c.ry = U.r1((c.ry ?? q.y) + dy); delete c._live; });
    SB.commit(); SB.toast(`${list.length} controllers in a ${dir}.`);
  }
  /** Turn a layer into a controller: a handle at its middle that the layer moves with, ready to drive other layers. */
  function ctrlFromLayer(items) {
    const made = [];
    for (const o of items) {
      if (o.type === 'null' || o.type === 'rig' || !SB.types.get(o.type).visual) continue; const bx = SB.scene.box(o); if (!bx) continue;
      const c = C.make(null), q = bx.aabb, PW = X.parentWorld(c).inverse().transformPoint(pt((q.x0 + q.x1) / 2, (q.y0 + q.y1) / 2));
      c.name = `${o.name} control`; c.x = c.rx = U.r1(PW.x); c.y = c.ry = U.r1(PW.y); c.rw = Math.max(40, Math.round((q.x1 - q.x0) * 0.75)); c.rh = Math.max(40, Math.round((q.y1 - q.y0) * 0.75)); tree.reindex();
      C.addConstraint(o, 'follow', c); made.push(c);
    }
    if (!made.length) return SB.toast('Select a layer to make a controller from it.');
    tree.select(made.map(c => c.id)); SB.commit(); SB.toast(made.length > 1 ? `${made.length} controllers: each layer moves with its own. Drive other layers with them in Controls.` : `${made[0].name}: drag it and the layer comes along. Use it to drive other layers (their Controls).`);
    return made;
  }
  /** Right-click a layer: Controller, Rig and Physics, each with what it can do there. */
  /** Back to the rest pose: every bone straight as it was drawn (keyed at the playhead where the pose is animated or Auto key is on). */
  function resetRig(rig) {
    const vals = {}; for (const b of rig.bones) { for (const [p, [, v]] of Object.entries(R.BONE_P)) vals[p + ':' + b.id] = v; for (let k = 0; k < R.nSegs(b); k++) vals[`bseg:${b.id}:${k}`] = 0; }
    for (const id in vals) TR.set(rig, id, vals[id]); S.selBone = null; SB.commit(); SB.toast(`${rig.name} is back in its rest pose.`);
  }
  function layerMenus(o, items) {
    if (o.type === 'rig') return [{ label: 'Reset rig', icon: 'rig', run: () => resetRig(o) }];
    if (o.type === 'null' || !SB.types.get(o.type).visual) return null;
    items = items.filter(x => x.type !== 'null' && x.type !== 'rig' && SB.types.get(x.type).visual); const many = items.length > 1;
    const toggles = tree.all().filter(c => c.type === 'null' && c.toggle);
    const ctrl = { label: 'Controller', sub: [
      many ? { label: `Make a toggle controller (${items.length} layers, one point each)`, run: () => makeToggle(items) } : null,
      ...toggles.map(c => ({ label: `Add to the toggle “${c.name}”`, run: () => { items.forEach(x => { if (!c.toggle.includes(x.id)) c.toggle.push(x.id); }); rebuildToggle(c); SB.commit(); SB.toast(`${c.name} has ${c.toggle.length} points.`); } })),
      { label: many ? 'Make them controllers' : 'Make it a controller', run: () => ctrlFromLayer(items) },
      { label: 'Drive with a controller', sub: driveItems(items).filter(Boolean) },
      { label: 'Follow', sub: consItems(items) }].filter(Boolean) };
    const bound = items.some(x => x.bind);
    const rig = { label: 'Rig', sub: R.rigs().length ? [{ label: 'Attach to a bone…', run: () => pickBone(items) }, { label: 'Bend with a rig…', run: () => pickBend(items) }, bound ? { label: 'Detach from the rig', run: () => { items.forEach(x => delete x.bind); SB.commit(); } } : null].filter(Boolean) : [{ label: 'Draw bones first', run: () => SB.tool.set('bone') }] };
    const ph = items.filter(fxable), on = ph.some(x => x.phys);
    const phys = ph.length ? { label: 'Physics', sub: [
      { label: 'Body (falls and bounces)', run: () => { ph.forEach(x => PH.add(x, Object.assign({}, x.phys || {}, { mode: 'dynamic', on: true }))); if (!tree.inRange(o)) tree.goLocal(o, 0.0001); SB.commit(); SB.toast('Physics on. Press play.'); } },
      { label: 'Surface (others land on it)', run: () => { ph.forEach(x => PH.add(x, Object.assign({}, x.phys || {}, { mode: 'static' }))); SB.commit(); } },
      { label: 'Hang from a bone…', disabled: !R.rigs().length, run: () => pickHang(ph[0]) },
      on ? { label: 'Remove physics', run: () => { ph.forEach(x => { if (x.phys) PH.remove(x); }); SB.commit(); } } : null].filter(Boolean) } : null;
    return [ctrl, rig, phys].filter(Boolean);
  }
  /** Toggle controller: one point per layer along a line; at each point its layer shows and the others hide (Snap: no
      in-between), so dragging or keying the knob switches mouth shapes, hands, eyes… c.toggle = layer ids in point order. */
  function makeToggle(items) {
    items = items.filter(x => SB.types.get(x.type).visual && x.type !== 'null' && x.type !== 'rig'); if (items.length < 2) return SB.toast('Select two or more layers.');
    const q = U.emptyBox(); items.forEach(x => { const b = SB.scene.box(x); if (b) { U.growBox(q, b.aabb.x0, b.aabb.y0); U.growBox(q, b.aabb.x1, b.aabb.y1); } });
    const c = C.make(null), P = X.parentWorld(c).inverse().transformPoint(pt(U.boxOk(q) ? (q.x0 + q.x1) / 2 : S.project.w / 2, U.boxOk(q) ? Math.max(30, q.y0 - 50) : 40));
    c.name = 'Toggle'; c.label = 'Toggle'; c.ctype = 'custom'; c.lock = 'x'; c.rw = Math.max(60, 30 * items.length); c.rh = 30; c.x = c.rx = U.r1(P.x); c.y = c.ry = U.r1(P.y); c.toggle = items.map(x => x.id);
    rebuildToggle(c); c.x = U.r1(c.rx - C.RX(c)); tree.reindex(); tree.select([c.id]); SB.commit();
    SB.toast(`Toggle with ${items.length} points: drag the knob (or key it) to switch. Its panel changes which layer each point shows and adds more.`); return c;
  }
  function rebuildToggle(c) {
    c.toggle = (c.toggle || []).filter(id => tree.find(id)); const ids = c.toggle, n = ids.length;
    c.points = ids.map((id, i) => ({ k: 'tg_' + id, name: tree.find(id).name, u: n > 1 ? U.r2(-1 + 2 * i / (n - 1)) : 0, v: 0 }));
    tree.all().forEach(o => { if (o.drv) { o.drv = o.drv.filter(L => !(L.ctrl === c.id && L.toggle)); if (!o.drv.length) delete o.drv; } });
    ids.forEach(id => { const o = tree.find(id); (o.drv = o.drv || []).push({ id: U.uid(), ctrl: c.id, amt: 1, space: 'global', blend: 'hold', toggle: true, states: c.points.map(p => ({ slot: p.k, u: p.u, v: p.v, p: { opacity: p.k === 'tg_' + id ? 1 : 0 } })) }); });
    SB.bump();
  }
  /** Show point i of a toggle: the knob goes there (with Auto key on, that is a keyframe). */
  function showToggle(c, i) { const p = c.points[i]; if (!p) return; TR.setMany(c, { x: U.r1((c.rx ?? c.x) + p.u * C.RX(c)), y: c.ry ?? c.y }); delete c._live; SB.commit(); }
  function toggleEditor(c) {
    const layers = tree.all().filter(x => SB.types.get(x.type).visual && x.type !== 'null' && x.type !== 'rig'), [u] = C.value(c, S.time), n = c.toggle.length;
    const cur = n > 1 ? Math.round((u + 1) / 2 * (n - 1)) : 0;
    const rows = c.toggle.map((id, i) => h('div.pt-row' + (i === cur ? '.on' : ''), null, h('span.pt-i', null, String(i + 1)),
      W.select(id, layers.map(x => [x.id, x.name]), v => { const j = c.toggle.indexOf(v); if (j >= 0) c.toggle[j] = id; c.toggle[i] = v; rebuildToggle(c); SB.commit(); }, `Layer at point ${i + 1}`),
      W.iconBtn('eye', 'Show this one (moves the knob here; with Auto key it is keyed)', () => showToggle(c, i), 'sm' + (i === cur ? ' on' : '')),
      W.iconBtn('up', 'Earlier', () => { if (!i) return; [c.toggle[i - 1], c.toggle[i]] = [c.toggle[i], c.toggle[i - 1]]; rebuildToggle(c); SB.commit(); }, 'sm'),
      W.iconBtn('trash', 'Take this layer out of the toggle', () => { c.toggle.splice(i, 1); const o = tree.find(id); if (o && o.drv) { o.drv = o.drv.filter(L => !(L.ctrl === c.id && L.toggle)); if (!o.drv.length) delete o.drv; } rebuildToggle(c); SB.commit(); }, 'sm')));
    return [h('div.subhead', null, `Toggle (${n} points)`), h('div.pt-list', null, rows),
      row(btn('Add a layer…', () => SB.picker.start({ title: `Pick a layer to add to ${c.name}`, test: x => SB.types.get(x.type).visual && x.type !== 'null' && x.type !== 'rig' && !c.toggle.includes(x.id), done: k => { c.toggle.push(k.o.id); rebuildToggle(c); SB.commit(); } }), 'ghost', 'plus')),
      note('Each point shows one layer and hides the others. Drag the knob, key it, or drive it from an interaction. Right-click layers › Controller › Add to the toggle adds several at once.')];
  }
  /** The "Moves" choices: Custom only once the controller has been designed. */
  const ctypeOptions = o => Object.fromEntries(Object.entries(C.CTYPES).filter(([k]) => k !== 'custom' || (o.points && o.points.length)));

  // ---------- pick mode: click the controller, rig, bone or target on the stage (js/ui/picker.js)
  const names = items => items.length > 1 ? `${items.length} layers` : items[0].name;
  const notInside = (x, items) => !items.includes(x) && !items.some(i => tree.isDesc(x, i) || tree.isDesc(i, x));
  function pickBone(items) {
    const rs = R.rigs().filter(r => items.every(x => r !== x && !tree.isDesc(r, x)));
    if (!rs.length) { SB.toast('Draw bones first with the Bones tool.'); return SB.tool.set('bone'); }
    SB.picker.start({ title: `Pick a bone for ${names(items)}`, bones: true, test: x => rs.includes(x), done: c => attachAll(items, c.o, c.bone ? c.bone.id : null) });
  }
  function pickBend(items) {
    const rs = R.rigs().filter(r => items.some(x => !R.bendsWith(x, r)) && items.every(x => r !== x && !tree.isDesc(r, x)));
    if (!rs.length) { SB.toast(R.rigs().length ? 'Already bending with every rig.' : 'Draw bones first with the Bones tool.'); return; }
    SB.picker.start({ title: `Pick a rig for ${names(items)} to bend with`, bones: true, test: x => rs.includes(x), done: c => { let n = 0; items.forEach(x => { if (x.type !== 'group' && x.type !== 'rig' && R.bindTo(x, c.o, null, 'deform', !!x.bind)) n++; }); if (n) { SB.commit(); SB.toast(`Bending with ${c.o.name}. Pose the bones to see it.`); } } });
  }
  function pickHang(o) {
    if (!R.rigs().length) return SB.toast('Draw bones first with the Bones tool.');
    SB.picker.start({ title: `Pick a bone for ${o.name} to hang from`, bones: true, test: x => x.type === 'rig' && x !== o, done: c => hangFrom(o, c.o, c.bone) });
  }
  function hangFrom(o, r, bone) { const b = bone || R.nearestBone(r, velOrigin(o)); if (!b) return; PH.add(o, Object.assign({}, o.phys || {}, { mode: 'hang', on: true, rig: r.id, bone: b.id, rope: o.phys && o.phys.rope || 0 })); delete o.bind; SB.commit(); SB.toast(`Hangs from ${b.name}. Move the rig to make it swing.`); }
  /** Pick a controller on the stage (or its row in the timeline), then run onPick(controller). */
  function pickController(items, onPick, title) {
    if (!tree.all().some(x => x.type === 'null' && !items.includes(x))) return SB.toast('No controller yet. Choose “New controller” or “Design a controller…” first.');
    SB.picker.start({ title: title || `Pick a controller for ${names(items)}`, test: x => x.type === 'null' && !items.includes(x), done: c => onPick(c.o) });
  }
  const driveBy = (items, c) => { items.forEach(x => { if (!(x.drv || []).some(l => l.ctrl === c.id)) C.drive(x, c); }); SB.commit(); SB.toast(`Driven by ${c.name}. Record its points in the Controls section.`); };
  /** A target for a constraint: a layer, a controller or one bone of a rig (onlyBones: just bones). */
  const consTest = (items, onlyBones) => (x, cand) => notInside(x, items) && (x.type === 'rig' ? !!(cand && cand.bone) : !onlyBones && SB.types.get(x.type).visual);
  function pickTarget(items, type, onlyBones) { SB.picker.start({ title: onlyBones ? `Pick the bone ${names(items)} should ${CONS_VERB[type]}` : `Pick what ${names(items)} should ${CONS_VERB[type]} (a layer, a controller or a bone)`, bones: true, test: consTest(items, onlyBones), done: c => C.constrainAll(items, type, c.o, c.bone) }); }
  const CONS_VERB = { follow: 'follow', track: 'move toward', lookat: 'look at', copyPos: 'copy the position of', copyRot: 'copy the rotation of', copyScale: 'copy the size of' };

  // ---------- the values a controller changes
  /** Readable names of every value a layer can key. */
  function propLabels(o) {
    const def = SB.types.get(o.type), out = { frame: 'Frame shown' };
    SB.timeline.propGroups(o).forEach(g => g.props.forEach(p => { out[p.id] = g.title === 'Transform' || g.title === def.label || g.title === 'Frames' ? p.label : `${g.title}: ${p.label}`; }));
    return out;
  }
  const differs = (a, b) => typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) > 1e-3 : a !== b;
  /** One editable value: number, color, on/off or frame. Writes like a normal edit. */
  function valueField(o, P, v, onSet) {
    const ty = TR.type(P), mul = TR.uiMul(P), set = x => { TR.set(o, P, x); SB.bump(); SB.fields.refresh(); onSet && onSet(); };
    if (ty === 'color') return W.color(v, { input: x => set(x), change: () => SB.invalidate('inspector') });
    if (ty === 'bool') { const c = h('input', { type: 'checkbox' }); c.checked = !!v; c.onchange = () => { set(c.checked); SB.invalidate('inspector'); }; return c; }
    if (P === 'frame' && o.frames) return W.select(Math.round(v), o.frames.map((f, i) => [i, f.name || 'Frame ' + (i + 1)]), x => { set(+x); SB.invalidate('inspector', 'frames'); }, 'Frame');
    return W.num(U.r2(v * mul), { step: mul > 1 ? 1 : P.startsWith('fx:') ? 0.05 : 1, label: P, change: x => { set(x / mul); SB.invalidate('inspector'); } });
  }
  /** While recording a point: what is different from the rest, editable, each with a remove button. */
  function changedList(o, L) {
    const pl = S.poseLink, rest = (L.states.find(s => s.slot === 'center') || L.states[0] || {}).p || {}, lab = propLabels(o), ig = L.ignore || [];
    if (pl.slot === 'center' && L.states.some(s => s.slot === 'center')) return note('This is the rest point: the layer as it is when the controller sits in the middle.');
    const now = C.stateVals(o, tree.localTime(o)), keys = Object.keys(now).filter(P => rest[P] !== undefined && differs(now[P], rest[P]) && !ig.includes(P));
    if (!keys.length) return note('Nothing changed yet. Move, turn or change the layer (or any value in the panel), then Save.');
    return h('div.chg', null, h('div.chg-h', null, `Changes at this point (${keys.length})`), ...keys.map(P => h('div.chg-r', null,
      h('span.chg-n', null, lab[P] || P), valueField(o, P, now[P]),
      h('small.chg-was', { title: 'Value at rest' }, typeof rest[P] === 'number' ? '← ' + U.r2(rest[P] * TR.uiMul(P)) : ''),
      W.iconBtn('x', 'Remove: keep the rest value at this point', () => { TR.set(o, P, rest[P]); SB.bump(); SB.invalidate('inspector', 'frames'); }, 'sm'))));
  }
  /** Outside recording: the values this link drives, as chips; × stops driving that value. */
  function drivenChips(o, L) {
    const lab = propLabels(o), keys = C.varying(L), ig = L.ignore || [];
    if (!keys.length && !ig.length) return null;
    return h('div.dchips', null, h('span.hint', null, 'Drives:'), ...keys.map(P => h('span.dchip', null, lab[P] || P, W.iconBtn('x', 'Stop driving this value', () => { L.ignore = ig.concat(P); L._rbf = null; SB.commit(); }, 'sm'))),
      ...ig.map(P => h('span.dchip.off', { title: 'Not driven. Click to drive it again', onclick: () => { L.ignore = ig.filter(x => x !== P); if (!L.ignore.length) delete L.ignore; SB.commit(); } }, lab[P] || P)));
  }
  function driveItem(o, L) {
    const c = tree.find(L.ctrl), pl = S.poseLink && S.poseLink.oid === o.id && S.poseLink.id === L.id ? S.poseLink : null, t = c ? C.motion(c) : 'xy', custom = c && c.ctype === 'custom' && c.points && c.points.length, grid = !custom && t !== 'x' && t !== 'y';
    const area = { top: '1/2', left: '2/1', center: '2/2', right: '2/3', bottom: '3/2' };
    const slot = s => { const has = !!C.stateOf(L, s.k), on = pl && pl.slot === s.k; return h('button.slot' + (has ? '.has' : '') + (on ? '.on' : ''), { type: 'button', style: custom ? { left: (s.u + 1) * 50 + '%', top: (s.v + 1) * 50 + '%' } : grid ? { gridArea: area[s.k] } : null, title: has ? 'Recorded. Click to edit it' : 'Click to record how the layer looks here', onclick: () => { if (!on) C.enterSlot(o, L, s.k); } }, h('i'), s.name); };
    // a designed controller shows its points where they sit in its box or circle, in its proportions
    // its size fits a small area whatever its proportions (a tall up-down line stays short); crowded points show as dots (names on hover)
    let mapEl = null;
    if (custom) {
      const MW = 200, MH = 140, ratio = C.RX(c) / Math.max(1, C.RY(c)), [w, hh] = c.lock === 'x' ? [MW, 34] : c.lock === 'y' ? [34, MH] : ratio >= MW / MH ? [MW, MW / ratio] : [MH * ratio, MH];
      const pts = C.slotsFor(c), px = pts.map(q => [(q.u + 1) / 2 * w, (q.v + 1) / 2 * hh]); let crowd = false;
      for (let i = 0; i < px.length && !crowd; i++) for (let j = i + 1; j < px.length; j++) if (Math.abs(px[i][0] - px[j][0]) < 70 && Math.abs(px[i][1] - px[j][1]) < 24) { crowd = true; break; }
      const dots = S.ctrlNames === 'off' || (S.ctrlNames !== 'on' && crowd);
      mapEl = h('div.slotsmap', null, h('div.slots.map' + (C.isCircle(c) ? '.circle' : '') + (c.lock ? '.line.line' + c.lock : '') + (dots ? '.dots' : ''), { style: { width: Math.max(34, Math.round(w)) + 'px', height: Math.max(34, Math.round(hh)) + 'px' } }, pts.map(q => { const b = slot(q); if (dots) b.title = q.name + ' · ' + b.title; return b; })),
        W.select(S.ctrlNames || 'auto', [['auto', 'Names: hide when crowded'], ['on', 'Names: always'], ['off', 'Names: never (dots)']], v => { S.ctrlNames = v; SB.prefs && SB.prefs.save && SB.prefs.save(); SB.invalidate('inspector'); }, 'Point names'));
    }
    const slots = custom ? mapEl : h('div.slots' + (grid ? '.grid' : ''), null, C.slotsFor(c).map(slot));
    const plName = pl ? (C.slotOf(c, pl.slot) || { name: pl.slot }).name : '';
    const head = h('div.hd', null,
      W.check(!L.off, '', v => { if (v) delete L.off; else L.off = true; SB.commit(); }), // this link on or off
      h('button.linkbtn', { type: 'button', title: L.off ? 'This controller link is off. Select the controller' : 'Select this controller', onclick: () => c && tree.select([c.id]) }, SB.util.h('span', { html: SB.icon('ctrl') }), (c ? c.name : 'Missing controller') + (L.off ? ' (off)' : '')),
      W.iconBtn('target', 'Use another controller: pick it on the stage', () => pickController([o], k => { L.ctrl = k.id; L._rbf = null; SB.commit(); }, `Pick another controller for ${o.name}`), 'sm'),
      W.iconBtn('x', 'Stop using this controller', () => { o.drv = o.drv.filter(x => x !== L); if (pl) S.poseLink = null; SB.commit(); }, 'sm'));
    return h('div.fxitem', null, head,
      FL.row(L, { k: 'space', label: 'Adds', type: 'seg', single: true, options: [['local', 'On top'], ['global', 'Exact']] }),
      FL.row(L, { k: 'blend', label: 'Between', type: 'seg', single: true, options: [['smooth', 'Smooth', 'Blends between the points as the controller moves'], ['hold', 'Snap', 'Jumps to the nearest point: no in-between (switches, frames, on/off)']], get: x => x.blend || 'smooth', set: (x, v) => { if (v === 'hold') x.blend = v; else delete x.blend; } }),
      o.frames && o.frames.length > 1 && C.varying(L).includes('frame') ? W.row('Frames', W.check(!!L.morph, 'Morph between frames', v => { if (v) L.morph = true; else delete L.morph; SB.commit(); }), W.info(['On: as the controller moves between two points with different drawing frames, the lines of one frame morph into the other (when they match one to one; otherwise they crossfade).', 'Off: the frame switches at the halfway point.'], 'Morph between frames')) : null,
      slots,
      pl ? [h('div.slotbar', null, h('span', null, 'Change the layer for ', h('b', null, plName)), btn('Save', C.saveSlot, 'primary'), pl.slot !== 'center' && C.stateOf(L, pl.slot) ? btn('Clear', C.clearSlot, 'ghost') : null, btn('Cancel', C.cancelSlot, 'ghost')),
        C.stateOf(L, pl.slot) && L.blend !== 'hold' ? W.row('', W.check(!!C.stateOf(L, pl.slot).snap, 'Snap to this point (no blending near it)', v => { const st = C.stateOf(L, pl.slot); if (v) st.snap = true; else delete st.snap; SB.commit(); })) : null, changedList(o, L)]
        : [note('Click a point, move or change the layer, then Save. The layer blends between the points as the controller moves.'), drivenChips(o, L)],
      FL.row(L, { label: 'Influence %', type: 'range', min: 0, max: 100, single: true, get: x => Math.round((x.amt ?? 1) * 100), set: (x, v) => x.amt = v / 100 }));
  }
  function consItem(o, c) {
    const tg = tree.find(c.target), bn = tg && tg.type === 'rig' && c.bone ? R.boneById(tg, c.bone) : null;
    return h('div.fxitem', null, h('div.hd', null, h('span', null, C.CONS[c.type]), W.iconBtn('x', 'Remove', () => { o.cons = o.cons.filter(x => x !== c); TR.drop(o, 'cn:' + c.id + ':'); SB.commit(); }, 'sm')),
      W.row('Follows', h('button.linkbtn', { type: 'button', title: tg ? 'Select it' : '', onclick: () => tg && tree.select([tg.id]) }, tg ? (bn ? `${bn.name} of ${tg.name}` : tg.name) : 'Nothing yet'), W.iconBtn('target', 'Pick what it follows on the stage (a layer, a controller or a bone)', () => SB.picker.start({ title: `Pick what ${o.name} should ${CONS_VERB[c.type]}`, bones: true, test: consTest([o]), done: k => { c.target = k.o.id; if (k.bone && k.o.type === 'rig') { c.bone = k.bone.id; if (c.at == null) c.at = c.type === 'follow' ? 0 : 1; } else { delete c.bone; delete c.at; } C.captureRest(o, c); SB.commit(); } }), 'sm')),
      bn ? W.row('Bone', W.select(c.bone, tg.bones.map(x => [x.id, x.name]), v => { c.bone = v; C.captureRest(o, c); SB.commit(); }, 'Bone'), W.seg(c.at ?? 1, [[0, 'Head', 'Its start'], [0.5, 'Middle', 'Its middle'], [1, 'Tip', 'Its tip']], v => { c.at = +v; C.captureRest(o, c); SB.commit(); })) : null,
      FL.row(o, { k: `cn:${c.id}:on`, label: 'Active', type: 'check', anim: true, single: true, text: 'Follows its target', set: (x, v) => C.setActive(x, c, v), rerender: true }),
      c.type === 'follow' ? null : FL.row(c, { k: 'space', label: 'Space', type: 'seg', single: true, options: [['local', 'Relative'], ['global', 'Exact']], set: (x, v) => { x.space = v; C.captureRest(o, x); } }),
      FL.row(o, { k: `cn:${c.id}:amt`, label: 'Influence', type: 'range', min: 0, max: 1, step: 0.05, anim: true, single: true }),
      c.type === 'track' ? FL.row(c, { k: 'radius', label: 'Range px', type: 'range', min: 0, max: 400, single: true, get: x => x.radius ?? 20 }) : null,
      c.space !== 'local' && c.type === 'copyPos' ? [FL.row(c, { k: 'ox', label: 'Offset X', type: 'num', single: true, get: x => x.ox || 0 }), FL.row(c, { k: 'oy', label: 'Offset Y', type: 'num', single: true, get: x => x.oy || 0 })] : null,
      c.space !== 'local' && (c.type === 'lookat' || c.type === 'copyRot') ? FL.row(c, { k: 'offset', label: 'Angle offset', type: 'range', min: -180, max: 180, single: true, get: x => x.offset || 0 }) : null,
      c.space !== 'local' && c.type === 'copyScale' ? FL.row(c, { k: 'k', label: 'Scale ×', type: 'num', step: 0.05, min: 0.05, single: true, get: x => x.k || 1 }) : null,
      c.type === 'follow' ? note('It moves and turns with its target, from where both are now (like being inside it). Keyframe the influence to hand it from one bone to another.') : note(c.space === 'local' ? 'Relative: it adds the target’s movement to the layer’s own. Move, turn or scale the layer on the stage to change where it sits.' : 'Exact: the target sets this value. Move, turn or scale the layer on the stage to change its offset from the target.'),
      row(c.space === 'local' || c.type === 'follow' ? btn('Count from here', () => { C.captureRest(o, c); SB.commit(); }, 'ghost') : btn('Reset offset', () => { delete c.ox; delete c.oy; delete c.offset; delete c.k; SB.commit(); }, 'ghost')));
  }

  // ---------- three sections for every layer: Rig, Physics, Controls
  /** Rig: what the layer is attached to, or buttons to attach it. */
  function rigConnect(o) {
    if (!fxable(o) || o.type === 'rig') return null; const items = tree.selected();
    if (o.bind) return bindSection(o);
    if (!R.rigs().length) return sec('Rig', [note('Draw bones with the Bones tool, then attach layers to a bone or let them bend with the rig.'), row(btn('Draw bones', () => SB.tool.set('bone'), '', 'bone'))], { key: 'rigc', closed: true });
    return sec('Rig', [row(btn('Attach to a bone', () => pickBone(items), '', 'bone'), o.type !== 'group' ? btn('Bend with a rig', () => pickBend(items), 'ghost', 'rig') : null),
      note('Attached: it moves and turns with one bone. Bending: it stretches with the bones. Click a button, then a bone or a rig on the stage.')], { key: 'rigc', closed: true });
  }
  /** Physics: its settings, or buttons to add it. */
  function physConnect(o) {
    if (o.phys) return physicsSection(o); if (!fxable(o) || o.type === 'rig') return null; const items = tree.selected();
    void items;
    return sec('Physics', [kindTiles(o, null), note('Pick one to add physics: a body falls and bounces off surfaces, a surface is what others land on, and a layer can hang from a bone and swing.')], { key: 'physc', closed: true });
  }
  /** Controls: controllers that drive the layer and constraints it follows. */
  function controlsSection(o) {
    if (!SB.types.get(o.type).visual) return null; const items = tree.selected(), drv = o.drv || [], cons = o.cons || [];
    const parts = [];
    if (drv.length) parts.push(h('div.subhead', null, 'Controllers'), ...drv.map(L => driveItem(o, L)));
    if (cons.length) parts.push(h('div.subhead', null, 'Constraints'), ...cons.map(c => consItem(o, c)));
    parts.push(row(btn(drv.length ? 'Add a controller' : 'Drive with a controller', pick('Drive with', driveItems(items)), drv.length ? 'ghost' : '', 'ctrl'), btn(cons.length ? 'Add a constraint' : 'Follow…', pick('Follow', consItems(items)), 'ghost', 'link')));
    if (!drv.length && !cons.length) parts.push(note('A controller is a handle that changes this layer: record how it looks at a few points and it blends between them. A constraint makes it follow, look at or copy another layer.'));
    else if (drv.length) parts.push(note('A point can hold position, size, rotation, opacity, colors, the shown frame, effect settings, bone angles and any other value you can keyframe.'));
    return sec('Controls', parts, { key: 'controls', closed: !drv.length && !cons.length && !S.poseLink, badge: drv.length + cons.length ? h('span.badge', null, String(drv.length + cons.length)) : null });
  }
  function attachAll(items, r, bone) { let n = 0; items.forEach(x => { if (SB.types.get(x.type).visual && R.bindTo(x, r, bone, 'follow')) n++; }); if (n) { SB.commit(); SB.toast(`${n > 1 ? n + ' layers follow' : items[0].name + ' follows'} ${bone ? R.boneById(r, bone).name : 'the nearest bone of ' + r.name}.`); } }
  /** Eyes follow: on the stage, move the pointer to set how far the eyes can look (a circle round each eye), click to confirm. */
  let eyePick = null; SB.eyePicking = () => !!eyePick; // (tutorials wait for it)
  function pickEyeRadius(items) {
    const centers = items.map(o => { const b = SB.scene.box(o); return b ? { x: (b.aabb.x0 + b.aabb.x1) / 2, y: (b.aabb.y0 + b.aabb.y1) / 2 } : null; }).filter(Boolean);
    if (!centers.length) return C.eyesFollow(items);
    const wrap = U.$('#stageWrap'), end = ok => {
      removeEventListener('pointermove', mv, true); removeEventListener('pointerdown', dn, true); removeEventListener('keydown', key, true); removeEventListener('contextmenu', cm, true);
      const r = eyePick && eyePick.r; eyePick = null; SB.dirty(); if (ok) C.eyesFollow(items, Math.round(r)); else SB.toast('Eyes follow: cancelled.');
    };
    const onStage = e => e.target && e.target.closest && e.target.closest('#stageWrap');
    const mv = e => { if (!eyePick) return; const P = SB.view.toProj(e); eyePick.r = U.clamp(Math.min(...centers.map(c => Math.hypot(P.x - c.x, P.y - c.y))), 2, 600); SB.dirty(); };
    const dn = e => { if (!onStage(e)) return; e.preventDefault(); e.stopPropagation(); mv(e); end(e.button === 0); };
    const key = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); end(false); } if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); end(true); } };
    const cm = e => { if (onStage(e)) { e.preventDefault(); e.stopPropagation(); } };
    eyePick = { centers, r: 18 }; addEventListener('pointermove', mv, true); addEventListener('pointerdown', dn, true); addEventListener('keydown', key, true); addEventListener('contextmenu', cm, true);
    SB.toast('Move the pointer away from an eye to set how far the eyes can look, then click. Esc cancels.'); SB.dirty(); void wrap;
  }
  SB.overlays.extra.push(O => {
    if (!eyePick) return; const c = O.c, d = O.dpr;
    c.save(); c.strokeStyle = '#E8730C'; c.fillStyle = 'rgba(232,115,12,.12)'; c.lineWidth = 2 * d; c.setLineDash([6 * d, 4 * d]);
    for (const p of eyePick.centers) { const [x, y] = O.P(p.x, p.y); c.beginPath(); c.arc(x, y, eyePick.r * O.sc, 0, Math.PI * 2); c.fill(); c.stroke(); c.beginPath(); c.arc(x, y, 3 * d, 0, Math.PI * 2); c.fillStyle = '#E8730C'; c.fill(); c.fillStyle = 'rgba(232,115,12,.12)'; }
    const p = eyePick.centers[0], [x, y] = O.P(p.x, p.y); c.setLineDash([]); c.font = `600 ${12 * d}px system-ui, sans-serif`; c.fillStyle = '#E8730C'; c.fillText(`${Math.round(eyePick.r)} px · click to set`, x + eyePick.r * O.sc + 8 * d, y - 6 * d);
    c.restore();
  });
  function driveItems(items) {
    const others = tree.all().some(x => x.type === 'null' && !items.includes(x));
    return [...Object.entries(C.CTYPES).filter(([k]) => k !== 'free' && k !== 'custom').map(([k, v]) => ({ label: 'New controller: ' + v.toLowerCase(), run: () => C.driveWithNew(items, k) })), { label: 'Design a controller…', run: () => SB.ctrlDesigner.open(null, items) },
      items[0].type !== 'rig' ? { label: 'Eyes follow a controller…', run: () => pickEyeRadius(items) } : null,
      others ? '-' : null, others ? { label: 'Pick a controller on the stage…', run: () => pickController(items, c => driveBy(items, c)) } : null];
  }
  function consItems(items) { return Object.entries(C.CONS).map(([k, v]) => ({ label: v, sub: [{ label: 'A new controller', run: () => C.constrainAll(items, k, null) }, { label: 'Pick a target on the stage…', run: () => pickTarget(items, k) }, R.rigs().length ? { label: 'Pick a bone of a rig…', icon: 'bone', run: () => pickTarget(items, k, true) } : null] })); }
  SB.inspector.top.push(o => o.type === 'rig' ? rigSection(o) : null, controllerSection);
  SB.inspector.extra.push(rigConnect, physConnect, controlsSection);

  // ================= menus
  // the layer menu keeps to the layer itself: rigs and controllers get their own items, other layers set up
  // bones, physics, controllers and constraints in their panel
  SB.menus.extra.push((o, items) => {
    if (o.type !== 'rig') return null;
    return { label: 'Rig', sub: [{ label: 'Add bones', run: () => SB.tool.set('bone') }, { label: 'Keyframe the pose', run: () => SB.ops.addKey() }, { label: o.showBones ? 'Show bones only when selected' : 'Always show bones', run: () => { o.showBones = !o.showBones; SB.commit(); } }, o.bones.length && { label: 'Controllers', sub: driveItems([o]) }, R.rigs().length > 1 && { label: 'Attach to another rig…', run: () => pickBone([o]) }, o.bind && { label: 'Detach', run: () => { delete o.bind; SB.commit(); } }] };
  }, (o, items) => { const sel = items || tree.selected(), cs = sel.filter(x => x.type === 'null'); return o.type === 'null' && cs.length > 1 ? { label: 'Line up the controllers', sub: [{ label: 'In a row', run: () => arrangeCtrls(cs, 'row') }, { label: 'In a column', run: () => arrangeCtrls(cs, 'column') }] } : null; },
  (o, items) => layerMenus(o, items && items.length ? items : [o]),
  o => o.type === 'null' ? { label: o.ixGrab ? 'Not interactive (viewer can’t drag it)' : 'Make it interactive (viewer can drag it)', run: () => SB.controls.setGrab(o, !o.ixGrab) } : null,
  o => o.type === 'null' ? { label: TR.now(o, 'ctrl:on') === false ? 'Turn the controller on' : 'Turn the controller off', run: () => { TR.set(o, 'ctrl:on', TR.now(o, 'ctrl:on') === false); SB.commit(); SB.toast(TR.now(o, 'ctrl:on') === false ? `${o.name} is off: its layers stay as they are.` : `${o.name} is on.`); } } : null,
  o => o.type === 'null' ? { label: 'Controller moves', sub: [...Object.entries(ctypeOptions(o)).map(([k, v]) => ({ label: ((o.ctype || 'xy') === k ? '✓ ' : '') + v, run: () => { o.ctype = k; SB.commit(); } })), '-', { label: o.points ? 'Edit the design…' : 'Design your own…', run: () => SB.ctrlDesigner.open(o) }] } : null);

  // ================= timeline rows and badges
  SB.timeline.extraGroups.push(o => {
    if (!o.phys || o.type === 'rig') return null; const P = (id, label) => ({ id, label });
    if (PH.mode(o) === 'static') return { title: 'Physics', props: [P('phys:on', 'Solid')] };
    return { title: 'Physics', props: [P('phys:on', 'Simulate'), P('phys:vx', 'Throw X'), P('phys:vy', 'Throw Y'), P('phys:weight', 'Weight'), P('phys:bounce', 'Bounce %')].concat(PH.mode(o) === 'dynamic' ? [P('phys:spin', 'Spin')] : []) };
  }, o => o.cons && o.cons.length ? { title: 'Constraints', props: o.cons.flatMap(c => [{ id: `cn:${c.id}:on`, label: C.CONS[c.type].replace(/ \(.*/, '') + ' active' }, { id: `cn:${c.id}:amt`, label: C.CONS[c.type].replace(/ \(.*/, '') + ' influence' }]) } : null);
  SB.timeline.extraBadges.push(o => SB.templates && SB.templates.isTemplateLayer(o) ? '<span class="cl-badge tmpl" title="From the screen template: change it there">template</span>' : '', o => o.bind ? `<span class="cl-badge">${o.bind.mode === 'deform' ? 'bends' : 'on bone'}</span>` : '', o => o.phys ? `<span class="cl-badge">${PH.mode(o) === 'static' ? 'surface' : 'physics'}</span>` : '', o => (o.drv && o.drv.length) || (o.cons && o.cons.length) ? '<span class="cl-badge">controlled</span>' : '', o => o.type === 'rig' ? `<span class="cl-badge">${o.bones.length} bones</span>` : '');

  // ================= bar above the stage when a rig or controller is selected
  // the bar above the stage: icons only (their names show with Settings › Button names); what each does is in its tooltip
  const ib = (icon, title, run, on, name) => { const b = W.iconBtn(icon, title, run, 'sm' + (on ? ' on' : '')); if (S.btnLabels && name) { b.classList.add('lbl'); b.appendChild(h('span', null, name)); } return b; };
  /** The rig's steps, the same at the start of the Bones, Pose and Weights bars: draw bones, pose them, paint weights, add controllers. */
  function rigSteps(r, cur) {
    if (!r || r.type !== 'rig') return null;
    const go = k => {
      if (k === 'bones') { if (r.locked) return SB.toast('The rig is locked: unlock it to change its bones.'); return SB.tool.set('bone'); }
      if (k === 'pose') return SB.tool.set('select');
      if (k === 'weights') { if (!tree.all().some(o => R.bendsWith(o, r))) return SB.toast('No layer bends with this rig yet: select a layer, then Rig › Bend with a rig.'); if (!S.selBone) S.selBone = (r.bones[0] || {}).id; S.wpaint.mode = S.wpaint.mode || 'brush'; return SB.tool.set('weights'); }
    };
    const seg = W.seg(cur, [['bones', 'Bones', 'Draw and adjust the bones'], ['pose', 'Pose', 'Turn, move and scale the bones to pose the rig'], ['weights', 'Weights', 'Paint which parts of the bending layers follow each bone']], go);
    const ctl = W.btn('Controls', e => { const q = e.currentTarget.getBoundingClientRect(); SB.menu.open(q.left, q.bottom + 4, [{ head: `Controllers for ${r.name}` }, ...driveItems([r]), '-', S.selBone && R.nSegs(R.boneById(r, S.selBone) || {}) ? { label: `Bend controller for ${(R.boneById(r, S.selBone) || {}).name}`, run: () => { const c = bendCtrl(r, R.boneById(r, S.selBone)); if (c) { SB.commit(); tree.select([c.id]); } else SB.toast('It has one already.'); } } : null].filter(Boolean)); }, { cls: 'sm ghost', icon: 'ctrl', title: 'Add a controller that poses the rig (a handle to drag)' });
    return h('span.rig-steps', null, seg, ctl, h('span.vsep'));
  }
  SB.bars.rig = o => [rigSteps(o, 'pose'), h('span.lbl', null, h('b', null, o.name)),
    W.seg(S.boneMode || 'turn', [['turn', 'rotate', 'Turn: drag a bone to turn it, a tip to pose the chain (IK), the dots of a segmented bone to bend it'], ['move', 'move', 'Move: drag a bone to move it (Shift: straight)'], ['scale', 'scale', 'Scale: drag a bone or its tip to make it longer (Shift: evenly, Alt: only wider)']], v => { S.boneMode = v; SB.invalidate('ctxbar'); }),
    h('span.vsep'),
    o.locked ? null : ib('bone', 'Add bones (J)', () => SB.tool.set('bone'), false, 'Add bones'), ib('key', 'Keyframe the pose', () => SB.ops.addKey(), false, 'Keyframe'),
    ib(o.locked ? 'lock' : 'unlock', o.locked ? 'Locked: the bones can be posed but not changed or moved. Click to unlock' : 'Lock the rig: keep posing, but its bones and place can’t change by accident', () => { o.locked = !o.locked; if (o.locked && S.tool === 'bone') SB.tool.set('select'); SB.commit(); }, o.locked, o.locked ? 'Locked' : 'Lock'),
    ib(o.showBones ? 'eye' : 'eyeOff', o.showBones ? 'Bones always show. Click to show them only when the rig is selected' : 'Bones show only when the rig is selected. Click to always show them', () => { o.showBones = !o.showBones; SB.commit(); }, o.showBones, 'Always show')];
  SB.bars.null = o => [h('span.lbl', null, h('b', null, o.name)), o.toggle || editing(o) ? null : btn('Edit layers', () => C.enterMulti(o, startPoint(o)), 'ghost', 'plus'),  W.select(o.ctype || 'xy', ctypeOptions(o), v => { o.ctype = v; SB.commit(); }, 'Controller moves'), btn('Design…', () => SB.ctrlDesigner.open(o), 'ghost', 'ctrl'), W.popSlider('Size', Math.max(C.RX(o), C.RY(o)), { min: 10, max: 600, input: v => { const k = v / Math.max(C.RX(o), C.RY(o), 1); o.rw = Math.round(C.RX(o) * k); o.rh = Math.round(C.RY(o) * k); SB.bump(); }, change: () => SB.commit() }), btn('Keyframe', () => SB.ops.addKey(), 'ghost', 'key')];

  /** Rig lock: a drag on the layer pulls its bone (the one it is on, or the nearest one for bending layers) like the tail of that bone. */
  function poseFromLayer(o, P, e = {}) {
    const rig = o.bind && tree.find(o.bind.rig); if (!rig || !rig.bones.length) return false;
    let b = o.bind.bone && R.boneById(rig, o.bind.bone);
    if (!b) { const l = R.toRig(rig, P), Q = R.poseAt(rig, S.time); let bd = Infinity; for (const x of rig.bones) { const q = Q[x.id], d = Math.hypot(q.tx - l.x, q.ty - l.y) + Math.hypot(q.hx - l.x, q.hy - l.y); if (d < bd) { bd = d; b = x; } } }
    if (!b) return false; poseDrag(rig, { bone: b, part: 'tail' }, P, e); return true;
  }
  SB.rigUI = { get labelBoxes() { return labelBoxes; }, resetRig, poseFromLayer, finishBones, ctrlHit, ctrlFromLayer, arrangeCtrls, makeToggle, rebuildToggle, showToggle };
})(window.SB);
