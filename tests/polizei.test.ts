import { describe, expect, it } from 'vitest';
import { generateScenario } from '../shared/mapgen';
import { Game } from '../server/game';
import { POLIZEI_VORLAGEN } from '../server/vorlagen-polizei';

const quiet = () => {
  const scn = generateScenario({ seed: 4711, towns: 8 });
  scn.settings.callsPerHour = 0;
  scn.settings.bmaPerHour = 0;
  return scn;
};
const run = (game: Game, ms: number) => {
  for (let t = 0; t < ms; t += 1000) game.tick(1000);
};
type Internals = { callTruth: Map<string, { pos: { x: number; y: number }; address: string; stichwort: string }> };

describe('Polizei', () => {
  it('verständigt die Polizei mit dem Haken in der Einsatzmaske gleich beim Anlegen', () => {
    const game = new Game(quiet(), { seed: 4 });
    const p = game.addPlayer('D', 'dispatcher');
    game.handle(p.id, { a: 'start' });
    const call = game.spawnCall('thl_vu_leicht')!;
    game.handle(p.id, { a: 'answerCall', callId: call.id });
    const t = (game as unknown as Internals).callTruth.get(call.id)!;
    const before = game.score.points;
    game.handle(p.id, { a: 'createIncident', callId: call.id, stichwort: 'THL 2', address: t.address, x: t.pos.x, y: t.pos.y, note: '', patients: 1, alarmAao: true, polizei: true });
    const inc = game.incidents[0];
    expect(inc.polizei).toBe('angefordert');
    expect(inc.log.some((l) => /Polizei verständigt/.test(l.text))).toBe(true);
    expect(game.score.points).toBeGreaterThan(before);
    run(game, 25 * 60_000);
    // Die Besatzung muss die Polizei dann nicht mehr nachfordern
    expect(game.radio.some((m) => /Bitte Polizei verständigen/.test(m.text))).toBe(false);
  });

  it('lässt die Polizei ohne Haken weg', () => {
    const game = new Game(quiet(), { seed: 4 });
    const p = game.addPlayer('D', 'dispatcher');
    game.handle(p.id, { a: 'start' });
    const call = game.spawnCall('rd_fall')!;
    game.handle(p.id, { a: 'answerCall', callId: call.id });
    const t = (game as unknown as Internals).callTruth.get(call.id)!;
    game.handle(p.id, { a: 'createIncident', callId: call.id, stichwort: 'RD 1', address: t.address, x: t.pos.x, y: t.pos.y, note: '', patients: 1 });
    expect(game.incidents[0].polizei).toBeUndefined();
  });

  it('Streife ruft an, ist schon vor Ort und fordert den Rettungsdienst nach', () => {
    for (const tpl of POLIZEI_VORLAGEN) {
      const game = new Game(quiet(), { seed: 7 });
      const p = game.addPlayer('CT', 'calltaker');
      game.handle(p.id, { a: 'start' });
      const call = game.spawnCall(tpl.id)!;
      expect(call, tpl.id).toBeTruthy();
      expect(call.polizei, tpl.id).toMatch(/^Main \d+\/\d$/);
      expect(call.phone).toMatch(/^Polizei /);
      expect(call.aml).toBeUndefined();
      game.handle(p.id, { a: 'answerCall', callId: call.id });
      run(game, 3000);
      const first = call.transcript.filter((l) => l.from === 'caller').map((l) => l.text).join(' ');
      expect(first, tpl.id).toMatch(/Streife|Polizei/);
      expect(first, tpl.id).not.toMatch(/[{}]/);
      // Den Einsatzort nennt die Streife gleich mit
      const t = (game as unknown as Internals).callTruth.get(call.id)!;
      expect(first, tpl.id).toMatch(/Einsatzort ist|Auf der/);
      game.handle(p.id, { a: 'createIncident', callId: call.id, stichwort: t.stichwort, address: t.address, x: t.pos.x, y: t.pos.y, note: '', patients: 1, alarmAao: true });
      const inc = game.incidents[0];
      expect(inc.polizei, tpl.id).toBe('vor Ort');
      expect(inc.log.some((l) => /Polizei bereits vor Ort/.test(l.text))).toBe(true);
      run(game, 40 * 60_000);
      // Lagemeldung kennt die Polizei als vor Ort, niemand fordert sie nach
      expect(game.radio.some((m) => /Bitte Polizei verständigen|Polizei wird erwartet|Polizei erforderlich/.test(m.text)), tpl.id).toBe(false);
      if (inc.lage) expect(inc.lage, tpl.id).not.toMatch(/Polizei (wird erwartet|erforderlich)/);
    }
  });
});
