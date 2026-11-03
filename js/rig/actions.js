/* Actions: an animation library for a rig, in one screen (like Blender's actions or Unity's clips).
   A rig can hold several actions (walk, run, jump…): each one is its own set of keyframes and its own
   length for the rig and everything that moves with it (layers bending with it or riding on it,
   controllers driving it, and what is inside those). Other layers of the screen keep their animation.
   rig.actions = { cur, list: [{ id, name, dur, tracks?: { layerKey: tracks } }] }
     The current action lives in the layers themselves (o.tracks) and has no `tracks`; the others keep
     theirs in the list, by layer key (o.link || o.id, so copies made from templates and saved objects match).
   Exports: Unity and Godot make one animation per action (next to one per screen, so both ways work),
   Blender one FBX per action. SB.actions.during() puts an action on for a moment while exporting. */
'use strict';
(function (SB) {
  const U = SB.util, S = SB.state, tree = SB.tree, h = U.h, W = SB.w;
  const keyOf = o => o.link || o.id;

  /** The layers whose keyframes belong to the rig's actions. */
  function members(rig) {
    const set = SB.rigLib ? SB.rigLib.rigSet(rig) : new Set([rig]), out = [];
    set.forEach(o => tree.all([o]).forEach(x => { if (!out.includes(x)) out.push(x); }));
    return out;
  }
  /** Make the screen as long as the action, and the rig's clips at least that long. */
  function setLen(rig, d) {
    S.project.duration = d; S.project.fixedLen = true;
    members(rig).forEach(m => { if (!m.parts && m.type !== 'video' && m.type !== 'audio' && (m.start || 0) + m.dur < d) m.dur = U.r3(d - (m.start || 0)); });
  }

  const A = SB.actions = {
    members,
    of: rig => rig && rig.actions && rig.actions.list && rig.actions.list.length ? rig.actions : null,
    current: rig => { const a = A.of(rig); return a ? a.list.find(x => x.id === a.cur) || a.list[0] : null; },
    /** The rig whose actions the timeline and the bar show: the selected one (or the rig of a selected layer), else the first with actions. */
    rigInView() {
      const rigs = SB.rig ? SB.rig.rigs() : []; if (!rigs.length) return null;
      const sel = tree.selected(); for (const o of sel) { if (o.type === 'rig') return o; const r = rigs.find(rg => members(rg).includes(o)); if (r) return r; }
      return rigs.find(r => A.of(r)) || (rigs.length === 1 ? rigs[0] : null);
    },
    /** Start an action list: what the rig does now becomes the first action. */
    start(rig, name) { if (A.of(rig)) return A.current(rig); const act = { id: 'ac' + U.uid(), name: name || 'Action 1', dur: S.project.duration }; rig.actions = { cur: act.id, list: [act] }; return act; },
    /** Keep the live keyframes in the current action (before switching away from it). */
    store(rig) { const a = A.current(rig); if (!a) return; a.tracks = {}; members(rig).forEach(m => { if (m.tracks && Object.keys(m.tracks).length) a.tracks[keyOf(m)] = U.deep(m.tracks); }); a.dur = S.project.duration; },
    load(rig, act) { members(rig).forEach(m => { m.tracks = U.deep((act.tracks || {})[keyOf(m)] || {}); }); },
    /** Show and edit another action. */
    switchTo(rig, id, quiet) {
      const a = A.of(rig); if (!a) return; const next = a.list.find(x => x.id === id); if (!next || a.cur === id) return;
      SB.tracks.dropPending && SB.tracks.dropPending(); A.store(rig); a.cur = id; A.load(rig, next); delete next.tracks; setLen(rig, next.dur);
      S.selKeys.clear(); tree.reindex(); SB.time.set(0); SB.commit(); SB.invalidate();
      if (!quiet) SB.toast(`${rig.name}: ${next.name} (${U.r2(next.dur)}s). Its keyframes are in the timeline now.`);
    },
    /** A new action: empty (the rig at rest) or a copy of the current one. */
    add(rig, mode = 'empty', name) {
      if (!A.of(rig)) A.start(rig, 'Action 1'); const a = rig.actions, cur = A.current(rig);
      A.store(rig); const act = { id: 'ac' + U.uid(), name: name || `Action ${a.list.length + 1}`, dur: cur ? cur.dur : S.project.duration, tracks: mode === 'copy' ? U.deep(cur.tracks || {}) : {} };
      a.list.push(act); A.switchTo(rig, act.id, true); SB.toast(`${act.name} added to ${rig.name}${mode === 'copy' ? ' as a copy of ' + cur.name : ''}. Animate it here; switch actions in the timeline bar or the panel.`);
      return act;
    },
    rename(rig, id, name) { const act = (A.of(rig) || { list: [] }).list.find(x => x.id === id); if (!act || !name) return; act.name = name.trim() || act.name; SB.commit(); },
    duplicate(rig, id) { const a = A.of(rig); if (!a) return; if (a.cur !== id) A.switchTo(rig, id, true); return A.add(rig, 'copy', A.current(rig).name + ' copy'); },
    remove(rig, id) {
      const a = A.of(rig); if (!a) return; const i = a.list.findIndex(x => x.id === id); if (i < 0) return;
      if (a.list.length === 1) { delete rig.actions; SB.commit(); return SB.toast('That was the only action: the rig keeps its animation as it is.'); }
      if (a.cur === id) A.switchTo(rig, a.list[i ? i - 1 : 1].id, true);
      a.list.splice(a.list.findIndex(x => x.id === id), 1); SB.commit();
    },
    /** Every action to export from a screen's layers: [{ rigId, act, dur, current }] (empty when no rig has actions). */
    variants(objects, proj) {
      const out = []; tree.all(objects || []).forEach(o => { if (o.type !== 'rig' || !A.of(o)) return; o.actions.list.forEach(act => out.push({ rigId: o.id, act, current: act.id === o.actions.cur, dur: act.id === o.actions.cur ? proj.duration : act.dur })); });
      return out;
    },
    /** Run fn with an action of a rig on (in the screen you are on), then put everything back. */
    async during(rigId, actId, fn) {
      const rig = rigId && tree.find(rigId), a = A.of(rig); if (!a || a.cur === actId) return fn();
      const act = a.list.find(x => x.id === actId); if (!act) return fn();
      const ms = members(rig), keep = ms.map(m => [m, m.tracks, m.dur]), dur0 = S.project.duration, fixed = S.project.fixedLen;
      ms.forEach(m => { m.tracks = U.deep((act.tracks || {})[keyOf(m)] || {}); }); setLen(rig, act.dur); SB.bump();
      try { return await fn(); } finally { keep.forEach(([m, t, d]) => { m.tracks = t; m.dur = d; }); S.project.duration = dur0; S.project.fixedLen = fixed; SB.bump(); }
    },
    /** A menu of the rig's actions: switch, add, rename, duplicate, delete. */
    menuItems(rig) {
      const a = A.of(rig), cur = A.current(rig), ask = (t, v) => SB.dialog.prompt(t, 'A short name, like Walk, Run or Jump.', v);
      return [{ head: `${rig.name}: actions` }, ...(a ? a.list.map(x => ({ label: (x.id === a.cur ? '✓ ' : '') + `${x.name}  ·  ${U.r2(x.id === a.cur ? S.project.duration : x.dur)}s`, run: () => A.switchTo(rig, x.id) })) : [{ label: 'No actions yet', disabled: true }]),
        '-', { label: 'New empty action…', icon: 'plus', run: async () => { const n = await ask('New action', ''); if (n !== null) A.add(rig, 'empty', n || undefined); } },
        cur && { label: `New action from ${cur.name}…`, icon: 'copy', run: async () => { const n = await ask('New action', cur.name + ' 2'); if (n !== null) A.add(rig, 'copy', n || undefined); } },
        cur && { label: `Rename ${cur.name}…`, icon: 'edit', run: async () => { const n = await ask('Rename action', cur.name); if (n) A.rename(rig, cur.id, n); } },
        cur && { label: `Delete ${cur.name}`, icon: 'trash', run: () => A.remove(rig, cur.id) }];
    },
  };

  // ---------- the panel: a list of the rig's actions
  function section(o) {
    if (o.type !== 'rig') return null; const a = A.of(o), FL = SB.fields;
    const rows = a ? a.list.map(x => { const on = x.id === a.cur;
      return h('div.act-row' + (on ? '.on' : ''), null,
        h('button.act-name', { type: 'button', title: on ? 'The action you are editing' : 'Edit this action', onclick: () => A.switchTo(o, x.id) }, h('span.act-dot'), h('span', null, x.name), h('small', null, `${U.r2(on ? S.project.duration : x.dur)}s`)),
        W.iconBtn('edit', 'Rename', async () => { const n = await SB.dialog.prompt('Rename action', '', x.name); if (n) A.rename(o, x.id, n); }, 'sm'),
        W.iconBtn('copy', 'Duplicate', () => A.duplicate(o, x.id), 'sm'), W.iconBtn('trash', 'Delete', () => A.remove(o, x.id), 'sm')); }) : [];
    const body = [
      a ? h('div.act-list', null, rows) : null,
      h('div.row.btns', null, W.btn(a ? 'New action' : 'Make actions', async () => { const n = await SB.dialog.prompt(a ? 'New action' : 'Name the first new action', a ? 'An empty action: the rig starts at rest.' : `What ${o.name} does now stays as "Action 1"; the new one starts at rest.`, ''); if (n !== null) A.add(o, 'empty', n || undefined); }, { cls: 'sm primary', icon: 'plus' }),
        a ? W.btn('From this one', async () => { const c = A.current(o), n = await SB.dialog.prompt('New action', 'Starts as a copy of ' + c.name + '.', c.name + ' 2'); if (n !== null) A.add(o, 'copy', n || undefined); }, { cls: 'sm', icon: 'copy' }) : null),
      W.info(a ? 'Each action has its own keyframes and length for this rig and everything that moves with it. The screen shows the action you pick. Unity and Godot get one animation per action (and per screen), Blender one file per action.' : 'Actions keep several animations of this rig in one screen: walk, run, jump… Each exports as its own animation to Unity, Godot and Blender. Screens still work as before.')];
    return FL.section('Actions', body.filter(Boolean), { key: 'actions', badge: a ? h('span.badge', null, String(a.list.length)) : null });
  }
  if (SB.inspector) SB.inspector.top.push(section);

  // ---------- the timeline: the action's name on the rig's clip (click it to switch)
  SB.timeline.extraBadges.push(o => { const c = o.type === 'rig' && A.current(o); if (!c) return ''; const st = o.aseq && o.aseq.length && !o.aseqOff ? o.aseq.map(x => (o.actions.list.find(a => a.id === x.act) || {}).name || '?').join(' → ') : null; return `<span class="cl-badge act" data-act="action" title="${st ? 'Action strips play: ' + U.esc(st) + '. Click to pick the action to edit' : 'Action: click to switch, add or rename'}">▶ ${U.esc(st || c.name)}</span>`; });
  SB.timeline.acts = SB.timeline.acts || {}; SB.timeline.acts.action = (o, b) => { const r = b.getBoundingClientRect(); SB.menu.open(r.left, r.bottom + 4, A.menuItems(o)); };
})(window.SB);
