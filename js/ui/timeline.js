/* The timeline: one row per layer (top row = front), clips you can move and trim,
   keyframe diamonds, and open "animation rows" per property with their own keys.
   Drag a row's name to reorder it or drop it into a group. */
'use strict';
(function (SB) {
  const U = SB.util, S = SB.state, TR = SB.tracks, tree = SB.tree, esc = U.esc, h = U.h, W = SB.w;
  let tl, inner, drag = null, lastGrip = 0, lastEnd = 0, lastHead = { id: null, t: 0 }, lastClip = { id: null, t: 0 }, lastSel = null;
  const HEAD_DEF = () => (SB.layout.current === 'phone' ? 150 : SB.layout.current === 'tablet' ? 200 : 230);
  /** Width of the layer names: drag the grip at the right of the top corner (kept per layout). */
  const HEAD = () => { const w = S.tlHead && S.tlHead[SB.layout.current]; return w ? U.clamp(w, 110, Math.max(160, (tl ? tl.clientWidth : 800) - 80)) : HEAD_DEF(); };
  /** A layer's color in the timeline: its own (o.tlColor, set from the chip or the right-click menu) or its kind's. */
  const colorOf = o => o.tlColor || `var(${SB.types.get(o.type).color})`;
  const SWATCHES = ['#E5484D', '#F76B15', '#FFB224', '#30A46C', '#12A594', '#0091FF', '#3E63DD', '#8E4EC6', '#D6409F', '#8D6E63', '#6F6E77', '#1C1B22'];
  /** Pick a timeline color for layers (or take theirs away). */
  function colorPick(objs, anchor) {
    objs = [].concat(objs).filter(Boolean); if (!objs.length) return; const cur = objs[0].tlColor || '';
    const set = c => { objs.forEach(o => { if (c) o.tlColor = c; else delete o.tlColor; }); SB.commit(); };
    const custom = h('input', { type: 'color', value: cur || '#5B3DF5', title: 'Any color', 'aria-label': 'Any color' }); custom.oninput = () => { objs.forEach(o => o.tlColor = custom.value); render(); }; custom.onchange = () => SB.commit();
    const box = h('div.lc-pick', null, h('div.pop-h', null, objs.length > 1 ? `Color of ${objs.length} layers` : `Color of ${objs[0].name}`),
      h('div.lc-sw', null, SWATCHES.map(c => h('button' + (c === cur ? '.on' : ''), { type: 'button', title: c, 'aria-label': 'Color ' + c, style: { background: c }, onclick: () => { SB.popover.close(); set(c); } }))),
      W.seg(objs[0].tlTint === false ? 'clip' : 'row', [['row', 'Row and clip', 'Color the whole row (its name and its lane) and the clip'], ['clip', 'Clip only', 'Color only the clip and the icon']], v => { objs.forEach(o => { if (v === 'clip') o.tlTint = false; else delete o.tlTint; }); if (objs.some(o => o.tlColor)) SB.commit(); else render(); }),
      h('div.row', null, h('label.lc-custom', null, custom, 'Other…'), h('span.spacer'), Object.assign(W.btn('No color', () => { SB.popover.close(); set(null); }, { cls: 'sm ghost', title: 'Back to the color of its kind' }), { disabled: !objs.some(o => o.tlColor) })));
    if (anchor && anchor.getBoundingClientRect) SB.popover(anchor, box); else SB.popover.at(anchor ? anchor[0] : innerWidth / 2, anchor ? anchor[1] : innerHeight / 2, box);
  }

  /** Rows to show: [object, depth, isContextOnly]. With "solo" (or Big stage), only chosen layers (and their groups).
      Inside an open shot, the shot's layers on the shot's own clock. Shots show as one clip. */
  function rows() {
    const out = [], solo = focusSet() || S.solo;
    const walk = (list, d) => { for (const o of list) { out.push([o, d, false]); if (o.children && !o.collapsed && !o.seq) walk(o.children, d + 1); } };
    if (!solo) { walk(tree.rootList(), 0); return out; }
    // only the chosen layers and what is inside them, without the groups around them
    const tops = []; (function find(list) { for (const o of list) { if (solo.has(o.id)) tops.push(o); else if (o.children && !o.seq) find(o.children); } })(tree.rootList());
    walk(tops, 0); return out;
  }
  /** In Big stage the timeline shows only the selected layers. */
  const focusSet = () => S.focus && S.multi.size ? new Set(tree.selected().map(o => o.id)) : null;
  /** A time on o's parent clock, as a time on the timeline's clock (through parent groups that were cut or moved). */
  const toDom = (o, t) => { const q = tree.ctx(); for (const a of tree.ancestors(o)) { if (a === q) break; t = tree.parentClock(a, t); } return t; };
  /** The pieces of o's clip: its parts, or the whole clip. */
  const pieces = o => o.parts && o.parts.length ? o.parts.map((p, i) => ({ i, a: p.a, d: p.d, off: p.off })) : [{ i: -1, a: o.start, d: o.dur, off: 0 }];
  /** Timeline x (in seconds) of o's local time lt. */
  const ltX = (o, lt) => toDom(o, tree.outer(o, o.start + lt));
  /** Layers that share o's clock (not inside a nested shot): they move together with o. */
  const sameClock = o => { const out = []; (function w(l) { for (const c of l) { out.push(c); if (c.children && !c.seq) w(c.children); } })(o.children || []); return out; };
  /** Animatable properties of o, grouped for the animation rows. */
  function propGroups(o) {
    const G = [], P = (id, label) => ({ id, label }), def = SB.types.get(o.type);
    if (def.visual) G.push({ title: 'Transform', props: [P('x', 'X'), P('y', 'Y'), P('scale', 'Scale %'), P('scx', 'Stretch W %'), P('scy', 'Stretch H %'), P('rot', 'Rotation'), P('opacity', 'Opacity %'), P('ax', 'Origin X'), P('ay', 'Origin Y')] });
    if (def.frames && o.frames.length > 1 && o.play === 'library') G.push({ title: 'Frames', props: [P('frame', 'Frame shown')] });
    const own = def.props ? def.props(o) : []; if (own.length) G.push({ title: def.label, props: own.map(([id, l]) => P(id, l)) });
    for (const e of o.effects || []) { const d = SB.effects.get(e.type); if (!d) continue; G.push({ title: d.label, key: 'fx:' + e.id, props: [P(`fx:${e.id}:on`, 'On')].concat(Object.entries(d.params).filter(([k]) => k !== 'dir').map(([k, p]) => P(`fx:${e.id}:${k}`, p.label))) }); }
    for (const extra of SB.timeline.extraGroups) { const g = extra(o); if (g) G.push(g); }
    return G;
  }
  const kbClass = (o, id) => `kbtn${TR.animated(o, id) ? ' anim' : ''}${TR.keyAt(o.tracks[id], tree.localTime(o)) ? ' on' : ''}`;
  function valueInput(o, id) {
    const v = TR.value(o, id, tree.localTime(o)), ty = TR.type(id);
    if (ty === 'bool') return `<input type="checkbox" class="pv" ${v ? 'checked' : ''} aria-label="${esc(id)}">`;
    if (ty === 'color') return `<input type="color" class="pv" value="${esc(v)}" aria-label="${esc(id)}">`;
    if (ty === 'int') return `<select class="pv">${o.frames.map((f, i) => `<option value="${i}"${i === Math.round(v) ? ' selected' : ''}>${esc(f.name || 'Frame ' + (i + 1))}</option>`).join('')}</select>`;
    return `<input type="number" class="pv" value="${U.r2(v * TR.uiMul(id))}" step="1" aria-label="${esc(id)}">`;
  }

  /** Folded group headers of the animation rows (kept while the app is open): 'layerId|group'. */
  const folds = new Set(); let lastFx = null; // lastFx: the effect block clicked last (a second click soon after opens its settings)
  const isFolded = (o, key) => folds.has(o.id + '|' + key);
  function subRows(o, d, Wd, z) {
    const tint = o.tlColor && o.tlTint !== false, tintA = tint ? ` style="--rc:${o.tlColor}"` : '', tintC = tint ? ' tinted' : '';
    let html = ''; const col = colorOf(o), pad = Math.min(58 + d * 14, Math.round(HEAD() * 0.3)), ghost = pieces(o).map(pc => `<span class="cghost" style="left:${toDom(o, pc.a) * z}px;width:${pc.d * z}px"></span>`).join('');
    const timed = (o.effects || []).filter(e => SB.effects.get(e.type) && SB.fx.timed(e)); // turned-off ones stay (dimmed) so they can be turned on again here
    // a group header: click it to fold its rows away (a folded group shows its keyframes on the header)
    const header = (key, title, lane) => { const shut = isFolded(o, key);
      return `<div${tintA} class="tl-row subh${tintC}${shut ? ' shut' : ''}" data-id="${o.id}" data-g="${esc(key)}"><div class="tl-head" style="padding-left:${Math.max(4, pad - 18)}px"><button class="caret${shut ? ' closed' : ''}" data-act="gfold" title="${shut ? 'Show' : 'Hide'} these rows">${SB.icon('down')}</button><span class="gt" data-act="gfold">${esc(title)}</span></div><div class="tl-lane" style="width:${Wd}px;--z:${z}px;--c:${col}">${lane || ''}</div></div>`; };
    if (timed.length) {
      const shut = isFolded(o, 'fx-timing');
      html += header('fx-timing', 'Effect timing', shut ? ghost + timed.map(e => { const [a, dd] = SB.fx.span(o, e); return `<span class="gspan${e.on === false ? ' off' : ''}" style="left:${ltX(o, a) * z}px;width:${Math.max(4, dd * z)}px"></span>`; }).join('') : '');
      if (!shut) for (const e of timed) { const [a, dd] = SB.fx.span(o, e), d = SB.effects.get(e.type), off = e.on === false;
        html += `<div class="tl-row sub${off ? ' off' : ''}" data-id="${o.id}" data-fx="${e.id}"><div class="tl-head" style="padding-left:${pad + 10}px" title="Double-click or ⚙: its settings. Right-click: turn ${off ? 'on' : 'off'}, delete"><button class="ib sm fxon${off ? '' : ' on'}" data-act="fxon" title="${off ? 'Turned off: click to turn it on' : 'On: click to turn it off'}">${SB.icon(off ? 'eyeOff' : 'eye')}</button><span class="pl">${esc(d.label)}</span><button class="ib sm" data-act="fxset" title="Settings: change how it looks and moves">${SB.icon('gear')}</button></div><div class="tl-lane" style="width:${Wd}px;--z:${z}px">${ghost}<div class="fxblk ${d.cat}${off ? ' off' : ''}" data-id="${o.id}" data-fx="${e.id}" style="left:${ltX(o, a) * z}px;width:${Math.max(6, dd * z)}px" title="${off ? 'Turned off. ' : ''}Drag to move, drag the ends to change the length. Double-click: settings"><span class="h l"></span><b>${U.r2(dd)}s</b><span class="h r"></span></div></div></div>`; }
    }
    for (const g of propGroups(o)) {
      const props = S.tlAnimOnly ? g.props.filter(p => TR.animated(o, p.id)) : g.props; if (!props.length) continue;
      const key = g.key || g.title, shut = isFolded(o, key);
      if (shut) { const ts = [...new Set(props.flatMap(p => (o.tracks[p.id] || []).map(k => k.t)))]; html += header(key, g.title, ghost + ts.map(t => `<span class="gk" style="left:${ltX(o, t) * z}px" title="Keyframe at ${U.r2(ltX(o, t))}s"></span>`).join('')); continue; }
      html += header(key, g.title, ghost);
      for (const p of props) {
        const tr = o.tracks[p.id] || [], ty = TR.type(p.id); let lane = ghost;
        tr.forEach((k, i) => {
          const x0 = ltX(o, k.t) * z, nx = tr[i + 1], x1 = (nx ? ltX(o, nx.t) : ltX(o, o.dur)) * z;
          if (ty === 'bool') { if (k.v) lane += `<span class="onspan" style="left:${x0}px;width:${Math.max(0, x1 - x0)}px"></span>`; }
          else if (nx) lane += `<span class="sbar${k.morph && p.id === 'frame' ? ' morph' : k.e === 'hold' || ty === 'int' ? ' hold' : ''}" style="left:${x0}px;width:${Math.max(0, x1 - x0)}px"${k.morph && p.id === 'frame' ? ' title="Morphs into the next frame"' : ''}></span>`;
          lane += `<span class="sk${k.e === 'hold' || (ty !== 'num' && ty !== 'color') ? ' hold' : k.e === 'spline' ? ' spline' : ''}${S.selKeys.has(k) ? ' ksel' : ''}" data-ki="${i}" style="left:${x0}px" title="${esc(p.label)} at ${U.r2(ltX(o, k.t))}s. Drag to move, right-click to change the ease."></span>`;
        });
        html += `<div${o.tlColor && o.tlTint !== false ? ` style="--rc:${o.tlColor}"` : ''} class="tl-row sub${o.tlColor && o.tlTint !== false ? ' tinted' : ''}" data-id="${o.id}" data-p="${esc(p.id)}"><div class="tl-head" style="padding-left:${pad}px"><button class="${kbClass(o, p.id)}" data-act="pkey" title="${TR.animated(o, p.id) ? 'Add or remove a keyframe here' : 'Animate this'}"></button><span class="pl">${esc(p.label)}</span>${valueInput(o, p.id)}</div><div class="tl-lane" style="width:${Wd}px;--z:${z}px;--c:${col}">${lane}</div></div>`;
      }
    }
    return html;
  }

  function render() {
    const p = S.project, z = S.zoom, H = HEAD(), len = tree.dom.length(), Wd = Math.max(Math.ceil(len * z) + 260, tl.clientWidth - H);
    let ticks = '';
    if (S.tlFrames) { // frame view: a tick per frame (when there is room) and frame numbers, the first frame is 1
      const fps = p.fps, pf = z / fps, lab = [1, 2, 5, 10, 20, 50, 100, 200, 500].find(n => n * pf >= 34) || 1000, mi = pf >= 5 ? 1 : Math.max(1, lab / 5);
      for (let f = 0; f <= Wd / pf; f += 1) { const maj = f === 0 || (f + 1) % lab === 0; if (!maj && f % mi && (f + 1) % mi) continue; ticks += `<span class="tick${maj ? ' maj' : ''}${f % fps === 0 ? ' sec' : ''}" style="left:${f * pf}px">${maj ? `<b>${f + 1}</b>` : ''}</span>`; }
    } else {
      const step = z >= 60 ? 1 : z >= 30 ? 2 : 5, minor = z >= 120 ? 0.25 : z >= 50 ? 0.5 : step;
      for (let t = 0; t <= Wd / z; t = U.r3(t + minor)) { const maj = Math.abs(t / step - Math.round(t / step)) < 1e-6; ticks += `<span class="tick${maj ? ' maj' : ''}" style="left:${t * z}px">${maj ? `<b>${t}s</b>` : ''}</span>`; }
    }
    const q = tree.ctx(), fs = focusSet(), kb = keyBox(H, z);
    let html = q ? `<div class="crumbs"><button class="btn sm" data-act="exit">${SB.icon('back')}<span>${tree.ancestors(q).find(a => a.seq) ? esc(tree.ancestors(q).find(a => a.seq).name) : 'Main timeline'}</span></button><span class="crumb-sep">›</span><b>${SB.icon('shot')} ${esc(q.name)}</b><span class="hint">Times here are inside the shot. It shows from ${U.r2(q.inPoint || 0)}s to ${U.r2((q.inPoint || 0) + q.dur)}s.</span><button class="btn sm ghost" data-act="fitshot" title="Make the shot as long as its layers">Fit shot</button></div>` : '';
    if (fs) { /* Big stage: just the rows */ }
    else if (S.solo) html += `<div class="solo-bar">Showing ${S.solo.size} layer${S.solo.size > 1 ? 's' : ''}. The stage still shows everything; the other layers are locked. <button class="btn sm" data-act="unsolo">Show all</button></div>`;
    if (S.focus && !fs) html += `<div class="solo-bar">Big stage: select a layer to see its timeline here.</div>`;
    html += `<div class="tl-row ruler"><div class="tl-head corner"><span class="nm">${q ? 'Layers in this shot' : 'Layers (top is front)'}</span><span class="head-grip" title="Drag to make the layer names wider or narrower (double-click: back to normal)"></span></div><div class="tl-lane ruler-lane" id="ruler" style="width:${Wd}px">${ticks}${rulerKeys(z)}${kb.handles}${onionBand(z)}${q ? '' : `<div class="endmark" style="left:${p.duration * z}px" title="End of the animation (${U.r2(p.duration)}s): drag to change the length, double-click to type it"></div>`}</div></div>`;
    const list = S.focus && !fs ? [] : rows();
    for (const [o, d, ctx] of list) {
      const sel = o.id === S.sel, msel = S.multi.has(o.id) && !sel, col = o.seq ? 'var(--c-shot)' : colorOf(o), m = SB.media.get(o.mediaId), g = o.type === 'group' && !o.seq, def = SB.types.get(o.type);
      const wave = (o.type === 'audio' || o.type === 'video') && m && m.wave && isFinite(m.duration), cyc = !wave && def.frames && o.frames.length > 1 && o.play === 'loop' ? (SB.frames.units(o) || o.frames.length) / o.fps * z : 0;
      const times = TR.times(o), cut = !!(o.parts && o.parts.length);
      /** One clip element per part (a cut clip has several, all on this row). */
      const clipHtml = (pc, inner) => {
        let style = `left:${toDom(o, pc.a) * z}px;width:${Math.max(4, pc.d * z)}px;--c:${col};`;
        if (wave) style += `background-image:url(${m.wave});background-size:${m.duration * z}px 100%;background-position:${-((o.inPoint || 0) + pc.off) * z}px 0;`;
        else if (cyc > 6) style += `background-image:repeating-linear-gradient(90deg,transparent 0,transparent ${cyc - 2}px,color-mix(in srgb,${col} 45%,transparent) ${cyc - 2}px,color-mix(in srgb,${col} 45%,transparent) ${cyc}px);background-position:${-(((o.phase || 0) + pc.off) * z) % cyc}px 0;`;
        const cw = Math.max(4, pc.d * z), inset = cw > 24 ? 6 : 0; // a key right at the clip's start or end sits just inside it, so it is whole and easy to grab
        const keys = times.filter(t => t >= pc.off - 1e-4 && t < pc.off + pc.d + 1e-4).map(t => `<span class="kf${TR.keysAt(o, t).some(([k]) => S.selKeys.has(k)) ? ' ksel' : ''}" data-kt="${t}" style="left:${U.clamp((t - pc.off) * z, inset, cw - inset)}px" title="Keyframes at ${U.r2(ltX(o, t))}s. Drag to move them."></span>`).join('');
        const psel = cut && S.selPart && S.selPart.id === o.id && S.selPart.i === pc.i;
        return `<div class="clip${g ? ' group' : ''}${o.seq ? ' shot' : ''}${sel ? ' sel' : ''}${msel ? ' msel' : ''}${o.hidden ? ' hid' : ''}${cut ? ' part' : ''}${psel ? ' psel' : ''}" data-id="${o.id}" data-part="${pc.i}" style="${style}"><span class="h l"${g && !cut ? ' title="Drag to cut the start of the group, or make it start earlier: layers reaching its start grow with it"' : ''}></span>${inner}${keys}${g && !cut && o.seq ? '' : `<span class="h r"${g && !cut ? ' title="Drag to make the group longer or shorter: layers reaching its end grow with it"' : ''}></span>`}</div>`;
      };
      const vis = o.type === 'audio' ? (o.hidden ? 'mute' : 'spk') : (o.hidden ? 'eyeOff' : 'eye');
      const visBtn = o.isMask ? `<button class="ib sm lead${o.maskVisible ? '' : ' on'}" data-act="maskvis" title="${o.maskVisible ? 'Mask shape visible (behind). Click to hide it' : 'Mask shape hidden. Click to show it behind the masked layers'}">${SB.icon(o.maskVisible ? 'eye' : 'eyeOff')}</button>` : `<button class="ib sm lead${o.hidden ? ' on' : ''}" data-act="vis" title="${o.type === 'audio' ? (o.hidden ? 'Unmute' : 'Mute') : (o.hidden ? 'Show' : 'Hide')}">${SB.icon(vis)}</button>`;
      const badge = o.seq ? `<span class="cl-badge">${o.children.length} layer${o.children.length === 1 ? '' : 's'}</span>${shotBars(o, z)}` : g ? `<span class="cl-badge">${o.children.length} layer${o.children.length > 1 ? 's' : ''}</span>` : def.frames && o.frames.length > 1 ? `<span class="cl-badge">${o.frames.length} frames</span>` : '';
      const extra = (o.kloop ? `<span class="cl-badge" title="Loop keyframes: they start again after the last one">↻ loop</span>` : '') + (o.isMask ? `<span class="cl-badge">mask · ${o.isMask === 'out' ? 'outside' : 'inside'}</span>` : '') + SB.timeline.extraBadges.map(f => f(o) || '').join('');
      const bad = SB.targets ? SB.targets.issues(o) : []; // things this screen's format can't carry: the row is marked red
      const tint = o.tlColor && o.tlTint !== false;
      html += `<div${tint ? ` style="--rc:${o.tlColor}"` : ''} class="tl-row${tint ? ' tinted' : ''}${sel ? ' sel' : ''}${msel ? ' msel' : ''}${o.hidden ? ' hid' : ''}${ctx ? ' ctx' : ''}${bad.length ? ' bad' : ''}" data-id="${o.id}"${bad.length ? ` title="${esc(`Can't go in ${SB.targets.short()}: ${bad.join(', ')}. Right-click › Remove what ${SB.targets.short()} can't show.`)}"` : ''}>
        <div class="tl-head" data-id="${o.id}">${visBtn}<button class="ib sm lead${o.locked ? ' on' : ''}" data-act="lock" title="${o.locked ? 'Unlock' : 'Lock'}">${SB.icon(o.locked ? 'lock' : 'unlock')}</button><span style="flex:0 1 ${d * 14}px;min-width:${Math.min(d, 1) * 3}px"></span><span class="chip" data-act="color" title="Layer color: click to change it" style="--c:${col}">${SB.icon(o.seq ? 'shot' : def.icon)}</span><span class="nm">${esc(o.name)}</span>${g ? `<button class="caret after${o.collapsed ? ' closed' : ''}" data-act="fold" title="${o.collapsed ? 'Show' : 'Hide'} the layers inside">${SB.icon('down')}</button>` : o.seq ? `<button class="caret after" data-act="open" title="Open the shot">${SB.icon('right')}</button>` : ''}<button class="ib sm${o.showProps ? ' on' : ''}" data-act="props" title="${o.showProps ? 'Hide' : 'Show'} animation rows" style="${TR.anyKeys(o) ? 'color:var(--brand)' : ''}">${SB.icon('rows')}</button></div>
        <div class="tl-lane" style="width:${Wd}px;--z:${z}px">${pieces(o).map((pc, n) => clipHtml(pc, `<span class="cl-name">${esc(o.name)}</span>${n === 0 ? badge + extra : ''}`)).join('')}</div></div>`;
      if (o.showProps) html += subRows(o, d, Wd, z);
    }
    if (!tree.rootList().length) html += `<div class="tl-empty">${q ? 'This shot is empty. Draw or add layers while it is open, and they go inside it.' : 'Everything you add gets a row here. Drag clips to move them in time, drag their ends to trim, right-click (or long-press) for more.'}</div>`;
    if (q) html += `<div class="endshade start" style="left:${H}px;width:${(q.inPoint || 0) * z}px" title="Trimmed off the start of the shot"></div><div class="endshade" style="left:${H + ((q.inPoint || 0) + q.dur) * z}px" title="End of the shot"></div>`;
    else html += `<div class="endshade" style="left:${H + p.duration * z}px" title="End of the animation"></div>`;
    html += kb.band;
    html += `<div id="playhead"></div>`;
    tl.classList.toggle('razor', cutMode());
    inner.innerHTML = html; inner.style.width = (H + Wd) + 'px'; inner.style.setProperty('--head', H + 'px');
    playhead();
    if (S.sel && S.sel !== lastSel) { const r = inner.querySelector(`.tl-row[data-id="${S.sel}"]`); if (r) { const t = r.offsetTop, b = t + r.offsetHeight; if (t < tl.scrollTop + 40 || b > tl.scrollTop + tl.clientHeight) tl.scrollTop = t - 30; } }
    lastSel = S.sel;
  }
  /** Keyframes in the ruler (like Unity's summary row): one diamond for each frame where any layer in the
      timeline has keyframes (layers inside groups and every animated value too). Drag it to move all the
      keyframes on that frame together; keys you line up on one frame share one diamond. */
  let rk = [];
  function rulerKeys(z) {
    rk = []; const solo = focusSet() || S.solo, objs = [];
    const base = solo ? (function f(l, out) { for (const o of l) { if (solo.has(o.id)) out.push(o); else if (o.children && !o.seq) f(o.children, out); } return out; })(tree.rootList(), []) : tree.rootList();
    (function w(l) { for (const o of l) { if (!objs.includes(o)) objs.push(o); if (o.children && !o.seq) w(o.children); } })(base);
    const at = new Map(), fps = S.project.fps || 24;
    for (const o of objs) for (const t of TR.times(o)) {
      if (t > o.dur + 1e-4 && !o.parts) continue; const X = ltX(o, t), key = Math.round(X * fps); // one diamond per frame
      let g = at.get(key); if (!g) at.set(key, g = { X, hit: [], o, t0: t, names: new Set() });
      TR.keysAt(o, t).forEach(([k, id]) => g.hit.push([k, { o, id }])); g.names.add(o.name);
    }
    let html = '';
    for (const g of at.values()) {
      if (!g.hit.length) continue; const i = rk.push(g) - 1, on = g.hit.some(([k]) => S.selKeys.has(k)), nm = [...g.names];
      const tip = `${g.hit.length} keyframe${g.hit.length > 1 ? 's' : ''} at ${S.tlFrames ? `frame ${Math.round(g.X * fps) + 1}` : `${U.r2(g.X)}s`} (${nm.slice(0, 3).join(', ')}${nm.length > 3 ? ` +${nm.length - 3}` : ''}). Drag to move them, click to go there.`;
      html += `<span class="rk${on ? ' ksel' : ''}" data-rk="${i}" style="left:${Math.max(6, g.X * z)}px" title="${esc(tip)}"></span>`;
    }
    return `<div class="rk-strip">${html}</div>`;
  }
  /** Little bars inside a shot clip showing its layers. */
  function shotBars(q, z) {
    const i0 = q.inPoint || 0, kids = q.children.slice(0, 6); if (!kids.length) return '';
    return `<span class="shotbars">${kids.map((c, i) => { const a = Math.max(c.start, i0), b = Math.min(c.start + c.dur, i0 + q.dur); return b > a ? `<i style="left:${(a - i0) * z}px;width:${(b - a) * z}px;bottom:${3 + i * 3}px;background:var(${SB.types.get(c.type).color})"></i>` : ''; }).join('')}</span>`;
  }
  /** Onion skin on the ruler: a band around the playhead as wide as the frames shown before and after; drag its ends. */
  const onionStep = o => o.play === 'library' ? 1 / (S.project.fps || 24) : 1 / (o.fps || 8);
  const onionLayer = () => { const o = tree.sel(); return S.onion && o && SB.types.get(o.type).frames && o.frames.length > 1 ? o : null; };
  function onionBand(z) {
    const o = onionLayer(); if (!o) return ''; const st = onionStep(o) * z, a = S.onionOpt.before * st, b = S.onionOpt.after * st;
    return `<i class="on-band" id="onBand" data-a="${a}" style="left:${tree.dom.now() * z - a}px;width:${a + b}px"><b class="on-h l" title="Onion skin: ${S.onionOpt.before} frame${S.onionOpt.before === 1 ? '' : 's'} before. Drag to show more or fewer"></b><b class="on-h r" title="Onion skin: ${S.onionOpt.after} frame${S.onionOpt.after === 1 ? '' : 's'} after. Drag to show more or fewer"></b></i>`;
  }
  function playhead(follow) {
    const ph = document.getElementById('playhead'), H = HEAD(), x = H + tree.dom.now() * S.zoom; if (ph) ph.style.left = x + 'px'; const ob = document.getElementById('onBand'); if (ob) ob.style.left = (tree.dom.now() * S.zoom - +ob.dataset.a) + 'px';
    if (follow) { const v0 = tl.scrollLeft + H, v1 = tl.scrollLeft + tl.clientWidth; if (x > v1 - 30 || x < v0) tl.scrollLeft = Math.max(0, x - H - 40); }
  }
  /** Refresh the small value boxes in open animation rows. */
  function liveValues() {
    inner.querySelectorAll('.tl-row.sub[data-p]').forEach(r => {
      const o = tree.find(r.dataset.id); if (!o) return; const id = r.dataset.p, el = r.querySelector('.pv'), b = r.querySelector('.kbtn');
      if (el && el !== document.activeElement) { const v = TR.now(o, id); if (el.type === 'checkbox') el.checked = !!v; else if (el.type === 'color') el.value = v; else if (el.tagName === 'SELECT') el.value = String(Math.round(v)); else el.value = U.r2(v * TR.uiMul(id)); }
      if (b) b.className = kbClass(o, id);
    });
  }

  /** Time under the pointer, on the timeline's clock. */
  const cutMode = () => S.tool === 'cut';
  /** Where the Cut tool would cut: on a frame, or on the playhead when close to it. */
  function cutT(e) { const fps = S.project.fps || 24, now = tree.dom.now(); let t = Math.round(tAt(e) * fps) / fps; if (Math.abs(tAt(e) - now) * S.zoom < 8) t = now; return t; }
  /** The line on the clip under the pointer showing where a click cuts. */
  function hoverCut(e) {
    let ln = inner.querySelector('#razorLine'); const clip = cutMode() && e && e.target.closest && e.target.closest('.clip');
    if (!clip) { if (ln) ln.hidden = true; return; }
    if (!ln) { ln = U.h('div', { id: 'razorLine' }); inner.appendChild(ln); }
    const ri = inner.getBoundingClientRect(), rc = clip.getBoundingClientRect(), x = HEAD() + cutT(e) * S.zoom;
    ln.hidden = x < rc.left - ri.left - 1 || x > rc.right - ri.left + 1; ln.style.left = x + 'px'; ln.style.top = (rc.top - ri.top - 3) + 'px'; ln.style.height = (rc.height + 6) + 'px';
  }
  const tAt = e => { const r = inner.getBoundingClientRect(); return Math.max(0, (e.clientX - r.left - HEAD()) / S.zoom); };
  /** The playhead snaps to a keyframe within a few pixels (S.keySnap, on by default; hold Alt to scrub freely). */
  function snapKey(t, e) {
    if (S.keySnap === false || (e && e.altKey)) return t; const thr = 7 / S.zoom; let best = null;
    for (const [o] of rows()) for (const lt of TR.times(o)) { const x = ltX(o, lt), d = Math.abs(x - t); if (d < thr && (!best || d < best.d)) best = { d, x }; }
    return best ? best.x : t;
  }
  const scrubTo = e => SB.time.set(tree.dom.toMain(snapKey(tAt(e), e)));
  function snap(t, ex) {
    const thr = 8 / S.zoom; let best = t, bd = thr; const c = [0, tree.dom.now(), tree.dom.length()];
    rows().forEach(([x]) => { pieces(x).forEach(pc => { if (x !== ex || (drag && drag.part !== pc.i)) c.push(toDom(x, pc.a), toDom(x, pc.a) + pc.d); }); });
    for (const v of c) { const d = Math.abs(v - t); if (d < bd) { bd = d; best = v; } }
    if (SB.time.locked()) { const q = SB.time.q(best); return { t: q, d: 0 }; } // whole frames only
    return { t: best, d: bd < thr ? bd : Infinity };
  }
  /** Shift+Alt-click a keyframe: select every keyframe between the last one clicked and this one
      (on the same row, the same layer, or across the layers in between). */
  let keyAnchor = null;
  function keyRange(hit, o, id) {
    const a = keyAnchor; if (!a || !tree.find(a.o.id)) return false;
    const x0 = ltX(a.o, a.t), x1 = ltX(o, hit[0][0].t), lo = Math.min(x0, x1) - 1e-4, hi = Math.max(x0, x1) + 1e-4, set = new Map(S.selKeys);
    let objs; if (a.o === o) objs = [o]; else { const list = rows().map(r => r[0]), i = list.indexOf(a.o), j = list.indexOf(o); objs = i < 0 || j < 0 ? [a.o, o] : list.slice(Math.min(i, j), Math.max(i, j) + 1); }
    for (const x of objs) for (const pid in x.tracks) { if (a.o === o && a.id && id && a.id === id && pid !== id) continue; x.tracks[pid].forEach(k => { const X = ltX(x, k.t); if (X >= lo && X <= hi) set.set(k, { o: x, id: pid }); }); }
    S.selKeys = set; return true;
  }
  /** The selected keyframes on the timeline clock: [{ k, o, X }]. */
  const selKeyTimes = () => [...S.selKeys].filter(([, v]) => tree.find(v.o.id)).map(([k, v]) => ({ k, o: v.o, X: ltX(v.o, k.t) }));
  /** With keyframes at two or more times selected, a box over them with handles: drag one to space them
      out or squeeze them together, keeping their spacing in proportion (like Unity's dopesheet). */
  /** The band around the selected keyframes, and its two handles. The handles sit in the ruler,
      which stays at the top while you scroll down, so they are always in reach. */
  function keyBox(H, z) {
    const list = selKeyTimes(); if (list.length < 2) return { band: '', handles: '' }; const X0 = Math.min(...list.map(x => x.X)), X1 = Math.max(...list.map(x => x.X)); if (X1 - X0 < 1e-3) return { band: '', handles: '' };
    const tip = 'Drag to stretch or squeeze the selected keyframes (their spacing keeps its proportions)';
    return { band: `<div class="kbox" style="left:${H + X0 * z}px;width:${(X1 - X0) * z}px"></div>`,
      handles: `<span class="kspan" style="left:${X0 * z}px;width:${(X1 - X0) * z}px"></span><span class="ksh l" data-side="l" style="left:${X0 * z}px" title="${tip}"></span><span class="ksh r" data-side="r" style="left:${X1 * z}px" title="${tip}"></span>`};
  }
  function scaleDrag(e, side) {
    const list = selKeyTimes(); if (list.length < 2) return null; const X0 = Math.min(...list.map(x => x.X)), X1 = Math.max(...list.map(x => x.X));
    return { kind: 'kscale', side, x0: e.clientX, anchor: side === 'l' ? X1 : X0, edge: side === 'l' ? X0 : X1, list: list.map(x => Object.assign(x, { t0: x.k.t })), moved: false };
  }
  function keyDrag(e, hit, o, t0) {
    // Shift (or Ctrl) adds a keyframe to the selection, or takes it out; Shift+Alt selects every keyframe between the last one clicked and this one
    if (e.shiftKey && e.altKey && keyRange(hit, o, hit.length === 1 ? hit[0][1].id : null)) { render(); return null; }
    keyAnchor = { o, t: hit[0][0].t, id: hit.length === 1 ? hit[0][1].id : null };
    const add = e.ctrlKey || e.metaKey || e.shiftKey, allSel = hit.every(([k]) => S.selKeys.has(k));
    let set = allSel && !add ? S.selKeys : new Map(add ? S.selKeys : []);
    if (add && allSel) { hit.forEach(([k]) => set.delete(k)); S.selKeys = set; render(); return null; }
    hit.forEach(([k, v]) => set.set(k, v)); S.selKeys = set;
    return { kind: 'keys', o, t0, x0: e.clientX, moved: false, list: [...set].map(([k, v]) => ({ k, o: v.o, t: k.t })) };
  }
  /** Put the layers (top to bottom) before or after t, or into group t, keeping their order. */
  function moveRows(list, t) {
    let after = t;
    list.forEach((o, k) => {
      if (t.mode === 'in') SB.xf.reparent(o, t.t, k);
      else if (t.mode === 'before') SB.xf.reparent(o, tree.parentOf(t.t), tree.listOf(t.t).indexOf(t.t));
      else { const at = after === t ? t.t : after; SB.xf.reparent(o, tree.parentOf(at), tree.listOf(at).indexOf(at) + 1); after = o; }
    });
    tree.select(list.map(o => o.id));
  }
  /** The selected layers dragged together: top to bottom, without layers whose group is selected too (the group brings them). */
  function movingRows() { const sel = tree.selected(); return tree.all().filter(x => sel.includes(x) && !tree.ancestors(x).some(a => sel.includes(a))); }
  function dropTarget(e, o, list) {
    const el = document.elementFromPoint(tl.getBoundingClientRect().left + 40, e.clientY), row = el && el.closest('.tl-row[data-id]:not(.sub):not(.subh)'); if (!row) return null;
    const t = tree.find(row.dataset.id); if (!t || (list || [o]).some(m => t === m || tree.isDesc(t, m))) return null;
    const r = row.getBoundingClientRect(), rel = (e.clientY - r.top) / r.height;
    return { row, t, mode: t.type === 'group' && rel > 0.28 && rel < 0.72 ? 'in' : rel < 0.5 ? 'before' : 'after' };
  }
  const clearMarks = () => inner.querySelectorAll('.drop-in,.drop-before,.drop-after').forEach(r => r.classList.remove('drop-in', 'drop-before', 'drop-after'));

  function down(e) {
    if (S.exporting || e.button > 0 || e.target.closest('[data-act],input,select,button')) return;
    const touch = e.pointerType === 'touch';
    if (e.target.closest('.head-grip')) { drag = { kind: 'headw', x0: e.clientX, w0: HEAD() }; inner.setPointerCapture(e.pointerId); return; }
    const ksh = e.target.closest('.ksh'); if (ksh) { drag = scaleDrag(e, ksh.dataset.side); if (drag) inner.setPointerCapture(e.pointerId); return; }
    const rkEl = e.target.closest('.rk'); if (rkEl && rk[+rkEl.dataset.rk]) { const g = rk[+rkEl.dataset.rk]; SB.time.pause(); drag = keyDrag(e, g.hit, g.o, g.t0); if (drag) inner.setPointerCapture(e.pointerId); return; }
    const onh = e.target.closest('.on-h'); if (onh) { drag = { kind: 'onion', side: onh.classList.contains('l') ? 'before' : 'after' }; inner.setPointerCapture(e.pointerId); return; }
    if (e.target.closest('.endmark')) { drag = { kind: 'end', x0: e.clientX, d0: S.project.duration }; inner.setPointerCapture(e.pointerId); return; }
    if (e.target.closest('#ruler')) { SB.time.pause(); scrubTo(e); drag = { kind: 'scrub' }; inner.setPointerCapture(e.pointerId); return; }
    const sub = e.target.closest('.tl-row.sub,.tl-row.subh'), fb = e.target.closest('.fxblk');
    if (fb) { const o = tree.find(fb.dataset.id), fx = o && o.effects.find(x => x.id === fb.dataset.fx); if (fx) { const [a0, d0] = SB.fx.span(o, fx); if (S.sel !== o.id) tree.select([o.id]); drag = { kind: 'fxblk', o, fx, el: fb, x0: e.clientX, a0, d0, mode: e.target.classList.contains('l') ? 'L' : e.target.classList.contains('r') ? 'R' : 'M', moved: false }; inner.setPointerCapture(e.pointerId); } return; }
    if (sub) {
      const o = tree.find(sub.dataset.id), sk = e.target.closest('.sk');
      if (sk && o) { const id = sub.dataset.p, k = o.tracks[id][+sk.dataset.ki]; drag = keyDrag(e, [[k, { o, id }]], o, k.t); inner.setPointerCapture(e.pointerId); return; }
      if (e.target.closest('.tl-lane') && !touch) { drag = boxStart(e); inner.setPointerCapture(e.pointerId); }
      return;
    }
    let kf = e.target.closest('.kf'); const clip = e.target.closest('.clip'), head = e.target.closest('.tl-head[data-id]'), mod = e.ctrlKey || e.metaKey;
    let edge = null; if (clip && !kf) { const cr = clip.getBoundingClientRect(), grp = clip.classList.contains('group'); edge = e.clientX - cr.left < 7 ? 'trimL' : cr.right - e.clientX < 7 && !(grp && clip.classList.contains('shot')) ? 'trimR' : null; } // on a key: the key (trim from the edge above it)
    if (S.picking && (clip || head)) { const o = tree.find((clip || head).dataset.id); if (o && !SB.picker.row(o)) SB.toast('That can’t be picked here. Pick one of the outlined things, or press Esc.'); return; }
    if (clip && cutMode()) { // the Cut tool: click a clip where it should be cut (where the line shows)
      const o = tree.find(clip.dataset.id); if (!o) return; const pt = tree.parentTime(o, tree.dom.toMain(cutT(e)));
      if (SB.ops.cutAt(o, pt)) { tree.select([o.id]); SB.commit(); } return;
    }
    if (clip) {
      const o = tree.find(clip.dataset.id); if (!o) return;
      if (e.shiftKey && !kf) return rangeSelect(o);
      if (mod && !kf) { anchor = o.id; return tree.toggle(o.id); }
      anchor = o.id; const part = +clip.dataset.part;
      if (o.id !== S.sel && !S.multi.has(o.id)) tree.select([o.id], { keepKeys: !!kf }); else if (o.id !== S.sel) { S.sel = o.id; SB.invalidate('inspector', 'frames'); }
      S.selPart = part >= 0 ? { id: o.id, i: part } : null; inner.querySelectorAll('.clip.psel').forEach(c => c.classList.remove('psel')); if (part >= 0) clip.classList.add('psel');
      const el = inner.querySelector(`.clip[data-id="${o.id}"][data-part="${part}"]`) || clip;
      if (kf) { const t0 = +kf.dataset.kt; drag = keyDrag(e, TR.keysAt(o, t0).map(([k, id]) => [k, { o, id }]), o, t0); inner.setPointerCapture(e.pointerId); return; }
      const mode = edge || (e.target.classList.contains('l') ? 'trimL' : e.target.classList.contains('r') ? 'trimR' : 'move');
      drag = { kind: 'clip', mode, o, el, part, x0: e.clientX, orig: U.deep(o), moved: false, descs: part < 0 && o.children && !o.seq ? sameClock(o).map(c => [c, c.start, U.deep(c.parts || null)]) : null };
      if (mode === 'move' && part < 0 && S.multi.size > 1 && S.multi.has(o.id)) { const sel = tree.selected(); drag.others = sel.filter(x => x !== o && !tree.isDesc(x, o)).map(x => ({ x, st: x.start, parts: U.deep(x.parts || null), descs: x.children && !x.seq ? sameClock(x).map(c => [c, c.start, U.deep(c.parts || null)]) : null })); }
      inner.setPointerCapture(e.pointerId); return;
    }
    if (head) { const o = tree.find(head.dataset.id); if (!o) return; if (e.shiftKey) return rangeSelect(o); if (mod) { anchor = o.id; return tree.toggle(o.id); } anchor = o.id; const group = S.multi.size > 1 && S.multi.has(o.id) ? movingRows() : null; drag = { kind: 'row', o, y0: e.clientY, moved: false, row: head.parentElement, list: group, rows: group ? group.map(x => inner.querySelector(`.tl-row[data-id="${x.id}"]:not(.sub):not(.subh)`)).filter(Boolean) : null }; inner.setPointerCapture(e.pointerId); return; }
    if ((e.target.closest('.tl-lane') || e.target === inner || e.target.closest('.tl-empty')) && !touch) { drag = boxStart(e); inner.setPointerCapture(e.pointerId); }
  }
  // ---------- selection box: drag in empty timeline space to select every keyframe inside (Shift / Ctrl adds)
  function boxStart(e) { const ir = inner.getBoundingClientRect(); return { kind: 'box', ix: e.clientX - ir.left, iy: e.clientY - ir.top, x0: e.clientX, y0: e.clientY, add: e.shiftKey || e.ctrlKey || e.metaKey, before: new Map(S.selKeys), moved: false, el: null, e0: e }; }
  /** Keyframes (as [key, { o, id }]) whose diamonds sit inside the screen rectangle r. */
  function keysIn(r) {
    const out = new Map(), hit = el => { const b = el.getBoundingClientRect(), cx = b.left + b.width / 2, cy = b.top + b.height / 2; return cx >= r.l && cx <= r.r && cy >= r.t && cy <= r.b; };
    inner.querySelectorAll('.clip .kf').forEach(el => { if (!hit(el)) return; const o = tree.find(el.closest('.clip').dataset.id); if (o) TR.keysAt(o, +el.dataset.kt).forEach(([k, id]) => out.set(k, { o, id })); });
    inner.querySelectorAll('.tl-row.sub .sk').forEach(el => { if (!hit(el)) return; const row = el.closest('.tl-row.sub'), o = tree.find(row.dataset.id), tr = o && o.tracks[row.dataset.p], k = tr && tr[+el.dataset.ki]; if (k) out.set(k, { o, id: row.dataset.p }); });
    return out;
  }
  function boxMove(d, e) {
    if (!d.moved && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 5) return; d.moved = true;
    const tr = tl.getBoundingClientRect(); if (e.clientY > tr.bottom - 20) tl.scrollTop += 10; else if (e.clientY < tr.top + 34) tl.scrollTop -= 10; // scroll while dragging near the edges
    const ir = inner.getBoundingClientRect(); d.x0 = ir.left + d.ix; d.y0 = ir.top + d.iy; // the start stays put in the timeline while it scrolls
    const r = { l: Math.min(d.x0, e.clientX), r: Math.max(d.x0, e.clientX), t: Math.min(d.y0, e.clientY), b: Math.max(d.y0, e.clientY) };
    if (!d.el) { d.el = U.h('div.tl-marquee'); inner.appendChild(d.el); }
    Object.assign(d.el.style, { left: r.l - ir.left + 'px', top: r.t - ir.top + 'px', width: r.r - r.l + 'px', height: r.b - r.t + 'px' });
    const sel = keysIn(r); if (d.add) d.before.forEach((v, k) => sel.set(k, v)); d.sel = sel;
    inner.querySelectorAll('.tl-row.sub .sk').forEach(el => { const row = el.closest('.tl-row.sub'), o = tree.find(row.dataset.id), tr = o && o.tracks[row.dataset.p], k = tr && tr[+el.dataset.ki]; el.classList.toggle('ksel', !!k && sel.has(k)); });
    inner.querySelectorAll('.clip .kf').forEach(el => { const o = tree.find(el.closest('.clip').dataset.id); el.classList.toggle('ksel', !!o && TR.keysAt(o, +el.dataset.kt).some(([k]) => sel.has(k))); });
  }
  function boxEnd(d, e) {
    if (d.el) d.el.remove();
    if (!d.moved) { SB.time.pause(); scrubTo(d.e0); S.selPart = null; if (S.selKeys.size && !d.add) { S.selKeys.clear(); render(); } return; } // a click: move the playhead there
    S.selKeys = d.sel || new Map(); const objs = [...new Set([...S.selKeys.values()].map(v => v.o))];
    if (objs.length && !objs.some(o => o.id === S.sel)) tree.select(objs.map(o => o.id), { keepKeys: true });
    render(); if (S.selKeys.size) SB.toast(`${S.selKeys.size} keyframe${S.selKeys.size > 1 ? 's' : ''} selected. Drag one to move them all, or the handles at the top to space them.`);
  }
  function move(e) {
    if (!drag) return hoverCut(e); const z = S.zoom;
    if (drag.kind === 'scrub') return scrubTo(e);
    if (drag.kind === 'onion') { const o = onionLayer(); if (!o) return; const n = U.clamp(Math.round(Math.abs(tAt(e) - tree.dom.now()) / onionStep(o)), 0, 10); if (S.onionOpt[drag.side] !== n) { S.onionOpt[drag.side] = n; const ob = document.getElementById('onBand'); if (ob) ob.outerHTML = onionBand(S.zoom); SB.dirty(); } return; }
    if (drag.kind === 'end') { if (!drag.moved && Math.abs(e.clientX - drag.x0) < 3) return; drag.moved = true; const p = S.project, f = p.fps || 24; p.duration = U.clamp(Math.round(snapKey(tAt(e), e) * f) / f, 0.5, 600); p.fixedLen = true; render(); SB.invalidate('transport'); return; }
    if (drag.kind === 'headw') { S.tlHead = Object.assign({}, S.tlHead, { [SB.layout.current]: Math.round(drag.w0 + e.clientX - drag.x0) }); return render(); }
    if (drag.kind === 'box') return boxMove(drag, e);
    if (drag.kind === 'fxblk') {
      const { o, fx, a0, d0 } = drag, dd = (e.clientX - drag.x0) / z, cat = SB.effects.get(fx.type).cat, D = o.dur; if (Math.abs(e.clientX - drag.x0) > 2) drag.moved = true; if (!drag.moved) return;
      let na = a0, nd = d0;
      if (drag.mode === 'M') na = U.clamp(a0 + dd, 0, Math.max(0, D - d0)); else if (drag.mode === 'L') { na = U.clamp(a0 + dd, 0, a0 + d0 - 0.05); nd = d0 - (na - a0); } else nd = U.clamp(d0 + dd, 0.05, Math.max(0.05, D - a0));
      const setD = v => { if (fx.type === 'typewriter') fx.speed = U.r2(((o.text || '').length + 1) / (16 * v)); else fx.dur = U.r2(v); };
      if (cat === 'in') { fx.at = U.r2(na); setD(nd); } else if (cat === 'out') { fx.gap = U.r2(Math.max(0, D - na - nd)); setD(nd); } else { fx.at = U.r2(na); fx.len = U.r2(nd); }
      drag.el.style.left = (o.start + na) * z + 'px'; drag.el.style.width = Math.max(6, nd * z) + 'px'; const lb = drag.el.querySelector('b'); if (lb) lb.textContent = U.r2(nd) + 's';
      return SB.bump();
    }
    if (drag.kind === 'kscale') {
      const d = (e.clientX - drag.x0) / z; if (Math.abs(e.clientX - drag.x0) > 2) drag.moved = true; if (!drag.moved) return;
      const span0 = drag.edge - drag.anchor, span1 = (drag.edge + d) - drag.anchor, f = Math.abs(span0) < 1e-6 ? 1 : Math.max(0.02, span1 / span0);
      drag.list.forEach(x => { const X = drag.anchor + (x.X - drag.anchor) * f; x.k.t = U.r3(Math.max(0, SB.time.qLocal(x.o, x.t0 + X - x.X))); if (x.k.t > x.o.dur && !x.o.parts && x.o.type !== 'video' && x.o.type !== 'audio') x.o.dur = x.k.t; }); // the clip grows to keep stretched keys
      SB.bump(); return SB.invalidate('timeline');
    }
    if (drag.kind === 'keys') {
      let d = (e.clientX - drag.x0) / z; if (Math.abs(e.clientX - drag.x0) > 2) drag.moved = true; if (!drag.moved) return;
      const thr = 6 / z, cands = [tree.rawLocal(drag.o)]; for (const id in drag.o.tracks) drag.o.tracks[id].forEach(k => { if (!drag.list.some(x => x.k === k)) cands.push(k.t); });
      let t = drag.t0 + d; for (const v of cands) if (Math.abs(v - t) < thr) { t = v; break; } t = SB.time.qLocal(drag.o, t); d = t - drag.t0;
      drag.list.forEach(x => x.k.t = U.r3(U.clamp(x.t + d, 0, x.o.dur)));
      SB.bump(); tree.goLocal(drag.o, U.clamp(drag.t0 + d, 0, drag.o.dur)); return SB.invalidate('timeline');
    }
    if (drag.kind === 'row') {
      const dy = e.clientY - drag.y0; if (Math.abs(dy) > 5) drag.moved = true;
      const tr = tl.getBoundingClientRect(); if (e.clientY > tr.bottom - 24) tl.scrollTop += 12; else if (e.clientY < tr.top + 40) tl.scrollTop -= 12; // scroll while dragging near the edges
      if (drag.moved) { (drag.rows || [drag.row]).forEach(r => { r.classList.add('dragging'); r.style.transform = `translateY(${dy}px)`; r.style.position = 'relative'; r.style.zIndex = 8; }); clearMarks(); const t = dropTarget(e, drag.o, drag.list); if (t) t.row.classList.add('drop-' + t.mode); }
      return;
    }
    if (drag.kind !== 'clip') return;
    const { o, orig } = drag, d = (e.clientX - drag.x0) / z; if (Math.abs(e.clientX - drag.x0) > 2) drag.moved = true; if (!drag.moved) return;
    if (drag.part >= 0) return movePart(drag, d, z);
    if (drag.mode === 'move') {
      let s = Math.max(0, orig.start + d); const a = snap(s, o), b = snap(s + o.dur, o);
      if (a.d <= b.d && a.d !== Infinity) s = a.t; else if (b.d !== Infinity) s = b.t - o.dur;
      if (drag.others) { const lo = Math.min(...drag.others.map(q => q.st)); s = Math.max(s, orig.start - lo); }
      s = U.r3(Math.max(0, s)); const delta = s - orig.start; o.start = s;
      const shiftDescs = list => (list || []).forEach(([c, st, ps]) => { c.start = U.r3(Math.max(0, st + delta)); if (ps) c.parts = ps.map(p => Object.assign({}, p, { a: U.r3(p.a + delta) })); });
      (drag.others || []).forEach(q => { q.x.start = U.r3(Math.max(0, q.st + delta)); if (q.parts) q.x.parts = q.parts.map(p => Object.assign({}, p, { a: U.r3(p.a + delta) })); shiftDescs(q.descs); });
      shiftDescs(drag.descs);
      if (drag.descs || drag.others) { SB.bump(); SB.invalidate('timeline'); return SB.media.sync(false, true); }
    } else if (drag.mode === 'trimR') {
      const m = SB.media.get(o.mediaId), max = (o.type === 'video' || o.type === 'audio') && m && isFinite(m.duration) ? m.duration - (o.inPoint || 0) : 3600;
      o.dur = U.r3(U.clamp(snap(orig.start + orig.dur + d, o).t - o.start, 0.1, max));
      if (o.type === 'group' && !o.seq) { stretchKids(o, orig); SB.bump(); SB.invalidate('timeline'); return SB.media.sync(false, true); }
    } else {
      let delta = snap(Math.max(0, orig.start + d), o).t - orig.start;
      delta = U.clamp(delta, -orig.start, orig.dur - 0.1); if (orig.inPoint != null) delta = Math.max(delta, -(orig.inPoint || 0));
      o.start = U.r3(orig.start + delta); o.dur = U.r3(orig.dur - delta); if (orig.inPoint != null) o.inPoint = U.r3((orig.inPoint || 0) + delta);
      o.tracks = U.deep(orig.tracks); TR.shift(o, -delta); o.phase = (orig.phase || 0) + delta;
      if (o.type === 'group' && !o.seq) stretchKidsL(o, orig);
      // redraw the whole row while trimming the start: its keyframes, frames and sound stay put in time and the cut-off start disappears
      SB.bump(); SB.invalidate('timeline'); return SB.media.sync(false, true);
    }
    drag.el.style.left = o.start * z + 'px'; drag.el.style.width = Math.max(4, o.dur * z) + 'px'; SB.bump(); SB.media.sync(false, true);
  }
  /** A group's end dragged later: the layers inside that reached its old end grow with it. Dragged earlier,
      they keep their length (the group just shows less of them). Shots have their own clock and are left alone. */
  function stretchKids(g, orig) {
    const end0 = orig.start + orig.dur, end1 = g.start + g.dur, live = new Map(sameClock(g).map(c => [c.id, c]));
    (function walk(list) { for (const c0 of list || []) { const c = live.get(c0.id); if (!c) continue;
      if (!(c0.parts && c0.parts.length) && c0.start + c0.dur >= end0 - 1e-3) c.dur = U.r3(Math.max(c0.dur, end1 - c.start));
      if (c0.children && !c0.seq) walk(c0.children); } })(orig.children);
    trimFlag(g);
  }
  const trimFlag = g => { const s = Math.min(...g.children.map(c => c.start)), e = Math.max(...g.children.map(c => c.start + c.dur)); if (g.start > s + 1e-3 || g.start + g.dur < e - 1e-3) g.trim = true; else delete g.trim; };
  /** A group's start dragged earlier: the layers inside that began at its old start begin earlier too (their keys stay put in time).
      Dragged later: they keep their start and the group just hides the beginning. */
  function stretchKidsL(g, orig) {
    const s0 = orig.start, live = new Map(sameClock(g).map(c => [c.id, c]));
    (function walk(list) { for (const c0 of list || []) { const c = live.get(c0.id); if (!c) continue;
      if (!(c0.parts && c0.parts.length) && c0.start <= s0 + 1e-3 && g.start < c0.start) { const dl = g.start - c0.start, ip = c0.inPoint; if (ip == null || ip + dl >= 0) {
        c.start = U.r3(g.start); c.dur = U.r3(c0.dur - dl); c.tracks = U.deep(c0.tracks); TR.shift(c, -dl); c.phase = (c0.phase || 0) + dl; if (ip != null) c.inPoint = U.r3(ip + dl); } }
      else if (c0.start <= s0 + 1e-3) { c.start = c0.start; c.dur = c0.dur; c.tracks = U.deep(c0.tracks); c.phase = c0.phase; if (c0.inPoint != null) c.inPoint = c0.inPoint; }
      if (c0.children && !c0.seq) walk(c0.children); } })(orig.children);
    trimFlag(g);
  }
  /** Drag one part of a cut clip: move it, or trim its ends (the rest of the clip stays where it is). */
  function movePart(dr, d, z) {
    const { o, orig } = dr, P = o.parts[dr.part], P0 = orig.parts[dr.part]; if (!P) return;
    const m = SB.media.get(o.mediaId), media = (o.type === 'video' || o.type === 'audio') && m && isFinite(m.duration) ? m.duration - (o.inPoint || 0) : Infinity, grp = o.type === 'group' && !o.seq;
    if (dr.mode === 'move') { let a = Math.max(0, P0.a + d); const s1 = snap(a, o), s2 = snap(a + P0.d, o); if (s1.d <= s2.d && s1.d !== Infinity) a = s1.t; else if (s2.d !== Infinity) a = s2.t - P0.d; P.a = U.r3(Math.max(0, a)); }
    else if (dr.mode === 'trimL') { const dl = U.clamp(snap(P0.a + d, o).t - P0.a, -P0.off, P0.d - 0.1); P.a = U.r3(P0.a + dl); P.off = U.r3(P0.off + dl); P.d = U.r3(P0.d - dl); }
    else { const max = Math.min(media - P0.off, grp ? o.dur - P0.off : Infinity); P.d = U.r3(U.clamp(snap(P0.a + P0.d + d, o).t - P0.a, 0.1, max)); if (P.off + P.d > o.dur) o.dur = U.r3(P.off + P.d); }
    if (dr.mode === 'trimL') { SB.bump(); SB.invalidate('timeline'); return SB.media.sync(false, true); } // the keys inside the part must stay put in time
    dr.el.style.left = toDom(o, P.a) * z + 'px'; dr.el.style.width = Math.max(4, P.d * z) + 'px'; if (dr.el.style.backgroundImage && m) dr.el.style.backgroundPosition = `${-((o.inPoint || 0) + P.off) * z}px 0`;
    SB.bump(); SB.media.sync(false, true);
  }
  /** Shift-click: select every row between the last clicked one and this one. */
  let anchor = null;
  function rangeSelect(o) {
    const list = rows().map(r => r[0]), a = list.findIndex(x => x.id === anchor), b = list.indexOf(o);
    if (a < 0 || b < 0) { anchor = o.id; return tree.toggle(o.id); }
    const ids = list.slice(Math.min(a, b), Math.max(a, b) + 1).map(x => x.id).filter(id => id !== o.id); tree.select([...ids, o.id]);
  }
  function up(e) {
    if (!drag) return; const d = drag; drag = null;
    if (d.kind === 'headw') { const now = performance.now(); if (Math.abs(e.clientX - d.x0) < 2 && now - (lastGrip || 0) < 400) { if (S.tlHead) delete S.tlHead[SB.layout.current]; render(); } lastGrip = now; return SB.prefs.save(); }
    if (d.kind === 'onion') { SB.prefs.save(); SB.toast(`Onion skin: ${S.onionOpt.before} before, ${S.onionOpt.after} after.`); return; }
    if (d.kind === 'fxblk') { if (d.moved) { SB.commit(); return; } const now = performance.now(); if (lastFx && lastFx.id === d.fx.id && now - lastFx.t < 400) { lastFx = null; return SB.fx.settings(d.o, d.fx, { x: e.clientX, y: e.clientY + 8 }); } lastFx = { id: d.fx.id, t: now }; return; }
    if (d.kind === 'end') { if (d.moved) { if (S.time > S.project.duration) SB.time.set(S.project.duration); SB.commit(); SB.toast(`The animation is ${U.r2(S.project.duration)}s long now.`); return; }
      const now = performance.now(); if (now - (lastEnd || 0) < 450) { lastEnd = 0; SB.dialog.prompt('Length of the animation', 'In seconds. Layers longer than this keep their keyframes; the animation just ends here.', String(U.r2(S.project.duration))).then(v => { const n = parseFloat(v); if (!(n > 0)) return; S.project.duration = U.clamp(n, 0.5, 600); S.project.fixedLen = true; SB.commit(); SB.invalidate(); }); } else lastEnd = now; return; }
    if (d.kind === 'box') return boxEnd(d, e);
    if (d.kind === 'kscale') { if (d.moved) { new Set(d.list.map(x => x.o)).forEach(TR.tidy); SB.commit(); } return; }
    if (d.kind === 'keys') { if (!d.moved) { tree.goLocal(d.o, d.t0 + 0.0001); return render(); } new Set(d.list.map(x => x.o)).forEach(TR.tidy); return SB.commit(); }
    if (d.kind === 'row') {
      (d.rows || [d.row]).forEach(r => { r.classList.remove('dragging'); r.style.transform = ''; r.style.position = ''; r.style.zIndex = ''; });
      if (d.moved) { const t = dropTarget(e, d.o, d.list); clearMarks(); if (t) { moveRows(d.list || [d.o], t); SB.commit(); } else render(); return; }
      const now = performance.now();
      if (lastHead.id === d.o.id && now - lastHead.t < 380 && d.o.id === S.sel) { lastHead = { id: null, t: 0 }; return d.o.seq && !e.target.closest('.nm') ? tree.enter(d.o) : rename(d.o); }
      lastHead = { id: d.o.id, t: now }; if (d.o.id !== S.sel || S.multi.size > 1) tree.select([d.o.id]); return;
    }
    if (d.kind === 'clip' && d.moved) return SB.commit();
    if (d.kind === 'clip') { // double-click a clip: open a shot, fold a group (done here because the row redraws between clicks)
      const now = performance.now(); if (lastClip.id === d.o.id && now - lastClip.t < 400) { lastClip = { id: null, t: 0 }; if (d.o.seq) return tree.enter(d.o); if (d.o.type === 'group') { d.o.collapsed = !d.o.collapsed; return SB.commit(); } if (d.o.type === 'text') return SB.textEdit.start(d.o); return; }
      lastClip = { id: d.o.id, t: now };
    }
  }
  function rename(o) {
    const nm = inner.querySelector(`.tl-row[data-id="${o.id}"]:not(.sub):not(.subh) .nm`); if (!nm) return;
    nm.contentEditable = 'true'; nm.focus(); const r = document.createRange(); r.selectNodeContents(nm); const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    const done = ok => { nm.removeEventListener('blur', onBlur); nm.removeEventListener('keydown', onKey); if (ok) { o.name = nm.textContent.trim().slice(0, 60) || o.name; SB.commit(); } else render(); };
    const onBlur = () => done(true), onKey = ev => { ev.stopPropagation(); if (ev.key === 'Enter') { ev.preventDefault(); nm.blur(); } if (ev.key === 'Escape') { nm.removeEventListener('blur', onBlur); done(false); } };
    nm.addEventListener('blur', onBlur); nm.addEventListener('keydown', onKey);
  }
  function applyValue(o, id, el, final) {
    const ty = TR.type(id); let v;
    if (el.type === 'checkbox') v = el.checked; else if (ty === 'color') v = el.value; else if (ty === 'int') v = Math.round(+el.value); else { v = parseFloat(el.value); if (isNaN(v)) return; v /= TR.uiMul(id); }
    if (id === 'scale') v = Math.max(0.01, v); if (id === 'opacity') v = U.clamp(v, 0, 1);
    if (id === 'ax' || id === 'ay') { const tr = TR.transform(o, tree.localTime(o)); SB.xf.setOrigin(o, id === 'ax' ? v : tr.ax, id === 'ay' ? v : tr.ay); } else TR.set(o, id, v);
    if (final) SB.commit(); else SB.bump();
  }

  SB.timeline = {
    colorPick, colorOf,
    extraGroups: [], extraBadges: [], // stage 2 adds rows (bones, physics) and badges through these
    init() {
      tl = U.$('#tl'); inner = U.$('#tlInner');
      inner.addEventListener('pointerdown', down); inner.addEventListener('pointermove', move); inner.addEventListener('pointerup', up); inner.addEventListener('pointerleave', () => hoverCut(null));
      inner.addEventListener('pointercancel', () => { if (drag && drag.kind === 'row') { drag = null; clearMarks(); render(); } else drag = null; });
      inner.addEventListener('click', e => {
        const b = e.target.closest('[data-act]'); if (!b) return;
        if (b.dataset.act === 'unsolo') { S.solo = null; SB.invalidate(); return render(); }
        if (b.dataset.act === 'unfocus') return SB.layout.focus(false);
        if (b.dataset.act === 'exit') return tree.exit();
        if (b.dataset.act === 'fitshot') return SB.ops.fitShot(tree.ctx());
        const row = b.closest('.tl-row'), o = row && tree.find(row.dataset.id); if (!o) return;
        const items = S.multi.has(o.id) ? tree.selected() : [o];
        if (b.dataset.act === 'color') return colorPick(items, b);
        if (b.dataset.act === 'gfold') { const k = o.id + '|' + row.dataset.g; if (e.altKey) { const all = [...inner.querySelectorAll(`.tl-row.subh[data-id="${o.id}"]`)].map(r => o.id + '|' + r.dataset.g), shut = !folds.has(k); all.forEach(x => shut ? folds.add(x) : folds.delete(x)); } else if (folds.has(k)) folds.delete(k); else folds.add(k); return render(); }
        if (b.dataset.act === 'fxon' || b.dataset.act === 'fxset') { const fx = (o.effects || []).find(x => x.id === row.dataset.fx); if (!fx) return; return b.dataset.act === 'fxon' ? SB.fx.setOn(o, fx, fx.on === false) : SB.fx.settings(o, fx, b); }
        if (SB.timeline.acts && SB.timeline.acts[b.dataset.act]) return SB.timeline.acts[b.dataset.act](o, b);
        if (b.dataset.act === 'vis') SB.ops.setHidden(items, !o.hidden);
        if (b.dataset.act === 'lock') SB.ops.setLocked(items, !o.locked);
        if (b.dataset.act === 'fold') { o.collapsed = !o.collapsed; SB.commit(); }
        if (b.dataset.act === 'open') tree.enter(o);
        if (b.dataset.act === 'maskvis') SB.masks.setVisible(o, !o.maskVisible);
        if (b.dataset.act === 'props') { o.showProps = !o.showProps; SB.commit(); }
        if (b.dataset.act === 'pkey') { TR.toggleKey(o, row.dataset.p); SB.commit(); }
      });
      inner.addEventListener('input', e => { const el = e.target.closest('.pv'); if (!el || el.tagName === 'SELECT' || el.type !== 'number') return; const r = el.closest('.tl-row.sub'), o = r && tree.find(r.dataset.id); if (o) applyValue(o, r.dataset.p, el, false); });
      inner.addEventListener('change', e => { const el = e.target.closest('.pv'); if (!el) return; const r = el.closest('.tl-row.sub'), o = r && tree.find(r.dataset.id); if (o) applyValue(o, r.dataset.p, el, true); });
      inner.addEventListener('contextmenu', e => { e.preventDefault(); SB.menus.timeline(e); });
      tl.addEventListener('wheel', e => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); SB.timeline.zoom(S.zoom * (e.deltaY < 0 ? 1.15 : 0.87)); } }, { passive: false });
      // long-press on touch opens the row menu
      let lp = 0; inner.addEventListener('pointerdown', e => { if (e.pointerType !== 'touch') return; const x = e.clientX, y = e.clientY; clearTimeout(lp); lp = setTimeout(() => { drag = null; SB.menus.timeline({ target: e.target, clientX: x, clientY: y, preventDefault() {} }); }, 550); const cancel = ev => { if (ev.type !== 'pointermove' || Math.hypot(ev.clientX - x, ev.clientY - y) > 8) { clearTimeout(lp); inner.removeEventListener('pointermove', cancel); inner.removeEventListener('pointerup', cancel); } }; inner.addEventListener('pointermove', cancel); inner.addEventListener('pointerup', cancel); });
    },
    /** The Cut tool: while on, clicking a clip cuts it there. */
    razor(v = !cutMode()) { SB.tool.set(v ? 'cut' : 'select'); },
    /** fromSlider: the zoom slider is being dragged, so leave it alone (rebuilding it would drop the drag). */
    zoom(z, fromSlider) { S.zoom = U.clamp(Math.round(z), 20, 320); render(); const sl = document.getElementById('tlZoom'); if (sl && !fromSlider) sl.value = S.zoom; },
    toggleAllRows() { const an = tree.all().filter(TR.anyKeys); if (!an.length) return SB.toast('Nothing is animated yet.'); const open = an.some(o => !o.showProps); an.forEach(o => { o.showProps = open; if (open) tree.ancestors(o).forEach(a => a.collapsed = false); }); SB.commit(); },
    rename, propGroups, liveValues,
  };
  SB.panel('timeline', () => render());
  SB.on('time', () => { playhead(false); liveValues(); }); // the view stays put while playing (no jumps); scroll to follow the playhead yourself
})(window.SB);
