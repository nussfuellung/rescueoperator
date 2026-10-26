// Autoritative Spielsimulation: Notrufe, Einsätze, Fahrzeuge, Funk, Wertung.
import { AIR_SPEED, AIR_TURNOUT, FMS_TEXT, HILFSFRIST_MS, ensureStichworte, radioName, shortCallsign } from '../shared/catalog';
import { aaoMitSchlagwort, findSchlagwort, schlagwortByNr } from '../shared/schlagworte';
import { RoadGraph, dist, nearestTown, reverseGeocode } from '../shared/geo';
import { mulberry32 } from '../shared/mapgen';
import { computeProposal, coverage, inUebergabe, uebergabeRest } from '../shared/dispatch';
import type { ProposalEntry } from '../shared/dispatch';
import type { Action } from '../shared/protocol';
import type {
  CallState,
  Dienstzeit,
  DwdMeldung,
  FmsStatus,
  Hospital,
  IncidentState,
  Player,
  IvenaAbmeldung,
  PublicState,
  QuestionId,
  RadioMessage,
  Role,
  NachbarFahrzeug,
  NachbarLeitstelle,
  Scenario,
  Station,
  UnitState,
  Vec,
  VehicleType,
} from '../shared/types';
import { ensureTmo } from '../shared/fleet';
import { findeEinsatz, findeKlinik, findeRufgruppe, istFrage, istQuittung, zerlegeFunkspruch } from '../shared/funkspruch';
import { inDienst } from '../shared/lstsim';
import { HAEUFIGKEIT_STUNDEN, dateForSeason, seasonOf, tageszeitFaktor, type Haeufigkeit, type Season } from '../shared/jahreszeit';
import { infektionstransport, pzcFachbereich, pzcFuer, pzcSprech, zielFach } from '../shared/pzc';
import { aufnahmepflicht, klinikKm, voranmeldungFuer } from '../shared/ivena';
import {
  BMA_TEMPLATE,
  FIRST_NAMES,
  KVB_ERKLAERUNG,
  KVB_QUITTUNG,
  KVB_REAKTION,
  KVB_UEBERGABE,
  KVB_UEBERLEITUNG,
  FLOORS,
  LAST_NAMES,
  NOT_UNDERSTOOD,
  TEMPLATES,
  YES_NO,
  classifyAll,
  fallbackAnswers,
  ADDRESS_NOT_YET_SAID,
  ERNEUT_NACHFRAGE,
  ERNEUT_NIEMAND,
  ERNEUT_VERSCHLECHTERUNG,
  PANIK,
  PANIK_BERUHIGT,
  PANIK_BERUHIGT_HALB,
  PANIK_OPENING,
  PANIK_PREFIX,
  isYesNoQuestion,
  questionText,
  type CallerFacts,
  type IncidentTemplate,
} from './callgen';
import {
  ALLE_VORLAGEN,
  GSL_TEMPLATES,
  SAISON_FAKTOR,
  SAISON_TEMPLATES,
  WETTER_DAUER,
  WETTER_JE_SAISON,
  WETTER_SAISON_FAKTOR,
  WETTER_STUFEN,
  dwdText,
  dwdTitel,
  dwdZeit,
  wetterAnteil,
  wetterRate,
  wetterVorlagen,
  type LageTemplate,
  type WetterLage,
} from './lagen';
import { lageZumStand, rollVerlauf, type NotarztStand, type Verlauf } from './verlauf';

interface PatientTruth {
  specialty: string;
  desc: string;
  /** Patientenzuweisungscode, den die Besatzung meldet */
  pzc: string;
  unitId?: string;
  done: boolean;
}

/** Verdeckte Wahrheit hinter einem Notruf bzw. Einsatz (wird nie an Clients gesendet) */
interface Truth {
  tpl: IncidentTemplate;
  stichwort: string;
  pos: Vec;
  address: string;
  spokenWhere: string;
  needs: Record<string, number>;
  patients: PatientTruth[];
  lage: string;
  workMs: number;
  name: string;
  alter: number;
  facts?: CallerFacts;
  objekt?: string;
  fake: boolean;
  tcprGiven?: boolean;
  /** Der Anrufer hat den Notfallort schon genannt */
  whereSaid?: boolean;
  // Einsatzfortschritt
  reported?: boolean;
  progress?: number;
  complete?: boolean;
  released?: Set<string>;
  workDone?: boolean;
  lastRequest?: number;
  wrongPlaceUntil?: number;
  callStart?: number;
  retries?: number;
  /** Ausgewürfelter Einsatzverlauf (Erkundung, Feststellung, Lageentwicklung) */
  verlauf?: Verlauf;
  /** Erkundung abgeschlossen, Lage steht fest */
  erkundet?: boolean;
  /** Lageänderung während der Abarbeitung ist eingetreten */
  entwickelt?: boolean;
  /** Anruf der Polizei: Funkrufname der Streife an der Einsatzstelle */
  streife?: string;
  /** Ausgelöste Meldergruppe (BMA) */
  melder?: number;
  /** Laut Verlauf mehr Kräfte nötig als ursprünglich gemeldet */
  nachgefordert?: boolean;
  /** Platzhalter ohne Notruf (Fehlanruf, Einsatz ohne Anruf) */
  generic?: boolean;
  /** Einsatz, der zu dieser Lage angelegt wurde */
  incidentId?: string;
  /** Weiterer Anrufer zu einer bereits gemeldeten Lage (Großschadenslage): die ursprüngliche Lage */
  main?: Truth;
  /** Terminfahrt: bestellte Abholzeit (Spielzeit) */
  termin?: number;
  /** Terminfahrt: Transportziel, das der Anrufer nennt */
  ziel?: string;
  /** Verlegung oder Terminfahrt in eine Klinik: vereinbarte Zielklinik */
  zielId?: string;
  /** Fahrzeug war vor der Abholzeit da, Wartezeit ist eingerechnet */
  wartet?: boolean;
  /** Panischer Anrufer: so oft muss der Calltaker beruhigen, bevor brauchbare Antworten kommen */
  panik?: number;
  /** Anrufer kann sich zum angelegten Einsatz erneut melden ('immer' erzwingt es, z. B. in Tests) */
  erneut?: 'zufall' | 'immer';
  /** Zustand hat sich laut erneutem Anruf verschlechtert: Text für die Lage */
  verschlechtert?: string;
  /** Rückruf zu einer bestellten Terminfahrt (gehört zu main): Absage oder neue Abholzeit */
  bezug?: { art: 'absage' | 'verschieben'; neu?: number };
  /** Terminfahrt wurde vom Anrufer abgesagt bzw. verschoben; umgesetzt = Disponent hat es eingetragen */
  aenderung?: { art: 'absage' | 'verschieben'; neu?: number; umgesetzt?: boolean };
}

/** Erneuter Anruf zu einem bestehenden Einsatz: Anlass (Verschlechterung = Index in ERNEUT_VERSCHLECHTERUNG) */
type ErneutArt = 'nachfrage' | 'niemand' | number;

const MISSED_AFTER_MS = 90_000;
/** Anteil der Übergaben von der KVB (116117) an allen Notrufen */
const KVB_SHARE = 0.06;
/** Anteil der Patientenanmeldungen, die eine Besatzung per Telefon statt über Funk macht */
const RTW_PHONE_SHARE = 0.3;
/** Nach so langer Zeit ohne Annahme meldet sich die Besatzung doch über Funk */
const RTW_PHONE_GIVEUP_MS = 75_000;
const SPEAK_PENALTY_MS = 180_000;
/** Status 0 (priorisierter Sprechwunsch) muss deutlich schneller beantwortet werden */
const PRIO_PENALTY_MS = 45_000;
/** Gefahr für die Einsatzkräfte: immer Status 0 */
const GEWALT = /bedroh|angriff|angegriffen|aggressiv|gewalt|waffe|messer|schläger/i;
/** Lebensgefahr: Status 0, wenn dafür noch Kräfte fehlen */
const LEBENSGEFAHR = /reanimation|\brea\b|atemstillstand|kreislaufstillstand|eingeklemmt|explosion|einsturz|eingestürzt|vermisst|untergegangen/i;

/** Status 5 oder 0: Sprechwunsch offen, der eigentliche Status steht in baseStatus */
const sprechStatus = (s: FmsStatus) => s === 5 || s === 0;

/** Drückt die Besatzung für diese Meldung Status 0 statt Status 5? */
function dringend(text: string, missing: string[]): boolean {
  if (GEWALT.test(text)) return true;
  if (missing.some((m) => /\b(?:NEF|RTH|Notarzt)\b/i.test(m))) return true;
  return missing.length > 0 && LEBENSGEFAHR.test(text);
}
/** Großschadenslagen frühestens nach so viel Spielzeit, Unwetter frühestens nach 15 Minuten */
const GSL_MIN_MS = 45 * 60_000;
const UNWETTER_MIN_MS = 15 * 60_000;
/** Erinnerung an eine Terminfahrt so lange vor der Abholzeit */
const TERMIN_VORLAUF_MS = 30 * 60_000;
/** Archiv abgeschlossener Einsätze: so viele bleiben zum Nachschlagen und Wiedereröffnen erhalten */
const ARCHIV_MAX = 300;
/** Terminfahrt gilt als pünktlich bis so lange nach der Abholzeit */
const TERMIN_TOLERANZ_MS = 10 * 60_000;
/** Anteil der Terminfahrten, die der Anrufer später absagt oder verschiebt */
const TERMIN_AENDERUNG_ANTEIL = 0.25;

export interface GameEvents {
  speech?: (text: string) => void;
  toast?: (playerId: string | null, text: string, level: 'info' | 'warn' | 'error') => void;
}

export class Game {
  readonly scn: Scenario;
  readonly graph: RoadGraph;
  private readonly types: Map<string, VehicleType>;
  private rng: () => number;
  private events: GameEvents;

  started = false;
  running = false;
  speed = 1;
  time = 0;
  players: Player[] = [];
  calls: CallState[] = [];
  incidents: IncidentState[] = [];
  /** Abgeschlossene Einsätze, die aus der Einsatzliste gefallen sind */
  archiv: IncidentState[] = [];
  units: UnitState[] = [];
  radio: RadioMessage[] = [];
  score: PublicState['score'] = {
    points: 0,
    callsAnswered: 0,
    callsMissed: 0,
    avgAnswerSec: 0,
    incidentsCreated: 0,
    stichwortCorrect: 0,
    addressCorrect: 0,
    incidentsClosed: 0,
    avgHilfsfristSec: 0,
    hilfsfristMet: 0,
    hilfsfristTotal: 0,
    events: [],
  };

  private callTruth = new Map<string, Truth>();
  private incTruth = new Map<string, Truth>();
  /** Erneute Anrufe zu bestehenden Einsätzen (Anruf-id → Einsatz und Anlass) */
  private erneut = new Map<string, { inc: string; art: ErneutArt }>();
  /** IVENA: Abmeldungen je Klinik und Fachbereich, Zuweisungen */
  private ivena: {
    abmeldungen: IvenaAbmeldung[];
    zuweisungen: NonNullable<PublicState['ivena']>['zuweisungen'];
    nextCheck: number;
    last: Record<string, number>;
    wartezeit: Record<string, number>;
  } = {
    abmeldungen: [],
    zuweisungen: [],
    nextCheck: 0,
    last: {},
    wartezeit: {},
  };
  /** Fahrzeuge auf dem Weg zu einer Klinik außerhalb der Karte: Klinik und Ankunftszeit nach dem Kartenrand */
  private ausserhalb = new Map<string, { hospitalId: string; bis: number }>();
  private recentTpl: string[] = [];
  /** Dienstzeiten je Fahrzeug (nur Fahrzeuge mit Schichtplan) */
  private dienst = new Map<string, Dienstzeit[]>();
  private startDate: Date;
  private lastDienstMinute = -1;
  private scheduled: { at: number; fn: () => void }[] = [];
  private seq = { call: 0, inc: 100, radio: 0, player: 0 };
  private nextCallAt = 15_000;
  private nextBmaAt = 0;
  private nextKvbAt = Infinity;
  /** Uhrzeit beim Schichtbeginn in Minuten nach Mitternacht (vor dem Start einstellbar) */
  private clockStart: number;
  private gslFreq: Haeufigkeit = 'normal';
  private uwFreq: Haeufigkeit = 'normal';
  private nextGslAt = Infinity;
  private nextUwAt = Infinity;
  /** Laufende oder angekündigte Wetterlage */
  private wetter?: WetterLage;
  private dwd: DwdMeldung[] = [];
  private answerSum = 0;
  private hilfsSum = 0;
  private penalized = new Set<string>();
  private routeTimes = new Map<string, { times: number[]; t: number }>();
  /** Heimatstandorte der über die ESWL entsandten Fahrzeuge (nicht in scn.stations) */
  private fremdStations = new Map<string, Station>();
  /** Standorte aller Nachbarfahrzeuge, grenzen den eigenen Bereich ab */
  private nachbarBasen: Vec[] = [];

  constructor(scn: Scenario, opts: { seed?: number; events?: GameEvents; startDate?: Date } = {}) {
    this.scn = scn;
    this.graph = new RoadGraph(scn);
    this.types = new Map(scn.vehicleTypes.map((t) => [t.id, t]));
    this.rng = mulberry32(opts.seed ?? Date.now() & 0xffffffff);
    this.events = opts.events ?? {};
    ensureTmo(scn);
    ensureStichworte(scn);
    const d = opts.startDate ?? new Date();
    this.startDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    this.clockStart = scn.settings.startClock;
    for (const st of scn.stations) {
      for (const v of st.vehicles) {
        if (v.dienst?.length) this.dienst.set(v.id, v.dienst);
        this.units.push({
          id: v.id,
          callsign: v.callsign,
          type: v.type,
          stationId: st.id,
          status: 2,
          baseStatus: 2,
          task: 'station',
          x: st.x,
          y: st.y,
          heading: 0,
          routeIdx: 0,
          tmo: st.tmo,
        });
      }
    }
    this.nachbarBasen = (scn.nachbarn ?? []).flatMap((n) => n.fahrzeuge.map((f) => ({ x: f.x, y: f.y })));
    this.checkDienst();
    this.nextBmaAt = this.expDelay(scn.settings.bmaPerHour);
    if (scn.settings.callsPerHour <= 0) this.nextCallAt = Infinity;
    else this.nextKvbAt = this.expDelay(scn.settings.callsPerHour * KVB_SHARE);
  }

  // ---------- Hilfsfunktionen ----------
  private rand(a: number, b: number) {
    return a + this.rng() * (b - a);
  }
  private pick<T>(arr: T[]): T {
    return arr[Math.floor(this.rng() * arr.length)];
  }
  private expDelay(perHour: number) {
    if (perHour <= 0) return Infinity;
    return -Math.log(1 - this.rng()) * (3_600_000 / perHour);
  }
  private after(ms: number, fn: () => void) {
    this.scheduled.push({ at: this.time + ms, fn });
  }
  private addScore(points: number, text: string) {
    this.score.points += points;
    this.score.events.unshift({ t: this.time, text, points });
    if (this.score.events.length > 60) this.score.events.length = 60;
  }
  private log(inc: IncidentState, text: string) {
    inc.log.push({ t: this.time, text });
  }
  private radioMsg(from: string, to: string, text: string, kind: RadioMessage['kind'], group?: string) {
    // Sprechfunk läuft in der Rufgruppe des Fahrzeugs; FMS-Status (Kurzdatennachricht) und Alarmierung (Funkmelder) ohne Gruppe
    if (!group && kind === 'voice') group = this.units.find((u) => u.callsign === from || u.callsign === to)?.tmo;
    this.radio.push({ id: ++this.seq.radio, t: this.time, from, to, text, kind, group });
    if (this.radio.length > 300) this.radio.splice(0, this.radio.length - 300);
  }
  private unit(id: string) {
    return this.units.find((u) => u.id === id);
  }
  private incident(id: string) {
    return this.incidents.find((i) => i.id === id);
  }
  private typeOf(u: UnitState) {
    return this.types.get(u.type);
  }
  private station(u: UnitState) {
    return this.scn.stations.find((s) => s.id === u.stationId) ?? this.fremdStations.get(u.stationId)!;
  }
  private fill(text: string, t: Truth, phone = '') {
    const f = t.facts;
    const m = (f?.sex ?? 'm') === 'm';
    return text
      .replace(/\{wo\}/g, t.spokenWhere)
      .replace(/\{name\}/g, t.name)
      .replace(/\{vorname\}/g, t.name.split(' ')[0])
      .replace(/\{nachname\}/g, f?.nachname ?? t.name.split(' ').pop()!)
      .replace(/\{nachnameP\}/g, this.pick(LAST_NAMES))
      .replace(/\{alterRund\}/g, String(Math.max(20, Math.round(t.alter / 10) * 10)))
      .replace(/\{alter\}/g, t.alter <= 1 ? 'eineinhalb' : String(t.alter))
      .replace(/\{floor\}/g, f?.floor ?? 'erster Stock')
      .replace(/\{min\}/g, String(f?.minutes ?? 10))
      .replace(/\{Er\}/g, m ? 'Er' : 'Sie')
      .replace(/\{er\}/g, m ? 'er' : 'sie')
      .replace(/\{ihn\}/g, m ? 'ihn' : 'sie')
      .replace(/\{ihm\}/g, m ? 'ihm' : 'ihr')
      .replace(/\{objekt\}/g, t.objekt ?? 'Heim')
      .replace(/\{termin\}/g, t.termin !== undefined ? `${this.uhrzeit(t.termin)} Uhr` : 'gleich')
      .replace(/\{ziel\}/g, t.ziel ?? 'Krankenhaus')
      .replace(/\{streife\}/g, t.streife ?? 'Funkstreife')
      .replace(/\{phone\}/g, phone);
  }
  /** Uhrzeit (HH:MM) zu einer Spielzeit */
  private uhrzeit(t: number) {
    const m = Math.floor(this.clockStart + t / 60000);
    const h = Math.floor((((m % 1440) + 1440) % 1440) / 60);
    return `${String(h).padStart(2, '0')}:${String(((m % 60) + 60) % 60).padStart(2, '0')}`;
  }

  // ---------- Spieler ----------
  addPlayer(name: string, role: Role): Player {
    const p: Player = { id: `p${++this.seq.player}`, name: name.slice(0, 24) || 'Disponent', role, connected: true };
    this.players.push(p);
    return p;
  }

  removePlayer(id: string) {
    const p = this.players.find((x) => x.id === id);
    if (!p) return;
    for (const u of this.units) if (u.crewPlayerId === id) u.crewPlayerId = undefined;
    for (const c of this.calls) if (c.takerId === id && c.state === 'active') c.takerId = undefined;
    this.players = this.players.filter((x) => x.id !== id);
  }

  // ---------- Notrufgenerierung ----------
  private randomLocation(tpl: IncidentTemplate): { pos: Vec; address: string; spoken: string; objekt?: string } | null {
    const nodeById = new Map(this.scn.nodes.map((n) => [n.id, n]));
    const roadsOf = (types: string[]) => this.scn.roads.filter((r) => types.includes(r.type));
    const pointOn = (types: string[]) => {
      const list = roadsOf(types);
      if (!list.length) return null;
      const r = this.pick(list);
      const a = nodeById.get(r.a)!;
      const b = nodeById.get(r.b)!;
      const t = this.rand(0.15, 0.85);
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    };
    const objs = this.scn.objects.filter((o) => !tpl.objectKinds || tpl.objectKinds.includes(o.kind));
    if (tpl.where === 'klinik' && this.scn.hospitals.length) {
      // Abholung auf Station: Verlegung oder Entlassung (nur Kliniken auf der Karte)
      const pool = tpl.verlegung ? this.verlegungsKliniken(tpl).von : this.scn.hospitals.filter((h) => !h.ausserhalbMin);
      if (!pool.length) return null;
      const h = this.pick(pool);
      const hit = reverseGeocode(this.scn, h);
      const address = hit && hit.distance < 300 ? hit.text : nearestTown(this.scn.towns, h)?.name ?? '';
      return { pos: { x: h.x, y: h.y }, address: `${h.name}, ${address}`, spoken: `Im ${h.name}, ${address}.`, objekt: h.name };
    }
    if (tpl.where === 'objekt' && objs.length) {
      const obj = this.pick(objs);
      const hit = reverseGeocode(this.scn, obj);
      const address = hit?.text ?? obj.name;
      return { pos: { x: obj.x, y: obj.y }, address: `${obj.name}, ${address}`, spoken: `Im ${obj.name}, ${address}.`, objekt: obj.name };
    }
    if (tpl.where === 'autobahn') {
      const p = pointOn(['autobahn']);
      if (p) {
        const town = nearestTown(this.scn.towns, p)?.name ?? '';
        const road = reverseGeocode(this.scn, p)?.road.name ?? 'Autobahn';
        const dir = this.rng() < 0.5 ? 'Richtung Osten' : 'Richtung Westen';
        return {
          pos: p,
          address: `${road} ${dir} bei ${town}`,
          spoken: `Auf der ${road}, ${dir}, irgendwo bei ${town}. Ein Kilometerschild hab ich nicht gesehen.`,
        };
      }
    }
    if (tpl.where === 'ausserorts' || tpl.where === 'autobahn') {
      const p = pointOn(['landstrasse', 'bundesstrasse']);
      if (p) {
        const hit = reverseGeocode(this.scn, p)!;
        const towns = [...this.scn.towns].sort((a, b) => dist(a, p) - dist(b, p));
        const km = Math.max(1, Math.round((dist(towns[0], p) - towns[0].radius) / 1000));
        return {
          pos: hit.point,
          address: `${hit.street} bei ${towns[0].name}`,
          spoken: `Auf der ${hit.street} zwischen ${towns[0].name} und ${towns[1]?.name ?? 'dem Nachbarort'}, ungefähr ${km} Kilometer nach ${towns[0].name}.`,
        };
      }
    }
    // Echte Karte: eine echte Hausnummer wählen
    const addrs = this.scn.addresses;
    if (addrs?.length && tpl.where !== 'strasse') {
      const a = this.pick(addrs);
      const spoken =
        this.rng() < 0.15 ? `${a.street} ${a.number}... äh, in ${a.town}. Zweiter Stock.` : `${a.street} ${a.number} in ${a.town}.`;
      return { pos: { x: a.x, y: a.y }, address: `${a.street} ${a.number}, ${a.town}`, spoken };
    }
    const p = pointOn(['ortsstrasse']);
    if (!p) return null;
    const hit = reverseGeocode(this.scn, p)!;
    const spoken =
      tpl.where === 'strasse'
        ? `In der ${hit.street} in ${hit.town}, ungefähr bei Hausnummer ${hit.number}.`
        : this.rng() < 0.15
          ? `${hit.street} ${hit.number}... äh, in ${hit.town}. Zweiter Stock.`
          : `${hit.street} ${hit.number} in ${hit.town}.`;
    return { pos: hit.point, address: hit.text, spoken };
  }

  private buildTruth(tpl: IncidentTemplate): Truth | null {
    const fake = !tpl.stichwort;
    let loc: { pos: Vec; address: string; spoken: string; objekt?: string } | null;
    if (fake) {
      const town = this.pick(this.scn.towns);
      loc = { pos: { x: town.x, y: town.y }, address: '', spoken: 'Das sag ich doch, es ist kein Notfall.' };
    } else loc = this.randomLocation(tpl);
    if (!loc) return null;
    const sw = this.scn.stichworte.find((s) => s.code === tpl.stichwort);
    const needs = { ...(tpl.needs ?? sw?.aao ?? {}) };
    const name = `${this.pick(FIRST_NAMES)} ${this.pick(LAST_NAMES)}`;
    const age = tpl.age ?? [55, 89];
    const alter = Math.floor(this.rand(age[0], age[1] + 0.99));
    const facts: CallerFacts = {
      name,
      nachname: name.split(' ')[1],
      alter,
      sex: tpl.sex ?? (this.rng() < 0.5 ? 'm' : 'w'),
      role: tpl.role ?? (tpl.where === 'objekt' ? 'personal' : tpl.patients?.length ? 'angehoerig' : 'passant'),
      floor: this.pick(FLOORS),
      minutes: Math.round(this.rand(5, 40)),
      vorerkrankung: '',
    };
    // Die Streife vor Ort nennt den Einsatzort genau, ohne Zögern
    let streife: string | undefined;
    if (tpl.polizeiVorOrt) {
      // Funkrufname der Polizei im Bereich: immer „Main“ mit Nummer, z. B. Main 15/4
      streife = `Main ${Math.floor(this.rand(11, 19.99))}/${Math.floor(this.rand(1, 4.99))}`;
      if (tpl.where !== 'ausserorts' && tpl.where !== 'autobahn') loc = { ...loc, spoken: `Einsatzort ist ${loc.address}.` };
    }
    // Fahrzeugtypen, die im Szenario nicht existieren, ignorieren
    for (const k of Object.keys(needs)) if (!this.units.some((u) => this.typeOf(u)?.fills.includes(k))) delete needs[k];
    // Terminfahrt: Abholzeit auf die Viertelstunde, Ziel passend zum Patienten (bzw. das Heim bei der Heimfahrt)
    let termin: number | undefined;
    let ziel: string | undefined;
    if (tpl.termin) {
      const min = this.clockStart + (this.time + this.rand(tpl.termin[0], tpl.termin[1]) * 60_000) / 60000;
      termin = (Math.ceil(min / 15) * 15 - this.clockStart) * 60000;
      const fach = tpl.patients?.[0] ? zielFach(tpl.patients[0].specialty, this.scn.hospitals) : undefined;
      if (fach) {
        const passend = this.scn.hospitals.filter((h) => h.specialties.includes(fach) && h.name !== loc!.objekt);
        ziel = (passend.length ? this.pick(passend) : this.scn.hospitals.find((h) => h.name !== loc!.objekt))?.name;
      } else {
        const heime = this.scn.objects.filter((o) => o.kind === 'seniorenheim');
        ziel = heime.length ? this.pick(heime).name : 'Pflegeheim';
      }
    }
    // Notfallverlegung: Die nächste geeignete Klinik hat zugesagt (bevorzugt eine, die in IVENA angemeldet ist)
    let zielId: string | undefined;
    if (tpl.verlegung) {
      const von = this.scn.hospitals.find((h) => h.name === loc!.objekt);
      const { fach } = this.verlegungsKliniken(tpl);
      const nach = this.scn.hospitals
        .filter((h) => h.specialties.includes(fach) && h.id !== von?.id)
        .sort((a, b) => Number(!!this.abgemeldet(a.id, fach)) - Number(!!this.abgemeldet(b.id, fach)) || klinikKm(a, loc!.pos) - klinikKm(b, loc!.pos));
      if (!nach.length) return null;
      ziel = nach[0].name;
      zielId = nach[0].id;
    } else if (ziel) zielId = this.scn.hospitals.find((h) => h.name === ziel)?.id;
    return {
      termin,
      ziel,
      zielId,
      tpl,
      stichwort: tpl.stichwort,
      pos: loc.pos,
      address: loc.address,
      spokenWhere: loc.spoken,
      objekt: loc.objekt,
      needs,
      patients: (tpl.patients ?? []).map((p, i) => ({
        ...p,
        pzc: pzcFuer(p.desc, p.specialty, i === 0 ? alter : /kind|säugling/i.test(p.desc) ? this.rand(1, 6) : this.rand(18, 80), tpl.stichwort === 'RD 2'),
        done: false,
      })),
      lage: tpl.lage,
      workMs: this.rand(tpl.workMin[0], tpl.workMin[1]) * 60_000,
      name,
      alter,
      facts,
      fake,
      streife,
    };
  }

  /** Erzeugt einen neuen Notruf (optional mit fester Vorlage, für Tests) */
  /**
   * Gezielt erzeugte Anrufe (templateId) bleiben ohne Zufall bei Panik und erneutem Anruf,
   * damit sie berechenbar sind; opts schaltet beides gezielt ein.
   */
  spawnCall(templateId?: string, opts: { panik?: number; erneut?: boolean } = {}): CallState | null {
    const tpl = templateId
      ? ALLE_VORLAGEN.find((t) => t.id === templateId)
      : this.weightedTemplate();
    if (!tpl) return null;
    const truth = this.buildTruth(tpl);
    if (!truth) return null;
    truth.panik = opts.panik ?? (templateId ? undefined : this.rollPanik(truth));
    truth.erneut = opts.erneut ? 'immer' : templateId ? undefined : 'zufall';
    return this.ring(truth);
  }

  /** Wie oft ein Anrufer beruhigt werden muss (0 = gefasst); Angehörige bei schweren Notfällen öfter panisch */
  private rollPanik(truth: Truth): number {
    if (truth.fake || truth.streife || truth.termin !== undefined || truth.stichwort.startsWith('RD KTP')) return 0;
    const role = truth.facts?.role;
    if (role === 'personal') return 0;
    const schwer = truth.tpl.tcpr || truth.stichwort === 'RD 2' || truth.stichwort.startsWith('B 3') || truth.stichwort.startsWith('B 4');
    const p = (schwer ? 0.3 : truth.stichwort.startsWith('RD') || truth.stichwort.startsWith('B') ? 0.12 : 0.06) * (role === 'angehoerig' ? 1.3 : 1);
    return this.rng() < p ? (this.rng() < 0.5 ? 1 : 2) : 0;
  }

  /** Notfallverlegung: Kliniken auf der Karte mit Notaufnahme, denen der Fachbereich des Patienten fehlt */
  private verlegungsKliniken(tpl: IncidentTemplate): { von: Hospital[]; fach: string } {
    const fach = zielFach(tpl.patients?.[0]?.specialty ?? 'Innere Medizin', this.scn.hospitals);
    const ziele = this.scn.hospitals.filter((h) => h.specialties.includes(fach));
    const von = this.scn.hospitals.filter(
      (h) => !h.ausserhalbMin && !h.specialties.includes(fach) && h.specialties.some((f) => ['Innere Medizin', 'Chirurgie', 'Unfallchirurgie'].includes(f)),
    );
    return { von: ziele.length ? von : [], fach };
  }

  private weightedTemplate(): IncidentTemplate {
    const season = this.season();
    const hour = Math.floor((((this.gameMinute() % 1440) + 1440) % 1440) / 60);
    const night = hour >= 20 || hour < 6;
    // Während eines Unwetters ist ein Großteil der Notrufe wetterbedingt
    const lage = this.wetterAktiv();
    const wetterPool = lage && this.rng() < wetterAnteil(lage.art, lage.stufe) ? wetterVorlagen(lage.art) : [];
    const pool: LageTemplate[] = wetterPool.length ? wetterPool : [...TEMPLATES, ...SAISON_TEMPLATES.filter((t) => t.seasons?.includes(season))];
    const usable = pool.filter(
      (t) =>
        (t.where !== 'objekt' || this.scn.objects.some((o) => !t.objectKinds || t.objectKinds.includes(o.kind))) &&
        (t.where !== 'klinik' || this.scn.hospitals.length >= 2) &&
        (!t.verlegung || this.verlegungsKliniken(t).von.length > 0),
    );
    // Kürzlich gespielte Vorlagen seltener, damit sich Einsätze nicht ständig wiederholen
    const w = (t: IncidentTemplate) => {
      // Jahreszeit; Krankentransporte fahren fast nur tagsüber
      const base = t.weight * (wetterPool.length ? 1 : SAISON_FAKTOR[t.id]?.[season] ?? 1) * (night && t.stichwort === 'RD KTP' ? 0.1 : 1);
      const i = this.recentTpl.lastIndexOf(t.id);
      if (i < 0) return base;
      const age = this.recentTpl.length - i;
      return base * (age <= 3 ? 0.05 : age <= 8 ? 0.35 : 0.7);
    };
    const total = usable.reduce((s, t) => s + w(t), 0);
    let r = this.rng() * total;
    let pick = usable[0];
    for (const t of usable) {
      r -= w(t);
      if (r <= 0) {
        pick = t;
        break;
      }
    }
    this.recentTpl.push(pick.id);
    if (this.recentTpl.length > 14) this.recentTpl.shift();
    return pick;
  }

  private ring(truth: Truth, again = false): CallState {
    // Die Polizei ruft über das Diensthandy der Streife an, ohne Handyortung
    if (truth.streife) {
      const call: CallState = {
        id: `c${++this.seq.call}`,
        phone: `Polizei ${truth.streife}`,
        kind: '112',
        state: 'ringing',
        ringStart: this.time,
        transcript: again ? [{ from: 'system', text: 'Polizei ruft erneut an (vorheriger Anruf nicht angenommen).', t: this.time }] : [],
        asked: [],
        polizei: truth.streife,
      };
      truth.callStart ??= this.time;
      this.calls.push(call);
      this.callTruth.set(call.id, truth);
      return call;
    }
    // Krankentransporte bestellt man über die 19222, meist vom Festnetz der Einrichtung; AML gibt es nur beim Notruf
    const ktp = truth.stichwort.startsWith('RD KTP');
    // Heute kommen die meisten Notrufe vom Handy; moderne Smartphones senden fast immer eine AML-Ortung
    const mobile = this.rng() < (ktp ? (truth.tpl.where === 'wohnung' ? 0.4 : 0.1) : 0.8);
    const phone = mobile
      ? `0${this.pick(['151', '160', '170', '176'])} ${Math.floor(this.rand(1e6, 9e6))}`
      : `0${Math.floor(this.rand(8000, 9999))} ${Math.floor(this.rand(1000, 99999))}`;
    const call: CallState = {
      id: `c${++this.seq.call}`,
      phone,
      kind: '112',
      state: 'ringing',
      ringStart: this.time,
      transcript: again ? [{ from: 'system', text: 'Anrufer ruft erneut an (vorheriger Anruf nicht angenommen).', t: this.time }] : [],
      asked: [],
      leitung: ktp ? '19222' : undefined,
    };
    if (mobile && !ktp && this.rng() < (truth.fake ? 0.6 : 0.92)) {
      const acc = Math.round(this.rand(30, 400));
      const ang = this.rand(0, Math.PI * 2);
      const off = this.rand(0, acc * 0.7);
      call.aml = { x: truth.pos.x + Math.cos(ang) * off, y: truth.pos.y + Math.sin(ang) * off, acc };
    }
    // Festnetz: Anschlussadresse aus dem Teilnehmerverzeichnis (meist der Notfallort)
    if (!mobile && !truth.fake && (truth.tpl.where === 'wohnung' || ktp) && this.rng() < 0.85) {
      call.landline = { x: truth.pos.x, y: truth.pos.y, address: truth.address };
    }
    truth.callStart ??= this.time;
    this.calls.push(call);
    this.callTruth.set(call.id, truth);
    return call;
  }

  /** Erzeugt eine BMA-Auslösung an einem Objekt mit Brandmeldeanlage */
  spawnBma(): CallState | null {
    const objs = this.scn.objects.filter((o) => o.bma);
    if (!objs.length) return null;
    const obj = this.pick(objs);
    const hit = reverseGeocode(this.scn, obj);
    const sw = this.scn.stichworte.find((s) => s.code === 'B BMA');
    const melder = Math.floor(this.rand(1, 40));
    const truth: Truth = {
      tpl: BMA_TEMPLATE,
      stichwort: 'B BMA',
      pos: { x: obj.x, y: obj.y },
      address: hit?.text ?? obj.name,
      spokenWhere: '',
      objekt: obj.name,
      needs: { ...(sw?.aao ?? { HLF: 1 }) },
      patients: [],
      lage: BMA_TEMPLATE.lage,
      workMs: this.rand(10, 15) * 60_000,
      name: '',
      alter: 0,
      fake: false,
      callStart: this.time,
      melder,
    };
    const call: CallState = {
      id: `c${++this.seq.call}`,
      phone: 'BMA',
      kind: 'bma',
      state: 'ringing',
      ringStart: this.time,
      transcript: [],
      asked: [],
      bma: {
        text: `BMA-Auslösung ${obj.name}, Meldergruppe ${melder}`,
        x: obj.x,
        y: obj.y,
        address: `${obj.name}, ${hit?.text ?? ''}`,
      },
    };
    this.calls.push(call);
    this.callTruth.set(call.id, truth);
    return call;
  }

  /** Übergabe der KVB (116117): Der Bereitschaftsdienst schickt einen Fall, der doch Rettungsdienst braucht */
  spawnKvb(templateId?: string): CallState | null {
    const id = templateId ?? this.pick(Object.keys(KVB_UEBERGABE));
    const tpl = TEMPLATES.find((t) => t.id === id);
    if (!tpl) return null;
    const truth = this.buildTruth(tpl);
    if (!truth) return null;
    truth.callStart = this.time;
    const call: CallState = {
      id: `c${++this.seq.call}`,
      phone: '116117',
      kind: 'kvb',
      state: 'ringing',
      ringStart: this.time,
      transcript: [],
      asked: [],
      kvb: {
        text: `Übergabe KVB 116117: ${KVB_UEBERGABE[id]}. Patient ${truth.facts?.nachname ?? truth.name.split(' ')[1] ?? ''}, ${truth.alter} J.`,
        x: truth.pos.x,
        y: truth.pos.y,
        address: truth.address,
      },
    };
    this.calls.push(call);
    this.callTruth.set(call.id, truth);
    return call;
  }

  /** Rettungsmittel ruft in der Leitstelle an, um seinen Patienten mit PZC anzumelden */
  private ringRtw(u: UnitState, p: { pzc: string; desc: string }): CallState {
    const call: CallState = {
      id: `c${++this.seq.call}`,
      phone: `${radioName(u.callsign)} (Diensthandy)`,
      kind: 'rtw',
      state: 'ringing',
      ringStart: this.time,
      transcript: [],
      asked: [],
      rtw: {
        unitId: u.id,
        callsign: u.callsign,
        pzc: p.pzc,
        text: `Hier ${radioName(u.callsign)}, ich möchte einen Patienten anmelden. PZC ${pzcSprech(p.pzc)}. ${p.desc}.${
          voranmeldungFuer(p.pzc) ? ` Bitte ${voranmeldungFuer(p.pzc)} voranmelden.` : ''
        } ${
          u.verlegungNach
            ? `Transport wie vereinbart ins ${this.scn.hospitals.find((h) => h.id === u.verlegungNach)?.name ?? 'Zielkrankenhaus'}, passt das?`
            : 'Welche Klinik können wir anfahren?'
        }`,
      },
    };
    this.calls.push(call);
    return call;
  }

  /** Telefonische Anmeldung beenden, sobald eine Zielklinik feststeht */
  private closeRtwCall(u: UnitState, h: Hospital) {
    const call = this.calls.find((c) => c.kind === 'rtw' && c.rtw?.unitId === u.id && c.state !== 'ended');
    if (!call) return false;
    const active = call.state === 'active';
    if (active) {
      // Das Gespräch läuft weiter: Die Besatzung quittiert, aufgelegt wird vom Calltaker
      call.transcript.push({ from: 'calltaker', text: `Fahren Sie bitte ${h.name} an, die Klinik ist in IVENA informiert.`, t: this.time });
      this.callerSays(call, `Verstanden, wir fahren ${h.name} an. Danke, tschüss.`, this.rand(1500, 2500));
      // Legt der Calltaker nicht auf, beendet die Besatzung das Gespräch nach einer Weile selbst
      this.after(25_000, () => {
        if (call.state !== 'active') return;
        call.transcript.push({ from: 'system', text: 'Die Besatzung hat aufgelegt.', t: this.time });
        call.state = 'ended';
        call.endedAt = this.time;
        call.typing = false;
      });
      return true;
    }
    call.transcript.push({ from: 'system', text: `Zielklinik ${h.name} wurde inzwischen zugewiesen, Anrufer hat aufgelegt.`, t: this.time });
    call.state = 'ended';
    call.endedAt = this.time;
    return false;
  }

  private transferKvb(player: Player, callId: string): string | void {
    const call = this.calls.find((c) => c.id === callId);
    if (!call || call.state !== 'active' || call.kind !== '112') return 'Kein aktives Notrufgespräch';
    if (call.takerId !== player.id) return 'Das Gespräch führt ein anderer Calltaker';
    if (call.incidentId) return 'Zu diesem Anruf gibt es bereits einen Einsatz';
    if (call.toKvb) return 'Der Anruf wird bereits an die KVB weiterverbunden';
    const truth = this.callTruth.get(call.id)!;
    call.toKvb = true;
    if (truth.tpl.kvb) this.addScore(10, 'Anrufer richtig an den ärztlichen Bereitschaftsdienst vermittelt');
    else if (truth.fake) this.addScore(-5, 'Fehlanruf an die KVB weiterverbunden');
    else this.addScore(-30, `Notfall an die KVB weiterverbunden (richtig wäre ${truth.stichwort})`);
    // Erklären, Reaktion des Anrufers, Weitervermittlung mit Rückfallhinweis, Quittung, Übergabe
    const wer = truth.facts?.role === 'selbst' ? 'selbst' : 'andere';
    call.transcript.push({ from: 'calltaker', text: this.fill(this.pick(KVB_ERKLAERUNG[wer]), truth), t: this.time });
    const d1 = this.rand(1800, 2600);
    this.callerSays(call, this.pick(truth.tpl.kvb ? KVB_REAKTION.passend : truth.fake ? KVB_REAKTION.fehl : KVB_REAKTION.notfall), d1);
    this.after(d1 + 2500, () => {
      if (call.state !== 'active') return;
      call.transcript.push({ from: 'calltaker', text: this.fill(this.pick(KVB_UEBERLEITUNG[wer]), truth), t: this.time });
      const d2 = this.rand(1500, 2200);
      this.callerSays(call, this.pick(KVB_QUITTUNG), d2);
      this.after(d2 + 1500, () => {
        if (call.state !== 'active') return;
        call.transcript.push({ from: 'system', text: 'Weiterleitung zur 116117 … Ansage und Wartemusik der KVB-Vermittlungszentrale.', t: this.time });
        this.after(2500, () => {
          if (call.state === 'active') this.kvbUebergeben(call);
        });
      });
    });
  }

  private kvbUebergeben(call: CallState) {
    call.transcript.push({ from: 'system', text: 'Gespräch an den ärztlichen Bereitschaftsdienst (116117) übergeben.', t: this.time });
    call.state = 'ended';
    call.endedAt = this.time;
    call.typing = false;
  }

  private requestPolice(player: Player, incidentId: string): string | void {
    const inc = this.incident(incidentId);
    if (!inc) return 'Einsatz nicht gefunden';
    if (inc.polizei) return 'Polizei ist bereits verständigt';
    inc.polizei = 'angefordert';
    this.log(inc, `Polizei verständigt (${player.name})`);
    const truth = this.incTruth.get(inc.id);
    if (truth?.tpl.polizei) this.addScore(5, `${inc.nr}: Polizei verständigt`);
    this.after(this.rand(4, 12) * 60_000, () => {
      if (inc.status === 'abgeschlossen') return;
      inc.polizei = 'vor Ort';
      this.log(inc, 'Polizei vor Ort');
    });
  }

  // ---------- Aktionen ----------
  handle(playerId: string, action: Action): string | void {
    const player = this.players.find((p) => p.id === playerId);
    if (!player) return 'Unbekannter Spieler';
    switch (action.a) {
      case 'setRole': {
        player.role = action.role;
        for (const u of this.units) if (u.crewPlayerId === player.id) u.crewPlayerId = undefined;
        player.unitId = undefined;
        if (action.role === 'crew' && action.unitId) {
          const u = this.unit(action.unitId);
          if (!u) return 'Fahrzeug nicht gefunden';
          if (u.crewPlayerId) return 'Fahrzeug ist bereits besetzt';
          u.crewPlayerId = player.id;
          player.unitId = u.id;
        }
        return;
      }
      case 'setup':
        return this.setup(action);
      case 'start':
        if (!this.started) this.planLagen();
        this.started = true;
        this.running = true;
        return;
      case 'pause':
        if (!this.started) return;
        this.running = !action.paused;
        return;
      case 'speed':
        this.speed = Math.max(0.5, Math.min(8, action.speed));
        return;
      case 'answerCall':
        return this.answerCall(player, action.callId);
      case 'ask':
        return this.ask(player, action.callId, action.question, action.text);
      case 'endCall':
        return this.endCall(player, action.callId);
      case 'transferKvb':
        return this.transferKvb(player, action.callId);
      case 'requestPolice':
        return this.requestPolice(player, action.incidentId);
      case 'createIncident':
        return this.createIncident(player, action);
      case 'updateIncident': {
        const inc = this.incident(action.incidentId);
        if (!inc) return 'Einsatz nicht gefunden';
        if (action.stichwort && action.stichwort !== inc.stichwort) {
          const sw = this.scn.stichworte.find((s) => s.code === action.stichwort);
          this.log(inc, `Stichwort geändert: ${inc.stichwort} → ${action.stichwort}`);
          inc.stichwort = action.stichwort;
          inc.label = sw?.label ?? inc.label;
          if (action.schlagwort === undefined && inc.schlagwort && findSchlagwort(inc.schlagwort)?.code !== inc.stichwort) inc.schlagwort = undefined;
        }
        if (action.schlagwort !== undefined && action.schlagwort !== inc.schlagwort) {
          inc.schlagwort = findSchlagwort(action.schlagwort)?.code === inc.stichwort ? action.schlagwort : undefined;
          if (inc.schlagwort) this.log(inc, `Schlagwort: ${inc.schlagwort}`);
        }
        if (action.note !== undefined) inc.note = action.note;
        if (action.termin !== undefined) {
          if (action.termin === null) {
            if (inc.termin !== undefined) this.log(inc, 'Termin aufgehoben');
            inc.termin = undefined;
          } else {
            if (!isFinite(action.termin) || action.termin < this.time - TERMIN_VORLAUF_MS || action.termin > this.time + 24 * 3600_000) return 'Ungültige Abholzeit';
            if (action.termin !== inc.termin) this.log(inc, `Termin geändert: Abholung ${this.uhrzeit(action.termin)} Uhr`);
            inc.termin = action.termin;
            const ae = this.incTruth.get(inc.id)?.aenderung;
            if (ae?.art === 'verschieben' && !ae.umgesetzt && Math.abs(action.termin - ae.neu!) <= 5 * 60_000) {
              ae.umgesetzt = true;
              this.addScore(10, `${inc.nr}: Neue Abholzeit ${this.uhrzeit(ae.neu!)} Uhr eingetragen`);
            }
          }
          inc.terminMeldung = undefined;
        }
        if (action.tmo !== undefined && action.tmo !== inc.tmo) {
          const g = this.tmoName(action.tmo);
          inc.tmo = action.tmo || undefined;
          this.log(inc, inc.tmo ? `Einsatz-Rufgruppe ${g}` : 'Einsatz-Rufgruppe aufgehoben');
          for (const id of inc.unitIds) {
            const u = this.unit(id);
            if (u) this.switchTmo(u, inc.tmo ?? this.station(u).tmo);
          }
        }
        return;
      }
      case 'setTmo': {
        if (!this.scn.tmoGroups?.some((g) => g.id === action.group)) return 'Unbekannte Rufgruppe';
        for (const id of action.unitIds) {
          const u = this.unit(id);
          if (u) this.switchTmo(u, action.group);
        }
        return;
      }
      case 'groupCall': {
        const text = action.text.trim().slice(0, 300);
        if (!text || !this.scn.tmoGroups?.some((g) => g.id === action.group)) return;
        this.radioMsg(this.scn.ilsName, `alle in ${this.tmoName(action.group)}`, text, 'voice', action.group);
        const first = this.units.find((u) => u.tmo === action.group && !u.crewPlayerId && u.status !== 6);
        if (first) this.after(this.rand(2500, 5000), () => this.radioMsg(first.callsign, this.scn.ilsName, 'Verstanden.', 'voice', action.group));
        return;
      }
      case 'crewTmo': {
        const u = player.unitId ? this.unit(player.unitId) : undefined;
        if (!u) return 'Kein Fahrzeug besetzt';
        if (!this.scn.tmoGroups?.some((g) => g.id === action.group)) return 'Unbekannte Rufgruppe';
        u.tmo = action.group;
        return;
      }
      case 'alarm':
        return this.alarm(player, action.incidentId, action.unitIds);
      case 'eswl':
        return this.eswl(player, action);
      case 'releaseUnit':
        return this.releaseUnit(action.unitId, true);
      case 'cover':
        return this.cover(player, action);
      case 'sendHome':
        return this.sendHome(action.unitId);
      case 'closeIncident': {
        const inc = this.incident(action.incidentId);
        if (!inc) return 'Einsatz nicht gefunden';
        for (const id of [...inc.unitIds]) {
          const u = this.unit(id);
          if (u?.hasPatient) return `${u.callsign} hat noch einen Patienten an Bord`;
        }
        for (const id of [...inc.unitIds]) this.releaseUnit(id, false);
        this.closeIncident(inc, true);
        return;
      }
      case 'reopenIncident':
        return this.reopenIncident(action.incidentId);
      case 'speakPermit':
        return this.speakPermit(action.unitId);
      case 'assignHospital':
        return this.assignHospital(action.unitId, action.hospitalId);
      case 'voranmelden':
        return this.voranmelden(action.unitId);
      case 'radio': {
        const u = this.unit(action.unitId);
        if (!u) return 'Fahrzeug nicht gefunden';
        const text = action.text.trim().slice(0, 300);
        if (!text) return;
        this.radioMsg(this.scn.ilsName, u.callsign, text, 'voice');
        if (!u.crewPlayerId) {
          this.after(this.rand(2500, 5000), () => {
            const reply = this.radioReply(u, text, player);
            if (reply) this.radioMsg(u.callsign, this.scn.ilsName, reply, 'voice');
          });
        }
        return;
      }
      case 'crewStatus':
        return this.crewStatus(player, action.status as FmsStatus);
      case 'crewRadio': {
        const u = player.unitId ? this.unit(player.unitId) : undefined;
        if (!u) return 'Kein Fahrzeug besetzt';
        const text = action.text.trim().slice(0, 300);
        if (text) this.radioMsg(u.callsign, this.scn.ilsName, text, 'voice');
        return;
      }
      case 'crewHospital': {
        const u = player.unitId ? this.unit(player.unitId) : undefined;
        if (!u) return 'Kein Fahrzeug besetzt';
        return this.assignHospital(u.id, action.hospitalId, true);
      }
      case 'geraet': {
        const g = { ...player.geraet };
        if (typeof action.ptt === 'boolean') {
          g.ptt = action.ptt;
          if (action.ptt) g.pttSeq = (g.pttSeq ?? 0) + 1;
        }
        if (action.pttUnitId !== undefined) g.pttUnitId = action.pttUnitId && this.unit(action.pttUnitId) ? action.pttUnitId : undefined;
        if (typeof action.sttBereit === 'boolean') g.sttBereit = action.sttBereit;
        if (typeof action.tonAmPc === 'boolean') g.tonAmPc = action.tonAmPc;
        player.geraet = g;
        return;
      }
    }
  }

  private answerCall(player: Player, callId: string): string | void {
    const call = this.calls.find((c) => c.id === callId);
    if (!call) return 'Anruf nicht gefunden';
    if (call.state !== 'ringing') return 'Anruf wurde bereits angenommen';
    // Eine laufende Weitervermittlung an die KVB wird beim nächsten Notruf direkt übergeben
    if (call.kind === '112')
      for (const c of this.calls) if (c.state === 'active' && c.takerId === player.id && c.toKvb) this.kvbUebergeben(c);
    if (this.calls.some((c) => c.state === 'active' && c.takerId === player.id && c.kind === '112') && call.kind === '112')
      return 'Du führst bereits ein Gespräch';
    call.state = 'active';
    call.takerId = player.id;
    call.answeredAt = this.time;
    const waited = (this.time - call.ringStart) / 1000;
    this.score.callsAnswered++;
    this.answerSum += waited;
    this.score.avgAnswerSec = this.answerSum / this.score.callsAnswered;
    const truth = this.callTruth.get(call.id)!;
    if (call.kind === 'bma') {
      call.transcript.push({ from: 'system', text: `${call.bma!.text} – ${call.bma!.address}`, t: this.time });
      this.addScore(5, 'BMA-Auslösung angenommen');
      return;
    }
    if (call.kind === 'rtw') {
      call.transcript.push({ from: 'calltaker', text: `Integrierte Leitstelle ${this.scn.ilsName.replace(/^(ILS|Leitstelle)\s*/, '')}, grüß Gott.`, t: this.time });
      call.transcript.push({ from: 'caller', text: call.rtw!.text, t: this.time });
      const u = this.unit(call.rtw!.unitId);
      const inc = u?.incidentId ? this.incident(u.incidentId) : undefined;
      if (inc) this.log(inc, `Telefon ${shortCallsign(call.rtw!.callsign)}: Patientenanmeldung, PZC ${call.rtw!.pzc}`);
      if (u) u.pzc = call.rtw!.pzc;
      return;
    }
    if (call.kind === 'kvb') {
      call.transcript.push({ from: 'system', text: `${call.kvb!.text} – ${call.kvb!.address}`, t: this.time });
      this.addScore(5, 'Übergabe der KVB angenommen');
      return;
    }
    this.addScore(Math.max(0, Math.round(15 - waited / 4)), `Notruf nach ${Math.round(waited)} s angenommen`);
    if (call.polizei) {
      // Kollegen der Polizei melden sich mit Funkrufname, Lage und Einsatzort in einem Zug
      call.transcript.push({ from: 'calltaker', text: `Integrierte Leitstelle ${this.scn.ilsName.replace(/^(ILS|Leitstelle)\s*/, '')}, grüß Gott.`, t: this.time });
      truth.whereSaid = true;
      this.callerSays(call, `${this.fill(this.pick(truth.tpl.opening), truth, call.phone)} ${truth.spokenWhere}`);
      return;
    }
    const erneut = this.erneut.get(call.id);
    if (erneut !== undefined) {
      const inc = this.incident(erneut.inc);
      call.transcript.push({ from: 'calltaker', text: 'Notruf Feuerwehr und Rettungsdienst. Wo genau ist der Notfallort?', t: this.time });
      call.transcript.push({ from: 'system', text: `Rufnummer bekannt: erneuter Anruf zu Einsatz ${inc?.nr ?? ''} (${inc?.address ?? truth.address}).`, t: this.time });
      const art = erneut.art;
      const text = typeof art === 'number' ? ERNEUT_VERSCHLECHTERUNG[art].text : this.pick(art === 'niemand' ? ERNEUT_NIEMAND : ERNEUT_NACHFRAGE);
      this.callerSays(call, this.fill(text, truth, call.phone));
      if (inc) this.log(inc, typeof art === 'number' ? `Erneuter Anruf: ${truth.verschlechtert}` : 'Erneuter Anruf: Anrufer fragt nach dem Eintreffen');
      return;
    }
    call.transcript.push({
      from: 'calltaker',
      text:
        call.leitung === '19222'
          ? `Integrierte Leitstelle ${this.scn.ilsName.replace(/^(ILS|Leitstelle)\s*/, '')}, Krankentransport, grüß Gott. Von wo soll der Patient abgeholt werden?`
          : 'Notruf Feuerwehr und Rettungsdienst. Wo genau ist der Notfallort?',
      t: this.time,
    });
    call.asked.push('wo');
    const panisch = (truth.panik ?? 0) > 0;
    this.callerSays(call, (panisch ? this.pick(PANIK_OPENING) : '') + this.fill(this.pick(truth.tpl.opening), truth));
    // Panische Anrufer nennen den Ort nicht von selbst
    if (!truth.fake && !panisch && this.rng() < 0.7) {
      this.after(4000, () => {
        if (call.state !== 'active' || truth.whereSaid) return;
        truth.whereSaid = true;
        this.callerSays(call, truth.spokenWhere, 1500);
      });
    }
  }

  private callerSays(call: CallState, text: string, delay = 1800) {
    call.typing = true;
    this.after(delay, () => {
      if (call.state !== 'active') return;
      call.typing = false;
      call.transcript.push({ from: 'caller', text, t: this.time });
    });
  }

  private ask(player: Player, callId: string, question: QuestionId | 'frei', freeText?: string): string | void {
    const call = this.calls.find((c) => c.id === callId);
    if (!call || call.state !== 'active') return 'Kein aktives Gespräch';
    if (call.takerId !== player.id) return 'Das Gespräch führt ein anderer Calltaker';
    if (call.kind !== '112') return;
    if (call.toKvb) return 'Der Anruf wird gerade an die KVB weiterverbunden';
    const truth = this.callTruth.get(call.id)!;
    const q: QuestionId | null = question === 'frei' ? null : question;
    const said = freeText ? freeText.slice(0, 300) : q ? questionText(q) : '';
    call.transcript.push({ from: 'calltaker', text: said, t: this.time });
    const qs: QuestionId[] = freeText ? classifyAll(freeText) : q ? [q] : [];
    // Panik: Erst Beruhigen hilft, vorher kommen kaum brauchbare Antworten
    if ((truth.panik ?? 0) > 0) {
      if (qs.includes('beruhigen')) {
        if (!call.asked.includes('beruhigen')) call.asked.push('beruhigen');
        truth.panik!--;
        if (truth.panik) {
          this.callerSays(call, this.pick(PANIK_BERUHIGT_HALB));
          return;
        }
        this.addScore(5, 'Panischen Anrufer beruhigt');
        const rest = qs.filter((x) => x !== 'beruhigen');
        if (!rest.length) {
          this.callerSays(call, this.pick(PANIK_BERUHIGT));
          return;
        }
        qs.splice(0, qs.length, ...rest);
      } else if (!qs.includes('verabschieden') && (!qs.length || this.rng() < 0.65)) {
        this.callerSays(call, this.pick(PANIK), this.rand(800, 1600));
        return;
      }
    }
    if (!qs.length) {
      const pool = freeText && isYesNoQuestion(freeText) ? YES_NO : NOT_UNDERSTOOD;
      this.callerSays(call, this.pick(pool));
      return;
    }
    const parts: string[] = [];
    for (const qq of qs) {
      const repeated = call.asked.includes(qq) && qq !== 'wo' && qq !== 'tcpr' && qq !== 'beruhigen';
      if (!call.asked.includes(qq)) call.asked.push(qq);
      if (qq === 'tcpr' && truth.tpl.tcpr && !truth.tcprGiven) {
        truth.tcprGiven = true;
        this.addScore(15, 'Telefonreanimation angeleitet');
      }
      // Rückbestätigung, obwohl der Anrufer noch gar keinen Ort genannt hat: dann nennt er ihn jetzt
      const unbestaetigt = qq === 'ortbestaetigen' && !truth.fake && !truth.whereSaid && !truth.tpl.answers.ortbestaetigen;
      if ((qq === 'wo' || unbestaetigt) && !truth.fake) truth.whereSaid = true;
      const pool = unbestaetigt
        ? ADDRESS_NOT_YET_SAID
        : truth.tpl.answers[qq] ??
          (truth.fake && truth.tpl.answers.was ? truth.tpl.answers.was : fallbackAnswers(qq, truth.tpl, truth.facts?.role ?? 'angehoerig'));
      const erneut = this.erneut.get(call.id)?.art;
      const schlechter = typeof erneut === 'number' && ['zustand', 'bewusstsein', 'atmung'].includes(qq) ? ERNEUT_VERSCHLECHTERUNG[erneut].zustand : undefined;
      let text = this.fill(schlechter ?? this.pick(pool), truth, call.phone);
      if ((truth.panik ?? 0) > 0) text = this.pick(PANIK_PREFIX) + text;
      if (repeated && this.rng() < 0.6) text = `${this.pick(['Das hab ich doch schon gesagt!', 'Wie gesagt:', 'Nochmal:'])} ${text}`;
      parts.push(text);
    }
    const delay = this.rand(1200, 2600);
    this.callerSays(call, parts.join(' '), delay);
    // "Ich schicke Ihnen jemand": Der Anrufer bedankt sich und legt auf
    if (qs.includes('verabschieden'))
      this.after(delay + 1500, () => {
        if (call.state === 'active') this.finishCall(call);
      });
  }

  private endCall(player: Player, callId: string): string | void {
    const call = this.calls.find((c) => c.id === callId);
    if (!call || call.state !== 'active') return 'Kein aktives Gespräch';
    if (call.takerId !== player.id) return 'Das Gespräch führt ein anderer Calltaker';
    this.finishCall(call);
  }

  /** Gespräch beenden und bewerten, ob zum Notruf ein Einsatz angelegt wurde */
  private finishCall(call: CallState) {
    call.state = 'ended';
    call.endedAt = this.time;
    call.typing = false;
    if (call.kind === 'rtw') {
      // Ohne Zielklinik aufgelegt: Die Besatzung fragt dann über Funk nach
      const u = this.unit(call.rtw!.unitId);
      if (u && u.task === 'awaitHospital' && !u.hospitalId)
        this.after(30_000, () => {
          if (u.task === 'awaitHospital' && !u.hospitalId) this.requestSpeak(u, 'zielklinik', this.zielklinikText(u, this.patientOf(u)?.pzc ?? ''));
        });
      return;
    }
    // Weitervermittlung an die KVB läuft noch: ist bereits bewertet
    if (call.toKvb) return;
    const truth = this.callTruth.get(call.id)!;
    // Absage oder Verschiebung einer Terminfahrt: gewertet wird, ob der Disponent sie umsetzt
    if (truth.bezug) return;
    if (!call.incidentId) {
      const lage = truth.main ?? truth;
      if (truth.main || this.calls.some((c) => c !== call && this.callTruth.get(c.id)?.main === truth)) {
        // Mehrfachmeldung zu einer Großschadenslage: ein Einsatz genügt
        if (lage.incidentId) this.addScore(5, 'Weitere Meldung zur bekannten Lage, kein doppelter Einsatz');
        else this.addScore(-10, 'Lage gemeldet, aber noch kein Einsatz angelegt');
      } else if (truth.fake) this.addScore(10, 'Fehlanruf korrekt ohne Einsatz beendet');
      else if (truth.tpl.kvb) this.addScore(-10, 'Anrufer nicht an den ärztlichen Bereitschaftsdienst (116117) vermittelt');
      else this.addScore(-25, 'Notruf beendet, ohne einen Einsatz anzulegen');
    }
  }

  private createIncident(player: Player, a: Extract<Action, { a: 'createIncident' }>): string | void {
    const sw = this.scn.stichworte.find((s) => s.code === a.stichwort);
    if (!sw) return 'Unbekanntes Stichwort';
    if (!isFinite(a.x) || !isFinite(a.y)) return 'Kein Einsatzort gewählt';
    if (a.termin !== undefined && (!isFinite(a.termin) || a.termin < this.time - TERMIN_VORLAUF_MS || a.termin > this.time + 24 * 3600_000))
      return 'Ungültige Abholzeit';
    let truth: Truth | undefined;
    let call: CallState | undefined;
    if (a.callId) {
      call = this.calls.find((c) => c.id === a.callId);
      if (!call) return 'Anruf nicht gefunden';
      if (call.incidentId) return 'Zu diesem Anruf gibt es bereits einen Einsatz';
      if (call.kind === 'rtw') return 'Patientenanmeldung: Zielklinik über IVENA zuweisen';
      if (call.toKvb) return 'Der Anruf wurde an die KVB weiterverbunden';
      truth = this.callTruth.get(call.id);
    }
    const inc: IncidentState = {
      id: `i${++this.seq.inc}`,
      nr: `E-${String(this.seq.inc).padStart(6, '0')}`,
      stichwort: sw.code,
      label: sw.label,
      schlagwort: findSchlagwort(a.schlagwort)?.code === sw.code ? a.schlagwort : undefined,
      address: a.address.slice(0, 160),
      x: a.x,
      y: a.y,
      note: a.note.slice(0, 1000),
      patients: Math.max(0, Math.min(50, a.patients | 0)),
      createdAt: this.time,
      createdBy: player.name,
      callId: call?.id,
      status: 'offen',
      unitIds: [],
      log: [],
      zusatz: a.zusatz?.slice(0, 120) || undefined,
      objekt: a.objekt?.slice(0, 120) || undefined,
      melder: a.melder?.slice(0, 80) || undefined,
      rueckruf: (a.rueckruf ?? call?.phone)?.slice(0, 40) || undefined,
      patient: a.patient?.slice(0, 120) || undefined,
      sondersignal: a.sondersignal ?? true,
      termin: a.termin,
    };
    this.log(inc, `Einsatz angelegt von ${player.name}: ${inc.schlagwort ?? `${sw.code} ${sw.label}`}`);
    if (inc.termin !== undefined) this.log(inc, `Terminfahrt: Abholung ${this.uhrzeit(inc.termin)} Uhr`);
    this.incidents.push(inc);
    this.score.incidentsCreated++;
    if (call) call.incidentId = inc.id;
    // Weiterer Anrufer zu einer Großschadenslage: gehört zur ursprünglichen Lage
    if (truth?.main) truth = truth.main;
    const offen = truth?.incidentId ? this.incident(truth.incidentId) : undefined;
    if (truth && offen && offen.status !== 'abgeschlossen') {
      this.addScore(-10, `${inc.nr}: Lage ist bereits als ${offen.nr} angelegt (doppelter Einsatz)`);
      this.incTruth.set(inc.id, this.genericTruth(inc, `Einsatzstelle identisch mit ${offen.nr}, Kräfte dort bereits tätig.`));
    } else if (truth) {
      truth.incidentId = inc.id;
      if (truth.fake) {
        this.addScore(-15, `${inc.nr}: Einsatz zu einem Fehlanruf angelegt`);
        truth = this.genericTruth(inc, 'An der Einsatzstelle nichts feststellbar, vermutlich Fehlanruf.');
      } else if (truth.tpl.kvb) {
        this.addScore(-5, `${inc.nr}: Fall für den ärztlichen Bereitschaftsdienst (116117), Rettungsdienst wäre nicht nötig gewesen`);
      } else {
        // Wertung Stichwort
        const trueSw = this.scn.stichworte.find((s) => s.code === truth!.stichwort);
        if (truth.stichwort === sw.code || (truth.tpl as LageTemplate).auchRichtig?.includes(sw.code)) {
          this.score.stichwortCorrect++;
          this.addScore(20, `${inc.nr}: Stichwort ${sw.code} korrekt`);
        } else if (trueSw && trueSw.category === sw.category) {
          this.addScore(5, `${inc.nr}: Stichwort ${sw.code} vertretbar (besser ${trueSw.code})`);
        } else {
          this.addScore(-10, `${inc.nr}: Stichwort ${sw.code} falsch (richtig wäre ${truth.stichwort})`);
        }
        // Passendes Schlagwort
        const trueSlw = schlagwortByNr(truth.tpl.schlagwort, truth.stichwort);
        const slw = findSchlagwort(inc.schlagwort);
        if (trueSlw && slw?.nr === trueSlw.nr && slw.code === trueSlw.code) this.addScore(5, `${inc.nr}: Schlagwort ${trueSlw.nr} passend`);
        else if (trueSlw && slw && slw.kat === trueSlw.kat && slw.code === truth.stichwort) this.addScore(2, `${inc.nr}: Kategorie ${slw.kat} passend (besser ${trueSlw.nr})`);
        // Wertung Einsatzort
        const d = dist(truth.pos, inc);
        const tolerance = truth.tpl.where === 'ausserorts' || truth.tpl.where === 'autobahn' ? 1200 : 200;
        if (d <= tolerance) {
          this.score.addressCorrect++;
          this.addScore(10, `${inc.nr}: Einsatzort korrekt erfasst`);
        } else {
          this.addScore(-10, `${inc.nr}: Einsatzort ${Math.round(d)} m daneben`);
        }
        // Wertung Abholzeit
        if (truth.termin !== undefined) {
          if (inc.termin === undefined) this.addScore(-10, `${inc.nr}: Bestellte Abholzeit ${this.uhrzeit(truth.termin)} Uhr nicht als Termin erfasst`);
          else if (Math.abs(inc.termin - truth.termin) <= 5 * 60_000) this.addScore(10, `${inc.nr}: Abholzeit korrekt erfasst`);
          else this.addScore(-5, `${inc.nr}: Abholzeit ${this.uhrzeit(inc.termin)} Uhr statt ${this.uhrzeit(truth.termin)} Uhr`);
        } else if (inc.termin !== undefined && !truth.stichwort.startsWith('RD KTP')) {
          this.addScore(-15, `${inc.nr}: Notfall als Terminfahrt angelegt`);
        }
      }
      this.incTruth.set(inc.id, truth);
      if (truth.erneut && call && !truth.generic) {
        const t = truth;
        const c = call;
        this.after(this.rand(3, 7) * 60_000, () => this.erneutAnrufen(inc, t, c));
      }
    } else {
      this.incTruth.set(inc.id, this.genericTruth(inc, 'Keine besondere Lage, Einsatzstelle erkundet.'));
    }
    // Die Polizei hat selbst angerufen und ist schon an der Einsatzstelle
    const lageTruth = this.incTruth.get(inc.id);
    if (lageTruth?.tpl.polizeiVorOrt && !lageTruth.generic) {
      inc.polizei = 'vor Ort';
      this.log(inc, `Polizei bereits vor Ort (Streife ${lageTruth.streife})`);
    } else if (a.polizei) this.requestPolice(player, inc.id);
    // Manche Terminfahrten werden später abgesagt oder verschoben, auch wenn der KTW schon unterwegs ist
    const t = this.incTruth.get(inc.id);
    if (t?.termin !== undefined && !t.generic && this.rng() < TERMIN_AENDERUNG_ANTEIL) {
      const bis = Math.max(6 * 60_000, t.termin - this.time);
      this.after(this.rand(5 * 60_000, bis), () => this.terminAenderung(inc.id));
    }
    if (a.alarmUnitIds?.length) this.alarm(player, inc.id, a.alarmUnitIds);
    else if (a.alarmAao) this.alarm(player, inc.id, this.proposal(inc.id).map((p) => p.unitId));
  }

  private genericTruth(inc: IncidentState, lage: string): Truth {
    return {
      tpl: BMA_TEMPLATE,
      stichwort: inc.stichwort,
      pos: { x: inc.x, y: inc.y },
      address: inc.address,
      spokenWhere: '',
      needs: {},
      patients: [],
      lage,
      workMs: 6 * 60_000,
      name: '',
      alter: 0,
      fake: false,
      callStart: inc.createdAt,
      generic: true,
    };
  }

  /** Alarmierungsvorschlag nach AAO: nächstgelegene freie Fahrzeuge */
  proposal(incidentId: string): ProposalEntry[] {
    const inc = this.incident(incidentId);
    if (!inc) return [];
    const sw = this.scn.stichworte.find((s) => s.code === inc.stichwort);
    if (!sw || inc.firstArrival) return [];
    return computeProposal(this.scn, this.graph, this.units, inc, aaoMitSchlagwort(sw.aao, inc.schlagwort), this.time);
  }

  private alarm(player: { name: string }, incidentId: string, unitIds: string[]): string | void {
    const inc = this.incident(incidentId);
    if (!inc) return 'Einsatz nicht gefunden';
    if (inc.status === 'abgeschlossen') return 'Einsatz ist abgeschlossen';
    const alarmed: string[] = [];
    for (const id of unitIds) {
      const u = this.unit(id);
      if (!u) continue;
      if (u.incidentId === inc.id) continue;
      // Status 8: Die Besatzung schließt die Übergabe ab und fährt dann von der Klinik los
      const s8 = inUebergabe(u);
      const rest = s8 ? uebergabeRest(u, this.time) : 0;
      const klinik = s8 ? this.scn.hospitals.find((h) => h.id === u.hospitalId)?.name : undefined;
      if (s8) this.uebergabeBeenden(u, inc);
      if (u.incidentId && u.incidentId !== inc.id) continue;
      if (u.fremd) continue;
      if (![1, 2].includes(u.baseStatus) && !s8) continue;
      // Eine noch offene Frei- oder Standortmeldung ist mit der Alarmierung überholt
      if (u.speak && !u.speak.answered && u.speak.kind === 'info') {
        u.speak = undefined;
        u.status = u.baseStatus;
      }
      u.incidentId = inc.id;
      u.cover = undefined;
      u.task = 'alarmed';
      u.hint = `Alarm: ${inc.schlagwort ?? `${inc.stichwort} ${inc.label}`} – ${inc.address}${inc.note ? ' – ' + inc.note : ''}`;
      const career = this.station(u).career || this.typeOf(u)?.org === 'RD';
      const atStation = u.status === 2 || u.baseStatus === 2;
      const air = this.typeOf(u)?.air;
      u.timer = u.crewPlayerId
        ? undefined
        : s8
          ? this.time + rest * 1000
          : this.time + (atStation ? (air ? this.rand(AIR_TURNOUT - 30, AIR_TURNOUT + 30) : career ? this.rand(40, 90) : this.rand(180, 330)) : this.rand(5, 12)) * 1000;
      inc.unitIds.push(u.id);
      alarmed.push(shortCallsign(u.callsign));
      this.radioMsg(this.scn.ilsName, u.callsign, `Alarmierung: ${inc.schlagwort ?? inc.stichwort} – ${inc.address}${inc.sondersignal === false ? ' – ohne Sondersignal' : ''}${inc.tmo ? ` – Einsatzgruppe ${this.tmoName(inc.tmo)}` : ''}`, 'system');
      if (inc.tmo) u.tmo = inc.tmo;
      // Aus Status 8 meldet die Besatzung, wann sie nach der Übergabe losfahren kann
      if (s8 && !u.crewPlayerId) this.after(this.rand(3000, 6000), () => this.s8Rueckmeldung(u, inc, rest, klinik));
    }
    if (!alarmed.length) return 'Keine verfügbaren Fahrzeuge ausgewählt';
    this.log(inc, `Alarmiert (${player.name}): ${alarmed.join(', ')}`);
    if (!inc.alarmedAt) {
      inc.alarmedAt = this.time;
      const call = inc.callId ? this.calls.find((c) => c.id === inc.callId) : undefined;
      const ref = call?.answeredAt ?? inc.createdAt;
      const sec = (this.time - ref) / 1000;
      if (sec < 90) this.addScore(10, `${inc.nr}: schnelle Alarmierung (${Math.round(sec)} s)`);
      else if (sec < 180) this.addScore(5, `${inc.nr}: Alarmierung nach ${Math.round(sec)} s`);
    }
    if (inc.status === 'offen') inc.status = 'alarmiert';
  }

  /**
   * Gebietsabsicherung: freie Fahrzeuge an eine andere Wache oder einen Bereitstellungsort verlegen.
   * Die Besatzung rückt mit Status 3 aus, fährt mit Status 1 ohne Sondersignal hin und bleibt dort auf Status 1,
   * bis sie mit H (Fahren Sie Wache an) zurückgeschickt oder zu einem Einsatz alarmiert wird.
   */
  private cover(player: Player, a: Extract<Action, { a: 'cover' }>): string | void {
    let target: NonNullable<UnitState['cover']>;
    if (a.stationId) {
      const st = this.scn.stations.find((s) => s.id === a.stationId);
      if (!st) return 'Wache nicht gefunden';
      target = { name: st.name, x: st.x, y: st.y, stationId: st.id };
    } else if (a.raumId) {
      const br = this.scn.bereitstellungsraeume?.find((r) => r.id === a.raumId);
      if (!br) return 'Bereitstellungsraum nicht gefunden';
      target = { name: br.name, x: br.x, y: br.y, raumId: br.id };
    } else if (a.x !== undefined && a.y !== undefined && isFinite(a.x) && isFinite(a.y)) {
      const hit = reverseGeocode(this.scn, { x: a.x, y: a.y });
      const name = a.name?.trim().slice(0, 80) || (hit && hit.distance < 300 ? `${hit.street}${hit.town && !hit.street.includes(hit.town) ? `, ${hit.town}` : ''}` : `bei ${nearestTown(this.scn.towns, { x: a.x, y: a.y })?.name ?? 'Kartenpunkt'}`);
      target = { name, x: a.x, y: a.y };
    } else return 'Kein Absicherungsstandort angegeben';
    const sent: string[] = [];
    let reason = '';
    for (const id of a.unitIds) {
      const u = this.unit(id);
      if (!u) continue;
      if (u.incidentId || u.hasPatient) {
        reason = `${shortCallsign(u.callsign)} ist im Einsatz`;
        continue;
      }
      if (u.fremd) {
        reason = `${u.callsign} gehört zur ${u.fremd.ils}`;
        continue;
      }
      if (![1, 2].includes(u.baseStatus)) {
        reason = `${shortCallsign(u.callsign)} ist nicht einsatzbereit`;
        continue;
      }
      if (target.stationId === u.stationId) {
        reason = `${shortCallsign(u.callsign)} gehört zu dieser Wache, dafür H – Fahren Sie Wache an`;
        continue;
      }
      const atStation = u.task === 'station' || (u.task === 'alarmed' && u.status === 2);
      const career = this.station(u).career || this.typeOf(u)?.org === 'RD';
      u.cover = { ...target, since: this.time };
      u.task = 'alarmed';
      u.hint = `Gebietsabsicherung: Fahren Sie ${target.name} an. Beim Ausrücken Status 3, dann Status 1 bis zum Standort und dort auf Status 1 bleiben.`;
      u.timer = u.crewPlayerId ? undefined : this.time + (atStation ? (career ? this.rand(60, 120) : this.rand(180, 330)) : this.rand(5, 12)) * 1000;
      sent.push(shortCallsign(u.callsign));
      this.radioMsg(this.scn.ilsName, u.callsign, `Alarmierung: Gebietsabsicherung – Verlegung nach ${target.name} – ohne Sondersignal`, 'system');
    }
    if (!sent.length) return reason || 'Keine verfügbaren Fahrzeuge ausgewählt';
    this.events.toast?.(player.id, `Gebietsabsicherung ${target.name}: ${sent.join(', ')}`, 'info');
  }

  // ---------- ESWL: Rettungsmittel von Nachbarleitstellen ----------

  /**
   * Anforderung eines Rettungsmittels nach Typ bei einer Nachbar-ILS. Die Nachbarleitstelle antwortet nach
   * einer Weile: Sie lehnt ab, wenn kein passendes Fahrzeug im Dienst und frei ist oder ihre eigene Lage es
   * nicht zulässt (Ablehnungsquote), sonst entsendet sie das nächstgelegene Fahrzeug des Typs.
   */
  private eswl(player: Player, a: Extract<Action, { a: 'eswl' }>): string | void {
    const inc = this.incident(a.incidentId);
    if (!inc) return 'Einsatz nicht gefunden';
    if (inc.status === 'abgeschlossen') return 'Einsatz ist abgeschlossen';
    const nb = (this.scn.nachbarn ?? []).find((n) => n.id === a.nachbarId);
    if (!nb) return 'Nachbarleitstelle nicht gefunden';
    const label = this.types.get(a.type)?.label ?? a.type;
    if (!nb.fahrzeuge.some((f) => f.type === a.type)) return `${nb.name} hat kein ${label}`;
    const req: NonNullable<IncidentState['eswl']>[number] = {
      id: `eswl${++this.seq.radio}`,
      nachbarId: nb.id,
      ils: nb.name,
      type: a.type,
      t: this.time,
      status: 'angefragt',
    };
    (inc.eswl ??= []).push(req);
    this.log(inc, `ESWL: ${label} bei ${nb.name} angefordert (${player.name})`);
    this.after(this.rand(30, 90) * 1000, () => this.eswlAntwort(inc, nb, req));
  }

  private eswlAntwort(inc: IncidentState, nb: NachbarLeitstelle, req: NonNullable<IncidentState['eswl']>[number]) {
    const label = this.types.get(req.type)?.label ?? req.type;
    if (inc.status === 'abgeschlossen') {
      req.status = 'abgelehnt';
      req.text = 'Einsatz bereits beendet';
      return;
    }
    const minute = this.gameMinute();
    const frei = nb.fahrzeuge.filter(
      (f) => f.type === req.type && !this.units.some((u) => u.id === this.fremdId(nb, f)) && inDienst(f.dienst, this.startDate, minute),
    );
    const ablehnen = !frei.length || this.rng() < Math.max(0, Math.min(1, nb.ablehnung ?? 0));
    if (ablehnen) {
      req.status = 'abgelehnt';
      req.text = this.pick([`kein ${label} verfügbar`, `alle ${label} im Einsatz`, `kein ${label} frei, bitte anderweitig disponieren`]);
      this.log(inc, `ESWL: ${nb.name} lehnt ab – ${req.text}`);
      return;
    }
    const f = frei.reduce((best, x) => (dist(x, inc) < dist(best, inc) ? x : best));
    const u = this.fremdUnit(nb, f);
    const air = this.typeOf(u)?.air;
    const turnout = air ? this.rand(AIR_TURNOUT - 30, AIR_TURNOUT + 30) : this.rand(60, 120);
    u.incidentId = inc.id;
    u.task = 'alarmed';
    u.timer = u.crewPlayerId ? undefined : this.time + turnout * 1000;
    u.hint = `ESWL-Einsatz für die ${this.scn.ilsName}: ${inc.schlagwort ?? `${inc.stichwort} ${inc.label}`} – ${inc.address}. Beim Einfahren in den Bereich in der Rufgruppe der ${this.scn.ilsName} anmelden.`;
    this.units.push(u);
    inc.unitIds.push(u.id);
    // grobe Anfahrt: Luftlinie, am Boden mit Umwegfaktor und etwa 80 km/h
    const min = Math.max(1, Math.round((turnout + (air ? dist(f, inc) / AIR_SPEED : (dist(f, inc) * 1.3) / 22)) / 60));
    req.status = 'zugesagt';
    req.callsign = u.callsign;
    req.text = `Anfahrt ca. ${min} min`;
    this.log(inc, `ESWL: ${nb.name} entsendet ${u.callsign} (${label}) von ${f.wache}, Anfahrt ca. ${min} min`);
    if (!inc.alarmedAt) inc.alarmedAt = this.time;
    if (inc.status === 'offen') inc.status = 'alarmiert';
  }

  private fremdId(nb: NachbarLeitstelle, f: NachbarFahrzeug) {
    return `nb_${nb.id}_${f.id}`;
  }

  private fremdUnit(nb: NachbarLeitstelle, f: NachbarFahrzeug): UnitState {
    const stationId = `nbst_${nb.id}_${f.id}`;
    this.fremdStations.set(stationId, { id: stationId, name: f.wache, kind: 'rettungswache', career: true, x: f.x, y: f.y, vehicles: [] });
    return {
      id: this.fremdId(nb, f),
      callsign: f.callsign,
      type: f.type,
      stationId,
      status: 2,
      baseStatus: 2,
      task: 'station',
      x: f.x,
      y: f.y,
      heading: 0,
      routeIdx: 0,
      fremd: { nachbarId: nb.id, ils: nb.name, wache: f.wache, imBereich: this.imBereich(f, false) },
    };
  }

  /**
   * Liegt ein Punkt im eigenen Leitstellenbereich? Eigener Bereich ist, was auf der Karte liegt und näher an
   * einer eigenen Wache ist als an einem Standort der Nachbarn. Der Rand von 500 m verhindert ständiges
   * An- und Abmelden auf der Grenze.
   */
  private imBereich(p: Vec, bisher: boolean): boolean {
    if (p.x < 0 || p.y < 0 || p.x > this.scn.width || p.y > this.scn.height) return false;
    let own = Infinity;
    for (const s of this.scn.stations) own = Math.min(own, dist(s, p));
    let fremd = Infinity;
    for (const b of this.nachbarBasen) fremd = Math.min(fremd, dist(b, p));
    return bisher ? own < fremd + 500 : own < fremd - 500;
  }

  /** RD-Rufgruppe, in der sich ein Fremdfahrzeug an einer Stelle anmeldet */
  private eswlGruppe(u: UnitState): string | undefined {
    const nb = (this.scn.nachbarn ?? []).find((n) => n.id === u.fremd?.nachbarId);
    const groups = this.scn.tmoGroups ?? [];
    if (nb?.tmo && groups.some((g) => g.id === nb.tmo)) return nb.tmo;
    let best: Station | undefined;
    for (const s of this.scn.stations) if (s.kind === 'rettungswache' && s.tmo && (!best || dist(s, u) < dist(best, u))) best = s;
    return best?.tmo ?? groups.find((g) => g.use === 'RD')?.id;
  }

  /** Fremdfahrzeug fährt in den eigenen Bereich ein oder verlässt ihn: Meldung in der RD-Rufgruppe */
  private checkBereich(u: UnitState) {
    const f = u.fremd!;
    const drin = this.imBereich(u, f.imBereich);
    if (drin === f.imBereich) return;
    f.imBereich = drin;
    const air = this.typeOf(u)?.air;
    const inc = u.incidentId ? this.incident(u.incidentId) : undefined;
    if (drin) {
      const group = this.eswlGruppe(u);
      u.tmo = group;
      const st = this.fremdStations.get(u.stationId);
      if (st) st.tmo = group;
      if (u.crewPlayerId) {
        u.hint = `Im Bereich der ${this.scn.ilsName}: in Rufgruppe ${this.tmoName(group)} anmelden.`;
        return;
      }
      const ziel = inc ? `zum Einsatz ${inc.address}` : u.hasPatient ? 'mit Patient' : 'auf der Durchfahrt';
      this.requestSpeak(u, 'info', `${air ? 'Fliegen' : 'Fahren'} in Ihren Bereich ein, ${ziel}, Status ${u.baseStatus}.`, group);
      return;
    }
    const group = u.tmo;
    u.tmo = undefined;
    if (u.crewPlayerId) {
      u.hint = `Bereich der ${this.scn.ilsName} verlassen: abmelden und zurück zur ${f.ils}.`;
      return;
    }
    this.requestSpeak(u, 'info', `Verlassen Ihren Bereich, melden uns ab zur ${f.ils}.`, group);
  }

  /** FMS-Auftrag H: Fahren Sie Wache an. Beendet auch eine Gebietsabsicherung. */
  private sendHome(unitId: string): string | void {
    const u = this.unit(unitId);
    if (!u) return 'Fahrzeug nicht gefunden';
    if (u.hasPatient) return `${shortCallsign(u.callsign)} hat einen Patienten an Bord`;
    if (u.task === 'station' && !u.incidentId) return `${shortCallsign(u.callsign)} ist bereits auf der Wache`;
    if (u.task === 'returning') return `${shortCallsign(u.callsign)} fährt bereits zur Wache`;
    this.radioMsg(this.scn.ilsName, u.callsign, 'H – Fahren Sie Wache an', 'fms');
    u.cover = undefined;
    const err = this.releaseUnit(u.id, true);
    if (err) return err;
    const returning = (u.task as UnitState['task']) === 'returning';
    if (u.crewPlayerId && returning) u.hint = 'H – Fahren Sie Wache an. Auf der Wache Status 2.';
    if (!u.crewPlayerId && returning && this.rng() < 0.5) this.after(this.rand(2500, 5000), () => this.radioMsg(u.callsign, this.scn.ilsName, 'Verstanden, rücken ein.', 'voice'));
  }

  private releaseUnit(unitId: string, byDispatcher: boolean, freimelden = true): string | void {
    const u = this.unit(unitId);
    if (!u) return 'Fahrzeug nicht gefunden';
    if (u.hasPatient) return 'Fahrzeug hat einen Patienten an Bord';
    const frei = freimelden && !u.crewPlayerId && ['onScene', 'awaitHospital', 'atHospital', 'toHospital'].includes(u.task) ? this.freimeldung(u) : undefined;
    const inc = u.incidentId ? this.incident(u.incidentId) : undefined;
    if (inc) {
      inc.unitIds = inc.unitIds.filter((id) => id !== u.id);
      if (byDispatcher) this.log(inc, `${shortCallsign(u.callsign)} aus dem Einsatz genommen`);
      const truth = this.incTruth.get(inc.id);
      truth?.patients.forEach((p) => {
        if (p.unitId === u.id && !p.done) p.unitId = undefined;
      });
    }
    u.incidentId = undefined;
    u.hospitalId = undefined;
    u.begleitet = undefined;
    u.speak = undefined;
    u.hint = undefined;
    if (inc?.tmo && u.tmo === inc.tmo) u.tmo = this.station(u).tmo;
    if (u.task === 'alarmed' && u.status === 2) {
      u.task = 'station';
      u.baseStatus = 2;
      u.status = 2;
      u.timer = undefined;
      return;
    }
    this.returnToStation(u);
    if (frei) this.requestSpeak(u, 'info', frei);
    if (inc) this.checkClose(inc);
  }

  /** Text der Freimeldung, die eine Computer-Besatzung beim Wechsel auf Status 1 nach Sprechwunsch durchgibt */
  private freimeldung(u: UnitState) {
    const hosp = u.task === 'atHospital' ? this.scn.hospitals.find((h) => h.id === u.hospitalId) : undefined;
    const ort = hosp ? `am ${hosp.name}` : 'an der Einsatzstelle';
    return this.pick([`Frei ${ort}, rücken ein.`, `Sind ${ort} wieder frei, Status 1.`]);
  }

  /** Ende der laufenden Schicht als Uhrzeit, z. B. "19:00" */
  private dienstende(u: UnitState, minute: number): string | undefined {
    const plan = this.dienst.get(u.id);
    if (!plan) return undefined;
    for (let m = minute + 1; m <= minute + 1440; m++) {
      if (!inDienst(plan, this.startDate, m)) {
        const t = m % 1440;
        return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
      }
    }
    return undefined;
  }

  /** Antwort einer computergesteuerten Besatzung auf einen Funkspruch der Leitstelle */
  radioReply(u: UnitState, raw: string, von: { name: string } = { name: 'Funk' }): string | null {
    const f = zerlegeFunkspruch(raw, u.callsign, this.scn.ilsName);
    const t = f.text;
    const has = (re: RegExp) => re.test(t);
    const frage = istFrage(f);
    const inc = u.incidentId ? this.incident(u.incidentId) : undefined;
    const truth = inc ? this.incTruth.get(inc.id) : undefined;
    const town = nearestTown(this.scn.towns, u)?.name ?? '';
    const station = this.station(u);
    const etaMin = u.eta ? Math.max(1, Math.round((u.eta - this.time) / 60000)) : undefined;
    const hosp = u.hospitalId ? this.scn.hospitals.find((h) => h.id === u.hospitalId) : undefined;
    const vorOrt = u.task === 'onScene' || u.task === 'awaitHospital';
    const unterwegs = u.task === 'toScene' || u.task === 'toHospital';
    const sprechwunsch = !!u.speak && !u.speak.answered && u.speak.kind !== 'crew';
    const where = (() => {
      switch (u.task) {
        case 'station':
          return `auf der Wache ${station.name.replace(/^(FF|BRK|Rettungswache)\s*/, '')}`;
        case 'onScene':
        case 'awaitHospital':
          return `an der Einsatzstelle${inc ? ` ${inc.address}` : ''}`;
        case 'atHospital':
          return `am ${hosp?.name ?? 'Krankenhaus'}`;
        case 'covering':
          return `zur Gebietsabsicherung ${u.cover ? `am Standort ${u.cover.name}` : 'am Standort'}`;
        default: {
          const hit = reverseGeocode(this.scn, u);
          return hit && hit.distance < 250 ? `${hit.street}${hit.town && !hit.street.includes(hit.town) ? ` in ${hit.town}` : ''}` : `bei ${town}`;
        }
      }
    })();

    // Nur Anruf ("Rotkreuz Arnstein 71/1 von Leitstelle, kommen") oder Sprechaufforderung
    const anruf = !t || /^(?:(?:bitte|jetzt|ja|leitstelle hört|hört|ich höre|wir hören|melden sie sich|meldet euch|sprechen sie|sprecht|sprechaufforderung|ihr sprechwunsch|euer sprechwunsch|sprechwunsch|status 5|status 0|was gibt es|was gibts|was liegt an|was haben sie|was habt ihr|für sie|für euch|mit ihnen|ihre meldung|eure meldung)\s*)+$/.test(t);
    if (anruf && !(f.ende && !t)) {
      if (sprechwunsch) {
        this.speakPermit(u.id, true);
        return null;
      }
      if (/sprech|meldung|was gibt|was liegt|was habt|was haben/.test(t)) return this.pick(['Kein Sprechwunsch, war ein Versehen.', 'Nichts weiter, Status versehentlich gedrückt.']);
      return this.pick([`${u.callsign} hört.`, `Hier ${u.callsign}.`, `${u.callsign}, hört.`]);
    }
    // Ende, Dank oder Quittung: keine Antwort nötig
    if (!t || istQuittung(t)) return null;
    if (has(/\b(?:wiederhol\w*|nicht verstanden|schlecht verstanden|unverständlich|noch ?mal(?! status))\b/) && !has(/\bich wiederhole\b/)) {
      const last = [...this.radio].reverse().find((m) => m.from === u.callsign && m.kind === 'voice');
      if (u.speak?.text && !u.speak.answered) return `Ich wiederhole: ${u.speak.text}`;
      return last ? `Ich wiederhole: ${last.text}` : 'Nichts weiter von uns.';
    }

    // Gruppenwechsel: "wechseln Sie in Rufgruppe 3713"
    if (has(/\b(?:rufgruppe|gruppe|tmo|wechseln|wechselt|gehen sie (?:in|auf)|geht (?:in|auf)|kanal)\b/)) {
      const g = findeRufgruppe(t, this.scn.tmoGroups ?? []);
      if (g) {
        if (u.tmo === g.id) return `Wir sind bereits in ${g.name}.`;
        u.tmo = g.id;
        return `In ${g.name}.`;
      }
      if (has(/\brufgruppe\b/)) return 'Welche Rufgruppe, bitte wiederholen.';
    }

    // Alarmieren oder Umdisponieren per Sprechfunk: "Übernehmen Sie den Einsatz Hauptstraße"
    if (!frage && has(/(?:^|\s)(?:übernehmen sie|übernehmt|übernimm|alarmier\w*|umdisponier\w*|(?:fahren|fahrt|begeben) (?:sie |ihr )?(?:\w+ )*(?:zum|zu dem|zur|in den) einsatz|neue[nr]? einsatz|einsatz für (?:sie|euch)|zu einem anderen einsatz|stattdessen|statt dessen)\b/)) {
      const r = this.funkAlarm(u, t, von);
      if (r) return r;
    }

    // Ist der Notarzt abkömmlich? An das NEF selbst oder an das RTW, in dem er mitfährt
    const naWort = has(/\b(?:notarzt\w*|notärzt\w*|na|nef|doc|doktor|arzt|ärztin)\b/);
    const abkoemmlich = has(/\b(?:abkömmlich|abkommen|entbehrlich|frei ?machen|freimachen|lösen|loseisen|freigeben|wieder frei|wieder einsatzbereit|wieder verfügbar|folgeeinsatz|zweiteinsatz|paralleleinsatz|anderen einsatz|neuen einsatz|weiteren einsatz|wann (?:\w+ )*frei)\b/);
    if ((abkoemmlich && (naWort || this.istNotarzt(u))) || (this.istNotarzt(u) && frage && has(/\b(?:frei|verfügbar|einsatzbereit)\b/))) {
      return this.notarztAbkoemmlich(u);
    }

    // Einsatzabbruch
    if (has(/\b(?:abbruch|einsatzabbruch|abbrechen|brechen sie (?:\w+ )*ab|brecht (?:\w+ )*ab|abgebrochen|storniert|stornieren|nicht mehr (?:benötigt|gebraucht|erforderlich|notwendig)|werden nicht (?:mehr )?(?:benötigt|gebraucht)|aus dem einsatz|aus einsatz entlassen|entlassen|sie sind frei|seid frei|können einrücken|könnt einrücken|dürfen einrücken)\b/)) {
      if (!inc) {
        if (u.task === 'station') return 'Wir sind ohne Einsatz auf der Wache.';
        if (has(/einrück|frei|entlassen/)) {
          this.returnToStation(u);
          return 'Verstanden, rücken ein zur Wache.';
        }
        return 'Wir haben derzeit keinen Einsatz.';
      }
      if (u.hasPatient) return 'Negativ, wir haben einen Patienten an Bord.';
      this.releaseUnit(u.id, true);
      return this.pick(['Verstanden, Abbruch, rücken ein.', 'Verstanden, brechen ab und rücken ein.']);
    }

    // Zielklinik: "Fahren Sie das Juliusspital an", "Transport in die Uniklinik"
    const klinikKontext = u.task === 'awaitHospital' || has(/\b(?:zielklinik|klinik\w*|krankenhaus|spital|anfahren|fahren sie|fahrt|transport\w*|bringen sie|bringt|einliefern|voranmeldung)\b/);
    if (klinikKontext && !frage) {
      const h = findeKlinik(t, this.scn.hospitals);
      if (h) {
        if (u.task === 'awaitHospital') {
          if (sprechwunsch) u.speak = undefined;
          if (sprechStatus(u.status)) u.status = u.baseStatus;
          const err = this.assignHospital(u.id, h.id, false, true);
          return err ? 'Bitte wiederholen.' : this.pick([`Verstanden, fahren ${h.name} an.`, `Verstanden, Transport ins ${h.name}.`, `${h.name}, verstanden.`]);
        }
        if (u.task === 'toHospital' || u.task === 'atHospital') return hosp?.id === h.id ? `Verstanden, wir fahren bereits ${h.name} an.` : `Wir sind bereits mit Ziel ${hosp?.name ?? 'Klinik'} unterwegs.`;
        if (!u.hasPatient && has(/\b(?:fahren sie|fahrt|anfahren|bringen|transport)/)) return this.typeOf(u)?.transport ? 'Wir haben noch keinen Patienten aufgenommen.' : 'Wir sind kein Transportmittel.';
      } else if (u.task === 'awaitHospital' && has(/\b(?:zielklinik|klinik\w*|krankenhaus|spital|anfahren|fahren sie|fahrt|bringen|transport\w*)\b/)) {
        return 'Welche Zielklinik, bitte wiederholen.';
      }
    }

    // Einrücken: "Rücken Sie ein", "Fahren Sie Wache an", "zurück zum Standort"
    if (has(/\b(?:einrücken|rück(?:en|t) (?:\w+ )?ein|rückt ein|zurück (?:zur|zu|auf die|in die|an die|an) (?:\w+ )?(?:wache|standort|stützpunkt)|(?:wache|standort|stützpunkt) an(?:fahren)?|fahren sie (?:ihre |eure |die |zur )?wache|heimfahrt|nach hause|auftrag h|heimweg)\b/)) {
      if (u.hasPatient) return 'Negativ, wir haben noch einen Patienten an Bord.';
      if (u.task === 'station') return 'Wir sind bereits auf der Wache.';
      if (u.task === 'returning') return 'Sind bereits auf dem Weg zur Wache.';
      if (inc) return 'Verstanden, wir rücken ein, sobald der Einsatz abgearbeitet ist.';
      this.returnToStation(u);
      return this.pick(['Verstanden, rücken ein zur Wache.', 'Verstanden, rücken ein.']);
    }

    // Sondersignal
    if (has(/\b(?:ohne sondersignal|ohne sonderrechte|ohne sosi|ohne blaulicht|sondersignal aus|sosi aus|normale fahrt)/)) return 'Verstanden, weiter ohne Sondersignal.';
    if (has(/\b(?:mit sondersignal|mit sonderrechten|mit sosi|mit blaulicht|sondersignal ein|beeil\w*|dringend|zügig|schnellstmöglich|schnell wie möglich)/)) return 'Verstanden, fahren mit Sondersignal.';

    // Fragen, auch ohne Fragezeichen
    if (has(/\b(?:wo (?:seid|sind|befinde\w*|steh\w*|halte\w*|fahr\w*|genau|gerade|aktuell|jetzt)|wo seid ihr|standort|position|aktuell(?:er)? ort|welche(?:r|n)? (?:straße|ort|höhe)|auf welcher höhe)/)) {
      const tail = etaMin && unterwegs ? `, Eintreffen in etwa ${etaMin} Minuten` : '';
      return `Wir sind ${where}${tail}.`;
    }
    if (has(/\b(?:eintreff\w*|ankunft|ankommen|wie lange|wie weit|wann (?:seid|sind|kommt|kommen|könnt|können|erreich\w*|ist|seit ihr)|eta|minuten bis|schon (?:vor ort|da|dort|an der|am)|noch (?:weit|lange)|entfernung|voraussichtlich|wie viele minuten|in wie vielen minuten)\b/)) {
      if (unterwegs) return `Eintreffen in etwa ${etaMin ?? 5} Minuten${u.task === 'toHospital' && hosp ? ` am ${hosp.name}` : ''}.`;
      if (u.task === 'alarmed') return 'Wir rücken gerade aus, melden Status 3.';
      if (vorOrt) return 'Wir sind bereits an der Einsatzstelle.';
      if (u.task === 'atHospital') return `Wir sind bereits am ${hosp?.name ?? 'Krankenhaus'}.`;
      return `Wir sind ${where}, derzeit ohne Einsatz.`;
    }
    if (has(/\b(?:lage\w*|rückmeldung|zwischenmeldung|sachstand|situation|erkundung|was ist (?:los|passiert)|was liegt vor|wie sieht es (?:\w+ )*aus|wie schaut es (?:\w+ )*aus|was habt ihr (?:vor ort|da)|was haben sie (?:vor ort|da)|meldung von der einsatzstelle|wie ist es vor ort)\b/)) {
      if (truth && u.task === 'onScene' && !truth.erkundet) return 'Erkundung läuft noch, Lagemeldung folgt.';
      if (truth && vorOrt) {
        const p = truth.patients.find((x) => x.unitId === u.id && !x.done);
        return `${truth.lage}${p ? ` Wir versorgen: ${p.desc}.` : ''}`;
      }
      if (inc) return 'Wir sind noch nicht vor Ort, Lagemeldung folgt.';
      return 'Wir haben keinen Einsatz, keine besonderen Vorkommnisse.';
    }
    if (has(/\b(?:nachforder\w*|weitere (?:kräfte|fahrzeuge|einheiten|unterstützung|rettungsmittel)|mehr (?:kräfte|leute|fahrzeuge)|brauch\w* (?:ihr|sie|du) (?:noch )?(?:\w+ )?(?:kräfte|fahrzeuge|unterstützung|verstärkung|was|etwas|einen|ein|eine|weitere|mehr|noch)|benötig\w* (?:ihr|sie) (?:noch )?|unterstützung|verstärkung|reicht das|reichen die kräfte|kräfte ausreichend|zusätzlich)/)) {
      if (!truth || !vorOrt) return 'Können wir erst vor Ort beurteilen.';
      if (!truth.erkundet) return 'Erkundung läuft noch, können wir noch nicht beurteilen.';
      const missing = Object.entries(truth.needs).filter(([type, n]) => inc!.unitIds.filter((id) => this.unit(id)?.type === type).length < n);
      return missing.length ? `Ja, wir benötigen noch ${missing.map(([type, n]) => `${n} ${type}`).join(' und ')}.` : 'Nein, die Kräfte reichen aus.';
    }
    if (has(/\b(?:notarzt|notärztin|na|arzt|ärztin|nef|rth|hubschrauber)\b/)) {
      if (this.istNotarzt(u)) return 'Ja, Notarzt ist an Bord.';
      if (this.units.some((d) => d.begleitet === u.id)) return 'Ja, Notarzt begleitet den Transport.';
      const doc = inc?.unitIds.map((id) => this.unit(id)).filter((x): x is UnitState => !!x && (x.type === 'NEF' || !!this.typeOf(x)?.air)) ?? [];
      if (doc.some((x) => x.task === 'onScene' || x.task === 'awaitHospital')) return 'Notarzt ist bei uns vor Ort.';
      if (doc.length) return 'Notarzt ist alarmiert, aber noch nicht vor Ort.';
      if (has(/\b(?:nachforder\w*|brauch\w*|benötig\w*|anfordern|schicken)\b/)) return vorOrt ? 'Ja, Notarzt wäre erforderlich, bitte nachalarmieren.' : 'Können wir erst vor Ort beurteilen.';
      return 'Negativ, wir sind ohne Notarzt.';
    }
    if (has(/\b(?:besatzung|stärke|personal|wie viele (?:leute|mann|kräfte|kameraden)|mann an bord|wie stark)\b/)) {
      const rd = this.typeOf(u)?.org === 'RD';
      return `Besatzung ${rd ? (u.type === 'NEF' ? '1/1' : '0/2') : this.pick(['1/5', '1/8', '0/6', '1/2', '0/3'])}.`;
    }
    if (has(/\b(?:patient\w*|zustand|transportziel|zielklinik|klinik\w*|krankenhaus|wohin|an bord|pzc|verletzt\w*|verletzte|betroffene|transport\w*)\b/)) {
      const p = truth?.patients.find((x) => x.unitId === u.id && !x.done);
      if (u.task === 'toHospital' && hosp) return `Wir transportieren ${p ? p.desc : 'den Patienten'} in das ${hosp.name}.`;
      if (u.task === 'awaitHospital' && p) {
        u.pzc = p.pzc;
        return `Patient: ${p.desc}. PZC ${pzcSprech(p.pzc)}, erbitten Zielklinik.`;
      }
      if (u.hasPatient) return 'Patient ist stabil, wir sind transportbereit.';
      if (vorOrt && truth) return truth.lage;
      return 'Wir haben keinen Patienten an Bord.';
    }
    const label: Record<number, string> = { 1: 'frei über Funk', 2: 'einsatzbereit auf der Wache', 3: 'auf der Anfahrt', 4: 'am Einsatzort', 6: 'außer Dienst', 7: 'Patient aufgenommen', 8: 'am Transportziel' };
    const statusText = `Status ${u.baseStatus ?? u.status}, ${label[u.baseStatus ?? u.status] ?? 'im Einsatz'}`;
    if (has(/\b(?:einsatzbereit|verfügbar|frei|klar|kapazität\w*|einsatz übernehmen|übernehmen können|noch was übernehmen|könnt ihr|können sie (?:\w+ )*(?:übernehmen|fahren|einsatz))\b/) && (frage || has(/\b(?:sind sie|seid ihr)\b/))) {
      const s = u.baseStatus ?? u.status;
      if (s === 1) return 'Ja, wir sind frei über Funk, Status 1.';
      if (s === 2) return 'Ja, wir sind einsatzbereit auf der Wache, Status 2.';
      return `Negativ, wir sind ${statusText}.`;
    }
    if (has(/\bstatus\b/)) return `Wir sind ${statusText}.`;
    if (has(/\b(?:melden sie sich frei|meldet euch frei|frei melden)\b/)) return vorOrt || u.hasPatient ? `Negativ, wir sind noch gebunden, ${statusText}.` : `Wir sind ${statusText}.`;
    if (has(/\b(?:hört ihr|hören sie mich|verstehen sie mich|versteht ihr|funkprobe|empfang|wie ist die verständigung|lesbarkeit)\b/)) return this.pick(['Verstehe Sie gut.', 'Laut und deutlich.', 'Höre Sie klar.']);
    if (frage) return this.pick(['Frage nicht verstanden, bitte wiederholen.', 'Bitte wiederholen.', 'Das können wir gerade nicht sagen, wir melden uns.']);
    if (has(/\b(?:fahrt|fahren sie|übernehmt|übernehmen sie|anfahren|alarm\w*|einsatz)\b/)) {
      if (inc && (u.task === 'alarmed' || unterwegs)) return this.pick(['Verstanden, sind unterwegs.', 'Verstanden, übernehmen.', 'Habe verstanden, fahren an.']);
      if (!inc) return 'Verstanden, erwarten die Alarmierung.';
      return this.pick(['Verstanden.', 'Verstanden, übernehmen.']);
    }
    return this.pick(['Verstanden.', 'Habe verstanden.', 'Verstanden, wird gemacht.', 'Alles klar, verstanden.']);
  }

  /** Alarmierung oder Umdisponierung per Sprechfunk; null, wenn kein passender Einsatz genannt wurde */
  private funkAlarm(u: UnitState, t: string, von: { name: string }): string | null {
    const offen = this.incidents.filter((i) => i.status !== 'abgeschlossen' && i.id !== u.incidentId);
    if (!offen.length) return u.incidentId ? null : 'Verstanden, erwarten die Alarmierung.';
    const inc = findeEinsatz(t, offen);
    if (!inc) return 'Welcher Einsatz, bitte Einsatzort wiederholen.';
    const ziel = `${inc.stichwort} ${inc.address}`;
    if (u.hasPatient) return `Negativ, wir haben einen Patienten an Bord und können ${ziel} nicht übernehmen.`;
    if (u.fremd) return `Negativ, wir sind Fremdfahrzeug der ${u.fremd.ils}, bitte über die ESWL anfordern.`;
    if (u.status === 6 || u.baseStatus === 6) return 'Negativ, wir sind außer Dienst.';
    const s8 = inUebergabe(u);
    const alt = u.incidentId && !s8 ? this.incident(u.incidentId) : undefined;
    if (alt) {
      // Umdisponieren: aus dem bisherigen Einsatz lösen, dann neu alarmieren
      if (!['alarmed', 'toScene', 'onScene'].includes(u.task)) return `Negativ, wir sind noch im Einsatz ${alt.address} gebunden.`;
      this.releaseUnit(u.id, true, false);
      this.log(alt, `${shortCallsign(u.callsign)} per Funk umdisponiert zu ${inc.nr} ${inc.address}`);
      // Übergabe in der Klinik schließt alarm() selbst ab
    } else if (!s8 && ![1, 2].includes(u.baseStatus)) return `Negativ, wir sind derzeit nicht einsatzbereit, Status ${u.baseStatus}.`;
    if (sprechStatus(u.status) && u.speak && !u.speak.answered && u.speak.kind === 'info') {
      u.speak = undefined;
      u.status = u.baseStatus;
    }
    const err = this.alarm(von, inc.id, [u.id]);
    if (err) return `Negativ, ${err}.`;
    this.log(inc, `${shortCallsign(u.callsign)} per Sprechfunk alarmiert`);
    const air = this.typeOf(u)?.air;
    return alt
      ? this.pick([`Verstanden, brechen ab und übernehmen ${ziel}.`, `Verstanden, drehen ab zu ${ziel}.`])
      : this.pick([`Verstanden, übernehmen ${ziel}.`, `${ziel}, verstanden, ${air ? 'fliegen' : 'rücken'} aus.`]);
  }

  /** Notarztmittel: NEF oder Rettungshubschrauber */
  private istNotarzt(u: UnitState) {
    return u.type === 'NEF' || !!this.typeOf(u)?.air;
  }

  /** Antwort auf "Ist der Notarzt abkömmlich?"; bei Ja wird er aus dem Einsatz entlassen und ist wieder frei */
  private notarztAbkoemmlich(u: UnitState): string {
    const doc = this.istNotarzt(u)
      ? u
      : this.units.find((d) => d.begleitet === u.id) ??
        (u.incidentId ? this.units.find((d) => d.incidentId === u.incidentId && this.istNotarzt(d)) : undefined);
    if (!doc) return 'Wir haben keinen Notarzt bei uns.';
    const wir = doc === u ? 'wir' : 'der Notarzt';
    const Wir = doc === u ? 'Wir' : 'Der Notarzt';
    if (doc.crewPlayerId && doc !== u) return 'Bitte direkt beim Notarzt erfragen.';
    const min = (ms: number) => Math.max(1, Math.round(ms / 60000));
    const inc = doc.incidentId ? this.incident(doc.incidentId) : undefined;
    const truth = inc ? this.incTruth.get(inc.id) : undefined;
    const hosp = doc.hospitalId ? this.scn.hospitals.find((h) => h.id === doc.hospitalId) : undefined;
    const frei = () => {
      const err = this.releaseUnit(doc.id, false, false);
      if (err) return `Negativ, ${err}.`;
      return doc === u ? 'Ja, Notarzt ist abkömmlich. Sind frei über Funk, Status 1.' : `Ja, Notarzt ist abkömmlich, ${shortCallsign(doc.callsign)} ist frei, Status 1.`;
    };
    if (!inc) {
      if (doc.status === 6) return `Negativ, ${wir === 'wir' ? 'wir sind' : `${shortCallsign(doc.callsign)} ist`} außer Dienst.`;
      if (doc.task === 'covering' || doc.task === 'toCover') return `Ja, einsatzbereit zur Gebietsabsicherung${doc.cover ? ` in ${doc.cover.name}` : ''}, Status ${doc.status}.`;
      return `Ja, Notarzt ist frei, Status ${doc.baseStatus ?? doc.status}.`;
    }
    switch (doc.task) {
      case 'alarmed':
      case 'toScene': {
        const eta = doc.eta ? `, Eintreffen in etwa ${min(doc.eta - this.time)} Minuten` : '';
        return `${Wir} ${wir === 'wir' ? 'sind' : 'ist'} auf der Anfahrt zum Einsatz ${inc.address}${eta}. Bei Bedarf bitte umdisponieren.`;
      }
      case 'toHospital': {
        const eta = doc.eta ? min(doc.eta - this.time) : 5;
        return `Negativ, ${wir} ${wir === 'wir' ? 'begleiten' : 'begleitet'} den Patienten ins ${hosp?.name ?? 'Krankenhaus'}, Eintreffen in etwa ${eta} Minuten, abkömmlich nach der Übergabe in etwa ${eta + 5} Minuten.`;
      }
      case 'atHospital': {
        const rest = doc.timer !== undefined ? doc.timer - this.time : 0;
        if (rest <= 3 * 60_000) {
          doc.timer = undefined;
          return frei().replace('Ja, Notarzt ist abkömmlich', 'Ja, Übergabe ist abgeschlossen');
        }
        return `Negativ, Übergabe im ${hosp?.name ?? 'Krankenhaus'} läuft noch, abkömmlich in etwa ${min(rest)} Minuten.`;
      }
      case 'onScene': {
        if (!truth) return frei();
        if (!truth.erkundet) return 'Negativ, Erstversorgung läuft noch, wir melden uns.';
        const offen = truth.patients.filter((p) => !p.done && (!p.unitId || p.unitId === doc.begleitet));
        if (doc.begleitet || offen.some((p) => p.pzc.endsWith('1'))) {
          const carrier = doc.begleitet ? this.unit(doc.begleitet) : undefined;
          const ziel = carrier?.hospitalId ? this.scn.hospitals.find((h) => h.id === carrier.hospitalId)?.name : undefined;
          return `Negativ, Patient ist notarztpflichtig, ${wir} ${wir === 'wir' ? 'begleiten' : 'begleitet'} den Transport${ziel ? ` ins ${ziel}` : ''}. Abkömmlich nach der Übergabe in der Klinik.`;
        }
        if (!truth.workDone && offen.length && truth.needs[doc.type]) {
          const rest = Math.max(60_000, truth.workMs - (truth.progress ?? 0));
          return `Negativ, Patient wird noch notärztlich versorgt, abkömmlich in etwa ${min(rest)} Minuten.`;
        }
        // Notarzt wird nicht mehr gebraucht: Patient bleibt beim Rettungsdienst
        if (truth.needs[doc.type]) truth.needs[doc.type] = Math.max(0, truth.needs[doc.type] - 1);
        (truth.released ??= new Set()).add(doc.id);
        return frei();
      }
      default:
        return `${Wir} ${wir === 'wir' ? 'sind' : 'ist'} Status ${doc.status}.`;
    }
  }

  private tmoName(id?: string) {
    return this.scn.tmoGroups?.find((g) => g.id === id)?.name ?? id ?? '';
  }

  /** Gruppenwechsel: Anweisung in der alten Gruppe, Bestätigung in der neuen */
  private switchTmo(u: UnitState, group?: string) {
    if (!group || u.tmo === group) return;
    const old = u.tmo;
    this.radioMsg(this.scn.ilsName, u.callsign, `Wechseln Sie in Rufgruppe ${this.tmoName(group)}.`, 'voice', old);
    u.tmo = group;
    if (!u.crewPlayerId) this.after(this.rand(3000, 6000), () => this.radioMsg(u.callsign, this.scn.ilsName, `In ${this.tmoName(group)}.`, 'voice', group));
  }

  private returnToStation(u: UnitState) {
    const st = this.station(u);
    u.cover = undefined;
    u.task = 'returning';
    this.setStatus(u, u.desinfektion ? 6 : 1);
    this.startRoute(u, st, false);
  }

  private setStatus(u: UnitState, s: FmsStatus, announce = true) {
    if (u.speak && !u.speak.answered && !sprechStatus(s)) {
      u.baseStatus = s;
    } else {
      u.status = s;
      u.baseStatus = s;
    }
    if (announce) this.radioMsg(u.callsign, this.scn.ilsName, `Status ${s} – ${FMS_TEXT[s]}`, 'fms');
  }

  /** Sprechwunsch (Status 5) oder mit prio dringender Sprechwunsch (Status 0) */
  private requestSpeak(u: UnitState, kind: NonNullable<UnitState['speak']>['kind'], text: string, group?: string, prio = false) {
    if (u.speak && !u.speak.answered) {
      // Dieselbe Meldung nicht mehrfach anhängen (z. B. wiederholte Erinnerung an fehlende Kräfte)
      if (!u.speak.text.includes(text)) u.speak.text += ' ' + text;
      if (group) u.speak.group ??= group;
      // Offener Sprechwunsch wird dringend: Status 0 nachschieben
      if (prio && !u.speak.prio) {
        u.speak.prio = true;
        u.status = 0;
        this.radioMsg(u.callsign, this.scn.ilsName, `Status 0 – ${FMS_TEXT[0]}`, 'fms');
      }
      return;
    }
    u.speak = { kind, text, since: this.time, answered: false, ...(group ? { group } : {}), ...(prio ? { prio } : {}) };
    if (!sprechStatus(u.status)) u.baseStatus = u.status;
    u.status = prio ? 0 : 5;
    this.radioMsg(u.callsign, this.scn.ilsName, prio ? `Status 0 – ${FMS_TEXT[0]}` : 'Status 5 – Sprechwunsch', 'fms');
  }

  /** Sprechaufforderung; viaFunk: die Leitstelle hat das Fahrzeug schon selbst angesprochen */
  private speakPermit(unitId: string, viaFunk = false): string | void {
    const u = this.unit(unitId);
    if (!u?.speak || u.speak.answered) return 'Kein Sprechwunsch offen';
    if (!viaFunk) this.radioMsg(this.scn.ilsName, u.callsign, 'Sprechaufforderung.', 'voice');
    u.speak.answered = true;
    u.status = u.baseStatus;
    if (u.speak.kind === 'crew') {
      u.speak = undefined;
      return;
    }
    // Erst mit der gesprochenen Meldung ist der PZC in der Leitstelle bekannt
    if (u.task === 'awaitHospital' && u.speak.text.includes('PZC')) u.pzc = this.patientOf(u)?.pzc ?? u.pzc;
    const text = `${this.scn.ilsName} von ${u.callsign}: ${u.speak.text}`;
    this.radioMsg(u.callsign, this.scn.ilsName, u.speak.text, 'voice', u.speak.group);
    this.events.speech?.(text);
    const inc = u.incidentId ? this.incident(u.incidentId) : undefined;
    if (inc) this.log(inc, `Funk ${shortCallsign(u.callsign)}: ${u.speak.text}`);
    u.speak = undefined;
  }

  /** Zielklinik zuweisen; viaFunk: die Leitstelle hat sie schon im Funkspruch genannt */
  private assignHospital(unitId: string, hospitalId: string, byCrew = false, viaFunk = false): string | void {
    const u = this.unit(unitId);
    const h = this.scn.hospitals.find((x) => x.id === hospitalId);
    if (!u || !h) return 'Fahrzeug oder Klinik nicht gefunden';
    if (u.task !== 'awaitHospital') return `${u.callsign} wartet nicht auf eine Zielklinik`;
    if (u.speak && !u.speak.answered) this.speakPermit(u.id);
    u.hospitalId = h.id;
    const amTelefon = this.closeRtwCall(u, h);
    if (byCrew) this.radioMsg(u.callsign, this.scn.ilsName, `Wir fahren ${h.name} an.`, 'voice');
    else if (!amTelefon && !viaFunk) this.radioMsg(this.scn.ilsName, u.callsign, `Fahren Sie ${h.name} an.`, 'voice');
    const inc = u.incidentId ? this.incident(u.incidentId) : undefined;
    const truth = inc ? this.incTruth.get(inc.id) : undefined;
    const pat = truth?.patients.find((p) => p.unitId === u.id && !p.done);
    let trotz = false;
    let pflicht = false;
    if (pat && inc) {
      const fach = zielFach(pzcFachbereich(pat.pzc), this.scn.hospitals);
      const ab = this.abgemeldet(h.id, fach);
      const alternative = this.scn.hospitals.some((o) => o.id !== h.id && o.specialties.includes(fach) && !this.abgemeldet(o.id, fach));
      const vereinbart = truth?.zielId ? this.scn.hospitals.find((o) => o.id === truth.zielId) : undefined;
      if (vereinbart) {
        // Verlegung: Die Zielklinik ist zwischen den Ärzten abgesprochen, eine Abmeldung in IVENA spielt keine Rolle
        if (vereinbart.id === h.id) this.addScore(10, `${inc.nr}: vereinbarte Zielklinik ${h.name}`);
        else this.addScore(-10, `${inc.nr}: Zielklinik war mit ${vereinbart.name} vereinbart`);
      } else if (!h.specialties.includes(fach)) this.addScore(-10, `${inc.nr}: ${h.name} hat keine ${fach}`);
      else if (ab && alternative && aufnahmepflicht(pat.pzc, u, h, this.scn.hospitals, (id, f) => !!this.abgemeldet(id, f))) {
        // Vitale Bedrohung: Die nächste geeignete Klinik muss trotz Abmeldung aufnehmen
        pflicht = true;
        this.addScore(10, `${inc.nr}: Aufnahmepflicht bei vitaler Bedrohung (${h.name})`);
      } else if (ab && alternative) {
        trotz = true;
        this.addScore(-10, `${inc.nr}: ${h.name} hat ${fach} in IVENA abgemeldet (${ab.grund})`);
      } else this.addScore(10, `${inc.nr}: passende Zielklinik (${fach})`);
      this.log(
        inc,
        `${shortCallsign(u.callsign)} Transport nach ${h.name}${pat.pzc ? `, PZC ${pat.pzc}` : ''}${pflicht ? ' (Aufnahmepflicht trotz Abmeldung)' : trotz ? ' (trotz Abmeldung)' : ''}`,
      );
      const art = voranmeldungFuer(pat.pzc);
      if (art) u.voranmeldung = { art, hospitalId: h.id };
    }
    this.ivena.zuweisungen.push({
      t: this.time,
      hospitalId: h.id,
      callsign: u.callsign,
      pzc: u.pzc,
      nr: inc?.nr,
      ...(trotz ? { trotzAbmeldung: true } : {}),
      ...(pflicht ? { aufnahmepflicht: true } : {}),
    });
    if (u.crewPlayerId) {
      u.hint = `Zielklinik: ${h.name}.${u.voranmeldung ? ` Die Leitstelle meldet ${u.voranmeldung.art} voran.` : ''} Status 7 drücken, sobald der Patient aufgenommen ist.`;
      return;
    }
    this.after(this.rand(60, 150) * 1000, () => this.departToHospital(u));
  }

  /** Tracerdiagnose: Patient in der Zielklinik voranmelden (Schockraum, Herzkatheterlabor, Stroke Unit) */
  private voranmelden(unitId: string): string | void {
    const u = this.unit(unitId);
    const v = u?.voranmeldung;
    if (!u || !v) return 'Für diesen Patienten ist keine Voranmeldung nötig';
    if (v.t !== undefined) return 'Patient ist bereits vorangemeldet';
    const h = this.scn.hospitals.find((x) => x.id === v.hospitalId);
    v.t = this.time;
    const inc = u.incidentId ? this.incident(u.incidentId) : undefined;
    if (inc) this.log(inc, `${v.art} im ${h?.name ?? 'Zielkrankenhaus'} vorangemeldet (${shortCallsign(u.callsign)}${u.pzc ? `, PZC ${u.pzc}` : ''})`);
  }

  private departToHospital(u: UnitState) {
    const h = this.scn.hospitals.find((x) => x.id === u.hospitalId);
    if (!h || u.task !== 'awaitHospital') return;
    u.task = 'toHospital';
    this.setStatus(u, 7);
    this.startRoute(u, h, true);
    // Begleitender Notarzt fährt im RTW mit, sein Fahrzeug folgt zur Klinik
    for (const d of this.units) {
      if (d.begleitet !== u.id || d.task !== 'onScene') continue;
      d.task = 'toHospital';
      d.hospitalId = h.id;
      this.setStatus(d, 7);
      this.startRoute(d, h, true);
    }
  }

  private crewStatus(player: Player, s: FmsStatus): string | void {
    const u = player.unitId ? this.unit(player.unitId) : undefined;
    if (!u) return 'Kein Fahrzeug besetzt';
    if (u.desinfektion && (s === 1 || s === 2)) return 'Fahrzeug muss erst desinfiziert werden';
    switch (s) {
      case 3:
        if (u.task !== 'alarmed') return 'Kein offener Einsatzauftrag';
        if (u.cover && !u.incidentId) u.hint = `Gebietsabsicherung: Unterwegs zu ${u.cover.name}, jetzt Status 1 drücken.`;
        u.timer = this.time;
        return;
      case 4:
        if (u.task !== 'onScene') return 'Noch nicht am Einsatzort';
        this.setStatus(u, 4);
        return;
      case 5:
        this.requestSpeak(u, 'crew', '(Sprechwunsch der Besatzung)');
        return;
      case 0:
        this.requestSpeak(u, 'crew', '(Dringender Sprechwunsch der Besatzung)', undefined, true);
        return;
      case 7:
        if (u.task !== 'awaitHospital' || !u.hospitalId) return 'Erst eine Zielklinik festlegen';
        this.departToHospital(u);
        return;
      case 8:
        return 'Status 8 wird bei Ankunft am Krankenhaus automatisch gesetzt';
      case 1:
        if (u.task === 'onScene' && this.incTruth.get(u.incidentId ?? '')?.workDone && !u.hasPatient) {
          this.releaseUnit(u.id, false);
          return;
        }
        if (u.task === 'atHospital') {
          this.finishHospital(u);
          return;
        }
        if (u.task === 'station' || u.task === 'free' || u.task === 'returning' || u.task === 'toCover' || u.task === 'covering') {
          this.setStatus(u, 1);
          if (u.task === 'toCover') u.hint = `Gebietsabsicherung: weiter zu ${u.cover?.name ?? 'Standort'}, dort auf Status 1 bleiben.`;
          return;
        }
        return 'Status 1 ist gerade nicht möglich';
      case 2:
        if (u.task !== 'station') return 'Status 2 nur auf der Wache';
        this.setStatus(u, 2);
        return;
      case 6:
        if (u.incidentId) return 'Fahrzeug ist im Einsatz';
        this.setStatus(u, 6);
        return;
      default:
        this.setStatus(u, s);
    }
  }

  /** Gebietsabsicherung: Ausrücken mit Status 3, kurz danach Status 1 für die Fahrt ohne Sondersignal */
  private departToCover(u: UnitState) {
    const c = u.cover!;
    u.task = 'toCover';
    u.timer = undefined;
    this.setStatus(u, 3);
    this.startRoute(u, c, false);
    if (u.crewPlayerId) return;
    this.after(this.rand(8, 20) * 1000, () => {
      if (u.task === 'toCover' && u.cover === c && u.baseStatus === 3) this.setStatus(u, 1);
    });
  }

  private arriveCover(u: UnitState) {
    u.task = 'covering';
    if (u.baseStatus !== 1) this.setStatus(u, 1);
    const name = u.cover?.name ?? 'Standort';
    if (u.crewPlayerId) {
      u.hint = `Am Absicherungsstandort ${name}: auf Status 1 bleiben, bis die Leitstelle H – Fahren Sie Wache an schickt.`;
      return;
    }
    u.hint = undefined;
    this.requestSpeak(u, 'info', `Sind am Absicherungsstandort ${name} angekommen, stehen auf Status 1.`);
  }

  // ---------- Bewegung ----------
  private startRoute(u: UnitState, to: Vec, emergency: boolean) {
    if (this.typeOf(u)?.air) {
      // Luftlinie, in Abschnitte geteilt, damit die Bewegung auf der Karte gleichmäßig ist
      const d = dist(u, to);
      const n = Math.max(2, Math.ceil(d / 500));
      u.route = Array.from({ length: n + 1 }, (_, i) => ({ x: u.x + ((to.x - u.x) * i) / n, y: u.y + ((to.y - u.y) * i) / n }));
      this.routeTimes.set(u.id, { times: u.route.map((_, i) => (d * i) / n / AIR_SPEED), t: 0 });
      u.eta = this.time + (d / AIR_SPEED) * 1000;
      u.routeIdx = 0;
      return;
    }
    const r = this.graph.route(u, to);
    const factor = (emergency ? 1.2 : 1) * (this.typeOf(u)?.speedFactor ?? 1);
    if (!r) {
      u.route = [{ x: u.x, y: u.y }, { x: to.x, y: to.y }];
      this.routeTimes.set(u.id, { times: [0, dist(u, to) / 10], t: 0 });
    } else {
      u.route = r.points;
      // Fahrzeit je Punkt: auf der Autobahn schnell, in der Altstadt langsam
      const times = [...r.times];
      // Anfahrt von außerhalb der Karte (ESWL): Landstraße statt Schritttempo bis zum ersten Knoten bzw. ab dem letzten
      const fern = 80 / 3.6;
      const n = times.length;
      const d0 = dist(r.points[0], r.points[1]);
      if (n > 2 && d0 > 500) {
        const delta = times[1] - d0 / fern;
        for (let i = 1; i < n; i++) times[i] -= delta;
      }
      const d1 = dist(r.points[n - 2], r.points[n - 1]);
      if (n > 2 && d1 > 500) times[n - 1] = times[n - 2] + d1 / fern;
      this.routeTimes.set(u.id, { times: times.map((t) => t / factor), t: 0 });
    }
    const rt = this.routeTimes.get(u.id)!;
    u.eta = this.time + rt.times[rt.times.length - 1] * 1000;
    u.routeIdx = 0;
  }

  private move(u: UnitState, dtMs: number): boolean {
    if (!u.route) return false;
    const rt = this.routeTimes.get(u.id);
    if (!rt) {
      u.route = undefined;
      return true;
    }
    rt.t += dtMs / 1000;
    while (u.routeIdx < u.route.length - 1 && rt.times[u.routeIdx + 1] <= rt.t) u.routeIdx++;
    if (u.routeIdx >= u.route.length - 1) {
      const end = u.route[u.route.length - 1];
      u.x = end.x;
      u.y = end.y;
      u.route = undefined;
      u.eta = undefined;
      this.routeTimes.delete(u.id);
      return true;
    }
    const a = u.route[u.routeIdx];
    const b = u.route[u.routeIdx + 1];
    const span = rt.times[u.routeIdx + 1] - rt.times[u.routeIdx] || 1;
    const f = Math.max(0, Math.min(1, (rt.t - rt.times[u.routeIdx]) / span));
    u.x = a.x + (b.x - a.x) * f;
    u.y = a.y + (b.y - a.y) * f;
    if (dist(a, b) > 0.01) u.heading = Math.atan2(b.y - a.y, b.x - a.x);
    return false;
  }

  // ---------- Einsatzablauf ----------
  private arrive(u: UnitState) {
    const inc = u.incidentId ? this.incident(u.incidentId) : undefined;
    if (!inc) {
      this.returnToStation(u);
      return;
    }
    u.task = 'onScene';
    if (!u.crewPlayerId) this.setStatus(u, 4);
    else u.hint = 'Am Einsatzort angekommen: Status 4 drücken und Lage melden.';
    const truth = this.incTruth.get(inc.id)!;
    if (!inc.firstArrival && inc.termin !== undefined) {
      // Terminfahrt: Pünktlichkeit statt Hilfsfrist; zu früh heißt warten, bis der Patient fertig ist
      inc.firstArrival = this.time;
      inc.status = 'laufend';
      const spaet = this.time - inc.termin;
      const ae = truth.aenderung;
      if (ae?.art === 'absage') this.addScore(-10, `${inc.nr}: Leerfahrt, die Terminfahrt war abgesagt`);
      else if (ae?.art === 'verschieben' && !ae.umgesetzt) this.addScore(-5, `${inc.nr}: Verschiebung auf ${this.uhrzeit(ae.neu!)} Uhr nicht eingetragen`);
      else if (spaet <= TERMIN_TOLERANZ_MS) this.addScore(15, `${inc.nr}: Terminfahrt pünktlich zur Abholung ${this.uhrzeit(inc.termin)} Uhr`);
      else this.addScore(-5, `${inc.nr}: Terminfahrt ${Math.round(spaet / 60000)} min nach der Abholzeit eingetroffen`);
    }
    // Bestellter Patient ist erst zur Abholzeit fertig
    const bereit = truth.termin ?? inc.termin;
    if (bereit !== undefined && truth.progress === undefined && !truth.wartet && this.time < bereit - 5 * 60_000) {
      truth.wartet = true;
      truth.workMs += bereit - this.time;
      this.log(inc, `${shortCallsign(u.callsign)} zu früh: Patient erst um ${this.uhrzeit(bereit)} Uhr abholbereit`);
    }
    if (!inc.firstArrival) {
      inc.firstArrival = this.time;
      inc.status = 'laufend';
      const ref = truth.callStart ?? inc.createdAt;
      const hf = this.time - ref;
      this.score.hilfsfristTotal++;
      this.hilfsSum += hf / 1000;
      this.score.avgHilfsfristSec = this.hilfsSum / this.score.hilfsfristTotal;
      if (hf <= HILFSFRIST_MS) {
        this.score.hilfsfristMet++;
        this.addScore(15, `${inc.nr}: Eintreffen nach ${Math.round(hf / 60000)} min (Hilfsfrist eingehalten)`);
      } else {
        this.addScore(-5, `${inc.nr}: Eintreffen nach ${Math.round(hf / 60000)} min (Hilfsfrist überschritten)`);
      }
    }
    this.log(inc, `${shortCallsign(u.callsign)} am Einsatzort`);
    // Einsatzstelle schon abgearbeitet: Fahrzeug wird nicht mehr benötigt (außer für wartende Patienten)
    const patientWaiting = truth.patients.some((p) => !p.unitId && !p.done) && this.typeOf(u)?.transport;
    if (truth.workDone && !patientWaiting) {
      if (u.crewPlayerId) u.hint = 'Einsatzstelle bereits abgearbeitet. Status 1 drücken.';
      else
        this.after(this.rand(20, 40) * 1000, () => {
          if (u.incidentId === inc.id && u.task === 'onScene') this.releaseUnit(u.id, false);
        });
      return;
    }
    // Falscher Einsatzort: Kräfte finden nichts und suchen weiter
    if (dist(truth.pos, inc) > 400 && !truth.wrongPlaceUntil) {
      truth.wrongPlaceUntil = this.time + 180_000;
      const msg = 'An der angegebenen Adresse keine Einsatzstelle feststellbar, wir erkunden die Umgebung.';
      if (!u.crewPlayerId) this.after(20_000, () => this.requestSpeak(u, 'info', msg));
      else u.hint = msg;
      return;
    }
    if (truth.wrongPlaceUntil && this.time < truth.wrongPlaceUntil) return;
    this.revealAndReport(inc, truth, u);
  }

  /** Erste Kräfte vor Ort: Erkundung beginnt, die Lagemeldung folgt erst nach der Erkundung */
  private revealAndReport(inc: IncidentState, truth: Truth, u: UnitState) {
    if (truth.reported) return;
    // Brand, THL, BMA: Erkundung und Lagemeldung übernimmt die Feuerwehr, wenn sie schon unterwegs ist
    if (!truth.stichwort.startsWith('RD') && this.typeOf(u)?.org === 'RD') {
      const fwComing = inc.unitIds.some((id) => {
        const x = this.unit(id);
        return x && this.typeOf(x)?.org === 'FW' && ['alarmed', 'toScene'].includes(x.task);
      });
      if (fwComing) return;
    }
    truth.reported = true;
    const v = this.verlaufFor(truth);
    if (!v) {
      this.feststellung(inc, truth, u);
      return;
    }
    if (u.crewPlayerId) u.hint = 'Erkundung läuft, die Lage vor Ort wird festgestellt …';
    else if (v.erstmeldung) {
      const text = v.erstmeldung;
      this.after(this.rand(15, 30) * 1000, () => {
        if (u.incidentId === inc.id && u.task === 'onScene' && !truth.erkundet) this.requestSpeak(u, 'info', text);
      });
    }
    if (v.zwischenmeldung) {
      const text = v.zwischenmeldung;
      this.after(v.erkundungMs * 0.55, () => {
        if (truth.erkundet || inc.status === 'abgeschlossen') return;
        this.log(inc, text);
        const w = this.onSceneAi(inc) ?? (u.incidentId === inc.id ? u : undefined);
        if (w && !w.crewPlayerId) this.requestSpeak(w, 'info', text);
      });
    }
    this.after(v.erkundungMs, () => {
      if (inc.status === 'abgeschlossen') return;
      const w = u.incidentId === inc.id && u.task === 'onScene' ? u : inc.unitIds.map((id) => this.unit(id)!).find((x) => x && x.task === 'onScene');
      if (w) this.feststellung(inc, truth, w);
      else truth.reported = false;
    });
  }

  /** Anrufer meldet sich erneut, solange noch niemand eingetroffen ist: Nachfrage oder Verschlechterung */
  private erneutAnrufen(inc: IncidentState, truth: Truth, first: CallState) {
    if (inc.status === 'abgeschlossen' || inc.firstArrival || first.state !== 'ended' || truth.fake || truth.streife) return;
    if (truth.termin !== undefined || truth.stichwort.startsWith('RD KTP') || truth.tpl.kvb || this.incTruth.get(inc.id) !== truth) return;
    if ([...this.erneut.values()].some((e) => e.inc === inc.id)) return;
    const niemand = !inc.unitIds.length;
    if (truth.erneut !== 'immer' && this.rng() >= (niemand ? 0.7 : 0.25)) return;
    const hatNa = this.units.some((u) => this.typeOf(u)?.fills.includes('NEF'));
    const kannSchlechter = hatNa && truth.stichwort.startsWith('RD') && truth.patients.length > 0 && !truth.needs.NEF && truth.facts?.role !== 'selbst';
    let art: ErneutArt = niemand ? 'niemand' : 'nachfrage';
    // Ist noch gar niemand alarmiert, steht das im Vordergrund
    if (!niemand && kannSchlechter && (truth.erneut === 'immer' || this.rng() < 0.5)) {
      art = Math.floor(this.rng() * ERNEUT_VERSCHLECHTERUNG.length);
      const v = ERNEUT_VERSCHLECHTERUNG[art];
      truth.verschlechtert = v.lage;
      truth.needs.NEF = 1;
      truth.lage = `${v.lage} ${truth.lage}`;
      for (const p of truth.patients) if (!p.done) p.pzc = p.pzc.slice(0, 5) + '1';
    }
    const call = this.ring(truth);
    // Gleicher Anschluss wie beim ersten Anruf
    call.phone = first.phone;
    call.aml = first.aml;
    call.landline = first.landline;
    call.incidentId = inc.id;
    this.erneut.set(call.id, { inc: inc.id, art });
    if (typeof art === 'number')
      // Wurde der Notarzt nach dem Anruf nachalarmiert?
      this.after(4 * 60_000, () => {
        if (inc.status === 'abgeschlossen' || call.missed) return;
        const na = inc.unitIds.some((id) => {
          const u = this.unit(id);
          return u && this.typeOf(u)?.fills.includes('NEF');
        });
        if (na) this.addScore(10, `${inc.nr}: Nach erneutem Anruf Notarzt nachalarmiert`);
        else this.addScore(-10, `${inc.nr}: Verschlechterung gemeldet, aber kein Notarzt nachalarmiert`);
      });
  }

  /** Verlauf einmalig auswürfeln und auf die Wahrheit anwenden */
  private verlaufFor(truth: Truth): Verlauf | undefined {
    if (truth.fake || truth.generic || truth.tpl.kvb) return undefined;
    if (truth.verlauf) return truth.verlauf;
    const has = (k: string) => this.units.some((x) => this.typeOf(x)?.fills.includes(k));
    const v = rollVerlauf(
      {
        tplId: truth.tpl.id,
        stichwort: truth.stichwort,
        where: truth.tpl.where,
        lage: truth.lage,
        needs: truth.needs,
        patients: truth.patients.length,
        objekt: truth.objekt,
        melder: truth.melder,
      },
      this.rng,
      has,
    );
    // Laut erneutem Anruf verschlechtert: Notarzt und Transport bleiben, die Lage nennt die Verschlechterung
    if (truth.verschlechtert) {
      v.keinTransport = false;
      if (has('NEF')) v.needs.NEF = Math.max(1, v.needs.NEF ?? 0);
      if (!v.lage.includes(truth.verschlechtert)) v.lage = `${truth.verschlechtert} ${v.lage}`;
    }
    const hadNef = !!truth.needs.NEF;
    truth.nachgefordert = Object.entries(v.needs).some(([k, n]) => n > (truth.needs[k] ?? 0));
    truth.verlauf = v;
    truth.lage = v.lage;
    truth.needs = v.needs;
    truth.workMs *= v.workFactor;
    if (v.keinTransport) truth.patients = [];
    for (const p of v.patients ?? []) this.addPatient(truth, p);
    // Notarzt nachgefordert: Patientenzuweisungscode mit Arztbegleitung
    if (v.needs.NEF && !hadNef)
      for (const p of truth.patients) p.pzc = p.pzc.slice(0, 5) + '1';
    return v;
  }

  private addPatient(truth: Truth, p: { specialty: string; desc: string }) {
    truth.patients.push({ ...p, pzc: pzcFuer(p.desc, p.specialty, this.rand(18, 80), false), done: false });
  }

  private onSceneAi(inc: IncidentState) {
    return inc.unitIds.map((id) => this.unit(id)!).find((x) => x && x.task === 'onScene' && !x.crewPlayerId);
  }

  /** Erkundung abgeschlossen: Lage steht fest, Lagemeldung und ggf. Nachforderung bzw. Abbestellung */
  private feststellung(inc: IncidentState, truth: Truth, u: UnitState) {
    truth.erkundet = true;
    truth.lage = lageZumStand(truth.verlauf, truth.lage, this.notarztStand(inc), inc.polizei === 'vor Ort' ? 'vorOrt' : inc.polizei ? 'angefordert' : 'ohne');
    inc.lage = truth.lage;
    this.log(inc, `Lage: ${truth.lage}`);
    // Rettungsdienst meldet "Transport in …": Der Patient ist dann bald transportbereit, statt noch die volle Einsatzdauer vor Ort zu bleiben
    if (truth.stichwort.startsWith('RD') && truth.patients.length && /\bTransport\b/i.test(truth.lage))
      truth.workMs = Math.min(truth.workMs, (truth.progress ?? 0) + this.rand(3, 8) * 60_000);
    if (truth.verlauf?.erhoehung) this.log(inc, `Feuerwehr erhöht auf ${truth.verlauf.erhoehung}`);
    if (u.crewPlayerId) {
      u.hint = `Lage vor Ort: ${truth.lage} Bitte Lagemeldung an die Leitstelle geben (Status 5).`;
      truth.lastRequest = this.time;
      return;
    }
    const delay = truth.verlauf ? this.rand(5, 15) * 1000 : this.rand(25, 60) * 1000;
    this.after(delay, () => {
      if (u.incidentId !== inc.id) return;
      const missing = this.missingNeeds(inc, truth, false);
      const pol = truth.tpl.polizei && !inc.polizei;
      const ueber = this.surplus(inc, truth);
      const enRoute = ueber.filter((x) => x.task === 'alarmed' || x.task === 'toScene');
      const sagtSchon = /nicht erforderlich|abbestellt/.test(truth.lage);
      const req =
        (missing.length
          ? ` Wir fordern nach: ${missing.join(', ')}.`
          : enRoute.length
            ? sagtSchon
              ? ''
              : ` ${enRoute.map((x) => shortCallsign(x.callsign)).join(', ')} kann abbestellt werden.`
            : pol || sagtSchon || truth.nachgefordert
              ? ''
              : ' Weitere Kräfte nicht erforderlich.') + (pol ? ' Bitte Polizei verständigen.' : '');
      this.requestSpeak(u, missing.length || pol ? 'nachforderung' : 'lage', `Lagemeldung: ${truth.lage}${req}`, undefined, dringend(truth.lage, missing));
      truth.lastRequest = this.time;
      // Nicht mehr benötigte Kräfte an der Einsatzstelle melden sich frei
      for (const x of ueber) {
        if (x.task !== 'onScene' || x.crewPlayerId || x === u) continue;
        (truth.released ??= new Set()).add(x.id);
        this.after(this.rand(60, 180) * 1000, () => {
          if (x.incidentId === inc.id && x.task === 'onScene') this.releaseUnit(x.id, false);
        });
      }
      if (pol)
        this.after(this.rand(5, 8) * 60_000, () => {
          if (inc.polizei || inc.status === 'abgeschlossen') return;
          const v = this.onSceneAi(inc);
          if (v) this.requestSpeak(v, 'nachforderung', 'Die Polizei ist noch nicht vor Ort. Bitte Polizei verständigen.');
        });
    });
  }

  /** Ob ein Notarzt (NEF, RTH) an der Einsatzstelle ist oder zumindest alarmiert */
  private notarztStand(inc: IncidentState): NotarztStand {
    const doc = inc.unitIds.map((id) => this.unit(id)).filter((x): x is UnitState => !!x && !!this.typeOf(x)?.fills.includes('NEF'));
    if (doc.some((x) => x.task === 'onScene' || x.task === 'awaitHospital')) return 'vorOrt';
    return doc.some((x) => x.task === 'alarmed' || x.task === 'toScene') ? 'unterwegs' : 'ohne';
  }

  /** Alarmierte Fahrzeuge, die laut tatsächlicher Lage nicht gebraucht werden */
  private surplus(inc: IncidentState, truth: Truth): UnitState[] {
    const units = inc.unitIds.map((id) => this.unit(id)!).filter((x) => x && !x.hasPatient && ['alarmed', 'toScene', 'onScene'].includes(x.task));
    // Fahrzeuge vor Ort zuerst behalten, dann die nächsten
    units.sort((a, b) => (a.task === 'onScene' ? 0 : 1) - (b.task === 'onScene' ? 0 : 1));
    const left = { ...truth.needs };
    const out: UnitState[] = [];
    for (const x of units) {
      const fills = this.typeOf(x)?.fills ?? [];
      const k = fills.find((f) => (left[f] ?? 0) > 0);
      if (k) left[k]--;
      else if (!this.typeOf(x)?.transport || !truth.patients.some((p) => !p.unitId && !p.done)) out.push(x);
    }
    return out;
  }

  /** Lageänderung während der Abarbeitung */
  private entwicklung(inc: IncidentState, truth: Truth) {
    const e = truth.verlauf?.entwicklung;
    if (!e || truth.entwickelt) return;
    truth.entwickelt = true;
    const has = (k: string) => this.units.some((x) => this.typeOf(x)?.fills.includes(k));
    for (const [k, n] of Object.entries(e.needs ?? {})) if (has(k)) truth.needs[k] = (truth.needs[k] ?? 0) + n;
    for (const p of e.patients ?? []) this.addPatient(truth, p);
    if (e.keinTransport) truth.patients = truth.patients.filter((p) => p.unitId || p.done);
    if (e.workFactor && truth.progress !== undefined) truth.workMs = truth.progress + (truth.workMs - truth.progress) * e.workFactor;
    if (e.needs?.NEF) for (const p of truth.patients) if (!p.done) p.pzc = p.pzc.slice(0, 5) + '1';
    truth.lage += ` ${e.text}`;
    inc.lage = truth.lage;
    this.log(inc, `Lageänderung: ${e.text}`);
    truth.lastRequest = this.time;
    const u = this.onSceneAi(inc);
    const crew = inc.unitIds.map((id) => this.unit(id)!).find((x) => x && x.task === 'onScene' && x.crewPlayerId);
    if (u) {
      const missing = this.missingNeeds(inc, truth, false);
      this.requestSpeak(u, missing.length ? 'nachforderung' : 'info', `Lageänderung: ${e.text}${missing.length ? ` Wir fordern nach: ${missing.join(', ')}.` : ''}`, undefined, dringend(e.text, missing));
    } else if (crew) crew.hint = `Lageänderung: ${e.text} Bitte an die Leitstelle melden (Status 5).`;
  }

  /** Fehlende Kräfte; onSceneOnly = nur bereits eingetroffene Fahrzeuge zählen */
  private missingNeeds(inc: IncidentState, truth: Truth, onSceneOnly: boolean): string[] {
    const pool = inc.unitIds
      .map((id) => this.unit(id)!)
      .filter((u) => u && (!onSceneOnly || ['onScene', 'awaitHospital'].includes(u.task)));
    const missing = coverage(truth.needs, pool, this.types);
    return Object.entries(missing).map(([t, n]) => `${n}x ${this.types.get(t)?.label ?? t}`);
  }

  private progressIncident(inc: IncidentState, dt: number) {
    const truth = this.incTruth.get(inc.id);
    if (!truth || !inc.firstArrival) return;
    if (truth.workDone) {
      this.assignPatients(inc, truth);
      return;
    }
    // Nach der Suche: Kräfte finden die richtige Einsatzstelle
    if (truth.wrongPlaceUntil && this.time >= truth.wrongPlaceUntil && dist(truth.pos, inc) > 400) {
      inc.x = truth.pos.x;
      inc.y = truth.pos.y;
      inc.address = truth.address || inc.address;
      this.log(inc, `Einsatzstelle gefunden: ${inc.address}`);
      for (const id of inc.unitIds) {
        const u = this.unit(id)!;
        if (u.task === 'onScene') {
          u.task = 'toScene';
          this.startRoute(u, inc, true);
        } else if (u.task === 'toScene') this.startRoute(u, inc, true);
      }
      return;
    }
    if (truth.wrongPlaceUntil && this.time < truth.wrongPlaceUntil) return;
    if (!truth.reported || !truth.erkundet) return;
    const onScene = inc.unitIds.map((id) => this.unit(id)!).filter((u) => u && ['onScene', 'awaitHospital'].includes(u.task));
    if (!onScene.length) return;
    // Arbeitsfortschritt: unvollständige Kräfte arbeiten langsamer
    const total = Object.values(truth.needs).reduce((a, b) => a + b, 0);
    const missingCount = Object.values(coverage(truth.needs, onScene, this.types)).reduce((a, b) => a + b, 0);
    const rate = total ? Math.max(0.25, (total - missingCount) / total) : 1;
    if (missingCount) {
      // Erinnerung, wenn die Nachforderung nicht bedient wurde
      const missingAssigned = this.missingNeeds(inc, truth, false);
      if (missingAssigned.length && truth.lastRequest !== undefined && this.time - truth.lastRequest > 240_000) {
        truth.lastRequest = this.time;
        const u = onScene.find((x) => x.task === 'onScene' && !x.crewPlayerId);
        if (u) this.requestSpeak(u, 'nachforderung', `Wir warten weiterhin auf: ${missingAssigned.join(', ')}.`);
      }
    }
    if (truth.progress === undefined) {
      truth.progress = 0;
      this.log(inc, missingCount ? 'Erste Maßnahmen eingeleitet, Kräfte noch unvollständig' : 'Alle benötigten Kräfte vor Ort, Maßnahmen laufen');
    } else if (!missingCount && !truth.complete) {
      this.log(inc, 'Alle benötigten Kräfte vor Ort');
    }
    truth.complete = !missingCount;
    truth.progress += dt * rate;
    const e = truth.verlauf?.entwicklung;
    if (e && !truth.entwickelt && truth.progress >= e.at * truth.workMs) this.entwicklung(inc, truth);
    if (truth.progress < truth.workMs) return;
    truth.workDone = true;
    this.log(inc, 'Maßnahmen abgeschlossen');
    this.assignPatients(inc, truth);
  }

  /** Verteilt Patienten auf Transportfahrzeuge und entlässt nicht mehr benötigte Kräfte */
  private assignPatients(inc: IncidentState, truth: Truth) {
    const onScene = () => inc.unitIds.map((id) => this.unit(id)!).filter((u) => u && u.task === 'onScene');
    for (const p of truth.patients) {
      if (p.unitId || p.done) continue;
      const carrier = onScene().find((u) => this.typeOf(u)?.transport && !u.hasPatient);
      if (!carrier) continue;
      p.unitId = carrier.id;
      carrier.hasPatient = true;
      carrier.task = 'awaitHospital';
      if (infektionstransport(p.pzc)) carrier.infektion = true;
      // PZC mit Arztbegleitung: ein Notarzt von der Einsatzstelle fährt mit
      if (p.pzc.endsWith('1')) {
        const doc = onScene().find((d) => this.istNotarzt(d) && !d.begleitet && !d.crewPlayerId && !truth.released?.has(d.id));
        if (doc) doc.begleitet = carrier.id;
      }
      if (truth.zielId) carrier.verlegungNach = truth.zielId;
      const text = this.zielklinikText(carrier, p.pzc);
      // Der PZC wird erst sichtbar, wenn die Besatzung ihn per Funk oder Telefon durchgibt (Spielerbesatzungen kennen ihn selbst)
      if (carrier.crewPlayerId) {
        carrier.pzc = p.pzc;
        carrier.hint = `${text} Zielklinik wählen oder bei der Leitstelle erfragen.`;
      } else {
        // Ab und zu meldet die Besatzung den Patienten per Telefon statt über Funk an
        const phone = this.rng() < RTW_PHONE_SHARE;
        this.after(this.rand(5, 40) * 1000, () => {
          if (carrier.task !== 'awaitHospital' || carrier.hospitalId) return;
          if (phone) this.ringRtw(carrier, p);
          else this.requestSpeak(carrier, 'zielklinik', text);
        });
      }
    }
    const waiting = truth.patients.filter((p) => !p.unitId && !p.done).length;
    const remaining = onScene().filter((u) => !u.hasPatient);
    // Bei unversorgten Patienten bleibt ein Fahrzeug (bevorzugt Rettungsdienst) an der Einsatzstelle
    const keep = waiting ? remaining.find((u) => this.typeOf(u)?.org === 'RD') ?? remaining[0] : undefined;
    if (waiting && keep && !keep.crewPlayerId) {
      const transportComing = inc.unitIds.some((id) => {
        const u = this.unit(id);
        return u && this.typeOf(u)?.transport && ['alarmed', 'toScene'].includes(u.task);
      });
      if (!transportComing && (truth.lastRequest === undefined || this.time - truth.lastRequest > 240_000)) {
        truth.lastRequest = this.time;
        this.requestSpeak(keep, 'nachforderung', `Noch ${waiting} Patient(en) ohne Transportmittel, wir fordern nach: ${waiting}x RTW.`);
      }
    }
    for (const u of remaining) {
      if (u === keep || u.begleitet || truth.released?.has(u.id)) continue;
      if (u.crewPlayerId) {
        u.hint = 'Einsatzstelle abgearbeitet. Status 1 drücken, um einsatzbereit zu werden.';
        continue;
      }
      (truth.released ??= new Set()).add(u.id);
      this.after(this.rand(10, 60) * 1000, () => {
        if (u.incidentId === inc.id && u.task === 'onScene') this.releaseUnit(u.id, false);
      });
    }
    if (!inc.unitIds.length) this.checkClose(inc);
  }

  /** Funkspruch zur Patientenanmeldung: PZC, ggf. Infektion, Voranmeldung und vereinbartes Verlegungsziel */
  private zielklinikText(u: UnitState, pzc: string) {
    const art = voranmeldungFuer(pzc);
    const ziel = u.verlegungNach ? this.scn.hospitals.find((h) => h.id === u.verlegungNach)?.name : undefined;
    const zusatz = `${u.infektion ? ', Infektionstransport' : ''}${art ? `, bitte ${art} voranmelden` : ''}`;
    return ziel
      ? `Patient übernommen, PZC ${pzc}${zusatz}. Transport wie vereinbart ins ${ziel}, erbitten Bestätigung.`
      : `Patient transportbereit, PZC ${pzc}${zusatz}, erbitten Zielklinik.`;
  }

  /** Patient, den das Fahrzeug gerade transportiert bzw. zum Transport übernommen hat */
  private patientOf(u: UnitState) {
    const inc = u.incidentId ? this.incident(u.incidentId) : undefined;
    return inc ? this.incTruth.get(inc.id)?.patients.find((p) => p.unitId === u.id && !p.done) : undefined;
  }

  /** Funkrückmeldung nach Alarmierung aus Status 8: Übergabe läuft noch, Abfahrt in etwa … Minuten */
  private s8Rueckmeldung(u: UnitState, inc: IncidentState, rest: number, klinik?: string) {
    if (u.incidentId !== inc.id || u.task !== 'alarmed') return;
    const min = Math.max(1, Math.round(rest / 60));
    const ort = klinik ? ` im ${klinik}` : '';
    this.radioMsg(
      u.callsign,
      this.scn.ilsName,
      this.pick([
        `Verstanden, ${inc.address}. Übergabe${ort} läuft noch, sind in etwa ${min} ${min === 1 ? 'Minute' : 'Minuten'} unterwegs.`,
        `Alarmierung verstanden. Wir übergeben noch${ort}, Abfahrt in etwa ${min} ${min === 1 ? 'Minute' : 'Minuten'}.`,
      ]),
      'voice',
    );
  }

  /**
   * Alarmierung aus Status 8: Die Übergabe in der Klinik wird abgeschlossen, das Fahrzeug verlässt den alten
   * Einsatz ohne Freimeldung und Rückfahrt, weil es gleich zum neuen Einsatz ausrückt.
   */
  private uebergabeBeenden(u: UnitState, neu: IncidentState) {
    const inc = u.incidentId ? this.incident(u.incidentId) : undefined;
    const truth = inc ? this.incTruth.get(inc.id) : undefined;
    truth?.patients.forEach((p) => {
      if (p.unitId === u.id) p.done = true;
    });
    u.hasPatient = false;
    u.pzc = undefined;
    u.hospitalId = undefined;
    u.begleitet = undefined;
    u.timer = undefined;
    if (u.speak && !u.speak.answered && u.speak.kind !== 'crew') {
      u.speak = undefined;
      u.status = u.baseStatus;
    }
    if (inc) {
      inc.unitIds = inc.unitIds.filter((id) => id !== u.id);
      if (inc.tmo && u.tmo === inc.tmo) u.tmo = this.station(u).tmo;
      this.log(inc, `${shortCallsign(u.callsign)} Übergabe beendet, alarmiert zu ${neu.nr}`);
    }
    u.incidentId = undefined;
    if (inc) this.checkClose(inc);
  }

  /** Ankunft an der Klinik: Status 8, Voranmeldung prüfen, Übergabedauer nach Wartezeit der Notaufnahme */
  private arriveHospital(u: UnitState) {
    u.task = 'atHospital';
    this.setStatus(u, 8);
    const h = this.scn.hospitals.find((x) => x.id === u.hospitalId);
    const inc = u.incidentId ? this.incident(u.incidentId) : undefined;
    const v = u.voranmeldung;
    let schockraum = false;
    let verzoegert = 0;
    if (v && h && v.hospitalId === h.id) {
      if (v.t !== undefined) {
        schockraum = true;
        this.addScore(5, `${inc?.nr ?? shortCallsign(u.callsign)}: ${v.art} im ${h.name} rechtzeitig vorangemeldet`);
      } else {
        verzoegert = this.rand(3, 8);
        this.addScore(-10, `${inc?.nr ?? shortCallsign(u.callsign)}: ${h.name} nicht vorangemeldet (${v.art})`);
        if (inc) this.log(inc, `${shortCallsign(u.callsign)} am ${h.name}: ${v.art} war nicht vorangemeldet, Übergabe verzögert`);
      }
    }
    u.voranmeldung = undefined;
    if (u.crewPlayerId) {
      u.hint = 'Patient übergeben? Dann Status 1 drücken.';
      return;
    }
    // Übergabe: Wartezeit der Notaufnahme; vorangemeldete Tracerpatienten übernimmt das Schockraumteam sofort
    const warte = h ? this.ivena.wartezeit[h.id] ?? 7 : 7;
    let min = schockraum ? this.rand(4, 7) : warte * this.rand(0.7, 1.3) + verzoegert;
    const trotz = [...this.ivena.zuweisungen].reverse().find((z) => z.callsign === u.callsign && z.hospitalId === h?.id)?.trotzAbmeldung;
    if (trotz) min += this.rand(5, 15);
    // Klinik außerhalb: Rückfahrt bis zum Kartenrand
    min += h?.ausserhalbMin ?? 0;
    u.timer = this.time + Math.max(3, min) * 60_000;
  }

  private finishHospital(u: UnitState) {
    const inc = u.incidentId ? this.incident(u.incidentId) : undefined;
    const truth = inc ? this.incTruth.get(inc.id) : undefined;
    truth?.patients.forEach((p) => {
      if (p.unitId === u.id) p.done = true;
    });
    u.hasPatient = false;
    u.pzc = undefined;
    u.verlegungNach = undefined;
    u.voranmeldung = undefined;
    if (!u.infektion) {
      this.releaseUnit(u.id, false);
      return;
    }
    // Nach einem Infektionstransport fährt das Fahrzeug außer Dienst zur Desinfektion auf die Wache
    u.infektion = undefined;
    u.desinfektion = {};
    this.releaseUnit(u.id, false, false);
    u.hint = 'Infektionstransport: Wache zur Desinfektion anfahren, Fahrzeug bleibt bis dahin in Status 6.';
    if (!u.crewPlayerId) this.requestSpeak(u, 'info', 'Patient übergeben, Infektionstransport. Fahren zur Desinfektion auf die Wache, Status 6.');
  }

  private checkClose(inc: IncidentState) {
    if (inc.status === 'abgeschlossen') return;
    const truth = this.incTruth.get(inc.id);
    if (inc.unitIds.length) return;
    if (truth && !truth.workDone) return;
    if (truth && truth.patients.some((p) => p.unitId && !p.done)) return;
    this.closeIncident(inc, false);
  }

  private closeIncident(inc: IncidentState, manual: boolean) {
    inc.status = 'abgeschlossen';
    inc.closedAt = this.time;
    this.log(inc, !manual ? 'Einsatz beendet' : inc.termin !== undefined && !inc.firstArrival ? 'Terminfahrt storniert' : 'Einsatz manuell abgeschlossen');
    this.score.incidentsClosed++;
    // Punkte gibt es nur beim ersten Abschluss, sonst ließe sich Wiedereröffnen ausnutzen
    if (inc.wiedereroeffnet) return;
    const truth = this.incTruth.get(inc.id);
    if (truth?.workDone) this.addScore(10, `${inc.nr}: Einsatz erfolgreich abgearbeitet`);
    if (truth?.tpl.polizei && !truth.fake && !inc.polizei) this.addScore(-5, `${inc.nr}: Polizei nicht verständigt`);
    else if (manual && truth?.aenderung?.art === 'absage' && !inc.firstArrival) this.addScore(10, `${inc.nr}: Abgesagte Terminfahrt storniert`);
    else if (manual && truth && truth.stichwort && truth.tpl !== BMA_TEMPLATE) this.addScore(-15, `${inc.nr}: Einsatz vorzeitig geschlossen`);
  }

  /** Abgeschlossenen Einsatz wieder in die Einsatzliste holen (auch aus dem Archiv) */
  private reopenIncident(id: string) {
    const archived = this.archiv.findIndex((i) => i.id === id);
    if (archived >= 0) this.incidents.push(...this.archiv.splice(archived, 1));
    const inc = this.incident(id);
    if (!inc) return 'Einsatz nicht gefunden';
    if (inc.status !== 'abgeschlossen') return `Einsatz ${inc.nr} ist nicht abgeschlossen`;
    inc.status = 'offen';
    inc.closedAt = undefined;
    inc.wiedereroeffnet = (inc.wiedereroeffnet ?? 0) + 1;
    inc.wiedereroeffnetAt = this.time;
    this.score.incidentsClosed = Math.max(0, this.score.incidentsClosed - 1);
    this.log(inc, 'Einsatz wieder eröffnet');
  }

  /**
   * Der Besteller ruft wegen einer Terminfahrt zurück: Absage oder neue Abholzeit.
   * Die Änderung gilt sofort (der Patient ist dann nicht da bzw. erst später fertig), eintragen muss sie der Disponent.
   */
  terminAenderung(incidentId: string, art?: 'absage' | 'verschieben'): CallState | null {
    const inc = this.incident(incidentId);
    const orig = inc && this.incTruth.get(inc.id);
    if (!inc || !orig || orig.generic || orig.aenderung || orig.termin === undefined || inc.status === 'abgeschlossen' || inc.firstArrival) return null;
    art ??= this.rng() < 0.5 ? 'absage' : 'verschieben';
    const alt = this.uhrzeit(orig.termin);
    const neu = art === 'verschieben' ? (Math.ceil((this.clockStart + (orig.termin + this.rand(30, 120) * 60_000) / 60000) / 15) * 15 - this.clockStart) * 60000 : undefined;
    const m = (orig.facts?.sex ?? 'm') === 'm';
    const wen = `${m ? 'Herrn' : 'Frau'} {nachname}`;
    const hallo = orig.objekt ? `Grüß Gott, hier nochmal ${orig.objekt}.` : 'Grüß Gott, ich hab vorhin bei Ihnen angerufen.';
    const grund =
      art === 'absage'
        ? this.pick(
            orig.objekt
              ? ['Der Termin ist ausgefallen, das Gerät ist kaputt.', '{Er} hat heute Nacht hohes Fieber bekommen, der Arzt will {ihn} erst mal hierbehalten.', 'Die Klinik hat abgesagt, wir bekommen einen neuen Termin.']
              : ['Der Termin ist ausgefallen, die Praxis hat gerade angerufen.', 'Mein Sohn fährt {ihn} jetzt doch selber.', '{Er} fühlt sich heute nicht gut, wir haben den Termin abgesagt.'],
          )
        : this.pick(['Die Klinik hat angerufen, der Termin ist später.', 'Der Arzt ist noch bei der Visite, vorher geht es nicht.', 'Die haben den Termin nach hinten geschoben.']);
    const was =
      art === 'absage'
        ? `Wir hatten für ${alt} Uhr einen Krankentransport für ${wen} bestellt. Der muss leider abgesagt werden. ${grund}`
        : `Wir hatten für ${alt} Uhr einen Krankentransport für ${wen} bestellt. Können Sie den bitte auf ${this.uhrzeit(neu!)} Uhr verschieben? ${grund}`;
    const tpl: IncidentTemplate = {
      id: `ktp_termin_${art}`,
      role: orig.facts?.role ?? orig.tpl.role,
      sex: orig.facts?.sex,
      stichwort: orig.tpl.stichwort,
      weight: 0,
      where: orig.tpl.where,
      opening: [`${hallo} ${was}`],
      answers: {
        was: [was],
        termin: art === 'absage' ? ['Gar nicht mehr, der Transport fällt aus.', 'Der fällt ganz weg, bitte stornieren.'] : [`Neue Abholzeit ${this.uhrzeit(neu!)} Uhr bitte.`],
        ziel: ['Wie bestellt, ins {ziel}.'],
        wieviele: [`Es geht um ${wen}, {alter} Jahre.`],
        zustand: art === 'absage' ? [grund] : ['Unverändert, {er} ist stabil.'],
        gefahr: ['Nein.'],
      },
      lage: '',
      workMin: [1, 1],
    };
    const call = this.ring({
      tpl,
      stichwort: tpl.stichwort,
      pos: orig.pos,
      address: orig.address,
      spokenWhere: orig.spokenWhere,
      objekt: orig.objekt,
      needs: {},
      patients: [],
      lage: '',
      workMs: 0,
      name: orig.name,
      alter: orig.alter,
      facts: orig.facts,
      fake: false,
      termin: orig.termin,
      ziel: orig.ziel,
      main: orig,
      bezug: { art, neu },
    });
    // Ab jetzt gilt die Änderung: abgesagt heißt Leerfahrt, verschoben heißt, der Patient ist erst später fertig
    orig.aenderung = { art, neu };
    if (art === 'absage') {
      orig.patients = [];
      orig.termin = undefined;
      orig.lage = 'Transport abgesagt, Patient wird nicht transportiert. Leerfahrt.';
      orig.workMs = 2 * 60_000;
    } else {
      orig.termin = neu;
      orig.wartet = false;
    }
    return call;
  }

  /** Terminfahrten: Erinnerung 30 Minuten vor der Abholzeit und bei Fälligkeit, solange noch nicht disponiert */
  private checkTermine() {
    for (const inc of this.incidents) {
      if (inc.termin === undefined || inc.status === 'abgeschlossen' || inc.unitIds.length || inc.firstArrival) continue;
      const stufe = this.time >= inc.termin ? 'faellig' : this.time >= inc.termin - TERMIN_VORLAUF_MS ? 'vorlauf' : undefined;
      if (!stufe || stufe === inc.terminMeldung) continue;
      inc.terminMeldung = stufe;
      const uhr = this.uhrzeit(inc.termin);
      const text =
        stufe === 'faellig'
          ? `Terminfahrt ${inc.nr} jetzt fällig (${uhr} Uhr): ${inc.address}`
          : `Terminfahrt ${inc.nr} in ${Math.max(1, Math.round((inc.termin - this.time) / 60000))} min (${uhr} Uhr): ${inc.address}`;
      this.log(inc, stufe === 'faellig' ? 'Abholzeit erreicht, noch kein Fahrzeug disponiert' : 'Erinnerung: Abholung in 30 Minuten');
      for (const p of this.players) if (p.role !== 'crew') this.events.toast?.(p.id, text, stufe === 'faellig' ? 'warn' : 'info');
    }
  }

  /** Minute seit Mitternacht des Starttages */
  private gameMinute() {
    return Math.floor(this.clockStart + this.time / 60000);
  }

  /** Ist der Fachbereich der Klinik in IVENA abgemeldet? */
  abgemeldet(hospitalId: string, fach: string) {
    return this.ivena.abmeldungen.find((a) => a.hospitalId === hospitalId && a.fach === fach);
  }

  /** Kliniken melden Fachbereiche zeitweise ab (Kapazität, Schockraum, Gerätedefekt) und wieder an */
  private checkIvena() {
    if (this.time < this.ivena.nextCheck) return;
    const first = this.ivena.nextCheck === 0;
    // Unregelmäßiger Takt, damit Ab- und Anmeldungen nicht im Minutenraster kommen
    const schritt = this.rand(30, 90) * 1000;
    this.ivena.nextCheck = this.time + schritt;
    this.ivena.abmeldungen = this.ivena.abmeldungen.filter((a) => a.bis > this.time);
    this.ivena.zuweisungen = this.ivena.zuweisungen.filter((z) => this.time - z.t < 3 * 3600_000);
    const hs = this.scn.hospitals;
    if (hs.length < 2) return;
    const GRUND: Record<string, string[]> = {
      'Innere Medizin': ['keine Betten frei', 'Notaufnahme überlastet'],
      Chirurgie: ['OP-Kapazität erschöpft', 'keine Betten frei'],
      Unfallchirurgie: ['Schockraum belegt', 'OP-Kapazität erschöpft'],
      'Kardiologie (HKL)': ['Herzkatheterlabor belegt', 'HKL technischer Defekt'],
      'Stroke Unit': ['CT ausgefallen', 'Stroke Unit voll belegt'],
      Pädiatrie: ['keine Betten frei'],
      Verbrennungen: ['keine Betten frei'],
      Urologie: ['OP-Kapazität erschöpft', 'keine Betten frei'],
      Gynäkologie: ['keine Betten frei'],
      Geburtshilfe: ['Kreißsaal voll belegt', 'keine Betten frei'],
      HNO: ['OP-Kapazität erschöpft', 'kein HNO-Dienst im Haus'],
      Augenheilkunde: ['kein augenärztlicher Dienst im Haus'],
      Psychiatrie: ['keine geschützten Betten frei', 'Station voll belegt'],
    };
    for (const h of hs) {
      // Auslastung je Klinik schwankt als Zufallsbewegung zwischen 0,3 und 3: mal ruhige Phasen, mal Häufungen
      const auslastung = Math.min(3, Math.max(0.3, (this.ivena.last[h.id] ?? this.rand(0.5, 1.5)) * Math.exp((this.rng() - 0.5) * 0.3)));
      this.ivena.last[h.id] = auslastung;
      // Wartezeit in der Notaufnahme: Größe der Klinik, Zuweisungen der letzten Stunde, Tageszeit und Auslastung
      const stunde = Math.floor((((this.gameMinute() % 1440) + 1440) % 1440) / 60);
      const tageszeit = (stunde >= 10 && stunde < 14) || (stunde >= 17 && stunde < 22) ? 1.3 : stunde < 6 ? 0.7 : 1;
      const basis = h.specialties.length >= 10 ? 9 : h.specialties.length >= 4 ? 6 : 4;
      const zuw = this.ivena.zuweisungen.filter((z) => z.hospitalId === h.id && this.time - z.t < 3600_000).length;
      const warte = Math.min(60, Math.max(3, Math.round((basis + 2 * zuw) * tageszeit * (0.6 + 0.4 * auslastung))));
      this.ivena.wartezeit[h.id] = warte;
      for (const fach of h.specialties) {
        if (this.abgemeldet(h.id, fach)) continue;
        // Mindestens eine weitere Klinik muss den Fachbereich angemeldet haben
        const andere = hs.some((o) => o.id !== h.id && o.specialties.includes(fach) && !this.abgemeldet(o.id, fach));
        if (!andere) continue;
        const last = this.ivena.zuweisungen.filter((z) => z.hospitalId === h.id && this.time - z.t < 3600_000).length;
        const full = h.specialties.length >= 10;
        // im Mittel ca. 1 Abmeldung pro Klinik und Fachbereich alle 10 bis 30 Spielstunden, je nach Auslastung und Zuweisungen
        const perMin = (full ? 1 / 1800 : 1 / 600) * auslastung * (1 + Math.max(0, last - 2)) * (first ? 150 : schritt / 60_000);
        if (this.rng() < perMin) {
          const grund = last >= 4 ? 'Kapazität erschöpft' : this.pick(GRUND[fach] ?? ['keine Betten frei']);
          // Dauer meist 20 bis 90 min, gelegentlich nur eine Viertelstunde oder bis zu vier Stunden
          const r = this.rng();
          const min = r < 0.15 ? this.rand(10, 20) : r < 0.85 ? this.rand(20, 90) : this.rand(90, 240);
          this.ivena.abmeldungen.push({ hospitalId: h.id, fach, grund, seit: this.time, bis: this.time + min * 60_000 });
        }
      }
    }
  }

  /** Schichtbeginn und -ende: freie Fahrzeuge auf der Wache gehen in Status 6 bzw. zurück in Status 2 */
  private checkDienst() {
    const minute = this.gameMinute();
    if (minute === this.lastDienstMinute || !this.dienst.size) return;
    // Beim Spielstart wird nur der Ausgangszustand gesetzt, ohne Funkmeldungen
    const melden = this.lastDienstMinute >= 0;
    this.lastDienstMinute = minute;
    // Gleicher Rufname an mehreren Standorten (wechselnde NEF-Standorte): nur einer zur Zeit im Dienst
    const active = new Map<string, UnitState>();
    for (const u of this.units) {
      if (u.task !== 'station' || u.incidentId) active.set(u.callsign, u);
    }
    for (const u of this.units) {
      const plan = this.dienst.get(u.id);
      if (!plan && !this.units.some((o) => o !== u && o.callsign === u.callsign)) continue;
      let on = inDienst(plan, this.startDate, minute);
      const other = active.get(u.callsign);
      if (on && other && other !== u) on = false;
      if (on && !other) active.set(u.callsign, u);
      // Im Einsatz kann sich niemand abmelden: das passiert erst nach der Rückkehr auf die Wache
      if (u.task !== 'station' || u.incidentId || u.crewPlayerId || u.desinfektion) continue;
      const st = sprechStatus(u.status) ? u.baseStatus : u.status;
      if (!on && st === 2) {
        u.status = 6;
        u.baseStatus = 6;
        if (melden) this.requestSpeak(u, 'info', 'Melden uns zum Dienstende ab, Fahrzeug außer Dienst.');
      } else if (on && st === 6) {
        u.status = 2;
        u.baseStatus = 2;
        const ende = this.dienstende(u, minute);
        if (melden) this.requestSpeak(u, 'info', `Melden uns zum Dienst an, Fahrzeug einsatzbereit auf der Wache${ende ? `, Dienstende ${ende} Uhr` : ''}.`);
      }
    }
  }

  // ---------- Jahreszeit, Großschadenslagen, Unwetter ----------
  season(): Season {
    return seasonOf(this.startDate);
  }

  /** Vor Schichtbeginn: Uhrzeit, Jahreszeit und Häufigkeit besonderer Lagen einstellen */
  private setup(a: Extract<Action, { a: 'setup' }>): string | void {
    if (this.started) return 'Die Schicht läuft bereits';
    if (a.clock !== undefined) {
      if (!isFinite(a.clock)) return 'Ungültige Uhrzeit';
      this.clockStart = ((Math.round(a.clock) % 1440) + 1440) % 1440;
    }
    if (a.season) this.startDate = dateForSeason(new Date(), a.season);
    if (a.gsl && a.gsl in HAEUFIGKEIT_STUNDEN) this.gslFreq = a.gsl;
    if (a.unwetter && a.unwetter in HAEUFIGKEIT_STUNDEN) this.uwFreq = a.unwetter;
    // Dienstpläne zur neuen Uhrzeit bzw. zum neuen Datum
    this.lastDienstMinute = -1;
    this.checkDienst();
  }

  /** Beim Schichtbeginn: erste Großschadenslage und erstes Unwetter auswürfeln */
  private planLagen() {
    if (this.scn.settings.callsPerHour <= 0) return;
    this.nextGslAt = this.time + Math.max(GSL_MIN_MS, this.expDelay(1 / HAEUFIGKEIT_STUNDEN[this.gslFreq]));
    this.planUnwetter(UNWETTER_MIN_MS);
  }

  private planUnwetter(minMs: number) {
    const perHour = WETTER_SAISON_FAKTOR[this.season()] / HAEUFIGKEIT_STUNDEN[this.uwFreq];
    this.nextUwAt = this.time + Math.max(minMs, this.expDelay(perHour));
  }

  /** Wetterlage, die gerade wirkt (Vorabinformation und Vorlaufzeit zählen noch nicht) */
  private wetterAktiv(): WetterLage | undefined {
    const w = this.wetter;
    return w && this.time >= w.von && this.time < w.bis ? w : undefined;
  }

  private dwdMelden(kind: DwdMeldung['kind'], lage: WetterLage) {
    const zeit = (t: number) => dwdZeit(this.startDate, this.clockStart, t);
    this.dwd.push({
      id: `dwd${this.dwd.length + 1}`,
      kind,
      t: this.time,
      stufe: lage.stufe,
      art: lage.art,
      titel: dwdTitel(kind, lage),
      von: lage.von,
      bis: lage.bis,
      text: dwdText(kind, lage, this.scn.ilsName, zeit, this.time),
    });
  }

  /** Unwetter: DWD-Warnung (bei schweren Lagen vorher eine Vorabinformation), dann mehr und wetterbedingte Notrufe */
  startUnwetter(art?: WetterLage['art'], stufe?: WetterLage['stufe']): WetterLage | null {
    if (this.wetter) return null;
    const weighted = <T,>(list: [T, number][]): T => {
      let r = this.rng() * list.reduce((n, [, w]) => n + w, 0);
      for (const [v, w] of list) if ((r -= w) <= 0) return v;
      return list[list.length - 1][0];
    };
    art ??= weighted(WETTER_JE_SAISON[this.season()]);
    const stufen = WETTER_STUFEN[art];
    const st = stufe ? stufen.find((x) => x[0] === stufe) ?? stufen[0] : weighted(stufen.map((x) => [x, x[1]] as [typeof x, number]));
    const vorab = st[0] >= 3 && this.rng() < 0.6;
    const vorlauf = vorab ? this.rand(90, 150) : this.rand(20, 45);
    const von = this.time + vorlauf * 60_000;
    const dauer = WETTER_DAUER[art];
    const lage: WetterLage = { art, stufe: st[0], info: st[2], von, bis: von + this.rand(dauer[0], dauer[1]) * 60_000 };
    this.wetter = lage;
    this.nextUwAt = Infinity;
    if (vorab) {
      this.dwdMelden('vorab', lage);
      this.after(von - this.time - this.rand(20, 45) * 60_000, () => this.dwdMelden('warnung', lage));
    } else this.dwdMelden('warnung', lage);
    this.after(lage.bis - this.time, () => {
      this.dwdMelden('aufhebung', lage);
      this.wetter = undefined;
      this.planUnwetter(60 * 60_000);
    });
    return lage;
  }

  /** Großschadenslage: erster Notruf, danach weitere Anrufer zur selben Lage */
  startGsl(templateId?: string): CallState | null {
    const season = this.season();
    const usable = GSL_TEMPLATES.filter(
      (t) =>
        (!templateId || t.id === templateId) &&
        (!t.seasons || templateId || t.seasons.includes(season)) &&
        (t.where !== 'objekt' || this.scn.objects.some((o) => t.objectKinds?.includes(o.kind))) &&
        (t.where !== 'autobahn' || this.scn.roads.some((r) => r.type === 'autobahn')),
    );
    if (!usable.length) return null;
    const tpl = this.pick(usable);
    const main = this.buildTruth(tpl);
    if (!main) return null;
    const call = this.ring(main);
    const weitere = [...(tpl.weitere ?? [])].sort(() => this.rng() - 0.5).slice(0, 2 + Math.floor(this.rng() * 3));
    let at = 0;
    for (const opening of weitere) {
      at += this.rand(25, 120) * 1000;
      this.after(at, () => {
        const dup = this.buildTruth({ ...tpl, opening: [opening] });
        if (!dup) return;
        this.ring({ ...dup, pos: main.pos, address: main.address, spokenWhere: main.spokenWhere, objekt: main.objekt, main });
      });
    }
    return call;
  }

  // ---------- Takt ----------
  tick(realDtMs: number) {
    if (!this.running) return;
    const dt = realDtMs * this.speed;
    this.time += dt;
    this.checkDienst();
    this.checkIvena();

    this.checkTermine();

    // geplante Ereignisse
    if (this.scheduled.length) {
      const due = this.scheduled.filter((s) => s.at <= this.time);
      this.scheduled = this.scheduled.filter((s) => s.at > this.time);
      for (const s of due) s.fn();
    }

    // Großschadenslage und Unwetter
    if (this.time >= this.nextGslAt) {
      this.startGsl();
      this.nextGslAt = this.time + Math.max(GSL_MIN_MS, this.expDelay(1 / HAEUFIGKEIT_STUNDEN[this.gslFreq]));
    }
    if (this.time >= this.nextUwAt) this.startUnwetter();

    // neue Notrufe: nachts weniger, bei Unwetter deutlich mehr
    if (this.time >= this.nextCallAt) {
      const lage = this.wetterAktiv();
      if (this.calls.filter((c) => c.state === 'ringing' && c.kind === '112').length < (lage ? 6 : 4)) this.spawnCall();
      const rate = this.scn.settings.callsPerHour * tageszeitFaktor(this.gameMinute()) * (lage ? wetterRate(lage.art, lage.stufe) : 1);
      this.nextCallAt = this.time + this.expDelay(rate);
    }
    if (this.time >= this.nextBmaAt) {
      this.spawnBma();
      this.nextBmaAt = this.time + this.expDelay(this.scn.settings.bmaPerHour);
    }
    if (this.time >= this.nextKvbAt) {
      this.spawnKvb();
      this.nextKvbAt = this.time + this.expDelay(this.scn.settings.callsPerHour * KVB_SHARE);
    }

    // unbeantwortete Anrufe
    for (const c of this.calls) {
      if (c.state === 'ringing' && c.kind === 'rtw' && this.time - c.ringStart > RTW_PHONE_GIVEUP_MS) {
        c.state = 'ended';
        c.missed = true;
        c.endedAt = this.time;
        c.transcript.push({ from: 'system', text: 'Nicht angenommen, die Besatzung meldet sich über Funk.', t: this.time });
        const u = this.unit(c.rtw!.unitId);
        if (u && u.task === 'awaitHospital' && !u.hospitalId) this.requestSpeak(u, 'zielklinik', this.zielklinikText(u, this.patientOf(u)?.pzc ?? ''));
        continue;
      }
      if (c.state === 'ringing' && c.kind === '112' && this.time - c.ringStart > MISSED_AFTER_MS) {
        c.state = 'ended';
        c.missed = true;
        c.endedAt = this.time;
        this.score.callsMissed++;
        const truth = this.callTruth.get(c.id)!;
        if (this.erneut.has(c.id)) this.addScore(-10, 'Erneuter Anruf zu einem Einsatz nicht angenommen');
        else if (!truth.fake) {
          this.addScore(-15, 'Notruf nicht angenommen, Anrufer hat aufgelegt');
          truth.retries = (truth.retries ?? 0) + 1;
          if (truth.retries <= 2) this.after(20_000, () => this.ring(truth, true));
        }
      }
    }
    // alte Anrufe entfernen
    this.calls = this.calls.filter((c) => c.state !== 'ended' || this.time - (c.endedAt ?? 0) < 120_000);

    // Fahrzeuge
    for (const u of this.units) {
      // Besatzungen ohne Spieler rücken nach der Ausrückzeit aus; Spieler setzen den Timer mit Status 3
      if (u.task === 'alarmed' && u.timer !== undefined && this.time >= u.timer) {
        const inc = u.incidentId ? this.incident(u.incidentId) : undefined;
        if (!inc) {
          if (u.cover) this.departToCover(u);
          else this.returnToStation(u);
          continue;
        }
        u.task = 'toScene';
        u.timer = undefined;
        this.setStatus(u, 3);
        this.log(inc, `${shortCallsign(u.callsign)} Status 3`);
        this.startRoute(u, inc, true);
      }
      if (u.route) {
        const arrived = this.move(u, dt);
        if (u.fremd) this.checkBereich(u);
        if (arrived) {
          if (u.task === 'toScene') this.arrive(u);
          else if (u.task === 'toHospital') {
            // Klinik außerhalb der Karte: Am Kartenrand beginnt die restliche Fahrt bis zur Klinik
            const h = this.scn.hospitals.find((x) => x.id === u.hospitalId);
            if (h?.ausserhalbMin) this.ausserhalb.set(u.id, { hospitalId: h.id, bis: this.time + h.ausserhalbMin * 60_000 });
            else this.arriveHospital(u);
          } else if (u.task === 'toCover') this.arriveCover(u);
          else if (u.task === 'returning' && u.fremd) u.task = 'station';
          else if (u.task === 'returning') {
            u.task = 'station';
            const st = this.station(u);
            u.x = st.x;
            u.y = st.y;
            if (u.desinfektion) {
              u.desinfektion.bis = this.time + this.rand(30, 60) * 60_000;
              u.hint = 'Fahrzeug wird desinfiziert, danach wieder Status 2.';
            } else {
              this.setStatus(u, 2);
              u.hint = undefined;
            }
          }
        }
      }
      if (u.desinfektion?.bis !== undefined && this.time >= u.desinfektion.bis) {
        u.desinfektion = undefined;
        u.hint = undefined;
        this.setStatus(u, 2);
        if (!u.crewPlayerId) this.requestSpeak(u, 'info', 'Desinfektion abgeschlossen, Fahrzeug wieder einsatzbereit auf der Wache.');
      }
      const aw = this.ausserhalb.get(u.id);
      if (aw && (u.task !== 'toHospital' || u.hospitalId !== aw.hospitalId)) this.ausserhalb.delete(u.id);
      else if (aw && !u.route && this.time >= aw.bis) {
        this.ausserhalb.delete(u.id);
        this.arriveHospital(u);
      }
      if (u.task === 'atHospital' && !u.crewPlayerId && u.timer !== undefined && this.time >= u.timer) {
        u.timer = undefined;
        this.finishHospital(u);
      }
      if (u.speak && !u.speak.answered && this.time - u.speak.since > (u.speak.prio ? PRIO_PENALTY_MS : SPEAK_PENALTY_MS)) {
        const key = `${u.id}:${u.speak.since}`;
        if (!this.penalized.has(key)) {
          this.penalized.add(key);
          if (u.speak.prio) this.addScore(-10, `Status 0 von ${shortCallsign(u.callsign)} nicht sofort beantwortet`);
          else this.addScore(-5, `Sprechwunsch von ${shortCallsign(u.callsign)} seit 3 min unbeantwortet`);
        }
      }
    }

    // Fremdfahrzeuge nach der Rückkehr an ihre Wache wieder an die Nachbar-ILS abgeben
    // (erst nachdem ihre Abmeldung im Funk gesprochen ist)
    const abgeben = (u: UnitState) => !!u.fremd && u.task === 'station' && !(u.speak && !u.speak.answered);
    if (this.units.some(abgeben)) {
      for (const u of this.units.filter(abgeben)) {
        const p = this.players.find((x) => x.unitId === u.id);
        if (p) p.unitId = undefined;
        this.fremdStations.delete(u.stationId);
        this.routeTimes.delete(u.id);
      }
      this.units = this.units.filter((u) => !abgeben(u));
    }

    for (const inc of this.incidents) {
      if (inc.status === 'abgeschlossen') continue;
      this.progressIncident(inc, dt);
      // Nach erfolgreicher Suche erreicht das Fahrzeug die echte Einsatzstelle erneut
      const truth = this.incTruth.get(inc.id);
      if (truth?.wrongPlaceUntil && this.time >= truth.wrongPlaceUntil && !truth.reported) {
        const u = inc.unitIds.map((id) => this.unit(id)!).find((x) => x.task === 'onScene');
        if (u) this.revealAndReport(inc, truth, u);
      }
    }
    // abgeschlossene Einsätze nach 10 min aus der Liste ins Archiv verschieben
    const alt = (i: IncidentState) => i.status === 'abgeschlossen' && this.time - (i.closedAt ?? 0) >= 600_000;
    if (this.incidents.some(alt)) {
      this.archiv.push(...this.incidents.filter(alt));
      this.incidents = this.incidents.filter((i) => !alt(i));
      if (this.archiv.length > ARCHIV_MAX) this.archiv.splice(0, this.archiv.length - ARCHIV_MAX);
    }
  }

  publicState(): PublicState {
    return {
      running: this.running,
      started: this.started,
      speed: this.speed,
      time: this.time,
      clockStart: this.clockStart,
      startDate: `${this.startDate.getFullYear()}-${String(this.startDate.getMonth() + 1).padStart(2, '0')}-${String(this.startDate.getDate()).padStart(2, '0')}`,
      setup: { season: this.season(), gsl: this.gslFreq, unwetter: this.uwFreq },
      dwd: this.dwd.slice(-20),
      players: this.players,
      calls: this.calls,
      incidents: this.incidents,
      archiv: this.archiv.map(({ id, nr, stichwort, label, schlagwort, address, x, y, createdAt, closedAt }) => ({ id, nr, stichwort, label, schlagwort, address, x, y, createdAt, closedAt })),
      // Route nicht vollständig übertragen, nur das Ziel
      units: this.units.map((u) => ({ ...u, route: u.route ? [u.route[u.route.length - 1]] : undefined })),
      radio: this.radio.slice(-120),
      score: this.score,
      ivena: { abmeldungen: this.ivena.abmeldungen, zuweisungen: this.ivena.zuweisungen.slice(-40), wartezeit: this.ivena.wartezeit },
    };
  }
}


