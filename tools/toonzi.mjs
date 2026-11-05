#!/usr/bin/env node
/* Toonzi 2D command line: for people and AI assistants who write a project as JSON (see AGENTS.md).
   Needs only Node 18+ (no packages). "preview" also needs Playwright (npm i playwright, or the Python one is not used).

     node tools/toonzi.mjs check   my.json                 is the file a project the editor can open? (errors and tips)
     node tools/toonzi.mjs link    my.json [--base URL]    a link that opens it in the editor (the project is inside the link)
     node tools/toonzi.mjs editor  my.json [out.html]      one self-contained editor page with the project in it (works offline)
     node tools/toonzi.mjs preview my.json [out.png] [--at 0,0.5,1] [--width 360]
                                                           pictures of the animation at those seconds, side by side
     node tools/toonzi.mjs unlink  "<link>" [out.json]      the project inside a link (one the user copied: logo › Copy a link to this animation)
     node tools/toonzi.mjs serve   [port]                  run the editor from this folder (http://localhost:8080)

   The default link base is the public editor: https://idont12.github.io/toonzi-2d/ (a copy of the app: --base its address). */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://idont12.github.io/toonzi-2d/';
const args = process.argv.slice(2), cmd = args[0];
const flag = (name, def) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : def; };
const plain = args.slice(1).filter((a, i, l) => !a.startsWith('--') && !(i > 0 && l[i - 1].startsWith('--')));
const die = msg => { console.error(msg); process.exit(1); };

// ---------- what the editor knows (kept in step with js/: types, effects, eases)
const TYPES = ['draw', 'shape', 'group', 'text', 'image', 'video', 'audio', 'rig', 'null', 'pixels', 'particles'];
const SHAPES = ['rect', 'round', 'ellipse', 'triangle', 'star', 'arrow', 'bubble', 'line'];
const EASES = ['smooth', 'linear', 'easeIn', 'easeOut', 'back', 'bounce', 'elastic', 'spline', 'hold', 'bez', 'pw'];
const EFFECTS = ['shake', 'boil', 'wave', 'wobble', 'float', 'pulse', 'jelly', 'spin', 'swing', 'blink', 'rainbow', 'dashFlow', 'drawLoop',
  'glow', 'blur', 'dirBlur', 'grayscale', 'shadow', 'outline', 'innerShadow', 'recolor', 'duplicate',
  'fadeIn', 'popIn', 'slideIn', 'zoomIn', 'wipeIn', 'blurIn', 'spinIn', 'drawIn', 'typewriter',
  'fadeOut', 'popOut', 'slideOut', 'zoomOut', 'wipeOut', 'blurOut', 'spinOut', 'drawOut', 'breakOut'];
const GAME_FX = ['shake', 'wobble', 'float', 'pulse', 'jelly', 'spin', 'swing', 'fadeIn', 'popIn', 'slideIn', 'zoomIn', 'spinIn', 'fadeOut', 'popOut', 'slideOut', 'zoomOut', 'spinOut', 'blink'];

function read(file) {
  if (!file) die('Which file? node tools/toonzi.mjs ' + cmd + ' my-animation.json');
  let txt; try { txt = fs.readFileSync(file, 'utf8'); } catch (e) { die(`Can't read ${file}: ${e.message}`); }
  try { return { txt, d: JSON.parse(txt) }; } catch (e) { die(`${file} is not valid JSON: ${e.message}`); }
}

/** Errors (it won't open as meant) and tips (it opens, but could be better). */
function check(d) {
  const errors = [], tips = [], ids = new Map(), P = Object.assign({ w: 1920, h: 1080, fps: 24, duration: 10 }, d.project || {});
  if (d.app && !['storyboard-studio', 'toonzi', 'toonzi-2d'].includes(d.app)) errors.push(`app is "${d.app}": use "toonzi" (or leave it out).`);
  if (!d.objects && !d.screens) errors.push('No "objects" (the layers) and no "screens".');
  if (!(P.w > 0 && P.h > 0)) errors.push('project.w and project.h must be positive numbers (the screen size in px).');
  if (!(P.duration > 0)) errors.push('project.duration must be a positive number of seconds.');
  if (P.fps < 1 || P.fps > 240) errors.push('project.fps must be 1 to 240.');
  const lists = [[d.objects || [], P, 'objects']]; (d.screens || []).forEach((s, i) => { if (s.objects) lists.push([s.objects, Object.assign({}, P, s.proj || {}), `screens[${i}].objects`]); });
  const all = [];
  const walk = (list, Pp, where, end) => list.forEach((o, i) => {
    const at = `${where}[${i}]${o && o.name ? ` "${o.name}"` : ''}`;
    if (!o || typeof o !== 'object') return errors.push(`${at} is not an object.`);
    if (!TYPES.includes(o.type)) return errors.push(`${at}: unknown type "${o.type}" (use one of ${TYPES.join(', ')}).`);
    if (o.id) { if (ids.has(o.id)) errors.push(`${at}: id "${o.id}" is used twice.`); ids.set(o.id, o); }
    all.push([o, at, Pp]);
    const st = +o.start || 0, dur = o.dur ?? (end - st);
    if (st + dur > end + 1e-6 && !o.seq) tips.push(`${at} ends at ${st + dur}s, after its screen or group (${end}s): that part never shows.`);
    if (o.type === 'shape' && o.shape && !SHAPES.includes(o.shape)) errors.push(`${at}: shape "${o.shape}" (use ${SHAPES.join(', ')}).`);
    for (const k in o.tracks || {}) {
      const tr = o.tracks[k]; if (!Array.isArray(tr)) { errors.push(`${at}: tracks.${k} must be a list of keyframes [{ "t": seconds, "v": value }].`); continue; }
      tr.forEach((q, j) => { if (!q || typeof q.t !== 'number' || q.v === undefined) errors.push(`${at}: tracks.${k}[${j}] needs "t" (seconds, from the layer's start) and "v".`);
        else { if (q.t < 0 || q.t > dur + 1e-6) tips.push(`${at}: tracks.${k} has a key at ${q.t}s, outside the layer (0 to ${dur}s from its start).`); if (q.e && !EASES.includes(q.e)) errors.push(`${at}: tracks.${k}[${j}] ease "${q.e}" (use ${EASES.join(', ')}).`); } });
      for (let j = 1; j < tr.length; j++) if (tr[j] && tr[j - 1] && tr[j].t < tr[j - 1].t) { tips.push(`${at}: tracks.${k} is not in time order (it gets sorted).`); break; }
    }
    (o.effects || []).forEach((e, j) => { if (!e || !EFFECTS.includes(e.type)) errors.push(`${at}: effects[${j}] type "${e && e.type}" (use ${EFFECTS.join(', ')}).`); });
    if (o.frames && !Array.isArray(o.frames)) errors.push(`${at}: frames must be a list.`);
    if (o.type === 'draw' && !(o.frames || []).some(f => f && f.strokes && f.strokes.length)) tips.push(`${at}: a drawing layer with nothing drawn (frames[].strokes is empty).`);
    if (o.type === 'pixels' && !(o.frames || []).some(f => f && f.px && Object.keys(f.px).length)) tips.push(`${at}: a pixel art layer with no pixels (frames[].px is empty).`);
    if (o.type === 'rig') { const bs = o.bones || [], bid = new Set(bs.map(b => b.id)); if (!bs.length) tips.push(`${at}: a rig with no bones.`);
      bs.forEach((b, j) => { if (!b.id) errors.push(`${at}: bones[${j}] needs an id (layers and keyframes refer to it).`); if (b.parent && !bid.has(b.parent)) errors.push(`${at}: bone "${b.id}" has parent "${b.parent}", which is not one of its bones.`); });
      for (const k in o.tracks || {}) { const m = /^(bone|bonex|boney|bonesx|bonesy|bonebend):(.+)$/.exec(k); if (m && !bid.has(m[2])) errors.push(`${at}: tracks.${k} is for bone "${m[2]}", which this rig doesn't have.`); } }
    if (o.type === 'group') { if (!Array.isArray(o.children)) errors.push(`${at}: a group needs "children" (a list of layers).`); else walk(o.children, Pp, at + '.children', o.seq ? dur : st + dur); }
  });
  for (const [list, Pp, where] of lists) walk(list, Pp, where, Pp.duration);
  for (const [o, at] of all) {
    if (o.bind) { const r = ids.get(o.bind.rig); if (!r || r.type !== 'rig') errors.push(`${at}: bind.rig "${o.bind.rig}" is not the id of a rig layer.`);
      else if (o.bind.mode !== 'deform' && !(r.bones || []).some(b => b.id === o.bind.bone)) errors.push(`${at}: bind.bone "${o.bind.bone}" is not a bone of "${r.name || r.id}".`);
      if (o.bind.mode === 'deform' && (o.type === 'group' || o.type === 'text')) errors.push(`${at}: only drawings, shapes, pictures and pixel art can bend (mode "deform"); use "follow".`); }
    for (const L of o.drv || []) if (!ids.has(L.ctrl) || ids.get(L.ctrl).type !== 'null') errors.push(`${at}: drv ctrl "${L.ctrl}" is not the id of a controller (type "null").`);
    if ((o.effects || []).some(e => e && !GAME_FX.includes(e.type))) tips.push(`${at}: uses ${(o.effects || []).filter(e => e && !GAME_FX.includes(e.type)).map(e => e.type).join(', ')}: fine for video and web; not recommended for Unity, Godot and Blender (a look that never changes goes onto the sprite, others frame by frame).`);
  }
  if (all.length > 400) tips.push(`${all.length} layers: the editor stays smooth up to a few hundred.`);
  return { errors, tips, layers: all.length };
}

function linkOf(txt, base = BASE) { const min = JSON.stringify(JSON.parse(txt)); return base.replace(/#.*$/, '') + '#project=' + zlib.deflateRawSync(Buffer.from(min), { level: 9 }).toString('base64url'); }

/** index.html with every script, the stylesheet and the pictures inside it, and the project set to open. */
function editorPage(txt) {
  let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const inl = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
  const dataUri = f => `data:${f.endsWith('.svg') ? 'image/svg+xml' : f.endsWith('.png') ? 'image/png' : 'application/octet-stream'};base64,${fs.readFileSync(path.join(ROOT, f)).toString('base64')}`;
  html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g, (m, f) => `<style>\n${inl(f)}\n</style>`);
  html = html.replace(/(src|href)="(assets\/[^"]+)"/g, (m, a, f) => fs.existsSync(path.join(ROOT, f)) ? `${a}="${dataUri(f)}"` : m);
  const open = `<script>window.TOONZI_OPEN = ${JSON.stringify(JSON.parse(txt)).replace(/</g, '\\u003c')};</script>\n`;
  let first = true;
  html = html.replace(/<script src="([^"]+)"><\/script>/g, (m, f) => { if (/^https?:/.test(f) || !fs.existsSync(path.join(ROOT, f))) return m; const s = `${first ? open : ''}<script>/* ${f} */\n${inl(f).replace(/<\/script/gi, '<\\/script')}\n</script>`; first = false; return s; });
  return html.replace('</head>', `<base href="${BASE}">\n</head>`); // pictures and tutorials the page asks for later come from the public copy
}

function serve(port) {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp', '.mp4': 'video/mp4' };
  const srv = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
    const f = path.join(ROOT, path.normalize(p)); if (!f.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
    fs.readFile(f, (e, b) => { if (e) { res.writeHead(404); return res.end('Not found'); } res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); res.end(b); });
  });
  return new Promise(ok => srv.listen(port, () => ok(srv)));
}

async function preview(txt, out, at, width) {
  let pw; try { pw = await import('playwright'); } catch (e) { try { pw = createRequire(import.meta.url)('playwright'); } catch (e2) { die('preview needs Playwright: npm i playwright && npx playwright install chromium'); } }
  const srv = await serve(0), port = srv.address().port, browser = await pw.chromium.launch();
  try {
    const page = await browser.newPage(), errs = []; page.on('pageerror', e => errs.push(String(e)));
    await page.goto(`http://localhost:${port}/index.html?nostart#project=${zlib.deflateRawSync(Buffer.from(JSON.stringify(JSON.parse(txt)))).toString('base64url')}`);
    await page.waitForFunction(() => window.SB && SB.ready, null, { timeout: 30000 }); await page.waitForTimeout(600);
    const url = await page.evaluate(async ({ at, width }) => {
      const P = SB.state.project, k = width / P.w, h = Math.round(P.h * k), cv = document.createElement('canvas'); cv.width = width * at.length + 8 * (at.length - 1); cv.height = h + 22;
      const c = cv.getContext('2d'); c.fillStyle = '#fff'; c.fillRect(0, 0, cv.width, cv.height);
      for (let i = 0; i < at.length; i++) { const one = document.createElement('canvas'); one.width = width; one.height = h; SB.state.time = at[i]; SB.bump(); SB.scene.render(one.getContext('2d'), at[i], k, {}); c.drawImage(one, i * (width + 8), 0); c.fillStyle = '#24213F'; c.font = '13px sans-serif'; c.fillText(at[i] + 's', i * (width + 8) + 4, h + 16); }
      return cv.toDataURL('image/png');
    }, { at, width });
    fs.writeFileSync(out, Buffer.from(url.split(',')[1], 'base64'));
    if (errs.length) console.log('The page reported:\n  ' + errs.join('\n  '));
  } finally { await browser.close(); srv.close(); }
}

const usage = () => console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0].replace('/*', '').replace(/^#!.*\n/, ''));
if (!cmd || cmd === 'help' || cmd === '--help') usage();
else if (cmd === 'unlink') {
  const l = plain[0] || die('Which link? node tools/toonzi.mjs unlink "https://…#project=…" out.json'), m = /[#&]project=([A-Za-z0-9_-]+)/.exec(l), j = /[#&]json=([^&]+)/.exec(l);
  if (!m && !j) die('That link has no project in it (#project=…). A link with ?open= points to a file: download that file instead.');
  const txt = m ? zlib.inflateRawSync(Buffer.from(m[1], 'base64url')).toString('utf8') : decodeURIComponent(j[1]), out = plain[1] || 'animation.json';
  fs.writeFileSync(out, JSON.stringify(JSON.parse(txt), null, 1)); console.log(out);
}
else if (cmd === 'serve') { const port = +plain[0] || 8080; serve(port).then(() => console.log(`Toonzi 2D at http://localhost:${port}/ (Ctrl+C to stop)`)); }
else {
  const { txt, d } = read(plain[0]), r = check(d);
  if (cmd === 'check') {
    for (const e of r.errors) console.log('✗ ' + e); for (const t of r.tips) console.log('• ' + t);
    console.log(r.errors.length ? `\n${r.errors.length} problem${r.errors.length > 1 ? 's' : ''} to fix.` : `OK: ${r.layers} layer${r.layers === 1 ? '' : 's'}${r.tips.length ? `, ${r.tips.length} tip${r.tips.length > 1 ? 's' : ''}` : ''}.`);
    process.exit(r.errors.length ? 1 : 0);
  }
  if (r.errors.length) die(r.errors.map(e => '✗ ' + e).join('\n') + '\nFix these first (node tools/toonzi.mjs check).');
  if (cmd === 'link') { const l = linkOf(txt, flag('base', BASE)); console.log(l); if (l.length > 60000) console.error(`(The link is ${Math.round(l.length / 1000)} kB: fine for browsers, but chat apps may cut it. Use "editor" for a file instead.)`); }
  else if (cmd === 'editor') { const out = plain[1] || plain[0].replace(/\.json$/i, '') + '-editor.html'; fs.writeFileSync(out, editorPage(txt)); console.log(`${out} (${(fs.statSync(out).size / 1048576).toFixed(1)} MB): open it in a browser to edit the animation.`); }
  else if (cmd === 'preview') { const out = plain[1] || plain[0].replace(/\.json$/i, '') + '-preview.png', P = Object.assign({ duration: 10 }, d.project || {}); const at = (flag('at') || [0, 0.25, 0.5, 0.75, 1].map(u => +(u * Math.max(0, P.duration - 0.01)).toFixed(2)).join(',')).split(',').map(Number); await preview(txt, out, at, +flag('width', 360)); console.log(out); }
  else die(`Unknown command "${cmd}". Try: check, link, editor, preview, serve.`);
}
