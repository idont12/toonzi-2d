/* How effects are applied. The effects themselves are in library.js.

   An effect definition:
     id, label
     cat     'loop' (repeats, can be timed), 'static' (always on), 'in' (start of clip), 'out' (end of clip)
     params  { amt: {label, min, max, step, def}, speed: {...}, dur: {...}, dir: {...} }  (see PARAMS)
     only    optional list of object types it works on
     apply(r, x)  change the render state r. x has:
                    e (the effect instance), amt, speed, T (seconds × speed since it started),
                    u (0→1 progress for in/out transitions), seed, sc (stage scale), o (the object)
   Render state r: x, y, sx, sy, rot, opacity, ax, ay, filters[], glow, wave, boil, prog (draw-on 0..1),
                   dash, chars (typewriter), clip (wipe), trx (designed transitions),
                   styles[] (layer styles: { kind: 'drop'|'outline'|'inner', color, alpha, dx, dy, blur, size, blend })
   A param can be a number { label, min, max, step, def }, a choice { label, options: {value: label}, def }
   or a color { label, type: 'color', def: '#000000' }. */
'use strict';
(function (SB) {
  const U = SB.util, S = SB.state;
  // Common parameter presets so effects stay one line each.
  const PARAMS = SB.FX_PARAMS = {
    amt: { label: 'Amount', min: 0, max: 4, step: 0.05, def: 1 },
    speed: { label: 'Speed', min: 0.1, max: 4, step: 0.05, def: 1 },
    dur: { label: 'Length s', min: 0.05, max: 4, step: 0.05, def: 0.6 },
    dir: { label: 'Direction', options: { left: 'Left', right: 'Right', up: 'Top', down: 'Bottom' }, def: 'left' },
  };
  SB.FX_CATS = { in: 'Transitions in', out: 'Transitions out', loop: 'Animated effects', static: 'Looks' };

  /** Define an effect. params can be a list of preset names or a full object. */
  SB.effect = def => {
    if (Array.isArray(def.params)) def.params = Object.fromEntries(def.params.map(k => [k, Object.assign({}, PARAMS[k])]));
    def.params = def.params || {};
    if (def.defaultDur != null && def.params.dur) def.params.dur.def = def.defaultDur;
    return SB.effects.add(def);
  };

  const E = SB.fx = {
    make(type) { const d = SB.effects.get(type), e = { id: U.uid(), type, on: true }; for (const k in d.params) e[k] = d.params[k].def; return e; },
    timed: e => { const d = SB.effects.get(e.type); return !!d && (d.cat !== 'static'); },
    /** [start, length] of an effect inside its clip, in local time. */
    span(o, e) {
      const d = SB.effects.get(e.type), c = d.cat;
      const D = d.duration ? d.duration(o, e) : Math.max(0.05, e.dur ?? 0.6);
      if (c === 'in') return [e.at || 0, D];
      if (c === 'out') return [o.dur - (e.gap || 0) - D, D];
      const a = e.at || 0; return [a, e.len != null ? e.len : Math.max(0.05, o.dur - a)];
    },
    /** Apply all effects of o at local time lt to the transform tr. */
    state(o, lt, tr, opt = {}) {
      const r = { prog: 1, dash: null, x: tr.x, y: tr.y, sx: tr.scale * (tr.scx ?? 1), sy: tr.scale * (tr.scy ?? 1), rot: tr.rot, opacity: tr.opacity, ax: tr.ax, ay: tr.ay, filters: [], wave: null, boil: null, glow: 0, chars: Infinity, clip: null, trx: null, styles: [] };
      if (opt.noFx || !o.effects || !o.effects.length) return r;
      const seed = U.seedOf(o.id), L = lt + (o.phase || 0), left = o.dur - lt;
      for (const e of o.effects) {
        const d = SB.effects.get(e.type); if (e.on === false || !d) continue;
        const at = d.cat === 'out' ? 0 : (e.at || 0);
        if (d.cat === 'loop' && (L < at || (e.len != null && L >= at + e.len))) continue;
        const D = d.duration ? d.duration(o, e) : Math.max(0.05, e.dur ?? 0.6), speed = e.speed ?? 1;
        const u = d.cat === 'in' ? U.clamp((L - at) / D, 0, 1) : d.cat === 'out' ? U.clamp((left - (e.gap || 0)) / D, 0, 1) : 1;
        d.apply(r, { e, o, amt: e.amt ?? 1, speed, T: (L - at) * speed, u, seed, sc: opt.sc || 1 });
      }
      return r;
    },
    /** Effects available for an object. The same effect can be added more than once (two shadows, two glows…). */
    available(o) { return SB.effects.where(d => !d.only || d.only.includes(o.type)); },
    /** Can the project's target (Unity, Lottie…) carry effect d? Others stay listed, greyed out. */
    usable(d) { const t = SB.targets ? SB.targets.get() : 'video'; return t === 'video' || !d || SB.targets.fxOk(t, d); },
    add(items, type) {
      if (!E.usable(SB.effects.get(type))) { SB.targets.blocked(`The ${SB.effects.get(type).label} effect`); return 0; }
      let n = 0; for (const x of items) { const t = SB.types.get(x.type); if (!t.fx) continue; const d = SB.effects.get(type); if (d.only && !d.only.includes(x.type)) continue; const e = E.make(type); if (d.init) d.init(e, x); x.effects.push(e); n++; }
      SB.bump(); SB.commit(); const d = SB.effects.get(type); if (n && d && (d.cat === 'in' || d.cat === 'out') && !S.playing) { const x = items.find(i => (i.effects || []).some(e => e.type === type)); if (x) E.preview(x, x.effects.filter(e => e.type === type).pop()); } return n;
    },
    /** Show a transition (or a timed effect) without playing the animation: the playhead runs over it once, then goes back. */
    preview(o, e) {
      if (!o || !e || S.playing || S.exporting) return; const [a, d] = E.span(o, e), T = SB.tree, lt0 = Math.max(0, a - 0.15), lt1 = Math.min(o.dur, a + d + 0.25), back = S.time;
      const t0 = T.mainAt(o, lt0), t1 = T.mainAt(o, Math.max(lt0, lt1 - 1e-3)), len = Math.max(0.1, t1 - t0), start = performance.now(); E._prev = start;
      const step = () => { if (E._prev !== start || S.playing) return; const u = (performance.now() - start) / 1000 / len; if (u >= 1) { E._prev = 0; SB.time.set(back); return; } SB.time.set(t0 + u * len); requestAnimationFrame(step); };
      step();
    },
    /** Turn an effect on or off (an animated on/off gets a key at the playhead instead). */
    setOn(o, e, on) { const k = `fx:${e.id}:on`; if (SB.tracks.animated(o, k)) SB.tracks.set(o, k, !!on); else if (on) delete e.on; else e.on = false; SB.commit(); SB.toast(`${(SB.effects.get(e.type) || { label: 'Effect' }).label} turned ${on ? 'on' : 'off'}.`); },
    /** Its settings in a popover next to anchor (an element, or { x, y } on the screen). */
    settings(o, e, anchor) {
      let a = anchor, tmp = null; if (!(anchor instanceof Element)) { tmp = a = SB.util.h('span', { style: { position: 'fixed', left: anchor.x + 'px', top: anchor.y + 'px', width: '1px', height: '1px' } }); document.body.appendChild(tmp); }
      SB.popover(a, SB.util.h('div.fx-pop', null, SB.inspector.fxItem(o, e)), { onClose: () => { if (tmp) tmp.remove(); } });
    },
    remove(o, id) { const e = o.effects.find(x => x.id === id); o.effects = o.effects.filter(x => x.id !== id); SB.tracks.drop(o, 'fx:' + id + ':'); return e; },
  };
})(window.SB);
