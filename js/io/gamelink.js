/* Straight into your game project (Unity or Godot), and again to update it.
   The way Spine and Aseprite importers do it: the export writes its files into a fixed folder inside the project
   and later exports overwrite the same files with the same names and ids, so the engine reimports them and
   everything that uses them (scenes, prefabs, scripts) keeps its links.
     Unity   you pick the project folder (the one with Assets), or any folder inside Assets (then the project it is in is found
             with resolve(), asking for it once, and <folder> is set to that place); files go to Assets/<folder>/<project name>/
             and the shared scripts always to Assets/StoryboardStudio/ (one copy for every export), each with its .meta (the
             ids are made from the names, js/io/unity.js). Copies left in other places by older exports are found after
             writing (strays) and can be removed: Unity refuses two assemblies with the same name.
     Godot   you pick the project folder (the one with project.godot) or a folder inside it; files go to <folder>/<name>/ inside it
   <folder> is optional (Folder in the dialog, kept with the project in S.doc.gameFolder): a sub folder such as
   Art/Characters, so the export lands deeper in the project. The Unity package uses it too.
   A list of what was written (.toonzi-export.json, hidden from both engines) lets the next export remove files it no
   longer makes (a deleted layer's picture), only inside its own folder. Files that didn't change aren't touched.
   Needs the File System Access API (Chrome, Edge, Opera on a computer); elsewhere the export downloads a file as before.
   The chosen folder is remembered per project and engine in IndexedDB (the browser asks again for permission once a session). */
'use strict';
(function (SB) {
  const U = SB.util, S = SB.state, h = U.h, te = new TextEncoder();
  const LIST = '.toonzi-export.json';
  const supported = () => typeof window.showDirectoryPicker === 'function' && window.isSecureContext !== false;
  const keyOf = kind => kind + '|' + (S.project.name || 'Untitled');

  // ---------- remembering the folder (IndexedDB keeps the handle itself)
  const db = () => new Promise((ok, no) => { const r = indexedDB.open('toonzi-gamelink', 1); r.onupgradeneeded = () => r.result.createObjectStore('h'); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
  async function idb(mode, fn) { const d = await db(); return new Promise((ok, no) => { const t = d.transaction('h', mode), q = fn(t.objectStore('h')); t.oncomplete = () => ok(q && q.result); t.onerror = () => no(t.error); }); }
  const saved = async kind => { try { return await idb('readonly', s => s.get(keyOf(kind))); } catch (e) { return null; } };
  const remember = (kind, hnd) => idb('readwrite', s => s.put(hnd, keyOf(kind))).catch(() => {});
  const forget = kind => idb('readwrite', s => s.delete(keyOf(kind))).catch(() => {});

  const has = async (dir, name, kind) => { try { await (kind === 'dir' ? dir.getDirectoryHandle(name) : dir.getFileHandle(name)); return true; } catch (e) { return false; } };
  /** Is this the right kind of folder? Unity: has Assets; Godot: has project.godot. */
  const fits = async (kind, dir) => kind === 'unity' ? (await has(dir, 'Assets', 'dir')) && (dir.name.toLowerCase() !== 'assets' || await has(dir, 'ProjectSettings', 'dir')) : has(dir, 'project.godot', 'file'); // (an Assets folder with an Assets folder in it, from an older export, is not a project)
  const WHAT = { unity: 'your Unity project folder (the one with the Assets folder in it)', godot: 'your Godot project folder (the one with project.godot in it)' };

  const rootKey = kind => kind + '|root'; // the last project folder of this engine, for any Toonzi project
  const get = async k => { try { return await idb('readonly', s => s.get(k)); } catch (e) { return null; } };
  const keepRoot = (kind, dir) => { remember(kind, dir); idb('readwrite', s => s.put(dir, rootKey(kind))).catch(() => {}); };
  /** Where dir is inside root: ['Assets', 'Art'] (null when it isn't inside it). */
  const inside = async (root, dir) => { try { return await root.resolve(dir); } catch (e) { return null; } };
  const canWrite = async dir => { try { return (await dir.queryPermission({ mode: 'readwrite' })) === 'granted'; } catch (e) { return false; } };
  const askWrite = async dir => { try { return (await dir.requestPermission({ mode: 'readwrite' })) === 'granted'; } catch (e) { return false; } };
  const PRE = { unity: 'Assets/', godot: 'res://' };
  /** The export goes into folder parts (inside the project): set the Folder for this project. */
  function setFolder(kind, parts) { S.doc.gameFolder = Object.assign({}, S.doc.gameFolder, { [kind]: parts.join('/') }); SB.commit(); }

  /** Pick where the export goes: the project folder, or any folder inside it (then the project is found and Folder is set). */
  async function choose(kind) {
    if (!supported()) throw new Error('This browser can’t write into folders. Use Chrome or Edge on a computer, or download the file.');
    const dir = await window.showDirectoryPicker({ id: 'toonzi-' + kind, mode: 'readwrite' });
    if (await fits(kind, dir)) { keepRoot(kind, dir); return dir; }
    // a folder inside the project (Assets, Assets/Art/Characters…): the export writes from the project folder, so the
    // shared scripts stay in one place (Assets/StoryboardStudio) and nothing lands in a second Assets folder
    let root = null, parts = null;
    for (const k of [keyOf(kind), rootKey(kind)]) { const r = await get(k); if (r && (parts = await inside(r, dir))) { root = r; break; } }
    if (root && !(await canWrite(root))) { const ok = await SB.dialog.ask(`Write into ${root.name}?`, `${dir.name} is in your project ${root.name}. Toonzi writes from the project folder, so the shared files stay in one place.`, [{ v: 1, label: 'Allow', primary: true }]); if (!ok || !(await askWrite(root))) root = null; }
    if (!root) {
      const go = await SB.dialog.ask('Now pick the project folder', `The export goes into ${dir.name}. To keep the shared files in one place, Toonzi also needs ${WHAT[kind]} that ${dir.name} is in. Pick it next.`,
        [{ v: 1, label: 'Pick the project folder', primary: true }].concat(kind === 'godot' ? [{ v: 2, label: `Use ${dir.name} as the project` }] : []));
      if (go === 2) { keepRoot(kind, dir); return dir; } if (!go) return null;
      const r = await window.showDirectoryPicker({ id: 'toonzi-' + kind + '-root', mode: 'readwrite', startIn: dir });
      if (!(await fits(kind, r))) { SB.toast(`${r.name} has no ${kind === 'unity' ? 'Assets folder' : 'project.godot'}: pick ${WHAT[kind]}.`); return null; }
      parts = await inside(r, dir); if (!parts) { SB.toast(`${dir.name} isn’t inside ${r.name}. Pick a folder inside the project.`); return null; } root = r;
    }
    if (kind === 'unity') { if (parts[0] !== 'Assets') { SB.toast('Pick a folder inside Assets.'); return null; } parts = parts.slice(1); }
    setFolder(kind, parts); keepRoot(kind, root);
    SB.toast(`Exports go to ${PRE[kind]}${parts.length ? parts.join('/') + '/' : ''}${kind === 'unity' ? (S.project.name || 'Untitled') : U.slug(S.project.name || 'animation')}/ in ${root.name}.`);
    return root;
  }
  /** The remembered folder with write permission (asks for it, or for a folder: call this from a click). */
  async function ready(kind) {
    let dir = await saved(kind);
    if (dir) { try { const p = await dir.queryPermission({ mode: 'readwrite' }); if (p === 'granted' || (await dir.requestPermission({ mode: 'readwrite' })) === 'granted') return dir; } catch (e) { /* moved or gone */ } }
    return choose(kind);
  }

  /** Unity: copies of the shared scripts outside Assets/StoryboardStudio, and older exports of this project in other places
      (an export into a second Assets folder, or into a folder that was moved): Unity complains about the doubles. */
  async function strays(dir, own) {
    const out = [], A = await dirAt(dir, ['Assets'], false).catch(() => null); if (!A) return out; let n = 0;
    const mine = own.map(o => o.split('/').pop()), isShared = async d => (await has(d, 'StoryboardController.cs', 'file')) || (await has(d, 'ToonziParticles.cs', 'file')) || ((await has(d, 'Editor', 'dir')) && (await has(await d.getDirectoryHandle('Editor'), 'StoryboardStudio.Editor.asmdef', 'file')));
    const walk = async (d, path, depth, up) => { for await (const [name, hd] of d.entries()) {
      if (hd.kind !== 'directory' || name.startsWith('.') || ++n > 5000) continue; const p = path + '/' + name;
      if (name === 'StoryboardStudio' && p !== 'Assets/StoryboardStudio' && await isShared(hd)) { out.push({ path: p, parent: d, grand: up, name }); continue; }
      if (mine.includes(name) && !own.includes(p) && await has(hd, LIST, 'file')) { out.push({ path: p, parent: d, grand: up, name }); continue; }
      if (depth < 6) await walk(hd, p, depth + 1, d); } };
    try { await walk(A, 'Assets', 0, dir); } catch (e) { /* a folder we can't read */ }
    return out;
  }
  async function removeStrays(list) {
    let n = 0; for (const x of list) { try { await x.parent.removeEntry(x.name, { recursive: true }); await x.parent.removeEntry(x.name + '.meta').catch(() => {}); n++; } catch (e) { console.warn(e); } }
    for (const x of list) if (/^Assets\/Assets\/[^/]+$/.test(x.path)) { try { let empty = true; for await (const [k] of x.parent.entries()) { if (!k.startsWith('.')) { empty = false; break; } } if (empty) { const A = x.grand; if (A) { await A.removeEntry('Assets', { recursive: true }); await A.removeEntry('Assets.meta').catch(() => {}); } } } catch (e) { /* keep it */ } }
    return n;
  }

  async function dirAt(root, parts, make) { let d = root; for (const p of parts) d = await d.getDirectoryHandle(p, { create: make }); return d; }
  const bytesOf = async data => data instanceof Uint8Array ? data : typeof data === 'string' ? te.encode(data) : data instanceof Blob ? new Uint8Array(await data.arrayBuffer()) : new Uint8Array(data);
  const same = (a, b) => { if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; };

  /** Write files ([{ path: 'Assets/…' or '<name>/…', data }]) into the project; own: the folders this export owns (old files there may go). */
  async function write(kind, dir, files, own, prog) {
    let wrote = 0, kept = 0, removed = 0, merged = 0; const paths = new Set(files.map(f => f.path));
    const listDir = await dirAt(dir, own[0].split('/'), true); let before = [];
    try { before = JSON.parse(await (await (await listDir.getFileHandle(LIST)).getFile()).text()).files || []; } catch (e) { /* first time */ }
    // Unity: the clips this export no longer makes (their guids, from their .meta), so their states leave the Animator Controller
    const gone = [];
    if (kind === 'unity') for (const p of before) if (p.endsWith('.anim') && !paths.has(p)) { try { const parts = p.split('/'), name = parts.pop(), d = await dirAt(dir, parts, false), m = /\nguid: ([0-9a-f]{32})/.exec(await (await (await d.getFileHandle(name + '.meta')).getFile()).text()); if (m) gone.push(m[1]); } catch (e) { /* gone already */ } }
    for (let i = 0; i < files.length; i++) {
      if (S.cancelExport) throw 'cancel'; const f = files[i], parts = f.path.split('/'), name = parts.pop(); if (prog && i % 8 === 0) prog(0.93 + 0.06 * i / files.length, `Writing ${f.path}`);
      const d = await dirAt(dir, parts, true); if (f.dir) { await d.getDirectoryHandle(name, { create: true }); continue; }
      let data = await bytesOf(f.data), old = null; try { old = new Uint8Array(await (await (await d.getFileHandle(name)).getFile()).arrayBuffer()); } catch (e) { /* new file */ }
      if (old && kind === 'unity' && name.endsWith('.controller') && SB.unity && SB.unity.mergeController) { // keep your parameters, transitions and states: only add and remove the animations' states
        const m = SB.unity.mergeController(new TextDecoder().decode(old), new TextDecoder().decode(data), gone); data = te.encode(m); merged++; }
      if (old && same(old, data)) { kept++; continue; }
      const w = await (await d.getFileHandle(name, { create: true })).createWritable(); await w.write(data); await w.close(); wrote++;
    }
    // files the last export made here and this one didn't: gone (only inside its own folders)
    for (const p of before) {
      if (paths.has(p) || !own.some(o => p.startsWith(o + '/'))) continue; const parts = p.split('/'), name = parts.pop();
      try { const d = await dirAt(dir, parts, false); await d.removeEntry(name, { recursive: true }); removed++; for (const x of ['.import', '.uid']) await d.removeEntry(name + x).catch(() => {}); } catch (e) { /* already gone */ }
    }
    const lw = await (await listDir.getFileHandle(LIST, { create: true })).createWritable(); await lw.write(JSON.stringify({ app: 'Toonzi 2D', engine: kind, at: new Date().toISOString(), files: [...paths] }, null, 1)); await lw.close();
    return { wrote, kept, removed, merged, folder: dir.name, strays: kind === 'unity' ? await strays(dir, own) : [] };
  }

  /** The sub folder the export goes in (inside Assets for Unity, the project for Godot): 'Art/Characters' or ''. */
  function folder(kind) {
    const v = String(((S.doc && S.doc.gameFolder) || {})[kind] || '');
    let parts = v.replace(/^res:\/\//i, '').split(/[\\/]+/).map(x => x.trim().replace(/[<>:"|?*\u0000-\u001f]/g, '')).filter(x => x && x !== '.' && x !== '..');
    if (kind === 'unity' && parts[0] && parts[0].toLowerCase() === 'assets') parts = parts.slice(1);
    return parts.join('/');
  }
  /** The Folder row: where in the game project the export goes. */
  function folderRow(o, kind, refresh) {
    const name = kind === 'unity' ? (S.project.name || 'Untitled') : U.slug(S.project.name || 'animation');
    const inp = h('input.gf-in', { type: 'text', value: ((S.doc && S.doc.gameFolder) || {})[kind] || '', placeholder: 'Art/Characters', 'aria-label': 'Folder inside the game project', spellcheck: 'false' });
    const show = h('span.hint.gf-path'), upd = () => { const f = folder(kind); show.textContent = `→ ${kind === 'unity' ? 'Assets/' : 'res://'}${f ? f + '/' : ''}${name}/`; };
    inp.oninput = () => { S.doc.gameFolder = Object.assign({}, S.doc.gameFolder, { [kind]: inp.value }); upd(); };
    inp.onchange = () => SB.commit(); // (no redraw of the dialog here: it runs as the box loses focus)
    upd();
    return W().row('Folder', h('div.gfbox', null, h('span.gf-pre', null, kind === 'unity' ? 'Assets/' : 'res://'), inp,
      W().info([`A folder inside your ${kind === 'unity' ? 'Assets' : 'Godot project'} to put the export in, like Art/Characters. Empty: right at the top.`, 'Missing folders are made for you. It is kept with this project, so later exports go to the same place.'], 'Folder'), show));
  }
  /** The export dialog's row: download a file, or write into the game project. */
  function row(o, kind, refresh) {
    if (!supported()) return [W().row('Save', h('span.hint', null, 'A file to download. (In Chrome or Edge on a computer, the export can also go straight into your game project and update it.)')), kind === 'unity' ? folderRow(o, kind, refresh) : null];
    const box = h('span.hint'); saved(kind).then(d => { box.textContent = o.toProject ? (d ? `Project: ${d.name}` : 'You pick the folder when you export.') : ''; });
    return [W().row('Save', W().seg(o.toProject ? 'project' : 'file', [['file', 'A file', 'Download a file you import'], ['project', 'Into my project', 'Write straight into your game project; export again to update it']], v => { o.toProject = v === 'project'; refresh(); })),
      o.toProject ? W().row('', h('div.row.btns', null, box, W().btn('Change folder…', async () => { try { const d = await choose(kind); if (d) refresh(); } catch (e) { if (e && e.name !== 'AbortError') SB.toast(e.message || String(e)); } }, { cls: 'sm ghost', icon: 'folder' }),
        W().info([`Pick ${WHAT[kind]}, or any folder inside it (then Folder is set to it). Once is enough. Each export writes the same files with the same names, so the engine reimports them and your scenes keep their links (like updating a Spine or Aseprite file).`,
          kind === 'unity' ? 'Files go to Assets/<Folder>/<project name>/. Keep your own changes in a Prefab Variant of the exported prefab: it survives updates.' : 'Files go to <Folder>/<project name>/. Keep your own changes in an inherited scene (Scene › New Inherited Scene): it survives updates.',
          'Files it no longer makes (a deleted layer) are removed from that folder; nothing outside it is touched.'], 'Into my project'))) : null,
      kind === 'unity' || o.toProject ? folderRow(o, kind, refresh) : null];
  }
  const W = () => SB.w;
  SB.gameLink = { folder, supported, choose, ready, write, row, forget, saved, strays, removeStrays, LIST };
})(window.SB);
