import { describe, expect, it } from 'vitest';
import { generateScenario } from '../shared/mapgen';
import { computeProposal } from '../shared/dispatch';
import { RoadGraph } from '../shared/geo';
import { Game } from '../server/game';
import type { NachbarLeitstelle } from '../shared/types';

const setup = (nachbar: Partial<NachbarLeitstelle> = {}) => {
  const scn = generateScenario({ seed: 4711, towns: 8 });
  scn.settings.callsPerHour = 0;
  scn.settings.bmaPerHour = 0;
  const town = scn.towns[0];
  scn.nachbarn = [
    {
      id: 'nb1',
      name: 'ILS Nachbarhausen',
      ablehnung: 0,
      // Wache 12 km westlich außerhalb der Karte
      fahrzeuge: [{ id: 'f1', callsign: 'Rotkreuz Nachbarhausen 71/1', type: 'RTW', wache: 'RW Nachbarhausen', x: -12000, y: town.y }],
      ...nachbar,
    },
  ];
  const game = new Game(scn, { seed: 5 });
  const p = game.addPlayer('D', 'dispatcher');
  game.handle(p.id, { a: 'start' });
  game.handle(p.id, { a: 'createIncident', stichwort: 'RD 1', address: town.name, x: town.x, y: town.y, note: '', patients: 0 });
  const inc = game.incidents[0];
  return { scn, game, p, inc };
};
const tickUntil = (game: Game, ok: () => boolean, maxMs = 3_600_000) => {
  for (let t = 0; t < maxMs && !ok(); t += 1000) game.tick(1000);
};

describe('ESWL', () => {
  it('Nachbar-ILS entsendet ein Fahrzeug, das sich beim Ein- und Ausfahren im Funk meldet', () => {
    const { scn, game, p, inc } = setup();
    expect(game.handle(p.id, { a: 'eswl', incidentId: inc.id, nachbarId: 'nb1', type: 'RTW' })).toBeUndefined();
    expect(inc.eswl?.[0].status).toBe('angefragt');
    tickUntil(game, () => inc.eswl?.[0].status !== 'angefragt');
    expect(inc.eswl?.[0].status).toBe('zugesagt');
    const u = game.units.find((x) => x.fremd)!;
    expect(u.callsign).toBe('Rotkreuz Nachbarhausen 71/1');
    expect(inc.unitIds).toContain(u.id);
    expect(u.fremd!.imBereich).toBe(false);
    tickUntil(game, () => u.task === 'onScene');
    expect(u.task).toBe('onScene');
    const ein = game.radio.find((m) => m.from === u.callsign && /in Ihren Bereich ein/.test(m.text));
    expect(ein?.group).toBeDefined();
    expect(scn.tmoGroups!.find((g) => g.id === ein!.group)?.use).toBe('RD');
    // Nicht für die eigene Disposition: kein Vorschlag, keine Alarmierung, keine Gebietsabsicherung
    u.incidentId = undefined;
    expect(computeProposal(scn, new RoadGraph(scn), game.units, inc, { RTW: 5 }).some((x) => x.unitId === u.id)).toBe(false);
    u.incidentId = inc.id;
    u.hasPatient = false;
    expect(game.handle(p.id, { a: 'releaseUnit', unitId: u.id })).toBeUndefined();
    tickUntil(game, () => !game.units.includes(u));
    expect(game.units.includes(u)).toBe(false);
    expect(game.radio.some((m) => m.from === u.callsign && /verlassen Ihren Bereich/.test(m.text) && m.group === ein!.group)).toBe(true);
  });

  it('lehnt ab, wenn die Nachbar-ILS kein Fahrzeug frei hat', () => {
    const { game, p, inc } = setup({ ablehnung: 1 });
    game.handle(p.id, { a: 'eswl', incidentId: inc.id, nachbarId: 'nb1', type: 'RTW' });
    tickUntil(game, () => inc.eswl?.[0].status !== 'angefragt');
    expect(inc.eswl?.[0].status).toBe('abgelehnt');
    expect(game.units.some((u) => u.fremd)).toBe(false);
    expect(inc.log.some((l) => /lehnt ab/.test(l.text))).toBe(true);
  });

  it('jedes Fahrzeug nur einmal: die zweite Anforderung wird abgelehnt', () => {
    const { game, p, inc } = setup();
    game.handle(p.id, { a: 'eswl', incidentId: inc.id, nachbarId: 'nb1', type: 'RTW' });
    game.handle(p.id, { a: 'eswl', incidentId: inc.id, nachbarId: 'nb1', type: 'RTW' });
    tickUntil(game, () => !!inc.eswl?.every((r) => r.status !== 'angefragt'));
    expect(inc.eswl!.map((r) => r.status).sort()).toEqual(['abgelehnt', 'zugesagt']);
  });

  it('Typen, die die Nachbar-ILS nicht hat, kann man nicht anfordern', () => {
    const { game, p, inc } = setup();
    expect(game.handle(p.id, { a: 'eswl', incidentId: inc.id, nachbarId: 'nb1', type: 'RTH' })).toMatch(/hat kein/);
  });
});
