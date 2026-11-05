/* Export. Everything renders in the browser; nothing is uploaded.
     What   one or more screens; several can be combined into one picture (as they sit on the board)
            or exported as separate files (packed in one ZIP)
     As     a video (MP4, WebM, MOV, MKV, with sound), a sprite sheet (+ JSON), or images in a ZIP
            (PNG, JPG, WebP, AVIF)
   Videos are encoded with WebCodecs and written by Mediabunny (vendor/mediabunny.js); AVIF uses
   js/io/avif.js. A "job" is what gets rendered: { name, w, h, duration, draw(ctx, t, k, transparent), audio() }.
   Each export returns files [{ name, blob }]; one file is saved as it is, several go in a ZIP. */
'use strict';
(function (SB) {
  const U = SB.util, S = SB.state, h = U.h, W = SB.w, Sc = SB.screens;

  /** Save a blob as a download (uses the host's download bridge when it has one). */
  // Inside claude.ai the page saves through the viewer's download prompt, which takes these file types only.
  const SAVE_OK = new Set(['gif', 'png', 'jpg', 'jpeg', 'webp', 'mp4', 'webm', 'mov', 'txt', 'json', 'md', 'docx', 'pptx', 'epub', 'csv', 'ttf', 'html', 'svg', 'pdf', 'xlsx', 'zip']);
  const SAVE_MSG = { declined: 'Download cancelled.', rate_limited: 'Another download is waiting for your answer. Try again in a moment.', too_large: 'This file is too big to save here. Try a smaller size or fewer screens.', rejected_extension: 'This file type can’t be saved here.', extension_not_enabled: 'This file type can’t be saved here.', not_signed: 'MOV can’t be saved here. Choose MP4 or WebM.' };
  /** Save a file: through the viewer's download prompt when the page runs in Claude, else a normal browser download.
      Types the prompt doesn't take (.unitypackage, .fbx, .mkv, .avif…) go inside a ZIP. Returns the name saved, or null. */
  async function saveFile(name, blob) {
    let d = null; try { if (window.claude && typeof window.claude.use === 'function') d = await window.claude.use('downloads'); } catch (e) { d = null; }
    if (d) {
      const ext = (name.split('.').pop() || '').toLowerCase(); let file = name, data = blob, zipped = false;
      if (!SAVE_OK.has(ext)) { file = name + '.zip'; data = SB.zip([{ name, data: await U.blobBytes(blob) }]); zipped = true; }
      try { await d.save({ filename: file, data }); SB.toast(zipped ? `Saved ${file}. Unzip it to get ${name}.` : `Saved ${file}`); return file; }
      catch (e) { const code = e && e.code; if (code === 'declined') { SB.toast(SAVE_MSG.declined); return null; } if (SAVE_MSG[code]) { SB.toast(SAVE_MSG[code]); return null; }
        if (code && code !== 'unavailable' && code !== 'not_granted' && code !== 'capability_disabled' && code !== 'capability_removed') { SB.toast('Couldn’t save the file: ' + (e.message || code)); return null; } }
    }
    const a = h('a', { href: URL.createObjectURL(blob), download: name }); document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000); SB.toast(`Saved ${name}`); return name;
  }

  // ---------- formats
  const MB = () => window.Mediabunny;
  const VIDEO = {
    mp4: { label: 'MP4', mime: 'video/mp4', make: () => new (MB().Mp4OutputFormat)({ fastStart: 'in-memory' }), v: ['avc', 'vp9', 'av1', 'hevc'], a: ['aac', 'opus'], info: 'Plays almost everywhere.' },
    webm: { label: 'WebM', mime: 'video/webm', make: () => new (MB().WebMOutputFormat)(), v: ['vp9', 'vp8', 'av1'], a: ['opus', 'vorbis'], alpha: true, info: 'For the web. Can keep a transparent background.' },
    mov: { label: 'MOV', mime: 'video/quicktime', make: () => new (MB().MovOutputFormat)({ fastStart: 'in-memory' }), v: ['avc', 'hevc', 'vp9', 'av1'], a: ['aac', 'pcm-s16'], info: 'For Apple apps and video editors.' },
    mkv: { label: 'MKV', mime: 'video/x-matroska', make: () => new (MB().MkvOutputFormat)(), v: ['avc', 'vp9', 'av1', 'hevc'], a: ['aac', 'opus'], alpha: true, info: 'Matroska. Can keep a transparent background.' },
  };
  const IMAGE = {
    png: { label: 'PNG', mime: 'image/png', ext: 'png', alpha: true, info: 'Exact colors, larger files.' },
    jpg: { label: 'JPG', mime: 'image/jpeg', ext: 'jpg', lossy: true, info: 'Small files, no transparency.' },
    webp: { label: 'WebP', mime: 'image/webp', ext: 'webp', alpha: true, lossy: true, info: 'Small files with transparency.' },
    avif: { label: 'AVIF', ext: 'avif', alpha: true, lossy: true, info: 'The smallest files, with transparency.' },
  };
  // What "Export as" shows. Interactive (HTML, Rive, SVG) and Game Engine (Unity, Godot) each pick their format below it;
  // o.kind is always the real format (web, rive, svgix, unity, godot), GROUP maps it to its entry here.
  const KINDS = [['video', 'Video'], ['gif', 'GIF'], ['sheet', 'Sprite sheet'], ['images', 'Images (ZIP)'], ['svg', 'SVG animation'], ['interactive', 'Interactive'], ['engine', 'Game Engine'], ['blender', 'Blender (FBX)'], ['lottie', 'Lottie (web)']];
  const GROUP = { web: 'interactive', rive: 'interactive', svgix: 'interactive', unity: 'engine', godot: 'engine' };
  const GROUP_FMT = { interactive: [['web', 'HTML', 'A web page that plays everything like Preview: rules, screens, controllers, drags'], ['rive', 'Rive', 'A .riv file for the Rive player, with a state machine for clicks, hovers and keys'], ['svgix', 'SVG', 'An animated SVG that starts when you click it or point at it (rules, screens and controllers need HTML)']],
    engine: [['unity', 'Unity', 'A .unitypackage'], ['godot', 'Godot', 'A Godot 4 folder']] };
  const NAME = { web: 'HTML', rive: 'Rive', svgix: 'SVG', svg: 'SVG', unity: 'Unity', godot: 'Godot', blender: 'Blender', lottie: 'Lottie' };
  const BAKED = { lottie: 1, blender: 1, unity: 1, godot: 1, rive: 1, web: 1 }; // built from the layers themselves, not from rendered frames
  const ENGINE = { unity: 1, godot: 1, rive: 1 }; // all chosen screens go into one file: one animation each
  const KIND_OF_TARGET = { video: 'video', game: 'unity', blender: 'blender', web: 'web' };
  const INFO = {
    web: 'One HTML file that plays the whole project in any browser with its interactions: every screen, rule, transition, rig, controller, effect and morph works as in Preview. Open it, or put it on a website.',
    lottie: 'A Lottie JSON file for lottie-web (websites) and the Lottie players for apps.',
    unity: 'A .unitypackage: sprites, a prefab with the rig (bones as GameObjects, Sprite Skin for bending layers), masks, controllers as empty GameObjects, and an Animator with one animation per screen (and per action of a rig). Unity 2022.3 or newer; bending layers need the 2D Animation package.',
    godot: 'A folder for Godot 4: a scene with Sprite2D layers, Skeleton2D bones (Polygon2D for bending layers), clip masks, controllers as Node2D, and an AnimationPlayer with one animation per screen (and per action of a rig).',
    blender: 'An FBX file with its pictures inside: planes for the layers, a skeleton for the bones, and the animation. One file per screen (and per action of a rig).',
    gif: 'An animated GIF: plays everywhere (chats, docs, READMEs, emails) with no player. At most 256 colors a frame and no soft edges on a transparent background, so keep it small: 12–24 fps and 50% size are usually plenty.',
    svg: 'An animated SVG: every frame is kept as shapes (sharp at any size; effects that SVG can’t draw are pictures inside it) and they show in turn. It plays in browsers, web pages and many apps, with no script. Each frame is stored, so a lower frame rate makes a smaller file.',
    svgix: 'An animated SVG that waits on its first frame and plays when you click it (or point at it); clicking again starts it over. SVG can do that by itself, with no script. For rules, screens, controllers and drags, export HTML.',
    rive: 'A .riv file for Rive: every chosen screen and every rig action is an animation of one artboard (bending layers are meshes), with a state machine that plays them and reacts to clicks, hovers and keys (File › Make it interactive). Open it in Rive or play it on the web.',
  };
  /** What this browser can do (checked once). */
  let caps = null;
  async function probe() {
    if (caps) return caps; caps = { webcodecs: 'VideoEncoder' in window && !!MB(), avif: false, alpha: false };
    try { caps.avif = await SB.avif.supported(); } catch (e) {}
    if (caps.webcodecs) try { caps.alpha = await MB().canEncodeVideo('vp9', { width: 320, height: 240, alpha: 'keep' }); } catch (e) {}
    return caps;
  }

  // ---------- what gets rendered
  /** Run fn with screen s active (all of the app sees that screen meanwhile), then switch back. */
  async function onScreen(s, fn) {
    Sc.sync(); const a = Sc.active(); if (s === a) return fn();
    const ctx = S.ctx, sel = S.sel, multi = S.multi; Sc.swapTo(s);
    try { return await fn(); } finally { Sc.swapTo(a); S.ctx = ctx; S.sel = sel; S.multi = multi; }
  }
  function screenJob(s) {
    return { id: s.id, name: s.name, w: s.proj.w, h: s.proj.h, duration: s.proj.duration,
      async draw(x, t, k, tr) { await onScreen(s, async () => { await SB.media.seekVideos(t); SB.scene.render(x, t, k, { noBg: tr }); }); },
      audio: () => onScreen(s, () => SB.media.mix(s.proj.duration)) };
  }
  /** Several screens in one picture, placed as on the board. Each plays its own timeline (and holds its last frame). */
  function combinedJob(list) {
    const b = U.emptyBox(); list.forEach(s => { U.growBox(b, s.x, s.y); U.growBox(b, s.x + s.proj.w, s.y + s.proj.h); });
    const tmp = h('canvas'), tx = tmp.getContext('2d'), dur = Math.max(...list.map(s => s.proj.duration));
    return { name: list.map(s => s.name).join(' + '), w: Math.round(b.x1 - b.x0), h: Math.round(b.y1 - b.y0), duration: dur,
      async draw(x, t, k, tr) {
        if (!tr) { x.fillStyle = '#ffffff'; x.fillRect(0, 0, x.canvas.width, x.canvas.height); }
        for (const s of list) {
          const w = Math.max(1, Math.round(s.proj.w * k)), hh = Math.max(1, Math.round(s.proj.h * k)); if (tmp.width !== w || tmp.height !== hh) { tmp.width = w; tmp.height = hh; }
          tx.setTransform(1, 0, 0, 1, 0, 0); tx.clearRect(0, 0, w, hh); const ts = Math.min(t, Math.max(0, s.proj.duration - 0.001));
          await onScreen(s, async () => { await SB.media.seekVideos(ts); SB.scene.render(tx, ts, k, { noBg: tr }); });
          x.drawImage(tmp, Math.round((s.x - b.x0) * k), Math.round((s.y - b.y0) * k));
        }
      },
      async audio() {
        const bufs = []; for (const s of list) { try { const a = await onScreen(s, () => SB.media.mix(s.proj.duration)); if (a) bufs.push(a); } catch (e) { console.warn(e); } }
        if (!bufs.length) return null; const len = Math.max(...bufs.map(a => a.length)), out = new AudioBuffer({ length: len, numberOfChannels: 2, sampleRate: 48000 });
        for (let c = 0; c < 2; c++) { const d = out.getChannelData(c); for (const a of bufs) { const s = a.getChannelData(Math.min(c, a.numberOfChannels - 1)); for (let i = 0; i < s.length; i++) d[i] += s[i]; } }
        return out;
      } };
  }
  /** Every frame of a job, drawn into one canvas. */
  async function eachFrame(job, o, w, hh, transparent, fn) {
    const n = Math.max(1, Math.round(job.duration * o.fps)), cv = h('canvas', { width: w, height: hh }), x = cv.getContext('2d', { willReadFrequently: o.kind !== 'video' }), k = w / job.w;
    for (let i = 0; i < n; i++) { if (S.cancelExport) throw 'cancel'; x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, w, hh); await job.draw(x, i / o.fps, k, transparent); await fn(cv, i, n); }
    return n;
  }
  const even = v => Math.max(2, Math.round(v / 2) * 2);

  // ---------- video
  async function video(job, o, prog) {
    const F = VIDEO[o.vfmt], w = even(job.w * o.scale), hh = even(job.h * o.scale), fps = o.fps, alpha = !!(F.alpha && o.transparent && caps.alpha);
    const bitrate = Math.round(U.clamp(w * hh * fps * o.quality, 1.5e6, 60e6)); let note = '';
    if (!caps.webcodecs) { if (job.active && (o.vfmt === 'mp4' || o.vfmt === 'webm')) return realtime(job, w, hh, fps, bitrate, prog); throw new Error("this browser can't encode video. Try Chrome or Edge."); }
    const M = MB(), fmt = F.make(), okV = fmt.getSupportedVideoCodecs(), okA = fmt.getSupportedAudioCodecs();
    const vlist = (alpha ? ['vp9', 'vp8', 'av1'] : F.v).filter(c => okV.includes(c)), vcodec = await M.getFirstEncodableVideoCodec(vlist, Object.assign({ width: w, height: hh, bitrate }, alpha ? { alpha: 'keep' } : {}));
    if (!vcodec) throw new Error(`this browser can't encode ${F.label} video. Try WebM or MP4.`);
    if ((o.vfmt === 'mp4' || o.vfmt === 'mov') && vcodec !== 'avc') note += `This browser has no H.264 encoder, so the ${F.label} uses ${vcodec.toUpperCase()}${o.vfmt === 'mov' ? ', which QuickTime may not open. Try MP4 or WebM' : '. It plays in Chrome, Edge, Firefox and VLC'}. `;
    prog(0.01, 'Mixing sound…'); let audio = null; try { audio = await job.audio(); } catch (e) { console.warn(e); }
    const acodec = audio ? await M.getFirstEncodableAudioCodec(F.a.filter(c => okA.includes(c)), { numberOfChannels: 2, sampleRate: 48000, bitrate: 160000 }) : null;
    if (audio && !acodec) note += "This browser can't encode sound for this format, so the video is silent. ";
    const cv = h('canvas', { width: w, height: hh }), x = cv.getContext('2d'), out = new M.Output({ format: fmt, target: new M.BufferTarget() });
    const vs = new M.CanvasSource(cv, { codec: vcodec, bitrate, keyFrameInterval: 2, alpha: alpha ? 'keep' : 'discard' }); out.addVideoTrack(vs, { frameRate: fps });
    let as = null; if (acodec) { as = new M.AudioBufferSource({ codec: acodec, bitrate: 160000 }); out.addAudioTrack(as); }
    await out.start();
    try {
      if (as) { prog(0.03, 'Encoding sound…'); await as.add(audio); as.close(); }
      const n = Math.max(1, Math.round(job.duration * fps));
      for (let i = 0; i < n; i++) {
        if (S.cancelExport) throw 'cancel';
        x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, w, hh); await job.draw(x, i / fps, w / job.w, alpha);
        await vs.add(i / fps, 1 / fps); if (i % 4 === 0) { prog(0.05 + 0.9 * i / n, `Rendering frame ${i + 1} of ${n}`); await U.sleep(0); }
      }
      vs.close(); prog(0.96, 'Finishing the file…'); await out.finalize();
    } catch (e) { try { await out.cancel(); } catch (e2) {} throw e; }
    if (alpha) note += 'The background is transparent (it shows in Chrome, Edge, Firefox and editors that read VP9 alpha). ';
    return { files: [{ ext: o.vfmt, blob: new Blob([out.target.buffer], { type: F.mime }) }], note: note.trim() };
  }
  /** Fallback without WebCodecs: play the active screen and record the canvas in real time. */
  async function realtime(job, w, hh, fps, bitrate, prog) {
    const cv = h('canvas', { width: w, height: hh }), ctx = cv.getContext('2d'), sc = w / S.project.w, D = S.project.duration;
    if (!window.MediaRecorder || !cv.captureStream) throw new Error("this browser can't record video. Try Chrome or Edge.");
    const mime = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'].find(m => MediaRecorder.isTypeSupported(m)); if (!mime) throw new Error('no supported recording format.');
    let audio = null; try { audio = await SB.media.mix(D); } catch (e) {}
    const stream = cv.captureStream(fps); let actx = null, src = null;
    if (audio) { actx = new AudioContext({ sampleRate: 48000 }); const dest = actx.createMediaStreamDestination(); src = actx.createBufferSource(); src.buffer = audio; src.connect(dest); dest.stream.getAudioTracks().forEach(t => stream.addTrack(t)); }
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: bitrate }), chunks = []; rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    const stopped = new Promise(r => rec.onstop = r); S.exporting = 'rt'; SB.scene.render(ctx, 0, sc, {});
    rec.start(250); if (src) src.start(); const t0 = performance.now();
    await new Promise(res => { const step = () => { const t = (performance.now() - t0) / 1000; if (S.cancelExport || t >= D) return res(); S.time = t; S.playing = true; SB.media.sync(true); S.playing = false; SB.scene.render(ctx, t, sc, {}); prog(t / D, `Recording ${U.fmtTime(t)} of ${U.fmtTime(D)}`); requestAnimationFrame(step); }; requestAnimationFrame(step); });
    rec.stop(); if (src) try { src.stop(); } catch (e) {} await stopped; if (actx) actx.close(); SB.media.pauseAll(); S.time = 0;
    if (S.cancelExport) throw 'cancel';
    const ext = mime.includes('mp4') ? 'mp4' : 'webm';
    return { files: [{ ext, blob: new Blob(chunks, { type: mime.split(';')[0] }) }], note: 'This browser has no video encoder, so the animation was recorded while it played.' };
  }

  // ---------- images
  /** Turns canvases into image files of the chosen format. */
  async function imageWriter(o, w, hh) {
    const F = IMAGE[o.ifmt], q = o.iq;
    if (o.ifmt === 'avif') { const enc = await SB.avif.encoder(w, hh, q); return { ext: 'avif', write: cv => enc.encode(cv, o.transparent), close: () => enc.close() }; }
    return { ext: F.ext, write: cv => new Promise((res, rej) => cv.toBlob(b => b ? res(b) : rej(new Error('this browser could not save the image.')), F.mime, F.lossy ? q : undefined)), close() {} };
  }
  const canAlpha = o => (o.ifmt === 'svg' || !!(IMAGE[o.ifmt] || {}).alpha) && o.transparent;
  async function sheet(job, o, prog) {
    if (o.ifmt === 'svg') return svgSheet(job, o, prog);
    const n = Math.max(1, Math.round(job.duration * o.fps)), base = o.base, alpha = canAlpha(o), P = SB.sheetEditor && SB.sheetEditor.plan(job, o, n); /* the saved layout (Arrange frames…) */
    const order = P ? P.order : [...Array(n).keys()], pad = P ? P.pad : 0, cellOf = new Map(), first = []; let w = Math.round(job.w * o.scale), hh = Math.round(job.h * o.scale);
    if (P && P.dedupe) { const hs = []; await eachFrame(job, Object.assign({}, o, { scale: Math.min(1, 160 / job.w) }), Math.max(1, Math.round(Math.min(job.w, 160))), Math.max(1, Math.round(job.h * Math.min(1, 160 / job.w))), alpha, (cv, i, m) => { hs[i] = SB.sheetEditor.hash(cv); if (i % 6 === 0) prog(0.3 * i / m, 'Looking for duplicates…'); });
      const byHash = new Map(); for (const i of order) { if (byHash.has(hs[i])) cellOf.set(i, byHash.get(hs[i])); else { byHash.set(hs[i], first.length); cellOf.set(i, first.length); first.push(i); } } }
    else order.forEach(i => { cellOf.set(i, first.length); first.push(i); });
    const C = Math.max(1, first.length), cols = Math.max(1, Math.min(C, (P && P.cols) || o.cols || Math.ceil(Math.sqrt(C * hh / w)))), rows = Math.ceil(C / cols), max = o.ifmt === 'avif' ? 8192 : 16384; let k = 1;
    if (cols * (w + pad) > max || rows * (hh + pad) > max) k = Math.min(max / (cols * (w + pad)), max / (rows * (hh + pad))); w = Math.max(1, Math.floor(w * k)); hh = Math.max(1, Math.floor(hh * k));
    const out = h('canvas', { width: cols * (w + pad) - pad, height: rows * (hh + pad) - pad }), sx = out.getContext('2d', { willReadFrequently: true }), frames = {}, names = [], at = c => ({ x: (c % cols) * (w + pad), y: Math.floor(c / cols) * (hh + pad) });
    const drawn = new Set(first);
    await eachFrame(job, o, w, hh, alpha, (cv, i) => { if (drawn.has(i)) { const q = at(cellOf.get(i)); sx.drawImage(cv, q.x, q.y, w, hh); } if (i % 3 === 0) prog(0.3 + 0.6 * i / n, `Drawing frame ${i + 1} of ${n}`); });
    const nameOf = i => (P && P.names[i]) || `${base}_${String(i).padStart(4, '0')}`;
    for (const i of order) { const q = at(cellOf.get(i)), f = nameOf(i); frames[f] = { frame: { x: q.x, y: q.y, w, h: hh }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w, h: hh }, sourceSize: { w, h: hh }, duration: Math.round(1000 / o.fps) }; names.push(f); }
    const animations = { [base]: names }; if (P) for (const t of P.tags) if (t.frames.length) animations[t.name] = t.frames.filter(i => cellOf.has(i)).map(nameOf);
    prog(0.92, 'Saving the sheet…'); const wr = await imageWriter(o, out.width, out.height), img = await wr.write(out); wr.close();
    const files = [{ name: `${base}-sheet.${wr.ext}`, blob: img }];
    if (o.json) files.push({ name: `${base}-sheet.json`, blob: new Blob([JSON.stringify({ frames, animations, meta: { app: 'Toonzi 2D', image: `${base}-sheet.${wr.ext}`, format: 'RGBA8888', size: { w: out.width, h: out.height }, scale: String(o.scale * k), frameRate: o.fps } }, null, 1)], { type: 'application/json' }) });
    return { files, note: (k < 1 ? `The sheet was scaled down to fit ${max} px. ` : '') + (P && first.length < order.length ? `${order.length - first.length} duplicate frames share cells.` : '') };
  }
  // ---------- SVG (js/io/svgctx.js: the renderer draws into an SVG context)
  /** Every frame of a job as SVG: fn({ body, defs, raster }, i, n). */
  async function svgFrames(job, o, w, hh, transparent, fn) {
    const n = Math.max(1, Math.round(job.duration * o.fps)), k = w / job.w;
    for (let i = 0; i < n; i++) { if (S.cancelExport) throw 'cancel'; const c = SB.svgCtx(w, hh, `f${i}_`); await job.draw(c, i / o.fps, k, transparent); await fn(Object.assign(c.svg(), { pre: `f${i}_` }), i, n); }
    return n;
  }
  const svgHead = (w, hh, title) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${hh}" viewBox="0 0 ${w} ${hh}"><title>${U.esc(title)}</title>`;
  const rasterNote = r => r ? 'Some effects (erasing, blurs, shadows, patterns) can’t be SVG shapes, so those parts are pictures inside the SVG. ' : '';
  /** A sprite sheet as one SVG: each frame a cell of the grid. */
  async function svgSheet(job, o, prog) {
    const n = Math.max(1, Math.round(job.duration * o.fps)), w = Math.max(1, Math.round(job.w * o.scale)), hh = Math.max(1, Math.round(job.h * o.scale)), cols = Math.max(1, Math.min(n, o.cols || Math.ceil(Math.sqrt(n * hh / w)))), rows = Math.ceil(n / cols);
    const cells = [], frames = {}, names = [], base = o.base; let raster = 0;
    await svgFrames(job, o, w, hh, canAlpha(o), (f, i) => { const x = (i % cols) * w, y = Math.floor(i / cols) * hh; raster += f.raster; cells.push(`<svg x="${x}" y="${y}" width="${w}" height="${hh}" viewBox="0 0 ${w} ${hh}" overflow="hidden"><defs>${f.defs}</defs>${f.body}</svg>`);
      const nm = `${base}_${String(i).padStart(4, '0')}`; frames[nm] = { frame: { x, y, w, h: hh }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w, h: hh }, sourceSize: { w, h: hh }, duration: Math.round(1000 / o.fps) }; names.push(nm); if (i % 3 === 0) prog(i / n * 0.9, `Frame ${i + 1} of ${n}`); });
    const svg = `${svgHead(cols * w, rows * hh, job.name)}${cells.join('\n')}</svg>`, files = [{ name: `${base}-sheet.svg`, blob: new Blob([svg], { type: 'image/svg+xml' }) }];
    if (o.json) files.push({ name: `${base}-sheet.json`, blob: new Blob([JSON.stringify({ frames, animations: { [base]: names }, meta: { app: 'Toonzi 2D', image: `${base}-sheet.svg`, size: { w: cols * w, h: rows * hh }, scale: String(o.scale) } }, null, 1)], { type: 'application/json' }) });
    return { files, note: rasterNote(raster) };
  }
  /** An animated SVG: the frames show in turn (SMIL, no script). Frames that look the same are kept once and shown longer.
      o.svgLoop: play again and again; o.ix: wait on the first frame until a click (o.svgStart 'click') or a hover ('hover'). */
  async function svgAnim(job, o, prog) {
    const w = Math.max(1, Math.round(job.w * o.scale)), hh = Math.max(1, Math.round(job.h * o.scale)), spans = []; let raster = 0;
    const n = await svgFrames(job, o, w, hh, o.transparent, (f, i, n) => { raster += f.raster; const key = (f.defs + '|' + f.body).split(f.pre).join('#'), last = spans[spans.length - 1];
      if (last && last.key === key) last.b = i + 1; else spans.push({ key, a: i, b: i + 1, defs: f.defs, body: f.body }); if (i % 3 === 0) prog(i / n * 0.9, `Frame ${i + 1} of ${n}`); });
    const T = U.r3(n / o.fps), loop = o.svgLoop !== false, begin = o.ix ? (o.svgStart === 'hover' ? 'sbStart.mouseover' : 'sbStart.click') : '0s', kt = v => U.r3(v / n);
    const groups = spans.map((sp, k) => {
      if (spans.length === 1) return `<g>${sp.body}</g>`;
      const vals = sp.a === 0 ? ['inline', 'none'] : sp.b >= n ? ['none', 'inline'] : ['none', 'inline', 'none'], times = sp.a === 0 ? [0, kt(sp.b)] : sp.b >= n ? [0, kt(sp.a)] : [0, kt(sp.a), kt(sp.b)];
      return `<g display="${k === 0 ? 'inline' : 'none'}"><animate attributeName="display" calcMode="discrete" dur="${T}s" begin="${begin}" values="${vals.join(';')}" keyTimes="${times.join(';')}" repeatCount="${loop ? 'indefinite' : '1'}" fill="freeze"/>${sp.body}</g>`;
    });
    const hit = o.ix ? `<rect id="sbStart" width="${w}" height="${hh}" fill="transparent" style="cursor:pointer"><title>${o.svgStart === 'hover' ? 'Point at it to play' : 'Click to play'}</title></rect>` : '';
    const svg = `${svgHead(w, hh, job.name)}<defs>${spans.map(sp => sp.defs).join('')}</defs>\n${groups.join('\n')}${hit}</svg>`;
    return { files: [{ ext: 'svg', blob: new Blob([svg], { type: 'image/svg+xml' }) }], note: (rasterNote(raster) + (spans.length < n ? `${n} frames, ${spans.length} different (the same ones are kept once). ` : '') + (o.ix ? `It waits on its first frame: ${o.svgStart === 'hover' ? 'point at it' : 'click it'} to play.` : '')).trim() };
  }
  async function images(job, o, prog) {
    const w = Math.max(1, Math.round(job.w * o.scale)), hh = Math.max(1, Math.round(job.h * o.scale)), files = [], wr = await imageWriter(o, w, hh);
    try { await eachFrame(job, o, w, hh, canAlpha(o), async (cv, i, n) => { files.push({ name: `${o.base}_${String(i).padStart(4, '0')}.${wr.ext}`, blob: await wr.write(cv) }); if (i % 3 === 0) prog(i / n, `Saving frame ${i + 1} of ${n}`); }); }
    finally { wr.close(); }
    return { files, zip: true };
  }
  // ---------- GIF (js/io/gif.js)
  async function gif(job, o, prog) {
    const w = Math.max(1, Math.round(job.w * o.scale)), hh = Math.max(1, Math.round(job.h * o.scale)), fps = Math.min(50, o.fps), oo = Object.assign({}, o, { fps });
    const enc = SB.gif.encoder(w, hh, { loop: o.gifLoop !== false, transparent: !!o.transparent, colors: o.gifColors || 256, dither: o.gifDither !== false }); let acc = 0, done = 0;
    await eachFrame(job, oo, w, hh, !!o.transparent, async (cv, i, n) => {
      acc += 100 / fps; const cs = Math.max(2, Math.round(acc) - done); done += cs; /* GIF delays are in hundredths of a second: spread the rounding */
      enc.add(cv.getContext('2d').getImageData(0, 0, w, hh), cs); prog((i + 1) / n * 0.95, `Frame ${i + 1} of ${n}`); if (i % 3 === 2) await new Promise(r => setTimeout(r));
    });
    return { files: [{ name: `${o.base}.gif`, blob: enc.finish() }], note: o.fps > 50 ? 'GIF plays at most 50 frames a second, so it uses 50.' : '' };
  }
  // ---------- Lottie
  async function lottie(job, o, prog) {
    const r = await onScreen(job.screen, () => SB.lottie.build(job.name, { fps: o.fps, prog }));
    const j = r.json; if (!o.transparent) j.layers.push({ ddd: 0, ind: 9999, ty: 1, nm: 'Background', sc: S.project.bg || '#ffffff', sw: j.w, sh: j.h, sr: 1, ao: 0, ip: 0, op: j.op, st: 0, bm: 0, ks: { o: { a: 0, k: 100 }, r: { a: 0, k: 0 }, p: { a: 0, k: [0, 0, 0] }, a: { a: 0, k: [0, 0, 0] }, s: { a: 0, k: [100, 100, 100] } } });
    const text = JSON.stringify(j), files = [{ name: `${o.base}.json`, blob: new Blob([text], { type: 'application/json' }) }];
    if (o.html) files.push({ name: `${o.base}.html`, blob: new Blob([lottieHtml(job.name, text, o.transparent ? null : S.project.bg)], { type: 'text/html' }) });
    return { files, note: r.warnings.length ? `Left out (Lottie can’t show them): ${r.warnings.join(', ')}.` : 'Everything is in the file.' };
  }
  const lottieHtml = (name, data, bg) => `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${U.esc(name)}</title>
<style>html,body{margin:0;height:100%;background:${bg || 'transparent'}}#anim{width:100%;height:100%}</style></head>
<body><div id="anim"></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/lottie-web/5.12.2/lottie.min.js"></script>
<script>lottie.loadAnimation({ container: document.getElementById('anim'), renderer: 'svg', loop: true, autoplay: true, animationData: ${data} });</script>
</body></html>`;
  // ---------- Blender (FBX)
  async function blender(job, o, prog) {
    if (!SB.fbx) throw new Error('FBX export is not available.');
    // a rig with actions: one FBX per action
    Sc.sync(); const vs = SB.actions ? SB.actions.variants(job.screen.objects, job.screen.proj) : [], files = [], warn = new Set(), baked = new Set();
    const one = async (name, base, v) => { const r = await onScreen(job.screen, () => v ? SB.actions.during(v.rigId, v.act.id, () => SB.fbx.build(name, { fps: o.fps, base, facing: 'blender', textures: !!o.textures, morphSteps: o.morphSteps, bakeFx: o.bakeFx !== false, prog })) : SB.fbx.build(name, { fps: o.fps, base, facing: 'blender', textures: !!o.textures, morphSteps: o.morphSteps, bakeFx: o.bakeFx !== false, prog })); r.files.forEach(f => files.push(f)); r.warnings.forEach(w => warn.add(w)); (r.baked || []).forEach(b => baked.add(b)); };
    if (!vs.length) await one(job.name, o.base); else for (const v of vs) await one(v.act.name, `${o.base}-${U.slug(v.act.name)}`, v);
    return { files, zip: files.length > 1, baked: [...baked], note: warn.size ? `Left out (FBX can’t carry them): ${[...warn].join(', ')}.` : '' };
  }
  // ---------- Unity and Godot: every chosen screen is one animation of the same scene
  /** The one yellow warning about visual effects a game engine or Blender can't make itself, with a "Show where" list.
      items: [{ label: 'Screen › Layer: Outline', how: 'sprite' | 'frames' | 'out' }] */
  const HOW = { sprite: 'drawn onto its sprite', frames: 'frame by frame', out: 'left out' };
  function fxWarnBox(items, who) {
    if (!items.length) return null; const n = items.length;
    return h('div.hint.bake.fx-warn', null, h('b', null, '⚠ You are using visual effects. '),
      `${who} can’t make them itself, so they are drawn into pictures. That can make your animation heavier and can have small bugs (an edge cut off, a shadow turning with the layer), so be aware and check it in ${who}.`,
      h('details.fx-where', null, h('summary', null, `Show where (${n} layer${n > 1 ? 's' : ''})`),
        h('ul', null, items.map(it => h('li', null, h('span', null, it.label), h('span.nr', null, ` (${SB.targets ? SB.targets.NOT_REC : 'not recommended'})`), h('small', null, ` · ${HOW[it.how] || it.how}`))))));
  }
  /** After exporting: the pixel art note, and the one visual effects warning (what went onto sprites and frame by frame). */
  const bakeNote = (list, kind, still) => { const l = [...(list || [])], who = NAME[kind] || kind, px = l.filter(x => / \(pixel art screen\)$/.test(x)), fx = l.filter(x => !px.includes(x)), st = [...(still || [])]; if (!l.length && !st.length) return null;
    const items = fx.map(x => ({ label: x.replace(/ \((.*)\)$/, ': $1'), how: 'frames' })).concat(st.map(x => ({ label: x.replace(/ \((.*)\)$/, ': $1'), how: 'sprite' })));
    return h('div', null, px.length ? h('p.hint.bake', null, h('b', null, 'Frame by frame: '), `${px.map(x => x.replace(/ \(pixel art screen\)$/, '')).join(', ')} (pixel art): one sharp picture a frame, so it keeps its pixel look.`) : null, fxWarnBox(items, who)); };
  const engineNote = (who, w) => w.length ? `Left out (${who} can’t show them): ${w.join(', ')}.` : '';
  async function unity(job, o, prog) {
    const r = await SB.unity.build(job.screens, { fps: o.fps, base: o.base, title: S.project.name, morphSteps: o.morphSteps, lineFrames: o.lineFrames ?? 8, bakeFx: o.bakeFx !== false, stillFx: o.stillFx !== false, pixelFrames: o.pixelFrames !== false, prog });
    return { files: r.files, project: r.project, baked: r.baked, still: r.still, note: [engineNote('Unity', r.warnings), ...(r.tips || [])].filter(Boolean).join(' ') };
  }
  async function godot(job, o, prog) {
    const r = await SB.godot.build(job.screens, { fps: o.fps, base: o.base, morphSteps: o.morphSteps, lineFrames: o.lineFrames ?? 8, bakeFx: o.bakeFx !== false, stillFx: o.stillFx !== false, pixelFrames: o.pixelFrames !== false, prog });
    return { files: r.files.map(f => ({ name: f.name, blob: new Blob([f.data]) })), project: r.project, baked: r.baked, still: r.still, zip: true, note: engineNote('Godot', r.warnings) };
  }
  async function rive(job, o, prog) {
    const cfg = SB.interact ? SB.interact.config() : null, r = await SB.rive.build(job.screens, { fps: o.fps, base: o.base, title: job.name, interact: cfg, morphSteps: o.morphSteps, prog }); if (cfg && cfg.skipped && cfg.skipped.length) r.warnings.push(`Interactions Rive can’t do (${cfg.skipped.join(', ')}): use the web page export for those`);
    const files = r.files.slice(); if (o.riveHtml !== false) files.push({ name: `${U.slug(o.base)}.html`, blob: new Blob([SB.rive.html(job.name, r.bytes, { size: r.size, bg: S.project.bg })], { type: 'text/html' }) });
    return { files, zip: files.length > 1, note: [engineNote('Rive', r.warnings), r.inputs.length ? `Triggers: ${r.inputs.join(', ')}.` : ''].filter(Boolean).join(' ') };
  }
  async function web(job, o, prog) {
    const r = await SB.webpage.build({ title: S.project.name, prog });
    return { files: [{ name: `${U.slug(o.base)}.html`, blob: new Blob([r.html], { type: 'text/html' }) }], note: `${Math.round(r.size / 1024)} KB: the player and the project in one page.` };
  }
  // engines that show drawings as pictures: a morph becomes in-between pictures (js/io/bake.js morphShown)
  const MORPH_KINDS = { unity: 1, godot: 1, blender: 1, rive: 1 };
  const BAKE_KINDS = { unity: 1, godot: 1, blender: 1 }; // effects the format can't do can be drawn frame by frame
  const PIXEL_KINDS = { unity: 1, godot: 1 }; // a pixel art screen can go as one sharp picture a frame
  const STILL_KINDS = { unity: 1, godot: 1 }; // still looks can be drawn onto the sprite (the rig and controllers keep working)
  const LINE_KINDS = { unity: 1, godot: 1 }; // animated lines can be baked into a loop of pictures
  const hasLineMotion = () => SB.lineMotion && SB.tree.all(S.screens.flatMap(s => s.objects || [])).concat(SB.tree.all()).some(o => o.type === 'draw' && SB.lineMotion(o));
  const hasMorph = () => SB.tree.all(S.screens.flatMap(s => s.objects || [])).concat(SB.tree.all()).some(o => (o.type === 'draw' || o.type === 'shape') && o.frames && o.frames.length > 1 && ((o.morph && o.morph.mode === 'morph') || (o.tracks && o.tracks.frame || []).some(k => k.morph) || (o.drv || []).some(L => L.morph)));
  const RUN = { video, gif, sheet, images, lottie, blender, unity, godot, rive, web, svg: svgAnim, svgix: (job, o, prog) => svgAnim(job, Object.assign({}, o, { ix: true }), prog) };

  // ---------- the dialog
  const lastOpts = {};
  SB.exporter = {
    VIDEO, IMAGE, saveFile, probe, screenJob, combinedJob, onScreen,
    async open(pre) {
      if (S.recording) SB.record.stop(); SB.time.pause(); Sc.ensure(); Sc.sync(); await probe();
      const p = S.project, act = Sc.active();
      const o = Object.assign({ kind: 'video', morphSteps: 3, lineFrames: 8, vfmt: 'mp4', ifmt: 'png', scale: p.w * p.h > 2.5e6 ? 0.5 : 1, fps: p.fps >= 1 && p.fps <= 240 ? p.fps : 24, quality: 0.14, iq: 0.85, trV: false, trI: true, cols: 0, json: true, combine: false, svgLoop: true, svgStart: 'click' }, lastOpts);
      o.screens = [act.id]; // starts on the screen you worked on last
      if (o.kind === 'fbx') o.kind = 'blender';
      const tgt = SB.targets ? SB.targets.get() : 'video'; if (tgt !== 'video' && (!lastOpts.kind || lastOpts.target !== tgt)) o.kind = KIND_OF_TARGET[tgt] || o.kind; o.target = tgt; if (o.html == null) o.html = true;
      if (pre && pre.kind) o.kind = pre.kind;
      if (ENGINE[o.kind] && S.screens.length > 1 && o.allEngine !== false) o.screens = S.screens.map(s => s.id); // all screens: one animation each
      // a format only takes screens that can be exported to it: made for it, or using nothing it can't show
      const REQ = { lottie: 'lottie', unity: 'game', godot: 'game', blender: 'blender' };
      /** What a screen uses that this format can't carry, less what goes frame by frame (effects, a pixel art screen). */
      const leftOut = (s, r) => { const pr = SB.targets.problems(r, s.objects || []); if (!pr.length || !SB.engines) return pr;
        if (PIXEL_KINDS[o.kind] && o.pixelFrames !== false && s.proj && s.proj.pixel && s.proj.pixel.on) return pr.filter(x => x === 'video' || x === 'audio' || /video|sound/i.test(x));
        if (!BAKE_KINDS[o.kind] || o.bakeFx === false) return pr; const fx = new Set(SB.tree.all(s.objects || []).flatMap(x => SB.engines.fxBad(x, r))); return pr.filter(x => !fx.has(x)); };
      const why = s => { if (s.editOf) return 'being edited'; const r = REQ[o.kind]; if (!r || !SB.targets) return ''; if ((s.proj.target || 'video') === r) return ''; const pr = leftOut(s, r); return pr.length ? `made for ${SB.targets.short(s.proj.target || 'video')}; uses ${pr.slice(0, 2).join(', ')}` : ''; };
      const fits = s => !why(s), pool = () => S.screens.filter(fits);
      const settle = () => { o.screens = o.screens.filter(id => { const s = S.screens.find(x => x.id === id); return s && fits(s); }); if (!o.screens.length) { const f = fits(act) ? act : pool()[0]; if (f) o.screens = [f.id]; } };
      const chosen = () => S.screens.filter(s => o.screens.includes(s.id) && fits(s)), many = () => chosen().length > 1;
      /** Frame by frame options (Unity, Godot, Blender): effects the format can't do, pixel art screens; a yellow note lists what goes that way. */
      const bakeRows = () => {
        if (!BAKE_KINDS[o.kind] || !SB.engines) return []; Sc.sync(); const scr = chosen(), t = o.kind === 'blender' ? 'blender' : 'game', who = NAME[o.kind], stillOk = !!STILL_KINDS[o.kind];
        const pix = PIXEL_KINDS[o.kind] && scr.some(sc => sc.proj && sc.proj.pixel && sc.proj.pixel.on), fx = scr.some(sc => SB.tree.all(sc.objects || []).some(x => SB.engines.fxBad(x, t).length));
        const opt = { bakeFx: o.bakeFx !== false, stillFx: stillOk && o.stillFx !== false, pixelFrames: !!pix && o.pixelFrames !== false };
        const list = SB.engines.bakeList(scr, opt, t), places = SB.engines.fxPlaces(scr, opt, t);
        return [
          pix ? W.row('Pixel art', W.check(o.pixelFrames !== false, 'Pixel art screens frame by frame', v => { o.pixelFrames = v; form(true); }), W.info(`A pixel art screen goes as one sharp picture a frame (no smoothing), so it keeps its pixel look in ${who}. Off: its layers go one by one, smooth, like any screen.`)) : null,
          fx && stillOk ? W.row('Effects', W.check(opt.stillFx, 'Still effects onto the sprite (keeps rigs and controllers)', v => { o.stillFx = v; form(true); }), W.info(`An outline, shadow, glow or other look that doesn’t change is drawn into the layer’s picture once. The layer stays one sprite in ${who}, so its bones, controllers and keyframes keep working. Off: those layers go frame by frame instead, without their rig or controllers.`)) : null,
          fx ? W.row(stillOk ? '' : 'Effects', W.check(o.bakeFx !== false, stillOk ? 'Other effects frame by frame' : `Effects ${who} can’t do: frame by frame`, v => { o.bakeFx = v; form(true); }), W.info(`Effects that change over time${stillOk ? ' (or all of them, when the box above is off)' : ''} become a picture a frame for those layers, so they look the same. Off: they are left out.`)) : null,
          ...bakeLines(list, who), fxWarnBox(places.map(x => ({ label: `${scr.length > 1 ? x.screen + ' › ' : ''}${x.name}: ${x.fx.join(', ')}`, how: x.how })), who)];
      };
      const bakeLines = (list, who) => { const px = list.filter(x => / \(pixel art screen\)$/.test(x));
        return [px.length ? h('p.hint.bake', null, h('b', null, 'Frame by frame: '), `${px.map(x => x.replace(/ \(pixel art screen\)$/, '')).join(', ')} (pixel art). Each frame goes as one sharp picture, so it keeps its pixel look. Its layers can’t be moved one by one in ${who}.`) : null];
      };
      const jobs = () => { const l = chosen(); if (ENGINE[o.kind]) return [Object.assign(screenJob(l[0]), { name: p.name, screens: l, engine: true })]; return l.length > 1 && o.combine && !BAKED[o.kind] ? [combinedJob(l)] : l.map(s => Object.assign(screenJob(s), { active: s === Sc.active(), screen: s })); };
      const body = h('div.exp'), bar = h('div.bar', null, h('i')), status = h('p.hint'), prog = (f, msg) => { bar.firstChild.style.width = Math.round(U.clamp(f, 0, 1) * 100) + '%'; if (msg) status.textContent = msg; };
      const go = W.btn('Export', async () => {
        Object.assign(lastOpts, o); delete lastOpts.screens;
        const list = jobs(), proj = U.slug(p.name), sep = list.length > 1, files = [], baked = new Set(), still = new Set(); let note = '', linked = null, done = null;
        if (o.toProject && (o.kind === 'unity' || o.kind === 'godot') && SB.gameLink && SB.gameLink.supported()) { // straight into the game project: get the folder while this is still a click
          try { linked = await SB.gameLink.ready(o.kind); } catch (e) { if (e && e.name === 'AbortError') return; SB.toast(e.message || String(e)); return; } if (!linked) return; }
        bar.hidden = false; status.textContent = ''; body.replaceChildren(bar, status); go.hidden = true; cancel.textContent = 'Stop'; S.exporting = true; S.cancelExport = false; S.playing = false; SB.media.pauseAll();
        try {
          for (let j = 0; j < list.length; j++) {
            const job = list[j], name = Sc.many() && !job.engine ? `${proj}-${U.slug(job.name)}` : proj, sub = (f, msg) => prog((j + f) / list.length, (sep ? `${job.name}: ` : '') + (msg || ''));
            const r = await RUN[o.kind](job, Object.assign({}, o, { base: name, transparent: o.kind === 'video' ? o.trV : o.trI }), sub);
            r.files.forEach(f => { f.name = f.name || `${name}.${f.ext}`; if (sep || r.zip) f.name = (sep && r.zip ? U.slug(job.name) + '/' : '') + f.name; files.push(f); });
            if (r.note && !note.includes(r.note)) note += r.note + ' '; (r.baked || []).forEach(b => baked.add(b)); (r.still || []).forEach(b => still.add(b));
            if (linked && r.project) done = await SB.gameLink.write(o.kind, linked, r.project.files, r.project.own, sub);
          }
          if (done) { // written into the project: nothing to download
            body.replaceChildren(h('div.exp-done', null, h('span.ok', { html: SB.icon('check') }), h('div', null, h('b', null, `Updated in ${o.kind === 'unity' ? 'Unity' : 'Godot'}: ${done.folder}`),
              h('p', null, `${done.wrote} file${done.wrote === 1 ? '' : 's'} written, ${done.kept} unchanged${done.removed ? `, ${done.removed} no longer needed removed` : ''}.`),
              h('p.hint', null, o.kind === 'unity' ? 'Switch to Unity: it reimports them by itself. Your scenes keep their links to the prefab.' : 'Switch to Godot: it reimports them by itself. Scenes that use this one keep their links.'), note.trim() ? h('p.hint', null, note.trim()) : null, bakeNote(baked, o.kind, still))));
            go.hidden = false; go.textContent = 'Update again'; return;
          }
          prog(1, 'Saving…');
          let out; if (files.length === 1) out = files[0];
          else { const parts = []; for (const f of files) parts.push({ name: f.name, data: await U.blobBytes(f.blob) }); out = { name: `${list.length > 1 || !Sc.many() ? proj : `${proj}-${U.slug(list[0].name)}`}${o.kind === 'images' ? '-frames' : ''}.zip`, blob: SB.zip(parts) }; }
          const saved = await saveFile(out.name, out.blob); if (!saved) { bar.hidden = true; status.textContent = 'Not saved. Press Export to try again.'; go.hidden = false; return; }
          // finished: the bar goes, a clear "completed" message stays
          body.replaceChildren(h('div.exp-done', null, h('span.ok', { html: SB.icon('check') }), h('div', null, h('b', null, 'Export completed'),
            h('p', null, `${saved} • ${(out.blob.size / 1048576).toFixed(1)} MB${files.length > 1 ? ` • ${files.length} files in a ZIP` : ''}`),
            saved !== out.name ? h('p.hint', null, `Unzip it to get ${out.name}.`) : null, note.trim() ? h('p.hint', null, note.trim()) : null, bakeNote(baked, o.kind, still))));
          go.hidden = false; go.textContent = 'Export again';
        }
        catch (e) { console.error(e); bar.hidden = true; status.textContent = e === 'cancel' ? 'Export stopped.' : 'Export failed: ' + (e && e.message ? e.message : e); go.hidden = false; go.textContent = 'Try again'; }
        finally { S.exporting = false; S.cancelExport = false; cancel.textContent = 'Close'; SB.media.sync(false, true); SB.dirty(); }
      }, { cls: 'primary' });
      const cancel = h('button.btn.ghost', { type: 'button', onclick: () => { if (S.exporting) { S.cancelExport = true; status.textContent = 'Stopping…'; } else dlg.close(); } }, 'Cancel');

      /** A drop-down with a check box per screen. */
      function screenPicker() {
        settle(); const all = pool(), label = !all.length ? 'No screen fits this format' : chosen().length === all.length && all.length > 1 ? `All screens (${all.length})` : chosen().map(s => s.name).join(', ');
        const d = h('details.msel', null, h('summary', null, h('span', null, label || 'Pick a screen')),
          h('div.msel-list', null,
            all.length > 2 ? h('label.chk', null, Object.assign(h('input', { type: 'checkbox' }), { checked: o.screens.length === all.length, onchange: e => { o.screens = e.target.checked ? all.map(s => s.id) : [act.id]; o.allEngine = e.target.checked; form(true); } }), h('b', null, 'All screens')) : null,
            ...S.screens.filter(s => !fits(s) && !s.editOf).map(s => h('label.chk.off', { title: `Can't export to this format: ${why(s)}. Change the screen's mode in Settings.` }, Object.assign(h('input', { type: 'checkbox', disabled: true }), { checked: false }), `${s.name}`, h('small', null, ` ${why(s)}`))),
            ...all.map(s => h('label.chk', null, Object.assign(h('input', { type: 'checkbox' }), { checked: o.screens.includes(s.id), onchange: e => { o.screens = e.target.checked ? all.filter(x => o.screens.includes(x.id) || x === s).map(x => x.id) : o.screens.filter(id => id !== s.id); if (!o.screens.length) o.screens = [s.id]; o.allEngine = o.screens.length === all.length; form(true); } }), `${s.name}`, h('small', null, ` ${s.proj.w}×${s.proj.h} · ${U.r2(s.proj.duration)}s`)))));
        return d;
      }
      const seg = (v, opts, pick) => W.seg(v, opts, pick);
      function form(keepOpen) {
        if (o.kind !== 'sheet' && o.ifmt === 'svg') o.ifmt = 'png'; // SVG cells are for sheets
        const isGif = o.kind === 'gif', vec = o.kind === 'svg' || o.kind === 'svgix', wasOpen = keepOpen && body.querySelector('details.msel[open]'), video = o.kind === 'video', baked = !!BAKED[o.kind], engine = !!ENGINE[o.kind];
        const F = baked || vec || isGif ? { alpha: true, info: INFO[o.kind] } : video ? VIDEO[o.vfmt] : o.ifmt === 'svg' ? { alpha: true, info: 'Vector: every frame as shapes in one SVG, sharp at any size.' } : IMAGE[o.ifmt];
        settle(); go.disabled = !chosen().length;
        if (!chosen().length) { // nothing can go into this format yet
          const T = SB.targets, r = REQ[o.kind];
          body.replaceChildren(W.row('Export as', (() => { const sel = W.select(GROUP[o.kind] || o.kind, KINDS, v => { o.kind = v === 'interactive' ? (o.lastIx || 'web') : v === 'engine' ? (o.lastEng || 'unity') : v; if (ENGINE[o.kind] && S.screens.length > 1 && o.allEngine !== false) o.screens = S.screens.map(s => s.id); form(); }, 'Export as'); sel.classList.add('kindsel'); return sel; })()),
            GROUP[o.kind] ? W.row('Format', seg(o.kind, GROUP_FMT[GROUP[o.kind]], v => { o.kind = v; if (GROUP[v] === 'interactive') o.lastIx = v; else o.lastEng = v; form(); })) : null,
            h('p.hint.warn', null, `No screen can go to ${NAME[o.kind] || o.kind} yet: ${S.screens.filter(x => !x.editOf).map(x => `${x.name} (${why(x)})`).join(', ')}. Make a screen for ${T.label(r)} in Settings › Made for, or remove what it can’t show.`));
          return;
        }
        if (!video && o.ifmt === 'avif' && !caps.avif) o.ifmt = 'webp';
        const alphaOk = baked ? true : video ? !!(F.alpha && caps.alpha && caps.webcodecs) : !!F.alpha, list = jobs(), j0 = list[0];
        const dims = engine ? `${chosen().length} screen${chosen().length > 1 ? 's' : ''} → ${chosen().length} animation${chosen().length > 1 ? 's' : ''} (${chosen().map(s => s.name).join(', ')})` : `${Math.round(j0.w * o.scale)} × ${Math.round(j0.h * o.scale)} px, ${Math.max(1, Math.round(j0.duration * o.fps))} frames${list.length > 1 ? ` (first of ${list.length} files)` : ''}`;
        const fmtOpts = baked || vec ? [] : video ? Object.entries(VIDEO).map(([k, v]) => [k, v.label, v.info]) : Object.entries(IMAGE).map(([k, v]) => [k, v.label, k === 'avif' && !caps.avif ? 'This browser can’t encode AVIF' : v.info]).concat(o.kind === 'sheet' ? [['svg', 'SVG', 'Vector: every frame as shapes, sharp at any size']] : []);
        const fmtSeg = seg(video ? o.vfmt : o.ifmt, fmtOpts, v => { if (video) o.vfmt = v; else { if (v === 'avif' && !caps.avif) return SB.toast('This browser can’t encode AVIF. Try WebP, it is small and keeps transparency too.'); o.ifmt = v; } form(); });
        if (!video && !caps.avif) { const b = fmtSeg.children[fmtOpts.findIndex(f => f[0] === 'avif')]; if (b) b.disabled = true; }
        const grp = GROUP[o.kind], grpSeg = grp ? seg(o.kind, GROUP_FMT[grp], v => { o.kind = v; if (grp === 'interactive') o.lastIx = v; else o.lastEng = v; if (ENGINE[v] && S.screens.length > 1 && o.allEngine !== false) o.screens = S.screens.map(s => s.id); form(); }) : null;
        body.replaceChildren(...[
          W.row(S.screens.length > 1 ? 'Screens' : 'Screen', screenPicker()),
          many() && !baked ? W.row('', W.check(o.combine, 'Combine them into one (as they sit on the board)', v => { o.combine = v; form(); })) : null,
          many() ? h('p.hint.exp-sub', null, engine ? 'One file: each chosen screen is one animation of the same character (layers match by the saved rig, a duplicated screen, or their name).' : o.combine && !baked ? 'One file with every chosen screen side by side. Each plays its own timeline.' : 'Separate: one file per screen, together in one ZIP.') : null,
          W.row('Export as', (() => { const sel = W.select(GROUP[o.kind] || o.kind, KINDS, v => { o.kind = v === 'interactive' ? (o.lastIx || 'web') : v === 'engine' ? (o.lastEng || 'unity') : v; if (ENGINE[o.kind] && S.screens.length > 1 && o.allEngine !== false) o.screens = S.screens.map(s => s.id); form(); }, 'Export as'); sel.classList.add('kindsel'); return sel; })()),
          grp ? W.row('Format', grpSeg) : baked || vec || isGif ? null : W.row('Format', fmtSeg),
          isGif ? W.row('Colors', W.select(o.gifColors || 256, [[256, '256 (best)'], [128, '128'], [64, '64 (smaller file)'], [32, '32 (flat art)']], v => { o.gifColors = +v; }, 'Colors'), W.check(o.gifDither !== false, 'Smooth gradients (dither)', v => { o.gifDither = v; })) : null,
          isGif ? W.row('', W.check(o.gifLoop !== false, 'Loop (play again and again)', v => { o.gifLoop = v; })) : null,
          vec ? W.row('', W.check(o.svgLoop !== false, 'Loop (play again and again)', v => { o.svgLoop = v; })) : null,
          o.kind === 'svgix' ? W.row('Starts', W.select(o.svgStart || 'click', [['click', 'When you click it'], ['hover', 'When you point at it']], v => { o.svgStart = v; }, 'When it starts')) : null,
          alphaOk && (o.kind === 'video' || isGif || o.kind === 'sheet' || o.kind === 'images' || o.kind === 'lottie' || vec) ? W.row('', W.check(video ? o.trV : o.trI, 'Transparent background', v => { if (video) o.trV = v; else o.trI = v; })) : null,
          o.kind === 'blender' ? W.row('', W.check(o.textures, 'Also save the pictures as PNG files', v => { o.textures = v; })) : null,
          o.kind === 'rive' ? W.row('', W.check(o.riveHtml !== false, 'Also save a web page that plays it (clicks, hovers and keys work)', v => { o.riveHtml = v; })) : null,
          o.kind === 'rive' && SB.interact ? h('div.row', null, W.btn('Edit interactions', () => { const m = U.$('#modal'); if (m._close) m._close(); SB.interact.open(); }, { cls: 'sm', icon: 'target', title: 'Opens Interactive mode: cards, arrows, clicks and hovers' }), h('span.hint', null, SB.interact.summary())) : null,
          (() => { // rigs with actions: which animations come out
            if (!SB.actions) return null; Sc.sync(); const acts = chosen().flatMap(sc => SB.actions.variants(sc.objects, sc.proj).map(v => v.act.name)); if (!acts.length) return null;
            return h('p.hint.exp-sub', null, engine || o.kind === 'rive' ? `Animations from the rig's actions: ${acts.join(', ')} (plus one per screen without actions).` : o.kind === 'blender' ? `One FBX per action: ${acts.join(', ')}.` : `This exports the action shown now; Unity, Godot, Blender and Rive export every action (${acts.join(', ')}).`);
          })(),
          (() => { // only when a chosen screen has something this format can't show
            const T = SB.targets, want = REQ[o.kind]; if (!T || !want) return null; Sc.sync();
            const bad = chosen().map(sc => [sc, leftOut(sc, want)]).filter(([, pr]) => pr.length); if (!bad.length) return null;
            const fmt = o.kind === 'unity' ? 'Unity' : o.kind === 'godot' ? 'Godot' : o.kind === 'lottie' ? 'Lottie' : 'Blender';
            return h('p.hint.warn', null, `${bad.map(([sc, pr]) => `${sc.name} uses ${pr.slice(0, 3).join(', ')}`).join('; ')}: ${fmt} can’t show ${bad.length > 1 || bad[0][1].length > 1 ? 'these' : 'it'}, so ${bad.length > 1 || bad[0][1].length > 1 ? 'they are' : 'it is'} left out.`); })(),
          ...bakeRows(),
          o.kind === 'lottie' ? W.row('', W.check(o.html, 'Also make a web page that plays it', v => { o.html = v; })) : null,
          MORPH_KINDS[o.kind] && hasMorph() ? W.row('Morphs', W.num(o.morphSteps ?? 3, { min: 0, max: 60, step: 1, label: 'Morph in-betweens', change: v => { o.morphSteps = Math.max(0, Math.round(+v || 0)); } }), h('span.hint', null, 'in-betweens per morph'),
            W.info(`${NAME[o.kind] || o.kind} can’t morph lines, so each morph is saved as in-between pictures that play in turn. Every morph gets this many, each shown at its own moment (even a quick morph between two frames of the export). More looks smoother but makes more pictures. One layer can have its own count: right-click it › Game engine frames….`)) : null,
          LINE_KINDS[o.kind] && hasLineMotion() ? W.row('Animated lines', W.num(o.lineFrames ?? 8, { min: 0, max: 48, step: 1, label: 'Animated line poses', change: v => { o.lineFrames = Math.max(0, Math.round(+v || 0)); } }), h('span.hint', null, 'poses per loop'),
            W.info('Lines drawn with an animated brush (boil, marching dashes, pulse, flow) become a loop of pictures that plays 12 times a second, so they keep moving in the game engine. One layer can have its own count: right-click it › Game engine frames….')) : null,
          ...((o.kind === 'unity' || o.kind === 'godot') && SB.gameLink ? [SB.gameLink.row(o, o.kind, () => form(true))].flat().filter(Boolean) : []),
          W.row('Frame rate', W.select(o.fps, [...new Set([6, 8, 10, 12, 15, 24, 25, 30, 50, 60, p.fps, o.fps])].filter(f => f >= 1).sort((a, b) => a - b).map(f => [f, f + ' fps' + (f === p.fps ? ' (the screen’s)' : '')]), v => { o.fps = +v; form(); })),
          baked ? null : W.row('Size', W.select(o.scale, [[0.25, '25%'], [0.5, '50%'], [0.75, '75%'], [1, '100%'], [1.5, '150%'], [2, '200%']], v => { o.scale = +v; form(); })),
          baked || vec || isGif || o.ifmt === 'svg' ? null : video ? W.row('Quality', W.select(o.quality, [[0.07, 'Standard (smaller file)'], [0.14, 'High'], [0.25, 'Best']], v => o.quality = +v)) : F.lossy ? W.row('Quality', W.select(o.iq, [[0.6, 'Small file'], [0.85, 'High'], [0.95, 'Best']], v => o.iq = +v)) : null,
          o.kind === 'sheet' ? W.row('Columns', W.select(o.cols, [[0, 'Automatic'], [4, '4'], [8, '8'], [16, '16'], [1000, 'One row']], v => o.cols = +v)) : null,
          o.kind === 'sheet' && o.ifmt !== 'svg' && SB.sheetEditor ? W.row('Layout', W.btn('Arrange frames…', () => SB.sheetEditor.open(j0, Object.assign({}, o, { transparent: o.trI })).then(() => form(true)), { cls: 'sm', icon: 'frames', title: 'Order, delete, name and group the frames; remove duplicates; keep every frame in the same cell when you export again' }), h('span.hint', null, SB.sheetEditor.has(j0) ? 'Your saved layout is used.' : 'Every frame, in order.')) : null,
          o.kind === 'sheet' ? W.row('', W.check(o.json, 'Include the JSON data file (Phaser, PixiJS…)', v => o.json = v)) : null,
          h('p.hint', null, `${dims}. ${F.info}${video && !caps.webcodecs ? ' This browser has no video encoder: the animation is recorded while it plays (MP4 or WebM only).' : ''}`)].filter(Boolean));
        if (wasOpen) { const d = body.querySelector('details.msel'); if (d) d.open = true; }
      }
      form();
      const closeMsel = e => { const d = body.querySelector('details.msel[open]'); if (d && !d.contains(e.target)) d.open = false; };
      document.addEventListener('pointerdown', closeMsel, true);
      const dlg = SB.dialog.sheet([h('h2', null, 'Export'), h('p.sub', null, 'Renders right here on your device. Nothing is uploaded.'), body, h('div.sheet-actions', null, cancel, go)], { size: 'mid', sticky: false, onClose: () => { if (S.exporting) S.cancelExport = true; document.removeEventListener('pointerdown', closeMsel, true); } });
    },
  };
})(window.SB);
