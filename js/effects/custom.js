/* Your own effects, added as code in Settings › Effects (kept on this device with the preferences).
   Paste one effect at a time, as an object:

   {
     id: 'sepia',                 // unique, letters and numbers
     label: 'Sepia',              // the name in menus
     animated: false,             // false: a look that stays on; true: it moves over time (or cat: 'in' / 'out' for a transition)
     params: { amt: { label: 'Amount', min: 0, max: 1, step: 0.05, def: 0.8 } },
     apply(r, x) { r.filters.push(`sepia(${x.e.amt})`); }
   }

   apply(r, x) changes the render state r (see js/effects/engine.js for every field:
   x, y, sx, sy, rot, opacity, filters[], glow, styles[] …). x.e holds the effect's settings,
   x.T the seconds since it started (times its speed), x.u the 0 → 1 progress of a transition. */
'use strict';
(function (SB) {
  const S = SB.state, CATS = ['static', 'loop', 'in', 'out'];
  S.customFx = S.customFx || [];
  /** Turn code into an effect definition and register it. Throws with a readable message. */
  function run(code) {
    const src = String(code || '').trim(); if (!src) throw new Error('Paste the code of an effect first.');
    let def; try { def = new Function('SB', 'U', '"use strict"; return (' + src.replace(/;\s*$/, '') + ');')(SB, SB.util); } catch (e) { throw new Error('The code has an error: ' + e.message); }
    if (!def || typeof def !== 'object' || !def.id || typeof def.apply !== 'function') throw new Error('An effect needs an id, a label and apply(r, x).');
    if (!def.cat) def.cat = def.animated ? 'loop' : 'static';
    if (!CATS.includes(def.cat)) throw new Error("cat must be 'static', 'loop', 'in' or 'out'.");
    const builtIn = SB.effects.get(def.id); if (builtIn && !builtIn.custom) throw new Error(`“${def.id}” is the id of a built-in effect. Choose another id.`);
    def.label = def.label || def.id; def.custom = true;
    const fn = def.apply; def.apply = (r, x) => { try { fn(r, x); } catch (e) { if (!def._warned) { def._warned = true; console.warn(def.id, e); SB.toast(`${def.label}: ${e.message}`); } } }; // a broken effect never breaks the stage
    return SB.effect(def);
  }
  const C = SB.customFx = {
    EXAMPLES: {
      look: `{\n  id: 'sepia',\n  label: 'Sepia',\n  animated: false,\n  params: { amt: { label: 'Amount', min: 0, max: 1, step: 0.05, def: 0.8 } },\n  apply(r, x) { r.filters.push(\`sepia(\${x.e.amt})\`); }\n}`,
      animated: `{\n  id: 'heartbeat',\n  label: 'Heartbeat',\n  animated: true,\n  params: ['amt', 'speed'],\n  apply(r, x) { const k = 1 + Math.pow(Math.max(0, Math.sin(x.T * 7)), 8) * 0.15 * x.amt; r.sx *= k; r.sy *= k; }\n}`,
      transition: `{\n  id: 'dropIn',\n  label: 'Drop in',\n  cat: 'in',\n  params: ['dur'],\n  apply(r, x) { const u = 1 - Math.pow(1 - x.u, 3); r.y -= (1 - u) * 300; r.opacity *= Math.min(1, x.u * 3); }\n}`,
    },
    /** Register the saved effects (at start-up). */
    load(list) { S.customFx = (list || []).filter(Boolean); S.customFx.forEach(code => { try { run(code); } catch (e) { console.warn('custom effect', e); } }); },
    /** Add (or replace, same id) an effect from code. Returns its definition. */
    add(code) { const def = run(code); S.customFx = S.customFx.filter(c => { try { return idOf(c) !== def.id; } catch (e) { return true; } }).concat(code.trim()); SB.prefs.save(); SB.invalidate('inspector'); return def; },
    remove(id) { S.customFx = S.customFx.filter(c => idOf(c) !== id); SB.effects.remove(id); SB.prefs.save(); SB.invalidate('inspector'); },
    list: () => SB.effects.where(d => d.custom),
    codeOf: id => S.customFx.find(c => idOf(c) === id) || '',
  };
  const idOf = code => { const m = /\bid\s*:\s*['"`]([^'"`]+)/.exec(code); return m ? m[1] : null; };
})(window.SB);
