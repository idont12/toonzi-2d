/* Tutorial: bones that bend an arm (format: js/tours/tours.js). */
'use strict';
(function (SB) {
  const S = SB.state, tree = SB.tree, TR = SB.tracks, U = SB.util, at = SB.tours.at, is = SB.tours.is;
  const R = () => SB.rig;
  const rigOf = () => R().rigs().find(r => r.bones && r.bones.length) || null;
  const arm = T => T.o('Arm');
  const L = 260; /* half the arm's length */
  /** The arm's joints on the stage: shoulder, elbow, hand. */
  const joints = T => [[T.W / 2 - L, T.H / 2], [T.W / 2, T.H / 2], [T.W / 2 + L, T.H / 2]];
  const handBone = () => { const r = rigOf(); return r && r.bones[r.bones.length - 1]; };
  const angle = t => { const r = rigOf(), b = handBone(); return r && b ? TR.value(r, 'bone:' + b.id, t) || 0 : 0; };
  const posedNow = () => { const r = rigOf(); return !!r && r.bones.some(b => Math.abs(TR.now(r, 'bone:' + b.id) || 0) > 4); };
  const keyTimes = () => { const r = rigOf(); const set = new Set(); if (r) Object.keys(r.tracks || {}).forEach(id => { if (id.startsWith('bone:')) r.tracks[id].forEach(k => set.add(Math.round(k.t * 10))); }); return set; };
  /** The tip of the hand bone on the stage (where to drag). */
  const tip = T => { const r = rigOf(), b = handBone(); if (!r || !b) return joints(T)[2]; const q = R().poseAt(r, S.time)[b.id], w = SB.xf.world(r).transformPoint(U.pt(q.tx, q.ty)); return [w.x, w.y]; };
  const bones = T => { const r = rigOf(); if (r) return r; const P = j => U.pt(...joints(T)[j]); const rig = R().make(P(0)); tree.rootList().unshift(rig); tree.reindex();
    const q0 = R().toRig(rig, P(0)), b1 = R().addBone(rig, { type: 'pt', x: q0.x, y: q0.y }, R().toRig(rig, P(1))); R().addBone(rig, { type: 'tail', bone: b1.id }, R().toRig(rig, P(2))); S.boneDraft = null; tree.select([rig.id]); return rig; };
  const keyNow = () => { tree.select([rigOf().id]); SB.ops.addKey(); };
  const menuRun = (o, path) => { let list = SB.menus.layerItems(o); for (const name of path) { const it = list.find(x => x && x.label && x.label.startsWith(name)); if (!it) return false; if (it.sub) list = it.sub; else { SB.menu.close(); it.run(); return true; } } return false; };
  const openMenu = o => { const r = document.getElementById('stageDoc').getBoundingClientRect(); tree.select([o.id]); SB.menu.open(r.left + r.width * 0.5, r.top + r.height * 0.45, SB.menus.layerItems(o)); };
  SB.tours.add({
    id: 'basic-rig', group: '5 Rigs and controllers', title: 'Bones and rigs', minutes: 5, level: 'Medium',
    blurb: 'Give an arm bones and make it wave.',
    desc: 'Bones bend a drawing like a skeleton bends a body. You add two bones to an arm, make the arm bend with them, then pose and keyframe a wave.',
    learn: ['The Bones tool', 'Making a layer bend with bones', 'Posing by dragging a bone', 'Keyframes and going back to the start'],
    preview(c, t, w, h) {
      c.fillStyle = '#F2F7FF'; c.fillRect(0, 0, w, h);
      const a1 = -0.3 + Math.sin(t * 3) * 0.3, a2 = a1 - 0.5 + Math.sin(t * 3 + 0.8) * 0.45, x0 = 60, y0 = h * 0.72, l = 82;
      const x1 = x0 + Math.cos(a1) * l, y1 = y0 + Math.sin(a1) * l, x2 = x1 + Math.cos(a2) * l, y2 = y1 + Math.sin(a2) * l;
      c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = '#E07B4F'; c.lineWidth = 26; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.lineTo(x2, y2); c.stroke();
      c.fillStyle = '#F4A582'; c.beginPath(); c.arc(x2, y2, 20, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#C2369A'; c.lineWidth = 3; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.lineTo(x2, y2); c.stroke();
      for (const [x, y] of [[x0, y0], [x1, y1], [x2, y2]]) { c.fillStyle = '#fff'; c.beginPath(); c.arc(x, y, 6, 0, Math.PI * 2); c.fill(); c.stroke(); }
    },
    setup(T) {
      const o = tree.make('draw', { name: 'Arm', start: 0, dur: S.project.duration, play: 'loop' }), pts = []; for (let x = -L; x <= L; x += 20) pts.push(x, 0);
      o.frames = [{ strokes: [{ c: '#E07B4F', s: 70, pts }, { c: '#F4A582', s: 104, pts: [L, 0, L + 0.1, 0] }] }]; /* a straight arm with a round hand on its end */
      S.objects.push(o); tree.reindex(); tree.select([o.id]); SB.tool.set('select');
    },
    steps: [
      { say: 'Let’s make this arm wave. We’ll give it bones, like a skeleton.' },
      { say: 'Pick the Bones tool.', key: 'tBone', show: at.toolIn('Bones'), mouse: at.toolHow('Bones'), task: { check: () => S.tool === 'bone', doIt: () => SB.tool.set('bone') } },
      { say: 'Click dot 1 (shoulder), then dot 2 (elbow), then dot 3 (hand).', allow: ['stage'], mouse: 'left', at: T => joints(T)[0], keys: ['Shift'],
        ghost: T => joints(T).map((p, i) => ({ dot: p, label: String(i + 1) })),
        task: { check: () => { const r = rigOf(); return !!r && r.bones.length >= 2; }, hint: 'Click once on each pink dot, from left to right.', doIt: T => { const r = bones(T); S.boneDraft = { rig: r.id, from: { type: 'tail', bone: r.bones[r.bones.length - 1].id } }; } } },
      { say: 'Double-click dot 3 to finish the bones.', allow: ['stage'], mouse: 'double', at: T => joints(T)[2], ghost: T => [{ dot: joints(T)[2], label: 'double-click' }],
        task: { check: () => !S.boneDraft && !!rigOf(), doIt: () => { S.boneDraft = null; SB.commit(); } } },
      { say: 'The bones are there, but the arm does not know about them yet. Right-click the Arm layer.', show: at.row('Arm'), mouse: 'right', task: { check: is.menuOpen, doIt: T => openMenu(arm(T)) } },
      { say: 'Choose Rig, then Bend with a rig.', show: at.item('Bend with a rig', 'Rig'), mouse: 'left', task: { check: T => S.picking || (rigOf() && R().bendsWith(arm(T), rigOf())), doIt: T => { bones(T); menuRun(arm(T), ['Rig', 'Bend with a rig']); } } },
      { say: 'Now click a bone on the stage.', allow: ['stage'], mouse: 'left', at: T => joints(T)[1], task: { check: T => !!rigOf() && R().bendsWith(arm(T), rigOf()), doIt: T => { if (S.picking && SB.picker.cancel) SB.picker.cancel(); R().bindTo(arm(T), bones(T), null, 'deform'); } } },
      { say: 'Pick the Select tool.', key: 'tSelect', show: at.toolIn('Select'), mouse: at.toolHow('Select'), task: { check: () => S.tool === 'select', doIt: () => SB.tool.set('select') } },
      { say: 'Drag the end of the hand up. The arm bends!', allow: ['stage'], mouse: 'drag', at: tip, ghost: T => { const p = tip(T); return [{ arrow: [p[0], p[1], p[0] - 60, p[1] - 160] }]; },
        task: { check: posedNow, hint: 'Grab the little circle at the end of the arm and pull it up.', doIt: () => { const r = rigOf(); TR.set(r, 'bone:' + handBone().id, -50); } } },
      { say: 'Press K to keep this pose. That is your first keyframe.', key: 'key', enter: () => { const r = rigOf(); if (r) tree.select([r.id]); }, show: at.title('Add a keyframe'), task: { check: () => keyTimes().size >= 1, doIt: keyNow } },
      { say: 'Click the ruler at 1 second.', show: at.rulerAt(1), allow: [at.ruler], mouse: 'left', task: { check: T => T.timeAt(1), doIt: () => SB.time.set(1) } },
      { say: 'Drag the hand down this time.', allow: ['stage'], mouse: 'drag', at: tip, ghost: T => { const p = tip(T); return [{ arrow: [p[0], p[1], p[0] - 40, p[1] + 200] }]; },
        task: { check: () => Math.abs((TR.now(rigOf(), 'bone:' + handBone().id) || 0) - angle(0)) > 20, doIt: () => TR.set(rigOf(), 'bone:' + handBone().id, 40) } },
      { say: 'Press K again. That is your second keyframe.', key: 'key', enter: () => { const r = rigOf(); if (r) tree.select([r.id]); }, show: at.title('Add a keyframe'), task: { check: () => keyTimes().size >= 2, doIt: keyNow } },
      { say: 'Go back to the start before we play. Press Home, or click the button.', key: 'home', show: at.title('Go to start'), mouse: 'left', task: { check: T => T.timeAt(0, 0.05), doIt: () => { SB.time.pause(); SB.time.set(0); } } },
      { say: 'Play it: a wave!', key: 'play', show: '#btnPlay', task: { check: () => S.playing, doIt: () => SB.time.play() } },
      { tip: true, free: true, say: 'Drag the last bone’s tip to pull the whole chain (that is IK). Hold Shift to turn in steps of 15 degrees.' },
      { practice: true, free: true, say: 'Stop, click the ruler at 2 seconds, pose the hand, and press K. A longer wave!', allow: ['stage', at.ruler, '#tl', '#btnPlay'], keys: ['K', 'Space', 'Shift'], mouse: 'drag', at: tip, enter: () => SB.time.pause(),
        task: { check: () => keyTimes().has(20) && keyTimes().size >= 3, hint: 'Ruler at 2 seconds, drag the hand somewhere new, press K.', doIt: () => { SB.time.set(2); TR.set(rigOf(), 'bone:' + handBone().id, -30); keyNow(); } } },
    ],
    outro: 'Your arm waves. Next: “Controllers: eyes that follow” moves things with a knob.',
  });
})(window.SB);
