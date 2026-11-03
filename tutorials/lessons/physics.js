/* Tutorial: physics. A ball falls, bounces and gets thrown (format: js/tours/tours.js). */
'use strict';
(function (SB) {
  const S = SB.state, tree = SB.tree, U = SB.util, at = SB.tours.at, is = SB.tours.is;
  const ball = T => T.o('Ball'), box = T => T.o('Box'), floor = T => T.o('Floor');
  const spots = T => ({ ball: [T.W * 0.35, T.H * 0.18], box: [T.W * 0.65, T.H * 0.14], floor: [T.W / 2, T.H * 0.86] });
  const mode = o => o && o.phys ? o.phys.mode : null;
  const menuRun = (o, path) => { let list = SB.menus.layerItems(o); for (const name of path) { const it = list.find(x => x && x.label && x.label.startsWith(name)); if (!it) return false; if (it.sub) list = it.sub; else { SB.menu.close(); it.run(); return true; } } return false; };
  const openMenu = o => { const r = document.getElementById('stageDoc').getBoundingClientRect(); tree.select([o.id]); SB.menu.open(r.left + r.width * 0.5, r.top + r.height * 0.45, SB.menus.layerItems(o)); };
  const row = label => () => { const i = document.querySelector(`#inspector input[aria-label="${label}"]`); return i && i.closest('.f'); };
  SB.tours.add({
    id: 'physics', group: '6 Quick and powerful', title: 'Physics: drop and bounce', minutes: 5, level: 'Medium', duration: 4,
    blurb: 'Let a ball fall, bounce and fly without a single keyframe.',
    desc: 'Physics moves things for you: gravity pulls, floors catch, balls bounce. You turn a circle into a falling body, a rectangle into a floor, tune the bounce and throw the ball.',
    learn: ['Body: it falls and bounces', 'Surface: others land on it', 'Bounce and throw', 'No keyframes needed'],
    preview(c, t, w, h) {
      c.fillStyle = '#F2F9FF'; c.fillRect(0, 0, w, h); const fy = h - 36, tt = t % 2.4, g = 460, v0 = 0; let y = 30 + 0.5 * g * tt * tt, sq = 1;
      if (y > fy - 22) { const t1 = Math.sqrt(2 * (fy - 52) / g), u = tt - t1, vb = g * t1 * 0.62; y = fy - 22 - Math.max(0, vb * u - 0.5 * g * u * u); if (u < 0.1) sq = 0.8; }
      c.fillStyle = '#24213F'; c.fillRect(24, fy, w - 48, 14); c.fillStyle = '#FF6B4A'; c.beginPath(); c.ellipse(w * 0.45, y, 22 / sq, 22 * sq, 0, 0, Math.PI * 2); c.fill(); void v0;
      c.fillStyle = '#5B3DF5'; c.fillRect(w * 0.68, fy - 44 - Math.max(0, Math.sin(tt * 3) * 6), 44, 44);
    },
    setup(T) {
      const D = S.project.duration, sp = spots(T);
      const f = tree.make('shape', { name: 'Floor', shape: 'rect', w: T.W * 0.9, h: 70, fill: '#24213F', strokeW: 0, x: sp.floor[0], y: sp.floor[1], start: 0, dur: D });
      const b = tree.make('shape', { name: 'Box', shape: 'round', w: 150, h: 150, fill: '#5B3DF5', strokeW: 0, x: sp.box[0], y: sp.box[1], start: 0, dur: D });
      const o = tree.make('shape', { name: 'Ball', shape: 'ellipse', w: 150, h: 150, fill: '#FF6B4A', strokeW: 0, x: sp.ball[0], y: sp.ball[1], start: 0, dur: D });
      S.objects.push(o, b, f); tree.reindex(); tree.select([]); SB.tool.set('select');
    },
    steps: [
      { say: 'Physics makes things fall, bounce and tumble by themselves. No keyframes!' },
      { say: 'Right-click the ball.', allow: ['stage'], mouse: 'right', at: T => spots(T).ball, task: { check: is.menuOpen, doIt: T => openMenu(ball(T)) } },
      { say: 'Choose Physics, then Body. A body falls and bounces.', show: at.item('Body', 'Physics'), mouse: 'left', task: { check: T => mode(ball(T)) === 'dynamic', doIt: T => { SB.menu.close(); menuRun(ball(T), ['Physics', 'Body']); } } },
      { say: 'The ball needs something to land on. Right-click the floor.', allow: ['stage'], mouse: 'right', at: T => spots(T).floor, task: { check: is.menuOpen, doIt: T => openMenu(floor(T)) } },
      { say: 'Choose Physics, then Surface. Others land on a surface.', show: at.item('Surface', 'Physics'), mouse: 'left', task: { check: T => mode(floor(T)) === 'static', doIt: T => { SB.menu.close(); menuRun(floor(T), ['Physics', 'Surface']); } } },
      { say: 'Press play and watch the ball drop.', key: 'play', show: '#btnPlay', task: { check: () => S.playing, doIt: () => SB.time.play() } },
      { say: 'Stop it.', key: 'play', show: '#btnPlay', task: { check: () => !S.playing, doIt: () => SB.time.pause() } },
      { say: 'Let’s go back to the start to try again. Press Home.', key: 'home', show: at.title('Go to start'), mouse: 'left', task: { check: T => T.timeAt(0, 0.05), doIt: () => { SB.time.pause(); SB.time.set(0); } } },
      { say: 'Click the ball, then find Bounce in the Physics section of the panel. Slide it up.', allow: ['stage', '#inspector'], mouse: 'left', at: T => spots(T).ball, enter: T => { tree.select([ball(T).id]); }, show: row('Bounce %'),
        task: { check: T => !!ball(T).phys && ball(T).phys.bounce >= 0.7, hint: 'Look for “Bounce %” in the panel on the right and drag its slider to about 80.', doIt: T => { ball(T).phys.bounce = 0.85; SB.commit(); } } },
      { say: 'Now give it a push. Drag the orange handle from the ball to the right.', allow: ['stage'], mouse: 'drag', at: T => spots(T).ball, ghost: T => [{ arrow: [...spots(T).ball, spots(T).ball[0] + 260, spots(T).ball[1] + 40] }], enter: T => { tree.select([ball(T).id]); SB.tool.set('select'); },
        task: { check: T => !!ball(T).phys && Math.abs(ball(T).phys.vx || 0) > 60, hint: 'The orange handle sits on the ball. Press on it and drag sideways.', doIt: T => { ball(T).phys.vx = 400; ball(T).phys.vy = 80; SB.commit(); } } },
      { say: 'Press Home, then play. The ball flies, drops and bounces!', key: 'play', show: '#btnPlay', enter: () => { SB.time.pause(); SB.time.set(0); }, task: { check: () => S.playing, doIt: () => SB.time.play() } },
      { tip: true, free: true, say: 'Gravity is in the project settings. A surface can be any shape, even a slope. Bones can swing too: turn on Dynamic for a bone to make tails and hair.' },
      { practice: true, free: true, say: 'Make the purple box fall too: right-click it, then Physics › Body.', allow: ['stage', at.menu], mouse: 'right', at: T => spots(T).box, enter: () => SB.time.pause(),
        task: { check: T => mode(box(T)) === 'dynamic', hint: 'Right-click the box, open Physics, choose Body.', doIt: T => { tree.select([box(T).id]); menuRun(box(T), ['Physics', 'Body']); } } },
    ],
    outro: 'Everything falls and bounces! Change the Weight and Bounce of each thing and see how the feel changes.',
  });
})(window.SB);
