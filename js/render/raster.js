/* Pixel-based helpers: the fill bucket, outline tracing, picking strokes. */
'use strict';
(function (SB) {
  const U = SB.util, G = SB.paths;

  /** Marching squares: closed outlines of a 0/1 mask, in pixel coordinates. */
  function traceMask(m, W, H) {
    const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? 0 : m[y * W + x];
    const nb = new Map(), add = (a, b) => { let l = nb.get(a); if (!l) nb.set(a, l = []); l.push(b); l = nb.get(b); if (!l) nb.set(b, l = []); l.push(a); };
    for (let y = -1; y < H; y++) for (let x = -1; x < W; x++) {
      const cs = at(x, y) * 8 + at(x + 1, y) * 4 + at(x + 1, y + 1) * 2 + at(x, y + 1); if (cs === 0 || cs === 15) continue;
      const T = 'h' + x + ',' + y, R = 'v' + (x + 1) + ',' + y, B = 'h' + x + ',' + (y + 1), L = 'v' + x + ',' + y;
      switch (cs) { case 1: case 14: add(L, B); break; case 2: case 13: add(B, R); break; case 3: case 12: add(L, R); break; case 4: case 11: add(T, R); break; case 5: add(T, R); add(L, B); break; case 6: case 9: add(T, B); break; case 7: case 8: add(L, T); break; case 10: add(L, T); add(B, R); break; }
    }
    const pos = k => { const [x, y] = k.slice(1).split(',').map(Number); return k[0] === 'h' ? [x + 0.5, y] : [x, y + 0.5]; };
    const used = new Set(), loops = [];
    for (const start of nb.keys()) {
      if (used.has(start)) continue; const loop = []; let prev = null, cur = start;
      for (let guard = 0; guard < 2e6; guard++) { used.add(cur); loop.push(...pos(cur)); const next = nb.get(cur).find(n => n !== prev && !used.has(n)); if (next === undefined) break; prev = cur; cur = next; }
      if (loop.length >= 8) loops.push(loop);
    }
    return loops;
  }

  /** Paint a frame's lines into a canvas as a barrier map for the fill bucket: each line as it is drawn (its wobble and
      thin ends), in solid black, plus its middle line widened by the gap, so small openings still close. */
  function paintLines(c, strokes, gap, pass = 'all') { // pass 'look': the lines as drawn; 'gap': only the gap-closing middle lines
    c.lineCap = 'round'; c.lineJoin = 'round';
    for (const s of strokes) {
      if (s.f) continue;
      if (s.er) { c.globalCompositeOperation = 'destination-out'; c.strokeStyle = '#000'; c.lineWidth = s.s; SB.strokes.pathOf(c, s.pts); c.stroke(); continue; }
      c.globalCompositeOperation = 'source-over'; c.strokeStyle = '#000'; c.fillStyle = '#000';
      if (pass !== 'gap' && s.b && s.fc) { c.beginPath(); G.trace(c, s.subs); c.fill(s.fr === 'evenodd' ? 'evenodd' : 'nonzero'); }
      if (pass !== 'gap' && s.s > 0) { const bs = s.bs ? Object.assign({}, s.bs) : null; if (bs) delete bs.op; const solid = Object.assign({}, s, { tx: undefined, bs: bs || undefined, fc: null }); SB.strokes.draw(c, [solid], { tint: '#000' }); }
      if (pass !== 'look' && (gap > 0 || !(s.s > 0))) { c.lineWidth = (s.s > 0 ? s.s : 0) + gap * 2 + 0.5; /* the gap reaches past the line's own edge, however thick it is */ c.strokeStyle = '#000'; if (s.b) { c.beginPath(); G.trace(c, s.subs); c.stroke(); } else { SB.strokes.pathOf(c, s.pts); c.stroke(); } }
    }
    c.globalCompositeOperation = 'source-over';
  }

  /** Flood fill at point l inside a frame's lines. Returns { loops } or { err: 'open'|'line'|'empty' }. */
  function fillAt(fr, l, gap, res = 900) {
    const lines = fr.strokes.filter(s => !s.f && !s.er);
    const b = G.bounds(lines); if (!U.boxOk(b)) return { err: 'empty' };
    U.growBox(b, l.x, l.y); const pad = 30 + gap * 2; b.x0 -= pad; b.y0 -= pad; b.x1 += pad; b.y1 += pad;
    const bw = b.x1 - b.x0, bh = b.y1 - b.y0, k = Math.min(2, res / Math.max(bw, bh)), W = Math.ceil(bw * k) + 2, H = Math.ceil(bh * k) + 2;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const c = cv.getContext('2d', { willReadFrequently: true });
    c.setTransform(k, 0, 0, k, -b.x0 * k + 1, -b.y0 * k + 1); paintLines(c, fr.strokes, gap, 'look');
    const N = W * H, vis = new Uint8Array(N), bar = new Uint8Array(N); { const d = c.getImageData(0, 0, W, H).data; for (let i = 0; i < N; i++) vis[i] = d[i * 4 + 3] > 60 ? 1 : 0; } // the lines as you see them
    paintLines(c, fr.strokes, gap, 'gap'); { const d = c.getImageData(0, 0, W, H).data; for (let i = 0; i < N; i++) bar[i] = d[i * 4 + 3] > 60 ? 1 : 0; } // plus the gaps closed
    const sx = Math.round((l.x - b.x0) * k + 1), sy = Math.round((l.y - b.y0) * k + 1);
    if (sx < 0 || sy < 0 || sx >= W || sy >= H || vis[sy * W + sx]) return { err: 'line' };
    if (bar[sy * W + sx]) return gap > 0 ? Object.assign(fillAt(fr, l, 0, res), { gap: 0 }) : { err: 'line' }; // a click in a corner too small for "Close gaps": fill just that little space, with no gap closing
    const reg = new Uint8Array(N), st = [sy * W + sx]; reg[sy * W + sx] = 1; let open = false;
    while (st.length) { const i = st.pop(), x = i % W, y = (i / W) | 0; if (x <= 1 || y <= 1 || x >= W - 2 || y >= H - 2) { open = true; break; } for (const j of [i - 1, i + 1, i - W, i + W]) if (!reg[j] && !bar[j]) { reg[j] = 1; st.push(j); } }
    if (open) return { err: 'open' };
    const avgW = lines.reduce((a, s) => a + (s.s || 0) * (1 + 2 * ((s.bs && s.bs.jit) || 0)), 0) / Math.max(1, lines.length), r = U.clamp(Math.round((gap + avgW * 0.55) * k), 1, 18); // tuck under the lines (and their wobble) up to their middle
    const grow = (n, ok) => { for (let it = 0; it < n; it++) { const add = []; for (let i = W; i < N - W; i++) if (!reg[i] && ok(i) && (reg[i - 1] || reg[i + 1] || reg[i - W] || reg[i + W])) add.push(i); add.forEach(i => reg[i] = 1); } };
    if (gap > 0) notches(reg, vis, W, H, Math.max(6, Math.round((gap * 8 + avgW * 3) * k)), Math.max(3, Math.round((gap + avgW / 2 + 1.5) * k)));
    grow(Math.max(1, Math.round((gap + 1) * k)), i => bar[i] && !vis[i]); // across the closed gaps to the line
    grow(r, i => vis[i]); // then under the line as it is drawn (its wobble, its thin ends), never past it
    const loops = traceMask(reg, W, H).map(L => G.rdp(L.map((v, i) => (v + 0.5 - 1) / k + (i % 2 ? b.y0 : b.x0)), 0.6 / k, true)).filter(L => L.length >= 6);
    return loops.length ? { loops } : { err: 'open' };
  }

  /** Narrow corners and notches beside a fill, that only the gap closing kept out: take them in. Everything reachable from the fill
      without crossing a drawn line is looked at in pieces; a piece is a notch (taken in) when none of it is farther than dMax from the
      fill. A piece that goes farther leads through a gap to somewhere else (outside, or another area), so it stays out. */
  function notches(reg, vis, W, H, dMax, near) { // near: a thin sliver (every pixel this close to a drawn line) is a notch however long it is
    const N = W * H, dist = new Int32Array(N).fill(-1), q = new Int32Array(N); let qh = 0, qt = 0;
    for (let i = 0; i < N; i++) if (reg[i]) { dist[i] = 0; q[qt++] = i; }
    while (qh < qt) { const i = q[qh++], x = i % W, y = (i / W) | 0; if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) continue; for (const j of [i - 1, i + 1, i - W, i + W]) if (dist[j] < 0 && !vis[j]) { dist[j] = dist[i] + 1; q[qt++] = j; } }
    const dl = new Int32Array(N).fill(-1); qh = qt = 0; // distance to the nearest drawn line, up to near
    if (near) { for (let i = 0; i < N; i++) if (vis[i]) { dl[i] = 0; q[qt++] = i; } while (qh < qt) { const i = q[qh++], x = i % W, y = (i / W) | 0; if (dl[i] >= near || x < 1 || y < 1 || x >= W - 1 || y >= H - 1) continue; for (const j of [i - 1, i + 1, i - W, i + W]) if (dl[j] < 0) { dl[j] = dl[i] + 1; q[qt++] = j; } } }
    const seen = new Uint8Array(N), part = [];
    for (let s0 = 0; s0 < N; s0++) {
      if (seen[s0] || reg[s0] || dist[s0] < 0) continue; part.length = 0; let far = false; const st = [s0]; seen[s0] = 1;
      while (st.length) { const i = st.pop(), x = i % W, y = (i / W) | 0; part.push(i); if ((dist[i] > dMax && !(near && dl[i] >= 0 && dist[i] <= dMax * 6)) || x < 2 || y < 2 || x >= W - 2 || y >= H - 2) far = true;
        for (const j of [i - 1, i + 1, i - W, i + W]) if (j >= 0 && j < N && !seen[j] && !reg[j] && dist[j] >= 0) { seen[j] = 1; st.push(j); } }
      if (!far) for (const i of part) reg[i] = 1;
    }
  }
  const inPath = (build, x, y, rule) => { const p = new Path2D(); build(p); U.measureCtx.setTransform(1, 0, 0, 1, 0, 0); return U.measureCtx.isPointInPath(p, x, y, rule); };
  /** Top-most stroke at local point l (lines within tol, fills and filled paths by area). */
  function strokeAt(fr, l, tol) {
    for (let i = fr.strokes.length - 1; i >= 0; i--) {
      const s = fr.strokes[i]; if (s.er) continue;
      if (s.f) { if (inPath(p => s.loops.forEach(L => SB.strokes.polyPath(p, L, true)), l.x, l.y, 'evenodd')) return s; continue; }
      const t = Math.max(tol, (s.s || 0) / 2);
      for (const p of G.lines(s)) {
        if (p.length === 2 && Math.hypot(p[0] - l.x, p[1] - l.y) < t) return s;
        for (let j = 2; j < p.length; j += 2) if (U.distSeg2(l.x, l.y, p[j - 2], p[j - 1], p[j], p[j + 1]) < t * t) return s;
      }
      if (s.b && s.fc && inPath(p => G.trace(p, s.subs), l.x, l.y, s.fr === 'evenodd' ? 'evenodd' : 'nonzero')) return s;
    }
    return null;
  }

  // Fills remember where they were clicked and which lines surround them, so they refill when lines move.
  function linkFill(fr, f) {
    const fb = G.bounds([f]), ids = [];
    for (const s of fr.strokes) { if (s.f || s.er) continue; const sb = G.bounds([s]), m = (s.s || 0) + (f.gap || 0) * 2 + 4; if (sb.x1 + m >= fb.x0 && sb.x0 - m <= fb.x1 && sb.y1 + m >= fb.y0 && sb.y0 - m <= fb.y1) { if (!s.id) s.id = U.uid(); ids.push(s.id); } }
    f.links = ids;
  }
  function refreshFills(fr, changed, quick) {
    const ids = new Set([...changed].map(s => s.id).filter(Boolean)); if (!ids.size) return 0; let n = 0;
    for (const f of fr.strokes) {
      if (!f.f || !f.seed || !f.links || changed.has(f) || !f.links.some(id => ids.has(id))) continue;
      const r = fillAt(fr, { x: f.seed[0], y: f.seed[1] }, f.gap ?? SB.state.fillGap, quick ? 360 : 900);
      if (r.loops) { f.loops = r.loops; G.touch(f); n++; if (!quick) linkFill(fr, f); }
    }
    return n;
  }

  SB.raster = { traceMask, fillAt, strokeAt, linkFill, refreshFills, paintLines };
})(window.SB);
