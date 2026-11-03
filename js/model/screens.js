/* Screens: several canvases side by side on one board.
   Each screen has its own size, frame rate, length, background and layers
   (its own timeline). The screen you work on is "active": its settings are
   S.project and its layers are S.objects, so the rest of the app only ever
   sees one screen. Other screens wait in S.screens with { proj, objects }.
   x, y place a screen on the board (in pixels). */
'use strict';
(function (SB) {
  const U = SB.util, S = SB.state, tree = SB.tree;
  S.screens = null; S.scr = null;

  const Sc = SB.screens = {
    SIZES: [['same', 'Same size as this one'], ['1920x1080', 'Wide 1920×1080'], ['1080x1920', 'Phone 1080×1920'], ['1080x1080', 'Square 1080×1080'], ['1080x1350', 'Portrait 1080×1350'], ['1024x768', 'Tablet 1024×768'], ['512x512', 'Sprite 512×512'], ['256x256', 'Icon 256×256']],
    /** Bumped whenever a screen changes, so board thumbnails redraw. */
    ver: 0,
    ensure() { if (!S.screens || !S.screens.length) { S.screens = [{ id: 'scr' + U.uid(), name: 'Screen 1', x: 0, y: 0 }]; S.scr = S.screens[0].id; } Sc.sync(); return S.screens; },
    /** Keep the active screen's record pointing at the live project and layers. */
    sync() { if (!S.screens) return; const a = S.screens.find(s => s.id === S.scr) || S.screens[0]; S.scr = a.id; a.proj = S.project; a.objects = S.objects; },
    list: () => Sc.ensure(),
    active() { Sc.ensure(); return S.screens.find(s => s.id === S.scr); },
    many: () => !!(S.screens && S.screens.length > 1),
    find: id => (S.screens || []).find(s => s.id === id),

    /** What history and files store: every screen, with the active one marked. */
    meta() { if (!S.screens) return null; Sc.sync(); const ex = s => Object.assign(s.tmpl ? { tmpl: s.tmpl } : {}, s.from ? { from: s.from } : {}, s.editOf ? { editOf: s.editOf, back: s.back } : {}); return S.screens.map(s => s.id === S.scr ? Object.assign({ id: s.id, name: s.name, x: s.x, y: s.y, active: true }, ex(s)) : Object.assign({ id: s.id, name: s.name, x: s.x, y: s.y, proj: s.proj, objects: s.objects }, ex(s))); },
    /** Rebuild the screens from meta(). The active one takes the current S.project / S.objects. */
    restore(list, migrate) {
      Sc.ver++;
      if (!list || !list.length) { S.screens = null; Sc.ensure(); return; }
      S.screens = list.map(s => Object.assign({}, s)); const a = S.screens.find(s => s.active) || S.screens[0];
      S.screens.forEach(s => { delete s.active; if (s !== a) { s.proj = Object.assign(SB.defaultProject(), s.proj); s.objects = migrate ? migrate(s.objects || []) : (s.objects || []); } });
      S.scr = a.id; Sc.sync();
    },
    /** Make s the active screen (no view change). */
    swapTo(s) { Sc.sync(); S.project = s.proj; S.objects = s.objects; S.scr = s.id; S.ctx = null; tree.reindex(); },
    /** Run fn with screen s active, then switch back. */
    with(s, fn) { Sc.sync(); const a = Sc.active(); if (s === a) return fn(); const ctx = S.ctx, sel = S.sel, multi = S.multi; Sc.swapTo(s); try { return fn(); } finally { Sc.swapTo(a); S.ctx = ctx; S.sel = sel; S.multi = multi; } },

    add(size, at) {
      Sc.ensure(); const a = Sc.active(), p = S.project; let w = p.w, h = p.h; if (size && size !== 'same') [w, h] = size.split('x').map(Number);
      const right = Math.max(...S.screens.map(s => s.x + s.proj.w));
      const s = { id: 'scr' + U.uid(), name: `Screen ${S.screens.length + 1}`, x: at ? Math.round(at.x) : right + Math.round(Math.max(120, p.w * 0.08)), y: at ? Math.round(at.y) : a.y,
        proj: Object.assign(SB.defaultProject(), { name: p.name, fps: p.fps, w, h, duration: p.duration, bg: p.bg, target: p.target }), objects: [] }; // a new screen is made for the same format
      S.screens.push(s); Sc.ver++; return s;
    },
    duplicate(s) {
      Sc.sync(); const c = { id: 'scr' + U.uid(), name: s.name + ' copy', x: s.x, y: s.y + s.proj.h + Math.round(Math.max(120, s.proj.h * 0.1)), proj: U.deep(s.proj), objects: U.deep(s.objects) };
      remapIds(c.objects); S.screens.push(c); Sc.ver++; return c;
    },
    remove(s) { if (S.screens.length < 2) return false; S.screens = S.screens.filter(x => x !== s); Sc.ver++; return true; },
    bounds() { Sc.ensure(); const b = U.emptyBox(); S.screens.forEach(s => { U.growBox(b, s.x, s.y); U.growBox(b, s.x + s.proj.w, s.y + s.proj.h); }); return b; },
    /** The screen under a board point, if any. */
    at(bx, by, except) { return (S.screens || []).find(s => s !== except && bx >= s.x && bx <= s.x + s.proj.w && by >= s.y && by <= s.y + s.proj.h) || null; },
    remapIds,
  };
  /** Give copied layers new ids and point their links (rigs, controllers) at the copies. */
  function remapIds(list) { // copies keep a link to what they were copied from, so exports can match them across screens
    const map = new Map(); (function w(l) { for (const o of l) { const n = U.uid(); map.set(o.id, n); if (!o.link) o.link = o.id; o.id = n; if (o.children) w(o.children); } })(list);
    const fix = id => map.get(id) || id;
    (function w(l) { for (const o of l) {
      if (o.bind) { o.bind.rig = fix(o.bind.rig); if (o.bind.rigOf) for (const k in o.bind.rigOf) o.bind.rigOf[k] = fix(o.bind.rigOf[k]); }
      if (o.phys && o.phys.rig) o.phys.rig = fix(o.phys.rig);
      (o.cons || []).forEach(c => { c.target = fix(c.target); }); (o.drv || []).forEach(l => { l.ctrl = fix(l.ctrl); });
      if (o.children) w(o.children);
    } })(list);
  }
  SB.on('commit', () => { Sc.ver++; });
})(window.SB);
