/* Tool framework. A tool is registered with SB.tools.add({...}):
     id, label, icon, key (shortcut), tip
     cursor               CSS cursor on the stage
     down/move/up(P, e)   pointer in project coordinates
     hover(P, e)          pointer moving with no button
     dbl(P, e)            double click / double tap
     cancel()             a gesture took over: undo whatever the drag started
     overlay(O)           draw tool-specific guides (see SB.view.draw for O)
     bar()                elements for the context bar above the stage
     enter() / leave()    when the tool becomes active / inactive
   The stage routes pointers to the active tool through SB.tool. */
'use strict';
(function (SB) {
  const U = SB.util, S = SB.state, tree = SB.tree, X = SB.xf;
  const cur = () => SB.tools.get(S.tool) || SB.tools.get('select');
  const DRAW_TOOLS = new Set(['brush', 'fillbrush', 'eraser', 'pen', 'fill', 'points', 'smooth', 'width', 'pull']);

  // Shift adds to the selection: over something that can be added (a layer, a part, a motion path) the pointer gets a plus
  const ADD_CURSOR = `url("data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M4 2v16l4.5-4 3 6.5 2.6-1.2-3-6.3H17z" fill="#1d1b2e" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/><circle cx="18" cy="18" r="5" fill="#5B3DF5" stroke="#fff" stroke-width="1.2"/><path d="M18 15.3v5.4M15.3 18h5.4" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/></svg>')}") 4 2, copy`;
  document.documentElement.style.setProperty('--add-cursor', ADD_CURSOR);
  const shiftMark = e => document.body.classList.toggle('shift-add', !!e.shiftKey);
  addEventListener('keydown', shiftMark); addEventListener('keyup', shiftMark); addEventListener('blur', () => document.body.classList.remove('shift-add'));
  function addCursor(P, e) {
    const w = U.$('#stage'), back = () => { if (w.style.cursor === ADD_CURSOR) w.style.cursor = (SB.tools.get(S.tool) || {}).cursor || 'default'; };
    if (!e || !e.shiftKey || S.playing) return back();
    let hit = false;
    if (S.tool === 'select') hit = !!SB.scene.hit(P) || !!(SB.motionPath && SB.motionPath.hit(P));
    else if (S.tool === 'points') { const o = SB.tree.sel(); if (o && SB.types.get(o.type).frames) { const sp = SB.tool.space(o), l = sp.Minv.transformPoint(U.pt(P.x, P.y)); hit = !!SB.raster.strokeAt(sp.fr, l, 9 / (SB.view.k() * sp.ws)); } if (!hit) hit = !!SB.scene.hit(P); }
    if (hit) w.style.cursor = ADD_CURSOR; else back();
  }

  const T = SB.tool = {
    drag: null,
    /** Shift is held (kept up to date by key and pointer events, for previews that have no event). */
    shift: false,
    /** Shift keeps a line straight: P moves only along the axis (level or upright) it is furthest along from a. */
    straight(a, P, e) {
      if (!a || !(e && 'shiftKey' in e ? e.shiftKey : T.shift)) return P;
      return Math.abs(P.x - a.x) >= Math.abs(P.y - a.y) ? { x: P.x, y: a.y } : { x: a.x, y: P.y };
    },
    cur,
    set(id) {
      if (!SB.tools.has(id)) return; const want = SB.tools.get(id);
      if (want.feature && SB.targets && !SB.targets.allows(want.feature)) return SB.targets.blocked(want.label);
      const old = cur();
      if (old.id !== id && old.leave) old.leave();
      S.tool = id; const t = cur(); if (t.enter) t.enter();
      U.$('#stage').style.cursor = t.cursor || 'default'; U.$('#stageWrap').dataset.tool = id;
      SB.invalidate('rail', 'ctxbar'); SB.dirty();
    },
    // while pick mode is on (SB.picker), clicks pick a target instead of going to the tool
    // while the interactive player plays, the stage is the thing you click and hover (js/ui/interact.js)
    down(P, e) { if (S.ixPlay) return SB.ix.pointer('down', P, e); T.drag = null; if (S.picking) { T.picked = true; return SB.picker.down(P, e); } T.picked = false; cur().down && cur().down(P, e); },
    move(P, e) { if (S.ixPlay) return SB.ix.pointer('move', P, e); if (T.picked) return; cur().move && cur().move(P, e); },
    up(P, e) { if (S.ixPlay) return SB.ix.pointer('up', P, e); if (T.picked) { T.picked = false; return; } cur().up && cur().up(P, e); T.drag = null; SB.dirty(); },
    hover(P, e) { if (S.ixPlay) return SB.ix.pointer('move', P, e); if (S.picking) return SB.picker.hover(P, e); cur().hover && cur().hover(P, e); addCursor(P, e); },
    dbl(P, e) { if (S.ixPlay) return; cur().dbl && cur().dbl(P, e); },
    cancel() { cur().cancel && cur().cancel(); T.drag = null; SB.dirty(); },
    contextMenu(e) { if (S.ixPlay) return; if (S.picking) return SB.picker.cancel(); SB.menus.stage(e); },

    /** The drawing layer to draw on: the selection if it has frames, the layer under P, or a new one. */
    drawTarget(P, create) {
      let o = tree.sel(); const ok = x => x && SB.types.get(x.type).frames && !tree.locked(x) && !tree.hidden(x);
      if (ok(o)) return o;
      if (P) { const hit = SB.scene.hit(P); if (ok(hit)) { tree.select([hit.id]); return hit; } }
      if (!create) return null;
      const parent = o && o.type === 'group' && !tree.locked(o) ? o : null;
      o = tree.make('draw', parent ? { x: 0, y: 0 } : {}); o._fresh = true;
      (parent ? parent.children : S.objects).unshift(o); tree.reindex(); tree.select([o.id]);
      return o;
    },
    /** Info about drawing into o at the current frame: local coords, scale. */
    space(o) { const M = X.world(o); return { o, M, Minv: M.inverse(), ws: U.matScale(M), fi: SB.frames.currentIndex(o), fr: SB.frames.current(o) }; },
    /** Fresh drawing layers get their pivot centered on what was drawn. */
    centerFresh(o) { if (!o._fresh) return; delete o._fresh; const b = SB.scene.bounds(o); if (b) X.setOrigin(o, (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2); },

    /** While drawing, show the layer without effects so strokes land where you draw. */
    noFxSet() {
      if (S.textEdit && !S.playing) { const t = tree.find(S.textEdit); if (t) return new Set([t.id, ...tree.ancestors(t).map(a => a.id)]); }
      if (S.playing || !DRAW_TOOLS.has(S.tool) || !S.sel) return null;
      const o = tree.sel(); return o ? new Set([o.id, ...tree.ancestors(o).map(a => a.id)]) : null;
    },
    /** While drawing, keep the selected layer visible even outside its clip. */
    showSelSet() { if (S.playing || !DRAW_TOOLS.has(S.tool)) return null; const o = tree.sel(); if (!o || !SB.types.get(o.type).frames) return null; return new Set([o.id, ...tree.ancestors(o).map(a => a.id)]); },
  };
  // Shift for the straight-line previews (pen and bones draw theirs while the pointer just hovers)
  const shiftOf = e => { if (T.shift !== e.shiftKey) { T.shift = e.shiftKey; if (S.pen || S.boneDraft || T.drag) SB.dirty(); } };
  addEventListener('keydown', shiftOf, true); addEventListener('keyup', shiftOf, true); addEventListener('pointermove', shiftOf, true);
  addEventListener('blur', () => { T.shift = false; });
})(window.SB);
