from fetch import *
import html as H, concurrent.futures as cf
B='http://diamondpharma.com/'
home=get(B)
pages=sorted({l for l in links(B,home) if l.startswith(B) and not re.search(r'\.(css|js|png|ico|jpg|svg|gif|xml)|feed|comments|wp-json|/tag/|/category/|/page/',l,re.I) and l.rstrip('/')!=B.rstrip('/')})
print('pages',len(pages))
def one(u):
    try: d=get(u,25)
    except Exception: return None
    og=lambda p: (re.findall(r'<meta[^>]+property="og:%s"[^>]+content="([^"]*)"'%p,d) or re.findall(r'<meta[^>]+content="([^"]*)"[^>]+property="og:%s"'%p,d) or [None])[0]
    img=og('image'); title=H.unescape(og('title') or '')
    h1=re.findall(r'<h1[^>]*>(.*?)</h1>',d,re.S); h1=H.unescape(re.sub(r'<[^>]+>','',h1[0])).strip() if h1 else ''
    body=H.unescape(re.sub(r'\s+',' ',re.sub(r'<[^>]+>',' ',re.sub(r'<script.*?</script>|<style.*?</style>','',d,flags=re.S))))
    time.sleep(0.2)
    return dict(company='دياموند فارما',site=B,id=u.rstrip('/').split('/')[-1],name=h1 or title.split(' - ')[0].split('|')[0].strip(),page=u,image=img,detail=body[body.find(h1):body.find(h1)+400] if h1 and h1 in body else '')
with cf.ThreadPoolExecutor(4) as ex: out=[r for r in ex.map(one,pages) if r]
out=[r for r in out if r['image'] and 'uploads' in r['image'] and 'logo' not in r['image'].lower()]
json.dump(out,open('diamond.json','w'),ensure_ascii=False,indent=0)
print('diamond',len(out)); print([(r['name'],r['image'][-30:]) for r in out[:8]])
