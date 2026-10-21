import type { Haeufigkeit, Season } from './jahreszeit';
import type { PublicState, QuestionId, Role, Scenario } from './types';

export const DEFAULT_PORT = 4711;

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
    }
  | { a: 'updateIncident'; incidentId: string; stichwort?: string; schlagwort?: string; note?: string; tmo?: string }
  | { a: 'setTmo'; unitIds: string[]; group: string }
  | { a: 'groupCall'; group: string; text: string }
  | { a: 'crewTmo'; group: string }
  | { a: 'alarm'; incidentId: string; unitIds: string[] }
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
  | { a: 'crewHospital'; hospitalId: string };

export type ClientMsg =
  | {
      t: 'hello';
      name: string;
      role: Role;
      /** Kopplungscode: dieses Gerät übernimmt Bereiche eines vorhandenen Platzes */
      link?: string;
      /** Szenario ohne Straßennetz senden (Tablet-Ansicht braucht keine Karte) */
      lite?: boolean;
    }
  | { t: 'action'; action: Action }
  | { t: 'ping' };

export type ServerMsg =
  | { t: 'welcome'; playerId: string; scenario: Scenario; linkCode?: string }
  | { t: 'state'; state: PublicState }
  | { t: 'toast'; text: string; level: 'info' | 'warn' | 'error' }
  | { t: 'speech'; text: string }
  | { t: 'pong' }
  | { t: 'error'; text: string };
