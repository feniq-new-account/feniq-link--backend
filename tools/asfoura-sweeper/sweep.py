"""كاسحة صور عصفورة (الجيل 2) - بتلاقي صورة علبة لكل صنف من أصناف مستودع عصفورة.

الفرق عن الكاسحة الأولى (medicine_sweeper.py):
- محركات أكتر: صور (Bing، DuckDuckGo، Yandex، Google) + بحث نصي (Google، Bing، Brave، Yandex، Yahoo،
  Startpage، Mojeek) بيفتح صفحات المنتجات وبياخد صورتها الأساسية (og:image، JSON-LD Product).
- باركود: Open Beauty Facts / Open Food Facts / Open Products Facts + بحث نصي بالباركود.
- تحقق: OCR عربي + إنكليزي، اسم الماركة بالعنوان أو على العلبة، أرقام الحجم، خلفية بيضا، دقة،
  وإزالة الصور المكررة (pHash). اختياري: CLIP بيتأكد إنو الصورة من نوع المنتج (فرشاة، ببرونة...).
- بيحفظ أحسن 3 مرشحين لكل صنف لحتى المراجعة تختار، مع معرض HTML.

الاستعمال:
  python asfoura/sweep.py sweep --shard 0 --shards 10 [--clip]
  python asfoura/sweep.py merge --results-dir all --output-dir final
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import html
import io
import json
import os
import random
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import quote_plus, urljoin, urlparse

import requests
from PIL import Image, ImageOps

HERE = Path(__file__).resolve().parent
ITEMS_CSV = HERE / "items.csv"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")
HEADERS = {"User-Agent": UA, "Accept-Language": "ar,en-US;q=0.8,en;q=0.6,tr;q=0.5"}
MAX_SIDE, MIN_SIDE, MAX_BYTES = 900, 160, 12_000_000
KEEP = 3  # مرشحين لكل صنف
STOCK = ("shutterstock", "alamy", "istockphoto", "dreamstime", "freepik", "vecteezy", "123rf", "depositphotos",
         "adobestock", "stock.adobe", "gettyimages", "pngtree", "pngwing", "clipart", "flaticon", "gstatic.com/images?",
         "fbsbx", "lookaside", "logo", "favicon", "sprite", "placeholder", "no-image", "noimage", "banner")
SHOP_HINT = ("trendyol", "hepsiburada", "n11.com", "amazon", "noon", "nahdi", "aldawaa", "boots", "pharm", "eczane",
             "shop", "store", "market", "sooq", "souq", "product", "urun", "dawaa", "sy")


class Stats:
    def __init__(self):
        self.c = Counter(); self.lock = threading.Lock()

    def add(self, k, n=1):
        with self.lock:
            self.c[k] += n


STATS = Stats()


class Limiter:
    def __init__(self, gap):
        self.gap, self.last, self.lock = gap, 0.0, threading.Lock()

    def wait(self):
        with self.lock:
            d = self.last + self.gap - time.time()
            if d > 0:
                time.sleep(d)
            self.last = time.time()


LIM = {k: Limiter(v) for k, v in {"bing": 1.0, "ddg": 2.0, "yandex": 2.5, "google": 3.0, "text": 1.5, "page": 0.2,
                                   "barcode": 0.5}.items()}

# ───────────────────────── نصوص ─────────────────────────
AR_NORM = str.maketrans({"أ": "ا", "إ": "ا", "آ": "ا", "ة": "ه", "ى": "ي", "ؤ": "و", "ئ": "ي"})


def norm(text: str) -> str:
    t = (text or "").lower().translate(AR_NORM)
    t = re.sub(r"[ً-ْـ]", "", t)
    return re.sub(r"[^0-9a-z؀-ۿ]+", " ", t).strip()


def toks(text: str) -> set[str]:
    return set(norm(text).split())


def numbers(text: str) -> set[str]:
    return {n for n in re.findall(r"\d+(?:\.\d+)?", text or "") if n not in ("0", "1")}


# ───────────────────────── محركات صور ─────────────────────────

def _get(url, lim, **kw):
    LIM[lim].wait()
    try:
        r = requests.get(url, headers=HEADERS, timeout=kw.pop("timeout", 20), **kw)
        STATS.add(f"{lim}_{r.status_code}")
        return r if r.status_code == 200 else None
    except requests.RequestException:
        STATS.add(f"{lim}_err")
        return None


def img_bing(q):
    r = _get(f"https://www.bing.com/images/search?q={quote_plus(q)}&form=HDRSC2&first=1&adlt=off", "bing")
    out = []
    if r:
        for m in re.finditer(r'class="iusc"[^>]*?\sm="([^"]+)"', r.text):
            try:
                d = json.loads(html.unescape(m.group(1)))
            except ValueError:
                continue
            if d.get("murl"):
                out.append({"image": d["murl"], "thumb": d.get("turl", ""), "page": d.get("purl", ""),
                            "title": d.get("t", ""), "engine": "bing"})
    return out[:12]


_DD = threading.local()


def _ddgs():
    from ddgs import DDGS
    if not hasattr(_DD, "c"):
        _DD.c = DDGS(timeout=20)
    return _DD.c


def img_ddg(q):
    LIM["ddg"].wait()
    try:
        res = _ddgs().images(q, region="wt-wt", safesearch="off", max_results=12) or []
    except Exception:
        STATS.add("ddg_err"); return []
    return [{"image": r.get("image"), "thumb": r.get("thumbnail", ""), "page": r.get("url", ""),
             "title": r.get("title", ""), "engine": "ddg"} for r in res if r.get("image")]


def img_yandex(q):
    r = _get(f"https://yandex.com/images/search?text={quote_plus(q)}", "yandex")
    out = []
    if not r:
        return out
    for m in re.finditer(r'"origUrl":"(https?:[^"]+)"', r.text):
        u = m.group(1).encode().decode("unicode_escape", "ignore") if "\\u" in m.group(1) else m.group(1)
        out.append({"image": u.replace("\\/", "/"), "thumb": "", "page": "", "title": "", "engine": "yandex"})
        if len(out) >= 10:
            break
    if not out:  # الشكل الجديد للصفحة
        for m in re.finditer(r'img_href=(https?%3A[^&"]+)', r.text):
            from urllib.parse import unquote
            out.append({"image": unquote(m.group(1)), "thumb": "", "page": "", "title": "", "engine": "yandex"})
            if len(out) >= 10:
                break
    return out


def img_google(q):
    r = _get(f"https://www.google.com/search?q={quote_plus(q)}&tbm=isch&hl=ar&gbv=1", "google")
    out = []
    if not r:
        return out
    # النسخة البسيطة: صور مصغّرة مع رابط الصفحة
    for m in re.finditer(r'<a href="/url\?q=([^&"]+)[^"]*"[^>]*>.*?<img[^>]+src="(https://encrypted-tbn[^"]+)"', r.text, re.S):
        from urllib.parse import unquote
        out.append({"image": html.unescape(m.group(2)), "thumb": "", "page": unquote(m.group(1)), "title": "",
                    "engine": "google"})
        if len(out) >= 10:
            break
    return out


IMAGE_ENGINES = {"bing": img_bing, "ddg": img_ddg, "yandex": img_yandex, "google": img_google}

# ───────────────────────── بحث نصي ← صفحة المنتج ─────────────────────────
TEXT_BACKENDS = "google,bing,brave,yandex,yahoo,startpage,mojeek"


def text_search(q, max_results=8):
    LIM["text"].wait()
    try:
        res = _ddgs().text(q, region="wt-wt", safesearch="off", backend=TEXT_BACKENDS, max_results=max_results) or []
        STATS.add("text_ok")
    except Exception:
        STATS.add("text_err"); return []
    return [{"page": r.get("href", ""), "title": r.get("title", ""), "body": r.get("body", "")} for r in res]


OG = re.compile(r'<meta[^>]+(?:property|name)=["\'](?:og:image(?::secure_url)?|twitter:image)["\'][^>]*content=["\']([^"\']+)', re.I)
OG2 = re.compile(r'<meta[^>]+content=["\']([^"\']+)["\'][^>]*(?:property|name)=["\'](?:og:image|twitter:image)', re.I)
LD = re.compile(r'<script[^>]+application/ld\+json[^>]*>(.*?)</script>', re.I | re.S)
TITLE = re.compile(r"<title[^>]*>(.*?)</title>", re.I | re.S)


def page_images(page_url):
    """الصورة الأساسية لصفحة منتج: JSON-LD Product.image، og:image، twitter:image."""
    r = _get(page_url, "page", timeout=15)
    if not r or "html" not in r.headers.get("content-type", ""):
        return [], ""
    t = r.text[:600_000]
    title = html.unescape((TITLE.search(t).group(1) if TITLE.search(t) else "").strip())[:200]
    imgs = []
    for block in LD.findall(t):
        try:
            data = json.loads(block.strip())
        except ValueError:
            continue
        stack = data if isinstance(data, list) else [data]
        while stack:
            d = stack.pop()
            if isinstance(d, dict):
                if "@graph" in d:
                    stack.extend(d["@graph"] if isinstance(d["@graph"], list) else [d["@graph"]])
                if str(d.get("@type", "")).lower() == "product":
                    im = d.get("image")
                    for x in (im if isinstance(im, list) else [im]):
                        if isinstance(x, dict):
                            x = x.get("url") or x.get("contentUrl")
                        if isinstance(x, str):
                            imgs.append(x)
                    title = d.get("name") or title
    imgs += OG.findall(t) + OG2.findall(t)
    return [urljoin(page_url, html.unescape(u)) for u in dict.fromkeys(imgs)][:4], title


def via_pages(q, n_pages=4):
    out = []
    for r in text_search(q):
        page = r["page"]
        if not page or any(s in page for s in ("youtube.", "facebook.", "instagram.", "wikipedia.", "tiktok.")):
            continue
        imgs, ptitle = page_images(page)
        for u in imgs[:2]:
            out.append({"image": u, "thumb": "", "page": page, "title": f'{ptitle} {r["title"]}', "engine": "page"})
        n_pages -= 1
        if n_pages <= 0:
            break
    return out


def via_barcode(code):
    out = []
    for host in ("world.openbeautyfacts.org", "world.openfoodfacts.org", "world.openproductsfacts.org"):
        r = _get(f"https://{host}/api/v2/product/{code}.json", "barcode")
        if not r:
            continue
        try:
            p = r.json().get("product") or {}
        except ValueError:
            continue
        u = p.get("image_front_url") or p.get("image_url")
        if u:
            out.append({"image": u, "thumb": "", "page": f"https://{host}/product/{code}",
                        "title": f'{p.get("product_name", "")} {p.get("brands", "")} {code}', "engine": "barcode"})
    return out + via_pages(f'"{code}"', 3)


# ───────────────────────── تنزيل وتقييم ─────────────────────────

def fetch(url):
    if not url or not url.startswith("http"):
        return None
    try:
        r = requests.get(url, headers=HEADERS, timeout=20, stream=True)
        r.raise_for_status()
        data = r.raw.read(MAX_BYTES + 1, decode_content=True)
        if len(data) > MAX_BYTES:
            return None
        img = Image.open(io.BytesIO(data)); img.load()
    except Exception:
        STATS.add("dl_fail"); return None
    img = ImageOps.exif_transpose(img)
    if img.mode in ("RGBA", "LA", "P"):
        rgba = img.convert("RGBA"); bg = Image.new("RGB", rgba.size, "white"); bg.paste(rgba, mask=rgba.split()[-1]); img = bg
    img = img.convert("RGB")
    if min(img.size) < MIN_SIDE:
        STATS.add("too_small"); return None
    return img


def phash(img):
    g = ImageOps.grayscale(img).resize((9, 8))
    px = list(g.getdata())
    return "".join("1" if px[r * 9 + c] > px[r * 9 + c + 1] else "0" for r in range(8) for c in range(8))


def white_bg(img):
    """قديش حواف الصورة بيضا (صورة علبة نظيفة = عالي)."""
    s = img.resize((64, 64)); px = s.load()
    edge = [px[x, y] for x in range(64) for y in (0, 63)] + [px[x, y] for y in range(64) for x in (0, 63)]
    return sum(1 for p in edge if min(p) > 235) / len(edge)


def ocr(img):
    if not shutil.which("tesseract"):
        return ""
    w = ImageOps.autocontrast(ImageOps.grayscale(img))
    sc = 1200 / max(w.size)
    w = w.resize((int(w.width * sc), int(w.height * sc)))
    with tempfile.TemporaryDirectory() as tmp:
        p = Path(tmp) / "x.png"; w.save(p)
        try:
            return subprocess.run(["tesseract", str(p), "stdout", "--psm", "11", "-l", "eng+ara+tur"],
                                  capture_output=True, text=True, timeout=20,
                                  env={**os.environ, "OMP_THREAD_LIMIT": "1"}).stdout
        except Exception:
            return ""


_CLIP = {}


def clip_score(img, label):
    """احتمال إنو الصورة «صورة منتج: label» مقابل صور عامة. 0 إذا CLIP مش متوفر."""
    if not label or os.environ.get("SWEEP_CLIP") != "1":
        return 0.0
    try:
        import torch, open_clip  # noqa
        if "m" not in _CLIP:
            m, _, pre = open_clip.create_model_and_transforms("ViT-B-32", pretrained="laion2b_s34b_b79k")
            _CLIP.update(m=m.eval(), pre=pre, tok=open_clip.get_tokenizer("ViT-B-32"), lock=threading.Lock())
        texts = [f"a product photo of {label}", "a photo of a person", "a logo", "a screenshot of a website",
                 "a photo of a building", "a medicine box", "a cosmetic bottle"]
        with _CLIP["lock"], torch.no_grad():
            im = _CLIP["pre"](img).unsqueeze(0)
            f_i = _CLIP["m"].encode_image(im); f_t = _CLIP["m"].encode_text(_CLIP["tok"](texts))
            f_i /= f_i.norm(dim=-1, keepdim=True); f_t /= f_t.norm(dim=-1, keepdim=True)
            pr = (100 * f_i @ f_t.T).softmax(dim=-1)[0].tolist()
        return float(pr[0])
    except Exception as exc:
        STATS.add("clip_err")
        if STATS.c["clip_err"] <= 3:
            import traceback; print("CLIP error:", repr(exc), traceback.format_exc()[-600:], flush=True)
        return 0.0


def score(item, cand, img, ocr_text):
    keys = [k for k in item["keys"].split("|") if k]
    meta = f'{cand["title"]} {cand["page"]} {cand["image"]}'
    mt, ot = toks(meta) | set(norm(meta.replace("-", " ")).split()), toks(ocr_text)
    nmeta, nocr = norm(meta), norm(ocr_text)
    s, why = 0.0, []
    for k in keys:
        nk = norm(k)
        if nk and (nk in nmeta or nk.replace(" ", "") in nmeta.replace(" ", "")):
            s += 2; why.append("brand@title")
        if nk and (nk in nocr or nk.replace(" ", "") in nocr.replace(" ", "")):
            s += 3; why.append("brand@box")
    name_t = {t for t in toks(item["name_ar"]) if len(t) > 2}
    hit = len(name_t & (mt | ot))
    if name_t:
        s += 2 * hit / len(name_t); why.append(f"name {hit}/{len(name_t)}")
    want = numbers(item["name_ar"] + " " + item.get("ministry", ""))
    if want and want <= (numbers(meta) | numbers(ocr_text)):
        s += 1; why.append("size")
    wb = white_bg(img)
    s += 1.2 * wb
    s += 0.5 if min(img.size) >= 400 else 0
    if any(h in cand["page"].lower() for h in SHOP_HINT):
        s += 0.5; why.append("shop")
    if cand["engine"] in ("page", "barcode"):
        s += 0.5
    if any(x in (cand["image"] + cand["page"]).lower() for x in STOCK):
        s -= 3; why.append("stock")
    c = clip_score(img, item.get("label", ""))
    if c:
        s += 2 * c; why.append(f"clip {c:.2f}")
    return round(s, 2), " ".join(why), round(wb, 2)


# ───────────────────────── الكسح ─────────────────────────

def load_items():
    with ITEMS_CSV.open(encoding="utf-8") as f:
        return list(csv.DictReader(f))


def sweep_item(item, engines, out_dir):
    queries = [q for q in item["queries"].split("|") if q][:4]
    cands, seen_url = [], set()
    if item.get("barcode"):
        cands += via_barcode(item["barcode"])
    for q in queries:
        for e in engines:
            for c in IMAGE_ENGINES[e](q)[:8]:
                if c["image"] not in seen_url:
                    seen_url.add(c["image"]); c["query"] = q; cands.append(c)
    for q in queries[:2]:
        for c in via_pages(q):
            if c["image"] not in seen_url:
                seen_url.add(c["image"]); c["query"] = q; cands.append(c)
    scored, hashes = [], set()
    for c in cands[:60]:
        img = fetch(c["image"]) or (fetch(c.get("thumb")) if c.get("thumb") else None)
        if img is None:
            continue
        h = phash(img)
        if h in hashes:
            continue
        hashes.add(h)
        o = ocr(img) if os.environ.get("SWEEP_OCR", "1") == "1" else ""
        s, why, wb = score(item, c, img, o)
        scored.append((s, why, wb, c, img, o))
    scored.sort(key=lambda x: -x[0])
    rows = []
    d = out_dir / "images"; d.mkdir(parents=True, exist_ok=True)
    for rank, (s, why, wb, c, img, o) in enumerate(scored[:KEEP], 1):
        im = img.copy(); im.thumbnail((MAX_SIDE, MAX_SIDE))
        name = f'{item["id"]}-{rank}-{hashlib.md5(c["image"].encode()).hexdigest()[:8]}.jpg'
        im.save(d / name, "JPEG", quality=88)
        rows.append({"id": item["id"], "name_ar": item["name_ar"], "group": item["group"], "rank": rank, "score": s,
                     "why": why, "white_bg": wb, "file": name, "engine": c["engine"], "query": c.get("query", ""),
                     "image_url": c["image"], "source_page": c["page"], "title": c["title"][:160],
                     "ocr": " ".join(o.split())[:160], "candidates": len(scored)})
    if not rows:
        rows.append({"id": item["id"], "name_ar": item["name_ar"], "group": item["group"], "rank": 0, "score": 0,
                     "why": "not_found", "candidates": len(cands)})
    STATS.add("items"); STATS.add("found" if scored else "not_found")
    return rows


FIELDS = ["id", "name_ar", "group", "rank", "score", "why", "white_bg", "file", "engine", "query", "image_url",
          "source_page", "title", "ocr", "candidates"]


def cmd_sweep(a):
    items = load_items()
    mine = [it for i, it in enumerate(items) if i % a.shards == a.shard]
    if a.limit:
        mine = mine[:a.limit]
    out = Path(a.out_dir) / f"shard-{a.shard}"; out.mkdir(parents=True, exist_ok=True)
    engines = [e for e in a.engines.split(",") if e in IMAGE_ENGINES]
    f = (out / "results.csv").open("w", encoding="utf-8", newline="")
    w = csv.DictWriter(f, fieldnames=FIELDS, extrasaction="ignore"); w.writeheader()
    lock, t0 = threading.Lock(), time.time()

    def work(it):
        if time.time() - t0 > a.budget_min * 60:
            return
        try:
            rows = sweep_item(it, engines, out)
        except Exception as exc:  # صنف واحد ما بيوقّف الشارد
            rows = [{"id": it["id"], "name_ar": it["name_ar"], "group": it["group"], "rank": 0, "why": f"error {exc}"}]
        with lock:
            w.writerows(rows); f.flush()
            print(it["id"], it["name_ar"][:40], "→", rows[0].get("score"), rows[0].get("why", "")[:60], flush=True)

    with ThreadPoolExecutor(a.threads) as ex:
        list(ex.map(work, mine))
    f.close()
    (out / "stats.json").write_text(json.dumps(STATS.c, ensure_ascii=False, indent=1))
    print(dict(STATS.c))


def cmd_merge(a):
    final = Path(a.output_dir); (final / "images").mkdir(parents=True, exist_ok=True)
    rows = []
    for csv_path in sorted(Path(a.results_dir).rglob("results.csv")):
        for r in csv.DictReader(csv_path.open(encoding="utf-8")):
            if r.get("file"):
                src = csv_path.parent / "images" / r["file"]
                if src.exists():
                    shutil.copy(src, final / "images" / r["file"])
            rows.append(r)
    rows.sort(key=lambda r: (int(r["id"]), int(r.get("rank") or 0)))
    with (final / "results.csv").open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS, extrasaction="ignore"); w.writeheader(); w.writerows(rows)
    ids = {r["id"] for r in rows}
    found = {r["id"] for r in rows if r.get("file")}
    strong = {r["id"] for r in rows if r.get("rank") == "1" and float(r.get("score") or 0) >= 5}
    cells = []
    by = {}
    for r in rows:
        by.setdefault(r["id"], []).append(r)
    for i in sorted(by, key=int):
        rs = by[i]
        imgs = "".join(f'<figure><img loading="lazy" src="images/{r["file"]}"><figcaption>{r["rank"]} · {r["score"]} · '
                       f'{html.escape(r.get("engine",""))}<br><small>{html.escape(r.get("why",""))}</small></figcaption></figure>'
                       for r in rs if r.get("file"))
        cells.append(f'<section><h3>#{i} {html.escape(rs[0]["name_ar"])} <small>{html.escape(rs[0]["group"])}</small></h3>'
                     f'<div class="row">{imgs or "<p>ما لقينا</p>"}</div></section>')
    (final / "gallery.html").write_text(
        '<!doctype html><meta charset="utf-8"><title>صور عصفورة</title><style>body{font-family:sans-serif;direction:rtl;'
        'margin:16px}section{border-bottom:1px solid #ddd;padding:6px 0}.row{display:flex;gap:8px;flex-wrap:wrap}'
        'figure{margin:0;width:180px}img{width:180px;height:180px;object-fit:contain;background:#f6f6f6}'
        'figcaption{font-size:12px}</style>' + "".join(cells), encoding="utf-8")
    summary = (f"# كاسحة عصفورة\n\n- أصناف: {len(ids)}\n- إلها مرشح صورة: {len(found)}\n"
               f"- مرشح قوي (≥5): {len(strong)}\n- ما لقينا: {len(ids - found)}\n")
    (final / "SUMMARY.md").write_text(summary, encoding="utf-8")
    print(summary)


def main():
    p = argparse.ArgumentParser(); sub = p.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("sweep")
    s.add_argument("--shard", type=int, default=0); s.add_argument("--shards", type=int, default=1)
    s.add_argument("--limit", type=int, default=0); s.add_argument("--engines", default="bing,ddg,yandex,google")
    s.add_argument("--threads", type=int, default=4); s.add_argument("--budget-min", type=float, default=150)
    s.add_argument("--out-dir", default="out")
    m = sub.add_parser("merge"); m.add_argument("--results-dir", required=True); m.add_argument("--output-dir", default="final")
    a = p.parse_args()
    {"sweep": cmd_sweep, "merge": cmd_merge}[a.cmd](a)


if __name__ == "__main__":
    main()
