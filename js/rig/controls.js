/* Controllers and constraints.

   A controller is a small handle layer (type 'null') that moves inside a box,
   along a line or freely. Two ways to use one:

   1. Drive (o.drv): record how a layer looks with the controller at a few
      spots (center, left, right, top, bottom). Moving the controller blends
      between those states: position, size, rotation, colors, effect amounts.
      L = { id, ctrl, amt, space:'local'|'global', states:[{ slot, u, v, p:{prop:value} }] }

   2. Constraints (o.cons): a layer follows another layer or a controller.
      c = { id, type:'follow'|'track'|'lookat'|'copyPos'|'copyRot'|'copyScale', target, amt, space, rest }
      When the target is a rig, c.bone picks one of its bones and c.at where on it
      (0 = its head, 1 = its tip, along the curve of a segmented bone): the layer follows that bone.
      'follow' moves and turns the layer with its target as if it were inside it (from where both
      were when it was set up); its influence can be keyframed to hand a layer from one bone to another.
      'cn:<id>:amt' (influence) can be keyframed. */
'use strict';
(function (SB) {
  const U = SB.util, S = SB.state, TR = SB.tracks, tree = SB.tree, X = SB.xf, pt = U.pt;
  const mainT = (o, lt) => tree.mainAt(o, lt);
  const ltAt = (o, T) => tree.localTime(o, T);

  // ================= controllers
  // ctype: 'x' | 'y' | 'xy' (box) | 'free' | 'custom' (designed: c.cshape 'box' | 'circle', c.points [{ k, name, u, v }],
  //        c.lock 'x' | 'y' to move only left–right or up–down)
  // size: c.rw, c.rh = half width and half height in px (older files: c.range for both)
  const CTYPES = { x: 'Left–right', y: 'Up–down', xy: 'Box (both)', free: 'Free', custom: 'Custom' };
  SB.types.add({
    id: 'null', label: 'Controller', icon: 'ctrl', color: '--c-ctrl', visual: true, render: false, frames: false, fx: false, noLength: true,
    defaults: p => ({ ctype: 'xy', range: 100, frames: [], start: 0, dur: Math.max(1, p.duration) }),
    bounds: () => ({ x0: -26, y0: -26, x1: 26, y1: 26 }),
    props: () => [['ctrl:on', 'On (moves its layers)']],
  });
  const isCircle = c => c.ctype === 'custom' && c.cshape === 'circle';
  const RX = c => c.rw ?? c.range ?? 100, RY = c => c.rh ?? c.range ?? 100;
  /** How the knob moves: 'x', 'y', 'xy', 'free' or 'custom' (a designed controller locked to one direction counts as 'x' or 'y'). */
  const motion = c => c.ctype === 'custom' && c.lock ? c.lock : c.ctype || 'xy';
  /** Keep the knob inside its box, circle or line. */
  TR.hook(10, (o, lt, r) => {
    if (o.type !== 'null') return; const W = RX(o), H = RY(o), rx = o.rx ?? o.x, ry = o.ry ?? o.y, t = motion(o);
    if (t === 'x') { r.y = ry; r.x = U.clamp(r.x, rx - W, rx + W); } else if (t === 'y') { r.x = rx; r.y = U.clamp(r.y, ry - H, ry + H); }
    else if (isCircle(o)) { const dx = (r.x - rx) / W, dy = (r.y - ry) / H, d = Math.hypot(dx, dy); if (d > 1) { r.x = rx + dx / d * W; r.y = ry + dy / d * H; } } // a circle or an oval
    else if (t === 'xy' || t === 'custom') { r.x = U.clamp(r.x, rx - W, rx + W); r.y = U.clamp(r.y, ry - H, ry + H); }
  });
  /** Controller value at main time T: u, v from -1 to 1. */
  function value(c, T) { const k = TR.transform(c, ltAt(c, T)); return [U.clamp((k.x - (c.rx ?? c.x)) / RX(c), -1, 1), U.clamp((k.y - (c.ry ?? c.y)) / RY(c), -1, 1)]; }
  function make(near) {
    const p = S.project, b = near ? SB.scene.box(near) : null; let x = p.w / 2, y = p.h / 2;
    if (b) { x = (b.aabb.x0 + b.aabb.x1) / 2; y = b.aabb.y0 - 80; if (near && tree.parentOf(near)) { const l = X.parentWorld(near).inverse().transformPoint(pt(x, y)); x = l.x; y = l.y; } }
    const c = tree.make('null', { name: `Controller ${tree.all().filter(o => o.type === 'null').length + 1}`, x: U.r1(x), y: U.r1(y), rx: U.r1(x), ry: U.r1(y) });
    (near ? tree.listOf(near) : tree.rootList()).unshift(c); tree.reindex(); return c;
  }

  // ---------- drive: blend recorded states
  const COLOR = new Set(['fill', 'stroke', 'color', 'bg', 'outlineColor']), MULT = TR.MULTIPLY;
  const isColor = P => COLOR.has(P) || TR.type(P) === 'color';
  const SLOTS = { top: [0, -1, 'Top'], left: [-1, 0, 'Left'], center: [0, 0, 'Center'], right: [1, 0, 'Right'], bottom: [0, 1, 'Bottom'] };
  /** The spots a controller has: [{ k, u, v, name }]. Designed controllers have their own points. */
  function slotsFor(c) {
    if (c && c.ctype === 'custom' && c.points && c.points.length) return c.points;
    const t = c ? c.ctype || 'xy' : 'xy', ks = t === 'x' ? ['left', 'center', 'right'] : t === 'y' ? ['top', 'center', 'bottom'] : ['top', 'left', 'center', 'right', 'bottom'];
    return ks.map(k => ({ k, u: SLOTS[k][0], v: SLOTS[k][1], name: SLOTS[k][2] }));
  }
  const slotOf = (c, k) => slotsFor(c).find(s => s.k === k) || (SLOTS[k] ? { k, u: SLOTS[k][0], v: SLOTS[k][1], name: SLOTS[k][2] } : null);
  const stateOf = (L, k) => L.states.find(s => s.slot === k) || (SLOTS[k] && L.states.find(s => !s.slot && Math.abs(s.u - SLOTS[k][0]) < 0.05 && Math.abs(s.v - SLOTS[k][1]) < 0.05));
  const discrete = P => P === 'frame' || TR.type(P) === 'bool' || TR.type(P) === 'int';
  /** Every value a state can hold: position and look, the type's own values, the shown frame,
      effect amounts and switches, bone angles of a rig, constraint influence. */
  function stateProps(o) {
    const def = SB.types.get(o.type), out = ['x', 'y', 'scale', 'scx', 'scy', 'rot', 'opacity'];
    if (def.allProps) def.allProps(o).forEach(id => { if (!out.includes(id)) out.push(id); });
    else if (def.props) def.props(o).forEach(([id]) => { if (!out.includes(id)) out.push(id); });
    if (def.frames && o.frames && o.frames.length > 1) out.push('frame');
    (o.effects || []).forEach(e => { const d = SB.effects.get(e.type); if (!d) return; out.push(`fx:${e.id}:on`); Object.keys(d.params).filter(q => !d.params[q].options).forEach(q => out.push(`fx:${e.id}:${q}`)); });
    (o.cons || []).forEach(c => out.push(`cn:${c.id}:amt`));
    return out;
  }
  /** Everything a state remembers about a layer (from keyframes, before any controller). */
  /** Is controller c on at main time T ('ctrl:on' can be keyframed: off for a while, then on again)? */
  const ctrlOn = (c, T) => TR.value(c, 'ctrl:on', ltAt(c, T)) !== false;
  function stateVals(o, lt) {
    const busy = o._dvBusy; o._dvBusy = true;
    try {
      const p = {}, k = TR.keyed(o, lt);
      for (const P of stateProps(o)) { const v = TR.TRANSFORM_SET.has(P) ? k[P] : TR.value(o, P, lt); p[P] = typeof v === 'number' ? U.r3(v) : v; }
      return p;
    } finally { o._dvBusy = busy; }
  }
  /** Smooth 2D blending that is exact at every state (radial basis functions). */
  function rbf(L, P) {
    const key = L.states.map(s => `${s.u},${s.v},${s.p[P]}`).join('|'); L._rbf = L._rbf || {}; const c = L._rbf[P]; if (c && c.key === key) return c.f;
    const n = L.states.length, N = n + 3; let f = null;
    if (n >= 3) {
      const A = Array.from({ length: N }, () => new Array(N + 1).fill(0));
      L.states.forEach((a, i) => { L.states.forEach((b, j) => A[i][j] = Math.hypot(a.u - b.u, a.v - b.v)); A[i][n] = 1; A[i][n + 1] = a.u; A[i][n + 2] = a.v; A[n][i] = 1; A[n + 1][i] = a.u; A[n + 2][i] = a.v; A[i][N] = a.p[P]; });
      let ok = true;
      for (let col = 0; col < N && ok; col++) { let piv = col; for (let r = col + 1; r < N; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r; if (Math.abs(A[piv][col]) < 1e-9) { ok = false; break; } [A[col], A[piv]] = [A[piv], A[col]]; for (let r = 0; r < N; r++) if (r !== col) { const k = A[r][col] / A[col][col]; for (let q = col; q <= N; q++) A[r][q] -= k * A[col][q]; } }
      if (ok) { const w = A.map((row, i) => row[N] / row[i]); f = (u, v) => { let s = w[n] + w[n + 1] * u + w[n + 2] * v; L.states.forEach((a, i) => s += w[i] * Math.hypot(u - a.u, v - a.v)); return s; }; }
    }
    L._rbf[P] = { key, f }; return f;
  }
  /** The values a controller link changes: they differ between its states and are not switched off (L.ignore). */
  const varying = L => { if (L.states.length < 2) return []; const s0 = L.states[0].p, ig = L.ignore || []; return Object.keys(s0).filter(P => !ig.includes(P) && L.states.every(s => s.p[P] !== undefined) && L.states.some(s => s.p[P] !== s0[P])); };
  const blend = (a, b, P, u) => isColor(P) ? U.lerpColor(a, b, u) : discrete(P) ? (u < 0.5 ? a : b) : U.lerp(a, b, u);
  /** A link seen with only the states whose points the controller still has (a point removed in the designer stops counting at once). */
  function live(L, c) { if (c.ctype !== 'custom' || !c.points) return L; const sl = slotsFor(c), st = L.states.filter(s => !s.slot || sl.some(q => q.k === s.slot)); return st.length === L.states.length ? L : Object.assign(Object.create(L), { states: st }); }
  /** All values the controllers set on o at main time T (or null). */
  function driven(o, T) {
    if (!o.drv || !o.drv.length) return null;
    if (o._dv && o._dv.s === SB.stamp && o._dv.T === T) return o._dv.v;
    const busy = o._dvBusy; o._dvBusy = true; let out = null, mph = null;
    try {
      for (let L of o.drv) {
        if (S.poseLink && (S.poseLink.multi ? L.ctrl === S.poseLink.cid : S.poseLink.oid === o.id && S.poseLink.id === L.id)) continue;
        const c = tree.find(L.ctrl); if (!c || c === o || L.off || !ctrlOn(c, T)) continue; /* a link or a controller turned off moves nothing */ L = live(L, c); const keys = varying(L); if (!keys.length) continue;
        const [u, v] = value(c, T), t = motion(c), vals = {};
        if (t === 'x' || t === 'y') {
          const w = t === 'x' ? u : v, pos = s => t === 'x' ? s.u : s.v, st = L.states.slice().sort((a, b) => pos(a) - pos(b));
          let a = st[0], b = st[st.length - 1]; for (let i = 0; i < st.length - 1; i++) if (w >= pos(st[i]) && w <= pos(st[i + 1])) { a = st[i]; b = st[i + 1]; break; }
          const f = w <= pos(st[0]) ? 0 : w >= pos(st[st.length - 1]) ? 1 : (w - pos(a)) / Math.max(1e-6, pos(b) - pos(a)); if (w <= pos(st[0])) b = a; if (w >= pos(st[st.length - 1])) a = b;
          // Snap (L.blend 'hold', or a point marked snap): the nearest point's values exactly, no blending in between
          const near = f < 0.5 ? a : b;
          if (L.blend === 'hold' || near.snap) keys.forEach(P => vals[P] = near.p[P]);
          else keys.forEach(P => vals[P] = blend(a.p[P], b.p[P], P, f));
          if (L.morph && keys.includes('frame') && L.blend !== 'hold' && a !== b && a.p.frame !== b.p.frame && f > 0 && f < 1) { vals.frame = a.p.frame; mph = { a: a.p.frame, b: b.p.frame, u: f }; } // morph between the two frames
        } else {
          let ws = 0, exact = null; const Wt = L.states.map(s => { const d = Math.hypot(s.u - u, s.v - v); if (d < 1e-3) exact = s; const w = 1 / (d * d + 1e-6); ws += w; return w; });
          let near = 0; L.states.forEach((s, i) => { if (Wt[i] > Wt[near]) near = i; });
          if (L.morph && keys.includes('frame') && !exact && L.blend !== 'hold' && L.states.length > 1) { let sec = near === 0 ? 1 : 0; L.states.forEach((s2, i) => { if (i !== near && Wt[i] > Wt[sec]) sec = i; }); const A = L.states[near], B = L.states[sec]; if (A.p.frame !== B.p.frame) mph = { a: A.p.frame, b: B.p.frame, u: Wt[sec] / (Wt[near] + Wt[sec]) }; }
          const snap = L.blend === 'hold' || L.states[near].snap;
          keys.forEach(P => {
            if (snap) { vals[P] = L.states[near].p[P]; return; }
            if (exact) { vals[P] = exact.p[P]; return; }
            if (isColor(P) || discrete(P)) { vals[P] = L.states[near].p[P]; return; } // frames and switches take the nearest spot
            const f = rbf(L, P); vals[P] = f ? f(u, v) : L.states.reduce((acc, s, i) => acc + s.p[P] * Wt[i], 0) / ws;
          });
        }
        if ((L.space || 'global') === 'local') { // add the change on top of the layer's own animation
          const C = (L.states.find(s => s.slot === 'center') || L.states[0]).p, raw = stateVals(o, ltAt(o, T));
          keys.forEach(P => { if (raw[P] === undefined || C[P] === undefined || isColor(P) || discrete(P) || typeof raw[P] !== 'number') return; vals[P] = MULT.has(P) && Math.abs(C[P]) > 1e-6 ? raw[P] * vals[P] / C[P] : raw[P] + vals[P] - C[P]; });
        }
        const amt = U.clamp(L.amt ?? 1, 0, 1); if (amt < 1) { const base = stateVals(o, ltAt(o, T)); keys.forEach(P => { if (base[P] !== undefined) vals[P] = blend(base[P], vals[P], P, amt); }); }
        out = Object.assign(out || {}, vals);
      }
    } finally { o._dvBusy = busy; }
    o._dv = { s: SB.stamp, T, v: out, m: mph }; return out;
  }
  /** A controller morphing a drawing between two frames: { a, b, u } at local time lt (js/model/frames.js change), or null. */
  function frameMorph(o, lt) { if (!o.drv || !o.drv.length || !o.drv.some(L => L.morph)) return null; driven(o, mainT(o, lt)); const m = o._dv && o._dv.m; if (!m) return null; const n = o.frames.length, cl = i => U.clamp(Math.round(i), 0, n - 1); return cl(m.a) === cl(m.b) ? null : { a: cl(m.a), b: cl(m.b), u: m.u }; }
  TR.hook(30, (o, lt, r) => { if (!o.drv || !o.drv.length || o._dvBusy) return; const dv = driven(o, mainT(o, lt)); if (dv) for (const P of TR.TRANSFORM) if (dv[P] !== undefined) r[P] = dv[P]; });
  // any other value (frames, effect amounts, bone angles…) is read through SB.tracks.value
  TR.override = (o, id, lt) => { if (!o.drv || !o.drv.length || o._dvBusy || TR.TRANSFORM_SET.has(id)) return undefined; const dv = driven(o, mainT(o, lt)); return dv ? dv[id] : undefined; };
  SB.scene.viewExtra = (o, lt) => { if (!o.drv || !o.drv.length) return null; const dv = driven(o, mainT(o, lt)); if (!dv) return null; let any = false; for (const P in dv) if (!TR.TRANSFORM_SET.has(P)) { any = true; break; } return any ? dv : null; };

  function drive(o, c) { const L = { id: U.uid(), ctrl: c.id, amt: 1, space: 'local', states: [] }; (o.drv = o.drv || []).push(L); const [u0, v0] = value(c, S.time || 0), sl = slotsFor(c), sc = sl.find(s => Math.hypot(s.u, s.v) < 1e-3) || sl.slice().sort((a, b) => Math.hypot(a.u - u0, a.v - v0) - Math.hypot(b.u - u0, b.v - v0))[0] || { k: 'center', u: 0, v: 0 }; L.states.push({ slot: sc.k, u: sc.u, v: sc.v, p: stateVals(o, tree.localTime(o)) }); SB.bump(); return L; }
  function moveCtrlTo(c, k) { const s = slotOf(c, k); if (!s) return; c._live = { x: U.r1((c.rx ?? c.x) + s.u * RX(c)), y: U.r1((c.ry ?? c.y) + s.v * RY(c)) }; SB.bump(); }
  function releaseCtrl(pl) { const o = pl && tree.find(pl.oid), L = o && (o.drv || []).find(x => x.id === pl.id), c = pl && pl.cid ? tree.find(pl.cid) : L && tree.find(L.ctrl); if (c) delete c._live; SB.bump(); }
  function restoreSnap(o, snap, stash) {
    if (o && S.frameOverride && S.frameOverride.id === o.id) S.frameOverride = null;
    if (o && stash) for (const P in stash) { const z = stash[P]; o.tracks[P] = z.tr; if (z.plain) o[P] = z.base; } // the layer's own keyframes come back as they were
    if (o && o._pend) { delete o._pend; TR.pending.delete(o); } // changes that were not keyed (an animated layer moved while editing)
    if (!snap) return; for (const P in snap) if (!TR.animated(o, P)) TR.setBase(o, P, snap[P]); SB.bump();
  }
  /** While a spot is edited, the layer's own keyframes for what the controller changes are set aside: the layer shows that spot's
      values as plain values, so dragging or editing it changes the spot (not the layer's animation, and nothing is dropped as an
      unkeyed preview). saveSlot / cancelSlot / clearSlot put them back exactly. */
  function stashKeys(o) { const out = {}; for (const P of stateProps(o)) if (TR.animated(o, P)) { out[P] = { tr: o.tracks[P], plain: !P.includes(':'), base: o[P] }; } for (const P in out) delete o.tracks[P]; return out; }
  /** Start recording a slot: the controller jumps there and the layer shows that state for editing. */
  /** "On top" links keep each spot as a change from the center spot, so a layer moved since (an eye moved with its pupil) shows
      and saves its spots where it is now. relNum: P is a number such a link adds; toRel / fromRel turn a shown value into the
      stored one and back (scale-like values multiply). */
  const rest = L => L.states.find(s => s.slot === 'center') || L.states[0];
  const onTop = L => (L.space || 'global') === 'local';
  const relNum = (P, a, b) => typeof a === 'number' && typeof b === 'number' && !isColor(P) && !discrete(P);
  const fromRel = (P, now, v, c) => MULT.has(P) ? (Math.abs(c) > 1e-6 ? now * v / c : v) : now + v - c;
  const toRel = (P, now, v, c) => MULT.has(P) ? (Math.abs(now) > 1e-6 ? c * v / now : v) : c + v - now;
  function shiftTrack(o, P, d) { const tr = o.tracks[P]; if (!tr) return; tr.forEach(k => { k.v = MULT.has(P) ? k.v * d : k.v + d; if (P === 'x' && k.cx != null) k.cx += d; if (P === 'y' && k.cy != null) k.cy += d; }); if (P === 'y') (o.tracks.x || []).forEach(k => { if (k.cy != null) k.cy += d; }); }
  /** Show spot k of link L on layer o for editing; returns what puts the layer back ({ snap, stash }). */
  function showPose(o, L, k) {
    const snap = stateVals(o, tree.localTime(o)), st = stateOf(L, k), stash = stashKeys(o), R = onTop(L) && rest(L);
    for (const P in stash) TR.setBase(o, P, snap[P]); // set-aside keyframes: the value they had here, until the spot's own value below
    if (st) for (const P in st.p) if (!TR.animated(o, P)) { const v = st.p[P], cv = R && R.p[P]; TR.setBase(o, P, R && st !== R && relNum(P, v, cv) && relNum(P, snap[P], 0) ? U.r3(fromRel(P, snap[P], v, cv)) : R && st === R && relNum(P, v, cv) ? snap[P] : v); }
    return { snap, stash };
  }
  /** Start recording a slot: the controller jumps there and the layer shows that state for editing. */
  function enterSlot(o, L, k) {
    if (S.poseLink) cancelSlot();
    const c = tree.find(L.ctrl), z = showPose(o, L, k); if (c) moveCtrlTo(c, k);
    S.poseLink = { oid: o.id, id: L.id, slot: k, snap: z.snap, stash: z.stash }; SB.bump(); SB.invalidate('inspector', 'ctxbar', 'frames');
  }
  /** Keep what layer o shows now as spot k of link L, then put the layer back (snap, stash: from showPose). Returns a note or ''. */
  function savePose(o, L, k, snap, stash) {
    const c = tree.find(L.ctrl), sl = slotOf(c, k) || { u: 0, v: 0, name: k }, p = stateVals(o, tree.localTime(o)), old = stateOf(L, k);
    const R = onTop(L) && rest(L), atRest = R && old === R, moveLayer = {}; // On top: a spot is kept as a change from the center spot
    if (R) for (const P in p) { const now = snap[P], cv = R.p[P]; if (!relNum(P, p[P], cv) || !relNum(P, now, 0)) continue;
      if (atRest) { const d = MULT.has(P) ? (Math.abs(now) > 1e-6 ? p[P] / now : 1) : p[P] - now; if (Math.abs(d - (MULT.has(P) ? 1 : 0)) > 1e-4) moveLayer[P] = d; p[P] = cv; } // the center spot is the layer at rest: a change there moves the layer itself
      else p[P] = U.r3(toRel(P, now, p[P], cv)); }
    L.states = L.states.filter(s => s !== old); L.states.push({ slot: k, u: sl.u, v: sl.v, p }); L._rbf = null; let msg = '';
    if (o.frames && o.frames.length > 1 && o.play !== 'library' && L.states.some(s => s.p.frame !== p.frame)) { o.play = 'library'; msg = 'The frame now follows the controller (the drawing switched to Frame library).'; }
    restoreSnap(o, snap, stash); for (const P in moveLayer) { const d = moveLayer[P]; if (TR.animated(o, P)) shiftTrack(o, P, d); else TR.setBase(o, P, U.r3(MULT.has(P) ? snap[P] * d : snap[P] + d)); }
    return msg;
  }
  function saveSlot() {
    const pl = S.poseLink; if (!pl) return; if (pl.multi) return saveMulti(); const o = tree.find(pl.oid), L = o && (o.drv || []).find(x => x.id === pl.id); if (!L) { S.poseLink = null; return; }
    const c = tree.find(L.ctrl), sl = slotOf(c, pl.slot) || { name: pl.slot }, msg = savePose(o, L, pl.slot, pl.snap, pl.stash);
    SB.toast(msg || `${sl.name} saved. Drag the controller to see the blend.`); releaseCtrl(pl); S.poseLink = null; SB.commit();
  }
  function cancelSlot() { const pl = S.poseLink; if (!pl) return; if (pl.multi) return endMulti(false); const o = tree.find(pl.oid); if (o) restoreSnap(o, pl.snap, pl.stash); releaseCtrl(pl); S.poseLink = null; SB.bump(); SB.invalidate('inspector', 'ctxbar', 'frames'); }
  function clearSlot() { const pl = S.poseLink; if (!pl) return; if (pl.multi) return endMulti(true); const o = tree.find(pl.oid), L = o && (o.drv || []).find(x => x.id === pl.id); if (L) L.states = L.states.filter(s => s !== stateOf(L, pl.slot)); restoreSnap(o, pl.snap, pl.stash); releaseCtrl(pl); S.poseLink = null; SB.commit(); }

  // ---------- one controller, many layers: edit a point of controller c for every layer it moves, and any other layer you change
  const differs = (a, b) => typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) > 1e-3 : JSON.stringify(a) !== JSON.stringify(b);
  const restSlot = c => { const sl = slotsFor(c); return sl.find(s => Math.hypot(s.u, s.v) < 1e-3) || sl[0] || { k: 'center', u: 0, v: 0 }; };
  /** The layers controller c moves, each with its link: [{ o, L }]. */
  const linksOf = c => tree.all().flatMap(o => (o.drv || []).filter(L => L.ctrl === c.id).map(L => ({ o, L })));
  /** Start editing point k of c on all its layers: each shows its pose there; select, move, scale or turn any layers (several at once).
      Layers c does not move yet are watched: those you change get c when you save. */
  function enterMulti(c, k) {
    if (S.poseLink) cancelSlot();
    const links = linksOf(c).map(({ o, L }) => { const z = showPose(o, L, k); return { oid: o.id, id: L.id, snap: z.snap, stash: z.stash }; }), linked = new Set(links.map(z => z.oid)), others = {};
    for (const o of tree.all()) if (o !== c && o.type !== 'null' && SB.types.get(o.type).visual && !linked.has(o.id)) others[o.id] = { was: stateVals(o, tree.localTime(o)), tr: Object.keys(o.tracks || {}).length ? U.deep(o.tracks) : null };
    moveCtrlTo(c, k); S.poseLink = { multi: true, cid: c.id, slot: k, links, others }; SB.bump(); SB.invalidate('inspector', 'ctxbar', 'frames', 'ctledit');
  }
  /** Layers not linked yet that changed while editing: [{ o, was, tr }]. */
  const changedOthers = pl => Object.keys(pl.others).map(id => ({ o: tree.find(id), was: pl.others[id].was, tr: pl.others[id].tr })).filter(({ o, was }) => o && (() => { const now = stateVals(o, tree.localTime(o)); return Object.keys(now).some(P => was[P] !== undefined && differs(now[P], was[P])); })());
  /** Save the point for every layer (and give c to the changed ones). next: a point to go on with (no message, the controller stays). */
  function saveMulti(next) {
    const pl = S.poseLink, c = tree.find(pl.cid); if (!c) { S.poseLink = null; return; } let n = 0; const fresh = [], notes = new Set();
    for (const z of pl.links) { const o = tree.find(z.oid), L = o && (o.drv || []).find(x => x.id === z.id); if (!L) continue; const m = savePose(o, L, pl.slot, z.snap, z.stash); if (m) notes.add(m); n++; }
    for (const { o, was, tr } of changedOthers(pl)) { // a new link: its rest is the layer as it was, this point as it is now
      const rs = restSlot(c), L = { id: U.uid(), ctrl: c.id, amt: 1, space: 'local', states: [{ slot: rs.k, u: rs.u, v: rs.v, p: was }] }; (o.drv = o.drv || []).push(L);
      if (pl.slot === rs.k) L.states[0].p = stateVals(o, tree.localTime(o)); /* its rest point: the layer stays as you left it */
      else { const m = savePose(o, L, pl.slot, was, null); if (m) notes.add(m); if (tr) o.tracks = tr; }
      fresh.push(o.name); n++;
    }
    const sl = slotOf(c, pl.slot) || { name: pl.slot }; S.poseLink = null;
    if (next) { SB.commit(); enterMulti(c, next); if (fresh.length) SB.toast(`${c.name} now also moves ${fresh.join(', ')}.`); return; }
    releaseCtrl({ cid: c.id }); SB.commit(); SB.invalidate('ctledit');
    SB.toast(`${sl.name} saved for ${n} layer${n === 1 ? '' : 's'}${fresh.length ? `; ${c.name} now also moves ${fresh.join(', ')}` : ''}.${notes.size ? ' ' + [...notes].join(' ') : ''}`);
  }
  /** Stop editing without saving (clear: also take the point out of every layer). */
  function endMulti(clear) {
    const pl = S.poseLink;
    for (const z of pl.links) { const o = tree.find(z.oid), L = o && (o.drv || []).find(x => x.id === z.id); if (!o) continue; if (clear && L) { L.states = L.states.filter(s => s !== stateOf(L, pl.slot)); L._rbf = null; } restoreSnap(o, z.snap, z.stash); }
    for (const { o, was, tr } of changedOthers(pl)) { if (tr) o.tracks = tr; restoreSnap(o, was, null); }
    releaseCtrl({ cid: pl.cid }); S.poseLink = null; if (clear || pl.removed) SB.commit(); else { SB.bump(); SB.invalidate('inspector', 'ctxbar', 'frames', 'ctledit'); }
  }
  /** Stop c moving layer o (while editing too: o goes back to how it was and is watched like any other layer). */
  function unlink(c, o) {
    const pl = S.poseLink && S.poseLink.multi && S.poseLink.cid === c.id ? S.poseLink : null;
    if (pl) { const z = pl.links.find(x => x.oid === o.id); if (z) { restoreSnap(o, z.snap, z.stash); pl.links = pl.links.filter(x => x !== z); } }
    o.drv = (o.drv || []).filter(L => L.ctrl !== c.id); if (!o.drv.length) delete o.drv;
    if (pl) { pl.others[o.id] = { was: stateVals(o, tree.localTime(o)), tr: Object.keys(o.tracks || {}).length ? U.deep(o.tracks) : null }; pl.removed = true; SB.bump(); SB.invalidate('inspector', 'ctledit'); }
    else SB.commit();
  }
  /** Quick setup: a box controller that moves the layers (eyes looking around). */
  function eyesFollow(items, R = 18) {
    const c = make(items[0]); c.ctype = 'xy';
    items.forEach(o => { const L = drive(o, c), base = L.states[0].p; ['left', 'right', 'top', 'bottom'].forEach(k => { const [u, v] = SLOTS[k], p = Object.assign({}, base), PW = X.parentWorld(o).inverse(), a = PW.transformPoint(pt(0, 0)), q = PW.transformPoint(pt(u * R, v * R)); p.x = U.r1(base.x + q.x - a.x); p.y = U.r1(base.y + q.y - a.y); L.states.push({ slot: k, u, v, p }); }); });
    tree.select([c.id]); SB.commit(); SB.toast('Drag the controller. The layers follow it inside the box.'); return c;
  }
  function driveWithNew(items, type) { const c = make(items[0]); c.ctype = type; items.forEach(o => drive(o, c)); tree.select([items[0].id]); SB.commit(); SB.toast(`${c.name} added. In the Controller section, click a spot, change the layer, then Save.`); return c; }

  // ================= constraints
  const CONS = { follow: 'Follow (move and turn with it)', track: 'Move toward', lookat: 'Look at (turn toward)', copyPos: 'Copy position', copyRot: 'Copy rotation', copyScale: 'Copy scale' };
  TR.prefix('cn', { get(o, [id, k]) { const c = (o.cons || []).find(x => x.id === id); return c ? (c[k] ?? 1) : 0; }, set(o, [id, k], v) { const c = (o.cons || []).find(x => x.id === id); if (c) c[k] = v; } });
  /** Where a constraint's target is at main time T, on the stage: its point P, its matrix W (for its turn) and its scale.
      A bone target uses the bone: a point along it, the bone's direction there and its length scale. */
  function targetAt(c, tg, T) {
    const R = SB.rig, b = c.bone && tg.type === 'rig' && R && R.boneById(tg, c.bone);
    if (b) {
      const q = R.poseAt(tg, T)[b.id], RW = X.worldAt(tg, T), u = U.clamp(c.at ?? 1, 0, 1), pts = q.chain || [[q.hx, q.hy], [q.tx, q.ty]];
      const f = u * (pts.length - 1), i = Math.min(pts.length - 2, Math.floor(f)), w = f - i, A = pts[i], B = pts[i + 1], x = A[0] + (B[0] - A[0]) * w, y = A[1] + (B[1] - A[1]) * w;
      const ang = Math.atan2(B[1] - A[1], B[0] - A[0]) * 180 / Math.PI, Wm = RW.multiply(new DOMMatrix().translateSelf(x, y).rotateSelf(ang));
      return { P: RW.transformPoint(pt(x, y)), W: Wm, scale: Math.hypot(q.m[0], q.m[1]) };
    }
    const TW = X.worldAt(tg, T), ta = TR.transform(tg, ltAt(tg, T)); return { P: TW.transformPoint(pt(ta.ax, ta.ay)), W: TW, scale: ta.scale };
  }
  /** Remember where the target is now, so "local" constraints only add the change from here. */
  function captureRest(o, c) {
    const tg = tree.find(c.target); if (!tg) { delete c.rest; return; }
    const T = S.time, PW = X.parentWorld(o), PI = PW.inverse(), tgt = targetAt(c, tg, T), tl = PI.transformPoint(tgt.P), k = TR.keyed(o, tree.localTime(o));
    c.rest = { tx: U.r1(tl.x), ty: U.r1(tl.y), trot: U.r1(U.matAngle(tgt.W) - U.matAngle(PW)), tscale: U.r3(tgt.scale), ang: U.r1(Math.atan2(tl.y - k.y, tl.x - k.x) * 180 / Math.PI) };
    const M = PI.multiply(tgt.W); c.rest.m = [M.a, M.b, M.c, M.d, M.e, M.f].map(v => Math.round(v * 1e5) / 1e5);
  }
  const wrap = d => ((d + 180) % 360 + 360) % 360 - 180;
  /** When a constraint is active, up to local time lt: { on, segs: [[a, b]] } with a = null for "since it was set up".
      'cn:<id>:on' can be keyframed: off holds the layer where the constraint last put it, and back on it carries on
      from there (a relative constraint counts the target's change from the moment it is switched on again). */
  function activeSpans(o, c, lt) {
    const tr = o.tracks && o.tracks['cn:' + c.id + ':on'];
    if (!tr || !tr.length) return c.on === false ? { on: false, segs: [] } : { on: true, segs: [[null, lt]] };
    let on = !!tr[0].v, start = on ? null : undefined; const segs = [];
    for (const k of tr) { if (k.t > lt + 1e-9) break; const v = !!k.v; if (v === on) continue; if (v) start = k.t; else segs.push([start, k.t]); on = v; }
    if (on) segs.push([start, lt]); return { on, segs };
  }
  TR.hook(20, (o, lt, r) => {
    if (!o.cons || !o.cons.length) return;
    const T = mainT(o, lt), PW = X.worldAt(tree.parentOf(o), T), PI = PW.inverse(), prot = U.matAngle(PW);
    for (const c of o.cons) {
      const tg = tree.find(c.target); if (!tg || tg === o || tree.isDesc(tg, o)) continue;
      const amt = U.clamp(TR.value(o, 'cn:' + c.id + ':amt', lt), 0, 1); if (amt <= 0) continue;
      const act = activeSpans(o, c, lt); if (!act.segs.length) continue; // never active yet
      const rs = c.rest, info = t => { const g = targetAt(c, tg, t === lt ? T : mainT(o, t)); return { M: PI.multiply(g.W), tl: PI.transformPoint(g.P), trot: U.matAngle(g.W) - prot, sc: g.scale }; };
      const rel = c.type === 'follow' || (c.space === 'local' && rs), segs = rel ? act.segs : act.segs.slice(-1);
      // the target as the constraint sees it: live while active, held where it was when switched off
      let tl, trot, tsc, D = null;
      if (!rel) { const g = info(segs[0][1]); tl = g.tl; trot = g.trot; tsc = g.sc; }
      else {
        if (c.type === 'follow' && (!rs || !rs.m)) continue;
        tl = { x: rs.tx, y: rs.ty }; trot = rs.trot; tsc = rs.tscale || 1; if (c.type === 'follow') D = new DOMMatrix();
        for (const [a, b] of segs) {
          const B = info(b), A = a == null ? { M: rs.m ? new DOMMatrix(rs.m) : null, tl: { x: rs.tx, y: rs.ty }, trot: rs.trot, sc: rs.tscale || 1 } : info(a);
          tl = { x: tl.x + B.tl.x - A.tl.x, y: tl.y + B.tl.y - A.tl.y }; trot += wrap(B.trot - A.trot); tsc *= B.sc / (A.sc || 1);
          if (D) D = B.M.multiply(A.M.inverse()).multiply(D);
        }
      }
      if (c.type === 'follow') { const q = D.transformPoint(pt(r.x, r.y)); r.x = U.lerp(r.x, q.x, amt); r.y = U.lerp(r.y, q.y, amt); r.rot += wrap(U.matAngle(D)) * amt; continue; }
      if (rel) {
        if (c.type === 'track') { const dx = tl.x - rs.tx, dy = tl.y - rs.ty, d = Math.hypot(dx, dy) || 1e-6, R = c.radius ?? 20, k = d <= R ? 1 : R / d; r.x += dx * k * amt; r.y += dy * k * amt; }
        else if (c.type === 'lookat') r.rot += wrap(Math.atan2(tl.y - r.y, tl.x - r.x) * 180 / Math.PI - rs.ang) * amt;
        else if (c.type === 'copyPos') { r.x += (tl.x - rs.tx) * amt; r.y += (tl.y - rs.ty) * amt; }
        else if (c.type === 'copyRot') r.rot += wrap(trot - rs.trot) * amt;
        else if (c.type === 'copyScale') r.scale *= U.lerp(1, tsc / (rs.tscale || 1), amt);
        continue;
      }
      const turn = a => { r.rot += wrap(a - r.rot) * amt; };
      if (c.type === 'track') { const dx = tl.x - r.x, dy = tl.y - r.y, d = Math.hypot(dx, dy) || 1e-6, R = c.radius ?? 20, k = d <= R ? 1 : R / d; r.x += dx * k * amt; r.y += dy * k * amt; }
      else if (c.type === 'lookat') turn(Math.atan2(tl.y - r.y, tl.x - r.x) * 180 / Math.PI + (c.offset || 0));
      else if (c.type === 'copyPos') { r.x = U.lerp(r.x, tl.x + (c.ox || 0), amt); r.y = U.lerp(r.y, tl.y + (c.oy || 0), amt); }
      else if (c.type === 'copyRot') turn(trot + (c.offset || 0));
      else if (c.type === 'copyScale') r.scale = U.lerp(r.scale, tsc * (c.k || 1), amt);
    }
  });
  /** Switch a constraint on or off at the playhead (a hold keyframe; the first switch also keys the state before it at the clip start). */
  function setActive(o, c, on) {
    const id = 'cn:' + c.id + ':on', lt = tree.localTime(o);
    if (!TR.animated(o, id) && lt > TR.tol()) TR.put(o, id, 0, c.on !== false, 'hold');
    TR.put(o, id, lt, !!on, 'hold'); SB.bump();
  }
  function addConstraint(o, type, target, bone) { const c = { id: U.uid(), type, target: target ? target.id : '', amt: 1, space: 'local' }; if (bone && target && target.type === 'rig') { c.bone = bone.id || bone; c.at = type === 'follow' ? 0 : 1; } if (type === 'track') c.radius = 20; (o.cons = o.cons || []).push(c); if (c.target) captureRest(o, c); SB.bump(); return c; }
  /** Constrain every item to target (or to a new controller placed nearby). */
  function constrainAll(items, type, target, bone) {
    if (!target) { target = make(items[0]); target.ctype = 'free'; }
    const bn = bone && SB.rig.boneById(target, bone.id || bone);
    items.forEach(o => addConstraint(o, type, target, bn)); SB.commit(); SB.toast(`${CONS[type].replace(/ \(.*/, '')} added. ${items.length > 1 ? 'They follow' : 'It follows'} ${bn ? bn.name + ' of ' : ''}${target.name}.`); return target;
  }
  /** Transform values an exact (global) constraint fully sets: editing them directly would do nothing. */
  function lockedProps(o) {
    const out = new Map(), lt = tree.localTime(o);
    for (const c of o.cons || []) { if (c.space === 'local' || !tree.find(c.target) || TR.value(o, 'cn:' + c.id + ':amt', lt) < 0.999) continue; const n = CONS[c.type];
      if (c.type === 'copyPos') { out.set('x', n); out.set('y', n); } if (c.type === 'copyRot' || c.type === 'lookat') out.set('rot', n); if (c.type === 'copyScale') out.set('scale', n); }
    return out;
  }
  /** Who uses controller (or layer) c. */
  const usersOf = c => tree.all().filter(x => (x.drv || []).some(l => l.ctrl === c.id) || (x.cons || []).some(k => k.target === c.id));

  /** Interactive: in Preview, the web page and Rive the viewer drags its knob (js/ui/interact.js). */
  function setGrab(c, on) {
    if (on) c.ixGrab = true; else delete c.ixGrab; SB.commit(); SB.invalidate('inspector', 'ixpanel');
    SB.toast(on ? `${c.name} is interactive: in Preview (Interactions › Preview) and the exported web page or Rive file, drag its knob.${SB.targets && SB.targets.get() !== 'web' ? ' Interactions need the Interactive web mode.' : ''}` : `${c.name} is no longer interactive.`);
  }
  SB.controls = { setGrab, ctrlOn, frameMorph, targetAt, activeSpans, setActive, CTYPES, SLOTS, CONS, RX, RY, motion, varying, slotsFor, slotOf, isCircle, stateOf, stateProps, value, make, stateVals, driven, drive, enterSlot, saveSlot, cancelSlot, enterMulti, saveMulti, unlink, linksOf, changedOthers, clearSlot, eyesFollow, driveWithNew, captureRest, addConstraint, constrainAll, usersOf, lockedProps };
})(window.SB);
