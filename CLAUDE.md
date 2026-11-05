# Toonzi 2D

Instructions for AI assistants (making animations with this app, running or copying it, the project format and the rules for choosing tools) are in [AGENTS.md](AGENTS.md). Read it first.

@AGENTS.md

Working on the app itself: plain HTML/CSS/JS with no build step (`index.html` lists every script in load order; each file in `js/` starts with a comment explaining it). Serve the folder (`node tools/toonzi.mjs serve`) and open `index.html?nostart`. Record each round of changes in `CHANGELOG.md`.
