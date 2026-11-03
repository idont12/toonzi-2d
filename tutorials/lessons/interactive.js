/* Tutorial: interactive basics. A controller the viewer can drag, tried in Preview (format: js/tours/tours.js). */
'use strict';
(function (SB) {
  const S = SB.state, tree = SB.tree, TR = SB.tracks, U = SB.util, at = SB.tours.at, is = SB.tours.is;
  const C = () => SB.controls;
  const ctrl = T => { const p = T.o('Pupil L'), L = p && (p.drv || [])[0]; return L ? tree.find(L.ctrl) : null; };
  const eyes = T => [[T.W / 2 - 110, T.H / 2 - 40], [T.W / 2 + 110, T.H / 2 - 40]];
  const home = T => [T.W * 0.84, T.H * 0.74];
  const knob = T => { const c = ctrl(T); if (!c) return home(T); const tr = TR.transform(c, tree.localTime(c)), q = SB.xf.world(c).transformPoint(U.pt(tr.ax, tr.ay)); return [q.x, q.y]; };
  const menuRun = (o, path) => { let list = SB.menus.layerItems(o); for (const name of path) { const it = list.find(x => x && x.label && x.label.startsWith(name)); if (!it) return false; if (it.sub) list = it.sub; else { SB.menu.close(); it.run(); return true; } } return false; };
  const openMenu = o => { const r = document.getElementById('stageDoc').getBoundingClientRect(); tree.select([o.id]); SB.menu.open(r.left + r.width * 0.5, r.top + r.height * 0.45, SB.menus.layerItems(o)); };
  const panelBtn = re => () => [...document.querySelectorAll('#ixPanel button')].find(b => re.test((b.textContent + ' ' + (b.title || '')).trim()) && b.offsetParent) || null;
  /** Preview must start on the practice screen (the tutorial's own screen), not on the first screen of the project. */
  const startHere = () => { try { const m = SB.ix.model(), a = SB.ix.library().find(x => x.screen === SB.screens.active()); if (a) m.start = a.key; } catch (e) { /* the preview then starts where it starts */ } };
  const rules = () => { try { return SB.ix.model().rules.length; } catch (e) { return 0; } };
  SB.tours.add({
    id: 'interactive', group: '7 Interactive and export', title: 'Interactive: let people play', minutes: 5, level: 'Medium',
    blurb: 'Let a viewer drag a knob to make the eyes look around.',
    desc: 'An interactive animation reacts to the viewer. You make a controller draggable, try it in Preview, and meet the rules that handle clicks and hovers. Then you can export it as a web page.',
    learn: ['Making a controller interactive', 'Opening Interactions and Preview', 'Dragging a knob like a viewer', 'Rules: when, if, do'],
    preview(c, t, w, h) {
      c.fillStyle = '#EEF6FF'; c.fillRect(0, 0, w, h); const u = Math.sin(t * 1.6), v = Math.sin(t * 2.3) * 0.6;
      c.fillStyle = '#FFD7A8'; c.beginPath(); c.arc(w / 2 - 30, h / 2, 72, 0, 7); c.fill();
      for (const x of [w / 2 - 62, w / 2 + 2]) { c.fillStyle = '#fff'; c.strokeStyle = '#24213F'; c.lineWidth = 3; c.beginPath(); c.arc(x, h / 2 - 8, 20, 0, 7); c.fill(); c.stroke(); c.fillStyle = '#24213F'; c.beginPath(); c.arc(x + u * 8, h / 2 - 8 + v * 8, 8, 0, 7); c.fill(); }
      const kx = w - 62, ky = h / 2 + 30; c.strokeStyle = '#E8730C'; c.lineWidth = 2.5; c.beginPath(); c.arc(kx, ky, 34, 0, 7); c.stroke(); c.fillStyle = '#E8730C'; c.beginPath(); c.arc(kx + u * 22, ky + v * 22, 10, 0, 7); c.fill();
      const px = kx + u * 22 + 14, py = ky + v * 22 + 14; c.fillStyle = '#24213F'; c.beginPath(); c.moveTo(px, py); c.lineTo(px + 9, py + 20); c.lineTo(px + 14, py + 14); c.lineTo(px + 22, py + 12); c.closePath(); c.fill();
    },
    setup(T) {
      const W = T.W, H = T.H, mk = (name, o) => { const x = tree.make('shape', Object.assign({ name, start: 0, dur: S.project.duration, shape: 'ellipse', strokeW: 0 }, o)); S.objects.unshift(x); return x; };
      mk('Head', { x: W / 2, y: H / 2, w: 520, h: 480, fill: '#FFD7A8' });
      const mouth = tree.make('draw', { name: 'Mouth', x: W / 2, y: H / 2 + 100, start: 0, dur: S.project.duration, play: 'loop' }); S.objects.unshift(mouth); tree.reindex(); SB.tours.art.path(mouth, [[W / 2 - 85, H / 2 + 95, 35, 55], [W / 2 + 85, H / 2 + 95, 35, -55]], false, { s: 9 }); /* a clean smile */
      eyes(T).forEach(([x, y], i) => { mk(i ? 'Eye R' : 'Eye L', { x, y, w: 150, h: 150, fill: '#FFFFFF', stroke: '#24213F', strokeW: 8 }); });
      const ps = eyes(T).map(([x, y], i) => mk(i ? 'Pupil R' : 'Pupil L', { x, y, w: 56, h: 56, fill: '#24213F' }));
      tree.reindex(); const c = C().eyesFollow(ps, 40), p = home(T), dx = p[0] - (c.rx ?? c.x), dy = p[1] - (c.ry ?? c.y);
      c.rx = U.r1((c.rx ?? c.x) + dx); c.ry = U.r1((c.ry ?? c.y) + dy); c.x = U.r1(c.x + dx); c.y = U.r1(c.y + dy);
      if (SB.targets && SB.targets.get() !== 'web') SB.targets.set('web');
      SB.commit(); tree.select([]); SB.tool.set('select');
    },
    steps: [
      { say: 'On a web page, people can touch your animation. Here the eyes follow the orange knob. Let’s let the viewer drag it.' },
      { say: 'Right-click the controller’s knob.', allow: ['stage'], mouse: 'right', at: knob, task: { check: is.menuOpen, hint: 'The knob is the little round thing in the box at the bottom right.', doIt: T => openMenu(ctrl(T)) } },
      { say: 'Choose “Make it interactive”.', show: at.item('Make it interactive'), mouse: 'left', task: { check: T => !!ctrl(T) && !!ctrl(T).ixGrab, doIt: T => { SB.menu.close(); if (!ctrl(T).ixGrab) C().setGrab(ctrl(T), true); } } },
      { say: 'Now open Interactions. This is where you try it out.', show: at.title('Interactions'), mouse: 'left', task: { check: () => !!S.ixMode, hint: 'Look for the Interactions button next to the playback buttons.', doIt: () => SB.ix.open() } },
      { say: 'Press Preview.', show: panelBtn(/Preview/), mouse: 'left', enter: startHere, task: { check: () => !!S.ixPlay, doIt: () => { startHere(); SB.ix.play(); } } },
      { say: 'Now you are the viewer. Drag the knob around!', allow: ['stage', '#ixPanel'], mouse: 'drag', at: knob, task: { check: T => !!ctrl(T) && !!ctrl(T)._live && !!S.ixPlay, hint: 'Press on the orange knob and move it. The eyes follow.', doIt: T => { const c = ctrl(T); c._live = { x: (c.rx ?? c.x) + C().RX(c) * 0.7, y: (c.ry ?? c.y) - C().RY(c) * 0.5 }; c._ixLive = true; SB.bump(); } } },
      { say: 'Press Stop.', show: panelBtn(/Stop/), mouse: 'left', allow: ['#ixPanel'], keys: ['Escape'], task: { check: () => !S.ixPlay, doIt: () => SB.ix.stop() } },
      { tip: true, free: true, say: 'Rules make other things happen: WHEN a layer is clicked or hovered, DO something like play an animation or go to another screen. Press “Rule” to add one.' },
      { tip: true, free: true, say: 'To share it, press Export and choose Interactive. You get a web page that works in any browser, with your draggable knob inside.' },
      { practice: true, free: true, say: 'Add your first rule with the Rule button.', allow: ['#ixPanel', '#inspector'], show: panelBtn(/Rule/), mouse: 'left', enter: () => { if (SB.ix && SB.ix.stop && S.ixPlay) SB.ix.stop(); },
        task: { check: () => rules() >= 1, hint: 'The Rule button is at the top of the Interactions panel.', doIt: () => { const b = panelBtn(/Add a rule|Rule/)(); if (b) b.click(); } } },
    ],
    outro: 'Your animation now reacts to people. Press the X in the Interactions panel to return to the timeline.',
  });
})(window.SB);
