"""Generated logos for the pharmaceutical companies that have no real one.

A coloured badge (circle / hexagon / rounded square / diamond / shield, picked
from the company's name so it never changes) with the company's first letter,
and its name underneath, on the same white 512x512 tile as the real logos.

Reads the companies from prepare/build2.py (the ministry list's short names),
skips every company that already has a real (non-generated) row in
data/manufacturer-logos/manifest.json, and (re)writes the generated rows and
their images there. Real rows are never touched, so a real logo that replaces a
generated one only needs its row and file added by hand (and `generated` left
off).

  pip install pillow            # with raqm for Arabic shaping (libraqm)
  python3 tools/catalog-images/gen_manufacturer_logos.py
"""
import hashlib
import io
import json
import math
import re
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
PACK = ROOT / 'data' / 'manufacturer-logos'
FONT_LETTER = ROOT / 'phoenix' / 'assets' / 'fonts' / 'ReadexPro-700.ttf'
FONT_NAME = ROOT / 'phoenix' / 'assets' / 'fonts' / 'IBMPlexSansArabic-700.ttf'
S = 512
NAVY = (22, 40, 63)  # the Feniq brand navy
PALETTE = [(46, 125, 107), (59, 111, 182), (181, 84, 58), (122, 79, 163), (192, 138, 30),
           (58, 143, 62), (184, 59, 107), (74, 124, 140), (242, 118, 10), (30, 90, 140)]
ARABIC = re.compile('[؀-ۿ]')


def company_names():
    source = (ROOT / 'tools' / 'catalog-images' / 'prepare' / 'build2.py').read_text(encoding='utf8')
    start = source.index('MFR={')
    end = source.index('\n}\n', start)
    return list(eval(source[start + 4:end + 2]).values())


def lighten(color, f):
    return tuple(int(v + (255 - v) * f) for v in color)


def monogram(name):
    words = [w for w in re.split(r'\s+', name) if w not in ('شركة', 'معمل', 'ابن', 'أبو')]
    if words and words[0] == 'عبد':
        words = words[-1:]
    first = words[0] if words else name
    if first.startswith('ال') and len(first) > 2:
        first = first[2:]
    if re.match(r'^[A-Za-z]', first):
        return first[:2].upper()
    return first[0]


def polygon(cx, cy, r, n, rot):
    return [(cx + r * math.cos(rot + 2 * math.pi * i / n), cy + r * math.sin(rot + 2 * math.pi * i / n)) for i in range(n)]


def badge(d, kind, cx, cy, r, color):
    if kind == 0:
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=color)
    elif kind == 1:
        d.polygon(polygon(cx, cy, r * 1.08, 6, math.pi / 6), fill=color)
    elif kind == 2:
        d.rounded_rectangle([cx - r * .92, cy - r * .92, cx + r * .92, cy + r * .92], radius=r * .38, fill=color)
    elif kind == 3:
        d.polygon(polygon(cx, cy, r * 1.15, 4, math.pi / 2), fill=color)
    else:
        d.polygon([(cx - r, cy - r * .9), (cx + r, cy - r * .9), (cx + r, cy + r * .1), (cx, cy + r * 1.1), (cx - r, cy + r * .1)], fill=color)


def text_kwargs(text):
    return dict(direction='rtl', language='ar') if ARABIC.search(text) else {}


def text_width(d, text, font):
    box = d.textbbox((0, 0), text, font=font, **text_kwargs(text))
    return box[2] - box[0]


def draw_centered(d, text, font, cx, cy, fill):
    kw = text_kwargs(text)
    box = d.textbbox((0, 0), text, font=font, **kw)
    d.text((cx - (box[0] + box[2]) / 2, cy - (box[1] + box[3]) / 2), text, font=font, fill=fill, **kw)


def make_logo(name):
    h = int(hashlib.sha256(name.encode()).hexdigest(), 16)
    color, kind = PALETTE[h % len(PALETTE)], (h // 11) % 5
    im = Image.new('RGB', (S, S), (255, 255, 255))
    d = ImageDraw.Draw(im)
    cx, cy, r = S / 2, 196, 128
    d.ellipse([cx - r - 22, cy - r - 22, cx + r + 22, cy + r + 22], fill=lighten(color, 0.88))
    badge(d, kind, cx, cy, r, color)
    letter = monogram(name)
    font = ImageFont.truetype(str(FONT_LETTER), 150 if len(letter) == 1 else 110, layout_engine=ImageFont.Layout.RAQM)
    draw_centered(d, letter, font, cx, cy + (10 if len(letter) == 1 else 4) - (14 if kind == 4 else 0), (255, 255, 255))

    size = 54
    while True:
        font = ImageFont.truetype(str(FONT_NAME), size, layout_engine=ImageFont.Layout.RAQM)
        words = name.split(' ')
        lines = [name]
        if text_width(d, name, font) > S - 70 and len(words) > 1:
            lines = min(([' '.join(words[:k]), ' '.join(words[k:])] for k in range(1, len(words))),
                        key=lambda pair: max(text_width(d, line, font) for line in pair))
        if max(text_width(d, line, font) for line in lines) <= S - 70 or size <= 26:
            break
        size -= 2
    y0 = 396 if len(lines) == 1 else 378
    for i, line in enumerate(lines):
        draw_centered(d, line, font, cx, y0 + i * size * 1.25, NAVY)
    d.rounded_rectangle([cx - 26, 466, cx + 26, 472], radius=3, fill=color)
    return im


def main():
    manifest_path = PACK / 'manifest.json'
    rows = json.loads(manifest_path.read_text(encoding='utf8'))
    real = [row for row in rows if not row.get('generated')]
    have = {row['manufacturerAr'] for row in real}
    generated = []
    for name in company_names():
        if name in have:
            continue
        buffer = io.BytesIO()
        make_logo(name).save(buffer, 'WEBP', quality=88, method=6)
        file = hashlib.sha256(buffer.getvalue()).hexdigest()[:16] + '.webp'
        (PACK / 'images' / file).write_bytes(buffer.getvalue())
        generated.append({'manufacturerAr': name, 'file': file, 'generated': True, 'source': None})
    keep = {row['file'] for row in real + generated}
    for old in (PACK / 'images').glob('*.webp'):
        if old.name not in keep:
            old.unlink()
    manifest_path.write_text(json.dumps(real + generated, ensure_ascii=False, indent=1), encoding='utf8')
    print(f'{len(real)} real, {len(generated)} generated')


if __name__ == '__main__':
    main()
