"""يجمع الصور المختارة لأصناف عصفورة بحزمة بنفس شكل data/catalog-images (manifest.json + images/)
لحتى scripts/link-catalog-images.js يربطها بالكتالوج.

picks.csv: id,image (مسار محلي أو رابط),source,confidence
  python pack.py --picks picks.csv --items items-all.csv --out ../../data/asfoura-images
items-all.csv: id,name_ar,group,ministry  (كل الأصناف، مع اللي إلها صورة من البروشور)
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
from pathlib import Path

import requests
from PIL import Image, ImageOps

HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36"}


def load(src: str) -> Image.Image:
    if src.startswith("http"):
        data = requests.get(src, headers=HEADERS, timeout=30).content
    else:
        data = Path(src).read_bytes()
    img = ImageOps.exif_transpose(Image.open(io.BytesIO(data)))
    if img.mode in ("RGBA", "LA", "P"):
        rgba = img.convert("RGBA"); bg = Image.new("RGB", rgba.size, "white"); bg.paste(rgba, mask=rgba.split()[-1])
        img = bg
    return img.convert("RGB")


def square(img: Image.Image, side: int = 800) -> Image.Image:
    """صورة مربعة بخلفية بيضا (متل باقي صور الكتالوج)."""
    img.thumbnail((side - 40, side - 40))
    canvas = Image.new("RGB", (side, side), "white")
    canvas.paste(img, ((side - img.width) // 2, (side - img.height) // 2))
    return canvas


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--picks", required=True); p.add_argument("--items", required=True); p.add_argument("--out", required=True)
    a = p.parse_args()
    items = {r["id"]: r for r in csv.DictReader(open(a.items, encoding="utf-8"))}
    out = Path(a.out); (out / "images").mkdir(parents=True, exist_ok=True)
    manifest, failed = [], []
    for row in csv.DictReader(open(a.picks, encoding="utf-8")):
        it = items.get(row["id"])
        if not it:
            continue
        try:
            img = square(load(row["image"]))
        except Exception as exc:
            failed.append((row["id"], str(exc)[:80])); continue
        buf = io.BytesIO(); img.save(buf, "WEBP", quality=86)
        name = hashlib.sha1(buf.getvalue()).hexdigest()[:16] + ".webp"
        (out / "images" / name).write_bytes(buf.getvalue())
        manifest.append({"nameAr": it.get("ministry") or it["name_ar"], "manufacturerAr": it["group"], "file": name,
                         "confidence": row.get("confidence") or "exact", "sourcePage": row.get("source", ""),
                         "asfouraId": int(row["id"])})
    (out / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
    print("packed", len(manifest), "failed", len(failed), failed[:5])


if __name__ == "__main__":
    main()
