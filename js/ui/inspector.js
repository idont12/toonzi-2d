/* Properties panel. Sections come from:
   - the object type (SB.types.get(type).sections)
   - the transform, effects, transitions and mask sections below
   (aligning and ordering are in the right-click menu: js/ui/menus.js)
   - SB.inspector.extra: add your own section builders here (o) => element */
'use strict';
(function (SB) {
  const U = SB.util, S = SB.state, TR = SB.tracks, tree = SB.tree, h = U.h, W = SB.w, FL = SB.fields;
  const sec = FL.section;
  const I = SB.inspector = { top: [], extra: [], badges: [] }; // section builders (o) => element(s): top ones go first
  // what a selected layer uses that the screen's format can't carry, with a fix
  I.top.push(o => { const T = SB.targets, r = T ? T.issues(o) : []; if (!r.length) return null;
    return h('div.issue-box', null, h('p.hint.warn', null, `Can’t go in ${T.short()}: ${r.join(', ')}. Left out when you export.`), W.btn(`Remove ${r.length > 1 ? 'them' : 'it'}`, () => { if (T.fix(o) === 'delete') SB.ops.remove([o]); SB.commit(); }, { cls: 'sm' })); });

  function header(o) {
    const def = SB.types.get(o.type), many = tree.selected().length > 1, par = tree.parentOf(o);
    const name = h('input.name-in', { value: o.name, 'aria-label': 'Layer name' }); name.onchange = () => { o.name = name.value.trim() || o.name; SB.commit(); };
    return h('div', null,
      h('div.insp-head', null, h('span.badge', { style: { '--c': `var(${def.color})` }, html: SB.icon(o.seq ? 'shot' : def.icon) + U.esc(o.seq ? 'Shot' : def.label + (o.type === 'shape' ? ': ' + (SB.SHAPE_NAMES[o.shape] || o.shape) : '')) }), ...I.badges.map(f => f(o)).filter(Boolean), h('span.spacer'),
        W.iconBtn('copy', 'Duplicate (Ctrl+D)', () => SB.ops.duplicate(), 'sm'), W.iconBtn('trash', 'Delete (Del)', () => SB.ops.remove(), 'sm'), W.iconBtn('more', 'More actions', e => SB.menus.layer(o, e.currentTarget), 'sm'), W.iconBtn('x', 'Close (Esc)', () => tree.select([]), 'sm')),
      name,
      many ? h('div', { style: { padding: '0 14px 8px' } }, h('p.hint', null, `${tree.selected().length} layers selected. Changes apply to all of them.`), h('div.row', null, W.btn('Group', () => SB.ops.group(), { cls: 'sm' }), tree.selected().every(x => x.type === 'draw') ? W.btn('Join drawings', () => SB.ops.join(), { cls: 'sm' }) : null, W.btn('Use top as mask', () => SB.ops.makeMask(), { cls: 'sm' }))) : null,
      par && par.id !== S.ctx ? h('p.hint', { style: { padding: '0 14px' } }, `Inside ${par.name}. `, h('button.btn.sm.ghost', { type: 'button', onclick: () => tree.select([par.id]) }, par.seq ? 'Select shot' : 'Select group')) : null);
  }
  function timing(o) {
    if (o.seq) return sec('Shot', [
      W.row('Start, length', W.num(o.start, { step: 0.05, min: 0, label: 'Start', change: v => { o.start = U.r3(Math.max(0, v)); SB.commit(); } }), W.num(o.dur, { step: 0.05, min: 0.1, label: 'Length', change: v => { o.dur = U.r3(Math.max(0.1, v)); SB.commit(); } })),
      W.row('Trim start', W.num(o.inPoint || 0, { step: 0.05, min: 0, label: 'Trim start', change: v => { o.inPoint = U.r3(Math.max(0, v)); SB.commit(); } })),
      h('div.row.btns', null, W.btn('Open shot', () => tree.enter(o), { cls: 'sm primary', icon: 'shot' }), W.btn('Fit to its layers', () => SB.ops.fitShot(o), { cls: 'sm ghost' })),
      h('p.hint', null, 'A shot is a group with its own time, like a nested sequence. Move or trim it as one clip; double-click it to edit inside.')]);
    if (o.type === 'group' && !o.parts) return null;
    if (o.parts) return sec('Timing', [h('p.hint', null, `Cut into ${o.parts.length} parts. Drag them in the timeline to move or trim each one.`), h('div.row.btns', null, W.btn('Join the parts', () => SB.ops.joinParts(o), { cls: 'sm' }))]);
    return sec('Timing', [W.row('Start, length', W.num(o.start, { step: 0.05, min: 0, label: 'Start', change: v => { o.start = U.r3(Math.max(0, v)); SB.commit(); } }), W.num(o.dur, { step: 0.05, min: 0.1, label: 'Length', change: v => { o.dur = U.r3(Math.max(0.1, v)); SB.commit(); } }))], { closed: true });
  }
  /** A compact number field like Figma's: keyframe diamond, a label you can drag left/right to scrub, the value. */
  function cfield(o, k, label, opt = {}) {
    const f = Object.assign({ k, anim: true }, opt), inp = h('input', { type: 'number', step: opt.step || 1, 'aria-label': opt.title || label, value: U.r2(FL.read(o, f)) });
    inp.oninput = () => { const v = parseFloat(inp.value); if (!isNaN(v)) FL.write(o, f, v, false); }; inp.onchange = () => { const v = parseFloat(inp.value); if (!isNaN(v)) FL.write(o, f, v, true); };
    inp.dataset.live = '1'; inp._refresh = () => { if (document.activeElement !== inp) inp.value = U.r2(FL.read(o, f)); };
    const lab = h('span.cf-l', { title: 'Drag left or right to change' }, label);
    lab.addEventListener('pointerdown', e => { e.preventDefault(); lab.setPointerCapture(e.pointerId); const x0 = e.clientX, v0 = FL.read(o, f), st = (opt.step || 1) * (e.shiftKey ? 10 : 1); let moved = false;
      const mv = ev => { moved = true; const v = U.r2(v0 + Math.round((ev.clientX - x0) / 2) * st); inp.value = v; FL.write(o, f, v, false); };
      const up = () => { lab.removeEventListener('pointermove', mv); lab.removeEventListener('pointerup', up); if (moved) FL.write(o, f, parseFloat(inp.value), true); else inp.focus(); };
      lab.addEventListener('pointermove', mv); lab.addEventListener('pointerup', up); lab.addEventListener('pointercancel', () => { lab.removeEventListener('pointermove', mv); lab.removeEventListener('pointerup', up); if (moved) FL.write(o, f, parseFloat(inp.value), true); }, { once: true }); });
    const el = h('div.cf' + (opt.locked ? '.locked' : ''), { title: opt.locked || opt.title || '' }, FL.keyButton(o, k), lab, inp, opt.unit ? h('span.cf-u', null, opt.unit) : null); // a div, not a label: a label would pass clicks on to the key button
    if (opt.locked) inp.disabled = true;
    return el;
  }
  /** A compact slider row: keyframe diamond, an icon, the slider and its value. */
  function cslider(o, k, icon, title, min, max, extra) {
    const f = { k, anim: true }, rng = W.range(FL.read(o, f), { min, max, label: title, input: v => FL.write(o, f, v, false), change: v => FL.write(o, f, v, true) });
    rng.dataset.live = '1'; rng._refresh = () => { if (!rng.contains(document.activeElement)) rng._set(FL.read(o, f)); };
    return h('div.cs', { title }, FL.keyButton(o, k), h('span.cs-ic', { html: SB.icon(icon) }), rng, extra || null);
  }
  const subh = t => h('h4.subh', null, t);
  /** Align to the screen, or (with several layers) to each other. */
  function alignTo(many) {
    const sel = W.select(many ? S.alignTo || 'sel' : 'screen', many ? [['sel', 'To each other'], ['screen', 'To the screen']] : [['screen', 'To the screen']], v => { S.alignTo = v; SB.invalidate('inspector'); }, 'Align to');
    sel.className = 'mini'; sel.disabled = !many; if (!many) sel.title = 'Select two or more layers to align them to each other'; return sel;
  }
  function flip(axis) { const id = axis === 'h' ? 'scx' : 'scy'; tree.selected().forEach(x => { if (SB.types.get(x.type).visual) TR.set(x, id, -TR.now(x, id)); }); SB.commit(); }
  function transform(o) {
    if (!SB.types.get(o.type).visual) return null;
    const items = tree.selected(), many = items.length > 1, def = SB.types.get(o.type);
    const orKeyed = TR.animated(o, 'ax') || TR.animated(o, 'ay');
    const grid = h('div.origin-grid', { title: 'Put the pivot on a point of the layer' }, [0, 0.5, 1].flatMap(y => [0, 0.5, 1].map(x => h('button', { type: 'button', 'aria-label': `Pivot ${x * 100}% ${y * 100}%`, onclick: () => { const b = SB.scene.bounds(o); if (b) { SB.xf.setOrigin(o, b.x0 + (b.x1 - b.x0) * x, b.y0 + (b.y1 - b.y0) * y); SB.commit(); } } }))));
    const originSet = (o2, which, v) => { const tr = TR.transform(o2, tree.localTime(o2)); SB.xf.setOrigin(o2, which === 'ax' ? v : tr.ax, which === 'ay' ? v : tr.ay); };
    const locked = SB.controls ? SB.controls.lockedProps(o) : new Map(), lk = id => locked.has(id) ? `Set by “${locked.get(id)}”. Drag on the stage, or change the offset in Controls.` : null;
    const A = [['left', 'alL', 'Align left'], ['hcenter', 'alC', 'Align centers'], ['right', 'alR', 'Align right'], ['top', 'alT', 'Align tops'], ['vcenter', 'alM', 'Align middles'], ['bottom', 'alB', 'Align bottoms']];
    if (items.length >= 3) A.push(['dh', 'distH', 'Spread across evenly'], ['dv', 'distV', 'Spread down evenly']); // spreading is always between the layers
    const canAlign = def.render !== false && def.fx, toScreen = !many || S.alignTo === 'screen';
    const pct = (k, label) => cfield(o, k, label, { unit: '%', step: 1, title: label === 'W' ? 'Width %' : 'Height %' });
    return sec('Position and look', [
      canAlign ? [h('div.subrow', null, subh('Alignment'), alignTo(many)), h('div.alrow', null, ...A.map(([k, ic, t]) => W.iconBtn(ic, t + (toScreen ? ' (to the screen)' : ' (to each other)'), () => SB.ops.align(k, toScreen), 'sm')))] : null,
      subh('Position'), h('div.g2', null, cfield(o, 'x', 'X', { locked: lk('x') }), cfield(o, 'y', 'Y', { locked: lk('y') })),
      subh('Size'), h('div.g2', null, pct('scx', 'W'), pct('scy', 'H')), cslider(o, 'scale', 'fit', 'Scale % (both ways)', 1, 400),
      subh('Rotation'), cslider(o, 'rot', 'redo', 'Rotation in degrees', -360, 360, h('span.flips', null, W.iconBtn('flipH', 'Flip horizontally', () => flip('h'), 'sm'), W.iconBtn('flipV', 'Flip vertically', () => flip('v'), 'sm'))),
      subh('Appearance'), cslider(o, 'opacity', 'eye', 'Opacity %', 0, 100),
      (() => { const ok = !SB.targets || SB.targets.allows('blend') || (o.blend && o.blend !== 'normal'), sel = W.select(o.blend || 'normal', Object.entries(SB.BLEND_MODES || { normal: 'Normal' }), v => { if (v !== 'normal' && SB.targets && !SB.targets.allows('blend')) return SB.targets.blocked('Blend modes'); tree.selected().forEach(x => { if (v === 'normal') delete x.blend; else x.blend = v; }); SB.commit(); }, 'Blend mode');
        if (!ok) { sel.disabled = true; sel.title = SB.targets.why(); } return h('div.blendrow' + (ok ? '' : '.off'), { title: ok ? '' : SB.targets.why() }, h('span.blab', null, 'Blend'), sel); })(),
      subh('Pivot'), h('div.pivrow', null, h('div.g2', null, cfield(o, 'ax', 'X', { set: (x, v) => originSet(x, 'ax', v), title: 'Pivot X' }), cfield(o, 'ay', 'Y', { set: (x, v) => originSet(x, 'ay', v), title: 'Pivot Y' })), grid),
      h('div.row.btns', null, W.btn(orKeyed ? 'Pivot is animated' : 'Animate pivot', () => {
        if (orKeyed) { const tr = TR.transform(o, tree.localTime(o)); delete o.tracks.ax; delete o.tracks.ay; o.ax = tr.ax; o.ay = tr.ay; } else { const tr = TR.transform(o, tree.localTime(o)); TR.keyMany(o, { ax: U.r1(tr.ax), ay: U.r1(tr.ay) }); SB.toast('Pivot keyed. Move the playhead and drag the pink cross.'); }
        SB.commit(); }, { cls: 'sm ghost' + (orKeyed ? ' on' : '') })),
    ], { key: 'pos', badge: TR.anyKeys(o) ? h('span.badge', null, 'Animated') : null });
  }
  /** A Figma-style paint row: keyframe, color chip, hex code, and an eye to switch it off. */
  function paintRow(o, k, label, onK) {
    const f = { k, anim: true }, v = FL.read(o, f) || '#000000';
    // the code box shows the hex (with its opacity when see-through), or the kind of paint: Linear gradient, Pattern
    const txt = c => { const k = SB.paint.kind(c); return k === 'grad' ? (SB.paint.parse(c).type === 'radial' ? 'Radial gradient' : 'Linear gradient') : k === 'tex' ? 'Pattern' : String(c).toUpperCase().replace('#', ''); };
    const hex = h('input.hex', { type: 'text', value: txt(v), maxlength: 9, 'aria-label': label + ' color' }), hash = h('span.hash', null, '#'), mark = c => { hex.readOnly = SB.paint.kind(c) !== 'solid'; hash.hidden = hex.readOnly; }; mark(v);
    const sw = W.colorBtn(v, { label, paint: true, input: x => { FL.write(o, f, x, false); hex.value = txt(x); mark(x); }, change: x => FL.write(o, f, x, true) });
    hex.onchange = () => { let c = hex.value.trim(); if (!c.startsWith('#')) c = '#' + c; if (/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(c)) { FL.write(o, f, c.toUpperCase(), true); sw._set(c); } else hex.value = txt(FL.read(o, f)); };
    hex.dataset.live = '1'; hex._refresh = () => { if (document.activeElement === hex) return; const c = FL.read(o, f); hex.value = txt(c); mark(c); sw._set(c); };
    const on = onK ? o[onK] !== false : true;
    return h('div.paint' + (on ? '' : '.off'), null, FL.keyButton(o, k), sw, hash, hex,
      onK ? W.iconBtn(on ? 'eye' : 'eyeOff', on ? `Hide the ${label.toLowerCase()}` : `Show the ${label.toLowerCase()}`, () => { tree.selected().filter(x => x.type === o.type).forEach(x => x[onK] = !on); SB.commit(); }, 'sm') : null);
  }
  /** Shape, laid out like Figma: the kind as icons, W and H, Fill and Stroke rows. */
  function shapeSection(o) {
    const kinds = h('div.kinds', null, Object.entries(SB.SHAPES).map(([k, v]) => h('button' + (o.shape === k ? '.on' : ''), { type: 'button', title: v, 'aria-label': v, html: SB.icon(SB.SHAPE_ICONS[k]), onclick: () => { tree.selected().filter(x => x.type === 'shape').forEach(x => x.shape = k); SB.commit(); } })));
    return sec('Shape', [kinds,
      subh('Size'), h('div.g2', null, cfield(o, 'w', 'W', { title: 'Width' }), cfield(o, 'h', 'H', { title: 'Height' })),
      o.shape === 'round' ? [subh('Corners'), FL.row(o, { k: 'radius', label: 'Round %', type: 'range', min: 0, max: 50, anim: true, single: true })] : null,
      SB.hasSides(o) ? [subh(o.shape === 'star' ? 'Points' : 'Corners'), sidesRow(o)] : null,
      subh('Fill'), paintRow(o, 'fill', 'Fill', 'fillOn'),
      subh('Stroke'), paintRow(o, 'stroke', 'Stroke'), h('div.g2', null, cfield(o, 'strokeW', '≡', { title: 'Stroke width', unit: 'px' })),
      h('div.row.btns', null, W.btn('Convert to editable path', () => SB.ops.shapeToPath(o), { cls: 'sm ghost' }))], { key: 'shape' });
  }
  /** How many corners (polygon) or points (star), like Figma's Count: − and + buttons, a number, or drag the slider. */
  function sidesRow(o) {
    const set = v => { const n = U.clamp(Math.round(v), 3, 60); tree.selected().filter(x => SB.hasSides(x) && x.shape === o.shape).forEach(x => x.sides = n); SB.commit(); };
    const n = SB.shapeSides(o);
    return h('div.sides-row', null, W.iconBtn('minus', 'Fewer', () => set(n - 1), 'sm'),
      W.range(n, { min: 3, max: 20, step: 1, label: o.shape === 'star' ? 'Points' : 'Corners', input: v => { tree.selected().filter(x => SB.hasSides(x) && x.shape === o.shape).forEach(x => x.sides = U.clamp(Math.round(v), 3, 60)); SB.bump(); }, change: set }),
      W.iconBtn('plus', 'More', () => set(n + 1), 'sm'));
  }
  /** Sections drawn here instead of the type's plain field list. */
  I.typeSections = { shape: shapeSection };
  /** One effect: on/off, its parameters (animatable), remove. */
  I.fxItem = (o, e) => fxItem(o, e);
  function fxItem(o, e) {
    const d = SB.effects.get(e.type), on = TR.now(o, `fx:${e.id}:on`);
    const same = o.effects.filter(x => x.type === e.type), name = same.length > 1 ? `${d.label} ${same.indexOf(e) + 1}` : d.label;
    const chk = W.check(on, name, v => { TR.set(o, `fx:${e.id}:on`, v); tree.others(o).forEach(x => (x.effects || []).filter(y => y.type === e.type).forEach(y => y.on = v)); SB.commit(); });
    const rows = Object.entries(d.params).map(([k, p]) => p.options
      ? FL.row(o, { label: p.label, type: 'select', options: p.options, get: () => e[k] ?? p.def, set: (x, v) => (x === o ? [e] : (x.effects || []).filter(y => y.type === e.type)).forEach(y => y[k] = v) })
      : p.type === 'color' ? FL.row(o, { k: `fx:${e.id}:${k}`, label: p.label, type: 'color', anim: true, single: true })
      : FL.row(o, { k: `fx:${e.id}:${k}`, label: p.label, type: 'range', min: p.min, max: p.max, step: p.step, anim: true, single: true }));
    const lost = !SB.fx.usable(d), warned = !lost && SB.fx.warned(d); // the project's target can't carry it (not exported), or only drawn into pictures (yellow)
    const wtxt = warned ? (SB.targets.get() === 'blender' ? `Not recommended for Blender: drawn frame by frame when exporting (heavier files, can’t be changed in Blender).` : `Not recommended for game engines: drawn onto the sprite (when it doesn’t change) or frame by frame when exporting. Heavier, and it can look a little different.`) : '';
    return h('div.fxitem' + (on ? '' : '.off') + (lost ? '.lost' : '') + (warned ? '.warned' : ''), warned ? { title: wtxt } : null, lost ? h('p.hint.warn', null, `Not exported to ${SB.targets.short()}.`) : warned ? h('p.hint.bake.fx-nr.keep', { title: wtxt }, h('b', null, `(${SB.targets.NOT_REC}) `), SB.targets.get() === 'blender' ? 'Blender can’t make it: drawn frame by frame.' : 'Game engines can’t make it: drawn into the pictures.') : null, h('div.hd', null, h('span.row', null, FL.keyButton(o, `fx:${e.id}:on`), chk), d.designed ? W.iconBtn('edit', 'Edit this transition', () => SB.transitions.open((S.doc.transitions || []).find(t => 'tr:' + t.id === e.type)), 'sm') : d.fxDesign && SB.fxDesigner ? W.iconBtn('edit', 'Edit this effect in the designer', () => SB.fxDesigner.open(SB.fxDesigner.find(d.fxDesign)), 'sm') : null, SB.fx.timed(e) ? W.iconBtn('play', 'Preview it on the stage (the playhead runs over it once)', () => SB.fx.preview(o, e), 'sm') : null, W.iconBtn('x', 'Remove', () => { SB.fx.remove(o, e.id); tree.others(o).forEach(x => (x.effects || []).filter(y => y.type === e.type).forEach(y => SB.fx.remove(x, y.id))); SB.commit(); }, 'sm')), ...rows);
  }
  /** "Add …" picker for some kinds of effects, grouped by kind. */
  function fxAdder(o, cats, text) {
    const avail = SB.fx.available(o).filter(d => cats.includes(d.cat)); if (!avail.length) return null;
    const sel = h('select.addsel', { 'aria-label': text }, h('option', { value: '' }, text),
      cats.map(cat => { const list = avail.filter(d => d.cat === cat); return list.length ? h('optgroup', { label: SB.FX_CATS[cat] }, list.map(d => h('option', { value: d.id, disabled: !SB.fx.usable(d) }, d.label + (!SB.fx.usable(d) ? ` (not in ${SB.targets.short()})` : SB.fx.warned(d) ? ` (${SB.targets.NOT_REC})` : '')))) : null; }));
    sel.onchange = () => { if (!sel.value) return; const d = SB.effects.get(sel.value); SB.fx.add(tree.selected(), sel.value); if (!S.playing && !tree.inRange(o)) tree.goLocal(o, 0.0001); SB.toast(`${d.label} added${d.cat === 'in' ? '. It plays at the start of the clip' : d.cat === 'out' ? '. It plays at the end of the clip' : ''}. Press Space to preview.`); };
    return sel;
  }
  /** Effects (looks and animated effects) and Transitions (in and out) are two sections. */
  function fxSection(o, title, cats, addText, key) {
    if (!SB.types.get(o.type).fx) return null;
    const list = o.effects.filter(e => { const d = SB.effects.get(e.type); return d && cats.includes(d.cat); });
    const timed = list.some(SB.fx.timed);
    const tgt = SB.targets ? SB.targets.get() : 'video';
    return sec(title, [...list.map(e => fxItem(o, e)), fxAdder(o, cats, addText), tgt !== 'video' ? h('p.hint', null, tgt === 'game' || tgt === 'blender' ? `Made for ${SB.targets.LIST[tgt].short}: effects it can’t make itself still work, marked yellow (${SB.targets.NOT_REC}): they are drawn into pictures when exporting.` : `Made for ${SB.targets.LIST[tgt].short}: effects it can’t carry are greyed out.`) : null,
      cats.includes('in') && SB.transitions ? h('div.row.btns', null, W.btn('Design a transition…', () => SB.transitions.open(null, tr => { SB.fx.add(tree.selected(), 'tr:' + tr.id); }), { cls: 'sm ghost', icon: 'plus' })) : null,
      cats.includes('loop') && SB.fxDesigner ? h('div.row.btns', null, W.btn('Design an effect…', () => SB.fxDesigner.open(null), { cls: 'sm ghost', icon: 'fx', title: 'Make your own effect: pick what changes and how, no code' })) : null,
      timed && !o.showProps ? h('div.row.btns', null, W.btn('Time them in the timeline', () => { o.showProps = true; SB.commit(); }, { cls: 'sm ghost', icon: 'rows' })) : null], { key, closed: !list.length, badge: list.length ? h('span.badge', null, String(list.length)) : null });
  }
  const effects = o => fxSection(o, 'Effects', ['static', 'loop'], 'Add an effect…', 'fx');
  const transitions = o => fxSection(o, 'Transitions', ['in', 'out'], 'Add a transition…', 'trans');
  /** Mask: a layer that is not a mask yet can become one (Arrange lives in the right-click menu). */
  function maskSection(o) {
    const def = SB.types.get(o.type); if (o.isMask || !def.fx || o.type === 'rig' || !def.visual || def.render === false) return null;
    const items = tree.selected();
    return sec('Mask', [h('p.hint', null, items.length > 1 ? 'The top selected layer cuts the others.' : 'Use this layer to cut the layer below it: both go into a new group.'),
      (() => { const b = W.btn(items.length > 1 ? 'Mask with the top layer' : 'Use as mask', () => SB.ops.makeMask(), { cls: 'sm', icon: 'mask' }); if (SB.targets && !SB.targets.allows('mask')) { b.disabled = true; b.title = SB.targets.why(); } return h('div.row.btns', null, b); })()], { key: 'maskc', closed: true });
  }
  /** The sizes to add a screen in, like the stage's right-click menu. */
  function addScreenMenu(btn) { const r = btn.getBoundingClientRect(); SB.menu.open(r.left, r.bottom + 4, [{ head: 'Add a screen' }, ...SB.screens.SIZES.map(([k, v]) => ({ label: v, run: () => { const s = SB.screens.add(k); SB.board.focus(s, true); SB.board.fitAll(); SB.commit(); SB.toast(`${s.name} added.`); } })), ...tmplItems(), '-', { label: 'Draw one on the board', icon: 'screen', run: () => SB.tool.set('screen') }]); }
  /** "From template" entries for the add-a-screen menus. */
  const tmplItems = () => { const L = SB.templates ? SB.templates.list() : []; return L.length ? ['-', { head: 'From template' }, ...L.map(m => ({ label: m.tmpl.name, icon: 'library', run: () => { const s = SB.templates.addFrom(m); SB.board.focus(s, true); SB.board.fitAll(); SB.commit(); SB.toast(`${s.name} made from ${m.tmpl.name}. Animate it here; changes to ${m.name} reach it too.`); } }))] : []; };
  SB.tmplItems = tmplItems;
  /** The template part of the screen section: save as template, or where this screen comes from. */
  function tmplRow(s) {
    const T = SB.templates; if (!T || !s || s.editOf) return null; const m = T.of(s);
    if (s.tmpl) { const n = T.children(s).length;
      return [h('p.hint', null, `Template “${s.tmpl.name}”. ${n ? `${n} screen${n > 1 ? 's are' : ' is'} made from it. Press Update to send your changes there; each keeps its own animation.` : 'Add a screen › From template to make an animation from it.'}`),
        h('div.row.btns', null, n ? W.btn(T.stale(s) ? `Update ${n} screen${n > 1 ? 's' : ''}` : 'Copies are up to date', () => T.push(s), { cls: 'sm' + (T.stale(s) ? ' primary' : ' ghost'), icon: 'library' }) : null, W.btn('Stop being a template', () => T.unmake(s), { cls: 'sm ghost' }))]; }
    if (m) return h('p.hint', null, `Made from the template ${m.tmpl.name} (${m.name}). Its layers follow every change there and can't be deleted here; animate them and add your own layers freely.`);
    return h('div.row.btns', null, W.btn('Save as screen template', () => T.make(s), { cls: 'sm', icon: 'library', title: 'New screens can start from this one; changes here reach them all' }));
  }
  function project() {
    const p = S.project, many = SB.screens.many(), act = SB.screens.active();
    const screens = many ? sec('Screens', [
      h('div.scrlist', null, S.screens.map(s => h('div.scrrow' + (s === act ? '.on' : ''), null,
        W.iconBtn('screen', s === act ? 'You are working on this screen' : 'Work on this screen', () => SB.board.focus(s), 'sm'),
        h('span.grow', { onclick: () => SB.board.focus(s) }, h('b', null, s.name), s.tmpl ? h('span.cl-badge.tmpl', null, 'template') : s.from && SB.screens.find(s.from) ? h('span.cl-badge', null, 'from ' + SB.screens.find(s.from).tmpl.name) : null, h('small', null, ` ${s.proj.w}×${s.proj.h} · ${U.r2(s.proj.duration)}s`)),
        W.iconBtn('edit', 'Edit this screen: size, length, background', () => SB.settings.screen(s), 'sm'),
        W.iconBtn('copy', 'Duplicate screen', () => { const c = SB.screens.duplicate(s); SB.board.focus(c, true); SB.board.fitAll(); SB.commit(); }, 'sm'),
        W.iconBtn('trash', 'Delete screen', () => SB.board.remove(s), 'sm')))),
      h('div.row.btns', null, W.btn('Add a screen', e => addScreenMenu(e.currentTarget), { cls: 'sm', icon: 'plus' }), W.btn('Show all', () => SB.board.fitAll(), { cls: 'sm ghost', icon: 'fit' })),
    ]) : null;
    const scr = sec(many ? 'This screen' : 'Project', [
      many ? FL.row(act, { k: 'name', label: 'Screen name', type: 'text', single: true, after: () => SB.dirty() }) : FL.row(p, { k: 'name', label: 'Name', type: 'text', single: true, after: () => SB.invalidate('top') }),
      W.row('Frame rate', W.num(p.fps, { min: 1, max: 240, step: 1, label: 'Frame rate (any number, 1 to 240)', change: v => { const f = U.clamp(Math.round(+v || p.fps), 1, 240); if (f !== p.fps) { p.fps = f; SB.commit(); SB.invalidate('inspector', 'timeline'); } } }), h('span.hint', null, 'fps')),
      W.row('Length (s)', W.num(p.duration, { min: 0.5, max: 600, step: 0.5, label: 'Length', change: v => { p.duration = U.clamp(v, 0.5, 600); p.fixedLen = true; SB.commit(); } })),
      h('p.hint', null, 'Layers longer than the screen keep their keyframes; the animation just ends here.'),
      tmplRow(act),
      h('p.hint', null, `${p.w} × ${p.h} px. ` + (many ? 'Every screen has its own size, length, background and timeline.' : 'Change the size, frame rate and background in Project settings.')),
      h('div.row.btns', null, W.btn(many ? 'Screen settings' : 'Project settings', () => SB.settings.open('project'), { cls: 'sm', icon: 'gear' }), many ? null : W.btn('Add a screen', e => addScreenMenu(e.currentTarget), { cls: 'sm ghost', icon: 'screen' })),
    ]);
    return h('div', null, screens, scr, ...(I.project || []).map(f => f()), sec('Getting around', [h('p.hint', null, 'Drag with two fingers, the middle mouse button or Space to move around the stage. Pinch, Ctrl + wheel or the + − buttons zoom. Long-press or right-click anything for more options.'), SB.keys.cheatsheet()], { closed: true }));
  }
  function render() {
    const el = U.$('#inspector'), o = tree.sel(), top = el.scrollTop;
    // lists that scroll on their own (bones…) keep their place too
    const inner = [...el.querySelectorAll('.bonelist, [data-keep-scroll]')].map((x, i) => [x.className + i, x.scrollTop]);
    const restore = () => { const now = [...el.querySelectorAll('.bonelist, [data-keep-scroll]')]; inner.forEach(([k, t]) => { const x = now.find((y, i) => y.className + i === k); if (x) x.scrollTop = t; }); };
    if (S.ixMode && SB.ix) { el.replaceChildren(...SB.ix.inspector().flat(3).filter(Boolean)); W.tidyHints(el); el.scrollTop = top; restore(); return; } // interactive mode (js/ui/interact.js)
    if (!o) { el.replaceChildren(project()); W.tidyHints(el); return; }
    const def = SB.types.get(o.type);
    const parts = [header(o), timing(o), ...I.top.map(f => f(o)), ...(I.typeSections[o.type] ? [I.typeSections[o.type](o)] : (def.sections ? def.sections(o) : []).map(s => sec(s.title, s.fields.filter(Boolean).map(f => FL.row(o, f)), { closed: s.closed }))), transform(o), effects(o), transitions(o), ...I.extra.map(f => f(o)), maskSection(o)];
    el.replaceChildren(...parts.flat(3).filter(Boolean)); W.tidyHints(el); el.scrollTop = top; restore();
  }
  SB.panel('inspector', render);
  SB.on('time', () => SB.fields.refresh(U.$('#inspector')));
})(window.SB);
