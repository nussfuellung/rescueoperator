import { describe, expect, it } from 'vitest';
import { generateScenario } from '../shared/mapgen';
import { Game } from '../server/game';
import { classifyQuestion, questionText } from '../server/callgen';

function run(game: Game, ms: number, step = 500) {
  for (let t = 0; t < ms; t += step) game.tick(step);
}

function setup() {
  const scn = generateScenario({ seed: 4711, towns: 8 });
  scn.settings.callsPerHour = 0;
  scn.settings.bmaPerHour = 0;
  const game = new Game(scn, { seed: 7 });
  const ct = game.addPlayer('Calltaker', 'calltaker');
  game.handle(ct.id, { a: 'start' });
  const call = game.spawnCall('rd_fall')!;
  game.handle(ct.id, { a: 'answerCall', callId: call.id });
  run(game, 8000);
  return { game, ct, call };
}

describe('"Ich schicke Ihnen jemand"', () => {
  it('Anrufer bedankt sich und das Gespräch endet von selbst', () => {
    const { game, ct, call } = setup();
    game.handle(ct.id, { a: 'ask', callId: call.id, question: 'verabschieden' });
    expect(call.state).toBe('active');
    run(game, 6000);
    expect(call.state).toBe('ended');
    expect(call.transcript.at(-1)?.from).toBe('caller');
  });

  it('wird auch frei getippt oder gesprochen erkannt', () => {
    expect(classifyQuestion('ich schicke ihnen jemanden vorbei')).toBe('verabschieden');
    expect(classifyQuestion('Der Rettungsdienst ist auf dem Weg, auf Wiederhören')).toBe('verabschieden');
    expect(classifyQuestion('bleiben sie ruhig')).toBe('beruhigen');
  });

  it('Beruhigen verspricht nicht mehr, am Telefon zu bleiben', () => {
    expect(questionText('beruhigen')).not.toMatch(/Telefon/);
  });
});
