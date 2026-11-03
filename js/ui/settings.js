/* Two dialogs:
   - Screen settings (SB.settings.screen): size, frame rate, length and background of the
     screen you work on ("Project settings" while there is only one screen). Saved in the project.
   - Settings (SB.settings.open): the tool itself, appearance and shortcuts. Kept on this device in SB.prefs. */
'use strict';
(function (SB) {
  const U = SB.util, S = SB.state, h = U.h, W = SB.w, FL = SB.fields;
  const SIZES = { '1920x1080': 'Wide 16:9', '1080x1920': 'Vertical 9:16', '1080x1080': 'Square 1:1', '1440x1080': 'Classic 4:3', '1080x1350': 'Portrait 4:5', '2560x1080': 'Cinema 21:9', '512x512': 'Sprite 512' };
  const FITS = { cover: 'Cover (fill, crop edges)', contain: 'Contain (fit inside)', stretch: 'Stretch to fill', none: 'Original size', repeat: 'Tile', 'repeat-x': 'Tile across', 'repeat-y': 'Tile down' };

  // ---------- preferences kept on this device
  SB.prefs = {
    save() { clearTimeout(SB.prefs._t); SB.prefs._t = setTimeout(() => SB.project.putPref({ ctrlNames: S.ctrlNames, myTours: S.myTours, tourOrder: S.tourOrder, tourCharacter: S.tourCharacter, keymap: S.keymap, keyPreset: S.keyPreset, labels: S.labels, btnLabels: S.btnLabels, onion: S.onion, onionOpt: S.onionOpt, brushes: S.brushes, brushV40: true, brushId: S.brushId, brushTex: S.brushTex, pressure: S.pressure, theme: S.theme, layout: S.layout, dockH: S.dockH, inspW: S.inspW, miniH: S.miniH, tbarEdits: S.tbarEdits, tbarLayout: S.tbarLayout, tbarCustom: S.tbarCustom, tbarV40: true, railLayout: S.railLayout, railEdits: S.railEdits, railCustom: S.railCustom, railActive: S.railActive, welcomed: S.welcomed, snap: S.snap, rail: S.rail, railUi: S.railUi, tbar: S.tbar, customFx: S.customFx, macros: S.macros, keySnap: S.keySnap, tlFrames: S.tlFrames, tlHead: S.tlHead, frameLock: S.frameLock, simpleTools: S.simpleTools }), 300); },
    load(p) { if (!p) return; ['keymap', 'keyPreset', 'labels', 'btnLabels', 'onion', 'theme', 'layout', 'dockH', 'inspW', 'miniH', 'tbarEdits', 'tbarLayout', 'tbarCustom', 'railLayout', 'railEdits', 'railCustom', 'railActive', 'welcomed', 'brushId', 'brushTex', 'pressure', 'snap', 'rail', 'railUi', 'tbar', 'customFx', 'macros', 'keySnap', 'tlFrames', 'frameLock', 'tlHead', 'simpleTools', 'ctrlNames', 'myTours', 'tourOrder', 'tourCharacter'].forEach(k => { if (p[k] !== undefined) S[k] = p[k]; }); if (p.tbarLayout === 'opentoonz' && !p.tbarV40) { S.tbarLayout = 'studio'; if (S.tbarEdits && S.tbarEdits.opentoonz) { S.tbarEdits = Object.assign({}, S.tbarEdits); S.tbarEdits.studio = S.tbarEdits.opentoonz; delete S.tbarEdits.opentoonz; } } /* the old default bar is now called Toonzi 2D */ if (p.onionOpt) Object.assign(S.onionOpt, p.onionOpt); if (p.brushes && p.brushes.length) { S.brushes = p.brushes; if (!p.brushV40) SB.BRUSH_PRESETS.filter(b => SB.BRUSHES_V40.includes(b.id) && !S.brushes.some(x => x.id === b.id)).forEach(b => S.brushes.push(U.deep(b))); } if (SB.customFx) SB.customFx.load(S.customFx); if (SB.macros) SB.macros.register(); SB.settings.theme(S.theme); },
  };

  // background textures generated on the fly
  const texCache = {};
  function texture(kind) {
    if (texCache[kind]) return texCache[kind]; const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
    if (kind === 'paper') { x.fillStyle = '#F6F1E6'; x.fillRect(0, 0, 256, 256); const id = x.getImageData(0, 0, 256, 256); for (let i = 0; i < id.data.length; i += 4) { const v = U.hash(i * 0.37) * 9 + U.noise(i / 4 / 256 * 0.8, 3) * 6; id.data[i] += v; id.data[i + 1] += v; id.data[i + 2] += v * 0.9; } x.putImageData(id, 0, 0); }
    else if (kind === 'grid' || kind === 'blueprint') { x.fillStyle = kind === 'grid' ? '#FFFFFF' : '#1D4E89'; x.fillRect(0, 0, 256, 256); for (let i = 0; i <= 256; i += 32) { x.fillStyle = kind === 'grid' ? (i % 128 ? '#E6E8F2' : '#C9CEE3') : (i % 128 ? 'rgba(255,255,255,.18)' : 'rgba(255,255,255,.4)'); x.fillRect(i - 0.5, 0, i % 128 ? 1 : 2, 256); x.fillRect(0, i - 0.5, 256, i % 128 ? 1 : 2); } }
    else if (kind === 'dots') { x.fillStyle = '#FBFAFF'; x.fillRect(0, 0, 256, 256); x.fillStyle = '#D6D0F0'; for (let a = 16; a < 256; a += 32) for (let b = 16; b < 256; b += 32) { x.beginPath(); x.arc(a, b, 3, 0, Math.PI * 2); x.fill(); } }
    else if (kind === 'stripes') { x.fillStyle = '#F3F0FF'; x.fillRect(0, 0, 256, 256); x.strokeStyle = '#E4DDFF'; x.lineWidth = 12; for (let i = -256; i <= 512; i += 32) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + 256, 256); x.stroke(); } }
    return texCache[kind] = c;
  }
  async function setBg(blob, name, fit) { try { const m = await SB.media.add(blob, name, 'image'); S.project.bgImage = m.id; if (fit) S.project.bgFit = fit; SB.commit(); render(); } catch (e) { SB.toast(e.message || "Couldn't use that image."); } }

  let dlg = null, tab = 'target', mode = 'app';
  function projectTab() {
    const p = S.project, m = p.bgImage && SB.media.get(p.bgImage), set = (k, v) => { p[k] = v; SB.commit(); SB.view.fit(); render(); };
    const presets = h('div.presets', null, Object.entries(SIZES).map(([k, v]) => { const [w, hh] = k.split('x').map(Number), s = 30 / Math.max(w, hh); return h('button.preset' + (p.w === w && p.h === hh ? '.on' : ''), { type: 'button', onclick: () => { p.w = w; p.h = hh; SB.commit(); SB.view.fit(); render(); } }, h('i', { style: { width: Math.round(w * s) + 'px', height: Math.round(hh * s) + 'px' } }), h('b', null, v.split(' ')[0]), v.split(' ').slice(1).join(' ')); }));
    const pf = (k, label, type, extra) => FL.row(p, Object.assign({ k, label, type, single: true, after: () => { SB.view.fit(); } }, extra));
    const scr = SB.screens.many() ? SB.screens.active() : null;
    return [
      SB.targets ? SB.targets.row() : null, SB.targets ? h('p.hint', null, SB.targets.LIST[SB.targets.get()].info) : null,
      scr ? h('p.hint', null, `These settings belong to ${scr.name}. Every screen has its own size, frame rate, length and background.`) : null,
      scr ? FL.row(scr, { k: 'name', label: 'Screen name', type: 'text', single: true, after: () => SB.dirty() }) : pf('name', 'Name', 'text'),
      h('h3', null, 'Size'), presets,
      W.row('Custom (px)', W.num(p.w, { min: 64, max: 4096, step: 2, label: 'Width', change: v => set('w', U.clamp(Math.round(v / 2) * 2, 64, 4096)) }), '×', W.num(p.h, { min: 64, max: 4096, step: 2, label: 'Height', change: v => set('h', U.clamp(Math.round(v / 2) * 2, 64, 4096)) }), W.iconBtn('swap', 'Swap width and height', () => { [p.w, p.h] = [p.h, p.w]; SB.commit(); SB.view.fit(); render(); })),
      h('h3', null, 'Timing'),
      W.row('Frame rate', W.seg(p.fps, [12, 24, 25, 30, 60].map(f => [f, String(f), f + ' fps']), v => set('fps', +v)), h('span.hint', null, 'fps')),
      W.row('Length (s)', W.num(p.duration, { min: 0.5, max: 600, step: 0.5, label: 'Length', change: v => { p.fixedLen = true; set('duration', U.clamp(v, 0.5, 600)); } })), h('p.hint', null, 'Layers longer than the screen keep their keyframes; the animation just ends here.'),
      h('h3', null, 'Background'),
      W.row('Color', W.colorBtn(p.bg, { label: 'Background color', input: v => { p.bg = v; SB.dirty(); }, change: () => SB.commit() })),
      W.row('Image', h('div.bgprev', { style: m ? { backgroundImage: `url(${m.src})` } : null }), h('div', null, h('div.row', null, W.btn(m ? 'Replace' : 'Choose image', () => SB.io.pick('image/*', false, f => f[0] && setBg(f[0], f[0].name, p.bgImage ? null : 'cover')), { cls: 'sm' }), m ? W.btn('Remove', () => set('bgImage', null), { cls: 'sm ghost' }) : null),
        h('div.row', { style: { marginTop: '6px' } }, ['paper', 'grid', 'dots', 'stripes', 'blueprint'].map(t => h('button.tex', { type: 'button', title: t[0].toUpperCase() + t.slice(1) + ' texture', 'aria-label': t, style: { backgroundImage: `url(${texture(t).toDataURL()})` }, onclick: () => texture(t).toBlob(b => setBg(b, t + '.png', 'repeat')) }))))),
      m ? [pf('bgFit', 'Display', 'select', { options: FITS, rerender: true }), pf('bgPosX', 'Position X %', 'range', { min: 0, max: 100 }), pf('bgPosY', 'Position Y %', 'range', { min: 0, max: 100 }), pf('bgScale', 'Size %', 'range', { min: 5, max: 400 }), pf('bgAlpha', 'Opacity %', 'range', { min: 0, max: 100 }), pf('bgScrollX', 'Scroll X px/s', 'range', { min: -400, max: 400 }), pf('bgScrollY', 'Scroll Y px/s', 'range', { min: -400, max: 400 }), h('p.hint', null, 'Scroll moves the picture over time, handy for skies and roads.')] : null,
    ];
  }
  /** For the whole project (every screen): the layer colors. */
  function projectWideTab() {
    return [h('p.sub', null, 'These belong to the whole project and every screen in it. Size, length and background are set per screen (Screen settings).'),
      SB.layerColors ? SB.layerColors.rows(render) : null];
  }
  /** What the project is made for: switch between the full tool and the one limited to a format. */
  function targetTab() {
    const T = SB.targets; if (!T) return [];
    const probs = T.problems();
    return [h('p.sub', null, 'Where this screen goes. What the format can’t carry is greyed out; each screen has its own.'),
      T.cards(render),
      probs.length ? h('p.hint.warn', null, `Already in this project and left out when you export: ${probs.join(', ')}.`) : null];
  }
  function lookTab() {
    const save = () => { SB.prefs.save(); SB.layout.apply(); render(); };
    return [
      W.row('Theme', W.select(S.theme, { auto: 'Match my device', light: 'Light', dark: 'Dark' }, v => { S.theme = v; SB.settings.theme(v); save(); })),
      W.row('Layout', W.select(S.layout, { auto: 'Automatic (fits the screen)', desktop: 'Desktop', tablet: 'Tablet', phone: 'Phone' }, v => { S.layout = v; save(); })),
      h('p.hint', null, 'Automatic picks the phone layout for narrow screens and the tablet layout for medium ones. Big stage (F) hides the panels in any layout.'),
      h('h3', null, 'Bars'),
      SB.railLayouts ? W.row('Tool bar', W.select(SB.railLayouts.get(), SB.railLayouts.modes(), v => { SB.railLayouts.set(v); render(); }, 'Tool bar layout')) : null,
      SB.tbarLayouts ? W.row('Timeline bar', W.select(SB.tbarLayouts.get(), SB.tbarLayouts.modes(), v => { SB.tbarLayouts.set(v); render(); }, 'Timeline bar layout')) : null,
      h('p.hint', null, 'Layouts like other programs’. Change a bar with its ⋯ (or right-click), then Save as a new layout to keep it as your own.'),
      SB.welcome ? h('div.row.btns', null, W.btn('Show the welcome again', () => { dlg.close(); SB.welcome.open(); }, { cls: 'sm ghost' })) : null,
      W.row('Tool names', W.check(S.labels, 'Show names under the tool icons', v => { S.labels = v; save(); })),
      W.row('Button names', W.check(S.btnLabels, 'Show names next to buttons', v => { S.btnLabels = v; save(); SB.invalidate('top', 'transport', 'ctxbar'); })),
      h('h3', null, 'Onion skin'),
      W.row('Frames before', W.num(S.onionOpt.before, { min: 0, max: 10, change: v => { S.onionOpt.before = U.clamp(Math.round(v), 0, 10); SB.prefs.save(); SB.dirty(); } }), W.color(S.onionOpt.cb, { change: v => { S.onionOpt.cb = v; SB.prefs.save(); SB.dirty(); } })),
      W.row('Frames after', W.num(S.onionOpt.after, { min: 0, max: 10, change: v => { S.onionOpt.after = U.clamp(Math.round(v), 0, 10); SB.prefs.save(); SB.dirty(); } }), W.color(S.onionOpt.ca, { change: v => { S.onionOpt.ca = v; SB.prefs.save(); SB.dirty(); } })),
      W.row('Strength %', W.range(Math.round(S.onionOpt.alpha * 100), { min: 5, max: 100, input: v => { S.onionOpt.alpha = v / 100; SB.dirty(); }, change: () => SB.prefs.save() })),
    ];
  }
  function keysTab() {
    const K = SB.keys, list = h('div.keys');
    K.ACTIONS.forEach(([g, l]) => { list.appendChild(h('div.kh', null, g)); l.forEach(([id, label]) => {
      const cap = h('button.keycap', { type: 'button', 'aria-label': 'Shortcut for ' + label }, K.binding(id).map(K.pretty).join(', ') || 'None');
      cap.onclick = () => { cap.textContent = 'Press keys…'; cap.classList.add('cap'); K.capture = e => { e.preventDefault(); e.stopPropagation(); if (e.key === 'Escape') { K.capture = null; return render(); } const c = (e.key === 'Backspace' && !e.ctrlKey) ? '' : K.comboOf(e); if (c === null) return; K.capture = null; const clash = K.set(id, c); render(); if (clash.length) SB.toast(`${K.pretty(c)} was used by ${clash.join(', ')}. That one has no shortcut now.`); }; };
      const m = id.startsWith('m:') && (S.macros || []).find(x => 'm:' + x.id === id);
      list.appendChild(h('div.kr' + (m ? '.mine' : ''), null, h('span', null, label, m ? h('small', null, ` · ${m.steps.length} step${m.steps.length > 1 ? 's' : ''}`) : null), cap,
        m ? h('span.kr-acts', null, W.iconBtn('play', 'Play it now', () => { dlg.close(); SB.macros.play(m); }, 'sm'), W.iconBtn('edit', 'Rename, take out steps, change its shortcut', () => { dlg.close(); SB.macros.edit(m); }, 'sm'), W.iconBtn('trash', 'Delete this action', () => { SB.macros.remove(m); render(); }, 'sm'))
          : S.keymap[id] !== undefined ? W.iconBtn('x', 'Back to default', () => { K.reset(id); render(); }, 'sm') : h('span')));
    }); });
    return [h('p.sub', null, 'Click a shortcut, then press the new keys. Esc cancels, Backspace clears.'),
      h('div.row.btns', null, W.btn('Record a new action…', () => { dlg.close(); SB.macros.start(); }, { cls: 'sm primary', icon: 'rec', title: 'Do a few things (shortcuts, items of a layer’s right-click menu); they become one action with its own name and shortcut' }), h('span.hint', null, 'Your recorded actions are under My actions, at the end.')),
      W.row('Preset', W.select(S.keyPreset, Object.entries(K.PRESETS).map(([k, v]) => [k, v.label]).concat(S.keyPreset === 'custom' ? [['custom', 'Custom']] : []), v => { if (v !== 'custom') { K.preset(v); render(); SB.toast('Shortcuts updated.'); } })), list,
      h('div.row.btns', null, W.btn('Reset all', () => { S.keymap = {}; S.keyPreset = 'default'; SB.prefs.save(); render(); }, { cls: 'sm ghost' }))];
  }
  /** Your own effects, added as code (js/effects/custom.js explains the format). */
  function effectsTab() {
    const C = SB.customFx, ta = h('textarea.codein', { rows: 10, spellcheck: 'false', 'aria-label': 'Effect code', placeholder: 'Paste the code of an effect here' }), msg = h('p.hint');
    ta.value = fxDraft; ta.oninput = () => fxDraft = ta.value;
    const list = C.list();
    const FD = SB.fxDesigner, designs = FD ? FD.list() : [];
    return [h('h3', null, 'Designed effects'), h('p.sub', null, 'Make an effect by picking what changes and how. Saved in this project; they appear with a ✦.'),
      designs.length ? h('div.cfx-list', null, designs.map(D => h('div.cfx', null, h('b', null, D.name), h('small', null, { static: 'Look', loop: 'Animated', in: 'Transition in', out: 'Transition out' }[D.kind]), h('span.spacer'),
        W.iconBtn('edit', 'Edit', () => { dlg.close(); FD.open(D); }, 'sm'), W.iconBtn('copy', 'Duplicate', () => { FD.duplicate(D); render(); }, 'sm'), W.iconBtn('trash', 'Delete', () => { FD.remove(D); render(); }, 'sm')))) : null,
      h('div.row.btns', null, W.btn('New effect…', () => { dlg.close(); FD.open(null); }, { cls: 'sm primary', icon: 'plus' })),
      h('h3', null, 'Effects as code'),
      h('p.sub', null, 'Add effects of your own as code. Each one shows up in Effects (or Transitions) like the built-in ones. They are kept on this device.'),
      list.length ? h('div.cfx-list', null, list.map(d => h('div.cfx', null, h('b', null, d.label), h('small', null, { static: 'Look', loop: 'Animated', in: 'Transition in', out: 'Transition out' }[d.cat]), h('span.spacer'),
        W.iconBtn('edit', 'Edit its code', () => { fxDraft = C.codeOf(d.id); render(); }, 'sm'), W.iconBtn('trash', 'Remove this effect', () => { C.remove(d.id); render(); }, 'sm')))) : h('p.hint', null, 'No effects of your own yet.'),
      h('h3', null, 'Add an effect'), ta, msg,
      h('div.row.btns', null, W.btn('Add effect', () => { try { const d = C.add(ta.value); fxDraft = ''; render(); SB.toast(`${d.label} added. Find it in ${d.cat === 'in' || d.cat === 'out' ? 'Transitions' : 'Effects'}.`); } catch (e) { msg.textContent = e.message; msg.classList.add('err'); } }, { cls: 'sm primary', icon: 'plus' }),
        W.btn('Example: a look', () => { fxDraft = C.EXAMPLES.look; render(); }, { cls: 'sm ghost' }), W.btn('Example: animated', () => { fxDraft = C.EXAMPLES.animated; render(); }, { cls: 'sm ghost' }), W.btn('Example: transition', () => { fxDraft = C.EXAMPLES.transition; render(); }, { cls: 'sm ghost' })),
      h('details.howto', null, h('summary', null, 'How to write an effect'), h('pre', null, `{
  id: 'myEffect',        // unique id
  label: 'My effect',    // its name in menus
  animated: false,       // false = a look that stays on, true = it moves over time
                         // (or cat: 'in' / 'out' for a transition)
  params: { amt: { label: 'Amount', min: 0, max: 2, step: 0.05, def: 1 } },
                         // or ['amt', 'speed', 'dur', 'dir'] for the ready-made ones,
                         // a color: { label: 'Color', type: 'color', def: '#ff0000' },
                         // a choice: { label: 'Mode', options: { a: 'A', b: 'B' }, def: 'a' }
  apply(r, x) {
    // r: x, y, sx, sy, rot, opacity, filters[] (CSS filters), glow, styles[]
    // x.e: this effect's settings (x.e.amt…), x.T: seconds since it started × speed,
    // x.u: 0 → 1 progress of a transition, x.o: the layer, x.sc: stage scale
    r.rot += Math.sin(x.T * 4) * 10 * x.e.amt;
  }
}`))];
  }
  /** Transitions designed for this project (js/ui/transitions.js). */
  function transitionsTab() {
    const T = SB.transitions, list = S.doc.transitions || [];
    return [h('p.sub', null, 'Animate how a layer arrives: move, scale, turn, fade and blur it, mask it, cut holes in it or break it into pieces. Saved in this project; they appear in Transitions with a ★.'),
      list.length ? h('div.cfx-list', null, list.map(tr => h('div.cfx', null, h('b', null, tr.name), h('small', null, tr.kind === 'in' ? 'In' : 'Out'), h('span.spacer'),
        W.iconBtn('edit', 'Edit', () => { dlg.close(); T.open(tr, () => SB.settings.open('transitions')); }, 'sm'), W.iconBtn('copy', 'Duplicate', () => { T.duplicate(tr); render(); }, 'sm'), W.iconBtn('trash', 'Delete', () => { T.remove(tr); render(); }, 'sm')))) : h('p.hint', null, 'No designed transitions yet.'),
      h('div.row.btns', null, W.btn('New transition…', () => { dlg.close(); T.open(null, () => SB.settings.open('transitions')); }, { cls: 'sm primary', icon: 'plus' }))];
  }
  let fxDraft = '';
  function render() {
    if (!dlg) return;
    if (mode === 'screen') {
      const scr = SB.screens.many() ? SB.screens.active() : null;
      return dlg.el.replaceChildren(h('h2', null, scr ? `Screen settings: ${scr.name}` : 'Project settings'), ...projectTab().flat(2).filter(Boolean), h('div.sheet-actions', null, W.btn('Done', () => dlg.close(), { cls: 'primary' })));
    }
    if (tab === 'transitions') tab = 'effects'; /* one tab for both now */
    const tabs = h('div.settabs', { role: 'tablist' }, [['target', 'Made for'], ['doc', 'Project'], ['look', 'Appearance'], ['keys', 'Shortcuts'], ['effects', 'Effects & transitions']].map(([k, v]) => h('button' + (tab === k ? '.on' : ''), { type: 'button', role: 'tab', 'aria-selected': String(tab === k), onclick: () => { tab = k; SB.keys.capture = null; render(); } }, v)));
    const body = tab === 'target' ? targetTab() : tab === 'doc' ? projectWideTab() : tab === 'look' ? lookTab() : tab === 'keys' ? keysTab() : [h('h3.set-h', null, 'Effects'), effectsTab(), h('h3.set-h', null, 'Transitions'), transitionsTab()];
    dlg.el.replaceChildren(h('h2', null, 'Settings'), tabs, ...[].concat(body).flat(2).filter(Boolean), h('div.sheet-actions', null, tab === 'doc' && SB.tours && SB.tours.studio ? h('button.tm-link', { type: 'button', title: 'Make and change tutorials (for tutorial authors)', onclick: () => { dlg.close(); SB.tours.studio.open(); } }, 'Tutorial maker…') : null, W.btn('Done', () => dlg.close(), { cls: 'primary' })));
  }
  const show = () => { if (dlg && dlg.el.isConnected) return render(); /* already open: show the other tab, don't open a second one */ dlg = SB.dialog.sheet(h('div'), { size: 'mid', onClose: () => { dlg = null; SB.keys.capture = null; SB.invalidate(); } }); render(); };
  SB.settings = {
    /** The tool's settings (appearance, shortcuts). open('project') opens the screen settings instead. */
    open(t) { if (t === 'project' || t === 'screen') return SB.settings.screen(); if (t) tab = t; mode = 'app'; show(); },
    /** Settings of one screen (the active one, or s). */
    screen(s) { if (s && s !== SB.screens.active()) SB.board.focus(s, true); mode = 'screen'; show(); },
    theme(t) { if (t === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t; SB.dirty(); },
    texture,
    refresh: () => render(),
  };
})(window.SB);
