/* Lottie export (bodymovin JSON, plays on the web with lottie-web, and in apps).
   The animation is baked frame by frame (js/io/bake.js), so keyframes, effects that move or fade,
   controllers, constraints, physics and bones all play the same:
     drawings and shapes  shape layers (one shape group per drawing frame; bending paths are animated)
     images and text      image layers (text is turned into a picture)
     groups and shots     null layers that the layers inside are parented to
     masks                track mattes;  blend modes  layer blend modes
   What Lottie can't show (filters, glow, layer styles, video, sound, erasers…) is left out and
   listed in the result's warnings. SB.lottie.build(name, opts) → { json, warnings } for the active screen. */
'use strict';
(function (SB) {
  const U = SB.util, S = SB.state, G = SB.paths, B = SB.bake;
  const BM = { normal: 0, multiply: 1, screen: 2, overlay: 3, darken: 4, lighten: 5, 'color-dodge': 6, 'color-burn': 7, 'hard-light': 8, 'soft-light': 9, difference: 10, exclusion: 11, hue: 12, saturation: 13, color: 14, luminosity: 15, add: 16 };
  const r2 = v => Math.round(v * 100) / 100, r3 = v => Math.round(v * 1000) / 1000;
  const stat = k => ({ a: 0, k }), LIN = { i: { x: [1], y: [1] }, o: { x: [0], y: [0] } };
  /** An animated property from per-frame values (arrays); simplified to the keys that matter. */
  function prop(vals, tol, hold) {
    const same = vals.every(v => v.every((x, k) => Math.abs(x - vals[0][k]) < 1e-6)), one = v => v.length === 1 ? v[0] : v;
    if (same) return stat(one(vals[0]));
    const idx = hold ? vals.map((v, i) => i).filter(i => i === 0 || vals[i].some((x, k) => Math.abs(x - vals[i - 1][k]) > 1e-6)) : B.simplify(vals, tol);
    return { a: 1, k: idx.map((i, j) => j === idx.length - 1 && !hold ? { t: i, s: vals[i] } : Object.assign({ t: i, s: vals[i] }, hold ? { h: 1 } : LIN)) };
  }
  // ---------- geometry
  /** A bezier sub [x0,y0, c1x,c1y,c2x,c2y,x1,y1, …] → Lottie path { v, i, o, c }. */
  function subPath(p, closed) {
    const v = [[p[0], p[1]]], ii = [[0, 0]], oo = [];
    for (let k = 2; k + 5 < p.length; k += 6) { const a = v[v.length - 1]; oo.push([p[k] - a[0], p[k + 1] - a[1]]); v.push([p[k + 4], p[k + 5]]); ii.push([p[k + 2] - p[k + 4], p[k + 3] - p[k + 5]]); }
    oo.push([0, 0]);
    if (closed && v.length > 1) { const a = v[0], z = v[v.length - 1]; if (Math.hypot(a[0] - z[0], a[1] - z[1]) < 0.01) { ii[0] = ii[ii.length - 1]; v.pop(); ii.pop(); oo.pop(); } }
    return { c: !!closed, v: v.map(q => q.map(r2)), i: ii.map(q => q.map(r2)), o: oo.map(q => q.map(r2)) };
  }
  /** A brush line as the stage draws it (quadratic curves through the midpoints) → bezier sub points. */
  function freehand(pts) {
    const n = pts.length / 2, p = [pts[0], pts[1]]; let sx = pts[0], sy = pts[1];
    for (let i = 1; i < n - 1; i++) { const qx = pts[i * 2], qy = pts[i * 2 + 1], ex = (qx + pts[i * 2 + 2]) / 2, ey = (qy + pts[i * 2 + 3]) / 2; p.push(sx + (qx - sx) * 2 / 3, sy + (qy - sy) * 2 / 3, ex + (qx - ex) * 2 / 3, ey + (qy - ey) * 2 / 3, ex, ey); sx = ex; sy = ey; }
    const lx = pts[n * 2 - 2], ly = pts[n * 2 - 1]; p.push(sx, sy, lx, ly, lx, ly); return p;
  }
  const polyPath = (pts, closed) => { const v = []; for (let k = 0; k < pts.length; k += 2) v.push([r2(pts[k]), r2(pts[k + 1])]); if (closed && v.length > 2) { const a = v[0], z = v[v.length - 1]; if (a[0] === z[0] && a[1] === z[1]) v.pop(); } const z0 = v.map(() => [0, 0]); return { c: !!closed, v, i: z0, o: z0.map(q => q.slice()) }; };
  /** One stroke → { paths: [path], fill, stroke, width } in the layer's own space (map: bones bending it). */
  function itemOf(s, map, warn) {
    if (s.er) { warn.add('Eraser strokes (Lottie can’t erase)'); return null; }
    if (s.tx) warn.add('Textured brushes (drawn as plain lines)');
    const mp = pts => map ? G.mapList(G.densify(pts, 10), map) : pts;
    if (s.f) return { paths: s.loops.map(L => polyPath(mp(L), true)), fill: s.c, stroke: null, width: 0 };
    if (s.b) {
      const paths = map ? G.lines(s).map((L, k) => polyPath(mp(L), !!s.subs[k].cl)) : s.subs.map(sb => subPath(sb.p, !!sb.cl));
      return { paths, fill: s.fc || null, stroke: s.s > 0 ? s.c : null, width: s.s || 0, rule: s.fr === 'evenodd' ? 2 : 1 };
    }
    if (!s.pts || s.pts.length < 2) return null;
    if (map) return { paths: [polyPath(mp(s.pts), false)], fill: null, stroke: s.c, width: s.s };
    return { paths: [subPath(freehand(s.pts), false)], fill: null, stroke: s.c, width: s.s };
  }
  /** Everything a vector layer shows at one moment: its items, back to front. */
  function vectorItems(info, warn) {
    const { o, v, fi } = info, def = SB.types.get(o.type); let fr = o.frames[fi] || o.frames[0] || { strokes: [] };
    // morphing frames: the lines as they morph, and after it in the same resampled form, so each frame keeps one point count (Lottie animates the paths)
    if (o.type === 'draw' && !info.fadeOnly) { const lib = o.play === 'library', chg = (lib || (o.morph && o.morph.mode === 'morph')) && SB.frames.change(o, info.lt, !lib), pairs = chg && chg.mode === 'morph' && SB.frames.morphPairs((o.frames[chg.a] || { strokes: [] }).strokes, (o.frames[chg.b] || fr).strokes); if (pairs) fr = { strokes: SB.frames.morphAt(pairs, chg.u) }; }
    const bent = !!(o.bind && o.bind.mode === 'deform' && SB.scene.deformer); // bending layers are always point lists, so every frame has the same points
    const map = bent ? SB.scene.deformer(o, info.T, info.M, new DOMMatrix()) || ((x, y) => [x, y]) : null;
    const list = (o.type === 'shape' ? [def.asPath(v)] : []).concat(fr.strokes);
    return list.map(s => itemOf(s, map, warn)).filter(Boolean);
  }
  const colorProp = c => { const q = B.rgba(c); return { c: stat([r3(q[0]), r3(q[1]), r3(q[2]), 1]), o: stat(Math.round(q[3] * 100)) }; };
  const trShape = (o = stat(100)) => ({ ty: 'tr', p: stat([0, 0]), a: stat([0, 0]), s: stat([100, 100]), r: stat(0), o, sk: stat(0), sa: stat(0) });
  /** One drawing frame's items as shape groups; series: per-frame item lists (null when not shown). */
  function shapeGroups(series, name, opac) {
    const first = series.find(Boolean); if (!first) return null;
    const filled = series.map((x, i) => x || series.slice(i).find(Boolean) || series.slice(0, i).reverse().find(Boolean));
    const groups = first.map((it, k) => {
      const paths = it.paths.map((p0, pi) => {
        const vals = filled.map(f => f[k] && f[k].paths[pi]), same = vals.every(p => JSON.stringify(p) === JSON.stringify(p0)) || vals.some(p => !p || p.v.length !== p0.v.length);
        const ks = same ? stat(p0) : { a: 1, k: vals.map((p, i) => i === 0 || JSON.stringify(p) !== JSON.stringify(vals[i - 1]) ? Object.assign({ t: i, s: [p] }, { i: { x: 1, y: 1 }, o: { x: 0, y: 0 } }) : null).filter(Boolean) };
        return { ty: 'sh', nm: 'Path', ks };
      });
      const paint = [];
      if (it.stroke && it.width > 0) paint.push(Object.assign({ ty: 'st', nm: 'Stroke', w: stat(r2(it.width)), lc: 2, lj: 2, ml: 4 }, colorProp(it.stroke)));
      if (it.fill) paint.push(Object.assign({ ty: 'fl', nm: 'Fill', r: it.rule || 1 }, colorProp(it.fill)));
      return { ty: 'gr', nm: 'Part ' + (k + 1), it: paths.concat(paint, [trShape()]) };
    }).reverse(); // Lottie draws the first item on top
    return { ty: 'gr', nm: name, it: groups.concat([trShape(opac)]) };
  }
  // ---------- pictures: images and text, as image assets
  function picture(info, warn) {
    const { o, v, fi } = info;
    if (o.type === 'image') { const m = SB.media.get((o.frames[fi] || {}).mediaId || o.mediaId); if (!m || !m.el) return null; const cv = U.h('canvas', { width: m.el.naturalWidth || m.w, height: m.el.naturalHeight || m.h }); cv.getContext('2d').drawImage(m.el, 0, 0); return { key: m.id, cv, w: cv.width, h: cv.height, place: vv => new DOMMatrix().translateSelf(-vv.w / 2, -vv.h / 2).scaleSelf(vv.w / cv.width, vv.h / cv.height) }; }
    if (o.type === 'text') {
      const b = SB.scene.bounds(v, info.lt, fi); if (!b) return null; if (o.effects && o.effects.some(e => e.type === 'typewriter')) warn.add('Typewriter text (shown complete)');
      const k = 2, cv = U.h('canvas', { width: Math.max(1, Math.ceil((b.x1 - b.x0) * k)), height: Math.max(1, Math.ceil((b.y1 - b.y0) * k)) }), c = cv.getContext('2d'); c.setTransform(k, 0, 0, k, -b.x0 * k, -b.y0 * k);
      const st = SB.fx.state(v, info.lt, SB.tracks.transform(o, info.lt), { noFx: true }); SB.types.get('text').draw(c, v, o.frames[fi] || { strokes: [] }, st, {}); SB.strokes.draw(c, (o.frames[fi] || { strokes: [] }).strokes, {});
      return { key: 'txt:' + o.id + ':' + fi + ':' + (v.text || '').length, cv, w: cv.width, h: cv.height, place: () => new DOMMatrix().translateSelf(b.x0, b.y0).scaleSelf(1 / k, 1 / k) };
    }
    return null;
  }

  async function build(name, opt) {
    const fps = opt.fps, n = Math.max(1, Math.round(S.project.duration * fps)), warn = new Set(), nodes = new Map(); let order = 0;
    const unsupportedFx = e => { const d = SB.effects.get(e.type); return d && SB.targets && !SB.targets.fxOk('lottie', d); };
    for (let i = 0; i < n; i++) {
      if (S.cancelExport) throw 'cancel'; if (i % 6 === 0 && opt.prog) { opt.prog(0.9 * i / n, `Reading frame ${i + 1} of ${n}`); await U.sleep(0); }
      B.walk(i / fps, info => {
        const o = info.o; let nd = nodes.get(o.id); if (!nd) nodes.set(o.id, nd = { o, parent: info.parent, order: order++, M: [], a: [], fi: [], geo: {}, pics: {}, picAt: [] });
        nd.M[i] = info.M; nd.a[i] = info.alpha; nd.fi[i] = info.fi;
        if (o.type === 'draw' && o.frames.length > 1) { // crossfades: frames that change without morphing (a fade setting, or lines that don't match)
          const c = SB.frames.change(o, info.lt), fades = c && (c.mode === 'fade' || !SB.frames.morphPairs((o.frames[c.a] || { strokes: [] }).strokes, (o.frames[c.b] || { strokes: [] }).strokes));
          if (fades) { (nd.fade = nd.fade || [])[i] = c; if (info.visible) { const keep = info.fi; info.fadeOnly = true; for (const f of [c.a, c.b]) if (f !== keep) { info.fi = f; (nd.geo[f] = nd.geo[f] || [])[i] = vectorItems(info, warn); } info.fi = keep; } }
        }
        if (o.type === 'draw' || o.type === 'shape') { if (info.visible) (nd.geo[info.fi] = nd.geo[info.fi] || [])[i] = vectorItems(info, warn); }
        else if (o.type === 'image' || o.type === 'text') { if (info.visible || !Object.keys(nd.pics).length) { const p = nd.pics[info.fi] || (nd.pics[info.fi] = picture(info, warn)); if (p) nd.picAt[i] = p.place(info.v); } if (o.bind && o.bind.mode === 'deform') warn.add('Pictures bending with bones (they follow without bending)'); }
        else if (o.type === 'video') warn.add('Video layers');
        if (i === 0) {
          (o.effects || []).forEach(e => { if (e.on !== false && unsupportedFx(e)) warn.add(`The ${SB.effects.get(e.type).label} effect`); });
          if (o.isMask && o.maskVisible) warn.add('Visible mask shapes (only the cut is kept)');
          if (o.blend && BM[o.blend] == null) warn.add(`The ${o.blend} blend mode`);
        }
      });
    }
    const list = [...nodes.values()].sort((a, b) => a.order - b.order); let ind = 1; list.forEach(nd => nd.ind = ind++);
    const layers = [], assets = [], assetOf = new Map();
    const parentNode = nd => nd.parent && nodes.get(nd.parent.id);
    /** The layer's transform relative to its parent group, frame by frame (frames where the parent has no size reuse a neighbour). */
    function transform(nd, extra, alphaMask) {
      const pn = parentNode(nd), loc = nd.M.map((M, i) => { let m = M; if (extra) { const e = extra[i]; if (!e) return null; m = m.multiply(e); } if (pn) { const P = pn.M[i]; if (Math.abs(P.a * P.d - P.b * P.c) < 1e-9) return null; m = P.inverse().multiply(m); } return B.decompose(m); });
      const ok = loc.map((x, i) => x || loc.slice(i).find(Boolean) || loc.slice(0, i).reverse().find(Boolean) || { x: 0, y: 0, rot: 0, sx: 1, sy: 1 });
      const rot = B.unwrap(ok.map(d => d.rot)), op = nd.a.map((a, i) => [Math.round((pn ? a / Math.max(1e-6, 1) : a) * (alphaMask ? alphaMask[i] : 1) * 1000) / 10]);
      return { o: prop(op, 0.6), r: prop(rot.map(r => [r3(r)]), 0.05), p: prop(ok.map(d => [r2(d.x), r2(d.y), 0]), 0.05), a: stat([0, 0, 0]), s: prop(ok.map(d => [r3(d.sx * 100), r3(d.sy * 100), 100]), 0.05) };
    }
    const base = (nd, ty, nm) => Object.assign({ ddd: 0, ind: nd.ind, ty, nm, sr: 1, ao: 0, ip: 0, op: n, st: 0, bm: BM[nd.o.blend] || 0 }, parentNode(nd) ? { parent: parentNode(nd).ind } : {});
    for (const nd of list) {
      const o = nd.o;
      if (o.type === 'group') { layers.push(Object.assign(base(nd, 3, o.name), { ks: transform(nd) })); continue; } // the alpha of a group is already in its layers
      if (o.type === 'draw' || o.type === 'shape') {
        const fis = Object.keys(nd.geo).map(Number); if (!fis.length) continue; const multi = fis.length > 1;
        const shapes = fis.map(f => shapeGroups(Array.from({ length: n }, (_, i) => nd.geo[f][i] || null), multi ? `Frame ${f + 1}` : 'Drawing', multi ? (nd.fade ? prop(nd.fi.map((x, i) => { const c = nd.fade[i]; return [c ? (c.b === f ? 100 * c.u : c.a === f ? 100 * (1 - c.u) : 0) : x === f ? 100 : 0]; }), 0, false) : prop(nd.fi.map(x => [x === f ? 100 : 0]), 0, true)) : stat(100))).filter(Boolean);
        layers.push(Object.assign(base(nd, 4, o.name), { ks: transform(nd), shapes })); continue;
      }
      if (o.type === 'image' || o.type === 'text') {
        const fis = Object.keys(nd.pics).map(Number).filter(f => nd.pics[f]);
        fis.forEach(f => {
          const p = nd.pics[f]; let id = assetOf.get(p.key);
          if (!id) { id = 'img_' + assets.length; assetOf.set(p.key, id); assets.push({ id, w: p.w, h: p.h, u: '', p: p.cv.toDataURL('image/png'), e: 1 }); }
          const extra = nd.picAt.map((m, i) => m || null), mask = fis.length > 1 ? nd.fi.map(x => x === f ? 1 : 0) : null;
          const L = Object.assign(base(nd, 2, fis.length > 1 ? `${o.name} · frame ${f + 1}` : o.name), { refId: id, ks: transform(nd, extra, mask) });
          if (fis.length > 1) L.ind = nd.ind * 1000 + f; layers.push(L);
        });
      }
    }
    // masks: the mask layer is a matte for the other layers of its group (Lottie 5.12 matte parents)
    for (const nd of list) {
      if (!nd.o.isMask) continue; const L = layers.find(l => l.ind === nd.ind); if (!L) continue; L.td = 1;
      const g = nd.parent; if (!g) continue; const inside = new Set(SB.tree.all(g.children).map(x => x.id));
      for (const m of list) if (m !== nd && inside.has(m.o.id) && m.o.type !== 'group') layers.filter(l => l.ind === m.ind || Math.floor(l.ind / 1000) === m.ind).forEach(l => { l.tt = nd.o.isMask === 'out' ? 2 : 1; l.tp = nd.ind; });
    }
    const json = { v: '5.12.2', fr: fps, ip: 0, op: n, w: S.project.w, h: S.project.h, nm: name, ddd: 0, assets, layers, markers: [], meta: { g: 'Toonzi 2D' } };
    return { json, warnings: [...warn] };
  }
  SB.lottie = { build, subPath };
})(window.SB);
