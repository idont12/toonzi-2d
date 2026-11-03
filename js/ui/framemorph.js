/* Morphing between frames is set on a drawing's Frame keyframes (right-click › Morph to the next keyframe, js/ui/menus.js;
   played by js/model/frames.js and js/render/scene.js). This file adds "Morph between these": two or more selected shapes or drawings become one drawing
   whose frames are those shapes, keyed one after the other with Morph on. */
'use strict';
(function (SB) {
  const U = SB.util, S = SB.state, tree = SB.tree, X = SB.xf, G = SB.paths;
  /** Morph between the selected shapes or drawings: a new drawing with one frame per layer (in stage place, top layer first), the
      frames keyed {gap}s apart from the playhead with Morph on; the layers it was made from are hidden (still there). */
  function morphBetween(items = tree.selected(), gap = 1) {
    items = items.filter(o => o.type === 'shape' || o.type === 'draw'); if (items.length < 2) return SB.toast('Select two or more shapes or drawings to morph between them.');
    const order = tree.all(); items.sort((a, b) => order.indexOf(a) - order.indexOf(b));
    const lines = o => { const W0 = X.world(o); return (o.type === 'shape' ? [SB.types.get('shape').asPath(SB.scene.viewOf(o, tree.localTime(o)))] : []).concat(o.type === 'draw' ? SB.frames.current(o).strokes : (o.frames[0] || { strokes: [] }).strokes).map(st => G.transformStroke(st, W0)); };
    const frames = items.map(o => ({ strokes: lines(o), name: o.name }));
    const T = tree.make('draw', { name: 'Morph', x: 0, y: 0, frames, play: 'library', start: 0, dur: Math.max(S.project.duration, U.r3(S.time + gap * (items.length - 1) + gap)) });
    T.tracks.frame = items.map((o, i) => Object.assign({ t: U.r3(S.time + i * gap), v: i, e: 'hold' }, i < items.length - 1 ? { morph: 'smooth' } : null));
    items.forEach(o => o.hidden = true); tree.rootList().unshift(T); tree.reindex(); tree.select([T.id]); SB.commit();
    const ok = frames.slice(1).every((f, i) => SB.frames.morphPairs(frames[i].strokes, f.strokes));
    SB.toast(ok ? `Morph: ${items.length} shapes, one every ${gap}s from the playhead. Play to see it; change the timing in the frame keyframes, the length in Between frames.` : 'Made, but some shapes don’t match line for line, so those changes crossfade. Shapes morph best when they have the same number of parts (two shapes, or two drawings with as many lines).');
    return T;
  }
  SB.menus.extra.push((o, items) => { const sel = (items || tree.selected()).filter(x => x.type === 'shape' || x.type === 'draw'); return sel.length > 1 ? { label: 'Morph between these', run: () => morphBetween(sel) } : null; });
  SB.frameMorph = { morphBetween };
})(window.SB);
