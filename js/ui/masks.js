/* Masks.
   A mask is a layer inside a group that cuts the other layers of that group.
   It has two settings, nothing else:
     o.isMask      'in'  show what is inside the mask shape
                   'out' show what is outside it
     o.maskVisible true: also draw the mask shape itself, always behind the masked layers
   The drawing happens in js/render/scene.js (drawGroup); this file is the
   commands and the interface. */
'use strict';
(function (SB) {
  const U = SB.util, S = SB.state, tree = SB.tree, h = U.h, W = SB.w;

  const M = SB.masks = {
    /** The mask that cuts group g at time ct (on g's clock), if any. */
    of(g, ct) { return g.children.find(c => c.isMask && !c.hidden && ct >= c.start && ct < c.start + c.dur) || null; },
    setMode(o, v) { if (v === 'out' && SB.targets && !SB.targets.allows('maskOut')) return SB.targets.blocked('Masks that show the outside'); tree.selected().concat(o).forEach(x => { if (x.isMask) x.isMask = v; }); SB.commit(); },
    setVisible(o, v) { tree.selected().concat(o).forEach(x => { if (x.isMask) x.maskVisible = !!v; }); SB.commit(); },
    release(o) { delete o.isMask; delete o.maskVisible; SB.commit(); SB.toast(`${o.name} is a normal layer again.`); },
    /** The two settings, as segmented buttons (used by the panel, the bar above the stage and the timeline menu). */
    controls(o) {
      const outOk = !SB.targets || SB.targets.allows('maskOut'), seg = W.seg(o.isMask === 'out' ? 'out' : 'in', [['in', 'Inside', 'Show what is inside the mask shape'], ['out', 'Outside', outOk ? 'Show what is outside the mask shape' : SB.targets.why()]], v => M.setMode(o, v));
      if (!outOk && o.isMask !== 'out') { const b = seg.querySelector('button:last-child'); if (b) b.disabled = true; }
      return [seg,
        W.seg(o.maskVisible ? 'on' : 'off', [['off', 'Hidden', 'The mask shape only cuts'], ['on', 'Visible', 'Also draw the mask shape, behind the masked layers']], v => M.setVisible(o, v === 'on'))];
    },
  };

  // panel: the mask section sits at the top of a mask layer's properties
  SB.inspector.top.push(o => {
    if (!o.isMask) return null; const [mode, vis] = M.controls(o), g = tree.parentOf(o);
    return SB.fields.section('Mask', [W.row('Shows', mode), W.row('Mask shape', vis),
      h('p.hint', null, `Cuts the other layers of ${g ? g.name : 'its group'}. ${o.maskVisible ? 'The shape is drawn behind them.' : 'The shape itself is not drawn.'}`),
      h('div.row.btns', null, W.btn('Stop using as mask', () => M.release(o), { cls: 'sm ghost' }))], { key: 'mask' });
  });
  // bar above the stage
  SB.bars.mask = o => { const [mode, vis] = M.controls(o); return [h('span.lbl', null, h('b', null, 'Mask')), mode, h('span.lbl', null, 'Shape'), vis]; };
  // menu
  // the Mask item keeps its place in the layer menu (right after Effects), masked or not: js/ui/menus.js
  SB.menus.maskItem = (o, items) => SB.types.get(o.type).fx && o.type !== 'rig' ? { label: 'Mask', sub: o.isMask
    ? [{ label: (o.isMask !== 'out' ? '✓ ' : '') + 'Show inside', run: () => M.setMode(o, 'in') }, { label: (o.isMask === 'out' ? '✓ ' : '') + 'Show outside', disabled: o.isMask !== 'out' && SB.targets && !SB.targets.allows('maskOut'), run: () => M.setMode(o, 'out') }, '-',
      { label: (o.maskVisible ? '✓ ' : '') + 'Mask shape visible', run: () => M.setVisible(o, !o.maskVisible) }, '-', { label: 'Stop using as mask', run: () => M.release(o) }]
    : [{ label: items.length > 1 ? 'Mask with the top layer' : 'Use as mask for the layer below', disabled: SB.targets && !SB.targets.allows('mask'), run: () => SB.ops.makeMask() }] } : null;
  // stage: a dashed outline of the mask area whenever you work on something it cuts
  SB.overlays.extra.push(O => {
    if (S.playing) return; const sel = tree.sel(); if (!sel) return;
    const groups = new Set([sel.type === 'group' ? sel : null, ...tree.ancestors(sel)].filter(Boolean));
    for (const g of groups) {
      const mk = M.of(g, tree.parentTime(g.children[0] || g, S.time)); if (!mk || mk === sel || !tree.inRange(mk)) continue; const b = SB.scene.box(mk); if (!b) continue;
      const c = O.c, d = O.dpr; c.save(); c.strokeStyle = '#FF4F8B'; c.lineWidth = 1.5 * d; c.setLineDash([6 * d, 4 * d]); c.beginPath(); b.pts.forEach((p, i) => { const [x, y] = O.P(p.x, p.y); i ? c.lineTo(x, y) : c.moveTo(x, y); }); c.closePath(); c.stroke(); c.restore();
    }
  });
})(window.SB);
