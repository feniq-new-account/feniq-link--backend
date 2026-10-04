from fetch import *
import html as H
def strip(s): return H.unescape(re.sub(r'\s+',' ',re.sub(r'<[^>]+>',' ',s or ''))).strip()
sites=[('راما','https://rama-pharma.com','product','rama'),('هيومن فارما','https://human-pharma.com','product','human'),('حماة','https://hama-pharma.com','product','hama'),('عيسى','https://issapharma.com','product','issa')]
for company,base,typ,key in sites:
    out=[]; p=1
    while True:
        u=f'{base}/wp-json/wp/v2/{typ}?per_page=100&page={p}&_embed=1'
        try: data=json.loads(get(u,40))
        except Exception as e: print(company,p,str(e)[:60]); break
        if not data: break
        for it in data:
            media=(it.get('_embedded',{}).get('wp:featuredmedia') or [{}])[0]
            src=media.get('source_url') if isinstance(media,dict) else None
            terms=[t['name'] for grp in it.get('_embedded',{}).get('wp:term',[]) for t in grp if isinstance(t,dict) and t.get('name')]
            out.append(dict(cats=terms,company=company,site=base,id=it['id'],name=strip(it['title']['rendered']),page=it['link'],image=src,detail=strip(it.get('content',{}).get('rendered'))[:500]))
        p+=1; time.sleep(0.6)
        if len(data)<100: break
    json.dump(out,open(f'{key}.json','w'),ensure_ascii=False,indent=0)
    print(company,len(out),'with image',sum(1 for r in out if r['image']),'|',[r['name'] for r in out[:4]])
