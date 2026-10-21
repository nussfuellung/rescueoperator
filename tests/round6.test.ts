import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { Game } from '../server/game';
import { inDienst, isoWeek, parseDienst, parseLstsim, splitFunk } from '../shared/lstsim';
import type { Scenario } from '../shared/types';

const wue = () => JSON.parse(gunzipSync(readFileSync(new URL('../assets/ils-wuerzburg.json.gz', import.meta.url))).toString()) as Scenario;
const all = (scn: Scenario) => scn.stations.flatMap((s) => s.vehicles.map((v) => ({ ...v, station: s.name })));

describe('lstsim-Liste', () => {
  it('liest Dienstzeiten mit Wochentagen und Kalenderwochen', () => {
    expect(parseDienst('7:00 bis 19:00. Mo, Di, Mi, Do, Fr. Nur in geraden Kalenderwochen.')).toEqual({ von: 420, bis: 1140, tage: [0, 1, 2, 3, 4], kw: 'gerade' });
    expect(parseDienst('22:00 bis 6:00. Nur in ungeraden Kalenderwochen.')).toEqual({ von: 1320, bis: 360, kw: 'ungerade' });
    expect(splitFunk('RK GEM 76/1 #')).toEqual({ org: 'Rotkreuz', code: 'GEM', place: 'Gemünden', nr: '76/1' });
    expect(splitFunk('AK WÜ 76/1 (VEF)')?.org).toBe('Akkon');
  });

  it('prüft Schichten über Mitternacht und gerade/ungerade Wochen', () => {
    const mo = new Date(2026, 9, 19); // Montag, KW 43 (ungerade)
    expect(isoWeek(mo)).toBe(43);
    const nacht = [{ von: 1320, bis: 360, kw: 'ungerade' as const }];
    expect(inDienst(nacht, mo, 23 * 60)).toBe(true);
    expect(inDienst(nacht, mo, 24 * 60 + 5 * 60)).toBe(true); // Di 5:00, Schicht begann Mo
    expect(inDienst(nacht, mo, 12 * 60)).toBe(false);
    expect(inDienst([{ von: 420, bis: 1140, kw: 'gerade' }], mo, 600)).toBe(false);
    expect(inDienst([{ von: 420, bis: 420 }], mo, 300)).toBe(true); // 7:00 bis 7:00 = 24 h
  });

  it('erkennt Wachen, Koordinaten und Fahrzeuge', () => {
    const list = parseLstsim(readFileSync(new URL('../scripts/karten/wue-lstsim-rd.txt', import.meta.url), 'utf8'));
    const kt = list.find((s) => s.name === '1.2 RW Kitzingen')!;
    expect(kt.lat).toBeCloseTo(49.735263);
    expect(kt.vehicles.find((v) => v.funk === 'RK KT 71/1 #')?.dienst).toHaveLength(3);
  });

  it('Würzburg hat die Fahrzeuge aus der Liste', () => {
    const scn = wue();
    const v = all(scn);
    const cs = v.map((x) => x.callsign);
    expect(cs).toContain('Rotkreuz Arnstein 71/1');
    expect(cs).toContain('Akkon Würzburg 71/2');
    expect(cs).toContain('Johannes Uettingen 71/1');
    expect(cs).toContain('Florian Würzburg 91/1');
    // Landkreis-Doppelnamen wie "RK MSP 71/1" neben dem Ortsrufnamen fallen weg
    expect(cs.filter((c) => c.startsWith('Rotkreuz Main-Spessart 71'))).toEqual([]);
    expect(v.find((x) => x.callsign === 'Rotkreuz Kitzingen 71/1')?.dienst?.length).toBe(3);
    // Keine inaktiven ELRD-Fahrzeuge, Christoph 18 als RTH
    expect(cs.some((c) => /10\/1 \(ELRD/.test(c))).toBe(false);
    expect(v.find((x) => x.callsign === 'Christoph 18')?.type).toBe('RTH');
  });
});

describe('Dienstzeiten im Spiel', () => {
  it('Fahrzeuge außerhalb ihrer Schicht stehen auf Status 6', () => {
    const scn = wue();
    scn.settings.startClock = 3 * 60; // 3:00 nachts
    scn.settings.callsPerHour = 0;
    scn.settings.bmaPerHour = 0;
    const game = new Game(scn, { seed: 1, startDate: new Date(2026, 9, 20) }); // Dienstag
    const ktw = game.units.find((u) => u.callsign === 'Rotkreuz Würzburg 72/5')!; // 8:00 bis 16:00 Mo–Fr
    expect(ktw.status).toBe(6);
    game.started = game.running = true;
    for (let i = 0; i < 6 * 60; i++) game.tick(60_000); // 6 Spielstunden
    // Anmeldung zum Dienst per Sprechwunsch mit Dienstende
    expect(ktw.status).toBe(5);
    expect(ktw.baseStatus).toBe(2);
    expect(ktw.speak?.text).toMatch(/Dienst an.*Dienstende 16:00 Uhr/);
    // Wechselnde NEF-Standorte: ein Rufname ist höchstens einmal im Dienst
    const nef = game.units.filter((u) => u.callsign === 'Rotkreuz Würzburg 76/2' && u.baseStatus !== 6);
    expect(nef.length).toBeLessThanOrEqual(1);
  });
});

describe('Funk und Einsätze', () => {
  it('Fahrzeuge antworten passend', () => {
    const game = new Game(wue(), { seed: 2 });
    const u = game.units.find((x) => x.type === 'RTW' && x.status === 2)!;
    expect(game.radioReply(u, `${u.callsign} von Leitstelle kommen`)).toMatch(/hört/);
    expect(game.radioReply(u, 'Wo seid ihr gerade?')).toMatch(/Wache/);
    expect(game.radioReply(u, 'Welchen Status habt ihr?')).toMatch(/Status 2/);
    expect(game.radioReply(u, 'Habt ihr einen Patienten an Bord?')).toMatch(/keinen Patienten/);
    expect(game.radioReply(u, 'Wie lange braucht ihr noch?')).toMatch(/ohne Einsatz/);
  });

  it('wiederholt Einsätze seltener und liefert meist eine AML', () => {
    const game = new Game(wue(), { seed: 3 });
    const ids: string[] = [];
    let aml = 0;
    let mobile = 0;
    for (let i = 0; i < 60; i++) {
      const c = game.spawnCall();
      if (!c) continue;
      ids.push((game as unknown as { callTruth: Map<string, { tpl: { id: string } }> }).callTruth.get(c.id)!.tpl.id);
      if (/^01[5-7]/.test(c.phone)) {
        mobile++;
        if (c.aml) aml++;
      }
    }
    const repeats = ids.filter((id, i) => ids.slice(Math.max(0, i - 3), i).includes(id)).length;
    expect(repeats).toBeLessThan(6);
    expect(new Set(ids).size).toBeGreaterThan(20);
    expect(aml / mobile).toBeGreaterThan(0.8);
  });
});
