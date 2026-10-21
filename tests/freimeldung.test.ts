import { describe, expect, it } from 'vitest';
import { generateScenario } from '../shared/mapgen';
import { Game } from '../server/game';

describe('Freimeldung per Funk', () => {
  it('Fahrzeuge melden sich bei Status 1 an der Einsatzstelle frei', () => {
    const scn = generateScenario({ seed: 4711, towns: 8 });
    scn.settings.callsPerHour = 0;
    scn.settings.bmaPerHour = 0;
    const game = new Game(scn, { seed: 1 });
    const p = game.addPlayer('D', 'dispatcher');
    game.handle(p.id, { a: 'start' });
    const town = scn.towns[1];
    game.handle(p.id, { a: 'createIncident', stichwort: 'THL 1', address: 'Test', x: town.x, y: town.y, note: '', patients: 0, alarmAao: true });
    const inc = game.incidents[0];
    for (let t = 0; t < 3_600_000 && inc.status !== 'abgeschlossen'; t += 1000) game.tick(1000);
    expect(inc.status).toBe('abgeschlossen');
    expect(game.radio.some((m) => m.kind === 'voice' && /an der Einsatzstelle wieder frei|frei an der Einsatzstelle/.test(m.text))).toBe(true);
  });
});
