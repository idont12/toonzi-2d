/* The effect designer: make an effect without code.
   An effect is a list of changes. Each change is one thing about the layer (move, scale, turn,
   fade, blur, colors, glow, shadow) and how much it changes. The kind decides when it happens:
     Look      the change is always on
     Animated  the change moves with a pattern (wave, bounce, beat, shake, blink, keep going)
     In / Out  the layer starts (or ends) changed and eases back to normal
   A design { id, name, kind: 'static'|'loop'|'in'|'out', changes: [{ p, v, pat, n, ease, bz, bzp }], speed, dur, ease, bz, bzp, loopT: { ease, bz, bzp } }
   n: how many times an animated change happens in each cycle. ease (with bz / bzp for a custom curve, as on
   keyframes): the change's own easing, over the effect's (ease for In / Out, loopT for the timing inside each
   cycle of an animated effect)
   is saved in the project (S.doc.fxDesigns) and becomes the effect 'fd:<id>', listed with the
   built-in ones (marked ✦). Its Amount (and Speed or Length) can still be set per layer. */
'use strict';
(function (SB) {
  const U = SB.util, S = SB.state, h = U.h, W = SB.w;

  // ---------- what a change can change: [label, unit, value when added]
  const PROPS = {
    x: ['Move left–right', 'px', 40], y: ['Move up–down', 'px', -30], scale: ['Size', '%', 20], sx: ['Width', '%', 20], sy: ['Height', '%', 20], rot: ['Turn', '°', 15],
    opacity: ['Opacity', '%', -60], blur: ['Blur', 'px', 6], bright: ['Brightness', '%', 30], contrast: ['Contrast', '%', 30], sat: ['Color strength', '%', 60],
    hue: ['Hue', '°', 90], gray: ['Black & white', '%', 100], sepia: ['Sepia', '%', 80], invert: ['Invert', '%', 100], glow: ['Glow', 'px', 20], shadow: ['Shadow', 'px', 16],
  };
  const pos = v => Math.max(0, v);
  /** Change render state r by v for property p. */
  function setProp(r, p, v, sc) {
    switch (p) {
      case 'x': r.x += v; break; case 'y': r.y += v; break; case 'rot': r.rot += v; break;
      case 'scale': { const k = pos(1 + v / 100); r.sx *= k; r.sy *= k; break; }
      case 'sx': r.sx *= pos(1 + v / 100); break; case 'sy': r.sy *= pos(1 + v / 100); break;
      case 'opacity': r.opacity *= pos(1 + v / 100); break;
      case 'blur': if (v > 0.01) r.filters.push(`blur(${(v * sc).toFixed(2)}px)`); break;
      case 'bright': r.filters.push(`brightness(${pos(1 + v / 100).toFixed(3)})`); break;
      case 'contrast': r.filters.push(`contrast(${pos(1 + v / 100).toFixed(3)})`); break;
      case 'sat': r.filters.push(`saturate(${pos(1 + v / 100).toFixed(3)})`); break;
      case 'hue': r.filters.push(`hue-rotate(${v.toFixed(1)}deg)`); break;
      case 'gray': r.filters.push(`grayscale(${U.clamp(Math.abs(v) / 100, 0, 1).toFixed(3)})`); break;
      case 'sepia': r.filters.push(`sepia(${U.clamp(Math.abs(v) / 100, 0, 1).toFixed(3)})`); break;
      case 'invert': r.filters.push(`invert(${U.clamp(Math.abs(v) / 100, 0, 1).toFixed(3)})`); break;
      case 'glow': r.glow += pos(v); break;
      case 'shadow': if (v > 0.2) r.styles.push({ kind: 'drop', color: '#14122A', alpha: 0.4, dx: v * 0.35, dy: v * 0.6, blur: v, blend: 'multiply' }); break;
    }
  }
  // ---------- patterns of an animated change: t in cycles (seconds × speed), returns how much of the change
  const PATTERNS = {
    wave: ['Wave', 'Smoothly back and forth', t => Math.sin(t * Math.PI * 2)],
    bounce: ['Bounce', 'Up and back, like a bounce', t => Math.abs(Math.sin(t * Math.PI))],
    beat: ['Beat', 'A quick pulse, then rest', t => Math.pow(Math.max(0, Math.sin(t * Math.PI * 2)), 8)],
    shake: ['Shake', 'Random jitter', (t, s) => U.noise(t * 6, s)],
    blink: ['Blink', 'On and off', t => (t % 1) < 0.5 ? 1 : 0],
    grow: ['Keep going', 'Adds the change every second (spin, drift)', t => t],
  };
  const EASE_IDS = ['smooth', 'linear', 'easeIn', 'easeOut', 'back', 'bounce', 'elastic'];
  const KINDS = [['static', 'Look', 'Always on'], ['loop', 'Animated', 'Moves over and over'], ['in', 'In', 'How the layer arrives'], ['out', 'Out', 'How the layer leaves']];

  /** An easing function from { ease, bz, bzp } (named, or a custom curve like a keyframe's). */
  const easeFn = (o, def) => { const e = o && o.ease ? o : def; return e && e.ease ? SB.tracks.easeOf({ e: e.ease, bz: e.bz, bzp: e.bzp }) : (u => u); };
  /** What a design does to render state r (x: the engine's effect context). */
  function apply(D, r, x) {
    const amt = x.amt ?? 1;
    D.changes.forEach((c, i) => {
      let f = 1;
      if (D.kind === 'loop') {
        let t = x.T * (D.speed || 1) * Math.max(1, c.n || 1); // n: times in each cycle
        const ez = c.ease ? easeFn(c) : D.loopT && D.loopT.ease && D.loopT.ease !== 'linear' ? easeFn(D.loopT) : null;
        if (ez) { const k = Math.floor(t); t = k + ez(t - k); } // the timing inside each cycle
        f = (PATTERNS[c.pat] || PATTERNS.wave)[2](t, (x.seed || 0) + i * 13);
      }
      else if (D.kind === 'in' || D.kind === 'out') f = 1 - easeFn(c, { ease: D.ease || 'smooth', bz: D.bz, bzp: D.bzp })(U.clamp(x.u, 0, 1));
      if (f) setProp(r, c.p, c.v * amt * f, x.sc || 1);
    });
  }

  // ---------- designs are effects like the built-in ones
  const list = () => S.doc.fxDesigns || [];
  const find = id => list().find(d => d.id === id);
  function sync() {
    SB.effects.where(d => d.id.startsWith('fd:') && !find(d.id.slice(3))).forEach(d => SB.effects.remove(d.id));
    list().forEach(D => SB.effect({ id: 'fd:' + D.id, label: D.name + ' ✦', cat: D.kind, fxDesign: D.id, defaultDur: D.dur || 0.6,
      params: D.kind === 'loop' ? ['amt', 'speed'] : D.kind === 'static' ? ['amt'] : ['dur', 'amt'],
      apply(r, x) { const d = find(D.id); if (d) apply(d, r, x); } }));
    SB.invalidate && SB.invalidate('inspector');
  }
  SB.on('doc', sync);

  // ---------- ready-made starting points
  const C = (p, v, pat) => ({ p, v, pat });
  const PRESETS = {
    heartbeat: ['Heartbeat', { kind: 'loop', speed: 1.2, changes: [C('scale', 14, 'beat')] }],
    float: ['Float', { kind: 'loop', speed: 0.4, changes: [C('y', -16, 'wave'), C('rot', 3, 'wave')] }],
    jelly: ['Jelly', { kind: 'loop', speed: 1.5, changes: [C('sx', 8, 'wave'), C('sy', -8, 'wave')] }],
    glitch: ['Glitch', { kind: 'loop', speed: 3, changes: [C('x', 6, 'shake'), C('hue', 60, 'shake'), C('opacity', -30, 'blink')] }],
    spinner: ['Spinner', { kind: 'loop', speed: 1, changes: [C('rot', 180, 'grow')] }],
    neon: ['Neon', { kind: 'static', changes: [C('glow', 24), C('bright', 15), C('sat', 50)] }],
    vintage: ['Vintage photo', { kind: 'static', changes: [C('sepia', 70), C('contrast', -12), C('bright', 6)] }],
    dreamy: ['Dreamy', { kind: 'static', changes: [C('blur', 2), C('bright', 12), C('glow', 14)] }],
    popin: ['Pop in', { kind: 'in', dur: 0.5, ease: 'back', changes: [C('scale', -100), C('rot', -20), C('opacity', -100)] }],
    dropin: ['Drop in', { kind: 'in', dur: 0.7, ease: 'bounce', changes: [C('y', -300)] }],
    blurin: ['Blur and fade in', { kind: 'in', dur: 0.6, ease: 'smooth', changes: [C('blur', 20), C('opacity', -100), C('scale', 8)] }],
    spinout: ['Spin away', { kind: 'out', dur: 0.6, ease: 'easeIn', changes: [C('rot', 180), C('scale', -100)] }],
  };

  // ---------- the designer
  const CW = 460, CH = 280;
  function open(D0, onSaved) {
    const D = D0 ? U.deep(D0) : Object.assign({ id: U.uid(), name: `Effect ${list().length + 1}` }, U.deep(PRESETS.float[1]), { kind: 'loop' });
    D.speed = D.speed || 1; D.dur = D.dur || 0.6; D.ease = D.ease || 'smooth'; D.changes = D.changes || [];
    const dpr = Math.min(2, devicePixelRatio || 1), cv = h('canvas.fxd-cv', { width: CW * dpr, height: CH * dpr }), c = cv.getContext('2d');
    let raf = 0, t0 = performance.now(); const side = h('div.fxd-side');
    function card(ctx) {
      const w = 190, hh = 120, g = ctx.createLinearGradient(-w / 2, -hh / 2, w / 2, hh / 2); g.addColorStop(0, '#7B5CFF'); g.addColorStop(1, '#FF4F8B');
      ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(-w / 2, -hh / 2, w, hh, 16); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = '600 24px Lexend, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('Your layer', 0, 0);
    }
    /** The sample layer with the effect at the preview time. */
    function frame(now) {
      const el = (now - t0) / 1000, r = { x: 0, y: 0, sx: 1, sy: 1, rot: 0, opacity: 1, filters: [], glow: 0, styles: [] };
      let u = 1, T = el; if (D.kind === 'in' || D.kind === 'out') { const cyc = D.dur + 0.8, k = el % cyc; u = U.clamp(k / D.dur, 0, 1); if (D.kind === 'out') u = 1 - u; }
      apply(D, r, { amt: 1, T, u, seed: 7, sc: 1 });
      c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, CW, CH);
      c.save(); c.translate(CW / 2 + r.x, CH / 2 + r.y); c.rotate(r.rot * Math.PI / 180); c.scale(r.sx, r.sy); c.globalAlpha = U.clamp(r.opacity, 0, 1);
      const shadows = r.styles.filter(s => s.kind === 'drop').map(s => `drop-shadow(${s.dx}px ${s.dy}px ${s.blur / 2}px rgba(20,18,42,${s.alpha}))`);
      c.filter = r.filters.concat(shadows).join(' ') || 'none'; if (r.glow > 0) { c.shadowColor = 'rgba(155,120,255,.95)'; c.shadowBlur = r.glow * dpr; }
      card(c); c.restore();
      if (D.kind === 'in' || D.kind === 'out') { c.setTransform(dpr, 0, 0, dpr, 0, 0); c.fillStyle = 'rgba(91,61,245,.85)'; c.fillRect(0, CH - 4, CW * (D.kind === 'in' ? u : 1 - u), 4); }
      raf = requestAnimationFrame(frame);
    }
    /** An easing picker for holder (keys ease, bz, bzp): the named eases, a custom curve (edited in the curve pop-up,
        starting from the easing it has), and with inherit a "same as the effect" choice. */
    function easePick(holder, label, inherit) {
      const opts = [...(inherit ? [['', inherit]] : []), ...EASE_IDS.map(k => [k, SB.tracks.EASES[k].label]), ['bez', 'Custom curve…']];
      const editCurve = el => { const r = el.getBoundingClientRect(), key = { e: holder.ease || 'smooth', bz: holder.bz, bzp: holder.bzp };
        SB.curves.open([key], { x: r.left, y: r.bottom + 6, onChange: () => { holder.ease = 'bez'; holder.bz = key.bz; holder.bzp = key.bzp; t0 = performance.now(); } }); };
      const sel = W.select(holder.ease || '', opts, v => { if (v === 'bez') { editCurve(sel); render(); return; } if (v) holder.ease = v; else delete holder.ease; delete holder.bz; delete holder.bzp; render(); }, label);
      const wrap = h('span.fxd-ease', null, sel); if (holder.ease === 'bez') wrap.appendChild(W.iconBtn('curve', 'Edit the curve', e => editCurve(e.currentTarget), 'sm'));
      return wrap;
    }
    const changeRow = (ch, i, okP) => {
      const P = PROPS[ch.p] || PROPS.x, timed = D.kind !== 'static';
      return h('div.fxd-ch', null,
        h('div.fxd-r1', null,
          W.select(ch.p, Object.entries(PROPS).map(([k, v]) => [k, v[0] + (okP(k) ? '' : ` (not in ${SB.targets.short()})`), !okP(k) && k !== ch.p]), v => { ch.p = v; if (!ch.v) ch.v = PROPS[v][2]; render(); }, 'What changes'),
          h('label.fxd-v', null, W.num(ch.v, { step: 1, label: 'How much', change: v => { ch.v = v; }, input: v => { ch.v = v; } }), h('span', null, P[1])),
          W.iconBtn('x', 'Remove this change', () => { D.changes.splice(i, 1); render(); }, 'sm')),
        timed ? h('div.fxd-r2', null,
          D.kind === 'loop' ? W.select(ch.pat || 'wave', Object.entries(PATTERNS).map(([k, v]) => [k, v[0]]), v => { ch.pat = v; render(); }, 'How it moves') : null,
          D.kind === 'loop' ? h('label.fxd-n', { title: 'How many times this change happens in each cycle of the effect' }, W.num(ch.n || 1, { min: 1, max: 32, step: 1, label: 'Times in each cycle', change: v => { ch.n = U.clamp(Math.round(v), 1, 32); if (ch.n === 1) delete ch.n; t0 = performance.now(); } }), h('span', null, '× a cycle')) : null,
          easePick(ch, 'Easing of this change', D.kind === 'loop' ? 'Effect’s timing' : 'Effect’s ease')) : null);
    };
    function render() {
      const nameIn = h('input', { type: 'text', value: D.name, 'aria-label': 'Name' }); nameIn.oninput = () => D.name = nameIn.value;
      const tgt = SB.targets ? SB.targets.get() : 'video', okP = k => tgt === 'video' || ['x', 'y', 'scale', 'sx', 'sy', 'rot'].includes(k) || ((tgt === 'lottie' || tgt === 'game') && k === 'opacity');
      // every kind of change is listed; the ones this screen's format can't show are greyed out
      const add = W.select('', [['', '+ Add a change…'], ...Object.entries(PROPS).map(([k, v]) => [k, v[0] + (okP(k) ? '' : ` (not in ${SB.targets.short()})`), !okP(k)])], v => { if (!v) return; D.changes.push({ p: v, v: PROPS[v][2], pat: 'wave' }); render(); }, 'Add a change');
      add.classList.add('fxd-add');
      const hint = { static: 'A look: the changes are always on.', loop: 'Animated: each change moves with its pattern. Speed sets how many times a second.', in: 'In: the layer starts with these changes and eases back to normal.', out: 'Out: the layer eases into these changes as it leaves.' }[D.kind];
      side.replaceChildren(...[
        W.row('Name', nameIn),
        W.row('Kind', W.seg(D.kind, KINDS, v => { D.kind = v; t0 = performance.now(); render(); })),
        h('div.td-preset', null, W.select('', [['', 'Start from a preset…'], ...Object.entries(PRESETS).map(([k, v]) => [k, v[0]])], v => { if (!v) return; const p = U.deep(PRESETS[v][1]); Object.assign(D, { speed: 1, dur: 0.6, ease: 'smooth' }, p); if (/^Effect \d+$/.test(D.name)) D.name = PRESETS[v][0]; t0 = performance.now(); render(); }, 'Preset')),
        h('h4.subh', null, 'Changes'),
        D.changes.length ? h('div.fxd-list', null, D.changes.map((c, i) => changeRow(c, i, okP))) : h('p.hint', null, 'Nothing changes yet. Add a change below.'),
        add,
        D.kind === 'loop' ? W.row('Speed', W.range(D.speed, { min: 0.1, max: 5, step: 0.05, label: 'Times a second', input: v => D.speed = v })) : null,
        D.kind === 'loop' ? W.row('Timing', easePick(D.loopT || (D.loopT = { ease: 'linear' }), 'Timing inside each cycle')) : null,
        D.kind === 'in' || D.kind === 'out' ? [W.row('Length s', W.num(D.dur, { min: 0.05, max: 6, step: 0.05, label: 'Length', change: v => { D.dur = U.clamp(v, 0.05, 6); } })), W.row('Ease', easePick(D, 'Ease'))] : null,
        h('p.hint', null, hint)].flat().filter(Boolean));
    }
    const save = () => {
      D.name = (D.name || '').trim() || 'My effect'; const all = S.doc.fxDesigns = list().filter(x => x.id !== D.id); all.push(D);
      sync(); dlg.close(); SB.commit(); SB.toast(`${D.name} saved. Find it in ${D.kind === 'in' || D.kind === 'out' ? 'Transitions' : 'Effects'} (✦).`); onSaved && onSaved(D);
    };
    const sel = SB.tree.selected().filter(o => SB.types.get(o.type).fx);
    const dlg = SB.dialog.sheet([h('h2', null, D0 ? `Edit ${D0.name}` : 'Design an effect'), h('div.fxd', null, h('div.fxd-main', null, cv), side),
      h('div.sheet-actions', null, W.btn('Cancel', () => dlg.close(), { cls: 'ghost' }),
        !D0 && sel.length ? W.btn(`Save and add to ${sel.length > 1 ? sel.length + ' layers' : sel[0].name}`, () => { onSaved = (d => { SB.fx.add(sel, 'fd:' + d.id); }); save(); }, {}) : null,
        W.btn('Save effect', save, { cls: 'primary' }))], { size: 'xwide', onClose: () => cancelAnimationFrame(raf) });
    render(); raf = requestAnimationFrame(frame);
  }
  function remove(D) { S.doc.fxDesigns = list().filter(x => x.id !== D.id); SB.tree.all().forEach(o => { if (o.effects) o.effects = o.effects.filter(e => e.type !== 'fd:' + D.id); }); sync(); SB.commit(); }
  function duplicate(D) { const c = Object.assign(U.deep(D), { id: U.uid(), name: D.name + ' copy' }); (S.doc.fxDesigns = list()).push(c); sync(); SB.commit(); return c; }
  SB.fxDesigner = { open, remove, duplicate, sync, find, list, PROPS, PATTERNS, PRESETS, apply };
  sync();
})(window.SB);
