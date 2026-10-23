// Hinweise des Leitstellen-Editors: Dinge, die das Spiel nicht verhindern, aber Einsätze unspielbar oder unrealistisch machen.
import { SPECIALTIES } from './catalog';
import { ensureTmo } from './fleet';
import { pzcFachbereich, PZC_LISTE } from './pzc';
import type { Scenario } from './types';

/** Fachrichtungen, die Notrufe und PZC im Spiel als Zielklinik verlangen */
export function benoetigteFachrichtungen(): string[] {
  const set = new Set<string>(SPECIALTIES.slice(0, 2));
  for (const p of PZC_LISTE) set.add(pzcFachbereich(p.code));
  return [...set];
}

export function editorHinweise(scn: Scenario): string[] {
  const out: string[] = [];
  const types = new Map(scn.vehicleTypes.map((t) => [t.id, t]));
  const vorhanden = new Set(scn.stations.flatMap((s) => s.vehicles.map((v) => v.type)));
  // Ein Typ zählt als vorhanden, wenn ein vorhandenes Fahrzeug ihn erfüllt (HLF erfüllt LF)
  const erfuellbar = new Set<string>();
  for (const id of vorhanden) for (const f of types.get(id)?.fills ?? [id]) erfuellbar.add(f);

  if (!scn.stations.some((s) => s.vehicles.some((v) => types.get(v.type)?.transport)))
    out.push('Kein Fahrzeug kann Patienten transportieren (Fahrzeugtyp mit „Transport“ fehlt).');

  for (const sw of scn.stichworte) {
    const req = Object.entries(sw.aao).filter(([, n]) => n > 0);
    if (!req.length && sw.category !== 'SONST') out.push(`Stichwort ${sw.code} hat keine Fahrzeuge in der AAO.`);
    for (const [t] of req) {
      if (!types.has(t)) out.push(`Stichwort ${sw.code} verlangt den unbekannten Fahrzeugtyp ${t}.`);
      else if (!erfuellbar.has(t)) out.push(`Stichwort ${sw.code} verlangt ${types.get(t)!.label}, das kein Fahrzeug der Leitstelle stellen kann.`);
    }
  }

  const tmo = new Set(ensureTmo(scn).map((g) => g.id));
  for (const s of scn.stations) {
    if (s.tmo && !tmo.has(s.tmo)) out.push(`${s.name} funkt in einer gelöschten Rufgruppe.`);
    if (!s.vehicles.length) out.push(`${s.name} hat keine Fahrzeuge.`);
    for (const v of s.vehicles)
      for (const d of v.dienst ?? []) {
        if (d.tage && !d.tage.length) out.push(`${v.callsign}: Dienstzeit ohne Wochentag.`);
      }
  }

  const fach = new Set(scn.hospitals.flatMap((h) => h.specialties));
  for (const f of benoetigteFachrichtungen())
    if (!fach.has(f)) out.push(`Keine Klinik hat die Fachrichtung ${f}. Patienten dafür müssen weit weg oder falsch zugewiesen werden.`);
  for (const h of scn.hospitals) if (!h.specialties.length) out.push(`${h.name} hat keine Fachrichtung und nimmt keine Patienten auf.`);
  return out;
}
