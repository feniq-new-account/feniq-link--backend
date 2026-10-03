from fetch import *
import html as H, concurrent.futures as cf
BASE='https://www.biomedpharma-sy.com'
ids=set()
seeds=[f'{BASE}/Products/En']
h=get(seeds[0]); cats=set(re.findall(r'/Products/([ft]_\d+)/En',h))
for c in ['']+sorted(cats):
    u=f'{BASE}/Products/{c}/En' if c else seeds[0]
    try: hh=get(u)
    except Exception as e: print(u,e); continue
    ids|=set(re.findall(r'/Products/(\d+)\.htm/En',hh)); time.sleep(0.3)
print('ids',len(ids),sorted(map(int,ids))[:10])
def detail(i):
    try: d=get(f'{BASE}/Products/{i}.htm/En')
    except Exception as e: return None
    t=re.sub(r'<script.*?</script>|<style.*?</style>','',d,flags=re.S)
    name=re.findall(r'<img src="/img/uploads1/small_thumbs/product_%s\.[a-z]+" alt="([^"]*)"'%i,d)
    img=re.findall(r'/img/uploads1/larg_thumbs/product_%s\.[a-z]+'%i,d)
    b=H.unescape(re.sub(r'\s+',' ',re.sub(r'<[^>]+>',' ',t)))
    k=b.find(name[0]) if name else -1
    time.sleep(0.3)
    return dict(company='بيوميد',site=BASE,id=int(i),name=H.unescape(name[0]) if name else '',page=f'{BASE}/Products/{i}.htm/En',image=(BASE+img[0]) if img else None,detail=b[k:k+500] if k>=0 else '')
with cf.ThreadPoolExecutor(3) as ex: out=[r for r in ex.map(detail,sorted(ids)) if r]
json.dump(out,open('biomed.json','w'),ensure_ascii=False,indent=0)
print('records',len(out),'with image',sum(1 for r in out if r['image']))
for r in out[:4]: print(r['name'],'|',r['detail'][:200])
