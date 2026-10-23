// WebSocket-Server für Multiplayer im LAN. Läuft im Electron-Hauptprozess (Host) oder eigenständig.
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { networkInterfaces } from 'node:os';
import { WebSocketServer, type WebSocket } from 'ws';
import type { ClientMsg, ServerMsg } from '../shared/protocol';
import type { Scenario } from '../shared/types';
import { Game } from './game';
import { Piper } from './tts';

export class GameServer {
  game: Game;
  private http?: Server;
  private wss?: WebSocketServer;
  private clients = new Map<WebSocket, string | null>();
  private timers: NodeJS.Timeout[] = [];
  /** Kopplungscode je Platz für Tablets und Handys */
  private linkCodes = new Map<string, string>();
  port = 0;
  /** Verzeichnis der gebauten Oberfläche, die Tablets im LAN als Web-App laden */
  staticDir?: string;
  /** Neuronale Sprachausgabe; wird beim ersten Abruf gesucht */
  private piper?: Piper;
  private piperTest?: Promise<boolean>;

  constructor(scenario: Scenario, seed?: number) {
    this.game = new Game(scenario, {
      seed,
      events: {
        speech: (text) => this.broadcast({ t: 'speech', text }),
        toast: (playerId, text, level) => {
          if (!playerId || playerId === '*') this.broadcast({ t: 'toast', text, level });
          else for (const [ws, pid] of this.clients) if (pid === playerId) this.send(ws, { t: 'toast', text, level });
        },
      },
    });
  }

  start(port: number): Promise<number> {
    return new Promise((resolve, reject) => {
      this.http = createServer((req, res) => {
        if ((req.url ?? '').startsWith('/tts')) void this.serveTts(req, res);
        else this.serveStatic(req, res);
      });
      this.wss = new WebSocketServer({ server: this.http, maxPayload: 1 << 20 });
      this.wss.on('connection', (ws) => this.onConnection(ws));
      this.http.once('error', reject);
      this.http.listen(port, '0.0.0.0', () => {
        const addr = this.http!.address();
        this.port = typeof addr === 'object' && addr ? addr.port : port;
        let last = Date.now();
        this.timers.push(
          setInterval(() => {
            const now = Date.now();
            this.game.tick(Math.min(1000, now - last));
            last = now;
          }, 100),
          setInterval(() => this.broadcastState(), 250),
        );
        resolve(this.port);
      });
    });
  }

  /** Sprachausgabe für Oberfläche und Tablets: /tts/info und /tts?stimme=…&tempo=…&text=… */
  private async serveTts(req: IncomingMessage, res: ServerResponse) {
    const head = { 'access-control-allow-origin': '*', 'cache-control': 'no-store' };
    this.piper ??= new Piper(this.staticDir ? [this.staticDir] : []);
    this.piperTest ??= this.piper.selfTest();
    const ok = await this.piperTest;
    const url = new URL(req.url ?? '/', 'http://x');
    if (url.pathname === '/tts/info') {
      res.writeHead(200, { ...head, 'content-type': 'application/json' });
      res.end(JSON.stringify({ ...this.piper.info(), available: ok && this.piper.available }));
      return;
    }
    const text = url.searchParams.get('text') ?? '';
    if (!ok || !text) {
      res.writeHead(503, head);
      res.end();
      return;
    }
    try {
      const wav = await this.piper.synth(text, url.searchParams.get('stimme') ?? '', Math.max(0.6, Math.min(1.6, Number(url.searchParams.get('tempo')) || 1)));
      res.writeHead(200, { ...head, 'content-type': 'audio/wav', 'content-length': wav.length });
      res.end(wav);
    } catch {
      res.writeHead(500, head);
      res.end();
    }
  }

  /** Liefert die Web-App an Tablets und Handys im selben Netz aus */
  private serveStatic(req: IncomingMessage, res: ServerResponse) {
    const dir = this.staticDir;
    const path = decodeURIComponent((req.url ?? '/').split('?')[0]);
    if (!dir || req.method !== 'GET') {
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
      res.end(`rescue.Operator-Server: ${this.game.scn.ilsName}\n`);
      return;
    }
    const rel = normalize(path === '/' ? '/index.html' : path).replace(/^([/\\])+/, '');
    const file = join(dir, rel);
    // Nichts außerhalb des Oberflächenordners ausliefern, große Kartendaten nicht
    if (!file.startsWith(join(dir)) || rel.includes('..') || /\.gz$/.test(rel) || !existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Nicht gefunden');
      return;
    }
    const types: Record<string, string> = {
      '.html': 'text/html; charset=utf-8',
      '.js': 'text/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.svg': 'image/svg+xml',
      '.png': 'image/png',
      '.json': 'application/json',
      '.wasm': 'application/wasm',
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
    };
    res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(readFileSync(file));
  }

  private linkCodeFor(pid: string) {
    for (const [code, p] of this.linkCodes) if (p === pid) return code;
    const code = randomBytes(6).toString('base64url');
    this.linkCodes.set(code, pid);
    return code;
  }

  stop(): Promise<void> {
    this.timers.forEach(clearInterval);
    this.timers = [];
    for (const ws of this.clients.keys()) ws.close();
    return new Promise((resolve) => {
      this.wss?.close();
      if (this.http) this.http.close(() => resolve());
      else resolve();
    });
  }

  private send(ws: WebSocket, msg: ServerMsg) {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
  }

  private broadcast(msg: ServerMsg) {
    const data = JSON.stringify(msg);
    for (const [ws, pid] of this.clients) if (pid && ws.readyState === ws.OPEN) ws.send(data);
  }

  private broadcastState() {
    this.broadcast({ t: 'state', state: this.game.publicState() });
  }

  private onConnection(ws: WebSocket) {
    this.clients.set(ws, null);
    ws.on('message', (raw) => {
      let msg: ClientMsg;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }
      const pid = this.clients.get(ws);
      if (msg.t === 'hello' && !pid) {
        let id: string;
        if (msg.link) {
          // Gekoppeltes Gerät: gleicher Platz wie der Rechner, der den Code angezeigt hat
          const linked = this.linkCodes.get(msg.link);
          if (!linked || !this.game.players.some((p) => p.id === linked)) {
            this.send(ws, { t: 'error', text: 'Kopplungscode ungültig oder Platz nicht mehr besetzt. Bitte den QR-Code am Rechner neu scannen.' });
            ws.close();
            return;
          }
          id = linked;
        } else {
          id = this.game.addPlayer(String(msg.name ?? ''), msg.role ?? 'dispatcher').id;
        }
        this.clients.set(ws, id);
        const scn = msg.lite ? { ...this.game.scn, nodes: [], roads: [], addresses: [] } : this.game.scn;
        this.send(ws, { t: 'welcome', playerId: id, scenario: scn, linkCode: this.linkCodeFor(id) });
        this.send(ws, { t: 'state', state: this.game.publicState() });
        return;
      }
      if (msg.t === 'ping') {
        this.send(ws, { t: 'pong' });
        return;
      }
      if (msg.t === 'action' && pid) {
        try {
          const err = this.game.handle(pid, msg.action);
          if (err) this.send(ws, { t: 'toast', text: err, level: 'warn' });
        } catch (e) {
          console.error('Fehler bei Aktion', msg.action, e);
          this.send(ws, { t: 'toast', text: 'Interner Fehler bei der Aktion', level: 'error' });
        }
        this.broadcastState();
      }
    });
    ws.on('close', () => {
      const pid = this.clients.get(ws);
      this.clients.delete(ws);
      // Ein Platz bleibt, solange noch ein Gerät (Rechner oder Tablet) verbunden ist
      if (pid && ![...this.clients.values()].includes(pid)) {
        this.game.removePlayer(pid);
        for (const [code, p] of this.linkCodes) if (p === pid) this.linkCodes.delete(code);
      }
    });
  }
}

export function lanAddresses(): string[] {
  const out: string[] = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const i of list ?? []) if (i.family === 'IPv4' && !i.internal) out.push(i.address);
  }
  return out;
}
