/* Frames strip for the selected layer: thumbnails, hold lengths, add/duplicate/delete,
   playback mode, speed and onion skin. */
'use strict';
(function (SB) {
  const U = SB.util, S = SB.state, tree = SB.tree, h = U.h, W = SB.w, F = SB.frames;
  function thumb(cv, o, i) {
    const c = cv.getContext('2d'); c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, cv.width, cv.height);
    const def = SB.types.get(o.type), fr = o.frames[i]; if (!fr) return; const v = o.type === 'shape' && fr.shp && i !== o._sfi ? Object.assign({}, o, fr.shp) : o; let b = def.bounds(v, i); /* a shape frame shows its own shape */ b = b ? Object.assign({}, b) : U.emptyBox(); SB.paths.bounds(fr.strokes, b); if (!U.boxOk(b)) return;
    const bw = Math.max(1, b.x1 - b.x0), bh = Math.max(1, b.y1 - b.y0), s = Math.min(cv.width / bw, cv.height / bh) * 0.84;
    c.setTransform(s, 0, 0, s, cv.width / 2 - (b.x0 + bw / 2) * s, cv.height / 2 - (b.y0 + bh / 2) * s);
    try { if (def.draw) def.draw.call(def, c, v, fr, null, {}); SB.strokes.draw(c, fr.strokes); } catch (e) {}
  }
  let lastI = -2;
  function highlight() {
    const o = tree.sel(); if (!o || !SB.types.get(o.type).frames) return;
    const i = tree.inRange(o) ? F.index(o, tree.rawLocal(o)) : -1; if (i === lastI && !S.frameOverride) return; lastI = i;
    U.$$('#framesBar .th[data-fi]').forEach(b => b.classList.toggle('on', +b.dataset.fi === i));
  }
  /** Frame library: with Auto key on, picking a frame keys it at the playhead.
      Without it, an existing key at the playhead is changed, a layer with no frame keys
      just changes its frame, and otherwise the frame shows as a preview until you key it. */
  function pickFromLibrary(o, i, name) {
    const TR = SB.tracks, lt = tree.localTime(o), tr = o.tracks.frame;
    if (S.autoKey) { TR.put(o, 'frame', lt, i, 'hold'); S.frameOverride = null; SB.commit(); return SB.toast(`${name} keyed at ${U.r2(S.time)}s.`); }
    if (!TR.animated(o, 'frame')) { TR.setBase(o, 'frame', i); S.frameOverride = null; SB.commit(); return; }
    const k = TR.keyAt(tr, lt); if (k) { k.v = i; S.frameOverride = null; SB.commit(); return SB.toast(`Keyframe at ${U.r2(S.time)}s now shows ${name}.`); }
    S.frameOverride = { id: o.id, i }; SB.invalidate('frames'); SB.dirty();
    SB.toast(`Previewing ${name}. Press the keyframe button (or turn on Auto key) to keep it.`);
  }
  /** While recording a controller state, the picked frame becomes part of that state. */
  function pickForState(o, i) { SB.tracks.setBase(o, 'frame', i); S.frameOverride = { id: o.id, i }; SB.bump(); SB.invalidate('frames'); }
  // ---------- copy, paste, duplicate and reorder frames
  const sel = () => { const o = tree.sel(); return o && SB.types.get(o.type).frames ? o : null; };
  // several frames picked: Ctrl-click adds or takes out one, Shift-click picks every frame from the last one clicked
  let pick = { id: null, set: new Set(), anchor: null };
  const picked = o => pick.id === o.id ? [...pick.set].filter(i => i < o.frames.length).sort((a, b) => a - b) : [];
  /** The frames an action works on: the picked ones when frame i is one of them, else just i. */
  const targets = (o, i) => { const p = picked(o); return p.length > 1 && p.includes(i) ? p : [i]; };
  function clickPick(e, o, i) {
    if (pick.id !== o.id) pick = { id: o.id, set: new Set(), anchor: null };
    if (e.shiftKey && pick.anchor != null) { const [a, b] = [Math.min(pick.anchor, i), Math.max(pick.anchor, i)]; if (!(e.ctrlKey || e.metaKey)) pick.set.clear(); for (let k = a; k <= b; k++) pick.set.add(k); }
    else if (e.ctrlKey || e.metaKey) { if (pick.set.has(i)) pick.set.delete(i); else pick.set.add(i); pick.anchor = i; }
    else { pick.set = new Set([i]); pick.anchor = i; }
    U.$$('#framesBar .th[data-fi]').forEach(b => b.classList.toggle('picked', pick.set.size > 1 && pick.set.has(+b.dataset.fi)));
    return e.shiftKey || e.ctrlKey || e.metaKey;
  }
  /** Delete frames (indices): library keys that showed a deleted frame show the frame before it. */
  function deleteFrames(o, list) {
    if (list.length >= o.frames.length) { o.frames = [{ strokes: [] }]; renumberLib(o, () => 0); SB.commit(); F.go(o, 0); return; }
    const gone = new Set(list), keep = o.frames.map((f, k) => k).filter(k => !gone.has(k)), where = new Map(keep.map((old, now) => [old, now]));
    renumberLib(o, v => { let k = v; while (k > 0 && !where.has(k)) k--; return where.has(k) ? where.get(k) : 0; });
    o.frames = keep.map(k => o.frames[k]); pick.set.clear(); SB.commit(); F.go(o, Math.max(0, Math.min(list[0], o.frames.length) - 1));
    SB.toast(list.length > 1 ? `Deleted ${list.length} frames. The layer stays.` : 'Frame deleted. The layer stays.');
  }
  /** Move frames (indices, in order) so they sit together starting at place `to` (counted among the frames that stay). */
  function moveFrames(o, list, to) {
    const mv = new Set(list), rest = o.frames.map((f, k) => k).filter(k => !mv.has(k)); to = U.clamp(to, 0, rest.length);
    const order = rest.slice(0, to).concat(list, rest.slice(to)), where = new Map(order.map((old, now) => [old, now]));
    if (order.every((v, k) => v === k)) return;
    o.frames = order.map(k => o.frames[k]); renumberLib(o, v => where.has(v) ? where.get(v) : v);
    pick.set = new Set(list.map(k => where.get(k))); SB.commit(); F.go(o, where.get(list[0]));
  }
  function copyFrame(o = sel(), i) { if (!o) return; i = i ?? F.currentIndex(o); const list = targets(o, i); S.frameClip = { fr: U.deep(o.frames[list[0]]), frs: list.map(k => U.deep(o.frames[k])), type: o.type }; SB.toast(list.length > 1 ? `Copied ${list.length} frames. Paste them into any drawing’s frames.` : `Copied ${o.frames[i].name || 'frame ' + (i + 1)}. Paste it into any drawing’s frames.`); }
  /** Paste the copied drawing: 'after' the frame (a new frame) or 'over' it (replaces its drawing). */
  function pasteFrame(where = 'after', o = sel(), i) {
    if (!o) return; const c = S.frameClip; if (!c) return SB.toast('Copy a frame first (right-click a frame › Copy drawing).'); i = i ?? F.currentIndex(o);
    const fr = U.deep(c.fr); if (o.type !== c.type) { delete fr.text; delete fr.mediaId; }
    if (where === 'over') { o.frames[i] = Object.assign(fr, { name: o.frames[i].name || fr.name }); SB.commit(); SB.invalidate('frames'); return; }
    const all = (c.frs || [c.fr]).map(x => { const y = U.deep(x); if (o.type !== c.type) { delete y.text; delete y.mediaId; } return y; }), n = all.length;
    o.frames.splice(i + 1, 0, ...all); if (o.play === 'library') renumberLib(o, x => x > i ? x + n : x); SB.commit(); F.go(o, i + 1); void fr;
  }
  function dupFrame(o = sel(), i) {
    if (!o) return; i = i ?? F.currentIndex(o); const list = targets(o, i);
    if (list.length > 1) { const last = list[list.length - 1], copies = list.map(k => { const c = U.deep(o.frames[k]); if (c.name) c.name += ' copy'; return c; }); o.frames.splice(last + 1, 0, ...copies); if (o.play === 'library') renumberLib(o, x => x > last ? x + copies.length : x); SB.commit(); F.go(o, last + 1); return SB.toast(`Duplicated ${copies.length} frames.`); }
    if (i !== F.currentIndex(o)) F.go(o, i); F.act('dup');
  }
  /** Frame library keys point at frame numbers: keep them on the same drawings when frames move. */
  function renumberLib(o, map) { (o.tracks.frame || []).forEach(k => k.v = map(Math.round(k.v))); if (typeof o.frame === 'number') o.frame = map(o.frame); }
  function moveFrame(o, from, to) {
    if (from === to || to < 0 || to >= o.frames.length) return; const order = o.frames.map((f, k) => k), [f] = o.frames.splice(from, 1); o.frames.splice(to, 0, f);
    const [x] = order.splice(from, 1); order.splice(to, 0, x); const where = new Map(order.map((old, now) => [old, now])); renumberLib(o, v => where.has(v) ? where.get(v) : v);
    SB.commit(); F.go(o, to);
  }
  function frameMenu(e, o, i) {
    e.preventDefault(); const f = o.frames[i], n = o.frames.length;
    const many = targets(o, i).length;
    SB.menu.open(e.clientX, e.clientY, [{ head: many > 1 ? `${many} frames` : f.name || `Frame ${i + 1}` },
      { label: 'Copy drawing', kbd: 'Ctrl C', run: () => copyFrame(o, i) }, { label: 'Paste as a new frame after it', kbd: 'Ctrl V', disabled: !S.frameClip, run: () => pasteFrame('after', o, i) }, { label: 'Paste over this drawing', disabled: !S.frameClip, run: () => pasteFrame('over', o, i) },
      { label: 'Duplicate', kbd: 'Shift D', run: () => dupFrame(o, i) }, '-',
      { label: 'Move earlier', disabled: i === 0, run: () => moveFrame(o, i, i - 1) }, { label: 'Move later', disabled: i === n - 1, run: () => moveFrame(o, i, i + 1) },
      { label: 'Rename…', run: () => SB.dialog.prompt('Frame name', 'A short name helps when you pick frames with keyframes.', f.name || '').then(v => { if (v == null) return; v = v.trim().slice(0, 24); if (v) f.name = v; else delete f.name; SB.commit(); }) },
      { label: targets(o, i).length > 1 ? `Delete ${targets(o, i).length} frames` : 'Delete', kbd: 'Del', disabled: n < 2 && !f.strokes.length, run: () => deleteFrames(o, targets(o, i)) }, SB.frames.bakeable(o) && '-', SB.frames.bakeable(o) && { label: 'Bake morphs and moving lines into frames…', run: () => SB.menus.bakeFrames(o) }]);
  }
  /** Drag a thumbnail sideways to move the frame; a line shows where it goes. */
  function dragThumb(e, b, o, i) {
    if (e.button > 0 || e.target.closest('input')) return; const row = b.parentElement, x0 = e.clientX; let on = false, to = i, mark = null, ins0 = i;
    const thumbs = () => [...row.querySelectorAll('.th[data-fi]')];
    const mv = ev => {
      if (!on && Math.abs(ev.clientX - x0) < 6) return; if (!on) { on = true; b.classList.add('dragging'); mark = h('i.th-drop'); row.appendChild(mark); }
      const list = thumbs(), ins = list.filter(t => { const r = t.getBoundingClientRect(); return r.left + r.width / 2 < ev.clientX; }).length, rr = row.getBoundingClientRect();
      const x = ins < list.length ? list[ins].getBoundingClientRect().left - 4 : list[list.length - 1].getBoundingClientRect().right + 2; mark.style.left = (x - rr.left + row.scrollLeft) + 'px'; to = ins > i ? ins - 1 : ins; ins0 = ins;
    };
    const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); if (!on) return; b.classList.remove('dragging'); if (mark) mark.remove(); b._dragged = true; setTimeout(() => { b._dragged = false; }, 0);
      const list = targets(o, i); if (list.length > 1) return moveFrames(o, list, list.filter(k => k < ins0).length > 0 ? ins0 - list.filter(k => k < ins0).length : ins0); moveFrame(o, i, U.clamp(to, 0, o.frames.length - 1)); };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
  }
  // Ctrl+C / Ctrl+V / Ctrl+D act on frames right after you worked in the frames bar
  let fbFocus = false;
  addEventListener('pointerdown', e => { fbFocus = !!(e.target.closest && e.target.closest('#framesBar')); }, true);
  let fbPick = null; // the frame last clicked in the frames bar: Delete removes that frame, not the layer
  addEventListener('keydown', e => {
    if (fbFocus && (e.key === 'Delete' || e.key === 'Backspace') && !e.ctrlKey && !e.metaKey && !e.altKey && !(e.target.closest && e.target.closest('input,textarea'))) {
      const o = sel(); if (!o || !SB.types.get(o.type).frames || tree.locked(o)) return; e.preventDefault(); e.stopPropagation();
      const i = fbPick && fbPick.id === o.id && fbPick.i < o.frames.length ? fbPick.i : F.currentIndex(o);
      if (o.frames.length < 2 && !o.frames[0].strokes.length) return SB.toast('This is the only frame, and it is empty.');
      const pk = picked(o); deleteFrames(o, pk.length > 1 ? pk : [i]); fbPick = null; return;
    }
    if (!fbFocus || !(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || (e.target.closest && e.target.closest('input,textarea'))) return; const k = e.key.toLowerCase();
    if (k !== 'c' && k !== 'v' && k !== 'd') return; if (!sel()) return; e.preventDefault(); e.stopPropagation();
    if (k === 'c') copyFrame(); else if (k === 'v') pasteFrame('after'); else dupFrame();
  }, true);
  SB.panel('frames', () => {
    const fb = U.$('#framesBar'), o = tree.sel(); lastI = -2; fb.dataset.empty = o && SB.types.get(o.type).frames ? '0' : '1';
    if (!o) return fb.replaceChildren(h('div.fb-hint', null, 'Select a layer to see its frames. Draw a frame, add the next one, and they play in a loop.'));
    if (!SB.types.get(o.type).frames) return fb.replaceChildren(h('div.fb-hint', null, o.type === 'group' ? 'Groups have no frames. Select a layer inside.' : 'This layer has no frames.'));
    const lib = o.play === 'library', n = o.frames.length;
    const thumbs = o.frames.map((f, i) => {
      const cv = h('canvas', { width: 144, height: 92 }), name = h('span.fname', null, f.name || String(i + 1));
      const hold = lib ? null : W.num(F.hold(f), { min: 1, max: 99, label: `Frame ${i + 1} length`, change: v => { f.hold = U.clamp(Math.round(v), 1, 99); if (f.hold === 1) delete f.hold; SB.commit(); } });
      if (hold) { hold.className = 'hold'; hold.title = 'How many frames this drawing stays on screen'; hold.addEventListener('pointerdown', e => e.stopPropagation()); hold.addEventListener('click', e => e.stopPropagation()); }
      const b = h('button.th' + (pick.id === o.id && pick.set.size > 1 && pick.set.has(i) ? '.picked' : ''), { type: 'button', dataset: { fi: i }, title: (lib ? 'Show this frame at the playhead' : `Frame ${i + 1}. Double-click to rename.`) + ' Drag to reorder, right-click to copy, paste or duplicate. Ctrl-click or Shift-click picks several.' }, cv, name, hold);
      b.addEventListener('contextmenu', e => frameMenu(e, o, i)); b.addEventListener('pointerdown', e => dragThumb(e, b, o, i));
      let ev0 = null; b.addEventListener('click', e => { ev0 = e; }, true);
      b.onclick = () => {
        if (b._dragged) return; fbPick = { id: o.id, i }; if (clickPick(ev0 || {}, o, i)) return; // Ctrl / Shift: pick frames, don't jump
        if (!tree.inRange(o)) tree.goLocal(o, 0.0001);
        if (S.poseLink && S.poseLink.oid === o.id) { pickForState(o, i); return; }
        if (lib) pickFromLibrary(o, i, f.name || 'Frame ' + (i + 1));
        else F.go(o, i);
      };
      b.ondblclick = () => SB.dialog.prompt('Frame name', 'A short name helps when you pick frames with keyframes.', f.name || '').then(v => { if (v == null) return; v = v.trim().slice(0, 24); if (v) f.name = v; else delete f.name; SB.commit(); });
      setTimeout(() => thumb(cv, o, i), 0); return b;
    });
    fb.replaceChildren(
      h('div.fb-label', null, h('b', null, lib ? 'Frame library' : 'Frames'), h('span', null, o.name)),
      h('div.thumbs', null, ...thumbs, h('button.th.add', { type: 'button', title: 'Add a blank frame after this one', html: SB.icon('plus'), onclick: () => F.act('add') })),
      h('div.fb-tools', null,
        W.iconBtn('left', 'Previous frame (,)', () => F.act('prev'), 'sm'), W.iconBtn('right', 'Next frame (.)', () => F.act('next'), 'sm'),
        W.iconBtn('copy', 'Duplicate this frame', () => F.act('dup'), 'sm'), W.iconBtn('trash', 'Delete this frame', () => F.act('del'), 'sm'),
        h('span.vsep'),
        W.select(o.play, SB.PLAY_MODES, v => { o.play = v; if (v === 'library') o.frame = F.currentIndex(o); SB.commit(); }, 'How the frames play'),
        lib ? null : h('label', { title: 'Frames per second for this layer' }, W.num(o.fps, { min: 1, max: 60, label: 'Speed', change: v => { o.fps = U.clamp(v, 1, 60); SB.commit(); } }), 'fps'),
        W.iconBtn('onion', 'Onion skin: see the frames before and after', () => { S.onion = !S.onion; SB.prefs.save(); SB.invalidate('frames', 'timeline'); SB.dirty(); }, S.onion ? 'sm on' : 'sm'),
        h('span.hint', null, n > 1 ? (lib ? (S.autoKey ? 'Click a frame to key it at the playhead' : 'Click a frame to show it. Auto key or the key button keeps it') : `${U.r2((F.units(o) || n) / o.fps)}s ${o.play === 'loop' ? 'per loop' : 'long'}`) : 'Add frames to animate')));
    highlight();
  });
  SB.on('time', highlight);
  SB.framesBar = { refreshThumb() { SB.invalidate('frames'); }, copy: () => copyFrame(), paste: w => pasteFrame(w), dup: () => dupFrame(), move: moveFrame };
})(window.SB);
