/* Tutorial: effects and transitions. A sunny sky that pops, slides, spins and glows (format: js/tours/tours.js). */
'use strict';
(function (SB) {
  const S = SB.state, tree = SB.tree, at = SB.tours.at, is = SB.tours.is;
  const sun = T => T.o('Sun'), cloud = T => T.o('Cloud'), star = T => T.o('Star');
  const spots = T => ({ sun: [T.W * 0.3, T.H * 0.4], cloud: [T.W * 0.68, T.H * 0.36], star: [T.W * 0.5, T.H * 0.74] });
  const has = (o, id) => !!o && (o.effects || []).some(e => e.type === id);
  const cat = (o, c) => !!o && (o.effects || []).some(e => { const d = SB.effects.get(e.type); return d && d.cat === c; });
  const menuRun = (o, path) => { tree.select([o.id]); let list = SB.menus.layerItems(o); for (const name of path) { const it = list.find(x => x && x.label && x.label.startsWith(name)); if (!it) return false; if (it.sub) list = it.sub; else { SB.menu.close(); it.run(); return true; } } return false; };
  const openMenu = o => { const r = document.getElementById('stageDoc').getBoundingClientRect(); tree.select([o.id]); SB.menu.open(r.left + r.width * 0.5, r.top + r.height * 0.45, SB.menus.layerItems(o)); };
  SB.tours.add({
    id: 'effects', group: '2 Effects and video', title: 'Effects and transitions', minutes: 5, level: 'Easy', duration: 4,
    blurb: 'Make a sunny sky come alive with pops, slides, spins and glow.',
    desc: 'Effects are ready-made motion and looks. Transitions make a layer arrive or leave. You add a few to a sun, a cloud and a star, and watch the whole scene come alive without a keyframe.',
    learn: ['Adding an effect from the layer menu', 'Transitions in and out', 'Animated effects that loop', 'Looks like glow'],
    preview(c, t, w, h) {
      c.fillStyle = '#CFE9FF'; c.fillRect(0, 0, w, h); const k = Math.min(1, (t % 3.2) / 0.5), back = 1 + Math.sin(k * Math.PI) * 0.25, s = k * back;
      c.shadowColor = '#FFD84D'; c.shadowBlur = 24; c.fillStyle = '#FFC93C'; c.beginPath(); c.arc(w * 0.32, h * 0.42, 34 * s, 0, 7); c.fill(); c.shadowBlur = 0;
      c.fillStyle = '#fff'; { const cx = w * 0.72 + (1 - Math.min(1, (t % 3.2) / 0.9)) * 120, cy = h * 0.34; c.beginPath(); [[-30, 6, 14], [-12, -4, 19], [12, -2, 22], [32, 6, 14]].forEach(([x, y, r]) => { c.moveTo(cx + x + r, cy + y); c.arc(cx + x, cy + y, r, 0, 7); }); c.rect(cx - 30, cy + 6, 62, 14); c.fill(); }
      c.save(); c.translate(w * 0.5, h * 0.76); c.rotate(t * 2); c.fillStyle = '#FF4F8B'; c.beginPath(); for (let i = 0; i < 10; i++) { const r = i % 2 ? 11 : 26, a = i / 10 * Math.PI * 2; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); } c.closePath(); c.fill(); c.restore();
    },
    setup(T) {
      const D = S.project.duration, sp = spots(T); S.project.bg = '#CFE9FF';
      const a = tree.make('shape', { name: 'Sun', shape: 'ellipse', w: 260, h: 260, fill: '#FFC93C', strokeW: 0, x: sp.sun[0], y: sp.sun[1], start: 0, dur: D });
      const b = tree.make('draw', { name: 'Cloud', x: sp.cloud[0], y: sp.cloud[1], start: 0, dur: D, play: 'loop' }); /* a solid white cloud (drawn after the layers are in), around the layer's own point so its effects pivot in its middle */
      const c = tree.make('shape', { name: 'Star', shape: 'star', w: 190, h: 190, fill: '#FF4F8B', strokeW: 0, x: sp.star[0], y: sp.star[1], start: 0, dur: D });
      S.objects.push(a, b, c); tree.reindex(); SB.tours.art.cloud(b, sp.cloud[0], sp.cloud[1] + 13, 1.1); tree.select([]); SB.tool.set('select');
    },
    steps: [
      { say: 'Effects are ready-made motion and looks. Transitions make a layer arrive or leave. Let’s liven up this sky.' },
      { say: 'Right-click the sun.', allow: ['stage'], mouse: 'right', at: T => spots(T).sun, task: { check: is.menuOpen, doIt: T => openMenu(sun(T)) } },
      { say: 'Choose Effects, then Transitions in, then Pop in.', show: at.item('Pop in', 'Transitions in', 'Effects'), mouse: 'left', task: { check: T => has(sun(T), 'popIn'), doIt: T => { SB.menu.close(); menuRun(sun(T), ['Effects', 'Transitions in', 'Pop in']); } } },
      { practice: true, free: true, say: 'The cloud should glide in: right-click it and choose Effects › Transitions in › Slide in.', mouse: 'right', at: T => spots(T).cloud, task: { check: T => has(cloud(T), 'slideIn'), hint: 'Right-click the cloud, then Effects, Transitions in, Slide in.', doIt: T => menuRun(cloud(T), ['Effects', 'Transitions in', 'Slide in']) } },
      { practice: true, say: 'Now make the star spin forever: right-click it and choose Effects › Animated effects › Spin.', free: true, mouse: 'right', at: T => spots(T).star, task: { check: T => has(star(T), 'spin'), hint: 'Animated effects keep playing in a loop.', doIt: T => menuRun(star(T), ['Effects', 'Animated effects', 'Spin']) } },
      { practice: true, say: 'The sun needs a shine: right-click it and choose Effects › Looks › Glow.', free: true, mouse: 'right', at: T => spots(T).sun, task: { check: T => has(sun(T), 'glow'), hint: 'Looks change how a layer looks. Glow is in there.', doIt: T => menuRun(sun(T), ['Effects', 'Looks', 'Glow']) } },
      { say: 'Press play to see them all together.', key: 'play', show: '#btnPlay', enter: () => { SB.time.pause(); SB.time.set(0); }, task: { check: () => S.playing, doIt: () => SB.time.play() } },
      { say: 'Stop it.', key: 'play', show: '#btnPlay', task: { check: () => !S.playing, doIt: () => SB.time.pause() } },
      { practice: true, say: 'Let the cloud leave at the end: right-click it and choose Effects › Transitions out › Fade out.', free: true, mouse: 'right', at: T => spots(T).cloud, task: { check: T => has(cloud(T), 'fadeOut'), hint: 'Transitions out play at the end of the layer’s bar.', doIt: T => menuRun(cloud(T), ['Effects', 'Transitions out', 'Fade out']) } },
      { tip: true, free: true, say: 'Every effect also shows up in the panel on the right, where you can tweak it or turn it off. There you can press “Design a transition” or “Design an effect” to build your own.' },
      { practice: true, free: true, say: 'Give the star a transition in too: any one you like. Right-click it, Effects, Transitions in.', mouse: 'right', at: T => spots(T).star, task: { check: T => cat(star(T), 'in'), hint: 'Try Zoom in, Spin in or Wipe in.', doIt: T => menuRun(star(T), ['Effects', 'Transitions in', 'Zoom in']) } },
    ],
    outro: 'The sky is alive! Effects can be mixed and stacked. Try three on one layer and see what happens.',
  });
})(window.SB);
