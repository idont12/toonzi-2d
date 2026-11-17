/* Panel sections for js/io/audioscan.js:
   - "Move with sound" on a controller: which sound, which part of it (bass, melody, highs, volume), from where to where,
     how strong, how smooth, how loud it must be → Make keyframes (again after a change: it replaces its own keys).
   - "Lip sync" on a drawing with frames, or on a controller with points (a toggle or a frame switch): a mouth shape for
     each frame or point, the voice, Detail (how closely it follows the sound) → Make lip sync keyframes. */
'use strict';
(function (SB) {
  const U = SB.util, S = SB.state, tree = SB.tree, h = U.h, W = SB.w, FL = SB.fields, A = () => SB.audioScan;
  const srcOptions = () => [['all', 'All sound']].concat(A().sources().map(o => [o.id, o.name]));
  const pct = v => Math.round(v * 100);
  /** Run a generator with a busy button and a message at the end. */
  async function run(btn, label, fn, done) {
    const was = btn.textContent; btn.disabled = true; btn.textContent = 'Listening…';
    try { const n = await fn(); SB.toast(done(n)); } catch (e) { SB.toast(e.message || String(e)); console.warn(e); }
    finally { btn.disabled = false; btn.textContent = was || label; SB.invalidate('inspector', 'timeline'); }
  }

  function moveSection(c) {
    if (c.type !== 'null' || c.toggle || c.frameSwitch) return null; // toggles and frame switches: Lip sync instead
    const st = Object.assign(A().defaults(c), c.audio || {}), set = (k, v) => { c.audio = Object.assign({}, st, { [k]: v }); SB.commit(); };
    const slots = SB.controls.slotsFor(c).map(s => [s.k, s.name]), none = !A().sources().length;
    const go = h('button.btn.sm.primary', { type: 'button', disabled: none || null }, 'Make keyframes');
    go.onclick = () => { c.audio = st; run(go, 'Make keyframes', () => A().bake(c), n => `${c.name} now moves with ${A().srcName(st.src)}: ${n} keyframes (Undo takes them away).`); };
    return FL.section('Move with sound', [
      none ? h('p.hint.keep', null, 'Add an audio (or video) layer to this screen first.') : null,
      W.row('Sound', W.select(st.src, srcOptions(), v => set('src', v), 'Sound to follow')),
      W.row('Follows', W.select(st.band, A().BANDS, v => set('band', v), 'Which part of the sound')),
      W.row('From', W.select(st.from, slots, v => set('from', v), 'Where it rests (quiet)')),
      W.row('To', W.select(st.to, slots, v => set('to', v), 'Where it goes (loud)')),
      W.row('Strength', W.range(pct(st.amt), { min: 20, max: 300, step: 5, label: 'Strength %', change: v => set('amt', v / 100) })),
      W.row('Smooth', W.range(pct(st.smooth), { min: 0, max: 100, step: 5, label: 'Smooth %', change: v => set('smooth', v / 100) })),
      W.row('Ignore below', W.range(pct(st.gate), { min: 0, max: 60, step: 1, label: 'Ignore below %', change: v => set('gate', v / 100) })),
      h('div.row.btns', null, go, W.info(['The sound is measured here (nothing is uploaded) and becomes keyframes on this controller, between From (quiet) and To (loud), so it plays the same in videos, Unity and Godot, and you can edit it after.',
        'Bass follows the beat, Melody the voices and instruments, Highs cymbals and hiss, Volume everything. Strength makes it move further; Smooth makes it calmer; Ignore below leaves out quiet parts.',
        'Make keyframes again after a change: it replaces its keys where the sound plays.'], 'Move with sound'))].filter(Boolean),
      { key: 'ctrl-audio', closed: !c.audio });
  }

  function lipSection(t) {
    const ok = t.type === 'null' ? (t.points || []).length > 1 : SB.types.get(t.type).frames && (t.frames || []).length > 1 && t.type !== 'null';
    if (!ok) return null;
    const lip = Object.assign({ src: (A().sources()[0] || {}).id || 'all', detail: 0.5 }, t.lip || {}), map = t.mouth || A().guessMouth(t), none = !A().sources().length;
    const rows = A().slotsOf(t).map(x => h('div.pt-row', null, h('span.pt-i', null, String(x.i + 1)), h('span.pt-name', null, x.name),
      W.select(map[x.i] || '', [['', '—']].concat(A().SHAPES), v => { t.mouth = Object.assign({}, map, { [x.i]: v || null }); SB.commit(); }, `Mouth shape of ${x.name}`)));
    const go = h('button.btn.sm.primary', { type: 'button', disabled: none || null }, 'Make lip sync keyframes');
    go.onclick = () => { t.lip = lip; if (!t.mouth) t.mouth = map; run(go, 'Make lip sync keyframes', () => A().lipSync(t), n => `Lip sync from ${A().srcName(lip.src)}: ${n} mouth changes keyed on ${t.name}.`); };
    return FL.section('Lip sync', [
      none ? h('p.hint.keep', null, 'Add an audio (or video) layer with the voice first.') : null,
      h('div.pt-list', null, rows),
      W.row('Voice', W.select(lip.src, srcOptions(), v => { t.lip = Object.assign({}, lip, { src: v }); SB.commit(); }, 'The voice to follow')),
      W.row('Detail', W.range(pct(lip.detail), { min: 0, max: 100, step: 5, label: 'Detail %', change: v => { t.lip = Object.assign({}, lip, { detail: v / 100 }); SB.commit(); } })),
      h('div.row.btns', null, go, W.info([`Give each ${t.type === 'null' ? 'point' : 'frame'} the mouth shape it shows. The voice is measured here (nothing is uploaded; no words are recognized: it listens to how loud the voice is and where its sound sits) and the mouth gets a keyframe at each change, held until the next.`,
        'Detail: low keeps a few shapes and holds each longer (calm, readable); high uses all the shapes and switches more often. Missing shapes use the nearest one you have (O for U, rest for M B P…).',
        t.type === 'null' ? 'It keys this controller’s knob, so the layers or frames it switches follow.' : 'It keys the Frame of this drawing (Hold).'], 'Lip sync'))].filter(Boolean),
      { key: 'lip-sync', closed: !t.lip });
  }
  if (SB.inspector) { SB.inspector.top.push(moveSection); SB.inspector.top.push(lipSection); }
})(window.SB);
