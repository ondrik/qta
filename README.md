# Quant Theft Auto

A lightweight top-down open-world crime sandbox that runs in the browser. You steal cars, take jobs from
ringing payphones and shake off the cops. The twist is that some of the rules come from quantum mechanics.

There are three maps: a whole island (a city, farmland, a desert casino town, a forested mountain and a tropical
coast), **Brno**, and **inner Brno in detail**, with every street and the real buildings. Streets carry their names.
You can play alone or **online with a friend**.

No build step and no dependencies: just `index.html` and `game.js` (plain canvas and WebAudio, about 690 KB), plus
`brno5_data.js` (3 MB) for the detailed map, loaded only when you pick it. Online co-op loads one small library,
and only when you open the co-op menu.

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
| Enter / F / E | get in or out of cars (occupied ones too: you walk to the driver's door, open it, drag the driver out and climb in) · into a moored **boat** from the bank, out at a bank · at a jetty: go **fishing** |
| Q / Tab | switch weapon |
| **X** | **superposition**: split your car into 3 branches (press again to collapse) |
| **T** | **entangle** with a car nearby · T again: measure the pair and **swap places** with it |
| **G** | **optical tweezer**: pick up the empty car behind yours (G again drops it) |
| V | slow motion + amplitude arrows (phasors) while superposed |
| Space in a tank / fire truck | fire the cannon / spray water |
| R · M | radio station · minimap (M again shows the whole map, then hides it) |
| P / Esc · H | pause (Q on the pause screen quits to the title screen) · help (press H again for the quantum notes) · N dismisses a note |
| ← → · ↑ ↓ (title screen) | choose where to start · switch between the island, Brno and inner Brno in detail |
| L (title screen) | **Physics Lab**: 10 guided lessons (L again from the pause screen to leave) |
| O (title screen) | **online co-op** with a friend |

On phones and tablets, touch buttons appear automatically. On the title screen, tap the left half to play
and the right half for the Physics Lab.

For testing there is a hidden **debug console**: type `debug` while playing (best while paused, since E and G also
act in play). `tp <place>` teleports you to a start, site, district, street, tram stop, faculty and so on (`tp <x> <y>`
to a tile, and on the Brno maps `tp <lat> <lon>`), `find <text>` lists the places, `where` tells you where you are,
`wanted <n>` sets the wanted level, `car <type>` puts you in any vehicle (boats on the nearest water), `god` stops
damage and arrests, and `stats` shows the frame time and how much is being simulated. `help` lists the rest, Esc
closes it.

Goal: reach **$100,000**. Ringing payphones give jobs, and each finished job raises your cash multiplier.
**Boats** lie moored along the banks of the reservoir (in Brno) and of the island's sea, lakes and river, and more
are anchored out on the water: walk up to one on the bank and press Enter. Speedboats, rowing boats and sailing
dinghies (the wind drives a dinghy, and it can't sail straight into it: the red pennant at its masthead shows which
way it blows) glide and drift, and only water carries them. Press Enter at a bank to get out, or, out on the water,
by another empty boat to climb across. Police boats come after you on the water, and police on the banks shoot
across it. No superposition or tweezer on the water, and T entangles a boat only with another boat.

Spray shops ($500) clear your wanted level (up to five stars). If you are wasted or busted you come back at the nearest hospital or
police station, facing the street. Ramming a police car gets you at least one star, and that cruiser gives chase.
So does killing someone where a cop sees it. If a passer-by sees it instead, they phone the police (☎ over their
head), and a few seconds later that's a star too, unless they don't live to finish the call. Three killings in quick
succession get you a star even unseen.
The car you drive has a health bar over it (and in the corner of the screen), and it holds out longer than the
other cars on the road.

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

Past five stars the state itself comes after you. You get there by staying in their sight: every 40 s they see
you, the next level comes, and so does taking out what they send (the tank, a carrier, a bulldozer, the drone, the
army's helicopter, the airship). Anything else you do counts for a tenth. A second row of stars, the level's name
and its way out show under the first. From seven stars up a level doesn't fade by itself: only its way out ends it.

| Stars | Who comes, and the way out |
| --- | --- |
| 6 · The Measurement Bureau | Black vans with a detector dish: near one, your superposition collapses, your entanglement breaks, and X and T don't work. The Bureau's drone keeps you measured, so the police never lose you (the quantum Zeno effect). Lose it under trees or an overpass or in a tunnel, or shoot it down. Spike strips ahead of you halve your top speed until you swap cars. Lose them as at five stars. |
| 7 · State of emergency | The army: checkpoints of armoured carriers and soldiers on the bridges and at the tunnel mouths ahead, carriers with mounted guns, and an attack helicopter whose rockets land where a red ring marks the street. Way out: lie low for 60 s unseen, or on foot face a wall and press T to spend an ε charge tunnelling through the building, out of their sight, or take a boat across the water and get out on a bank unseen, far from where you put out (about 75 tiles; lose the Bureau's drone first). Either takes you back to five stars. |
| 8 · The Observer | A measurement sweep every 20 s: wherever you are, they know. No superposition or entanglement at all, no ε pickups. Jets strafe your street (a red strip marks their run). Way out: one of the entangled payphones, cyan on the map (at the Atom Array Lab and, in Brno, at FIT BUT). A Bell measurement there (press Space as the arrow crosses the window, two out of three) teleports you to the other one, and you are down to three stars. |
| 9 · Demolition | Armoured bulldozers come straight through the buildings. Hide behind one and a wrecking crew brings it down on you, leaving rubble across the street. Fuel tankers lie jack-knifed and burning in the junctions ahead, and a crane swings a wrecking ball over a main junction. Way out: 45 s unseen in a pedestrian zone or square, back to five stars. |
| 10 · Air assault | Swarms of kamikaze drones (a red ring marks where each dives; shoot them down), paratroopers, squads roped down from helicopters onto the street ahead, and an airship whose searchlight finds you. Way out: go to ground, through two different tunnels from end to end, unseen going in and coming out, back to five stars. On the island, with no tunnels, lie low 75 s unseen. |

## Fishing

Wooden jetties stand on the banks of the rivers, the lakes and the sea (in Brno: the reservoir, the Svratka and the
Svitava), marked FISH on the street and in blue on the map. Walk up to one and press Enter (⇄ on a touch screen):

- **Cast**: hold Space (●) and let go. The power swings up and down while you hold, ← → aim, and a ring shows where
  the float will land: it has to come down on open water, which on a narrow river takes a gentle cast.
- **Strike**: the float bobs at a nibble, but wait until it goes under, then press Space at once.
- **Reel in**: hold Space to reel, keeping the line's tension out of the red. When the fish runs, ease off or pull the
  other way (← or →) or the line snaps; let it run too long and it throws the hook.
- What you land is sold on the spot. Each water has its own fish (Brno's have their Czech names too) and the odd boot
  or shopping trolley; the rarer and bigger ones are further out, dawn and dusk are the best times, and some only bite
  at night. Your heaviest of each kind is remembered as a record.
- Now and then a bite is **superposed** between two catches, shown with their probabilities, and landing it
  collapses it to one of them.

You can't fish with the police after you, and in co-op only the host can fish for now.

## The island

The island is 240 × 208 tiles, about seven times the size of the old city. Choose where to start on the title
screen: Quantum City, Bell's Crossing, Las Ondas, Coral Bay or the top of Mount Eigen.

- **Quantum City** fills the north-west corner (everything in the next section). Its strip club, the Naked
  Singularity, is on the Neon Strip in Neon Heights: a red carpet between velvet ropes, chaser bulbs round the roof
  and searchlights sweeping the sky at night.
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
  towns, and dirt tracks lead to the farms. Traffic thins out away from the towns. Off the road cars are much slower:
  grass halves the top speed, and ploughed fields and sand cut it to about 40% (not for tractors or the tank).
- Each town has its own story arc, payphones, a spray shop, a clinic and a police post.

## Brno

Switch maps with ↑ or ↓ on the title screen (the island, Brno, inner Brno in detail). The Brno map is built from [OpenStreetMap](https://www.openstreetmap.org)
data (© OpenStreetMap contributors, available under the [ODbL](https://opendatacommons.org/licenses/odbl/)): the
main roads with their real names, the Svratka and Svitava, the reservoir, the railways, the land use (housing,
industry, parks, forests, fields and vineyards) and the names of the districts. It covers about 14 × 12.5 km, from
Bystrc and the reservoir dam in the west to Líšeň and the airport in the east. The map is 960 × 832 tiles, at
roughly 15 m a tile.

- **The road network** is the city's motorways, the Velký městský okruh, and its primary and secondary roads, plus
  tertiary roads where they are the main way through a suburb or village. The roads are painted onto a fine grid,
  thinned to their centre lines and traced, so divided roads and small roundabouts merge into single roads; a dead
  end is joined to the network along the residential streets that link it in reality (or, where there are none,
  straight across the gap), so the network is one connected graph. The railways are traced the same way.
- **Tunnels**: the Královopolský and Husovický tunnels run under the city. The streets above cross them without
  meeting them, and from the street you see only the ramps going down into the portals. Drive in and the city above
  fades to show the lit tube. Nobody walks or gets out down there, and the police can't see you, so a tunnel is a
  good way to shake them off.
- **Overpasses**: where OpenStreetMap puts a road above one it crosses (on a bridge, or just on a higher layer: the
  VMO's interchanges, the D1's junctions, Vídeňská, Hlavní, Jihlavská and many more), it rises on ramps to a deck of
  its own, drawn raised in perspective with its parapets, piers and shadow. The traffic up there and the traffic
  underneath don't meet, and the deck turns see-through while you drive under it. Two roads that cross at different
  levels never meet in a junction: a deck that crosses a road stays a deck however short the bridge, a short stretch
  of street between two decks goes up with them, and the street beyond a short bridge is kept clear of the road
  underneath. Only a bridge's approaches, which cross nothing, join the streets. `tools/brno/gradecheck.py` checks
  the built network against every grade-separated crossing in the data.
- **City blocks**: paved lanes (you can drive down them) cut the big blocks between the main roads into blocks of a
  real size. Tenement blocks are built around their edges with courtyards inside, industrial estates have yards,
  housing estates have lawns between the slabs, and the old town is a maze of narrow lanes and little squares
  between the burgher houses.
- **Landmarks** sit at their real positions (moved a little if a road is in the way): Náměstí Svobody with the
  astronomical clock, the Old Town Hall, Zelný trh, the cathedral on Petrov, Moravské náměstí, the Mahen and Janáček
  theatres, Špilberk, the main station, Vaňkovka, the AZ Tower, Výstaviště, Lužánky, Vila Tugendhat, the observatory,
  Mendel's abbey, the trauma hospital, the university hospital and Masaryk University's campus in Bohunice, the city
  stadium, the zoo, the harbour on the reservoir, the quarry on Hády and Brno-Tuřany airport.
- **The Moulin Rouge** is back where the night club stood until it was pulled down in 2022, on the corner of
  Slovákova and Kounicova: the pink house with a red carpet at the door, chaser bulbs round the roof and a red mill
  on the corner whose sails light up at night. Both clubs are marked in pink on the map.
- **FIT BUT**, the Faculty of Information Technology of Brno University of Technology, is highlighted: the old
  Carthusian monastery with its cloister and church, the glass wing with the FIT sign, its own marker on the map, a
  start location of its own and the FIT Hackers story arc in Královo Pole. BUT's other faculties (FEKT, FSI, FCH, FP,
  FAST, FA and FaVU) stand where they are, each with its letters on the roof in its colour and a diamond on the map.
- **Districts** get their own buildings: burgher houses in the old town, tenements in the inner districts, villas
  in Černá Pole, Stránice and Pisárky, panel estates in Lesná, Bystrc, Bohunice, Lískovec, Kohoutovice, Vinohrady
  and Líšeň, warehouses on industrial land, and villages round the edge.

The data was fetched once through the Overpass API and is embedded in `game.js`, so playing needs no network.

### Inner Brno in detail

The third map is inner Brno at about **5 m a tile**: 2241 × 1690 tiles, 11.2 × 8.5 km from the dam of the Brno
reservoir, Bystrc and Královo Pole in the north to Komárov in the south, and from Kohoutovice to Židenice. At this
scale a car, a street and a building are their real size.

- **Every street** with its name, built straight from OpenStreetMap's ways: a junction wherever ways share a point
  and nowhere else, so a dual carriageway is two one-way roads with its median between them, and every slip road,
  loop ramp and roundabout is where it is mapped (the Žabovřeská interchange, say). A road on a bridge over another is
  an overpass (76 of them, with their ramps) and one beneath another a tunnel: the Husovický, Královopolský and
  Pisárecký tunnels, each tube on its own. Each street is as wide as its lanes, which come from OpenStreetMap (one to
  four each way), with a dashed centre line, a double one on four lanes or more, and lane lines between lanes going the
  same way. One-way streets are one-way: traffic keeps to its lanes, turns into the kerbside lane after a right turn and
  the inner one after a left, and never takes a one-way street the wrong way (one that would strand it is two-way after
  all). Traffic lights stand where OpenStreetMap has them; a junction of dual carriageways, several points a few metres
  apart, is signalled as one.
- **Trams** on all eleven lines (1 to 12: Brno has no 11), each along its own track as OpenStreetMap maps its route,
  in both directions and every variant: Škoda 13Ts, KT8D5s, VarioLFs and pairs of old T3s, red and cream, with the
  line's number up front in its colour. They stop at every stop (each with its sign and name, one for each
  direction), where people wait on the platform, more the longer since the last tram. The doors open, those getting
  off step out first, then those waiting walk to the nearest door and get on, and the tram waits until they're
  aboard. Along a street they wait at its red lights, and they ring the bell at whatever is on the
  track. They go down into the tram tunnels (the line to Bohunice under Jihlavská) and up over the bridges. Cars give
  way to them and wait behind one at its stop, as the rules say, and whatever a 40-tonne tram hits gets out of its
  way. Walk up to a tram's front and press Enter to take it over: ↑ to go, ↓ to brake (and back up), Space rings the
  bell. Only the trams in your part of the city (round what you see) are simulated in full; the rest run on along
  their lines at a tram's average pace and are put on the track in full as they come near. The cars and people are
  only ever simulated round you, too.
- **Trains** on every passenger route through the map that OpenStreetMap has: the S2, S3, S4, S41 and S6 suburban
  lines, the regional and fast trains (R8, R9, R11, R12, R13, R19) and the expresses (EuroCity, EuroNight, railjet),
  each along its own track. The S lines run CityElefants and RegioPanters, the regional trains InterPanters or a
  locomotive and coaches (RegioJet's yellow on the R8), the expresses a locomotive and a long string of coaches. An S
  train stops at every station it passes (the main station, Královo Pole, Lesná, Židenice, Černovice, Horní Heršpice),
  a regional train at the main ones, an express at the main station only. People wait on the platforms, get off and
  on at the doors on the platform's side. The trains run through the Královo Pole, Husovice, Cacovice and Obřany
  tunnels and over the viaducts above the streets, at up to about 90 km/h, and brake like trains: whatever is on the
  track when one comes is hit. A train whose route ends at the main station runs on afterwards, out of service, over
  the points to a through track and out of town. Take one over at its front like a tram (Space sounds the horn).
  Like the trams, only those round you are simulated in full.
- **Where the people are**: how many are out round you, and where, follows what the city is built of: the floor space
  round about, by what it is for (homes; shops, offices, schools, stations and the like), the squares and pedestrian
  streets, the parks and the stops. The centre, the main station and the campuses fill by day, the estates in the
  morning and evening, and by night the streets empty, the centre last. (An in-game day lasts 24 minutes: an hour a
  minute.)
- **The University of Defence** on Kounicova keeps the army's vehicles in its yard: a T-72 (Space fires its gun), a
  Pandur, Tatra trucks and Land Rovers. Take one and the army wants it back: four stars for the armour, three for the
  rest. They're back in the yard by the time you return.
- **The real buildings**: 51,972 outlines from OpenStreetMap (multi-part ones with their courtyards included), each
  at its real angle and in its real shape: a rectangle at any angle, an L, U or T in its own turned frame, or any
  polygon, with walls along every edge and collisions that follow them exactly. Each keeps its number of floors where
  it is mapped (most are), its kind and its colours. Pitched roofs slope up from every wall at one pitch until they
  meet in ridges (as a straight skeleton does), with a flat top on deep blocks; spires, cones and domes where they are
  mapped. Tall building parts (church towers and spires) rise at their real height, and a big church with no tower
  mapped gets one over its west front. Where a building stood on a street's carriageway, the street wins.
- **The ground as it is mapped**: squares and pedestrian streets, car parks, parks and cemeteries, railway land,
  sports grounds, woods, water and farmland (each field with its own crop), each drawn to its real outline rather
  than in 5 m tiles; the mapped street trees, and parks and woods planted at a believable density; tram tracks in the
  streets and every track of the railway.
- **The reservoir's south end**: the dam, the harbour at Bystrc and the lake up to Kozí horka, with boats out on
  it and two places to fish from its banks.
- **Landmarks**, the real buildings made to look like themselves: FIT BUT (the Carthusian monastery's wings round
  their garden, the church and its tower, the onion-domed towers, the FIT sign, the faculty's flag and a blue lamp at
  its door, all blue on the map); BUT's other faculties, each in its colour from the university's visual style (FEKT,
  FSI, FCH and FP in Královo Pole, FAST on Veveří, FA on Poříčí, FaVU on Údolní), found by their grounds as they are
  mapped, with their letters on the biggest flat roof, a banner, a flag and a lamp at the door, and a diamond on the
  map; the Old Town Hall and its tower over the gate on Radnická; the cathedral on Petrov
  with its two 84 m spires; St James's, St Thomas's and the Red Church with their towers; Špilberk with its
  courtyards; the main station; the AZ Tower; Pavilion Z's great dome and Pavilion A's at Výstaviště; Vila
  Tugendhat; the Mahen and Janáček theatres; the observatory's domes on Kraví hora; the Rondo arena; the Grandhotel,
  the International and Vaňkovka with their signs; the cooling towers. Also the hospitals (you wake up at the trauma
  hospital), police and fire stations with their vehicles outside, the astronomical clock on Náměstí Svobody and the
  market on Zelný trh, the Moulin Rouge back on its corner, a circus (big top, animal tent and wagons) where the
  Faculty of Informatics of Masaryk University stands on Botanická, the Atom Array Lab, and fishing on the Svratka and the
  Svitava.
- It takes about 9 s to load and about 500 MB of memory. The data is built by `tools/brno5/build.sh` (from
  OpenStreetMap, © OpenStreetMap contributors, ODbL) into `brno5_data.js`, which `index.html` loads only for this map.
