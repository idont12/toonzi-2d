/* What a project is made for (S.project.target), and what that allows.
     video    videos, sprite sheets and images: everything works
     web      interactive web animation: interactions (rules) and screens; everything works in its web-page export
     lottie   (not offered any more: a Lottie project is a web project) the Lottie export's limits: shapes, drawings,
              pictures, groups, masks and blend modes; effects only when they move, scale, turn or fade the layer
     game     Unity and Godot (the same limits, so one choice): sprites, bones that bend layers, masks
              that show the inside, controllers, one animation per screen; effects that move, scale,
              turn or fade
     blender  Blender (FBX): textured planes and a skeleton; effects only when they move, scale or turn
   What a target can't carry stays visible but greyed out (menus, the inspector, tools), with the reason
   in its tooltip. Switch any time: the chip in the top bar, Settings, or Project settings. */
'use strict';
(function (SB) {
  const S = SB.state;
  const MOVE = ['shake', 'wobble', 'float', 'pulse', 'jelly', 'spin', 'swing', 'popIn', 'slideIn', 'zoomIn', 'spinIn', 'popOut', 'slideOut', 'zoomOut', 'spinOut'];
  const FADE = ['fadeIn', 'fadeOut', 'blink'];
  const LIST = {
    video: { label: 'Video', short: 'Video', icon: 'video', info: 'No limits: every tool, effect and format works.' },
    web: { label: 'Interactive', short: 'Interactive', icon: 'target', info: 'Interactive web page with clicks, hovers and drags. Rive skips effects and video.' },
    lottie: { label: 'Web animation (Lottie)', short: 'Lottie', icon: 'web', info: 'No filters, glow, shadows, erasers, video or sound.', hidden: true }, // not offered: Interactive web covers it (kept for the Lottie export's checks)
    game: { label: 'Game Engine', short: 'Game Engine', icon: 'game', info: 'No filters, glow, shadows, blend modes, video or sound.' },
    blender: { label: 'Blender (FBX)', short: 'Blender (FBX)', icon: 'cube', info: 'No fading, filters, masks, blend modes, video or sound.' },
  };
  const OLD = { fbx: 'game', lottie: 'web' }; // projects made before the game target existed; Lottie projects are web projects now
  const CHOICES = () => Object.keys(LIST).filter(k => !LIST[k].hidden);
  const T = SB.targets = {
    LIST,
    get() { const t = (S.project && S.project.target) || 'video'; return LIST[t] && !LIST[t].hidden ? t : OLD[t] || 'video'; },
    label: t => LIST[t || T.get()].label,
    short: t => LIST[t || T.get()].short,
    /** Can effect definition d be shown by target t? */
    fxOk(t, d) {
      if (!t || t === 'video' || t === 'web') return true; const fade = t === 'lottie' || t === 'game';
      if (MOVE.includes(d.id) || (fade && FADE.includes(d.id))) return true;
      if (d.fxDesign && SB.fxDesigner) { const D = SB.fxDesigner.find(d.fxDesign); return !!D && D.changes.every(c => ['x', 'y', 'scale', 'sx', 'sy', 'rot'].includes(c.p) || (fade && c.p === 'opacity')); }
      if (d.designed) { const tr = (S.doc.transitions || []).find(x => 'tr:' + x.id === d.id); return !!tr && !(tr.shapes && tr.shapes.length) && !(tr.layer && tr.layer.keys || []).some(k => (k.blur || 0) > 0 || (!fade && k.op != null && k.op < 1)); }
      return false;
    },
    /** Other features: 'video', 'audio', 'mask', 'maskOut', 'blend', 'eraser'. */
    allows(f, t = T.get()) {
      if (t === 'video' || t === 'web') return true;
      if (f === 'video' || f === 'audio') return false;
      if (t === 'blender') return !['mask', 'maskOut', 'blend'].includes(f);
      if (t === 'game') return !['maskOut', 'blend'].includes(f);
      return f !== 'eraser';
    },
    /** Why something is greyed out (tooltip text). */
    why: (t = T.get()) => `Not available in ${LIST[t].short} projects. Change what this project is made for in Settings.`,
    /** A short message when something is blocked. */
    blocked(what) { SB.toast(`${what} can’t go in a ${LIST[T.get()].short} file. This project is made for ${LIST[T.get()].label}; switch in Settings or with the chip at the top.`); },
    set(t) {
      if (!LIST[t] || t === T.get()) return; S.project.target = t; SB.commit(); SB.invalidate();
      const bad = T.badLayers(t);
      if (!bad.length) return SB.toast(`This screen is made for ${LIST[t].label}.${t === 'video' ? ' Everything is available.' : ' What it can’t carry is greyed out.'}`);
      T.askFix(t, bad);
    },
    /** What one layer uses that target t can't carry (its own effects, blend, mask, type). */
    issues(o, t = T.get()) {
      if (!o || t === 'video') return []; const out = [];
      if ((o.type === 'video' || o.type === 'audio') && !T.allows(o.type, t)) out.push(o.type === 'video' ? 'video' : 'sound');
      if (o.blend && o.blend !== 'normal' && !T.allows('blend', t)) out.push('blend mode');
      if (o.isMask && !T.allows(o.isMask === 'out' ? 'maskOut' : 'mask', t)) out.push(o.isMask === 'out' ? 'outside mask' : 'mask');
      for (const e of o.effects || []) { const d = SB.effects.get(e.type); if (d && e.on !== false && !T.fxOk(t, d)) out.push(d.label); }
      if (!T.allows('eraser', t) && (o.frames || []).some(f => (f.strokes || []).some(st => st.er))) out.push('eraser strokes');
      return out;
    },
    /** Layers of a list (the screen you work on by default) that use things t can't carry: [[layer, reasons]]. */
    badLayers(t = T.get(), list) { const out = []; const all = list ? (function w(l, a) { for (const o of l) { a.push(o); if (o.children) w(o.children, a); } return a; })(list, []) : SB.tree.all(); for (const o of all) { const r = T.issues(o, t); if (r.length) out.push([o, r]); } return out; },
    /** Things the screen can't carry (names), for a list of layers or the screen you work on. */
    problems(t = T.get(), list) { return [...new Set(T.badLayers(t, list).flatMap(([, r]) => r))]; },
    /** Take out what t can't carry from one layer (video and sound layers are deleted). */
    fix(o, t = T.get()) {
      if ((o.type === 'video' || o.type === 'audio') && !T.allows(o.type, t)) return 'delete';
      if (o.blend && !T.allows('blend', t)) delete o.blend;
      if (o.isMask && !T.allows(o.isMask === 'out' ? 'maskOut' : 'mask', t)) { delete o.isMask; delete o.maskVisible; }
      o.effects = (o.effects || []).filter(e => { const d = SB.effects.get(e.type); const ok = !d || T.fxOk(t, d); if (!ok) SB.tracks.drop(o, 'fx:' + e.id + ':'); return ok; });
      if (!T.allows('eraser', t)) (o.frames || []).forEach(f => { if (f.strokes) f.strokes = f.strokes.filter(st => !st.er); });
      return 'fixed';
    },
    /** Switched to a format that can't carry some layers: remove those things, or keep them marked red. */
    async askFix(t, bad) {
      const names = [...new Set(bad.flatMap(([, r]) => r))], h = SB.util.h;
      const v = await SB.dialog.ask(`${bad.length} layer${bad.length > 1 ? 's use' : ' uses'} things ${LIST[t].short} can’t show`, `${names.slice(0, 6).join(', ')}${names.length > 6 ? '…' : ''}. Remove them now, or keep them: those layers stay marked red in the timeline until you fix them or change the mode, and they are left out when you export.`,
        [{ v: 'keep', label: 'Keep, mark them' }, { v: 'fix', label: 'Remove them', danger: true }]);
      if (v !== 'fix') { SB.invalidate('timeline'); return SB.toast(`${bad.length} layer${bad.length > 1 ? 's are' : ' is'} marked red in the timeline.`); }
      const del = []; for (const [o] of bad) if (T.fix(o, t) === 'delete') del.push(o);
      if (del.length) SB.ops.remove(del); SB.commit(); SB.invalidate(); SB.toast(`Removed what ${LIST[t].short} can’t show from ${bad.length} layer${bad.length > 1 ? 's' : ''}.`); void h;
    },
    /** Ask what the project is for: a grid of choices, the note of the one under the pointer below it.
        With a mouse a click picks; on a touch screen a tap marks it and Start confirms.
        switching: the project exists already (the chip's "What does this change?"): picking switches it. */
    /** Sizes offered when a project starts (Custom… asks for width and height). */
    START_SIZES: [['1920x1080', 'HD 1920 × 1080 (16:9)'], ['1280x720', 'HD 1280 × 720 (16:9)'], ['3840x2160', '4K 3840 × 2160 (16:9)'], ['1080x1920', 'Vertical 1080 × 1920 (9:16)'], ['1080x1080', 'Square 1080 × 1080'], ['1080x1350', 'Portrait 1080 × 1350 (4:5)'], ['1440x1080', 'Classic 1440 × 1080 (4:3)'], ['2560x1080', 'Cinema 2560 × 1080 (21:9)'], ['1024x768', 'Tablet 1024 × 768'], ['512x512', 'Sprite 512 × 512'], ['256x256', 'Icon 256 × 256'], ['custom', 'Custom…']],
    /** The start dialog: a size and what the animation is for (two dropdowns with pictures), then Start. */
    start(onPick) {
      const h = SB.util.h, W = SB.w, U = SB.util, p = S.project, list = T.START_SIZES; let size = list.some(([k]) => k === p.w + 'x' + p.h) ? p.w + 'x' + p.h : '1920x1080', mode = T.get(), dlg = null;
      const cw = W.num(p.w, { min: 64, max: 4096, step: 2, label: 'Width' }), ch = W.num(p.h, { min: 64, max: 4096, step: 2, label: 'Height' }), custom = W.row('Width × height', cw, '×', ch); custom.hidden = size !== 'custom';
      /** A little screen in the size's shape. */
      const shape = k => { if (k === 'custom') return h('span.sz-shape.custom', { html: SB.icon('fit') }); const [w, hh] = k.split('x').map(Number), m = Math.max(w, hh); return h('span.sz-shape', null, h('i', { style: { width: Math.round(22 * w / m) + 'px', height: Math.round(22 * hh / m) + 'px' } })); };
      const sizeName = k => (list.find(x => x[0] === k) || [k, k])[1];
      /** A dropdown that shows pictures: a button with the current choice; the choices open in a list under it. */
      const picker = (cur, opts, onPick2) => {
        const btn = h('button.pk-btn', { type: 'button', 'aria-haspopup': 'listbox' });
        const show = v => { const o = opts.find(x => x.v === v); btn.replaceChildren(o.pic(), h('span.pk-txt', null, h('b', null, o.label), o.note ? h('small', null, o.note) : null), h('span.pk-chev', { html: SB.icon('down') })); };
        btn.onclick = () => SB.popover(btn, h('div.pk-list', { role: 'listbox' }, opts.map(o => h('button.pk-opt' + (o.v === cur ? '.on' : ''), { type: 'button', role: 'option', 'aria-selected': String(o.v === cur), onclick: () => { cur = o.v; show(cur); SB.popover.close(); onPick2(cur); } },
          o.pic(), h('span.pk-txt', null, h('b', null, o.label), o.note ? h('small', null, o.note) : null)))), { cls: 'pk-pop' });
        show(cur); return btn;
      };
      const sizeOpts = list.map(([k, label]) => { const m = /^(.*?) (\d+ × \d+)(?: \((.*)\))?$/.exec(label); return { v: k, label: m ? m[1] + ' ' + m[2] : label, note: m && m[3] ? m[3] : k === 'custom' ? 'Any width and height' : '', pic: () => shape(k) }; });
      const modeOpts = CHOICES().map(k => ({ v: k, label: LIST[k].label, note: LIST[k].info, pic: () => h('span.pk-ic', { html: SB.icon(LIST[k].icon) }) }));
      const go = () => {
        const [w, hh] = size === 'custom' ? [parseFloat(cw.value), parseFloat(ch.value)] : size.split('x').map(Number);
        if (w > 0 && hh > 0) { p.w = U.clamp(Math.round(w / 2) * 2, 64, 4096); p.h = U.clamp(Math.round(hh / 2) * 2, 64, 4096); }
        p.target = mode; dlg.close(); SB.commit(); SB.view.reset(); SB.invalidate(); onPick && onPick(mode);
      };
      dlg = SB.dialog.sheet([h('div.st-head', null, h('span.wl-logo', { html: SB.icon('logo') }), h('div', null, h('h2', null, 'Start your animation'), h('p.sub', null, 'Pick a size and what it is for. You can change both later.'))),
        h('div.st-field', null, h('span.st-lbl', null, 'Size'), picker(size, sizeOpts, v => { size = v; custom.hidden = v !== 'custom'; })), custom,
        h('div.st-field', null, h('span.st-lbl', null, 'Made for'), picker(mode, modeOpts, v => { mode = v; })),
        h('div.sheet-actions', null, W.btn('Start', go, { cls: 'primary', icon: 'play' }))], { size: 'mid' });
      return dlg;
    },
    ask(onPick, opt = {}) {
      if (opt.start) return T.start(onPick);
      const h = SB.util.h, touch = document.documentElement.dataset.touch === '1' || matchMedia('(pointer: coarse)').matches; let dlg = null, cur = T.get();
      const note = h('div.tgt-note'), showNote = k => { note.replaceChildren(h('b', null, LIST[k].label), h('span', null, LIST[k].info)); };
      const pick = k => { dlg.close(); if (opt.switching) T.set(k); else { S.project.target = k; SB.commit(); SB.invalidate(); } onPick && onPick(k); };
      const tiles = CHOICES().map(k => h('button.tgt-tile' + (k === cur ? '.on' : ''), { type: 'button', 'data-k': k, 'aria-pressed': String(k === cur),
        onpointerenter: e => { if (e.pointerType === 'mouse') showNote(k); }, onfocus: () => showNote(k), onpointerleave: e => { if (e.pointerType === 'mouse') showNote(cur); },
        onclick: () => { if (!touch || opt.start) return pick(k); cur = k; tiles.forEach(t => { t.classList.toggle('on', t.dataset.k === k); t.setAttribute('aria-pressed', String(t.dataset.k === k)); }); showNote(k); } },
        h('span.tgt-ic', { html: SB.icon(LIST[k].icon) }), h('b', null, LIST[k].label)));
      showNote(cur);
      dlg = SB.dialog.sheet([h('h2', null, opt.start ? 'Start your animation' : 'What is this animation for?'), opt.start ? h('p.sub', null, 'What is it for? Pick one to begin. You can switch any time with the chip at the top.') : null,
        opt.start ? null : h('p.sub', null, opt.switching ? `Now: ${LIST[T.get()].label}. Tools and effects a format can’t carry are greyed out; pick another to switch.` : 'This decides which tools and effects you can use, so everything you make can be exported. Switch any time with the chip at the top or in Settings.'),
        h('div.tgt-grid' + (tiles.length === 4 ? '.four' : ''), null, ...tiles), note,
        !opt.start && (touch || opt.switching) ? h('div.sheet-actions', null, opt.switching ? SB.w.btn('Cancel', () => dlg.close(), { cls: 'ghost' }) : null, touch ? SB.w.btn(opt.switching ? 'Switch' : 'Start', () => pick(cur), { cls: 'primary' }) : null) : null], { size: 'mid' });
      return dlg;
    },
    /** The "Made for" switch (Project settings). */
    row() { const W = SB.w; return W.row('Made for', W.select(T.get(), CHOICES().map(k => [k, LIST[k].label]), v => { T.set(v); if (SB.settings && SB.settings.refresh) SB.settings.refresh(); }, 'Made for')); },
    /** Settings › Made for: a list, each choice's name with what it means next to it. */
    cards(after) {
      const h = SB.util.h;
      return h('div.tgt-list', { role: 'radiogroup', 'aria-label': 'Made for' }, ...CHOICES().map(k => h('button.tgt-li' + (k === T.get() ? '.on' : ''), { type: 'button', role: 'radio', 'aria-checked': String(k === T.get()), onclick: () => { T.set(k); after && after(); } },
        h('span.tgt-radio'), h('span.tgt-ic', { html: SB.icon(LIST[k].icon) }), h('b', null, LIST[k].label), h('small', null, LIST[k].info))));
    },
    /** The chip in the top bar: shows the target, click to switch. */
    chip(phone) {
      const h = SB.util.h, t = T.get();
      return h('button.tgt-chip' + (t === 'video' ? '' : '.limited'), { type: 'button', title: `Made for ${LIST[t].label}. Click to change.`, 'aria-label': `Made for ${LIST[t].label}`, html: SB.icon(LIST[t].icon) + (phone ? '' : `<span>${LIST[t].short}</span>`),
        onclick: e => { const r = e.currentTarget.getBoundingClientRect(); SB.menu.open(r.left, r.bottom + 4, [{ head: 'Made for' }, ...CHOICES().map(k => ({ label: (k === t ? '✓ ' : '') + LIST[k].label, icon: LIST[k].icon, run: () => T.set(k) })), '-', { label: 'What does this change?', run: () => T.ask(null, { switching: true }) }]); } });
    },
  };
})(window.SB);
