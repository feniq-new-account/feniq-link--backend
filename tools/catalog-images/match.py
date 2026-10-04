import pandas as pd, json, glob, re, difflib, collections, sys
AR_DIG=str.maketrans('٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹','01234567890123456789')
agg=pd.read_pickle('agg.pkl').reset_index(drop=True)
COMPANY_MAP={'بيوميد':'بيوميد فارما'}

# ---------- skeletons
AR={'ب':'b','ت':'t','ث':'s','ج':'k','ح':'','خ':'k','د':'t','ذ':'s','ر':'r','ز':'s','س':'s','ش':'s','ص':'s','ض':'t','ط':'t','ظ':'s','غ':'k','ف':'f','ق':'k','ك':'k','ل':'l','م':'m','ن':'n','ه':'','پ':'b','ڤ':'f','گ':'k','چ':'s'}
def skel_ar(s):
    return ''.join(AR.get(c,'') for c in s)
def skel_lat(s):
    s=s.lower()
    s=re.sub(r'[^a-z]',' ',s)
    s=re.sub(r'ph','f',s); s=re.sub(r'(?:sh|ch)','s',s); s=re.sub(r'th','t',s); s=re.sub(r'ck','k',s); s=re.sub(r'kh','k',s)
    s=re.sub(r'c(?=[eiy])','s',s); s=s.replace('c','k').replace('q','k').replace('x','ks')
    m={'p':'b','g':'k','j':'k','v':'f','d':'t','z':'s','h':'','w':'','y':'','a':'','e':'','i':'','o':'','u':''}
    s=''.join(m.get(c,c) for c in s if c!=' ')
    return s
def skel(s):
    ar=re.findall(r'[؀-ۿ]+',s)
    if ar and len(''.join(ar))>=len(re.sub(r'[^A-Za-z]','',s)): out=skel_ar(''.join(ar))
    else: out=skel_lat(s)
    return re.sub(r'(.)\1+',r'\1',out)

FORM_WORDS=set('tab tabs tablet tablets ctd cap caps capsule capsules amp amps ampoule vial vials susp suspension syrup syr sol soln solution drops drop oint ointment cream gel lotion supp suppository eff effervescent chew chewable f s mr sr ml g mg mcg iu pack bottle sachet sachets spray ovule ovules powder inj injection film coated dry for oral eye ear nasal nose vaginal topical per'.split())
AR_STOP=set('اقراص أقراص ملبسة ملبس مضغوطات مضغوطة كبسول كبسولات محافظ شراب معلق فيال فيالات امبول أمبول امبولة أمبولة حقن تحاميل قطرة قطرات مرهم كريم جل مل غ غرام ملغ ملغم بالفيلم للحقن فموي شفا وحدة وحدات'.split())
def tokens(name):
    n=name.translate(AR_DIG)
    n=re.sub(r'\([^)]*\)','',n) if False else n
    n=re.sub(r'(\d)\s*[,.](\d)',r'\1_\2',n)  # keep decimals
    n=re.sub(r'[^0-9A-Za-z_؀-ۿ]+',' ',n)
    return [t for t in n.lower().split() if t]
def split_name(name):
    toks=tokens(name)
    nums=[t.replace('_','.') for t in toks if re.fullmatch(r'[0-9_]+',t)]
    # glued like "ascorbic500": split trailing digits
    words=[t for t in toks if not re.fullmatch(r'[0-9_]+',t)]
    words2=[]
    for w in words:
        m=re.fullmatch(r'([a-z؀-ۿ]+)(\d+)',w)
        if m: words2.append(m.group(1)); nums.append(m.group(2))
        else: words2.append(w)
    words=[w for w in words2 if w not in FORM_WORDS and w not in AR_STOP and len(w)>0]
    return words,sorted(nums)

# ---------- form classes
FORM_RULES=[('inj',r'amp|vial|inj|حقن|أمبول|امبول|فيال|vials|syringe|سيرنغ'),('supp',r'supp|suppos|تحاميل|تحميل'),('ovule',r'ovule|بيوض|vaginal tab|مهبل'),
 ('oral_liquid',r'syrup|susp|suspension|elixir|شراب|معلق|نقط فموي|oral drops|oral solution|oral vial|فيال فموي|دراي|dry|الكسير'),
 ('topical',r'cream|oint|\bgel\b|lotion|كريم|مرهم|جل|مستحلب|شامبو|shampoo|spray|بخاخ|بخة|topical|dermal|رذاذ'),
 ('drops',r'eye|ear|nasal|nose|قطرة|drop'),('sachet',r'sachet|ظروف|powder|بودرة'),
 ('capsule',r'cap|capsule|كبسول|محافظ'),('tablet',r'tab|tablet|أقراص|اقراص|مضغوط|قرص|caplet|lozenge|أقراص'),('liquid',r'\bml\b|\d\s*مل')]
def form_class(*texts):
    t=' '.join(x for x in texts if x).lower()
    for cls,rx in FORM_RULES:
        if re.search(rx,t): return cls
    return None
def ministry_form(row):
    f=row.form or ''
    return form_class(f,row.display.split('(')[0])

agg['form_cls']=[ministry_form(r) for r in agg.itertuples()]
agg['packnums']=[set(re.findall(r'\d+(?:\.\d+)?',(re.search(r'\(([^()]*)\)\s*$',d) or [None,''])[1])) for d in agg.display]
agg['base']=[re.sub(r'\s*\([^()]*\)\s*$','',d) for d in agg.display]
sp=[split_name(b) for b in agg.base]
agg['words']=[s[0] for s in sp]; agg['nums']=[s[1] for s in sp]
agg['wkey']=[' '.join(w) for w in agg.words]
agg['skel']=[skel(' '.join(w)) for w in agg.words]

LIQ={'oral_liquid','inj','drops','liquid','topical'}
def compatible(a,b):
    if a==b: return True
    if {a,b}<= {'tablet','capsule'}: return True
    if 'liquid' in (a,b):
        other=b if a=='liquid' else a
        return other in {'oral_liquid','inj','drops'}
    return False
GROUP={'tablet':'solid','capsule':'solid','oral_liquid':'oral_liquid','inj':'inj','topical':'topical','drops':'drops','supp':'supp','ovule':'ovule','sachet':'sachet'}
def site_multi_form(r):
    # a page that names several different forms in its 'Dosage Form' line (one picture for the whole brand)
    t=(r.get('short') or '')
    m=re.split(r'composition',t,flags=re.I)[0].lower() if t else ''
    if not m: return False
    groups={GROUP[c] for c,rx in FORM_RULES if c in GROUP and re.search(rx,m)}
    return len(groups)>1
def site_form(r):
    return form_class(r.get('form'), r.get('name'), (r.get('detail') or r.get('short') or r.get('desc') or '')[:140], r.get('class'),' '.join(r.get('cats',[]) if isinstance(r.get('cats'),list) else []))

def load():
    recs=[]
    for f in sorted(glob.glob('img/*.json')):
        if f.endswith('delta_raw.json') or f.endswith('issa.json'): continue
        for r in json.load(open(f)):
            r['src']=f.split('/')[-1]
            recs.append(r)
    return recs

_AMB=None
def ambiguous_form(m):
    global _AMB
    if _AMB is None:
        _AMB=agg.groupby(['company','wkey']).form_cls.apply(lambda x: x.nunique(dropna=False)>1).to_dict()
    return _AMB[(m.company,m.wkey)]

def run():
    global site_brand_count
    recs=load()
    site_brand_count=collections.Counter()
    for r in recs:
        w,_=split_name(r['name']); site_brand_count[(r['company'],' '.join(w))]+=1
    by_company=collections.defaultdict(list)
    for i,r in enumerate(agg.itertuples()): by_company[r.company].append(i)
    matches=[]  # (ministry_idx, rec, level, score)
    for r in recs:
        if not r.get('image'): continue
        comp=COMPANY_MAP.get(r['company'],r['company'])
        idxs=by_company.get(comp,[])
        if not idxs: continue
        w,n=split_name(r['name'])
        if not w: continue
        n_raw=n
        rk=' '.join(w); rs=skel(rk); rf=site_form(r)
        for i in idxs:
            m=agg.loc[i]
            fm=m.form_cls
            n=[x for x in n_raw if x not in m.packnums or x in m.nums]
            if rf and fm and not compatible(rf,fm): continue
            numsame = (n==m.nums)
            if rk==m.wkey:
                if numsame:
                    # exact numbers: also require the form to be known, or unambiguous on the ministry side
                    if (rf is None or fm is None) and ambiguous_form(m): continue
                    matches.append((i,r,'B-exact' if site_multi_form(r) else 'A-exact',1.0))
                elif not n and (rf is not None and fm is not None or not ambiguous_form(m)) and site_brand_count[(r['company'],rk)]==1:
                    matches.append((i,r,'B-exact',1.0))
                continue
            # skeleton / fuzzy: (Arabic or transliterated names)
            is_ar=bool(re.search(r'[\u0600-\u06FF]',rk))
            if is_ar:
                ok= rs and m.skel and len(rs)>=4 and (rs==m.skel or difflib.SequenceMatcher(None,rs,m.skel).ratio()>=0.9)
                sc=difflib.SequenceMatcher(None,rs,m.skel).ratio() if ok else 0
            else:
                a=rk.replace(' ',''); b=m.wkey.replace(' ','')
                sc=difflib.SequenceMatcher(None,a,b).ratio()
                ok= len(a)>=5 and sc>=0.92
            if ok and numsame and (rf is not None and fm is not None or not ambiguous_form(m)):
                matches.append((i,r,'C-fuzzy',sc))
    return recs,matches
if __name__=='__main__':
    recs,matches=run()
    print('records w/ image',sum(1 for r in recs if r.get('image')),'matches',len(matches))
    per=collections.Counter(); 
    best={}
    rank={'A-exact':0,'B-exact':1,'C-fuzzy':2}
    for i,r,l,s in matches:
        k=best.get(i)
        if k is None or rank[l]<rank[k[1]] or (rank[l]==rank[k[1]] and s>k[2]): best[i]=(r,l,s)
    lv=collections.Counter(v[1] for v in best.values()); print('items matched',len(best),dict(lv))
    byc=collections.Counter(agg.loc[i,'company'] for i in best); tot=agg.company.value_counts()
    for c,n in byc.most_common(): print(f'{c:12} {n:4}/{tot[c]}')
    import pickle; pickle.dump(best,open('best.pkl','wb'))
