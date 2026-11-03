/* Example projects and example objects kept in the examples/ folder of the app.
   examples/index.js lists them, one line each:
     SB.examples.add({ name: 'Walk cycle', kind: 'project', file: 'examples/walk-cycle.js', about: 'A rigged character walking' });
     SB.examples.add({ name: 'Cat', kind: 'object', file: 'examples/cat.js' });
   An example file is a small script, so it loads even when the page is opened straight from a folder (file://):
     SB.examples.data('examples/walk-cycle.js', { ...a saved project (Save project) or a saved object... });
   Make one from the app: logo › Save as an example file…, or the download button of a saved object (Saved objects).
   .json files work too when the page comes from a web server. Opened from the logo menu (Examples) and Saved objects. */
'use strict';
(function (SB) {
  const U = SB.util, S = SB.state, loaded = new Map(), waiting = new Map();
  const X = SB.examples = {
    list: [{ name: 'Toonzi 2D tour', kind: 'project', file: 'builtin:tour', about: 'Drawings, a rig, a controller and effects', builtin: () => SB.example.load() }], // made in js/example.js
    add(e) { if (e && e.file && !X.list.some(x => x.file === e.file)) X.list.push(Object.assign({ kind: 'project' }, e)); },
    projects: () => X.list.filter(e => e.kind !== 'object'),
    objects: () => X.list.filter(e => e.kind === 'object'),
    /** Called by an example file when it loads. */
    data(file, d) { loaded.set(file, d); const w = waiting.get(file); if (w) { waiting.delete(file); w.res(d); } },
    /** The contents of an example file. */
    load(e) {
      if (loaded.has(e.file)) return Promise.resolve(loaded.get(e.file));
      if (/\.json$/i.test(e.file)) return fetch(e.file).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }).catch(() => { throw new Error(`Couldn’t read ${e.file}. JSON examples need the page to come from a web server; save it as an example file (.js) instead.`); });
      return new Promise((res, rej) => {
        waiting.set(e.file, { res }); const s = U.h('script', { src: e.file });
        s.onerror = () => { waiting.delete(e.file); s.remove(); rej(new Error(`Couldn’t find ${e.file}. Put it in the examples folder.`)); };
        s.onload = () => setTimeout(() => { if (waiting.has(e.file)) { waiting.delete(e.file); rej(new Error(`${e.file} didn’t call SB.examples.data(…).`)); } }, 0);
        document.head.appendChild(s);
      });
    },
    async openProject(e) {
      if (e.builtin) return e.builtin();
      try { const d = await X.load(e); if (S.objects.length && !(await SB.dialog.ask(`Open ${e.name}?`, 'It replaces the project in this browser. Save yours first if you want to keep it.', [{ v: 1, label: 'Open it' }]))) return; await SB.project.openData(d, e.name); }
      catch (err) { SB.toast(err.message || String(err)); }
    },
    /** A saved object from the examples folder, ready to place or edit (a copy goes into this project's Saved objects). */
    async objectEntry(e) { const d = await X.load(e); return Object.assign({ name: e.name, w: S.project.w, h: S.project.h }, d, { id: 'rl' + U.uid(), at: Date.now() }); },
    /** The text of an example file for data d (a project or a saved object). */
    fileText(file, d) { return `/* Toonzi 2D example. List it in examples/index.js:\n   SB.examples.add({ name: ${JSON.stringify(d.name || file)}, kind: '${d.objects && !d.project ? 'object' : 'project'}', file: ${JSON.stringify(file)} }); */\nSB.examples.data(${JSON.stringify(file)}, ${JSON.stringify(d)});\n`; },
  };
})(window.SB);
