# TicTacToe

Juego de TicTacToe ("Tres En Raya") con HTML, CSS y JavaScript.

## Cursor Cloud specific instructions

- This is a fully static site (`index.html`, `style.css`, `script.js`). There is no build step, package manager, or backend, so there are no dependencies to install.
- To run it, serve the repo root over HTTP and open `index.html`, e.g. `python3 -m http.server 8000` then visit `http://localhost:8000/index.html`. Opening the file directly via `file://` also works.
- Game logic lives in `script.js`. Win/draw outcomes use a blocking `alert()` and then immediately `resetGame()`, so the final winning mark is cleared as soon as the alert is dismissed — this is expected app behavior, not a bug.
- There are no automated tests or lint configs; verify changes manually in the browser.
