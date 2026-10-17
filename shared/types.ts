// Gemeinsame Datentypen für Editor, Server und Client.
// Koordinaten sind Meter in einem lokalen Kartensystem (x nach Osten, y nach Süden).

export interface Vec {
  x: number;
  y: number;
}

export type RoadType = 'autobahn' | 'bundesstrasse' | 'landstrasse' | 'ortsstrasse';

export interface RoadNode {
  id: string;
  x: number;
  y: number;
}

export interface Road {
  id: string;
  a: string;
  b: string;
  name: string;
  type: RoadType;
  /** Hausnummer am Knoten a (wird von recomputeHouseNumbers gesetzt) */
  numA?: number;
  /** Hausnummer am Knoten b */
  numB?: number;
  /** Ort, zu dem die Straße gehört (Name), leer = außerorts */
  town?: string;
}

export interface Town {
  id: string;
  name: string;
  x: number;
  y: number;
  radius: number;
}

export type VehicleTypeId = string;

export interface VehicleType {
  id: VehicleTypeId;
  label: string;
  /** Feuerwehr, Rettungsdienst oder Sonstige */
  org: 'FW' | 'RD';
  /** Bayerische Funkkenner-Nummer, z. B. 40 für HLF 20 */
  funkNr: number;
  /** Welche AAO-Anforderungen dieses Fahrzeug erfüllen kann (inkl. sich selbst) */
  fills: VehicleTypeId[];
  /** Geschwindigkeitsfaktor gegenüber einem Pkw mit Sonderrechten */
  speedFactor: number;
  /** Kann Patienten transportieren */
  transport?: boolean;
}

export interface VehicleDef {
  id: string;
  callsign: string;
  type: VehicleTypeId;
}

export interface Station {
  id: string;
  name: string;
  kind: 'feuerwache' | 'rettungswache';
  /** hauptamtlich besetzt (kurze Ausrückzeit) */
  career: boolean;
  x: number;
  y: number;
  vehicles: VehicleDef[];
}

export interface Hospital {
  id: string;
  name: string;
  x: number;
  y: number;
  specialties: string[];
}

export interface MapObject {
  id: string;
  name: string;
  kind: 'schule' | 'seniorenheim' | 'gewerbe' | 'kirche' | 'sonstiges';
  x: number;
  y: number;
  /** Brandmeldeanlage aufgeschaltet */
  bma: boolean;
}

export interface Stichwort {
  code: string;
  label: string;
  category: 'RD' | 'B' | 'THL' | 'SONST';
  /** Alarm- und Ausrückeordnung: benötigte Fahrzeugtypen */
  aao: Record<VehicleTypeId, number>;
}

export interface ScenarioSettings {
  /** Notrufe pro Stunde Spielzeit */
  callsPerHour: number;
  /** BMA-Auslösungen pro Stunde Spielzeit */
  bmaPerHour: number;
  /** Uhrzeit beim Schichtbeginn in Minuten nach Mitternacht */
  startClock: number;
}

/** Bezug eines aus OpenStreetMap importierten Szenarios zur echten Welt */
export interface GeoRef {
  /** Breitengrad, an dem lokale Meter exakt stimmen */
  lat0: number;
  /** Web-Mercator-Koordinaten der linken oberen Ecke (x = 0, y = 0) */
  mx0: number;
  my0: number;
  bbox?: { south: number; west: number; north: number; east: number };
}

/** Echte Hausnummer (aus OpenStreetMap) */
export interface Address {
  street: string;
  /** z. B. "12a" */
  number: string;
  town: string;
  x: number;
  y: number;
}

export interface Scenario {
  version: 1;
  id: string;
  name: string;
  /** z. B. "ILS Musterland" */
  ilsName: string;
  width: number;
  height: number;
  nodes: RoadNode[];
  roads: Road[];
  towns: Town[];
  stations: Station[];
  hospitals: Hospital[];
  objects: MapObject[];
  vehicleTypes: VehicleType[];
  stichworte: Stichwort[];
  settings: ScenarioSettings;
  /** Nur bei echten Karten: Projektion für Kartenkacheln */
  geo?: GeoRef;
  /** Nur bei echten Karten: echte Hausnummern */
  addresses?: Address[];
}

// ---------- Laufzeitzustand (Server -> Client) ----------

export type Role = 'calltaker' | 'dispatcher' | 'crew' | 'supervisor';

export interface Player {
  id: string;
  name: string;
  role: Role;
  /** bei Rolle crew: besetztes Fahrzeug */
  unitId?: string;
  connected: boolean;
}

export type FmsStatus = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 0;

export type UnitTask =
  | 'station'
  | 'alarmed'
  | 'toScene'
  | 'onScene'
  | 'awaitHospital'
  | 'toHospital'
  | 'atHospital'
  | 'returning'
  | 'free';

export interface SpeakRequest {
  kind: 'lage' | 'nachforderung' | 'zielklinik' | 'info' | 'crew';
  text: string;
  since: number;
  /** Sprechaufforderung erteilt, Meldung wurde gesprochen */
  answered: boolean;
}

export interface UnitState {
  id: string;
  callsign: string;
  type: VehicleTypeId;
  stationId: string;
  status: FmsStatus;
  /** Status, der nach dem Sprechwunsch wieder gilt */
  baseStatus: FmsStatus;
  task: UnitTask;
  x: number;
  y: number;
  heading: number;
  route?: Vec[];
  routeIdx: number;
  eta?: number;
  incidentId?: string;
  hospitalId?: string;
  speak?: SpeakRequest;
  crewPlayerId?: string;
  /** Spielzeit, zu der die aktuelle Aufgabe abläuft */
  timer?: number;
  hasPatient?: boolean;
  /** Hinweis für die Besatzung (Rolle Fahrzeugbesatzung) */
  hint?: string;
}

export interface CallLine {
  from: 'caller' | 'calltaker' | 'system';
  text: string;
  t: number;
}

export type QuestionId = 'wo' | 'was' | 'wer' | 'wieviele' | 'zustand' | 'gefahr' | 'tcpr' | 'beruhigen';

export interface CallState {
  id: string;
  phone: string;
  /** 112 oder BMA */
  kind: '112' | 'bma';
  state: 'ringing' | 'active' | 'ended';
  takerId?: string;
  ringStart: number;
  answeredAt?: number;
  endedAt?: number;
  transcript: CallLine[];
  asked: QuestionId[];
  incidentId?: string;
  /** Anrufer hat aufgelegt, ohne dass jemand abgenommen hat */
  missed?: boolean;
  /** Anrufer spricht gerade */
  typing?: boolean;
  /** Advanced Mobile Location: Handyortung mit Genauigkeit in Metern */
  aml?: { x: number; y: number; acc: number };
  /** Bei BMA: Objekt und Adresse aus der Alarmübertragung */
  bma?: { text: string; x: number; y: number; address: string };
}

export interface IncidentLog {
  t: number;
  text: string;
}

export interface IncidentState {
  id: string;
  nr: string;
  stichwort: string;
  label: string;
  address: string;
  x: number;
  y: number;
  note: string;
  patients: number;
  createdAt: number;
  createdBy?: string;
  callId?: string;
  status: 'offen' | 'alarmiert' | 'laufend' | 'abgeschlossen';
  unitIds: string[];
  log: IncidentLog[];
  /** Lagebild der Einsatzstelle, sichtbar sobald das erste Fahrzeug eingetroffen ist */
  lage?: string;
  firstArrival?: number;
  alarmedAt?: number;
  closedAt?: number;
}

export interface RadioMessage {
  id: number;
  t: number;
  from: string;
  to: string;
  text: string;
  kind: 'fms' | 'voice' | 'system';
}

export interface ScoreBoard {
  points: number;
  callsAnswered: number;
  callsMissed: number;
  avgAnswerSec: number;
  incidentsCreated: number;
  stichwortCorrect: number;
  addressCorrect: number;
  incidentsClosed: number;
  avgHilfsfristSec: number;
  hilfsfristMet: number;
  hilfsfristTotal: number;
  events: { t: number; text: string; points: number }[];
}

export interface PublicState {
  running: boolean;
  started: boolean;
  speed: number;
  time: number;
  clockStart: number;
  players: Player[];
  calls: CallState[];
  incidents: IncidentState[];
  units: UnitState[];
  radio: RadioMessage[];
  score: ScoreBoard;
}
