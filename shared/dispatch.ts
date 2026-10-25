// AAO-Logik: Abdeckung von Anforderungen und Alarmierungsvorschlag.
import { AIR_SPEED, AIR_TURNOUT } from './catalog';
import type { RoadGraph } from './geo';
import type { IncidentState, Scenario, UnitState, Vec, VehicleType } from './types';

/**
 * Prüft, welche Anforderungen durch die Fahrzeuge nicht abgedeckt sind.
 * Spezifische Typen werden zuerst bedient, damit ein HLF nicht den LF-Platz blockiert.
 */
export function coverage(
  needs: Record<string, number>,
  units: UnitState[],
  types: Map<string, VehicleType>,
): Record<string, number> {
  const left = { ...needs };
  const pool = [...units].sort((a, b) => (types.get(a.type)?.fills.length ?? 0) - (types.get(b.type)?.fills.length ?? 0));
  // Erst exakte Typen, dann Ersatztypen
  const used = new Set<string>();
  for (const u of pool) {
    if ((left[u.type] ?? 0) > 0) {
      left[u.type]--;
      used.add(u.id);
    }
  }
  for (const u of pool) {
    if (used.has(u.id)) continue;
    const fills = types.get(u.type)?.fills ?? [u.type];
    const need = fills.find((f) => (left[f] ?? 0) > 0);
    if (need) {
      left[need]--;
      used.add(u.id);
    }
  }
  for (const k of Object.keys(left)) if (left[k] <= 0) delete left[k];
  return left;
}

/** Restdauer der Übergabe nach Alarmierung aus Status 8: mindestens 1, höchstens 5 Minuten */
export const UEBERGABE_MIN_S = 60;
export const UEBERGABE_MAX_S = 300;
/** Annahme, wenn die Restdauer unbekannt ist (Spielerbesatzung) */
export const UEBERGABE_DEFAULT_S = 180;

/** Fahrzeug in der Klinik (Status 8), das nach der Übergabe neu alarmiert werden kann */
export function inUebergabe(u: UnitState): boolean {
  return u.task === 'atHospital' && u.status !== 6 && !u.fremd;
}

/** Sekunden, bis ein Fahrzeug in Status 8 die Übergabe abgeschlossen hat und losfahren kann */
export function uebergabeRest(u: UnitState, now: number): number {
  const rest = u.timer !== undefined ? (u.timer - now) / 1000 : UEBERGABE_DEFAULT_S;
  return Math.min(UEBERGABE_MAX_S, Math.max(UEBERGABE_MIN_S, rest));
}

export interface ProposalEntry {
  unitId: string;
  seconds: number;
  need: string;
  /** Fahrzeug steht noch in Status 8 an der Klinik, Zeit enthält den Rest der Übergabe */
  s8?: boolean;
}

/** AAO-Vorschlag: für jede Anforderung das schnellste freie Fahrzeug, auch aus Status 8 nach der Übergabe */
export function computeProposal(
  scn: Scenario,
  graph: RoadGraph,
  units: UnitState[],
  inc: IncidentState,
  aao: Record<string, number>,
  now = 0,
): ProposalEntry[] {
  const types = new Map(scn.vehicleTypes.map((t) => [t.id, t]));
  const assigned = units.filter((u) => u.incidentId === inc.id);
  const left = coverage(aao, assigned, types);
  const free = freeUnitTimes(scn, graph, units, inc, now);
  const out: ProposalEntry[] = [];
  const taken = new Set<string>();
  // Exakte Typen zuerst, dann Ersatz
  for (const pass of [0, 1]) {
    for (const [need, count] of Object.entries(left)) {
      let n = count - out.filter((o) => o.need === need).length;
      for (const x of free) {
        if (n <= 0) break;
        if (taken.has(x.u.id)) continue;
        const fills = types.get(x.u.type)?.fills ?? [];
        const ok = pass === 0 ? x.u.type === need : fills.includes(need);
        if (!ok) continue;
        taken.add(x.u.id);
        out.push({ unitId: x.u.id, seconds: x.seconds, need, ...(x.s8 ? { s8: true } : {}) });
        n--;
      }
    }
  }
  return out;
}

/**
 * Ausrück- plus Fahrzeit aller freien Fahrzeuge zu einem Punkt, schnellste zuerst.
 * Fahrzeuge in Status 8 zählen mit: Sie fahren erst nach dem Rest der Übergabe von der Klinik los.
 */
export function freeUnitTimes(scn: Scenario, graph: RoadGraph, units: UnitState[], pos: Vec, now = 0): { u: UnitState; seconds: number; s8?: boolean }[] {
  const types = new Map(scn.vehicleTypes.map((t) => [t.id, t]));
  const start = graph.nearestNode(pos);
  const candidates = units.filter((u) => (!u.incidentId && !u.fremd && [1, 2].includes(u.baseStatus)) || inUebergabe(u));
  const nodeOf = new Map(candidates.map((u) => [u.id, graph.nearestNode(u)]));
  const { time } = graph.dijkstra(start, true, nodeOf.values());
  const stations = new Map(scn.stations.map((s) => [s.id, s]));
  return candidates
    .map((u) => {
      const n = nodeOf.get(u.id) ?? -1;
      const factor = 1.2 * (types.get(u.type)?.speedFactor ?? 1);
      const st = stations.get(u.stationId);
      const career = st?.career || types.get(u.type)?.org === 'RD';
      if (inUebergabe(u)) {
        const rest = uebergabeRest(u, now);
        const fahrt = types.get(u.type)?.air ? Math.hypot(u.x - pos.x, u.y - pos.y) / AIR_SPEED : (n >= 0 ? time[n] : Infinity) / factor;
        return { u, seconds: fahrt + rest, s8: true };
      }
      if (types.get(u.type)?.air) return { u, seconds: Math.hypot(u.x - pos.x, u.y - pos.y) / AIR_SPEED + (u.baseStatus === 2 ? AIR_TURNOUT : 8) };
      const turnout = u.baseStatus === 2 ? (career ? 60 : 250) : 8;
      return { u, seconds: (n >= 0 ? time[n] : Infinity) / factor + turnout };
    })
    .filter((x) => isFinite(x.seconds))
    .sort((a, b) => a.seconds - b.seconds);
}
