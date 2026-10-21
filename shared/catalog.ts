import type { FmsStatus, Stichwort, VehicleType } from './types';

// Fahrzeugtypen mit bayerischen Fahrzeugkennzahlen (Funkrufnamen-Richtlinie, anpassbar im Editor).
export const DEFAULT_VEHICLE_TYPES: VehicleType[] = [
  { id: 'KDOW', label: 'KdoW', org: 'FW', funkNr: 10, fills: ['KDOW', 'ELW'], speedFactor: 1.1 },
  { id: 'MZF', label: 'MZF', org: 'FW', funkNr: 11, fills: ['MZF'], speedFactor: 1.0 },
  { id: 'ELW', label: 'ELW 1', org: 'FW', funkNr: 12, fills: ['ELW', 'KDOW'], speedFactor: 1.0 },
  { id: 'TLF', label: 'TLF 3000', org: 'FW', funkNr: 21, fills: ['TLF', 'LF'], speedFactor: 0.85 },
  { id: 'TLF4000', label: 'TLF 4000', org: 'FW', funkNr: 23, fills: ['TLF', 'LF'], speedFactor: 0.82 },
  { id: 'DLK', label: 'DLK 23/12', org: 'FW', funkNr: 30, fills: ['DLK'], speedFactor: 0.85 },
  { id: 'HLF', label: 'HLF 20', org: 'FW', funkNr: 40, fills: ['HLF', 'LF'], speedFactor: 0.9 },
  { id: 'LF20', label: 'LF 20', org: 'FW', funkNr: 41, fills: ['LF', 'HLF'], speedFactor: 0.9 },
  { id: 'HLF10', label: 'HLF 10', org: 'FW', funkNr: 42, fills: ['HLF', 'LF'], speedFactor: 0.92 },
  { id: 'LF', label: 'LF 10', org: 'FW', funkNr: 43, fills: ['LF'], speedFactor: 0.92 },
  { id: 'TSF', label: 'TSF', org: 'FW', funkNr: 44, fills: ['TSF', 'LF'], speedFactor: 0.95 },
  { id: 'TSFW', label: 'TSF-W', org: 'FW', funkNr: 46, fills: ['TSF', 'LF'], speedFactor: 0.95 },
  { id: 'MLF', label: 'MLF', org: 'FW', funkNr: 47, fills: ['LF', 'TSF'], speedFactor: 0.95 },
  { id: 'GWL', label: 'GW-L2', org: 'FW', funkNr: 56, fills: ['GWL'], speedFactor: 0.85 },
  { id: 'RW', label: 'RW', org: 'FW', funkNr: 61, fills: ['RW'], speedFactor: 0.85 },
  { id: 'RTW', label: 'RTW', org: 'RD', funkNr: 71, fills: ['RTW', 'KTW'], speedFactor: 1.0, transport: true },
  { id: 'KTW', label: 'KTW', org: 'RD', funkNr: 72, fills: ['KTW'], speedFactor: 1.0, transport: true },
  { id: 'NEF', label: 'NEF', org: 'RD', funkNr: 76, fills: ['NEF'], speedFactor: 1.15 },
  { id: 'HVO', label: 'First Responder', org: 'RD', funkNr: 79, fills: ['HVO'], speedFactor: 1.1 },
  { id: 'RTH', label: 'RTH', org: 'RD', funkNr: 0, fills: ['RTH', 'NEF'], speedFactor: 1, air: true },
  { id: 'GWW', label: 'GW-Wasserrettung', org: 'FW', funkNr: 91, fills: ['GWW'], speedFactor: 0.9 },
];

// Einsatzstichworte nach der bayerischen Alarmierungsbekanntmachung (ABek, Anlage zu Nr. 2.1.4).
// Die Mindestanforderungen der ABek (Trupp, Staffel, Gruppe, Löschwasser, Rettungssätze) sind auf Fahrzeugtypen umgelegt.
export const DEFAULT_STICHWORTE: Stichwort[] = [
  { code: 'RD 1', label: 'Notfall ohne Notarzt', category: 'RD', aao: { RTW: 1 } },
  { code: 'RD 2', label: 'Notfall mit Notarzt (vitale Bedrohung)', category: 'RD', aao: { RTW: 1, NEF: 1 } },
  { code: 'RD 3', label: '2 oder 3 Verletzte/Erkrankte', category: 'RD', aao: { RTW: 2, NEF: 1 } },
  { code: 'RD 4', label: '4 oder 5 Verletzte/Erkrankte', category: 'RD', aao: { RTW: 4, NEF: 1 } },
  { code: 'RD 5', label: '6 bis 9 Verletzte/Erkrankte', category: 'RD', aao: { RTW: 5, NEF: 3 } },
  { code: 'RD 2-KIND', label: 'Notfall Kind bis 12 Jahre mit Notarzt', category: 'RD', aao: { RTW: 1, NEF: 1 } },
  { code: 'RD MANV 10 – 15', label: 'MANV 10 bis 15 Verletzte/Erkrankte', category: 'RD', aao: { RTW: 8, NEF: 3, KTW: 2 } },
  { code: 'RD MANV 16 – 25', label: 'MANV 16 bis 25 Verletzte/Erkrankte', category: 'RD', aao: { RTW: 12, NEF: 5, KTW: 4 } },
  { code: 'RD KTP', label: 'Krankentransport', category: 'RD', aao: { KTW: 1 } },
  { code: 'RD KTP/RTW', label: 'Krankentransport mit RTW', category: 'RD', aao: { RTW: 1 } },
  { code: 'B 1', label: 'Kleinbrand', category: 'B', aao: { LF: 1 } },
  { code: 'B 2', label: 'Mittelbrand (Pkw, Schuppen, Freifläche groß)', category: 'B', aao: { HLF: 1, LF: 1 } },
  { code: 'B 2 PERSON', label: 'Mittelbrand, Person in Gefahr', category: 'B', aao: { HLF: 1, LF: 1, RTW: 1 } },
  { code: 'B 3', label: 'Brand im Gebäude', category: 'B', aao: { ELW: 1, HLF: 2, DLK: 1 } },
  { code: 'B 3 PERSON', label: 'Brand im Gebäude, Person in Gefahr', category: 'B', aao: { ELW: 1, HLF: 2, DLK: 1, RTW: 1 } },
  { code: 'B 4', label: 'Großbrand / hohe Personenzahl', category: 'B', aao: { ELW: 1, HLF: 3, LF: 1, DLK: 1, TLF: 1 } },
  { code: 'B 5', label: 'Pflegeheim, Kaufhaus, Krankenhaus', category: 'B', aao: { ELW: 1, HLF: 4, LF: 2, DLK: 2, TLF: 1, RTW: 2, NEF: 1 } },
  { code: 'B 6', label: 'Alarmstufenerhöhung B 6', category: 'B', aao: { ELW: 2, HLF: 5, LF: 3, DLK: 2, TLF: 2, RTW: 2, NEF: 1 } },
  { code: 'B BMA', label: 'Brandmeldeanlage', category: 'B', aao: { ELW: 1, HLF: 1, DLK: 1 } },
  { code: 'B WALD', label: 'Waldbrand groß', category: 'B', aao: { ELW: 1, HLF: 2, LF: 2, TLF: 2 } },
  { code: 'B ELEKTROANLAGE', label: 'Elektroanlage / Trafo', category: 'B', aao: { HLF: 2 } },
  { code: 'B BOOT', label: 'Brand Boot / Yacht', category: 'B', aao: { HLF: 1, GWW: 1 } },
  { code: 'B ZUG', label: 'Brand Zug / Straßenbahn', category: 'B', aao: { ELW: 1, HLF: 3, LF: 1, TLF: 1, RTW: 1 } },
  { code: 'THL 1', label: 'Technische Hilfe klein', category: 'THL', aao: { HLF: 1 } },
  { code: 'THL 2', label: 'VU mehrere Pkw / Lkw ohne Eingeklemmte', category: 'THL', aao: { HLF: 1, RTW: 1 } },
  { code: 'THL 3', label: 'Person eingeklemmt (1–2 Pkw)', category: 'THL', aao: { ELW: 1, HLF: 2, RW: 1, RTW: 1, NEF: 1 } },
  { code: 'THL 4', label: 'Mehrere Pkw oder Lkw, Person eingeklemmt', category: 'THL', aao: { ELW: 1, HLF: 3, RW: 1, RTW: 2, NEF: 1 } },
  { code: 'THL 5', label: 'Massenkarambolage / Bus mit Eingeklemmten', category: 'THL', aao: { ELW: 2, HLF: 4, RW: 2, RTW: 4, NEF: 2 } },
  { code: 'THL P EINGESCHLOSSEN', label: 'Wohnung/Fahrzeug öffnen akut', category: 'THL', aao: { HLF: 1, RTW: 1 } },
  { code: 'THL P AUFZUG', label: 'Aufzug öffnen akut', category: 'THL', aao: { HLF: 1 } },
  { code: 'THL P RETTUNG H / T', label: 'Rettung aus Höhe/Tiefe', category: 'THL', aao: { ELW: 1, HLF: 1, DLK: 1, RTW: 1 } },
  { code: 'THL P STROM', label: 'Stromunfall', category: 'THL', aao: { HLF: 1, RTW: 1, NEF: 1 } },
  { code: 'THL UNWETTER', label: 'Unwetter (Baum, Wasser)', category: 'THL', aao: { LF: 1 } },
  { code: 'THL WASSER', label: 'Wasserrettung', category: 'THL', aao: { HLF: 1, GWW: 1, RTW: 1 } },
  { code: 'THL GROßTIERRETTUNG', label: 'Großtier in Notlage', category: 'THL', aao: { HLF: 1, RW: 1 } },
  { code: 'THL TRAGEHILFE', label: 'Tragehilfe für den RD', category: 'THL', aao: { HLF: 1 } },
  { code: 'THL RETTUNGSKORB', label: 'Drehleiter mit Krankentragenhalterung', category: 'THL', aao: { DLK: 1 } },
  { code: 'THL P ZUG', label: 'Person unter Zug / S-Bahn', category: 'THL', aao: { ELW: 1, HLF: 2, RW: 1, RTW: 1, NEF: 1 } },
  { code: 'THL P STRAßENBAHN', label: 'Person unter Straßenbahn', category: 'THL', aao: { ELW: 1, HLF: 2, RW: 1, RTW: 1, NEF: 1 } },
  { code: 'THL P VERSCHÜTTET', label: 'Person verschüttet / in Silo', category: 'THL', aao: { ELW: 1, HLF: 1, RW: 1, RTW: 1, NEF: 1 } },
  { code: 'THL VU ZUG', label: 'Zugunglück', category: 'THL', aao: { ELW: 1, HLF: 3, RW: 1, TLF: 1, RTW: 2, NEF: 1 } },
  { code: 'THL SCHIENE', label: 'Hilfeleistung Straßenbahn / S-Bahn', category: 'THL', aao: { ELW: 1, HLF: 1 } },
  { code: 'THL GEBÄUDEEINSTURZ', label: 'Gebäude eingestürzt', category: 'THL', aao: { ELW: 1, HLF: 3, RW: 1, RTW: 2, NEF: 1 } },
  { code: 'THL BOMBENFUND', label: 'Bombenfund', category: 'THL', aao: { ELW: 1, HLF: 1 } },
  { code: 'THL BELEUCHTUNG', label: 'Einsatzstelle ausleuchten', category: 'THL', aao: { LF: 1 } },
  { code: 'THL ERKUNDUNG', label: 'Erkundung', category: 'THL', aao: { LF: 1 } },
  { code: 'THL HUBSCHRAUBERLANDUNG', label: 'Hubschrauberlandung sichern', category: 'THL', aao: { LF: 1 } },
  { code: 'THL FIRST RESPONDER', label: 'First Responder / Helfer vor Ort', category: 'THL', aao: { HVO: 1 } },
  { code: 'ABC 1', label: 'Geruch (Gas, Ammoniak, Chlor)', category: 'ABC', aao: { HLF: 1 } },
  { code: 'ABC KRAFTSTOFF', label: 'Auslaufender Kraftstoff', category: 'ABC', aao: { LF: 1 } },
  { code: 'ABC 2', label: 'Gefahrstoff klein / Gasaustritt im Freien', category: 'ABC', aao: { ELW: 1, HLF: 1 } },
  { code: 'ABC 3', label: 'Gefahrstoff groß / Gasaustritt im Gebäude', category: 'ABC', aao: { ELW: 1, HLF: 2, RTW: 1 } },
  { code: 'ABC B', label: 'Brand Tankstelle, Tanklager, Biogas', category: 'ABC', aao: { ELW: 1, HLF: 3, DLK: 1, TLF: 1, RTW: 1 } },
  { code: 'ABC EXPLOSION', label: 'Explosion / Verpuffung', category: 'ABC', aao: { ELW: 1, HLF: 2, RW: 1, RTW: 2, NEF: 1 } },
  { code: 'ABC ÖL LAND', label: 'Ölschaden an Land / Heizöltank', category: 'ABC', aao: { LF: 1 } },
  { code: 'ABC ÖL WASSER', label: 'Öl auf Gewässer', category: 'ABC', aao: { HLF: 1, GWW: 1 } },
  { code: 'ABC GEFAHRSTOFFMELDEANLAGE', label: 'Gefahrstoffmeldeanlage', category: 'ABC', aao: { HLF: 1 } },
  { code: 'SONST', label: 'Sonstiger Einsatz', category: 'SONST', aao: {} },
];

/** Alte Stichworte früherer Versionen -> ABek */
export const STICHWORT_ALIAS: Record<string, string> = {
  'THL Person': 'THL P EINGESCHLOSSEN',
  'RD MANV': 'RD MANV 10 – 15',
  'THL P RETTUNG H/T': 'THL P RETTUNG H / T',
};

/** Fehlende ABek-Stichworte in ältere Leitstellen übernehmen, ohne eigene AAO-Anpassungen zu überschreiben */
export function ensureStichworte(scn: { stichworte: Stichwort[] }): void {
  for (const [old, neu] of Object.entries(STICHWORT_ALIAS)) {
    const sw = scn.stichworte.find((s) => s.code === old);
    if (sw && !scn.stichworte.some((s) => s.code === neu)) sw.code = neu;
  }
  for (const d of DEFAULT_STICHWORTE) if (!scn.stichworte.some((s) => s.code === d.code)) scn.stichworte.push(structuredClone(d));
}

/** "B 3 PERSON" -> "B3 PERSON", so wie es auf dem Alarmdisplay steht */
export function compactStichwort(code: string): string {
  return code.replace(/^B (\d)/, 'B$1');
}

export const SPECIALTIES = [
  'Innere Medizin',
  'Chirurgie',
  'Unfallchirurgie',
  'Kardiologie (HKL)',
  'Stroke Unit',
  'Pädiatrie',
  'Verbrennungen',
  'Urologie',
  'Gynäkologie',
  'Geburtshilfe',
  'HNO',
  'Augenheilkunde',
  'Psychiatrie',
];

export const FMS_TEXT: Record<FmsStatus, string> = {
  0: 'Priorisierter Sprechwunsch',
  1: 'Einsatzbereit über Funk',
  2: 'Einsatzbereit auf Wache',
  3: 'Einsatz übernommen',
  4: 'Am Einsatzort',
  5: 'Sprechwunsch',
  6: 'Nicht einsatzbereit',
  7: 'Patient aufgenommen',
  8: 'Am Transportziel',
  9: 'Fremdanmeldung',
};

export const FMS_COLOR: Record<FmsStatus, string> = {
  0: '#ff2d55',
  1: '#38b000',
  2: '#2d6a4f',
  3: '#f4a100',
  4: '#d00000',
  5: '#ff2d55',
  6: '#6c757d',
  7: '#e76f51',
  8: '#7b2cbf',
  9: '#0077b6',
};

export const ROLE_LABEL = {
  calltaker: 'Calltaker (Notrufabfrage)',
  dispatcher: 'Disponent',
  crew: 'Fahrzeugbesatzung',
  supervisor: 'Schichtführer',
} as const;

/** Bayerische Hilfsfrist Rettungsdienst: 12 Minuten */
export const HILFSFRIST_MS = 12 * 60 * 1000;

export function formatClock(clockStartMin: number, timeMs: number): string {
  const totalSec = Math.floor(clockStartMin * 60 + timeMs / 1000);
  const h = Math.floor(totalSec / 3600) % 24;
  const m = Math.floor(totalSec / 60) % 60;
  const s = totalSec % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function formatDuration(ms: number): string {
  const sec = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Kurzform eines Funkrufnamens, z. B. "40/1" aus "Florian Ammerbach 40/1" */
/** Reisegeschwindigkeit eines Rettungshubschraubers in m/s (ca. 220 km/h) */
export const AIR_SPEED = 61;
/** Zeit vom Alarm bis zum Abheben in Sekunden */
export const AIR_TURNOUT = 150;

export function shortCallsign(cs: string): string {
  const m = cs.match(/(\d+\/\d+)\s*$/);
  return m ? m[1] : cs;
}

/** Funkrufname ohne Organisation, für Funkprotokolle: "Florian Würzburg 40/1" -> "Würzburg 40/1" */
export function radioName(cs: string): string {
  return cs.replace(/^(Florian|Rotkreuz|Johannes|Akkon|Malteser|Sama|Samariter|Kater|Heros|Pelikan)\s+/, '');
}

export function orgPrefix(org: 'FW' | 'RD'): string {
  return org === 'FW' ? 'Florian' : 'Rotkreuz';
}
