/* Tutorial: the Follow constraint. A hand grabs a ball and carries it (format: js/tours/tours.js). */
'use strict';
(function (SB) {
  const S = SB.state, tree = SB.tree, TR = SB.tracks, at = SB.tours.at, is = SB.tours.is;
  const hand = T => T.o('Hand'), ball = T => T.o('Ball');
  const spots = T => { const b = [T.W * 0.55, T.H * 0.68]; return { ball: b, grab: [b[0], b[1] + 82], start: [T.W * 0.12, T.H * 0.3], end: [T.W * 0.3, T.H * 0.22] }; }; /* grab: a spot on the hand that is not on the ball */
  const con = T => { const b = ball(T); return b && (b.cons || []).find(c => c.type === 'follow') || null; };
  const onKeys = T => { const c = con(T), b = ball(T); return c && b.tracks['cn:' + c.id + ':on'] || []; };
  const hasKey = (T, t, v) => onKeys(T).some(k => Math.abs(k.t - t) < 0.2 && !!k.v === v);
  const menuRun = (o, path) => { let list = SB.menus.layerItems(o); for (const name of path) { const it = list.find(x => x && x.label && x.label.startsWith(name)); if (!it) return false; if (it.sub) list = it.sub; else { SB.menu.close(); it.run(); return true; } } return false; };
  const openMenu = o => { const r = document.getElementById('stageDoc').getBoundingClientRect(); tree.select([o.id]); SB.menu.open(r.left + r.width * 0.5, r.top + r.height * 0.45, SB.menus.layerItems(o)); };
  const activeRow = () => [...document.querySelectorAll('#inspector label.chk')].find(l => /Follows its target/.test(l.textContent));
  SB.tours.add({
    id: 'follow-object', group: '6 Quick and powerful', title: 'Follow: a hand grabs a ball', minutes: 5, level: 'Medium', duration: 4,
    blurb: 'Make a ball stick to a hand, then let it go.',
    desc: 'Follow makes one layer move with another. You make a ball follow a hand, then switch the follow on at the moment of the grab and off again when the hand lets go.',
    learn: ['Follow a layer on the stage', 'Switching a constraint on and off in time', 'Why you go back to the start before playing'],
    preview(c, t, w, h) {
      c.fillStyle = '#FFF7F0'; c.fillRect(0, 0, w, h); const u = (t % 4) / 4, bx = w * 0.55, by = h * 0.7; let hx, hy, grab = false;
      if (u < 0.4) { const k = u / 0.4; hx = w * 0.15 + (bx - w * 0.15) * k; hy = h * 0.3 + (by - h * 0.3) * k; } else { const k = Math.min(1, (u - 0.4) / 0.5); hx = bx - (bx - w * 0.3) * k; hy = by - (by - h * 0.25) * k; grab = true; }
      c.fillStyle = '#FFC9A3'; c.strokeStyle = '#24213F'; c.lineWidth = 4; c.beginPath(); c.arc(hx, hy, 36, 0, 7); c.fill(); c.stroke();
      c.fillStyle = '#FF6B4A'; c.beginPath(); c.arc(grab ? hx : bx, grab ? hy : by, 21, 0, 7); c.fill();
    },
    setup(T) {
      const D = S.project.duration, sp = spots(T);
      const b = tree.make('shape', { name: 'Ball', shape: 'ellipse', w: 110, h: 110, fill: '#FF6B4A', strokeW: 0, x: sp.ball[0], y: sp.ball[1], start: 0, dur: D });
      const h = tree.make('shape', { name: 'Hand', shape: 'ellipse', w: 200, h: 200, fill: '#FFC9A3', stroke: '#24213F', strokeW: 8, x: sp.start[0], y: sp.start[1], start: 0, dur: D });
      for (const [t, p] of [[0, sp.start], [1.5, sp.ball], [3.6, sp.end]]) { TR.put(h, 'x', t, p[0], 'smooth'); TR.put(h, 'y', t, p[1], 'smooth'); }
      S.objects.push(b, h); /* the ball is the front layer: it sits on top of the hand */ tree.reindex(); tree.select([]); SB.tool.set('select');
    },
    steps: [
      { say: 'Follow makes one layer stick to another. Let’s make this hand grab the ball.' },
      { say: 'The hand is already animated. Press play to watch it pass the ball.', key: 'play', show: '#btnPlay', task: { check: () => S.playing, doIt: () => SB.time.play() } },
      { say: 'It leaves the ball behind. Stop it.', key: 'play', show: '#btnPlay', task: { check: () => !S.playing, doIt: () => SB.time.pause() } },
      { say: 'Click the ruler at 1.5 seconds. That is when the hand reaches the ball.', show: at.rulerAt(1.5), allow: [at.ruler], mouse: 'left', task: { check: T => T.timeAt(1.5, 0.12), doIt: () => SB.time.set(1.5) } },
      { say: 'Right-click the ball.', allow: ['stage'], mouse: 'right', at: T => spots(T).ball, task: { check: is.menuOpen, hint: 'Right-click the orange ball.', doIt: T => openMenu(ball(T)) } },
      { say: 'Choose Controller, Follow, Follow (move and turn with it), then Pick a target on the stage.', show: at.item('Pick a target', 'Follow (move', 'Follow', 'Controller'), mouse: 'left', task: { check: T => S.picking || !!con(T), doIt: T => menuRun(ball(T), ['Controller', 'Follow', 'Follow (move', 'Pick a target']) } },
      { say: 'Now click the hand on the stage: its skin color, just under the ball.', allow: ['stage'], mouse: 'left', at: T => spots(T).grab, ghost: T => [{ dot: spots(T).grab, label: 'hand' }], task: { check: T => !!con(T), doIt: T => { if (S.picking && SB.picker.cancel) SB.picker.cancel(); if (!con(T)) SB.controls.constrainAll([ball(T)], 'follow', hand(T)); } } },
      { say: 'The ball now follows the hand all the time. Click the ruler at 0 and look: it got pulled away!', show: at.rulerAt(0), allow: [at.ruler], mouse: 'left', task: { check: T => T.timeAt(0, 0.05), doIt: () => SB.time.set(0) } },
      { say: 'We only want it to follow from the grab. In the panel, turn Active off for now.', show: activeRow, mouse: 'left', task: { check: T => hasKey(T, 0, false), hint: 'Look in the Controls section of the panel for “Follows its target” and untick it.', doIt: T => { tree.select([ball(T).id]); SB.controls.setActive(ball(T), con(T), false); } } },
      { say: 'Click the ruler at 1.5 seconds again.', show: at.rulerAt(1.5), allow: [at.ruler], mouse: 'left', task: { check: T => T.timeAt(1.5, 0.12), doIt: () => SB.time.set(1.5) } },
      { say: 'Now tick Active on. The hand grabs the ball here.', show: activeRow, mouse: 'left', task: { check: T => hasKey(T, 1.5, true), hint: 'Tick “Follows its target” again.', doIt: T => { tree.select([ball(T).id]); SB.controls.setActive(ball(T), con(T), true); } } },
      { say: 'Those are two keys. Go back to the start before playing: press Home.', key: 'home', show: at.title('Go to start'), mouse: 'left', task: { check: T => T.timeAt(0, 0.05), doIt: () => { SB.time.pause(); SB.time.set(0); } } },
      { say: 'Play: the hand grabs the ball and carries it away!', key: 'play', show: '#btnPlay', task: { check: () => S.playing, doIt: () => SB.time.play() } },
      { tip: true, free: true, say: 'Follow also works with a bone of a rig, so a hand bone can carry a cup. Influence can be keyframed to pass an object from one hand to another.' },
      { practice: true, free: true, say: 'Stop, click the ruler at 3 seconds, and untick Active so the hand lets go.', allow: ['stage', at.ruler, '#tl', '#inspector', '#btnPlay'], keys: ['Space'], show: activeRow, enter: T => { SB.time.pause(); tree.select([ball(T).id]); },
        task: { check: T => hasKey(T, 3, false), hint: 'Ruler at 3 seconds, then untick “Follows its target” in the panel.', doIt: T => { SB.time.set(3); tree.select([ball(T).id]); SB.controls.setActive(ball(T), con(T), false); } } },
    ],
    outro: 'The hand grabs and drops the ball. Use the same trick for a character picking up a hat or a cup. Next: “Slingshot” mixes keys and physics.',
  });
})(window.SB);
