import { describe, expect, it } from 'vitest';
import { generateScenario } from '../shared/mapgen';
import { Game } from '../server/game';
import { computeProposal } from '../shared/dispatch';

type Internals = { callTruth: Map<string, { pos: { x: number; y: number }; stichwort: string; patients: { specialty: string; unitId?: string }[] }> };

describe('Dauertest', () => {
  it('läuft zwei Spielstunden mit einem Bot-Disponenten ohne hängende Fahrzeuge', () => {
    const scn = generateScenario({ seed: 123, towns: 9 });
    scn.settings.callsPerHour = 14;
    scn.settings.bmaPerHour = 2;
    const game = new Game(scn, { seed: 7 });
    const bot = game.addPlayer('Bot', 'dispatcher');
    game.handle(bot.id, { a: 'start' });
    const internals = game as unknown as Internals;
    for (let step = 0; step < 2 * 3600 * 2; step++) {
      game.tick(500);
      for (const c of game.calls) {
        if (c.state === 'ringing') game.handle(bot.id, { a: 'answerCall', callId: c.id });
        if (c.state === 'active' && c.takerId === bot.id && !c.incidentId && game.time - (c.answeredAt ?? 0) > 20_000) {
          const t = internals.callTruth.get(c.id)!;
          if (t.stichwort) {
            game.handle(bot.id, { a: 'createIncident', callId: c.id, stichwort: t.stichwort, address: 'Bot', x: t.pos.x, y: t.pos.y, note: '', patients: 0 });
          }
          if (c.kind === '112') game.handle(bot.id, { a: 'endCall', callId: c.id });
        }
      }
      for (const inc of game.incidents) {
        if (inc.status === 'abgeschlossen' || step % 20) continue;
        const truth = (game as unknown as { incTruth: Map<string, { needs: Record<string, number> }> }).incTruth.get(inc.id)!;
        const prop = inc.firstArrival ? computeProposal(scn, game.graph, game.units, inc, truth.needs) : game.proposal(inc.id);
        if (prop.length) game.handle(bot.id, { a: 'alarm', incidentId: inc.id, unitIds: prop.map((p) => p.unitId) });
      }
      for (const u of game.units) {
        if (u.speak && !u.speak.answered) game.handle(bot.id, { a: 'speakPermit', unitId: u.id });
        if (u.task === 'awaitHospital' && !u.hospitalId) {
          const t = (game as unknown as { incTruth: Map<string, { patients: { specialty: string; unitId?: string }[] }> }).incTruth.get(u.incidentId!)!;
          const spec = t.patients.find((p) => p.unitId === u.id)?.specialty ?? '';
          const h = scn.hospitals.find((x) => x.specialties.includes(spec)) ?? scn.hospitals[0];
          game.handle(bot.id, { a: 'assignHospital', unitId: u.id, hospitalId: h.id });
        }
      }
    }
    const s = game.score;
    console.log(`Punkte ${s.points}, Einsätze ${s.incidentsCreated}, beendet ${s.incidentsClosed}, Hilfsfrist ${s.hilfsfristMet}/${s.hilfsfristTotal}, Ø ${Math.round(s.avgHilfsfristSec)} s`);
    expect(s.incidentsCreated).toBeGreaterThan(20);
    expect(s.incidentsClosed).toBeGreaterThan(s.incidentsCreated * 0.4);
    // Kein Einsatz darf ewig offen bleiben
    const old = game.incidents.filter((i) => i.status !== 'abgeschlossen' && game.time - i.createdAt > 150 * 60_000);
    expect(old.map((i) => i.nr)).toEqual([]);
    // Kein Fahrzeug darf ohne Einsatz unterwegs feststecken
    const stuck = game.units.filter((u) => !u.incidentId && !['station', 'returning'].includes(u.task));
    expect(stuck.map((u) => `${u.callsign}:${u.task}`)).toEqual([]);
  }, 60_000);
});
