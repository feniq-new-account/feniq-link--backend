"""حصاد كتالوجات المواقع (الجيل 3): بيسحب كل منتجات مواقع موثوقة (صيدليات سورية أونلاين ومواقع
الشركات الرسمية) مع صورها، وبيطابقها مع أصناف عصفورة بالاسم. أدق من البحث لأن الاسم من نفس السوق.

المصادر:
- wcstore: متاجر WooCommerce بواجهتها العامة /wp-json/wc/store/v1/products (اسم + صور).
- sitemap: خريطة الموقع ← صفحات المنتجات ← og:image + العنوان.

  python harvest.py collect --out catalog.jsonl
  python harvest.py match --catalog catalog.jsonl --items items.csv --out matches.csv
"""
from __future__ import annotations

import argparse
import csv
import html
import json
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from difflib import SequenceMatcher
from pathlib import Path
from urllib.parse import unquote, urljoin

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))
from sweep import HEADERS, _get, norm, numbers, page_images  # noqa: E402

SOURCES = [
    {"name": "medgo", "type": "wcstore", "base": "https://www.medgo.pro"},
    {"name": "pharmsyria", "type": "wcstore", "base": "https://pharmsyria.com"},
    {"name": "zeera", "type": "sitemap", "url": "https://www.zeera-cosmetics.com/sitemap.xml", "brand": "زيرا",
     "keep": r"/(ar/)?products?/"},
    {"name": "stopever", "type": "sitemap", "url": "https://stopever.com/sitemap.xml", "brand": "StopEver",
     "keep": r"/urunler/"},
    {"name": "jollydent", "type": "sitemap", "url": "https://jollydent.co/sitemap.xml", "brand": "جولي دانت",
     "keep": r"jollydent_products/"},
    # موقع فارماسير الرسمي: صفحة لكل دوا (product-details) مع صورة العلبة
    {"name": "pharmasyr", "type": "sitemap", "url": "https://www.pharmasyr.com/sitemap.xml", "brand": "فارماسير",
     "keep": r"product-details/", "on_demand": True},
    # موقع مجموعة العاصي الرسمي: صفحة لكل منتج برقم (ProdView.aspx?ItemId=N)، الصور بـ Userfiles/Images
    {"name": "alasi", "type": "idrange", "url": "http://www.alasi.net/ProdView.aspx?ItemId={}", "range": [1, 400],
     "brand": "العاصي", "img": r"(?:src|href)=[\"']([^\"']*Userfiles/Images/[^\"']+\.(?:jpe?g|png))", "on_demand": True},
]


def wcstore(src):
    out, page = [], 1
    while True:
        try:
            r = requests.get(f'{src["base"]}/wp-json/wc/store/v1/products', params={"per_page": 100, "page": page},
                             headers=HEADERS, timeout=40)
        except requests.RequestException:
            time.sleep(5); continue
        if r.status_code != 200:
            break
        data = r.json()
        if not data:
            break
        for p in data:
            imgs = [i.get("src") for i in p.get("images") or [] if i.get("src")]
            if imgs:
                cats = " ".join(c.get("name", "") for c in p.get("categories") or [])
                out.append({"source": src["name"], "name": html.unescape(p.get("name", "")), "image": imgs[0],
                            "page": p.get("permalink", ""), "extra": cats})
        print(src["name"], "page", page, len(out), flush=True)
        page += 1
        time.sleep(0.5)
    return out


def sitemap_urls(url, keep, depth=0):
    r = _get(url, "page", timeout=30)
    if r is None:
        return []
    t = r.text
    locs = [html.unescape(x) for x in re.findall(r"<loc>\s*([^<\s]+)\s*</loc>", t)]
    urls = []
    for loc in locs:
        if loc.endswith(".xml") and depth < 2:
            urls += sitemap_urls(loc, keep, depth + 1)
        elif re.search(keep, unquote(loc)):
            urls.append(loc)
    return list(dict.fromkeys(urls))


def sitemap(src):
    urls = sitemap_urls(src["url"], src["keep"])
    print(src["name"], "pages", len(urls), flush=True)

    def one(u):
        imgs, title = page_images(u)
        if not imgs:
            return None
        title = title or unquote(u.rstrip("/").rsplit("/", 1)[-1]).replace("-", " ")
        return {"source": src["name"], "name": html.unescape(title), "image": imgs[0], "page": u,
                "extra": src.get("brand", "")}

    with ThreadPoolExecutor(6) as ex:
        return [x for x in ex.map(one, urls) if x]


def idrange(src):
    def one(n):
        url = src["url"].format(n)
        try:
            r = requests.get(url, headers=HEADERS, timeout=25)
        except requests.RequestException:
            return None
        if r.status_code != 200:
            return None
        t = r.text
        imgs = [urljoin(url, html.unescape(u)) for u in re.findall(src["img"], t, re.I)]
        imgs = [u for u in imgs if "pvthumb" not in u.lower() and "logo" not in u.lower()] or imgs
        title = re.search(r"<title[^>]*>(.*?)</title>", t, re.I | re.S)
        heads = re.findall(r"<h[1-3][^>]*>(.*?)</h[1-3]>", t, re.I | re.S)
        name = " ".join(re.sub(r"<[^>]+>", " ", h) for h in heads[:2]).strip() or (title.group(1) if title else "")
        if not imgs or not name.strip():
            return None
        return {"source": src["name"], "name": html.unescape(" ".join(name.split()))[:200], "image": imgs[0], "page": url,
                "extra": src.get("brand", "")}

    lo, hi = src["range"]
    with ThreadPoolExecutor(6) as ex:
        return [x for x in ex.map(one, range(lo, hi + 1)) if x]


def cmd_collect(a):
    rows = []
    for src in SOURCES:
        if a.only and src["name"] not in a.only.split(","):
            continue
        if src.get("on_demand") and not a.only:
            continue
        got = {"wcstore": wcstore, "sitemap": sitemap, "idrange": idrange}[src["type"]](src)
        print(src["name"], "→", len(got), flush=True)
        rows += got
    with open(a.out, "w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    print("total", len(rows))


STOP = set(norm("مل ملغ غ حبة حب قرص كبسول شراب علبة كيس قطعة قطع من مع لل ال و / عادي جديد").split())
TRANSLIT = {"azithromycin": "ازيترومايسين"}


def key_words(text):
    return [w for w in norm(text).split() if w not in STOP and len(w) > 1]


def similarity(a_name, b_name):
    a, b = key_words(a_name), key_words(b_name)
    if not a or not b:
        return 0.0
    sa, sb = set(a), set(b)
    jac = len(sa & sb) / len(sa | sb)
    # تطابق جزئي للكلمات (بانتي/بانتيفيت)
    soft = sum(max((SequenceMatcher(None, x, y).ratio() for y in sb), default=0) for x in sa) / len(sa)
    seq = SequenceMatcher(None, " ".join(a), " ".join(b)).ratio()
    s = 0.45 * jac + 0.35 * soft + 0.2 * seq
    na, nb = numbers(a_name), numbers(b_name)
    if na and nb:
        s += 0.12 if na <= nb or nb <= na else -0.15
    return round(s, 3)


def cmd_match(a):
    cat = [json.loads(l) for l in open(a.catalog, encoding="utf-8")]
    items = list(csv.DictReader(open(a.items, encoding="utf-8")))
    index = {}
    for i, c in enumerate(cat):
        for w in set(key_words(c["name"])):
            index.setdefault(w, []).append(i)
    out = []
    for it in items:
        name = it["name_ar"]
        brand_ar = [k for k in it["keys"].split("|") if re.search(r"[؀-ۿ]", k)]
        q = f'{name}'
        cand_ids = set()
        for w in key_words(q):
            cand_ids.update(index.get(w, [])[:4000])
        best = []
        for ci in cand_ids:
            c = cat[ci]
            s = similarity(q, c["name"])
            hay = norm(c["name"] + " " + c.get("extra", "") + " " + unquote(c.get("page", "")))
            if it["brand"] and (norm(it["brand"]) in hay or any(norm(b) in hay for b in brand_ar)):
                s += 0.15
            best.append((s, c))
        best.sort(key=lambda x: -x[0])
        for rank, (s, c) in enumerate(best[:3], 1):
            out.append({"id": it["id"], "name_ar": name, "group": it["group"], "rank": rank, "sim": s,
                        "match_name": c["name"], "source": c["source"], "image_url": c["image"], "page": c["page"]})
        if not best:
            out.append({"id": it["id"], "name_ar": name, "group": it["group"], "rank": 0, "sim": 0})
    with open(a.out, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["id", "name_ar", "group", "rank", "sim", "match_name", "source", "image_url",
                                          "page"])
        w.writeheader(); w.writerows(out)
    good = {r["id"] for r in out if r["rank"] == 1 and r["sim"] >= a.threshold}
    print("items", len(items), "matched >=", a.threshold, ":", len(good))


def main():
    p = argparse.ArgumentParser(); sub = p.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("collect"); c.add_argument("--out", default="catalog.jsonl"); c.add_argument("--only", default="")
    m = sub.add_parser("match"); m.add_argument("--catalog", default="catalog.jsonl")
    m.add_argument("--items", default="items.csv"); m.add_argument("--out", default="matches.csv")
    m.add_argument("--threshold", type=float, default=0.6)
    a = p.parse_args()
    {"collect": cmd_collect, "match": cmd_match}[a.cmd](a)


if __name__ == "__main__":
    main()
