// WebSocket-Verbindung zum Spielserver mit einfachem Store für React.
import { useSyncExternalStore } from 'react';
import type { Action, ClientMsg, ServerMsg, Sichtbarkeit, SitzungInfo } from '../../shared/protocol';
import type { PublicState, Role, Scenario } from '../../shared/types';

export interface Toast {
  id: number;
  text: string;
  level: 'info' | 'warn' | 'error';
}

export interface NetSnapshot {
  status: 'idle' | 'connecting' | 'online' | 'closed';
  playerId?: string;
  scenario?: Scenario;
  state?: PublicState;
  toasts: Toast[];
  error?: string;
  /** Code, mit dem ein Tablet diesen Platz übernehmen kann */
  linkCode?: string;
  /** Adresse des Servers (für den Kopplungs-Link) */
  url?: string;
  /** Online-Sitzung, wenn mit dem Multiplayer-Server verbunden */
  sitzung?: SitzungInfo;
}

type HelloOpts = Omit<Extract<ClientMsg, { t: 'hello' }>, 't' | 'name' | 'role'>;

export class Connection {
  private ws?: WebSocket;
  private listeners = new Set<() => void>();
  private toastId = 0;
  snap: NetSnapshot = { status: 'idle', toasts: [] };

  private set(patch: Partial<NetSnapshot>) {
    this.snap = { ...this.snap, ...patch };
    this.listeners.forEach((l) => l());
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getSnapshot = () => this.snap;

  connect(url: string, name: string, role: Role, opts: HelloOpts = {}): Promise<void> {
    this.close();
    this.set({ status: 'connecting', error: undefined, state: undefined, scenario: undefined, sitzung: undefined, url });
    return new Promise((resolve, reject) => {
      let settled = false;
      const ws = new WebSocket(url);
      this.ws = ws;
      ws.onopen = () => this.raw({ t: 'hello', name, role, ...opts });
      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data) as ServerMsg;
        switch (msg.t) {
          case 'welcome':
            this.set({ status: 'online', playerId: msg.playerId, scenario: msg.scenario, linkCode: msg.linkCode, sitzung: msg.sitzung });
            if (!settled) {
              settled = true;
              resolve();
            }
            break;
          case 'state':
            this.set({ state: msg.state });
            break;
          case 'sitzung':
            this.set({ sitzung: msg.sitzung });
            break;
          case 'toast':
            this.toast(msg.text, msg.level);
            break;
          case 'error':
            this.set({ error: msg.text });
            if (!settled) {
              settled = true;
              reject(new Error(msg.text));
            }
            break;
        }
      };
      ws.onerror = () => {
        if (!settled) {
          settled = true;
          this.set({ status: 'closed', error: `Keine Verbindung zu ${url}` });
          reject(new Error(`Keine Verbindung zu ${url}`));
        }
      };
      ws.onclose = () => {
        if (this.ws === ws) this.set({ status: 'closed' });
        if (!settled) {
          settled = true;
          const text = this.snap.error ?? `Verbindung zu ${url} abgebrochen`;
          this.set({ error: text });
          reject(new Error(text));
        }
      };
    });
  }

  close() {
    if (this.ws) {
      const ws = this.ws;
      this.ws = undefined;
      ws.close();
    }
    this.set({ status: 'idle', state: undefined, sitzung: undefined });
  }

  private raw(msg: ClientMsg) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  send(action: Action) {
    this.raw({ t: 'action', action });
  }

  /** Online-Sitzung: nur der Host darf Sichtbarkeit und Spielerzahl ändern */
  sitzungAendern(patch: { sichtbarkeit?: Sichtbarkeit; maxSpieler?: number }) {
    this.raw({ t: 'sitzung', ...patch });
  }

  toast(text: string, level: Toast['level'] = 'info') {
    const t = { id: ++this.toastId, text, level };
    this.set({ toasts: [...this.snap.toasts, t].slice(-4) });
    setTimeout(() => this.set({ toasts: this.snap.toasts.filter((x) => x.id !== t.id) }), 4500);
  }
}

export const conn = new Connection();

export function useNet(): NetSnapshot {
  return useSyncExternalStore(conn.subscribe, conn.getSnapshot);
}
