/* Mirror drawing: what you draw with the Brush, the Fill brush or the Eraser is drawn again, mirrored across a line.
   S.mirror = { on, x, y, a }: the line goes through stage point (x, y) at angle a (degrees; 90 = upright).
   On the stage: drag the middle dot to move the line, the end dot to turn it (Shift: 15° steps).
   The drawing tools (js/tools/draw.js) ask SB.mirror.down(P) first (a handle?), and SB.mirror.local(sp) for the
   mirroring in the layer's own space, so it is right on moved, scaled or turned layers too. */
'use strict';
(function (SB) {
  const U = SB.util, S = SB.state, h = U.h, W = SB.w;
  const M = () => { if (!S.mirror) S.mirror = { on: false, x: S.project.w / 2, y: S.project.h / 2, a: 90 }; return S.mirror; };
  const TOOLS = new Set(['brush', 'fillbrush', 'eraser', 'pull', 'width', 'smooth']);
  const active = () => M().on && TOOLS.has(S.tool);
  const ARM = 90; // the turn dot: this many screen pixels from the middle
  /** The mirror as a matrix on the stage: reflection across the line. */
  function stageMatrix() {
    const m = M(), t = m.a * Math.PI / 180, c = Math.cos(2 * t), s = Math.sin(2 * t);
    return new DOMMatrix().translate(m.x, m.y).multiply(new DOMMatrix([c, s, s, -c, 0, 0])).translate(-m.x, -m.y);
  }
  /** The mirror in a layer's own space (sp: SB.tool.space(o)): local point → its mirror image, local. */
  const local = sp => sp.Minv.multiply(stageMatrix()).multiply(sp.M);
  const mapPts = (Mx, a) => { const out = []; for (let i = 0; i + 1 < a.length; i += 2) { const q = Mx.transformPoint(U.pt(a[i], a[i + 1])); out.push(U.r1(q.x), U.r1(q.y)); } return out; };
  /** The turn dot on the stage (it keeps its distance on screen at any zoom). */
  const arm = () => { const m = M(), t = m.a * Math.PI / 180, r = ARM / SB.view.k(); return { x: m.x + Math.cos(t) * r, y: m.y + Math.sin(t) * r }; };
  /** A press on a handle: start moving or turning the line (true), else false so the tool draws. */
  function down(P) {
    if (!active()) return false; const m = M(), tol = 12 / SB.view.k(), a = arm();
    const kind = Math.hypot(P.x - a.x, P.y - a.y) < tol ? 'turn' : Math.hypot(P.x - m.x, P.y - m.y) < tol ? 'move' : null; if (!kind) return false;
    SB.tool.drag = { kind: 'mirror', mode: kind, dx: P.x - m.x, dy: P.y - m.y }; return true;
  }
  function move(P, e = {}) {
    const d = SB.tool.drag; if (!d || d.kind !== 'mirror') return false; const m = M();
    if (d.mode === 'move') { m.x = U.r1(P.x - d.dx); m.y = U.r1(P.y - d.dy); }
    else { let a = Math.atan2(P.y - m.y, P.x - m.x) * 180 / Math.PI; if (e.shiftKey) a = Math.round(a / 15) * 15; m.a = U.r1(((a % 180) + 180) % 180); }
    SB.dirty(); return true;
  }
  function up() { const d = SB.tool.drag; if (!d || d.kind !== 'mirror') return false; SB.tool.drag = null; SB.prefs && SB.prefs.save(); SB.invalidate('ctxbar'); return true; }
  /** The line across the whole view, the middle dot (move) and the turn dot. */
  function overlay(O) {
    if (!active() || S.playing) return; const m = M(), t = m.a * Math.PI / 180, L = 1e5, c = O.c, d = O.dpr;
    const [x0, y0] = O.P(m.x - Math.cos(t) * L, m.y - Math.sin(t) * L), [x1, y1] = O.P(m.x + Math.cos(t) * L, m.y + Math.sin(t) * L), [cx, cy] = O.P(m.x, m.y), a = arm(), [ax, ay] = O.P(a.x, a.y);
    c.save(); c.lineWidth = 1.5 * d; c.strokeStyle = 'rgba(91,61,245,.75)'; c.setLineDash([8 * d, 6 * d]); c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); c.setLineDash([]);
    c.strokeStyle = '#5B3DF5'; c.fillStyle = '#fff'; c.lineWidth = 2 * d;
    c.beginPath(); c.moveTo(cx, cy); c.lineTo(ax, ay); c.stroke();
    c.beginPath(); c.arc(cx, cy, 7 * d, 0, Math.PI * 2); c.fill(); c.stroke(); c.beginPath(); c.moveTo(cx - 4 * d, cy); c.lineTo(cx + 4 * d, cy); c.moveTo(cx, cy - 4 * d); c.lineTo(cx, cy + 4 * d); c.stroke();
    c.beginPath(); c.arc(ax, ay, 5.5 * d, 0, Math.PI * 2); c.fillStyle = '#5B3DF5'; c.fill(); c.restore();
  }
  /** The bar: Mirror on/off; when on, upright / level / the angle, and back to the middle. */
  function bar() {
    const m = M(); if (!m.on) return [W.check(false, 'Mirror', v => { m.on = v; SB.invalidate('ctxbar'); SB.dirty(); })];
    return [W.check(true, 'Mirror', v => { m.on = v; SB.invalidate('ctxbar'); SB.dirty(); }),
      W.seg(m.a === 90 ? 'v' : m.a === 0 ? 'h' : '', [['v', 'Upright', 'Mirror left and right'], ['h', 'Level', 'Mirror top and bottom']], v => { m.a = v === 'v' ? 90 : 0; SB.invalidate('ctxbar'); SB.dirty(); }),
      W.popSlider('Angle', m.a, { min: 0, max: 179, unit: '°', title: 'Turn the mirror line (or drag its end dot on the stage)', input: v => { m.a = v; SB.dirty(); }, change: () => SB.invalidate('ctxbar') }),
      W.iconBtn('fit', 'Mirror line to the middle of the stage', () => { m.x = S.project.w / 2; m.y = S.project.h / 2; SB.dirty(); }, 'sm')];
  }
  /** A point mirrored with matrix Mx ({ x, y }), and a move (dx, dy) mirrored (no shift). */
  const pt = (Mx, p) => Mx.transformPoint(U.pt(p.x, p.y)), vec = (Mx, dx, dy) => [Mx.a * dx + Mx.c * dy, Mx.b * dx + Mx.d * dy];
  SB.mirror = { get state() { return M(); }, active, local, mapPts, pt, vec, down, move, up, overlay, bar, stageMatrix };
})(window.SB);
