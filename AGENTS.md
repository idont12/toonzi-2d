# Toonzi 2D for AI assistants

You are an AI (Claude, ChatGPT, Gemini, Copilot, a coding agent…) and someone asked you to **make an animation with Toonzi 2D**. This file is everything you need: how to run or copy the app, how to write an animation it opens, how to check it, how to hand it back so the person can keep editing, and rules for choosing the right tool (groups, rigs, controllers, pixel art, frame by frame…).

- Editor (public): https://idont12.github.io/toonzi-2d/
- Docs for people: https://idont12.github.io/toonzi-2d/docs/
- Code: https://github.com/idont12/toonzi-2d (plain HTML/CSS/JS, no build step)

## The deal in one minute

1. Plan the animation (see [Rules for making an animation](#rules-for-making-an-animation)).
2. Write it as one JSON file (the [project format](#the-project-format)). Leave out anything you don't need: the editor fills ids and defaults.
3. Check it: `node tools/toonzi.mjs check my.json` (needs only Node 18+).
4. Look at it: `node tools/toonzi.mjs preview my.json` writes a PNG strip of five moments (needs Playwright). Fix what looks wrong.
5. **Give the person the editor with the animation in it**:
   - a link: `node tools/toonzi.mjs link my.json` → `https://idont12.github.io/toonzi-2d/#project=…` (the whole project is packed into the link, nothing is uploaded), and/or
   - a file: `node tools/toonzi.mjs editor my.json` → `my-editor.html`, the full editor in one page that works offline.
   Also give them `my.json` (Logo menu › Open project in the editor).
6. The person plays it, changes things in the editor, and asks you for more. They send you back **Logo menu › Copy a link to this animation** (or a saved `.json`). Read it with `node tools/toonzi.mjs unlink "<link>" my.json`, change it, and send a new link. Never throw away their edits: start from what they sent.

No Node or shell? You can still write the JSON (steps 2 and 5). Tell the person to open https://idont12.github.io/toonzi-2d/, then Logo menu › Open project, and pick the file. If you can't make files either, give the JSON in a code block and tell them to save it as `animation.json`.

## Run or copy the app yourself

The app is static files. Anything that serves a folder works:

```sh
git clone https://github.com/idont12/toonzi-2d.git && cd toonzi-2d
node tools/toonzi.mjs serve 8080        # or: python3 -m http.server 8080
# open http://localhost:8080/            (add ?nostart to skip the start dialogs)
```

- Your own public copy: fork the repo on GitHub, then Settings › Pages › Deploy from branch `main`, folder `/`. Make links for your copy with `node tools/toonzi.mjs link my.json --base https://<you>.github.io/toonzi-2d/`.
- Open a project from your server: `http://localhost:8080/?open=animations/my.json` (any URL the page can fetch).
- Drive the editor from a script (Playwright, Puppeteer): wait for `window.SB && SB.ready`, then
  `await SB.project.openData(SB.project.prepare(json))` opens a project, `await SB.project.pack()` returns the current one as JSON,
  `await SB.project.link()` returns a link to it, `SB.state.time = 1.5; SB.bump()` moves the playhead.
  The editor's own source is the reference for anything not listed here (`js/` — every file starts with a comment that explains it).

## The project format

```jsonc
{
  "app": "toonzi",                      // optional
  "name": "Robot says hi",
  "project": {                          // the screen
    "w": 1280, "h": 720,                // size in px (1920×1080 by default)
    "fps": 24, "duration": 4,           // frames a second (1–240), length in seconds
    "bg": "#E8F4FF",                    // background color
    "target": "video",                  // what it's for: "video" (default), "web" (interactive), "game", "blender"
    "pixel": { "on": true, "w": 160 }   // optional: a pixel art screen 160 pixels across
  },
  "objects": [ /* layers, FRONT FIRST: the first one is drawn on top */ ]
}
```

More than one screen (for example an idle and a walk animation of the same character, each one becomes its own animation in Unity and Godot): use `"screens": [{ "name": "Idle", "proj": {…}, "objects": […] }, { "name": "Walk", … }]` instead of `project` and `objects`.

### Every layer

| field | meaning |
|---|---|
| `type` | `shape`, `text`, `draw`, `pixels`, `particles`, `group`, `rig`, `null` (a controller), `image` |
| `id` | needed only when something refers to it (bones, controllers, constraints). Short and unique: `"head"`. |
| `name` | what the person sees in the layer list. Always give a clear one. |
| `x`, `y` | where it sits, in its parent's space (the stage for top layers, the group for children). Shapes and text are centered there. |
| `scale`, `scx`, `scy` | size (1 = 100%); `scx`/`scy` stretch one way |
| `rot` | turn in degrees, clockwise |
| `opacity` | 0 to 1 |
| `ax`, `ay` | the pivot (anchor), offset from the center in the layer's own space. A swinging arm: pivot at the shoulder end. |
| `start`, `dur` | when it appears and for how long (seconds). Default: from 0 to the end of the screen or group. |
| `hidden` | `true` hides it |
| `tracks` | keyframes, see below |
| `effects` | see [Effects](#effects) |

### Keyframes (`tracks`)

`"tracks": { "<property>": [ { "t": 0, "v": 100, "e": "easeOut" }, { "t": 1, "v": 300 } ] }`

- `t`: seconds **from the layer's start**. `v`: the value. `e`: how it moves from this key to the next:
  `smooth` (default), `linear`, `easeIn` (speeds up), `easeOut` (slows down), `back` (overshoots), `bounce`, `elastic`, `hold` (jumps), `spline` (curved motion path through x/y keys).
- Any number property can be keyed: `x`, `y`, `scale`, `scx`, `scy`, `rot`, `opacity`, `ax`, `ay`, and type properties such as `w`, `h`, `radius`, `fontSize`, `strokeW`. Colors too: `fill`, `stroke`, `color`, `color2`, `bg`.
- Drawing frames: `frame` (the frame number, use `hold`).
- Bones: `bone:<boneId>` (extra angle in degrees), `bonex:`/`boney:` (move), `bonesx:`/`bonesy:` (scale), `bonebend:` (curl a segmented bone).
- Effect amounts: `fx:<effectId>:<param>` (give the effect an `id`).

### Layer types

**shape**: `shape` = `rect`, `round` (rounded box, `radius`), `ellipse`, `triangle`, `star`, `arrow`, `bubble` (speech bubble), `line`; `w`, `h`; `fill`, `fillOn` (false = no fill); `stroke`, `strokeW` (outline width, 0 = none).

**text**: `text` (use `\n` for new lines), `font` = `lexend` (clean, default), `hand`, `comic`, `serif`, `mono`, `rubik`, `heebo`, `assistant`, `secular`, `varela`; `fontSize`, `color`, `bold`, `talign` (`left`/`center`/`right`), `outline` + `outlineColor`, `bgOn` + `bg` (a box behind it).

**draw**: a drawing layer; its `frames` hold strokes. Points are in the layer's own space, (0, 0) is the layer's `x`, `y`.
- brush line: `{ "c": "#24213F", "s": 6, "pts": [x0, y0, x1, y1, …] }` (`s` = width)
- filled path: `{ "b": 1, "subs": [{ "p": [x0, y0, c1x, c1y, c2x, c2y, x1, y1, …], "cl": true }], "c": "#24213F", "s": 3, "fc": "#FFD84D" }` — a start point, then one cubic curve per (control 1, control 2, end) triple; `cl` closes it; `fc` fill color, `s: 0` for no outline. A straight segment: put the controls on the line's ends.
- several frames: `"frames": [{ "strokes": […] }, { "strokes": […] }]` and either `"play": "loop"` with `"fps": 8` (cycles by itself: flicker, fire, a walk drawn by hand) or `"play": "library"` and key `frame` with `hold` (pick each frame: blinks, mouth shapes, poses).

**pixels**: pixel art. `cs` = size of one pixel in px; `frames[i].px` = `{ "col,row": "#color" }` (cells from the layer's position, right and down). `play`/`fps` as for drawings. Best on a pixel art screen (`project.pixel`). A pixel gradient (Normal, Dithering or Halftone) is easiest made in the editor with the Gradient tool; it stays editable there.

**particles**: emitters (fire, smoke, snow, rain, confetti, sparkles, bubbles, magic). Main settings: `emit` (`stream` or `burst`), `rate` (a second) or `count` (a burst), `life` (seconds), `ptSpeed`, `ptDir` (degrees, -90 = up), `ptSpread` (degrees), `ptGravity`, `sizeMin`, `sizeMax`, `sizeEnd` (size at the end, × start), `color`, `color2`, `colorMode` (`life` = fades from color to color2, `random`), `fade`, `ptGlow`, `ptShape` (`circle`, `soft`, `square`, `star`, `spark`, `ring`), `area` (width of the line they start from), `spin`, `seed`, `ptSpace` (`local`: they move with the layer, the default; `world`: each one flies on from where the layer was when it was born, so a moving emitter leaves a trail).

**group**: `children` (front first, in the group's space). Move, scale, turn and fade the whole thing. `"seq": true` makes it a shot with its own clock (its children's times start at the group's start).

**rig** (bones): `bones: [{ "id": "spine", "name": "Spine", "x": 0, "y": 60, "len": 140, "ang": -90 }, { "id": "neck", "parent": "spine", "len": 60, "ang": 0 }]`
- a root bone (no `parent`) has `x`, `y` in the rig's space; a child starts at its parent's tip; `ang` is the rest angle in degrees, relative to the parent (0 = right, 90 = down, -90 = up for a root).
- `segs: 6` makes a bendy bone (tails, spines, rubber arms; key `bonebend:<id>`).
- layers attach to bones with `"bind": { "rig": "<rig id>", "mode": "follow", "bone": "<bone id>" }` (moves with that bone, best for rigid parts) or `"mode": "deform"` (bends with all the bones, for a drawing, shape, picture or pixel art that should stretch at the joints). The editor works out the attachment from where things are at time 0, so place each layer where it belongs in the rest pose.
- animate the bones, not the layers: `"tracks": { "bone:arm": [ … ] }` on the rig.

**null** (a controller): a handle that drives other layers. `ctype`: `x` (left–right), `y` (up–down), `xy` (box), `free`; `rw`, `rh`: half the width and height it moves in. Layers it drives get
`"drv": [{ "ctrl": "<controller id>", "space": "local", "states": [{ "slot": "left", "p": { "rot": -20 } }, { "slot": "center", "p": { "rot": 0 } }, { "slot": "right", "p": { "rot": 20 } }] }]`
— the layer's values at each spot (`left`, `center`, `right`, `top`, `bottom`); in between they blend. `space: "local"` adds the change on top of the layer's own animation. Key the controller's `x`/`y` to animate everything it drives at once.

**image**: pictures need their file packed in the project (`media`); prefer drawing with shapes, paths or pixels. If the person gives you pictures, tell them to drop the files on the stage in the editor.

Constraints (`"cons": [{ "type": "follow" | "lookat" | "track" | "copyPos" | "copyRot" | "copyScale", "target": "<layer id>" }]`), masks (a child of a group with `"isMask": "in"` shows the rest of the group only inside its shape, `"out"` only outside), physics and interactions (click, hover, follow the mouse) are easier to set up in the editor; see the docs, or `js/playground.js` for interactions built in code.

### Effects

`"effects": [{ "type": "popIn", "dur": 0.5 }, { "type": "outline", "color": "#FFFFFF", "size": 8 }]`

- comes in: `fadeIn`, `popIn`, `slideIn` (`dir`), `zoomIn`, `wipeIn`, `blurIn`, `spinIn`, `drawIn` (draws the lines on), `typewriter` (text)
- goes out (at the layer's end): `fadeOut`, `popOut`, `slideOut`, `zoomOut`, `wipeOut`, `blurOut`, `spinOut`, `drawOut`, `breakOut`
- loops: `shake`, `boil` (hand-drawn wiggle), `wave`, `wobble`, `float`, `pulse`, `jelly`, `spin`, `swing`, `blink`, `rainbow`, `dashFlow`, `drawLoop` (`amt`, `speed`: 1 = normal)
- looks: `glow` (`amt`, `color`), `blur`, `dirBlur`, `grayscale`, `shadow` (`color`, `opacity` 0–100, `angle`, `distance`, `blur`), `outline` (`color`, `size`), `innerShadow`, `recolor`, `duplicate` (`cols`, `rows`, `dx`, `dy`)

## Rules for making an animation

Think like an animator, then pick the simplest tool that does the job. Things the person will want to change later should be easy to find and change.

**Before you start**
- Ask yourself (or the person, if it really matters) what it's for: a video or GIF, a web page, a game (Unity / Godot), Blender. Set `project.target` to match. For a game, keep to what engines can carry (moves, turns, scales, fades, bones, frames); everything else is drawn frame by frame there.
- Screen size: 1920×1080 or 1280×720 for video, 1080×1080 square, 1080×1920 vertical (phone). Keep it short: 2–8 seconds, loops are welcome (the last pose = the first).
- `fps` 24 for smooth motion, 12 for a hand-drawn or pixel feel.

**Layers and names**
- Front first in `objects`. Name every layer the way the person would say it ("Left arm", not "shape 7"). Give ids only to what others refer to.
- One idea per layer. A thing with parts that move together (a character, a car with wheels, a logo with a shine) goes in a **group**: you move the group, the parts keep their own small motions.

**Pick the tool**
| You need | Use |
|---|---|
| things that slide, grow, turn, fade | keyframes on a shape, text or group |
| a character or creature with joints (arms, legs, head, tail) | a **rig**: bones, parts attached with `follow` (rigid) or `deform` (bends), keys on the bones |
| one handle that sets many things at once (a face that looks around, a mouth that opens, a "happy ↔ sad" slider) | a **controller** (`null`) with `drv` states |
| shapes that change in ways a transform can't (a splash, smoke puffs, a flame, mouth shapes, blinks) | **frames** on a drawing layer (frame by frame) |
| lots of small moving bits (sparks, snow, rain, confetti, fire, bubbles) | **particles** |
| a retro, blocky look | a **pixel art** screen (`project.pixel`) with `pixels` layers; 12 fps; moves in whole pixels feel right |
| a title that pops in, a label that types out | text with an in effect (`popIn`, `typewriter`) |
| a scene cut, a second camera | a shot (group with `seq`) or another screen |

**When to split into separate frames (frame by frame)**
- The outline itself changes (squash that isn't just a stretch, a mouth, a blink, hands, liquids, fire): frames.
- The thing only moves, turns or stretches: keyframes, not frames. It's smoother and far easier to edit.
- Mix them: a rig or keyframes for the body, frames for the face (a `draw` layer with `play: "library"` and `frame` keys).
- Hand-drawn loops: 2–4 frames at 8–12 fps (`play: "loop"`). A blink: open → closed for 2–3 frames → open.

**Motion that feels alive**
- Never linear unless it's a machine: `easeOut` into a stop, `easeIn` out of a rest, `back` for a little overshoot, `bounce` for landings.
- Anticipation (a small move the other way first), follow-through (parts that keep going a bit after the main move: a tail, hair, an antenna), overlap (parts start and stop at slightly different times).
- Squash and stretch on landings: `scy` down and `scx` up for a few frames, keep the volume about the same.
- Hold poses for a beat (at least 0.2 s) so they read. Stagger groups of things by 0.05–0.15 s.
- Leave some space around the action; keep text big and readable (at least 1/20 of the screen height).

**For game engines** (Unity, Godot): prefer rigs and keyframes; avoid blend modes. Looks effects (outline, glow, shadow, blur) work but are marked "not recommended": a look that never changes is drawn onto the layer's sprite (it keeps its bones and controllers); one that changes makes the layer frame by frame (bigger files, no rig in the engine). Put each animation (idle, walk, jump) on its own screen with the same layer names.

**Hand it over**
- Run `check` and `preview`, look at the pictures, fix overlaps, things off screen, text cut off.
- Send the link and/or the editor file, plus the JSON. Say in a sentence what's in it and what the person can tweak (for example: "drag the Look controller to make the robot look around").

## Examples

Complete projects that open as they are (check them with `node tools/toonzi.mjs check ai/examples/<file>`):

- `ai/examples/bouncing-ball.json`: keyframes with eases, squash and stretch, a shadow
- `ai/examples/robot-wave.json`: a group, a rig with bones, parts following bones, a controller that turns the face, drawing frames for blinks, particles, a text effect
- `ai/examples/pixel-walk.json`: a pixel art screen with a two-frame walk cycle

## The command line (`tools/toonzi.mjs`)

```
node tools/toonzi.mjs check   my.json                  errors and tips
node tools/toonzi.mjs link    my.json [--base URL]     a link to the editor with the animation in it
node tools/toonzi.mjs editor  my.json [out.html]       a self-contained editor page with it (offline)
node tools/toonzi.mjs preview my.json [out.png] [--at 0,1,2] [--width 360]
node tools/toonzi.mjs unlink  "<link>" [out.json]      the project inside a link
node tools/toonzi.mjs serve   [port]                   run the editor from this folder
```

Very long links (a project with pictures, over ~60 kB) can be cut by chat apps; send the editor file or the JSON instead.
