// Simuliertes GIS: Straßengraph, Routing, Hausnummern, Geokodierung.
import type { Address, MapObject, Road, RoadNode, RoadType, Scenario, Town, Vec } from './types';

export const ROAD_SPEED_KMH: Record<RoadType, number> = {
  autobahn: 120,
  bundesstrasse: 90,
  landstrasse: 80,
  ortsstrasse: 45,
};

/** Meter zwischen zwei Hausnummern (pro Straßenseite) */
const HOUSE_SPACING = 24;

export function dist(a: Vec, b: Vec): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

interface Adj {
  to: number;
  road: number;
  len: number;
  time: number;
}

/** Fahrzeit-Annahme je Straße in m/s (ohne Sonderrechte) */
export function roadSpeed(r: Road): number {
  const base = ROAD_SPEED_KMH[r.type];
  // Ausgeschilderte Höchstgeschwindigkeit, innerorts wegen Kreuzungen etwas darunter
  const kmh = r.maxspeed ? Math.min(r.maxspeed, 130) * (r.type === 'ortsstrasse' ? 0.85 : 0.95) : base;
  return Math.max(10, kmh) / 3.6;
}

/** Gegen die Einbahnrichtung: auf Autobahnen und Schnellstraßen nie, sonst nur langsam mit Sonderrechten */
const WRONG_WAY_FACTOR = 4;

/** Vorberechneter Routing-Graph eines Szenarios */
export class RoadGraph {
  readonly nodes: RoadNode[];
  readonly roads: Road[];
  readonly index = new Map<string, number>();
  /** ausgehende Kanten */
  readonly adj: Adj[][];
  /** eingehende Kanten (für Fahrzeiten zu einem Ziel) */
  readonly radj: Adj[][];
  private grid = new Map<string, number[]>();
  private readonly cell = 500;

  constructor(scn: Pick<Scenario, 'nodes' | 'roads'>) {
    this.nodes = scn.nodes;
    this.roads = scn.roads;
    scn.nodes.forEach((n, i) => {
      this.index.set(n.id, i);
      const k = this.key(n.x, n.y);
      const arr = this.grid.get(k);
      if (arr) arr.push(i);
      else this.grid.set(k, [i]);
    });
    this.adj = scn.nodes.map(() => []);
    this.radj = scn.nodes.map(() => []);
    const add = (from: number, to: number, road: number, len: number, time: number) => {
      this.adj[from].push({ to, road, len, time });
      this.radj[to].push({ to: from, road, len, time });
    };
    scn.roads.forEach((r, ri) => {
      const a = this.index.get(r.a);
      const b = this.index.get(r.b);
      if (a === undefined || b === undefined || a === b) return;
      const len = dist(scn.nodes[a], scn.nodes[b]);
      const time = len / roadSpeed(r);
      add(a, b, ri, len, time);
      if (!r.oneway) add(b, a, ri, len, time);
      else if (r.type === 'ortsstrasse' || r.type === 'landstrasse') add(b, a, ri, len, time * WRONG_WAY_FACTOR);
    });
  }

  private key(x: number, y: number) {
    return `${Math.floor(x / this.cell)}:${Math.floor(y / this.cell)}`;
  }

  /** Nächster Knoten, der mit dem Straßennetz verbunden ist */
  nearestNode(p: Vec): number {
    const cx = Math.floor(p.x / this.cell);
    const cy = Math.floor(p.y / this.cell);
    let best = -1;
    let bestD = Infinity;
    for (let r = 0; r < 60; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const arr = this.grid.get(`${cx + dx}:${cy + dy}`);
          if (!arr) continue;
          for (const i of arr) {
            if (this.adj[i].length === 0 && this.radj[i].length === 0) continue;
            const d = dist(p, this.nodes[i]);
            if (d < bestD) {
              bestD = d;
              best = i;
            }
          }
        }
      }
      // Sobald ein Treffer existiert, reicht ein weiterer Ring zur Sicherheit
      if (best >= 0 && bestD < r * this.cell) break;
    }
    return best;
  }

  /** Kompakte Kantenlisten (CSR) für schnelles Routing auf großen Karten */
  private csr(toTarget: boolean) {
    const key = toTarget ? '_csrIn' : '_csrOut';
    const self = this as unknown as Record<string, { off: Int32Array; to: Int32Array; time: Float64Array }>;
    if (!self[key]) {
      const lists = toTarget ? this.radj : this.adj;
      const off = new Int32Array(lists.length + 1);
      lists.forEach((l, i) => (off[i + 1] = off[i] + l.length));
      const to = new Int32Array(off[lists.length]);
      const time = new Float64Array(off[lists.length]);
      lists.forEach((l, i) =>
        l.forEach((e, k) => {
          to[off[i] + k] = e.to;
          time[off[i] + k] = e.time;
        }),
      );
      self[key] = { off, to, time };
    }
    return self[key];
  }

  /**
   * Dijkstra ab einem Knoten; liefert Fahrzeit (s) und Vorgänger.
   * Mit toTarget = true sind es die Fahrzeiten von allen Knoten ZU start (für Anfahrzeiten zum Einsatzort).
   * Mit stopAt endet die Suche, sobald alle diese Knoten feststehen.
   */
  dijkstra(start: number, toTarget = false, stopAt?: Iterable<number>): { time: Float64Array; prev: Int32Array } {
    const { off, to, time: et } = this.csr(toTarget);
    const n = this.nodes.length;
    const time = new Float64Array(n).fill(Infinity);
    const prev = new Int32Array(n).fill(-1);
    if (start < 0) return { time, prev };
    const pending = stopAt ? new Set(stopAt) : null;
    pending?.delete(-1);
    time[start] = 0;
    const heap = new MinHeap();
    heap.push(start, 0);
    while (heap.size) {
      const [u, tu] = heap.pop();
      if (tu > time[u]) continue;
      if (pending) {
        pending.delete(u);
        if (pending.size === 0) break;
      }
      for (let k = off[u]; k < off[u + 1]; k++) {
        const v = to[k];
        const nt = tu + et[k];
        if (nt < time[v]) {
          time[v] = nt;
          prev[v] = u;
          heap.push(v, nt);
        }
      }
    }
    return { time, prev };
  }

  /**
   * Route von a nach b als Punktliste und Fahrzeit in Sekunden (ohne Sonderrechte).
   * times enthält für jeden Punkt die Fahrzeit ab Start, damit Fahrzeuge je Straße unterschiedlich schnell fahren.
   */
  route(from: Vec, to: Vec): { points: Vec[]; times: number[]; seconds: number } | null {
    const s = this.nearestNode(from);
    const t = this.nearestNode(to);
    if (s < 0 || t < 0) return null;
    const { time, prev } = this.dijkstra(s, false, [t]);
    if (!isFinite(time[t])) return null;
    const ids: number[] = [];
    for (let v = t; v !== -1; v = prev[v]) ids.push(v);
    ids.reverse();
    const slow = 30 / 3.6;
    const points: Vec[] = [{ x: from.x, y: from.y }];
    const times: number[] = [0];
    const t0 = dist(from, this.nodes[s]) / slow;
    for (const v of ids) {
      points.push({ x: this.nodes[v].x, y: this.nodes[v].y });
      times.push(t0 + time[v]);
    }
    points.push({ x: to.x, y: to.y });
    times.push(times[times.length - 1] + dist(to, this.nodes[t]) / slow);
    return { points, times, seconds: times[times.length - 1] };
  }
}

class MinHeap {
  private ids = new Int32Array(1024);
  private keys = new Float64Array(1024);
  size = 0;
  push(id: number, key: number) {
    if (this.size === this.ids.length) {
      const ids = new Int32Array(this.size * 2);
      ids.set(this.ids);
      this.ids = ids;
      const keys = new Float64Array(this.size * 2);
      keys.set(this.keys);
      this.keys = keys;
    }
    let i = this.size++;
    const ids = this.ids;
    const keys = this.keys;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (keys[p] <= key) break;
      ids[i] = ids[p];
      keys[i] = keys[p];
      i = p;
    }
    ids[i] = id;
    keys[i] = key;
  }
  pop(): [number, number] {
    const ids = this.ids;
    const keys = this.keys;
    const id = ids[0];
    const key = keys[0];
    const n = --this.size;
    if (n > 0) {
      const lastId = ids[n];
      const lastKey = keys[n];
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        if (l >= n) break;
        const r = l + 1;
        const m = r < n && keys[r] < keys[l] ? r : l;
        if (keys[m] >= lastKey) break;
        ids[i] = ids[m];
        keys[i] = keys[m];
        i = m;
      }
      ids[i] = lastId;
      keys[i] = lastKey;
    }
    return [id, key];
  }
}

export function townAt(towns: Town[], p: Vec): Town | undefined {
  let best: Town | undefined;
  let bestD = Infinity;
  for (const t of towns) {
    const d = dist(t, p);
    if (d <= t.radius && d < bestD) {
      best = t;
      bestD = d;
    }
  }
  return best;
}

export function nearestTown(towns: Town[], p: Vec): Town | undefined {
  let best: Town | undefined;
  let bestD = Infinity;
  for (const t of towns) {
    const d = dist(t, p) - t.radius;
    if (d < bestD) {
      best = t;
      bestD = d;
    }
  }
  return best;
}

/**
 * Ordnet Straßen Orten zu und vergibt Hausnummern entlang zusammenhängender
 * Straßenzüge gleichen Namens. Wird nach jeder Editor-Änderung aufgerufen.
 */
export function recomputeHouseNumbers(scn: Scenario): void {
  const nodeById = new Map(scn.nodes.map((n) => [n.id, n]));
  for (const r of scn.roads) {
    const a = nodeById.get(r.a);
    const b = nodeById.get(r.b);
    if (!a || !b) continue;
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    // Bei echten Karten stammt der Ort aus den Adressdaten und bleibt erhalten
    if (r.type !== 'ortsstrasse') r.town = '';
    else if (!(scn.geo && r.town)) r.town = (townAt(scn.towns, mid) ?? nearestTown(scn.towns, mid))?.name ?? '';
    r.numA = undefined;
    r.numB = undefined;
  }
  const groups = new Map<string, Road[]>();
  for (const r of scn.roads) {
    if (r.type !== 'ortsstrasse') continue;
    const k = `${r.town}|${r.name}`;
    const g = groups.get(k);
    if (g) g.push(r);
    else groups.set(k, [r]);
  }
  for (const roads of groups.values()) {
    const byNode = new Map<string, Road[]>();
    for (const r of roads) {
      for (const n of [r.a, r.b]) {
        const l = byNode.get(n);
        if (l) l.push(r);
        else byNode.set(n, [r]);
      }
    }
    const done = new Set<Road>();
    let counter = 1;
    while (done.size < roads.length) {
      // Startknoten: Straßenende (Grad 1) bevorzugt
      let startNode: string | undefined;
      for (const [n, l] of byNode) {
        if (l.some((r) => !done.has(r)) && l.filter((r) => !done.has(r)).length === 1) {
          startNode = n;
          break;
        }
      }
      if (!startNode) startNode = roads.find((r) => !done.has(r))!.a;
      // Tiefensuche entlang des Straßenzugs
      const stack: [string, number][] = [[startNode, counter]];
      while (stack.length) {
        const [n, num] = stack.pop()!;
        for (const r of byNode.get(n) ?? []) {
          if (done.has(r)) continue;
          done.add(r);
          const other = r.a === n ? r.b : r.a;
          const len = dist(nodeById.get(r.a)!, nodeById.get(r.b)!);
          const end = num + Math.max(2, Math.round(len / HOUSE_SPACING) * 2);
          if (r.a === n) {
            r.numA = num;
            r.numB = end;
          } else {
            r.numB = num;
            r.numA = end;
          }
          counter = Math.max(counter, end + 2);
          stack.push([other, end]);
        }
      }
    }
  }
}

export function projectOnSegment(p: Vec, a: Vec, b: Vec): { t: number; point: Vec; d: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy || 1;
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  const point = { x: a.x + t * dx, y: a.y + t * dy };
  return { t, point, d: dist(p, point) };
}

export interface AddressHit {
  road: Road;
  point: Vec;
  text: string;
  street: string;
  number?: number;
  /** Hausnummer mit Zusatz, z. B. "12a" (nur bei echten Adressen) */
  houseNumber?: string;
  town: string;
  distance: number;
}

const normStreet = (s: string) =>
  s
    .toLowerCase()
    .replace(/str\.?$/, 'straße')
    .replace(/strasse$/, 'straße')
    .replace(/\s+/g, ' ')
    .trim();

/** Raster über die echten Hausnummern, einmal pro Szenario */
const addressGrid = new WeakMap<Address[], Map<string, Address[]>>();
const ADDR_CELL = 100;
function gridOf(list: Address[]) {
  let g = addressGrid.get(list);
  if (!g) {
    g = new Map();
    for (const a of list) {
      const k = `${Math.floor(a.x / ADDR_CELL)}:${Math.floor(a.y / ADDR_CELL)}`;
      const arr = g.get(k);
      if (arr) arr.push(a);
      else g.set(k, [a]);
    }
    addressGrid.set(list, g);
  }
  return g;
}

/** Nächste echte Hausnummer im Umkreis */
export function nearestAddress(scn: Scenario, p: Vec, maxDist = 60): Address | null {
  if (!scn.addresses?.length) return null;
  const g = gridOf(scn.addresses);
  const cx = Math.floor(p.x / ADDR_CELL);
  const cy = Math.floor(p.y / ADDR_CELL);
  const r = Math.ceil(maxDist / ADDR_CELL);
  let best: Address | null = null;
  let bestD = maxDist;
  for (let dx = -r; dx <= r; dx++)
    for (let dy = -r; dy <= r; dy++)
      for (const a of g.get(`${cx + dx}:${cy + dy}`) ?? []) {
        const d = dist(a, p);
        if (d <= bestD) {
          bestD = d;
          best = a;
        }
      }
  return best;
}

/** Rückwärtsgeokodierung: Adresse zum Kartenpunkt */
export function reverseGeocode(scn: Scenario, p: Vec): AddressHit | null {
  const real = nearestAddress(scn, p);
  if (real) {
    const n = parseInt(real.number, 10);
    const roadHit = reverseGeocodeRoads(scn, p);
    return {
      road: roadHit?.road ?? scn.roads[0],
      point: { x: real.x, y: real.y },
      street: real.street,
      number: isNaN(n) ? undefined : n,
      houseNumber: real.number,
      town: real.town,
      distance: dist(real, p),
      text: `${real.street} ${real.number}, ${real.town}`,
    };
  }
  return reverseGeocodeRoads(scn, p);
}

function reverseGeocodeRoads(scn: Scenario, p: Vec): AddressHit | null {
  const nodeById = new Map(scn.nodes.map((n) => [n.id, n]));
  let best: AddressHit | null = null;
  for (const r of scn.roads) {
    const a = nodeById.get(r.a);
    const b = nodeById.get(r.b);
    if (!a || !b) continue;
    const pr = projectOnSegment(p, a, b);
    if (best && pr.d >= best.distance) continue;
    let number: number | undefined;
    if (r.numA !== undefined && r.numB !== undefined) {
      const raw = r.numA + (r.numB - r.numA) * pr.t;
      number = Math.max(1, Math.round(raw));
    }
    const town = r.town || nearestTown(scn.towns, pr.point)?.name || '';
    best = {
      road: r,
      point: pr.point,
      street: r.name,
      number,
      town,
      distance: pr.d,
      text: '',
    };
  }
  if (!best) return null;
  if (best.road.type === 'ortsstrasse') {
    best.text = `${best.street}${best.number ? ' ' + best.number : ''}, ${best.town}`;
  } else {
    best.text = `${best.street} bei ${best.town}`;
  }
  return best;
}

export interface StreetEntry {
  street: string;
  town: string;
  label: string;
}

/** Liste aller adressierbaren Straßen (für Autovervollständigung) */
export function streetDirectory(scn: Scenario): StreetEntry[] {
  const seen = new Map<string, StreetEntry>();
  for (const r of scn.roads) {
    const town = r.type === 'ortsstrasse' ? r.town ?? '' : '';
    const label = town ? `${r.name}, ${town}` : r.name;
    if (!seen.has(label)) seen.set(label, { street: r.name, town, label });
  }
  for (const a of scn.addresses ?? []) {
    const label = `${a.street}, ${a.town}`;
    if (!seen.has(label)) seen.set(label, { street: a.street, town: a.town, label });
  }
  return [...seen.values()].sort((a, b) => a.label.localeCompare(b.label, 'de'));
}

/** Geokodierung: Straße + Hausnummer + Ort -> Kartenpunkt */
export function geocode(scn: Scenario, street: string, town: string, number?: number | string): AddressHit | null {
  const norm = normStreet;
  // Echte Hausnummern zuerst
  if (scn.addresses?.length && number !== undefined && String(number).trim()) {
    const wanted = String(number).trim().toLowerCase().replace(/\s+/g, '');
    const wantedNum = parseInt(wanted, 10);
    const same = scn.addresses.filter((a) => norm(a.street) === norm(street) && (!town || norm(a.town) === norm(town)));
    let hit = same.find((a) => a.number.toLowerCase().replace(/\s+/g, '') === wanted);
    if (!hit && !isNaN(wantedNum)) {
      // Nächstliegende vorhandene Nummer auf der gleichen Straßenseite
      let bestScore = Infinity;
      for (const a of same) {
        const n = parseInt(a.number, 10);
        if (isNaN(n)) continue;
        const score = Math.abs(n - wantedNum) + (n % 2 === wantedNum % 2 ? 0 : 0.5);
        if (score < bestScore) {
          bestScore = score;
          hit = a;
        }
      }
      if (bestScore > 20) hit = undefined;
    }
    if (hit) {
      const roadHit = reverseGeocodeRoads(scn, hit);
      return {
        road: roadHit?.road ?? scn.roads[0],
        point: { x: hit.x, y: hit.y },
        street: hit.street,
        number: isNaN(wantedNum) ? undefined : wantedNum,
        houseNumber: String(number).trim(),
        town: hit.town,
        distance: 0,
        text: `${hit.street} ${String(number).trim()}, ${hit.town}`,
      };
    }
  }
  if (typeof number === 'string') number = parseInt(number, 10) || undefined;
  const nodeById = new Map(scn.nodes.map((n) => [n.id, n]));
  const candidates = scn.roads.filter(
    (r) => norm(r.name) === norm(street) && (!town || r.type !== 'ortsstrasse' || norm(r.town ?? '') === norm(town)),
  );
  if (!candidates.length) return null;
  let pick = candidates[0];
  let t = 0.5;
  if (number !== undefined) {
    let bestScore = Infinity;
    for (const r of candidates) {
      if (r.numA === undefined || r.numB === undefined) continue;
      const lo = Math.min(r.numA, r.numB);
      const hi = Math.max(r.numA, r.numB);
      const score = number < lo ? lo - number : number > hi ? number - hi : 0;
      if (score < bestScore) {
        bestScore = score;
        pick = r;
        const span = r.numB - r.numA || 1;
        t = Math.max(0, Math.min(1, (number - r.numA) / span));
      }
    }
  }
  const a = nodeById.get(pick.a)!;
  const b = nodeById.get(pick.b)!;
  const point = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  const tn = pick.town || nearestTown(scn.towns, point)?.name || '';
  return {
    road: pick,
    point,
    street: pick.name,
    number,
    town: tn,
    distance: 0,
    text: pick.type === 'ortsstrasse' ? `${pick.name}${number ? ' ' + number : ''}, ${tn}` : `${pick.name} bei ${tn}`,
  };
}

/** Länge eines Polygonzugs */
export function polylineLength(pts: Vec[]): number {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += dist(pts[i - 1], pts[i]);
  return l;
}

const foldText = (s: string) =>
  s
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const OBJECT_KIND_LABEL: Record<MapObject['kind'], string> = {
  schule: 'Schule',
  seniorenheim: 'Seniorenheim',
  gewerbe: 'Gewerbe',
  kirche: 'Kirche',
  sonstiges: 'Objekt',
};

export interface ObjectHit {
  obj: MapObject;
  kind: string;
  town: string;
  /** Straße und Hausnummer, falls eine echte Adresse in der Nähe liegt */
  street: string;
}

/** Objekte mit Ort und Straße, einmal pro Objektliste */
const objectIndex = new WeakMap<MapObject[], { hit: ObjectHit; name: string; hay: string }[]>();

function indexOf(scn: Scenario) {
  let idx = objectIndex.get(scn.objects);
  if (!idx) {
    idx = scn.objects.map((obj) => {
      const addr = nearestAddress(scn, obj, 120);
      const town = addr?.town ?? (townAt(scn.towns, obj) ?? nearestTown(scn.towns, obj))?.name ?? '';
      const street = addr ? `${addr.street} ${addr.number}` : '';
      const kind = OBJECT_KIND_LABEL[obj.kind];
      return { hit: { obj, kind, town, street }, name: foldText(obj.name), hay: foldText(`${obj.name} ${kind} ${town} ${street}`) };
    });
    objectIndex.set(scn.objects, idx);
  }
  return idx;
}

/**
 * Objektsuche für die Einsatzmaske: alle Suchwörter müssen in Name, Art, Ort
 * oder Straße vorkommen ("grundschule giebelstadt", "juliusspital").
 * Treffer am Namensanfang zuerst.
 */
export function searchObjects(scn: Scenario, q: string, limit = 8): ObjectHit[] {
  const words = foldText(q).split(' ').filter(Boolean);
  if (!words.length) return [];
  const query = words.join(' ');
  return indexOf(scn)
    .filter((e) => words.every((w) => e.hay.includes(w)))
    .map((e) => ({ e, score: e.name === query ? 0 : e.name.startsWith(query) ? 1 : e.name.includes(query) ? 2 : 3 }))
    .sort((a, b) => a.score - b.score || a.e.name.localeCompare(b.e.name) || a.e.hit.town.localeCompare(b.e.hit.town, 'de'))
    .slice(0, limit)
    .map(({ e }) => e.hit);
}

/** Nächstes Objekt im Umkreis eines Kartenpunkts */
export function nearestObject(scn: Scenario, p: Vec, maxDist = 120): MapObject | null {
  let best: MapObject | null = null;
  let bestD = maxDist;
  for (const o of scn.objects) {
    const d = dist(o, p);
    if (d <= bestD) {
      best = o;
      bestD = d;
    }
  }
  return best;
}
