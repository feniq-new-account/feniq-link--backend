from fetch import *
import html as H, concurrent.futures as cf
def txt(d):
    t=re.sub(r'<script.*?</script>|<style.*?</style>','',d,flags=re.S)
    return H.unescape(re.sub(r'\s+',' ',re.sub(r'<[^>]+>',' ',t))).strip()
# ---------- Unipharma
B='https://www.unipharma-sy.com'
h=get(B+'/Categories'); cats=sorted(set(re.findall(r'/Category/(\d+)',h)),key=int)
uni={}
for c in cats:
    try: hh=get(f'{B}/Category/{c}')
    except Exception as e: print('uni cat',c,e); continue
    for pid,name,img in re.findall(r'<a href="/Product/(\d+)">\s*<h4>(.*?)</h4>\s*<img[^>]+src="([^"]+)"',hh,re.S):
        uni[int(pid)]=dict(company='يونيفارما',site=B,id=int(pid),name=H.unescape(name).strip(),page=f'{B}/Product/{pid}',image=B+img,category=re.findall(r'<h3>\s*(.*?)\s*</h3>',hh,re.S)[0] if re.findall(r'<h3>\s*(.*?)\s*</h3>',hh,re.S) else '')
    time.sleep(0.4)
def udetail(kv):
    pid,r=kv
    try: d=get(r['page'])
    except Exception: return r
    b=txt(d); i=b.find(r['name']); r['detail']=b[i:i+500] if i>=0 else ''
    time.sleep(0.3); return r
with cf.ThreadPoolExecutor(3) as ex: uni_out=list(ex.map(udetail,uni.items()))
json.dump(uni_out,open('unipharma.json','w'),ensure_ascii=False,indent=0)
print('unipharma',len(uni_out))
# ---------- Bahri
B='https://bahripharm.com'
slugs={}
for p in range(1,30):
    try: hh=get(f'{B}/product?page={p}')
    except Exception as e: print('bahri p',p,e); break
    s=re.findall(r'href="https://bahripharm\.com/product/([^"/]+)"',hh)
    new=[x for x in s if x not in slugs]
    for x in new: slugs[x]=1
    if not new: break
    time.sleep(0.4)
print('bahri slugs',len(slugs))
def bdetail(s):
    u=f'{B}/product/{s}'
    try: d=get(u)
    except Exception: return None
    b=txt(d); cover=re.findall(r'/images/Products/Product-cover/[^"\']+',d)
    m=re.search(r'Home Products (.*?) - (.*?) Therapeutic Category',b)
    time.sleep(0.3)
    return dict(company='بحري',site=B,id=s,name=(m.group(2) if m else s.replace('_',' ')),page=u,image=(B+cover[0]) if cover else None,detail=b[b.find('Packaging'):b.find('Packaging')+420] if 'Packaging' in b else b[:300])
with cf.ThreadPoolExecutor(3) as ex: bahri=[r for r in ex.map(bdetail,slugs) if r]
json.dump(bahri,open('bahri.json','w'),ensure_ascii=False,indent=0)
print('bahri',len(bahri),'with image',sum(1 for r in bahri if r['image']))
for r in bahri[:3]: print(r['name'],'|',r['detail'][:160])
