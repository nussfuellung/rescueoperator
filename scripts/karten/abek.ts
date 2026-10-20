// Setzt die Stichwortliste der Musterleitstelle auf den ABek-Stand.
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { DEFAULT_STICHWORTE } from '../../shared/catalog';

const f = new URL('../../assets/ils-wuerzburg.json.gz', import.meta.url);
const scn = JSON.parse(gunzipSync(readFileSync(f)).toString());
const types = new Set(scn.vehicleTypes.map((t: { id: string }) => t.id));
scn.stichworte = structuredClone(DEFAULT_STICHWORTE);
const missing = new Set(scn.stichworte.flatMap((s: { aao: Record<string, number> }) => Object.keys(s.aao)).filter((k: string) => !types.has(k) && !scn.vehicleTypes.some((t: { fills: string[] }) => t.fills.includes(k))));
writeFileSync(f, gzipSync(JSON.stringify(scn), { level: 9 }));
console.log('Stichworte', scn.stichworte.length, 'unbekannte AAO-Typen', [...missing]);
