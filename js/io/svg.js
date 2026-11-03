/* SVG import.

   The SVG is read element by element, so it comes in the way it was built:
   - every <g> (and nested <svg>, <a>, <use>) becomes a group in the layer list, keeping its name
   - every shape becomes a drawing layer whose paths stay true bezier curves you can edit
   - fills, strokes, widths, caps, joins, dashes, fill-rule, opacity, and CSS classes are kept
   - gradients become a solid color (the average of their stops); text becomes a text layer;
     embedded images become image layers
   - clip-path and mask become a group with a mask layer (Inside), so the cut works and stays editable
   Group transforms are baked into the shapes, and each layer's pivot is its center,
   so groups rotate and scale around themselves. */
'use strict';
(function (SB) {
  const U = SB.util, S = SB.state, G = SB.paths, tree = SB.tree;
  const SKIP = new Set(['defs', 'style', 'title', 'desc', 'metadata', 'script', 'linearGradient', 'radialGradient', 'clipPath', 'mask', 'pattern', 'filter', 'symbol', 'marker', 'namedview', 'foreignObject', 'font', 'font-face']);
  const CONTAINERS = new Set(['g', 'a', 'switch', 'svg']);
  const SHAPES = new Set(['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon']);

  // ---------- path data → bezier subs
  function parsePath(d) {
    const toks = (d || '').match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) || [];
    const subs = []; let i = 0, cmd = null, cur = null, x = 0, y = 0, sx = 0, sy = 0, lc = null, lq = null, last = '';
    const num = () => parseFloat(toks[i++]);
    const ensure = () => { if (!cur) { cur = { p: [x, y], cl: 0 }; subs.push(cur); } };
    const seg = (a, b, c, dd, e, f) => { ensure(); cur.p.push(a, b, c, dd, e, f); x = e; y = f; };
    while (i < toks.length) {
      if (/^[a-zA-Z]$/.test(toks[i])) { cmd = toks[i++]; if (cmd === 'Z' || cmd === 'z') { if (cur) { if (Math.abs(x - sx) > 1e-9 || Math.abs(y - sy) > 1e-9) seg(x, y, sx, sy, sx, sy); cur.cl = 1; } x = sx; y = sy; cur = null; lc = lq = null; last = 'Z'; continue; } }
      else if (!cmd || cmd === 'Z' || cmd === 'z') { i++; continue; }
      const rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase(), ox = rel ? x : 0, oy = rel ? y : 0, start = i;
      switch (C) {
        case 'M': { const nx = num() + ox, ny = num() + oy; x = sx = nx; y = sy = ny; cur = { p: [x, y], cl: 0 }; subs.push(cur); cmd = rel ? 'l' : 'L'; lc = lq = null; break; }
        case 'L': { const nx = num() + ox, ny = num() + oy; seg(x, y, nx, ny, nx, ny); break; }
        case 'H': { const nx = num() + ox; seg(x, y, nx, y, nx, y); break; }
        case 'V': { const ny = num() + oy; seg(x, y, x, ny, x, ny); break; }
        case 'C': { const a = num() + ox, b = num() + oy, c = num() + ox, dd = num() + oy, e = num() + ox, f = num() + oy; seg(a, b, c, dd, e, f); lc = [c, dd]; break; }
        case 'S': { const r = (last === 'C' || last === 'S') && lc ? [2 * x - lc[0], 2 * y - lc[1]] : [x, y]; const c = num() + ox, dd = num() + oy, e = num() + ox, f = num() + oy; seg(r[0], r[1], c, dd, e, f); lc = [c, dd]; break; }
        case 'Q': { const qx = num() + ox, qy = num() + oy, e = num() + ox, f = num() + oy; seg(x + 2 / 3 * (qx - x), y + 2 / 3 * (qy - y), e + 2 / 3 * (qx - e), f + 2 / 3 * (qy - f), e, f); lq = [qx, qy]; break; }
        case 'T': { const q = (last === 'Q' || last === 'T') && lq ? [2 * x - lq[0], 2 * y - lq[1]] : [x, y], e = num() + ox, f = num() + oy; seg(x + 2 / 3 * (q[0] - x), y + 2 / 3 * (q[1] - y), e + 2 / 3 * (q[0] - e), f + 2 / 3 * (q[1] - f), e, f); lq = q; break; }
        case 'A': { const rx = num(), ry = num(), rot = num(), fa = num(), fs = num(), e = num() + ox, f = num() + oy; for (const s of G.arcToBez(x, y, rx, ry, rot, fa, fs, e, f)) seg(...s); break; }
        default: i++;
      }
      if (i > toks.length || toks.slice(start, i).some(t => isNaN(parseFloat(t)))) break;
      last = C;
    }
    return subs.filter(s => s.p.length >= 8 && s.p.every(isFinite));
  }
  // ---------- basic shapes → bezier subs (in the element's own coordinates)
  const len = a => a && a.baseVal ? a.baseVal.value : 0;
  function rectSub(x, y, w, h, rx, ry) {
    if (!rx && ry) rx = ry; if (!ry && rx) ry = rx; rx = Math.min(rx || 0, w / 2); ry = Math.min(ry || 0, h / 2);
    if (!rx) return G.poly([x, y, x + w, y, x + w, y + h, x, y + h], true);
    const k = 0.5523, kx = rx * (1 - k), ky = ry * (1 - k), x1 = x + w, y1 = y + h, p = [x + rx, y];
    const L = (ax, ay) => p.push(p[p.length - 2], p[p.length - 1], ax, ay, ax, ay), C = (...v) => p.push(...v);
    L(x1 - rx, y); C(x1 - kx, y, x1, y + ky, x1, y + ry); L(x1, y1 - ry); C(x1, y1 - ky, x1 - kx, y1, x1 - rx, y1); L(x + rx, y1); C(x + kx, y1, x, y1 - ky, x, y1 - ry); L(x, y + ry); C(x, y + ky, x + kx, y, x + rx, y);
    return { p, cl: 1 };
  }
  function shapeSubs(el) {
    switch (el.localName) {
      case 'path': return parsePath(el.getAttribute('d'));
      case 'rect': { const w = len(el.width), h = len(el.height); return w > 0 && h > 0 ? [rectSub(len(el.x), len(el.y), w, h, len(el.rx), len(el.ry))] : []; }
      case 'circle': { const r = len(el.r); return r > 0 ? [G.ellipse(len(el.cx), len(el.cy), r, r)] : []; }
      case 'ellipse': { const rx = len(el.rx), ry = len(el.ry); return rx > 0 && ry > 0 ? [G.ellipse(len(el.cx), len(el.cy), rx, ry)] : []; }
      case 'line': return [G.poly([len(el.x1), len(el.y1), len(el.x2), len(el.y2)], false)];
      case 'polyline': case 'polygon': { const pts = []; for (const q of el.points) pts.push(q.x, q.y); return pts.length >= 4 ? [G.poly(pts, el.localName === 'polygon')] : []; }
    }
    return [];
  }

  // ---------- paint
  function gradientColor(root, ref) {
    const id = (/url\(\s*["']?#([^"')]+)/.exec(ref) || [])[1]; if (!id) return null;
    let g = root.querySelector('#' + CSS.escape(id)), guard = 0;
    while (g && !g.querySelector('stop') && guard++ < 5) { const href = g.getAttribute('href') || g.getAttribute('xlink:href'); g = href ? root.querySelector(href) : null; }
    if (!g) return null; const cols = [...g.querySelectorAll('stop')].map(s => U.cssToHex(getComputedStyle(s).stopColor)).filter(Boolean); if (!cols.length) return null;
    const rgb = cols.map(U.hexRgb), avg = [0, 1, 2].map(i => rgb.reduce((a, c) => a + c[i], 0) / rgb.length); return U.rgbHex(...avg);
  }
  const paint = (root, v) => !v || v === 'none' ? null : v.startsWith('url') ? (gradientColor(root, v) || (/,\s*(.+)$/.exec(v) ? U.cssToHex(/,\s*(.+)$/.exec(v)[1]) : '#888888')) : U.cssToHex(v);
  function nameOf(el, fallback) {
    const t = el.querySelector(':scope > title'); return (el.getAttribute('inkscape:label') || el.getAttribute('data-name') || el.getAttribute('aria-label') || (t && t.textContent.trim()) || el.id || fallback).slice(0, 40);
  }
  /** Replace <use> with a <g> holding a copy of what it points to, so every shape is a real element. */
  function expandUse(root) {
    for (let pass = 0; pass < 6; pass++) {
      const uses = [...root.querySelectorAll('use')]; if (!uses.length) break;
      for (const u of uses) {
        const href = u.getAttribute('href') || u.getAttribute('xlink:href'), src = href && href.startsWith('#') ? root.querySelector(href) : null;
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        for (const a of u.attributes) if (!['href', 'xlink:href', 'x', 'y', 'width', 'height'].includes(a.name)) g.setAttribute(a.name, a.value);
        const tx = parseFloat(u.getAttribute('x')) || 0, ty = parseFloat(u.getAttribute('y')) || 0;
        g.setAttribute('transform', `${u.getAttribute('transform') || ''} translate(${tx} ${ty})`.trim());
        if (src) { const c = src.cloneNode(true); c.removeAttribute('id'); if (c.localName === 'symbol') { const inner = document.createElementNS('http://www.w3.org/2000/svg', 'g'); [...c.childNodes].forEach(n => inner.appendChild(n)); g.appendChild(inner); } else g.appendChild(c); if (!g.id && src.id) g.setAttribute('data-name', src.id); }
        u.replaceWith(g);
      }
    }
  }

  /** Read an SVG string into a node tree with absolute (viewport) coordinates. */
  function read(text) {
    const doc = new DOMParser().parseFromString(text, 'image/svg+xml'), src = doc.documentElement;
    if (!src || src.localName !== 'svg' || doc.getElementsByTagName('parsererror').length) throw new Error("This file isn't a valid SVG.");
    const host = U.h('div', { style: { position: 'fixed', left: '-30000px', top: '0', width: '4000px', height: '4000px', opacity: '0', pointerEvents: 'none', overflow: 'hidden' } });
    const shadow = host.attachShadow({ mode: 'open' }), svg = document.importNode(src, true); shadow.appendChild(svg); document.body.appendChild(host);
    try {
      expandUse(svg);
      let vb = svg.viewBox && svg.viewBox.baseVal && svg.viewBox.baseVal.width ? svg.viewBox.baseVal : null;
      if (!vb) { const w = parseFloat(svg.getAttribute('width')) || 300, h = parseFloat(svg.getAttribute('height')) || 150; vb = { x: 0, y: 0, width: w, height: h }; }
      svg.setAttribute('width', vb.width); svg.setAttribute('height', vb.height); svg.setAttribute('preserveAspectRatio', 'none');
      const RI = DOMMatrix.fromMatrix(svg.getScreenCTM()).inverse();
      const ctm = el => RI.multiply(DOMMatrix.fromMatrix(el.getScreenCTM()));
      let count = 0; const counter = {};
      const auto = kind => `${kind} ${(counter[kind] = (counter[kind] || 0) + 1)}`;
      const refOf = v => { const m = /url\(\s*["']?#([^"')]+)/.exec(v || ''); return m ? svg.querySelector('#' + CSS.escape(m[1])) : null; };
      /** The shapes of a <clipPath> or <mask>, placed in el's coordinates, as one mask node. */
      function maskNode(el, ref) {
        const clip = ref.localName === 'clipPath', units = ref.getAttribute(clip ? 'clipPathUnits' : 'maskContentUnits') || 'userSpaceOnUse';
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g'); let tf = CONTAINERS.has(el.localName) ? '' : (el.getAttribute('transform') || '');
        if (units === 'objectBoundingBox') { try { const bb = el.getBBox(); tf += ` translate(${bb.x} ${bb.y}) scale(${bb.width} ${bb.height})`; } catch (e) {} }
        if (tf.trim()) g.setAttribute('transform', tf.trim());
        for (const c of ref.children) { const k = c.cloneNode(true); if (clip) { k.setAttribute('fill', '#000'); k.style.fill = '#000'; k.style.stroke = 'none'; k.removeAttribute('clip-path'); } g.appendChild(k); }
        if (CONTAINERS.has(el.localName)) el.appendChild(g); else el.parentNode.insertBefore(g, el);
        let strokes = []; try { strokes = flattenAll({ kind: 'group', children: [...g.children].map(c => walk(c, false, true)).filter(Boolean) }); } finally { g.remove(); }
        if (!clip) { // a mask shows where it is light; dark shapes on top of light ones cut holes (even-odd)
          const lum = c => { const [r, gg, b] = U.hexRgb(c || '#000'); return (0.3 * r + 0.59 * gg + 0.11 * b) / 255; }, light = strokes.filter(st => lum(st.fc || st.c) > 0.35), dark = strokes.filter(st => !light.includes(st) && st.b);
          if (light.length && dark.length && light.every(st => st.b)) strokes = [{ b: 1, subs: [...light, ...dark].flatMap(st => st.subs), c: '#000', s: 0, fc: '#000', fr: 'evenodd' }];
          else if (light.length) strokes = light;
        }
        strokes.forEach(st => { st.fc = st.fc || '#000'; delete st.op; });
        return strokes.length ? { kind: 'shape', name: nameOf(ref, clip ? 'Clip' : 'Mask'), opacity: 1, strokes, isMask: 'in', named: true } : null;
      }
      function walk(el, isRoot, noMask) {
        const tag = el.localName; if (SKIP.has(tag)) return null;
        const cs = getComputedStyle(el); if (cs.display === 'none') return null;
        if (!noMask && !isRoot) { // clip-path / mask: the element goes into a group with its mask
          const ref = refOf(cs.clipPath !== 'none' ? cs.clipPath : el.getAttribute('clip-path')) || refOf(cs.mask !== 'none' ? cs.mask : el.getAttribute('mask'));
          if (ref && (ref.localName === 'clipPath' || ref.localName === 'mask')) {
            const content = walk(el, false, true); if (!content) return null; const mk = maskNode(el, ref); if (!mk) return content;
            return { kind: 'group', name: content.name ? content.name + ' (masked)' : 'Masked', opacity: 1, children: [content, mk], masked: true, named: true };
          }
        }
        const op = parseFloat(cs.opacity); const opacity = isNaN(op) ? 1 : op;
        if (CONTAINERS.has(tag)) {
          const kids = [...el.children].map(c => walk(c)).filter(Boolean); if (!kids.length) return null;
          return { kind: 'group', name: isRoot ? null : nameOf(el, auto('Group')), opacity, children: kids, named: !!(el.id || el.getAttribute('data-name') || el.getAttribute('inkscape:label')) };
        }
        if (cs.visibility === 'hidden') return null;
        if (SHAPES.has(tag)) {
          const M = ctm(el), k = U.matScale(M);
          const subs = shapeSubs(el).map(s => ({ p: G.mapList(s.p, (x, y) => { const q = M.transformPoint(U.pt(x, y)); return [q.x, q.y]; }), cl: s.cl }));
          if (!subs.length) return null;
          const fill = tag === 'line' ? null : paint(svg, cs.fill), stroke = paint(svg, cs.stroke), sw = (parseFloat(cs.strokeWidth) || 0) * k;
          if (!fill && !(stroke && sw > 0)) return null;
          const fo = parseFloat(cs.fillOpacity), so = parseFloat(cs.strokeOpacity);
          const st = { b: 1, subs, c: stroke || '#24213F', s: stroke ? U.r2(sw) : 0, fc: fill || null };
          if (cs.fillRule === 'evenodd') st.fr = 'evenodd';
          if (stroke) { st.lc = cs.strokeLinecap || 'butt'; st.lj = cs.strokeLinejoin || 'miter'; }
          if (cs.strokeDasharray && cs.strokeDasharray !== 'none') st.dash = cs.strokeDasharray.split(/[ ,]+/).map(v => parseFloat(v) * k).filter(v => !isNaN(v));
          const pOp = fill ? (isNaN(fo) ? 1 : fo) : (isNaN(so) ? 1 : so); if (pOp < 1) st.op = U.r2(pOp);
          count++;
          return { kind: 'shape', name: nameOf(el, auto(tag === 'path' ? 'Path' : tag[0].toUpperCase() + tag.slice(1))), opacity, strokes: [st], named: !!el.id };
        }
        if (tag === 'text') {
          const txt = [...el.querySelectorAll('tspan')].length > 1 ? [...el.querySelectorAll('tspan')].map(t => t.textContent.trim()).filter(Boolean).join('\n') : el.textContent.replace(/\s+/g, ' ').trim();
          if (!txt) return null; let bb; try { bb = el.getBBox(); } catch (e) { return null; }
          const M = ctm(el), c = M.transformPoint(U.pt(bb.x + bb.width / 2, bb.y + bb.height / 2)), k = U.matScale(M);
          const fam = (cs.fontFamily || '').split(',')[0].replace(/["']/g, '').trim(), known = Object.entries(SB.FONTS).find(([, f]) => f[0].toLowerCase().includes(fam.toLowerCase()));
          const font = known ? known[0] : /^g_d\d+_f\d+$/.test(fam) ? 'lexend' : /^(serif|sans-serif|monospace|cursive|system-ui|)$/i.test(fam) ? (fam === 'serif' ? 'serif' : fam === 'monospace' ? 'mono' : 'lexend') : 'g:' + fam;
          count++;
          return { kind: 'text', name: nameOf(el, txt.slice(0, 24)), opacity, cx: c.x, cy: c.y, rot: U.matAngle(M), text: txt, fontSize: (parseFloat(cs.fontSize) || 16) * k, color: paint(svg, cs.fill) || '#24213F', weight: parseInt(cs.fontWeight) || 400, font };
        }
        if (tag === 'image') {
          const href = el.getAttribute('href') || el.getAttribute('xlink:href') || ''; if (!href.startsWith('data:')) return null;
          const M = ctm(el), x = len(el.x), y = len(el.y), w = len(el.width), h = len(el.height), c = M.transformPoint(U.pt(x + w / 2, y + h / 2)), k = U.matScale(M);
          count++;
          return { kind: 'image', name: nameOf(el, auto('Image')), opacity, cx: c.x, cy: c.y, rot: U.matAngle(M), w: w * k, h: h * k, href };
        }
        return null;
      }
      const rootNode = walk(svg, true), masks = (function c(n) { return !n ? 0 : (n.masked ? 1 : 0) + (n.children || []).reduce((a, x) => a + c(x), 0); })(rootNode);
      return { root: rootNode, count, vb, masks };
    } finally { host.remove(); }
  }

  // ---------- turning the node tree into layers
  function bbox(n) {
    if (n._b) return n._b; const b = U.emptyBox();
    if (n.kind === 'group') (n.masked ? n.children.filter(c => c.isMask) : n.children).forEach(c => { const cb = bbox(c); if (U.boxOk(cb)) { U.growBox(b, cb.x0, cb.y0); U.growBox(b, cb.x1, cb.y1); } });
    else if (n.kind === 'shape') G.bounds(n.strokes, b);
    else { const hw = (n.kind === 'text' ? n.fontSize * n.text.length * 0.3 : n.w / 2), hh = n.kind === 'text' ? n.fontSize * 0.6 : n.h / 2; U.growBox(b, n.cx - hw, n.cy - hh); U.growBox(b, n.cx + hw, n.cy + hh); }
    return (n._b = b);
  }
  /** Groups with a single child fold into it (keeping the more meaningful name). */
  function simplify(n) {
    if (n.kind !== 'group') return n;
    n.children = n.children.map(simplify);
    if (n.children.length === 1 && n.name !== null && !n.masked) { const c = n.children[0]; c.opacity *= n.opacity; if (!c.named && n.name) c.name = n.name; return c; }
    return n;
  }
  /** "Groups only" mode: shapes that sit side by side in a group become one drawing. */
  function mergeShapes(n) {
    if (n.kind !== 'group') return n;
    const out = []; let run = null;
    for (const c of n.children.map(mergeShapes)) {
      if (c.kind === 'shape' && c.opacity === 1 && !c.isMask) { if (!run) { run = { kind: 'shape', name: c.name, opacity: 1, strokes: [] }; out.push(run); } run.strokes.push(...c.strokes); if (run.strokes.length > 1 && !/Drawing/.test(run.name)) run.name = (n.name || 'Shapes') + ' drawing'; }
      else { run = null; out.push(c); }
    }
    n.children = out; return n;
  }
  function flattenAll(n) { const strokes = []; (function w(x) { if (x.kind === 'group') x.children.forEach(w); else if (x.kind === 'shape' && !x.isMask) x.strokes.forEach(s => { if (x.opacity < 1) s.op = U.r2((s.op ?? 1) * x.opacity); strokes.push(s); }); })(n); return strokes; }

  async function build(n, f, ox, oy, parentC) {
    const b = bbox(n), cx = ((b.x0 + b.x1) / 2 - ox) * f, cy = ((b.y0 + b.y1) / 2 - oy) * f;
    const at = { x: U.r1(cx - parentC.x), y: U.r1(cy - parentC.y), opacity: U.r2(n.opacity) };
    const local = (x, y) => [U.r2((x - ox) * f - cx), U.r2((y - oy) * f - cy)];
    if (n.kind === 'group') {
      const kids = []; for (const c of n.children) { const o = await build(c, f, ox, oy, { x: cx, y: cy }); if (o) kids.push(o); }
      kids.reverse(); // SVG paints later children on top; our list has the front layer first
      return kids.length ? Object.assign(tree.makeGroup(kids, n.name || 'SVG', 0, 0, false), at) : null;
    }
    if (n.kind === 'shape') {
      const strokes = n.strokes.map(s => Object.assign({}, s, { subs: s.subs.map(sb => ({ p: G.mapList(sb.p, local), cl: sb.cl })), s: U.r2((s.s || 0) * f), dash: s.dash && s.dash.map(v => v * f) }));
      strokes.forEach(s => { if (!s.dash) delete s.dash; });
      return tree.make('draw', Object.assign({ name: n.name, frames: [{ strokes }] }, n.isMask ? { isMask: 'in', maskVisible: false } : {}, at));
    }
    if (n.kind === 'text') return tree.make('text', Object.assign({ name: n.name, text: n.text, fontSize: U.r1(n.fontSize * f), color: n.color, weight: n.weight, bold: n.weight >= 600, font: n.font, rot: U.r1(n.rot) }, at));
    if (n.kind === 'image') { try { const m = await SB.media.add(U.dataURLToBlob(n.href), n.name + '.png', 'image'); return tree.make('image', Object.assign({ name: n.name, mediaId: m.id, w: U.r1(n.w * f), h: U.r1(n.h * f), rot: U.r1(n.rot) }, at)); } catch (e) { return null; } }
    return null;
  }

  SB.svg = {
    read, parsePath,
    /** Ask how to bring the SVG in, then add it. */
    async importFile(file) { return SB.svg.importText(await file.text(), file.name.replace(/\.svg$/i, '').slice(0, 40)); },
    /** Import SVG text. mode: 'layers' | 'groups' | 'flat' | 'image', or ask. */
    async importText(text, name, mode) {
      let info; try { info = read(text); } catch (e) { return SB.toast(e.message); }
      if (!info.root) return SB.toast(`${name} has nothing to draw.`);
      const groups = (function c(n) { return n.kind === 'group' ? 1 + n.children.reduce((a, x) => a + c(x), 0) : 0; })(info.root) - 1;
      const big = info.count > 150;
      if (!mode) mode = await SB.dialog.ask(`Import ${name}`,
        `${info.count} shape${info.count === 1 ? '' : 's'}${groups > 0 ? ` in ${groups} group${groups === 1 ? '' : 's'}` : ''}${info.masks ? `, ${info.masks} mask${info.masks === 1 ? '' : 's'}` : ''}. Vector layers keep the SVG's groups as groups in the timeline, and every path stays editable.${big ? ' This file has many shapes, so “Groups only” is lighter.' : ''}`,
        [{ v: 'image', label: 'As one image' }, { v: 'flat', label: 'One drawing' }, { v: 'groups', label: 'Groups only', primary: big }, { v: 'layers', label: 'Every shape a layer', primary: !big }]);
      if (!mode) return;
      if (mode === 'image') return SB.io.addImageBlob(new Blob([text], { type: 'image/svg+xml' }), name);
      const p = S.project, b = bbox(info.root), bw = Math.max(1, b.x1 - b.x0), bh = Math.max(1, b.y1 - b.y0), f = Math.min(p.w * 0.8 / bw, p.h * 0.8 / bh);
      let root = info.root;
      if (mode === 'flat') root = { kind: 'shape', name, opacity: 1, strokes: flattenAll(root) };
      else { if (mode === 'groups') root = mergeShapes(root); root = simplify(root); }
      root._b = null; if (root.kind === 'group') root.name = root.name || name; else if (mode !== 'flat' && !root.named) root.name = name;
      const o = await build(root, f, b.x0 + bw / 2 - (p.w / 2) / f, b.y0 + bh / 2 - (p.h / 2) / f, { x: 0, y: 0 });
      if (!o) return SB.toast('Nothing to import.');
      if (o.type === 'group') o.name = name;
      tree.add(o); SB.tool.set('select'); return o;
      SB.toast(o.type === 'group' ? `Added ${name} with its groups. Open the arrows in the timeline to see the layers.` : `Added ${name}.`);
    },
  };
})(window.SB);
