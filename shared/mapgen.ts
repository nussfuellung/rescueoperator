// Prozeduraler Kartengenerator für das simulierte GIS.
import { DEFAULT_STICHWORTE, DEFAULT_VEHICLE_TYPES, SPECIALTIES, orgPrefix } from './catalog';
import { dist, recomputeHouseNumbers } from './geo';
import type {
  Hospital,
  MapObject,
  Road,
  RoadNode,
  RoadType,
  Scenario,
  Station,
  Town,
  Vec,
  VehicleDef,
  VehicleTypeId,
} from './types';

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function newId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

const TOWN_NAMES = [
  'Ammerbach',
  'Oberried',
  'Kleinhaslach',
  'Seefelden',
  'Hohenwart',
  'Unterbrunn',
  'Mooskirchen',
  'Grünbach',
  'Taufenried',
  'Altheiming',
  'Sankt Kolomann',
  'Weidenzell',
  'Rotthalham',
  'Buchenlohe',
];

const STREET_NAMES = [
  'Bahnhofstraße', 'Kirchstraße', 'Schulstraße', 'Dorfstraße', 'Lindenstraße', 'Gartenstraße',
  'Bergstraße', 'Am Anger', 'Mühlweg', 'Ringstraße', 'Birkenweg', 'Feldstraße', 'Wiesenweg',
  'Raiffeisenstraße', 'Ludwigstraße', 'Maximilianstraße', 'Am Bach', 'Sonnenstraße', 'Waldstraße',
  'Kapellenweg', 'Eichenweg', 'Rosenstraße', 'Jahnstraße', 'Goethestraße', 'Schillerstraße',
  'Industriestraße', 'Gewerbering', 'Am Sportplatz', 'Pfarrgasse', 'Brunnenweg', 'Ahornweg',
  'Tulpenweg', 'Fliederstraße', 'Kastanienallee', 'Angerweg', 'Hofmarkstraße', 'Pfarrer-Huber-Straße',
  'Kreuzstraße', 'Steinweg', 'Ulmenweg', 'Am Weiher', 'Leitenweg', 'Bürgermeister-Graf-Straße',
  'Prinzregentenstraße', 'Talstraße', 'Hochfeldstraße', 'Moosweg', 'Am Kellerberg', 'Kirchplatz',
  'Lerchenweg', 'Amselweg', 'Drosselgasse', 'Gutshofstraße', 'Am Mühlbach', 'Heideweg',
];

export interface GenOptions {
  seed: number;
  towns: number;
  name?: string;
  width?: number;
  height?: number;
}

export function generateScenario(opts: GenOptions): Scenario {
  const rng = mulberry32(opts.seed);
  const rand = (a: number, b: number) => a + rng() * (b - a);
  const pick = <T>(arr: T[]) => arr[Math.floor(rng() * arr.length)];
  const shuffle = <T>(arr: T[]) => {
    const c = [...arr];
    for (let i = c.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [c[i], c[j]] = [c[j], c[i]];
    }
    return c;
  };

  const width = opts.width ?? 32000;
  const height = opts.height ?? 24000;
  const nodes: RoadNode[] = [];
  const roads: Road[] = [];
  let nid = 0;
  let rid = 0;
  const addNode = (x: number, y: number) => {
    const n = { id: `n${++nid}`, x: Math.round(x), y: Math.round(y) };
    nodes.push(n);
    return n;
  };
  const addRoad = (a: RoadNode, b: RoadNode, name: string, type: RoadType) => {
    roads.push({ id: `r${++rid}`, a: a.id, b: b.id, name, type });
  };

  // ---------- Orte ----------
  const names = shuffle(TOWN_NAMES);
  const towns: Town[] = [];
  const count = Math.max(2, Math.min(opts.towns, names.length));
  for (let i = 0; i < count; i++) {
    const isCity = i === 0;
    const radius = isCity ? 1700 : rand(550, 1050);
    for (let tries = 0; tries < 400; tries++) {
      const x = isCity ? rand(width * 0.4, width * 0.6) : rand(2200, width - 2200);
      const y = isCity ? rand(height * 0.4, height * 0.6) : rand(2200, height - 2200);
      const ok = towns.every((t) => dist(t, { x, y }) > t.radius + radius + 2800);
      if (ok) {
        towns.push({ id: `t${i + 1}`, name: names[i], x: Math.round(x), y: Math.round(y), radius: Math.round(radius) });
        break;
      }
    }
  }

  // ---------- Ortsstraßen (verzerrtes Raster) ----------
  const townNodes = new Map<string, RoadNode[]>();
  for (const town of towns) {
    const spacing = town.radius > 1200 ? 210 : rand(160, 200);
    const angle = rand(0, Math.PI / 2);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const k = Math.ceil(town.radius / spacing);
    const streetPool = shuffle(STREET_NAMES);
    let sp = 0;
    const rowName = new Map<number, string>();
    const colName = new Map<number, string>();
    const grid = new Map<string, RoadNode>();
    const list: RoadNode[] = [];
    for (let i = -k; i <= k; i++) {
      for (let j = -k; j <= k; j++) {
        const gx = i * spacing;
        const gy = j * spacing;
        if (Math.hypot(gx, gy) > town.radius) continue;
        const jx = gx + rand(-spacing * 0.18, spacing * 0.18);
        const jy = gy + rand(-spacing * 0.18, spacing * 0.18);
        const n = addNode(town.x + jx * cos - jy * sin, town.y + jx * sin + jy * cos);
        grid.set(`${i}:${j}`, n);
        list.push(n);
      }
    }
    for (let j = -k; j <= k; j++) rowName.set(j, j === 0 ? 'Hauptstraße' : streetPool[sp++ % streetPool.length]);
    for (let i = -k; i <= k; i++) {
      colName.set(i, i === 0 ? (town.radius > 1200 ? 'Marktplatz' : 'Kirchweg') : streetPool[sp++ % streetPool.length]);
    }
    for (let i = -k; i <= k; i++) {
      for (let j = -k; j <= k; j++) {
        const n = grid.get(`${i}:${j}`);
        if (!n) continue;
        const right = grid.get(`${i + 1}:${j}`);
        if (right) addRoad(n, right, rowName.get(j)!, 'ortsstrasse');
        const down = grid.get(`${i}:${j + 1}`);
        // Spalte 0 immer durchgehend, sonst lückenhaft für ein organisches Netz
        if (down && (i === 0 || rng() < 0.55)) addRoad(n, down, colName.get(i)!, 'ortsstrasse');
      }
    }
    townNodes.set(town.id, list);
  }

  // Randknoten eines Ortes in Richtung eines Punktes
  const gateway = (town: Town, toward: Vec): RoadNode => {
    const list = townNodes.get(town.id)!;
    const dir = Math.atan2(toward.y - town.y, toward.x - town.x);
    const target = { x: town.x + Math.cos(dir) * town.radius * 1.2, y: town.y + Math.sin(dir) * town.radius * 1.2 };
    let best = list[0];
    for (const n of list) if (dist(n, target) < dist(best, target)) best = n;
    return best;
  };

  // Überlandstraße mit leichten Kurven
  const connect = (a: RoadNode, b: RoadNode, name: string, type: RoadType) => {
    const len = dist(a, b);
    const segs = Math.max(2, Math.round(len / 550));
    const nx = -(b.y - a.y) / len;
    const ny = (b.x - a.x) / len;
    const amp = rand(150, 450);
    const phase = rand(0, Math.PI * 2);
    let prev = a;
    for (let s = 1; s < segs; s++) {
      const t = s / segs;
      const off = Math.sin(t * Math.PI * 2 + phase) * amp * Math.sin(t * Math.PI);
      const n = addNode(a.x + (b.x - a.x) * t + nx * off, a.y + (b.y - a.y) * t + ny * off);
      addRoad(prev, n, name, type);
      prev = n;
    }
    addRoad(prev, b, name, type);
  };

  // ---------- Verbindungsstraßen: Spannbaum + Zusatzkanten ----------
  const edges: [number, number][] = [];
  const inTree = new Set([0]);
  while (inTree.size < towns.length) {
    let best: [number, number] | null = null;
    let bestD = Infinity;
    for (const i of inTree) {
      for (let j = 0; j < towns.length; j++) {
        if (inTree.has(j)) continue;
        const d = dist(towns[i], towns[j]);
        if (d < bestD) {
          bestD = d;
          best = [i, j];
        }
      }
    }
    edges.push(best!);
    inTree.add(best![1]);
  }
  for (let i = 0; i < towns.length; i++) {
    const sorted = towns
      .map((t, j) => [j, dist(towns[i], t)] as const)
      .filter(([j]) => j !== i)
      .sort((x, y) => x[1] - y[1]);
    const cand = sorted[1];
    if (cand && cand[1] < 13000 && !edges.some(([a, b]) => (a === i && b === cand[0]) || (b === i && a === cand[0]))) {
      edges.push([i, cand[0]]);
    }
  }
  const usedNumbers = new Set<string>();
  edges.forEach(([i, j], idx) => {
    const a = towns[i];
    const b = towns[j];
    let name: string;
    let type: RoadType;
    if (idx % 4 === 0) {
      name = `B ${pick([12, 15, 16, 20, 299, 300, 388])}`;
      type = 'bundesstrasse';
    } else if (idx % 2 === 0) {
      name = `St ${2000 + Math.floor(rand(10, 400))}`;
      type = 'landstrasse';
    } else {
      name = `ML ${Math.floor(rand(1, 40))}`;
      type = 'landstrasse';
    }
    if (usedNumbers.has(name)) name = `${name.split(' ')[0]} ${Math.floor(rand(1, 99))}`;
    usedNumbers.add(name);
    connect(gateway(a, b), gateway(b, a), name, type);
  });

  // ---------- Autobahn von West nach Ost ----------
  const ay = rand(height * 0.25, height * 0.75);
  const aNodes: RoadNode[] = [];
  const steps = Math.round(width / 900);
  for (let s = 0; s <= steps; s++) {
    const x = (s / steps) * width;
    const y = ay + Math.sin(s / 3) * 600;
    const n = addNode(x, y);
    if (aNodes.length) addRoad(aNodes[aNodes.length - 1], n, 'A 92', 'autobahn');
    aNodes.push(n);
  }
  // Anschlussstellen zu den nächstgelegenen Orten
  const byDistance = [...towns].sort(
    (t1, t2) => Math.abs(t1.y - ay) - Math.abs(t2.y - ay),
  );
  for (const town of byDistance.slice(0, Math.min(3, towns.length))) {
    let best = aNodes[1];
    for (const n of aNodes.slice(1, -1)) if (dist(n, town) < dist(best, town)) best = n;
    connect(best, gateway(town, best), `Zubringer ${town.name}`, 'landstrasse');
  }

  // ---------- Wachen und Fahrzeuge ----------
  const vt = new Map(DEFAULT_VEHICLE_TYPES.map((v) => [v.id, v]));
  const stations: Station[] = [];
  const nearCenter = (town: Town, offset: number): Vec => {
    const list = townNodes.get(town.id)!;
    const target = { x: town.x + rand(-offset, offset), y: town.y + rand(-offset, offset) };
    let best = list[0];
    for (const n of list) if (dist(n, target) < dist(best, target)) best = n;
    return { x: best.x + 25, y: best.y + 25 };
  };
  const makeVehicles = (town: Town, types: VehicleTypeId[]): VehicleDef[] => {
    const counter = new Map<string, number>();
    return types.map((t) => {
      const type = vt.get(t)!;
      const k = (counter.get(t) ?? 0) + 1;
      counter.set(t, k);
      return { id: newIdSeeded('v', rng), callsign: `${orgPrefix(type.org)} ${town.name} ${type.funkNr}/${k}`, type: t };
    });
  };
  towns.forEach((town, i) => {
    let types: VehicleTypeId[];
    if (i === 0) types = ['KDOW', 'ELW', 'HLF', 'HLF', 'LF', 'TLF', 'DLK', 'RW'];
    else if (town.radius > 850) types = ['HLF', 'LF', ...(rng() < 0.5 ? ['DLK'] : ['TLF'])];
    else types = [rng() < 0.6 ? 'HLF' : 'LF', ...(rng() < 0.3 ? ['TLF'] : [])];
    const p = nearCenter(town, town.radius * 0.3);
    stations.push({
      id: `s_fw_${town.id}`,
      name: `FF ${town.name}`,
      kind: 'feuerwache',
      career: i === 0,
      x: p.x,
      y: p.y,
      vehicles: makeVehicles(town, types),
    });
  });
  // Zweite Drehleiter und Rüstwagen außerhalb der Kreisstadt, damit Nachalarmierung Sinn ergibt
  const farthest = [...towns.slice(1)].sort((a, b) => dist(b, towns[0]) - dist(a, towns[0]));
  if (farthest[0]) {
    const st = stations.find((s) => s.id === `s_fw_${farthest[0].id}`)!;
    if (!st.vehicles.some((v) => v.type === 'HLF')) st.vehicles.push(...makeVehicles(farthest[0], ['HLF']));
    st.vehicles.push(...makeVehicles(farthest[0], ['RW', 'ELW']));
  }
  // Rettungswachen
  const rwTowns = [towns[0], ...farthest.slice(0, 3)];
  rwTowns.forEach((town, i) => {
    const types: VehicleTypeId[] =
      i === 0 ? ['RTW', 'RTW', 'RTW', 'NEF', 'KTW', 'KTW'] : i === 1 ? ['RTW', 'RTW', 'NEF'] : i === 2 ? ['RTW', 'RTW', 'NEF'] : ['RTW'];
    const p = nearCenter(town, town.radius * 0.5);
    stations.push({
      id: `s_rw_${town.id}`,
      name: `BRK Rettungswache ${town.name}`,
      kind: 'rettungswache',
      career: true,
      x: p.x + 30,
      y: p.y - 40,
      vehicles: makeVehicles(town, types),
    });
  });

  // ---------- Kliniken ----------
  const hospitals: Hospital[] = [];
  const cityP = nearCenter(towns[0], towns[0].radius * 0.6);
  hospitals.push({
    id: 'h1',
    name: `Klinikum ${towns[0].name}`,
    x: cityP.x,
    y: cityP.y,
    specialties: ['Innere Medizin', 'Chirurgie', 'Unfallchirurgie', 'Kardiologie (HKL)', 'Stroke Unit', 'Pädiatrie'],
  });
  if (farthest[1]) {
    const p = nearCenter(farthest[1], farthest[1].radius * 0.5);
    hospitals.push({ id: 'h2', name: `Kreisklinik ${farthest[1].name}`, x: p.x, y: p.y, specialties: ['Innere Medizin', 'Chirurgie'] });
  }
  const east = aNodes[aNodes.length - 1];
  hospitals.push({
    id: 'h3',
    name: 'Universitätsklinikum (außerhalb, über A 92)',
    x: east.x - 60,
    y: east.y + 60,
    specialties: [...SPECIALTIES],
  });

  // ---------- Objekte ----------
  const objects: MapObject[] = [];
  const objTemplates: { kind: MapObject['kind']; name: (t: Town) => string; bma: boolean }[] = [
    { kind: 'seniorenheim', name: (t) => `Seniorenheim St. ${pick(['Josef', 'Anna', 'Elisabeth', 'Martin'])} ${t.name}`, bma: true },
    { kind: 'schule', name: (t) => `Grund- und Mittelschule ${t.name}`, bma: false },
    { kind: 'gewerbe', name: () => `${pick(['Metallbau', 'Schreinerei', 'Kunststoffwerk', 'Holzbau', 'Brauerei'])} ${pick(['Huber', 'Maier', 'Gruber', 'Bauer', 'Wimmer'])} GmbH`, bma: true },
    { kind: 'kirche', name: () => `Pfarrkirche St. ${pick(['Michael', 'Georg', 'Laurentius', 'Peter und Paul'])}`, bma: false },
  ];
  towns.forEach((town, i) => {
    const n = i === 0 ? 4 : Math.floor(rand(1, 3.5));
    shuffle(objTemplates)
      .slice(0, n)
      .forEach((tpl, k) => {
        const p = nearCenter(town, town.radius * 0.7);
        objects.push({
          id: `o_${town.id}_${k}`,
          name: tpl.name(town),
          kind: tpl.kind,
          x: p.x - 30,
          y: p.y + 20,
          bma: tpl.bma || (i === 0 && tpl.kind === 'schule'),
        });
      });
  });

  const scn: Scenario = {
    version: 1,
    id: `scn_${opts.seed}`,
    name: opts.name ?? 'Musterland',
    ilsName: `ILS ${opts.name ?? 'Musterland'}`,
    width,
    height,
    nodes,
    roads,
    towns,
    stations,
    hospitals,
    objects,
    vehicleTypes: structuredClone(DEFAULT_VEHICLE_TYPES),
    stichworte: structuredClone(DEFAULT_STICHWORTE),
    settings: { callsPerHour: 14, bmaPerHour: 1.5, startClock: 8 * 60 },
  };
  recomputeHouseNumbers(scn);
  return scn;
}

function newIdSeeded(prefix: string, rng: () => number) {
  return `${prefix}_${Math.floor(rng() * 1e9).toString(36)}`;
}

export function emptyScenario(name: string): Scenario {
  return {
    version: 1,
    id: newId('scn'),
    name,
    ilsName: `ILS ${name}`,
    width: 20000,
    height: 15000,
    nodes: [],
    roads: [],
    towns: [],
    stations: [],
    hospitals: [],
    objects: [],
    vehicleTypes: structuredClone(DEFAULT_VEHICLE_TYPES),
    stichworte: structuredClone(DEFAULT_STICHWORTE),
    settings: { callsPerHour: 14, bmaPerHour: 1.5, startClock: 8 * 60 },
  };
}

/** Prüft ein Szenario auf typische Fehler, bevor es gespielt wird */
export function validateScenario(scn: Scenario): string[] {
  const problems: string[] = [];
  if (scn.towns.length === 0) problems.push('Es gibt keinen Ort.');
  if (scn.roads.length === 0) problems.push('Es gibt keine Straßen.');
  if (!scn.stations.some((s) => s.vehicles.some((v) => scn.vehicleTypes.find((t) => t.id === v.type)?.org === 'RD')))
    problems.push('Es gibt kein Rettungsdienstfahrzeug.');
  if (!scn.stations.some((s) => s.vehicles.some((v) => scn.vehicleTypes.find((t) => t.id === v.type)?.org === 'FW')))
    problems.push('Es gibt kein Feuerwehrfahrzeug.');
  if (scn.hospitals.length === 0) problems.push('Es gibt kein Krankenhaus.');
  const callsigns = new Set<string>();
  const ids = new Set<string>();
  for (const s of scn.stations)
    for (const v of s.vehicles) {
      // Wechselnde Standorte mit Schichtplan (z. B. NEF in geraden/ungeraden Wochen) dürfen den Rufnamen teilen
      if (callsigns.has(v.callsign) && !v.dienst?.length) problems.push(`Funkrufname doppelt: ${v.callsign}`);
      callsigns.add(v.callsign);
      if (ids.has(v.id)) problems.push(`Fahrzeug-ID doppelt: ${v.id} (${v.callsign})`);
      ids.add(v.id);
      if (!scn.vehicleTypes.some((t) => t.id === v.type)) problems.push(`Unbekannter Fahrzeugtyp ${v.type} bei ${v.callsign}`);
    }
  // Erreichbarkeit: alle Wachen im selben Netz wie die erste Wache
  const nodeIds = new Set(scn.nodes.map((n) => n.id));
  for (const r of scn.roads) if (!nodeIds.has(r.a) || !nodeIds.has(r.b)) problems.push(`Straße ${r.name} hat fehlende Knoten.`);
  return problems;
}
