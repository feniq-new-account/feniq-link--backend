"""Give the public site's demo drawers real medicine pictures.

Reads the picture pack (data/catalog-images: manifest.json + REPORT.xlsx) and
site/demo-catalog.json, then:
  1. attaches a picture to every demo item whose name matches a pack item
     (same name and strength, or the brand's own picture);
  2. adds the pack's other exact-match medicines (one row per trade name), so
     every drawer opens on boxes rather than text;
  3. orders each drawer pictured-first, and writes small WebP copies (240px
     wide, enough for the 80px thumbnail at 3x) into site/img/medicines/.

Run from the repo root:  python3 tools/catalog-images/site_demo.py
"""
import json
import re
from pathlib import Path

import openpyxl
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
PACK = ROOT / "data" / "catalog-images"
SITE = ROOT / "site"
OUT_DIR = SITE / "img" / "medicines"
EXACT = "نفس الاسم والعيار"
BRAND = "صورة العلامة (تقريبية)"
MAX_ADDED = 450


def base_name(name):
    """Trade name without the pack size: 'ALLURIC-300 TAB. (20 TAB)' -> 'ALLURIC-300 TAB.'."""
    return re.sub(r"\s*\([^)]*\)\s*$", "", name).strip()


def key(name):
    return re.sub(r"[^A-Z0-9]+", " ", base_name(name).upper()).strip()


def small_copy(file_name):
    """A 240px-wide WebP of a pack picture in the site folder; returns its URL path."""
    target = OUT_DIR / file_name
    if not target.exists():
        with Image.open(PACK / "images" / file_name) as im:
            im = im.convert("RGBA") if im.mode in ("P", "LA") else im
            if im.width > 240:
                im = im.resize((240, round(im.height * 240 / im.width)), Image.LANCZOS)
            im.save(target, "WEBP", quality=78, method=6)
    return f"img/medicines/{file_name}"


def main():
    manifest = json.loads((PACK / "manifest.json").read_text(encoding="utf-8"))
    file_of = {m["nameAr"]: m["file"] for m in manifest}
    rows = list(openpyxl.load_workbook(PACK / "REPORT.xlsx", read_only=True)["بصورة (المطابَق)"].iter_rows(values_only=True))[1:]

    by_key = {}
    for name, company, ingredient, strength, form, confidence, *_ in rows:
        if confidence in (EXACT, BRAND) and name in file_of:
            # Prefer an exact match over the brand's generic picture.
            current = by_key.get(key(name))
            if current is None or (current[5] != EXACT and confidence == EXACT):
                by_key[key(name)] = (name, company, ingredient, strength, form, confidence)

    demo_path = SITE / "demo-catalog.json"
    demo = json.loads(demo_path.read_text(encoding="utf-8"))
    taken = set()
    for item in demo:
        k = key(item["n"])
        taken.add(k)
        hit = by_key.get(k)
        if hit and not item.get("image"):
            item["image"] = small_copy(file_of[hit[0]])

    # Round-robin over first letters, so the cap does not fill A-L and leave
    # the later drawers bare.
    queues = {}
    for k, row in sorted(by_key.items()):
        if k not in taken and row[5] == EXACT:
            queues.setdefault(k[:1], []).append((k, row))
    picks = []
    while len(picks) < MAX_ADDED and any(queues.values()):
        for letter in sorted(queues):
            if queues[letter] and len(picks) < MAX_ADDED:
                picks.append(queues[letter].pop(0))

    added = 0
    for k, (name, company, ingredient, strength, form, confidence) in picks:
        # "(30 TAB)" -> 30, the same unit count the original demo rows carry.
        pack = re.search(r"\((\d+)[^)]*\)\s*$", name)
        demo.append({
            "n": base_name(name),
            "m": company,
            "c": (ingredient or "").title(),
            "s": strength or "",
            "f": form or "",
            **({"p": int(pack.group(1))} if pack else {}),
            "image": small_copy(file_of[name]),
        })
        taken.add(k)
        added += 1

    # Pictured first within the alphabetical order, so a drawer opens on boxes.
    demo.sort(key=lambda it: (it["n"][:1].upper(), not it.get("image"), it["n"].upper()))
    demo_path.write_text(json.dumps(demo, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    pictured = sum(1 for it in demo if it.get("image"))
    print(f"{len(demo)} demo items, {pictured} with a picture ({added} added)")


if __name__ == "__main__":
    main()
