/* Context menus (with submenus), popovers and dialogs.
   Menu items: { label, icon, kbd, run, disabled, cls (an extra class), sub: [items] } | '-' | { head: 'Title' } */
'use strict';
(function (SB) {
  const U = SB.util, h = U.h;
  const levels = [];
  const clean = items => { const out = []; items.filter(Boolean).forEach(it => { if (typeof it === "object" && it.sub) { it.sub = clean(it.sub); if (!it.sub.length) return; } if (it === '-' && (!out.length || out[out.length - 1] === '-')) return; out.push(it); }); while (out[out.length - 1] === '-') out.pop(); return out; };
  function el(level) { if (!levels[level]) { const m = h('div.menu', { role: 'menu', hidden: true }); document.body.appendChild(m); levels[level] = m; } return levels[level]; }
  function open(x, y, items, level = 0, anchor) {
    const m = el(level), list = clean(items);
    for (let l = level + 1; l < levels.length; l++) levels[l].hidden = true;
    m.innerHTML = ''; m._items = list;
    list.forEach((it, i) => {
      if (it === '-') return m.appendChild(h('hr'));
      if (it.head) return m.appendChild(h('div.mh', null, it.head));
      const b = h('button' + (it.cls ? '.' + it.cls : ''), { type: 'button', role: 'menuitem', disabled: !!it.disabled, html: `<span class="mi">${it.icon ? SB.icon(it.icon) : ''}<span>${U.esc(it.label)}</span></span>${it.sub ? '<kbd>›</kbd>' : it.kbd ? `<kbd>${U.esc(it.kbd)}</kbd>` : ''}` });
      b.onclick = () => { if (it.sub) return open(0, 0, it.sub, level + 1, b); const path = SB.macros && it.run ? SB.macros.pathOf(b) : null; close(); if (path && SB.macros.rec) SB.macros.note({ m: path }); if (it.run) it.run(); if (path) reveal(path[0]); };
      b.onpointerenter = e => { if (e.pointerType !== 'mouse') return; if (it.sub && !it.disabled) open(0, 0, it.sub, level + 1, b); else { for (let l = level + 1; l < levels.length; l++) levels[l].hidden = true; m.querySelectorAll('.sub-open').forEach(x => x.classList.remove('sub-open')); } };
      m.appendChild(b);
    });
    m.hidden = false; const r = m.getBoundingClientRect(), vw = innerWidth, vh = innerHeight;
    if (anchor) { anchor.parentElement.querySelectorAll('.sub-open').forEach(x => x.classList.remove('sub-open')); anchor.classList.add('sub-open'); const a = anchor.getBoundingClientRect(); let lx = a.right + 2; if (lx + r.width > vw - 8) lx = Math.max(8, a.left - r.width - 2); m.style.left = lx + 'px'; m.style.top = U.clamp(a.top - 5, 8, vh - r.height - 8) + 'px'; }
    else { SB.menu.lastXY = [x, y]; m.style.left = U.clamp(x, 8, vw - r.width - 8) + 'px'; m.style.top = U.clamp(y, 8, vh - r.height - 8) + 'px'; const f = m.querySelector('button:not(:disabled)'); if (f) f.focus({ preventScroll: true }); }
  }
  function close() { levels.forEach(m => m.hidden = true); }
  /** Added an effect, a controller, a rig or physics from a menu: the side panel (if open) shows that section. */
  const REVEAL = { Effects: ['fx'], Transitions: ['trans'], Controller: ['controls', 'ctrl'], Rig: ['bind', 'rig', 'rigc'], Physics: ['physics', 'physc'], Mask: ['mask', 'maskc'] };
  const reveal = top => { const k = REVEAL[top]; if (k && SB.fields && SB.fields.reveal) SB.fields.reveal(k); };
  const isOpen = () => levels.some(m => !m.hidden);
  document.addEventListener('pointerdown', e => { if (isOpen() && !e.target.closest('.menu')) close(); }, true);
  document.addEventListener('keydown', e => {
    if (!isOpen()) return; const m = levels.filter(x => !x.hidden).pop(), bs = [...m.querySelectorAll('button:not(:disabled)')], i = bs.indexOf(document.activeElement);
    if (e.key === 'Escape') { close(); e.stopPropagation(); } else if (e.key === 'ArrowDown') { e.preventDefault(); bs[(i + 1) % bs.length].focus(); } else if (e.key === 'ArrowUp') { e.preventDefault(); bs[(i - 1 + bs.length) % bs.length].focus(); }
    else if (e.key === 'ArrowRight' && document.activeElement) document.activeElement.click();
  }, true);
  SB.menu = { open, close, isOpen };

  /** Popover anchored to a button. content: element. */
  let pop = null;
  SB.popover = (anchor, content, opt = {}) => {
    SB.popover.close();
    pop = h('div.pop' + (opt.cls ? '.' + opt.cls : ''), null, content); document.body.appendChild(pop);
    const a = anchor.getBoundingClientRect(), r = pop.getBoundingClientRect(), vw = innerWidth, vh = innerHeight; let x, y;
    if (opt.side === 'right' && a.right + r.width + 8 < vw) { x = a.right + 8; y = a.top; } else { x = a.left; y = a.bottom + 6; if (y + r.height > vh - 8) y = a.top - r.height - 6; }
    pop.style.left = U.clamp(x, 8, vw - r.width - 8) + 'px'; pop.style.top = U.clamp(y, 8, vh - r.height - 8) + 'px'; pop._anchor = anchor; pop._onClose = opt.onClose;
    return pop;
  };
  SB.popover.close = () => { if (pop) { const p0 = pop; pop.remove(); pop = null; if (p0._onClose) p0._onClose(); } };
  /** A popover at a screen point (for things opened from a menu). */
  SB.popover.at = (x, y, content, opt) => { const a = h('div', { style: { position: 'fixed', left: x + 'px', top: y + 'px', width: '1px', height: '1px' } }); document.body.appendChild(a); const p = SB.popover(a, content, opt); setTimeout(() => a.remove(), 0); return p; };
  document.addEventListener('pointerdown', e => { if (pop && !e.target.closest('.pop,.menu') && !(pop._anchor && pop._anchor.contains(e.target))) SB.popover.close(); }, true);

  // ---------- dialogs
  const modal = () => U.$('#modal');
  const D = SB.dialog = {
    /** Show a sheet. Returns { el, close }. */
    sheet(content, opt = {}) {
      const m = modal(), prev = !m.hidden && m.childNodes.length ? { nodes: [...m.childNodes], onclick: m.onclick, close: m._close } : null; // a dialog opened from a dialog sits on top; closing it brings the one below back
      m.replaceChildren(); const sheet = h('div.sheet' + (opt.size ? '.' + opt.size : ''), { role: 'dialog', 'aria-modal': 'true' }, content);
      m.appendChild(sheet); m.hidden = false; let done = false;
      const close = () => { if (done) return; done = true; if (prev && sheet.isConnected) { m.replaceChildren(...prev.nodes); m.onclick = prev.onclick; m._close = prev.close; } else if (sheet.isConnected) { m.hidden = true; m.innerHTML = ''; m.onclick = null; m._close = null; } opt.onClose && opt.onClose(); };
      m.onclick = e => { if (e.target === m && !opt.sticky) close(); }; m._close = opt.sticky ? null : close;
      setTimeout(() => { const f = sheet.querySelector('[autofocus],.primary,input,button'); if (f) f.focus(); }, 30);
      return { el: sheet, close };
    },
    isOpen: () => !modal().hidden,
    closeTop() { const m = modal(); if (!m.hidden && m._close) { m._close(); return true; } return false; },
    /** Ask with buttons. Resolves with the chosen value or null. */
    ask(title, body, buttons) {
      return new Promise(res => {
        let done = false; const fin = v => { if (done) return; done = true; s.close(); res(v); };
        const s = D.sheet([h('h2', null, title), h('p.sub', null, body), h('div.sheet-actions', null, [{ v: null, label: 'Cancel' }, ...buttons].map((b, i) => h('button.btn' + (b.primary ? '.primary' : b.danger ? '.danger' : i === 0 ? '.ghost' : ''), { type: 'button', onclick: () => fin(b.v) }, b.label)))], { onClose: () => fin(null) });
      });
    },
    prompt(title, body, value) {
      return new Promise(res => {
        let done = false; const inp = h('input', { type: 'text', value: value || '', autofocus: true });
        const fin = v => { if (done) return; done = true; s.close(); res(v); };
        inp.onkeydown = e => { if (e.key === 'Enter') fin(inp.value); };
        const s = D.sheet([h('h2', null, title), h('p.sub', null, body), inp, h('div.sheet-actions', null, h('button.btn.ghost', { type: 'button', onclick: () => fin(null) }, 'Cancel'), h('button.btn.primary', { type: 'button', onclick: () => fin(inp.value) }, 'OK'))], { onClose: () => fin(null) });
      });
    },
  };
})(window.SB);
