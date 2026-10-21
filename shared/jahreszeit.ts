// Jahreszeit, Tageszeit und Häufigkeit besonderer Lagen; gemeinsam für Server und Oberfläche.

export type Season = 'fruehling' | 'sommer' | 'herbst' | 'winter';

export const SEASONS: Season[] = ['fruehling', 'sommer', 'herbst', 'winter'];

export const SEASON_LABEL: Record<Season, string> = {
  fruehling: 'Frühling',
  sommer: 'Sommer',
  herbst: 'Herbst',
  winter: 'Winter',
};

export const SEASON_ICON: Record<Season, string> = {
  fruehling: '🌱',
  sommer: '☀',
  herbst: '🍂',
  winter: '❄',
};

/** Meteorologische Jahreszeit: Frühling März–Mai, Sommer Juni–August, Herbst September–November, Winter Dezember–Februar */
export function seasonOf(d: Date): Season {
  const m = d.getMonth();
  if (m >= 2 && m <= 4) return 'fruehling';
  if (m >= 5 && m <= 7) return 'sommer';
  if (m >= 8 && m <= 10) return 'herbst';
  return 'winter';
}

/** Monat (0–11) in der Mitte der Jahreszeit */
const MID_MONTH: Record<Season, number> = { fruehling: 3, sommer: 6, herbst: 9, winter: 0 };

/**
 * Datum für den Schichtbeginn in der gewünschten Jahreszeit: das heutige Datum, wenn es schon passt,
 * sonst Mitte der Jahreszeit im selben Jahr mit demselben Wochentag wie heute (Dienstpläne hängen am Wochentag).
 */
export function dateForSeason(today: Date, s: Season): Date {
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (seasonOf(base) === s) return base;
  const mid = new Date(today.getFullYear(), MID_MONTH[s], 15);
  const shift = ((base.getDay() - mid.getDay() + 7) % 7 + 3) % 7 - 3;
  return new Date(mid.getFullYear(), mid.getMonth(), mid.getDate() + shift);
}

export type Haeufigkeit = 'aus' | 'selten' | 'normal' | 'haeufig';

export const HAEUFIGKEITEN: Haeufigkeit[] = ['aus', 'selten', 'normal', 'haeufig'];

export const HAEUFIGKEIT_LABEL: Record<Haeufigkeit, string> = {
  aus: 'aus',
  selten: 'selten (etwa alle 8 Stunden)',
  normal: 'normal (etwa alle 3 Stunden)',
  haeufig: 'häufig (etwa stündlich)',
};

/** Mittlerer Abstand in Spielstunden */
export const HAEUFIGKEIT_STUNDEN: Record<Haeufigkeit, number> = { aus: Infinity, selten: 8, normal: 3, haeufig: 1 };

/** Notrufaufkommen nach Tageszeit (1 = Durchschnitt): nachts ruhig, tagsüber und am frühen Abend viel los */
export function tageszeitFaktor(minuteOfDay: number): number {
  const h = Math.floor(((minuteOfDay % 1440) + 1440) % 1440 / 60);
  if (h < 5) return 0.55;
  if (h < 7) return 0.75;
  if (h < 10) return 1.1;
  if (h < 18) return 1.2;
  if (h < 22) return 1.0;
  return 0.75;
}
