/* What Unity and Godot exports share: the chosen screens sampled frame by frame into one scene.
   Every screen becomes one animation (clip) of the same character, so layers are matched across
   screens by their link (o.link: kept when a screen is duplicated or a saved rig is placed, see
   rigs library in js/rig/library.js), or by their id.

   SB.engines.collect(screens, { fps, prog, morphSteps }) → G:   (morphSteps: in-between pictures per morph, js/io/bake.js)
     nodes   [{ key, name, kind, parent, o, … }] in tree order (front first), kinds:
               group   a group of layers
               layer   a picture layer: pics (one per drawing frame), mask { mode, visible } when it masks
                       its group, skin (bends with bones) or follow (joint key it rides on)
               rig     the rig;  joint  one bone (or one joint of a segmented bone), parent = joint or rig
               ctrl    a controller (an empty object in the engine)
     clips   [{ name, n, dur, tracks: Map key → { W: [DOMMatrix stage px], a: [alpha], fi: [frame], on: [bool] } }]
     order   leaf keys front to back;  warnings  Set of things that can't be carried
   Writers turn world matrices into local ones under whatever parent they choose. */
'use strict';
(function (SB) {
  const U = SB.util, S = SB.state, B = SB.bake, tree = SB.tree, X = SB.xf;
  const keyOf = o => o.link || o.id;

  // animated lines baked as a loop of pictures: frame number LINE_BASE + drawing frame × 100 + step (opt.lineFrames steps at LRATE a second)
  const LINE_BASE = 1e9, LRATE = 12;
  const lineOf = f => f >= LINE_BASE ? { base: Math.floor((f - LINE_BASE) / 100), j: (f - LINE_BASE) % 100 } : null;
  /** A layer's drawing frame f as a picture in its own space (x0, y0: where its top-left sits; k: pixels per unit). */
  function raster(info, f) {
    const o = info.o, v = info.v, mo = info.morph && info.morph.fi === f ? info.morph : null, ln = mo ? null : lineOf(f), fr = mo ? { strokes: mo.strokes, noBase: !!mo.noBase } : o.frames[ln ? ln.base : f] || o.frames[0] || { strokes: [] }, def = SB.types.get(o.type);
    const b = mo ? SB.paths.bounds(mo.strokes) : SB.scene.bounds(v, info.lt, ln ? ln.base : f); if (!b || !isFinite(b.x0)) return null; const pad = ln ? 8 : 2, x0 = Math.floor(b.x0 - pad), y0 = Math.floor(b.y0 - pad), w = Math.ceil(b.x1 + pad) - x0, h = Math.ceil(b.y1 + pad) - y0;
    const k = Math.min(2, 2048 / Math.max(w, h)), cv = U.h('canvas', { width: Math.max(1, Math.round(w * k)), height: Math.max(1, Math.round(h * k)) }), c = cv.getContext('2d');
    c.setTransform(k, 0, 0, k, -x0 * k, -y0 * k); const st = SB.fx.state(v, info.lt, SB.tracks.transform(o, info.lt), { noFx: true });
    if (def.draw) def.draw.call(def, c, v, fr, st, {}); SB.strokes.draw(c, fr.strokes, ln ? { T: ln.j / LRATE * (v.lnSp ?? 1), amt: v.lnAmt ?? 1 } : {});
    return { cv, x0, y0, w: cv.width / k, h: cv.height / k, k, f, label: mo ? mo.label : ln ? `${ln.base + 1} line ${ln.j + 1}` : null };
  }
  const dataBytes = url => { const b = atob(url.split(',')[1]), out = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i); return out; };
  const png = pic => pic.bytes || (pic.bytes = dataBytes(pic.cv.toDataURL('image/png')));

  async function collect(screens, opt) {
    const fps = opt.fps, nodes = [], byKey = new Map(), clips = [], warnings = new Set(), names = new Map();
    /** A drawing with animated lines (opt.lineFrames): its frame fi at lt is one of a loop of pictures. */
    const lineFi = (o, fi, lt) => (o.expLine ?? opt.lineFrames) > 0 && o.type === 'draw' && fi < B.MORPH_BASE && SB.lineMotion && SB.lineMotion(o) ? LINE_BASE + fi * 100 + Math.floor(lt * LRATE + 1e-4) % (o.expLine ?? opt.lineFrames) : fi;
    const unique = (nm, kind) => { const base = (nm || kind).replace(/[\/\\:."]/g, ' ').trim() || kind; let n = base, i = 2; const used = names.get(kind) || new Set(); names.set(kind, used); while (used.has(n)) n = `${base} ${i++}`; used.add(n); return n; };
    const add = (key, props) => { let nd = byKey.get(key); if (!nd) { nd = Object.assign({ key }, props); nd.name = unique(nd.name, nd.kind === 'joint' ? 'bone' : 'node'); byKey.set(key, nd); nodes.push(nd); } return nd; };
    // one animation per screen, or per action when a rig in it has actions (js/rig/actions.js)
    SB.screens.sync(); const jobs = [], used = new Set();
    for (const s of screens) { const vs = SB.actions ? SB.actions.variants(s.objects, s.proj) : []; if (!vs.length) jobs.push({ s, name: s.name, dur: s.proj.duration }); else vs.forEach(v => jobs.push({ s, name: v.act.name, dur: v.dur, rigId: v.rigId, actId: v.act.id })); }
    jobs.forEach(j => { let nm = j.name; if (used.has(nm)) nm = `${j.name} (${j.s.name})`; let k = 2; while (used.has(nm)) nm = `${j.name} ${k++}`; used.add(nm); j.name = nm; });
    // controllers that drive something: a grid of poses (the controller at each spot of its box or line), so the
    // game engines can show in their editor what moving the controller does (Unity and Godot preview scripts)
    if (opt.poses !== false) { const posed = new Set(); for (const s of screens) { const all = tree.all(s.objects || []);
      for (const c of all) { if (c.type !== 'null' || posed.has(keyOf(c))) continue; const links = all.flatMap(o => (o.drv || []).filter(l => l.ctrl === c.id)); if (!links.length) continue;
        const mo = c.ctype === 'custom' && c.lock ? c.lock : c.ctype || 'xy'; if (mo === 'free') continue; posed.add(keyOf(c));
        const nx = mo === 'y' ? 1 : 9, ny = mo === 'x' ? 1 : 9, rw = c.rw ?? c.range ?? 100, rh = c.rh ?? c.range ?? 100;
        jobs.push({ s, name: `${c.name} poses`, dur: nx * ny / fps, pose: { ctrlId: c.id, key: keyOf(c), mode: mo, nx, ny, rw, rh, circle: c.ctype === 'custom' && c.cshape === 'circle',
          add: links.every(l => (l.space || 'global') === 'local'),
          // per driven layer: its changes add on top of its animation (local links) / it jumps between points (Snap)
          addIds: all.filter(o => (o.drv || []).some(l => l.ctrl === c.id && (l.space || 'global') === 'local')).map(o => o.id),
          snapIds: all.filter(o => (o.drv || []).some(l => l.ctrl === c.id && l.blend === 'hold')).map(o => o.id) } }); } } } // add: its changes go on top of the animation (js/rig/controls.js), not instead of it
    const total = jobs.reduce((a, j) => a + Math.max(1, Math.round(j.dur * fps)), 0); let done = 0;
    for (const job of jobs) {
      const s = job.s, label = job.name, n = Math.max(1, Math.round(job.dur * fps)), clip = { name: job.name, n, dur: n / fps, w: s.proj.w, h: s.proj.h, tracks: new Map(), screen: s.id, action: job.actId || null, pose: job.pose || null }; clips.push(clip);
      await SB.exporter.onScreen(s, () => SB.actions && job.rigId ? SB.actions.during(job.rigId, job.actId, body) : body());
      async function body() {
        // keys for this screen: a link used twice (a pasted copy) falls back to the layer's id
        const kmap = new Map(), seen = new Set(); for (const o of tree.all()) { let k = keyOf(o); if (seen.has(k)) k = o.id; seen.add(k); kmap.set(o.id, k); }
        const K = o => kmap.get(o.id), rigs = SB.rig ? SB.rig.rigs() : [], ctrls = tree.all().filter(o => o.type === 'null');
        const track = key => { let t = clip.tracks.get(key); if (!t) clip.tracks.set(key, t = { W: [], a: [], fi: [], on: [] }); return t; };
        let prev = null; // the leaf drawn just before, to slot layers new in this screen into the order
        // the rope of a layer hanging from a bone: a thin picture stretched from the bone to the layer, drawn under it
        const rope = (o, info, key, T, nd, i) => {
          const P = SB.physics; if (!P || !o.phys || o.phys.mode !== 'hang' || o.phys.drawRope === false || !P.active(o)) return;
          const A = P.hangAnchor(o, T); if (!A) return; const tr = SB.tracks.transform(o, tree.localTime(o, T)), Pt = X.worldAt(tree.parentOf(o), T).transformPoint(new DOMPoint(tr.x, tr.y));
          const dx = Pt.x - A.x, dy = Pt.y - A.y, len = Math.hypot(dx, dy) || 1e-3, rk = key + '#rope';
          if (!byKey.has(rk)) { const cv = U.h('canvas', { width: 4, height: 4 }), c = cv.getContext('2d'); c.fillStyle = o.phys.ropeColor || '#24213F'; c.fillRect(0, 0, 4, 4); add(rk, { kind: 'layer', name: o.name + ' rope', parent: nd.parent, o, pics: [{ cv, x0: 0, y0: -0.5, w: 1, h: 1, k: 4, f: 0 }], first: info, prevLeaf: key }); }
          const t = track(rk); t.W[i] = new DOMMatrix([dx, dy, -dy / len * 3, dx / len * 3, A.x, A.y]); t.a[i] = info.alpha; t.fi[i] = 0; t.on[i] = info.visible; prev = rk;
        };
        // a pose grid: the controller sits at each spot in turn (row by row, top first), at the screen's start
        const pc = job.pose && tree.find(job.pose.ctrlId), keepC = pc && { live: pc._live };
        if (job.pose && !pc) return;
        try {
        for (let i = 0; i < n; i++) {
          if (S.cancelExport) throw 'cancel'; if (i % 6 === 0 && opt.prog) { opt.prog(0.7 * (done + i) / total, `${label}: frame ${i + 1} of ${n}`); await U.sleep(0); }
          const T = pc ? 0 : i / fps;
          if (pc) { const P = job.pose, col = i % P.nx, row = Math.floor(i / P.nx), u = P.nx > 1 ? -1 + 2 * col / (P.nx - 1) : 0, v = P.ny > 1 ? -1 + 2 * row / (P.ny - 1) : 0;
            pc._live = { x: (pc.rx ?? pc.x) + u * P.rw, y: (pc.ry ?? pc.y) + v * P.rh }; SB.bump(); } // like dragging it (js/rig/controls.js)
          B.walk(T, info => {
            const o = info.o, key = K(o), def = SB.types.get(o.type);
            if (o.type === 'video' || o.type === 'audio') { warnings.add('Video and sound'); return; }
            let nd = byKey.get(key);
            if (!nd) {
              const parent = info.parent ? K(info.parent) : null;
              nd = add(key, { kind: o.type === 'group' ? 'group' : 'layer', name: o.name, parent, o, pics: [], first: null });
              if (nd.kind === 'layer') {
                if (o.isMask) nd.mask = { mode: o.isMask, visible: !!o.maskVisible };
                if (o.bind && o.bind.mode === 'follow' && o.bind.rig) { const r = tree.find(o.bind.rig); if (r) nd.follow = `${K(r)}/${o.bind.bone}/0`; }
                if (o.bind && o.bind.mode === 'deform') nd.bend = true;
                nd.prevLeaf = prev;
              }
            }
            // animated lines (opt.lineFrames): the drawing becomes a loop of that many pictures
            if (nd.kind === 'layer' && !info.morph) info.fi = lineFi(o, info.fi, info.lt);
            const t = track(key); t.W[i] = info.M; t.a[i] = info.alpha; t.fi[i] = info.fi; t.on[i] = info.visible;
            if (nd.kind === 'layer') {
              prev = key;
              if (info.visible) { if (!nd.first) nd.first = info; if (!nd.pics.some(p => p.f === info.fi)) { const pic = raster(info, info.fi); if (pic) nd.pics.push(pic); } }
              rope(o, info, key, T, nd, i);
              (o.effects || []).forEach(e => { const d = SB.effects.get(e.type); if (e.on !== false && d && SB.targets && !SB.targets.fxOk('game', d)) warnings.add(`The ${d.label} effect`); });
              if (o.blend && o.blend !== 'normal') warnings.add('Blend modes');
              if (o.isMask === 'out') warnings.add('Masks that show the outside (Godot clips to the inside only)');
            }
            void def;
          }, { morphSteps: opt.morphSteps || 0 });
          for (const r of rigs) {
            const rk = K(r), W = X.worldAt(r, T), P = SB.rig.poseAt(r, T);
            add(rk, { kind: 'rig', name: r.name, parent: tree.parentOf(r) ? K(tree.parentOf(r)) : null, o: r });
            const rt = track(rk); rt.W[i] = W; rt.a[i] = 1; rt.on[i] = true;
            const ends = new Map();
            for (const b of r.bones) {
              const q = P[b.id]; if (!q) continue; const frames = q.ch ? SB.rig.bbFrames(q) : [q.m];
              let parentKey = b.parent && ends.has(b.parent) ? ends.get(b.parent) : rk;
              frames.forEach((m, k) => {
                const jk = `${rk}/${b.id}/${k}`;
                add(jk, { kind: 'joint', name: frames.length > 1 ? `${b.name} ${k + 1}` : b.name, parent: parentKey, rig: rk, bone: b.id, joint: k, joints: frames.length, len: frames.length > 1 ? (k < frames.length - 1 ? b.len / (frames.length - 1) : b.len / (frames.length - 1)) : b.len, o: r });
                const jt = track(jk); jt.W[i] = W.multiply(new DOMMatrix(m)); jt.a[i] = 1; jt.on[i] = true; parentKey = jk;
              });
              ends.set(b.id, parentKey);
            }
          }
          for (const c of ctrls) { const ck = K(c); add(ck, { kind: 'ctrl', name: c.name, parent: tree.parentOf(c) ? K(tree.parentOf(c)) : null, o: c }); const ct = track(ck); ct.W[i] = X.worldAt(c, T); ct.a[i] = 1; ct.on[i] = true; }
        }
        } finally { if (pc) { if (keepC.live) pc._live = keepC.live; else delete pc._live; SB.bump(); } }
        // morphs: every in-between picture shows, each at its own moment, however few frames a second the export has
        // (track.fev: [time, frame] at each change; the writers key the picture from it)
        if (!pc) for (const o of tree.all()) { const msteps = o.expMorph ?? opt.morphSteps; if (!(msteps > 0)) continue; /* a layer can set its own count */
          if ((o.type !== 'draw' && o.type !== 'shape') || !o.frames || o.frames.length < 2) continue;
          const key = K(o), t = clip.tracks.get(key), nd = byKey.get(key); if (!t || !nd || nd.kind !== 'layer' || nd.skin) continue;
          const ev = []; let fine = false;
          for (let i = 0; i < n; i++) {
            ev.push([i / fps, t.fi[i]]); if (i === n - 1 || !t.on[i]) continue;
            const ch = T => { const c = SB.frames.change(o, tree.localTime(o, T)); return c && c.mode === 'morph'; };
            if (!ch(i / fps) && !ch((i + 1) / fps) && !ch((i + 0.5) / fps)) continue;
            let last = t.fi[i]; const SUB = Math.max(8, msteps * 4);
            for (let q = 1; q < SUB; q++) {
              const T = (i + q / SUB) / fps, lt = tree.localTime(o, T), ms = B.morphShown(o, lt, msteps); if (!ms) continue;
              const fi = ms.strokes ? ms.fi : lineFi(o, ms.fi, lt); if (fi === last) continue; // a plain frame keeps the animated-line loop numbering
              last = fi; ev.push([T, fi]); fine = true;
              if (!ms.strokes && !nd.pics.some(p => p.f === fi)) { const pic = raster({ o, v: SB.scene.viewOf(o, lt), lt, morph: null }, fi); if (pic) nd.pics.push(pic); }
              if (ms.strokes && !nd.pics.some(p => p.f === ms.fi)) { const pic = raster({ o, v: SB.scene.viewOf(o, lt), lt, morph: ms }, ms.fi); if (pic) nd.pics.push(pic); }
            }
          }
          if (fine) t.fev = ev.filter((e, k) => k === 0 || e[1] !== ev[k - 1][1]);
        }
        if (pc) [...clip.tracks.keys()].forEach(k => { const nd = byKey.get(k); if (nd && nd.kind === 'ctrl') clip.tracks.delete(k); }); // the poses never move the controllers themselves
        // bending layers: their mesh and weights, bound where the layer sits at the start
        for (const nd of nodes) if (nd.bend && !nd.skin && clip.tracks.has(nd.key) && tree.find(nd.o.id) === nd.o) nd.skin = skinOf(nd, clip.tracks.get(nd.key), K, warnings);
      }
      done += n;
    }
    // draw order: front to back, as first seen; layers new in a later screen go right after the layer drawn before them
    const order = [];
    for (const nd of nodes) if (nd.kind === 'layer') { const at = nd.prevLeaf ? order.indexOf(nd.prevLeaf) : -1; order.splice(at + 1, 0, nd.key); }
    // a layer that rides on a bone, or bends: only once it has a picture
    return { fps, nodes, byKey, clips, order, warnings, w: screens[0].proj.w, h: screens[0].proj.h, png };
  }

  /** A grid over the picture, weighted like the stage weights it, for one bending layer. */
  function skinOf(nd, tr, K, warnings) {
    const o = nd.o, B0 = o.bind, pic = nd.pics[0]; if (!pic || !SB.rig) return null;
    const ids = SB.rig.bindBoneIds(B0); if (!ids.length) return null;
    const i0 = tr.W.findIndex(Boolean), M0 = tr.W[i0];
    if (tr.W.some(M => M && (Math.abs(M.e - M0.e) > 0.01 || Math.abs(M.f - M0.f) > 0.01 || Math.abs(M.a - M0.a) > 1e-4 || Math.abs(M.b - M0.b) > 1e-4))) warnings.add(`${o.name} moves on its own while bending (only its bones move it in the game engine)`);
    if (nd.pics.length > 1) warnings.add(`${o.name}: a bending layer keeps its first drawing frame`);
    const cells = Math.max(2, Math.min(24, Math.round(Math.max(pic.w, pic.h) / 32))), nx = cells, ny = Math.max(1, Math.round(cells * pic.h / Math.max(1, pic.w)));
    const verts = [], uvs = [], tris = [], edges = [];
    for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) { verts.push([pic.x0 + pic.w * i / nx, pic.y0 + pic.h * j / ny]); uvs.push([i / nx, j / ny]); }
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 2, d = a + nx + 1; tris.push(a, b, c, a, c, d); }
    const at = (i, j) => j * (nx + 1) + i; // outline, for the engines' mesh editors
    for (let i = 0; i < nx; i++) edges.push([at(i, 0), at(i + 1, 0)], [at(i, ny), at(i + 1, ny)]); for (let j = 0; j < ny; j++) edges.push([at(0, j), at(0, j + 1)], [at(nx, j), at(nx, j + 1)]);
    const segs = ids.map(k => B0.seg[k]), s2 = Math.pow(B0.soft || 60, 2), joints = [], jIndex = new Map(), binds = [];
    const jointOf = (rigO, bid, j, bind) => { const key = `${K(rigO)}/${bid}/${j}`; if (!jIndex.has(key)) { jIndex.set(key, joints.length); joints.push(key); binds.push(bind); } return jIndex.get(key); };
    const weights = verts.map(([x, y]) => {
      const p = M0.transformPoint(new DOMPoint(x, y)), W = SB.rig.weights(B0, ids, segs, p.x, p.y, s2), out = new Map();
      const put = (ji, w) => { if (w > 1e-4) out.set(ji, (out.get(ji) || 0) + w); };
      ids.forEach((bid, k) => {
        const r = SB.rig.boneOwner(B0, bid), b = SB.rig.boneById(r, bid), w = W[k]; if (!w || !b) return;
        const ns = SB.rig.nSegs(b), bindOf = j => { if (B0.bbf && B0.bbf[bid] && B0.bbf[bid][j]) return new DOMMatrix(B0.bbf[bid][j]); const F = new DOMMatrix(B0.inv[bid]).inverse(); return ns ? F.multiply(new DOMMatrix().translateSelf(b.len * j / ns, 0)) : F; };
        if (ns) { const g = B0.seg[bid], L2 = Math.max(1e-6, (g[2] - g[0]) ** 2 + (g[3] - g[1]) ** 2), u = U.clamp(((p.x - g[0]) * (g[2] - g[0]) + (p.y - g[1]) * (g[3] - g[1])) / L2, 0, 1) * ns, j = Math.min(ns - 1, Math.floor(u)), t = u - j;
          put(jointOf(r, bid, j, bindOf(j)), w * (1 - t)); put(jointOf(r, bid, j + 1, bindOf(j + 1)), w * t); }
        else put(jointOf(r, bid, 0, bindOf(0)), w);
      });
      const top = [...out].sort((a, b) => b[1] - a[1]).slice(0, 4), sum = top.reduce((a, x) => a + x[1], 0) || 1; return top.map(([j, w]) => [j, w / sum]);
    });
    return { M0, verts, uvs, tris, edges, joints, binds, weights, pic };
  }

  /** 2D matrix helpers for the writers. */
  const local = (W, P) => P ? P.inverse().multiply(W) : W;
  /** Fill gaps (frames where a node is absent) with the nearest value so curves stay smooth. */
  const filled = arr => { const out = arr.slice(); let last = arr.find(Boolean); for (let i = 0; i < out.length; i++) { if (out[i]) last = out[i]; else out[i] = last; } return out; };
  /** A picture's name: its frame number, or an in-between of a morph. */
  const picName = pic => pic.label || String(pic.f + 1);
  /** A layer's picture changes in a clip: [[time, frame], …] (exact morph in-betweens when there are, else one per frame change). */
  function picKeys(tr, n, fps) { if (!tr) return [[0, 0]]; if (tr.fev) return tr.fev; const out = []; for (let i = 0; i < n; i++) { const f = tr.fi[i] || 0; if (!out.length || out[out.length - 1][1] !== f) out.push([i / fps, f]); } return out; }
  SB.engines = { collect, raster, local, filled, keyOf, picName, picKeys, LINE_BASE };
})(window.SB);
