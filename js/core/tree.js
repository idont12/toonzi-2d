/* The layer tree: lookup, parents, selection and creating new objects.
   Objects live in S.objects; groups keep their layers in o.children.

   Time: an object's start is on its parent's clock. Normal groups share the
   clock of their parent. A shot (a group with seq: true) has its own clock:
   its layers start at 0 inside it, and inPoint is the first moment shown,
   so a shot can be moved and trimmed like one clip (as in Premiere).
   S.ctx is the shot open in the timeline (null = main timeline). */
'use strict';
(function (SB) {
  const U = SB.util, S = SB.state;
  let IDX = new Map(), PAR = new Map();

  const T = SB.tree = {
    reindex() {
      IDX = new Map(); PAR = new Map();
      (function walk(list, p) { for (const o of list) { IDX.set(o.id, o); PAR.set(o.id, p); if (o.children) walk(o.children, o); } })(S.objects, null);
      SB.bump();
    },
    find(id) { if (!id) return null; let o = IDX.get(id); if (!o) { T.reindex(); o = IDX.get(id); } return o || null; },
    parentOf(o) { if (!o) return null; if (!PAR.has(o.id)) T.reindex(); return PAR.get(o.id) || null; },
    listOf(o) { const p = T.parentOf(o); return p ? p.children : S.objects; },
    all(list = S.objects, out = []) { for (const o of list) { out.push(o); if (o.children) T.all(o.children, out); } return out; },
    ancestors(o) { const a = []; let p = T.parentOf(o); while (p) { a.push(p); p = T.parentOf(p); } return a; },
    isDesc(o, anc) { let p = T.parentOf(o); while (p) { if (p === anc) return true; p = T.parentOf(p); } return false; },
    hidden: o => o.hidden || T.ancestors(o).some(a => a.hidden),
    locked: o => o.locked || T.ancestors(o).some(a => a.locked) || T.soloOut(o),
    /** "Show only this in the timeline": every other layer is locked meanwhile (not inside, or around, the layers shown). */
    soloOut: o => !!(S.solo && S.solo.size && !S.solo.has(o.id) && !T.ancestors(o).some(a => S.solo.has(a.id)) && !T.all([o]).some(x => S.solo.has(x.id))),

    // ---------- time
    // A layer cut with the Cut tool keeps one row and gets parts (Premiere style):
    //   o.parts = [{ a, d, off }]: the part plays from a to a + d on the parent clock and shows
    //   the layer's own time from off to off + d. Without parts the layer shows start … start + dur.
    // "outer" time is on the parent's clock; "native" time is the layer's own clock (where o.start is,
    // and where the layers inside a group live).
    partAt(o, t) { if (!o.parts) return null; for (const p of o.parts) if (t >= p.a && t < p.a + p.d) return p; return null; },
    /** Outer → native. Strict: null in a gap between parts. */
    inner(o, t, nearest) {
      if (!o.parts || !o.parts.length) return t;
      const p = T.partAt(o, t); if (p) return t - p.a + p.off + o.start; if (!nearest) return null;
      let best = o.parts[0], bd = Infinity; for (const q of o.parts) { const d = t < q.a ? q.a - t : t - (q.a + q.d); if (d < bd) { bd = d; best = q; } }
      return U.clamp(t - best.a, 0, Math.max(0, best.d - 1e-4)) + best.off + o.start;
    },
    /** Native → outer (through the part that shows that moment, or the nearest one). */
    outer(o, t) {
      if (!o.parts || !o.parts.length) return t; const lt = t - o.start; let best = o.parts[0], bd = Infinity;
      for (const q of o.parts) { const d = lt < q.off ? q.off - lt : lt >= q.off + q.d ? lt - (q.off + q.d) + 1e-9 : -1; if (d < bd) { bd = d; best = q; } }
      return lt - best.off + best.a;
    },
    /** Time on o's parent clock → the clock of o's children (and back). */
    childClock(g, t) { const u = T.inner(g, t, true); return g.seq ? u - g.start + (g.inPoint || 0) : u; },
    parentClock(g, t) { return T.outer(g, g.seq ? t + g.start - (g.inPoint || 0) : t); },
    /** Main-timeline time T on the clock o.start (or o.parts) is measured in. */
    parentTime(o, t) { const chain = T.ancestors(o); for (let i = chain.length - 1; i >= 0; i--) t = T.childClock(chain[i], t); return t; },
    /** The reverse: a time on o's parent clock, as main-timeline time. */
    mainOf(o, t) { for (const a of T.ancestors(o)) t = T.parentClock(a, t); return t; },
    /** Main-timeline time of o's local time lt. */
    mainAt(o, lt) { return T.mainOf(o, T.outer(o, o.start + lt)); },
    /** First and last moment o plays, on its parent clock. */
    span(o) { if (!o.parts || !o.parts.length) return [o.start, o.start + o.dur]; return [Math.min(...o.parts.map(p => p.a)), Math.max(...o.parts.map(p => p.a + p.d))]; },
    /** Is the playhead (or main time t) inside this clip and all its parent groups? */
    inRange(o, t = S.time) {
      const pt = T.parentTime(o, t);
      if (o.parts && o.parts.length ? !T.partAt(o, pt) : !(pt >= o.start && pt < o.start + o.dur)) return false;
      const p = T.parentOf(o); return p ? T.inRange(p, t) : true;
    },
    /** Local time inside the clip, clamped to it. */
    localTime: (o, t = S.time) => U.clamp(T.inner(o, T.parentTime(o, t), true) - o.start, 0, Math.max(0, o.dur - 1e-4)),
    rawLocal: (o, t = S.time) => T.inner(o, T.parentTime(o, t), true) - o.start,
    /** Move the playhead to local time lt of o. */
    goLocal(o, lt) { SB.time.set(T.mainAt(o, lt)); },
    /** Where o plays on the main timeline: [[from, to, localTimeAtFrom], ...] (one per part, cut by its groups). */
    windows(o) {
      let list = (o.parts && o.parts.length ? o.parts.map(p => [p.a, p.a + p.d, p.off]) : [[o.start, o.start + o.dur, 0]]);
      for (const g of T.ancestors(o)) { // carry the intervals up one clock at a time
        const out = [];
        for (const [x0, x1, l0] of list) {
          const n0 = g.seq ? x0 + g.start - (g.inPoint || 0) : x0, n1 = n0 + (x1 - x0); // on g's native clock
          const parts = g.parts && g.parts.length ? g.parts : [{ a: g.start, d: g.dur, off: 0 }];
          for (const p of parts) { const s0 = g.start + p.off, s1 = s0 + p.d, a = Math.max(n0, s0), b = Math.min(n1, s1); if (b > a) out.push([a - s0 + p.a, b - s0 + p.a, l0 + (a - n0)]); }
        }
        list = out;
      }
      return list;
    },
    /** Sort parts, drop empty ones, and go back to a plain clip when one part shows the whole thing. */
    tidyParts(o) {
      o.parts = o.parts.filter(p => p.d > 0.01).sort((x, y) => x.a - y.a);
      o.parts.forEach(p => { p.off = U.r3(Math.max(0, p.off)); p.d = U.r3(Math.min(p.d, Math.max(0.01, o.dur - p.off))); p.a = U.r3(p.a); });
      if (!o.parts.length || (o.parts.length === 1 && Math.abs(o.parts[0].off) < 1e-3 && Math.abs(o.parts[0].a - o.start) < 1e-3 && Math.abs(o.parts[0].d - o.dur) < 1e-3)) delete o.parts;
    },
    window(o) { const w = T.windows(o); return w.length ? [Math.min(...w.map(x => x[0])), Math.max(...w.map(x => x[1]))] : [0, 0]; },

    // ---------- the shot open in the timeline
    ctx: () => (S.ctx && T.find(S.ctx)) || null,
    /** The list new layers go into, and clicks pick from. */
    rootList() { const q = T.ctx(); return q ? q.children : S.objects; },
    /** The timeline's clock: inside an open shot it is the shot's own time. */
    dom: {
      now() { const q = T.ctx(); return q ? T.childClock(q, T.parentTime(q, S.time)) : S.time; },
      toMain(t) { const q = T.ctx(); return q ? T.mainOf(q, T.parentClock(q, t)) : t; },
      length() { const q = T.ctx(); return q ? Math.max(q.dur + (q.inPoint || 0), ...q.children.map(c => c.start + c.dur)) : S.project.duration; },
    },
    enter(q) {
      if (!q || !q.seq) return; S.ctx = q.id; S.solo = null;
      if (!T.inRange(q)) SB.time.set(T.mainOf(q, T.span(q)[0]) + 0.0001);
      T.select([]); SB.toast(`Inside ${q.name}. Its layers have their own time. Press Esc or Back to return.`);
    },
    exit() { const q = T.ctx(); if (!q) return; const up = T.ancestors(q).find(a => a.seq); S.ctx = up ? up.id : null; T.select([q.id]); },

    /** Groups follow their layers: start at the first one, end at the last (or earlier, when the group's end was trimmed). */
    normalize() {
      (function fit(list) {
        for (let i = list.length - 1; i >= 0; i--) {
          const o = list[i]; if (o.type !== 'group') continue; fit(o.children);
          if (o.seq) continue; // shots keep their own length (they are trimmed like clips)
          if (!o.children.length) { list.splice(i, 1); continue; }
          const s = Math.min(...o.children.map(c => c.start)), e = Math.max(...o.children.map(c => c.start + c.dur));
          // o.trim: an end of the group was dragged inward, so it shows less of its layers (it never reaches past them)
          const end0 = o.start + o.dur, ns = o.trim ? Math.max(o.start, s) : s, ne = o.trim ? Math.min(end0, e) : e;
          if (Math.abs(ns - o.start) > 1e-6) { SB.tracks.shift(o, o.start - ns); o.phase = (o.phase || 0) + (ns - o.start); if (o.parts) o.parts.forEach(p => p.off = U.r3(p.off - (ns - o.start))); o.start = U.r3(ns); }
          o.dur = U.r3(Math.max(0.1, ne - o.start)); if (o.trim && o.start <= s + 1e-3 && o.start + o.dur >= e - 1e-3) delete o.trim;
        }
      })(S.objects);
      T.reindex();
      for (const o of T.all()) if (o.parts) T.tidyParts(o);
      if (S.ctx && !T.find(S.ctx)) S.ctx = null;
      const end = Math.max(0, ...S.objects.filter(o => SB.types.get(o.type) && !SB.types.get(o.type).noLength).map(o => T.span(o)[1]));
      if (!S.project.fixedLen && end > S.project.duration + 1e-6) S.project.duration = Math.ceil(end * 2) / 2; // a length you set yourself stays: longer layers just end there
    },

    // ---------- selection
    sel: () => T.find(S.sel),
    selected() { const a = [...S.multi].map(T.find).filter(Boolean); const p = T.sel(); if (p && !a.includes(p)) a.unshift(p); return a.filter(o => !a.some(x => x !== o && T.isDesc(o, x))); },
    select(ids, opt = {}) {
      ids = (ids || []).filter(Boolean);
      const next = ids.length ? ids[ids.length - 1] : null;
      if (S.sel !== next) { S.selStrokes.clear(); S.selPart = null; SB.emit('selectionWillChange'); }
      S.multi = new Set(ids); S.sel = next; S.frameOverride = null;
      if (!opt.keepKeys) S.selKeys.clear();
      SB.emit('select'); SB.invalidate();
    },
    toggle(id) { const ids = [...S.multi]; const i = ids.indexOf(id); if (i >= 0) ids.splice(i, 1); else ids.push(id); T.select(ids); },
    others(o) { return T.selected().filter(x => x !== o); },

    /** Where a new clip starts for playhead time t: on the frame at or before it (never after, so the new layer shows at once). */
    startAt(t) { const f = S.project.fps || 24, v = Math.floor(t * f + 1e-6) / f; return Math.max(0, Math.floor(v * 10000 + 1e-6) / 10000); },
    // ---------- creating
    counters: {},
    make(type, extra = {}) {
      const def = SB.types.get(type), p = S.project;
      T.counters[type] = Math.max(T.counters[type] || 0, T.all().filter(o => o.type === type).length) + 1;
      return Object.assign({
        id: U.uid(), type, name: `${def.label} ${T.counters[type]}`,
        start: T.startAt(S.ctx ? Math.max(0, T.dom.now()) : U.clamp(S.time, 0, Math.max(0, p.duration - 0.5))), dur: 4, hidden: false, locked: false,
        x: p.w / 2, y: p.h / 2, scale: 1, scx: 1, scy: 1, rot: 0, opacity: 1, ax: 0, ay: 0,
        tracks: {}, effects: [], frames: [{ strokes: [] }], fps: 8, play: 'loop', frame: 0, phase: 0,
      }, def.defaults ? def.defaults(p) : {}, extra);
    },
    /** Make a group around children. convert=true moves children into the group's space. */
    makeGroup(children, name, x, y, convert) {
      if (convert) children.forEach(c => SB.xf.applyMatrix(c, new DOMMatrix().translateSelf(-x, -y)));
      const g = T.make('group', { children, x, y, frames: [] }); if (name) g.name = name;
      if (children.length) { g.start = Math.min(...children.map(c => c.start)); g.dur = Math.max(...children.map(c => c.start + c.dur)) - g.start; }
      return g;
    },
    /** Add to the top of the current list (or a group) and select it. */
    add(o, parent) { (parent ? parent.children : T.rootList()).unshift(o); T.reindex(); T.select([o.id]); SB.commit(); return o; },
    reid(o) { o.id = U.uid(); delete o.link; if (o.children) o.children.forEach(T.reid); }, // a copy in the same screen is a new thing
  };
})(window.SB);
