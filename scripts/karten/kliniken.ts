// Kliniken der Musterleitstelle mit den Fachbereichen, die die Kliniken auf ihren Webseiten angeben (Stand Oktober 2026),
// und fehlende Häuser (Klinikum Main-Spessart Lohr, Bezirkskrankenhaus Lohr) ergänzen.
// Nicht aufgenommen: Rotkreuzklinik Würzburg (Klinikbetrieb seit 25.03.2026 eingestellt, keine Notaufnahme),
// Theresienklinik (Belegklinik ohne Notaufnahme), Klinik am Greinberg (Kinder- und Jugendpsychiatrie).
// Aufruf: npx tsx scripts/karten/kliniken.ts
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { SPECIALTIES } from '../../shared/catalog';
import { latLonToLocal } from '../../shared/osmimport';
import type { Hospital, Scenario } from '../../shared/types';

const f = new URL('../../assets/ils-wuerzburg.json.gz', import.meta.url);
const scn = JSON.parse(gunzipSync(readFileSync(f)).toString()) as Scenario;

const FACH: Record<string, string[]> = {
  // ukw.de: alle Kliniken außer einem Brandverletztenzentrum (Verbrennungen nur Kinderchirurgie)
  'Universitätsklinikum Würzburg': SPECIALTIES.filter((f) => f !== 'Verbrennungen'),
  // kwm-klinikum.de/ueber-uns/notfall: ZNA Juliusspital für Innere, Chirurgie, Unfallchirurgie, Neurologie;
  // Akut-PTCA rund um die Uhr, zertifizierte Stroke Unit
  Juliusspital: ['Innere Medizin', 'Chirurgie', 'Unfallchirurgie', 'Kardiologie (HKL)', 'Stroke Unit'],
  // Notaufnahme Missioklinik: gynäkologische, geburtshilfliche, urologische und kinderärztliche Notfälle
  'KWM-Missioklinik': ['Pädiatrie', 'Urologie', 'Gynäkologie', 'Geburtshilfe'],
  // Orthopädische Fachklinik, keine Notaufnahme genannt
  'König-Ludwig-Haus': ['Unfallchirurgie'],
  // main-klinik.de: Innere, Allgemein-/Viszeralchirurgie, Orthopädie/Unfallchirurgie, Urologie (Hauptabteilung), HNO;
  // Schlaganfall nur telemedizinisch, Neurochirurgie als Belegabteilung
  'Main-Klinik Ochsenfurt': ['Innere Medizin', 'Chirurgie', 'Unfallchirurgie', 'Urologie', 'HNO'],
  // Webseite in Wartung; Qualitätsbericht 2024: Innere, Allgemeine Chirurgie, Frauenheilkunde, Geburtshilfe
  'Klinik Kitzinger Land': ['Innere Medizin', 'Chirurgie', 'Unfallchirurgie', 'Gynäkologie', 'Geburtshilfe'],
};

/** Neue Häuser: Position aus Koordinaten oder, wenn angegeben, aus der Mitte der Straße in der Karte */
const NEU: { id: string; name: string; lat?: number; lon?: number; street?: string; specialties: string[] }[] = [
  {
    id: 'h_kms_lohr',
    name: 'Klinikum Main-Spessart Lohr',
    lat: 49.99326,
    lon: 9.59166,
    // klinikum-msp.de: HKL rund um die Uhr, zertifizierte Stroke Unit, Urologie als Belegabteilung, keine Geburtshilfe genannt
    specialties: ['Innere Medizin', 'Chirurgie', 'Unfallchirurgie', 'Kardiologie (HKL)', 'Stroke Unit', 'Urologie', 'Gynäkologie', 'Augenheilkunde'],
  },
  // Am Sommerberg 21, 97816 Lohr
  { id: 'h_bkh_lohr', name: 'Bezirkskrankenhaus Lohr', street: 'Am Sommerberg', specialties: ['Psychiatrie'] },
];

for (const h of scn.hospitals) if (FACH[h.name]) h.specialties = FACH[h.name];

const byId = new Map(scn.nodes.map((n) => [n.id, n]));
const nearestNode = (p: { x: number; y: number }, nodes = scn.nodes) =>
  nodes.reduce((best, n) => (Math.hypot(n.x - p.x, n.y - p.y) < Math.hypot(best.x - p.x, best.y - p.y) ? n : best));
for (const n of NEU) {
  scn.hospitals = scn.hospitals.filter((h) => h.id !== n.id);
  const strasse = n.street ? scn.roads.filter((r) => r.name === n.street).flatMap((r) => [byId.get(r.a)!, byId.get(r.b)!]) : [];
  const p = strasse.length
    ? nearestNode({ x: strasse.reduce((s, q) => s + q.x, 0) / strasse.length, y: strasse.reduce((s, q) => s + q.y, 0) / strasse.length }, strasse)
    : nearestNode(latLonToLocal(scn.geo!, { lat: n.lat!, lon: n.lon! }));
  const h: Hospital = { id: n.id, name: n.name, x: Math.round(p.x), y: Math.round(p.y), specialties: n.specialties };
  scn.hospitals.push(h);
}

writeFileSync(f, gzipSync(JSON.stringify(scn), { level: 9 }));
for (const h of scn.hospitals) console.log(h.name.padEnd(32), h.specialties.join(', '));
