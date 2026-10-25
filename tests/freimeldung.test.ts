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
    const frei = /an der Einsatzstelle wieder frei|frei an der Einsatzstelle/i;
    for (let t = 0; t < 3_600_000 && inc.status !== 'abgeschlossen'; t += 1000) game.tick(1000);
    expect(inc.status).toBe('abgeschlossen');
    // Ohne Sprechaufforderung wird nicht gefunkt: die Freimeldung wartet als Sprechwunsch
    expect(game.radio.some((m) => m.kind === 'voice' && frei.test(m.text))).toBe(false);
    const u = game.units.find((x) => x.speak && !x.speak.answered && frei.test(x.speak.text))!;
    expect(u.status).toBe(5);
    game.handle(p.id, { a: 'speakPermit', unitId: u.id });
    expect(game.radio.some((m) => m.kind === 'voice' && m.from === u.callsign && frei.test(m.text))).toBe(true);
  });

  it('meldet sich ohne Sprechwunsch nicht per Sprechfunk', () => {
    const scn = generateScenario({ seed: 4711, towns: 8 });
    const game = new Game(scn, { seed: 2 });
    const p = game.addPlayer('D', 'dispatcher');
    game.handle(p.id, { a: 'start' });
    const town = scn.towns[1];
    game.handle(p.id, { a: 'createIncident', stichwort: 'THL 1', address: 'Test', x: town.x, y: town.y, note: '', patients: 0, alarmAao: true });
    // Niemand erteilt Sprechaufforderungen: Fahrzeuge dürfen dann nur FMS-Status senden
    for (let t = 0; t < 2 * 3_600_000; t += 1000) game.tick(1000);
    const funk = game.radio.filter((m) => m.kind === 'voice' && m.from !== scn.ilsName);
    expect(funk).toEqual([]);
  });
});
