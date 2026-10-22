// Online-Multiplayer: Verbindung zum selbst gehosteten Sitzungs-Server.
import { gzipSync, strToU8 } from 'fflate';
import { ONLINE_PORT, type SitzungListe } from '../../shared/protocol';
import type { Scenario } from '../../shared/types';

/** Dauerhafte Kennung dieser Installation: Der Server lässt je Kennung nur eine Sitzung zu */
export function clientId(): string {
  const KEY = 'lst.clientId';
  try {
    const old = localStorage.getItem(KEY);
    if (old) return old;
    const id = crypto.randomUUID();
    localStorage.setItem(KEY, id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

/** "meinserver.de", "meinserver.de:4800" oder "https://lst.example.org" in HTTP- und WebSocket-Adresse umsetzen */
export function serverUrls(addr: string): { http: string; ws: string } {
  let a = addr.trim().replace(/\/+$/, '');
  if (!/^(https?|wss?):\/\//.test(a)) a = `http://${a}`;
  const u = new URL(a.replace(/^ws/, 'http'));
  // Ohne Port und ohne https: Standard-Port des Online-Servers
  if (!u.port && u.protocol === 'http:' && !/^https?:\/\//.test(addr.trim())) u.port = String(ONLINE_PORT);
  const http = u.toString().replace(/\/+$/, '');
  return { http, ws: http.replace(/^http/, 'ws') };
}

export async function ladeSitzungen(addr: string): Promise<SitzungListe> {
  const { http } = serverUrls(addr);
  let res: Response;
  try {
    res = await fetch(`${http}/api/sitzungen`, { cache: 'no-store' });
  } catch {
    throw new Error(`Online-Server ${http} nicht erreichbar`);
  }
  if (!res.ok) throw new Error(`Online-Server antwortet mit Fehler ${res.status}`);
  return (await res.json()) as SitzungListe;
}

/** Leitstelle für das Hochladen packen: gzip, dann Base64 */
export function packeSzenario(scn: Scenario): string {
  const gz = gzipSync(strToU8(JSON.stringify(scn)), { level: 6 });
  let bin = '';
  for (let i = 0; i < gz.length; i += 0x8000) bin += String.fromCharCode(...gz.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Hauptversion (z. B. "0.11") muss bei Spiel und Server gleich sein */
export function passendeVersion(a: string, b: string) {
  return a.split('.').slice(0, 2).join('.') === b.split('.').slice(0, 2).join('.');
}
