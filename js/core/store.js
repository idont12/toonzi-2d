/* App state, events, registries, the redraw scheduler and undo history.

   - SB.state holds everything. The document (what gets saved) is
     SB.state.project + SB.state.objects; the rest is editor UI state.
   - Change the document, then call SB.commit() once the edit is finished:
     it records undo history and schedules autosave.
   - Call SB.invalidate('timeline', 'inspector', ...) to redraw panels on
     the next frame. SB.dirty() asks for a stage redraw only. */
'use strict';
(function (SB) {
  const U = SB.util;

  // ---------- registries: add a definition once, every panel picks it up
  SB.registry = function (name) {
    const map = new Map();
    return {
      name,
      add(def) { if (!def.id) throw new Error(name + ': missing id'); map.set(def.id, def); return def; },
      get: id => map.get(id),
      has: id => map.has(id),
      remove: id => map.delete(id),
      all: () => [...map.values()],
      where: fn => [...map.values()].filter(fn),
    };
  };
  SB.types = SB.registry('object types'); // draw, text, shape, image, video, audio, group
  SB.effects = SB.registry('effects');    // see js/effects/
  SB.tools = SB.registry('tools');        // see js/tools/
  SB.importers = SB.registry('importers');// see js/io/
  SB.actions = SB.registry('actions');    // commands with shortcuts, used by menus and keys

  // ---------- events
  const listeners = {};
  SB.on = (evt, fn) => { (listeners[evt] = listeners[evt] || []).push(fn); };
  SB.emit = (evt, data) => { for (const fn of listeners[evt] || []) { try { fn(data); } catch (e) { console.error(evt, e); } } };

  // ---------- state
  SB.defaultProject = () => ({ name: 'Untitled animation', w: 1920, h: 1080, fps: 24, duration: 10, bg: '#FFFFFF', bgImage: null, bgFit: 'cover', bgPosX: 50, bgPosY: 50, bgScale: 100, bgAlpha: 100, bgScrollX: 0, bgScrollY: 0 });
  SB.state = {
    project: SB.defaultProject(),
    objects: [],               // top of the list is the front-most layer
    sel: null,                 // primary selected object id
    multi: new Set(),          // all selected ids (includes sel)
    selKeys: new Map(),        // keyframe object -> { o, id }
    selStrokes: new Set(),     // selected drawing parts (points tool)
    selPts: [],                // selected path points (points tool): [{ s, si, i }]
    time: 0, playing: false, loop: true, recording: false, autoKey: false,
    tool: 'select', toolGroup: {},
    brush: { color: '#24213F', size: 8 }, brushId: 'pen', brushMode: 'free', smooth: 0.35, stab: false, stabR: 40,
    eraser: 28, fillGap: 3, softEdit: 40, smoothR: 40, smoothK: 0.5, widthR: 30, widthK: 0.5, widthMode: 'up', pullR: 60, eraseMode: 'mask', penFill: false,
    onion: true, onionOpt: { before: 1, after: 1, cb: '#FF4F8B', ca: '#18A999', alpha: 0.35 },
    zoom: 90, tlAnimOnly: false, solo: null, snap: true, recSmooth: 40,
    view: { z: 1, px: 0, py: 0 }, frameOverride: null, hover: null, guides: null,
    clip: null, fxClip: null, exporting: false, cancelExport: false,
    theme: 'auto', layout: 'auto', focus: false,
    ctx: null,                 // the shot open in the timeline (see tree.js)
    recentColors: [],
  };
  const S = SB.state;

  // ---------- scheduler: panels redraw at most once per frame
  const pending = new Set(); let raf = 0;
  const renderers = {};
  SB.panel = (name, fn) => { renderers[name] = fn; };
  SB.invalidate = (...names) => {
    if (!names.length) names = Object.keys(renderers);
    names.forEach(n => pending.add(n)); SB.dirty();
    if (!raf) raf = requestAnimationFrame(() => { raf = 0; const list = [...pending]; pending.clear(); for (const n of list) { try { renderers[n] && renderers[n](); } catch (e) { console.error('panel ' + n, e); } } });
  };
  let stageDirty = true;
  SB.dirty = () => { stageDirty = true; };
  SB.takeDirty = () => { const d = stageDirty; stageDirty = false; return d; };

  // ---------- frame stamp: bump when the document changes so caches refresh
  SB.stamp = 1;
  SB.bump = () => { SB.stamp++; stageDirty = true; };

  // ---------- history
  let hist = [], hi = -1;
  // S.doc holds what belongs to the whole project, not one screen: layer colors, designed transitions
  S.doc = S.doc || {};
  const snap = () => JSON.stringify({ p: S.project, o: S.objects, s: SB.screens ? SB.screens.meta() : null, d: S.doc }, (k, v) => k[0] === '_' ? undefined : v);
  /** Run just before each undo step is stored (templates push their changes into their copies here). */
  SB.beforeCommit = [];
  SB.commit = () => {
    SB.tree.normalize(); for (const f of SB.beforeCommit) { try { f(); } catch (e) { console.error(e); } }
    const s = snap(); if (hist[hi] === s) return;
    hist = hist.slice(0, hi + 1); hist.push(s); if (hist.length > 100) hist.shift(); hi = hist.length - 1;
    SB.emit('commit'); SB.invalidate();
  };
  SB.resetHistory = () => { hist = [snap()]; hi = 0; SB.emit('commit'); };
  const restore = s => {
    const d = JSON.parse(s), keep = S.scr; S.project = Object.assign(SB.defaultProject(), d.p); S.objects = d.o; S.doc = d.d || {}; SB.emit('doc');
    if (SB.screens) { SB.screens.restore(d.s); const k = SB.screens.find(keep); if (k && k.id !== S.scr) SB.screens.swapTo(k); else if (!k && SB.view) SB.view.fit(); } // undo keeps you on the screen you are looking at
    SB.tree.reindex();
    if (!SB.tree.find(S.sel)) S.sel = null; S.multi = new Set([...S.multi].filter(id => SB.tree.find(id)));
    S.selKeys.clear(); S.selStrokes.clear(); S.frameOverride = null; SB.bump(); SB.emit('restore'); SB.invalidate();
  };
  SB.undo = () => { if (hi > 0) { hi--; restore(hist[hi]); SB.emit('commit'); } };
  SB.redo = () => { if (hi < hist.length - 1) { hi++; restore(hist[hi]); SB.emit('commit'); } };
  /** Throw away edits since the last commit (used when a gesture cancels a drag). */
  SB.revert = () => { if (hist[hi]) restore(hist[hi]); };
  SB.canUndo = () => hi > 0;
  SB.canRedo = () => hi < hist.length - 1;
  SB.snapshot = snap;

  // ---------- toast
  let toastT = 0;
  SB.toast = msg => { const t = U.$('#toast'); if (!t) return; t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 3200); };
})(window.SB);
