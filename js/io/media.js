/* Media files (images, video, audio) used by the project.
   Each file is stored once by id; objects point at it with o.mediaId. */
'use strict';
(function (SB) {
  const U = SB.util, S = SB.state, tree = SB.tree;
  const files = {}, els = {};
  let ac = null;
  const audioCtx = () => (ac = ac || new (window.AudioContext || window.webkitAudioContext)());

  function load(el, m, evt) {
    return new Promise((res, rej) => {
      let tried = false;
      const ok = () => { off(); res(); };
      const bad = async () => { if (tried) { off(); rej(new Error(`Couldn't open ${m.name}. Try a different file format.`)); return; } tried = true; try { m.src = await U.blobToDataURL(m.blob); el.src = m.src; } catch (e) { off(); rej(e); } };
      const off = () => { el.removeEventListener(evt, ok); el.removeEventListener('error', bad); };
      el.addEventListener(evt, ok); el.addEventListener('error', bad); el.src = m.src;
    });
  }

  const M = SB.media = {
    all: () => Object.values(files),
    get: id => id && files[id],
    /** Store a file and load it. kind: 'image' | 'video' | 'audio' */
    async add(blob, name, kind, id) {
      id = id || U.uid();
      const m = { id, kind, name, blob, src: URL.createObjectURL(blob) };
      if (kind === 'image') { const img = new Image(); await load(img, m, 'load'); m.el = img; m.w = img.naturalWidth || 512; m.h = img.naturalHeight || 512; }
      else {
        const el = document.createElement(kind === 'video' ? 'video' : 'audio'); el.preload = 'metadata'; el.muted = true; el.playsInline = true;
        await load(el, m, 'loadedmetadata');
        m.duration = isFinite(el.duration) ? el.duration : NaN; m.w = el.videoWidth || 0; m.h = el.videoHeight || 0;
        M.decode(m).then(() => { M.waveform(m); SB.invalidate('timeline'); }).catch(() => {});
      }
      files[id] = m; return m;
    },
    clear() { for (const id in els) { els[id].pause(); els[id].remove(); delete els[id]; } for (const id in files) { try { URL.revokeObjectURL(files[id].src); } catch (e) {} delete files[id]; } },
    /** Ids of media still used by the project (for saving). */
    /** Media used anywhere in the project (every screen). */
    used() {
      const u = new Set(), scan = (p, list) => { if (p && p.bgImage) u.add(p.bgImage); tree.all(list).forEach(o => { if (o.mediaId) u.add(o.mediaId); (o.frames || []).forEach(f => f.mediaId && u.add(f.mediaId)); }); };
      scan(S.project, S.objects); (S.screens || []).forEach(s => { if (s.objects !== S.objects) scan(s.proj, s.objects || []); }); return u;
    },
    decode(m) {
      if (m.buffer) return Promise.resolve(m.buffer);
      if (m.noAudio) return Promise.reject(new Error('no audio'));
      if (!m.decoding) m.decoding = (async () => {
        const ab = await m.blob.arrayBuffer();
        try { m.buffer = await new Promise((res, rej) => audioCtx().decodeAudioData(ab, res, rej)); } catch (e) { m.noAudio = true; throw e; }
        if (!isFinite(m.duration)) m.duration = m.buffer.duration;
        return m.buffer;
      })();
      return m.decoding;
    },
    waveform(m) {
      if (!m.buffer) return;
      const cols = 900, H = 56, d = m.buffer.getChannelData(0), step = Math.max(1, Math.floor(d.length / cols));
      const cv = document.createElement('canvas'); cv.width = cols; cv.height = H; const c = cv.getContext('2d');
      c.fillStyle = m.kind === 'audio' ? 'rgba(30,158,90,.55)' : 'rgba(135,82,240,.45)';
      let peak = 1e-4; const vals = [];
      for (let i = 0; i < cols; i++) { let mx = 0; for (let j = i * step, e = Math.min(d.length, j + step); j < e; j += 4) { const v = Math.abs(d[j]); if (v > mx) mx = v; } vals.push(mx); if (mx > peak) peak = mx; }
      vals.forEach((v, i) => { const h = Math.max(1, v / peak * (H - 6)); c.fillRect(i, (H - h) / 2, 1, h); });
      m.wave = cv.toDataURL();
    },
    /** The <video>/<audio> element that plays an object. */
    elementFor(o) {
      const m = files[o.mediaId]; if (!m) return null;
      let el = els[o.id]; if (el && el._mid === o.mediaId) return el;
      if (el) { el.pause(); el.remove(); }
      el = document.createElement(o.type === 'video' ? 'video' : 'audio');
      el._mid = o.mediaId; el.preload = 'auto'; el.playsInline = true; el.src = m.src;
      el.addEventListener('seeked', SB.dirty); el.addEventListener('loadeddata', SB.dirty);
      U.$('#avpool').appendChild(el); els[o.id] = el; return el;
    },
    prune() { for (const id in els) if (!tree.find(id)) { els[id].pause(); els[id].remove(); delete els[id]; } },
    pauseAll() { for (const id in els) els[id].pause(); },
    /** Where in the file a video or audio layer is at its local time lt: trim start, speed and pauses
        (Speed % can be keyframed and eases like any value; showAt keys hold one frame of the file, -1 plays on). */
    timeAt(o, lt) {
      const ip = o.inPoint || 0, T = SB.tracks, sp = o.tracks && o.tracks.speed, pz = o.tracks && o.tracks.paused, sa = o.tracks && o.tracks.showAt;
      const shown = T.value(o, 'showAt', lt); if (shown >= 0) return shown; // a held or picked frame (seconds into the file)
      if (!(sp && sp.length) && !(pz && pz.length) && !(sa && sa.length)) return ip + Math.max(0, lt) * (T.base(o, 'speed') || 1) * (T.base(o, 'paused') ? 0 : 1);
      const key = JSON.stringify([sp, pz, sa, o.speed, o.dur]); let c = rateCache.get(o.id);
      if (!c || c.key !== key) { // running total of file time, 50 steps a second
        const n = Math.ceil(Math.max(0.1, o.dur) * 50) + 2, tbl = new Float64Array(n + 1); for (let i = 0; i < n; i++) tbl[i + 1] = tbl[i] + M.rateAt(o, (i + 0.5) / 50) / 50;
        c = { key, tbl }; rateCache.set(o.id, c);
      }
      const x = U.clamp(lt, 0, c.tbl.length / 50 - 0.04), i = Math.floor(x * 50); return ip + c.tbl[i] + M.rateAt(o, x) * (x - i / 50);
    },
    /** How fast the file plays at lt (0 while paused). */
    rateAt(o, lt) { const T = SB.tracks; return T.value(o, 'paused', lt) || T.value(o, 'showAt', lt) >= 0 ? 0 : Math.max(0, T.value(o, 'speed', lt)); },
    /** Keep media elements in step with the playhead. */
    sync(playing, force) {
      for (const o of tree.all()) {
        if (o.type !== 'audio' && o.type !== 'video') continue;
        const el = M.elementFor(o); if (!el) continue;
        const lt = tree.rawLocal(o), active = tree.inRange(o), target = M.timeAt(o, lt), rate = M.rateAt(o, lt);
        el.volume = U.clamp(SB.tracks.now(o, 'volume'), 0, 1); el.muted = tree.hidden(o) || S.exporting === 'rt';
        if (playing && active && rate > 0.01) {
          const r = U.clamp(rate, 0.0625, 16); if (Math.abs(el.playbackRate - r) > 0.001) el.playbackRate = r;
          if (force || el.paused || Math.abs(el.currentTime - target) > 0.25) { try { el.currentTime = target; } catch (e) {} }
          if (el.paused) el.play().catch(() => {});
        } else {
          if (!el.paused) el.pause();
          if (active && o.type === 'video' && Math.abs(el.currentTime - target) > 0.02) { try { el.currentTime = target; } catch (e) {} } // stopped, or a held frame
        }
      }
    },
    /** For export: seek every visible video to time t and wait. */
    async seekVideos(t) {
      for (const o of tree.all()) {
        if (o.type !== 'video' || tree.hidden(o) || !tree.inRange(o, t)) continue;
        const el = M.elementFor(o); if (!el) continue; if (!el.paused) el.pause();
        const target = U.clamp(M.timeAt(o, tree.rawLocal(o, t)), 0, (isFinite(el.duration) ? el.duration : 1e9) - 0.001);
        if (Math.abs(el.currentTime - target) > 0.0005 || el.readyState < 2) await seekEl(el, target);
      }
    },
    /** Mix all audible audio and video sound into one buffer (for export). */
    async mix(duration) {
      const items = tree.all().filter(o => (o.type === 'audio' || o.type === 'video') && !tree.hidden(o) && (o.volume ?? 1) > 0 && files[o.mediaId]);
      const ready = []; for (const o of items) { try { await M.decode(files[o.mediaId]); ready.push(o); } catch (e) {} }
      if (!ready.length) return null;
      const sr = 48000, oac = new OfflineAudioContext(2, Math.max(1, Math.ceil(duration * sr)), sr);
      for (const o of ready) {
        const buf = files[o.mediaId].buffer, ip = o.inPoint || 0; if (ip >= buf.duration) continue;
        for (const [w0, w1, l0] of tree.windows(o)) { // every part that plays (a cut clip has several)
          const a0 = Math.max(w0, 0), b0 = Math.min(w1, duration); if (b0 <= a0) continue;
          // pieces with one speed each (pauses are left silent)
          let a = a0; while (a < b0 - 1e-4) {
            const la = l0 + (a - w0), r = M.rateAt(o, la); let b = a; while (b < b0 - 1e-4 && Math.abs(M.rateAt(o, l0 + (b - w0) + 0.005) - r) < 1e-3) b = Math.min(b0, b + 0.02);
            if (b <= a) b = Math.min(b0, a + 0.02);
            const off = M.timeAt(o, la), lenF = M.timeAt(o, l0 + (b - w0)) - off;
            if (r > 0.01 && lenF > 0 && off < buf.duration) { const src = oac.createBufferSource(); src.buffer = buf; src.playbackRate.value = U.clamp(r, 0.0625, 16); const g = oac.createGain(); g.gain.value = o.volume ?? 1; src.connect(g); g.connect(oac.destination); src.start(a, off, Math.min(lenF, buf.duration - off)); }
            a = b;
          }
        }
      }
      return await oac.startRendering();
    },
  };
  const rateCache = new Map();
  function seekEl(el, t) {
    return new Promise(res => {
      let done = false; const fin = () => { if (done) return; done = true; el.removeEventListener('seeked', fin); res(); };
      const go = () => { el.addEventListener('seeked', fin); setTimeout(fin, 3000); try { el.currentTime = t; } catch (e) { fin(); } };
      if (el.readyState < 1) { el.addEventListener('loadedmetadata', go, { once: true }); setTimeout(fin, 4000); el.load(); } else go();
    });
  }
})(window.SB);
