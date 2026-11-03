/* Brush picker (from the brush chip) and the brush editor. */
'use strict';
(function (SB) {
  const U = SB.util, S = SB.state, h = U.h, W = SB.w;
  const ink = () => U.cssVar('--ink') || '#24213F';
  const pick = id => { const b = S.brushes.find(x => x.id === id); if (!b) return; S.brushId = id; S.brush.size = b.size; SB.prefs.save(); SB.invalidate('ctxbar'); };

  // ---------- brushes in files: a brushes file ({ app: 'storyboard-studio-brushes', brushes, textures }) and the project's own
  // "brushes folder" (doc.brushes, saved in the project file: its brushes are added to yours when the project opens)
  const FILE_APP = 'storyboard-studio-brushes';
  const texFor = list => { const out = {}; list.forEach(b => { if (b.tx === 'img' && b.img && !b.img.startsWith('b:')) { const t = SB.brushTex.texOf(b.img); if (t) out[b.img] = t; } }); return out; };
  /** Add brushes (and their pictures) to this device's list; a brush with the same id is updated. Returns the last one added. */
  function addBrushes(list, textures) {
    S.brushTex = Object.assign({}, textures || {}, S.brushTex); let last = null;
    for (const src of list || []) { if (!src || !src.id || !src.name) continue; const b = U.deep(src), i = S.brushes.findIndex(x => x.id === b.id); if (i >= 0) S.brushes[i] = Object.assign(S.brushes[i], b); else S.brushes.push(b); last = b.id; }
    SB.prefs.save(); SB.invalidate('ctxbar'); return last;
  }
  SB.on('doc', () => { const d = S.doc && S.doc.brushes; if (d && d.length) addBrushes(d, S.doc.brushTex); }); // opening a project brings its brushes
  const B = SB.brushUI = {
    /** Is brush b kept in this project's file? */
    inProject: b => !!(S.doc.brushes || []).some(x => x.id === b.id),
    toProject(b, on) {
      const list = (S.doc.brushes || []).filter(x => x.id !== b.id); if (on) { list.push(U.deep(b)); if (b.tx === 'img' && b.img) SB.brushTex.keep(b.img); }
      if (list.length) S.doc.brushes = list; else delete S.doc.brushes; SB.commit(); SB.toast(on ? `${b.name} is kept in this project (it opens with the project anywhere).` : `${b.name} is no longer kept in this project.`);
    },
    /** Save brushes (with the pictures they use) to a .json file. */
    async exportFile(list) {
      const data = { app: FILE_APP, v: 1, brushes: U.deep(list), textures: texFor(list) };
      const ok = await SB.exporter.saveFile('brushes.json', new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' })); if (ok) SB.toast(`Saved ${list.length} brush${list.length > 1 ? 'es' : ''}.`);
    },
    /** Add brushes from a brushes file, or the brushes kept in a project file. */
    importFile(then) {
      SB.io.pick('.json,application/json', false, async f => {
        try { const d = JSON.parse(await f[0].text()); let list = null, tex = null;
          if (d && d.app === FILE_APP) { list = d.brushes; tex = d.textures; } else if (d && d.app === 'storyboard-studio') { list = d.doc && d.doc.brushes; tex = d.doc && d.doc.brushTex; } else if (Array.isArray(d)) list = d;
          if (!list || !list.length) return SB.toast('No brushes in that file.');
          const id = addBrushes(list, tex); SB.toast(`Added ${list.length} brush${list.length > 1 ? 'es' : ''}.`); if (then) then(id);
        } catch (e) { SB.toast("Couldn't read that file."); }
      });
    },
    /** The brush list. With onPick(brush) it restyles something (lines you drew) instead of choosing the brush to draw with;
        current: the id to mark. */
    picker(anchor, onPick, current) {
      const on = current !== undefined ? current : S.brushId;
      const grid = h('div.pop-list', null, onPick ? h('div.pop-h', null, 'Line style') : null, S.brushes.map(b => { const cv = h('canvas', { width: 216, height: 64 }); const btn = h('button' + (b.id === on ? '.on' : ''), { type: 'button', onclick: () => { SB.popover.close(); onPick ? onPick(b) : pick(b.id); } }, cv, b.name); setTimeout(() => SB.brush.preview(cv, b, ink()), 0); return btn; }),
        h('button.wide', { type: 'button', html: SB.icon('rows') + 'Edit brushes…', onclick: () => { SB.popover.close(); B.editor(); } }));
      SB.popover(anchor, grid);
    },
    /** A "Line style" button: restyles the strokes list() with the brush you pick (each keeps its color and width). */
    styleBtn(list, opt = {}) {
      const first = list()[0], cur = first ? SB.brush.matching(first) : null;
      return W.btn(cur ? cur.name : 'Line style', e => B.picker(e.currentTarget, b => { const l = list(); l.forEach(st => SB.brush.apply(b, st)); SB.commit(); SB.invalidate('ctxbar'); SB.toast(`${l.length} line${l.length === 1 ? '' : 's'} now drawn with ${b.name}.`); }, cur ? cur.id : null),
        { cls: 'sm val', icon: 'brush', title: opt.title || 'Line style: draw these lines with another brush (they keep their color and width)' }); // val: shows a value (the brush), so it keeps its text
    },
    /** The brush editor: brushes on the left; on the right a test pad (draw on it, a pen's pressure works there too)
        and the brush's settings as picture tiles: its kind, its picture and how the picture follows the line, its shape, its animation. */
    editor(sel = S.brushId) {
      const BT = SB.brushTex, pad = []; let raf = 0, t0 = performance.now(), dlg = null;
      // three kinds, each with its own choices: a solid line (smooth, soft edge, marker), a textured line (any texture or picture,
      // and how it is used along the line), a broken line (dashed, sketchy). Size, thin ends, pressure and animation are shared.
      const KINDS = [['solid', 'Solid', 'One color: smooth, soft-edged or marker'], ['texture', 'Texture', 'Grain, a picture of yours or a drawing from the stage, inside the line or along it'], ['broken', 'Broken line', 'Dashed or sketchy']];
      const LOOKS = { solid: [['solid', 'Smooth'], ['soft', 'Soft edge'], ['marker', 'Marker']], broken: [['dashed', 'Dashed'], ['rough', 'Sketchy']] };
      const kindOf = b => ['pencil', 'chalk', 'img'].includes(b.tx) ? 'texture' : ['dashed', 'rough'].includes(b.tx) ? 'broken' : 'solid';
      const texOfB = b => b.tx === 'pencil' ? 'b:pencil' : b.tx === 'chalk' ? 'b:chalk' : b.img || 'b:leaf';
      const useOf = b => b.tx === 'pencil' || b.tx === 'chalk' ? 'grain' : b.im || 'stamp';
      /** Texture tex used as use ('grain' | 'stamp' | 'stretch' | 'pattern'): pencil and chalk inside the line keep their classic look. */
      const setTex = (b, tex, use) => { if ((tex === 'b:pencil' || tex === 'b:chalk') && use === 'grain') { b.tx = tex.slice(2); delete b.img; delete b.im; } else { b.tx = 'img'; b.img = tex; b.im = use; } };
      const sample = (b, over) => Object.assign(U.deep(b), over);
      const tile = (on, label, paint, run, title) => { const cv = h('canvas', { width: 156, height: 52 }); setTimeout(() => paint(cv), 0); return h('button.bm-tile' + (on ? '.on' : ''), { type: 'button', title: title || label, onclick: run }, cv, h('span', null, label)); };
      const render = () => {
        const b = S.brushes.find(x => x.id === sel) || S.brushes[0]; sel = b.id; const col = ink();
        const prev = h('canvas.bm-pad', { width: 900, height: 240, title: 'Draw here to try the brush' });
        const drawPad = () => { const T = (performance.now() - t0) / 1000; if (!pad.length) return SB.brush.preview(prev, b, col, T, !!S.penSeen); // with a pen around, the sample shows pressure (light to hard)
          const c = prev.getContext('2d'); c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, prev.width, prev.height);
          SB.strokes.draw(c, pad.map(q => { const st = { c: col, s: b.size, pts: q.pts }; SB.brush.apply(b, st, false); if (q.prs && (b.pr ?? 1) > 0) { const wp = SB.brush.pressureProfile(q.pts, q.prs, b.pr ?? 1); if (wp) st.wp = wp; } return st; }), { T }); };
        const redraw = () => { drawPad(); listCanvases(); SB.prefs.save(); };
        const set = (k, v, full) => { b[k] = v; if (k === 'size' && b.id === S.brushId) S.brush.size = v; SB.prefs.save(); full ? render() : redraw(); };
        // the test pad: draw with mouse, finger or pen
        prev.addEventListener('pointerdown', e => { const r = prev.getBoundingClientRect(), sx = prev.width / r.width, sy = prev.height / r.height, q = { pts: [], prs: e.pointerType === 'pen' ? [] : null }; pad.push(q); prev.setPointerCapture(e.pointerId);
          const add = ev => { q.pts.push(Math.round((ev.clientX - r.left) * sx * 10) / 10, Math.round((ev.clientY - r.top) * sy * 10) / 10); if (q.prs) q.prs.push(ev.pressure || 0.5); };
          add(e); const mv = ev => { (ev.getCoalescedEvents ? ev.getCoalescedEvents() : [ev]).forEach(add); drawPad(); }, up = () => { prev.removeEventListener('pointermove', mv); prev.removeEventListener('pointerup', up); prev.removeEventListener('pointercancel', up); if (pad.length === 1) render(); else drawPad(); }; // the first test line: show Clear
          prev.addEventListener('pointermove', mv); prev.addEventListener('pointerup', up); prev.addEventListener('pointercancel', up); });
        const pct = (label, k, max, o = {}) => W.row(label, W.range(Math.round((b[k] ?? o.def ?? 0) * 100), { min: o.min ?? 0, max, label, input: v => set(k, v / 100) }), o.after || null);
        const list = h('div.bm-list', null, S.brushes.map(x => h('button' + (x.id === b.id ? '.on' : ''), { type: 'button', onclick: () => { sel = x.id; render(); } }, h('canvas', { width: 320, height: 56, dataset: { id: x.id } }), h('span', null, x.name, x.an && x.an.k ? h('small.bm-badge', null, 'animated') : null))));
        const listCanvases = () => list.querySelectorAll('canvas').forEach(cv => { const x = S.brushes.find(y => y.id === cv.dataset.id); if (x) SB.brush.preview(cv, x, col); });
        const act = (label, fn, cls = 'sm') => W.btn(label, () => { fn(); SB.prefs.save(); render(); }, { cls });
        const sec = (title, ...body) => h('section.bm-sec', null, h('h4', null, title), ...body);
        // kind, then what that kind can do
        const kind = kindOf(b), look = (k, x) => sample(b, Object.assign({ an: null }, x));
        const kinds = h('div.bm-tiles', null, KINDS.map(([k, label, tip]) => tile(kind === k, label, cv => SB.brush.preview(cv, k === kind ? look() : k === 'texture' ? look({ tx: 'img', img: 'b:leaf', im: 'stamp' }) : look({ tx: k === 'broken' ? 'dashed' : 'solid' }), col), () => { if (k === kind) return; if (k === 'texture') setTex(b, 'b:pencil', 'grain'); else b.tx = k === 'broken' ? 'dashed' : 'solid'; SB.prefs.save(); render(); }, tip)));
        let kindSec = null;
        if (kind !== 'texture') kindSec = sec(kind === 'solid' ? 'Look' : 'Style', h('div.bm-tiles', null, LOOKS[kind].map(([k, label]) => tile((b.tx || 'solid') === k, label, cv => SB.brush.preview(cv, look({ tx: k }), col), () => set('tx', k, true)))),
          b.tx === 'dashed' ? W.row('Dash length', W.range(Math.round((b.dl ?? 1.8) * 10) / 10, { min: 0, max: 12, step: 0.1, label: 'Dash length (times the width)', input: v => set('dl', v) }), h('span.hint', null, '× width')) : null,
          b.tx === 'dashed' ? W.row('Space', W.range(Math.round((b.dg ?? 1.4) * 10) / 10, { min: 0.2, max: 12, step: 0.1, label: 'Space between dashes (times the width)', input: v => set('dg', v) }), h('span.hint', null, '× width')) : null);
        else {
          const tex = texOfB(b), use = useOf(b), texIds = [...Object.keys(BT.builtIn()), ...Object.keys(S.brushTex || {}).filter(k => !k.startsWith('b:'))];
          const file = h('input', { type: 'file', accept: 'image/*', style: { display: 'none' } });
          file.onchange = async () => { const f = file.files && file.files[0]; if (!f) return; try { const id = await BT.fromFile(f); setTex(b, id, use === 'grain' ? 'stamp' : use); SB.prefs.save(); render(); SB.toast('Picture added. Tip: a picture with a see-through background works best.'); } catch (err) { SB.toast(err.message || 'Could not read that picture.'); } };
          const fromStage = () => { const keep = b.id; dlg.close(); SB.picker.start({ title: 'Pick a drawing or shape on the stage to use as the brush’s picture', test: o => { const d = SB.types.get(o.type); return d && d.visual && d.render !== false && o.type !== 'group' && o.type !== 'video' && o.type !== 'audio'; },
            done: c => { const id = BT.fromLayer(c.o); const bb = S.brushes.find(x => x.id === keep); if (id && bb) { setTex(bb, id, useOf(bb) === 'grain' ? 'stamp' : useOf(bb)); SB.prefs.save(); SB.toast(`${c.o.name} is the brush’s picture now.`); } else SB.toast('That layer has nothing drawn to use.'); B.editor(keep); }, cancelled: () => B.editor(keep) }); };
          const thumbs = h('div.bm-tex', null, texIds.map(id => { const t = BT.texOf(id); if (!t) return null; const own = !id.startsWith('b:');
            return h('div.bm-texi' + (tex === id ? '.on' : ''), null, h('button', { type: 'button', title: t.name || 'Picture', onclick: () => { setTex(b, id, use); SB.prefs.save(); render(); } }, h('img', { src: t.src, alt: t.name || '' })),
              own ? h('button.x', { type: 'button', title: 'Remove this picture from the list (lines that use it keep it)', html: SB.icon('x'), onclick: () => { const nx = Object.assign({}, S.brushTex); delete nx[id]; S.brushTex = nx; if (b.img === id) setTex(b, 'b:leaf', use === 'grain' ? 'stamp' : use); SB.prefs.save(); render(); } }) : null); }),
            h('button.bm-add', { type: 'button', title: 'Use a picture of your own (PNG with a see-through background works best)', html: SB.icon('plus') + '<span>Your picture…</span>', onclick: () => file.click() }),
            h('button.bm-add', { type: 'button', title: 'Use a drawing, shape or text from the stage as the picture (as it looks now)', html: SB.icon('target') + '<span>From the stage…</span>', onclick: fromStage }), file);
          const USES = [['grain', 'Inside the line', 'The texture fills the line, like paper grain'], ...BT.MODES.filter(m => m[0] !== 'grain')];
          const uses = h('div.bm-tiles', null, USES.map(([k, label, tip]) => tile(use === k, label, cv => { const B2 = look(); setTex(B2, tex, k); SB.brush.preview(cv, B2, col); }, () => { setTex(b, tex, k); SB.prefs.save(); render(); }, tip)));
          const pic = b.tx === 'img', im = use;
          kindSec = sec('Texture', thumbs, h('div.bm-sub', null, 'How the texture is used'), uses,
            pic ? W.row('Color', W.seg(b.ikeep ? 'own' : 'line', [['line', 'Line color', 'The texture takes the color you draw with'], ['own', 'Its own colors', 'The texture keeps its colors']], v => set('ikeep', v === 'own' ? 1 : 0, true))) : null,
            im === 'stamp' || im === 'pattern' ? pct(im === 'stamp' ? 'Spacing %' : 'Length %', 'isp', 300, { min: 10, def: im === 'stamp' ? 0.6 : 1 }) : null,
            im === 'stamp' ? pct('Scatter %', 'isc', 100) : null, im === 'stamp' ? pct('Size change %', 'isz', 100) : null, im === 'stamp' ? pct('Turn randomly %', 'irot', 100) : null,
            im === 'stamp' ? W.row('', W.check(!b.ifix, 'Turn with the line', v => set('ifix', v ? 0 : 1))) : null);
        }
        // animation
        const an = b.an || {}, anims = h('div.bm-tiles', null, BT.ANIMS.map(([k, label, tip]) => tile((an.k || '') === k, label, cv => { const B2 = sample(b, { an: k ? { k, sp: an.sp ?? 1, a: an.a ?? 0.5 } : null }); let T = 0; const go = () => { if (!cv.isConnected) return; SB.brush.preview(cv, B2, col, T); if (k) { T += 1 / 30; setTimeout(go, 33); } }; go(); }, () => set('an', k ? { k, sp: an.sp ?? 1, a: an.a ?? 0.5 } : null, true), tip)));
        const anim = sec('Animation', h('p.hint', null, 'Animated lines move by themselves while the animation plays (in the app, videos, GIFs and web pages). Unity and Godot exports can bake them into a loop of pictures; Lottie gets them still.'), anims,
          an.k ? W.row('Speed', W.range(Math.round((an.sp ?? 1) * 100), { min: 10, max: 400, label: 'Speed', input: v => { b.an.sp = v / 100; redraw(); } })) : null,
          an.k ? W.row('Amount', W.range(Math.round((an.a ?? 0.5) * 100), { min: 5, max: 100, label: 'Amount', input: v => { b.an.a = v / 100; redraw(); } })) : null);
        const shape = sec('Shape',
          W.row('Size', W.range(b.size, { min: 1, max: 80, label: 'Size', input: v => set('size', v) })),
          pct('Opacity %', 'op', 100, { min: 5 }), pct('Thin start %', 'ts', 100), pct('Thin end %', 'te', 100), pct('Wobble %', 'jit', 60),
          pct('Pen pressure %', 'pr', 100, { def: 1, after: W.info('How much a pen’s pressure (graphics tablet, stylus) changes the size: 0% ignores it, 100% goes from very thin (light) to the full size (hard).') }));
        const name = h('input.bm-name', { type: 'text', value: b.name, 'aria-label': 'Brush name' }); name.onchange = () => { b.name = name.value || b.name; SB.prefs.save(); render(); };
        const sheet = h('div.bm2', null,
          h('div.bm2-side', null, h('h2', null, 'Brushes'), list, h('div.row.wrap', null, act('New', () => { const nb = { id: U.uid(), name: 'My brush', tx: 'solid', size: 10, op: 1, ts: 0.3, te: 0.5, jit: 0 }; S.brushes.push(nb); sel = nb.id; }), act('Duplicate', () => { const nb = Object.assign(U.deep(b), { id: U.uid(), name: b.name + ' copy' }); S.brushes.splice(S.brushes.indexOf(b) + 1, 0, nb); sel = nb.id; }),
            S.brushes.length > 1 ? act('Delete', () => { S.brushes.splice(S.brushes.indexOf(b), 1); if (S.brushId === b.id) S.brushId = S.brushes[0].id; sel = S.brushes[0].id; }, 'sm ghost') : null, act('Reset all', () => { S.brushes = U.deep(SB.BRUSH_PRESETS); S.brushId = sel = 'pen'; }, 'sm ghost')),
            h('div.row.wrap', null, W.btn('Import…', () => B.importFile(id => { sel = id || sel; render(); }), { cls: 'sm', icon: 'import', title: 'Add brushes from a brushes file (or from a project file’s brushes)' }), W.btn('Export…', () => B.exportFile(S.brushes), { cls: 'sm', icon: 'export', title: 'Save every brush (and its pictures) to a file you can share or import elsewhere' })),
            W.check(B.inProject(b), 'Keep in this project', v => { B.toProject(b, v); render(); })),
          h('div.bm2-main', null,
            h('div.bm2-head', null, name, h('span.spacer'), W.btn('Use this brush', () => { pick(b.id); dlg.close(); SB.tool.set('brush'); }), W.btn('Done', () => dlg.close(), { cls: 'primary' })),
            h('div.bm-padwrap', null, prev, h('div.bm-padbar', null, h('span.hint', null, pad.length ? 'Your test lines' : 'Draw on it to try the brush'), pad.length ? W.btn('Clear', () => { pad.length = 0; drawPad(); render(); }, { cls: 'sm ghost' }) : null)),
            h('div.bm2-scroll', null, sec('Kind', kinds), kindSec, shape, anim)));
        dlg.el.replaceChildren(sheet); setTimeout(() => { drawPad(); listCanvases(); }, 0);
        const ready = () => (b.tx !== 'img' || !!BT.image(b.img)) && S.brushes.every(x => x.tx !== 'img' || !x.img || !!BT.image(x.img)), wasReady = ready();
        cancelAnimationFrame(raf); const loop = () => { if (!prev.isConnected) return; if (!wasReady && ready()) return render(); /* its pictures just loaded: draw every preview again */ if ((b.an && b.an.k) || !wasReady) drawPad(); raf = requestAnimationFrame(loop); }; raf = requestAnimationFrame(loop);
      };
      const syncProject = () => { const list = S.doc.brushes; if (!list || !list.length) return; let ch = false; const next = list.map(x => { const b = S.brushes.find(y => y.id === x.id); if (!b || JSON.stringify(b) === JSON.stringify(x)) return x; ch = true; if (b.tx === 'img' && b.img) SB.brushTex.keep(b.img); return U.deep(b); }); if (ch) { S.doc.brushes = next; SB.commit(); } }; // brushes kept in the project follow your edits
      dlg = SB.dialog.sheet(h('div'), { size: 'wide', onClose: () => { cancelAnimationFrame(raf); syncProject(); SB.invalidate('ctxbar'); } }); render();
    },
  };
})(window.SB);
