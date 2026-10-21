import { describe, expect, it } from 'vitest';
import { generateScenario } from '../shared/mapgen';
import { dateForSeason, seasonOf } from '../shared/jahreszeit';
import { Game } from '../server/game';
import { ALLE_VORLAGEN, GSL_TEMPLATES, SAISON_TEMPLATES, UNWETTER_TEMPLATES } from '../server/lagen';
import { SCHLAGWORTE } from '../shared/schlagworte';
import { DEFAULT_STICHWORTE } from '../shared/catalog';

const scenario = (calls = 14) => {
  const scn = generateScenario({ seed: 4711, towns: 8 });
  scn.settings.callsPerHour = calls;
  scn.settings.bmaPerHour = 0;
  return scn;
};
const run = (game: Game, ms: number) => {
  for (let t = 0; t < ms; t += 1000) game.tick(1000);
};
type Internals = { callTruth: Map<string, { tpl: { id: string } }> };

describe('Jahreszeit, Großschadenslagen und Unwetter', () => {
  it('stellt Uhrzeit und Jahreszeit vor Schichtbeginn ein', () => {
    const game = new Game(scenario(), { seed: 1, startDate: new Date(2026, 9, 21) });
    const p = game.addPlayer('Leiter', 'dispatcher');
    expect(game.publicState().setup?.season).toBe('herbst');
    game.handle(p.id, { a: 'setup', clock: 22 * 60 + 30, season: 'winter', gsl: 'haeufig', unwetter: 'aus' });
    const s = game.publicState();
    expect(s.clockStart).toBe(22 * 60 + 30);
    expect(s.setup).toEqual({ season: 'winter', gsl: 'haeufig', unwetter: 'aus' });
    expect(seasonOf(new Date(s.startDate!))).toBe('winter');
    game.handle(p.id, { a: 'start' });
    expect(game.handle(p.id, { a: 'setup', clock: 8 * 60 })).toBe('Die Schicht läuft bereits');
  });

  it('wählt ein Datum in der Jahreszeit mit gleichem Wochentag', () => {
    const today = new Date(2026, 9, 21);
    for (const s of ['fruehling', 'sommer', 'herbst', 'winter'] as const) {
      const d = dateForSeason(today, s);
      expect(seasonOf(d)).toBe(s);
      expect(d.getDay()).toBe(today.getDay());
    }
    expect(dateForSeason(today, 'herbst').getTime()).toBe(today.getTime());
  });

  it('erzeugt im Winter Wintereinsätze und im Sommer keine', () => {
    const count = (season: 'winter' | 'sommer') => {
      const game = new Game(scenario(), { seed: 7 });
      const p = game.addPlayer('x', 'dispatcher');
      game.handle(p.id, { a: 'setup', season, gsl: 'aus', unwetter: 'aus' });
      const ids: string[] = [];
      const truth = (game as unknown as Internals).callTruth;
      for (let i = 0; i < 400; i++) {
        const c = game.spawnCall();
        if (c) ids.push(truth.get(c.id)!.tpl.id);
      }
      return ids;
    };
    const winter = count('winter');
    const sommer = count('sommer');
    const winterIds = SAISON_TEMPLATES.filter((t) => t.seasons?.includes('winter') && !t.seasons.includes('sommer')).map((t) => t.id);
    expect(winter.some((id) => winterIds.includes(id))).toBe(true);
    expect(sommer.some((id) => winterIds.includes(id))).toBe(false);
    expect(sommer).not.toContain('rd_sturz_glatteis');
    expect(sommer.some((id) => id === 'sz_wespe' || id === 'sz_badeunfall' || id === 'sz_grill')).toBe(true);
  });

  it('meldet ein Unwetter per DWD und hebt die Warnung wieder auf', () => {
    const game = new Game(scenario(), { seed: 3 });
    const p = game.addPlayer('x', 'dispatcher');
    game.handle(p.id, { a: 'setup', gsl: 'aus', unwetter: 'aus' });
    game.handle(p.id, { a: 'start' });
    const lage = game.startUnwetter('sturm', 3)!;
    const dwd = () => game.publicState().dwd!;
    expect(dwd().length).toBe(1);
    expect(dwd()[0].text).toContain('ORKANARTIGEN BÖEN');
    expect(dwd()[0].text).toContain('Stadt und Landkreis');
    run(game, lage.bis - game.time + 2000);
    const kinds = dwd().map((m) => m.kind);
    expect(kinds).toContain('warnung');
    expect(kinds[kinds.length - 1]).toBe('aufhebung');
    // Während der Lage kamen wetterbedingte Notrufe
    const uwIds = new Set(UNWETTER_TEMPLATES.map((t) => t.id));
    const truth = (game as unknown as Internals).callTruth;
    expect([...truth.values()].some((t) => uwIds.has(t.tpl.id))).toBe(true);
  });

  it('Großschadenslage: mehrere Anrufer, ein Einsatz', () => {
    const game = new Game(scenario(0), { seed: 5 });
    const p = game.addPlayer('x', 'dispatcher');
    game.handle(p.id, { a: 'start' });
    const a = game.startGsl('gsl_explosion')!;
    expect(a).toBeTruthy();
    game.handle(p.id, { a: 'answerCall', callId: a.id });
    game.handle(p.id, { a: 'createIncident', callId: a.id, stichwort: 'ABC EXPLOSION', address: 'x', x: 0, y: 0, note: '', patients: 4 });
    game.handle(p.id, { a: 'endCall', callId: a.id });
    const weitere: string[] = [];
    for (let t = 0; t < 10 * 60; t++) {
      game.tick(1000);
      for (const c of game.calls) {
        if (c.state !== 'ringing' || c.kind !== '112') continue;
        weitere.push(c.id);
        game.handle(p.id, { a: 'answerCall', callId: c.id });
        if (weitere.length === 1) {
          game.handle(p.id, { a: 'createIncident', callId: c.id, stichwort: 'ABC EXPLOSION', address: 'x', x: 0, y: 0, note: '', patients: 4 });
        }
        game.handle(p.id, { a: 'endCall', callId: c.id });
      }
    }
    expect(weitere.length).toBeGreaterThanOrEqual(2);
    expect(game.score.events.some((e) => e.text.includes('doppelter Einsatz'))).toBe(true);
    expect(game.score.events.some((e) => e.text.includes('Weitere Meldung zur bekannten Lage'))).toBe(true);
  });

  it('alle neuen Vorlagen haben gültige Stichworte', () => {
    const codes = new Set(DEFAULT_STICHWORTE.map((s) => s.code));
    for (const t of [...SAISON_TEMPLATES, ...UNWETTER_TEMPLATES, ...GSL_TEMPLATES]) {
      expect(codes.has(t.stichwort), t.id).toBe(true);
      for (const a of t.auchRichtig ?? []) expect(codes.has(a), `${t.id} ${a}`).toBe(true);
    }
    expect(new Set(ALLE_VORLAGEN.map((t) => t.id)).size).toBe(ALLE_VORLAGEN.length);
    expect(SCHLAGWORTE.length).toBeGreaterThan(0);
  });
});
