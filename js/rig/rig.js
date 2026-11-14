/* Bone rigs.

   A rig layer holds bones: { id, name, parent, x, y (root only), ox, oy, len, ang, pose, pin, dyn }.
   ox, oy: a free (floating) bone's head sits this far from its parent's tail, in the parent's end frame, so it
   follows the parent without touching it (ears on a head). Without them the head sits on the parent's tail.
   ang is the rest angle (relative to the parent bone). Posing a bone (all animatable):
     'bone:<id>'     pose      the extra angle
     'bonex:<id>'    mx, my    move: the head shifts from where it sits (in the parent's space)
     'boney:<id>'
     'bonesx:<id>'   psx       scale along the bone (1 = 100%); children follow it
     'bonesy:<id>'   psy       scale across the bone (thickness of what bends with it)
   A bone with segs > 1 is a B-bone: a chain of equal segments from head to tail, so what bends
   with it curves smoothly (a tail, a spine, a rubber arm).
     'bonebend:<id>'   bend      curls the whole bone evenly (degrees from head to tail)
     'bseg:<id>:<k>'   sa[k]     turns segment k (and the segments after it) on its own
   The tail sits at the end of the chain and child bones carry on from there, in the direction
   of the last segment, so B-bones work with IK, Move, Scale, controllers and dynamics.
   Each bone's pose is a matrix m (rig space; origin at the head, x along the bone, with its scale)
   and mEnd, where its children start.
   Bones with dyn.on swing on their own (follow-through) and are simulated in rig.sim().

   Other layers attach to a rig with o.bind:
     follow  { rig, mode:'follow', bone, inv }      the layer moves with one bone
     deform  { rig, mode:'deform', inv:{}, seg:{}, rigOf:{}, soft, paint:{} }
             the layer bends with every bone; weights come from the distance
             to each bone (softness) plus painted weights (paint[boneId] = dabs). */
'use strict';
(function (SB) {
  const U = SB.util, S = SB.state, TR = SB.tracks, tree = SB.tree, X = SB.xf, G = SB.paths;
  const pt = U.pt, arrMat = a => new DOMMatrix(a), matArr = M => [M.a, M.b, M.c, M.d, M.e, M.f].map(v => Math.round(v * 1e6) / 1e6);
  const boneById = (rig, id) => rig && rig.bones && rig.bones.find(b => b.id === id);
  const rigs = () => tree.all().filter(o => o.type === 'rig');
  const mainT = (o, lt) => tree.mainAt(o, lt);

  // ---------- pose values of a bone, keyframed as '<prefix>:<boneId>'
  const BONE_P = { bone: ['pose', 0], bonex: ['mx', 0], boney: ['my', 0], bonesx: ['psx', 1], bonesy: ['psy', 1], bonebend: ['bend', 0] };
  for (const [pre, [k, def]] of Object.entries(BONE_P)) TR.prefix(pre, { get(o, [id]) { const b = boneById(o, id); return b ? (b[k] ?? def) : def; }, set(o, [id], v) { const b = boneById(o, id); if (b) b[k] = v; } });
  TR.prefix('bseg', { get(o, [id, k]) { const b = boneById(o, id); return (b && b.sa && b.sa[+k]) || 0; }, set(o, [id, k], v) { const b = boneById(o, id); if (!b) return; b.sa = b.sa || []; while (b.sa.length < +k) b.sa.push(0); b.sa[+k] = v; } });
  const nSegs = b => (b.segs || 1) > 1 ? Math.min(16, b.segs | 0) : 0;
  /** The animatable values of a bone: all of them, or (used) only those that are animated or changed. */
  function boneProps(rig, b, used) {
    const out = [['bone:' + b.id, b.name]], on = (pre, k, def) => !used || TR.animated(rig, pre + ':' + b.id) || Math.abs((b[k] ?? def) - def) > 1e-6;
    if (on('bonex', 'mx', 0) || on('boney', 'my', 0)) out.push(['bonex:' + b.id, b.name + ' move X'], ['boney:' + b.id, b.name + ' move Y']);
    if (on('bonesx', 'psx', 1) || on('bonesy', 'psy', 1)) out.push(['bonesx:' + b.id, b.name + ' length %'], ['bonesy:' + b.id, b.name + ' width %']);
    const n = nSegs(b);
    if (n && on('bonebend', 'bend', 0)) out.push(['bonebend:' + b.id, b.name + ' bend']);
    for (let k = 0; k < n; k++) if (!used || TR.animated(rig, `bseg:${b.id}:${k}`) || Math.abs((b.sa && b.sa[k]) || 0) > 1e-6) out.push([`bseg:${b.id}:${k}`, `${b.name} segment ${k + 1}`]);
    return out;
  }

  // ---------- 2D matrices as arrays [a, b, c, d, e, f]
  const AF = {
    mul: (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]],
    T: (x, y) => [1, 0, 0, 1, x, y], R: deg => { const r = deg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r); return [c, s, -s, c, 0, 0]; }, S: (x, y) => [x, 0, 0, y, 0, 0],
    ap: (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]],
    inv(m) { const det = m[0] * m[3] - m[1] * m[2] || 1e-9; return [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det, (m[2] * m[5] - m[3] * m[4]) / det, (m[1] * m[4] - m[0] * m[5]) / det]; },
  };
  /** Pose values of bone b at lt (poseVals: angles to use instead of the keyframed ones). */
  function boneVals(rig, b, lt, poseVals) {
    const id = b.id, V = p => TR.value(rig, p + ':' + id, lt);
    const n = nSegs(b), sa = []; for (let k = 0; k < n; k++) sa.push(TR.value(rig, `bseg:${id}:${k}`, lt));
    return { r: poseVals ? (poseVals[id] || 0) : rig._ixB && rig._ixB[id] != null && S.ixPlay ? rig._ixB[id] : V('bone'), mx: V('bonex'), my: V('boney'), sx: V('bonesx'), sy: V('bonesy'), bend: n ? V('bonebend') : 0, sa };
  }
  const REST = { r: 0, mx: 0, my: 0, sx: 1, sy: 1, bend: 0, sa: [] };
  /** The segments of a B-bone in its own space: angles phi[k] of each segment and the joints pts[0..n]. */
  function chainOf(b, v) {
    const n = nSegs(b), L = b.len / n, phi = [], pts = [[0, 0]]; let a = 0;
    for (let k = 0; k < n; k++) { a += (k ? v.bend / n : v.bend / (2 * n)) + (v.sa[k] || 0); phi.push(a); const r = a * Math.PI / 180, [x, y] = pts[k]; pts.push([x + Math.cos(r) * L, y + Math.sin(r) * L]); }
    return { n, phi, pts, end: a + v.bend / (2 * n) };
  }
  /** Place bone b given its pose values v and its parent's pose (abs: a rig-space angle that replaces the turn). */
  function placeBone(b, par, v, abs) {
    let m = par ? par.mEnd : AF.T(b.x, b.y);
    if (par && (b.ox || b.oy)) m = AF.mul(m, AF.T(b.ox || 0, b.oy || 0)); // a free bone: off its parent's tail
    if (v.mx || v.my) m = AF.mul(m, AF.T(v.mx, v.my));
    let th = b.ang + v.r;
    if (abs != null) { const ar = abs * Math.PI / 180, iv = AF.inv([m[0], m[1], m[2], m[3], 0, 0]), [dx, dy] = AF.ap(iv, Math.cos(ar), Math.sin(ar)); let t2 = Math.atan2(dy, dx) * 180 / Math.PI; while (t2 - th > 180) t2 -= 360; while (t2 - th < -180) t2 += 360; th = t2; }
    m = AF.mul(m, AF.R(th)); if (v.sx !== 1 || v.sy !== 1) m = AF.mul(m, AF.S(v.sx, v.sy));
    const ref = (par ? par.a : 0) + th; let a = Math.atan2(m[1], m[0]) * 180 / Math.PI; while (a - ref > 180) a -= 360; while (a - ref < -180) a += 360;
    const ch = nSegs(b) ? chainOf(b, v) : null, end = ch ? ch.pts[ch.n] : [b.len, 0], mEnd = AF.mul(m, ch ? AF.mul(AF.T(end[0], end[1]), AF.R(ch.end)) : AF.T(b.len, 0));
    const [tx, ty] = AF.ap(m, end[0], end[1]);
    return { hx: m[4], hy: m[5], a, len: Math.hypot(tx - m[4], ty - m[5]), len0: b.len, tx, ty, m, mEnd, ch, chain: ch ? ch.pts.map(p => AF.ap(m, p[0], p[1])) : null, moved: !!(v.mx || v.my) };
  }
  /** n + 1 frames along a B-bone (rig space), at each joint, turned halfway between the segments it joins. */
  function bbFrames(q) {
    const c = q.ch; if (!c) return [q.m, q.mEnd];
    return c.pts.map((p, k) => AF.mul(q.m, AF.mul(AF.T(p[0], p[1]), AF.R(k === 0 ? 0 : k === c.n ? c.end : (c.phi[k - 1] + c.phi[k]) / 2))));
  }
  // ---------- simulation cache, shared with physics: recompute only when the inputs change
  const cache = new Map();
  function cached(o, kind, sigFn, simFn) {
    const key = o.id + kind; let c = cache.get(key);
    if (c && c.stamp === SB.stamp) return c.data;
    const sig = sigFn(o); if (c && c.sig === sig) { c.stamp = SB.stamp; return c.data; }
    const data = simFn(o); cache.set(key, { sig, stamp: SB.stamp, data }); return data;
  }
  const ancSig = o => tree.ancestors(o).map(a => [a.tracks, a.x, a.y, a.rot, a.scale, a.ax, a.ay, a.start, a.inPoint, a.phys, a.bind]);

  // ---------- pose
  /** Every bone's place at lt: { hx, hy, tx, ty, a (angle), len, m and mEnd (matrices), chain (B-bone joints) }.
      opt.rest: the rest pose; opt.poseVals: angles to use; opt.abs: rig-space angles that replace the turn. */
  function poseRaw(rig, lt, opt = {}) {
    const P = {};
    for (const b of rig.bones) P[b.id] = placeBone(b, b.parent && P[b.parent], opt.rest ? REST : boneVals(rig, b, lt, opt.poseVals), opt.abs && opt.abs[b.id]);
    return P;
  }
  const hasDyn = rig => rig.bones.some(b => b.dyn && b.dyn.on);
  const dynOn = (rig, lt) => TR.value(rig, 'phys:on', lt) !== false;
  function pose(rig, lt) {
    if (hasDyn(rig) && dynOn(rig, lt)) { const c = sim(rig), i = U.clamp(Math.round(lt / c.dt), 0, c.n - 1), abs = {}; rig.bones.forEach((b, j) => abs[b.id] = c.out[i * c.nb + j]); return poseRaw(rig, lt, { abs }); }
    return poseRaw(rig, lt);
  }
  function poseAt(rig, T) { const lt = tree.localTime(rig, T), k = U.r3(lt); if (rig._pm && rig._pm.stamp === SB.stamp && rig._pm.k === k) return rig._pm.p; const p = pose(rig, lt); rig._pm = { stamp: SB.stamp, k, p }; return p; }
  /** Matrix of a bone on the stage: origin at its head, x axis along the bone. */
  function boneFrameAt(rig, id, T) { const q = poseAt(rig, T)[id]; if (!q) return null; return X.worldAt(rig, T).multiply(arrMat(q.m)); }

  /** Dynamic bones: each tip is a point pulled toward where the animation puts it, with gravity and damping. */
  function sim(rig) {
    return cached(rig, ':rig', r => JSON.stringify([r.bones, r.tracks, r.x, r.y, r.rot, r.scale, r.start, r.dur, r.phys, ancSig(r), S.project.gravity]), r => {
      const dt = 1 / 120, n = Math.max(2, Math.ceil(r.dur / dt) + 1), nb = r.bones.length, out = new Float32Array(n * nb), st = {}, g = S.project.gravity ?? 1800;
      for (let i = 0; i < n; i++) {
        const lt = Math.min(r.dur, i * dt), RW = X.worldAt(r, mainT(r, lt)), rot = U.matAngle(RW), ws = Math.hypot(RW.a, RW.b) || 1, on = dynOn(r, lt), P = {};
        r.bones.forEach((b, j) => {
          const par = b.parent && P[b.parent], v = boneVals(r, b, lt), kin = placeBone(b, par, v), kinA = kin.a;
          const H = RW.transformPoint(pt(kin.hx, kin.hy)), Tk = RW.transformPoint(pt(kin.tx, kin.ty));
          let a = kinA, q = kin;
          if (b.dyn && b.dyn.on && on) {
            let s = st[b.id]; if (!s) s = st[b.id] = { x: Tk.x, y: Tk.y, px: Tk.x, py: Tk.y };
            const damp = U.clamp(b.dyn.damp ?? 0.25, 0, 1), stiff = U.clamp(b.dyn.stiff ?? 0.35, 0, 1), k = 0.003 + stiff * stiff * 0.25;
            const vx = (s.x - s.px) * (1 - damp * 0.3), vy = (s.y - s.py) * (1 - damp * 0.3);
            s.px = s.x; s.py = s.y; s.x += vx; s.y += vy + g * (b.dyn.grav ?? 1) * 0.35 * dt * dt;
            s.x += (Tk.x - s.x) * k; s.y += (Tk.y - s.y) * k;
            const dx = s.x - H.x, dy = s.y - H.y, d = Math.hypot(dx, dy) || 1, L = kin.len * ws; s.x = H.x + dx / d * L; s.y = H.y + dy / d * L;
            a = Math.atan2(dy, dx) * 180 / Math.PI - rot; while (a - kinA > 180) a -= 360; while (a - kinA < -180) a += 360; q = placeBone(b, par, v, a);
          } else if (st[b.id]) { const s = st[b.id]; s.x = s.px = Tk.x; s.y = s.py = Tk.y; }
          P[b.id] = q; out[i * nb + j] = a;
        });
      }
      return { n, nb, dt, out };
    });
  }

  // ---------- on the stage
  /** Bones on the stage: head h, tail t and, for a B-bone, its joints (curve). */
  function segsWorld(rig, T = S.time) {
    const P = poseAt(rig, T), W = X.worldAt(rig, T);
    return rig.bones.map(b => { const q = P[b.id], h = W.transformPoint(pt(q.hx, q.hy)), t = W.transformPoint(pt(q.tx, q.ty));
      return { b, h, t, root: !b.parent, float: !!(b.parent && (b.ox || b.oy)), par: b.parent && P[b.parent] ? W.transformPoint(pt(P[b.parent].tx, P[b.parent].ty)) : null, curve: q.chain ? q.chain.map(([x, y]) => W.transformPoint(pt(x, y))) : null }; });
  }
  /** Distance² from P to a bone on the stage (along its curve for a B-bone). */
  const segDist2 = (P, s) => { if (!s.curve) return distSeg2(P.x, P.y, [s.h.x, s.h.y, s.t.x, s.t.y]); let d = Infinity; for (let i = 1; i < s.curve.length; i++) d = Math.min(d, distSeg2(P.x, P.y, [s.curve[i - 1].x, s.curve[i - 1].y, s.curve[i].x, s.curve[i].y])); return d; };
  function distSeg2(px, py, s) { const [ax, ay, bx, by] = s, dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy; let u = L ? ((px - ax) * dx + (py - ay) * dy) / L : 0; u = U.clamp(u, 0, 1); const qx = ax + dx * u - px, qy = ay + dy * u - py; return qx * qx + qy * qy; }
  function nearestBone(rig, P) { let best = null, bd = Infinity; for (const s of segsWorld(rig)) { const d = segDist2(P, s); if (d < bd) { bd = d; best = s.b; } } return best; }
  /** What part of a rig is under P: a joint (tail / root head) or a bone body. */
  function hit(rig, P, tol = 10) {
    const k = SB.view.k(); let best = null;
    for (const s of segsWorld(rig)) {
      const dt = Math.hypot(P.x - s.t.x, P.y - s.t.y) * k, dh = Math.hypot(P.x - s.h.x, P.y - s.h.y) * k;
      if (dt < tol && (!best || dt < best.d)) best = { bone: s.b, part: 'tail', d: dt };
      if ((s.root || s.float) && dh < tol && (!best || dh < best.d)) best = { bone: s.b, part: 'head', d: dh };
    }
    if (best) return best;
    for (const s of segsWorld(rig)) if (s.curve) for (let i = 1; i < s.curve.length - 1; i++) { const d = Math.hypot(P.x - s.curve[i].x, P.y - s.curve[i].y) * k; if (d < tol * 0.9 && (!best || d < best.d)) best = { bone: s.b, part: 'seg', seg: i - 1, d }; } // a joint inside a B-bone turns the segment before it
    if (best) return best;
    for (const s of segsWorld(rig)) { const d = Math.sqrt(segDist2(P, s)) * k; if (d < tol * 0.8 && (!best || d < best.d)) best = { bone: s.b, part: 'body', d }; }
    return best;
  }
  const toRig = (rig, P) => X.world(rig).inverse().transformPoint(pt(P.x, P.y));

  // ---------- building
  function make(P) { return tree.make('rig', { name: `Rig ${rigs().length + 1}`, x: U.r1(P.x), y: U.r1(P.y) }); }
  /** Add a bone from a point, a bone's tail (child) or a bone's head (sibling) to local point P. */
  function addBone(rig, from, P) {
    const ps = poseAt(rig, S.time); let parent = null, hx, hy;
    if (from.type === 'pt') { hx = from.x; hy = from.y; }
    else if (from.type === 'tail') { parent = from.bone; const q = ps[parent]; if (!q) return null; hx = q.tx; hy = q.ty; }
    else { const b = boneById(rig, from.bone); if (!b) return null; parent = b.parent; const q = ps[from.bone]; hx = q.hx; hy = q.hy; }
    const len = Math.hypot(P.x - hx, P.y - hy); if (len < 6) return null;
    const abs = Math.atan2(P.y - hy, P.x - hx) * 180 / Math.PI, pa = parent ? ps[parent].a : 0;
    const b = { id: U.uid(), name: `Bone ${rig.bones.length + 1}`, parent, x: parent ? 0 : U.r1(hx), y: parent ? 0 : U.r1(hy), len: U.r1(len), ang: U.r1(abs - pa), pose: 0 };
    if (parent && from.type === 'head') { const sib = boneById(rig, from.bone); if (sib && (sib.ox || sib.oy)) { b.ox = sib.ox; b.oy = sib.oy; } } // a sibling of a free bone starts where it does
    rig.bones.push(b); SB.bump(); return b;
  }
  /** A bone's rest place in rig space: head and the angle it points at. */
  const restOf = (rig, id) => { const P = poseRaw(rig, 0, { rest: true }), q = P[id]; return { P, h: [q.hx, q.hy], a: Math.atan2(q.m[1], q.m[0]) * 180 / Math.PI }; };
  /** Give bone id another parent (or none), keeping where it sits at rest: it becomes free when its head is off the new parent's tail. */
  function setParent(rig, id, np) {
    const b = boneById(rig, id); if (!b || np === id) return false;
    for (let x = np && boneById(rig, np); x; x = x.parent && boneById(rig, x.parent)) if (x.id === id) return false; // not under itself
    const r = restOf(rig, id);
    if (!np) { b.parent = null; b.x = U.r1(r.h[0]); b.y = U.r1(r.h[1]); b.ang = U.r1(r.a); delete b.ox; delete b.oy; }
    else { const E = r.P[np].mEnd, l = AF.ap(AF.inv(E), r.h[0], r.h[1]), ea = Math.atan2(E[1], E[0]) * 180 / Math.PI; let a = r.a - ea; while (a > 180) a -= 360; while (a < -180) a += 360;
      b.parent = np; b.x = 0; b.y = 0; b.ang = U.r1(a); if (Math.hypot(l[0], l[1]) > 0.05) { b.ox = U.r1(l[0]); b.oy = U.r1(l[1]); } else { delete b.ox; delete b.oy; } }
    // bones are listed parents first: move it after its new parent
    const i = rig.bones.indexOf(b), sub = [b]; for (let k = i + 1; k < rig.bones.length; k++) { let x = rig.bones[k], under = false; for (let y = x; y && y.parent; y = boneById(rig, y.parent)) if (y.parent === id) { under = true; break; } if (under) sub.push(x); }
    rig.bones = rig.bones.filter(x => !sub.includes(x)); const pi = np ? rig.bones.findIndex(x => x.id === np) : -1; let at = pi + 1; while (np && at < rig.bones.length) { let under = false; for (let y = rig.bones[at]; y && y.parent; y = boneById(rig, y.parent)) if (y.parent === np) { under = true; break; } if (!under) break; at++; }
    rig.bones.splice(np ? at : rig.bones.length, 0, ...sub); SB.bump(); return true;
  }
  /** Delete one bone and keep its children where they are (like Blender): they hang on its parent, free when needed. */
  function deleteBoneOnly(rig, id) {
    const b = boneById(rig, id); if (!b) return; const kids = rig.bones.filter(x => x.parent === id);
    kids.forEach(k => setParent(rig, k.id, b.parent || null));
    tree.all().forEach(o => { if (o.bind && o.bind.mode === 'follow' && o.bind.rig === rig.id && o.bind.bone === id) o.bind.bone = b.parent || (kids[0] && kids[0].id) || o.bind.bone; }); // what followed it follows its parent now (kept in place by keepAttached)
    rig.bones = rig.bones.filter(x => x !== b); for (const tid in rig.tracks) { const [pre, bid] = tid.split(':'); if ((BONE_P[pre] || pre === 'bseg') && bid === id) delete rig.tracks[tid]; } if (S.selBone === id) S.selBone = null; SB.bump();
  }
  /** Change bones without moving what is attached to them: editSnap(rig) before, keepAttached(snap) after
      (Bones tool: drag joints, delete or re-parent bones). Each attached layer is re-bound so it stays where it is now. */
  function editSnap(rig) {
    const T = S.time, F = {}; rig.bones.forEach(b => { const M = boneFrameAt(rig, b.id, T); if (M) F[b.id] = matArr(M); });
    const layers = tree.all().filter(o => o.bind && bindRigs(o.bind).includes(rig.id)).map(o => [o, U.deep(o.bind)]);
    return { rig, T, F, layers };
  }
  function keepAttached(sn) {
    const { rig, T } = sn; SB.bump(); wChanged(); const P = poseAt(rig, T);
    for (const [o, B0] of sn.layers) {
      const B = o.bind = U.deep(B0), fix = (id, inv) => { const Fo = sn.F[id], Fn = boneFrameAt(rig, id, T); return Fo && Fn ? matArr(Fn.inverse().multiply(arrMat(Fo)).multiply(arrMat(inv))) : inv; };
      if (B.mode === 'follow') { if (B.rig === rig.id && B.bone) { const was = B0.bone, Fo = sn.F[was], Fn = boneFrameAt(rig, B.bone, T); if (Fo && Fn) B.inv = matArr(Fn.inverse().multiply(arrMat(Fo)).multiply(arrMat(B0.inv))); } continue; }
      for (const id of Object.keys(B.inv || {})) {
        if (boneOwner(B, id) !== rig) continue; B.inv[id] = fix(id, B.inv[id]);
        const q = P[id], b = boneById(rig, id); if (!q || !b) continue; const K = AF.inv(B.inv[id]), end = q.ch ? q.ch.pts[q.ch.n] : [b.len, 0], h = AF.ap(K, 0, 0), t = AF.ap(K, end[0], end[1]);
        B.seg[id] = [U.r1(h[0]), U.r1(h[1]), U.r1(t[0]), U.r1(t[1])]; // the bone's line where the layer is bound, for the automatic weights
        if (q.ch && B.bbf) { const mi = AF.inv(q.m); B.bbf[id] = bbFrames(q).map(f => AF.mul(K, AF.mul(mi, f)).map(v => Math.round(v * 1e4) / 1e4)); }
      }
    }
    SB.bump();
  }
  function deleteBone(rig, id) {
    const kill = new Set([id]); let grew = true; while (grew) { grew = false; for (const b of rig.bones) if (b.parent && kill.has(b.parent) && !kill.has(b.id)) { kill.add(b.id); grew = true; } }
    rig.bones = rig.bones.filter(b => !kill.has(b.id)); for (const id in rig.tracks) { const [pre, bid] = id.split(':'); if ((BONE_P[pre] || pre === 'bseg') && kill.has(bid)) delete rig.tracks[id]; } if (kill.has(S.selBone)) S.selBone = null; SB.bump();
  }
  // ---------- mirrored bones: a left and a right side that build and pose together (b.mirror: the other side's id)
  const SIDE = { l: 'r', r: 'l', left: 'right', right: 'left' };
  /** The name for the other side: _l ↔ _r, .L ↔ .R, Left ↔ Right (any case, as a word or after _ . - or a space). null: no side in it. */
  function mirrorName(name) {
    let hit = false; const out = String(name || '').replace(/(^|[\s._-])(left|right|l|r)(?=$|[\s._-])/gi, (m, pre, w) => { hit = true; const t = SIDE[w.toLowerCase()]; return pre + (w === w.toUpperCase() ? t.toUpperCase() : w[0] === w[0].toUpperCase() ? t[0].toUpperCase() + t.slice(1) : t); });
    return hit ? out : null;
  }
  const mirrorOf = (rig, b) => { b = typeof b === 'string' ? boneById(rig, b) : b; const m = b && b.mirror && boneById(rig, b.mirror); return m && m.mirror === b.id ? m : null; };
  /** A pose value as the mirror bone takes it: turns, bends and moves up-down flip; lengths and widths stay. */
  const MIRROR_FLIP = { bone: -1, boney: -1, bonebend: -1, bseg: -1, bonex: 1, bonesx: 1, bonesy: 1 };
  function mirrorKey(rig, id) { const [pre, bid, k] = id.split(':'); if (!(pre in MIRROR_FLIP)) return null; const m = mirrorOf(rig, bid); return m ? [pre + ':' + m.id + (k != null ? ':' + k : ''), MIRROR_FLIP[pre]] : null; }
  /** Pose values vals ({ 'bone:id': v, … }) plus the same pose on the mirror bones (when mirror posing is on). */
  function withMirror(rig, vals) {
    if (S.rigMirror === false || !rig.bones.some(b => b.mirror)) return vals; const out = Object.assign({}, vals);
    for (const id in vals) { const mk = mirrorKey(rig, id); if (mk && !(mk[0] in vals) && typeof vals[id] === 'number') out[mk[0]] = U.r3(vals[id] * mk[1]); }
    return out;
  }
  /** Ids a drag of ids also changes on the mirror side. */
  const mirrorIds = (rig, ids) => S.rigMirror === false ? [] : ids.map(id => { const mk = mirrorKey(rig, id); return mk && !ids.includes(mk[0]) ? mk[0] : null; }).filter(Boolean);
  /** Make a mirrored copy of bone id and every bone under it, across the upright line through the middle of the skeleton
      (the head of its top bone; for a top bone, of another top bone or the rig's start). Names swap sides (_l ↔ _r).
      Returns the new top bone, or a message why it can't. */
  function mirrorBones(rig, id) {
    const b0 = boneById(rig, id); if (!b0) return 'Pick a bone first.'; if (mirrorOf(rig, b0)) return `${b0.name} already has a mirror: ${mirrorOf(rig, b0).name}.`;
    const rest = poseRaw(rig, 0, { rest: true }), sub = rig.bones.filter(b => { for (let x = b; x; x = x.parent && boneById(rig, x.parent)) { if (x.id === id) return true; if (mirrorOf(rig, x)) return false; } return false; }); // bones mirrored already stay out
    let top = b0; while (top.parent && boneById(rig, top.parent)) top = boneById(rig, top.parent);
    const other = rig.bones.find(b => !b.parent && b !== top), ax = rig.mirrorX ?? (top !== b0 ? rest[top.id].hx : other ? rest[other.id].hx : 0);
    if (Math.abs(rest[b0.id].hx - ax) < 1 && Math.abs(rest[b0.id].tx - ax) < 1) return `${b0.name} sits on the middle line: there is nothing to mirror it to. Mirror a bone off to one side (an arm, a leg).`;
    const map = {}, made = [];
    for (const b of sub) {
      const q = rest[b.id], a = Math.atan2(q.m[1], q.m[0]) * 180 / Math.PI, nb = U.deep(b);
      ['parent', 'ox', 'oy', 'mirror'].forEach(k => delete nb[k]); if (nb.bend === 'left' || nb.bend === 'right') nb.bend = nb.bend === 'left' ? 'right' : 'left'; // its bend arrow, mirrored
      Object.assign(nb, { id: U.uid(), name: mirrorName(b.name) || b.name + ' mirror', parent: null, x: 2 * ax - q.hx, y: q.hy, ang: 180 - a });
      for (const pre in MIRROR_FLIP) { const k = (BONE_P[pre] || [])[0]; if (k && nb[k] != null && MIRROR_FLIP[pre] < 0) nb[k] = -nb[k]; } // its pose, mirrored
      if (nb.sa) nb.sa = nb.sa.map(v => -v);
      map[b.id] = nb.id; b.mirror = nb.id; nb.mirror = b.id; rig.bones.push(nb); made.push([b, nb]);
      for (const tid of Object.keys(rig.tracks || {})) { const [pre, bid, k] = tid.split(':'); if (bid !== b.id || !(pre in MIRROR_FLIP)) continue; // its keyframes, mirrored
        rig.tracks[pre + ':' + nb.id + (k != null ? ':' + k : '')] = rig.tracks[tid].map(key => Object.assign({}, key, { v: typeof key.v === 'number' ? key.v * MIRROR_FLIP[pre] : key.v })); }
    }
    for (const [b, nb] of made) { const p = b.parent && (map[b.parent] || (mirrorOf(rig, b.parent) || {}).id || b.parent); if (p) setParent(rig, nb.id, p); else { nb.x = U.r1(nb.x); nb.y = U.r1(nb.y); nb.ang = U.r1(nb.ang); } }
    if (rig.mirrorX == null) rig.mirrorX = U.r1(ax); // the middle line, kept for later changes
    rig._pm = null; SB.bump(); return boneById(rig, map[id]);
  }
  /** After bone id's rest place changed (Bones tool): put its mirror at the mirrored place. */
  function syncMirror(rig, id) {
    const b = boneById(rig, id), m = mirrorOf(rig, b); if (!m || rig.mirrorX == null) return; const rest = poseRaw(rig, 0, { rest: true }), q = rest[b.id], ax = rig.mirrorX;
    const hx = 2 * ax - q.hx, hy = q.hy, a = 180 - Math.atan2(q.m[1], q.m[0]) * 180 / Math.PI; m.len = b.len;
    const par = m.parent && rest[m.parent];
    if (!par) { m.x = U.r1(hx); m.y = U.r1(hy); m.ang = U.r1(a); }
    else { const E = par.mEnd, l = AF.ap(AF.inv(E), hx, hy), ea = Math.atan2(E[1], E[0]) * 180 / Math.PI; let r = a - ea; while (r > 180) r -= 360; while (r < -180) r += 360; m.ang = U.r1(r);
      if (Math.hypot(l[0], l[1]) > 0.05) { m.ox = U.r1(l[0]); m.oy = U.r1(l[1]); } else { delete m.ox; delete m.oy; } }
    rig._pm = null;
  }
  // ---------- join and split bones (call between editSnap and keepAttached, then addToBinds for new bones)
  /** Bones ids as one chain, top first (each the parent of the next), or null when they aren't one. */
  function boneChain(rig, ids) {
    const set = new Set(ids), bs = ids.map(id => boneById(rig, id)).filter(Boolean); if (bs.length < 2 || bs.length !== set.size) return null;
    const top = bs.filter(b => !set.has(b.parent)); if (top.length !== 1) return null; const out = [top[0]];
    while (out.length < bs.length) { const nx = bs.filter(b => b.parent === out[out.length - 1].id); if (nx.length !== 1) return null; out.push(nx[0]); }
    return out;
  }
  /** Make bones kids top bones at their rest places (rest: the rest pose before a change), so a later setParent keeps them there. */
  function free(rig, kids, rest) { for (const k of kids) { const q = rest[k.id]; if (!q) continue; k.parent = null; k.x = q.hx; k.y = q.hy; k.ang = Math.atan2(q.m[1], q.m[0]) * 180 / Math.PI; delete k.ox; delete k.oy; } rig._pm = null; }
  /** Join a chain of bones into its top bone: it reaches the last one's tip, takes over its children, painted weights and what
      followed the others. Returns the bone, or a message. */
  function joinBones(rig, ids) {
    const ch = boneChain(rig, ids); if (!ch) return 'Pick bones that make one chain (each joined to the next).'; const top = ch[0], last = ch[ch.length - 1], gone = ch.slice(1), goneIds = new Set(gone.map(b => b.id));
    const rest = poseRaw(rig, 0, { rest: true }), h = rest[top.id], t = rest[last.id], pa = top.parent && rest[top.parent] ? rest[top.parent].a : 0;
    const kids = rig.bones.filter(b => (goneIds.has(b.parent) || b.parent === top.id) && !goneIds.has(b.id)); free(rig, kids, rest); // the children (and side branches) keep their places…
    top.len = U.r1(Math.max(4, Math.hypot(t.tx - h.hx, t.ty - h.hy))); top.ang = U.r1(Math.atan2(t.ty - h.hy, t.tx - h.hx) * 180 / Math.PI - pa); delete top.segs; rig._pm = null;
    kids.forEach(k => setParent(rig, k.id, top.id)); // …and hang on the joined bone
    tree.all().forEach(o => { const B = o.bind; if (!B) return;
      if (B.mode === 'follow' && B.rig === rig.id && goneIds.has(B.bone)) B.bone = top.id;
      if (B.paint) for (const id of goneIds) { if (B.paint[id]) { B.paint[top.id] = (B.paint[top.id] || []).concat(B.paint[id]); delete B.paint[id]; } }
      for (const id of goneIds) { if (B.inv) delete B.inv[id]; if (B.seg) delete B.seg[id]; if (B.rigOf) delete B.rigOf[id]; if (B.bbf) delete B.bbf[id]; } });
    for (const b of gone) { const m = mirrorOf(rig, b); if (m) delete m.mirror; }
    rig.bones = rig.bones.filter(b => !goneIds.has(b.id)); for (const tid in rig.tracks) { const [pre, bid] = tid.split(':'); if ((BONE_P[pre] || pre === 'bseg') && goneIds.has(bid)) delete rig.tracks[tid]; }
    const bases = ch.map(b => (/^(.*) \d+$/.exec(b.name || '') || [])[1]); if (bases[0] && bases.every(x => x === bases[0])) top.name = bases[0]; // "Arm 1" + "Arm 2" → "Arm"
    if (goneIds.has(S.selBone)) S.selBone = top.id; rig._pm = null; SB.bump(); return top;
  }
  /** Split a bone into n equal bones in a row (the first keeps its id, weights and keys). Returns the new bones (their sources: from). */
  function splitBone(rig, id, n) {
    const b = boneById(rig, id); n = Math.round(U.clamp(n, 2, 12)); if (!b) return []; const kids = rig.bones.filter(x => x.parent === id), L = b.len, made = []; free(rig, kids, poseRaw(rig, 0, { rest: true }));
    const base = String(b.name || 'Bone'); b.name = base + ' 1'; b.len = U.r1(L / n); delete b.segs; let prev = b;
    for (let k = 2; k <= n; k++) { const nb = { id: U.uid(), name: `${base} ${k}`, parent: prev.id, x: 0, y: 0, len: U.r1(L / n), ang: 0, pose: 0 }; if (b.color) nb.color = b.color;
      rig.bones.splice(rig.bones.indexOf(prev) + 1, 0, nb); made.push(nb); prev = nb; }
    rig._pm = null; const rest = poseRaw(rig, 0, { rest: true }), pieces = [b, ...made];
    kids.forEach(k => { const q = rest[k.id]; let best = prev, bd = Infinity; for (const pc of pieces) { const r = rest[pc.id], d = distSeg2(q.hx, q.hy, [r.hx, r.hy, r.tx, r.ty]) - (pc === prev ? 1e-3 : 0); if (d < bd) { bd = d; best = pc; } } setParent(rig, k.id, best.id); }); // each child hangs on the nearest piece
    SB.bump(); return made;
  }
  /** New bones (from splitBone) bend the layers that bent with their source bone, so nothing jumps: call after keepAttached(sn). */
  function addToBinds(sn, made, fromId) {
    const { rig, T } = sn, P = poseAt(rig, T);
    for (const [o] of sn.layers) { const B = o.bind; if (!B || B.mode !== 'deform' || !B.inv || !B.inv[fromId] || !sn.F[fromId]) continue;
      for (const nb of made) { const Fn = boneFrameAt(rig, nb.id, T); if (!Fn) continue; const inv = matArr(Fn.inverse().multiply(arrMat(sn.F[fromId])).multiply(arrMat(sn.layers.find(l => l[0] === o)[1].inv[fromId])));
        B.inv[nb.id] = inv; const K = AF.inv(inv), hh = AF.ap(K, 0, 0), tt = AF.ap(K, nb.len, 0); B.seg[nb.id] = [U.r1(hh[0]), U.r1(hh[1]), U.r1(tt[0]), U.r1(tt[1])]; if (B.rigOf && B.rig !== rig.id) B.rigOf[nb.id] = rig.id; } }
    wChanged(); SB.bump(); void P;
  }
  // ---------- planted bones (feet): when the body moves, they stay put and the two bones above them bend
  /** What stays planted during a pose drag of ids: [{ foot, chain, x, y, a }] (rig space, at the playhead). */
  function plantTargets(rig, ids) {
    if (S.rigPlant === false) return []; const moving = new Set(ids.map(id => id.split(':')[1])), P = poseAt(rig, S.time), out = [];
    for (const f of rig.bones) { if (!f.plant || !f.parent) continue; const shin = boneById(rig, f.parent); if (!shin) continue; const chain = [shin.id]; if (shin.parent && !shin.pin) chain.push(shin.parent);
      if (moving.has(f.id) || chain.some(c => moving.has(c))) continue;
      let moves = false; for (let a = boneById(rig, chain[chain.length - 1]); a && a.parent; ) { a = boneById(rig, a.parent); if (a && moving.has(a.id)) { moves = true; break; } } if (!moves) continue; // only when a bone above it is moving
      const q = P[f.id];
      let bend = 1; if (chain.length === 2) { const t = P[chain[1]], k = P[chain[0]], cr = (t.tx - t.hx) * (k.ty - k.hy) - (t.ty - t.hy) * (k.tx - k.hx); // which way the knee bends now (straight: away from the middle)
        bend = Math.abs(cr) > 1e-3 * (Math.hypot(t.tx - t.hx, t.ty - t.hy) * Math.hypot(k.tx - k.hx, k.ty - k.hy) || 1) ? Math.sign(cr) : rig.mirrorX != null ? (t.hx < rig.mirrorX ? 1 : -1) * Math.sign(t.ty - t.hy || 1) : 1; }
      out.push({ foot: f.id, chain, x: q.hx, y: q.hy, a: q.a, bend }); }
    return out;
  }
  const wrapDeg = d => { while (d > 180) d -= 360; while (d < -180) d += 360; return d; };
  /** Which way a joint bends (bone.bend, set with the arrows: the joint at the bone's head goes that way, in the rig's space). */
  const BEND = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };
  /** Turn thigh and shin (two bones) so the shin's tip lands on (x, y). The knee goes the shin's bend way when it has one, else to side bend
      (+1 / -1). Returns the new pose values (not set). */
  function twoBone(rig, thighId, shinId, x, y, bend) {
    const lt = tree.localTime(rig), P = poseAt(rig, S.time), t = P[thighId], k = P[shinId], L1 = Math.hypot(t.tx - t.hx, t.ty - t.hy), L2 = Math.hypot(k.tx - k.hx, k.ty - k.hy), dx = x - t.hx, dy = y - t.hy;
    const d = U.clamp(Math.hypot(dx, dy), Math.abs(L1 - L2) + 0.01, L1 + L2 - 0.01), base = Math.atan2(dy, dx), a1 = Math.acos(U.clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
    const want = BEND[(boneById(rig, shinId) || {}).bend];
    if (want) { const side = sg => { const th = base - sg * a1; return Math.cos(th) * want[0] + Math.sin(th) * want[1] - (Math.cos(base) * want[0] + Math.sin(base) * want[1]) * Math.cos(a1); }; // how far that knee sits toward the arrow
      const a = side(1), b = side(-1); if (Math.abs(a - b) > 1e-4) bend = a > b ? 1 : -1; }
    const th = base - bend * a1, kx = t.hx + L1 * Math.cos(th), ky = t.hy + L1 * Math.sin(th), d1 = wrapDeg(th * 180 / Math.PI - t.a);
    return { ['bone:' + thighId]: U.r1(TR.value(rig, 'bone:' + thighId, lt) + d1), ['bone:' + shinId]: U.r1(TR.value(rig, 'bone:' + shinId, lt) + wrapDeg(Math.atan2(y - ky, x - kx) * 180 / Math.PI - (k.a + d1))) };
  }
  /** The bend that a two-bone chain has now (+1 / -1), for keeping it when no arrow is set. */
  function bendNow(rig, thighId, shinId) { const P = poseAt(rig, S.time), t = P[thighId], k = P[shinId]; const cr = (t.tx - t.hx) * (k.ty - k.hy) - (t.ty - t.hy) * (k.tx - k.hx); return cr === 0 ? 1 : Math.sign(cr); }
  /** After the drag's values vals are set, bend each planted chain back so its foot stays where it was (and keeps its angle). Returns vals plus those. */
  function replant(rig, vals, targets) {
    if (!targets.length) return vals; const out = Object.assign({}, vals), lt = tree.localTime(rig);
    const set = (id, v) => { if (S.recording && rig._live) rig._live[id] = v; else TR.set(rig, id, v); rig._pm = null; SB.bump(); }; // while recording, the values live in _live until the take ends
    for (const id in vals) set(id, vals[id]);
    for (const tg of targets) { const v = tg.chain.length === 2 ? twoBone(rig, tg.chain[1], tg.chain[0], tg.x, tg.y, tg.bend) : solveIK(rig, tg.chain[0], { x: tg.x, y: tg.y }, tg.chain, false); for (const id in v) set(id, v[id]); Object.assign(out, v);
      const q = poseAt(rig, S.time)[tg.foot]; let d = tg.a - q.a; while (d > 180) d -= 360; while (d < -180) d += 360; const k = 'bone:' + tg.foot, fv = U.r1(TR.value(rig, k, lt) + d); set(k, fv); out[k] = fv; }
    return out;
  }
  // ---------- a ready human skeleton
  /** Bones of a simple person (seen from the front) standing with its feet at y = 0, H tall, in rig space: hips, spine, chest, neck,
      head, arms and legs on both sides (mirrored, _L / _R), feet planted. The hips drag up and down; the legs bend to keep the feet. */
  function humanBones(rig, H) {
    const made = {}, k = H / 100, add = (key, name, par, hx, hy, tx, ty, extra) => { const b = Object.assign({ id: U.uid(), name, parent: null, x: hx * k, y: hy * k, len: U.r1(Math.hypot(tx - hx, ty - hy) * k), ang: U.r1(Math.atan2(ty - hy, tx - hx) * 180 / Math.PI), pose: 0 }, extra); rig.bones.push(b); made[key] = b; rig._pm = null; if (par) setParent(rig, b.id, made[par].id); return b; };
    add('hips', 'Hips', null, 0, -52, 0, -60, { grab: 'move' });
    add('spine', 'Spine', 'hips', 0, -60, 0, -72); add('chest', 'Chest', 'spine', 0, -72, 0, -84); add('neck', 'Neck', 'chest', 0, -84, 0, -88); add('head', 'Head', 'neck', 0, -88, 0, -100);
    for (const [s, x] of [['L', -1], ['R', 1]]) {
      add('ua' + s, 'Upper_arm_' + s, 'chest', 9 * x, -82, 15 * x, -66); add('fa' + s, 'Forearm_' + s, 'ua' + s, 15 * x, -66, 18 * x, -52); add('ha' + s, 'Hand_' + s, 'fa' + s, 18 * x, -52, 19 * x, -45);
      add('th' + s, 'Thigh_' + s, 'hips', 5.5 * x, -51, 7 * x, -27); add('sh' + s, 'Shin_' + s, 'th' + s, 7 * x, -27, 7.5 * x, -3); add('ft' + s, 'Foot_' + s, 'sh' + s, 7.5 * x, -3, 12 * x, 0, { plant: true });
    }
    for (const key of ['ua', 'fa', 'ha', 'th', 'sh', 'ft']) { made[key + 'L'].mirror = made[key + 'R'].id; made[key + 'R'].mirror = made[key + 'L'].id; }
    made.shL.bend = made.faL.bend = 'left'; made.shR.bend = made.faR.bend = 'right'; // knees and elbows bend outward (seen from the front); change it with the arrows
    rig.mirrorX = 0; rig.ik = 2; rig._pm = null; SB.bump(); return made;
  }
  /** Stop two bones being mirrors of each other. */
  function unmirror(rig, id) { const b = boneById(rig, id), m = mirrorOf(rig, b); if (b) delete b.mirror; if (m) delete m.mirror; }
  /** Bones that IK turns when you drag a tail: up the chain, stopping at a pinned bone. */
  function ikChain(rig, b) { const ch = [b.id]; let cur = b, n = rig.ik || 2; while (ch.length < n && cur.parent && !cur.pin) { cur = boneById(rig, cur.parent); if (!cur) break; ch.push(cur.id); } return ch; }
  /** Turn the chain so the end bone's tail reaches target (rig-local), CCD style. */
  function solveIK(rig, endId, target, chain, apply = true) {
    if (chain.length === 2 && chain[0] === endId && boneById(rig, endId) && BEND[boneById(rig, endId).bend]) { // a knee or elbow with a bend arrow: the exact two-bone answer, bent that way
      const out = twoBone(rig, chain[1], endId, target.x, target.y, bendNow(rig, chain[1], endId)); if (apply) for (const id in out) TR.set(rig, id, out[id]); return out; }
    const lt = tree.localTime(rig), poseVals = {}; rig.bones.forEach(b => poseVals[b.id] = TR.value(rig, 'bone:' + b.id, lt));
    for (let it = 0; it < 14; it++) {
      for (const id of chain) {
        const P = poseRaw(rig, lt, { poseVals }), end = P[endId], h = P[id];
        let d = (Math.atan2(target.y - h.hy, target.x - h.hx) - Math.atan2(end.ty - h.hy, end.tx - h.hx)) * 180 / Math.PI; while (d > 180) d -= 360; while (d < -180) d += 360; poseVals[id] += d;
      }
      const P = poseRaw(rig, lt, { poseVals }); if (Math.hypot(P[endId].tx - target.x, P[endId].ty - target.y) < 0.4) break;
    }
    const out = {}; for (const id of chain) out['bone:' + id] = U.r1(poseVals[id]);
    if (apply) for (const id in out) TR.set(rig, id, out[id]);
    return out;
  }

  // ---------- binding layers
  const bindRigs = B => B ? [...new Set([B.rig, ...Object.values(B.rigOf || {})])].filter(Boolean) : [];
  function boneOwner(B, id) { const r = tree.find((B.rigOf && B.rigOf[id]) || B.rig); return r && boneById(r, id) ? r : null; }
  /** The bones that bend a layer: all it was bound to, or only B.only (picked in the layer's Rig section) when that keeps any. */
  const bindBoneIds = B => { const all = Object.keys(B.inv || {}).filter(id => B.seg && B.seg[id] && boneOwner(B, id)); if (!B.only || !B.only.length) return all; const some = all.filter(id => B.only.includes(id)); return some.length ? some : all; };
  /** Bones of rig r that sit on layer o (their line, where o is bound, crosses its box grown a little): for "Near this layer". */
  function bonesNear(o, r) {
    const B = o.bind; if (!B || !B.seg) return []; const b = SB.scene.bounds(o); if (!b) return []; const M = X.world(o), q = U.emptyBox();
    [[b.x0, b.y0], [b.x1, b.y0], [b.x1, b.y1], [b.x0, b.y1]].forEach(([x, y]) => { const p = M.transformPoint(pt(x, y)); U.growBox(q, p.x, p.y); });
    const m = Math.max(6, 0.06 * Math.max(q.x1 - q.x0, q.y1 - q.y0)), inBox = (x, y) => x >= q.x0 - m && x <= q.x1 + m && y >= q.y0 - m && y <= q.y1 + m;
    return Object.keys(B.seg).filter(id => boneOwner(B, id) === r && (s => { for (let k = 0; k <= 8; k++) { const t = k / 8; if (inBox(s[0] + (s[2] - s[0]) * t, s[1] + (s[3] - s[1]) * t)) return true; } return false; })(B.seg[id]));
  }
  const bendsWith = (o, rig) => !!(o.bind && o.bind.mode === 'deform' && bindRigs(o.bind).includes(rig.id));
  /** Attach o to a rig. mode 'follow' (one bone) or 'deform' (bend with all bones). add: keep bending with other rigs too. */
  function bindTo(o, rig, boneId, mode, add) {
    if (!rig || !rig.bones.length) { SB.toast('Add bones to the rig first, with the Bones tool.'); return false; }
    if (o === rig || tree.isDesc(rig, o)) { SB.toast("A rig can't attach to itself or to a group that holds it."); return false; }
    if (o.type === 'rig' && mode !== 'follow') { SB.toast('A rig can only follow a bone.'); return false; }
    for (let r = rig, k = 0; r && k < 20; r = r.bind && tree.find(r.bind.rig), k++) if (r.bind && r.bind.rig === o.id) { SB.toast('That would make a loop of rigs.'); return false; }
    if (mode === 'deform' && (o.type === 'group' || !SB.types.get(o.type).frames)) { SB.toast('Groups can follow a bone, but only single layers can bend.'); return false; }
    const keep = add && o.bind && o.bind.mode === 'deform' ? o.bind : null; delete o.bind; SB.bump();
    const T = S.time;
    if (mode === 'follow') {
      if (!boneId) { const tr = TR.transform(o, tree.localTime(o)), c = X.world(o).transformPoint(pt(tr.ax, tr.ay)); boneId = nearestBone(rig, c).id; }
      const F = boneFrameAt(rig, boneId, T); o.bind = { rig: rig.id, mode, bone: boneId, inv: matArr(F.inverse()) };
    } else {
      const inv = keep ? keep.inv : {}, seg = keep ? keep.seg : {}, rigOf = keep ? (keep.rigOf || {}) : {}, RW = X.worldAt(rig, T), P = poseAt(rig, T);
      if (keep && !keep.rigOf) bindBoneIds(keep).forEach(id => rigOf[id] = keep.rig);
      const bbf = keep && keep.bbf || {}, RWa = matArr(RW);
      rig.bones.forEach(b => { const q = P[b.id], F = RW.multiply(arrMat(q.m)); inv[b.id] = matArr(F.inverse()); if (q.ch) bbf[b.id] = bbFrames(q).map(f => AF.mul(RWa, f).map(v => Math.round(v * 1e4) / 1e4)); else delete bbf[b.id]; const h = RW.transformPoint(pt(q.hx, q.hy)), t = RW.transformPoint(pt(q.tx, q.ty)); seg[b.id] = [h.x, h.y, t.x, t.y].map(U.r1); rigOf[b.id] = rig.id; });
      o.bind = Object.assign(keep || {}, { rig: keep ? keep.rig : rig.id, mode, inv, seg, rigOf, soft: keep ? keep.soft || 60 : 60 }); if (Object.keys(bbf).length) o.bind.bbf = bbf; else delete o.bind.bbf;
    }
    SB.bump(); o.rigLock = true; // Rig lock: the rig moves it now, so a drag poses the bones instead of moving the layer
    return true;
  }
  /** Re-attach at the current pose (after moving the layer or the bones). */
  function rebind(o) {
    const B = o.bind; if (!B) return;
    if (B.mode === 'follow') { const r = tree.find(B.rig); if (r) bindTo(o, r, B.bone, 'follow'); return; }
    const paint = B.paint, soft = B.soft, rs = bindRigs(B).map(tree.find).filter(Boolean); delete o.bind;
    rs.forEach((r, i) => bindTo(o, r, null, 'deform', i > 0)); if (o.bind) { o.bind.paint = paint; o.bind.soft = soft; }
  }
  function unbendFrom(o, r) { const B = o.bind; if (!B) return; bindBoneIds(B).filter(id => boneOwner(B, id) === r).forEach(id => { delete B.inv[id]; delete B.seg[id]; delete B.rigOf[id]; }); if (B.rig === r.id) B.rig = bindRigs(B).find(x => x !== r.id); if (!B.rig) delete o.bind; SB.bump(); }

  // follow: the layer's stage matrix is carried by the bone's motion since binding
  X.follow = (o, T) => {
    const B = o.bind; if (!B || B.mode !== 'follow') return null; const rig = tree.find(B.rig); if (!rig || rig === o || tree.isDesc(rig, o)) return null;
    const F = boneFrameAt(rig, B.bone, T); return F ? F.multiply(arrMat(B.inv)) : null;
  };
  // deform: every point moves by a weighted mix of how each bone moved since binding
  /** How much each bone moves a point: automatic (by distance, softness s2) and brush dabs first, then gradients
      in the order they were drawn. A gradient sets the bone's share directly: it eases from what was there toward
      100% (Add) or 0% (Remove) along its line — full at the start, untouched past the end — so mid values blend
      evenly over any length, and the other bones share what is left in the same proportions as before. */
  let WVER = 0; const wChanged = () => { WVER++; };
  function weights(B, ids, segs, px, py, s2) { return rawWeights(B, ids, segs, px, py, s2); }
  function rawWeights(B, ids, segs, px, py, s2) {
    const n = ids.length, W = new Array(n), base = new Array(n), P = B.paint || {}, ops = []; let sum = 0, bsum = 0;
    // Goal-curve and Even out fixes (B.goals: [x, y, r, { boneId: weight }, at]) set the weights near them. Everything is applied
    // in the order it was made, so brush, gradient and lasso edits made after a fix still add or remove weight there.
    // (Fixes without a time count as made at B.goalsAt, or after everything when that is missing too: older projects.)
    const goals = B.goals && B.goals.length ? B.goals : null, gT = g => g[4] != null ? g[4] : B.goalsAt != null ? B.goalsAt : Infinity;
    let tFirst = Infinity; if (goals) for (const g of goals) { const t = gT(g); if (t < tFirst) tFirst = t; }
    const atOf = d => (d[0] === 'l' ? d[5] : d[0] === 'g' ? d[6] : d[0] === 's' ? d[5] : d[0] === 'j' ? d[7] : d[4]) || 0;
    // "Keep other bones": an edit saved with a family (its last item: the ids of the bones joined to it) trades weight only with them
    const famOf = d => { const f = d[0] === 'l' ? d[6] : d[0] === 'g' ? d[7] : typeof d[0] === 'number' ? d[5] : null; return Array.isArray(f) ? f : null; };
    for (let i = 0; i < n; i++) {
      const d2 = distSeg2(px, py, segs[i]); let w = 1 / ((d2 + s2) * (d2 + s2)), m = 0; const dabs = P[ids[i]]; base[i] = w; bsum += w;
      if (dabs) for (const d of dabs) {
        if (d[0] === 'g' || d[0] === 'l' || d[0] === 'j' || famOf(d)) { ops.push([atOf(d), i, d]); continue; }
        if (atOf(d) > tFirst) { ops.push([atOf(d), i, d]); continue; } // a brush dab made after a fix: on top of it
        if (d[0] === 's') { const [, sx, sy, r, k] = d, q = ((px - sx) * (px - sx) + (py - sy) * (py - sy)) / (r * r); if (q < 1) m *= 1 - k * (1 - q) * (1 - q); continue; } // smooth: painted weight eases back to the soft automatic falloff
        const [dx, dy, r, v] = d, q = ((px - dx) * (px - dx) + (py - dy) * (py - dy)) / (r * r); if (q < 1) { const f = 1 - q; m += v * f * f; } }
      if (m) w *= Math.exp(U.clamp(m, -12, 12) * 2.5); W[i] = w; sum += w;
    }
    for (let i = 0; i < n; i++) W[i] /= sum || 1;
    if (goals) { // the fixes near this point, one step per batch (all the fixes made by one goal curve or one Even out dab)
      const by = new Map();
      for (const g of goals) { const dx = px - g[0], dy = py - g[1], r2 = g[2] * g[2], d2 = dx * dx + dy * dy; if (d2 >= r2) continue; const f = (1 - d2 / r2) ** 2, t = gT(g); let e = by.get(t); if (!e) by.set(t, e = { gs: 0, acc: new Array(n).fill(0) }); e.gs += f; for (let i = 0; i < n; i++) e.acc[i] += f * (g[3][ids[i]] || 0); }
      for (const [t, e] of by) ops.push([t, -1, e]);
    }
    if (!ops.length) return W;
    /** Bone i's share there becomes `target`; the other bones share what is left in the same proportions as before. */
    const setShare = (i, target) => {
      const wi = W[i], rest = 1 - wi, left = 1 - target;
      if (rest > 1e-9) { const f = left / rest; for (let j = 0; j < n; j++) if (j !== i) W[j] *= f; }
      else { let o = 0; for (let j = 0; j < n; j++) if (j !== i) o += base[j]; for (let j = 0; j < n; j++) if (j !== i) W[j] = o > 0 ? left * base[j] / o : 0; } // it had everything: the rest goes back by distance
      W[i] = target;
    };
    /** The same, but bone i trades only with the bones F (indexes): it takes from them what it gains, gives them what it loses. */
    const shareWith = (i, target, F) => {
      F = F.filter(j => j >= 0 && j !== i); if (!F.length) return setShare(i, target); const wi = W[i]; let pool = 0; for (const j of F) pool += W[j];
      if (target > wi) { const take = Math.min(target - wi, pool); if (pool > 1e-9) { const f = (pool - take) / pool; for (const j of F) W[j] *= f; } W[i] = wi + take; return; }
      const give = wi - target; if (pool > 1e-9) for (const j of F) W[j] += give * W[j] / pool; else { let bs = 0; for (const j of F) bs += base[j]; if (bs <= 0) return setShare(i, target); for (const j of F) W[j] += give * base[j] / bs; }
      W[i] = target;
    };
    const renorm = () => { let s = 0; for (let i = 0; i < n; i++) s += W[i]; if (s > 1e-9) for (let i = 0; i < n; i++) W[i] /= s; };
    ops.sort((a, b) => a[0] - b[0]); let dist = null; // distances to the bones, for joints (made when needed)
    for (const [, i, d] of ops) {
      if (i < 0) { const m = Math.min(1, d.gs); for (let j = 0; j < n; j++) W[j] = W[j] * (1 - m) + d.acc[j] / d.gs * m; renorm(); continue; } // a batch of fixes
      const wi = W[i], fam = famOf(d), set = fam ? (k, t) => shareWith(k, t, fam.map(id => ids.indexOf(id))) : setShare;
      if (d[0] === 'j') { // a joint ['j', cx, cy, r, ux, uy, partnerId, at]: the bone and its partner split their weight smoothly across the circle,
        // all the bone's beyond it and all the partner's behind it; only where these two are the nearest bones (easing off toward the others)
        const [, cx, cy, r, ux, uy, pid] = d, j = ids.indexOf(pid); if (j < 0 || j === i) continue;
        if (!dist) { dist = new Array(n); for (let k = 0; k < n; k++) dist[k] = Math.sqrt(distSeg2(px, py, segs[k])); }
        let dO = Infinity; for (let k = 0; k < n; k++) if (k !== i && k !== j && dist[k] < dO) dO = dist[k];
        const g = U.clamp((dO - Math.min(dist[i], dist[j])) / Math.max(r, 12) + 0.5, 0, 1), f = g * g * (3 - 2 * g); if (f <= 0) continue;
        const t = U.clamp(((px - cx) * ux + (py - cy) * uy) / r * 0.5 + 0.5, 0, 1), sm = t * t * (3 - 2 * t), T = W[i] + W[j];
        W[i] += (T * sm - W[i]) * f; W[j] += (T * (1 - sm) - W[j]) * f; continue;
      }
      if (d[0] === 'l') { // lasso ['l', v, soft, pts, only]: inside → 100% (v > 0) or 0% (v < 0); "only" also takes the bone away outside
        const [, v, soft, pts, only] = d, f = lassoCover(pts, px, py, soft), s = U.clamp(Math.abs(v), 0, 1);
        if (only) set(i, f * (wi + (1 - wi) * s) + (1 - f) * wi * (1 - s));
        else { const k = s * f; if (k <= 0) continue; set(i, v > 0 ? wi + (1 - wi) * k : wi * (1 - k)); }
      } else if (d[0] === 'g') { // gradient: eases from what was there toward 100% (Add) or 0% (Remove), full at its start
        const [, ax, ay, bx, by, v] = d, L2 = (bx - ax) * (bx - ax) + (by - ay) * (by - ay) || 1, t = U.clamp(((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / L2, 0, 1);
        const k = U.clamp(Math.abs(v), 0, 1) * (1 - t); if (k <= 0) continue; set(i, v > 0 ? wi + (1 - wi) * k : wi * (1 - k));
      } else if (d[0] === 's') { // Undo paint after a fix: back toward the automatic falloff
        const [, sx, sy, r, k] = d, q = ((px - sx) ** 2 + (py - sy) ** 2) / (r * r); if (q >= 1) continue; const f = U.clamp(k * (1 - q) * (1 - q), 0, 1); for (let j = 0; j < n; j++) W[j] += (base[j] / (bsum || 1) - W[j]) * f;
      } else { // a brush dab after a fix: Add raises the share, Remove lowers it
        const [dx, dy, r, v] = d, q = ((px - dx) ** 2 + (py - dy) ** 2) / (r * r); if (q >= 1) continue; const s = U.clamp(Math.abs(v) * (1 - q) * (1 - q) * 1.5, 0, 1);
        set(i, v > 0 ? wi + (1 - wi) * s : wi * (1 - s));
      }
    }
    renorm(); return W;
  }
  /** How much of a lasso covers (px, py): 1 well inside, 0 well outside, easing across a band `soft` wide on each side of its edge. */
  function lassoCover(pts, px, py, soft) {
    const n = pts.length / 2; let inside = false, d2 = Infinity;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = pts[i * 2], yi = pts[i * 2 + 1], xj = pts[j * 2], yj = pts[j * 2 + 1];
      if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) inside = !inside;
      const dx = xj - xi, dy = yj - yi, L = dx * dx + dy * dy, t = L ? U.clamp(((px - xi) * dx + (py - yi) * dy) / L, 0, 1) : 0, ex = px - xi - dx * t, ey = py - yi - dy * t; d2 = Math.min(d2, ex * ex + ey * ey);
    }
    const u = U.clamp(Math.sqrt(d2) / Math.max(soft, 1e-3), 0, 1), e = u * u * (3 - 2 * u); // smoothstep away from the edge
    return inside ? 0.5 + 0.5 * e : 0.5 - 0.5 * e;
  }
  const mapA = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
  SB.scene.deformer = (o, T, Mo, root) => {
    const B = o.bind; if (!B || B.mode !== 'deform') return null; const ids = bindBoneIds(B); if (!ids.length) return null;
    // a plain bone moves the points with one matrix; a B-bone with one per cut along it, blended by where the point sits
    const Ds = bonesMoved(B, ids, T);
    const isId = m => Math.abs(m[0] - 1) < 1e-4 && Math.abs(m[1]) < 1e-4 && Math.abs(m[2]) < 1e-4 && Math.abs(m[3] - 1) < 1e-4 && Math.abs(m[4]) < 0.05 && Math.abs(m[5]) < 0.05;
    if (Ds.every(m => m.mats ? m.mats.every(isId) : isId(m))) return null;
    const segs = ids.map(id => B.seg[id]), Wm = root.inverse().multiply(Mo), Wl = matArr(Wm), Wli = matArr(Wm.inverse()), s2 = Math.pow(B.soft || 60, 2);
    const dq = smoothBend(B);
    return (x, y) => {
      const [px, py] = mapA(Wl, x, y), W = weights(B, ids, segs, px, py, s2); let sx = 0, sy = 0;
      if (dq) { const q = dqPoint(Ds, W, px, py); if (q) return mapA(Wli, q[0], q[1]); }
      for (let i = 0; i < Ds.length; i++) {
        if (!W[i]) continue; const q = moveBy(Ds[i], px, py); sx += q[0] * W[i]; sy += q[1] * W[i];
      }
      return mapA(Wli, sx, sy);
    };
  };
  /** How each bone moved since binding, as matrices (a B-bone: one per joint, see bbDeform). */
  const bonesMoved = (B, ids, T) => ids.map(id => { const r = boneOwner(B, id), b = boneById(r, id), F = boneFrameAt(r, id, T); if (!F) return [1, 0, 0, 1, 0, 0]; return poseAt(r, T)[id].ch ? bbDeform(r, b, B, T) : matArr(F.multiply(arrMat(B.inv[id]))); });
  /** Where bone matrix m (from bonesMoved) takes stage point (px, py). */
  function moveBy(m, px, py) { return mapA(matOf(m, px, py), px, py); }
  /** The matrix of bone move m at (px, py) (a B-bone: the one for where the point sits along it). */
  function matOf(m, px, py) { if (!m.mats) return m; const g = m.sg, u = U.clamp(((px - g[0]) * (g[2] - g[0]) + (py - g[1]) * (g[3] - g[1])) / m.L2, 0, 1), f = u * m.n, k = Math.min(m.n - 1, Math.floor(f)), w = f - k, A = m.mats[k], Z = m.mats[k + 1]; return [0, 1, 2, 3, 4, 5].map(j => A[j] + (Z[j] - A[j]) * w); }
  /** Smooth bend: blend the bones' turns (dual complex numbers, the 2D form of dual quaternion skinning) instead of
      averaging where each bone would put the point. Near a joint the point swings round the joint on an arc, so the
      bend stays full and round (no pinched inside, no bumps outside). Works when the bones only move, turn and scale
      evenly (all by the same amount); otherwise null, and the plain blend is used for that point. */
  function dqPoint(Ds, W, px, py) {
    let rc = 0, rs = 0, dc = 0, ds = 0, sc = null, r0 = null, top = -1;
    for (let i = 0; i < Ds.length; i++) if (W[i] && (top < 0 || W[i] > W[top])) top = i;
    if (top >= 0) { const m = matOf(Ds[top], px, py), th = Math.atan2(m[1], m[0]); r0 = [Math.cos(th / 2), Math.sin(th / 2)]; } // the bone it follows most sets which way round
    for (let i = 0; i < Ds.length; i++) {
      const w = W[i]; if (!w) continue; const m = matOf(Ds[i], px, py), a = m[0], b = m[1], c = m[2], d = m[3], k = Math.hypot(a, b), tol = 2e-3 * k + 1e-6;
      if (Math.abs(a - d) > tol || Math.abs(b + c) > tol) return null; // stretched one way, or flipped
      if (sc == null) sc = k; else if (Math.abs(k - sc) > 0.01 * sc) return null;
      const th = Math.atan2(b, a); let qc = Math.cos(th / 2), qs = Math.sin(th / 2);
      if (qc * r0[0] + qs * r0[1] < 0) { qc = -qc; qs = -qs; } // the shorter way round from it
      const tx = m[4], ty = m[5]; rc += w * qc; rs += w * qs; dc += w * 0.5 * (tx * qc + ty * qs); ds += w * 0.5 * (ty * qc - tx * qs); // dual part ½·t·r̄ (a plane vector and a turn don't commute)
    }
    const n = Math.hypot(rc, rs); if (sc == null || n < 1e-9) return null; rc /= n; rs /= n; dc /= n; ds /= n;
    const tx = 2 * (dc * rc - ds * rs), ty = 2 * (dc * rs + ds * rc), ca = rc * rc - rs * rs, sa = 2 * rc * rs, X = sc * px, Y = sc * py;
    return [ca * X - sa * Y + tx, sa * X + ca * Y + ty];
  }
  /** Is smooth bend on for this layer? (B.dq; by default on, except in Game Engine projects: Unity and Godot blend plainly.) */
  const smoothBend = B => B.dq != null ? !!B.dq : !(SB.targets && SB.targets.get() === 'game');

  // ---------- goal curve: draw how the bent shape should look in this pose, and the weights change to match it
  /** Best weights (on the simplex: none below 0, they add up to 1) so that Σ w_i · q_i comes to target t, staying near w0. */
  function solveW(q, t, w0, lam) {
    const n = q.length, a = q.map(([x, y]) => [x - t[0], y - t[1]]); let L = 2 * lam; for (const [x, y] of a) L += 2 * (x * x + y * y); const eta = 1 / Math.max(L, 1e-9);
    let w = w0.slice();
    for (let it = 0; it < 300; it++) {
      let ex = 0, ey = 0; for (let i = 0; i < n; i++) { ex += w[i] * a[i][0]; ey += w[i] * a[i][1]; }
      const v = w.map((wi, i) => wi - eta * (2 * (a[i][0] * ex + a[i][1] * ey) + 2 * lam * (wi - w0[i])));
      const u = v.slice().sort((x, y) => y - x); let cs = 0, th = 0; for (let k = 0; k < n; k++) { cs += u[k]; const tt = (cs - 1) / (k + 1); if (u[k] - tt > 0) th = tt; } // projection onto the simplex
      w = v.map(x => Math.max(0, x - th));
    }
    return w;
  }
  /** The points of a layer's current frame on the stage (outlines of its lines and shapes), about every step px. */
  function layerPoints(o, step) {
    const M = X.world(o), fr = SB.frames.current(o), out = [], def = SB.types.get(o.type), lists = [];
    if (fr) for (const s of fr.strokes) if (!s.er) for (const L of G.lines(s)) lists.push(L);
    if (o.type === 'shape' && def.asPath) for (const L of G.lines(def.asPath(SB.scene.viewOf(o, tree.localTime(o))))) lists.push(L);
    const k = U.matScale(M) || 1;
    for (const L of lists) { const D = G.densify(L, step / k); for (let i = 0; i < D.length; i += 2) { const q = M.transformPoint(pt(D[i], D[i + 1])); out.push([q.x, q.y]); } }
    return out;
  }
  /** Goal curve: curve (stage points) is how the layers' edge should run in the pose at the playhead. Weights near it are
      solved so that edge moves onto the curve; the rest pose can't change (no bone has moved there), and the fix fades out
      over reach px so nothing tears. Returns how many points were matched (0: nothing near, -1: the rig is not posed). */
  function goalCurve(rig, curve, opt = {}) {
    const T = S.time, reach = opt.reach || 40, k = U.clamp(opt.k ?? 1, 0, 1); let matched = 0, posed = false;
    const segD = (x, y) => { let best = null; for (let i = 0; i + 3 < curve.length; i += 2) { const ax = curve[i], ay = curve[i + 1], dx = curve[i + 2] - ax, dy = curve[i + 3] - ay, L = dx * dx + dy * dy, t = L ? U.clamp(((x - ax) * dx + (y - ay) * dy) / L, 0, 1) : 0, cx = ax + dx * t, cy = ay + dy * t, d = Math.hypot(x - cx, y - cy); if (!best || d < best.d) best = { d, c: [cx, cy], end: (i === 0 && t <= 1e-6) || (i + 4 >= curve.length && t >= 1 - 1e-6) }; } return best; };
    for (const o of tree.all().filter(x => bendsWith(x, rig))) {
      const B = o.bind, ids = bindBoneIds(B); if (!ids.length) continue; const Ds = bonesMoved(B, ids, T), segs = ids.map(id => B.seg[id]), s2 = Math.pow(B.soft || 60, 2);
      if (Ds.some(m => m.mats ? m.mats.some(x => Math.abs(x[4]) + Math.abs(x[5]) + Math.abs(x[1]) + Math.abs(x[2]) > 0.01) : Math.abs(m[4]) + Math.abs(m[5]) + Math.abs(m[1]) + Math.abs(m[2]) > 0.01)) posed = true; else continue;
      const pts = layerPoints(o, Math.max(3, reach / 8)), jobs = [];
      for (const p of pts) {
        const w = weights(B, ids, segs, p[0], p[1], s2), qs = Ds.map(m => moveBy(m, p[0], p[1])); let x = 0, y = 0; qs.forEach((q, i) => { x += w[i] * q[0]; y += w[i] * q[1]; });
        const hit = segD(x, y); if (!hit || hit.d > reach || (hit.end && hit.d > 1.5)) continue; // past the line's ends: not part of it
        const f = k * (hit.d < reach * 0.5 ? 1 : (1 - (hit.d - reach * 0.5) / (reach * 0.5)) ** 2), tgt = [x + (hit.c[0] - x) * f, y + (hit.c[1] - y) * f];
        if (Math.hypot(tgt[0] - x, tgt[1] - y) < 0.75) continue; // already on the line: leave it
        jobs.push({ p, qs, tgt, w0: w });
      }
      if (!jobs.length) continue; matched += jobs.length;
      // the fix spreads a little around each point (so the far side of a thin part comes along), replacing older fixes there
      const step = Math.max(3, reach / 8), r = Math.max(step * 2.2, 6), goals = (B.goals || []).filter(g => !jobs.some(j => Math.hypot(g[0] - j.p[0], g[1] - j.p[1]) < r * 0.5));
      const fresh = jobs.map(j => { const w = solveW(j.qs, j.tgt, j.w0, 8), obj = {}; ids.forEach((id, i) => { if (w[i] > 1e-4) obj[id] = U.r3(w[i]); }); return [U.r1(j.p[0]), U.r1(j.p[1]), U.r1(r), obj]; });
      // even out neighbouring answers (along the edge), so the edge bends smoothly instead of in steps
      const smo = U.clamp(opt.smooth ?? 0, 0, 1), passes = 2 + Math.round(smo * 6), nb = step * (2.5 + smo * 3); // opt.smooth: a smoother, rounder result (less exact)
      for (let pass = 0; pass < passes; pass++) { const sm = fresh.map((g, gi) => { const acc = {}; let ws = 0; fresh.forEach((h2, hi) => { const d = Math.hypot(h2[0] - g[0], h2[1] - g[1]); if (d > nb) return; const wt = hi === gi ? 2 : 1; ws += wt; for (const id in h2[3]) acc[id] = (acc[id] || 0) + h2[3][id] * wt; }); for (const id in acc) acc[id] = U.r3(acc[id] / ws); return acc; }); fresh.forEach((g, gi) => g[3] = sm[gi]); }
      { const at = nextAt(); fresh.forEach(g => g[4] = at); } B.goals = goals.concat(fresh);
      // neighbouring fixes blend into each other: a few rounds bring each point back to its own answer
      for (let round = 0; round < 3 - Math.round(smo * 2); round++) jobs.forEach((j, gi) => {
        const g = fresh[gi], cur = weights(B, ids, segs, j.p[0], j.p[1], s2), want = solveW(j.qs, j.tgt, cur, 8), next = {}; let t = 0;
        ids.forEach((id, i) => { const v = Math.max(0, (g[3][id] || 0) + 0.6 * (want[i] - cur[i])); if (v > 1e-4) { next[id] = v; t += v; } });
        for (const id in next) next[id] = U.r3(next[id] / (t || 1)); g[3] = next;
      });
    }
    wChanged(); SB.bump(); return posed ? matched : -1;
  }
  /** Even out (blur) the weights around P (radius R, strength k): every bone's share there moves toward the average of the
      shares nearby, so a 100% edge comes down and a 0% gap fills in, painted, lasso and goal-curve weights alike. The result is
      kept like goal-curve fixes (weights at points, blending over the rest). Returns how many points changed. */
  function blurW(rig, P, R, k) {
    let changed = 0;
    for (const o of tree.all().filter(x => bendsWith(x, rig))) {
      const B = o.bind, ids = bindBoneIds(B); if (!ids.length) continue; const segs = ids.map(id => B.seg[id]), s2 = Math.pow(B.soft || 60, 2), step = Math.max(2, R / 6), sg = Math.max(step, R / 3);
      const pts = layerPoints(o, step).filter(p => Math.hypot(p[0] - P.x, p[1] - P.y) < R + sg); if (pts.length < 3) continue;
      const W = pts.map(p => weights(B, ids, segs, p[0], p[1], s2)), jobs = [];
      pts.forEach((p, i) => {
        const dc = Math.hypot(p[0] - P.x, p[1] - P.y); if (dc >= R) return; const f = U.clamp(k, 0, 1) * (1 - dc / R) ** 2 * 1.6; if (f < 0.01) return;
        const avg = new Array(ids.length).fill(0); let gs = 0; pts.forEach((q, j) => { const d2 = (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2; if (d2 > 9 * sg * sg) return; const g = Math.exp(-d2 / (2 * sg * sg)); gs += g; for (let b = 0; b < ids.length; b++) avg[b] += g * W[j][b]; });
        const want = W[i].map((w, b) => w + Math.min(1, f) * (avg[b] / (gs || 1) - w)); if (want.every((w, b) => Math.abs(w - W[i][b]) < 0.004)) return;
        jobs.push({ p, want });
      });
      if (!jobs.length) continue; changed += jobs.length;
      const r = Math.max(step * 2.2, 6), toObj = w => { const obj = {}; let t = 0; ids.forEach((id, b) => { const v = Math.max(0, w[b]); if (v > 1e-4) { obj[id] = v; t += v; } }); for (const id in obj) obj[id] = U.r3(obj[id] / (t || 1)); return obj; };
      const fresh = jobs.map(j => [U.r1(j.p[0]), U.r1(j.p[1]), U.r1(r), toObj(j.want)]), at = nextAt();
      B.goals = (B.goals || []).filter(g => !jobs.some(j => Math.hypot(g[0] - j.p[0], g[1] - j.p[1]) < r * 0.5)).concat(fresh.map(g => (g[4] = at, g)));
      for (let round = 0; round < 2; round++) jobs.forEach((j, gi) => { // neighbouring fixes blend: bring each point to its own answer
        const cur = weights(B, ids, segs, j.p[0], j.p[1], s2), g = fresh[gi]; g[3] = toObj(ids.map((id, b) => (g[3][id] || 0) + 0.7 * (j.want[b] - cur[b])));
      });
    }
    wChanged(); SB.bump(); return changed;
  }
  const hasGoals = rig => tree.all().some(o => bendsWith(o, rig) && o.bind.goals && o.bind.goals.length);
  function clearGoals(rig) { tree.all().forEach(o => { if (bendsWith(o, rig)) { delete o.bind.goals; delete o.bind.goalsAt; } }); wChanged(); SB.bump(); }
  /** How each joint of B-bone b moved since binding: n + 1 stage matrices, plus the bound bone's line to place points along it.
      At binding the joints' frames are stored (B.bbf); older bindings count from the straight bone. */
  function bbDeform(r, b, B, T) {
    const q = poseAt(r, T)[b.id], n = q.ch.n, RW = matArr(X.worldAt(r, T)), now = bbFrames(q).map(f => AF.mul(RW, f));
    let then = B.bbf && B.bbf[b.id]; if (!then || then.length !== n + 1) { const F0 = AF.inv(B.inv[b.id]); then = Array.from({ length: n + 1 }, (_, k) => AF.mul(F0, AF.T(b.len * k / n, 0))); }
    const mats = now.map((f, k) => AF.mul(f, AF.inv(then[k]))), g = B.seg[b.id];
    return { mats, n, sg: g, L2: Math.max(1e-6, (g[2] - g[0]) ** 2 + (g[3] - g[1]) ** 2) };
  }
  /** Paint a weight dab for a bone on every layer that bends with the rig. */
  /** A weight gradient for a bone on every layer that bends with the rig: full at A, none at B (stage points). */
  /** An edit made now (at) goes on top of the fixes already there (older fixes had no time: they count as made just before). */
  const stampGoals = (B, at) => { if (B.goals && B.goals.length && B.goalsAt == null) B.goalsAt = at - 0.5; };
  /** The bones joined to bone id (its parent and its children): who it trades weight with when other bones are kept. */
  const family = (rig, id) => { const b = boneById(rig, id); return b ? [b.parent, ...rig.bones.filter(x => x.parent === id).map(x => x.id)].filter(Boolean) : []; };
  /** Weight edits keep the other bones (S.wpaint.keep): the record carries the family it trades with. */
  const famRec = (rig, id) => S.wpaint && S.wpaint.keep ? [family(rig, id)] : [];
  function gradient(rig, boneId, A, B, v) { wChanged(); const at = nextAt(), fam = famRec(rig, boneId); tree.all().forEach(o => { if (!bendsWith(o, rig)) return; stampGoals(o.bind, at); const pnt = o.bind.paint || (o.bind.paint = {}); (pnt[boneId] = pnt[boneId] || []).push(['g', U.r1(A.x), U.r1(A.y), U.r1(B.x), U.r1(B.y), U.r3(v), at, ...fam]); }); SB.bump(); }
  /** A joint: bone boneId and partnerId (its parent, or a child for a top bone) share the circle (c, r, weight space) with a smooth
      hand-over along u (unit, from the partner's side to the bone's side); out to twice r it eases into what was there. */
  function jointW(rig, boneId, partnerId, c, r, u) { wChanged(); const at = nextAt(); tree.all().forEach(o => { if (!bendsWith(o, rig)) return; stampGoals(o.bind, at); const pnt = o.bind.paint || (o.bind.paint = {}); (pnt[boneId] = pnt[boneId] || []).push(['j', U.r1(c.x), U.r1(c.y), U.r1(Math.max(2, r)), U.r3(u.x), U.r3(u.y), partnerId, at]); }); SB.bump(); }
  /** Where a joint goes by default: the bone's line in weight space (from a layer bending with the rig), its partner, centre, size and direction. */
  function jointSpot(rig, boneId) {
    const o = tree.all().find(x => bendsWith(x, rig) && x.bind.seg && x.bind.seg[boneId]); if (!o) return null; const B = o.bind, sg = B.seg[boneId], b = boneById(rig, boneId);
    const kid = rig.bones.find(x => x.parent === boneId && B.seg[x.id]), up = b.parent && B.seg[b.parent] ? b.parent : null, partner = up || (kid && kid.id); if (!partner) return null;
    const L = Math.hypot(sg[2] - sg[0], sg[3] - sg[1]) || 1, ps = B.seg[partner], PL = Math.hypot(ps[2] - ps[0], ps[3] - ps[1]) || L, ux = (sg[2] - sg[0]) / L, uy = (sg[3] - sg[1]) / L;
    return { partner, c: up ? { x: sg[0], y: sg[1] } : { x: sg[2], y: sg[3] }, r: Math.max(6, 0.3 * Math.min(L, PL)), u: up ? { x: ux, y: uy } : { x: -ux, y: -uy } };
  }
  let lastAt = 0; const nextAt = () => (lastAt = Math.max(Date.now(), lastAt + 1)); // drawing order of gradients and lassos
  /** Lasso: inside the loop pts (flat, rig space) the bone gets 100% (mode 'add'), 0% ('sub'), or 100% inside and 0% outside ('only').
      soft: how wide the eased edge is; k: strength (1 = all the way). */
  function lasso(rig, boneId, pts, mode, soft, k) {
    wChanged(); const flat = simplifyLoop(pts, Math.max(0.5, soft * 0.05)).map(U.r1), v = U.r3((mode === 'sub' ? -1 : 1) * U.clamp(k, 0.05, 1)), at = nextAt();
    const fam = famRec(rig, boneId); tree.all().forEach(o => { if (!bendsWith(o, rig)) return; stampGoals(o.bind, at); const pnt = o.bind.paint || (o.bind.paint = {}), rec = ['l', v, U.r1(soft), flat, mode === 'only' ? 1 : 0, at, ...fam]; (pnt[boneId] = pnt[boneId] || []).push(rec); }); SB.bump();
  }
  /** Fewer points on a drawn loop (keeps it under ~160 points). */
  function simplifyLoop(pts, tol) { let out = pts; for (let k = 0; k < 6 && (k === 0 || out.length > 320); k++, tol *= 1.8) { const r = [out[0], out[1]]; for (let i = 2; i < out.length; i += 2) if (Math.hypot(out[i] - r[r.length - 2], out[i + 1] - r[r.length - 1]) >= tol) r.push(out[i], out[i + 1]); out = r; } return out; }
  function paint(rig, boneId, P, R, v) { wChanged(); const at = nextAt(), fam = famRec(rig, boneId); tree.all().forEach(o => { if (!bendsWith(o, rig)) return; stampGoals(o.bind, at); const pnt = o.bind.paint || (o.bind.paint = {}); (pnt[boneId] = pnt[boneId] || []).push([U.r1(P.x), U.r1(P.y), U.r1(R), U.r3(v), at, ...fam]); }); SB.bump(); }

  // ---------- the rig layer type
  SB.types.add({
    id: 'rig', label: 'Rig', icon: 'rig', color: '--c-rig', visual: true, render: false, frames: false, fx: false, noLength: true,
    defaults: p => ({ bones: [], ik: 2, showBones: true, frames: [], start: 0, dur: Math.max(1, p.duration) }),
    bounds(o) { if (!o.bones.length) return null; const b = U.emptyBox(), P = poseAt(o, S.time); o.bones.forEach(bn => { const q = P[bn.id]; U.growBox(b, q.hx, q.hy); U.growBox(b, q.tx, q.ty); }); b.x0 -= 12; b.y0 -= 12; b.x1 += 12; b.y1 += 12; return b; },
    props: o => o.bones.flatMap(b => boneProps(o, b, true)).concat(hasDyn(o) ? [['phys:on', 'Dynamics on']] : []),
    /** Everything a controller point can hold: every pose value of every bone. */
    allProps: o => o.bones.flatMap(b => boneProps(o, b, false)).map(p => p[0]).concat(hasDyn(o) ? ['phys:on'] : []),
  });

  /** Smooth: softens what was painted around P (for every bone there), back toward the automatic falloff. */
  function smoothW(rig, P, R, k) { wChanged(); const at = nextAt(); tree.all().forEach(o => { if (!bendsWith(o, rig)) return; const B = o.bind, pnt = B.paint || (B.paint = {}); stampGoals(B, at); bindBoneIds(B).forEach(id => { if ((pnt[id] && pnt[id].length) || (B.goals && B.goals.length)) (pnt[id] = pnt[id] || []).push(['s', U.r1(P.x), U.r1(P.y), U.r1(R), U.r3(U.clamp(k, 0, 1)), at]); }); }); SB.bump(); }
  /** Where a bone's weight is sampled on a layer: a grid over it, in stage space. */
  function weightSamples(o, boneId, N = 24, keep) {
    const B = o.bind, ids = bindBoneIds(B), bi = ids.indexOf(boneId); if (bi < 0) return []; const b = SB.scene.bounds(o); if (!b) return [];
    const M = X.world(o), segs = ids.map(id => B.seg[id]), s2 = Math.pow(B.soft || 60, 2), out = [];
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const p = M.transformPoint(pt(b.x0 + (i + 0.5) * (b.x1 - b.x0) / N, b.y0 + (j + 0.5) * (b.y1 - b.y0) / N)); if (keep && !keep(p)) continue; out.push(weights(B, ids, segs, p.x, p.y, s2)[bi]); }
    return out;
  }
  /** Is stage point p where a bone's weight was painted up (inside an adding dab, or on the full side of a gradient)? */
  const paintedUp = dabs => p => dabs.some(d => d[0] === 'l' ? d[1] > 0 && lassoCover(d[3], p.x, p.y, d[2]) > 0.5 : d[0] === 'g' ? d[5] > 0 && ((p.x - d[1]) * (d[3] - d[1]) + (p.y - d[2]) * (d[4] - d[2])) / ((d[3] - d[1]) ** 2 + (d[4] - d[2]) ** 2 || 1) < 0.25 : d[0] !== 's' && d[3] > 0 && Math.hypot(p.x - d[0], p.y - d[1]) < d[2] * 0.5);
  /** Normalize: scale what was painted for a bone so its strongest painted spot is fully on it (100%). Returns the factor (1: nothing to do). */
  function normalizeW(rig, boneId) {
    const layers = tree.all().filter(o => bendsWith(o, rig) && o.bind.paint && (o.bind.paint[boneId] || []).length); if (!layers.length) return 0;
    const peak = () => Math.max(0, ...layers.flatMap(o => weightSamples(o, boneId, 32, paintedUp(o.bind.paint[boneId]))));
    const keep = layers.map(o => o.bind.paint[boneId].map(d => d.slice())), scale = f => { wChanged(); layers.forEach((o, li) => { o.bind.paint[boneId] = keep[li].map(d => d[0] === 'g' ? Object.assign(d.slice(), { 5: U.r3(d[5] * f) }) : d[0] === 'l' ? Object.assign(d.slice(), { 1: U.r3(d[1] * f) }) : d[0] === 's' || d[0] === 'j' ? d.slice() : Object.assign(d.slice(), { 3: U.r3(d[3] * f) })); }); };
    if (peak() >= 0.98) return 1;
    let lo = 1, hi = 8; scale(hi); if (peak() < 0.98) { SB.bump(); return hi; }
    for (let it = 0; it < 14; it++) { const mid = (lo + hi) / 2; scale(mid); if (peak() >= 0.98) hi = mid; else lo = mid; }
    scale(hi); wChanged(); SB.bump(); return U.r2(hi);
  }
  /** Clear the painted weights of one bone (or every bone when boneId is null) on the layers bending with the rig. */
  function clearW(rig, boneId) { wChanged(); tree.all().forEach(o => { if (!bendsWith(o, rig) || !o.bind.paint) return; if (boneId) delete o.bind.paint[boneId]; else delete o.bind.paint; }); SB.bump(); }
  SB.rig = { BEND, bonesNear, twoBone, boneChain, joinBones, splitBone, addToBinds, plantTargets, replant, humanBones, family, jointW, jointSpot, syncMirror, mirrorName, mirrorOf, mirrorBones, unmirror, withMirror, mirrorIds, smoothBend, dqPoint, nextAt, goalCurve, blurW, clearGoals, hasGoals, wChanged, setParent, deleteBoneOnly, editSnap, keepAttached, smoothW, normalizeW, clearW, weightSamples, gradient, lasso, AF, BONE_P, nSegs, chainOf, boneProps, boneVals, placeBone, bbFrames, boneById, rigs, cached, ancSig, poseRaw, pose, poseAt, boneFrameAt, sim, hasDyn, dynOn, segsWorld, distSeg2, nearestBone, hit, toRig, make, addBone, deleteBone, ikChain, solveIK, bindTo, rebind, unbendFrom, bindRigs, boneOwner, bindBoneIds, bendsWith, weights, paint, matArr, arrMat };
})(window.SB);
