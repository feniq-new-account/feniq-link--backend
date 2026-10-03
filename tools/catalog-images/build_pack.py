import pickle, hashlib, os, json, collections, io, shutil, sys, re
from PIL import Image, ImageOps
sys.path.insert(0,'.')
from match import agg
best=pickle.load(open('best.pkl','rb'))
MAXSIDE=800; MIN_SIDE=90
def rawpath(u): return 'raw/'+hashlib.sha1(u.encode()).hexdigest()
by_hash=collections.defaultdict(set)   # content hash -> set of site names (placeholder detection)
info={}
for i,(r,lvl,sc) in best.items():
    u=r['image']; p=rawpath(u)
    if not os.path.exists(p): continue
    b=open(p,'rb').read(); h=hashlib.sha1(b).hexdigest()
    by_hash[h].add((r['company'],r['name'])); info[u]=(h,len(b))
placeholders={h for h,names in by_hash.items() if len({n for _,n in names})>=4}
print('hashes',len(by_hash),'placeholder-like (same bytes under >=4 different names):',len(placeholders))
shutil.rmtree('pack',ignore_errors=True); os.makedirs('pack/images')
stats=collections.Counter(); written={}; manifest=[]; rejected=[]
for i,(r,lvl,sc) in sorted(best.items()):
    u=r['image']; p=rawpath(u)
    if u not in info: stats['missing']+=1; continue
    h,_=info[u]
    if h in placeholders: stats['placeholder']+=1; rejected.append((agg.loc[i,'display'],'placeholder',u)); continue
    if h not in written:
        try:
            im=Image.open(p); im.load()
        except Exception as e:
            written[h]=None; stats['unreadable']+=1; continue
        im=ImageOps.exif_transpose(im)
        w,hh=im.size
        if min(w,hh)<MIN_SIDE or max(w,hh)<120:
            written[h]=None; stats['too_small']+=1; rejected.append((agg.loc[i,'display'],f'too small {w}x{hh}',u)); continue
        if im.mode in ('P','LA'): im=im.convert('RGBA')
        elif im.mode not in ('RGB','RGBA'): im=im.convert('RGB')
        s=min(1.0,MAXSIDE/max(im.size))
        if s<1: im=im.resize((round(im.size[0]*s),round(im.size[1]*s)),Image.LANCZOS)
        name=h[:16]+'.webp'
        im.save('pack/images/'+name,'WEBP',quality=82,method=6)
        written[h]=(name,im.size)
    if written[h] is None: continue
    name,size=written[h]
    manifest.append(dict(nameAr=agg.loc[i,'display'],manufacturerAr=agg.loc[i,'company'],file=name,confidence={'A-exact':'exact','B-exact':'brand','C-fuzzy':'fuzzy'}[lvl],
                         siteName=r['name'],sourcePage=r.get('page'),sourceImage=u,sourceCompany=r['company']))
json.dump(manifest,open('pack/manifest.json','w'),ensure_ascii=False,indent=1)
json.dump(rejected,open('rejected.json','w'),ensure_ascii=False,indent=1)
files=[v for v in written.values() if v]
tot=sum(os.path.getsize('pack/images/'+f[0]) for f in files)
print(dict(stats)); print('items in manifest',len(manifest),'distinct images',len(files),'total MB',round(tot/1e6,1))
print('confidence',collections.Counter(m['confidence'] for m in manifest))
sizes=[f[1] for f in files]; print('median max-side',sorted(max(s) for s in sizes)[len(sizes)//2],'under 300px',sum(1 for s in sizes if max(s)<300))
