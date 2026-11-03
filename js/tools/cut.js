/* The Cut tool (C). While it is on:
     - in the timeline, a line follows the pointer over the clips and a click cuts the clip there
     - on the stage, clicking a layer cuts it at the playhead
   The pointer becomes a pair of scissors. Cutting keeps one layer with several parts
   (o.parts), like a cut clip in a video editor. The scissors button in the timeline
   bar and the S key cut the selected layers at the playhead without this tool. */
'use strict';
(function (SB) {
  const S = SB.state, tree = SB.tree;
  // a scissors pointer, white-edged so it shows on dark and light backgrounds
  const svg = stroke => `<g fill="none" stroke="${stroke}" stroke-linecap="round" stroke-linejoin="round" stroke-width="${stroke === '#fff' ? 4.5 : 1.8}"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4L8.1 15.9M14.5 14.5L20 20M8.1 8.1L12 12"/></g>`;
  SB.CUT_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">${svg('#fff')}${svg('#1d1b2e')}</svg>`)}") 12 12, crosshair`;
  document.documentElement.style.setProperty('--cut-cursor', SB.CUT_CURSOR);

  /** The layer a click picks at the level you are working in. */
  function pick(P) {
    const leaf = SB.scene.hit(P), ctx = tree.ctx();
    for (let x = leaf; x; x = tree.parentOf(x)) if ((tree.parentOf(x) || null) === ctx) return x;
    return leaf;
  }
  // The Hand tool (H): drag to move around the stage, like the middle mouse button or holding Space.
  // The stage does the panning (js/ui/stage.js); the tool only switches it on.
  SB.tools.add({
    id: 'hand', label: 'Hand', icon: 'hand', tip: 'Move around: drag to pan the view (also middle mouse, or hold Space)', cursor: 'grab',
    bar() { const W = SB.w, h = SB.util.h; return [h('span.lbl', null, h('b', null, 'Hand')), W.btn('Fit', () => SB.view.reset(), { cls: 'sm', icon: 'fit', title: 'Fit the stage to the window' }), W.btn('100%', () => SB.view.zoomCenter && SB.view.zoomCenter(1 / (SB.view.k() || 1)), { cls: 'sm ghost', title: 'Actual size' }), W.btn('Done', () => SB.tool.set('select'), { cls: 'sm ghost' })]; },
  });
  SB.tools.add({
    id: 'cut', label: 'Cut', icon: 'split', tip: 'Cut clips: click a clip in the timeline where it should be cut, or a layer on the stage to cut it at the playhead', cursor: SB.CUT_CURSOR,
    enter() { SB.invalidate('timeline', 'transport'); },
    leave() { SB.invalidate('timeline', 'transport'); },
    down(P) {
      const o = pick(P); if (!o) return;
      if (!tree.inRange(o)) { tree.select([o.id]); return SB.toast('Move the playhead over this layer’s clip to cut it here.'); }
      tree.select([o.id]); if (SB.ops.cutAt(o, tree.parentTime(o, S.time))) { SB.commit(); SB.toast(`Cut ${o.name} at the playhead.`); }
    },
    bar() {
      const W = SB.w, h = SB.util.h;
      return [h('span.lbl', null, h('b', null, 'Cut')), h('span.lbl', null, 'Click a clip in the timeline to cut it there, or a layer here to cut it at the playhead.'),
        W.btn('Cut selected at playhead', () => SB.ops.split(), { cls: 'sm', icon: 'split' }), W.btn('Done', () => SB.tool.set('select'), { cls: 'sm ghost' })];
    },
  });
})(window.SB);
