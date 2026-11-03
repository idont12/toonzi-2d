/* Saved objects: keep any layers (a character, a rig with every layer that bends with it, rides on it
   or drives it, a prop, a group…) in the project, place them in any screen, and edit the saved
   original once to change every copy.
     save       right-click › Saved objects › Save as a saved object (a rig brings its layers along)
     place      File › Saved objects… › Place here (copies keep links, o.link, to the original)
     edit       the pencil: the original opens on its own editing screen; change colors, styles,
                drawings, bones, add or delete layers, then "Save and update everywhere" updates every copy
                in every screen (each copy keeps its own animation: keyframes are never overwritten)
   Copies keep the same links, so screens exported together to Unity or Godot are one character with
   one animation per screen. S.doc.rigs = [{ id, name, link, objects, w, h, at }] (the old name stays) */
'use strict';
(function (SB) {
  const U = SB.util, S = SB.state, h = U.h, W = SB.w, tree = SB.tree, Sc = SB.screens;
  const list = () => (S.doc.rigs = S.doc.rigs || []);
  const linkAll = o => { if (!o.link) o.link = o.id; (o.children || []).forEach(linkAll); };
  const walkL = (l, fn) => { for (const o of l) { fn(o); if (o.children) walkL(o.children, fn); } };
  const keyOf = o => o.link || o.id;

  /** A rig and everything that belongs to it (layers bending with it or riding on it, controllers). */
  function rigSet(rig, set) {
    const all = tree.all(), has = id => !!id && set.has(tree.find(id)); set.add(rig);
    for (let grew = true; grew;) {
      grew = false;
      for (const o of all) {
        if (set.has(o)) continue;
        const b = o.bind, linked = (b && (has(b.rig) || Object.values(b.rigOf || {}).some(has))) || (o.cons || []).some(c => has(c.target)) || (o.drv || []).some(l => has(l.ctrl)) || (o.phys && has(o.phys.rig));
        const drives = [...set].some(m => (m.drv || []).some(l => l.ctrl === o.id) || (m.cons || []).some(c => c.target === o.id));
        if (linked || drives) { set.add(o); grew = true; }
      }
    }
    return set;
  }
  /** What a selection saves: the top-level layers that hold it (rigs bring their layers), in layer order. */
  function members(items) {
    const set = new Set(); for (const o of [].concat(items)) { if (o.type === 'rig') rigSet(o, set); else set.add(o); walkL([o], x => { if (x.type === 'rig') rigSet(x, set); }); }
    const tops = new Set(); for (const o of set) { let x = o; while (tree.parentOf(x) && tree.parentOf(x).id !== S.ctx) x = tree.parentOf(x); tops.add(x); }
    return tree.rootList().filter(o => tops.has(o));
  }
  const topKeys = e => new Set(e.objects.map(keyOf));
  const editing = () => { const a = Sc.active(); return a && a.editOf ? list().find(e => e.id === a.editOf) : null; };

  const L = SB.rigLib = {
    list, members, editing, rigSet: rig => rigSet(rig, new Set()),
    /** Save the selection as a new saved object. */
    save(items = tree.selected()) {
      items = [].concat(items).filter(Boolean); if (!items.length) return SB.toast('Select what to save first.');
      const tops = members(items); tops.forEach(linkAll); const lead = items[0], name = tops.length === 1 ? tops[0].name : lead.name;
      const old = L.entryOf(lead); if (old) return L.update(lead);
      list().push({ id: 'rl' + U.uid(), name, link: keyOf(tops[0]), objects: U.deep(tops), w: S.project.w, h: S.project.h, at: Date.now() });
      SB.commit(); SB.toast(`${name} saved (${tops.length} layer${tops.length > 1 ? 's' : ''}). Place it in any screen; edit it with the pencil in Saved objects to change every copy.`);
    },
    /** Put a copy in the screen you work on, with the same links. */
    place(entry) {
      const objs = U.deep(entry.objects); Sc.remapIds(objs);
      const into = tree.rootList(); objs.slice().reverse().forEach(o => into.unshift(o));
      tree.reindex(); tree.select(objs.map(o => o.id)); SB.commit();
      SB.toast(`${entry.name} placed. Animate it here; edits to the saved object reach this copy too.`);
    },
    remove(entry) { S.doc.rigs = list().filter(e => e !== entry); SB.commit(); },
    /** The saved object a layer (or one of its groups) is a copy of. */
    entryOf(o) { if (!o) return null; const chain = [o, ...tree.ancestors(o)].map(keyOf); return list().find(e => { const t = topKeys(e); return chain.some(k => t.has(k)); }) || null; },
    /** Is o a copy of a saved object here? { entry, top } (top: o is the copy itself, not a layer inside it). */
    copyInfo(o) { const a = Sc.active && Sc.active(); if (!o || (a && a.editOf)) return null; const e = L.entryOf(o); return e ? { entry: e, top: topKeys(e).has(keyOf(o)) } : null; },
    /** How many screens hold a copy of it. */
    uses(entry) { Sc.sync(); const t = topKeys(entry); return (S.screens || []).filter(sc => !sc.editOf) .filter(sc => { let f = false; walkL(sc.objects || [], o => { if (o.link && t.has(o.link)) f = true; }); return f; }).length; },
    /** Save this copy's changes into the saved object, then into every copy. */
    update(o) {
      const entry = L.entryOf(o); if (!entry) return L.save(o);
      const tops = members([o]); tops.forEach(linkAll); L.commitEdit(entry, U.deep(tops), entry.name);
    },
    /** Make every copy follow the saved object (base values, styles, drawings, bones; not keyframes). */
    propagate(entry, gone = new Set()) {
      Sc.sync(); const keys = new Set(), tops = topKeys(entry); walkL(entry.objects, o => keys.add(keyOf(o))); let n = 0;
      for (const sc of S.screens || []) {
        if (sc.editOf) continue; const found = [];
        (function w(l) { for (let i = l.length - 1; i >= 0; i--) { const o = l[i]; if (o.link && gone.has(o.link)) { l.splice(i, 1); continue; } if (o.link && tops.has(o.link)) found.push([o, l]); else if (o.children) w(o.children); } })(sc.objects || []);
        if (!found.length) continue; found.reverse(); const dsts = found.map(f => f[0]), res = SB.templates.syncInto(entry.objects, dsts, null, { keys });
        const [first, plist] = found[0]; let at = plist.indexOf(first); res.forEach(d => { if (!dsts.includes(d)) plist.splice(at++, 0, d); }); n++;
      }
      tree.reindex(); SB.bump(); return n;
    },
    /** Store new contents for a saved object and update every copy (one undo step). */
    commitEdit(entry, objects, name) {
      const before = new Set(); walkL(entry.objects, o => before.add(keyOf(o))); objects.forEach(linkAll);
      const after = new Set(); walkL(objects, o => after.add(keyOf(o))); const gone = new Set([...before].filter(k => !after.has(k)));
      Object.assign(entry, { name: name || entry.name, objects, at: Date.now() }); const n = L.propagate(entry, gone);
      SB.commit(); SB.toast(`${entry.name} saved and updated in ${n} screen${n === 1 ? '' : 's'}. Each copy keeps its own animation.`); return n;
    },
    /** Open the saved object on its own editing screen. */
    edit(entry) {
      if (editing()) return SB.toast('Finish the saved object you are editing first.');
      Sc.sync(); const back = Sc.active(), s = Sc.add('same'), objs = U.deep(entry.objects); Sc.remapIds(objs);
      let len = 2; walkL(objs, o => { if (o.dur && o.start != null) len = Math.max(len, o.start + o.dur); });
      s.proj = Object.assign(SB.defaultProject(), { name: back.proj.name, w: entry.w || back.proj.w, h: entry.h || back.proj.h, fps: back.proj.fps, duration: Math.min(600, len), bg: back.proj.bg, target: back.proj.target });
      s.name = `Editing: ${entry.name}`; s.objects = objs; s.editOf = entry.id; s.back = back.id;
      SB.board.focus(s, true); SB.view.reset(); SB.commit(); bar();
    },
    /** Save the editing screen into the saved object and every copy, then go back. */
    finishEdit(save) {
      const s = Sc.active(), entry = editing(); if (!s || !entry) return;
      Sc.sync(); const back = Sc.find(s.back) || S.screens.find(x => x !== s), objs = U.deep(s.objects);
      if (back) { Sc.swapTo(back); SB.view.reset(); } // leave the editing screen first, then drop it
      S.screens.splice(S.screens.indexOf(s), 1); Sc.ver++;
      if (save) L.commitEdit(entry, objs); else { SB.commit(); SB.toast('Edit cancelled.'); }
      bar(); SB.invalidate();
    },
    /** The Saved objects dialog. */
    /** A saved object as a file for the examples folder (js/io/examples.js). */
    async saveExample(e) { const file = 'examples/' + U.slug(e.name) + '.js', d = { name: e.name, link: e.link, objects: e.objects, w: e.w, h: e.h }; await SB.exporter.saveFile(file.slice(9), new Blob([SB.examples.fileText(file, d)], { type: 'text/javascript' })); SB.toast(`Put ${file.slice(9)} in the examples folder and list it in examples/index.js (kind: 'object').`); },
    open() {
      let dlg = null; const sel = tree.selected(), ent = sel.length && L.entryOf(sel[0]);
      const thumb = e => { const c = h('canvas', { width: 112, height: 84 }); requestAnimationFrame(() => { try { drawThumb(c, e); } catch (err) { /* no thumbnail */ } }); return c; };
      const render = () => dlg.el.replaceChildren(h('h2', null, 'Saved objects'),
        h('p.sub', null, 'Save layers once, place them anywhere, and edit the saved one (the pencil) to update every copy. Each copy keeps its own animation.'),
        sel.length ? h('div.row.btns', null, ent ? W.btn(`Update “${ent.name}” everywhere from this copy`, () => { L.update(sel[0]); render(); }, { cls: 'sm', icon: 'save' }) : W.btn(sel.length > 1 ? `Save ${sel.length} layers` : `Save ${sel[0].name}`, () => { L.save(sel); render(); }, { cls: 'sm primary', icon: 'save' })) : h('p.hint.keep', null, 'Select layers to save them here.'),
        list().length ? h('div.rl-list', null, list().map(e => h('div.rl-item', null, thumb(e), h('div', null, h('b', null, e.name), h('small', null, `${countLayers(e.objects)} layers · in ${L.uses(e)} screen${L.uses(e) === 1 ? '' : 's'}`)),
          h('div.row', null, W.btn('Place here', () => { dlg.close(); L.place(e); }, { cls: 'sm' }), W.iconBtn('edit', 'Edit: change styles, colors and layers, then update every copy', () => { dlg.close(); L.edit(e); }, 'sm'),
            W.iconBtn('label', 'Rename', async () => { const v = await SB.dialog.prompt('Rename saved object', '', e.name); if (v) { e.name = v.trim() || e.name; SB.commit(); render(); } }, 'sm'), SB.examples ? W.iconBtn('export', 'Download as an example file (for the examples folder)', () => L.saveExample(e), 'sm') : null, W.iconBtn('trash', 'Remove from Saved objects (copies stay)', () => { L.remove(e); render(); }, 'sm')))))
          : h('p.hint.keep', null, 'Nothing saved yet.'),
        ...(exList() || []),
        h('div.sheet-actions', null, W.btn('Done', () => dlg.close(), { cls: 'primary' })));
      /** Examples from the examples folder: place one, or copy it into this project's Saved objects and edit it. */
      function exList() {
        const ex = SB.examples ? SB.examples.objects() : []; if (!ex.length) return null;
        const go = async (e, how) => { try { const ent = await SB.examples.objectEntry(e); if (how !== 'place') { list().push(ent); SB.commit(); } dlg.close(); if (how === 'place') L.place(ent); else if (how === 'edit') L.edit(ent); else { SB.toast(`${ent.name} added to Saved objects.`); L.open(); } } catch (err) { SB.toast(err.message || String(err)); } };
        return [h('h3', null, 'Examples'), h('p.sub', null, 'From the examples folder of the app. Edit one to make it your own: it is copied into this project first.'),
          h('div.rl-list', null, ex.map(e => h('div.rl-item', null, h('span.rl-ex', { html: SB.icon('library') }), h('div', null, h('b', null, e.name), e.about ? h('small', null, e.about) : null),
            h('div.row', null, W.btn('Place here', () => go(e, 'place'), { cls: 'sm' }), W.iconBtn('edit', 'Edit a copy of it', () => go(e, 'edit'), 'sm'), W.iconBtn('plus', 'Add to my saved objects', () => go(e, 'add'), 'sm')))))];
      }
      dlg = SB.dialog.sheet(h('div'), { size: 'mid' }); render(); return dlg;
    },
  };
  const countLayers = objs => { let n = 0; walkL(objs, () => n++); return n; };
  /** A small picture of a saved object, drawn by the renderer on its own copy. */
  function drawThumb(c, e) {
    const x = c.getContext('2d'), k = Math.min(c.width / (e.w || 640), c.height / (e.h || 360));
    const objs = U.deep(e.objects), keep = S.objects; let box = null;
    try { S.objects = objs; tree.reindex(); SB.stamp++; for (const o of tree.all()) { const b = SB.scene.box && SB.types.get(o.type).visual && SB.types.get(o.type).render !== false ? SB.scene.box(o) : null; if (b) box = box ? U.growBox(U.growBox(box, b.aabb.x0, b.aabb.y0), b.aabb.x1, b.aabb.y1) : b.aabb; }
      const bk = box ? Math.min(c.width / Math.max(1, box.x1 - box.x0), c.height / Math.max(1, box.y1 - box.y0)) * 0.9 : k;
      const M = box ? new DOMMatrix([bk, 0, 0, bk, c.width / 2 - (box.x0 + box.x1) / 2 * bk, c.height / 2 - (box.y0 + box.y1) / 2 * bk]) : new DOMMatrix([k, 0, 0, k, 0, 0]);
      SB.scene.renderList(x, objs, 0, M, { T: 0 }, M.a, 0); }
    finally { S.objects = keep; tree.reindex(); SB.stamp++; }
  }
  /** The bar on the stage while a saved object is open for editing. */
  function bar() {
    const wrap = U.$('#stageWrap'); if (!wrap) return; let el = U.$('#editBar'); const e = editing();
    if (!e) { if (el) el.hidden = true; return; }
    if (!el) { el = h('div.edit-bar', { id: 'editBar' }); wrap.appendChild(el); }
    el.hidden = false; el.replaceChildren(h('span', { html: SB.icon('library') }), h('span', null, h('b', null, e.name), ' · editing the saved object'), W.info('Change colors, styles, drawings and bones, add or delete layers. Save sends it to every copy in every screen; each copy keeps its own animation.'),
      W.btn('Cancel', () => L.finishEdit(false), { cls: 'sm ghost' }), W.btn('Save and update everywhere', () => L.finishEdit(true), { cls: 'sm primary' }));
  }
  SB.on('commit', bar); SB.on('restore', bar); SB.on('select', bar);

  // ---------- where to find it
  SB.menus.extra.push((o, items) => { const def = SB.types.get(o.type); if (!def || !def.visual) return null; const e = L.entryOf(o);
    return { label: 'Saved objects', icon: 'library', sub: [e ? { label: `Edit “${e.name}” (all copies)…`, icon: 'edit', run: () => L.edit(e) } : { label: 'Save as a saved object', icon: 'save', run: () => L.save(items) },
      e ? { label: 'Update the saved object from this copy', run: () => L.update(o) } : null, { label: 'Open Saved objects…', run: () => L.open() }].filter(Boolean) }; });
  // tags that say a layer is a copy of a saved object, in the timeline and the panel
  const tip = e => `A copy of the saved object ${e.name}. Edit it in File › Saved objects to change every copy; animate this copy here.`;
  SB.timeline.extraBadges.push(o => { const c = L.copyInfo(o); return c && c.top ? `<span class="cl-badge saved" title="${U.esc(tip(c.entry))}">copy of ${U.esc(c.entry.name)}</span>` : ''; });
  if (SB.inspector) SB.inspector.badges.push(o => { const c = L.copyInfo(o); if (!c) return null; return h('span.badge.saved', { title: tip(c.entry), html: SB.icon('library') + U.esc(c.top ? `Copy of ${c.entry.name}` : `Part of ${c.entry.name}`) }); });
})(window.SB);
