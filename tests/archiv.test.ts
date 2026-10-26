import { describe, expect, it } from 'vitest';
import { generateScenario } from '../shared/mapgen';
import { Game } from '../server/game';

function setup() {
  const scn = generateScenario({ seed: 4711, towns: 8 });
  scn.settings.callsPerHour = 0;
  scn.settings.bmaPerHour = 0;
  const game = new Game(scn, { seed: 1 });
  const p = game.addPlayer('D', 'dispatcher');
  game.handle(p.id, { a: 'start' });
  const town = scn.towns[1];
  game.handle(p.id, { a: 'createIncident', stichwort: 'THL 1', address: 'Archivweg 1', x: town.x, y: town.y, note: '', patients: 0 });
  return { game, p, inc: game.incidents[0] };
}

describe('Einsatzarchiv', () => {
  it('verschiebt abgeschlossene Einsätze nach 10 min ins Archiv statt sie zu löschen', () => {
    const { game, p, inc } = setup();
    game.handle(p.id, { a: 'closeIncident', incidentId: inc.id });
    for (let t = 0; t < 11 * 60_000; t += 1000) game.tick(1000);
    expect(game.incidents.find((i) => i.id === inc.id)).toBeUndefined();
    const archiv = game.publicState().archiv!;
    expect(archiv.map((a) => a.nr)).toEqual([inc.nr]);
    expect(archiv[0].address).toBe('Archivweg 1');
  });

  it('eröffnet einen archivierten Einsatz wieder, ohne die Wertung doppelt zu zählen', () => {
    const { game, p, inc } = setup();
    game.handle(p.id, { a: 'closeIncident', incidentId: inc.id });
    for (let t = 0; t < 11 * 60_000; t += 1000) game.tick(1000);
    const punkte = game.score.points;
    const geschlossen = game.score.incidentsClosed;
    game.handle(p.id, { a: 'reopenIncident', incidentId: inc.id });
    const wieder = game.incidents.find((i) => i.id === inc.id)!;
    expect(wieder.status).toBe('offen');
    expect(wieder.closedAt).toBeUndefined();
    expect(wieder.log.at(-1)!.text).toBe('Einsatz wieder eröffnet');
    expect(game.publicState().archiv).toEqual([]);
    expect(game.score.incidentsClosed).toBe(geschlossen - 1);
    game.handle(p.id, { a: 'closeIncident', incidentId: inc.id });
    expect(game.score.points).toBe(punkte);
    expect(game.score.incidentsClosed).toBe(geschlossen);
  });

  it('lehnt das Wiedereröffnen eines laufenden Einsatzes ab', () => {
    const { game, p, inc } = setup();
    expect(game.handle(p.id, { a: 'reopenIncident', incidentId: inc.id })).toMatch(/nicht abgeschlossen/);
  });
});
