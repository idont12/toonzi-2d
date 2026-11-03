/* Bake into frames: a drawing's morphs and animated lines become plain frames of its frame library, picked with held
   Frame keyframes. Afterwards it plays the same with nothing computed: the in-betweens and line poses are frames you
   can redraw, reorder or export anywhere.
     SB.frames.bake(o, { morph: steps per morph (0 leaves morphs), lines: poses per line loop (0 leaves lines moving) })
   Returns { added } (frames made), or null when there was nothing to bake. */
'use strict';
(function (SB) {
  const U = SB.util, S = SB.state, TR = SB.tracks, F = SB.frames, LRATE = 12;
  const moving = f => !!(f && f.strokes.some(s => s.bs && s.bs.an && s.bs.an.k && s.bs.an.fz == null));
  /** strokes with every animated line held at line time T (its pose at that moment). */
  const freeze = (list, T) => list.map(s => { if (!(s.bs && s.bs.an && s.bs.an.k) || s.bs.an.fz != null) return U.deep(s); const c = U.deep(s); c.bs.an.fz = T; return c; });
  /** Can o be baked, and what would it bake? */
  F.bakeable = o => {
    if (!o || o.type !== 'draw' || !o.frames) return null;
    const lib = o.play === 'library', tr = (o.tracks && o.tracks.frame) || [];
    const morph = o.frames.length > 1 && (lib ? tr.some(k => k.morph) : !!(o.morph && o.morph.mode === 'morph'));
    return morph || SB.lineMotion(o) ? { morph, lines: SB.lineMotion(o) } : null;
  };
  F.bake = (o, opt = {}) => {
    const can = F.bakeable(o); if (!can) return null;
    const steps = can.morph ? Math.max(0, Math.round(opt.morph ?? 4)) : 0, N = can.lines ? Math.max(0, Math.round(opt.lines ?? 8)) : 0;
    if (!steps && !N) return null;
    const keep = S.frameOverride; S.frameOverride = null;
    const fps = Math.max(12, S.project.fps || 24), n0 = o.frames.length, src = o.frames, out = src.map(f => Object.assign({}, f)), made = new Map();
    const lineT = lt => SB.scene.lineMotion(o, SB.scene.viewOf(o, lt), lt).T;
    /** the frame for a signature, made the first time it is needed */
    const frameFor = (key, mk) => { if (made.has(key)) return made.get(key); const i = out.length; out.push(mk()); made.set(key, i); return i; };
    // poses in a line loop: pose j is the line at line time j / 12 (the same clock the exports use)
    const pose = lt => N ? Math.floor(lineT(lt) * LRATE + 1e-4) % N : 0, poseT = j => j / LRATE;
    if (N) src.forEach((f, i) => { if (moving(f)) out[i] = Object.assign({}, f, { strokes: freeze(f.strokes, poseT(0)) }); });
    const shown = lt => {
      const c = steps ? F.change(o, lt) : null;
      if (c && c.mode === 'morph') {
        const pairs = F.morphPairs(src[c.a].strokes, src[c.b].strokes), q = Math.round(U.clamp(c.u, 0, 1) * (steps + 1));
        if (pairs && q > 0 && q < steps + 1) {
          const mv = moving(src[c.a]) || moving(src[c.b]), j = mv ? pose(lt) : 0;
          return frameFor(`m${c.a}.${c.b}.${q}.${j}`, () => ({ name: `${c.a + 1}→${c.b + 1} ${Math.round(q / (steps + 1) * 100)}%${mv && N ? ' · pose ' + (j + 1) : ''}`, strokes: mv && N ? freeze(F.morphAt(pairs, q / (steps + 1)), poseT(j)) : U.deep(F.morphAt(pairs, q / (steps + 1))) }));
        }
        if (pairs) return lineFrame(q <= 0 ? c.a : c.b, lt);
      }
      return lineFrame(F.index(o, lt), lt);
    };
    const lineFrame = (fi, lt) => { if (!N || !moving(src[fi])) return fi; const j = pose(lt); return j === 0 ? fi : frameFor(`l${fi}.${j}`, () => ({ name: `${src[fi].name || 'Frame ' + (fi + 1)} · pose ${j + 1}`, strokes: freeze(src[fi].strokes, poseT(j)) })); };
    // sample the layer on every frame (and at each of its own keyframes) and key the frame shown whenever it changes
    const times = new Set(); for (let i = 0; i * (1 / fps) < o.dur - 1e-6; i++) times.add(+(i / fps).toFixed(6));
    ((o.tracks && o.tracks.frame) || []).forEach(k => { if (k.t >= 0 && k.t < o.dur) times.add(+k.t.toFixed(6)); });
    const keys = []; let last = -1;
    for (const t of [...times].sort((a, b) => a - b)) { const fi = shown(t); if (fi !== last) { keys.push([t, fi]); last = fi; } }
    S.frameOverride = keep && keep.id !== o.id ? keep : null;
    o.frames = out; o.play = 'library'; delete o.morph; o.tracks = o.tracks || {};
    o.tracks.frame = keys.map(([t, v]) => ({ t: Math.floor(t * 1000 + 1e-6) / 1000, v, e: 'hold' })); /* rounded down, so a key never lands after the frame it starts on */
    if (keys.length && keys[0][0] > 1e-6) o.tracks.frame.unshift({ t: 0, v: keys[0][1], e: 'hold' });
    SB.bump(); return { added: out.length - n0 };
  };
})(window.SB);
