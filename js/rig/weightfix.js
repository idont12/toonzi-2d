/* Clean up weights: finds what is messy in how layers bend with a rig, and tidies it while the poses stay put.

   How the weights work (rig.js): a point's share of every bone comes from its distance to the bones, painted
   dabs / gradients / lassos, and goal-curve "fixes" (B.goals: [x, y, r, { boneId: share }]) that override the
   result near a spot. There are no stored per-vertex weights, so this module samples the field at points along
   the layer's lines (a few hundred, evenly spaced), analyses those samples, and writes its corrections as
   goal fixes (the same mechanism Even out uses), after first repairing broken numbers in paint and fixes.

   Problems it looks for, per bound layer:
     empty   spots that follow no bone at all (or whose numbers are broken)
     sum     shares that do not add up to 100%
     broken  paint or fixes holding impossible numbers (they are removed)
     spike   a spot that follows other bones than all its neighbours do
     island  a small patch that follows a bone while the rest of that bone's area is somewhere else
     far     a spot pulled by a bone that is far away
     many    pulled by more bones than the limit
     tiny    small leftover shares that do not belong to a smooth falloff
     jag     rough, jagged changes between neighbouring spots
   Fixes are checked against test poses (the rig's keyed poses and every bone turned both ways): changes that are not
   glitches (limits, tiny shares, smoothing) are only kept when they move no point more than a small allowance.
   API: SB.weightFix = { analyze(rig, level), fix(rig, level), open(rig), LEVELS, KINDS } */
'use strict';
(function (SB) {
  const U = SB.util, S = SB.state, tree = SB.tree, X = SB.xf, G = SB.paths, R = SB.rig, TR = SB.tracks, AF = R.AF;
  const pt = U.pt;

  const KINDS = ['empty', 'sum', 'broken', 'spike', 'island', 'far', 'many', 'tiny', 'jag'];
  const GLITCH = new Set(['empty', 'sum', 'broken', 'spike', 'island', 'far']);
  const SOFT = new Set(['many', 'tiny', 'jag']);
  /* minW: shares below this are dropped; maxInf: most bones that may move one spot; spike / jag: how different from the
     neighbours counts as a spike / as rough; mix: how far outliers are pulled to their neighbours; passes: smoothing rounds;
     dev: the most a calm spot may move in any test pose, as a part of the layer's size */
  const LEVELS = {
    gentle: { key: 'gentle', label: 'Gentle', minW: 0.02, maxInf: 4, spike: 0.4, jag: 0.3, mix: 0.8, passes: 1, dev: 0.005, tailAll: false, hint: 'Fixes only the clear mistakes and changes as little as possible.' },
    normal: { key: 'normal', label: 'Normal', minW: 0.025, maxInf: 4, spike: 0.32, jag: 0.22, mix: 0.95, passes: 2, dev: 0.01, tailAll: false, hint: 'Fixes mistakes, evens out roughness and drops tiny noise.' },
    strong: { key: 'strong', label: 'Strong', minW: 0.03, maxInf: 3, spike: 0.25, jag: 0.16, mix: 1, passes: 3, dev: 0.02, tailAll: true, hint: 'Cleans everything it can: at most 3 bones per spot, no small leftovers.' },
  };
  const lvOf = l => typeof l === 'string' ? LEVELS[l] || LEVELS.normal : l || LEVELS.normal;

  // ---------- small helpers
  const sum = a => { let s = 0; for (const x of a) s += x; return s; };
  const median = a => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const amax = a => { let m = 0, k = 0; for (let i = 0; i < a.length; i++) if (a[i] > m) { m = a[i]; k = i; } return k; };
  const finite = a => a.every(Number.isFinite);
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  /** Shares made clean: no negatives, at most lv.maxInf bones, none under lv.minW, adding up to 1 (null: nothing left). */
  function tidy(w, lv) {
    let v = w.map(x => Number.isFinite(x) && x > 0 ? x : 0), s = sum(v); if (s <= 1e-9) return null; v = v.map(x => x / s);
    const order = v.map((x, i) => i).sort((a, b) => v[b] - v[a]), keep = new Set(order.slice(0, lv.maxInf).filter(i => v[i] >= lv.minW));
    if (!keep.size) keep.add(order[0]);
    v = v.map((x, i) => keep.has(i) ? x : 0); s = sum(v); return v.map(x => x / s);
  }

  // ---------- sampling a layer
  function linesOf(o) {
    const def = SB.types.get(o.type), lists = [], frames = o.frames && o.frames.length > 1 && o.frames.length <= 40 ? o.frames : [o.frames && SB.frames.current(o)];
    for (const fr of frames) if (fr && fr.strokes) for (const s of fr.strokes) if (!s.er) for (const L of G.lines(s)) lists.push(L);
    if (o.type === 'shape' && def.asPath) for (const L of G.lines(def.asPath(SB.scene.viewOf(o, tree.localTime(o))))) lists.push(L);
    return lists;
  }
  /** About maxN points along the layer's lines on the stage, evenly spaced (step px apart). */
  function samplePts(o, maxN) {
    const lists = linesOf(o), M = X.world(o), k = U.matScale(M) || 1; let step = 4, out = [];
    for (let tries = 0; tries < 5; tries++) {
      out = []; const grid = new Map(), cell = step * 0.45;
      for (const L of lists) {
        const D = G.densify(L, step / k);
        for (let i = 0; i + 1 < D.length; i += 2) {
          const q = M.transformPoint(pt(D[i], D[i + 1])), gx = Math.floor(q.x / cell), gy = Math.floor(q.y / cell); let dup = false;
          for (let a = -1; a <= 1 && !dup; a++) for (let b = -1; b <= 1 && !dup; b++) for (const p of grid.get((gx + a) + ',' + (gy + b)) || []) if (Math.hypot(p[0] - q.x, p[1] - q.y) < step * 0.35) { dup = true; break; }
          if (dup) continue; const p = [q.x, q.y]; out.push(p); const key = gx + ',' + gy; if (!grid.has(key)) grid.set(key, []); grid.get(key).push(p);
        }
      }
      if (out.length <= maxN) break; step *= Math.max(1.1, out.length / maxN);
    }
    return { pts: out, step };
  }
  /** Everything known about one bound layer: its sample points, neighbours, distances to the bones and the plain falloff. */
  function layerCtx(o, rig, maxN = 280) {
    const B = o.bind; if (!B || B.mode !== 'deform') return null; const ids = R.bindBoneIds(B); if (!ids.length) return null;
    const { pts, step } = samplePts(o, maxN); if (pts.length < 3) return null;
    const segs = ids.map(id => B.seg[id]), soft = B.soft || 60, s2 = soft * soft, n = pts.length, nb = ids.length, Bb = { soft: B.soft };
    const nbr = pts.map((p, i) => { const l = []; for (let j = 0; j < n; j++) if (j !== i) { const d = dist(p, pts[j]); if (d <= step * 1.95) l.push([d, j]); } l.sort((a, b) => a[0] - b[0]); return l.slice(0, 8).map(x => x[1]); });
    const comp = new Array(n).fill(-1); let nc = 0;
    for (let i = 0; i < n; i++) if (comp[i] < 0) { const st = [i]; comp[i] = nc; while (st.length) { const a = st.pop(); for (const j of nbr[a]) if (comp[j] < 0) { comp[j] = nc; st.push(j); } } nc++; }
    const ctx = { o, B, ids, segs, soft, s2, pts, step, n, nb, nbr, comp, nc, Bb, names: ids.map(id => (R.boneById(R.boneOwner(B, id), id) || {}).name || '?') };
    ctx.d = pts.map(p => segs.map(sg => Math.sqrt(R.distSeg2(p[0], p[1], sg))));
    ctx.base = pts.map(p => R.weights(Bb, ids, segs, p[0], p[1], s2));
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const p of pts) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
    ctx.diag = Math.max(40, Math.hypot(x1 - x0, y1 - y0)); ctx.rig = rig;
    return ctx;
  }
  const field = ctx => ctx.pts.map(p => R.weights(ctx.B, ctx.ids, ctx.segs, p[0], p[1], ctx.s2));

  // ---------- bad numbers inside the paint and the fixes
  const nums = (a, k) => a.length >= k && a.slice(0, k).every(Number.isFinite);
  function dabOk(d) {
    if (!Array.isArray(d)) return false;
    if (d[0] === 's') return nums(d.slice(1), 4);
    if (d[0] === 'g') return nums(d.slice(1), 5);
    if (d[0] === 'l') return Number.isFinite(d[1]) && Number.isFinite(d[2]) && Array.isArray(d[3]) && d[3].length >= 6 && finite(d[3]);
    return nums(d, 4) && d[2] > 0;
  }
  /** Counts of broken numbers: { broken, empty, sum } (fix spots whose shares are empty / do not add up to 100%). */
  function dataIssues(B, ids) {
    const out = { broken: 0, empty: 0, sum: 0 }, P = B.paint || {};
    for (const id in P) for (const d of P[id] || []) if (!dabOk(d)) out.broken++;
    for (const g of B.goals || []) {
      if (!Array.isArray(g) || g.length < 4 || !nums(g, 3) || g[2] <= 0 || !g[3] || typeof g[3] !== 'object') { out.broken++; continue; }
      let s = 0, any = false, bad = false;
      for (const id in g[3]) { const v = g[3][id]; if (!Number.isFinite(v)) { bad = true; continue; } if (ids.includes(id) && v > 0) { s += v; if (v > 1e-4) any = true; } }
      if (bad) out.broken++; else if (!any) out.empty++; else if (Math.abs(s - 1) > 0.02) out.sum++;
    }
    return out;
  }
  /** Repair them: broken paint and fixes go, tables are cleaned and add up to 100%. */
  function cleanData(B, ids, lv) {
    if (B.paint) for (const id in B.paint) { const keep = (B.paint[id] || []).filter(dabOk); if (keep.length) B.paint[id] = keep; else delete B.paint[id]; }
    if (B.goals) {
      B.goals = B.goals.filter(g => Array.isArray(g) && g.length >= 4 && nums(g, 3) && g[2] > 0 && g[3] && typeof g[3] === 'object').map(g => {
        const w = ids.map(id => Number.isFinite(g[3][id]) ? g[3][id] : 0), t = tidy(w, Object.assign({}, lv, { maxInf: 99, minW: Math.min(lv.minW, 0.02) })); if (!t) return null;
        const obj = {}; ids.forEach((id, i) => { if (t[i] > 1e-4) obj[id] = U.r3(t[i]); }); return g[4] != null ? [g[0], g[1], g[2], obj, g[4]] : [g[0], g[1], g[2], obj];
      }).filter(Boolean);
      if (!B.goals.length) delete B.goals;
    }
  }

  // ---------- analysis of a field
  const farBones = (ctx, i, w, lv) => {
    const d = ctx.d[i], dmin = Math.min(...d), out = [];
    for (let b = 0; b < ctx.nb; b++) if (w[b] >= 0.08 && d[b] - dmin > 3 * ctx.soft && w[b] > 4 * ctx.base[i][b]) out.push(b);
    void lv; return out;
  };
  /** Which problems each sample point has: flags[i] is a list of kinds. V[i]: its normalized shares (null: none). */
  function scan(ctx, W, lv) {
    const { n, nb, nbr } = ctx, fl = Array.from({ length: n }, () => []), V = new Array(n).fill(null);
    for (let i = 0; i < n; i++) {
      const w = W[i]; if (!finite(w)) { fl[i].push('empty'); continue; }
      const s = sum(w); if (s < 0.5) { fl[i].push('empty'); continue; }
      if (Math.abs(s - 1) > 0.02) fl[i].push('sum'); V[i] = w.map(x => Math.max(0, x) / s);
    }
    const stats = new Array(n).fill(null);
    for (let i = 0; i < n; i++) {
      const v = V[i]; if (!v) continue; const nv = nbr[i].filter(j => V[j]), many = v.filter(x => x >= lv.minW).length > lv.maxInf;
      if (many) fl[i].push('many');
      if (farBones(ctx, i, v, lv).length) fl[i].push('far');
      let med = null;
      if (nv.length >= 3) {
        med = v.map((_, b) => median(nv.map(j => V[j][b])));
        const dev = Math.max(...v.map((x, b) => Math.abs(x - med[b]))), dj = nv.map(j => Math.max(...V[j].map((x, b) => Math.abs(x - med[b]))));
        if (dev > lv.spike && median(dj) < lv.spike * 0.5) fl[i].push('spike');
        const top = amax(v); stats[i] = { nv, med, core: v[top] > 0.9 && nv.filter(j => amax(V[j]) === top).length >= nv.length / 2 };
      }
      let stray = 0, noisy = false;
      for (let b = 0; b < nb; b++) if (v[b] > 0.003 && v[b] < lv.minW) { stray += v[b]; if (lv.tailAll || Math.abs(v[b] - ctx.base[i][b]) > Math.max(0.005, 0.5 * v[b])) noisy = true; } /* a tail that follows the plain falloff is fine */
      if (noisy && stray >= lv.minW * 0.5) fl[i].push('tiny');
    }
    /* islands: small patches (w >= 50%) of a bone next to a much bigger patch of the same bone in the same piece */
    const hasF = (i, k) => fl[i].includes(k);
    for (let c = 0; c < ctx.nc; c++) {
      const members = []; for (let i = 0; i < n; i++) if (ctx.comp[i] === c && V[i]) members.push(i); if (members.length < 12) continue;
      for (let b = 0; b < nb; b++) {
        const seen = new Set(), patches = [];
        for (const i of members) if (V[i][b] >= 0.5 && !hasF(i, 'spike') && !seen.has(i)) {
          const patch = [i], st = [i]; seen.add(i);
          while (st.length) { const a = st.pop(); for (const j of nbr[a]) if (V[j] && V[j][b] >= 0.5 && !hasF(j, 'spike') && !seen.has(j)) { seen.add(j); patch.push(j); st.push(j); } }
          patches.push(patch);
        }
        if (patches.length < 2) continue; const big = Math.max(...patches.map(p => p.length)); if (big < 3) continue;
        for (const p of patches) if (p.length <= Math.max(2, big * 0.25) && p.length < big) for (const i of p) if (!hasF(i, 'island')) fl[i].push('island');
      }
    }
    /* rough: far from the average of the neighbours, but not a spike / island, and not a firm core */
    for (let i = 0; i < n; i++) {
      const v = V[i], st = stats[i]; if (!v || !st || st.core || hasF(i, 'spike') || hasF(i, 'island')) continue;
      let r = 0; for (let b = 0; b < nb; b++) r = Math.max(r, Math.abs(v[b] - sum(st.nv.map(j => V[j][b])) / st.nv.length));
      if (r > lv.jag) fl[i].push('jag');
    }
    return { fl, V, stats };
  }
  const countsOf = (fl, data) => {
    const c = {}; KINDS.forEach(k => c[k] = 0); let spots = 0;
    for (const f of fl) { if (f.length) spots++; for (const k of f) c[k]++; }
    c.empty += data.empty; c.sum += data.sum; c.broken += data.broken; spots += data.empty + data.sum + data.broken;
    return { counts: c, spots };
  };

  // ---------- test poses and how far points move
  function poseCtx(rig, P, T) {
    const cache = {}; cache[rig.id] = { P, RW: R.matArr(X.worldAt(rig, T)) };
    return r => cache[r.id] || (cache[r.id] = { P: R.poseAt(r, S.time), RW: R.matArr(X.worldAt(r, S.time)) });
  }
  /** The rig's keyed poses (up to 6), the pose now, every bone turned 35° each way, and all bones turned together. */
  function poseList(rig) {
    const out = [], T0 = S.time, lt0 = tree.localTime(rig, T0), times = new Set();
    out.push({ label: 'now', ctx: poseCtx(rig, R.poseAt(rig, T0), T0) });
    for (const id in rig.tracks || {}) { const pre = id.split(':')[0]; if (R.BONE_P[pre] || pre === 'bseg') for (const k of rig.tracks[id]) if (Number.isFinite(k.t)) times.add(U.r3(k.t)); }
    let ts = [...times].sort((a, b) => a - b); if (ts.length > 6) ts = Array.from({ length: 6 }, (_, i) => ts[Math.round(i * (ts.length - 1) / 5)]);
    for (const t of ts) out.push({ label: 'key ' + t, key: true, ctx: poseCtx(rig, R.pose(rig, t), tree.mainAt(rig, t)) });
    const vals = {}; rig.bones.forEach(b => vals[b.id] = TR.value(rig, 'bone:' + b.id, lt0));
    for (const b of rig.bones) for (const d of [-35, 35]) { const pv = Object.assign({}, vals); pv[b.id] += d; out.push({ label: b.name + ' ' + d, ctx: poseCtx(rig, R.poseRaw(rig, lt0, { poseVals: pv }), T0) }); }
    if (rig.bones.length > 1) { const pv = {}; rig.bones.forEach(b => pv[b.id] = vals[b.id] + 25); out.push({ label: 'all +25', ctx: poseCtx(rig, R.poseRaw(rig, lt0, { poseVals: pv }), T0) }); }
    return out;
  }
  /** How each bone has moved since the layer was bound, in a pose (a B-bone: one matrix per joint). Same as the renderer. */
  function movedFor(B, ids, pc) {
    return ids.map(id => {
      const r = R.boneOwner(B, id), b = R.boneById(r, id), c = pc(r), q = c.P[id]; if (!q) return [1, 0, 0, 1, 0, 0];
      if (!q.ch) return AF.mul(AF.mul(c.RW, q.m), B.inv[id]);
      const n = q.ch.n, now = R.bbFrames(q).map(f => AF.mul(c.RW, f)); let then = B.bbf && B.bbf[id];
      if (!then || then.length !== n + 1) { const F0 = AF.inv(B.inv[id]); then = Array.from({ length: n + 1 }, (_, k) => AF.mul(F0, AF.T(b.len * k / n, 0))); }
      const g = B.seg[id]; return { mats: now.map((f, k) => AF.mul(f, AF.inv(then[k]))), n, sg: g, L2: Math.max(1e-6, (g[2] - g[0]) ** 2 + (g[3] - g[1]) ** 2) };
    });
  }
  function moveBy(m, px, py) {
    if (m.mats) { const g = m.sg, u = U.clamp(((px - g[0]) * (g[2] - g[0]) + (py - g[1]) * (g[3] - g[1])) / m.L2, 0, 1), f = u * m.n, k = Math.min(m.n - 1, Math.floor(f)), w = f - k, A = m.mats[k], Z = m.mats[k + 1]; m = [0, 1, 2, 3, 4, 5].map(j => A[j] + (Z[j] - A[j]) * w); }
    return AF.ap(m, px, py);
  }
  /** ctx.Q[pose][point][bone]: where each bone's motion takes each sample point. */
  function prepareQ(ctx, poses) {
    ctx.Q = poses.map(p => { const Ds = movedFor(ctx.B, ctx.ids, p.ctx); return ctx.pts.map(q => Ds.map(m => moveBy(m, q[0], q[1]))); });
  }
  /** The most point i moves in any test pose when its shares change from a to b. */
  function devOf(ctx, i, a, b) {
    let worst = 0;
    for (const Qp of ctx.Q) { let dx = 0, dy = 0; const q = Qp[i]; for (let k = 0; k < ctx.nb; k++) { const dw = b[k] - a[k]; dx += dw * q[k][0]; dy += dw * q[k][1]; } worst = Math.max(worst, Math.hypot(dx, dy)); }
    return worst;
  }
  const meanDev = (ctx, i, a, b) => { let s = 0; for (const Qp of ctx.Q) { let dx = 0, dy = 0; const q = Qp[i]; for (let k = 0; k < ctx.nb; k++) { const dw = b[k] - a[k]; dx += dw * q[k][0]; dy += dw * q[k][1]; } s += Math.hypot(dx, dy); } return s / ctx.Q.length; };

  // ---------- the plan: what the shares should be at each flagged point
  /** sm scales the smoothing of rough spots (1 = full, 0 = none). Returns target shares per point (null: leave alone). */
  function plan(ctx, sc, lv, sm) {
    const { n, nb, nbr, pts } = ctx, { fl, V } = sc, has = (i, k) => fl[i].includes(k), isBad = i => !V[i] || has(i, 'spike') || has(i, 'island');
    const cur = V.map(v => v ? v.slice() : null);
    const avgOf = (i, pool) => { const acc = new Array(nb).fill(0); let ws = 0; for (const j of pool) { const w = 1 / (dist(pts[i], pts[j]) + 1); ws += w; for (let b = 0; b < nb; b++) acc[b] += w * cur[j][b]; } return ws ? acc.map(x => x / ws) : null; };
    const topTwo = i => { const bw = ctx.base[i], o = bw.map((x, b) => b).sort((a, b) => bw[b] - bw[a]).slice(0, 2), r = new Array(nb).fill(0); o.forEach(b => r[b] = bw[b]); const s = sum(r) || 1; return r.map(x => x / s); };
    /* empty spots, spikes and islands: toward what their healthy neighbours do (empty ones: the nearest bones if none) */
    const fixes = {};
    for (let i = 0; i < n; i++) {
      if (!(has(i, 'empty') || has(i, 'spike') || has(i, 'island'))) continue;
      const pool = nbr[i].filter(j => !isBad(j)), avg = pool.length >= 2 ? avgOf(i, pool) : null;
      if (has(i, 'empty')) fixes[i] = avg || topTwo(i);
      else fixes[i] = cur[i].map((x, b) => x + lv.mix * ((avg || ctx.base[i])[b] - x));
    }
    for (const i in fixes) cur[i] = fixes[i];
    /* far away bones lose their pull (back to the plain falloff) */
    for (let i = 0; i < n; i++) if (cur[i] && has(i, 'far')) {
      const w = cur[i].slice(); for (const b of farBones(ctx, i, w, lv)) w[b] = Math.min(w[b], ctx.base[i][b]);
      const s = sum(w) || 1; cur[i] = w.map(x => x / s);
    }
    /* rough spots: a few rounds toward the average of the neighbours (firm cores stay) */
    const rough = []; for (let i = 0; i < n; i++) if (cur[i] && has(i, 'jag') && !(sc.stats[i] && sc.stats[i].core)) rough.push(i);
    if (sm > 0) for (let pass = 0; pass < lv.passes; pass++) {
      const next = new Map();
      for (const i of rough) { const pool = nbr[i].filter(j => cur[j]); if (pool.length < 2) continue; const avg = avgOf(i, pool), lam = 0.5 * lv.mix * sm; next.set(i, cur[i].map((x, b) => x + lam * (avg[b] - x))); }
      for (const [i, w] of next) cur[i] = w;
    }
    return cur.map((w, i) => w && fl[i].length ? tidy(w, lv) : null);
  }

  // ---------- analysis
  function analyzeLayer(ctx, lv) {
    const W = field(ctx), sc = scan(ctx, W, lv), data = dataIssues(ctx.B, ctx.ids), c = countsOf(sc.fl, data);
    return { ctx, W, sc, data, counts: c.counts, spots: c.spots };
  }
  /** What is wrong with the layers that bend with a rig. { layers: [{ id, name, counts, spots, points }], spots } */
  function analyze(rig, level) {
    const lv = lvOf(level), layers = [];
    for (const o of tree.all()) {
      if (!R.bendsWith(o, rig)) continue; const ctx = layerCtx(o, rig); if (!ctx) { layers.push({ id: o.id, name: o.name, counts: Object.fromEntries(KINDS.map(k => [k, 0])), spots: 0, points: 0, skipped: true }); continue; }
      const a = analyzeLayer(ctx, lv); layers.push({ id: o.id, name: o.name, counts: a.counts, spots: a.spots, points: ctx.n, _a: a });
    }
    return { layers, spots: layers.reduce((s, l) => s + l.spots, 0), level: lv.key };
  }

  // ---------- fixing
  /** Fix one layer in place. Returns { before, after, ... } with the deviation numbers. */
  function fixLayer(ctx, lv, poses) {
    const { B, ids, n, nb, pts } = ctx, t0 = analyzeLayer(ctx, lv), W0 = t0.W.map(w => w.slice());
    cleanData(B, ids, lv); R.wChanged(); const Wb = field(ctx);
    prepareQ(ctx, poses);
    const cap = Math.max(1.5, lv.dev * ctx.diag), skipped = new Set(), glitched = new Set(), changed = new Set(), r = Math.max(ctx.step * 2.2, 6);
    t0.sc.fl.forEach((f, i) => { if (f.some(k => GLITCH.has(k))) glitched.add(i); });
    const asObj = w => { const obj = {}; ids.forEach((id, b) => { if (w[b] > 1e-4) obj[id] = U.r3(w[b]); }); return obj; };
    /* the reference shares of a point before any fix: normalized, and the plain falloff if it had none */
    const ref = i => { const w = W0[i]; if (!finite(w)) return ctx.base[i]; const s = sum(w); return s > 0.5 ? w.map(x => Math.max(0, x) / s) : ctx.base[i]; };
    for (let pass = 0; pass < 4; pass++) {
      const Wc = pass === 0 ? Wb : field(ctx), sc = scan(ctx, Wc, lv), p1 = plan(ctx, sc, lv, 1), p2 = plan(ctx, sc, lv, 0.5), p3 = plan(ctx, sc, lv, 0), p4 = plan(ctx, sc, Object.assign({}, lv, { maxInf: lv.maxInf + 1 }), 0), p5 = plan(ctx, sc, Object.assign({}, lv, { maxInf: lv.maxInf + 2 }), 0);
      const jobs = [];
      for (let i = 0; i < n; i++) {
        const f = sc.fl[i]; if (!f.length || skipped.has(i) || !p1[i]) continue;
        const soft = f.every(k => SOFT.has(k)); let tgt = p1[i];
        if (soft) {
          tgt = null; for (const cand of [p1[i], p2[i], p3[i], p4[i], p5[i]]) if (cand && devOf(ctx, i, ref(i), cand) <= cap) { tgt = cand; break; }
          if (!tgt) { skipped.add(i); continue; }
        }
        const base = sc.V[i] || ctx.base[i]; if (Math.max(...tgt.map((x, b) => Math.abs(x - base[b]))) < 0.004 && !f.includes('sum') && !f.includes('empty')) continue; /* already as wanted */
        jobs.push({ i, tgt });
      }
      if (!jobs.length) break;
      const fat = R.nextAt(), fresh = jobs.map(j => [U.r1(pts[j.i][0]), U.r1(pts[j.i][1]), U.r1(r), asObj(j.tgt), fat]);
      B.goals = (B.goals || []).filter(g => !jobs.some(j => Math.hypot(g[0] - pts[j.i][0], g[1] - pts[j.i][1]) < r * 0.5)).concat(fresh); R.wChanged();
      /* neighbouring fixes blend into each other: bring each spot back to its own answer */
      for (let round = 0; round < 3; round++) jobs.forEach((j, gi) => {
        const cur = R.weights(B, ids, ctx.segs, pts[j.i][0], pts[j.i][1], ctx.s2), g = fresh[gi], old = ids.map(id => g[3][id] || 0);
        const t = tidy(old.map((x, b) => x + 0.7 * (j.tgt[b] - (Number.isFinite(cur[b]) ? cur[b] : 0))), lv); if (t) g[3] = asObj(t);
      });
      jobs.forEach(j => changed.add(j.i)); R.wChanged();
    }
    const Wf = field(ctx), after = scan(ctx, Wf, lv), data = dataIssues(B, ids), c = countsOf(after.fl, data);
    /* a calm point can't be left with leftover problems that the poses forbade: those are counted apart */
    let max = 0, sumAll = 0, cnt = 0, gmax = 0, worstSum = 0, wn = 0;
    for (let i = 0; i < n; i++) {
      const a = ref(i), b = Wf[i]; if (!finite(b)) continue; const s = sum(b) || 1, bn = b.map(x => x / s), d = devOf(ctx, i, a, bn), md = meanDev(ctx, i, a, bn);
      if (glitched.has(i)) { gmax = Math.max(gmax, d); continue; }
      max = Math.max(max, d); sumAll += md; cnt++; if (changed.has(i)) { worstSum += d; wn++; }
    }
    return { before: t0.counts, spotsBefore: t0.spots, after: c.counts, spotsAfter: c.spots, changed: changed.size, skipped: [...skipped].filter(i => after.fl[i].length).length, goals: (B.goals || []).length,
      dev: { max, mean: cnt ? sumAll / cnt : 0, meanChanged: wn ? worstSum / wn : 0, glitchMax: gmax, cap, points: n, poses: poses.length }, _after: after, _before: t0 };
  }
  /** Clean up the layers that bend with a rig (changes the goal fixes and broken paint; commit afterwards). */
  function fix(rig, level) {
    const lv = lvOf(level), poses = poseList(rig), layers = [];
    for (const o of tree.all()) {
      if (!R.bendsWith(o, rig)) continue; const ctx = layerCtx(o, rig); if (!ctx) continue;
      const r = fixLayer(ctx, lv, poses); layers.push(Object.assign({ id: o.id, name: o.name, ctx }, r));
    }
    R.wChanged(); SB.bump();
    const dev = { max: 0, mean: 0, meanChanged: 0, glitchMax: 0, poses: poses.length }; let w = 0, wc = 0;
    for (const l of layers) { dev.max = Math.max(dev.max, l.dev.max); dev.glitchMax = Math.max(dev.glitchMax, l.dev.glitchMax); dev.mean += l.dev.mean * l.dev.points; w += l.dev.points; dev.meanChanged += l.dev.meanChanged * l.changed; wc += l.changed; }
    dev.mean = w ? dev.mean / w : 0; dev.meanChanged = wc ? dev.meanChanged / wc : 0;
    const rep = { level: lv.key, layers, dev, spotsBefore: layers.reduce((s, l) => s + l.spotsBefore, 0), spotsAfter: layers.reduce((s, l) => s + l.spotsAfter, 0), skipped: layers.reduce((s, l) => s + l.skipped, 0), changed: layers.reduce((s, l) => s + l.changed, 0) };
    return rep;
  }

  // ---------- keeping and restoring (for Preview / Cancel)
  const takeSnap = rig => tree.all().filter(o => R.bendsWith(o, rig)).map(o => ({ o, goals: o.bind.goals ? U.deep(o.bind.goals) : null, paint: o.bind.paint ? U.deep(o.bind.paint) : null }));
  function putSnap(sn) {
    for (const s of sn) { const B = s.o.bind; if (!B) continue; if (s.goals) B.goals = U.deep(s.goals); else delete B.goals; if (s.paint) B.paint = U.deep(s.paint); else delete B.paint; }
    R.wChanged(); SB.bump();
  }

  // ---------- the dialog
  const WORDS = {
    empty: [n => plural(n, 'spot follows', 'spots follow') + ' no bone at all', 'they stay frozen when the rig moves'],
    sum: [n => plural(n, 'spot has', 'spots have') + ' shares that do not add up to 100%', 'the numbers are off'],
    broken: [n => plural(n, 'broken paint or fix value', 'broken paint or fix values'), 'they are removed'],
    spike: [n => plural(n, 'sudden spike', 'sudden spikes'), 'a spot follows other bones than everything around it'],
    island: [n => plural(n, 'spot sits', 'spots sit') + ' in a stray patch', 'it follows a bone whose real area is somewhere else'],
    far: [n => plural(n, 'spot is', 'spots are') + ' pulled by a bone far away', 'a distant bone should not move them'],
    many: [n => plural(n, 'spot is', 'spots are') + ' moved by too many bones', 'only the strongest few are kept'],
    tiny: [n => plural(n, 'spot has', 'spots have') + ' tiny leftover weights', 'small noisy shares'],
    jag: [n => plural(n, 'spot changes', 'spots change') + ' roughly between bones', 'smoothed with the neighbours'],
  };

  const MARK = { glitch: '#E5484D', soft: '#F5A524', fixed: '#2FB574' };
  let view = null;
  const css = () => {
    if (document.getElementById('wf-style')) return; const st = document.createElement('style'); st.id = 'wf-style';
    st.textContent = `.modal.wf-open { background: transparent; place-items: start end; }
.modal.wf-open .sheet { margin: 64px 8px 0 0; width: min(440px, 100%); max-height: calc(100dvh - 90px); box-shadow: 0 18px 50px rgba(0,0,0,.3); }
.wf-layer { border: 1px solid var(--line); border-radius: 10px; padding: 8px 10px; margin: 8px 0; background: var(--panel-2); }
.wf-layer b { display: block; margin-bottom: 2px; } .wf-layer ul { margin: 2px 0 0; padding-left: 18px; } .wf-layer li { margin: 2px 0; font-size: 13px; }
.wf-layer li small { color: var(--ink-2); } .wf-ok { color: #1c8a55; font-size: 13px; }
.wf-res { border-left: 3px solid #2FB574; background: var(--panel-2); border-radius: 6px; padding: 8px 10px; margin: 10px 0 0; font-size: 13px; line-height: 1.45; }
.wf-hint { color: var(--ink-2); font-size: 12.5px; margin: 6px 0 0; } .wf-legend span { display: inline-flex; align-items: center; gap: 4px; margin-right: 10px; font-size: 12px; color: var(--ink-2); }
.wf-legend i { width: 9px; height: 9px; border-radius: 50%; display: inline-block; }`;
    document.head.appendChild(st);
  };
  const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);

  function open(rig) {
    if (!rig || rig.type !== 'rig') rig = tree.sel(); if (!rig || rig.type !== 'rig') return SB.toast('Select a rig first.');
    if (!tree.all().some(o => R.bendsWith(o, rig))) return SB.toast('No layer bends with this rig yet: select a layer, then Rig › Bend with a rig.');
    css(); ensureOverlay(); const h = U.h, W = SB.w, orig = takeSnap(rig); let level = 'normal', afterSnap = null, report = null, showing = 'before', applied = false, an = analyze(rig, level), closed = false;
    const body = h('div');
    const setMarks = () => { view = { rig, items: [], mode: showing }; const src = showing === 'after' && report ? report.layers : an.layers; for (const l of src) { const a = showing === 'after' ? l._after : l._a && l._a.sc; const ctx = showing === 'after' ? l.ctx : l._a && l._a.ctx; if (!a || !ctx) continue; view.items.push({ ctx, fl: (a.fl || a.sc.fl) }); }
      if (showing === 'after' && report) { view.fixed = report.layers.map(l => ({ ctx: l.ctx, idx: l._before.sc.fl.map((f, i) => f.length && !l._after.fl[i].length ? i : -1).filter(i => i >= 0) })); } SB.dirty(); };
    const restoreOrig = () => { putSnap(orig); };
    const preview = () => { restoreOrig(); report = fix(rig, level); afterSnap = takeSnap(rig); showing = 'after'; setMarks(); SB.dirty(); render(); };
    const setLevel = k => { level = k; restoreOrig(); an = analyze(rig, level); report = null; afterSnap = null; showing = 'before'; setMarks(); if (view) view.mode = 'before'; SB.dirty(); render(); };
    const toggle = () => { if (!afterSnap) return; if (showing === 'after') { restoreOrig(); showing = 'before'; } else { putSnap(afterSnap); showing = 'after'; } setMarks(); render(); };
    const finish = () => { closed = true; view = null; removeEventListener('keydown', onKey, true); document.getElementById('modal').classList.remove('wf-open'); SB.dirty(); };
    const cancel = () => { dlg.close(); };
    const apply = () => {
      if (!report || showing !== 'after') { restoreOrig(); report = fix(rig, level); afterSnap = takeSnap(rig); showing = 'after'; }
      applied = true; const r = report; SB.commit(); dlg.close();
      SB.toast(r.spotsBefore ? `Weights cleaned: ${plural(r.spotsBefore, 'problem', 'problems')} fixed, ${r.spotsAfter} left. Poses moved ${U.r1(r.dev.mean)} px on average (at most ${U.r1(r.dev.max)} px).` : 'The weights already looked clean; nothing needed fixing.');
    };
    const onKey = e => { if (e.key === 'Escape' && !closed) { e.preventDefault(); e.stopPropagation(); cancel(); } };
    function render() {
      const lines = an.layers.map(l => {
        const items = KINDS.filter(k => l.counts[k]).map(k => h('li', null, WORDS[k][0](l.counts[k]) + ' ', h('small', null, '(' + WORDS[k][1] + ')')));
        return h('div.wf-layer', null, h('b', null, l.name), l.skipped ? h('div.wf-hint', null, 'Nothing to check on this layer (no lines to sample).') : items.length ? h('ul', null, ...items) : h('div.wf-ok', null, 'Looks clean.'));
      });
      const res = report ? h('div.wf-res', null, h('b', null, showing === 'after' ? 'Preview on the stage' : 'Showing the original'),
        h('div', null, report.spotsBefore ? `Fixed ${report.spotsBefore - report.spotsAfter} of ${plural(report.spotsBefore, 'problem', 'problems')}; ${report.spotsAfter} left.` : 'Nothing needed fixing.'),
        h('div', null, `Your poses stay put: parts that were fine move ${U.r1(report.dev.mean)} px on average, ${U.r1(report.dev.max)} px at most (${report.dev.poses} test poses). Broken spots moved up to ${Math.round(report.dev.glitchMax)} px, that is the repair.`),
        report.skipped ? h('div', null, `${plural(report.skipped, 'spot was', 'spots were')} left alone because fixing would have moved a pose too much.`) : null) : null;
      const seg = W.seg(level, Object.values(LEVELS).map(l => [l.key, l.label, l.hint]), setLevel);
      const prev = W.btn(report ? 'Preview again' : 'Preview', preview, { cls: 'ghost', title: 'Apply the cleanup on the stage without keeping it' }), cmp = report ? W.btn(showing === 'after' ? 'Show original' : 'Show cleaned', toggle, { cls: 'ghost' }) : null;
      const ap = W.btn('Apply', apply, { cls: 'primary', title: 'Keep the cleanup (Undo brings the old weights back)' }); if (!an.spots && !report) ap.title = 'Nothing to fix';
      body.replaceChildren(h('h2', null, 'Clean up weights'), h('p.sub', null, `${plural(an.spots, 'problem', 'problems')} found on ${rig.name}. Cleaning keeps your poses almost exactly as they are.`),
        h('div.wf-legend', null, h('span', null, h('i', { style: { background: MARK.glitch } }), 'mistake'), h('span', null, h('i', { style: { background: MARK.soft } }), 'rough'), h('span', null, h('i', { style: { background: MARK.fixed } }), 'fixed')),
        ...lines, h('h3', null, 'How much to clean'), seg, h('p.wf-hint', null, LEVELS[level].hint), res,
        h('div.sheet-actions', null, W.btn('Cancel', cancel, { cls: 'ghost' }), cmp, prev, ap));
    }
    const dlg = SB.dialog.sheet(body, { sticky: true, onClose: () => { if (!applied) restoreOrig(); finish(); } });
    document.getElementById('modal').classList.add('wf-open'); addEventListener('keydown', onKey, true);
    setMarks(); render(); SB.dirty();
    return { dlg, preview, apply, cancel, setLevel, toggle, get report() { return report; }, get analysis() { return an; } };
  }

  // ---------- problem spots on the stage while the dialog is open
  /* registered on first use: js/ui/overlays.js loads after this file */
  let ovlOn = false;
  const ensureOverlay = () => { if (!ovlOn && SB.overlays) { ovlOn = true; SB.overlays.extra.push(drawMarks); } };
  const drawMarks = O => {
    if (!view || !view.items) return; const c = O.c, d = O.dpr;
    try {
      c.save();
      for (const it of view.items) {
        const ctx = it.ctx, B = ctx.o.bind; if (!B) continue; const Ds = movedFor(B, ctx.ids, poseCtx(view.rig, R.poseAt(view.rig, S.time), S.time));
        const at = i => { const w = R.weights(B, ctx.ids, ctx.segs, ctx.pts[i][0], ctx.pts[i][1], ctx.s2), s = sum(w) || 1; let x = 0, y = 0; w.forEach((wi, b) => { if (!wi) return; const q = moveBy(Ds[b], ctx.pts[i][0], ctx.pts[i][1]); x += q[0] * wi / s; y += q[1] * wi / s; }); return O.P(x, y); };
        it.fl.forEach((f, i) => {
          if (!f.length) return; const glitch = f.some(k => GLITCH.has(k)), [x, y] = at(i);
          c.strokeStyle = glitch ? MARK.glitch : MARK.soft; c.fillStyle = (glitch ? MARK.glitch : MARK.soft) + '55'; c.lineWidth = 2 * d; c.beginPath(); c.arc(x, y, (glitch ? 7 : 5) * d, 0, Math.PI * 2); c.fill(); c.stroke();
        });
      }
      if (view.fixed) for (const fx of view.fixed) { const ctx = fx.ctx, B = ctx.o.bind; if (!B) continue; const Ds = movedFor(B, ctx.ids, poseCtx(view.rig, R.poseAt(view.rig, S.time), S.time));
        for (const i of fx.idx) { const w = R.weights(B, ctx.ids, ctx.segs, ctx.pts[i][0], ctx.pts[i][1], ctx.s2), s = sum(w) || 1; let x = 0, y = 0; w.forEach((wi, b) => { if (!wi) return; const q = moveBy(Ds[b], ctx.pts[i][0], ctx.pts[i][1]); x += q[0] * wi / s; y += q[1] * wi / s; }); const [px, py] = O.P(x, y);
          c.fillStyle = MARK.fixed; c.beginPath(); c.arc(px, py, 4 * d, 0, Math.PI * 2); c.fill(); } }
      c.restore();
    } catch (e) { console.error('weightfix overlay', e); c.restore(); }
  };

  SB.weightFix = { analyze, fix, open, takeSnap, putSnap, LEVELS, KINDS, poseList };
})(window.SB);
