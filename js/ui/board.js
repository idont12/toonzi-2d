/* The board: every screen side by side around the one you are working on.
   - Other screens are drawn (live) around the active one; click one to work on it.
   - Drag a screen's name to move it, double-click the name for its settings.
   - Drag a layer onto another screen to move it there.
   - The Screens tool: drag on empty space to draw a new screen, or pick a size in the bar. */
'use strict';
(function (SB) {
  const U = SB.util, S = SB.state, tree = SB.tree, h = U.h, W = SB.w, Sc = SB.screens;
  const cache = new Map();
  const wrapEl = () => U.$('#stageWrap');
  /** A small tag before a screen's title: TEMPLATE on an original (with a dot when its copies are behind), FROM … on a copy. Returns its width. */
  function tagFor(c, s, x, y, d) {
    let g = 0; if (s.group) { // its group (Screen › Group: one prefab or scene in Unity and Godot)
      const text = '◆ ' + s.group.toUpperCase(); c.save(); c.font = `700 ${9.5 * d}px Lexend, system-ui, sans-serif`; const w = c.measureText(text).width + 12 * d, hh = 15 * d;
      c.fillStyle = '#0F9D8A'; c.beginPath(); c.roundRect ? c.roundRect(x, y - hh + 1 * d, w, hh, 4 * d) : c.rect(x, y - hh + 1 * d, w, hh); c.fill();
      c.fillStyle = '#fff'; c.textBaseline = 'middle'; c.fillText(text, x + 6 * d, y - hh / 2 + 1.5 * d); c.restore(); g = w + 6 * d; x += g; }
    return g + tmplTag(c, s, x, y, d);
  }
  function tmplTag(c, s, x, y, d) {
    const T = SB.templates, m = T && T.of(s); if (!s.tmpl && !m) return 0;
    const text = s.tmpl ? (T.stale(s) ? 'TEMPLATE • changed' : 'TEMPLATE') : 'FROM ' + m.tmpl.name.toUpperCase();
    c.save(); c.font = `700 ${9.5 * d}px Lexend, system-ui, sans-serif`; const w = c.measureText(text).width + 12 * d, hh = 15 * d;
    c.fillStyle = s.tmpl ? '#5B3DF5' : 'rgba(91,61,245,.14)'; c.beginPath(); c.roundRect ? c.roundRect(x, y - hh + 1 * d, w, hh, 4 * d) : c.rect(x, y - hh + 1 * d, w, hh); c.fill();
    c.fillStyle = s.tmpl ? '#fff' : '#5B3DF5'; c.textBaseline = 'middle'; c.fillText(text, x + 6 * d, y - hh / 2 + 1.5 * d); c.restore(); return w + 6 * d;
  }

  // ---------- view
  /** Work on screen s, keeping the board where it is on screen. */
  function focus(s, quiet) {
    Sc.ensure(); const a = Sc.active(); if (!s || s === a) return;
    const k = SB.view.k(), r = SB.view.rect(), wr = wrapEl().getBoundingClientRect();
    const left = r.left + (s.x - a.x) * k, top = r.top + (s.y - a.y) * k;
    if (SB.textEdit) SB.textEdit.end(); Sc.swapTo(s); S.sel = null; S.multi = new Set(); S.selKeys.clear(); S.selStrokes.clear(); S.solo = null;
    if (S.time > S.project.duration) S.time = Math.max(0, S.project.duration - 0.001);
    const pad = wr.width < 500 ? 10 : 28, base = Math.max(0.01, Math.min((wr.width - pad * 2) / s.proj.w, (wr.height - pad * 2) / s.proj.h));
    S.view.z = k / base; S.view.px = left + s.proj.w * k / 2 - (wr.left + wr.width / 2); S.view.py = top + s.proj.h * k / 2 - (wr.top + wr.height / 2);
    SB.view.fit(); SB.emit('select'); SB.emit('time'); SB.invalidate(); if (!quiet) SB.toast(`Working on ${s.name}.`);
  }
  /** Zoom out to see every screen. */
  function fitAll() {
    const a = Sc.active(), b = Sc.bounds(), wr = wrapEl().getBoundingClientRect(), pad = 48, base = Math.max(0.01, Math.min((wr.width - 56) / a.proj.w, (wr.height - 56) / a.proj.h));
    const k = Math.min((wr.width - pad * 2) / (b.x1 - b.x0), (wr.height - pad * 2) / (b.y1 - b.y0)); S.view.z = U.clamp(k / base, 0.05, 10);
    S.view.px = -((b.x0 + b.x1) / 2 - (a.x + a.proj.w / 2)) * k; S.view.py = -((b.y0 + b.y1) / 2 - (a.y + a.proj.h / 2)) * k; SB.view.fit();
  }

  // ---------- drawing the other screens (under everything else on the overlay)
  SB.overlays.under.push(O => {
    if (!S.screens || S.screens.length < 2) return; const c = O.c, act = Sc.active(), d = O.dpr;
    for (const s of S.screens) {
      const [dx, dy] = O.P(s.x - act.x, s.y - act.y); if (s === act) continue;
      const Wd = Math.max(1, Math.round(s.proj.w * O.sc)), Ht = Math.max(1, Math.round(s.proj.h * O.sc));
      if (dx + Wd < -50 || dy + Ht < -50 || dx > c.canvas.width + 50 || dy > c.canvas.height + 50 || Wd * Ht > 6e7) continue;
      const key = [S.time, Sc.ver, Wd, Ht].join('|'); let ch = cache.get(s.id);
      if (!ch || ch.key !== key) {
        const cv = ch && ch.cv.width === Wd && ch.cv.height === Ht ? ch.cv : Object.assign(document.createElement('canvas'), { width: Wd, height: Ht }), x = cv.getContext('2d'); x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, Wd, Ht);
        try { Sc.with(s, () => SB.scene.render(x, Math.min(S.time, Math.max(0, s.proj.duration - 0.001)), O.sc, { preview: true })); } catch (e) { console.warn(e); }
        ch = { key, cv }; cache.set(s.id, ch);
      }
      c.save(); c.shadowColor = 'rgba(20,18,40,.16)'; c.shadowBlur = 16 * d; c.shadowOffsetY = 3 * d; c.fillStyle = '#fff'; c.fillRect(dx, dy, Wd, Ht); c.shadowColor = 'transparent'; c.drawImage(ch.cv, dx, dy);
      if (S.time >= s.proj.duration) { c.fillStyle = 'rgba(20,18,40,.35)'; c.fillRect(dx, dy, Wd, Ht); }
      if (dropTo && dropTo.id === s.id) { c.strokeStyle = '#5B3DF5'; c.lineWidth = 3 * d; c.strokeRect(dx - 1.5 * d, dy - 1.5 * d, Wd + 3 * d, Ht + 3 * d); }
      c.restore();
    }
    for (const s of S.screens) { const [dx, dy] = O.P(s.x - act.x, s.y - act.y); c.save(); c.font = `${s === act ? 600 : 500} ${12 * d}px Lexend, system-ui, sans-serif`; c.textBaseline = 'bottom'; c.fillStyle = s === act ? '#5B3DF5' : 'rgba(120,115,150,.95)'; const off = tagFor(c, s, dx, dy - 7 * d, d); c.fillText(`${s.name}   ${s.proj.w}×${s.proj.h} · ${U.r2(s.proj.duration)}s`, dx + off, dy - 7 * d); c.restore(); }
  });

  // ---------- pointer: names, other screens, the Screens tool
  const boardPt = e => { const P = SB.view.toProj(e), a = Sc.active(); return { x: P.x + a.x, y: P.y + a.y }; };
  function hit(e) {
    if (!S.screens) return null; const B = boardPt(e), k = SB.view.k();
    if (S.screens.length > 1 || S.tool === 'screen') for (const s of S.screens) { const tx = B.x - s.x, ty = B.y - s.y; if (ty < 0 && ty > -24 / k && tx >= -4 / k && tx <= Math.min(s.proj.w, 300 / k)) return { s, part: 'title' }; }
    for (const s of S.screens) if (B.x >= s.x && B.x <= s.x + s.proj.w && B.y >= s.y && B.y <= s.y + s.proj.h) return { s, part: 'body' };
    return null;
  }
  let lastTitle = { id: null, t: 0 };
  /** Called by the stage before a click reaches the tool. Returns true when the board used it. */
  function down(e) {
    if (S.tool !== 'select' && S.tool !== 'screen') return false; const rh = sizeHit(e); if (rh) { resizeDrag(e, rh); return true; } const ht = hit(e);
    if (!ht) return false;
    if (ht.part === 'body') { if (ht.s === Sc.active()) return false; focus(ht.s, true); return S.tool === 'screen'; }
    const s = ht.s, now = performance.now();
    if (lastTitle.id === s.id && now - lastTitle.t < 400) { lastTitle = { id: null, t: 0 }; focus(s, true); SB.settings.open('project'); return true; }
    lastTitle = { id: s.id, t: now }; if (s !== Sc.active()) focus(s, true); selectScreen(s);
    const w = wrapEl(), k = SB.view.k(), x0 = e.clientX, y0 = e.clientY, sx = s.x, sy = s.y, v0 = { x: S.view.px, y: S.view.py }; let moved = false;
    const mv = ev => {
      if (Math.abs(ev.clientX - x0) + Math.abs(ev.clientY - y0) > 3) moved = true;
      const p = snapScreen(s, sx + (ev.clientX - x0) / k, sy + (ev.clientY - y0) / k, ev.altKey);
      s.x = p.x; s.y = p.y; S.view.px = v0.x + (s.x - sx) * k; S.view.py = v0.y + (s.y - sy) * k; SB.view.apply(); SB.dirty();
    };
    const up = () => { w.removeEventListener('pointermove', mv); w.removeEventListener('pointerup', up); guides = null; SB.dirty(); if (moved) SB.commit(); };
    w.addEventListener('pointermove', mv); w.addEventListener('pointerup', up); return true;
  }

  // ---------- resizing the active screen: a box with handles (Screens tool, or a screen picked by its name)
  const sizing = () => S.screens && (S.tool === 'screen' || (S.screenSel && S.screenSel === S.scr));
  function sizeHit(e) {
    if (!sizing()) return null; const r = SB.view.rect(), x = e.clientX, y = e.clientY, t = 9, X = { l: r.left, c: (r.left + r.right) / 2, r: r.right }, Y = { t: r.top, c: (r.top + r.bottom) / 2, b: r.bottom };
    for (const hx of ['l', 'c', 'r']) for (const hy of ['t', 'c', 'b']) if ((hx !== 'c' || hy !== 'c') && Math.abs(x - X[hx]) < t && Math.abs(y - Y[hy]) < t) return { hx, hy };
    if (y > r.top && y < r.bottom) { if (Math.abs(x - r.left) < 5) return { hx: 'l', hy: 'c' }; if (Math.abs(x - r.right) < 5) return { hx: 'r', hy: 'c' }; }
    if (x > r.left && x < r.right) { if (Math.abs(y - r.top) < 5) return { hx: 'c', hy: 't' }; if (Math.abs(y - r.bottom) < 5) return { hx: 'c', hy: 'b' }; }
    return null;
  }
  /** Drag an edge or corner: the screen gets bigger or smaller (in even pixels); from the left or top its layers stay where they are on the board. */
  function resizeDrag(e, { hx, hy }) {
    const s = Sc.active(), p = S.project, k = SB.view.k(), r0 = SB.view.rect(), w0 = p.w, h0 = p.h, sx0 = s.x, sy0 = s.y, x0 = e.clientX, y0 = e.clientY, wr = wrapEl();
    let lx = s.x, ly = s.y, moved = false; selectScreen(s);
    const mv = ev => {
      moved = true; const dx = (ev.clientX - x0) / k, dy = (ev.clientY - y0) / k, ev2 = v => Math.max(64, Math.round(v / 2) * 2);
      const w = hx === 'r' ? ev2(w0 + dx) : hx === 'l' ? ev2(w0 - dx) : w0, hh = hy === 'b' ? ev2(h0 + dy) : hy === 't' ? ev2(h0 - dy) : h0;
      p.w = w; p.h = hh; s.x = hx === 'l' ? sx0 + (w0 - w) : sx0; s.y = hy === 't' ? sy0 + (h0 - hh) : sy0;
      if (s.x !== lx || s.y !== ly) { for (const o of S.objects) shiftObj(o, lx - s.x, ly - s.y); lx = s.x; ly = s.y; }
      // keep the board still: same zoom, the screen's corner where it belongs
      const wb = wr.getBoundingClientRect(), pad = wb.width < 500 ? 10 : 28, base = Math.max(0.01, Math.min((wb.width - pad * 2) / p.w, (wb.height - pad * 2) / p.h));
      const left = r0.left + (s.x - sx0) * k, top = r0.top + (s.y - sy0) * k;
      S.view.z = k / base; S.view.px = left + p.w * k / 2 - (wb.left + wb.width / 2); S.view.py = top + p.h * k / 2 - (wb.top + wb.height / 2); SB.view.fit(); SB.invalidate('tool'); SB.dirty();
    };
    const up = () => { wr.removeEventListener('pointermove', mv); wr.removeEventListener('pointerup', up); if (!moved) return; Sc.sync(); SB.commit(); SB.invalidate(); SB.toast(`${s.name} is ${p.w}×${p.h} now.`); };
    wr.addEventListener('pointermove', mv); wr.addEventListener('pointerup', up);
  }
  SB.overlays.extra.push(O => {
    if (!sizing()) return; const c = O.c, d = O.dpr, [x0, y0] = O.P(0, 0), [x1, y1] = O.P(S.project.w, S.project.h), hs = 5 * d;
    c.save(); c.strokeStyle = '#5B3DF5'; c.lineWidth = 1.5 * d; c.strokeRect(x0, y0, x1 - x0, y1 - y0); c.fillStyle = '#fff';
    for (const X of [x0, (x0 + x1) / 2, x1]) for (const Y of [y0, (y0 + y1) / 2, y1]) { if (X !== x0 && X !== x1 && Y !== y0 && Y !== y1) continue; c.beginPath(); c.rect(X - hs, Y - hs, hs * 2, hs * 2); c.fill(); c.stroke(); }
    c.restore();
  });
  /** The cursor over the box's edges and handles. */
  function sizeCursor(e) { const r = sizeHit(e); if (!r) return ''; const k = r.hx + r.hy; return k === 'lt' || k === 'rb' ? 'nwse-resize' : k === 'rt' || k === 'lb' ? 'nesw-resize' : r.hx === 'c' ? 'ns-resize' : 'ew-resize'; }
  document.addEventListener('pointermove', e => { const w = wrapEl(), st = U.$('#stage'); if (!w || !st || e.buttons) return; const cur = sizing() && w.contains(e.target) ? sizeCursor(e) : ''; if (cur) { st.style.cursor = cur; st._sz = 1; } else if (st._sz) { st._sz = 0; st.style.cursor = SB.tool.cur().cursor || 'default'; } });

  // ---------- alignment while moving a screen: its edges and center snap to the other screens'
  let guides = null;
  function snapScreen(s, x, y, alt) {
    guides = null; if (!S.snap || alt) return { x: Math.round(x), y: Math.round(y) };
    const thr = 8 / SB.view.k(), w = s.proj.w, hh = s.proj.h, xs = [], ys = [];
    for (const o of S.screens) { if (o === s) continue; xs.push(o.x, o.x + o.proj.w / 2, o.x + o.proj.w); ys.push(o.y, o.y + o.proj.h / 2, o.y + o.proj.h); }
    const best = (v, own, cands) => { let m = null; for (const off of own) for (const c of cands) { const d = c - (v + off); if (Math.abs(d) < thr && (!m || Math.abs(d) < Math.abs(m.d))) m = { d, at: c }; } return m; };
    const bx = best(x, [0, w / 2, w], xs), by = best(y, [0, hh / 2, hh], ys);
    if (bx || by) guides = { x: bx ? bx.at : null, y: by ? by.at : null };
    return { x: Math.round(x + (bx ? bx.d : 0)), y: Math.round(y + (by ? by.d : 0)) };
  }
  SB.overlays.extra.push(O => {
    if (!guides) return; const a = Sc.active(), c = O.c, d = O.dpr; c.save(); c.strokeStyle = '#FF4F8B'; c.lineWidth = d; c.setLineDash([5 * d, 4 * d]);
    if (guides.x != null) { const [x] = O.P(guides.x - a.x, 0); c.beginPath(); c.moveTo(x, 0); c.lineTo(x, c.canvas.height); c.stroke(); }
    if (guides.y != null) { const [, y] = O.P(0, guides.y - a.y); c.beginPath(); c.moveTo(0, y); c.lineTo(c.canvas.width, y); c.stroke(); }
    c.restore();
  });

  // ---------- moving layers to another screen by dragging them onto it
  let dropTo = null;
  function targetFor(objs) {
    if (!Sc.many()) return null; const a = Sc.active(), p = S.project, b = U.emptyBox();
    objs.forEach(o => { const bx = SB.scene.box(o); if (bx) bx.pts.forEach(q => U.growBox(b, q.x, q.y)); }); if (!U.boxOk(b)) return null;
    const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2; if (cx >= 0 && cx <= p.w && cy >= 0 && cy <= p.h) return null;
    return Sc.at(cx + a.x, cy + a.y, a);
  }
  function shiftObj(o, dx, dy) { o.x = U.r1(o.x + dx); o.y = U.r1(o.y + dy); (o.tracks.x || []).forEach(k => { k.v = U.r1(k.v + dx); if (k.cx != null) { k.cx = U.r1(k.cx + dx); k.cy = U.r1(k.cy + dy); } }); (o.tracks.y || []).forEach(k => k.v = U.r1(k.v + dy)); }
  function dropOnScreen(objs) {
    const t = targetFor(objs); dropTo = null; if (!t) return false; const a = Sc.active(); let ids = [];
    for (const o of objs) {
      if (tree.parentOf(o)) { const top = tree.ancestors(o).pop(); if (objs.includes(top)) continue; SB.xf.reparent(o, null, 0); }
      const i = S.objects.indexOf(o); if (i < 0) continue; S.objects.splice(i, 1); shiftObj(o, a.x - t.x, a.y - t.y); delete o.bind; t.objects.unshift(o); ids.push(o.id);
    }
    if (!ids.length) return false; tree.reindex(); focus(t, true); tree.select(ids); SB.commit(); SB.toast(`Moved to ${t.name}.`); return true;
  }
  SB.on('select', () => { dropTo = null; if (!quietSel) S.screenSel = null; });
  // ---------- a selected screen (click its name): Delete asks to delete it
  let quietSel = false;
  function selectScreen(s) { quietSel = true; try { tree.select([]); } finally { quietSel = false; } S.screenSel = s.id; SB.dirty(); SB.invalidate('ctxbar'); }
  SB.overlays.extra.push(O => {
    if (!S.screenSel || S.screenSel !== S.scr) return; const c = O.c, d = O.dpr, [x0, y0] = O.P(0, 0), [x1, y1] = O.P(S.project.w, S.project.h);
    c.save(); c.strokeStyle = '#5B3DF5'; c.lineWidth = 2.5 * d; c.strokeRect(x0 - 2 * d, y0 - 2 * d, x1 - x0 + 4 * d, y1 - y0 + 4 * d); c.restore();
  });
  SB.on('time', () => {}); // keep thumbnails in step through the cache key

  // ---------- the Screens tool
  SB.tools.add({
    id: 'screen', label: 'Screens', icon: 'screen', tip: 'Add and arrange screens: drag on empty space to draw one', cursor: 'crosshair',
    down(P) { const a = Sc.active(); SB.tool.drag = { kind: 'newscreen', B0: { x: P.x + a.x, y: P.y + a.y }, B1: null }; },
    move(P) { const d = SB.tool.drag; if (d && d.kind === 'newscreen') { const a = Sc.active(); d.B1 = { x: P.x + a.x, y: P.y + a.y }; } },
    up() {
      const d = SB.tool.drag; if (!d || !d.B1) return; const x0 = Math.min(d.B0.x, d.B1.x), y0 = Math.min(d.B0.y, d.B1.y), w = Math.abs(d.B1.x - d.B0.x), hh = Math.abs(d.B1.y - d.B0.y);
      if (w * SB.view.k() < 30 || hh * SB.view.k() < 30) return; const s = Sc.add(Math.round(w / 2) * 2 + 'x' + Math.round(hh / 2) * 2, { x: x0, y: y0 }); focus(s, true); SB.commit(); SB.toast(`${s.name} added. Drag its name to move it.`);
    },
    overlay(O) {
      const d = SB.tool.drag, c = O.c, a = Sc.active(); if (d && d.kind === 'newscreen' && d.B1) { const [x0, y0] = O.P(d.B0.x - a.x, d.B0.y - a.y), [x1, y1] = O.P(d.B1.x - a.x, d.B1.y - a.y); c.save(); c.strokeStyle = '#5B3DF5'; c.lineWidth = 2 * O.dpr; c.setLineDash([6 * O.dpr, 4 * O.dpr]); c.fillStyle = 'rgba(91,61,245,.06)'; c.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0)); c.strokeRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0)); c.restore(); }
      if (!Sc.many()) { const [x, y] = O.P(0, 0); c.save(); c.font = `600 ${12 * O.dpr}px Lexend, system-ui, sans-serif`; c.fillStyle = '#5B3DF5'; c.textBaseline = 'bottom'; const off = tagFor(c, a, x, y - 7 * O.dpr, O.dpr); c.fillText(`${a.name}   ${S.project.w}×${S.project.h}`, x + off, y - 7 * O.dpr); c.restore(); }
    },
    bar() {
      Sc.ensure(); const act = Sc.active();
      return [h('span.lbl', null, h('b', null, 'Screens')),
        ...S.screens.map(s => W.btn(s.name, () => { focus(s); selectScreen(s); }, { cls: 'sm' + (s === act ? ' on' : ''), title: `${s.proj.w}×${s.proj.h}, ${U.r2(s.proj.duration)}s` })),
        h('span.vsep'), W.select('', [['', 'Add a screen…'], ...Sc.SIZES, ...(SB.templates ? SB.templates.list().map(m => ['tmpl:' + m.id, 'From template: ' + m.tmpl.name]) : [])], v => { if (!v) return; const s = v.startsWith('tmpl:') ? SB.templates.addFrom(Sc.find(v.slice(5))) : Sc.add(v); focus(s, true); fitAll(); SB.commit(); }, 'Add a screen'),
        SB.templates && act.tmpl && SB.templates.stale(act) ? W.btn('Update copies', () => SB.templates.push(act), { cls: 'sm primary', icon: 'library', title: 'Send the changes of this template to every screen made from it' }) : null,
        SB.templates ? (act.tmpl ? W.btn('Template', () => SB.templates.unmake(act), { cls: 'sm on', icon: 'library', title: 'This screen is a template. Click to stop' }) : act.from || act.editOf ? null : W.btn('Save as template', () => SB.templates.make(act), { cls: 'sm ghost', icon: 'library', title: 'New screens can start from this one; changes here reach them all' })) : null,
        h('span.vsep'), ...sizeBg(act), groupSel(act),
        W.btn('Fit all', fitAll, { cls: 'sm ghost', icon: 'fit' }), W.btn('Settings', () => SB.settings.open('project'), { cls: 'sm ghost', icon: 'gear', title: 'Everything about this screen: size, frame rate, length, background image' }),
        Sc.many() ? W.btn('Duplicate', () => { const c = Sc.duplicate(act); focus(c, true); fitAll(); SB.commit(); }, { cls: 'sm ghost', icon: 'copy' }) : null,
        Sc.many() ? W.btn('Delete', () => remove(act), { cls: 'sm ghost', icon: 'trash' }) : null,
        h('span.lbl', null, 'Drag on empty space to draw a screen.')];
    },
  });
  /** Its group: screens of one group (a character, an enemy…) export to Unity / Godot as one prefab or scene with its own animations. */
  function groupSel(s) {
    const names = Sc.groupNames(), set = v => { if (v) s.group = v; else delete s.group; SB.commit(); SB.invalidate(); SB.toast(v ? `${s.name} is in the group ${v}: in Unity and Godot, ${v} gets its own ${'prefab or scene'} with its animations.` : `${s.name} is in no group.`); };
    return W.select(s.group || '', [['', 'No group'], ...names.map(n => [n, '◆ ' + n]), ['+new', 'New group…']], async v => {
      if (v !== '+new') return set(v);
      const n = await SB.dialog.prompt('New group', 'A name for a character or object (Hero, Enemy…). Its screens export to Unity and Godot as one prefab or scene, each screen one of its animations.', ''); if (n && n.trim()) set(n.trim().slice(0, 40)); else SB.invalidate('ctxbar');
    }, 'Group (Unity and Godot: one prefab or scene each)');
  }
  /** The size and background of screen s (the active one), right in the bar. */
  function sizeBg(s) {
    const p = S.project, key = p.w + 'x' + p.h, list = Sc.SIZES.filter(([k]) => k !== 'same'), known = list.some(([k]) => k === key);
    const size = (w, hh) => { w = U.clamp(Math.round(w / 2) * 2, 64, 4096); hh = U.clamp(Math.round(hh / 2) * 2, 64, 4096); if (w === p.w && hh === p.h) return; p.w = w; p.h = hh; SB.commit(); SB.view.fit(); SB.invalidate(); };
    return [
      W.select(known ? key : '', [...(known ? [] : [['', `Custom ${p.w}×${p.h}`]]), ...list], v => { if (!v) return; const [w, hh] = v.split('x').map(Number); size(w, hh); }, `Size of ${s ? s.name : 'the screen'}`),
      Object.assign(W.num(p.w, { min: 64, max: 4096, step: 2, label: 'Width', change: v => size(+v, p.h) }), { className: 'sz-num' }), h('span.lbl', null, '×'), Object.assign(W.num(p.h, { min: 64, max: 4096, step: 2, label: 'Height', change: v => size(p.w, +v) }), { className: 'sz-num' }),
      W.colorBtn(p.bg || '#FFFFFF', { label: 'Background color', input: v => { p.bg = v; SB.dirty(); }, change: () => { SB.commit(); SB.invalidate('ctxbar'); } }),
    ];
  }
  async function remove(s) {
    if (S.screens.length < 2) return SB.toast('A project needs at least one screen.');
    const refs = SB.ix ? SB.ix.refsTo(s.id) : [], used = refs.length ? ` ${refs.length} interaction rule${refs.length > 1 ? 's use' : ' uses'} it (${refs.slice(0, 3).map(r => r.name).join(', ')}${refs.length > 3 ? '…' : ''}): ${refs.length > 1 ? 'they' : 'it'} will show what is missing, so you can fix or delete ${refs.length > 1 ? 'them' : 'it'}.` : '';
    const ok = await SB.dialog.ask(`Delete ${s.name}?`, (s.objects.length ? `It has ${s.objects.length} layer${s.objects.length > 1 ? 's' : ''}. You can undo this.` : 'You can undo this.') + used, [{ v: 1, label: 'Delete', danger: true }]); if (!ok) return;
    if (s === Sc.active()) focus(S.screens.find(x => x !== s), true); Sc.remove(s); cache.delete(s.id); SB.commit(); SB.invalidate();
  }

  /** A drawing tool pressed on another screen: that screen becomes the one you work on first, so what you draw lands there
      (in a new drawing layer of that screen, not in the layer selected on the other one). */
  const NEW_DRAW = new Set(['brush', 'fillbrush', 'pen']);
  function drawOn(e) {
    if (!S.screens || S.screens.length < 2 || !NEW_DRAW.has(S.tool) || S.pen) return; const a = Sc.active(), P = SB.view.toProj(e);
    if (P.x >= 0 && P.y >= 0 && P.x <= S.project.w && P.y <= S.project.h) return; const s = Sc.at(P.x + a.x, P.y + a.y, a); if (s) focus(s, true);
  }
  SB.board = { sizeBg, drawOn, focus, fitAll, down, dropOnScreen, remove, selectScreen, screenSelected: () => !!S.screenSel && S.screenSel === S.scr, hover(objs) { dropTo = targetFor(objs); } };
})(window.SB);
