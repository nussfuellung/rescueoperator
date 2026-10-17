// Schlagworte für die Einsatzmaske: Suchbegriff -> Einsatzstichwort (angelehnt an bayerische AAO).

export interface Schlagwort {
  text: string;
  code: string;
}

export const SCHLAGWORTE: Schlagwort[] = [
  { text: 'Reanimation / leblose Person', code: 'RD 2' },
  { text: 'Bewusstlose Person', code: 'RD 2' },
  { text: 'Atemnot', code: 'RD 2' },
  { text: 'Brustschmerz / V. a. Herzinfarkt', code: 'RD 2' },
  { text: 'V. a. Schlaganfall', code: 'RD 2' },
  { text: 'Krampfanfall', code: 'RD 2' },
  { text: 'Unterzucker, nicht ansprechbar', code: 'RD 2' },
  { text: 'Schwere allergische Reaktion', code: 'RD 2' },
  { text: 'Kindernotfall', code: 'RD 2' },
  { text: 'Starke Blutung', code: 'RD 2' },
  { text: 'Sturz aus Höhe', code: 'RD 2' },
  { text: 'Sturz / Verletzung', code: 'RD 1' },
  { text: 'Kollaps, wieder wach', code: 'RD 1' },
  { text: 'Hilflose Person', code: 'RD 1' },
  { text: 'Unterzucker, ansprechbar', code: 'RD 1' },
  { text: 'Akute Schmerzen', code: 'RD 1' },
  { text: 'Sportverletzung', code: 'RD 1' },
  { text: 'Psychischer Ausnahmezustand', code: 'RD 1' },
  { text: 'Krankentransport', code: 'RD KTP' },
  { text: 'Verlegung / Einweisung', code: 'RD KTP' },
  { text: 'Mehrere Verletzte / Busunfall', code: 'RD MANV' },
  { text: 'Mülltonnenbrand', code: 'B 1' },
  { text: 'Kleinbrand im Freien', code: 'B 1' },
  { text: 'Containerbrand klein', code: 'B 1' },
  { text: 'Pkw-Brand', code: 'B 2' },
  { text: 'Heckenbrand / Flächenbrand', code: 'B 2' },
  { text: 'Kaminbrand', code: 'B 2' },
  { text: 'Gartenhaus / Schuppen', code: 'B 2' },
  { text: 'Rauchentwicklung unklar', code: 'B 2' },
  { text: 'Wohnungsbrand', code: 'B 3' },
  { text: 'Küchenbrand', code: 'B 3' },
  { text: 'Kellerbrand', code: 'B 3' },
  { text: 'Brand mit Menschenleben in Gefahr', code: 'B 3' },
  { text: 'Scheunenbrand', code: 'B 4' },
  { text: 'Großbrand / Industrie', code: 'B 4' },
  { text: 'Brandmeldeanlage', code: 'B BMA' },
  { text: 'Ölspur', code: 'THL 1' },
  { text: 'Baum auf Straße', code: 'THL 1' },
  { text: 'Wasserschaden', code: 'THL 1' },
  { text: 'Tier in Notlage', code: 'THL 1' },
  { text: 'VU ohne eingeklemmte Person', code: 'THL 2' },
  { text: 'Auffahrunfall mit Verletzten', code: 'THL 2' },
  { text: 'VU mit eingeklemmter Person', code: 'THL 3' },
  { text: 'VU Autobahn mit Person', code: 'THL 3' },
  { text: 'Türöffnung, Person hilflos', code: 'THL Person' },
  { text: 'Person in Notlage', code: 'THL Person' },
];

/** Schlagworte, die zu einer Eingabe passen (Wortanfänge, ohne Groß/Klein) */
export function searchSchlagworte(q: string, codes?: Set<string>): Schlagwort[] {
  const words = q.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return SCHLAGWORTE.filter((s) => {
    if (codes && !codes.has(s.code)) return false;
    const hay = `${s.text} ${s.code}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  }).slice(0, 8);
}
