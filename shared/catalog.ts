import type { FmsStatus, Stichwort, VehicleType } from './types';

// Fahrzeugtypen mit bayerischen Funkkenner-Nummern (anpassbar im Editor).
export const DEFAULT_VEHICLE_TYPES: VehicleType[] = [
  { id: 'KDOW', label: 'KdoW', org: 'FW', funkNr: 10, fills: ['KDOW', 'ELW'], speedFactor: 1.1 },
  { id: 'ELW', label: 'ELW 1', org: 'FW', funkNr: 11, fills: ['ELW', 'KDOW'], speedFactor: 1.0 },
  { id: 'TLF', label: 'TLF 4000', org: 'FW', funkNr: 21, fills: ['TLF', 'LF'], speedFactor: 0.85 },
  { id: 'DLK', label: 'DLK 23/12', org: 'FW', funkNr: 30, fills: ['DLK'], speedFactor: 0.85 },
  { id: 'HLF', label: 'HLF 20', org: 'FW', funkNr: 40, fills: ['HLF', 'LF'], speedFactor: 0.9 },
  { id: 'LF', label: 'LF 10', org: 'FW', funkNr: 44, fills: ['LF'], speedFactor: 0.9 },
  { id: 'RW', label: 'RW', org: 'FW', funkNr: 61, fills: ['RW'], speedFactor: 0.85 },
  { id: 'RTW', label: 'RTW', org: 'RD', funkNr: 71, fills: ['RTW', 'KTW'], speedFactor: 1.0, transport: true },
  { id: 'KTW', label: 'KTW', org: 'RD', funkNr: 72, fills: ['KTW'], speedFactor: 1.0, transport: true },
  { id: 'NEF', label: 'NEF', org: 'RD', funkNr: 76, fills: ['NEF'], speedFactor: 1.15 },
];

// Einsatzstichworte angelehnt an die bayerische Alarmierungsbekanntmachung.
export const DEFAULT_STICHWORTE: Stichwort[] = [
  { code: 'RD KTP', label: 'Krankentransport', category: 'RD', aao: { KTW: 1 } },
  { code: 'RD 1', label: 'Notfall ohne Notarzt', category: 'RD', aao: { RTW: 1 } },
  { code: 'RD 2', label: 'Notfall mit Notarzt', category: 'RD', aao: { RTW: 1, NEF: 1 } },
  { code: 'RD MANV', label: 'Mehrere Verletzte', category: 'RD', aao: { RTW: 3, NEF: 1 } },
  { code: 'B 1', label: 'Kleinbrand', category: 'B', aao: { LF: 1 } },
  { code: 'B 2', label: 'Mittelbrand (Pkw, Hecke, Schuppen)', category: 'B', aao: { HLF: 1, LF: 1 } },
  { code: 'B 3', label: 'Brand Wohnung / Gebäude', category: 'B', aao: { ELW: 1, HLF: 2, DLK: 1, RTW: 1 } },
  { code: 'B 4', label: 'Großbrand', category: 'B', aao: { ELW: 1, HLF: 3, DLK: 1, TLF: 1, RTW: 1, NEF: 1 } },
  { code: 'B BMA', label: 'Brandmeldeanlage', category: 'B', aao: { ELW: 1, HLF: 1, DLK: 1 } },
  { code: 'THL 1', label: 'Technische Hilfe klein', category: 'THL', aao: { HLF: 1 } },
  { code: 'THL 2', label: 'Technische Hilfe mittel', category: 'THL', aao: { HLF: 1, RW: 1 } },
  { code: 'THL 3', label: 'VU mit eingeklemmter Person', category: 'THL', aao: { ELW: 1, HLF: 2, RW: 1, RTW: 1, NEF: 1 } },
  { code: 'THL Person', label: 'Person in Notlage / Türöffnung', category: 'THL', aao: { HLF: 1, RTW: 1 } },
  { code: 'SONST', label: 'Sonstiger Einsatz', category: 'SONST', aao: {} },
];

export const SPECIALTIES = [
  'Innere Medizin',
  'Chirurgie',
  'Unfallchirurgie',
  'Kardiologie (HKL)',
  'Stroke Unit',
  'Pädiatrie',
  'Verbrennungen',
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
export function shortCallsign(cs: string): string {
  const m = cs.match(/(\d+\/\d+)\s*$/);
  return m ? m[1] : cs;
}

/** Funkrufname ohne Organisation, für Funkprotokolle: "Florian Würzburg 40/1" -> "Würzburg 40/1" */
export function radioName(cs: string): string {
  return cs.replace(/^(Florian|Rotkreuz|Johannes|Akkon|Sama|Samariter|Kater|Heros|Pelikan)\s+/, '');
}

export function orgPrefix(org: 'FW' | 'RD'): string {
  return org === 'FW' ? 'Florian' : 'Rotkreuz';
}
