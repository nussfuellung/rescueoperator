import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { Game } from '../server/game';
import { generateScenario } from '../shared/mapgen';
import { findeKlinik, findeRufgruppe, istFrage, istQuittung, zerlegeFunkspruch } from '../shared/funkspruch';
import { postProcess } from '../shared/speechfix';
import type { Scenario } from '../shared/types';

const wue = () => JSON.parse(gunzipSync(readFileSync(new URL('../assets/ils-wuerzburg.json.gz', import.meta.url))).toString()) as Scenario;
const FUNK_NRS = [10, 11, 40, 43, 44, 71, 72, 76];
/** So kommt ein gesprochener Satz aus der Spracherkennung: klein, ohne Satzzeichen, Zahlen als Ziffern */
const gesprochen = (s: string) => postProcess(s, undefined, FUNK_NRS);

describe('Funkspruch zerlegen', () => {
  const cs = 'Rotkreuz Arnstein 71/1';
  it('trennt Rufname, Absender und Schlussformel ab', () => {
    for (const s of [
      'Rotkreuz Arnstein 71/1 von Leitstelle Würzburg, wo befinden Sie sich, kommen.',
      gesprochen('rotkreuz arnstein einundsiebzig eins von leitstelle würzburg wo befinden sie sich kommen'),
      gesprochen('rotkreuz arnstein einundsiebzig strich eins hier ist die integrierte leitstelle würzburg wo befinden sie sich kommen'),
      gesprochen('leitstelle würzburg für einundsiebzig eins wo befinden sie sich kommen'),
      'Arnstein 71/1, Leitstelle: wo befinden Sie sich? Kommen',
    ]) {
      const f = zerlegeFunkspruch(s, cs, 'ILS Würzburg');
      expect(f.text, s).toBe('wo befinden sie sich');
      expect(f.kommen).toBe(true);
    }
    expect(zerlegeFunkspruch(gesprochen('rotkreuz arnstein einundsiebzig eins von leitstelle kommen'), cs, 'ILS Würzburg').text).toBe('');
    expect(zerlegeFunkspruch('Verstanden, Ende', cs).ende).toBe(true);
  });

  it('erkennt Fragen ohne Fragezeichen und reine Quittungen', () => {
    const q = (s: string) => istFrage(zerlegeFunkspruch(s, 'Florian Kist 46/1'));
    expect(q('wo seid ihr gerade')).toBe(true);
    expect(q('habt ihr einen patienten')).toBe(true);
    expect(q('sind sie schon vor ort')).toBe(true);
    expect(q('fahren sie zur wache')).toBe(false);
    expect(istQuittung('verstanden danke')).toBe(true);
    expect(istQuittung('alles klar danke für die info')).toBe(true);
    expect(istQuittung('verstanden fahren sie zur wache')).toBe(false);
  });

  it('findet Kliniken und Rufgruppen im Funkspruch', () => {
    const scn = wue();
    const k = (s: string) => findeKlinik(s, scn.hospitals)?.name;
    expect(k('fahren sie das juliusspital an')).toBe('Juliusspital');
    expect(k('transport in die uniklinik')).toBe('Universitätsklinikum Würzburg');
    expect(k('fahren sie die missioklinik an')).toBe('KWM-Missioklinik');
    expect(k('bitte nach ochsenfurt')).toBe('Main-Klinik Ochsenfurt');
    expect(k('fahren sie lohr an')).toBeUndefined(); // zwei Kliniken in Lohr
    expect(k('wo seid ihr gerade')).toBeUndefined();
    const g = (s: string) => findeRufgruppe(s, scn.tmoGroups!)?.id;
    expect(g('wechseln sie in rufgruppe 3713')).toBe('rd_wue_l');
    expect(g(gesprochen('wechseln sie in siebenunddreißig siebenunddreißig'))).toBe('rd_wue');
    expect(g('gehen sie in fw kt 1')).toBe('fw_kt');
  });
});

describe('Antworten der Besatzungen', () => {
  it('versteht typische Funksprüche, getippt wie gesprochen', () => {
    const game = new Game(wue(), { seed: 2 });
    const u = game.units.find((x) => x.type === 'RTW' && x.status === 2)!;
    const kopf = `${u.callsign} von Leitstelle Würzburg, `;
    const faelle: [string, RegExp][] = [
      ['', /hört|kommen/],
      ['wo befinden sie sich', /Wache/],
      ['wo stehen sie gerade', /Wache/],
      ['wie ist ihr standort', /Wache/],
      ['welchen status haben sie', /Status 2/],
      ['wann sind sie vor ort', /ohne Einsatz/],
      ['wie weit seid ihr noch weg', /ohne Einsatz/],
      ['haben sie einen patienten an bord', /keinen Patienten/],
      ['geben sie mir eine lagemeldung', /keinen Einsatz/],
      ['wie sieht es vor ort aus', /keinen Einsatz/],
      ['brauchen sie noch weitere kräfte', /vor Ort beurteilen/],
      ['ist ein notarzt bei ihnen', /ohne Notarzt/],
      ['sind sie einsatzbereit', /^Ja.*Status 2/],
      ['können sie einen einsatz übernehmen', /^Ja/],
      ['rücken sie ein', /bereits auf der Wache/],
      ['fahren sie ohne sondersignal weiter', /ohne Sondersignal/],
      ['wie viele leute haben sie an bord', /Besatzung 0\/2/],
      ['was gibt es denn noch so neues', /wiederholen|melden uns/],
    ];
    for (const [s, re] of faelle) {
      expect(game.radioReply(u, `${kopf}${s}, kommen.`), s).toMatch(re);
      expect(game.radioReply(u, gesprochen(`${kopf.toLowerCase().replace(/[,/]/g, ' ').replace('71 1', 'einundsiebzig eins')}${s} kommen`)), `gesprochen: ${s}`).toMatch(re);
    }
    // Quittungen bleiben unbeantwortet
    expect(game.radioReply(u, 'Verstanden, Ende.')).toBeNull();
    expect(game.radioReply(u, `${u.callsign} von Leitstelle, danke für die Info, Ende`)).toBeNull();
    // Gruppenwechsel per Sprechfunk
    expect(game.radioReply(u, 'wechseln sie in rufgruppe 3737')).toMatch(/In 3737 RD_WÜ/);
    expect(u.tmo).toBe('rd_wue');
  });

  it('Einsatz per Funk: Eintreffzeit, Sprechaufforderung, Zielklinik und Abbruch', () => {
    const scn = generateScenario({ seed: 4711, towns: 8 });
    scn.settings.callsPerHour = 0;
    scn.settings.bmaPerHour = 0;
    const game = new Game(scn, { seed: 2 });
    const dp = game.addPlayer('Disponent', 'dispatcher');
    game.handle(dp.id, { a: 'start' });
    const call = game.spawnCall('rd_fall')!;
    game.handle(dp.id, { a: 'answerCall', callId: call.id });
    const truth = (game as unknown as { callTruth: Map<string, { pos: { x: number; y: number } }> }).callTruth.get(call.id)!;
    game.handle(dp.id, { a: 'createIncident', callId: call.id, stichwort: 'RD 1', address: 'Test', x: truth.pos.x, y: truth.pos.y, note: '', patients: 1 });
    game.handle(dp.id, { a: 'endCall', callId: call.id });
    const inc = game.incidents[0];
    game.handle(dp.id, { a: 'alarm', incidentId: inc.id, unitIds: game.proposal(inc.id).map((p) => p.unitId) });
    const rtw = game.units.find((u) => inc.unitIds.includes(u.id) && u.type === 'RTW')!;
    let guard = 0;
    while (rtw.task !== 'toScene' && guard++ < 1000) game.tick(500);
    expect(game.radioReply(rtw, 'wann seid ihr da')).toMatch(/Eintreffen in etwa \d+ Minuten/);
    expect(game.radioReply(rtw, 'wo seid ihr')).toMatch(/Eintreffen/);

    // Sprechwünsche per Funkanruf beantworten, bis die Besatzung eine Zielklinik erbittet
    guard = 0;
    while (rtw.task !== 'awaitHospital' && guard++ < 20000) {
      game.tick(500);
      if (rtw.speak && !rtw.speak.answered && (rtw.task as string) !== 'awaitHospital') {
        const said = rtw.speak.text;
        expect(game.radioReply(rtw, `${rtw.callsign} von Leitstelle kommen`)).toBeNull();
        expect(game.radio.some((m) => m.from === rtw.callsign && m.text === said)).toBe(true);
        expect(game.radio.at(-2)?.text).not.toMatch(/Sprechaufforderung/);
      }
    }
    expect(rtw.task).toBe('awaitHospital');
    expect(game.radioReply(rtw, 'welche klinik soll ich anfahren')).toMatch(/Patient|PZC/);
    const h = scn.hospitals[0];
    game.handle(dp.id, { a: 'radio', unitId: rtw.id, text: `${rtw.callsign}, fahren Sie ${h.name} an, kommen.` });
    for (let i = 0; i < 12; i++) game.tick(500);
    expect(rtw.hospitalId).toBe(h.id);
    expect(rtw.speak?.answered ?? true).toBe(true);
    expect(game.radio.filter((m) => m.from === rtw.callsign).at(-1)?.text).toMatch(/verstanden/i);
    expect(game.radio.filter((m) => /Fahren Sie .* an\.$/.test(m.text) && m.from !== rtw.callsign).length).toBe(0);
    guard = 0;
    while (rtw.task === 'awaitHospital' && guard++ < 2000) game.tick(500);
    expect(rtw.task).toBe('toHospital');
    expect(game.radioReply(rtw, 'brechen sie ab')).toMatch(/Patienten an Bord/);
  });

  it('Einsatzabbruch per Funk nimmt das Fahrzeug aus dem Einsatz', () => {
    const scn = generateScenario({ seed: 4711, towns: 8 });
    scn.settings.callsPerHour = 0;
    scn.settings.bmaPerHour = 0;
    const game = new Game(scn, { seed: 3 });
    const dp = game.addPlayer('Disponent', 'dispatcher');
    game.handle(dp.id, { a: 'start' });
    const town = scn.towns[2];
    game.handle(dp.id, { a: 'createIncident', stichwort: 'RD 1', address: 'Test', x: town.x, y: town.y, note: '', patients: 1, alarmAao: true });
    const inc = game.incidents[0];
    const u = game.units.find((x) => inc.unitIds.includes(x.id))!;
    for (let i = 0; i < 60; i++) game.tick(500);
    expect(game.radioReply(u, gesprochen('einsatzabbruch rücken sie ein'))).toMatch(/Abbruch|brechen ab/);
    expect(u.incidentId).toBeUndefined();
    expect(['returning', 'station']).toContain(u.task);
  });
});

describe('Notarzt abkömmlich', () => {
  type Truth = { patients: { pzc: string; done: boolean; unitId?: string }[]; needs: Record<string, number>; erkundet?: boolean; workDone?: boolean };
  function einsatzMitNotarzt(seed: number, arztbegleitung: boolean) {
    const scn = generateScenario({ seed: 4711, towns: 8 });
    scn.settings.callsPerHour = 0;
    scn.settings.bmaPerHour = 0;
    const game = new Game(scn, { seed });
    const dp = game.addPlayer('Disponent', 'dispatcher');
    game.handle(dp.id, { a: 'start' });
    const call = game.spawnCall('rd_fall')!;
    game.handle(dp.id, { a: 'answerCall', callId: call.id });
    const pos = (game as unknown as { callTruth: Map<string, { pos: { x: number; y: number } }> }).callTruth.get(call.id)!.pos;
    game.handle(dp.id, { a: 'createIncident', callId: call.id, stichwort: 'RD 2', address: 'Test', x: pos.x, y: pos.y, note: '', patients: 1 });
    game.handle(dp.id, { a: 'endCall', callId: call.id });
    const inc = game.incidents[0];
    const truth = (game as unknown as { incTruth: Map<string, Truth> }).incTruth.get(inc.id)!;
    const rtw = game.units.find((u) => u.type === 'RTW' && u.status === 2)!;
    const nef = game.units.find((u) => u.type === 'NEF' && u.status === 2)!;
    game.handle(dp.id, { a: 'alarm', incidentId: inc.id, unitIds: [rtw.id, nef.id] });
    truth.needs = { RTW: 1, NEF: 1 };
    for (const p of truth.patients) p.pzc = p.pzc.slice(0, 5) + (arztbegleitung ? '1' : '2');
    return { game, dp, inc, truth, rtw, nef, scn };
  }

  it('NEF in der Anfahrt verweist aufs Umdisponieren, vor Ort ohne Arztbegleitung wird es frei', () => {
    const { game, inc, truth, rtw, nef } = einsatzMitNotarzt(5, false);
    let guard = 0;
    while (nef.task !== 'toScene' && guard++ < 1000) game.tick(500);
    expect(game.radioReply(nef, 'sind sie abkömmlich')).toMatch(/Anfahrt.*umdisponieren/);
    guard = 0;
    while (!(nef.task === 'onScene' && truth.erkundet && rtw.task === 'onScene') && guard++ < 20000) game.tick(500);
    expect(nef.task).toBe('onScene');
    const antwort = game.radioReply(rtw, gesprochen('rotkreuz von leitstelle ist der notarzt abkömmlich kommen'))!;
    if (/notärztlich versorgt/.test(antwort)) {
      // Noch in der Versorgung: Restzeit wird genannt, das NEF bleibt
      expect(antwort).toMatch(/in etwa \d+ Minuten/);
      expect(nef.incidentId).toBe(inc.id);
      truth.workDone = true;
      expect(game.radioReply(nef, 'Ist der Notarzt abkömmlich?')).toMatch(/^Ja/);
    } else expect(antwort).toMatch(/^Ja, Notarzt ist abkömmlich/);
    expect(nef.incidentId).toBeUndefined();
    expect(nef.status).toBe(1);
    expect(truth.needs.NEF).toBe(0);
  });

  it('begleitender Notarzt fährt in Status 7 mit und ist erst nach der Übergabe abkömmlich', () => {
    const { game, dp, rtw, nef, scn } = einsatzMitNotarzt(6, true);
    let guard = 0;
    while (rtw.task !== 'awaitHospital' && guard++ < 20000) {
      game.tick(500);
      for (const u of [rtw, nef]) if (u.speak && !u.speak.answered) game.handle(dp.id, { a: 'speakPermit', unitId: u.id });
    }
    expect(rtw.task).toBe('awaitHospital');
    expect(nef.begleitet).toBe(rtw.id);
    expect(game.radioReply(nef, 'können sie sich für einen folgeeinsatz frei machen')).toMatch(/notarztpflichtig/);
    expect(game.radioReply(rtw, 'ist ein notarzt bei euch an bord')).toMatch(/begleitet/);
    game.handle(dp.id, { a: 'assignHospital', unitId: rtw.id, hospitalId: scn.hospitals[0].id });
    guard = 0;
    while (rtw.task !== 'toHospital' && guard++ < 2000) game.tick(500);
    expect(nef.task).toBe('toHospital');
    expect(nef.status).toBe(7);
    expect(game.radioReply(rtw, 'wann ist der notarzt wieder frei')).toMatch(/begleitet den Patienten.*abkömmlich nach der Übergabe in etwa \d+ Minuten/);
    guard = 0;
    while (nef.task === 'toHospital' && guard++ < 20000) game.tick(500);
    expect(nef.task).toBe('atHospital');
    expect(nef.status).toBe(8);
    nef.timer = (game as unknown as { time: number }).time + 60_000;
    expect(game.radioReply(nef, 'notarzt abkömmlich')).toMatch(/Übergabe ist abgeschlossen/);
    expect(nef.status).toBe(1);
    expect(nef.incidentId).toBeUndefined();
  });
});
