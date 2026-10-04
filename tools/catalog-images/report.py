import json, glob, collections, pickle, re, difflib
import pandas as pd
from match import agg, split_name, COMPANY_MAP, run, load
manifest=json.load(open('pack/manifest.json'))
recs=[]
for f in sorted(glob.glob('img/*.json')):
    if f.endswith(('delta_raw.json','issa.json')): continue
    recs+= [dict(r,src=f) for r in json.load(open(f))]
site_companies={COMPANY_MAP.get(r['company'],r['company']) for r in recs}
# site brand index per company (including records WITHOUT an image)
brand_idx=collections.defaultdict(lambda: collections.defaultdict(list))
for r in recs:
    w,n=split_name(r['name'])
    if w: brand_idx[COMPANY_MAP.get(r['company'],r['company'])][' '.join(w)].append(r)
mkey={(m['nameAr'],m['manufacturerAr']):m for m in manifest}
rows=[]
for i,a in agg.iterrows():
    m=mkey.get((a.display,a.company))
    base=dict(nameAr=a.display,company=a.company,ingredient=a.comp,strength=a.strength,form=a.form,ministryIds=a.ids)
    if m:
        rows.append(dict(base,status='بصورة',confidence={'exact':'نفس الاسم والعيار','brand':'صورة العلامة (تقريبية)','fuzzy':'تطابق بالتهجئة (تقريبية)'}[m['confidence']],
                         matchedSiteName=m['siteName'],sourcePage=m['sourcePage'],sourceImage=m['sourceImage'],reason=''))
        continue
    comp=a.company
    if comp not in site_companies:
        reason='الشركة: لا موقع فيه صور وصلنا له'
    else:
        sib=brand_idx[comp].get(a.wkey,[])
        if not sib:
            reason='الشركة لها موقع، والصنف غير موجود فيه'
        elif any(r.get('image') for r in sib):
            reason='موجود بالموقع لكن بعيار أو شكل مختلف عن قائمة الوزارة'
        else:
            reason='موجود بالموقع بلا صورة'
    rows.append(dict(base,status='بلا صورة',confidence='',matchedSiteName='',sourcePage='',sourceImage='',reason=reason))
df=pd.DataFrame(rows)
df.to_pickle('report.pkl')
print('total',len(df),'with',(df.status=='بصورة').sum(),'without',(df.status=='بلا صورة').sum())
print(df[df.status=='بصورة'].confidence.value_counts().to_string())
print(df[df.status=='بلا صورة'].reason.value_counts().to_string())
print('distinct images',len({m['file'] for m in manifest}))
# family candidates: no image, but another item with the same company+brand has one
has=df[df.status=='بصورة']
fam=0
withimg=set(zip(has.company, [agg.loc[(agg.display==n)&(agg.company==c),'wkey'].iloc[0] for n,c in zip(has.nameAr,has.company)]))
cand=[]
for i,a in agg.iterrows():
    if (a.display,a.company) in mkey: continue
    if (a.company,a.wkey) in withimg: cand.append(i)
print('unmatched items whose brand has a picture at another strength/form:',len(cand))
