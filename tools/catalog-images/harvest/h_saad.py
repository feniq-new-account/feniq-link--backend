from fetch import *
import html as H, concurrent.futures as cf
BASE='https://elsaad.com'
items={}
for L in ['0-9']+list('ABCDEFGHIJKLMNOPQRSTUVWXYZ'):
    try: h=get(f'{BASE}/products/alphabetic/{L}/En')
    except Exception as e: print(L,'err',e); continue
    for m in re.finditer(r'<a href="\./(products/\d+/(\d+)/En)">\s*<img[^>]+src="\./(img/uploads1/medium/[^"]+)" alt="([^"]*)">.*?<span class="category">([^<]*)</span>',h,re.S):
        page,pid,img,name,ing=m.groups()
        items[int(pid)]=dict(page=f'{BASE}/{page}',image=f'{BASE}/'+img.replace('/medium/','/larg/'),name=H.unescape(name).strip(),ingredient=H.unescape(ing).strip())
    time.sleep(0.4)
print('items',len(items))
def detail(kv):
    pid,c=kv
    try: d=get(c['page'])
    except Exception as e: return pid,c
    t=re.sub(r'<script.*?</script>|<style.*?</style>','',d,flags=re.S)
    b=H.unescape(re.sub(r'\s+',' ',re.sub(r'<[^>]+>',' ',t)))
    i=b.find('Chemical Name:'); c['detail']=b[i:i+500] if i>=0 else ''
    time.sleep(0.3); return pid,c
with cf.ThreadPoolExecutor(3) as ex: res=list(ex.map(detail,items.items()))
out=[dict(company='السعد',site=BASE,id=pid,**c) for pid,c in res]
json.dump(out,open('saad.json','w'),ensure_ascii=False,indent=0)
print('records',len(out))
for r in out[:3]: print(r['name'],'|',r['ingredient'],'|',r['detail'][:300])
