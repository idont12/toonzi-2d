/* Tutorial: keyframes and physics together. The ball is pulled back with keys, then physics lets it go (format: js/tours/tours.js). */
'use strict';
(function (SB) {
  const S = SB.state, tree = SB.tree, TR = SB.tracks, U = SB.util, at = SB.tours.at, is = SB.tours.is;
  const ball = T => T.o('Ball');
  /** Where things are (stage pixels). The ball's point is its middle. */
  const G = T => { const top = Math.round(T.H * 0.88), r = 55; return { top, r, rest: [T.W * 0.22, top - r], back: [T.W * 0.1, top - r], step: [T.W * 0.64, top - 115, 330, 230], aim: [900, -1500] }; };
  const mid = (T, t) => { const o = ball(T), k = TR.transform(o, t ?? tree.localTime(o)), q = SB.xf.parentWorld(o).transformPoint(U.pt(k.x, k.y)); return [q.x, q.y]; };
  const near = (p, q, tol = 130) => Math.hypot(p[0] - q[0], p[1] - q[1]) <= tol;
  const toLocal = (T, p) => { const l = SB.xf.parentWorld(ball(T)).inverse().transformPoint(U.pt(p[0], p[1])); return { x: U.r1(l.x), y: U.r1(l.y) }; };
  const keyNear = (o, id, t, tol = 0.3) => ((o.tracks || {})[id] || []).some(k => Math.abs(k.t - t) <= tol);
  const mode = o => o && o.phys ? o.phys.mode : null;
  const menuRun = (o, path) => { let list = SB.menus.layerItems(o); for (const name of path) { const it = list.find(x => x && x.label && x.label.startsWith(name)); if (!it) return false; if (it.sub) list = it.sub; else { SB.menu.close(); it.run(); return true; } } return false; };
  const openMenu = o => { const r = document.getElementById('stageDoc').getBoundingClientRect(); tree.select([o.id]); SB.menu.open(r.left + r.width * 0.5, r.top + r.height * 0.45, SB.menus.layerItems(o)); };
  const simRow = () => [...document.querySelectorAll('#inspector label.chk')].find(l => /On at the playhead/.test(l.textContent));
  /** The orange throw handle: where it sits on the stage (the ball's middle plus the throw, scaled down). */
  const handle = T => { const p = mid(T), v = ball(T).phys || { vx: 0, vy: 0 }; return [p[0] + (v.vx || 0) * SB.physics.VEL_K, p[1] + (v.vy || 0) * SB.physics.VEL_K]; };
  SB.tours.add({
    id: 'slingshot', group: '6 Quick and powerful', title: 'Slingshot: keys, then physics', minutes: 4, level: 'Medium', duration: 4,
    blurb: 'Pull a ball back with keyframes, then let physics shoot and bounce it.',
    desc: 'Keyframes are great for the wind-up, physics for the flight. You pull a ball back with Auto key, switch physics on at the moment you let go, aim the throw and watch it fly and bounce on its own.',
    learn: ['Keyframes first, physics after', 'Physics that starts part-way', 'Aiming a throw with the orange handle', 'Switching physics off with a key'],
    preview(c, t, w, h) {
      c.fillStyle = '#F2F9FF'; c.fillRect(0, 0, w, h); const fy = h * 0.82, sx = w * 0.62, sy = fy - 50, u = t % 4;
      c.fillStyle = '#24213F'; c.fillRect(0, fy, w, h - fy); c.fillStyle = '#5B3DF5'; c.fillRect(sx, sy, w * 0.2, fy - sy);
      let x = w * 0.2, y = fy - 16, vx = 0, vy = 0;
      if (u < 0.9) { const k = u / 0.9; x = w * 0.2 - Math.sin(k * Math.PI / 2) * w * 0.1; } else {
        x = w * 0.1; vx = w * 0.62; vy = -h * 1.0; let tt = u - 1;
        while (tt > 0) { const d = Math.min(tt, 1 / 60); vy += h * 1.5 * d; x += vx * d; y += vy * d; if (y > fy - 16) { y = fy - 16; vy *= -0.55; } if (x > sx - 14 && x < sx + w * 0.2 + 14 && y > sy - 16 && vy > 0) { y = sy - 16; vy *= -0.55; } tt -= d; }
      }
      c.fillStyle = '#FF6B4A'; c.beginPath(); c.arc(x, y, 16, 0, 7); c.fill();
    },
    setup(T) {
      const D = S.project.duration, g = G(T), W = T.W;
      const f = tree.make('shape', { name: 'Floor', shape: 'rect', w: W * 0.98, h: 120, fill: '#24213F', strokeW: 0, x: W / 2, y: g.top + 60, start: 0, dur: D });
      const st = tree.make('shape', { name: 'Step', shape: 'rect', w: g.step[2], h: g.step[3], fill: '#5B3DF5', strokeW: 0, x: g.step[0], y: g.step[1], start: 0, dur: D });
      const b = tree.make('shape', { name: 'Ball', shape: 'ellipse', w: g.r * 2, h: g.r * 2, fill: '#FF6B4A', strokeW: 0, x: g.rest[0], y: g.rest[1], start: 0, dur: D });
      S.objects.push(b, st, f); tree.reindex(); SB.physics.add(f, { mode: 'static' }); SB.physics.add(st, { mode: 'static' }); S.autoKey = false; tree.select([]); SB.tool.set('select');
    },
    steps: [
      { say: 'Keyframes are great for the wind-up and physics for the flight. Let’s use both on one ball.' },
      { say: 'Click the ball to select it.', allow: ['stage'], mouse: 'left', at: T => G(T).rest, task: { check: T => S.sel === ball(T).id, doIt: T => tree.select([ball(T).id]) } },
      { say: 'Turn Auto key on, for a quick pull-back.', show: at.title('Auto key'), mouse: 'left', task: { check: () => S.autoKey, doIt: () => { S.autoKey = true; SB.invalidate('transport'); } } },
      { say: 'Click the ruler at 0.8 seconds.', show: at.rulerAt(0.8), allow: [at.ruler], mouse: 'left', task: { check: T => T.timeAt(0.8, 0.12), doIt: () => SB.time.set(0.8) } },
      { say: 'Pull the ball back: drag it left into the circle.', allow: ['stage'], mouse: 'drag', at: T => G(T).rest, ghost: T => [{ circle: [...G(T).back, 70], label: 'pull back' }, { arrow: [...G(T).rest, ...G(T).back] }],
        task: { check: T => near(mid(T), G(T).back) && keyNear(ball(T), 'x', 0.8), hint: 'Press on the ball and drag it left, into the dashed circle.', doIt: T => { tree.select([ball(T).id]); const l = toLocal(T, G(T).back); TR.set(ball(T), 'x', l.x); TR.set(ball(T), 'y', l.y); SB.commit(); } } },
      { say: 'Turn Auto key off, so the next changes are not keyed.', show: at.title('Auto key'), mouse: 'left', task: { check: () => !S.autoKey, doIt: () => { S.autoKey = false; SB.invalidate('transport'); } } },
      { say: 'Click the ruler at 1 second. That is the moment you let go.', show: at.rulerAt(1), allow: [at.ruler], mouse: 'left', task: { check: T => T.timeAt(1, 0.12), doIt: () => SB.time.set(1) } },
      { say: 'Right-click the ball.', allow: ['stage'], mouse: 'right', at: T => mid(T), task: { check: is.menuOpen, hint: 'Right-click the orange ball.', doIt: T => openMenu(ball(T)) } },
      { say: 'Choose Physics, then Body. Physics starts here, at 1 second.', show: at.item('Body', 'Physics'), mouse: 'left', task: { check: T => mode(ball(T)) === 'dynamic', doIt: T => { SB.menu.close(); menuRun(ball(T), ['Physics', 'Body']); } } },
      { say: 'Aim the shot: drag the orange handle up and to the right.', allow: ['stage'], mouse: 'drag', at: T => handle(T), enter: T => { tree.select([ball(T).id]); SB.tool.set('select'); },
        ghost: T => [{ arrow: [...mid(T), mid(T)[0] + G(T).aim[0] * SB.physics.VEL_K, mid(T)[1] + G(T).aim[1] * SB.physics.VEL_K] }],
        task: { check: T => !!ball(T).phys && ball(T).phys.vx > 500 && ball(T).phys.vy < -400, hint: 'The orange handle sits on the ball. Drag it up and to the right, a good way out.', doIt: T => { TR.set(ball(T), 'phys:vx', G(T).aim[0]); TR.set(ball(T), 'phys:vy', G(T).aim[1]); SB.commit(); } } },
      { say: 'Go back to the start before you play. Press Home.', key: 'home', show: at.title('Go to start'), mouse: 'left', task: { check: T => T.timeAt(0, 0.05), doIt: () => { SB.time.pause(); SB.time.set(0); } } },
      { say: 'Play: the keys pull it back, then physics shoots it and it bounces!', key: 'play', show: '#btnPlay', task: { check: () => S.playing, doIt: () => SB.time.play() } },
      { say: 'Stop it.', key: 'play', show: '#btnPlay', task: { check: () => !S.playing, doIt: () => SB.time.pause() } },
      { tip: true, free: true, say: 'The ball follows its keys until physics starts. Change Throw or Weight for other shots. The Simulate switch can be keyed too, so physics can start and stop whenever you like.' },
      { practice: true, free: true, say: 'Freeze the ball in the air: click the ruler at 2 seconds, untick Simulate in the panel, then press K.', allow: ['stage', at.ruler, '#tl', '#inspector', '#btnPlay'], keys: ['K', 'Space'], show: simRow, enter: T => { SB.time.pause(); tree.select([ball(T).id]); },
        task: { check: T => ((ball(T).tracks || {})['phys:on'] || []).some(k => !k.v && Math.abs(k.t - 2) < 0.3), hint: 'Ruler at 2 seconds, untick “On at the playhead” under Simulate, then press K to keep it.', doIt: T => { SB.time.set(2); TR.put(ball(T), 'phys:on', 2, false, 'hold'); SB.commit(); } } },
    ],
    outro: 'Wind-up by keys, flight by physics. Try a heavier ball (Weight) or a second step to bounce off.',
  });
})(window.SB);
