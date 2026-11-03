docs/media: animations made in Toonzi 2D for the README and the docs page
=========================================================================

Everything in this folder was exported from the app itself (File menu › Export…).
Put your own animations here and the README and docs/index.html show them.

WHAT IS HERE
------------
hero.svg              The animated banner at the top of README.md (1280 x 640).
                      Made in the app: a rounded box, a star, a ball and a shadow, then
                      Export › SVG animation (15 fps, Loop on, Transparent background off).
bouncing-ball.svg     A looping animated SVG (Export › SVG animation, 12 fps).
click-to-play.svg     An SVG that waits on its first frame and plays when you click it
                      (Export › Interactive › SVG, "Starts: When you click it").
bouncing-ball.html    An interactive web page (Export › Interactive › HTML). Click the ball to
                      make it wobble, drag it around. It is one file with the whole player
                      inside, so it is about 2 MB.

HOW TO EXPORT (the real menu names)
-----------------------------------
1. Open your project in the app.
2. Click the logo at the top left (the menu with Tutorials, New project, Save project...)
   and choose "Export...".
3. Pick "Export as":
     Video              MP4, WebM, MOV or MKV
     Sprite sheet       one image of all frames (PNG, JPG, WebP, AVIF or SVG) plus a JSON file
     Images (ZIP)       every frame as a PNG, JPG, WebP or AVIF file
     SVG animation      an animated SVG that plays by itself       <- GitHub README
     Interactive        Format: HTML, Rive or SVG                  <- docs page
     Game Engine        Unity or Godot
     Blender (FBX)      FBX file
     Lottie (web)       Lottie JSON (+ a web page that plays it)
4. Choose the frame rate and size, then press Export. The file is saved by your browser.
   Nothing is uploaded.

WHICH FORMAT FOR WHICH PLACE
----------------------------
README.md on GitHub   Use "SVG animation". GitHub shows an animated SVG inside <img> and it
                      plays and loops. A README cannot run JavaScript, so a click-to-play SVG or
                      an HTML page does NOT work there (link to the docs page instead).
docs/index.html       Can run JavaScript, so it can embed an interactive page in an <iframe>:
                      use "Interactive › HTML" (or "Interactive › SVG" for click-to-play).
                      Put the file here in docs/media/ and add it to the page (see below).

THE APP HAS NO GIF OR APNG EXPORT
---------------------------------
Animated SVG is the format the app gives you for a README. If you need a GIF anyway, export a
Video (MP4) and convert it with a tool outside the app (for example ffmpeg or an online
converter). GitHub also accepts a video you drag into the README editor on github.com.

Tips for good README animations
  - Keep the file small: a lower frame rate (8 to 15 fps) and a smaller Size make a smaller SVG,
    because every frame is stored. Frames that look the same are stored once.
  - Turn "Loop" on, and keep "Transparent background" on if the picture should sit on the page's
    own color (GitHub light and dark mode), or off for a solid background like hero.svg.
  - Text in an SVG animation becomes shapes, so it looks the same everywhere.
  - Effects an SVG cannot draw (blurs, glow, shadows, erasers) become small pictures inside the
    SVG. The app tells you when that happens after the export.

REPLACING THE HERO
------------------
1. Make your animation in the app (1280 x 640 px suits the README; any size works).
2. Export › SVG animation and save the file here as  hero.svg  (replace the old one).
3. Commit it. README.md already points to docs/media/hero.svg.
   Another name? Change the src in the line marked  <!-- TOONZI: hero animation -->  in README.md.

ADDING MORE ANIMATIONS TO THE README
------------------------------------
Copy a slot in README.md, put your exported SVG in this folder and change the file name:

    <!-- TOONZI: my animation -->
    <img src="docs/media/my-animation.svg" alt="What the animation shows" width="480">

ADDING AN INTERACTIVE PAGE TO THE DOCS
--------------------------------------
1. Export › Interactive › HTML and save the file in this folder, for example  my-demo.html.
2. In docs/index.html find the section  <!-- TOONZI: interactive demos -->  and copy one
   <figure class="demo"> block. Change the iframe src to  media/my-demo.html  and the caption.
   (A click-to-play SVG goes in an <object data="media/my-file.svg" type="image/svg+xml">,
   as in the example there. Clicks do not work in an <img>.)
3. Test it: opening docs/index.html straight from disk works in Chrome, but a web server is the
   safest way, and it is what GitHub Pages uses:
   python3 -m http.server  in the project folder, then open http://localhost:8000/docs/

Exporting the HTML page needs the app itself to come from a web server (see README.md,
"Quick start"): the exporter reads the app's own files to pack them into the page.

The HTML page contains a copy of the player from the app version that exported it. After you
update the app, export the demo again to refresh it.
