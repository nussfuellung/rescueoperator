import { describe, expect, it } from 'vitest';
import { generateScenario } from '../shared/mapgen';
import { Game } from '../server/game';
import type { UnitState } from '../shared/types';

const setup = () => {
  const scn = generateScenario({ seed: 4711, towns: 8 });
  scn.settings.callsPerHour = 0;
  scn.settings.bmaPerHour = 0;
  const game = new Game(scn, { seed: 5 });
  const p = game.addPlayer('D', 'dispatcher');
  game.handle(p.id, { a: 'start' });
  const [a, b] = scn.towns;
  game.handle(p.id, { a: 'createIncident', stichwort: 'RD 1', address: a.name, x: a.x, y: a.y, note: '', patients: 1 });
  game.handle(p.id, { a: 'createIncident', stichwort: 'RD 1', address: b.name, x: b.x, y: b.y, note: '', patients: 0 });
  const [alt, neu] = game.incidents;
  // Ein RTW übergibt seinen Patienten aus dem ersten Einsatz in der Klinik nahe dem zweiten Einsatzort,
  // alle anderen RTW sind nicht einsatzbereit
  const rtws = game.units.filter((u) => u.type === 'RTW');
  const u = rtws[0];
  for (const x of rtws.slice(1)) x.status = x.baseStatus = 6;
  const hosp = scn.hospitals[0];
  Object.assign(u, { incidentId: alt.id, task: 'atHospital', status: 8, baseStatus: 8, hospitalId: hosp.id, hasPatient: true, x: b.x, y: b.y, timer: game.time + 4 * 60_000 } satisfies Partial<UnitState>);
  alt.unitIds.push(u.id);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const truth = (game as any).incTruth.get(alt.id);
  truth.patients = [{ pzc: '123', desc: 'Patient', unitId: u.id, done: false }];
  return { game, p, u, alt, neu };
};

describe('Status 8 im Einsatzvorschlag', () => {
  it('schlägt ein Fahrzeug in Status 8 vor und rechnet den Rest der Übergabe ein', () => {
    const { game, u, neu } = setup();
    const prop = game.proposal(neu.id).find((x) => x.unitId === u.id);
    expect(prop?.s8).toBe(true);
    expect(prop!.seconds).toBeGreaterThanOrEqual(4 * 60 - 1);
  });

  it('beendet bei Alarmierung die Übergabe und fährt nach der Restzeit von der Klinik los', () => {
    const { game, p, u, alt, neu } = setup();
    expect(game.handle(p.id, { a: 'alarm', incidentId: neu.id, unitIds: [u.id] })).toBeUndefined();
    expect(u.incidentId).toBe(neu.id);
    expect(u.task).toBe('alarmed');
    expect(u.hasPatient).toBe(false);
    expect(u.hospitalId).toBeUndefined();
    expect(alt.unitIds).not.toContain(u.id);
    expect(alt.log.some((l) => /Übergabe beendet/.test(l.text))).toBe(true);
    const t0 = game.time;
    for (let t = 0; t < 600_000 && u.task === 'alarmed'; t += 1000) game.tick(1000);
    expect(u.task).toBe('toScene');
    expect(u.status).toBe(3);
    expect(game.time - t0).toBeGreaterThan(3 * 60_000);
  });

  it('Besatzung meldet nach Alarmierung aus Status 8 per Funk, wann sie losfährt', () => {
    const { game, p, u, neu } = setup();
    game.handle(p.id, { a: 'alarm', incidentId: neu.id, unitIds: [u.id] });
    for (let t = 0; t < 10_000; t += 1000) game.tick(1000);
    const msg = game.radio.find((m) => m.from === u.callsign && m.kind === 'voice');
    expect(msg?.text).toMatch(/(Übergabe|übergeben).*in etwa 4 Minuten/);
  });

  it('Infektionstransport: nicht im Vorschlag, danach Status 6 zur Desinfektion und wieder Status 2', () => {
    const { game, p, u, neu } = setup();
    u.infektion = true;
    expect(game.proposal(neu.id).some((x) => x.unitId === u.id)).toBe(false);
    expect(game.handle(p.id, { a: 'alarm', incidentId: neu.id, unitIds: [u.id] })).toBeDefined();
    // Übergabe endet regulär
    for (let t = 0; t < 300_000 && u.task === 'atHospital'; t += 1000) game.tick(1000);
    expect(u.task).toBe('returning');
    expect(u.baseStatus).toBe(6);
    expect(u.desinfektion).toBeDefined();
    expect(u.speak?.text).toMatch(/Desinfektion/);
    game.handle(p.id, { a: 'speakPermit', unitId: u.id });
    for (let t = 0; t < 3_600_000 && u.task === 'returning'; t += 1000) game.tick(1000);
    expect(u.task).toBe('station');
    expect(u.status).toBe(6);
    const bis = u.desinfektion!.bis!;
    expect(bis - game.time).toBeGreaterThanOrEqual(30 * 60_000 - 1000);
    for (let t = 0; t < 3_700_000 && u.desinfektion; t += 1000) game.tick(1000);
    expect(u.desinfektion).toBeUndefined();
    expect(u.baseStatus).toBe(2);
  });

  it('lässt sich per Sprechfunk aus Status 8 alarmieren und meldet die Restzeit', () => {
    const { game, p, u, alt, neu } = setup();
    const r = game.radioReply(u, `${u.callsign} von Leitstelle, übernehmen Sie den Einsatz ${neu.address}`, p);
    expect(r).toMatch(/(Übergabe|übergeben).*in etwa 4 Minuten/);
    expect(u.incidentId).toBe(neu.id);
    expect(u.hasPatient).toBe(false);
    expect(alt.unitIds).not.toContain(u.id);
    // Keine zweite Rückmeldung hinterher
    for (let t = 0; t < 10_000; t += 1000) game.tick(1000);
    expect(game.radio.filter((m) => m.from === u.callsign && m.kind === 'voice').length).toBe(0);
  });

  it('lehnt die Funkalarmierung bei Infektionstransport ab', () => {
    const { game, p, u, neu } = setup();
    u.infektion = true;
    expect(game.radioReply(u, `${u.callsign} von Leitstelle, übernehmen Sie den Einsatz ${neu.address}`, p)).toMatch(/Desinfektion/);
    expect(u.incidentId).not.toBe(neu.id);
  });
});

