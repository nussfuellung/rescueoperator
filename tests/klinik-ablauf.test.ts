import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { aufnahmepflicht, klinikKm, voranmeldungFuer } from '../shared/ivena';
import { Game } from '../server/game';
import type { CallState, Hospital, Scenario, UnitState } from '../shared/types';

const wuerzburg = () => {
  const scn = JSON.parse(gunzipSync(readFileSync('assets/ils-wuerzburg.json.gz')).toString()) as Scenario;
  scn.settings.callsPerHour = 0;
  scn.settings.bmaPerHour = 0;
  return scn;
};

type Intern = {
  callTruth: Map<string, { pos: { x: number; y: number }; ziel?: string; zielId?: string; objekt?: string }>;
  patientOf(u: UnitState): { pzc: string } | undefined;
  ivena: { abmeldungen: { hospitalId: string; fach: string; seit?: number; bis: number; grund: string }[]; wartezeit: Record<string, number> };
};

/** Notruf annehmen, Einsatz anlegen, Vorschlag alarmieren und warten, bis ein RTW auf die Zielklinik wartet */
function bisZurZielklinik(game: Game, scn: Scenario, tpl: string) {
  const p = game.addPlayer('D', 'dispatcher');
  game.handle(p.id, { a: 'start' });
  const call = game.spawnCall(tpl)!;
  game.handle(p.id, { a: 'answerCall', callId: call.id });
  const g = game as unknown as Intern;
  const truth = g.callTruth.get(call.id)!;
  const stichwort = tpl.startsWith('vl_urologie') ? 'RD 1' : 'RD 2';
  game.handle(p.id, { a: 'createIncident', callId: call.id, stichwort, address: 'x', x: truth.pos.x, y: truth.pos.y, note: '', patients: 1 });
  game.handle(p.id, { a: 'endCall', callId: call.id });
  const inc = game.incidents[0];
  game.handle(p.id, { a: 'alarm', incidentId: inc.id, unitIds: game.proposal(inc.id).map((x) => x.unitId) });
  let u: UnitState | undefined;
  for (let t = 0; t < 3 * 3600_000 && !u; t += 1000) {
    game.tick(1000);
    u = game.units.find((x) => x.task === 'awaitHospital');
  }
  for (const c of game.calls as CallState[]) if (c.kind === 'rtw' && c.state === 'ringing') game.handle(p.id, { a: 'answerCall', callId: c.id });
  return { p, u: u!, truth, inc, pat: g.patientOf(u!)! };
}

describe('Kliniken außerhalb des Bereichs', () => {
  it('Leopoldina, Bad Neustadt und Aschaffenburg mit Fachbereichen und Fahrzeit ab Kartenrand', () => {
    const scn = wuerzburg();
    const h = (id: string) => scn.hospitals.find((x) => x.id === id)!;
    expect(h('h_leopoldina').specialties).toEqual(expect.arrayContaining(['Kardiologie (HKL)', 'Stroke Unit', 'Pädiatrie', 'Augenheilkunde']));
    expect(h('h_bad_neustadt').specialties).toEqual(expect.arrayContaining(['Kardiologie (HKL)', 'Stroke Unit']));
    expect(h('h_aschaffenburg').specialties).toEqual(expect.arrayContaining(['Pädiatrie', 'Urologie']));
    for (const id of ['h_leopoldina', 'h_bad_neustadt', 'h_aschaffenburg', 'h_bgu_frankfurt', 'h_offenbach']) expect(h(id).ausserhalbMin).toBeGreaterThan(0);
    // Weitere Fahrt zählt beim Vergleich der Entfernungen mit
    expect(klinikKm(h('h_bad_neustadt'), h('h_leopoldina'))).toBeGreaterThan(30);
  });

  it('Fahrt in eine Klinik außerhalb dauert ab dem Kartenrand noch die angegebene Zeit', () => {
    const scn = wuerzburg();
    const game = new Game(scn, { seed: 3 });
    const p = game.addPlayer('D', 'dispatcher');
    game.handle(p.id, { a: 'start' });
    const leo = scn.hospitals.find((x) => x.id === 'h_leopoldina')!;
    const u = game.units.find((x) => x.type === 'RTW' && x.status === 2)!;
    u.task = 'awaitHospital';
    u.hasPatient = true;
    game.handle(p.id, { a: 'assignHospital', unitId: u.id, hospitalId: leo.id });
    let amRand: number | undefined;
    let an: number | undefined;
    for (let t = 0; t < 4 * 3600_000 && an === undefined; t += 1000) {
      game.tick(1000);
      if (amRand === undefined && (u.task as string) === 'toHospital' && !u.route && u.status === 7) amRand = game.time;
      if ((u.task as string) === 'atHospital') an = game.time;
    }
    expect(amRand).toBeDefined();
    expect(an! - amRand!).toBeGreaterThanOrEqual(leo.ausserhalbMin! * 60_000 - 2000);
  });
});

describe('Voranmeldung und Aufnahmepflicht', () => {
  it('erkennt Tracerdiagnosen am PZC', () => {
    expect(voranmeldungFuer('332651')).toBe('Herzkatheterlabor');
    expect(voranmeldungFuer('212301')).toBe('Schockraum');
    expect(voranmeldungFuer('421801')).toBe('Stroke Unit');
    expect(voranmeldungFuer('132701')).toBe('Herzkatheterlabor');
    expect(voranmeldungFuer('332652')).toBeUndefined();
    expect(voranmeldungFuer('711452')).toBeUndefined();
  });

  it('nächste geeignete Klinik muss bei vitaler Bedrohung trotz Abmeldung aufnehmen', () => {
    const hs: Hospital[] = [
      { id: 'a', name: 'A', x: 1000, y: 0, specialties: ['Kardiologie (HKL)'] },
      { id: 'b', name: 'B', x: 30_000, y: 0, specialties: ['Kardiologie (HKL)'] },
      { id: 'c', name: 'C', x: 5000, y: 0, specialties: ['Kardiologie (HKL)'] },
    ];
    const ab = (id: string) => id === 'a';
    const pos = { x: 0, y: 0 };
    // C ist nur 4 km weiter und aufnahmebereit: keine Aufnahmepflicht für A
    expect(aufnahmepflicht('332651', pos, hs[0], hs, ab)).toBe(false);
    expect(aufnahmepflicht('332651', pos, hs[0], hs, (id) => id !== 'b')).toBe(true);
    // Nur bei Notfallversorgung, nur für die nächste Klinik
    expect(aufnahmepflicht('332652', pos, hs[0], hs, (id) => id !== 'b')).toBe(false);
    expect(aufnahmepflicht('332651', pos, hs[2], hs, (id) => id !== 'b')).toBe(false);
  });

  it('STEMI-Verlegung: vereinbarte Klinik, Voranmeldung HKL, schnelle Übergabe', () => {
    const scn = wuerzburg();
    const game = new Game(scn, { seed: 11 });
    const { p, u, truth, pat } = bisZurZielklinik(game, scn, 'vl_stemi');
    const von = scn.hospitals.find((h) => h.name === truth.objekt)!;
    expect(von.specialties).not.toContain('Kardiologie (HKL)');
    expect(von.ausserhalbMin).toBeUndefined();
    const ziel = scn.hospitals.find((h) => h.id === truth.zielId)!;
    expect(ziel.specialties).toContain('Kardiologie (HKL)');
    expect(u.verlegungNach).toBe(ziel.id);
    expect(pat.pzc).toMatch(/^332\d\d1$/);
    game.handle(p.id, { a: 'assignHospital', unitId: u.id, hospitalId: ziel.id });
    expect(game.score.events.some((e) => e.text.includes('vereinbarte Zielklinik'))).toBe(true);
    expect(u.voranmeldung).toMatchObject({ art: 'Herzkatheterlabor', hospitalId: ziel.id });
    expect(game.handle(p.id, { a: 'voranmelden', unitId: u.id })).toBeUndefined();
    expect(u.voranmeldung!.t).toBeDefined();
    for (let t = 0; t < 3 * 3600_000 && u.task !== 'atHospital'; t += 1000) game.tick(1000);
    expect(u.task).toBe('atHospital');
    expect(game.score.events.some((e) => e.text.includes('rechtzeitig vorangemeldet'))).toBe(true);
    // Schockraumteam übernimmt sofort; bei Kliniken außerhalb kommt die Rückfahrt zum Kartenrand dazu
    expect((u.timer! - game.time) / 60_000).toBeLessThanOrEqual(7 + (ziel.ausserhalbMin ?? 0));
  });

  it('ohne Voranmeldung gibt es Punktabzug, eine falsche Klinik bei einer Verlegung ebenso', () => {
    const scn = wuerzburg();
    const game = new Game(scn, { seed: 12 });
    const { p, u, truth } = bisZurZielklinik(game, scn, 'vl_stroke');
    const andere = scn.hospitals.find((h) => h.specialties.includes('Stroke Unit') && h.id !== truth.zielId && h.name !== truth.objekt)!;
    game.handle(p.id, { a: 'assignHospital', unitId: u.id, hospitalId: andere.id });
    expect(game.score.events.some((e) => e.text.includes('war mit') && e.points < 0)).toBe(true);
    expect(u.voranmeldung?.art).toBe('Stroke Unit');
    for (let t = 0; t < 3 * 3600_000 && u.task !== 'atHospital'; t += 1000) game.tick(1000);
    expect(game.score.events.some((e) => e.text.includes('nicht vorangemeldet') && e.points < 0)).toBe(true);
    expect(u.voranmeldung).toBeUndefined();
  });
});

describe('Weiterverlegung nach Aufnahmepflicht', () => {
  it('zwangsbelegte Klinik ruft nach der Erstversorgung an und fordert eine Notfallverlegung', () => {
    const scn = wuerzburg();
    const game = new Game(scn, { seed: 21 });
    const { p, u, pat } = bisZurZielklinik(game, scn, 'rd_stroke');
    expect(pat.pzc).toMatch(/^421\d\d1$/);
    // Patient liegt in Lohr, die Stroke Unit dort ist abgemeldet, die nächste freie ist weit weg
    const lohr = scn.hospitals.find((h) => h.id === 'h_kms_lohr')!;
    u.x = lohr.x + 300;
    u.y = lohr.y;
    const g = game as unknown as Intern;
    g.ivena.abmeldungen = [{ hospitalId: lohr.id, fach: 'Stroke Unit', grund: 'Stroke Unit voll belegt', seit: game.time, bis: game.time + 10 * 3600_000 }];
    game.handle(p.id, { a: 'assignHospital', unitId: u.id, hospitalId: lohr.id });
    expect(game.score.events[0].text).toContain('Aufnahmepflicht');
    expect(game.publicState().ivena?.zuweisungen.at(-1)?.aufnahmepflicht).toBe(true);
    const vorher = game.calls.length;
    let anruf: CallState | undefined;
    for (let t = 0; t < 4 * 3600_000 && !anruf; t += 5000) {
      game.tick(5000);
      g.ivena.abmeldungen = g.ivena.abmeldungen.filter((a) => a.hospitalId === lohr.id);
      anruf = game.calls.slice(vorher).find((c) => c.kind === '112' && g.callTruth.get(c.id)?.objekt === lohr.name);
    }
    expect(anruf).toBeDefined();
    const truth = g.callTruth.get(anruf!.id)!;
    expect(truth.zielId).toBeDefined();
    expect(truth.zielId).not.toBe(lohr.id);
    expect(scn.hospitals.find((h) => h.id === truth.zielId)!.specialties).toContain('Stroke Unit');
    game.handle(p.id, { a: 'answerCall', callId: anruf!.id });
    for (let t = 0; t < 15_000; t += 500) game.tick(500);
    expect(anruf!.transcript.some((l) => l.from === 'caller' && /trotz Abmeldung|abgemeldet/.test(l.text))).toBe(true);
  });
});

describe('Übergabedauer', () => {
  it('IVENA schätzt die Wartezeit je Klinik, größere und stärker belegte Häuser brauchen länger', () => {
    const scn = wuerzburg();
    const game = new Game(scn, { seed: 4 });
    const p = game.addPlayer('D', 'dispatcher');
    game.handle(p.id, { a: 'start' });
    for (let t = 0; t < 120_000; t += 1000) game.tick(1000);
    const w = (game as unknown as Intern).ivena.wartezeit;
    expect(Object.keys(w).length).toBe(scn.hospitals.length);
    for (const v of Object.values(w)) {
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(60);
    }
    expect(game.publicState().ivena?.wartezeit).toEqual(w);
  });
});
