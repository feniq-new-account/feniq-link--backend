from fetch import *
import html as H, concurrent.futures as cf
def txt(d): return H.unescape(re.sub(r'\s+',' ',re.sub(r'<[^>]+>',' ',re.sub(r'<script.*?</script>|<style.*?</style>','',d,flags=re.S)))).strip()
def og(d,p):
    m=re.findall(r'<meta[^>]+property="og:%s"[^>]+content="([^"]*)"'%p,d) or re.findall(r'<meta[^>]+content="([^"]*)"[^>]+property="og:%s"'%p,d)
    return H.unescape(m[0]) if m else None
# ---- Shahba (WordPress posts listed on the alphabetical page)
B='https://alshahba-pharma.com'
idx=get(B+'/en/products-alphabetically/')
posts=sorted({l for l in links(B,idx) if re.search(r'/en/\d{4}/\d\d/\d\d/',l)})
def shahba(u):
    try: d=get(u,25)
    except Exception: return None
    h1=re.findall(r'<h1[^>]*>(.*?)</h1>',d,re.S); name=txt(h1[0]) if h1 else (og(d,'title') or '').split(' - ')[0]
    imgs=re.findall(r'<img[^>]+src="(https://alshahba-pharma\.com/wp-content/uploads/[^"]+)"',d)
    imgs=[i for i in imgs if 'logo' not in i.lower() and 'enlogo' not in i.lower()]
    img=og(d,'image')
    if img and 'logo' in img.lower(): img=None
    img=img or (imgs[0] if imgs else None)
    time.sleep(0.2)
    return dict(company='الشهباء',site=B,id=u,name=name,page=u,image=img,detail=txt(d)[:200])
with cf.ThreadPoolExecutor(4) as ex: sh=[r for r in ex.map(shahba,posts) if r]
json.dump(sh,open('shahba.json','w'),ensure_ascii=False,indent=0); print('shahba',len(sh),'with image',sum(1 for r in sh if r['image']),[r['name'] for r in sh[:5]])
# ---- Zein (WordPress product type)
B='https://zein-pharma.com'; out=[]; p=1
while True:
    try: data=json.loads(get(f'{B}/wp-json/wp/v2/product?per_page=100&page={p}&_embed=wp:featuredmedia',40))
    except Exception as e: print('zein',str(e)[:50]); break
    if not data: break
    for it in data:
        media=(it.get('_embedded',{}).get('wp:featuredmedia') or [{}])[0]
        out.append(dict(company='زين فارما',site=B,id=it['id'],name=txt(it['title']['rendered']),page=it['link'],image=media.get('source_url') if isinstance(media,dict) else None,detail=txt(it.get('content',{}).get('rendered'))[:300]))
    p+=1
    if len(data)<100: break
json.dump(out,open('zein.json','w'),ensure_ascii=False,indent=0); print('zein',len(out),'with image',sum(1 for r in out if r['image']),[r['name'] for r in out[:5]])
# ---- Mercy (same CMS as BioMed)
B='https://mercypharma.com'
ids=set()
h=get(B+'/Products/En'); cats=set(re.findall(r'/Products/([ft]_\d+)/En',h))
for c in ['']+sorted(cats):
    try: hh=get(f'{B}/Products/{c}/En' if c else B+'/Products/En')
    except Exception: continue
    ids|=set(re.findall(r'/Products/(\d+)\.htm/En',hh)); time.sleep(0.3)
def mercy(i):
    try: d=get(f'{B}/Products/{i}.htm/En')
    except Exception: return None
    name=re.findall(r'<img src="/img/uploads1/small_thumbs/product_%s\.[a-z]+" alt="([^"]*)"'%i,d)
    img=re.findall(r'/img/uploads1/larg_thumbs/product_%s\.[a-z]+'%i,d) or re.findall(r'/img/uploads1/[a-z_]*/product_%s\.[a-z]+'%i,d)
    b=txt(d); k=b.find(name[0]) if name else -1
    time.sleep(0.3)
    return dict(company='ميرسي فارما',site=B,id=int(i),name=H.unescape(name[0]) if name else '',page=f'{B}/Products/{i}.htm/En',image=(B+img[0]) if img else None,detail=b[k:k+300] if k>=0 else '')
with cf.ThreadPoolExecutor(3) as ex: me=[r for r in ex.map(mercy,sorted(ids)) if r and r['name']]
json.dump(me,open('mercy.json','w'),ensure_ascii=False,indent=0); print('mercy',len(me),'with image',sum(1 for r in me if r['image']),[r['name'] for r in me[:5]])
