import { describe, expect, it } from 'vitest';
import { generateScenario } from '../shared/mapgen';
import { mulberry32 } from '../shared/mapgen';
import { Game } from '../server/game';
import { rollVerlauf } from '../server/verlauf';

const all = () => true;
const roll = (seed: number, input: Parameters<typeof rollVerlauf>[0]) => rollVerlauf(input, mulberry32(seed), all);
const bmaInput = { tplId: 'bma', stichwort: 'B BMA', where: 'objekt', lage: 'BMA', needs: { HLF: 2, DLK: 1, ELW: 1 }, patients: 0, melder: 12 };

describe('Einsatzverläufe', () => {
  it('würfelt bei der BMA unterschiedliche Feststellungen mit Erkundungszeit aus', () => {
    const vs = Array.from({ length: 300 }, (_, i) => roll(i + 1, bmaInput));
    const fehl = vs.filter((v) => /Täuschungsalarm|Fehlalarm|Handfeuermelder|Wartungsarbeiten/.test(v.lage));
    const brand = vs.filter((v) => /Brand .*bestätigt/.test(v.lage));
    expect(fehl.length / vs.length).toBeGreaterThan(0.6);
    expect(brand.length).toBeGreaterThan(10);
    expect(new Set(vs.map((v) => v.lage)).size).toBeGreaterThan(10);
    // Die Feststellung kommt erst nach der Erkundung
    for (const v of vs) expect(v.erkundungMs).toBeGreaterThanOrEqual(150_000);
    expect(vs.some((v) => v.zwischenmeldung)).toBe(true);
    // Fehlalarm: nur das erste Fahrzeug bleibt, der Rest kann abbestellt werden
    for (const v of fehl) {
      expect(v.needs).toEqual({ HLF: 1 });
      expect(v.abbestellen).toEqual(expect.arrayContaining(['DLK', 'ELW']));
    }
    for (const v of brand) expect(v.needs.HLF).toBeGreaterThan(2);
  });

  it('variiert auch Brand, THL und Rettungsdienst', () => {
    const lagen = (input: Parameters<typeof rollVerlauf>[0]) => new Set(Array.from({ length: 200 }, (_, i) => roll(i + 7, input).lage)).size;
    expect(lagen({ tplId: 'b_pkw', stichwort: 'B 2', where: 'strasse', lage: 'Pkw-Brand.', needs: { HLF: 1 }, patients: 0 })).toBeGreaterThan(3);
    expect(lagen({ tplId: 'thl_oel', stichwort: 'THL 1', where: 'strasse', lage: 'Ölspur.', needs: { HLF: 1 }, patients: 0 })).toBe(3);
    const rd = Array.from({ length: 400 }, (_, i) =>
      roll(i + 3, { tplId: 'rd_fall', stichwort: 'RD 1', where: 'wohnung', lage: 'Sturz, Transport in Chirurgie.', needs: { RTW: 1 }, patients: 1 }),
    );
    expect(rd.some((v) => v.keinTransport && /Transport ab/.test(v.lage))).toBe(true);
    expect(rd.some((v) => v.needs.NEF)).toBe(true);
    expect(rd.some((v) => v.entwicklung)).toBe(true);
    const rd2 = Array.from({ length: 200 }, (_, i) =>
      roll(i + 5, { tplId: 'rd_krampf', stichwort: 'RD 2', where: 'wohnung', lage: 'Krampfanfall.', needs: { RTW: 1, NEF: 1 }, patients: 1 }),
    );
    expect(rd2.some((v) => v.abbestellen.includes('NEF'))).toBe(true);
  });

  it('meldet die BMA-Lage erst nach der Erkundung', () => {
    const scn = generateScenario({ seed: 4711, towns: 8 });
    scn.settings.callsPerHour = 0;
    scn.settings.bmaPerHour = 0;
    scn.objects.push({ id: 'o_bma', name: 'Testwerk', kind: 'gewerbe', x: scn.towns[0].x, y: scn.towns[0].y, bma: true });
    const game = new Game(scn, { seed: 5 });
    const p = game.addPlayer('D', 'dispatcher');
    game.handle(p.id, { a: 'start' });
    const call = game.spawnBma()!;
    game.handle(p.id, { a: 'answerCall', callId: call.id });
    game.handle(p.id, { a: 'createIncident', callId: call.id, stichwort: 'B BMA', address: call.bma!.address, x: call.bma!.x, y: call.bma!.y, note: '', patients: 0, alarmAao: true });
    const inc = game.incidents[0];
    let guard = 0;
    while (!inc.firstArrival && guard++ < 3600) game.tick(1000);
    expect(inc.firstArrival).toBeDefined();
    expect(inc.lage).toBeFalsy();
    for (let i = 0; i < 120; i++) game.tick(1000);
    expect(inc.lage).toBeFalsy();
    for (let i = 0; i < 600 && !inc.lage; i++) game.tick(1000);
    expect(inc.lage).toBeTruthy();
    // Einsatz läuft trotzdem zu Ende
    for (let i = 0; i < 3 * 3600 && inc.status !== 'abgeschlossen'; i++) {
      game.tick(1000);
      for (const u of game.units) if (u.speak && !u.speak.answered) game.handle(p.id, { a: 'speakPermit', unitId: u.id });
    }
    expect(inc.status).toBe('abgeschlossen');
  });
});
