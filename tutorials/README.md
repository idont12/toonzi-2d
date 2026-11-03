# The tutorials folder

Everything about the tutorials you may want to change lives here. You don't need to touch the app's code.

| What | Where |
|---|---|
| The default guide, the guides, the tutorial files, the gallery order | `config.js` |
| The guides' pictures, one per mood | `characters/<name>/<mood>.svg` |
| The built-in tutorials | `lessons/*.js` |
| Your own tutorials, saved from the maker | `my-tutorials/*.js` |
| A page showing every guide in every mood | `preview.html` (open it in a browser) |
| The logo | `../assets/logo.svg` |

## Change the default guide
- In the app: **Settings › Project › Tutorial maker… › ⋯ › Default guide of every tutorial**. This is saved on this device.
- For everyone: set `character` in `config.js`. The default is `'toonzi'`, the round purple mascot (its eyes do most of the acting). Pip (`'pip'`) and Mo (`'mo'`) are still there.

A single tutorial can still pick its own guide: in the maker, **⋯ › Character**.

## Change a guide's look
Each mood is one picture: `idle, talk, happy, cheer, wink, idea, think, point, surprised, sad`.

The pictures are **animated SVG**. Each file has a `<style>` block with its animations (breathing, blinking, a talking mouth, sparkles, a light bulb…). The animations move the groups with the classes `body`, `eyes` and `mouth`.
- Open a file in a browser to watch it.
- Edit it in any vector app (Inkscape, Illustrator, Figma) or a text editor.
- Keep the `viewBox` (0 0 100 100).

`.png`, `.gif` and `.webp` pictures work too: set `ext` for that guide in `config.js`. A missing mood shows the guide's `talk` picture.

## Add a guide
1. Make a folder: `characters/fox/`, with the ten pictures (copy Toonzi's or Pip's to start).
2. In `config.js`, add it to `characters`: `fox: { name: 'Fox', folder: 'tutorials/characters/fox', ext: 'svg' }`.
3. Open `preview.html` to check it. It now shows in the maker's Character list.

A Rive (.riv) guide isn't supported yet. Export its moods as animated SVG, GIF or WebP, one file per mood.

## Tutorials as files
- **Built-in** tutorials are code, in `lessons/` (format: the top of `js/tours/tours.js`).
- **Yours:** make one in the maker (Settings › Project › Tutorial maker…), then **⋯ › Save as a file for the tutorials folder**.
  1. Put the file in `my-tutorials/`.
  2. Add `'my-tutorials/<name>.js'` to `files` in `config.js`.

  It then shows in the gallery for everyone who uses this folder. The file is plain JSON inside `SB.tours.addJson({...})`, so you can edit its text and steps directly.
- **Order:** `order` in `config.js` (the maker's "Order of the tutorials" overrides it on one device).

## Start a tutorial with a ready screen
In the maker: set up the screen the way the tutorial should start, then choose **⋯ › Start like this screen (layers and settings)**. The tutorial's practice screen then starts with:
- the layers;
- the tool;
- the playhead;
- Auto key;
- onion skin;
- the brush color and size;
- the selected layers.

## Groups
The gallery shows tutorials in groups, with chips at the top to show one group.
- The groups and their order are `groups` in `config.js`.
- The groups are a learning path: `1 Basics`, `2 Drawing`, `3 Animation`, `4 Rigs and controllers`, `5 Quick and powerful`, `6 Effects and video`, `7 Interactive and export`. A tutorial may only use what is taught earlier in the `order` (or teach it itself).
- A built-in tutorial names its group with `group: '2 Drawing'`.
- For your own, set the group in the maker: **⋯ › Title, card text and level… › Group**. Without one, it goes to "My tutorials".

## Steps in the maker
- **Task:** the learner tries it alone. The whole app works during a task step, and the bubble shows **Hint** (your hint text) and **Done**. Every last "try it yourself" step of a lesson should be a Task (`practice: true`).
- **Show me / Do it for me:** a step the learner must do shows **Show me**, which plays the guidance again (mouse picture, ring, ghost, an extra hint). A small **Do it for me** link appears only after about 25 seconds, or after Show me was pressed twice. A step that asks for a tool or button should accept the click as well as the shortcut: check the resulting state, not the key press.
- **Picture:** a reference picture inside the guide's bubble.
- **Drag path:** with the mouse picture set to Drag, click the points the drag goes through. The mouse picture travels along them, over a dashed line.
- **Right-click steps** (Next when: A menu opens) block every other click and tool until the menu shows.
- **Cover:** the picture on the tutorial's gallery card (**⋯ › Title, card text and level… › Cover**). Choose a picture, or take one of the stage.
