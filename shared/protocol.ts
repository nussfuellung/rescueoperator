import type { Haeufigkeit, Season } from './jahreszeit';
import type { PublicState, QuestionId, Role, Scenario } from './types';

export const DEFAULT_PORT = 4711;
/** Standard-Port des Online-Servers (Sitzungen über das Internet) */
export const ONLINE_PORT = 4800;
/** Höchstzahl der Spieler in einer Online-Sitzung */
export const MAX_SPIELER_ONLINE = 8;

export type Sichtbarkeit = 'offen' | 'privat';

/** Online-Sitzung auf dem Multiplayer-Server, wie sie Lobby und Spieler sehen */
export interface SitzungInfo {
  /** Beitrittscode, z. B. "K7QX2M" */
  code: string;
  name: string;
  sichtbarkeit: Sichtbarkeit;
  maxSpieler: number;
  spieler: number;
  hostName: string;
  /** Spieler-ID des Hosts in dieser Sitzung (nur für Teilnehmer) */
  hostId?: string;
  leitstelle: string;
  laeuft: boolean;
}

/** Antwort von GET /api/sitzungen des Online-Servers */
export interface SitzungListe {
  version: string;
  serverName: string;
  sitzungen: SitzungInfo[];
}

// ---------- Leitstellen-Katalog des Online-Servers ----------
// Spieler veröffentlichen eigene Leitstellen für alle oder stellen sie wieder auf privat.
// Besitz weist der geheime Autorenschlüssel nach (Kopfzeile KATALOG_SCHLUESSEL_HEADER), den nur die Installation kennt.
//
//   GET    /api/katalog         öffentliche Leitstellen (KatalogListe)
//   GET    /api/katalog/meine   eigene Leitstellen samt privaten (Schlüssel nötig)
//   GET    /api/katalog/:id     KatalogDownload; private nur mit Schlüssel des Autors
//   PUT    /api/katalog/:id     anlegen oder ersetzen (KatalogHochladen), Antwort KatalogEintrag
//   PATCH  /api/katalog/:id     { sichtbarkeit }, Antwort KatalogEintrag
//   DELETE /api/katalog/:id     vom Server entfernen
// Fehler kommen als { error: string } mit deutschem Text; 403, wenn die Kennung einem anderen Autor gehört.

/** Kopfzeile mit dem Autorenschlüssel (zufällig, 64 Hex-Zeichen) */
export const KATALOG_SCHLUESSEL_HEADER = 'x-autor-schluessel';
/** Größte Leitstelle, die der Katalog annimmt (gepackt, vor Base64) */
export const KATALOG_MAX_BYTES = 16 * 1024 * 1024;

export interface KatalogEintrag {
  /** Kennung der Leitstelle (Scenario.id) */
  id: string;
  ilsName: string;
  name: string;
  autor: string;
  beschreibung: string;
  sichtbarkeit: Sichtbarkeit;
  orte: number;
  wachen: number;
  fahrzeuge: number;
  kliniken: number;
  /** aus OpenStreetMap erzeugt (mit Kartenkacheln) */
  echteKarte: boolean;
  /** Größe gepackt in Bytes */
  groesse: number;
  /** SHA-256 (hex) des Leitstellen-JSON, wie bei Sitzungen */
  hash: string;
  /** Zeitpunkte in ms seit 1970 */
  veroeffentlicht: number;
  aktualisiert: number;
  downloads: number;
  /** Spielversion, mit der hochgeladen wurde */
  spielVersion: string;
}

export interface KatalogListe {
  version: string;
  leitstellen: KatalogEintrag[];
}

export interface KatalogHochladen {
  /** Leitstelle als gzip-komprimiertes JSON in Base64 */
  szenarioGz: string;
  autor: string;
  beschreibung: string;
  sichtbarkeit: Sichtbarkeit;
  spielVersion: string;
}

export interface KatalogDownload {
  eintrag: KatalogEintrag;
  szenarioGz: string;
}

export type Action =
  | { a: 'setRole'; role: Role; unitId?: string }
  | { a: 'start' }
  /** Vor Schichtbeginn: Uhrzeit (Minuten nach Mitternacht), Jahreszeit, Großschadenslagen und Unwetter */
  | { a: 'setup'; clock?: number; season?: Season; gsl?: Haeufigkeit; unwetter?: Haeufigkeit }
  | { a: 'pause'; paused: boolean }
  | { a: 'speed'; speed: number }
  | { a: 'answerCall'; callId: string }
  | { a: 'ask'; callId: string; question: QuestionId; text?: string }
  | { a: 'endCall'; callId: string }
  /** Anrufer an den ärztlichen Bereitschaftsdienst (116117) weiterverbinden */
  | { a: 'transferKvb'; callId: string }
  /** Polizei zum Einsatz verständigen */
  | { a: 'requestPolice'; incidentId: string }
  | {
      a: 'createIncident';
      callId?: string;
      stichwort: string;
      /** Schlagwort im Format des Leitsystems, z. B. "#B1515 - B3 - #Verkehr#LKW / Bus außerorts" */
      schlagwort?: string;
      address: string;
      x: number;
      y: number;
      note: string;
      patients: number;
      zusatz?: string;
      objekt?: string;
      melder?: string;
      rueckruf?: string;
      patient?: string;
      sondersignal?: boolean;
      /** Fahrzeuge, die direkt mit dem Anlegen alarmiert werden */
      alarmUnitIds?: string[];
      /** Direkt nach AAO alarmieren (Tablet ohne Straßennetz) */
      alarmAao?: boolean;
      /** Terminfahrt: Abholzeit als Spielzeit; der Einsatz wird erst später disponiert */
      termin?: number;
    }
  /** termin: neue Abholzeit (Spielzeit), null hebt den Termin auf */
  | { a: 'updateIncident'; incidentId: string; stichwort?: string; schlagwort?: string; note?: string; tmo?: string; termin?: number | null }
  | { a: 'setTmo'; unitIds: string[]; group: string }
  | { a: 'groupCall'; group: string; text: string }
  | { a: 'crewTmo'; group: string }
  | { a: 'alarm'; incidentId: string; unitIds: string[] }
  /** ESWL: Rettungsmittel eines Typs bei einer Nachbarleitstelle anfordern */
  | { a: 'eswl'; incidentId: string; nachbarId: string; type: string }
  | { a: 'releaseUnit'; unitId: string }
  /** Gebietsabsicherung: Fahrzeuge an eine Wache oder einen Punkt auf der Karte verlegen */
  | { a: 'cover'; unitIds: string[]; stationId?: string; x?: number; y?: number; name?: string }
  /** FMS-Auftrag H: Fahren Sie Wache an */
  | { a: 'sendHome'; unitId: string }
  | { a: 'closeIncident'; incidentId: string }
  | { a: 'speakPermit'; unitId: string }
  | { a: 'assignHospital'; unitId: string; hospitalId: string }
  | { a: 'radio'; unitId: string; text: string }
  | { a: 'crewStatus'; status: number }
  | { a: 'crewRadio'; text: string }
  | { a: 'crewHospital'; hospitalId: string }
  /** Gekoppeltes Tablet und Rechner stimmen Sprechtaste und Tonausgabe ab */
  | { a: 'geraet'; ptt?: boolean; pttUnitId?: string | null; sttBereit?: boolean; tonAmPc?: boolean };

export type ClientMsg =
  | {
      t: 'hello';
      name: string;
      role: Role;
      /** Kopplungscode: dieses Gerät übernimmt Bereiche eines vorhandenen Platzes */
      link?: string;
      /** Szenario ohne Straßennetz senden (Tablet-Ansicht braucht keine Karte) */
      lite?: boolean;
      /** Online-Server: dauerhafte Kennung dieser Installation (eine Sitzung je Spieler) */
      clientId?: string;
      /** Online-Server: Spielversion, muss zum Server passen */
      version?: string;
      /** Online-Server: neue Sitzung anlegen oder per Code beitreten */
      sitzung?:
        | {
            neu: {
              name: string;
              sichtbarkeit: Sichtbarkeit;
              maxSpieler: number;
              /** Leitstelle als gzip-komprimiertes JSON in Base64; fehlt, wenn der Server sie schon hat */
              szenarioGz?: string;
              /** SHA-256 (hex) des Leitstellen-JSON: damit findet der Server eine schon hochgeladene Leitstelle */
              szenarioHash?: string;
            };
          }
        | { code: string };
    }
  | { t: 'action'; action: Action }
  /** Online-Server: Host ändert Sichtbarkeit oder Spielerzahl */
  | { t: 'sitzung'; sichtbarkeit?: Sichtbarkeit; maxSpieler?: number }
  | { t: 'ping' };

export type ServerMsg =
  | { t: 'welcome'; playerId: string; scenario: Scenario; linkCode?: string; sitzung?: SitzungInfo }
  /** Online-Server: Sitzung hat sich geändert (Spieler, Host, Einstellungen) */
  | { t: 'sitzung'; sitzung: SitzungInfo }
  | { t: 'state'; state: PublicState }
  | { t: 'toast'; text: string; level: 'info' | 'warn' | 'error' }
  | { t: 'speech'; text: string }
  | { t: 'pong' }
  | { t: 'error'; text: string };
