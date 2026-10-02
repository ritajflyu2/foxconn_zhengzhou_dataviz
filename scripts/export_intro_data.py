"""Data and assets for the site's Introduction page.

Writes:
  site/data/intro/production.json   values, sources and caveats for the
                                    "Production pace" screen
  site/assets/intro/*.webp          trimmed, resized copies of the reference
                                    images in design/reference/ (originals
                                    untouched)

Run from the project root: .venv/bin/python scripts/export_intro_data.py
The site computes everything derived (per-second rate, stack height,
crossing time) from these values; nothing is pre-computed here.
"""
import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
REF = ROOT / "design" / "reference"
DATA_OUT = ROOT / "site" / "data" / "intro"
ASSET_OUT = ROOT / "site" / "assets" / "intro"

PRODUCTION = {
    "peak_iphones_per_day": 500_000,
    "peak_sources": [
        "China Daily, 2017-09-19",
        "Silicon UK, 2023-01-04, citing Henan Daily",
    ],
    "peak_caveat": (
        "Press-reported peak, not confirmed by Foxconn or Apple, for the whole "
        "Zhengzhou site."
    ),
    "hours_per_day": 24,
    "hours_note": "The daily peak is spread evenly over 24 hours (the plants run around the clock).",
    "phone_model": "iPhone 17 Pro",
    "phone_thickness_mm": 8.75,
    "phone_thickness_source": "Apple, iPhone 17 Pro technical specifications (support.apple.com/en-us/125090)",
    "phone_caveat": (
        "Assumes every phone is an iPhone 17 Pro; the 2025 peak model was the "
        "iPhone 17 (China Labor Watch, September 2025). The phone images are "
        "an illustrative mockup."
    ),
    "mount_fuji_height_m": 3776,
}

# (source file, output name, longest side in px). Each is trimmed to its
# opaque area first, so the site can size it from its own aspect ratio.
ASSETS = [
    ("iphone 17 pro orange.png", "iphone_back.webp", 240),
    ("iphone 17 pro side view.png", "iphone_side.webp", 480),
    ("mt fuji.png", "fuji.webp", 1600),
]


def export_asset(src, out, longest):
    im = Image.open(REF / src).convert("RGBA")
    im = im.crop(im.getchannel("A").getbbox())
    scale = longest / max(im.size)
    if scale < 1:
        im = im.resize((round(im.width * scale), round(im.height * scale)), Image.LANCZOS)
    im.save(ASSET_OUT / out, "WEBP", quality=88, method=6)
    return out, im.size


def main():
    DATA_OUT.mkdir(parents=True, exist_ok=True)
    ASSET_OUT.mkdir(parents=True, exist_ok=True)
    for src, out, longest in ASSETS:
        name, size = export_asset(src, out, longest)
        print(f"{name}: {size[0]}x{size[1]}")
    path = DATA_OUT / "production.json"
    path.write_text(json.dumps(PRODUCTION, indent=2) + "\n")
    print(f"wrote {path.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
