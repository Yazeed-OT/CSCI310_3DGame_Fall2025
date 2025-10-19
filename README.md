# CSCI310_3DGame_Fall2025
# CSCI310_3DGame_Fall2025
University of Indianapolis | CSCI 310 GUI & Game Development Project 2 – 3D Maze Escape Game built with Three.js.

## Run locally

This repo is static HTML/JS. You just need a simple web server so module imports work.

Option A — VS Code Task (recommended)

1. Open this folder in VS Code.
2. Run the task named "Serve Web (Python 8000)".
3. Open http://127.0.0.1:8000/ — it auto-redirects to `/code/`.

Option B — Manual command

```bash
python3 -m http.server 8000 --bind 127.0.0.1
```

Then browse to http://127.0.0.1:8000/

## Controls

- Enter: start game
- WASD: move (or pan in overhead mode)
- P: toggle POV (overhead/first-person)
- E: open a nearby door

## Troubleshooting

- ERR_EMPTY_RESPONSE: make sure the server is running and you are visiting `http://127.0.0.1:8000/` (not a random port). If a different port is already in use, change the port in the command and URL.
- If the page is blank, open the browser console. Network 404s usually mean the server is not serving from the repo root; start the server at the project root so `/code/` and `/assets/` resolve.
