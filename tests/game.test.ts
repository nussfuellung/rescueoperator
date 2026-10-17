import { describe, expect, it } from 'vitest';
import { generateScenario } from '../shared/mapgen';
import { Game } from '../server/game';

function run(game: Game, ms: number, step = 500) {
  for (let t = 0; t < ms; t += step) game.tick(step);
}

describe('Simulation', () => {
  it('spielt einen Notruf vom Klingeln bis zum Einsatzende durch', () => {
    const scn = generateScenario({ seed: 4711, towns: 8 });
    scn.settings.callsPerHour = 0;
    scn.settings.bmaPerHour = 0;
    const game = new Game(scn, { seed: 1 });
    const ct = game.addPlayer('Calltaker', 'calltaker');
    const dp = game.addPlayer('Disponent', 'dispatcher');
    game.handle(ct.id, { a: 'start' });

    const call = game.spawnCall('rd_fall')!;
    expect(call.state).toBe('ringing');
    expect(game.handle(ct.id, { a: 'answerCall', callId: call.id })).toBeUndefined();
    game.handle(ct.id, { a: 'ask', callId: call.id, question: 'was' });
    run(game, 5000);
    expect(call.transcript.filter((l) => l.from === 'caller').length).toBeGreaterThan(0);

    // Wahre Position aus dem Gespräch ist hier nicht bekannt; wir nehmen die AML-freie Variante über interne Daten
    const truth = (game as unknown as { callTruth: Map<string, { pos: { x: number; y: number } }> }).callTruth.get(call.id)!;
    expect(
      game.handle(ct.id, {
        a: 'createIncident', callId: call.id, stichwort: 'RD 1', address: 'Test', x: truth.pos.x, y: truth.pos.y, note: '', patients: 1,
      }),
    ).toBeUndefined();
    game.handle(ct.id, { a: 'endCall', callId: call.id });
    const inc = game.incidents[0];
    const prop = game.proposal(inc.id);
    expect(prop.length).toBe(1);
    expect(game.units.find((u) => u.id === prop[0].unitId)!.type).toBe('RTW');
    game.handle(dp.id, { a: 'alarm', incidentId: inc.id, unitIds: prop.map((p) => p.unitId) });
    const rtw = game.units.find((u) => u.id === prop[0].unitId)!;

    // Bis zum Sprechwunsch "Zielklinik" laufen lassen und dabei Sprechwünsche beantworten
    let guard = 0;
    while (rtw.task !== 'awaitHospital' && guard++ < 20000) {
      game.tick(500);
      if (rtw.speak && !rtw.speak.answered) game.handle(dp.id, { a: 'speakPermit', unitId: rtw.id });
    }
    expect(rtw.task).toBe('awaitHospital');
    expect(inc.lage).toBeTruthy();
    game.handle(dp.id, { a: 'assignHospital', unitId: rtw.id, hospitalId: scn.hospitals[0].id });
    guard = 0;
    while (rtw.task !== 'station' && guard++ < 40000) game.tick(500);
    expect(rtw.status).toBe(2);
    expect(inc.status).toBe('abgeschlossen');
    expect(game.score.points).toBeGreaterThan(0);
  });

  it('fordert fehlende Kräfte nach, wenn zu wenig alarmiert wurde', () => {
    const scn = generateScenario({ seed: 99, towns: 6 });
    scn.settings.callsPerHour = 0;
    scn.settings.bmaPerHour = 0;
    const game = new Game(scn, { seed: 2 });
    const p = game.addPlayer('Spieler', 'dispatcher');
    game.handle(p.id, { a: 'start' });
    const call = game.spawnCall('b_wohnung')!;
    game.handle(p.id, { a: 'answerCall', callId: call.id });
    const truth = (game as unknown as { callTruth: Map<string, { pos: { x: number; y: number } }> }).callTruth.get(call.id)!;
    game.handle(p.id, { a: 'createIncident', callId: call.id, stichwort: 'B 1', address: 'x', x: truth.pos.x, y: truth.pos.y, note: '', patients: 0 });
    const inc = game.incidents[0];
    game.handle(p.id, { a: 'alarm', incidentId: inc.id, unitIds: game.proposal(inc.id).map((x) => x.unitId) });
    let speech = '';
    for (let i = 0; i < 6000 && !speech; i++) {
      game.tick(500);
      const u = game.units.find((x) => x.speak && !x.speak.answered);
      if (u) speech = u.speak!.text;
    }
    expect(speech).toContain('Wir fordern nach');
  });
});
