/* Actions: an animation library in one screen (like Blender's actions or Unity's clips).
   A screen can hold several actions (idle, walk, jump, a sad and a happy version…): each one is its own set of
   keyframes, clip times and length for every layer of the screen (rigs, groups, shapes, particles, controllers…).
   S.project.actions = { cur, list: [{ id, name, dur, tracks?: { layerKey: tracks }, clips?: { layerKey: [start, dur] } }] }
   Older projects may have actions on a rig instead (rig.actions, the same shape without clips): those keep working for
   the rig and everything that moves with it, and the screen's actions leave those layers to them (A.toScreen moves them over).
   The current action lives in the layers themselves (o.tracks) and has no `tracks`; the others keep theirs in the list,
   by layer key (o.link || o.id, so copies made from templates and saved objects match).
   An owner is the screen (S.project, id '@screen') or a rig. Exports: Unity and Godot make one animation per action
   (next to one per screen, so both ways work), Blender one FBX per action. SB.actions.during() puts an action on for a
   moment while exporting. */
'use strict';
(function (SB) {
  const U = SB.util, S = SB.state, tree = SB.tree, h = U.h, W = SB.w;
  const keyOf = o => o.link || o.id, SCR = '@screen';
  const isScr = ow => ow === S.project || ow === SCR;
  const has = ow => !!(ow && ow.actions && ow.actions.list && ow.actions.list.length);
  const fixedType = m => m.parts || m.type === 'video' || m.type === 'audio';

  /** The layers of a rig: the rig, what moves with it, and what is inside those. */
  function rigMembers(rig) {
    const set = SB.rigLib ? SB.rigLib.rigSet(rig) : new Set([rig]), out = [];
    set.forEach(o => tree.all([o]).forEach(x => { if (!out.includes(x)) out.push(x); }));
    return out;
  }
  /** The layers whose keyframes belong to the owner's actions (the screen: all but those of rigs with their own). */
  function members(ow) {
    if (!isScr(ow)) return rigMembers(ow);
    const own = new Set(); (SB.rig ? SB.rig.rigs() : []).forEach(r => { if (has(r)) rigMembers(r).forEach(x => own.add(x)); });
    return tree.all().filter(o => !own.has(o));
  }
  /** Make the screen as long as the action. A rig's clips grow to that length; on the screen, the layers that
      reached the end of the screen keep reaching it (the others keep their clip times). */
  function setLen(ow, d) {
    const d0 = S.project.duration; S.project.duration = d; S.project.fixedLen = true;
    if (!isScr(ow)) return members(ow).forEach(m => { if (!fixedType(m) && (m.start || 0) + m.dur < d) m.dur = U.r3(d - (m.start || 0)); });
    S.objects.forEach(m => { const end = (m.start || 0) + m.dur; if (!fixedType(m) && end < d && end >= d0 - 1e-3) m.dur = U.r3(d - (m.start || 0)); });
  }

  const A = SB.actions = {
    SCR, members, isScr,
    of: ow => { ow = A.owner(ow); return has(ow) ? ow.actions : null; },
    current: ow => { const a = A.of(ow); return a ? a.list.find(x => x.id === a.cur) || a.list[0] : null; },
    /** The owner for an id: '@screen' (or nothing) is the screen you are on, else a rig. */
    owner: id => id === SCR || id == null ? S.project : typeof id === 'string' ? tree.find(id) : id,
    idOf: ow => isScr(ow) ? SCR : ow.id,
    nameOf: ow => isScr(ow) ? (SB.screens && SB.screens.many() ? SB.screens.active().name : 'The screen') : ow.name,
    /** A rig that keeps its own (older) actions and is selected, or holds a selected layer: its actions show instead of the screen's. */
    rigInView() {
      const rigs = SB.rig ? SB.rig.rigs().filter(has) : []; if (!rigs.length) return null;
      for (const o of tree.selected()) { if (rigs.includes(o)) return o; const r = rigs.find(rg => rigMembers(rg).includes(o)); if (r) return r; }
      return null;
    },
    /** The owner the timeline bar and the menus show: such a rig, else the screen. */
    inView: () => A.rigInView() || S.project,
    /** Start an action list: what the screen (or rig) does now becomes the first action. */
    start(ow, name) { ow = A.owner(ow); if (A.of(ow)) return A.current(ow); const act = { id: 'ac' + U.uid(), name: name || 'Action 1', dur: S.project.duration }; ow.actions = { cur: act.id, list: [act] }; return act; },
    /** Keep the live keyframes (and, for the screen, clip times) in the current action (before switching away from it). */
    store(ow) {
      ow = A.owner(ow); const a = A.current(ow); if (!a) return; a.tracks = {}; const scr = isScr(ow); if (scr) a.clips = {};
      members(ow).forEach(m => { const k = keyOf(m); if (m.tracks && Object.keys(m.tracks).length) a.tracks[k] = U.deep(m.tracks); if (scr) a.clips[k] = [m.start || 0, m.dur]; });
      a.dur = S.project.duration;
    },
    load(ow, act) {
      ow = A.owner(ow); const scr = isScr(ow);
      members(ow).forEach(m => { const k = keyOf(m); m.tracks = U.deep((act.tracks || {})[k] || {}); const c = scr && act.clips && act.clips[k]; if (c) { m.start = c[0]; m.dur = c[1]; } });
    },
    /** Show and edit another action. */
    switchTo(ow, id, quiet) {
      ow = A.owner(ow); const a = A.of(ow); if (!a) return; const next = a.list.find(x => x.id === id); if (!next || a.cur === id) return;
      SB.tracks.dropPending && SB.tracks.dropPending(); A.store(ow); a.cur = id; A.load(ow, next); delete next.tracks; delete next.clips; setLen(ow, next.dur);
      S.selKeys.clear(); tree.reindex(); SB.time.set(0); SB.commit(); SB.invalidate();
      if (!quiet) SB.toast(`${A.nameOf(ow)}: ${next.name} (${U.r2(next.dur)}s). Its keyframes are in the timeline now.`);
    },
    /** Keyframes that hold the pose at the start of the current action (a new action of the screen starts from it). */
    poseAtStart(ow) {
      const out = {}; members(ow).forEach(m => { const tr = {}; for (const id in m.tracks || {}) { const t = m.tracks[id]; if (!t || !t.length) continue; const v = SB.tracks.evalTrack(m, id, t, 0), k0 = t[0];
        tr[id] = [{ t: 0, v: typeof v === 'object' ? U.deep(v) : v, e: k0.e === 'hold' ? 'hold' : 'smooth' }]; } if (Object.keys(tr).length) out[keyOf(m)] = tr; });
      return out;
    },
    /** A new action: empty (the screen holds the first pose of the current action; a rig stands at rest) or a copy of the current one. */
    add(ow, mode = 'empty', name) {
      ow = A.owner(ow); if (!A.of(ow)) A.start(ow, 'Action 1'); const a = ow.actions, cur = A.current(ow), scr = isScr(ow);
      A.store(ow); const act = { id: 'ac' + U.uid(), name: name || `Action ${a.list.length + 1}`, dur: cur ? cur.dur : S.project.duration,
        tracks: mode === 'copy' ? U.deep(cur.tracks || {}) : scr ? A.poseAtStart(ow) : {} };
      if (scr && cur && cur.clips) act.clips = U.deep(cur.clips);
      a.list.push(act); A.switchTo(ow, act.id, true);
      SB.toast(`${act.name} added to ${A.nameOf(ow)}${mode === 'copy' ? ' as a copy of ' + cur.name : scr ? ', starting from the first pose of ' + cur.name : ''}. Animate it here; switch actions in the timeline bar or the panel.`);
      return act;
    },
    rename(ow, id, name) { const act = (A.of(ow) || { list: [] }).list.find(x => x.id === id); if (!act || !name) return; act.name = name.trim() || act.name; SB.commit(); },
    duplicate(ow, id) { ow = A.owner(ow); const a = A.of(ow); if (!a) return; if (a.cur !== id) A.switchTo(ow, id, true); return A.add(ow, 'copy', A.current(ow).name + ' copy'); },
    remove(ow, id) {
      ow = A.owner(ow); const a = A.of(ow); if (!a) return; const i = a.list.findIndex(x => x.id === id); if (i < 0) return;
      if (a.list.length === 1) { delete ow.actions; SB.commit(); return SB.toast(`That was the only action: ${A.nameOf(ow)} keeps its animation as it is.`); }
      if (a.cur === id) A.switchTo(ow, a.list[i ? i - 1 : 1].id, true);
      a.list.splice(a.list.findIndex(x => x.id === id), 1); SB.commit();
    },
    move(ow, id, d) { const a = A.of(ow); if (!a) return; const i = a.list.findIndex(x => x.id === id), j = i + d; if (i < 0 || j < 0 || j >= a.list.length) return; const [x] = a.list.splice(i, 1); a.list.splice(j, 0, x); SB.commit(); },
    /** Move a rig's own (older) actions to the screen: each becomes a screen action (the other layers as they are now). */
    toScreen(rig) {
      if (!has(rig)) return; SB.tracks.dropPending && SB.tracks.dropPending();
      const P = S.project, ms = rigMembers(rig), had = has(P), strips = !!(rig.aseq && rig.aseq.length);
      if (had) A.store(P); A.store(rig); const ra = rig.actions, rcur = A.current(rig);
      const now = {}, clips = {}; members(P).forEach(m => { const k = keyOf(m); if (m.tracks && Object.keys(m.tracks).length) now[k] = U.deep(m.tracks); clips[k] = [m.start || 0, m.dur]; });
      ms.forEach(m => { clips[keyOf(m)] = [m.start || 0, m.dur]; });
      const withRig = (base, rt) => { const t = U.deep(base); ms.forEach(m => { const k = keyOf(m); delete t[k]; if (rt && rt[k]) t[k] = U.deep(rt[k]); }); return t; };
      if (had) P.actions.list.forEach(x => { if (x.id !== P.actions.cur) x.tracks = withRig(x.tracks || {}, rcur.tracks); else delete x.tracks; });
      else P.actions = { cur: null, list: [] };
      const taken = new Set(P.actions.list.map(x => x.name)); ra.list.forEach(r => { if (had && r === rcur) return; const x = { id: 'ac' + U.uid(), name: taken.has(r.name) ? `${rig.name} ${r.name}` : r.name, dur: r === rcur ? P.duration : r.dur, tracks: withRig(now, r.tracks), clips: U.deep(clips) };
        if (r === rcur) { delete x.tracks; delete x.clips; P.actions.cur = x.id; } P.actions.list.push(x); });
      if (!P.actions.cur) P.actions.cur = P.actions.list[0].id;
      delete rig.actions; delete rig.aseq; delete rig.aseqOff; tree.reindex(); SB.commit(); SB.invalidate();
      SB.toast(`${rig.name}'s ${ra.list.length} actions are now the screen's actions: each one keeps the keyframes of every layer.${strips ? ' Its action strips were removed.' : ''}`);
    },
    /** Every action to export from a screen's layers: [{ rigId, act, dur, current }] (rigId '@screen' for the screen's own; empty when there are none). */
    variants(objects, proj) {
      const out = [];
      if (has(proj)) proj.actions.list.forEach(act => out.push({ rigId: SCR, act, current: act.id === proj.actions.cur, dur: act.id === proj.actions.cur ? proj.duration : act.dur }));
      tree.all(objects || []).forEach(o => { if (o.type !== 'rig' || !has(o)) return; o.actions.list.forEach(act => out.push({ rigId: o.id, act, current: act.id === o.actions.cur, dur: act.id === o.actions.cur ? proj.duration : act.dur })); });
      return out;
    },
    /** Layers whose clips grow when an action of owner ow is played for d seconds (the interactive player). */
    growing(ow, d) { const d0 = S.project.duration; return isScr(ow) ? S.objects.filter(m => { const e = (m.start || 0) + m.dur; return !fixedType(m) && e < d && e >= d0 - 1e-3; }) : members(ow).filter(m => !fixedType(m) && (m.start || 0) + m.dur < d); },
    /** Run fn with an action on (of the screen you are on, or of one of its rigs), then put everything back. */
    async during(ownerId, actId, fn) {
      const ow = A.owner(ownerId), a = A.of(ow); if (!a || a.cur === actId) return fn();
      const act = a.list.find(x => x.id === actId); if (!act) return fn();
      const scr = isScr(ow), ms = scr ? tree.all() : members(ow), keep = ms.map(m => [m, m.tracks, m.start, m.dur]), dur0 = S.project.duration, fixed = S.project.fixedLen;
      A.load(ow, act); setLen(ow, act.dur); SB.bump();
      try { return await fn(); } finally { keep.forEach(([m, t, st, d]) => { m.tracks = t; m.start = st; m.dur = d; }); S.project.duration = dur0; S.project.fixedLen = fixed; SB.bump(); }
    },
    /** A menu of the actions: switch, add, rename, duplicate, delete. */
    menuItems(ow) {
      ow = A.owner(ow); const a = A.of(ow), cur = A.current(ow), scr = isScr(ow), ask = (t, v) => SB.dialog.prompt(t, 'A short name, like Idle, Walk or Jump.', v);
      return [{ head: `${A.nameOf(ow)}: actions` }, ...(a ? a.list.map(x => ({ label: (x.id === a.cur ? '✓ ' : '') + `${x.name}  ·  ${U.r2(x.id === a.cur ? S.project.duration : x.dur)}s`, run: () => A.switchTo(ow, x.id) })) : [{ label: 'No actions yet', disabled: true }]),
        '-', { label: a ? (scr ? 'New action (from the first pose)…' : 'New empty action…') : 'Make actions…', icon: 'plus', run: async () => { const n = await ask(a ? 'New action' : 'Name the new action', ''); if (n !== null) A.add(ow, 'empty', n || undefined); } },
        cur && { label: `New action from ${cur.name}…`, icon: 'copy', run: async () => { const n = await ask('New action', cur.name + ' 2'); if (n !== null) A.add(ow, 'copy', n || undefined); } },
        cur && { label: `Rename ${cur.name}…`, icon: 'edit', run: async () => { const n = await ask('Rename action', cur.name); if (n) A.rename(ow, cur.id, n); } },
        cur && { label: `Delete ${cur.name}`, icon: 'trash', run: () => A.remove(ow, cur.id) },
        !scr && a && '-', !scr && a && { label: 'Move these to the screen’s actions', icon: 'screen', run: () => A.toScreen(ow) }].filter(Boolean);
    },
  };

  /** The list of an owner's actions, with buttons (the screen panel, and a rig's for its older actions). */
  function list(ow, info) {
    const a = A.of(ow), scr = isScr(ow);
    const rows = a ? a.list.map((x, i) => { const on = x.id === a.cur;
      return h('div.act-row' + (on ? '.on' : ''), null,
        h('button.act-name', { type: 'button', title: on ? 'The action you are editing' : 'Edit this action', onclick: () => A.switchTo(ow, x.id) }, h('span.act-dot'), h('span', null, x.name), h('small', null, `${U.r2(on ? S.project.duration : x.dur)}s`)),
        scr && a.list.length > 1 ? (i ? W.iconBtn('up', 'Move up', () => A.move(ow, x.id, -1), 'sm') : h('span.act-gap')) : null,
        W.iconBtn('edit', 'Rename', async () => { const n = await SB.dialog.prompt('Rename action', '', x.name); if (n) A.rename(ow, x.id, n); }, 'sm'),
        W.iconBtn('copy', 'Duplicate', () => A.duplicate(ow, x.id), 'sm'), W.iconBtn('trash', 'Delete', () => A.remove(ow, x.id), 'sm')); }) : [];
    return [a ? h('div.act-list', null, rows) : null,
      h('div.row.btns', null, W.btn(a ? 'New action' : 'Make actions', async () => { const n = await SB.dialog.prompt(a ? 'New action' : 'Name the first new action', a ? (scr ? `Starts from the first pose of ${A.current(ow).name}.` : 'An empty action: the rig starts at rest.') : `What ${scr ? 'the screen' : ow.name} does now stays as "Action 1".`, ''); if (n !== null) A.add(ow, 'empty', n || undefined); }, { cls: 'sm primary', icon: 'plus' }),
        a ? W.btn('From this one', async () => { const c = A.current(ow), n = await SB.dialog.prompt('New action', 'Starts as a copy of ' + c.name + '.', c.name + ' 2'); if (n !== null) A.add(ow, 'copy', n || undefined); }, { cls: 'sm', icon: 'copy' }) : null, info || null)];
  }
  A.list = list;

  // ---------- the screen panel (nothing selected): the screen's actions
  const I = SB.inspector; if (I) (I.project || (I.project = [])).push(() => {
    const P = S.project, a = A.of(P), FL = SB.fields;
    return FL.section('Actions', list(P, W.info(a ? ['Each action has its own keyframes, clip times and length for every layer of this screen: rigs, groups, shapes, particles, controllers. The stage and the timeline show the one you pick.', 'Unity and Godot get one animation per action, Blender one file per action. Layers you add are in every action; their keyframes belong to the action you are on.'] : ['Actions keep several animations of this screen together: idle, walk, jump, happy, sad… Each one has its own keyframes for all the layers, and its own length.', 'Each exports as its own animation to Unity, Godot and Blender (and plays in Interactions). Screens still work as before.'], 'Actions')).filter(Boolean),
      { key: 'scr-actions', badge: a ? h('span.badge', null, String(a.list.length)) : null });
  });

  // ---------- a rig's panel: its own (older) actions, or a pointer to the screen's
  function section(o) {
    if (o.type !== 'rig') return null; const FL = SB.fields;
    if (!A.of(o)) return FL.section('Actions', [h('p.hint', null, 'Actions are on the screen: each one keeps the keyframes of every layer, this rig included.'),
      h('div.row.btns', null, W.btn('Screen actions', () => { tree.select([]); SB.invalidate('inspector'); }, { cls: 'sm', icon: 'screen' }))], { key: 'actions', closed: true });
    return FL.section('Actions', [...list(o, W.info(['This rig keeps its own actions (made in an older version): each has keyframes for the rig and everything that moves with it.', 'Move them to the screen: then every action keeps the keyframes of all the layers, and the screen panel lists them.'], 'Actions')),
      h('div.row.btns', null, W.btn('Move to the screen’s actions', () => A.toScreen(o), { cls: 'sm', icon: 'screen' }))].filter(Boolean),
      { key: 'actions', badge: h('span.badge', null, String(A.of(o).list.length)) });
  }
  if (SB.inspector) SB.inspector.top.push(section);

  // ---------- the timeline: the action's name on the rig's clip (click it to switch)
  SB.timeline.extraBadges.push(o => { const c = o.type === 'rig' && A.current(o); if (!c) return ''; const st = o.aseq && o.aseq.length && !o.aseqOff ? o.aseq.map(x => (o.actions.list.find(a => a.id === x.act) || {}).name || '?').join(' → ') : null; return `<span class="cl-badge act" data-act="action" title="${st ? 'Action strips play: ' + U.esc(st) + '. Click to pick the action to edit' : 'Action: click to switch, add or rename'}">▶ ${U.esc(st || c.name)}</span>`; });
  SB.timeline.acts = SB.timeline.acts || {}; SB.timeline.acts.action = (o, b) => { const r = b.getBoundingClientRect(); SB.menu.open(r.left, r.bottom + 4, A.menuItems(o)); };
})(window.SB);
