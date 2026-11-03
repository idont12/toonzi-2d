/* Interactive web page export: one HTML file that plays the project with this app's own engine (everything you
   see in Preview works: rules, screens and transitions, rigs, controllers, effects, morphs), without the editor
   around it. The app's scripts and styles are copied into the page with the project and its pictures, and the
   page starts in player mode (window.SB_PLAYER, read by js/io/project.js and js/app.js). */
'use strict';
(function (SB) {
  const U = SB.util, S = SB.state;
  const SKELETON = "<div id=\"app\" class=\"app\" data-layout=\"desktop\"><header class=\"top\"><span class=\"logo\" aria-hidden=\"true\"><svg viewBox=\"0 0 24 24\"><rect x=\"3\" y=\"5\" width=\"18\" height=\"14\" rx=\"2.5\"/><path d=\"M8 5v14M16 5v14M3 10h5M3 14h5M16 10h5M16 14h5\"/></svg></span><input class=\"proj-name\" id=\"projName\" aria-label=\"Project name\" value=\"Untitled animation\"><div class=\"grp\" id=\"topLeft\"></div><div class=\"spacer\"></div><div class=\"grp\" id=\"topRight\"></div></header><nav class=\"rail\" id=\"rail\" aria-label=\"Tools\"></nav><main class=\"stage-area\" id=\"stageWrap\"><div id=\"stageDoc\" class=\"stage-doc\" aria-hidden=\"true\"></div><canvas id=\"stage\" aria-label=\"Stage\"></canvas><canvas id=\"ovl\" aria-hidden=\"true\"></canvas><div class=\"ctxbar\" id=\"ctxbar\"></div><div class=\"zoombadge\" id=\"zoomBadge\" aria-label=\"Stage zoom\"><button data-z=\"out\" title=\"Zoom out\">\u2212</button><span id=\"zoomPct\">100%</span><button data-z=\"in\" title=\"Zoom in\">+</button><button data-z=\"fit\" title=\"Fit to screen\">Fit</button></div><div class=\"empty\" id=\"empty\" hidden></div><button class=\"focusmenu\" id=\"focusMenu\" type=\"button\" title=\"Menu\" aria-label=\"Menu\"></button></main><aside class=\"inspector\" id=\"inspector\" aria-label=\"Properties\"></aside><section class=\"dock\" id=\"dock\"><div class=\"dock-grip\" id=\"dockGrip\" title=\"Drag to resize\"></div><div class=\"transport\" id=\"transport\"></div><div class=\"dock-tabs\" id=\"dockTabs\" role=\"tablist\"></div><div class=\"dock-body\" id=\"dockBody\"><div class=\"framesbar\" id=\"framesBar\"></div><div class=\"tl\" id=\"tl\"><div class=\"tl-inner\" id=\"tlInner\"></div></div><div class=\"dock-props\" id=\"dockProps\"></div><div class=\"ixpanel\" id=\"ixPanel\" hidden></div></div></section><div class=\"toast\" id=\"toast\" role=\"status\" aria-live=\"polite\"></div></div>";
  /** A file of this app as text (scripts and styles are served next to the page). */
  const read = url => new Promise((res, rej) => { const x = new XMLHttpRequest(); x.open('GET', url); x.onload = () => (x.status === 200 || x.status === 0) && x.responseText ? res(x.responseText) : rej(new Error(`Couldn't read ${url}`)); x.onerror = () => rej(new Error(`Couldn't read ${url}`)); x.send(); });
  async function build(opt = {}) {
    const prog = opt.prog || (() => {}); prog(0.1, 'Packing the project…');
    const used = SB.media.used(), media = [];
    for (const id of used) { const m = SB.media.get(id); if (m) media.push({ id, kind: m.kind, name: m.name, data: await U.blobToDataURL(m.blob) }); }
    const d = JSON.parse(SB.snapshot()), data = { project: d.p, objects: d.o, screens: d.s, doc: d.d, media, bg: opt.bg };
    prog(0.4, 'Copying the player…');
    const srcs = [...document.querySelectorAll('script[src]')].map(x => x.getAttribute('src')).filter(x => !/vendor\/|^examples\/|^tutorials\/(lessons|my-tutorials)\//.test(x)); /* the app only: not loaded examples or tutorial lessons */
    const css = await Promise.all([...document.querySelectorAll('link[rel=stylesheet][href]')].map(l => l.getAttribute('href')).filter(h => !/^https?:/.test(h)).map(read));
    const code = []; for (const s of srcs) code.push(`// ${s}\n` + await read(s));
    const esc = t => t.replace(/<\/(script|style)/gi, '<\\/$1'), title = U.esc(opt.title || S.project.name);
    const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><title>${title}</title>
<style>${esc(css.join('\n'))}
${PLAYER_CSS}</style></head>
<body class="sb-player">${SKELETON}<div class="modal" id="modal" hidden></div><div id="avpool" aria-hidden="true"></div>
<script>window.SB_PLAYER = ${esc(JSON.stringify(data))};</script>
<script>${esc(code.join('\n;\n'))}</script>
</body></html>`;
    prog(0.95, 'Done'); return { html, size: html.length };
  }
  // the player: only the stage, filling the window
  const PLAYER_CSS = `.app.player { --top: 0px; --rail: 0px; --insp: 0px; --dock-h: 0px; --mini-h: 0px; grid-template-columns: minmax(0,1fr) !important; grid-template-rows: minmax(0,1fr) !important; grid-template-areas: "stage" !important; }
.app.player .top, .app.player .rail, .app.player .inspector, .app.player .dock, .app.player .ctxbar, .app.player .zoombadge, .app.player .focusmenu, .app.player .empty, .app.player .stage-modes, .app.player .toast, .app.player #ovl { display: none !important; }
.app.player .stage-area { grid-area: stage; background: var(--player-bg, #111); } body.sb-player { margin: 0; overflow: hidden; }`;
  SB.webpage = { build };
})(window.SB);
