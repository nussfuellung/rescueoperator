import { describe, expect, it } from 'vitest';
import { generateScenario } from '../shared/mapgen';
import { Game } from '../server/game';
import { classifyQuestion } from '../server/callgen';

function run(game: Game, ms: number, step = 500) {
  for (let t = 0; t < ms; t += step) game.tick(step);
}

function setup(seed: number) {
  const scn = generateScenario({ seed: 4711, towns: 8 });
  scn.settings.callsPerHour = 0;
  scn.settings.bmaPerHour = 0;
  const game = new Game(scn, { seed });
  const ct = game.addPlayer('Calltaker', 'calltaker');
  game.handle(ct.id, { a: 'start' });
  const call = game.spawnCall('rd_fall')!;
  game.handle(ct.id, { a: 'answerCall', callId: call.id });
  const truth = (game as unknown as { callTruth: Map<string, { spokenWhere: string }> }).callTruth.get(call.id)!;
  return { game, ct, call, truth };
}

const callerLines = (call: { transcript: { from: string; text: string }[] }) => call.transcript.filter((l) => l.from === 'caller').map((l) => l.text);

describe('Adressabfrage im Notruf', () => {
  it('nennt den Ort, wenn rückbestätigt wird, bevor er genannt wurde', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const { game, ct, call, truth } = setup(seed);
      game.handle(ct.id, { a: 'ask', callId: call.id, question: 'ortbestaetigen' });
      run(game, 15000);
      const lines = callerLines(call);
      const mitOrt = lines.filter((l) => l.includes(truth.spokenWhere));
      // Genau einmal genannt, kein "Ja, genau" ohne Adresse
      expect(mitOrt).toHaveLength(1);
      expect(lines.some((l) => /^Ja, (genau|richtig|stimmt)/.test(l))).toBe(false);
    }
  });

  it('bestätigt, wenn der Ort schon genannt wurde', () => {
    const { game, ct, call } = setup(3);
    game.handle(ct.id, { a: 'ask', callId: call.id, question: 'wo' });
    run(game, 8000);
    game.handle(ct.id, { a: 'ask', callId: call.id, question: 'ortbestaetigen' });
    run(game, 5000);
    expect(callerLines(call).at(-1)).toMatch(/^Ja, (genau|richtig|stimmt)/);
  });

  it('versteht "wiederholen Sie die Adresse" als Frage nach dem Ort', () => {
    expect(classifyQuestion('Können Sie mir die Adresse nochmal wiederholen?')).toBe('wo');
    expect(classifyQuestion('Wiederholen Sie bitte die Adresse')).toBe('wo');
    expect(classifyQuestion('Ich wiederhole die Adresse: Hauptstraße 5, stimmt das?')).toBe('ortbestaetigen');
    expect(classifyQuestion('wiederhole ich nochmal hauptstraße fünf')).toBe('ortbestaetigen');
  });
});
