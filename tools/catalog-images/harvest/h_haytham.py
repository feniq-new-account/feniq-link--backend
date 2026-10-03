from fetch import *
import html as H, concurrent.futures as cf
BASE='https://ibn-alhaytham.com'
cards={}
for p in range(1,70):
    try: h=get(f'{BASE}/products?page={p}')
    except Exception as e: print('page',p,e); continue
    found=re.findall(r'<a href="(https://ibn-alhaytham\.com/product/(\d+)-[^"]+)"><img src="([^"]+)" alt="([^"]*)"></a>.*?fa-shapes[^>]*></i>([^<]*)</span>',h,re.S)
    if not found and p>1: break
    for url,pid,img,name,form in found: cards[int(pid)]=dict(page=url,image=img,name=H.unescape(name).strip(),form=H.unescape(form).strip())
    time.sleep(0.2)
print('cards',len(cards))
def detail(item):
    pid,c=item
    try: d=get(c['page'])
    except Exception as e: return pid,c
    t=re.sub(r'<script.*?</script>|<style.*?</style>','',d,flags=re.S)
    b=H.unescape(re.sub(r'\s+',' ',re.sub(r'<[^>]+>',' ',t)))
    m=re.search(r'التعبئة:\s*(.*?)\s*التركيب العلمي\s*(.*?)\s*(?:الاستخدامات|للاطّلاع)',b)
    if m: c['pack']=m.group(1).strip(); c['composition']=m.group(2).strip()
    m2=re.search(r'التصنيف الدوائي:\s*(.*?)\s*الشكل الصيدلاني',b); 
    if m2: c['class']=m2.group(1).strip()
    time.sleep(0.15); return pid,c
with cf.ThreadPoolExecutor(4) as ex: res=list(ex.map(detail,cards.items()))
out=[dict(company='ابن الهيثم',site=BASE,id=pid,**c) for pid,c in res]
json.dump(out,open('haytham.json','w'),ensure_ascii=False,indent=0)
print('records',len(out),'with composition',sum(1 for r in out if r.get('composition')))
for r in out[:5]: print(r['name'],'|',r.get('composition'),'|',r.get('pack'),'|',r['form'])
