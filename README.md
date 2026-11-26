# Quant Theft Auto

A lightweight top-down open-world crime sandbox that runs in the browser. You steal cars, take jobs from
ringing payphones and shake off the cops. The twist is that some of the rules come from quantum mechanics.

There are two maps: a whole island (a city, farmland, a desert casino town, a forested mountain and a tropical
coast) and **inner Brno**, with every street and the real buildings. Streets carry their names. You can play alone
or **online with a friend**.

No build step and no dependencies: just `index.html` and `game.js` (plain canvas and WebAudio, about 820 KB), plus
`brno5_data.js` (3.4 MB) for Brno, loaded only when you pick it. Online co-op loads one small library,
and only when you open the co-op menu.

On a slower computer the game keeps itself playable. When it falls under 30 frames a second it draws fewer pixels
(a sharp screen gets up to two to each of its own), then plain walls and roofs without their textures, until it keeps
up; once there is room again it goes back up. A browser that holds every page at 30 frames a second, as on battery,
is left alone.

Play it at **https://ondrik.github.io/qta/**. It installs as an app (the browser's "Install" or "Add to Home
Screen"), and once you have played it starts with no connection too, on each map you have opened.

The game in progress is saved, one per map, every 20 seconds, when you pause and when you switch away; the title
screen then offers to continue it (C, or tap the line). Kept: where you are and the car you're in, your cash, lives,
weapons and quantum charges, the arcs, the day, and the wanted level (the police resume where they lost you). Not a
job in progress. Game over clears it.

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
| P / Esc · H | pause (Q on the pause screen quits to the title screen) · help (press H again for the quantum notes, and again for your achievements) · N dismisses a note |
| ← → · ↑ ↓ (title screen) | choose where to start · switch between the island and inner Brno |
| L (title screen) | **Physics Lab**: 10 guided lessons (L again from the pause screen to leave) |
| O (title screen) | **online co-op** with a friend: host, then send them the link it gives you (or the room code) |
| H (title screen) | your achievements |

On phones and tablets, touch buttons appear automatically. On the title screen, tap the left half to play
and the right half for the Physics Lab.

For testing there is a hidden **debug console**: type `debug` while playing (best while paused, since E and G also
act in play). `tp <place>` teleports you to a start, site, district, street, tram stop, faculty and so on (`tp <x> <y>`
to a tile, and in Brno `tp <lat> <lon>`), `find <text>` lists the places, `where` tells you where you are,
`wanted <n>` sets the wanted level, `car <type>` puts you in any vehicle (boats on the nearest water), `god` stops
damage and arrests, `powerups` puts one of each power-up and gun beside you, `squad` sends P.L.A.N.C.K.'s heroes at you, `stats` shows the frame time, the detail level
and how much is being simulated, and `quality <0-5>` fixes the detail level (`quality auto` lets the game choose
again). `help` lists the rest, Esc closes it.

Goal: reach **$100,000**. Ringing payphones give jobs, and each finished job raises your cash multiplier.
Among the jobs: a **duel** with one of P.L.A.N.C.K.'s heroes, sent down for you alone; a crate in a **sealed
courtyard**, walled in on every side, that you can only reach (and leave) by tunnelling through the wall (the barrier
is thin there: your chance is high); and in Brno, a vault's PIN found with **Grover's search** on FIT's quantum
computer, then the vault before the PIN changes, and a parcel stamped by **ÚPT's quantum clock**, to be delivered on
the minute (within three game minutes; a game minute is a second). Those three are also an arc of their own, **The
Planck Files**, from the payphone in Žabovřesky.

**The Bell test** (the BELL sign: by the Atom Array Lab, and in Brno also at Masaryk University's Faculty of Science
on Kotlářská): entangled photon pairs fly to Alice and Bob, who each measure at one of two polariser angles,
picked at random for each pair. Turn the four polarisers (← → picks one, ↑ ↓ turns it by 7.5°) and run 800 pairs: if
each photon carried its answers with it, |S| = |E(a,b) − E(a,b′) + E(a′,b) + E(a′,b′)| could never pass 2. Get it past
2.3 and you have broken Bell's inequality ($3,000, once a day).
**Boats** lie moored along the banks of the reservoir (in Brno) and of the island's sea, lakes and river, and more
are anchored out on the water: walk up to one on the bank and press Enter. Speedboats, rowing boats and sailing
dinghies (the wind drives a dinghy, and it can't sail straight into it: the red pennant at its masthead shows which
way it blows) glide and drift, and only water carries them. Press Enter at a bank to get out, or, out on the water,
by another empty boat to climb across. Police boats come after you on the water, and police on the banks shoot
across it. No superposition or tweezer on the water, and T entangles a boat only with another boat.

**Power-ups** turn up at random around you every few seconds, up to ten at a time: **ψ** (a superposition
charge), **ε** (two entanglement charges), once you have lost a life a **♥** that gives it back, and the **guns** (a
pistol, a machine gun, now and then a rocket launcher). Walk or drive into one to take it. They show on the minimap in their colours, blink when they are about to go, and are gone after
a minute or once you leave them behind.

**Quantum tunnelling**: hit a wall, in a car or on foot, and now and then you come out on its far side, at the speed
you hit it and unhurt. The chance (in the corner, after ψ and ε) grows the longer it has been since you last tunnelled,
1 − e^(−t / 2 min): about a fifth after 30 s, two fifths after a minute, two thirds after two. Once you have, it starts
again from nothing. A wall too thick, or one that hides a closed courtyard or water, you just hit. No tunnelling in
the Physics Lab, near the Bureau's detectors, or from eight stars.

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
army's helicopter, the Helicarrier). Anything else you do counts for a tenth. A second row of stars, the level's name
and its way out show under the first. From seven stars up a level doesn't fade by itself: only its way out ends it.

| Stars | Who comes, and the way out |
| --- | --- |
| 6 · The Measurement Bureau | Black vans with a detector dish: near one, your superposition collapses, your entanglement breaks, and X and T don't work. The Bureau's drone keeps you measured, so the police never lose you (the quantum Zeno effect). Lose it under trees or an overpass or in a tunnel, or shoot it down. Spike strips ahead of you halve your top speed until you swap cars. Lose them as at five stars. |
| 7 · State of emergency | The army: checkpoints of armoured carriers and soldiers on the bridges and at the tunnel mouths ahead, carriers with mounted guns, and an attack helicopter whose rockets land where a red ring marks the street. Way out: lie low for 60 s unseen, or on foot face a wall and press T to spend an ε charge tunnelling through the building, out of their sight, or take a boat across the water and get out on a bank unseen, far from where you put out (about 75 tiles; lose the Bureau's drone first). Either takes you back to five stars. |
| 8 · The Observer | A measurement sweep every 20 s: wherever you are, they know. No superposition or entanglement at all, no ε pickups. Jets strafe your street (a red strip marks their run). Way out: one of the entangled payphones, cyan on the map (at the Atom Array Lab and, in Brno, at FIT BUT). A Bell measurement there (press Space as the arrow crosses the window, two out of three) teleports you to the other one, and you are down to three stars. |
| 9 · Demolition | Armoured bulldozers come straight through the buildings. Hide behind one and a wrecking crew brings it down on you, leaving rubble across the street. Fuel tankers lie jack-knifed and burning in the junctions ahead, and a crane swings a wrecking ball over a main junction. Way out: 45 s unseen in a pedestrian zone or square, back to five stars. |
| 10 · Air assault | Swarms of kamikaze drones every 18 s (a red ring marks where each dives, 1.2 s ahead; two hits take you down; shoot them down), paratroopers, squads roped down from helicopters onto the street ahead, and a P.L.A.N.C.K. Helicarrier that comes in over the city and circles beside you while its searchlight hunts for you (twelve rockets bring it down; bullets pass under it). It sends down its heroes one after another, two at most at a time: the **Collapser**, an armoured flyer whose visor beam burns and keeps you seen; **Agent Spooky**, a spy entangled with you, who appears beside you, shoots, and stuns you (or stalls your car) with a wrist shock; **Big Bang**, a giant who leaps after you, lands with a shockwave and throws cars at you; and the **Tunneler**, who walks straight through buildings, digs ahead of you and grabs your car. Shoot them, rocket them or run them over (Big Bang stops a car dead); beaten, each is beamed back up. Way out: go to ground, through two different tunnels from end to end, unseen going in and coming out, back to five stars. On the island, with no tunnels, lie low 75 s unseen. |

### Achievements

Doing something worth remembering earns an achievement, but which things count is hidden: nothing tells you what one
is until you have it. A card under the minimap tells you when you do. The help's last page (press H three times) has
a tile for each, from the easiest to the hardest: gold for those you have (what they are is listed below, newest
first), blank for the rest, but for the next one to find (the easiest you haven't that this map has), whose name
shows as a hint. Pick a tile (arrow keys, or tap it) to read it; for one you haven't found, Enter (or a tap on its
line) buys what to do for it, in detail, with the game's cash: the harder it is, the dearer ($500 for the easiest,
$12,700 for the hardest). What you have bought is kept like the achievements. The title screen shows them too, in its
top right corner (H, or a tap on them, opens the page there). They are kept in your browser alone (local storage),
and none come in a game where the debug console changed something (a new game clears that, unless god mode is still
on). In online co-op your friend's go to their own browser.

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

Switch maps with ↑ or ↓ on the title screen. Inner Brno is built from [OpenStreetMap](https://www.openstreetmap.org)
data (© OpenStreetMap contributors, available under the [ODbL](https://opendatacommons.org/licenses/odbl/)) at about
**5 m a tile**: 2241 × 1690 tiles, 11.2 × 8.5 km from the dam of the Brno reservoir, Bystrc and Královo Pole in the
north to Komárov in the south, and from Kohoutovice to Židenice. At this scale a car, a street and a building are
their real size. (Up to v24 there was also a coarser Brno map at 15 m a tile, covering more of the city; the version
menu still has it.)

- **Every street** with its name, built straight from OpenStreetMap's ways: a junction wherever ways share a point
  and nowhere else, so a dual carriageway is two one-way roads with its median between them, and every slip road,
  loop ramp and roundabout is where it is mapped (the Žabovřeská interchange, say). A road on a bridge over another is
  an overpass (76 of them, with their ramps) and one beneath another a tunnel: the Husovický, Královopolský and
  Pisárecký tunnels, each tube on its own. A deck is drawn raised in perspective, with its parapets, piers and
  shadow, and turns see-through while you drive under it; in a tunnel the city above fades to show the lit tube, and
  the police can't see you. Two roads that cross at different levels never meet in a junction
  (`tools/brno/gradecheck.py` checks the built network against every grade-separated crossing in the data). Each street is as wide as its lanes, which come from OpenStreetMap (one to
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
  than in 5 m tiles; parks and woods planted at a believable density, every tree mapped in them, and on the streets
  and squares a quarter of the mapped trees and a tree-lined street here and there (all of them made a slalom of the
  pavements); tram tracks in the
  streets and every track of the railway, at its own level: the viaducts over the streets (drawn over the traffic
  under them, see-through while you are under one), the road bridges over the tracks with their parapets, and the
  level crossings on the sidings and industrial spurs (no passenger line in the map has one).
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
- It takes a few seconds to load (building the city from the data) and about 500 MB of memory. The data is built by `tools/brno5/build.sh` (from
  OpenStreetMap, © OpenStreetMap contributors, ODbL) into `brno5_data.js`, which `index.html` loads only for this map.

### Easter eggs (spoilers)

In Brno (in online co-op, for the host). The clock now keeps weekdays too: a game starts on a Friday.

- **The orloj's marble**: from about 10:40 a crowd gathers round the astronomical clock on Náměstí Svobody (a polished
  black stone bullet six metres tall, where it really stands). At 11:00 a glass marble rolls out of one of its
  openings: catch it on foot, and it gets you out of one arrest.
- **Moravské náměstí**: Margrave Jošt on his long-legged bronze horse (Odvaha, Courage), eight metres tall: you can
  walk right under it. Outside the Supreme Administrative Court, Justice (Spravedlnost) lifts a heavy block on a jet of
  water, and on some days the jet soaks the pavement: stand by it long enough and you get sprayed.
- **Noon at eleven**: in 1645 the Swedes were to give up their siege if Brno held out until noon, and Petrov rang noon an
  hour early. Its bells ring at 11:00; wanted (up to five stars) within earshot, you lose two stars.
- **The Brno dragon**: past midnight the crocodile from the Old Town Hall's passage prowls the old town and eats whoever
  it catches. Bullets and cars don't hurt it. Take the calfskin stuffed with lime from the market on Zelný trh and let
  it snatch it: it runs to drink and bursts ($5,000).
- **Birk's wheel**: in 1636 the wheelwright Jiří Birk bet he could make a wheel and roll it from Lednice to Brno
  between dawn and dusk. The wheel waits where the road from Lednice comes in; roll it to the Old Town Hall before
  20:00 ($4,000).
- **The little man on St James's** bares his backside at Petrov from the bell tower (on the detailed map).
- **Špilberk**: busted in Brno, you're let out of the old "prison of nations".
- **The cellars under the old town**: hatches at the Labyrinth under Zelný trh, the Capuchin crypt, the ossuary under St
  James's and the Mint Master's cellar, each leading on to the next (Enter). Down there the police lose you.
- **The new main station**: a billboard where it is to stand. The opening is always twenty years away, and slips a year
  every day.
- **Mendel's peas**: round his abbey the parked cars come green and yellow, three to one.
- **Kometa**: on Tuesday, Friday and Sunday evenings the fans in blue and white stream to Hala Rondo, the hall roars
  during the match, and they pour out after it.
- **Kraví hora** (Cow Hill) has cows.
- **Animals on the loose**: a sea lion in Starý Lískovec (it barks), a giant panda between the Tesco on Cimburkova and
  the Kaufland on Sportovní in Ponava (it sits and eats bamboo), and a golden jackal in Bystrc (it runs from you, and
  howls at night).
- **The quantum computer at FIT**: by the faculty's door (the QPU sign), press Enter and run Grover's search for the
  PIN of a bank's vault. Each round the oracle flips the right PIN's amplitude and the diffusion step reflects them all
  about their mean; measure after about π/4·√N rounds and you almost certainly get it ($1,000 to $5,000, once a day;
  harder each time you win). Measure at the wrong moment and the dilution refrigerator needs 45 s to cool down again.
- **The quantum clock at ÚPT**: by the gate of the Institute of Scientific Instruments on Královopolská, an optical
  atomic clock shows the time to the nanosecond, and what is coming up in Brno (the orloj, the dragon, Kometa...).
- **The Bren gun** (BRno + ENfield) lies in the old Zbrojovka works.
- **Hantec**: type `hantec` and the messages speak Brno's slang (šalina, švestky, fáro, Svoboďák, Špilas, Rola...).
  A browser set to Czech starts with it on; type `hantec` to switch it off (the choice is kept).
- **The Carthusians**: at night monks in white walk FIT's old monastery cloister. They keep their vow of silence: whatever
  they see, they don't call the police.
- **The duck** from the FIT students' club U Kachničky: pick it up and the debug console opens with ` (backquote).
- **The project due at 23:59**: from 22:45 a FIT student waits outside the Pod Palackého vrchem dorms. Stop by them, and
  get them to Božetěchova before midnight.
- **The Formula Student car** outside the mechanical engineering faculty is the fastest thing in town.
- **The Friday train home**: on Friday afternoons students with suitcases head for the main station; on Sunday evenings
  they come back.
