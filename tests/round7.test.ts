import { describe, expect, it } from 'vitest';
import { DEFAULT_STICHWORTE, ensureStichworte } from '../shared/catalog';
import { SCHLAGWORTE, formatSchlagwort, schlagwortByNr, searchSchlagworte } from '../shared/schlagworte';
import { BMA_TEMPLATE, TEMPLATES } from '../server/callgen';
import { generateScenario } from '../shared/mapgen';
import { Game } from '../server/game';

describe('ABek-Schlagworte', () => {
  it('formatiert wie im Einsatzleitsystem', () => {
    expect(formatSchlagwort(schlagwortByNr('#B1515', 'B 3')!)).toBe('#B1515 - B3 - #Verkehr#LKW / Bus außerorts');
    expect(formatSchlagwort(schlagwortByNr('#B1124')!)).toBe('#B1124 - B3 PERSON - #im Gebäude#Zimmer (Person in Gefahr)');
    expect(searchSchlagworte('b1515').length).toBe(2);
    expect(searchSchlagworte('lkw ausserorts').map((s) => s.nr)).toContain('#B1515');
    expect(searchSchlagworte('b3 person keller')[0].nr).toBe('#B1117');
  });

  it('passt zu Stichworten und Einsatzvorlagen', () => {
    const codes = new Set(DEFAULT_STICHWORTE.map((s) => s.code));
    expect(SCHLAGWORTE.filter((s) => !codes.has(s.code))).toEqual([]);
    for (const t of [...TEMPLATES, BMA_TEMPLATE]) {
      if (!t.stichwort) continue;
      expect(codes.has(t.stichwort), t.id).toBe(true);
      expect(schlagwortByNr(t.schlagwort, t.stichwort)?.code, t.id).toBe(t.stichwort);
    }
    const scn = { stichworte: [{ code: 'THL Person', label: 'x', category: 'THL' as const, aao: {} }] };
    ensureStichworte(scn);
    expect(scn.stichworte[0].code).toBe('THL P EINGESCHLOSSEN');
    expect(scn.stichworte.length).toBe(DEFAULT_STICHWORTE.length);
  });

  it('alarmiert mit Schlagwort und zusätzlichem RTW', () => {
    const scn = generateScenario({ seed: 4711, towns: 8 });
    scn.settings.callsPerHour = 0;
    scn.settings.bmaPerHour = 0;
    const game = new Game(scn, { seed: 1 });
    const p = game.addPlayer('D', 'dispatcher');
    game.handle(p.id, { a: 'start' });
    const town = scn.towns[0];
    const slw = formatSchlagwort(schlagwortByNr('#B1124')!);
    const base = { address: 'Test', x: town.x, y: town.y, note: '', patients: 1 };
    game.handle(p.id, { a: 'createIncident', stichwort: 'B 3', ...base });
    game.handle(p.id, { a: 'createIncident', stichwort: 'B 3 PERSON', schlagwort: slw, ...base });
    const [a, b] = game.incidents;
    expect(b.schlagwort).toBe(slw);
    const rtw = (id: string) => game.proposal(id).filter((x) => game.units.find((u) => u.id === x.unitId)!.type === 'RTW').length;
    expect(rtw(a.id)).toBe(0);
    expect(rtw(b.id)).toBe(2);
    game.handle(p.id, { a: 'alarm', incidentId: b.id, unitIds: game.proposal(b.id).map((x) => x.unitId) });
    expect(game.radio.some((m) => m.text.includes(slw))).toBe(true);
  });
});

import { PZC_LISTE, decodePzc, pzcFuer, pzcText } from '../shared/pzc';

describe('IVENA und PZC', () => {
  it('liest PZC wie auf der Liste Bayern', () => {
    expect(pzcText('345833')).toBe('Hypertensiver Notfall / Krise, 83 J., Ambulante Versorgung');
    expect(decodePzc('513001')!.fach).toBe('Pädiatrie');
    expect(decodePzc('421781')!.fach).toBe('Stroke Unit');
    expect(decodePzc('12345')).toBeUndefined();
    const codes = new Set(PZC_LISTE.map((p) => p.code));
    for (const t of TEMPLATES)
      for (const p of t.patients ?? []) {
        const pzc = pzcFuer(p.desc, p.specialty, 70);
        expect(codes.has(pzc.slice(0, 3)), `${t.id}: ${p.desc}`).toBe(true);
      }
  });

  it('meldet PZC, zeigt Abmeldungen und wertet die Zuweisung', () => {
    const scn = generateScenario({ seed: 4711, towns: 8 });
    scn.settings.callsPerHour = 0;
    scn.settings.bmaPerHour = 0;
    scn.hospitals = [
      { ...scn.hospitals[0], id: 'hA', name: 'Klinik A', specialties: ['Innere Medizin', 'Kardiologie (HKL)'] },
      { ...scn.hospitals[0], id: 'hB', name: 'Klinik B', specialties: ['Innere Medizin', 'Kardiologie (HKL)'] },
    ];
    const game = new Game(scn, { seed: 3 });
    const p = game.addPlayer('D', 'dispatcher');
    game.handle(p.id, { a: 'start' });
    const call = game.spawnCall('rd_chest')!;
    game.handle(p.id, { a: 'answerCall', callId: call.id });
    const truth = (game as unknown as { callTruth: Map<string, { pos: { x: number; y: number } }> }).callTruth.get(call.id)!;
    game.handle(p.id, { a: 'createIncident', callId: call.id, stichwort: 'RD 2', address: 'x', x: truth.pos.x, y: truth.pos.y, note: '', patients: 1 });
    const inc = game.incidents[0];
    game.handle(p.id, { a: 'alarm', incidentId: inc.id, unitIds: game.proposal(inc.id).map((x) => x.unitId) });
    let u;
    for (let t = 0; t < 3 * 3600_000 && !u; t += 1000) {
      game.tick(1000);
      u = game.units.find((x) => x.task === 'awaitHospital');
    }
    expect(u?.pzc).toMatch(/^332\d\d1$/);
    expect(game.publicState().ivena).toBeTruthy();
    // Klinik A meldet die Kardiologie ab
    const iv = (game as unknown as { ivena: { abmeldungen: { hospitalId: string; fach: string; bis: number; grund: string }[] } }).ivena;
    iv.abmeldungen = [{ hospitalId: 'hA', fach: 'Kardiologie (HKL)', bis: game.time + 3600_000, grund: 'Herzkatheterlabor belegt' }];
    const before = game.score.points;
    game.handle(p.id, { a: 'assignHospital', unitId: u!.id, hospitalId: 'hA' });
    expect(game.score.points).toBeLessThan(before);
    expect(game.publicState().ivena!.zuweisungen[0]).toMatchObject({ hospitalId: 'hA', trotzAbmeldung: true });
  });
});
