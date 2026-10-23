// Leitstellen-Katalog auf dem Online-Server: eigene Leitstellen veröffentlichen, privat stellen und fremde herunterladen.
import { gunzipSync, gzipSync, strFromU8, strToU8 } from 'fflate';
import {
  KATALOG_MAX_BYTES,
  KATALOG_SCHLUESSEL_HEADER,
  type KatalogDownload,
  type KatalogEintrag,
  type KatalogHochladen,
  type KatalogListe,
  type Sichtbarkeit,
} from '../../shared/protocol';
import type { Scenario } from '../../shared/types';
import { onlineServer, serverUrls } from './online';
import { APP_VERSION } from './version';

/** Der Katalog liegt auf dem Online-Server des Spiels */
export const katalogServer = onlineServer;

/** Geheimer Autorenschlüssel dieser Installation: weist auf dem Server nach, wem eine veröffentlichte Leitstelle gehört */
export function autorSchluessel(): string {
  const KEY = 'lst.autorSchluessel';
  try {
    const old = localStorage.getItem(KEY);
    if (old) return old;
  } catch {
    /* ohne Speicher: Schlüssel gilt nur bis zum Neustart */
  }
  const key = [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, '0')).join('');
  try {
    localStorage.setItem(KEY, key);
  } catch {
    /* egal */
  }
  return key;
}

export class KatalogFehler extends Error {
  constructor(
    message: string,
    readonly status = 0,
  ) {
    super(message);
  }
}

async function anfrage<T>(addr: string, pfad: string, init: RequestInit = {}, mitSchluessel = false): Promise<T> {
  const { http } = serverUrls(addr);
  const headers: Record<string, string> = { ...(init.body ? { 'content-type': 'application/json' } : {}) };
  if (mitSchluessel) headers[KATALOG_SCHLUESSEL_HEADER] = autorSchluessel();
  let res: Response;
  try {
    res = await fetch(`${http}/api/katalog${pfad}`, { ...init, headers, cache: 'no-store' });
  } catch {
    throw new KatalogFehler(`Online-Server ${http} nicht erreichbar`);
  }
  if (res.status === 204) return undefined as T;
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* kein JSON, z. B. alter Server */
  }
  if (!res.ok) {
    const msg = (body as { error?: string } | null)?.error;
    if (res.status === 404 && !msg && pfad === '') throw new KatalogFehler('Dieser Online-Server hat noch keinen Leitstellen-Katalog. Bitte den Server aktualisieren.', 404);
    throw new KatalogFehler(msg ?? `Online-Server antwortet mit Fehler ${res.status}`, res.status);
  }
  return body as T;
}

export function ladeKatalog(addr: string): Promise<KatalogListe> {
  return anfrage<KatalogListe>(addr, '');
}

/** Eigene veröffentlichte Leitstellen (auch private) */
export function ladeMeine(addr: string): Promise<KatalogListe> {
  return anfrage<KatalogListe>(addr, '/meine', {}, true);
}

export function packe(scn: Scenario): string {
  const gz = gzipSync(strToU8(JSON.stringify(scn)), { level: 6 });
  if (gz.length > KATALOG_MAX_BYTES) throw new KatalogFehler(`Die Leitstelle ist gepackt ${(gz.length / 1048576).toFixed(1)} MB groß, erlaubt sind ${KATALOG_MAX_BYTES / 1048576} MB.`);
  let bin = '';
  for (let i = 0; i < gz.length; i += 0x8000) bin += String.fromCharCode(...gz.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function entpacke(b64: string): Scenario {
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return JSON.parse(strFromU8(gunzipSync(buf))) as Scenario;
}

export function veroeffentlichen(addr: string, scn: Scenario, sichtbarkeit: Sichtbarkeit): Promise<KatalogEintrag> {
  const body: KatalogHochladen = {
    szenarioGz: packe(scn),
    autor: (scn.autor ?? '').trim().slice(0, 40),
    beschreibung: (scn.beschreibung ?? '').trim().slice(0, 1000),
    sichtbarkeit,
    spielVersion: APP_VERSION,
  };
  return anfrage<KatalogEintrag>(addr, `/${encodeURIComponent(scn.id)}`, { method: 'PUT', body: JSON.stringify(body) }, true);
}

export function setzeSichtbarkeit(addr: string, id: string, sichtbarkeit: Sichtbarkeit): Promise<KatalogEintrag> {
  return anfrage<KatalogEintrag>(addr, `/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ sichtbarkeit }) }, true);
}

export function entfernen(addr: string, id: string): Promise<void> {
  return anfrage<void>(addr, `/${encodeURIComponent(id)}`, { method: 'DELETE' }, true);
}

/** Leitstelle aus dem Katalog holen; sie trägt danach ihre Herkunft */
export async function herunterladen(addr: string, id: string): Promise<Scenario> {
  const d = await anfrage<KatalogDownload>(addr, `/${encodeURIComponent(id)}`, {}, true);
  const scn = entpacke(d.szenarioGz);
  scn.herkunft ??= { server: serverUrls(addr).http, id: d.eintrag.id, autor: d.eintrag.autor };
  return scn;
}
