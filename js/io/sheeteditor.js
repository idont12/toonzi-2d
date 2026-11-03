/* Sprite sheet editor: Export › Sprite sheet › Arrange frames…
   The layout of a screen's sheet is kept in the project (S.doc.sheets[key]), so the next export puts every frame in the same cell:
   { fps, order: [frame…], del: [frame…], names: { frame: name }, tags: [{ name, frames: [frame…] }], dedupe, cols, pad }
   Frames are numbered at the export frame rate (frame i is at i / fps); a layout made at another rate is mapped by time.
   New frames (a longer animation) go after the others, so the cells already there don't move.
   SB.sheetEditor.plan(job, o, n) → { order, names, tags, dedupe, cols, pad } for js/io/export.js, or null (no layout: every frame in order). */
'use strict';
(function (SB) {
  const U = SB.util, S = SB.state, h = U.h, W = SB.w;
  const keyOf = job => job.id || job.name;
  const get = job => (S.doc.sheets || {})[keyOf(job)] || null;
  /** The layout mapped to the export's frame rate and length. */
  function plan(job, o, n) {
    const L = get(job); if (!L) return null; const r = o.fps / (L.fps || o.fps), map = i => Math.round(i * r), del = new Set((L.del || []).map(map)), seen = new Set(), order = [];
    for (const i of (L.order || []).map(map)) if (i < n && !del.has(i) && !seen.has(i)) { seen.add(i); order.push(i); }
    for (let i = 0; i < n; i++) if (!seen.has(i) && !del.has(i)) order.push(i); // frames the layout doesn't know yet: at the end
    const names = {}; for (const k in L.names || {}) names[map(+k)] = L.names[k];
    return { order, names, tags: (L.tags || []).map(t => ({ name: t.name, frames: t.frames.map(map).filter(i => i < n && !del.has(i)) })), dedupe: !!L.dedupe, cols: L.cols || 0, pad: L.pad || 0 };
  }
  /** A quick fingerprint of a frame's pixels (same picture → same text). */
  function hash(cv) { const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let a = 2166136261, b = 0; for (let i = 0; i < d.length; i += 4) { a = Math.imul(a ^ (d[i] | d[i + 1] << 8 | d[i + 2] << 16 | d[i + 3] << 24), 16777619); b = (b + a) | 0; } return (a >>> 0).toString(36) + (b >>> 0).toString(36); }

  async function open(job, o) { let closed; const whenClosed = new Promise(r => { closed = r; });
    const n = Math.max(1, Math.round(job.duration * o.fps)), tw = 120, th = Math.max(20, Math.round(tw * job.h / job.w));
    const L0 = get(job), L = L0 ? U.deep(L0) : {}; L.fps = o.fps; const p0 = plan(job, o, n) || { order: [...Array(n).keys()], names: {}, tags: [], dedupe: false, cols: 0, pad: 0 };
    let order = p0.order.slice(), del = new Set([...Array(n).keys()].filter(i => !order.includes(i))), names = Object.assign({}, p0.names), tags = p0.tags, dedupe = p0.dedupe, cols = p0.cols, pad = p0.pad, picked = new Set(), anchor = null;
    const thumbs = [], hashes = [], grid = h('div.sse-grid'), bar = h('div.sse-bar'), info = h('p.hint.sse-info');
    const dlg = SB.dialog.sheet([h('h2', null, 'Arrange the sprite sheet'), h('p.sub', null, 'Drag frames to change their place, click to pick (Shift: a run, Ctrl: one more). The layout is saved with the project, so the next export puts every frame in the same cell.'), bar, grid, info,
      h('div.sheet-actions', null, W.btn('Reset', () => { order = [...Array(n).keys()]; del.clear(); names = {}; tags = []; dedupe = false; cols = 0; pad = 0; picked.clear(); draw(); }, { cls: 'ghost' }), W.btn('Cancel', () => dlg.close(), { cls: 'ghost' }),
        W.btn('Save layout', () => { S.doc.sheets = S.doc.sheets || {}; S.doc.sheets[keyOf(job)] = { fps: o.fps, order, del: [...del], names, tags, dedupe, cols, pad }; SB.commit(); dlg.close(); SB.toast('Sprite sheet layout saved. Export uses it.'); }, { cls: 'primary' }))], { size: 'wide', onClose: () => closed() });
    grid.replaceChildren(h('p.hint', null, 'Drawing the frames…'));
    for (let i = 0; i < n; i++) { const cv = h('canvas', { width: tw, height: th }), x = cv.getContext('2d', { willReadFrequently: true }); await job.draw(x, i / o.fps, tw / job.w, !!o.transparent); thumbs.push(cv); hashes.push(hash(cv)); if (i % 6 === 5) await new Promise(r => setTimeout(r)); }
    const firstOf = i => { const k = order.find(j => hashes[j] === hashes[i]); return k === i ? null : k; }; // the first frame in the order that looks the same
    function draw() {
      const dupes = dedupe ? order.filter(i => firstOf(i) != null).length : 0, cells = order.length - dupes;
      bar.replaceChildren(
        W.row('Columns', W.num(cols, { min: 0, max: 200, step: 1, label: 'Columns (0: automatic)', change: v => { cols = Math.max(0, Math.round(+v || 0)); draw(); } }), h('span.hint', null, '0: automatic')),
        W.row('Padding', W.num(pad, { min: 0, max: 64, step: 1, label: 'Space between cells (px)', change: v => { pad = Math.max(0, Math.round(+v || 0)); } }), h('span.hint', null, 'px between cells')),
        W.row('', W.check(dedupe, 'Remove duplicate frames (they share one cell)', v => { dedupe = v; draw(); })),
        h('div.row.btns', null, W.btn(`Delete ${picked.size || ''} picked`.replace('  ', ' '), () => { picked.forEach(i => { del.add(i); order = order.filter(j => j !== i); }); picked.clear(); draw(); }, { cls: 'sm', icon: 'trash' }),
          W.btn('Name as animation…', async () => { if (!picked.size) return SB.toast('Pick the frames of the animation first.'); const nm = await SB.dialog.prompt('Animation name', 'The JSON file lists these frames under this name (walk, jump…).', ''); if (!nm) return; tags = tags.filter(t => t.name !== nm).concat({ name: nm.trim(), frames: order.filter(i => picked.has(i)) }); draw(); }, { cls: 'sm', icon: 'plus' }),
          del.size ? W.btn(`Bring back ${del.size} deleted`, () => { order = order.concat([...del].sort((a, b) => a - b)); del.clear(); draw(); }, { cls: 'sm ghost' }) : null,
          W.btn('Move picked to the start', () => { const p = order.filter(i => picked.has(i)); order = p.concat(order.filter(i => !picked.has(i))); draw(); }, { cls: 'sm ghost' })),
        tags.length ? h('div.sse-tags', null, h('span.hint', null, 'Animations:'), ...tags.map(t => h('span.ctl-chip', null, h('button', { type: 'button', title: 'Pick its frames', onclick: () => { picked = new Set(t.frames); draw(); } }, `${t.name} (${t.frames.length})`), W.iconBtn('x', 'Remove this animation name', () => { tags = tags.filter(x => x !== t); draw(); }, 'sm')))) : null);
      grid.replaceChildren(...order.map((i, pos) => {
        const dup = dedupe ? firstOf(i) : null, nm = names[i];
        const cell = h('div.sse-cell' + (picked.has(i) ? '.on' : '') + (dup != null ? '.dup' : ''), { draggable: 'true', title: `Frame ${i + 1} (${U.r2(i / o.fps)}s)` + (dup != null ? ` — the same as frame ${dup + 1}, shares its cell` : '') + '. Double-click to name it' },
          thumbs[i], h('span.sse-n', null, nm || String(i + 1)), dup != null ? h('span.sse-dup', null, `= ${dup + 1}`) : null,
          W.iconBtn('x', 'Delete this frame from the sheet', e => { e.stopPropagation(); del.add(i); order = order.filter(j => j !== i); picked.delete(i); draw(); }, 'sm'));
        cell.onclick = e => { if (e.shiftKey && anchor != null) { const a = order.indexOf(anchor), b = pos; for (let k = Math.min(a, b); k <= Math.max(a, b); k++) picked.add(order[k]); } else if (e.ctrlKey || e.metaKey) { if (picked.has(i)) picked.delete(i); else picked.add(i); anchor = i; } else { picked = new Set([i]); anchor = i; } draw(); };
        cell.ondblclick = async () => { const v = await SB.dialog.prompt('Frame name', 'Its name in the JSON file (empty: the automatic name).', nm || ''); if (v == null) return; if (v.trim()) names[i] = v.trim(); else delete names[i]; draw(); };
        cell.ondragstart = e => { e.dataTransfer.setData('text/plain', String(i)); e.dataTransfer.effectAllowed = 'move'; };
        cell.ondragover = e => { e.preventDefault(); cell.classList.add('drop'); }; cell.ondragleave = () => cell.classList.remove('drop');
        cell.ondrop = e => { e.preventDefault(); const from = +e.dataTransfer.getData('text/plain'); if (from === i) return; const moving = picked.has(from) ? order.filter(j => picked.has(j)) : [from], rest = order.filter(j => !moving.includes(j)), at = rest.indexOf(i); order = rest.slice(0, at).concat(moving, rest.slice(at)); draw(); };
        return cell;
      }));
      info.textContent = `${order.length} frame${order.length === 1 ? '' : 's'} in ${cells} cell${cells === 1 ? '' : 's'}${dupes ? ` (${dupes} duplicate${dupes === 1 ? '' : 's'} share a cell)` : ''}${del.size ? `, ${del.size} deleted` : ''}.`;
    }
    draw(); return whenClosed;
  }
  SB.sheetEditor = { open, plan, hash, has: job => !!get(job) };
})(window.SB);
