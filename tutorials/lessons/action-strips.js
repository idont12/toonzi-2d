/* Tutorial: actions and action strips. A rig has two ready actions, Wave and Hop; strips put them one after another (format: js/tours/tours.js). */
'use strict';
(function (SB) {
  const S = SB.state, tree = SB.tree, TR = SB.tracks, U = SB.util, at = SB.tours.at, art = SB.tours.art;
  const R = () => SB.rig, A = () => SB.actions;
  const rigOf = () => R().rigs().find(r => r.bones && r.bones.length) || null;
  const P = p => U.pt(p[0], p[1]);
  const strips = () => { const r = rigOf(); return r && r.aseq ? r.aseq : []; };
  const nameOf = s => { const r = rigOf(), a = r && r.actions && r.actions.list.find(x => x.id === s.act); return a ? a.name : ''; };
  /** Where things are (stage pixels): the ground and Buddy's body, shoulder and hand. */
  const G = T => { const gy = Math.round(T.H * 0.82), cx = T.W * 0.5; return { gy, cx, body: [cx, gy - 160], shoulder: [cx + 135, gy - 215], hand: [cx + 330, gy - 215], hop: 230 }; };
  const clipOf = () => { const r = rigOf(); return r && document.querySelector(`#tl .clip[data-id="${r.id}"]`); };
  const addBtn = () => [...document.querySelectorAll('#inspector button')].find(b => /Add at the playhead/.test(b.textContent));
  SB.tours.add({
    id: 'action-strips', group: '5 Rigs and controllers', title: 'Action strips: wave, then hop', minutes: 3, level: 'Medium', duration: 6,
    blurb: 'Chain a rig’s actions one after another with strips.',
    desc: 'You know that a rig can hold several actions (see “Actions: more than one animation”). Buddy has Wave and Hop. You put them one after another with action strips, with a smooth blend between them, and no new keyframes at all.',
    learn: ['Action strips: actions one after another', 'Blending from one action to the next', 'Reusing the same action again'],
    preview(c, t, w, h) {
      c.fillStyle = '#EAF7F4'; c.fillRect(0, 0, w, h); const gy = h * 0.82, u = t % 4, hop = u > 2 ? Math.abs(Math.sin((u - 2) * Math.PI)) * h * 0.22 : 0, ease = k => Math.max(0, Math.min(1, k)), bl = ease((u - 2) / 0.4);
      c.fillStyle = '#7BC6B5'; c.fillRect(0, gy, w, h - gy); const x = w * 0.45, by = gy - hop - 50;
      const ang = u < 2 ? -Math.sin(u * Math.PI * 2) * 0.7 - 0.5 : -0.5 * (1 - bl);
      c.save(); c.translate(x + 38, by - 18); c.rotate(ang); c.fillStyle = '#F29F4C'; c.beginPath(); c.roundRect(-6, -9, 66, 18, 9); c.fill(); c.beginPath(); c.arc(60, 0, 11, 0, 7); c.fill(); c.restore();
      c.fillStyle = '#2FA08C'; c.beginPath(); c.roundRect(x - 36, by - 50, 72, 96, 16); c.fill(); c.fillStyle = '#fff'; c.beginPath(); c.arc(x - 12, by - 20, 8, 0, 7); c.arc(x + 12, by - 20, 8, 0, 7); c.fill();
      c.fillStyle = '#24213F'; c.beginPath(); c.arc(x - 10, by - 20, 4, 0, 7); c.arc(x + 14, by - 20, 4, 0, 7); c.fill(); c.strokeStyle = '#24213F'; c.lineWidth = 3; c.lineCap = 'round'; c.beginPath(); c.arc(x + 2, by - 4, 12, 0.3, Math.PI - 0.3); c.stroke();
      c.fillStyle = '#24213F'; c.fillRect(w * 0.12, h * 0.12, w * 0.76, 4); c.fillStyle = '#2FA08C'; c.fillRect(w * 0.12, h * 0.12 - 8, w * 0.3, 8); c.fillStyle = '#F29F4C'; c.fillRect(w * 0.42, h * 0.12 - 8, w * 0.3, 8); c.fillStyle = '#24213F'; c.fillRect(w * 0.12 + u / 4 * w * 0.76, h * 0.1, 2, 20);
    },
    setup(T) {
      const g = G(T), [cx, gy] = [g.cx, g.gy], [sx, sy] = g.shoulder, W = T.W; S.project.bg = '#EAF7F4';
      S.project.duration = 2;
      const ground = tree.make('shape', { name: 'Ground', shape: 'rect', w: W * 0.96, h: 120, fill: '#7BC6B5', strokeW: 0, x: W / 2, y: gy + 60, start: 0, dur: 6 });
      const arm = tree.make('draw', { name: 'Arm', x: sx, y: sy, start: 0, dur: 2, play: 'loop' }), body = tree.make('draw', { name: 'Buddy', x: cx, y: gy - 160, start: 0, dur: 2, play: 'loop' });
      S.objects.push(arm, body, ground); tree.reindex();
      art.rrect(body, cx, gy - 160, 270, 320, 50, '#2FA08C', false); art.disc(body, cx - 55, gy - 215, 36, '#FFFFFF', true); art.disc(body, cx + 55, gy - 215, 36, '#FFFFFF', true);
      art.disc(body, cx - 48, gy - 212, 17, '#24213F', true); art.disc(body, cx + 62, gy - 212, 17, '#24213F', true); art.path(body, [[cx - 55, gy - 150, 28, 30], [cx + 55, gy - 150, 28, -30]], false, { s: 9 });
      art.rrect(arm, sx + 100, sy, 240, 60, 30, '#F29F4C', false); art.disc(arm, sx + 215, sy, 40, '#F7B979', true);
      /* the rig: a bone in the body and one for the arm (from the shoulder to the hand) */
      const rig = R().make(P([cx, gy - 160])); rig.start = 0; rig.dur = 2; tree.rootList().unshift(rig); tree.reindex();
      const q = p => R().toRig(rig, P(p)), b0 = R().addBone(rig, { type: 'pt', x: q([cx, gy - 100]).x, y: q([cx, gy - 100]).y }, q([cx, gy - 35]));
      const b1 = R().addBone(rig, { type: 'pt', x: q([sx, sy]).x, y: q([sx, sy]).y }, q([sx + 215, sy])); b0.name = 'Body'; b1.name = 'Arm'; S.boneDraft = null;
      R().bindTo(body, rig, b0.id, 'follow'); R().bindTo(arm, rig, b1.id, 'follow');
      /* Wave: the arm swings up and down (this is the action you see) */
      const toast = SB.toast; SB.toast = () => {}; /* no toast while the actions are made */
      const wave = A().start(rig, 'Wave'); wave.dur = 2;
      [[0, 60], [0.5, -50], [1, 60], [1.5, -50], [2, 60]].forEach(([t, v]) => TR.put(rig, 'bone:' + b1.id, t, v, 'smooth'));
      /* Hop: Buddy jumps twice, the arm stays down */
      const hop = A().add(rig, 'empty', 'Hop'); hop.dur = 2; const y0 = rig.y || 0;
      [[0, 0], [0.5, -g.hop], [1, 0], [1.5, -g.hop], [2, 0]].forEach(([t, v]) => TR.put(rig, 'y', t, y0 + v, 'smooth')); TR.put(rig, 'bone:' + b1.id, 0, 60, 'smooth'); TR.put(rig, 'bone:' + b1.id, 2, 60, 'smooth');
      A().switchTo(rig, wave.id, true); SB.toast = toast;
      S.project.duration = 6; S.project.fixedLen = true; [rig, arm, body].forEach(m => { m.dur = 6; });
      SB.time.set(0); tree.select([]); SB.tool.set('select'); S.selBone = null;
    },
    steps: [
      { say: 'Buddy has two actions, Wave and Hop. A strip plays an action at a time you choose. Let’s chain them.' },
      { say: 'Press play. Buddy waves once and then stands still.', key: 'play', show: '#btnPlay', task: { check: () => S.playing, doIt: () => SB.time.play() } },
      { say: 'Stop it.', key: 'play', show: '#btnPlay', task: { check: () => !S.playing, doIt: () => SB.time.pause() } },
      { say: 'Select the rig: click its bar in the timeline.', show: clipOf, allow: ['#tl'], mouse: 'left', enter: () => { SB.time.pause(); SB.time.set(0); }, task: { check: () => !!rigOf() && S.sel === rigOf().id, hint: 'The rig’s bar is the one with the bone icon, at the top of the timeline.', doIt: () => tree.select([rigOf().id]) } },
      { say: 'Click the ruler at 2 seconds: Hop starts there.', show: at.rulerAt(2), allow: [at.ruler], mouse: 'left', task: { check: T => T.timeAt(2, 0.12), doIt: () => SB.time.set(2) } },
      { say: 'In the panel, find Action strips and click Add at the playhead.', allow: ['#inspector'], show: addBtn, mouse: 'left', task: { check: () => strips().length >= 2 && strips().some(s => s.t > 1.8 && s.t < 2.2 && nameOf(s) === 'Hop'), hint: 'Scroll the panel to Action strips. Keep the playhead at 2 seconds, then click Add at the playhead.', doIt: () => { SB.time.set(2); SB.actionStrips.add(rigOf()); } } },
      { say: 'Go back to the start before you play. Press Home.', key: 'home', show: at.title('Go to start'), mouse: 'left', task: { check: T => T.timeAt(0, 0.05), doIt: () => { SB.time.pause(); SB.time.set(0); } } },
      { say: 'Play: Buddy waves, then smoothly turns into hops!', key: 'play', show: '#btnPlay', task: { check: () => S.playing, doIt: () => SB.time.play() } },
      { say: 'Stop it.', key: 'play', show: '#btnPlay', task: { check: () => !S.playing, doIt: () => SB.time.pause() } },
      { tip: true, free: true, say: 'Each strip has a Blend: how many seconds the change from the action before takes. Drag a strip’s name on the rig’s bar to move it. The panel can also turn the strips off, to edit one action.' },
      { practice: true, free: true, say: 'Go back to waving at 4 seconds: click the ruler there and add one more strip.', allow: [at.ruler, '#inspector', '#tl', '#btnPlay'], keys: ['Space'], show: at.rulerAt(4), enter: () => { SB.time.pause(); tree.select([rigOf().id]); },
        task: { check: () => strips().length >= 3 && strips().some(s => s.t > 3.8 && s.t < 4.2 && nameOf(s) === 'Wave'), hint: 'Ruler at 4 seconds, then Add at the playhead in Action strips: it picks the next action, which is Wave again.', doIt: () => { SB.time.set(4); SB.actionStrips.add(rigOf()); } } },
    ],
    outro: 'Actions are building blocks. Make a few small ones (walk, wave, jump) and put them in any order with strips.',
  });
})(window.SB);
