// Server: Web-App ausliefern und Tablets per Kopplungscode an einen Platz hängen.
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { GameServer } from '../server/server';
import { generateScenario } from '../shared/mapgen';
import type { ServerMsg } from '../shared/protocol';

const srv = new GameServer(generateScenario({ seed: 7, towns: 4 }), 7);
const dir = mkdtempSync(join(tmpdir(), 'lst-web-'));
writeFileSync(join(dir, 'index.html'), '<!doctype html><title>x</title>');
srv.staticDir = dir;
afterAll(() => srv.stop());

function open(port: number, hello: object): Promise<{ ws: WebSocket; first: ServerMsg }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    ws.on('open', () => ws.send(JSON.stringify({ t: 'hello', ...hello })));
    ws.once('message', (d) => resolve({ ws, first: JSON.parse(String(d)) }));
    ws.on('error', reject);
  });
}

describe('Tablet-Kopplung', () => {
  it('liefert die Web-App aus und sperrt Pfade außerhalb', async () => {
    const port = await srv.start(0);
    const ok = await fetch(`http://127.0.0.1:${port}/?geraet=abc`);
    expect(ok.status).toBe(200);
    expect(await ok.text()).toContain('<title>x</title>');
    expect((await fetch(`http://127.0.0.1:${port}/%2e%2e/%2e%2e/etc/passwd`)).status).toBe(404);
  });

  it('hängt das Tablet an denselben Platz und schickt eine leichte Karte', async () => {
    const desk = await open(srv.port, { name: 'Melvin', role: 'calltaker' });
    expect(desk.first.t).toBe('welcome');
    if (desk.first.t !== 'welcome') return;
    expect(desk.first.linkCode).toBeTruthy();
    expect(desk.first.scenario.roads.length).toBeGreaterThan(0);
    const tab = await open(srv.port, { name: 'Tablet', role: 'dispatcher', link: desk.first.linkCode, lite: true });
    expect(tab.first.t).toBe('welcome');
    if (tab.first.t !== 'welcome') return;
    expect(tab.first.playerId).toBe(desk.first.playerId);
    expect(tab.first.scenario.roads.length).toBe(0);
    expect(srv.game.players.length).toBe(1);
    // Platz bleibt, solange das Tablet verbunden ist
    desk.ws.close();
    await new Promise((r) => setTimeout(r, 100));
    expect(srv.game.players.length).toBe(1);
    tab.ws.close();
    await new Promise((r) => setTimeout(r, 100));
    expect(srv.game.players.length).toBe(0);
    const bad = await open(srv.port, { name: 'x', link: desk.first.linkCode, lite: true });
    expect(bad.first.t).toBe('error');
  });
});
