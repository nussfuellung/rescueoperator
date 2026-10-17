import { describe, expect, it } from 'vitest';
import { generateScenario } from '../shared/mapgen';
import { runBot } from './bot';

describe('Dauertest', () => {
  it('läuft zwei Spielstunden mit einem Bot-Disponenten ohne hängende Fahrzeuge', () => {
    const scn = generateScenario({ seed: 123, towns: 9 });
    scn.settings.callsPerHour = 14;
    scn.settings.bmaPerHour = 2;
    const game = runBot(scn, 2);
    const s = game.score;
    console.log(`Punkte ${s.points}, Einsätze ${s.incidentsCreated}, beendet ${s.incidentsClosed}, Hilfsfrist ${s.hilfsfristMet}/${s.hilfsfristTotal}, Ø ${Math.round(s.avgHilfsfristSec)} s`);
    expect(s.incidentsCreated).toBeGreaterThan(20);
    // Bei Überlast (z. B. MANV) bleiben Einsätze offen, abgearbeitet werden muss trotzdem laufend
    expect(s.incidentsClosed).toBeGreaterThanOrEqual(10);
    // Kein Einsatz darf ewig offen bleiben
    const old = game.incidents.filter((i) => i.status !== 'abgeschlossen' && game.time - i.createdAt > 150 * 60_000);
    expect(old.map((i) => i.nr)).toEqual([]);
    // Kein Fahrzeug darf ohne Einsatz unterwegs feststecken
    const stuck = game.units.filter((u) => !u.incidentId && !['station', 'returning'].includes(u.task));
    expect(stuck.map((u) => `${u.callsign}:${u.task}`)).toEqual([]);
  }, 60_000);
});
