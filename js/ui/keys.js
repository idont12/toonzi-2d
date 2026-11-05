/* Keyboard shortcuts. Every action has a default; users rebind them in Settings,
   or pick a preset that matches another editor. To add a shortcut, add an entry to ACTIONS. */
'use strict';
(function (SB) {
  const U = SB.util, S = SB.state, tree = SB.tree, ops = SB.ops;
  const sel = () => tree.sel();
  /** Arrows move what is selected: points (Edit points), else the selected layers. With nothing to move, ← → step one frame. */
  const nudge = (dx, dy) => { if (S.tool === 'points' && S.selPts.length && SB.pathEdit && SB.pathEdit.nudgePts(dx, dy)) return; if (nudgeDrawing(dx, dy)) return; if (nudgeLayers(dx, dy)) return; if (dx) SB.time.step(Math.sign(dx)); };
  /** Edit points (and Select with "This frame" on) move the drawing, not the layer: the selected parts, or everything on the frame shown. */
  const nudgeDrawing = (dx, dy) => {
    const o = tree.sel(); if (!o || o.type !== 'draw' || tree.selected().length !== 1 || tree.locked(o) || !tree.inRange(o)) return false;
    const pts = S.tool === 'points'; if (!pts && !(S.tool === 'select' && S.recolorAll === false)) return false;
    const sp = SB.tool.space(o), fr = sp.fr, list = pts && S.selStrokes.size ? fr.strokes.filter(x => S.selStrokes.has(x)) : fr.strokes.slice(); if (!list.length) return false;
    const a = sp.Minv.transformPoint(U.pt(0, 0)), b = sp.Minv.transformPoint(U.pt(dx, dy)), M = new DOMMatrix().translate(b.x - a.x, b.y - a.y);
    list.forEach(x => { const n = SB.paths.transformStroke(x, M, 1); for (const k of Object.keys(x)) delete x[k]; Object.assign(x, n); SB.paths.touch(x); });
    SB.raster.refreshFills(fr, new Set(list.filter(x => !x.f)), false); SB.commit(); return true;
  };
  const nudgeLayers = (dx, dy) => { const items = tree.selected().filter(x => SB.types.get(x.type).visual && tree.inRange(x) && !x.rigLock); if (!items.length) return false; items.forEach(x => { const PI = SB.xf.parentWorld(x).inverse(), a = PI.transformPoint(U.pt(0, 0)), b = PI.transformPoint(U.pt(dx, dy)), tr = SB.tracks.transform(x, tree.localTime(x)); SB.tracks.setMany(x, { x: U.r1(tr.x + b.x - a.x), y: U.r1(tr.y + b.y - a.y) }); }); SB.commit(); return true; };

  // [group, [id, label, default key(s), run]]
  const ACTIONS = [
    ['Playback', [
      ['play', 'Play or pause', 'Space', null],
      ['prevFrame', 'Back one frame', 'Shift+ArrowLeft', () => SB.time.step(-1)], ['nextFrame', 'Forward one frame', 'Shift+ArrowRight', () => SB.time.step(1)],
      ['prevDrawing', 'Previous drawing frame', ',', () => SB.frames.act('prev')], ['nextDrawing', 'Next drawing frame', '.', () => SB.frames.act('next')],
      ['home', 'Go to start', 'Home', () => { SB.time.pause(); SB.time.set(0); }], ['end', 'Go to end', 'End', () => { SB.time.pause(); SB.time.set(S.project.duration); }],
      ['record', 'Record motion', 'R', () => SB.record.start()]]],
    ['Tools', [
      ['tSelect', 'Select', 'V', () => SB.tool.set('select')], ['tPoints', 'Points', 'A', () => SB.tool.set('points')], ['tBrush', 'Brush', 'B', () => SB.tool.set('brush')], ['tPen', 'Pen', 'P', () => SB.tool.set('pen')],
      ['tEraser', 'Eraser', 'E', () => SB.tool.set('eraser')], ['tFill', 'Fill', 'G', () => SB.tool.set('fill')], ['tFillBrush', 'Fill brush', 'Shift+G', () => SB.tool.set('fillbrush')], ['tPixel', 'Pixel brush', 'Shift+B', () => SB.tool.set('pixel')], ['tGradient', 'Gradient', 'Shift+F', () => SB.tool.set('gradient')], ['tSmooth', 'Smooth', 'O', () => SB.tool.set('smooth')], ['tWidth', 'Width', 'W', () => SB.tool.set('width')], ['tPull', 'Pull', 'U', () => SB.tool.set('pull')],
      ['tBone', 'Bones', 'J', () => SB.tool.set('bone')], ['tHand', 'Hand (move around)', 'H', () => SB.tool.set('hand')], ['tScreen', 'Screens', 'M', () => SB.tool.set('screen')], ['addText', 'Add text', 'T', () => SB.add.text()],
      ['smaller', 'Brush smaller', '[', () => { if (S.tool === 'eraser') S.eraser = Math.max(4, S.eraser - 4); else S.brush.size = Math.max(1, S.brush.size - 2); SB.invalidate('ctxbar'); }],
      ['bigger', 'Brush bigger', ']', () => { if (S.tool === 'eraser') S.eraser = Math.min(160, S.eraser + 4); else S.brush.size = Math.min(80, S.brush.size + 2); SB.invalidate('ctxbar'); }]]],
    ['Edit', [
      ['undo', 'Undo', 'Ctrl+Z', SB.undo], ['redo', 'Redo', ['Ctrl+Shift+Z', 'Ctrl+Y'], SB.redo],
      ['copy', 'Copy', 'Ctrl+C', () => ops.copy()], ['cut', 'Cut', 'Ctrl+X', () => ops.cut()], ['paste', 'Paste', 'Ctrl+V', () => ops.paste()],
      ['dup', 'Duplicate', 'Ctrl+D', () => ops.duplicate()], ['del', 'Delete', ['Delete', 'Backspace'], () => del()], ['all', 'Select all', 'Ctrl+A', () => tree.select(S.objects.map(o => o.id))],
      ['group', 'Group', 'Ctrl+G', () => ops.group()], ['ungroup', 'Ungroup', 'Ctrl+Shift+G', () => ops.ungroup()], ['join', 'Combine into one drawing', 'Ctrl+E', () => ops.combine()],
      ['partsCopy', 'Selected parts to a new layer (copy); a layer: duplicate', 'Ctrl+J', () => { if (S.tool === 'points' && S.selStrokes.size) ops.partsToLayer(true); else ops.duplicate(); }],
      ['partsMove', 'Selected parts to a new layer (move out)', 'Ctrl+Shift+J', () => { if (S.tool === 'points' && S.selStrokes.size) ops.partsToLayer(false); else SB.toast('Select parts in Edit points first.'); }],
      ['save', 'Save project', 'Ctrl+S', () => SB.project.save()], ['open', 'Open project', 'Ctrl+O', () => SB.project.openPicker()]]],
    ['Frames', [['dupFrame', 'Duplicate the frame', 'Shift+D', () => SB.framesBar.dup()], ['copyFrame', 'Copy the frame’s drawing', 'Ctrl+Alt+C', () => SB.framesBar.copy()], ['pasteFrame', 'Paste a drawing as a new frame', 'Ctrl+Alt+V', () => SB.framesBar.paste('after')]]],
    ['Timeline', [['split', 'Cut at the playhead', 'S', () => ops.split()], ['razor', 'Cut tool (click clips to cut)', 'C', () => SB.tool.set(S.tool === 'cut' ? 'select' : 'cut')], ['shot', 'Make a shot from the selection', 'Ctrl+Shift+S', () => ops.makeShot()], ['key', 'Add keyframe', 'K', () => ops.addKey()], ['blankKey', 'Blank keyframe (an empty frame from here)', 'Shift+K', () => SB.frames.blankKey()], ['prevKey', 'Previous keyframe', ['Alt+ArrowLeft', 'Shift+ArrowUp'], () => ops.goKey(-1)], ['nextKey', 'Next keyframe', ['Alt+ArrowRight', 'Shift+ArrowDown'], () => ops.goKey(1)], ['keySnap', 'Playhead snaps to keyframes on/off', 'Alt+K', () => { S.keySnap = S.keySnap === false; SB.prefs.save(); SB.invalidate('transport'); SB.toast(S.keySnap ? 'The playhead snaps to keyframes.' : 'The playhead moves freely.'); }], ['editText', 'Type in the selected text', 'Enter', () => { const o = sel(); if (o && o.type === 'text') SB.textEdit.start(o); }]]],
    ['View', [['zoomIn', 'Zoom in', 'Ctrl+=', () => SB.view.zoomCenter(1.25)], ['zoomOut', 'Zoom out', 'Ctrl+-', () => SB.view.zoomCenter(0.8)], ['zoomFit', 'Fit to screen', 'Ctrl+0', () => SB.view.reset()], ['focus', 'Big stage', 'F', () => SB.layout.focus()], ['snap', 'Snapping and guides on/off', ';', () => SB.snapToggle()], ['panel', 'Properties panel', 'I', () => SB.layout.toggleInspector()]]],
    ['Move', [['moveL', 'Move left 1 px', 'ArrowLeft', () => nudge(-1, 0)], ['moveR', 'Move right 1 px', 'ArrowRight', () => nudge(1, 0)], ['moveU', 'Move up 1 px', 'ArrowUp', () => nudge(0, -1)], ['moveD', 'Move down 1 px', 'ArrowDown', () => nudge(0, 1)],
      ['nudgeL', 'Move left 10 px', 'Ctrl+ArrowLeft', () => nudge(-10, 0)], ['nudgeR', 'Move right 10 px', 'Ctrl+ArrowRight', () => nudge(10, 0)], ['nudgeU', 'Move up 10 px', 'Ctrl+ArrowUp', () => nudge(0, -10)], ['nudgeD', 'Move down 10 px', 'Ctrl+ArrowDown', () => nudge(0, 10)]]],
  ];
  const ACT = {}; ACTIONS.forEach(([, l]) => l.forEach(([id, label, def, run]) => ACT[id] = { id, label, def: [].concat(def), run }));
  const PRESETS = {
    default: { label: 'Toonzi 2D', map: {} },
    premiere: { label: 'Adobe Premiere Pro', map: { split: ['Ctrl+K'], key: ['Ctrl+Alt+K'], zoomIn: ['='], zoomOut: ['-'], zoomFit: ['\\'], record: ['Shift+R'] } },
    aftereffects: { label: 'Adobe After Effects', map: { split: ['Ctrl+Shift+D'], tPen: ['G'], tFill: ['Shift+G'], tBrush: ['Ctrl+B'], key: ['Alt+Shift+K'], prevFrame: ['PageUp'], nextFrame: ['PageDown'], zoomIn: ['.'], zoomOut: [','], prevDrawing: ['Ctrl+ArrowLeft'], nextDrawing: ['Ctrl+ArrowRight'] } },
    animate: { label: 'Adobe Animate', map: { key: ['F6'], blankKey: ['F7'], prevDrawing: [','], nextDrawing: ['.'], tPen: ['P'], tFill: ['K'], split: ['Shift+S'], tPoints: ['A'] } },
  };
  S.keymap = {}; S.keyPreset = 'default';
  const binding = id => S.keymap[id] !== undefined ? S.keymap[id] : ACT[id].def;
  const pretty = c => (c || '').replace('ArrowLeft', '←').replace('ArrowRight', '→').replace('ArrowUp', '↑').replace('ArrowDown', '↓').replace('Ctrl', /Mac/.test(navigator.platform) ? '⌘' : 'Ctrl');
  function comboOf(e) {
    let k = e.key; if (['Control', 'Shift', 'Alt', 'Meta'].includes(k)) return null; if (k === ' ') k = 'Space'; else if (k.length === 1) k = k.toUpperCase(); if (k === '+') k = '=';
    return [(e.ctrlKey || e.metaKey) && 'Ctrl', e.altKey && 'Alt', e.shiftKey && (k.length > 1 || /[A-Z]/.test(k)) && 'Shift', k].filter(Boolean).join('+');
  }
  function del() {
    if (S.selKeys.size) return ops.deleteKeys();
    const sp = S.selPart && tree.find(S.selPart.id); if (sp && sp.id === S.sel && sp.parts && sp.parts[S.selPart.i]) return ops.removePart(sp, S.selPart.i);
    if (S.tool === 'points' && S.selPts.length && SB.pathEdit.deletePts()) return;
    if (S.tool === 'points' && S.selStrokes.size) return SB.tools.get('points').edit('delete');
    const o = sel(); if (o && o.type === 'rig' && S.selBone && S.tool === 'bone' && !tree.locked(o)) { const sn = SB.rig.editSnap(o); SB.rig.deleteBoneOnly(o, S.selBone); SB.rig.keepAttached(sn); return SB.commit(); } // like Blender: its children stay
    if (sel()) return ops.remove();
    if (SB.board && SB.board.screenSelected()) SB.board.remove(SB.screens.active()); // a selected screen (its name was clicked)
  }
  /** Esc steps back one level: menus, text, tool, parts, keys, selection. */
  function escape() {
    if (SB.menu.isOpen()) return SB.menu.close();
    if (SB.dialog.closeTop()) return;
    if (S.picking) return SB.picker.cancel();
    if (S.pen) return SB.tools.get('pen').finish();
    if (S.poseLink) return SB.controls.cancelSlot();
    if (S.recording) return SB.record.stop();
    if (S.selKeys.size) { S.selKeys.clear(); return SB.invalidate('timeline'); }
    if (S.screenSel) { S.screenSel = null; return SB.dirty(); }
    if (S.tool !== 'select') return SB.tool.set('select');
    const o = sel(); if (o) { const p = tree.parentOf(o); tree.select(p && p.id !== S.ctx ? [p.id] : []); return; }
    if (S.ctx) return tree.exit();
  }

  let spaceDown = false, panned = false;
  addEventListener('keydown', e => {
    if (K.capture) return K.capture(e);
    if (S.exporting) return;
    const t = e.target, typing = t.closest && t.closest('input,textarea,select,[contenteditable="true"]');
    if (e.key === 'Escape') { if (typing) { t.blur(); return; } e.preventDefault(); return escape(); }
    if (typing || SB.dialog.isOpen() || SB.menu.isOpen()) return;
    if (S.pen && e.key === 'Enter') { e.preventDefault(); return SB.tools.get('pen').finish(); }
    const c = comboOf(e); if (!c) return;
    if (c === 'Space') { e.preventDefault(); if (!e.repeat) { spaceDown = true; panned = false; } return; }
    const id = Object.keys(ACT).find(a => binding(a).includes(c)); if (!id || !ACT[id].run) return;
    if (id === 'paste' && SB.clipIn) return SB.clipIn.key(); // let the browser's paste event bring in images and SVG copied elsewhere
    if ((id === 'copy' || id === 'cut') && SB.clipIn) { ACT[id].run(); SB.clipIn.copied(); return; } // the browser's copy event marks the system clipboard as ours
    e.preventDefault(); if (SB.macros && SB.macros.rec && !id.startsWith('m:')) SB.macros.note({ a: id }); ACT[id].run(); // recording an action (js/ui/macros.js): this step counts
  });
  addEventListener('keyup', e => { if (e.key === ' ' && spaceDown) { spaceDown = false; if (!panned && !S.exporting && !(e.target.closest && e.target.closest('input,textarea,select'))) { if (S.recording) SB.record.stop(); else SB.time.toggle(); } } });

  const K = SB.keys = {
    ACTIONS, ACT, PRESETS, binding, pretty, comboOf,
    get space() { if (spaceDown) panned = true; return spaceDown; },
    label(idOrTool) { const map = { select: 'tSelect', points: 'tPoints', brush: 'tBrush', pen: 'tPen', eraser: 'tEraser', fill: 'tFill', fillbrush: 'tFillBrush', gradient: 'tGradient', smooth: 'tSmooth', width: 'tWidth', pull: 'tPull', bone: 'tBone', hand: 'tHand', screen: 'tScreen', cut: 'razor' }, id = map[idOrTool] || idOrTool; return ACT[id] ? pretty(binding(id)[0] || '') : ''; },
    set(id, combo) { const clash = Object.keys(ACT).filter(x => x !== id && binding(x).includes(combo)); clash.forEach(x => S.keymap[x] = binding(x).filter(c => c !== combo)); S.keymap[id] = combo ? [combo] : []; S.keyPreset = 'custom'; SB.prefs.save(); return clash.map(x => ACT[x].label); },
    reset(id) { delete S.keymap[id]; S.keyPreset = 'custom'; SB.prefs.save(); },
    preset(k) { const p = PRESETS[k]; if (!p) return; S.keymap = U.deep(p.map); for (const id in p.map) for (const c of p.map[id]) Object.keys(ACT).forEach(x => { if (x !== id && p.map[x] === undefined && ACT[x].def.includes(c)) S.keymap[x] = ACT[x].def.filter(d => d !== c); }); S.keyPreset = k; SB.prefs.save(); },
    cheatsheet() { const pick = ['play', 'record', 'tSelect', 'tBrush', 'tPen', 'split', 'key', 'undo', 'dup', 'group', 'focus']; return U.h('div.kbd-list', null, pick.map(id => U.h('div.f', null, U.h('span', null, ACT[id].label), U.h('div.ctl', null, U.h('kbd.keycap', null, pretty(binding(id)[0] || '—')))))); },
    capture: null,
  };
})(window.SB);
