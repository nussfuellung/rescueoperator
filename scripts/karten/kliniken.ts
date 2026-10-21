// Kliniken der Musterleitstelle mit ihren Fachbereichen (Stand Qualitätsberichte 2023/2024) und fehlende Häuser
// (Klinikum Main-Spessart Lohr, Bezirkskrankenhaus Lohr) ergänzen.
// Aufruf: npx tsx scripts/karten/kliniken.ts
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { SPECIALTIES } from '../../shared/catalog';
import { latLonToLocal } from '../../shared/osmimport';
import type { Hospital, Scenario } from '../../shared/types';

const f = new URL('../../assets/ils-wuerzburg.json.gz', import.meta.url);
const scn = JSON.parse(gunzipSync(readFileSync(f)).toString()) as Scenario;

const FACH: Record<string, string[]> = {
  'Universitätsklinikum Würzburg': [...SPECIALTIES],
  // Chirurgie und Unfallchirurgie des KWM seit 2017 am Juliusspital, dort auch die Stroke Unit
  Juliusspital: ['Innere Medizin', 'Chirurgie', 'Unfallchirurgie', 'Stroke Unit'],
  'KWM-Missioklinik': ['Innere Medizin', 'Pädiatrie', 'Urologie', 'Gynäkologie', 'Geburtshilfe'],
  'König-Ludwig-Haus': ['Unfallchirurgie', 'Chirurgie'],
  'Main-Klinik Ochsenfurt': ['Innere Medizin', 'Chirurgie', 'Unfallchirurgie', 'Urologie', 'HNO'],
  'Klinik Kitzinger Land': ['Innere Medizin', 'Chirurgie', 'Unfallchirurgie', 'Gynäkologie', 'Geburtshilfe'],
};

const NEU: { id: string; name: string; lat: number; lon: number; specialties: string[] }[] = [
  {
    id: 'h_kms_lohr',
    name: 'Klinikum Main-Spessart Lohr',
    lat: 49.99326,
    lon: 9.59166,
    specialties: ['Innere Medizin', 'Chirurgie', 'Unfallchirurgie', 'Kardiologie (HKL)', 'Stroke Unit', 'Urologie', 'Gynäkologie', 'Augenheilkunde'],
  },
  { id: 'h_bkh_lohr', name: 'Bezirkskrankenhaus Lohr', lat: 49.999, lon: 9.564, specialties: ['Psychiatrie'] },
];

for (const h of scn.hospitals) if (FACH[h.name]) h.specialties = FACH[h.name];

const nearestNode = (p: { x: number; y: number }) =>
  scn.nodes.reduce((best, n) => (Math.hypot(n.x - p.x, n.y - p.y) < Math.hypot(best.x - p.x, best.y - p.y) ? n : best));
for (const n of NEU) {
  scn.hospitals = scn.hospitals.filter((h) => h.id !== n.id);
  const p = nearestNode(latLonToLocal(scn.geo!, { lat: n.lat, lon: n.lon }));
  const h: Hospital = { id: n.id, name: n.name, x: Math.round(p.x), y: Math.round(p.y), specialties: n.specialties };
  scn.hospitals.push(h);
}

writeFileSync(f, gzipSync(JSON.stringify(scn), { level: 9 }));
for (const h of scn.hospitals) console.log(h.name.padEnd(32), h.specialties.join(', '));
