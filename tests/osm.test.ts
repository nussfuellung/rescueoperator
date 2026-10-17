import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { importOsm, latLonToLocal, localToLatLon } from '../shared/osmimport';
import { RoadGraph, geocode, reverseGeocode } from '../shared/geo';
import { validateScenario } from '../shared/mapgen';
import { runBot } from './bot';

// Echte OSM-Daten (Liechtenstein 2013, aus den Testdaten von osm2pgsql), umgewandelt ins Overpass-Format
const json = readFileSync(new URL('./fixtures/osm-vaduz-2013.json', import.meta.url), 'utf8');
const bbox = { south: 47.08, west: 9.45, north: 47.2, east: 9.6 };

describe('Import echter Karten', () => {
  const { scenario: scn, notes } = importOsm(json, { name: 'Vaduz', bbox });

  it('erzeugt ein spielbares Szenario', () => {
    console.log(notes.join('\n'));
    expect(validateScenario(scn)).toEqual([]);
    expect(scn.roads.length).toBeGreaterThan(500);
    expect(scn.towns.map((t) => t.name)).toContain('Vaduz');
    expect(scn.addresses!.length).toBeGreaterThan(100);
    expect(scn.width).toBeGreaterThan(10000);
  });

  it('projiziert hin und zurück exakt', () => {
    const p = latLonToLocal(scn.geo!, { lat: 47.141, lon: 9.521 });
    const back = localToLatLon(scn.geo!, p);
    expect(back.lat).toBeCloseTo(47.141, 6);
    expect(back.lon).toBeCloseTo(9.521, 6);
    // Ein Breitengrad-Hundertstel sind etwa 1,11 km
    const q = latLonToLocal(scn.geo!, { lat: 47.151, lon: 9.521 });
    expect(Math.abs(p.y - q.y)).toBeGreaterThan(1100);
    expect(Math.abs(p.y - q.y)).toBeLessThan(1125);
  });

  it('findet echte Hausnummern und routet über echte Straßen', () => {
    const a = scn.addresses![Math.floor(scn.addresses!.length / 2)];
    const hit = geocode(scn, a.street, a.town, a.number)!;
    expect(hit).toBeTruthy();
    expect(Math.hypot(hit.point.x - a.x, hit.point.y - a.y)).toBeLessThan(40);
    expect(reverseGeocode(scn, { x: a.x + 3, y: a.y - 2 })!.text).toContain(a.street);
    const g = new RoadGraph(scn);
    const st = scn.stations[0];
    const r = g.route(st, a)!;
    expect(r).toBeTruthy();
    // Straßenweg ist länger als Luftlinie, aber nicht absurd
    const air = Math.hypot(st.x - a.x, st.y - a.y);
    const along = r.points.slice(1).reduce((s, p, i) => s + Math.hypot(p.x - r.points[i].x, p.y - r.points[i].y), 0);
    expect(along).toBeGreaterThanOrEqual(air * 0.99);
    expect(along).toBeLessThan(air * 4 + 2000);
  });

  it('läuft eine Spielstunde mit Bot-Disponenten', () => {
    const game = runBot(structuredClone(scn), 1, 3);
    const s = game.score;
    console.log(`OSM: Punkte ${s.points}, Einsätze ${s.incidentsCreated}, beendet ${s.incidentsClosed}, Ø Hilfsfrist ${Math.round(s.avgHilfsfristSec)} s`);
    expect(s.incidentsCreated).toBeGreaterThan(5);
    expect(s.incidentsClosed).toBeGreaterThan(0);
    // Anrufer nennen echte Adressen
    const truths = [...(game as unknown as { callTruth: Map<string, { address: string }> }).callTruth.values()];
    const said = truths.map((t) => t.address).join(' | ');
    const streets = new Set(scn.addresses!.map((a) => a.street));
    expect([...streets].some((s) => said.includes(s))).toBe(true);
  }, 60_000);
});
