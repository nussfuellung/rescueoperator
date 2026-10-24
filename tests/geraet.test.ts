import { describe, expect, it } from 'vitest';
import { generateScenario } from '../shared/mapgen';
import { Game } from '../server/game';

describe('Gekoppeltes Tablet', () => {
  it('meldet Sprechtaste, Ziel-Fahrzeug, Spracheingabe und Ton am Rechner im Spielstand', () => {
    const scn = generateScenario({ seed: 4711, towns: 4 });
    const game = new Game(scn, { seed: 1 });
    const p = game.addPlayer('Disponent', 'dispatcher');
    const unitId = scn.stations[0].vehicles[0].id;
    const me = () => game.publicState().players.find((x) => x.id === p.id)!;

    game.handle(p.id, { a: 'geraet', sttBereit: true, tonAmPc: true });
    expect(me().geraet).toMatchObject({ sttBereit: true, tonAmPc: true });

    game.handle(p.id, { a: 'geraet', ptt: true, pttUnitId: unitId });
    expect(me().geraet).toMatchObject({ ptt: true, pttSeq: 1, pttUnitId: unitId, sttBereit: true });
    // Auffrischen zählt weiter, damit der Rechner eine hängende Taste erkennt
    game.handle(p.id, { a: 'geraet', ptt: true });
    expect(me().geraet).toMatchObject({ ptt: true, pttSeq: 2, pttUnitId: unitId });

    game.handle(p.id, { a: 'geraet', ptt: false, pttUnitId: 'gibtsnicht' });
    expect(me().geraet?.ptt).toBe(false);
    expect(me().geraet?.pttUnitId).toBeUndefined();
  });
});
