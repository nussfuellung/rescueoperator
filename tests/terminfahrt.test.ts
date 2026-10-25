import { describe, expect, it } from 'vitest';
import { generateScenario } from '../shared/mapgen';
import { searchObjects } from '../shared/geo';
import { Game } from '../server/game';
import { TERMIN_VORLAGEN } from '../server/vorlagen-termin';
import { classifyAll } from '../server/callgen';

const run = (game: Game, ms: number) => {
  for (let t = 0; t < ms; t += 500) game.tick(500);
};

function setup(seed = 5) {
  const scn = generateScenario({ seed: 4711, towns: 8 });
  scn.settings.callsPerHour = 0;
  scn.settings.bmaPerHour = 0;
  const toasts: { playerId: string | null; text: string; level: string }[] = [];
  const game = new Game(scn, { seed, events: { toast: (playerId, text, level) => toasts.push({ playerId, text, level }) } });
  const p = game.addPlayer('Disponent', 'dispatcher');
  game.handle(p.id, { a: 'start' });
  return { scn, game, p, toasts };
}

const truthOf = (game: Game, callId: string) => (game as unknown as { callTruth: Map<string, { termin?: number; ziel?: string; pos: { x: number; y: number }; address: string }> }).callTruth.get(callId)!;

describe('Terminfahrten', () => {
  it('versteht Fragen nach Abholzeit, Ziel und Transportart', () => {
    expect(classifyAll('Um wie viel Uhr soll abgeholt werden?')).toEqual(['termin']);
    expect(classifyAll('Für wann brauchen Sie den Transport')).toEqual(['termin']);
    expect(classifyAll('Wohin soll es gehen?')).toEqual(['ziel']);
    expect(classifyAll('Liegend oder sitzend?')).toEqual(['transportart']);
    // Bisherige Fragen bleiben, wie sie waren
    expect(classifyAll('Seit wann geht das so?')).toEqual(['seitwann']);
    expect(classifyAll('Wo genau ist der Notfallort?')).toEqual(['wo']);
  });

  it('kommt über die 19222 und nennt Uhrzeit und Ziel', () => {
    const { game, p } = setup();
    const call = game.spawnCall('ktp_termin_dialyse')!;
    expect(call.leitung).toBe('19222');
    expect(call.aml).toBeUndefined();
    game.handle(p.id, { a: 'answerCall', callId: call.id });
    expect(call.transcript[0].text).toMatch(/Krankentransport/);
    const truth = truthOf(game, call.id);
    expect(truth.termin).toBeGreaterThan(game.time + 30 * 60_000);
    game.handle(p.id, { a: 'ask', callId: call.id, question: 'termin' });
    run(game, 3000);
    game.handle(p.id, { a: 'ask', callId: call.id, question: 'ziel' });
    run(game, 3000);
    const said = call.transcript.filter((l) => l.from === 'caller').map((l) => l.text).join(' ');
    expect(said).toMatch(/\d\d:\d\d Uhr/);
    expect(said).toContain(truth.ziel!);
    expect(said).not.toMatch(/[{}]/);
  });

  it('erinnert 30 Minuten vorher und bei Fälligkeit und wertet die Pünktlichkeit', () => {
    const { game, p, toasts } = setup();
    const call = game.spawnCall('ktp_termin_dialyse')!;
    game.handle(p.id, { a: 'answerCall', callId: call.id });
    const truth = truthOf(game, call.id);
    const err = game.handle(p.id, {
      a: 'createIncident',
      callId: call.id,
      stichwort: 'RD KTP',
      address: truth.address,
      x: truth.pos.x,
      y: truth.pos.y,
      note: '',
      patients: 1,
      termin: truth.termin,
    });
    expect(err).toBeUndefined();
    const inc = game.incidents[0];
    expect(inc.termin).toBe(truth.termin);
    expect(inc.status).toBe('offen');
    expect(game.score.events.some((e) => /Abholzeit korrekt/.test(e.text))).toBe(true);
    run(game, inc.termin! - 31 * 60_000 - game.time);
    expect(inc.terminMeldung).toBeUndefined();
    run(game, 2 * 60_000);
    expect(inc.terminMeldung).toBe('vorlauf');
    expect(toasts.filter((t) => t.playerId === p.id && /Terminfahrt/.test(t.text)).length).toBe(1);
    run(game, inc.termin! - game.time + 1000);
    expect(inc.terminMeldung).toBe('faellig');
    expect(toasts.filter((t) => /jetzt fällig/.test(t.text) && t.level === 'warn').length).toBe(1);
    // Spät disponiert: Fahrzeug kommt nach der Toleranz an
    game.handle(p.id, { a: 'alarm', incidentId: inc.id, unitIds: game.proposal(inc.id).map((x) => x.unitId) });
    run(game, 40 * 60_000);
    expect(inc.firstArrival).toBeDefined();
    expect(game.score.events.some((e) => /Terminfahrt (pünktlich|\d+ min nach)/.test(e.text))).toBe(true);
    expect(game.score.events.some((e) => /Hilfsfrist/.test(e.text))).toBe(false);
  });

  it('wertet eine Terminfahrt ohne Termin und lässt zu früh gekommene Fahrzeuge warten', () => {
    const { game, p } = setup(8);
    const call = game.spawnCall('ktp_termin_ct')!;
    game.handle(p.id, { a: 'answerCall', callId: call.id });
    const truth = truthOf(game, call.id);
    game.handle(p.id, {
      a: 'createIncident',
      callId: call.id,
      stichwort: 'RD KTP',
      address: truth.address,
      x: truth.pos.x,
      y: truth.pos.y,
      note: '',
      patients: 1,
      alarmAao: true,
    });
    const inc = game.incidents[0];
    expect(game.score.events.some((e) => /nicht als Termin erfasst/.test(e.text))).toBe(true);
    run(game, 25 * 60_000);
    expect(inc.firstArrival).toBeDefined();
    expect(inc.log.some((l) => /abholbereit/.test(l.text))).toBe(true);
  });

  it('lehnt unsinnige Abholzeiten ab und lässt den Termin ändern', () => {
    const { game, p, scn } = setup();
    const base = { stichwort: 'RD KTP', address: 'Test', x: scn.towns[0].x, y: scn.towns[0].y, note: '', patients: 1 };
    expect(game.handle(p.id, { a: 'createIncident', ...base, termin: game.time + 48 * 3600_000 })).toBeTruthy();
    expect(game.handle(p.id, { a: 'createIncident', ...base, termin: game.time + 3600_000 })).toBeUndefined();
    const inc = game.incidents[0];
    game.handle(p.id, { a: 'updateIncident', incidentId: inc.id, termin: game.time + 20 * 60_000 });
    run(game, 1000);
    expect(inc.terminMeldung).toBe('vorlauf');
    game.handle(p.id, { a: 'updateIncident', incidentId: inc.id, termin: null });
    expect(inc.termin).toBeUndefined();
  });

  it('findet Kliniken in der Objektsuche', () => {
    const { scn } = setup();
    const h = scn.hospitals[0];
    expect(searchObjects(scn, h.name).some((x) => x.obj.name === h.name && x.kind === 'Klinik')).toBe(true);
  });

  it('hat für jede Vorlage Uhrzeit und Ziel in den Antworten', () => {
    for (const t of TERMIN_VORLAGEN) {
      expect(t.termin, t.id).toBeDefined();
      expect(t.answers.termin?.every((a) => a.includes('{termin}')), t.id).toBe(true);
      expect(t.answers.ziel?.every((a) => a.includes('{ziel}')), t.id).toBe(true);
    }
  });
});

describe('Terminfahrten absagen und verschieben', () => {
  const anlegen = (game: Game, pid: string, tplId: string, alarm = false) => {
    const call = game.spawnCall(tplId)!;
    game.handle(pid, { a: 'answerCall', callId: call.id });
    const truth = truthOf(game, call.id);
    game.handle(pid, {
      a: 'createIncident',
      callId: call.id,
      stichwort: 'RD KTP',
      address: truth.address,
      x: truth.pos.x,
      y: truth.pos.y,
      note: '',
      patients: 1,
      termin: truth.termin,
    });
    game.handle(pid, { a: 'endCall', callId: call.id });
    const inc = game.incidents[game.incidents.length - 1];
    if (alarm) game.handle(pid, { a: 'alarm', incidentId: inc.id, unitIds: game.proposal(inc.id).map((x) => x.unitId) });
    return inc;
  };

  it('Absage über die 19222: Stornieren gibt Punkte, alarmierte Fahrzeuge werden frei', () => {
    const { game, p } = setup(11);
    const inc = anlegen(game, p.id, 'ktp_termin_dialyse', true);
    expect(inc.unitIds.length).toBeGreaterThan(0);
    const unitId = inc.unitIds[0];
    const call = game.terminAenderung(inc.id, 'absage')!;
    expect(call.leitung).toBe('19222');
    game.handle(p.id, { a: 'answerCall', callId: call.id });
    run(game, 3000);
    const said = call.transcript.filter((l) => l.from === 'caller').map((l) => l.text).join(' ');
    expect(said).toMatch(/abgesagt/);
    expect(said).toMatch(/\d\d:\d\d Uhr/);
    expect(said).not.toMatch(/[{}]/);
    const vorher = game.score.points;
    game.handle(p.id, { a: 'endCall', callId: call.id });
    // Kein Abzug fürs Beenden ohne Einsatz
    expect(game.score.points).toBe(vorher);
    game.handle(p.id, { a: 'closeIncident', incidentId: inc.id });
    expect(inc.status).toBe('abgeschlossen');
    expect(inc.log.some((l) => l.text === 'Terminfahrt storniert')).toBe(true);
    expect(game.score.events[0].text).toMatch(/Abgesagte Terminfahrt storniert/);
    expect(game.units.find((u) => u.id === unitId)!.incidentId).toBeUndefined();
  });

  it('Absage nicht umgesetzt: Leerfahrt ohne Transport', () => {
    const { game, p } = setup(12);
    const inc = anlegen(game, p.id, 'ktp_termin_ct');
    game.terminAenderung(inc.id, 'absage');
    game.handle(p.id, { a: 'alarm', incidentId: inc.id, unitIds: game.proposal(inc.id).map((x) => x.unitId) });
    run(game, 30 * 60_000);
    expect(game.score.events.some((e) => /Leerfahrt/.test(e.text))).toBe(true);
    expect(game.units.some((u) => u.hasPatient)).toBe(false);
  });

  it('Verschiebung: neue Uhrzeit eintragen gibt Punkte, der Patient ist erst dann fertig', () => {
    const { game, p } = setup(13);
    const inc = anlegen(game, p.id, 'ktp_termin_dialyse');
    const alt = inc.termin!;
    const call = game.terminAenderung(inc.id, 'verschieben')!;
    game.handle(p.id, { a: 'answerCall', callId: call.id });
    game.handle(p.id, { a: 'ask', callId: call.id, question: 'termin' });
    run(game, 6000);
    const neu = (game as unknown as { incTruth: Map<string, { aenderung?: { neu?: number } }> }).incTruth.get(inc.id)!.aenderung!.neu!;
    expect(neu).toBeGreaterThan(alt);
    const said = call.transcript.filter((l) => l.from === 'caller').map((l) => l.text).join(' ');
    expect(said).toContain('verschieben');
    game.handle(p.id, { a: 'updateIncident', incidentId: inc.id, termin: neu });
    expect(game.score.events[0].text).toMatch(/Neue Abholzeit/);
    // Wird trotzdem zur alten Zeit alarmiert, wartet der KTW
    game.handle(p.id, { a: 'alarm', incidentId: inc.id, unitIds: game.proposal(inc.id).map((x) => x.unitId) });
    run(game, 25 * 60_000);
    expect(inc.log.some((l) => /abholbereit/.test(l.text))).toBe(true);
  });

  it('meldet sich nicht mehr, wenn der KTW schon vor Ort ist', () => {
    const { game, p } = setup(14);
    const inc = anlegen(game, p.id, 'ktp_termin_ct', true);
    run(game, 25 * 60_000);
    expect(inc.firstArrival).toBeDefined();
    expect(game.terminAenderung(inc.id)).toBeNull();
  });
});
