/* The guide's characters and their faces.
   - The pictures live in the tutorials folder: tutorials/characters/<name>/<mood>.svg (animated SVG: open one in a browser,
     edit it in any vector app). tutorials/config.js lists the characters and picks the default guide.
   - This file draws the built-in two (Pip and Mo) too, as a fallback when a picture is missing, and makes those files:
     SB.tours.faceFile(character, mood) → a standalone animated SVG (see tutorials/README.md).
   - SB.tours.faceHtml(character, mood) → markup for the guide (the picture file, or the drawn face).
   - Character 'custom' uses SB.tours.GUIDE.moods (your own pictures, one per mood). Moods: SB.tours.MOODS. */
'use strict';
(function (SB) {
  const TS = SB.tours, cfg = window.SB_TUTORIALS || {};
  TS.MOODS = [['idle', 'Calm'], ['talk', 'Talking'], ['happy', 'Happy'], ['cheer', 'Cheering'], ['wink', 'Wink'], ['idea', 'Idea'], ['think', 'Thinking'], ['point', 'Looking'], ['surprised', 'Surprised'], ['sad', 'Sad']];
  const BUILT = { pip: { name: 'Pip', body: '#7B5CFF', belly: '#A58BFF', line: '#2B1D6B' }, mo: { name: 'Mo', body: '#FF8A3D', belly: '#FFC08F', line: '#5A2A0C' }, toonzi: { name: 'Toonzi', body: '#332052', belly: '#46306F', line: '#FFFFFF' } }; /* Toonzi's own pictures are in tutorials/characters/toonzi; this drawn blob is only the fallback */
  TS.CHARACTERS = {};
  for (const [id, c] of Object.entries(Object.assign({}, BUILT, cfg.characters || {}))) TS.CHARACTERS[id] = Object.assign({}, BUILT[id], c);
  TS.CHARACTERS.custom = { name: 'Your pictures' };
  if (cfg.size && TS.GUIDE) TS.GUIDE.size = cfg.size;
  /** The guide every tutorial uses unless it picks its own: your choice in the maker, else tutorials/config.js, else Toonzi. */
  TS.defaultCharacter = () => { const c = SB.state.tourCharacter || cfg.character; return c && TS.CHARACTERS[c] ? c : 'toonzi'; };

  const eye = (x, y, r = 4.2, c) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}"/><circle cx="${x + r * 0.35}" cy="${y - r * 0.35}" r="${r * 0.32}" fill="#fff"/>`;
  /** The drawn face: a body group, then eyes, mouth and extras with classes the animations use. */
  function parts(id, m) {
    const C = TS.CHARACTERS[id] && TS.CHARACTERS[id].body ? TS.CHARACTERS[id] : BUILT[id] || BUILT.pip, L = C.line, mo = (BUILT[id] ? id : C.shape) === 'mo';
    const body = mo // Mo: a round bean with two little ears; Pip: a soft blob with a curl on top
      ? `<path d="M22 34 L26 14 L40 27 Q50 24 60 27 L74 14 L78 34 Q90 50 84 70 Q76 92 50 92 Q24 92 16 70 Q10 50 22 34Z" fill="${C.body}"/>`
      : `<path d="M50 14 Q56 4 64 9 Q57 9 56 16 Q84 22 86 55 Q88 90 50 92 Q12 90 14 55 Q16 20 50 14Z" fill="${C.body}"/>`;
    const belly = `<ellipse cx="50" cy="72" rx="22" ry="15" fill="${C.belly}" opacity=".7"/>`, cheeks = `<ellipse cx="31" cy="58" rx="6" ry="3.6" fill="#FF7FA8" opacity=".7"/><ellipse cx="69" cy="58" rx="6" ry="3.6" fill="#FF7FA8" opacity=".7"/>`;
    const arcEyes = `<path d="M33 49 Q38 41 43 49 M57 49 Q62 41 67 49" fill="none" stroke="${L}" stroke-width="3.2" stroke-linecap="round"/>`;
    const smile = `<path class="mouth" d="M41 59 Q50 67 59 59" fill="none" stroke="${L}" stroke-width="3" stroke-linecap="round"/>`, bigSmile = `<g class="mouth"><path d="M38 57 Q50 74 62 57 Z" fill="${L}"/><path d="M43 63 Q50 67 57 63" fill="#FF7FA8"/></g>`;
    let eyes = eye(38, 46, 4.2, L) + eye(62, 46, 4.2, L), mouth = smile, extra = '', cls = 'idle', other = '';
    switch (m) {
      case 'talk': mouth = `<ellipse class="mouth" cx="50" cy="62" rx="6" ry="4.5" fill="${L}"/>`; cls = 'talking'; break;
      case 'happy': eyes = arcEyes; mouth = bigSmile; other = cheeks; cls = 'happy'; break;
      case 'cheer': eyes = arcEyes; mouth = bigSmile; other = cheeks; extra = `<path class="spark" d="M14 18l2 5 5 2-5 2-2 5-2-5-5-2 5-2z"/><path class="spark s2" d="M86 12l1.6 4 4 1.6-4 1.6-1.6 4-1.6-4-4-1.6 4-1.6z"/>`.replace(/<path class/g, '<path fill="#FFC83D" class'); cls = 'cheering'; break;
      case 'wink': eyes = eye(38, 46, 4.2, L) + `<path d="M57 47 Q62 43 67 47" fill="none" stroke="${L}" stroke-width="3.2" stroke-linecap="round"/>`; other = cheeks; cls = 'winking'; break;
      case 'idea': eyes = eye(38, 43, 4.2, L) + eye(62, 43, 4.2, L); extra = `<g class="bulb" transform="translate(74 -2)"><path d="M10 4a8 8 0 0 0-5 14c1 1 1.5 2 1.5 3h7c0-1 .5-2 1.5-3A8 8 0 0 0 10 4z" fill="#FFE36E" stroke="#C99A00" stroke-width="1.4"/><path d="M7 24h6" stroke="#C99A00" stroke-width="1.6" stroke-linecap="round"/></g>`; cls = 'idea'; break;
      case 'think': eyes = eye(35, 43, 4.2, L) + eye(59, 43, 4.2, L); mouth = `<path class="mouth" d="M44 62 H56" stroke="${L}" stroke-width="3" stroke-linecap="round"/>`; extra = `<g class="dots"><circle cx="80" cy="14" r="3" fill="${L}" opacity=".5"/><circle cx="88" cy="8" r="2.2" fill="${L}" opacity=".4"/><circle cx="94" cy="3" r="1.6" fill="${L}" opacity=".3"/></g>`; cls = 'thinking'; break;
      case 'point': eyes = eye(42, 47, 4.2, L) + eye(66, 47, 4.2, L); cls = 'looking'; break;
      case 'surprised': eyes = eye(38, 45, 6, L) + eye(62, 45, 6, L); mouth = `<ellipse class="mouth" cx="50" cy="64" rx="4.5" ry="5.5" fill="${L}"/>`; cls = 'surprised'; break;
      case 'sad': eyes = eye(38, 49, 4, L) + eye(62, 49, 4, L) + `<path d="M31 41 L43 44 M69 41 L57 44" stroke="${L}" stroke-width="2.6" stroke-linecap="round"/>`; mouth = `<path class="mouth" d="M42 65 Q50 58 58 65" fill="none" stroke="${L}" stroke-width="3" stroke-linecap="round"/>`; extra = `<path class="tear" d="M67 54 q2 4 0 6 q-2-2 0-6z" fill="#7FC8FF"/>`; cls = 'sad'; break;
    }
    return { cls, inner: `<g class="body">${body}${belly}${other}<g class="eyes">${eyes}</g>${mouth}</g>${extra}` };
  }
  /** The drawn face inline (the app's CSS animates it: talking, breathing, hopping). */
  TS.face = (id, m) => { const p = parts(id, m); return `<svg viewBox="0 0 100 100" class="tg-face ${p.cls}" aria-hidden="true">${p.inner}</svg>`; };
  /** The animations a face file carries inside it (so it moves wherever it shows: the app, a browser, a slide). */
  const FILE_CSS = `.body{transform-origin:50px 92px;animation:breathe 3.2s ease-in-out infinite}
.eyes{transform-origin:50px 46px;animation:blink 4.6s infinite}
.talking .mouth{transform-origin:50px 62px;animation:talk .3s ease-in-out infinite alternate}
.cheering .body{animation:hop .55s ease-in-out infinite alternate}
.happy .body{animation:bob 1.4s ease-in-out infinite}
.winking .eyes{animation:none}
.spark{transform-box:fill-box;transform-origin:center;animation:twinkle .8s ease-in-out infinite alternate}.spark.s2{animation-delay:.4s}
.bulb{animation:glow 1.1s ease-in-out infinite alternate}
.dots circle{animation:dot 1.5s ease-in-out infinite}.dots circle:nth-child(2){animation-delay:.25s}.dots circle:nth-child(3){animation-delay:.5s}
.thinking .body{animation:tilt 3s ease-in-out infinite;transform-origin:50px 92px}
.surprised .body{animation:jump .9s ease-out infinite}
.looking .eyes{animation:look 2.4s ease-in-out infinite}
.tear{animation:tear 2.2s ease-in infinite}
@keyframes breathe{50%{transform:scale(1.03,.97)}}
@keyframes blink{0%,93%,100%{transform:scaleY(1)}96%{transform:scaleY(.1)}}
@keyframes talk{from{transform:scaleY(.35)}to{transform:scaleY(1.1)}}
@keyframes hop{to{transform:translateY(-6px)}}
@keyframes bob{50%{transform:translateY(-2px) rotate(-2deg)}}
@keyframes twinkle{from{transform:scale(.6);opacity:.5}to{transform:scale(1.15);opacity:1}}
@keyframes glow{to{filter:drop-shadow(0 0 4px #FFE36E)}}
@keyframes dot{50%{transform:translateY(-2px);opacity:1}}
@keyframes tilt{50%{transform:rotate(-4deg)}}
@keyframes jump{0%,100%{transform:translateY(0)}20%{transform:translateY(-5px)}}
@keyframes look{50%{transform:translateX(3px)}}
@keyframes tear{0%{transform:translateY(0);opacity:0}20%{opacity:1}100%{transform:translateY(14px);opacity:0}}
@media (prefers-reduced-motion:reduce){*{animation:none!important}}`;
  /** A standalone animated SVG file of a face: tutorials/characters/<id>/<mood>.svg. */
  TS.faceFile = (id, m) => { const p = parts(id, m); return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="200" height="200" class="${p.cls}">\n<!-- ${(TS.CHARACTERS[id] || BUILT.pip).name || id}, ${m}. Edit freely: keep the viewBox; the classes body, eyes and mouth are what the animations below move. -->\n<style>\n${FILE_CSS}\n</style>\n${p.inner}\n</svg>\n`; };
  /** Where character id's picture for mood m is (null: draw it). */
  TS.faceSrc = (id, m) => { const c = TS.CHARACTERS[id]; if (!c) return null; if (id === 'custom') { const g = TS.GUIDE.moods || {}; return g[m] || g.talk || g.idle || null; } return c.folder ? `${c.folder.replace(/\/$/, '')}/${m}.${c.ext || 'svg'}` : null; };
  /** Markup for the guide's face: the picture file (falls back to the drawn face when it can't load), or the drawn face. */
  TS.faceHtml = (id, m) => { const src = TS.faceSrc(id, m); return src ? `<img class="tg-face tg-face-img" src="${src}" alt="" draggable="false" data-ch="${id}" data-mood="${m}">` : TS.face(id === 'custom' ? 'pip' : id, m); };
  document.addEventListener('error', e => { const im = e.target; if (!im || !im.classList || !im.classList.contains('tg-face-img')) return; const id = im.dataset.ch, m = im.dataset.mood; // a missing picture: the drawn face (or the character's talk picture)
    const alt = TS.faceSrc(id, 'talk'); if (m !== 'talk' && alt && !im.dataset.tried) { im.dataset.tried = '1'; im.src = alt; return; } im.outerHTML = TS.face(BUILT[id] ? id : 'pip', m); }, true);
})(window.SB);
