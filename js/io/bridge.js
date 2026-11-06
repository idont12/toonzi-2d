/* The bridge: lets a page around the editor (an AI chat window, a site, a tool) open animations in it and hear about
   every change the person makes, with no long links. Two ways (see AGENTS.md › "Inside a chat window"):

   1) Messages, when the editor runs in an <iframe> (or a window another page opened). Every message is an object
      { toonzi: 1, type, ... } sent with postMessage.
        the editor sends    ready    { version, layers }                the editor is up: send it an animation
                            changed  { project, rev }                   the person changed something (a moment after)
                            opened   { name }   project { id, project }   link { id, link }   error { message }
        the page sends      open     { project }                        open this project (JSON or a JSON string)
                            get      { id }                             answer with project { id, project }
                            link     { id, base? }                      answer with a link to it
                            watch    { on }                             stop (false) or start sending changed
                            time { t } · play · pause                   move the playhead, play, stop
      Only the page that holds the editor (its parent or opener) is listened to and written to.

   2) A Claude artifact's database (claude.use('db'), when the page is published with the db capability): the editor
      keeps the animation in the document toonzi/state, so Claude reads what the person changed, and opens what
      Claude writes there while the page is open:
        { rev, by: 'editor' | 'ai' | …, at, client, name, json: '<project JSON>' }   (or project: {…} written by an AI;
        a big project is packed like a link: z: '<deflate-raw base64url>', in parts toonzi/state/parts/p0… when parts > 0)
*/
'use strict';
(function (SB) {
  const S = SB.state;
  const host = window.parent !== window ? window.parent : (window.opener && !window.opener.closed ? window.opener : null);
  const client = Math.random().toString(36).slice(2, 10);
  const DOC = 'toonzi/state', PART = 240000; // a database document holds at most 256 KiB
  let last = null, watch = true, timer = 0, db = null, dbRev = null, writing = Promise.resolve(), opening = false;
  const B = SB.bridge = { embedded: !!host, db: false, client };

  const post = (type, data) => { if (!host) return; try { host.postMessage(Object.assign({ toonzi: 1, type }, data || {}), '*'); } catch (e) { console.warn(e); } };
  const current = async () => JSON.stringify(await SB.project.pack());
  /** Open a project from outside (an object or JSON text); what it is now becomes the known state, so it isn't sent back. */
  async function open(p, from) {
    const d = SB.project.prepare(typeof p === 'string' ? JSON.parse(p) : p); opening = true;
    try {
      if (S.objects.length && SB.project.remember) { try { await SB.project.remember(S.project.name, new Blob([await current()], { type: 'application/json' })); } catch (e) { /* keep going */ } } // the old one stays in Recent projects
      if (SB.dialog && SB.dialog.isOpen()) SB.dialog.closeTop();
      await SB.project.openData(d, d.name || (d.project && d.project.name)); SB.resetHistory(); SB.invalidate();
      await new Promise(r => setTimeout(r, 700)); clearTimeout(timer); // what the editor adds by itself right after opening (rig library…) isn't a change
      last = await current(); if (from) SB.toast(from);
    } finally { opening = false; }
  }
  // ---------- packing for the database (the same packing as links: deflate-raw, base64url)
  const b64 = bytes => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
  const pack = async txt => b64(new Uint8Array(await new Response(new Blob([txt]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer()));
  const unpack = async z => { const s = atob(z.replace(/-/g, '+').replace(/_/g, '/')), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return new Response(new Blob([u]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text(); };
  /** The project in a toonzi/state document (as JSON text), or null. */
  async function fromDoc(d) {
    if (!d) return null; if (d.project && typeof d.project === 'object') return JSON.stringify(d.project); if (typeof d.json === 'string' && d.json) return d.json;
    if (typeof d.z === 'string' && d.z) return unpack(d.z);
    if (d.parts > 0) { let z = ''; for (let i = 0; i < d.parts; i++) { const s = await db.doc(`${DOC}/parts/p${i}`).get(), x = s.exists && s.data(); if (!x || x.rev !== d.rev) return null; z += x.z || ''; } return unpack(z); }
    return null;
  }
  async function saveDoc(txt) {
    const rev = Date.now(), base = { rev, by: 'editor', at: new Date(rev).toISOString(), client, name: S.project.name || 'Untitled animation' };
    let body;
    if (txt.length < PART) body = Object.assign(base, { json: txt });
    else { const z = await pack(txt); if (z.length < PART) body = Object.assign(base, { z }); else { const n = Math.ceil(z.length / PART); for (let i = 0; i < n; i++) await db.doc(`${DOC}/parts/p${i}`).set({ rev, z: z.slice(i * PART, (i + 1) * PART) }); body = Object.assign(base, { parts: n }); } }
    dbRev = rev; await db.doc(DOC).set(body);
  }
  /** After each change (a moment later, once): tell the page around the editor and the artifact's database. */
  function changed() {
    if (opening || (!host && !db)) return; clearTimeout(timer);
    timer = setTimeout(async () => {
      if (opening) return; let txt; try { txt = await current(); } catch (e) { return; } if (txt === last) return; last = txt;
      if (host && watch) post('changed', { project: JSON.parse(txt), rev: Date.now() });
      if (db) writing = writing.then(() => saveDoc(txt)).catch(e => console.warn('Saving to the artifact failed', e));
    }, db ? 1500 : 600);
  }
  SB.on('commit', changed);

  addEventListener('message', async e => {
    if (!host || e.source !== host) return; const m = e.data; if (!m || m.toonzi !== 1 || typeof m.type !== 'string') return;
    try {
      if (m.type === 'open') { await open(m.project, m.quiet ? null : 'Opened the animation.'); post('opened', { name: S.project.name }); }
      else if (m.type === 'get') post('project', { id: m.id, project: JSON.parse(await current()) });
      else if (m.type === 'link') post('link', { id: m.id, link: await SB.project.link(m.base) });
      else if (m.type === 'watch') watch = m.on !== false;
      else if (m.type === 'time') { SB.time.set(+m.t || 0); }
      else if (m.type === 'play') SB.time.play();
      else if (m.type === 'pause') SB.time.pause();
    } catch (err) { post('error', { message: String(err && err.message || err), about: m.type }); }
  });

  /** Called once the editor is up (js/app.js). */
  B.start = async () => {
    last = await current().catch(() => null);
    if (host) post('ready', { version: 'toonzi-2d', layers: S.objects.length });
    if (window.claude && typeof window.claude.use === 'function') { // a Claude artifact published with the db capability
      try { db = await window.claude.use('db'); } catch (e) { db = null; }
      if (!db) return; B.db = true;
      const ref = db.doc(DOC);
      ref.onSnapshot(async snap => {
        const d = snap.exists ? snap.data() : null; if (!d || d.rev === dbRev || (d.client === client && d.by === 'editor')) return;
        dbRev = d.rev; let txt = null; try { txt = await fromDoc(d); } catch (e) { console.warn(e); }
        if (!txt || txt === last) return;
        try { await open(txt, d.by === 'editor' ? 'Opened the latest version of this animation.' : 'The animation was updated.'); } catch (e) { SB.toast('The animation in this page has a problem: ' + (e.message || e)); }
      }, err => console.warn('The artifact database stopped', err));
    }
  };
})(window.SB);
