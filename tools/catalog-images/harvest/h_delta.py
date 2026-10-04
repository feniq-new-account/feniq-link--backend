from fetch import *
import html as H
B='https://deltapharma-sy.net'
out={}; 
for p in range(1,20):
    u=f'{B}/en/categories/all/products'+(f'?page={p}' if p>1 else '')
    try: h=get(u)
    except Exception as e: print(p,e); break
    cards=re.findall(r'<a href="(/en/categories/[^"]+/products/([^"/]+))"[^>]*>.*?<img src="([^"]+)" alt="([^"]*)".*?<span[^>]*>\s*(.*?)\s*</span>\s*</div>\s*<h2[^>]*>\s*(.*?)\s*</h2>\s*<p[^>]*>\s*(.*?)\s*</p>',h,re.S)
    new=0
    for href,slug,img,alt,form,name,desc in cards:
        if slug not in out: new+=1
        out[slug]=dict(company='دلتا',site=B,id=slug,name=H.unescape(name).strip(),page=B+href,image=img,form=H.unescape(form).strip(),desc=H.unescape(desc).strip())
    print('page',p,len(cards),'new',new)
    if not new: break
    time.sleep(0.5)
res=list(out.values()); json.dump(res,open('delta.json','w'),ensure_ascii=False,indent=0)
print('delta',len(res)); print(res[:3])
