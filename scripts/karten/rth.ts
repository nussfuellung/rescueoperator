// Christoph 18 (ADAC Luftrettung Ochsenfurt, 7:00 bis Sonnenuntergang) in die Musterleitstelle aufnehmen.
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { DEFAULT_VEHICLE_TYPES } from '../../shared/catalog';
import { latLonToLocal } from '../../shared/osmimport';

const f = new URL('../../assets/ils-wuerzburg.json.gz', import.meta.url);
const scn = JSON.parse(gunzipSync(readFileSync(f)).toString());
for (const t of DEFAULT_VEHICLE_TYPES) if (!scn.vehicleTypes.some((x: { id: string }) => x.id === t.id)) scn.vehicleTypes.push(structuredClone(t));
scn.stations = scn.stations.filter((s: { id: string }) => s.id !== 's_rth_18');
const p = latLonToLocal(scn.geo, { lat: 49.6599729, lon: 10.0869941 });
scn.stations.push({
  id: 's_rth_18',
  name: 'ADAC Luftrettung Ochsenfurt',
  kind: 'rettungswache',
  career: true,
  x: p.x,
  y: p.y,
  tmo: 'rd_wue_l',
  vehicles: [{ id: 'v_rth_18', callsign: 'Christoph 18', type: 'RTH', dienst: [{ von: 420, bis: 1140, sunset: true }] }],
});
writeFileSync(f, gzipSync(JSON.stringify(scn), { level: 9 }));
console.log('Christoph 18 bei', Math.round(p.x), Math.round(p.y));
