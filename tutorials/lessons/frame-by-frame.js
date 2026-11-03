/* Tutorial: a bouncing ball drawn frame by frame, with the drawing modes and onion skin (format: js/tours/tours.js). */
'use strict';
(function (SB) {
  const S = SB.state, tree = SB.tree, U = SB.util, at = SB.tours.at;
  const ball = T => T.o('Ball');
  const oval = (cx, cy, rx, ry) => { const pts = []; for (let i = 0; i <= 36; i++) { const a = i / 36 * Math.PI * 2; pts.push(Math.round(cx + Math.cos(a) * rx), Math.round(cy + Math.sin(a) * ry)); } return pts; };
  /** Spots (stage pixels) for the balls. */
  const spot = T => ({ top: [T.W / 2, T.H * 0.2], mid: [T.W / 2, T.H * 0.48], floor: [T.W / 2, T.H * 0.82 - 45], up: [T.W / 2, T.H * 0.5], again: [T.W / 2, T.H * 0.22] });
  const drawnAt = (T, i, p, tol = 130) => { const o = ball(T); return !!o && o.frames.length > i && SB.frames.currentIndex(o) === i && T.near(o, p, tol).length > 0; };
  /** Draw a ball in frame i (what Skip does). Local coordinates of the layer. */
  const put = (T, i, p, rx, ry, extra) => { const o = ball(T), M = SB.xf.world(o).inverse(), q = oval(p[0], p[1], rx, ry), pts = []; for (let k = 0; k < q.length; k += 2) { const l = M.transformPoint(U.pt(q[k], q[k + 1])); pts.push(U.r1(l.x), U.r1(l.y)); }
    while (o.frames.length <= i) o.frames.push({ strokes: [] }); o.frames[i].strokes.push(extra && extra.f ? { f: 1, c: extra.c, loops: [pts] } : { c: '#24213F', s: 8, pts }); SB.frames.go(o, i); };
  const addFrame = T => { tree.select([ball(T).id]); SB.frames.act('add'); };
  SB.tours.add({
    id: 'frame-by-frame', group: '4 Animation', title: 'Frame by frame', minutes: 5, level: 'Easy',
    blurb: 'Draw a bouncing ball, one picture at a time.',
    desc: 'The oldest kind of animation: you draw every picture, and playing them fast makes them move. You draw a bouncing ball in four frames and meet the drawing modes, the Fill brush and onion skin.',
    learn: ['Adding frames in the frames bar', 'Onion skin', 'Detailed or Simple curve lines', 'Painting a frame with the Fill brush', 'Playing and the speed of a loop'],
    preview(c, t, w, h) {
      c.fillStyle = '#FFF8EE'; c.fillRect(0, 0, w, h); c.strokeStyle = '#24213F'; c.lineWidth = 3; c.beginPath(); c.moveTo(20, h - 30); c.lineTo(w - 20, h - 30); c.stroke();
      const f = Math.floor(t * 6) % 4, ys = [50, 100, 0, 100], sq = f === 2; c.lineWidth = 5; c.fillStyle = '#FF8A3D';
      c.beginPath(); c.ellipse(w / 2, sq ? h - 30 - 22 : ys[f], sq ? 40 : f === 1 ? 24 : 28, sq ? 22 : f === 1 ? 34 : 28, 0, 0, Math.PI * 2); c.fill(); c.stroke();
      c.fillStyle = 'rgba(36,33,63,.5)'; c.font = '600 13px system-ui, sans-serif'; c.fillText(`frame ${f + 1}`, 14, 22);
    },
    setup(T) {
      const p = S.project, g = tree.make('draw', { name: 'Ground', start: 0, dur: p.duration, locked: true, play: 'loop' });
      g.frames = [{ strokes: [{ c: '#24213F', s: 6, pts: [-p.w * 0.4, p.h * 0.32, p.w * 0.4, p.h * 0.32] }] }];
      const o = tree.make('draw', { name: 'Ball', start: 0, dur: p.duration, play: 'loop', fps: 6 });
      S.objects.push(o, g); tree.reindex(); tree.select([o.id]); S.onion = true; S.brushMode = 'free'; S.brush.color = '#24213F'; S.brush.size = 8; S.brushId = 'pen';
    },
    steps: [
      { say: 'Let’s make a bouncing ball: four drawings, played fast. Just like old cartoons!' },
      { say: 'Pick the Brush.', key: 'tBrush', show: at.toolIn('Brush'), mouse: at.toolHow('Brush'), task: { check: () => S.tool === 'brush', doIt: () => SB.tool.set('brush') } },
      { say: 'Frame 1: draw a ball inside the pink circle.', allow: ['stage'], mouse: 'drag', at: T => spot(T).top, ghost: T => [{ circle: [...spot(T).top, 70], label: 'Frame 1' }], keys: ['Shift'],
        task: { check: T => drawnAt(T, 0, spot(T).top), hint: 'Hold the mouse button and draw round, inside the dashed circle.', doIt: T => put(T, 0, spot(T).top, 60, 60) } },
      { say: 'This is the frames bar. Each little picture is one frame.', show: '#framesBar' },
      { say: 'Click + to add frame 2.', show: '#framesBar .th.add', mouse: 'left', task: { check: T => ball(T).frames.length >= 2, doIt: addFrame } },
      { say: 'See the faint ball? That is onion skin: the frame before. It helps you place the next one.', show: at.title('Onion skin') },
      { say: 'Two ways to draw. Detailed keeps every wiggle. Simple curve makes a clean path. Pick Simple curve.', show: () => [...document.querySelectorAll('#ctxbar button')].find(b => /Simple curve/.test(b.textContent)), mouse: 'left', task: { check: () => S.brushMode === 'vector', doIt: () => { S.brushMode = 'vector'; SB.invalidate('ctxbar'); } } },
      { say: 'Frame 2: the ball falls and stretches. Draw a tall oval.', allow: ['stage'], mouse: 'drag', at: T => spot(T).mid, ghost: T => [{ ellipse: [...spot(T).mid, 55, 85], label: 'Frame 2' }],
        task: { check: T => drawnAt(T, 1, spot(T).mid), hint: 'One smooth line around the dashed oval. Simple curve cleans it up for you.', doIt: T => put(T, 1, spot(T).mid, 50, 80) } },
      { say: 'Add frame 3.', show: '#framesBar .th.add', mouse: 'left', task: { check: T => ball(T).frames.length >= 3, doIt: addFrame } },
      { say: 'The Fill brush paints a solid shape with no outline. Right-click (or hold) the Brush button and pick it.', key: 'tFillBrush', show: at.toolIn('Fill brush', 'Brush'), allow: ['.toolgrp'], mouse: at.toolHow('Fill brush'), task: { check: () => S.tool === 'fillbrush', hint: 'Right-click or press and hold the Brush button, then click Fill brush in the little list. Shift+G does it too.', doIt: () => SB.tool.set('fillbrush') } },
      { say: 'Frame 3: paint the ball squashed flat on the ground.', allow: ['stage', '#ctxbar'], mouse: 'drag', at: T => spot(T).floor, ghost: T => [{ ellipse: [...spot(T).floor, 95, 45], label: 'Frame 3' }],
        task: { check: T => drawnAt(T, 2, spot(T).floor), hint: 'Draw around the dashed oval. It fills with color.', doIt: T => put(T, 2, spot(T).floor, 85, 40, { f: 1, c: '#FF8A3D' }) } },
      { say: 'Add frame 4. Then draw the ball back in the air.', show: '#framesBar .th.add', mouse: 'left', task: { check: T => ball(T).frames.length >= 4, doIt: addFrame } },
      { say: 'Frame 4: pick the Brush again and draw a round ball in the air.', allow: ['stage', '#rail', '#ctxbar', '.toolgrp'], mouse: 'drag', at: T => spot(T).up, keys: ['B', 'Shift'], ghost: T => [{ circle: [...spot(T).up, 65], label: 'Frame 4' }],
        task: { check: T => drawnAt(T, 3, spot(T).up), hint: 'Press B for the Brush, then draw inside the dashed circle.', doIt: T => put(T, 3, spot(T).up, 60, 60) } },
      { say: 'Play it!', key: 'play', show: '#btnPlay', task: { check: () => S.playing, doIt: () => SB.time.play() } },
      { say: 'Speed is frames per second. Type 4 here to slow the ball down.', show: () => document.querySelector('#framesBar input[aria-label="Speed"]'), mouse: 'left', task: { check: T => ball(T).fps !== 6, doIt: T => { ball(T).fps = 4; SB.commit(); } } },
      { say: 'Press Space to stop.', key: 'play', show: '#btnPlay', task: { check: () => !S.playing, doIt: () => SB.time.pause() } },
      { tip: true, free: true, say: 'Press , and . to step through frames. Ctrl-click or Shift-click frames to pick several, then copy, drag or delete them.' },
      { practice: true, free: true, say: 'Add a 5th frame and draw the ball near the top again, a little lower than frame 1.', allow: ['stage', '#framesBar', '#rail', '#ctxbar', '.toolgrp'], keys: ['B', 'Shift'], mouse: 'drag', at: T => spot(T).again, ghost: T => [{ circle: [...spot(T).again, 65], label: 'Frame 5' }],
        task: { check: T => ball(T).frames.length >= 5 && T.near(ball(T), spot(T).again, 150).length > 0 && ball(T).frames[4].strokes.length > 0, hint: 'Click + in the frames bar, then draw a ball near the top.', doIt: T => { if (ball(T).frames.length < 5) addFrame(T); put(T, 4, spot(T).again, 60, 60); } } },
    ],
    outro: 'Your ball bounces! Add more frames in between to make it smoother and livelier. Next: “Storyboard”.',
  });
})(window.SB);
