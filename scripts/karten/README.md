# Musterleitstelle ILS Würzburg neu erzeugen

Die Straßendaten stammen aus OpenStreetMap, bezogen über die Overture-Maps-Veröffentlichung (Parquet auf S3, ohne Anmeldung). Benötigt: Python 3 mit `pyarrow`, `requests`, `shapely`.

```bash
V=release/2026-09-23.1; B="49.47 9.36 50.25 10.56"
python3 ov_meta.py $V transportation/type=segment $B seg_rg.json && python3 ov_read.py seg_rg.json $B seg.parquet id,names,subtype,class,subclass,connectors,access_restrictions,speed_limits,routes,geometry
python3 ov_meta.py $V divisions/type=division $B division_rg.json && python3 ov_read.py division_rg.json $B division.parquet id,geometry,subtype,class,names,population,local_type,sources
python3 ov_meta.py $V divisions/type=division_area $B da_rg.json && python3 ov_read.py da_rg.json $B division_area.parquet id,geometry,subtype,class,names,division_id
python3 ov_meta.py $V base/type=land_use $B land_use_rg.json && python3 ov_read.py land_use_rg.json $B land_use.parquet id,geometry,names,subtype,class,source_tags,sources
python3 ov_meta.py $V places/type=place $B place_rg.json && python3 ov_read.py place_rg.json $B place.parquet id,geometry,names,basic_category,taxonomy,confidence,addresses,sources
python3 ov2overpass.py wue.json ./
npx esbuild mkwue.ts --bundle --platform=node --outfile=mkwue.cjs && node mkwue.cjs wue.json wue-scn.json
gzip -9 -c wue-scn.json > ../../assets/ils-wuerzburg.json.gz
```
