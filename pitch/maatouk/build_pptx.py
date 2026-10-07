"""يبني out/deck.pptx من صور الشرائح (out/slides/NN.png) وملاحظات المقدّم في deck.html.

كل شريحة صورة كاملة (تبقى الخطوط والاتجاه العربي كما هي على أي جهاز)،
وتحتها ملاحظات المقدّم نصاً قابلاً للتعديل.
    python3 build_pptx.py
"""
import glob
import html
import io
import os
import re

from PIL import Image
from pptx import Presentation
from pptx.util import Emu

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'out')

src = open(os.path.join(HERE, 'deck.html'), encoding='utf-8').read()
notes = [html.unescape(re.sub(r'\s+', ' ', n).strip())
         for n in re.findall(r'<aside class="notes">(.*?)</aside>', src, re.S)]
titles = [html.unescape(re.sub(r'<[^>]+>', ' ', t)).strip()
          for t in re.findall(r'<h[12][^>]*>(.*?)</h[12]>', src, re.S)]
slides = sorted(glob.glob(os.path.join(OUT, 'slides', '*.png')))
assert len(slides) == len(notes), (len(slides), len(notes))

prs = Presentation()
prs.slide_width = Emu(12192000)   # 16:9
prs.slide_height = Emu(6858000)
blank = prs.slide_layouts[6]
for i, (png, note) in enumerate(zip(slides, notes)):
    slide = prs.slides.add_slide(blank)
    buf = io.BytesIO()
    Image.open(png).convert('RGB').save(buf, 'JPEG', quality=90, optimize=True)
    buf.seek(0)
    pic = slide.shapes.add_picture(buf, 0, 0, width=prs.slide_width, height=prs.slide_height)
    pic.name = f'شريحة {i + 1}'
    slide.notes_slide.notes_text_frame.text = note

prs.core_properties.title = 'فينيق — عرض لمجلس إدارة مستودع معتوق'
prs.core_properties.author = 'فينيق'
prs.save(os.path.join(OUT, 'deck.pptx'))
print('slides', len(slides), 'size', os.path.getsize(os.path.join(OUT, 'deck.pptx')))
