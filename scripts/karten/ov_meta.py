# Liest nur die Fußzeilen der Overture-Parquet-Dateien und findet Zeilengruppen im Rechteck.
import sys, re, json, requests, pyarrow.parquet as pq, io, concurrent.futures as cf
BASE='https://overturemaps-us-west-2.s3.amazonaws.com/'
REL=sys.argv[1]; theme=sys.argv[2]; S,W,N,E=map(float,sys.argv[3:7]); out=sys.argv[7]
sess=requests.Session()
class RF(io.RawIOBase):
    def __init__(s,url):
        s.url=url; s.pos=0
        s.size=int(sess.head(url,timeout=60).headers['Content-Length'])
    def seekable(s): return True
    def readable(s): return True
    def tell(s): return s.pos
    def seek(s,o,w=0):
        s.pos = o if w==0 else s.pos+o if w==1 else s.size+o; return s.pos
    def readinto(s,b):
        n=len(b)
        if s.pos>=s.size: return 0
        end=min(s.size,s.pos+n)-1
        for t in range(5):
            try:
                r=sess.get(s.url,headers={'Range':f'bytes={s.pos}-{end}'},timeout=120); r.raise_for_status(); break
            except Exception as e:
                if t==4: raise
        d=r.content; b[:len(d)]=d; s.pos+=len(d); return len(d)
keys=[]; token=None
while True:
    u=f'{BASE}?list-type=2&prefix={REL}/theme={theme}/'+(f'&continuation-token={requests.utils.quote(token)}' if token else '')
    t=sess.get(u,timeout=60).text
    keys+=re.findall(r'<Key>([^<]*\.parquet)</Key>',t)
    m=re.search(r'<NextContinuationToken>([^<]*)</NextContinuationToken>',t)
    if not m: break
    token=m.group(1)
def scan(k):
    f=pq.ParquetFile(RF(BASE+k)); md=f.metadata; names=f.schema_arrow.names
    sch=f.metadata.schema
    idx={sch.column(i).path:i for i in range(md.num_columns)}
    hits=[]
    for g in range(md.num_row_groups):
        rg=md.row_group(g)
        st=lambda p: rg.column(idx[p]).statistics
        xmin,xmax,ymin,ymax=st('bbox.xmin').min,st('bbox.xmax').max,st('bbox.ymin').min,st('bbox.ymax').max
        if xmax>=W and xmin<=E and ymax>=S and ymin<=N: hits.append(g)
    return k,hits
res={}
with cf.ThreadPoolExecutor(16) as ex:
    for k,h in ex.map(scan,keys):
        if h: res[k]=h
json.dump(res,open(out,'w'))
print(len(keys),'Dateien,',sum(len(v) for v in res.values()),'Zeilengruppen im Rechteck')
