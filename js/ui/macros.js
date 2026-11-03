/* My actions: record a few things you do, give them a name and a shortcut, and play them again with one key.
   What is recorded: shortcut actions you press (Duplicate, Flip, Group, Add keyframe, a tool…) and items you choose in a
   layer's right-click menu (Effects › Glow, Flip › Flip horizontally…). Playing runs them in order on what is selected then.
   S.macros = [{ id, name, steps: [{ a: actionId } | { m: ['Menu', 'Item'] }] }]; each is a shortcut action 'm:<id>'
   (Settings › Shortcuts › My actions), so its key is set and changed like any other shortcut. */
'use strict';
(function (SB) {
  const U = SB.util, S = SB.state, h = U.h, W = SB.w;
  let rec = null, bar = null;
  const K = () => SB.keys;
  const GROUP = 'My actions';
  /** The words of a menu item and of the items it sits under (open menus mark the item whose submenu shows). */
  const text = b => ((b.querySelector('.mi') || b).textContent || '').trim().replace(/^✓\s*/, '');
  function pathOf(btn) { const ms = [...document.querySelectorAll('.menu:not([hidden])')], k = ms.indexOf(btn.closest('.menu')), out = []; for (let l = 0; l < k; l++) { const o = ms[l].querySelector('.sub-open'); if (o) out.push(text(o)); } out.push(text(btn)); return out; }
  const stepName = st => st.a ? (K().ACT[st.a] ? K().ACT[st.a].label : st.a) : st.m.join(' › ');
  /** Something was done: keep it while recording. */
  function note(st) { if (!rec) return; rec.steps.push(st); show(); }
  function show() {
    if (!rec) { if (bar) { bar.remove(); bar = null; } return; }
    if (!bar) { bar = h('div.macro-rec', { role: 'status' }); document.body.appendChild(bar); }
    bar.replaceChildren(h('span.ts-dot'), h('b', null, 'Recording an action'), h('span', null, rec.steps.length ? ` ${rec.steps.length}: ${rec.steps.slice(-3).map(stepName).join(', ')}` : ' Press shortcuts or choose items in a layer’s right-click menu.'),
      W.btn('Stop', stop, { cls: 'sm primary' }), W.btn('Cancel', () => { rec = null; show(); }, { cls: 'sm ghost' }));
  }
  function start() { rec = { steps: [] }; show(); SB.toast('Recording: do the steps, then press Stop.'); }
  function stop() {
    const r = rec; rec = null; show(); if (!r || !r.steps.length) return SB.toast('Nothing was recorded.');
    edit({ id: U.uid(), name: `My action ${(S.macros || []).length + 1}`, steps: r.steps }, true);
  }
  /** Name it, see its steps (take some out), give it a shortcut. */
  function edit(m, fresh) {
    const name = h('input', { type: 'text', value: m.name, 'aria-label': 'Name' }); let key = fresh ? null : (K().binding('m:' + m.id) || [])[0] || null;
    const cap = h('button.keycap', { type: 'button', 'aria-label': 'Shortcut' }); const showKey = () => { cap.textContent = key ? K().pretty(key) : 'None: click, then press keys'; }; showKey();
    cap.onclick = () => { cap.textContent = 'Press keys…'; K().capture = e => { e.preventDefault(); e.stopPropagation(); if (e.key === 'Escape') { K().capture = null; return showKey(); } const c = K().comboOf(e); if (c === null) return; K().capture = null; key = c || null; showKey(); }; };
    const list = h('ol.macro-steps'); const fill = () => list.replaceChildren(...m.steps.map((st, i) => h('li', null, h('span', null, stepName(st)), W.iconBtn('x', 'Take out this step', () => { m.steps.splice(i, 1); fill(); }, 'sm'))));
    fill();
    const dlg = SB.dialog.sheet([h('h2', null, fresh ? 'Save your action' : 'Edit your action'), W.row('Name', name), W.row('Shortcut', cap), h('div.sub', null, 'Steps, in order:'), list,
      h('div.sheet-actions', null, W.btn('Cancel', () => dlg.close(), { cls: 'ghost' }), W.btn('Save', () => {
        if (!m.steps.length) return SB.toast('An action needs at least one step.'); m.name = name.value.trim() || m.name; S.macros = (S.macros || []).filter(x => x.id !== m.id).concat(m);
        register(); if (key) { const clash = K().set('m:' + m.id, key); if (clash.length) SB.toast(`${K().pretty(key)} was used by ${clash.join(', ')}; it plays ${m.name} now.`); } else if (!fresh) K().set('m:' + m.id, '');
        SB.prefs.save(); dlg.close(); SB.toast(`${m.name} saved${key ? `: press ${K().pretty(key)} to play it` : ''}. Find it in Settings › Shortcuts.`);
      }, { cls: 'primary' }))]);
  }
  /** Find a menu item by its words (and the items it sits under) in a list of menu items. */
  function find(items, path) {
    let list = items; for (let i = 0; i < path.length; i++) { const it = (list || []).find(x => x && typeof x === 'object' && x.label && x.label.replace(/^✓\s*/, '') === path[i]); if (!it) return null; if (i === path.length - 1) return it; list = it.sub; }
    return null;
  }
  /** Play an action: each step in turn, on what is selected. */
  function play(m) {
    if (rec) return; let missed = 0;
    for (const st of m.steps) {
      if (st.a) { const A = K().ACT[st.a]; if (A && A.run && !st.a.startsWith('m:')) A.run(); else missed++; continue; }
      const o = SB.tree.sel(), it = o && SB.menus && SB.menus.layerItems ? find(SB.menus.layerItems(o), st.m) : null;
      if (it && it.run && !it.disabled) it.run(); else missed++;
    }
    if (missed) SB.toast(`${m.name}: ${missed} step${missed > 1 ? 's' : ''} could not run here (select a layer first?).`);
  }
  function remove(m) { S.macros = (S.macros || []).filter(x => x !== m); delete S.keymap['m:' + m.id]; register(); SB.prefs.save(); }
  /** My actions become shortcut actions (a group of their own). */
  function register() {
    const k = K(); if (!k) return; for (const id of Object.keys(k.ACT)) if (id.startsWith('m:')) delete k.ACT[id];
    const gi = k.ACTIONS.findIndex(g => g[0] === GROUP); if (gi >= 0) k.ACTIONS.splice(gi, 1);
    const list = (S.macros || []).map(m => ['m:' + m.id, m.name, [], () => play(m)]); if (!list.length) return;
    k.ACTIONS.push([GROUP, list]); list.forEach(([id, label, def, run]) => k.ACT[id] = { id, label, def, run });
  }
  setTimeout(register, 0); // after the settings load
  SB.macros = { get rec() { return rec; }, start, stop, note, play, edit, remove, register, pathOf, stepName };
})(window.SB);
