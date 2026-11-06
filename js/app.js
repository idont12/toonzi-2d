/* Start-up: wire the panels, restore the autosaved project and preferences, start drawing. */
'use strict';
(async function (SB) {
  const S = SB.state;
  SB.view.init();
  SB.timeline.init();
  SB.shell.init();
  SB.tool.set('select');
  await SB.project.init();
  const linked = !SB.player && await SB.project.openLink(); // a project from a link (AGENTS.md): open it, skip the start dialogs
  SB.tree.reindex();
  SB.resetHistory();
  SB.layout.apply();
  SB.invalidate();
  if (document.fonts) Promise.all(['500 40px Lexend', '700 40px Lexend', '700 40px Caveat', '400 40px Bangers'].map(f => document.fonts.load(f).catch(() => {}))).then(() => { SB.bump(); SB.invalidate('frames'); });
  SB.startLoop();
  SB.ready = true;
  if (SB.bridge && !SB.player) SB.bridge.start(); // a page around the editor, or a Claude artifact's database (js/io/bridge.js)
  // the first visit: the welcome (style and theme), then the tutorials (skip them: the start dialog); later: the start dialog when the project is empty
  const ask = () => { if (SB.targets && !S.objects.length && !SB.screens.many()) SB.targets.ask(null, { start: true }); };
  const learn = () => SB.tours && SB.tours.list.length ? SB.tours.open({ first: true, onSkip: ask }) : ask();
  if (!SB.player && !linked && !(SB.bridge && SB.bridge.embedded) && !/nostart|embed/.test(location.search)) { if (!S.welcomed && SB.welcome) SB.welcome.open(learn); else ask(); }
  if (SB.player) { // the exported web page: only the stage, playing the interactions
    const app = document.getElementById('app'); app.classList.add('player'); S.focus = false; SB.view.reset();
    if (S.project.bg) app.style.setProperty('--player-bg', '#111');
    requestAnimationFrame(() => { SB.view.fit(); if (SB.ix) SB.ix.play(); else { S.loop = true; SB.time.play(); } });
    addEventListener('resize', () => SB.view.fit());
  }
})(window.SB);
