import urllib.request,urllib.parse,re,time,sys,os,json
UA='Mozilla/5.0 (compatible; FeniqCatalogBot/1.0; +catalog images for a Syrian pharmacy ordering app)'
def get(u,t=30,raw=False):
    r=urllib.request.Request(u,headers={'User-Agent':UA,'Accept-Language':'en,ar'})
    with urllib.request.urlopen(r,timeout=t) as f:
        b=f.read(); return b if raw else b.decode('utf-8','replace')
def links(base,h):
    return sorted(set(urllib.parse.urljoin(base,l.replace('&amp;','&')) for l in re.findall(r'href=["\']([^"\'#]+)["\']',h)))
