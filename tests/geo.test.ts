import { describe, expect, it } from 'vitest';
import { generateScenario, validateScenario } from '../shared/mapgen';
import { RoadGraph, geocode, reverseGeocode } from '../shared/geo';

describe('Kartengenerator und GIS', () => {
  const scn = generateScenario({ seed: 4711, towns: 8 });

  it('erzeugt ein gültiges Szenario', () => {
    expect(scn.towns.length).toBe(8);
    expect(validateScenario(scn)).toEqual([]);
  });

  it('alle Wachen und Kliniken sind über das Straßennetz erreichbar', () => {
    const g = new RoadGraph(scn);
    const start = g.nearestNode(scn.stations[0]);
    const { time } = g.dijkstra(start);
    for (const p of [...scn.stations, ...scn.hospitals]) {
      expect(isFinite(time[g.nearestNode(p)])).toBe(true);
    }
  });

  it('Geokodierung und Rückwärtsgeokodierung passen zusammen', () => {
    const road = scn.roads.find((r) => r.type === 'ortsstrasse' && r.numA! > 5)!;
    const hit = geocode(scn, road.name, road.town!, road.numA! + 2)!;
    expect(hit).not.toBeNull();
    const back = reverseGeocode(scn, hit.point)!;
    expect(back.street).toBe(road.name);
    expect(back.town).toBe(road.town);
  });
});
