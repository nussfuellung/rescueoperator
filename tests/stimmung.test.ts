import { describe, expect, it } from 'vitest';
import { generateScenario } from '../shared/mapgen';
import { schlagwortByNr } from '../shared/schlagworte';
import { Game } from '../server/game';
import { STIMMUNG_VORLAGEN } from '../server/vorlagen-stimmung';

const quiet = () => {
  const scn = generateScenario({ seed: 4711, towns: 8 });
  scn.settings.callsPerHour = 0;
  scn.settings.bmaPerHour = 0;
  return scn;
};
const run = (game: Game, ms: number) => {
  for (let t = 0; t < ms; t += 1000) game.tick(1000);
};

describe('Anrufer mit Gefühlslage', () => {
  it('setzt die Regieanweisung vor jeden Satz und ist nie zusätzlich panisch', () => {
    for (const tpl of STIMMUNG_VORLAGEN) {
      const game = new Game(quiet(), { seed: 3 });
      const ct = game.addPlayer('CT', 'calltaker');
      game.handle(ct.id, { a: 'start' });
      const call = game.spawnCall(tpl.id)!;
      expect(call, tpl.id).toBeTruthy();
      game.handle(ct.id, { a: 'answerCall', callId: call.id });
      run(game, 3000);
      for (const q of ['was', 'zustand', 'gefahr'] as const) {
        game.handle(ct.id, { a: 'ask', callId: call.id, question: q });
        run(game, 4000);
      }
      const saetze = call.transcript.filter((l) => l.from === 'caller').map((l) => l.text);
      expect(saetze.length, tpl.id).toBeGreaterThanOrEqual(4);
      for (const s of saetze) expect(s, tpl.id).toMatch(new RegExp(`^\\(${tpl.stimmung}\\) `));
    }
  });

  it('hat Schlagworte, die zum Stichwort passen', () => {
    for (const tpl of STIMMUNG_VORLAGEN) expect(schlagwortByNr(tpl.schlagwort, tpl.stichwort)?.code, tpl.id).toBe(tpl.stichwort);
  });
});
