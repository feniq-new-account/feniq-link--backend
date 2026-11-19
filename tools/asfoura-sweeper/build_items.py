"""Builds items.csv for the Asfoura sweep from the reviewed Excel (v2). Run locally, commit items.csv."""
import csv, re, sys
from openpyxl import load_workbook
SRC = sys.argv[1]
BRAND = {'زيرا':'Zera','THF':'THF','بيبي روز':'Baby Rose','هاي دنت':'Hi-Dent','جولي دانت':'Jolly Dent','شفا':'Shifa',
 'العاصي':'Al Assi','آراك':'Arak','اراك':'Arak','ساري':'Sari','بلاتو':'Plato','فريش':'Fresh','بروبوليو':'Propolio','لونا':'Luna',
 'StopEver':'StopEver','Hélénie':'Helenie','Lucille':'Lucille','كيد كيت':'Kid Kit','سنسوداين':'Sensodyne','نايس':'Nice',
 'ديرموفيتش':'Dermovitch','ديرموفيتشر':'Dermovitch','ادريانا':'Adriana','فلامينغو':'Flamingo','فوسيتول':'Fucitol','جليسوليد':'Glysolid',
 'بست بايز':'Best Babys','زفير':'Zefir','زاك':'Zak','ديتوكس':'Detox','فلاي اكس':'Fly X','ديوريكس':'Durex','كونفورت':'Comfort',
 'ميري مانت':'Merry Mint','بللوران':'Belloran','سلاف':'Slaf','فاين':'Fine','مون إيفر':'Moon Ever','دايموند تاتش':'Diamond Touch','ويل توث':'Well Tooth'}
EN = [('فرشاة اسنان','toothbrush'),('فراشي اسنان','toothbrush'),('فرشاة بين الأسنان','interdental brush'),('خيط تنظيف','dental floss'),('خيوط تنظيف','dental floss'),
 ('نكاشات اسنان','toothpicks'),('نكاشات اذن','cotton buds'),('ببرونة','baby feeding bottle'),('رضاعة','baby feeding bottle'),('لهاية','pacifier'),('حلمة','bottle nipple'),
 ('عضاضة','teether'),('سحابة مفرزات','nasal aspirator'),('سحابة أنف','nasal aspirator'),('سحابة حليب','breast pump'),('ميزان حرارة','thermometer'),('مشط قمل','lice comb'),
 ('قراضة اظافر','nail clipper'),('قطاعة دواء','pill cutter'),('سدادة اذن','ear plugs'),('كفوف','gloves'),('خوافض لسان','tongue depressor'),('نشافة صدر','breast pads'),
 ('واقي الصدر','nipple shield'),('علبة غذاء','lunch box'),('حافظة ماء','water bottle'),('شامبو','shampoo'),('كريم','cream'),('بخاخ','spray'),('صابون','soap'),('لوشن','lotion'),
 ('لوسيون','lotion'),('زيت','oil'),('مرهم','ointment'),('محلول','solution'),('بودرة','powder'),('بودره','powder'),('غرغرة','mouthwash'),('سيروم','serum'),('مقشر','scrub'),
 ('مزيل تعرق','deodorant'),('مزيل شعر','hair removal cream'),('واقي شمسي','sunscreen'),('فازلين','vaseline'),('غليسرين','glycerin'),('كحول','alcohol'),('معقم','sanitizer'),
 ('محارم معطرة','wet wipes'),('محارم','wipes'),('بلاستر','plaster tape'),('شاش','gauze'),('رباط ضاغط','elastic bandage'),('رباط شاش','gauze bandage'),('حزام','support brace'),
 ('مشد','bandage'),('لصاقة','patch'),('لصقة','patch'),('لاصق جرح','wound plaster'),('ستريبس','strips'),('سكاكر','lozenges'),('شرائح','strips'),('كوندوم','condom'),
 ('قطن','cotton'),('ديسكات قطنية','cotton pads'),('كيس جمع بول','urine bag'),('مبولة','urinal'),('كاشف حمل','pregnancy test'),('شفرات','razor'),('ليفة','bath sponge'),
 ('فرشاة شعر','hair brush'),('طارد حشرات','insect repellent'),('مدفئ','warmer'),('قناع عين','eye mask'),('أطفال','kids'),('اطفال','kids'),('ناعم','soft'),('وسط','medium'),('خشن','hard')]
def english(name):
    words=[en for ar,en in EN if re.search(r'(^|[\s/])(ال|بال|لل)?'+re.escape(ar), name)]
    nums=re.findall(r'\d+(?:\.\d+)?\s*(?:مل|غ|ملغ|%|سم)?', name)
    nums=[n.replace('مل','ml').replace('ملغ','mg').replace('غ','g').replace('سم','cm') for n in nums[:2]]
    return ' '.join(dict.fromkeys(words[:3]+nums))
wb=load_workbook(SRC,read_only=True); ws=wb['الأصناف']
V1=sys.argv[2] if len(sys.argv)>2 else ''
BC={}
if V1:
    for r in list(load_workbook(V1,read_only=True)['كل الأصناف'].iter_rows(values_only=True))[1:]:
        m=re.search(r'الباركود (\d{8,14})', str(r[10] or ''))
        if m: BC[str(r[4])]=m.group(1)
out=[]
for r in list(ws.iter_rows(values_only=True))[1:]:
    k,grp,name,form,ing,strength,ministry,price,bonus,img,note,src=r[:12]
    if img and str(img).startswith('نعم') and grp not in ('StopEver',) and 'Kid Kit' not in str(src): continue
    name=str(name); brand=''
    for ar,en in BRAND.items():
        if ar in name or ar==grp: brand=en; break
    qs=[]
    if ministry:
        core=re.sub(r'\s*\(.*\)','',ministry).replace('CTD','').replace('TAB.','tablets').replace('CAP.','capsules')
        qs+= [f'{core} Pharmasyr' if grp=='فارماسير' else f'{core} Ibn Sina', f'{name}', f'{core} box']
    else:
        en=english(name)
        qs+= [name, f'{brand} {en}'.strip() if brand else en, f'{brand} {name}'.strip() if brand else '']
        if grp=='StopEver': qs.insert(0, f'StopEver {en}')
    keys=[brand.lower()] if brand else []
    ar_brand=[a for a,e in BRAND.items() if e==brand and re.search(r'[\u0600-\u06FF]',a)]
    keys+=ar_brand[:1]
    if ministry: keys=[re.split(r'[\s\-]',ministry)[0].lower(), name.split()[0]]
    bc=BC.get(name)
    label=english(name).split(' ')
    label='medicine box' if ministry else (' '.join(w for w in label if w.isalpha() and w not in ('ml','g','mg','cm'))[:40] or 'product')
    out.append(dict(id=k,name_ar=name,group=grp,brand=brand,ministry=ministry or '',barcode=bc or '',label=label,
                    queries='|'.join(dict.fromkeys(q for q in qs if q)),keys='|'.join(dict.fromkeys(keys))))
with open('items.csv','w',encoding='utf-8',newline='') as f:
    w=csv.DictWriter(f,fieldnames=list(out[0])); w.writeheader(); w.writerows(out)
print(len(out))
