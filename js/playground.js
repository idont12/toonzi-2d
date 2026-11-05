/* The interactive playground: one screen that shows what interactions can do, built from the app's own parts.
     Toonzi's eyes follow the mouse          a controller, moved by a "Pointer moves" rule
     Hop / Dance / Flip buttons              rig actions; each button blends into its action, and back to Idle when it ends
     Dance turns on and off                  a variable flipped by the button, and two "Every frame" rules that watch it
     buttons grow under the mouse            Hover and Leave rules that set the size
     three switches                          click: show / hide layers (party colors, orbiting stars, a wavy title)
     the Size slider                         an interactive controller the viewer drags; it drives Toonzi's size
     hover / click Toonzi                    a speech bubble pops in; a click plays a Jelly effect
   Logo menu › Examples › Interactive playground. It is also exported as docs/media/playground.html (Interactive › HTML).
   Positions are stage pixels (1920 x 1080). Every action lasts 2.4 s, and the looping effects are timed to repeat
   exactly in 2.4 s, so nothing jumps when an action starts over. */
'use strict';
(function (SB) {
  const U = SB.util, S = SB.state, tree = SB.tree;
  const K = (t, v, e = 'smooth') => ({ t, v, e });
  const fx = (type, extra) => Object.assign(SB.fx.make(type), extra || {});
  const r1 = v => Math.round(v * 10) / 10;
  const D = 2.4; // the length of every action

  async function load() {
    if (S.objects.length) { const v = await SB.dialog.ask('Open the playground?', 'It replaces what is on the stage now. You can undo this.', [{ v: 1, label: 'Open it', primary: true }]); if (!v) return; }
    try { await Promise.all(['700 100px Lexend', '500 100px Lexend', '600 100px Lexend'].map(f => document.fonts.load(f))); } catch (e) { /* fonts are optional */ }
    const A = SB.example.art, M = A.MASCOT, C = A.C, INK = C.INK, BRAND = C.BRAND, WHITE = C.WHITE;
    SB.screens.restore(null); S.ctx = null; S.doc.transitions = S.doc.transitions || []; S.time = 0;
    Object.assign(S.project, SB.defaultProject(), { name: 'Interactive playground', duration: D, fixedLen: true, w: 1920, h: 1080, fps: 30, bg: C.CREAM, target: 'web' });

    // ---------- layer makers (stage px; inside a group, at: the group's place)
    const make = (type, extra) => tree.make(type, Object.assign({ start: 0, dur: D }, extra));
    const at0 = { x: 0, y: 0 }; let at = at0; const P = (x, y) => ({ x: r1(x - at.x), y: r1(y - at.y) });
    const shape = (name, kind, x, y, w, h, fill, extra) => make('shape', Object.assign({ name, shape: kind, w, h, fill, fillOn: true, strokeW: 0 }, P(x, y), extra));
    const tw = (text, size, weight) => { try { return SB.text.info({ text, font: 'lexend', fontSize: size, weight, bold: weight >= 600 }).w; } catch (e) { return text.length * size * 0.58; } };
    const T = (name, text, x, y, size, color, o = {}) => { // align 'left': x is the left edge
      const weight = o.weight || 700, al = o.align || 'center', cx = al === 'left' ? x + tw(text, size, weight) / 2 : x, ex = Object.assign({}, o); delete ex.align; delete ex.weight;
      return make('text', Object.assign({ name, text, font: 'lexend', fontSize: size, weight, bold: weight >= 600, color, talign: 'center' }, P(cx, y), ex));
    };
    const draw = (name, x, y, strokes, extra) => make('draw', Object.assign({ name, frames: [{ strokes }] }, P(x, y), extra));
    /** a group at stage point (x, y); kids(): its layers, back to front */
    const group = (name, x, y, kids, extra) => { const was = at; at = { x, y }; const list = kids(); at = was; return make('group', Object.assign({ name, collapsed: true, children: list.slice().reverse(), frames: [] }, P(x, y), extra)); };

    // ---------- backgrounds: day, and the party colors (hidden until the switch)
    const dayBg = shape('Background', 'rect', 960, 540, 2000, 1160, A.grad('radial', 0, [['#FFF9EC', 0], [C.CREAM, 0.6], [C.LAV, 1]]));
    const dots = []; const COLS = ['#FF5FA2', C.SUN, '#3EC6A8', BRAND, C.ORANGE];
    for (let i = 0; i < 46; i++) { const x = 60 + ((i * 397) % 1800), y = 60 + ((i * 251) % 960), s = 14 + (i % 4) * 7; dots.push({ b: 1, subs: [A.ell(x - 960, y - 540, s, s, 0)], c: COLS[i % 5], s: 0, fc: COLS[i % 5] }); }
    const party = group('Party colors (switch)', 960, 540, () => [
      shape('Party background', 'rect', 960, 540, 2000, 1160, A.grad('linear', 150, [['#FFC2E2', 0], ['#D9C9FF', 0.55], ['#A8E8FF', 1]])),
      draw('Confetti', 960, 540, dots, { effects: [fx('float', { amt: 0.6, speed: 1.007 }), fx('rainbow', { speed: 1.0714 })] }),
    ], { hidden: true });

    // ---------- Toonzi: a rig with four actions, eyes on a controller, inside a group the Size slider scales
    const mx = 560, my = 520, k = 0.58, topY = my - 330 * k, rootY = my + 470 * k;
    const eyes = make('null', Object.assign({ name: 'Eyes controller (follows the mouse)', ctype: 'xy', range: 70 }, { x: 140, y: 150 })); eyes.rx = eyes.x; eyes.ry = eyes.y;
    const SL = { top: [0, -1], left: [-1, 0], center: [0, 0], right: [1, 0], bottom: [0, 1] };
    const drive = (o, ctrl, slots, vals) => { (o.drv = o.drv || []).push({ id: U.uid(), ctrl: ctrl.id, amt: 1, space: 'local', states: slots.map(s => ({ slot: s, u: SL[s][0], v: SL[s][1], p: vals(SL[s]) })) }); };
    let parts = null;
    const mascot = group('Toonzi (hover me, click me)', mx, rootY, () => {
      const sc = { scale: k, ...P(mx, my) };
      const body = make('draw', Object.assign({ name: 'Toonzi body', frames: [{ strokes: [A.bodyPath()] }] }, sc));
      const leaf = make('draw', Object.assign({ name: 'Toonzi leaf', frames: [{ strokes: [A.leafPath()] }] }, sc));
      const eye = (n, e) => shape('Eye ' + n, 'ellipse', mx + e.x * k, my + e.y * k, e.w, e.h, WHITE, { rot: e.rot, scale: k });
      const eyeL = eye('left', M.eyeL), eyeR = eye('right', M.eyeR);
      const pupL = make('draw', Object.assign({ name: 'Pupil left', frames: [{ strokes: [A.pupilPath('L')] }] }, sc)), pupR = make('draw', Object.assign({ name: 'Pupil right', frames: [{ strokes: [A.pupilPath('R')] }] }, sc));
      const look = pu => drive(pu, eyes, Object.keys(SL), ([u, v]) => ({ x: r1(pu.x + u * 34), y: r1(pu.y + v * 40) })); look(pupL); look(pupR);
      /* the rig turns around Toonzi's middle (ay), so Flip spins in the air; its spine starts at the feet */
      const rig = make('rig', Object.assign({ name: 'Toonzi rig', ik: 2, showBones: false, ay: -(rootY - my) }, P(mx, my)));
      const spine = { id: U.uid(), name: 'Spine', parent: null, x: 0, y: 0, len: rootY - topY, ang: -90, pose: 0, segs: 6 };
      const bx = mx - 99 * k, by = my - 266 * k;
      const leafB = { id: U.uid(), name: 'Leaf', parent: spine.id, x: 0, y: 0, ox: r1(-(by - topY)), oy: r1(bx - mx), len: 235 * k, ang: -55, pose: 0, dyn: { on: true, stiff: 0.32, damp: 0.18, grav: 1.1 } };
      rig.bones = [spine, leafB];
      const shadow = shape('Ground shadow', 'ellipse', mx, rootY + 18, 380, 46, '#33204F22');
      const stars = group('Orbiting stars (switch)', mx, my, () => [0, 1, 2, 3, 4, 5].map(i => { const a = i * Math.PI / 3; return shape('Star ' + (i + 1), 'star', mx + Math.cos(a) * 330, my + Math.sin(a) * 330, 70, 70, [C.SUN, '#FF5FA2', '#3EC6A8'][i % 3], { rot: i * 20 }); }),
        { hidden: true, effects: [fx('spin', { speed: 0.8333 })] }); // 180° in 2.4 s: six stars look the same every 60°
      parts = { body, leaf, eyeL, eyeR, pupL, pupR, rig, spine, leafB };
      return [shadow, stars, body, eyeL, eyeR, pupL, pupR, leaf, rig];
    });
    const sizeCtl = make('null', { name: 'Size slider (drag it)', ctype: 'x', range: 200, ixGrab: true, color: BRAND, x: 1410, y: 958 }); sizeCtl.rx = sizeCtl.x; sizeCtl.ry = sizeCtl.y;
    drive(mascot, sizeCtl, ['left', 'center', 'right'], ([u]) => ({ scale: u < 0 ? 0.72 : u > 0 ? 1.2 : 1 }));
    const hi = group('Hi bubble', mx + 300, topY + 10, () => [
      shape('Bubble', 'round', mx + 300, topY + 10, 170, 104, WHITE, { radius: 40, stroke: INK, strokeW: 6 }),
      T('Bubble text', 'Hi!', mx + 300, topY + 10, 52, INK)], { hidden: true });
    const hint = T('Hint', 'Move your mouse. Click Toonzi!', mx, 990, 34, '#6B5A8E', { weight: 600, effects: [fx('float', { amt: 0.4, speed: 1.007 })] });

    // ---------- the title: plain, and a wavy rainbow one (hidden until the switch)
    const titleA = group('Title', 1410, 150, () => [T('Title', 'Toonzi 2D', 1410, 150, 124, INK), T('Slogan', 'Everyone can animate', 1410, 248, 44, BRAND, { weight: 600 })]);
    const titleB = group('Wavy title (switch)', 1410, 150, () => [T('Title', 'Toonzi 2D', 1410, 150, 124, BRAND, { effects: [fx('wave', { amt: 0.8, speed: 1.047 }), fx('rainbow', { speed: 1.0714 })] }), T('Slogan', 'Everyone can animate', 1410, 248, 44, '#FF5FA2', { weight: 600, effects: [fx('wave', { amt: 0.5, speed: 1.047 })] })], { hidden: true });

    // ---------- the panel: buttons, switches and the slider
    const panel = shape('Panel', 'round', 1410, 650, 700, 690, WHITE, { radius: 9, effects: [fx('shadow', { distance: 12, blur: 34, opacity: 16 })] });
    const head = (text, y) => T('Heading: ' + text, text, 1100, y, 34, INK, { align: 'left' });
    const button = (label, x) => group(label + ' button', x, 450, () => [shape('Button', 'round', x, 450, 190, 82, BRAND, { radius: 50 }), T('Label', label, x, 450, 36, WHITE)]);
    const btns = { hop: button('Hop', 1205), dance: button('Dance', 1410), flip: button('Flip', 1615) };
    const sw = (label, y) => {
      const x = 1650, lab = T('Switch label: ' + label, label, 1100, y, 32, INK, { align: 'left', weight: 500 });
      let off, on; const g = group('Switch: ' + label, x, y, () => [
        off = group('Off', x, y, () => [shape('Track', 'round', x, y, 112, 58, '#DDD6F0', { radius: 50 }), shape('Knob', 'ellipse', x - 27, y, 46, 46, WHITE)]),
        on = group('On', x, y, () => [shape('Track', 'round', x, y, 112, 58, BRAND, { radius: 50 }), shape('Knob', 'ellipse', x + 27, y, 46, 46, WHITE)], { hidden: true })]);
      return { lab, g, off, on };
    };
    const sws = { party: sw('Party colors', 625), stars: sw('Orbiting stars', 712), wavy: sw('Wavy title', 799) };
    const track = shape('Slider track', 'round', 1410, 958, 440, 16, '#DDD6F0', { radius: 50 });
    const small = T('Slider: smaller', 'smaller', 1150, 958, 24, '#6B5A8E', { weight: 500 }), big = T('Slider: bigger', 'bigger', 1676, 958, 24, '#6B5A8E', { weight: 500 });

    S.objects = [sizeCtl, eyes, hi, mascot, hint, track, small, big, sws.party.g, sws.party.lab, sws.stars.g, sws.stars.lab, sws.wavy.g, sws.wavy.lab, btns.hop, btns.dance, btns.flip,
      head('Size', 885), head('Switch it up', 548), head('Make it move', 362), panel, titleB, titleA, party, dayBg];
    tree.reindex(); SB.time.set(0);

    // ---------- the actions (keyframes on the rig): Idle, Hop, Dance, Flip
    const { rig, spine } = parts, sb = spine.id, ry = rig.y, rx = rig.x;
    rig.tracks['bonesx:' + sb] = [K(0, 1), K(0.6, 1.025), K(1.2, 1), K(1.8, 1.025), K(2.4, 1)];
    rig.tracks['bonesy:' + sb] = [K(0, 1), K(0.6, 0.985), K(1.2, 1), K(1.8, 0.985), K(2.4, 1)];
    const hop = { ['bonesx:' + sb]: [K(0, 1), K(0.25, 1.16, 'easeOut'), K(0.45, 0.9), K(0.9, 0.96), K(1.05, 1.18, 'easeOut'), K(1.3, 0.97), K(1.6, 1), K(2.4, 1)],
      ['bonesy:' + sb]: [K(0, 1), K(0.25, 0.84, 'easeOut'), K(0.45, 1.12), K(0.9, 1.05), K(1.05, 0.82, 'easeOut'), K(1.3, 1.03), K(1.6, 1), K(2.4, 1)],
      y: [K(0, ry, 'hold'), K(0.25, ry, 'easeOut'), K(0.62, ry - 170, 'easeIn'), K(1.0, ry, 'hold'), K(2.4, ry)] };
    const dance = { ['bonebend:' + sb]: [K(0, 0), K(0.6, 15), K(1.2, 0), K(1.8, -15), K(2.4, 0)], x: [K(0, rx), K(0.6, rx + 36), K(1.2, rx), K(1.8, rx - 36), K(2.4, rx)],
      ['bonesy:' + sb]: [0, 0.3, 0.6, 0.9, 1.2, 1.5, 1.8, 2.1, 2.4].map((t, i) => K(t, i === 0 || i === 8 ? 1 : i % 2 ? 0.92 : 1.03)), ['bonesx:' + sb]: [0, 0.3, 0.6, 0.9, 1.2, 1.5, 1.8, 2.1, 2.4].map((t, i) => K(t, i === 0 || i === 8 ? 1 : i % 2 ? 1.07 : 0.98)) };
    const flip = { y: [K(0, ry, 'hold'), K(0.22, ry, 'easeOut'), K(0.7, ry - 190, 'easeIn'), K(1.15, ry, 'hold'), K(2.4, ry)], rot: [K(0, 0, 'hold'), K(0.3, 0, 'smooth'), K(1.1, -360, 'hold'), K(2.4, -360)],
      ['bonesy:' + sb]: [K(0, 1), K(0.22, 0.84, 'easeOut'), K(0.4, 1.1), K(1.0, 1.04), K(1.15, 0.84, 'easeOut'), K(1.4, 1.03), K(1.7, 1), K(2.4, 1)] };
    const ids = { idle: 'ac' + U.uid(), hop: 'ac' + U.uid(), dance: 'ac' + U.uid(), flip: 'ac' + U.uid() };
    rig.actions = { cur: ids.idle, list: [{ id: ids.idle, name: 'Idle', dur: D }, { id: ids.hop, name: 'Hop', dur: D, tracks: { [rig.id]: hop } }, { id: ids.dance, name: 'Dance', dur: D, tracks: { [rig.id]: dance } }, { id: ids.flip, name: 'Flip', dur: D, tracks: { [rig.id]: flip } }] };
    /* bind the drawing to the rig at rest (the leaf swings on its own bone) */
    const R = SB.rig, { body, leaf, eyeL, eyeR, pupL, pupR, leafB } = parts;
    [body, eyeL, eyeR, pupL, pupR].forEach(o => { R.bindTo(o, rig, null, 'deform'); const B = o.bind; if (B) { delete B.inv[leafB.id]; delete B.seg[leafB.id]; if (B.rigOf) delete B.rigOf[leafB.id]; if (B.bbf) delete B.bbf[leafB.id]; } });
    R.bindTo(leaf, rig, leafB.id, 'follow');

    // ---------- the rules
    const lib = SB.ix.library(), anim = id => (lib.find(a => a.actId === id) || {}).key, key = o => SB.ix.keyOf(o);
    let n = 0; const rule = (name, when, acts, conds = [], extra) => Object.assign({ id: 'ru' + U.uid(), name: `${++n}. ${name}`, when, join: 'and', conds, acts }, extra);
    const click = o => ({ type: 'click', layer: key(o) }), play = (id, o) => Object.assign({ type: 'play', anim: anim(id), mix: 250, ease: 'smooth' }, o);
    const grow = (o, v) => ({ type: 'set', layer: key(o), prop: 'scale', value: v, dur: 140 });
    const rules = [
      rule('Eyes follow the mouse', { type: 'move', layer: '' }, [{ type: 'follow', ctrl: key(eyes), smooth: 0.2 }], [], { repeat: true }),
      rule('Hop', click(btns.hop), [{ type: 'vr', name: 'dance', op: 'set', value: 0 }, play(ids.hop, { loop: false })]),
      rule('After a hop: Idle', { type: 'end', anim: anim(ids.hop) }, [play(ids.idle, { mix: 350 })]),
      rule('Flip', click(btns.flip), [{ type: 'vr', name: 'dance', op: 'set', value: 0 }, play(ids.flip, { loop: false })]),
      rule('After a flip: Idle', { type: 'end', anim: anim(ids.flip) }, [play(ids.idle, { mix: 350 })]),
      rule('Dance button turns dancing on or off', click(btns.dance), [{ type: 'vr', name: 'dance', op: 'flip' }]),
      rule('Start dancing', { type: 'tick' }, [play(ids.dance, { mix: 300 })], [{ type: 'vr', name: 'dance', op: '=', value: 1 }, { type: 'anim', anim: anim(ids.dance), not: true }]),
      rule('Stop dancing', { type: 'tick' }, [play(ids.idle, { mix: 300 })], [{ type: 'vr', name: 'dance', op: '=', value: 0 }, { type: 'anim', anim: anim(ids.dance) }]),
      ...Object.values(btns).flatMap(b => [rule(`${b.name}: grow under the mouse`, { type: 'hover', layer: key(b) }, [grow(b, 112)]), rule(`${b.name}: back to its size`, { type: 'leave', layer: key(b) }, [grow(b, 100)])]),
      ...[[sws.party, party], [sws.stars, tree.all().find(o => o.name === 'Orbiting stars (switch)')], [sws.wavy, titleB, titleA]].map(([s, ...targets]) =>
        rule(`${s.g.name.replace('Switch: ', '')} switch`, click(s.g), [s.on, s.off, ...targets].map(o => ({ type: 'vis', layer: key(o), mode: 'toggle' })))),
      ...Object.values(sws).flatMap(s => [rule(`${s.g.name}: grow under the mouse`, { type: 'hover', layer: key(s.g) }, [grow(s.g, 108)]), rule(`${s.g.name}: back to its size`, { type: 'leave', layer: key(s.g) }, [grow(s.g, 100)])]),
      rule('Say hi', { type: 'hover', layer: key(mascot) }, [{ type: 'vis', layer: key(hi), mode: 'show' }, { type: 'effect', layer: key(hi), fx: 'popIn', dur: 350 }]),
      rule('Bye', { type: 'leave', layer: key(mascot) }, [{ type: 'vis', layer: key(hi), mode: 'hide' }]),
      rule('Giggle when clicked', click(mascot), [{ type: 'effect', layer: key(mascot), fx: 'jelly', dur: 900 }]),
    ];
    S.doc.ix = { v: 2, start: anim(ids.idle), rules, view: 'rules' };

    tree.reindex(); tree.select([]); SB.time.set(0); SB.commit(); SB.view.reset();
    SB.toast('The interactive playground: open Interactions (next to the play button) and press Preview, then move the mouse, click and drag.');
  }
  SB.playground = { load };
  if (SB.examples) SB.examples.list.push({ name: 'Interactive playground', kind: 'project', file: 'builtin:playground', about: 'Eyes that follow the mouse, buttons that switch actions, switches and a slider', builtin: load });
})(window.SB);
