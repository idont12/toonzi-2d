/* The app frame: layouts (desktop, tablet, phone), top bar, tool rail,
   transport buttons, dock resizing and tabs, tooltips, the empty-state card. */
'use strict';
(function (SB) {
  const U = SB.util, S = SB.state, h = U.h, W = SB.w, tree = SB.tree;
  const app = () => U.$('#app');

  // ---------- layout
  const L = SB.layout = {
    current: 'desktop',
    /** Pick the layout from the window size unless the user chose one in settings. */
    detect() {
      const w = innerWidth, hgt = innerHeight;
      if (S.layout !== 'auto') return S.layout;
      if (w < 700 || (w < 900 && hgt > w * 1.15)) return 'phone';
      if (w < 1180) return 'tablet';
      return 'desktop';
    },
    apply() {
      const a = app(), lay = L.detect(), touch = matchMedia('(pointer: coarse)').matches || S.layout === 'phone' || S.layout === 'tablet';
      a.dataset.touch = touch ? '1' : '0'; document.documentElement.dataset.touch = a.dataset.touch;
      if (lay !== L.current || !a.dataset.layout) {
        L.current = lay; a.dataset.layout = lay;
        const insp = U.$('#inspector');
        if (lay === 'phone') U.$('#dockProps').appendChild(insp); else if (insp.parentElement !== a) a.insertBefore(insp, U.$('#dock'));
        if (!a.dataset.tab) a.dataset.tab = 'timeline';
        const def = lay === 'phone' ? Math.round(innerHeight * 0.38) : lay === 'tablet' ? 260 : 290;
        a.style.setProperty('--dock-h', (S.dockH && S.dockH[lay] || def) + 'px');
        if (S.miniH) a.style.setProperty('--mini-h', S.miniH + 'px');
        const iw = S.inspW && S.inspW[lay]; a.style.setProperty(lay === 'tablet' ? '--insp-t' : '--insp', (iw || (lay === 'tablet' ? 340 : 300)) + 'px');
        SB.invalidate();
      }
      a.classList.toggle('focus', !!S.focus); a.dataset.ftl = S.focusTl || 'seq'; a.dataset.labels = S.labels ? '1' : '0';
      SB.view.fit();
    },
    toggleInspector(force) { const a = app(); if (L.current === 'phone' && !S.focus) { L.tab(a.dataset.tab === 'props' && force !== true ? 'timeline' : 'props'); return; } a.classList.toggle('insp-open', force ?? !a.classList.contains('insp-open')); if (S.focus) { S.focusInsp = a.classList.contains('insp-open'); SB.invalidate('inspector', 'transport'); requestAnimationFrame(() => SB.view.fit && SB.view.fit()); } }, // in Big stage the panel opens beside the stage
    /** Big stage shows either the timeline ('seq') or the drawing frames ('frames'). */
    focusTimeline(v) { S.focusTl = v; app().dataset.ftl = v; SB.invalidate('transport', 'frames', 'timeline'); },
    tab(t) { app().dataset.tab = t; SB.invalidate('tabs', 'timeline', 'inspector'); },
    /** Big stage: hide the panels, keep a small timeline of the selected layers with the play controls. */
    focus(v = !S.focus) { if (!v && SB.stageModes) SB.stageModes.setPreview(false); S.focus = v; app().classList.toggle('insp-open', !!(v && S.focusInsp)); L.apply(); SB.toast(v ? 'Big stage. The timeline shows only the layers you select. Press F to bring the panels back.' : 'Panels are back.'); SB.invalidate(); },
  };
  addEventListener('resize', () => L.apply());

  /** An icon button that also shows its name when Settings › Button names is on. */
  const nb = (icon, title, run, cls, name) => { const b = W.iconBtn(icon, title, run, cls); if (S.btnLabels && L.current !== 'phone' && name) { b.classList.add('lbl'); b.appendChild(h('span', null, name)); } return b; };
  // ---------- top bar
  SB.panel('top', () => {
    const left = U.$('#topLeft'), right = U.$('#topRight'), phone = L.current === 'phone';
    // Snap is a view switch like in Genially's top bar: always visible, highlighted when on
    const snap = h('button.ib.snapbtn' + (S.snap ? '.on' : '') + (S.btnLabels && !phone ? '.lbl' : ''), { type: 'button', title: `Snap and alignment guides: ${S.snap ? 'on' : 'off'} (${SB.keys.label('snap')})`, 'aria-label': 'Snap and guides', 'aria-pressed': String(!!S.snap), html: SB.icon('magnet') + (S.btnLabels && !phone ? '<span>Snap</span>' : ''), onclick: () => SB.snapToggle() });
    left.replaceChildren(nb('undo', 'Undo (Ctrl+Z)', SB.undo, '', 'Undo'), nb('redo', 'Redo (Ctrl+Shift+Z)', SB.redo, '', 'Redo'), h('span.vsep'), snap);
    left.children[0].disabled = !SB.canUndo(); left.children[1].disabled = !SB.canRedo();
    // the logo is the main menu: file, export, settings (the bar keeps only what you use while working)
    const logo = U.$('.top .logo');
    if (logo && !logo._wired) {
      logo._wired = true; logo.removeAttribute('aria-hidden'); logo.setAttribute('role', 'button'); logo.tabIndex = 0; logo.setAttribute('aria-label', 'Menu: file, export and settings'); logo.title = 'Menu: file, export and settings';
      /* just the mascot: no box, no arrow */
      logo.addEventListener('click', () => SB.menus.file(logo)); logo.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); SB.menus.file(logo); } });
    }
    right.replaceChildren(...[
      SB.targets ? SB.targets.chip(phone) : null,
      phone ? null : nb('gear', 'Settings', () => SB.settings.open(), '', 'Settings'),
      L.current === 'tablet' ? W.iconBtn('panel', 'Properties', () => L.toggleInspector(), app().classList.contains('insp-open') ? 'on' : '') : null,
      nb('focus', 'Big stage (F)', () => L.focus(), S.focus ? 'on' : '', 'Big stage')].filter(Boolean));
    U.$('#projName').value = S.project.name;
    const fm = U.$('#focusMenu'); fm.innerHTML = SB.icon('menu'); fm.onclick = focusMenu;
  });
  SB.on('commit', () => SB.invalidate('top'));

  // ---------- tool rail
  const ADD = [
    { icon: 'draw', label: 'Drawing', tip: 'New drawing layer', run: () => SB.add.drawing() },
    { icon: 'text', label: 'Text', tip: 'Add text (T)', run: () => SB.add.text() },
    { icon: 'shape', label: 'Shape', tip: 'Add a shape', run: b => SB.add.shapeMenu(b) },
    { icon: 'import', label: 'Import', tip: 'Import files or record your voice', run: b => SB.add.importMenu(b) },
  ];
  /** The tool bar is customizable, with layouts like the timeline bar's: a layout gives { order: [ids], group: { childId: headId } }
      (ids 'tool:<toolId>', 'add:<icon>', 'sep…' for a divider); what is not in its order is hidden. You pick one (Settings › Appearance,
      or the bar's editor; S.railLayout); your changes are kept per layout (S.railEdits), layouts of your own in S.railCustom ('c:<id>').
      Tool groups work like Illustrator: one button shows one tool of its group; right-click or press and hold it to pick another
      tool of the group, which then shows in the bar (S.railActive). */
  const RAIL_PRESETS = {
    studio: { label: 'Toonzi 2D (default)', order: ['tool:select', 'tool:brush', 'tool:eraser', 'tool:fill', 'tool:fillbrush', 'tool:gradient', 'tool:smooth', 'tool:width', 'tool:pull', 'tool:pen', 'tool:points', 'tool:hand', 'tool:cut', 'tool:screen', 'tool:bone', 'sep', 'add:draw', 'add:text', 'add:shape', 'add:import'], group: { 'tool:points': 'tool:pen', 'tool:fillbrush': 'tool:brush', 'tool:gradient': 'tool:fill', 'tool:width': 'tool:smooth', 'tool:pull': 'tool:smooth' } },
    flash: { label: 'Adobe Animate (Flash)', order: ['tool:select', 'tool:points', 'tool:pen', 'tool:brush', 'tool:fill', 'tool:fillbrush', 'tool:gradient', 'tool:eraser', 'tool:bone', 'tool:hand', 'sep', 'add:text', 'add:shape', 'add:import'], group: {} },
    photoshop: { label: 'Photoshop', order: ['tool:select', 'tool:brush', 'tool:eraser', 'tool:fill', 'tool:fillbrush', 'tool:gradient', 'tool:smooth', 'tool:pull', 'tool:pen', 'tool:points', 'tool:hand', 'sep', 'add:text', 'add:shape', 'add:import'], group: { 'tool:points': 'tool:pen', 'tool:smooth': 'tool:brush', 'tool:pull': 'tool:brush' } },
    opentoonz: { label: 'OpenToonz', order: ['tool:select', 'tool:brush', 'tool:fill', 'tool:fillbrush', 'tool:gradient', 'tool:eraser', 'tool:smooth', 'tool:width', 'tool:pull', 'tool:pen', 'tool:points', 'tool:cut', 'tool:bone', 'tool:hand', 'sep', 'add:draw', 'add:text'], group: {} },
    all: { label: 'Every tool', order: ['tool:select', 'tool:points', 'tool:brush', 'tool:pen', 'tool:eraser', 'tool:fill', 'tool:fillbrush', 'tool:gradient', 'tool:smooth', 'tool:width', 'tool:pull', 'tool:hand', 'tool:cut', 'tool:screen', 'tool:bone', 'sep', 'add:draw', 'add:text', 'add:shape', 'add:import'], group: {} },
    simple: { label: 'Simple', order: ['tool:select', 'tool:brush', 'tool:eraser', 'tool:fill', 'tool:fillbrush', 'tool:gradient', 'tool:hand', 'sep', 'add:text', 'add:shape'], group: {} },
  };
  const railCustom = id => (S.railCustom || []).find(c => 'c:' + c.id === id);
  const railLayout = () => S.railLayout && (RAIL_PRESETS[S.railLayout] || railCustom(S.railLayout)) ? S.railLayout : 'studio';
  const railAllIds = () => [...SB.tools.all().filter(t => !t.hidden).map(t => 'tool:' + t.id), ...ADD.map(a => 'add:' + a.icon)];
  /** The tool bar now: your changes for this layout, or the layout itself (an earlier customized bar, S.rail, counts as changes to the default). */
  function railCfg() {
    const L0 = railLayout(), cu = railCustom(L0), old = !S.railEdits && L0 === 'studio' && S.rail && S.rail.order ? S.rail : null, ed = cu || (S.railEdits && S.railEdits[L0]) || old;
    if (L0 === 'studio' && ed && ed.group && !ed.split47) { // round 47: the bucket and the gradient are their own group, apart from the brushes
      if (ed.group['tool:fill'] === 'tool:brush') delete ed.group['tool:fill']; if (ed.group['tool:gradient'] === 'tool:brush') ed.group['tool:gradient'] = 'tool:fill'; ed.split47 = true;
    }
    const P = RAIL_PRESETS[L0] || RAIL_PRESETS.studio, order = (ed ? ed.order : P.order).slice(), hidden = ed ? (ed.hidden || []).slice() : [], group = Object.assign({}, ed ? ed.group || (old ? DEFAULT_GROUPS : {}) : P.group);
    for (const id of railAllIds()) if (!order.includes(id)) {
      const after = NEW_TOOLS[id], at = after ? order.indexOf(after) : -1; // a tool added in an update sits next to its kin, in a bar you changed too
      if (at >= 0 && ed && !(ed.known || []).includes(id)) { order.splice(at + 1, 0, id); if (group[after]) group[id] = group[after]; else if (hidden.includes(after)) hidden.push(id); continue; }
      order.push(id); if (!ed || !(ed.known || []).includes(id)) hidden.push(id);
    }
    return { order, hidden, group };
  }
  const DEFAULT_GROUPS = { 'tool:points': 'tool:pen' };
  const NEW_TOOLS = { 'tool:fillbrush': 'tool:fill', 'tool:gradient': 'tool:fillbrush' }; // new tool → the tool it goes after
  const groups = () => railCfg().group;
  function railItems() {
    const all = new Map(), cfg = railCfg();
    for (const t of SB.tools.all()) if (!t.hidden) { const off = !!(t.feature && SB.targets && !SB.targets.allows(t.feature)); all.set('tool:' + t.id, { id: 'tool:' + t.id, icon: t.icon, label: t.label, off, tip: off ? `${t.label}: ${SB.targets.why()}` : `${t.tip || t.label} (${SB.keys.label(t.id)})`, on: () => S.tool === t.id, run: () => SB.tool.set(t.id) }); }
    cfg.order.filter(id => id.startsWith('sep')).forEach(id => all.set(id, { id, label: 'Divider', sep: true })); // dividers can be added and removed
    for (const a of ADD) all.set('add:' + a.icon, { id: 'add:' + a.icon, icon: a.icon, label: a.label, tip: a.tip, run: a.run });
    return cfg.order.filter(id => all.has(id)).map(id => all.get(id));
  }
  const railHidden = id => railCfg().hidden.includes(id);
  function saveRail(order, hidden, group) { const L0 = railLayout(), cu = railCustom(L0), v = { order, hidden, group: group || railCfg().group, known: railAllIds() }; if (cu) Object.assign(cu, v); else S.railEdits = Object.assign({}, S.railEdits, { [L0]: v }); SB.prefs.save(); SB.invalidate('rail'); }
  SB.railLayouts = { get PRESETS() { return RAIL_PRESETS; }, modes: () => listModes(RAIL_PRESETS, S.railCustom), get: () => railLayout(), set: v => { S.railLayout = v; SB.prefs.save(); SB.invalidate('rail'); } };
  const isSep = id => id.startsWith('sep');
  /** Fillers of a bar: dividers ('sep…'), spaces that push the rest to the end ('space…') and small gaps ('gap…'). */
  const isFill = id => /^(sep|space|gap)/.test(id);
  const FILL = { sep: ['Divider', null], space: ['Space', 'swap'], gap: ['Small gap', 'fit'] };
  const fillItem = id => { const k = id.match(/^(sep|space|gap)/)[1]; return { id, label: FILL[k][0], icon: FILL[k][1], sep: k === 'sep', fill: k }; };
  /** Move id (with its group members if it heads a group) so it lands at index idx of order,
      then fix its group: between members of a group it joins that group; a member stays in the
      group right above it; anywhere else it is a top-level tool. nest: join the group of that id instead. */
  function place(order, g, id, idx, nest) {
    const kids = order.filter(x => g[x] === id), block = [id, ...kids];
    const rest = order.filter(x => !block.includes(x)); idx = U.clamp(idx, 0, rest.length);
    if (nest) { const head = g[nest] || nest; let last = rest.indexOf(head); rest.forEach((x, k) => { if (g[x] === head) last = Math.max(last, k); }); idx = last + 1; }
    rest.splice(idx, 0, ...block);
    if (nest) { const head = g[nest] || nest; g[id] = head; kids.forEach(k => g[k] = head); }
    else {
      const i = rest.indexOf(id), above = rest[i - 1], below = rest[i + block.length], headOf = x => x && !isFill(x) ? (g[x] || x) : null, hA = headOf(above), hasKids = h0 => Object.values(g).includes(h0);
      if (below && g[below] && hA === g[below] && g[below] !== id) { g[id] = g[below]; kids.forEach(k => g[k] = g[below]); }
      else if (g[id] && hA && hA !== id && (g[above] || hasKids(hA))) g[id] = hA;
      else delete g[id];
    }
    order.splice(0, order.length, ...rest);
  }
  /** Rows you can drag by their grip. Dropping on the middle of a row calls onDrop(from, null, toId) when canNest(row);
      dropping between rows calls onDrop(from, index). Works with mouse and touch. */
  function dragRows(list, onDrop, canNest) {
    list.addEventListener('pointerdown', e => {
      const grip = e.target.closest('.rc-grip'); if (!grip) return; e.preventDefault(); const row = grip.parentElement, rows = [...list.children].filter(r => r.dataset.id), from = row.dataset.id;
      row.classList.add('dragging'); list.setPointerCapture(e.pointerId); const y0 = e.clientY, boxes = rows.map(r => r.getBoundingClientRect()); let drop = null;
      const clear = () => rows.forEach(r => r.classList.remove('nest', 'before', 'after'));
      const mv = ev => {
        row.style.transform = `translateY(${ev.clientY - y0}px)`; clear(); drop = null;
        for (let k = 0; k < rows.length; k++) { const b = boxes[k], r = rows[k]; if (r === row || ev.clientY < b.top || ev.clientY > b.bottom) continue; const rel = (ev.clientY - b.top) / b.height;
          if (canNest && canNest(row.dataset.id, r.dataset.id) && rel > 0.28 && rel < 0.72) { r.classList.add('nest'); drop = { nest: r.dataset.id }; }
          else { const after = rel >= 0.5; r.classList.add(after ? 'after' : 'before'); drop = { at: r.dataset.id, after }; } break; }
        if (!drop && ev.clientY < boxes[0].top) drop = { at: rows[0].dataset.id, after: false };
        if (!drop && ev.clientY > boxes[boxes.length - 1].bottom) drop = { at: rows[rows.length - 1].dataset.id, after: true };
      };
      const up = () => { list.removeEventListener('pointermove', mv); list.removeEventListener('pointerup', up); row.classList.remove('dragging'); row.style.transform = ''; clear(); if (drop && drop.at !== from) onDrop(from, drop); };
      list.addEventListener('pointermove', mv); list.addEventListener('pointerup', up);
    });
  }
  /** Which buttons each row of the tool bar editor shows (the ⋯ menu at its top). */
  const railUi = () => Object.assign({ link: true, arrows: true, eye: true }, S.railUi);
  /** An editor for a bar of buttons, laid out like the tool bar: drag a row to reorder it, drop it on another
      row to put them in one group (the bar shows one button of a group; right-click or hold it for the others),
      the link button groups a row with the one above, the eye hides a button, dividers can be added.
      cfg: { title, word, items() → [{ id, icon, label, sep }] in bar order, hidden() → ids, groups() → { memberId: headId },
             save(order, hidden, groups), reset(), fixed: ids that always show and stay alone, solo: ids that can't be grouped, side } */
  function groupEditor(btn, cfg) {
    const box = h('div.railcfg'), fixed = cfg.fixed || [], solo = cfg.solo || [], word = cfg.word || 'button';
    const canGroup = id => !isFill(id) && !fixed.includes(id) && !solo.includes(id);
    const adds = cfg.adds || ['sep'];
    const draw = () => {
      const items = cfg.items(), order = items.map(i => i.id), hidden = cfg.hidden().slice(), g = Object.assign({}, cfg.groups()), ui = railUi();
      const commit = () => { cfg.save(order, hidden, g); draw(); };
      const keep = [box, box.querySelector('.rc-list'), box.closest && box.closest('.pop')].filter(Boolean).map(el => [el, el.scrollTop]); // stay where you were in the list
      const move = (i, d) => { const id = order[i], rest = order.filter(x => x !== id && g[x] !== id), pos = order.slice(0, i).filter(x => g[x] !== id).length, idx = pos + d; if (idx < 0 || idx > rest.length) return; place(order, g, id, idx); commit(); };
      const rows = items.map((it, i) => { const off = hidden.includes(it.id); return h('div.rc-row' + (off ? '.off' : '') + (g[it.id] ? '.child' : ''), { dataset: { id: it.id } },
        h('span.rc-grip', { html: SB.icon('grip'), title: canGroup(it.id) ? `Drag to reorder. Drop it on another ${word} to put it in that ${word}’s group` : 'Drag to reorder' }),
        it.sep ? h('span.rc-sep') : it.fill ? h('span.rc-fill.' + it.fill) : h('span.rc-ic', { html: SB.icon(it.icon || 'more') }), h('span.rc-name', null, it.label),
        ui.link ? (it.sep || it.fill || i === 0 || !canGroup(it.id) ? h('span.rc-pad') : W.iconBtn('link', g[it.id] ? 'Take it out of the group' : `Group with the ${word} above`, () => { if (g[it.id]) delete g[it.id]; else { let j = i - 1; while (j >= 0 && (items[j].sep || !canGroup(items[j].id))) j--; if (j < 0) return; place(order, g, it.id, 0, items[j].id); } commit(); }, 'sm' + (g[it.id] ? ' on' : ''))) : null,
        ui.arrows ? [W.iconBtn('up', 'Move up', () => move(i, -1), 'sm'), W.iconBtn('down', 'Move down', () => move(i, 1), 'sm')] : null,
        ui.eye ? (it.sep || it.fill ? W.iconBtn('trash', `Remove this ${it.label.toLowerCase()}`, () => { order.splice(order.indexOf(it.id), 1); commit(); }, 'sm') :
          fixed.includes(it.id) ? h('span.rc-pad') : W.iconBtn(off ? 'eyeOff' : 'eye', off ? `Show on the ${cfg.title.toLowerCase()}` : `Hide from the ${cfg.title.toLowerCase()}`, () => { const k = hidden.indexOf(it.id); if (k >= 0) hidden.splice(k, 1); else hidden.push(it.id); commit(); }, 'sm')) : null); });
      const list = h('div.rc-list', null, rows);
      dragRows(list, (from, d) => { if (d.nest) place(order, g, from, 0, d.nest); else { const rest = order.filter(x => x !== from && g[x] !== from); let k = rest.indexOf(d.at); if (d.after) { k++; if (!g[d.at]) while (k < rest.length && g[rest[k]] === d.at) k++; } place(order, g, from, k); if (!canGroup(from)) delete g[from]; } commit(); },
        (a, b) => canGroup(a) && canGroup(b) && b !== a && g[b] !== a);
      // Add: a divider, a space or a small gap (new ones go near the top; drag them where you want them)
      const addOne = k => { order.splice(Math.min(2, order.length), 0, k + ':' + U.uid()); commit(); };
      const addBtn = () => adds.length === 1 ? W.btn('Add ' + FILL[adds[0]][0].toLowerCase(), () => addOne(adds[0]), { cls: 'sm', icon: 'plus' })
        : W.btn('Add', e => { const r = e.currentTarget.getBoundingClientRect(); SB.menu.open(r.left, r.bottom + 4, [{ head: 'Add to the bar' },
          ...adds.map(k => ({ label: { sep: 'Divider (a line)', space: 'Space (pushes the rest to the end)', gap: 'Small gap' }[k], icon: FILL[k][1] || 'label', run: () => addOne(k) }))]); }, { cls: 'sm', icon: 'plus', title: 'Add a divider, a space or a small gap' });
      const opts = W.iconBtn('more', 'Choose the buttons on each row', e => { const r = e.currentTarget.getBoundingClientRect(), set = (k, v) => { S.railUi = Object.assign(railUi(), { [k]: v }); SB.prefs.save(); draw(); };
        SB.menu.open(r.left, r.bottom + 4, [{ head: 'Show on each row' }, { label: (ui.link ? '✓ ' : '') + 'Group button', run: () => set('link', !ui.link) }, { label: (ui.arrows ? '✓ ' : '') + 'Move up and down', run: () => set('arrows', !ui.arrows) }, { label: (ui.eye ? '✓ ' : '') + 'Show and hide', run: () => set('eye', !ui.eye) }]); }, 'sm');
      box.replaceChildren(h('div.rc-top', null, h('div.cp-t', null, cfg.title), opts), ...(cfg.top ? [].concat(cfg.top(draw)) : []), list, h('p.hint.rc-hint', null, `Drag to reorder. Drop a ${word} on another to group them.`), h('div.row.rc-foot', null, addBtn(), h('span.spacer'), ...(cfg.foot ? [].concat(cfg.foot(draw)) : []), W.btn('Reset', () => { cfg.reset(); draw(); }, { cls: 'sm ghost' })));
      for (const [el, top] of keep) { const now = el === box ? box : el.classList.contains('rc-list') ? box.querySelector('.rc-list') : el; if (now) now.scrollTop = top; }
    };
    draw(); SB.popover(btn, box, { side: cfg.side, cls: 'rc' });
  }
  function customizeRail(btn) {
    const lc = layoutControls({ word: 'Tool bar', get: railLayout, modes: () => listModes(RAIL_PRESETS, S.railCustom), set: v => { S.railLayout = v; SB.prefs.save(); SB.invalidate('rail'); },
      isCustom: () => !!railCustom(railLayout()),
      saveNew: name => { const c = railCfg(), id = U.uid(); S.railCustom = (S.railCustom || []).concat([{ id, label: name, order: c.order, hidden: c.hidden, group: c.group, known: railAllIds() }]); S.railLayout = 'c:' + id; SB.prefs.save(); SB.invalidate('rail'); },
      del: () => { const m = railLayout(); S.railCustom = (S.railCustom || []).filter(c => 'c:' + c.id !== m); S.railLayout = 'studio'; SB.prefs.save(); SB.invalidate('rail'); } });
    groupEditor(btn, { title: 'Tool bar', word: 'tool', items: railItems, hidden: () => railCfg().hidden, groups, save: saveRail, fixed: ['tool:select'], top: lc.top, foot: lc.foot,
      reset: () => { const L0 = railLayout(); if (S.railEdits) delete S.railEdits[L0]; else if (L0 === 'studio') S.rail = null; SB.prefs.save(); SB.invalidate('rail'); }, side: L.current === 'phone' ? 'top' : 'right' });
  }

  /** The timeline bar's editor: the same list as the tool bar's, with groups too. */
  /** The layout picker and "save as a new layout" for a bar's editor (the timeline bar and the tool bar share it). */
  function layoutControls(k) {
    return {
      top: draw => [W.row('Layout', W.select(k.get(), k.modes(), v => { k.set(v); draw(); }, k.word + ' layout')), h('p.hint.keep', null, 'Your changes stay with each layout; Reset takes it back.')],
      foot: draw => [W.btn('Save as a new layout…', async () => { const n = await SB.dialog.prompt('New layout', 'A name for this ' + k.word.toLowerCase() + ' layout.', 'My layout'); if (!n || !n.trim()) return; k.saveNew(n.trim().slice(0, 30)); draw(); SB.toast(`Saved the layout “${n.trim()}”. Pick it any time in Settings › Appearance.`); }, { cls: 'sm', icon: 'save' }),
        k.isCustom() ? W.iconBtn('trash', 'Delete this layout', async () => { if (!(await SB.dialog.ask('Delete this layout?', 'The bar goes back to the default layout.', [{ v: 1, label: 'Delete', danger: true }]))) return; k.del(); draw(); }, 'sm') : null] };
  }
  const listModes = (P, custom) => [...Object.entries(P).map(([k, v]) => [k, v.label]), ...(custom || []).map(c => ['c:' + c.id, c.label + ' (yours)'])];
  function customizeTbar(btn) {
    const lc = layoutControls({ word: 'Timeline bar', get: tbMode, modes: () => listModes(TB_PRESETS, S.tbarCustom), set: v => { S.tbarLayout = v; SB.prefs.save(); SB.invalidate('transport'); },
      isCustom: () => !!tbCustom(tbMode()),
      saveNew: name => { const o = tbarOrder(), id = U.uid(); S.tbarCustom = (S.tbarCustom || []).concat([{ id, label: name, order: o.order, hidden: o.hidden, group: o.group, known: barItems().map(x => x.id) }]); S.tbarLayout = 'c:' + id; SB.prefs.save(); SB.invalidate('transport'); },
      del: () => { const m = tbMode(); S.tbarCustom = (S.tbarCustom || []).filter(c => 'c:' + c.id !== m); S.tbarLayout = 'studio'; SB.prefs.save(); SB.invalidate('transport'); } });
    groupEditor(btn, { title: 'Timeline bar', word: 'button', fixed: ['play'], solo: ['time', 'zoom'], adds: ['sep', 'space', 'gap'],
      items: () => { const all = barItems(), act = (S.tbar && S.tbar.active) || {}; return tbarOrder().order.map(id => { if (isFill(id)) return fillItem(id); const it = all.find(x => x.id === id); if (!it) return null; const a = act[id] && all.find(x => x.id === act[id]); return a && a.id !== id ? Object.assign({}, it, { icon: a.icon }) : it; }).filter(Boolean); }, // a group shows the icon it shows in the bar
      hidden: () => tbarOrder().hidden, groups: tbarGroups,
      save: (order, hidden, group) => { const cu = tbCustom(tbMode()), v = { order, hidden, group, known: barItems().map(x => x.id) }; if (cu) Object.assign(cu, v); else S.tbarEdits = Object.assign({}, S.tbarEdits, { [tbKey()]: v }); SB.prefs.save(); SB.invalidate('transport'); },
      reset: () => { if (S.tbarEdits) delete S.tbarEdits[tbKey()]; SB.prefs.save(); SB.invalidate('transport'); },
      top: lc.top, foot: lc.foot });
  }
  SB.tbarLayouts = { get PRESETS() { return TB_PRESETS; }, modes: () => listModes(TB_PRESETS, S.tbarCustom), get: () => tbMode(), set: v => { S.tbarLayout = v; SB.prefs.save(); SB.invalidate('transport'); } };
  const tbarGroups = () => tbarOrder().group;
  /** A grouped button in the timeline bar: right-click or hold it to pick another button of its group. */
  function tbarGroupBtn(el, head, members, ctx) {
    el.classList.add('tb-grp'); if (el.title) el.title += ' · right-click or hold for more';
    let held = false, t = 0;
    const open = () => {
      const list = h('div.pop-list.toolgrp', null, members.map(m => h('button' + (m.id === ((S.tbar && S.tbar.active) || {})[head] ? '.on' : ''), { type: 'button', html: SB.icon(m.icon) + `<span>${U.esc(m.label)}</span>`, onclick: () => {
        SB.popover.close(); S.tbar = Object.assign({}, S.tbar); S.tbar.active = Object.assign({}, S.tbar.active, { [head]: m.id }); SB.prefs.save();
        const b = m.make(ctx); SB.invalidate('transport'); if (b && b.click && b.tagName === 'BUTTON') b.click(); } })));
      SB.popover(el, list, { side: L.current === 'phone' ? 'top' : undefined });
    };
    el.addEventListener('contextmenu', e => { e.preventDefault(); e.stopPropagation(); open(); });
    el.addEventListener('pointerdown', () => { held = false; clearTimeout(t); t = setTimeout(() => { held = true; open(); }, 450); });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => el.addEventListener(ev, () => clearTimeout(t)));
    el.addEventListener('click', e => { if (held) { held = false; e.stopImmediatePropagation(); e.preventDefault(); } }, true);
  }
  /** The tools of a group, in a small list next to its button. */
  function openGroup(btn, head, members) {
    const list = h('div.pop-list.toolgrp', null, members.map(m => h('button' + (m.on && m.on() ? '.on' : ''), { type: 'button', html: SB.icon(m.icon) + `<span>${U.esc(m.label)}</span>` + (m.id.startsWith('tool:') && SB.keys.label(m.id.slice(5)) ? `<kbd>${U.esc(SB.keys.label(m.id.slice(5)))}</kbd>` : ''), onclick: () => {
      SB.popover.close(); S.railActive = Object.assign({}, S.railActive, { [head]: m.id }); SB.prefs.save(); m.run(btn); SB.invalidate('rail'); } })));
    SB.popover(btn, list, { side: L.current === 'phone' ? 'top' : 'right' });
  }
  SB.panel('rail', () => {
    const rail = U.$('#rail'), els = [], items = railItems(), g = groups();
    for (const it of items) {
      if (simpleOff(it.id)) continue; // simple tools: only the everyday ones
      if (railHidden(it.id) || (g[it.id] && items.some(x => x.id === g[it.id] && !railHidden(x.id)))) continue; // group members sit inside their head's button
      if (it.sep) { els.push(h('hr')); continue; }
      const members = [it, ...items.filter(x => g[x.id] === it.id && !railHidden(x.id))];
      const shown = members.find(m => m.on && m.on()) || members.find(m => m.id === ((S.railActive || (S.rail && S.rail.active) || {})[it.id])) || it, on = shown.on && shown.on();
      const many = members.length > 1;
      const b = h('button.tool' + (on ? '.on' : '') + (many ? '.grp' : '') + (shown.off ? '.off' : ''), { type: 'button', title: shown.tip + (many ? ' · right-click or hold for more' : ''), 'aria-label': shown.label, 'aria-pressed': shown.on ? String(on) : null, html: SB.icon(shown.icon) + `<span class="tl-name">${shown.label}</span>` });
      let held = false, t = 0;
      b.onclick = e => { if (held) { held = false; return; } shown.run(e.currentTarget); };
      if (many) {
        b.addEventListener('contextmenu', e => { e.preventDefault(); e.stopPropagation(); openGroup(b, it.id, members); });
        b.addEventListener('pointerdown', () => { held = false; clearTimeout(t); t = setTimeout(() => { held = true; openGroup(b, it.id, members); }, 450); });
        ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => b.addEventListener(ev, () => clearTimeout(t)));
      }
      els.push(b);
    }
    while (els.length && els[els.length - 1].tagName === 'HR') els.pop();
    if (S.simpleTools) els.push(h('button.tool.simple-more', { type: 'button', title: 'Simple tools are on: show every tool', 'aria-label': 'Show every tool', html: SB.icon('plus') + '<span class="tl-name">All</span>', onclick: () => setSimple(false) }));
    els.push(h('button.tool.railcfg-btn', { type: 'button', title: 'Choose and order the tools', 'aria-label': 'Customize the tool bar', html: SB.icon('more') + '<span class="tl-name">Edit</span>', onclick: e => customizeRail(e.currentTarget) }));
    rail.replaceChildren(...els);
  });

  // ---------- simple tools, and the big stage's Edit / Preview switch
  const SIMPLE = ['tool:select', 'tool:brush', 'tool:eraser', 'tool:fill', 'tool:fillbrush', 'tool:gradient', 'tool:hand', 'tool:bone', 'add:text', 'add:shape'];
  const simpleOff = id => !!S.simpleTools && !isFill(id) && !SIMPLE.includes(id);
  function setSimple(v) { S.simpleTools = v; SB.prefs.save(); SB.invalidate('rail', 'stagemodes'); SB.toast(v ? 'Simple tools: select, draw, erase, fill, bones, text and shapes. “All” shows the rest.' : 'Every tool is back.'); }
  const previewing = () => !!(S.ixPlay || S.previewPlay);
  /** Preview: the interactive graph when there is one (clicks, hovers and keys work), else the animation looping. */
  function setPreview(on) {
    if (on === previewing()) return;
    if (on) {
      tree.select([]); const g = S.doc.ix;
      if (SB.ix && g && ((g.rules && g.rules.length) || (g.states && g.states.length))) SB.ix.play();
      else { S.previewPlay = { loop: S.loop }; S.loop = true; SB.time.play(); }
    } else {
      if (S.ixPlay) SB.ix.stop();
      if (S.previewPlay) { S.loop = S.previewPlay.loop; S.previewPlay = null; SB.time.pause(); }
    }
    SB.invalidate('stagemodes', 'transport', 'rail', 'ctxbar'); SB.dirty();
  }
  SB.on('play', () => { if (S.previewPlay && !S.playing) { S.loop = S.previewPlay.loop; S.previewPlay = null; SB.invalidate('stagemodes'); } });
  SB.panel('stagemodes', () => {
    let box = U.$('#stageModes'); if (!box) { box = h('div.stage-modes', { id: 'stageModes', role: 'toolbar', 'aria-label': 'Big stage' }); U.$('#stageWrap').appendChild(box); }
    const prev = previewing(); app().classList.toggle('previewing', prev && !!S.focus);
    box.hidden = !S.focus; if (!S.focus) return;
    box.replaceChildren(
      W.seg(prev ? 'preview' : 'edit', [['edit', 'Edit'], ['preview', 'Preview']], v => setPreview(v === 'preview')),
      prev ? null : W.iconBtn('select', S.simpleTools ? 'Simple tools are on: show every tool' : 'Simple tools: only select, draw, erase, fill, bones, text and shapes', () => setSimple(!S.simpleTools), 'sm' + (S.simpleTools ? ' on' : '')),
      prev ? null : W.iconBtn('more', 'Menu for the selection (or the stage)', e => { const r = e.currentTarget.getBoundingClientRect(), o = tree.sel(); if (o) SB.menu.open(r.left, r.bottom + 6, SB.menus.layerItems(o)); else SB.menus.stage({ clientX: r.left, clientY: r.bottom + 6 }); }, 'sm'));
  });
  SB.stageModes = { setPreview, previewing, setSimple };
  addEventListener('keydown', e => { if (S.previewPlay && e.key === 'Escape') { e.preventDefault(); setPreview(false); } }, true);

  // ---------- adding things
  SB.add = {
    drawing() { const o = tree.make('draw'); o._fresh = true; tree.add(o); SB.tool.set('brush'); },
    text() { const o = tree.add(tree.make('text')); SB.tool.set('select'); setTimeout(() => SB.textEdit.start(o), 40); },
    shape(kind) {
      const p = S.project, base = Math.min(p.w, p.h), dims = { ellipse: [0.32, 0.32], star: [0.36, 0.36], arrow: [0.42, 0.2], bubble: [0.5, 0.36], line: [0.4, 0.02], triangle: [0.34, 0.3] }[kind] || [0.42, 0.28];
      const fills = ['#7B5CFF', '#FF4F8B', '#1FB57A', '#2F7FF0', '#F4C430', '#FF8A3D'], fill = kind === 'bubble' ? '#FFFFFF' : fills[tree.all().filter(o => o.type === 'shape').length % fills.length];
      tree.add(tree.make('shape', { name: SB.SHAPES[kind], shape: kind, w: Math.round(base * dims[0]), h: Math.round(base * dims[1]), fill, strokeW: kind === 'bubble' ? 6 : kind === 'line' ? 8 : 0 })); SB.tool.set('select');
    },
    shapeMenu(btn) { SB.popover(btn, h('div.pop-grid', null, Object.entries(SB.SHAPES).map(([k, v]) => h('button', { type: 'button', title: v, 'aria-label': v, html: SB.icon(SB.SHAPE_ICONS[k]), onclick: () => { SB.popover.close(); SB.add.shape(k); } }))), { side: L.current === 'phone' ? 'top' : 'right' }); },
    importMenu(btn) {
      const T = SB.targets, ok = f => !T || T.allows(f);
      const it = (icon, label, run, feat) => h('button', { type: 'button', disabled: feat ? !ok(feat) : false, title: feat && !ok(feat) ? T.why() : '', html: SB.icon(icon) + label, onclick: () => { SB.popover.close(); run(); } });
      const pick = accept => () => SB.io.pick(accept, true, files => SB.io.importFiles(files));
      SB.popover(btn, h('div.pop-list', null,
        it('image', 'Image', pick('image/*')), it('svg', 'SVG', pick('.svg,image/svg+xml')), it('video', 'Video', pick('video/*'), 'video'), it('audio', 'Audio', pick('audio/*'), 'audio'),
        it('psd', 'Photoshop', pick('.psd')), it('pdf', 'Illustrator, PDF', pick('.ai,.pdf,application/pdf')),
        h('button.wide', { type: 'button', disabled: !ok('audio'), title: ok('audio') ? '' : T.why(), html: SB.icon('mic') + 'Record voice', onclick: () => { SB.popover.close(); SB.voice.start(); } }),
        h('p.hint', { style: { gridColumn: '1 / -1', textAlign: 'center' } }, 'Or drop files anywhere.')), { side: L.current === 'phone' ? 'top' : 'right' });
    },
  };

  // ---------- transport bar (play controls and timeline tools)
  const autoKeyBtn = () => nb('autokey', S.autoKey ? 'Auto key is on: every change adds a keyframe' : 'Auto key is off: only values that already have keyframes get new ones', () => { S.autoKey = !S.autoKey; SB.invalidate('transport', 'frames'); SB.toast(S.autoKey ? 'Auto key on: every change adds a keyframe.' : 'Auto key off: values with keyframes still get new ones when you change them.'); }, S.autoKey ? 'on' : '', 'Auto key');
  /** "Create frame" in Big stage: a new drawing frame on the selected layer (or a new drawing layer). */
  function createFrame() { const o = tree.sel(); if (o && SB.types.get(o.type).frames) return SB.frames.act('add'); SB.add.drawing(); }
  /** When the bar is wider than the screen it scrolls sideways: the wheel, a drag on empty space (mouse) or a swipe. */
  function scrollable(t) {
    if (t._scroll) return; t._scroll = true;
    t.addEventListener('wheel', e => { if (t.scrollWidth <= t.clientWidth + 1 || e.target.closest('input[type=range]')) return; e.preventDefault(); t.scrollLeft += Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY; }, { passive: false });
    t.addEventListener('pointerdown', e => {
      if (e.pointerType !== 'mouse' || e.button > 0 || e.target.closest('button,input,select,label,.tc') || t.scrollWidth <= t.clientWidth + 1) return;
      const x0 = e.clientX, s0 = t.scrollLeft; t.setPointerCapture(e.pointerId); t.classList.add('dragging');
      const mv = ev => t.scrollLeft = s0 - (ev.clientX - x0), up = () => { t.classList.remove('dragging'); t.removeEventListener('pointermove', mv); t.removeEventListener('pointerup', up); };
      t.addEventListener('pointermove', mv); t.addEventListener('pointerup', up);
    });
    const edges = () => { t.classList.toggle('can-l', t.scrollLeft > 2); t.classList.toggle('can-r', t.scrollLeft < t.scrollWidth - t.clientWidth - 2); };
    t.addEventListener('scroll', edges, { passive: true }); new ResizeObserver(edges).observe(t); t._edges = edges;
  }
  SB.panel('transport', () => {
    const t = U.$('#transport'), phone = L.current === 'phone'; scrollable(t); requestAnimationFrame(() => t._edges && t._edges());
    const start = W.iconBtn('start', 'Go to start (Home)', () => { SB.time.pause(); SB.time.set(SB.time.range()[0]); });
    const play = h('button.play', { type: 'button', id: 'btnPlay', title: 'Play / pause (Space)', 'aria-label': S.playing ? 'Pause' : 'Play', html: SB.icon(S.playing ? 'pause' : 'play'), onclick: SB.time.toggle });
    const tc = h('span.tc' + (S.recording ? '.rec' : ''), { id: 'tc', title: 'Length and frame rate: click to change', onclick: () => SB.settings.open('project') });
    if (S.focus) { // Big stage: only the basics, and a switch between the sequence timeline and the drawing frames
      const mode = W.seg(S.focusTl || 'seq', [['seq', 'Timeline', 'The timeline of the selected layers'], ['frames', 'Frames', 'The drawing frames (frame library) of the selected layer']], v => L.focusTimeline(v)); mode.classList.add('ftl');
      t.replaceChildren(start, W.iconBtn('left', `Back one frame (${SB.keys.label('prevFrame')})`, () => SB.time.step(-1)), play, W.iconBtn('right', `Forward one frame (${SB.keys.label('nextFrame')})`, () => SB.time.step(1)), tc, h('span.vsep'), nb('key', `Add a keyframe at the playhead (${SB.keys.label('key')})`, () => SB.ops.addKey(), '', 'Keyframe'), autoKeyBtn(), h('span.vsep'), mode,
        h('button.btn.sm', { type: 'button', title: 'Add a new drawing frame after this one', html: SB.icon('plus') + '<span>Frame</span>', onclick: createFrame }), h('span.spacer'),
        nb('panel', `Properties panel (${SB.keys.label('panel')}): every setting of the selected layer, beside the stage`, () => L.toggleInspector(), app().classList.contains('insp-open') ? 'on' : '', 'Properties'));
      return updateTime();
    }
    const items = barItems(), tb = tbarOrder(), g = tbarGroups(), vis = tb.order.filter(id => !tb.hidden.includes(id)), ctx = { start, play, tc, phone };
    const els = [];
    for (const id of vis) {
      if (isSep(id)) { if (els.length && !els[els.length - 1].classList.contains('vsep')) els.push(h('span.vsep')); continue; }
      if (id.startsWith('space')) { els.push(h('span.spacer')); continue; }
      if (id.startsWith('gap')) { els.push(h('span.tb-gap')); continue; }
      if (g[id] && vis.includes(g[id])) continue; // shown inside its group's button
      const it = items.find(x => x.id === id); if (!it) continue;
      const members = [it, ...vis.filter(x => g[x] === id).map(x => items.find(y => y.id === x)).filter(Boolean)], act = ((S.tbar && S.tbar.active) || {})[id];
      const shown = members.find(m => m.id === act) || it, el = shown.make(ctx); if (!el) continue;
      if (members.length > 1) tbarGroupBtn(el, id, members, ctx);
      els.push(el);
    }
    if (S.ctx) els.splice(Math.max(0, els.findIndex(e => e.classList.contains('spacer'))), 0, h('button.btn.sm', { type: 'button', title: 'Back to the main timeline (Esc)', html: SB.icon('back') + '<span>Back</span>', onclick: () => tree.exit() }));
    els.push(W.iconBtn('more', 'Choose and order these buttons', e => customizeTbar(e.currentTarget), 'tb-more'));
    // arrows at the ends while there is more to scroll to (for touch screens; they stay put while the bar scrolls)
    const arrow = d => h('button.tb-arrow.' + (d < 0 ? 'l' : 'r'), { type: 'button', 'aria-label': d < 0 ? 'Scroll the bar left' : 'Scroll the bar right', html: SB.icon(d < 0 ? 'left' : 'right'), onclick: () => t.scrollBy({ left: d * Math.max(120, t.clientWidth * 0.6), behavior: 'smooth' }) });
    t.replaceChildren(arrow(-1), ...els, arrow(1));
    updateTime();
  });
  /** The buttons of the timeline bar. Which are shown, in what order, comes from the layout (tbarOrder, the ⋯ at its end edits it). */
  function barItems() {
    return [
      { id: 'start', icon: 'start', label: 'Go to start', make: c => c.start },
      { id: 'prevframe', icon: 'left', label: 'Back one frame', make: () => nb('left', `Back one frame (${SB.keys.label('prevFrame')})`, () => SB.time.step(-1), '', 'Back') },
      { id: 'play', icon: 'play', label: 'Play', make: c => c.play },
      { id: 'nextframe', icon: 'right', label: 'Forward one frame', make: () => nb('right', `Forward one frame (${SB.keys.label('nextFrame')})`, () => SB.time.step(1), '', 'Forward') },
      { id: 'onion', icon: 'onion', label: 'Onion skin', make: () => nb('onion', S.onion ? 'Onion skin is on (drag its ends on the ruler to show more or fewer frames). Click to turn off' : 'Onion skin: see the drawing frames before and after', () => { S.onion = !S.onion; SB.prefs.save(); SB.invalidate('frames', 'timeline', 'transport'); SB.dirty(); }, S.onion ? 'on' : '', 'Onion') },
      { id: 'rec', icon: 'rec', label: 'Record motion', make: () => { const r = nb('rec', 'Record motion: drag a layer, a bone or a controller while it plays (R)', () => SB.record.start(), S.recording ? 'rec-on' : '', 'Record'); r.style.color = S.recording ? '' : 'var(--rec)'; return r; } },
      { id: 'mic', icon: 'mic', label: 'Record voice', make: () => { const off = SB.targets && !SB.targets.allows('audio') && !SB.voice.rec, b = nb('mic', off ? SB.targets.why() : SB.voice.rec ? 'Stop recording your voice' : 'Record your voice from the playhead', () => SB.voice.start(), SB.voice.rec ? 'rec-on' : '', 'Voice'); b.disabled = off; return b; } },
      { id: 'autokey', icon: 'autokey', label: 'Auto key', make: autoKeyBtn },
      { id: 'loop', icon: 'loop', label: 'Loop', make: () => nb('loop', 'Loop playback', () => { S.loop = !S.loop; SB.invalidate('transport'); }, S.loop ? 'on' : '', 'Loop') },
      { id: 'time', icon: 'clock', label: 'Time', make: c => c.tc },
      { id: 'action', icon: 'rig', label: 'Rig action', make: () => { const A = SB.actions, r = A && A.rigInView(); if (!r) return null; const c = A.current(r);
        const b = h('button.btn.sm.tb-act', { type: 'button', title: c ? `${r.name} is showing the action ${c.name}. Click to switch, add or rename actions` : `Make several actions (walk, run…) for ${r.name}`, html: SB.icon('rig') + `<span>${U.esc(c ? c.name : 'Actions')}</span>` + SB.icon('down') });
        b.onclick = () => { const q = b.getBoundingClientRect(); SB.menu.open(q.left, q.top - 4, A.menuItems(r)); }; return b; } },
      { id: 'interactive', icon: 'target', label: 'Interactions (interactive web only)', make: () => SB.ix ? (() => { const ok = SB.ix.webOk(), b = h('button.btn.sm.tb-ix' + (ok ? '' : '.off'), { type: 'button', title: ok ? 'Interactions: rules for clicks, hovers, drags, keys and screens (the timeline area becomes the interaction board)' : 'Interactions are for Interactive web animation projects: click to switch this project', html: SB.icon('target') + '<span>Interactions</span>' }); b.onclick = () => SB.ix.setMode(true); return b; })() : null },
      { id: 'frames', icon: 'frames', label: 'Frame view', make: () => nb('frames', S.tlFrames ? 'The timeline counts frames. Click to show seconds' : 'Show the timeline in frames (frame numbers instead of seconds)', () => { S.tlFrames = !S.tlFrames; SB.prefs.save(); SB.invalidate('transport', 'timeline'); SB.emit('time'); }, S.tlFrames ? 'on' : '', 'Frames') },
      { id: 'framelock', icon: 'frameLock', label: 'Whole frames', make: () => { const b = nb('frameLock', !S.tlFrames ? 'Only whole frames: turn on the frame view first' : S.frameLock ? 'Only whole frames: the playhead, keyframes and clips stop on frames, never between. Click to turn off' : 'Let the playhead and keyframes stop only on whole frames', () => { S.frameLock = !S.frameLock; if (S.frameLock) SB.time.set(S.time); SB.prefs.save(); SB.invalidate('transport'); }, S.tlFrames && S.frameLock ? 'on' : '', 'Whole frames'); b.disabled = !S.tlFrames; return b; } },
      { id: 'split', icon: 'split', label: 'Cut clip', make: () => nb('split', `Cut the selected layer at the playhead (${SB.keys.label('split')}). For clicking clips, use the Cut tool (${SB.keys.label('razor')})`, () => SB.ops.split(), '', 'Cut') },
      { id: 'shot', icon: 'shot', label: 'Make shot', make: () => nb('shot', tree.selected().length ? 'Make a shot from the selected layers (Ctrl+Shift+S)' : 'New empty shot', () => tree.selected().length ? SB.ops.makeShot() : SB.ops.newShot(), '', 'Shot') },
      { id: 'prevkey', icon: 'keyPrev', label: 'Previous key', make: () => nb('keyPrev', `Go to the previous keyframe (${SB.keys.label('prevKey')})`, () => SB.ops.goKey(-1), '', 'Previous key') },
      { id: 'nextkey', icon: 'keyNext', label: 'Next key', make: () => nb('keyNext', `Go to the next keyframe (${SB.keys.label('nextKey')})`, () => SB.ops.goKey(1), '', 'Next key') },
      { id: 'keysnap', icon: 'keySnap', label: 'Snap to keys', make: () => nb('keySnap', S.keySnap === false ? 'The playhead moves freely. Click to make it snap to keyframes near it' : 'The playhead snaps to keyframes near it (hold Alt to move freely). Click to turn off', () => { S.keySnap = S.keySnap === false; SB.prefs.save(); SB.invalidate('transport'); }, S.keySnap === false ? '' : 'on', 'Snap to keys') },
      { id: 'key', icon: 'key', label: 'Add keyframe', make: () => nb('key', `Add a keyframe at the playhead (${SB.keys.label('key')})`, () => SB.ops.addKey(), '', 'Keyframe') },
      { id: 'blankkey', icon: 'keyBlank', label: 'Blank keyframe', make: () => { const why = SB.frames.blankWhy(), b = nb('keyBlank', why ? `Blank keyframe: ${why}` : `Blank keyframe: an empty frame from the playhead on, to draw something new (${SB.keys.label('blankKey')})`, () => SB.frames.blankKey(), why ? 'off' : '', 'Blank key'); if (why) b.setAttribute('aria-disabled', 'true'); return b; } },
      { id: 'rows', icon: 'rows', label: 'Animation rows', make: () => nb('rows', 'Show the animation rows of every animated layer', () => SB.timeline.toggleAllRows(), '', 'Rows') },
      { id: 'filter', icon: 'filter', label: 'Animated only', make: () => nb('filter', 'Show only animated properties in open rows', () => { S.tlAnimOnly = !S.tlAnimOnly; SB.invalidate('timeline', 'transport'); }, S.tlAnimOnly ? 'on' : '', 'Animated only') },
      { id: 'zoom', icon: 'zoom', label: 'Zoom', make: c => h('span.tb-zoom', null, c.phone ? null : h('span.lbl', { style: { color: 'var(--ink-2)', fontSize: '12px' } }, 'Zoom'), Object.assign(W.slider(S.zoom, { min: 20, max: 320, width: c.phone ? '70px' : '110px', label: 'Timeline zoom', input: v => SB.timeline.zoom(v, true) }), { id: 'tlZoom' })) },
    ];
  }
  /** Timeline bar layouts. order: the buttons shown, left to right (space:… pushes the rest along); group: button → the button it sits inside.
      You pick one (Settings › Appearance, or the bar's ⋯; S.tbarLayout) and it stays the same whatever the format. Your changes are kept
      per layout (S.tbarEdits); layouts of your own are saved in S.tbarCustom ('c:<id>'). */
  const TB_PRESETS = {
    studio: { label: 'Toonzi 2D (default)', order: ['start', 'prevkey', 'prevframe', 'play', 'nextkey', 'nextframe', 'loop', 'time', 'action', 'sep:a', 'onion', 'frames', 'framelock', 'sep:b', 'mic', 'rec', 'interactive', 'space:a', 'key', 'blankkey', 'autokey', 'keysnap', 'zoom'], group: { prevframe: 'prevkey', nextframe: 'nextkey', framelock: 'frames', mic: 'rec', keysnap: 'autokey' } },
    opentoonz: { label: 'OpenToonz', order: ['start', 'prevkey', 'prevframe', 'play', 'nextframe', 'nextkey', 'loop', 'time', 'action', 'sep:a', 'onion', 'frames', 'framelock', 'sep:b', 'mic', 'rec', 'interactive', 'space:a', 'key', 'blankkey', 'autokey', 'zoom'], group: {} },
    flash: { label: 'Adobe Animate (Flash)', order: ['start', 'prevframe', 'play', 'nextframe', 'loop', 'time', 'action', 'sep:a', 'onion', 'frames', 'framelock', 'sep:b', 'key', 'blankkey', 'prevkey', 'nextkey', 'autokey', 'interactive', 'space:a', 'zoom'], group: {} },
    premiere: { label: 'Adobe Premiere Pro', order: ['start', 'prevframe', 'play', 'nextframe', 'loop', 'time', 'sep:a', 'split', 'shot', 'sep:b', 'prevkey', 'key', 'nextkey', 'keysnap', 'interactive', 'space:a', 'rows', 'filter', 'zoom'], group: {} },
    simple: { label: 'Simple animation', order: ['prevkey', 'prevframe', 'play', 'nextkey', 'nextframe', 'time', 'space:a', 'onion', 'key', 'blankkey', 'autokey', 'interactive', 'space:b', 'zoom'], group: { prevframe: 'prevkey', nextframe: 'nextkey' } },
    all: { label: 'Every button', order: ['start', 'prevkey', 'prevframe', 'play', 'nextframe', 'nextkey', 'loop', 'time', 'action', 'sep:a', 'onion', 'frames', 'framelock', 'sep:b', 'rec', 'mic', 'sep:c', 'key', 'blankkey', 'autokey', 'keysnap', 'sep:d', 'split', 'shot', 'sep:e', 'rows', 'filter', 'interactive', 'space:a', 'zoom'], group: {} }, // every button in view, in groups between dividers
  };
  const urlBar = new URLSearchParams(location.search).get('bar'); // index.html?bar=flash picks a layout from the address
  const tbMode = () => (urlBar && TB_PRESETS[urlBar] ? urlBar : null) || (S.tbarLayout && (TB_PRESETS[S.tbarLayout] || tbCustom(S.tbarLayout)) ? S.tbarLayout : 'studio');
  const tbCustom = id => (S.tbarCustom || []).find(c => 'c:' + c.id === id);
  const tbKey = () => tbMode();
  function tbBase() { const m = tbMode(), P = tbCustom(m) || TB_PRESETS[m] || TB_PRESETS.studio; return { order: P.order.slice(), group: Object.assign({}, P.group) }; }
  /** Every button, in order: the shown ones, then the rest (hidden). Your changes for this layout (S.tbarEdits[key]) win. */
  const tbarOrder = () => {
    const cu = tbCustom(tbMode()), ed = cu && cu.hidden ? cu : S.tbarEdits && S.tbarEdits[tbKey()], b = ed ? null : tbBase(); const order = (ed ? ed.order : b.order).slice(), hidden = ed ? ed.hidden.slice() : [];
    for (const it of barItems()) if (!order.includes(it.id)) { order.push(it.id); if (!ed || !ed.known || !ed.known.includes(it.id)) hidden.push(it.id); }
    return { order, hidden, group: Object.assign({}, ed ? ed.group : b.group) };
  };
  // Big stage keeps one button on the stage for everything else
  function focusMenu(e) {
    const b = e.currentTarget.getBoundingClientRect();
    SB.menu.open(b.left, b.bottom + 6, [{ head: S.project.name }, { label: 'Exit big stage', kbd: 'F', run: () => L.focus(false) }, { label: (app().classList.contains('insp-open') ? '✓ ' : '') + 'Properties panel', kbd: SB.keys.label('panel'), run: () => L.toggleInspector() }, { label: SB.screens.many() ? 'Screen settings…' : 'Project settings…', run: () => SB.settings.screen() }, { label: 'Settings…', run: () => SB.settings.open() }, { label: 'Export…', run: () => SB.exporter.open() }, { label: 'Start a new project', run: () => SB.project.newProject() }, '-',
      { label: 'Undo', kbd: 'Ctrl Z', run: SB.undo, disabled: !SB.canUndo() }, { label: 'Redo', run: SB.redo, disabled: !SB.canRedo() }, { label: (S.snap ? '✓ ' : '') + 'Snap and guides', run: () => SB.snapToggle() }]);
  }
  /** The time in the bar. Its box is as wide as its widest text (the end of the timeline), so the bar never moves while it plays. */
  function updateTime() {
    const tc = U.$('#tc'); if (!tc) return; const q = tree.ctx(), F = SB.time.frameNo, last = Math.max(1, Math.round(S.project.duration * S.project.fps));
    const label = (t, tq) => S.tlFrames ? (q ? `Frame ${F(Math.max(0, tq))} <small>in ${U.esc(q.name)}</small>` : `Frame ${Math.min(last, F(t))} <small>/ ${last}</small>`) : q ? `${U.fmtTime(Math.max(0, tq))} <small>in ${U.esc(q.name)}</small>` : `${U.fmtTime(t)} <small>/ ${U.fmtTime(S.project.duration)}</small>`;
    const key = [S.tlFrames, last, S.project.duration, q && q.id, q && q.name, L.current].join('|');
    if (tc._key !== key) { tc.style.minWidth = ''; tc.innerHTML = label(S.project.duration, q ? q.dur : 0).replace(/[0-9]/g, '0'); const w = tc.getBoundingClientRect().width; if (w) { tc.style.minWidth = Math.ceil(w) + 'px'; tc._key = key; } }
    tc.innerHTML = label(S.time, tree.dom.now());
  }
  SB.on('time', updateTime); SB.on('play', () => SB.invalidate('transport')); SB.on('record', () => { SB.invalidate('transport', 'ctxbar'); U.$('#stageWrap').classList.toggle('rec', S.recording); }); SB.on('voice', () => SB.invalidate('transport'));

  // ---------- phone dock tabs
  SB.panel('tabs', () => {
    const a = app(), cur = a.dataset.tab || 'timeline', o = tree.sel();
    U.$('#dockTabs').replaceChildren(...[['timeline', 'Timeline'], ['props', o ? 'Layer: ' + o.name : 'Project']].map(([k, v]) => h('button' + (cur === k ? '.on' : ''), { type: 'button', role: 'tab', 'aria-selected': String(cur === k), onclick: () => L.tab(k) }, v)));
  });
  SB.on('select', () => SB.invalidate('tabs', 'transport'));

  // ---------- properties panel width: drag its left edge (desktop and tablet)
  function bindInspGrip() {
    const g = U.$('#inspGrip'); if (!g) return; g.addEventListener('pointerdown', e => {
      const a = app(), lay = L.current, v0 = U.$('#inspector').getBoundingClientRect().width, x0 = e.clientX, key = lay === 'tablet' ? '--insp-t' : '--insp'; g.setPointerCapture(e.pointerId); g.classList.add('on');
      const mv = ev => { const v = Math.round(U.clamp(v0 - (ev.clientX - x0), 220, Math.min(640, innerWidth * 0.6))); a.style.setProperty(key, v + 'px'); SB.view.fit(); };
      const up = () => { g.removeEventListener('pointermove', mv); g.removeEventListener('pointerup', up); g.classList.remove('on'); S.inspW = Object.assign(S.inspW || {}, { [lay]: parseInt(getComputedStyle(a).getPropertyValue(key)) }); SB.prefs.save(); };
      g.addEventListener('pointermove', mv); g.addEventListener('pointerup', up);
    });
    g.addEventListener('dblclick', () => { const a = app(), lay = L.current; a.style.setProperty(lay === 'tablet' ? '--insp-t' : '--insp', (lay === 'tablet' ? 340 : 300) + 'px'); if (S.inspW) delete S.inspW[lay]; SB.prefs.save(); SB.view.fit(); });
  }
  // ---------- dock resize
  function bindGrip() {
    const g = U.$('#dockGrip'); g.addEventListener('pointerdown', e => {
      const a = app(), h0 = U.$('#dock').getBoundingClientRect().height, y0 = e.clientY, big = !!S.focus, key = big ? '--mini-h' : '--dock-h'; g.setPointerCapture(e.pointerId);
      const mv = ev => { const v = U.clamp(h0 - (ev.clientY - y0), big ? 80 : 120, innerHeight * 0.7); a.style.setProperty(key, v + 'px'); SB.view.fit(); };
      const up = () => { g.removeEventListener('pointermove', mv); g.removeEventListener('pointerup', up); const v = parseInt(getComputedStyle(a).getPropertyValue(key)); if (big) S.miniH = v; else S.dockH = Object.assign(S.dockH || {}, { [L.current]: v }); SB.prefs.save(); };
      g.addEventListener('pointermove', mv); g.addEventListener('pointerup', up);
    });
  }

  // ---------- tooltips: titles become quick hints (no tooltips on touch)
  const tip = h('div.tip', { role: 'tooltip' }); let tipT = 0, tipFor = null;
  const hideTip = () => { clearTimeout(tipT); tipFor = null; tip.classList.remove('show'); };
  document.addEventListener('pointerover', e => {
    if (e.pointerType !== 'mouse') return; const el = e.target.closest && e.target.closest('[title],[data-tip]'); if (!el || el === tipFor) return;
    if (el.hasAttribute('title')) { const t = el.getAttribute('title'); if (t) { el.dataset.tip = t; if (!el.getAttribute('aria-label') && !el.textContent.trim()) el.setAttribute('aria-label', t); } el.removeAttribute('title'); }
    if (!el.dataset.tip || el.closest('.menu,.tl-lane')) return; hideTip(); tipFor = el;
    tipT = setTimeout(() => {
      if (!el.isConnected) return; const m = /\s*\(([^)]{1,16})\)\s*$/.exec(el.dataset.tip); tip.innerHTML = U.esc(m ? el.dataset.tip.slice(0, m.index) : el.dataset.tip) + (m ? `<kbd>${U.esc(m[1])}</kbd>` : '');
      const r = el.getBoundingClientRect(); tip.classList.add('show'); const tw = tip.offsetWidth, th = tip.offsetHeight;
      let x = r.left + r.width / 2 - tw / 2, y = r.bottom + 6; if (el.closest('.rail') && L.current !== 'phone') { x = r.right + 8; y = r.top + r.height / 2 - th / 2; } else if (y + th > innerHeight - 6) y = r.top - th - 6;
      tip.style.left = U.clamp(x, 6, innerWidth - tw - 6) + 'px'; tip.style.top = U.clamp(y, 6, innerHeight - th - 6) + 'px';
    }, 300);
  });
  document.addEventListener('pointerout', e => { if (tipFor && !(e.relatedTarget && tipFor.contains(e.relatedTarget))) hideTip(); });
  document.addEventListener('pointerdown', hideTip, true);

  SB.shell = {
    init() {
      document.body.appendChild(tip); bindGrip(); bindInspGrip();
      U.$('#projName').addEventListener('input', e => { S.project.name = e.target.value; });
      U.$('#projName').addEventListener('change', () => SB.commit());
      L.apply();
    },
  };
})(window.SB);
