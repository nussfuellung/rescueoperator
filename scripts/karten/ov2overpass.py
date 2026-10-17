# Overture-Daten (aus OSM abgeleitet) für das ILS-Gebiet Würzburg in Overpass-JSON umwandeln.
import sys, json, re, pyarrow.parquet as pq
from shapely import wkb
from shapely.ops import unary_union
from shapely.prepared import prep
from shapely.geometry import Point
D=sys.argv[2] if len(sys.argv)>2 else './'; out=sys.argv[1]
COUNTIES={'Landkreis Würzburg','Würzburg','Landkreis Kitzingen','Landkreis Main-Spessart'}
area=unary_union([wkb.loads(r['geometry']) for r in pq.read_table(D+'division_area.parquet').to_pylist() if r['subtype']=='county' and r['names']['primary'] in COUNTIES])
area_b=prep(area.buffer(0.01))
area_s=prep(area)
inside=lambda lon,lat: area_b.contains(Point(lon,lat))
strict=lambda lon,lat: area_s.contains(Point(lon,lat))
print('Gebiet', area.bounds)
HW={'motorway','trunk','primary','secondary','tertiary','unclassified','residential','living_street'}
els=[]; nodeid={}; nid=[0]
def node(lon,lat):
    k=(round(lon,7),round(lat,7))
    if k not in nodeid:
        nid[0]+=1; nodeid[k]=nid[0]; els.append({'type':'node','id':nid[0],'lat':k[1],'lon':k[0]})
    return nodeid[k]
nw=0
for r in pq.read_table(D+'seg.parquet').to_pylist():
    if r['subtype']!='road' or r['class'] not in HW: continue
    g=wkb.loads(r['geometry']); cs=list(g.coords)
    if not any(inside(*c) for c in cs[::max(1,len(cs)//4)]+[cs[-1]]): continue
    hw=r['class']+('_link' if r['subclass']=='link' and r['class'] in ('motorway','trunk','primary','secondary','tertiary') else '')
    tags={'highway':hw}
    nm=(r['names'] or {}).get('primary')
    if nm: tags['name']=nm
    refs=[x['ref'] for x in (r['routes'] or []) if x.get('ref')]
    if refs: tags['ref']=refs[0]
    for s in r['speed_limits'] or []:
        ms=s.get('max_speed')
        if ms and ms.get('value') and not s.get('when') and not s.get('between'):
            tags['maxspeed']=str(ms['value']); break
    for a in r['access_restrictions'] or []:
        w=a.get('when') or {}
        if a.get('access_type')=='denied' and w.get('heading') and not w.get('mode') and not w.get('using') and not a.get('between'):
            tags['oneway']='yes' if w['heading']=='backward' else '-1'
    els.append({'type':'way','id':10**12+nw,'nodes':[node(*c[:2]) for c in cs],'tags':tags}); nw+=1
print('Straßen',nw,'Knoten',nid[0])
for r in pq.read_table(D+'division.parquet').to_pylist():
    if r['subtype']!='locality': continue
    p=wkb.loads(r['geometry'])
    if not strict(p.x,p.y): continue
    cls=r['class'] or 'village'
    els.append({'type':'node','id':2*10**12+len(els),'lat':p.y,'lon':p.x,'tags':{'place':cls,'name':r['names']['primary']}})
for r in pq.read_table(D+'land_use.parquet').to_pylist():
    st=dict(r['source_tags'] or [])
    if st.get('amenity') not in ('hospital','school'): continue
    c=wkb.loads(r['geometry']).representative_point()
    if not strict(c.x,c.y): continue
    nm=(r['names'] or {}).get('primary') or st.get('name')
    if not nm: continue
    els.append({'type':'way','id':3*10**12+len(els),'center':{'lat':c.y,'lon':c.x},'tags':{'amenity':st['amenity'],'name':nm}})
cnt={}
for r in pq.read_table(D+'place.parquet').to_pylist():
    cat=r['basic_category']; nm=(r['names'] or {}).get('primary') or ''
    p=wkb.loads(r['geometry'])
    if not strict(p.x,p.y) or (r['confidence'] or 0)<0.5: continue
    tags=None
    if cat=='fire_station' and re.search(r'feuerwehr|feuerwache',nm,re.I) and not re.search(r'verein|jugend|museum|förder',nm,re.I): tags={'amenity':'fire_station','name':nm}
    elif re.search(r'rettungswache|rettungsdienst|notarzt|rettungszentrum',nm,re.I) and cat in ('emergency_or_urgent_care_facility','medical_service','social_or_community_service',None,'fire_station'): tags={'emergency':'ambulance_station','name':nm}
    elif cat=='senior_living_facility' and re.search(r'heim|pflege|senior|stift|haus',nm,re.I): tags={'amenity':'nursing_home','name':nm}
    elif cat=='christian_place_of_worship' and nm: tags={'amenity':'place_of_worship','name':nm}
    if tags:
        cnt[tags.get('amenity') or tags.get('emergency')]=cnt.get(tags.get('amenity') or tags.get('emergency'),0)+1
        els.append({'type':'node','id':4*10**12+len(els),'lat':p.y,'lon':p.x,'tags':tags})
print(cnt)
b=area.bounds
json.dump({'version':0.6,'bbox':{'south':b[1],'west':b[0],'north':b[3],'east':b[2]},'elements':els},open(out,'w'),ensure_ascii=False)
