// Import einer Wachen- und Fahrzeugliste im Format von lstsim.de (Wache, Organisation, Koordinaten,
// Fahrzeuge mit Typ, Funkrufname und Dienstzeiten) und Prüfung der Dienstzeiten im Spiel.
import { latLonToLocal } from './osmimport';
import type { Dienstzeit, Scenario, Station, VehicleDef, VehicleTypeId } from './types';
import { dist } from './geo';
import { ensureTmo } from './fleet';
import { DEFAULT_VEHICLE_TYPES } from './catalog';

export interface LstsimVehicle {
  typ: string;
  funk: string;
  dienst: string[];
  id?: string;
}
export interface LstsimStation {
  name: string;
  org: string;
  lat: number;
  lon: number;
  vehicles: LstsimVehicle[];
}

/** Liest die kopierte Liste ein; Zeilen sind durch Tabulatoren getrennt */
export function parseLstsim(text: string): LstsimStation[] {
  const lines = text.replace(/\r/g, '').split('\n');
  const out: LstsimStation[] = [];
  let st: LstsimStation | null = null;
  let veh: LstsimVehicle | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trimEnd();
    const next = lines[i + 1]?.trim() ?? '';
    if (!line.trim()) continue;
    if (next.startsWith('Organisation:')) {
      st = { name: line.trim(), org: '', lat: NaN, lon: NaN, vehicles: [] };
      out.push(st);
      veh = null;
      continue;
    }
    if (!st) continue;
    if (line.startsWith('Organisation:')) {
      st.org = line.split('\t').slice(1).join(' ').trim();
      continue;
    }
    if (line.startsWith('Koordinaten:')) {
      const m = line.match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
      if (m) [st.lat, st.lon] = [Number(m[1]), Number(m[2])];
      continue;
    }
    if (/^Typ\tFunkrufname/.test(line)) continue;
    const cols = line.split('\t');
    if (cols.length >= 2 && cols[1].trim()) {
      veh = { typ: cols[0].trim(), funk: cols[1].trim(), dienst: [] };
      st.vehicles.push(veh);
      const rest = cols.slice(2).map((c) => c.trim()).filter(Boolean);
      for (const r of rest) {
        if (/^\d+$/.test(r)) veh.id = r;
        else veh.dienst.push(r);
      }
      if (veh.id) veh = null;
      continue;
    }
    if (veh) {
      if (/^\d+$/.test(line.trim())) {
        veh.id = line.trim();
        veh = null;
      } else veh.dienst.push(line.trim());
    }
  }
  return out;
}

const TAGE = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

/** "7:00 bis 19:00. Mo, Di. Nur in geraden Kalenderwochen." -> Dienstzeit */
export function parseDienst(s: string): Dienstzeit | null {
  const m = s.match(/^(\d{1,2}):(\d{2})\s+bis\s+(?:(\d{1,2}):(\d{2})|sunset)\.?\s*(.*)$/i);
  if (!m) return null;
  const von = Number(m[1]) * 60 + Number(m[2]);
  // Sonnenuntergang: grob 19:00
  const bis = m[3] !== undefined ? Number(m[3]) * 60 + Number(m[4]) : 19 * 60;
  const rest = m[5];
  const d: Dienstzeit = { von, bis, ...(m[3] === undefined ? { sunset: true } : {}) };
  const tage = TAGE.map((t, i) => (new RegExp(`\\b${t}\\b`).test(rest) ? i : -1)).filter((i) => i >= 0);
  if (tage.length && tage.length < 7) d.tage = tage;
  if (/ungeraden/i.test(rest)) d.kw = 'ungerade';
  else if (/geraden/i.test(rest)) d.kw = 'gerade';
  return d;
}

const ORG: Record<string, string> = {
  RK: 'Rotkreuz',
  JH: 'Johannes',
  AK: 'Akkon',
  SA: 'Sama',
  FL: 'Florian',
  WW: 'Wasserwacht',
  BGW: 'Bergwacht',
  PLK: 'Pelikan',
  RT: 'Rettung',
};

const PLACE: Record<string, string> = {
  'WÜ': 'Würzburg',
  'WÜ-L': 'Würzburg-Land',
  KT: 'Kitzingen',
  MSP: 'Main-Spessart',
  KAR: 'Karlstadt',
  LOH: 'Lohr',
  GEM: 'Gemünden',
  MAR: 'Marktheidenfeld',
  OCH: 'Ochsenfurt',
  ARN: 'Arnstein',
  BGS: 'Burgsinn',
  GIE: 'Giebelstadt',
  VOL: 'Volkach',
  WHD: 'Wiesentheid',
  UETT: 'Uettingen',
  KIST: 'Kist',
  PASTN: 'Partenstein',
  GEIWD: 'Geiselwind',
  NEUST: 'Neustadt',
  OBBRT: 'Obernbreit',
  OBS: 'Obersinn',
  SWACH: 'Schwarzach',
  STF: 'Steinfeld',
  TRIEF: 'Triefenstein',
  FRAM: 'Frammersbach',
  'KÜRN': 'Kürnach',
  SULFD: 'Sulzfeld',
};
const COUNTY = new Set(['MSP', 'WÜ', 'KT', 'WÜ-L']);

/** "RK GEM 76/1 #" -> { org: 'Rotkreuz', code: 'GEM', place: 'Gemünden', nr: '76/1' } */
export function splitFunk(funk: string): { org: string; code: string; place: string; nr: string } | null {
  const clean = funk.replace(/\(.*?\)/g, '').replace(/#/g, '').replace(/\s+/g, ' ').trim();
  const m = clean.match(/^(\S+)\s+(.+?)\s+(\d{1,2}(?:\/\d{1,3}){1,2})$/);
  if (!m) return null;
  const org = ORG[m[1]] ?? m[1];
  const code = m[2];
  return { org, code, place: PLACE[code] ?? code, nr: m[3] };
}

/** Fahrzeugtyp des Spiels zum lstsim-Typ; null = nicht übernehmen */
function mapType(typ: string, nr: string): VehicleTypeId | null {
  switch (typ.toUpperCase()) {
    case 'RTW':
    case 'NAW':
      return 'RTW';
    case 'KTW':
      return 'KTW';
    case 'NEF':
      return 'NEF';
    case 'FR':
      return 'HVO';
    case 'KDOW':
      return 'KDOW';
    case 'ELW':
      return 'ELW';
    case 'DLK':
      return 'DLK';
    case 'HLF':
      return 'HLF';
    case 'RW':
      return 'RW';
    case 'LF':
      return 'LF';
    case 'TLF':
      return 'TLF';
    case 'MZF':
      return 'MZF';
    default:
      return nr.startsWith('91') ? 'GWW' : null;
  }
}

export interface LstsimResult {
  notes: string[];
  stations: number;
  vehicles: number;
}

/**
 * Ersetzt alle Rettungswachen, NEF-Standorte, HvO-Gruppen und die Berufsfeuerwehr durch die Liste.
 * Freiwillige Feuerwehren bleiben erhalten; deren First-Responder-Fahrzeuge kommen dazu.
 */
export function applyLstsim(scn: Scenario, text: string): LstsimResult {
  if (!scn.geo) return { notes: ['Die Liste braucht eine echte Karte (OpenStreetMap-Import) mit Koordinaten.'], stations: 0, vehicles: 0 };
  const list = parseLstsim(text);
  const notes: string[] = [];
  const skipped = { dummy: 0, inaktiv: 0, virtuell: 0, rth: 0, alias: 0, aussen: 0, typ: 0 };
  const bbox = scn.geo.bbox;
  const inBox = (s: LstsimStation) => !bbox || (s.lat >= bbox.south && s.lat <= bbox.north && s.lon >= bbox.west && s.lon <= bbox.east);
  for (const t of DEFAULT_VEHICLE_TYPES) if (!scn.vehicleTypes.some((x) => x.id === t.id)) scn.vehicleTypes.push({ ...t });

  // Bisherige RD-Wachen und Berufsfeuerwehr fallen weg, FF bleiben
  const isBf = (s: Station) => s.kind === 'feuerwache' && s.career;
  const oldFf = scn.stations.filter((s) => s.kind === 'feuerwache' && !s.career);
  for (const s of oldFf) s.vehicles = s.vehicles.filter((v) => v.type !== 'HVO');
  const removed = scn.stations.filter((s) => s.kind === 'rettungswache' || isBf(s)).length;
  const oldBf = scn.stations.find(isBf);
  scn.stations = [...oldFf];

  let seq = 0;
  let vehicles = 0;
  let created = 0;
  for (const s of list) {
    if (/^0\.0\s/.test(s.name) || s.vehicles.every((v) => v.funk === 'Dummy')) {
      skipped.dummy += s.vehicles.length;
      continue;
    }
    if (/^1\.0\s/.test(s.name) && !/BF|Berufsfeuerwehr/.test(s.name + s.org)) {
      // SEG, UG-Rett, Kater: Sonderkräfte ohne festen Standort
      skipped.virtuell += s.vehicles.length;
      continue;
    }
    if (!isFinite(s.lat) || !inBox(s)) {
      skipped.aussen += s.vehicles.length;
      continue;
    }
    const p = latLonToLocal(scn.geo, { lat: s.lat, lon: s.lon });
    const isFw = /feuerwehr/i.test(s.org) || /^FR\s/.test(s.name);
    const career = /Berufsfeuerwehr/i.test(s.org);
    const stationName = s.name.replace(/^\d\.\d\s+/, '').replace(/^FR\s+/, 'FF ').replace(/^RW\s+/, 'Rettungswache ');
    // Feste FF-Wache am selben Ort weiterverwenden
    let st: Station | undefined;
    if (isFw && !career) st = oldFf.filter((f) => dist(f, p) < 1200).sort((a, b) => dist(a, p) - dist(b, p))[0];
    const fresh: VehicleDef[] = [];
    const localCodes = new Set<string>();
    const parsed = s.vehicles.map((v) => ({ v, f: splitFunk(v.funk) }));
    for (const { v, f } of parsed) if (f && !COUNTY.has(f.code) && v.typ !== 'Inaktiv') localCodes.add(`${f.code}:${v.typ}`);
    const byCallsign = new Map<string, VehicleDef>();
    for (const { v, f } of parsed) {
      if (v.typ === 'Inaktiv') {
        skipped.inaktiv++;
        continue;
      }
      if (v.typ === 'RTH' && /^Christoph\s+\S+$/.test(v.funk.trim())) {
        const dienst = v.dienst.map(parseDienst).filter((d): d is Dienstzeit => !!d);
        const def: VehicleDef = { id: `v_lst_${v.id ?? seq}_${seq++}`, callsign: v.funk.trim(), type: 'RTH', ...(dienst.length ? { dienst } : {}) };
        byCallsign.set(def.callsign, def);
        fresh.push(def);
        continue;
      }
      if (v.typ === 'RTH' || /Zubringer\)/.test(v.funk) && /CH\d+/.test(v.funk)) {
        skipped.rth++;
        continue;
      }
      if (!f) {
        skipped.typ++;
        continue;
      }
      // Landkreis-Rufname eines Fahrzeugs, das hier schon unter dem Ortsrufnamen geführt wird ("RK MSP 71/1" neben "RK ARN 71/1")
      if (COUNTY.has(f.code) && [...localCodes].some((k) => k.endsWith(`:${v.typ}`))) {
        skipped.alias++;
        continue;
      }
      const type = mapType(v.typ, f.nr);
      if (!type) {
        skipped.typ++;
        continue;
      }
      const callsign = `${f.org} ${f.place} ${f.nr}`;
      const dienst = v.dienst.map(parseDienst).filter((d): d is Dienstzeit => !!d);
      // Gleicher Rufname zweimal an einer Wache (Tag- und Nachtschicht): Schichten zusammenlegen
      const same = byCallsign.get(callsign);
      if (same) {
        if (same.dienst && dienst.length) same.dienst.push(...dienst);
        else same.dienst = undefined;
        continue;
      }
      const def: VehicleDef = { id: `v_lst_${v.id ?? seq}_${seq++}`, callsign, type, ...(dienst.length ? { dienst } : {}) };
      byCallsign.set(callsign, def);
      fresh.push(def);
    }
    if (!fresh.length) continue;
    if (st) {
      // Das First-Responder-Fahrzeug einer FF ist meist ihr MZF/TSF mit gleichem Rufnamen: Typ umstellen statt doppelt anlegen
      for (const def of fresh) {
        const same = st.vehicles.find((v) => v.callsign === def.callsign);
        if (same) same.type = def.type;
        else {
          st.vehicles.push(def);
          vehicles++;
        }
      }
    } else {
      st = {
        id: `s_lst_${created++}`,
        name: stationName,
        kind: isFw ? 'feuerwache' : 'rettungswache',
        career: career || (!isFw && fresh.some((v) => v.type === 'RTW' || v.type === 'NEF' || v.type === 'KTW')),
        x: p.x,
        y: p.y,
        vehicles: fresh,
        tmo: career ? oldBf?.tmo : undefined,
      };
      scn.stations.push(st);
      vehicles += fresh.length;
    }
  }
  // TMO-Gruppen für neue Wachen
  for (const st of scn.stations) if (st.tmo && !scn.tmoGroups?.some((g) => g.id === st.tmo)) st.tmo = undefined;
  ensureTmo(scn);
  notes.push(`${vehicles} Fahrzeuge auf ${created} neuen Wachen übernommen, ${removed} bisherige Rettungswachen und Berufsfeuerwehr ersetzt.`);
  const sk: string[] = [];
  if (skipped.alias) sk.push(`${skipped.alias} doppelte Landkreis-Rufnamen`);
  if (skipped.inaktiv) sk.push(`${skipped.inaktiv} inaktive Fahrzeuge (ELRD, OrgL, LNA, Bereitschaften)`);
  if (skipped.virtuell) sk.push(`${skipped.virtuell} SEG/UG-Rett/Kater-Einheiten ohne festen Standort`);
  if (skipped.dummy) sk.push(`${skipped.dummy} Absicherungs-Platzhalter`);
  if (skipped.rth) sk.push(`${skipped.rth} Hubschrauber bzw. RTH-Zubringer (gibt es im Spiel noch nicht)`);
  if (skipped.aussen) sk.push(`${skipped.aussen} Fahrzeuge außerhalb der Karte`);
  if (skipped.typ) sk.push(`${skipped.typ} Fahrzeuge mit unbekanntem Typ`);
  if (sk.length) notes.push(`Nicht übernommen: ${sk.join(', ')}.`);
  return { notes, stations: created, vehicles };
}

/** ISO-Kalenderwoche eines Datums */
export function isoWeek(d: Date): number {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = (t.getUTCDay() + 6) % 7;
  t.setUTCDate(t.getUTCDate() - day + 3);
  const firstThu = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((t.getTime() - firstThu.getTime()) / 86400000 - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7);
}

/** Sonnenuntergang in Minuten nach Mitternacht (mitteleuropäische Zeit mit Sommerzeit), für Unterfranken */
export function sunsetMinute(date: Date, lat = 49.8, lon = 9.95): number {
  const y = date.getFullYear();
  const n = Math.round((Date.UTC(y, date.getMonth(), date.getDate()) - Date.UTC(y, 0, 0)) / 86400000);
  const rad = Math.PI / 180;
  const decl = -23.44 * Math.cos(((2 * Math.PI) / 365) * (n + 10));
  const b = ((2 * Math.PI) / 365) * (n - 81);
  const eot = 9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b);
  const cosH = (Math.sin(-0.833 * rad) - Math.sin(lat * rad) * Math.sin(decl * rad)) / (Math.cos(lat * rad) * Math.cos(decl * rad));
  const h = Math.acos(Math.max(-1, Math.min(1, cosH))) / rad;
  const utc = 720 - 4 * lon - eot + 4 * h;
  // Sommerzeit vom letzten Sonntag im März bis zum letzten Sonntag im Oktober
  const lastSun = (mo: number) => {
    const d = new Date(Date.UTC(y, mo + 1, 0));
    return d.getUTCDate() - d.getUTCDay();
  };
  const mo = date.getMonth();
  const dd = date.getDate();
  const dst = (mo > 2 && mo < 9) || (mo === 2 && dd >= lastSun(2)) || (mo === 9 && dd < lastSun(9));
  return Math.round(utc + (dst ? 120 : 60));
}

/** Ist das Fahrzeug zur Minute `minute` (seit Mitternacht des Starttages `start`) im Dienst? */
export function inDienst(dienst: Dienstzeit[] | undefined, start: Date, minute: number): boolean {
  if (!dienst?.length) return true;
  const day = Math.floor(minute / 1440);
  const m = minute - day * 1440;
  const dayOk = (offset: number, d: Dienstzeit) => {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + offset);
    const wd = (date.getDay() + 6) % 7;
    if (d.tage && !d.tage.includes(wd)) return false;
    if (d.kw) {
      const even = isoWeek(date) % 2 === 0;
      if ((d.kw === 'gerade') !== even) return false;
    }
    return true;
  };
  return dienst.some((d) => {
    if (d.sunset) {
      const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + day);
      return m >= d.von && m < sunsetMinute(date) && dayOk(day, d);
    }
    if (d.von < d.bis) return m >= d.von && m < d.bis && dayOk(day, d);
    return (m >= d.von && dayOk(day, d)) || (m < d.bis && dayOk(day - 1, d));
  });
}

/** Dienstzeiten als kurzer Text für die Oberfläche */
export function dienstText(dienst?: Dienstzeit[]): string {
  if (!dienst?.length) return 'rund um die Uhr';
  const hm = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
  return dienst
    .map((d) => `${hm(d.von)}–${d.sunset ? "Sonnenuntergang" : hm(d.bis)}${d.tage ? ' ' + d.tage.map((t) => TAGE[t]).join(',') : ''}${d.kw ? ` (${d.kw} KW)` : ''}`)
    .join(' · ');
}
