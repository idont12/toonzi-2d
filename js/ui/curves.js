/* Custom easing curves: a small pop-up with a speed graph. Drag the handles to shape how a motion
   speeds up and slows down; drag above the top or below the bottom to overshoot (the graph grows
   to fit, for big bounces). Double-click the curve to add a point, double-click a point to make it
   sharp or round, Delete removes the selected point. While it is open the stage plays that stretch
   of the animation over and over, so you see the change live.
   Saved on each keyframe as e: 'bez' with bz: [x1, y1, x2, y2] (two points, like CSS cubic-bezier)
   or bzp: [[x, y, inX, inY, outX, outY, smooth], …] for a curve with more points (js/core/tracks.js).
   SB.curves.open(keys, { x, y, onChange }) — keys: keyframe objects, or [key, { o, id }] pairs from the timeline. */
'use strict';
(function (SB) {
  const U = SB.util, S = SB.state, TR = SB.tracks, tree = SB.tree, h = U.h, W = SB.w;
  // ---------- curves as anchor lists
  const two = ([x1, y1, x2, y2]) => [[0, 0, 0, 0, x1, y1, 1], [1, 1, x2, y2, 1, 1, 1]];
  /** A bounce: falls in (a parabola), then hops of the given depths between ground hits (sharp points). */
  function bounce(hits, mins) {
    const P = [[0, 0, 0, 0, hits[0] / 3, 0, 1]]; let prev = 0;
    hits.forEach((x, i) => {
      if (i === 0) { P.push([x, 1, x - (x - prev) / 3, 1 / 3, x, 1, 0]); prev = x; return; }
      const xm = (prev + x) / 2, d = (xm - prev) / 3, y = mins[i - 1], A = P[P.length - 1]; A[4] = prev + d; A[5] = 1 - (1 - y) * 2 / 3;
      P.push([xm, y, xm - d, y, xm + d, y, 1], [x, 1, x - d, 1 - (1 - y) * 2 / 3, x, 1, 0]); prev = x;
    });
    const L = P[P.length - 1]; L[4] = 1; L[5] = 1; return P;
  }
  /** Springs past the end and settles: peaks [x, y] with flat tops. */
  function spring(peaks) {
    const pts = [[0, 0]].concat(peaks, [[1, 1]]), P = pts.map(([x, y], i) => { const a = pts[i - 1], b = pts[i + 1], dl = a ? (x - a[0]) / 3 : 0, dr = b ? (b[0] - x) / 3 : 0; return [x, y, x - dl, y, x + dr, y, 1]; });
    P[0][4] = peaks[0][0] / 6; P[0][5] = peaks[0][1] * 0.75; return P;
  }
  const PRESETS = [['Linear', two([0, 0, 1, 1])], ['In', two([0.42, 0, 1, 1])], ['Out', two([0, 0, 0.58, 1])], ['In-out', two([0.42, 0, 0.58, 1])], ['Strong', two([0.8, 0, 0.2, 1])],
    ['Back', two([0.3, 1.5, 0.6, 1])], ['Big back', two([0.25, 2.3, 0.5, 1])], ['Anticipate', two([0.5, -0.5, 0.7, 1])], ['Snap', two([0.1, 0.9, 0.2, 1])],
    ['Bounce', bounce([0.3636, 0.7273, 0.9091, 1], [0.75, 0.9375, 0.984])], ['Big bounce', bounce([0.3, 0.6, 0.82, 0.94, 1], [0.35, 0.65, 0.86, 0.96])],
    ['Elastic', spring([[0.16, 1.45], [0.32, 0.78], [0.48, 1.12], [0.64, 0.95], [0.8, 1.02]])], ['Wobble', spring([[0.22, 1.25], [0.45, 0.9], [0.68, 1.05]])]];
  const G = 220, PAD = 22, R = 6;
  /** Any easing of a keyframe (a named one, the power curve of the spacing handle…) as curve points: exact for the
      cubic ones, fitted for the others (back, bounce, elastic, power). */
  function fromEase(k) {
    const exact = { linear: [0, 0, 1, 1], smooth: [1 / 3, 0, 2 / 3, 1], easeIn: [1 / 3, 0, 2 / 3, 0], easeOut: [1 / 3, 1, 2 / 3, 1], spline: [0, 0, 1, 1], hold: [1, 0, 1, 0] }[k.e || 'smooth'];
    if (exact && k.e !== 'pw') return two(exact);
    const f = TR.easeOf(k), pts = []; for (let i = 0; i <= 160; i++) { const u = i / 160; pts.push(u, f(u)); }
    // a cubic (smooth, in, out, back…) is one exact segment
    const y0 = f(0), y3 = f(1), A = 27 * f(1 / 3) - 8 * y0 - y3, B = 27 * f(2 / 3) - y0 - 8 * y3, b1 = (2 * A - B) / 18, b2 = (2 * B - A) / 18;
    const cub = t => { const m = 1 - t; return y0 * m * m * m + 3 * b1 * t * m * m + 3 * b2 * t * t * m + y3 * t * t * t; };
    if (Math.abs(y0) < 1e-6 && Math.abs(y3 - 1) < 1e-6 && pts.every((v, i) => i % 2 === 0 || Math.abs(cub(pts[i - 1]) - v) < 1e-4)) return two([1 / 3, U.r3(b1), 2 / 3, U.r3(b2)]);
    const segs = SB.paths.fitBeziers(pts, 0.006, { corner: 35, r: 0.02 }); if (!segs.length) return two([0, 0, 1, 1]);
    const P = [[0, 0, 0, 0, segs[0].b[1][0], segs[0].b[1][1], 1]];
    for (let i = 1; i < segs.length; i++) { const a = segs[i - 1].b, b = segs[i].b; P.push([b[0][0], b[0][1], a[2][0], a[2][1], b[1][0], b[1][1], segs[i].corner ? 0 : 1]); }
    const L = segs[segs.length - 1].b; P.push([1, 1, L[2][0], L[2][1], 1, 1, 1]);
    return P.map(p => p.map((v, i) => i === 6 ? v : U.r3(v)));
  }

  function open(targets, opt = {}) {
    const keys = targets.map(t => Array.isArray(t) ? t[0] : t); if (!keys.length) return;
    const ref = Array.isArray(targets[0]) ? targets[0][1] : null, saved = keys.map(k => ({ k, e: k.e, bz: k.bz && k.bz.slice(), bzp: k.bzp && U.deep(k.bzp), ep: k.ep }));
    const k0 = keys[0];
    let P = k0.e === 'bez' && k0.bzp ? U.deep(k0.bzp) : k0.e === 'bez' && k0.bz ? two(k0.bz) : fromEase(k0); // the easing it has now, as a curve to edit
    let changed = false, loop = 0, sel = -1, span = [-0.6, 1.6], dot = -1;
    const apply = () => {
      const r = P.map(p => p.map((v, i) => i === 6 ? v : U.r3(v)));
      keys.forEach(k => { k.e = 'bez'; delete k.ep; if (r.length === 2) { k.bz = [r[0][4], r[0][5], r[1][2], r[1][3]]; delete k.bzp; } else { k.bzp = r; k.bz = [r[0][4], r[0][5], r[r.length - 1][2], r[r.length - 1][3]]; } });
      changed = true; SB.bump(); SB.dirty(); opt.onChange && opt.onChange();
    };
    /** The graph's height range: from 0 to 1, grown to show every point and handle. */
    const fit = () => { let lo = -0.5, hi = 1.5; P.forEach(p => { lo = Math.min(lo, p[1], p[3], p[5]); hi = Math.max(hi, p[1], p[3], p[5]); }); span = [lo - 0.12, hi + 0.12]; };
    // the stretch of the main timeline this keyframe eases: from it to the next key of the same value
    let seg = null; if (ref) { const tr = ref.o.tracks[ref.id] || [], nx = tr[tr.indexOf(k0) + 1]; if (nx) seg = [tree.mainAt(ref.o, k0.t), tree.mainAt(ref.o, nx.t)]; } if (opt.seg) seg = opt.seg; // a part of the timeline to play while editing (morphs pass theirs)
    const dpr = Math.min(2, devicePixelRatio || 1), size = G + PAD * 2, cv = h('canvas.cvp-graph', { width: size * dpr, height: size * dpr }), c = cv.getContext('2d');
    const gx = x => PAD + x * G, gy = y => PAD + (1 - (y - span[0]) / (span[1] - span[0])) * G, ux = px => (px - PAD) / G, uy = py => span[0] + (1 - (py - PAD) / G) * (span[1] - span[0]);
    const evalY = u => TR.bezierPath(P, u);
    function draw() {
      c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, size, size);
      const css = getComputedStyle(document.documentElement), ink2 = css.getPropertyValue('--ink-2').trim() || '#888', line = css.getPropertyValue('--line').trim() || '#ddd', brand = css.getPropertyValue('--brand').trim() || '#5B3DF5';
      c.strokeStyle = line; c.lineWidth = 1; [0, 1].forEach(y => { c.beginPath(); c.moveTo(gx(0), gy(y)); c.lineTo(gx(1), gy(y)); c.stroke(); }); [0, 0.25, 0.5, 0.75, 1].forEach(x => { c.beginPath(); c.moveTo(gx(x), PAD); c.lineTo(gx(x), PAD + G); c.stroke(); });
      c.fillStyle = ink2; c.font = '10px system-ui, sans-serif'; c.fillText('100%', 2, gy(1) - 3); c.fillText('0', 6, gy(0) - 3);
      c.strokeStyle = ink2; c.setLineDash([3, 3]); c.beginPath(); P.forEach((p, i) => { if (i > 0) { c.moveTo(gx(p[0]), gy(p[1])); c.lineTo(gx(p[2]), gy(p[3])); } if (i < P.length - 1) { c.moveTo(gx(p[0]), gy(p[1])); c.lineTo(gx(p[4]), gy(p[5])); } }); c.stroke(); c.setLineDash([]);
      c.strokeStyle = brand; c.lineWidth = 2.5; c.beginPath(); for (let i = 0; i <= 160; i++) { const u = i / 160, x = gx(u), y = gy(evalY(u)); i ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke();
      P.forEach((p, i) => {
        [[i > 0, 2], [i < P.length - 1, 4]].forEach(([ok, j]) => { if (!ok) return; c.beginPath(); c.arc(gx(p[j]), gy(p[j + 1]), 4.5, 0, Math.PI * 2); c.fillStyle = '#fff'; c.fill(); c.lineWidth = 1.5; c.strokeStyle = brand; c.stroke(); });
        if (i === 0 || i === P.length - 1) return; c.beginPath(); p[6] ? c.arc(gx(p[0]), gy(p[1]), R, 0, Math.PI * 2) : c.rect(gx(p[0]) - R + 1, gy(p[1]) - R + 1, 2 * R - 2, 2 * R - 2); c.fillStyle = i === sel ? brand : '#fff'; c.fill(); c.lineWidth = 2; c.strokeStyle = brand; c.stroke();
      });
      if (dot >= 0) { c.beginPath(); c.arc(gx(dot), gy(evalY(dot)), 4, 0, Math.PI * 2); c.fillStyle = '#FF4F8B'; c.fill(); }
      rm.disabled = !(sel > 0 && sel < P.length - 1);
    }
    const local = e => { const r = cv.getBoundingClientRect(), k = size / r.width; return [(e.clientX - r.left) * k, (e.clientY - r.top) * k]; };
    /** What is under the pointer: { i, part: 'a' (anchor) | 'in' | 'out' }. */
    function hitAt(px, py) {
      let best = null; const near = (x, y, what) => { const d = Math.hypot(px - gx(x), py - gy(y)); if (d < 11 && (!best || d < best.d)) best = Object.assign({ d }, what); };
      P.forEach((p, i) => { if (i > 0) near(p[2], p[3], { i, part: 'in' }); if (i < P.length - 1) near(p[4], p[5], { i, part: 'out' }); if (i > 0 && i < P.length - 1) near(p[0], p[1], { i, part: 'a' }); });
      if (best && best.part !== 'a') { const a = P[best.i]; if (Math.hypot(px - gx(a[0]), py - gy(a[1])) < 7 && best.i > 0 && best.i < P.length - 1) best.part = 'a'; }
      return best;
    }
    cv.addEventListener('pointerdown', e => {
      const [px, py] = local(e), hit = hitAt(px, py); if (!hit) { sel = -1; draw(); return; }
      e.preventDefault(); cv.setPointerCapture(e.pointerId); sel = hit.i; const p = P[hit.i], lo = hit.i > 0 ? P[hit.i - 1][0] : 0, hi = hit.i < P.length - 1 ? P[hit.i + 1][0] : 1;
      const sp = span.slice(), mv = ev => {
        span = sp; const [qx, qy] = local(ev), x = ux(qx), y = U.clamp(uy(qy), -3, 4);
        if (hit.part === 'a') { const nx = U.clamp(x, lo + 0.01, hi - 0.01), dx = nx - p[0], dy = y - p[1]; p[0] = nx; p[1] = y; p[2] += dx; p[3] += dy; p[4] += dx; p[5] += dy; p[2] = U.clamp(p[2], lo, p[0]); p[4] = U.clamp(p[4], p[0], hi); }
        else {
          const j = hit.part === 'in' ? 2 : 4; p[j] = hit.part === 'in' ? U.clamp(x, lo, p[0]) : U.clamp(x, p[0], hi); p[j + 1] = y;
          if (p[6] && !ev.altKey && hit.i > 0 && hit.i < P.length - 1) { // a round point keeps its handles in line (Alt breaks them)
            const o = j === 2 ? 4 : 2, len = Math.hypot(p[o] - p[0], p[o + 1] - p[1]), dx = p[0] - p[j], dy = p[1] - p[j + 1], d = Math.hypot(dx, dy) || 1;
            p[o] = U.clamp(p[0] + dx / d * len, o === 2 ? lo : p[0], o === 2 ? p[0] : hi); p[o + 1] = p[1] + dy / d * len;
          }
        }
        apply(); draw();
      };
      const up = () => { cv.removeEventListener('pointermove', mv); cv.removeEventListener('pointerup', up); fit(); draw(); };
      cv.addEventListener('pointermove', mv); cv.addEventListener('pointerup', up); draw();
    });
    cv.addEventListener('dblclick', e => {
      const [px, py] = local(e), hit = hitAt(px, py);
      if (hit && hit.part === 'a') { P[hit.i][6] = P[hit.i][6] ? 0 : 1; sel = hit.i; apply(); draw(); return; } // round ↔ sharp
      const u = ux(px); if (u <= 0.01 || u >= 0.99) return;
      let i = 0; while (i < P.length - 2 && u > P[i + 1][0]) i++; const y = evalY(u), d = Math.min(u - P[i][0], P[i + 1][0] - u) / 3, s = (evalY(u + 0.002) - evalY(u - 0.002)) / 0.004;
      P.splice(i + 1, 0, [u, y, u - d, y - s * d, u + d, y + s * d, 1]); sel = i + 1; apply(); fit(); draw();
    });
    const removeSel = () => { if (sel > 0 && sel < P.length - 1) { P.splice(sel, 1); sel = -1; apply(); fit(); draw(); } };
    const onKey = e => { if ((e.key === 'Delete' || e.key === 'Backspace') && sel > 0 && !e.target.closest('input,textarea')) { e.preventDefault(); e.stopPropagation(); removeSel(); } };
    addEventListener('keydown', onKey, true);
    // play the stretch on the stage, over and over, while the pop-up is open
    const T0 = S.time;
    function startLoop() { if (!seg) return; const d = Math.max(0.15, seg[1] - seg[0]) * 1000, t0 = performance.now(); const step = now => { const u = ((now - t0) % (d + 450)) / d; dot = Math.min(1, u); SB.time.set(seg[0] + (seg[1] - seg[0]) * dot, true); draw(); loop = requestAnimationFrame(step); }; loop = requestAnimationFrame(step); playBtn.innerHTML = SB.icon('pause'); }
    function stopLoop() { cancelAnimationFrame(loop); loop = 0; dot = -1; playBtn.innerHTML = SB.icon('play'); draw(); }
    const playBtn = W.iconBtn('play', seg ? 'Play this part on the stage' : 'This is the last keyframe: its curve is used once another keyframe comes after it', () => loop ? stopLoop() : startLoop(), 'sm');
    const rm = W.btn('Remove point', removeSel, { cls: 'sm ghost', icon: 'trash', title: 'Remove the selected point (Delete)' });
    const box = h('div.cvp', null,
      h('div.cvp-head', null, h('b', null, keys.length > 1 ? `Curve · ${keys.length} keyframes` : 'Curve'), h('span.spacer'), playBtn),
      cv, h('p.cvp-tip', null, 'Double-click the curve to add a point, a point to make it sharp or round.'),
      h('div.cvp-presets', null, PRESETS.map(([n, v]) => h('button', { type: 'button', title: n, onclick: () => { P = U.deep(v); sel = -1; apply(); fit(); draw(); } }, n))),
      h('div.cvp-foot', null, rm, h('span.spacer'), W.btn('Reset', () => { saved.forEach(s => { s.k.e = s.e; if (s.bz) s.k.bz = s.bz; else delete s.k.bz; if (s.bzp) s.k.bzp = s.bzp; else delete s.k.bzp; if (s.ep != null) s.k.ep = s.ep; }); changed = false; SB.bump(); SB.dirty(); opt.onChange && opt.onChange(); SB.popover.close(); }, { cls: 'sm ghost' }), W.btn('Done', () => SB.popover.close(), { cls: 'sm primary' })));
    const [x, y] = opt.x != null ? [opt.x, opt.y] : SB.menu.lastXY || [innerWidth / 2, innerHeight / 2];
    // drag the pop-up around by its title bar
    const head = box.querySelector('.cvp-head'); head.title = 'Drag to move';
    head.addEventListener('pointerdown', e => { if (e.target.closest('button')) return; const p = box.closest('.pop'); if (!p) return; e.preventDefault(); head.setPointerCapture(e.pointerId); const r = p.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
      const mv = ev => { p.style.left = U.clamp(ev.clientX - dx, 0, innerWidth - 40) + 'px'; p.style.top = U.clamp(ev.clientY - dy, 0, innerHeight - 30) + 'px'; };
      const up = () => { head.removeEventListener('pointermove', mv); head.removeEventListener('pointerup', up); }; head.addEventListener('pointermove', mv); head.addEventListener('pointerup', up); });
    SB.popover.at(x, y, box, { cls: 'cvpop', onClose: () => { cancelAnimationFrame(loop); removeEventListener('keydown', onKey, true); if (seg) SB.time.set(T0); if (changed) { SB.commit(); SB.invalidate('timeline'); } } });
    fit(); draw(); if (seg) startLoop(); // nothing changes until you edit the curve
  }
  SB.curves = { open, PRESETS, fromEase };
})(window.SB);
