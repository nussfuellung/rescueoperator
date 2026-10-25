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

  it('setzt die Kliniken an ihre Adresse', () => {
    // Straße der Anschrift (Uniklinik: ZNA im ZOM, Missio: Klinikgelände zwischen Salvatorstraße und Mariannhillstraße)
    const ADRESSE: Record<string, string> = {
      'Universitätsklinikum Würzburg': 'Oberdürrbacher Straße',
      Juliusspital: 'Juliuspromenade',
      'KWM-Missioklinik': 'Mariannhillstraße',
      'König-Ludwig-Haus': 'Brettreichstraße',
      'Main-Klinik Ochsenfurt': 'Am Greinberg',
      'Klinik Kitzinger Land': 'Keltenstraße',
      'Klinikum Main-Spessart Lohr': 'Grafen-von-Rieneck-Straße',
      'Bezirkskrankenhaus Lohr': 'Am Sommerberg',
    };
    const byId = new Map(scn.nodes.map((n) => [n.id, n]));
    for (const [name, strasse] of Object.entries(ADRESSE)) {
      const h = scn.hospitals.find((x) => x.name === name)!;
      const d = Math.min(
        ...scn.roads.filter((r) => r.name === strasse).flatMap((r) => [byId.get(r.a)!, byId.get(r.b)!]).map((n) => Math.hypot(n.x - h.x, n.y - h.y)),
      );
      expect(d, `${name} liegt ${Math.round(d)} m von der ${strasse}`).toBeLessThan(300);
    }
    // Klinikum Lohr liegt in der Altstadt westlich des Mains, nicht im Ortsteil Sendelbach am anderen Ufer
    const lohr = scn.hospitals.find((h) => h.id === 'h_kms_lohr')!;
    const sendelbach = scn.towns.find((t) => t.name === 'Sendelbach')!;
    expect(lohr.x).toBeLessThan(sendelbach.x - 500);
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

  it('läuft eine halbe Spielstunde mit Bot-Disponenten', () => {
    const t = Date.now();
    const game = runBot(structuredClone(scn), 0.5, 5);
    const s = game.score;
    console.log(`Würzburg: ${Date.now() - t} ms, Einsätze ${s.incidentsCreated}, beendet ${s.incidentsClosed}, Hilfsfrist ${s.hilfsfristMet}/${s.hilfsfristTotal}, Ø ${Math.round(s.avgHilfsfristSec)} s`);
    expect(s.incidentsCreated).toBeGreaterThan(3);
  }, 120_000);
});
