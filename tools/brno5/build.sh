#!/bin/sh
# Rebuild inner Brno at 5 m a tile from OpenStreetMap (© OpenStreetMap contributors, ODbL) into ../../brno5_data.js.
# Needs curl and Python 3 with numpy, scipy, Pillow and shapely; uses ../brno/roads.py (the projection), net.py and
# decks.py (tracing the overpasses and tunnels), levels.py and gradecheck.py. Overpass is a shared public service: run
# this rarely (the queries are big).
set -e
cd "$(dirname "$0")"
api=${OVERPASS_API:-https://overpass-api.de/api/interpreter}  # (another instance, e.g. https://overpass.kumi.systems/api/interpreter, when that one is full)
fetch() { curl -sS -A "qta-map-builder/1.0" --data-urlencode "data@$1" "$api" -o "$2"; head -c 1 "$2" | grep -q '{' || { echo "Overpass is busy: try again later, or set OVERPASS_API to another instance"; exit 1; }; }
fetch q_roads.txt roads.json; sleep 10
fetch q_bld.txt bld.json; sleep 10
fetch q_parts.txt parts.json; sleep 10
fetch q_land1.txt land1.json; sleep 10
fetch q_land2.txt land2.json; sleep 10
fetch q_land3.txt land3.json; sleep 10
fetch q_trees.txt trees.json; sleep 10
fetch q_signals.txt signals.json; sleep 10
fetch q_trams.txt trams.json; sleep 10
fetch q_trains.txt trains.json; sleep 10
fetch q_stations.txt stations.json
python3 opened.py roads.json  # (a road whose opening date has passed is open, though still mapped as under construction)
python3 land5.py     # the ground at 5 m a tile, and its areas as polygons -> land5.npy, land5poly.json, rivers5.json
python3 net5.py      # every street from OpenStreetMap's ways, with tunnels and overpasses -> net5.json
python3 ../brno/gradecheck.py net5.json  # (no junction where OpenStreetMap has roads cross at different levels)
python3 tram5.py     # the tram lines along their tracks, with their stops -> tram5.json
python3 train5.py    # the train routes along their tracks, the stations they stop at, tunnels -> train5.json
python3 bld5.py      # the buildings' outlines, off the streets -> bld5.json
python3 export5.py ../../brno5_data.js
