/* Matrices: where an object sits in its parent and on the stage.
   An object's local matrix = translate(x,y) · rotate(rot) · scale(sx,sy) · translate(-ax,-ay)
   where (ax, ay) is the origin (pivot) in the object's own coordinates. */
'use strict';
(function (SB) {
  const U = SB.util, S = SB.state, TR = SB.tracks, tree = SB.tree;

  const X = SB.xf = {
    matrix(st) { return new DOMMatrix().translateSelf(st.x, st.y).rotateSelf(st.rot).scaleSelf(st.sx, st.sy).translateSelf(-(st.ax || 0), -(st.ay || 0)); },
    /** Plain transform state (no effects) at local time lt. */
    state(o, lt) { const t = TR.transform(o, lt); return { x: t.x, y: t.y, rot: t.rot, sx: t.scale * (t.scx ?? 1), sy: t.scale * (t.scy ?? 1), ax: t.ax, ay: t.ay }; },
    local: (o, lt = tree.localTime(o)) => X.matrix(X.state(o, lt)),
    /** Stage matrix of o at main time t. A layer attached to a bone moves with it (X.follow). */
    worldAt(o, t) {
      if (!o) return new DOMMatrix();
      let M = X.worldAt(tree.parentOf(o), t).multiply(X.matrix(X.state(o, tree.localTime(o, t))));
      const D = X.follow && o.bind ? X.follow(o, t) : null; if (D) M = D.multiply(M);
      return M;
    },
    /** Set by js/rig/rig.js: (o, t) => matrix that carries an attached layer with its bone, or null. */
    follow: null,
    world: o => X.worldAt(o, S.time),
    parentWorld: o => X.world(tree.parentOf(o)),

    /** Move an object (and its position keys) by matrix D, e.g. into a new parent's space. */
    applyMatrix(o, D) {
      const dr = U.matAngle(D), ds = Math.hypot(D.a, D.b), tx = o.tracks.x || [], ty = o.tracks.y || [];
      if (tx.length || ty.length) {
        const times = [...new Set([...tx, ...ty].map(k => k.t))].sort((a, b) => a - b);
        const ease = t => (tx.find(k => k.t === t) || ty.find(k => k.t === t) || {}).e || 'smooth';
        const vals = times.map(t => { const q = D.transformPoint(U.pt(TR.value(o, 'x', t), TR.value(o, 'y', t))); return { t, x: U.r1(q.x), y: U.r1(q.y), e: ease(t) }; });
        o.tracks.x = vals.map(v => ({ t: v.t, v: v.x, e: v.e })); o.tracks.y = vals.map(v => ({ t: v.t, v: v.y, e: v.e }));
      }
      const bp = D.transformPoint(U.pt(o.x, o.y)); o.x = U.r1(bp.x); o.y = U.r1(bp.y); o.rot = U.r1(o.rot + dr); o.scale = U.r3(o.scale * ds);
      (o.tracks.rot || []).forEach(k => k.v = U.r1(k.v + dr)); (o.tracks.scale || []).forEach(k => k.v = U.r3(k.v * ds));
      SB.bump();
    },
    /** Move o into parent np at index idx, keeping where it appears on stage. */
    reparent(o, np, idx) {
      const D = X.world(np).inverse().multiply(X.parentWorld(o)), s0 = tree.span(o)[0], m0 = tree.mainOf(o, s0);
      const ol = tree.listOf(o), oi = ol.indexOf(o); ol.splice(oi, 1);
      const nl = np ? np.children : S.objects; if (nl === ol && oi < idx) idx--;
      nl.splice(U.clamp(idx, 0, nl.length), 0, o); X.applyMatrix(o, D); tree.reindex();
      const d = U.r3(tree.parentTime(o, m0)) - s0; if (Math.abs(d) > 1e-6) { (o.parts || []).forEach(p => p.a = U.r3(p.a + d)); (function shift(x) { x.start = U.r3(x.start + d); if (x.children && !x.seq) x.children.forEach(shift); })(o); } // keep its moment when it changes clock (in or out of a shot)
    },
    /** Change the pivot without moving the object on stage. */
    setOrigin(o, nax, nay) {
      nax = U.r1(nax); nay = U.r1(nay); const lt = tree.localTime(o);
      if (TR.animated(o, 'ax') || TR.animated(o, 'ay')) { const p = X.matrix(X.state(o, lt)).transformPoint(U.pt(nax, nay)); TR.keyMany(o, { ax: nax, ay: nay, x: U.r1(p.x), y: U.r1(p.y) }); return; }
      const keyAt = (id, t, v) => { const tr = o.tracks[id] || (o.tracks[id] = []); let k = tr.find(q => Math.abs(q.t - t) < 1e-4); if (!k) { tr.push({ t, v, e: 'smooth' }); tr.sort((a, b) => a.t - b.t); } else k.v = v; };
      const times = [...new Set([...(o.tracks.x || []), ...(o.tracks.y || [])].map(k => k.t))];
      const upd = times.map(t => [t, X.matrix(X.state(o, t)).transformPoint(U.pt(nax, nay))]);
      const cur = X.state(o, lt), bp = X.matrix(Object.assign({}, cur, { x: o.x, y: o.y })).transformPoint(U.pt(nax, nay));
      upd.forEach(([t, p]) => { keyAt('x', t, U.r1(p.x)); keyAt('y', t, U.r1(p.y)); });
      o.x = U.r1(bp.x); o.y = U.r1(bp.y); o.ax = nax; o.ay = nay; SB.bump();
    },
    /** Convert a stage point into an object's parent space. */
    toParent(o, P) { return X.parentWorld(o).inverse().transformPoint(U.pt(P.x, P.y)); },
  };
})(window.SB);
