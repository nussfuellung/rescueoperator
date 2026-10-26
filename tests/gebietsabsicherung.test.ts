import { describe, expect, it } from 'vitest';
import { generateScenario } from '../shared/mapgen';
import { Game } from '../server/game';

const quiet = () => {
  const scn = generateScenario({ seed: 4711, towns: 8 });
  scn.settings.callsPerHour = 0;
  scn.settings.bmaPerHour = 0;
  return scn;
};
const run = (game: Game, ms: number) => {
  for (let t = 0; t < ms; t += 1000) game.tick(1000);
};

describe('Gebietsabsicherung', () => {
  const setup = () => {
    const scn = quiet();
    const game = new Game(scn, { seed: 3 });
    const p = game.addPlayer('D', 'dispatcher');
    game.handle(p.id, { a: 'start' });
    const u = game.units.find((x) => x.status === 2)!;
    const target = scn.stations.find((s) => s.id !== u.stationId)!;
    return { scn, game, p, u, target };
  };

  it('rückt mit Status 3 aus, fährt mit Status 1 und bleibt am Standort auf Status 1', () => {
    const { game, p, u, target } = setup();
    expect(game.handle(p.id, { a: 'cover', unitIds: [u.id], stationId: target.id })).toBeUndefined();
    expect(u.cover?.stationId).toBe(target.id);
    expect(u.cover?.since).toBe(game.time);
    // Alarmierung über den Funkmelder, nicht im Sprechfunk der Rufgruppe
    const alarm = game.radio.find((m) => m.to === u.callsign && /Gebietsabsicherung/.test(m.text))!;
    expect(alarm.kind).toBe('system');
    expect(alarm.group).toBeUndefined();
    const seen: number[] = [];
    for (let t = 0; t < 3_600_000 && u.task !== 'covering'; t += 1000) {
      game.tick(1000);
      if (seen[seen.length - 1] !== u.baseStatus) seen.push(u.baseStatus);
    }
    expect(seen).toEqual([2, 3, 1]);
    expect(u.task).toBe('covering');
    expect(Math.hypot(u.x - target.x, u.y - target.y)).toBeLessThan(400);
    // Ankunft wird erst nach Sprechwunsch und Sprechaufforderung gemeldet
    expect(game.radio.some((m) => m.from === u.callsign && m.kind === 'voice')).toBe(false);
    expect(u.speak?.kind).toBe('info');
    game.handle(p.id, { a: 'speakPermit', unitId: u.id });
    run(game, 600_000);
    expect(u.task).toBe('covering');
    expect(u.status).toBe(1);
    expect(game.radio.some((m) => m.from === u.callsign && /Absicherungsstandort/.test(m.text))).toBe(true);
  });

  it('kehrt mit H zur Wache zurück', () => {
    const { game, p, u, target } = setup();
    game.handle(p.id, { a: 'cover', unitIds: [u.id], stationId: target.id });
    for (let t = 0; t < 3_600_000 && u.task !== 'covering'; t += 1000) game.tick(1000);
    expect(game.handle(p.id, { a: 'sendHome', unitId: u.id })).toBeUndefined();
    expect(u.cover).toBeUndefined();
    expect(u.task).toBe('returning');
    expect(game.radio.some((m) => m.to === u.callsign && m.text === 'H – Fahren Sie Wache an')).toBe(true);
    for (let t = 0; t < 3_600_000 && u.task !== 'station'; t += 1000) game.tick(1000);
    expect(u.status).toBe(2);
    expect(game.handle(p.id, { a: 'sendHome', unitId: u.id })).toMatch(/bereits auf der Wache/);
  });

  it('bricht die Absicherung ab, wenn das Fahrzeug zu einem Einsatz alarmiert wird', () => {
    const { scn, game, p, u, target } = setup();
    game.handle(p.id, { a: 'cover', unitIds: [u.id], stationId: target.id });
    for (let t = 0; t < 3_600_000 && u.task !== 'covering'; t += 1000) game.tick(1000);
    const town = scn.towns[0];
    game.handle(p.id, { a: 'createIncident', stichwort: scn.stichworte[0].code, address: town.name, x: town.x, y: town.y, note: '', patients: 1 });
    const inc = game.incidents[0];
    expect(game.handle(p.id, { a: 'alarm', incidentId: inc.id, unitIds: [u.id] })).toBeUndefined();
    expect(u.cover).toBeUndefined();
    run(game, 20_000);
    expect(u.task).toBe('toScene');
    expect(u.status).toBe(3);
  });

  it('verlegt an einen Punkt auf der Karte und lehnt die eigene Wache ab', () => {
    const { scn, game, p, u } = setup();
    expect(game.handle(p.id, { a: 'cover', unitIds: [u.id], stationId: u.stationId })).toMatch(/gehört zu dieser Wache/);
    const town = scn.towns[1];
    expect(game.handle(p.id, { a: 'cover', unitIds: [u.id], x: town.x, y: town.y })).toBeUndefined();
    expect(u.cover?.name).toBeTruthy();
    expect(u.cover?.stationId).toBeUndefined();
  });

  it('verlegt in einen Bereitstellungsraum aus dem Editor', () => {
    const scn = quiet();
    const town = scn.towns[2];
    scn.bereitstellungsraeume = [{ id: 'br1', name: 'Parkplatz Testhausen', x: town.x, y: town.y, org: 'RD' }];
    const game = new Game(scn, { seed: 3 });
    const p = game.addPlayer('D', 'dispatcher');
    game.handle(p.id, { a: 'start' });
    const u = game.units.find((x) => x.status === 2)!;
    expect(game.handle(p.id, { a: 'cover', unitIds: [u.id], raumId: 'nix' })).toMatch(/nicht gefunden/);
    expect(game.handle(p.id, { a: 'cover', unitIds: [u.id], raumId: 'br1' })).toBeUndefined();
    expect(u.cover).toMatchObject({ name: 'Parkplatz Testhausen', raumId: 'br1' });
    for (let t = 0; t < 3_600_000 && u.task !== 'covering'; t += 1000) game.tick(1000);
    expect(u.task).toBe('covering');
    expect(u.baseStatus).toBe(1);
  });
});
