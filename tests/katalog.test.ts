// Leitstellen-Katalog: Client gegen einen Server im Speicher, der den Vertrag aus shared/protocol.ts umsetzt.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { beforeEach, describe, expect, it } from 'vitest';
import { editorHinweise } from '../shared/editorpruefung';
import { emptyScenario, generateScenario } from '../shared/mapgen';
import { KATALOG_SCHLUESSEL_HEADER, type KatalogEintrag, type KatalogHochladen } from '../shared/protocol';
import type { Scenario } from '../shared/types';

const mem = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
};

const { entfernen, herunterladen, KatalogFehler, ladeKatalog, ladeMeine, setzeSichtbarkeit, veroeffentlichen } = await import('../src/renderer/katalog');

/** Minimaler Katalog-Server nach Vertrag */
function katalogServer() {
  const db = new Map<string, { key: string; e: KatalogEintrag; gz: string }>();
  const json = (status: number, body?: unknown) => new Response(body === undefined ? null : JSON.stringify(body), { status });
  return async (url: string, init: RequestInit = {}) => {
    const u = new URL(url);
    const key = (init.headers as Record<string, string> | undefined)?.[KATALOG_SCHLUESSEL_HEADER] ?? '';
    const m = /^\/api\/katalog(?:\/(.+))?$/.exec(u.pathname);
    if (!m) return json(404);
    const id = m[1] ? decodeURIComponent(m[1]) : '';
    const method = init.method ?? 'GET';
    if (!id) return json(200, { version: '0.11.0', leitstellen: [...db.values()].filter((x) => x.e.sichtbarkeit === 'offen').map((x) => x.e) });
    if (id === 'meine') return json(200, { version: '0.11.0', leitstellen: [...db.values()].filter((x) => x.key === key).map((x) => x.e) });
    const cur = db.get(id);
    if (method === 'GET') {
      if (!cur || (cur.e.sichtbarkeit === 'privat' && cur.key !== key)) return json(404, { error: 'Leitstelle nicht gefunden' });
      if (cur.key !== key) cur.e.downloads++;
      return json(200, { eintrag: cur.e, szenarioGz: cur.gz });
    }
    if (cur && cur.key !== key) return json(403, { error: 'Diese Leitstelle gehört einem anderen Autor' });
    if (method === 'PUT') {
      const b = JSON.parse(String(init.body)) as KatalogHochladen;
      const text = gunzipSync(Buffer.from(b.szenarioGz, 'base64')).toString('utf8');
      const scn = JSON.parse(text) as Scenario;
      if (scn.id !== id) return json(400, { error: 'Kennung passt nicht' });
      const now = Date.now();
      const e: KatalogEintrag = {
        id,
        ilsName: scn.ilsName,
        name: scn.name,
        autor: b.autor,
        beschreibung: b.beschreibung,
        sichtbarkeit: b.sichtbarkeit,
        orte: scn.towns.length,
        wachen: scn.stations.length,
        fahrzeuge: scn.stations.reduce((n, s) => n + s.vehicles.length, 0),
        kliniken: scn.hospitals.length,
        echteKarte: !!scn.geo,
        groesse: Buffer.from(b.szenarioGz, 'base64').length,
        hash: createHash('sha256').update(text).digest('hex'),
        veroeffentlicht: cur?.e.veroeffentlicht ?? now,
        aktualisiert: now,
        downloads: cur?.e.downloads ?? 0,
        spielVersion: b.spielVersion,
      };
      db.set(id, { key, e, gz: b.szenarioGz });
      return json(200, e);
    }
    if (!cur) return json(404, { error: 'Leitstelle nicht gefunden' });
    if (method === 'PATCH') {
      cur.e.sichtbarkeit = JSON.parse(String(init.body)).sichtbarkeit;
      return json(200, cur.e);
    }
    if (method === 'DELETE') {
      db.delete(id);
      return new Response(null, { status: 204 });
    }
    return json(405);
  };
}

const ADDR = 'https://katalog.test';

describe('Leitstellen-Katalog', () => {
  beforeEach(() => {
    mem.clear();
    globalThis.fetch = katalogServer() as typeof fetch;
  });

  it('veröffentlicht, stellt privat und wieder öffentlich, entfernt', async () => {
    const scn = generateScenario({ seed: 7, towns: 4, name: 'Testkreis' });
    scn.autor = 'Maggus';
    scn.beschreibung = 'Zum Testen';
    const e = await veroeffentlichen(ADDR, scn, 'offen');
    expect(e).toMatchObject({ id: scn.id, autor: 'Maggus', sichtbarkeit: 'offen', orte: 4 });
    expect((await ladeKatalog(ADDR)).leitstellen.map((x) => x.id)).toEqual([scn.id]);

    await setzeSichtbarkeit(ADDR, scn.id, 'privat');
    expect((await ladeKatalog(ADDR)).leitstellen).toEqual([]);
    expect((await ladeMeine(ADDR)).leitstellen[0].sichtbarkeit).toBe('privat');

    await setzeSichtbarkeit(ADDR, scn.id, 'offen');
    expect((await ladeKatalog(ADDR)).leitstellen).toHaveLength(1);

    await entfernen(ADDR, scn.id);
    expect((await ladeMeine(ADDR)).leitstellen).toEqual([]);
  });

  it('andere Spieler laden öffentliche Leitstellen herunter, private nicht, und dürfen fremde nicht überschreiben', async () => {
    const scn = generateScenario({ seed: 9, towns: 3, name: 'Fremd' });
    scn.autor = 'Anna';
    await veroeffentlichen(ADDR, scn, 'offen');

    // Andere Installation = anderer Autorenschlüssel
    mem.clear();
    const geladen = await herunterladen(ADDR, scn.id);
    expect(geladen.stations.length).toBe(scn.stations.length);
    expect(geladen.herkunft).toEqual({ server: ADDR, id: scn.id, autor: 'Anna' });
    expect((await ladeKatalog(ADDR)).leitstellen[0].downloads).toBe(1);

    const err = await veroeffentlichen(ADDR, geladen, 'offen').catch((x) => x);
    expect(err).toBeInstanceOf(KatalogFehler);
    expect(err.status).toBe(403);
  });

  it('meldet einen Server ohne Katalog verständlich', async () => {
    globalThis.fetch = (async () => new Response('Not found', { status: 404 })) as typeof fetch;
    await expect(ladeKatalog(ADDR)).rejects.toThrow(/noch keinen Leitstellen-Katalog/);
  });
});

describe('Editor-Hinweise', () => {
  it('weisen auf fehlende Fahrzeuge, Fachrichtungen und AAO-Lücken hin', () => {
    const scn = emptyScenario('Leer');
    scn.hospitals.push({ id: 'h1', name: 'Kreisklinik', x: 0, y: 0, specialties: ['Innere Medizin'] });
    scn.stichworte[0].aao = {};
    const h = editorHinweise(scn);
    expect(h.some((x) => x.includes('transportieren'))).toBe(true);
    expect(h.some((x) => x.includes('Kardiologie (HKL)'))).toBe(true);
    expect(h.some((x) => x.includes('keine Fahrzeuge in der AAO'))).toBe(true);
  });

  it('ILS Würzburg hat keine groben Lücken', () => {
    const scn = JSON.parse(gunzipSync(readFileSync(new URL('../assets/ils-wuerzburg.json.gz', import.meta.url))).toString('utf8')) as Scenario;
    const h = editorHinweise(scn);
    console.log(h.join('\n'));
    expect(h.filter((x) => x.includes('transportieren') || x.includes('unbekannten'))).toEqual([]);
  });
});
