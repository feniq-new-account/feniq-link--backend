import pickle, hashlib, os, time, urllib.request, urllib.parse, concurrent.futures as cf, collections, sys
sys.path.insert(0,'img')
UA='Mozilla/5.0 (compatible; FeniqCatalogBot/1.0; +catalog images for a Syrian pharmacy ordering app)'
best=pickle.load(open('best.pkl','rb'))
urls=sorted({v[0]['image'] for v in best.values()})
print('unique image urls',len(urls))
os.makedirs('raw',exist_ok=True)
def path(u): return 'raw/'+hashlib.sha1(u.encode()).hexdigest()
def dl(u):
    p=path(u)
    if os.path.exists(p) and os.path.getsize(p)>0: return u,'cached'
    for attempt in range(3):
        try:
            req=urllib.request.Request(urllib.parse.quote(u,safe=':/?&=%#+@,;~'),headers={'User-Agent':UA,'Accept':'image/webp,image/*;q=0.8,*/*;q=0.5','Referer':u.split('/',3)[0]+'//'+u.split('/')[2]+'/'})
            with urllib.request.urlopen(req,timeout=40) as f:
                b=f.read(); ct=f.headers.get('content-type','')
            if not ct.startswith('image') and not b[:4] in (b'\x89PNG',b'\xff\xd8\xff\xe0',b'\xff\xd8\xff\xe1',b'RIFF'): return u,'notimage:'+ct
            open(p,'wb').write(b); time.sleep(0.12); return u,'ok'
        except Exception as e:
            err=str(e)[:60]; time.sleep(1.5*(attempt+1))
    return u,'ERR '+err
res=collections.Counter(); bad=[]
with cf.ThreadPoolExecutor(6) as ex:
    for u,st in ex.map(dl,urls):
        res[st.split(':')[0][:12]]+=1
        if st not in ('ok','cached'): bad.append((u,st))
print(dict(res)); print(bad[:10])
pickle.dump(bad,open('bad.pkl','wb'))
