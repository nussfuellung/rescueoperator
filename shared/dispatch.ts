// AAO-Logik: Abdeckung von Anforderungen und Alarmierungsvorschlag.
import type { RoadGraph } from './geo';
import type { IncidentState, Scenario, UnitState, VehicleType } from './types';

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

/** AAO-Vorschlag: für jede Anforderung das schnellste freie Fahrzeug */
export function computeProposal(
  scn: Scenario,
  graph: RoadGraph,
  units: UnitState[],
  inc: IncidentState,
  aao: Record<string, number>,
): { unitId: string; seconds: number; need: string }[] {
  const types = new Map(scn.vehicleTypes.map((t) => [t.id, t]));
  const assigned = units.filter((u) => u.incidentId === inc.id);
  const left = coverage(aao, assigned, types);
  const start = graph.nearestNode(inc);
  const { time } = graph.dijkstra(start);
  const stations = new Map(scn.stations.map((s) => [s.id, s]));
  const free = units
    .filter((u) => !u.incidentId && [1, 2].includes(u.baseStatus))
    .map((u) => {
      const n = graph.nearestNode(u);
      const factor = 1.2 * (types.get(u.type)?.speedFactor ?? 1);
      const st = stations.get(u.stationId);
      const career = st?.career || types.get(u.type)?.org === 'RD';
      const turnout = u.baseStatus === 2 ? (career ? 60 : 250) : 8;
      return { u, seconds: (n >= 0 ? time[n] : Infinity) / factor + turnout };
    })
    .filter((x) => isFinite(x.seconds))
    .sort((a, b) => a.seconds - b.seconds);
  const out: { unitId: string; seconds: number; need: string }[] = [];
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
        out.push({ unitId: x.u.id, seconds: x.seconds, need });
        n--;
      }
    }
  }
  return out;
}
