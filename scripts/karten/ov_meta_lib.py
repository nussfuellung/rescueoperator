# Liest nur die Fußzeilen der Overture-Parquet-Dateien und findet Zeilengruppen im Rechteck.
import sys, re, json, requests, pyarrow.parquet as pq, io, concurrent.futures as cf
BASE='https://overturemaps-us-west-2.s3.amazonaws.com/'
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
