/* Tutorial: advanced rigs. Weights (brush, gradient, lasso, smooth) and smooth bending (format: js/tours/tours.js). */
'use strict';
(function (SB) {
  const S = SB.state, tree = SB.tree, TR = SB.tracks, U = SB.util, at = SB.tours.at;
  const R = () => SB.rig;
  const arm = T => T.o('Arm');
  const rigOf = () => R().rigs().find(r => r.bones && r.bones.length) || null;
  const bone = i => { const r = rigOf(); return r && r.bones[i] || null; };
  const L = 260;
  /** Elbow, hand end and other spots (stage pixels). */
  const G = T => { const x = T.W / 2, y = T.H / 2; return { sh: [x - L, y], el: [x, y], hand: [x + L, y], handArea: [x + 170, y, 75], loop: [x + 110, y - 120, x + 240, y - 120, x + 240, y + 120, x + 110, y + 120, x + 110, y - 120], shoulder: [x - 170, y, 75] }; };
  const tip = T => { const r = rigOf(), b = bone(1); if (!r || !b) return G(T).hand; const q = R().poseAt(r, S.time)[b.id], w = SB.xf.world(r).transformPoint(U.pt(q.tx, q.ty)); return [w.x, w.y]; };
  const dabs = (T, b, kind) => { const a = arm(T), p = a && a.bind && a.bind.paint && a.bind.paint[b && b.id]; return (p || []).filter(d => kind === 'paint' ? typeof d[0] === 'number' : d[0] === kind); };
  const posedNow = () => { const r = rigOf(); return !!r && r.bones.some(b => Math.abs(TR.now(r, 'bone:' + b.id) || 0) > 4); };
  const P = p => U.pt(p[0], p[1]);
  const wmode = (m) => { S.wpaint.mode = m; SB.tool.set('weights'); SB.invalidate('ctxbar', 'inspector'); };
  const boneBtn = i => () => { const b = bone(i); return b && [...document.querySelectorAll('#inspector .bonelist button')].find(x => x.textContent.trim().startsWith(b.name)); };
  const wBtn = word => () => [...document.querySelectorAll('#inspector .bone-w button')].find(b => b.textContent.trim().startsWith(word));
  const modeMenuBtn = () => [...document.querySelectorAll('#ctxbar button')].find(b => /▾/.test(b.textContent));
  const bendCtrl = () => tree.all().find(o => o.type === 'null' && /bend/i.test(o.name));
  SB.tours.add({
    id: 'advanced-rig', group: '5 Rigs and controllers', title: 'Advanced rigs: weights and bending', minutes: 7, level: 'Harder',
    blurb: 'Paint which parts each bone moves and make bones bend smoothly.',
    desc: 'A bending layer moves by weights: how strongly each bone pulls each part of it. You paint weights with the brush, a gradient and a lasso, even them out with Smooth, then split a bone into segments so it bends like rubber.',
    learn: ['What weights are', 'Paint weights, Gradient and Lasso', 'Smooth: evening out weights', 'Segments: bones that bend', 'Softness'],
    preview(c, t, w, h) {
      c.fillStyle = '#F2F7FF'; c.fillRect(0, 0, w, h); const a1 = Math.sin(t * 2.2) * 0.35, x0 = 56, y0 = h / 2 + 24, l = 92, x1 = x0 + l, y1 = y0, a2 = a1 * 1.4 - 0.2, x2 = x1 + Math.cos(a2) * l, y2 = y1 + Math.sin(a2) * l;
      let P = [[x0, y0], [x1, y1], [x2, y2]]; for (let k = 0; k < 3; k++) { const Q = [P[0]]; for (let i = 0; i < P.length - 1; i++) { const a = P[i], b = P[i + 1]; Q.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]); } Q.push(P[P.length - 1]); P = Q; } /* a smooth bend: rounded at the elbow */
      const mix = (u) => { const k = Math.max(0, Math.min(1, u)), A = k < 0.5 ? [91, 124, 250] : [60, 200, 120], B = k < 0.5 ? [60, 200, 120] : [229, 72, 77], f = k < 0.5 ? k * 2 : (k - 0.5) * 2; return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * f)).join(',')})`; };
      c.lineCap = 'round'; c.lineJoin = 'round'; c.lineWidth = 34;
      for (let i = 0; i < P.length - 1; i++) { c.strokeStyle = mix(i / (P.length - 2)); c.beginPath(); c.moveTo(P[i][0], P[i][1]); c.lineTo(P[i + 1][0], P[i + 1][1]); c.stroke(); } /* the weights: blue is the first bone, red the second */
      c.strokeStyle = '#24213F'; c.lineWidth = 3; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.lineTo(x2, y2); c.stroke();
      for (const [x, y] of [[x0, y0], [x1, y1], [x2, y2]]) { c.fillStyle = '#fff'; c.beginPath(); c.arc(x, y, 6, 0, Math.PI * 2); c.fill(); c.stroke(); }
    },
    setup(T) {
      const o = tree.make('draw', { name: 'Arm', start: 0, dur: S.project.duration, play: 'loop' }), pts = []; for (let x = -L; x <= L; x += 20) pts.push(x, 0);
      o.frames = [{ strokes: [{ c: '#E07B4F', s: 90, pts }] }];
      S.objects.push(o); tree.reindex();
      const rig = R().make(P(G(T).sh)); tree.rootList().unshift(rig); tree.reindex();
      const q0 = R().toRig(rig, P(G(T).sh)), b1 = R().addBone(rig, { type: 'pt', x: q0.x, y: q0.y }, R().toRig(rig, P(G(T).el))); R().addBone(rig, { type: 'tail', bone: b1.id }, R().toRig(rig, P(G(T).hand)));
      S.boneDraft = null; rig.showBones = true; R().bindTo(o, rig, null, 'deform'); tree.select([rig.id]); SB.tool.set('select'); S.selBone = null;
    },
    steps: [
      { say: 'This arm already bends with two bones. Now we make it bend better, with weights.' },
      { say: 'Weights say how much each bone moves each part. Drag the end of the hand up to see the bend.', allow: ['stage'], mouse: 'drag', at: tip, ghost: T => { const p = tip(T); return [{ arrow: [p[0], p[1], p[0] - 60, p[1] - 170] }]; },
        task: { check: posedNow, hint: 'Grab the little circle at the end of the arm and pull it up.', doIt: () => { const r = rigOf(); TR.set(r, 'bone:' + bone(1).id, -60); } } },
      { say: 'The Bones list is in the panel. Click the second bone.', show: boneBtn(1), mouse: 'left', task: { check: () => !!bone(1) && S.selBone === bone(1).id, hint: 'Select the rig first (click a bone on the stage), then use the list in the panel.', doIt: () => { tree.select([rigOf().id]); S.selBone = bone(1).id; SB.invalidate('inspector', 'ctxbar'); } } },
      { say: 'Click Paint weights. The colors show how much this bone moves the arm: red is a lot, blue is nothing.', show: wBtn('Paint'), mouse: 'left', task: { check: () => S.tool === 'weights', doIt: () => wmode('brush') } },
      { say: 'Paint over the hand end of the arm, inside the pink circle. The bone takes more of it.', allow: ['stage', '#ctxbar'], mouse: 'drag', at: T => G(T).handArea, ghost: T => [{ circle: G(T).handArea, label: 'paint here' }],
        task: { check: T => dabs(T, bone(1), 'paint').length > 0, hint: 'Hold the mouse button and scribble over the end of the arm.', doIt: T => { for (const dx of [-30, 0, 30, 60]) R().paint(rigOf(), bone(1).id, { x: G(T).handArea[0] + dx, y: G(T).handArea[1] }, 60, 0.8); SB.commit(); } } },
      { say: 'Gradient paints a smooth slope. In the panel, click Gradient.', show: wBtn('Gradient'), mouse: 'left', task: { check: () => S.tool === 'weights' && S.wpaint.mode === 'gradient', doIt: () => wmode('gradient') } },
      { say: 'Drag a line from the hand to the elbow. Full weight where you start, none where you end.', allow: ['stage'], mouse: 'drag', at: T => G(T).hand, ghost: T => [{ arrow: [G(T).hand[0], G(T).hand[1], G(T).el[0] + 30, G(T).el[1]] }],
        task: { check: T => dabs(T, bone(1), 'g').length > 0, hint: 'Press on the hand end, drag to the elbow and let go.', doIt: T => { R().gradient(rigOf(), bone(1).id, { x: G(T).hand[0], y: G(T).hand[1] }, { x: G(T).el[0] + 30, y: G(T).el[1] }, 0.8); SB.commit(); } } },
      { say: 'Lasso takes a whole area. Click Lasso in the panel.', show: wBtn('Lasso'), mouse: 'left', task: { check: () => S.tool === 'weights' && S.wpaint.mode === 'lasso', doIt: () => wmode('lasso') } },
      { say: 'Draw a loop around the hand end of the arm, along the pink box.', allow: ['stage'], mouse: 'drag', at: T => [G(T).loop[0], G(T).loop[1]], ghost: T => [{ poly: G(T).loop }],
        task: { check: T => dabs(T, bone(1), 'l').length > 0, hint: 'Draw a closed loop, big enough to go around the whole hand end.', doIt: T => { R().lasso(rigOf(), bone(1).id, G(T).loop.slice(0, 8), 'add', 6, 0.6); SB.commit(); } } },
      { say: 'Smooth evens weights out. Open the weight menu in the bar above the stage and choose Smooth.', show: modeMenuBtn, mouse: 'left', allow: [at.menu], task: { check: () => S.tool === 'weights' && S.wpaint.mode === 'smooth', hint: 'Click the button with the little arrow (Lasso or Brush) and pick Smooth.', doIt: () => wmode('smooth') } },
      { say: 'Brush across the elbow to blend the edge.', allow: ['stage'], mouse: 'drag', at: T => G(T).el, ghost: T => [{ line: [G(T).el[0] - 80, G(T).el[1], G(T).el[0] + 80, G(T).el[1]] }],
        task: { check: T => [...dabs(T, bone(1), 's'), ...dabs(T, bone(0), 's')].length > 0, hint: 'Hold the mouse button and brush back and forth over the elbow.', doIt: T => { R().smoothW(rigOf(), { x: G(T).el[0], y: G(T).el[1] }, 60, 0.5); SB.commit(); } } },
      { tip: true, free: true, say: 'Goal curve is the clever one. Pose the rig where it looks bad, then draw how the edge should look. The weights fix themselves.' },
      { say: 'Done with weights. Press Select, then click the second bone in the Bones list again.', key: 'tSelect', show: at.toolIn('Select'), mouse: at.toolHow('Select'), task: { check: () => S.tool === 'select', doIt: () => SB.tool.set('select') } },
      { say: 'Now smooth bending. In the bone’s card, set Segments to 4. The bone gets joints.', show: () => { const i = document.querySelector('#inspector input[aria-label="Segments"]'); return i && i.closest('.f'); }, mouse: 'left', task: { check: () => !!bone(1) && (bone(1).segs || 1) >= 2, hint: 'Find the “Segments” number in the panel, under the bone’s name, and type 4.', doIt: () => { const i = document.querySelector('#inspector input[aria-label="Segments"]'); if (i) { i.value = 4; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); } else bone(1).segs = 4; } } },
      { say: 'A bend controller appeared. Drag its knob to curl the bone.', allow: ['stage'], mouse: 'drag', at: T => { const c = bendCtrl(); return c ? [c.x, c.y] : G(T).hand; }, task: { check: () => !!bone(1) && !!bendCtrl() && Math.abs(TR.now(rigOf(), 'bonebend:' + bone(1).id) || 0) > 20, hint: 'The orange knob sits at the tip of the bone. Drag it up or down.', doIt: () => { const c = bendCtrl(); TR.set(c, 'y', (c.ry ?? c.y) - 60); SB.commit(); } } },
      { say: 'Last thing: Softness. Click the arm, then drag Softness in the panel up. The bend gets rounder.', allow: ['stage', '#inspector'], show: () => { const i = document.querySelector('#inspector input[aria-label="Softness"]'); return i && i.closest('.f'); }, enter: T => { tree.select([arm(T).id]); },
        task: { check: T => !!arm(T).bind && (arm(T).bind.soft || 60) >= 120, hint: 'Select the arm layer, then slide “Softness” in the Rig section to about 150.', doIt: T => { arm(T).bind.soft = 160; SB.commit(); } } },
      { tip: true, free: true, say: 'Attach to a bone keeps a layer stiff, good for a hat or a hand. Bend with a rig makes it stretch like skin, good for arms and tails.' },
      { practice: true, free: true, say: 'Pick the first bone in the list, choose Paint weights, and paint over the shoulder end.', allow: ['stage', '#inspector', '#ctxbar', at.menu], ghost: T => [{ circle: G(T).shoulder, label: 'shoulder' }], mouse: 'drag', at: T => G(T).shoulder,
        enter: T => { tree.select([rigOf().id]); },
        task: { check: T => dabs(T, bone(0), 'paint').length > 0, hint: 'Click the first bone in the Bones list, then Paint weights, then scribble over the shoulder.', doIt: T => { S.selBone = bone(0).id; wmode('brush'); for (const dx of [-20, 10, 40]) R().paint(rigOf(), bone(0).id, { x: G(T).shoulder[0] + dx, y: G(T).shoulder[1] }, 60, 0.8); SB.commit(); } } },
    ],
    outro: 'Now your bones move exactly the parts you want. Combine this with controllers to build a full character.',
  });
})(window.SB);
