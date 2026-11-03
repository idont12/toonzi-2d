/* Tutorial: Auto key. Blobby hops next to a flag with a flip: poses with no K (format: js/tours/tours.js). */
'use strict';
(function (SB) {
  const S = SB.state, tree = SB.tree, TR = SB.tracks, U = SB.util, at = SB.tours.at, art = SB.tours.art;
  const blob = T => T.o('Blobby');
  /** Where things are (stage pixels): Blobby's own point is the middle of his body, so he turns around it. gy: the ground. */
  const G = T => { const gy = Math.round(T.H * 0.8), r = 105; return { gy, r, start: [T.W * 0.14, gy - r], apex: [T.W * 0.46, gy - 520], land: [T.W * 0.76, gy - r], flag: [T.W * 0.9, gy] }; };
  const feet = (T, t) => { const o = blob(T), k = TR.transform(o, t ?? tree.localTime(o)), q = SB.xf.parentWorld(o).transformPoint(U.pt(k.x, k.y)); return [q.x, q.y]; };
  const near = (p, q, tol = 150) => Math.hypot(p[0] - q[0], p[1] - q[1]) <= tol;
  const rotAt = (T, t) => TR.transform(blob(T), t).rot;
  const keyNear = (T, id, t, tol = 0.25) => ((blob(T).tracks || {})[id] || []).some(k => Math.abs(k.t - t) <= tol);
  const set = (T, vals) => { tree.select([blob(T).id]); Object.keys(vals).forEach(k => TR.set(blob(T), k, vals[k])); SB.commit(); };
  const toLocal = (T, p) => { const l = SB.xf.parentWorld(blob(T)).inverse().transformPoint(U.pt(p[0], p[1])); return { x: U.r1(l.x), y: U.r1(l.y) }; };
  SB.tours.add({
    id: 'quick-hop', group: '4 Animation', title: 'Auto key: a hop with a flip', minutes: 3, level: 'Easy', duration: 4,
    blurb: 'Pose, move the playhead, pose again. Auto key does the keyframes.',
    desc: 'The fastest way to animate: turn on Auto key, go to a moment and change things. Every change is a keyframe, with no K to press. You make a blob hop across the screen with a flip in about three minutes.',
    learn: ['Auto key: every change becomes a keyframe', 'Posing at moments on the ruler', 'Moving and turning in one pose', 'Turning Auto key off again'],
    preview(c, t, w, h) {
      c.fillStyle = '#EAF6FF'; c.fillRect(0, 0, w, h); const gy = h * 0.78, u = (t % 3) / 3, ease = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2, x = w * 0.18 + ease * w * 0.64, up = Math.sin(Math.min(1, u * 1.15) * Math.PI) * h * 0.38;
      c.fillStyle = '#7BC77B'; c.fillRect(0, gy, w, h - gy); c.fillStyle = '#24213F'; c.fillRect(w * 0.84, gy - 44, 3, 44); c.fillStyle = '#E5484D'; c.beginPath(); c.moveTo(w * 0.84 + 3, gy - 44); c.lineTo(w * 0.84 + 25, gy - 36); c.lineTo(w * 0.84 + 3, gy - 28); c.fill();
      c.save(); c.translate(x, gy - up); c.rotate(Math.min(1, u * 1.15) * Math.PI * 2); c.fillStyle = '#3DBE6B'; c.beginPath(); c.arc(0, -24, 24, 0, 7); c.fill();
      c.fillStyle = '#fff'; c.beginPath(); c.arc(-8, -28, 6, 0, 7); c.arc(8, -28, 6, 0, 7); c.fill(); c.fillStyle = '#24213F'; c.beginPath(); c.arc(-6, -28, 3, 0, 7); c.arc(10, -28, 3, 0, 7); c.fill(); c.restore();
    },
    setup(T) {
      const D = S.project.duration, g = G(T), W = T.W; S.project.bg = '#EAF6FF';
      const ground = tree.make('shape', { name: 'Ground', shape: 'rect', w: W * 0.96, h: 120, fill: '#7BC77B', strokeW: 0, x: W / 2, y: g.gy + 60, start: 0, dur: D });
      const flag = tree.make('draw', { name: 'Flag', x: g.flag[0], y: g.flag[1], start: 0, dur: D, play: 'loop' });
      const b = tree.make('draw', { name: 'Blobby', x: g.start[0], y: g.start[1], start: 0, dur: D, play: 'loop' });
      S.objects.push(b, flag, ground); tree.reindex();
      const [fx, fy] = g.flag, [bx, by] = g.start, r = g.r;
      art.poly(flag, [fx, fy, fx, fy - 190], false, { s: 8 }); art.solid(flag, [fx + 4, fy - 190, fx + 120, fy - 150, fx + 4, fy - 110], '#E5484D', true);
      art.disc(b, bx, by, r, '#3DBE6B', false);
      art.disc(b, bx - 36, by - 20, 26, '#FFFFFF', true); art.disc(b, bx + 36, by - 20, 26, '#FFFFFF', true);
      art.disc(b, bx - 30, by - 18, 12, '#24213F', true); art.disc(b, bx + 42, by - 18, 12, '#24213F', true);
      art.path(b, [[bx - 34, by + 36, 24, 26], [bx + 34, by + 36, 24, -26]], false, { s: 8 });
      S.autoKey = false; tree.select([]); SB.tool.set('select');
    },
    steps: [
      { say: 'Auto key makes the keyframes for you. Let’s make Blobby hop to the flag with a flip.' },
      { say: 'Click Blobby to select him.', allow: ['stage'], mouse: 'left', at: T => G(T).start, task: { check: T => S.sel === blob(T).id, doIt: T => tree.select([blob(T).id]) } },
      { say: 'Turn Auto key on. From now on, every change you make is kept.', show: at.title('Auto key'), mouse: 'left', task: { check: () => S.autoKey, doIt: () => { S.autoKey = true; SB.invalidate('transport'); } } },
      { say: 'Click the ruler at 0.6 seconds: the top of the jump.', show: at.rulerAt(0.6), allow: [at.ruler], mouse: 'left', task: { check: T => T.timeAt(0.6, 0.12), doIt: () => SB.time.set(0.6) } },
      { say: 'Drag Blobby up into the circle.', allow: ['stage'], mouse: 'drag', at: T => G(T).start, ghost: T => [{ circle: [...G(T).apex, 90], label: 'up' }, { arrow: [...G(T).start, ...G(T).apex] }],
        task: { check: T => near(feet(T), G(T).apex) && keyNear(T, 'x', 0.6), hint: 'Press on Blobby and drag him until he is inside the dashed circle. No K needed.', doIt: T => set(T, toLocal(T, G(T).apex)) } },
      { say: 'Turn him half way round too: drag the round handle above him to the side.', allow: ['stage'], mouse: 'drag', at: T => { const p = feet(T); return [p[0], p[1] - G(T).r - 70]; }, ghost: T => { const p = feet(T); return [{ arrow: [p[0], p[1] - 190, p[0] + 190, p[1]] }]; },
        task: { check: T => Math.abs(rotAt(T, 0.6)) > 100, hint: 'Grab the small round handle above the box and swing it around him, half a turn.', doIt: T => set(T, { rot: 180 }) } },
      { say: 'Click the ruler at 1.2 seconds: the landing.', show: at.rulerAt(1.2), allow: [at.ruler], mouse: 'left', task: { check: T => T.timeAt(1.2, 0.12), doIt: () => SB.time.set(1.2) } },
      { say: 'Drag Blobby down next to the flag.', allow: ['stage'], mouse: 'drag', at: T => feet(T), ghost: T => [{ circle: [...G(T).land, 90], label: 'land' }, { arrow: [...feet(T), ...G(T).land] }],
        task: { check: T => near(feet(T), G(T).land) && keyNear(T, 'x', 1.2), hint: 'Drag him into the dashed circle by the flag.', doIt: T => set(T, toLocal(T, G(T).land)) } },
      { say: 'Finish the flip: turn him another half turn so he lands on his feet.', allow: ['stage'], mouse: 'drag', at: T => { const p = feet(T); return [p[0], p[1] - G(T).r - 70]; }, ghost: T => { const p = feet(T); return [{ arrow: [p[0], p[1] - 190, p[0] - 190, p[1]] }]; },
        task: { check: T => Math.abs(rotAt(T, 1.2)) > 280, hint: 'Swing the round handle around him, another half turn, until he is the right way up again.', doIt: T => set(T, { rot: 360 }) } },
      { say: 'Turn Auto key off again, so nothing changes by accident.', show: at.title('Auto key'), mouse: 'left', task: { check: () => !S.autoKey, doIt: () => { S.autoKey = false; SB.invalidate('transport'); } } },
      { say: 'Before we play, go back to the start. Press Home.', key: 'home', show: at.title('Go to start'), mouse: 'left', task: { check: T => T.timeAt(0, 0.05), doIt: () => { SB.time.pause(); SB.time.set(0); } } },
      { say: 'Play it: a hop with a flip, from two poses!', key: 'play', show: '#btnPlay', task: { check: () => S.playing, doIt: () => SB.time.play() } },
      { tip: true, free: true, say: 'Auto key records any change: color, size, opacity, even effects. To change how a move feels, right-click a key and pick an Ease like Bounce.' },
      { practice: true, free: true, say: 'Stop, turn Auto key on, click the ruler at 1.8 seconds and drag Blobby up high: a second hop.', allow: ['stage', at.ruler, '#tl', '#btnPlay', at.title('Auto key')], keys: ['Space'], mouse: 'drag', at: T => feet(T, 1.2), enter: T => { SB.time.pause(); tree.select([blob(T).id]); },
        task: { check: T => keyNear(T, 'y', 1.8, 0.25) && feet(T, 1.8)[1] < G(T).gy - 300, hint: 'Three steps: Auto key on, the ruler at 1.8 seconds, then drag him up.', doIt: T => { S.autoKey = true; SB.time.set(1.8); const p = G(T).land; set(T, toLocal(T, [p[0], p[1] - 330])); S.autoKey = false; SB.invalidate('transport'); } } },
    ],
    outro: 'Two poses, one flip, no K. Auto key is the quick way to block out any motion: pose, move the playhead, pose again. Next: “Frame by frame”.',
  });
})(window.SB);
