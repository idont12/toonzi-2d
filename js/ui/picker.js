/* Pick mode: connect something by clicking it instead of choosing it from a long list.
   SB.picker.start({ title, test, bones, done }) shows "Pick a controller for Ball" above the
   stage and turns the pointer into a target. Hovering something that can be picked outlines
   and tints it; clicking it (on the stage or its row in the timeline) calls done({ o, bone }).
   Esc, right-click or Cancel stops.
     test(o, cand)  true when o can be picked (cand.bone is set when a bone was hit)
     bones          true: bones of rigs can be picked (rigs show their bones meanwhile) */
'use strict';
(function (SB) {
  const U = SB.util, S = SB.state, tree = SB.tree, X = SB.xf, h = U.h;
  S.picking = null;
  const ring = (stroke, w) => `<circle cx="12" cy="12" r="7" stroke="${stroke}" stroke-width="${w}" fill="none"/><circle cx="12" cy="12" r="2" fill="${stroke}" stroke="${stroke}" stroke-width="${w - 1.5}"/><path d="M12 1.5v5M12 17.5v5M1.5 12h5M17.5 12h5" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round"/>`;
  document.documentElement.style.setProperty('--pick-cursor', `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">${ring('#fff', 4)}${ring('#5B3DF5', 2)}</svg>`)}") 12 12, crosshair`);

  const usable = o => o && tree.inRange(o) && !tree.hidden(o);
  /** Everything under P that could be meant, front first. */
  function candidates(P) {
    const pk = S.picking, out = [];
    const ch = SB.rigUI && SB.rigUI.ctrlHit(P); if (ch) out.push({ o: ch.c });
    if (pk.bones) for (const r of SB.rig.rigs().slice().reverse()) { if (!usable(r)) continue; const hit = SB.rig.hit(r, P, 12); if (hit) out.push({ o: r, bone: hit.bone }); }
    for (let x = SB.scene.hit(P); x; x = tree.parentOf(x)) out.push({ o: x });
    return out;
  }
  const ok = c => c && c.o && S.picking.test(c.o, c);
  const pickAt = P => candidates(P).find(ok) || null;

  let bar = null;
  const P = SB.picker = {
    /** Start pick mode. title: what the bar says ("Pick a controller for Ball"). */
    start(opt) {
      if (S.picking) P.cancel(); SB.menu.close(); SB.popover.close && SB.popover.close();
      S.picking = Object.assign({ hover: null }, opt);
      U.$('#app').classList.add('picking');
      if (!bar) { bar = h('div.pickbar', { role: 'status' }); U.$('#stageWrap').appendChild(bar); }
      bar.replaceChildren(h('span.pk-ic', { html: SB.icon('target') }), h('span', null, opt.title), h('button.btn.sm.ghost', { type: 'button', onclick: () => P.cancel() }, 'Cancel'));
      bar.hidden = false; SB.dirty();
    },
    cancel() { const pk = S.picking; if (!pk) return; S.picking = null; end(); if (pk.cancelled) pk.cancelled(); },
    /** Finish with a candidate { o, bone }. */
    choose(c) { const pk = S.picking; if (!pk || !ok(c)) return false; S.picking = null; end(); pk.done(c); return true; },
    active: () => !!S.picking,
    down(Pt) { const c = pickAt(Pt); if (!c) return SB.toast('That can’t be picked here. Click one of the outlined things, or press Esc.'); P.choose(c); },
    hover(Pt) { const c = pickAt(Pt), pk = S.picking; if ((pk.hover && pk.hover.o) !== (c && c.o) || (pk.hover && pk.hover.bone) !== (c && c.bone)) { pk.hover = c; SB.dirty(); } },
    /** From the timeline: a row was clicked. Bones are picked as "nearest bone" of that rig. */
    row(o) { return P.choose({ o }); },
  };
  function end() { U.$('#app').classList.remove('picking'); if (bar) bar.hidden = true; U.$$('.tl-row.pickok').forEach(r => r.classList.remove('pickok')); SB.dirty(); }

  // highlight timeline rows that can be picked
  document.addEventListener('pointerover', e => {
    if (!S.picking) return; const row = e.target.closest && e.target.closest('.tl-row[data-id]:not(.sub)'); U.$$('.tl-row.pickok').forEach(r => r !== row && r.classList.remove('pickok'));
    if (row) { const o = tree.find(row.dataset.id); row.classList.toggle('pickok', !!(o && S.picking.test(o, { o }))); }
  });

  // the hovered candidate: outline and a light tint
  SB.overlays.extra.push(O => {
    const pk = S.picking; if (!pk || !pk.hover) return; const { o, bone } = pk.hover, c = O.c, d = O.dpr, col = '#5B3DF5';
    c.save(); c.strokeStyle = col; c.fillStyle = 'rgba(91,61,245,.18)'; c.lineWidth = 2.5 * d; c.beginPath();
    if (bone) { const s = SB.rig.segsWorld(o).find(x => x.b.id === bone.id); if (s) { const [hx, hy] = O.P(s.h.x, s.h.y), [tx, ty] = O.P(s.t.x, s.t.y), L = Math.hypot(tx - hx, ty - hy) || 1, nx = -(ty - hy) / L, ny = (tx - hx) / L, w = Math.min(L * 0.2, 14 * d), mx = hx + (tx - hx) * 0.22, my = hy + (ty - hy) * 0.22; c.moveTo(hx, hy); c.lineTo(mx + nx * w, my + ny * w); c.lineTo(tx, ty); c.lineTo(mx - nx * w, my - ny * w); c.closePath(); } }
    else if (o.type === 'null') { const tr = SB.tracks.transform(o, tree.localTime(o)), q = X.world(o).transformPoint(U.pt(tr.ax, tr.ay)), [x, y] = O.P(q.x, q.y); c.arc(x, y, 18 * d, 0, Math.PI * 2); }
    else { const b = SB.scene.box(o); if (b) { b.pts.forEach((p, i) => { const [x, y] = O.P(p.x, p.y); i ? c.lineTo(x, y) : c.moveTo(x, y); }); c.closePath(); } }
    c.fill(); c.stroke();
    // its name next to it
    const b = o.type === 'null' || bone ? null : SB.scene.box(o), label = bone ? `${bone.name} (${o.name})` : o.name;
    let lx, ly; if (b) [lx, ly] = O.P(Math.min(...b.pts.map(p => p.x)), Math.min(...b.pts.map(p => p.y))); else if (S.hover) [lx, ly] = O.P(S.hover.x, S.hover.y);
    if (lx != null) { c.font = `600 ${12 * d}px Lexend, system-ui, sans-serif`; const tw = c.measureText(label).width; c.fillStyle = col; c.fillRect(lx, ly - 22 * d, tw + 12 * d, 18 * d); c.fillStyle = '#fff'; c.textBaseline = 'middle'; c.fillText(label, lx + 6 * d, ly - 13 * d); }
    c.restore();
  });
})(window.SB);
