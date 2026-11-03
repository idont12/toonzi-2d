/* Form widgets, and the renderer that turns field definitions into inspector rows.

   Field definition (used by object types, effects and settings):
     { k: 'fontSize', label: 'Size', type: 'range', min: 12, max: 400, step: 1, anim: true }
   types: num, range, color, check, select, seg, text, textarea, font, buttons, note, custom
   anim: true      the property can be keyframed (shows the diamond, edits use SB.tracks.set)
   get(o) / set(o, v)  custom read/write; otherwise o[k] (or the animated value)
   with: {...}     a second control on the same row (e.g. a checkbox with a color)
   rerender: true  rebuild the inspector after a change (when other fields depend on it)
   after(o)        called after a change is committed */
'use strict';
(function (SB) {
  const U = SB.util, S = SB.state, TR = SB.tracks, tree = SB.tree, h = U.h;

  // ---------- plain widgets (return elements, take callbacks)
  const W = SB.w = {
    /** A round "?" button that shows longer explanations in a small popover. */
    info(text, label = 'More info') {
      const parts = [].concat(text).filter(Boolean);
      return h('button.info-btn', { type: 'button', title: label, 'aria-label': label, html: '?', onclick: e => { e.stopPropagation(); SB.popover(e.currentTarget, h('div.info-pop', null, ...parts.map(t => typeof t === 'string' ? h('p', null, t) : t))); } });
    },
    /** Long hints inside el become a "?" in their section's header (warnings stay visible). */
    tidyHints(el, max = 70) {
      const groups = new Map();
      for (const p of el.querySelectorAll('p.hint:not(.warn):not(.keep)')) { if (p.textContent.trim().length <= max) continue; const sec = p.closest('section.sec'); if (!sec) continue; if (!groups.has(sec)) groups.set(sec, []); groups.get(sec).push(p.textContent.trim()); p.remove(); }
      for (const [sec, texts] of groups) { const head = sec.querySelector(':scope > h3'); if (head) head.insertBefore(W.info(texts), head.children[1] || null); }
    },
    num(v, o = {}) { const el = h('input', { type: 'number', value: U.r2(v), step: o.step ?? 1, min: o.min, max: o.max, 'aria-label': o.label || '' }); el.addEventListener('input', () => { const n = parseFloat(el.value); if (!isNaN(n) && o.input) o.input(n); }); el.addEventListener('change', () => { const n = parseFloat(el.value); if (!isNaN(n) && o.change) o.change(n); }); return el; },
    range(v, o = {}) {
      const r = h('input', { type: 'range', min: o.min ?? 0, max: o.max ?? 100, step: o.step ?? 1, value: v, 'aria-label': o.label || '' });
      const n = W.num(v, Object.assign({}, o, { input: x => { r.value = x; o.input && o.input(x); } }));
      r.addEventListener('input', () => { n.value = r.value; o.input && o.input(+r.value); }); r.addEventListener('change', () => o.change && o.change(+r.value));
      const wrap = h('div.rng', null, r, n); wrap._set = x => { r.value = x; n.value = U.r2(x); }; return wrap;
    },
    slider(v, o = {}) { const r = h('input', { type: 'range', min: o.min ?? 0, max: o.max ?? 100, step: o.step ?? 1, value: v, 'aria-label': o.label || '', style: o.width ? { width: o.width } : null }); r.addEventListener('input', () => o.input && o.input(+r.value)); r.addEventListener('change', () => o.change && o.change(+r.value)); return r; },
    color(v, o = {}) { const el = h('input', { type: 'color', value: v || '#000000', 'aria-label': o.label || 'Color' }); el.addEventListener('input', () => o.input && o.input(el.value)); el.addEventListener('change', () => o.change && o.change(el.value)); const w = h('label.swatch', { style: { '--sw': v } }, el); el.addEventListener('input', () => w.style.setProperty('--sw', el.value)); w._set = x => { el.value = x; w.style.setProperty('--sw', x); }; return w; },
    check(v, label, onChange) { const el = h('input', { type: 'checkbox' }); el.checked = !!v; el.addEventListener('change', () => onChange(el.checked)); return h('label.chk', null, el, label || ''); },
    select(v, options, onChange, label) {
      const pairs = Array.isArray(options) ? options : Object.entries(options);
      const el = h('select', { 'aria-label': label || '' }, pairs.map(([k, t, off]) => { const op = h('option', { value: k }, t); if (off) op.disabled = true; if (String(k) === String(v)) op.selected = true; return op; }));
      el.addEventListener('change', () => onChange(el.value)); return el;
    },
    /** Segmented buttons: options [[value, iconOrText, title]] */
    seg(v, options, onPick) {
      return h('div.seg', { role: 'group' }, options.map(([k, ic, title]) => h('button' + (String(v) === String(k) ? '.on' : ''), { type: 'button', title: title || '', 'aria-label': title || ic, html: SB.icons[ic] ? SB.icon(ic) : U.esc(ic), onclick: () => onPick(k) })));
    },
    btn(label, run, o = {}) { return h('button.btn' + (o.cls ? '.' + o.cls : ''), { type: 'button', title: o.title, html: (o.icon ? SB.icon(o.icon) : '') + (label ? `<span>${U.esc(label)}</span>` : ''), onclick: run }); },
    iconBtn(icon, title, run, cls = '') { return h('button.ib' + (cls ? '.' + cls : ''), { type: 'button', title, 'aria-label': title, html: SB.icon(icon), onclick: run }); },
    row(label, ...ctrls) { return label ? h('div.f', null, h('span', null, label), h('div.ctl', null, ...ctrls)) : h('div.f.full', null, h('div.ctl', null, ...ctrls)); }, // no label: the control (a checkbox) uses the whole width
    swatches(cur, colors, onPick) { return h('div.swatches', null, colors.map(c => h('button.sw' + (c.toLowerCase() === String(cur).toLowerCase() ? '.on' : ''), { type: 'button', style: { '--sw': c }, title: c, 'aria-label': 'Color ' + c, onclick: () => onPick(c) }))); },
  };
  SB.PALETTE = ['#24213F', '#FFFFFF', '#FF4F8B', '#FF8A3D', '#F4C430', '#1FB57A', '#2F7FF0', '#7B5CFF'];
  SB.PALETTE_FULL = ['#000000', '#24213F', '#4A4766', '#8A879F', '#C9C7D6', '#FFFFFF',
    '#E5484D', '#FF4F8B', '#FF8A3D', '#F4C430', '#FFE36E', '#8BD450', '#1FB57A', '#0FA38F', '#18C2D0', '#2F7FF0', '#7B5CFF', '#B04CD9',
    '#7A2E1F', '#A0522D', '#D9A066', '#F2D3B3', '#FFD9E3', '#D7F0FF'];
  /** Colors already used in the project (most used first). */
  function projectColors() {
    const n = new Map(), add = c => { if (typeof c === 'string' && c[0] === '#') { c = c.toUpperCase(); n.set(c, (n.get(c) || 0) + 1); } };
    for (const o of SB.tree.all()) { add(o.fill); add(o.stroke); add(o.color); (o.frames || []).forEach(f => (f.strokes || []).forEach(st => { add(st.c); add(st.fc); })); }
    return [...n.entries()].sort((a, b) => b[1] - a[1]).map(e => e[0]).slice(0, 12);
  }
  function remember(c) { if (!c) return; S.recentColors = [c.toUpperCase(), ...(S.recentColors || []).filter(x => x !== c.toUpperCase())].slice(0, 8); }
  /** CSS for a swatch of paint v (gradients and pictures show as they look). */
  const P = () => SB.paint;
  function swatchCss(v) {
    const p = P().parse(v);
    if (p.kind === 'grad') { const st = p.stops.map(x => `${x.c} ${Math.round(x.p * 100)}%`).join(', ') || '#000, #000'; return p.type === 'radial' ? `radial-gradient(circle, ${st})` : `linear-gradient(${Math.round(p.angle + 90)}deg, ${st})`; }
    if (p.kind === 'tex') { const t = SB.brushTex && SB.brushTex.texOf(p.id); return t ? `url("${t.src}") center / 60% repeat` : 'linear-gradient(#8A879F, #8A879F)'; }
    return `linear-gradient(${v || '#000'}, ${v || '#000'})`;
  }
  /** Show paint v on a color chip: --pw (what it looks like, over a checkerboard) and --sw (a plain color for older styles). */
  const showPaint = (el, v) => { el.style.setProperty('--pw', swatchCss(v)); el.style.setProperty('--sw', P().solid(v) || '#000'); };
  W.swatchCss = swatchCss;
  /** Fields whose color can also be a gradient or a pattern (what layers fill or outline with); other colors (glows, shadows) stay plain. */
  const PAINTABLE = new Set(['fill', 'stroke', 'color', 'outlineColor']);
  /** A color chip that opens one panel: Color (palette, recent and project colors, a picker, a hex box, see-through and Transparent),
      and with o.paint also Gradient and Texture. o.noAlpha: plain opaque colors only. */
  W.colorBtn = (v, o = {}) => {
    const b = h('button.colorbtn', { type: 'button', title: o.label || 'Color', 'aria-label': o.label || 'Color' }, o.text ? h('span', null, o.text) : null); showPaint(b, v);
    const set = (c, fin) => { v = c; showPaint(b, c); o.input && o.input(c); if (fin) { if (P().kind(c) === 'solid') remember(c); o.change && o.change(c); } };
    b.onclick = () => {
      const box = h('div.cpop'); let mode = P().kind(v) === 'grad' && o.paint ? 'grad' : P().kind(v) === 'tex' && o.paint ? 'tex' : 'color';
      const tabs = () => o.paint ? W.seg(mode, [['color', 'Color'], ['grad', 'Gradient'], ['tex', 'Texture']], m => { mode = m; if (m === 'grad' && P().kind(v) !== 'grad') { const c = P().split(P().solid(v)).hex; set(P().grad('linear', 0, [{ c, p: 0 }, { c: '#FFFFFF', p: 1 }]), true); } fill(); }) : null;
      const fill = () => box.replaceChildren(...[tabs(), ...(mode === 'grad' ? gradPane() : mode === 'tex' ? texPane() : colorPane())].flat().filter(Boolean));
      // ---- a plain color (with how much you can see it)
      function colorPane() {
        const cur = P().kind(v) === 'solid' ? P().split(v) : P().split(P().solid(v)); let a = cur.a;
        const pick = c => { if (a < 0.02) a = 1; const out = o.noAlpha ? c : P().withAlpha(c, a); set(out, true); }; // a color picked after Transparent shows again
        const grid = (title, list) => list.length ? [h('div.cp-t', null, title), h('div.cp-grid', null, list.map(c => h('button.sw' + (cur.hex === c.toUpperCase().slice(0, 7) ? '.on' : ''), { type: 'button', style: { '--sw': c }, title: c, 'aria-label': 'Color ' + c, onclick: () => { pick(c.slice(0, 7)); SB.popover.close(); } })))] : null;
        const nat = h('input', { type: 'color', value: cur.hex.toLowerCase(), 'aria-label': 'Pick any color' });
        const hex = h('input.cp-hex', { type: 'text', value: P().kind(v) === 'solid' ? String(v || '').toUpperCase() : cur.hex, maxlength: 9, 'aria-label': 'Hex color' });
        const live = c => { if (a < 0.02) a = 1; const out = o.noAlpha ? c : P().withAlpha(c, a); hex.value = out.toUpperCase(); set(out, false); };
        nat.oninput = () => live(nat.value); nat.onchange = () => pick(nat.value);
        hex.onchange = () => { let c = hex.value.trim(); if (!c.startsWith('#')) c = '#' + c; if (/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(c)) { if (c.length === 9 && !o.noAlpha) { a = parseInt(c.slice(7), 16) / 255; set(c.toUpperCase(), true); fill(); } else { nat.value = c.slice(0, 7); pick(c.slice(0, 7)); } } };
        const drop = window.EyeDropper ? W.iconBtn('dropper', 'Pick a color from the screen', async () => { try { const r = await new window.EyeDropper().open(); pick(r.sRGBHex); SB.popover.close(); } catch (e) {} }, 'sm') : null;
        const alphaRow = o.noAlpha ? null : h('div.cp-row.cp-alpha', null,
          h('span.cp-lbl', null, 'Opacity'), W.range(Math.round(a * 100), { min: 0, max: 100, label: 'How much you can see this color', input: x => { a = x / 100; const out = P().withAlpha(P().split(P().kind(v) === 'solid' ? v : P().solid(v)).hex, a); hex.value = out; set(out, false); }, change: () => set(v, true) }));
        return [grid('Palette', SB.PALETTE_FULL), grid('Recent', S.recentColors || []), grid('In this project', projectColors()), h('div.cp-row', null, h('label.swatch.big', { style: { '--sw': cur.hex } }, nat), hex, drop), alphaRow];
      }
      // ---- a gradient: linear or radial, its angle, its color stops
      function gradPane() {
        const g = P().parse(P().kind(v) === 'grad' ? v : P().grad('linear', 0, [{ c: '#000000', p: 0 }, { c: '#FFFFFF', p: 1 }])), save = (fin = true) => set(P().grad(g.type, g.angle, g.stops.slice().sort((x, y) => x.p - y.p), g), fin);
        const bar = h('div.cp-gbar', { style: { background: swatchCss(P().grad('linear', 0, g.stops.slice().sort((x, y) => x.p - y.p))) } });
        const stops = g.stops.map((st, i) => {
          const sw = W.colorBtn(st.c, { label: `Stop ${i + 1} color`, input: c => { st.c = c; bar.style.background = swatchCss(P().grad('linear', 0, g.stops)); save(false); }, change: c => { st.c = c; save(); } });
          return h('div.cp-row.cp-stop', null, sw, W.range(Math.round(st.p * 100), { min: 0, max: 100, label: `Stop ${i + 1} place`, input: x => { st.p = x / 100; bar.style.background = swatchCss(P().grad('linear', 0, g.stops.slice().sort((p, q) => p.p - q.p))); save(false); }, change: () => save() }),
            g.stops.length > 2 ? W.iconBtn('trash', 'Remove this color', () => { g.stops.splice(i, 1); save(); fill(); }, 'sm') : null);
        });
        return [h('div.cp-row', null, W.seg(g.type, [['linear', 'Linear'], ['radial', 'Radial']], t => { g.type = t; save(); fill(); }),
            g.type === 'linear' ? W.range(g.angle, { min: 0, max: 360, label: 'Angle', input: x => { g.angle = x; save(false); }, change: () => save() }) : null),
          bar, h('div.cp-t', null, 'Colors'), ...stops,
          W.btn('Add a color', () => { const L = g.stops.slice().sort((x, y) => x.p - y.p), a2 = L[L.length - 2], z = L[L.length - 1]; g.stops.push({ c: z.c, p: a2 ? (a2.p + z.p) / 2 : 0.5 }); save(); fill(); }, { cls: 'sm ghost', icon: 'plus' })];
      }
      // ---- a picture repeated as a pattern
      function texPane() {
        const cur = P().parse(v), BT = SB.brushTex, all = Object.assign({}, BT.builtIn(), S.brushTex || {}, (S.doc && S.doc.brushTex) || {});
        let scale = cur.kind === 'tex' ? cur.scale : 1;
        const tiles = Object.entries(all).map(([id, t]) => h('button.cp-tex' + (cur.kind === 'tex' && cur.id === id ? '.on' : ''), { type: 'button', title: t.name || id, style: { backgroundImage: `url("${t.src}")` }, onclick: () => { BT.keep(id); set(P().tex(id, scale), true); fill(); } }));
        const file = h('input', { type: 'file', accept: 'image/*', hidden: true }); file.onchange = async () => { const f = file.files && file.files[0]; if (!f) return; try { const id = await BT.fromFile(f); BT.keep(id); SB.prefs && SB.prefs.save && SB.prefs.save(); set(P().tex(id, scale), true); fill(); } catch (e) { SB.toast(e.message); } };
        const add = h('span', null, file, W.btn('Your picture…', () => file.click(), { cls: 'sm ghost', icon: 'image' }));
        return [h('div.cp-t', null, 'Pattern'), h('div.cp-texgrid', null, ...tiles), h('div.cp-row', null, add),
          h('div.cp-row', null, h('span.cp-lbl', null, 'Size'), W.range(Math.round(scale * 100), { min: 10, max: 400, label: 'Pattern size %', input: x => { scale = x / 100; if (cur.kind === 'tex') set(P().tex(cur.id, scale), false); }, change: () => { if (P().kind(v) === 'tex') set(v, true); } }))];
      }
      fill(); SB.popover(b, box, { cls: 'cp' });
    };
    b._set = c => { v = c; showPaint(b, c); };
    return b;
  };
  /** A compact value button ("Size 8px") that opens a slider. */
  W.popSlider = (label, v, o = {}) => {
    const txt = x => `${label} ${U.r2(x)}${o.unit || ''}`, b = h('button.btn.sm.popval', { type: 'button', title: o.title || label }, txt(v));
    b.onclick = () => {
      const n = W.range(v, { min: o.min, max: o.max, step: o.step, label, input: x => { v = x; b.textContent = txt(x); o.input && o.input(x); }, change: x => { o.change && o.change(x); } });
      SB.popover(b, h('div.pslider', null, h('div.cp-t', null, label), n));
    };
    return b;
  };

  // ---------- binding fields to the selected objects
  const sameType = o => tree.selected().filter(x => x.type === o.type && x !== o);
  const readField = (o, f) => { if (f.get) return f.get(o); if (!f.anim) return o[f.k]; const v = TR.now(o, f.k); return typeof v === 'number' ? v * TR.uiMul(f.k) : v; };
  function writeField(o, f, v, final) {
    const targets = [o].concat(f.single ? [] : sameType(o));
    for (const t of targets) {
      if (f.set) f.set(t, v);
      else if (f.anim) { let val = typeof v === 'number' ? v / TR.uiMul(f.k) : v; if (f.k === 'opacity') val = U.clamp(val, 0, 1); TR.set(t, f.k, val); }
      else t[f.k] = v;
    }
    SB.bump();
    if (final) { SB.commit(); if (f.after) f.after(o); if (f.rerender) SB.invalidate('inspector'); }
  }
  /** The keyframe diamond for an animatable field. */
  function keyButton(o, id) {
    const b = h('button.kbtn', { type: 'button', 'aria-label': 'Keyframe ' + id });
    const refresh = () => { const lt = tree.localTime(o); b.classList.toggle('anim', TR.animated(o, id)); b.classList.toggle('on', !!TR.keyAt(o.tracks[id], lt)); b.title = TR.animated(o, id) ? 'Add or remove a keyframe here' : 'Animate this'; };
    b.onclick = () => { const r = TR.toggleKey(o, id); sameType(o).forEach(x => { const has = !!TR.keyAt(x.tracks[id], tree.localTime(x)); if ((r === 'added') !== has) TR.toggleKey(x, id); }); if (r === 'added' && !o._keyHint) { o._keyHint = 1; SB.toast('Keyframe added. Change the value at another time to animate it.'); } SB.commit(); };
    refresh(); b._refresh = refresh; b.dataset.live = '1'; return b;
  }
  function control(o, f) {
    const v = readField(o, f), on = (x, fin) => writeField(o, f, x, fin);
    let el;
    switch (f.type) {
      case 'num': el = W.num(v, { min: f.min, max: f.max, step: f.step, label: f.label, input: x => on(x, false), change: x => on(x, true) }); break;
      case 'range': el = W.range(v, { min: f.min, max: f.max, step: f.step, label: f.label, input: x => on(x, false), change: x => on(x, true) }); break;
      case 'color': el = W.colorBtn(v, { label: f.label, paint: f.paint ?? PAINTABLE.has(f.k), input: x => on(x, false), change: x => on(x, true) }); break;
      case 'check': el = W.check(v, f.text || '', x => on(x, true)); break;
      case 'select': el = W.select(v, typeof f.options === 'function' ? f.options(o) : f.options, x => on(x, true), f.label); break;
      case 'seg': el = W.seg(v, f.options, x => { on(x, true); SB.invalidate('inspector'); }); break;
      case 'text': el = h('input', { type: 'text', value: v ?? '', 'aria-label': f.label || '' }); el.oninput = () => on(el.value, false); el.onchange = () => on(el.value, true); break;
      case 'textarea': el = h('textarea', { rows: 3, 'aria-label': f.label || 'Text' }); el.value = v ?? ''; el.oninput = () => on(el.value, false); el.onchange = () => on(el.value, true); break;
      case 'font': el = fontPicker(o, f); break;
      case 'custom': el = f.render(o); break;
    }
    if (f.anim && el) { el.dataset.live = '1'; el._refresh = () => { if (el.contains(document.activeElement)) return; const nv = readField(o, f); if (el._set) el._set(nv); else if (el.tagName === 'INPUT') el.value = U.r2(nv); }; }
    return el;
  }
  function fontPicker(o, f) {
    const opts = Object.entries(SB.FONTS).map(([k, d]) => [k, d[4]]);
    if ((o.font || '').startsWith('g:')) opts.push([o.font, o.font.slice(2) + ' (Google)']);
    opts.push(['__g', 'Other Google font…']);
    const sel = W.select(o.font, opts, v => {
      if (v !== '__g') return writeField(o, f, v, true);
      SB.dialog.prompt('Google font', 'Type any family name from fonts.google.com, for example Playfair Display.', '').then(n => {
        n = (n || '').trim().replace(/\s+/g, ' '); if (!n) return SB.invalidate('inspector');
        const key = 'g:' + n; SB.text.ensureFont(key, () => SB.toast(`Couldn't load "${n}". Check the name on fonts.google.com.`)); writeField(o, f, key, true); SB.invalidate('inspector');
      });
    }, 'Font');
    return sel;
  }

  /** Build one inspector row for a field. */
  function fieldRow(o, f) {
    if (!f) return null;
    if (f.type === 'note') return h('p.hint', null, f.text);
    if (f.type === 'buttons') return h('div.row.btns', null, f.items.filter(Boolean).map(it => W.btn(it.label, () => it.run(o), { cls: it.primary ? 'primary' : 'sm', icon: it.icon })));
    if (f.type === 'textarea') return h('div.f.full', null, control(o, f));
    if (!f.label && !f.anim && !f.with) return h('div.f.full', null, h('div.ctl', null, control(o, f))); // no label: the control starts at the left
    const label = h('span', null, f.anim ? keyButton(o, f.k) : null, f.label || '');
    const ctl = h('div.ctl', null, control(o, f), f.with ? [f.with.anim ? keyButton(o, f.with.k) : null, control(o, f.with)] : null);
    return h('div.f', null, label, ctl);
  }
  SB.fields = {
    row: fieldRow, read: readField, write: writeField, keyButton,
    /** A collapsible inspector section. */
    section(title, body, opt = {}) {
      const key = opt.key || title, open = SB.fields.open[key] ?? !opt.closed;
      const head = h('h3', { tabindex: 0, role: 'button', 'aria-expanded': String(open) }, h('span.grow', null, title), opt.badge || null, opt.tools || null);
      const sec = h('section.sec' + (open ? '' : '.closed'), { dataset: { key } }, head, ...[].concat(body).filter(Boolean));
      const toggle = e => { if (e.target.closest('button:not(h3),input,select,label')) return; const o = sec.classList.toggle('closed'); SB.fields.open[key] = !o; head.setAttribute('aria-expanded', String(!o)); };
      head.addEventListener('click', toggle); head.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(e); } });
      return sec;
    },
    open: {},
    /** Show a section of the side panel (opened, scrolled to), when the panel is open: keys in order of preference. It waits for the panel to be built again. */
    reveal(keys) {
      setTimeout(() => {
        const ins = document.getElementById('inspector'); if (!ins || !ins.offsetWidth || !ins.offsetHeight || getComputedStyle(ins).display === 'none') return;
        const sec = [].concat(keys).map(k => ins.querySelector(`section.sec[data-key="${k}"]`)).find(Boolean); if (!sec) return;
        if (sec.classList.contains('closed')) { sec.classList.remove('closed'); SB.fields.open[sec.dataset.key] = true; const hd = sec.querySelector('h3'); if (hd) hd.setAttribute('aria-expanded', 'true'); }
        sec.scrollIntoView({ block: 'start', behavior: 'smooth' }); sec.classList.add('flash'); setTimeout(() => sec.classList.remove('flash'), 900);
      }, 160);
    },
    /** Refresh every live control (after the playhead moves). */
    refresh(root = document) { root.querySelectorAll('[data-live]').forEach(el => el._refresh && el._refresh()); },
    /** Word choices (segmented buttons with text, not icons) as a dropdown: the side bar shows its choices this way.
        The buttons stay (hidden) and the dropdown clicks the one picked, so every control keeps working as written. */
    segToSelect(seg) {
      if (seg._sel || seg.closest('.keep-seg')) return; const bs = [...seg.querySelectorAll(':scope > button')]; if (bs.length < 2 || bs.some(b => b.querySelector('svg'))) return;
      const label = t => (t.textContent || t.getAttribute('aria-label') || '').trim(), on = bs.findIndex(b => b.classList.contains('on'));
      const sel = h('select.seg-sel', { 'aria-label': seg.getAttribute('aria-label') || bs.map(label).join(' / '), title: bs[Math.max(0, on)].title || '' }, bs.map((b, i) => { const o = h('option', { value: String(i) }, label(b)); if (b.disabled) o.disabled = true; if (b.title) o.title = b.title; return o; }));
      if (on < 0) { sel.insertBefore(h('option', { value: '', disabled: true, selected: true }, 'Choose…'), sel.firstChild); } else sel.value = String(on);
      sel.addEventListener('change', () => { const b = bs[+sel.value]; if (b) b.click(); });
      seg._sel = sel; seg.hidden = true; seg.after(sel);
    },
  };
  // the side bar (and an interaction rule's sheet on phones) shows word choices as dropdowns
  const SIDE = '#inspector, .ix-sheet';
  W.segToSelect = SB.fields.segToSelect;
  const convert = root => { if (root.matches && root.matches('.seg') && root.closest(SIDE)) W.segToSelect(root); if (root.querySelectorAll) root.querySelectorAll('.seg').forEach(sg => { if (sg.closest(SIDE)) W.segToSelect(sg); }); };
  const watch = () => new MutationObserver(list => { for (const m of list) for (const n of m.addedNodes) if (n.nodeType === 1) convert(n); }).observe(document.body, { childList: true, subtree: true });
  if (document.body) watch(); else addEventListener('DOMContentLoaded', watch);
})(window.SB);
