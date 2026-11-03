/* Tutorial: eyes that look around, driven by one controller (format: js/tours/tours.js). */
'use strict';
(function (SB) {
  const S = SB.state, tree = SB.tree, TR = SB.tracks, U = SB.util, at = SB.tours.at, is = SB.tours.is;
  const C = () => SB.controls;
  const pupils = T => [T.o('Pupil L'), T.o('Pupil R')];
  const ctrl = T => { const p = T.o('Pupil L'), L = p && (p.drv || [])[0]; return L ? tree.find(L.ctrl) : null; };
  /** The eyes' middles, and the empty spot where the controller will live (stage pixels). */
  const eyes = T => [[T.W / 2 - 110, T.H / 2 - 40], [T.W / 2 + 110, T.H / 2 - 40]];
  const home = T => [T.W * 0.84, T.H * 0.74];
  const knob = T => { const c = ctrl(T); if (!c) return [T.W / 2, T.H / 2 + 260]; const tr = TR.transform(c, tree.localTime(c)), q = SB.xf.world(c).transformPoint(U.pt(tr.ax, tr.ay)); return [q.x, q.y]; };
  const look = T => { const c = ctrl(T); return c ? C().value(c, S.time) : [0, 0]; };
  const keys = T => { const c = ctrl(T); return c ? new Set([...(c.tracks.x || []), ...(c.tracks.y || [])].map(k => Math.round(k.t * 10))).size : 0; };
  const picking = () => !!(SB.eyePicking && SB.eyePicking());
  /** Run a layer-menu item by its names (what Skip does for the menu steps). */
  const menuRun = (o, path) => { let list = SB.menus.layerItems(o); for (const name of path) { const it = list.find(x => x && x.label && x.label.startsWith(name)); if (!it) return false; if (it.sub) list = it.sub; else { SB.menu.close(); it.run(); return true; } } return false; };
  const openMenu = o => { const r = document.getElementById('stageDoc').getBoundingClientRect(); SB.menu.open(r.left + r.width * 0.5, r.top + r.height * 0.45, SB.menus.layerItems(o)); };
  /** A click on the stage at a stage point. */
  const clickStage = p => { const r = document.getElementById('stageDoc').getBoundingClientRect(), x = r.left + p[0] / S.project.w * r.width, y = r.top + p[1] / S.project.h * r.height; document.getElementById('stage').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, pointerId: 1 })); };
  const moveBox = (T, p) => { const c = ctrl(T), dx = p[0] - (c.rx ?? c.x), dy = p[1] - (c.ry ?? c.y); c.rx = U.r1(c.rx + dx); c.ry = U.r1(c.ry + dy); c.x = U.r1(c.x + dx); c.y = U.r1(c.y + dy); SB.commit(); };
  const keyNow = T => { tree.select([ctrl(T).id]); SB.ops.addKey(); };
  SB.tours.add({
    id: 'basic-controls', group: '5 Rigs and controllers', title: 'Controllers: eyes that follow', minutes: 5, level: 'Medium',
    blurb: 'Make eyes look around with one little knob.',
    desc: 'A controller is a small knob that moves other layers. You give two pupils one knob, so dragging it makes the eyes look around. You also learn to move the controller’s box, and animate the knob.',
    learn: ['Selecting two layers', 'Eyes follow a controller', 'Moving the box and moving the knob', 'Keyframing the knob'],
    preview(c, t, w, h) {
      c.fillStyle = '#FFF4E6'; c.fillRect(0, 0, w, h); const u = Math.sin(t * 1.4), v = Math.sin(t * 2.1) * 0.6;
      c.fillStyle = '#FFD7A8'; c.beginPath(); c.arc(w / 2, h / 2 + 10, 80, 0, Math.PI * 2); c.fill();
      for (const x of [w / 2 - 32, w / 2 + 32]) { c.fillStyle = '#fff'; c.strokeStyle = '#24213F'; c.lineWidth = 3; c.beginPath(); c.arc(x, h / 2 - 5, 22, 0, Math.PI * 2); c.fill(); c.stroke(); c.fillStyle = '#24213F'; c.beginPath(); c.arc(x + u * 10, h / 2 - 5 + v * 10, 9, 0, Math.PI * 2); c.fill(); }
      c.strokeStyle = '#E8730C'; c.setLineDash([4, 3]); c.lineWidth = 2; c.strokeRect(w - 70, h - 70, 50, 50); c.setLineDash([]); c.fillStyle = '#fff'; c.beginPath(); c.arc(w - 45 + u * 25, h - 45 + v * 25, 8, 0, Math.PI * 2); c.fill(); c.stroke();
    },
    setup(T) {
      const W = T.W, H = T.H, mk = (name, o) => { const x = tree.make('shape', Object.assign({ name, start: 0, dur: S.project.duration, shape: 'ellipse', strokeW: 0 }, o)); S.objects.unshift(x); return x; };
      mk('Head', { x: W / 2, y: H / 2, w: 520, h: 480, fill: '#FFD7A8' });
      const mouth = tree.make('draw', { name: 'Mouth', x: W / 2, y: H / 2 + 100, start: 0, dur: S.project.duration, play: 'loop' }); S.objects.unshift(mouth); tree.reindex(); SB.tours.art.path(mouth, [[W / 2 - 85, H / 2 + 95, 35, 55], [W / 2 + 85, H / 2 + 95, 35, -55]], false, { s: 9 }); /* a clean smile */
      eyes(T).forEach(([x, y], i) => { mk(i ? 'Eye R' : 'Eye L', { x, y, w: 150, h: 150, fill: '#FFFFFF', stroke: '#24213F', strokeW: 8 }); });
      eyes(T).forEach(([x, y], i) => { mk(i ? 'Pupil R' : 'Pupil L', { x, y, w: 56, h: 56, fill: '#24213F' }); });
      tree.reindex(); tree.select([]); SB.tool.set('select');
    },
    steps: [
      { say: 'Let’s make these eyes look around with one knob. A knob like that is called a controller.' },
      { say: 'Click the left pupil.', allow: ['stage'], mouse: 'left', at: T => eyes(T)[0], ghost: T => [{ circle: [...eyes(T)[0], 40] }],
        task: { check: T => S.multi.has(pupils(T)[0].id), doIt: T => tree.select([pupils(T)[0].id]) } },
      { say: 'Hold Shift and click the right pupil too.', allow: ['stage'], mouse: 'left', at: T => eyes(T)[1], keys: ['Shift'], ghost: T => [{ circle: [...eyes(T)[1], 40], label: 'Shift + click' }],
        task: { check: T => pupils(T).every(p => S.multi.has(p.id)), doIt: T => tree.select(pupils(T).map(p => p.id)) } },
      { say: 'Right-click one of the pupils.', allow: ['stage'], mouse: 'right', at: T => eyes(T)[1], task: { check: is.menuOpen, doIt: T => openMenu(pupils(T)[1]) } },
      { say: 'Choose Controller, then Drive with a controller, then Eyes follow a controller.', show: at.item('Eyes follow', 'Drive with a controller', 'Controller'), mouse: 'left',
        task: { check: T => picking() || !!ctrl(T), doIt: T => menuRun(pupils(T)[1], ['Controller', 'Drive with a controller', 'Eyes follow']) } },
      { say: 'Move the pointer to the pink ring: that is how far the eyes can look. Click.', allow: ['stage'], mouse: 'left', at: T => [eyes(T)[0][0] + 45, eyes(T)[0][1]], ghost: T => [{ circle: [...eyes(T)[0], 45] }, { circle: [...eyes(T)[1], 45] }],
        task: { check: T => !!ctrl(T) && !picking(), doIt: T => clickStage([eyes(T)[0][0] + 45, eyes(T)[0][1]]) } },
      { say: 'A controller has a dashed box and a round knob. The box landed on the face. Drag the box’s dashed edge to the pink spot.', allow: ['stage'], mouse: 'drag', at: T => { const c = ctrl(T); return c ? [c.rx - C().RX(c), c.ry] : home(T); }, ghost: T => [{ circle: [...home(T), 100], label: 'move it here' }],
        task: { check: T => { const c = ctrl(T); return !!c && Math.hypot(c.rx - home(T)[0], c.ry - home(T)[1]) < 170; }, hint: 'Grab the dashed line of the box, not the knob, and drag the whole thing to the pink circle.', doIt: T => moveBox(T, home(T)) } },
      { say: 'Now drag the round knob around. The eyes follow it!', allow: ['stage'], mouse: 'drag', at: knob, task: { check: T => Math.hypot(...look(T)) > 0.4, hint: 'The knob is the round thing inside the box.', doIt: T => { const c = ctrl(T); TR.set(c, 'x', (c.rx ?? c.x) + C().RX(c) * 0.8); } } },
      { tip: true, free: true, say: 'Dragging the knob moves the knob. Dragging the box edge moves the whole controller. Easy to mix up!' },
      { say: 'Press K to keyframe the knob. The eyes are now looking this way at 0 seconds.', key: 'key', show: at.title('Add a keyframe'), task: { check: T => keys(T) >= 1, doIt: keyNow } },
      { say: 'Click the ruler at 2 seconds.', show: at.rulerAt(2), allow: [at.ruler], mouse: 'left', task: { check: T => T.timeAt(2), doIt: () => SB.time.set(2) } },
      { say: 'Drag the knob to the other side.', allow: ['stage'], mouse: 'drag', at: knob, task: { check: T => { const c = ctrl(T); return !!c && Math.abs(TR.now(c, 'x') - TR.value(c, 'x', 0)) + Math.abs(TR.now(c, 'y') - TR.value(c, 'y', 0)) > C().RX(c) * 0.5; }, doIt: T => { const c = ctrl(T); TR.set(c, 'x', (c.rx ?? c.x) - C().RX(c) * 0.8); } } },
      { say: 'Press K again. That is your second keyframe.', key: 'key', show: at.title('Add a keyframe'), task: { check: T => keys(T) >= 2, doIt: keyNow } },
      { say: 'Go back to the start first. Press Home, or click the button.', key: 'home', show: at.title('Go to start'), mouse: 'left', task: { check: T => T.timeAt(0, 0.05), doIt: () => { SB.time.pause(); SB.time.set(0); } } },
      { say: 'Play it: the eyes look from side to side.', key: 'play', show: '#btnPlay', task: { check: () => S.playing, doIt: () => SB.time.play() } },
      { practice: true, free: true, say: 'Stop, click the ruler at 3 seconds, drag the knob up, and press K. The eyes look up.', allow: ['stage', at.ruler, '#tl', '#btnPlay'], keys: ['K', 'Space'], mouse: 'drag', at: knob, enter: T => { SB.time.pause(); T.data.k = keys(T); },
        task: { check: T => { const c = ctrl(T); return !!c && keys(T) > T.data.k && (c.tracks.y || []).some(k => Math.abs(k.t - 3) < 0.2 && k.v < (c.ry ?? c.y) - C().RY(c) * 0.4); }, hint: 'Ruler at 3 seconds, knob to the top of its box, then K.', doIt: T => { const c = ctrl(T); SB.time.set(3); TR.set(c, 'y', (c.ry ?? c.y) - C().RY(c)); keyNow(T); } } },
    ],
    outro: 'Your eyes look around. Try Controller › Design a controller… for a knob with your own shape. Next: “Actions: more than one animation”.',
  });
})(window.SB);
