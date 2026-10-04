from fetch import *
import html as H, concurrent.futures as cf
B='https://avenzor.net'
def txt(d): return H.unescape(re.sub(r'\s+',' ',re.sub(r'<[^>]+>',' ',re.sub(r'<script.*?</script>|<style.*?</style>','',d,flags=re.S)))).strip()
def one(i):
    u=f'{B}/index.php?ACT=3&LNG=En&Mod=2&id={i}'
    try: d=get(u,25)
    except Exception: return None
    t=txt(d); m=re.search(r'»\s*(.*?)\s+Therapeutic Category\s+(.*?)\s+Presentation\s+(.*?)\s+Pharmaceutical Form\s+(.*?)\s+Brand Name',t)
    if not m: return None
    ph=re.findall(r'href=["\']([^"\']*uploads1/photo_[^"\']*)',d); th=re.findall(r'<img[^>]+src=["\']([^"\']*uploads1/thumb_[^"\']*)',d)
    img=ph[0] if ph else (th[0] if th else None)
    c=re.search(r'Composition\s+(.*?)\s+Indications',t)
    time.sleep(0.15)
    return dict(company='ابن زهر',site=B,id=i,name=m.group(1).strip(),page=u,image=urllib.parse.urljoin(B+'/',img) if img else None,form=m.group(4).strip(),detail=f"{m.group(3)} | {c.group(1) if c else ''}"[:300])
with cf.ThreadPoolExecutor(4) as ex: out=[r for r in ex.map(one,range(1,520)) if r]
json.dump(out,open('avenzor.json','w'),ensure_ascii=False,indent=0)
print('avenzor',len(out),'with image',sum(1 for r in out if r['image']),[r['name'] for r in out[:6]])
