import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { buildVocab, koelnerPhonetik, numbersToDigits, parseNumberWord, postProcess } from '../shared/speechfix';
import type { Scenario } from '../shared/types';

describe('Nachkorrektur der Spracherkennung', () => {
  it('liest Zahlwörter', () => {
    expect(parseNumberWord('zweiundvierzig')).toBe(42);
    expect(parseNumberWord('hundertzwölf')).toBe(112);
    expect(parseNumberWord('zwölf')).toBe(12);
    expect(parseNumberWord('hallo')).toBeNull();
    expect(numbersToDigits('hauptstraße zwölf')).toBe('hauptstraße 12');
    expect(numbersToDigits('kitzingen vierzig strich eins kommen')).toBe('kitzingen 40/1 kommen');
    expect(numbersToDigits('würzburg einundsiebzig zwei', [71])).toBe('würzburg 71/2');
    expect(numbersToDigits('status drei')).toBe('status 3');
  });

  it('Kölner Phonetik fasst ähnliche Schreibweisen zusammen', () => {
    expect(koelnerPhonetik('Müller-Lüdenscheidt')).toBe(koelnerPhonetik('Mueller Luedenscheit'));
    expect(koelnerPhonetik('Kitzingen')).toBe(koelnerPhonetik('kizingen'));
  });

  it('korrigiert Orts- und Straßennamen der Würzburger Karte', () => {
    const scn = JSON.parse(gunzipSync(readFileSync(new URL('../assets/ils-wuerzburg.json.gz', import.meta.url))).toString()) as Scenario;
    const streets = [...new Set(scn.roads.map((r) => r.name).filter(Boolean))];
    const towns = [...scn.towns].sort((a, b) => b.radius - a.radius).map((t) => t.name);
    const vocab = buildVocab([...towns, ...streets], towns);
    expect(postProcess('julius promenade zehn in würzburg', vocab)).toBe('Juliuspromenade 10 in Würzburg');
    expect(postProcess('wir sind in kizingen', vocab)).toBe('wir sind in Kitzingen');
    // Alltagssätze bleiben unverändert
    expect(postProcess('er atmet nicht mehr richtig', vocab)).toBe('er atmet nicht mehr richtig');
    expect(postProcess('was ist passiert', vocab)).toBe('was ist passiert');
  });
});
