/* Tutorial: physics that hangs from a rig. A trolley rolls along a rail and the ball swings under it (format: js/tours/tours.js). */
'use strict';
(function (SB) {
  const S = SB.state, tree = SB.tree, TR = SB.tracks, U = SB.util, at = SB.tours.at, is = SB.tours.is, art = SB.tours.art;
  const R = () => SB.rig;
  const ball = T => T.o('Ball'), wall = T => T.o('Wall');
  const rigOf = () => R().rigs().find(r => r.bones && r.bones.length) || null;
  const P = p => U.pt(p[0], p[1]);
  /** Where things are (stage pixels): the rail, the trolley's hook (the bone's tip), the ball's middle and the wall. */
  const G = T => { const W = T.W, H = T.H, rail = Math.round(H * 0.1), hook = [W * 0.2, rail + 110], rope = Math.round(H * 0.4); return { rail, hook, rope, run: W * 0.3, ball: [hook[0], hook[1] + rope], wall: [W * 0.69, hook[1] + rope - 20, 120, Math.round(H * 0.5)] }; };
  const hangs = T => !!ball(T).phys && ball(T).phys.mode === 'hang';
  const menuRun = (o, path) => { tree.select([o.id]); let list = SB.menus.layerItems(o); for (const name of path) { const it = list.find(x => x && x.label && x.label.startsWith(name)); if (!it) return false; if (it.sub) list = it.sub; else { SB.menu.close(); it.run(); return true; } } return false; };
  const openMenu = o => { const r = document.getElementById('stageDoc').getBoundingClientRect(); tree.select([o.id]); SB.menu.open(r.left + r.width * 0.5, r.top + r.height * 0.45, SB.menus.layerItems(o)); };
  const hangNow = T => { const rig = rigOf(), b = rig.bones[0]; if (SB.picker) SB.picker.cancel(); const o = ball(T); SB.physics.add(o, { mode: 'hang', on: true, rig: rig.id, bone: b.id, rope: 0 }); delete o.bind; SB.commit(); };
  const kindRow = () => [...document.querySelectorAll('#inspector .f, #inspector .row')].find(r => /Kind/.test(r.textContent) && /Spring/.test(r.textContent));
  SB.tours.add({
    id: 'wrecking-ball', group: '6 Quick and powerful', title: 'A swinging ball: hang physics', minutes: 4, level: 'Medium', duration: 4,
    blurb: 'Hang a ball from a moving rig and let physics swing it, with no keys for the swing.',
    desc: 'A trolley rolls along a rail, driven by a few keys on a rig. At first the ball is glued to it. One menu choice, Hang from a bone, turns the glue into a rope, and the ball swings and bounces off a wall by itself.',
    learn: ['Physics › Hang from a bone', 'Keys move the rig, physics does the swing', 'Making a layer solid so things bounce off it', 'Rope or spring'],
    preview(c, t, w, h) {
      c.fillStyle = '#F4F1FF'; c.fillRect(0, 0, w, h); const u = (t % 4) / 4, ry = h * 0.14, L = h * 0.5;
      const X = tt => { const v = (tt % 4) / 4; return w * 0.2 + (v < 0.3 ? Math.pow(v / 0.3, 2.2) * w * 0.3 : v < 0.55 ? w * 0.3 : w * 0.3 * (1 - Math.min(1, (v - 0.55) / 0.4))); };
      let a = 0, v = 0; const dt = 1 / 60, tm = t % 4, Xs = tt => X(Math.max(0, tt)); for (let s = 0; s < tm; s += dt) { const acc = (Xs(s + dt) - 2 * Xs(s) + Xs(s - dt)) / (dt * dt); v += (-(2600 / L) * Math.sin(a) - 4.5 * acc / L * Math.cos(a) - 0.9 * v) * dt; a += v * dt; a = Math.max(-1, Math.min(1, a)); }
      const x = X(tm), bx = Math.min(x + Math.sin(a) * L, w * 0.82 - 24), by = ry + 22 + Math.cos(a) * L;
      c.fillStyle = '#B8B0E8'; c.fillRect(w * 0.82, h * 0.42, w * 0.1, h * 0.5); c.fillStyle = '#24213F'; c.fillRect(w * 0.08, ry, w * 0.84, 6);
      c.strokeStyle = '#24213F'; c.lineWidth = 3; c.beginPath(); c.moveTo(x, ry + 22); c.lineTo(bx, by); c.stroke();
      c.fillStyle = '#FF9F1C'; c.beginPath(); c.roundRect(x - 24, ry + 6, 48, 22, 6); c.fill(); c.fillStyle = '#3B3A52'; c.beginPath(); c.arc(bx, by, 24, 0, 7); c.fill(); c.fillStyle = '#ffffff55'; c.beginPath(); c.arc(bx - 8, by - 8, 7, 0, 7); c.fill();
    },
    setup(T) {
      const D = S.project.duration, g = G(T), [hx, hy] = g.hook, [bx, by] = g.ball, W = T.W; S.project.bg = '#F4F1FF';
      const wl = tree.make('shape', { name: 'Wall', shape: 'rect', w: g.wall[2], h: g.wall[3], fill: '#B8B0E8', strokeW: 0, x: g.wall[0], y: g.wall[1], start: 0, dur: D });
      const bl = tree.make('shape', { name: 'Ball', shape: 'ellipse', w: 150, h: 150, fill: '#3B3A52', strokeW: 0, x: bx, y: by, start: 0, dur: D });
      const tl = tree.make('draw', { name: 'Trolley', x: hx, y: g.rail, start: 0, dur: D, play: 'loop' });
      const rl = tree.make('draw', { name: 'Rail', x: W / 2, y: g.rail, start: 0, dur: D, play: 'loop' });
      S.objects.push(bl, tl, rl, wl); tree.reindex();
      art.poly(rl, [W * 0.06, g.rail, W * 0.94, g.rail], false, { s: 14 });
      art.rrect(tl, hx, g.rail + 50, 230, 80, 22, '#FF9F1C', false); art.rrect(tl, hx, g.rail + 50, 170, 24, 10, '#FFD08A', true); art.disc(tl, hx - 70, g.rail + 8, 14, '#24213F', true); art.disc(tl, hx + 70, g.rail + 8, 14, '#24213F', true);
      /* the rig: one short bone under the trolley; its tip is the hook */
      const rig = R().make(P([hx, g.rail])); rig.start = 0; rig.dur = D; tree.rootList().unshift(rig); tree.reindex();
      const q = p => R().toRig(rig, P(p)), b0 = R().addBone(rig, { type: 'pt', x: q([hx, g.rail + 50]).x, y: q([hx, g.rail + 50]).y }, q([hx, hy]));
      b0.name = 'Hook'; S.boneDraft = null; R().bindTo(tl, rig, b0.id, 'follow'); R().bindTo(bl, rig, b0.id, 'follow');
      /* the trolley rushes right, waits, and glides back */
      TR.put(rig, 'x', 0, hx, 'smooth'); TR.put(rig, 'x', 1.2, hx + g.run, 'hold'); TR.put(rig, 'x', 2.1, hx + g.run, 'smooth'); TR.put(rig, 'x', 3.5, hx, 'smooth');
      tree.select([]); SB.tool.set('select'); S.selBone = null;
    },
    steps: [
      { say: 'A trolley rolls on a rail. Let’s hang a ball under it and let physics do the swinging.' },
      { say: 'Press play. The ball is glued to the trolley, so it just rides along.', key: 'play', show: '#btnPlay', task: { check: () => S.playing, doIt: () => SB.time.play() } },
      { say: 'Stop it.', key: 'play', show: '#btnPlay', task: { check: () => !S.playing, doIt: () => SB.time.pause() } },
      { say: 'Go back to the start. Press Home.', key: 'home', show: at.title('Go to start'), mouse: 'left', task: { check: T => T.timeAt(0, 0.05), doIt: () => { SB.time.pause(); SB.time.set(0); } } },
      { say: 'Right-click the ball.', allow: ['stage'], mouse: 'right', at: T => G(T).ball, task: { check: is.menuOpen, hint: 'Right-click the dark ball.', doIt: T => openMenu(ball(T)) } },
      { say: 'Choose Physics, then Hang from a bone.', show: at.item('Hang from a bone', 'Physics'), mouse: 'left', task: { check: T => !!S.picking || hangs(T), doIt: T => { SB.menu.close(); menuRun(ball(T), ['Physics', 'Hang from a bone']); } } },
      { say: 'Click the trolley’s little bone, the line under it.', allow: ['stage'], mouse: 'left', at: T => [G(T).hook[0], G(T).hook[1] - 25], task: { check: T => hangs(T), hint: 'The bone is a thin line right under the orange trolley. Click it.', doIt: T => hangNow(T) } },
      { say: 'Press play: the ball swings from the trolley on a rope. There are no keys for the swing!', key: 'play', show: '#btnPlay', enter: () => { SB.time.pause(); SB.time.set(0); }, task: { check: () => S.playing, doIt: () => SB.time.play() } },
      { say: 'Stop it.', key: 'play', show: '#btnPlay', task: { check: () => !S.playing, doIt: () => SB.time.pause() } },
      { say: 'The ball sails through the wall. Make the wall solid: right-click it.', allow: ['stage'], mouse: 'right', at: T => [G(T).wall[0], G(T).wall[1] + 150], task: { check: is.menuOpen, hint: 'Right-click the lilac wall on the right.', doIt: T => openMenu(wall(T)) } },
      { say: 'Choose Physics, then Surface.', show: at.item('Surface', 'Physics'), mouse: 'left', task: { check: T => !!wall(T).phys && wall(T).phys.mode === 'static', doIt: T => { SB.menu.close(); menuRun(wall(T), ['Physics', 'Surface']); } } },
      { say: 'Go back to the start and play: the ball hits the wall and bounces.', key: 'play', show: '#btnPlay', enter: () => { SB.time.pause(); SB.time.set(0); }, task: { check: () => S.playing, doIt: () => SB.time.play() } },
      { tip: true, free: true, say: 'The keys move the trolley, physics does the rest. A longer Rope swings slower, a heavier Weight pulls harder. Spring makes it bouncy like elastic.' },
      { practice: true, free: true, say: 'Stop, select the ball and switch the rope to Spring in the panel.', allow: ['#inspector', '#btnPlay', 'stage'], keys: ['Space'], show: kindRow, enter: T => { SB.time.pause(); tree.select([ball(T).id]); SB.tool.set('select'); },
        task: { check: T => !!ball(T).phys && ball(T).phys.ropeMode === 'spring', hint: 'In the panel, find Physics, then Kind, and click Spring.', doIt: T => { ball(T).phys.ropeMode = 'spring'; SB.commit(); } } },
    ],
    outro: 'That is keys plus physics: you moved only the trolley, and the swing and the bounce came for free.',
  });
})(window.SB);
