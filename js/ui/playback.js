/* Time and playback, recording motion by dragging, recording your voice,
   and the main animation loop that redraws the stage. */
'use strict';
(function (SB) {
  const U = SB.util, S = SB.state, TR = SB.tracks, tree = SB.tree;

  const Tm = SB.time = {
    /** Whole frames only (timeline in frames, with "Only whole frames" on). */
    locked: () => !!(S.tlFrames && S.frameLock),
    q(t) { const f = S.project.fps; return Tm.locked() ? Math.round(t * f + 1e-6) / f : t; },
    /** A layer's local time moved onto the nearest whole frame of the main timeline. */
    qLocal(o, lt) { if (!Tm.locked()) return lt; const m = tree.mainAt(o, lt); return lt + (Tm.q(m) - m); },
    /** Frame number shown in frame view (the first frame is 1). */
    frameNo: t => Math.round(t * S.project.fps + 1e-6) + 1,
    set(t, keepOverride) {
      S.time = U.clamp(Tm.q(t), 0, S.project.duration); if (!keepOverride) S.frameOverride = null;
      SB.media.sync(S.playing, true); SB.emit('time'); SB.dirty();
    },
    /** What plays: the whole timeline, or the open shot. */
    range() { const q = tree.ctx(); if (!q) return [0, S.project.duration]; const [a, b] = tree.span(q); return [tree.mainOf(q, a), Math.min(S.project.duration, tree.mainOf(q, b))]; },
    play() { if (S.playing) return; const [A, D] = Tm.range(); if (S.time >= D - 1e-3 || S.time < A) S.time = A; raw = S.time; S.frameOverride = null; S.playing = true; last = performance.now(); SB.media.sync(true, true); SB.emit('play'); },
    pause() { if (!S.playing) return; if (S.recording) return SB.record.stop(); S.playing = false; S.time = Tm.q(S.time); SB.media.sync(false); SB.emit('play'); SB.emit('time'); SB.invalidate('inspector'); },
    toggle() { S.playing ? Tm.pause() : Tm.play(); },
    step(dir) { Tm.pause(); Tm.set(Math.round(S.time * S.project.fps + dir) / S.project.fps); },
  };

  // ---------- record motion: drag a layer while it plays, the path becomes keyframes
  const R = SB.record = {
    start() {
      if (S.recording) return R.stop();
      SB.tool.set('select'); S.recording = true; if (S.time >= S.project.duration - 0.05) S.time = 0;
      SB.emit('record'); Tm.play(); SB.toast('Recording. Drag a layer, a bone or a controller knob to record it. Press R or Space to stop.');
    },
    stop() {
      if (!S.recording) return; const d = SB.tool.drag; if (d && d.rec) R.end(d);
      S.recording = false; S.playing = false; SB.media.sync(false); SB.emit('record'); SB.emit('play'); SB.dirty();
    },
    props: mode => mode === 'move' ? ['x', 'y'] : mode === 'scale' ? ['scale'] : ['rot'],
    /** Start recording a drag. d.o is the layer; d.recProps / d.rec0 name the values (bones: 'bone:<id>'),
        otherwise move/scale/rotate from d.mode and d.tr0. */
    begin(d) { d.rec = []; const props = d.recProps || R.props(d.mode), v = {}; props.forEach(p => v[p] = (d.rec0 || d.tr0)[p]); d.cur = v; d.o._live = Object.assign({}, v); d.rec.push(Object.assign({ t: tree.rawLocal(d.o) }, v)); },
    sample(d, vals) { d.cur = vals; d.o._live = Object.assign({}, vals); SB.bump(); },
    end(d) {
      const o = d.o; delete o._live; SB.tool.drag = null; SB.bump();
      const props = d.recProps || R.props(d.mode), s = d.rec.filter(x => x.t >= 0 && x.t <= o.dur).sort((a, b) => a.t - b.t).filter((x, i, a) => i === 0 || x.t > a[i - 1].t + 1e-4);
      if (s.length < 2) { if (d.cur) TR.setMany(o, d.cur); return SB.commit(); }
      o.rec = { props, samples: s.map(x => { const r = { t: U.r3(x.t) }; props.forEach(p => r[p] = U.r2(x[p])); return r; }), smooth: S.recSmooth };
      R.apply(o); SB.commit(); SB.toast('Motion recorded. Adjust smoothing in the panel.');
    },
    /** Turn recorded samples into a small set of keyframes (smoothed, then simplified). */
    apply(o) {
      const rec = o.rec; if (!rec || rec.samples.length < 2) return;
      const { props, samples } = rec, smooth = rec.smooth, fps = S.project.fps, t0 = samples[0].t, t1 = samples[samples.length - 1].t;
      let grid = [], j = 0;
      for (let t = t0; t <= t1 + 1e-9; t += 1 / fps) { while (j < samples.length - 2 && samples[j + 1].t < t) j++; const a = samples[j], b = samples[j + 1] || a, u = b.t > a.t ? U.clamp((t - a.t) / (b.t - a.t), 0, 1) : 0; const v = { t }; props.forEach(p => v[p] = U.lerp(a[p], b[p], u)); grid.push(v); }
      if (grid[grid.length - 1].t < t1 - 1e-6) grid.push(Object.assign({}, samples[samples.length - 1]));
      const rad = Math.round(smooth / 100 * fps * 0.6);
      if (rad > 0) { const sig = rad / 2, w = []; for (let k = -rad; k <= rad; k++) w.push(Math.exp(-(k * k) / (2 * sig * sig))); grid = grid.map((g, i) => { const v = { t: g.t }; props.forEach(p => { let sum = 0, ws = 0; for (let k = -rad; k <= rad; k++) { const q = grid[U.clamp(i + k, 0, grid.length - 1)]; sum += q[p] * w[k + rad]; ws += w[k + rad]; } v[p] = sum / ws; }); return v; }); }
      const eps = { x: 0.6 + smooth * 0.09, y: 0.6 + smooth * 0.09, rot: 0.3 + smooth * 0.04, scale: 0.002 + smooth * 0.0003 }; props.forEach(p => { if (!eps[p]) eps[p] = p.startsWith('bone:') ? eps.rot : eps.x; }); const n = grid.length, keep = new Uint8Array(n); keep[0] = keep[n - 1] = 1; const st = [[0, n - 1]];
      while (st.length) { const [a, b] = st.pop(); let mi = -1, md = 1; for (let i = a + 1; i < b; i++) { const u = (grid[i].t - grid[a].t) / (grid[b].t - grid[a].t); let dd = 0; for (const p of props) dd = Math.max(dd, Math.abs(grid[i][p] - U.lerp(grid[a][p], grid[b][p], u)) / eps[p]); if (dd > md) { md = dd; mi = i; } } if (mi >= 0) { keep[mi] = 1; st.push([a, mi], [mi, b]); } }
      const tol = TR.tol(); props.forEach(p => { if (o.tracks[p]) { o.tracks[p] = o.tracks[p].filter(k => k.t < t0 - tol || k.t > t1 + tol); if (!o.tracks[p].length) delete o.tracks[p]; } });
      grid.forEach((g, i) => { if (keep[i]) props.forEach(p => TR.put(o, p, g.t, p === 'scale' ? U.r3(g[p]) : U.r2(g[p]), 'spline')); });
    },
  };

  // ---------- voice recording from the playhead
  const Voice = SB.voice = {
    rec: null,
    async start() {
      if (!Voice.rec && SB.targets && !SB.targets.allows('audio')) return SB.targets.blocked('Sound');
      if (Voice.rec) return Voice.stop();
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) return SB.toast("This browser can't record audio here.");
      let stream; try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
      catch (e) { return SB.toast(e && e.name === 'NotAllowedError' ? 'Microphone access was blocked. Allow it for this page, then try again.' : 'Could not start the microphone.'); }
      const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'].find(m => MediaRecorder.isTypeSupported(m)) || '';
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : {}), chunks = [], t0 = S.time, started = performance.now();
      rec.ondataavailable = ev => { if (ev.data && ev.data.size) chunks.push(ev.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach(t => t.stop()); const dur = (performance.now() - started) / 1000; if (dur < 0.2 || !chunks.length) return SB.toast('Recording was too short.');
        const type = (rec.mimeType || mime || 'audio/webm').split(';')[0], ext = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm';
        try { const n = tree.all().filter(o => o.type === 'audio' && /^Voice/.test(o.name)).length + 1; const m = await SB.media.add(new Blob(chunks, { type }), `voice-${n}.${ext}`, 'audio'); tree.add(tree.make('audio', { name: `Voice ${n}`, mediaId: m.id, start: U.r3(t0), dur: U.r2(dur) })); SB.toast(`Voice ${n} added at ${U.r2(t0)}s.`); }
        catch (e) { SB.toast("Couldn't save the recording."); }
      };
      Voice.rec = { rec, started }; rec.start(250); if (!S.playing) Tm.play(); SB.emit('voice'); SB.toast('Recording your voice. Press the mic again to stop.');
    },
    stop() { if (!Voice.rec) return; const v = Voice.rec; Voice.rec = null; try { v.rec.stop(); } catch (e) {} if (S.playing) Tm.pause(); SB.emit('voice'); },
  };

  // ---------- main loop
  let last = 0, tick = 0, raw = 0; // raw: the running clock; with whole frames only, the playhead steps from frame to frame
  function loop(ts) {
    if (S.playing && !S.exporting) {
      const dt = Math.min(0.1, Math.max(0, (ts - last) / 1000)); if (Math.abs(raw - S.time) > 1.5 / S.project.fps) raw = S.time; raw += dt;
      S.time = Tm.locked() && !S.recording ? Math.floor(raw * S.project.fps + 1e-6) / S.project.fps : raw;
      const [A, D] = Tm.range();
      if (S.time >= D) {
        if (S.recording) { S.time = D; R.stop(); }
        else if (S.loop && !Voice.rec) { S.time = raw = A; SB.media.sync(true, true); } else { S.time = raw = D; S.playing = false; SB.media.sync(false); SB.emit('play'); }
      }
      const d = SB.tool.drag; if (S.recording && d && d.rec && d.cur) d.rec.push(Object.assign({ t: tree.rawLocal(d.o) }, d.cur));
      if (S.playing) SB.media.sync(true);
      if (++tick % 2 === 0) SB.emit('time'); SB.dirty();
    }
    last = ts;
    if (SB.takeDirty() && !S.exporting) { try { SB.view.draw(); } catch (e) { console.error(e); } }
    requestAnimationFrame(loop);
  }
  SB.startLoop = () => requestAnimationFrame(t => { last = t; loop(t); });
})(window.SB);
