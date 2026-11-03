/* Break apart: the outgoing layer (an "out" transition) or the whole screen (an interaction's screen transition)
   cracks into pieces that fly off, spin and fade. Controls: intensity (how many pieces, how far they fly),
   direction (where they fly: left, right, up, down, or out from the middle) and length.
   SB.breakFx.pieces(w, h, amt, dir, seed) cuts a w×h picture into triangles; SB.breakFx.draw(ctx, picture, pieces,
   u, amt, dir) draws them u (0…1) of the way through the break. The layer effect sets r.shatter, which
   js/render/scene.js draws with these pieces. Exports: video, images and the web page show it; Lottie, Unity,
   Godot, Blender and Rive can't (it is listed as left out). */
'use strict';
(function (SB) {
  const U = SB.util;
  const rnd = seed => { let s = (seed >>> 0) || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; };
  /** Triangles over a w×h picture: a jittered grid, each cell cut in two; each piece knows where it flies. */
  function pieces(w, h, amt = 0.5, dir = 'center', seed = 7) {
    const R = rnd(seed * 7919 + 13), n = Math.round(3 + U.clamp(amt, 0, 1) * 13), cols = Math.max(2, Math.round(n * Math.sqrt(w / Math.max(1, h)))), rows = Math.max(2, Math.round(n * Math.sqrt(h / Math.max(1, w))));
    const P = []; for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) { const edge = i === 0 || j === 0 || i === cols || j === rows; P.push([w * i / cols + (edge ? 0 : (R() - 0.5) * w / cols * 0.7), h * j / rows + (edge ? 0 : (R() - 0.5) * h / rows * 0.7)]); }
    const at = (i, j) => P[j * (cols + 1) + i], out = [], reach = Math.hypot(w, h) * (0.35 + amt * 0.65);
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const a = at(i, j), b = at(i + 1, j), c = at(i + 1, j + 1), d = at(i, j + 1), flip = R() < 0.5;
      for (const tri of flip ? [[a, b, c], [a, c, d]] : [[a, b, d], [b, c, d]]) {
        const cx = (tri[0][0] + tri[1][0] + tri[2][0]) / 3, cy = (tri[0][1] + tri[1][1] + tri[2][1]) / 3;
        let vx, vy, delay;
        if (dir === 'center') { const dx = cx - w / 2, dy = cy - h / 2, L = Math.hypot(dx, dy) || 1; vx = dx / L; vy = dy / L; delay = (L / Math.hypot(w / 2, h / 2)) * 0.35; }
        else { vx = dir === 'left' ? -1 : dir === 'right' ? 1 : 0; vy = dir === 'up' ? -1 : dir === 'down' ? 1 : 0; const along = dir === 'left' ? cx / w : dir === 'right' ? 1 - cx / w : dir === 'up' ? cy / h : 1 - cy / h; delay = along * 0.4; }
        const spread = 0.45 + R() * 0.55; out.push({ tri, cx, cy, vx: (vx + (R() - 0.5) * 0.6) * reach * spread, vy: (vy + (R() - 0.5) * 0.6) * reach * spread, spin: (R() - 0.5) * (2 + amt * 6), delay });
      }
    }
    return out;
  }
  /** Draw the picture broken u (0…1) of the way. */
  function draw(ctx, img, list, u, amt = 0.5) {
    const g = 0.6 + amt; // pieces also fall a little
    for (const p of list) {
      const t = U.clamp((u - p.delay) / Math.max(0.05, 1 - p.delay), 0, 1); if (t >= 1) continue; const e = t * t, a = 1 - t * t * t;
      if (a <= 0.01) continue; ctx.save(); ctx.globalAlpha *= a;
      ctx.translate(p.cx + p.vx * e, p.cy + p.vy * e + g * 120 * e * e); ctx.rotate(p.spin * e); ctx.translate(-p.cx, -p.cy);
      const [A, B, C] = p.tri; ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.lineTo(C[0], C[1]); ctx.closePath(); ctx.clip(); ctx.drawImage(img, 0, 0); ctx.restore();
    }
  }
  // pieces are cut once per picture size and settings
  const cache = new Map();
  function cut(key, w, h, amt, dir, seed) { const k = [key, Math.round(w), Math.round(h), amt, dir].join('|'); let p = cache.get(k); if (!p) { if (cache.size > 40) cache.clear(); p = pieces(w, h, amt, dir, seed); cache.set(k, p); } return p; }
  SB.breakFx = { pieces, draw, cut };

  // the layer effect: a transition out that breaks the layer apart
  SB.effect({ id: 'breakOut', label: 'Break apart', cat: 'out', defaultDur: 0.9,
    params: { dur: Object.assign({}, SB.FX_PARAMS.dur), amt: { label: 'Intensity', min: 0.05, max: 1, step: 0.05, def: 0.5 }, dir: { label: 'Direction', options: { center: 'From the middle', left: 'Left', right: 'Right', up: 'Up', down: 'Down' }, def: 'center' } },
    apply(r, x) { const u = 1 - x.u; if (u > 0) r.shatter = { u, amt: x.e.amt ?? 0.5, dir: x.e.dir || 'center', seed: x.seed || 7, id: x.o && x.o.id }; } });
})(window.SB);
