"""
Foxconn Zhengzhou - insured workers by legal entity, 2025 (bubble map)
LANDSCAPE version of map_insured_2025.py, for the Figma frame (node 274-1381).
Sized to fill it exactly: figsize=(15.12, 9.82) at dpi=100 -> 1512x982 px.

This is the SAME single map (one main map + one zoomed inset over it, same as
the original) - not split into two separate charts. To make it read as a
landscape composition instead of letterboxing inside a wide canvas, the
map's own longitude extent is widened (more km of mostly-empty land/water to
the right of the real content) so the geographically-locked aspect ratio of
the map matches the landscape frame, and the zoomed inset + legends are
enlarged and moved into that newly available right-hand space - the same
elements as the original, just re-laid-out for a wide frame instead of a
tall one.

Run:  python map_insured_2025_landscape.py
In:   data/insured_2025_coords.csv, data/airport_zone.geojson (same as the original)
Out:  map_insured_2025_landscape.png (next to this script), exactly 1512x982 px
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

BASEMAP = "gray"
HIGHLIGHT_ZONE = True
ZONE_QUERIES = ["郑州航空港经济综合实验区", "郑州航空港区", "航空港区, 郑州市",
                "Zhengzhou Airport Economy Zone"]

DATA, APPROX = [], set()
with open(DATA_CSV, encoding="utf-8-sig") as f:
    for r in csv.DictReader(f):
        DATA.append(dict(name=r["name_en"], n=int(r["insured_2025"]),
                         lon=float(r["longitude"]), lat=float(r["latitude"]),
                         park=r["park"]))
        if r["location_approx"] == "1":
            APPROX.add(r["name_en"])

AIRPORT = (113.8409, 34.5197)

PARK_COLOR = {"航空港": "#2a78d6", "经开区": "#eb6834"}
PARK_NAME = {"航空港": "Airport Zone", "经开区": "Economic Development Zone"}
ZONE_FILL, ZONE_EDGE = "#2a78d6", "#1f5fae"
SURFACE = "#fcfcfb"
LAND = "#eef0ec"     # fallback fill when basemap tiles can't be fetched (no internet from here)
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

MAX_RADIUS_PT = 34


def area(n, n_max):
    r = MAX_RADIUS_PT * math.sqrt(n / n_max)
    return (2 * r) ** 2


def add_tiles(a, zoom="auto"):
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


def _rings(geom):
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
    probe = (DATA[0]["lon"], DATA[0]["lat"])
    return any(MplPath(r).contains_point(probe) for r in rings)


def load_zone():
    if ZONE_FILE.exists():
        rings = _rings(json.loads(ZONE_FILE.read_text(encoding="utf-8")))
        if rings:
            return rings
    try:
        import requests
    except ImportError:
        return None
    for q in ZONE_QUERIES:
        try:
            resp = requests.get("https://nominatim.openstreetmap.org/search",
                                 params=dict(q=q, format="jsonv2", polygon_geojson=1, limit=5),
                                 headers={"User-Agent": "foxconn-zhengzhou-dataviz (student project)"},
                                 timeout=20)
            resp.raise_for_status()
        except Exception:
            return None
        for hit in resp.json():
            rings = _rings(hit.get("geojson", {}))
            if rings and _contains_campus(rings):
                return rings
    return None


def draw_zone(a, rings, fill=True):
    for r in rings:
        if fill:
            a.add_patch(Polygon(r, closed=True, facecolor=ZONE_FILL, alpha=0.10,
                                edgecolor="none", zorder=1.5))
        a.add_patch(Polygon(r, closed=True, facecolor="none", edgecolor=ZONE_EDGE,
                            linewidth=1.3, linestyle=(0, (5, 3)), zorder=1.6))


def zone_label_point(rings, extent, target):
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


def bubble(a, d, n_max):
    a.scatter(d["lon"], d["lat"], s=area(d["n"], n_max), color=PARK_COLOR[d["park"]],
              alpha=0.85, edgecolor=SURFACE, linewidth=2, zorder=3)
    if d["name"] in APPROX:
        a.scatter(d["lon"], d["lat"], s=area(d["n"], n_max), facecolor="none",
                  edgecolor=TEXT_2, linewidth=1, linestyle=(0, (2, 2)), zorder=4)


def label(a, d, dx, dy, fontsize=10):
    tag = "\n(location estimated)" if d["name"] in APPROX else ""
    a.annotate(f"{d['name']}{tag}\n{d['n']:,} workers", (d["lon"], d["lat"]),
               xytext=(dx, dy), textcoords="offset points", fontsize=fontsize, color=TEXT_1,
               path_effects=HALO, ha="left" if dx > 0 else "right", va="center",
               arrowprops=dict(arrowstyle="-", color=TEXT_3, lw=0.8, shrinkA=2, shrinkB=0),
               zorder=6)


# ---------------------------------------------------------------- plot ----
n_max = max(d["n"] for d in DATA)

Z = (113.831, 113.869, 34.532, 34.566)   # zoom window around the Foxconn campus (unchanged)
# Widened MAIN extent: same left edge/content as the original, but extended
# to the right (mostly land/water, no data there) so the map's own locked
# aspect ratio (lon range x cos(lat) / lat range) matches a landscape frame
# instead of a portrait one - one single map, just proportioned differently.
MAIN = (113.70, 114.35, 34.49, 34.78)

fig, ax = plt.subplots(figsize=(15.12, 9.82), dpi=100)
fig.patch.set_facecolor(SURFACE)
fig.subplots_adjust(left=0.032, right=0.995, top=0.865, bottom=0.115)

zone = load_zone() if HIGHLIGHT_ZONE else None

style_map(ax)
set_extent(ax, *MAIN)
if add_tiles(ax):
    ax.grid(False)
else:
    ax.set_facecolor(LAND)
    ax.grid(color="#ffffff", linewidth=0.8)
if zone:
    draw_zone(ax, zone)
    set_extent(ax, *MAIN)
    pt = zone_label_point(zone, MAIN, target=(113.915, 34.505))
    if pt:
        ax.text(*pt, "Zhengzhou Airport\nEconomy Zone", fontsize=9.5, color=ZONE_EDGE,
                ha="center", va="center", fontweight="bold", path_effects=HALO, zorder=5)

for d in DATA:
    if d["park"] == "经开区":
        bubble(ax, d, n_max)
        label(ax, d, 34, 18)
    else:
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

# ---- inset: Airport Zone zoom - enlarged, moved into the newly available
# right-hand space (this is the same inset as the original, just bigger and
# repositioned; still one map, one inset, same as before) ----
ins = ax.inset_axes([0.615, 0.155, 0.365, 0.60])
style_map(ins, "{:.3f}")
set_extent(ins, *Z)
if add_tiles(ins, zoom=15):
    ins.grid(False)
else:
    ins.set_facecolor(LAND)
    ins.grid(color="#ffffff", linewidth=0.8)
if zone:
    draw_zone(ins, zone, fill=False)
    set_extent(ins, *Z)
ins.set_xticks([]); ins.set_yticks([])
for s in ins.spines.values():
    s.set_visible(True)
    s.set_color(TEXT_3)
    s.set_linewidth(0.8)
ax.indicate_inset_zoom(ins, edgecolor=TEXT_3, linewidth=0.8, alpha=1)
ax.text(Z[0] - 0.002, (Z[2] + Z[3]) / 2, "Zoomed area\n(see inset)", ha="right",
        va="center", fontsize=8.5, color=TEXT_2, path_effects=HALO)

INSET_OFFSET = {"Hongfujin": (44, -58), "FII Yuzhan": (-20, -52), "Henan Fuchi": (18, -32)}
airport_rows = [d for d in DATA if d["park"] == "航空港"]
for d in sorted(airport_rows, key=lambda d: -d["n"]):
    bubble(ins, d, n_max)
for d in airport_rows:
    label(ins, d, *INSET_OFFSET.get(d["name"], (30, -30)), fontsize=10.5)
total_airport = sum(d["n"] for d in airport_rows)
ins.text(0.03, 0.965, f"Airport Zone (Comprehensive Bonded Zone), zoomed\n"
                      f"Three entities combined: {total_airport:,} workers",
         transform=ins.transAxes, fontsize=9.3, color=TEXT_2, va="top", path_effects=HALO)
x1, y1 = 113.834, 34.5345
ins.plot([x1, x1 + 1 / km_per_deg_lon], [y1, y1], color=TEXT_2, lw=2, solid_capstyle="butt")
ins.text(x1 + 0.5 / km_per_deg_lon, y1 + 0.0008, "1 km", ha="center", fontsize=8, color=TEXT_2)

# ---- legends (in the newly-widened right-hand strip, above the inset) ----
handles = [Line2D([], [], marker="o", linestyle="", markersize=9, markerfacecolor=c,
                  markeredgecolor=SURFACE, label=PARK_NAME[p]) for p, c in PARK_COLOR.items()]
if zone:
    handles.append(Patch(facecolor=(0.165, 0.471, 0.839, 0.10), edgecolor=ZONE_EDGE,
                         linestyle="--", label="Airport Economy Zone boundary (OSM)"))
ax.legend(handles=handles, title="Zone", loc="upper left", frameon=True, framealpha=0.85,
          edgecolor="none", facecolor=SURFACE, fontsize=8.8, title_fontsize=9.4,
          labelcolor=TEXT_1, bbox_to_anchor=(0.615, 0.985), bbox_transform=ax.transAxes)

leg = ax.inset_axes([0.86, 0.80, 0.13, 0.155])
leg.set_xlim(0, 1); leg.set_ylim(0, 1); leg.axis("off")
cx0, base = 0.32, 0.05
fig.canvas.draw()
h_pt = leg.get_window_extent().height * 72 / fig.dpi
for v in (30000, 15000, 5000):
    r_ax = MAX_RADIUS_PT * math.sqrt(v / n_max) / h_pt
    leg.scatter(cx0, base + r_ax, s=area(v, n_max), facecolor="none",
                edgecolor=TEXT_2, linewidth=1, clip_on=False)
    top = base + 2 * r_ax
    leg.plot([cx0, 0.60], [top, top], color=TEXT_3, lw=0.6, ls=":")
    leg.text(0.64, top, f"{v:,}", fontsize=8.3, color=TEXT_1, va="center", path_effects=HALO)
leg.text(0.0, 1.16, "Insured workers\n(circle area)", fontsize=8.6, color=TEXT_1,
         transform=leg.transAxes, path_effects=HALO)

# ---- title + source ----
fig.text(0.032, 0.965, "Foxconn Zhengzhou: insured workers by legal entity, 2025",
          fontsize=18, color=TEXT_1, weight="bold")
fig.text(0.032, 0.932, "Circle area is proportional to insured workers; color = zone. "
                       "Counts cover direct employees only, not dispatch or student workers.",
          fontsize=10.5, color=TEXT_2, va="top")
fig.text(0.032, 0.006,
          "Sources: 2025 enterprise annual reports (social insurance section); coordinates from each entity's EIA report. Henan Fuchi has no EIA\n"
          "coordinate, so its location is estimated. Zone boundary: OpenStreetMap. China Labor Watch (2025) estimates 150-200k peak-season\n"
          "workers in the Airport Zone, 3-4x the insured count.",
          fontsize=8, color=TEXT_3, va="bottom")

out = HERE / "map_insured_2025_landscape.png"
fig.savefig(out, dpi=100, facecolor=SURFACE)
from PIL import Image
print(f"saved {out}, actual size:", Image.open(out).size)
