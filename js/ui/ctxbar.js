/* The floating bar above the stage. It shows options for the active tool,
   or quick controls for the selected shape or text. */
'use strict';
(function (SB) {
  const U = SB.util, S = SB.state, TR = SB.tracks, tree = SB.tree, h = U.h, W = SB.w;
  // The bar scrolls sideways when its options don't fit: mouse wheel, drag, swipe, or the arrows.
  let inner;
  function arrows() { const bar = U.$('#ctxbar'); if (!inner) return; const max = inner.scrollWidth - inner.clientWidth; bar.classList.toggle('can-l', inner.scrollLeft > 2); bar.classList.toggle('can-r', inner.scrollLeft < max - 2); }
  function setup() {
    const bar = U.$('#ctxbar'); inner = h('div.ctx-in');
    const arrow = (cls, d, label) => h('button.cx-arrow.' + cls, { type: 'button', 'aria-label': label, html: SB.icon(d < 0 ? 'left' : 'right'), onclick: () => inner.scrollBy({ left: d * inner.clientWidth * 0.7, behavior: 'smooth' }) });
    bar.replaceChildren(arrow('l', -1, 'Scroll options left'), inner, arrow('r', 1, 'Scroll options right'));
    inner.addEventListener('scroll', arrows, { passive: true });
    bar.addEventListener('wheel', e => { e.preventDefault(); e.stopPropagation(); inner.scrollLeft += Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY; }, { passive: false });
    inner.addEventListener('pointerdown', e => { // drag empty space to scroll (mouse); touch scrolls natively
      if (e.pointerType !== 'mouse' || e.target.closest('button,input,select,label,canvas')) return;
      const x0 = e.clientX, s0 = inner.scrollLeft; inner.setPointerCapture(e.pointerId);
      const mv = ev => inner.scrollLeft = s0 - (ev.clientX - x0), up = () => { inner.removeEventListener('pointermove', mv); inner.removeEventListener('pointerup', up); };
      inner.addEventListener('pointermove', mv); inner.addEventListener('pointerup', up);
    });
    new ResizeObserver(arrows).observe(inner);
  }
  SB.panel('ctxbar', () => {
    if (!inner) setup(); const bar = U.$('#ctxbar'), t = SB.tool.cur();
    let items = [];
    if (SB.voice.rec) items = [h('span.lbl', { html: '<b>Recording your voice.</b> Use headphones so the soundtrack is not recorded.' }), W.btn('Stop', () => SB.voice.stop(), { cls: 'sm primary' })];
    else if (SB.board && SB.board.screenSelected() && t.id !== 'screen' && !tree.sel()) items = [].concat(SB.tools.get('screen').bar()).flat(3); // a screen picked (its name clicked): the Screens bar, with its size and background
    else if (t.bar) items = [].concat(t.bar()).flat(3);
    items = items.filter(Boolean).map(it => it.matches && it.matches('span.lbl') && !it.querySelector('b') && it.textContent.trim().length > 24 ? Object.assign(W.info(it.textContent.trim(), it.textContent.trim()), { className: 'info-btn bar-help' }) : it); // a tool's long description: a "?" that shows it on hover (and on click)
    bar.classList.toggle('rec', !!(S.recording || SB.voice.rec)); bar.classList.toggle('none', !items.length);
    if (!S.btnLabels) for (const it of items) for (const b of it.matches && it.matches('button.btn') ? [it] : it.querySelectorAll ? it.querySelectorAll('button.btn') : []) { // Settings › Button names off: buttons with an icon show only the icon (the name is in the tooltip)
      const sp = b.querySelector(':scope > span'); if (!sp || !b.querySelector(':scope > svg') || b.classList.contains('val') || sp.textContent.includes('▾')) continue; /* val / ▾: it shows a current choice, so it keeps its text */ b.classList.add('nolbl'); if (!b.title) b.title = sp.textContent; b.setAttribute('aria-label', sp.textContent); }
    const keep = inner.scrollLeft; inner.replaceChildren(...items); inner.scrollLeft = keep; requestAnimationFrame(arrows);
  });
  SB.on('select', () => SB.invalidate('ctxbar'));
  SB.on('commit', () => SB.invalidate('ctxbar'));

  const sameType = o => tree.selected().filter(x => x.type === o.type);
  /** Set a property on all selected layers of the same type. */
  const setAll = (o, id, v, anim) => { sameType(o).forEach(x => anim ? TR.set(x, id, v) : (x[id] = v)); SB.bump(); };
  const colorCtl = (o, id, label, after) => W.colorBtn(TR.now(o, id), { label, paint: true, input: v => { setAll(o, id, v, true); after && after(v); }, change: () => SB.commit() });
  const label = t => h('span.lbl', null, h('b', null, t));

  // ---------- recolor a whole drawing: every line, or every fill, on this frame or all frames
  S.recolorAll = S.recolorAll ?? true;
  function drawingParts(o, kind) {
    const out = [];
    for (const x of sameType(o)) for (const f of (S.recolorAll ? x.frames : [SB.frames.current(x)])) for (const st of f.strokes) {
      if (st.er) continue;
      if (kind === 'line' && !st.f && !(st.b && !st.s)) out.push([st, 'c']);
      if (kind === 'fill') { if (st.f) out.push([st, 'c']); else if (st.b && st.fc) out.push([st, 'fc']); }
    }
    return out;
  }
  const firstColor = (o, kind) => { const p = drawingParts(o, kind)[0]; return p ? p[0][p[1]] : null; };
  function drawBar(o) {
    const n = sameType(o).length, lines = drawingParts(o, 'line'), fills = drawingParts(o, 'fill'), base = new Map(lines.map(([st]) => [st, st.s]));
    const recolor = kind => c => { drawingParts(o, kind).forEach(([st, k]) => { st[k] = c; SB.paths.touch && SB.paths.touch(st); }); SB.bump(); };
    return [label(n > 1 ? `${n} drawings` : 'Drawing'),
      lines.length ? W.colorBtn(firstColor(o, 'line') || '#24213F', { label: 'Color of all lines', text: 'Lines', paint: true, input: recolor('line'), change: () => SB.commit() }) : null,
      fills.length ? W.colorBtn(firstColor(o, 'fill') || '#FFFFFF', { label: 'Color of all fills', text: 'Fills', paint: true, input: recolor('fill'), change: () => SB.commit() }) : null,
      lines.length ? SB.brushUI.styleBtn(() => drawingParts(o, 'line').map(([st]) => st).filter(st => !(st.b && !st.s)), { title: 'Line style: draw every line with another brush (they keep their colors and widths)' }) : null,
      lines.length ? W.popSlider('Line width', 100, { min: 10, max: 400, unit: '%', title: 'Make every line thinner or thicker', input: v => { base.forEach((s0, st) => { st.s = U.r1(Math.max(0.2, s0 * v / 100)); }); SB.bump(); }, change: () => SB.commit() }) : null,
      W.seg(S.recolorAll ? 'all' : 'frame', [['frame', 'This frame', 'Change only the frame you see'], ['all', 'All frames', 'Change every frame of the drawing']], v => { S.recolorAll = v === 'all'; SB.invalidate('ctxbar'); }),
      W.btn('Transform', e => frameTransform(e.currentTarget, o), { cls: 'sm', icon: 'scale', title: 'Scale, turn or flip the drawing of this frame (or all frames), or turn its lines into fills' }),
      h('span.vsep'), W.btn('Draw', () => SB.tool.set('brush'), { cls: 'sm ghost', icon: 'brush' }), W.btn('Edit points', () => SB.tool.set('points'), { cls: 'sm ghost', icon: 'points' })];
  }

  /** Change the drawing itself, not the layer: the strokes of this frame (or every frame, with All frames; or the selected parts with
      the Points tool) scaled, turned or flipped around their middle, or their lines turned into filled shapes. */
  function frameTransform(anchor, o) {
    const G = SB.paths, parts = S.tool === 'points' && S.selStrokes.size ? new Set(S.selStrokes) : null, frames = S.recolorAll && !parts ? o.frames : [SB.frames.current(o)];
    const pick = fr => fr.strokes.filter(s => !parts || parts.has(s)), snap = frames.map(fr => ({ fr, orig: fr.strokes.slice(), copies: fr.strokes.map(s => U.deep(s)) }));
    const b = U.emptyBox(); frames.forEach(fr => G.bounds(pick(fr), b)); if (!U.boxOk(b)) return SB.toast('Nothing drawn here yet.');
    const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2; let sc = 100, rot = 0, fx = 1, fy = 1, changed = false;
    const apply = () => {
      const M = new DOMMatrix().translateSelf(cx, cy).rotateSelf(rot).scaleSelf(sc / 100 * fx, sc / 100 * fy).translateSelf(-cx, -cy);
      snap.forEach(({ fr, orig, copies }) => { fr.strokes = orig.map((s, i) => !parts || parts.has(s) ? G.transformStroke(copies[i], M, sc / 100) : s); fr.strokes.forEach(G.touch); });
      if (parts) { S.selStrokes = new Set(snap.flatMap(({ fr, orig }) => fr.strokes.filter((s, i) => parts.has(orig[i])))); }
      changed = true; SB.bump();
    };
    const toFills = () => {
      let n = 0; frames.forEach(fr => { fr.strokes = fr.strokes.map(s => { if (parts && !parts.has(s)) return s;
        const out = G.outlineStroke(s, true); if (!out) return s; n++; if (s.b && s.fc) return [Object.assign(U.deep(s), { s: 0 }), out]; return out; }).flat(); fr.strokes.forEach(G.touch); });
      SB.commit(); SB.popover.close(); SB.toast(n ? `${n} line${n > 1 ? 's' : ''} turned into fills. Use Edit points to shape them.` : 'No lines to turn into fills here.');
    };
    const box = h('div.pop-col.ft-pop', null, h('div.cp-t', null, parts ? 'Transform the selected parts' : S.recolorAll ? 'Transform every frame' : 'Transform this frame'),
      W.row('Scale %', W.range(100, { min: 5, max: 400, label: 'Scale', input: v => { sc = v; apply(); } })),
      W.row('Turn °', W.range(0, { min: -180, max: 180, label: 'Rotation', input: v => { rot = v; apply(); } })),
      W.row('Flip', W.btn('Left–right', () => { fx = -fx; apply(); }, { cls: 'sm', icon: 'flipH' }), W.btn('Up–down', () => { fy = -fy; apply(); }, { cls: 'sm', icon: 'flipV' })),
      h('div.row.btns', null, W.btn('Lines → fills', toFills, { cls: 'sm', title: 'Turn every line into a filled shape of the same width (like Outline Stroke)' })),
      h('p.hint', null, 'Changes the drawing itself, not the layer. This frame / All frames in the bar picks which frames; with Edit points, only the selected parts.'));
    SB.popover(anchor, box, { onClose: () => { if (changed) SB.commit(); SB.invalidate('ctxbar'); } });
  }
  SB.frameTransform = frameTransform;
  SB.bars = {
    draw: drawBar,
    shape(o) {
      const n = sameType(o).length;
      return [label(n > 1 ? `${n} shapes` : 'Shape'),
        W.select(o.shape, SB.shapeKinds(o), v => { setAll(o, 'shape', v); SB.commit(); }, 'Shape kind'),
        SB.hasSides(o) ? W.popSlider(o.shape === 'star' ? 'Points' : 'Corners', SB.shapeSides(o), { min: 3, max: 20, step: 1, title: o.shape === 'star' ? 'How many points the star has' : 'How many corners the polygon has', input: v => { sameType(o).filter(x => x.shape === o.shape).forEach(x => x.sides = Math.round(v)); SB.bump(); }, change: () => SB.commit() }) : null, h('span.vsep'),
        W.check(o.fillOn, 'Fill', v => { setAll(o, 'fillOn', v); SB.commit(); }), colorCtl(o, 'fill', 'Fill color', () => sameType(o).forEach(x => x.fillOn = true)), h('span.vsep'),
        colorCtl(o, 'stroke', 'Outline color'), W.popSlider('Outline', TR.now(o, 'strokeW'), { min: 0, max: 40, title: 'Outline width', input: v => setAll(o, 'strokeW', v, true), change: () => SB.commit() })];
    },
    text(o) {
      const n = sameType(o).length;
      return [label(n > 1 ? `${n} texts` : 'Text'),
        W.select(o.font, Object.entries(SB.FONTS).map(([k, d]) => [k, d[4]]).concat((o.font || '').startsWith('g:') ? [[o.font, o.font.slice(2)]] : []), v => { setAll(o, 'font', v); SB.commit(); }, 'Font'),
        W.popSlider('Size', Math.round(TR.now(o, 'fontSize')), { min: 6, max: 400, title: 'Text size', input: v => setAll(o, 'fontSize', v, true), change: () => SB.commit() }),
        colorCtl(o, 'color', 'Text color'), h('span.vsep'),
        W.seg(o.talign || 'center', [['left', 'tLeft', 'Align left'], ['center', 'tCenter', 'Center'], ['right', 'tRight', 'Align right']], v => { setAll(o, 'talign', v); SB.commit(); }),
        W.seg(o.tdir || 'auto', [['auto', 'tAuto', 'Direction: automatic'], ['ltr', 'tLtr', 'Left to right'], ['rtl', 'tRtl', 'Right to left']], v => { setAll(o, 'tdir', v); SB.commit(); }),
        W.btn('Type', () => SB.textEdit.start(o), { cls: 'sm', title: 'Type on the stage (Enter)' })];
    },
  };
})(window.SB);
