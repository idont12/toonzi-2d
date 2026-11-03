/* Action strips: a rig's actions one after another in the timeline (like Blender's NLA strips, simpler).
   rig.aseq = [{ id, t, act, blend }]: from the rig's local time t, the rig (and everything that moves with it) plays action `act`,
   looping it; for `blend` seconds it fades over from the strip before (each value goes smoothly from one action to the other).
   rig.aseqOff: the strips are muted, so the rig shows the action you edit (the panel's Actions list), as without strips.
   The strips are read through SB.tracks.seq (js/core/tracks.js), so playing, the stage and video exports all show them.
   Exports of single actions (Unity, Godot, Blender: SB.actions.during) mute them, so each action exports on its own. */
'use strict';
(function (SB) {
  const U = SB.util, S = SB.state, tree = SB.tree, TR = SB.tracks, h = U.h, W = SB.w, A = () => SB.actions;
  const keyOf = o => o.link || o.id;
  const on = r => r && r.type === 'rig' && r.aseq && r.aseq.length && !r.aseqOff && !r._mute && A().of(r);
  /** Which rig's strips play layer o (cached until the next change). */
  let cache = { s: -1, m: new Map() };
  function rigOf(o) {
    if (cache.s !== SB.stamp) { const m = new Map(); for (const r of tree.all()) if (on(r)) A().members(r).forEach(x => m.set(x.id, r)); cache = { s: SB.stamp, m }; }
    return cache.m.get(o.id);
  }
  const actOf = (rig, id) => rig.actions.list.find(x => x.id === id);
  const lenOf = (rig, act) => Math.max(0.05, act.dur || S.project.duration);
  /** Value of property id of layer o in strip s at the rig's local time lt (the action loops from the strip's start). */
  function at(rig, o, id, s, lt) {
    const act = actOf(rig, s.act); if (!act) return undefined; const tau = Math.max(0, lt - s.t) % lenOf(rig, act);
    const trs = act.id === rig.actions.cur ? o.tracks : (act.tracks || {})[keyOf(o)];
    return TR.evalTrack(o, id, trs && trs[id], tau);
  }
  TR.seq = (o, id, lt) => {
    if (S.ixPlay) return undefined; const rig = rigOf(o); if (!rig || rig._mute) return undefined;
    const L = rig.aseq; let i = 0; for (let k = 0; k < L.length; k++) if (L[k].t <= lt + 1e-6) i = k;
    const s = L[i], v = at(rig, o, id, s, lt); if (i === 0 || !(s.blend > 0) || lt - s.t >= s.blend) return v;
    const vb = at(rig, o, id, L[i - 1], lt); if (v === undefined || vb === undefined) return v ?? vb;
    const u = U.clamp((lt - s.t) / s.blend, 0, 1), w = u * u * (3 - 2 * u), ty = TR.type(id);
    return ty === 'num' && typeof v === 'number' && typeof vb === 'number' ? U.lerp(vb, v, w) : ty === 'color' ? U.lerpColor(vb, v, w) : (w < 0.5 ? vb : v);
  };

  const sort = rig => rig.aseq.sort((a, b) => a.t - b.t);
  const AS = SB.actionStrips = {
    /** Add a strip at the playhead: the next action after the one playing there (or act), blending in over `blend` seconds. */
    add(rig, act, blend = 0.4) {
      const a = A().of(rig) || (A().start(rig), A().of(rig)), t = U.r2(Math.max(0, tree.localTime(rig))); rig.aseq = rig.aseq || [];
      if (!rig.aseq.length && t > 0.05) rig.aseq.push({ id: U.uid(), t: 0, act: a.cur, blend: 0 }); // what plays before it: the action you have
      const before = rig.aseq.filter(s => s.t <= t).pop(), list = a.list, next = act || (!rig.aseq.length ? a.cur : (list[(list.findIndex(x => x.id === (before ? before.act : a.cur)) + 1) % list.length] || list[0]).id);
      const same = rig.aseq.find(s => Math.abs(s.t - t) < 0.02); if (same) { same.act = next; } else rig.aseq.push({ id: U.uid(), t, act: next, blend: rig.aseq.length ? blend : 0 });
      sort(rig); delete rig.aseqOff; SB.commit(); return rig.aseq;
    },
    remove(rig, s) { rig.aseq = (rig.aseq || []).filter(x => x !== s); if (!rig.aseq.length) delete rig.aseq; SB.commit(); },
    set(rig, s, k, v) { s[k] = k === 'act' ? v : U.r2(Math.max(0, +v || 0)); if (k === 't') sort(rig); SB.commit(); },
  };
  // exporting one action on its own: the strips stay out of it
  const during0 = A().during; A().during = async (rigId, actId, fn) => { const rig = rigId && tree.find(rigId); if (!rig || !rig.aseq) return during0(rigId, actId, fn); rig._mute = true; SB.bump(); try { return await during0(rigId, actId, fn); } finally { delete rig._mute; SB.bump(); } };

  // ---------- the panel: the strips of the selected rig
  function section(o) {
    if (o.type !== 'rig' || !A().of(o)) return null; const FL = SB.fields, list = o.aseq || [], acts = o.actions.list.map(x => [x.id, x.name]);
    const rows = list.map((s, i) => h('div.aseq-row', null,
      W.num(s.t, { step: 0.1, min: 0, label: 'Starts at (seconds)', change: v => AS.set(o, s, 't', v) }), h('span.hint', null, 's'),
      W.select(s.act, acts, v => AS.set(o, s, 'act', v), 'Action'),
      i ? h('span.aseq-blend', { title: 'Blend: seconds it takes to go over smoothly from the action before' }, '↝', W.num(s.blend || 0, { step: 0.1, min: 0, label: 'Blend (seconds)', change: v => AS.set(o, s, 'blend', v) })) : h('span.aseq-blend'),
      W.iconBtn('x', 'Remove this strip', () => AS.remove(o, s), 'sm')));
    const body = [
      list.length ? W.row('Play', W.check(!o.aseqOff, 'Strips (off: edit the action you pick)', v => { if (v) delete o.aseqOff; else o.aseqOff = true; SB.commit(); })) : null,
      list.length ? h('div.aseq-list', null, rows) : h('p.hint', null, 'Put actions one after another in the timeline: move the playhead, then add a strip. Each one blends into the next.'),
      h('div.row.btns', null, W.btn('Add at the playhead', () => AS.add(o), { cls: 'sm primary', icon: 'plus' }),
        W.info(['A strip plays an action from its start time, again and again, until the next strip. Blend: how many seconds the change from the action before takes.', 'To change an action itself, turn Play off, pick it in Actions and edit its keyframes.'], 'Action strips')),
    ];
    return FL.section('Action strips', body.filter(Boolean), { key: 'aseq', badge: list.length ? h('span.badge', null, String(list.length)) : null });
  }
  if (SB.inspector) SB.inspector.top.push(section);

  // ---------- the timeline: the strips on the rig's clip. Drag a strip's name to move it, its small handle to change the blend,
  // click it to change its action; right-click the clip › Add action strip here.
  SB.timeline.extraBadges.push(o => {
    if (o.type !== 'rig' || !o.aseq || !A().of(o)) return '';
    return o.aseq.map((s, i) => { const act = actOf(o, s.act), x = `calc(${s.t} * var(--z))`;
      return `${i && s.blend > 0 ? `<span class="cl-ablend" style="left:${x};width:calc(${s.blend} * var(--z))"></span>` : ''}<span class="cl-aseq${o.aseqOff ? ' off' : ''}" data-act="aseq" data-k="${i}" style="left:${x}" title="${U.esc((act ? act.name : '?') + ' from ' + U.r2(s.t) + 's. Drag to move it, click to change it')}">${U.esc(act ? act.name : '?')}</span>${i ? `<span class="cl-ablend-h" data-act="aseqb" data-k="${i}" style="left:calc(${s.t + (s.blend || 0)} * var(--z))" title="Blend ${U.r2(s.blend || 0)}s: drag to change it"></span>` : ''}`; }).join('');
  });
  /** Local time of the rig under client x on its timeline clip (else the playhead). */
  function timeAt(o, x) {
    const clip = document.querySelector(`.tl-row[data-id="${o.id}"] .clip`); if (!clip || x == null) return tree.localTime(o);
    const r = clip.getBoundingClientRect(); return x >= r.left - 2 && x <= r.right + 2 ? U.r2(U.clamp((x - r.left) / S.zoom, 0, o.dur)) : tree.localTime(o);
  }
  AS.addAt = (rig, t, act) => { const now = S.time; tree.goLocal(rig, t); AS.add(rig, act); SB.time.set(now); };
  /** For the rig's right-click menu: add a strip where you clicked. */
  AS.menuItem = o => {
    if (o.type !== 'rig' || !A().of(o)) return null; const t = timeAt(o, lastCX);
    return { label: `Add action strip at ${U.r2(t)}s`, sub: o.actions.list.map(x => ({ label: x.name, run: () => AS.addAt(o, t, x.id) })) };
  };
  let dragged = 0, lastCX = null; addEventListener('contextmenu', e => { lastCX = e.clientX; }, true); /* where the right-click was: the menu is built before it opens */
  SB.timeline.acts = SB.timeline.acts || {};
  SB.timeline.acts.aseq = (o, b) => {
    if (performance.now() - dragged < 300) return; const s = (o.aseq || [])[+b.dataset.k]; if (!s) return; const r = b.getBoundingClientRect(), k = +b.dataset.k;
    SB.menu.open(r.left, r.bottom + 4, [{ head: `Strip at ${U.r2(s.t)}s` }, ...o.actions.list.map(x => ({ label: (x.id === s.act ? '✓ ' : '') + x.name, run: () => AS.set(o, s, 'act', x.id) })), '-',
      k ? { label: 'Blend', sub: [0, 0.25, 0.5, 1].map(v => ({ label: (Math.abs((s.blend || 0) - v) < 1e-3 ? '✓ ' : '') + (v ? `${v}s` : 'None: a cut'), run: () => AS.set(o, s, 'blend', v) })).concat({ label: 'Other…', run: async () => { const v = await SB.dialog.prompt('Blend', 'Seconds to go over from the action before (0: a cut).', String(s.blend || 0)); if (v != null) AS.set(o, s, 'blend', v); } }) } : null,
      { label: 'Remove this strip', icon: 'trash', run: () => AS.remove(o, s) }].filter(Boolean));
  };
  SB.timeline.acts.aseqb = () => {};
  /** Drag a strip's name (its start) or its blend handle sideways. */
  addEventListener('pointerdown', e => {
    const b = e.target.closest && e.target.closest('.cl-aseq,.cl-ablend-h'); if (!b || e.button > 0) return; const row = b.closest('.tl-row'), o = row && tree.find(row.dataset.id), s = o && (o.aseq || [])[+b.dataset.k]; if (!s) return;
    e.stopPropagation(); const blend = b.classList.contains('cl-ablend-h'), x0 = e.clientX, t0 = s.t, b0 = s.blend || 0; let moved = false;
    const mv = ev => { const d = (ev.clientX - x0) / S.zoom; if (!moved && Math.abs(ev.clientX - x0) < 4) return; moved = true;
      if (blend) s.blend = U.r2(Math.max(0, b0 + d)); else s.t = U.r2(U.clamp(t0 + d, 0, o.dur)); SB.bump(); SB.invalidate('timeline'); };
    const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); if (!moved) return; dragged = performance.now(); sort(o); SB.commit(); };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
  }, true);
})(window.SB);
