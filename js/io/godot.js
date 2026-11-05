/* Godot 4 export: a scene (.tscn) with its pictures, in a folder you drop into a Godot project.
     groups       Node2D;  layers  Node2D with one Sprite2D "Picture": its drawing frames are cells of a sheet
                  (hframes × vframes inside a region of the atlas), switched by animating "frame"
     pictures     every layer's sheet packed into one atlas PNG (more pages only past 4096 px)
     masks        a Sprite2D with "Clip children" holding what it masks (inside only)
     rigs         Skeleton2D with Bone2D bones (segmented bones are chains); bending layers are Polygon2D
                  skinned to them with the same weights; a layer that only rides on a bone hangs on it
                  with a RemoteTransform2D, so posing the bones in Godot moves it
     controllers  Node2D (empty), animated
     particles    CPUParticles2D with the layer's settings (and a white particle picture it tints)
     animation    one AnimationPlayer; every chosen screen is one animation in it (baked frame by frame),
                  plus RESET with the starting pose
   Godot's 2D space is the stage's: pixels, y down, so values carry over as they are.
   SB.godot.build(screens, { fps, base, prog }) → { files, warnings } */
'use strict';
(function (SB) {
  const U = SB.util, B = SB.bake, E = SB.engines;
  const f = v => { const r = Math.round(v * 10000) / 10000; return Object.is(r, -0) ? '0' : String(r); };
  const fl = v => { const t = f(v); return /[.e]/.test(t) ? t : t + '.0'; }; // a float Godot won't read as an int (int tracks don't interpolate)
  const q = s => '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
  const nodeName = s => (String(s).replace(/[.:@/"%\\]/g, ' ').replace(/\s+/g, ' ').trim() || 'Node').slice(0, 60);
  const animName = s => (String(s).replace(/[/:,\[\]"]/g, ' ').replace(/\s+/g, ' ').trim() || 'Animation').slice(0, 60);
  const T2 = m => `Transform2D(${f(m.a)}, ${f(m.b)}, ${f(m.c)}, ${f(m.d)}, ${f(m.e)}, ${f(m.f)})`;

  /** A controller that drives the rig, in the editor and in the game (a grid of poses blended by where it is). */
  const CTRL_GD = `@tool
extends Node2D
## Toonzi 2D: a controller that drives the rig, in the editor and in the game.
## Move this node (drag it in the editor, animate it, or set its position from your own scripts) and what it
## drives follows, like in Toonzi 2D. It blends the poses recorded with the controller at each spot
## of its box or line (row by row from the top), after the AnimationPlayer, so it works while animations play:
## with "adds" (parts & 8) the change goes on top of the animation, otherwise it replaces it. Drawings it
## switches (frames, shown or hidden, fading) take the nearest spot. Its box is drawn in the editor only.

@export var targets: Array = []
@export var parts := PackedInt32Array()
@export var poses := PackedFloat32Array()
@export var shows: Array = []
@export var show_states := PackedByteArray()
@export var fades: Array = []
@export var fade_props := PackedStringArray()
@export var fade_states := PackedFloat32Array()
@export var frame_nodes: Array = []
@export var frame_states := PackedInt32Array()
@export var columns := 1
@export var rows := 1
@export var half := Vector2(100, 100)
@export var rest := Vector2.ZERO
@export_range(0.0, 1.0) var weight := 1.0
## How it is drawn in the editor: 0 its box or line, 1 a circle, 2 just the knob (it moves freely)
@export var look := 0
@export var color := Color(1.0, 0.55, 0.1, 0.95)
@export var label := ""
var _nodes: Array = []
var _show_nodes: Array = []
var _fade_nodes: Array = []
var _frame_nodes: Array = []
var _last := Vector2(INF, INF)
# what the controller wrote last time, and what was there before it: so an added change never piles up
var _wrote: Array = []
var _base: Array = []

func _ready() -> void:
\tprocess_priority = 100 # after the AnimationPlayer
\tz_index = 100 # drawn over the pictures in the editor
\tif Engine.is_editor_hint():
\t\tqueue_redraw()

func _process(_delta: float) -> void:
\tif Engine.is_editor_hint() and position != _last:
\t\t_last = position
\t\tqueue_redraw()
\tapply()

## Pose what it drives for where the controller is now.
func apply() -> void:
\tif weight <= 0.0:
\t\treturn
\tvar cols := maxi(columns, 1)
\tvar rws := maxi(rows, 1)
\tvar u := 0.0
\tvar v := 0.0
\tif half.x > 0.0:
\t\tu = clampf((position.x - rest.x) / half.x, -1.0, 1.0)
\tif half.y > 0.0:
\t\tv = clampf((position.y - rest.y) / half.y, -1.0, 1.0)
\tvar fx := (u + 1.0) * 0.5 * float(cols - 1)
\tvar fy := (v + 1.0) * 0.5 * float(rws - 1)
\t_apply_poses(cols, rws, fx, fy)
\t_apply_looks(cols, rws, fx, fy)

func _apply_poses(cols: int, rws: int, fx: float, fy: float) -> void:
\tvar n := targets.size()
\tif n == 0 or poses.size() < cols * rws * n * 5:
\t\treturn
\tif _nodes.size() != n:
\t\t_nodes.clear()
\t\t_wrote.clear()
\t\t_base.clear()
\t\tfor p in targets:
\t\t\t_nodes.append(get_node_or_null(p))
\t\t\t_wrote.append(null)
\t\t\t_base.append(null)
\tvar fx0 := 0.5 * float(cols - 1)
\tvar fy0 := 0.5 * float(rws - 1)
\tfor i in n:
\t\tvar nd = _nodes[i]
\t\tif nd == null or i >= parts.size():
\t\t\tcontinue
\t\tvar pt: int = parts[i]
\t\tvar s := _sample(cols, rws, roundf(fx), roundf(fy), i, n) if pt & 16 else _sample(cols, rws, fx, fy, i, n)
\t\tif pt & 8:
\t\t\tvar c := _sample(cols, rws, fx0, fy0, i, n)
\t\t\tvar cur := [nd.position, nd.rotation, nd.scale]
\t\t\tvar b = _base[i]
\t\t\tvar w = _wrote[i]
\t\t\tif b == null:
\t\t\t\tb = cur.duplicate()
\t\t\telse:
\t\t\t\tif not cur[0].is_equal_approx(w[0]):
\t\t\t\t\tb[0] = cur[0]
\t\t\t\tif not is_equal_approx(cur[1], w[1]):
\t\t\t\t\tb[1] = cur[1]
\t\t\t\tif not cur[2].is_equal_approx(w[2]):
\t\t\t\t\tb[2] = cur[2]
\t\t\t_base[i] = b
\t\t\tif pt & 1:
\t\t\t\tnd.position = b[0] + Vector2(s[0] - c[0], s[1] - c[1]) * weight
\t\t\tif pt & 2:
\t\t\t\tnd.rotation = b[1] + wrapf(s[2] - c[2], -PI, PI) * weight
\t\t\tif pt & 4:
\t\t\t\tvar kx: float = s[3] / c[3] if absf(c[3]) > 0.00001 else 1.0
\t\t\t\tvar ky: float = s[4] / c[4] if absf(c[4]) > 0.00001 else 1.0
\t\t\t\tnd.scale = Vector2(b[2].x * lerpf(1.0, kx, weight), b[2].y * lerpf(1.0, ky, weight))
\t\t\t_wrote[i] = [nd.position, nd.rotation, nd.scale]
\t\t\tcontinue
\t\tif pt & 1:
\t\t\tnd.position = nd.position.lerp(Vector2(s[0], s[1]), weight)
\t\tif pt & 2:
\t\t\tnd.rotation = lerp_angle(nd.rotation, s[2], weight)
\t\tif pt & 4:
\t\t\tnd.scale = nd.scale.lerp(Vector2(s[3], s[4]), weight)

## The values of target i blended from the four spots around (fx, fy): [x, y, rotation, scale x, scale y].
func _sample(cols: int, rws: int, fx: float, fy: float, i: int, n: int) -> Array:
\tvar c0 := mini(int(floor(fx)), maxi(cols - 2, 0))
\tvar c1 := mini(c0 + 1, cols - 1)
\tvar r0 := mini(int(floor(fy)), maxi(rws - 2, 0))
\tvar r1 := mini(r0 + 1, rws - 1)
\tvar kx := fx - float(c0)
\tvar ky := fy - float(r0)
\tvar s := [r0 * cols + c0, r0 * cols + c1, r1 * cols + c0, r1 * cols + c1]
\tvar w := [(1.0 - kx) * (1.0 - ky), kx * (1.0 - ky), (1.0 - kx) * ky, kx * ky]
\tvar a0: float = poses[(s[0] * n + i) * 5 + 2]
\tvar out := [0.0, 0.0, a0, 0.0, 0.0]
\tfor k in 4:
\t\tvar b: int = (s[k] * n + i) * 5
\t\tout[0] += w[k] * poses[b]
\t\tout[1] += w[k] * poses[b + 1]
\t\tout[2] += w[k] * wrapf(poses[b + 2] - a0, -PI, PI)
\t\tout[3] += w[k] * poses[b + 3]
\t\tout[4] += w[k] * poses[b + 4]
\treturn out

func _apply_looks(cols: int, rws: int, fx: float, fy: float) -> void:
\tvar spot := clampi(roundi(fy), 0, rws - 1) * cols + clampi(roundi(fx), 0, cols - 1)
\tvar m := shows.size()
\tif m > 0 and show_states.size() >= cols * rws * m:
\t\tif _show_nodes.size() != m:
\t\t\t_show_nodes.clear()
\t\t\tfor p in shows:
\t\t\t\t_show_nodes.append(get_node_or_null(p))
\t\tfor j in m:
\t\t\tvar nd = _show_nodes[j]
\t\t\tif nd != null:
\t\t\t\tnd.visible = show_states[spot * m + j] == 1
\tvar fm := frame_nodes.size()
\tif fm > 0 and frame_states.size() >= cols * rws * fm:
\t\tif _frame_nodes.size() != fm:
\t\t\t_frame_nodes.clear()
\t\t\tfor p in frame_nodes:
\t\t\t\t_frame_nodes.append(get_node_or_null(p))
\t\tfor j in fm:
\t\t\tvar nd = _frame_nodes[j]
\t\t\tif nd != null and nd is Sprite2D:
\t\t\t\tvar fr: int = frame_states[spot * fm + j]
\t\t\t\tif fr >= 0 and fr < nd.hframes * nd.vframes and nd.frame != fr:
\t\t\t\t\tnd.frame = fr
\tvar k := fades.size()
\tif k > 0 and fade_states.size() >= cols * rws * k:
\t\tif _fade_nodes.size() != k:
\t\t\t_fade_nodes.clear()
\t\t\tfor p in fades:
\t\t\t\t_fade_nodes.append(get_node_or_null(p))
\t\tfor j in k:
\t\t\tvar nd = _fade_nodes[j]
\t\t\tvar a: float = fade_states[spot * k + j]
\t\t\tif nd != null and a >= 0.0 and j < fade_props.size():
\t\t\t\tvar col: Color = nd.get(fade_props[j])
\t\t\t\tcol.a = lerpf(col.a, a, weight)
\t\t\t\tnd.set(fade_props[j], col)

func _draw() -> void:
\tif not Engine.is_editor_hint():
\t\treturn
\tvar c := color
\tvar o := rest - position
\tif look == 1:
\t\tdraw_arc(o, half.x, 0.0, TAU, 64, c, 2.0)
\telif look == 2:
\t\tpass # moves freely: only its knob
\telif columns > 1 and rows > 1:
\t\tdraw_rect(Rect2(o - half, half * 2.0), c, false, 2.0)
\telif columns > 1:
\t\tdraw_line(o - Vector2(half.x, 0), o + Vector2(half.x, 0), c, 2.0)
\telse:
\t\tdraw_line(o - Vector2(0, half.y), o + Vector2(0, half.y), c, 2.0)
\tdraw_circle(Vector2.ZERO, 9.0, Color(1, 1, 1, 0.9))
\tdraw_circle(Vector2.ZERO, 7.0, c)
\tif label != "":
\t\tdraw_string(ThemeDB.fallback_font, o - half + Vector2(0, -6), label, HORIZONTAL_ALIGNMENT_LEFT, -1, 14, c)
`;
  async function build(screens, opt) {
    const G = await E.collect(screens, opt), fps = G.fps, base = opt.base || 'animation', warnings = new Set(G.warnings);
    if (opt.prog) opt.prog(0.75, 'Building the Godot scene…');
    const ext = [], subs = [], files = [], dir = U.slug(base); let resN = 0;
    // ---------- pictures: each layer's drawing frames on one sheet (a grid the Sprite2D steps through with "frame"),
    // and every sheet packed into atlas pages (one texture for many layers: fewer files, fewer draw calls)
    const sheets = new Map(); // nd.key → { cv, cols, rows, cw, ch, x0, y0, k, index: Map(frame → cell), page, ax, ay }
    function sheetOf(nd, pics) {
      if (sheets.has(nd.key)) return sheets.get(nd.key);
      pics = pics.slice().sort((a, b) => a.f - b.f); const k = Math.min(...pics.map(p => p.k));
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const p of pics) { x0 = Math.min(x0, p.x0); y0 = Math.min(y0, p.y0); x1 = Math.max(x1, p.x0 + p.w); y1 = Math.max(y1, p.y0 + p.h); }
      // a near-square grid; a sheet that would pass 4096 px is drawn smaller (Godot's textures stop at 16384, and big pages load slowly)
      const n = pics.length, w0 = Math.max(1, (x1 - x0) * k), h0 = Math.max(1, (y1 - y0) * k), cols = Math.max(1, Math.min(n, Math.round(Math.sqrt(n * h0 / w0)) || 1)), rows = Math.ceil(n / cols);
      const fit = Math.min(1, 4096 / (cols * w0), 4096 / (rows * h0)); let kk = k * fit; const cw = Math.max(1, Math.ceil((x1 - x0) * kk)), ch = Math.max(1, Math.ceil((y1 - y0) * kk));
      const cv = U.h('canvas', { width: cols * cw, height: rows * ch }), c = cv.getContext('2d'); if (nd.pixel) c.imageSmoothingEnabled = false;
      pics.forEach((p, i) => c.drawImage(p.cv, (i % cols) * cw + (p.x0 - x0) * kk, Math.floor(i / cols) * ch + (p.y0 - y0) * kk, p.w * kk, p.h * kk));
      const sh = { cv, cols, rows, cw, ch, x0, y0, k: kk, index: new Map(pics.map((p, i) => [p.f, i])) }; sheets.set(nd.key, sh); return sh;
    }
    const cellOf = (sh, f) => sh.index.has(f) ? sh.index.get(f) : 0;
    /** Pack the sheets into atlas pages (shelves, up to 4096 px); each page becomes one PNG and one Texture2D. */
    function packAtlas() {
      const list = [...sheets.values()].sort((a, b) => b.cv.height - a.cv.height), MAX = 4096, PAD = 2;
      const area = list.reduce((t, x) => t + (x.cv.width + PAD) * (x.cv.height + PAD), 0); let W = 256; while (W < MAX && W * W < area * 1.25) W *= 2; W = Math.min(MAX, Math.max(W, ...list.map(x => Math.min(MAX, x.cv.width + PAD))));
      const pages = []; let pg = null, sx = 0, sy = 0, sh = 0;
      for (const x of list) {
        const w = x.cv.width + PAD, h = x.cv.height + PAD;
        if (w > W || h > MAX) { pages.push({ w: x.cv.width, h: x.cv.height, items: [x] }); x.page = pages.length - 1; x.ax = 0; x.ay = 0; continue; } // too big to share: a page of its own
        if (pg && sx + w > W) { sy += sh; sx = 0; sh = 0; }
        if (!pg || sy + h > MAX) { pg = { w: W, h: 0, items: [] }; pages.push(pg); sx = 0; sy = 0; sh = 0; }
        x.page = pages.indexOf(pg); x.ax = sx; x.ay = sy; pg.items.push(x); sx += w; sh = Math.max(sh, h); pg.h = Math.max(pg.h, sy + h);
      }
      pages.forEach((P, i) => {
        const cv = U.h('canvas', { width: Math.max(1, P.w), height: Math.max(1, P.h) }), c = cv.getContext('2d'); P.items.forEach(x => c.drawImage(x.cv, x.ax, x.ay));
        const file = `sprites/${U.slug(base) || 'atlas'}-atlas${pages.length > 1 ? '-' + (i + 1) : ''}.png`, id = `${++resN}_atlas`;
        ext.push(`[ext_resource type="Texture2D" path=${q(file)} id=${q(id)}]`); files.push({ name: `${dir}/${file}`, data: G.png({ cv }) }); P.id = id;
      });
      return pages;
    }

    // ---------- the node tree (Godot draws children in order: back first)
    const rank = new Map(G.order.map((k, i) => [k, i])), kids = new Map(), byKey = G.byKey;
    const gnode = new Map(); // key → { name, type, parent (gnode), props: [], world(i, clip) }
    const root = { name: nodeName(base), type: 'Node2D', kids: [], path: '.', props: [] };
    const front = nd => { if (nd.kind === 'layer' || nd.kind === 'particles') return rank.get(nd.key) ?? 1e9; const ks = (kids.get(nd.key) || []).map(front); return ks.length ? Math.min(...ks) : -1; };
    for (const nd of G.nodes) { const p = nd.parent && byKey.has(nd.parent) ? nd.parent : null; if (!kids.has(p)) kids.set(p, []); kids.get(p).push(nd); }
    for (const [p, l] of kids) kids.set(p, l); // keep
    const sortBack = l => l.slice().sort((a, b) => front(b) - front(a)); // back first
    const childName = (parent, nm) => { const used = parent.used || (parent.used = new Set()); let n = nodeName(nm), i = 2; while (used.has(n)) n = `${nodeName(nm)} ${i++}`; used.add(n); return n; };
    const mk = (parent, nm, type, extra) => { const g = Object.assign({ name: childName(parent, nm), type, parent, kids: [], props: [] }, extra); parent.kids.push(g); g.path = parent === root ? g.name : `${parent.path}/${g.name}`; return g; };
    const maskOf = new Map(); for (const nd of G.nodes) if (nd.mask && nd.parent) maskOf.set(nd.parent, nd);

    function place(nd, parent) {
      if (nd.kind === 'joint') return; // bones are made under their skeleton
      const tr = c => c.tracks.get(nd.key);
      if (nd.kind === 'rig') {
        const sk = mk(parent, nd.name, 'Skeleton2D', { nd, world: (c, i) => tr(c) && tr(c).W[i] }); gnode.set(nd.key, sk);
        const joints = G.nodes.filter(j => j.kind === 'joint' && j.rig === nd.key);
        const addJ = (j, par) => { const g = mk(par, j.name, 'Bone2D', { nd: j, world: (c, i) => c.tracks.get(j.key) && c.tracks.get(j.key).W[i], bone: true }); gnode.set(j.key, g); joints.filter(x => x.parent === j.key).forEach(x => addJ(x, g)); };
        joints.filter(j => j.parent === nd.key).forEach(j => addJ(j, sk));
        return;
      }
      if (nd.kind === 'ctrl') { gnode.set(nd.key, mk(parent, nd.name, 'Node2D', { nd, world: (c, i) => tr(c) && tr(c).W[i] })); return; }
      if (nd.kind === 'group') {
        const g = mk(parent, nd.name, 'Node2D', { nd, world: (c, i) => tr(c) && tr(c).W[i] }); gnode.set(nd.key, g);
        const mask = maskOf.get(nd.key); let inner = g;
        if (mask && mask.pics.length) {
          const pic = mask.pics[0], msh = sheetOf(mask, [pic]), off = new DOMMatrix().translateSelf(msh.x0, msh.y0).scaleSelf(1 / msh.k, 1 / msh.k);
          inner = mk(g, mask.name, 'Sprite2D', { nd: mask, world: (c, i) => c.tracks.get(mask.key) && c.tracks.get(mask.key).W[i] && c.tracks.get(mask.key).W[i].multiply(off), alpha: true, self: true });
          inner.sheet = msh; inner.props.push('centered = false', `clip_children = ${mask.mask.visible ? 2 : 1}`); gnode.set(mask.key, inner);
        }
        for (const c of sortBack(kids.get(nd.key) || [])) if (c !== mask) place(c, inner);
        return;
      }
      if (nd.kind === 'particles') { const g = mk(parent, nd.name, 'CPUParticles2D', { nd, world: (c, i) => tr(c) && tr(c).W[i], alpha: true }); gnode.set(nd.key, g); g.props.push(...particleProps(nd)); return; }
      if (nd.kind !== 'layer' || nd.mask || !nd.pics.length) return;
      if (nd.skin) {
        const s = nd.skin, pic = s.pic, g = mk(parent, nd.name, 'Polygon2D', { nd, world: (c, i) => tr(c) && tr(c).W[i] && g.carry(c, i), alpha: true, skinned: s });
        // Godot bends a polygon in its skeleton's space, so the polygon itself moves along when the whole rig moves
        g.carry = (c, i) => { const sk = gnode.get(G.byKey.get(s.joints[0]).rig), W = sk && sk.world(c, i); return W && g.restInv ? W.multiply(g.restInv).multiply(s.M0) : s.M0; };
        const ssh = sheetOf(nd, [pic]); g.skinSheet = ssh; // its UVs point into the atlas page (known once the atlas is packed)
        g.props.push(`polygon = PackedVector2Array(${s.verts.map(([x, y]) => `${f(x)}, ${f(y)}`).join(', ')})`,
          () => `uv = PackedVector2Array(${s.verts.map(([x, y]) => `${f(ssh.ax + (x - ssh.x0) * ssh.k)}, ${f(ssh.ay + (y - ssh.y0) * ssh.k)}`).join(', ')})`,
          `polygons = [${chunk(s.tris, 3).map(t => `PackedInt32Array(${t.join(', ')})`).join(', ')}]`);
        gnode.set(nd.key, g); return;
      }
      const g = mk(parent, nd.name, 'Node2D', { nd, world: (c, i) => tr(c) && tr(c).W[i], alpha: true }); gnode.set(nd.key, g);
      // one Sprite2D: its frames are cells of the layer's sheet, picked by "frame" (hframes × vframes inside its atlas region)
      const sh = sheetOf(nd, nd.pics), sp = mk(g, 'Picture', 'Sprite2D'); g.pic = sp; g.sheet = sh;
      if (nd.pixel) sp.props.push('texture_filter = 1'); // nearest: the pixels stay sharp
      sp.props.push('centered = false', `position = Vector2(${f(sh.x0)}, ${f(sh.y0)})`, `scale = Vector2(${f(1 / sh.k)}, ${f(1 / sh.k)})`);
    }
    /** A particles layer as a CPUParticles2D: Godot's 2D space is the stage's (px, y down), so speeds, gravity and sizes carry over. */
    function particleProps(nd) {
      const v = nd.ps, n = ++resN, burst = v.emit === 'burst', life = Math.max(0.05, v.life), sp0 = v.ptShape === 'pictures' ? SB.particles.strip(v.ptSrc) : null, shape = sp0 ? 'pictures' : v.ptShape === 'pictures' ? 'circle' : v.ptShape || 'circle', TEX = sp0 ? sp0.size : 64;
      const tex = sp0 ? 'ptex_pic_' + n : 'ptex_' + shape; if (v.ptShape === 'pictures' && !sp0) warnings.add('Particles with pictures from a layer that has nothing drawn (exported as dots)');
      if (sp0) { const file = `sprites/${U.slug(nd.name) || 'particles'}-pictures.png`; ext.push(`[ext_resource type="Texture2D" path=${q(file)} id=${q(tex)}]`); files.push({ name: `${dir}/${file}`, data: G.png({ cv: sp0.cv }) }); }
      else if (!ext.some(x => x.includes(`id="${tex}"`))) { const file = `sprites/particle-${shape}.png`; ext.push(`[ext_resource type="Texture2D" path=${q(file)} id=${q(tex)}]`); files.push({ name: `${dir}/${file}`, data: G.png({ cv: SB.particles.picture(shape, TEX) }) }); }
      const col = c => { const [r, g, b] = U.hexRgb(c || '#ffffff'); return [r / 255, g / 255, b / 255]; }, C = (c, a) => col(c).map(f).concat(f(a)).join(', ');
      const fadeA = v.fade !== false ? [1, 1, 0] : [1, 1, 1], life2 = v.colorMode !== 'random' && !sp0; if (sp0) v.color = v.color2 = '#ffffff'; // pictures keep their own colors
      subs.push(`[sub_resource type="Gradient" id="ptc_${n}_ramp"]`, 'offsets = PackedFloat32Array(0, 0.6, 1)', `colors = PackedColorArray(${[0, 1, 2].map(i => life2 ? C(U.lerpColor(v.color, v.color2, [0, 0.6, 1][i]), fadeA[i]) : C('#ffffff', fadeA[i])).join(', ')})`, '');
      if (!life2 && !sp0) subs.push(`[sub_resource type="Gradient" id="ptc_${n}_first"]`, 'offsets = PackedFloat32Array(0, 1)', `colors = PackedColorArray(${C(v.color, 1)}, ${C(v.color2, 1)})`, '');
      const se = Math.max(0, v.sizeEnd ?? 1); subs.push(`[sub_resource type="Curve" id="ptc_${n}_size"]`, `max_value = ${fl(Math.max(1, se))}`, `_data = [Vector2(0, 1), 0.0, ${fl(se - 1)}, 0, 1, Vector2(1, ${fl(se)}), ${fl(se - 1)}, 0.0, 1, 0]`, 'point_count = 2', '');
      if (v.ptGlow || sp0) subs.push(`[sub_resource type="CanvasItemMaterial" id="ptc_${n}_add"]`, ...(v.ptGlow ? ['blend_mode = 1'] : []), ...(sp0 ? ['particles_animation = true', `particles_anim_h_frames = ${sp0.n}`, 'particles_anim_v_frames = 1', 'particles_anim_loop = false'] : []), ''); // glow: added light; pictures: frames of the strip
      const d = (v.ptDir || 0) * Math.PI / 180, sp = v.ptSpeed || 0, sv = U.clamp(v.speedVar ?? 0, 0, 1), sMin = (v.sizeMin ?? 8) / TEX, sMax = (v.sizeMax ?? 22) / TEX;
      if (burst && v.repeat !== false && Math.abs((v.every || life) - life) > 0.05) warnings.add('Particle bursts in Godot repeat every Life seconds (Godot has no separate repeat time)');
      return [...(v.ptGlow || sp0 ? [`material = SubResource("ptc_${n}_add")`] : []), ...(sp0 ? (v.ptPick === 'life' ? ['anim_speed_min = 1.0', 'anim_speed_max = 1.0'] : ['anim_offset_min = 0.0', 'anim_offset_max = 1.0']) : []), // random picture, or all of them in order over each one's life
        `amount = ${Math.max(1, Math.min(3000, Math.round(burst ? v.count : v.rate * life)))}`, `lifetime = ${fl(life)}`, ...(burst ? ['explosiveness = 1.0', ...(v.repeat === false ? ['one_shot = true'] : [])] : v.prewarm !== false ? [`preprocess = ${fl(life)}`] : []),
        `lifetime_randomness = ${fl(U.clamp(v.lifeVar ?? 0, 0, 0.95))}`, (v.ptSpace === 'world' ? 'local_coords = false' : 'local_coords = true'), `texture = ExtResource(${q(tex)})`,
        ...(v.area > 0 ? ['emission_shape = 1', `emission_sphere_radius = ${fl(v.area / 2)}`] : []),
        ...(shape === 'spark' ? ['particle_flag_align_y = true'] : []),
        `direction = Vector2(${f(Math.cos(d))}, ${f(Math.sin(d))})`, `spread = ${fl(U.clamp(v.ptSpread || 0, 0, 180))}`, `gravity = Vector2(0, ${fl(v.ptGravity || 0)})`,
        `initial_velocity_min = ${fl(sp * (1 - sv))}`, `initial_velocity_max = ${fl(sp * (1 + sv))}`,
        ...(v.drag > 0 ? [`damping_min = ${fl(v.drag * sp * 0.5)}`, `damping_max = ${fl(v.drag * sp * 0.5)}`] : []), // Godot slows them by a fixed amount a second (Toonzi: a share of their speed)
        ...(sp0 && !(v.spin > 0) ? [] : ['angle_min = -180.0', 'angle_max = 180.0']), ...(v.spin > 0 ? [`angular_velocity_min = ${fl(-v.spin)}`, `angular_velocity_max = ${fl(v.spin)}`] : []),
        `scale_amount_min = ${fl(sMin)}`, `scale_amount_max = ${fl(sMax)}`, `scale_amount_curve = SubResource("ptc_${n}_size")`,
        `color_ramp = SubResource("ptc_${n}_ramp")`, ...(!life2 && !sp0 ? [`color_initial_ramp = SubResource("ptc_${n}_first")`] : [])];
    }
    const chunk = (a, n) => { const out = []; for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n)); return out; };
    for (const nd of sortBack(kids.get(null) || [])) place(nd, root);
    const all = []; (function w(g) { for (const c of g.kids) { all.push(c); w(c); } })(root);
    const relPath = (from, to) => { const a = from.path === '.' ? [] : from.path.split('/'), b = to.path === '.' ? [] : to.path.split('/'); let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++; return [...a.slice(i).map(() => '..'), ...b.slice(i)].join('/') || '.'; };

    // ---------- per frame local values
    const c0 = G.clips[0];
    const firstWorld = g => { for (const c of G.clips) for (let i = 0; i < c.n; i++) { const W = g.world(c, i); if (W) return W; } return null; };
    const worldOf = (g, c, i) => g === root || !g ? new DOMMatrix() : g.world ? g.world(c, i) || firstWorld(g) : worldOf(g.parent, c, i);
    const localAt = (g, c, i) => { const W = g.world(c, i); if (!W) return null; const P = worldOf(g.parent, c, i) || new DOMMatrix(); return B.decompose(E.local(W, P)); };

    // bones: rest = local pose where the first bending layer was bound (or the start)
    const skins = all.filter(g => g.skinned);
    const restW = new Map(), restWorld = g => { // where each bone was when the layers were bound (or at the start)
      if (restW.has(g)) return restW.get(g); let W = null;
      if (g.bone) for (const s of skins) { const ji = s.skinned.joints.indexOf(g.nd.key); if (ji >= 0) { W = s.skinned.binds[ji]; break; } }
      if (!W) W = g.bone ? E.local(firstWorld(g), worldOf(g.parent, c0, 0)) && restWorld(g.parent).multiply(E.local(firstWorld(g), worldOf(g.parent, c0, 0))) : worldOf(g, c0, 0) || new DOMMatrix();
      restW.set(g, W); return W;
    };
    for (const g of all) if (g.bone) {
      g.rest = E.local(restWorld(g), restWorld(g.parent));
      g.props.push(`rest = ${T2(g.rest)}`, 'auto_calculate_length_and_angle = false', `length = ${f(Math.max(1, g.nd.len || 10))}`, 'bone_angle = 0.0');
    }

    // riding layers: a RemoteTransform2D on the bone when the layer keeps the same place on it the whole time
    for (const g of all) {
      const nd = g.nd; if (!nd || !nd.follow || g.skinned) continue; const bone = gnode.get(nd.follow); if (!bone) continue;
      let rel0 = null, ok = true;
      for (const c of G.clips) for (let i = 0; i < c.n && ok; i++) { const W = g.world(c, i), Wb = bone.world(c, i); if (!W || !Wb) continue; const rel = Wb.inverse().multiply(W); if (!rel0) rel0 = rel; else if (['a', 'b', 'c', 'd'].some(k => Math.abs(rel[k] - rel0[k]) > 1e-3) || Math.abs(rel.e - rel0.e) > 0.05 || Math.abs(rel.f - rel0.f) > 0.05) ok = false; }
      if (!ok || !rel0) continue;
      const rt = mk(bone, `${nd.name} (rides here)`, 'RemoteTransform2D'), d = B.decompose(rel0);
      rt.props.push(`position = Vector2(${f(d.x)}, ${f(d.y)})`, `rotation = ${f(d.rot * Math.PI / 180)}`, `scale = Vector2(${f(d.sx)}, ${f(d.sy)})`, `remote_path = NodePath(${q(relPath(rt, g))})`);
      g.ridden = true;
    }
    // skinned polygons: skeleton and weights
    for (const g of skins) {
      const s = g.skinned, rigKey = byKey.get(s.joints[0]).rig, sk = gnode.get(rigKey); if (!sk) continue;
      g.restInv = restWorld(sk).inverse();
      g.props.push(`skeleton = NodePath(${q(relPath(g, sk))})`);
      const nv = s.verts.length, bones = s.joints.map((jk, ji) => { const w = new Array(nv).fill(0); s.weights.forEach((list, vi) => list.forEach(([j, x]) => { if (j === ji) w[vi] = x; })); return `NodePath(${q(relPath(sk, gnode.get(jk)))}), PackedFloat32Array(${w.map(f).join(', ')})`; });
      g.props.push(`bones = [${bones.join(', ')}]`);
    }

    // ---------- starting values (the first screen's first frame) and the animations
    const animated = all.filter(g => g.world);
    const L0 = new Map(animated.map(g => { let l = null; for (const c of G.clips.filter(c => !c.pose).concat(G.clips.filter(c => c.pose))) { for (let i = 0; i < c.n && !l; i++) l = localAt(g, c, i); if (l) break; } return [g, l]; }));
    for (const g of animated) { const l = L0.get(g); if (!l || g.ridden) continue; g.props.unshift(`position = Vector2(${f(l.x)}, ${f(l.y)})`, `rotation = ${f(l.rot * Math.PI / 180)}`, `scale = Vector2(${f(l.sx)}, ${f(l.sy)})`); }
    const anims = [], used = new Set();
    const tracks = [], key = (path, prop) => `${path}:${prop}`;
    // which properties move in any screen: those get keys in every animation, so switching animations never leaves a value behind
    const props = new Map(); // g → Set('position'|'rotation'|'scale'|'visible'|'modulate'|'frames')
    const series = new Map(); // `${clipIndex}` → Map(g → { L: [], vis: [], a: [], fi: [] })
    G.clips.forEach((c, ci) => {
      const m = new Map(); series.set(ci, m);
      for (const g of animated) {
        const tr = c.tracks.get(g.nd.key), L = [], vis = [], a = [], fi = [];
        for (let i = 0; i < c.n; i++) { L.push(g.ridden ? null : localAt(g, c, i)); vis.push(!!(tr && tr.on[i])); a.push(tr ? U.clamp(tr.a[i] || 0, 0, 1) : 0); fi.push(tr ? tr.fi[i] || 0 : 0); }
        m.set(g, { L: E.filled(L), vis, a, fi, here: !!tr });
        const P = props.get(g) || new Set(); props.set(g, P);
        if (c.pose) continue; // pose grids live in their controller; the controllers stay free to move while an animation plays
        const L0g = L0.get(g), Lf = E.filled(L);
        if (L0g && Lf[0]) { if (Lf.some(l => Math.abs(l.x - L0g.x) > 0.01 || Math.abs(l.y - L0g.y) > 0.01)) P.add('position'); if (Lf.some(l => Math.abs(l.rot - L0g.rot) > 0.01)) P.add('rotation'); if (Lf.some(l => Math.abs(l.sx - L0g.sx) > 1e-4 || Math.abs(l.sy - L0g.sy) > 1e-4)) P.add('scale'); }
        if (g.alpha || g.nd.kind === 'layer') { if (vis.some(v => !v)) P.add('visible'); if (a.some((x, i) => vis[i] && Math.abs(x - 1) > 0.004)) P.add('modulate'); }
        if (g.sheet && g.sheet.index.size > 1 && (new Set(fi).size > 1 || (tr && tr.fev))) P.add('frames');
      }
    });
    const vec = (x, y) => `Vector2(${f(x)}, ${f(y)})`;
    function valueTrack(path, prop, times, values, discrete) {
      tracks.push({ path: `${path}:${prop}`, interp: discrete ? 0 : 1, update: discrete ? 1 : 0, times, values });
    }
    function animOf(c, ci) {
      tracks.length = 0; const m = series.get(ci), times = i => f(i / fps), lastT = c.n / fps;
      for (const g of animated) {
        if (c.pose && g.nd && g.nd.kind === 'ctrl') continue; // a pose never moves the controllers
        const P = props.get(g), s = m.get(g); if (!P.size) continue;
        const base = L0.get(g) || { x: 0, y: 0, rot: 0, sx: 1, sy: 1 }, L = s.L.map(l => l || base), end = arr => arr.concat([arr[arr.length - 1]]); // a last key at the end holds the value
        const keep = vals => B.simplify(vals, 0.01);
        if (P.has('position')) { const v = end(L.map(l => [l.x, l.y])), k = keep(v); valueTrack(g.path, 'position', k.map(i => f(Math.min(i, c.n) / fps)), k.map(i => vec(...v[i]))); }
        if (P.has('rotation')) { const r = end(B.unwrap(L.map(l => l.rot))).map(x => [x]), k = keep(r); valueTrack(g.path, 'rotation', k.map(i => f(i / fps)), k.map(i => fl(r[i][0] * Math.PI / 180))); }
        if (P.has('scale')) { const v = end(L.map(l => [l.sx * 100, l.sy * 100])), k = keep(v); valueTrack(g.path, 'scale', k.map(i => f(i / fps)), k.map(i => vec(v[i][0] / 100, v[i][1] / 100))); }
        if (P.has('visible')) { const k = s.vis.map((v, i) => i).filter(i => i === 0 || s.vis[i] !== s.vis[i - 1]); valueTrack(g.path, 'visible', k.map(times), k.map(i => s.vis[i] ? 'true' : 'false'), true); }
        if (P.has('modulate')) { const v = end(s.a.map(x => [x * 100])), k = keep(v); valueTrack(g.path, g.self ? 'self_modulate' : 'modulate', k.map(i => f(i / fps)), k.map(i => `Color(1, 1, 1, ${f(v[i][0] / 100)})`)); }
        if (P.has('frames')) { const ks = E.picKeys(c.tracks.get(g.nd.key), c.n, fps); valueTrack(g.pic.path, 'frame', ks.map(x => f(x[0])), ks.map(x => String(cellOf(g.sheet, x[1]))), true); } // morph in-betweens at their own moments
      }
      let nm = animName(c.name), i = 2; while (used.has(nm)) nm = `${animName(c.name)} ${i++}`; used.add(nm);
      const lines = [`resource_name = ${q(nm)}`, `length = ${f(lastT)}`, 'loop_mode = 1', `step = ${f(1 / fps)}`];
      tracks.forEach((t, k) => lines.push(`tracks/${k}/type = "value"`, `tracks/${k}/imported = false`, `tracks/${k}/enabled = true`, `tracks/${k}/path = NodePath(${q(t.path)})`, `tracks/${k}/interp = ${t.interp}`, `tracks/${k}/loop_wrap = true`,
        `tracks/${k}/keys = {\n"times": PackedFloat32Array(${t.times.join(', ')}),\n"transitions": PackedFloat32Array(${t.times.map(() => '1').join(', ')}),\n"update": ${t.update},\n"values": [${t.values.join(', ')}]\n}`));
      return { nm, lines };
    }
    G.clips.forEach((c, ci) => { if (!c.pose) anims.push(animOf(c, ci)); }); // controller poses go to their controller, not to the AnimationPlayer
    // controllers that drive something: a script that blends their grid of poses (in the editor and in the game)
    G.clips.forEach((c, ci) => {
      if (!c.pose) return; const g = gnode.get(c.pose.key); if (!g) return; const l = L0.get(g) || { x: 0, y: 0 }, PW = worldOf(g.parent, c0, 0), ps = Math.hypot(PW.a, PW.b) || 1, ser = series.get(ci);
      const targets = [], parts = [], vals = [], owner = t => t.nd && (t.nd.o || (t.nd.rig && G.byKey.get(t.nd.rig) && G.byKey.get(t.nd.rig).o)), flags = t => { const o = owner(t), P = c.pose; return (o ? ((P.addIds || []).includes(o.id) ? 8 : 0) : (P.add ? 8 : 0)) | (o && (P.snapIds || []).includes(o.id) ? 16 : 0); };
      for (const t of animated) {
        if (t === g || !t.nd || t.nd.kind === 'ctrl' || t.ridden || t.skinned) continue; const s0 = ser.get(t), Ls = s0 && s0.L; if (!Ls || !Ls[0]) continue;
        const a = Ls[0], pr = (Ls.some(x => Math.abs(x.x - a.x) > 0.01 || Math.abs(x.y - a.y) > 0.01) ? 1 : 0) | (Ls.some(x => Math.abs(((x.rot - a.rot + 540) % 360) - 180) > 0.01) ? 2 : 0) | (Ls.some(x => Math.abs(x.sx - a.sx) > 1e-4 || Math.abs(x.sy - a.sy) > 1e-4) ? 4 : 0);
        if (pr) { targets.push(t); parts.push(pr | flags(t)); }
      }
      for (let i = 0; i < c.n; i++) for (const t of targets) { const x = ser.get(t).L[i]; vals.push(f(x.x), f(x.y), f(x.rot * Math.PI / 180), f(x.sx), f(x.sy)); }
      // drawings it switches: frames and layers shown or hidden, layers fading (they take the nearest spot)
      const shows = [], showVals = [], fades = [], fadeVals = [], frs = [], frVals = [];
      for (const t of animated) {
        if (t === g || !t.nd || t.nd.kind === 'ctrl') continue; const v = ser.get(t); if (!v || !v.here) continue;
        if ((t.alpha || t.nd.kind === 'layer') && v.vis.some(x => x !== v.vis[0])) shows.push({ path: relPath(g, t), on: i => v.vis[i] });
        if ((t.alpha || t.nd.kind === 'layer') && v.a.some((x, i) => v.vis[i] && Math.abs(x - v.a[0]) > 0.004)) fades.push({ path: relPath(g, t), prop: t.self ? 'self_modulate' : 'modulate', a: i => v.vis[i] ? v.a[i] : -1 });
        if (t.sheet && t.sheet.index.size > 1 && new Set(v.fi.filter((x, i) => v.vis[i])).size > 1) frs.push({ path: relPath(g, t.pic), at: i => cellOf(t.sheet, v.fi[i]) });
      }
      for (let i = 0; i < c.n; i++) { shows.forEach(S => showVals.push(S.on(i) ? 1 : 0)); fades.forEach(F => fadeVals.push(f(F.a(i)))); frs.forEach(F => frVals.push(F.at(i))); }
      if (!targets.length && !shows.length && !fades.length && !frs.length) return;
      if (!ext.some(x => x.includes('id="ctrl_script"'))) { ext.push('[ext_resource type="Script" path="storyboard_controller.gd" id="ctrl_script"]'); files.push({ name: `${dir}/storyboard_controller.gd`, data: new TextEncoder().encode(CTRL_GD) }); }
      const paths = list => `[${list.map(x => `NodePath(${q(x.path)})`).join(', ')}]`;
      g.props.push('script = ExtResource("ctrl_script")', `targets = [${targets.map(t => `NodePath(${q(relPath(g, t))})`).join(', ')}]`, `parts = PackedInt32Array(${parts.join(', ')})`, `poses = PackedFloat32Array(${vals.join(', ')})`,
        `shows = ${paths(shows)}`, `show_states = PackedByteArray(${showVals.join(', ')})`, `fades = ${paths(fades)}`, `fade_props = PackedStringArray(${fades.map(F => q(F.prop)).join(', ')})`, `fade_states = PackedFloat32Array(${fadeVals.join(', ')})`,
        `frame_nodes = ${paths(frs)}`, `frame_states = PackedInt32Array(${frVals.join(', ')})`,
        `columns = ${c.pose.nx}`, `rows = ${c.pose.ny}`, `half = Vector2(${f(c.pose.rw / ps)}, ${f(c.pose.rh / ps)})`, `rest = Vector2(${f(l.x)}, ${f(l.y)})`);
    });
    // every controller shows in the editor (its knob and its box, line or circle), even one that drives nothing
    for (const g of animated) {
      if (!g.nd || g.nd.kind !== 'ctrl' || g.props.some(x => typeof x === 'string' && x.startsWith('script ='))) continue; const c = g.nd.o, l = L0.get(g) || { x: 0, y: 0 }, PW = worldOf(g.parent, c0, 0), ps = Math.hypot(PW.a, PW.b) || 1;
      const mo = c.ctype === 'custom' && c.lock ? c.lock : c.ctype || 'xy', rw = (c.rw ?? c.range ?? 100) / ps, rh = (c.rh ?? c.range ?? 100) / ps;
      if (!ext.some(x => x.includes('id="ctrl_script"'))) { ext.push('[ext_resource type="Script" path="storyboard_controller.gd" id="ctrl_script"]'); files.push({ name: `${dir}/storyboard_controller.gd`, data: new TextEncoder().encode(CTRL_GD) }); }
      g.props.push('script = ExtResource("ctrl_script")', `columns = ${mo === 'y' ? 1 : 9}`, `rows = ${mo === 'x' ? 1 : 9}`, `half = Vector2(${f(rw)}, ${f(rh)})`, `rest = Vector2(${f((c.rx ?? l.x))}, ${f((c.ry ?? l.y))})`, 'weight = 0.0');
    }
    // how each controller looks in the editor
    for (const g of animated) if (g.nd && g.nd.kind === 'ctrl') { const c = g.nd.o, mo = c.ctype === 'custom' && c.lock ? c.lock : c.ctype || 'xy', col = B.rgba(c.color || '#FF8A1F');
      g.props.push(`look = ${mo === 'free' ? 2 : c.ctype === 'custom' && c.cshape === 'circle' && mo !== 'x' && mo !== 'y' ? 1 : 0}`, `color = Color(${f(col[0])}, ${f(col[1])}, ${f(col[2])}, 0.95)`, `label = ${q(c.label || c.name)}`); }
    // RESET: the starting pose, so Godot can restore it
    const reset = (() => { tracks.length = 0; for (const g of animated) { const P = props.get(g); if (!P.size) continue; const l = L0.get(g) || { x: 0, y: 0, rot: 0, sx: 1, sy: 1 }, s = series.get(0).get(g);
      if (P.has('position')) valueTrack(g.path, 'position', ['0'], [vec(l.x, l.y)]); if (P.has('rotation')) valueTrack(g.path, 'rotation', ['0'], [fl(l.rot * Math.PI / 180)]); if (P.has('scale')) valueTrack(g.path, 'scale', ['0'], [vec(l.sx, l.sy)]);
      if (P.has('visible')) valueTrack(g.path, 'visible', ['0'], [s.vis[0] ? 'true' : 'false'], true); if (P.has('modulate')) valueTrack(g.path, g.self ? 'self_modulate' : 'modulate', ['0'], [`Color(1, 1, 1, ${f(s.a[0])})`]);
      if (P.has('frames')) valueTrack(g.pic.path, 'frame', ['0'], [String(cellOf(g.sheet, s.fi[0]))], true); }
      const lines = ['resource_name = "RESET"', 'length = 0.001'];
      tracks.forEach((t, k) => lines.push(`tracks/${k}/type = "value"`, `tracks/${k}/imported = false`, `tracks/${k}/enabled = true`, `tracks/${k}/path = NodePath(${q(t.path)})`, `tracks/${k}/interp = 1`, `tracks/${k}/loop_wrap = true`,
        `tracks/${k}/keys = {\n"times": PackedFloat32Array(0),\n"transitions": PackedFloat32Array(1),\n"update": ${t.update},\n"values": [${t.values.join(', ')}]\n}`));
      return { nm: 'RESET', lines }; })();
    // starting visibility of frames and layers
    for (const g of animated) { const s = series.get(0).get(g); if (!s.here) g.props.push('visible = false'); else if (!s.vis[0] && (g.alpha || g.nd.kind === 'layer')) g.props.push('visible = false');
      if (s.here && s.vis[0] && Math.abs(s.a[0] - 1) > 0.004) g.props.push(`${g.self ? 'self_modulate' : 'modulate'} = Color(1, 1, 1, ${f(s.a[0])})`);
      if (g.pic && g.sheet.index.size > 1) g.pic.props.push(`frame = ${cellOf(g.sheet, s.here ? s.fi[0] : [...g.sheet.index.keys()][0])}`); }

    // ---------- the atlas, and each picture's place in it
    const pages = packAtlas();
    for (const g of all) {
      const sh = g.sheet || g.skinSheet; if (!sh) continue; const tex = `texture = ExtResource(${q(pages[sh.page].id)})`;
      if (g.skinSheet) { g.props.unshift(tex); continue; }
      const sp = g.pic || g; sp.props.unshift(tex, 'region_enabled = true', `region_rect = Rect2(${sh.ax}, ${sh.ay}, ${sh.cols * sh.cw}, ${sh.rows * sh.ch})`, ...(sh.cols > 1 ? [`hframes = ${sh.cols}`] : []), ...(sh.rows > 1 ? [`vframes = ${sh.rows}`] : []));
    }
    // ---------- the file
    const out = [`[gd_scene load_steps=${ext.length + anims.length + subs.filter(l => l.startsWith('[sub_resource')).length + 3} format=3]`, ''];
    ext.forEach(l => out.push(l)); out.push(''); subs.forEach(l => out.push(l)); // particle colors, sizes, glow
    [reset, ...anims].forEach((a, k) => { out.push(`[sub_resource type="Animation" id="Animation_${k}"]`, ...a.lines, ''); });
    out.push('[sub_resource type="AnimationLibrary" id="AnimationLibrary_main"]', `_data = {\n${[reset, ...anims].map((a, k) => `${q(a.nm)}: SubResource("Animation_${k}")`).join(',\n')}\n}`, '');
    out.push(`[node name=${q(root.name)} type="Node2D"]`, '');
    const every = []; (function w(g) { for (const c of g.kids) { every.push(c); w(c); } })(root);
    for (const g of every) { const par = g.parent === root ? '.' : g.parent.path; out.push(`[node name=${q(g.name)} type=${q(g.type)} parent=${q(par)}]`, ...g.props.map(x => typeof x === 'function' ? x() : x), ''); }
    out.push('[node name="AnimationPlayer" type="AnimationPlayer" parent="."]', `libraries = {\n"": SubResource("AnimationLibrary_main")\n}`, `autoplay = ${q(anims[0].nm)}`, '');
    files.unshift({ name: `${dir}/${dir}.tscn`, data: new TextEncoder().encode(out.join('\n')) });
    files.push({ name: `${dir}/README.txt`, data: new TextEncoder().encode(readme(base, anims.map(a => a.nm), G)) });
    return { files, warnings: [...warnings], baked: G.baked, still: G.still, project: { own: [dir], files: files.map(f => ({ path: f.name, data: f.data })) } }; // project: for writing straight into a Godot project (js/io/gamelink.js)
  }
  const readme = (base, names, G) => `${base}: exported from Toonzi 2D for Godot 4.

Copy the folder "${U.slug(base)}" into your Godot project and open ${U.slug(base)}.tscn.
Animations (AnimationPlayer): ${names.join(', ')}. RESET holds the starting pose.
${G.nodes.some(n => n.kind === 'rig') ? 'Bones are Skeleton2D / Bone2D. Bending layers are Polygon2D skinned to them; layers that ride on a bone are moved by a RemoteTransform2D on that bone.\n' : ''}${G.nodes.some(n => n.kind === 'ctrl') ? 'Controllers are empty Node2D nodes. The ones that drive something have a script: move them (drag them in the editor,\nanimate them, or set their position from code, also in the game) and the rig follows, like in Toonzi 2D. Their box shows in the editor only.\n' : ''}Play an animation from a script: $AnimationPlayer.play("${names[0]}")
`;
  SB.godot = { build };
})(window.SB);
