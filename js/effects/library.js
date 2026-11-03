/* The effect library. Each effect is one SB.effect({...}) call, see engine.js for the fields.
   Add your own by copying one of these. It shows up in menus, the inspector and the timeline. */
'use strict';
(function (SB) {
  const U = SB.util, fx = SB.effect;
  const cubicOut = u => 1 - Math.pow(1 - u, 3), smooth = u => u * u * (3 - 2 * u);
  const backOut = (u, c1) => { const c3 = c1 + 1; return 1 + c3 * Math.pow(u - 1, 3) + c1 * Math.pow(u - 1, 2); };
  const dirv = d => ({ left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] }[d] || [-1, 0]);
  const textLen = o => (o.text || '').length + 1;

  // ---------- animated loops
  fx({ id: 'shake', label: 'Shake', cat: 'loop', params: ['amt', 'speed'], apply(r, x) { const t = x.T * 14; r.x += U.noise(t, x.seed) * 10 * x.amt; r.y += U.noise(t, x.seed + 9) * 10 * x.amt; r.rot += U.noise(t, x.seed + 3) * 1.5 * x.amt; } });
  fx({ id: 'boil', label: 'Hand-drawn boil', cat: 'loop', params: ['amt', 'speed'], apply(r, x) { const step = Math.floor(x.T * 8), a = x.amt; r.boil = { amp: 3 * a, step, seed: x.seed }; r.x += U.hash(step * 3.1 + x.seed) * a * 0.9; r.y += U.hash(step * 5.7 + x.seed) * a * 0.9; r.rot += U.hash(step * 1.3 + x.seed) * a * 0.35; } });
  fx({ id: 'wave', label: 'Wave', cat: 'loop', params: ['amt', 'speed'], apply(r, x) { r.wave = { amp: 16 * x.amt, T: x.T }; } });
  fx({ id: 'wobble', label: 'Wobble', cat: 'loop', params: ['amt', 'speed'], apply(r, x) { r.rot += Math.sin(x.T * 6) * 7 * x.amt; } });
  fx({ id: 'float', label: 'Float', cat: 'loop', params: ['amt', 'speed'], apply(r, x) { r.y += Math.sin(x.T * 2.6) * 16 * x.amt; } });
  fx({ id: 'pulse', label: 'Pulse', cat: 'loop', params: ['amt', 'speed'], apply(r, x) { const k = 1 + Math.sin(x.T * 5) * 0.07 * x.amt; r.sx *= k; r.sy *= k; } });
  fx({ id: 'jelly', label: 'Jelly', cat: 'loop', params: ['amt', 'speed'], apply(r, x) { const k = Math.sin(x.T * 9) * 0.08 * x.amt; r.sx *= 1 + k; r.sy *= 1 - k; } });
  fx({ id: 'spin', label: 'Spin', cat: 'loop', params: ['speed'], apply(r, x) { r.rot += x.T * 90; } });
  fx({ id: 'swing', label: 'Swing', cat: 'loop', params: ['amt', 'speed'], apply(r, x) { r.rot += Math.sin(x.T * 3) * 18 * x.amt; } });
  fx({ id: 'blink', label: 'Blink', cat: 'loop', params: ['speed'], apply(r, x) { if (Math.sin(x.T * 9) < -0.3) r.opacity *= 0.12; } });
  fx({ id: 'rainbow', label: 'Rainbow', cat: 'loop', params: ['speed'], apply(r, x) { r.filters.push(`hue-rotate(${((x.T * 140) % 360).toFixed(1)}deg)`); } });
  fx({ id: 'dashFlow', label: 'Marching dashes', cat: 'loop', params: ['amt', 'speed'], apply(r, x) { r.dash = { T: x.T, amt: x.amt }; } });
  fx({ id: 'drawLoop', label: 'Draw loop', cat: 'loop', params: ['speed'], apply(r, x) { const ph = (x.T * 0.4) % 2, u = ph < 1 ? ph : 1; r.prog = Math.min(r.prog, u); if (x.o.type === 'text') r.chars = Math.min(r.chars, Math.floor(u * textLen(x.o))); } });

  // ---------- looks (always on)
  fx({ id: 'glow', label: 'Glow', cat: 'static', params: { amt: Object.assign({}, SB.FX_PARAMS.amt), color: { label: 'Color', type: 'color', def: '#FFD84D' } },
    init(e, o) { const c = o.type === 'text' ? o.color : o.type === 'shape' ? (o.fillOn ? o.fill : o.stroke) : null; if (/^#[0-9a-f]{6}$/i.test(c || '')) e.color = c; }, // starts in the layer's own color
    apply(r, x) { r.glow = 26 * x.amt; if (x.e.color) r.glowColor = x.e.color; } });
  fx({ id: 'blur', label: 'Blur', cat: 'static', params: ['amt'], apply(r, x) { r.filters.push(`blur(${(5 * x.amt * x.sc).toFixed(2)}px)`); } });
  // a blur along one direction (motion blur): the layer smeared along the angle, length in px
  fx({ id: 'dirBlur', label: 'Directional blur', cat: 'static', params: { len: { label: 'Length', min: 0, max: 200, step: 1, def: 24 }, angle: { label: 'Direction (°)', min: -180, max: 180, step: 1, def: 0 } },
    apply(r, x) { const L = P(x, 'len'); if (L > 0) r.dblur = { len: L, angle: P(x, 'angle') }; } });
  fx({ id: 'grayscale', label: 'Black & white', cat: 'static', params: [], apply(r) { r.filters.push('grayscale(1)'); } });
  // ---------- layer styles (like Photoshop / After Effects): drawn around or inside the layer, each with a blend mode
  const BLEND = { normal: 'Normal', multiply: 'Multiply', screen: 'Screen', overlay: 'Overlay', add: 'Add', darken: 'Darken', lighten: 'Lighten', 'soft-light': 'Soft light', 'hard-light': 'Hard light', difference: 'Difference', 'color-dodge': 'Color dodge', 'color-burn': 'Color burn', exclusion: 'Exclusion', hue: 'Hue', saturation: 'Saturation', color: 'Color', luminosity: 'Luminosity' };
  SB.BLEND_MODES = BLEND;
  const P = (x, k) => x.e[k] ?? SB.effects.get(x.e.type).params[k].def; // older files may miss newer settings
  const color = def => ({ label: 'Color', type: 'color', def }), opac = def => ({ label: 'Opacity %', min: 0, max: 100, step: 1, def }), blend = def => ({ label: 'Blend', options: BLEND, def });
  const offset = (x, dist) => { const a = P(x, 'angle') * Math.PI / 180; return [Math.cos(a) * dist, Math.sin(a) * dist]; };
  fx({ id: 'shadow', label: 'Drop shadow', cat: 'static', params: { color: color('#14122A'), opacity: opac(35), angle: { label: 'Angle', min: -180, max: 180, step: 1, def: 45 }, distance: { label: 'Distance', min: 0, max: 200, step: 1, def: 12 }, size: { label: 'Size', min: 0, max: 80, step: 1, def: 0 }, blur: { label: 'Blur', min: 0, max: 100, step: 1, def: 16 }, blend: blend('multiply') },
    apply(r, x) { const [dx, dy] = offset(x, x.e.distance ?? (x.e.amt != null ? 11 * x.e.amt : P(x, 'distance'))); r.styles.push({ kind: 'drop', color: P(x, 'color'), alpha: P(x, 'opacity') / 100, dx, dy, size: P(x, 'size'), blur: P(x, 'blur'), blend: P(x, 'blend') }); } });
  fx({ id: 'outline', label: 'Outline', cat: 'static', params: { color: color('#FFFFFF'), size: { label: 'Size', min: 1, max: 60, step: 1, def: 8 }, opacity: opac(100), blend: blend('normal') },
    apply(r, x) { r.styles.push({ kind: 'outline', color: P(x, 'color'), alpha: P(x, 'opacity') / 100, size: P(x, 'size'), dx: 0, dy: 0, blur: 0, blend: P(x, 'blend') }); } });
  fx({ id: 'innerShadow', label: 'Inner shadow', cat: 'static', params: { color: color('#000000'), opacity: opac(45), angle: { label: 'Angle', min: -180, max: 180, step: 1, def: 45 }, distance: { label: 'Distance', min: 0, max: 100, step: 1, def: 8 }, blur: { label: 'Blur', min: 0, max: 60, step: 1, def: 10 }, blend: blend('multiply') },
    apply(r, x) { const [dx, dy] = offset(x, P(x, 'distance')); r.styles.push({ kind: 'inner', color: P(x, 'color'), alpha: P(x, 'opacity') / 100, dx, dy, blur: P(x, 'blur'), blend: P(x, 'blend') }); } });

  // ---------- change color and duplicate
  fx({ id: 'recolor', label: 'Change color', cat: 'static', params: { color: color('#FF4F8B'), intensity: { label: 'Intensity %', min: 0, max: 100, step: 1, def: 100 }, mode: { label: 'How', options: { fill: 'Replace the color', tint: 'Tint (keeps light and shade)', multiply: 'Multiply (darker)' }, def: 'fill' } },
    apply(r, x) { const a = P(x, 'intensity') / 100; if (a <= 0) return; (r.tints = r.tints || []).push({ color: P(x, 'color'), amt: a, mode: P(x, 'mode') }); } });
  fx({ id: 'duplicate', label: 'Duplicate (grid)', cat: 'static', params: { cols: { label: 'Columns', min: 1, max: 30, step: 1, def: 3 }, rows: { label: 'Rows', min: 1, max: 30, step: 1, def: 1 }, dx: { label: 'Column gap px', min: -2000, max: 2000, step: 1, def: 260 }, dy: { label: 'Row gap px', min: -2000, max: 2000, step: 1, def: 260 } },
    apply(r, x) { r.copies = { cols: Math.max(1, Math.round(P(x, 'cols'))), rows: Math.max(1, Math.round(P(x, 'rows'))), dx: P(x, 'dx'), dy: P(x, 'dy') }; } });

  // ---------- transitions in
  fx({ id: 'fadeIn', label: 'Fade in', cat: 'in', params: ['dur'], apply(r, x) { r.opacity *= smooth(x.u); } });
  fx({ id: 'popIn', label: 'Pop in', cat: 'in', params: ['dur', 'amt'], defaultDur: 0.45, apply(r, x) { const k = x.u >= 1 ? 1 : Math.max(0, backOut(x.u, 1.70158 * x.amt)); r.sx *= k; r.sy *= k; } });
  fx({ id: 'slideIn', label: 'Slide in', cat: 'in', params: ['dur', 'amt', 'dir'], apply(r, x) { const [dx, dy] = dirv(x.e.dir), off = (1 - cubicOut(x.u)) * 500 * x.amt; r.x += dx * off; r.y += dy * off; r.opacity *= U.clamp(x.u * 2.5, 0, 1); } });
  fx({ id: 'zoomIn', label: 'Zoom in', cat: 'in', params: ['dur'], apply(r, x) { const k = U.lerp(0.2, 1, cubicOut(x.u)); r.sx *= k; r.sy *= k; r.opacity *= U.clamp(x.u * 1.4, 0, 1); } });
  fx({ id: 'wipeIn', label: 'Wipe in', cat: 'in', params: ['dur', 'dir'], apply(r, x) { if (x.u < 1) r.clip = { u: smooth(x.u), dir: x.e.dir || 'left' }; } });
  fx({ id: 'blurIn', label: 'Blur in', cat: 'in', params: ['dur'], apply(r, x) { if (x.u < 1) r.filters.push(`blur(${((1 - x.u) * 16 * x.sc).toFixed(2)}px)`); r.opacity *= U.clamp(x.u * 1.6, 0, 1); } });
  fx({ id: 'spinIn', label: 'Spin in', cat: 'in', params: ['dur'], apply(r, x) { const k = cubicOut(x.u); r.rot -= (1 - k) * 270; r.sx *= k; r.sy *= k; } });
  fx({ id: 'drawIn', label: 'Draw on', cat: 'in', params: ['dur'], defaultDur: 1.5, apply(r, x) { r.prog = Math.min(r.prog, x.u); if (x.o.type === 'text') r.chars = Math.min(r.chars, Math.floor(x.u * textLen(x.o))); } });
  fx({ id: 'typewriter', label: 'Typewriter', cat: 'in', params: ['speed'], only: ['text'], duration: (o, e) => Math.max(0.1, textLen(o) / (16 * (e.speed || 1))), apply(r, x) { r.chars = Math.floor(Math.max(0, x.T) * 16); } });

  // ---------- transitions out
  fx({ id: 'fadeOut', label: 'Fade out', cat: 'out', params: ['dur'], apply(r, x) { r.opacity *= smooth(x.u); } });
  fx({ id: 'popOut', label: 'Pop out', cat: 'out', params: ['dur', 'amt'], defaultDur: 0.45, apply(r, x) { const k = x.u >= 1 ? 1 : Math.max(0, backOut(x.u, 1.70158 * x.amt)); r.sx *= k; r.sy *= k; } });
  fx({ id: 'slideOut', label: 'Slide out', cat: 'out', params: ['dur', 'amt', 'dir'], apply(r, x) { const [dx, dy] = dirv(x.e.dir), off = (1 - cubicOut(x.u)) * 500 * x.amt; r.x += dx * off; r.y += dy * off; r.opacity *= U.clamp(x.u * 2.5, 0, 1); } });
  fx({ id: 'zoomOut', label: 'Zoom out', cat: 'out', params: ['dur'], apply(r, x) { const k = U.lerp(0.2, 1, cubicOut(x.u)); r.sx *= k; r.sy *= k; r.opacity *= U.clamp(x.u * 1.4, 0, 1); } });
  fx({ id: 'wipeOut', label: 'Wipe out', cat: 'out', params: ['dur', 'dir'], apply(r, x) { if (x.u < 1) r.clip = { u: smooth(x.u), dir: x.e.dir || 'left' }; } });
  fx({ id: 'blurOut', label: 'Blur out', cat: 'out', params: ['dur'], apply(r, x) { if (x.u < 1) r.filters.push(`blur(${((1 - x.u) * 16 * x.sc).toFixed(2)}px)`); r.opacity *= U.clamp(x.u * 1.6, 0, 1); } });
  fx({ id: 'spinOut', label: 'Spin out', cat: 'out', params: ['dur'], apply(r, x) { const k = cubicOut(x.u); r.rot += (1 - k) * 270; r.sx *= k; r.sy *= k; } });
  fx({ id: 'drawOut', label: 'Draw off', cat: 'out', params: ['dur'], defaultDur: 1.5, apply(r, x) { r.prog = Math.min(r.prog, x.u); if (x.o.type === 'text') r.chars = Math.min(r.chars, Math.floor(x.u * textLen(x.o))); } });
})(window.SB);
