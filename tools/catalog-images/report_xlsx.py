import pandas as pd, json, glob, collections
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.utils import get_column_letter
df=pd.read_pickle('report.pkl')
SITES={'آسيا':'asiapharma-syria.com','ابن الهيثم':'ibn-alhaytham.com','السعد':'elsaad.com','بحري':'bahripharm.com','بركات':'barakat-pharma.com','الفارس':'alfarespharma.com','دلتا':'deltapharma-sy.net','دومنا':'dominapharm.com','راما':'rama-pharma.com','هيومن فارما':'human-pharma.com','حماة':'hama-pharma.com','كيمي':'kimi-pharma.com','يونيفارما':'unipharma-sy.com','فيتا فارما':'vita-sy.com','مسعود فارما':'massoud-pharma.com','شفا':'shifapharma.com','دياموند فارما':'diamondpharma.com','ابن زهر':'avenzor.net','الشهباء':'alshahba-pharma.com','زين فارما':'zein-pharma.com'}
BLOCKED={'ميديكو':'medico-labs.com (شهادة الموقع معطلة)','ابن حيان':'ibnhayyanpharma.com (شهادة الموقع معطلة)','الرازي':'al-razigroup.com (شهادة الموقع معطلة)','سيتي فارما':'citypharmaceutical.com (لا يفتح)','غولدن ميدفارما':'goldenmedpharma.com (لا يفتح)','أوبري':'oubari.com (أخبار فقط)','البلسم':'balsam-pharma.com (لا صفحات منتجات)','ميرسي فارما':'mercypharma.com (لم تنجح قراءته)'}
rows=[]
for c,g in df.groupby('company'):
    total=len(g); w=(g.status=='بصورة').sum()
    reasons=g[g.status=='بلا صورة'].reason.value_counts()
    top=reasons.index[0] if len(reasons) else ''
    site=SITES.get(c) or BLOCKED.get(c,'—')
    if c in SITES:
        act='موقعها فيه صور: الباقي غير موجود بالموقع. اطلب منها صور البقية (قالب الرسالة بالتوثيق).'
    elif c in BLOCKED:
        act='جرّب جلب صورها من السيرفر السوري بعد إنشائه، أو اطلب الصور من مندوبها.'
    else:
        act='لا موقع معروف: اطلب الصور من مندوب الشركة، أو صوّرها من المستودع.'
    rows.append(dict(company=c,total=total,withImage=int(w),withoutImage=int(total-w),pct=round(100*w/total),site=site,action=act))
bycomp=pd.DataFrame(rows).sort_values('withoutImage',ascending=False)
print(bycomp.head(20)[['company','total','withImage','withoutImage','site']].to_string())
wb=Workbook()
head=Font(bold=True,color='FFFFFF'); fill=PatternFill('solid',fgColor='1F3A5F')
def sheet(name,header,data,widths):
    ws=wb.create_sheet(name); ws.sheet_view.rightToLeft=True; ws.append(header)
    for r in data: ws.append(list(r))
    for c in ws[1]: c.font=head; c.fill=fill; c.alignment=Alignment(horizontal='center',wrap_text=True)
    for i,w in enumerate(widths,1): ws.column_dimensions[get_column_letter(i)].width=w
    ws.freeze_panes='A2'; ws.auto_filter.ref=ws.dimensions
    return ws
ws=wb.active; ws.title='ملخص'; ws.sheet_view.rightToLeft=True
with_=df[df.status=='بصورة']; wo=df[df.status=='بلا صورة']
lines=[('إجمالي أصناف الكتالوج',len(df)),('أصناف بصورة',len(with_)),('  - نفس الاسم والعيار (موثوقة)',int((with_.confidence=='نفس الاسم والعيار').sum())),('  - صورة العلامة (تقريبية)',int((with_.confidence=='صورة العلامة (تقريبية)').sum())),('  - تطابق بالتهجئة (تقريبية)',int((with_.confidence=='تطابق بالتهجئة (تقريبية)').sum())),('عدد الصور المختلفة (ملفات)',1394),('',''),('أصناف بلا صورة',len(wo))]
for r,n in wo.reason.value_counts().items(): lines.append(('  - '+r,int(n)))
for a,b in lines: ws.append([a,b])
ws.column_dimensions['A'].width=62; ws.column_dimensions['B'].width=14
for c in ws['A']: c.font=Font(bold=c.value in ('إجمالي أصناف الكتالوج','أصناف بصورة','أصناف بلا صورة'))
sheet('حسب الشركة',['الشركة','أصناف الكتالوج','بصورة','بلا صورة','نسبة التغطية %','الموقع','المقترح'],bycomp[['company','total','withImage','withoutImage','pct','site','action']].values,[22,14,10,10,14,40,70])
sheet('بصورة (المطابَق)',['اسم الصنف (قائمة الوزارة)','الشركة','المادة الفعالة','العيار','الشكل','درجة المطابقة','الاسم على موقع الشركة','صفحة المصدر'],with_.sort_values(['company','nameAr'])[['nameAr','company','ingredient','strength','form','confidence','matchedSiteName','sourcePage']].values,[44,16,30,22,20,24,34,60])
sheet('بلا صورة',['اسم الصنف (قائمة الوزارة)','الشركة','المادة الفعالة','العيار','الشكل','السبب'],wo.sort_values(['reason','company','nameAr'])[['nameAr','company','ingredient','strength','form','reason']].values,[44,16,30,22,20,52])
wb.save('feniq-images-report.xlsx'); print('saved')
