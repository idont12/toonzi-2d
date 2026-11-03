/* Tutorial maker (Settings › Tutorial maker…): make and change tutorials without code. Kept with your own settings
   (S.myTours), so they are yours in every project; Export / Import move them as a file.
   A tutorial: { id, title, blurb, desc, level, minutes, base (a built-in it was copied from: its start and its steps' checks),
   replaces (the built-in it stands in for), scene ({ proj, objects }: what the practice screen starts with), steps }.
   A step: { say, rule: { type, … } (when it goes on: the "magic rules" in RULES), key, show (a CSS selector, picked on
   screen), stage (clicks on the stage allowed), allow (more selectors), mouse, at ([x, y]), ghost ([guide…]), minTime (s),
   hint, ref ('<built-in id>#<step>': a copied step keeps that step's check and pointing unless you change them) }. */
'use strict';
(function (SB) {
  const U = SB.util, S = SB.state, h = U.h, W = SB.w, tree = SB.tree, TS = SB.tours;
  const mine = () => (S.myTours = S.myTours || []);
  const save = () => { SB.prefs && SB.prefs.save && SB.prefs.save(); register(); };

  // ================= the magic rules: when a step goes on
  const objOf = (T, name) => name ? T.o(name) : null;
  const allParts = (T, name) => { const list = name ? [objOf(T, name)].filter(Boolean) : tree.all().filter(o => o.frames); return list.reduce((n, o) => n + (o.frames ? (SB.frames.current(o) || { strokes: [] }).strokes.filter(s => !s.er).length : 0), 0); };
  const keyCount = o => o ? Object.values(o.tracks || {}).reduce((n, t) => n + t.length, 0) : 0;
  const stateOf = (T, name) => JSON.stringify(name ? objOf(T, name) : S.objects, (k, v) => k[0] === '_' ? undefined : v);
  const RULES = {
    next: { label: 'They press Next', fields: [] },
    tool: { label: 'A tool is picked', fields: [['tool', 'Tool', 'tool']], check: (r) => S.tool === r.tool },
    key: { label: 'A shortcut is pressed', fields: [['action', 'Shortcut', 'action']], check: (r, T) => T.pressed(r.action) },
    select: { label: 'A layer is selected', fields: [['layer', 'Layer name', 'layer']], check: (r, T) => { const o = objOf(T, r.layer); return !!o && S.multi.has(o.id); } },
    draw: { label: 'They draw (new parts)', fields: [['layer', 'On layer (empty: any)', 'layer'], ['n', 'How many parts', 'num']], start: (r, T, D) => { D.n0 = allParts(T, r.layer); }, check: (r, T, D) => allParts(T, r.layer) >= D.n0 + (r.n || 1) },
    changed: { label: 'A layer changes (moved, edited…)', fields: [['layer', 'Layer name (empty: anything)', 'layer']], start: (r, T, D) => { D.s0 = stateOf(T, r.layer); }, check: (r, T, D) => stateOf(T, r.layer) !== D.s0 },
    frames: { label: 'A layer has frames', fields: [['layer', 'Layer name', 'layer'], ['n', 'At least', 'num']], check: (r, T) => { const o = objOf(T, r.layer); return !!o && (o.frames || []).length >= (r.n || 2); } },
    keys: { label: 'A layer has keyframes', fields: [['layer', 'Layer name', 'layer'], ['n', 'At least', 'num']], check: (r, T) => keyCount(objOf(T, r.layer)) >= (r.n || 1) },
    time: { label: 'The playhead is at a time', fields: [['t', 'Seconds', 'num']], check: (r, T) => T.timeAt(+r.t || 0) },
    playing: { label: 'It plays', fields: [], check: () => S.playing },
    stopped: { label: 'It stops', fields: [], check: () => !S.playing },
    autokey: { label: 'Auto key is…', fields: [['on', 'On', 'check']], check: r => !!S.autoKey === !!r.on },
    menu: { label: 'A menu opens (right-click), then…', fields: [['item', 'Then they choose', 'menupath']], start: (r, T, D) => { D.chose = false; if (r.item) D.off = listenMenu(r.item, D); }, check: (r, T, D) => r.item ? D.chose : SB.menu.isOpen() },
    click: { label: 'They click what it points at', fields: [], start: (r, T, D) => { D.clicked = false; D.off = listenClick(D); }, check: (r, T, D) => D.clicked },
    wait: { label: 'Some seconds pass', fields: [['s', 'Seconds', 'num']], start: (r, T, D) => { D.t0 = performance.now(); }, check: (r, T, D) => performance.now() - D.t0 >= (r.s || 3) * 1000 },
    js: { label: 'A check of my own (JavaScript)', fields: [['code', 'Expression (T, S, SB)', 'code']], check: (r, T) => { try { return !!new Function('T', 'S', 'SB', 'return (' + (r.code || 'false') + ')')(T, S, SB); } catch (e) { return false; } } },
    builtin: { label: 'As in the original step', fields: [] },
  };
  /** The words of a menu item and of the items it sits under: ['Ease', 'Bounce'] (open menus mark the item whose submenu shows). */
  const itemText = b => ((b.querySelector('.mi') || b).textContent || '').trim().replace(/^✓\s*/, '');
  function menuPathOf(btn) {
    const ms = [...document.querySelectorAll('.menu:not([hidden])')], m = btn.closest('.menu'), k = ms.indexOf(m), out = [];
    for (let l = 0; l < k; l++) { const o = ms[l].querySelector('.sub-open'); if (o) out.push(itemText(o)); }
    out.push(itemText(btn)); return out;
  }
  const splitPath = p => String(p || '').split(/\s*[›>]\s*/).map(x => x.trim()).filter(Boolean);
  /** The menu rule with "then they choose": done when that item (its last word) is pressed. */
  function listenMenu(path, D) {
    const last = splitPath(path).pop() || '';
    const on = e => { const b = e.target.closest && e.target.closest('.menu button'); if (b && last && itemText(b).startsWith(last)) D.chose = true; };
    addEventListener('pointerdown', on, true); addEventListener('click', on, true); return () => { removeEventListener('pointerdown', on, true); removeEventListener('click', on, true); };
  }
  /** The click rule listens for a press on what the step points at. */
  function listenClick(D) {
    const on = e => { const run = TS.running; if (!run) return; const st = run.def.steps[run.i], el = st && (typeof st.show === 'string' ? document.querySelector(st.show) : null); if (el && el.contains(e.target)) D.clicked = true; };
    addEventListener('pointerdown', on, true); return () => removeEventListener('pointerdown', on, true);
  }

  // ================= a saved tutorial → a tutorial the guide can run
  const builtinStep = ref => { if (!ref) return null; const [id, i] = ref.split('#'), d = TS.list.find(x => x.id === id && !x.mine); return d ? d.steps[+i] || null : null; };
  function stepOf(j) {
    const b = builtinStep(j.ref), r = j.rule || { type: b ? 'builtin' : 'next' }, R = RULES[r.type] || RULES.next, D = {};
    const st = {
      say: j.say || (b && b.say) || '', key: j.key ?? (b && b.key), mouse: j.mouse ?? (b && b.mouse), tip: j.tip, mood: j.mood || (j.practice ? 'think' : b && b.mood), pos: j.pos, bubble: j.bubble,
      img: j.img || undefined, route: j.route && j.route.length > 1 ? j.route : undefined, practice: !!j.practice, hint: j.hint || undefined, // a picture in the bubble; the mouse's drag path; a task you try alone (with a hint on request)
      show: j.show || (b && b.show) || undefined, at: j.at || (b && b.at) || undefined, ghost: j.ghost && j.ghost.length ? j.ghost : b && b.ghost,
      allow: j.stage != null || j.allow ? [...(j.stage ? ['stage'] : []), ...(j.allow || [])] : b && b.allow, free: j.practice ? true : j.free ?? (b && b.free), keys: b && b.keys,
      rightOnly: r.type === 'menu' ? true : undefined, // a right-click step: no other clicks or tools until the menu shows
      minTime: j.minTime != null ? j.minTime * 1000 : b && b.minTime, draw: r.type === 'draw' || (b && b.draw),
      enter: T => { if (D.off) { D.off(); D.off = null; } if (R.start) R.start(r, T, D); if (b && b.enter && r.type === 'builtin') b.enter(T); },
    };
    if (r.type === 'menu' && r.item) { // first the right-click (where the step points), then, once the menu shows, the item and the items it sits under
      const path = splitPath(r.item), find = TS.at.item(...path.slice().reverse()), show0 = st.show, at0 = st.at, m0 = st.mouse || 'right';
      const open = () => SB.menu.isOpen() && find(); // the menu's own element when nothing matches
      st.show = T => open() || (show0 ? (typeof show0 === 'function' ? show0(T) : document.querySelector(show0)) : null);
      st.at = T => SB.menu.isOpen() ? null : typeof at0 === 'function' ? at0(T) : at0; st.mouse = () => SB.menu.isOpen() ? 'left' : m0;
    }
    if (r.type === 'builtin' && b) st.task = b.task ? Object.assign({}, b.task, j.hint ? { hint: j.hint } : {}) : undefined;
    else if (r.type !== 'next' && R.check) st.task = { check: T => R.check(r, T, D), hint: j.hint };
    return st;
  }
  function defOf(j) {
    const base = j.base && TS.list.find(x => x.id === j.base && !x.mine);
    return { id: j.id, mine: true, character: j.character, group: j.group || (base && base.group) || undefined, cover: j.cover || undefined, replaces: j.replaces ? j.base : undefined, title: j.title || 'My tutorial', blurb: j.blurb || '', desc: j.desc || '', level: j.level || 'Easy', minutes: j.minutes || 3,
      learn: (j.learn || '').split('\n').map(x => x.trim()).filter(Boolean), outro: j.outro, duration: j.scene ? j.scene.proj.duration : base && base.duration,
      preview: base ? base.preview : (c, t, w, hh) => { c.fillStyle = '#F4F2FF'; c.fillRect(0, 0, w, hh); c.fillStyle = '#5B3DF5'; c.font = '700 22px system-ui, sans-serif'; c.textAlign = 'center'; c.fillText(j.title || 'My tutorial', w / 2, hh / 2 + 8 + Math.sin(t * 2) * 4); },
      setup: T => { if (j.scene) startScene(j.scene); else if (base && base.setup) base.setup(T); },
      steps: (j.steps || []).map(stepOf) };
  }
  /** The practice screen starts with the saved scene (copies with new ids). */
  function startScene(sc) {
    const objs = U.deep(sc.objects || []); SB.screens.remapIds(objs);
    Object.assign(S.project, { w: sc.proj.w, h: sc.proj.h, fps: sc.proj.fps, duration: sc.proj.duration, bg: sc.proj.bg });
    S.objects.splice(0, S.objects.length, ...objs); tree.reindex();
    const st = sc.state; if (!st) return; // the settings it starts with: the tool, the playhead, Auto key, onion skin, the brush, what is selected
    try {
      if (st.brush) Object.assign(S.brush, st.brush); if (st.autoKey != null) S.autoKey = st.autoKey; if (st.onion != null) S.onion = st.onion;
      const ids = (st.sel || []).map(n => (tree.all().find(o => o.name === n) || {}).id).filter(Boolean); tree.select(ids);
      if (st.tool && SB.tools.get(st.tool)) SB.tool.set(st.tool); if (st.time != null) SB.time.set(st.time); SB.invalidate();
    } catch (e) { console.error('tutorial start settings', e); }
  }
  /** The screen as it is now, to start a tutorial with: its layers and settings (see startScene). */
  function sceneNow() {
    SB.screens.sync && SB.screens.sync();
    return { proj: U.deep(S.project), objects: JSON.parse(JSON.stringify(S.objects, (k, v) => k[0] === '_' ? undefined : v)),
      state: { tool: S.tool, time: U.r2(S.time), autoKey: !!S.autoKey, onion: !!S.onion, brush: { color: S.brush.color, size: S.brush.size }, sel: tree.selected().map(o => o.name) } };
  }
  function register() {
    TS.list = TS.list.filter(d => !d.mine && !d.fromFile); for (const j of TS.fileTours || []) if (!TS.list.some(d => d.id === j.id)) TS.add(Object.assign(defOf(j), { mine: false, fromFile: true, json: j }));
    for (const j of mine()) TS.add(defOf(j)); sortTours();
  }
  /** A tutorial saved as a file for the tutorials folder (tutorials/my-tutorials/NAME.js; add NAME to "files" in tutorials/config.js). */
  function saveAsFile(j) {
    const id = String(j.id || 'tutorial').replace(/[^a-z0-9-]+/gi, '-').replace(/^my-/, ''), body = Object.assign({}, U.deep(j), { id });
    const code = `/* Tutorial "${String(j.title || id).replace(/\*\//g, '')}" — made in the tutorial maker. It runs when its name is in "files" of tutorials/config.js.
   Edit it here, or load it back: Settings › Project › Tutorial maker… › ⋯ › Copy a built-in tutorial. */
SB.tours.addJson(${JSON.stringify(body, null, 2)});
`;
    const a = h('a', { href: URL.createObjectURL(new Blob([code], { type: 'text/javascript' })), download: id + '.js' }); document.body.appendChild(a); a.click(); a.remove();
    SB.toast(`Saved ${id}.js: put it in tutorials/my-tutorials/ and add 'my-tutorials/${id}.js' to "files" in tutorials/config.js.`);
  }
  /** The gallery's order (S.tourOrder: ids); tutorials not in it keep their place after the ones that are. */
  function sortTours() { const cfg = window.SB_TUTORIALS || {}, o = (S.tourOrder && S.tourOrder.length ? S.tourOrder : cfg.order) || [], at = id => { const i = o.indexOf(id); return i < 0 ? 1e6 : i; }; const base = TS.list.slice(); TS.list.sort((a, b) => at(a.id) - at(b.id) || base.indexOf(a) - base.indexOf(b)); }
  setTimeout(register, 0); // after the settings load
  const loaded = SB.prefs && SB.prefs.load; if (loaded) SB.prefs.load = function (p) { const r = loaded.apply(this, arguments); register(); return r; };

  // ================= picking on screen: an element to point at, or points on the stage
  /** Hide the maker while you pick; fn gets what you picked (or null). */
  function pickEl(done) {
    const modal = document.getElementById('modal'), was = modal.hidden; modal.hidden = true;
    const box = h('div.tm-hover'), tip = h('div.tm-banner', null, 'Click what the step should point at. Esc cancels.'); document.body.append(box, tip);
    const end = v => { removeEventListener('pointermove', mv, true); removeEventListener('pointerdown', dn, true); removeEventListener('keydown', key, true); setTimeout(() => { removeEventListener('pointerup', stop, true); removeEventListener('click', stop, true); removeEventListener('contextmenu', stop, true); }, 250); box.remove(); tip.remove(); modal.hidden = was; done(v); }; // the click that picked must not press the button too
    const mv = e => { const el = e.target; if (!el || el === box || el === tip) return; const r = el.getBoundingClientRect(); Object.assign(box.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' }); box.dataset.sel = selectorOf(el) || ''; };
    const stop = e => { e.preventDefault(); e.stopPropagation(); };
    const dn = e => { stop(e); end(selectorOf(e.target)); };
    const key = e => { if (e.key === 'Escape') { stop(e); end(null); } };
    addEventListener('pointermove', mv, true); addEventListener('pointerdown', dn, true); addEventListener('pointerup', stop, true); addEventListener('click', stop, true); addEventListener('contextmenu', stop, true); addEventListener('keydown', key, true);
  }
  /** A CSS selector that finds el again (by id, then a label or title, then its place under an element with an id). */
  function selectorOf(el) {
    if (!el || el === document.body) return null; const esc = v => String(v).replace(/"/g, '\\"');
    const one = e => {
      if (e.id) return '#' + e.id; const tag = e.tagName.toLowerCase(), a = e.getAttribute('aria-label'), t = e.getAttribute('title'), cls = [...e.classList].filter(c => !/^(on|hover|active|sel|msel|picked|dragging)$/.test(c)).slice(0, 2).map(c => '.' + c).join('');
      return tag + cls + (a ? `[aria-label="${esc(a)}"]` : t ? `[title^="${esc(t.slice(0, 24))}"]` : '');
    };
    // climb to a clickable thing (a button, an input…) when a little icon inside it was clicked
    const target = el.closest('button, input, select, label, a, .th, .tl-head, .kf, .colorbtn, canvas') || el;
    const parts = []; let e = target;
    while (e && e !== document.body && parts.length < 4) { const p = one(e); parts.unshift(p); if (p[0] === '#') break; e = e.parentElement; }
    let sel = parts.join(' '); try { if (document.querySelector(sel) !== target) { const sib = [...target.parentElement.children].filter(x => x.tagName === target.tagName); sel = sel + `:nth-of-type(${sib.indexOf(target) + 1})`; if (document.querySelector(sel) !== target) sel = parts.join(' > '); } } catch (er) { /* keep it */ }
    return sel;
  }
  /** Click points on the stage (n of them); done gets [[x, y]…] in stage pixels (or null). */
  function pickPts(n, msg, done) {
    const modal = document.getElementById('modal'), was = modal.hidden; modal.hidden = true; const pts = [], tip = h('div.tm-banner', null, msg + ' Esc cancels.'); document.body.appendChild(tip);
    const end = v => { removeEventListener('pointerdown', dn, true); removeEventListener('keydown', key, true); tip.remove(); modal.hidden = was; done(v); };
    const dn = e => { if (!(e.target.closest && e.target.closest('#stageWrap'))) return; e.preventDefault(); e.stopPropagation(); const P = SB.view.toProj(e); pts.push([Math.round(P.x), Math.round(P.y)]); if (pts.length >= n) setTimeout(() => end(pts), 0); else tip.textContent = `Point ${pts.length + 1} of ${n}… Esc cancels.`; };
    const key = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); end(null); } };
    addEventListener('pointerdown', dn, true); addEventListener('keydown', key, true);
  }

  // ================= the editor
  const toolOpts = () => SB.tools.all().filter(t => !t.hidden).map(t => [t.id, t.label]);
  const actOpts = () => [['', 'None'], ...Object.values(SB.keys.ACT).map(a => [a.id, `${a.label} (${(SB.keys.binding(a.id) || []).join(', ') || '—'})`])];
  const MOUSE = [['', 'None'], ['left', 'Click'], ['right', 'Right-click'], ['double', 'Double-click'], ['drag', 'Drag'], ['scroll', 'Scroll']];
  const LEVELS = [['Easy', 'Easy'], ['Medium', 'Medium'], ['Harder', 'Harder']];
  let dlg = null, cur = null, open1 = 0;
  /** A copy of a built-in tutorial you can change: its texts, order and settings; its checks stay. */
  function copyBuiltin(d) {
    if (d.json) return Object.assign(U.deep(d.json), { id: 'my-' + U.uid(), title: (d.json.title || 'Tutorial') + ' (mine)', replaces: undefined, base: undefined });
    const T = { W: S.project.w, H: S.project.h, o: () => null, data: {}, near: () => [], timeAt: () => false, pressed: () => false };
    const txt = v => { if (typeof v !== 'function') return v; try { return v(T); } catch (e) { return ''; } };
    return { id: 'my-' + U.uid(), base: d.id, replaces: true, title: d.title + ' (mine)', blurb: d.blurb, desc: d.desc, level: d.level, minutes: d.minutes, learn: (d.learn || []).join('\n'), outro: d.outro,
      steps: d.steps.map((st, i) => ({ ref: `${d.id}#${i}`, say: txt(st.say) || '', rule: { type: st.task ? 'builtin' : 'next' }, tip: st.tip || undefined })) };
  }
  function open() {
    if (!dlg || !dlg.el.isConnected) dlg = SB.dialog.sheet([h('div')], { size: 'wide' });
    render();
  }
  function render() {
    const list = mine(); if (cur && !list.includes(cur)) cur = null; if (!cur) cur = list[0] || null;
    const left = h('div.tm-list', null,
      ...list.map(j => h('button.tm-item' + (j === cur ? '.on' : ''), { type: 'button', onclick: () => { cur = j; open1 = 0; render(); } }, j.title || 'My tutorial', h('small', null, `${(j.steps || []).length} steps`))),
      h('div.tm-newrow', null, W.btn('New', () => { const j = { id: 'my-' + U.uid(), title: 'My tutorial', level: 'Easy', minutes: 3, steps: [{ say: 'Hi! Let’s make something.', rule: { type: 'next' } }] }; list.push(j); cur = j; save(); render(); }, { cls: 'sm', icon: 'plus' }),
        W.select('', [['', 'Copy a built-in…'], ...TS.list.filter(d => !d.mine).map(d => [d.id, d.title])], v => { const d = TS.list.find(x => x.id === v); if (!d) return; const j = copyBuiltin(d); list.push(j); cur = j; save(); render(); }, 'Copy a built-in tutorial')),
      h('div.tm-newrow', null, W.btn('Import…', importFile, { cls: 'sm ghost', icon: 'import' }), W.btn('Export', exportFile, { cls: 'sm ghost', icon: 'export' })));
    dlg.el.replaceChildren(h('h2', null, 'Tutorial maker'), h('p.sub', null, 'Your own tutorials: what the guide says, what it points at, and when it goes on. Kept with your settings.'),
      h('div.tm', null, left, cur ? editor(cur) : h('p.hint', null, 'Make a new tutorial, or copy a built-in one to change it.')),
      h('div.sheet-actions', null, W.btn('Done', () => dlg.close(), { cls: 'primary' })));
  }
  const field = (label, el) => W.row(label, el);
  const text = (v, set, o = {}) => { const el = h(o.area ? 'textarea' : 'input', { type: 'text', value: v || '', rows: o.rows || 2, placeholder: o.ph || '' }); if (o.area) el.value = v || ''; el.oninput = () => { set(el.value); }; el.onchange = () => save(); return el; };
  function editor(j) {
    const steps = j.steps || (j.steps = []);
    const head = h('div.tm-head', null,
      field('Title', text(j.title, v => j.title = v)), field('On its card', text(j.blurb, v => j.blurb = v)), field('Description', text(j.desc, v => j.desc = v, { area: true })),
      field('You will learn', text(j.learn, v => j.learn = v, { area: true, rows: 3, ph: 'One thing per line' })),
      field('Level', W.select(j.level || 'Easy', LEVELS, v => { j.level = v; save(); }, 'Level')), field('Minutes', W.num(j.minutes || 3, { min: 1, max: 20, label: 'Minutes', change: v => { j.minutes = v; save(); } })),
      field('Start with', h('span.row', null, h('span.hint', null, j.scene ? `${j.scene.objects.length} layers saved` : j.base ? `the original’s start` : 'an empty screen'),
        W.btn('Use the screen I’m on', () => { j.scene = sceneNow(); save(); render(); SB.toast('The practice screen will start like this screen.'); }, { cls: 'sm ghost' }),
        j.scene ? W.btn('Clear', () => { delete j.scene; save(); render(); }, { cls: 'sm ghost' }) : null)),
      j.base ? field('', W.check(!!j.replaces, 'Show it instead of the built-in', v => { j.replaces = v; save(); })) : null,
      field('At the end', text(j.outro, v => j.outro = v, { ph: 'What the guide says when it is done' })),
      h('div.row.btns', null, W.btn('Try it', () => { save(); dlg.close(); TS.start(j.id); }, { cls: 'sm primary', icon: 'play' }),
        W.btn('Delete tutorial', async () => { const ok = await SB.dialog.ask('Delete this tutorial?', `“${j.title}” goes for good.`, [{ v: 'del', label: 'Delete', danger: true }]); if (ok !== 'del') return; mine().splice(mine().indexOf(j), 1); cur = null; save(); render(); }, { cls: 'sm ghost', icon: 'trash' })));
    const cards = steps.map((st, i) => stepCard(j, st, i));
    return h('div.tm-ed', null, head, h('h3', null, 'Steps'), ...cards, W.btn('Add a step', () => { steps.push({ say: '', rule: { type: 'next' } }); open1 = steps.length - 1; save(); render(); }, { cls: 'sm', icon: 'plus' }));
  }
  function stepCard(j, st, i) {
    const steps = j.steps, isOpen = open1 === i, R = RULES[(st.rule || {}).type] || RULES.next, b = builtinStep(st.ref);
    const summary = h('button.tm-step-h' + (isOpen ? '.on' : ''), { type: 'button', onclick: () => { open1 = isOpen ? -1 : i; render(); } }, h('b', null, `${i + 1}`), h('span', null, (st.say || '(no text)').slice(0, 70)), h('small', null, R.label));
    if (!isOpen) return h('div.tm-step', null, summary);
    const ruleRow = field('Goes on when', W.select((st.rule || {}).type || 'next', Object.entries(RULES).filter(([k]) => k !== 'builtin' || b).map(([k, v]) => [k, v.label]), v => { st.rule = { type: v }; save(); render(); }, 'When the step goes on'));
    const params = R.fields.map(([k, label, kind]) => {
      const r = st.rule, set = v => { r[k] = v; save(); };
      const el = kind === 'tool' ? W.select(r[k] || '', [['', 'Pick a tool'], ...toolOpts()], set, label) : kind === 'action' ? W.select(r[k] || '', actOpts(), set, label)
        : kind === 'layer' ? h('span.row', null, text(r[k], v => r[k] = v, { ph: 'Its name' }), W.select('', [['', 'Pick…'], ...tree.all().map(o => [o.name, o.name])], v => { if (v) { r[k] = v; save(); render(); } }, 'Pick a layer'))
        : kind === 'num' ? W.num(r[k] ?? (k === 'n' ? 1 : 0), { min: 0, max: 999, step: k === 't' || k === 's' ? 0.1 : 1, label, change: set })
        : kind === 'check' ? W.check(!!r[k], label, set) : kind === 'menupath' ? text(r[k], v => r[k] = v, { ph: 'e.g. Ease › Bounce (empty: just open it)' }) : text(r[k], v => r[k] = v, { area: true, ph: 'e.g. S.tool === "brush" && T.o("Ball").frames.length > 2' });
      return field(label, el);
    });
    const ghosts = st.ghost || [];
    const addG = (kind, n, msg) => pickPts(n, msg, pts => { if (!pts) return; const g = kind === 'dot' ? { dot: pts[0] } : kind === 'circle' ? { circle: [...pts[0], Math.round(Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]))] } : { [kind]: [...pts[0], ...pts[1]] }; (st.ghost = st.ghost || []).push(g); save(); render(); });
    const body = h('div.tm-step-b', null,
      field('The guide says', text(st.say, v => st.say = v, { area: true, rows: 2, ph: b ? 'As in the original' : 'Short and clear' })),
      ruleRow, ...params,
      field('Shortcut to teach', W.select(st.key || '', actOpts(), v => { st.key = v || undefined; save(); }, 'Shortcut')),
      field('Point at', h('span.row', null, text(st.show, v => st.show = v || undefined, { ph: b && b.show ? 'As in the original' : 'Nothing' }), W.btn('Pick on screen', () => pickEl(sel => { if (sel) { st.show = sel; save(); } render(); }), { cls: 'sm ghost', icon: 'target' }), st.show ? W.btn('', () => { delete st.show; save(); render(); }, { cls: 'sm ghost', icon: 'x', title: 'Point at nothing' }) : null)),
      field('Can click', h('span.row', null, W.check(st.stage ?? (b ? (b.allow || []).includes('stage') : false), 'The stage', v => { st.stage = v; save(); }), W.check(!!st.free, 'Everything (no dimming)', v => { st.free = v; save(); }))),
      field('Mouse picture', h('span.row', null, W.select(st.mouse || '', MOUSE, v => { st.mouse = v || undefined; save(); }, 'Mouse picture'), W.btn(st.at ? `at ${st.at.join(', ')}` : 'Place on stage', () => pickPts(1, 'Click where the mouse picture goes.', p => { if (p) { st.at = p[0]; save(); } render(); }), { cls: 'sm ghost' }), st.at ? W.btn('', () => { delete st.at; save(); render(); }, { cls: 'sm ghost', icon: 'x' }) : null)),
      field('Guides on stage', h('span.row.wrap', null, h('span.hint', null, ghosts.length ? `${ghosts.length}: ` + ghosts.map(g => Object.keys(g)[0]).join(', ') : 'None'),
        W.btn('Dot', () => addG('dot', 1, 'Click where the dot goes.'), { cls: 'sm ghost' }), W.btn('Circle', () => addG('circle', 2, 'Click the middle, then the edge.'), { cls: 'sm ghost' }),
        W.btn('Line', () => addG('line', 2, 'Click its two ends.'), { cls: 'sm ghost' }), W.btn('Arrow', () => addG('arrow', 2, 'Click where it starts, then where it points.'), { cls: 'sm ghost' }),
        ghosts.length ? W.btn('Clear', () => { st.ghost = []; save(); render(); }, { cls: 'sm ghost' }) : null)),
      field('Wait at least', h('span.row', null, W.num(st.minTime ?? 0, { min: 0, max: 60, step: 0.5, label: 'Seconds', change: v => { st.minTime = v || undefined; save(); } }), h('span.hint', null, 's before it goes on'))),
      field('Hint', text(st.hint, v => st.hint = v || undefined, { ph: 'Shown when it takes a while' })),
      field('', W.check(!!st.tip, 'A tips card (a lightbulb)', v => { st.tip = v || undefined; save(); })),
      h('div.row.btns', null,
        W.btn('', () => { if (i > 0) { [steps[i - 1], steps[i]] = [steps[i], steps[i - 1]]; open1 = i - 1; save(); render(); } }, { cls: 'sm ghost', icon: 'up', title: 'Move up' }),
        W.btn('', () => { if (i < steps.length - 1) { [steps[i + 1], steps[i]] = [steps[i], steps[i + 1]]; open1 = i + 1; save(); render(); } }, { cls: 'sm ghost', icon: 'down', title: 'Move down' }),
        W.btn('Duplicate', () => { steps.splice(i + 1, 0, U.deep(st)); open1 = i + 1; save(); render(); }, { cls: 'sm ghost', icon: 'copy' }),
        W.btn('Delete', () => { steps.splice(i, 1); open1 = -1; save(); render(); }, { cls: 'sm ghost', icon: 'trash' }),
        W.btn('Test from here', () => { save(); dlg.close(); TS.start(j.id, i); }, { cls: 'sm', icon: 'play' })));
    return h('div.tm-step.open', null, summary, body);
  }
  function exportFile() {
    const data = JSON.stringify({ app: 'storyboard-studio-tutorials', v: 1, tutorials: mine() }, null, 1), a = h('a', { href: URL.createObjectURL(new Blob([data], { type: 'application/json' })), download: 'my-tutorials.json' });
    document.body.appendChild(a); a.click(); a.remove();
  }
  function importFile() {
    const inp = h('input', { type: 'file', accept: '.json,application/json' });
    inp.onchange = async () => { const f = inp.files && inp.files[0]; if (!f) return; try { const d = JSON.parse(await f.text()); const list = (d && d.tutorials) || []; for (const j of list) { const k = mine().findIndex(x => x.id === j.id); if (k >= 0) mine()[k] = j; else mine().push(j); } save(); render(); SB.toast(`${list.length} tutorial${list.length === 1 ? '' : 's'} added.`); } catch (e) { SB.toast('That file is not a tutorials file.'); } };
    inp.click();
  }
  TS.maker = { sceneNow, saveAsFile, menuPathOf, splitPath, open, RULES, register, selectorOf, defOf, mine, save, pickEl, pickPts, copyBuiltin, exportFile, importFile, builtinStep };
})(window.SB);
