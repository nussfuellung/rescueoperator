import { describe, expect, it } from 'vitest';
import { generateScenario } from '../shared/mapgen';
import { Game } from '../server/game';

function run(game: Game, ms: number, step = 500) {
  for (let t = 0; t < ms; t += step) game.tick(step);
}

function setup(tpl: string) {
  const scn = generateScenario({ seed: 4711, towns: 8 });
  scn.settings.callsPerHour = 0;
  scn.settings.bmaPerHour = 0;
  const game = new Game(scn, { seed: 11 });
  const ct = game.addPlayer('Calltaker', 'calltaker');
  game.handle(ct.id, { a: 'start' });
  const call = game.spawnCall(tpl)!;
  game.handle(ct.id, { a: 'answerCall', callId: call.id });
  run(game, 6000);
  return { game, ct, call };
}

describe('Weitervermittlung an die KVB 116117', () => {
  it('führt ein Gespräch mit Erklärung, Rückfallhinweis und Übergabe', () => {
    const { game, ct, call } = setup('kvb_fieber');
    const start = call.transcript.length;
    const before = game.score.points;
    expect(game.handle(ct.id, { a: 'transferKvb', callId: call.id })).toBeUndefined();
    expect(game.score.points).toBeGreaterThan(before);
    // Gespräch läuft noch, keine doppelte Weiterleitung, kein Einsatz mehr
    expect(call.state).toBe('active');
    expect(game.handle(ct.id, { a: 'transferKvb', callId: call.id })).toBeTruthy();
    expect(game.handle(ct.id, { a: 'ask', callId: call.id, question: 'alter' })).toBeTruthy();
    run(game, 20_000);
    expect(call.state).toBe('ended');
    const neu = call.transcript.slice(start);
    expect(neu.map((l) => l.from)).toEqual(['calltaker', 'caller', 'calltaker', 'caller', 'system', 'system']);
    expect(neu[0].text).toMatch(/116117/);
    expect(neu[2].text).toMatch(/112/);
    expect(neu.at(-1)!.text).toMatch(/übergeben/);
  });

  it('Anrufer mit echtem Notfall protestiert, Auflegen bewertet nicht doppelt', () => {
    const { game, ct, call } = setup('rd_chest');
    game.handle(ct.id, { a: 'transferKvb', callId: call.id });
    const after = game.score.points;
    run(game, 3000);
    expect(call.transcript.filter((l) => l.from === 'caller').at(-1)!.text).toMatch(/Notfall|schicken|zu spät/);
    game.handle(ct.id, { a: 'endCall', callId: call.id });
    expect(call.state).toBe('ended');
    expect(game.score.points).toBe(after);
  });
});
