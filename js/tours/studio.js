/* The tutorial studio (Settings › Project › Tutorial maker…): make a tutorial right on the screen.
     - A small panel at the bottom: the tutorial, its steps as numbered chips (drag to reorder, Shift/Ctrl-click to pick
       several and Combine them), and the step you are on: what the guide says, its face, when the step goes on,
       the key it teaches, the mouse picture, what it points at, where the bubble sits.
     - The guide shows the step live, where it will show; drag it to place it for this step.
     - Draw on the screen to explain: arrows, lines, boxes, rings, free paths and dots. Over the stage they stick to the
       stage (and zoom with it); elsewhere they stay put on the window. Pick one to recolor, label, delete, or turn a free
       path into an arrow, a line, a box or a ring.
     - Record: do the thing in the app; every action becomes a step (the tool you picked, the key you pressed, what you
       clicked or right-clicked, the menu items you chose, what you drew or dragged on the stage, where you clicked the
       ruler…), with its text, its rule, its pointer and your stroke as a path to tidy up.
   Data and rules: js/tours/maker.js (S.myTours). Running and drawing: js/tours/tours.js. */
'use strict';
(function (SB) {
  const U = SB.util, S = SB.state, h = U.h, W = SB.w, tree = SB.tree, TS = SB.tours, M = () => TS.maker;
  let st = null; // { j, i, sel: Set, tool, anno, rec, panel }
  const cur = () => st && st.j, step = () => st && st.j.steps[st.i];
  const save = () => M().save();
  /** Show the tutorial as it is now (the guide on the current step). */
  function refresh(keepPanel) {
    if (!st) return; save(); const def = M().defOf(st.j);
    if (TS.running && TS.isEdit()) TS.show(st.i, def); else TS.start(null, st.i, { edit: true, def, onMove: (i, pos) => { const s = st.j.steps[i]; if (s) { s.pos = pos; save(); } }, onStep: i => { if (st && st.i !== i) { st.i = i; st.anno = null; panel(); drawSel(); } }, onAt });
    if (!keepPanel) panel(); SB.dirty();
  }
  /** The mouse picture was dragged to window point x, y: over the stage it sticks to the stage, elsewhere to the window. */
  function onAt(i, x, y) { const s = st && st.j.steps[i]; if (!s) return; s.at = onStage(x, y) ? toStage(x, y) : { x: +(x / innerWidth).toFixed(4), y: +(y / innerHeight).toFixed(4) }; refresh(); }
  function open() {
    const list = M().mine(); if (st) return panel();
    let j = list[0]; if (!j) { j = blank(); list.push(j); save(); }
    st = { j, i: 0, sel: new Set(), tool: null, anno: null, rec: null }; document.body.classList.add('ts-open'); // dialogs, menus, pickers and toasts go over the panel
    refresh();
  }
  const chOf = j => j.character && TS.CHARACTERS[j.character] ? j.character : TS.defaultCharacter();
  const blank = () => ({ id: 'my-' + U.uid(), title: 'My tutorial', level: 'Easy', minutes: 3, steps: [{ say: 'Hi! Let’s make something together.', rule: { type: 'next' }, mood: 'happy' }] });
  function close() { if (!st) return; document.body.classList.remove('ts-open'); if (st.rec) stopRec(); setTool(null); if (st.panelEl) st.panelEl.remove(); if (selEl) selEl.innerHTML = ''; st = null; TS.stop(true); SB.dirty(); }

  // ================= the panel
  function panel() {
    if (!st) return; const j = st.j, steps = j.steps, s = step();
    let el = st.panelEl; if (!el) { el = st.panelEl = h('div.tstudio', { role: 'dialog', 'aria-label': 'Tutorial maker' }); document.body.appendChild(el); dragPanel(el); }
    const old = el.querySelector('.ts-strip'), keepX = old ? old.scrollLeft : 0; // the steps row keeps its scroll when the panel is built again
    const tutSel = W.select(j.id, M().mine().map(x => [x.id, x.title || 'My tutorial']), id => { st.j = M().mine().find(x => x.id === id); st.i = 0; st.sel.clear(); refresh(); }, 'Tutorial');
    const top = h('div.ts-top', null, h('span.ts-grip', { title: 'Drag to move the panel', html: SB.icon('grip') }), h('b', null, 'Tutorial maker'), tutSel,
      W.iconBtn('plus', 'New tutorial', () => { const n = blank(); M().mine().push(n); st.j = n; st.i = 0; refresh(); }, 'sm'),
      st.rec ? W.btn('Stop', stopRec, { cls: 'sm rec-on', icon: 'rec' }) : W.btn('Record', startRec, { cls: 'sm', icon: 'rec', title: 'Do it in the app: every action becomes a step' }),
      W.btn('Try', () => { save(); const id = j.id; close(); M().register(); TS.start(id); }, { cls: 'sm', icon: 'play', title: 'Run the tutorial as a learner' }),
      W.iconBtn('more', 'More: details, character, start, order, export…', e => moreMenu(e.currentTarget), 'sm'), h('span.spacer'),
      s && !st.rec ? h('span.ts-nav', null, W.iconBtn('left', 'Previous step (Alt+←)', () => go(-1), 'sm'), h('span.ts-l', null, `Step ${st.i + 1} of ${steps.length}`), W.iconBtn('right', 'Next step (Alt+→)', () => go(1), 'sm'),
        W.iconBtn('copy', 'Duplicate this step', () => { steps.splice(st.i + 1, 0, U.deep(s)); st.i++; refresh(); }, 'sm'),
        W.iconBtn('trash', 'Delete this step', () => { steps.splice(st.i, 1); st.i = Math.max(0, Math.min(st.i, steps.length - 1)); if (!steps.length) steps.push({ say: '', rule: { type: 'next' } }); refresh(); }, 'sm')) : null,
      W.iconBtn('x', 'Close the maker', close, 'sm'));
    if (st.rec) { el.replaceChildren(top, h('div.ts-rec', null, h('span.ts-dot'), `Recording: do the steps in the app. ${st.rec.steps.length} so far. `, h('span.hint', null, 'Clicks, keys, menus, drawing and dragging on the stage all count.'))); return; }
    // the steps: chips you drag to reorder; Shift / Ctrl-click picks several
    const strip = h('div.ts-strip', null, ...steps.map((x, k) => {
      const c = h('button.ts-chip' + (k === st.i ? '.on' : '') + (st.sel.has(k) ? '.picked' : ''), { type: 'button', draggable: 'true', title: x.say || '(no text)', dataset: { k } },
        h('span.ts-face', { html: TS.faceHtml(chOf(j), x.mood || 'talk') }), h('b', null, String(k + 1)), h('span', null, (x.say || '…').slice(0, 18)));
      c.onclick = e => { if (e.shiftKey || e.ctrlKey || e.metaKey) { if (e.shiftKey && st.sel.size) { const a = Math.min(...st.sel, k), b = Math.max(...st.sel, k); for (let q = a; q <= b; q++) st.sel.add(q); } else if (st.sel.has(k)) st.sel.delete(k); else st.sel.add(k); st.sel.add(st.i); panel(); return; } st.sel.clear(); st.i = k; st.anno = null; refresh(); };
      c.ondragstart = e => { e.dataTransfer.setData('text/plain', String(k)); c.classList.add('dragging'); };
      c.ondragover = e => { e.preventDefault(); c.classList.add('over'); }; c.ondragleave = () => c.classList.remove('over');
      c.ondrop = e => { e.preventDefault(); const a = +e.dataTransfer.getData('text/plain'); if (isNaN(a) || a === k) return; const [m] = steps.splice(a, 1); steps.splice(k, 0, m); st.i = k; st.sel.clear(); refresh(); };
      return c;
    }), W.iconBtn('plus', 'Add a step after this one', () => { steps.splice(st.i + 1, 0, { say: '', rule: { type: 'next' } }); st.i++; refresh(); setTimeout(() => { const t = el.querySelector('.ts-say'); if (t) t.focus(); }, 30); }, 'sm'),
      st.sel.size > 1 ? W.btn(`Combine ${st.sel.size}`, combine, { cls: 'sm primary', title: 'Make the picked steps one step' }) : null);
    const keepScroll = () => { strip.scrollLeft = keepX; const on = strip.querySelector('.ts-chip.on'); if (on) { const r = on.getBoundingClientRect(), sr = strip.getBoundingClientRect(); if (r.left < sr.left || r.right > sr.right) on.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } };
    if (!s) { el.replaceChildren(top, strip); keepScroll(); return; }
    // the step on show
    const say = h('textarea.ts-say', { rows: 2, placeholder: 'What the guide says (short and clear)' }); say.value = s.say || '';
    say.oninput = () => { s.say = say.value; const p = document.querySelector('.tour-guide .tg-say'); if (p) p.textContent = s.say; const chip = el.querySelector(`.ts-chip[data-k="${st.i}"] span:last-child`); if (chip) chip.textContent = (s.say || '…').slice(0, 18); };
    say.onchange = () => refresh(true);
    const ch = chOf(j);
    const faces = h('div.ts-faces', null, ...TS.MOODS.map(([m, label]) => h('button.ts-facebtn' + ((s.mood || 'talk') === m ? '.on' : ''), { type: 'button', title: label, 'aria-label': label, html: TS.faceHtml(ch, m), onclick: () => { s.mood = m; refresh(); } })));
    const R = M().RULES, r = s.rule || (s.rule = { type: 'next' }), RD = R[r.type] || R.next, b = M().builtinStep(s.ref);
    const params = RD.fields.map(([k, label, kind]) => {
      const set = v => { r[k] = v; refresh(true); };
      if (kind === 'tool') return W.select(r[k] || '', [['', 'Which tool?'], ...SB.tools.all().filter(t => !t.hidden).map(t => [t.id, t.label])], set, label);
      if (kind === 'action') return W.select(r[k] || '', [['', 'Which key?'], ...Object.values(SB.keys.ACT).map(a => [a.id, a.label])], set, label);
      if (kind === 'layer') return W.select(r[k] || '', [['', label], ...tree.all().map(o => [o.name, o.name])], set, label);
      if (kind === 'num') return h('label.ts-num', null, label + ' ', W.num(r[k] ?? (k === 'n' ? 1 : 0), { min: 0, max: 999, step: k === 't' || k === 's' ? 0.1 : 1, label, change: set }));
      if (kind === 'check') return W.check(!!r[k], label, set);
      if (kind === 'menupath') { const t = h('input.ts-menupath', { type: 'text', value: r[k] || '', placeholder: 'e.g. Ease › Bounce (empty: just open it)', title: 'The menu item they must choose; › between an item and the item under it' }); t.onchange = () => set(t.value.trim() || undefined);
        return h('span.ts-mp', null, h('span.ts-l', null, label), t, W.btn(r[k] ? 'Pick again' : 'Pick from the menu', () => pickMenu(p => { if (p) { r[k] = p.join(' › '); if (!s.mouse) s.mouse = 'right'; } refresh(); }), { cls: 'sm ghost', icon: 'target', title: 'Open the menu (right-click) and choose the item' })); }
      const t = h('input', { type: 'text', value: r[k] || '', placeholder: 'S.tool === "brush"' }); t.onchange = () => set(t.value); return t;
    });
    const when = h('div.ts-row', null, h('span.ts-l', null, 'Next when'), W.select(r.type, Object.entries(R).filter(([k]) => k !== 'builtin' || b).map(([k, v]) => [k, v.label]), v => { s.rule = { type: v }; refresh(); }, 'When the step goes on'), ...params);
    const point = h('div.ts-row', null, h('span.ts-l', null, 'Point at'),
      W.btn(s.show ? 'Picked ✓' : 'Pick on screen', () => M().pickEl(sel => { if (sel) s.show = sel; refresh(); }), { cls: 'sm ghost', icon: 'target', title: s.show || 'Click any button or panel' }), s.show ? W.iconBtn('x', 'Point at nothing', () => { delete s.show; refresh(); }, 'sm') : null,
      W.check(!!s.stage, 'Stage clickable', v => { s.stage = v; refresh(true); }),
      h('span.ts-l', null, 'Mouse'), W.select(s.mouse || '', [['', 'None'], ['left', 'Click'], ['right', 'Right-click'], ['double', 'Double-click'], ['drag', 'Drag'], ['scroll', 'Scroll']], v => { s.mouse = v || undefined; refresh(); }, 'Mouse picture'),
      s.mouse === 'drag' ? W.btn(s.route ? `Drag path: ${s.route.length} points` : 'Set the drag path', () => pickRoute(pts => { if (pts) { if (pts.length > 1) s.route = pts; else SB.toast('A drag path needs two points or more.'); } refresh(); }), { cls: 'sm ghost', icon: 'draw', title: 'Click where the drag starts, then every point it passes, then where it ends (double-click or Enter to finish)' }) : null,
      s.mouse === 'drag' && s.route ? W.iconBtn('x', 'No drag path', () => { delete s.route; refresh(); }, 'sm') : null,
      h('span.ts-l', null, 'Key'), W.select(s.key || '', [['', 'None'], ...Object.values(SB.keys.ACT).map(a => [a.id, `${a.label} (${(SB.keys.binding(a.id) || [])[0] || '—'})`])], v => { s.key = v || undefined; refresh(true); }, 'Shortcut to teach'));
    const T = [['select', 'Pick, move and size a drawing', 'select'], ['arrow', 'Arrow', 'arrowR'], ['line', 'Line', 'minus'], ['rect', 'Box', 'sRect'], ['ellipse', 'Ring', 'sEllipse'], ['path', 'Free path', 'draw'], ['dot', 'Dot', 'rec']];
    const a = st.anno != null && (s.ghost || [])[st.anno];
    const draw = h('div.ts-row.ts-draw', null, h('span.ts-l', null, 'Draw'), ...T.map(([k, label, ic]) => W.iconBtn(ic, label, () => setTool(st.tool === k ? null : k), 'sm' + (st.tool === k ? ' on' : ''))),
      a ? h('span.ts-sel', null, h('span.ts-l', null, 'Picked:'),
        ...(a.path || a.line || a.arrow || a.rect || a.ellipse) ? [['arrow', 'Arrow'], ['line', 'Line'], ['rect', 'Box'], ['ellipse', 'Ring']].map(([k, label]) => W.btn('→ ' + label, () => { convert(s, st.anno, k); refresh(); }, { cls: 'sm ghost' })) : [],
        W.colorBtn(a.c || '#FF4F8B', { label: 'Its color', noAlpha: true, change: c => { a.c = c; refresh(true); } }),
        W.check(!!a.solid, 'Solid', v => { a.solid = v || undefined; refresh(true); }),
        (() => { const t = h('input.ts-label', { type: 'text', value: a.label || '', placeholder: 'Label' }); t.onchange = () => { a.label = t.value || undefined; refresh(true); }; return t; })(),
        W.iconBtn('trash', 'Delete this drawing', () => { s.ghost.splice(st.anno, 1); st.anno = null; refresh(); }, 'sm')) : (s.ghost || []).length ? W.btn('Clear all', () => { s.ghost = []; st.anno = null; refresh(); }, { cls: 'sm ghost' }) : null);
    const hint = h('input.ts-hint', { type: 'text', value: s.hint || '', placeholder: s.practice ? 'A hint, shown when they ask for it' : 'A hint if they get stuck (shows after a while)' }); hint.onchange = () => { s.hint = hint.value.trim() || undefined; refresh(true); };
    const task = h('div.ts-row', null, W.check(!!s.practice, 'Task: they try it alone', v => { s.practice = v || undefined; refresh(); }), h('span.ts-l', { title: 'A task leaves the whole app free to use; Hint and Done buttons show in the bubble' }, s.practice ? '(everything works)' : ''),
      s.practice || r.type !== 'next' ? hint : null, h('span.spacer'),
      s.img ? h('img.ts-thumb', { src: s.img, alt: 'Picture in the bubble' }) : null,
      W.btn(s.img ? 'Picture ✓' : 'Picture…', () => pickImage(640, url => { s.img = url; refresh(); }), { cls: 'sm ghost', icon: 'image', title: 'A picture in the guide’s bubble (a reference of what to make)' }),
      s.img ? W.iconBtn('x', 'Remove the picture', () => { delete s.img; refresh(); }, 'sm') : null);
    const bubble = h('div.ts-row', null, h('span.ts-l', null, 'Bubble'), W.seg(s.bubble || 'auto', [['auto', 'Auto'], ['above', 'Above'], ['below', 'Below'], ['left', 'Left'], ['right', 'Right']], v => { s.bubble = v === 'auto' ? undefined : v; refresh(); }),
      s.mouse ? (s.at ? W.btn('Mouse: back to its target', () => { delete s.at; refresh(); }, { cls: 'sm ghost', title: 'The mouse picture is where you dragged it. Click to put it back on what the step points at' }) : h('span.hint', null, 'Drag the mouse picture to move it')) : null,
      s.pos ? W.btn('Guide: free place', () => { delete s.pos; refresh(); }, { cls: 'sm ghost', title: 'This step keeps the guide where it was dragged. Click to let it go back' }) : h('span.hint', null, 'Drag the guide to place it for this step'),
      W.check(!!s.tip, 'Tip card', v => { s.tip = v || undefined; refresh(); }),
      h('span.spacer'),
      W.btn('Move earlier', () => moveStep(-1), { cls: 'sm ghost', title: 'Move this step one place earlier (or drag its chip)' }), W.btn('Move later', () => moveStep(1), { cls: 'sm ghost', title: 'Move this step one place later (or drag its chip)' }));
    el.replaceChildren(top, strip, h('div.ts-step', null, h('div.ts-sayrow', null, say, faces), task, when, point, draw, bubble)); keepScroll();
  }
  /** The step before or after this one. */
  function go(d) { if (!st) return; const k = U.clamp(st.i + d, 0, st.j.steps.length - 1); if (k === st.i) return; st.i = k; st.sel.clear(); st.anno = null; refresh(); }
  addEventListener('keydown', e => { if (!st || st.rec || !e.altKey || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') || (e.target.closest && e.target.closest('input, textarea, select'))) return; e.preventDefault(); e.stopPropagation(); go(e.key === 'ArrowLeft' ? -1 : 1); }, true);
  function moveStep(d) { const steps = st.j.steps, k = st.i + d; if (k < 0 || k >= steps.length) return; [steps[k], steps[st.i]] = [steps[st.i], steps[k]]; st.i = k; refresh(); }
  /** The picked steps become one: their words in order, all their drawings, and the last one's rule and pointing. */
  function combine() {
    const steps = st.j.steps, ks = [...st.sel].filter(k => k < steps.length).sort((a, b) => a - b); if (ks.length < 2) return;
    const list = ks.map(k => steps[k]), last = list[list.length - 1], out = U.deep(last);
    out.say = list.map(x => (x.say || '').trim()).filter(Boolean).join(' '); out.ghost = list.flatMap(x => x.ghost || []); if (!out.ghost.length) delete out.ghost;
    out.key = out.key || (list.find(x => x.key) || {}).key; out.mouse = out.mouse || (list.find(x => x.mouse) || {}).mouse; if (list.some(x => x.stage)) out.stage = true;
    for (let q = ks.length - 1; q >= 0; q--) steps.splice(ks[q], 1); steps.splice(ks[0], 0, out); st.i = ks[0]; st.sel.clear(); refresh(); SB.toast(`${ks.length} steps are one now.`);
  }
  function moreMenu(anchor) {
    const j = st.j, r = anchor.getBoundingClientRect();
    SB.menu.open(r.left, r.top - 4, [{ head: j.title || 'My tutorial' },
      { label: 'Title, card text and level…', run: details },
      { label: 'Character', sub: [{ label: (!j.character ? '✓ ' : '') + `Default (${TS.CHARACTERS[TS.defaultCharacter()].name})`, run: () => { delete j.character; refresh(); } },
        ...Object.entries(TS.CHARACTERS).map(([k, c]) => ({ label: (j.character === k ? '✓ ' : '') + c.name, run: () => { j.character = k; refresh(); } }))] },
      { label: 'Default guide of every tutorial', sub: Object.entries(TS.CHARACTERS).filter(([k]) => k !== 'custom' || (TS.GUIDE.moods && TS.GUIDE.moods.talk)).map(([k, c]) => ({ label: (TS.defaultCharacter() === k ? '✓ ' : '') + c.name, run: () => { S.tourCharacter = k; SB.prefs.save(); refresh(); SB.toast(`${c.name} guides every tutorial that doesn’t pick its own. (The starting default is in tutorials/config.js.)`); } })) },
      { label: j.scene ? 'Start: like this screen again (update)' : 'Start like this screen (layers and settings)', run: () => { j.scene = M().sceneNow(); save(); SB.toast('The tutorial will start like this screen: its layers, the tool, the playhead, Auto key, onion skin, the brush and what is selected.'); } },
      j.scene ? { label: 'Start: an empty screen', run: () => { delete j.scene; save(); } } : null,
      j.base ? { label: (j.replaces ? '✓ ' : '') + 'Show it instead of the built-in', run: () => { j.replaces = !j.replaces; save(); } } : null,
      { label: 'Copy a built-in tutorial', sub: TS.list.filter(d => !d.mine).map(d => ({ label: d.title, run: () => { const n = M().copyBuiltin(d); M().mine().push(n); st.j = n; st.i = 0; refresh(); } })) },
      { label: 'Order of the tutorials…', run: orderDialog }, '-',
      { label: 'Save as a file for the tutorials folder', run: () => { save(); M().saveAsFile(j); } },
      { label: 'Export my tutorials', run: M().exportFile }, { label: 'Import tutorials…', run: () => { M().importFile(); setTimeout(() => panel(), 800); } },
      { label: 'Every setting as a list…', run: () => { save(); const keep = st.j; close(); M().open(); void keep; } }, '-',
      { label: 'Delete this tutorial', run: async () => { const ok = await SB.dialog.ask('Delete this tutorial?', `“${j.title}” goes for good.`, [{ v: 'del', label: 'Delete', danger: true }]); if (ok !== 'del') return; const L = M().mine(); L.splice(L.indexOf(j), 1); if (!L.length) L.push(blank()); st.j = L[0]; st.i = 0; refresh(); } }].filter(Boolean));
  }
  function details() {
    const cover = h('div.ts-coverrow'), j = st.j, f = (label, el) => W.row(label, el), t = (k, area, ph) => { const e = h(area ? 'textarea' : 'input', { type: 'text', rows: 3, placeholder: ph || '' }); e.value = j[k] || ''; e.oninput = () => { j[k] = e.value; }; return e; };
    const dlg = SB.dialog.sheet([h('h2', null, 'Tutorial details'), f('Title', t('title')), f('On its card', t('blurb')), f('Description', t('desc', true)), f('You will learn', t('learn', true, 'One thing per line')),
      f('Level', W.select(j.level || 'Easy', [['Easy', 'Easy'], ['Medium', 'Medium'], ['Harder', 'Harder']], v => { j.level = v; }, 'Level')), f('Minutes', W.num(j.minutes || 3, { min: 1, max: 30, label: 'Minutes', change: v => { j.minutes = v; } })),
      f('At the end', t('outro', false, 'What the guide says when it is done')),
      f('Group', (() => { const id = 'ts-groups', e = h('input', { type: 'text', list: id, placeholder: 'My tutorials' }); e.value = j.group || ''; e.oninput = () => { j.group = e.value.trim() || undefined; };
        return h('span', null, e, h('datalist', { id }, ...TS.groupsOf(TS.list).map(g => h('option', { value: g })))); })()),
      f('Cover', cover), h('div.sheet-actions', null, W.btn('Done', () => { dlg.close(); refresh(); }, { cls: 'primary' }))]);
    function fillCover() { cover.replaceChildren(j.cover ? h('img.ts-cover', { src: j.cover, alt: 'Cover' }) : h('span.hint', null, 'None: the card shows the tutorial’s name.'),
      W.btn('Choose a picture…', () => pickImage(640, url => { j.cover = url; save(); fillCover(); }), { cls: 'sm ghost', icon: 'image' }),
      W.btn('Use the stage now', () => { j.cover = stagePicture(); save(); fillCover(); }, { cls: 'sm ghost', icon: 'shot', title: 'A picture of the stage as it looks right now' }),
      j.cover ? W.btn('Remove', () => { delete j.cover; save(); fillCover(); }, { cls: 'sm ghost' }) : null); }
    fillCover();
  }
  /** Drag tutorials up and down: the gallery shows them in this order (S.tourOrder). */
  function orderDialog() {
    M().register(); const ids = TS.list.map(d => d.id); const list = h('div.ts-order');
    const fill = () => list.replaceChildren(...ids.map((id, k) => { const d = TS.list.find(x => x.id === id); return h('div.ts-orow', null, h('b', null, String(k + 1)), h('span', null, d ? d.title + (d.mine ? ' (mine)' : '') : id),
      W.iconBtn('up', 'Earlier', () => { if (k > 0) { [ids[k - 1], ids[k]] = [ids[k], ids[k - 1]]; fill(); } }, 'sm'), W.iconBtn('down', 'Later', () => { if (k < ids.length - 1) { [ids[k + 1], ids[k]] = [ids[k], ids[k + 1]]; fill(); } }, 'sm')); }));
    fill();
    const dlg = SB.dialog.sheet([h('h2', null, 'Order of the tutorials'), h('p.sub', null, 'The Tutorials gallery shows them in this order.'), list,
      h('div.sheet-actions', null, W.btn('Cancel', () => dlg.close(), { cls: 'ghost' }), W.btn('Save', () => { S.tourOrder = ids.slice(); M().save(); dlg.close(); }, { cls: 'primary' }))]);
  }
  /** Move the panel by its grip. */
  function dragPanel(el) {
    el.addEventListener('pointerdown', e => {
      if (!e.target.closest('.ts-grip')) return; e.preventDefault(); const r = el.getBoundingClientRect(), ox = e.clientX - r.left, oy = e.clientY - r.top;
      const mv = ev => { el.style.left = U.clamp(ev.clientX - ox, 0, innerWidth - 120) + 'px'; el.style.top = U.clamp(ev.clientY - oy, 0, innerHeight - 40) + 'px'; el.style.bottom = 'auto'; el.style.transform = 'none'; };
      const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); }; addEventListener('pointermove', mv); addEventListener('pointerup', up);
    });
  }

  /** Pick a menu item: right-click (or open any menu) in the app and choose it; done gets its path (['Ease', 'Bounce']) or null. */
  function pickMenu(done) {
    const el = st.panelEl; if (el) el.style.visibility = 'hidden'; if (TS.running) TS.running.el && (TS.running.el.style.visibility = 'hidden');
    const tip = h('div.ts-picktip', null, 'Open the menu (right-click) and choose the item. Esc: cancel.'); document.body.appendChild(tip);
    const end = p => { removeEventListener('pointerdown', on, true); removeEventListener('keydown', key, true); tip.remove(); if (el) el.style.visibility = ''; if (TS.running && TS.running.el) TS.running.el.style.visibility = ''; done(p); };
    const on = e => { const b = e.target.closest && e.target.closest('.menu button'); if (!b || b.querySelector('kbd') && b.querySelector('kbd').textContent === '›') return; e.preventDefault(); e.stopPropagation(); const p = M().menuPathOf(b); SB.menu.close(); end(p); };
    const key = e => { if (e.key === 'Escape' && !SB.menu.isOpen()) { e.preventDefault(); end(null); } };
    addEventListener('pointerdown', on, true); addEventListener('keydown', key, true);
  }

  /** A picture you pick from your files, made at most maxW wide (pictures keep their see-through parts). */
  function pickImage(maxW, done) {
    const inp = h('input', { type: 'file', accept: 'image/*' });
    inp.onchange = () => { const f = inp.files && inp.files[0]; if (!f) return; const url = URL.createObjectURL(f), im = new Image();
      im.onload = () => { const k = Math.min(1, maxW / im.naturalWidth), cv = h('canvas', { width: Math.max(1, Math.round(im.naturalWidth * k)), height: Math.max(1, Math.round(im.naturalHeight * k)) }); cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height); URL.revokeObjectURL(url);
        done(/png|gif|webp|svg/.test(f.type) ? cv.toDataURL('image/png') : cv.toDataURL('image/jpeg', 0.86)); };
      im.onerror = () => { URL.revokeObjectURL(url); SB.toast('That picture can’t be opened.'); }; im.src = url; };
    inp.click();
  }
  /** The stage as it looks now, as a picture (a tutorial's cover). */
  function stagePicture(w = 640) { const p = S.project, cv = h('canvas', { width: w, height: Math.round(w * p.h / p.w) }); SB.scene.render(cv.getContext('2d'), S.time, w / p.w, {}); return cv.toDataURL('image/jpeg', 0.86); }
  /** Click the points a drag goes through (over the stage they stick to the stage); double-click or Enter ends, Esc cancels, right-click takes the last one back. */
  function pickRoute(done) {
    const el = st.panelEl, guide = TS.running && TS.running.el; if (el) el.style.visibility = 'hidden'; if (guide) guide.style.visibility = 'hidden'; setTool(null);
    const pts = [], lay = h('div.ts-layer.ts-route'), svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('class', 'ts-preview'); lay.appendChild(svg); document.body.appendChild(lay);
    const tip = h('div.ts-picktip', null, 'Click where the drag starts, then each point it passes, then where it ends. ', W.btn('Done', () => end(true), { cls: 'sm primary' }), ' ', W.btn('Cancel', () => end(false), { cls: 'sm ghost' })); document.body.appendChild(tip);
    const draw = () => { svg.setAttribute('viewBox', `0 0 ${innerWidth} ${innerHeight}`); svg.innerHTML = pts.length ? TS.annoSvg({ path: pts.flatMap(p => [p[0], p[1]]), c: '#FF4F8B' }, (x, y) => [x, y], 1) + pts.map((p, i) => `<circle cx="${p[0]}" cy="${p[1]}" r="${i ? 6 : 8}" fill="${i ? '#fff' : '#FF4F8B'}" stroke="#FF4F8B" stroke-width="3"/>`).join('') : ''; };
    const end = ok => { lay.remove(); tip.remove(); removeEventListener('keydown', key, true); if (el) el.style.visibility = ''; if (guide) guide.style.visibility = ''; done(ok ? pts.map(([x, y]) => onStage(x, y) ? toStage(x, y) : { x: +(x / innerWidth).toFixed(4), y: +(y / innerHeight).toFixed(4) }) : null); };
    const key = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); end(false); } else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); end(true); } };
    lay.addEventListener('pointerdown', e => { e.preventDefault(); if (e.button === 2) { pts.pop(); return draw(); } const l = pts[pts.length - 1]; if (!l || Math.hypot(e.clientX - l[0], e.clientY - l[1]) > 4) pts.push([e.clientX, e.clientY]); draw(); });
    lay.addEventListener('dblclick', e => { e.preventDefault(); end(true); }); lay.addEventListener('contextmenu', e => e.preventDefault()); addEventListener('keydown', key, true);
  }

  // ================= drawing on the screen
  const stageRect = () => document.getElementById('stageDoc').getBoundingClientRect();
  const toStage = (x, y) => { const r = stageRect(); return [Math.round((x - r.left) / r.width * S.project.w), Math.round((y - r.top) / r.height * S.project.h)]; };
  const fromStage = (x, y) => { const r = stageRect(); return [r.left + x / S.project.w * r.width, r.top + y / S.project.h * r.height]; };
  const onStage = (x, y) => { const r = stageRect(), w = document.getElementById('stageWrap').getBoundingClientRect(); return x >= w.left && x <= w.right && y >= w.top && y <= w.bottom && r.width > 0; };
  /** Points of a drawing in the window (x, y pairs), whichever space it is in. */
  const winPts = g => { const q = g.path || g.poly || g.arrow || g.line || g.rect || g.dot || (g.ellipse ? [g.ellipse[0] - g.ellipse[2], g.ellipse[1] - g.ellipse[3], g.ellipse[0] + g.ellipse[2], g.ellipse[1] + g.ellipse[3]] : g.circle ? [g.circle[0] - g.circle[2], g.circle[1] - g.circle[2], g.circle[0] + g.circle[2], g.circle[1] + g.circle[2]] : []), out = [];
    for (let i = 0; i + 1 < q.length; i += 2) out.push(g.space === 'screen' ? [q[i] * innerWidth, q[i + 1] * innerHeight] : fromStage(q[i], q[i + 1])); return out; };
  let layer = null, selEl = null;
  function setTool(t) {
    if (!st) return; st.tool = t;
    if (!t) { if (layer) layer.hidden = true; panel(); drawSel(); return; }
    if (!layer) { layer = h('div.ts-layer'); document.body.appendChild(layer); layer.addEventListener('pointerdown', down); }
    layer.hidden = false; layer.dataset.tool = t; panel(); drawSel();
  }
  function down(e) {
    if (!st || !st.tool) return; e.preventDefault(); const s = step(); if (!s) return; const x0 = e.clientX, y0 = e.clientY, stg = onStage(x0, y0);
    if (st.tool === 'select') { // a handle of the picked drawing, or the drawing nearest the click (then drag to move it)
      const g0 = st.anno != null && (s.ghost || [])[st.anno], hd = g0 && handleAt(g0, x0, y0);
      if (!hd) { st.anno = hitAt(s, x0, y0); panel(); drawSel(); }
      const k = st.anno; if (k == null) return; const orig = U.deep(s.ghost[k]), mode = hd || { kind: 'move' }; let moved = false;
      const mv = ev => { const dx = ev.clientX - x0, dy = ev.clientY - y0; if (!moved && Math.hypot(dx, dy) < 3) return; moved = true; let f, sx = 1, sy = 1;
        if (mode.kind === 'move') f = p => [p[0] + dx, p[1] + dy];
        else if (mode.kind === 'end') f = null;
        else { const ax = mode.ax, ay = mode.ay, w0 = mode.px - ax || 1, h0 = mode.py - ay || 1; sx = (mode.px + dx - ax) / w0; sy = (mode.py + dy - ay) / h0; if (ev.shiftKey || orig.circle) { const u = Math.abs(sx) > Math.abs(sy) ? sx : sy; sx = Math.sign(sx || 1) * Math.abs(u); sy = Math.sign(sy || 1) * Math.abs(u); } f = p => [ax + (p[0] - ax) * sx, ay + (p[1] - ay) * sy]; }
        s.ghost[k] = mode.kind === 'end' ? movePt(orig, mode.i, ev.clientX, ev.clientY) : mapGhost(orig, f, sx, sy); TS.show(st.i, M().defOf(st.j)); drawSel(); };
      const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); if (moved) { save(); refresh(true); } };
      addEventListener('pointermove', mv); addEventListener('pointerup', up); return;
    }
    const pts = [[x0, y0]], preview = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); preview.setAttribute('class', 'ts-preview'); layer.appendChild(preview);
    const mk = () => { const a = pts[0], b = pts[pts.length - 1], P = stg ? p => toStage(p[0], p[1]) : p => [+(p[0] / innerWidth).toFixed(4), +(p[1] / innerHeight).toFixed(4)], A = P(a), B = P(b), g = {};
      if (st.tool === 'path') g.path = pts.flatMap(P); else if (st.tool === 'dot') g.dot = A;
      else if (st.tool === 'ellipse') g.ellipse = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2, Math.abs(B[0] - A[0]) / 2, Math.abs(B[1] - A[1]) / 2].map(v => +v.toFixed(4));
      else g[st.tool] = [...A, ...B];
      if (!stg) g.space = 'screen'; return g; };
    const show = () => { const g = mk(); preview.setAttribute('viewBox', `0 0 ${innerWidth} ${innerHeight}`); preview.innerHTML = TS.annoSvg(g, g.space === 'screen' ? (x, y) => [x * innerWidth, y * innerHeight] : (x, y) => fromStage(x, y), 1); };
    const mv = ev => { const l = pts[pts.length - 1]; if (Math.hypot(ev.clientX - l[0], ev.clientY - l[1]) < 5) return; if (st.tool === 'path') pts.push([ev.clientX, ev.clientY]); else pts[1] = [ev.clientX, ev.clientY]; show(); };
    const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); preview.remove(); if (st.tool !== 'dot' && pts.length < 2) return;
      const g = mk(); (s.ghost = s.ghost || []).push(g); st.anno = s.ghost.length - 1; refresh(); drawSel(); };
    addEventListener('pointermove', mv); addEventListener('pointerup', up); if (st.tool === 'dot') up();
  }
  /** Outline the picked drawing. */
  function drawSel() {
    if (!selEl) { selEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); selEl.setAttribute('class', 'ts-selsvg'); document.body.appendChild(selEl); }
    const s = step(), g = st && st.anno != null && s && (s.ghost || [])[st.anno]; if (!g) { selEl.innerHTML = ''; return; }
    selEl.setAttribute('viewBox', `0 0 ${innerWidth} ${innerHeight}`); selEl.innerHTML = TS.annoSvg(Object.assign({}, g, { c: '#2F7FF0', solid: true, label: undefined }), g.space === 'screen' ? (x, y) => [x * innerWidth, y * innerHeight] : (x, y) => fromStage(x, y), 1.6)
      + (st.tool === 'select' ? (() => { const b = boxOf(g); return `<rect x="${b[0]}" y="${b[1]}" width="${b[2] - b[0]}" height="${b[3] - b[1]}" fill="none" stroke="#2F7FF0" stroke-dasharray="4 3"/>` + handles(g).map(p => `<rect x="${p.x - 6}" y="${p.y - 6}" width="12" height="12" rx="${p.kind === 'end' ? 6 : 2}" fill="#fff" stroke="#2F7FF0" stroke-width="2"/>`).join(''); })() : '');
  }
  setInterval(() => { if (st && st.anno != null) drawSel(); }, 400); // follows the stage as it zooms
  /** The window box of a drawing: [x0, y0, x1, y1]. */
  const boxOf = g => { const P = winPts(g), xs = P.map(p => p[0]), ys = P.map(p => p[1]); return xs.length ? [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] : [0, 0, 0, 0]; };
  /** Handles of a drawing: the two ends of a line or an arrow; the corners (size) of the others (a dot has none). */
  function handles(g) {
    if (g.dot) return [];
    if (g.line || g.arrow) return winPts(g).map((p, i) => ({ kind: 'end', i, x: p[0], y: p[1] }));
    const [x0, y0, x1, y1] = boxOf(g); return [[x0, y0, x1, y1], [x1, y0, x0, y1], [x1, y1, x0, y0], [x0, y1, x1, y0]].map(([px, py, ax, ay]) => ({ kind: 'size', x: px, y: py, px, py, ax, ay }));
  }
  const handleAt = (g, x, y) => handles(g).find(p => Math.abs(p.x - x) <= 9 && Math.abs(p.y - y) <= 9) || null;
  /** The drawing of step s under window point x, y (its line, or inside its box), or null. */
  function hitAt(s, x0, y0) {
    let best = 14, k = null;
    (s.ghost || []).forEach((g, i) => { const P = winPts(g); for (let q = 0; q < P.length; q++) { const a = P[q], b = P[q + 1] || a, vx = b[0] - a[0], vy = b[1] - a[1], ll = vx * vx + vy * vy || 1, t = U.clamp(((x0 - a[0]) * vx + (y0 - a[1]) * vy) / ll, 0, 1), d = Math.hypot(a[0] + vx * t - x0, a[1] + vy * t - y0); if (d < best) { best = d; k = i; } } });
    if (k != null) return k;
    (s.ghost || []).forEach((g, i) => { if (k != null || !(g.rect || g.ellipse || g.circle)) return; const b = boxOf(g); if (x0 >= b[0] - 6 && x0 <= b[2] + 6 && y0 >= b[1] - 6 && y0 <= b[3] + 6) k = i; });
    return k;
  }
  /** Window point → the drawing's own space (stage pixels, or window fractions). */
  const back = (g, p) => g.space === 'screen' ? [+(p[0] / innerWidth).toFixed(4), +(p[1] / innerHeight).toFixed(4)] : toStage(p[0], p[1]);
  /** A copy of drawing g with every point moved by f (window space); radii scale by sx, sy. */
  function mapGhost(g, f, sx, sy) {
    const out = U.deep(g), pts = k => { const q = g[k], o = []; for (let i = 0; i + 1 < q.length; i += 2) { const w = g.space === 'screen' ? [q[i] * innerWidth, q[i + 1] * innerHeight] : fromStage(q[i], q[i + 1]); o.push(...back(g, f(w))); } return o; };
    for (const k of ['path', 'poly', 'arrow', 'line', 'dot']) if (g[k]) out[k] = pts(k);
    if (g.rect) { const r = pts('rect'); out.rect = [Math.min(r[0], r[2]), Math.min(r[1], r[3]), Math.max(r[0], r[2]), Math.max(r[1], r[3])]; }
    if (g.ellipse || g.circle) { const e = g.ellipse || [g.circle[0], g.circle[1], g.circle[2], g.circle[2]], c = pts(g.ellipse ? 'ellipse' : 'circle').slice(0, 2), rx = +(e[2] * Math.abs(sx)).toFixed(4), ry = +(e[3] * Math.abs(sy)).toFixed(4);
      if (g.circle) out.circle = [c[0], c[1], +((rx + ry) / 2).toFixed(4)]; else out.ellipse = [c[0], c[1], rx, ry]; }
    return out;
  }
  /** Drawing g with its point i (an end of a line or an arrow) at window point x, y. */
  const movePt = (g, i, x, y) => { const out = U.deep(g), k = g.arrow ? 'arrow' : 'line', p = back(g, [x, y]); out[k][i * 2] = p[0]; out[k][i * 2 + 1] = p[1]; return out; };
  /** Turn drawing k of step s into an arrow, a line, a box or a ring (from its ends or its box). */
  function convert(s, k, to) {
    const g = s.ghost[k], q = g.path || g.poly || g.arrow || g.line || g.rect || (g.ellipse ? [g.ellipse[0] - g.ellipse[2], g.ellipse[1] - g.ellipse[3], g.ellipse[0] + g.ellipse[2], g.ellipse[1] + g.ellipse[3]] : null); if (!q) return;
    const xs = q.filter((v, i) => i % 2 === 0), ys = q.filter((v, i) => i % 2 === 1), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys), n = q.length;
    const out = { space: g.space, c: g.c, label: g.label, solid: g.solid };
    if (to === 'arrow' || to === 'line') out[to] = g.rect || g.ellipse ? [x0, y1, x1, y0] : [q[0], q[1], q[n - 2], q[n - 1]];
    else if (to === 'rect') out.rect = [x0, y0, x1, y1]; else out.ellipse = [(x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) / 2, (y1 - y0) / 2];
    for (const kk of Object.keys(out)) if (out[kk] === undefined) delete out[kk]; s.ghost[k] = out;
  }

  // ================= recording: what you do becomes steps
  const selectorOf = el => M().selectorOf(el);
  const labelOf = el => { const b = el && el.closest('button, a, [role="tab"], label, .th, .kf') || el; if (!b) return 'here'; return (b.getAttribute('aria-label') || b.getAttribute('title') || b.textContent || '').trim().split('\n')[0].replace(/\s*\(.*?\)\s*$/, '').slice(0, 40) || 'here'; };
  const partCount = () => tree.all().reduce((n, o) => n + (o.frames ? (SB.frames.current(o) || { strokes: [] }).strokes.filter(s => !s.er).length : 0), 0);
  const snap = () => JSON.stringify(S.objects, (k, v) => k[0] === '_' ? undefined : v);
  const add = s => { const R = st.rec; R.steps.push(Object.assign({ t: performance.now() }, s)); panel(); };
  const inStudio = el => !!(el && el.closest && el.closest('.tstudio, .tour-guide, .ts-layer'));
  function startRec() {
    if (!st) return; setTool(null); if (TS.running) TS.stop(true); // the guide steps aside while you record
    const R = st.rec = { steps: [], down: null };
    R.key = e => { if (inStudio(e.target) || (e.target.closest && e.target.closest('input,textarea,select'))) return; const c = SB.keys.comboOf(e); if (!c) return; const id = Object.keys(SB.keys.ACT).find(a => (SB.keys.binding(a) || []).includes(c)); if (!id) return;
      const A = SB.keys.ACT[id], before = { tool: S.tool, play: S.playing, keys: keyTotal() };
      setTimeout(() => {
        if (S.tool !== before.tool) return add({ say: `Pick the ${(SB.tools.get(S.tool) || {}).label || S.tool}.`, key: id, rule: { type: 'tool', tool: S.tool }, show: `#rail button[aria-label="${(SB.tools.get(S.tool) || {}).label}"]`, mood: 'talk' });
        if (id === 'play') return add({ say: S.playing ? 'Press Space to play it.' : 'Press Space to stop.', key: 'play', rule: { type: S.playing ? 'playing' : 'stopped' }, show: '#btnPlay', mood: 'happy' });
        if (id === 'key') { const o = tree.sel(); return add({ say: 'Add a keyframe.', key: 'key', rule: o ? { type: 'keys', layer: o.name, n: keyTotal(o) } : { type: 'key', action: 'key' }, mood: 'point' }); }
        add({ say: `Press ${SB.keys.pretty ? SB.keys.pretty(c) : c}: ${A.label.toLowerCase()}.`, key: id, rule: { type: 'key', action: id }, mood: 'talk' });
      }, id === 'play' ? 120 : 30);
    };
    R.pd = e => {
      if (inStudio(e.target)) return; const stg = !!(e.target.closest && e.target.closest('#stageWrap')) && !e.target.closest('#ctxbar, .zoombadge');
      R.down = { x: e.clientX, y: e.clientY, btn: e.button, el: e.target, stg, pts: [[e.clientX, e.clientY]], parts: partCount(), json: stg ? snap() : null, sel: S.sel, menu: !!(e.target.closest && e.target.closest('.menu')), mpath: (() => { const b = e.target.closest && e.target.closest('.menu button'); return b ? M().menuPathOf(b) : null; })(), sub: !!(e.target.closest && e.target.closest('.menu button') && (e.target.closest('.menu button').querySelector('kbd') || {}).textContent === '›'), time: S.time, tool: S.tool };
    };
    R.pm = e => { const d = R.down; if (!d || !d.stg) return; const l = d.pts[d.pts.length - 1]; if (Math.hypot(e.clientX - l[0], e.clientY - l[1]) >= 6) d.pts.push([e.clientX, e.clientY]); };
    R.pu = e => { const d = R.down; R.down = null; if (!d || inStudio(d.el)) return; setTimeout(() => classify(d, e), 60); };
    R.cm = e => { if (inStudio(e.target)) return; };
    addEventListener('keydown', R.key, true); addEventListener('pointerdown', R.pd, true); addEventListener('pointermove', R.pm, true); addEventListener('pointerup', R.pu, true);
    panel(); SB.toast('Recording. Do the steps in the app, then press Stop.');
  }
  const keyTotal = o => (o ? [o] : tree.all()).reduce((n, x) => n + Object.values(x.tracks || {}).reduce((a, t) => a + t.length, 0), 0);
  function classify(d, e) {
    if (!st || !st.rec) return; const moved = d.pts.length > 2 || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 8, el = d.el;
    if (d.menu) { // a menu item: goes onto the step that opened the menu ("Right-click here, then choose Ease › Bounce")
      if (!d.mpath || d.sub) return; const path = d.mpath.join(' › '), last = st.rec.steps[st.rec.steps.length - 1];
      if (last && ((last.rule.type === 'menu' && !last.rule.item) || last.rule.type === 'click') && performance.now() - last.t < 20000) {
        last.rule = { type: 'menu', item: path }; last.say = last.say.replace(/[.!]$/, '') + `, then choose ${path}.`; last.t = performance.now(); panel(); return;
      }
      return add({ say: `Choose ${path}.`, mouse: 'left', rule: { type: 'menu', item: path }, mood: 'point' });
    }
    if (d.btn === 2) { // a right-click
      if (d.stg) { const P = toStage(d.x, d.y); return add({ say: 'Right-click here.', stage: true, mouse: 'right', at: P, rule: { type: 'menu' }, ghost: [{ dot: P }], mood: 'point' }); }
      return add({ say: `Right-click ${labelOf(el)}.`, show: selectorOf(el), mouse: 'right', rule: { type: 'menu' }, mood: 'point' });
    }
    if (d.stg) { // on the stage: drawing, dragging, or a click that selects
      const parts = partCount(), P = d.pts.concat([[e.clientX, e.clientY]]).map(p => toStage(p[0], p[1])), o = tree.sel();
      if (parts > d.parts) return add({ say: moved ? 'Draw here, along the pink line.' : 'Click here.', stage: true, mouse: moved ? 'drag' : 'left', at: P[0], rule: { type: 'draw', layer: o ? o.name : '', n: parts - d.parts }, ghost: [moved ? { path: simplify(P) } : { dot: P[0] }], mood: 'point' });
      if (moved && snap() !== d.json) return add({ say: 'Drag it here.', stage: true, mouse: 'drag', at: P[0], rule: { type: 'changed', layer: o ? o.name : '' }, ghost: [{ arrow: [...P[0], ...P[P.length - 1]] }], mood: 'point' });
      if (S.sel !== d.sel && o) return add({ say: `Click the ${o.name} to select it.`, stage: true, mouse: 'left', at: P[0], rule: { type: 'select', layer: o.name }, ghost: [{ ellipse: [...P[0], 60, 60] }], mood: 'talk' });
      if (snap() !== d.json) return add({ say: 'Click here.', stage: true, mouse: 'left', at: P[0], rule: { type: 'changed' }, ghost: [{ dot: P[0] }], mood: 'point' });
      return;
    }
    if (el.closest && el.closest('.tl-row.ruler')) return add({ say: `Click the ruler at ${U.r2(S.time)} seconds.`, show: '#tl .tl-row.ruler', mouse: 'left', rule: { type: 'time', t: U.r2(S.time) }, mood: 'point' });
    if (el.closest && el.closest('#rail') && S.tool !== d.tool) return add({ say: `Pick the ${(SB.tools.get(S.tool) || {}).label || S.tool}.`, show: selectorOf(el), mouse: 'left', rule: { type: 'tool', tool: S.tool }, key: SB.keys.ACT['t' + S.tool[0].toUpperCase() + S.tool.slice(1)] ? 't' + S.tool[0].toUpperCase() + S.tool.slice(1) : undefined, mood: 'talk' });
    if (el.closest && el.closest('input, textarea, select')) return; // typing or picking a value: you add it yourself if it matters
    const tgt = el.closest && el.closest('button, a, [role="tab"], label, .th, .kf, .tl-head, .colorbtn');
    if (tgt && tgt.id === 'btnPlay') return add({ say: S.playing ? 'Press Play to watch it.' : 'Stop it.', key: 'play', show: '#btnPlay', mouse: 'left', rule: { type: S.playing ? 'playing' : 'stopped' }, mood: S.playing ? 'happy' : 'talk' });
    if (tgt) return add({ say: `Click ${labelOf(tgt)}.`, show: selectorOf(tgt), mouse: 'left', rule: { type: 'click' }, mood: 'point' });
  }
  const simplify = P => { const out = []; let l = null; for (const p of P) { if (!l || Math.hypot(p[0] - l[0], p[1] - l[1]) > 12) { out.push(p[0], p[1]); l = p; } } const z = P[P.length - 1]; if (l !== z) out.push(z[0], z[1]); return out; };
  function stopRec() {
    if (!st || !st.rec) return; const R = st.rec; st.rec = null;
    removeEventListener('keydown', R.key, true); removeEventListener('pointerdown', R.pd, true); removeEventListener('pointermove', R.pm, true); removeEventListener('pointerup', R.pu, true);
    const got = R.steps.map(s => { const c = Object.assign({}, s); delete c.t; delete c._menu; for (const k in c) if (c[k] === undefined) delete c[k]; return c; });
    if (got.length) { st.j.steps.splice(st.i + 1, 0, ...got); st.sel = new Set(got.map((g, k) => st.i + 1 + k)); st.i = st.i + 1; }
    refresh(); SB.toast(got.length ? `${got.length} step${got.length === 1 ? '' : 's'} recorded. Fix their words, combine some (Shift-click, Combine), and tidy the drawings.` : 'Nothing was recorded.');
  }
  TS.studio = { open, close, panel, refresh, drawsGhosts: () => false, get state() { return st; } };
})(window.SB);
