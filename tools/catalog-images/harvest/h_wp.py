from fetch import *
import html as H
def strip(s): return H.unescape(re.sub(r'\s+',' ',re.sub(r'<[^>]+>',' ',s or ''))).strip()
for company,base in [('الفارس','https://alfarespharma.com'),('بركات','https://barakat-pharma.com')]:
    out=[]; p=1
    while True:
        try: data=json.loads(get(f'{base}/wp-json/wc/store/v1/products?per_page=100&page={p}'))
        except Exception as e: print(company,p,e); break
        if not data: break
        for it in data:
            imgs=it.get('images') or []
            out.append(dict(company=company,site=base,id=it['id'],name=strip(it['name']),page=it['permalink'],image=imgs[0]['src'] if imgs else None,
                            short=strip(it.get('short_description')),desc=strip(it.get('description'))[:600],cats=[c['name'] for c in it.get('categories',[])]))
        p+=1; time.sleep(0.5)
        if len(data)<100: break
    json.dump(out,open(f'{base.split("//")[1].split(".")[0]}.json','w'),ensure_ascii=False,indent=0)
    print(company,len(out),'with image',sum(1 for r in out if r['image']))
    for r in out[:4]: print('  ',r['name'],'|',r['short'][:120],'|',r['image'])
