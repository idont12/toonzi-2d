/* Tutorial: exporting for game engines (Unity and Godot). Mostly tips, a few steps to try (format: js/tours/tours.js). */
'use strict';
(function (SB) {
  const S = SB.state, tree = SB.tree, TR = SB.tracks, U = SB.util, at = SB.tours.at, is = SB.tours.is;
  const hero = T => T.o('Hero');
  const spots = T => ({ rest: [T.W / 2, T.H * 0.82 - 20 - 130], up: [T.W / 2, T.H * 0.4] }); /* rest: the hero stands on the ground */
  const pos = (T, t) => { const o = hero(T), k = TR.transform(o, t ?? tree.localTime(o)), q = SB.xf.parentWorld(o).transformPoint(U.pt(k.x, k.y)); return [q.x, q.y]; };
  const near = (p, q, tol = 90) => Math.hypot(p[0] - q[0], p[1] - q[1]) <= tol;
  const ykeys = T => (hero(T).tracks.y || []);
  const keyNow = T => { tree.select([hero(T).id]); SB.ops.addKey(); };
  const moveTo = (T, p) => { const o = hero(T), l = SB.xf.parentWorld(o).inverse().transformPoint(U.pt(p[0], p[1])); TR.set(o, 'x', U.r1(l.x)); TR.set(o, 'y', U.r1(l.y)); };
  const exportOpen = () => !!document.querySelector('#modal .exp');
  const godotBtn = () => [...document.querySelectorAll('#modal .exp .seg button')].find(b => /^Godot/.test(b.textContent.trim())) || null;
  SB.tours.add({
    id: 'game-engines', group: '7 Interactive and export', title: 'Game engines: Unity and Godot', minutes: 6, level: 'Medium', duration: 3,
    blurb: 'Get a character ready for Unity or Godot.',
    desc: 'Game engines do not play videos: they play your layers, bones and animations. You switch the project to Game Engine, look at the export, and make a small idle animation. The guide shares tips on screens, rigs, frame by frame, and what to watch out for.',
    learn: ['Making a project for Game Engine', 'One screen = one animation', 'Rigs and frame by frame in an engine', 'How many frames a morph or an animated line becomes', 'Pros and cons of this export'],
    preview(c, t, w, h) {
      c.fillStyle = '#EEF3FF'; c.fillRect(0, 0, w, h); const u = (t % 2) / 2, y = h * 0.52 - Math.sin(u * Math.PI) * 26;
      c.fillStyle = '#24213F'; c.fillRect(24, h * 0.76, w - 48, 12);
      c.fillStyle = '#3D7BFF'; c.beginPath(); c.arc(w * 0.34, y, 34, 0, 7); c.fill();
      ['#24213F', '#4B9CD3'].forEach((col, i) => { c.fillStyle = col; c.beginPath(); c.roundRect(w * 0.62 + i * 58, h * 0.3, 48, 48, 10); c.fill(); });
      c.fillStyle = '#fff'; c.fillRect(w * 0.62 + 18, h * 0.3 + 14, 12, 20); c.beginPath(); c.arc(w * 0.62 + 58 + 24, h * 0.3 + 24, 10, 0, 7); c.fill();
    },
    setup(T) {
      const sp = spots(T), D = S.project.duration;
      const g = tree.make('shape', { name: 'Ground', shape: 'rect', w: T.W * 0.8, h: 40, fill: '#24213F', strokeW: 0, x: T.W / 2, y: T.H * 0.82, start: 0, dur: D });
      const o = tree.make('shape', { name: 'Hero', shape: 'ellipse', w: 260, h: 260, fill: '#3D7BFF', strokeW: 0, x: sp.rest[0], y: sp.rest[1], start: 0, dur: D });
      S.objects.push(o, g); tree.reindex(); tree.select([o.id]); SB.tool.set('select');
    },
    steps: [
      { say: 'Unity and Godot do not play videos. They play your layers and animations. Let’s get this hero ready.' },
      { say: 'Click the chip at the top that says Video, and choose Game Engine.', show: '.tgt-chip', mouse: 'left', task: { check: () => SB.targets.get() === 'game', hint: 'It is in the top bar. It says “Made for”.', doIt: () => SB.targets.set('game') } },
      { tip: true, free: true, say: 'One screen is one animation: Idle, Walk, Jump. Duplicate a screen to start the next one, and keep the same layer names, so the engine knows it is the same character.' },
      { tip: true, free: true, say: 'A rig comes along with its bones, bending layers and controllers. Each rig action becomes its own animation too. Frame by frame drawings become sprites that switch in time.' },
      { tip: true, free: true, say: 'The good: it plays inside your game, it stays small and you can tweak the animation later.' },
      { tip: true, free: true, say: 'The catch: no glow, shadows, blend modes, video or sound. Frame by frame makes bigger files, since every drawing is a picture.' },
      { say: 'Let’s peek at the export. Click the logo at the top left.', show: '.top .logo', mouse: 'left', task: { check: is.menuOpen, doIt: () => SB.menus.file(document.querySelector('.top .logo')) } },
      { say: 'Choose Export.', show: at.item('Export'), mouse: 'left', task: { check: exportOpen, hint: 'It is near the bottom of the menu.', doIt: () => { SB.menu.close(); SB.exporter.open(); } } },
      { say: 'Game Engine is picked for you. Choose Godot to see what it makes.', show: godotBtn, allow: ['#modal'], mouse: 'left', task: { check: () => { const b = godotBtn(); return !!b && b.classList.contains('on'); }, doIt: () => { const b = godotBtn(); if (b) b.click(); } } },
      { tip: true, free: true, say: 'Two number fields: “Morph in-betweens” and “Animated line poses”. They set how many frames a morph, or an animated line, becomes. More frames are smoother but bigger.' },
      { tip: true, free: true, say: 'One layer needs more or fewer frames than the rest? Right-click it and choose “Game engine frames…” to give that layer its own numbers.' },
      { say: 'Unity gets a .unitypackage and Godot gets a project folder. Close this window: press Esc or click the X.', allow: ['#modal'], keys: ['Escape'], task: { check: () => !exportOpen(), doIt: () => { const m = document.getElementById('modal'); if (m && m._close) m._close(); else document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); } } },
      { say: 'Now a tiny idle animation. The hero is selected: press K to key it at 0 seconds.', key: 'key', show: at.title('Add a keyframe'), enter: T => { SB.time.pause(); SB.time.set(0); tree.select([hero(T).id]); }, task: { check: T => ykeys(T).length >= 1, doIt: keyNow } },
      { say: 'Click the ruler at 1 second.', show: at.rulerAt(1), allow: [at.ruler], mouse: 'left', task: { check: T => T.timeAt(1, 0.12), doIt: () => SB.time.set(1) } },
      { say: 'Drag the hero up into the pink circle.', allow: ['stage'], mouse: 'drag', at: T => pos(T), ghost: T => [{ circle: [...spots(T).up, 100] }, { arrow: [...pos(T), ...spots(T).up] }],
        task: { check: T => near(pos(T), spots(T).up), hint: 'Press on the blue hero and drag it up.', doIt: T => moveTo(T, spots(T).up) } },
      { say: 'Press K again. That is your second keyframe.', key: 'key', show: at.title('Add a keyframe'), task: { check: T => ykeys(T).length >= 2, doIt: keyNow } },
      { say: 'Go back to the start first. Press Home, or click the button.', key: 'home', show: at.title('Go to start'), mouse: 'left', task: { check: T => T.timeAt(0, 0.05), doIt: () => { SB.time.pause(); SB.time.set(0); } } },
      { say: 'Play it: the hero floats up.', key: 'play', show: '#btnPlay', task: { check: () => S.playing, doIt: () => SB.time.play() } },
      { practice: true, free: true, say: 'Stop, click the ruler at 2 seconds, drag the hero back down and press K. Now it loops.', allow: ['stage', at.ruler, '#tl', '#btnPlay'], keys: ['Space', 'K'], enter: () => SB.time.pause(),
        task: { check: T => ykeys(T).some(k => k.t > 1.7) && near(pos(T, 2), spots(T).rest), hint: 'Ruler at 2 seconds, drag the hero to the ground, then K.', doIt: T => { SB.time.pause(); SB.time.set(2); moveTo(T, spots(T).rest); keyNow(T); } } },
    ],
    outro: 'Your idle is ready for the engine. Make a Walk and a Jump on new screens, then export all of them in one go.',
  });
})(window.SB);
