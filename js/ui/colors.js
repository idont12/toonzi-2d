/* Layer colors: the color of each kind of layer in the timeline, the panel and the stage
   handles, with one color for light mode and one for dark mode. They belong to the project
   (S.doc.layerColors = { light: { draw: '#…' }, dark: { … } }) and are edited in Project /
   Screen settings. They are written as CSS variables (--c-draw, --c-text, …). */
'use strict';
(function (SB) {
  const U = SB.util, S = SB.state, h = U.h, W = SB.w;
  const KINDS = [['draw', 'Drawing'], ['text', 'Text'], ['shape', 'Shape'], ['image', 'Image'], ['video', 'Video'], ['audio', 'Audio'], ['group', 'Group'], ['shot', 'Shot'], ['rig', 'Rig'], ['ctrl', 'Controller']];
  const DEF = {
    light: { draw: '#E5484D', text: '#E38A00', shape: '#0FA38F', image: '#2F7FF0', video: '#8752F0', audio: '#1E9E5A', group: '#5B3DF5', shot: '#0E7C9B', rig: '#C2369A', ctrl: '#E8730C' },
    dark: { draw: '#FF6B70', text: '#FFB23F', shape: '#2DD4BF', image: '#5EA2FF', video: '#A88BFF', audio: '#3FD083', group: '#8B74FF', shot: '#2BB3D6', rig: '#E45BBE', ctrl: '#FF9A3D' },
  };
  const get = (mode, k) => ((S.doc.layerColors || {})[mode] || {})[k] || DEF[mode][k];
  let style = null;
  function apply() {
    if (!style) { style = document.createElement('style'); style.id = 'layerColors'; document.head.appendChild(style); }
    const vars = mode => KINDS.map(([k]) => `--c-${k}: ${get(mode, k)};`).join(' ') + (mode === 'dark' ? ` --c-phys: ${get(mode, 'ctrl')};` : ` --c-phys: ${get(mode, 'ctrl')};`);
    style.textContent = `:root { ${vars('light')} } :root[data-theme="dark"] { ${vars('dark')} } @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { ${vars('dark')} } }`;
    SB.dirty && SB.dirty();
  }
  function set(mode, k, v) { const c = S.doc.layerColors = Object.assign({ light: {}, dark: {} }, S.doc.layerColors); c[mode] = Object.assign({}, c[mode], { [k]: v }); apply(); }
  /** The rows for the settings dialog. */
  function rows(rerender) {
    const changed = !!S.doc.layerColors && ['light', 'dark'].some(m => Object.keys(S.doc.layerColors[m] || {}).length);
    return [h('h3', null, 'Layer colors'), h('p.hint', null, 'For the whole project: the color of each kind of layer in the timeline and the panel. One color for light mode, one for dark mode.'),
      h('div.lccards', null, ...KINDS.map(([k, label]) => h('div.lccard', null, h('span.lcname', null, h('i', { style: { background: `var(--c-${k})` } }), label),
        h('span.lcsw', null, W.color(get('light', k), { label: label + ' in light mode', input: v => set('light', k, v), change: () => SB.commit() }), W.color(get('dark', k), { label: label + ' in dark mode', input: v => set('dark', k, v), change: () => SB.commit() }))))),
      h('p.hint', null, 'In each box: the light-mode color, then the dark-mode one.'),
      changed ? h('div.row.btns', null, W.btn('Back to the standard colors', () => { delete S.doc.layerColors; apply(); SB.commit(); rerender && rerender(); }, { cls: 'sm ghost' })) : null];
  }
  SB.layerColors = { KINDS, DEF, get, apply, rows };
  SB.on('doc', apply); apply();
})(window.SB);
