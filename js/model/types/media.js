/* Image and video objects. The files themselves live in SB.media (js/io/media.js). */
'use strict';
(function (SB) {
  /** A big picture drawn small: a halved copy (and halved again…) close to the size it is drawn at, made once per size,
      so moving it around stays fast. Full pictures are used when drawn large, and for exports. */
  function scaled(m, c, w) {
    const el = m.el, nw = el.naturalWidth || el.width, nh = el.naturalHeight || el.height; if (!nw || SB.state.exporting) return el;
    const t = c.getTransform(), px = Math.hypot(t.a, t.b) * w; if (!(px > 0) || nw < px * 2 || nw < 512) return el;
    let lv = 0, cw = nw; while (cw / 2 >= px * 1.25 && cw / 2 >= 64) { cw /= 2; lv++; } if (!lv) return el;
    const mip = m._mip || (m._mip = {}); if (mip.src !== el) { m._mip = { src: el }; return scaled(m, c, w); }
    for (let k = 1; k <= lv; k++) if (!mip[k]) { const src = k > 1 ? mip[k - 1] : el, sw = k > 1 ? src.width : nw, sh = k > 1 ? src.height : nh, cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round(sw / 2)); cv.height = Math.max(1, Math.round(sh / 2)); const x = cv.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(src, 0, 0, cv.width, cv.height); mip[k] = cv; }
    return mip[lv];
  }
  const U = SB.util;
  function placeholder(c, o, label) {
    c.fillStyle = 'rgba(120,110,170,.15)'; c.fillRect(-o.w / 2, -o.h / 2, o.w, o.h);
    c.fillStyle = 'rgba(80,70,130,.6)'; c.font = `500 ${Math.max(16, o.h * 0.06)}px Lexend, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(label, 0, 0);
  }
  const box = o => ({ x0: -o.w / 2, y0: -o.h / 2, x1: o.w / 2, y1: o.h / 2 });
  const sizeFields = o => [
    { k: 'w', label: 'Width', type: 'num', anim: true, set: (o, v) => keepAspect(o, 'w', v) }, { k: 'h', label: 'Height', type: 'num', anim: true, set: (o, v) => keepAspect(o, 'h', v) },
    { k: 'keepAspect', label: 'Keep proportions', type: 'check' },
    { type: 'buttons', items: [{ label: 'Fit canvas', run: o => fitCanvas(o, Math.min) }, { label: 'Fill canvas', run: o => fitCanvas(o, Math.max) }] },
  ];
  function keepAspect(o, id, v) {
    const T = SB.tracks; if (!o.keepAspect) return T.set(o, id, v);
    const cw = T.now(o, 'w'), ch = T.now(o, 'h'), r = ch / (cw || 1);
    if (id === 'w') T.setMany(o, { w: v, h: U.r1(v * r) }); else T.setMany(o, { h: v, w: U.r1(v / (r || 1)) });
  }
  /** Speed without keyframes stretches the clip so it still shows the same part of the file. */
  function setSpeed(o, v) {
    const T = SB.tracks; v = U.clamp(v, 0.1, 4); if (T.animated(o, 'speed')) return T.set(o, 'speed', v);
    const old = T.base(o, 'speed') || 1; T.setBase(o, 'speed', v); if (!o.parts) o.dur = U.r3(Math.max(0.1, o.dur * old / v));
  }
  /** Is the layer holding a frame at the playhead? (showAt ≥ 0, or Paused from older projects) */
  const heldAt = o => { const T = SB.tracks, lt = SB.tree.localTime(o); return T.value(o, 'showAt', lt) >= 0 || !!T.value(o, 'paused', lt); };
  /** Hold a frame of the file from the playhead on (a key on showAt; -1 at 0 keeps the start playing). */
  function showFrame(o, sec) {
    const T = SB.tracks, lt = SB.tree.localTime(o); if (!T.animated(o, 'showAt') && lt > T.tol()) T.put(o, 'showAt', 0, -1, 'hold');
    T.put(o, 'showAt', lt, U.r3(Math.max(0, sec)), 'hold'); SB.media.sync(SB.state.playing, true); SB.dirty();
  }
  /** Freeze the frame at the playhead, or (when it holds) let it play on from here. */
  function holdHere(o, on) {
    const T = SB.tracks, tree = SB.tree; if (!tree.inRange(o)) return SB.toast('Move the playhead over the clip first.');
    const lt = tree.localTime(o);
    if (on) showFrame(o, SB.media.timeAt(o, lt));
    else { if (T.animated(o, 'showAt')) T.put(o, 'showAt', lt, -1, 'hold'); if (T.animated(o, 'paused')) T.put(o, 'paused', lt, false, 'hold'); }
    SB.commit(); SB.media.sync(SB.state.playing, true);
    SB.toast(on ? 'It holds this frame from here. Move on and press “Play on from here” to let it run again.' : 'It plays on from here, from where it stopped.');
  }
  /** A small pop-up to choose which frame of the video shows from the playhead. */
  function pickFrame(o, anchor) {
    const T = SB.tracks, tree = SB.tree, S = SB.state, h = U.h, W = SB.w, m = SB.media.get(o.mediaId); if (!tree.inRange(o)) return SB.toast('Move the playhead over the clip first.');
    if (!m || !isFinite(m.duration)) return SB.toast('The video is still loading.');
    const lt = tree.localTime(o), fps = S.project.fps, dur = m.duration, el = SB.media.elementFor(o); let v = SB.media.timeAt(o, lt), changed = false;
    const thumb = h('canvas.pf-thumb', { width: 240, height: 135 }), tc = thumb.getContext('2d'), lbl = h('b.pf-time');
    const paint = () => { if (!el || el.readyState < 2) return; const r = Math.min(240 / (el.videoWidth || 16), 135 / (el.videoHeight || 9)), w = (el.videoWidth || 16) * r, hh = (el.videoHeight || 9) * r; tc.clearRect(0, 0, 240, 135); tc.drawImage(el, (240 - w) / 2, (135 - hh) / 2, w, hh); };
    if (el) el.addEventListener('seeked', paint);
    const show = x => { v = U.clamp(x, 0, Math.max(0, dur - 1 / fps)); showFrame(o, v); changed = true; slider.value = v; lbl.textContent = `${U.r2(v)}s · frame ${Math.round(v * fps) + 1}`; };
    const slider = W.slider(v, { min: 0, max: U.r3(dur), step: U.r3(1 / fps), label: 'Frame of the video', input: show });
    const box = h('div.pf', null, h('div.cvp-head', null, h('b', null, 'Show a frame'), h('span.spacer'), lbl), thumb,
      h('div.pf-row', null, W.iconBtn('left', 'One frame back', () => show(v - 1 / fps), 'sm'), slider, W.iconBtn('right', 'One frame on', () => show(v + 1 / fps), 'sm')),
      h('p.hint', null, 'The video holds this frame from the playhead on. Later, “Play on from here” lets it run again.'),
      h('div.cvp-foot', null, h('span.spacer'), W.btn('Done', () => SB.popover.close(), { cls: 'sm primary' })));
    lbl.textContent = `${U.r2(v)}s · frame ${Math.round(v * fps) + 1}`;
    SB.popover(anchor, box, { onClose: () => { if (el) el.removeEventListener('seeked', paint); if (changed) { SB.commit(); SB.invalidate('inspector'); } } });
    show(v); paint();
  }
  SB.mediaOps = { holdHere, pickFrame, heldAt, showFrame };
  // the Hold / Play on button follows the playhead
  let lastHeld = null;
  SB.on('time', () => { const o = SB.tree.find(SB.state.sel); if (!o || (o.type !== 'video' && o.type !== 'audio') || SB.state.playing) return; const hd = SB.tree.inRange(o) && heldAt(o); if (hd !== lastHeld) { lastHeld = hd; SB.invalidate('inspector'); } });
  function fitCanvas(o, fn) {
    const T = SB.tracks, p = SB.state.project, w = T.now(o, 'w'), h = T.now(o, 'h'), f = fn(p.w / w, p.h / h);
    T.setMany(o, { w: Math.round(w * f), h: Math.round(h * f) }); if (!SB.tree.parentOf(o)) T.setMany(o, { x: p.w / 2, y: p.h / 2, scale: 1, rot: 0 }); SB.commit();
  }

  SB.types.add({
    id: 'image', label: 'Image', icon: 'image', color: '--c-image', visual: true, frames: true, fx: true,
    defaults: () => ({ w: 400, h: 300, keepAspect: true }),
    bounds: box,
    draw(c, o, fr) { const m = SB.media.get(fr.mediaId || o.mediaId); if (m && m.el) c.drawImage(scaled(m, c, o.w), -o.w / 2, -o.h / 2, o.w, o.h); else placeholder(c, o, 'Missing image'); },
    props: () => [['w', 'Width'], ['h', 'Height']],
    sections: o => [{ title: 'Image', fields: sizeFields(o).concat([
      { type: 'buttons', items: [{ label: 'Add images as frames', run: () => SB.io.pick('image/*', true, files => SB.io.imageFrames(files)) }, { label: 'Trace into a drawing', run: o => SB.ops.trace(o) }] },
    ]) }],
  });

  SB.types.add({
    id: 'video', label: 'Video', icon: 'video', color: '--c-video', visual: true, frames: true, fx: true,
    defaults: () => ({ w: 960, h: 540, keepAspect: true, inPoint: 0, volume: 1 }),
    bounds: box,
    draw(c, o) { const el = SB.media.elementFor(o); if (el && el.readyState >= 2) c.drawImage(el, -o.w / 2, -o.h / 2, o.w, o.h); else placeholder(c, o, SB.media.get(o.mediaId) ? 'Loading video' : 'Missing video'); },
    props: o => [['w', 'Width'], ['h', 'Height'], ['volume', 'Volume %'], ['speed', 'Speed %'], ['showAt', 'Held frame (s)']].concat(o.tracks && o.tracks.paused ? [['paused', 'Paused']] : []),
    /** Playback (speed, holding a frame, picking which frame shows) and sound, for video and audio layers. */
    mediaFields(o) {
      const m = SB.media.get(o.mediaId), T = SB.tracks, S = SB.state, vid = o.type === 'video', held = SB.tree.inRange(o) && heldAt(o), W = SB.w, h = U.h;
      const holdBtn = held ? W.btn('Play on from here', () => holdHere(o, false), { cls: 'sm', icon: 'play', title: 'From the playhead the clip plays again, from where it stopped' })
        : W.btn(vid ? 'Hold this frame' : 'Pause here', () => holdHere(o, true), { cls: 'sm', icon: 'pause', title: vid ? 'Freeze the picture at the playhead until you let it play on' : 'Stop the sound at the playhead until you let it play on' });
      const pickBtn = vid ? W.btn('Pick a frame…', e => pickFrame(o, e.currentTarget), { cls: 'sm', icon: 'image', title: 'Choose which frame of the video shows from the playhead' }) : null;
      const shown = held ? T.value(o, 'showAt', SB.tree.localTime(o)) : -1;
      return [{ title: 'Playback', fields: [
        { k: 'speed', label: 'Speed %', type: 'range', min: 10, max: 400, anim: true, set: (x, v) => setSpeed(x, v / 100), after: () => SB.media.sync(S.playing, true) },
        { type: 'custom', render: () => h('div.row.btns', null, holdBtn, pickBtn) },
        held && { type: 'note', text: shown >= 0 ? `Holding the frame at ${U.r2(shown)}s of the ${vid ? 'video' : 'file'} here.` : 'Paused here.' },
        m && isFinite(m.duration) && { type: 'note', text: `The file is ${U.r2(m.duration)}s long. At this speed the clip needs ${U.r2(Math.max(0, m.duration - (o.inPoint || 0)) / (T.base(o, 'speed') || 1))}s. Drag the clip's left end to trim its start.` },
      ] }, { title: vid ? 'Sound' : 'Audio', fields: [
        { k: 'volume', label: 'Volume', type: 'range', min: 0, max: 100, anim: true },
        vid ? { type: 'buttons', items: [{ label: o.soundSplit && SB.tree.find(o.soundSplit) ? 'Sound is on its own layer' : 'Split sound into its own layer', icon: 'audio', run: o => SB.ops.splitSound(o) }] } : null,
      ] }];
    },
    sections(o) { return [{ title: 'Video', fields: sizeFields(o) }].concat(this.mediaFields(o)); },
  });
})(window.SB);
