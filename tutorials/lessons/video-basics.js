/* Tutorial: video editing basics. Trim, move and cut clips in the timeline, with colored blocks (format: js/tours/tours.js). */
'use strict';
(function (SB) {
  const S = SB.state, tree = SB.tree, at = SB.tours.at;
  const red = T => T.o('Red'), blue = T => T.o('Blue'), green = T => T.o('Green');
  const parts = o => (o && o.parts ? o.parts.length : 1);
  /** A piece of a clip in the timeline (what to point at). */
  const clip = (name, sel = '') => T => { const o = T.o(name); return o && document.querySelector(`#tl .clip[data-id="${o.id}"]${sel}`); };
  SB.tours.add({
    id: 'video-basics', group: '2 Effects and video', title: 'Video editing basics', minutes: 4, level: 'Easy', duration: 6,
    blurb: 'Trim, move and cut clips in the timeline.',
    desc: 'Every layer is a clip in the timeline. You trim a clip by its edge, slide it to a new time and cut it in two, just like in a video editor. Three colored blocks stand in for real footage.',
    learn: ['Trim a clip by its edge', 'Move a clip in time', 'Cut a clip (right-click, the S key or the Cut tool)', 'Delete a part you do not need'],
    preview(c, t, w, h) {
      c.fillStyle = '#F4F1FF'; c.fillRect(0, 0, w, h); const rows = [['#FF4F4F', 0.08, 0.5], ['#3D7BFF', 0.38, 0.52], ['#2DBE7B', 0.12, 0.8]], u = (t % 4) / 4;
      rows.forEach(([col, a, d], i) => { const y = h * 0.16 + i * h * 0.26, x = w * a, ww = w * d * (i === 0 ? 1 - Math.min(0.35, Math.max(0, u - 0.2)) : 1); c.fillStyle = col; c.beginPath(); c.roundRect(x, y, ww, h * 0.18, 8); c.fill(); });
      const px = w * (0.08 + u * 0.84); c.fillStyle = '#24213F'; c.fillRect(px - 1.5, h * 0.08, 3, h * 0.84); c.beginPath(); c.arc(px, h * 0.08, 6, 0, 7); c.fill();
    },
    setup(T) {
      const D = S.project.duration, W = T.W, H = T.H;
      const g = tree.make('shape', { name: 'Green', shape: 'rect', w: W * 0.6, h: 150, fill: '#2DBE7B', strokeW: 0, x: W * 0.5, y: H * 0.8, start: 0, dur: D });
      const b = tree.make('shape', { name: 'Blue', shape: 'round', w: 260, h: 260, radius: 40, fill: '#3D7BFF', strokeW: 0, x: W * 0.68, y: H * 0.42, start: 3, dur: 3 });
      const r = tree.make('shape', { name: 'Red', shape: 'ellipse', w: 280, h: 280, fill: '#FF4F4F', strokeW: 0, x: W * 0.3, y: H * 0.42, start: 0, dur: D });
      S.objects.push(r, b, g); tree.reindex(); tree.select([]); SB.tool.set('select');
    },
    steps: [
      { say: 'Every layer is a clip in the timeline. Let’s cut this little film together.' },
      { say: 'Drag the right edge of the red clip to the left. That trims it.', show: clip('Red', ' .h.r'), allow: ['#tl'], mouse: 'drag',
        task: { check: T => !!red(T) && red(T).dur < 4.6, hint: 'Grab the very end of the red bar, and pull it to about the middle.', doIt: T => { red(T).dur = 3; SB.bump(); SB.commit(); } } },
      { say: 'The blue clip starts late. Drag its middle to the left to move it earlier.', show: clip('Blue'), allow: ['#tl'], mouse: 'drag',
        task: { check: T => !!blue(T) && blue(T).start < 2.2, hint: 'Press in the middle of the blue bar and slide it left.', doIt: T => { blue(T).start = 1; SB.bump(); SB.commit(); } } },
      { say: 'Now let’s cut the green clip. Click its name in the timeline first.', show: at.row('Green'), allow: ['#tl'], mouse: 'left',
        task: { check: T => !!green(T) && S.sel === green(T).id, doIt: T => tree.select([green(T).id]) } },
      { say: 'Click the ruler at 3 seconds. That is where the cut goes.', show: at.rulerAt(3), allow: [at.ruler], mouse: 'left', task: { check: T => T.timeAt(3, 0.12), doIt: () => SB.time.set(3) } },
      { say: 'Cut the green clip at the playhead: right-click it and choose Cut at the playhead.', key: 'split', keyLabel: 'Or select it and press', show: T => SB.menu.isOpen() ? at.item('Cut at the playhead')() : clip('Green')(T), mouse: () => SB.menu.isOpen() ? 'left' : 'right', allow: ['#tl', '#stageDoc'], keys: ['S'],
        task: { check: T => parts(green(T)) >= 2, hint: 'Right-click the green bar in the timeline, then click Cut at the playhead. The playhead is at 3 seconds.', doIt: T => { tree.select([green(T).id]); SB.time.set(3); SB.ops.split(green(T)); } } },
      { say: 'It is two parts now. Click the right part, then press Delete (or right-click it and choose Delete this part).', show: clip('Green', '[data-part="1"]'), allow: ['#tl'], keys: ['Delete'], mouse: 'left',
        task: { check: T => parts(green(T)) === 1, hint: 'The right part turns highlighted when it is picked. Then press Delete.', doIt: T => { tree.select([green(T).id]); SB.ops.removePart(green(T), 1); } } },
      { say: 'There is a second way to cut: the Cut tool, the scissors in the tool bar. Pick it.', key: 'razor', show: at.toolIn('Cut'), mouse: at.toolHow('Cut'), allow: ['#tl', '#stageDoc'], keys: ['C'],
        task: { check: () => S.tool === 'cut', hint: 'Click the scissors button in the tool bar, or press C.', doIt: () => SB.tool.set('cut') } },
      { say: 'Click the blue clip where you want to cut it.', show: clip('Blue'), allow: ['#tl'], mouse: 'left',
        task: { check: T => parts(blue(T)) >= 2, hint: 'A line follows your pointer on the clip. Click to cut there.', doIt: T => SB.ops.cutAt(blue(T), (blue(T).start || 0) + 1.5) && SB.commit() } },
      { say: 'Put the scissors away: pick the Select tool.', key: 'razor', show: at.toolIn('Select'), mouse: at.toolHow('Select'), keys: ['C', 'Escape'], allow: ['#tl', '#stageDoc'],
        task: { check: () => S.tool !== 'cut', hint: 'Click the arrow at the top of the tool bar.', doIt: () => SB.tool.set('select') } },
      { say: 'Press play and watch your edit.', key: 'play', show: '#btnPlay', enter: () => { SB.time.pause(); SB.time.set(0); }, task: { check: () => S.playing, doIt: () => SB.time.play() } },
      { say: 'Stop it.', key: 'play', show: '#btnPlay', task: { check: () => !S.playing, doIt: () => SB.time.pause() } },
      { tip: true, free: true, say: 'Real video works the same way. Import a file and it is a clip you trim and cut. Right-click it and choose “Split sound into its own layer” to edit picture and sound apart.' },
      { practice: true, free: true, say: 'Slide the red clip a little to the right so it starts later.', show: clip('Red'), allow: ['#tl'], mouse: 'drag', enter: () => { SB.time.pause(); },
        task: { check: T => !!red(T) && red(T).start > 0.4, hint: 'Press in the middle of the red bar and drag it right.', doIt: T => { red(T).start = 1; SB.bump(); SB.commit(); } } },
    ],
    outro: 'Nice cut! Trim, move, cut: that is most of editing. Group clips into a shot to move them together.',
  });
})(window.SB);
