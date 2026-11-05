/* Documentation from the menus: every right-click (or long-press) menu ends with "Documentation", which opens
   docs/index.html in a new tab at the part about what you clicked (the timeline, the frames, a rig, a controller…).
   The logo menu has it too, under Tutorials. SB.docs.open(section) opens a part; section ids are docs/index.html's. */
'use strict';
(function (SB) {
  const S = SB.state, tree = SB.tree;
  const URL0 = location.protocol === 'file:' ? 'docs/index.html' : 'docs/'; // on a web server (GitHub Pages): …/toonzi-2d/docs/
  const BY_TYPE = { rig: 'rigs', null: 'controls', group: 'layers', screen: 'screens', video: 'timeline', audio: 'timeline', particles: 'particles', pixels: 'pixelart' };
  /** Which part of the docs fits what is under the pointer (or what is selected). */
  function sectionFor(target) {
    const t = target && target.closest ? target : null;
    if (t && t.closest('#framesBar')) return 'frames';
    if (t && t.closest('#ixPanel')) return 'interactive';
    if (t && t.closest('#tl, #dockTabs, #transport')) { const fx = t.closest('.fxblk, [data-fx]'); return fx ? 'fx' : 'timeline'; }
    if (S.ixMode) return 'interactive';
    const o = tree.sel();
    if (o) { if (o.mask || o.maskOf) return 'masks'; if (o.phys && o.phys.on) return 'physics'; if (BY_TYPE[o.type]) return BY_TYPE[o.type]; return 'layers'; }
    return S.tool === 'pixel' ? 'pixelart' : 'tools';
  }
  const open = sec => { const url = URL0 + (sec ? '#' + sec : ''); try { window.open(url, '_blank', 'noopener'); } catch (e) { location.href = url; } };
  const item = sec => ({ label: 'Documentation', icon: 'book', run: () => open(sec) });

  // a right-click (or a long-press menu) marks the next menu that opens: it gets the Documentation item at the end
  let mark = null; const now = () => performance.now();
  addEventListener('contextmenu', e => { mark = { at: now(), target: e.target }; }, true);
  addEventListener('keydown', () => { mark = null; }, true);
  const wrap = name => { const f = SB.menus[name]; if (f) SB.menus[name] = function (e, ...rest) { if (e && e.target) mark = { at: now(), target: e.target }; return f.call(this, e, ...rest); }; };
  wrap('stage'); wrap('timeline');
  const open0 = SB.menu.open;
  SB.menu.open = (x, y, items, level = 0, anchor) => {
    if (!level && mark && now() - mark.at < 600 && Array.isArray(items) && items.some(Boolean) && !items.some(it => it && it.label === 'Documentation')) items = items.concat(['-', item(sectionFor(mark.target))]); // the selection is up to date by now
    if (!level) mark = null; return open0(x, y, items, level, anchor);
  };
  SB.docs = { open, sectionFor, url: URL0 };
})(window.SB);
