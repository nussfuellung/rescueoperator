// Autoritative Spielsimulation: Notrufe, Einsätze, Fahrzeuge, Funk, Wertung.
import { FMS_TEXT, HILFSFRIST_MS, shortCallsign } from '../shared/catalog';
import { RoadGraph, dist, nearestTown, polylineLength, reverseGeocode } from '../shared/geo';
import { mulberry32 } from '../shared/mapgen';
import { computeProposal, coverage } from '../shared/dispatch';
import type { Action } from '../shared/protocol';
import type {
  CallState,
  FmsStatus,
  IncidentState,
  Player,
  PublicState,
  QuestionId,
  RadioMessage,
  Role,
  Scenario,
  UnitState,
  Vec,
  VehicleType,
} from '../shared/types';
import {
  BMA_REAL_LAGE,
  BMA_TEMPLATE,
  DEFAULT_ANSWERS,
  FIRST_NAMES,
  LAST_NAMES,
  TEMPLATES,
  classifyQuestion,
  questionText,
  type IncidentTemplate,
} from './callgen';

interface PatientTruth {
  specialty: string;
  desc: string;
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
  objekt?: string;
  fake: boolean;
  tcprGiven?: boolean;
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
}

const MISSED_AFTER_MS = 90_000;
const SPEAK_PENALTY_MS = 180_000;

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
  private scheduled: { at: number; fn: () => void }[] = [];
  private seq = { call: 0, inc: 100, radio: 0, player: 0 };
  private nextCallAt = 15_000;
  private nextBmaAt = 0;
  private answerSum = 0;
  private hilfsSum = 0;
  private penalized = new Set<string>();
  private speeds = new Map<string, number>();

  constructor(scn: Scenario, opts: { seed?: number; events?: GameEvents } = {}) {
    this.scn = scn;
    this.graph = new RoadGraph(scn);
    this.types = new Map(scn.vehicleTypes.map((t) => [t.id, t]));
    this.rng = mulberry32(opts.seed ?? Date.now() & 0xffffffff);
    this.events = opts.events ?? {};
    for (const st of scn.stations) {
      for (const v of st.vehicles) {
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
        });
      }
    }
    this.nextBmaAt = this.expDelay(scn.settings.bmaPerHour);
    if (scn.settings.callsPerHour <= 0) this.nextCallAt = Infinity;
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
  private radioMsg(from: string, to: string, text: string, kind: RadioMessage['kind']) {
    this.radio.push({ id: ++this.seq.radio, t: this.time, from, to, text, kind });
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
    return this.scn.stations.find((s) => s.id === u.stationId)!;
  }
  private fill(text: string, t: Truth, phone = '') {
    return text
      .replace(/\{wo\}/g, t.spokenWhere)
      .replace(/\{name\}/g, t.name)
      .replace(/\{alter\}/g, String(t.alter))
      .replace(/\{objekt\}/g, t.objekt ?? 'Heim')
      .replace(/\{phone\}/g, phone);
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
    // Fahrzeugtypen, die im Szenario nicht existieren, ignorieren
    for (const k of Object.keys(needs)) if (!this.units.some((u) => this.typeOf(u)?.fills.includes(k))) delete needs[k];
    return {
      tpl,
      stichwort: tpl.stichwort,
      pos: loc.pos,
      address: loc.address,
      spokenWhere: loc.spoken,
      objekt: loc.objekt,
      needs,
      patients: (tpl.patients ?? []).map((p) => ({ ...p, done: false })),
      lage: tpl.lage,
      workMs: this.rand(tpl.workMin[0], tpl.workMin[1]) * 60_000,
      name: `${this.pick(FIRST_NAMES)} ${this.pick(LAST_NAMES)}`,
      alter: Math.floor(this.rand(55, 89)),
      fake,
    };
  }

  /** Erzeugt einen neuen Notruf (optional mit fester Vorlage, für Tests) */
  spawnCall(templateId?: string): CallState | null {
    const tpl = templateId
      ? TEMPLATES.find((t) => t.id === templateId)
      : this.weightedTemplate();
    if (!tpl) return null;
    const truth = this.buildTruth(tpl);
    if (!truth) return null;
    return this.ring(truth);
  }

  private weightedTemplate(): IncidentTemplate {
    const usable = TEMPLATES.filter((t) => t.where !== 'objekt' || this.scn.objects.some((o) => !t.objectKinds || t.objectKinds.includes(o.kind)));
    const total = usable.reduce((s, t) => s + t.weight, 0);
    let r = this.rng() * total;
    for (const t of usable) {
      r -= t.weight;
      if (r <= 0) return t;
    }
    return usable[0];
  }

  private ring(truth: Truth, again = false): CallState {
    const mobile = this.rng() < 0.7;
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
    };
    if (mobile && !truth.fake && this.rng() < 0.75) {
      const acc = Math.round(this.rand(30, 400));
      const ang = this.rand(0, Math.PI * 2);
      const off = this.rand(0, acc * 0.7);
      call.aml = { x: truth.pos.x + Math.cos(ang) * off, y: truth.pos.y + Math.sin(ang) * off, acc };
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
    const real = this.rng() < 0.2;
    const sw = this.scn.stichworte.find((s) => s.code === 'B BMA');
    const truth: Truth = {
      tpl: BMA_TEMPLATE,
      stichwort: 'B BMA',
      pos: { x: obj.x, y: obj.y },
      address: hit?.text ?? obj.name,
      spokenWhere: '',
      objekt: obj.name,
      needs: { ...(sw?.aao ?? { HLF: 1 }) },
      patients: [],
      lage: real ? BMA_REAL_LAGE : BMA_TEMPLATE.lage,
      workMs: this.rand(10, 15) * 60_000,
      name: '',
      alter: 0,
      fake: false,
      callStart: this.time,
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
        text: `BMA-Auslösung ${obj.name}, Meldergruppe ${Math.floor(this.rand(1, 40))}`,
        x: obj.x,
        y: obj.y,
        address: `${obj.name}, ${hit?.text ?? ''}`,
      },
    };
    this.calls.push(call);
    this.callTruth.set(call.id, truth);
    return call;
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
      case 'start':
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
        }
        if (action.note !== undefined) inc.note = action.note;
        return;
      }
      case 'alarm':
        return this.alarm(player, action.incidentId, action.unitIds);
      case 'releaseUnit':
        return this.releaseUnit(action.unitId, true);
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
      case 'speakPermit':
        return this.speakPermit(action.unitId);
      case 'assignHospital':
        return this.assignHospital(action.unitId, action.hospitalId);
      case 'radio': {
        const u = this.unit(action.unitId);
        if (!u) return 'Fahrzeug nicht gefunden';
        const text = action.text.trim().slice(0, 300);
        if (!text) return;
        this.radioMsg(this.scn.ilsName, u.callsign, text, 'voice');
        if (!u.crewPlayerId) {
          this.after(this.rand(2500, 5000), () => this.radioMsg(u.callsign, this.scn.ilsName, 'Verstanden, kommen.', 'voice'));
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
    }
  }

  private answerCall(player: Player, callId: string): string | void {
    const call = this.calls.find((c) => c.id === callId);
    if (!call) return 'Anruf nicht gefunden';
    if (call.state !== 'ringing') return 'Anruf wurde bereits angenommen';
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
    this.addScore(Math.max(0, Math.round(15 - waited / 4)), `Notruf nach ${Math.round(waited)} s angenommen`);
    call.transcript.push({
      from: 'calltaker',
      text: 'Notruf Feuerwehr und Rettungsdienst. Wo genau ist der Notfallort?',
      t: this.time,
    });
    call.asked.push('wo');
    this.callerSays(call, this.fill(this.pick(truth.tpl.opening), truth));
    if (!truth.fake && this.rng() < 0.7) {
      this.after(4000, () => {
        if (call.state === 'active') this.callerSays(call, truth.spokenWhere, 1500);
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
    if (call.kind === 'bma') return;
    const truth = this.callTruth.get(call.id)!;
    let q: QuestionId | null = question === 'frei' ? null : question;
    let said = q ? questionText(q) : '';
    if (freeText) {
      said = freeText.slice(0, 300);
      q = classifyQuestion(freeText);
    }
    call.transcript.push({ from: 'calltaker', text: said, t: this.time });
    if (!q) {
      this.callerSays(call, this.pick(['Wie bitte? Ich versteh Sie nicht.', 'Was meinen Sie?', 'Hä? Bitte schicken Sie einfach jemanden!']));
      return;
    }
    if (!call.asked.includes(q)) call.asked.push(q);
    if (q === 'tcpr' && truth.tpl.tcpr && !truth.tcprGiven) {
      truth.tcprGiven = true;
      this.addScore(15, 'Telefonreanimation angeleitet');
    }
    const pool = truth.tpl.answers[q] ?? DEFAULT_ANSWERS[q];
    this.callerSays(call, this.fill(this.pick(pool), truth, call.phone), this.rand(1200, 2600));
  }

  private endCall(player: Player, callId: string): string | void {
    const call = this.calls.find((c) => c.id === callId);
    if (!call || call.state !== 'active') return 'Kein aktives Gespräch';
    if (call.takerId !== player.id) return 'Das Gespräch führt ein anderer Calltaker';
    call.state = 'ended';
    call.endedAt = this.time;
    call.typing = false;
    const truth = this.callTruth.get(call.id)!;
    if (!call.incidentId) {
      if (truth.fake) this.addScore(10, 'Fehlanruf korrekt ohne Einsatz beendet');
      else this.addScore(-25, 'Notruf beendet, ohne einen Einsatz anzulegen');
    }
  }

  private createIncident(player: Player, a: Extract<Action, { a: 'createIncident' }>): string | void {
    const sw = this.scn.stichworte.find((s) => s.code === a.stichwort);
    if (!sw) return 'Unbekanntes Stichwort';
    if (!isFinite(a.x) || !isFinite(a.y)) return 'Kein Einsatzort gewählt';
    let truth: Truth | undefined;
    let call: CallState | undefined;
    if (a.callId) {
      call = this.calls.find((c) => c.id === a.callId);
      if (!call) return 'Anruf nicht gefunden';
      if (call.incidentId) return 'Zu diesem Anruf gibt es bereits einen Einsatz';
      truth = this.callTruth.get(call.id);
    }
    const inc: IncidentState = {
      id: `i${++this.seq.inc}`,
      nr: `E-${String(this.seq.inc).padStart(6, '0')}`,
      stichwort: sw.code,
      label: sw.label,
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
    };
    this.log(inc, `Einsatz angelegt von ${player.name}: ${sw.code} ${sw.label}`);
    this.incidents.push(inc);
    this.score.incidentsCreated++;
    if (call) call.incidentId = inc.id;
    if (truth) {
      if (truth.fake) {
        this.addScore(-15, `${inc.nr}: Einsatz zu einem Fehlanruf angelegt`);
        truth = this.genericTruth(inc, 'An der Einsatzstelle nichts feststellbar, vermutlich Fehlanruf.');
      } else {
        // Wertung Stichwort
        const trueSw = this.scn.stichworte.find((s) => s.code === truth!.stichwort);
        if (truth.stichwort === sw.code) {
          this.score.stichwortCorrect++;
          this.addScore(20, `${inc.nr}: Stichwort ${sw.code} korrekt`);
        } else if (trueSw && trueSw.category === sw.category) {
          this.addScore(5, `${inc.nr}: Stichwort ${sw.code} vertretbar (besser ${trueSw.code})`);
        } else {
          this.addScore(-10, `${inc.nr}: Stichwort ${sw.code} falsch (richtig wäre ${truth.stichwort})`);
        }
        // Wertung Einsatzort
        const d = dist(truth.pos, inc);
        const tolerance = truth.tpl.where === 'ausserorts' || truth.tpl.where === 'autobahn' ? 1200 : 200;
        if (d <= tolerance) {
          this.score.addressCorrect++;
          this.addScore(10, `${inc.nr}: Einsatzort korrekt erfasst`);
        } else {
          this.addScore(-10, `${inc.nr}: Einsatzort ${Math.round(d)} m daneben`);
        }
      }
      this.incTruth.set(inc.id, truth);
    } else {
      this.incTruth.set(inc.id, this.genericTruth(inc, 'Keine besondere Lage, Einsatzstelle erkundet.'));
    }
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
    };
  }

  /** Alarmierungsvorschlag nach AAO: nächstgelegene freie Fahrzeuge */
  proposal(incidentId: string): { unitId: string; seconds: number; need: string }[] {
    const inc = this.incident(incidentId);
    if (!inc) return [];
    const sw = this.scn.stichworte.find((s) => s.code === inc.stichwort);
    if (!sw || inc.firstArrival) return [];
    return computeProposal(this.scn, this.graph, this.units, inc, sw.aao);
  }

  private alarm(player: Player, incidentId: string, unitIds: string[]): string | void {
    const inc = this.incident(incidentId);
    if (!inc) return 'Einsatz nicht gefunden';
    if (inc.status === 'abgeschlossen') return 'Einsatz ist abgeschlossen';
    const alarmed: string[] = [];
    for (const id of unitIds) {
      const u = this.unit(id);
      if (!u) continue;
      if (u.incidentId && u.incidentId !== inc.id) continue;
      if (u.incidentId === inc.id) continue;
      if (![1, 2].includes(u.baseStatus)) continue;
      u.incidentId = inc.id;
      u.task = 'alarmed';
      u.hint = `Alarm: ${inc.stichwort} ${inc.label} – ${inc.address}${inc.note ? ' – ' + inc.note : ''}`;
      const career = this.station(u).career || this.typeOf(u)?.org === 'RD';
      const atStation = u.status === 2 || u.baseStatus === 2;
      u.timer = u.crewPlayerId
        ? undefined
        : this.time + (atStation ? (career ? this.rand(40, 90) : this.rand(180, 330)) : this.rand(5, 12)) * 1000;
      inc.unitIds.push(u.id);
      alarmed.push(shortCallsign(u.callsign));
      this.radioMsg(this.scn.ilsName, u.callsign, `Alarmierung: ${inc.stichwort} ${inc.address}`, 'system');
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

  private releaseUnit(unitId: string, byDispatcher: boolean): string | void {
    const u = this.unit(unitId);
    if (!u) return 'Fahrzeug nicht gefunden';
    if (u.hasPatient) return 'Fahrzeug hat einen Patienten an Bord';
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
    u.speak = undefined;
    u.hint = undefined;
    if (u.task === 'alarmed' && u.status === 2) {
      u.task = 'station';
      u.baseStatus = 2;
      u.status = 2;
      u.timer = undefined;
      return;
    }
    this.returnToStation(u);
    if (inc) this.checkClose(inc);
  }

  private returnToStation(u: UnitState) {
    const st = this.station(u);
    u.task = 'returning';
    this.setStatus(u, 1);
    this.startRoute(u, st, false);
  }

  private setStatus(u: UnitState, s: FmsStatus, announce = true) {
    if (u.speak && !u.speak.answered && s !== 5) {
      u.baseStatus = s;
    } else {
      u.status = s;
      u.baseStatus = s;
    }
    if (announce) this.radioMsg(u.callsign, this.scn.ilsName, `Status ${s} – ${FMS_TEXT[s]}`, 'fms');
  }

  private requestSpeak(u: UnitState, kind: NonNullable<UnitState['speak']>['kind'], text: string) {
    if (u.speak && !u.speak.answered) {
      u.speak.text += ' ' + text;
      return;
    }
    u.speak = { kind, text, since: this.time, answered: false };
    if (u.status !== 5) u.baseStatus = u.status;
    u.status = 5;
    this.radioMsg(u.callsign, this.scn.ilsName, 'Status 5 – Sprechwunsch', 'fms');
  }

  private speakPermit(unitId: string): string | void {
    const u = this.unit(unitId);
    if (!u?.speak || u.speak.answered) return 'Kein Sprechwunsch offen';
    this.radioMsg(this.scn.ilsName, u.callsign, 'Sprechaufforderung, kommen.', 'voice');
    u.speak.answered = true;
    u.status = u.baseStatus;
    if (u.speak.kind === 'crew') {
      u.speak = undefined;
      return;
    }
    const text = `${this.scn.ilsName} von ${u.callsign}: ${u.speak.text}`;
    this.radioMsg(u.callsign, this.scn.ilsName, u.speak.text, 'voice');
    this.events.speech?.(text);
    const inc = u.incidentId ? this.incident(u.incidentId) : undefined;
    if (inc) this.log(inc, `Funk ${shortCallsign(u.callsign)}: ${u.speak.text}`);
    u.speak = undefined;
  }

  private assignHospital(unitId: string, hospitalId: string, byCrew = false): string | void {
    const u = this.unit(unitId);
    const h = this.scn.hospitals.find((x) => x.id === hospitalId);
    if (!u || !h) return 'Fahrzeug oder Klinik nicht gefunden';
    if (u.task !== 'awaitHospital') return `${u.callsign} wartet nicht auf eine Zielklinik`;
    if (u.speak && !u.speak.answered) this.speakPermit(u.id);
    u.hospitalId = h.id;
    if (!byCrew) this.radioMsg(this.scn.ilsName, u.callsign, `Fahren Sie ${h.name} an.`, 'voice');
    else this.radioMsg(u.callsign, this.scn.ilsName, `Wir fahren ${h.name} an.`, 'voice');
    const inc = u.incidentId ? this.incident(u.incidentId) : undefined;
    const truth = inc ? this.incTruth.get(inc.id) : undefined;
    const pat = truth?.patients.find((p) => p.unitId === u.id && !p.done);
    if (pat && inc) {
      if (h.specialties.includes(pat.specialty)) this.addScore(10, `${inc.nr}: passende Zielklinik (${pat.specialty})`);
      else this.addScore(-10, `${inc.nr}: ${h.name} hat keine ${pat.specialty}`);
      this.log(inc, `${shortCallsign(u.callsign)} Transport nach ${h.name}`);
    }
    if (u.crewPlayerId) {
      u.hint = `Zielklinik: ${h.name}. Status 7 drücken, sobald der Patient aufgenommen ist.`;
      return;
    }
    this.after(this.rand(60, 150) * 1000, () => this.departToHospital(u));
  }

  private departToHospital(u: UnitState) {
    const h = this.scn.hospitals.find((x) => x.id === u.hospitalId);
    if (!h || u.task !== 'awaitHospital') return;
    u.task = 'toHospital';
    this.setStatus(u, 7);
    this.startRoute(u, h, true);
  }

  private crewStatus(player: Player, s: FmsStatus): string | void {
    const u = player.unitId ? this.unit(player.unitId) : undefined;
    if (!u) return 'Kein Fahrzeug besetzt';
    switch (s) {
      case 3:
        if (u.task !== 'alarmed') return 'Kein offener Einsatzauftrag';
        u.timer = this.time;
        return;
      case 4:
        if (u.task !== 'onScene') return 'Noch nicht am Einsatzort';
        this.setStatus(u, 4);
        return;
      case 5:
        this.requestSpeak(u, 'crew', '(Sprechwunsch der Besatzung)');
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
        if (u.task === 'station' || u.task === 'free' || u.task === 'returning') {
          this.setStatus(u, 1);
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

  // ---------- Bewegung ----------
  private startRoute(u: UnitState, to: Vec, emergency: boolean) {
    const r = this.graph.route(u, to);
    if (!r) {
      u.route = [{ x: u.x, y: u.y }, { x: to.x, y: to.y }];
      u.eta = this.time + (dist(u, to) / 10) * 1000;
    } else {
      u.route = r.points;
      const factor = (emergency ? 1.2 : 1) * (this.typeOf(u)?.speedFactor ?? 1);
      u.eta = this.time + (r.seconds / factor) * 1000;
    }
    u.routeIdx = 0;
    const secs = Math.max(1, (u.eta - this.time) / 1000);
    this.speeds.set(u.id, polylineLength(u.route) / secs);
  }

  private move(u: UnitState, dtMs: number): boolean {
    if (!u.route) return false;
    let remaining = (this.speeds.get(u.id) ?? 10) * (dtMs / 1000);
    while (remaining > 0 && u.routeIdx < u.route.length - 1) {
      const target = u.route[u.routeIdx + 1];
      const d = dist(u, target);
      if (d > 0.01) u.heading = Math.atan2(target.y - u.y, target.x - u.x);
      if (d <= remaining) {
        u.x = target.x;
        u.y = target.y;
        u.routeIdx++;
        remaining -= d;
      } else {
        u.x += ((target.x - u.x) / d) * remaining;
        u.y += ((target.y - u.y) / d) * remaining;
        remaining = 0;
      }
    }
    if (u.routeIdx >= u.route.length - 1) {
      u.route = undefined;
      u.eta = undefined;
      return true;
    }
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

  private revealAndReport(inc: IncidentState, truth: Truth, u: UnitState) {
    if (!inc.lage) {
      inc.lage = truth.lage;
      this.log(inc, `Lage: ${truth.lage}`);
    }
    if (truth.reported) return;
    truth.reported = true;
    if (u.crewPlayerId) {
      u.hint = `Lage vor Ort: ${truth.lage} Bitte Lagemeldung an die Leitstelle geben (Status 5).`;
      truth.lastRequest = this.time;
      return;
    }
    this.after(this.rand(25, 60) * 1000, () => {
      if (u.incidentId !== inc.id) return;
      const missing = this.missingNeeds(inc, truth, false);
      const req = missing.length ? ` Wir fordern nach: ${missing.join(', ')}.` : ' Weitere Kräfte nicht erforderlich.';
      this.requestSpeak(u, missing.length ? 'nachforderung' : 'lage', `Lagemeldung: ${truth.lage}${req}`);
      truth.lastRequest = this.time;
    });
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
    if (!truth.reported) return;
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
      const text = `Patient transportbereit: ${p.desc}. Erbitten Zielklinik, benötigt ${p.specialty}.`;
      if (carrier.crewPlayerId) carrier.hint = `${text} Zielklinik wählen oder bei der Leitstelle erfragen.`;
      else
        this.after(this.rand(5, 40) * 1000, () => {
          if (carrier.task === 'awaitHospital' && !carrier.hospitalId) this.requestSpeak(carrier, 'zielklinik', text);
        });
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
      if (u === keep || truth.released?.has(u.id)) continue;
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

  private finishHospital(u: UnitState) {
    const inc = u.incidentId ? this.incident(u.incidentId) : undefined;
    const truth = inc ? this.incTruth.get(inc.id) : undefined;
    truth?.patients.forEach((p) => {
      if (p.unitId === u.id) p.done = true;
    });
    u.hasPatient = false;
    this.releaseUnit(u.id, false);
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
    this.log(inc, manual ? 'Einsatz manuell abgeschlossen' : 'Einsatz beendet');
    this.score.incidentsClosed++;
    const truth = this.incTruth.get(inc.id);
    if (truth?.workDone) this.addScore(10, `${inc.nr}: Einsatz erfolgreich abgearbeitet`);
    else if (manual && truth && truth.stichwort && truth.tpl !== BMA_TEMPLATE) this.addScore(-15, `${inc.nr}: Einsatz vorzeitig geschlossen`);
  }

  // ---------- Takt ----------
  tick(realDtMs: number) {
    if (!this.running) return;
    const dt = realDtMs * this.speed;
    this.time += dt;

    // geplante Ereignisse
    if (this.scheduled.length) {
      const due = this.scheduled.filter((s) => s.at <= this.time);
      this.scheduled = this.scheduled.filter((s) => s.at > this.time);
      for (const s of due) s.fn();
    }

    // neue Notrufe
    if (this.time >= this.nextCallAt) {
      if (this.calls.filter((c) => c.state === 'ringing').length < 4) this.spawnCall();
      this.nextCallAt = this.time + this.expDelay(this.scn.settings.callsPerHour);
    }
    if (this.time >= this.nextBmaAt) {
      this.spawnBma();
      this.nextBmaAt = this.time + this.expDelay(this.scn.settings.bmaPerHour);
    }

    // unbeantwortete Anrufe
    for (const c of this.calls) {
      if (c.state === 'ringing' && c.kind === '112' && this.time - c.ringStart > MISSED_AFTER_MS) {
        c.state = 'ended';
        c.missed = true;
        c.endedAt = this.time;
        this.score.callsMissed++;
        const truth = this.callTruth.get(c.id)!;
        if (!truth.fake) {
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
          this.returnToStation(u);
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
        if (arrived) {
          if (u.task === 'toScene') this.arrive(u);
          else if (u.task === 'toHospital') {
            u.task = 'atHospital';
            this.setStatus(u, 8);
            if (u.crewPlayerId) u.hint = 'Patient übergeben? Dann Status 1 drücken.';
            else u.timer = this.time + this.rand(5, 10) * 60_000;
          } else if (u.task === 'returning') {
            u.task = 'station';
            const st = this.station(u);
            u.x = st.x;
            u.y = st.y;
            this.setStatus(u, 2);
            u.hint = undefined;
          }
        }
      }
      if (u.task === 'atHospital' && !u.crewPlayerId && u.timer !== undefined && this.time >= u.timer) {
        u.timer = undefined;
        this.finishHospital(u);
      }
      if (u.speak && !u.speak.answered && this.time - u.speak.since > SPEAK_PENALTY_MS) {
        const key = `${u.id}:${u.speak.since}`;
        if (!this.penalized.has(key)) {
          this.penalized.add(key);
          this.addScore(-5, `Sprechwunsch von ${shortCallsign(u.callsign)} seit 3 min unbeantwortet`);
        }
      }
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
    // abgeschlossene Einsätze nach 10 min aus der Liste entfernen
    this.incidents = this.incidents.filter((i) => i.status !== 'abgeschlossen' || this.time - (i.closedAt ?? 0) < 600_000);
  }

  publicState(): PublicState {
    return {
      running: this.running,
      started: this.started,
      speed: this.speed,
      time: this.time,
      clockStart: this.scn.settings.startClock,
      players: this.players,
      calls: this.calls,
      incidents: this.incidents,
      // Route nicht vollständig übertragen, nur das Ziel
      units: this.units.map((u) => ({ ...u, route: u.route ? [u.route[u.route.length - 1]] : undefined })),
      radio: this.radio.slice(-120),
      score: this.score,
    };
  }
}


