/* Screen templates and linked copies.
   - A screen saved as a template (s.tmpl = { name }) is the original. "Add a screen › From template"
     makes a child screen (s.from = original id) whose layers are linked copies (o.tpl = original id,
     o.link = the original layer's key).
   - Changes to the original (colors, drawings, positions, bones, binds, new or deleted layers, and the
     keyframes of values a copy hasn't animated itself) reach its children when you press Update (the
     original shows TEMPLATE • changed until then). A child keeps its own animation (keyframes),
     timing and visibility, and can add layers of its own, but can't delete the template's layers.
     So a rig starts from the same pose in every animation, which makes blending between them easy.
   - Saved rigs (js/rig/library.js) use the same sync to update every placed copy on request.
   SB.templates.syncInto(srcList, dstList, tag, opt) → new dst list (dst objects updated in place). */
'use strict';
(function (SB) {
  const U = SB.util, S = SB.state, tree = SB.tree;
  // what stays the copy's own: identity, its animation and timing, and how it is shown in the editor
  const OWN = new Set(['id', 'link', 'tpl', 'tplT', 'tracks', 'actions', 'start', 'dur', 'parts', 'phase', 'children', 'hidden', 'locked', 'showProps', 'collapsed', 'inPoint', 'rec', 'solo']);
  const keyOf = o => o.link || o.id;
  const same = (a, b) => a === b || JSON.stringify(a) === JSON.stringify(b);
  const walk = (list, fn) => { for (const o of list) { fn(o); if (o.children) walk(o.children, fn); } };

  const hash = str => { let x = 5381; for (let i = 0; i < str.length; i++) x = ((x << 5) + x + str.charCodeAt(i)) | 0; return (x >>> 0).toString(36); };
  const trackHash = tr => tr && tr.length ? hash(JSON.stringify(tr)) : '';
  /** Keyframes: a copy follows the original's animation of a value until it animates that value itself.
      d.tplT remembers what the original's keyframes were at the last update, per value. */
  function syncTracks(s, d) {
    const st = s.tracks || {}, dt = d.tracks || (d.tracks = {}), last = d.tplT || {}, next = {};
    for (const id of new Set([...Object.keys(st), ...Object.keys(dt)])) {
      const mine = trackHash(dt[id]), theirs = trackHash(st[id]), was = last[id] ?? (d.tplT ? '' : null);
      const untouched = was === null ? mine === theirs || !dt[id] : mine === was; // older copies: follow when they never animated it
      if (untouched) { if (st[id] && st[id].length) dt[id] = U.deep(st[id]); else delete dt[id]; }
      if (st[id] && st[id].length) next[id] = theirs;
    }
    d.tplT = next;
  }
  /** Copy the base values of s onto d (not its keyframes or timing). */
  function copyBase(s, d) {
    for (const k in s) if (!OWN.has(k) && !same(s[k], d[k])) d[k] = U.deep(s[k]);
    for (const k in d) if (!OWN.has(k) && !(k in s) && k[0] !== '_') delete d[k];
  }
  /** Point bindings, constraints and drivers at the copies in this screen. */
  function remapRefs(list, idMap) {
    const fix = id => idMap.get(id) || id;
    walk(list, o => {
      if (o.bind) { o.bind.rig = fix(o.bind.rig); if (o.bind.rigOf) for (const k in o.bind.rigOf) o.bind.rigOf[k] = fix(o.bind.rigOf[k]); }
      if (o.phys && o.phys.rig) o.phys.rig = fix(o.phys.rig);
      (o.cons || []).forEach(c => { c.target = fix(c.target); }); (o.drv || []).forEach(l => { l.ctrl = fix(l.ctrl); });
    });
  }
  /** A fresh linked copy of s (and its children). */
  function copyOf(s, tag, idMap, keys) {
    const d = U.deep(s);
    (function re(src, dst) { dst.link = keys.get(src) || keyOf(src); dst.id = U.uid(); if (tag) dst.tpl = tag; else delete dst.tpl; dst.tplT = {}; for (const id in src.tracks || {}) if (src.tracks[id] && src.tracks[id].length) dst.tplT[id] = trackHash(src.tracks[id]); idMap.set(src.id, dst.id); (src.children || []).forEach((c, i) => re(c, dst.children[i])); })(s, d);
    return d;
  }
  /** Make dst follow src. tag marks the copies (template id) and decides which dst layers belong to src. */
  function syncInto(src, dst, tag, opt = {}) {
    const keys = new Map(), seen = new Set(); walk(src, o => { let k = keyOf(o); if (seen.has(k)) k = o.id; seen.add(k); keys.set(o, k); });
    const mine = d => tag ? d.tpl === tag : opt.keys && opt.keys.has(d.link);
    const byKey = new Map(); walk(dst, d => { if (d.link && mine(d)) byKey.set(d.link, d); });
    const idMap = new Map();
    function list(sl, dl) {
      const out = [], own = []; let prev = null;
      for (const d of dl) { if (mine(d)) prev = d.link; else own.push([d, prev]); }
      for (const s of sl) {
        const k = keys.get(s); let d = byKey.get(k);
        if (!d) { d = copyOf(s, tag, idMap, keys); walk([d], x => byKey.set(x.link, x)); }
        else { copyBase(s, d); syncTracks(s, d); idMap.set(s.id, d.id); if (s.children) d.children = list(s.children, d.children || []); }
        out.push(d);
      }
      for (const [d, pk] of own) { const at = pk ? out.findIndex(x => x.link === pk) : -1; out.splice(at + 1, 0, d); }
      return out;
    }
    const out = list(src, dst); remapRefs(out, idMap); return out;
  }

  // ---------- screen templates
  const Sc = SB.screens;
  const T = SB.templates = {
    syncInto, copyBase, remapRefs, keyOf,
    list: () => (S.screens || []).filter(s => s.tmpl),
    of: s => s && s.from ? Sc.find(s.from) : null,
    children: m => (S.screens || []).filter(s => s.from === m.id),
    /** Save a screen as a template (it stays where it is and becomes the original). */
    make(s = Sc.active(), name) {
      Sc.sync(); s.tmpl = { name: name || s.name }; walk(s.objects, o => { if (!o.link) o.link = o.id; });
      SB.commit(); SB.toast(`${s.name} is a template. Add a screen › From template to start a new animation from it; changes here reach every copy.`);
    },
    unmake(s) { delete s.tmpl; T.children(s).forEach(c => { delete c.from; walk(c.objects, o => { delete o.tpl; }); }); SB.commit(); SB.toast(`${s.name} is a normal screen again. Its copies keep their layers.`); },
    /** A new screen from template m, next to the others. */
    addFrom(m) {
      Sc.sync(); const s = Sc.add('same'); s.proj = Object.assign(SB.defaultProject(), U.deep(m.proj)); s.name = `${m.tmpl.name} (${T.children(m).length + 2})`; s.from = m.id;
      s.objects = syncInto(m.objects, [], m.id); // new copies take the original's keyframes too, as a start
      if (!T.children(m).some(c => c !== s)) m.tmpl.pushed = T.sig(m); // the first copy: it starts up to date
      return s;
    },
    /** What the copies follow (the original's base values and layers, not its keyframes), as one string. */
    sig(m) { Sc.sync(); return JSON.stringify(m.objects || [], (k, v) => k === 'start' || k === 'dur' || k === 'parts' || k === 'phase' || k === 'hidden' || k === 'locked' || k === 'showProps' || k === 'collapsed' || k === 'rec' || k[0] === '_' ? undefined : v); },
    /** Has the original changed since its copies were last updated? */
    stale(m) { if (!m || !m.tmpl || !T.children(m).length) return false; if (m._sigAt !== Sc.ver) { m._sigAt = Sc.ver; m._sig = T.sig(m); } return m._sig !== m.tmpl.pushed; },
    /** Update every screen made from template m with its changes (one undo step). */
    push(m = Sc.active()) {
      if (!m || !m.tmpl) return 0; Sc.sync(); const kids = T.children(m);
      for (const c of kids) c.objects = syncInto(m.objects, c.objects || [], m.id);
      m.tmpl.pushed = T.sig(m); m._sigAt = -1; tree.reindex(); SB.commit(); SB.invalidate();
      SB.toast(`Updated ${kids.length} screen${kids.length === 1 ? '' : 's'} from ${m.tmpl.name}. Each keeps its own animation.`); return kids.length;
    },
    /** Template layers in a child screen can't be deleted there. */
    guard(items) {
      const s = Sc.active(), keep = items.filter(o => !(o.tpl && s && s.from === o.tpl) && !tree.ancestors(o).some(a => a.tpl && s && s.from === a.tpl));
      if (keep.length < items.length) { const m = T.of(s); SB.toast(`${items.length - keep.length === 1 ? 'That layer comes' : 'Those layers come'} from the template ${m ? m.tmpl.name : ''}. Delete ${items.length - keep.length === 1 ? 'it' : 'them'} there; this screen can hide ${items.length - keep.length === 1 ? 'it' : 'them'}.`); }
      return keep;
    },
    isTemplateLayer: o => { const s = Sc.active(); return !!(o && s && s.from && (o.tpl === s.from)); },
  };
  // a pill on the stage while the original has changes its copies don't have yet
  function pill() {
    const wrap = U.$('#stageWrap'); if (!wrap) return; let el = U.$('#tmplPill'); const m = Sc.active && S.screens ? Sc.active() : null, on = !!(m && T.stale(m));
    if (!on) { if (el) el.hidden = true; return; }
    if (!el) { el = U.h('div.tmpl-pill', { id: 'tmplPill' }); wrap.appendChild(el); }
    const n = T.children(m).length; el.hidden = false;
    el.replaceChildren(U.h('span', { html: SB.icon('library') }), U.h('span', null, `Template changed`), SB.w.btn(`Update ${n} screen${n === 1 ? '' : 's'}`, () => T.push(m), { cls: 'sm primary' }));
  }
  SB.on('commit', pill); SB.on('select', pill); SB.on('restore', pill);
  // a deleted original leaves normal screens behind
  SB.on('commit', () => { if (!S.screens) return; for (const s of S.screens) if (s.from && !Sc.find(s.from)) delete s.from; });
})(window.SB);
