/* Interactions (Web animation projects): rules in plain words — WHEN something happens, IF the conditions hold,
   DO the actions — played right on the stage, exported as an interactive web page (js/io/webpage.js) or a Rive file.
   S.doc.ix = { v: 2, start: animation key, rules: [rule], view: 'rules' | 'flow', board: { k, x, y } }
   rule = { id, name, off?, when: { type, layer?, key?, screen?, anim?, after? }, join: 'and' | 'or', conds: [cond],
            acts: [act], repeat? (a frame/move rule runs its one-shot actions every time, not only when it starts to hold) }
   An animation's key is its screen id, or "screenId:actionId" for an action of a rig (js/rig/actions.js).
   Layers are named by key (o.link || o.id). Older projects' cards and arrows (v1) become rules. */
'use strict';
(function (SB) {
  const U = SB.util, S = SB.state, h = U.h, W = SB.w, Sc = SB.screens, tree = SB.tree, TR = SB.tracks;
  const keyOf = o => o.link || o.id;

  // ================= what can be said
  const WHEN = {
    click: ['Click / tap', 'target', 'A click or a tap (on a layer, or anywhere)'], down: ['Press', 'down', 'The pointer or a finger goes down'], up: ['Release', 'up', 'The pointer or a finger comes up'],
    hover: ['Hover', 'eye', 'The pointer comes over it'], leave: ['Leave', 'eyeOff', 'The pointer leaves it'], move: ['Pointer moves', 'move', 'Every time the pointer moves (over it, or anywhere)'],
    drag: ['Drag', 'hand', 'Press on it and move: the rule runs while dragging'], key: ['Key', 'keyboard', 'A key is pressed'], load: ['Screen opens', 'screen', 'A screen starts (also the first one)'],
    end: ['Animation ends', 'flag', 'The animation reaches its end'], after: ['After time', 'clock', 'Some time after the animation started'], tick: ['Every frame', 'loop', 'Checks the conditions all the time: runs when they start to hold (or every frame with “Every time”)'],
  };
  const LAYERED = new Set(['click', 'down', 'up', 'hover', 'leave', 'move', 'drag']);
  const COND = {
    anim: ['Animation is', 'play'], time: ['Animation time', 'clock'], pressed: ['Pointer is pressed', 'down'], over: ['Pointer is over', 'eye'], pointer: ['Pointer position', 'move'],
    prop: ['Layer value', 'edit'], ctrl: ['Controller', 'ctrl'], key: ['Key is held', 'keyboard'], screen: ['Screen is', 'screen'],
    vr: ['Variable', 'label'], shown: ['Layer is shown', 'eye'], frame: ['Drawing frame is', 'frames'], chance: ['Chance', 'swap'], count: ['Rule ran', 'loop'],
  };
  const ACT = {
    play: ['Play animation', 'play'], pause: ['Pause', 'pause'], resume: ['Resume', 'play'], toggle: ['Play / pause', 'loop'], seek: ['Go to a time', 'keyNext'],
    ctrl: ['Move a controller', 'ctrl'], follow: ['Follow the pointer', 'move'], drag: ['Drag the layer', 'hand'], screen: ['Go to screen', 'screen'], effect: ['Play an effect', 'fx'], set: ['Set a layer', 'edit'],
    vr: ['Change a variable', 'label'], vis: ['Show / hide a layer', 'eye'], frame: ['Show a drawing frame', 'frames'], wait: ['Wait', 'clock'], url: ['Open a link', 'web'],
  };
  const CONTINUOUS = new Set(['follow', 'drag']);
  const OPS = [['<', 'less than'], ['>', 'more than'], ['=', 'about'], ['!=', 'not about']];
  const EASES = [['smooth', 'Smooth'], ['linear', 'Linear'], ['easeIn', 'Speed up'], ['easeOut', 'Slow down'], ['back', 'Overshoot']];
  const TRANS = [['cut', 'Cut'], ['fade', 'Fade'], ['slide', 'Slide'], ['wipe', 'Wipe'], ['zoom', 'Zoom'], ['break', 'Break apart']];
  const DIRS = [['left', 'Left'], ['right', 'Right'], ['up', 'Up'], ['down', 'Down'], ['center', 'From the middle']];
  const PROPS = [['x', 'X'], ['y', 'Y'], ['rot', 'Rotation'], ['scale', 'Size'], ['opacity', 'Opacity'], ['visible', 'Shown']];

  // ================= the library and the model
  function library() {
    Sc.sync(); const out = [];
    for (const s of S.screens || []) {
      const vs = SB.actions ? SB.actions.variants(s.objects, s.proj) : [];
      if (!vs.length) out.push({ key: s.id, name: s.name, screen: s, dur: s.proj.duration });
      else vs.forEach(v => out.push({ key: `${s.id}:${v.act.id}`, name: (S.screens.length > 1 ? s.name + ' › ' : '') + v.act.name, short: v.act.name, screen: s, rigId: v.rigId, actId: v.act.id, dur: v.dur }));
    }
    return out;
  }
  const libOf = (lib, k) => lib.find(a => a.key === k);
  const firstOf = (lib, s) => lib.find(a => a.screen === s);
  let seq = 1;
  const newRule = (lib, extra) => Object.assign({ id: 'ru' + U.uid(), name: `Rule ${seq++}`, when: { type: 'click', layer: '' }, join: 'and', conds: [], acts: [{ type: 'play', anim: (lib[1] || lib[0] || {}).key || '', mix: 250, ease: 'smooth' }] }, extra);
  /** The rules, made on first use; v1 cards and arrows carry over as rules. */
  function model() {
    let m = S.doc.ix; if (m && m.v === 2) return m;
    const lib = library(), old = m || {}, rules = [];
    const animOf = id => ((old.states || []).find(s => s.id === id) || {}).anim;
    (old.links || []).forEach(l => {
      const w = l.when || {}, to = animOf(l.to); if (!to) return; const from = l.from === 'any' ? null : animOf(l.from);
      const when = w.type === 'timer' ? { type: 'after', after: w.after ?? 1 } : w.type === 'end' ? { type: 'end', anim: from || '' } : { type: w.type || 'click', layer: w.layer || '', key: w.key };
      rules.push({ id: 'ru' + U.uid(), name: `${WHEN[when.type] ? WHEN[when.type][0] : 'Rule'} → ${(libOf(lib, to) || { name: '?' }).name}`, when, join: 'and', conds: from && when.type !== 'end' ? [{ type: 'anim', anim: from }] : [], acts: [{ type: 'play', anim: to, mix: l.mix || 0, ease: l.ease || 'smooth' }] });
    });
    (old.follow || []).forEach(f => rules.push({ id: 'ru' + U.uid(), name: 'Mouse follow', when: { type: 'move', layer: f.area || '' }, join: 'and', conds: [], acts: [{ type: 'follow', ctrl: f.ctrl, smooth: f.smooth ?? 0.25 }], repeat: true }));
    m = S.doc.ix = { v: 2, start: animOf(old.start) || (lib[0] || {}).key || '', rules, view: 'rules' };
    return m;
  }
  const ruleById = id => model().rules.find(r => r.id === id);
  const save = () => { SB.commit(); SB.invalidate('ixpanel', 'inspector'); };
  const objByKey = k => tree.all().find(o => keyOf(o) === k) || (S.screens || []).flatMap(s => tree.all(s.objects || [])).find(o => keyOf(o) === k);
  const layerName = k => !k ? 'anywhere' : (objByKey(k) || { name: 'a deleted layer' }).name;
  const screenName = id => (Sc.find(id) || { name: 'a deleted screen' }).name;
  const animName = k => (libOf(library(), k) || { name: k ? 'a deleted animation' : '?' }).name;

  // ---------- the rule as words
  function whenText(w) {
    const t = w.type, L = w.layer ? ` on ${layerName(w.layer)}` : '';
    if (t === 'key') return `Key ${w.key || 'Space'}`; if (t === 'load') return w.screen ? `${screenName(w.screen)} opens` : 'A screen opens';
    if (t === 'end') return w.anim ? `${animName(w.anim)} ends` : 'An animation ends'; if (t === 'after') return `${U.r2(w.after ?? 1)}s into ${w.anim ? animName(w.anim) : 'an animation'}`;
    if (t === 'tick') return 'Every frame'; return (WHEN[t] ? WHEN[t][0] : t) + (LAYERED.has(t) ? (w.layer ? L : ' anywhere') : '');
  }
  function condText(c) {
    const not = c.not ? ' not' : '';
    switch (c.type) {
      case 'anim': return `${animName(c.anim)} is${not} playing`; case 'time': return `time ${c.op || '>'} ${U.r2(c.value ?? 0)}s`; case 'pressed': return `pointer is${not} pressed`;
      case 'over': return `pointer is${not} over ${layerName(c.layer)}`; case 'pointer': return `pointer ${c.axis || 'x'} ${c.op || '>'} ${Math.round(c.value ?? 0)}`;
      case 'prop': return `${layerName(c.layer)} ${(PROPS.find(p => p[0] === c.prop) || ['', '?'])[1].toLowerCase()} ${c.op || '>'} ${c.value ?? 0}`;
      case 'ctrl': return `${layerName(c.ctrl)} ${c.axis === 'v' ? '↕' : '↔'} ${c.op || '>'} ${c.value ?? 0}`; case 'key': return `key ${c.key || 'Space'} is${not} held`; case 'screen': return `on${not ? ' another screen than' : ''} ${screenName(c.screen)}`;
      case 'vr': return `${c.name || 'score'} ${c.op || '>'} ${c.value ?? 0}`; case 'shown': return `${layerName(c.layer)} is${not} shown`; case 'frame': return `${layerName(c.layer)} shows frame ${c.value ?? 1}${not ? ' (not)' : ''}`;
      case 'chance': return `${c.value ?? 50}% chance`; case 'count': return `this rule ran ${c.op || '<'} ${c.value ?? 1}×`;
    }
    return c.type;
  }
  function actText(a) {
    switch (a.type) {
      case 'play': return `Play ${animName(a.anim)}${a.mix ? ` · ${a.mix} ms` : ''}`; case 'pause': return 'Pause'; case 'resume': return 'Resume'; case 'toggle': return 'Play / pause';
      case 'seek': return a.to === 'next' ? 'Next keyframe' : a.to === 'prev' ? 'Previous keyframe' : `Go to ${U.r2(a.time ?? 0)}s`;
      case 'ctrl': return `${layerName(a.ctrl)} → ${a.slot ? a.slot : `${U.r2(a.u ?? 0)}, ${U.r2(a.v ?? 0)}`}`; case 'follow': return `${layerName(a.ctrl || a.layer)} follows the pointer`;
      case 'drag': return a.layer ? `Drag ${layerName(a.layer)}` : 'Drag it'; case 'screen': return `Go to ${screenName(a.screen)}${a.trans && a.trans !== 'cut' ? ' · ' + (TRANS.find(t => t[0] === a.trans) || ['', a.trans])[1].toLowerCase() : ''}`;
      case 'effect': return `${(SB.effects.get(a.fx) || { label: 'Effect' }).label} on ${layerName(a.layer)}`; case 'set': return `${layerName(a.layer)} ${(PROPS.find(p => p[0] === a.prop) || ['', '?'])[1].toLowerCase()} = ${a.value}`;
      case 'vr': return `${a.name || 'score'} ${a.op === 'add' ? (a.value < 0 ? '− ' + -a.value : '+ ' + (a.value ?? 1)) : a.op === 'flip' ? 'flips (0 ↔ 1)' : '= ' + (a.value ?? 0)}`;
      case 'vis': return `${a.mode === 'hide' ? 'Hide' : a.mode === 'toggle' ? 'Show / hide' : 'Show'} ${layerName(a.layer)}`;
      case 'frame': return `${layerName(a.layer)} shows ${a.to === 'next' ? 'the next frame' : a.to === 'prev' ? 'the previous frame' : a.to === 'random' ? 'a random frame' : 'frame ' + (a.value ?? 1)}`;
      case 'wait': return `Wait ${a.ms ?? 500} ms`; case 'url': return `Open ${a.href || 'a link'}`;
    }
    return a.type;
  }
  /** What is wrong with a rule before it even runs (deleted screens, layers, animations). */
  function broken(r) {
    const lib = library(), bad = [], L = k => k && !objByKey(k) && bad.push('a deleted layer'), A = k => k && !libOf(lib, k) && bad.push('a deleted animation'), Sx = id => id && !Sc.find(id) && bad.push('a deleted screen');
    L(r.when.layer); A(r.when.anim); Sx(r.when.screen);
    r.conds.forEach(c => { L(c.layer); L(c.ctrl); A(c.anim); Sx(c.screen); }); r.acts.forEach(a => { L(a.layer); L(a.ctrl); A(a.anim); Sx(a.screen); });
    return [...new Set(bad)];
  }
  /** Rules that use screen id (for deleting it safely). */
  function refsTo(id) { const m = S.doc.ix; if (!m || m.v !== 2) return []; return m.rules.filter(r => r.when.screen === id || (r.when.anim || '').split(':')[0] === id || r.conds.some(c => c.screen === id || (c.anim || '').split(':')[0] === id) || r.acts.some(a => a.screen === id || (a.anim || '').split(':')[0] === id)); }

  // ================= Web animation mode
  const webOk = () => !SB.targets || SB.targets.get() === 'web' || (S.screens || []).some(s => s.proj && s.proj.target === 'web');
  async function setMode(on) {
    if (on && !webOk()) {
      const v = await SB.dialog.ask('Interactions are for web animations', `This project is made for ${SB.targets.short()}. Interactions (clicks, hovers, drags, screens) play in Web animation projects, which export an interactive web page or a Rive file.`, [{ v: 'web', label: 'Make it a web animation' }]);
      if (v !== 'web') return; SB.targets.set ? SB.targets.set('web') : (S.project.target = 'web'); (S.screens || []).forEach(s => { if (s.proj) s.proj.target = 'web'; }); SB.commit(); SB.invalidate();
    }
    if (!on && S.ixPlay) stop(); if (!on && sheet) sheet.close(); S.ixMode = !!on; U.$('#app').classList.toggle('ix-mode', !!on); if (on) model(); SB.invalidate();
  }

  // ================= the dock: rules (or the flow board), the bar with preview
  let sel = null; // selected rule id
  function panel() {
    const box = U.$('#ixPanel'); if (!box) return; box.hidden = !S.ixMode; if (!S.ixMode) return;
    const m = model(), lib = library(), playing = !!S.ixPlay, view = m.view || 'rules';
    const bar = h('div.ix-bar', null, h('b.ix-title', null, h('span', { html: SB.icon('target') }), h('i', null, 'Interactions')),
      W.btn('Rule', () => { const r = newRule(lib); m.rules.push(r); sel = r.id; save(); phoneSheet(); }, { cls: 'sm', icon: 'plus', title: 'Add a rule: when… if… do…' }),
      W.seg(view, [['rules', 'Rules'], ['flow', 'Flow']], v => { m.view = v; SB.invalidate('ixpanel'); }),
      h('span.spacer'), previewBar(playing),
      W.iconBtn('export', 'Export: interactive web page or Rive', () => SB.exporter.open({ kind: 'web' }), 'sm'),
      W.iconBtn('x', 'Back to the timeline', () => setMode(false), 'sm'));
    const body = view === 'flow' ? flowBoard(m, lib) : rulesList(m, lib, playing);
    box.replaceChildren(bar, body);
    if (sheet) sheetFill();
  }
  /** The compact preview: play / stop, what plays, its time. */
  function previewBar(playing) {
    const c = RT.cur, pct = c ? Math.round(Math.min(1, c.t / c.dur) * 100) : 0;
    return h('div.ix-prev', null,
      W.btn(playing ? 'Stop' : 'Preview', () => playing ? stop() : play(), { cls: 'sm' + (playing ? '' : ' primary'), icon: playing ? 'pause' : 'play', title: 'Try it on the stage: click, hover, drag, press keys (Esc stops)' }),
      playing ? W.iconBtn(RT.paused ? 'play' : 'pause', RT.paused ? 'Resume' : 'Pause the animation', () => { setPaused(!RT.paused); SB.invalidate('ixpanel'); }, 'sm') : null,
      playing && c ? h('span.ix-now', null, h('b', null, c.a.short || c.a.name), h('i.ix-track', null, h('i.ix-fill', { style: { width: pct + '%' } })), h('small.ix-t', null, `${U.r2(c.t)}s`)) : null);
  }
  function rulesList(m, lib, playing) {
    const list = h('div.ix-rules');
    m.rules.forEach((r, i) => {
      const st = RT.status[r.id], bad = broken(r), on = sel === r.id;
      const chip = (cls, icon, text, part) => h('button.ix-chip.' + cls, { type: 'button', title: 'Edit', onclick: e => { e.stopPropagation(); sel = r.id; SB.invalidate('ixpanel', 'inspector'); focusPart(part); phoneSheet(); } }, h('span', { html: SB.icon(icon) }), text);
      const conds = r.conds.length ? r.conds.flatMap((c, k) => [k ? h('span.ix-join', null, r.join === 'or' ? 'or' : 'and') : null, chip('if', (COND[c.type] || ['', 'filter'])[1], condText(c), 'if')]) : [h('span.ix-none', null, 'always')];
      list.appendChild(h('div.ix-rule' + (on ? '.on' : '') + (r.off ? '.off' : '') + (bad.length ? '.bad' : '') + (st && playing ? '.' + st.state : ''), { dataset: { rule: r.id }, onclick: () => { sel = r.id; SB.invalidate('ixpanel', 'inspector'); phoneSheet(); } },
        h('div.ix-rhead', null, W.check(!r.off, '', v => { if (v) delete r.off; else r.off = true; save(); }), h('b', null, r.name), h('span.spacer'),
          W.iconBtn('copy', 'Duplicate', e => { e.stopPropagation(); const c = U.deep(r); c.id = 'ru' + U.uid(); c.name = r.name + ' copy'; m.rules.splice(i + 1, 0, c); sel = c.id; save(); }, 'sm'),
          W.iconBtn('trash', 'Delete', e => { e.stopPropagation(); m.rules.splice(i, 1); if (sel === r.id) sel = null; save(); }, 'sm')),
        h('div.ix-line', null, h('span.ix-k', null, 'When'), chip('when', (WHEN[r.when.type] || ['', 'target'])[1], whenText(r.when), 'when')),
        h('div.ix-line', null, h('span.ix-k', null, 'If'), ...conds),
        h('div.ix-line', null, h('span.ix-k', null, 'Do'), ...(r.acts.length ? r.acts.map(a => chip('do', (ACT[a.type] || ['', 'play'])[1], actText(a), 'do')) : [h('span.ix-none', null, 'nothing yet')])),
        bad.length ? h('div.ix-why.warn', null, `Uses ${bad.join(' and ')}: fix it or delete it.`) : st && playing ? h('div.ix-why', null, st.text) : null));
    });
    return list;
  }
  let focusTo = null; const focusPart = p => { focusTo = p; };

  // ---------- the flow board: screens and animations, with arrows for what the rules do (zoom, pan, fit)
  const thumbs = new Map();
  function thumbOf(s, w) {
    const key = s.id + ':' + Sc.ver + ':' + w, c0 = thumbs.get(s.id); if (c0 && c0.key === key) return c0.cv;
    const k = w / s.proj.w, cv = h('canvas', { width: Math.round(w * 2), height: Math.round(s.proj.h * k * 2) }), x = cv.getContext('2d'); x.fillStyle = s.proj.bg || '#fff'; x.fillRect(0, 0, cv.width, cv.height);
    try { Sc.with(s, () => SB.scene.render(x, 0, k * 2, { preview: true })); } catch (e) { console.warn(e); }
    thumbs.set(s.id, { key, cv }); return cv;
  }
  function flowBoard(m, lib) {
    const screens = S.screens || [], B = m.board || (m.board = { k: 1, x: 0, y: 0 }), NW = 180;
    const box = h('div.ix-flow'), world = h('div.ix-world'); box.appendChild(world);
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.classList.add('ix-wires'); world.appendChild(svg);
    // screens laid out as on the board (scaled), in a row when they all sit together
    const b = Sc.bounds ? Sc.bounds() : { x0: 0, y0: 0, x1: 1, y1: 1 }, sc = NW / Math.max(...screens.map(s => s.proj.w), 1) * 1.6, pos = new Map();
    screens.forEach(s => pos.set(s.id, { x: 20 + (s.x - b.x0) * sc, y: 40 + (s.y - b.y0) * sc }));
    const nodeAt = id => { const p = pos.get(id), s = Sc.find(id); return p && s ? { x: p.x, y: p.y, w: NW, h: NW * s.proj.h / s.proj.w } : null; };
    let maxX = 400, maxY = 260;
    for (const s of screens) {
      const p = pos.get(s.id), node = nodeAt(s.id), acts = lib.filter(a => a.screen === s && a.actId), start = m.start && (libOf(lib, m.start) || {}).screen === s;
      maxX = Math.max(maxX, p.x + NW + 60); maxY = Math.max(maxY, p.y + node.h + 60 + acts.length * 22);
      world.appendChild(h('div.ix-node' + (s === Sc.active() ? '.cur' : ''), { style: { left: p.x + 'px', top: p.y + 'px', width: NW + 'px' }, title: 'Double-click to work on this screen. Right-click: start here', oncontextmenu: ev => { ev.preventDefault(); ev.stopPropagation(); SB.menu.open(ev.clientX, ev.clientY, [{ head: s.name }, { label: start ? '✓ The animation starts here' : 'Start the animation here', icon: 'play', run: () => { const f = firstOf(lib, s); if (!f) return SB.toast('This screen has nothing to play yet.'); m.start = f.key; save(); } }]); }, ondblclick: () => { setMode(false); SB.board ? SB.board.focus(s, true) : Sc.swapTo(s); } },
        h('div.ix-nname', null, start ? h('span.ix-startdot', { title: 'Plays first' }) : null, s.name, h('small', null, `${U.r2(s.proj.duration)}s`)), thumbOf(s, NW),
        acts.length ? h('div.ix-acts', null, acts.map(a => h('span', null, h('span', { html: SB.icon('rig') }), a.short))) : null));
    }
    // arrows: a rule's screen (its "Screen is" condition, "opens" or played animation) to the screen it goes to or plays on
    const from = r => (r.conds.find(c => c.type === 'screen' && !c.not) || {}).screen || r.when.screen || ((r.conds.find(c => c.type === 'anim' && !c.not) || {}).anim || r.when.anim || '').split(':')[0] || null;
    svg.innerHTML = '<defs><marker id="ixF" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path class="ixA-on" d="M0,0 L10,5 L0,10 z"/></marker></defs>';
    let n = 0;
    for (const r of m.rules) for (const a of r.acts) {
      const to = a.type === 'screen' ? a.screen : a.type === 'play' ? (a.anim || '').split(':')[0] : null; if (!to) continue; const f = from(r); if (f === to && a.type === 'play') continue;
      const B2 = nodeAt(to); if (!B2) continue; const A2 = f ? nodeAt(f) : null;
      const x1 = A2 ? A2.x + A2.w : B2.x - 70, y1 = A2 ? A2.y + A2.h / 2 : B2.y + B2.h / 2 + (n % 3) * 14, x2 = B2.x, y2 = B2.y + B2.h / 2 + (n++ % 3) * 10;
      const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'), dx = Math.max(50, Math.abs(x2 - x1) / 2), back = x2 < x1;
      p.setAttribute('d', back ? `M${x1},${y1} C${x1 + 60},${y1 + 120} ${x2 - 60},${y2 + 120} ${x2},${y2}` : `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`); p.setAttribute('class', 'w on'); p.setAttribute('marker-end', 'url(#ixF)'); svg.appendChild(p);
      world.appendChild(h('button.ix-chip.flow', { type: 'button', style: { left: (x1 + x2) / 2 + 'px', top: (back ? Math.max(y1, y2) + 90 : (y1 + y2) / 2) + 'px' }, onclick: () => { sel = r.id; m.view = 'rules'; SB.invalidate('ixpanel', 'inspector'); } }, whenText(r.when)));
    }
    svg.setAttribute('width', maxX); svg.setAttribute('height', maxY); world.style.width = maxX + 'px'; world.style.height = maxY + 'px';
    const apply = () => { world.style.transform = `translate(${B.x}px, ${B.y}px) scale(${B.k})`; };
    const fit = () => { const r = box.getBoundingClientRect(); if (!r.width) return; B.k = U.clamp(Math.min(r.width / maxX, r.height / maxY), 0.2, 2); B.x = (r.width - maxX * B.k) / 2; B.y = (r.height - maxY * B.k) / 2; apply(); };
    apply();
    const tools = h('div.ix-zoom', null, W.iconBtn('minus', 'Zoom out', () => { B.k = U.clamp(B.k / 1.25, 0.2, 3); apply(); }, 'sm'), W.iconBtn('plus', 'Zoom in', () => { B.k = U.clamp(B.k * 1.25, 0.2, 3); apply(); }, 'sm'), W.btn('Fit', fit, { cls: 'sm ghost' }));
    box.appendChild(tools);
    box.addEventListener('wheel', e => { e.preventDefault(); const r = box.getBoundingClientRect(), f = Math.exp(-e.deltaY * 0.0015), k = U.clamp(B.k * f, 0.2, 3), mx = e.clientX - r.left, my = e.clientY - r.top; B.x = mx - (mx - B.x) * k / B.k; B.y = my - (my - B.y) * k / B.k; B.k = k; apply(); }, { passive: false });
    box.addEventListener('pointerdown', e => { if (e.target.closest('button,.ix-node')) return; const x0 = e.clientX - B.x, y0 = e.clientY - B.y; box.setPointerCapture(e.pointerId); const mv = ev => { B.x = ev.clientX - x0; B.y = ev.clientY - y0; apply(); }, up = () => { box.removeEventListener('pointermove', mv); box.removeEventListener('pointerup', up); }; box.addEventListener('pointermove', mv); box.addEventListener('pointerup', up); });
    if (!m.board.fitted) { m.board.fitted = true; requestAnimationFrame(fit); }
    return box;
  }

  // ================= the inspector: the selected rule, part by part
  const pickLayerBtn = (set, title) => W.iconBtn('target', title || 'Pick the layer on the stage', () => SB.picker.start({ title: 'Pick a layer', test: o => SB.types.get(o.type).visual || o.type === 'null', done: c => { set(keyOf(c.o)); save(); } }), 'sm');
  function layerOpts(withAny, ctrlOnly) { Sc.sync(); const out = withAny ? [['', 'Anywhere']] : []; (function w(list, d) { for (const o of list) { if (ctrlOnly ? o.type === 'null' : SB.types.get(o.type).visual) out.push([keyOf(o), '  '.repeat(d) + o.name]); if (o.children && !o.seq) w(o.children, d + 1); } })(S.objects, 0); return out; }
  const animOpts = () => library().map(a => [a.key, a.name]);
  const screenOpts = () => (S.screens || []).map(s => [s.id, s.name]);
  const keyInput = (v, set) => Object.assign(h('input.ix-key', { type: 'text', value: v || 'Space', title: 'Click, then press the key', 'aria-label': 'Key' }), { onkeydown(e) { e.preventDefault(); e.stopPropagation(); const k = e.code === 'Space' ? 'Space' : e.key.length === 1 ? e.key.toUpperCase() : e.key; e.target.value = k; set(k); save(); } });
  const num = (v, o, set) => W.num(v ?? 0, Object.assign({ change: x => { set(x); save(); } }, o));
  const sel2 = (v, opts, set, label) => W.select(v ?? (opts[0] || [''])[0], opts, x => { set(x); save(); }, label);
  const tiles = (cur, defs, set, filter) => h('div.ix-tiles', null, Object.entries(defs).filter(([k]) => !filter || filter(k)).map(([k, d]) => h('button.ix-tile' + (cur === k ? '.on' : ''), { type: 'button', title: d[2] || d[0], onclick: () => { set(k); save(); } }, h('span', { html: SB.icon(d[1]) }), d[0])));
  const del = (fn, title) => W.iconBtn('x', title || 'Remove', () => { fn(); save(); }, 'sm');
  function whenFields(w) {
    const t = w.type, f = [];
    if (LAYERED.has(t)) f.push(W.row('On', sel2(w.layer || '', layerOpts(true), v => w.layer = v, 'Layer'), pickLayerBtn(v => w.layer = v)));
    if (t === 'key') f.push(W.row('Key', keyInput(w.key, v => w.key = v)));
    if (t === 'load') f.push(W.row('Screen', sel2(w.screen || '', [['', 'Any screen'], ...screenOpts()], v => w.screen = v, 'Screen')));
    if (t === 'end' || t === 'after') f.push(W.row('Animation', sel2(w.anim || '', [['', 'Any animation'], ...animOpts()], v => w.anim = v, 'Animation')));
    if (t === 'after') f.push(W.row('After (s)', num(w.after ?? 1, { min: 0, step: 0.1, label: 'Seconds' }, v => w.after = Math.max(0, v))));
    return f;
  }
  function condFields(c) {
    const notChk = W.check(!!c.not, 'not', v => { c.not = v; save(); });
    switch (c.type) {
      case 'anim': return [sel2(c.anim, animOpts(), v => c.anim = v, 'Animation'), notChk];
      case 'time': return [sel2(c.op || '>', OPS, v => c.op = v, 'Compare'), num(c.value, { step: 0.1, label: 'Seconds' }, v => c.value = v), h('span.hint', null, 's')];
      case 'pressed': return [notChk]; case 'key': return [keyInput(c.key, v => c.key = v), notChk];
      case 'over': return [sel2(c.layer, layerOpts(false), v => c.layer = v, 'Layer'), pickLayerBtn(v => c.layer = v), notChk];
      case 'pointer': return [sel2(c.axis || 'x', [['x', 'x'], ['y', 'y']], v => c.axis = v, 'Axis'), sel2(c.op || '>', OPS, v => c.op = v, 'Compare'), num(c.value, { step: 1, label: 'Pixels' }, v => c.value = v)];
      case 'prop': return [sel2(c.layer, layerOpts(false), v => c.layer = v, 'Layer'), sel2(c.prop || 'x', PROPS, v => c.prop = v, 'Value'), sel2(c.op || '>', OPS, v => c.op = v, 'Compare'), num(c.value, { step: 1, label: 'Value' }, v => c.value = v)];
      case 'ctrl': return [sel2(c.ctrl, layerOpts(false, true), v => c.ctrl = v, 'Controller'), sel2(c.axis || 'u', [['u', 'across'], ['v', 'down']], v => c.axis = v, 'Axis'), sel2(c.op || '>', OPS, v => c.op = v, 'Compare'), num(c.value, { min: -1, max: 1, step: 0.05, label: '−1…1' }, v => c.value = v)];
      case 'screen': return [sel2(c.screen, screenOpts(), v => c.screen = v, 'Screen'), notChk];
      case 'vr': return [varInput(c.name, v => c.name = v), sel2(c.op || '>', VOPS, v => c.op = v, 'Compare'), num(c.value, { step: 1, label: 'Value' }, v => c.value = v)];
      case 'shown': return [sel2(c.layer, layerOpts(false), v => c.layer = v, 'Layer'), pickLayerBtn(v => c.layer = v), notChk];
      case 'frame': return [sel2(c.layer, frameLayers(), v => c.layer = v, 'Drawing'), num(c.value ?? 1, { min: 1, step: 1, label: 'Frame' }, v => c.value = Math.max(1, Math.round(v))), notChk];
      case 'chance': return [num(c.value ?? 50, { min: 0, max: 100, step: 5, label: 'Percent' }, v => c.value = U.clamp(v, 0, 100)), h('span.hint', null, '% of the times')];
      case 'count': return [sel2(c.op || '<', OPS.slice(0, 2).concat([['=', 'exactly']]), v => c.op = v, 'Compare'), num(c.value ?? 1, { min: 0, step: 1, label: 'Times' }, v => c.value = Math.max(0, Math.round(v))), h('span.hint', null, 'times before')];
    }
    return [];
  }
  const VOPS = [['>', 'more than'], ['<', 'less than'], ['==', 'is'], ['!==', 'is not'], ['>=', 'at least'], ['<=', 'at most']];
  const varInput = (v, set) => Object.assign(h('input.ix-var', { type: 'text', value: v || 'score', maxlength: 24, title: 'The variable: any name. Every variable starts at 0 when the preview (or the page) starts', 'aria-label': 'Variable', list: 'ixVars' }), { onchange(e) { set(e.target.value.trim() || 'score'); save(); } });
  /** Drawings with several frames (frame library or played frames). */
  const frameLayers = () => layerOpts(false).filter(([k]) => { const o = objByKey(k); return o && o.frames && o.frames.length > 1; });
  function actFields(a, r = { when: {} }) {
    switch (a.type) {
      case 'play': return [W.row('Animation', sel2(a.anim, animOpts(), v => a.anim = v, 'Animation')), W.row('Morph ms', W.range(a.mix ?? 0, { min: 0, max: 2000, step: 10, label: 'Morph length', input: v => { a.mix = Math.round(v); }, change: () => save() })), a.mix ? W.row('Ease', sel2(a.ease || 'smooth', EASES, v => a.ease = v, 'Ease')) : null,
        W.row('', W.check(!!a.restart, 'Start over if it already plays', v => { a.restart = v; save(); })), W.row('', W.check(a.loop === false, 'Play once (stop at its end)', v => { a.loop = v ? false : undefined; save(); }))];
      case 'seek': return [W.row('To', W.seg(a.to || 'time', [['time', 'A time'], ['prev', 'Prev key'], ['next', 'Next key']], v => { a.to = v; save(); })), (a.to || 'time') === 'time' ? W.row('Time (s)', num(a.time, { min: 0, step: 0.05, label: 'Seconds' }, v => a.time = Math.max(0, v))) : W.row('Keys of', sel2(a.layer || '', [['', 'Any layer'], ...layerOpts(false)], v => a.layer = v, 'Layer'))];
      case 'ctrl': { const c = objByKey(a.ctrl), slots = c && SB.controls ? SB.controls.slotsFor(c) : []; return [W.row('Controller', sel2(a.ctrl, layerOpts(false, true), v => a.ctrl = v, 'Controller')),
        W.row('To', sel2(a.slot || '', [['', 'A position'], ...slots.map(s => [s.k, s.name || s.k])], v => a.slot = v, 'Point')), a.slot ? null : W.row('Across', num(a.u, { min: -1, max: 1, step: 0.05, label: 'Across' }, v => a.u = U.clamp(v, -1, 1)), num(a.v, { min: -1, max: 1, step: 0.05, label: 'Down' }, v => a.v = U.clamp(v, -1, 1))),
        W.row('Over ms', num(a.dur ?? 300, { min: 0, step: 50, label: 'Milliseconds' }, v => a.dur = Math.max(0, v))), W.row('Ease', sel2(a.ease || 'smooth', EASES, v => a.ease = v, 'Ease'))]; }
      case 'follow': return [W.row('What', W.seg(a.ctrl != null ? 'ctrl' : 'layer', [['ctrl', 'A controller'], ['layer', 'A layer']], v => { if (v === 'ctrl') { a.ctrl = a.ctrl || ''; delete a.layer; } else { a.layer = a.layer || ''; delete a.ctrl; } save(); })),
        a.ctrl != null ? W.row('Controller', sel2(a.ctrl, layerOpts(false, true), v => a.ctrl = v, 'Controller')) : W.row('Layer', sel2(a.layer, layerOpts(false), v => a.layer = v, 'Layer'), pickLayerBtn(v => a.layer = v)),
        a.ctrl == null ? W.row('Moves', W.seg(a.axis || 'xy', [['xy', 'Both'], ['x', 'Across'], ['y', 'Up/down']], v => { a.axis = v; save(); })) : null,
        W.row('Smooth %', W.range(Math.round((a.smooth ?? 0.25) * 100), { min: 0, max: 95, label: 'Smoothing', input: v => { a.smooth = v / 100; }, change: () => save() })),
        h('p.hint', null, a.ctrl != null ? 'The controller follows the pointer across its box (over the stage, or the layer in WHEN), and so does what it drives.' : 'The layer goes where the pointer is, while the rule holds.')];
      case 'drag': { const L = objByKey(a.layer || r.when.layer), rig = L && L.type === 'rig' ? L : null;
        return [W.row('Layer', sel2(a.layer || '', [['', 'The one in WHEN'], ...layerOpts(false)], v => a.layer = v, 'Layer')),
        rig ? W.row('Part', sel2(a.bone || '*', [['*', 'The bone you press on'], ['', 'The whole rig'], ...rig.bones.map(b => [b.id, b.name || 'Bone'])], v => a.bone = v, 'Part of the rig')) : null,
        rig ? h('p.hint', null, a.bone === '' ? 'The rig and everything on it moves with the pointer.' : 'The bone’s end follows the pointer and the bones above it bend to reach it (like the Bones tool).') : null, W.row('Moves', W.seg(a.axis || 'xy', [['xy', 'Both'], ['x', 'Across'], ['y', 'Up/down']], v => { a.axis = v; save(); })), rig && a.bone !== '' ? null : h('p.hint', null, 'Use it with WHEN Drag: the layer moves with the pointer, and stays where it is dropped (until Stop).')]; }
      case 'screen': return [W.row('Screen', sel2(a.screen, screenOpts(), v => a.screen = v, 'Screen')), W.row('Transition', sel2(a.trans || 'fade', TRANS, v => a.trans = v, 'Transition')),
        (a.trans || 'fade') !== 'cut' ? [W.row('Direction', sel2(a.dir || 'left', DIRS, v => a.dir = v, 'Direction')), W.row('Length ms', W.range(a.dur ?? 500, { min: 100, max: 3000, step: 50, label: 'Length', input: v => { a.dur = Math.round(v); }, change: () => save() })), (a.trans === 'break') ? W.row('Pieces', W.range(Math.round((a.amt ?? 0.5) * 100), { min: 5, max: 100, label: 'How many pieces', input: v => { a.amt = v / 100; }, change: () => save() })) : null, W.row('Ease', sel2(a.ease || 'smooth', EASES, v => a.ease = v, 'Ease'))] : null];
      case 'effect': { const fx = SB.effects.where(d => d.cat === 'in' || d.cat === 'out' || d.cat === 'loop').map(d => [d.id, `${d.label} (${d.cat === 'in' ? 'in' : d.cat === 'out' ? 'out' : 'loop'})`]); return [W.row('Layer', sel2(a.layer, layerOpts(false), v => a.layer = v, 'Layer'), pickLayerBtn(v => a.layer = v)), W.row('Effect', sel2(a.fx || 'popIn', fx, v => a.fx = v, 'Effect')), W.row('Length ms', num(a.dur ?? 600, { min: 50, step: 50, label: 'Milliseconds' }, v => a.dur = Math.max(50, v)))]; }
      case 'vr': return [W.row('Variable', varInput(a.name, v => a.name = v)), W.row('Change', W.seg(a.op || 'set', [['set', 'Set to'], ['add', 'Add'], ['flip', 'Flip 0/1']], v => { a.op = v; save(); })), a.op === 'flip' ? null : W.row(a.op === 'add' ? 'Add' : 'Value', num(a.value ?? (a.op === 'add' ? 1 : 0), { step: 1, label: 'Value' }, v => a.value = v)), h('p.hint', null, 'Variables count and remember things (a score, how many clicks, which step you are on). Check them in IF with Variable.')];
      case 'vis': return [W.row('Layer', sel2(a.layer, layerOpts(false), v => a.layer = v, 'Layer'), pickLayerBtn(v => a.layer = v)), W.row('Do', W.seg(a.mode || 'show', [['show', 'Show'], ['hide', 'Hide'], ['toggle', 'Switch']], v => { a.mode = v; save(); }))];
      case 'frame': return [W.row('Drawing', sel2(a.layer, frameLayers(), v => a.layer = v, 'Drawing')), W.row('Show', W.seg(a.to || 'n', [['n', 'Frame'], ['next', 'Next'], ['prev', 'Previous'], ['random', 'Random']], v => { a.to = v; save(); })), (a.to || 'n') === 'n' ? W.row('Frame', num(a.value ?? 1, { min: 1, step: 1, label: 'Frame' }, v => a.value = Math.max(1, Math.round(v)))) : null, h('p.hint', null, 'It holds that drawing frame (mouths, eyes, buttons…) until something changes it again.')];
      case 'wait': return [W.row('Wait ms', num(a.ms ?? 500, { min: 0, step: 50, label: 'Milliseconds' }, v => a.ms = Math.max(0, v))), h('p.hint', null, 'The actions after this one run later.')];
      case 'url': return [W.row('Link', Object.assign(h('input', { type: 'url', value: a.href || '', placeholder: 'https://…', 'aria-label': 'Link' }), { onchange(e) { a.href = e.target.value.trim(); save(); } })), W.row('', W.check(a.tab !== false, 'In a new tab', v => { a.tab = v; save(); }))];
      case 'set': return [W.row('Layer', sel2(a.layer, layerOpts(false), v => a.layer = v, 'Layer'), pickLayerBtn(v => a.layer = v)), W.row('Value', sel2(a.prop || 'opacity', PROPS, v => a.prop = v, 'Value'), a.prop === 'visible' ? W.check(!!a.value, 'shown', v => { a.value = v ? 1 : 0; save(); }) : num(a.value, { step: 1, label: 'To' }, v => a.value = v)), W.row('Over ms', num(a.dur ?? 0, { min: 0, step: 50, label: 'Milliseconds' }, v => a.dur = Math.max(0, v)))];
    }
    return [];
  }
  function inspector() {
    const m = model(), lib = library(), out = [h('div.insp-head', null, h('span.badge', { style: { '--c': 'var(--brand)' }, html: SB.icon('target') + 'Interactions' }), h('span.spacer'), W.iconBtn('x', 'Back to the timeline', () => setMode(false), 'sm'))];
    const sec = (t, body, key) => SB.fields.section(t, body.flat(3).filter(Boolean), { key: 'ixr-' + key });
    const r = sel && ruleById(sel);
    if (!r) {
      out.push(sec('Interactions', [h('p.hint', null, 'Rules make the animation react: WHEN something happens (a click, a hover, a drag, a key, a screen opening…), IF the conditions hold, DO the actions (play, pause, go to a screen, move a controller, follow the pointer…). Preview tries them on the stage.'),
        m.rules.length ? null : h('p.ix-none', null, h('b', null, 'No rules yet. '), 'A rule says: WHEN something happens, IF it should, DO something. Try: when Button is clicked, play Wave.'),
        Sc.many() ? W.row('Start screen', sel2(((libOf(lib, m.start) || firstOf(lib, Sc.active()) || {}).screen || Sc.active()).id, Sc.list().map(s => [s.id, s.name]), v => { const sc = Sc.find(v), cur = libOf(lib, m.start); if (sc && (!cur || cur.screen !== sc)) m.start = (firstOf(lib, sc) || {}).key || ''; }, 'Start screen')) : null,
        W.row('Starts with', sel2(m.start || '', animOpts().filter(([k]) => { const st = (libOf(lib, m.start) || {}).screen; return !st || !Sc.many() || (libOf(lib, k) || {}).screen === st; }), v => m.start = v, 'First animation')),
        h('div.row.btns', null, W.btn('Add a rule', () => { const nr = newRule(lib); m.rules.push(nr); sel = nr.id; save(); }, { cls: 'sm primary', icon: 'plus' }), W.btn(S.ixPlay ? 'Stop' : 'Preview', () => S.ixPlay ? stop() : play(), { cls: 'sm', icon: S.ixPlay ? 'pause' : 'play' }))], 'all'));
      // controllers the viewer drags: tick one to make it interactive (selecting a controller shows it here too)
      const ctls = tree.all().filter(o => o.type === 'null');
      if (ctls.length) out.push(sec('Controllers the viewer can drag', [h('p.hint', null, 'Ticked controllers show on the stage while it plays, and the viewer drags their knob to change what they drive. Works in Preview, the web page and Rive.'),
        ...ctls.map(c => W.row('', W.check(!!c.ixGrab, c.name + (S.sel === c.id ? ' (selected)' : ''), v => SB.controls.setGrab(c, v))))], 'ctls'));
      if (RT.log.length) out.push(sec('What happened', [h('div.ix-log', null, RT.log.slice(-10).reverse().map(l => h('div', null, l)))], 'log'));
      return out;
    }
    const name = h('input', { type: 'text', value: r.name, 'aria-label': 'Rule name' }); name.onchange = () => { r.name = name.value.trim() || r.name; save(); };
    out.push(sec('Rule', [W.row('Name', name), W.row('', W.check(!r.off, 'On', v => { if (v) delete r.off; else r.off = true; save(); })),
      broken(r).length ? h('p.hint.warn', null, `Uses ${broken(r).join(' and ')}.`) : null,
      RT.status[r.id] ? h('p.ix-why', null, RT.status[r.id].text) : null,
      h('div.row.btns', null, W.btn('Duplicate', () => { const c = U.deep(r); c.id = 'ru' + U.uid(); c.name = r.name + ' copy'; m.rules.splice(m.rules.indexOf(r) + 1, 0, c); sel = c.id; save(); }, { cls: 'sm ghost', icon: 'copy' }),
        W.btn('Delete', () => { m.rules.splice(m.rules.indexOf(r), 1); sel = null; if (sheet) sheet.close(); save(); }, { cls: 'sm ghost', icon: 'trash' }), W.btn('Back to all rules', () => { sel = null; SB.invalidate('ixpanel', 'inspector'); }, { cls: 'sm ghost' }))], 'rule'));
    out.push(sec('When', [tiles(r.when.type, WHEN, k => { r.when = { type: k, layer: r.when.layer || '' }; if (k === 'after') r.when.after = 1; }), ...whenFields(r.when),
      r.when.type === 'tick' || r.when.type === 'move' ? W.row('', W.check(!!r.repeat, 'Every time (not only when it starts to hold)', v => { r.repeat = v; save(); })) : null], 'when'));
    const condRows = r.conds.map((c, k) => h('div.ix-item', null, h('div.ix-ihead', null, h('span', { html: SB.icon(COND[c.type][1]) }), h('b', null, COND[c.type][0]), h('span.spacer'), del(() => r.conds.splice(k, 1))), h('div.ix-ifields', null, condFields(c))));
    out.push(sec('If', [r.conds.length > 1 ? W.row('Needs', W.seg(r.join || 'and', [['and', 'All of them'], ['or', 'Any of them']], v => { r.join = v; save(); })) : null, ...condRows,
      W.btn('Condition', e => { const q = e.currentTarget.getBoundingClientRect(); SB.menu.open(q.left, q.bottom + 4, [{ head: 'Only if…' }, ...Object.entries(COND).map(([k, d]) => ({ label: d[0], icon: d[1], run: () => { r.conds.push(defaultCond(k, lib)); save(); } }))]); }, { cls: 'sm ghost', icon: 'plus' }),
      !r.conds.length ? h('p.hint', null, 'No conditions: it always runs when the WHEN happens.') : null], 'if'));
    const actRows = r.acts.map((a, k) => h('div.ix-item' + (CONTINUOUS.has(a.type) ? '.cont' : ''), null, h('div.ix-ihead', null, h('span', { html: SB.icon(ACT[a.type][1]) }), h('b', null, ACT[a.type][0]), CONTINUOUS.has(a.type) ? h('small', null, 'while the rule holds') : null, h('span.spacer'),
      k ? W.iconBtn('up', 'Earlier', () => { [r.acts[k - 1], r.acts[k]] = [r.acts[k], r.acts[k - 1]]; save(); }, 'sm') : null, del(() => r.acts.splice(k, 1))), h('div.ix-ifields', null, actFields(a, r))));
    out.push(sec('Do', [...actRows, W.btn('Action', e => { const q = e.currentTarget.getBoundingClientRect(); SB.menu.open(q.left, q.bottom + 4, [{ head: 'Then…' }, ...Object.entries(ACT).map(([k, d]) => ({ label: d[0], icon: d[1], run: () => { r.acts.push(defaultAct(k, lib, r)); save(); } }))]); }, { cls: 'sm ghost', icon: 'plus' })], 'do'));
    if (focusTo) { const f = focusTo; focusTo = null; requestAnimationFrame(() => { const el = [...document.querySelectorAll('#inspector section.sec > h3, .ix-sheet section.sec > h3')].find(x => x.textContent.trim().toLowerCase().startsWith(f === 'do' ? 'do' : f)); if (el) el.scrollIntoView({ block: 'start', behavior: 'smooth' }); }); }
    return out;
  }
  function defaultCond(k, lib) { const c = { type: k }; if (k === 'vr') { c.name = 'score'; c.op = '>'; c.value = 0; } if (k === 'shown') c.layer = (layerOpts(false)[0] || [''])[0]; if (k === 'frame') { c.layer = (frameLayers()[0] || [''])[0]; c.value = 1; } if (k === 'chance') c.value = 50; if (k === 'count') { c.op = '<'; c.value = 1; } if (k === 'anim') c.anim = (lib[0] || {}).key; if (k === 'time') { c.op = '>'; c.value = 1; } if (k === 'pointer') { c.axis = 'x'; c.op = '>'; c.value = Math.round(S.project.w / 2); } if (k === 'prop') { c.prop = 'x'; c.op = '>'; c.value = 0; c.layer = (layerOpts(false)[0] || [''])[0]; } if (k === 'over') c.layer = (layerOpts(false)[0] || [''])[0]; if (k === 'ctrl') { c.ctrl = (layerOpts(false, true)[0] || [''])[0]; c.axis = 'u'; c.op = '>'; c.value = 0; } if (k === 'screen') c.screen = Sc.active().id; if (k === 'key') c.key = 'Space'; return c; }
  function defaultAct(k, lib, r) { const a = { type: k }; if (k === 'vr') { a.name = 'score'; a.op = 'add'; a.value = 1; } if (k === 'vis') { a.layer = r.when.layer || (layerOpts(false)[0] || [''])[0]; a.mode = 'toggle'; } if (k === 'frame') { a.layer = (frameLayers()[0] || [''])[0]; a.to = 'next'; } if (k === 'wait') a.ms = 500; if (k === 'url') { a.href = 'https://'; a.tab = true; } if (k === 'play') { a.anim = (lib[1] || lib[0] || {}).key; a.mix = 250; } if (k === 'screen') { const o = (S.screens || []).find(s => s !== Sc.active()); a.screen = (o || Sc.active()).id; a.trans = 'fade'; a.dur = 500; } if (k === 'ctrl' || (k === 'follow')) a.ctrl = (layerOpts(false, true)[0] || [''])[0]; if (k === 'follow') a.smooth = 0.25; if (k === 'drag') a.layer = ''; if (k === 'effect') { a.layer = r.when.layer || (layerOpts(false)[0] || [''])[0]; a.fx = 'popIn'; a.dur = 600; } if (k === 'set') { a.layer = r.when.layer || (layerOpts(false)[0] || [''])[0]; a.prop = 'opacity'; a.value = 50; } if (k === 'seek') { a.to = 'time'; a.time = 0; } return a; }

  // phones: the inspector is out of sight, so a rule's settings open in a sheet
  let sheet = null;
  const phone = () => U.$('#app').dataset.layout === 'phone';
  function phoneSheet() { if (!phone() || !sel) return; if (sheet) return sheetFill(); const d = SB.dialog.sheet([h('div.ix-sheet')], { onClose: () => { sheet = null; } }); sheet = d; sheetFill(); }
  function sheetFill() { const box = sheet && sheet.el.querySelector('.ix-sheet'); if (!box || !box.isConnected) { sheet = null; return; } box.replaceChildren(...inspector().slice(1).flat(3).filter(Boolean), h('div.sheet-actions', null, W.btn('Done', () => sheet && sheet.close(), { cls: 'primary' }))); }

  // ================= the player: rules running on the stage
  const RT = { vars: {}, timers: [], undo: [], cur: null, prev: null, mix: null, raf: 0, keep: null, members: new Map(), pointer: null, down: null, hover: new Set(), keys: new Set(), status: {}, log: [], active: new Map(), last: new Map(), anims: [], fx: [], trans: null, paused: false, lastNow: 0 };
  const now = () => performance.now();
  function play() {
    const m = model(), lib = library(); if (!lib.length) return SB.toast('Make an animation first.');
    Sc.sync(); RT.keep = { screen: Sc.active(), time: S.time }; tree.select([]); S.ixPlay = true; S.playing = false; U.$('#app').classList.add('ix-playing');
    TR.mixer = mixer; Object.assign(RT, { prev: null, mix: null, pointer: null, down: null, status: {}, log: [], paused: false, trans: null, vars: {} }); (RT.timers || []).forEach(clearTimeout); RT.timers = []; RT.hover.clear(); RT.keys.clear(); RT.active.clear(); RT.last.clear(); RT.anims = []; RT.fx = [];
    const first = libOf(lib, m.start) || firstOf(lib, Sc.active()) || lib[0];
    m.rules.forEach(r => status(r, 'wait', waitText(r)));
    enter(first, now(), 0, null, true);
    const tick = t => { if (!S.ixPlay) return; frame(t); RT.raf = requestAnimationFrame(tick); }; RT.raf = requestAnimationFrame(tick);
    SB.invalidate(); if (!SB.player) SB.toast('Preview: click, hover, drag and press keys on the stage. Esc stops.');
  }
  function stop() {
    if (!S.ixPlay) return; cancelAnimationFrame(RT.raf); S.ixPlay = false; TR.mixer = null; U.$('#app').classList.remove('ix-playing'); endTransition();
    (RT.timers || []).forEach(clearTimeout); RT.timers = [];
    tree.all().forEach(o => { if (o._ixLive) { delete o._live; delete o._ixLive; } delete o._ix; delete o._ixB; delete o._ixFrame; }); (S.screens || []).forEach(s => tree.all(s.objects || []).forEach(o => { delete o._ix; delete o._ixFrame; if (o._ixLive) { delete o._live; delete o._ixLive; } }));
    RT.fx.forEach(f => { f.o.effects = f.o.effects.filter(e => e !== f.e); }); RT.fx = [];
    const k = RT.keep; RT.cur = RT.prev = RT.mix = null;
    while (RT.undo.length) { const [o, key, v] = RT.undo.pop(); o[key] = v; }
    if (k) { if (k.screen && k.screen !== Sc.active() && S.screens.includes(k.screen)) Sc.swapTo(k.screen); SB.time.set(k.time); }
    SB.bump(); SB.invalidate();
  }
  function setPaused(p) { if (!RT.cur) return; if (p && !RT.paused) { RT.paused = true; RT.pausedAt = now(); } else if (!p && RT.paused) { const d = now() - RT.pausedAt; RT.cur.t0 += d; if (RT.prev) RT.prev.t0 += d; RT.paused = false; } }
  function log(t) { RT.log.push(`${(RT.cur ? RT.cur.a.short || RT.cur.a.name : '')} · ${t}`); if (RT.log.length > 40) RT.log.shift(); }
  function status(r, state, text) { RT.status[r.id] = { state, text, at: now() }; }
  const waitText = r => r.off ? 'Off.' : `Waiting for: ${whenText(r.when).toLowerCase()}.`;
  /** Start an animation: its screen (a cut, or a transition), its rig action (through the mixer, nothing stored). */
  function enter(a, t, mix, ease, opening, opt = {}) {
    if (!a) return; let swapped = false;
    if (a.screen !== Sc.active()) { Sc.swapTo(a.screen); mix = 0; RT.prev = null; tree.select([]); swapped = true; }
    if (mix > 0 && RT.cur) { RT.prev = RT.cur; RT.mix = { t0: t, dur: mix, ease: TR.EASES[ease] || TR.EASES.smooth }; } else { RT.prev = null; RT.mix = null; }
    if (a.actId && a.dur > S.project.duration + 1e-6) stretch(tree.find(a.rigId), a.dur);
    RT.cur = { a, t0: t, t: 0, dur: Math.max(0.01, a.dur), loop: opt.loop !== false, done: 0, after: new Set() }; RT.paused = false;
    RT.members.clear(); (SB.rig ? SB.rig.rigs() : []).forEach(r => { if (SB.actions.of(r)) SB.actions.members(r).forEach(o => RT.members.set(o.id, r)); });
    if (swapped || opening) { RT.active.forEach((v, id) => { const r = ruleById(id); if (r && !['down', 'drag', 'hover', 'tick', 'move'].includes(r.when.type)) RT.active.delete(id); }); fireEvent('load', { screen: a.screen.id }); }
    SB.invalidate('ixpanel');
  }
  function stretch(rig, d) { const set = (o, k, v) => { RT.undo.push([o, k, o[k]]); o[k] = v; }; set(S.project, 'duration', d); if (rig) SB.actions.members(rig).forEach(m => { if (!m.parts && m.type !== 'video' && m.type !== 'audio' && (m.start || 0) + m.dur < d) set(m, 'dur', d - (m.start || 0)); }); }
  function tracksFor(ps, o, rig) { const a = ps && ps.a; if (!a || !a.actId || a.rigId !== rig.id) return null; const act = rig.actions.list.find(x => x.id === a.actId); if (!act || act.id === rig.actions.cur) return null; return (act.tracks || {})[keyOf(o)] || {}; }
  function mixer(o, id, lt) {
    const rig = RT.members.get(o.id); if (!rig || !RT.cur) return undefined;
    const A = tracksFor(RT.cur, o, rig), mixing = RT.mix && RT.prev; if (!A && !mixing) return undefined;
    let v = TR.evalTrack(o, id, A ? A[id] : o.tracks && o.tracks[id], lt);
    if (mixing) { const B = tracksFor(RT.prev, o, rig), vb = TR.evalTrack(o, id, B ? B[id] : o.tracks && o.tracks[id], lt + (RT.prev.t - RT.cur.t)), w = RT.mix.w ?? 0, ty = TR.type(id); v = ty === 'num' && typeof v === 'number' && typeof vb === 'number' ? U.lerp(vb, v, w) : ty === 'color' ? U.lerpColor(vb, v, w) : (w < 0.5 ? vb : v); }
    return v;
  }
  // runtime moves of layers (follow, drag, set): on top of everything else, never stored
  TR.hook(60, (o, lt, r) => { const x = o._ix; if (!x || !S.ixPlay) return; for (const k in x) if (k in r) r[k] = x[k]; if (x.visible === 0) r.opacity = 0; });
  const timeOf = (c, t) => { const raw = (t - c.t0) / 1000; return !c.loop ? Math.min(raw, c.dur) : raw % c.dur; };
  function frame(t) {
    const c = RT.cur; if (!c) return; const m = model();
    if (!RT.paused) {
      const raw = (t - c.t0) / 1000; c.t = timeOf(c, t);
      const cycles = Math.floor(raw / c.dur); if (cycles > c.done && (c.loop || c.done === 0)) { c.done = cycles; fireEvent('end', { anim: c.a.key }); if (RT.cur !== c) return frame(t); }
      for (const r of m.rules) if (!r.off && r.when.type === 'after' && !c.after.has(r.id) && raw >= (r.when.after ?? 1) && (!r.when.anim || r.when.anim === c.a.key)) { c.after.add(r.id); run(r, { type: 'after' }); if (RT.cur !== c) return frame(t); }
      if (RT.prev) RT.prev.t = timeOf(RT.prev, t);
    }
    if (RT.mix) { const u = U.clamp((t - RT.mix.t0) / RT.mix.dur, 0, 1); RT.mix.w = RT.mix.ease.fn(u); if (u >= 1) { RT.mix = null; RT.prev = null; } }
    // every-frame rules: one-shot actions when their conditions start to hold (or every frame with "Every time"), continuous ones while they hold
    for (const r of m.rules) {
      if (r.off || (r.when.type !== 'tick' && r.when.type !== 'move')) continue;
      if (r.when.type === 'move' && r.when.layer && !overLayer(r.when.layer)) { if (RT.active.has(r.id)) RT.active.delete(r.id); continue; }
      const ok = condsOk(r), was = RT.last.get(r.id); RT.last.set(r.id, ok.ok);
      if (r.when.type === 'tick') { if (ok.ok && (!was || r.repeat)) run(r, { type: 'tick' }, true); else if (!ok.ok && RT.active.has(r.id)) { RT.active.delete(r.id); status(r, 'blocked', `Stopped: ${ok.why}.`); } else if (!ok.ok) status(r, 'blocked', `Not now: ${ok.why}.`); }
      else if (!ok.ok && RT.active.has(r.id)) { RT.active.delete(r.id); status(r, 'blocked', `Stopped: ${ok.why}.`); }
    }
    continuous(t);
    // controller moves and layer tweens
    RT.anims = RT.anims.filter(an => { const u = U.clamp((t - an.t0) / Math.max(1, an.dur), 0, 1), k = an.ease.fn(u); an.step(k); return u < 1; });
    RT.fx.forEach(f => { const el = (t - f.t0) / 1000, lt = tree.localTime(f.o), D = Math.max(0.05, f.e.dur); if (f.cat === 'in') f.e.at = lt - el; else if (f.cat === 'out') f.e.gap = f.o.dur - lt - D + el; else { f.e.at = lt - el; f.e.len = D; } if (el > D && f.cat !== 'out') f.done = true; });
    RT.fx = RT.fx.filter(f => { if (f.done) { f.o.effects = f.o.effects.filter(e => e !== f.e); return false; } return true; });
    SB.time.set(Math.min(c.t, S.project.duration), true); SB.bump(); SB.dirty();
    if (RT.trans) drawTransition(t);
    if (Math.floor(t / 150) !== RT.tickUI) { RT.tickUI = Math.floor(t / 150); const f = U.$('.ix-prev .ix-fill'), tt = U.$('.ix-prev .ix-t'); if (f) f.style.width = Math.round(Math.min(1, c.t / c.dur) * 100) + '%'; if (tt) tt.textContent = U.r2(c.t) + 's'; updateWhy(); }
  }
  function updateWhy() { document.querySelectorAll('.ix-rule[data-rule]').forEach(el => { const st = RT.status[el.dataset.rule], w = el.querySelector('.ix-why:not(.warn)'); if (st && w) w.textContent = st.text; if (st) { el.classList.remove('ran', 'blocked', 'wait'); el.classList.add(st.state); } }); }

  // ---------- conditions
  const cmp = (a, op, b) => op === '<' ? a < b : op === '>' ? a > b : op === '!=' ? Math.abs(a - b) > Math.max(0.5, Math.abs(b) * 0.02) : Math.abs(a - b) <= Math.max(0.5, Math.abs(b) * 0.02);
  const hitsKey = (hit, k) => !k || (hit && [hit, ...tree.ancestors(hit)].some(o => keyOf(o) === k || (o.bind && o.bind.rig && (x => x && keyOf(x) === k)(tree.find(o.bind.rig))))); // a layer on a rig counts as the rig
  function overLayer(k) { if (!RT.pointer) return false; const hit = SB.scene.hit(RT.pointer); return hitsKey(hit, k); }
  function condOk(c, r) {
    const cur = RT.cur; let v, ok;
    switch (c.type) {
      case 'vr': v = RT.vars[c.name || 'score'] || 0; { const b = c.value ?? 0, o = c.op || '>'; ok = o === '>' ? v > b : o === '<' ? v < b : o === '>=' ? v >= b : o === '<=' ? v <= b : o === '!==' ? v !== b : v === b; } return [ok, `${c.name || 'score'} is ${v}`];
      case 'shown': { const o = objByKey(c.layer); if (!o) return [false, 'the layer is gone']; ok = !tree.hidden(o) && !(o._ix && o._ix.visible === 0) && TR.transform(o, tree.localTime(o)).opacity > 0.01 && tree.inRange(o); return [c.not ? !ok : ok, ok ? 'it is shown' : 'it is hidden']; }
      case 'frame': { const o = objByKey(c.layer); if (!o || !o.frames) return [false, 'the drawing is gone']; v = SB.frames.index(o, tree.localTime(o)) + 1; ok = v === (c.value ?? 1); return [c.not ? !ok : ok, `it shows frame ${v}`]; }
      case 'chance': ok = Math.random() * 100 < (c.value ?? 50); return [ok, ok ? 'the dice said yes' : 'the dice said no'];
      case 'count': v = r && RT.status[r.id] ? RT.status[r.id].n || 0 : 0; ok = (c.op || '<') === '<' ? v < (c.value ?? 1) : c.op === '>' ? v > (c.value ?? 1) : v === (c.value ?? 1); return [ok, `it ran ${v}×`];
      case 'anim': ok = !!cur && cur.a.key === c.anim; return [c.not ? !ok : ok, cur ? `${cur.a.short || cur.a.name} plays` : 'nothing plays'];
      case 'time': v = cur ? cur.t : 0; return [cmp(v, c.op || '>', c.value ?? 0), `time is ${U.r2(v)}s`];
      case 'pressed': ok = !!RT.down; return [c.not ? !ok : ok, ok ? 'it is pressed' : 'it is not pressed'];
      case 'over': ok = overLayer(c.layer); return [c.not ? !ok : ok, ok ? `it is over ${layerName(c.layer)}` : `it is not over ${layerName(c.layer)}`];
      case 'pointer': v = RT.pointer ? RT.pointer[c.axis || 'x'] : NaN; return [isFinite(v) && cmp(v, c.op || '>', c.value ?? 0), isFinite(v) ? `${c.axis || 'x'} is ${Math.round(v)}` : 'the pointer is not on the stage'];
      case 'prop': { const o = objByKey(c.layer); if (!o) return [false, 'the layer is gone']; const tr = TR.transform(o, tree.localTime(o)); v = c.prop === 'visible' ? (tree.hidden(o) || tr.opacity <= 0.01 ? 0 : 1) : c.prop === 'opacity' ? tr.opacity * 100 : c.prop === 'scale' ? tr.scale * 100 : tr[c.prop || 'x']; return [cmp(v, c.op || '>', c.value ?? 0), `it is ${U.r2(v)}`]; }
      case 'ctrl': { const o = objByKey(c.ctrl); if (!o || !SB.controls) return [false, 'the controller is gone']; const [u, w] = SB.controls.value(o, S.time); v = c.axis === 'v' ? w : u; return [cmp(v, c.op || '>', c.value ?? 0), `it is at ${U.r2(v)}`]; }
      case 'key': ok = RT.keys.has((c.key || 'Space').toUpperCase()); return [c.not ? !ok : ok, ok ? 'it is held' : 'it is not held'];
      case 'screen': ok = Sc.active().id === c.screen; return [c.not ? !ok : ok, `on ${Sc.active().name}`];
    }
    return [true, ''];
  }
  function condsOk(r) {
    if (!r.conds.length) return { ok: true }; const res = r.conds.map(c => [c, ...condOk(c, r)]);
    const ok = r.join === 'or' ? res.some(x => x[1]) : res.every(x => x[1]); if (ok) return { ok };
    const bad = res.filter(x => !x[1]); return { ok, why: bad.map(([c, , now]) => `“${condText(c)}” is false (${now})`).join(r.join === 'or' ? ' and ' : '; ') };
  }

  // ---------- events → rules
  /** An event happened: run the rules waiting for it (and say why the others didn't). */
  function fireEvent(type, ev = {}) {
    const m = model(); let any = false;
    for (const r of m.rules) {
      if (r.off || r.when.type !== type) continue; const w = r.when;
      if (type === 'hover' || type === 'leave') { if (w.layer ? ev.key !== w.layer : !ev.stage) continue; }
      else if (LAYERED.has(type) && w.layer && !hitsKey(ev.hit, w.layer)) { if (type === 'move') { RT.active.delete(r.id); continue; } status(r, 'wait', `${WHEN[type][0]} was ${ev.hit ? 'on ' + ev.hit.name : 'not on a layer'}: it waits for ${layerName(w.layer)}.`); continue; }
      if (type === 'key' && (w.key || 'Space').toUpperCase() !== (ev.key || '').toUpperCase()) { status(r, 'wait', `Key ${ev.key} was pressed: it waits for ${w.key || 'Space'}.`); continue; }
      if (type === 'load' && w.screen && w.screen !== ev.screen) continue;
      if (type === 'end' && w.anim && w.anim !== ev.anim) continue;
      if (run(r, Object.assign({ type }, ev))) any = true;
    }
    return any;
  }
  /** Run a rule if its conditions hold: one-shot actions now, continuous ones while it stays active. */
  function run(r, ev, quietBlock) {
    const ok = condsOk(r); if (!ok.ok) { status(r, 'blocked', `Didn’t run: ${ok.why}.`); if (!quietBlock) log(`${r.name}: blocked`); return false; }
    const t = now(); let did = [];
    const acts = r.acts.filter(a => !CONTINUOUS.has(a.type));
    const go = (from, at) => { for (let i = from; i < acts.length; i++) { const a = acts[i]; if (a.type === 'wait') { const ms = a.ms ?? 500; RT.timers.push(setTimeout(() => { if (S.ixPlay) go(i + 1, now()); }, ms)); did.push(`waits ${ms} ms`); return; } const d = doAct(a, r, ev, at); if (d) did.push(d); } };
    go(0, t);
    if (r.acts.some(a => CONTINUOUS.has(a.type))) RT.active.set(r.id, { ev, t, grab: null });
    const n = (RT.status[r.id] && RT.status[r.id].n || 0) + 1; RT.status[r.id] = { state: 'ran', text: `Ran ${n}× · ${did.length ? did.join(', ') : r.acts.some(a => CONTINUOUS.has(a.type)) ? 'following' : 'nothing to do'}.`, at: t, n };
    if (ev.type !== 'tick' && ev.type !== 'move') log(`${r.name}: ${did.join(', ') || 'ran'}`);
    return true;
  }
  function doAct(a, r, ev, t) {
    const lib = library();
    switch (a.type) {
      case 'play': { const an = libOf(lib, a.anim); if (!an) return null; if (RT.cur && RT.cur.a.key === an.key && !a.restart && !RT.paused) return null; enter(an, t, a.mix || 0, a.ease, false, { loop: a.loop }); return `played ${an.short || an.name}`; }
      case 'pause': setPaused(true); SB.invalidate('ixpanel'); return 'paused'; case 'resume': setPaused(false); SB.invalidate('ixpanel'); return 'resumed'; case 'toggle': setPaused(!RT.paused); SB.invalidate('ixpanel'); return RT.paused ? 'paused' : 'resumed';
      case 'seek': {
        const c = RT.cur; if (!c) return null; let to = a.time ?? 0;
        if (a.to === 'next' || a.to === 'prev') { const objs = a.layer ? [objByKey(a.layer)].filter(Boolean) : tree.all(); const ts = [...new Set(objs.flatMap(o => TR.times(o).map(x => x + (o.start || 0)))) ].sort((x, y) => x - y); to = a.to === 'next' ? (ts.find(x => x > c.t + 1e-3) ?? ts[0] ?? 0) : ([...ts].reverse().find(x => x < c.t - 1e-3) ?? ts[ts.length - 1] ?? 0); }
        c.t0 = (RT.paused ? RT.pausedAt : t) - U.clamp(to, 0, c.dur) * 1000; c.t = U.clamp(to, 0, c.dur); return `went to ${U.r2(c.t)}s`;
      }
      case 'ctrl': {
        const c = objByKey(a.ctrl); if (!c || !SB.controls) return null; const C = SB.controls, s = a.slot && C.slotOf(c, a.slot), u = s ? s.u : a.u || 0, v = s ? s.v : a.v || 0;
        const tx = (c.rx ?? c.x) + u * C.RX(c), ty = (c.ry ?? c.y) + v * C.RY(c), from = c._live ? Object.assign({}, c._live) : { x: TR.keyed(c, tree.localTime(c)).x, y: TR.keyed(c, tree.localTime(c)).y };
        RT.anims.push({ t0: t, dur: a.dur ?? 300, ease: TR.EASES[a.ease] || TR.EASES.smooth, step: k => { c._live = { x: from.x + (tx - from.x) * k, y: from.y + (ty - from.y) * k }; c._ixLive = true; } }); return `moved ${c.name}`;
      }
      case 'screen': { const s = Sc.find(a.screen); if (!s) return null; if (s === Sc.active()) return null; startTransition(a); const an = libOf(lib, (model().start && libOf(lib, model().start) || {}).screen === s ? model().start : '') || firstOf(lib, s); enter(an, t, 0, null, true); return `went to ${s.name}`; }
      case 'effect': {
        const o = objByKey(a.layer), d = SB.effects.get(a.fx || 'popIn'); if (!o || !d || !o.effects) return null; const e = SB.fx.make(d.id); e.dur = (a.dur ?? 600) / 1000; e._ix = true;
        RT.fx = RT.fx.filter(f => { if (f.o === o && f.e.type === e.type) { o.effects = o.effects.filter(x => x !== f.e); return false; } return true; });
        o.effects.push(e); RT.fx.push({ o, e, t0: t, cat: d.cat }); return `${d.label} on ${o.name}`;
      }
      case 'vr': { const k = a.name || 'score', v0 = RT.vars[k] || 0; RT.vars[k] = a.op === 'add' ? v0 + (a.value ?? 1) : a.op === 'flip' ? (v0 ? 0 : 1) : (a.value ?? 0); SB.invalidate('ixpanel'); return `${k} = ${RT.vars[k]}`; }
      case 'vis': { const o = objByKey(a.layer); if (!o) return null; const shown = !(o._ix && o._ix.visible === 0) && !o.hidden, on = a.mode === 'hide' ? 0 : a.mode === 'toggle' ? (shown ? 0 : 1) : 1; o._ix = Object.assign({}, o._ix, { visible: on }); if (on && o.hidden) o._ix.unhide = 1; return `${on ? 'showed' : 'hid'} ${o.name}`; }
      case 'frame': { const o = objByKey(a.layer); if (!o || !o.frames || o.frames.length < 2) return null; const n = o.frames.length, cur = SB.frames.index(o, tree.localTime(o)); const i = a.to === 'next' ? (cur + 1) % n : a.to === 'prev' ? (cur - 1 + n) % n : a.to === 'random' ? Math.floor(Math.random() * n) : U.clamp((a.value ?? 1) - 1, 0, n - 1); o._ixFrame = i; return `${o.name} shows frame ${i + 1}`; }
      case 'url': { if (!a.href || !/^https?:|^mailto:/i.test(a.href)) return null; try { if (a.tab === false) location.href = a.href; else window.open(a.href, '_blank', 'noopener'); } catch (e) { return null; } return `opened ${a.href}`; }
      case 'set': {
        const o = objByKey(a.layer); if (!o) return null; const tr = TR.transform(o, tree.localTime(o)), p = a.prop || 'opacity', val = p === 'opacity' ? (a.value ?? 100) / 100 : p === 'scale' ? (a.value ?? 100) / 100 : p === 'visible' ? (a.value ? 1 : 0) : a.value ?? 0;
        if (p === 'visible') { o._ix = Object.assign({}, o._ix, { visible: val }); return `${val ? 'showed' : 'hid'} ${o.name}`; }
        const from = (o._ix && o._ix[p] != null) ? o._ix[p] : tr[p];
        if (!(a.dur > 0)) { o._ix = Object.assign({}, o._ix, { [p]: val }); } else RT.anims.push({ t0: t, dur: a.dur, ease: TR.EASES.smooth, step: k => { o._ix = Object.assign({}, o._ix, { [p]: from + (val - from) * k }); } });
        return `set ${o.name}`;
      }
    }
    return null;
  }
  /** A drag of a rig's bone: the bone to pull (the one pressed on, the nearest to where the drag started, or a set one), kept in st.bone. */
  function rigBone(a, r, st) {
    if (a.type !== 'drag') return false; const o = objByKey(a.layer || r.when.layer); if (!o || o.type !== 'rig' || !o.bones.length || a.bone === '') return false;
    if (st.bone && st.boneRig === o) return true; let b = a.bone && a.bone !== '*' ? SB.rig.boneById(o, a.bone) : null;
    if (!b) { const hit = st.ev && st.ev.hit; if (hit && hit.bind && hit.bind.rig === o.id && hit.bind.bone) b = SB.rig.boneById(o, hit.bind.bone); }
    if (!b) { const P0 = (st.ev && st.ev.P0) || RT.pointer, L = SB.xf.world(o).inverse().transformPoint(U.pt(P0.x, P0.y)), Q = SB.rig.poseAt(o, S.time); let bd = Infinity;
      for (const x of o.bones) { const q = Q[x.id], d = Math.hypot(q.tx - L.x, q.ty - L.y); if (d < bd) { bd = d; b = x; } } }
    if (!b) return false; st.bone = b; st.boneRig = o; st.tgt = null; return true;
  }
  /** Continuous actions of active rules: follow the pointer, drag. */
  function continuous() {
    for (const [id, st] of RT.active) {
      const r = ruleById(id); if (!r || r.off) { RT.active.delete(id); continue; }
      for (const a of r.acts) {
        if (!CONTINUOUS.has(a.type) || !RT.pointer) continue; const P = RT.pointer, k = 1 - U.clamp(a.smooth ?? (a.type === 'drag' ? 0 : 0.25), 0, 0.95);
        if (a.type === 'follow' && a.ctrl != null) {
          const ctl = objByKey(a.ctrl); if (!ctl || !SB.controls) continue; const C = SB.controls; let u, v; const area = r.when.layer && objByKey(r.when.layer), b = area && SB.scene.box(area);
          if (b) { u = (P.x - (b.aabb.x0 + b.aabb.x1) / 2) / Math.max(1, (b.aabb.x1 - b.aabb.x0) / 2); v = (P.y - (b.aabb.y0 + b.aabb.y1) / 2) / Math.max(1, (b.aabb.y1 - b.aabb.y0) / 2); } else { u = P.x / S.project.w * 2 - 1; v = P.y / S.project.h * 2 - 1; }
          u = U.clamp(u, -1, 1); v = U.clamp(v, -1, 1); const mo = C.motion(ctl); if (mo === 'x') v = 0; if (mo === 'y') u = 0;
          const tx = (ctl.rx ?? ctl.x) + u * C.RX(ctl), ty = (ctl.ry ?? ctl.y) + v * C.RY(ctl), cur = ctl._live || { x: tx, y: ty }; ctl._live = { x: cur.x + (tx - cur.x) * k, y: cur.y + (ty - cur.y) * k }; ctl._ixLive = true;
        } else if (rigBone(a, r, st)) {
          const o = objByKey(a.layer || r.when.layer), b = st.bone, M = SB.xf.world(o).inverse(), L = M.transformPoint(U.pt(P.x, P.y)), cur = st.tgt || L;
          st.tgt = { x: cur.x + (L.x - cur.x) * k, y: cur.y + (L.y - cur.y) * k }; delete o._ixB;
          o._ixB = SB.rig.solveIK(o, b.id, st.tgt, SB.rig.ikChain(o, b), false); for (const id in o._ixB) { o._ixB[id.slice(5)] = o._ixB[id]; delete o._ixB[id]; }
        } else {
          const o = objByKey(a.layer || r.when.layer); if (!o) continue; const PI = SB.xf.parentWorld(o).inverse(), L = PI.transformPoint(U.pt(P.x, P.y)), tr = TR.transform(o, tree.localTime(o));
          if (!st.grab || st.grab.o !== o) { const P0 = a.type === 'drag' && st.ev && st.ev.P0 ? st.ev.P0 : P, L0 = PI.transformPoint(U.pt(P0.x, P0.y)); st.grab = { o, dx: a.type === 'drag' ? tr.x - L0.x : 0, dy: a.type === 'drag' ? tr.y - L0.y : 0 }; }
          const ax = a.axis || 'xy', cur = o._ix || {}, tx = L.x + st.grab.dx, ty = L.y + st.grab.dy, nx = ax === 'y' ? tr.x : (cur.x ?? tr.x) + (tx - (cur.x ?? tr.x)) * k, ny = ax === 'x' ? tr.y : (cur.y ?? tr.y) + (ty - (cur.y ?? tr.y)) * k;
          o._ix = Object.assign({}, o._ix, { x: nx, y: ny });
        }
      }
    }
  }
  /** Pointer events from the stage (js/tools/base.js) while the preview plays. */
  // ---------- interactive controllers (o.ixGrab): shown while it plays, and the viewer drags the knob to drive what it drives
  const grabbable = () => tree.all().filter(c => c.type === 'null' && c.ixGrab && !tree.hidden(c) && tree.inRange(c) && TR.now(c, 'ctrl:on') !== false);
  /** The interactive controller whose knob (or box) is under P: { c, dx, dy } (the grab offset in its parent's space). */
  function ctlAt(P) {
    const k = SB.view ? SB.view.k() : 1, C = SB.controls, X = SB.xf;
    for (const c of grabbable().reverse()) {
      const tr = TR.transform(c, tree.localTime(c)), q = X.world(c).transformPoint(U.pt(tr.ax, tr.ay));
      const l = X.parentWorld(c).inverse().transformPoint(U.pt(P.x, P.y));
      if (Math.hypot(q.x - P.x, q.y - P.y) * k < 22) return { c, dx: tr.x - l.x, dy: tr.y - l.y };
      const t = C.motion(c), rx = c.rx ?? c.x, ry = c.ry ?? c.y, pad = 14 / k; if (t === 'free') continue;
      if (Math.abs(l.x - rx) <= C.RX(c) + pad && Math.abs(l.y - ry) <= C.RY(c) + pad && (t !== 'x' || Math.abs(l.y - ry) <= pad) && (t !== 'y' || Math.abs(l.x - rx) <= pad)) return { c, dx: 0, dy: 0 }; // a press on its box: the knob jumps there
    }
    return null;
  }
  function grabMove(P) {
    const g = RT.grab, c = g.c, l = SB.xf.parentWorld(c).inverse().transformPoint(U.pt(P.x, P.y)); c._live = { x: l.x + g.dx, y: l.y + g.dy }; c._ixLive = true; SB.bump();
  }
  /** Draw the interactive controllers on the stage while it plays (ctx in project space): their box, line or circle, and the knob. */
  function drawCtrls(ctx) {
    if (!S.ixPlay) return; const C = SB.controls, X = SB.xf; if (!C) return;
    for (const c of grabbable()) {
      const col = c.color || '#E8730C', t = C.motion(c), PW = X.parentWorld(c), rx = c.rx ?? c.x, ry = c.ry ?? c.y, W = C.RX(c), H = C.RY(c), sk = 1 / Math.max(0.05, U.matScale(ctx.getTransform()) / (window.devicePixelRatio || 1));
      ctx.save(); ctx.setTransform(ctx.getTransform().multiply(PW)); ctx.lineWidth = 2.5 * sk; ctx.strokeStyle = col; ctx.globalAlpha = 0.75; ctx.lineCap = 'round';
      if (c.ixLine !== false) { ctx.beginPath();
      if (t === 'x') { ctx.moveTo(rx - W, ry); ctx.lineTo(rx + W, ry); } else if (t === 'y') { ctx.moveTo(rx, ry - H); ctx.lineTo(rx, ry + H); }
      else if (t !== 'free') { if (C.isCircle(c)) ctx.ellipse(rx, ry, W, H, 0, 0, Math.PI * 2); else { ctx.roundRect(rx - W, ry - H, W * 2, H * 2, 8 * sk); } }
      ctx.stroke();
      if (c.ctype === 'custom' && c.points) for (const p of c.points) { ctx.beginPath(); ctx.arc(rx + p.u * W, ry + p.v * H, 3.5 * sk, 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill(); } }
      if (c.ixKnob === false) { ctx.restore(); continue; } // its knob is hidden (still draggable)
      const tr = TR.transform(c, tree.localTime(c)); ctx.globalAlpha = 1; ctx.beginPath(); ctx.arc(tr.x, tr.y, 11 * sk, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 3 * sk; ctx.stroke();
      ctx.beginPath(); ctx.arc(tr.x, tr.y, 4.5 * sk, 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill();
      ctx.restore();
    }
  }
  function pointer(kind, P, e) {
    const onStage = P.x > -1e5; if (onStage) RT.pointer = P;
    if (kind === 'down' && onStage) { const g = ctlAt(P); if (g) { RT.grab = g; grabMove(P); return; } }
    if (RT.grab) { if (kind === 'move' && onStage) grabMove(P); if (kind === 'up') RT.grab = null; const st = U.$('#stage'); if (st) st.style.cursor = RT.grab ? 'grabbing' : 'grab'; return; }
    const hit = onStage ? SB.scene.hit(P) : null;
    if (kind === 'down') { RT.down = { P, hit, t: now(), moved: false }; fireEvent('down', { hit }); }
    if (kind === 'move') {
      if (RT.down && !RT.down.moved && Math.hypot(P.x - RT.down.P.x, P.y - RT.down.P.y) * (SB.view ? SB.view.k() : 1) > 4) { RT.down.moved = true; fireEvent('drag', { hit: RT.down.hit, P0: RT.down.P }); }
      const inStage = onStage && P.x >= 0 && P.y >= 0 && P.x <= S.project.w && P.y <= S.project.h;
      const now2 = new Set([...(inStage ? ['@stage'] : []), ...(inStage && hit ? [hit, ...tree.ancestors(hit)].map(keyOf) : [])]);
      const left = [...RT.hover].filter(k => !now2.has(k)), came = [...now2].filter(k => !RT.hover.has(k)); RT.hover = now2;
      for (const k of left) { fireEvent('leave', { hit, key: k, stage: k === '@stage' }); model().rules.forEach(r => { if (r.when.type === 'hover' && (r.when.layer || '@stage') === k) RT.active.delete(r.id); }); }
      for (const k of came) fireEvent('hover', { hit, key: k, stage: k === '@stage' });
      if (inStage) fireEvent('move', { hit });
    }
    if (kind === 'up') {
      const d = RT.down; RT.down = null; fireEvent('up', { hit });
      if (d && !d.moved) fireEvent('click', { hit: d.hit || hit });
      model().rules.forEach(r => { if (r.when.type === 'down' || r.when.type === 'drag') RT.active.delete(r.id); });
    }
    const clicky = hit && model().rules.some(r => !r.off && ['click', 'down', 'drag'].includes(r.when.type) && r.when.layer && hitsKey(hit, r.when.layer));
    const st = U.$('#stage'); if (st) st.style.cursor = onStage && ctlAt(P) ? 'grab' : clicky ? (model().rules.some(r => r.when.type === 'drag' && hitsKey(hit, r.when.layer)) ? 'grab' : 'pointer') : 'default';
    void e;
  }
  addEventListener('keydown', e => {
    if (!S.ixPlay || (e.target.closest && e.target.closest('input,textarea'))) return;
    if (e.key === 'Escape' && !SB.player) { e.preventDefault(); e.stopPropagation(); return stop(); }
    const k = e.code === 'Space' ? 'Space' : e.key.length === 1 ? e.key.toUpperCase() : e.key; if (!e.repeat) { RT.keys.add(k.toUpperCase()); fireEvent('key', { key: k }); }
    if (!e.ctrlKey && !e.metaKey) { e.preventDefault(); e.stopPropagation(); } // the app's shortcuts wait until you stop
  }, true);
  addEventListener('keyup', e => { const k = e.code === 'Space' ? 'Space' : e.key.length === 1 ? e.key.toUpperCase() : e.key; RT.keys.delete(k.toUpperCase()); });

  // ---------- screen transitions: a picture of the screen you leave, over the one you go to
  function startTransition(a) {
    const type = a.trans || 'fade'; endTransition(); if (type === 'cut') return;
    const st = U.$('#stage'), doc = U.$('#stageDoc'), wrap = U.$('#stageWrap'); if (!st || !doc || !wrap) return;
    const wr = wrap.getBoundingClientRect(), r = doc.getBoundingClientRect(), dpr = st.width / (wr.width || 1), sx = (r.left - wr.left) * dpr, sy = (r.top - wr.top) * dpr, sw = Math.max(1, Math.round(r.width * dpr)), sh = Math.max(1, Math.round(r.height * dpr));
    const snap = h('canvas', { width: sw, height: sh }); try { snap.getContext('2d').drawImage(st, sx, sy, sw, sh, 0, 0, sw, sh); } catch (e) { return; }
    const cv = h('canvas.ix-trans', { width: sw, height: sh }); wrap.appendChild(cv);
    RT.trans = { a, type, snap, cv, t0: now(), dur: Math.max(50, a.dur ?? 500), ease: TR.EASES[a.ease] || TR.EASES.smooth, rect: { left: r.left - wr.left, top: r.top - wr.top, w: r.width, h: r.height } };
    if (type === 'break' && SB.breakFx) RT.trans.pieces = SB.breakFx.pieces(sw, sh, a.amt ?? 0.5, a.dir || 'center', U.seedOf ? U.seedOf(a.screen || 'x') : 7);
  }
  function drawTransition(t) {
    const T = RT.trans; if (!T) return; const u = U.clamp((t - T.t0) / T.dur, 0, 1), k = T.ease.fn(u), c = T.cv.getContext('2d'), w = T.cv.width, hh = T.cv.height, d = T.a.dir || 'left';
    Object.assign(T.cv.style, { left: T.rect.left + 'px', top: T.rect.top + 'px', width: T.rect.w + 'px', height: T.rect.h + 'px' });
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, w, hh); c.globalAlpha = 1;
    const dx = d === 'left' ? -1 : d === 'right' ? 1 : 0, dy = d === 'up' ? -1 : d === 'down' ? 1 : 0;
    if (T.type === 'fade') { c.globalAlpha = 1 - k; c.drawImage(T.snap, 0, 0); }
    else if (T.type === 'slide') { c.drawImage(T.snap, dx * w * k, dy * hh * k); }
    else if (T.type === 'wipe') { c.drawImage(T.snap, 0, 0); c.globalCompositeOperation = 'destination-out'; c.beginPath(); if (d === 'center') c.arc(w / 2, hh / 2, Math.hypot(w, hh) / 2 * k, 0, Math.PI * 2); else if (d === 'left') c.rect(w * (1 - k), 0, w * k, hh); else if (d === 'right') c.rect(0, 0, w * k, hh); else if (d === 'up') c.rect(0, hh * (1 - k), w, hh * k); else c.rect(0, 0, w, hh * k); c.fill(); c.globalCompositeOperation = 'source-over'; }
    else if (T.type === 'zoom') { const s = 1 + k * 0.6; c.globalAlpha = 1 - k; c.translate(w / 2, hh / 2); c.scale(s, s); c.drawImage(T.snap, -w / 2, -hh / 2); }
    else if (T.type === 'break' && SB.breakFx) SB.breakFx.draw(c, T.snap, T.pieces, u, T.a.amt ?? 0.5, d);
    if (u >= 1) endTransition();
  }
  function endTransition() { if (RT.trans) { RT.trans.cv.remove(); RT.trans = null; } }

  // ================= export: the Rive file takes what Rive can do
  /** The rules as Rive cards and arrows (v1 shape): play rules with a pointer, key, end or time trigger; mouse follow of controllers. */
  function config() {
    const m = model(), lib = library(), states = [], links = [], follow = [], skipped = new Set();
    const st = k => { let s = states.find(x => x.anim === k); if (!s && libOf(lib, k)) states.push(s = { id: 'st' + states.length, anim: k, loop: true, speed: 1 }); return s; };
    const start = st(m.start || (lib[0] || {}).key);
    for (const r of m.rules) {
      if (r.off) continue; const w = r.when, from = r.conds.find(c => c.type === 'anim' && !c.not), other = r.conds.filter(c => c !== from);
      for (const a of r.acts) {
        if (a.type === 'follow' && a.ctrl && (w.type === 'move' || w.type === 'tick') && !r.conds.length) { follow.push({ id: r.id, ctrl: a.ctrl, area: w.layer || '', smooth: a.smooth ?? 0.25 }); continue; }
        if (a.type !== 'play' && a.type !== 'screen') { skipped.add(ACT[a.type][0]); continue; }
        const to = a.type === 'play' ? st(a.anim) : st((firstOf(lib, Sc.find(a.screen)) || {}).key); if (!to) continue;
        const type = { click: 'click', down: 'click', hover: 'hover', leave: 'leave', key: 'key', end: 'end', after: 'timer' }[w.type]; if (!type) { skipped.add(`WHEN ${WHEN[w.type][0]}`); continue; }
        if (other.length) skipped.add('Some conditions');
        const fromSt = from ? st(from.anim) : w.type === 'end' || w.type === 'after' ? (w.anim ? st(w.anim) : null) : null;
        links.push({ id: 'ln' + links.length, from: fromSt ? fromSt.id : 'any', to: to.id, when: { type, layer: w.layer || '', key: w.key, after: w.after }, mix: a.type === 'play' ? a.mix || 0 : 0, ease: a.ease });
        if (a.loop === false) to.loop = false;
      }
    }
    // interactive controllers: in Rive the knob goes where the pointer is over its box (cells of its grid, like mouse follow)
    for (const c of tree.all()) if (c.type === 'null' && c.ixGrab && !follow.some(f => f.ctrl === keyOf(c))) {
      const C = SB.controls, PW = SB.xf.parentWorld(c), rx = c.rx ?? c.x, ry = c.ry ?? c.y, t = C.motion(c), W = t === 'y' ? 12 : C.RX(c), H = t === 'x' ? 12 : C.RY(c), b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
      for (const [x, y] of [[rx - W, ry - H], [rx + W, ry - H], [rx + W, ry + H], [rx - W, ry + H]]) { const q = PW.transformPoint(U.pt(x, y)); U.growBox(b, q.x, q.y); }
      follow.push({ id: 'grab' + c.id, ctrl: keyOf(c), area: '', box: b, smooth: 0, grab: true });
    }
    return { start: start && start.id, states, links, follow, skipped: [...skipped] };
  }
  function summary() { const m = model(); return `${m.rules.length} rule${m.rules.length === 1 ? '' : 's'}.`; }

  SB.panel('ixpanel', panel);
  SB.on('commit', () => { if (S.ixMode) SB.invalidate('ixpanel'); });
  SB.on('restore', () => { if (S.ixMode) SB.invalidate('ixpanel', 'inspector'); });
  SB.ix = { setMode, play, stop, pointer, inspector, library, model, config, summary, keyOf, refsTo, webOk, fire: fireEvent, open: () => setMode(true), RT, drawCtrls };
  SB.interact = SB.ix; // the export dialog's "Interactions…" button
})(window.SB);
