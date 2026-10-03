import json, random, sys
from PIL import Image, ImageDraw, ImageFont
m=json.load(open('pack/manifest.json'))
conf=sys.argv[1]; seed=int(sys.argv[2]); n=int(sys.argv[3]) if len(sys.argv)>3 else 20
pool=[x for x in m if x['confidence']==conf]
random.seed(seed); pick=random.sample(pool,n)
cols=5; tw,th=230,200; rows=(n+cols-1)//cols
sheet=Image.new('RGB',(cols*tw,rows*(th+34)),'white'); d=ImageDraw.Draw(sheet)
try: f=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',11)
except: f=ImageFont.load_default()
for k,x in enumerate(pick):
    im=Image.open('pack/images/'+x['file']).convert('RGBA'); bg=Image.new('RGBA',im.size,'white'); bg.alpha_composite(im); im=bg.convert('RGB')
    im.thumbnail((tw-10,th-10)); cx=(k%cols)*tw; cy=(k//cols)*(th+34)
    sheet.paste(im,(cx+5,cy+5))
    d.text((cx+4,cy+th),x['nameAr'][:36],fill='black',font=f)
    d.text((cx+4,cy+th+13),('<- '+x['siteName'])[:36],fill=(180,0,0),font=f)
sheet.save(f'sheet_{conf}_{seed}.png'); print(sheet.size)
