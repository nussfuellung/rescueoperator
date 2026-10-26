import { describe, expect, it } from 'vitest';
import { generateScenario } from '../shared/mapgen';
import { Game } from '../server/game';
import { PANIK } from '../server/callgen';

function run(game: Game, ms: number, step = 500) {
  for (let t = 0; t < ms; t += step) game.tick(step);
}

function setup() {
  const scn = generateScenario({ seed: 4711, towns: 8 });
  scn.settings.callsPerHour = 0;
  scn.settings.bmaPerHour = 0;
  const game = new Game(scn, { seed: 9 });
  const p = game.addPlayer('D', 'dispatcher');
  game.handle(p.id, { a: 'start' });
  return { game, p };
}

const lastCaller = (call: { transcript: { from: string; text: string }[] }) => call.transcript.filter((l) => l.from === 'caller').at(-1)?.text ?? '';
type Intern = { callTruth: Map<string, { pos: { x: number; y: number }; whereSaid?: boolean; needs: Record<string, number>; lage: string }> };

describe('Panischer Anrufer', () => {
  it('antwortet erst nach dem Beruhigen brauchbar', () => {
    const { game, p } = setup();
    const call = game.spawnCall('rd_fall', { panik: 2 })!;
    game.handle(p.id, { a: 'answerCall', callId: call.id });
    run(game, 8000);
    const truth = (game as unknown as Intern).callTruth.get(call.id)!;
    // Den Ort nennt er nicht von selbst
    expect(truth.whereSaid).toBeFalsy();
    let panisch = 0;
    for (let i = 0; i < 6; i++) {
      game.handle(p.id, { a: 'ask', callId: call.id, question: 'alter' });
      run(game, 4000);
      if (PANIK.includes(lastCaller(call))) panisch++;
    }
    expect(panisch).toBeGreaterThan(0);
    const before = game.score.points;
    game.handle(p.id, { a: 'ask', callId: call.id, question: 'beruhigen' });
    run(game, 4000);
    expect(game.score.points).toBe(before);
    game.handle(p.id, { a: 'ask', callId: call.id, question: 'beruhigen' });
    run(game, 4000);
    expect(game.score.points).toBe(before + 5);
    // Jetzt kommen brauchbare Antworten
    for (let i = 0; i < 5; i++) {
      game.handle(p.id, { a: 'ask', callId: call.id, question: 'wo' });
      run(game, 4000);
      expect(PANIK.includes(lastCaller(call))).toBe(false);
    }
    expect(truth.whereSaid).toBe(true);
  });
});

describe('Erneuter Anruf', () => {
  function anlegen(game: Game, p: { id: string }, tpl: string, alarm: boolean) {
    const call = game.spawnCall(tpl, { erneut: true })!;
    game.handle(p.id, { a: 'answerCall', callId: call.id });
    const truth = (game as unknown as Intern).callTruth.get(call.id)!;
    game.handle(p.id, { a: 'createIncident', callId: call.id, stichwort: 'RD 1', address: 'x', x: truth.pos.x, y: truth.pos.y, note: '', patients: 1 });
    game.handle(p.id, { a: 'endCall', callId: call.id });
    const inc = game.incidents.at(-1)!;
    if (alarm) {
      // Nur ein weit entferntes Fahrzeug, damit vor dem erneuten Anruf niemand eintrifft
      const far = game.units.filter((u) => u.type === 'RTW').sort((a, b) => Math.hypot(b.x - inc.x, b.y - inc.y) - Math.hypot(a.x - inc.x, a.y - inc.y))[0];
      game.handle(p.id, { a: 'alarm', incidentId: inc.id, unitIds: [far.id] });
    }
    return { call, inc, truth };
  }

  it('meldet sich, wenn niemand alarmiert wurde', () => {
    const { game, p } = setup();
    const { call, inc } = anlegen(game, p, 'rd_fall', false);
    let again;
    for (let t = 0; t < 8 * 60_000 && !again; t += 1000) {
      game.tick(1000);
      again = game.calls.find((c) => c !== call && c.state === 'ringing');
    }
    expect(again).toBeTruthy();
    expect(again!.phone).toBe(call.phone);
    expect(again!.incidentId).toBe(inc.id);
    game.handle(p.id, { a: 'answerCall', callId: again!.id });
    run(game, 3000);
    expect(again!.transcript.some((l) => l.from === 'system' && l.text.includes(inc.nr))).toBe(true);
    expect(lastCaller(again!)).toMatch(/kommt|warte|niemand|angerufen/i);
    // Auflegen ohne Abzug, kein neuer Einsatz nötig
    const before = game.score.points;
    expect(game.handle(p.id, { a: 'endCall', callId: again!.id })).toBeUndefined();
    expect(game.score.points).toBe(before);
  });

  it('meldet eine Verschlechterung und erwartet den Notarzt', () => {
    const { game, p } = setup();
    const { call, inc, truth } = anlegen(game, p, 'rd_fall', true);
    expect(truth.needs.NEF ?? 0).toBe(0);
    let again;
    for (let t = 0; t < 8 * 60_000 && !again; t += 1000) {
      game.tick(1000);
      again = game.calls.find((c) => c !== call && c.state === 'ringing');
    }
    expect(again).toBeTruthy();
    game.handle(p.id, { a: 'answerCall', callId: again!.id });
    run(game, 3000);
    expect(truth.needs.NEF).toBe(1);
    expect(inc.log.some((l) => /Erneuter Anruf/.test(l.text))).toBe(true);
    game.handle(p.id, { a: 'ask', callId: again!.id, question: 'zustand' });
    run(game, 3000);
    expect(lastCaller(again!)).not.toMatch(/Wie geht|weiß nicht genau/);
    game.handle(p.id, { a: 'endCall', callId: again!.id });
    const nef = game.units.find((u) => u.type === 'NEF' && u.task === 'station')!;
    game.handle(p.id, { a: 'alarm', incidentId: inc.id, unitIds: [nef.id] });
    const before = game.score.points;
    run(game, 4 * 60_000, 1000);
    expect(game.score.points).toBeGreaterThanOrEqual(before + 10);
  });
});
