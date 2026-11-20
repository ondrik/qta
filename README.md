# Gridlock: Quantum City

A lightweight top-down open-city crime sandbox that runs in the browser. You steal cars, take jobs from
ringing payphones and shake off the cops. The twist is that some of the rules come from quantum mechanics.

No build step and no dependencies: just `index.html` and `game.js` (plain canvas and WebAudio, about 100 KB).

## Play locally

Open `index.html` in a browser, or serve the folder:

```sh
python3 -m http.server 8000   # then open http://localhost:8000
```

## Publish on GitHub Pages

Push to GitHub, then go to **Settings → Pages → Build and deployment → Deploy from a branch** and pick the
branch and `/ (root)`. The game will be at `https://<user>.github.io/<repo>/`.

## Controls

| Key | Action |
| --- | --- |
| Arrows / WASD | drive · walk (up = forward, left/right = turn) |
| Space | shoot on foot · handbrake in a car |
| Enter / F / E | get in or out of cars (occupied ones too) |
| Q / Tab | switch weapon |
| **X** | **superposition**: split your car into 3 branches (press again to collapse) |
| **T** | **quantum tunnelling** through the wall you're facing |
| R · M | radio station · minimap |
| P / Esc · H | pause · help (press H again for the quantum notes) · N dismisses a note |

On phones and tablets, touch buttons appear automatically.

Goal: reach **$100,000**. Ringing payphones give jobs, and each finished job raises your cash multiplier.
Spray shops ($500) clear your wanted level.

## The quantum mechanics

Each mechanic shows a short **Quantum Note** the first time you run into it. The note explains the real
physics and also says where the game takes liberties.

| Mechanic | In the game | Real idea |
| --- | --- | --- |
| Superposition (ψ pickups, `X`) | Your car splits into 3 ghost branches that take different routes. When a cop sees any branch, or after 10 s, the game picks one branch at random with probability \|amplitude\|² and you end up there. A branch that touches anything loses amplitude. | Superposition, the Born rule, measurement, decoherence |
| Police uncertainty cloud | Once cops lose sight of you, they only know your last momentum. Their guess drifts along it and spreads out, and each cruiser searches a point sampled from that cloud. Turning while out of sight sends them the wrong way. | Uncertainty principle (a loose analogy, as the note says) |
| Tunnelling (T pickups, `T`) | You can go through a wall with probability `e^(−d/70px)`, so thin walls are easy and thick blocks are nearly impossible. | Tunnelling probability falls off exponentially with barrier width |
| Entangled cars (job) | Wreck one cyan twin and its partner across town goes up too. | Entanglement (the note explains that the no-signalling theorem forbids this in reality) |
| Schrödinger's briefcase (job) | The case is "cash" or "bomb" until you deliver it, and rough driving raises the bomb odds. | Schrödinger's cat thought experiment |

Everything is original: the code, the procedural city, the art drawn on the canvas, and the synthesized
sound and radio music.
