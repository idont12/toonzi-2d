# Toonzi 2D changelog

Toonzi 2D was called "Storyboard Studio" until this release. The notes below are the original developer notes, kept as they were written.

## Storyboard Studio (original README)

A 2D animation tool that runs in the browser. Open `index.html` by double-clicking it.
There is no build step and no server. Everything you make stays on your device.

## Layout

The layout adapts to the screen. You can also choose one in Settings › Appearance.

| Layout | When it's used | What changes |
|---|---|---|
| Desktop | Wide windows | Tools on the left, properties on the right, timeline below |
| Tablet | Medium windows | The properties panel slides over the stage (panel button, or `I`) |
| Phone | Narrow or vertical | Stage on top, tools in a strip, and a dock with Timeline / Layer tabs |

**Big stage** (`F`) hides the top bar and the properties panel. One menu button on the stage opens Settings, Export, the side panel and New project. The timeline below shows only the selected layers, with play, frame steps, the time and a "+ Frame" button.

**Tool bar:** the "…" button at the bottom of the tool bar lets you hide tools and change their order (drag or arrows). It is saved on this device.

**Snapping and guides:** the magnet in the zoom box (or `;`) switches snapping for layers and screens. Hold Alt to switch it for one drag.

Touch gestures:
- Two fingers pan and pinch-zoom the stage.
- A long press does what right-click does.
- Handles and rows get bigger on touch screens.

## Project structure

```
index.html            loads everything in order (read it top to bottom)
css/app.css           all styles; colors and sizes are tokens at the top
vendor/mediabunny.js  video file writer (MPL-2.0)
js/core/              helpers, state + undo, layer tree, keyframes, matrices, icons
js/render/            bezier paths, stroke drawing + brushes, fill bucket, scene renderer
js/model/             frames, object types (types/), editing commands (ops.js), screens, targets, screen templates (templates.js)
js/effects/           effect engine + the effect library
js/rig/               bones (rig.js), physics, controllers + constraints (controls.js), their interface (ui.js), the controller designer (designer.js) and saved rigs (library.js)
js/tools/             select, brush/eraser/fill/smooth, pen/points, cut, motion path
js/ui/                stage, board (screens), panels, timeline, inspector, menus, shortcuts, settings
js/io/                media, SVG/PSD/PDF import, export (video, images, Lottie, Unity, Godot, Blender FBX), project files + autosave
js/example.js         the example project
js/app.js             start-up
```

Everything hangs off one global, `SB`. Every file starts with a comment that says what it does.

## How to extend it

**Add an effect.** Add one call to `js/effects/library.js`:

```js
fx({ id: 'squash', label: 'Squash', cat: 'loop', params: ['amt', 'speed'],
     apply(r, x) { const k = Math.sin(x.T * 6) * 0.1 * x.amt; r.sx *= 1 + k; r.sy *= 1 - k; } });
```

It appears automatically in the inspector, the layer menu and the timeline. `cat` is one of:
- `loop` (repeats)
- `static` (a look)
- `in` (start of the clip)
- `out` (end of the clip)

See `js/effects/engine.js` for everything `r` and `x` contain.

**Add a tool.** Call `SB.tools.add({...})` with `down`, `move`, `up`, `overlay` and `bar`, as in `js/tools/draw.js`. It appears in the tool rail.

**Add an object type.** Call `SB.types.add({...})` with `defaults`, `bounds`, `draw`, `sections` (inspector fields) and `props` (animatable values). See `js/model/types/`.

**Add an import format.** Call `SB.importers.add({ id, test(file), run(file) })` in `js/io/import.js`.

**Add an export format.** Add an entry to `FORMATS` in `js/io/export.js`.

**Add a shortcut.** Add a line to `ACTIONS` in `js/ui/keys.js`. Users can rebind it in Settings.

**Add an inspector field.** Add `{ k, label, type, anim }` to a type's `sections`. The field format is documented at the top of `js/ui/fields.js`.

**Change the look.** Edit the tokens at the top of `css/app.css`.

## Data

A project is `{ project, objects }`:
- `objects` is the layer list. The front layer is first, and groups hold `children`.
- Keyframes live in `o.tracks[propertyId] = [{ t, v, e }]`.
- Drawing frames hold strokes of four kinds, described at the top of `js/render/paths.js`.

Project files from the previous single-file version open and are upgraded automatically.

## Rigs, physics, controllers, shots and screens

How they fit together: every layer's position comes from its keyframes, then
**controllers** (order 10/30), **constraints** (20) and **physics** (40) adjust it
(`SB.tracks.hook(order, fn)`). A layer attached to a **bone** is carried by it
(`SB.xf.follow`), or bent by all bones (`SB.scene.deformer`). So a controller can
drive a rig's root, a bone can carry a layer that has physics, a balloon can hang
from a bone, and a pupil can follow a controller, all at once.

- **Bones** (`J`): click to place joints, Enter to finish. Drag a tip to pose with IK, drag a bone to turn it. Bones can be pinned or dynamic (follow-through). Layers attach to a bone or bend with the rig; paint weights to fine-tune bending.
- **Physics**: moving bodies, surfaces, and things hanging from a bone. Key "Simulate" to start it at a moment; drag the orange handle to aim the throw.
- **Controllers**: record how layers look with the knob at a few spots; moving the knob blends between them. A state holds any value you can key: position and look, colors, the shown drawing frame, effect settings and switches, bone angles of a rig, constraint influence (`SB.controls.stateProps`). Frames and on/off values switch to the nearest spot; numbers blend smoothly.
- **Controller designer** ("Design a controller…" in the Controllers menu, the controller panel or the bar above the stage): pick a box or a circle, set its width and height, choose whether the knob moves both ways, only left–right or only up–down, click to place key points, name them, save. Then record a state at each point as usual. Saved as `ctype:'custom'`, `cshape`, `rw`/`rh`, `lock`, `points:[{k,name,u,v}]`.
- **Recording a point** lists every value that differs from the rest point; edit them there or remove one (it keeps the rest value). Outside recording, the "Drives" chips show what a controller changes; × stops driving that value (`L.ignore`).
- **Pick mode** (js/ui/picker.js): connecting a layer to a bone, a rig, a controller, a constraint target or a group never shows a long list. The bar above the stage says what to pick ("Pick a bone for Head"), the pointer becomes a target, and things you can pick are outlined and tinted on hover. Click one on the stage or its row in the timeline; Esc cancels.
- **Constraints**: move toward, look at, copy position/rotation/scale of a layer or controller.
- **Shots** (`Ctrl+Shift+S`): a group with its own time. Move and trim it like a clip, double-click to edit inside, Esc to go back.
- **Screens** (`M`): several canvases on one board, each with its own size, length, background and timeline. Drag a layer onto another screen to move it there.

**Panel layout:** each layer has Effects and Transitions as two sections, and three sections to connect it: **Rig**, **Physics** and **Controls** (controllers and constraints). Aligning and ordering several layers is in the right-click menu (Arrange); the panel keeps a small Mask section.

**Screens:** the pencil next to a screen opens its own Screen settings (size, frame rate, length, background). The gear in the top bar opens the tool's Settings (appearance, shortcuts). Snap and guides is the Snap switch in the top bar (`;`).

**Tool bar groups** (like Illustrator): in the tool bar editor, the link button puts a tool in the group of the tool above it. A group shows one tool with a small corner mark; right-click or hold it to choose another, which then shows in the bar.

**Big stage** (`F`): the dock switches between the Timeline of the selected layers and the drawing Frames; the menu button has Exit big stage.

**Masks** have two settings: show what is **inside** or **outside** the shape, and
whether the **shape is visible**. A visible mask shape is always drawn behind the
layers it masks. The eye on a mask's timeline row switches the shape. (js/ui/masks.js)

**Cutting clips** works like Premiere: `S` or the scissors in the timeline bar cut the selected clips at the playhead (or every clip under it when nothing is selected). The Cut tool in the side tool bar (`C`, js/tools/cut.js) turns the pointer into scissors: a line on the clip shows where a click will cut (it snaps to frames and the playhead), and clicking a layer on the stage cuts it at the playhead. A cut clip stays one layer on one row, with parts you move, trim or delete on their own (`o.parts` in js/core/tree.js). Works on every kind of layer, including groups, shots, video and audio.

**Imported masks:** SVG clip paths and masks, Photoshop clipping masks and layer masks, and Illustrator/PDF clipping (when imported as vector layers) all come in as working masks.

**Frame library:** with Auto key on, clicking a frame keys it at the playhead. With it off, a key at the playhead is changed in place; otherwise the frame shows as a preview until you press the key button.

**Record motion** (`R`) records layers, bone poses (drag a tip or a bone) and controller knobs.

**Constraints:** dragging, turning or scaling a constrained layer changes where it
sits relative to what it follows. When an exact constraint sets a value, the
drag edits the constraint's offset instead, and the panel locks that field.

Still to come: boolean shape operations (combining shapes).

## Round 7 additions

**Tool bar editor:** drag a tool by its grip onto another tool to put it in that tool's group; drag it between tools to move it (a member dropped inside a group joins it, dropped elsewhere it becomes a tool of its own). The ⋯ at the top chooses which buttons each row shows (group, move up/down, show/hide).

**Timeline bar:** the ⋯ at its end opens the same kind of editor: drag to reorder, hide buttons, add dividers (`S.tbar`). Big stage has the keyframe and Auto key buttons too.

**Button names** (Settings › Appearance): show names next to buttons like Snap.

**Layer colors** (Project / Screen settings): one color per kind of layer for light mode and one for dark mode, saved in the project (`S.doc.layerColors`, js/ui/colors.js).

**Position and look** is laid out like Figma: Alignment (to the screen for one layer, to each other for several), Position, Size, Rotation with flip buttons, Appearance and Pivot. Drag a field's letter left or right to scrub its value.

**Layer styles:** Drop shadow, Outline and Inner shadow, each with color, opacity, size or distance, and a blend mode (normal, multiply, screen, overlay, add…). They live in `r.styles` and are drawn in `js/render/scene.js` (`styled`).

**Your own effects** (Settings › Effects): paste one effect as code and press Add effect. It is kept on this device and shows up with the built-in effects. The format:

```js
{
  id: 'myEffect',        // unique id
  label: 'My effect',    // its name in menus
  animated: false,       // false = a look that stays on, true = it moves over time
                         // (or cat: 'in' / 'out' for a transition)
  params: { amt: { label: 'Amount', min: 0, max: 2, step: 0.05, def: 1 } },
                         // or ['amt', 'speed', 'dur', 'dir'] for the ready-made ones,
                         // a color: { label: 'Color', type: 'color', def: '#ff0000' },
                         // a choice: { label: 'Mode', options: { a: 'A', b: 'B' }, def: 'a' }
  apply(r, x) {
    // r: x, y, sx, sy, rot, opacity, filters[] (CSS filters), glow, styles[] (see js/effects/engine.js)
    // x.e: this effect's settings, x.T: seconds since it started × speed,
    // x.u: 0 → 1 progress of a transition, x.o: the layer, x.sc: stage scale
    r.rot += Math.sin(x.T * 4) * 10 * x.e.amt;
  }
}
```
A broken effect shows a message once and never stops the stage (js/effects/custom.js).

**Designed transitions** (Settings › Transitions, or Design a transition… in a layer's Transitions): animate circles, boxes and triangles on a small timeline; only what is inside the shapes shows. Start from a preset (iris, wipe, doors, blinds, diamond, triangle, bubbles), drag shapes to move them, corners to size them, the dot above to turn them; every change makes a key at the playhead. Saved in the project (`S.doc.transitions`, js/ui/transitions.js) and listed with the other transitions with a ★.

## Round 8 additions

**Keyframe menus:** right-clicking a diamond on a layer's own row works on every keyframe at that time (ease, copy, delete…), even at the very start of a clip. **Custom curve…** opens a speed graph: drag its two handles (it can overshoot), pick a preset, and watch the layer play alone next to it; the stage and timeline follow live. Saved on keys as `e: 'bez', bz: [x1, y1, x2, y2]` (js/ui/curves.js, `SB.tracks.bezier`).

**Designed transitions** now animate the layer itself (move, scale X/Y, turn, fade, blur) and add shapes in three modes: **Mask** (only what is inside shows), **Cut** (what is inside is removed) and **Piece** (that part of the layer flies on its own: move, turn, scale, fade). 0% is the layer gone, 100% the layer as normal; as an Out transition it plays backwards. Presets: Pop and spin, Rise and unblur, Slide and stretch, Iris, Wipe, Blinds, Split in two, Four pieces, Hole closes. The renderer calls `SB.transitions.composite()` on the layer's own canvas.

**More:** several effects of the same kind on one layer (Drop shadow 1, Drop shadow 2…); controllers can show a name on the stage and have their own color; alignment has a "To each other / To the screen" choice; the Shape section is laid out like Figma (kinds as icons, W/H, Fill and Stroke rows with hex codes); Button names (Settings › Appearance) shows names on the top bar and timeline buttons; a controller that moves one way is drawn as a line in the designer.

## Round 9 changes

**Keyframes behave like After Effects' stopwatch:** a value that has keyframes gets a new (or updated) keyframe whenever you change it, so "keyframe, move the playhead, move the layer" makes a tween. Auto key now means: also start animating values that have no keyframes yet. `SB.tracks.offset()` still moves a whole animation.

**Custom curve** is a small pop-up next to the menu: drag the two handles or pick a preset, and the stage plays that stretch of the animation over and over while it is open.

**Transition designer:** drag keys along their row to retime them; right-click a key for its easing (Smooth, Linear, Speed up, Slow down, Overshoot, Bounce, Elastic, Hold, Custom curve…).

**Outline** grows in doubling steps around a 24-point circle, so big outlines stay smooth. Controller names sit at the top left of the controller.

## Round 10 changes

**Keyframes without Auto key:** changing a value that has keyframes, at a time with no keyframe, is only a preview. Press the keyframe button (K) to keep it; moving the playhead drops it (like Blender). A keyframe already at the playhead is simply updated. With Auto key on, every change is keyed (`SB.tracks.set`, `pending`).

**Timeline keyframes:** Shift-click (or Ctrl-click) adds a keyframe to the selection or takes it out; Shift+Alt-click selects every keyframe between the last one clicked and this one (on one row, one layer, or the layers in between). With keyframes at two or more times selected, a box appears over them: drag its ends to stretch or squeeze them, keeping their spacing in proportion. A keyframe at the very edge of a clip no longer blocks trimming, and trimming from the left hides the start of the animation.

**Video and audio:** Speed % and Paused (both keyframable), Hold this frame / Play again here, and Split sound into its own layer (`SB.media.timeAt`, `SB.ops.splitSound`). Changing the speed without keyframes stretches the clip to keep the same part of the file; exported sound follows speed and pauses.

**Transition designer:** Ctrl+Z / Ctrl+Shift+Z undo and redo, draw your own shape (click corners or drag; Enter or double-click closes it) for masks, cuts and pieces, and a new piece starts on "Its shape". The custom curve pop-up can be dragged by its title.

## Round 11 changes

**Transition designer drawing:** two tools for your own shapes. *Draw* is one freehand stroke (letting go closes it) with a Smoothing slider; *Pen* places sharp corners with a click and curved points with click-and-drag. "Edit points" on a drawn shape shows its points: drag a point or its round handles, click the outline to add a point, double-click a point to make it sharp or round, Delete removes it; Round all / Sharp all. Points are `[u, q, hu?, hq?]` (a handle makes the point round). The designer keeps one size, so the preview never moves while you draw.

**Key spacing handles** sit in the timeline ruler, which stays at the top while you scroll the rows.

**Video playback:** the Trim start field and the Paused checkbox are gone (drag the clip's left end to trim). "Hold this frame" toggles to "Play on from here"; "Pick a frame…" opens a small picker (slider, frame steps, preview) to choose which frame of the file shows from the playhead. Both are keys on `showAt` (seconds into the file, -1 = plays on); while a frame shows, the clip's own time stands still, so it plays on from where it stopped (`SB.mediaOps`). Older projects with Paused keys still work. The right-click menu of a video has Split sound and Hold / Play on.

**Trimming from the left** redraws the row while you drag, so keyframes stay where they are in time and the start disappears (it no longer looks like it cuts from the right until you let go).

**Bones move and scale:** besides turning, every bone can move (`bonex:` / `boney:`, in its parent's space) and scale (`bonesx:` length, `bonesy:` width), all keyframable and usable by controllers. Children follow. On the stage, the rig bar has Turn / Move / Scale: in Move, drag a bone to move it (Shift: straight); in Scale, drag a bone or its tip (Shift: evenly, Alt: only wider). The bone panel has Turn, Move X/Y, Length %, Width % and Reset pose. Each bone's pose is now a matrix (`SB.rig.placeBone`).

**B-bones:** give a bone 2–16 segments and it bends as a smooth curve, like Blender's B-bones. Its ends follow the bones before and after it (can be turned off), Ease in / Ease out set how far, and Curve in / Curve out (keyframable) push its start and end sideways. Layers that bend with the rig follow the curve segment by segment (each point blends the two nearest cuts). Drawings and shapes get extra points along long straight lines so they bend smoothly.

## Round 12 changes

**B-bones, simpler:** a bone with Segments above 1 is a chain of equal segments (it replaces round 11's curve with ease and curve sliders). On the stage, a selected rig shows a dot at every joint inside a segmented bone: drag a dot (Turn mode) to turn the segment before it, and the rest of the bone follows. Alt-drag the tip turns the last segment. The panel has only Segments, Bend (curls the whole bone evenly), the angle of the segment you last touched, and Straighten. Values: `bonebend:<id>` and `bseg:<id>:<k>`, all keyframable and usable by controllers. Child bones start at the end of the chain, in the direction of its last segment (`mEnd`), so B-bones work with IK, Move, Scale and dynamics. Layers that bend with the rig follow the joints; binding stores the joints' frames (`bind.bbf`), so binding while curled works too.

**Rig bar:** icons only (Turn, Move, Scale, Add bones, Keyframe, Always show); what each does is in its tooltip, and names show with Settings › Button names. The help text is gone from the bar.

**Frame library + Auto key:** in a "Pick with keyframes" layer, adding a blank frame (or duplicating one) with Auto key on keys the new frame at the playhead, so you keep drawing on it. Adding or deleting frames renumbers the frame keyframes so each one keeps showing the same drawing.

**Selection box in the timeline:** drag in empty timeline space (between clips, in the animation rows, or below the layers) to draw a box; every keyframe inside is selected (Shift or Ctrl adds). The timeline scrolls when you drag near its edge. A click without dragging moves the playhead there.

**Hand tool (H):** drag to move around the stage, like the middle mouse button or holding Space.

## Round 13 changes

**Export, rebuilt** (`js/io/export.js`): at the top, a drop-down with a check box per screen (it starts on the screen you worked on last). With two or more screens chosen, "Combine them into one" renders them side by side as on the board (each plays its own timeline); otherwise each screen is its own file and they come together in one ZIP. Export as **Video** (MP4, WebM, MOV, MKV, with sound), **Sprite sheet** (+ JSON) or **Images (ZIP)** in PNG, JPG, WebP or AVIF. Formats that can keep transparency show "Transparent background" (PNG, WebP, AVIF, and WebM / MKV video with VP9 alpha). Frame rate, size, quality, columns and JSON are kept. Videos are encoded with WebCodecs and written by Mediabunny (`vendor/mediabunny.js`, MPL-2.0, https://github.com/Vanilagy/mediabunny), which replaces mp4-muxer. Browsers can't save AVIF from a canvas, so `js/io/avif.js` encodes an AV1 key frame with WebCodecs and writes the AVIF container itself (alpha as an auxiliary image). Without an H.264 encoder, MP4/MOV use VP9 and say so.

**Delete a screen with the Delete key:** click a screen's name (it gets an outline), then Delete asks before deleting it.

**Effect designer** (`js/ui/fxdesigner.js`, Effects › "Design an effect…", or Settings › Effects): pick a kind (Look, Animated, In, Out), then add changes: move, size, width, height, turn, opacity, blur, brightness, contrast, color strength, hue, black & white, sepia, invert, glow, shadow. Animated changes move with a pattern (wave, bounce, beat, shake, blink, keep going) at a speed; In/Out changes ease back to normal with an ease and a length. A live preview plays while you edit, and presets give a start. Saved in the project (`S.doc.fxDesigns`), each design is the effect `fd:<id>` (marked ✦) with Amount (and Speed or Length) per layer.

**Locking a rig:** a locked rig (lock button in the rig bar, the Rig panel or the timeline) can still be posed and keyframed, but its bones can't be added, moved, deleted or changed, and the rig itself can't be moved. A locked layer that bends with a rig still bends, and clicks on it go to the bones.

**Constraints to a bone:** a constraint's target can be one bone of a rig (Follow… › Pick a bone of a rig…, or the target button, which now accepts bones). Choose the bone and where on it (head, middle, tip; segmented bones follow their curve). New constraint **Follow (move and turn with it)**: the layer is carried by its target as if it were inside it; keyframe its influence to hand a layer from one bone to another.

## Round 14 changes

**What a project is made for** (`js/model/targets.js`): a new project asks "What is this animation for?": Video and images, Web animation (Lottie), or Unity and Blender (FBX). The choice decides what menus offer, so everything you make can be exported: effects are filtered (`SB.fx.available`), blend modes and masks are hidden for FBX, erasers for Lottie, video and sound for both. Switch any time in Project settings › Made for. Exporters still list anything left over.

**Lottie export** (`js/io/lottie.js`, uses `js/io/bake.js`): Export as › Lottie writes bodymovin JSON (v5.12) and, optionally, a web page that plays it with lottie-web. Shapes and drawings stay vectors (pen paths, brush strokes and fills), pictures and text become images, groups become parents, masks become track mattes, blend modes carry over. Everything that moves a layer (keys, moving effects, controllers, constraints, physics, bones) is baked frame by frame and thinned out; layers bent by bones get animated paths.

**FBX export** (`js/io/fbx.js`, binary FBX 7.4): Export as › FBX, set up for Unity or Blender. Each layer is a textured plane (picture embedded), groups are empty parents, frame-by-frame drawings are one plane per frame switched on and off, and every rig is a real skeleton: bones are joints (segmented bones become a chain), layers that bend with a rig are skinned meshes with weights, layers that follow a bone hang under it. All motion is baked into keys. Checked in Blender 5.2. Not carried: opacity and fading, filters, masks, blend modes.

**Constraint "Active"**: a keyframable check box per constraint. Off, the layer stays where the constraint last put it; on again, it follows. Relative (local) constraints continue from where they stopped, exact ones jump back to the target.

**New layers start on the playhead's frame**, so a layer made in the middle of the timeline is visible right away (`tree.startAt`).

**Alt + side handle** stretches from the middle: both sides move, the center stays.

**Flip:** right-click selected drawing parts (Points tool) › Flip horizontally / vertically, also in the points bar. Layers: right-click › Flip.

**Blend modes** in the inspector (Appearance › Blend): multiply, screen, overlay, add, darken, lighten, soft light, hard light, difference, color dodge/burn, exclusion, hue, saturation, color, luminosity.

**New effects:** Change color (color, intensity, fill / tint / multiply) and Duplicate (grid) (columns, rows, distance between columns and rows).

**Keyframe navigation:** transport buttons and Alt+← / Alt+→ go to the previous / next keyframe; the playhead snaps to keyframes near it while scrubbing (toggle button or Alt+K, hold Alt to move freely).

**Curve editor with more points** (`js/ui/curves.js`): double-click the curve to add a point, double-click a point to make it sharp or round, drag handles (Alt breaks them), Delete removes a point. The graph grows to fit big overshoots. New presets: Big back, Anticipate, Snap, Bounce, Big bounce, Elastic, Wobble. Two-point curves are kept as `k.bz`, more points as `k.bzp`.

## Round 15 changes

**Export dialog:** "Export as" is a drop-down: Video, Sprite sheet, Images (ZIP), Lottie (web), Unity, Godot, Blender (FBX). It starts on the format the project is made for.

**Unity** (`js/io/unity.js`): a `.unitypackage` (double-click it, or Assets › Import Package). Inside `Assets/<project>/`:
- `Sprites/` one PNG per layer frame, imported as sprites (pivot on the layer's origin, 100 px = 1 unit, 2× resolution).
- `<project>.prefab`: GameObjects for groups; SpriteRenderers for layers (Order in Layer follows the layer order; frame-by-frame layers swap sprites); Sprite Masks for masks (the masked layers use Visible Inside Mask, scoped by sorting range; a visible mask also draws its shape); one GameObject per bone under the rig (segmented bones are chains); layers that ride on a bone are children of it; layers that bend with the rig get a Sprite Skin (2D Animation package) driven by the bone GameObjects; controllers are empty GameObjects; an Animator on the root.
- `Animations/`: one AnimationClip per chosen screen, all states of `<project>.controller` (the first is the default).
- `<project>.unity`: a scene with the prefab and an orthographic camera framing the screen.
- `Editor/StoryboardRigSetup.cs` (+ asmdef, only compiled when the 2D Sprite package is there): the bones and weights of bending sprites travel in their import settings, and this applies them once through Unity's sprite data API so they also show in the Skinning Editor (Tools › Storyboard Studio › Set Up Sprite Rigs runs it again).
GUIDs and file ids come from the names, so exporting again updates the same assets.

**Godot** (`js/io/godot.js`): a ZIP with a folder for a Godot 4 project: `<name>.tscn` and `sprites/`. Groups are Node2D, layers Node2D with a Sprite2D per drawing frame, masks a Sprite2D with Clip children holding what they mask, rigs Skeleton2D with Bone2D bones, bending layers Polygon2D skinned to them (same weights), layers that ride on a bone are moved by a RemoteTransform2D on that bone, controllers Node2D. One AnimationPlayer with one animation per screen, plus RESET.

Both use `js/io/engines.js`, which samples the chosen screens frame by frame (like the renderer) and matches layers across screens. Ropes of layers hanging from a bone become stretched sprites. Checked: the Godot scene was rendered by Godot 4.3 and compared with the stage; the Unity prefab, clips and the Sprite Skin bind poses (computed the way 2D Animation does) were evaluated and compared with the stage's deformer (under 0.1 px).

**One character, many animations:** right-click a rig › Saved rigs › Save to Saved rigs (or File › Saved rigs…). It keeps the rig with every layer that bends with it, rides on it or drives it (and their groups) in the project (`S.doc.rigs`). "Place here" puts a copy in the screen you work on. Copies keep a link (`o.link`) to what they came from (duplicating a screen does too), so exporting several screens to Unity or Godot gives one character with one animation per screen.

**Made for:** four choices when a project starts (and in Settings › Made for, or the chip in the top bar): Video and images, Web animation (Lottie), Unity and Godot (one choice: they share the same limits), Blender (FBX). What the format can't carry stays visible but greyed out with the reason as its tooltip: effects (menu and inspector), blend modes, masks (Blender) and outside masks (Unity/Godot), video and audio import, voice recording, the eraser (Lottie). Effects already on a layer that won't export are marked. Projects made for "FBX" before open as Unity and Godot.

## Round 16 changes

**Screen templates** (`js/model/templates.js`): select a screen and "Save as screen template" (screens panel, the board bar, or right-click the stage). Add a screen › From template makes a child screen: its layers are linked copies (`o.tpl`, `o.link`). Every change committed on the template (colors, drawings, positions, bones, binds, effects, new or deleted layers) flows into its children just before the undo step is stored, so undo covers both. A child keeps its own keyframes, timing and visibility, can add its own layers, and can't delete or ungroup the template's (they show a "template" badge). So a rig starts from the same pose in every animation.

**Saved rigs update everywhere:** right-click a rig › Saved rigs › Update the saved rig and all its copies (or Saved rigs › Update … everywhere). The same sync updates every copy in every screen; each keeps its animation.

**Screen length:** a length you set (Settings or the screen panel) stays even when layers are longer (`proj.fixedLen`); their keyframes are kept and the animation ends there.

**Frame view:** the Frames button in the timeline bar counts frames (ruler and the time readout, first frame = 1). "Whole frames" (next to it, only in frame view) keeps the playhead, keyframes and clips on frames: scrubbing, dragging keys or clips, and playback step frame by frame (`SB.time.q`, `qLocal`).

**Motion path as a vector path** (`js/tools/motionpath.js`): its points are the keyframes. Drag a point to move it, drag its handles to bend the path (cubic: `k.ho`, `k.hi` on the X keys), double-click the path to add a point (the curve is split, it keeps its shape), double-click a point for sharp ↔ smooth, Alt-click to remove it. The bar shows Sharp / Smooth / Symmetric / Free for the picked point. Older single bend points still play and become handles when edited.

**Points tool handles:** click an anchor to pick it (pink ring); the bar shows Sharp / Smooth / Symmetric / Free. Smooth keeps the handles in line, Symmetric also keeps them the same length, Free lets each move alone (Alt does the same while dragging). Stored per anchor in `sub.m`.

**What is this animation for?** A grid of the four choices; the note of the one under the pointer shows below. A click picks it; on a touch screen tap one, then Start. The top-bar chip's "What does this change?" opens the same grid with the current choice marked (picking switches). Settings › Made for is a list: name and what it means side by side.

## Round 17 changes

**Sharp when zoomed in** (`js/ui/stage.js`): the screen is a box (`#stageDoc`) that zooms and pans, and the canvas covers just the visible stage area at full resolution; `scene.render(…, { origin })` draws the screen at its place in it. Before, the canvas was the whole zoomed screen, capped at 4096 px, so lines blurred when zoomed in.

**Saved objects** (`js/rig/library.js`, was Saved rigs): right-click any layers › Saved objects › Save as a saved object (a rig brings its layers and controllers). File › Saved objects… lists them: Place here, the pencil to edit, rename, remove. The pencil opens the saved object on its own editing screen (a bar at the bottom: Cancel / Save and update everywhere): change colors, styles, drawings, bones, add or delete layers; saving updates every copy in every screen, and each copy keeps its own keyframes. A copy can also push its changes: Saved objects › Update the saved object from this copy.

**Templates update on request:** the original shows a TEMPLATE tag on the board (TEMPLATE • changed when its copies are behind) and copies show FROM …. When it changed, a pill on the stage, the board bar and the screen section offer "Update N screens" (one undo step); nothing is pushed until then.

**Screen modes:** each screen has its own "made for" (new screens take the current one). Switching to a mode that can't carry some layers asks to remove those things or keep them; kept ones are marked red in the timeline and the inspector says why, with "Remove it" (also right-click › Remove what … can't show). Descriptions in the picker list only the limits, at the same length.

**Export picks fitting screens:** for Lottie, Unity, Godot and Blender the screen list holds only screens made for that format or using nothing it can't show; the others are listed greyed with the reason. Screens being edited are never exported.

**Info buttons:** long hints in the properties panel move into a round "?" in their section's header (`SB.w.info`, `SB.w.tidyHints`); warnings stay visible.

**Paste from other apps** (`js/io/import.js`): Ctrl+V with a picture or SVG on the system clipboard adds it (SVG as editable vector layers); otherwise it pastes layers copied in the app.

## Round 18 changes

- **Templates, more reliable:** a copy now also follows the template's keyframes for every value it hasn't animated itself (so color or position changes made with Auto key on reach the copies too); values a copy animates stay its own (`o.tplT` remembers what the template's keys were at the last update). New layers, also inside groups, arrive in their place; the "changed" state now notices keyframe changes.
- **Copy and paste of layers and groups:** Ctrl+C / Ctrl+X on layers also marks the system clipboard, so Ctrl+V pastes the layers even when an old picture is still on the clipboard; a picture or SVG copied elsewhere afterwards still pastes as a picture.
- **Arrow keys move the selection** (1 px, Ctrl: 10 px), rigs and controllers too; with nothing to move, ← → step through frames. **Shift + ← →** steps one frame, **Shift + ↑ ↓** jumps to the previous / next keyframe (round 40).
- **Export warning** only lists chosen screens that use something the format can't show, by name.

## Round 19 changes

- **Export finished:** the progress bar goes away and a green "Export completed" box shows the file name and size; the button becomes "Export again". A stopped or failed export also hides the bar.
- **Auto key from the start:** with Auto key on, keying a value later in a layer when that value has no keyframe before the playhead also keys it at the layer's start with the value it had there, so the change tweens from the start. Only that value is checked (`SB.tracks.startKey`), not the layer's other keyframes.
- **Keyframes in the ruler:** a strip under the time numbers shows a diamond wherever the selected layers (or, with nothing selected, all layers here) have keyframes, including layers inside groups and every animated value. Drag a diamond to move all the keyframes at that time, click it to jump there, Ctrl-click to add to the key selection; no need to open rows.
- **Shift for straight lines:** Brush and Eraser strokes become a straight level or upright line from where they started (let go of Shift to carry on freehand); the Pen places points level or upright from the last one and keeps handles level or upright; Bones (new joints and dragged tips) do the same. Previews follow Shift while hovering (`SB.tool.straight`).
- **Timeline bar editor is horizontal:** the ⋯ at the end of the timeline bar opens the buttons as a row of tiles in bar order (wrapping onto more lines when narrow); drag a tile left or right to move it, the eye hides or shows it. The tool rail editor stays a vertical list.
- **Phone top bar** fits a 390 px screen again (the Export button no longer pushes the page wider).

## Round 20 changes

- **Keyframes at a clip's edge:** a key right at the start (or end) of a clip is drawn just inside it, whole, and clicking it selects it (trimming works from the edge above it). The ruler's key at 0 is inset the same way.
- **Layer colors** moved to Settings › Project (they belong to the whole project), out of each screen's settings.
- **Timeline bar editor** is a vertical list like the tool bar's (`groupEditor` in shell.js serves both): drag to reorder, drop a button on another (or use the link button) to group them; a grouped button shows one of them, right-click or hold it for the others (`S.tbar.group`, `S.tbar.active`). Time, zoom and the spacer stay alone. Names are three words at most.
- **Line style:** with a drawing selected (Select tool) or parts selected (Points tool), the brush button restyles the lines with any brush; each line keeps its color and width (`SB.brushUI.styleBtn`, `SB.brush.matching`).
- **Several points at once (Points tool):** Ctrl-click adds or removes a point, Shift-click selects every point between the last one and this one, a box around points of the selected paths selects them; drag one to move them all, arrow keys nudge them (Shift: 10 px), Delete removes them, Sharp/Smooth/Symmetric/Free apply to all (`S.selPts`).
- **Simple curve** now fits real curves (Schneider's method, `SB.paths.fitSub`): far fewer points, within about a pixel of what you drew, sharp turns kept as corners; it keeps the brush you draw with (texture, thin ends, wobble, opacity), and paths draw those brush styles too. "Make editable path" and "Fewer points" use the same fitting.
- **Smooth tool and Smooth button** work on paths (simple-curve lines, pen paths): points move towards their neighbours and their handles line up (`SB.paths.smoothSubs`).
- **Effect designer:** every kind of change is listed in "Add a change" (the ones the screen's format can't show are greyed out with the reason); an animated change can happen several times in each cycle (× a cycle); In/Out ease, an animated effect's timing inside each cycle, and each change's own easing can be any ease or a custom curve (the curve pop-up), and a change's easing overrides the effect's.
- **Custom curve keeps the easing:** opening Custom curve on a keyframe shows the easing it has now (exact for the cubic ones, fitted for back, bounce, elastic and the spacing handle's power curve) and changes nothing until you edit it (`SB.curves.fromEase`).
- **Flip icons** redrawn: solid line, more room between the triangles and the line, a little bigger.
- **Copies of saved objects** are tagged: "copy of <name>" on the timeline clip and "Copy of <name>" (or "Part of <name>" for a layer inside it) in the panel (`SB.rigLib.copyInfo`).
- **Layer names width:** drag the grip at the right of the timeline's top-left corner (double-click: back to normal), kept per layout (`S.tlHead`); long names and deep nesting no longer push the buttons out.
- **Show only this** shows just the chosen layers (and what is inside them) in the timeline, without the groups around them.

## Round 21 changes

- **Timeline bar scrolls sideways** when it doesn't fit: mouse wheel, drag on empty space, or swipe; the edges fade to show there is more, and a thin scrollbar shows on hover.
- **Add in the bar editors:** the timeline bar's "Add" opens a small menu: Divider, Space (pushes the rest to the end) or Small gap. Spaces and gaps can be dragged and deleted like dividers (ids `space:…`, `gap:…`; the old single `space` is one of them now).
- **Layer colors in the timeline:** click a layer's icon chip in the timeline (or right-click › Layer color…) to pick a color for its row and clip, any color with "Other…", or "No color" to go back to its kind's color; right-click › Remove its color too. Works on several selected layers at once (`o.tlColor`, `SB.timeline.colorPick`).

## Round 22 changes

- **Row colors:** a layer's timeline color now tints its whole row (its name, its lane and its animation rows), not just the clip; the color picker has "Row and clip" or "Clip only" (`o.tlTint = false`).
- **Actions (an animation library per rig)** (`js/rig/actions.js`): a rig can hold several actions (walk, run, jump…), each with its own keyframes and length for the rig and everything that moves with it (bending and riding layers, controllers driving it). Switch, add (empty or from the current one), rename, duplicate and delete them in the rig's panel (Actions), from the "▶ Action" tag on the rig's clip, or from the Rig action button in the timeline bar. Unity and Godot get one animation per action (next to one per screen, so both ways work), Blender one FBX per action, Rive one animation per action.
- **Controllers in Unity and Godot editors:** a controller that drives something exports a grid of poses (the scene with the controller at each spot of its box or line) and a small script: drag the controller in Unity's Scene view (`StoryboardControllerPreview`, Assets/StoryboardStudio) or Godot's editor (`storyboard_controller.gd`, a tool script) and what it drives follows, blended between the poses. Their box shows as a gizmo / editor drawing only; in the game the exported animations hold the result. Shared Unity helper scripts now live in Assets/StoryboardStudio with fixed GUIDs, so importing several exports doesn't clash.
- **Interactive, and Rive export** (`js/ui/interact.js`, `js/io/rive.js`): File › Make it interactive picks the animation that plays first and what clicks, the pointer coming in or leaving, and keys play (then back to the start, keep playing, or stop at the end); "Try it" plays it with Rive's web runtime. Export › Rive (interactive) writes a .riv (runtime format 7: every screen and action is an animation of one artboard, layers are nodes with embedded pictures, bending layers are meshes with keyed points, a state machine with a trigger per interaction) and a web page that plays it and fires the triggers. Masks, effects, video and sound are left out of Rive.
- **Timeline bar arrows:** while the bar can scroll, arrow buttons at its ends scroll it (handy on tablets).

## Round 23 changes

- **Controllers work in the game (Unity, Godot):** a controller that drives something exports its pose grid and a runtime script that runs in the editor and in the game, after the animations each frame (Unity: `StoryboardController` on the prefab, [ExecuteAlways], LateUpdate; Godot: `storyboard_controller.gd`, a tool script with a high process priority). Move the controller node (by hand, from your own code, or from an animation) and what it drives blends between the poses, on top of whatever animation is playing. Pose grids are no longer written as animation clips.
- **Interactive mode** (`js/ui/interact.js`, top bar › Interactive) replaces the old dialog: the dock shows a graph instead of the timeline, like Rive's state machine. Cards are animations (each screen, each action of a rig); the Start pill points at the first; drag from a card's dot to another card for an arrow; "Anytime" holds arrows that work during every animation. Click an arrow (its chip) to set, with tiles, when it happens — a click, hover or leave on a layer (or anywhere), a key, when the animation ends, after some time — and how long the morph between the two animations takes (0–2000 ms, with an ease). Cards set loop/once and speed. **Mouse follow** makes a controller follow the pointer (over the stage or a layer, with smoothing), so a rig can look at the mouse. **Play** runs it right on the stage (`S.ixPlay`): clicks, hovers and keys go to the graph, actions of the same rig morph pose by pose through a track mixer (`SB.tracks.mixer`, nothing is stored), another screen cuts; Esc or Stop puts everything back. On phones the settings open in a sheet. `S.doc.ix = { start, states, links, follow }`; older setups carry over.
- **Rive export follows the graph:** one state per card (with its speed), Entry → Start, Anytime and card arrows as transitions, "ends" as exit time 100 %, "after" as exit time in ms, the morph as the transition's duration. Clicks and hovers on a layer are Rive listeners on invisible hit rectangles under that layer (or the whole artboard for "anywhere"), so they work in any Rive runtime; the web page only fires the key triggers. Mouse follow stays in the app.
- **Weights:** Paint weights and a new **Gradient** sit right under the selected bone's name; Gradient: drag a line on the stage, full weight where you start and none where you end (`SB.rig.gradient`, gradient dabs in `bind.paint`).
- **Bones with segments** get a "<bone> bend" controller at the bone's tip when you split them: drag it to either side and the bone curls that way.
- **Hanging layers** hang from the end of the bone's curve when the bone is bent, and re-simulate when the rig's controllers move.
- **Attached to a bone** looks like the controller cards: what it follows, a bone picker, detach; rig connection buttons are "Attach to a bone" and "Bend with a rig".
- **Physics panel** is shorter: three kind tiles (Body, Surface, Hang), Motion (weight, bounce, throw), the rest under More.
- **Layer right-click** shows only layer things (rig layers get Rig, controllers get Controller moves), with no icons in the main list; File no longer has "Make it interactive".
- **Timeline top keys:** one diamond per frame for all the layers shown; dragging it moves every keyframe at that time; moving a single layer's key makes its own diamond, and lining keys up again merges them.

## Phase 1 fixes (after round 23)

- **Unity controller script compiles:** the generated `StoryboardController.cs` had a real line break inside a C# character literal (`'\n'` written from a JavaScript template), which stopped every script in the project from compiling. It now splits on white space without character literals; the file is checked by compiling and running it (mono, with functional UnityEngine stand-ins) against the app's own values.
- **Controllers move in the game:** controller nodes were keyed in every exported animation (their pose-grid samples counted as "moving"), so the Animator / AnimationPlayer pinned them back each frame. Pose grids no longer count as animation, in Unity and Godot.
- **Controllers add on top of the animation:** links in local space (the default) export as "adds" (parts & 8): the runtime adds the controller's change to whatever the animation sets (and remembers what it wrote, so nothing piles up when the animation is paused or a target is not animated). Global links still replace the value. Checked in Godot 4.3 (paused and playing) and in the C# runtime: an animated bone at 30° plus the controller's +40° gives 70°, as in the app.
- **Controller-driven drawings:** frames a controller switches, and layers it shows, hides or fades, now follow it in the engines (Unity: sprite swap, GameObject active, color alpha on the `renderers`; Godot: `shows` / `fades` node lists). Switches take the nearest spot of the grid, like the app.
- **Timeline stays put while playing:** it no longer jumps a page when the playhead reaches the edge, and the time box in the bar is as wide as its widest text, so nothing in the bar moves as the numbers change (seconds and frames).
- **Shift-drag:** on the stage, Shift while moving layers (Select tool) or points (Points tool) keeps the movement level or upright, whichever is the main direction. Shift-click still adds or removes a layer from the selection; Shift-dragging an unselected layer adds it and moves.
- **Color pop-ups over dialogs:** pop-ups (palette, custom color, hex) opened under dialogs such as Project settings › Background, so presets and custom colors couldn't be clicked. Pop-ups now sit above dialogs.
- **Rive mouse follow:** the Rive export now follows the pointer: each followed controller gets a "Mouse follow" layer in the state machine with one pose per spot of its grid (9×9, or 9 for a line), number inputs "<name> x" / "<name> y", and invisible cells over its area whose pointer-enter listeners set them; the morph between spots is the smoothing. Works in any Rive player (no page script needed). Limits: it moves in steps of the grid (smoothed), and while following, the poses replace the animation of what the controller moves (Rive layers can't add); the export lists this as a warning.
- **Physics panel:** the three kinds (Body, Surface, Hang) are the same equal-width tile grid whether physics is on or off (with physics off, picking one adds it; Hang is greyed without a rig). Remove physics is a button under the panel, not inside More.

## Phase 2: workspace and rigging

- **Logo menu:** the logo (top left, with a small arrow) opens the file menu: new, open, save, import, saved objects, Export…, project settings, settings. The big Export button and the File button are gone from the top bar.
- **Interactions** moved out of the top bar into the timeline bar ("Interactions" button, after the rig action button); it turns the dock into the interaction board as before.
- **Big stage (F):** a small bar at the top right of the stage switches **Edit / Preview** (Preview hides every panel and plays: the interaction graph when there is one — clicks, hovers and keys work — or the animation looping; Esc or Edit stops it), turns **simple tools** on or off (the tool bar keeps select, brush, eraser, fill, hand, bones, text and shapes; "All" brings the rest back; also kept in preferences) and opens **the selection's menu** (or the stage menu) with one tap.
- **Touch:** besides pinch-zoom and two-finger pan, a quick two-finger tap undoes and a three-finger tap redoes; a long press still opens the context menu.
- **Rig steps:** the bars of the rig (Pose), the Bones tool and the Weights tool start with the same steps: **Bones · Pose · Weights** and **Controls** (new controllers that pose the rig, a bend controller for a segmented bone).
- **Weight painting:** Brush, **Smooth** (softens painted edges back toward the automatic falloff, for every bone under the brush) and Gradient; Add / Remove; size and strength (also `[` `]`, and Shift+`[` `]` for strength); the brush shows its strength as an inner ring; the selected bone's weight under the pointer shows as a percentage next to it; **Normalize** scales what was painted for the bone so its strongest painted spot follows it fully (100%); **Clear** removes the bone's painted weights. Weights at every point always add up to 100% across the bones (that part is automatic).
- **Controller points:** a link has **Between: Smooth / Snap** (Snap jumps to the nearest point: switches, frames, on/off); a single point can snap too (its checkbox while editing it). A designed controller lists its points: rename, place (across / down, −1…1), reorder, snap, delete. Unity and Godot exports honor Snap (parts & 16: the nearest spot of the grid) per driven layer, and "adds on top" is now decided per driven layer too.
- **Controllers from layers:** right-click a layer › Controller › Make it a controller: a controller at the layer's middle, sized from it; the layer moves with it (a Follow constraint), and it can drive other layers. Several selected controllers: Line up › In a row / In a column (right-click, or the Controller panel), evenly spaced around where they are; their rest moves with them.

## Phase 3: animation and reusable assets

- **Combine into one drawing** (right-click with several layers selected, or Ctrl+E): drawings and shapes become one drawing layer; every line stays where it was on the stage (shapes become paths), frames line up (frame 1 with frame 1…) and play like the animated drawing did. The top layer's transform, timing and animation carry on. It is reversible: **Split back into layers** (right-click the combined layer) puts the originals back exactly as they were (changes made to the combined drawing since are dropped). Text and pictures can't become lines: with them, Combine makes a group instead. The other layers' own animation, opacity, blend mode and effects are not part of the drawing (they come back with Split back).
- **Morph between layers** (select two or more shapes or drawings › right-click › Morph between these): makes one drawing named Morph whose frames are those layers (shapes become paths), one every second from the playhead, with Morph on each frame keyframe; the originals are hidden. Shapes with matching lines morph, others crossfade. (The old Shape library was removed.)
- **Between frames: cut, morph or crossfade** (a drawing's panel, or the curve button in the frames bar): with **Morph**, the lines of one frame move into the next frame's lines over the chosen length and ease, where a Frame keyframe switches it (frame library) or at the start of each frame (played frames). Morphing works when the two frames' strokes pair up one to one (same number, same kinds: lines, fills, paths; lines and outlines are resampled, paths split curves to match); otherwise those frames **crossfade**. The panel says how many frame changes can morph. Video, GIF, image and Lottie exports include it (Lottie: morphs as animated paths, crossfades as frame opacity). Unity, Godot and Rive switch frames without morphing.
- **Controllers from layers** (from Phase 2): right-click › Controller › Make it a controller; it connects to the animation like any controller (keyframe it, record it, drive layers with it, export it).

## Phase 4: interactions as rules (Web animation mode)

- **Interactive web animation** is a new project kind (Settings, the chip in the top bar, or when you open Interactions: "Make it a web animation" switches every screen). It allows everything, like Video. In other kinds the **Interactions** button in the timeline bar is greyed out and offers to switch.
- **Rules instead of a graph** (`js/ui/interact.js`, `S.doc.ix = { v: 2, start, rules }`): each card reads **When → If → Do**. Older projects' cards and arrows (and mouse follow) turn into rules automatically.
  - **When:** click / tap, press, release, hover, leave, pointer moves, drag (on a layer or anywhere), key, screen opens, animation ends, after a time, every frame.
  - **If:** the animation playing, its time, the pointer pressed / over a layer / its position, a layer's value (x, y, rotation, size, opacity, shown), a controller's position, a key held, the screen. Any number, with **All of them / Any of them**.
  - **Do:** play an animation (screen or rig action, with the morph length and ease, once or looping, start over or not), pause / resume / toggle, go to a time or the next / previous keyframe, move a controller to a point (animated), follow the pointer (a controller across its box, or a layer), drag the layer, go to a screen with a transition (cut, fade, slide, wipe, zoom, break apart; direction, length, ease), play an effect on a layer (any in, out or looping effect), set a layer value (animated or at once). Several actions per rule, reorderable.
  - **One-shot vs continuous:** follow and drag run while the rule holds (pressed, dragging, hovering, or while an every-frame rule's conditions hold); one-shot actions of every-frame and pointer-moves rules run only when the conditions start to hold, unless the rule says **Every time**; Play doesn't restart an animation that already plays unless it says **Start over**.
  - **Edit:** + Rule, click a card (or one of its chips) to edit it in the panel (on phones: a sheet), duplicate, delete, switch it off. A card shows what it uses that was deleted.
  - **Preview and debug:** Preview plays the rules on the stage, with a compact preview bar (what plays, its time, pause). Each card shows what last happened: "Ran 2× · played Wave", "Didn't run: “Idle is playing” is false (Wave plays)", "Click / tap was on Arm: it waits for Btn"; the panel keeps a short log.
  - **Flow board:** a second view shows the screens (live thumbnails, their rig actions, the start) with arrows for rules that go to screens or play animations; wheel or buttons to zoom, drag to pan, Fit.
  - **Screens:** deleting a screen that rules use warns and lists them; the rules then show what is missing.
- **Export › Web page (interactive)** (`js/io/webpage.js`): one HTML file with the player (this app's own engine, without the editor) and the project: everything in Preview works, including screen transitions, rigs, controllers, effects and morphs. **Rive** still exports what Rive can do (play rules with click / press / hover / leave / key / end / after triggers and an "animation is" condition, screen jumps as plays, controllers following the pointer) and lists what it leaves out ("use the web page export for those").
- The Big stage's Preview plays the rules too.

## Phase 5: Break apart

- **Break apart** (`js/effects/break.js`): the outgoing object or screen cracks into triangular pieces that fly off, spin, fall a little and fade. Settings: **intensity** (how many pieces and how far they fly), **direction** (left, right, up, down, or out from the middle) and **length** (and ease, for screens).
  - As a layer effect: Effects › Transitions out › Break apart (`breakOut`): the layer breaks at the end of its clip. Drawn by the renderer (`r.shatter`), so video, GIF, image and web-page exports show it; Lottie, Unity, Godot, Blender and Rive can't carry it (greyed out for those project kinds, listed as left out).
  - As a screen transition: an interaction's **Go to screen › Break apart** breaks the screen you leave over the one you go to (in Preview, Big stage preview and the web page).


## Round 27 changes

- **Layer right-click menus regrouped:** **Controller** (Make it a controller, Drive with a controller, Follow), **Rig** (Attach to a bone, Bend with a rig, Detach) and **Physics** (Body, Surface, Hang from a bone, Remove physics). Added by `js/rig/ui.js` (`layerMenus`); `SB.menus.extra` functions may now return several items.
- **Toggle controllers** (select several layers › right-click › Controller › Make a toggle controller): one left–right controller with a point per layer; at each point only that layer shows (opacity 1, the others 0; held, no fading), e.g. mouth shapes. Right-click another layer › Controller › Add to the toggle "name" to add it. The controller's panel lists the points: change which layer a point shows, show a point, reorder, remove, add a layer. Data: the controller's `toggle` (layer ids) and `points`; each layer gets a `drv` link with `toggle: true` (`makeToggle`, `rebuildToggle`, `showToggle` in `SB.rigUI`).
- **What is this animation for?** tiles: centred, 3 on the top row and 2 below (2 per row on phones).
- **Timeline groups:** the open/close arrow sits right after the group's name.
- **Shape library removed.** The Between-frames controls moved to `js/ui/framemorph.js`, which also adds Morph between these.
- **Frames strip:** right-click a frame for Copy drawing, Paste as a new frame, Paste over, Duplicate, Move earlier/later, Rename, Delete; drag frames to reorder them (a marker shows where it lands; frame keyframes follow). After clicking in the strip, Ctrl+C / Ctrl+V / Ctrl+D copy, paste and duplicate frames; Shift+D duplicates the current frame anywhere (Ctrl+Alt+C / Ctrl+Alt+V copy and paste frames anywhere). All in Settings › Shortcuts › Frames.
- **Drop shadow size:** grows the shadow around the layer's shape (0–80).
- **Selection box follows animated size:** when width/height are keyframed, the box and side handles use the size at the current time (`scene.bounds` uses `viewOf`).
- **Properties panel width:** drag its left edge (desktop, and tablet when open), 220–640 px, kept in settings; double-click the edge to reset. Long text and long names wrap instead of scrolling sideways.

## Round 28 changes

- **Morph per keyframe** (frame library drawings): right-click a Frame keyframe › **Morph to the next keyframe** (and **Morph ease**). The drawing morphs from that key's frame into the next key's frame over the whole time between the two keys, with that ease; the frame row shows a thick bar for it. Data: `k.morph = ease name` on `o.tracks.frame` keys (`SB.frames.change`); older files' layer-wide morph moves onto the keys when opened (`SB.frames.morphToKeys`). Older played-frame morphs still play. Lines that don't match one to one crossfade. Lottie exports both.
- **Start dialog:** the "Start your animation" card is gone; when the tool opens on an empty project (and on New project) one dialog asks what it is for (pick a tile) with **Start**, **Start drawing**, **Add text** and **Open the example**. Double-click a tile to start with it. (`SB.targets.ask(null, { start: true })`; tests open `index.html?nostart` to skip it.)
- **Timeline bar per format:** each format hides some buttons by default (`LIST[k].bar` in `js/model/targets.js`): Interactions only shows for Interactive web animation; voice recording is hidden for Lottie, Unity/Godot and Blender. The bar's ⋯ editor shows and hides buttons for the current format (`S.tbar.hiddenFor`).
- **End of the animation:** a flag at the end of the ruler: drag it to change the length (snaps to frames and keyframes), double-click it to type the length.
- **Groups can be stretched or shortened:** drag a group clip's right end. Later: the layers inside that reached its end grow with it. Earlier: the layers keep their length and the group shows less of them (`o.trim`; `tree.normalize` keeps a trimmed group shorter than its layers).
- **Copy and paste keyframes from several layers:** keyframes copied from more than one layer (or pasted while their layers are selected) go back onto their own layers at the playhead; from one layer they go onto the selected layer. Morph settings come along.
- **Unity:** the controller's gizmo sphere is bigger (`Mathf.Max(0.13f, …)`) so it is easier to grab.
- **Big stage:** drag the line above the timeline to make it taller or shorter (kept in settings, `S.miniH`).
- **Effects:** new **Directional blur** (length and direction in degrees: the layer smeared along that line, `r.dblur`, drawn in `js/render/scene.js`). **Glow** has a **Color** (starts as the layer's own color; effects may have an `init(e, layer)`).
- **Interactions can drag a rig:** a Drag action on a rig (or WHEN Drag on any layer on it) has **Part**: the bone you press on (default), the whole rig, or a set bone. A bone's end follows the pointer and the bones above it bend to reach it (IK, `rig._ixB`, only while previewing or in the web page).

## Round 29 changes

- **Start dialog:** picking a format closes it right away (the Start drawing / Add text / Open the example row is gone).
- **Interactions:** no "No rules yet" card on the board; the Interactions section of the panel says it (with Add a rule).
- **Between frames section and button removed:** morphing is only set on keyframes (right-click a Frame keyframe › Morph to the next keyframe, and Morph ease). `js/ui/framemorph.js` now only adds Morph between these.
- **Directional blur shows on the stage:** plain layers didn't get the isolated pass it needs (`drawLeaf`'s `iso` now includes `st.dblur`). It is worked out on a ½ or ¼ size copy, as are big drop-shadow blurs (`softened` in `js/render/scene.js`).
- **Faster stage:**
  - The faint copies of layers hanging past the canvas edge used to render the whole scene again, effects included, every frame; now only those layers, without effects, and not while playing (`js/ui/overlays.js`). In a test scene a frame went from about 740 ms to 85 ms.
  - While it plays, or something is dragged, slow frames lower the stage's resolution (down to 35%, `SB.view.q`); it is sharp again as soon as it stops. Exports always render at full size.
  - Big pictures drawn small use halved copies made once (`scaled` in `js/model/types/media.js`); exports use the originals.

## Round 30 changes

- **Interactive web animation** says what it limits: nothing in the interactive web page it exports; only the Rive file leaves out filters, glow, shadows, masks, video and sound.
- **Directional blur is smooth:** made by doubling (each pass adds the picture to itself shifted, ½ + ½), so 2ⁿ copies take n passes with no 8-bit banding; only very long smears use a ½-size copy.
- **Rig lock** (Rig section of a layer on a rig; replaces "Clicks: pose the bones"): the rig moves the layer, so a drag on it poses the bones (it pulls the bone it is on, or the nearest one for bending layers) instead of moving, turning or scaling it; no handles, nudging or group moves. You can still select it, draw on it and right-click it. It turns on by itself when a layer is attached to a rig (`o.rigLock`, set in `SB.rig.bindTo`; old "locked" bound layers become Rig lock). Its own icon (a bone with a lock) and a ? that explains it.
- **Groups can be cut at the front:** drag a group's left end. Later: it hides the start of its layers (they keep their start). Earlier: layers that began at its start begin earlier too, keys staying put in time. Both ends use `o.trim` (`tree.normalize` keeps a trimmed group inside its layers).
- **Screen size by dragging:** with the Screens tool (or a screen picked by its name) the screen has a box with handles; drag an edge or corner to change its size. From the left or top its layers stay where they are on the board.
- **Recent projects and examples** (logo menu): Recent projects lists the last 8 projects you saved or opened (a copy is kept in this browser). Examples opens projects from the app's `examples/` folder; Save as an example file… makes one. Saved objects shows example objects from the same folder (Place here, edit a copy, add to my saved objects) and each saved object can be downloaded as an example file. List examples in `examples/index.js` (`SB.examples.add({ name, kind: 'project' | 'object', file })`); example files are small scripts (`SB.examples.data(file, data)`) so they load even from a folder (file://). `js/io/examples.js`. Example objects don't carry pictures.
- **Onion skin on the ruler:** with onion skin on and a drawing selected, a band around the playhead shows how many frames before and after; drag its ends.
- **Timeline bar:**
  - New buttons: Back one frame, Forward one frame, Onion skin.
  - A smaller default: Frame view (with Whole frames inside), Record voice, Record motion, then centered Back / Play / Forward and Auto key (with Keyframe, Next key, Previous key and Snap to keys inside), then Zoom.
  - Layouts (Settings › Project › Timeline bar, or the bar's ⋯): changes with the format (the default; Interactions only for the interactive web, no voice for Lottie, Unity/Godot and Blender), the same for every format, Adobe Animate (Flash), Premiere Pro, OpenToonz, Simple animation, Every button, or My default (⋯ › Save as my default). Changes you make are kept per layout; Reset goes back to it. `index.html?bar=flash` picks one from the address.
  - The editor shows a group with the icon it shows in the bar, and stays where you were in the list when you change something.

## Round 31 changes

- **Drawing frame by frame with Auto key:** on a drawing whose frames are picked with keyframes, with Auto key on, drawing where no Frame keyframe sits at the playhead makes a new blank frame and keys it there; the start gets a keyframe showing the first frame. Draw, move the playhead, draw again: a storyboard or a frame-by-frame animation (`SB.frames.autoFrame`, called by the brush and the pen).
- **Bar layouts:**
  - Timeline bar layouts no longer change with the format. OpenToonz is the default: Previous key sits inside Back one frame, Next key inside Forward one frame. Interactions is in every layout. Also Storyboard Studio, Adobe Animate (Flash), Premiere Pro, Simple animation, Every button.
  - The tool bar has layouts too: Storyboard Studio (default), Adobe Animate (Flash), Photoshop, OpenToonz, Simple.
  - Pick them in Settings › Appearance › Bars, or in a bar's editor. Your changes stay with each layout; **Save as a new layout…** keeps the bar as a layout of your own (listed with "(yours)", deletable). Kept with the preferences (`S.tbarLayout`, `S.tbarEdits`, `S.tbarCustom`, `S.railLayout`, `S.railEdits`, `S.railCustom`).
- **Layer colors** in Settings › Project are a grid of small cards (light and dark color in each).
- **Start dialog:** a simple one: Size (common sizes, each with a little screen in its shape, or Custom…) and Made for (each format with its icon and what it leaves out), then Start. The interactive web line is now: "Interactive web page with clicks, hovers and drags. Rive skips effects and video."
- **Welcome** (only on the first visit; Settings › Appearance › Show the welcome again): pick a style (Storyboard Studio, Adobe Animate, OpenToonz, Premiere / After Effects, Simple), shown as its tool bar, timeline bar and a few shortcuts, plus the theme; then See an example or Start. `js/ui/welcome.js`.
- **Examples:** the logo menu has one Examples list; the built-in tour (Open the example before) is its first entry.
- **Reset rig** (right-click a rig): every bone back to its rest pose (keyed at the playhead when the pose is animated or Auto key is on).
- **Transition preview:** the ▶ on a timed effect or transition (in the panel, or right-click its block in the timeline) runs the playhead over it once and puts it back; adding a transition previews it by itself (`SB.fx.preview`).
- **Effect blocks in the timeline rows:** right-click for Settings… (its controls in a pop-up), Preview, Turn off/on, Delete.
- **More interaction controls:**
  - IF: Variable (compare a number), Layer is shown, Drawing frame is, Chance (a % of the times), Rule ran (how many times).
  - DO: Change a variable (set, add, flip 0/1), Show / hide a layer (or switch), Show a drawing frame (a number, next, previous, random), Wait (the actions after it run later), Open a link.
  - Variables start at 0 each time the preview (or the web page) starts. These run in the preview and the exported web page; the Rive export doesn't carry them.

## Round 32 changes

- **Morph ease › Custom curve…** opens the curve editor (it did nothing before). It edits the morph's own curve (`k.mbz` / `k.mbzp`, the keyframe's normal ease stays as it is); its ▶ plays the morph on the stage.
- **Interactions button** shows in the timeline bar only on screens made for Interactive web animation (in every layout).
- **Start dialog:** its two dropdowns show pictures: each size as a little screen of that shape, each format with its icon and one line about it.

## Round 33 changes

- **A controller can morph a drawing between frames:** in a layer's controller link (Controls), when its points show different drawing frames, **Morph between frames** makes the lines of one frame morph into the other as the knob moves between the points (lines that don't match crossfade). Off: the frame switches halfway. `L.morph` on the link; `SB.controls.frameMorph` feeds `SB.frames.change`, so Lottie exports it too.
- **Design your own… starts from the controller as it is:** a left–right controller opens as a left–right line with its Left, Center and Right points (and the poses recorded on them stay).
- **A controller's name can be moved:** double-click its name tag on the stage and drag (`c.labelOff`).
- **Drawings start in Hold** (the frame library: a frame shows until a Frame keyframe picks another); "Pick with keyframes" is now called Hold and is first in the list. The built-in example's looping drawings say Loop.
- **The Drawing section** of a drawing's panel (Brush, Pen, Fill… buttons) is gone.
- **Bars:** the Rig action menu is in the OpenToonz (default), Adobe Animate and Every button layouts (it shows when a rig is on the screen); Every button has every button (Back/Forward one frame and Onion skin too). The tool bar has an **Every tool** layout.
- **Rounded boxes:** Shape › Corners › Round % (0 = square corners, 50 = a pill), can be animated (`radius`).
## Round 34 changes

- **Handle shortcuts (Edit points):** hold **Shift** while dragging a bezier handle to keep it flat or upright. **Shift+Ctrl** (⌘ on Mac) turns it in 45° steps and keeps its length. **Alt** still moves one handle on its own. The Points bar hint lists them.
- **Transform a drawing frame:** the drawing bar has a new **Transform** button. It works on the frame you see, or on every frame when *All frames* is on. In Edit points it works on the selected parts only.
  - **Scale %** and **Turn °** sliders update live.
  - **Flip** left–right or up–down.
  - **Lines → fills** turns each line into a filled shape of the same width and color, with round ends and joins (like *Outline stroke*). Closed lines become rings. Use Edit points to reshape the result.
  - This changes the drawing itself, not the layer's transform. One undo step undoes it.
- **Controllers with removed points:** when you delete the middle point of a controller in the designer:
  - The layer blends only between the points that are left.
  - The first pose moves to the nearest point that has no pose yet.
  - The knob rests on a remaining point instead of between two of them.
  - States of deleted points are ignored straight away. Linking a layer to a controller with no middle point records its first pose on the nearest point.
- **Convert a multi-frame shape:** *Convert to editable path* now turns the layer into a drawing and keeps every frame. Each frame gets the shape as a path, plus that frame's own lines, name and play mode. If the shape's size or colors are animated, each frame takes the shape as it looks when that frame first shows.
- **Fill brush:** the Brush bar has a third mode, **Fill**. You draw solid filled shapes with no outline, like Blender's solid fill brush. The fill shows while you draw. When you let go, it becomes a closed, editable bezier path. Smoothing applies.

## Round 35 changes

- **"This frame" box:** with the Select tool, pick *This frame* in the drawing bar. The drawing then gets a dashed box labelled "This frame only", and only the frame you see changes. *All frames* keeps the usual layer box, which changes the whole layer.
  - Drag inside the box to move.
  - Drag a corner to resize. The proportions stay the same; hold Shift to resize freely, or Alt to resize from the middle.
  - Drag a side to stretch.
  - Drag the round handle to turn. Shift turns in 15° steps.
- **Transform box in Edit points:** the Transform button now toggles the same box around the selected parts. A new **Line → fill** button turns the selected lines into filled shapes. The code is in `js/tools/framebox.js`.
- **Width tool (W):** like OpenToonz's pump tool. Brush over part of a line to make that part thicker, or thinner with the *Thinner* mode or by holding Alt.
  - Each line keeps its widths as a profile along its length: `s.wp`, or `sub.wp` for each part of a path. Editing the points keeps the profile.
  - *Even widths* resets the frame.
  - Width profiles render with round ends and carry over to *Lines → fills*.
- **Pull tool (U):** drag near a line or shape to pull that part of it. Points closer to the pointer move more, with a smooth falloff. Dragging the middle of a long curve adds a point there so the curve bends. Both tools are in `js/tools/sculpt.js`.
- **Combine parts:** in Edit points, select two or more parts and click **Combine**. Lines count with their width.
  - **Join into one shape**
  - **Subtract the front parts**
  - **Keep only the overlap**
  - **Remove the overlap**

  The result is an editable path in the place and color of the back-most part. Sharp corners stay sharp and curves are refitted. Uses `vendor/polygon-clipping.min.js` (MIT); the code is in `js/render/bool.js`.
- **Eraser modes:**
  - **Hide** (the old eraser) is non-destructive: the lines stay whole underneath.
  - **Cut** really cuts. Lines and paths split into separate pieces, keeping their width profiles. Shapes and fills lose the erased area.

## Round 36 changes

- **Box follows the drag:** while you drag the box, it now moves with the shape. Before, the change was applied twice, so the box drifted.
- **Edit points box, no Transform button:**
  - Click a shape (not a point) and its parts get the box.
  - Pick several points (Ctrl-click, Shift-click or box-select) and the box goes around just those points. Resizing or turning moves those points and their handles.
  - One point alone has no box, so you edit only that point.

  The box handles sit just outside the points, so the points stay clickable.
- **Ctrl+J / Ctrl+Shift+J:** like Photoshop. In Edit points, Ctrl+J copies the selected parts to a new layer above, and Ctrl+Shift+J moves them out. With a layer selected in Select, Ctrl+J duplicates it. The *New layer* button in the Points bar offers both.
- **Cut eraser:**
  - Each piece left after a cut is now its own part, so you can move it separately.
  - Parts the eraser missed are left exactly as they were.
  - Slivers are dropped, and the eraser line is simplified before cutting, so edges come out clean.
  - The eraser has its own **Smoothing** and **Stabilize** (rope) settings in both modes.
  - Combine also drops slivers.
- **Smooth curves:** bezier curves are now split into at least 12 steps (more for long ones) wherever they are turned into lines: hit tests, outlines, widths, tapers and draw-on. Before, they could look faceted when the drawing was scaled up or zoomed in. Straight segments stay a single step.

## Round 37 changes

- **Edit a rig without moving what's attached:** dragging joints with the Bones tool used to move the attached layers. Now the layers that bend with the rig or follow a bone stay exactly where they are.
  - It works by re-binding each attached layer at the current pose and moving its bone lines, for the automatic weights, to the new bones.
  - Deleting and re-parenting bones work the same way (`SB.rig.editSnap` / `keepAttached`).
- **Free (floating) bones, like Blender:**
  - **Delete bone** (also the Delete key in the Bones tool) removes only that bone. Its children stay where they are and hang on its parent. *Delete with its children* removes the whole branch, as before.
  - A bone's new **Parent** menu re-parents it, or sets it to none, keeping its place. When its start isn't on the parent's tip, it becomes a free bone with offset `ox`, `oy` in the parent's end frame: good for ears, eyes and hair.
  - A free bone is drawn with a dashed line to its parent, and you can drag its start dot.
  - Exports read the bone matrices, so Godot, Unity, Blender (FBX) and Rive carry free bones as normal child bones.
- **Morphs in game and Blender exports:** Unity, Godot, Blender (FBX) and Rive can't morph lines.
  - Their exports now save each morph as **in-between pictures**. You choose how many in the Export dialog's new **Morphs** setting: 0 to 12, default 3.
  - The pictures are named like `Frame 1 to 2 50%`.
  - Lottie and the web page still morph the real lines.
- **Bone list keeps its scroll:** picking a bone in the panel no longer jumps the list back to the top. Inner lists of the panel keep their scroll position.
- **Weight gradients reworked:**
  - **Old behaviour:** a gradient only tilted the automatic distance weights, so the result changed sharply in the middle, and stacking gradients piled up.
  - **Now:** a gradient sets the bone's weight directly, easing it toward 100% (Add) or 0% (Remove). It is full at the line's start and has no effect past its end, so the in-between values blend evenly over any length. Each gradient builds on the previous ones, and the other bones share what is left in the same proportions.
  - Strength 50% and up is full strength.

## Round 38 changes

- **Grab bones by their body (Bones tool):**
  - Drag the start part of a bone to move it. A connected child becomes a free bone that still follows its parent; a root bone just moves.
  - Drag near its tip (the last 40%, or anywhere with Alt) to turn it around its start. Shift turns in 15° steps.
  - A click selects the bone in the panel.
  - The pointer shows what a drag will do: a move cross, a turn arrow, or a hand on joints.
  - Attached layers stay where they are, as with joint drags (`SB.rig.editSnap` / `keepAttached`).
- **Auto-fix weights:** a new **Auto-fix** button sits in the Weights bar and under the selected bone in the Bones list. Each press (up to ×4) goes over all the weights of every layer bending with the rig:
  - Each point takes in the weights around it, so hard edges and stray patches soften, and leftover weights under 2% are dropped.
  - Your painting is kept underneath: you can paint on top, press again for more, or use **Undo fix** to go back.
  - Stored as `bind.relax`. Results are cached per point, and Godot, Unity and FBX exports use the same weights.

## Round 39 changes

- **Goal curve (Weights tool) replaces Auto-fix:**
  - **How to use it:** pose the rig where it looks wrong, pick *Goal curve*, and draw how the bent edge should run. The line is smoothed like a pencil line and keeps sharp turns.
  - **What happens:** each edge point near the line (within **Reach**) gets bone weights solved so its bent position comes as close to the line as the bones can take it. The solve stays near the old weights and runs on the simplex, so weights never go below 0 and always add up to 1.
  - **Smooth result:** neighbouring answers are evened out, and points past the line's ends are left alone.
  - **Rest pose:** it can't change, because no bone has moved there.
  - **Storage:** fixes are kept as `bind.goals` (`[x, y, r, {bone: weight}]`) and blend in on top of the painted weights. Exports use them too. *Clear fixes* removes them.
  - **Limit:** weights only mix where the bones take a point, so a shape the bones can't reach (for example, rounding the inside of a sharp elbow) is matched only as far as possible. For more, add a bone or split the bone into segments.
- **Weight tools in one menu:** the weight tools (Brush, Smooth, Gradient, Goal curve) are one dropdown button with icons.
- **Alt-drag makes a copy:**
  - With Select, Alt-drag copies a layer in place and drags the copy. Ctrl-click picks a layer deep inside a group, and the pivot moves only in *Move pivot* mode.
  - In Edit points, Alt-drag copies the parts within the same drawing.
- **Copy to frames:** a layer's right-click menu has *Copy this drawing to frames…* (or *Copy the selected parts to frames…*). It adds to the picked frames, or replaces what they have.
- **Fill bucket:** the barrier map is now the lines as drawn, including wobble and thin ends, plus a gap-closing middle line. The fill crosses the closed gaps, then tucks under the drawn line, never past it, so there are no gaps or leaks.
- **Make editable path** keeps the brush look: texture, thin ends, wobble and width profile.
- **Eraser always cuts** (the *Hide* mode is gone).
  - The cut uses the eraser line exactly as drawn (its soft curves) at its width.
  - Lines are cut where their round ends would poke into the erased area, so no ends show inside it.
  - Leftover crumbs are removed.
  - Shapes lose the erased area, which is built from short overlapping pieces so long wiggly strokes work.
  - The eraser now works in every target.
- **Sculpt tool sizes:** Smooth, Width and Pull sizes are in drawing pixels, so the circle grows when you zoom in, like the brush.
- **Adding physics part-way:** physics added part-way into a layer is keyed off at the start and on from that frame.
- **Sketchy lines draw on:** draw-on and draw-off now work with the *Sketchy lines* texture, and with bones bending them. The texture gets the trimmed or bent lines.
- **Removing effects:** the layer menu has *Remove an effect ▸* (each one, or all). Right-clicking an effect's row name in the timeline opens its menu.
- **Controllers in Edit points:** controllers can be dragged with Edit points too.
- **Shift adds to the selection:** with Shift held, the pointer shows a plus over things it can add: layers, parts, motion paths, and timeline rows, clips, keys, effect blocks and frames.
- **Pull, Width and Smooth with Auto key on a Hold drawing:** away from the start, these tools first copy the shown frame to a new frame keyed here. The start keeps showing the original.
- **Default timeline bar:** previous and next frame now sit inside the previous and next keyframe buttons.
- **Default tool bar:** Fill is grouped under Brush, and Width and Pull under Smooth.

## Round 40 changes

- **Arrow keys (default shortcuts):** arrows move the selected layers or points (1 px; Ctrl: 10 px). Shift + ← → steps one frame back or forward, Shift + ↑ ↓ jumps to the previous / next keyframe (Alt + ← → still works). With nothing to move, ← → step frames. All of them can be rebound in Settings › Shortcuts.
- **Lasso weights (Weights tool › Lasso):** draw a loop around an area. *Add*: the bone moves everything inside fully (100%). *Remove*: the bone moves nothing inside (0%). *Only here*: the bone moves the inside and nothing outside. Alt does the opposite of Add / Remove. *Soft edge* eases the weight across the loop's edge; *Strength* below 50% goes part of the way. A lasso is stored with the painted weights (`['l', v, soft, points, only, order]`); lassos and gradients apply in the order they were drawn, and the other bones share what's left in the same proportions.
- **Tween to frame by frame:** right-click a layer (or several selected keyframes) › *Tween to frame by frame…*. Pick *Hold each picture N frames* (on 2s, 3s…) or *A number of pictures*. Every animated value between the first and last keyframe (or the selected keyframes) is sampled at those times and kept as held keys, so the motion steps like drawn animation. Undo brings the smooth tween back.
- **Pen pressure:** drawing with a graphics tablet or stylus changes the line's width with pressure (a width profile, the same kind the Width tool makes, so it can be edited later and survives *Simple curve* and *Make editable path*). Each brush has *Pen pressure %* (0% ignores it). Once a pen is used, the brush bar shows a *Pressure* switch.
- **Brush editor, redone:**
  - A test pad: draw on it with the mouse, a finger or a pen to try the brush (pressure works there too).
  - The brush's *Kind* is a set of picture tiles: Smooth, Pencil, Chalk, Marker, Soft edge, Dashed, Sketchy, **Picture**.
  - **Your own pictures:** *Your picture…* adds an image (PNG with a see-through background works best; scaled to 256 px). It follows the line as *Copies along the line* (Illustrator's scatter brush: spacing, scatter, size change, random turn, turn with the line), *Stretched along the line* (art brush), *Repeats along the line* (pattern brush) or *Texture inside the line* (grain). It takes the line's color or keeps its own. Five starter pictures come with it, and new brushes Leaves, Stars, Dry brush, Rope and Boiling ink.
  - Pictures live in this device's brush library and are copied into the project when a line uses them (`doc.brushTex`), so the drawing keeps its look anywhere. Bent pictures are drawn without seams (strips are merged by their see-through-ness, not stacked).
  - **Animated lines:** *Boil* (redraws by hand a few times a second), *Marching dashes*, *Pulse* (a wave of thickness), *Flow* (the picture or grain slides along). Speed and Amount. They play in the app, videos, GIFs and web pages; game engines and Lottie get the still line.
- **Timeline bar:** *Storyboard Studio* is the default layout and looks like OpenToonz, with previous / next frame inside the previous / next keyframe buttons (also in *Simple animation*). The old default (saved as OpenToonz) moves to Storyboard Studio once. *OpenToonz* now has every button on its own. *Every button* shows every button, in groups between dividers. The Interactions button shows in every project (it offers to switch the project to interactive web).
- **Big stage with the properties panel:** press I, use the Properties button by the play controls, or the ☰ menu. The panel opens beside the stage (desktop), slides over it (tablet), or fills the small dock (phone) — and Big stage stays on.
- **Collapsible animation rows:** every group header in a layer's animation rows (Effect timing, Transform, the layer's own, each effect) folds with its arrow or by clicking its name; Alt-click folds or opens all of the layer's groups. A folded group shows its keyframes on the header.
- **Effect timing fixes:** a turned-off effect stays in *Effect timing* (dimmed), so it can be turned on again there. Each row has an eye (on / off) and a gear (its settings, the same as in the panel); double-click an effect block for its settings. Turning on/off from the menu or the panel is one action (an animated on/off gets a key).

## Round 41 changes

- **Start screen (Interactions):** with several screens, the Interactions panel has *Start screen*; *Starts with* then lists that screen's animations. Right-click a screen on the flow board › *Start the animation here*.
- **Shapes keep a shape per frame:** a shape layer with several frames stores each frame's own kind, size, corners, fill and outline (`frame.shp`). The frame on screen is edited through the layer's usual controls; switching frames swaps them, and every undo step keeps them all. Animated values keep their keyframes. New shapes start in *Hold* (keyframes pick the frame), like drawings. Shape frames can morph (their outline morphs too) or crossfade.
- **Weights › Smooth › Even out** (the new default): every bone's share moves toward the average nearby, so a 100% edge comes down and a 0% gap fills in. It works on painted, lasso and goal-curve weights (it is kept like goal-curve fixes, so *Clear fixes* removes it). *Undo paint* is the old smooth.
- **Goal curve:** *Freehand* or *Straight* (drag from one end to the other); Shift makes the line level or upright, in both. *Smoothing* and *Stabilize* steady the drawn line, and *Smooth result* makes the fixed edge rounder and cleaner (less exact).
- **Edit points:** a drag on a selected brush line or fill now moves the part (*Move*); *Bend* in the bar brings back dragging its points (with Soft edit). With nothing picked, the box holds the whole frame, as *This frame* does. Arrows move the selected parts (or, with nothing picked, the whole frame's drawing), not the layer; the same with Select when *This frame* is on.
- **Pen pressure with textured brushes:** dashed and sketchy lines with changing width (pressure, thin ends, the Width tool) keep their texture: they are drawn in short pieces, each as wide as the line there. The marker keeps its see-through look.
- **Line motion keyframes:** a drawing with animated lines has *Line motion* in its panel and timeline: *Speed %* and *Amount %* can be keyframed (speed is summed over time, so changing it never jumps; 0% amount stops the motion).
- **Blank keyframe** (Shift+K; F7 with the Animate keys; a new button in every timeline-bar layout): an empty frame shown from the playhead on; the start keeps what it showed.
- **This frame copy / paste:** with Select and *This frame* on (or Edit points with nothing picked), Ctrl+C / Ctrl+X copy the drawing of the frame shown, not the layer. Ctrl+V pastes it into the selected drawing's current frame, where it was.
- **Controllers:** each controller has *On* (keyframeable `ctrl:on`, in its panel, timeline row and right-click menu); off, its layers show their own animation and it is drawn faded. Each controller link in a layer's panel has its own on / off check.
- **Morph fixes:** frames whose lines moved (same number of points) now morph to where they are; the morph cache keyed on point counts only, so it kept the old place. Morph keyframes and controller morphs work on shape layers too.

## Round 42 changes

- **Godot: one Sprite2D per layer.** A layer is a Node2D with one Sprite2D "Picture". Its drawing frames are cells of one sheet (`hframes` × `vframes`), and the animation switches `frame` (an int, discrete). Controllers that switch drawings set `frame` too (`frame_nodes` / `frame_states` in `storyboard_controller.gd`).
- **Atlas:**
  - **Godot:** every layer's sheet (and every mask and bending layer's picture) is packed into one atlas PNG, `sprites/<name>-atlas.png`, with more pages only past 4096 px. Sprites use `region_rect`; bending Polygon2D layers use UVs into the atlas.
  - **Unity:** sprites stay one PNG per frame (so bones and weights keep working), and `<name> Atlas.spriteatlas` (a Sprite Atlas over the Sprites folder) packs them into shared textures in play mode and builds.
- **Godot controllers show in the editor:** every controller gets `storyboard_controller.gd` (`@tool`). It draws its knob, its box, line or circle (or just the knob when it moves freely), in its own color and with its name, on top of the pictures. Ones that drive nothing have `weight = 0`.
- **Unity controllers in the editor:** `StoryboardController` also follows the controller while you drag it in Edit mode (an editor update hook, plus `OnValidate`), so morphs and switches it drives show without pressing Play.
- **Morph in-betweens per morph, all of them:** the export's *Morphs* setting is per morph. Every in-between picture now shows, each at its own moment, even when a morph is shorter than a few frames of the export. The picture keys are exact times (`track.fev`, `SB.engines.picKeys`), not one per exported frame. Shape layers morph in exports too.
- **Animated lines → a loop of pictures (Unity, Godot):** the export has *Animated lines: A loop of 4 / 6 / 8 / 12 pictures*. A drawing with lines drawn by an animated brush becomes that many pictures playing 12 times a second (with the layer's *Line motion* speed and amount).
- **Brush editor kinds:**
  - **Solid** (Smooth, Soft edge, Marker), **Texture** and **Broken line** (Dashed, Sketchy). Each kind shows only its own choices; size, thin ends, wobble, pressure and animation are shared.
  - **Texture** lists the grains (Pencil, Chalk), the starter pictures, your pictures, *Your picture…* and **From the stage…** (pick a drawing, shape or text: its frame as it looks now becomes the picture).
  - *How the texture is used*: inside the line, copies along it, stretched along it, or repeating along it. Pencil and chalk inside the line keep their classic look; any other use turns them into a picture brush.
- **Brush files:**
  - *Import…* and *Export…* in the brush editor read and write a brushes file (`{ "app": "storyboard-studio-brushes", "v": 1, "brushes": [...], "textures": { id: { src, w, h, name } } }`). Import also takes the brushes kept in a project file.
  - **The project's brushes folder:** *Keep in this project* stores a brush in the project file under `doc.brushes` (its pictures in `doc.brushTex`). Opening the project adds those brushes to yours. You can also paste brush entries into that list in the file by hand. Edits to a kept brush are saved into the project when the editor closes.

## Round 43 changes

- **Bake into frames** (right-click a drawing layer, or a frame in the frames bar): its morphs and animated lines become real frames of its frame library, each held by a Frame keyframe (`js/model/framebake.js`, `SB.frames.bake(o, { morph, lines })`).
  - *Morphs:* the number of in-betweens for each morph (default 4). In-betweens are named like `1→2 50%`. They switch at the same moments as the morph's ease, so the timing stays.
  - *Animated lines:* the number of poses in each loop, at 12 a second (default 8). Each pose is the line held at one moment (`bs.an.fz`, the line's frozen time; `strokes.js` draws a frozen line at that moment). A held line no longer counts as moving, so exports don't loop it again.
  - Undo brings the live morph and moving lines back.
  - Shape layers need *Convert to editable path* first, because a shape morphs its own outline.
- **Trim loose ends (Ctrl-drag with the Brush or the Eraser):** every line the drag crosses loses the piece between its two nearest crossings with other lines, or its end. Overhangs past a corner vanish in one stroke (`js/tools/trim.js`).
  - A tap removes the line under the pointer back to its crossings.
  - A line that crosses nothing goes away whole.
  - Bezier paths are cut exactly on their curves (no refit), and closed outlines open up between two crossings.
  - Width profiles follow the pieces, and fills linked to the lines refresh.
  - While Ctrl is held, scissors show by the brush cursor, and the drag shows as a dashed red line.
- **Lottie mode removed:** *Web animation (Lottie)* is gone from the mode lists, because it was the same as *Interactive web animation*. Projects saved in Lottie mode open as web. The Lottie export in the Export dialog is still there. The mode picker now shows its four modes in two rows of two.
- **Unity controllers you can see:** every controller now gets the `StoryboardController` component, not only the ones that drive poses. Its gizmo draws in the Scene view in the controller's color:
  - a box (free);
  - a left–right or up–down line with end ticks (horizontal / vertical);
  - or a circle (dial);
  - plus the knob and its name.
- **Morph + animated lines export fix:** a drawing with both a morph and animated lines now gets every picture it needs in Unity and Godot (the line-loop pictures of its frames and the morph in-betweens).
  - *Animated lines* now defaults to a loop of 8 pictures, so moving lines move in Unity and Godot unless you pick *Keep still*.
  - A pose landing exactly on a frame boundary no longer picks the pose before it.
- **Godot sheets** use a near-square grid and scale down to fit 4096 px, so long frame lists stay inside the texture limit.

## Round 44 changes

- **Selecting keyframes with Shift:** Shift-click (like Ctrl-click) adds a keyframe to the selection, or takes it out. To select a range, use Shift+Alt-click: every keyframe between the last one clicked and this one.
- **Delete in the frames bar:** click a frame in the frames bar and press Delete (or Backspace). That frame is deleted and the layer stays.
- **Fill brush tool** (Shift+G, grouped with the Brush): it paints solid shapes. The area you draw around fills with the color, with no outline, and becomes an editable filled path.
  - It has its own *Smoothing* and *Stabilize* (with *Rope*): `S.fbSmooth`, `S.fbStab`, `S.fbStabR`.
  - The Brush no longer has a *Fill* mode. Saved settings that used it switch to *Detailed*.
  - A tool bar you customized also gets the Fill brush, placed next to Fill.
- **Controller designer:** select a point and press Delete (or Backspace) to remove it.
- **Interactive controllers** (`o.ixGrab`): a controller can be turned into something the viewer drags.
  - Turn it on in any of these places:
    - right-click the controller › *Make it interactive*;
    - the *Interactive* checkbox in its Controller panel;
    - in Interactions mode, the *Controllers the viewer can drag* list.
  - **In Preview and in the exported web page,** the controller shows on the stage (its box, line or circle, its points and its knob). The viewer drags the knob, or presses on the box to make the knob jump there, and it drives its layers live.
  - **In Rive,** the controller becomes pointer cells over its box, which set number inputs (like mouse follow). Rive has no knob to drag, and the knob itself isn't drawn; the export lists this as a warning.
- **Blank keyframe works on every frame layer:**
  - Layers whose frames play by themselves (Loop, Play once, Ping-pong) first become held frames picked by keyframes, showing exactly the same (`SB.frames.toKeys`).
  - When it can't act, the button is greyed out and its tooltip says why: no layer selected, a layer without frames, a locked layer, or the animation is playing (`SB.frames.blankWhy`).
- **Paints: see-through colors, gradients and textures** (`js/render/paint.js`). A color value can be:
  - `#RRGGBB`;
  - `#RRGGBBAA` (see-through);
  - `grad:linear|radial:<angle>:<color>@<0…1>,…`;
  - `tex:<picture id>:<scale>` (a repeating pattern of a brush picture or your own picture).
  - **The color panel:**
    - *Color* gains *Opacity* and a *Transparent* button; swatches show a checkerboard behind see-through colors.
    - *Gradient* offers linear or radial, an angle, and color stops you can add, move and remove.
    - *Texture* lists the pictures, plus *Your picture…* and a size slider.
  - **Where paints work:** fills, outlines, lines, bucket fills, shape fill and stroke, and text color and outline. Other colors (glows, shadows) stay plain.
  - **How they behave:** a see-through color blends when animated; gradients and patterns switch half way. Exports that need one color (Lottie, FBX) use the gradient's first color or the picture's main color.
- **Side-bar choices as dropdowns:** in the side bar (and an interaction rule's sheet on phones), word choices like *Show / Hide / Switch* show as dropdowns (`SB.w.segToSelect`). Icon choices stay as buttons. Choices that have no current value show *Choose…*.
- **Trim (Ctrl-drag) knows loops and line ends:**
  - A line's crossings with itself count, so a loop drawn in one stroke keeps its loop and only the tails outside it go.
  - Line ends that stop on another line count too: a T-junction, or the end left by an earlier trim.
- **Tutorials** (File › *Tutorials…*, in `js/tours/`):
  - **The gallery:** cards with a live looping preview of what you make. Click a card for its description, length, difficulty and what you'll learn, then *Start*.
  - **The practice screen:** a tutorial makes its own screen, *Tutorial: …*, so your project stays as it is.
  - **The guide:** a character you can drag, with a speech bubble. It:
    - states the goal;
    - introduces each tool with its key, shown as key caps (some steps only count when you press the key);
    - gives a small task for each tool that builds the animation, ticked off when done with a word of praise;
    - offers a hint and a *Show me* button after a while;
    - ends with tips.
  - **The three tutorials:** *Frame by frame* (a bouncing ball), *Bones and rigs* (a waving arm) and *Controllers* (a knob that lifts and recolors a ball, then is made interactive).
  - **Your own character:** set `SB.tours.GUIDE.moods` (`talk`, `point`, `cheer`, `think`) to your picture files (for example `assets/guide/talk.png`). Until then a dashed "Your guide here" placeholder shows.
  - **Adding a tutorial:** write `js/tours/<name>.js` calling `SB.tours.add({ id, title, blurb, desc, minutes, level, learn, preview(ctx, t, w, h), setup(T), steps })`, and add its `<script>` after `js/tours/tours.js`. The step format is described at the top of `js/tours/tours.js`. `SB.tours.at.tool / title / sel` point the ring at buttons.

## Round 45 changes

- **Picking several frames** in the frames bar:
  - Ctrl-click adds a frame to the pick or takes it out. Shift-click picks every frame from the last one clicked.
  - Delete, copy, paste, duplicate (and the right-click menu) work on all picked frames. Dragging moves them together.
  - Frame keyframes keep showing the same drawings. A key whose frame was deleted shows the frame before.
- **Auto key on Hold puts the new frame in order:** drawing where there is no keyframe inserts the new frame right after the frame showing there, not at the end. Later frames move up one and their keys follow. Blank keyframe does the same.
- **Designed controllers in the side bar:**
  - The point map fits a small area whatever the controller's proportions, so a tall up–down controller no longer makes a huge empty panel.
  - Crowded points show as dots, with their names on hover. *Names: hide when crowded / always / never* switches this (`S.ctrlNames`).
- **Interactive controllers:** *Shows: its line or box / its knob* (`o.ixLine`, `o.ixKnob`) hide either part in Preview and the web page. A hidden knob can still be dragged.
- **Gradient tool** (Shift+F, after Fill brush; `js/tools/gradient.js`), like Illustrator's:
  - Drag across a shape or a drawn part to lay a gradient.
  - The gradient shows as a line: drag its ends to move, turn and stretch it (for radial: its middle and edge); drag the line to move it.
  - Slide the color dots along the line. Double-click the line for a new color; Delete removes the picked color.
  - The bar picks fill or outline, switches Linear / Radial, and has *Reverse*.
  - Gradients keep their place in the paint string (`grad:…:cx,cy,len`).
- **Checkbox rows in the side bar** start at the left and their text wraps (`.f.full`), instead of starting in the value column cut short.
- **Eyes follow a controller…:** on the stage, move the pointer away from an eye to set how far the eyes can look (a ring shows round each eye), then click. Esc cancels.
- **Tutorials, much more guided:**
  - **Spotlight:** while a step points at something, the rest of the app dims and can't be clicked; only the place to use stays open. Keys other than the ones the step teaches (and undo) do nothing, and the guide shakes if you try.
  - **A mouse picture** shows what to do: click, right-click, double-click, drag or scroll.
  - **Pink dashed guides** on the stage show where to draw, which dots to click and where to drag.
  - **Skip** does the step for you.
  - The text is short, with a progress bar.
  - Timeline steps are their own steps: the ruler at a time, a layer's row, a keyframe.
  - Menu steps point at the item to choose next.
  - The guide moves out of the way of what it points at, until you drag it yourself.
  - **Five tutorials:**
    - *Drawing tools* (a cat: Brush and brushes, colors, Fill bucket, Fill brush, Eraser);
    - *Frame by frame*;
    - *Keyframes and tweens* (K, the ruler, Auto key explained, easing, bending the motion path);
    - *Bones and rigs*;
    - *Controllers*, now eyes that look around: pick the pupils, Eyes follow, set the reach, drag and keyframe the knob.
- Tutorial format additions (see `js/tours/tours.js`): `allow`, `mouse`, `at`, `ghost`, `free`, `keys`, `enter`; helpers `SB.tours.at.row / keyAt / rulerAt / item`, and `T.near()` / `T.timeAt()` for checks.

## Round 46 changes

- **Tutorials have no voice** any more (it was removed).
- **Drawing steps wait for you:**
  - A step where you draw or drag on the stage goes on only after you have worked at it a few seconds and stopped (no stroke in progress, nothing changed for 1.5 s).
  - Even then it doesn't jump on: the guide praises it and shows *Next*, so you finish when you like.
  - Other steps go on a moment after they are done. `minTime` (ms) sets a step's own wait.
- **Tutorials never lock you out:**
  - If what a step points at isn't on screen (scrolled away, or a bar laid out without it), it is scrolled into view; if it still can't be seen, nothing is dimmed or blocked for that step.
  - A shortcut step also counts the button the ring shows, with a toast reminding you of the key.
- **Drawing tools tutorial:** new steps for Smoothing and Stabilize (in the Brush bar), the cat's mouth (a small "w" on a guide) and the Smooth tool. The Eraser step now cuts a notch in an ear tip instead of the head.
- **Eraser without spikes:**
  - The erased area is now made of round pieces along your stroke (always convex), so a scribble that turns back sharply no longer leaves thin spikes.
  - Any spike sharper than about 18° left right at the eraser's edge is taken off the shape (`despike` in `js/render/bool.js`).
- **Gradient tool:**
  - The bar above the stage shows the gradient's colors; click one for its color and opacity.
  - On the stage, double-click a color dot for the same panel (color and opacity only).
- **Tutorial maker** (Settings, the small *Tutorial maker…* link at the bottom; `js/tours/maker.js`). Make tutorials without code, kept with your own settings (`S.myTours`), with *Export* / *Import* to move them as a file.
  - **New**, or **copy a built-in:** the copy keeps the original's start and each step's check, and can show instead of the built-in.
  - **Per tutorial:** title, card text, description, what you'll learn, level, minutes, the closing line. *Start with* saves the screen you are on as the practice screen's starting point.
  - **Per step:**
    - what the guide says;
    - **Goes on when**, one of the magic rules: they press Next; a tool is picked; a shortcut is pressed; a layer is selected; they draw new parts; a layer changes; a layer has frames; a layer has keyframes; the playhead is at a time; it plays or stops; Auto key is on or off; a menu opens; they click what it points at; some seconds pass; a JavaScript check of your own (for a copied step, also "as in the original step");
    - the shortcut to teach;
    - **Point at**, with *Pick on screen*: click any button or panel, and a selector is made for it;
    - what can be clicked (the stage, or everything with no dimming);
    - the mouse picture and where it goes (click on the stage to place it);
    - guides on the stage (dot, circle, line, arrow: click to place them);
    - a minimum wait, a hint, and a tips card.
  - Steps move up and down, duplicate and delete. *Try it* and *Test from here* run the tutorial (`SB.tours.start(id, step)`).
  - Your tutorials appear in the gallery marked *Mine*.

## Round 47 changes
- **Tutorial maker only under Settings › Project.** The link is gone from the other tabs.
- **Tutorial studio, on the screen** (js/tours/studio.js, replaces the long list as the main editor):
  - A small panel docked at the bottom; drag it by its grip. The guide shows the step live, right where learners will see it; Back/Next walk the steps.
  - Steps are numbered chips with the guide's face: click to edit, drag to reorder (or the ‹ › buttons), Shift/Ctrl-click to pick several and **Combine** them into one, duplicate, delete, add.
  - Each step: the text, the guide's **face** (calm, talking, happy, cheering, wink, idea, thinking, looking, surprised, sad), when it goes on (the magic rules), what it points at (pick on screen), the mouse picture, the key it teaches, the **bubble side** (auto/above/below/left/right), a tip card. **Drag the guide** to place it for that step.
  - **Draw on the screen**: arrow, line, box, ring, free path, dot. Over the stage they follow the stage as it zooms; elsewhere they stay on the window. Pick a drawing to recolor it, make it solid, label it, delete it, or turn it (a free path too) into an arrow, a line, a box or a ring.
  - **Record**: do the thing in the app and each action becomes a step with its words, rule and pointer: the tool you pick (key or click), keys you press, Play/Stop, buttons you click, right-clicks, menu items ("Choose Ease › Bounce"), drawing on the stage (your stroke becomes a path), dragging (an arrow), selecting (a ring), clicking the ruler (a time rule). Then fix the words, combine and tidy.
  - More (⋯): title and card text, **character** (Pip, Mo, or your pictures), start screen, copy a built-in, **order of the tutorials** in the gallery, export/import, the old full list, delete.
- **New guide faces** (js/tours/faces.js): two drawn characters with ten moods; the face talks, breathes and hops, and its look follows the step (tips get the idea face, tasks the looking face) unless you pick one.
- **Tool bar (Storyboard Studio layout):** the bucket (Fill) and the Gradient are their own group now, apart from the brushes (Fill brush stays with Brush). A tool bar you had changed gets the same split once.

## Round 48 changes
- **Tutorial maker: move and size what you drew.** With the pick tool (the arrow, first in the Draw row), click a drawing, then:
  - drag it to move it;
  - drag a corner handle to size it (Shift keeps its shape; a circle stays round);
  - for an arrow or a line, drag either end.
- **Move the mouse picture.** Drag it where it should be. Over the stage it stays with the stage; elsewhere it stays in place on the window. "Mouse: back to its target" puts it back on what the step points at. A mouse picture with nothing to point at shows mid-screen in the maker, so you can drag it into place.
- **Right-click steps say exactly what to choose.** The step's "A menu opens (right-click), then…" option has a **Then they choose** field, for example `Ease › Bounce`. Type it, or press **Pick from the menu**: open the menu in the app and click the item.
  - The learner first sees the right-click on its target, then, once the menu opens, a click picture and a ring on the item (on Ease, then on Bounce once its submenu opens).
  - The step goes on only when they pick that item; a different item doesn't count.
  - Recording a right-click and then a menu choice makes one step: "Right-click here, then choose Flip › Flip horizontally."
- Fixes:
  - A menu item whose submenu is open now stays highlighted.
  - The tutorial check for "a menu is open" now really checks that one is showing.
  - The keyframes tutorial's "Do it for me" no longer breaks menus.

## Round 49 changes
- **Fix:** in the tutorial maker, the ⋯ (More) menu and its submenus opened *behind* the panel. Context menus now sit above the maker panel. The tutorial ring and mouse picture still show on top of a menu item, so right-click-then-choose steps look right.

## Round 50 changes
- **Points tool, reworked to behave like Figma and Illustrator:**
  - Clicking a point selects only that point, even before its part is selected. Unselected points are hollow, selected ones filled.
  - Handles show, and can be grabbed, only for the one selected point. A sharp point has none.
  - Points win over handles. A sharp corner's hidden, zero-length handles are never grabbed. This was why dragging a shape's corner bent the outline instead of moving the point.
  - Dragging several selected points moves them all. A click without dragging on one of them selects just that one.
  - **Double-click** one point to make it smooth (handles appear) or sharp again. With several points selected, double-click does nothing.
  - Shift-click or Ctrl-click adds or removes a point; Ctrl+Shift-click selects every point between.
  - Box-select picks the points of any path in the drawing.
- **Several parts selected (Points tool):** set the **Line** color, the **Fill** color and the **Width** of all of them at once. Width shows "mixed" when they differ.
- **Shapes:**
  - The line and speech bubble are gone from the shape lists. Older projects still draw them.
  - Triangle is now **Polygon**, with a number of corners (3–60), set with − / + or a slider in the inspector, or "Corners" on the bar.
  - The **Star** has a number of points too.
- **The tutorials folder** (`tutorials/`, see `tutorials/README.md`):
  - `config.js` holds the default guide, the guides, the tutorial files to load, and the gallery order.
  - `characters/<name>/<mood>.svg` holds animated SVG guides (Pip, Mo), ten moods each. They breathe, blink, talk, sparkle… Edit them in any vector app. `preview.html` shows them all.
  - `lessons/` holds the built-in tutorials, moved from `js/tours/`.
  - `my-tutorials/` takes your own: in the maker, **⋯ › Save as a file for the tutorials folder**, then list the file in `config.js`.
  - **Default guide:** set it in `config.js` (`character`), or in the maker: **⋯ › Default guide of every tutorial**. A tutorial can still pick its own.
- **Starting a tutorial with a ready screen:** in the maker, **⋯ › Start like this screen (layers and settings)**. This now also saves the tool, the playhead, Auto key, onion skin, the brush and the selection.

## Round 51 changes
- **Color picker:** the Transparent button is gone; the Opacity slider uses the whole row (0 is see-through).
- **Mask:**
  - "Use as mask for the layer below" always makes a new group of just the mask and the one layer under it, also inside another group (the new group sits where they were).
  - The Mask item keeps its place in the layer menu (right after Effects), masked or not.
- **Timeline:** with several layers selected, drag any of their names to move them up or down together. They keep their order, and can go into a group.
- **T** adds text.
- **Mode names:** Video, Interactive, Game Engine, Blender (FBX).
- **Export:**
  - "Export as" lists Video, Sprite sheet, Images, **SVG animation**, **Interactive** (Format: HTML, Rive or SVG), **Game Engine** (Format: Unity or Godot), Blender and Lottie.
  - **SVG animation:** every frame as shapes, shown in turn, with no script. Loop or play once. Frames that look the same are kept once.
  - **Interactive › SVG:** the same SVG, but it waits on its first frame and plays when you click it, or point at it; clicking again starts it over. SVG can't hold rules, screens or controllers: that is HTML.
  - **Sprite sheet › SVG:** the sheet as one vector SVG (with the JSON for Phaser and PixiJS).
  - The SVG comes from the same drawing code as everything else (js/io/svgctx.js): lines, fills, text and gradients are shapes. Effects SVG can't draw (erasing, blurs, shadows, textures) become pictures inside it, so it always looks like the app.
- **Tutorials** (see tutorials/README.md):
  - **Task** steps: the learner tries it alone, with the whole app free to use, plus a **Hint** button and **Done**.
  - A **picture** in the guide's bubble.
  - A **drag path**: click the points the drag goes through, and the mouse picture travels along them.
  - **Right-click steps** block other clicks and tools until the menu shows (a long press still works on touch).
  - A **cover** picture for the gallery card.
  - **Groups** in the gallery (Drawing, Animation, Rigs and controllers, My tutorials…), with chips to filter.
  - Dialogs, menus, color pickers and messages now show above the maker's panel.

## Round 52 changes
- **Tutorials:**
  - A task step's heading is just **Task**, with a notepad icon.
  - You can drag the guide by its speech bubble too, not only by the character; its buttons still click.
- **Points tool:** double-click empty space to go back to the Select tool.
- **Trimming lines** (Ctrl-drag with the Brush or Eraser): a line that stops where it crosses a thinner line no longer shows its round end on the other side. The new end steps back just enough, using both widths and the angle they cross at.
- **Mirror** (Brush, Fill brush and Eraser): turn on Mirror in the top bar and what you draw is drawn again, mirrored.
  - Drag the dashed line's middle dot to move it, and its end dot to turn it (Shift: 15° steps).
  - In the bar: Upright, Level or any angle, and a button to put the line back in the middle.
  - It is right on moved, scaled and turned layers too.
- **Fix:** erasing across a line drawn with pen pressure could stop with an error.

## Round 53 changes
- **Fill**: the gap closer no longer blocks narrow corners and wedge tips. Pixels in thin notches next to the filled area are taken in (js/render/raster.js `notches`). A click inside a tiny corner fills it without gap closing.
- **Order of drawing parts**: with parts selected in the Points tool, the bar and the right-click menu (Order ›) have Bring to front / Forward / Backward / Send to back.
- **Join points**: select two open path ends. The right-click menu offers "Join the two points" (merge at the middle) and "Connect them with a line"; the same buttons are in the bar. Two ends of the same path close it.
- **Mirror** now also works with Pull, Width and Smooth.
- **Pull falloff**: choose Smooth, Sphere, Root, Sharp, Linear or Constant from the bar. Each option shows its curve.
- **Dashed lines**: Dash length and Space (× line width) are set in the brush bar, the brush editor, and the bar for selected dashed lines (`bs.dl`, `bs.dg`).
- **My actions** (js/ui/macros.js): Settings › Shortcuts › Record a new action. It records shortcuts and layer right-click menu items. Then you name it, set a shortcut, and can play, edit or delete it.
- **Tutorial maker**: the step strip keeps its horizontal scroll. Previous/next buttons (Alt+←/→) and "Step i of n" are at the top, together with Duplicate and Delete. Move earlier/later stay at the bottom.
- **Controller fix**: on layers that already had keyframes, editing a pose saved the drag as a temporary preview (lost) or changed the layer's own keyframes. Now the layer's animation is set aside while you edit a pose and restored afterwards.
- **Side panel**: adding Effects, Controller, Rig, Physics or Mask from the right-click menu opens and scrolls to that section when the panel is open.

## Round 54 changes
- **Controller spots follow a moved layer** ("Adds: On top"). Each spot is now stored as a change from the center spot, so after you move a layer (an eye with its pupil), opening a spot shows it where the layer is now, and saving keeps it relative. Editing the center spot moves the layer itself (its keyframes shift). `showPose` / `savePose` in js/rig/controls.js.
- **Controller › Edit multi objects**: in the Controller section (or the button in the bar above the stage), click a point. Every layer the controller moves shows its pose there. Select and move, scale or turn any layers, several at once, then press Save in the floating bar. Layers you changed that it did not move yet get the controller added (`enterMulti`, `saveMulti`, `endMulti`).
- **Group box**: with two or more layers selected, one box goes around all of them (js/tools/groupbox.js). Corners scale them together (Alt: from the middle), sides stretch (Alt: from the middle), and the round handle turns them around the middle (Shift: 15° steps).
- **Fill between close lines**: "Close gaps" now reaches past the edge of thick lines; before, it sat inside lines wider than twice the gap (pen lines), so it did nothing. Thin slivers left at sharp tips are filled however long they are.
- **Line → fill keeps the brush**: thin ends, width changes, wobble, dashes (one shape per dash), rough doubled lines, opacity, and the pencil, chalk, marker or soft look (`ftx` on the fill) (`G.outlineLook`).
- **Button names**: when Settings › Button names is off, icon buttons in the bar above the stage show only their icon (the name is in the tooltip). Buttons that show a current choice (the line style, "Lasso ▾") keep their text.

## Round 55 changes
- **Several controllers move together**: with two or more selected, dragging one's box moves every selected box, and dragging a knob moves every selected knob. Clicking one of them keeps the selection.
- **Removed** Controller › Edit multi objects (the round 54 bar, button and floating Save bar). Editing spots one layer at a time, and the relative "On top" spots, stay.
- **Snap points to points**: with Snap on, a path point dragged with Edit points (alone or with others) lands on another path point or line end within about 9 screen pixels; a pink ring shows it. Hold Alt to drag without snapping (`snapPoint` in js/tools/pen.js).
- **Brush bar**: the Dash and Space sliders for the dashed brush are gone. They stay in the brush editor and for selected dashed lines.
- **Drawing on another screen**: the Brush, Fill brush or Pen pressed on another screen first makes that screen the one you work on, so the line goes into a new drawing layer there (`SB.board.drawOn`).
- **Pull falloff that shows**: on paths (pen lines, shapes made into paths) the part within reach gets points every quarter of the size before pulling, so Smooth, Sphere, Root, Sharp, Linear and Constant bend it as differently as they do freehand lines.
- **Tool descriptions behind "?"**: the long description at the end of a tool's bar is now a "?" that shows it on hover (and on click), for every tool. Status messages (recording) stay visible.

## Round 56 changes
- **Controller snap**: with Snap on, a controller's knob snaps only to its own points (center, left, right… or designed points) within about 12 screen pixels, never to other layers' edges (`ctrlSnap` in js/tools/select.js).
- **Controller › Add and edit layers** (the Controller section, or "Edit layers" in the bar above the stage). Pick a point; every layer the controller moves shows its pose there. Select any layers and move, scale or turn them (several at once).
  - A small window stays open while you do: the controller's name (click it to show the controller in the panel), its points as a map (the point being edited is big, recorded points are filled, click another point to save and go on there), the layers in the edit as chips (click one to select it, × to take it out; layers you changed are marked "new" and get the controller on Save), and Save / Cancel.
  - The Controller section lists the layers it moves the same way at any time (× stops the controller moving one).
  - Code: `enterMulti`, `saveMulti(next)`, `unlink` in js/rig/controls.js; `pointsMap`, `layerChips`, the 'ctledit' panel in js/rig/ui.js.
- **Looping frames**: in the frames bar, select frames (Shift-click), right-click › Loop these frames. The frames before them play once, then they repeat until the layer ends. On a Frame library drawing, a keyframe on a looping frame plays the loop from there. Marked `f.lp` on the frames (an orange line, ↻ on the first); right-click › Stop the loop.
- **Action strips** (js/rig/actseq.js): a rig with actions gets an "Action strips" section. Move the playhead, then Add at the playhead: from there the rig plays that action, looping, until the next strip. Each strip has a Blend time to go over smoothly from the one before. They show on the rig's clip in the timeline (click one to change its action or blend, or remove it). "Play" off mutes them, so you can edit an action. Video export shows them; Unity, Godot and Blender export each action on its own.
- **Tutorials, remade and extended** (tutorials/lessons, listed in tutorials/config.js). 15 short lessons in 6 groups, ordered by how much you need them:
  - **Start here**: Drawing (brush, size, eraser, smooth), Keyframes and tweens, Frame by frame (five frames, Detailed vs Simple curve, Fill brush, onion skin).
  - **Drawing**: Fills and shaping (fill bucket, fill brush, width, pull), Vectors (the Pen, points, handles).
  - **Animation**: Physics, Follow (a hand grabs a ball).
  - **Rigs and controllers**: Bones and rigs, Controllers (the eyes, moving the controller's box), Advanced rig (weights, bending).
  - **Effects and video**: Effects and transitions, Masking, Video basics.
  - **Interactive and export**: Interactive basics, Game engines (Unity and Godot: what you can make, pros and cons).
  - Each one uses simple shapes, ends with a small task you do alone, and goes back to the start before playing once there are two keyframes.

## Round 57 changes
- **New name: Toonzi 2D.** File tags (`storyboard-studio`, `storyboard-rig:`) are unchanged, so earlier projects, brushes and exports still open.
- **GitHub-ready**:
  - a new README.md (features, quick start, structure, how to add your animations);
  - this changelog (the old README);
  - LICENSE (MIT at first; AGPL-3.0 since round 59), .gitignore and .nojekyll;
  - docs/index.html, a documentation page for every tool;
  - docs/media/, with animations exported from the app.
- **Action strips in the timeline**:
  - right-click the rig's clip › Add action strip at Ns › an action (at the time you clicked);
  - drag a strip's name to move it, and its small round handle to change the blend;
  - click a strip to change its action, pick a blend (none, 0.25, 0.5 or 1s, or other) or remove it.
- **Loop keyframes** (right-click a layer › Loop keyframes): its keyframes play, then start again from the first one for as long as the timeline runs (`o.kloop`, `SB.tracks.loopT`). A "↻ loop" badge shows on its clip. The Looping frames option from round 56 is removed.
- **Show only this in the timeline** now locks every other layer: they can't be picked or dragged until you show all layers again (`tree.soloOut`).
- **Reset controller** in a controller's right-click menu: the knob goes back to its rest point.
- **Physics › Hits** (Ground / Ground + walls / Only surfaces) is out of "More", next to Weight and Bounce.
- Fixes:
  - an exported web page no longer copies an opened example's script or tries to load the tutorial lessons;
  - a stale "GIF" mention is removed.
- **Tutorials** (22 now):
  - **New group "Quick and powerful"**, near the top: Auto key hop, Logo reveal (transitions and effects), Slingshot (keys, then physics), Dynamic bones (a wobbly antenna), Living lines (animated brush), Wrecking ball (physics hanging from a rig, a solid wall), Action strips.
  - **Cleaned-up practice art**: exact pen paths for the house; the ball is on top of the hand in Follow; cleaner arm, cloud and weights previews. A shared helper (tutorials/lessons/art.js) draws these shapes.
  - **Frame by frame** moved to Animation.

## Round 58 changes
- **GIF export** (Export as › GIF; js/io/gif.js, no library). Each frame gets its own 256-color palette (median cut). Options: colors (256/128/64/32), Smooth gradients (dithering), Loop, and a transparent background (1-bit). Delays are in hundredths of a second, at most 50 fps.
- **Pull tool on paths**: no more steps or kinks. A point's handles now turn with the slope of the pull (the same turn for both handles, so smooth points stay smooth).
- **Sprite sheet editor** (Export › Sprite sheet › Arrange frames…; js/io/sheeteditor.js):
  - drag frames to reorder; pick with click, Shift or Ctrl; delete or bring back deleted frames; move picked frames to the start;
  - name frames (double-click) and name animations from the picked frames (they go in the JSON `animations`);
  - remove duplicate frames (they share one cell); set columns and padding.
  - The layout is saved with the project (`S.doc.sheets[screen]`), so the next export keeps every frame in the same cell; new frames go at the end; a different frame rate is mapped by time.
- **Game engine frames**: in the export dialog, "Morphs" and "Animated lines" are now number fields. Right-click a drawing › Game engine frames… sets this layer's own counts (`o.expMorph`, `o.expLine`), which override the export dialog's numbers.
- **Pen fill color**: the Pen's Fill now has its own color (it used the line color). In Edit points, a closed shape without a fill shows a Fill color button.
- **Tutorials gallery**: the selected tutorial's details stay in view while the cards scroll.
- **Settings**: Effects and Transitions are one tab, "Effects & transitions". The logo menu's "Save as an example file…" is removed.
- **Dialogs stack**: a dialog opened from another dialog (a prompt, the sheet editor) sits on top, and closing it brings the one below back.
- **Clean up weights…** (Rig section, or the weights tool bar; js/rig/weightfix.js).
  - **Analysis:** it samples every bound layer and finds points with no weight, weights that don't add up to 100%, broken values, spikes, stray patches, far-away bones, too many bones and tiny leftover shares.
  - **Fix:** it repairs these with goal fixes, pulling spikes toward their neighbours, smoothing rough spots, pruning tiny shares and capping the number of bones, and leaves firm cores alone.
  - **Pose check:** each change is tested against the rig's keyed poses and test turns. A change that moves a healthy point more than the allowance (Gentle/Normal/Strong) is softened or skipped.
  - **Dialog:** plain-language counts, Preview, Show original/cleaned, Apply (undoable), Cancel. Problem spots are ringed on the stage.
- **Toonzi the mascot**:
  - the new logo (assets/logo.svg: the top bar, the welcome screen, the browser tab, the README);
  - the default tutorial guide, with 10 moods told mostly with the eyes (tutorials/characters/toonzi).
- **The built-in example is now a 27-second trailer for Toonzi 2D**:
  - Draw it, Ease it, Style it, Rig it, Drop it;
  - then the logo reveal, built with animated brushes, eases, effects and transitions, masks, a bending rig with a controller and action strips, and physics.
- **Tutorials** (24):
  - **Show me instead of Skip:** guidance replays and a short extra hint appears; "Do it for me" only after about 25 seconds or two Show me presses.
  - **A learning path in 7 numbered groups:** every lesson uses only what came before. A new "Actions" lesson comes before "Action strips"; a new "Storyboard" lesson covers Hold frames with Auto key.
  - **Every lesson ends with a real Task step.**
  - **Click or shortcut:** tool and button steps accept either.
  - **Game engines** explains the new frame counts.

## Round 59 changes
- **License: GNU AGPL-3.0-or-later** (LICENSE; README › License explains it in plain words). Anyone may use, share and change Toonzi 2D. A changed version that is shared, or run on a website for others, must publish its source under the same license. The animations people make stay theirs.
- **Top bar**: just the mascot, with no box and no arrow, next to the project name (bolder). Light theme: assets/logo.svg. Dark theme: assets/logo-dark.png, the light-outline mascot.
- **Trailer (the built-in example)**, now 34 s:
  - opens on "Welcome to Toonzi" with the slogan "Everyone can animate";
  - a new "Play it." shot shows Unity and Godot export and an interactive web page with a button that reacts to a click;
  - the logo shot ends on "Everyone can animate", and the formats line includes GIF and Web.
- **Tutorials**:
  - the guide has a white outline, so it reads on dark screens;
  - the mouse wheel scrolls the dimmed panels during a step (e.g. down the right panel to a bone's segments);
  - "Effects and video" is now the second group.

## Round 60 changes
- **Tutorials gallery**: up to 1360 px wide on big screens, with up to 4 columns of cards next to a wider details column.

## Round 61 changes
- **First visit: tutorials right after the welcome.** Pressing Start in the welcome now opens the tutorials gallery ("Learn Toonzi in a few minutes"), so new users can try a lesson first. "Skip, I'll explore on my own" (or closing it) goes on to the usual start dialog. The logo menu › Tutorials… is unchanged.

## Round 62 changes
- **README: a fun, simple first view.** The top of README.md now has the mascot (the light or dark logo, matching GitHub's theme), the slogan "Everyone can animate", two big buttons (Open Toonzi 2D: https://idont12.github.io/toonzi-2d/, Read the docs: https://idont12.github.io/toonzi-2d/docs; drawn as docs/media/btn-open.svg and btn-docs.svg), the hero animation, four friendly feature tiles and "Start in 3 steps". All the technical parts are kept below, under "For developers". Out-of-date lines fixed (24 tutorials with Toonzi as the guide, GIF export, the Pages links).
- The first-visit tutorials text now names the logo menu (click the logo › Tutorials…) instead of a File menu.
