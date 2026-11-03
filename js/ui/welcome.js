/* The welcome, shown once (the first visit; S.welcomed is kept with the preferences): pick how the app feels,
   a style that sets the shortcuts, the tool bar and the timeline bar together (each shown as it will look), and the theme.
   Then see an example or start. Settings › Appearance › Show the welcome again opens it later. */
'use strict';
(function (SB) {
  const U = SB.util, S = SB.state, h = U.h, W = SB.w;
  const STYLES = [
    { id: 'studio', icon: 'logo', name: 'Toonzi 2D', about: 'Clean and simple. Made for this app.', keys: 'default', rail: 'studio', tbar: 'studio' },
    { id: 'animate', icon: 'draw', name: 'Adobe Animate', about: 'Flash-style keys: F6 for a keyframe.', keys: 'animate', rail: 'flash', tbar: 'flash' },
    { id: 'toonz', icon: 'frames', name: 'OpenToonz', about: 'Frame by frame, with onion skin at hand.', keys: 'default', rail: 'opentoonz', tbar: 'opentoonz' },
    { id: 'premiere', icon: 'shot', name: 'Premiere / After Effects', about: 'Editing keys: Ctrl+K cuts, = zooms.', keys: 'premiere', rail: 'photoshop', tbar: 'premiere' },
    { id: 'simple', icon: 'play', name: 'Simple', about: 'Only the everyday tools and buttons.', keys: 'default', rail: 'simple', tbar: 'simple' },
  ];
  /** A few shortcuts of a key preset, for the preview. */
  function keysOf(preset) {
    const K = SB.keys, P = K.PRESETS[preset] || { map: {} }, key = id => (P.map[id] || K.ACT[id].def)[0] || '—';
    return [['Keyframe', 'key'], ['Brush', 'tBrush'], ['Cut a clip', 'split'], ['Play', 'play']].map(([l, id]) => h('span.wl-key', null, l, h('kbd.keycap', null, K.pretty(key(id)))));
  }
  /** The icons of a layout's buttons, in order (a little picture of the bar). */
  function iconsOf(order, group, lookup) {
    return order.filter(id => !(group || {})[id]).map(id => id.startsWith('space') ? h('i.wl-space') : id.startsWith('sep') ? h('i.wl-sep') : (lookup(id) ? h('span.wl-ic', { html: SB.icon(lookup(id)) }) : null)).filter(Boolean);
  }
  const TB_ICON = { start: 'start', prevframe: 'left', nextframe: 'right', play: 'play', loop: 'loop', time: 'clock', onion: 'onion', frames: 'frames', framelock: 'frameLock', mic: 'mic', rec: 'rec', interactive: 'target', key: 'key', blankkey: 'keyBlank', autokey: 'autokey', prevkey: 'keyPrev', nextkey: 'keyNext', keysnap: 'keySnap', split: 'split', shot: 'shot', rows: 'rows', filter: 'filter', zoom: 'zoom', action: 'rig' };
  const RAIL_ICON = id => { if (id.startsWith('tool:')) { const t = SB.tools.get(id.slice(5)); return t && t.icon; } return id.startsWith('add:') ? id.slice(4) : null; };

  function open(then) {
    let pick = STYLES[0], theme = S.theme || 'auto', dlg = null;
    const done = () => { S.welcomed = true; SB.prefs.save(); };
    const apply = () => { SB.keys.preset(pick.keys); if (SB.railLayouts) SB.railLayouts.set(pick.rail); if (SB.tbarLayouts) SB.tbarLayouts.set(pick.tbar); S.theme = theme; SB.settings.theme(theme); SB.prefs.save(); };
    const render = () => {
      const R = SB.railLayouts && SB.railLayouts.PRESETS[pick.rail], T = SB.tbarLayouts && SB.tbarLayouts.PRESETS[pick.tbar];
      dlg.el.replaceChildren(
        h('div.wl-head', null, h('span.wl-logo', { html: SB.icon('logo') }), h('div', null, h('h2', null, 'Welcome to Toonzi 2D'), h('p.sub', null, 'Draw, animate, rig and export. First, pick how it should feel: you can change any of it later in Settings.'))),
        h('div.wl-styles', { role: 'radiogroup', 'aria-label': 'Style' }, STYLES.map(st => h('button.wl-style' + (st === pick ? '.on' : ''), { type: 'button', role: 'radio', 'aria-checked': String(st === pick), onclick: () => { pick = st; render(); } },
          h('span.wl-big', { html: SB.icon(st.icon) }), h('b', null, st.name), h('small', null, st.about)))),
        h('div.wl-preview', null,
          h('div.wl-row', null, h('span.wl-lbl', null, 'Tool bar'), h('div.wl-bar.wl-tools', null, R ? iconsOf(R.order, R.group, RAIL_ICON) : null)),
          h('div.wl-row', null, h('span.wl-lbl', null, 'Timeline bar'), h('div.wl-bar', null, T ? iconsOf(T.order, T.group, id => TB_ICON[id]) : null)),
          h('div.wl-row', null, h('span.wl-lbl', null, 'Shortcuts'), h('div.wl-keys', null, keysOf(pick.keys)))),
        W.row('Look', W.seg(theme, [['auto', 'Match my device'], ['light', 'Light'], ['dark', 'Dark']], v => { theme = v; S.theme = v; SB.settings.theme(v); render(); })),
        h('div.sheet-actions', null,
          W.btn('See an example', () => { apply(); done(); dlg.close(); SB.example.load(); }, { cls: 'ghost', icon: 'play' }),
          W.btn('Start', () => { apply(); done(); dlg.close(); then && then(); }, { cls: 'primary' })));
    };
    dlg = SB.dialog.sheet(h('div'), { size: 'mid', sticky: true, onClose: done }); render(); return dlg;
  }
  SB.welcome = { open, STYLES };
})(window.SB);
