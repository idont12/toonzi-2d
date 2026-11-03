/* Tutorial: masks. A circle becomes a window that reveals a moving stripe (format: js/tours/tours.js). */
'use strict';
(function (SB) {
  const S = SB.state, tree = SB.tree, TR = SB.tracks, U = SB.util, at = SB.tours.at, is = SB.tours.is;
  const win = T => T.o('Window'), stripe = T => T.o('Stripe');
  const mask = T => tree.all().find(o => o.isMask) || null;
  const centre = T => [T.W / 2, T.H / 2];
  const stripeSpot = T => [T.W * 0.14, T.H / 2]; /* where the stripe is at the start */
  const menuRun = (o, path) => { let list = SB.menus.layerItems(o); for (const name of path) { const it = list.find(x => x && x.label && x.label.startsWith(name)); if (!it) return false; if (it.sub) list = it.sub; else { SB.menu.close(); it.run(); return true; } } return false; };
  const openMenu = o => { const r = document.getElementById('stageDoc').getBoundingClientRect(); SB.menu.open(r.left + r.width * 0.5, r.top + r.height * 0.45, SB.menus.layerItems(o)); };
  const barBtn = word => () => [...document.querySelectorAll('#ctxbar button')].find(b => b.textContent.trim() === word);
  SB.tours.add({
    id: 'masking', group: '2 Effects and video', title: 'Masks: a window for a layer', minutes: 4, level: 'Easy', duration: 4,
    blurb: 'Use a circle as a window that reveals a moving stripe.',
    desc: 'A mask is a shape that decides which part of another layer shows. You turn a circle into a window, watch a stripe slide behind it, and switch between showing the inside and the outside.',
    learn: ['Making a mask from two layers', 'Showing the inside or the outside', 'Showing the mask shape itself', 'Moving the mask'],
    preview(c, t, w, h) {
      c.fillStyle = '#F6F2FF'; c.fillRect(0, 0, w, h); const x = w / 2, y = h / 2, u = (t % 3) / 3, sx = -40 + u * (w + 80);
      c.save(); c.beginPath(); c.arc(x, y, 62, 0, Math.PI * 2); c.clip(); c.fillStyle = '#FF4F8B'; c.translate(sx, y); c.rotate(0.3); c.fillRect(-26, -140, 52, 280); c.restore();
      c.strokeStyle = '#5B3DF5'; c.lineWidth = 4; c.setLineDash([8, 6]); c.beginPath(); c.arc(x, y, 62, 0, Math.PI * 2); c.stroke(); c.setLineDash([]);
    },
    setup(T) {
      const D = S.project.duration, s = tree.make('shape', { name: 'Stripe', shape: 'rect', w: 200, h: 760, rot: 20, fill: '#FF4F8B', strokeW: 0, x: T.W * 0.14, y: T.H / 2, start: 0, dur: D });
      TR.put(s, 'x', 0, T.W * 0.14, 'smooth'); TR.put(s, 'x', D, T.W * 0.86, 'smooth'); /* the stripe stays on the screen the whole way */
      const w = tree.make('shape', { name: 'Window', shape: 'ellipse', w: 460, h: 460, fill: '#FFD84D', strokeW: 0, x: T.W / 2, y: T.H / 2, start: 0, dur: D });
      S.objects.push(w, s); tree.reindex(); tree.select([]); SB.tool.set('select');
    },
    steps: [
      { say: 'A mask is a window. One shape decides what you can see of another layer.' },
      { say: 'Here is a circle on top of a pink stripe. Select both: click the circle, then hold Shift and click the stripe.', key: 'all', keyLabel: 'Or, in one go, press', allow: ['stage'], keys: ['Shift'], mouse: 'left', at: T => S.multi.has(win(T).id) ? stripeSpot(T) : centre(T),
        ghost: T => [{ dot: centre(T), label: '1 Click' }, { dot: stripeSpot(T), label: '2 Shift+click' }],
        task: { check: T => S.multi.has(win(T).id) && S.multi.has(stripe(T).id), hint: 'Click the yellow circle. Then hold Shift and click the pink stripe, left of the circle.', doIt: T => tree.select([win(T).id, stripe(T).id]) } },
      { say: 'Right-click the circle.', allow: ['stage'], mouse: 'right', at: centre, task: { check: is.menuOpen, hint: 'Both layers stay selected when you right-click the circle.', doIt: T => { tree.select([win(T).id, stripe(T).id]); openMenu(win(T)); } } },
      { say: 'Choose Mask, then Mask with the top layer.', show: at.item('Mask with the top layer', 'Mask'), mouse: 'left', task: { check: T => !!mask(T), doIt: T => { SB.menu.close(); tree.select([win(T).id, stripe(T).id]); SB.ops.makeMask(); } } },
      { say: 'The circle now cuts the stripe. Play and watch it slide through the window.', key: 'play', show: '#btnPlay', task: { check: () => S.playing, doIt: () => SB.time.play() } },
      { say: 'Stop it.', key: 'play', show: '#btnPlay', task: { check: () => !S.playing, doIt: () => SB.time.pause() } },
      { say: 'The mask is selected. In the bar above the stage, choose Outside. Now the circle is a hole.', show: barBtn('Outside'), mouse: 'left', task: { check: T => !!mask(T) && mask(T).isMask === 'out', hint: 'Click Outside in the Mask bar above the stage.', doIt: T => SB.masks.setMode(mask(T), 'out') } },
      { say: 'Switch back to Inside.', show: barBtn('Inside'), mouse: 'left', task: { check: T => !!mask(T) && mask(T).isMask === 'in', doIt: T => SB.masks.setMode(mask(T), 'in') } },
      { say: 'Want to see the circle too? Set the Shape to Visible.', show: barBtn('Visible'), mouse: 'left', task: { check: T => !!mask(T) && !!mask(T).maskVisible, doIt: T => SB.masks.setVisible(mask(T), true) } },
      { tip: true, free: true, say: 'Any shape or drawing can be a mask: a star, a heart, even text. Right-click the mask and choose Mask › Stop using as mask to undo it.' },
      { practice: true, free: true, say: 'Drag the circle to a new spot. The window moves, the stripe stays.', allow: ['stage'], mouse: 'drag', at: centre, enter: T => { SB.time.pause(); SB.time.set(0); const m = mask(T); T.data.x0 = m ? m.x : 0; T.data.y0 = m ? m.y : 0; },
        task: { check: T => { const m = mask(T); return !!m && Math.hypot(m.x - T.data.x0, m.y - T.data.y0) > 60; }, hint: 'Press inside the circle and drag it left or right.', doIt: T => { const m = mask(T); m.x += 260; m.y -= 90; SB.commit(); } } },
    ],
    outro: 'You made a window! Try a heart or a star as the mask, or put your own drawing behind it.',
  });
})(window.SB);
