// IVENA-Regeln, die Server und Oberfläche gleich auswerten: Voranmeldung bei Tracerdiagnosen und Aufnahmepflicht.
import { decodePzc, zielFach } from './pzc';
import type { Hospital, Vec } from './types';

/** Tracerdiagnosen mit Notfallversorgung, die die Leitstelle in der Zielklinik voranmeldet */
const TRACER: [RegExp, string][] = [
  [/^13[134]$/, 'Schockraum'],
  [/^132$/, 'Herzkatheterlabor'],
  [/^21[123]$|^221$|^231$|^241$|^251$|^261$|^281$|^283$|^29[13]$/, 'Schockraum'],
  [/^332$|^346$/, 'Herzkatheterlabor'],
  [/^421$/, 'Stroke Unit'],
];

/** Art der Voranmeldung für einen PZC, oder undefined, wenn keine nötig ist */
export function voranmeldungFuer(pzc: string | undefined): string | undefined {
  const d = pzc ? decodePzc(pzc) : undefined;
  if (!d || d.dringlichkeit !== '1') return undefined;
  const rmi = d.pzc.slice(0, 3);
  return TRACER.find(([re]) => re.test(rmi))?.[1];
}

/** So viel weiter muss die nächste aufnahmebereite Klinik sein, damit die Aufnahmepflicht greift */
export const AUFNAHMEPFLICHT_KM = 10;

/** Entfernung zur Klinik in km (Luftlinie); bei Kliniken außerhalb der Karte zählt die Fahrzeit ab dem Kartenrand mit etwa 1 km je Minute */
export function klinikKm(h: Hospital, pos: Vec): number {
  return Math.hypot(h.x - pos.x, h.y - pos.y) / 1000 + (h.ausserhalbMin ?? 0);
}

/**
 * Aufnahmepflicht bei vitaler Bedrohung: Die nächstgelegene Klinik mit dem nötigen Fachbereich muss einen Patienten mit
 * Notfallversorgung (Dringlichkeit 1) auch dann aufnehmen, wenn sie in IVENA abgemeldet hat, sofern die nächste
 * aufnahmebereite Klinik deutlich weiter entfernt ist.
 */
export function aufnahmepflicht(
  pzc: string | undefined,
  pos: Vec,
  h: Hospital,
  hospitals: Hospital[],
  abgemeldet: (hospitalId: string, fach: string) => boolean,
): boolean {
  const d = pzc ? decodePzc(pzc) : undefined;
  if (!d || d.dringlichkeit !== '1') return false;
  const fach = zielFach(d.fach, hospitals);
  if (!h.specialties.includes(fach) || !abgemeldet(h.id, fach)) return false;
  const mit = hospitals.filter((o) => o.specialties.includes(fach));
  const naechste = mit.reduce((a, b) => (klinikKm(b, pos) < klinikKm(a, pos) ? b : a));
  if (naechste.id !== h.id) return false;
  const frei = mit.filter((o) => !abgemeldet(o.id, fach));
  if (!frei.length) return true;
  return Math.min(...frei.map((o) => klinikKm(o, pos))) - klinikKm(h, pos) > AUFNAHMEPFLICHT_KM;
}
