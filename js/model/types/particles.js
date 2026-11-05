/* Particles: a layer that sends out many small dots, squares, stars or sparks (fire, smoke, snow, confetti, magic…).
   (Settings that other layers also have, like speed, get a pt prefix here: ptSpeed is not the video speed.)
   Nothing is stored per particle: particle n is born at a known time with its own random numbers (from the layer's seed),
   and where it is at any moment is worked out from that. So the timeline scrubs, plays backwards and exports exactly.
   They move in the layer's space, so moving, turning or scaling the layer carries them along (ptSpace 'local', the default);
   ptSpace 'world': each one leaves from where the layer was when it was born and then flies on its own (a trail behind a moving emitter).
     emit 'stream' (rate per second) or 'burst' (count at once, again every `every` s when repeat is on); prewarm: already flowing at the start
     life, lifeVar          seconds each lives; how much that varies (0..1)
     ptSpeed, speedVar, ptDir, ptSpread  px per second; how much it varies; direction (degrees, 0 = right, -90 = up); ± degrees around it
     ptGravity, drag        px/s² pulling down (less than 0: up); air drag (0 = none)
     sizeMin, sizeMax, sizeEnd       random size at birth, from … to; size at the end of life (× the size)
     color, color2, colorMode        'life': color fades to color2 as it ages; 'random': each one picks between the two
     ptSrc, ptPick          ptShape 'pictures': the layer whose frames are the pictures; 'random' or 'life' (in order over each one's life)
     fade, ptGlow, ptShape, spin, area   fade out at the end; add light (bright where they overlap); circle / soft / square / star / spark / ring; turn (deg/s, random ±); born inside a circle this wide
   On the stage, the selected layer shows an arrow: drag its tip to set the direction and the speed (Shift: 15° steps).
   Game engines: js/io/godot.js makes a CPUParticles2D and js/io/unity.js a ParticleSystem with the same settings. */
'use strict';
(function (SB) {
  const U = SB.util, S = SB.state, tree = SB.tree, TR = SB.tracks, X = SB.xf, h = U.h;
  const MAX = 3000, ARROW = 0.4; // the arrow is 0.4 px long per px/s of speed
  const DEF = { emit: 'stream', rate: 40, count: 60, every: 2, repeat: true, prewarm: true, life: 1.6, lifeVar: 0.3, ptSpeed: 260, speedVar: 0.3, ptDir: -90, ptSpread: 25,
    ptGravity: 200, drag: 0, sizeMin: 8, sizeMax: 22, sizeEnd: 0.2, color: '#FFB020', color2: '#FF4F8B', colorMode: 'life', fade: true, ptGlow: false, ptShape: 'circle', spin: 0, area: 0, seed: 1, ptSrc: '', ptPick: 'random', ptSpace: 'local' };
  const PRESETS = {
    fire: { label: 'Fire', v: { emit: 'stream', rate: 90, life: 1, lifeVar: 0.4, ptSpeed: 230, speedVar: 0.4, ptDir: -90, ptSpread: 12, ptGravity: -120, drag: 0.9, sizeMin: 50, sizeMax: 90, sizeEnd: 0.15, color: '#FFD23F', color2: '#FF3D1F', colorMode: 'life', fade: true, ptGlow: true, ptShape: 'soft', spin: 0, area: 40 } },
    smoke: { label: 'Smoke', v: { emit: 'stream', rate: 22, life: 3.4, lifeVar: 0.3, ptSpeed: 80, speedVar: 0.4, ptDir: -90, ptSpread: 16, ptGravity: -25, drag: 0.4, sizeMin: 60, sizeMax: 110, sizeEnd: 2.4, color: '#77737F', color2: '#C9C5D2', colorMode: 'life', fade: true, ptGlow: false, ptShape: 'soft', spin: 0, area: 20 } },
    snow: { label: 'Snow', v: { emit: 'stream', rate: 30, life: 7, lifeVar: 0.2, ptSpeed: 60, speedVar: 0.5, ptDir: 90, ptSpread: 20, ptGravity: 8, drag: 0, sizeMin: 5, sizeMax: 14, sizeEnd: 1, color: '#FFFFFF', color2: '#DDE8FF', colorMode: 'random', fade: true, ptGlow: false, ptShape: 'circle', spin: 0, area: 900 } },
    rain: { label: 'Rain', v: { emit: 'stream', rate: 90, life: 1.2, lifeVar: 0.1, ptSpeed: 900, speedVar: 0.15, ptDir: 100, ptSpread: 2, ptGravity: 400, drag: 0, sizeMin: 3, sizeMax: 5, sizeEnd: 1, color: '#9CC8FF', color2: '#6FA8F0', colorMode: 'random', fade: false, ptGlow: false, ptShape: 'spark', spin: 0, area: 1000 } },
    confetti: { label: 'Confetti', v: { emit: 'burst', count: 140, every: 3, repeat: true, life: 2.8, lifeVar: 0.3, ptSpeed: 700, speedVar: 0.45, ptDir: -90, ptSpread: 50, ptGravity: 900, drag: 1.4, sizeMin: 10, sizeMax: 20, sizeEnd: 1, color: '#FF4F8B', color2: '#3EC6A8', colorMode: 'random', fade: true, ptGlow: false, ptShape: 'square', spin: 360, area: 10 } },
    sparkles: { label: 'Sparkles', v: { emit: 'stream', rate: 26, life: 1.1, lifeVar: 0.4, ptSpeed: 60, speedVar: 0.6, ptDir: -90, ptSpread: 180, ptGravity: 0, drag: 1, sizeMin: 10, sizeMax: 26, sizeEnd: 0, color: '#FFF3B0', color2: '#FFD84D', colorMode: 'random', fade: true, ptGlow: true, ptShape: 'star', spin: 90, area: 120 } },
    bubbles: { label: 'Bubbles', v: { emit: 'stream', rate: 8, life: 4, lifeVar: 0.3, ptSpeed: 90, speedVar: 0.4, ptDir: -90, ptSpread: 12, ptGravity: -10, drag: 0.2, sizeMin: 12, sizeMax: 34, sizeEnd: 1.2, color: '#BDEBFF', color2: '#FFFFFF', colorMode: 'random', fade: true, ptGlow: false, ptShape: 'ring', spin: 0, area: 60 } },
    magic: { label: 'Magic trail', v: { emit: 'stream', rate: 60, life: 1.2, lifeVar: 0.5, ptSpeed: 40, speedVar: 0.8, ptDir: 90, ptSpread: 180, ptGravity: 60, drag: 0.5, sizeMin: 4, sizeMax: 12, sizeEnd: 0, color: '#B794FF', color2: '#5BE7FF', colorMode: 'life', fade: true, ptGlow: true, ptShape: 'star', spin: 180, area: 10 } },
  };
  const val = (v, k) => v[k] ?? DEF[k];
  /** Random number in [0, 1) for particle n, slot k (the same every time). */
  const rnd = (seed, n, k) => { const s = Math.sin(n * 12.9898 + k * 78.233 + seed * 37.719) * 43758.5453; return s - Math.floor(s); };

  /** The particles alive at the layer's time lt: [{ x, y, size, rot, color, a, vx, vy }]. */
  function alive(v, lt, o) {
    const seed = val(v, 'seed'), life = Math.max(0.05, val(v, 'life')), lv = U.clamp(val(v, 'lifeVar'), 0, 0.95), out = [];
    const at = (k, tb) => (o && o.tracks[k] && o.tracks[k].length > 1) ? TR.value(o, k, tb) : val(v, k); // keyed settings count from each particle's birth
    const world = o && o.id && val(v, 'ptSpace') === 'world' && tree.find(o.id) === o ? worldFrom(o, lt) : null;
    const born = []; // [n, birth time]
    if (val(v, 'emit') === 'burst') {
      const cnt = Math.min(MAX, Math.max(1, Math.round(val(v, 'count')))), ev = Math.max(0.1, val(v, 'every')), rep = val(v, 'repeat') !== false;
      const w1 = rep ? Math.floor(lt / ev) : 0, w0 = rep ? Math.max(0, Math.floor((lt - life) / ev)) : 0;
      for (let w = w0; w <= w1; w++) for (let i = 0; i < cnt; i++) { const n = w * cnt + i; born.push([n, w * ev + rnd(seed, n, 9) * 0.06]); }
    } else {
      const rate = Math.max(0.1, val(v, 'rate')), pre = val(v, 'prewarm') !== false ? life : 0, t = lt + pre;
      const n1 = Math.floor(t * rate), n0 = Math.max(0, Math.floor((t - life) * rate)); for (let n = Math.max(n0, n1 - MAX); n <= n1; n++) born.push([n, n / rate - pre]);
    }
    for (const [n, tb] of born) {
      const L = life * (1 - lv * rnd(seed, n, 1)), age = lt - tb; if (age < 0 || age >= L) continue;
      const sp = at('ptSpeed', tb) * (1 + U.clamp(val(v, 'speedVar'), 0, 1) * (2 * rnd(seed, n, 2) - 1)), ang = (at('ptDir', tb) + at('ptSpread', tb) * (2 * rnd(seed, n, 3) - 1)) * Math.PI / 180;
      const vx = Math.cos(ang) * sp, vy = Math.sin(ang) * sp, g = at('ptGravity', tb), k = Math.max(0, val(v, 'drag'));
      const ar = val(v, 'area') / 2 * Math.sqrt(rnd(seed, n, 4)), aa = rnd(seed, n, 5) * Math.PI * 2, x0 = Math.cos(aa) * ar, y0 = Math.sin(aa) * ar;
      let x, y, cvx, cvy, gy, gvy; // air drag k: speed falls off as e^(−k·age); gravity keeps pulling
      if (k > 1e-4) { const e = Math.exp(-k * age), f = (1 - e) / k; x = x0 + vx * f; y = y0 + vy * f; gy = g / k * (age - f); cvx = vx * e; cvy = vy * e; gvy = g / k * (1 - e); }
      else { x = x0 + vx * age; y = y0 + vy * age; gy = 0.5 * g * age * age; cvx = vx; cvy = vy; gvy = g * age; }
      let sk = 1, dr = 0;
      if (world) { // from where the layer was at its birth, in the layer's space now; gravity pulls down the stage
        const B = world(tb), q = B.R.transformPoint(U.pt(x, y)); x = q.x + B.gx * gy; y = q.y + B.gy * gy; const vx2 = B.R.a * cvx + B.R.c * cvy, vy2 = B.R.b * cvx + B.R.d * cvy; cvx = vx2 + B.gx * gvy; cvy = vy2 + B.gy * gvy; sk = B.k; dr = B.dr;
      } else { y += gy; cvy += gvy; }
      const u = age / L, s0 = at('sizeMin', tb) + (at('sizeMax', tb) - at('sizeMin', tb)) * rnd(seed, n, 6), size = Math.max(0, s0 * sk * U.lerp(1, val(v, 'sizeEnd'), u));
      const col = val(v, 'colorMode') === 'random' ? U.lerpColor(at('color', tb), at('color2', tb), rnd(seed, n, 7)) : U.lerpColor(at('color', tb), at('color2', tb), u);
      const a = (val(v, 'fade') !== false ? U.clamp((1 - u) / 0.4, 0, 1) : 1) * Math.min(1, age / 0.06), rot = rnd(seed, n, 8) * 360 + dr + val(v, 'spin') * (2 * rnd(seed, n, 10) - 1) * age;
      out.push({ x, y, size, rot, color: col, a, vx: cvx, vy: cvy, n, u });
      if (out.length >= MAX) break;
    }
    return out;
  }
  /** ptSpace 'world': for a birth time tb, how the layer was then, in its space now: { R: matrix, gx, gy: stage down
      in it (× the scale then), k: size factor, dr: turn }. Kept per 1/120 s while drawing one frame. */
  function worldFrom(o, lt) {
    const N = X.worldAt(o, tree.mainAt(o, lt)), Ni = N.inverse(), sn = Math.sqrt(Math.abs(N.a * N.d - N.b * N.c)) || 1, an = Math.atan2(N.b, N.a), memo = new Map();
    return tb => {
      const key = Math.round(tb * 120); let e = memo.get(key); if (e) return e;
      const Bm = X.worldAt(o, tree.mainAt(o, key / 120)), sb = Math.sqrt(Math.abs(Bm.a * Bm.d - Bm.b * Bm.c)) || 1, R = Ni.multiply(Bm);
      e = { R, gx: Ni.c * sb, gy: Ni.d * sb, k: sb / sn, dr: (Math.atan2(Bm.b, Bm.a) - an) * 180 / Math.PI }; memo.set(key, e); return e;
    };
  }
  function star(c, r) { for (let i = 0; i < 10; i++) { const rr = i % 2 ? r * 0.45 : r, a = -Math.PI / 2 + i * Math.PI / 5; i ? c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : c.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); } c.closePath(); }
  function draw(c, v, fr, st, opt, lt) {
    const list = alive(v, lt ?? 0, tree.find(v.id) || v), shp = val(v, 'ptShape'), a0 = c.globalAlpha, pics = shp === 'pictures' ? pictures(v.ptSrc) : null, inOrder = v.ptPick === 'life', seed = val(v, 'seed');
    if (shp === 'pictures' && !pics.length) return;
    if (val(v, 'ptGlow')) c.globalCompositeOperation = 'lighter';
    const base = c.getTransform();
    for (const p of list) {
      if (p.size <= 0.05 || p.a <= 0.003) continue; c.globalAlpha = a0 * p.a; c.fillStyle = p.color; const r = p.size / 2;
      if (pics) { // pictures from a layer: one picked at random, or each one plays them in order over its life
        const k = inOrder ? Math.min(pics.length - 1, Math.floor(p.u * pics.length)) : Math.floor(rnd(seed, p.n, 11) * pics.length), q = pics[k], m = Math.max(q.w, q.h) || 1, sw = p.size * q.w / m, sh = p.size * q.h / m;
        c.setTransform(base.translate(p.x, p.y).rotate(val(v, 'spin') > 0 ? p.rot : 0)); c.drawImage(q.cv, -sw / 2, -sh / 2, sw, sh); c.setTransform(base); continue; }
      if (shp === 'spark') { const sp = Math.hypot(p.vx, p.vy) || 1, L = Math.max(p.size * 2, Math.min(80, sp * 0.04)); c.strokeStyle = p.color; c.lineWidth = Math.max(1, p.size * 0.5); c.lineCap = 'round'; c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x - p.vx / sp * L, p.y - p.vy / sp * L); c.stroke(); continue; }
      if (shp === 'circle') { c.beginPath(); c.arc(p.x, p.y, r, 0, Math.PI * 2); c.fill(); continue; }
      if (shp === 'soft') { const g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, r); g.addColorStop(0, p.color); g.addColorStop(1, p.color + '00'); c.fillStyle = g; c.beginPath(); c.arc(p.x, p.y, r, 0, Math.PI * 2); c.fill(); continue; } // a soft glow, see-through at its edge
      if (shp === 'ring') { c.strokeStyle = p.color; c.lineWidth = Math.max(1, r * 0.22); c.beginPath(); c.arc(p.x, p.y, r, 0, Math.PI * 2); c.stroke(); continue; }
      c.setTransform(base.translate(p.x, p.y).rotate(p.rot)); c.beginPath(); if (shp === 'star') star(c, r); else c.rect(-r, -r, r * 2, r * 2); c.fill(); c.setTransform(base);
    }
    c.globalAlpha = a0; c.globalCompositeOperation = 'source-over';
  }

  /** The pictures for 'Pictures from a layer': every frame of that layer (a drawing, pixel art, an image, a shape…), drawn once and kept until the next change. */
  let rev = 0; const picCache = new Map(); if (SB.on) SB.on('commit', () => { rev++; });
  function pictures(id) {
    const src = id && tree.find(id); if (!src || src.type === 'particles') return [];
    const c0 = picCache.get(id); if (c0 && c0.rev === rev && c0.src === src) return c0.list;
    const def = SB.types.get(src.type), n = Math.max(1, (src.frames || []).length), list = [];
    for (let f = 0; f < n; f++) {
      const b = SB.scene.bounds(src, 0, f); if (!b) continue; const w = b.x1 - b.x0, hh = b.y1 - b.y0, k = Math.min(2, 256 / Math.max(w, hh, 1)), cv = h('canvas', { width: Math.max(1, Math.ceil(w * k)), height: Math.max(1, Math.ceil(hh * k)) }), x = cv.getContext('2d');
      x.setTransform(k, 0, 0, k, -b.x0 * k, -b.y0 * k); const fr = (src.frames || [])[f] || { strokes: [] };
      try { if (def.draw) def.draw.call(def, x, src, fr, SB.fx.state(src, 0, TR.transform(src, 0), { noFx: true }), {}, 0); SB.strokes.draw(x, fr.strokes || [], {}); } catch (e) { continue; }
      list.push({ cv, w, h: hh });
    }
    picCache.set(id, { rev, src, list }); return list;
  }
  const F = (k, label, type, more) => Object.assign({ k, label, type }, more);
  SB.types.add({
    id: 'particles', label: 'Particles', icon: 'particles', color: '--c-shape', visual: true, frames: false, fx: true,
    defaults: () => Object.assign({}, DEF, { seed: 1 + Math.floor(Math.random() * 9999) }),
    bounds(o) { const r = Math.max(30, val(o, 'area') / 2 + 10); return { x0: -r, y0: -r, x1: r, y1: r }; }, // the emitter, not the particles (they fly far)
    draw, alive,
    props: () => [['rate', 'Particles per second'], ['ptSpeed', 'Speed'], ['ptDir', 'Direction'], ['ptSpread', 'Spread'], ['ptGravity', 'Gravity'], ['sizeMin', 'Smallest size'], ['sizeMax', 'Biggest size'], ['color', 'Color'], ['color2', 'Second color']],
    sections: o => {
      const burst = val(o, 'emit') === 'burst';
      return [
        { title: 'Particles', fields: [
          { k: '_preset', label: 'Start from', type: 'select', options: [['', 'Pick a look…'], ...Object.entries(PRESETS).map(([k, p]) => [k, p.label])], get: () => '', set: (t, k) => { if (PRESETS[k]) { Object.assign(t, PRESETS[k].v); if (t === o) SB.toast(PRESETS[k].label + ': change anything below.'); } }, rerender: true },
          F('emit', 'Send out', 'seg', { options: [['stream', 'A stream', 'A steady flow'], ['burst', 'Bursts', 'Many at once']] }),
          burst ? F('count', 'How many', 'num', { min: 1, max: MAX, step: 1 }) : F('rate', 'Per second', 'num', { min: 0.1, max: 800, step: 1 }),
          burst ? F('repeat', '', 'check', { text: 'Again and again', rerender: true }) : F('prewarm', '', 'check', { text: 'Already flowing at the start' }),
          burst && val(o, 'repeat') !== false ? F('every', 'Every (s)', 'num', { min: 0.1, max: 60, step: 0.1 }) : null,
          F('life', 'Life (s)', 'num', { min: 0.05, max: 30, step: 0.1 }), F('lifeVar', 'Life varies', 'range', { min: 0, max: 0.95, step: 0.05 }),
          F('area', 'Born inside', 'num', { min: 0, max: 4000, step: 1, title: 'Width of the circle they start in (0: one point)' }),
        ] },
        { title: 'Motion', fields: [
          { type: 'note', text: 'Drag the arrow on the stage to aim them: its direction, and its length for the speed.' },
          F('ptSpeed', 'Speed', 'num', { min: 0, max: 5000, step: 1, anim: true }), F('speedVar', 'Speed varies', 'range', { min: 0, max: 1, step: 0.05 }),
          F('ptDir', 'Direction °', 'num', { min: -360, max: 360, step: 1, anim: true }), F('ptSpread', 'Spread ±°', 'range', { min: 0, max: 180, step: 1, anim: true }),
          F('ptGravity', 'Gravity', 'num', { min: -3000, max: 3000, step: 10, anim: true }), F('drag', 'Air drag', 'range', { min: 0, max: 5, step: 0.1 }),
          F('spin', 'Spin °/s', 'num', { min: 0, max: 2000, step: 10 }),
          F('ptSpace', 'When it moves', 'seg', { options: [['local', 'Carry them', 'Moving, turning or scaling the layer carries the particles along (local position)'], ['world', 'Leave a trail', 'Each particle leaves from where the layer was and flies on by itself (global position): a moving emitter leaves a trail']] }),
        ] },
        { title: 'Look', fields: [
          F('ptShape', 'Shape', 'select', { options: [['circle', 'Dots'], ['soft', 'Soft dots (fire, smoke)'], ['square', 'Squares'], ['star', 'Stars'], ['spark', 'Sparks (streaks)'], ['ring', 'Rings (bubbles)'], ['pictures', 'Pictures from a layer (your own)']], rerender: true }),
          val(o, 'ptShape') === 'pictures' ? { k: 'ptSrc', label: 'Pictures from', type: 'select', options: () => [['', 'Pick a layer…'], ...tree.all().filter(x => x.id !== o.id && x.type !== 'particles' && x.type !== 'group' && SB.types.get(x.type).visual && SB.types.get(x.type).render !== false).map(x => [x.id, `${x.name}${x.frames && x.frames.length > 1 ? ` (${x.frames.length} frames)` : ''}`])], set: (t, id) => { t.ptSrc = id; const s = tree.find(id); if (s && !s.hidden) { s.hidden = true; SB.toast(`${s.name} is hidden now, so only the particles show it. Its frames are the pictures.`); } }, rerender: true } : null,
          val(o, 'ptShape') === 'pictures' ? F('ptPick', 'Pictures', 'seg', { options: [['random', 'Random', 'Each particle picks one of the pictures'], ['life', 'In order', 'Each particle plays the pictures one after another over its life']] }) : null,
          val(o, 'ptShape') === 'pictures' ? { type: 'note', text: 'Every frame of that layer is one picture: draw your own particle there (a leaf, a heart, a coin…), or several frames for random ones. Colors don\'t tint pictures; fade, size and spin still work.' } : null,
          F('sizeMin', 'Size from', 'num', { min: 0, max: 1000, step: 1, anim: true }), F('sizeMax', 'Size to', 'num', { min: 0, max: 1000, step: 1, anim: true }),
          F('sizeEnd', 'Size at the end ×', 'range', { min: 0, max: 4, step: 0.05 }),
          F('color', 'Color', 'color', { anim: true }), F('color2', 'Second color', 'color', { anim: true }),
          F('colorMode', 'Colors', 'seg', { options: [['life', 'First → second', 'Each one changes color as it ages'], ['random', 'Random mix', 'Each one gets its own color between the two']] }),
          F('fade', '', 'check', { text: 'Fade out at the end' }), F('ptGlow', '', 'check', { text: 'Glow (adds light where they overlap)' }),
          F('seed', 'Random seed', 'num', { min: 1, max: 99999, step: 1, title: 'Another number gives another random pattern' }),
        ] },
      ];
    },
  });
  /** The settings at the layer's time lt (keyed ones at their value then), for the game engine exports. */
  const settings = (o, lt = 0) => { const v = Object.assign({}, DEF); for (const k in DEF) if (o[k] != null) v[k] = o[k]; for (const k of ['ptSpeed', 'ptDir', 'ptSpread', 'ptGravity', 'sizeMin', 'sizeMax', 'color', 'color2', 'rate']) if (o.tracks && o.tracks[k] && o.tracks[k].length) v[k] = TR.value(o, k, lt); return v; };
  const keyed = o => ['ptSpeed', 'ptDir', 'ptSpread', 'ptGravity', 'sizeMin', 'sizeMax', 'color', 'color2'].some(k => o.tracks && o.tracks[k] && o.tracks[k].length > 1);
  /** One white particle of this shape on a size × size canvas (the engines tint it). */
  function picture(shape, size = 64) {
    const cv = h('canvas', { width: size, height: shape === 'spark' ? size * 4 : size }), c = cv.getContext('2d'), r = size / 2; c.fillStyle = '#fff'; c.strokeStyle = '#fff';
    if (shape === 'spark') { const g = c.createLinearGradient(0, 0, 0, cv.height); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.7, '#fff'); g.addColorStop(1, '#fff'); c.fillStyle = g; c.beginPath(); c.roundRect(r * 0.55, 0, r * 0.9, cv.height, r * 0.45); c.fill(); return cv; }
    c.translate(r, r);
    if (shape === 'soft') { const g = c.createRadialGradient(0, 0, 0, 0, 0, r); g.addColorStop(0, '#fff'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(-r, -r, size, size); }
    else if (shape === 'square') c.fillRect(-r * 0.98, -r * 0.98, r * 1.96, r * 1.96);
    else if (shape === 'star') { c.beginPath(); star(c, r * 0.98); c.fill(); }
    else if (shape === 'ring') { c.lineWidth = r * 0.22; c.beginPath(); c.arc(0, 0, r * 0.88, 0, Math.PI * 2); c.stroke(); }
    else { c.beginPath(); c.arc(0, 0, r * 0.98, 0, Math.PI * 2); c.fill(); }
    return cv;
  }
  /** The pictures side by side on one strip (cells of size × size, each fitted in): for the engines' frame-by-frame particles. */
  function strip(id, size = 128) {
    const list = pictures(id); if (!list.length) return null; const cv = h('canvas', { width: size * list.length, height: size }), c = cv.getContext('2d');
    list.forEach((q, i) => { const m = Math.max(q.w, q.h) || 1, w = size * q.w / m, hh = size * q.h / m; c.drawImage(q.cv, i * size + (size - w) / 2, (size - hh) / 2, w, hh); });
    return { cv, n: list.length, size };
  }
  SB.particles = { DEF, PRESETS, alive, val, ARROW, settings, keyed, picture, pictures, strip };

  // ---------- on the stage: the emitter and its arrow
  const sel = () => { const o = tree.sel(); return o && o.type === 'particles' && tree.inRange(o) && !tree.hidden(o) && !S.playing ? o : null; };
  /** The arrow's ends on the stage (local origin → speed along the direction, in the layer's space). */
  function arrow(o) {
    const lt = tree.localTime(o), M = X.world(o), sp = TR.value(o, 'ptSpeed', lt) ?? val(o, 'ptSpeed'), d = (TR.value(o, 'ptDir', lt) ?? val(o, 'ptDir')) * Math.PI / 180, L = Math.max(20, sp * ARROW);
    const a = M.transformPoint(U.pt(0, 0)), b = M.transformPoint(U.pt(Math.cos(d) * L, Math.sin(d) * L)); return { M, a, b, d, L, ptSpread: (TR.value(o, 'ptSpread', lt) ?? val(o, 'ptSpread')) * Math.PI / 180 };
  }
  SB.overlays.extra.push(O => {
    const o = sel(); if (!o) return; const c = O.c, dp = O.dpr, A = arrow(o), [ax, ay] = O.P(A.a.x, A.a.y), [bx, by] = O.P(A.b.x, A.b.y);
    c.save(); c.lineCap = 'round';
    for (const s of [-1, 1]) { const e = A.M.transformPoint(U.pt(Math.cos(A.d + s * A.spread) * A.L * 0.8, Math.sin(A.d + s * A.spread) * A.L * 0.8)), [ex, ey] = O.P(e.x, e.y); c.strokeStyle = 'rgba(255,138,61,.55)'; c.setLineDash([4 * dp, 4 * dp]); c.lineWidth = 1.5 * dp; c.beginPath(); c.moveTo(ax, ay); c.lineTo(ex, ey); c.stroke(); }
    c.setLineDash([]); const ang = Math.atan2(by - ay, bx - ax), hs = 12 * dp;
    for (const [col, w] of [['#fff', 6], ['#FF8A3D', 3]]) { c.strokeStyle = col; c.lineWidth = w * dp; c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, by); c.moveTo(bx - Math.cos(ang - 0.45) * hs, by - Math.sin(ang - 0.45) * hs); c.lineTo(bx, by); c.lineTo(bx - Math.cos(ang + 0.45) * hs, by - Math.sin(ang + 0.45) * hs); c.stroke(); }
    c.fillStyle = '#fff'; c.strokeStyle = '#FF8A3D'; c.lineWidth = 2 * dp; c.beginPath(); c.arc(bx, by, 7 * dp, 0, Math.PI * 2); c.fill(); c.stroke();
    c.beginPath(); c.arc(ax, ay, 5 * dp, 0, Math.PI * 2); c.fill(); c.stroke(); c.restore();
  });
  if (SB.select) SB.select.pre.push((P, e) => {
    const o = sel(); if (!o || tree.locked(o)) return false; const A = arrow(o), k = SB.view.k(), tol = (e.pointerType === 'touch' ? 20 : 12) / k;
    if (Math.hypot(P.x - A.b.x, P.y - A.b.y) > tol) return false;
    const Minv = A.M.inverse(), d = SB.tool.drag = { kind: 'ptcArrow', moved: false,
      move(P2, e2) { const l = Minv.transformPoint(U.pt(P2.x, P2.y)); let deg = Math.atan2(l.y, l.x) * 180 / Math.PI; if (e2.shiftKey) deg = Math.round(deg / 15) * 15;
        TR.setMany(o, { ptDir: U.r1(deg), ptSpeed: Math.round(Math.max(0, Math.hypot(l.x, l.y) / ARROW)) }); d.moved = true; SB.bump(); SB.invalidate('inspector'); },
      up() { if (d.moved) SB.commit(); }, cancel() { if (d.moved) SB.revert(); } };
    return true;
  });
  const hover0 = SB.tools.get('select').hover; // the arrow's tip: a grab cursor
  SB.tools.get('select').hover = function (P, e) { const o = sel(); if (o) { const A = arrow(o); if (Math.hypot(P.x - A.b.x, P.y - A.b.y) < 12 / SB.view.k()) { U.$('#stage').style.cursor = 'grab'; return; } } return hover0.call(this, P, e); };

  // ---------- adding one
  SB.add = SB.add || {};
  SB.add.particles = (preset = 'sparkles') => {
    const p = S.project, o = tree.make('particles', Object.assign({ name: PRESETS[preset] ? PRESETS[preset].label : 'Particles', x: Math.round(p.w / 2), y: Math.round(p.h * 0.62), start: 0, dur: p.duration }, PRESETS[preset] ? PRESETS[preset].v : {}));
    tree.add(o); SB.tool.set('select'); tree.select([o.id]); SB.commit(); return o;
  };
  SB.add.particlesMenu = btn => SB.popover(btn, h('div.pop-list', null, Object.entries(PRESETS).map(([k, p]) => h('button', { type: 'button', html: SB.icon('particles') + p.label, onclick: () => { SB.popover.close(); SB.add.particles(k); } })),
    h('p.hint', { style: { gridColumn: '1 / -1', textAlign: 'center' } }, 'Then change anything in the panel, and drag the arrow to aim them.')), { side: SB.layout && SB.layout.current === 'phone' ? 'top' : 'right' });
})(window.SB);
