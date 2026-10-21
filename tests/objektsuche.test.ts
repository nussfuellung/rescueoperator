import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import type { Scenario } from '../shared/types';
import { nearestObject, searchObjects } from '../shared/geo';

const scn = JSON.parse(gunzipSync(readFileSync(new URL('../assets/ils-wuerzburg.json.gz', import.meta.url))).toString('utf8')) as Scenario;

describe('Objektsuche in der Einsatzmaske', () => {
  it('findet jedes Objekt über seinen Namen', () => {
    for (const o of scn.objects) {
      const hits = searchObjects(scn, o.name, 50);
      expect(hits.map((h) => h.obj.id), o.name).toContain(o.id);
    }
  });

  it('unterscheidet gleichnamige Objekte über den Ort', () => {
    const gs = searchObjects(scn, 'Grundschule', 100).filter((h) => h.obj.name === 'Grundschule');
    expect(gs.length).toBeGreaterThan(1);
    for (const h of gs) {
      expect(h.town).toBeTruthy();
      const narrowed = searchObjects(scn, `grundschule ${h.town}`, 100);
      expect(narrowed.map((x) => x.obj.id)).toContain(h.obj.id);
    }
  });

  it('ignoriert Groß-/Kleinschreibung und Umlaute', () => {
    const o = scn.objects.find((x) => /[äöüß]/i.test(x.name))!;
    expect(o).toBeTruthy();
    const ascii = o.name.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');
    expect(searchObjects(scn, ascii, 50).map((h) => h.obj.id)).toContain(o.id);
  });

  it('nennt Treffer am Namensanfang zuerst', () => {
    const hits = searchObjects(scn, 'St.', 8);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].obj.name.toLowerCase().startsWith('st')).toBe(true);
  });

  it('schlägt am Objektstandort das richtige Objekt vor', () => {
    for (const o of scn.objects) {
      const near = nearestObject(scn, o)!;
      expect(Math.hypot(near.x - o.x, near.y - o.y), o.name).toBe(0);
    }
    expect(nearestObject(scn, { x: -1e7, y: -1e7 })).toBeNull();
  });
});
