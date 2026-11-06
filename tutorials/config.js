/* The tutorials folder: everything about the tutorials that you may want to change, without touching the app.
   - character: the guide every tutorial uses unless it picks its own (the maker can change it too:
     Settings › Project › Tutorial maker… › ⋯ › Default guide of every tutorial).
   - characters: the guides there are. Each has a folder with one picture per mood:
     idle, talk, happy, cheer, wink, idea, think, point, surprised, sad  (e.g. characters/toonzi/happy.svg).
     Toonzi (the app's own mascot, a purple apple with big eyes) is the default; Pip and Mo are there too.
     Animated SVG works best (it moves by itself); .png, .gif or .webp work too: set ext.
     A missing mood shows the character's talk picture.
   - files: the tutorials to load, in this folder (lessons/ are the built-in ones; my-tutorials/ is for yours:
     in the maker, ⋯ › Save as a file for the tutorials folder, put the file there and add its name here).
   - order: the order of the Tutorials gallery (ids; the maker's "Order of the tutorials" overrides it).
   - groups: the gallery's sections, in order; each tutorial names its group (group: 'Drawing').
   See tutorials/README.md, and open tutorials/preview.html to see every character and mood. */
window.SB_TUTORIALS = {
  character: 'toonzi',
  size: 96, // the guide's size on screen, in pixels
  characters: {
    toonzi: { name: 'Toonzi', folder: 'tutorials/characters/toonzi', ext: 'svg' },
    pip: { name: 'Pip', folder: 'tutorials/characters/pip', ext: 'svg' },
    mo: { name: 'Mo', folder: 'tutorials/characters/mo', ext: 'svg' },
    // fox: { name: 'Fox', folder: 'tutorials/characters/fox', ext: 'svg' },
  },
  files: [
    'lessons/art.js', // shared helpers for the practice art (not a tutorial)
    /* in the order you learn them (the gallery order is `order` below) */
    'lessons/drawing.js',
    'lessons/keyframes.js',
    'lessons/drawing-fills.js',
    'lessons/vectors.js',
    'lessons/pixel-art.js',
    'lessons/quick-hop.js',
    'lessons/frame-by-frame.js',
    'lessons/storyboard.js',
    'lessons/basic-rig.js',
    'lessons/basic-controls.js',
    'lessons/actions.js',
    'lessons/action-strips.js',
    'lessons/advanced-rig.js',
    'lessons/living-lines.js',
    'lessons/physics.js',
    'lessons/follow-object.js',
    'lessons/slingshot.js',
    'lessons/wobbly-antenna.js',
    'lessons/wrecking-ball.js',
    'lessons/effects.js',
    'lessons/video-basics.js',
    'lessons/logo-reveal.js',
    'lessons/masking.js',
    'lessons/interactive.js',
    'lessons/game-engines.js',
    // 'my-tutorials/my-first-tutorial.js',
  ],
  /* A learning path, simplest first: a tutorial only uses what the ones before it taught (or teaches it itself). */
  order: ['drawing', 'keyframes',
    'effects', 'logo-reveal', 'masking', 'video-basics',
    'drawing-fills', 'vectors', 'pixel-art',
    'quick-hop', 'frame-by-frame', 'storyboard',
    'basic-rig', 'basic-controls', 'actions', 'action-strips', 'advanced-rig',
    'living-lines', 'physics', 'follow-object', 'slingshot', 'wobbly-antenna', 'wrecking-ball',
    'interactive', 'game-engines'],
  // the gallery's groups, in this order (a tutorial says its group with group: '…'; yours go to "My tutorials" unless you pick one)
  groups: ['1 Basics', '2 Effects and video', '3 Drawing', '4 Animation', '5 Rigs and controllers', '6 Quick and powerful', '7 Interactive and export', 'My tutorials'],
};
