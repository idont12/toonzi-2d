/* Text objects, fonts (incl. Hebrew and any Google font), outline and highlight.
   To add a font to the picker, add it to FONTS: key: [css family, regular weight, bold weight, google spec]. */
'use strict';
(function (SB) {
  const U = SB.util;
  const FONTS = SB.FONTS = {
    lexend: ["'Lexend', system-ui, sans-serif", 500, 700, null, 'Clean'],
    hand: ["'Caveat', 'Comic Sans MS', cursive", 600, 700, 'Caveat:wght@400..700', 'Handwritten'],
    comic: ["'Bangers', Impact, sans-serif", 400, 400, 'Bangers', 'Comic'],
    serif: ["Georgia, 'Times New Roman', serif", 400, 700, null, 'Serif'],
    mono: ["'Courier New', Courier, monospace", 400, 700, null, 'Typewriter'],
    rubik: ["'Rubik', system-ui, sans-serif", 400, 700, 'Rubik:wght@300..900', 'Rubik (Hebrew)'],
    heebo: ["'Heebo', system-ui, sans-serif", 400, 700, 'Heebo:wght@100..900', 'Heebo (Hebrew)'],
    assistant: ["'Assistant', system-ui, sans-serif", 400, 700, 'Assistant:wght@200..800', 'Assistant (Hebrew)'],
    secular: ["'Secular One', system-ui, sans-serif", 400, 400, 'Secular+One', 'Secular One (Hebrew)'],
    varela: ["'Varela Round', system-ui, sans-serif", 400, 400, 'Varela+Round', 'Varela Round (Hebrew)'],
    frank: ["'Frank Ruhl Libre', Georgia, serif", 400, 700, 'Frank+Ruhl+Libre:wght@300..900', 'Frank Ruhl (Hebrew serif)'],
    suez: ["'Suez One', Georgia, serif", 400, 400, 'Suez+One', 'Suez One (Hebrew serif)'],
    amatic: ["'Amatic SC', cursive", 400, 700, 'Amatic+SC:wght@400;700', 'Amatic (Hebrew hand)'],
    karantina: ["'Karantina', Impact, sans-serif", 400, 700, 'Karantina:wght@300;400;700', 'Karantina (Hebrew bold)'],
    alef: ["'Alef', system-ui, sans-serif", 400, 700, 'Alef:wght@400;700', 'Alef (Hebrew)'],
  };
  SB.WEIGHTS = { 100: 'Thin', 200: 'Extra light', 300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'Semibold', 700: 'Bold', 800: 'Extra bold', 900: 'Black' };

  const loaded = new Set();
  const fontDef = key => { if (FONTS[key]) return FONTS[key]; if (key && key.startsWith('g:')) { const n = key.slice(2); return [`'${n}', system-ui, sans-serif`, 400, 700, n.replace(/ /g, '+') + ':wght@100..900', n]; } return FONTS.lexend; };
  /** Load a web font once; the stage redraws when it arrives. */
  function ensureFont(key, onFail) {
    const f = fontDef(key); if (!f[3] || loaded.has(key)) return; loaded.add(key);
    const add = (spec, retry) => {
      const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = `https://fonts.googleapis.com/css2?family=${spec}&display=swap`;
      l.onload = () => { const fam = f[0].split(',')[0]; Promise.all([400, 700].map(w => document.fonts.load(`${w} 40px ${fam}`))).catch(() => {}).then(() => { SB.bump(); SB.invalidate('frames'); if (onFail && !document.fonts.check(`400 40px ${fam}`)) onFail(); }); };
      l.onerror = () => { l.remove(); if (retry) add(retry, null); else if (onFail) onFail(); };
      document.head.appendChild(l);
    };
    add(f[3], key.startsWith('g:') ? f[3].split(':')[0] : null);
  }
  const fontStr = o => { const f = fontDef(o.font); if (f[3]) ensureFont(o.font); return `${o.weight || (o.bold ? f[2] : f[1])} ${o.fontSize}px ${f[0]}`; };

  /** Lines and sizes for layout. */
  function info(o, fr) {
    const txt = (fr && fr.text != null ? fr.text : o.text) || ' ';
    const lines = txt.split('\n'); U.measureCtx.font = fontStr(o);
    const ws = lines.map(l => U.measureCtx.measureText(l).width), lh = o.fontSize * 1.22;
    return { lines, ws, lh, w: Math.max(1, ...ws), h: lines.length * lh };
  }
  const hl = o => ({ padX: o.fontSize * (o.hlPadX ?? 45) / 100, padY: o.fontSize * (o.hlPadY ?? 27) / 100, rad: o.fontSize * (o.hlRadius ?? 40) / 100 });
  const lineLeft = (o, ti, i) => { const a = o.talign || 'center', w = ti.ws[i]; return a === 'left' ? -ti.w / 2 : a === 'right' ? ti.w / 2 - w : -w / 2; };
  const isRTL = (o, ln) => { const d = o.tdir || 'auto'; if (d !== 'auto') return d === 'rtl'; const m = /[A-Za-zÀ-ɏ]|[֐-׿؀-ۿ]/.exec(ln); return !!m && /[֐-׿؀-ۿ]/.test(m[0]); };
  const rrect = (c, x, y, w, h, r) => { r = Math.min(r, w / 2, h / 2); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); };

  function draw(c, o, fr, st) {
    const chars = st ? st.chars : Infinity, ti = info(o, fr), fs = o.fontSize; c.font = fontStr(o); c.textAlign = 'left'; c.textBaseline = 'middle';
    if (o.bgOn) {
      const { padX, padY, rad } = hl(o), style = o.hlStyle || 'box', a0 = c.globalAlpha; c.globalAlpha = a0 * U.clamp((o.hlAlpha ?? 100) / 100, 0, 1); c.fillStyle = o.bg;
      if (style === 'box') { c.beginPath(); rrect(c, -ti.w / 2 - padX, -ti.h / 2 - padY, ti.w + padX * 2, ti.h + padY * 2, rad); c.fill(); }
      else ti.lines.forEach((ln, i) => {
        if (!ln.trim()) return; const w = ti.ws[i], y = -ti.h / 2 + ti.lh * (i + 0.5), x = lineLeft(o, ti, i); c.beginPath();
        if (style === 'underline') rrect(c, x - padX * 0.3, y + fs * 0.3, w + padX * 0.6, Math.max(2, fs * 0.08 + padY * 0.3), rad * 0.3);
        else if (style === 'marker') rrect(c, x - padX * 0.4, y - fs * 0.02, w + padX * 0.8, fs * 0.42 + padY * 0.3, rad * 0.4);
        else rrect(c, x - padX, y - ti.lh / 2 - padY * 0.5 + fs * 0.06, w + padX * 2, ti.lh + padY, rad);
        c.fill();
      });
      c.globalAlpha = a0;
    }
    const ow = fs * (o.outlineW ?? 14) / 100, over = o.outlinePos === 'over', d0 = c.direction;
    let left = chars; const tw = Math.max(1, ...ti.ws) / 2, tbox = { x0: -tw, y0: -ti.h / 2, x1: tw, y1: ti.h / 2 }, fillP = SB.paint.style(c, o.color, tbox), lineP = o.outline ? SB.paint.style(c, o.outlineColor, tbox) : null; // gradients and patterns span the whole text
    ti.lines.forEach((ln, i) => {
      let s = ln; if (left !== Infinity) { if (left <= 0) return; s = ln.slice(0, left); left -= ln.length + 1; }
      const rtl = isRTL(o, ln); c.direction = rtl ? 'rtl' : 'ltr'; c.textAlign = rtl ? 'right' : 'left';
      const y = -ti.h / 2 + ti.lh * (i + 0.5), x = lineLeft(o, ti, i) + (rtl ? ti.ws[i] : 0);
      if (o.outline && !over && ow > 0) { c.lineWidth = ow; c.strokeStyle = lineP; c.lineJoin = 'round'; c.strokeText(s, x, y); }
      c.fillStyle = fillP; c.fillText(s, x, y);
      if (o.outline && over && ow > 0) { c.lineWidth = ow / 2; c.strokeStyle = lineP; c.lineJoin = 'round'; c.strokeText(s, x, y); }
    });
    c.direction = d0 || 'ltr'; c.textAlign = 'left';
  }

  SB.text = { FONTS, fontDef, ensureFont, fontStr, info, hl, isRTL };
  SB.types.add({
    id: 'text', label: 'Text', icon: 'text', color: '--c-text', visual: true, frames: true, fx: true,
    defaults: p => ({ text: 'Your idea here', font: 'lexend', fontSize: Math.round(p.h * 0.085), color: '#24213F', bold: true, outline: false, outlineColor: '#FFFFFF', bgOn: false, bg: '#FFE680', talign: 'center', tdir: 'auto' }),
    bounds(o, fi) { const ti = info(o, o.frames[fi]), m = o.bgOn ? hl(o) : { padX: 6, padY: 6 }, px = Math.max(6, m.padX), py = Math.max(6, m.padY); return { x0: -ti.w / 2 - px, y0: -ti.h / 2 - py, x1: ti.w / 2 + px, y1: ti.h / 2 + py }; },
    draw,
    props: o => [['fontSize', 'Size'], ['color', 'Color']].concat(o.bgOn ? [['bg', 'Highlight'], ['hlPadX', 'Highlight pad X'], ['hlPadY', 'Highlight pad Y'], ['hlRadius', 'Roundness'], ['hlAlpha', 'Highlight opacity']] : []).concat(o.outline ? [['outlineColor', 'Outline'], ['outlineW', 'Outline width']] : []),
    sections(o) {
      const fr = SB.frames.current(o), own = fr && fr.text != null;
      return [{ title: 'Text', fields: [
        { k: 'text', type: 'textarea', get: o => (own ? fr.text : o.text), set: (o, v) => { const f = SB.frames.current(o); if (f.text != null) f.text = v; else o.text = v; } },
        o.frames.length > 1 && { label: 'This frame only', type: 'check', get: () => own, set: (o, v) => { const f = SB.frames.current(o); if (v) f.text = o.text; else delete f.text; }, rerender: true },
        { k: 'font', label: 'Font', type: 'font' },
        { k: 'weight', label: 'Weight', type: 'select', options: SB.WEIGHTS, get: o => o.weight || (o.bold ? 700 : 400), set: (o, v) => { o.weight = +v; o.bold = +v >= 600; } },
        { label: 'Layout', type: 'seg', k: 'tdir', options: [['auto', 'tAuto', 'Direction: automatic'], ['ltr', 'tLtr', 'Left to right'], ['rtl', 'tRtl', 'Right to left']], with: { type: 'seg', k: 'talign', options: [['left', 'tLeft', 'Align left'], ['center', 'tCenter', 'Center'], ['right', 'tRight', 'Align right']] } },
        { k: 'fontSize', label: 'Size', type: 'range', min: 12, max: 400, anim: true },
        { k: 'color', label: 'Color', type: 'color', anim: true },
        { k: 'outline', label: 'Outline', type: 'check', rerender: true, with: { k: 'outlineColor', type: 'color', anim: true } },
        o.outline && { k: 'outlineW', label: 'Width', type: 'range', min: 0, max: 60, anim: true },
        o.outline && { k: 'outlinePos', label: 'Position', type: 'select', options: { behind: 'Behind the letters', over: 'On top of the letters' } },
        { k: 'bgOn', label: 'Highlight', type: 'check', rerender: true, with: { k: 'bg', type: 'color', anim: true } },
        o.bgOn && { k: 'hlStyle', label: 'Style', type: 'select', options: { box: 'One box', lines: 'Box per line', marker: 'Marker', underline: 'Underline' } },
        o.bgOn && { k: 'hlPadX', label: 'Side pad', type: 'range', min: 0, max: 150, anim: true },
        o.bgOn && { k: 'hlPadY', label: 'Top pad', type: 'range', min: 0, max: 150, anim: true },
        o.bgOn && { k: 'hlRadius', label: 'Round', type: 'range', min: 0, max: 100, anim: true },
        o.bgOn && { k: 'hlAlpha', label: 'Opacity', type: 'range', min: 0, max: 100, anim: true },
      ] }];
    },
  });
})(window.SB);
