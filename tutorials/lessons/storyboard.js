/* Tutorial: a storyboard with the drawing tools. A drawing layer in Hold mode with Auto key on: every drawing made at a new time becomes a new held frame (format: js/tours/tours.js). */
'use strict';
(function (SB) {
  const S = SB.state, tree = SB.tree, U = SB.util, at = SB.tours.at, F = SB.frames;
  const rocket = T => T.o('Rocket');
  const oval = (cx, cy, rx, ry, n = 36) => { const pts = []; for (let i = 0; i <= n; i++) { const a = i / n * Math.PI * 2; pts.push(Math.round(cx + Math.cos(a) * rx), Math.round(cy + Math.sin(a) * ry)); } return pts; };
  /** Where the rocket is in each shot (stage pixels): on the ground, in the air, high in the sky. */
  const spot = T => ({ ground: [T.W / 2, T.H * 0.82 - 100], air: [T.W / 2, T.H * 0.5], sky: [T.W / 2, T.H * 0.2], star: [T.W * 0.75, T.H * 0.3] });
  const frameAt = (T, t) => { const o = rocket(T); return o && o.frames[F.index(o, t)]; };
  const keyAtTime = (T, t) => !!rocket(T) && ((rocket(T).tracks || {}).frame || []).some(k => Math.abs(k.t - t) < 0.2);
  /** Is there a drawing near stage point p in the frame shown at time t? */
  const drawnAt = (T, t, p, tol = 150) => {
    const o = rocket(T), fr = frameAt(T, t); if (!o || !fr || !keyAtTime(T, t)) return false; const M = SB.xf.world(o);
    return fr.strokes.some(s => { if (s.er) return false; const b = SB.paths.bounds([s]); if (!U.boxOk(b)) return false; const q = M.transformPoint(U.pt((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2)); return Math.hypot(q.x - p[0], q.y - p[1]) <= tol; });
  };
  /** Draw a shot at time t, the way Auto key does it in Hold mode (what "Do it for me" does). */
  const drawShot = (T, t, p, rx = 45, ry = 95) => {
    const o = rocket(T); tree.select([o.id]); o.play = 'library'; S.autoKey = true; SB.invalidate('transport'); SB.time.set(t); F.autoFrame(o);
    const M = SB.xf.world(o).inverse(), q = oval(p[0], p[1], rx, ry), pts = []; for (let k = 0; k < q.length; k += 2) { const l = M.transformPoint(U.pt(q[k], q[k + 1])); pts.push(U.r1(l.x), U.r1(l.y)); }
    F.current(o).strokes.push({ c: '#24213F', s: 8, pts }); SB.commit(); SB.invalidate('frames', 'timeline');
  };
  const holdSelect = () => document.querySelector('#framesBar select');
  SB.tours.add({
    id: 'storyboard', group: '4 Animation', title: 'Storyboard: one drawing per shot', minutes: 4, level: 'Easy', duration: 4,
    blurb: 'Draw a rocket launch shot by shot: Auto key makes the frames.',
    desc: 'A storyboard is a row of sketches, one for each moment. Put a drawing layer in Hold mode, turn Auto key on, and every drawing you make at a new time becomes its own frame, held until the next one. You sketch a rocket launch and play it.',
    learn: ['Hold: a frame stays until the next one', 'Auto key makes a new frame for each new drawing', 'Drawing a shot at a time on the ruler', 'Playing the storyboard'],
    preview(c, t, w, h) {
      c.fillStyle = '#F4F2FF'; c.fillRect(0, 0, w, h); const cur = Math.floor((t % 3)), pw = w * 0.27, ph = h * 0.5, gap = w * 0.035, x0 = (w - 3 * pw - 2 * gap) / 2, y = h * 0.26;
      for (let i = 0; i < 3; i++) {
        const x = x0 + i * (pw + gap); c.fillStyle = '#fff'; c.strokeStyle = i === cur ? '#5B3DF5' : '#C9C4E6'; c.lineWidth = i === cur ? 4 : 2; c.beginPath(); c.roundRect(x, y, pw, ph, 8); c.fill(); c.stroke();
        c.strokeStyle = '#24213F'; c.lineWidth = 3; c.beginPath(); c.moveTo(x + 8, y + ph - 12); c.lineTo(x + pw - 8, y + ph - 12); c.stroke();
        const ry = y + ph - 12 - 22 - i * (ph - 70) / 2; c.fillStyle = '#FF4F8B'; c.beginPath(); c.ellipse(x + pw / 2, ry, 11, 22, 0, 0, 7); c.fill(); c.stroke();
        c.fillStyle = '#6B6789'; c.font = '600 12px system-ui, sans-serif'; c.textAlign = 'center'; c.fillText('Shot ' + (i + 1), x + pw / 2, y + ph + 20);
      }
    },
    setup(T) {
      const p = S.project, g = tree.make('draw', { name: 'Ground', start: 0, dur: p.duration, locked: true, play: 'loop' });
      g.frames = [{ strokes: [{ c: '#24213F', s: 6, pts: [-p.w * 0.4, p.h * 0.32, p.w * 0.4, p.h * 0.32] }] }];
      const o = tree.make('draw', { name: 'Rocket', start: 0, dur: p.duration, play: 'loop' });
      S.objects.push(o, g); tree.reindex(); tree.select([o.id]); S.brushMode = 'free'; S.brush.color = '#24213F'; S.brush.size = 8; S.brushId = 'pen'; S.autoKey = false; SB.tool.set('brush');
    },
    steps: [
      { say: 'A storyboard is a row of sketches, one per shot. Let’s sketch a rocket launch, and then play it.' },
      { say: 'Frames can loop, or Hold: a frame stays on screen until a keyframe picks another. Storyboards need Hold. Choose it in the frames bar.', show: holdSelect, mouse: 'left',
        task: { check: T => !!rocket(T) && rocket(T).play === 'library', hint: 'At the bottom is the frames bar. Open the menu that says Loop and pick Hold.', doIt: T => { const o = rocket(T); o.play = 'library'; o.frame = F.currentIndex(o); SB.commit(); } } },
      { say: 'Turn Auto key on. Now each drawing you make at a new time becomes a new frame, all by itself.', show: at.title('Auto key'), mouse: 'left', task: { check: () => S.autoKey, doIt: () => { S.autoKey = true; SB.invalidate('transport'); } } },
      { say: 'Shot 1, at 0 seconds: draw the rocket on the ground, around the dashed oval.', allow: ['stage'], mouse: 'drag', at: T => [spot(T).ground[0], spot(T).ground[1] - 95], keys: ['Shift'], ghost: T => [{ ellipse: [...spot(T).ground, 45, 95], label: 'Shot 1' }],
        task: { check: T => drawnAt(T, 0, spot(T).ground), hint: 'Hold the mouse button and draw one tall oval around the dashed one.', doIt: T => drawShot(T, 0, spot(T).ground) } },
      { say: 'Click the ruler at 1 second. That is where shot 2 goes.', show: at.rulerAt(1), allow: [at.ruler], mouse: 'left', task: { check: T => T.timeAt(1, 0.12), doIt: () => SB.time.set(1) } },
      { say: 'Shot 2: the rocket lifts off. Draw it in the middle.', allow: ['stage'], mouse: 'drag', at: T => [spot(T).air[0], spot(T).air[1] - 95], keys: ['Shift'], ghost: T => [{ ellipse: [...spot(T).air, 45, 95], label: 'Shot 2' }],
        task: { check: T => drawnAt(T, 1, spot(T).air) && rocket(T).frames.length >= 2, hint: 'Same tall oval, but in the middle of the screen. A new frame appears by itself.', doIt: T => drawShot(T, 1, spot(T).air) } },
      { say: 'See the frame library? Shot 2 is a new frame, keyed at 1 second. You did not add it: Auto key did.', show: '#framesBar' },
      { say: 'Click the ruler at 2 seconds.', show: at.rulerAt(2), allow: [at.ruler], mouse: 'left', task: { check: T => T.timeAt(2, 0.12), doIt: () => SB.time.set(2) } },
      { say: 'Shot 3: the rocket is high in the sky.', allow: ['stage'], mouse: 'drag', at: T => [spot(T).sky[0], spot(T).sky[1] - 95], keys: ['Shift'], ghost: T => [{ ellipse: [...spot(T).sky, 45, 95], label: 'Shot 3' }],
        task: { check: T => drawnAt(T, 2, spot(T).sky) && rocket(T).frames.length >= 3, hint: 'Draw the oval near the top of the screen.', doIt: T => drawShot(T, 2, spot(T).sky) } },
      { say: 'Turn Auto key off again, so nothing changes by accident.', show: at.title('Auto key'), mouse: 'left', task: { check: () => !S.autoKey, doIt: () => { S.autoKey = false; SB.invalidate('transport'); } } },
      { say: 'Go back to the start. Press Home.', key: 'home', show: at.title('Go to start'), mouse: 'left', task: { check: T => T.timeAt(0, 0.05), doIt: () => { SB.time.pause(); SB.time.set(0); } } },
      { say: 'Play it: your sketches show one after another!', key: 'play', show: '#btnPlay', task: { check: () => S.playing, doIt: () => SB.time.play() } },
      { tip: true, free: true, say: 'Smooth, Width and Pull make a copy of the frame as a new shot, so you can change a drawing and keep the one before. Click a frame in the library to see it again.' },
      { practice: true, free: true, say: 'Stop, then add shot 4: click the ruler at 3 seconds and draw a star (or anything you like) in the sky. Auto key must be on.', allow: ['stage', at.ruler, '#tl', '#btnPlay', at.title('Auto key')], keys: ['Space'], mouse: 'drag', at: T => spot(T).star, ghost: T => [{ circle: [...spot(T).star, 60], label: 'Shot 4' }], enter: () => { SB.time.pause(); SB.tool.set('brush'); },
        task: { check: T => rocket(T).frames.length >= 4 && keyAtTime(T, 3) && T.timeAt(3, 0.2), hint: 'Three steps: Auto key on, the ruler at 3 seconds, then draw anything.', doIt: T => { drawShot(T, 3, spot(T).star, 60, 60); S.autoKey = false; SB.invalidate('transport'); } } },
    ],
    outro: 'That is a storyboard that plays. Draw one shot per idea, then fine-tune the timing by dragging the frame keys on the timeline. Next: “Bones and rigs”.',
  });
})(window.SB);
