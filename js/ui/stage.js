/* The stage: canvas sizing, zoom and pan, pointer routing to tools,
   touch gestures (pinch zoom, two-finger pan, long-press menu) and file drop. */
'use strict';
(function (SB) {
  const U = SB.util, S = SB.state, tree = SB.tree;
  let wrap, stage, ctx, ovl, octx, doc;
  // The screen is a box (#stageDoc) that zooms and pans; the canvas (#stage) always covers just the
  // visible stage area at full resolution and draws the screen into it, so zoomed-in lines stay sharp.

  const V = SB.view = {
    q: 1, // stage resolution while things move (1 = full), see draw()
    init() {
      wrap = U.$('#stageWrap'); stage = U.$('#stage'); doc = U.$('#stageDoc'); ctx = stage.getContext('2d'); ovl = U.$('#ovl'); octx = ovl.getContext('2d');
      new ResizeObserver(() => V.fit()).observe(wrap);
      bindPointers(); bindWheel(); bindDrop();
    },
    ctx: () => ctx,
    /** CSS pixels per project pixel. */
    k: () => doc.getBoundingClientRect().width / S.project.w,
    /** Where the screen is on the page (CSS pixels). */
    rect: () => doc.getBoundingClientRect(),
    /** Fit the canvas into the stage area (respecting zoom and pan). */
    fit() {
      if (!wrap) return; const r = wrap.getBoundingClientRect(), p = S.project, pad = r.width < 500 ? 10 : 28, v = S.view;
      const s = Math.max(0.01, Math.min((r.width - pad * 2) / p.w, (r.height - pad * 2) / p.h));
      const cw = Math.max(20, Math.floor(p.w * s * v.z)), ch = Math.max(20, Math.floor(p.h * s * v.z));
      doc.style.width = cw + 'px'; doc.style.height = ch + 'px'; V.apply();
      const dpr = Math.min(2, window.devicePixelRatio || 1), W = Math.max(1, Math.round(r.width * dpr)), H = Math.max(1, Math.round(r.height * dpr));
      if (stage.width !== W || stage.height !== H) { stage.width = W; stage.height = H; }
      const zb = U.$('#zoomPct'); if (zb) zb.textContent = Math.round(v.z * 100) + '%';
      SB.dirty();
    },
    apply() { doc.style.transform = `translate(calc(-50% + ${S.view.px}px), calc(-50% + ${S.view.py}px))`; },
    reset() { S.view = { z: 1, px: 0, py: 0 }; V.fit(); },
    zoomAt(f, cx, cy) {
      const v = S.view, wr = wrap.getBoundingClientRect(), r = doc.getBoundingClientRect(), nz = U.clamp(v.z * f, 0.1, 12); if (nz === v.z) return;
      const u = (cx - r.left) / r.width, w = (cy - r.top) / r.height, k = nz / v.z, nW = r.width * k, nH = r.height * k;
      v.px = cx - u * nW - (wr.left + wr.width / 2 - nW / 2); v.py = cy - w * nH - (wr.top + wr.height / 2 - nH / 2); v.z = Math.abs(nz - 1) < 0.02 ? 1 : nz;
      V.fit();
    },
    zoomCenter(f) { const r = doc.getBoundingClientRect(); V.zoomAt(f, r.left + r.width / 2, r.top + r.height / 2); },
    pan(dx, dy) { S.view.px += dx; S.view.py += dy; V.apply(); SB.dirty(); },
    /** Screen point → project coordinates. */
    toProj(e) { const r = doc.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * S.project.w, y: (e.clientY - r.top) / r.height * S.project.h }; },

    /** Draw the frame: scene into the canvas, then overlays (selection, paths, guides) around it. */
    draw() {
      const wr = wrap.getBoundingClientRect(), r = doc.getBoundingClientRect(), dpr = stage.width / (wr.width || 1), sc = r.width * dpr / S.project.w;
      const sx = (r.left - wr.left) * dpr, sy = (r.top - wr.top) * dpr;
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, stage.width, stage.height);
      // while it plays or something is dragged, a slow frame lowers the stage's resolution (down to 35%) so the motion stays smooth;
      // once it stops, the next frame is sharp again. Exports always render at full size.
      const now = performance.now(), motion = S.playing || S.ixPlay || pointers.size > 0, gap = V._last ? now - V._last : 0; V._last = now;
      const q = motion ? V.q : 1, ropt = { preview: true, noFx: SB.tool.noFxSet(), showSel: SB.tool.showSelSet() };
      if (q < 0.99) {
        const lw = Math.max(1, Math.round(stage.width * q)), lh = Math.max(1, Math.round(stage.height * q)), lo = V._lo || (V._lo = document.createElement('canvas'));
        if (lo.width !== lw || lo.height !== lh) { lo.width = lw; lo.height = lh; } const lc = lo.getContext('2d');
        lc.setTransform(1, 0, 0, 1, 0, 0); lc.clearRect(0, 0, lw, lh); lc.save(); lc.beginPath(); lc.rect(sx * q, sy * q, r.width * dpr * q, r.height * dpr * q); lc.clip();
        SB.scene.render(lc, S.time, sc * q, Object.assign(ropt, { origin: [sx * q, sy * q] })); lc.restore();
        ctx.save(); ctx.imageSmoothingEnabled = true; ctx.drawImage(lo, 0, 0, lw, lh, 0, 0, stage.width, stage.height); ctx.restore();
      } else {
        ctx.save(); ctx.beginPath(); ctx.rect(sx, sy, r.width * dpr, r.height * dpr); ctx.clip();
        SB.scene.render(ctx, S.time, sc, Object.assign(ropt, { origin: [sx, sy] }));
        ctx.restore();
      }
      if (S.ixPlay && SB.ix && SB.ix.drawCtrls) { ctx.save(); ctx.beginPath(); ctx.rect(sx, sy, r.width * dpr, r.height * dpr); ctx.clip(); ctx.setTransform(sc, 0, 0, sc, sx, sy); SB.ix.drawCtrls(ctx); ctx.restore(); } // controllers the viewer can drag
      if (motion) {
        const cost = Math.max(performance.now() - now, S.playing && gap > 0 && gap < 1000 ? gap - 16.7 : 0); // drawing time, or (playing) how late the frame came
        V.q = cost > 24 ? Math.max(0.35, V.q * Math.max(0.6, Math.sqrt(16 / cost))) : cost < 9 ? Math.min(1, V.q * 1.06) : V.q; // pixels cost ~ q²
        clearTimeout(V._sharpT); if (q < 0.99) V._sharpT = setTimeout(() => SB.dirty(), 180); // sharp again when it stops
      }
      const W = Math.round(wr.width * dpr), H = Math.round(wr.height * dpr); if (ovl.width !== W || ovl.height !== H) { ovl.width = W; ovl.height = H; }
      octx.setTransform(1, 0, 0, 1, 0, 0); octx.clearRect(0, 0, W, H);
      // o: project → overlay device pixels. Overlays draw in device pixels with an identity transform.
      const ox = (r.left - wr.left) * dpr, oy = (r.top - wr.top) * dpr, k = sc;
      const O = { c: octx, dpr, sc, ox, oy, P: (x, y) => [ox + x * k, oy + y * k], M: m => new DOMMatrix([1, 0, 0, 1, ox, oy]).multiply(U.scaleM(k)).multiply(m || new DOMMatrix()) };
      SB.overlays.draw(O);
    },
  };

  // ---------- pointers
  const pointers = new Map(); let gesture = null, routed = false, longT = 0, downInfo = null, lastMenu = 0;
  function bindPointers() {
    wrap.addEventListener('pointerdown', e => {
      if (S.exporting || e.target.closest('.zoombadge,.ctxbar,.empty,.txed,.pop,.menu,.focusmenu,.edit-bar,.tmpl-pill,.stage-modes')) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
      try { wrap.setPointerCapture(e.pointerId); } catch (err) {}
      if (pointers.size === 2 && [...pointers.values()].every(p => p.type === 'touch')) { // second finger: start pinch, cancel the one-finger action
        clearTimeout(longT); if (routed) { SB.tool.cancel(); routed = false; }
        const [a, b] = [...pointers.values()]; gesture = { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, t0: performance.now(), moved: 0, fingers: 2 }; return;
      }
      if (gesture && !gesture.pan && pointers.size >= 3) { gesture.fingers = Math.max(gesture.fingers || 2, pointers.size); return; }
      if (pointers.size > 1) return;
      if (e.button === 1 || (e.button === 0 && (SB.keys.space || S.tool === 'hand'))) { e.preventDefault(); gesture = { pan: true, x: e.clientX, y: e.clientY }; wrap.classList.add('panning'); return; }
      if (e.button === 2) return;
      if (SB.board && SB.board.down(e)) return;
      downInfo = { x: e.clientX, y: e.clientY, t: performance.now(), type: e.pointerType };
      if (e.pointerType === 'touch') { clearTimeout(longT); longT = setTimeout(() => { if (!downInfo) return; if (routed) { SB.tool.cancel(); routed = false; } lastMenu = performance.now(); SB.tool.contextMenu(e); downInfo = null; }, 550); }
      if (SB.board) SB.board.drawOn(e); routed = true; SB.tool.down(V.toProj(e), e);
    });
    wrap.addEventListener('pointermove', e => {
      const p = pointers.get(e.pointerId); if (p) { p.x = e.clientX; p.y = e.clientY; }
      if (downInfo && Math.hypot(e.clientX - downInfo.x, e.clientY - downInfo.y) > 8) { clearTimeout(longT); downInfo = null; }
      if (gesture) {
        if (gesture.pan) { V.pan(e.clientX - gesture.x, e.clientY - gesture.y); gesture.x = e.clientX; gesture.y = e.clientY; return; }
        if (pointers.size >= 2) { const [a, b] = [...pointers.values()], d = Math.hypot(a.x - b.x, a.y - b.y), cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2; gesture.moved = (gesture.moved || 0) + Math.abs(cx - gesture.cx) + Math.abs(cy - gesture.cy) + Math.abs(d - gesture.d); V.pan(cx - gesture.cx, cy - gesture.cy); if (gesture.d > 10) V.zoomAt(d / gesture.d, cx, cy); gesture.d = d; gesture.cx = cx; gesture.cy = cy; }
        return;
      }
      const P = V.toProj(e); S.hover = P; if (routed) SB.tool.move(P, e); else SB.tool.hover(P, e);
      SB.dirty();
    });
    const up = e => {
      pointers.delete(e.pointerId); clearTimeout(longT); downInfo = null;
      if (gesture) {
        if (!pointers.size) {
          // a quick tap with two fingers undoes, with three redoes (pinching or panning doesn't count)
          const g = gesture; gesture = null; wrap.classList.remove('panning');
          if (!g.pan && g.t0 && performance.now() - g.t0 < 350 && (g.moved || 0) < 14) { if ((g.fingers || 2) >= 3) { if (SB.canRedo()) { SB.redo(); SB.toast('Redo (three-finger tap)'); } } else if (SB.canUndo()) { SB.undo(); SB.toast('Undo (two-finger tap)'); } }
        }
        return;
      }
      if (routed) { routed = false; SB.tool.up(V.toProj(e), e); }
    };
    wrap.addEventListener('pointerup', up); wrap.addEventListener('pointercancel', e => { pointers.delete(e.pointerId); if (routed) { routed = false; SB.tool.cancel(); } gesture = null; });
    wrap.addEventListener('pointerleave', e => { if (S.ixPlay) SB.ix.pointer('move', { x: -1e6, y: -1e6 }, e); if (e.pointerType === 'mouse' && !routed) { S.hover = null; SB.dirty(); } });
    wrap.addEventListener('dblclick', e => { if (!e.target.closest('.ctxbar,.zoombadge')) SB.tool.dbl(V.toProj(e), e); });
    wrap.addEventListener('contextmenu', e => {
      e.preventDefault(); if (e.target.closest('.ctxbar,.zoombadge') || performance.now() - lastMenu < 800) return;
      clearTimeout(longT); downInfo = null; if (routed) { SB.tool.cancel(); routed = false; } lastMenu = performance.now(); SB.tool.contextMenu(e);
    });
    U.$('#zoomBadge').addEventListener('click', e => { const b = e.target.closest('[data-z]'); if (!b) return; if (b.dataset.z === 'fit') V.reset(); else V.zoomCenter(b.dataset.z === 'in' ? 1.25 : 0.8); });
    syncSnap();
  }
  // ---------- snapping and alignment guides: one switch for layers and screens
  // the switch itself sits in the top bar next to Undo / Redo (js/ui/shell.js), and in the Big stage menu
  function syncSnap() { SB.invalidate('top'); }
  SB.snapToggle = (v = !S.snap) => { S.snap = v; syncSnap(); SB.prefs.save(); SB.invalidate('ctxbar'); SB.toast(v ? 'Snapping and guides on.' : 'Snapping and guides off. Hold Alt to switch them for one drag.'); };
  function bindWheel() {
    wrap.addEventListener('wheel', e => {
      if (SB.player) return; // the exported page doesn't zoom
      if (S.exporting || e.target.closest('.ctxbar,.pop')) return; e.preventDefault();
      const mouseWheel = e.deltaMode === 1 || (e.deltaX === 0 && Number.isInteger(e.deltaY) && Math.abs(e.deltaY) >= 50);
      if (e.ctrlKey || e.metaKey || mouseWheel) V.zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018)), e.clientX, e.clientY);
      else V.pan(-e.deltaX, -e.deltaY);
    }, { passive: false });
  }
  function bindDrop() {
    ['dragenter', 'dragover'].forEach(ev => document.addEventListener(ev, e => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { e.preventDefault(); wrap.classList.add('drop'); } }));
    ['dragleave', 'drop'].forEach(ev => document.addEventListener(ev, e => { if (ev === 'dragleave' && e.relatedTarget) return; wrap.classList.remove('drop'); }));
    document.addEventListener('drop', async e => { if (!e.dataTransfer || !e.dataTransfer.files.length) return; e.preventDefault(); await SB.io.importFiles(e.dataTransfer.files); });
  }
})(window.SB);
