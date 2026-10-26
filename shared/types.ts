// Gemeinsame Datentypen für Editor, Server und Client.
// Koordinaten sind Meter in einem lokalen Kartensystem (x nach Osten, y nach Süden).
import type { Haeufigkeit, Season } from './jahreszeit';

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
  /** Zulässige Höchstgeschwindigkeit in km/h (aus OSM) */
  maxspeed?: number;
  /** Einbahnstraße: nur von a nach b befahrbar */
  oneway?: boolean;
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
  /** Luftfahrzeug: fliegt in gerader Linie */
  air?: boolean;
}

export interface VehicleDef {
  id: string;
  callsign: string;
  type: VehicleTypeId;
  /** Dienstzeiten; fehlt die Angabe, ist das Fahrzeug rund um die Uhr besetzt */
  dienst?: Dienstzeit[];
}

/** Besetzte Schicht eines Fahrzeugs, z. B. 7:00 bis 19:00, Mo–Fr, nur in geraden Kalenderwochen */
export interface Dienstzeit {
  /** Beginn in Minuten nach Mitternacht */
  von: number;
  /** Ende in Minuten nach Mitternacht; kleiner oder gleich von = über Mitternacht */
  bis: number;
  /** Wochentage, an denen die Schicht beginnt (0 = Montag … 6 = Sonntag); fehlt = täglich */
  tage?: number[];
  /** Nur in geraden bzw. ungeraden Kalenderwochen */
  kw?: 'gerade' | 'ungerade';
  /** Ende bei Sonnenuntergang (Luftrettung); bis gilt dann nur als Näherung */
  sunset?: boolean;
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
  /** TMO-Rufgruppe, in der die Fahrzeuge der Wache standardmäßig funken */
  tmo?: string;
}

/** Digitalfunk-Rufgruppe (TMO) */
export interface TmoGroup {
  id: string;
  /** z. B. "FW WÜ 1" */
  name: string;
  /** Wofür die Gruppe gedacht ist */
  use: 'RD' | 'FW' | 'Einsatz' | 'Übergreifend';
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
  category: 'RD' | 'B' | 'THL' | 'ABC' | 'SONST';
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
  /** Digitalfunk-Rufgruppen; fehlen sie, werden Standardgruppen erzeugt */
  tmoGroups?: TmoGroup[];
  /** Ersteller, wird im Leitstellen-Katalog angezeigt */
  autor?: string;
  /** Kurzbeschreibung für den Leitstellen-Katalog */
  beschreibung?: string;
  /** Aus dem Leitstellen-Katalog heruntergeladen: Server, Kennung und Autor des Originals */
  herkunft?: { server: string; id: string; autor: string };
  /** Nachbarleitstellen, bei denen über die ESWL Rettungsmittel nach Typ angefordert werden können */
  nachbarn?: NachbarLeitstelle[];
}

/** Nachbar-ILS für die ESWL (Einsatzübergreifende Schnittstelle Leitstelle): Rettungsmittel außerhalb des eigenen Bereichs */
export interface NachbarLeitstelle {
  id: string;
  /** z. B. "ILS Schweinfurt" */
  name: string;
  /** Rettungsmittel mit Standort; Koordinaten dürfen außerhalb der Karte liegen */
  fahrzeuge: NachbarFahrzeug[];
  /** Anteil der Anforderungen (0 bis 1), die die Nachbar-ILS mangels freier Fahrzeuge ablehnt */
  ablehnung: number;
  /** Eigene RD-Rufgruppe, in der sich Fahrzeuge dieser ILS beim Ein- und Ausfahren melden */
  tmo?: string;
}

export interface NachbarFahrzeug {
  id: string;
  callsign: string;
  type: VehicleTypeId;
  /** Wache oder Standort, z. B. "RW Schweinfurt" oder "Christoph 18, Ochsenfurt" */
  wache: string;
  x: number;
  y: number;
  dienst?: Dienstzeit[];
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
  /** Gekoppeltes Tablet: Sprechtaste für das Mikrofon am Rechner und Tonausgabe */
  geraet?: GeraetStatus;
}

export interface GeraetStatus {
  /** Sprechtaste auf dem Tablet gedrückt: der Rechner hört über sein Mikrofon zu */
  ptt?: boolean;
  /** zählt jedes Drücken und Auffrischen, damit der Rechner eine hängende Taste erkennt */
  pttSeq?: number;
  /** auf dem Tablet gewähltes Fahrzeug: Funkspruch geht an dieses */
  pttUnitId?: string;
  /** Spracheingabe am Rechner ist geladen und bereit */
  sttBereit?: boolean;
  /** Fenster am Rechner ausgeblendet, Ton und Vorlesen laufen trotzdem dort */
  tonAmPc?: boolean;
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
  | 'free'
  /** Fahrt zum Standort einer Gebietsabsicherung (Status 3 beim Ausrücken, dann Status 1) */
  | 'toCover'
  /** Steht zur Gebietsabsicherung am Standort, Status 1 */
  | 'covering';

export interface SpeakRequest {
  kind: 'lage' | 'nachforderung' | 'zielklinik' | 'info' | 'crew';
  text: string;
  since: number;
  /** Sprechaufforderung erteilt, Meldung wurde gesprochen */
  answered: boolean;
  /** Rufgruppe, in der die Meldung gesprochen wird (Standard: aktuelle Rufgruppe des Fahrzeugs) */
  group?: string;
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
  /** Patientenzuweisungscode des Patienten an Bord (IVENA) */
  pzc?: string;
  /** Hinweis für die Besatzung (Rolle Fahrzeugbesatzung) */
  hint?: string;
  /** Aktuell geschaltete TMO-Rufgruppe */
  tmo?: string;
  /** Gebietsabsicherung: Standort, an dem das Fahrzeug bereitsteht */
  cover?: { name: string; x: number; y: number; stationId?: string; /** Spielzeit der Verlegung */ since?: number };
  /** Notarztbegleitung: Notarzt fährt im Transportfahrzeug mit dieser id mit, das Fahrzeug folgt zur Klinik */
  begleitet?: string;
  /** Patient an Bord ist infektiös: nach der Übergabe muss das Fahrzeug zur Desinfektion */
  infektion?: boolean;
  /** Desinfektion nach Infektionstransport: Fahrzeug fährt in Status 6 zur Wache, bis = Spielzeit, zu der sie fertig ist */
  desinfektion?: { bis?: number };
  /** Über die ESWL von einer Nachbar-ILS entsandt: gehört nicht zum eigenen Bereich und fährt danach heim */
  fremd?: { nachbarId: string; ils: string; wache: string; imBereich: boolean };
}

export interface CallLine {
  from: 'caller' | 'calltaker' | 'system';
  text: string;
  t: number;
}

export type QuestionId =
  | 'wo'
  | 'was'
  | 'wer'
  | 'wieviele'
  | 'zustand'
  | 'gefahr'
  | 'tcpr'
  | 'beruhigen'
  | 'alter'
  | 'atmung'
  | 'bewusstsein'
  | 'seitwann'
  | 'vorerkrankung'
  | 'zugang'
  | 'rueckruf'
  | 'ortbestaetigen'
  | 'verabschieden'
  /** Krankentransport: gewünschte Abholzeit */
  | 'termin'
  /** Krankentransport: Transportziel */
  | 'ziel'
  /** Krankentransport: liegend, sitzend, Tragestuhl */
  | 'transportart';

export interface CallState {
  id: string;
  phone: string;
  /** 112, BMA, Übergabe der KVB (116117) oder Patientenanmeldung eines Rettungsmittels per Telefon */
  kind: '112' | 'bma' | 'kvb' | 'rtw';
  /** Eingang über die Krankentransport-Rufnummer 19222 statt über den Notruf 112 */
  leitung?: '19222';
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
  /** Festnetz: Anschlussadresse aus dem Teilnehmerverzeichnis */
  landline?: { x: number; y: number; address: string };
  /** Bei BMA: Objekt und Adresse aus der Alarmübertragung */
  bma?: { text: string; x: number; y: number; address: string };
  /** Übergabe der KVB (ärztlicher Bereitschaftsdienst 116117) über die Schnittstelle */
  kvb?: { text: string; x: number; y: number; address: string };
  /** An die KVB weiterverbunden */
  toKvb?: boolean;
  /** Anruf der Polizei: Funkrufname der Streife, die schon an der Einsatzstelle ist */
  polizei?: string;
  /** Besatzung meldet ihren Patienten telefonisch mit PZC an und erbittet eine Zielklinik */
  rtw?: { unitId: string; callsign: string; pzc: string; text: string };
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
  /** Schlagwort im Format des Leitsystems, z. B. "#B1515 - B3 - #Verkehr#LKW / Bus außerorts" */
  schlagwort?: string;
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
  /** Zusatz zum Einsatzort, z. B. Stockwerk, Hinterhaus */
  zusatz?: string;
  objekt?: string;
  /** Meldender und Rückrufnummer */
  melder?: string;
  rueckruf?: string;
  /** Patientendaten (Name, Alter, Geschlecht) */
  patient?: string;
  sondersignal?: boolean;
  /** Einsatz-Rufgruppe */
  tmo?: string;
  /** Polizei verständigt */
  polizei?: 'angefordert' | 'vor Ort';
  /** Kriseninterventionsteam (PSNV) für Angehörige verständigt */
  kit?: 'angefordert' | 'vor Ort';
  /** Anforderungen bei Nachbarleitstellen über die ESWL */
  eswl?: EswlAnforderung[];
  /** Terminfahrt (geplanter Krankentransport): Abholzeit als Spielzeit */
  termin?: number;
  /** Erinnerung zur Terminfahrt: 30 Minuten vorher bzw. Termin erreicht */
  terminMeldung?: 'vorlauf' | 'faellig';
}

export interface EswlAnforderung {
  id: string;
  nachbarId: string;
  ils: string;
  type: VehicleTypeId;
  t: number;
  status: 'angefragt' | 'zugesagt' | 'abgelehnt';
  /** Entsandtes Fahrzeug bei Zusage */
  callsign?: string;
  /** Grund der Ablehnung oder voraussichtliche Anfahrt */
  text?: string;
}

export interface RadioMessage {
  id: number;
  t: number;
  from: string;
  to: string;
  text: string;
  kind: 'fms' | 'voice' | 'system';
  /** TMO-Rufgruppe des Funkspruchs (FMS-Status ohne Gruppe) */
  group?: string;
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
  /** Datum des Schichtbeginns (JJJJ-MM-TT), für Wochentag und Kalenderwoche */
  startDate?: string;
  /** Jahreszeit (ergibt sich aus dem Startdatum) und Häufigkeit besonderer Lagen, vor Schichtbeginn einstellbar */
  setup?: { season: Season; gsl: Haeufigkeit; unwetter: Haeufigkeit };
  /** Wetterwarnungen des Deutschen Wetterdienstes an die Leitstelle */
  dwd?: DwdMeldung[];
  players: Player[];
  calls: CallState[];
  incidents: IncidentState[];
  units: UnitState[];
  radio: RadioMessage[];
  score: ScoreBoard;
  ivena?: IvenaState;
}

export interface IvenaAbmeldung {
  hospitalId: string;
  fach: string;
  seit?: number;
  bis: number;
  grund: string;
}

/** IVENA: Abmeldungen der Kliniken je Fachbereich und erfolgte Zuweisungen */
export interface IvenaState {
  /** seit: Zeitpunkt der Abmeldung (Spielzeit), bis: voraussichtliches Ende */
  abmeldungen: IvenaAbmeldung[];
  zuweisungen: { t: number; hospitalId: string; callsign: string; pzc?: string; nr?: string; trotzAbmeldung?: boolean }[];
}

export type WetterArt = 'gewitter' | 'sturm' | 'starkregen' | 'glatteis' | 'schnee' | 'hitze';

/** Meldung des Deutschen Wetterdienstes (Vorabinformation, amtliche Warnung oder Aufhebung) */
export interface DwdMeldung {
  id: string;
  kind: 'vorab' | 'warnung' | 'aufhebung';
  /** Eingang in der Leitstelle (Spielzeit) */
  t: number;
  /** Warnstufe 1 (gelb) bis 4 (violett) */
  stufe: 1 | 2 | 3 | 4;
  art: WetterArt;
  /** Überschrift, z. B. "Amtliche UNWETTERWARNUNG vor ORKANBÖEN" */
  titel: string;
  /** Gültigkeit (Spielzeit) */
  von: number;
  bis: number;
  /** Vollständiger Meldungstext wie im Fax bzw. FeWIS */
  text: string;
}
