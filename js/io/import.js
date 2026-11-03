/* Importing files. Each file type is an importer in SB.importers:
     { id, label, test(file) → bool, run(file) }
   Add a new format by registering another importer. */
'use strict';
(function (SB) {
  const U = SB.util, S = SB.state, tree = SB.tree;
  const ext = f => (f.name.split('.').pop() || '').toLowerCase();
  const baseName = f => f.name.replace(/\.[^.]+$/, '').slice(0, 40);

  const IO = SB.io = {
    /** Open the system file picker. */
    pick(accept, multiple, cb) {
      const inp = U.h('input', { type: 'file', accept, multiple: !!multiple, style: { display: 'none' } });
      inp.onchange = () => { const files = [...inp.files]; inp.remove(); if (files.length) cb(files); };
      document.body.appendChild(inp); inp.click();
    },
    async importFiles(files) {
      for (const f of [...files]) {
        const imp = SB.importers.all().find(i => i.test(f));
        if (!imp) { SB.toast(`${f.name} isn't a file this app can open.`); continue; }
        if (SB.targets && /^(video|audio)\//.test(f.type) && !SB.targets.allows(f.type.slice(0, 5))) { SB.targets.blocked(f.type.startsWith('video') ? 'Video' : 'Sound'); continue; }
        try { await imp.run(f); } catch (e) { console.error(e); SB.toast(e.message || `Couldn't open ${f.name}.`); }
      }
    },
    /** Add an image file as a layer that fits inside the canvas. */
    async addImageBlob(blob, name, extra) {
      const p = S.project, m = await SB.media.add(blob, name, 'image'), f = Math.min(1, p.w * 0.6 / m.w, p.h * 0.6 / m.h);
      return tree.add(tree.make('image', Object.assign({ name, mediaId: m.id, w: Math.round(m.w * f), h: Math.round(m.h * f) }, extra)));
    },
    /** Add images as extra frames of the selected image layer. */
    async imageFrames(files) {
      const o = tree.sel(); if (!o || o.type !== 'image') return;
      let i = SB.frames.currentIndex(o);
      for (const f of files) { try { const m = await SB.media.add(f, f.name, 'image'); o.frames.splice(++i, 0, { strokes: [], mediaId: m.id }); } catch (e) { SB.toast(e.message); } }
      SB.commit(); SB.frames.go(o, i);
    },
  };

  // ---------- paste from the system clipboard: pictures and SVG copied in other apps or the browser
  // Ctrl+V waits a moment for the browser's paste event; if it carries a picture or SVG, that is imported,
  // otherwise the layers copied inside the app are pasted.
  // Copying layers here also puts a marker on the system clipboard, so the newest copy wins: a picture
  // copied elsewhere afterwards is pasted as a picture, layers copied here afterwards paste as layers.
  let pending = 0, copiedAt = 0, mark = '';
  const MARK = 'storyboard-studio-clip:';
  SB.clipIn = {
    key() { clearTimeout(pending); pending = setTimeout(() => { pending = 0; SB.ops.paste(); }, 150); },
    copied() { copiedAt = performance.now(); mark = MARK + Date.now(); },
    async take(dt) {
      if (!dt) return false; const files = [...(dt.files || [])].filter(f => /^image\//.test(f.type));
      if (!files.length) for (const it of dt.items || []) if (it.kind === 'file' && /^image\//.test(it.type)) { const f = it.getAsFile(); if (f) files.push(f); }
      const txt = dt.getData('text/plain') || '', html = dt.getData('text/html') || '', svg = (/<svg[\s>]/i.test(txt) ? txt : /<svg[\s>]/i.test(html) ? html.slice(html.search(/<svg[\s>]/i), html.toLowerCase().lastIndexOf('</svg>') + 6) : '').trim();
      if (svg && svg.includes('</svg>')) { await SB.svg.importText(svg.slice(svg.search(/<svg[\s>]/i)), 'Pasted SVG', 'layers'); return true; }
      const svgFile = files.find(f => f.type === 'image/svg+xml'); if (svgFile) { await SB.svg.importText(await svgFile.text(), 'Pasted SVG', 'layers'); return true; }
      if (files.length) { for (const f of files) { const nm = f.name && f.name !== 'image.png' ? f.name.replace(/\.[^.]+$/, '').slice(0, 40) : 'Pasted image'; await IO.addImageBlob(f, nm); } SB.toast(files.length > 1 ? `${files.length} pictures pasted.` : 'Picture pasted.'); return true; }
      return false;
    },
  };
  addEventListener('copy', e => { // right after Ctrl+C / Ctrl+X on layers: mark the system clipboard
    if (performance.now() - copiedAt > 400 || !e.clipboardData) return; const t = e.target; if (t && (t.isContentEditable || /^(INPUT|TEXTAREA)$/.test(t.tagName))) return;
    e.clipboardData.setData('text/plain', mark); e.preventDefault();
  });
  addEventListener('cut', e => { if (performance.now() - copiedAt > 400 || !e.clipboardData) return; e.clipboardData.setData('text/plain', mark); e.preventDefault(); });
  addEventListener('paste', async e => {
    const t = e.target, typing = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)); if (typing) return;
    const dt = e.clipboardData;
    if (dt && (dt.getData('text/plain') || '').startsWith(MARK)) { e.preventDefault(); if (pending) { clearTimeout(pending); pending = 0; SB.ops.paste(); } return; } // our own layers: paste them
    const has = dt && ([...(dt.items || [])].some(it => it.kind === 'file' && /^image\//.test(it.type)) || /<svg[\s>]/i.test(dt.getData('text/plain') || '') || /<svg[\s>]/i.test(dt.getData('text/html') || ''));
    if (!has) return; e.preventDefault(); clearTimeout(pending); pending = 0;
    try { await SB.clipIn.take(dt); } catch (err) { console.error(err); SB.toast('Couldn’t paste that: ' + (err.message || err)); }
  });

  SB.importers.add({ id: 'svg', label: 'SVG', test: f => /svg/.test(f.type) || ext(f) === 'svg', run: f => SB.svg.importFile(f) });
  SB.importers.add({ id: 'psd', label: 'Photoshop', test: f => ext(f) === 'psd', run: importPsd });
  SB.importers.add({ id: 'pdf', label: 'Illustrator / PDF', test: f => ext(f) === 'pdf' || ext(f) === 'ai', run: importPdf });
  SB.importers.add({ id: 'image', label: 'Image', test: f => (f.type || '').startsWith('image/') || /^(png|jpe?g|gif|webp|bmp|avif)$/.test(ext(f)), run: f => { SB.toast(`Adding ${f.name}…`); return IO.addImageBlob(f, baseName(f)); } });
  SB.importers.add({ id: 'video', label: 'Video', test: f => (f.type || '').startsWith('video/') || /^(mp4|webm|mov|m4v|ogv)$/.test(ext(f)), run: async f => {
    SB.toast(`Adding ${f.name}…`); const p = S.project, m = await SB.media.add(f, f.name, 'video'), vw = m.w || 1280, vh = m.h || 720, k = Math.min(p.w / vw, p.h / vh);
    tree.add(tree.make('video', { name: baseName(f), mediaId: m.id, w: Math.round(vw * k), h: Math.round(vh * k), dur: U.r2(isFinite(m.duration) ? m.duration : 5) }));
  } });
  SB.importers.add({ id: 'audio', label: 'Audio', test: f => (f.type || '').startsWith('audio/') || /^(mp3|wav|ogg|m4a|aac|flac|opus)$/.test(ext(f)), run: async f => {
    SB.toast(`Adding ${f.name}…`); const m = await SB.media.add(f, f.name, 'audio'); let d = m.duration; if (!isFinite(d)) { try { await SB.media.decode(m); d = m.duration; } catch (e) { d = 5; } }
    tree.add(tree.make('audio', { name: baseName(f), mediaId: m.id, dur: U.r2(d || 5) }));
  } });

  async function importPsd(file) {
    const doc = SB.psd.parse(await file.arrayBuffer()), p = S.project, name = baseName(file), f = Math.min(p.w * 0.9 / doc.W, p.h * 0.9 / doc.H, 1);
    let mode = 'flat';
    if (doc.layers.length > 1) { mode = await SB.dialog.ask(`Import ${name}`, `${name} has ${doc.layers.length} layers. Bring each one in as its own layer, or as one flat picture?`, [{ v: 'flat', label: 'One picture' }, { v: 'layers', label: 'Separate layers', primary: true }]); if (!mode) return; }
    SB.toast(`Adding ${name}…`);
    if (mode === 'layers' || !doc.comp) {
      // file order is bottom to top. A layer with "clipping" is cut by the nearest normal layer below it:
      // that becomes a group whose bottom layer is a visible mask (drawn behind, as in Photoshop)
      const made = []; let base = null;
      for (const L of doc.layers) {
        const w = L.right - L.left, h = L.bottom - L.top, D = L.data; if (!D[0] && !D[1] && !D[2]) continue;
        const m = await SB.media.add(await U.canvasBlob(SB.psd.toCanvas(w, h, D[0], D[1], D[2], D[-1])), `${L.name || 'layer'}.png`, 'image');
        const o = tree.make('image', { name: (L.name || 'Layer').slice(0, 40), mediaId: m.id, w: U.r1(w * f), h: U.r1(h * f), x: U.r1((L.left + w / 2 - doc.W / 2) * f), y: U.r1((L.top + h / 2 - doc.H / 2) * f), opacity: U.r2(L.opacity / 255), hidden: L.hidden });
        if (L.clipping && base) { base.clipped.push(o); continue; }
        base = { o, clipped: [] }; made.push(base);
      }
      if (!made.length) return SB.toast(`No pixel layers found in ${name}.`);
      const kids = made.map(({ o, clipped }) => {
        if (!clipped.length) return o;
        const g = tree.makeGroup([...clipped.reverse(), o], o.name + ' (clipping)', 0, 0, false); o.isMask = 'in'; o.maskVisible = true; if (o.hidden) { g.hidden = true; o.hidden = false; } return g;
      });
      kids.reverse(); tree.add(tree.makeGroup(kids, name, p.w / 2, p.h / 2, false));
    } else { const c = doc.comp; await IO.addImageBlob(await U.canvasBlob(SB.psd.toCanvas(doc.W, doc.H, c[0], c[1], c[2], c[3])), name); }
    SB.toast(`Added ${name}.`);
  }

  // Illustrator (.ai) and PDF pages are drawn with PDF.js, loaded only when needed.
  let pdfLib = null;
  function loadPdfJs() {
    if (pdfLib) return pdfLib; const base = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
    pdfLib = new Promise((res, rej) => { const s = document.createElement('script'); s.src = base + 'pdf.min.js'; s.onload = () => { if (!window.pdfjsLib) return rej(new Error('PDF reader missing')); window.pdfjsLib.GlobalWorkerOptions.workerSrc = base + 'pdf.worker.min.js'; res(window.pdfjsLib); }; s.onerror = () => { pdfLib = null; rej(new Error('Couldn’t load the PDF reader. Check your connection.')); }; document.head.appendChild(s); });
    return pdfLib;
  }
  async function importPdf(file) {
    const ab = await file.arrayBuffer(), head = new TextDecoder().decode(new Uint8Array(ab, 0, Math.min(1024, ab.byteLength))), name = baseName(file), p = S.project;
    if (!head.includes('%PDF')) return SB.toast(`${name} has no PDF data inside. In Illustrator, save with “Create PDF Compatible File”, or export as SVG.`);
    SB.toast(`Opening ${name}…`);
    const lib = await loadPdfJs(), pdf = await lib.getDocument({ data: new Uint8Array(ab) }).promise; let pages = 1;
    if (pdf.numPages > 1) { const v = await SB.dialog.ask(`Import ${name}`, `This file has ${pdf.numPages} pages or artboards.`, [{ v: 1, label: 'First one only' }, { v: pdf.numPages, label: 'All of them', primary: true }]); if (!v) return; pages = v; }
    // vector layers keep groups and clipping masks (as mask layers); a picture is exact but flat
    const how = lib.SVGGraphics ? await SB.dialog.ask(`Import ${name}`, 'Vector layers keep the shapes editable, and clipping masks become mask layers. A picture looks exactly like the file but is flat.', [{ v: 'image', label: 'As a picture' }, { v: 'vector', label: 'Vector layers', primary: true }]) : 'image';
    if (!how) return;
    if (how === 'vector') {
      for (let i = 1; i <= pages; i++) {
        const page = await pdf.getPage(i), vp = page.getViewport({ scale: 1 }), ops = await page.getOperatorList(), gfx = new lib.SVGGraphics(page.commonObjs, page.objs); gfx.embedFonts = false;
        const svg = await gfx.getSVG(ops, vp), text = new XMLSerializer().serializeToString(svg);
        await SB.svg.importText(text, pages > 1 ? `${name} ${i}` : name, 'layers');
      }
      return SB.toast(`Added ${name} as vector layers.`);
    }
    const made = [];
    for (let i = 1; i <= pages; i++) {
      const page = await pdf.getPage(i), vp0 = page.getViewport({ scale: 1 }), fit = Math.min(p.w * 0.9 / vp0.width, p.h * 0.9 / vp0.height), sc = U.clamp(fit * 2, 0.5, 4096 / Math.max(vp0.width, vp0.height)), vp = page.getViewport({ scale: sc });
      const cv = document.createElement('canvas'); cv.width = Math.ceil(vp.width); cv.height = Math.ceil(vp.height); await page.render({ canvasContext: cv.getContext('2d'), viewport: vp, background: 'rgba(0,0,0,0)' }).promise;
      const m = await SB.media.add(await U.canvasBlob(cv), `${name}-${i}.png`, 'image');
      made.push(tree.make('image', { name: pages > 1 ? `${name} ${i}` : name, mediaId: m.id, w: U.r1(vp0.width * fit), h: U.r1(vp0.height * fit), x: pages > 1 ? 0 : p.w / 2, y: pages > 1 ? 0 : p.h / 2 }));
    }
    if (made.length > 1) tree.add(tree.makeGroup(made.reverse(), name, p.w / 2, p.h / 2, false)); else tree.add(made[0]);
    SB.toast(`Added ${name}.`);
  }
})(window.SB);
