# Quant Theft Auto

A lightweight top-down open-world crime sandbox that runs in the browser. You steal cars, take jobs from
ringing payphones and shake off the cops. The twist is that some of the rules come from quantum mechanics.

There are two maps: a whole island (a city, farmland, a desert casino town, a forested mountain and a tropical coast)
and **Brno**. You can play alone or **online with a friend**.

No build step and no dependencies: just `index.html` and `game.js` (plain canvas and WebAudio, about 430 KB). Online
co-op loads one small library, and only when you open the co-op menu.

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
| R · M | radio station · minimap (M again shows the whole map, then hides it) |
| P / Esc · H | pause · help (press H again for the quantum notes) · N dismisses a note |
| ← → · ↑ ↓ (title screen) | choose where to start · switch between the island and Brno |
| L (title screen) | **Physics Lab**: 7 guided lessons (L again from the pause screen to leave) |
| O (title screen) | **online co-op** with a friend |

On phones and tablets, touch buttons appear automatically. On the title screen, tap the left half to play
and the right half for the Physics Lab.

Goal: reach **$100,000**. Ringing payphones give jobs, and each finished job raises your cash multiplier.
Spray shops ($500) clear your wanted level. If you are wasted or busted you come back at the nearest hospital or
police station.

### Wanted levels

| Stars | The police response |
| --- | --- |
| ★ | Only officers who see you, or are close by, come after you. Cruisers tail you rather than ram you, and pull up to arrest you when you stop. They give up if they lose you for long enough. |
| ★★ | The radio calls in patrol cars nearby, and they ram. Officers on foot still try to arrest you. |
| ★★★ | Roadblocks: two cruisers parked across the road just ahead of you, with officers holding position. Officers now shoot. |
| ★★★★ | SWAT vans pull up and deploy armed teams. A police helicopter circles your last known position, and anything under its searchlight is seen. You can shoot it down. |
| ★★★★★ | A tank joins in, and the helicopter's gunner opens fire. |

Officers who get out to arrest you, man a roadblock or storm out of a SWAT van leave their vehicle parked and
empty, and walk back to it when they are no longer needed. The tank and the SWAT vans head back to base once your
wanted level drops below theirs.

## The island

The island is 240 × 208 tiles, about seven times the size of the old city. Choose where to start on the title
screen: Quantum City, Bell's Crossing, Las Ondas, Coral Bay or the top of Mount Eigen.

- **Quantum City** fills the north-west corner (everything in the next section).
- **Harvest Valley**: farmland east of the city, with crop fields (wheat, ploughed earth, green rows, corn,
  rapeseed), hay bales, farms with barns, silos and tractors you can drive, wind turbines on the hills, and **Lake
  Bloch**, where the Copper River starts. **Bell's Crossing** is its village: a chapel, a diner, a petrol station, a
  clinic and a sheriff's office.
- **Las Ondas**: a casino town in the desert (Vacuum Flats) with the Strip, the Golden Qubit, the pyramid of the
  Lucky Electron, Schrödinger's Palace under its golden dome, motels and neon. Mesas, cacti and scrub all round.
- **Site Ψ**: a fenced research base in the desert with hangars and radar dishes. Going inside puts you at three
  stars, but there is a rocket launcher and spare quantum gear behind the fence.
- **Mount Eigen**: a forested mountain (Hilbert Woods) with rocky crags, a snowy top, a winding pass up to the
  observatory and radio mast, and cabins by Pine Lake.
- **Coral Bay** on the tropical **Palm Coast**: pastel hotels with rooftop pools, palms, a beach with umbrellas and
  lifeguard towers, turquoise shallows and a pier.
- Country roads have no pavements or street lamps, highways (the Valley Interstate and the Coast Highway) link the
  towns, and dirt tracks lead to the farms. Traffic thins out away from the towns. Sand, fields and grass slow cars
  down (not tractors or the tank).
- Each town has its own story arc, payphones, a spray shop, a clinic and a police post.

## Brno

Switch to Brno with ↑ or ↓ on the title screen. The map is built from [OpenStreetMap](https://www.openstreetmap.org)
data (© OpenStreetMap contributors, available under the [ODbL](https://opendatacommons.org/licenses/odbl/)): the
main roads with their real names, the Svratka and Svitava, the reservoir, the railways, the land use (housing,
industry, parks, forests, fields and vineyards) and the names of the districts. It covers about 14 × 12.5 km, from
Bystrc and the reservoir dam in the west to Líšeň and the airport in the east, at roughly 60 m a tile, so the
cars and buildings are not to scale with the streets.

- **The road network** is the city's motorways, the Velký městský okruh, and its primary and secondary roads, plus
  tertiary roads where they are the main way through a suburb or village. Divided roads and small roundabouts are
  merged into single roads, so the network is one connected graph.
- **Landmarks** sit at their real positions (moved a little if a road is in the way): Náměstí Svobody with the
  astronomical clock, the Old Town Hall, Zelný trh, the cathedral on Petrov, Moravské náměstí, the Mahen and Janáček
  theatres, Špilberk, the main station, Vaňkovka, the AZ Tower, Výstaviště, Lužánky, Vila Tugendhat, the observatory,
  Mendel's abbey, the trauma hospital, the university hospital and Masaryk University's campus in Bohunice, the city
  stadium, the zoo, the harbour on the reservoir, the quarry on Hády and Brno-Tuřany airport.
- **FIT BUT**, the Faculty of Information Technology of Brno University of Technology, is highlighted: the old
  Carthusian monastery with its cloister and church, the glass wing with the FIT sign, its own marker on the map, a
  start location of its own and the FIT Hackers story arc in Královo Pole.
- **Districts** get their own buildings: burgher houses in the old town, tenements in the inner districts, villas
  in Černá Pole, Stránice and Pisárky, panel estates in Lesná, Bystrc, Bohunice, Lískovec, Kohoutovice, Vinohrady
  and Líšeň, warehouses on industrial land, and villages round the edge.

The data was fetched once through the Overpass API and is embedded in `game.js`, so playing needs no network.
`tools/brno/build.sh` rebuilds it (it needs Python 3 with numpy, scipy and Pillow).

## Online co-op

Press **O** on the title screen. One of you hosts and gets a five-letter room code; the other types it in and joins.
You share one world (the host's), each with your own cash and lives, and the same wanted level. The police go after
whichever of you is nearer. If the host is on the other map, the guest's game switches to it.

The host's browser runs the whole simulation. The guest's browser sends its keys and draws what the host sends back
about 15 times a second. The two browsers find each other through the free public [PeerJS](https://peerjs.com)
service and then talk directly (WebRTC). The PeerJS library is only fetched when you open the co-op menu.

## Quantum City

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
- **Countryside textures**: sand with wind ripples, forest floor, dry grass, rock with lichen, snow, crops in rows
  and vineyards, blended into each other with soft edges, with hill shading and surf on the shores.
- **Textures**: cracked and patched asphalt with tyre wear and oil stains, paving slabs, brick pavers, grass, water and
  quay stones on the ground; brick, stone, concrete, render, weatherboard and corrugated-metal walls; clay-tile, slate,
  gravel, bitumen and metal roofs; glass towers that reflect the sky as you move; leafy trees and glossy cars. All of
  them are generated from seamless noise when the game loads, so there are no image files.
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

Everything is original: the code, the procedural city, the procedurally generated textures, the art drawn on the
canvas, and the synthesized sound and radio music.
