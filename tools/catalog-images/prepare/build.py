import pandas as pd,re,collections
df=pd.read_excel('moh.xlsx',sheet_name='كل الأصناف')
df.columns=['n','id','name','mfr','comp','strength','pack','form','price','date']
for c in ['name','mfr','comp','strength','pack','form']: df[c]=df[c].astype(str).str.strip().str.replace(r'\s+',' ',regex=True)

pat=re.compile(r'(?:FOR|FOE|BOX OF)\s*(?:TWO\s*)?/\s*([\d.,+*]+)\s*/\s*(.*)$',re.I)
UNITS=[  # (regex, label)
 (r'\bLITRES?\b','L'),(r'\bML\b','ML'),(r'^G\b|\bG\.','G'),
 (r'\bTAB','TAB'),(r'\bCAP','CAP'),(r'\bAMP','AMP'),(r'\bVIAL','VIAL'),(r'\bSUPP','SUPP'),
 (r'\bSACHET','SACHET'),(r'\bOVULE','OVULE'),(r'\bLOZENGE','LOZENGE'),(r'\bDOSE','DOSE'),
 (r'\bCARTRIDGE','CARTRIDGE'),(r'\bDRESSING','DRESSING'),(r'\bGAUZE','GAUZE'),(r'\bENEMA','ENEMA'),
 (r'\bFILM','FILM'),(r'\bPREFILLED','SYRINGE'),(r'\bFLACON','FLACON'),(r'\bG\b','G'),
]
def pack_label(p):
    m=pat.search(p)
    if not m: return None
    count, rest = m.group(1).rstrip('.,'), m.group(2).upper()
    best=None
    for rx,label in UNITS:
        mm=re.search(rx,rest)
        if mm and (best is None or mm.start()<best[0]): best=(mm.start(),label)
    unit = best[1] if best else rest.split()[0].strip('.') if rest else ''
    return f'{count} {unit}'.strip()
df['packlabel']=df.pack.map(pack_label)
print('no pack label',df.packlabel.isna().sum())
df['key1']=df.name+'|'+df.mfr+'|'+df.packlabel.fillna('')
g=df.groupby('key1')
multi=g.filter(lambda x: x.strength.nunique()>1)
print('rows where same name+pack differ by strength',len(multi), multi.key1.nunique())
print(multi[['name','strength','packlabel','pack']].head(20).to_string())
same=g.filter(lambda x: len(x)>1 and x.strength.nunique()==1)
print('rows same name+pack+strength (merge)',len(same), same.key1.nunique())
print(same[['name','strength','pack','price']].head(16).to_string())
df.to_pickle('df.pkl')
