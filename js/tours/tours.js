/* Interactive tutorials ("tours"). File › Tutorials… opens a gallery; starting one makes a practice screen and a small
   guide character (drag it anywhere) walks you through making a little animation, one short step at a time.
   While a step points at something, the rest of the app dims and can't be clicked (and keys other than the ones the step
   asks for do nothing), so you can't get lost. A mouse picture shows what to do (click, right-click, drag, double-click,
   scroll), dashed shapes on the stage show where to draw, and the guide can speak. The guide teaches, it does not do the step for you:
   "Show me" plays the pointing again, bigger, with a little more help; only after you have tried for a while (25 seconds, or
   Show me twice) a small "Do it for me" link shows up.

   ADDING A TUTORIAL: write js/tours/<name>.js calling SB.tours.add({...}) and add its <script> after this file in index.html.
     id, title, blurb (its card), desc (the details pane), minutes, level: 'Easy' | 'Medium' | 'Harder', learn: [...],
     preview(ctx, t, w, h)   draws the finished animation at time t (seconds): the card's looping preview
     setup(T)                makes what it starts with on its practice screen (T.W, T.H: the screen size)
     steps: [step, …], outro
   A step (all optional but say):
     say       what the guide says: short (a string, or (T) => string)
     key       a shortcut it teaches (an action id from js/ui/keys.js: 'tBrush', 'play', 'key'…), shown as key caps.
               The task's check decides: clicking the tool or button counts as much as the key (the step must show a clickable
               button: show: ..., and tools of a group, like Fill brush or Points, are picked from the group's list)
     show      what to point at (a ring): a CSS selector, an element, or (T) => element. It stays clickable.
     allow     more places that stay clickable: selectors / functions, or 'stage'
     mouse     a mouse picture: 'left' | 'right' | 'double' | 'drag' | 'scroll', at `at` (a stage point [x, y], or a target)
               or at the shown element
     ghost     dashed guides on the stage (practice-screen pixels): { circle: [x, y, r] } { ellipse: [x, y, rx, ry] }
               { line: [x0, y0, x1, y1] } { poly: [x, y, …] } { dot: [x, y], label } { arrow: [x0, y0, x1, y1] }
     task      { check(T) → true when done, hint (shown by Show me), doIt(T) (what "Do it for me" does) }
     practice  true: a Task, the learner tries it alone (everything works; Hint and Done show in the bubble)
     free      true: nothing dims or blocks (the step is about playing around)
     keys      more key combos allowed in this step (e.g. ['Shift'])
     keyLabel  the words before the key caps (default "Click it, or press" when the step shows something to click, else "Press")
     tip       true: a tips card
   T: { W, H, o(name) (a layer of the practice screen), data: {}, pressed(id), near(o, [x, y], tol) → the parts of o's
   shown frame whose middle is that close to that stage point, timeAt(t) (the playhead is near t) }.

   THE GUIDE CHARACTER: set SB.tours.GUIDE.moods to your pictures (one per mood: talk, point, cheer, think).
   Without pictures a placeholder shows.
   Drawing steps (mouse 'drag' on the stage, or draw: true) wait until you have drawn a few seconds and stopped, then show Next;
   other steps go on by themselves a moment after they are done. minTime (ms) changes how long a step waits at least.
   Your own tutorials (no code): Settings › Advanced › Tutorial maker (js/tours/maker.js). */
'use strict';
(function (SB) {
  const U = SB.util, S = SB.state, h = U.h, W = SB.w, tree = SB.tree;
  let run = null;
  const TS = SB.tours = {
    GUIDE: { name: 'Guide', size: 96, moods: { talk: null, point: null, cheer: null, think: null } }, // e.g. moods.talk = 'assets/guide/talk.png'
    list: [],
    add(def) { const i = TS.list.findIndex(x => x.id === def.id); if (i >= 0) TS.list[i] = def; else TS.list.push(def); return def; },
  };
  Object.defineProperty(TS, 'running', { get: () => run }); // the tour running now (or null)
  const LEVEL_DOTS = { Easy: 1, Medium: 2, Harder: 3 };
  const PRAISE = ['Nice!', 'You got it!', 'Great!', 'Perfect!', 'Yes!', 'Well done!'];
  const val = (v, T) => typeof v === 'function' ? v(T || (run && run.T)) : v;
  /* the few rules Show me and Do it for me need (this file only) */
  const style = document.createElement('style'); style.textContent = `
    .tg-doitrow { margin-top: 8px; text-align: right; } .tg-doitrow[hidden], .tg-doit[hidden] { display: none; }
    .tg-bubble a.tg-doit { font-size: 12px; color: var(--ink-2); text-decoration: underline dotted; text-underline-offset: 3px; cursor: pointer; } .tg-bubble a.tg-doit:hover { color: var(--brand); }
    .tour-ring.flash { animation: tg-flash .7s ease-in-out 4; } @keyframes tg-flash { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.12); box-shadow: 0 0 0 14px color-mix(in srgb, var(--brand) 30%, transparent); } }
    .tour-mouse.emph svg { animation: tg-mbig .8s ease-in-out 4; transform-origin: 0 0; } @keyframes tg-mbig { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.7); } }
    @media (prefers-reduced-motion: reduce) { .tour-ring.flash, .tour-mouse.emph svg { animation: none; } }`;
  document.head.appendChild(style);

  // ================= the gallery
  function open() {
    if (!TS.list.length) return SB.toast('No tutorials yet.');
    let cur = TS.list.find(d => !TS.list.some(x => x.replaces === d.id)) || TS.list[0]; const raf = { id: 0 }, cards = [], side = h('div.tg-side'), draws = [];
    const preview = (def, cv) => { const c = cv.getContext('2d'); return t => { c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, cv.width, cv.height); c.save(); try { def.preview && def.preview(c, t, cv.width, cv.height); } catch (e) { console.error(e); } c.restore(); }; };
    const shown = TS.list.filter(d => !TS.list.some(x => x.replaces === d.id)); // your own copy of a tutorial can stand in for it
    const groups = TS.groupsOf(shown); let pick = TS._group && groups.includes(TS._group) ? TS._group : null;
    const cardOf = def => {
      let thumb; if (def.cover) thumb = h('img.tg-cover', { src: def.cover, alt: '' }); else { const cv = h('canvas', { width: 320, height: 200 }); draws.push(preview(def, cv)); thumb = cv; }
      const card = h('button.tg-card' + (def === cur ? '.on' : ''), { type: 'button', onclick: () => { cur = def; cards.forEach(c => c.classList.toggle('on', c._def === def)); fillSide(); }, ondblclick: () => go(def) },
        h('div.tg-thumb', null, thumb), h('div.tg-meta', null, h('b', null, def.title, def.mine ? h('span.tg-mine', null, 'Mine') : null), h('span.tg-sub', null, `${def.minutes || 3} min · ${def.level || 'Easy'}`)), def.blurb ? h('span.tg-blurb', null, def.blurb) : null);
      card._def = def; cards.push(card); return card;
    };
    const grid = h('div.tg-grid'), chips = h('div.tg-groups', { role: 'tablist' });
    function fillGrid() { // all: a heading per group; one group: just its cards
      cards.length = 0; draws.length = 0;
      grid.replaceChildren(...(pick ? [pick] : groups).flatMap(g => { const list = shown.filter(d => TS.groupOf(d) === g); return list.length ? [groups.length > 1 && !pick ? h('h4.tg-gh', null, g) : null, ...list.map(cardOf)].filter(Boolean) : []; }));
      chips.replaceChildren(...[null, ...groups].map(g => h('button' + (g === pick ? '.on' : ''), { type: 'button', role: 'tab', 'aria-selected': String(g === pick), onclick: () => { pick = g; TS._group = g; fillGrid(); } }, g || 'All')));
      chips.hidden = groups.length < 2;
    }
    fillGrid();
    function fillSide() {
      const lv = cur.level || 'Easy', dots = h('span.tg-dots', { title: lv }, [1, 2, 3].map(i => h('i' + (i <= (LEVEL_DOTS[lv] || 1) ? '.on' : ''))));
      side.replaceChildren(...[h('h3', null, cur.title), h('p', null, cur.desc || cur.blurb || ''),
        h('div.tg-facts', null, h('div', null, h('span', null, 'Length'), h('b', null, `About ${cur.minutes || 3} minutes`)), h('div', null, h('span', null, 'Difficulty'), h('b', null, dots, ' ', lv)), h('div', null, h('span', null, 'Steps'), h('b', null, String(cur.steps.length)))),
        cur.learn && cur.learn.length ? [h('div.tg-learn-t', null, 'You will learn'), h('ul.tg-learn', null, cur.learn.map(x => h('li', null, x)))] : null,
        h('div.sheet-actions', null, W.btn('Start', () => go(cur), { cls: 'primary', icon: 'play' }))].flat().filter(Boolean));
    }
    const go = def => { dlg.close(); start(def.id); };
    const t0 = performance.now(), loop = () => { const t = (performance.now() - t0) / 1000; draws.forEach(d => d(t)); raf.id = requestAnimationFrame(loop); };
    fillSide();
    const dlg = SB.dialog.sheet([h('h2', null, 'Tutorials'), h('p.sub', null, 'Short hands-on lessons with a guide. Each one makes its own practice screen, so your project stays as it is.'),
      chips, h('div.tg', null, grid, side)], { size: 'wide', onClose: () => cancelAnimationFrame(raf.id) });
    loop();
  }

  // ================= running a tour
  /** Start tutorial id (from step `from`, counting from 0: the tutorial maker's "Test from here"). */
  function start(id, from = 0, opt = {}) {
    const def = opt.def || TS.list.find(x => x.id === id); if (!def) return; if (run) stop(true);
    if (S.ixMode && SB.ix) SB.ix.setMode(false); if (S.playing) SB.time.pause();
    let scr = null;
    if (!opt.edit) { // a practice screen of its own (the editor works on the screen you are on)
      if (S.autoKey) { S.autoKey = false; SB.invalidate('transport'); }
      SB.screens.ensure(); scr = SB.screens.add('same'); scr.name = 'Tutorial: ' + def.title; scr.proj.duration = def.duration || 4; scr.proj.bg = '#FFFFFF';
      SB.board.focus(scr, true); SB.time.set(0); SB.tool.set('select');
    }
    const T = { def, screen: scr, data: {}, keys: new Set(), get W() { return S.project.w; }, get H() { return S.project.h; },
      o: name => tree.all().find(x => x.name === name) || null,
      pressed: k => (SB.keys.ACT && SB.keys.ACT[k] ? SB.keys.binding(k) || [] : [k]).some(c => T.keys.has(c)),
      timeAt: (t, tol = 0.25) => Math.abs(S.time - t) <= tol,
      /** Parts of o's shown frame whose middle is within tol of stage point p. */
      near(o, p, tol = 90) { if (!o || !o.frames) return []; const fr = SB.frames.current(o), M = SB.xf.world(o); return (fr ? fr.strokes : []).filter(s => { if (s.er) return false; const b = SB.paths.bounds([s]); if (!U.boxOk(b)) return false; const q = M.transformPoint(U.pt((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2)); return Math.hypot(q.x - p[0], q.y - p[1]) <= tol; }); },
    };
    run = { def, T, i: -1, done: false, t0: 0, timer: 0, edit: !!opt.edit, onMove: opt.onMove, onStep: opt.onStep, onAt: opt.onAt };
    if (!opt.edit) { try { def.setup && def.setup(T); } catch (e) { console.error('tour setup', e); } tree.reindex(); SB.commit(); SB.view.reset(); SB.invalidate(); requestAnimationFrame(() => SB.view.reset()); } // the practice screen fills the stage
    buildGuide(); if (from > 0) run.i = Math.min(from, def.steps.length) - 1; next();
  }
  function stop(quiet) {
    if (!run) return; clearInterval(run.timer);
    if (run.el) run.el.remove(); shade(null); mouse(null); if (annoEl) annoEl.innerHTML = ''; run = null; SB.dirty();
    if (!quiet) SB.toast('Tutorial closed. Its practice screen stays: delete it on the board (zoom out) when you are done.');
  }
  function next() {
    if (!run) return; if (run.edit && run.i >= run.def.steps.length - 1) return; run.i++; run.T.keys.clear(); run.done = false; run.didIt = false; run.t0 = performance.now(); run.hinted = false; run.keyNudged = false; run.shows = 0; run.emph = 0; run.doitEl = null;
    const st = run.def.steps[run.i]; if (!st) return finish();
    if (!run.edit) { try { st.enter && st.enter(run.T); } catch (e) { console.error(e); } }
    placeFor(st); say(st, null, moodOf(st)); SB.dirty(); if (run.onStep) run.onStep(run.i);
  }
  const moodOf = st => st.mood || (st.tip ? 'idea' : st.task ? 'point' : 'talk');
  /** A step can place the guide (pos: its corner as a share of the window) and the bubble's side; else it goes where you last put it. */
  function placeFor(st) {
    if (!run || !run.place) return; run.side = st.bubble || null;
    if (st.pos) { run.dragged = true; run.place(st.pos.x * innerWidth, st.pos.y * innerHeight); }
    else if (run.home) { run.dragged = run.userDragged; run.place(run.home[0], run.home[1]); }
  }
  /** The editor: show step i (and keep showing it as it changes). */
  function show(i, def) { if (!run) return; if (def) run.def = def; run.i = Math.max(-1, Math.min(i, run.def.steps.length - 1) - 1); next(); }
  function back() { if (!run || run.i <= 0) return; run.i -= 2; next(); }
  const isEdit = () => !!(run && run.edit);
  /** Do the step for the learner (when it can), then go on. Behind the "Do it for me" link, which shows after a while; tests call it too. */
  function skip() { if (!run) return; const st = run.def.steps[run.i]; if (st && st.task && st.task.doIt) { try { run.didIt = true; st.task.doIt(run.T); SB.commit(); } catch (e) { console.error(e); } } next(); }
  function tick() {
    if (!run || run.done || run.edit) return; const st = run.def.steps[run.i]; if (!st || !st.task) return;
    if (run.doitEl && run.doitEl.hidden && helpOpen()) run.doitEl.hidden = false; /* tried a while: the small "Do it for me" link shows */
    let ok = false; try { ok = !!st.task.check(run.T); } catch (e) { ok = false; }
    // a shortcut step also counts the button that was clicked (the ring shows it), but says the key once
    if (ok && st.key && !run.T.pressed(st.key) && !run.didIt && !run.keyNudged) { run.keyNudged = true; SB.toast(`Next time try the key: ${keyText(st.key)}`); }
    const age = performance.now() - run.t0, draws = isDraw(st);
    if (ok && !run.didIt) {
      if (age < (st.minTime ?? (draws ? 4000 : 900))) return; // give it a moment: never jump on in the middle of what you are doing
      if (draws && (SB.tool.drag || performance.now() - lastEdit < 1500)) return; // still drawing: wait until you stop
    }
    if (ok) {
      run.done = true; const p = PRAISE[Math.floor(Math.random() * PRAISE.length)];
      if (draws && !run.didIt) { say(st, p + ' Keep drawing if you like, then press Next.', 'cheer', true); return; } // drawing: you decide when it is finished
      say(st, p, 'cheer', true); setTimeout(() => { if (run && run.done && run.def.steps[run.i] === st) next(); }, 1500); return;
    }
    if (!st.practice && !run.hinted && performance.now() - run.t0 > (st.task.wait || 20000) && st.task.hint) { run.hinted = true; say(st, val(st.task.hint), 'think'); }
  }
  const hintOf = st => val(st.hint) || (st.task && val(st.task.hint)) || '';
  /** "Do it for me" shows after you have tried for a while: 25 seconds on the step, or Show me twice. */
  const helpOpen = () => !!run && (run.shows >= 2 || performance.now() - run.t0 > 25000);
  /** What Show me says when the step has no hint of its own: it reads the step's pointing. */
  const pointText = st => {
    const bits = []; if (st.show) bits.push('the pink ring'); if (st.mouse) bits.push('the mouse picture'); if (st.ghost) bits.push('the dashed shapes');
    if (!bits.length) return 'Take a good look at the screen: the answer is in what the guide said.';
    return 'Look at ' + (bits.length > 1 ? bits.slice(0, -1).join(', ') + ' and ' + bits[bits.length - 1] : bits[0]) + '. I made them bigger for you.';
  };
  /** Show me: play the pointing again, bigger (the mouse picture, the ring, the dashed guides) and say a little more. It does not do the step. */
  function showMe(st) {
    if (!run) return; run.shows = (run.shows || 0) + 1; run.emph = performance.now() + 4500;
    const again = (el, cls, ms) => { if (!el || el.hidden) return; el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); setTimeout(() => el.classList.remove(cls), ms); };
    if (mouseEl) { if (mouseEl._anim) { try { mouseEl._anim.currentTime = 0; mouseEl._anim.play(); } catch (e) {} } again(mouseEl, 'emph', 3200); }
    again(ringEl, 'flash', 2800);
    const hint = hintOf(st), extra = [hint || pointText(st), hint && (st.show || st.mouse || st.ghost) ? pointText(st) : '', run.shows >= 2 ? 'Take your time. If you are really stuck, the “Do it for me” link is below.' : ''].filter(Boolean).join(' ');
    say(st, extra, 'point'); SB.dirty();
  }
  /** A step where you draw or drag on the stage (it waits for you to finish). */
  const isDraw = st => st.draw || (st.mouse === 'drag' && (st.allow || []).includes('stage'));
  let lastEdit = 0; SB.on('commit', () => { lastEdit = performance.now(); });
  SB.on('commit', () => tick()); SB.on('time', () => tick()); SB.on('select', () => tick());
  const keyText = id => (SB.keys.binding(id) || []).map(c => SB.keys.pretty ? SB.keys.pretty(c) : c).join(' or ') || '?';
  const keyCaps = id => h('span.tg-keys', null, (SB.keys.binding(id) || []).slice(0, 2).map((c, i) => [i ? h('span.tg-or', null, 'or') : null, ...String(SB.keys.pretty ? SB.keys.pretty(c) : c).split('+').map(k => h('kbd', null, k))]).flat());

  // ---------- keys: only the ones the step asks for (and undo) work while a step points at something
  const ALWAYS = new Set(['Ctrl+Z', 'Ctrl+Shift+Z', 'Ctrl+Y', 'Escape', 'Enter']);
  addEventListener('keydown', e => {
    if (!run || run.edit) return; const c = SB.keys.comboOf(e); if (c) run.T.keys.add(c);
    const st = run.def.steps[run.i]; if (!st || st.free || !c || ALWAYS.has(c) || (e.target.closest && e.target.closest('input,textarea,select,.tg-bubble'))) return;
    const bind = k => SB.keys.ACT && SB.keys.ACT[k] ? SB.keys.binding(k) || [] : [], ok = (st.key && bind(st.key).includes(c)) || (st.keys || []).some(k => k === c || c.split('+').pop() === k || bind(k).includes(c));
    if (!ok && st.key === 'play' && e.key === ' ') return; // Space plays on key up
    if (!ok) { e.preventDefault(); e.stopImmediatePropagation(); if (run.pic) { run.pic.classList.remove('shake'); void run.pic.offsetWidth; run.pic.classList.add('shake'); } }
  }, true);
  addEventListener('pointerdown', e => {
    if (!run || run.edit || run.done || e.button === 2 || e.pointerType === 'touch') return; const st = run.def.steps[run.i]; if (!st || st.free || !(st.rightOnly ?? st.mouse === 'right')) return; // touch: a long press is the right-click, so it goes through
    if (e.target.closest && e.target.closest('.menu, .tour-guide, .tg-bubble, .modal')) return; // the menu itself, the guide, a dialog
    e.preventDefault(); e.stopImmediatePropagation(); if (run.pic) { run.pic.classList.remove('shake'); void run.pic.offsetWidth; run.pic.classList.add('shake'); }
    SB.toast('This step is a right-click: press the right mouse button (or hold a finger) on it.');
  }, true);
  addEventListener('keyup', e => { if (!run || run.edit || e.key !== ' ') return; const st = run.def.steps[run.i]; if (st && !st.free && st.key !== 'play' && !(e.target.closest && e.target.closest('input,textarea'))) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);

  // ================= the guide: a character you can drag, with a speech bubble
  function buildGuide() {
    const G = TS.GUIDE, el = h('div.tour-guide', { role: 'dialog', 'aria-label': 'Tutorial guide' });
    const pic = h('div.tg-char', { title: 'Drag me anywhere', style: { width: G.size + 'px', height: G.size + 'px' } });
    const bubble = h('div.tg-bubble'); el.append(bubble, pic); document.body.appendChild(el); run.el = el; run.pic = pic; run.bubble = bubble;
    let pos = null; try { pos = JSON.parse(localStorage.getItem('sb-tour-pos') || 'null'); } catch (e) { pos = null; }
    const place = (x, y) => { run.cx = U.clamp(x, 8, innerWidth - G.size - 8); run.cy = U.clamp(y, 8, innerHeight - G.size - 8); fit(); };
    run.place = place; run.home = [pos ? pos.x : innerWidth - G.size - 24, pos ? pos.y : innerHeight - G.size - 130]; place(...run.home);
    const grab = (e, by) => {
      e.preventDefault(); by.setPointerCapture(e.pointerId); el.classList.add('drag'); const ox = e.clientX - run.cx, oy = e.clientY - run.cy; // the character's corner stays the same distance from the pointer
      const mv = ev => { run.dragged = true; place(ev.clientX - ox, ev.clientY - oy); }, up = () => { by.removeEventListener('pointermove', mv); by.removeEventListener('pointerup', up); el.classList.remove('drag'); if (run.edit && run.onMove) return run.onMove(run.i, { x: +(run.cx / innerWidth).toFixed(4), y: +(run.cy / innerHeight).toFixed(4) }); run.userDragged = true; run.home = [run.cx, run.cy]; try { localStorage.setItem('sb-tour-pos', JSON.stringify({ x: run.cx, y: run.cy })); } catch (e2) {} };
      by.addEventListener('pointermove', mv); by.addEventListener('pointerup', up);
    };
    pic.addEventListener('pointerdown', e => grab(e, pic));
    bubble.addEventListener('pointerdown', e => { if (e.button !== 0 || (e.target.closest && e.target.closest('button, a, input, textarea, select, kbd'))) return; grab(e, bubble); }); // the bubble moves the guide too
    run.timer = setInterval(() => { tick(); layout(); }, 200);
  }
  /** Lay the guide out around its character: bubble above (below near the top), inside the window. */
  function fit() {
    if (!run || !run.el) return; const el = run.el, G = TS.GUIDE, x = run.cx, y = run.cy, sd = run.side, below = sd === 'below' ? true : sd === 'above' ? false : y < 300, left = sd === 'right' ? true : sd === 'left' ? false : x < innerWidth / 2;
    el.classList.toggle('below', below); el.classList.toggle('left', left);
    const bw = run.bubble.offsetWidth || 330, bh = run.bubble.offsetHeight || 160, ex = left ? x : x + G.size - Math.max(bw, G.size), ey = below ? y : y - bh - 12;
    el.style.left = U.clamp(ex, 8, Math.max(8, innerWidth - Math.max(bw, G.size) - 8)) + 'px'; el.style.top = Math.max(8, ey) + 'px';
  }
  addEventListener('resize', () => run && run.place && run.place(run.cx, run.cy));
  function mood(m) {
    if (!run) return; const ch = run.def.character && TS.CHARACTERS[run.def.character] ? run.def.character : TS.defaultCharacter(), pic = run.pic; m = m || 'talk'; pic.dataset.mood = m;
    const key = ch + '/' + m; if (pic.dataset.face !== key) { pic.dataset.face = key; pic._img = null; pic.innerHTML = TS.faceHtml(ch, m); } // a picture from tutorials/characters, or the drawn face
    pic.classList.remove('bounce'); void pic.offsetWidth; pic.classList.add('bounce');
  }
  function say(st, extra, m, done) {
    if (!run) return; const i = run.i, n = run.def.steps.length, T = run.T; mood(m);
    run.bubble.replaceChildren(...[
      h('div.tg-head', null, h('span.tg-step', null, `${run.def.title} · ${i + 1} / ${n}`), h('span.tg-prog', null, h('i', { style: { width: Math.round((i + (done ? 1 : 0)) / n * 100) + '%' } })), W.iconBtn('x', run.edit ? 'Close the preview' : 'Close the tutorial', () => run.edit && TS.studio ? TS.studio.close() : stop(), 'sm')),
      st.tip ? h('div.tg-tip', { html: SB.icon('bulb') + '<b>Tip</b>' }) : null,
      st.practice && !done ? h('div.tg-tip.tg-task', { html: SB.icon('task') + '<b>Task</b>' }) : null,
      h('p.tg-say' + (done ? '.done' : ''), null, done ? h('span.tg-ok', { html: SB.icon('check') }) : null, val(st.say)),
      st.img ? h('img.tg-img', { src: val(st.img), alt: '' }) : null,
      st.key ? h('div.tg-keyrow', null, h('span', null, st.keyLabel || (st.show ? 'Click it, or press' : 'Press')), keyCaps(st.key)) : null,
      extra ? h('p.tg-reply' + (done ? '.ok' : ''), null, extra) : null,
      run.edit ? h('div.tg-btns', null, W.btn('Back', back, { cls: 'sm ghost' }), h('span.hint', null, 'Drag me to place me for this step'), W.btn('Next', next, { cls: 'sm primary' })) :
      h('div.tg-btns', null, i > 0 ? W.btn('Back', back, { cls: 'sm ghost' }) : h('span'),
        st.practice && !done && hintOf(st) ? W.btn('Hint', () => say(st, hintOf(st), 'idea'), { cls: 'sm ghost', icon: 'bulb', title: 'A little help' }) : null,
        st.task && !done && !st.practice ? W.btn('Show me', () => showMe(st), { cls: 'sm', icon: 'eye', title: 'Show me again, bigger. You do the step yourself.' }) : null,
        !st.task || done || st.practice ? W.btn(i === n - 1 ? 'Finish' : st.practice && !done ? 'Done' : 'Next', next, { cls: 'sm primary' }) : null),
      run.edit || !st.task || done || st.practice ? null : h('div.tg-doitrow', null, run.doitEl = h('a.tg-doit', { href: '#', role: 'button', hidden: !helpOpen(), title: 'The guide does this step. You learn more when you try it yourself.', onclick: e => { e.preventDefault(); skip(); } }, st.task.doIt ? 'Do it for me' : 'Skip this step'))].filter(Boolean));
    fit(); layout();
  }
  function finish() {
    const def = run.def; mood('cheer'); shade(null); mouse(null); const txt = def.outro || 'Your animation is on the practice screen. Keep playing with it, or try another tutorial.';
    run.bubble.replaceChildren(h('div.tg-head', null, h('span.tg-step', null, def.title), W.iconBtn('x', 'Close', () => stop(true), 'sm')),
      h('p.tg-say', null, h('b', null, 'You did it! '), txt),
      h('div.tg-btns', null, W.btn('Another tutorial', () => { stop(true); open(); }, { cls: 'sm ghost' }), W.btn('Keep animating', () => stop(true), { cls: 'sm primary' })));
    fit();
  }

  // ================= pointing: a dimmed screen with holes where you may click, a ring, a mouse picture, stage guides
  const elOf = t => { if (!t || !run) return null; if (t === 'stage') return document.getElementById('stageWrap'); try { const e = typeof t === 'function' ? t(run.T) : typeof t === 'string' ? document.querySelector(t) : t; return e && e.getBoundingClientRect ? e : null; } catch (e) { return null; } };
  const visible = r => r && r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
  /** Where stage point [x, y] (practice-screen pixels) is in the window. */
  const client = p => { const r = document.getElementById('stageDoc').getBoundingClientRect(); return { x: r.left + p[0] / S.project.w * r.width, y: r.top + p[1] / S.project.h * r.height }; };
  let shadeEl = null, ringEl = null, mouseEl = null;
  function layout() {
    if (!run) return; const st = run.def.steps[run.i]; if (!st || run.done) { shade(null); mouse(null); return; }
    const showEl = elOf(st.show), holes = [showEl, ...(st.allow || []).map(elOf)].filter(Boolean).map(e => e.getBoundingClientRect()).filter(visible);
    if (showEl && showEl.scrollIntoView && run.scrolled !== run.i && !visible(showEl.getBoundingClientRect())) { run.scrolled = run.i; try { showEl.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e) {} }
    const lost = (st.show && (!showEl || !visible(showEl.getBoundingClientRect()))) || ((st.allow || []).length && !holes.length); // what it points at isn't on screen: don't lock you out
    if (run.edit) { shade(null); ringOnly(showEl && visible(showEl.getBoundingClientRect()) ? showEl.getBoundingClientRect() : null); } else
    shade(st.free || lost ? null : { holes, ring: showEl && visible(showEl.getBoundingClientRect()) ? showEl.getBoundingClientRect() : null });
    if (!run.edit) dodge(holes.concat(showEl ? [showEl.getBoundingClientRect()] : []));
    annos(st);
    const atv = typeof st.at === 'function' ? (() => { try { return st.at(run.T); } catch (e) { return null; } })() : st.at;
    const route = (val(st.route) || []).map(winPt).filter(Boolean);
    const at = route.length ? route[0] : atv ? winPt(atv) : showEl ? (() => { const r = showEl.getBoundingClientRect(); return { x: r.left + Math.min(r.width / 2, 60), y: r.top + r.height / 2 }; })() : null;
    const mk = typeof st.mouse === 'function' ? st.mouse(run.T) : st.mouse;
    const where = at || (run.edit && mk ? { x: innerWidth / 2, y: innerHeight / 2 } : null); // in the maker it shows even with nothing to point at, so you can drag it there
    mouse(mk && where ? { kind: mk, x: where.x, y: where.y, route: mk === 'drag' && route.length > 1 ? route : null } : null);
  }
  /** A step's point in the window: stage pixels [x, y], window fractions { x, y }, or the middle of an element. */
  function winPt(v) { if (!v) return null; if (v.x != null && !v.getBoundingClientRect) return { x: v.x * innerWidth, y: v.y * innerHeight }; if (Array.isArray(v)) return client(v); const e = elOf(v), r = e && e.getBoundingClientRect(); return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null; }
  /** Keep the guide off what it points at: try the other corners (until you drag the guide yourself). */
  function dodge(rects) {
    if (!run || run.dragged || !run.el || !rects.length) return; const G = TS.GUIDE, hit = () => { const g = run.el.getBoundingClientRect(); return rects.some(r => r.width < innerWidth * 0.7 && !(r.right < g.left || r.left > g.right || r.bottom < g.top || r.top > g.bottom)); };
    if (!hit()) return; const keep = [run.cx, run.cy];
    for (const [x, y] of [[innerWidth - G.size - 24, innerHeight - G.size - 130], [innerWidth * 0.42, innerHeight - G.size - 24], [innerWidth - G.size - 24, 330], [260, 330], [260, innerHeight - G.size - 24]]) { run.cx = x; run.cy = y; fit(); if (!hit()) return; }
    [run.cx, run.cy] = keep; fit();
  }
  function shade(o) {
    if (!o) { if (shadeEl) shadeEl.hidden = true; if (ringEl) ringEl.hidden = true; return; }
    if (!shadeEl) { shadeEl = h('div.tour-shade', { 'aria-hidden': 'true' }); document.body.appendChild(shadeEl); shadeEl.addEventListener('pointerdown', () => { if (run && run.pic) { run.pic.classList.remove('shake'); void run.pic.offsetWidth; run.pic.classList.add('shake'); } });
      shadeEl.addEventListener('wheel', e => { /* the dimmed panels still scroll (a step may point at something further down the right panel) */
        shadeEl.style.pointerEvents = 'none'; let el = document.elementFromPoint(e.clientX, e.clientY); shadeEl.style.pointerEvents = '';
        for (; el && el !== document.body; el = el.parentElement) { const cs = getComputedStyle(el); if (/(auto|scroll)/.test(cs.overflowY + cs.overflowX) && (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1)) { el.scrollBy({ top: e.deltaY, left: e.deltaX || (e.shiftKey ? e.deltaY : 0) }); e.preventDefault(); return; } }
      }, { passive: false }); }
    const Wd = innerWidth, Hd = innerHeight, pad = 6; let d = `M0 0H${Wd}V${Hd}H0Z`;
    const inside = (a, b) => a.left >= b.left - 1 && a.right <= b.right + 1 && a.top >= b.top - 1 && a.bottom <= b.bottom + 1, holes = o.holes.filter((r, i) => !o.holes.some((q, j) => j !== i && inside(r, q) && !(inside(q, r) && j > i))); // a hole inside another would close it again (even-odd)
    for (const r of holes) { const x = Math.max(0, r.left - pad), y = Math.max(0, r.top - pad), x1 = Math.min(Wd, r.right + pad), y1 = Math.min(Hd, r.bottom + pad); d += `M${x} ${y}H${x1}V${y1}H${x}Z`; }
    shadeEl.hidden = false; shadeEl.style.clipPath = `path(evenodd, "${d}")`;
    if (!ringEl) { ringEl = h('div.tour-ring', { 'aria-hidden': 'true' }); document.body.appendChild(ringEl); }
    const r = o.ring; ringEl.hidden = !r; if (r) Object.assign(ringEl.style, { left: r.left - 5 + 'px', top: r.top - 5 + 'px', width: r.width + 10 + 'px', height: r.height + 10 + 'px' });
  }
  function ringOnly(r) { if (!ringEl) { ringEl = h('div.tour-ring', { 'aria-hidden': 'true' }); document.body.appendChild(ringEl); } ringEl.hidden = !r; if (r) Object.assign(ringEl.style, { left: r.left - 5 + 'px', top: r.top - 5 + 'px', width: r.width + 10 + 'px', height: r.height + 10 + 'px' }); }
  // ---------- drawings over the whole window (space 'screen': points as shares of the window): arrows, boxes, rings, paths
  let annoEl = null;
  function annos(st) {
    const gs = [].concat(val(st && st.ghost) || []).filter(g => g.space === 'screen'), route = (val(st && st.route) || []).map(winPt).filter(Boolean);
    if (route.length > 1) gs.push({ space: 'screen', path: route.flatMap(p => [p.x / innerWidth, p.y / innerHeight]), c: '#FF4F8B' }, { space: 'screen', dot: [route[route.length - 1].x / innerWidth, route[route.length - 1].y / innerHeight] });
    if (!gs.length) { if (annoEl) annoEl.innerHTML = ''; return; }
    if (!annoEl) { annoEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); annoEl.setAttribute('class', 'tour-annos'); document.body.appendChild(annoEl); }
    annoEl.setAttribute('viewBox', `0 0 ${innerWidth} ${innerHeight}`); annoEl.innerHTML = gs.map(g => TS.annoSvg(g, (x, y) => [x * innerWidth, y * innerHeight], 1)).join('');
  }
  /** One drawing as SVG; P maps its points to the window. */
  TS.annoSvg = (g, P, k = 1, sel) => {
    const col = g.c || '#FF4F8B', st = `fill="none" stroke="${col}" stroke-width="${4 * k}" stroke-linecap="round" stroke-linejoin="round"${g.solid ? '' : ` stroke-dasharray="${10 * k} ${7 * k}"`}${sel ? ' class="sel"' : ''}`, out = [];
    const pts = a => { const r = []; for (let i = 0; i + 1 < a.length; i += 2) r.push(P(a[i], a[i + 1]).map(v => v.toFixed(1)).join(',')); return r; };
    if (g.arrow || g.line) { const q = g.arrow || g.line, [x0, y0] = P(q[0], q[1]), [x1, y1] = P(q[2], q[3]), a = Math.atan2(y1 - y0, x1 - x0), s = 18 * k;
      out.push(`<line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}" ${st}/>`); if (g.arrow) out.push(`<path d="M${x1 - Math.cos(a - 0.5) * s} ${y1 - Math.sin(a - 0.5) * s}L${x1} ${y1}L${x1 - Math.cos(a + 0.5) * s} ${y1 - Math.sin(a + 0.5) * s}" fill="none" stroke="${col}" stroke-width="${4 * k}" stroke-linecap="round" stroke-linejoin="round"/>`); }
    else if (g.rect) { const [x0, y0] = P(g.rect[0], g.rect[1]), [x1, y1] = P(g.rect[2], g.rect[3]); out.push(`<rect x="${Math.min(x0, x1)}" y="${Math.min(y0, y1)}" width="${Math.abs(x1 - x0)}" height="${Math.abs(y1 - y0)}" rx="${8 * k}" ${st}/>`); }
    else if (g.ellipse || g.circle) { const e = g.ellipse || [g.circle[0], g.circle[1], g.circle[2], g.circle[2]], [cx, cy] = P(e[0], e[1]), [ex, ey] = P(e[0] + e[2], e[1] + e[3]); out.push(`<ellipse cx="${cx}" cy="${cy}" rx="${Math.abs(ex - cx)}" ry="${Math.abs(ey - cy)}" ${st}/>`); }
    else if (g.path || g.poly) out.push(`<polyline points="${pts(g.path || g.poly).join(' ')}" ${st}/>`);
    else if (g.dot) { const [x, y] = P(g.dot[0], g.dot[1]); out.push(`<circle cx="${x}" cy="${y}" r="${8 * k}" fill="${col}" stroke="#fff" stroke-width="${2 * k}"/>`); }
    if (g.label) { const p = g.dot || g.circle || g.ellipse || g.arrow || g.line || g.rect || g.path || g.poly, [x, y] = P(p[0], p[1]); out.push(`<text x="${x + 12 * k}" y="${y - 12 * k}" font-family="system-ui, sans-serif" font-weight="700" font-size="${14 * k}" fill="${col}" stroke="#fff" stroke-width="${4 * k}" paint-order="stroke">${U.esc(g.label)}</text>`); }
    return out.join('');
  };
  /** In the maker: drag the mouse picture to where it should show (run.onAt gets the window point it now points at). */
  function dragMouse(el) {
    el.addEventListener('pointerdown', e => {
      if (!run || !run.edit || !run.onAt) return; e.preventDefault(); e.stopPropagation(); const r = el.getBoundingClientRect(), ox = e.clientX - (r.left - 10), oy = e.clientY - (r.top - 6), i = run.i;
      const mv = ev => { el.style.left = Math.round(ev.clientX - ox + 10) + 'px'; el.style.top = Math.round(ev.clientY - oy + 6) + 'px'; run.mouseDrag = true; };
      const up = ev => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); if (run) run.mouseDrag = false; if (run && run.onAt) run.onAt(i, ev.clientX - ox, ev.clientY - oy); };
      addEventListener('pointermove', mv); addEventListener('pointerup', up);
    });
  }
  /** A mouse picture: which button to press (left, right, twice), a drag or the wheel. */
  function mouse(m) {
    if (!m) { if (mouseEl) mouseEl.hidden = true; return; }
    if (!mouseEl) { mouseEl = h('div.tour-mouse', { 'aria-hidden': 'true' }); document.body.appendChild(mouseEl); dragMouse(mouseEl); }
    mouseEl.classList.toggle('edit', !!(run && run.edit && run.onAt)); mouseEl.title = run && run.edit ? 'Drag to move the mouse picture' : '';
    if (mouseEl.dataset.kind !== m.kind) {
      mouseEl.dataset.kind = m.kind; const L = m.kind === 'left' || m.kind === 'double' || m.kind === 'drag', R = m.kind === 'right';
      mouseEl.innerHTML = `<svg viewBox="0 0 40 56"><rect x="4" y="4" width="32" height="48" rx="16" fill="#fff" stroke="#24213F" stroke-width="2.5"/><path d="M20 4v18M4 22h32" stroke="#24213F" stroke-width="2"/>`
        + `<path class="btn${L ? ' on' : ''}" d="M20 5.5A14.5 14.5 0 0 0 5.5 20v.8H19.2V5.5z"/><path class="btn${R ? ' on' : ''}" d="M20.8 5.5A14.5 14.5 0 0 1 34.5 20v.8H20.8z"/>`
        + `<rect class="wheel${m.kind === 'scroll' ? ' on' : ''}" x="17.5" y="9" width="5" height="9" rx="2.5"/></svg>`
        + `<span class="tm-label">${{ left: 'Click', right: 'Right-click', double: 'Double-click', drag: 'Drag', scroll: 'Scroll' }[m.kind] || ''}</span>`;
    }
    mouseEl.hidden = false; if (run && run.mouseDrag) return; mouseEl.style.left = Math.round(m.x + 10) + 'px'; mouseEl.style.top = Math.round(m.y + 6) + 'px';
    // a drag route: the picture travels along its points, rests at the end, and starts over
    const key = m.route ? m.route.map(p => Math.round(p.x) + ',' + Math.round(p.y)).join(' ') : '';
    if (key !== (mouseEl._route || '')) {
      mouseEl._route = key; if (mouseEl._anim) { mouseEl._anim.cancel(); mouseEl._anim = null; } mouseEl.classList.toggle('route', !!m.route);
      if (m.route) { const p0 = m.route[0], len = m.route.reduce((a, p, i) => i ? a + Math.hypot(p.x - m.route[i - 1].x, p.y - m.route[i - 1].y) : 0, 0), dur = 700 + len * 3.2, frames = [];
        let acc = 0; m.route.forEach((p, i) => { if (i) acc += Math.hypot(p.x - m.route[i - 1].x, p.y - m.route[i - 1].y); frames.push({ transform: `translate(${Math.round(p.x - p0.x)}px, ${Math.round(p.y - p0.y)}px)`, offset: 0.12 + 0.7 * (len ? acc / len : 0) }); });
        frames.unshift({ transform: 'translate(0px, 0px)', offset: 0 }); frames.push({ transform: frames[frames.length - 1].transform, offset: 1 });
        try { mouseEl._anim = mouseEl.animate(frames, { duration: dur, iterations: Infinity, easing: 'linear' }); } catch (e) {} }
    }
  }
  // dashed guides on the stage: where to draw, where to drag
  SB.overlays.extra.push(O => {
    if (!run || run.done) return; const st = run.def.steps[run.i], gs = st && val(st.ghost); if (!gs || (TS.studio && TS.studio.drawsGhosts && TS.studio.drawsGhosts())) return; const c = O.c, d = O.dpr, t = performance.now() / 1000;
    const em = run.emph && performance.now() < run.emph, pulse = em ? 0.65 + 0.35 * Math.sin(t * 12) : 1; /* Show me: thicker, flashing dashes */
    c.save(); c.lineWidth = (em ? 6 : 3) * d; c.globalAlpha = pulse; c.strokeStyle = 'rgba(255,79,139,.9)'; c.fillStyle = 'rgba(255,79,139,.08)'; c.setLineDash([10 * d, 7 * d]); c.lineDashOffset = -t * 20 * d; c.lineCap = 'round'; c.lineJoin = 'round';
    for (const g of [].concat(gs)) {
      if (g.space === 'screen') continue; c.beginPath(); if (g.c) { c.strokeStyle = g.c; c.fillStyle = 'transparent'; } else { c.strokeStyle = 'rgba(255,79,139,.9)'; c.fillStyle = 'rgba(255,79,139,.08)'; } c.setLineDash(g.solid ? [] : [10 * d, 7 * d]);
      if (g.circle) { const [x, y] = O.P(g.circle[0], g.circle[1]); c.arc(x, y, g.circle[2] * O.sc, 0, Math.PI * 2); c.fill(); c.stroke(); }
      else if (g.ellipse) { const [x, y] = O.P(g.ellipse[0], g.ellipse[1]); c.ellipse(x, y, g.ellipse[2] * O.sc, g.ellipse[3] * O.sc, 0, 0, Math.PI * 2); c.fill(); c.stroke(); }
      else if (g.line || g.arrow) { const q = g.line || g.arrow, [x0, y0] = O.P(q[0], q[1]), [x1, y1] = O.P(q[2], q[3]); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); if (g.arrow) { const a = Math.atan2(y1 - y0, x1 - x0), s = 14 * d; c.setLineDash([]); c.beginPath(); c.moveTo(x1 - Math.cos(a - 0.5) * s, y1 - Math.sin(a - 0.5) * s); c.lineTo(x1, y1); c.lineTo(x1 - Math.cos(a + 0.5) * s, y1 - Math.sin(a + 0.5) * s); c.stroke(); c.setLineDash([10 * d, 7 * d]); } }
      else if (g.rect) { const [x0, y0] = O.P(g.rect[0], g.rect[1]), [x1, y1] = O.P(g.rect[2], g.rect[3]); c.roundRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0), 8 * d); c.fill(); c.stroke(); }
      else if (g.path) { for (let i = 0; i + 1 < g.path.length; i += 2) { const [x, y] = O.P(g.path[i], g.path[i + 1]); i ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke(); }
      else if (g.poly) { for (let i = 0; i < g.poly.length; i += 2) { const [x, y] = O.P(g.poly[i], g.poly[i + 1]); i ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke(); }
      if (g.dot) { const [x, y] = O.P(g.dot[0], g.dot[1]), r = (7 + Math.sin(t * 5) * 2) * d; c.save(); c.setLineDash([]); c.fillStyle = 'rgba(255,79,139,.95)'; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); c.strokeStyle = '#fff'; c.lineWidth = 2 * d; c.stroke(); c.restore(); }
      if (g.label) { const p = g.dot || g.circle || g.ellipse || g.line || g.arrow || g.rect || g.path || g.poly, [x, y] = O.P(p[0], p[1]); c.save(); c.setLineDash([]); c.font = `700 ${13 * d}px system-ui, sans-serif`; c.fillStyle = 'rgba(255,79,139,1)'; c.strokeStyle = '#fff'; c.lineWidth = 4 * d; const lx = x + 12 * d, ly = y - 12 * d; c.strokeText(g.label, lx, ly); c.fillText(g.label, lx, ly); c.restore(); }
    }
    c.restore(); SB.dirty(); // the dashes march
  });
  Object.assign(TS, { open, start, stop, skip, show, isEdit, showMe: () => run && run.def.steps[run.i] && showMe(run.def.steps[run.i]) });
  /** A tutorial's group in the gallery (its own, or "My tutorials" for yours), and the groups in order (tutorials/config.js "groups" first). */
  TS.groupOf = d => d.group || (d.mine ? 'My tutorials' : 'More');
  TS.groupsOf = list => { const cfg = (window.SB_TUTORIALS || {}).groups || [], seen = [...new Set(list.map(TS.groupOf))]; return [...cfg.filter(g => seen.includes(g)), ...seen.filter(g => !cfg.includes(g))]; };
  /** A tutorial from a file in the tutorials folder (tutorials/my-tutorials/*.js), in the maker's format (js/tours/maker.js). */
  TS.fileTours = [];
  TS.addJson = j => { if (!j || !j.id || !Array.isArray(j.steps)) return console.warn('tutorial file: needs an id and steps', j); const k = TS.fileTours.findIndex(x => x.id === j.id); if (k >= 0) TS.fileTours[k] = j; else TS.fileTours.push(j); clearTimeout(TS._reg); TS._reg = setTimeout(() => TS.maker && TS.maker.register(), 0); };

  // ================= helpers for tutorials (what to point at)
  TS.at = {
    /** A tool's button on the tool bar (or the button of its group, when another tool of the group shows: labels after the first are tried in turn). */
    tool: (...labels) => () => { for (const l of labels) { const b = document.querySelector(`#rail button[aria-label="${l}"]`); if (b) return b; } return null; },
    /* the app moves a button's title to data-tip while the mouse is over it, so look at both */
    title: start => () => [...document.querySelectorAll('button[title],button[data-tip]')].find(b => (b.getAttribute('title') || b.dataset.tip || '').startsWith(start) && b.offsetParent),
    sel: css => () => document.querySelector(css),
    /** A layer's row in the timeline (its name). */
    row: name => T => { const o = T.o(name); return o && document.querySelector(`#tl .tl-row[data-id="${o.id}"] .tl-head`); },
    /** A layer's keyframe diamond at time t on its timeline row. */
    keyAt: (name, t) => T => { const o = T.o(name); if (!o) return null; return [...document.querySelectorAll(`#tl .tl-row[data-id="${o.id}"] .kf`)].find(k => Math.abs(+k.dataset.kt - t) < 0.05) || null; },
    ruler: () => document.querySelector('#tl .tl-row.ruler'),
    /** The spot on the ruler at time t (seconds): what to click to move the playhead there. */
    rulerAt: t => () => { const row = document.querySelector('#tl .tl-row.ruler'), inner = document.getElementById('tlInner'), head = row && row.querySelector('.tl-head'); if (!row || !inner || !head) return null;
      const rr = row.getBoundingClientRect(), x = inner.getBoundingClientRect().left + head.offsetWidth + t * S.zoom; return { getBoundingClientRect: () => ({ left: x - 14, right: x + 14, top: rr.top, bottom: rr.bottom, width: 28, height: rr.height }) }; },
    /** A tool (it may sit inside a group, whose button shows one tool: right-click or hold it for the rest): its own button when it shows,
        else its group's button, and once the group's list is open, the tool in that list. */
    toolIn: (label, ...heads) => () => { const it = [...document.querySelectorAll('.pop-list.toolgrp button')].find(b => b.textContent.trim().startsWith(label)); return it || TS.at.tool(label, ...TS.at.kin(label), ...heads)(); },
    /** The other tools of a tool's group (they share one button in the tool bar). */
    kin: label => ((TS.at.GROUPS.find(g => g.includes(label)) || []).filter(x => x !== label)),
    GROUPS: [['Brush', 'Fill brush'], ['Fill', 'Gradient'], ['Smooth', 'Width', 'Pull'], ['Pen', 'Points']],
    /** The mouse picture for toolIn: a click when the tool's button shows or its group's list is open, else a right-click on the group's button. */
    toolHow: label => () => document.querySelector(`#rail button[aria-label="${label}"]`) || document.querySelector('.pop-list.toolgrp') || !TS.at.kin(label).some(k => document.querySelector(`#rail button[aria-label="${k}"]`)) ? 'left' : 'right',
    menu: () => document.querySelector('.menu:not([hidden])'),
    /** An item of the open menus: the first of the texts found (the deepest step first, e.g. 'Bend with a rig', 'Rig'). */
    item: (...texts) => () => { const bs = [...document.querySelectorAll('.menu:not([hidden]) button')]; for (const t of texts) { const b = bs.reverse().find(x => x.textContent.trim().replace(/^✓\s*/, '').startsWith(t)); bs.reverse(); if (b) return b; } return document.querySelector('.menu:not([hidden])'); },
  };
  /** Checks tutorials use a lot. */
  TS.is = {
    menuOpen: () => SB.menu.isOpen(),
    tool: id => () => S.tool === id,
  };
})(window.SB);
