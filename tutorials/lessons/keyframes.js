/* Tutorial: keyframes, easing, Auto key and the motion path (format: js/tours/tours.js). */
'use strict';
(function (SB) {
  const S = SB.state, tree = SB.tree, TR = SB.tracks, U = SB.util, at = SB.tours.at, is = SB.tours.is;
  const ball = T => T.o('Ball');
  const spots = T => ({ a: [T.W * 0.18, T.H * 0.65], b: [T.W * 0.78, T.H * 0.65], c: [T.W * 0.5, T.H * 0.25], d: [T.W * 0.74, T.H * 0.38] });
  const pos = (T, t) => { const o = ball(T), k = TR.transform(o, t ?? tree.localTime(o)), q = SB.xf.parentWorld(o).transformPoint(U.pt(k.x, k.y)); return [q.x, q.y]; };
  const xkeys = T => (ball(T).tracks.x || []).length;
  const near = (p, q, tol = 140) => Math.hypot(p[0] - q[0], p[1] - q[1]) <= tol;
  const keyNow = T => { tree.select([ball(T).id]); SB.ops.addKey(); };
  const moveTo = (T, p) => { const o = ball(T), l = SB.xf.parentWorld(o).inverse().transformPoint(U.pt(p[0], p[1])); TR.set(o, 'x', U.r1(l.x)); TR.set(o, 'y', U.r1(l.y)); };
  /** Right-click an element (what Skip does when the step opens a menu). */
  const rightClick = el => { if (!el) return; const r = el.getBoundingClientRect(); el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 })); };
  SB.tours.add({
    id: 'keyframes', group: '1 Basics', title: 'Keyframes and tweens', minutes: 5, level: 'Easy', duration: 5,
    blurb: 'Make a ball travel with keys, easing and a bendy path.',
    desc: 'You say where the ball is at a few moments (keyframes) and the app fills in the motion between them (a tween). Then you add a bounce with easing, let Auto key do the work, and bend the path.',
    learn: ['Adding keyframes with K', 'Moving the playhead on the ruler', 'Going back to the start', 'Easing (bounce)', 'Auto key', 'Bending the motion path'],
    preview(c, t, w, h) {
      c.fillStyle = '#F4FFF8'; c.fillRect(0, 0, w, h); const u = (t % 2.4) / 2.4, e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
      const x = 40 + e * (w - 80), y = h * 0.65 - Math.sin(e * Math.PI) * h * 0.4;
      c.strokeStyle = 'rgba(36,33,63,.25)'; c.setLineDash([4, 4]); c.lineWidth = 2; c.beginPath(); for (let i = 0; i <= 40; i++) { const v = i / 40; c.lineTo(40 + v * (w - 80), h * 0.65 - Math.sin(v * Math.PI) * h * 0.4); } c.stroke(); c.setLineDash([]);
      for (const v of [0, 0.5, 1]) { c.fillStyle = '#5B3DF5'; c.save(); c.translate(40 + v * (w - 80), h * 0.65 - Math.sin(v * Math.PI) * h * 0.4); c.rotate(Math.PI / 4); c.fillRect(-5, -5, 10, 10); c.restore(); }
      c.fillStyle = '#1FB57A'; c.beginPath(); c.arc(x, y, 18, 0, Math.PI * 2); c.fill();
    },
    setup(T) {
      const [x, y] = spots(T).a, o = tree.make('shape', { name: 'Ball', shape: 'ellipse', w: 120, h: 120, fill: '#1FB57A', strokeW: 0, x, y, start: 0, dur: S.project.duration });
      S.objects.push(o); tree.reindex(); tree.select([]); SB.tool.set('select');
    },
    steps: [
      { say: 'Keyframes: you say where the ball is at a few moments. The app fills in the rest.' },
      { say: 'Click the ball to select it.', allow: ['stage'], mouse: 'left', at: T => spots(T).a, task: { check: T => S.sel === ball(T).id, doIt: T => tree.select([ball(T).id]) } },
      { say: 'Press K to add a keyframe at 0 seconds.', key: 'key', show: at.title('Add a keyframe'), task: { check: T => xkeys(T) >= 1, doIt: keyNow } },
      { say: 'See the diamond on the ball’s row? That is your keyframe.', show: at.row('Ball') },
      { say: 'Click the ruler at 2 seconds. The playhead jumps there.', show: at.rulerAt(2), allow: [at.ruler], mouse: 'left', task: { check: T => T.timeAt(2), doIt: () => SB.time.set(2) } },
      { say: 'Drag the ball into the pink circle.', allow: ['stage'], mouse: 'drag', at: T => pos(T), ghost: T => [{ circle: [...spots(T).b, 80] }, { arrow: [...pos(T), ...spots(T).b] }],
        task: { check: T => near(pos(T), spots(T).b), doIt: T => moveTo(T, spots(T).b) } },
      { say: 'Press K again to keep it there. That is your second keyframe.', key: 'key', show: at.title('Add a keyframe'), task: { check: T => xkeys(T) >= 2, doIt: keyNow } },
      { say: 'Before we play, go back to the start. Press Home, or click the button.', key: 'home', show: at.title('Go to start'), mouse: 'left', task: { check: T => T.timeAt(0, 0.05), doIt: () => { SB.time.pause(); SB.time.set(0); } } },
      { say: 'Now play. The ball slides between the keys. That is a tween.', key: 'play', show: '#btnPlay', task: { check: () => S.playing, doIt: () => SB.time.play() } },
      { say: 'Stop it.', key: 'play', show: '#btnPlay', task: { check: () => !S.playing, doIt: () => SB.time.pause() } },
      { say: 'Easing changes how it speeds up and slows down. Right-click the key at 2 seconds.', show: at.keyAt('Ball', 2), mouse: 'right', task: { check: is.menuOpen, hint: 'Right-click the little diamond on the ball’s row, at 2 seconds.', doIt: T => { tree.select([ball(T).id]); rightClick(at.keyAt('Ball', 2)(T)); } } },
      { say: 'Choose Ease, then Bounce.', show: at.item('Bounce', 'Ease'), mouse: 'left', task: { check: T => (ball(T).tracks.x || []).some(k => k.e === 'bounce'), doIt: T => { SB.menu.close(); (ball(T).tracks.x || []).forEach(k => { if (Math.abs(k.t - 2) < 0.05) k.e = 'bounce'; }); SB.commit(); } } },
      { say: 'Auto key makes keyframes for you whenever you change something. Turn it on.', show: at.title('Auto key'), mouse: 'left', task: { check: () => S.autoKey, doIt: () => { S.autoKey = true; SB.invalidate('transport'); } } },
      { say: 'Click the ruler at 4 seconds.', show: at.rulerAt(4), allow: [at.ruler], mouse: 'left', task: { check: T => T.timeAt(4), doIt: () => SB.time.set(4) } },
      { say: 'Drag the ball up into the circle. No K needed!', allow: ['stage'], mouse: 'drag', at: T => pos(T), ghost: T => [{ circle: [...spots(T).c, 80] }, { arrow: [...pos(T), ...spots(T).c] }],
        task: { check: T => xkeys(T) >= 3 && near(pos(T), spots(T).c), doIt: T => moveTo(T, spots(T).c) } },
      { say: 'Turn Auto key off again, so nothing changes by accident.', show: at.title('Auto key'), mouse: 'left', task: { check: () => !S.autoKey, doIt: () => { S.autoKey = false; SB.invalidate('transport'); } } },
      { say: 'The dotted line is the ball’s path. Drag the small round dot on it to bend the path.', allow: ['stage'], mouse: 'drag', at: T => pos(T, 1), enter: T => { tree.select([ball(T).id]); SB.tool.set('select'); },
        task: { check: T => (ball(T).tracks.x || []).some(k => k.ho || k.hi || k.cx != null), hint: 'With the ball selected, find the small white dot halfway along the dotted line and drag it.',
          doIt: T => { const X = ball(T).tracks.x, Y = ball(T).tracks.y; if (X && X[0] && Y && Y[0]) { X[0].ho = [150, -260]; if (X[1]) X[1].hi = [-150, -260]; SB.commit(); } } } },
      { say: 'Go to the start and play it all!', key: 'play', show: '#btnPlay', enter: () => { SB.time.pause(); SB.time.set(0); }, task: { check: () => S.playing, doIt: () => SB.time.play() } },
      { tip: true, free: true, say: 'Double-click the path to add a key there. Drag keyframes on the timeline to change their timing. Shift-click keys to pick several.' },
      { practice: true, free: true, say: 'Click the ruler at 3 seconds, drag the ball somewhere new, then press K.', allow: ['stage', at.ruler, '#tl'], keys: ['K'], mouse: 'drag', at: T => pos(T), enter: T => { SB.time.pause(); T.data.n = xkeys(T); tree.select([ball(T).id]); },
        task: { check: T => xkeys(T) > T.data.n && (ball(T).tracks.x || []).some(k => Math.abs(k.t - 3) < 0.2), hint: 'Three steps: ruler at 3 seconds, drag the ball, press K.', doIt: T => { SB.time.set(3); moveTo(T, spots(T).d); keyNow(T); } } },
    ],
    outro: 'The ball travels, bounces and curves. Try other eases next time, like Overshoot. Next: “Drawing: fills and shaping” colors a drawing.',
  });
})(window.SB);
