/* Tutorial: a logo reveal in a minute. Transitions on a few layers, then timing them one after another (format: js/tours/tours.js). */
'use strict';
(function (SB) {
  const S = SB.state, tree = SB.tree, at = SB.tours.at, is = SB.tours.is;
  const ring = T => T.o('Ring'), star = T => T.o('Star'), title = T => T.o('Title'), tag = T => T.o('Tagline');
  const spots = T => ({ ring: [T.W / 2, T.H * 0.34], star: [T.W / 2, T.H * 0.34], title: [T.W / 2, T.H * 0.7], tag: [T.W / 2, T.H * 0.85] });
  const has = (o, id) => !!o && (o.effects || []).some(e => e.type === id);
  const cat = (o, c) => !!o && (o.effects || []).some(e => { const d = SB.effects.get(e.type); return d && d.cat === c; });
  const menuRun = (o, path) => { tree.select([o.id]); let list = SB.menus.layerItems(o); for (const name of path) { const it = list.find(x => x && x.label && x.label.startsWith(name)); if (!it) return false; if (it.sub) list = it.sub; else { SB.menu.close(); it.run(); return true; } } return false; };
  const openMenu = o => { const r = document.getElementById('stageDoc').getBoundingClientRect(); tree.select([o.id]); SB.menu.open(r.left + r.width * 0.5, r.top + r.height * 0.45, SB.menus.layerItems(o)); };
  const clip = name => T => { const o = T.o(name); return o && document.querySelector(`#tl .clip[data-id="${o.id}"]`); };
  SB.tours.add({
    id: 'logo-reveal', group: '2 Effects and video', title: 'A logo reveal in one minute', minutes: 3, level: 'Easy', duration: 4,
    blurb: 'Effects and timing make a cool title animation, with no keyframes at all.',
    desc: 'A title card is mostly timing. You give a ring, a star, a title and a tagline their entrance with transitions, then slide their bars in the timeline so they arrive one after another, and add a loop that keeps the star alive.',
    learn: ['Transitions in from the layer menu', 'Staggering layers by moving their bars', 'A loop effect to keep it alive', 'Typewriter text'],
    preview(c, t, w, h) {
      c.fillStyle = '#1B1740'; c.fillRect(0, 0, w, h); const u = t % 3.4, ease = k => { k = Math.max(0, Math.min(1, k)); return 1 - Math.pow(1 - k, 3); }, back = k => { k = Math.max(0, Math.min(1, k)); const c3 = 2.7; return 1 + c3 * Math.pow(k - 1, 3) + 1.7 * Math.pow(k - 1, 2); };
      const cx = w / 2, cy = h * 0.38, r = ease(u / 0.6); c.strokeStyle = '#FFC93C'; c.lineWidth = 6; c.beginPath(); c.arc(cx, cy, 52 * r, 0, 7); c.stroke();
      const s = back((u - 0.4) / 0.6); c.save(); c.translate(cx, cy); c.rotate((1 - Math.min(1, Math.max(0, (u - 0.4) / 0.7))) * -4 + Math.sin(t * 3) * 0.05); c.scale(s * (1 + Math.sin(t * 5) * 0.04), s * (1 + Math.sin(t * 5) * 0.04)); c.fillStyle = '#FF4F8B'; c.beginPath();
      for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? 15 : 34; c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } c.closePath(); c.fill(); c.restore();
      const tk = ease((u - 0.9) / 0.5); c.globalAlpha = tk; c.fillStyle = '#fff'; c.font = '700 40px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.save(); c.translate(cx, h * 0.72); c.scale(0.5 + tk * 0.5, 0.5 + tk * 0.5); c.fillText('SPARK', 0, 0); c.restore(); c.globalAlpha = 1;
      const ch = Math.floor(Math.max(0, (u - 1.6) / 0.9) * 14), line = 'make it move!'; c.fillStyle = '#B8B0FF'; c.font = '500 17px system-ui, sans-serif'; c.fillText(line.slice(0, ch), cx, h * 0.88);
    },
    setup(T) {
      const D = S.project.duration, sp = spots(T); S.project.bg = '#1B1740';
      const mk = (type, o) => tree.make(type, Object.assign({ start: 0, dur: D }, o));
      const t2 = mk('text', { name: 'Tagline', text: 'make it move!', font: 'lexend', fontSize: 64, color: '#B8B0FF', bold: false, x: sp.tag[0], y: sp.tag[1] });
      const t1 = mk('text', { name: 'Title', text: 'SPARK', font: 'lexend', fontSize: 210, color: '#FFFFFF', bold: true, x: sp.title[0], y: sp.title[1] });
      const st = mk('shape', { name: 'Star', shape: 'star', w: 230, h: 230, fill: '#FF4F8B', strokeW: 0, x: sp.star[0], y: sp.star[1] });
      const rg = mk('shape', { name: 'Ring', shape: 'ellipse', w: 400, h: 400, fillOn: false, stroke: '#FFC93C', strokeW: 16, x: sp.ring[0], y: sp.ring[1] });
      S.objects.push(st, rg, t1, t2); tree.reindex(); tree.select([]); SB.tool.set('select');
    },
    steps: [
      { say: 'A title card is mostly timing. Let’s build a logo reveal with transitions: no keyframes.' },
      { say: 'Right-click the star.', allow: ['stage'], mouse: 'right', at: T => spots(T).star, task: { check: is.menuOpen, hint: 'Right-click the pink star.', doIt: T => openMenu(star(T)) } },
      { say: 'Choose Effects, then Transitions in, then Spin in.', show: at.item('Spin in', 'Transitions in', 'Effects'), mouse: 'left', task: { check: T => has(star(T), 'spinIn'), doIt: T => { SB.menu.close(); menuRun(star(T), ['Effects', 'Transitions in', 'Spin in']); } } },
      { practice: true, say: 'Now the ring: right-click it and choose Effects › Transitions in › Zoom in.', free: true, mouse: 'right', at: T => [spots(T).ring[0] + 200, spots(T).ring[1]], task: { check: T => has(ring(T), 'zoomIn'), hint: 'Right-click the yellow ring (its line), then Effects, Transitions in, Zoom in.', doIt: T => menuRun(ring(T), ['Effects', 'Transitions in', 'Zoom in']) } },
      { practice: true, say: 'The title: right-click it and choose Effects › Transitions in › Pop in.', free: true, mouse: 'right', at: T => spots(T).title, task: { check: T => has(title(T), 'popIn'), hint: 'Right-click the big white word.', doIt: T => menuRun(title(T), ['Effects', 'Transitions in', 'Pop in']) } },
      { practice: true, say: 'The tagline types itself: right-click it and choose Effects › Transitions in › Typewriter.', free: true, mouse: 'right', at: T => spots(T).tag, task: { check: T => has(tag(T), 'typewriter'), hint: 'Right-click the small text, then Effects, Transitions in, Typewriter.', doIt: T => menuRun(tag(T), ['Effects', 'Transitions in', 'Typewriter']) } },
      { say: 'Press play. Everything arrives at once. Not yet a reveal.', key: 'play', show: '#btnPlay', enter: () => { SB.time.pause(); SB.time.set(0); }, task: { check: () => S.playing, doIt: () => SB.time.play() } },
      { say: 'Stop it.', key: 'play', show: '#btnPlay', task: { check: () => !S.playing, doIt: () => SB.time.pause() } },
      { say: 'Let them arrive one by one. Drag the Title’s bar in the timeline a little to the right.', show: clip('Title'), allow: ['#tl'], mouse: 'drag', task: { check: T => !!title(T) && title(T).start > 0.4, hint: 'Press in the middle of the Title bar and slide it right, to about half a second.', doIt: T => { title(T).start = 0.6; SB.bump(); SB.commit(); } } },
      { say: 'The tagline comes last: drag its bar further right.', show: clip('Tagline'), allow: ['#tl'], mouse: 'drag', task: { check: T => !!tag(T) && !!title(T) && tag(T).start > title(T).start + 0.3, hint: 'Slide the Tagline bar to about one and a half seconds.', doIt: T => { tag(T).start = 1.4; SB.bump(); SB.commit(); } } },
      { say: 'Go back to the start and play it all.', key: 'play', show: '#btnPlay', enter: () => { SB.time.pause(); SB.time.set(0); }, task: { check: () => S.playing, doIt: () => SB.time.play() } },
      { tip: true, free: true, say: 'Every effect also has a panel on the right, to change its speed or direction. The order of the bars is the order of the show.' },
      { practice: true, free: true, say: 'Give the star a loop so it never sits still: right-click it, Effects, Animated effects, then pick one (Pulse is nice).', mouse: 'right', at: T => spots(T).star, enter: () => { SB.time.pause(); },
        task: { check: T => cat(star(T), 'loop'), hint: 'Animated effects keep playing. Try Pulse, Float or Wobble.', doIt: T => menuRun(star(T), ['Effects', 'Animated effects', 'Pulse']) } },
    ],
    outro: 'That is a logo reveal: transitions in, then timing. Change the order of the bars and the whole feel changes.',
  });
})(window.SB);
