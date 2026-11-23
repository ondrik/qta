# Quant Theft Auto

A lightweight top-down open-world crime sandbox that runs in the browser. You steal cars, take jobs from
ringing payphones and shake off the cops. The twist is that some of the rules come from quantum mechanics.

There are three maps: a whole island (a city, farmland, a desert casino town, a forested mountain and a tropical
coast), **Brno**, and **inner Brno in detail**, with every street and the real buildings. Streets carry their names.
You can play alone or **online with a friend**.

No build step and no dependencies: just `index.html` and `game.js` (plain canvas and WebAudio, about 690 KB), plus
`brno5_data.js` (1.8 MB) for the detailed map, loaded only when you pick it. Online co-op loads one small library,
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
| Enter / F / E | get in or out of cars (occupied ones too) · at a jetty: go **fishing** |
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

Goal: reach **$100,000**. Ringing payphones give jobs, and each finished job raises your cash multiplier.
Spray shops ($500) clear your wanted level. If you are wasted or busted you come back at the nearest hospital or
police station, facing the street. Ramming a police car gets you at least one star, and that cruiser gives chase.
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
  start location of its own and the FIT Hackers story arc in Královo Pole.
- **Districts** get their own buildings: burgher houses in the old town, tenements in the inner districts, villas
  in Černá Pole, Stránice and Pisárky, panel estates in Lesná, Bystrc, Bohunice, Lískovec, Kohoutovice, Vinohrady
  and Líšeň, warehouses on industrial land, and villages round the edge.

The data was fetched once through the Overpass API and is embedded in `game.js`, so playing needs no network.

### Inner Brno in detail

The third map is inner Brno at about **5 m a tile**: 1426 × 1468 tiles, 7.1 × 7.3 km from Královo Pole and
Žabovřesky in the north to Komárov in the south, and from Pisárky to Židenice. At this scale a car, a street and a
building are their real size.

- **Every street** with its name (about 3,300 of them), traced into one network like the main roads above, with
  both tunnels and about 40 overpasses. The Královopolský tunnel's two tubes run apart, as they do, from the
  Žabovřeská interchange to Královo Pole; the slip roads that dip under the interchange beside it stay streets of
  their own. Traffic lights stand where main roads meet; the side streets are left to the drivers.
- **The real buildings**: 37,926 outlines from OpenStreetMap (multi-part ones with their courtyards included), each
  at its real angle and in its real shape: a rectangle at any angle, an L, U or T in its own turned frame, or any
  polygon, with walls along every edge and collisions that follow them exactly. Each keeps its number of floors where
  it is mapped (most are), its kind and its colours. Pitched roofs slope up from every wall at one pitch until they
  meet in ridges (as a straight skeleton does), with a flat top on deep blocks; spires, cones and domes where they are
  mapped. Tall building parts (church towers and spires) rise at their real height, and a big church with no tower
  mapped gets one over its west front. Where a building stood on a street's carriageway, the street wins.
- The land use at full resolution: squares and pedestrian streets, car parks, parks and cemeteries, railway land
  and sports grounds; the mapped street trees, and parks and woods planted at a believable density; tram tracks in
  the streets and every track of the railway.
- **Landmarks**, the real buildings made to look like themselves: FIT BUT (the Carthusian monastery's wings round
  their garden, the church and its tower, the onion-domed towers, the FIT sign, the faculty's flag and a blue lamp at
  its door, all blue on the map); the Old Town Hall and its tower over the gate on Radnická; the cathedral on Petrov
  with its two 84 m spires; St James's, St Thomas's and the Red Church with their towers; Špilberk with its
  courtyards; the main station; the AZ Tower; Pavilion Z's great dome and Pavilion A's at Výstaviště; Vila
  Tugendhat; the Mahen and Janáček theatres; the observatory's domes on Kraví hora; the Rondo arena; the Grandhotel,
  the International and Vaňkovka with their signs; the cooling towers. Also the hospitals (you wake up at the trauma
  hospital), police and fire stations with their vehicles outside, the astronomical clock on Náměstí Svobody and the
  market on Zelný trh, the Moulin Rouge back on its corner, the Atom Array Lab, and fishing on the Svratka and the
  Svitava.
- It takes about 6 s to load and a few hundred MB of memory. The data is built by `tools/brno5/build.sh` (from
  OpenStreetMap, © OpenStreetMap contributors, ODbL) into `brno5_data.js`, which `index.html` loads only for this map.
