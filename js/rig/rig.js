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
  /** Bones that IK turns when you drag a tail: up the chain, stopping at a pinned bone. */
  function ikChain(rig, b) { const ch = [b.id]; let cur = b, n = rig.ik || 2; while (ch.length < n && cur.parent && !cur.pin) { cur = boneById(rig, cur.parent); if (!cur) break; ch.push(cur.id); } return ch; }
  /** Turn the chain so the end bone's tail reaches target (rig-local), CCD style. */
  function solveIK(rig, endId, target, chain, apply = true) {
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
  const bindBoneIds = B => Object.keys(B.inv || {}).filter(id => B.seg && B.seg[id] && boneOwner(B, id));
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
    const n = ids.length, W = new Array(n), base = new Array(n), P = B.paint || {}, grads = []; let sum = 0, bsum = 0;
    for (let i = 0; i < n; i++) {
      const d2 = distSeg2(px, py, segs[i]); let w = 1 / ((d2 + s2) * (d2 + s2)), m = 0; const dabs = P[ids[i]]; base[i] = w; bsum += w;
      if (dabs) for (const d of dabs) {
        if (d[0] === 's') { const [, sx, sy, r, k] = d, q = ((px - sx) * (px - sx) + (py - sy) * (py - sy)) / (r * r); if (q < 1) m *= 1 - k * (1 - q) * (1 - q); continue; } // smooth: painted weight eases back to the soft automatic falloff
        if (d[0] === 'g' || d[0] === 'l') { grads.push([i, d]); continue; }
        const [dx, dy, r, v] = d, q = ((px - dx) * (px - dx) + (py - dy) * (py - dy)) / (r * r); if (q < 1) { const f = 1 - q; m += v * f * f; } }
      if (m) w *= Math.exp(U.clamp(m, -12, 12) * 2.5); W[i] = w; sum += w;
    }
    for (let i = 0; i < n; i++) W[i] /= sum || 1;
    grads.sort((a, b) => ((a[1][0] === 'l' ? a[1][5] : a[1][6]) || 0) - ((b[1][0] === 'l' ? b[1][5] : b[1][6]) || 0)); // gradients and lassos in the order they were drawn
    for (const [i, d] of grads) {
      const wi = W[i]; let target;
      if (d[0] === 'l') { // lasso ['l', v, soft, pts, only]: inside → 100% (v > 0) or 0% (v < 0); "only" also takes the bone away outside
        const [, v, soft, pts, only] = d, f = lassoCover(pts, px, py, soft), s = U.clamp(Math.abs(v), 0, 1);
        if (only) target = f * (wi + (1 - wi) * s) + (1 - f) * wi * (1 - s);
        else { const k = s * f; if (k <= 0) continue; target = v > 0 ? wi + (1 - wi) * k : wi * (1 - k); }
      } else {
        const [, ax, ay, bx, by, v] = d, L2 = (bx - ax) * (bx - ax) + (by - ay) * (by - ay) || 1, t = U.clamp(((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / L2, 0, 1);
        const k = U.clamp(Math.abs(v), 0, 1) * (1 - t); if (k <= 0) continue;
        target = v > 0 ? wi + (1 - wi) * k : wi * (1 - k);
      }
      const rest = 1 - wi, left = 1 - target;
      if (rest > 1e-9) { const f = left / rest; for (let j = 0; j < n; j++) if (j !== i) W[j] *= f; }
      else { let o = 0; for (let j = 0; j < n; j++) if (j !== i) o += base[j]; for (let j = 0; j < n; j++) if (j !== i) W[j] = o > 0 ? left * base[j] / o : 0; } // it had everything: the rest goes back by distance
      W[i] = target;
    }
    if (grads.length) { let s = 0; for (let i = 0; i < n; i++) s += W[i]; if (s > 1e-9) for (let i = 0; i < n; i++) W[i] /= s; }
    // goal-curve fixes (B.goals: [x, y, r, { boneId: weight }]): near each, the weights become the ones solved there
    if (B.goals && B.goals.length) {
      let gs = 0; const acc = new Array(n).fill(0);
      for (const g of B.goals) { const dx = px - g[0], dy = py - g[1], r2 = g[2] * g[2], d2 = dx * dx + dy * dy; if (d2 >= r2) continue; const f = (1 - d2 / r2) ** 2; gs += f; for (let i = 0; i < n; i++) acc[i] += f * (g[3][ids[i]] || 0); }
      if (gs > 1e-9) { const m = Math.min(1, gs); let t = 0; for (let i = 0; i < n; i++) { W[i] = W[i] * (1 - m) + acc[i] / gs * m; t += W[i]; } if (t > 1e-9) for (let i = 0; i < n; i++) W[i] /= t; }
    }
    void bsum; return W;
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
    return (x, y) => {
      const [px, py] = mapA(Wl, x, y), W = weights(B, ids, segs, px, py, s2); let sx = 0, sy = 0;
      for (let i = 0; i < Ds.length; i++) {
        if (!W[i]) continue; const q = moveBy(Ds[i], px, py); sx += q[0] * W[i]; sy += q[1] * W[i];
      }
      return mapA(Wli, sx, sy);
    };
  };
  /** How each bone moved since binding, as matrices (a B-bone: one per joint, see bbDeform). */
  const bonesMoved = (B, ids, T) => ids.map(id => { const r = boneOwner(B, id), b = boneById(r, id), F = boneFrameAt(r, id, T); if (!F) return [1, 0, 0, 1, 0, 0]; return poseAt(r, T)[id].ch ? bbDeform(r, b, B, T) : matArr(F.multiply(arrMat(B.inv[id]))); });
  /** Where bone matrix m (from bonesMoved) takes stage point (px, py). */
  function moveBy(m, px, py) { if (m.mats) { const g = m.sg, u = U.clamp(((px - g[0]) * (g[2] - g[0]) + (py - g[1]) * (g[3] - g[1])) / m.L2, 0, 1), f = u * m.n, k = Math.min(m.n - 1, Math.floor(f)), w = f - k, A = m.mats[k], Z = m.mats[k + 1]; m = [0, 1, 2, 3, 4, 5].map(j => A[j] + (Z[j] - A[j]) * w); } return mapA(m, px, py); }

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
      B.goals = goals.concat(fresh);
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
      const fresh = jobs.map(j => [U.r1(j.p[0]), U.r1(j.p[1]), U.r1(r), toObj(j.want)]);
      B.goals = (B.goals || []).filter(g => !jobs.some(j => Math.hypot(g[0] - j.p[0], g[1] - j.p[1]) < r * 0.5)).concat(fresh);
      for (let round = 0; round < 2; round++) jobs.forEach((j, gi) => { // neighbouring fixes blend: bring each point to its own answer
        const cur = weights(B, ids, segs, j.p[0], j.p[1], s2), g = fresh[gi]; g[3] = toObj(ids.map((id, b) => (g[3][id] || 0) + 0.7 * (j.want[b] - cur[b])));
      });
    }
    wChanged(); SB.bump(); return changed;
  }
  const hasGoals = rig => tree.all().some(o => bendsWith(o, rig) && o.bind.goals && o.bind.goals.length);
  function clearGoals(rig) { tree.all().forEach(o => { if (bendsWith(o, rig)) delete o.bind.goals; }); wChanged(); SB.bump(); }
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
  function gradient(rig, boneId, A, B, v) { wChanged(); const at = nextAt(); tree.all().forEach(o => { if (!bendsWith(o, rig)) return; const pnt = o.bind.paint || (o.bind.paint = {}); (pnt[boneId] = pnt[boneId] || []).push(['g', U.r1(A.x), U.r1(A.y), U.r1(B.x), U.r1(B.y), U.r3(v), at]); }); SB.bump(); }
  let lastAt = 0; const nextAt = () => (lastAt = Math.max(Date.now(), lastAt + 1)); // drawing order of gradients and lassos
  /** Lasso: inside the loop pts (flat, rig space) the bone gets 100% (mode 'add'), 0% ('sub'), or 100% inside and 0% outside ('only').
      soft: how wide the eased edge is; k: strength (1 = all the way). */
  function lasso(rig, boneId, pts, mode, soft, k) {
    wChanged(); const flat = simplifyLoop(pts, Math.max(0.5, soft * 0.05)).map(U.r1), v = U.r3((mode === 'sub' ? -1 : 1) * U.clamp(k, 0.05, 1)), at = nextAt();
    tree.all().forEach(o => { if (!bendsWith(o, rig)) return; const pnt = o.bind.paint || (o.bind.paint = {}), rec = ['l', v, U.r1(soft), flat, mode === 'only' ? 1 : 0, at]; (pnt[boneId] = pnt[boneId] || []).push(rec); }); SB.bump();
  }
  /** Fewer points on a drawn loop (keeps it under ~160 points). */
  function simplifyLoop(pts, tol) { let out = pts; for (let k = 0; k < 6 && (k === 0 || out.length > 320); k++, tol *= 1.8) { const r = [out[0], out[1]]; for (let i = 2; i < out.length; i += 2) if (Math.hypot(out[i] - r[r.length - 2], out[i + 1] - r[r.length - 1]) >= tol) r.push(out[i], out[i + 1]); out = r; } return out; }
  function paint(rig, boneId, P, R, v) { wChanged(); tree.all().forEach(o => { if (!bendsWith(o, rig)) return; const pnt = o.bind.paint || (o.bind.paint = {}); (pnt[boneId] = pnt[boneId] || []).push([U.r1(P.x), U.r1(P.y), U.r1(R), U.r3(v)]); }); SB.bump(); }

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
  function smoothW(rig, P, R, k) { wChanged(); tree.all().forEach(o => { if (!bendsWith(o, rig)) return; const pnt = o.bind.paint || (o.bind.paint = {}); bindBoneIds(o.bind).forEach(id => { if (pnt[id] && pnt[id].length) pnt[id].push(['s', U.r1(P.x), U.r1(P.y), U.r1(R), U.r3(U.clamp(k, 0, 1))]); }); }); SB.bump(); }
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
    const keep = layers.map(o => o.bind.paint[boneId].map(d => d.slice())), scale = f => { wChanged(); layers.forEach((o, li) => { o.bind.paint[boneId] = keep[li].map(d => d[0] === 'g' ? Object.assign(d.slice(), { 5: U.r3(d[5] * f) }) : d[0] === 'l' ? Object.assign(d.slice(), { 1: U.r3(d[1] * f) }) : d[0] === 's' ? d.slice() : [d[0], d[1], d[2], U.r3(d[3] * f)]); }); };
    if (peak() >= 0.98) return 1;
    let lo = 1, hi = 8; scale(hi); if (peak() < 0.98) { SB.bump(); return hi; }
    for (let it = 0; it < 14; it++) { const mid = (lo + hi) / 2; scale(mid); if (peak() >= 0.98) hi = mid; else lo = mid; }
    scale(hi); wChanged(); SB.bump(); return U.r2(hi);
  }
  /** Clear the painted weights of one bone (or every bone when boneId is null) on the layers bending with the rig. */
  function clearW(rig, boneId) { wChanged(); tree.all().forEach(o => { if (!bendsWith(o, rig) || !o.bind.paint) return; if (boneId) delete o.bind.paint[boneId]; else delete o.bind.paint; }); SB.bump(); }
  SB.rig = { goalCurve, blurW, clearGoals, hasGoals, wChanged, setParent, deleteBoneOnly, editSnap, keepAttached, smoothW, normalizeW, clearW, weightSamples, gradient, lasso, AF, BONE_P, nSegs, chainOf, boneProps, boneVals, placeBone, bbFrames, boneById, rigs, cached, ancSig, poseRaw, pose, poseAt, boneFrameAt, sim, hasDyn, dynOn, segsWorld, distSeg2, nearestBone, hit, toRig, make, addBone, deleteBone, ikChain, solveIK, bindTo, rebind, unbendFrom, bindRigs, boneOwner, bindBoneIds, bendsWith, weights, paint, matArr, arrMat };
})(window.SB);
