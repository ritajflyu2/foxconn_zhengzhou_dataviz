"""
Foxconn Zhengzhou — work-injury-insured workers by legal entity, 2025 (bubble map)

Circle AREA is proportional to the number of insured workers.
Color encodes the zone (Airport Zone vs. Economic Development Zone), not the
entity; entities are named with direct labels.
The Zhengzhou Airport Economy Zone is highlighted as a shaded area.

Run:  python map_insured_2025.py
In:   data/insured_2025_coords.csv
      data/airport_zone.geojson   (optional; downloaded automatically, see below)
Out:  map_insured_2025.png (next to this script)

Base map: `pip install contextily`. Pick the background with BASEMAP below
("gray", "satellite", "osm", or None). Free tiles, no API key. Without internet
the script still runs and draws a plain map.

Airport Zone boundary: on first run the script asks OpenStreetMap (Nominatim)
for the boundary of 郑州航空港经济综合实验区 and caches it as
data/airport_zone.geojson. If OSM has no usable boundary, you can draw one
yourself at https://geojson.io, export it, and save it under that file name.
"""

from pathlib import Path
import csv
import json
import math
import matplotlib.pyplot as plt
from matplotlib import font_manager
from matplotlib.lines import Line2D
from matplotlib.patches import Polygon, Patch
from matplotlib.path import Path as MplPath
import matplotlib.patheffects as pe

HERE = Path(__file__).resolve().parent
DATA_CSV = HERE / "data" / "insured_2025_coords.csv"
ZONE_FILE = HERE / "data" / "airport_zone.geojson"

BASEMAP = "gray"               # "gray" | "satellite" | "osm" | None
HIGHLIGHT_ZONE = True          # shade the Airport Economy Zone

# Search terms tried in order when asking OpenStreetMap for the boundary.
ZONE_QUERIES = ["郑州航空港经济综合实验区", "郑州航空港区", "航空港区, 郑州市",
                "Zhengzhou Airport Economy Zone"]

# ---------------------------------------------------------------- data ----
# insured_2025 = work-injury insurance count from the 2025 enterprise annual reports.
# latitude/longitude = from each entity's EIA report (WGS84 / CGCS2000).
# location_approx = 1 -> location estimated (dashed outline).
DATA, APPROX = [], set()
with open(DATA_CSV, encoding="utf-8-sig") as f:
    for r in csv.DictReader(f):
        DATA.append(dict(name=r["name_en"], n=int(r["insured_2025"]),
                         lon=float(r["longitude"]), lat=float(r["latitude"]),
                         park=r["park"]))
        if r["location_approx"] == "1":
            APPROX.add(r["name_en"])

AIRPORT = (113.8409, 34.5197)  # Zhengzhou Xinzheng International Airport

# ------------------------------------------------------------- styling ----
PARK_COLOR = {"航空港": "#2a78d6", "经开区": "#eb6834"}          # palette slots 1-2
PARK_NAME = {"航空港": "Airport Zone", "经开区": "Economic Development Zone"}
ZONE_FILL, ZONE_EDGE = "#2a78d6", "#1f5fae"
SURFACE = "#fcfcfb"
TEXT_1, TEXT_2, TEXT_3 = "#0b0b0b", "#52514e", "#8a8984"
GRID = "#e6e5e0"
HALO = [pe.withStroke(linewidth=3, foreground="white")]

_installed = {x.name for x in font_manager.fontManager.ttflist}
for f in ["Helvetica Neue", "Helvetica", "Arial", "PingFang SC", "Noto Sans CJK JP",
          "DejaVu Sans"]:
    if f in _installed:
        plt.rcParams["font.family"] = f
        break
plt.rcParams["axes.unicode_minus"] = False

MAX_RADIUS_PT = 34            # radius of the largest circle, in points


def area(n, n_max):
    """scatter `s` value so that circle AREA ∝ value (radius ∝ √value)."""
    r = MAX_RADIUS_PT * math.sqrt(n / n_max)
    return (2 * r) ** 2


def add_tiles(a, zoom="auto"):
    """Web-map background under lon/lat axes `a`. Returns True on success."""
    if BASEMAP is None:
        return False
    try:
        import contextily as cx
        src = {"gray": cx.providers.Esri.WorldGrayCanvas,
               "satellite": cx.providers.Esri.WorldImagery,
               "osm": cx.providers.OpenStreetMap.Mapnik}[BASEMAP]
        cx.add_basemap(a, crs="EPSG:4326", source=src, zoom=zoom,
                       attribution_size=5, reset_extent=True)
        return True
    except Exception as e:
        print(f"Base map not loaded, drawing plain map instead: {e}")
        return False


# ------------------------------------------------------- zone boundary ----
def _rings(geom):
    """Exterior rings [(lon, lat), ...] of a GeoJSON Polygon / MultiPolygon / Feature(Collection)."""
    t = geom.get("type")
    if t == "FeatureCollection":
        return [r for ft in geom["features"] for r in _rings(ft)]
    if t == "Feature":
        return _rings(geom["geometry"])
    if t == "Polygon":
        return [geom["coordinates"][0]]
    if t == "MultiPolygon":
        return [p[0] for p in geom["coordinates"]]
    return []


def _contains_campus(rings):
    probe = (DATA[0]["lon"], DATA[0]["lat"])    # first row = Hongfujin
    return any(MplPath(r).contains_point(probe) for r in rings)


def load_zone():
    """Return a list of exterior rings for the Airport Economy Zone, or None."""
    if ZONE_FILE.exists():
        rings = _rings(json.loads(ZONE_FILE.read_text(encoding="utf-8")))
        if rings:
            return rings
    try:
        import requests
    except ImportError:
        print("Zone boundary skipped: `requests` not installed.")
        return None
    for q in ZONE_QUERIES:
        try:
            resp = requests.get(
                "https://nominatim.openstreetmap.org/search",
                params=dict(q=q, format="jsonv2", polygon_geojson=1, limit=5),
                headers={"User-Agent": "foxconn-zhengzhou-dataviz (student project)"},
                timeout=20)
            resp.raise_for_status()
        except Exception as e:
            print(f"Zone boundary lookup failed ({q}): {e}")
            return None
        for hit in resp.json():
            geom = hit.get("geojson", {})
            rings = _rings(geom)
            if rings and _contains_campus(rings):
                ZONE_FILE.write_text(json.dumps(
                    {"type": "Feature", "properties": {"source": "OpenStreetMap / Nominatim",
                                                        "query": q,
                                                        "display_name": hit.get("display_name")},
                     "geometry": geom}, ensure_ascii=False), encoding="utf-8")
                print(f"Zone boundary from OSM: {hit.get('display_name')}  -> cached in {ZONE_FILE.name}")
                return rings
    print("No Airport Zone boundary found in OSM. Draw one at geojson.io and save it as "
          f"data/{ZONE_FILE.name} to enable the highlight.")
    return None


def draw_zone(a, rings, fill=True):
    for r in rings:
        if fill:
            a.add_patch(Polygon(r, closed=True, facecolor=ZONE_FILL, alpha=0.10,
                                edgecolor="none", zorder=1.5))
        a.add_patch(Polygon(r, closed=True, facecolor="none", edgecolor=ZONE_EDGE,
                            linewidth=1.3, linestyle=(0, (5, 3)), zorder=1.6))


def zone_label_point(rings, extent, target):
    """A point inside the zone and inside the map extent, nearest to `target`."""
    lon0, lon1, lat0, lat1 = extent
    best, best_d = None, 1e9
    paths = [MplPath(r) for r in rings]
    for i in range(41):
        for j in range(41):
            p = (lon0 + (lon1 - lon0) * i / 40, lat0 + (lat1 - lat0) * j / 40)
            if any(pt.contains_point(p) for pt in paths):
                d = (p[0] - target[0]) ** 2 + (p[1] - target[1]) ** 2
                if d < best_d:
                    best, best_d = p, d
    return best


# ---------------------------------------------------------------- plot ----
n_max = max(d["n"] for d in DATA)
fig, ax = plt.subplots(figsize=(8, 10), dpi=150)
fig.patch.set_facecolor(SURFACE)
fig.subplots_adjust(left=0.08, right=0.97, top=0.92, bottom=0.095)


def style_map(a, fmt="{:.2f}"):
    a.set_facecolor(SURFACE)
    a.grid(color=GRID, linewidth=0.6)
    for s in a.spines.values():
        s.set_visible(False)
    a.tick_params(colors=TEXT_3, labelsize=7.5, length=0)
    a.xaxis.set_major_formatter(lambda v, _: fmt.format(v) + "°E")
    a.yaxis.set_major_formatter(lambda v, _: fmt.format(v) + "°N")


def set_extent(a, lon0, lon1, lat0, lat1):
    a.set_xlim(lon0, lon1)
    a.set_ylim(lat0, lat1)
    a.set_aspect(1 / math.cos(math.radians((lat0 + lat1) / 2)))


def bubble(a, d):
    a.scatter(d["lon"], d["lat"], s=area(d["n"], n_max), color=PARK_COLOR[d["park"]],
              alpha=0.85, edgecolor=SURFACE, linewidth=2, zorder=3)
    if d["name"] in APPROX:
        a.scatter(d["lon"], d["lat"], s=area(d["n"], n_max), facecolor="none",
                  edgecolor=TEXT_2, linewidth=1, linestyle=(0, (2, 2)), zorder=4)


def label(a, d, dx, dy):
    tag = "\n(location estimated)" if d["name"] in APPROX else ""
    a.annotate(f"{d['name']}{tag}\n{d['n']:,} workers", (d["lon"], d["lat"]),
               xytext=(dx, dy), textcoords="offset points", fontsize=10, color=TEXT_1,
               path_effects=HALO, ha="left" if dx > 0 else "right", va="center",
               arrowprops=dict(arrowstyle="-", color=TEXT_3, lw=0.8, shrinkA=2, shrinkB=0),
               zorder=6)


Z = (113.831, 113.869, 34.532, 34.566)   # zoom window around the Foxconn campus
zone = load_zone() if HIGHLIGHT_ZONE else None

# Map extent (lon0, lon1, lat0, lat1)
MAIN = (113.70, 113.95, 34.49, 34.78)

# ---- main map (city scale) ----
style_map(ax)
set_extent(ax, *MAIN)
if add_tiles(ax):
    ax.grid(False)
if zone:
    draw_zone(ax, zone)
    set_extent(ax, *MAIN)                      # patches must not change the view
    pt = zone_label_point(zone, MAIN, target=(113.915, 34.505))
    if pt:
        ax.text(*pt, "Zhengzhou Airport\nEconomy Zone", fontsize=9.5, color=ZONE_EDGE,
                ha="center", va="center", fontweight="bold", path_effects=HALO, zorder=5)

for d in DATA:
    if d["park"] == "经开区":
        bubble(ax, d)
        label(ax, d, 34, 18)
    else:  # Airport Zone: small dots here, full circles in the inset
        ax.scatter(d["lon"], d["lat"], s=14, color=PARK_COLOR[d["park"]], zorder=3)

ax.text(113.705, 34.765, "Economic Development Zone\n(Export Processing Zone)", fontsize=9,
        color=TEXT_2, va="top", path_effects=HALO)
ax.scatter(*AIRPORT, marker="^", s=40, color=TEXT_3, zorder=4)
ax.annotate("Xinzheng Int'l Airport", AIRPORT, xytext=(6, -10), textcoords="offset points",
            fontsize=8, color=TEXT_2, path_effects=HALO)

km_per_deg_lon = 111.32 * math.cos(math.radians(34.6))
x0, y0 = 113.715, 34.50
ax.plot([x0, x0 + 5 / km_per_deg_lon], [y0, y0], color=TEXT_2, lw=2, solid_capstyle="butt")
ax.text(x0 + 2.5 / km_per_deg_lon, y0 + 0.004, "5 km", ha="center", fontsize=8, color=TEXT_2,
        path_effects=HALO)

# ---- inset: Airport Zone zoom ----
ins = ax.inset_axes([0.36, 0.27, 0.62, 0.44])
style_map(ins, "{:.3f}")
set_extent(ins, *Z)
if add_tiles(ins, zoom=15):
    ins.grid(False)
if zone:
    draw_zone(ins, zone, fill=False)           # outline only: the whole inset is inside the zone
    set_extent(ins, *Z)
ins.set_xticks([]); ins.set_yticks([])
for s in ins.spines.values():
    s.set_visible(True)
    s.set_color(TEXT_3)
    s.set_linewidth(0.8)
ax.indicate_inset_zoom(ins, edgecolor=TEXT_3, linewidth=0.8, alpha=1)
ax.text(Z[0] - 0.002, (Z[2] + Z[3]) / 2, "Zoomed area\n(see inset above)", ha="right",
        va="center", fontsize=8.5, color=TEXT_2, path_effects=HALO)

INSET_OFFSET = {"Hongfujin": (44, -58), "FII Yuzhan": (-20, -52), "Henan Fuchi": (18, -30)}
airport_rows = [d for d in DATA if d["park"] == "航空港"]
for d in sorted(airport_rows, key=lambda d: -d["n"]):
    bubble(ins, d)
for d in airport_rows:
    label(ins, d, *INSET_OFFSET.get(d["name"], (30, -30)))
total_airport = sum(d["n"] for d in airport_rows)
ins.text(0.03, 0.96, f"Airport Zone (Comprehensive Bonded Zone), zoomed\n"
                     f"Three entities combined: {total_airport:,} workers",
         transform=ins.transAxes, fontsize=9, color=TEXT_2, va="top", path_effects=HALO)
x1, y1 = 113.834, 34.5345
ins.plot([x1, x1 + 1 / km_per_deg_lon], [y1, y1], color=TEXT_2, lw=2, solid_capstyle="butt")
ins.text(x1 + 0.5 / km_per_deg_lon, y1 + 0.0008, "1 km", ha="center", fontsize=8, color=TEXT_2)

# ---- legends ----
handles = [Line2D([], [], marker="o", linestyle="", markersize=9, markerfacecolor=c,
                  markeredgecolor=SURFACE, label=PARK_NAME[p]) for p, c in PARK_COLOR.items()]
if zone:
    handles.append(Patch(facecolor=(0.165, 0.471, 0.839, 0.10), edgecolor=ZONE_EDGE,
                         linestyle="--", label="Airport Economy Zone boundary (OSM)"))
ax.legend(handles=handles, title="Zone", loc="upper right", frameon=True, framealpha=0.85,
          edgecolor="none", facecolor=SURFACE, fontsize=8.5, title_fontsize=9,
          labelcolor=TEXT_1)

leg = ax.inset_axes([0.62, 0.72, 0.30, 0.13])
leg.set_xlim(0, 1); leg.set_ylim(0, 1); leg.axis("off")
cx0, base = 0.30, 0.05
fig.canvas.draw()
h_pt = leg.get_window_extent().height * 72 / fig.dpi
for v in (30000, 15000, 5000):
    r_ax = MAX_RADIUS_PT * math.sqrt(v / n_max) / h_pt
    leg.scatter(cx0, base + r_ax, s=area(v, n_max), facecolor="none",
                edgecolor=TEXT_2, linewidth=1, clip_on=False)
    top = base + 2 * r_ax
    leg.plot([cx0, 0.62], [top, top], color=TEXT_3, lw=0.6, ls=":")
    leg.text(0.64, top, f"{v:,}", fontsize=8.5, color=TEXT_1, va="center", path_effects=HALO)
leg.text(0.0, 1.12, "Insured workers (circle area)", fontsize=9, color=TEXT_1,
         transform=leg.transAxes, path_effects=HALO)

# ---- title + source ----
fig.text(0.08, 0.965, "Foxconn Zhengzhou: insured workers by legal entity, 2025",
         fontsize=15, color=TEXT_1, weight="bold")
fig.text(0.08, 0.952, "Circle area is proportional to insured workers; color = zone.\n"
                      "Counts cover direct employees only, not dispatch or student workers.",
         fontsize=9, color=TEXT_2, va="top")
fig.text(0.08, 0.012,
         "Sources: 2025 enterprise annual reports (social insurance section); coordinates from each entity's EIA report.\n"
         "Henan Fuchi has no EIA coordinate, so its location is estimated. Zone boundary: OpenStreetMap.\n"
         "China Labor Watch (2025) estimates 150-200k peak-season workers in the Airport Zone, 3-4x the insured count.",
         fontsize=7.5, color=TEXT_3, va="bottom")

out = HERE / "map_insured_2025.png"
fig.savefig(out, dpi=300, facecolor=SURFACE)
print(f"saved {out}")
