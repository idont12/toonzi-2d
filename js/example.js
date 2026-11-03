/* The example project: a 27 second trailer for Toonzi 2D, built from the app's own tools.
     DRAW      animated brushes (flow, pulse, march, boil), bezier paths, draw-on, hand-drawn boil
     EASE      keyframes with eases, looping keyframes, a curved motion path
     STYLE     effects, transitions in and out, a mask
     RIG       a bone rig that bends the mascot, a controller, a follow constraint, action strips, a swinging leaf
     DROP      physics: bodies that fall on keyed beats, surfaces, a pendulum hanging from a bone
     LOGO      the mascot lands, the name appears
   Every shot is a group with its own clock (seq: true), laid over the one before it, so the next shot's "in"
   transition (a designed one from the transition library, or a built-in one) is what you see between shots.
   Positions in the code are stage pixels (1920 x 1080); L() turns them into the shot's own space. */
'use strict';
(function (SB) {
  const U = SB.util, S = SB.state, tree = SB.tree, G = SB.paths;
  const K = (t, v, e = 'smooth') => ({ t, v, e });
  const fx = (type, extra) => Object.assign(SB.fx.make(type), extra || {});
  const L = (x, y) => ({ x: x - 960, y: y - 540 });
  const X = v => v - 960, Y = v => v - 540; /* stage px -> a keyframe value inside a shot */
  const r1 = v => Math.round(v * 10) / 10;
  const rad = d => d * Math.PI / 180;

  // brand palette
  const INK = '#33204F', BRAND = '#5B3DF5', ORANGE = '#F08C2E', CREAM = '#FFF4E0', LAV = '#E9E3FF', SUN = '#FFC857', PEACH = '#FFD9AE', VIOLET = '#B9A8FF', DEEP = '#241638', WHITE = '#FFFFFF';
  const grad = (type, ang, stops) => SB.paint.grad(type, ang, stops.map(([c, p]) => ({ c, p })));

  // ---------- the mascot (traced from the logo): a dark round apple-like blob, a leaf, two big white eyes
  /* paths are in logo pixels around the middle of the blob (the logo is 862 x 903) */
  const MASCOT = {
    body: [226, -318, 155.5, -351.1, 88.4, -362.4, 18, -321, 6.8, -314.4, -33.3, -285.1, -35, -275, -36.6, -265.6, -25.7, -258.3, -21, -250, -28.7, -253.7, -35.7, -259.3, -44, -261, -75, -267.4, -109.1, -264.7, -140, -268, -145.4, -268.6, -150.6, -270.8, -156, -271, -308.5, -277.1, -404.1, -150.3, -427, -11, -447.3, 112.4, -403, 254.3, -318, 347, -238.1, 434.2, -114.1, 479.1, -4, 431, 39.1, 412.2, 72.3, 380.4, 101, 344, 130.7, 357.5, 162.2, 369.6, 195, 371, 330.3, 376.6, 407.9, 256.8, 426, 135, 445.6, 3.6, 403.3, -147.1, 313, -247, 286.2, -276.7, 259.2, -296.5, 226, -318],
    pupilL: [-82, -144, -89.8, -140.8, -95, -139.6, -101, -134, -138.2, -99, -130.7, -26.8, -100, 10, -89, 23.2, -77.5, 33.3, -61, 39, -58.5, 39.9, -55.6, 39.4, -53, 40, -52.5, 40.1, -52.5, 41, -52, 41, -46, 41, -40, 40.8, -34, 40, -28.9, 39.4, -18.2, 32.9, -16, 31, 7.2, 11.8, 12.4, -20.7, 9, -48, 8.4, -52.6, 5.5, -85.2, 1, -84, -20.3, -78.2, -37.7, -62.7, -57, -52, -57, -52.5, -58, -52.5, -58, -53, -58.6, -110.9, -31.4, -154.1, -82, -144],
    pupilR: [80, -202, 69.9, -199, 67.2, -199, 58, -192, 14.8, -159.1, 31, -68.7, 67, -37, 98.6, -9.2, 139.3, -5.2, 160, -50, 164.8, -60.4, 165.5, -68.8, 167, -79, 170.4, -102.6, 166.1, -117.8, 159, -141, 139.4, -130.8, 121, -118.9, 101, -110, 101, -110.5, 100, -110.5, 100, -111, 99.1, -197.6, 127.9, -202, 80, -202],
    eyeL: { x: -112, y: 6, w: 333, h: 478, rot: -15 }, eyeR: { x: 170, y: -69, w: 306, h: 478, rot: -15 },
    leaf: [-319, -371, -176, -435, -51, -261, -147, -270],
  };
  const sub = p => ({ p: p.slice(), cl: 1 });
  const bodyPath = (o = {}) => Object.assign({ b: 1, subs: [sub(MASCOT.body)], c: INK, s: 0, fc: INK, lj: 'round' }, o);
  const pupilPath = (side, o = {}) => Object.assign({ b: 1, subs: [sub(side === 'L' ? MASCOT.pupilL : MASCOT.pupilR)], c: INK, s: 0, fc: INK, lj: 'round' }, o);
  const leafPath = (o = {}) => Object.assign({ b: 1, subs: [G.poly(MASCOT.leaf, true)], c: INK, s: 22, fc: INK, lj: 'round' }, o);
  /** an ellipse (rotated by rot degrees) as a bezier sub */
  const ell = (cx, cy, w, h, rot = 0) => { const e = G.ellipse(0, 0, w / 2, h / 2), a = rad(rot), c = Math.cos(a), s = Math.sin(a), p = []; for (let i = 0; i < e.p.length; i += 2) p.push(r1(cx + e.p[i] * c - e.p[i + 1] * s), r1(cy + e.p[i] * s + e.p[i + 1] * c)); return { p, cl: 1 }; };
  /** a quadratic curve a → b bent towards q, as a bezier sub piece (appended to a path) */
  const quad = (a, q, b) => [a[0] + 2 / 3 * (q[0] - a[0]), a[1] + 2 / 3 * (q[1] - a[1]), b[0] + 2 / 3 * (q[0] - b[0]), b[1] + 2 / 3 * (q[1] - b[1]), b[0], b[1]].map(r1);
  const wave = (x0, x1, y, amp, n, ph = 0) => { const a = []; for (let i = 0; i <= n; i++) { const u = i / n; a.push(r1(x0 + (x1 - x0) * u), r1(y + Math.sin(u * Math.PI * 2 * 2 + ph) * amp)); } return a; };
  const rotPts = (pts, deg) => { const a = rad(deg), c = Math.cos(a), s = Math.sin(a), o = []; for (let i = 0; i < pts.length; i += 2) o.push(r1(pts[i] * c - pts[i + 1] * s), r1(pts[i] * s + pts[i + 1] * c)); return o; };

  SB.example = {
    async load() {
      if (S.objects.length) { const v = await SB.dialog.ask('Open the example?', 'It replaces what is on the stage now. You can undo this.', [{ v: 1, label: 'Open example', primary: true }]); if (!v) return; }
      try { await Promise.all(['700 100px Lexend', '500 100px Lexend', '600 100px Lexend'].map(f => document.fonts.load(f))); } catch (e) { /* fonts are optional */ }
      SB.screens.restore(null); S.ctx = null;
      const p = S.project; Object.assign(p, SB.defaultProject(), { name: 'Toonzi 2D trailer', duration: 34.2, fixedLen: true, w: 1920, h: 1080, fps: 24, bg: CREAM });
      S.doc.transitions = []; S.time = 0;
      const make = (type, extra) => tree.make(type, Object.assign({ start: 0, dur: 5 }, extra));
      const tw = (text, size, weight) => { try { return SB.text.info({ text, font: 'lexend', fontSize: size, weight, bold: weight >= 600 }).w; } catch (e) { return text.length * size * 0.58; } };

      // ---------- designed transitions (from the transition library): the shots arrive with these
      const TRS = SB.transitions.PRESETS;
      const design = (name, preset, dur, tweak) => { const tr = Object.assign({ id: U.uid(), name, kind: 'in', dur }, TRS[preset][1]()); if (tweak) tweak(tr); S.doc.transitions.push(tr); return 'tr:' + tr.id; };
      const trSlide = design('Trailer slide', 'stretch', 0.7, t => t.layer.keys.forEach(k => { k.e = 'easeOut'; }));
      const trIris = design('Trailer iris', 'iris', 0.8, t => t.shapes[0].keys.forEach(k => { k.e = 'easeOut'; }));
      const trBlinds = design('Trailer blinds', 'blinds', 0.8);
      const trSplit = design('Trailer split', 'split', 0.8);
      const trPop = design('Trailer pop', 'pop', 0.6);
      const trRise = design('Trailer rise', 'rise', 0.8);
      SB.transitions.sync();

      // ---------- layer makers (stage coordinates)
      let SD = 5; /* the length of the shot being built */
      const mk = (type, extra) => make(type, Object.assign({ dur: SD }, extra));
      const shape = (name, kind, x, y, w, h, fill, extra) => mk('shape', Object.assign({ name, shape: kind, w, h, fill, fillOn: true, strokeW: 0 }, L(x, y), extra));
      /** text; align: 'left' puts x at its left edge, 'right' at its right edge */
      const T = (name, text, x, y, size, color, o = {}) => {
        const weight = o.weight || 700, al = o.align || 'center', w = Math.max(...text.split('\n').map(s => tw(s, size, weight))), cx = al === 'left' ? x + w / 2 : al === 'right' ? x - w / 2 : x;
        const ex = Object.assign({}, o); delete ex.align; delete ex.weight;
        return mk('text', Object.assign({ name, text, font: 'lexend', fontSize: size, weight, bold: weight >= 600, color, talign: al === 'center' ? 'center' : al, ...L(cx, y) }, ex));
      };
      const draw = (name, x, y, strokes, extra) => mk('draw', Object.assign({ name, frames: [{ strokes }] }, L(x, y), extra));
      const bg = (fill, extra) => shape('Background', 'rect', 960, 540, 2200, 1300, fill, extra);
      /** the small label above each title */
      const kicker = (x, y, text, bgc, color, at = 0.1) => T('Kicker', text, x, y, 34, color, { align: 'left', weight: 600, bgOn: true, bg: bgc, hlStyle: 'box', hlRadius: 100, hlPadX: 50, hlPadY: 30, effects: [fx('popIn', { at: at - 0.1, dur: 0.5 })] });
      /** kicker, big title and two lines under it */
      const heading = (x, kick, title, sub, th) => {
        const out = [kicker(x + 30, 150, kick, th.pill, th.pillInk), T('Title', title, x, 335, 210, th.title, { align: 'left', effects: [fx('slideIn', { dir: 'down', amt: 0.35, dur: 0.6, at: 0.1 })] })];
        if (sub) out.push(T('Subtitle', sub, x + 8, sub.includes('\n') ? 590 : 560, 56, th.sub, { align: 'left', weight: 500, effects: [fx('fadeIn', { dur: 0.5, at: 0.6 })] }));
        return out;
      };
      const shot = (name, start, dur, kids, extra, raw) => make('group', Object.assign({ name, seq: true, inPoint: 0, collapsed: true, children: kids.slice().reverse(), x: 960, y: 540, start: raw ? start : ST(start), dur, frames: [] }, extra)); /* raw: a time already on the final timeline */
      /** a rotated square used as the keyframe diamond */
      const diamond = (name, x, y, s, fill, extra) => shape(name, 'rect', x, y, s, s, fill, Object.assign({ rot: 45 }, extra));

      /** the mascot as separate layers (body, leaf, eyes, pupils): they can bend with a rig, blink and look around.
          x, y: where its middle is (stage), k: size (1 = the logo's own size, 903 px tall) */
      function mascot(x, y, k, o = {}) {
        const at = { scale: k, ...L(x, y) };
        const bodyL = mk('draw', Object.assign({ name: 'Mascot body', frames: [{ strokes: [bodyPath()] }] }, at));
        const leafL = mk('draw', Object.assign({ name: 'Mascot leaf', frames: [{ strokes: [leafPath()] }] }, at));
        const eye = (n, e) => mk('shape', { name: 'Eye ' + n, shape: 'ellipse', w: e.w, h: e.h, fill: WHITE, fillOn: true, strokeW: 0, rot: e.rot, scale: k, ...L(x + e.x * k, y + e.y * k) });
        const eyeL = eye('left', MASCOT.eyeL), eyeR = eye('right', MASCOT.eyeR);
        const pupL = mk('draw', Object.assign({ name: 'Pupil left', frames: [{ strokes: [pupilPath('L')] }] }, at)), pupR = mk('draw', Object.assign({ name: 'Pupil right', frames: [{ strokes: [pupilPath('R')] }] }, at));
        return { body: bodyL, leaf: leafL, eyeL, eyeR, pupL, pupR, stack: [bodyL, eyeL, eyeR, pupL, pupR, leafL], bind: [bodyL, eyeL, eyeR, pupL, pupR] };
      }
      /** a rig for the mascot: one segmented spine (it curls smoothly) and a loose leaf bone with its own swing */
      function mascotRig(x, y, k, name) {
        const topY = y - 330 * k, rootY = y + 470 * k, len = rootY - topY;
        const rig = mk('rig', Object.assign({ name, ik: 2, showBones: false }, L(x, rootY)));
        const spine = { id: U.uid(), name: 'Spine', parent: null, x: 0, y: 0, len, ang: -90, pose: 0, segs: 6 };
        const bx = x - 99 * k, by = y - 266 * k; /* where the leaf sits on the blob */
        const leaf = { id: U.uid(), name: 'Leaf', parent: spine.id, x: 0, y: 0, ox: r1(-(by - topY)), oy: r1(bx - x), len: 235 * k, ang: -55, pose: 0, dyn: { on: true, stiff: 0.32, damp: 0.18, grav: 1.1 } };
        rig.bones = [spine, leaf]; return { rig, spine, leaf };
      }
      /** how a layer reacts when a controller sits at the centre, left, right, top and bottom */
      const SLOTS = { top: [0, -1], left: [-1, 0], center: [0, 0], right: [1, 0], bottom: [0, 1] };
      const drive = (o, ctrl, vals) => { (o.drv = o.drv || []).push({ id: U.uid(), ctrl: ctrl.id, amt: 1, space: 'local', states: Object.keys(SLOTS).map(k => ({ slot: k, u: SLOTS[k][0], v: SLOTS[k][1], p: vals(k) })) }); };

      const shots = []; /* [shot, bind step] in the order they are built */
      /* the welcome shot comes first and the games-and-web shot before the four words: ST moves the other shots' times to make room */
      const W0 = 3.2, GG = 4.0, ST = t => r1(t + W0 + (t >= 20.05 ? GG : 0));
      const after = []; /* work that needs the layers in the tree (binding to rigs, constraints): [time, fn] */

      // =====================================================================  1. DRAW  (0 - 4.5s)
      SD = 4.5; const S1 = (() => {
        const th = { pill: ORANGE, pillInk: CREAM, title: INK, sub: BRAND };
        const mx = 1440, my = 560, k = 0.74;
        const face = [bodyPath({ s: 7, lj: 'round', bs: { an: { k: 'boil', sp: 1, a: 0.6 } } }), leafPath({ s: 7 }), { b: 1, subs: [ell(MASCOT.eyeL.x, MASCOT.eyeL.y, MASCOT.eyeL.w, MASCOT.eyeL.h, MASCOT.eyeL.rot)], c: INK, s: 7, fc: WHITE, lj: 'round' }, { b: 1, subs: [ell(MASCOT.eyeR.x, MASCOT.eyeR.y, MASCOT.eyeR.w, MASCOT.eyeR.h, MASCOT.eyeR.rot)], c: INK, s: 7, fc: WHITE, lj: 'round' }, pupilPath('L', { s: 4 }), pupilPath('R', { s: 4 })];
        const kids = [
          bg(grad('radial', 0, [['#FFF9EC', 0], [CREAM, 0.7], ['#FFE9C6', 1]])),
          shape('Warm disc', 'ellipse', mx, my + 10, 760, 760, PEACH, { effects: [fx('popIn', { at: 0.05, dur: 0.7 }), fx('float', { amt: 0.5 })] }),
          /* the ring: a marching dashed brush */
          draw('Ring (marching dashes)', mx, my + 10, [{ b: 1, subs: [ell(0, 0, 840, 840, 0)], c: BRAND, s: 9, bs: { an: { k: 'march', sp: 1.2, a: 0.6 } } }], { effects: [fx('drawIn', { at: 0.0, dur: 1.3 })], opacity: 0.9 }),
          draw('Mascot (drawn on, boiling ink)', mx, my, face, { scale: k, effects: [fx('drawIn', { at: 0.4, dur: 2 }), fx('boil', { amt: 0.5 }), fx('float', { amt: 0.5, at: 2.6 })] }),
          /* stars that flow along a wave */
          draw('Stars (flowing brush)', 0, 0, [{ c: ORANGE, s: 44, pts: wave(140, 880, 462, 14, 36), tx: 'img', bs: { img: 'b:star', im: 'stamp', isp: 1.3, isc: 0.15, irot: 0.3, isz: 0.25, an: { k: 'flow', sp: 1, a: 0.5 } } }], { effects: [fx('wipeIn', { at: 0.9, dur: 0.8, dir: 'left' })] }),
          /* a line whose thickness pulses */
          draw('Wave (pulsing brush)', 0, 0, [{ c: BRAND, s: 30, pts: wave(140, 880, 930, 22, 40, 1), bs: { ts: 0.12, te: 0.12, an: { k: 'pulse', sp: 1, a: 0.7 } } }], { effects: [fx('drawIn', { at: 1.2, dur: 0.9 })] }),
          ...heading(130, 'BRUSHES  ·  VECTORS', 'Draw it.', 'Ink that wiggles.\nBrushes that move.', th),
        ];
        return shot('Shot 1: Draw', 0, 4.5, kids, { effects: [fx(trPop)], tracks: { scale: [K(0, 1, 'linear'), K(4.5, 1.04, 'linear')] } });
      })();

      // =====================================================================  2. EASE  (3.9 - 8.5s)
      SD = 4.6; const S2 = (() => {
        const th = { pill: ORANGE, pillInk: CREAM, title: CREAM, sub: VIOLET };
        const kids = [bg(grad('linear', 135, [[BRAND, 0], ['#4527D8', 1]])),
          shape('Soft circle', 'ellipse', 1750, 220, 560, 560, '#FFFFFF14', { effects: [fx('float', { amt: 0.7 })] }),
          shape('Soft circle small', 'ellipse', 120, 1000, 360, 360, '#FFFFFF10', { effects: [fx('float', { amt: 0.7, at: 0.4 })] })];
        /* five lanes, each ball runs its own ease and loops (Loop keyframes) */
        const lanes = [['Overshoot', 'back', ORANGE], ['Bounce', 'bounce', SUN], ['Elastic', 'elastic', CREAM], ['Smooth', 'smooth', PEACH], ['Your own curve', 'bez', VIOLET]];
        lanes.forEach(([label, ease, col], i) => {
          const y = 705 + i * 74, a = 0.6 + i * 0.14, x0 = 640, x1 = 1640;
          kids.push(shape('Track ' + label, 'round', (x0 + x1) / 2, y, x1 - x0 + 120, 12, '#FFFFFF2E', { radius: 50, effects: [fx('wipeIn', { at: 0.3 + i * 0.1, dur: 0.5, dir: 'left' })] }));
          kids.push(diamond('Key start ' + label, x0, y, 20, CREAM, { effects: [fx('popIn', { at: 0.5 + i * 0.1, dur: 0.4 })] }), diamond('Key end ' + label, x1, y, 20, CREAM, { effects: [fx('popIn', { at: 0.6 + i * 0.1, dur: 0.4 })] }));
          kids.push(T('Label ' + label, label, 560, y, 38, CREAM, { align: 'right', weight: 500, effects: [fx('slideIn', { dir: 'left', amt: 0.25, dur: 0.5, at: 0.3 + i * 0.1 })] }));
          const ball = shape('Ball ' + label, 'ellipse', x0, y, 62, 62, col, { effects: [fx('popIn', { at: a - 0.2, dur: 0.4 }), fx('glow', { amt: 0.5 })], kloop: true });
          const first = K(a, X(x0), ease); if (ease === 'bez') first.bz = [0.8, -0.2, 0.2, 1.2];
          ball.tracks = { x: [first, K(a + 1.15, X(x1), 'hold'), K(a + 1.75, X(x1), 'smooth'), K(a + 2.75, X(x0), 'hold'), K(a + 3.1, X(x0), 'smooth')] };
          kids.push(ball);
        });
        /* a curved motion path: handles bend the way, the ball follows it */
        const A = [1060, 430], B = [1390, 190], C = [1760, 430], q1 = [1090, 170], q2 = [1700, 150];
        const path = { b: 1, subs: [{ p: [A[0], A[1], ...quad(A, q1, B), ...quad(B, q2, C)].map(r1), cl: 0 }], c: VIOLET, s: 6, bs: { an: { k: 'march', sp: 1, a: 0.6 } } };
        kids.push(draw('Motion path', 0, 0, [path], { effects: [fx('drawIn', { at: 0.6, dur: 1 })] }));
        [A, B, C].forEach((q, i) => kids.push(diamond('Path key ' + (i + 1), q[0], q[1], 24, CREAM, { effects: [fx('popIn', { at: 0.9 + i * 0.15, dur: 0.4 })] })));
        const dot = shape('Traveller', 'ellipse', A[0], A[1], 70, 70, ORANGE, { effects: [fx('glow', { amt: 0.7 })], kloop: true });
        dot.tracks = { x: [K(1, X(A[0])), K(2.1, X(B[0])), K(3.2, X(C[0]))], y: [K(1, Y(A[1])), K(2.1, Y(B[1])), K(3.2, Y(C[1]))], scale: [K(1, 0, 'easeOut'), K(1.3, 1, 'smooth'), K(2.95, 1, 'smooth'), K(3.2, 0)] };
        dot.tracks.x[0].cx = X(q1[0]); dot.tracks.x[0].cy = Y(q1[1]); dot.tracks.x[1].cx = X(q2[0]); dot.tracks.x[1].cy = Y(q2[1]);
        kids.push(dot);
        kids.push(...heading(130, 'KEYFRAMES  ·  EASES  ·  PATHS', 'Ease it.', 'Curves that feel alive.', th));
        return shot('Shot 2: Ease', 3.9, 4.6, kids, { effects: [fx(trSlide)], tracks: { scale: [K(0, 1.04, 'linear'), K(4.6, 1, 'linear')] } });
      })();

      // =====================================================================  3. STYLE  (7.9 - 12.5s)
      SD = 4.6; const S3 = (() => {
        const th = { pill: INK, pillInk: CREAM, title: INK, sub: CREAM };
        const kids = [bg(grad('linear', 135, [[ORANGE, 0], ['#FFA652', 1]])),
          shape('Soft circle', 'ellipse', 280, 980, 520, 520, '#FFFFFF1C', { effects: [fx('float', { amt: 0.7 })] })];
        /* a round window (mask) over moving stripes */
        const cx = 1500, cy = 300, stripes = [];
        const cols = [CREAM, BRAND, INK, SUN];
        for (let i = -9; i <= 9; i++) { const x = i * 100; stripes.push({ b: 1, subs: [G.poly([x, -900, x + 100, -900, x + 100, 900, x, 900], true)], c: cols[((i % 4) + 4) % 4], s: 0, fc: cols[((i % 4) + 4) % 4] }); }
        const stripe = draw('Stripes', 0, 0, stripes, { x: 0, y: 0, rot: 28, kloop: true });
        stripe.tracks = { x: [K(0, -200, 'linear'), K(1.6, 200 + 0, 'linear')] };
        const mask = shape('Window (mask)', 'ellipse', 0, 0, 440, 440, WHITE, { isMask: 'in', x: 0, y: 0 });
        mask.tracks = { scale: [K(0.3, 0.02, 'back'), K(1, 1, 'smooth'), K(2.4, 1, 'smooth'), K(3.1, 0.78, 'smooth'), K(3.8, 1, 'smooth')] };
        const win = tree.makeGroup([mask, stripe], 'Masked stripes', ...Object.values(L(cx, cy)), false); win.start = 0; win.dur = SD;
        win.effects = [fx('shadow', { distance: 18, blur: 24, opacity: 30, color: '#7A3A00' })];
        const ring = shape('Window ring', 'ellipse', cx, cy, 456, 456, WHITE, { fillOn: false, stroke: INK, strokeW: 14, effects: [fx('shadow', { distance: 18, blur: 24, opacity: 30, color: '#7A3A00' })] });
        ring.tracks = { scale: mask.tracks.scale.map(q => Object.assign({}, q)) };
        kids.push(win, ring);
        kids.push(T('Window label', 'Mask', cx, cy + 290, 40, INK, { weight: 600, effects: [fx('fadeIn', { at: 1.1, dur: 0.5 })] }));
        /* five tiles, each arrives with a different transition and then plays a loop effect */
        const defs = [['Pop in', 'popIn', 'ellipse', BRAND, 'jelly'], ['Spin in', 'spinIn', 'star', INK, 'spin'], ['Blur in', 'blurIn', 'triangle', BRAND, 'wobble'], ['Wipe', 'wipeIn', 'arrow', INK, 'float'], ['Shatter', trSplit, 'round', BRAND, 'pulse']];
        defs.forEach(([label, inFx, kind, col, loop], i) => {
          const gx = 340 + i * 310, gy = 790, t0 = 1 + i * 0.2, d = SD - t0;
          const card = shape('Tile ' + label, 'round', 0, 0, 252, 252, CREAM, { radius: 18, start: t0, dur: d, x: 0, y: 0 });
          const icon = shape('Icon ' + label, kind, 0, 0, kind === 'arrow' ? 150 : 118, kind === 'arrow' ? 100 : 118, col, { start: t0, dur: d, x: 0, y: 0, effects: [fx(loop, loop === 'spin' ? { speed: 1.2 } : { amt: 1.3 })] });
          const g = tree.makeGroup([icon, card], 'Tile: ' + label, ...Object.values(L(gx, gy)), false); g.start = t0; g.dur = d;
          g.effects = [fx(inFx, inFx === 'wipeIn' ? { dir: 'up', dur: 0.5 } : inFx === trSplit ? { dur: 0.7 } : { dur: 0.55 })];
          kids.push(g, T('Tile name ' + label, label, gx, gy + 190, 38, INK, { weight: 600, start: t0 + 0.2, dur: d - 0.2, effects: [fx('fadeIn', { dur: 0.4 })] }));
        });
        kids.push(...heading(130, 'EFFECTS  ·  TRANSITIONS  ·  MASKS', 'Style it.', null, th));
        kids.push(T('Subtitle', '40 effects and\ntransitions.', 138, 565, 56, CREAM, { align: 'left', weight: 500, effects: [fx('fadeIn', { dur: 0.5, at: 0.7 })] }));
        return shot('Shot 3: Style', 7.9, 4.6, kids, { effects: [fx(trIris)], tracks: { scale: [K(0, 1, 'linear'), K(4.6, 1.04, 'linear')] } });
      })();

      // =====================================================================  4. RIG  (11.9 - 17.1s)
      let rigPack = null;
      SD = 5.2; const S4 = (() => {
        const th = { pill: BRAND, pillInk: CREAM, title: INK, sub: BRAND };
        const mx = 560, my = 560, k = 0.72, hx = 1010;
        const kids = [bg(grad('radial', 0, [['#F6F2FF', 0], [LAV, 0.75], ['#D9CFFF', 1]]))];
        const shadow = shape('Ground shadow', 'ellipse', mx, my + 470 * k + 30, 470, 56, '#33204F26', { effects: [fx('fadeIn', { dur: 0.4 })] });
        shadow.tracks = { scale: [K(0, 1), K(1.3, 1, 'easeOut'), K(1.9, 0.62, 'easeIn'), K(2.2, 1.0, 'smooth'), K(2.34, 1.12, 'smooth'), K(2.6, 1, 'smooth'), K(3.8, 1, 'easeOut'), K(4.4, 0.62, 'easeIn'), K(4.7, 1.0, 'smooth'), K(4.84, 1.12, 'smooth'), K(5.1, 1)] };
        const m = mascot(mx, my, k);
        const { rig, spine, leaf } = mascotRig(mx, my, k, 'Mascot rig');
        /* the knob you drag: a controller (invisible), a box and a knob that follows it */
        const bx = 1450, by = 815, range = 100;
        const ctrl = mk('null', Object.assign({ name: 'Steering controller', ctype: 'xy', range }, L(bx, by))); ctrl.rx = ctrl.x; ctrl.ry = ctrl.y;
        ctrl.tracks = { x: [K(0, ctrl.rx), K(0.6, ctrl.rx - 90), K(1.2, ctrl.rx), K(1.8, ctrl.rx + 90), K(2.4, ctrl.rx)], y: [K(0, ctrl.ry), K(0.6, ctrl.ry - 45), K(1.2, ctrl.ry), K(1.8, ctrl.ry + 45), K(2.4, ctrl.ry)] };
        const box = shape('Controller box', 'round', bx, by, 270, 270, CREAM, { radius: 14, stroke: INK, strokeW: 6, effects: [fx('popIn', { at: 0.5, dur: 0.5 })] });
        const cross = draw('Controller cross', bx, by, [{ c: VIOLET, s: 4, pts: [-110, 0, 110, 0] }, { c: VIOLET, s: 4, pts: [0, -110, 0, 110] }], { effects: [fx('fadeIn', { at: 0.7, dur: 0.4 })] });
        const knob = shape('Knob (follows the controller)', 'ellipse', bx, by, 84, 84, ORANGE, { stroke: INK, strokeW: 6, effects: [fx('popIn', { at: 0.7, dur: 0.5 }), fx('shadow', { distance: 8, blur: 10, opacity: 35 })] });
        const cap = T('Controller label', 'Controller', bx, by + 180, 38, BRAND, { weight: 600, effects: [fx('fadeIn', { at: 1, dur: 0.4 })] });
        /* the eyes and the body follow the same controller */
        const look = (pu, bxp, byp) => drive(pu, ctrl, kk => { const [u, v] = SLOTS[kk]; return { x: bxp + u * 42, y: byp + v * 50 }; });
        look(m.pupL, m.pupL.x, m.pupL.y); look(m.pupR, m.pupR.x, m.pupR.y);
        drive(rig, ctrl, kk => ({ ['bonebend:' + spine.id]: SLOTS[kk][0] * 22 }));
        /* a skeleton drawn over the mascot, bent by the same rig (shown for a moment) */
        const bonesPts = []; for (let i = 0; i <= 40; i++) bonesPts.push(r1(0), r1(470 * k - (800 * k) * i / 40));
        const joints = [0, 1 / 6, 2 / 6, 3 / 6, 4 / 6, 5 / 6, 1].map(u => ({ b: 1, subs: [ell(0, 470 * k - 800 * k * u, 30, 30, 0)], c: ORANGE, s: 6, fc: CREAM }));
        const skel = draw('Skeleton (bends with the rig)', mx, my, [{ c: ORANGE, s: 12, pts: bonesPts }, ...joints], { dur: 3.4, effects: [fx('fadeIn', { at: 0.6, dur: 0.4 }), fx('fadeOut', { dur: 0.6 })] });
        kids.push(shadow, ...m.stack, skel, box, cross, knob, cap, ctrl, rig);
        kids.push(...heading(hx, 'RIGS  ·  CONTROLLERS  ·  ACTIONS', 'Rig it.', 'Bones that bend.\nKnobs that steer.', th));
        /* idle: breathe and look around (the first action) */
        const sb = spine.id;
        rig.tracks['bonesx:' + sb] = [K(0, 1), K(0.6, 1.025), K(1.2, 1), K(1.8, 1.025), K(2.4, 1)];
        rig.tracks['bonesy:' + sb] = [K(0, 1), K(0.6, 0.985), K(1.2, 1), K(1.8, 0.985), K(2.4, 1)];
        /* hop (the second action): squash, stretch, land, settle */
        const ry = rig.y, hopTracks = {};
        hopTracks['bonesx:' + sb] = [K(0, 1), K(0.28, 0.84, 'easeOut'), K(0.5, 1.07, 'smooth'), K(0.95, 1.03, 'smooth'), K(1.1, 0.82, 'easeOut'), K(1.3, 1.03, 'smooth'), K(1.6, 1)];
        hopTracks['bonesy:' + sb] = [K(0, 1), K(0.28, 1.14, 'easeOut'), K(0.5, 0.94, 'smooth'), K(0.95, 0.97, 'smooth'), K(1.1, 1.18, 'easeOut'), K(1.3, 0.97, 'smooth'), K(1.6, 1)];
        hopTracks['bonebend:' + sb] = [K(0, 0), K(0.5, 8, 'smooth'), K(0.95, -6, 'smooth'), K(1.3, 3, 'smooth'), K(1.6, 0)];
        hopTracks.y = [K(0, ry, 'hold'), K(0.28, ry, 'easeOut'), K(0.62, ry - 130, 'easeIn'), K(1.1, ry, 'hold'), K(1.6, ry)];
        const idleId = 'ac' + U.uid(), hopId = 'ac' + U.uid();
        rig.actions = { cur: idleId, list: [{ id: idleId, name: 'Idle', dur: 2.4 }, { id: hopId, name: 'Hop', dur: 1.6, tracks: { [rig.id]: hopTracks } }] };
        rig.aseq = [{ id: U.uid(), t: 0, act: idleId, blend: 0 }, { id: U.uid(), t: 1.3, act: hopId, blend: 0.18 }, { id: U.uid(), t: 2.9, act: idleId, blend: 0.25 }, { id: U.uid(), t: 3.8, act: hopId, blend: 0.18 }];
        rigPack = { m, rig, spine, leaf, knob, ctrl, skel };
        return shot('Shot 4: Rig', 11.9, 5.2, kids, { effects: [fx(trBlinds)] });
      })();
      /* bind everything to the rig at a moment when it is at rest */
      after.push([11.9 + 0.001, () => {
        const { m, rig, spine, leaf, knob, ctrl, skel } = rigPack, R = SB.rig;
        [...m.bind, skel].forEach(o => { R.bindTo(o, rig, null, 'deform'); const B = o.bind; if (B) { delete B.inv[leaf.id]; delete B.seg[leaf.id]; if (B.rigOf) delete B.rigOf[leaf.id]; if (B.bbf) delete B.bbf[leaf.id]; } });
        R.bindTo(m.leaf, rig, leaf.id, 'follow');
        SB.controls.addConstraint(knob, 'follow', ctrl);
      }]);

      // =====================================================================  5. DROP  (16.5 - 20.7s)
      SD = 4.2; const S5 = (() => {
        const th = { pill: ORANGE, pillInk: DEEP, title: CREAM, sub: VIOLET };
        const kids = [bg(grad('linear', 160, [[DEEP, 0], [INK, 1]]))];
        const phys = (extra) => Object.assign(SB.physics.DEFAULT(), extra);
        const floor = shape('Floor (surface)', 'rect', 960, 1050, 2200, 100, ORANGE, { phys: phys({ mode: 'static', on: true, colShape: 'box' }) });
        const r1s = shape('Ramp 1 (surface)', 'round', 1290, 430, 720, 34, VIOLET, { radius: 50, rot: 17, phys: phys({ mode: 'static', on: true, colShape: 'box' }) });
        const r2s = shape('Ramp 2 (surface)', 'round', 1520, 730, 640, 34, VIOLET, { radius: 50, rot: -17, phys: phys({ mode: 'static', on: true, colShape: 'box' }) });
        kids.push(floor, r1s, r2s);
        /* things that fall on the beat: Dynamics keyed on at their own moment */
        const drops = [[0.35, 'ellipse', 104, 104, SUN, 1060, 'circle', 40, 90], [0.65, 'round', 120, 120, ORANGE, 1130, 'box', 20, -120], [0.95, 'star', 138, 138, CREAM, 1085, 'auto', 10, 140], [1.25, 'ellipse', 84, 84, BRAND, 1150, 'circle', 50, -60], [1.55, 'triangle', 132, 120, VIOLET, 1100, 'auto', 30, 100], [1.85, 'ellipse', 96, 96, ORANGE, 1070, 'circle', 60, 80], [2.15, 'round', 100, 100, SUN, 1140, 'box', 10, -90]];
        drops.forEach(([t, kind, w, h, col, x, shapeKind, vx, spin], i) => {
          const o = shape('Falling ' + kind + ' ' + (i + 1), kind, x, -70, w, h, col, { phys: phys({ on: false, vx, spin, bounce: 0.6, edges: 'box', colShape: shapeKind, friction: 0.12 }) });
          o.tracks = { 'phys:on': [K(0, false, 'hold'), K(t, true, 'hold')] }; kids.push(o);
        });
        /* a pendulum: a ball hanging from a bone on a rope */
        const ax = 470, ay = 735;
        const hook = mk('rig', Object.assign({ name: 'Pendulum rig', showBones: false }, L(ax, ay))); const hb = { id: U.uid(), name: 'Hook', parent: null, x: 0, y: 0, len: 6, ang: 0, pose: 0 }; hook.bones = [hb];
        const ball = shape('Pendulum ball (hangs from the bone)', 'ellipse', ax + 6 + 135, ay + 135, 104, 104, ORANGE, { stroke: SUN, strokeW: 8, phys: phys({ mode: 'hang', on: true, rig: hook.id, bone: hb.id, weight: 1, edges: 'none', drag: 0.03, ropeColor: VIOLET, colShape: 'circle' }) });
        kids.push(shape('Ceiling bar', 'round', ax, ay - 8, 260, 20, VIOLET, { radius: 50, effects: [fx('slideIn', { dir: 'up', amt: 0.4, dur: 0.5, at: 0.2 })] }), hook, ball, shape('Pivot', 'ellipse', ax + 6, ay, 28, 28, CREAM));
        kids.push(...heading(130, 'PHYSICS  ·  SURFACES  ·  ROPES', 'Drop it.', 'Gravity, bounce,\nswing.', th));
        return shot('Shot 5: Drop', 16.5, 4.2, kids, { effects: [fx(trSplit)] });
      })();

      // =====================================================================  6. THE FOUR WORDS  (20.1 - 23.2s)
      SD = 3.1; const S6 = (() => {
        /* break apart works on single layers, so the last card's layers shatter one by one */
        const BRK = amt => fx('breakOut', { dur: 0.8, amt, dir: 'center' });
        const cards = [['Draw.', CREAM, INK, ORANGE, 'wipeIn', 'left'], ['Rig.', BRAND, CREAM, SUN, 'wipeIn', 'up'], ['Animate.', ORANGE, INK, CREAM, 'wipeIn', 'right'], ['Export.', INK, CREAM, ORANGE, 'wipeIn', 'down']];
        const kids = []; const step = 0.6;
        cards.forEach(([word, bgc, ink, acc, inFx, dir], i) => {
          const t0 = i * step, d = i < 3 ? step + 0.4 : SD - t0, parts = []; /* a card ends once the next one covers it, so the last card breaks apart over the logo */
          const b = shape('Card ' + word, 'rect', 960, 540, 2200, 1300, bgc, { start: t0, dur: d, effects: [fx(inFx, { dir, dur: 0.3 })].concat(i === 3 ? [BRK(0.8)] : []) });
          const w = T('Word ' + word, word, 960, 520, 340, ink, { start: t0, dur: d, effects: [fx('popIn', { at: 0.1, dur: 0.45, amt: 1.2 })].concat(i === 3 ? [BRK(0.7)] : []) });
          const dot = shape('Accent ' + word, 'round', 960, 738, 150, 16, acc, { start: t0, dur: d, radius: 8, effects: [fx('wipeIn', { at: 0.3, dur: 0.35, dir: 'left' })].concat(i === 3 ? [BRK(0.7)] : []) });
          parts.push(b, dot, w); kids.push(...parts);
        });
        kids.push(T('Formats', 'MP4  ·  GIF  ·  Lottie  ·  Unity  ·  Godot  ·  Web', 960, 820, 52, VIOLET, { weight: 500, start: 3 * step + 0.3, dur: SD - 3 * step - 0.3, effects: [fx('slideIn', { dir: 'down', amt: 0.2, dur: 0.5 }), BRK(0.7)] }));
        return shot('Shot 6: Draw. Rig. Animate. Export.', 20.1, 3.1, kids, { effects: [fx(trPop)] });
      })();

      // =====================================================================  7. THE LOGO  (22.1 - 26.7s)
      let logo = null;
      SD = 4.6; const S7 = (() => {
        const mx = 960, my = 340, k = 0.56, gy = my + 470 * k + 22;
        const kids = [bg(grad('radial', 0, [['#FFFBF2', 0], [CREAM, 0.7], ['#FFE6C0', 1]]))];
        const m = mascot(mx, my, k), { rig, spine, leaf } = mascotRig(mx, my, k, 'Logo rig');
        kids.push(shape('Sun', 'ellipse', mx, my + 10, 600, 600, PEACH, { effects: [fx('popIn', { at: 0.8, dur: 0.7, amt: 1.4 }), fx('float', { amt: 0.4, at: 1.5 })] }));
        const sh = shape('Shadow', 'ellipse', mx, gy, 360, 40, '#33204F26'); sh.tracks = { scale: [K(0.3, 0.3, 'easeIn'), K(0.66, 1.0, 'smooth'), K(1.0, 0.8, 'smooth'), K(1.1, 1, 'smooth')], opacity: [K(0.3, 0.3), K(0.66, 1)] };
        const ringO = shape('Landing ring', 'ellipse', mx, gy, 300, 80, ORANGE, { fillOn: false, stroke: ORANGE, strokeW: 10 }); ringO.tracks = { scale: [K(0.64, 0.2, 'easeOut'), K(1.3, 2.6, 'smooth')], opacity: [K(0.64, 0.9, 'smooth'), K(1.3, 0)] };
        kids.push(sh, ringO);
        /* confetti that flies out when it lands */
        const cols = [ORANGE, SUN, BRAND, VIOLET], t0 = 0.66;
        for (let i = 0; i < 16; i++) {
          const a = -Math.PI + (i + 0.5) / 16 * Math.PI, sp = 260 + (i % 4) * 90, dx = Math.cos(a) * sp * 1.3, dy = Math.sin(a) * sp * 0.9, kind = ['ellipse', 'star', 'triangle', 'round'][i % 4], sz = 22 + (i % 3) * 8, y0 = gy - 10;
          const o = shape('Confetti ' + (i + 1), kind, mx, y0, sz, sz, cols[i % 4], { rot: i * 40 });
          o.tracks = { x: [K(t0, X(mx), 'easeOut'), K(1.9, X(mx + dx), 'smooth')], y: [K(t0, Y(y0), 'easeOut'), K(t0 + 0.45, Y(y0 + dy), 'easeIn'), K(1.9, Y(y0 + dy + 320), 'smooth')], scale: [K(t0, 0, 'smooth'), K(t0 + 0.1, 1, 'smooth'), K(1.6, 1, 'smooth'), K(1.9, 0)], rot: [K(t0, i * 40, 'linear'), K(1.9, i * 40 + 360 * (i % 2 ? 1 : -1))] };
          kids.push(o);
        }
        kids.push(...m.stack, rig);
        /* the wordmark */
        const size = 210, w1 = tw('Toonzi', size, 700), w2 = tw('2D', size, 700), gap = size * 0.2, left = 960 - (w1 + gap + w2) / 2, wy = 790;
        kids.push(T('Toonzi', 'Toonzi', left, wy, size, INK, { align: 'left', start: 1.35, dur: SD - 1.35, effects: [fx(trRise, { dur: 0.7 })] }));
        kids.push(T('2D', '2D', left + w1 + gap, wy, size, ORANGE, { align: 'left', start: 1.7, dur: SD - 1.7, effects: [fx('popIn', { dur: 0.55, amt: 1.8 }), fx('jelly', { amt: 0.6, at: 0.8 })] }));
        kids.push(T('Tagline', 'Everyone can animate', 960, 935, 50, BRAND, { weight: 500, start: 2.1, dur: SD - 2.1, effects: [fx('slideIn', { dir: 'down', amt: 0.2, dur: 0.6 })] }));
        kids.push(T('Small print', 'No install.  Nothing uploaded.', 960, 995, 34, '#8A78C4', { weight: 500, start: 2.4, dur: SD - 2.4, effects: [fx('fadeIn', { dur: 0.6 })] }));
        /* twinkles */
        [[mx - 400, my - 160, 54, 2.3], [mx + 420, my - 60, 44, 2.5], [mx + 330, my + 250, 36, 2.7], [mx - 360, my + 210, 40, 2.9]].forEach(([x, y, sz, t], i) => kids.push(shape('Twinkle ' + (i + 1), 'star', x, y, sz, sz, SUN, { sides: 4, start: t, dur: SD - t, effects: [fx('popIn', { dur: 0.4 }), fx('pulse', { amt: 1.6 })] })));
        /* fall, squash, bounce, settle: bones do the squash; the eyes look up, then at you, and blink */
        const sb = spine.id; rig.tracks.y = [K(0.3, rig.y - 760, 'bounce'), K(1.3, rig.y)];
        rig.tracks['bonesx:' + sb] = [K(0.3, 1), K(0.62, 1.1), K(0.7, 0.8, 'easeOut'), K(0.82, 1.05), K(1.0, 1.04), K(1.06, 0.9, 'easeOut'), K(1.18, 1.02), K(1.24, 0.96), K(1.4, 1)];
        rig.tracks['bonesy:' + sb] = [K(0.3, 1), K(0.62, 0.92), K(0.7, 1.2, 'easeOut'), K(0.82, 0.97), K(1.0, 0.98), K(1.06, 1.1, 'easeOut'), K(1.18, 0.99), K(1.24, 1.03), K(1.4, 1)];
        rig.tracks['bonebend:' + sb] = [K(1.4, 0), K(1.9, 4), K(2.6, -4), K(3.3, 4), K(4.0, -4), K(4.6, 0)];
        const lookKeys = (pu, dx, dy) => { pu.tracks = { x: [K(0.3, pu.x), K(0.7, pu.x, 'smooth'), K(1.3, pu.x - 16 * dx), K(1.8, pu.x + 18 * dx), K(2.3, pu.x)], y: [K(0.3, pu.y - 16), K(0.7, pu.y + 14), K(1.3, pu.y + 4), K(1.8, pu.y + 4), K(2.3, pu.y)], opacity: [K(0, 1, 'hold'), K(2.34, 0, 'hold'), K(2.44, 1, 'hold'), K(3.54, 0, 'hold'), K(3.64, 1, 'hold')] }; };
        lookKeys(m.pupL, 1); lookKeys(m.pupR, 1);
        [m.eyeL, m.eyeR].forEach(e => { e.tracks = { h: [K(2.3, e.h), K(2.37, 30, 'smooth'), K(2.46, e.h), K(3.5, e.h), K(3.57, 30, 'smooth'), K(3.66, e.h)] }; });
        logo = { m, rig, spine, leaf };
        return shot('Shot 7: Logo', 22.1, 4.6, kids);
      })();
      after.push([22.1 + 1.5, () => { const { m, rig, leaf } = logo, R = SB.rig; m.bind.forEach(o => { R.bindTo(o, rig, null, 'deform'); const B = o.bind; if (B) { delete B.inv[leaf.id]; delete B.seg[leaf.id]; if (B.rigOf) delete B.rigOf[leaf.id]; if (B.bbf) delete B.bbf[leaf.id]; } }); R.bindTo(m.leaf, rig, leaf.id, 'follow'); }]);

      // =====================================================================  0. WELCOME  (0 - 3.8s)
      SD = W0 + 0.6; const S0 = (() => {
        const mx = 960, my = 395, k = 0.36, E = MASCOT;
        const face = [bodyPath(), leafPath(), { b: 1, subs: [ell(E.eyeL.x, E.eyeL.y, E.eyeL.w, E.eyeL.h, E.eyeL.rot)], c: INK, s: 0, fc: WHITE }, { b: 1, subs: [ell(E.eyeR.x, E.eyeR.y, E.eyeR.w, E.eyeR.h, E.eyeR.rot)], c: INK, s: 0, fc: WHITE }, pupilPath('L'), pupilPath('R')];
        const kids = [bg(grad('radial', 0, [['#7A5CFF', 0], [BRAND, 0.55], ['#3B23B8', 1]])),
          shape('Glow', 'ellipse', mx, my + 10, 520, 520, '#FFFFFF22', { effects: [fx('popIn', { at: 0.1, dur: 0.6, amt: 1.3 }), fx('float', { amt: 0.4, at: 0.8 })] }),
          draw('Toonzi says hi', mx, my, face, { scale: k, effects: [fx('popIn', { at: 0.25, dur: 0.7, amt: 1.6 }), fx('jelly', { amt: 0.5, at: 1.0 }), fx('float', { amt: 0.5, at: 1.6 })] }),
          T('Welcome', 'Welcome to', 960, 700, 64, CREAM, { weight: 500, start: 0.7, dur: SD - 0.7, effects: [fx('slideIn', { dir: 'down', amt: 0.25, dur: 0.5 })] }),
          T('Toonzi', 'Toonzi', 960, 830, 190, WHITE, { start: 0.95, dur: SD - 0.95, effects: [fx('popIn', { dur: 0.55, amt: 1.6 })] }),
          T('Slogan', 'Everyone can animate', 960, 970, 56, SUN, { weight: 600, start: 1.6, dur: SD - 1.6, effects: [fx('fadeIn', { dur: 0.5 })] })];
        [[500, 300, 50, 1.2], [1440, 260, 40, 1.4], [1380, 640, 34, 1.6], [560, 660, 38, 1.8]].forEach(([x, y, sz, t], i) => kids.push(shape('Sparkle ' + (i + 1), 'star', x, y, sz, sz, SUN, { sides: 4, start: t, dur: SD - t, effects: [fx('popIn', { dur: 0.4, amt: 1.8 }), fx('wobble', { amt: 0.5 })] })));
        return shot('Shot 0: Welcome', 0, SD, kids, null, true);
      })();

      // =====================================================================  G. GAMES AND THE WEB  (after Drop it)
      SD = GG + 0.6; const SG = (() => {
        const th = { pill: SUN, pillInk: INK, title: CREAM, sub: VIOLET };
        const kids = [bg(grad('linear', 120, [[DEEP, 0], [INK, 1]])), ...heading(130, 'GAME ENGINES  ·  WEB', 'Play it.', 'Unity and Godot, with rigs.\nInteractive web animations.', th)];
        /* two engine cards */
        [['Unity', 1300, 330, '#FFFFFF', INK, 0.4], ['Godot', 1640, 330, '#478CBF', WHITE, 0.6]].forEach(([name, x, y, fill, ink, t]) => {
          kids.push(shape('Card ' + name, 'round', x, y, 290, 200, fill, { radius: 28, start: t, dur: SD - t, effects: [fx('popIn', { dur: 0.5, amt: 1.4 }), fx('float', { amt: 0.3, at: 0.6 })] }));
          kids.push(T('Card label ' + name, name, x, y + 4, 64, ink, { start: t + 0.1, dur: SD - t - 0.1, effects: [fx('popIn', { dur: 0.45 })] }));
        });
        /* a web page with a button you can click */
        const wx = 1470, wy = 720;
        kids.push(shape('Browser', 'round', wx, wy, 640, 360, CREAM, { radius: 26, start: 0.9, dur: SD - 0.9, effects: [fx('slideIn', { dir: 'up', amt: 0.3, dur: 0.5 })] }));
        kids.push(shape('Browser bar', 'round', wx, wy - 150, 640, 60, '#E8DCC8', { radius: 26, start: 0.9, dur: SD - 0.9, effects: [fx('slideIn', { dir: 'up', amt: 0.3, dur: 0.5 })] }));
        [0, 1, 2].forEach(i => kids.push(shape('Dot ' + (i + 1), 'ellipse', wx - 280 + i * 34, wy - 150, 18, 18, [ORANGE, SUN, VIOLET][i], { start: 0.9, dur: SD - 0.9, effects: [fx('slideIn', { dir: 'up', amt: 0.3, dur: 0.5 })] })));
        const btn = shape('Play button', 'round', wx, wy + 30, 300, 110, ORANGE, { radius: 55, start: 1.2, dur: SD - 1.2, effects: [fx('popIn', { dur: 0.5, amt: 1.5 })] });
        btn.tracks = { scale: [K(1.6, 1), K(1.75, 0.86, 'easeOut'), K(1.95, 1.08), K(2.15, 1)] };
        kids.push(btn, T('Button label', 'Click me', wx, wy + 33, 48, WHITE, { start: 1.3, dur: SD - 1.3, effects: [fx('popIn', { dur: 0.45 })] }));
        const ring = shape('Click ring', 'ellipse', wx, wy + 30, 300, 110, ORANGE, { fillOn: false, stroke: ORANGE, strokeW: 8, start: 1.7, dur: 1 });
        ring.tracks = { scale: [K(0, 1, 'easeOut'), K(0.7, 1.7)], opacity: [K(0, 1), K(0.7, 0)] }; kids.push(ring);
        const cur = shape('Pointer', 'triangle', wx + 260, wy + 200, 46, 60, WHITE, { stroke: INK, strokeW: 4, rot: -20, start: 1.0, dur: SD - 1.0 });
        cur.tracks = { x: [K(0, X(wx + 260), 'smooth'), K(0.65, X(wx + 40))], y: [K(0, Y(wy + 200), 'smooth'), K(0.65, Y(wy + 70))], scale: [K(0.7, 1), K(0.78, 0.8), K(0.9, 1)] }; kids.push(cur);
        kids.push(T('Web caption', 'It reacts: clicks, drags, keys.', wx, wy + 245, 34, VIOLET, { weight: 500, start: 2.2, dur: SD - 2.2, effects: [fx('fadeIn', { dur: 0.4 })] }));
        return shot('Shot G: Games and web', ST(20.1) - GG, SD, kids, { effects: [fx(trSplit)] }, true);
      })();

      S.objects = [S6, S7, SG, S5, S4, S3, S2, S1, S0];
      tree.reindex();
      for (const [t, fn] of after) { SB.time.set(ST(t)); fn(); }
      tree.reindex(); tree.select([]); SB.time.set(1.8); SB.commit(); SB.view.reset();
      SB.toast('A 34 second trailer, built with the app’s own tools. Press Space to play. Double-click a shot in the timeline to open it.');
    },
  };
})(window.SB);
