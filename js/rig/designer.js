/* The controller designer: draw your own controller.
   Pick a box or a circle, set its width and height, choose whether the knob moves both ways,
   only left–right or only up–down, and place key points on it (click to add, drag to move,
   name them). Save, then record how a layer looks at each point in its Controls section,
   the same way as with the ready-made controllers.
   The result is a controller with ctype 'custom', cshape 'box' | 'circle', rw / rh (half width
   and half height in px), lock null | 'x' | 'y' and points [{ k, name, u, v }] (u, v from -1 to 1). */
'use strict';
(function (SB) {
  const U = SB.util, tree = SB.tree, h = U.h, W = SB.w, C = SB.controls;
  const AREA = 300; // px of the longest side of the drawing area

  function open(ctrl, items = []) {
    const st = ctrl && ctrl.ctype === 'custom'
      ? { name: ctrl.name, shape: ctrl.cshape || 'box', rw: C.RX(ctrl), rh: C.RY(ctrl), lock: ctrl.lock || '', points: U.deep(ctrl.points || []) }
      : ctrl ? { name: ctrl.name, shape: 'box', rw: C.RX(ctrl), rh: C.RY(ctrl), lock: ctrl.ctype === 'x' || ctrl.ctype === 'y' ? ctrl.ctype : '', points: C.slotsFor(ctrl).map(q => ({ k: q.k, name: q.name, u: q.u, v: q.v })) } // starts as it looks now: a left–right one stays left–right, with its points (and the poses recorded on them)
      : { name: `Controller ${tree.all().filter(o => o.type === 'null').length + 1}`, shape: 'box', rw: 100, rh: 100, lock: '', points: [{ k: 'center', name: 'Center', u: 0, v: 0 }] };
    let selK = null, snap = true;
    const area = h('div.cd-area'), side = h('div.cd-side'), nameIn = h('input', { type: 'text', value: st.name, 'aria-label': 'Controller name' }); nameIn.oninput = () => st.name = nameIn.value;
    const clampUV = (u, v) => {
      if (st.lock === 'x') v = 0; if (st.lock === 'y') u = 0;
      if (snap) { u = Math.round(u * 4) / 4; v = Math.round(v * 4) / 4; }
      if (st.shape === 'circle') { const d = Math.hypot(u, v); if (d > 1) { u /= d; v /= d; } }
      return [U.r2(U.clamp(u, -1, 1)), U.r2(U.clamp(v, -1, 1))];
    };
    const uvAt = e => { const r = area.getBoundingClientRect(); return clampUV((e.clientX - r.left) / r.width * 2 - 1, (e.clientY - r.top) / r.height * 2 - 1); };
    const fixPoints = () => st.points.forEach(q => [q.u, q.v] = clampUV(q.u, q.v));
    /** The area has the controller's proportions. */
    function sizeArea() {
      const room = area.parentElement && area.parentElement.clientWidth ? area.parentElement.clientWidth - 32 : AREA, k = Math.min(AREA, room) / Math.max(st.lock === 'y' ? st.rh : st.lock === 'x' ? st.rw : Math.max(st.rw, st.rh), 1);
      // a controller that moves one way only is a line, not a box
      area.style.width = (st.lock === 'y' ? 44 : Math.max(40, st.rw * k)) + 'px'; area.style.height = (st.lock === 'x' ? 44 : Math.max(40, st.rh * k)) + 'px';
    }
    function draw() {
      area.className = 'cd-area' + (st.shape === 'circle' ? ' circle' : '') + (st.lock ? ' lock' + st.lock : ''); sizeArea();
      area.replaceChildren(h('i.cd-cross'), ...st.points.map((p, i) => h('button.cd-pt' + (p.k === selK ? '.on' : ''), { type: 'button', dataset: { k: p.k }, style: { left: (p.u + 1) * 50 + '%', top: (p.v + 1) * 50 + '%' }, title: p.name }, h('b', null, String(i + 1)), h('span', null, p.name))));
      const p = st.points.find(x => x.k === selK);
      const pname = p ? h('input', { type: 'text', value: p.name, 'aria-label': 'Point name' }) : null; if (pname) pname.oninput = () => { p.name = pname.value; area.querySelector(`[data-k="${p.k}"] span`).textContent = p.name; };
      const size = (key, label) => W.range(st[key], { min: 10, max: 600, label, input: v => { st[key] = v; sizeArea(); } });
      side.replaceChildren(...[
        W.row('Name', nameIn),
        W.row('Shape', W.seg(st.shape, [['box', 'Box'], ['circle', 'Circle']], v => { st.shape = v; fixPoints(); draw(); })),
        W.row('Moves', W.seg(st.lock || 'both', [['both', 'Both ways', 'The knob moves anywhere inside'], ['x', 'Left–right', 'The knob moves only horizontally'], ['y', 'Up–down', 'The knob moves only vertically']], v => { st.lock = v === 'both' ? '' : v; fixPoints(); draw(); })),
        st.lock !== 'y' ? W.row('Width px', size('rw', 'Width')) : null,
        st.lock !== 'x' ? W.row('Height px', size('rh', 'Height')) : null,
        W.row('', W.check(snap, 'Snap points to a grid', v => { snap = v; })),
        h('p.hint', null, 'Click inside to add a key point, drag points to move them. At each point you will record how your layers look.'),
        p ? h('div.cd-point', null, h('b', null, `Point ${st.points.indexOf(p) + 1}`), W.row('Point name', pname), h('div.row.btns', null, W.btn('Delete point', () => { st.points = st.points.filter(x => x !== p); selK = null; draw(); }, { cls: 'sm ghost', icon: 'trash' })))
          : h('p.hint', null, `${st.points.length} key points. Click one to rename it; Delete removes it.`)].filter(Boolean));
    }
    // add and drag points
    area.addEventListener('pointerdown', e => {
      e.preventDefault(); const b = e.target.closest('.cd-pt'); let p = b && st.points.find(x => x.k === b.dataset.k);
      if (!p) { const [u, v] = uvAt(e); p = { k: 'p' + U.uid(), name: `Point ${st.points.length + 1}`, u, v }; st.points.push(p); }
      selK = p.k; draw(); area.setPointerCapture(e.pointerId);
      const mv = ev => { [p.u, p.v] = uvAt(ev); const el = area.querySelector(`[data-k="${p.k}"]`); if (el) { el.style.left = (p.u + 1) * 50 + '%'; el.style.top = (p.v + 1) * 50 + '%'; } };
      const up = () => { area.removeEventListener('pointermove', mv); area.removeEventListener('pointerup', up); };
      area.addEventListener('pointermove', mv); area.addEventListener('pointerup', up);
    });
    const save = () => {
      if (st.points.length < 2) return SB.toast('Add at least two key points.');
      let c = ctrl; if (!c) c = C.make(items[0]);
      Object.assign(c, { name: st.name.trim() || c.name, ctype: 'custom', cshape: st.shape, rw: st.rw, rh: st.rh, range: Math.max(st.rw, st.rh), points: st.points }); if (st.lock) c.lock = st.lock; else delete c.lock;
      // states follow their points; states of deleted points are dropped (the rest state stays)
      // states follow their points; states of deleted points are dropped. The first pose (Center) moves to the nearest point
      // that has no pose yet when the middle point is removed, so a two-point controller blends only between its two ends.
      tree.all().forEach(o => (o.drv || []).forEach(L => { if (L.ctrl !== c.id) return;
        const kept = L.states.filter(s => { const q = st.points.find(x => x.k === s.slot); if (!q) return false; s.u = q.u; s.v = q.v; return true; });
        const rest = L.states.find(s => s.slot === 'center' && !st.points.some(x => x.k === 'center')), free = st.points.filter(q => !kept.some(s => s.slot === q.k)).sort((a, b) => Math.hypot(a.u, a.v) - Math.hypot(b.u, b.v))[0];
        if (rest && free) kept.push(Object.assign(rest, { slot: free.k, u: free.u, v: free.v }));
        L.states = kept; L._rbf = null; }));
      // no middle point: the knob rests on the nearest point instead of between two of them
      if (!st.points.some(q => Math.hypot(q.u, q.v) < 1e-3) && !SB.tracks.animated(c, 'x') && !SB.tracks.animated(c, 'y')) {
        const rx = c.rx ?? c.x, ry = c.ry ?? c.y, u0 = (c.x - rx) / C.RX(c), v0 = (c.y - ry) / C.RY(c), q = st.points.slice().sort((a, b) => Math.hypot(a.u - u0, a.v - v0) - Math.hypot(b.u - u0, b.v - v0))[0];
        if (Math.hypot(u0 - q.u, v0 - q.v) > 1e-3) { c.rx = rx; c.ry = ry; c.x = U.r1(rx + q.u * C.RX(c)); c.y = U.r1(ry + q.v * C.RY(c)); }
      }
      if (!ctrl) items.forEach(o => C.drive(o, c));
      dlg.close(); tree.select([items[0] ? items[0].id : c.id]); SB.commit();
      SB.toast(items.length || C.usersOf(c).length ? `${c.name} saved. In the Controls section, click a point, change the layer, then Save.` : `${c.name} saved. Select a layer and choose Controllers › Pick a controller.`);
    };
    const saveBtn = W.btn('Save controller', save, { cls: 'primary' }); saveBtn.setAttribute('autofocus', '');
    const dlg = SB.dialog.sheet([h('h2', null, ctrl && ctrl.ctype === 'custom' ? `Edit ${ctrl.name}` : 'Design a controller'), h('div.cd', null, h('div.cd-stage', null, area), side),
      h('div.sheet-actions', null, W.btn('Cancel', () => dlg.close(), { cls: 'ghost' }), saveBtn)], { size: 'wide' });
    draw();
    // Delete / Backspace removes the selected point (not while typing a name)
    const onKey = e => {
      if (!area.isConnected) return removeEventListener('keydown', onKey, true);
      if ((e.key !== 'Delete' && e.key !== 'Backspace') || !selK || (e.target.closest && e.target.closest('input,textarea'))) return;
      e.preventDefault(); e.stopPropagation(); st.points = st.points.filter(x => x.k !== selK); selK = null; draw();
    };
    addEventListener('keydown', onKey, true);
  }
  SB.ctrlDesigner = { open };
})(window.SB);
