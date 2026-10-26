import { describe, expect, it } from 'vitest';
import { generateScenario } from '../shared/mapgen';
import { Game } from '../server/game';
import { anruferAusText, geschlechtVon } from '../server/callgen';

describe('Stimme des Anrufers', () => {
  it('erkennt das Geschlecht aus dem ersten Satz', () => {
    expect(anruferAusText('Hilfe! Mein Mann ist einfach umgefallen!')).toBe('w');
    expect(anruferAusText('Meine Frau kriegt keine Luft!')).toBe('m');
    expect(anruferAusText('Hier ist ein Mann gestürzt.')).toBeUndefined();
  });

  it('gibt jedem Notruf ein Geschlecht mit, passend zu Satz und Vorname', () => {
    const scn = generateScenario({ seed: 4711, towns: 8 });
    scn.settings.callsPerHour = 0;
    scn.settings.bmaPerHour = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const game = new Game(scn, { seed });
      const p = game.addPlayer('CT', 'calltaker');
      game.handle(p.id, { a: 'start' });
      const call = game.spawnCall('rd_cpr')!;
      game.handle(p.id, { a: 'answerCall', callId: call.id });
      for (let t = 0; t < 3000; t += 500) game.tick(500);
      const opening = call.transcript.find((l) => l.from === 'caller')!.text;
      expect(call.stimme).toBeDefined();
      if (/mein Mann/i.test(opening)) expect(call.stimme).toBe('w');
      const name = (game as unknown as { callTruth: Map<string, { name: string }> }).callTruth.get(call.id)!.name;
      expect(geschlechtVon(name.split(' ')[0])).toBe(call.stimme);
    }
  });
});
