from fetch import *
import concurrent.futures as cf, html as H
BASE='https://www.asiapharma-syria.com'
def one(i):
    u=f'{BASE}/en/product-details/{i}'
    try:
        d=get(u,25)
    except Exception as e:
        return None
    t=re.findall(r'<title>(.*?)</title>',d,re.S)
    if not t: return None
    title=H.unescape(re.sub(r'\s+',' ',t[0])).strip()
    if 'ASIA Pharmaceutical' not in title: return None
    parts=[p.strip() for p in title.split(' - ')]
    img=re.findall(r'/files/images/products/[^"\'\s>]+',d)
    time.sleep(0.15)
    return {'company':'آسيا','site':BASE,'id':i,'title':title,'name':parts[0],'ingredient':parts[1] if len(parts)>1 else '','form':parts[2] if len(parts)>2 else '',
            'page':u,'image':(BASE+img[0]) if img else None}
out=[]
with cf.ThreadPoolExecutor(4) as ex:
    for r in ex.map(one,range(1,760)):
        if r: out.append(r)
json.dump(out,open('asia.json','w'),ensure_ascii=False,indent=0)
print('pages',len(out),'with image',sum(1 for r in out if r['image']))
for r in out[:6]: print(r['name'],'|',r['ingredient'],'|',r['image'])
