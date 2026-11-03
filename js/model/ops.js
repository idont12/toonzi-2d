/* Editing commands on layers: delete, duplicate, split, group, keyframes, masks,
   copy/paste, align. Each command finishes with SB.commit() so it can be undone. */
'use strict';
(function (SB) {
  const U = SB.util, S = SB.state, TR = SB.tracks, tree = SB.tree, X = SB.xf, G = SB.paths;
  const toast = SB.toast, visual = o => !!o && SB.types.get(o.type).visual;

  const ops = SB.ops = {
    remove(items = tree.selected()) {
      if (SB.templates) items = SB.templates.guard(items);
      if (!items.length) return;
      items.forEach(o => { const l = tree.listOf(o), i = l.indexOf(o); if (i >= 0) l.splice(i, 1); });
      const gone = new Set(items.flatMap(o => tree.all([o]).map(x => x.id)));
      tree.all().forEach(o => { if (o.bind && gone.has(o.bind.rig)) delete o.bind; if (o.phys && gone.has(o.phys.rig)) o.phys.rig = null; });
      tree.select([]); tree.reindex(); SB.media.prune(); SB.commit();
      toast(items.length > 1 ? `Deleted ${items.length} layers.` : `Deleted ${items[0].name}.`);
    },
    /** Copies of the layers just above each one (off: how far they shift, 0 for Alt-drag). Returns the copies. */
    /** The tweened (smooth) motion of each layer, turned into held steps like hand-drawn animation: between its first and last
        keyframe (or the selected keyframes) every animated value is sampled once per picture and held until the next one.
        opt: { every } frames each picture is held, or { count } pictures over the span. Returns the number of layers changed. */
    tweenToFrames(items = tree.selected(), opt = {}) {
      const fps = S.project.fps, F = t => U.r3(Math.round(t * fps) / fps); let n = 0;
      for (const o of items) {
        const ids = Object.keys(o.tracks || {}).filter(id => { const ty = SB.tracks.type(id); return (ty === 'num' || ty === 'color') && o.tracks[id].length > 1; }); if (!ids.length) continue;
        const sel = [...S.selKeys].filter(([, w]) => w.o === o).map(([k]) => k.t), all = ids.flatMap(id => o.tracks[id].map(k => k.t));
        const span = sel.length > 1 ? sel : all, a = Math.min(...span), b = Math.max(...span); if (!(b - a > 1 / fps / 2)) continue;
        let times = [];
        if (opt.count) { const c = Math.max(1, Math.round(opt.count)), d = (b - a) / c; for (let i = 0; i < c; i++) times.push(F(a + i * d)); }
        else { const st = Math.max(1, Math.round(opt.every || 2)) / fps; for (let t = a; t < b - 1e-6; t += st) times.push(F(t)); }
        times = [...new Set(times)].filter(t => t < b - 1e-6);
        for (const id of ids) {
          const tr = o.tracks[id], first = tr[0].t, last = tr[tr.length - 1].t; if (last <= a + 1e-6 || first >= b - 1e-6) continue; // this value doesn't move in the span
          const endKey = tr.find(k => Math.abs(k.t - b) < 1e-4), vals = times.map(t => SB.tracks.value(o, id, t)), vb = SB.tracks.value(o, id, b);
          const keep = tr.filter(k => k.t < a - 1e-4 || k.t > b + 1e-4);
          o.tracks[id] = keep.concat(times.map((t, i) => ({ t, v: vals[i], e: 'hold' })), [Object.assign({}, endKey || {}, { t: F(b), v: vb, e: endKey ? endKey.e || 'linear' : 'hold' })]).sort((x, y) => x.t - y.t);
          SB.tracks.tidy(o);
        }
        n++;
      }
      if (n) { S.selKeys.clear(); SB.commit(); }
      return n;
    },
    duplicate(items = tree.selected(), off = 40) {
      if (!items.length) return []; const ids = [], out = [];
      items.forEach(o => {
        const c = U.deep(o); tree.reid(c); c.name = o.name + ' copy';
        if (visual(o) && off) { (c.tracks.x || []).forEach(k => k.v += off); (c.tracks.y || []).forEach(k => k.v += off); c.x += off; c.y += off; }
        const l = tree.listOf(o); l.splice(l.indexOf(o), 0, c); ids.push(c.id); out.push(c);
      });
      tree.reindex(); tree.select(ids); SB.commit(); return out;
    },
    /** Cut a clip at time t (on its parent's clock). Like Premiere: the layer stays one row and gets
        two parts that can be moved, trimmed or deleted on their own (see o.parts in tree.js). */
    cutAt(o, t) {
      if (!o.parts || !o.parts.length) o.parts = [{ a: o.start, d: o.dur, off: 0 }];
      const p = tree.partAt(o, t); if (!p || t - p.a < 0.02 || p.a + p.d - t < 0.02) return false;
      const c = U.r3(t - p.a); o.parts.splice(o.parts.indexOf(p) + 1, 0, { a: U.r3(t), d: U.r3(p.d - c), off: U.r3(p.off + c) }); p.d = c; SB.bump(); return true;
    },
    /** Cut the selected clips at the playhead, or every clip under the playhead when nothing is selected. */
    split(o) {
      const items = o ? [o] : tree.selected().length ? tree.selected() : tree.rootList().filter(x => tree.inRange(x));
      let n = 0; for (const x of items) if (tree.inRange(x) && ops.cutAt(x, tree.parentTime(x, S.time))) n++;
      if (!n) return toast(items.length ? 'Move the playhead over a clip to cut it.' : 'Nothing under the playhead to cut.');
      SB.commit(); toast(n > 1 ? `Cut ${n} clips.` : 'Cut. Each part moves, trims and deletes on its own.');
    },
    /** Delete one part of a cut clip (the last part deletes the layer). */
    removePart(o, i) {
      if (!o.parts || o.parts.length < 2) return ops.remove([o]);
      o.parts.splice(i, 1); S.selPart = null; SB.commit(); toast('Part deleted.');
    },
    /** Put a cut clip back together as one clip. */
    joinParts(o) { if (!o.parts) return; const f = o.parts.slice().sort((x, y) => x.a - y.a)[0]; delete o.parts; o.start = U.r3(f.a - f.off); SB.commit(); toast('Parts joined into one clip.'); },
    order(dir, o = tree.sel()) {
      if (!o) return; const a = tree.listOf(o), i = a.indexOf(o); a.splice(i, 1);
      const j = dir === 'front' ? 0 : dir === 'back' ? a.length : U.clamp(i + (dir === 'fwd' ? -1 : 1), 0, a.length);
      a.splice(j, 0, o); SB.commit();
    },
    group(items = tree.selected()) {
      if (!items.length) return toast('Select layers first. Shift-click to pick several.');
      const p = tree.parentOf(items[0]);
      if (items.some(x => tree.parentOf(x) !== p)) return toast('Pick layers at the same level to group them.');
      const list = p ? p.children : S.objects; items.sort((a, b) => list.indexOf(a) - list.indexOf(b));
      const idx = list.indexOf(items[0]), b = U.emptyBox();
      items.forEach(x => { if (!visual(x)) return; const lb = SB.scene.bounds(x); if (!lb) return; const M = X.local(x); [[lb.x0, lb.y0], [lb.x1, lb.y0], [lb.x1, lb.y1], [lb.x0, lb.y1]].forEach(([u, v]) => { const q = M.transformPoint(U.pt(u, v)); U.growBox(b, q.x, q.y); }); });
      const cx = U.boxOk(b) ? U.r1((b.x0 + b.x1) / 2) : (p ? 0 : S.project.w / 2), cy = U.boxOk(b) ? U.r1((b.y0 + b.y1) / 2) : (p ? 0 : S.project.h / 2);
      items.forEach(x => list.splice(list.indexOf(x), 1));
      const g = tree.makeGroup(items, null, cx, cy, true);
      list.splice(Math.min(idx, list.length), 0, g); tree.reindex(); tree.select([g.id]); SB.commit();
      toast(`Grouped ${items.length} layer${items.length > 1 ? 's' : ''}.`);
      return g;
    },
    ungroup(g = tree.sel()) {
      if (SB.templates && SB.templates.isTemplateLayer(g)) return SB.toast('This group comes from the screen template. Ungroup it there.');
      if (!g || g.type !== 'group') return toast('Select a group to ungroup it.');
      const list = tree.listOf(g), idx = list.indexOf(g), D = X.local(g), lost = TR.anyKeys(g) || g.effects.length;
      g.children.forEach(c => { X.applyMatrix(c, D); delete c.isMask; delete c.maskVisible; if (g.seq) c.start = U.r3(c.start + g.start - (g.inPoint || 0)); }); list.splice(idx, 1, ...g.children);
      tree.reindex(); tree.select(g.children.map(c => c.id)); SB.commit();
      toast(lost ? "Ungrouped. The group's own keyframes and effects were removed." : 'Ungrouped.');
    },
    // ---------- shots: groups with their own time, edited like clips (see tree.js)
    /** Turn the selected layers into a shot. */
    makeShot(items = tree.selected()) {
      if (!items.length) return toast('Select layers first, then make a shot from them.');
      if (items.length === 1 && items[0].type === 'group' && !items[0].seq) items = [items[0]];
      const g = items.length === 1 && items[0].type === 'group' && !items[0].seq ? items[0] : ops.group(items); if (!g) return;
      g.seq = true; g.inPoint = 0; g.collapsed = true; g.name = `Shot ${tree.all().filter(x => x.seq).length}`;
      g.children.forEach(c => (function shift(x) { x.start = U.r3(x.start - g.start); })(c));
      SB.commit(); toast(`${g.name} made. Move and trim it like a clip, double-click it to edit inside.`); return g;
    },
    /** A new empty shot at the playhead, opened for editing. */
    newShot() {
      const p = S.project, g = tree.make('group', { seq: true, inPoint: 0, children: [], x: tree.ctx() ? 0 : p.w / 2, y: tree.ctx() ? 0 : p.h / 2, dur: 4, collapsed: true, frames: [] });
      g.name = `Shot ${tree.all().filter(x => x.seq).length + 1}`; tree.add(g); tree.enter(g); return g;
    },
    /** Make a shot exactly as long as what is inside it. */
    fitShot(g) { if (!g || !g.seq || !g.children.length) return; const a = Math.min(...g.children.map(c => c.start)), b = Math.max(...g.children.map(c => c.start + c.dur)); g.inPoint = U.r3(Math.max(0, a)); g.dur = U.r3(Math.max(0.1, b - g.inPoint)); SB.commit(); },
    /** Put the shots at this level one after another, in their current order. */
    lineUpShots() {
      const shots = tree.rootList().filter(x => x.seq).sort((a, b) => a.start - b.start); if (shots.length < 2) return toast('Make two or more shots first.');
      let t = shots[0].start; shots.forEach(q => { q.start = U.r3(t); t += q.dur; }); SB.commit(); toast(`Lined up ${shots.length} shots end to end.`);
    },
    /** Put a video's sound on its own audio layer (just below it), so you can move, cut and trim them apart. */
    /** Main times of the keyframes of the selected layers (and what is inside them), or of every layer. */
    keyTimes() {
      const sel = tree.selected(), list = sel.length ? [...new Set(sel.flatMap(o => [o].concat(o.children ? tree.all(o.children) : [])))] : tree.all(), out = new Set();
      list.forEach(o => TR.times(o).forEach(t => { const m = tree.mainAt(o, t); if (isFinite(m)) out.add(Math.round(m * 1e4) / 1e4); }));
      return [...out].sort((a, b) => a - b);
    },
    /** Move the playhead to the previous (dir -1) or next (dir 1) keyframe. */
    goKey(dir) {
      const ts = ops.keyTimes(), eps = 0.5 / S.project.fps, t = dir > 0 ? ts.find(x => x > S.time + eps) : ts.slice().reverse().find(x => x < S.time - eps);
      if (t == null) return toast(dir > 0 ? 'No keyframe after the playhead.' : 'No keyframe before the playhead.'); SB.time.pause(); SB.time.set(t + 0.0001);
    },
    /** Mirror the selected layers (h: left–right, v: up–down) by flipping their stretch. */
    flip(axis) { const id = axis === 'h' ? 'scx' : 'scy'; tree.selected().forEach(x => { if (SB.types.get(x.type).visual) TR.set(x, id, -TR.now(x, id)); }); SB.commit(); },
    splitSound(o) {
      if (o.type !== 'video' || (o.soundSplit && tree.find(o.soundSplit))) return; const keep = ['speed', 'paused', 'showAt', 'volume'], tr = {}; keep.forEach(k => { if (o.tracks[k]) tr[k] = U.deep(o.tracks[k]); });
      const a = tree.make('audio', { name: o.name + ' (sound)', mediaId: o.mediaId, start: o.start, dur: o.dur, inPoint: o.inPoint || 0, speed: o.speed, paused: o.paused, volume: TR.base(o, 'volume'), tracks: tr });
      if (o.parts) a.parts = U.deep(o.parts);
      const list = tree.listOf(o); list.splice(list.indexOf(o) + 1, 0, a); o.volume = 0; delete o.tracks.volume; o.soundSplit = a.id; tree.reindex(); SB.commit(); SB.media.sync(S.playing, true);
      toast('The sound is its own layer now. The video is muted.');
    },
    /** Move layers into group (or shot) g, keeping where they are on the stage and in time. */
    moveInto(g, items = tree.selected()) {
      let n = 0; items.forEach(o => { if (o === g || tree.isDesc(g, o) || tree.parentOf(o) === g) return; X.reparent(o, g, 0); n++; });
      if (n) { tree.reindex(); tree.select(items.map(o => o.id)); SB.commit(); toast(`Moved ${n} layer${n > 1 ? 's' : ''} into ${g.name}.`); }
    },
    outOfGroup(items = tree.selected()) {
      let n = 0; items.forEach(o => { const p = tree.parentOf(o); if (!p) return; const gp = tree.parentOf(p), gl = gp ? gp.children : S.objects; X.reparent(o, gp, gl.indexOf(p)); n++; });
      if (n) { SB.commit(); toast(`Moved ${n} layer${n > 1 ? 's' : ''} out of the group.`); }
    },

    // ---------- keyframes
    keyNow(o) {
      const lt = tree.localTime(o), v = TR.transform(o, lt);
      if (o._pend && Math.abs(o._pend.t - lt) <= TR.tol()) for (const id in Object.assign({}, o._pend.v)) TR.put(o, id, lt, o._pend.v[id]); // changes waiting for a keyframe
      ['x', 'y', 'scale', 'scx', 'scy', 'rot', 'opacity'].concat(TR.animated(o, 'ax') || TR.animated(o, 'ay') ? ['ax', 'ay'] : []).forEach(P => TR.put(o, P, lt, ['scale', 'scx', 'scy'].includes(P) ? U.r3(v[P]) : U.r2(v[P])));
      if (['shape', 'image', 'video'].includes(o.type)) ['w', 'h'].forEach(P => TR.put(o, P, lt, U.r1(TR.value(o, P, lt))));
      if (o.type === 'rig') o.bones.forEach(b => SB.rig.boneProps(o, b, true).forEach(([id]) => TR.put(o, id, lt, U.r3(TR.value(o, id, lt)))));
      if (o.play === 'library' && o.frames && o.frames.length > 1) { TR.put(o, 'frame', lt, SB.frames.index(o, lt), 'hold'); if (S.frameOverride && S.frameOverride.id === o.id) S.frameOverride = null; } // the frame picked in the library
      SB.emit('keyNow', o);
    },
    addKey() {
      const sel = tree.selected().filter(visual); if (!sel.length) return toast('Select a layer to add a keyframe.');
      const first = sel.every(o => !TR.anyKeys(o)); if (sel.length === 1 && !tree.inRange(sel[0])) tree.goLocal(sel[0], 0.0001);
      sel.forEach(o => ops.keyNow(o)); SB.commit();
      toast(first ? 'Keyframe added. Move the playhead, then move or change the layer to animate it.' : sel.length > 1 ? `Keyframed ${sel.length} layers.` : 'Keyframe saved at the playhead.');
    },
    deleteKeys() {
      if (!S.selKeys.size) return false; const n = S.selKeys.size;
      for (const [k, { o, id }] of S.selKeys) TR.remove(o, id, k);
      S.selKeys.clear(); SB.commit(); toast(`Deleted ${n} keyframe${n > 1 ? 's' : ''}.`); return true;
    },

    // ---------- masks
    makeMask(items = tree.selected()) {
      if (!items.length) return; if (SB.targets && !SB.targets.allows('mask')) return SB.targets.blocked('Masks'); const list = tree.listOf(items[0]); let mask, g;
      if (items.length >= 2) { items.sort((a, b) => list.indexOf(a) - list.indexOf(b)); mask = items[0]; g = ops.group(items); }
      else { // always a new group: the mask and the one layer under it (also inside a group: the new group sits where they were)
        mask = items[0]; const below = list[list.indexOf(mask) + 1];
        if (!below) return toast('Put a layer below this one first, then make the mask.'); g = ops.group([mask, below]); if (g) g.name = 'Masked ' + below.name;
      }
      if (!g) return; g.children.forEach(c => { delete c.isMask; delete c.maskVisible; }); const m = g.children.find(c => c.id === mask.id); if (!m) return;
      m.isMask = 'in'; m.maskVisible = false; g.collapsed = false; tree.select([m.id]); SB.commit(); toast(`${m.name} is now a mask. Choose Inside or Outside, and whether its shape shows.`);
    },

    // ---------- conversions
    shapeToPath(o) {
      if (!o || o.type !== 'shape') return null;
      // every frame becomes a drawing frame: the shape as a path, with that frame's own lines on top. If the shape's size or
      // colors are animated, each frame takes the shape as it looks the first time that frame shows (else as it looks now).
      const SH = ['w', 'h', 'radius', 'fill', 'stroke', 'strokeW'], def = SB.types.get('shape'), lt0 = tree.localTime(o), anim = SH.some(id => TR.animated(o, id));
      const firstShown = i => { if (!anim || o.frames.length < 2) return lt0; if (SB.frames.index(o, lt0) === i) return lt0; const st = 1 / (S.project.fps || 24); for (let t = 0; t <= o.dur + 1e-6; t += st) if (SB.frames.index(o, t) === i) return t; return lt0; };
      const src = o.frames && o.frames.length ? o.frames : [{ strokes: [] }];
      const frames = src.map((fr, i) => Object.assign(U.deep(fr), { strokes: [def.asPath(SB.scene.viewOf(o, firstShown(i)))].concat(U.deep(fr.strokes || [])) }));
      const tracks = {}; for (const id in o.tracks) if (!SH.includes(id)) tracks[id] = o.tracks[id];
      const d = Object.assign(U.deep(o), { type: 'draw', tracks, frames });
      ['shape', 'w', 'h', 'radius', 'sides', 'fill', 'fillOn', 'stroke', 'strokeW'].forEach(k => delete d[k]);
      const l = tree.listOf(o); l.splice(l.indexOf(o), 1, d); tree.reindex(); tree.select([d.id]); SB.commit();
      toast(frames.length > 1 ? `Now a drawing with ${frames.length} editable frames. Double-click to move points.` : 'Now an editable path. Double-click it to move its points.'); return d;
    },
    join(items = tree.selected()) {
      if (items.length < 2) return toast('Select two or more drawing layers to join them.');
      if (items.some(o => o.type !== 'draw')) return toast('Only drawing layers can be joined.');
      const order = tree.all(); items.sort((a, b) => order.indexOf(a) - order.indexOf(b)); const T = items[0], WT = X.world(T).inverse();
      const n = Math.max(...items.map(o => o.frames.length)), frames = Array.from({ length: n }, (_, i) => ({ strokes: [], name: (T.frames[i] || {}).name }));
      for (const o of items.slice().reverse()) { const D = WT.multiply(X.world(o)); for (let i = 0; i < n; i++) { const f = o.frames[o.frames.length === 1 ? 0 : i % o.frames.length]; f.strokes.forEach(s => frames[i].strokes.push(G.transformStroke(s, D))); } }
      frames.forEach(f => { if (!f.name) delete f.name; });
      const s0 = Math.min(...items.map(o => o.start)), e0 = Math.max(...items.map(o => o.start + o.dur));
      TR.shift(T, T.start - s0); T.start = U.r3(s0); T.dur = U.r3(e0 - s0); T.frames = frames;
      items.slice(1).forEach(o => { const l = tree.listOf(o); l.splice(l.indexOf(o), 1); });
      tree.reindex(); tree.select([T.id]); SB.commit(); toast(`Joined ${items.length} layers into ${T.name}.`);
    },
    /** Combine layers into one drawing: shapes become paths, every line keeps where it is on the stage, frames line up
        (frame 1 with frame 1…). The top layer's transform, timing and animation carry on; the originals are kept
        inside it (o.combined), so "Split back into layers" puts them back as they were. Text and pictures can't become
        lines: those make a group instead. */
    combine(items = tree.selected()) {
      items = items.filter(o => visual(o) && !tree.locked(o)); if (items.length < 2) return toast('Select two or more layers to combine them.');
      const vec = o => o.type === 'draw' || o.type === 'shape';
      if (!items.every(vec)) { toast('Text, pictures and groups can’t become one drawing: they were grouped instead (Ungroup takes them apart).'); return ops.group(items); }
      const order = tree.all(); items.sort((a, b) => order.indexOf(a) - order.indexOf(b));
      const top = items[0], list = tree.listOf(top), at = list.indexOf(top), WT = X.world(top).inverse();
      const keep = items.map(o => ({ o: U.deep(o), parent: (tree.parentOf(o) || {}).id || null, idx: tree.listOf(o).indexOf(o) }));
      const framesOf = o => o.type === 'shape' ? [{ strokes: [SB.types.get('shape').asPath(SB.scene.viewOf(o, tree.localTime(o)))].concat(U.deep((o.frames[0] || { strokes: [] }).strokes)) }] : o.frames;
      const n = Math.max(...items.map(o => framesOf(o).length)), frames = Array.from({ length: n }, (_, i) => ({ strokes: [], name: ((top.frames || [])[i] || {}).name }));
      for (const o of items.slice().reverse()) { const D = WT.multiply(X.world(o)), fs = framesOf(o); for (let i = 0; i < n; i++) { const f = fs[fs.length === 1 ? 0 : i % fs.length]; f.strokes.forEach(st => frames[i].strokes.push(G.transformStroke(st, D))); } }
      frames.forEach(f => { if (!f.name) delete f.name; });
      const T = U.deep(top); T.id = U.uid(); T.type = 'draw'; T.name = top.name + ' (combined)'; T.frames = frames; if (!T.fps) T.fps = 8;
      const anim = items.find(o => o.type === 'draw' && o.frames.length > 1); if (anim) { T.fps = anim.fps; T.play = anim.play; T.phase = anim.phase || 0; if (anim.tracks && anim.tracks.frame && anim !== top) T.tracks.frame = U.deep(anim.tracks.frame); } // the frames play as the animated drawing did
      if (!items.every(o => (o.blend || 'normal') === (top.blend || 'normal'))) delete T.blend;
      if (top.type === 'shape') { for (const id in T.tracks) if (['w', 'h', 'fill', 'stroke', 'strokeW'].includes(id)) delete T.tracks[id]; ['shape', 'w', 'h', 'fill', 'fillOn', 'stroke', 'strokeW'].forEach(k => delete T[k]); }
      const s0 = Math.min(...items.map(o => o.start)), e0 = Math.max(...items.map(o => o.start + o.dur)); TR.shift(T, T.start - s0); T.start = U.r3(s0); T.dur = U.r3(e0 - s0);
      T.combined = { layers: keep };
      const lost = items.slice(1).some(o => (o.effects || []).length || TR.animated(o, 'opacity') || Object.keys(o.tracks || {}).length || (o.opacity ?? 1) < 1 || (o.blend || 'normal') !== (top.blend || 'normal'));
      items.forEach(o => { const l = tree.listOf(o); l.splice(l.indexOf(o), 1); }); list.splice(Math.min(at, list.length), 0, T);
      tree.reindex(); tree.select([T.id]); SB.commit();
      toast(`Combined ${items.length} layers into ${T.name}.${lost ? ' The others’ own animation, opacity, blend and effects aren’t in the drawing (Split back brings them back).' : ''} Right-click › Split back into layers to undo it later.`);
      return T;
    },
    /** Put the layers a combined drawing was made from back where they were (changes made to the drawing since are dropped). */
    splitCombined(T = tree.sel()) {
      if (!T || !T.combined) return; const list = tree.listOf(T), at = list.indexOf(T), back = T.combined.layers.map(k => U.deep(k.o));
      list.splice(at, 1, ...back); tree.reindex(); tree.select(back.map(o => o.id)); SB.commit(); toast(`${back.length} layers are back.`); return back;
    },
    /** Turn the dark parts of an image into a filled drawing. */
    trace(o, threshold = 50) {
      const fr = SB.frames.current(o), m = SB.media.get(fr.mediaId || o.mediaId); if (!m || !m.el) return toast('This image has not loaded yet.');
      const w = TR.now(o, 'w'), h = TR.now(o, 'h'), cw = Math.round(Math.min(700, Math.max(80, w))), ch = Math.max(1, Math.round(cw * h / w));
      const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch; const c = cv.getContext('2d', { willReadFrequently: true });
      let d; try { c.drawImage(m.el, 0, 0, cw, ch); d = c.getImageData(0, 0, cw, ch).data; } catch (e) { return toast("This image can't be traced here."); }
      const th = threshold / 100 * 255, mask = new Uint8Array(cw * ch); let rs = 0, gs = 0, bs = 0, n = 0;
      for (let i = 0; i < cw * ch; i++) { const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2], a = d[i * 4 + 3]; if (a > 128 && 0.299 * r + 0.587 * g + 0.114 * b < th) { mask[i] = 1; rs += r; gs += g; bs += b; n++; } }
      if (!n) return toast('Nothing dark enough to trace.');
      const loops = SB.raster.traceMask(mask, cw, ch).map(L => G.rdp(L.map((v, i) => i % 2 ? (v + 0.5) / ch * h - h / 2 : (v + 0.5) / cw * w - w / 2), 0.7 * w / cw, true)).filter(L => L.length >= 6);
      const tr = TR.transform(o, tree.localTime(o));
      const dr = tree.make('draw', { name: o.name + ' traced', x: tr.x, y: tr.y, scale: tr.scale, rot: tr.rot, ax: tr.ax, ay: tr.ay, start: o.start, dur: o.dur, frames: [{ strokes: [{ f: 1, c: U.rgbHex(rs / n, gs / n, bs / n), loops }] }] });
      const l = tree.listOf(o); l.splice(l.indexOf(o), 0, dr); o.hidden = true; tree.reindex(); tree.select([dr.id]); SB.commit(); toast(`Traced into ${dr.name}. The image is hidden.`);
    },

    // ---------- align
    align(kind, toCanvas) {
      const items = tree.selected().filter(x => SB.types.get(x.type).fx && tree.inRange(x)); if (!items.length) return;
      const bs = items.map(o => SB.scene.box(o).aabb), T = U.emptyBox();
      if (toCanvas || items.length < 2) { T.x0 = 0; T.y0 = 0; T.x1 = S.project.w; T.y1 = S.project.h; } else bs.forEach(b => { U.growBox(T, b.x0, b.y0); U.growBox(T, b.x1, b.y1); });
      const move = (o, dx, dy) => { const PI = X.parentWorld(o).inverse(), a = PI.transformPoint(U.pt(0, 0)), c = PI.transformPoint(U.pt(dx, dy)), tr = TR.transform(o, tree.localTime(o)); TR.setMany(o, { x: U.r1(tr.x + c.x - a.x), y: U.r1(tr.y + c.y - a.y) }); };
      if (kind === 'dh' || kind === 'dv') {
        const cen = b => kind === 'dh' ? (b.x0 + b.x1) / 2 : (b.y0 + b.y1) / 2, ord = items.map((o, i) => [o, bs[i]]).sort((p, q) => cen(p[1]) - cen(q[1]));
        const c0 = cen(ord[0][1]), c1 = cen(ord[ord.length - 1][1]); ord.forEach(([o, b], i) => { const d = c0 + (c1 - c0) * i / (ord.length - 1) - cen(b); move(o, kind === 'dh' ? d : 0, kind === 'dv' ? d : 0); });
      } else items.forEach((o, i) => { const b = bs[i]; let dx = 0, dy = 0;
        if (kind === 'left') dx = T.x0 - b.x0; if (kind === 'right') dx = T.x1 - b.x1; if (kind === 'hcenter') dx = (T.x0 + T.x1) / 2 - (b.x0 + b.x1) / 2;
        if (kind === 'top') dy = T.y0 - b.y0; if (kind === 'bottom') dy = T.y1 - b.y1; if (kind === 'vcenter') dy = (T.y0 + T.y1) / 2 - (b.y0 + b.y1) / 2; move(o, dx, dy); });
      SB.commit();
    },

    // ---------- clipboard (layers, keyframes, drawing parts)
    copy() {
      if (S.selKeys.size) {
        const list = [...S.selKeys].map(([k, { o, id }]) => ({ oid: o.id, id, at: o.start + k.t, v: k.v, e: k.e, m: k.morph, mbz: k.mbz, mbzp: k.mbzp, fxType: id.startsWith('fx:') ? ((o.effects.find(e => e.id === id.split(':')[1])) || {}).type : null }));
        S.clip = { type: 'keys', list, t0: Math.min(...list.map(x => x.at)) }; toast(`Copied ${list.length} keyframe${list.length > 1 ? 's' : ''}.`); return;
      }
      if (S.tool === 'points' && S.selStrokes.size) return ops.copyParts(false);
      if (frameMode()) return ops.copyParts(false, true); // "This frame" (or Edit points with nothing picked): the drawing on this frame, not the layer
      const items = tree.selected(); if (!items.length) return; S.clip = { type: 'layers', list: items.map(U.deep) }; toast(`Copied ${items.length} layer${items.length > 1 ? 's' : ''}.`);
    },
    cut() { if (S.tool === 'points' && S.selStrokes.size) return ops.copyParts(true); if (frameMode()) return ops.copyParts(true, true); ops.copy(); ops.remove(); },
    paste() {
      const c = S.clip; if (!c) return toast('Nothing copied yet.');
      if (c.type === 'keys') return pasteKeys(c);
      if (c.type === 'parts') return pasteParts(c);
      const ids = [];
      c.list.forEach(src => { const o = U.deep(src); tree.reid(o); o.name = src.name + ' copy'; if (visual(o)) { (o.tracks.x || []).forEach(k => k.v += 30); (o.tracks.y || []).forEach(k => k.v += 30); o.x += 30; o.y += 30; } S.objects.unshift(o); ids.push(o.id); });
      c.list.forEach(o => { (o.tracks.x || []).forEach(k => k.v += 30); (o.tracks.y || []).forEach(k => k.v += 30); o.x += 30; o.y += 30; });
      tree.reindex(); tree.select(ids); SB.commit();
    },
    /** Copy (or cut) drawn parts: the selected ones, or (all) everything on the frame shown. They paste into any drawing, where they were. */
    copyParts(cut, all) {
      const o = tree.sel(); if (!o || (!all && !S.selStrokes.size)) return;
      const fr = SB.frames.current(o), pick = s => all || S.selStrokes.has(s), list = fr.strokes.filter(pick), W = X.world(o);
      if (!list.length) return toast('This frame has nothing drawn yet.');
      S.clip = { type: 'parts', list: list.map(s => G.transformStroke(s, W)) };
      if (cut) { fr.strokes = fr.strokes.filter(s => !pick(s)); S.selStrokes.clear(); SB.commit(); }
      toast(all ? `${cut ? 'Cut' : 'Copied'} the drawing of this frame (${list.length} part${list.length > 1 ? 's' : ''}). Paste it into any drawing.` : `${cut ? 'Cut' : 'Copied'} ${list.length} part${list.length > 1 ? 's' : ''}.`);
    },
    /** Move selected drawing parts into their own new layer. */
    /** The selected parts of a drawing as a new layer just above it: copied (copy, like Ctrl+J in Photoshop) or moved out. */
    partsToLayer(copy = false) {
      const o = tree.sel(); if (!o) return; const fr = SB.frames.current(o); let list = fr.strokes.filter(s => S.selStrokes.has(s)); if (!list.length) return toast('Select parts in Edit points first.');
      if (copy) list = list.map(s => U.deep(s));
      const tr = TR.transform(o, tree.localTime(o));
      const n = tree.make('draw', { name: o.name + ' part', x: tr.x, y: tr.y, scale: tr.scale, scx: tr.scx, scy: tr.scy, rot: tr.rot, opacity: tr.opacity, ax: tr.ax, ay: tr.ay, start: o.start, dur: o.dur, frames: [{ strokes: list }] });
      if (!copy) fr.strokes = fr.strokes.filter(s => !S.selStrokes.has(s));
      const l = tree.listOf(o); l.splice(l.indexOf(o), 0, n); S.selStrokes.clear(); tree.reindex(); tree.select([n.id]); SB.tool.set('select');
      const b = SB.scene.bounds(n); if (b) X.setOrigin(n, (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2);
      SB.commit(); toast(`${copy ? 'Copied' : 'Moved'} ${list.length} part${list.length > 1 ? 's' : ''} into ${n.name}.`);
    },
    setHidden(items, v) { items.forEach(o => o.hidden = v); SB.media.sync(S.playing); SB.commit(); },
    setLocked(items, v) { items.forEach(o => o.locked = v); SB.commit(); },
  };

  function pasteKeys(c) {
    // keys from several layers go back to their own layers; keys from one layer go to the selected layer (or back to theirs)
    const srcs = new Set(c.list.map(x => x.oid)), sel = new Map(); let skipped = 0;
    const own = srcs.size > 1 || !tree.sel() || [...srcs].some(id => S.multi.has(id)), target = own ? null : tree.sel();
    for (const x of c.list) {
      const o = target || tree.find(x.oid); if (!o) { skipped++; continue; } let id = x.id;
      if (id.startsWith('fx:') && o.id !== x.oid) { const e = o.effects.find(e => e.type === x.fxType); if (!e) { skipped++; continue; } id = 'fx:' + e.id + ':' + id.split(':')[2]; }
      if (id === 'frame' && !SB.types.get(o.type).frames) { skipped++; continue; }
      const k = TR.put(o, id, U.clamp(tree.rawLocal(o) + (x.at - c.t0), 0, o.dur), x.v, x.e); if (x.m) { k.morph = x.m; if (x.mbz) k.mbz = x.mbz; if (x.mbzp) k.mbzp = x.mbzp; } sel.set(k, { o, id });
    }
    S.selKeys = sel; SB.commit();
    toast(`Pasted ${sel.size} keyframe${sel.size === 1 ? '' : 's'}.${skipped ? ` ${skipped} skipped (no matching property).` : ''}`);
  }
  /** "This frame" is on (Select tool), or Edit points with no part picked: copy and paste work on the drawing of the frame shown. */
  function frameMode() {
    const o = tree.sel(); if (!o || tree.selected().length !== 1 || o.type !== 'draw') return false;
    return (S.tool === 'select' && S.recolorAll === false) || (S.tool === 'points' && !S.selStrokes.size);
  }
  ops.frameMode = frameMode;
  function pasteParts(c) {
    const o = SB.tool.drawTarget(null, true), Mi = X.world(o).inverse(), fr = SB.frames.current(o), keepTool = S.tool === 'select' && S.recolorAll === false;
    const map = {}, added = c.list.map(s => { const n = G.transformStroke(s, Mi); if (n.id) { map[n.id] = U.uid(); n.id = map[n.id]; } return n; });
    added.forEach(s => { if (s.links) s.links = s.links.map(id => map[id] || id); s.f ? fr.strokes.unshift(s) : fr.strokes.push(s); });
    if (!keepTool) SB.tool.set('points'); S.selStrokes = new Set(added); SB.commit(); toast(`Pasted into ${o.name}${o.frames.length > 1 ? `, frame ${SB.frames.currentIndex(o) + 1}` : ''}.${keepTool ? '' : ' Drag to place.'}`);
  }
})(window.SB);
