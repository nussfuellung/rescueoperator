import { describe, expect, it } from 'vitest';
import { generateScenario, mulberry32 } from '../shared/mapgen';
import { Game } from '../server/game';
import { rollVerlauf, type Verlauf } from '../server/verlauf';

const quiet = () => {
  const scn = generateScenario({ seed: 4711, towns: 8 });
  scn.settings.callsPerHour = 0;
  scn.settings.bmaPerHour = 0;
  return scn;
};
const run = (game: Game, ms: number, until?: () => boolean) => {
  for (let t = 0; t < ms; t += 1000) {
    game.tick(1000);
    if (until?.()) return;
  }
};
type Internals = {
  callTruth: Map<string, { pos: { x: number; y: number }; address: string; stichwort: string }>;
  incTruth: Map<string, { verlauf?: Verlauf; leichensache?: boolean; patients: unknown[] }>;
};
const intern = (g: Game) => g as unknown as Internals;
const funk = (g: Game) => g.radio.map((m) => m.text).join('\n');

/** Einsatz zur Vorlage anlegen, ohne Fahrzeuge zu alarmieren */
function einsatz(tpl: string, seed = 4, extra: { polizei?: boolean } = {}) {
  const game = new Game(quiet(), { seed });
  const p = game.addPlayer('D', 'dispatcher');
  game.handle(p.id, { a: 'start' });
  const call = game.spawnCall(tpl)!;
  game.handle(p.id, { a: 'answerCall', callId: call.id });
  const t = intern(game).callTruth.get(call.id)!;
  game.handle(p.id, { a: 'createIncident', callId: call.id, stichwort: t.stichwort, address: t.address, x: t.pos.x, y: t.pos.y, note: '', patients: 1, ...extra });
  const inc = game.incidents[0];
  const naechster = (type: string) =>
    game.proposal(inc.id).find((x) => game.units.find((u) => u.id === x.unitId)?.type === type)?.unitId ??
    game.units.find((u) => u.type === type && u.task === 'station')!.id;
  const alarm = (...types: string[]) => game.handle(p.id, { a: 'alarm', incidentId: inc.id, unitIds: types.map(naechster) });
  return { game, p, inc, alarm };
}

/** Reanimation mit festgelegtem Ausgang */
function reaVerlauf(rea: 'rosc' | 'tot'): Verlauf {
  const input = { tplId: 'rd_cpr', stichwort: 'RD 2', where: 'wohnung', lage: 'Patient reanimationspflichtig, Reanimation läuft.', needs: { RTW: 1, NEF: 1 }, patients: 1 };
  for (let s = 1; s < 500; s++) {
    const v = rollVerlauf(input, mulberry32(s), () => true);
    if (v.rea === rea) return v;
  }
  throw new Error('kein Verlauf');
}

describe('Lagemeldungen nach dem Stand an der Einsatzstelle', () => {
  it('Reanimation läuft bis zum Notarzt, erst er bricht ab; danach Leichensache mit Polizei und KIT', () => {
    const { game, p, inc, alarm } = einsatz('rd_cpr');
    intern(game).incTruth.get(inc.id)!.verlauf = reaVerlauf('tot');
    alarm('RTW');
    run(game, 40 * 60_000, () => /Lagemeldung/.test(funk(game)));
    // speakPermit, damit die Meldung im Funk landet
    const rtw = game.units.find((u) => u.incidentId === inc.id)!;
    if (rtw.speak) game.handle(p.id, { a: 'speakPermit', unitId: rtw.id });
    expect(inc.lage).toMatch(/Reanimation wird fortgeführt, Notarzt dringend erforderlich/);
    expect(funk(game)).toMatch(/Wir fordern nach: 1x NEF/);
    expect(funk(game)).not.toMatch(/abgebrochen/);
    // Ohne Notarzt kein Ausgang
    run(game, 20 * 60_000);
    expect(inc.lage).not.toMatch(/abgebrochen|ROSC nach/);
    alarm('NEF');
    run(game, 60 * 60_000, () => /abgebrochen/.test(inc.lage ?? ''));
    expect(inc.lage).toMatch(/ohne ROSC durch den Notarzt abgebrochen/);
    expect(intern(game).incTruth.get(inc.id)!.leichensache).toBe(true);
    // Ohne Polizei bleibt der Rettungsdienst an der Einsatzstelle
    run(game, 40 * 60_000);
    expect(inc.status).not.toBe('abgeschlossen');
    expect(game.units.some((u) => u.incidentId === inc.id && u.type === 'RTW')).toBe(true);
    // Notarzt ist nach der Todesfeststellung frei
    expect(game.units.some((u) => u.incidentId === inc.id && u.type === 'NEF')).toBe(false);
    for (const u of game.units) if (u.speak && !u.speak.answered) game.handle(p.id, { a: 'speakPermit', unitId: u.id });
    expect(funk(game)).toMatch(/Polizei zur Leichensache/);
    expect(game.radioReply(game.units.find((u) => u.incidentId === inc.id)!, 'Ist das KIT schon vor Ort?')).toMatch(/Bitte KIT/);
    game.handle(p.id, { a: 'requestKit', incidentId: inc.id });
    expect(inc.kit).toBe('angefordert');
    game.handle(p.id, { a: 'requestPolice', incidentId: inc.id });
    run(game, 30 * 60_000, () => inc.status === 'abgeschlossen');
    expect(inc.status).toBe('abgeschlossen');
  });

  it('meldet nach ROSC den Patienten mit Herzkatheterlabor an', () => {
    const { game, inc, alarm } = einsatz('rd_cpr');
    intern(game).incTruth.get(inc.id)!.verlauf = reaVerlauf('rosc');
    alarm('RTW', 'NEF');
    run(game, 90 * 60_000, () => game.units.some((u) => u.speak && /Herzkatheterlabor und Schockraum/.test(u.speak.text)) || /Herzkatheterlabor und Schockraum/.test(funk(game)) || game.calls.some((c) => c.kind === 'rtw'));
    expect(inc.lage).toMatch(/ROSC nach \d+ Minuten/);
    expect(intern(game).incTruth.get(inc.id)!.patients.length).toBe(1);
  });

  it('Rettungsdienst wartet bei Gefahrenlage im Bereitstellungsraum auf die Polizei', () => {
    const { game, p, inc, alarm } = einsatz('rd_messer');
    alarm('RTW');
    run(game, 40 * 60_000, () => inc.log.some((l) => /Bereitstellungsraum/.test(l.text)));
    expect(inc.log.some((l) => /Bereitstellungsraum/.test(l.text))).toBe(true);
    run(game, 10 * 60_000);
    expect(inc.lage).toBeUndefined();
    const rtw = game.units.find((u) => u.incidentId === inc.id)!;
    expect(game.radioReply(rtw, 'Ist die Polizei schon vor Ort?')).toMatch(/Bereitstellungsraum/);
    if (rtw.speak) game.handle(p.id, { a: 'speakPermit', unitId: rtw.id });
    expect(funk(game)).toMatch(/Freigabe durch die Polizei.*Bitte Polizei verständigen/);
    game.handle(p.id, { a: 'requestPolice', incidentId: inc.id });
    run(game, 30 * 60_000, () => !!inc.lage);
    expect(inc.log.some((l) => /durch die Polizei freigegeben/.test(l.text))).toBe(true);
    expect(inc.lage).toMatch(/Polizei vor Ort/);
  });

  it('wartet nicht, wenn die Polizei schon vor Ort ist', () => {
    const { game, inc, alarm } = einsatz('rd_messer', 4, { polizei: true });
    inc.polizei = 'vor Ort';
    alarm('RTW');
    run(game, 40 * 60_000, () => !!inc.lage);
    expect(inc.log.some((l) => /Bereitstellungsraum/.test(l.text))).toBe(false);
    expect(inc.lage).toBeTruthy();
  });

  it('quittiert eine Abbestellung auf der Anfahrt per Funk', () => {
    const { game, p, inc, alarm } = einsatz('rd_fall');
    alarm('RTW');
    run(game, 60_000);
    const rtw = game.units.find((u) => u.incidentId === inc.id)!;
    game.handle(p.id, { a: 'releaseUnit', unitId: rtw.id });
    run(game, 10_000);
    expect(funk(game)).toMatch(/Einsatzabbruch, Sie werden nicht mehr benötigt/);
    expect(funk(game)).toMatch(/Verstanden, Einsatzabbruch/);
  });

  it('beantwortet Rückfragen aus dem tatsächlichen Stand', () => {
    const { game, inc, alarm } = einsatz('rd_fall');
    alarm('RTW');
    run(game, 40 * 60_000, () => !!inc.lage);
    const rtw = game.units.find((u) => u.incidentId === inc.id)!;
    expect(game.radioReply(rtw, 'Ist die Polizei bei euch?')).toMatch(/keine Polizei vor Ort, wird auch nicht benötigt/);
    expect(game.radioReply(rtw, 'Wie viele Patienten habt ihr?')).toMatch(/Ein Patient/);
    expect(game.radioReply(rtw, 'Ist die Feuerwehr vor Ort?')).toMatch(/keine Feuerwehr/);
  });
});
