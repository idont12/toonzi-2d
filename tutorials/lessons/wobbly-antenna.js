/* Tutorial: dynamic bones. A robot with an antenna: the antenna swings by itself when the robot moves (format: js/tours/tours.js). */
'use strict';
(function (SB) {
  const S = SB.state, tree = SB.tree, TR = SB.tracks, U = SB.util, at = SB.tours.at, art = SB.tours.art;
  const R = () => SB.rig;
  const rigOf = () => R().rigs().find(r => r.bones && r.bones.length) || null;
  const bone = i => { const r = rigOf(); return r && r.bones[i] || null; };
  const dyn = i => { const b = bone(i); return !!(b && b.dyn && b.dyn.on); };
  const P = p => U.pt(p[0], p[1]);
  /** Where things are (stage pixels): the robot's middle at the start. */
  const G = T => ({ cx: T.W * 0.22, cy: T.H * 0.64, run: T.W * 0.56 });
  const boneBtn = i => () => { const b = bone(i); return b && [...document.querySelectorAll('#inspector .bonelist button')].find(x => x.textContent.trim().startsWith(b.name)); };
  const dynRow = () => [...document.querySelectorAll('#inspector label.chk')].find(l => /Swings with follow-through/.test(l.textContent));
  const rowOf = label => () => { const i = document.querySelector(`#inspector input[aria-label="${label}"]`); return i && i.closest('.f'); };
  const setDyn = (i, on) => { const b = bone(i); if (b) { b.dyn = Object.assign(b.dyn || { stiff: 0.35, damp: 0.25, grav: 1 }, { on }); SB.bump(); SB.commit(); } };
  const pick = i => { const b = bone(i); if (b) { tree.select([rigOf().id]); S.selBone = b.id; SB.invalidate('inspector', 'ctxbar'); SB.dirty(); } };
  SB.tours.add({
    id: 'wobbly-antenna', group: '6 Quick and powerful', title: 'Dynamic bones: a wobbly antenna', minutes: 4, level: 'Medium', duration: 4,
    blurb: 'Make an antenna swing by itself with dynamic bones. No keyframes for the wobble.',
    desc: 'Dynamic bones follow the animation with weight and delay, like hair, tails and antennas. You turn it on for two bones of a rig, and the antenna wobbles on its own whenever the robot moves.',
    learn: ['Dynamic bones: secondary motion for free', 'Stiffness and damping', 'Why the antenna reacts to the robot’s move'],
    preview(c, t, w, h) {
      c.fillStyle = '#F1F7FF'; c.fillRect(0, 0, w, h); const fy = h * 0.8; c.fillStyle = '#DCE8F7'; c.fillRect(0, fy, w, h - fy);
      const X = tt => { const u = (tt % 3.6) / 3.6; return w * 0.25 + (u < 0.4 ? Math.pow(u / 0.4, 3) * w * 0.5 : u < 0.55 ? w * 0.5 : w * 0.5 * (1 - Math.min(1, (u - 0.55) / 0.4))) + 0; };
      let a = 0, v = 0; const dt = 1 / 60, tm = t % 3.6; for (let s = 0; s < tm; s += dt) { const acc = (X(s + dt) - 2 * X(s) + X(s - dt)) / (dt * dt); v += (-acc * 0.0006 - a * 70 - v * 2.2) * dt; a += v * dt; }
      const x = X(tm), by = fy - 36, ang = -Math.PI / 2 - Math.max(-1.1, Math.min(1.1, a)), ang2 = ang - Math.max(-1, Math.min(1, v * 0.12)) * 0.5;
      const x1 = x + Math.cos(ang) * 40, y1 = by - 30 + Math.sin(ang) * 40, x2 = x1 + Math.cos(ang2) * 40, y2 = y1 + Math.sin(ang2) * 40;
      c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = '#24213F'; c.lineWidth = 5; c.beginPath(); c.moveTo(x, by - 30); c.lineTo(x1, y1); c.lineTo(x2, y2); c.stroke();
      c.fillStyle = '#FF4F6B'; c.beginPath(); c.arc(x2 + Math.cos(ang2) * 9, y2 + Math.sin(ang2) * 9, 11, 0, 7); c.fill();
      c.fillStyle = '#4C9BFF'; c.beginPath(); c.roundRect(x - 52, by - 36, 104, 72, 14); c.fill(); c.fillStyle = '#E4F1FF'; c.beginPath(); c.roundRect(x - 36, by - 22, 72, 36, 8); c.fill();
      c.fillStyle = '#24213F'; c.beginPath(); c.arc(x - 14, by - 6, 5, 0, 7); c.arc(x + 14, by - 6, 5, 0, 7); c.fill();
    },
    setup(T) {
      const D = S.project.duration, g = G(T), cx = g.cx, cy = g.cy; S.project.bg = '#F1F7FF';
      const robot = tree.make('draw', { name: 'Robot', x: cx, y: cy, start: 0, dur: D, play: 'loop' });
      const ant = tree.make('draw', { name: 'Antenna', x: cx, y: cy, start: 0, dur: D, play: 'loop' });
      S.objects.push(robot, ant); tree.reindex();
      const k = 1.25, X = v => cx + v * k, Y = v => cy + v * k; /* k: the robot's size */
      art.rrect(robot, cx, Y(6), 360 * k, 290 * k, 46 * k, '#4C9BFF', false); art.rrect(robot, cx, Y(-8), 270 * k, 160 * k, 30 * k, '#E4F1FF', true);
      art.disc(robot, X(-62), Y(-14), 22 * k, '#24213F', true); art.disc(robot, X(62), Y(-14), 22 * k, '#24213F', true);
      art.path(robot, [[X(-40), Y(30), 22 * k, 22 * k], [X(40), Y(30), 22 * k, -22 * k]], false, { s: 9 });
      art.rrect(robot, X(-90), Y(152), 90 * k, 28 * k, 12 * k, '#24213F', true); art.rrect(robot, X(90), Y(152), 90 * k, 28 * k, 12 * k, '#24213F', true);
      const pts = []; for (let y = Y(-130); y >= Y(-338); y -= 14) pts.push(cx, y); pts.push(cx, Y(-345));
      art.put(ant, { c: '#24213F', s: 16, pts: art.local(ant, pts) }); art.disc(ant, cx, Y(-372), 38 * k, '#FF4F6B', true); art.disc(ant, cx - 11 * k, Y(-384), 10 * k, '#FFFFFF', true);
      /* the rig: a base bone in the body, two bones up the antenna; the robot rides on the base, the antenna bends with all three */
      const rig = R().make(P([cx, cy])); rig.start = 0; rig.dur = D; tree.rootList().unshift(rig); tree.reindex();
      const q = p => R().toRig(rig, P(p)), b0 = R().addBone(rig, { type: 'pt', x: q([cx, cy]).x, y: q([cx, cy]).y }, q([cx, Y(-150)]));
      const b1 = R().addBone(rig, { type: 'tail', bone: b0.id }, q([cx, Y(-250)])), b2 = R().addBone(rig, { type: 'tail', bone: b1.id }, q([cx, Y(-352)]));
      b0.name = 'Base'; b1.name = 'Stalk 1'; b2.name = 'Stalk 2'; S.boneDraft = null;
      R().bindTo(robot, rig, b0.id, 'follow'); R().bindTo(ant, rig, null, 'deform');
      /* the robot rushes right and stops short, waits, then glides back */
      TR.put(rig, 'x', 0, cx, 'easeIn'); TR.put(rig, 'x', 1.1, cx + g.run, 'hold'); TR.put(rig, 'x', 2.1, cx + g.run, 'smooth'); TR.put(rig, 'x', 3.6, cx, 'smooth');
      tree.select([]); SB.tool.set('select'); S.selBone = null;
    },
    steps: [
      { say: 'Meet Beep. Dynamic bones make things like antennas swing by themselves. No keyframes for the wobble!' },
      { say: 'Press play. The robot rushes right and stops, but the antenna stays stiff.', key: 'play', show: '#btnPlay', task: { check: () => S.playing, doIt: () => SB.time.play() } },
      { say: 'Stop it.', key: 'play', show: '#btnPlay', task: { check: () => !S.playing, doIt: () => SB.time.pause() } },
      { say: 'The antenna has a rig with two bones. In the panel, click Stalk 1 in the Bones list.', allow: ['#inspector'], show: boneBtn(1), enter: () => { SB.time.pause(); tree.select([rigOf().id]); SB.tool.set('select'); }, mouse: 'left',
        task: { check: () => !!bone(1) && S.selBone === bone(1).id, hint: 'The panel on the right shows the rig. Find the list called Bones and click Stalk 1.', doIt: () => pick(1) } },
      { say: 'Tick Dynamic: Swings with follow-through.', allow: ['#inspector'], show: dynRow, mouse: 'left', task: { check: () => dyn(1), hint: 'Scroll the panel down to the Stalk 1 section and tick the Dynamic box.', doIt: () => setDyn(1, true) } },
      { say: 'Now the tip. Click Stalk 2 in the Bones list.', allow: ['#inspector'], show: boneBtn(2), mouse: 'left', task: { check: () => !!bone(2) && S.selBone === bone(2).id, doIt: () => pick(2) } },
      { say: 'Tick Dynamic for Stalk 2 too.', allow: ['#inspector'], show: dynRow, mouse: 'left', task: { check: () => dyn(2), doIt: () => setDyn(2, true) } },
      { say: 'Go back to the start before you play. Press Home.', key: 'home', show: at.title('Go to start'), mouse: 'left', task: { check: T => T.timeAt(0, 0.05), doIt: () => { SB.time.pause(); SB.time.set(0); } } },
      { say: 'Play: the antenna lags, overshoots and wobbles all on its own!', key: 'play', show: '#btnPlay', task: { check: () => S.playing, doIt: () => SB.time.play() } },
      { say: 'Stop it.', key: 'play', show: '#btnPlay', task: { check: () => !S.playing, doIt: () => SB.time.pause() } },
      { say: 'Make the tip floppier: pull Stiffness % of Stalk 2 down.', allow: ['#inspector'], show: rowOf('Stiffness %'), enter: () => { pick(2); },
        task: { check: () => !!bone(2) && !!bone(2).dyn && bone(2).dyn.stiff <= 0.2, hint: 'Drag the Stiffness % slider of Stalk 2 down to about 15.', doIt: () => { const b = bone(2); b.dyn.stiff = 0.15; SB.commit(); } } },
      { say: 'Go back to the start and play again: a floppier tip.', key: 'play', show: '#btnPlay', enter: () => { SB.time.pause(); SB.time.set(0); }, task: { check: () => S.playing, doIt: () => SB.time.play() } },
      { tip: true, free: true, say: 'Stiffness is how fast the bone pulls back to the pose. Damping is how fast the wobble dies. Gravity is how much it droops. Dynamic bones suit tails, hair, ears and scarves.' },
      { practice: true, free: true, say: 'Stop, then make Stalk 1 floppy too: Stiffness % under 25. Pick it in the Bones list first.', allow: ['#inspector', '#btnPlay'], keys: ['Space'], show: boneBtn(1), enter: () => { SB.time.pause(); },
        task: { check: () => !!bone(1) && !!bone(1).dyn && bone(1).dyn.on && bone(1).dyn.stiff < 0.25, hint: 'Click Stalk 1 in the Bones list, then drag its Stiffness % slider down.', doIt: () => { pick(1); const b = bone(1); b.dyn.stiff = 0.2; SB.commit(); } } },
    ],
    outro: 'A wobbly antenna from one tick box. Next time try it on a tail or hair, and mix it with a keyframed walk.',
  });
})(window.SB);
