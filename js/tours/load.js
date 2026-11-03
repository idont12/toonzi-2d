/* Loads the tutorials listed in tutorials/config.js ("files"), in order, then shows them in the gallery.
   While the page loads they come in as plain scripts (this works when index.html is opened from disk too). */
'use strict';
(function (SB) {
  const cfg = window.SB_TUTORIALS || {}, base = (cfg.base || 'tutorials/').replace(/\/?$/, '/'), files = (cfg.files || []).map(f => base + f);
  if (window.SB_PLAYER) return; // an exported web page: no tutorials
  const done = () => { if (SB.tours.maker) SB.tours.maker.register(); };
  if (document.readyState === 'loading') { files.forEach(f => document.write(`<script src="${f}"><\/script>`)); document.write('<script>SB.tours.maker && SB.tours.maker.register();<\/script>'); }
  else { const next = i => { if (i >= files.length) return done(); const s = document.createElement('script'); s.src = files[i]; s.onload = s.onerror = () => next(i + 1); document.head.appendChild(s); }; next(0); }
})(window.SB);
