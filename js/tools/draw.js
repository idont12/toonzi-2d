/* Brush, fill brush, eraser, fill bucket and smooth tool. */
'use strict';
(function (SB) {
  const U = SB.util, S = SB.state, tree = SB.tree, G = SB.paths, h = U.h, W = SB.w;
  const brushCursor = (O, size) => {
    if (!S.hover || S.playing) return; const c = O.c, [x, y] = O.P(S.hover.x, S.hover.y), r = Math.max(2, size / 2 * O.sc);
    c.save(); c.lineWidth = 1.2 * O.dpr; c.strokeStyle = 'rgba(255,255,255,.9)'; c.beginPath(); c.arc(x, y, r + O.dpr, 0, Math.PI * 2); c.stroke();
    c.strokeStyle = 'rgba(36,33,63,.85)'; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.stroke(); c.restore();
  };
  const colorBar = (onPick) => [W.colorBtn(S.brush.color, { label: 'Brush color', paint: true, input: c => { S.brush.color = c; onPick && onPick(c); } })];
  const sizeBar = (get, set, max) => [W.popSlider('Size', get(), { min: 1, max, unit: 'px', input: v => { set(v); SB.dirty(); } })];

  // ---------- brush (and eraser, which is a brush that cuts)
  /** Pen pressure is on for this line: a pen (graphics tablet or stylus) and a brush that uses it. */
  const pressureOn = (e, erase, fill) => !erase && !fill && S.pressure !== false && e && e.pointerType === 'pen' && (SB.brush.current().pr ?? 1) > 0;
  function strokeDown(P, erase, e, fill) {
    if (SB.mirror.down(P)) return; // the mirror line's handles
    if (S.brushMode === 'fill') S.brushMode = 'free'; // the brush's old Fill mode is the Fill brush tool now
    const sel = tree.sel(), o = sel && SB.types.get(sel.type).frames && !tree.locked(sel) && !tree.hidden(sel) ? sel : SB.tool.drawTarget(null, true);
    if (!erase) SB.frames.autoFrame(o); // Auto key on a frame library: a new frame where there is no keyframe
    const sp = SB.tool.space(o), l = sp.Minv.transformPoint(U.pt(P.x, P.y));
    const st = { s: U.r1((erase ? S.eraser : S.brush.size) / sp.ws), pts: [U.r1(l.x), U.r1(l.y)] };
    if (erase) st.er = 1; else if (fill) { st.c = S.brush.color; st.f = 1; st.loops = [st.pts]; } // fill-only brush: the area you draw around fills, no line
    else { st.c = S.brush.color; SB.brush.apply(SB.brush.current(), st); }
    const prs = pressureOn(e, erase, fill) ? [e.pressure || 0.5] : null; if (e && e.pointerType === 'pen' && !S.penSeen) { S.penSeen = true; SB.invalidate('ctxbar'); }
    sp.fr.strokes.push(st); SB.tool.drag = { kind: 'stroke', o, sp, st, p0: { x: P.x, y: P.y }, last: { x: l.x, y: l.y }, sm: { x: l.x, y: l.y }, raw: null, prs, pr: prs ? SB.brush.current().pr ?? 1 : 0, pq: prs ? prs[0] : 0 };
    if (SB.mirror.active()) { const d = SB.tool.drag; d.mx = SB.mirror.local(sp); d.twin = U.deep(st); sp.fr.strokes.push(d.twin); syncTwin(d); } // mirror: its twin draws along
    SB.bump();
  }
  /** The mirrored twin follows the line (js/tools/mirror.js). */
  function syncTwin(d) { const t = d.twin; if (!t) return; t.pts = SB.mirror.mapPts(d.mx, d.st.pts); t.s = d.st.s; if (d.st.wp) t.wp = d.st.wp.slice(); else delete t.wp; if (t.f) t.loops = [t.pts]; G.touch(t); }
  /** Smoothing and stabilizer: the brush and the eraser each have their own. */
  const steady = st => st.er ? { smooth: S.eSmooth ?? 0.4, stab: !!S.eStab, rope: S.eStabR || 40 } : st.f ? { smooth: S.fbSmooth ?? 0.5, stab: !!S.fbStab, rope: S.fbStabR || 40 } : { smooth: S.smooth, stab: !!S.stab, rope: S.stabR };
  /** The stabilizer's rope while drawing: from the line's tip to the pointer. */
  function rope(O) {
    const d = SB.tool.drag; if (!d || d.kind !== 'stroke' || !steady(d.st).stab || !S.hover) return;
    const c = O.c, tip = O.M(d.sp.M).transformPoint(U.pt(d.sm.x, d.sm.y)), [hx, hy] = O.P(S.hover.x, S.hover.y); c.save(); c.strokeStyle = 'rgba(91,61,245,.8)'; c.lineWidth = 1.5 * O.dpr; c.setLineDash([4 * O.dpr, 3 * O.dpr]); c.beginPath(); c.moveTo(tip.x, tip.y); c.lineTo(hx, hy); c.stroke(); c.restore();
  }
  function strokeMove(e) {
    const d = SB.tool.drag; if (d && d.kind === 'mirror') return SB.mirror.move(SB.view.toProj(e), e); if (!d || d.kind !== 'stroke') return;
    if (e.shiftKey) return straightLine(d, e);
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e], o = steady(d.st), k = 1 - o.smooth * 0.88, rope = o.stab ? o.rope / (SB.view.k() * d.sp.ws) : 0;
    for (const ev of (evs.length ? evs : [e])) {
      const q = SB.view.toProj(ev), l = d.sp.Minv.transformPoint(U.pt(q.x, q.y)); d.raw = l;
      if (rope) { const dx = l.x - d.sm.x, dy = l.y - d.sm.y, dist = Math.hypot(dx, dy); if (dist <= rope) continue; d.sm.x += dx / dist * (dist - rope); d.sm.y += dy / dist * (dist - rope); }
      else { d.sm.x += (l.x - d.sm.x) * k; d.sm.y += (l.y - d.sm.y) * k; }
      if (d.prs) d.pq += ((ev.pressure || d.pq) - d.pq) * 0.5; // pressure, a little steadied
      if (Math.hypot(d.sm.x - d.last.x, d.sm.y - d.last.y) * d.sp.ws < 1.5) continue;
      d.st.pts.push(U.r1(d.sm.x), U.r1(d.sm.y)); d.last = { x: d.sm.x, y: d.sm.y }; if (d.prs) d.prs.push(d.pq);
    }
    if (d.prs) { d.st.wp = SB.brush.pressureProfile(d.st.pts, d.prs, d.pr); if (!d.st.wp) delete d.st.wp; G.touch(d.st); } // pen pressure: the line's widths
    if (d.st.f) { d.st.loops = [d.st.pts]; G.touch(d.st); }
    syncTwin(d); SB.bump();
  }
  /** Shift while drawing: the stroke becomes a straight line from where it started, level or upright.
      Let go of Shift to carry on freehand from the line's end. */
  function straightLine(d, e) {
    const q = SB.tool.straight(d.p0, SB.view.toProj(e), e), a = d.sp.Minv.transformPoint(U.pt(d.p0.x, d.p0.y)), b = d.sp.Minv.transformPoint(U.pt(q.x, q.y));
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * d.sp.ws / 4)), pts = []; // a point every few pixels, so textured brushes look the same as freehand
    for (let i = 0; i <= n; i++) pts.push(U.r1(a.x + (b.x - a.x) * i / n), U.r1(a.y + (b.y - a.y) * i / n));
    d.st.pts = pts; delete d.st.wp; if (d.prs) d.prs = pts.filter((v, i) => i % 2 === 0).map(() => d.pq); if (d.st.f) d.st.loops = [pts]; d.sm = { x: b.x, y: b.y }; d.last = { x: b.x, y: b.y }; d.raw = null; syncTwin(d); SB.bump();
  }
  function strokeUp() {
    const d = SB.tool.drag; if (d && d.kind === 'mirror') return SB.mirror.up(); if (!d || d.kind !== 'stroke') return; const st = d.st, fr = d.sp.fr;
    const o = steady(st); if (o.smooth > 0 && d.raw && !o.stab) { st.pts.push(U.r1(d.raw.x), U.r1(d.raw.y)); if (d.prs) { d.prs.push(d.pq); st.wp = SB.brush.pressureProfile(st.pts, d.prs, d.pr); } }
    if (st.wp && st.wp.every(v => Math.abs(v - st.wp[0]) < 0.02)) { const k = st.wp[0]; delete st.wp; st.s = U.r1(st.s * k); } // even pressure: just a thinner or thicker line
    syncTwin(d); const both = d.twin ? [st, d.twin] : [st]; // with the mirror on, its twin is finished the same way
    if (st.er) { // the eraser cuts: the erased bits are gone and each piece becomes its own part
      let n = 0; for (const x of both) n += SB.bool.cut(fr, x, d.sp.ws); SB.commit(); if (!n) SB.toast('Nothing to cut there.'); return;
    }
    if (st.f) { // fill-only brush: a closed, editable filled path (or nothing if it was only a dab)
      for (const x of both) { const i = fr.strokes.indexOf(x), b = G.bounds([{ pts: x.pts, s: 0 }]); if (i < 0) continue;
        if (x.pts.length < 6 || !U.boxOk(b) || (b.x1 - b.x0) * d.sp.ws < 2 || (b.y1 - b.y0) * d.sp.ws < 2) fr.strokes.splice(i, 1);
        else { const sub = G.fitFreehand(x.pts.concat(x.pts[0], x.pts[1]), (0.8 + o.smooth * 2.5) / d.sp.ws, true); fr.strokes[i] = sub && sub.p.length >= 8 ? { b: 1, subs: [sub], c: x.c, s: 0, fc: x.c } : { f: 1, loops: [x.pts], c: x.c }; } }
      SB.tool.centerFresh(d.o); return SB.commit();
    }
    if (!st.er && S.brushMode === 'vector' && st.pts.length >= 4) for (const x of both) { // simple curve: a light bezier path you can edit later, in the brush's style
      const path = { b: 1, subs: [G.fitFreehand(x.pts, (0.8 + S.smooth * 2.5) / d.sp.ws)], c: x.c, s: x.s }; if (x.tx) path.tx = x.tx; if (x.bs) path.bs = x.bs; if (x.wp) path.subs[0].wp = x.wp;
      fr.strokes[fr.strokes.indexOf(x)] = path;
    }
    SB.tool.centerFresh(d.o); SB.commit();
  }
  // Ctrl-drag with the Brush or Eraser trims loose line ends back to where they cross other lines (js/tools/trim.js)
  const trimming = () => SB.tool.drag && SB.tool.drag.kind === 'trim';
  function trimDown(P) { const sel = tree.sel(), o = sel && SB.types.get(sel.type).frames && !tree.locked(sel) && !tree.hidden(sel) ? sel : SB.tool.drawTarget(P, false); if (!o) return SB.toast('Select a drawing to trim its lines.'); SB.trim.down(P, o); }
  SB.tools.add({
    id: 'brush', label: 'Brush', icon: 'brush', key: 'B', tip: 'Draw freehand. Hold Ctrl and drag across loose ends to trim them', cursor: 'none',
    down: (P, e) => SB.trim.is(e) ? trimDown(P) : strokeDown(P, false, e), move: (P, e) => trimming() ? SB.trim.move(P) : strokeMove(e), up: () => trimming() ? SB.trim.up() : strokeUp(), cancel: () => SB.revert(),
    overlay(O) {
      brushCursor(O, S.brush.size); rope(O); SB.trim.overlay(O); SB.mirror.overlay(O);
    },
    bar() {
      const b = SB.brush.current(), chip = h('button.brushchip', { type: 'button', title: 'Pick or edit brushes' }, h('canvas', { width: 128, height: 40 }), h('span', null, b.name));
      setTimeout(() => SB.brush.preview(chip.querySelector('canvas'), b, U.cssVar('--ink')), 0);
      chip.onclick = () => SB.brushUI.picker(chip);
      return [...colorBar(), h('span.vsep'), ...sizeBar(() => S.brush.size, v => S.brush.size = v, 80), h('span.vsep'), chip,
        W.seg(S.brushMode, [['free', 'Detailed', 'Keeps every point of your hand movement'], ['vector', 'Simple curve', 'Turns each line into a smooth path with a few editable points']], v => { S.brushMode = v; SB.invalidate('ctxbar'); }),
        W.popSlider('Smoothing', Math.round(S.smooth * 100), { min: 0, max: 100, unit: '%', input: v => S.smooth = v / 100 }),
        W.check(S.stab, 'Stabilize', v => { S.stab = v; SB.invalidate('ctxbar'); }), S.stab ? W.popSlider('Rope', S.stabR, { min: 5, max: 150, title: 'Stabilizer rope length', input: v => S.stabR = v }) : null,
        S.penSeen ? W.check(S.pressure !== false, 'Pressure', v => { S.pressure = v; SB.invalidate('ctxbar'); }) : null,
        h('span.vsep'), ...SB.mirror.bar()];
    },
  });
  // ---------- fill brush: paint solid shapes; the area you draw around fills with the color, with no line
  SB.tools.add({
    id: 'fillbrush', label: 'Fill brush', icon: 'fillBrush', key: 'Shift+G', tip: 'Paint solid shapes: the area you draw around fills, with no outline', cursor: 'none',
    down: (P, e) => SB.trim.is(e) ? trimDown(P) : strokeDown(P, false, e, true), move: (P, e) => trimming() ? SB.trim.move(P) : strokeMove(e), up: () => trimming() ? SB.trim.up() : strokeUp(), cancel: () => SB.revert(),
    overlay(O) { brushCursor(O, 6); rope(O); SB.trim.overlay(O); SB.mirror.overlay(O); },
    bar: () => [...colorBar(), h('span.vsep'),
      W.popSlider('Smoothing', Math.round((S.fbSmooth ?? 0.5) * 100), { min: 0, max: 100, unit: '%', title: 'Steadies a shaky hand and rounds the outline', input: v => S.fbSmooth = v / 100 }),
      W.check(!!S.fbStab, 'Stabilize', v => { S.fbStab = v; SB.invalidate('ctxbar'); }), S.fbStab ? W.popSlider('Rope', S.fbStabR || 40, { min: 5, max: 150, title: 'Stabilizer rope length', input: v => S.fbStabR = v }) : null,
      h('span.vsep'), ...SB.mirror.bar(), h('span.lbl', null, 'Draw around an area: it fills with the color. The result is an editable filled path.')],
  });
  SB.tools.add({
    id: 'eraser', label: 'Eraser', icon: 'eraser', key: 'E', tip: 'Cut lines and shapes on the selected drawing', cursor: 'none',
    down(P, e) { if (SB.mirror.down(P)) return; const o = SB.tool.drawTarget(P, false); if (!o) return SB.toast('Select a drawing to erase on.'); if (SB.trim.is(e)) return trimDown(P); strokeDown(P, true); }, move: (P, e) => trimming() ? SB.trim.move(P) : strokeMove(e), up: () => trimming() ? SB.trim.up() : strokeUp(), cancel: () => SB.revert(),
    overlay: O => { brushCursor(O, S.eraser); rope(O); SB.trim.overlay(O); SB.mirror.overlay(O); },
    bar: () => [...sizeBar(() => S.eraser, v => S.eraser = v, 160),
      W.popSlider('Smoothing', Math.round((S.eSmooth ?? 0.4) * 100), { min: 0, max: 100, unit: '%', title: 'Steadies a shaky hand', input: v => S.eSmooth = v / 100 }),
      W.check(S.eStab, 'Stabilize', v => { S.eStab = v; SB.invalidate('ctxbar'); }), S.eStab ? W.popSlider('Rope', S.eStabR || 40, { min: 5, max: 150, title: 'Stabilizer rope length', input: v => S.eStabR = v }) : null,
      h('span.vsep'), ...SB.mirror.bar(), h('span.lbl', null, 'Cuts lines and shapes on the current frame of the selected layer.')],
  });

  // ---------- fill bucket
  SB.tools.add({
    id: 'fill', label: 'Fill', icon: 'fill', key: 'G', tip: 'Fill a closed area', cursor: 'crosshair',
    down(P) {
      const hit = SB.scene.hit(P), sel = tree.sel();
      const shape = sel && sel.type === 'shape' && SB.scene.inside(sel, P) ? sel : hit && hit.type === 'shape' ? hit : null;
      if (shape) { SB.tracks.set(shape, 'fill', S.brush.color); shape.fillOn = true; SB.commit(); return; }
      const o = SB.tool.drawTarget(P, false); if (!o) return SB.toast('Select a drawing, then click inside a closed area.');
      const sp = SB.tool.space(o), fr = sp.fr, l = sp.Minv.transformPoint(U.pt(P.x, P.y));
      const part = SB.raster.strokeAt(fr, l, 0);
      if (part && part.f) { part.c = S.brush.color; SB.commit(); return SB.toast('Fill recolored.'); }
      if (part && part.b && part.subs.some(s => s.cl)) { part.fc = S.brush.color; SB.commit(); return SB.toast('Path filled.'); }
      const inside = fr.strokes.slice().reverse().find(s => s.b && s.subs.some(sb => sb.cl) && (() => { const pth = new Path2D(); G.trace(pth, s.subs); return U.measureCtx.isPointInPath(pth, l.x, l.y, s.fr === 'evenodd' ? 'evenodd' : 'nonzero'); })());
      if (inside) { inside.fc = S.brush.color; SB.commit(); return SB.toast('Path filled. The fill follows the path when you edit it.'); }
      const r = SB.raster.fillAt(fr, l, S.fillGap);
      if (r.err === 'open') return SB.toast('That area is open. Close the gap, or raise “Close gaps”.');
      if (r.err === 'line') return SB.toast('That is a line. Click inside the area you want to fill.');
      if (r.err === 'empty') return SB.toast('This frame has no lines to fill between yet.');
      const f = { f: 1, c: S.brush.color, loops: r.loops, seed: [U.r1(l.x), U.r1(l.y)], gap: r.gap ?? S.fillGap }; SB.raster.linkFill(fr, f); fr.strokes.unshift(f); SB.commit();
    },
    bar: () => [...colorBar(), h('span.vsep'), W.popSlider('Close gaps', S.fillGap, { min: 0, max: 20, title: 'Close small gaps in lines', input: v => S.fillGap = v }), h('span.lbl', null, 'Click inside a closed area. Fills follow their lines when you edit them.')],
  });

  // ---------- smooth: brush over lines to round them and drop extra points
  function smoothAt(fr, l, R, strength, touched) {
    for (const s of fr.strokes) {
      if (s.b && !s.er) { if (G.smoothSubs(s, (x, y) => { const dd = Math.hypot(x - l.x, y - l.y); return dd < R ? Math.pow(1 - dd / R, 2) * strength : 0; })) { G.touch(s); touched.set(s, touched.get(s) || new Map()); } continue; }
      if (s.er) continue; const arrs = s.f ? s.loops : [s.pts], closed = !!s.f;
      arrs.forEach((p, ai) => {
        const n = p.length / 2; if (n < 3) return; const q = p.slice(); let hit = false;
        for (let i = 0; i < n; i++) {
          if (!closed && (i === 0 || i === n - 1)) continue; const dd = Math.hypot(p[i * 2] - l.x, p[i * 2 + 1] - l.y); if (dd >= R) continue;
          const w = Math.pow(1 - dd / R, 2) * strength, a = ((i - 1) + n) % n, b = (i + 1) % n;
          q[i * 2] = U.lerp(p[i * 2], (p[a * 2] + p[b * 2]) / 2, w); q[i * 2 + 1] = U.lerp(p[i * 2 + 1], (p[a * 2 + 1] + p[b * 2 + 1]) / 2, w); hit = true;
          const t = touched.get(s) || new Map(), r = t.get(ai) || [i, i]; r[0] = Math.min(r[0], i); r[1] = Math.max(r[1], i); t.set(ai, r); touched.set(s, t);
        }
        if (hit) { for (let i = 0; i < p.length; i++) p[i] = q[i]; G.touch(s); }
      });
    }
  }
  function thin(touched, ws, strength) {
    for (const [s, m] of touched) {
      if (s.b) continue; // paths: smoothing already keeps their few points
      const arrs = s.f ? s.loops : [s.pts];
      for (const [ai, [i0, i1]] of m) {
        const p = arrs[ai], n = p.length / 2, eps = 0.8 * (0.5 + strength) / ws, a = Math.max(0, i0 - 2), b = Math.min(n - 1, i1 + 2); if (b - a < 3) continue;
        const out = p.slice(0, a * 2).concat(G.rdp(p.slice(a * 2, (b + 1) * 2), eps), p.slice((b + 1) * 2));
        if (out.length >= (s.f ? 6 : 4)) { if (s.f) s.loops[ai] = out.map(U.r1); else s.pts = out.map(U.r1); }
      }
      G.touch(s);
    }
  }
  SB.tools.add({
    id: 'smooth', label: 'Smooth', icon: 'smooth', key: 'O', tip: 'Brush over lines to round them', cursor: 'none',
    down(P) { if (SB.mirror.down(P)) return; const o = SB.tool.drawTarget(P, false); if (!o) return SB.toast('Select a drawing first.'); SB.frames.autoFrame(o, true); const sp = SB.tool.space(o); SB.tool.drag = { kind: 'smooth', sp, touched: new Map(), mx: SB.mirror.active() ? SB.mirror.local(sp) : null }; this.move(P); },
    move(P, e) { const d = SB.tool.drag; if (d && d.kind === 'mirror') return SB.mirror.move(P, e); if (!d || d.kind !== 'smooth') return; const l = d.sp.Minv.transformPoint(U.pt(P.x, P.y)); for (const q of d.mx ? [l, SB.mirror.pt(d.mx, l)] : [l]) smoothAt(d.sp.fr, q, S.smoothR / d.sp.ws, S.smoothK * 0.7, d.touched); SB.bump(); },
    up() { const d = SB.tool.drag; if (d && d.kind === 'mirror') return SB.mirror.up(); if (!d || d.kind !== 'smooth') return; thin(d.touched, d.sp.ws, S.smoothK); SB.raster.refreshFills(d.sp.fr, new Set([...d.touched.keys()].filter(s => !s.f)), false); SB.commit(); },
    cancel: () => SB.revert(),
    overlay(O) { SB.mirror.overlay(O); if (!S.hover) return; const c = O.c, [x, y] = O.P(S.hover.x, S.hover.y); c.save(); c.strokeStyle = 'rgba(91,61,245,.9)'; c.lineWidth = 1.5 * O.dpr; c.fillStyle = 'rgba(91,61,245,.08)'; c.beginPath(); c.arc(x, y, S.smoothR * O.sc, 0, Math.PI * 2); c.fill(); c.stroke(); c.restore(); },
    bar: () => [W.popSlider('Size', S.smoothR, { min: 8, max: 160, input: v => S.smoothR = v }), W.popSlider('Strength', Math.round(S.smoothK * 100), { min: 5, max: 100, unit: '%', input: v => S.smoothK = v / 100 }), h('span.vsep'), ...SB.mirror.bar(), h('span.lbl', null, 'Works on brush lines and fills.')],
  });
  SB.drawBars = { colorBar, sizeBar };
})(window.SB);
