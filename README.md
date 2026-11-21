# Quant Theft Auto

A lightweight top-down open-city crime sandbox that runs in the browser. You steal cars, take jobs from
ringing payphones and shake off the cops. The twist is that some of the rules come from quantum mechanics.

No build step and no dependencies: just `index.html` and `game.js` (plain canvas and WebAudio, about 210 KB).

Play it at **https://ondrik.github.io/qta/**.

Every released version stays playable: pick one from the version menu on the title screen, or browse
**https://ondrik.github.io/qta/v/**.

## Play locally

Open `index.html` in a browser, or serve the folder:

```sh
python3 -m http.server 8000   # then open http://localhost:8000
```

## Publish on GitHub Pages

Set **Settings → Pages → Build and deployment → Source** to **GitHub Actions**. Every push to `master`
runs `.github/workflows/pages.yml`, which calls `tools/release.mjs` to put the latest game at the root and
rebuild every release tag (`v1`, `v2`, …) from its own source under `/v/<tag>/`, plus an index at `/v/`.
To release, tag the commit (`git tag -a v7 -m "what changed"`) and push the tag along with `master`.

## Controls

| Key | Action |
| --- | --- |
| Arrows / WASD | drive · walk (up = forward, left/right = turn) |
| Space | shoot on foot · handbrake in a car |
| Enter / F / E | get in or out of cars (occupied ones too) |
| Q / Tab | switch weapon |
| **X** | **superposition**: split your car into 3 branches (press again to collapse) |
| **T** | **entangle** with a car nearby · T again: measure the pair and **swap places** with it |
| V | slow motion + amplitude arrows (phasors) while superposed |
| Space in a tank / fire truck | fire the cannon / spray water |
| R · M | radio station · minimap |
| P / Esc · H | pause · help (press H again for the quantum notes) · N dismisses a note |
| L (title screen) | **Physics Lab**: 7 guided lessons (L again from the pause screen to leave) |

On phones and tablets, touch buttons appear automatically. On the title screen, tap the left half to play
and the right half for the Physics Lab.

Goal: reach **$100,000**. Ringing payphones give jobs, and each finished job raises your cash multiplier.
Spray shops ($500) clear your wanted level.

### Wanted levels

| Stars | The police response |
| --- | --- |
| ★ | Only officers who see you, or are close by, come after you. Cruisers tail you rather than ram you, and pull up to arrest you when you stop. They give up if they lose you for long enough. |
| ★★ | The radio calls in patrol cars nearby, and they ram. Officers on foot still try to arrest you. |
| ★★★ | Roadblocks: two cruisers parked across the road just ahead of you, with officers holding position. Officers now shoot. |
| ★★★★ | SWAT vans pull up and deploy armed teams. A police helicopter circles your last known position, and anything under its searchlight is seen. You can shoot it down. |
| ★★★★★ | A tank joins in, and the helicopter's gunner opens fire. |

## The city

- **Four districts**, each with a three-job **story arc**. The first payphone you answer in a district
  starts its arc, and after each job the same contact calls back from a booth nearby. Finishing an arc
  pays a $10,000 bonus.
- **Layout**: not a grid. The Copper River winds through the middle with roads along both banks.
  Planck Boulevard cuts diagonally across town over a slanted bridge into Superposition Circus, a
  six-way roundabout on Grand Avenue. Old Street and Church Lane wind through the Old Quarter. Streets jog
  and end in T-junctions, and blocks come in all shapes. The Ring Expressway runs around the edge with
  rounded corners (faster traffic). The HUD shows the street you're on.
- **Landmarks**: Gridlock International Airport (planes take off on a schedule) and Quantum Stadium.
- **Places**: Mercy General Hospital (helipad, ambulances), Police Headquarters (parked cruisers you can
  steal), Fire Station No. 7, St. Planck's Church and its churchyard, Schrödinger Elementary (basketball
  court), the Museum of Uncertain History, City Hall with its dome, Heisenberg Tower, the Superposition
  Mall, Qubit Gas and Dirac Park. The HUD shows the name of the place you're in.
- **Architecture by district**: brick blocks and warehouses in Harbor Row, glass towers in Midtown,
  houses with pitched roofs and chimneys in the Old Quarter, neon signs in Neon Heights.
- **Traffic and people**: crossings have traffic lights that drivers obey (cops on a chase don't).
  Drivers follow lanes along curves and through the roundabout, route to destinations across the road
  network, stop for pedestrians and steer around wrecks. Buses stop at bus
  stops to pick up passengers. Pedestrians walk to places, wait for the lights at crosswalks, go into
  buildings, and stop to chat.
- **Vehicles**: hatchbacks, sedans, sports coupes, taxis, box trucks, motorbikes (you can get thrown off),
  city buses, police cruisers, and at five stars a **tank** that you can also steal. Ambulances revive
  people who've been knocked down and heal you if you get in. Fire trucks put out fires, tow wrecks, and
  spray water when you drive one.
- **Day and night**: a full day lasts 8 minutes. Shadows follow the sun, and evenings turn golden. At
  night windows light up, and there are neon signs, street lamps, headlight cones and glowing police
  lights.
- **Jobs**: delivery, car theft, hits, checkpoint races, wrecking sprees, escorts, getaways that you only
  finish once the police have lost sight of you, plus the quantum jobs below.

## The quantum mechanics

Each mechanic shows a short **Quantum Note** the first time you run into it. The note explains the real
physics and also says where the game takes liberties.

| Mechanic | In the game | Real idea |
| --- | --- | --- |
| Superposition (ψ pickups, `X`) | Your car splits into 3 ghost branches that take different routes. When a cop sees any branch, or after 10 s, the game picks one branch at random with probability \|amplitude\|² and you end up there. A branch that touches anything loses amplitude. | Superposition, the Born rule, measurement, decoherence |
| Police uncertainty cloud | Once cops lose sight of you, they only know your last momentum. Their guess drifts along it and spreads out, and each cruiser searches a point sampled from that cloud. Turning while out of sight sends them the wrong way. | Uncertainty principle (a loose analogy, as the note says) |
| Entanglement swap (ε pickups, `T`) | Press T next to a car to entangle with it, then let it drive off. Press T again to measure the pair: you swap places instantly, however far apart you are. If the police spot your twin while they've lost you, the pair collapses on its own and they chase the twin instead. | Entanglement and long-distance correlations; quantum teleportation moves a *state* and still needs an ordinary signal, so nothing travels faster than light |
| Entangled cars (job) | Wreck one cyan twin and its partner across town goes up too. | Entanglement (the note explains that the no-signalling theorem forbids this in reality) |
| Schrödinger's briefcase (job) | The case is "cash" or "bomb" until you deliver it, and rough driving raises the bomb odds. | Schrödinger's cat thought experiment |
| Quantum key run (job) | Carry 32 qubits while Eve tails you. If she gets close she measures them, and the **BB84 report** at the end shows every qubit's bases, the sifted key and the error rate. Over 11% errors means the key is thrown away. | BB84 quantum key distribution: an eavesdropper leaves about 25% errors; real-world QKD |

### Physics Lab

The Physics Lab (press `L` on the title screen) walks through the mechanics one at a time: superposition,
measurement, uncertainty, entanglement, long-distance collapse, Schrödinger's briefcase and BB84. Each lesson has a
goal and opens the matching Quantum Note. During superposition it shows each branch's amplitude as a
rotating arrow (a phasor), with the probability equal to the arrow's length squared. You can't lose lives
in the lab, so it works for teaching or a first look at the quantum ideas.

Everything is original: the code, the procedural city, the art drawn on the canvas, and the synthesized
sound and radio music.
