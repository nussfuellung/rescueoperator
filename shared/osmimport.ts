// Import echter Kartendaten aus OpenStreetMap (Overpass-JSON) in ein Szenario.
// Straßen werden zu einem routingfähigen Graphen, Hausnummern zu Adressen,
// Ortsnamen zu Orten, Feuerwehren, Rettungswachen und Kliniken zu Wachen und Krankenhäusern.
import { DEFAULT_STICHWORTE, DEFAULT_VEHICLE_TYPES, SPECIALTIES, orgPrefix } from './catalog';
import { dist, recomputeHouseNumbers, townAt, nearestTown } from './geo';
import type { Address, GeoRef, Hospital, MapObject, Road, RoadNode, RoadType, Scenario, Station, Town, Vec, VehicleTypeId } from './types';

const R = 6378137;

export interface LatLon {
  lat: number;
  lon: number;
}

/** Web-Mercator-Meter (x nach Osten, y nach Norden) */
export function toMercator(p: LatLon): { mx: number; my: number } {
  const lat = Math.max(-85, Math.min(85, p.lat));
  return { mx: (R * p.lon * Math.PI) / 180, my: R * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) };
}

export function fromMercator(mx: number, my: number): LatLon {
  return { lon: (mx / R) * (180 / Math.PI), lat: (2 * Math.atan(Math.exp(my / R)) - Math.PI / 2) * (180 / Math.PI) };
}

/** Lokale Meter -> Web-Mercator. Lokal ist Mercator skaliert mit cos(lat0), damit Kartenkacheln exakt passen */
export function localToMercator(geo: GeoRef, p: Vec): { mx: number; my: number } {
  const k = Math.cos((geo.lat0 * Math.PI) / 180);
  return { mx: geo.mx0 + p.x / k, my: geo.my0 - p.y / k };
}

export function mercatorToLocal(geo: GeoRef, mx: number, my: number): Vec {
  const k = Math.cos((geo.lat0 * Math.PI) / 180);
  return { x: (mx - geo.mx0) * k, y: (geo.my0 - my) * k };
}

export function latLonToLocal(geo: GeoRef, p: LatLon): Vec {
  const m = toMercator(p);
  return mercatorToLocal(geo, m.mx, m.my);
}

export function localToLatLon(geo: GeoRef, p: Vec): LatLon {
  const m = localToMercator(geo, p);
  return fromMercator(m.mx, m.my);
}

/** Begrenzungsrechteck um einen Mittelpunkt (Kilometer Radius) */
export function bboxAround(center: LatLon, radiusKm: number) {
  const dLat = radiusKm / 111.32;
  const dLon = radiusKm / (111.32 * Math.cos((center.lat * Math.PI) / 180));
  return { south: center.lat - dLat, west: center.lon - dLon, north: center.lat + dLat, east: center.lon + dLon };
}

export type BBox = ReturnType<typeof bboxAround>;

const HIGHWAYS =
  'motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link|tertiary|tertiary_link|unclassified|residential|living_street';

/** Overpass-Abfrage für alles, was der Simulator braucht */
export function overpassQuery(b: BBox): string {
  const bb = `${b.south.toFixed(5)},${b.west.toFixed(5)},${b.north.toFixed(5)},${b.east.toFixed(5)}`;
  return `[out:json][timeout:120][maxsize:512000000];
way["highway"~"^(${HIGHWAYS})$"](${bb})->.r;
.r out body;
.r >;
out skel qt;
nwr["addr:housenumber"]["addr:street"](${bb});
out center tags;
node["place"~"^(city|town|village|hamlet|suburb|borough|quarter)$"](${bb});
out body;
(
  nwr["amenity"="fire_station"](${bb});
  nwr["emergency"="ambulance_station"](${bb});
  nwr["amenity"="hospital"](${bb});
  nwr["amenity"="school"](${bb});
  nwr["amenity"="nursing_home"](${bb});
  nwr["social_facility"="nursing_home"](${bb});
  nwr["amenity"="place_of_worship"]["name"](${bb});
);
out center tags;`;
}

interface OsmElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  nodes?: number[];
  tags?: Record<string, string>;
}

export interface OsmImportOptions {
  name: string;
  bbox: BBox;
  /** Für Tests: Zufall ersetzen */
  seed?: number;
}

export interface OsmImportResult {
  scenario: Scenario;
  notes: string[];
}

function roadType(hw: string): RoadType {
  if (hw.startsWith('motorway')) return 'autobahn';
  if (hw.startsWith('trunk') || hw.startsWith('primary')) return 'bundesstrasse';
  if (hw.startsWith('secondary') || hw.startsWith('tertiary')) return 'landstrasse';
  return 'ortsstrasse';
}

const PLACE_RADIUS: Record<string, number> = {
  city: 3500,
  town: 1500,
  borough: 1200,
  suburb: 900,
  quarter: 600,
  village: 700,
  hamlet: 300,
};

/** Abstand eines Punkts zur Geraden a-b (für die Vereinfachung von Straßenverläufen) */
function lineDistance(p: Vec, a: Vec, b: Vec) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l = Math.hypot(dx, dy);
  if (l < 1e-6) return dist(p, a);
  return Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / l;
}

export function importOsm(json: string | { elements: OsmElement[] }, opts: OsmImportOptions): OsmImportResult {
  const data = typeof json === 'string' ? (JSON.parse(json) as { elements: OsmElement[]; remark?: string }) : json;
  const notes: string[] = [];
  if ((data as { remark?: string }).remark) notes.push(`Hinweis vom Kartendienst: ${(data as { remark?: string }).remark}`);
  const elements = data.elements ?? [];

  // Ursprung oben links im Begrenzungsrechteck
  const tl = toMercator({ lat: opts.bbox.north, lon: opts.bbox.west });
  const geo: GeoRef = { lat0: (opts.bbox.north + opts.bbox.south) / 2, mx0: tl.mx, my0: tl.my, bbox: opts.bbox };
  const project = (lat: number, lon: number) => latLonToLocal(geo, { lat, lon });
  const br = project(opts.bbox.south, opts.bbox.east);
  const width = Math.round(br.x);
  const height = Math.round(br.y);

  const osmNodes = new Map<number, Vec>();
  for (const e of elements) if (e.type === 'node' && e.lat !== undefined && e.lon !== undefined) osmNodes.set(e.id, project(e.lat, e.lon));
  const posOf = (e: OsmElement): Vec | null => {
    if (e.lat !== undefined && e.lon !== undefined) return project(e.lat, e.lon);
    if (e.center) return project(e.center.lat, e.center.lon);
    return null;
  };

  // ---------- Orte ----------
  const towns: Town[] = [];
  for (const e of elements) {
    const place = e.tags?.place;
    if (!place || !e.tags?.name || e.type !== 'node') continue;
    const p = posOf(e);
    if (!p) continue;
    towns.push({ id: `t_${e.id}`, name: e.tags.name, x: Math.round(p.x), y: Math.round(p.y), radius: PLACE_RADIUS[place] ?? 600 });
  }
  // Ortsteile mit gleichem Namen wie ein größerer Ort zusammenfassen
  towns.sort((a, b) => b.radius - a.radius);

  // ---------- Straßen ----------
  const ways = elements.filter((e) => e.type === 'way' && e.tags?.highway && e.nodes && new RegExp(`^(${HIGHWAYS})$`).test(e.tags.highway));
  const useCount = new Map<number, number>();
  for (const w of ways)
    w.nodes!.forEach((id, i) => {
      // Endpunkte zählen doppelt, damit sie immer Knoten im Graphen werden
      const add = i === 0 || i === w.nodes!.length - 1 ? 2 : 1;
      useCount.set(id, (useCount.get(id) ?? 0) + add);
    });

  const nodes: RoadNode[] = [];
  const nodeIdx = new Map<number, RoadNode>();
  const getNode = (osmId: number) => {
    let n = nodeIdx.get(osmId);
    if (!n) {
      const p = osmNodes.get(osmId)!;
      n = { id: `n${osmId}`, x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 };
      nodeIdx.set(osmId, n);
      nodes.push(n);
    }
    return n;
  };
  const roads: Road[] = [];
  let unnamed = 0;
  for (const w of ways) {
    const tags = w.tags!;
    const ids = w.nodes!.filter((id) => osmNodes.has(id));
    if (ids.length < 2) continue;
    let type = roadType(tags.highway);
    const ref = tags.ref?.split(';')[0]?.trim();
    let name = tags.name ?? '';
    if (type === 'autobahn' || (!name && ref)) name = ref ?? name;
    if (!name) {
      name = type === 'ortsstrasse' ? 'Zufahrtsweg' : 'Verbindungsstraße';
      unnamed++;
    }
    // Durchgangsstraßen mit Namen innerhalb eines Orts sind Ortsstraßen mit Hausnummern
    if (type !== 'autobahn' && tags.name) {
      const mid = osmNodes.get(ids[Math.floor(ids.length / 2)])!;
      if (townAt(towns, mid)) type = 'ortsstrasse';
    }
    // Zwischenpunkte nur behalten, wo sie für Kreuzungen oder den Verlauf nötig sind
    let anchor = 0;
    for (let i = 1; i < ids.length; i++) {
      const isJunction = (useCount.get(ids[i]) ?? 0) > 1 || i === ids.length - 1;
      let needed = isJunction;
      if (!needed) {
        const a = osmNodes.get(ids[anchor])!;
        const next = osmNodes.get(ids[i + 1])!;
        // Prüfen, ob die Gerade anchor->next alle Punkte dazwischen gut genug trifft
        for (let k = anchor + 1; k <= i; k++) {
          if (lineDistance(osmNodes.get(ids[k])!, a, next) > 6) {
            needed = true;
            break;
          }
        }
        if (dist(a, next) > 400) needed = true;
      }
      if (!needed) continue;
      const a = getNode(ids[anchor]);
      const b = getNode(ids[i]);
      if (a !== b) roads.push({ id: `r${w.id}_${roads.length}`, a: a.id, b: b.id, name, type });
      anchor = i;
    }
  }

  // Nur das größte zusammenhängende Netz behalten (abgeschnittene Stücke am Rand fallen weg)
  const adj = new Map<string, string[]>();
  for (const r of roads) {
    (adj.get(r.a) ?? adj.set(r.a, []).get(r.a)!).push(r.b);
    (adj.get(r.b) ?? adj.set(r.b, []).get(r.b)!).push(r.a);
  }
  const comp = new Map<string, number>();
  const compSize: number[] = [];
  for (const n of nodes) {
    if (comp.has(n.id) || !adj.has(n.id)) continue;
    const c = compSize.length;
    let size = 0;
    const stack = [n.id];
    comp.set(n.id, c);
    while (stack.length) {
      const v = stack.pop()!;
      size++;
      for (const w of adj.get(v) ?? [])
        if (!comp.has(w)) {
          comp.set(w, c);
          stack.push(w);
        }
    }
    compSize.push(size);
  }
  const main = compSize.indexOf(Math.max(...compSize, 0));
  const keptNodes = nodes.filter((n) => comp.get(n.id) === main);
  const keptRoads = roads.filter((r) => comp.get(r.a) === main);
  const dropped = nodes.length - keptNodes.length;
  if (dropped > 0) notes.push(`${dropped} Straßenpunkte ohne Verbindung zum Hauptnetz wurden entfernt.`);
  if (unnamed > 0) notes.push(`${unnamed} Straßen ohne Namen heißen „Zufahrtsweg“ bzw. „Verbindungsstraße“.`);
  if (!keptRoads.length) throw new Error('Im gewählten Gebiet wurden keine Straßen gefunden.');

  // Orte ohne Straßen im Netz (z. B. knapp außerhalb) verwerfen
  const nearNet = (p: Vec, max: number) => keptNodes.some((n) => Math.abs(n.x - p.x) < max && Math.abs(n.y - p.y) < max);
  const keptTowns = towns.filter((t) => nearNet(t, 400));
  if (!keptTowns.length) {
    // Ohne Ortsangaben einen Ort in der Mitte anlegen
    keptTowns.push({ id: 't_mitte', name: opts.name, x: Math.round(width / 2), y: Math.round(height / 2), radius: Math.max(width, height) / 2 });
    notes.push('Keine Ortsnamen gefunden, das ganze Gebiet heißt wie die Leitstelle.');
  }

  // ---------- Adressen ----------
  const addresses: Address[] = [];
  for (const e of elements) {
    const t = e.tags;
    if (!t?.['addr:housenumber'] || !t['addr:street']) continue;
    const p = posOf(e);
    if (!p || p.x < 0 || p.y < 0 || p.x > width || p.y > height) continue;
    const town = t['addr:city'] ?? t['addr:place'] ?? t['addr:suburb'] ?? (townAt(keptTowns, p) ?? nearestTown(keptTowns, p))?.name ?? '';
    for (const nr of t['addr:housenumber'].split(/[;,]/)) {
      const number = nr.trim();
      if (number) addresses.push({ street: t['addr:street'], number, town, x: Math.round(p.x), y: Math.round(p.y) });
    }
  }
  // Orte, die nur in Adressen vorkommen (addr:city), als Ort ergänzen
  const townNames = new Set(keptTowns.map((t) => t.name));
  const byCity = new Map<string, Vec[]>();
  for (const a of addresses) if (!townNames.has(a.town)) (byCity.get(a.town) ?? byCity.set(a.town, []).get(a.town)!).push(a);
  for (const [name, pts] of byCity) {
    if (!name || pts.length < 5) continue;
    const c = { x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length };
    const radius = Math.min(3000, Math.max(300, Math.max(...pts.map((p) => dist(p, c)))));
    keptTowns.push({ id: `t_addr_${keptTowns.length}`, name, x: Math.round(c.x), y: Math.round(c.y), radius: Math.round(radius) });
  }
  keptTowns.sort((a, b) => b.radius - a.radius);

  // Straßen den Orten zuordnen: bevorzugt nach den Adressen an dieser Straße
  const streetTown = new Map<string, Map<string, Vec[]>>();
  for (const a of addresses) {
    const m = streetTown.get(a.street) ?? streetTown.set(a.street, new Map()).get(a.street)!;
    (m.get(a.town) ?? m.set(a.town, []).get(a.town)!).push(a);
  }
  const nodeById = new Map(keptNodes.map((n) => [n.id, n]));
  for (const r of keptRoads) {
    if (r.type !== 'ortsstrasse') continue;
    const a = nodeById.get(r.a)!;
    const b = nodeById.get(r.b)!;
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const cands = streetTown.get(r.name);
    if (cands) {
      let best = '';
      let bestD = Infinity;
      for (const [town, pts] of cands)
        for (const p of pts) {
          const d = dist(p, mid);
          if (d < bestD) {
            bestD = d;
            best = town;
          }
        }
      if (bestD < 1500) {
        r.town = best;
        continue;
      }
    }
    r.town = (townAt(keptTowns, mid) ?? nearestTown(keptTowns, mid))?.name ?? '';
  }

  // ---------- Wachen, Kliniken, Objekte ----------
  const snapToRoad = (p: Vec): Vec => {
    let best = keptNodes[0];
    let bestD = Infinity;
    for (const n of keptNodes) {
      const d = (n.x - p.x) ** 2 + (n.y - p.y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = n;
      }
    }
    // Wache steht neben der Straße, nicht darauf
    return Math.sqrt(bestD) < 80 ? { x: Math.round(p.x), y: Math.round(p.y) } : { x: best.x + 20, y: best.y + 20 };
  };
  const inside = (p: Vec) => p.x >= 0 && p.y >= 0 && p.x <= width && p.y <= height;
  const townOf = (p: Vec) => (townAt(keptTowns, p) ?? nearestTown(keptTowns, p))?.name ?? opts.name;

  const vt = new Map(DEFAULT_VEHICLE_TYPES.map((v) => [v.id, v]));
  const usedCallsigns = new Set<string>();
  const makeVehicles = (place: string, types: VehicleTypeId[]) =>
    types.map((t, i) => {
      const type = vt.get(t)!;
      let k = 1;
      while (usedCallsigns.has(`${orgPrefix(type.org)} ${place} ${type.funkNr}/${k}`)) k++;
      const callsign = `${orgPrefix(type.org)} ${place} ${type.funkNr}/${k}`;
      usedCallsigns.add(callsign);
      return { id: `v_${place.replace(/\W+/g, '')}_${t}_${k}_${i}`, callsign, type: t };
    });

  const stations: Station[] = [];
  const hospitals: Hospital[] = [];
  const objects: MapObject[] = [];
  const largest = keptTowns[0];
  const seenNames = new Set<string>();
  for (const e of elements) {
    const t = e.tags;
    if (!t) continue;
    const p0 = posOf(e);
    if (!p0 || !inside(p0)) continue;
    const key = `${t.amenity ?? t.emergency ?? t.social_facility}|${t.name ?? ''}|${Math.round(p0.x / 200)}|${Math.round(p0.y / 200)}`;
    if (seenNames.has(key)) continue;
    seenNames.add(key);
    const town = townOf(p0);
    if (t.amenity === 'fire_station') {
      const p = snapToRoad(p0);
      const career = /berufsfeuerwehr|feuerwache \d|hauptwache/i.test(t.name ?? '') || (t['fire_station:type'] ?? '') === 'career';
      const isCity = town === largest?.name;
      const types: VehicleTypeId[] = career
        ? ['KDOW', 'ELW', 'HLF', 'HLF', 'DLK', 'RW', 'TLF']
        : isCity && !stations.some((s) => s.kind === 'feuerwache' && s.name.includes(town))
          ? ['ELW', 'HLF', 'LF', 'DLK', 'RW']
          : ['HLF', ...(dist(p, largest ?? p) > 4000 ? ['TLF' as VehicleTypeId] : [])];
      const place = stations.some((s) => s.kind === 'feuerwache' && s.name === `FF ${town}`) ? `${town}-${stations.length}` : town;
      stations.push({
        id: `s_fw_${e.id}`,
        name: career ? t.name ?? `Feuerwache ${town}` : `FF ${place}`,
        kind: 'feuerwache',
        career,
        x: p.x,
        y: p.y,
        vehicles: makeVehicles(place, types),
      });
    } else if (t.emergency === 'ambulance_station') {
      const p = snapToRoad(p0);
      const first = !stations.some((s) => s.kind === 'rettungswache');
      stations.push({
        id: `s_rw_${e.id}`,
        name: t.name ?? `Rettungswache ${town}`,
        kind: 'rettungswache',
        career: true,
        x: p.x,
        y: p.y,
        vehicles: makeVehicles(town, first ? ['RTW', 'RTW', 'NEF', 'KTW'] : ['RTW', 'RTW']),
      });
    } else if (t.amenity === 'hospital') {
      if (!t.name || /tagesklinik|psychiatr|reha/i.test(t.name)) continue;
      const big = /klinikum|universit|uniklinik|zentral/i.test(t.name);
      const p = snapToRoad(p0);
      hospitals.push({
        id: `h_${e.id}`,
        name: t.name,
        x: p.x,
        y: p.y,
        specialties: big ? [...SPECIALTIES] : ['Innere Medizin', 'Chirurgie', 'Unfallchirurgie'],
      });
    } else if (t.name && (t.amenity === 'school' || t.amenity === 'nursing_home' || t.social_facility === 'nursing_home' || t.amenity === 'place_of_worship')) {
      const kind: MapObject['kind'] = t.amenity === 'school' ? 'schule' : t.amenity === 'place_of_worship' ? 'kirche' : 'seniorenheim';
      objects.push({ id: `o_${e.id}`, name: t.name, kind, x: Math.round(p0.x), y: Math.round(p0.y), bma: kind === 'seniorenheim' || (kind === 'schule' && objects.length % 2 === 0) });
    }
  }

  // Fehlendes ergänzen, damit das Szenario spielbar ist
  const center = (town: Town) => snapToRoad({ x: town.x, y: town.y });
  if (!stations.some((s) => s.kind === 'feuerwache')) notes.push('Keine Feuerwehren in den Kartendaten, je Ort wurde eine Freiwillige Feuerwehr ergänzt.');
  for (const town of keptTowns.filter((t) => t.radius >= 700)) {
    if (stations.some((s) => s.kind === 'feuerwache' && dist(s, town) < Math.max(2500, town.radius))) continue;
    const p = center(town);
    stations.push({ id: `s_fw_add_${town.id}`, name: `FF ${town.name}`, kind: 'feuerwache', career: false, x: p.x + 30, y: p.y - 30, vehicles: makeVehicles(town.name, ['HLF']) });
  }
  if (!stations.some((s) => s.vehicles.some((v) => v.type === 'ELW'))) {
    const st = stations.find((s) => s.kind === 'feuerwache' && largest && dist(s, largest) < largest.radius * 1.5) ?? stations.find((s) => s.kind === 'feuerwache');
    st?.vehicles.push(...makeVehicles(st.name.replace(/^FF /, ''), ['ELW', 'DLK', 'RW']));
  }
  if (!stations.some((s) => s.kind === 'rettungswache')) {
    notes.push('Keine Rettungswachen in den Kartendaten, im größten Ort wurde eine ergänzt.');
    const p = center(largest);
    stations.push({ id: 's_rw_add', name: `Rettungswache ${largest.name}`, kind: 'rettungswache', career: true, x: p.x - 30, y: p.y + 30, vehicles: makeVehicles(largest.name, ['RTW', 'RTW', 'NEF', 'KTW']) });
  }
  if (!stations.some((s) => s.vehicles.some((v) => v.type === 'NEF'))) {
    const rw = stations.find((s) => s.kind === 'rettungswache')!;
    rw.vehicles.push(...makeVehicles(rw.name.replace(/^.*Rettungswache /, ''), ['NEF']));
  }
  if (!hospitals.length) {
    notes.push('Kein Krankenhaus im Gebiet, im größten Ort wurde eines ergänzt.');
    const p = center(largest);
    hospitals.push({ id: 'h_add', name: `Klinikum ${largest.name}`, x: p.x + 40, y: p.y + 40, specialties: [...SPECIALTIES] });
  }

  const scenario: Scenario = {
    version: 1,
    id: `scn_osm_${Date.now().toString(36)}`,
    name: opts.name,
    ilsName: `ILS ${opts.name}`,
    width,
    height,
    nodes: keptNodes,
    roads: keptRoads,
    towns: keptTowns,
    stations,
    hospitals,
    objects,
    vehicleTypes: structuredClone(DEFAULT_VEHICLE_TYPES),
    stichworte: structuredClone(DEFAULT_STICHWORTE),
    settings: { callsPerHour: 14, bmaPerHour: 1.5, startClock: 8 * 60 },
    geo,
    addresses,
  };
  recomputeHouseNumbers(scenario);
  notes.unshift(
    `${keptRoads.length} Straßenabschnitte, ${addresses.length} Hausnummern, ${keptTowns.length} Orte, ${stations.length} Wachen, ${hospitals.length} Kliniken übernommen.`,
  );
  return { scenario, notes };
}

/** Nominatim-Suche: Ortsname -> Koordinaten */
export function nominatimUrl(q: string) {
  return `https://nominatim.openstreetmap.org/search?format=json&limit=6&accept-language=de&countrycodes=de,at,ch&q=${encodeURIComponent(q)}`;
}

export interface PlaceHit {
  name: string;
  lat: number;
  lon: number;
}

export function parseNominatim(text: string): PlaceHit[] {
  const arr = JSON.parse(text) as { display_name: string; lat: string; lon: string }[];
  return arr.map((x) => ({ name: x.display_name, lat: Number(x.lat), lon: Number(x.lon) }));
}

export const OVERPASS_URLS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];
