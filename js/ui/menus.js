/* Right-click / long-press menus for the stage, layers, keyframes, and the File menu. */
'use strict';
(function (SB) {
  const U = SB.util, S = SB.state, TR = SB.tracks, tree = SB.tree, ops = SB.ops, h = U.h;
  const K = id => SB.keys.label(id);

  /** The main list of a layer's menu has no icons (submenus keep theirs). */
  const plain = list => list.map(it => it && typeof it === 'object' && it.icon && !it.head ? Object.assign({}, it, { icon: undefined }) : it);
  /** A layer's own picture counts for game engine exports (Unity, Godot, Rive): in-betweens per morph, poses of its animated lines. Empty: the export's setting. */
  function engineFrames(o) {
    const W = SB.w, row = (label, k, max, hint) => { const inp = h('input', { type: 'number', min: 0, max, step: 1, value: o[k] ?? '', placeholder: 'Export setting', 'aria-label': label }); inp.onchange = () => { const v = inp.value.trim(); if (v === '') delete o[k]; else o[k] = U.clamp(Math.round(+v || 0), 0, max); SB.commit(); }; return W.row(label, inp, h('span.hint', null, hint)); };
    const dlg = SB.dialog.sheet([h('h2', null, `Game engine frames: ${o.name}`), h('p.sub', null, 'Unity, Godot and Rive can’t morph lines or animate brushes, so these become pictures. Set how many for this layer; leave empty to use the export dialog’s number.'),
      o.frames && o.frames.length > 1 ? row('Morph in-betweens', 'expMorph', 60, 'per morph') : null, SB.lineMotion && SB.lineMotion(o) ? row('Animated line poses', 'expLine', 48, 'per loop') : null,
      h('div.sheet-actions', null, W.btn('Done', () => dlg.close(), { cls: 'primary' }))].filter(Boolean));
  }
  function layerItems(o) { return plain(layerItemsAll(o)); }
  /** Copy what the current frame shows (or the selected parts) into other frames of the same layer: added on top, or replacing them. */
  function copyToFrames(o) {
    const cur = SB.frames.currentIndex(o), fr = o.frames[cur], parts = S.tool === 'points' && S.selStrokes.size ? fr.strokes.filter(s => S.selStrokes.has(s)) : fr.strokes.slice();
    if (!parts.length) return SB.toast('This frame has nothing drawn yet.');
    const pick = new Set(), W = SB.w; let replace = false;
    const list = h('div.ctf-list', null, o.frames.map((f, i) => i === cur ? null : W.check(false, `Frame ${i + 1}${f.name ? ' · ' + f.name : ''}`, v => { if (v) pick.add(i); else pick.delete(i); })));
    const go = () => { if (!pick.size) return SB.toast('Pick at least one frame.'); pick.forEach(i => { const t = o.frames[i]; const add = parts.map(x => U.deep(x)); t.strokes = replace ? add : t.strokes.concat(add); }); dlg.close(); SB.commit(); SB.toast(`Copied to ${pick.size} frame${pick.size > 1 ? 's' : ''}.`); };
    const dlg = SB.dialog.sheet([h('h2', null, parts.length < fr.strokes.length ? `Copy ${parts.length} part${parts.length > 1 ? 's' : ''} to frames` : `Copy frame ${cur + 1} to frames`),
      h('p.hint', null, 'Pick the frames to copy into.'), list,
      W.row('', W.check(false, 'Replace what those frames have', v => { replace = v; })),
      h('div.sheet-actions', null, W.btn('Cancel', () => dlg.close(), { cls: 'ghost' }), W.btn('Copy', go, { cls: 'primary' }))]);
  }
  /** Tween to frame by frame: how long each picture holds, or how many pictures. */
  function tweenToFrames(items) {
    const W = SB.w, fps = S.project.fps; let mode = 'every', every = 2, count = 6;
    const anim = items.filter(x => Object.keys(x.tracks || {}).some(id => { const ty = TR.type(id); return (ty === 'num' || ty === 'color') && x.tracks[id].length > 1; }));
    if (!anim.length) return SB.toast('Nothing tweens here: give it two keyframes first.');
    const selKeys = [...S.selKeys].some(([, w]) => anim.includes(w.o)), body = h('div');
    const fill = () => body.replaceChildren(
      W.row('Make it', W.seg(mode, [['every', 'Hold each picture', 'Every picture stays on screen for the same number of frames'], ['count', 'A number of pictures', 'Split the tween into this many even pictures']], v => { mode = v; fill(); })),
      mode === 'every' ? W.row('Frames each', W.num(every, { min: 1, max: 60, label: 'Frames each picture holds', input: v => every = v }), h('span.hint', null, `at ${fps} fps: ${every === 1 ? 'every frame' : every === 2 ? 'on twos' : every === 3 ? 'on threes' : `on ${every}s`}`))
        : W.row('Pictures', W.num(count, { min: 1, max: 500, label: 'How many pictures', input: v => count = v })));
    fill();
    const go = () => { const n = ops.tweenToFrames(anim, mode === 'every' ? { every } : { count }); dlg.close(); SB.toast(n ? `${n === 1 ? anim[0].name : n + ' layers'} now move${n === 1 ? 's' : ''} in steps (held keys). Undo brings the smooth tween back.` : 'Nothing to change.'); };
    const dlg = SB.dialog.sheet([h('h2', null, 'Tween to frame by frame'),
      h('p.hint', null, `The smooth motion ${selKeys ? 'between the selected keyframes' : 'from the first to the last keyframe'} becomes separate pictures that each hold still, like drawn animation. Every animated value is kept, just in steps.`), body,
      h('div.sheet-actions', null, W.btn('Cancel', () => dlg.close(), { cls: 'ghost' }), W.btn('Convert', go, { cls: 'primary' }))]);
  }
  /** Bake into frames: morphs and animated lines become plain frames (SB.frames.bake). */
  function bakeFrames(o) {
    if (o.type === 'shape') return SB.toast('A shape morphs its outline: right-click it › Convert to editable path first, then bake it.');
    const W = SB.w, can = SB.frames.bakeable(o); let morph = can.morph ? 4 : 0, lines = can.lines ? 8 : 0;
    const go = () => { const r = SB.frames.bake(o, { morph, lines }); dlg.close(); if (!r) return SB.toast('Nothing to bake.'); SB.frames.shapeSync([o]); SB.commit(); SB.invalidate('frames', 'timeline', 'inspector'); SB.dirty(); SB.toast(`Baked: ${r.added} new frame${r.added === 1 ? '' : 's'}, picked with held keyframes. Undo brings the live ${can.morph ? 'morph' : 'lines'} back.`); };
    const dlg = SB.dialog.sheet([h('h2', null, 'Bake into frames'),
      h('p.hint', null, 'Turns what the app works out while playing into real frames of this drawing, each held by a Frame keyframe. It plays the same, and every frame can then be redrawn, reordered or exported to any game engine.'),
      can.morph && W.row('Morphs', W.num(morph, { min: 0, max: 60, label: 'In-between frames for each morph', input: v => morph = v }), h('span.hint', null, 'in-betweens per morph (0 keeps the morph live)')),
      can.lines && W.row('Animated lines', W.num(lines, { min: 0, max: 48, label: 'Poses in each line loop', input: v => lines = v }), h('span.hint', null, 'poses per loop, 12 a second (0 keeps them moving)')),
      h('div.sheet-actions', null, W.btn('Cancel', () => dlg.close(), { cls: 'ghost' }), W.btn('Bake', go, { cls: 'primary' }))]);
  }
  function layerItemsAll(o) {
    const items = tree.selected(), many = items.length > 1, def = SB.types.get(o.type), p = tree.parentOf(o), sibs = tree.listOf(o).length > 1;
    const fxList = SB.fx.available(o);
    return [
      { head: many ? `${items.length} layers` : o.name },
      SB.targets && items.some(x => SB.targets.issues(x).length) && { label: `Remove what ${SB.targets.short()} can’t show`, icon: 'trash', run: () => { const del = []; items.forEach(x => { if (SB.targets.issues(x).length && SB.targets.fix(x) === 'delete') del.push(x); }); if (del.length) SB.ops.remove(del); SB.commit(); } },
      items.some(x => x.type === 'null') && { label: 'Reset controller', icon: 'ctrl', run: () => { const cs = items.filter(x => x.type === 'null'); cs.forEach(c => TR.setMany(c, { x: c.rx ?? c.x, y: c.ry ?? c.y })); SB.commit(); SB.toast(cs.length > 1 ? `${cs.length} controllers are back at rest.` : `${cs[0].name} is back at rest.`); } },
      !many && { label: 'Rename', run: () => SB.timeline.rename(o) },
      { label: o.tlColor ? 'Layer color…' : 'Give it a color…', run: () => SB.timeline.colorPick(many ? items : [o], SB.menu.lastXY) },
      items.some(x => x.tlColor) && { label: 'Remove its color', run: () => { items.forEach(x => delete x.tlColor); SB.commit(); } },
      o.seq && { label: 'Open shot', kbd: 'Double-click', run: () => tree.enter(o) },
      { label: 'Duplicate', kbd: K('dup'), run: () => ops.duplicate() },
      { label: 'Copy', kbd: K('copy'), run: ops.copy }, S.clip && { label: 'Paste', kbd: K('paste'), run: ops.paste },
      { label: 'Delete', kbd: K('del'), run: () => ops.remove() },
      !many && (o.effects || []).length && { label: 'Remove an effect', icon: 'trash', sub: [...o.effects.map(e => ({ label: (SB.effects.get(e.type) || { label: e.type }).label, run: () => { SB.fx.remove(o, e.id); SB.commit(); } })), '-', { label: 'All effects and transitions', run: () => { o.effects = []; TR.drop(o, 'fx:'); SB.commit(); } }] },
      !many && def.frames && o.frames && o.frames.length > 1 && { label: S.tool === 'points' && S.selStrokes.size ? 'Copy the selected parts to frames…' : 'Copy this drawing to frames…', icon: 'copy', run: () => copyToFrames(o) },
      items.some(x => Object.keys(x.tracks || {}).some(id => x.tracks[id].length > 1 && TR.type(id) !== 'bool' && TR.type(id) !== 'int')) && { label: 'Tween to frame by frame…', icon: 'frames', run: () => tweenToFrames(items) },
      !many && (SB.frames.bakeable(o) || (o.type === 'shape' && o.frames && o.frames.length > 1 && (o.tracks.frame || []).some(k => k.morph))) && { label: 'Bake into frames…', icon: 'frames', run: () => bakeFrames(o) },
      tree.inRange(o) && !many && { label: 'Cut at the playhead', kbd: K('split'), run: () => ops.split(o) },
      o.parts && S.selPart && S.selPart.id === o.id && { label: 'Delete this part', kbd: 'Del', run: () => ops.removePart(o, S.selPart.i) },
      o.parts && { label: 'Join the parts into one clip', run: () => ops.joinParts(o) },
      '-',
      o.type === 'text' && { label: 'Edit text', kbd: 'Enter', run: () => SB.textEdit.start(o) },
      o.type === 'shape' && { label: 'Convert to editable path', run: () => ops.shapeToPath(o) },
      o.type === 'video' && !many && !(o.soundSplit && tree.find(o.soundSplit)) && { label: 'Split sound into its own layer', icon: 'audio', run: () => ops.splitSound(o) },
      (o.type === 'video' || o.type === 'audio') && !many && tree.inRange(o) && { label: SB.mediaOps.heldAt(o) ? 'Play on from here' : o.type === 'video' ? 'Hold this frame' : 'Pause here', icon: SB.mediaOps.heldAt(o) ? 'play' : 'pause', run: () => SB.mediaOps.holdHere(o, !SB.mediaOps.heldAt(o)) },
      o.type === 'group' && { label: 'Ungroup', kbd: K('ungroup'), run: () => ops.ungroup(o) },
      { label: many ? 'Group layers' : 'Put in a group', kbd: K('group'), run: () => ops.group() },
      p && p.id !== S.ctx && { label: 'Move out of group', run: () => ops.outOfGroup() },
      !o.seq && def.visual && def.render !== false && { label: many ? 'Make a shot from these' : 'Make a shot', kbd: K('shot'), run: () => ops.makeShot() },
      o.seq && { label: 'Shot', sub: [{ label: 'Fit to its layers', run: () => ops.fitShot(o) }, { label: 'Line up all shots end to end', run: () => ops.lineUpShots() }, { label: 'Turn back into layers', run: () => ops.ungroup(o) }] },
      many && { label: 'Combine into one drawing', kbd: K('join'), run: () => ops.combine() },
      !many && o.combined && { label: 'Split back into layers', run: () => ops.splitCombined(o) },
      many && { label: 'Arrange', icon: 'alC', sub: [
        { label: 'Align left', icon: 'alL', run: () => ops.align('left') }, { label: 'Align centers', icon: 'alC', run: () => ops.align('hcenter') }, { label: 'Align right', icon: 'alR', run: () => ops.align('right') }, '-',
        { label: 'Align tops', icon: 'alT', run: () => ops.align('top') }, { label: 'Align middles', icon: 'alM', run: () => ops.align('vcenter') }, { label: 'Align bottoms', icon: 'alB', run: () => ops.align('bottom') },
        items.length > 2 && '-', items.length > 2 && { label: 'Spread across evenly', icon: 'distH', run: () => ops.align('dh') }, items.length > 2 && { label: 'Spread down evenly', icon: 'distV', run: () => ops.align('dv') }, '-',
        { label: 'Bring to front', icon: 'front', run: () => ops.order('front') }, { label: 'Bring forward', icon: 'fwd', run: () => ops.order('fwd') }, { label: 'Send backward', icon: 'bwd', run: () => ops.order('bwd') }, { label: 'Send to back', icon: 'sendBack', run: () => ops.order('back') }] },
      tree.all().some(g => g.type === 'group' && !items.includes(g) && !items.some(i => tree.isDesc(g, i))) && { label: 'Move into a group…', run: () => SB.picker.start({ title: `Pick a group or shot for ${many ? items.length + ' layers' : o.name}`, test: g => g.type === 'group' && !items.includes(g) && !items.some(i => tree.isDesc(g, i)) && !items.some(i => tree.parentOf(i) === g && items.length === 1), done: c => ops.moveInto(c.o, items) }) },
      def.visual && def.render !== false && { label: 'Flip', icon: 'flipH', sub: [{ label: 'Flip horizontally', icon: 'flipH', run: () => ops.flip('h') }, { label: 'Flip vertically', icon: 'flipV', run: () => ops.flip('v') }] },
      sibs && !many && { label: 'Order', sub: [{ label: 'Bring to front', icon: 'front', run: () => ops.order('front') }, { label: 'Bring forward', icon: 'fwd', run: () => ops.order('fwd') }, { label: 'Send backward', icon: 'bwd', run: () => ops.order('bwd') }, { label: 'Send to back', icon: 'sendBack', run: () => ops.order('back') }] },
      '-',
      !many && SB.actionStrips && SB.actionStrips.menuItem(o),
      !many && (o.type === 'draw' || o.type === 'shape') && ((o.frames && o.frames.length > 1) || (SB.lineMotion && SB.lineMotion(o))) && { label: 'Game engine frames…', run: () => engineFrames(o) },
      TR.anyKeys(o) && { label: (o.kloop ? '✓ ' : '') + 'Loop keyframes', run: () => { const on = !o.kloop, all = (S.multi.has(o.id) ? tree.selected() : [o]).filter(x => TR.anyKeys(x)); all.forEach(x => { if (on) x.kloop = true; else delete x.kloop; }); SB.commit(); SB.toast(on ? 'Its keyframes play, then start again from the first one for as long as the timeline runs. For a smooth loop, make the last keyframe the same as the first.' : 'The keyframes play once again.'); } },
      def.visual && { label: 'Animate', sub: [
        { label: 'Add keyframe', kbd: K('key'), run: () => ops.addKey() }, { label: 'Record motion', kbd: K('record'), run: () => SB.record.start() },
        { label: o.showProps ? 'Hide animation rows' : 'Show animation rows', run: () => { o.showProps = !o.showProps; SB.commit(); } },
        TR.anyKeys(o) && { label: 'Clean up keyframes', run: () => { const n = TR.clean(o); SB.commit(); SB.toast(n ? `Removed ${n} keyframes.` : 'Nothing to clean up.'); } },
        TR.anyKeys(o) && { label: 'Remove all keyframes', run: () => { TR.clear(o); SB.commit(); } }] },
      def.fx && { label: 'Effects', sub: [
        ...Object.entries(SB.FX_CATS).map(([cat, label]) => ({ label, sub: [...(fxList.some(d => d.cat === cat && !SB.fx.usable(d)) ? [{ head: `Greyed out: not in ${SB.targets.short()}` }] : []), ...fxList.filter(d => d.cat === cat).map(d => ({ label: d.label, disabled: !SB.fx.usable(d), run: () => { if (SB.fx.add(items, d.id)) SB.toast(`${d.label} added.`); } }))] })),
        '-', !many && o.effects.length && { label: 'Copy effects', run: () => { S.fxClip = U.deep(o.effects); SB.toast(`Copied ${o.effects.length} effects.`); } },
        S.fxClip && { label: many ? 'Paste effects to all' : 'Paste effects', run: () => { items.forEach(x => { if (!SB.types.get(x.type).fx) return; S.fxClip.forEach(e => { const d = SB.effects.get(e.type); if (d && !x.effects.some(y => y.type === e.type) && (!d.only || d.only.includes(x.type))) x.effects.push(Object.assign(U.deep(e), { id: U.uid() })); }); }); SB.commit(); } },
        o.effects.length && { label: 'Remove all effects', run: () => { items.forEach(x => { x.effects = []; TR.drop(x, 'fx:'); }); SB.commit(); } }] },
      SB.menus.maskItem ? SB.menus.maskItem(o, items) : null,
      ...SB.menus.extra.flatMap(f => [].concat(f(o, items))),
      '-',
      { label: S.solo ? 'Show all layers in the timeline' : 'Show only this in the timeline', run: () => { S.solo = S.solo ? null : new Set(items.map(x => x.id)); if (S.solo) { S.multi.forEach(id => { if (tree.soloOut(tree.find(id) || {})) S.multi.delete(id); }); SB.toast('The other layers are locked until you show all layers again.'); } SB.invalidate(); SB.dirty(); } },
      { label: o.hidden ? (o.type === 'audio' ? 'Unmute' : 'Show') : (o.type === 'audio' ? 'Mute' : 'Hide'), run: () => ops.setHidden(items, !o.hidden) },
      { label: o.locked ? 'Unlock' : 'Lock', run: () => ops.setLocked(items, !o.locked) },
    ];
  }
  /** Frame keyframes of a drawing (frame library): morph from this key's frame to the next key's frame, over the time between them. */
  function morphItems(o, id, targets) {
    const ks = targets.map(x => [x, S.selKeys.get(x) || { o, id }]).filter(([x, r]) => r.id === 'frame' && (r.o.type === 'draw' || r.o.type === 'shape') && r.o.play === 'library' && r.o.tracks.frame.indexOf(x) < r.o.tracks.frame.length - 1);
    if (!ks.length) return []; const on = ks.every(([x]) => x.morph), cur = on && ks.every(([x]) => x.morph === ks[0][0].morph) ? ks[0][0].morph : null;
    const set = v => { ks.forEach(([x]) => { if (v) x.morph = v; else delete x.morph; }); SB.commit(); SB.invalidate('timeline', 'inspector'); };
    return ['-', { label: (on ? '✓ ' : '') + 'Morph to the next keyframe', run: () => set(on ? null : 'smooth') },
      on && { label: 'Morph ease', sub: Object.entries(TR.EASES).filter(([e]) => !['hold', 'spline'].includes(e)).map(([e, d]) => ({ label: (cur === e ? '✓ ' : '') + d.label + (e === 'bez' ? '…' : ''), run: () => e === 'bez' ? morphCurve(ks) : set(e) })) }];
  }
  /** The curve editor on the morph of frame keyframes: it edits k.morph / k.mbz / k.mbzp (a stand-in key maps the names). */
  function morphCurve(ks) {
    const keys = ks.map(([x]) => x), [k0, r0] = ks[0], tr = r0.o.tracks.frame, nx = tr[tr.indexOf(k0) + 1], seg = nx ? [tree.mainAt(r0.o, k0.t), tree.mainAt(r0.o, nx.t)] : null;
    const MAP = { e: 'morph', bz: 'mbz', bzp: 'mbzp', ep: 'mep' }, stand = k => new Proxy(k, { get: (t, p) => p in MAP ? t[MAP[p]] : t[p], set: (t, p, v) => { t[p in MAP ? MAP[p] : p] = v; SB.dirty(); return true; }, deleteProperty: (t, p) => { delete t[p in MAP ? MAP[p] : p]; return true; } });
    if (!keys[0].morph || keys[0].morph === true) keys.forEach(k => k.morph = 'bez'); SB.curves.open(keys.map(stand), { seg });
  }
  /** Menu for keyframes: one, or every selected one (a diamond on a layer's main row selects all keys at that time). */
  function keyItems(o, id, k) {
    const many = S.selKeys.size > 1 && S.selKeys.has(k), targets = many ? [...S.selKeys.keys()] : [k];
    const typeOf = x => TR.type((S.selKeys.get(x) || { id }).id), easable = targets.filter(x => ['num', 'color'].includes(typeOf(x))), splineOk = easable.every(x => typeOf(x) === 'num');
    const cur = easable[0] && easable.every(x => x.e === easable[0].e) ? easable[0].e : null;
    return [{ head: many ? `${S.selKeys.size} keyframes` : `Keyframe at ${U.r2(o.start + k.t)}s` },
      { label: 'Go to keyframe', run: () => tree.goLocal(o, k.t + 0.0001) },
      ...(easable.length ? ['-', { label: 'Ease', sub: [...Object.entries(TR.EASES).filter(([e]) => e !== 'bez' && (splineOk || e !== 'spline')).map(([e, d]) => ({ label: (cur === e ? '✓ ' : '') + d.label, run: () => { easable.forEach(x => { x.e = e; delete x.ep; delete x.bz; delete x.bzp; }); SB.commit(); } })),
        '-', { label: (cur === 'bez' ? '✓ ' : '') + 'Custom curve…', run: () => SB.curves.open(easable.map(x => [x, S.selKeys.get(x) || { o, id }])) }] },
        { label: 'Custom curve…', icon: 'curve', run: () => SB.curves.open(easable.map(x => [x, S.selKeys.get(x) || { o, id }])) }] : []),
      ...morphItems(o, id, targets),
      many && easable.length && { label: 'Tween to frame by frame…', icon: 'frames', run: () => tweenToFrames([...new Set([...S.selKeys.values()].map(w => w.o))]) },
      '-', { label: many ? 'Copy keyframes' : 'Copy keyframe', kbd: K('copy'), run: () => { if (!S.selKeys.has(k)) S.selKeys = new Map([[k, { o, id }]]); ops.copy(); } },
      S.clip && S.clip.type === 'keys' && { label: 'Paste keyframes at playhead', kbd: K('paste'), run: () => { tree.select([o.id]); ops.paste(); } },
      { label: 'Duplicate to playhead', run: () => { const lt = tree.localTime(o); targets.forEach(x => { const ref = S.selKeys.get(x) || { o, id }; TR.put(ref.o, ref.id, lt, x.v, x.e); }); SB.commit(); } },
      { label: many ? 'Delete keyframes' : 'Delete keyframe', kbd: 'Del', run: () => { if (many) ops.deleteKeys(); else { TR.remove(o, id, k); SB.commit(); } } }];
  }
  function propItems(o, id) {
    const anim = TR.animated(o, id);
    return [{ head: id.replace(/^fx:[^:]+:/, '') }, { label: anim ? 'Add or remove keyframe here' : 'Animate this', run: () => { TR.toggleKey(o, id); SB.commit(); } },
      anim && { label: 'Select all its keyframes', run: () => { S.selKeys = new Map(o.tracks[id].map(k => [k, { o, id }])); SB.invalidate('timeline'); } },
      anim && { label: 'Stop animating (keep current value)', run: () => { TR.stop(o, id); SB.commit(); } },
      anim && { label: 'All keyframes: Hold', run: () => { o.tracks[id].forEach(k => k.e = 'hold'); SB.commit(); } },
      anim && { label: 'All keyframes: Smooth', run: () => { o.tracks[id].forEach(k => k.e = 'smooth'); SB.commit(); } }];
  }

  /** The keyframe diamond near the pointer (a key at the very start of a clip sits under the trim handle). */
  function nearKey(e) { const clip = e.target.closest && e.target.closest('.clip'); if (!clip) return null; let best = null, bd = 8; clip.querySelectorAll('.kf').forEach(k => { const r = k.getBoundingClientRect(), d = Math.abs(r.left + r.width / 2 - e.clientX); if (d < bd) { bd = d; best = k; } }); return best; }
  // recent projects come from storage (async): the list from the last time, refreshed each time the menu opens
  let recent = []; const refreshRecent = () => SB.project.recent().then(l => { recent = l; });
  const ago = t => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' d ago'; };
  const recentItems = () => recent.length ? recent.map(r => ({ label: `${r.name} · ${ago(r.at)}`, run: () => SB.project.openRecent(r) })) : [{ label: 'Projects you save or open show here', disabled: true }];
  SB.ready ? refreshRecent() : setTimeout(() => SB.project && SB.project.recent && refreshRecent(), 1500);
  SB.menus = {
    extra: [], // stage 2 adds rig, physics and controller items: (o, items) => menu item
    layerItems, bakeFrames,
    layer(o, anchor) { const r = anchor.getBoundingClientRect(); SB.menu.open(r.left, r.bottom + 4, layerItems(o)); },
    stage(e) {
      const P = SB.view.toProj(e);
      if (S.tool === 'points' && S.selStrokes.size) return SB.menu.open(e.clientX, e.clientY, [{ head: `${S.selStrokes.size} drawing part${S.selStrokes.size > 1 ? 's' : ''}` },
        ...(SB.pathEdit.joinable() ? [{ label: 'Join the two points', icon: 'link', run: () => SB.pathEdit.joinPts('merge') }, { label: 'Connect them with a line', run: () => SB.pathEdit.joinPts('line') }, '-'] : []),
        { label: 'Order', sub: [{ label: 'Bring to front', icon: 'front', run: () => SB.tools.get('points').edit('order', 'front') }, { label: 'Bring forward', icon: 'fwd', run: () => SB.tools.get('points').edit('order', 'fwd') }, { label: 'Send backward', icon: 'bwd', run: () => SB.tools.get('points').edit('order', 'bwd') }, { label: 'Send to back', icon: 'sendBack', run: () => SB.tools.get('points').edit('order', 'back') }] }, '-', { label: 'Copy', kbd: K('copy'), run: () => ops.copyParts(false) }, { label: 'Cut', kbd: K('cut'), run: () => ops.copyParts(true) }, '-', { label: 'Make a new layer', run: ops.partsToLayer }, { label: 'Make editable path', run: () => SB.tools.get('points').edit('toPath') }, { label: 'Smooth', run: () => SB.tools.get('points').edit('smooth') }, { label: 'Flip horizontally', icon: 'flipH', run: () => SB.tools.get('points').edit('flipH') }, { label: 'Flip vertically', icon: 'flipV', run: () => SB.tools.get('points').edit('flipV') }, '-', { label: 'Delete', kbd: 'Del', run: () => SB.tools.get('points').edit('delete') }]);
      if (S.tool === 'pen' && S.pen) return SB.tools.get('pen').finish();
      const sel = tree.sel(), hit = sel && tree.inRange(sel) && SB.scene.inside(sel, P) ? sel : SB.select.pick(P, false);
      if (hit) { if (!S.multi.has(hit.id)) tree.select([hit.id]); return SB.menu.open(e.clientX, e.clientY, layerItems(hit)); }
      SB.menu.open(e.clientX, e.clientY, [{ head: 'Stage' }, { label: 'New drawing layer', run: () => SB.add.drawing() }, { label: 'Add text', run: () => SB.add.text() }, { label: 'Add a shape', sub: Object.entries(SB.SHAPES).map(([k, v]) => ({ label: v, run: () => SB.add.shape(k) })) },
        S.clip && { label: 'Paste', kbd: K('paste'), run: ops.paste }, { label: 'Select all', kbd: K('all'), run: () => tree.select(tree.rootList().map(o => o.id)) }, '-',
        { label: 'Draw bones for a rig', kbd: K('tBone'), run: () => SB.tool.set('bone') }, { label: 'Add a controller', run: () => { const c = SB.controls.make(null); tree.select([c.id]); SB.commit(); } },
        { label: 'New empty shot', run: () => ops.newShot() }, S.ctx && { label: 'Back to the main timeline', run: () => { S.ctx = null; tree.select([]); } },
        { label: 'Add a screen', sub: [...SB.screens.SIZES.map(([k, v]) => ({ label: v, run: () => { const s = SB.screens.add(k); SB.board.focus(s, true); SB.board.fitAll(); SB.commit(); } })), ...(SB.tmplItems ? SB.tmplItems() : [])] },
        SB.templates && !SB.screens.active().from && { label: SB.screens.active().tmpl ? 'Stop being a template' : 'Save this screen as a template', icon: 'library', run: () => { const a = SB.screens.active(); if (a.tmpl) SB.templates.unmake(a); else SB.templates.make(a); } }, SB.screens.many() && { label: 'Show every screen', run: () => SB.board.fitAll() },
        '-', { label: 'Fit to screen', kbd: K('zoomFit'), run: () => SB.view.reset() }, { label: SB.screens.many() ? 'Screen settings…' : 'Project settings…', run: () => SB.settings.open('project') }]);
    },
    timeline(e) {
      // an effect or transition block in an open layer's rows: its settings, preview, on/off, delete
      const fb = e.target.closest('.fxblk') || e.target.closest('.tl-row.sub[data-fx]');
      if (fb) { const o = tree.find(fb.dataset.id), fx = o && (o.effects || []).find(x => x.id === fb.dataset.fx), d = fx && SB.effects.get(fx.type); if (!fx || !d) return; if (S.sel !== o.id) tree.select([o.id]);
        return SB.menu.open(e.clientX, e.clientY, [{ head: d.label }, { label: 'Settings…', icon: 'gear', run: () => SB.fx.settings(o, fx, { x: e.clientX, y: e.clientY }) },
          SB.fx.timed(fx) ? { label: 'Preview', icon: 'play', run: () => SB.fx.preview(o, fx) } : null,
          { label: fx.on === false ? 'Turn on' : 'Turn off', icon: fx.on === false ? 'eye' : 'eyeOff', run: () => SB.fx.setOn(o, fx, fx.on === false) },
          '-', { label: 'Delete', icon: 'trash', run: () => { SB.fx.remove(o, fx.id); SB.commit(); } }]); }
      const sub = e.target.closest('.tl-row.sub');
      if (sub) { const o = tree.find(sub.dataset.id), id = sub.dataset.p, sk = e.target.closest('.sk'); if (!o || !id) return; if (sk) { const k = o.tracks[id][+sk.dataset.ki]; if (!S.selKeys.has(k)) { S.selKeys = new Map([[k, { o, id }]]); SB.invalidate('timeline'); } return SB.menu.open(e.clientX, e.clientY, keyItems(o, id, k)); } return SB.menu.open(e.clientX, e.clientY, propItems(o, id)); }
      const row = e.target.closest('.tl-row[data-id]'), o = row && tree.find(row.dataset.id); if (!o) return;
      // a diamond on the layer's own row stands for every keyframe at that time: its menu works on all of them
      const kf = e.target.closest('.kf') || nearKey(e); if (kf) { const t = +kf.dataset.kt, hit = TR.keysAt(o, t); if (!hit.length) return; const already = hit.every(([k]) => S.selKeys.has(k)); if (!already) S.selKeys = new Map(hit.map(([k, id]) => [k, { o, id }])); SB.invalidate('timeline'); return SB.menu.open(e.clientX, e.clientY, keyItems(o, hit[0][1], hit[0][0])); }
      const pc = e.target.closest('.clip[data-part]'); if (pc && +pc.dataset.part >= 0) { if (!S.multi.has(o.id)) tree.select([o.id]); S.selPart = { id: o.id, i: +pc.dataset.part }; return SB.menu.open(e.clientX, e.clientY, layerItems(o)); }
      if (!S.multi.has(o.id)) tree.select([o.id]); SB.menu.open(e.clientX, e.clientY, layerItems(o));
    },
    file(anchor) { refreshRecent();
      const r = anchor.getBoundingClientRect();
      SB.menu.open(r.left, r.bottom + 4, [SB.tours ? { label: 'Tutorials…', icon: 'tour', run: () => SB.tours.open() } : null, SB.tours ? '-' : null, { label: 'New project', run: () => SB.project.newProject() }, { label: 'Open project…', kbd: K('open'), run: () => SB.project.openPicker() }, { label: 'Recent projects', sub: recentItems() }, SB.examples ? { label: 'Examples', sub: SB.examples.projects().map(e => ({ label: e.name, run: () => SB.examples.openProject(e) })) } : null,
        { label: 'Save project', kbd: K('save'), run: () => SB.project.save() }, '-',
        { label: 'Import files…', run: () => SB.io.pick('image/*,.svg,video/*,audio/*,.psd,.ai,.pdf', true, f => SB.io.importFiles(f)) }, { label: 'Record voice', disabled: SB.targets && !SB.targets.allows('audio'), run: () => SB.voice.start() }, { label: 'Saved objects…', icon: 'library', run: () => SB.rigLib.open() }, '-',
        { label: 'Export…', run: () => SB.exporter.open() }, { label: SB.screens.many() ? 'Screen settings…' : 'Project settings…', run: () => SB.settings.screen() }, { label: 'Settings…', run: () => SB.settings.open() }]);
    },
  };
})(window.SB);
