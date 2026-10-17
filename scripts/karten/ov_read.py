# Liest die gefundenen Zeilengruppen und schreibt die Zeilen im Rechteck als Parquet.
import sys, json, pyarrow as pa, pyarrow.parquet as pq, pyarrow.compute as pc
sys.path.insert(0, __import__('os').path.dirname(__file__))
from ov_meta_lib import RF, BASE
rg=json.load(open(sys.argv[1])); S,W,N,E=map(float,sys.argv[2:6]); out=sys.argv[6]
cols=sys.argv[7].split(',') if len(sys.argv)>7 else None
tabs=[]
for k,groups in rg.items():
    f=pq.ParquetFile(RF(BASE+k))
    if cols is None: print(f.schema_arrow); sys.exit()
    t=f.read_row_groups(groups,columns=cols+['bbox'])
    b=t.column('bbox')
    m=pc.and_(pc.and_(pc.greater_equal(pc.struct_field(b,'xmax'),W),pc.less_equal(pc.struct_field(b,'xmin'),E)),pc.and_(pc.greater_equal(pc.struct_field(b,'ymax'),S),pc.less_equal(pc.struct_field(b,'ymin'),N)))
    tabs.append(t.filter(m)); print(k[-30:],groups,tabs[-1].num_rows,flush=True)
pq.write_table(pa.concat_tables(tabs),out)
