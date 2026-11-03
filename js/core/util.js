/* Small helpers used everywhere: math, colors, DOM, blobs, noise.
   Everything hangs off the global SB namespace so the app runs from a
   double-clicked index.html (no modules, no server, no build step). */
'use strict';
window.SB = window.SB || {};
(function (SB) {
  const U = SB.util = {};

  // ---- numbers
  U.uid = () => Math.random().toString(36).slice(2, 10);
  U.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  U.lerp = (a, b, k) => a + (b - a) * k;
  U.r1 = v => Math.round(v * 10) / 10;
  U.r2 = v => Math.round(v * 100) / 100;
  U.r3 = v => Math.round(v * 1000) / 1000;
  U.sleep = ms => new Promise(r => setTimeout(r, ms));
  U.fmtTime = t => { t = Math.max(0, t); const m = Math.floor(t / 60), s = t - m * 60; return m + ':' + s.toFixed(2).padStart(5, '0'); };
  U.slug = s => (s || 'storyboard').trim().replace(/[^\w\- ]+/g, '').replace(/\s+/g, '-').toLowerCase() || 'storyboard';

  /** Deep copy that drops runtime-only keys (keys starting with "_"). */
  U.deep = o => JSON.parse(JSON.stringify(o, (k, v) => k[0] === '_' ? undefined : v));

  // ---- deterministic noise for shake, boil, wobble
  U.hash = n => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return (s - Math.floor(s)) * 2 - 1; };
  U.noise = (t, seed) => { const i = Math.floor(t), f = t - i, u = f * f * (3 - 2 * f); return U.lerp(U.hash(i + seed * 57.3), U.hash(i + 1 + seed * 57.3), u); };
  U.seedOf = id => { let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 9973; return h; };
  U.catmull = (p0, p1, p2, p3, u) => { const u2 = u * u, u3 = u2 * u; return 0.5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 + (-p0 + 3 * p1 - 3 * p2 + p3) * u3); };

  // ---- 2D geometry
  U.pt = (x, y) => new DOMPoint(x, y);
  U.emptyBox = () => ({ x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity });
  U.growBox = (b, x, y) => { if (x < b.x0) b.x0 = x; if (y < b.y0) b.y0 = y; if (x > b.x1) b.x1 = x; if (y > b.y1) b.y1 = y; return b; };
  U.boxOk = b => b && isFinite(b.x0);
  U.distSeg2 = (px, py, ax, ay, bx, by) => { const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy; let u = L ? ((px - ax) * dx + (py - ay) * dy) / L : 0; u = U.clamp(u, 0, 1); const qx = ax + dx * u - px, qy = ay + dy * u - py; return qx * qx + qy * qy; };
  U.matScale = M => Math.sqrt(Math.abs(M.a * M.d - M.b * M.c)) || 1;
  U.matAngle = M => Math.atan2(M.b, M.a) * 180 / Math.PI;
  U.scaleM = s => new DOMMatrix([s, 0, 0, s, 0, 0]);

  // ---- colors
  U.hexRgba = (h, a) => `rgba(${U.hexRgb(h).join(',')},${a})`;
  U.hexRgb = h => { h = String(h || '#000').replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); const n = parseInt(h.slice(0, 6), 16) || 0; return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  U.rgbHex = (r, g, b) => '#' + [r, g, b].map(v => U.clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
  U.lerpColor = (a, b, u) => { const A = U.hexRgb(a), B = U.hexRgb(b); return U.rgbHex(...A.map((v, i) => U.lerp(v, B[i], u))); };
  /** Any CSS color (rgb(), names, hex) to #rrggbb, or null for none/transparent. */
  U.cssToHex = c => {
    if (!c || c === 'none' || c === 'transparent') return null;
    if (/^#[0-9a-f]{3,8}$/i.test(c)) return c.length === 4 ? '#' + c.slice(1).split('').map(x => x + x).join('') : c.slice(0, 7);
    const m = /rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:[ ,/]+([\d.]+))?/.exec(c);
    if (m) { if (m[4] !== undefined && +m[4] === 0) return null; return U.rgbHex(+m[1], +m[2], +m[3]); }
    const cx = document.createElement('canvas').getContext('2d'); cx.fillStyle = '#000'; cx.fillStyle = c; return /^#/.test(cx.fillStyle) ? cx.fillStyle : U.cssToHex(cx.fillStyle);
  };

  // ---- DOM
  U.$ = (s, root = document) => root.querySelector(s);
  U.$$ = (s, root = document) => [...root.querySelectorAll(s)];
  U.esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  /** Tiny element builder: h('button.btn.sm', {onclick}, 'Label') */
  U.h = (tag, attrs, ...kids) => {
    const [t, ...cls] = tag.split('.'); const el = document.createElement(t || 'div'); if (cls.length) el.className = cls.join(' ');
    for (const k in attrs || {}) { const v = attrs[k]; if (v == null || v === false) continue; if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else if (k === 'html') el.innerHTML = v; else if (k === 'style' && typeof v === 'object') { for (const sk in v) if (sk.startsWith('--')) el.style.setProperty(sk, v[sk]); else el.style[sk] = v[sk]; } else if (k === 'dataset') Object.assign(el.dataset, v); else el.setAttribute(k, v === true ? '' : v); }
    for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(c));
    return el;
  };
  U.cssVar = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

  // ---- blobs
  U.blobToDataURL = b => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(b); });
  U.dataURLToBlob = d => { const [h, b] = d.split(','); const mime = (h.match(/data:([^;]+)/) || [])[1] || 'application/octet-stream'; const bin = atob(b); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new Blob([u], { type: mime }); };
  U.canvasBlob = cv => new Promise(res => cv.toBlob(res, 'image/png'));
  U.blobBytes = async b => new Uint8Array(await b.arrayBuffer());

  /** Reusable offscreen canvases keyed by size and purpose. */
  const pool = {};
  U.poolCtx = (w, h, key) => { const k = w + 'x' + h + key; if (!pool[k]) { const c = document.createElement('canvas'); c.width = w; c.height = h; pool[k] = c.getContext('2d', { willReadFrequently: key.startsWith('read') }); } return pool[k]; };
  U.measureCtx = document.createElement('canvas').getContext('2d');

  /** Read alpha of a drawing callback into a 0/1 mask. */
  U.maskOf = (W, H, draw) => { const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const c = cv.getContext('2d', { willReadFrequently: true }); draw(c); const d = c.getImageData(0, 0, W, H).data, m = new Uint8Array(W * H); for (let i = 0; i < W * H; i++) m[i] = d[i * 4 + 3] > 127 ? 1 : 0; return m; };
})(window.SB);
