import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import type { Scenario } from '../shared/types';
import { validateScenario } from '../shared/mapgen';
import { RoadGraph, geocode } from '../shared/geo';
import { runBot } from './bot';

const scn = JSON.parse(gunzipSync(readFileSync(new URL('../assets/ils-wuerzburg.json.gz', import.meta.url))).toString('utf8')) as Scenario;

describe('Musterleitstelle ILS Würzburg', () => {
  it('ist gültig und hat die echten Kliniken', () => {
    expect(validateScenario(scn)).toEqual([]);
    expect(scn.hospitals.map((h) => h.name)).toContain('Universitätsklinikum Würzburg');
    expect(scn.geo).toBeTruthy();
  });

  it('routet realistisch: Uniklinik nach Kitzingen über echte Straßen', () => {
    const g = new RoadGraph(scn);
    const uni = scn.hospitals.find((h) => h.name === 'Universitätsklinikum Würzburg')!;
    const kt = scn.towns.find((t) => t.name === 'Kitzingen')!;
    const r = g.route(uni, kt)!;
    const km = r.points.slice(1).reduce((s, p, i) => s + Math.hypot(p.x - r.points[i].x, p.y - r.points[i].y), 0) / 1000;
    console.log(`Uniklinik -> Kitzingen: ${km.toFixed(1)} km, ${Math.round(r.seconds / 60)} min ohne Sonderrechte`);
    // Real: etwa 20 bis 25 km und 20 bis 30 Minuten
    expect(km).toBeGreaterThan(17);
    expect(km).toBeLessThan(30);
    expect(r.seconds / 60).toBeGreaterThan(14);
    expect(r.seconds / 60).toBeLessThan(35);
  });

  it('findet Straßen in Würzburg', () => {
    expect(geocode(scn, 'Juliuspromenade', 'Würzburg', '10')).toBeTruthy();
  });

  it('läuft eine Spielstunde mit Bot-Disponenten', () => {
    const t = Date.now();
    const game = runBot(structuredClone(scn), 1, 5);
    const s = game.score;
    console.log(`Würzburg: ${Date.now() - t} ms, Einsätze ${s.incidentsCreated}, beendet ${s.incidentsClosed}, Hilfsfrist ${s.hilfsfristMet}/${s.hilfsfristTotal}, Ø ${Math.round(s.avgHilfsfristSec)} s`);
    expect(s.incidentsCreated).toBeGreaterThan(5);
  }, 120_000);
});
