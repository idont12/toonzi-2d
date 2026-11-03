/* Object types: drawing, shape, group, audio.
   A type definition:
     id, label, icon, color (CSS var name)
     defaults(project)       extra fields for new objects
     visual / frames / fx    capabilities (shown on stage / has frames / takes effects)
     bounds(o, frameIndex)   box in the object's own coordinates
     draw(ctx, view, frame, fxState)  draw the content (frame strokes are drawn after, by the scene)
     sections(o)             inspector sections (see js/ui/fields.js for the field format)
     props(o)                animatable properties listed in the timeline (besides transform) */
'use strict';
(function (SB) {
  const U = SB.util, G = SB.paths;
  // The shapes you can add. 'triangle' is the Polygon (o.sides points, 3 by default); a star has o.sides points too.
  SB.SHAPES = { rect: 'Rectangle', round: 'Rounded box', ellipse: 'Circle', triangle: 'Polygon', star: 'Star', arrow: 'Arrow' };
  SB.SHAPE_ICONS = { rect: 'sRect', round: 'sRound', ellipse: 'sEllipse', triangle: 'sTriangle', star: 'sStar', arrow: 'sArrow', bubble: 'sBubble', line: 'sLine' };
  /** Every kind's name, the old ones too (speech bubble and line still draw in older projects; you can't add them now). */
  SB.SHAPE_NAMES = Object.assign({ bubble: 'Speech bubble', line: 'Line' }, SB.SHAPES);
  /** The kinds to pick from for shape o (its own old kind too, so the list shows what it is). */
  SB.shapeKinds = o => o && !SB.SHAPES[o.shape] && SB.SHAPE_NAMES[o.shape] ? Object.assign({}, SB.SHAPES, { [o.shape]: SB.SHAPE_NAMES[o.shape] }) : SB.SHAPES;
  /** How many points a polygon or a star has (3–60). */
  SB.shapeSides = o => U.clamp(Math.round(o.sides || (o.shape === 'star' ? 5 : 3)), 3, 60);
  SB.hasSides = o => !!o && (o.shape === 'triangle' || o.shape === 'star');

  SB.types.add({
    id: 'draw', label: 'Drawing', icon: 'draw', color: '--c-draw', visual: true, frames: true, fx: true,
    bounds(o) { const b = U.emptyBox(); o.frames.forEach(f => G.bounds(f.strokes, b)); return U.boxOk(b) ? b : null; },
    draw() {},
    defaults: () => ({ play: 'library' }), // new drawings hold each frame until a keyframe picks another
    // animated lines (brushes with Boil, Marching dashes, Pulse, Flow): their speed and amount can be keyframed per layer
    props: o => hasLineMotion(o) ? [['lnSp', 'Line motion speed %'], ['lnAmt', 'Line motion amount %']] : [],
    sections: o => hasLineMotion(o) ? [{ title: 'Line motion', fields: [{ type: 'note', text: 'Lines drawn with an animated brush move by themselves. Keyframe these to speed them up, slow them down or stop them (0%).' },
      { k: 'lnSp', label: 'Speed %', type: 'range', min: 0, max: 400, anim: true }, { k: 'lnAmt', label: 'Amount %', type: 'range', min: 0, max: 300, anim: true }] }] : [],
  });
  /** Does any frame of o have a line drawn with an animated brush? */
  function hasLineMotion(o) { return !!(o && o.frames && o.frames.some(f => f.strokes.some(s => s.bs && s.bs.an && s.bs.an.k && s.bs.an.fz == null))); } /* fz: held at one pose (baked into frames) */
  SB.lineMotion = hasLineMotion;

  SB.types.add({
    id: 'shape', label: 'Shape', icon: 'shape', color: '--c-shape', visual: true, frames: true, fx: true,
    defaults: () => ({ shape: 'round', radius: 18, w: 400, h: 260, fill: '#7B5CFF', fillOn: true, stroke: '#24213F', strokeW: 0, play: 'library' }), // frames hold until a keyframe picks another; each frame has its own shape (frames.js)
    asPath(v) { const line = v.shape === 'line'; return { b: 1, subs: G.shape(v.shape, v.w, v.h, v.radius, v.sides), c: v.stroke, s: line ? Math.max(1, v.strokeW || 6) : v.strokeW, fc: !line && v.fillOn ? v.fill : null, lj: 'round' }; },
    bounds(o) { return o.shape === 'line' ? { x0: -o.w / 2, y0: -Math.max(10, o.strokeW), x1: o.w / 2, y1: Math.max(10, o.strokeW) } : { x0: -o.w / 2, y0: -o.h / 2, x1: o.w / 2, y1: o.h / 2 }; },
    draw(c, v, fr, st, opt) { if (fr && fr.noBase) return; SB.strokes.draw(c, [this.asPath(v)], opt); }, // noBase: a morph already drew the outline
    props: o => [['w', 'Width'], ['h', 'Height'], ...(o && o.shape === 'round' ? [['radius', 'Corner roundness']] : []), ['fill', 'Fill'], ['stroke', 'Outline'], ['strokeW', 'Outline width']],
    sections: o => [{ title: 'Shape', fields: [
      { k: 'shape', label: 'Kind', type: 'select', options: SB.shapeKinds(o), rerender: true },
      ...(SB.hasSides(o) ? [{ k: 'sides', label: o.shape === 'star' ? 'Points' : 'Corners', type: 'num', min: 3, max: 60, step: 1, def: SB.shapeSides(o), set: (t, v) => { t.sides = U.clamp(Math.round(v), 3, 60); } }] : []),
      { k: 'w', label: 'Width', type: 'num', anim: true }, { k: 'h', label: 'Height', type: 'num', anim: true },
      ...(o.shape === 'round' ? [{ k: 'radius', label: 'Corners', type: 'range', min: 0, max: 50, anim: true, def: 18 }] : []),
      { k: 'fillOn', label: 'Fill', type: 'check', with: { k: 'fill', type: 'color', anim: true } },
      { k: 'stroke', label: 'Outline', type: 'color', anim: true, with: { k: 'strokeW', type: 'num', min: 0, max: 80, anim: true } },
      { type: 'buttons', items: [{ label: 'Convert to editable path', run: o => SB.ops.shapeToPath(o) }] },
    ] }],
  });

  SB.types.add({
    id: 'group', label: 'Group', icon: 'group', color: '--c-group', visual: true, frames: false, fx: true,
    defaults: () => ({ children: [], frames: [] }),
    bounds(o) {
      const b = U.emptyBox(), mk = o.children.find(c => c.isMask === 'in' && !c.hidden); // a group cut by a mask is as big as its mask
      for (const c of mk ? [mk] : o.children) {
        const cd = SB.types.get(c.type); if (!cd || !cd.visual || cd.render === false || c.hidden || (c.isMask && c !== mk)) continue;
        const lt = SB.tree.localTime(c), cb = SB.scene.bounds(c, lt); if (!cb) continue;
        const M = SB.xf.local(c, lt); for (const [x, y] of [[cb.x0, cb.y0], [cb.x1, cb.y0], [cb.x1, cb.y1], [cb.x0, cb.y1]]) { const q = M.transformPoint(U.pt(x, y)); U.growBox(b, q.x, q.y); }
      }
      return U.boxOk(b) ? b : null;
    },
    sections: o => o.seq ? [] : [{ title: 'Group', fields: [
      { type: 'note', text: `${o.children.length} layer${o.children.length === 1 ? '' : 's'}. Length follows the layers inside.` },
      { type: 'buttons', items: [{ label: 'Ungroup', run: o => SB.ops.ungroup(o) }, { label: 'Select layers inside', run: o => SB.tree.select(o.children.map(c => c.id)) }] },
    ] }],
  });

  SB.types.add({
    id: 'audio', label: 'Audio', icon: 'audio', color: '--c-audio', visual: false, frames: false, fx: false,
    defaults: () => ({ inPoint: 0, volume: 1, frames: [] }),
    bounds: () => null,
    props: o => [['volume', 'Volume %'], ['speed', 'Speed %'], ['showAt', 'Paused at (s)']].concat(o.tracks && o.tracks.paused ? [['paused', 'Paused']] : []),
    sections: o => SB.types.get('video').mediaFields(o),
  });
})(window.SB);
