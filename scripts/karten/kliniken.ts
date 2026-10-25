// Kliniken der Musterleitstelle mit den Fachbereichen, die die Kliniken auf ihren Webseiten angeben (Stand Oktober 2026),
// und fehlende Häuser (Klinikum Main-Spessart Lohr, Bezirkskrankenhaus Lohr) sowie die Brandverletztenzentren
// BG Unfallklinik Frankfurt und Sana Klinikum Offenbach (außerhalb des Leitstellenbereichs) ergänzen.
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

/** Neue Häuser: Position aus Koordinaten oder, wenn angegeben, aus der Mitte der Straße in der Karte;
 *  mit beidem der Straßenknoten nächst den Koordinaten (Straßennamen gibt es in mehreren Orten) */
const NEU: { id: string; name: string; lat?: number; lon?: number; street?: string; specialties: string[] }[] = [
  {
    id: 'h_kms_lohr',
    name: 'Klinikum Main-Spessart Lohr',
    // Grafen-von-Rieneck-Straße 5, 97816 Lohr, westlich des Mains (vorher 49.99326/9.59166, das lag in Sendelbach)
    lat: 49.99541,
    lon: 9.5719,
    street: 'Grafen-von-Rieneck-Straße',
    // klinikum-msp.de: HKL rund um die Uhr, zertifizierte Stroke Unit, Urologie als Belegabteilung, keine Geburtshilfe genannt;
    // Augenheilkunde nur Belegarzt, nimmt keine Notfälle
    specialties: ['Innere Medizin', 'Chirurgie', 'Unfallchirurgie', 'Kardiologie (HKL)', 'Stroke Unit', 'Urologie', 'Gynäkologie'],
  },
  // Am Sommerberg 21, 97816 Lohr
  { id: 'h_bkh_lohr', name: 'Bezirkskrankenhaus Lohr', street: 'Am Sommerberg', specialties: ['Psychiatrie'] },
];

/** Schwerbrandverletztenzentren außerhalb der Karte: am westlichen Kartenrand auf der A 3 (wie die Uniklinik in generierten Karten) */
const AUSSERHALB: { id: string; name: string; specialties: string[] }[] = [
  { id: 'h_bgu_frankfurt', name: 'BG Unfallklinik Frankfurt (außerhalb, über A 3)', specialties: ['Verbrennungen'] },
  { id: 'h_offenbach', name: 'Sana Klinikum Offenbach (außerhalb, über A 3)', specialties: ['Verbrennungen'] },
];

for (const h of scn.hospitals) if (FACH[h.name]) h.specialties = FACH[h.name];

const byId = new Map(scn.nodes.map((n) => [n.id, n]));
const nearestNode = (p: { x: number; y: number }, nodes = scn.nodes) =>
  nodes.reduce((best, n) => (Math.hypot(n.x - p.x, n.y - p.y) < Math.hypot(best.x - p.x, best.y - p.y) ? n : best));
for (const n of NEU) {
  scn.hospitals = scn.hospitals.filter((h) => h.id !== n.id);
  const strasse = n.street ? scn.roads.filter((r) => r.name === n.street).flatMap((r) => [byId.get(r.a)!, byId.get(r.b)!]) : [];
  const p = strasse.length && n.lat !== undefined
    ? nearestNode(latLonToLocal(scn.geo!, { lat: n.lat, lon: n.lon! }), strasse)
    : strasse.length
    ? nearestNode({ x: strasse.reduce((s, q) => s + q.x, 0) / strasse.length, y: strasse.reduce((s, q) => s + q.y, 0) / strasse.length }, strasse)
    : nearestNode(latLonToLocal(scn.geo!, { lat: n.lat!, lon: n.lon! }));
  const h: Hospital = { id: n.id, name: n.name, x: Math.round(p.x), y: Math.round(p.y), specialties: n.specialties };
  scn.hospitals.push(h);
}

const a3 = scn.roads.filter((r) => r.type === 'autobahn' && r.name === 'A 3').flatMap((r) => [byId.get(r.a)!, byId.get(r.b)!]);
const west = a3.reduce((best, n) => (n.x < best.x ? n : best));
AUSSERHALB.forEach((k, i) => {
  scn.hospitals = scn.hospitals.filter((h) => h.id !== k.id);
  scn.hospitals.push({ id: k.id, name: k.name, x: Math.round(west.x), y: Math.round(west.y + i * 60), specialties: k.specialties });
});

writeFileSync(f, gzipSync(JSON.stringify(scn), { level: 9 }));
for (const h of scn.hospitals) console.log(h.name.padEnd(32), h.specialties.join(', '));
