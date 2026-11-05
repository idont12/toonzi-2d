/* The Gradient tool (Shift+F), like Illustrator's: on the selected layer's fill (or outline, or a drawn part),
   drag across it to lay a gradient from where you press to where you let go. On the stage the gradient shows as a line:
     its two ends    move, turn and stretch it (radial: its middle and its edge)
     the line        drag it to move the whole gradient
     the color dots  slide the colors along it; double-click the line for a new color, Delete removes the picked one
   The colors themselves are edited in the color panel (the Gradient tab). Paint strings: js/render/paint.js. */
'use strict';
(function (SB) {
  const U = SB.util, S = SB.state, tree = SB.tree, TR = SB.tracks, G = SB.paths, X = SB.xf, W = SB.w, h = U.h, P = () => SB.paint;
  const pt = U.pt;

  // ---------- what a layer can carry a gradient on: { key, label, get(), set(v), box (local), M (local → stage) }
  function targets(o) {
    if (!o) return [];
    if (o.type === 'shape') {
      const def = SB.types.get('shape'), lt = tree.localTime(o), v = SB.scene.viewOf(o, lt), box = G.bounds([def.asPath(v)]), M = X.world(o), out = [];
      if (o.fillOn !== false && o.shape !== 'line') out.push({ key: 'fill', label: 'Fill', get: () => TR.now(o, 'fill'), set: x => { TR.set(o, 'fill', x); o.fillOn = true; }, box, M });
      if ((o.strokeW || 0) > 0 || o.shape === 'line') out.push({ key: 'stroke', label: 'Outline', get: () => TR.now(o, 'stroke'), set: x => TR.set(o, 'stroke', x), box, M });
      return out;
    }
    if (o.type === 'draw') {
      const sp = SB.tool.space(o); return sp.fr.strokes.map((s, i) => s.er ? null : { key: 's' + i, s, label: s.f ? 'Fill' : s.b && s.fc ? 'Path fill' : 'Line', get: () => s.b && s.fc ? s.fc : s.c, set: x => { if (s.b && s.fc) s.fc = x; else s.c = x; }, box: G.bounds([s]), M: sp.M }).filter(Boolean);
    }
    return [];
  }
  /** The target being edited: the one picked last on this layer, else the first with a gradient, else the first. */
  function active(o) {
    const list = targets(o); if (!list.length) return null; const k = S.gradTarget && S.gradTarget.oid === o.id ? S.gradTarget.key : null;
    return list.find(t => t.key === k) || list.find(t => P().kind(t.get()) === 'grad') || list[0];
  }
  const toWorld = (t, x, y) => t.M.transformPoint(pt(x, y));
  /** The handles of t's gradient in stage space: { a: start (or middle), b: end (or edge), stops: [[x, y, color, i]] }. */
  function handles(t) {
    const v = t.get(); if (P().kind(v) !== 'grad') return null; const p = P().parse(v), q = P().geom(p, t.box);
    const a = p.type === 'radial' ? pt(q.x, q.y) : pt(q.x - q.dx * q.L, q.y - q.dy * q.L), b = pt(q.x + q.dx * q.L, q.y + q.dy * q.L);
    const A = toWorld(t, a.x, a.y), B = toWorld(t, b.x, b.y);
    return { p, A, B, stops: p.stops.map((s, i) => [A.x + (B.x - A.x) * s.p, A.y + (B.y - A.y) * s.p, s.c, i]) };
  }
  /** Gradient p placed with its start (or middle) at a and end (or edge) at b, both local points. */
  function placed(p, t, a, b) {
    const bx = t.box, w = Math.max(1, bx.x1 - bx.x0), hh = Math.max(1, bx.y1 - bx.y0), dx = b.x - a.x, dy = b.y - a.y, d = Math.max(0.5, Math.hypot(dx, dy)), ang = Math.atan2(dy, dx) * 180 / Math.PI;
    const g = { type: p.type, angle: ang, stops: p.stops };
    if (p.type === 'radial') { g.cx = (a.x - bx.x0) / w; g.cy = (a.y - bx.y0) / hh; g.len = d / (Math.hypot(w, hh) / 2); }
    else { const c = pt((a.x + b.x) / 2, (a.y + b.y) / 2), L0 = (Math.abs(w * dx / d) + Math.abs(hh * dy / d)) / 2; g.cx = (c.x - bx.x0) / w; g.cy = (c.y - bx.y0) / hh; g.len = (d / 2) / Math.max(0.5, L0); }
    return P().grad(g.type, g.angle, g.stops, g);
  }
  const fromColor = v => { const c = P().kind(v) === 'solid' && v ? P().split(v).hex : P().split(P().solid(v) || '#7B5CFF').hex; return { type: 'linear', angle: 0, stops: [{ c, p: 0 }, { c: '#FFFFFF', p: 1 }] }; };
  const near = (q, x, y, r) => Math.hypot(q.x - x, q.y - y) <= r;
  const segDist = (P0, A, B) => { const vx = B.x - A.x, vy = B.y - A.y, l = vx * vx + vy * vy || 1, u = U.clamp(((P0.x - A.x) * vx + (P0.y - A.y) * vy) / l, 0, 1); return [Math.hypot(A.x + vx * u - P0.x, A.y + vy * u - P0.y), u]; };

  SB.tools.add({
    id: 'gradient', label: 'Gradient', icon: 'gradient', key: 'Shift+F', tip: 'Drag across a layer to lay a gradient; drag its ends, line and color dots to change it', cursor: 'crosshair',
    down(P0, e) {
      let o = tree.sel(); const k = SB.view.k(), R = 10 / k;
      if (!o || !targets(o).length) { const hit = SB.scene.hit(P0); if (hit && targets(hit).length) { tree.select([hit.id]); o = hit; } else return SB.toast('Select a shape or a drawing to give it a gradient.'); }
      let t = active(o); const H = t && handles(t), Minv = () => t.M.inverse(), loc = Q => Minv().transformPoint(pt(Q.x, Q.y));
      const begin = (kind, extra = {}) => { SB.tool.drag = Object.assign({ kind: 'grad', part: kind, o, t, p0: P0, moved: false, v0: t.get() }, extra); };
      if (H) { // a handle of the gradient shown
        const st = H.stops.find(s => near(P0, s[0], s[1] - 14 / k, R)); if (st) { S.gradStop = st[3]; begin('stop', { i: st[3], H }); SB.invalidate('ctxbar'); SB.dirty(); return; } // the color dots sit just above the line
        if (near(P0, H.A.x, H.A.y, R)) return begin('a', { H }); if (near(P0, H.B.x, H.B.y, R)) return begin('b', { H });
        const [dd] = segDist(P0, H.A, H.B); if (dd <= R * 0.7) return begin('line', { H });
      }
      // pick what is under the pointer on this layer (a drawn part, or the shape), then drag out a new gradient line
      if (o.type === 'draw') { const sp = SB.tool.space(o), l = sp.Minv.transformPoint(pt(P0.x, P0.y)), s = SB.raster.strokeAt(sp.fr, l, 9 / (k * sp.ws)); if (s) { const i = sp.fr.strokes.indexOf(s); S.gradTarget = { oid: o.id, key: 's' + i }; t = active(o); } }
      if (!t) return; S.gradTarget = { oid: o.id, key: t.key };
      begin('new', { a: loc(P0) });
    },
    move(P1) {
      const d = SB.tool.drag; if (!d || d.kind !== 'grad') return; const t = d.t, loc = Q => t.M.inverse().transformPoint(pt(Q.x, Q.y)); d.moved = d.moved || Math.hypot(P1.x - d.p0.x, P1.y - d.p0.y) * SB.view.k() > 3; if (!d.moved) return;
      const cur = P().kind(d.v0) === 'grad' ? P().parse(d.v0) : fromColor(d.v0);
      if (d.part === 'new') { t.set(placed(cur, t, d.a, loc(P1))); }
      else if (d.part === 'a' || d.part === 'b' || d.part === 'line') {
        const A = loc(d.H.A), B = loc(d.H.B), L1 = loc(P1), L0 = loc(d.p0), dx = L1.x - L0.x, dy = L1.y - L0.y;
        if (d.part === 'a') t.set(cur.type === 'radial' ? placed(cur, t, L1, pt(B.x + dx, B.y + dy)) : placed(cur, t, L1, B));
        else if (d.part === 'b') t.set(placed(cur, t, A, L1));
        else t.set(placed(cur, t, pt(A.x + dx, A.y + dy), pt(B.x + dx, B.y + dy)));
      } else if (d.part === 'stop') {
        const [, u] = segDist(P1, d.H.A, d.H.B), stops = cur.stops.map((s, i) => i === d.i ? Object.assign({}, s, { p: U.r2(u) }) : s); t.set(P().grad(cur.type, cur.angle, stops, cur));
      }
      SB.bump(); SB.fields.refresh();
    },
    up() {
      const d = SB.tool.drag; if (!d || d.kind !== 'grad') return;
      if (!d.moved && d.part === 'new' && P().kind(d.v0) !== 'grad') { const g = fromColor(d.v0); d.t.set(P().grad(g.type, g.angle, g.stops)); SB.toast('Gradient added. Drag across the layer to place it, or drag its ends.'); }
      if (d.moved || d.part === 'new') { SB.commit(); SB.invalidate('inspector', 'ctxbar'); }
    },
    cancel() { const d = SB.tool.drag; if (d && d.kind === 'grad' && d.moved) SB.revert(); },
    dbl(P0, e) { // on a color dot: its color (and opacity); on the line: a new color there
      const o = tree.sel(), t = o && active(o), H = t && handles(t); if (!H) return; const k = SB.view.k();
      const st = H.stops.find(q => near(P0, q[0], q[1] - 14 / k, 10 / k)); if (st) { S.gradStop = st[3]; SB.invalidate('ctxbar'); return pickStop(t, st[3], e); }
      const [dd, u] = segDist(P0, H.A, H.B); if (dd * k > 10) return;
      const p = H.p, L = p.stops.slice().sort((a, b) => a.p - b.p), nx = L.findIndex(s => s.p > u), a = L[Math.max(0, nx - 1)] || L[0], b = L[nx < 0 ? L.length - 1 : nx] || a, c = P().mix(a.c, b.c, b.p > a.p ? (u - a.p) / (b.p - a.p) : 0);
      t.set(P().grad(p.type, p.angle, p.stops.concat({ c: P().split(c).hex, p: U.r2(u) }), p)); S.gradStop = p.stops.length; SB.commit(); SB.invalidate('inspector');
    },
    overlay(O) {
      const o = tree.sel(); if (!o || S.playing) return; const t = active(o); if (!t) return; const c = O.c, d = O.dpr;
      const bx = t.box, M = O.M(t.M); c.save(); c.strokeStyle = 'rgba(91,61,245,.45)'; c.setLineDash([4 * d, 4 * d]); c.lineWidth = 1 * d; c.beginPath();
      [[bx.x0, bx.y0], [bx.x1, bx.y0], [bx.x1, bx.y1], [bx.x0, bx.y1], [bx.x0, bx.y0]].forEach(([x, y], i) => { const q = M.transformPoint(pt(x, y)); i ? c.lineTo(q.x, q.y) : c.moveTo(q.x, q.y); }); c.stroke(); c.setLineDash([]);
      const H = handles(t); if (!H) { c.restore(); return; }
      const [ax, ay] = O.P(H.A.x, H.A.y), [bx2, by2] = O.P(H.B.x, H.B.y);
      if (H.p.type === 'radial') { c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineWidth = 3 * d; c.beginPath(); c.arc(ax, ay, Math.hypot(bx2 - ax, by2 - ay), 0, Math.PI * 2); c.stroke(); c.strokeStyle = 'rgba(36,33,63,.7)'; c.lineWidth = 1 * d; c.setLineDash([5 * d, 4 * d]); c.stroke(); c.setLineDash([]); }
      c.lineCap = 'round'; c.strokeStyle = '#fff'; c.lineWidth = 4 * d; c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx2, by2); c.stroke(); c.strokeStyle = '#24213F'; c.lineWidth = 1.5 * d; c.stroke();
      c.fillStyle = '#fff'; c.strokeStyle = '#24213F'; c.lineWidth = 1.5 * d; c.beginPath(); c.arc(ax, ay, 6 * d, 0, Math.PI * 2); c.fill(); c.stroke(); c.beginPath(); c.rect(bx2 - 5 * d, by2 - 5 * d, 10 * d, 10 * d); c.fill(); c.stroke();
      for (const [x, y, col, i] of H.stops) { const [sx, sy] = O.P(x, y), r = (S.gradStop === i ? 8 : 6.5) * d; c.beginPath(); c.arc(sx, sy - 14 * d, r, 0, Math.PI * 2); c.fillStyle = col; c.fill(); c.lineWidth = 2.5 * d; c.strokeStyle = '#fff'; c.stroke(); c.lineWidth = 1 * d; c.strokeStyle = S.gradStop === i ? '#5B3DF5' : '#24213F'; c.stroke(); c.beginPath(); c.moveTo(sx, sy - 14 * d + r); c.lineTo(sx, sy); c.stroke(); }
      c.restore();
    },
    bar() {
      const o = tree.sel(), list = targets(o), t = o && active(o), v = t && t.get(), g = P().kind(v) === 'grad' ? P().parse(v) : null;
      const setG = fn => { if (!t) return; const p = g || fromColor(v); fn(p); t.set(P().grad(p.type, p.angle, p.stops, p)); SB.commit(); SB.invalidate('ctxbar', 'inspector'); };
      return [
        list.length > 1 ? W.select(t.key, list.map(x => [x.key, x.label + (P().kind(x.get()) === 'grad' ? ' (gradient)' : '')]), k => { S.gradTarget = { oid: o.id, key: k }; SB.invalidate('ctxbar'); SB.dirty(); }, 'Which color to edit') : null,
        t ? W.seg(g ? g.type : '', [['linear', 'Linear'], ['radial', 'Radial']], ty => setG(p => { p.type = ty; })) : null,
        g ? h('span.grad-stops', { title: 'The gradient’s colors: click one to change its color and opacity' }, ...g.stops.map((st, i) => ({ st, i })).sort((x, y) => x.st.p - y.st.p).map(({ st, i }) => { const cb = W.colorBtn(st.c, { label: `Color ${i + 1} (at ${Math.round(st.p * 100)}%)`, input: c => { const q = P().parse(t.get()); q.stops[i] = Object.assign({}, q.stops[i], { c }); t.set(P().grad(q.type, q.angle, q.stops, q)); SB.bump(); }, change: () => { S.gradStop = i; SB.commit(); SB.invalidate('inspector'); } }); if (S.gradStop === i) cb.classList.add('on'); return cb; })) : null,
        g ? W.btn('Reverse', () => setG(p => { p.stops = p.stops.map(s => ({ c: s.c, p: U.r2(1 - s.p) })); }), { cls: 'sm ghost' }) : null,
        g && S.gradStop != null && g.stops.length > 2 ? W.btn('Remove color', () => { setG(p => { p.stops = p.stops.filter((s, i) => i !== S.gradStop); }); S.gradStop = null; }, { cls: 'sm ghost', icon: 'trash' }) : null,
        h('span.lbl', null, t ? (g ? 'Drag the ends to move, turn or stretch it; slide the color dots. Double-click a dot for its color, the line for a new color.' : 'Drag across the layer to lay a gradient.') : 'Select a shape or a drawing.')];
    },
  });
  /** Edit stop i of t's gradient: the color panel (a color and its opacity) opens by the pointer. */
  let anchor = null;
  function pickStop(t, i, e) {
    const v = t.get(); if (P().kind(v) !== 'grad') return; const p = P().parse(v), st = p.stops[i]; if (!st) return;
    if (anchor) anchor.remove(); anchor = h('div.grad-anchor', { style: { position: 'fixed', left: ((e && e.clientX) || innerWidth / 2) + 'px', top: ((e && e.clientY) || innerHeight / 2) + 'px', width: '1px', height: '1px', visibility: 'hidden' } });
    document.body.appendChild(anchor);
    const set = (c, fin) => { const q = P().parse(t.get()); if (!q.stops[i]) return; q.stops[i] = Object.assign({}, q.stops[i], { c }); t.set(P().grad(q.type, q.angle, q.stops, q)); SB.bump(); if (fin) { SB.commit(); SB.invalidate('ctxbar', 'inspector'); } };
    const b = W.colorBtn(st.c, { label: `Color ${i + 1}`, input: c => set(c, false), change: c => set(c, true) }); b.style.cssText = 'position:absolute;left:0;top:0;width:1px;height:1px;opacity:0;'; anchor.appendChild(b); anchor.style.visibility = 'visible'; b.click();
  }
  // Delete removes the picked color dot (when there are more than two)
  addEventListener('keydown', e => {
    if (S.tool !== 'gradient' || S.gradStop == null || (e.key !== 'Delete' && e.key !== 'Backspace') || (e.target.closest && e.target.closest('input,textarea'))) return;
    const o = tree.sel(), t = o && active(o), v = t && t.get(); if (!v || P().kind(v) !== 'grad') return; const p = P().parse(v); if (p.stops.length <= 2) return;
    e.preventDefault(); e.stopPropagation(); t.set(P().grad(p.type, p.angle, p.stops.filter((s, i) => i !== S.gradStop), p)); S.gradStop = null; SB.commit(); SB.invalidate('ctxbar', 'inspector');
  }, true);
  SB.gradientTool = { targets, active, handles, placed };
})(window.SB);
