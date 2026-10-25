import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { decodePzc, pzcFuer, zielFach } from '../shared/pzc';
import { generateScenario } from '../shared/mapgen';
import { Game } from '../server/game';
import type { CallState, Scenario, UnitState } from '../shared/types';

describe('IVENA-Fachbereiche', () => {
  it('ordnet Urologie, Gynäkologie, Geburtshilfe, HNO, Augen und Psychiatrie zu', () => {
    expect(decodePzc('711452')!.fach).toBe('Urologie');
    expect(decodePzc('263302')!.fach).toBe('Urologie');
    expect(decodePzc('551352')!.fach).toBe('Gynäkologie');
    expect(decodePzc('536281')!.fach).toBe('Geburtshilfe');
    expect(decodePzc('546302')!.fach).toBe('Geburtshilfe');
    expect(decodePzc('731702')!.fach).toBe('HNO');
    expect(decodePzc('721402')!.fach).toBe('Augenheilkunde');
    expect(decodePzc('432302')!.fach).toBe('Psychiatrie');
    expect(decodePzc('435802')!.fach).toBe('Innere Medizin');
    expect(pzcFuer('V. a. Nierenkolik rechts', 'Urologie', 45)).toBe('711452');
    expect(pzcFuer('Starke vaginale Blutung, nicht schwanger', 'Gynäkologie', 35).slice(0, 3)).toBe('551');
    expect(pzcFuer('Platzwunde Augenbraue nach Schlägerei', 'Chirurgie', 25).slice(0, 3)).toBe('219');
  });

  it('kennt das Klinikum Main-Spessart Lohr und die neuen Fachbereiche in der Musterleitstelle', () => {
    const scn = JSON.parse(gunzipSync(readFileSync(new URL('../assets/ils-wuerzburg.json.gz', import.meta.url))).toString()) as Scenario;
    const lohr = scn.hospitals.find((h) => h.name === 'Klinikum Main-Spessart Lohr');
    expect(lohr?.specialties).toEqual(expect.arrayContaining(['Kardiologie (HKL)', 'Stroke Unit', 'Urologie', 'Gynäkologie']));
    for (const fach of ['Urologie', 'Gynäkologie', 'Geburtshilfe', 'HNO', 'Psychiatrie'])
      expect(scn.hospitals.filter((h) => h.specialties.includes(fach)).length, fach).toBeGreaterThanOrEqual(2);
    // Brandverletzte nach Frankfurt oder Offenbach; ohne Zentrum Erstversorgung in der Unfallchirurgie
    expect(scn.hospitals.filter((h) => h.specialties.includes('Verbrennungen')).map((h) => h.id).sort()).toEqual(['h_bgu_frankfurt', 'h_offenbach']);
    expect(zielFach('Verbrennungen', scn.hospitals)).toBe('Verbrennungen');
    expect(zielFach('Verbrennungen', scn.hospitals.filter((h) => !h.specialties.includes('Verbrennungen')))).toBe('Unfallchirurgie');
    expect(scn.hospitals.find((h) => h.id === 'h_kms_lohr')!.specialties).not.toContain('Augenheilkunde');
    expect(zielFach('Urologie', scn.hospitals)).toBe('Urologie');
  });
});

describe('Patientenanmeldung per Telefon', () => {
  it('RTW ruft mit PZC an, die Zielklinik wird im Gespräch zugewiesen', () => {
    const scn = generateScenario({ seed: 4711, towns: 8 });
    scn.settings.callsPerHour = 0;
    scn.settings.bmaPerHour = 0;
    const game = new Game(scn, { seed: 5 });
    const p = game.addPlayer('D', 'dispatcher');
    game.handle(p.id, { a: 'start' });
    const call = game.spawnCall('rd_nierenkolik')!;
    game.handle(p.id, { a: 'answerCall', callId: call.id });
    const truth = (game as unknown as { callTruth: Map<string, { pos: { x: number; y: number } }> }).callTruth.get(call.id)!;
    game.handle(p.id, { a: 'createIncident', callId: call.id, stichwort: 'RD 2', address: 'x', x: truth.pos.x, y: truth.pos.y, note: '', patients: 1 });
    game.handle(p.id, { a: 'endCall', callId: call.id });
    const inc = game.incidents[0];
    game.handle(p.id, { a: 'alarm', incidentId: inc.id, unitIds: game.proposal(inc.id).map((x) => x.unitId) });
    let u: UnitState | undefined;
    for (let t = 0; t < 3 * 3600_000 && !u; t += 1000) {
      game.tick(1000);
      u = game.units.find((x) => x.task === 'awaitHospital');
    }
    // Noch nicht gemeldet: Der PZC ist in der Leitstelle unbekannt
    expect(u?.pzc).toBeUndefined();
    const pat = (game as unknown as { patientOf: (u: UnitState) => { pzc: string } }).patientOf.bind(game)(u!);
    expect(pat.pzc).toMatch(/^711\d\d2$/);
    const ring = (game as unknown as { ringRtw: (u: UnitState, p: { pzc: string; desc: string }) => CallState }).ringRtw.bind(game);
    const rtw = ring(u!, { pzc: pat.pzc, desc: 'V. a. Nierenkolik rechts' });
    expect(rtw.kind).toBe('rtw');
    expect(u!.pzc).toBeUndefined();
    game.handle(p.id, { a: 'answerCall', callId: rtw.id });
    expect(u!.pzc).toBe(pat.pzc);
    expect(rtw.transcript.some((l) => l.from === 'caller' && l.text.includes('PZC 7 1 1'))).toBe(true);
    // Eine Patientenanmeldung ist kein Notruf: kein Einsatz daraus
    expect(game.handle(p.id, { a: 'createIncident', callId: rtw.id, stichwort: 'RD 1', address: 'x', x: 0, y: 0, note: '', patients: 1 })).toBeTruthy();
    const h = scn.hospitals.find((x) => x.specialties.includes('Urologie'))!;
    game.handle(p.id, { a: 'assignHospital', unitId: u!.id, hospitalId: h.id });
    expect(rtw.state).toBe('ended');
    expect(rtw.transcript.at(-1)!.text).toContain(h.name);
    expect(u!.hospitalId).toBe(h.id);
  });

  it('meldet sich über Funk, wenn niemand abnimmt', () => {
    const scn = generateScenario({ seed: 4711, towns: 8 });
    scn.settings.callsPerHour = 0;
    scn.settings.bmaPerHour = 0;
    const game = new Game(scn, { seed: 5 });
    const p = game.addPlayer('D', 'dispatcher');
    game.handle(p.id, { a: 'start' });
    const u = game.units.find((x) => x.type === 'RTW')!;
    u.task = 'awaitHospital';
    u.pzc = '711452';
    const ring = (game as unknown as { ringRtw: (u: UnitState, p: { pzc: string; desc: string }) => CallState }).ringRtw.bind(game);
    const rtw = ring(u, { pzc: '711452', desc: 'Nierenkolik' });
    for (let t = 0; t < 120_000; t += 1000) game.tick(1000);
    expect(rtw.state).toBe('ended');
    expect(rtw.missed).toBe(true);
    expect(u.speak?.kind).toBe('zielklinik');
  });

  it('zeigt den PZC erst nach der Meldung über Funk', () => {
    const scn = generateScenario({ seed: 4711, towns: 8 });
    scn.settings.callsPerHour = 0;
    scn.settings.bmaPerHour = 0;
    const game = new Game(scn, { seed: 5 });
    const p = game.addPlayer('D', 'dispatcher');
    game.handle(p.id, { a: 'start' });
    const call = game.spawnCall('rd_nierenkolik')!;
    game.handle(p.id, { a: 'answerCall', callId: call.id });
    const truth = (game as unknown as { callTruth: Map<string, { pos: { x: number; y: number } }> }).callTruth.get(call.id)!;
    game.handle(p.id, { a: 'createIncident', callId: call.id, stichwort: 'RD 2', address: 'x', x: truth.pos.x, y: truth.pos.y, note: '', patients: 1 });
    game.handle(p.id, { a: 'endCall', callId: call.id });
    const inc = game.incidents[0];
    game.handle(p.id, { a: 'alarm', incidentId: inc.id, unitIds: game.proposal(inc.id).map((x) => x.unitId) });
    let u: UnitState | undefined;
    for (let t = 0; t < 3 * 3600_000 && !u; t += 1000) {
      game.tick(1000);
      u = game.units.find((x) => x.task === 'awaitHospital');
    }
    expect(u).toBeTruthy();
    // Bis die Besatzung sich meldet, taucht kein PZC auf, auch nicht in der Lage für die Clients
    for (let t = 0; t < 120_000 && !u!.speak?.text.includes('PZC') && !game.calls.some((c) => c.kind === 'rtw'); t += 1000) {
      expect(u!.pzc).toBeUndefined();
      game.tick(1000);
    }
    expect(game.publicState().units.find((x) => x.id === u!.id)!.pzc).toBeUndefined();
    const rtw = game.calls.find((c) => c.kind === 'rtw');
    if (rtw) game.handle(p.id, { a: 'answerCall', callId: rtw.id });
    else game.handle(p.id, { a: 'speakPermit', unitId: u!.id });
    expect(u!.pzc).toMatch(/^711\d\d2$/);
  });
});
