/* Draws the whole scene for a time: background, then layers back to front,
   with effects, masks and frame strokes. Also bounds and hit testing. */
'use strict';
(function (SB) {
  const U = SB.util, S = SB.state, TR = SB.tracks, tree = SB.tree, X = SB.xf;

  /** A light copy of o with animated content and effect values filled in for time lt.
      scene.viewExtra(o, lt) can add values too (controllers drive colors and sizes this way). */
  function viewOf(o, lt) {
    let need = false; for (const id in o.tracks) if (!TR.TRANSFORM_SET.has(id) && id !== 'frame' && (!id.includes(':') || id.startsWith('fx:'))) { need = true; break; }
    const extra = scene.viewExtra ? scene.viewExtra(o, lt) : null, fv = o.type === 'shape' && o.frames && o.frames.length > 1 ? SB.frames.shapeView(o, lt) : null; // fv: that frame's own shape
    if (!need && !extra && !fv) return o;
    const v = Object.assign({}, o); v.effects = (o.effects || []).map(e => Object.assign({}, e));
    const put = (id, val) => { const parts = id.split(':'); if (parts[0] === 'fx' && parts.length === 3) { const e = v.effects.find(x => x.id === parts[1]); if (e) e[parts[2]] = parts[2] === 'on' ? !!val : val; } else if (parts.length === 1) v[id] = val; };
    for (const id in o.tracks) { if (TR.TRANSFORM_SET.has(id) || id === 'frame') continue; put(id, TR.value(o, id, lt)); }
    if (fv) Object.assign(v, fv);
    if (extra) for (const id in extra) if (!TR.TRANSFORM_SET.has(id)) put(id, extra[id]);
    return v;
  }
  /** Animated lines: their clock T (the layer's time, run faster or slower by 'lnSp' — summed up, so keyed speed changes never jump) and 'lnAmt'. */
  function lineMotion(o, v, lt) {
    const L = lt + (o.phase || 0); if (o.type !== 'draw') return { T: L };
    let T = L * (v.lnSp ?? 1);
    if (TR.animated(o, 'lnSp')) { const n = Math.min(2000, Math.max(2, Math.ceil(Math.abs(lt) * 30))), dt = lt / n; T = (o.phase || 0) * TR.value(o, 'lnSp', 0); for (let i = 0; i < n; i++) T += TR.value(o, 'lnSp', (i + 0.5) * dt) * dt; }
    return { T, amt: v.lnAmt ?? 1 };
  }
  const isoNeeded = st => !!(st.wave || st.boil || st.filters.length || st.glow || st.dblur || st.opacity < 0.999 || st.styles.length || st.trx || st.tints || (st.blend && st.blend !== 'normal'));
  const glowColor = o => o.type === 'text' ? o.color : o.type === 'shape' ? (o.fillOn ? o.fill : o.stroke) : '#7B5CFF';

  function wipe(c, b, clip) {
    if (!b) return; const w = b.x1 - b.x0, h = b.y1 - b.y0, u = clip.u; c.beginPath();
    if (clip.dir === 'left') c.rect(b.x0, b.y0, w * u, h); else if (clip.dir === 'right') c.rect(b.x1 - w * u, b.y0, w * u, h);
    else if (clip.dir === 'up') c.rect(b.x0, b.y0, w, h * u); else c.rect(b.x0, b.y1 - h * u, w, h * u);
    c.clip();
  }
  // ---------- layer styles: drop shadow, outline, inner shadow, each with a blend mode
  const BLEND_OP = { normal: 'source-over', add: 'lighter' };
  const op = b => BLEND_OP[b] || b || 'source-over';
  function fresh(key, W, H) { const c = U.poolCtx(W, H, key); c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1; c.filter = 'none'; c.clearRect(0, 0, W, H); return c; }
  /** The layer's shape filled with one color. */
  function silhouette(cv, color, key) { const c = fresh(key, cv.width, cv.height); c.drawImage(cv, 0, 0); c.globalCompositeOperation = 'source-in'; c.fillStyle = color; c.fillRect(0, 0, cv.width, cv.height); c.globalCompositeOperation = 'source-over'; return c; }
  /** Grow a silhouette by r pixels, smoothly at any size: dilate in steps that double (1, 1, 2, 4, 8…),
      each step copying the shape around a 24-point circle, so copies always overlap and edges stay round. */
  function dilate(src, r, W, H) {
    const steps = []; let done = 0, s = Math.min(1, r); while (done < r - 1e-3) { const st = Math.min(s, r - done); steps.push(st); done += st; s = Math.max(1, done); }
    let a = fresh(':st2', W, H); a.drawImage(src, 0, 0); let b = fresh(':st5', W, H);
    for (const st of steps) { b.clearRect(0, 0, W, H); const n = st < 2 ? 12 : 24; for (let i = 0; i < n; i++) { const t = i / n * Math.PI * 2; b.drawImage(a.canvas, Math.cos(t) * st, Math.sin(t) * st); } b.drawImage(a.canvas, 0, 0); [a, b] = [b, a]; }
    return a.canvas;
  }
  /** src blurred by bl px, worked out at ½ or ¼ size and scaled back up. */
  function softened(src, bl, W, H) {
    const k = bl > 24 ? 0.25 : 0.5, w = Math.max(1, Math.round(W * k)), hh = Math.max(1, Math.round(H * k)), a = fresh(':sb1', w, hh);
    a.filter = `blur(${(bl * k).toFixed(2)}px)`; a.drawImage(src, 0, 0, w, hh); a.filter = 'none';
    const O = fresh(':sb2', W, H); O.imageSmoothingEnabled = true; O.drawImage(a.canvas, 0, 0, W, H); return O.canvas;
  }
  /** Draw the outer styles (drop shadows, outlines) onto ctx; return the layer with its inner shadows. */
  function styled(ctx, cv, st, sc) {
    const W = cv.width, H = cv.height;
    for (const s of st.styles) {
      if (s.kind === 'inner') continue; let src = silhouette(cv, s.color, ':st1').canvas;
      if (s.kind === 'outline') src = dilate(src, Math.max(0.5, s.size * sc), W, H);
      else if (s.kind === 'drop' && s.size > 0) src = dilate(src, s.size * sc, W, H); // a bigger shadow: grown around the layer's shape
      const bl = s.blur * sc; if (bl > 6) src = softened(src, bl, W, H); // big blurs are made on a smaller copy (much faster, looks the same)
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = U.clamp(st.opacity * s.alpha, 0, 1); ctx.globalCompositeOperation = op(s.blend); if (s.blur && bl <= 6) ctx.filter = `blur(${bl.toFixed(2)}px)`; ctx.drawImage(src, s.dx * sc, s.dy * sc); ctx.restore();
    }
    const inner = st.styles.filter(s => s.kind === 'inner'); if (!inner.length) return cv;
    const L = fresh(':st3', W, H); L.drawImage(cv, 0, 0);
    for (const s of inner) {
      const m = fresh(':st4', W, H); m.fillStyle = s.color; m.fillRect(0, 0, W, H); m.globalCompositeOperation = 'destination-out'; if (s.blur) m.filter = `blur(${(s.blur * sc).toFixed(2)}px)`; m.drawImage(cv, s.dx * sc, s.dy * sc); m.filter = 'none'; m.globalCompositeOperation = 'destination-in'; m.drawImage(cv, 0, 0);
      L.globalCompositeOperation = op(s.blend); L.globalAlpha = U.clamp(s.alpha, 0, 1); L.drawImage(m.canvas, 0, 0); L.globalAlpha = 1; L.globalCompositeOperation = 'destination-in'; L.drawImage(cv, 0, 0); L.globalCompositeOperation = 'source-over';
    }
    return L.canvas;
  }
  /** Change color effects: fill (solid color), tint (keeps light and shade), multiply. Each mixed in by its amount. */
  function tinted(cv, tints) {
    const W = cv.width, H = cv.height, L = fresh(':ti1', W, H); L.drawImage(cv, 0, 0);
    for (const t of tints) {
      const m = fresh(':ti2', W, H); m.drawImage(cv, 0, 0); m.globalCompositeOperation = t.mode === 'tint' ? 'color' : t.mode === 'multiply' ? 'multiply' : 'source-in';
      m.fillStyle = t.color; m.fillRect(0, 0, W, H); if (t.mode !== 'fill') { m.globalCompositeOperation = 'destination-in'; m.drawImage(cv, 0, 0); }
      L.globalAlpha = U.clamp(t.amt, 0, 1); L.globalCompositeOperation = 'source-atop'; L.drawImage(m.canvas, 0, 0); L.globalAlpha = 1; L.globalCompositeOperation = 'source-over';
    }
    return L.canvas;
  }
  /** Smear the layer along a direction: copies along the line, averaged. */
  function dirBlurred(cv, b, sc) {
    const W = cv.width, H = cv.height, len = b.len * sc, an = b.angle * Math.PI / 180, cx = Math.cos(an), cy = Math.sin(an); if (len < 0.5) return cv;
    // a box blur along the line made by doubling: each pass adds the picture to itself shifted (½ + ½, additive), so 2ⁿ evenly
    // spaced copies take n passes; few passes keep it smooth (no 8-bit banding). Very long smears work on a ½-size copy.
    const k = len > 90 ? 0.5 : 1, w = Math.max(1, Math.round(W * k)), hh = Math.max(1, Math.round(H * k)), lk = len * k;
    const m = U.clamp(Math.ceil(Math.log2(lk + 1)), 1, 8), step = lk / (Math.pow(2, m) - 1);
    let A = fresh(':db0', w, hh), B = fresh(':db1', w, hh); A.imageSmoothingEnabled = true; A.drawImage(cv, -cx * lk / 2, -cy * lk / 2, w, hh); // centred on the layer
    for (let j = 0; j < m; j++) { const d = step * Math.pow(2, j); B.clearRect(0, 0, w, hh); B.globalCompositeOperation = 'lighter'; B.globalAlpha = 0.5; B.drawImage(A.canvas, 0, 0); B.drawImage(A.canvas, cx * d, cy * d); B.globalAlpha = 1; B.globalCompositeOperation = 'source-over'; [A, B] = [B, A]; }
    const O = fresh(':db2', W, H); O.imageSmoothingEnabled = true; O.imageSmoothingQuality = 'high'; if (step > 1.2) O.filter = `blur(${Math.min(3, step / (2 * k)).toFixed(2)}px)`; O.drawImage(A.canvas, 0, 0, W, H); O.filter = 'none'; return O.canvas;
  }
  /** src blurred by bl px, worked out at ½ or ¼ size and scaled back up. */
  function softened(src, bl, W, H) {
    const k = bl > 24 ? 0.25 : 0.5, w = Math.max(1, Math.round(W * k)), hh = Math.max(1, Math.round(H * k)), a = fresh(':sb1', w, hh);
    a.filter = `blur(${(bl * k).toFixed(2)}px)`; a.drawImage(src, 0, 0, w, hh); a.filter = 'none';
    const O = fresh(':sb2', W, H); O.imageSmoothingEnabled = true; O.drawImage(a.canvas, 0, 0, W, H); return O.canvas;
  }
  /** Draw the outer styles (drop shadows, outlines) onto ctx; return the layer with its inner shadows. */
  function styled(ctx, cv, st, sc) {
    const W = cv.width, H = cv.height;
    for (const s of st.styles) {
      if (s.kind === 'inner') continue; let src = silhouette(cv, s.color, ':st1').canvas;
      if (s.kind === 'outline') src = dilate(src, Math.max(0.5, s.size * sc), W, H);
      else if (s.kind === 'drop' && s.size > 0) src = dilate(src, s.size * sc, W, H); // a bigger shadow: grown around the layer's shape
      const bl = s.blur * sc; if (bl > 6) src = softened(src, bl, W, H); // big blurs are made on a smaller copy (much faster, looks the same)
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = U.clamp(st.opacity * s.alpha, 0, 1); ctx.globalCompositeOperation = op(s.blend); if (s.blur && bl <= 6) ctx.filter = `blur(${bl.toFixed(2)}px)`; ctx.drawImage(src, s.dx * sc, s.dy * sc); ctx.restore();
    }
    const inner = st.styles.filter(s => s.kind === 'inner'); if (!inner.length) return cv;
    const L = fresh(':st3', W, H); L.drawImage(cv, 0, 0);
    for (const s of inner) {
      const m = fresh(':st4', W, H); m.fillStyle = s.color; m.fillRect(0, 0, W, H); m.globalCompositeOperation = 'destination-out'; if (s.blur) m.filter = `blur(${(s.blur * sc).toFixed(2)}px)`; m.drawImage(cv, s.dx * sc, s.dy * sc); m.filter = 'none'; m.globalCompositeOperation = 'destination-in'; m.drawImage(cv, 0, 0);
      L.globalCompositeOperation = op(s.blend); L.globalAlpha = U.clamp(s.alpha, 0, 1); L.drawImage(m.canvas, 0, 0); L.globalAlpha = 1; L.globalCompositeOperation = 'destination-in'; L.drawImage(cv, 0, 0); L.globalCompositeOperation = 'source-over';
    }
    return L.canvas;
  }
  /** Change color effects: fill (solid color), tint (keeps light and shade), multiply. Each mixed in by its amount. */
  function tinted(cv, tints) {
    const W = cv.width, H = cv.height, L = fresh(':ti1', W, H); L.drawImage(cv, 0, 0);
    for (const t of tints) {
      const m = fresh(':ti2', W, H); m.drawImage(cv, 0, 0); m.globalCompositeOperation = t.mode === 'tint' ? 'color' : t.mode === 'multiply' ? 'multiply' : 'source-in';
      m.fillStyle = t.color; m.fillRect(0, 0, W, H); if (t.mode !== 'fill') { m.globalCompositeOperation = 'destination-in'; m.drawImage(cv, 0, 0); }
      L.globalAlpha = U.clamp(t.amt, 0, 1); L.globalCompositeOperation = 'source-atop'; L.drawImage(m.canvas, 0, 0); L.globalAlpha = 1; L.globalCompositeOperation = 'source-over';
    }
    return L.canvas;
  }
  /** Smear the layer along a direction: copies along the line, averaged. */
  function dirBlurred(cv, b, sc) {
    const W = cv.width, H = cv.height, len = b.len * sc, a = b.angle * Math.PI / 180; if (len < 0.5) return cv;
    // a smear is soft anyway: work on a smaller copy (¼ for long smears), then scale back up
    const k = len > 40 ? 0.25 : len > 12 ? 0.5 : 1, w = Math.max(1, Math.round(W * k)), hh = Math.max(1, Math.round(H * k)), sm = fresh(':db0', w, hh), L = fresh(':db1', w, hh);
    sm.imageSmoothingEnabled = true; sm.drawImage(cv, 0, 0, w, hh); const lk = len * k, n = U.clamp(Math.ceil(lk / 1.5), 2, 32);
    for (let i = 0; i < n; i++) { const d = (i / (n - 1) - 0.5) * lk; L.globalAlpha = 1 / (i + 1); L.drawImage(sm.canvas, Math.cos(a) * d, Math.sin(a) * d); }
    L.globalAlpha = 1; if (k === 1) return L.canvas;
    const O = fresh(':db2', W, H); O.imageSmoothingEnabled = true; O.drawImage(L.canvas, 0, 0, W, H); return O.canvas;
  }
  /** Copy an isolated layer canvas onto ctx with opacity, filters, glow, wave, layer styles and its blend mode. */
  function composite(ctx, cv, st, sc, gcol, warpBoil) {
    if (st.trx && SB.transitions) cv = SB.transitions.composite(cv, st._M, st._B, st.trx.tr, st.trx.t); // designed transitions: masks, cuts, pieces
    if (st.tints) cv = tinted(cv, st.tints);
    if (st.dblur) cv = dirBlurred(cv, st.dblur, sc);
    if (st.styles.length) cv = styled(ctx, cv, st, sc);
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = U.clamp(st.opacity, 0, 1); if (st.blend && st.blend !== 'normal') ctx.globalCompositeOperation = op(st.blend);
    if (st.filters.length) ctx.filter = st.filters.join(' ');
    if (st.glow) { ctx.shadowColor = st.glowColor || gcol; ctx.shadowBlur = st.glow * sc; }
    const W = cv.width, H = cv.height, bw = warpBoil && st.boil;
    if (st.wave || bw) {
      const strip = Math.max(2, Math.round(3 * Math.max(1, sc * 1.4)));
      for (let y = 0; y < H; y += strip) {
        let dx = 0; const yp = y / sc;
        if (st.wave) dx += Math.sin(yp * 0.028 + st.wave.T * 5) * st.wave.amp * sc;
        if (bw) dx += U.noise(yp * 0.02 + st.boil.step * 7.31, st.boil.seed) * st.boil.amp * 1.4 * sc;
        ctx.drawImage(cv, 0, y, W, strip, dx, y, W, strip);
      }
    } else ctx.drawImage(cv, 0, 0);
    ctx.restore();
  }

  const skip = o => { const def = SB.types.get(o.type); return !def || !def.visual || def.render === false || (o.hidden && !(S.ixPlay && o._ix && o._ix.visible === 1)); }; // interactions can show a hidden layer
  /** Draw a list back to front. time is on this list's clock (see tree.js). */
  function renderList(ctx, list, time, M, opt, sc, depth) {
    if (opt.T == null) opt.T = S.time;
    if (!opt.root) opt.root = M; // the matrix of the stage itself, used to place layers that follow bones
    for (let i = list.length - 1; i >= 0; i--) {
      const o = list[i]; if (skip(o)) continue;
      const u = tree.inner(o, time); let lt = u == null ? NaN : u - o.start; // a cut clip shows nothing between its parts
      if (!(lt >= 0 && lt < o.dur)) { if (!(opt.showSel && opt.showSel.has(o.id))) continue; lt = U.clamp(tree.inner(o, time, true) - o.start, 0, Math.max(0, o.dur - 1e-4)); }
      for (const f of scene.before) f(ctx, o, opt, sc);
      if (o.type === 'group') drawGroup(ctx, o, lt, time, M, opt, sc, depth); else drawLeaf(ctx, o, lt, M, opt, sc);
    }
  }
  /** The matrices of a layer and its copies (Duplicate effect: a grid of cols × rows, dx / dy apart, on its parent's axes). */
  function copiesOf(st, M, Mo) {
    const c = st.copies; if (!c || (c.cols <= 1 && c.rows <= 1)) return [Mo];
    const out = [], Mi = M.inverse();
    for (let j = 0; j < c.rows; j++) for (let i = 0; i < c.cols; i++) out.push(i || j ? M.multiply(new DOMMatrix().translateSelf(i * c.dx, j * c.dy)).multiply(Mi).multiply(Mo) : Mo);
    return out;
  }
  /** Layer matrix on the canvas, carried by a bone when the layer is attached to one. */
  function placed(o, M, st, opt) {
    let Mo = M.multiply(X.matrix(st));
    const D = X.follow && o.bind ? X.follow(o, opt.T) : null;
    if (D) Mo = opt.root.multiply(D).multiply(opt.root.inverse()).multiply(Mo);
    return Mo;
  }
  function drawGroup(ctx, g, lt, time, M, opt, sc, depth) {
    const v = viewOf(g, lt), st = SB.fx.state(v, lt, TR.transform(g, lt), { noFx: opt.noFx && opt.noFx.has(g.id), sc }); if (g.blend) st.blend = g.blend;
    if (opt.alphaMul != null) { st.opacity *= opt.alphaMul; opt = Object.assign({}, opt, { alphaMul: null }); }
    if (st.opacity <= 0.002 || st.sx === 0) return;
    const ct = g.seq ? lt + (g.inPoint || 0) : g.start + lt; // a shot runs on its own clock
    const GM = placed(g, M, st, opt), mk = SB.masks ? SB.masks.of(g, ct) : null;
    // a visible mask shape is drawn first, so it always sits behind what it masks
    if (mk && mk.maskVisible) renderList(ctx, [mk], ct, GM, Object.assign({}, opt, { alphaMul: st.opacity }), sc, depth + 1);
    const iso = isoNeeded(st) || !!mk, W = ctx.canvas.width, H = ctx.canvas.height, L = iso ? U.poolCtx(W, H, ':g' + depth) : ctx;
    if (iso) { L.setTransform(1, 0, 0, 1, 0, 0); L.clearRect(0, 0, W, H); }
    if (st.trx) { st._M = GM; st._B = SB.types.get('group').bounds(g); }
    if (st.clip) { L.save(); L.setTransform(GM); wipe(L, SB.types.get('group').bounds(g), st.clip); }
    for (const Gk of copiesOf(st, M, GM)) renderList(L, mk ? g.children.filter(c => c !== mk) : g.children, ct, Gk, opt, sc, depth + 1);
    if (st.clip) L.restore();
    if (mk) {
      const MK = U.poolCtx(W, H, ':m' + depth); MK.setTransform(1, 0, 0, 1, 0, 0); MK.clearRect(0, 0, W, H);
      renderList(MK, [mk], ct, GM, Object.assign({}, opt, { noFx: null }), sc, depth + 1);
      L.save(); L.setTransform(1, 0, 0, 1, 0, 0); L.globalCompositeOperation = mk.isMask === 'out' ? 'destination-out' : 'destination-in'; L.drawImage(MK.canvas, 0, 0); L.restore();
    }
    if (iso) composite(ctx, L.canvas, st, sc, glowColor(g), true);
  }
  function drawLeaf(ctx, o, lt, M, opt, sc) {
    const def = SB.types.get(o.type), v = viewOf(o, lt), st = SB.fx.state(v, lt, TR.transform(o, lt), { noFx: opt.noFx && opt.noFx.has(o.id), sc }); if (o.blend) st.blend = o.blend;
    if (opt.alphaMul != null) st.opacity *= opt.alphaMul;
    if (st.opacity <= 0.002 || st.sx === 0) return;
    const fi = SB.frames.index(o, lt); let fr = o.frames[fi] || o.frames[0] || { strokes: [] };
    // between two frames of a drawing: their lines morph into each other, or (when they can't) the two crossfade
    const chg = (o.type === 'draw' || o.type === 'shape') && o.frames.length > 1 ? SB.frames.change(o, lt) : null; let fade = null;
    if (chg) { const sh = o.type === 'shape', withShape = (i, list) => sh ? [def.asPath(SB.frames.shapeAt(o, i, v))].concat(list) : list; // a shape morphs (or fades) its own outline too
      const pa = withShape(chg.a, (o.frames[chg.a] || { strokes: [] }).strokes), pb = withShape(chg.b, (o.frames[chg.b] || fr).strokes), pairs = chg.mode === 'morph' ? SB.frames.morphPairs(pa, pb) : null; if (pairs) fr = { strokes: SB.frames.morphAt(pairs, chg.u), noBase: sh }; else { fr = sh ? { strokes: pb, noBase: true } : o.frames[chg.b] || fr; fade = { prev: pa, u: chg.u }; } }
    const vec = o.type === 'draw' || o.type === 'shape';
    const Mo = placed(o, M, st, opt), map = scene.deformer && o.bind ? scene.deformer(o, opt.T, Mo, opt.root) : null;
    const iso = !!(st.shatter && st.shatter.u > 0) || !!st.wave || (st.boil && !vec) || fr.strokes.some(s => s.er) || st.styles.length > 0 || !!st.trx || !!st.tints || !!(st.blend && st.blend !== 'normal') || !!st.copies || !!st.dblur;
    if (st.trx) { st._M = Mo; st._B = scene.bounds(v, lt, fi); }
    const W = ctx.canvas.width, H = ctx.canvas.height, t = iso ? U.poolCtx(W, H, ':s') : ctx;
    if (iso) { t.setTransform(1, 0, 0, 1, 0, 0); t.clearRect(0, 0, W, H); }
    for (const Mk of copiesOf(st, M, Mo)) { // the Duplicate effect draws the layer several times
      t.save(); t.setTransform(Mk);
      if (!iso) { t.globalAlpha = U.clamp(st.opacity, 0, 1); if (st.filters.length) t.filter = st.filters.join(' '); if (st.glow) { t.shadowColor = st.glowColor || glowColor(v); t.shadowBlur = st.glow * sc; } }
      if (st.clip) wipe(t, scene.bounds(v, lt, fi), st.clip);
      const sopt = Object.assign({ boil: vec ? st.boil : null, prog: st.prog, dash: st.dash, map }, lineMotion(o, v, lt)); // T, amt: animated brushes
      if (map && !vec) meshWarp(t, v, fr, st, map, Mk, fi, def, lt);
      else if (fade) { const a0 = t.globalAlpha; t.globalAlpha = a0 * (1 - fade.u); SB.strokes.draw(t, fade.prev, sopt); t.globalAlpha = a0 * fade.u; SB.strokes.draw(t, fr.strokes, sopt); t.globalAlpha = a0; }
      else { if (def.draw) def.draw.call(def, t, v, fr, st, sopt, lt); SB.strokes.draw(t, fr.strokes, sopt); } // lt: the layer's own time (particles)
      t.restore();
    }
    if (iso && st.shatter && st.shatter.u > 0 && SB.breakFx) shatter(t, st, v, lt, fi, Mo);
    if (iso) composite(ctx, t.canvas, st, sc, glowColor(v), !vec);
  }
  /** Break apart (js/effects/break.js): cut the drawn layer into pieces flying off. */
  let shCv = null;
  function shatter(t, st, v, lt, fi, Mo) {
    const b = scene.bounds(v, lt, fi); if (!b) return; const W = t.canvas.width, H = t.canvas.height, q = U.emptyBox();
    [[b.x0, b.y0], [b.x1, b.y0], [b.x1, b.y1], [b.x0, b.y1]].forEach(([x, y]) => { const p = Mo.transformPoint(U.pt(x, y)); U.growBox(q, p.x, p.y); });
    const x0 = Math.max(0, Math.floor(q.x0) - 4), y0 = Math.max(0, Math.floor(q.y0) - 4), x1 = Math.min(W, Math.ceil(q.x1) + 4), y1 = Math.min(H, Math.ceil(q.y1) + 4), w = x1 - x0, h = y1 - y0; if (w < 2 || h < 2) return;
    if (!shCv) shCv = document.createElement('canvas'); if (shCv.width < w || shCv.height < h) { shCv.width = Math.max(shCv.width, w); shCv.height = Math.max(shCv.height, h); } const tmp = shCv.getContext('2d'); tmp.setTransform(1, 0, 0, 1, 0, 0); tmp.clearRect(0, 0, shCv.width, shCv.height); tmp.drawImage(t.canvas, x0, y0, w, h, 0, 0, w, h);
    const sh = st.shatter, pcs = SB.breakFx.cut(sh.id || 'l', w, h, sh.amt, sh.dir, sh.seed);
    t.save(); t.setTransform(1, 0, 0, 1, 0, 0); t.clearRect(x0, y0, w, h); t.translate(x0, y0); SB.breakFx.draw(t, tmp.canvas, pcs, sh.u, sh.amt); t.restore();
  }
  /** Bend a picture (text, image, video) with a bone rig: draw it flat, then warp it with a triangle mesh. */
  let meshCv = null;
  function meshWarp(t, v, fr, st, map, Mo, fi, def, lt) {
    const b = scene.bounds(v, lt, fi); if (!b) return;
    const bw = b.x1 - b.x0, bh = b.y1 - b.y0, k = U.clamp(U.matScale(Mo) * 1.2, 0.05, 2048 / Math.max(bw, bh));
    if (!meshCv) meshCv = document.createElement('canvas');
    const cw = Math.max(1, Math.ceil(bw * k)), ch = Math.max(1, Math.ceil(bh * k)); if (meshCv.width !== cw || meshCv.height !== ch) { meshCv.width = cw; meshCv.height = ch; }
    const mc = meshCv.getContext('2d'); mc.setTransform(1, 0, 0, 1, 0, 0); mc.clearRect(0, 0, cw, ch); mc.setTransform(k, 0, 0, k, -b.x0 * k, -b.y0 * k);
    if (def.draw) def.draw.call(def, mc, v, fr, st, {}); SB.strokes.draw(mc, fr.strokes, {});
    const N = 12, V = [];
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) { const x = b.x0 + bw * i / N, y = b.y0 + bh * j / N; V.push({ sx: (x - b.x0) * k, sy: (y - b.y0) * k, d: map(x, y) }); }
    const at = (i, j) => V[j * (N + 1) + i];
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const a = at(i, j), bb = at(i + 1, j), c = at(i + 1, j + 1), d = at(i, j + 1); tri(t, meshCv, a, bb, c); tri(t, meshCv, a, c, d); }
  }
  function tri(c, img, p0, p1, p2) {
    const [x0, y0] = p0.d, [x1, y1] = p1.d, [x2, y2] = p2.d, cx = (x0 + x1 + x2) / 3, cy = (y0 + y1 + y2) / 3, ex = 1.1 / (U.matScale(c.getTransform()) || 1);
    const out = (x, y) => { const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy) || 1; return [x + dx / d * ex, y + dy / d * ex]; };
    const q0 = out(x0, y0), q1 = out(x1, y1), q2 = out(x2, y2);
    c.save(); c.beginPath(); c.moveTo(q0[0], q0[1]); c.lineTo(q1[0], q1[1]); c.lineTo(q2[0], q2[1]); c.closePath(); c.clip();
    const s0x = p0.sx, s0y = p0.sy, s1x = p1.sx, s1y = p1.sy, s2x = p2.sx, s2y = p2.sy;
    const den = s0x * (s1y - s2y) + s1x * (s2y - s0y) + s2x * (s0y - s1y); if (Math.abs(den) < 1e-9) { c.restore(); return; }
    const a = (x0 * (s1y - s2y) + x1 * (s2y - s0y) + x2 * (s0y - s1y)) / den, b = (y0 * (s1y - s2y) + y1 * (s2y - s0y) + y2 * (s0y - s1y)) / den;
    const cc = (x0 * (s2x - s1x) + x1 * (s0x - s2x) + x2 * (s1x - s0x)) / den, d = (y0 * (s2x - s1x) + y1 * (s0x - s2x) + y2 * (s1x - s0x)) / den;
    const e = (x0 * (s1x * s2y - s2x * s1y) + x1 * (s2x * s0y - s0x * s2y) + x2 * (s0x * s1y - s1x * s0y)) / den;
    const f = (y0 * (s1x * s2y - s2x * s1y) + y1 * (s2x * s0y - s0x * s2y) + y2 * (s0x * s1y - s1x * s0y)) / den;
    c.transform(a, b, cc, d, e, f); c.drawImage(img, 0, 0); c.restore();
  }

  function drawBackground(ctx, time, sc, o = [0, 0]) {
    const p = S.project; ctx.globalAlpha = 1; ctx.filter = 'none'; ctx.fillStyle = p.bg || '#fff';
    if (o[0] || o[1]) { ctx.setTransform(sc, 0, 0, sc, o[0], o[1]); ctx.fillRect(0, 0, p.w, p.h); } else { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height); }
    const m = p.bgImage && SB.media.get(p.bgImage); if (!m || !m.el) return;
    const img = m.el, iw = m.w, ih = m.h, W = p.w, H = p.h, fit = p.bgFit || 'cover', s0 = (p.bgScale ?? 100) / 100;
    const px = (p.bgPosX ?? 50) / 100, py = (p.bgPosY ?? 50) / 100, sx = (p.bgScrollX || 0) * time, sy = (p.bgScrollY || 0) * time;
    ctx.save(); ctx.setTransform(sc, 0, 0, sc, o[0], o[1]); ctx.globalAlpha = U.clamp((p.bgAlpha ?? 100) / 100, 0, 1);
    ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();
    if (fit === 'stretch') ctx.drawImage(img, sx, sy, W, H);
    else if (fit === 'cover' || fit === 'contain' || fit === 'none') {
      const s = fit === 'cover' ? Math.max(W / iw, H / ih) * s0 : fit === 'contain' ? Math.min(W / iw, H / ih) * s0 : s0;
      const dw = iw * s, dh = ih * s; ctx.drawImage(img, (W - dw) * px + sx, (H - dh) * py + sy, dw, dh);
    } else {
      const pat = ctx.createPattern(img, fit), tw = iw * s0, th = ih * s0, ox = (W - tw) * px + sx, oy = (H - th) * py + sy;
      if (pat.setTransform) pat.setTransform(new DOMMatrix().translateSelf(ox, oy).scaleSelf(s0, s0));
      ctx.fillStyle = pat;
      if (fit === 'repeat') ctx.fillRect(0, 0, W, H); else if (fit === 'repeat-x') ctx.fillRect(0, oy, W, th); else ctx.fillRect(ox, 0, tw, H);
    }
    ctx.restore();
  }

  const scene = SB.scene = {
    viewOf, lineMotion, composite, renderList, drawBackground, placed, tinted,
    // hooks filled in by js/rig/:
    deformer: null,   // (o, T, layerMatrix, stageMatrix) => (x, y) => [x, y]: bends a layer with its bones
    viewExtra: null,  // (o, lt) => { prop: value } set by controllers
    before: [],       // (ctx, o, opt, sc) called before each layer is drawn (ropes)
    /** Render everything at time t into ctx, scaled by sc (canvas px per project px). */
    /** opt.origin: where the screen's top-left is on the canvas (device pixels), when the canvas shows only part of it. */
    render(ctx, t, sc, opt = {}) { SB.stamp++; opt.T = t; const o = opt.origin || [0, 0]; if (!opt.noBg) drawBackground(ctx, t, sc, o); renderList(ctx, S.objects, t, o[0] || o[1] ? new DOMMatrix([sc, 0, 0, sc, o[0], o[1]]) : U.scaleM(sc), opt, sc, 0); },

    /** Box in the object's own coordinates (content plus frame strokes). */
    bounds(o, lt = tree.localTime(o), fi = o.frames && o.frames.length ? SB.frames.index(o, lt) : 0) {
      const def = SB.types.get(o.type); if (!def || !def.visual) return null;
      let b = def.bounds(viewOf(o, lt), fi); b = b ? Object.assign({}, b) : U.emptyBox();
      if (o.type !== 'draw' && o.frames && o.frames[fi]) SB.paths.bounds(o.frames[fi].strokes, b);
      return U.boxOk(b) ? b : null;
    },
    /** Selection box on stage: 4 corners, top-center, up direction and the pivot. */
    box(o) {
      const def = SB.types.get(o && o.type); if (!def || !def.visual) return null;
      const lt = tree.localTime(o), b = scene.bounds(o, lt); if (!b) return null;
      const M = X.world(o), tr = TR.transform(o, lt);
      const pts = [[b.x0, b.y0], [b.x1, b.y0], [b.x1, b.y1], [b.x0, b.y1]].map(([x, y]) => M.transformPoint(U.pt(x, y)));
      const top = M.transformPoint(U.pt((b.x0 + b.x1) / 2, b.y0)), a = Math.atan2(M.b, M.a);
      return { b, M, pts, top, dir: { x: Math.sin(a), y: -Math.cos(a) }, anchor: M.transformPoint(U.pt(tr.ax, tr.ay)), aabb: pts.reduce((q, p) => U.growBox(q, p.x, p.y), U.emptyBox()) };
    },
    inside(o, P, padPx = 8) {
      const b = scene.bounds(o); if (!b) return false;
      const M = X.world(o), l = M.inverse().transformPoint(U.pt(P.x, P.y)), pad = padPx / (SB.view ? SB.view.k() : 1) / U.matScale(M);
      return l.x >= b.x0 - pad && l.x <= b.x1 + pad && l.y >= b.y0 - pad && l.y <= b.y1 + pad;
    },
    /** Top-most layer under a stage point (leaf layers; groups are entered). */
    hit(P, list = tree.rootList()) {
      for (const o of list) {
        const def = SB.types.get(o.type); if (!def.visual || def.render === false || o.hidden || o.locked || tree.soloOut(o) || !tree.inRange(o) || (o.isMask && o.id !== S.sel && !o.maskVisible)) continue;
        if (o.type === 'group') { const r = scene.hit(P, o.children); if (r) return r; continue; }
        if (scene.inside(o, P)) return o;
      }
      return null;
    },
  };
})(window.SB);
