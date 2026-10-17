import type { PublicState, QuestionId, Role, Scenario } from './types';

export const DEFAULT_PORT = 4711;

export type Action =
  | { a: 'setRole'; role: Role; unitId?: string }
  | { a: 'start' }
  | { a: 'pause'; paused: boolean }
  | { a: 'speed'; speed: number }
  | { a: 'answerCall'; callId: string }
  | { a: 'ask'; callId: string; question: QuestionId; text?: string }
  | { a: 'endCall'; callId: string }
  | {
      a: 'createIncident';
      callId?: string;
      stichwort: string;
      address: string;
      x: number;
      y: number;
      note: string;
      patients: number;
    }
  | { a: 'updateIncident'; incidentId: string; stichwort?: string; note?: string }
  | { a: 'alarm'; incidentId: string; unitIds: string[] }
  | { a: 'releaseUnit'; unitId: string }
  | { a: 'closeIncident'; incidentId: string }
  | { a: 'speakPermit'; unitId: string }
  | { a: 'assignHospital'; unitId: string; hospitalId: string }
  | { a: 'radio'; unitId: string; text: string }
  | { a: 'crewStatus'; status: number }
  | { a: 'crewRadio'; text: string }
  | { a: 'crewHospital'; hospitalId: string };

export type ClientMsg =
  | { t: 'hello'; name: string; role: Role }
  | { t: 'action'; action: Action }
  | { t: 'ping' };

export type ServerMsg =
  | { t: 'welcome'; playerId: string; scenario: Scenario }
  | { t: 'state'; state: PublicState }
  | { t: 'toast'; text: string; level: 'info' | 'warn' | 'error' }
  | { t: 'speech'; text: string }
  | { t: 'pong' };
