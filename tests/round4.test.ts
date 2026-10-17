import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { generateScenario } from '../shared/mapgen';
import { applyFleetText, assignFleet, placeOf } from '../shared/fleet';
import { Game } from '../server/game';
import { TEMPLATES } from '../server/callgen';
import type { QuestionId, Scenario } from '../shared/types';

const wue = () => JSON.parse(gunzipSync(readFileSync(new URL('../assets/ils-wuerzburg.json.gz', import.meta.url))).toString()) as Scenario;
const run = (game: Game, ms: number) => {
  for (let t = 0; t < ms; t += 500) game.tick(500);
};

describe('Fahrzeugbelegung', () => {
  it('nutzt die bayerischen Kennzahlen in Würzburg', () => {
    const scn = wue();
    const all = scn.stations.flatMap((s) => s.vehicles);
    const kt = scn.stations.find((s) => s.name === 'FF Kitzingen')!;
    expect(kt.vehicles.map((v) => v.callsign)).toContain('Florian Kitzingen 30/1');
    expect(kt.vehicles.map((v) => v.callsign)).toContain('Florian Kitzingen 12/1');
    expect(all.filter((v) => v.type === 'NEF').length).toBe(8);
    expect(all.some((v) => /\b46\/1$/.test(v.callsign) && v.type === 'TSFW')).toBe(true);
    // Keine Vereins- oder Verwaltungszusätze in Funkrufnamen
    expect(all.filter((v) => /e\.V\.|Freiw|Stadt |a\.Main/.test(v.callsign))).toEqual([]);
    expect(scn.tmoGroups?.map((g) => g.name)).toContain('FW KT 1');
    expect(kt.tmo).toBe('fw_kt');
  });

  it('liest Ortsnamen aus Wachennamen', () => {
    expect(placeOf('Freiw. Feuerwehr Wü.-Lengfeld', ['Würzburg'])).toBe('Lengfeld');
    expect(placeOf('FF Gemünden a.Main')).toBe('Gemünden am Main');
    expect(placeOf('BRK Rettungswache Kitzingen')).toBe('Kitzingen');
  });

  it('übernimmt eine eingefügte Fahrzeugliste', () => {
    const scn = wue();
    const notes = applyFleetText(
      scn,
      `Wache Kitzingen
       Florian Kitzingen 11/1  MZF
       Florian Kitzingen 40/1  HLF 20
       Florian Kitzingen 30/1  DLK 23/12
       Rotkreuz Kitzingen 71/1 RTW
       Rotkreuz Kitzingen 71/2 RTW
       Sama Würzburg 71/1 RTW`,
    );
    expect(notes[0]).toMatch(/6 Fahrzeuge/);
    const kt = scn.stations.find((s) => s.name === 'FF Kitzingen')!;
    expect(kt.vehicles.map((v) => v.type)).toEqual(['MZF', 'HLF', 'DLK']);
    expect(scn.stations.some((s) => s.vehicles.some((v) => v.callsign === 'Sama Würzburg 71/1' && v.type === 'RTW'))).toBe(true);
  });

  it('verteilt generierte Karten nach Ortsgröße', () => {
    const scn = generateScenario({ seed: 3, towns: 6 });
    assignFleet(scn);
    expect(scn.stations.every((s) => s.vehicles.length > 0)).toBe(true);
    expect(scn.stations.some((s) => s.vehicles.some((v) => v.type === 'NEF'))).toBe(true);
  });
});

describe('Anrufer', () => {
  it('beantwortet alle Fragearten ohne Platzhalterreste', () => {
    const scn = generateScenario({ seed: 4711, towns: 8 });
    scn.settings.callsPerHour = 0;
    scn.settings.bmaPerHour = 0;
    const qs: QuestionId[] = ['wo', 'was', 'wer', 'wieviele', 'zustand', 'gefahr', 'alter', 'atmung', 'bewusstsein', 'seitwann', 'vorerkrankung', 'zugang', 'rueckruf', 'ortbestaetigen'];
    for (const tpl of TEMPLATES) {
      const game = new Game(structuredClone(scn), { seed: 9 });
      const p = game.addPlayer('CT', 'calltaker');
      game.handle(p.id, { a: 'start' });
      const call = game.spawnCall(tpl.id);
      if (!call) continue;
      game.handle(p.id, { a: 'answerCall', callId: call.id });
      for (const q of qs) {
        game.handle(p.id, { a: 'ask', callId: call.id, question: q });
        run(game, 3000);
      }
      const said = call.transcript.filter((l) => l.from === 'caller').map((l) => l.text);
      expect(said.length, tpl.id).toBeGreaterThanOrEqual(qs.length);
      expect(said.filter((t) => /[{}]/.test(t)), tpl.id).toEqual([]);
    }
  });

  it('beantwortet zwei Fragen in einem Satz', () => {
    const scn = generateScenario({ seed: 4711, towns: 8 });
    scn.settings.callsPerHour = 0;
    const game = new Game(scn, { seed: 2 });
    const p = game.addPlayer('CT', 'calltaker');
    game.handle(p.id, { a: 'start' });
    const call = game.spawnCall('rd_stroke')!;
    game.handle(p.id, { a: 'answerCall', callId: call.id });
    run(game, 8000);
    const before = call.transcript.length;
    game.handle(p.id, { a: 'ask', callId: call.id, question: 'was', text: 'Wie alt ist sie und atmet sie normal?' });
    run(game, 4000);
    const answer = call.transcript.slice(before).find((l) => l.from === 'caller')!.text;
    expect(answer).toMatch(/\d/);
    expect(answer.toLowerCase()).toMatch(/atm/);
  });
});

describe('Einsatzmaske und TMO', () => {
  it('legt an, alarmiert sofort und schaltet die Einsatz-Rufgruppe', () => {
    const scn = generateScenario({ seed: 4711, towns: 8 });
    scn.settings.callsPerHour = 0;
    scn.settings.bmaPerHour = 0;
    const game = new Game(scn, { seed: 1 });
    const p = game.addPlayer('D', 'dispatcher');
    game.handle(p.id, { a: 'start' });
    const town = scn.towns[0];
    const rtw = game.units.find((u) => u.type === 'RTW')!;
    expect(rtw.tmo).toBeTruthy();
    const e1 = scn.tmoGroups!.find((g) => g.use === 'Einsatz')!;
    expect(
      game.handle(p.id, {
        a: 'createIncident', stichwort: 'RD 1', address: 'Test', x: town.x, y: town.y, note: '', patients: 1,
        zusatz: '2. OG', melder: 'Huber', rueckruf: '0151 123', sondersignal: false, alarmUnitIds: [rtw.id],
      }),
    ).toBeUndefined();
    const inc = game.incidents[0];
    expect(inc.zusatz).toBe('2. OG');
    expect(inc.sondersignal).toBe(false);
    expect(inc.unitIds).toEqual([rtw.id]);
    game.handle(p.id, { a: 'updateIncident', incidentId: inc.id, tmo: e1.id });
    expect(rtw.tmo).toBe(e1.id);
    run(game, 8000);
    expect(game.radio.some((m) => m.group === e1.id && m.from === rtw.callsign)).toBe(true);
    game.handle(p.id, { a: 'releaseUnit', unitId: rtw.id });
    expect(rtw.tmo).not.toBe(e1.id);
  });
});
