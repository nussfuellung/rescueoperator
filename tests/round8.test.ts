import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { generateScenario } from '../shared/mapgen';
import { inDienst, sunsetMinute } from '../shared/lstsim';
import { Game } from '../server/game';
import type { Scenario } from '../shared/types';

const wue = () => JSON.parse(gunzipSync(readFileSync(new URL('../assets/ils-wuerzburg.json.gz', import.meta.url))).toString()) as Scenario;
const quiet = () => {
  const scn = generateScenario({ seed: 4711, towns: 8 });
  scn.settings.callsPerHour = 0;
  scn.settings.bmaPerHour = 0;
  return scn;
};
const run = (game: Game, ms: number) => {
  for (let t = 0; t < ms; t += 1000) game.tick(1000);
};
type Internals = { callTruth: Map<string, { pos: { x: number; y: number }; address: string }> };

describe('Runde 8', () => {
  it('legt am Tablet eine BMA an und alarmiert nach AAO', () => {
    const scn = quiet();
    scn.objects.push({ id: 'o_bma', name: 'Testwerk', kind: 'gewerbe', x: scn.towns[0].x, y: scn.towns[0].y, bma: true });
    const game = new Game(scn, { seed: 1 });
    const p = game.addPlayer('Tablet', 'dispatcher');
    game.handle(p.id, { a: 'start' });
    const call = game.spawnBma()!;
    game.handle(p.id, { a: 'answerCall', callId: call.id });
    const r = game.handle(p.id, { a: 'createIncident', callId: call.id, stichwort: 'B BMA', address: call.bma!.address, x: call.bma!.x, y: call.bma!.y, note: '', patients: 0, alarmAao: true });
    expect(r).toBeUndefined();
    expect(game.incidents[0].unitIds.length).toBeGreaterThan(0);
  });

  it('nutzt die Würzburger Rufgruppen und hat Christoph 18', () => {
    const scn = wue();
    const names = scn.tmoGroups!.map((g) => g.name);
    expect(names).toEqual(expect.arrayContaining(['3737 RD_WÜ', '3713 RD_WÜ#', '3772 FW_WÜ', '3782 FW_WÜ#', '3775 WR_WÜ', '3701 SONDER', '3705 SONDER']));
    const st = (n: string) => scn.stations.find((s) => s.name === n)!;
    expect(st('BF Würzburg').tmo).toBe('fw_wue');
    expect(st('FF Rimpar').tmo).toBe('fw_wue_l');
    expect(st('Rettungswache Würzburg BRK').tmo).toBe('rd_wue');
    expect(st('Rettungswache Arnstein').tmo).toBe('rd_wue_l');
    expect(st('Wasserwacht OG Gerbrunn').tmo).toBe('wr_wue');
    const rth = scn.stations.flatMap((s) => s.vehicles).find((v) => v.callsign === 'Christoph 18')!;
    expect(rth.type).toBe('RTH');
    const d = new Date(2026, 5, 21);
    expect(inDienst(rth.dienst, d, 21 * 60)).toBe(true);
    expect(inDienst(rth.dienst, d, 22 * 60)).toBe(false);
    expect(inDienst(rth.dienst, new Date(2026, 11, 21), 17 * 60)).toBe(false);
    expect(Math.abs(sunsetMinute(new Date(2026, 9, 20)) - (18 * 60 + 15))).toBeLessThan(10);
  });

  it('lässt den Hubschrauber in Luftlinie fliegen', () => {
    const scn = quiet();
    const st = scn.stations[0];
    st.vehicles.push({ id: 'v_rth', callsign: 'Christoph 99', type: 'RTH' });
    if (!scn.vehicleTypes.some((t) => t.id === 'RTH')) scn.vehicleTypes.push({ id: 'RTH', label: 'RTH', org: 'RD', funkNr: 0, fills: ['RTH', 'NEF'], speedFactor: 1, air: true });
    const game = new Game(scn, { seed: 2 });
    const p = game.addPlayer('D', 'dispatcher');
    game.handle(p.id, { a: 'start' });
    const far = scn.towns.reduce((a, b) => (Math.hypot(b.x - st.x, b.y - st.y) > Math.hypot(a.x - st.x, a.y - st.y) ? b : a));
    game.handle(p.id, { a: 'createIncident', stichwort: 'RD 2', address: 'x', x: far.x, y: far.y, note: '', patients: 1, alarmUnitIds: ['v_rth'] });
    const u = game.units.find((x) => x.id === 'v_rth')!;
    run(game, 200_000);
    expect(u.task === 'toScene' || u.task === 'onScene').toBe(true);
    const d = Math.hypot(far.x - st.x, far.y - st.y);
    run(game, (d / 61) * 1000 + 5000);
    expect(u.task).toBe('onScene');
  });

  it('vermittelt an die KVB und nimmt Übergaben an', () => {
    const scn = quiet();
    const game = new Game(scn, { seed: 3 });
    const p = game.addPlayer('CT', 'calltaker');
    game.handle(p.id, { a: 'start' });
    const c1 = game.spawnCall('kvb_fieber')!;
    game.handle(p.id, { a: 'answerCall', callId: c1.id });
    let before = game.score.points;
    game.handle(p.id, { a: 'transferKvb', callId: c1.id });
    expect(c1.toKvb).toBe(true);
    expect(game.score.points).toBeGreaterThan(before);
    const c2 = game.spawnCall('rd_chest')!;
    game.handle(p.id, { a: 'answerCall', callId: c2.id });
    before = game.score.points;
    game.handle(p.id, { a: 'transferKvb', callId: c2.id });
    expect(game.score.points).toBeLessThan(before - 20);
    const k = game.spawnKvb('rd_stroke')!;
    expect(k.kind).toBe('kvb');
    game.handle(p.id, { a: 'answerCall', callId: k.id });
    expect(k.transcript[0].text).toMatch(/Übergabe KVB 116117: plötzliche Sprachstörung/);
    expect(game.handle(p.id, { a: 'createIncident', callId: k.id, stichwort: 'RD 2', address: k.kvb!.address, x: k.kvb!.x, y: k.kvb!.y, note: '', patients: 1 })).toBeUndefined();
  });

  it('erwartet die Polizei bei Verkehrsunfällen', () => {
    const scn = quiet();
    const game = new Game(scn, { seed: 4 });
    const p = game.addPlayer('D', 'dispatcher');
    game.handle(p.id, { a: 'start' });
    const call = game.spawnCall('thl_vu_leicht')!;
    game.handle(p.id, { a: 'answerCall', callId: call.id });
    const t = (game as unknown as Internals).callTruth.get(call.id)!;
    game.handle(p.id, { a: 'createIncident', callId: call.id, stichwort: 'THL 2', address: t.address, x: t.pos.x, y: t.pos.y, note: '', patients: 1, alarmAao: true });
    const inc = game.incidents[0];
    run(game, 25 * 60_000);
    expect(game.radio.some((m) => /Bitte Polizei verständigen/.test(m.text)) || game.units.some((u) => /Polizei/.test(u.speak?.text ?? ''))).toBe(true);
    const before = game.score.points;
    game.handle(p.id, { a: 'requestPolice', incidentId: inc.id });
    expect(inc.polizei).toBe('angefordert');
    expect(game.score.points).toBe(before + 5);
    run(game, 13 * 60_000);
    expect(inc.polizei === 'vor Ort' || inc.status === 'abgeschlossen').toBe(true);
  });
});
