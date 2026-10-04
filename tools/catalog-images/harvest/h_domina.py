from fetch import *
import html as H, concurrent.futures as cf
B='http://dominapharm.com'
def txt(d):
    t=re.sub(r'<script.*?</script>|<style.*?</style>','',d,flags=re.S)
    return H.unescape(re.sub(r'\s+',' ',re.sub(r'<[^>]+>',' ',t))).strip()
def one(i):
    u=f'{B}/product_data.php?id={i}'
    try: d=get(u,20)
    except Exception: return None
    b=txt(d); k=b.find('Active Ingredient Contact us')
    body=b[k+len('Active Ingredient Contact us'):].strip() if k>=0 else b
    if len(body)<40: return None
    imgs=[x for x in re.findall(r'<img[^>]+src="([^"]+)"',d) if 'product' in x]
    name=body.split(' Composition')[0].strip()
    time.sleep(0.1)
    return dict(company='دومنا',site=B,id=i,name=name,page=u,image=urllib.parse.urljoin(B+'/',imgs[0]) if imgs else None,detail=body[:400])
with cf.ThreadPoolExecutor(4) as ex: out=[r for r in ex.map(one,range(1,400)) if r]
json.dump(out,open('domina.json','w'),ensure_ascii=False,indent=0)
print('domina',len(out),'with image',sum(1 for r in out if r['image']),'max id',max(r['id'] for r in out) if out else None)
for r in out[:5]: print(r['name'],'|',r['image'])
