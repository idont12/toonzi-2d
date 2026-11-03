/* FBX export (binary FBX 7.4) for Unity and Blender.
   What goes in:
     layers      textured planes (each drawing frame is a picture; frames swap by scale 0/1, constant keys)
     groups      empty nodes holding their layers;  rigs  an empty node with a real skeleton of bones
     bending     layers that bend with a rig become skinned meshes (a grid) with weights from the rig,
                 so the bones bend them in Unity and Blender too; segmented bones are chains of bones
     animation   one take, baked frame by frame (keyframes, effects that move, controllers, constraints,
                 physics, bones followed), so it plays the same as here
   Pixels are centimetres (100 px = 1 Unity unit). Facing: 'unity' (the 2D camera looks at the art the
   usual way, front layers nearer) or 'blender' (front view). Textures are embedded in the file.
   SB.fbx.build(name, opts) → { files: [{ name, blob }], warnings } for the active screen. */
'use strict';
(function (SB) {
  const U = SB.util, S = SB.state, B = SB.bake, tree = SB.tree, X = SB.xf;
  const KT = 46186158000; // FBX time units per second

  // ================= binary FBX writer
  // a node: [name, props, children]; a prop: [type, value] (S string, R bytes, I int32, L int64, D double, C bool, d/f/i/l arrays)
  const N = (name, props = [], kids = []) => [name, props, kids];
  const Sx = v => ['S', v], I = v => ['I', v], L = v => ['L', v], D = v => ['D', v], C = v => ['C', v], R = v => ['R', v];
  const te = new TextEncoder(), bytesOf = s => typeof s === 'string' ? te.encode(s) : s;
  const ARR = { d: 8, f: 4, i: 4, l: 8, b: 1 };
  function propSize([t, v]) {
    if (t === 'S' || t === 'R') return 5 + bytesOf(v).length; if (t === 'I' || t === 'F') return 5; if (t === 'D' || t === 'L') return 9; if (t === 'C') return 2; if (t === 'Y') return 3;
    return 13 + v.length * ARR[t];
  }
  function nodeSize(n) { const [name, props, kids] = n; let s = 13 + bytesOf(name).length + props.reduce((a, p) => a + propSize(p), 0); if (kids.length) s += kids.reduce((a, k) => a + nodeSize(k), 0) + 13; else if (!props.length) s += 13; return s; }
  const FILE_ID = [0x28, 0xb3, 0x2a, 0xeb, 0xb6, 0x24, 0xcc, 0xc2, 0xbf, 0xc8, 0xb0, 0x2a, 0xa9, 0x2b, 0xfc, 0xf1];
  const FOOT_ID = [0xfa, 0xbc, 0xab, 0x09, 0xd0, 0xc8, 0xd4, 0x66, 0xb1, 0x76, 0xfb, 0x83, 0x1c, 0xf7, 0x26, 0x7e];
  const FOOT_END = [0xf8, 0x5a, 0x8c, 0x6a, 0xde, 0xf5, 0xd9, 0x7e, 0xec, 0xe9, 0x0c, 0xe3, 0x75, 0x8f, 0x29, 0x0b];
  function encode(top) {
    const body = top.reduce((a, n) => a + nodeSize(n), 0), head = 27, foot0 = head + body + 13 + 16 + 4, pad = ((foot0 + 15) & ~15) - foot0 || 16, total = foot0 + pad + 4 + 120 + 16;
    const buf = new ArrayBuffer(total), dv = new DataView(buf), u8 = new Uint8Array(buf); let o = 0;
    const raw = b => { u8.set(b, o); o += b.length; };
    raw(te.encode('Kaydara FBX Binary  ')); raw([0, 0x1a, 0]); dv.setUint32(o, 7400, true); o += 4;
    const writeProp = ([t, v]) => {
      u8[o++] = t.charCodeAt(0);
      if (t === 'S' || t === 'R') { const b = bytesOf(v); dv.setUint32(o, b.length, true); o += 4; raw(b); }
      else if (t === 'I') { dv.setInt32(o, v, true); o += 4; } else if (t === 'F') { dv.setFloat32(o, v, true); o += 4; }
      else if (t === 'D') { dv.setFloat64(o, v, true); o += 8; } else if (t === 'L') { dv.setBigInt64(o, BigInt(Math.round(v)), true); o += 8; }
      else if (t === 'C') u8[o++] = v ? 1 : 0; else if (t === 'Y') { dv.setInt16(o, v, true); o += 2; }
      else { const es = ARR[t]; dv.setUint32(o, v.length, true); dv.setUint32(o + 4, 0, true); dv.setUint32(o + 8, v.length * es, true); o += 12;
        for (const x of v) { if (t === 'd') dv.setFloat64(o, x, true); else if (t === 'f') dv.setFloat32(o, x, true); else if (t === 'i') dv.setInt32(o, x, true); else if (t === 'l') dv.setBigInt64(o, BigInt(Math.round(x)), true); else u8[o] = x ? 1 : 0; o += es; } }
    };
    const writeNode = n => {
      const [name, props, kids] = n, start = o, end = start + nodeSize(n), nb = bytesOf(name);
      dv.setUint32(o, end, true); dv.setUint32(o + 4, props.length, true); dv.setUint32(o + 8, props.reduce((a, p) => a + propSize(p), 0), true); u8[o + 12] = nb.length; o += 13; raw(nb);
      props.forEach(writeProp); kids.forEach(writeNode); if (kids.length || !props.length) o += 13;
    };
    top.forEach(writeNode); o += 13; raw(FOOT_ID); o += 4; o += pad; dv.setUint32(o, 7400, true); o += 4; o += 120; raw(FOOT_END);
    return new Blob([buf], { type: 'application/octet-stream' });
  }
  const P70 = (...ps) => N('Properties70', [], ps.filter(Boolean));
  const P = (name, type, label, flags, ...vals) => N('P', [Sx(name), Sx(type), Sx(label), Sx(flags), ...vals]);
  const vec = (name, x, y, z) => P(name, name, '', 'A', D(x), D(y), D(z));
  const cls = (name, kind) => name.replace(/[\x00\x01]/g, '') + '\x00\x01' + kind;

  // ================= scene
  async function build(name, opt) {
    const fps = opt.fps, n = Math.max(1, Math.round(S.project.duration * fps)), warn = new Set(), facing = opt.facing || 'unity';
    const cx = facing === 'unity' ? -1 : 1, cy = -1, zdir = facing === 'unity' ? -1 : 1; // stage (x right, y down) → FBX axes; see the header
    /** 2D layer matrix → FBX 2D part (conjugated by the axis flip). */
    const conv = m => new DOMMatrix([m.a, m.b * cx * cy, m.c * cx * cy, m.d, m.e * cx, m.f * cy]);
    const mat16 = (m, z = 0) => { const q = conv(m); return [q.a, q.b, 0, 0, q.c, q.d, 0, 0, 0, 0, 1, 0, q.e, q.f, z, 1]; };
    let nextId = 1000000; const id = () => nextId++;
    // 4×4 matrices as 16 numbers, column by column (FBX order)
    const toDM = a => new DOMMatrix(a), mul16 = (a, b) => Array.from(toDM(a).multiply(toDM(b)).toFloat64Array()), inv16 = a => Array.from(toDM(a).inverse().toFloat64Array());
    const objects = [], conns = [], models = [], pngs = [];
    const dataBytes = url => { const b = atob(url.split(',')[1]), out = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i); return out; };
    const connect = (kind, a, b, prop) => conns.push(N('C', [Sx(kind), L(a), L(b)].concat(prop ? [Sx(prop)] : [])));

    // ---------- sample the scene: layers (bake) and rigs, frame by frame
    const nodes = new Map(), rigs = SB.rig ? SB.rig.rigs() : []; let order = 0;
    const rigFrames = new Map(rigs.map(r => [r.id, []]));
    for (let i = 0; i < n; i++) {
      if (S.cancelExport) throw 'cancel'; if (i % 6 === 0 && opt.prog) { opt.prog(0.6 * i / n, `Reading frame ${i + 1} of ${n}`); await U.sleep(0); }
      const T = i / fps;
      B.walk(T, info => {
        const o = info.o; let nd = nodes.get(o.id); if (!nd) nodes.set(o.id, nd = { o, parent: info.parent, order: order++, M: [], a: [], fi: [], first: null });
        nd.M[i] = info.M; nd.a[i] = info.alpha; nd.fi[i] = info.fi; if (info.visible && !nd.first) nd.first = info; if (info.morph) (nd.morphs || (nd.morphs = new Map())).set(info.fi, info.morph);
      }, { morphSteps: opt.morphSteps || 0 });
      for (const r of rigs) rigFrames.get(r.id)[i] = { W: X.worldAt(r, T), P: SB.rig.poseAt(r, T) };
    }
    const list = [...nodes.values()].sort((a, b) => a.order - b.order);
    // depth: front layers nearer the camera
    const leaves = list.filter(nd => nd.o.type !== 'group'); leaves.forEach((nd, k) => nd.z = (leaves.length - k) * 0.5 * zdir);

    // ---------- helpers: a Model with animated TRS
    const decomposeLocal = (M, parentM) => { const loc = parentM ? (Math.abs(parentM.a * parentM.d - parentM.b * parentM.c) < 1e-9 ? null : parentM.inverse().multiply(M)) : M; return loc ? B.decompose(conv(loc)) : null; };
    function curve(vals, constant) {
      const cid = id(), keep = constant ? vals.map((v, i) => i).filter(i => i === 0 || vals[i] !== vals[i - 1]) : B.simplify(vals.map(v => [v]), 1e-3);
      const flags = constant ? 0x00000002 : 0x00000004; // constant / linear
      objects.push(N('AnimationCurve', [L(cid), Sx(cls('', 'AnimCurve')), Sx('')], [N('Default', [D(vals[0])]), N('KeyVer', [I(4008)]), N('KeyTime', [['l', keep.map(i => i / fps * KT)]]), N('KeyValueFloat', [['f', keep.map(i => vals[i])]]),
        N('KeyAttrFlags', [['i', [flags]]]), N('KeyAttrDataFloat', [['f', [0, 0, 218434821, 0]]]), N('KeyAttrRefCount', [['i', [keep.length]]])]));
      return cid;
    }
    const layerId = id(), stackId = id();
    function animate(mid, prop, xyz, constant) { // xyz: three arrays of per-frame values
      if (xyz.every(v => v.every(x => Math.abs(x - v[0]) < 1e-6))) return;
      const cn = id(); objects.push(N('AnimationCurveNode', [L(cn), Sx(cls(prop === 'Lcl Translation' ? 'T' : prop === 'Lcl Rotation' ? 'R' : 'S', 'AnimCurveNode')), Sx('')], [P70(P('d|X', 'Number', '', 'A', D(xyz[0][0])), P('d|Y', 'Number', '', 'A', D(xyz[1][0])), P('d|Z', 'Number', '', 'A', D(xyz[2][0])))]));
      connect('OO', cn, layerId); connect('OP', cn, mid, prop); ['X', 'Y', 'Z'].forEach((a, k) => connect('OP', curve(xyz[k], constant), cn, 'd|' + a));
    }
    /** A Model node. kind: 'Null' | 'Mesh' | 'LimbNode'. frames: per-frame { x, y, rot, sx, sy } (or null to reuse a neighbour); z: depth. */
    function model(nm, kind, parent, frames, z = 0, extraKids = []) {
      const mid = id(), ok = frames.map((f, i) => f || frames.slice(i).find(Boolean) || frames.slice(0, i).reverse().find(Boolean) || { x: 0, y: 0, rot: 0, sx: 1, sy: 1 }), f0 = ok[0];
      const rot = B.unwrap(ok.map(f => f.rot));
      objects.push(N('Model', [L(mid), Sx(cls(nm, 'Model')), Sx(kind)], [N('Version', [I(232)]), P70(P('InheritType', 'enum', '', '', I(1)), P('DefaultAttributeIndex', 'int', 'Integer', '', I(0)),
        vec('Lcl Translation', f0.x, f0.y, z), vec('Lcl Rotation', 0, 0, rot[0]), vec('Lcl Scaling', f0.sx, f0.sy, 1)), N('MultiLayer', [I(0)]), N('MultiTake', [I(0)]), N('Shading', [C(true)]), N('Culling', [Sx('CullingOff')]), ...extraKids]));
      connect('OO', mid, parent);
      animate(mid, 'Lcl Translation', [ok.map(f => f.x), ok.map(f => f.y), ok.map(() => z)]);
      animate(mid, 'Lcl Rotation', [ok.map(() => 0), ok.map(() => 0), rot]);
      animate(mid, 'Lcl Scaling', [ok.map(f => f.sx), ok.map(f => f.sy), ok.map(() => 1)]);
      if (kind === 'Null' || kind === 'LimbNode') { const na = id(); objects.push(N('NodeAttribute', [L(na), Sx(cls(nm, 'NodeAttribute')), Sx(kind)], kind === 'LimbNode' ? [P70(P('Size', 'double', 'Number', '', D(10))), N('TypeFlags', [Sx('Skeleton')])] : [N('TypeFlags', [Sx('Null')])])); connect('OO', na, mid); }
      models.push(mid); return mid;
    }
    const sceneRoot = model(name || 'Animation', 'Null', 0, [{ x: 0, y: 0, rot: 0, sx: 1, sy: 1 }]);

    // ---------- rigs: an empty node and a skeleton; B-bones are chains of joints
    const boneNodes = new Map(); // `${rigId}:${boneId}:${k}` → { mid, bind (2D, stage) }
    for (const r of rigs) {
      const fr = rigFrames.get(r.id); if (!r.bones.length) continue;
      const rid = model(r.name, 'Null', sceneRoot, fr.map(f => B.decompose(conv(f.W))));
      const ends = new Map(); // bone → id of the node its children hang on, and the rig-space frames of that node
      for (const b of r.bones) {
        const parEnd = b.parent ? ends.get(b.parent) : null, parentId = parEnd ? parEnd.mid : rid, parentFr = i => parEnd ? parEnd.fr(i) : null;
        const joints = fr[0].P[b.id].ch ? SB.rig.bbFrames(fr[0].P[b.id]).length : 1;
        let prevId = parentId, prevFr = parentFr;
        for (let k = 0; k < joints; k++) {
          const frAt = i => { const q = fr[i].P[b.id]; return new DOMMatrix(q.ch ? SB.rig.bbFrames(q)[k] : q.m); }, pf = prevFr;
          const loc = fr.map((_, i) => { const m = frAt(i), pm = pf(i); return B.decompose(conv(pm ? pm.inverse().multiply(m) : m)); });
          const mid = model(joints > 1 ? `${b.name}.${k}` : b.name, 'LimbNode', prevId, loc);
          boneNodes.set(`${r.id}:${b.id}:${k}`, { mid, rig: r, frAt });
          prevId = mid; prevFr = frAt;
        }
        ends.set(b.id, { mid: prevId, fr: prevFr }); // child bones hang on the last joint (their own placement carries the step along the bone)
      }
    }

    // ---------- layers
    const groupIds = new Map(), poseNodes = [];
    for (const nd of list) {
      const o = nd.o, pn = nd.parent && nodes.get(nd.parent.id), parentId = pn ? groupIds.get(pn.o.id) : sceneRoot;
      const frames = nd.M.map((M, i) => decomposeLocal(M, pn ? pn.M[i] : null));
      if (o.type === 'group') { groupIds.set(o.id, model(o.name, 'Null', parentId, frames)); continue; }
      if (o.type === 'video' || o.type === 'audio') { warn.add('Video and sound'); continue; }
      if (!nd.first) continue;
      const anyFx = (o.effects || []).filter(e => e.on !== false && SB.targets && !SB.targets.fxOk('blender', SB.effects.get(e.type) || {})); anyFx.forEach(e => warn.add(`The ${(SB.effects.get(e.type) || { label: e.type }).label} effect`));
      if (nd.a.some(a => a > 0.001 && a < 0.995)) warn.add('See-through and fading layers (FBX planes are drawn fully)');
      if (o.isMask) { warn.add('Masks'); continue; } if (o.blend && o.blend !== 'normal') warn.add('Blend modes');
      const lid = model(o.name, 'Null', parentId, frames, nd.z), fis = [...new Set(nd.fi.filter((f, i) => nd.a[i] > 0.001))]; if (!fis.length) fis.push(nd.fi[0] || 0);
      const bend = o.bind && o.bind.mode === 'deform' && SB.rig ? o.bind : null;
      if (bend && nd.M.some(M => Math.abs(M.e - nd.M[0].e) > 0.01 || Math.abs(M.f - nd.M[0].f) > 0.01 || Math.abs(M.a - nd.M[0].a) > 1e-4)) warn.add(`${o.name} moves on its own while bending (in FBX only the bones move a bending layer)`);
      for (const f of fis) {
        const pic = raster(nd, f); if (!pic) continue;
        const vis = nd.fi.map((x, i) => (x === f && nd.a[i] > 0.001) ? 1 : 0.0001), always = vis.every(v => v === 1);
        const mesh = plane(pic, bend ? Math.max(2, Math.min(24, Math.round(Math.max(pic.w, pic.h) / 32))) : 1);
        const gid = id(); objects.push(N('Geometry', [L(gid), Sx(cls(o.name, 'Geometry')), Sx('Mesh')], mesh.nodes));
        const mid = id(); objects.push(N('Model', [L(mid), Sx(cls(fis.length > 1 ? `${o.name} frame ${nd.morphs && nd.morphs.get(f) ? nd.morphs.get(f).label : f + 1}` : `${o.name} mesh`, 'Model')), Sx('Mesh')], [N('Version', [I(232)]),
          P70(vec('Lcl Translation', 0, 0, 0), vec('Lcl Rotation', 0, 0, 0), vec('Lcl Scaling', vis[0], vis[0], 1), P('DefaultAttributeIndex', 'int', 'Integer', '', I(0))), N('MultiLayer', [I(0)]), N('MultiTake', [I(0)]), N('Shading', [C(true)]), N('Culling', [Sx('CullingOff')])]));
        connect('OO', mid, lid); connect('OO', gid, mid); models.push(mid);
        if (!always) animate(mid, 'Lcl Scaling', [vis, vis, vis.map(() => 1)], true);
        material(o.name + (fis.length > 1 ? ' ' + (f + 1) : ''), pic, mid);
        if (bend) skin(nd, mesh, gid, mid, bend, warn);
      }
    }
    // ---------- one take
    objects.push(N('AnimationStack', [L(stackId), Sx(cls(name || 'Take', 'AnimStack')), Sx('')], [P70(P('LocalStop', 'KTime', 'Time', '', L(n / fps * KT)), P('ReferenceStop', 'KTime', 'Time', '', L(n / fps * KT)))]));
    objects.push(N('AnimationLayer', [L(layerId), Sx(cls('BaseLayer', 'AnimLayer')), Sx('')], []));
    connect('OO', layerId, stackId);
    if (poseNodes.length) { const pid = id(); objects.push(N('Pose', [L(pid), Sx(cls(name || 'Scene', 'Pose')), Sx('BindPose')], [N('Type', [Sx('BindPose')]), N('Version', [I(100)]), N('NbPoseNodes', [I(poseNodes.length)]), ...poseNodes.map(([nid, m]) => N('PoseNode', [], [N('Node', [L(nid)]), N('Matrix', [['d', m]])]))])); }

    // ---------- pictures, planes, materials, skins
    function raster(nd, f) {
      const o = nd.o, info = nd.first, v = info.v, mo = nd.morphs && nd.morphs.get(f), fr = mo ? { strokes: mo.strokes } : o.frames[f] || o.frames[0] || { strokes: [] }, def = SB.types.get(o.type);
      const b = mo ? SB.paths.bounds(mo.strokes) : SB.scene.bounds(v, info.lt, f); if (!b) return null; const pad = 2, x0 = b.x0 - pad, y0 = b.y0 - pad, w = b.x1 - b.x0 + pad * 2, h = b.y1 - b.y0 + pad * 2;
      const k = Math.min(2, 2048 / Math.max(w, h)), cv = U.h('canvas', { width: Math.max(1, Math.ceil(w * k)), height: Math.max(1, Math.ceil(h * k)) }), c = cv.getContext('2d');
      c.setTransform(k, 0, 0, k, -x0 * k, -y0 * k); const st = SB.fx.state(v, info.lt, SB.tracks.transform(o, info.lt), { noFx: true });
      if (def.draw) def.draw.call(def, c, v, fr, st, {}); SB.strokes.draw(c, fr.strokes, {});
      return { cv, x0, y0, w, h, key: o.id + ':' + f };
    }
    /** A grid of nx × ny quads over the picture, in the layer's own space (converted axes). */
    function plane(pic, cells) {
      const nx = cells, ny = Math.max(1, Math.round(cells * pic.h / Math.max(1, pic.w))) || 1, verts = [], pts = [], idx = [], uv = [], uvi = [], nrm = [], flip = cx * cy < 0;
      for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) { const x = pic.x0 + pic.w * i / nx, y = pic.y0 + pic.h * j / ny; pts.push([x, y]); verts.push(x * cx, y * cy, 0); uv.push(i / nx, 1 - j / ny); }
      const nz = zdir; // the planes face the camera
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 2, d = a + nx + 1; let quad = [a, d, c, b]; // counter-clockwise seen from +Z after the axis flip
        if ((flip ? 1 : -1) * nz < 0) quad = quad.reverse();
        quad.forEach((q, k) => { idx.push(k === 3 ? -q - 1 : q); uvi.push(q); nrm.push(0, 0, nz); });
      }
      return { pts, nodes: [N('GeometryVersion', [I(124)]), N('Vertices', [['d', verts]]), N('PolygonVertexIndex', [['i', idx]]),
        N('LayerElementNormal', [I(0)], [N('Version', [I(101)]), N('Name', [Sx('')]), N('MappingInformationType', [Sx('ByPolygonVertex')]), N('ReferenceInformationType', [Sx('Direct')]), N('Normals', [['d', nrm]])]),
        N('LayerElementUV', [I(0)], [N('Version', [I(101)]), N('Name', [Sx('UVMap')]), N('MappingInformationType', [Sx('ByPolygonVertex')]), N('ReferenceInformationType', [Sx('IndexToDirect')]), N('UV', [['d', uv]]), N('UVIndex', [['i', uvi]])]),
        N('LayerElementMaterial', [I(0)], [N('Version', [I(101)]), N('Name', [Sx('')]), N('MappingInformationType', [Sx('AllSame')]), N('ReferenceInformationType', [Sx('IndexToDirect')]), N('Materials', [['i', [0]]])]),
        N('Layer', [I(0)], [N('Version', [I(100)]), N('LayerElement', [], [N('Type', [Sx('LayerElementNormal')]), N('TypedIndex', [I(0)])]), N('LayerElement', [], [N('Type', [Sx('LayerElementUV')]), N('TypedIndex', [I(0)])]), N('LayerElement', [], [N('Type', [Sx('LayerElementMaterial')]), N('TypedIndex', [I(0)])])])] };
    }
    function material(nm, pic, mid) {
      const png = dataBytes(pic.cv.toDataURL('image/png')), file = `${U.slug(nm) || 'layer'}-${pic.key.replace(/[^a-z0-9]/gi, '').slice(-6)}.png`;
      const mat = id(), tex = id(), vid = id();
      objects.push(N('Material', [L(mat), Sx(cls(nm, 'Material')), Sx('')], [N('Version', [I(102)]), N('ShadingModel', [Sx('lambert')]), N('MultiLayer', [I(0)]), P70(P('DiffuseColor', 'Color', '', 'A', D(1), D(1), D(1)), P('EmissiveFactor', 'Number', '', 'A', D(0)), P('Opacity', 'double', 'Number', '', D(1)))]));
      objects.push(N('Video', [L(vid), Sx(cls(nm, 'Video')), Sx('Clip')], [N('Type', [Sx('Clip')]), P70(P('Path', 'KString', 'XRefUrl', '', Sx(file))), N('UseMipMap', [I(0)]), N('Filename', [Sx(file)]), N('RelativeFilename', [Sx(file)]), N('Content', [R(png)])]));
      objects.push(N('Texture', [L(tex), Sx(cls(nm, 'Texture')), Sx('')], [N('Type', [Sx('TextureVideoClip')]), N('Version', [I(202)]), N('TextureName', [Sx(cls(nm, 'Texture'))]), P70(P('UseMaterial', 'bool', '', '', I(1))), N('Media', [Sx(cls(nm, 'Video'))]), N('FileName', [Sx(file)]), N('RelativeFilename', [Sx(file)]), N('ModelUVTranslation', [D(0), D(0)]), N('ModelUVScaling', [D(1), D(1)]), N('Texture_Alpha_Source', [Sx('None')]), N('Cropping', [I(0), I(0), I(0), I(0)])]));
      connect('OO', mat, mid); connect('OO', vid, tex); connect('OP', tex, mat, 'DiffuseColor'); if (facing === 'unity') connect('OP', tex, mat, 'TransparentColor'); // Unity picks a see-through material from it; Blender finds the alpha by itself
      pngs.push({ name: file, data: png });
    }
    /** Weights from the rig, like the stage computes them: each bone's influence, split along segmented bones. */
    function skin(nd, mesh, gid, mid, B0, warn) {
      const ids = SB.rig.bindBoneIds(B0); if (!ids.length) return; const M0 = nd.M[0], segs = ids.map(k => B0.seg[k]), s2 = Math.pow(B0.soft || 60, 2);
      const cl = new Map(); // node key → { idx: [], w: [], bind }
      const add = (key, vi, w, bind) => { if (w < 1e-4) return; let c = cl.get(key); if (!c) cl.set(key, c = { idx: [], w: [], bind }); c.idx.push(vi); c.w.push(w); };
      mesh.pts.forEach(([x, y], vi) => {
        const p = M0.transformPoint(new DOMPoint(x, y)), W = SB.rig.weights(B0, ids, segs, p.x, p.y, s2);
        ids.forEach((bid, k) => {
          const r = SB.rig.boneOwner(B0, bid), b = SB.rig.boneById(r, bid), w = W[k]; if (!w) return; const n0 = boneNodes.get(`${r.id}:${bid}:0`); if (!n0) return;
          const bindOf = j => { if (B0.bbf && B0.bbf[bid] && B0.bbf[bid][j]) return new DOMMatrix(B0.bbf[bid][j]); const F = new DOMMatrix(B0.inv[bid]).inverse(); return b.segs > 1 ? F.multiply(new DOMMatrix().translateSelf(b.len * j / SB.rig.nSegs(b), 0)) : F; };
          if (SB.rig.nSegs(b) && boneNodes.get(`${r.id}:${bid}:1`)) { // along a segmented bone: between its two nearest joints
            const g = B0.seg[bid], L2 = Math.max(1e-6, (g[2] - g[0]) ** 2 + (g[3] - g[1]) ** 2), nseg = SB.rig.nSegs(b), u = U.clamp(((p.x - g[0]) * (g[2] - g[0]) + (p.y - g[1]) * (g[3] - g[1])) / L2, 0, 1) * nseg, j = Math.min(nseg - 1, Math.floor(u)), t = u - j;
            add(`${r.id}:${bid}:${j}`, vi, w * (1 - t), bindOf(j)); add(`${r.id}:${bid}:${j + 1}`, vi, w * t, bindOf(j + 1));
          } else add(`${r.id}:${bid}:0`, vi, w, bindOf(0));
        });
      });
      const skid = id(); objects.push(N('Deformer', [L(skid), Sx(cls(nd.o.name, 'Deformer')), Sx('Skin')], [N('Version', [I(101)]), N('Link_DeformAcuracy', [D(50)])])); connect('OO', skid, gid);
      const meshBind = mat16(M0, nd.z); poseNodes.push([mid, meshBind]);
      // the layer node's own frame-0 placement times its plane: the mesh's place in the world when bound
      for (const [key, c] of cl) {
        const bn = boneNodes.get(key); if (!bn) continue; const cid = id(), link = c.bind; // bone frame at binding (stage space)
        objects.push(N('Deformer', [L(cid), Sx(cls('', 'SubDeformer')), Sx('Cluster')], [N('Version', [I(100)]), N('UserData', [Sx(''), Sx('')]), N('Indexes', [['i', c.idx]]), N('Weights', [['d', c.w]]), N('Transform', [['d', mul16(inv16(mat16(link)), mat16(M0, nd.z))]]), N('TransformLink', [['d', mat16(link)]]), N('TransformAssociateModel', [['d', mat16(rigFrames.get(bn.rig.id)[0].W)]])]));
        connect('OO', cid, skid); connect('OO', bn.mid, cid); if (!poseNodes.some(p => p[0] === bn.mid)) poseNodes.push([bn.mid, mat16(link)]);
      }
    }

    // ---------- the file
    const count = t => objects.filter(o => o[0] === t).length, stop = n / fps * KT, now = new Date();
    const defs = ['Model', 'Geometry', 'Material', 'Texture', 'Video', 'Deformer', 'Pose', 'NodeAttribute', 'AnimationStack', 'AnimationLayer', 'AnimationCurveNode', 'AnimationCurve'].filter(t => count(t));
    const top = [
      N('FBXHeaderExtension', [], [N('FBXHeaderVersion', [I(1003)]), N('FBXVersion', [I(7400)]), N('EncryptionType', [I(0)]),
        N('CreationTimeStamp', [], [N('Version', [I(1000)]), N('Year', [I(now.getFullYear())]), N('Month', [I(now.getMonth() + 1)]), N('Day', [I(now.getDate())]), N('Hour', [I(now.getHours())]), N('Minute', [I(now.getMinutes())]), N('Second', [I(now.getSeconds())]), N('Millisecond', [I(0)])]),
        N('Creator', [Sx('Toonzi 2D FBX export')])]),
      N('FileId', [R(new Uint8Array(FILE_ID))]), N('CreationTime', [Sx('1970-01-01 10:00:00:000')]), N('Creator', [Sx('Toonzi 2D FBX export')]),
      N('GlobalSettings', [], [N('Version', [I(1000)]), P70(P('UpAxis', 'int', 'Integer', '', I(1)), P('UpAxisSign', 'int', 'Integer', '', I(1)), P('FrontAxis', 'int', 'Integer', '', I(2)), P('FrontAxisSign', 'int', 'Integer', '', I(1)),
        P('CoordAxis', 'int', 'Integer', '', I(0)), P('CoordAxisSign', 'int', 'Integer', '', I(1)), P('OriginalUpAxis', 'int', 'Integer', '', I(1)), P('OriginalUpAxisSign', 'int', 'Integer', '', I(1)),
        P('UnitScaleFactor', 'double', 'Number', '', D(1)), P('OriginalUnitScaleFactor', 'double', 'Number', '', D(1)), P('TimeMode', 'enum', '', '', I(14)), P('TimeProtocol', 'enum', '', '', I(2)), P('SnapOnFrameMode', 'enum', '', '', I(0)),
        P('TimeSpanStart', 'KTime', 'Time', '', L(0)), P('TimeSpanStop', 'KTime', 'Time', '', L(stop)), P('CustomFrameRate', 'double', 'Number', '', D(fps)))]),
      N('Documents', [], [N('Count', [I(1)]), N('Document', [L(id()), Sx('Scene'), Sx('Scene')], [P70(P('SourceObject', 'object', '', ''), P('ActiveAnimStackName', 'KString', '', '', Sx(name || 'Take'))), N('RootNode', [L(0)])])]),
      N('References', [], []),
      N('Definitions', [], [N('Version', [I(100)]), N('Count', [I(objects.length + 1)]), N('ObjectType', [Sx('GlobalSettings')], [N('Count', [I(1)])]), ...defs.map(t => N('ObjectType', [Sx(t)], [N('Count', [I(count(t))])]))]),
      N('Objects', [], objects),
      N('Connections', [], conns),
      N('Takes', [], [N('Current', [Sx(name || 'Take')]), N('Take', [Sx(name || 'Take')], [N('FileName', [Sx((name || 'Take') + '.tak')]), N('LocalTime', [L(0), L(stop)]), N('ReferenceTime', [L(0), L(stop)])])]),
    ];
    if (opt.prog) opt.prog(0.95, 'Writing the file…');
    const base = opt.base || U.slug(name) || 'animation', fbx = encode(top), files = [{ name: base + '.fbx', blob: fbx }];
    if (opt.textures) for (const p of pngs) files.push({ name: 'textures/' + p.name, blob: new Blob([p.data], { type: 'image/png' }) });
    return { files, warnings: [...warn] };
  }
  SB.fbx = { build, encode };
})(window.SB);
