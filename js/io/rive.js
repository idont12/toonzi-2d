/* Rive export (.riv, runtime format 7): the chosen screens and the rigs' actions as animations of one
   artboard, plus a state machine that plays them and reacts to triggers (js/ui/interact.js sets it up).
   The scene is sampled frame by frame (SB.engines.collect): every layer is a Node moved by its world
   transform, with an Image per drawing frame; the pictures are embedded. A layer that bends with a rig is
   a mesh over its picture whose points are keyed where the bones put them. Masks, effects, video and
   sound are left out (Rive's clipping needs vector shapes).
   Format: "RIVE", major and minor version, file id, a table of the property keys used with their field
   types, then objects: type key, (property key, value)…, 0. Keys come from rive-runtime's generated
   definitions (include/rive/generated). SB.rive.build(screens, { fps, base, interact, prog }) → { files, warnings, inputs } */
'use strict';
(function (SB) {
  const U = SB.util, B = SB.bake, E = SB.engines;
  // type keys
  const T = { backboard: 23, artboard: 1, node: 2, image: 100, imageAsset: 105, contents: 106, linear: 31, keyedObject: 25, keyedProperty: 26, keyDouble: 30,
    stateMachine: 53, trigger: 58, layer: 57, anyState: 62, entryState: 63, exitState: 64, animState: 61, transition: 65, triggerCond: 68 };
  // property keys → field type (0 uint / bool, 1 string / bytes, 2 float, 3 color)
  const P = { name: [4, 1], parentId: [5, 0], width: [7, 2], height: [8, 2], clip: [196, 0], x: [13, 2], y: [14, 2], rotation: [15, 2], scaleX: [16, 2], scaleY: [17, 2], opacity: [18, 2],
    imageAssetId: [206, 0], originX: [380, 2], originY: [381, 2], assetName: [203, 1], assetId: [204, 0], assetW: [208, 2], assetH: [207, 2], bytes: [212, 1],
    animName: [55, 1], fps: [56, 0], duration: [57, 0], speed: [58, 2], loop: [59, 0], objectId: [51, 0], propertyKey: [53, 0], frame: [67, 0], interp: [68, 0], value: [70, 2],
    smName: [138, 1], animationId: [149, 0], stateTo: [151, 0], flags: [152, 0], transDur: [158, 0], exitTime: [160, 0], inputId: [155, 0], defaultSM: [236, 0] };
  const FLAG = { exitTime: 4, exitPct: 8 };
  P.blend = [23, 0]; P.tris = [223, 1]; P.vx = [24, 2]; P.vy = [25, 2]; P.u = [215, 2]; P.v = [216, 2];
  T.mesh = 109; T.meshVertex = 108;
  // hit areas for listeners: an invisible rectangle (only shapes can be clicked in Rive)
  T.shape = 3; T.rect = 7; T.fill = 20; T.solid = 18; T.listener = 114; T.listenTrigger = 115;
  P.rw = [20, 2]; P.rh = [21, 2]; P.color = [37, 3]; P.targetId = [224, 0]; P.listenType = [225, 0]; P.listenInput = [227, 0]; P.stateSpeed = [292, 2];
  const LISTEN = { click: 2, hover: 0, leave: 1 }; // pointer down, enter, exit
  // mouse follow: number inputs set by the pointer entering cells of a grid, and a layer of poses picked by them
  T.number = 56; T.numCond = 70; T.listenNumber = 118; P.numValue = [140, 2]; P.condValue = [157, 2]; P.condOp = [156, 0]; P.listenNumValue = [229, 2];
  // canvas blend names → Rive's BlendMode
  const BLEND = { multiply: 24, screen: 14, overlay: 15, darken: 16, lighten: 17, 'color-dodge': 18, 'color-burn': 19, 'hard-light': 20, 'soft-light': 21, difference: 22, exclusion: 23, hue: 25, saturation: 26, color: 27, luminosity: 28 };

  /** A byte writer. */
  function writer() {
    let buf = new Uint8Array(1 << 16), n = 0; const dv = () => new DataView(buf.buffer);
    const need = k => { if (n + k <= buf.length) return; let L = buf.length; while (L < n + k) L *= 2; const b = new Uint8Array(L); b.set(buf); buf = b; };
    const W = {
      byte(v) { need(1); buf[n++] = v; },
      varuint(v) { v = Math.max(0, Math.floor(v)); need(10); do { let b = v % 128; v = Math.floor(v / 128); if (v > 0) b |= 128; buf[n++] = b; } while (v > 0); },
      f32(v) { need(4); dv().setFloat32(n, v, true); n += 4; },
      u32(v) { need(4); dv().setUint32(n, v >>> 0, true); n += 4; },
      bytes(b) { W.varuint(b.length); need(b.length); buf.set(b, n); n += b.length; },
      str(s) { W.bytes(new TextEncoder().encode(String(s))); },
      done: () => buf.slice(0, n),
    };
    return W;
  }
  /** Encode a list of objects [{ t: typeKey, p: [[prop, value], …] }] as a .riv file. */
  function encode(objects) {
    const used = new Map(); objects.forEach(o => o.p.forEach(([pr]) => used.set(pr[0], pr[1])));
    const w = writer(); 'RIVE'.split('').forEach(ch => w.byte(ch.charCodeAt(0))); w.varuint(7); w.varuint(0); w.varuint(0);
    const keys = [...used.keys()]; keys.forEach(k => w.varuint(k)); w.varuint(0);
    for (let i = 0; i < keys.length; i += 4) { let v = 0; for (let j = 0; j < 4 && i + j < keys.length; j++) v |= used.get(keys[i + j]) << (j * 2); w.u32(v); }
    for (const o of objects) {
      w.varuint(o.t);
      for (const [pr, v] of o.p) { if (v === undefined || v === null) continue; w.varuint(pr[0]); const ty = pr[1];
        if (ty === 0) w.varuint(typeof v === 'boolean' ? (v ? 1 : 0) : v); else if (ty === 1) (v instanceof Uint8Array ? w.bytes(v) : w.str(v)); else if (ty === 2) w.f32(v); else w.u32(v); }
      w.varuint(0);
    }
    return w.done();
  }

  async function build(screens, opt = {}) {
    const ia0 = opt.ix || (opt.interact && opt.interact.states ? opt.interact : null), follows = ia0 ? (ia0.follow || []) : [];
    const G = await E.collect(screens, Object.assign({}, opt, { poses: follows.length > 0 })), fps = G.fps, warnings = new Set(G.warnings), base = opt.base || 'animation';
    if (opt.prog) opt.prog(0.75, 'Building the Rive file…');
    if (G.nodes.some(nd => nd.mask)) warnings.add('Masks');
    const objs = [], add = (t, p) => { objs.push({ t, p }); return objs.length - 1; };
    // backboard, then the pictures (file assets), then the artboard and what is in it
    add(T.backboard, []);
    // Rive draws the first drawable on top, so the layers go front first
    const leaves = G.order.map(k => G.byKey.get(k)).filter(nd => nd && nd.kind === 'layer' && !nd.mask && nd.pics && nd.pics.length);
    const blendOf = nd => BLEND[nd.o && nd.o.blend]; warnings.delete('Blend modes'); if (leaves.some(nd => nd.o && nd.o.blend && nd.o.blend !== 'source-over' && !blendOf(nd))) warnings.add('Some blend modes');
    const assetOf = new Map(); let na = 0;
    for (const nd of leaves) for (const pic of (nd.skin ? [nd.skin.pic] : nd.pics)) { const id = na++; assetOf.set(nd.key + ':' + (nd.skin ? 'skin' : pic.f), id); add(T.imageAsset, [[P.assetName, `${nd.name}${nd.pics.length > 1 ? ' ' + SB.engines.picName(pic) : ''}.png`], [P.assetId, id], [P.assetW, pic.cv.width], [P.assetH, pic.cv.height]]); add(T.contents, [[P.bytes, G.png(pic)]]); }
    const artStart = objs.length, idx = i => i - artStart; // ids inside the artboard: its own objects in order, the artboard is 0
    add(T.artboard, [[P.name, opt.title || base], [P.width, G.w], [P.height, G.h], [P.clip, true], [P.defaultSM, 0]]);
    // per layer: its values in every animation
    const dec = W => { const sx = Math.hypot(W.a, W.b), det = W.a * W.d - W.b * W.c; return { x: W.e, y: W.f, rot: Math.atan2(W.b, W.a), sx, sy: sx ? det / sx : 0 }; };
    const info = leaves.map(nd => {
      const per = G.clips.map(c => { const t = c.tracks.get(nd.key), out = []; let last = null; for (let i = 0; i < c.n; i++) { const W = t && t.W[i], on = !!(t && t.on[i] && W); if (W) last = dec(W); out.push({ tr: last, on, a: t ? U.clamp(t.a[i] || 0, 0, 1) : 0, fi: t ? t.fi[i] || 0 : 0 }); } const first = out.find(x => x.tr); out.forEach(x => { if (!x.tr) x.tr = first ? first.tr : { x: 0, y: 0, rot: 0, sx: 1, sy: 1 }; }); return out; });
      const f0 = per.flat().find(x => x.on) || per.flat()[0] || { tr: { x: 0, y: 0, rot: 0, sx: 1, sy: 1 }, on: false, a: 1, fi: nd.pics[0].f };
      return { nd, per, f0 };
    });
    // a bending layer: a mesh over its picture, its points moved frame by frame (where the bones put them)
    const meshAt = (nd, c, i) => { const s = nd.skin, Ms = s.joints.map((jk, j) => { const t = c.tracks.get(jk), W = t && t.W[i]; return W ? W.multiply(s.binds[j].inverse()) : null; });
      return s.verts.map(([x, y], vi) => { const p0 = s.M0.transformPoint(new DOMPoint(x, y)); let X = 0, Y = 0, ws = 0; for (const [j, w] of s.weights[vi]) { if (!Ms[j]) continue; const q = Ms[j].transformPoint(p0); X += q.x * w; Y += q.y * w; ws += w; } return ws ? [X / ws * s.pic.k, Y / ws * s.pic.k] : [p0.x * s.pic.k, p0.y * s.pic.k]; }); };
    // the interactive graph (js/ui/interact.js): which layers listen to the pointer
    const ia = ia0, clipKey = c => c.action ? `${c.screen}:${c.action}` : c.screen;
    const objOf = new Map(); (function walk(list) { for (const o of list || []) { objOf.set(o.link || o.id, o); if (o.children) walk(o.children); } })(screens.flatMap(sc => sc.objects || []));
    const evOf = l => { const w = l.when || {}, t = w.type || 'click'; if (t === 'key') return { name: 'key ' + (w.key || 'Space') }; if (!LISTEN.hasOwnProperty(t)) return null;
      const L = w.layer && objOf.get(w.layer); return { name: (t === 'click' ? 'click' : t === 'hover' ? 'pointer enter' : 'pointer leave') + (L ? ' ' + L.name : ''), type: t, layer: L ? w.layer : '' }; };
    const events = new Map(); if (ia) for (const l of ia.links || []) { const ev = evOf(l); if (ev && !events.has(ev.name)) events.set(ev.name, ev); }
    const chainOf = nd => { const out = []; for (let x = nd; x; x = x.parent && G.byKey.get(x.parent)) if (x.o) out.push(x.o.link || x.o.id); return out; };
    const hitsFor = new Map(); // layer key → leaves that get a hit area
    for (const ev of events.values()) if (ev.type && ev.layer && !hitsFor.has(ev.layer)) hitsFor.set(ev.layer, info.filter(L => chainOf(L.nd).includes(ev.layer)));
    const hitArea = (parent, x0, y0, w, h) => { const sh = idx(add(T.shape, [[P.name, 'Hit area'], [P.parentId, parent]])); add(T.rect, [[P.parentId, sh], [P.x, x0 + w / 2], [P.y, y0 + h / 2], [P.rw, Math.max(1, w)], [P.rh, Math.max(1, h)]]); const f = idx(add(T.fill, [[P.parentId, sh]])); add(T.solid, [[P.parentId, f], [P.color, 0]]); return sh; };
    const needHit = L => [...hitsFor.values()].some(list => list.includes(L));
    for (const L of info) {
      if (L.nd.skin) {
        const s = L.nd.skin, pic = s.pic; L.mesh = G.clips.map((c, ci) => { const out = []; for (let i = 0; i < c.n; i++) out.push(L.per[ci][i].on || i === 0 ? meshAt(L.nd, c, i) : null); for (let i = 0; i < c.n; i++) if (!out[i]) out[i] = out[i - 1]; return out; });
        L.node = idx(add(T.node, [[P.name, L.nd.name], [P.parentId, 0], [P.x, 0], [P.y, 0], [P.opacity, L.f0.on ? L.f0.a : 0]]));
        const im = idx(add(T.image, [[P.name, 'Picture'], [P.parentId, L.node], [P.imageAssetId, assetOf.get(L.nd.key + ':skin')], [P.x, 0], [P.y, 0], [P.scaleX, 1 / pic.k], [P.scaleY, 1 / pic.k], [P.originX, 0], [P.originY, 0], [P.blend, blendOf(L.nd)]]));
        const tri = writer(); s.tris.forEach(v => tri.varuint(v)); const me = idx(add(T.mesh, [[P.parentId, im], [P.tris, tri.done()]]));
        const v0 = (L.mesh.find(m => m.length) || [[]])[0] || [];
        L.verts = s.verts.map(([x, y], vi) => idx(add(T.meshVertex, [[P.parentId, me], [P.vx, (v0[vi] || [0, 0])[0]], [P.vy, (v0[vi] || [0, 0])[1]], [P.u, (x - pic.x0) / pic.w], [P.v, (y - pic.y0) / pic.h]])));
        L.images = [];
        if (needHit(L)) { const ps = v0.map(p => [p[0] / pic.k, p[1] / pic.k]), xs = ps.map(p => p[0]), ys = ps.map(p => p[1]); if (ps.length) L.hit = hitArea(L.node, Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)); }
        continue;
      }
      const r = L.f0.tr; L.node = idx(add(T.node, [[P.name, L.nd.name], [P.parentId, 0], [P.x, r.x], [P.y, r.y], [P.rotation, r.rot], [P.scaleX, r.sx], [P.scaleY, r.sy], [P.opacity, L.f0.on ? L.f0.a : 0]]));
      L.images = L.nd.pics.map(pic => ({ pic, id: idx(add(T.image, [[P.name, L.nd.pics.length > 1 ? `Frame ${SB.engines.picName(pic)}` : 'Picture'], [P.parentId, L.node], [P.imageAssetId, assetOf.get(L.nd.key + ':' + pic.f)],
        [P.x, pic.x0], [P.y, pic.y0], [P.scaleX, 1 / pic.k], [P.scaleY, 1 / pic.k], [P.originX, 0], [P.originY, 0], [P.opacity, L.nd.pics.length > 1 && pic.f !== L.f0.fi ? 0 : 1], [P.blend, blendOf(L.nd)]])) }));
      if (needHit(L)) { const bx = L.nd.pics.reduce((b, pic) => U.growBox(U.growBox(b, pic.x0, pic.y0), pic.x0 + pic.cv.width / pic.k, pic.y0 + pic.cv.height / pic.k), U.emptyBox()); L.hit = hitArea(L.node, bx.x0, bx.y0, bx.x1 - bx.x0, bx.y1 - bx.y0); }
    }
    const stageHit = [...events.values()].some(ev => ev.type && !ev.layer) ? hitArea(0, 0, 0, G.w, G.h) : null;
    // mouse follow: a grid of cells over its area (the edge cells reach the artboard's edges, as the pointer outside counts as the edge)
    const mains = G.clips.map((c, ci) => ci).filter(ci => !G.clips[ci].pose);
    const followers = follows.map(f => {
      const ci = G.clips.findIndex(c => c.pose && c.pose.key === f.ctrl); if (ci < 0) return null; const c = G.clips[ci], nx = c.pose.nx, ny = c.pose.ny;
      let A = { x0: 0, y0: 0, x1: G.w, y1: G.h }; const lay = f.area && objOf.get(f.area); if (f.box) A = f.box; else if (lay) { const bx = SB.scene.box(lay); if (bx) A = bx.aabb; } // an interactive controller: its own box
      const cw = (A.x1 - A.x0) / nx, ch = (A.y1 - A.y0) / ny, cells = [];
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const ed = !f.grab, x0 = i === 0 && ed ? Math.min(0, A.x0) : A.x0 + i * cw, x1 = i === nx - 1 && ed ? Math.max(G.w, A.x1) : A.x0 + (i + 1) * cw, y0 = j === 0 && ed ? Math.min(0, A.y0) : A.y0 + j * ch, y1 = j === ny - 1 && ed ? Math.max(G.h, A.y1) : A.y0 + (j + 1) * ch; // a controller's cells stay on its box
        cells.push({ i, j, hit: hitArea(0, x0, y0, x1 - x0, y1 - y0) });
      }
      return { f, ci, c, nx, ny, cells, name: (objOf.get(f.ctrl) || { name: 'Controller' }).name };
    }).filter(Boolean);
    if (follows.length > followers.length) warnings.add('Mouse follow of a controller that drives nothing in these screens');
    if (followers.some(F => F.f.grab)) warnings.add('Interactive controllers: in Rive their layers follow the pointer over the controller’s box (Rive has no knob to drag), and the knob itself is not drawn');
    // which values move anywhere: those get keys in every animation (a state machine never leaves a value behind)
    const moves = (L, get, tol) => L.per.some(fr => fr.some(x => Math.abs(get(x) - get(L.f0)) > tol));
    info.forEach(L => { if (L.nd.skin) { L.keys = { opacity: moves(L, x => x.on ? x.a : 0, 0.002) }; return; } L.keys = { x: moves(L, x => x.tr.x, 0.01), y: moves(L, x => x.tr.y, 0.01), rotation: moves(L, x => x.tr.rot, 1e-4), scaleX: moves(L, x => x.tr.sx, 1e-4), scaleY: moves(L, x => x.tr.sy, 1e-4), opacity: moves(L, x => x.on ? x.a : 0, 0.002), frames: L.nd.pics.length > 1 && moves(L, x => x.fi, 0.5) }; });
    // animations
    const loopOf = k => { const st = ia && (ia.states || []).find(x => x.anim === k); return st && st.loop === false ? 0 : 1; };
    const animate = (ci, only) => {
      for (const L of info) {
        if (only && !only(L)) continue;
        const fr = L.per[ci], keyed = Object.entries(L.keys).filter(([k, v]) => v && k !== 'frames'); if (!keyed.length && !L.keys.frames && !L.verts) continue;
        if (keyed.length) { add(T.keyedObject, [[P.objectId, L.node]]);
          for (const [k] of keyed) {
            const get = k === 'opacity' ? (x => x.on ? x.a : 0) : k === 'rotation' ? null : (x => x.tr[{ x: 'x', y: 'y', scaleX: 'sx', scaleY: 'sy' }[k]]);
            const vals = k === 'rotation' ? B.unwrap(fr.map(x => x.tr.rot * 180 / Math.PI)).map(d => d * Math.PI / 180) : fr.map(get);
            add(T.keyedProperty, [[P.propertyKey, P[k][0]]]); keyFrames(vals, k === 'opacity' ? fr.map(x => x.on) : null, k === 'rotation' ? 1e-3 : k === 'opacity' ? 0.002 : k.startsWith('scale') ? 1e-3 : 0.05);
          } }
        if (L.verts) L.verts.forEach((vid, vi) => { const xs = L.mesh[ci].map(m => m[vi][0]), ys = L.mesh[ci].map(m => m[vi][1]), tol = 0.2 * L.nd.skin.pic.k;
          if (Math.max(...xs) - Math.min(...xs) < tol && Math.max(...ys) - Math.min(...ys) < tol && !G.clips.some((c2, k) => k !== ci && L.mesh[k].some(m => Math.abs(m[vi][0] - xs[0]) > tol || Math.abs(m[vi][1] - ys[0]) > tol))) return;
          add(T.keyedObject, [[P.objectId, vid]]); add(T.keyedProperty, [[P.propertyKey, P.vx[0]]]); keyFrames(xs, null, tol); add(T.keyedProperty, [[P.propertyKey, P.vy[0]]]); keyFrames(ys, null, tol); });
        if (L.keys.frames) for (const im of L.images) { add(T.keyedObject, [[P.objectId, im.id]]); add(T.keyedProperty, [[P.propertyKey, P.opacity[0]]]); keyFrames(fr.map(x => x.fi === im.pic.f ? 1 : 0), fr.map(x => x.fi === im.pic.f), 0.5); }
      }
    };
    mains.forEach(ci => { const c = G.clips[ci]; add(T.linear, [[P.animName, c.name], [P.fps, fps], [P.duration, Math.max(1, c.n)], [P.speed, 1], [P.loop, loopOf(clipKey(c))]]); animate(ci); });
    // mouse follow: one tiny animation per spot of the controller's grid, keying only what the controller changes
    for (const F of followers) {
      const varies = L => { const fr = L.per[F.ci], a = fr[0]; return fr.some(x => x.on !== a.on || Math.abs(x.a - a.a) > 0.002 || x.fi !== a.fi || Math.abs(x.tr.x - a.tr.x) > 0.01 || Math.abs(x.tr.y - a.tr.y) > 0.01 || Math.abs(x.tr.rot - a.tr.rot) > 1e-4 || Math.abs(x.tr.sx - a.tr.sx) > 1e-4 || Math.abs(x.tr.sy - a.tr.sy) > 1e-4) || (L.mesh && L.mesh[F.ci].some(m => m.some((p, vi) => Math.abs(p[0] - L.mesh[F.ci][0][vi][0]) > 0.1 || Math.abs(p[1] - L.mesh[F.ci][0][vi][1]) > 0.1))); };
      const moved = info.filter(varies);
      for (let k = 0; k < F.c.n; k++) {
        add(T.linear, [[P.animName, `${F.name} ${k + 1}`], [P.fps, fps], [P.duration, 1], [P.speed, 1], [P.loop, 0]]);
        animateSpot(F.ci, k, moved);
      }
    }
    /** Key the values of one spot (frame k of a pose grid) for the layers that move with the controller. */
    function animateSpot(ci, k, list) {
      for (const L of list) {
        const x = L.per[ci][k], keyed = Object.entries(L.keys).filter(([kk, v]) => v && kk !== 'frames');
        if (keyed.length) { add(T.keyedObject, [[P.objectId, L.node]]);
          for (const [kk] of keyed) { const v = kk === 'opacity' ? (x.on ? x.a : 0) : kk === 'rotation' ? x.tr.rot : x.tr[{ x: 'x', y: 'y', scaleX: 'sx', scaleY: 'sy' }[kk]]; add(T.keyedProperty, [[P.propertyKey, P[kk][0]]]); add(T.keyDouble, [[P.frame, 0], [P.interp, 1], [P.value, v]]); } }
        if (L.verts) L.verts.forEach((vid, vi) => { const m = L.mesh[ci][k][vi]; add(T.keyedObject, [[P.objectId, vid]]); add(T.keyedProperty, [[P.propertyKey, P.vx[0]]]); add(T.keyDouble, [[P.frame, 0], [P.interp, 1], [P.value, m[0]]]); add(T.keyedProperty, [[P.propertyKey, P.vy[0]]]); add(T.keyDouble, [[P.frame, 0], [P.interp, 1], [P.value, m[1]]]); });
        if (L.keys.frames) for (const im of L.images) { add(T.keyedObject, [[P.objectId, im.id]]); add(T.keyedProperty, [[P.propertyKey, P.opacity[0]]]); add(T.keyDouble, [[P.frame, 0], [P.interp, 0], [P.value, x.fi === im.pic.f ? 1 : 0]]); }
      }
    }
    /** Keyframes for one value: linear between the frames that matter, holding where it jumps (shown / hidden). */
    function keyFrames(vals, flags, tol) {
      const n = vals.length, keep = new Set(B.simplify(vals.map(v => [v]), tol));
      if (flags) for (let i = 1; i < n; i++) if (flags[i] !== flags[i - 1]) { keep.add(i); keep.add(i - 1); }
      keep.add(0); keep.add(n - 1); const ks = [...keep].filter(i => i >= 0 && i < n).sort((a, b) => a - b);
      ks.forEach((i, j) => { const nx = ks[j + 1], hold = nx !== undefined && !!flags && flags[i] !== flags[nx];
        add(T.keyDouble, [[P.frame, i], [P.interp, hold ? 0 : 1], [P.value, vals[i]]]); });
    }
    // the state machine: the cards of the interactive graph and its arrows (or, without one, a trigger per animation)
    const keys = mains.map(ci => clipKey(G.clips[ci]));
    let states = ia ? (ia.states || []).filter(st => keys.includes(st.anim)) : [];
    if (!states.length) states = keys.map((k, i) => ({ id: 'c' + i, anim: k, speed: 1 }));
    const sIdx = id => states.findIndex(st => st.id === id), start = Math.max(0, sIdx(ia && ia.start));
    const screenOf = st => st && st.anim.split(':')[0];
    let links = ia ? (ia.links || []).filter(l => (l.from === 'any' || sIdx(l.from) >= 0) && sIdx(l.to) >= 0) : [];
    if (!ia || !ia.states || !ia.states.length) links = states.filter((st, i) => i !== start).flatMap(st => [{ from: 'any', to: st.id, when: { type: 'trigger', name: 'play ' + G.clips[mains[keys.indexOf(st.anim)]].name } }, { from: st.id, to: states[start].id, when: { type: 'end' } }]);
    const trigOf = l => { const w = l.when || {}; if (w.type === 'trigger') return w.name; const ev = evOf(l); return ev ? ev.name : null; };
    const triggers = []; links.forEach(l => { const nm = trigOf(l); if (nm && !triggers.includes(nm)) triggers.push(nm); });
    add(T.stateMachine, [[P.animName, 'State Machine 1']]);
    triggers.forEach(nm => add(T.trigger, [[P.smName, nm]]));
    // mouse follow inputs: which column and row of its grid the pointer is over (they start in the middle)
    let nIn = triggers.length; followers.forEach(F => { F.inX = nIn++; F.inY = nIn++; add(T.number, [[P.smName, `${F.name} x`], [P.numValue, (F.nx - 1) / 2]]); add(T.number, [[P.smName, `${F.name} y`], [P.numValue, (F.ny - 1) / 2]]); });
    add(T.layer, [[P.smName, 'Layer 1']]);
    const animState = i => 3 + i; // states: any, entry, exit, then one per card
    const transition = l => {
      const w = l.when || {}, t = w.type || 'click', to = states[sIdx(l.to)], from = l.from === 'any' ? null : states[sIdx(l.from)];
      const mix = from && screenOf(from) !== screenOf(to) ? 0 : Math.round(l.mix || 0); // another screen cuts, like in the app
      if (t === 'end') return add(T.transition, [[P.stateTo, animState(sIdx(l.to))], [P.flags, FLAG.exitTime | FLAG.exitPct], [P.transDur, mix], [P.exitTime, 100]]);
      if (t === 'timer') return add(T.transition, [[P.stateTo, animState(sIdx(l.to))], [P.flags, FLAG.exitTime], [P.transDur, mix], [P.exitTime, Math.max(1, Math.round((w.after ?? 1) * 1000))]]);
      const nm = trigOf(l); if (!nm) return; add(T.transition, [[P.stateTo, animState(sIdx(l.to))], [P.flags, 0], [P.transDur, mix]]); add(T.triggerCond, [[P.inputId, triggers.indexOf(nm)]]);
    };
    add(T.anyState, []); links.filter(l => l.from === 'any').forEach(transition);
    add(T.entryState, []); add(T.transition, [[P.stateTo, animState(start)], [P.flags, 0], [P.transDur, 0]]);
    add(T.exitState, []);
    states.forEach(st => { add(T.animState, [[P.animationId, keys.indexOf(st.anim)], [P.stateSpeed, st.speed && st.speed !== 1 ? st.speed : null]]); links.filter(l => l.from === st.id).forEach(transition); });
    // mouse follow layers: one state per spot; any state goes to the spot the inputs say, morphing for the smoothing
    let animAt = mains.length;
    for (const F of followers) {
      add(T.layer, [[P.smName, `Mouse follow: ${F.name}`]]);
      const mix = Math.round(U.clamp(F.f.smooth ?? 0.25, 0, 0.95) * 600), center = Math.floor(F.ny / 2) * F.nx + Math.floor(F.nx / 2);
      add(T.anyState, []);
      F.cells.forEach((cell, k) => { add(T.transition, [[P.stateTo, 3 + k], [P.flags, 0], [P.transDur, mix]]); add(T.numCond, [[P.inputId, F.inX], [P.condOp, 0], [P.condValue, cell.i]]); add(T.numCond, [[P.inputId, F.inY], [P.condOp, 0], [P.condValue, cell.j]]); });
      add(T.entryState, []); add(T.transition, [[P.stateTo, 3 + center], [P.flags, 0], [P.transDur, 0]]);
      add(T.exitState, []);
      F.cells.forEach((cell, k) => add(T.animState, [[P.animationId, animAt + k]]));
      animAt += F.cells.length;
    }
    // listeners: the pointer on a layer's hit areas (or the whole artboard) fires the trigger
    for (const ev of events.values()) {
      if (!ev.type || !triggers.includes(ev.name)) continue;
      const targets = ev.layer ? (hitsFor.get(ev.layer) || []).map(L => L.hit).filter(x => x != null) : [stageHit];
      if (!targets.length) warnings.add(`A layer to ${ev.type === 'click' ? 'click' : 'hover'} that is not in the file`);
      targets.forEach(id => { add(T.listener, [[P.smName, ev.name], [P.targetId, id], [P.listenType, LISTEN[ev.type]]]); add(T.listenTrigger, [[P.listenInput, triggers.indexOf(ev.name)]]); });
    }
    // mouse follow: entering a cell sets the column and row inputs
    for (const F of followers) F.cells.forEach(cell => { add(T.listener, [[P.smName, `${F.name} ${cell.i},${cell.j}`], [P.targetId, cell.hit], [P.listenType, 0]]); add(T.listenNumber, [[P.listenInput, F.inX], [P.listenNumValue, cell.i]]); add(T.listenNumber, [[P.listenInput, F.inY], [P.listenNumValue, cell.j]]); });
    if (followers.length && followers.some(F => G.clips[F.ci].pose.add)) warnings.add('Mouse follow replaces the animation of what it moves while it follows (Rive has no adding blend)');
    const bytes = encode(objs), name = U.slug(base);
    return { bytes, files: [{ name: `${name}.riv`, blob: new Blob([bytes], { type: 'application/octet-stream' }) }], warnings: [...warnings], inputs: triggers.concat(followers.flatMap(F => [`${F.name} x`, `${F.name} y`])), size: [G.w, G.h], animations: mains.map(ci => G.clips[ci].name) };
  }
  const triggerName = r => r.name || (r.on === 'click' ? 'click' : r.on === 'hoverIn' ? 'pointer enter' : r.on === 'hoverOut' ? 'pointer leave' : r.on === 'key' ? 'key ' + (r.key || 'Space') : 'trigger');

  /** A web page that plays the .riv with Rive's web runtime and fires its triggers on clicks, hovers and keys. */
  function html(title, bytes, opt = {}) {
    let b64 = ''; for (let i = 0; i < bytes.length; i += 8192) b64 += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192)); b64 = btoa(b64);
    const [w, h] = opt.size || [800, 600], runtime = opt.runtime || 'https://unpkg.com/@rive-app/canvas@2.45.1/rive.js';
    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${U.esc(title)}</title>
<style>html,body{margin:0;height:100%;background:${opt.bg || '#ffffff'}}body{display:grid;place-items:center}canvas{width:min(100vw,${w}px);aspect-ratio:${w}/${h};height:auto;max-height:100vh;touch-action:manipulation}</style></head>
<body><canvas id="art" width="${w}" height="${h}"></canvas>
<script src="${runtime}"></script>
<script>
// made with Toonzi 2D: the animation plays in its state machine; clicks and hovers go to its listeners, keys fire its triggers
const data = Uint8Array.from(atob("${b64}"), c => c.charCodeAt(0)), canvas = document.getElementById('art'), SM = 'State Machine 1';
${opt.wasm ? `rive.RuntimeLoader.setWasmUrl(${JSON.stringify(opt.wasm)});` : ''}
const r = new rive.Rive({ buffer: data.buffer, canvas, stateMachines: SM, autoplay: true, layout: new rive.Layout({ fit: rive.Fit.Contain }), onLoad: () => { r.resizeDrawingSurfaceToCanvas(); window.riveReady = true; }, onStateChange: e => { window.riveStates = (window.riveStates || []).concat(e.data); } });
const fire = name => { const i = (r.stateMachineInputs(SM) || []).find(x => x.name === name); if (i) { i.fire(); return true; } return false; };
window.fireTrigger = fire;
addEventListener('keydown', e => { if (fire('key ' + (e.code === 'Space' ? 'Space' : e.key.length === 1 ? e.key.toUpperCase() : e.key))) e.preventDefault(); });
addEventListener('resize', () => r.resizeDrawingSurfaceToCanvas());
</script>
</body></html>`;
  }
  SB.rive = { build, html, encode, triggerName };
})(window.SB);
