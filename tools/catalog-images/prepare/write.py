import pandas as pd
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment
agg=pd.read_pickle('agg.pkl'); MFR=pd.read_pickle('mfr.pkl')
df=pd.read_pickle('df.pkl')
agg=agg.sort_values(['company','display'])
wb=Workbook()
ws=wb.active; ws.title='الأدوية'; ws.sheet_view.rightToLeft=True
heads=['اسم الدواء','الشركة','التركيب','العيار','الشكل الصيدلاني','رقم الوزارة']
ws.append(heads)
for r in agg.itertuples():
    ws.append([r.display,r.company,r.comp,r.strength,r.form,r.ids])
bold=Font(bold=True,color='FFFFFF'); fill=PatternFill('solid',fgColor='1F3A5F')
for c in ws[1]: c.font=bold; c.fill=fill; c.alignment=Alignment(horizontal='center')
for col,w in zip('ABCDEF',[46,20,40,26,24,16]): ws.column_dimensions[col].width=w
ws.freeze_panes='A2'; ws.auto_filter.ref=f'A1:F{ws.max_row}'
ws2=wb.create_sheet('الشركات'); ws2.sheet_view.rightToLeft=True
ws2.append(['الاسم في التطبيق','الاسم عند الوزارة','عدد الأصناف'])
counts=agg.groupby('mfr').size()
for orig,short in sorted(MFR.items(),key=lambda kv:-counts.get(kv[0],0)):
    ws2.append([short,orig,int(counts.get(orig,0))])
for c in ws2[1]: c.font=bold; c.fill=fill
for col,w in zip('ABC',[24,70,14]): ws2.column_dimensions[col].width=w
wb.save('feniq-catalog-import.xlsx')
print(ws.max_row-1,'items;',ws2.max_row-1,'companies')
