# Map: insured workers by Foxconn Zhengzhou entity, 2025 (English)

Bubble map of 工伤保险参保人数 (2025) for the four legal entities, on a real map.
Circle area ∝ insured workers; color = industrial park (航空港 / 经开区).
The left map shows the whole Airport Economy Zone; the right panel zooms into the Foxconn campus, where three entities sit ~1 km apart.
The Zhengzhou Airport Economy Zone (郑州航空港经济综合实验区) is shaded with a dashed outline.

## Run
```
pip install matplotlib contextily
cd outputs/map_insured_2025   # from the project root
python3 map_insured_2025.py             # portrait
python3 map_insured_2025_landscape.py   # landscape (1512×982, for the Figma frame)
```
Background: edit `BASEMAP` in the script — `"gray"` (default), `"satellite"`, `"osm"`, or `None`.
Tiles are Esri / OpenStreetMap (free, no API key). Without internet it draws the plain map.

Zone boundary: on the first run the script asks OpenStreetMap (Nominatim) for the Airport Economy Zone
boundary and caches it as `data/airport_zone.geojson`. It only accepts a polygon that contains the
Hongfujin campus. If none is found, draw the zone at https://geojson.io, export GeoJSON, and save it
under that name; set `HIGHLIGHT_ZONE = False` to turn the shading off.

## Data (`data/`)
- `insured_2025_coords.csv` — input for the script: 2025 insured workers + coordinates (`name_en` = labels on the map).
- `airport_zone.geojson` — created on first run (Airport Economy Zone boundary from OSM).
- `insured_2016-2025_coords.csv` — same entities, one row per year (for a time slider / animation). 河南富驰 2020 = 1 is flagged as an outlier.

Sources: enterprise annual reports (social insurance section); coordinates from each entity's EIA report.
Caveats: 河南富驰 location is estimated (no EIA coordinate); 富联精密's EIA coordinate was mis-formatted and has been converted — verify on satellite view.
Insured counts cover direct employees only (no dispatch or student workers).
