// WebSocket-Server für Multiplayer im LAN. Läuft im Electron-Hauptprozess (Host) oder eigenständig.
import { createServer, type Server } from 'node:http';
import { networkInterfaces } from 'node:os';
import { WebSocketServer, type WebSocket } from 'ws';
import type { ClientMsg, ServerMsg } from '../shared/protocol';
import type { Scenario } from '../shared/types';
import { Game } from './game';

export class GameServer {
  game: Game;
  private http?: Server;
  private wss?: WebSocketServer;
  private clients = new Map<WebSocket, string | null>();
  private timers: NodeJS.Timeout[] = [];
  port = 0;

  constructor(scenario: Scenario, seed?: number) {
    this.game = new Game(scenario, {
      seed,
      events: {
        speech: (text) => this.broadcast({ t: 'speech', text }),
      },
    });
  }

  start(port: number): Promise<number> {
    return new Promise((resolve, reject) => {
      this.http = createServer((_req, res) => {
        res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
        res.end(`Leitstellensimulator-Server: ${this.game.scn.ilsName}\n`);
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
        const p = this.game.addPlayer(String(msg.name ?? ''), msg.role ?? 'dispatcher');
        this.clients.set(ws, p.id);
        this.send(ws, { t: 'welcome', playerId: p.id, scenario: this.game.scn });
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
      if (pid) this.game.removePlayer(pid);
      this.clients.delete(ws);
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
