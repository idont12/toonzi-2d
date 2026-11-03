/* Project files and autosave.
   - Autosave keeps the project and its media in this browser (IndexedDB), so a refresh loses nothing.
   - Save / Open use a single .json file that includes the media.
   - Files from the previous version of the app are upgraded on open (see migrate). */
'use strict';
(function (SB) {
  const U = SB.util, S = SB.state, tree = SB.tree, G = SB.paths;

  // ---------- IndexedDB (same database as the previous version, so its autosave carries over)
  const DB = {
    db: null,
    open() { return new Promise((res, rej) => { try { const r = indexedDB.open('storyboard-studio', 1); r.onupgradeneeded = () => { r.result.createObjectStore('kv'); r.result.createObjectStore('media'); }; r.onsuccess = () => { DB.db = r.result; res(); }; r.onerror = () => rej(r.error); } catch (e) { rej(e); } }); },
    tx(store, mode, fn) { return new Promise((res, rej) => { if (!DB.db) return rej(new Error('no storage')); const t = DB.db.transaction(store, mode), req = fn(t.objectStore(store)); t.oncomplete = () => res(req && req.result); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); }); },
    put: (s, k, v) => DB.tx(s, 'readwrite', st => st.put(v, k)), get: (s, k) => DB.tx(s, 'readonly', st => st.get(k)),
    all: s => DB.tx(s, 'readonly', st => st.getAll()), clear: s => DB.tx(s, 'readwrite', st => st.clear()), del: (s, k) => DB.tx(s, 'readwrite', st => st.delete(k)),
  };

  /** Upgrade an object from the previous version of the app. */
  function migrate(o, out) {
    if (!o.tracks) o.tracks = {};
    if (o.keys) { for (const k of o.keys) for (const P of SB.tracks.TRANSFORM) if (k[P] !== undefined) (o.tracks[P] = o.tracks[P] || []).push({ t: k.t, v: k[P], e: k.ease || 'smooth' }); for (const P in o.tracks) o.tracks[P].sort((a, b) => a.t - b.t); delete o.keys; }
    if (!o.play) o.play = o.loop === false ? 'once' : 'loop'; delete o.loop;
    if (o.frame == null) o.frame = 0; if (o.scx == null) o.scx = 1; if (o.scy == null) o.scy = 1; if (!o.effects) o.effects = []; if (!o.frames) o.frames = [];
    o.effects.forEach(e => { if (!e.id) e.id = U.uid(); if (e.on == null) e.on = true; });
    o.frames.forEach(f => { f.strokes = (f.strokes || []).map(G.migrate); });
    if (o.maskShow !== undefined || o.maskReveal !== undefined) { if (o.maskShow === 'visible') o.maskVisible = true; delete o.maskShow; delete o.maskReveal; }
    if (o.type === 'group') { if (o.seq && o.inPoint == null) o.inPoint = 0; o.children = migrateList(o.children, out); }
    if (o.type === 'rig') { o.bones = o.bones || []; o.frames = []; }
    if (o.type === 'null') o.frames = [];
    if (o.bind && o.locked && o.rigLock === undefined) { o.rigLock = true; o.locked = false; } // "Clicks pose the bones" became Rig lock
    if (o.type === 'draw' && SB.frames.morphToKeys) SB.frames.morphToKeys(o); // morph moved from the layer to its frame keyframes
    if (Array.isArray(o.segs) && o.segs.length) { // split parts from the previous version become parts of the same clip
      const ip0 = o.inPoint || 0; o.parts = o.segs.map(g => ({ a: g.t0, d: g.d, off: Math.max(0, (g.ip ?? ip0) - ip0) }));
      o.dur = Math.max(o.dur, ...o.parts.map(p => p.off + p.d));
      o.segs.forEach(g => (g.fx || []).forEach(e => { if (!o.effects.some(x => x.type === e.type)) o.effects.push(Object.assign(e, { id: U.uid() })); }));
      delete o.segs;
    }
    return [o];
  }
  const migrateList = (list, out) => (list || []).flatMap(o => migrate(o, out));

  let saveT = 0;
  const P = SB.project = {
    db: DB, migrate: migrateList,
    async init() {
      if (window.SB_PLAYER) { // an exported web page (js/io/webpage.js): the project is in the page, nothing is stored
        const d = window.SB_PLAYER; SB.player = true;
        for (const m of d.media || []) { try { await SB.media.add(U.dataURLToBlob(m.data), m.name, m.kind, m.id); } catch (e) { console.warn(e); } }
        P.load(d.project, d.objects, d.screens, d.active, d.doc); return;
      }
      try {
        await DB.open();
        const saved = await DB.get('kv', 'project'), prefs = await DB.get('kv', 'prefs2'), oldBrushes = await DB.get('kv', 'brushes');
        if (oldBrushes && oldBrushes.list && !(prefs && prefs.brushes)) { S.brushes = oldBrushes.list; S.brushId = oldBrushes.cur || S.brushes[0].id; }
        SB.prefs.load(prefs);
        if (saved && saved.objects) {
          for (const m of await DB.all('media') || []) { try { const mm = await SB.media.add(m.blob, m.name, m.kind, m.id); mm.saved = true; } catch (e) {} }
          P.load(saved.project, saved.objects, saved.screens, saved.active, saved.doc);
        }
      } catch (e) { console.warn('storage unavailable', e); }
    },
    /** Put a document into the editor (upgrading older files). */
    load(project, objects, screens, active, doc) {
      const out = {}; S.doc = doc || {}; SB.emit('doc');
      if (screens && screens.length) { const a = screens.find(s => s.active) || screens.find(s => s.id === active) || screens[0]; if (!a.active && a.proj) { project = a.proj; objects = a.objects; } screens = screens.map(s => s === a ? Object.assign({}, s, { active: true, proj: undefined, objects: undefined }) : Object.assign({}, s, { active: false })); }
      S.project = Object.assign(SB.defaultProject(), project); S.objects = migrateList(objects, out); S.ctx = null;
      SB.screens.restore(screens && screens.length ? screens : null, list => migrateList(list, out)); tree.reindex();
    },
    saveSoon() { clearTimeout(saveT); saveT = setTimeout(P.autosave, 700); },
    async autosave() {
      if (!DB.db) return;
      try {
        for (const m of SB.media.all()) if (!m.saved) { await DB.put('media', m.id, { id: m.id, kind: m.kind, name: m.name, blob: m.blob }); m.saved = true; }
        const d = JSON.parse(SB.snapshot()); await DB.put('kv', 'project', { project: d.p, objects: d.o, screens: d.s, doc: d.d, v: 6 });
      } catch (e) { console.warn('autosave failed', e); }
    },
    putPref(p) { if (DB.db) DB.put('kv', 'prefs2', p).catch(() => {}); },

    /** The whole project with its pictures and sounds, as saved in a file. */
    async pack() {
      const used = SB.media.used(), media = [];
      for (const id of used) { const m = SB.media.get(id); if (m) media.push({ id, kind: m.kind, name: m.name, data: await U.blobToDataURL(m.blob) }); }
      const d = JSON.parse(SB.snapshot()); return { app: 'storyboard-studio', v: 6, name: S.project.name, project: d.p, objects: d.o, screens: d.s, doc: d.d, media };
    },
    async save() {
      try {
        SB.toast('Packing the project…'); const blob = new Blob([JSON.stringify(await P.pack())], { type: 'application/json' });
        const ok = await SB.exporter.saveFile(U.slug(S.project.name) + '.json', blob); if (ok) P.remember(S.project.name, blob); return ok;
      } catch (e) { SB.toast("Couldn't save the project: " + (e.message || e)); return false; }
    },
    /** Logo › Save as an example file…: a script for the examples folder (see js/io/examples.js). */
    async saveExample() {
      try { const file = 'examples/' + U.slug(S.project.name) + '.js', d = await P.pack(); await SB.exporter.saveFile(file.slice(9), new Blob([SB.examples.fileText(file, d)], { type: 'text/javascript' })); SB.toast(`Put ${file.slice(9)} in the examples folder and list it in examples/index.js.`); }
      catch (e) { SB.toast("Couldn't make the example: " + (e.message || e)); }
    },
    // ---------- recent projects: a copy of each project you save or open (the last 8), kept in this browser
    async recent() { try { return (await DB.get('kv', 'recent')) || []; } catch (e) { return []; } },
    async remember(name, blob) {
      try { let list = await P.recent(); const old = list.find(r => r.name === name), id = old ? old.id : U.uid(); list = [{ id, name, at: Date.now(), size: blob.size }].concat(list.filter(r => r.id !== id));
        for (const r of list.slice(8)) await DB.del('kv', 'recent:' + r.id); await DB.put('kv', 'recent:' + id, blob); await DB.put('kv', 'recent', list.slice(0, 8)); } catch (e) { console.warn('recent', e); }
    },
    async openRecent(r) {
      try { const blob = await DB.get('kv', 'recent:' + r.id); if (!blob) throw new Error('That copy is gone.');
        if (S.objects.length && !(await SB.dialog.ask(`Open ${r.name}?`, 'It replaces the project in this browser. Save yours first if you want to keep it.', [{ v: 1, label: 'Open it' }]))) return;
        await P.openFile(blob, true); } catch (e) { SB.toast(e.message || "Couldn't open it."); }
    },
    openPicker() { SB.io.pick('.json,application/json', false, f => P.openFile(f[0])); },
    async openFile(f, fromRecent) {
      try { const text = await f.text(), d = JSON.parse(text); await P.openData(d); if (!fromRecent) P.remember(S.project.name, new Blob([text], { type: 'application/json' })); }
      catch (e) { SB.toast(e.message || "Couldn't open that file."); }
    },
    /** Open a packed project (a saved file, a recent copy or an example). */
    async openData(d, label) {
      if (!d || d.app !== 'storyboard-studio') throw new Error('This is not a Storyboard project.');
      await P.reset(true); SB.toast('Opening…');
      for (const m of d.media || []) { try { await SB.media.add(U.dataURLToBlob(m.data), m.name, m.kind, m.id); } catch (e) { console.warn(e); } }
      P.load(d.project, d.objects, d.screens, d.active, d.doc); SB.resetHistory(); SB.view.reset(); SB.invalidate(); P.autosave(); SB.toast(`Opened ${label || S.project.name}.`);
    },
    async reset(quiet) {
      if (S.recording) SB.record.stop(); SB.time.pause(); SB.textEdit.end();
      SB.media.clear(); S.objects = []; tree.select([]); S.solo = null; S.ctx = null; S.time = 0; S.project = SB.defaultProject(); S.doc = {}; SB.emit('doc'); SB.screens.restore(null);
      try { await DB.clear('media'); await DB.del('kv', 'project'); } catch (e) {}
      tree.reindex(); SB.resetHistory(); SB.view.reset(); SB.invalidate(); if (!quiet) P.saveSoon();
    },
    async newProject() {
      if (S.objects.length) { const v = await SB.dialog.ask('Start a new project?', 'This clears the current project from this browser. Save it as a file first if you want to keep it.', [{ v: 'save', label: 'Save first' }, { v: 'new', label: 'Start new', danger: true }]); if (!v) return; if (v === 'save' && !(await P.save())) return; }
      await P.reset(); SB.toast('New project ready.'); if (SB.targets) SB.targets.ask(null, { start: true });
    },
  };
  SB.on('commit', () => P.saveSoon());
  addEventListener('pagehide', () => P.autosave());
})(window.SB);
