import pandas as pd, os, zipfile
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment
agg=pd.read_pickle('agg.pkl')
CAP=1500
sizes=agg.groupby('company').size().sort_values(ascending=False)
bins=[]
for comp,n in sizes.items():
    for b in bins:
        if b['n']+n<=CAP: b['c'].append(comp); b['n']+=n; break
    else: bins.append({'c':[comp],'n':n})
os.makedirs('parts',exist_ok=True)
for f in os.listdir('parts'): os.remove('parts/'+f)
bold=Font(bold=True,color='FFFFFF'); fill=PatternFill('solid',fgColor='1F3A5F')
heads=['اسم الدواء','الشركة','التركيب','العيار','الشكل الصيدلاني','رقم الوزارة']
summary=[]
for i,b in enumerate(bins,1):
    part=agg[agg.company.isin(b['c'])].sort_values(['company','display'])
    wb=Workbook(); ws=wb.active; ws.title='الأدوية'; ws.sheet_view.rightToLeft=True
    ws.append(heads)
    for r in part.itertuples(): ws.append([r.display,r.company,r.comp,r.strength,r.form,r.ids])
    for c in ws[1]: c.font=bold; c.fill=fill; c.alignment=Alignment(horizontal='center')
    for col,w in zip('ABCDEF',[46,20,40,26,24,16]): ws.column_dimensions[col].width=w
    ws.freeze_panes='A2'
    name=f'parts/feniq-catalog-part-{i}-of-{len(bins)}.xlsx'; wb.save(name)
    summary.append((i,len(part),'، '.join(b['c'])))
    print(i,len(part),len(b['c']),'companies:',' ، '.join(b['c'][:6]),'...' if len(b['c'])>6 else '')
assert sum(s[1] for s in summary)==len(agg)
with zipfile.ZipFile('feniq-catalog-parts.zip','w',zipfile.ZIP_DEFLATED) as z:
    for f in sorted(os.listdir('parts')): z.write('parts/'+f,f)
pd.DataFrame(summary,columns=['part','items','companies']).to_pickle('summary.pkl')
