/* Tutorial: actions. One rig holds several small animations (actions): make a second one, switch between them (format: js/tours/tours.js). */
'use strict';
(function (SB) {
  const S = SB.state, tree = SB.tree, TR = SB.tracks, U = SB.util, at = SB.tours.at, art = SB.tours.art;
  const R = () => SB.rig, A = () => SB.actions;
  const rigOf = () => R().rigs().find(r => r.bones && r.bones.length) || null;
  const P = p => U.pt(p[0], p[1]);
  const list = () => { const r = rigOf(), a = r && A().of(r); return a ? a.list : []; };
  const curName = () => { const r = rigOf(), c = r && A().current(r); return c ? c.name : ''; };
  const armBone = () => { const r = rigOf(); return r && r.bones.find(b => b.name === 'Arm'); };
  const armAt = t => { const r = rigOf(), b = armBone(); return r && b ? TR.value(r, 'bone:' + b.id, t) || 0 : 0; };
  /** Where things are (stage pixels): the ground and Buddy's body, shoulder and hand. */
  const G = T => { const gy = Math.round(T.H * 0.82), cx = T.W * 0.5; return { gy, cx, body: [cx, gy - 160], shoulder: [cx + 135, gy - 215], hand: [cx + 350, gy - 215] }; };
  const tip = T => { const r = rigOf(), b = armBone(); if (!r || !b) return G(T).hand; const q = R().poseAt(r, S.time)[b.id], w = SB.xf.world(r).transformPoint(U.pt(q.tx, q.ty)); return [w.x, w.y]; };
  const clipOf = () => { const r = rigOf(); return r && document.querySelector(`#tl .clip[data-id="${r.id}"]`); };
  const badge = () => { const c = clipOf(); return c && c.querySelector('.cl-badge.act'); };
  const makeBtn = () => [...document.querySelectorAll('#inspector button')].find(b => /^(Make actions|New action)/.test(b.textContent.trim()));
  /** The badge on the rig's bar until the menu opens; then the action we want in the menu. */
  const pickAction = nth => T => SB.menu.isOpen() ? at.item(((list()[nth] || {}).name) || 'Action')() : badge();
  SB.tours.add({
    id: 'actions', group: '5 Rigs and controllers', title: 'Actions: more than one animation', minutes: 4, level: 'Medium', duration: 2,
    blurb: 'Make a second animation for the same rig and switch between them.',
    desc: 'A rig can keep several animations, called actions: a wave, a hop, a walk. Each action has its own keyframes. Buddy waves already. You keep that as an action, make a new one, pose it with Auto key and switch between the two. The next tutorial chains actions with strips.',
    learn: ['What an action is', 'Making actions for a rig', 'Switching between actions', 'Animating a new action'],
    preview(c, t, w, h) {
      c.fillStyle = '#EAF7F4'; c.fillRect(0, 0, w, h); const gy = h * 0.82, u = t % 4, second = u >= 2, x = w * 0.38, by = gy - 50;
      c.fillStyle = '#7BC6B5'; c.fillRect(0, gy, w, h - gy);
      const ang = second ? -0.9 * Math.min(1, (u - 2) / 0.8) : -Math.sin(u * Math.PI * 2) * 0.7 - 0.5;
      c.save(); c.translate(x + 38, by - 18); c.rotate(ang); c.fillStyle = '#F29F4C'; c.beginPath(); c.roundRect(-6, -9, 66, 18, 9); c.fill(); c.beginPath(); c.arc(60, 0, 11, 0, 7); c.fill(); c.restore();
      c.fillStyle = '#2FA08C'; c.beginPath(); c.roundRect(x - 36, by - 50, 72, 96, 16); c.fill(); c.fillStyle = '#fff'; c.beginPath(); c.arc(x - 12, by - 20, 8, 0, 7); c.arc(x + 12, by - 20, 8, 0, 7); c.fill();
      c.fillStyle = '#24213F'; c.beginPath(); c.arc(x - 10, by - 20, 4, 0, 7); c.arc(x + 14, by - 20, 4, 0, 7); c.fill();
      [['Wave', !second], ['Arm up', second]].forEach(([n, on], i) => { const bx = w * 0.62, by2 = h * 0.28 + i * 38; c.fillStyle = on ? '#5B3DF5' : '#fff'; c.strokeStyle = on ? '#5B3DF5' : '#C9C4E6'; c.lineWidth = 2; c.beginPath(); c.roundRect(bx, by2, w * 0.28, 30, 8); c.fill(); c.stroke(); c.fillStyle = on ? '#fff' : '#24213F'; c.font = '700 14px system-ui, sans-serif'; c.textAlign = 'left'; c.fillText(n, bx + 12, by2 + 20); });
    },
    setup(T) {
      const g = G(T), [cx, gy] = [g.cx, g.gy], [sx, sy] = g.shoulder, W = T.W; S.project.bg = '#EAF7F4'; S.project.duration = 2;
      const ground = tree.make('shape', { name: 'Ground', shape: 'rect', w: W * 0.96, h: 120, fill: '#7BC6B5', strokeW: 0, x: W / 2, y: gy + 60, start: 0, dur: 2 });
      const arm = tree.make('draw', { name: 'Arm', x: sx, y: sy, start: 0, dur: 2, play: 'loop' }), body = tree.make('draw', { name: 'Buddy', x: cx, y: gy - 160, start: 0, dur: 2, play: 'loop' });
      S.objects.push(arm, body, ground); tree.reindex();
      art.rrect(body, cx, gy - 160, 270, 320, 50, '#2FA08C', false); art.disc(body, cx - 55, gy - 215, 36, '#FFFFFF', true); art.disc(body, cx + 55, gy - 215, 36, '#FFFFFF', true);
      art.disc(body, cx - 48, gy - 212, 17, '#24213F', true); art.disc(body, cx + 62, gy - 212, 17, '#24213F', true); art.path(body, [[cx - 55, gy - 150, 28, 30], [cx + 55, gy - 150, 28, -30]], false, { s: 9 });
      art.rrect(arm, sx + 120, sy, 270, 60, 30, '#F29F4C', false); art.disc(arm, sx + 245, sy, 40, '#F7B979', true);
      /* the rig: a bone in the body and one for the arm (from the shoulder to the hand) */
      const rig = R().make(P([cx, gy - 160])); rig.start = 0; rig.dur = 2; tree.rootList().unshift(rig); tree.reindex();
      const q = p => R().toRig(rig, P(p)), b0 = R().addBone(rig, { type: 'pt', x: q([cx, gy - 100]).x, y: q([cx, gy - 100]).y }, q([cx, gy - 35]));
      const b1 = R().addBone(rig, { type: 'pt', x: q([sx, sy]).x, y: q([sx, sy]).y }, q([sx + 245, sy])); b0.name = 'Body'; b1.name = 'Arm'; S.boneDraft = null;
      R().bindTo(body, rig, b0.id, 'follow'); R().bindTo(arm, rig, b1.id, 'follow');
      /* what Buddy does now: the arm waves up and down (plain keyframes, no actions yet) */
      [[0, 60], [0.5, -50], [1, 60], [1.5, -50], [2, 60]].forEach(([t, v]) => TR.put(rig, 'bone:' + b1.id, t, v, 'smooth'));
      S.project.fixedLen = true; SB.time.set(0); tree.select([]); SB.tool.set('select'); S.selBone = null; S.autoKey = false;
    },
    steps: [
      { say: 'Buddy waves. An action keeps an animation like this safe, so the same rig can also do something else. Let’s give him a second one.' },
      { say: 'Press play to see what Buddy does now.', key: 'play', show: '#btnPlay', task: { check: () => S.playing, doIt: () => SB.time.play() } },
      { say: 'Stop it.', key: 'play', show: '#btnPlay', task: { check: () => !S.playing, doIt: () => SB.time.pause() } },
      { say: 'Actions belong to the rig. Select it: click its bar in the timeline.', show: clipOf, allow: ['#tl'], mouse: 'left', enter: () => { SB.time.pause(); SB.time.set(0); }, task: { check: () => !!rigOf() && S.sel === rigOf().id, hint: 'The rig’s bar is the one with the bone icon, at the top of the timeline.', doIt: () => tree.select([rigOf().id]) } },
      { say: 'In the panel, find Actions and click Make actions. Give the new action a name, like Arm up, and press OK.', show: makeBtn, allow: ['#inspector', '#modal'], mouse: 'left', task: { check: () => list().length >= 2, hint: 'Scroll the panel to the Actions section. What Buddy does now is kept as Action 1.', doIt: () => A().add(rigOf(), 'empty', 'Arm up') } },
      { say: 'Buddy has two actions now. The rig’s bar shows the one you edit. Click its name there to switch.', show: badge, allow: ['#tl'], mouse: 'left', task: { check: () => SB.menu.isOpen(), hint: 'It is a small tag on the rig’s bar in the timeline.', doIt: () => { const b = badge(); if (b) SB.timeline.acts.action(rigOf(), b); } } },
      { say: 'Pick Action 1. That is the wave, safe in its own action.', show: pickAction(0), mouse: 'left', task: { check: () => curName() === (list()[0] || {}).name && !SB.menu.isOpen(), doIt: () => { SB.menu.close(); A().switchTo(rigOf(), list()[0].id, true); } } },
      { say: 'Switch back to your new action: click the name on the bar again, then pick the new one.', show: pickAction(1), allow: ['#tl'], mouse: 'left', task: { check: () => list().length > 1 && curName() === list()[1].name && !SB.menu.isOpen(), hint: 'Click the tag on the rig’s bar, then your new action in the list.', doIt: () => { SB.menu.close(); A().switchTo(rigOf(), list()[1].id, true); } } },
      { tip: true, free: true, say: 'The new action starts with the arm at rest. It has its own keyframes and its own length. Nothing you do here changes the wave.' },
      { say: 'Turn Auto key on, to pose the new action quickly.', show: at.title('Auto key'), mouse: 'left', task: { check: () => S.autoKey, doIt: () => { S.autoKey = true; SB.invalidate('transport'); } } },
      { say: 'Click the ruler at 1 second.', show: at.rulerAt(1), allow: [at.ruler], mouse: 'left', task: { check: T => T.timeAt(1, 0.12), doIt: () => SB.time.set(1) } },
      { say: 'Drag the end of the arm up. The rig bends the arm.', allow: ['stage'], mouse: 'drag', at: tip, enter: () => { const r = rigOf(); if (r) tree.select([r.id]); SB.tool.set('select'); }, ghost: T => { const p = tip(T); return [{ arrow: [p[0], p[1], p[0] - 20, p[1] - 190] }]; },
        task: { check: () => armAt(1) < -35 && curName() === (list()[1] || {}).name, hint: 'Grab the little circle at the end of the arm and pull it up. The Auto key makes the keyframes.', doIt: () => TR.set(rigOf(), 'bone:' + armBone().id, -75) } },
      { say: 'Turn Auto key off again, so nothing changes by accident.', show: at.title('Auto key'), mouse: 'left', task: { check: () => !S.autoKey, doIt: () => { S.autoKey = false; SB.invalidate('transport'); } } },
      { say: 'Go back to the start. Press Home.', key: 'home', show: at.title('Go to start'), mouse: 'left', task: { check: T => T.timeAt(0, 0.05), doIt: () => { SB.time.pause(); SB.time.set(0); } } },
      { say: 'Play: the arm goes up, in the new action.', key: 'play', show: '#btnPlay', task: { check: () => S.playing, doIt: () => SB.time.play() } },
      { tip: true, free: true, say: 'The panel can rename, copy or delete an action. In Unity and Godot, every action becomes its own animation. The next tutorial chains actions one after another.' },
      { practice: true, free: true, say: 'Stop, then make a third action: in the panel, press New action and give it a name.', allow: ['#inspector', '#modal', '#btnPlay'], keys: ['Space'], show: makeBtn, enter: () => { SB.time.pause(); const r = rigOf(); if (r) tree.select([r.id]); },
        task: { check: () => list().length >= 3, hint: 'The New action button is in the Actions section of the panel. Select the rig first.', doIt: () => A().add(rigOf(), 'empty', 'Third') } },
    ],
    outro: 'One rig, several actions. Next: “Actions: wave, then hop” puts actions one after another with action strips.',
  });
})(window.SB);
