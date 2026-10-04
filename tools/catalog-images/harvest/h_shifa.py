from fetch import *
import html as H, urllib.parse as up
B='https://shifapharma.com'
cards=[]; seen=set()
for p in range(1,80):
    try:
        r=urllib.request.Request(f'{B}/get-products?page={p}&search=',headers={'User-Agent':UA,'Accept':'application/json','X-Requested-With':'XMLHttpRequest'})
        with urllib.request.urlopen(r,timeout=30) as f: d=json.loads(f.read().decode())
    except Exception as e: print('page',p,str(e)[:50]); break
    h=d.get('productsHtml','')
    got=re.findall(r'<img[^>]+src="(https://shifapharma\.com/storage/products/[^"]+)"[^>]*>.*?<h5 class="card-title">(.*?)</h5>.*?composition-item"[^>]*>\s*(.*?)\s*</span>',h,re.S)
    new=[c for c in got if c[0] not in seen]
    if not new: break
    for c in new: seen.add(c[0])
    cards+=new; time.sleep(0.4)
print('cards',len(cards),'pages',p)
out=[]
def fname_name(u):
    n=up.unquote(u.rsplit('/',1)[-1]); n=re.sub(r'\.[A-Za-z]+$','',n); n=re.sub(r'^\d+_','',n); n=re.sub(r'^\d+\s*-\s*_?','',n)
    n=re.sub(r'[_\-]+',' ',n); n=re.sub(r'\bcopy\b|امبول|أمبول','',n,flags=re.I)
    n=re.sub(r'\s+',' ',n).strip()
    return re.sub(r'^\d+\s+(?=[A-Za-z])','',n)
for img,name,pack in cards:
    name=H.unescape(re.sub(r'<[^>]+>','',name)).strip(); pack=H.unescape(re.sub(r'<[^>]+>','',pack)).strip()
    base=dict(company='شفا',site=B,page=B+'/all-products',image=img,detail=pack)
    out.append(dict(base,id=img.rsplit('/',1)[-1],name=name))
    fn=fname_name(img)
    if fn and fn.lower()!=name.lower(): out.append(dict(base,id=img.rsplit('/',1)[-1]+'#f',name=fn))
json.dump(out,open('shifa.json','w'),ensure_ascii=False,indent=0)
print('shifa records',len(out)); print([r['name'] for r in out[40:60]])
