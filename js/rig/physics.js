/* Physics. o.phys = { mode, on, vx, vy, weight, bounce, spin, friction, drag, edges, after, inherit, ... }
   mode 'dynamic'  falls, bounces off the floor/walls and static surfaces, tumbles
        'static'   a surface others collide with (it can still be animated)
        'hang'     hangs from a rig bone on a rope or spring and swings
   'phys:on', 'phys:vx' ... can be keyframed: switch physics on at a moment,
   aim the throw. The motion is simulated once per change and cached.
   Collision shapes follow the layer's outline (or a box, circle, or custom polygon). */
'use strict';
(function (SB) {
  const U = SB.util, S = SB.state, TR = SB.tracks, tree = SB.tree, X = SB.xf, R = SB.rig, pt = U.pt;
  const DEFAULT = () => ({ on: true, mode: 'dynamic', vx: 0, vy: 0, weight: 1, bounce: 0.45, spin: 0, friction: 0.3, drag: 0.05, inherit: true, after: 'hold', edges: 'floor', path: true, rig: null, bone: null, rope: 0, ropeMode: 'rope', swing: true, drawRope: true });

  // 'phys:<key>' reads and writes o.phys; on a rig, 'phys:on' switches its dynamic bones
  TR.prefix('phys', {
    get(o, [k]) { if (o.type === 'rig' && k === 'on') return !o.phys || o.phys.on !== false; return o.phys ? (o.phys[k] ?? DEFAULT()[k]) : (k === 'on' ? false : 0); },
    set(o, [k], v) { if (o.type === 'rig' && k === 'on') { o.phys = Object.assign(o.phys || {}, { on: !!v }); return; } if (o.phys) o.phys[k] = v; },
  });

  const mode = o => (o.phys && o.phys.mode) || 'dynamic';
  const active = o => !!(o && o.phys && o.type !== 'rig' && mode(o) !== 'static' && (o.phys.on || TR.animated(o, 'phys:on')));
  const mainT = (o, lt) => tree.mainAt(o, lt);
  const statics = () => tree.all().filter(o => o.phys && o.phys.mode === 'static' && o.type !== 'rig' && SB.types.get(o.type).visual && !tree.hidden(o));
  const staticSig = () => statics().map(s => [s.id, s.tracks, s.x, s.y, s.rot, s.scale, s.ax, s.ay, s.w, s.h, s.shape, s.fontSize, s.start, s.dur, s.phys, R.ancSig(s)]);
  /** Where a hanging layer's rope starts: the bone's tip as it is posed now (along the curve of a bent bone). */
  function hangAnchor(o, T) {
    const p = o.phys, rig = p && tree.find(p.rig), b = rig && R.boneById(rig, p.bone); if (!b) return null;
    const q = R.poseAt(rig, T)[b.id]; if (!q) return null; const RW = X.worldAt(rig, T);
    if (q.chain && q.chain.length) { const e = q.chain[q.chain.length - 1]; return RW.transformPoint(pt(e[0], e[1])); }
    if (q.tx != null) return RW.transformPoint(pt(q.tx, q.ty));
    const F = R.boneFrameAt(rig, b.id, T); return F ? F.transformPoint(pt(b.len, 0)) : null;
  }

  function data(o) {
    return R.cached(o, ':phys', o => { const r = o.phys.mode === 'hang' && tree.find(o.phys.rig); return JSON.stringify([o.phys, o.tracks, o.x, o.y, o.rot, o.scale, o.ax, o.ay, o.start, o.dur, o.w, o.h, o.fontSize, o.text, R.ancSig(o), S.project.w, S.project.h, S.project.gravity, staticSig(), r ? [r.bones, r.tracks, r.x, r.y, r.rot, r.scale, r.start, r.phys, R.ancSig(r), (r.drv || []).map(l => { const c = tree.find(l.ctrl); return c ? [l, c.x, c.y, c.tracks, c._live] : 0; })] : 0]); }, simulate);
  }
  /** Stage position and angle from keyframes only (what physics starts from). */
  function worldPose(o, lt) { const PW = X.worldAt(tree.parentOf(o), mainT(o, lt)), k = TR.keyed(o, lt), p = PW.transformPoint(pt(k.x, k.y)); return { x: p.x, y: p.y, rot: k.rot + U.matAngle(PW) }; }
  const keyedMatrix = (o, lt) => { const k = TR.keyed(o, lt); return X.matrix({ x: k.x, y: k.y, rot: k.rot, sx: k.scale * (k.scx ?? 1), sy: k.scale * (k.scy ?? 1), ax: k.ax, ay: k.ay }); };
  function extents(o, lt) {
    const b = SB.scene.bounds(o, lt); if (!b) return { l: 20, r: 20, t: 20, b: 20 };
    const PW = X.worldAt(tree.parentOf(o), mainT(o, lt)), M = PW.multiply(keyedMatrix(o, lt)), k = TR.keyed(o, lt), P = PW.transformPoint(pt(k.x, k.y)), bb = U.emptyBox();
    [[b.x0, b.y0], [b.x1, b.y0], [b.x1, b.y1], [b.x0, b.y1]].forEach(([x, y]) => { const q = M.transformPoint(pt(x, y)); U.growBox(bb, q.x, q.y); });
    return { l: P.x - bb.x0, r: bb.x1 - P.x, t: P.y - bb.y0, b: bb.y1 - P.y };
  }

  // ---------- collision shapes
  const polyArea = p => { let a = 0; for (let i = 0, n = p.length / 2; i < n; i++) { const j = (i + 1) % n; a += p[i * 2] * p[j * 2 + 1] - p[j * 2] * p[i * 2 + 1]; } return a / 2; };
  function simplifyTo(p, maxPts, eps) { let out = p; for (let k = 0; k < 30 && out.length / 2 > maxPts; k++) { out = SB.paths.rdp(p, eps, true); eps *= 1.4; } return out.length >= 6 ? out : p; }
  const boxPoly = b => [b.x0, b.y0, b.x1, b.y0, b.x1, b.y1, b.x0, b.y1].map(U.r1);
  function circlePoly(b, n = 16) { const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2, rx = (b.x1 - b.x0) / 2, ry = (b.y1 - b.y0) / 2, p = []; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; p.push(U.r1(cx + Math.cos(a) * rx), U.r1(cy + Math.sin(a) * ry)); } return p; }
  /** The layer's outline as a simple polygon, traced from its pixels. */
  function silhouette(o, lt, detail) {
    const b = SB.scene.bounds(o, lt); if (!b) return null;
    const bw = Math.max(1, b.x1 - b.x0), bh = Math.max(1, b.y1 - b.y0), k = Math.min(4, 200 / Math.max(bw, bh)), W = Math.ceil(bw * k) + 4, H = Math.ceil(bh * k) + 4;
    const m = U.maskOf(W, H, c => {
      const M = new DOMMatrix([k, 0, 0, k, -b.x0 * k + 2, -b.y0 * k + 2]);
      if (o.type === 'group') SB.scene.renderList(c, o.children, o.seq ? lt + (o.inPoint || 0) : o.start + lt, M, { T: S.time }, k, 0);
      else { const def = SB.types.get(o.type), v = SB.scene.viewOf(o, lt), fr = o.frames[SB.frames.index(o, lt)] || o.frames[0] || { strokes: [] }; c.setTransform(M); if (def.draw) def.draw.call(def, c, v, fr, null, {}); SB.strokes.draw(c, fr.strokes, {}); }
    });
    let best = null, ba = 0; for (const L of SB.raster.traceMask(m, W, H)) { const a = Math.abs(polyArea(L)); if (a > ba) { ba = a; best = L; } }
    if (!best) return boxPoly(b);
    return simplifyTo(best.map((v, i) => (v + 0.5 - 2) / k + (i % 2 ? b.y0 : b.x0)), detail || 16, 0.6 / k).map(U.r1);
  }
  function hull(o, lt) {
    const p = o.phys || {}, m = p.colShape || 'auto';
    if (m === 'custom' && p.hull && p.hull.length >= 6) return p.hull;
    return R.cached(o, ':hull' + m, x => JSON.stringify([m, p.detail, x.type, x.w, x.h, x.shape, x.text, x.fontSize, x.scx, x.scy, (x.frames || []).map(f => f.strokes.length), x.children ? x.children.length : 0]), x => {
      const b = SB.scene.bounds(x, lt); if (!b) return [-20, -20, 20, -20, 20, 20, -20, 20];
      if (m === 'box') return boxPoly(b); if (m === 'circle') return circlePoly(b);
      return silhouette(x, lt, p.detail || 16) || boxPoly(b);
    });
  }
  const worldPoly = (M, p) => { const out = []; for (let i = 0; i < p.length; i += 2) { const q = M.transformPoint(pt(p[i], p[i + 1])); out.push(q.x, q.y); } return out; };
  function inPoly(p, x, y) { let c = false; for (let i = 0, n = p.length / 2, j = n - 1; i < n; j = i++) { const xi = p[i * 2], yi = p[i * 2 + 1], xj = p[j * 2], yj = p[j * 2 + 1]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi + 1e-12) + xi) c = !c; } return c; }
  function nearestEdge(p, x, y) {
    const n = p.length / 2, A = polyArea(p) > 0 ? 1 : -1; let best = null;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, ax = p[i * 2], ay = p[i * 2 + 1], bx = p[j * 2], by = p[j * 2 + 1], dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy || 1e-9;
      const u = U.clamp(((x - ax) * dx + (y - ay) * dy) / L, 0, 1), qx = ax + dx * u, qy = ay + dy * u, d = Math.hypot(x - qx, y - qy);
      if (!best || d < best.d) { const ln = Math.sqrt(L); best = { d, qx, qy, nx: A * dy / ln, ny: -A * dx / ln }; }
    }
    return best;
  }
  function collider(s, T) { if (!tree.inRange(s, T)) return null; const lt = tree.localTime(s, T); if (!TR.value(s, 'phys:on', lt)) return null; const h = hull(s, lt); return h ? { poly: worldPoly(X.worldAt(s, T), h) } : null; }
  function collideCircle(c, x, y, r) {
    const e = nearestEdge(c.poly, x, y), inside = inPoly(c.poly, x, y); if (!inside && e.d >= r) return null;
    const nx = inside ? e.nx : (x - e.qx) / (e.d || 1e-6), ny = inside ? e.ny : (y - e.qy) / (e.d || 1e-6);
    return { x: e.qx + nx * r, y: e.qy + ny * r, nx, ny };
  }

  // ---------- the simulation (120 steps per second, stage coordinates)
  function simulate(o) {
    const p = Object.assign(DEFAULT(), o.phys), dt = 1 / 120, n = Math.max(2, Math.ceil(o.dur / dt) + 1), out = new Float32Array(n * 4);
    const W = S.project.w, H = S.project.h, g = S.project.gravity ?? 1800, hang = p.mode === 'hang' && !!hangAnchor(o, mainT(o, 0)), sts = statics().filter(s => s !== o && !tree.isDesc(s, o) && !tree.isDesc(o, s));
    let on = false, held = null, x = 0, y = 0, vx = 0, vy = 0, px = 0, py = 0, ang = 0, w = 0, ex = null, rad = 20, L = 100, a0 = 0, rot0 = 0, rel = [], I = 1;
    for (let i = 0; i < n; i++) {
      const lt = Math.min(o.dur, i * dt), T = mainT(o, lt), want = !!TR.value(o, 'phys:on', lt);
      if (want && !on) {
        const s = worldPose(o, lt), st = held || s; x = st.x; y = st.y; ang = st.rot; rot0 = ang;
        vx = TR.value(o, 'phys:vx', lt); vy = TR.value(o, 'phys:vy', lt);
        if (p.inherit && !held && lt > 0) { const s0 = worldPose(o, Math.max(0, lt - 1 / 30)); vx += (s.x - s0.x) * 30; vy += (s.y - s0.y) * 30; }
        w = TR.value(o, 'phys:spin', lt) * Math.PI / 180; ex = extents(o, lt); rad = Math.max(4, (ex.l + ex.r + ex.t + ex.b) / 4 * 0.92); on = true;
        const M = X.worldAt(tree.parentOf(o), T).multiply(keyedMatrix(o, lt)), hp = worldPoly(M, hull(o, lt) || []);
        rel = []; for (let k = 0; k < hp.length; k += 2) rel.push([hp[k] - s.x, hp[k + 1] - s.y]); rot0 = s.rot;
        I = Math.max(1, rel.reduce((a, [rx, ry]) => a + rx * rx + ry * ry, 0) / Math.max(1, rel.length));
        if (hang) { const A = hangAnchor(o, T); L = p.rope > 0 ? p.rope : Math.max(5, Math.hypot(x - A.x, y - A.y)); a0 = Math.atan2(y - A.y, x - A.x); px = x - vx * dt; py = y - vy * dt; }
      } else if (!want && on) { on = false; held = p.after === 'hold' ? { x, y, rot: ang } : null; }
      if (on) {
        const wgt = TR.value(o, 'phys:weight', lt), bnc = U.clamp(TR.value(o, 'phys:bounce', lt), 0, 1), mu = U.clamp(p.friction, 0, 1) * 1.2, dk = Math.max(0, 1 - p.drag * dt * 3);
        if (hang) {
          const hvx = (x - px) * dk, hvy = (y - py) * dk; px = x; py = y; x += hvx; y += hvy + g * wgt * dt * dt;
          const A = hangAnchor(o, T); if (A) { const dx = x - A.x, dy = y - A.y, d = Math.hypot(dx, dy) || 1e-6; if (p.ropeMode === 'spring') { const k = 0.06; x -= dx / d * (d - L) * k; y -= dy / d * (d - L) * k; } else if (d > L) { x = A.x + dx / d * L; y = A.y + dy / d * L; } if (p.swing) ang = rot0 + (Math.atan2(y - A.y, x - A.x) - a0) * 180 / Math.PI; }
          vx = (x - px) / dt; vy = (y - py) / dt; let hit = false;
          if (p.edges !== 'none' && y > H - ex.b) { y = H - ex.b; hit = true; }
          for (const s of sts) { const c = collider(s, T); if (!c) continue; const h = collideCircle(c, x, y, rad); if (h) { x = h.x; y = h.y; hit = true; } }
          if (hit) { px = x - vx * dt * (1 - bnc); py = y - vy * dt * (1 - bnc); }
        } else {
          vy += g * wgt * dt; vx *= dk; vy *= dk; w *= (1 - 0.3 * dt); x += vx * dt; y += vy * dt; ang += w * dt * 180 / Math.PI;
          const ca = Math.cos((ang - rot0) * Math.PI / 180), sa = Math.sin((ang - rot0) * Math.PI / 180), wv = [];
          for (const [rx, ry] of rel) wv.push(x + rx * ca - ry * sa, y + rx * sa + ry * ca);
          const groups = [];
          const plane = (test, nx, ny, depthOf) => { const pts = []; let dmax = 0; for (let k = 0; k < wv.length; k += 2) if (test(wv[k], wv[k + 1])) { const d = depthOf(wv[k], wv[k + 1]); pts.push([wv[k], wv[k + 1], d]); if (d > dmax) dmax = d; } if (pts.length) groups.push({ pts, nx, ny, d: dmax }); };
          if (p.edges !== 'none') plane((a, b) => b > H, 0, -1, (a, b) => b - H);
          if (p.edges === 'box') { plane((a, b) => b < 0, 0, 1, (a, b) => -b); plane(a => a < 0, 1, 0, a => -a); plane(a => a > W, -1, 0, a => a - W); }
          for (const s of sts) {
            const c = collider(s, T); if (!c || wv.length < 6) continue; const pts = []; let nx = 0, ny = 0, dmax = 0;
            for (let k = 0; k < wv.length; k += 2) if (inPoly(c.poly, wv[k], wv[k + 1])) { const e = nearestEdge(c.poly, wv[k], wv[k + 1]); pts.push([wv[k], wv[k + 1], e.d]); nx += e.nx * e.d; ny += e.ny * e.d; dmax = Math.max(dmax, e.d); }
            for (let k = 0; k < c.poly.length; k += 2) if (inPoly(wv, c.poly[k], c.poly[k + 1])) { const e = nearestEdge(wv, c.poly[k], c.poly[k + 1]); pts.push([c.poly[k], c.poly[k + 1], e.d]); nx -= e.nx * e.d; ny -= e.ny * e.d; dmax = Math.max(dmax, e.d); }
            const ln = Math.hypot(nx, ny); if (pts.length && ln > 1e-6) groups.push({ pts, nx: nx / ln, ny: ny / ln, d: dmax });
          }
          for (const G of groups) {
            const deep = G.pts.filter(q => q[2] >= G.d * 0.6); let cx = 0, cy = 0; deep.forEach(q => { cx += q[0]; cy += q[1]; }); cx /= deep.length; cy /= deep.length;
            x += G.nx * G.d; y += G.ny * G.d;
            const rx = cx - x, ry = cy - y, rn = rx * G.ny - ry * G.nx, vpx = vx - w * ry, vpy = vy + w * rx, vn = vpx * G.nx + vpy * G.ny;
            if (vn < 0) {
              const e = Math.abs(vn) < 60 ? 0 : bnc, j = -(1 + e) * vn / (1 + rn * rn / I);
              vx += j * G.nx; vy += j * G.ny; w += rn * j / I;
              const tx = -G.ny, ty = G.nx, vt = (vx - w * ry) * tx + (vy + w * rx) * ty, rt = rx * ty - ry * tx;
              let jt = -vt / (1 + rt * rt / I); jt = U.clamp(jt, -mu * j, mu * j); vx += jt * tx; vy += jt * ty; w += rt * jt / I;
            }
          }
        }
        out[i * 4] = x; out[i * 4 + 1] = y; out[i * 4 + 2] = ang; out[i * 4 + 3] = 1;
      } else if (held) { out[i * 4] = held.x; out[i * 4 + 1] = held.y; out[i * 4 + 2] = held.rot; out[i * 4 + 3] = 2; }
    }
    return { n, dt, out };
  }

  // after keyframes, constraints and controllers: physics has the last word (order 40)
  TR.hook(40, (o, lt, r) => {
    if (!active(o)) return; const c = data(o), i = U.clamp(Math.round(lt / c.dt), 0, c.n - 1); if (!(c.out[i * 4 + 3] > 0)) return;
    const PW = X.worldAt(tree.parentOf(o), mainT(o, lt)), lp = PW.inverse().transformPoint(pt(c.out[i * 4], c.out[i * 4 + 1]));
    r.x = lp.x; r.y = lp.y; r.rot = c.out[i * 4 + 2] - U.matAngle(PW);
  });
  // ropes are drawn under the layer that hangs
  SB.scene.before.push((ctx, o, opt, sc) => {
    if (!o.phys || o.phys.mode !== 'hang' || o.phys.drawRope === false || !active(o)) return;
    const A = hangAnchor(o, opt.T); if (!A) return; const tr = TR.transform(o, tree.localTime(o, opt.T)), P = X.worldAt(tree.parentOf(o), opt.T).transformPoint(pt(tr.x, tr.y)), M = opt.root;
    const a = M.transformPoint(pt(A.x, A.y)), b = M.transformPoint(pt(P.x, P.y));
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.strokeStyle = o.phys.ropeColor || '#24213F'; ctx.lineWidth = 3 * (sc || 1); ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.restore();
  });

  /** Add physics. Added part-way into the layer (not at its first frame): it is keyed off at the start and on from here. */
  function add(o, extra) {
    const fresh = !o.phys; o.phys = Object.assign(DEFAULT(), extra || {});
    const lt = tree.localTime(o), tol = 0.5 / ((S.project && S.project.fps) || 24);
    if (fresh && o.type !== 'rig' && o.phys.mode !== 'static' && lt > tol && !TR.animated(o, 'phys:on')) { TR.put(o, 'phys:on', 0, false, 'hold'); TR.put(o, 'phys:on', U.r3(lt), true, 'hold'); SB.toast('Physics starts here: keyed off at the start, on from this frame.'); }
    SB.bump();
  }
  function remove(o) { delete o.phys; TR.drop(o, 'phys:'); SB.bump(); }

  SB.physics = { DEFAULT, mode, active, data, hull, worldPoly, statics, collider, hangAnchor, add, remove, VEL_K: 0.25 };
})(window.SB);
