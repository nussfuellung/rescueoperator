// Fahrzeugbelegung der Wachen nach bayerischem Muster, Funkrufnamen und TMO-Rufgruppen.
import { DEFAULT_VEHICLE_TYPES } from './catalog';
import { dist, nearestTown } from './geo';
import type { Scenario, Station, TmoGroup, VehicleDef, VehicleTypeId } from './types';

/** Organisationskenner im Funkrufnamen je Hilfsorganisation */
export function rdPrefix(stationName: string): string {
  if (/\bASB\b|samariter/i.test(stationName)) return 'Sama';
  if (/johanniter|\bJUH\b/i.test(stationName)) return 'Johannes';
  if (/malteser|\bMHD\b/i.test(stationName)) return 'Malteser';
  return 'Rotkreuz';
}

/** Ortsname für den Funkrufnamen aus einem Wachennamen ("Freiw. Feuerwehr Wü.-Lengfeld" -> "Lengfeld") */
export function placeOf(name: string, cityNames: string[] = []): string {
  let p = name;
  // Vorsilben können doppelt vorkommen ("FF Freiw. Feuerwehr Astheim")
  for (let i = 0; i < 3; i++) p = p.replace(/^(Freiwillige Feuerwehr|Freiw\.? Feuerwehr|Feuerwehrgerätehaus|Feuerwehrhaus|Feuerwehr|Berufsfeuerwehr|Feuerwache|FF)\s+/i, '');
  p = p
    .replace(/^((BRK|ASB|JUH|MHD|DRK)\s+)?(Rettungswache|RW|Rettungsdienst)\s+/i, '')
    .replace(/^.*\bWache\s+/i, '')
    .replace(/\s+e\.\s?V\.?$/i, '')
    .replace(/^Stadt\s+/i, '')
    .replace(/\s+a\.\s?Main$/i, ' am Main')
    .replace(/\s+Löschzug.*$/i, '')
    .replace(/\s+Feuerwehr$/i, '')
    .trim();
  // Stadtteilwehren: "Wü-Rottenbauer", "Würzburg-Versbach" -> "Rottenbauer"
  const m = p.match(/^([\wäöüÄÖÜß.]+)\.?\s*-\s*(.+)$/);
  if (m) {
    const head = m[1].replace(/\.$/, '').toLowerCase();
    const isCity = cityNames.some((c) => {
      const cl = c.toLowerCase();
      return cl === head || (head.length >= 2 && cl.startsWith(head)) || cl.normalize('NFD').replace(/\p{M}/gu, '') === head;
    });
    if (isCity || /^w[uü]$/i.test(head)) p = m[2].trim();
  }
  return p;
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}

export interface FleetPlan {
  /** Kreisstädte und große Stützpunktwehren mit Vollausstattung */
  tier1?: string[];
  /** Stützpunktwehren */
  tier2?: string[];
  /** Orte mit Drehleiter (zusätzlich zu Stufe 1) */
  dlk?: string[];
  /** Notarztstandorte: Ort -> Anzahl NEF */
  nef?: Record<string, number>;
  /** Rettungswachen mit mehreren RTW und KTW */
  rdBig?: string[];
  /** Anzahl First-Responder-Gruppen bei Feuerwehren fern von Rettungswachen */
  hvo?: number;
}

const TYPES = new Map(DEFAULT_VEHICLE_TYPES.map((t) => [t.id, t]));

/**
 * Belegt alle Wachen neu nach bayerischem Muster: Berufsfeuerwehr, Stützpunktwehren,
 * Ortsteilwehren mit TSF/MLF, Rettungswachen mit RTW/KTW und Notarztstandorte.
 */
export function assignFleet(scn: Scenario, plan: FleetPlan = {}): string[] {
  const notes: string[] = [];
  const bigCities = scn.towns.filter((t) => t.radius >= 1500).map((t) => t.name);
  const townRadius = (place: string) => scn.towns.find((t) => t.name === place)?.radius ?? 0;
  const has = (list: string[] | undefined, place: string) => !!list?.some((x) => x.toLowerCase() === place.toLowerCase());

  // Doppelte Feuerwehren (gleicher Ort, nah beieinander) zusammenführen
  const keep: Station[] = [];
  let merged = 0;
  for (const st of scn.stations) {
    const place = placeOf(st.name, bigCities);
    const dup = keep.find((k) => k.kind === st.kind && k.kind === 'feuerwache' && placeOf(k.name, bigCities) === place && dist(k, st) < 1500);
    if (dup) {
      if (st.career && !dup.career) Object.assign(dup, { name: st.name, career: true, x: st.x, y: st.y });
      merged++;
      continue;
    }
    keep.push(st);
  }
  scn.stations = keep;
  if (merged) notes.push(`${merged} doppelte Feuerwehren zusammengeführt.`);

  const used = new Set<string>();
  let seq = 0;
  const make = (st: Station, prefix: string, place: string, types: VehicleTypeId[]): VehicleDef[] =>
    types.map((t) => {
      const nr = TYPES.get(t)?.funkNr ?? 50;
      let k = 1;
      while (used.has(`${prefix} ${place} ${nr}/${k}`)) k++;
      const callsign = `${prefix} ${place} ${nr}/${k}`;
      used.add(callsign);
      return { id: `v_${st.id}_${seq++}`, callsign, type: t };
    });

  const rw = scn.stations.filter((s) => s.kind === 'rettungswache');
  const maxR = Math.max(1, ...scn.towns.map((t) => t.radius));
  const hasBf = scn.stations.some((s) => s.career && s.kind === 'feuerwache');
  const fwCount: Record<string, number> = {};
  for (const st of scn.stations) {
    const place = placeOf(st.name, bigCities);
    if (st.kind === 'feuerwache') {
      const r = townRadius(place);
      const h = hash(place);
      let tier: 'BF' | 1 | 2 | 3 | 4;
      if (st.career) tier = 'BF';
      else if (has(plan.tier1, place)) tier = 1;
      else if (has(plan.tier2, place)) tier = 2;
      else if (plan.tier1) tier = r >= 900 ? 3 : 4;
      // Ohne Plan: nach Ortsgröße, auf kleinen Fantasiekarten relativ zum größten Ort
      else tier = r >= 2500 || (r >= maxR && !hasBf) ? 1 : r >= 1500 || r >= 0.7 * maxR ? 2 : r >= 800 || r >= 0.45 * maxR ? 3 : 4;
      let types: VehicleTypeId[];
      if (tier === 'BF') types = ['KDOW', 'ELW', 'HLF', 'HLF', 'DLK', 'DLK', 'TLF4000', 'RW', 'GWL'];
      else if (tier === 1) types = ['KDOW', 'ELW', 'HLF', 'LF20', 'DLK', 'TLF', 'RW', 'GWL', 'MZF'];
      else if (tier === 2) types = ['MZF', 'HLF', h < 0.5 ? 'LF' : 'TLF', ...(has(plan.dlk, place) || (!plan.dlk && r >= 1800) ? ['DLK'] : [])];
      else if (tier === 3) types = [...(h < 0.6 ? ['MZF'] : []), h < 0.55 ? 'HLF10' : 'LF', ...(h > 0.75 ? ['TSFW'] : [])];
      else types = [h < 0.45 ? 'TSFW' : h < 0.8 ? 'TSF' : 'MLF'];
      if (tier !== 'BF' && has(plan.dlk, place) && !types.includes('DLK')) types.push('DLK');
      fwCount[String(tier)] = (fwCount[String(tier)] ?? 0) + 1;
      st.name = tier === 'BF' ? (/berufsfeuerwehr/i.test(st.name) ? st.name : `Berufsfeuerwehr ${place}`) : `FF ${place}`;
      st.vehicles = make(st, 'Florian', place, types);
    } else {
      const prefix = rdPrefix(st.name);
      const big = has(plan.rdBig, place) || (!plan.rdBig && (townRadius(place) >= 3000 || townRadius(place) >= maxR));
      st.vehicles = make(st, prefix, place, big ? ['RTW', 'RTW', 'KTW', 'KTW'] : ['RTW']);
    }
  }

  // Notarztstandorte
  const nefSites = plan.nef ?? {};
  if (!plan.nef) {
    // Ohne Plan: Wachen nahe einer Klinik, höchstens eine je 5 km
    for (const s of rw) if (scn.hospitals.some((h) => dist(h, s) < 5000)) nefSites[placeOf(s.name, bigCities)] = 1;
  }
  for (const [place, n] of Object.entries(nefSites)) {
    const st = rw.find((s) => placeOf(s.name, bigCities).toLowerCase() === place.toLowerCase());
    if (!st) {
      notes.push(`Notarztstandort ${place}: keine Rettungswache gefunden.`);
      continue;
    }
    st.vehicles.push(...make(st, rdPrefix(st.name), placeOf(st.name, bigCities), Array(n).fill('NEF')));
  }
  if (!scn.stations.some((s) => s.vehicles.some((v) => v.type === 'NEF')) && rw[0])
    rw[0].vehicles.push(...make(rw[0], rdPrefix(rw[0].name), placeOf(rw[0].name, bigCities), ['NEF']));

  // First Responder in Orten weit weg vom Rettungsdienst
  const far = scn.stations
    .filter((s) => s.kind === 'feuerwache' && !s.career)
    .map((s) => ({ s, d: Math.min(...rw.map((r) => dist(r, s))) }))
    .filter((x) => x.d > 9000)
    .sort((a, b) => b.d - a.d)
    .slice(0, plan.hvo ?? 4);
  for (const { s } of far) s.vehicles.push(...make(s, 'Florian', placeOf(s.name, bigCities), ['HVO']));

  // Fahrzeugtypen des Szenarios ergänzen
  for (const t of DEFAULT_VEHICLE_TYPES) {
    const own = scn.vehicleTypes.find((x) => x.id === t.id);
    if (!own) scn.vehicleTypes.push(structuredClone(t));
    else Object.assign(own, { funkNr: t.funkNr, label: t.label, fills: t.fills });
  }
  const total = scn.stations.reduce((n, s) => n + s.vehicles.length, 0);
  notes.push(
    `Fahrzeuge nach bayerischem Muster verteilt: ${total} Fahrzeuge (${fwCount.BF ?? 0} Berufsfeuerwehr, ${fwCount['1'] ?? 0} Stützpunkt groß, ${fwCount['2'] ?? 0} Stützpunkt, ${(fwCount['3'] ?? 0) + (fwCount['4'] ?? 0)} Ortsfeuerwehren).`,
  );
  ensureTmo(scn);
  return notes;
}

/** Kürzel einer Leitstelle für Rufgruppennamen ("ILS Würzburg" -> "WÜR") */
function areaCode(scn: Scenario): string {
  const n = scn.ilsName.replace(/^ILS\s+/i, '').trim() || scn.name;
  return n.slice(0, 3).toUpperCase();
}

/** Legt Standard-Rufgruppen an und weist Wachen ohne Gruppe zu */
export function ensureTmo(scn: Scenario): TmoGroup[] {
  if (!scn.tmoGroups?.length) {
    const k = areaCode(scn);
    scn.tmoGroups = [
      { id: 'rd1', name: `RD ${k} 1`, use: 'RD' },
      { id: 'fw1', name: `FW ${k} 1`, use: 'FW' },
      { id: 'ue1', name: `${k} Ü 1`, use: 'Übergreifend' },
      { id: 'e1', name: `${k} EINS 1`, use: 'Einsatz' },
      { id: 'e2', name: `${k} EINS 2`, use: 'Einsatz' },
      { id: 'e3', name: `${k} EINS 3`, use: 'Einsatz' },
    ];
  }
  const groups = scn.tmoGroups;
  const rd = groups.find((g) => g.use === 'RD') ?? groups[0];
  const fw = groups.find((g) => g.use === 'FW') ?? groups[0];
  for (const s of scn.stations) if (!s.tmo || !groups.some((g) => g.id === s.tmo)) s.tmo = s.kind === 'rettungswache' ? rd.id : fw.id;
  return groups;
}

/** Wachen per nächstgelegenem Kreisort einer Rufgruppe zuordnen */
export function assignTmoBySeeds(scn: Scenario, seeds: { group: string; places: string[] }[], use: 'FW' | 'RD') {
  const pts: { group: string; x: number; y: number }[] = [];
  for (const s of seeds)
    for (const p of s.places) {
      const t = scn.towns.find((x) => x.name === p);
      if (t) pts.push({ group: s.group, x: t.x, y: t.y });
    }
  for (const st of scn.stations) {
    if ((use === 'RD') !== (st.kind === 'rettungswache')) continue;
    let best = pts[0];
    for (const p of pts) if (dist(p, st) < dist(best, st)) best = p;
    if (best) st.tmo = best.group;
  }
}

/** Fahrzeugtyp aus der Fahrzeugkennzahl eines Funkrufnamens */
export function typeFromFunkNr(scn: Scenario, nr: number): VehicleTypeId | undefined {
  return (scn.vehicleTypes.find((t) => t.funkNr === nr) ?? DEFAULT_VEHICLE_TYPES.find((t) => t.funkNr === nr))?.id;
}

const CALLSIGN_RE =
  /\b(Florian|Rotkreuz|Sama|Samariter|Johannes|Akkon|Malteser|Heros|Kater)\s+([A-ZÄÖÜ][\p{L}.\- ]*?)\s+(?:\d{1,2}\/)?(\d{2})\/(\d{1,2})\b/gu;

/**
 * Übernimmt eine eingefügte Fahrzeugliste (z. B. von lstsim.de kopiert). Erkannt werden
 * Funkrufnamen wie "Florian Kitzingen 40/1" oder "Rotkreuz Würzburg 71/3"; der Fahrzeugtyp
 * ergibt sich aus der Kennzahl. Erwähnte Wachen bekommen genau die Fahrzeuge aus der Liste.
 */
export function applyFleetText(scn: Scenario, text: string): string[] {
  const notes: string[] = [];
  const bigCities = scn.towns.filter((t) => t.radius >= 1500).map((t) => t.name);
  const byStation = new Map<Station, VehicleDef[]>();
  const seen = new Set<string>();
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/[^a-z]/g, '');
  let unknownType = 0;
  let created = 0;
  for (const m of text.matchAll(CALLSIGN_RE)) {
    const [, org, placeRaw, nrS, kS] = m;
    const place = placeRaw.trim();
    const nr = Number(nrS);
    const callsign = `${org} ${place} ${nr}/${Number(kS)}`;
    if (seen.has(callsign)) continue;
    seen.add(callsign);
    const type = typeFromFunkNr(scn, nr);
    if (!type) {
      unknownType++;
      continue;
    }
    const isRd = scn.vehicleTypes.find((t) => t.id === type)?.org === 'RD' && org !== 'Florian';
    const kind = isRd ? 'rettungswache' : 'feuerwache';
    const candidates = scn.stations.filter((s) => s.kind === kind && norm(placeOf(s.name, bigCities)) === norm(place));
    let st = candidates.find((s) => !isRd || rdPrefix(s.name) === org) ?? candidates[0];
    if (!st) {
      // Wache fehlt: am Ortsmittelpunkt anlegen
      const town = scn.towns.find((t) => norm(t.name) === norm(place)) ?? scn.towns.find((t) => norm(t.name).includes(norm(place)));
      if (!town) {
        notes.push(`${callsign}: Ort „${place}“ nicht auf der Karte, übersprungen.`);
        continue;
      }
      const orgName = { Rotkreuz: 'BRK', Sama: 'ASB', Samariter: 'ASB', Johannes: 'Johanniter', Akkon: 'Johanniter', Malteser: 'Malteser' }[org] ?? '';
      st = {
        id: `s_imp_${scn.stations.length}`,
        name: isRd ? `${orgName} Rettungswache ${place}`.trim() : `FF ${place}`,
        kind,
        career: isRd,
        x: town.x + (isRd ? -40 : 40),
        y: town.y + 40,
        vehicles: [],
      };
      scn.stations.push(st);
      created++;
    }
    const list = byStation.get(st) ?? [];
    list.push({ id: `v_${st.id}_imp${list.length}`, callsign, type });
    byStation.set(st, list);
  }
  let n = 0;
  for (const [st, list] of byStation) {
    st.vehicles = list;
    n += list.length;
  }
  if (!n) return notes.length ? notes : ['Keine Funkrufnamen erkannt. Erwartet werden Zeilen wie „Florian Kitzingen 40/1“ oder „Rotkreuz Würzburg 71/3“.'];
  notes.unshift(`${n} Fahrzeuge auf ${byStation.size} Wachen übernommen${created ? `, ${created} Wachen neu angelegt` : ''}.`);
  if (unknownType) notes.push(`${unknownType} Funkrufnamen mit unbekannter Kennzahl übersprungen.`);
  ensureTmo(scn);
  return notes;
}

/** Nächster Ort zu einer Wache (für Editor-Hinweise) */
export function stationTown(scn: Scenario, st: Station): string {
  return nearestTown(scn.towns, st)?.name ?? '';
}
