import { describe, expect, it } from 'vitest';
import { classifyQuestion } from '../server/callgen';
import { zipSync } from 'fflate';
import { gunzipSync } from 'fflate';
import { zipToModelTarGz } from '../shared/modelpack';

describe('gesprochene Fragen', () => {
  it('ordnet typische Vosk-Ausgaben (klein, ohne Satzzeichen) zu', () => {
    expect(classifyQuestion('wo ist der notfallort')).toBe('wo');
    expect(classifyQuestion('wo genau befinden sie sich')).toBe('wo');
    expect(classifyQuestion('was ist passiert')).toBe('was');
    expect(classifyQuestion('wie viele personen sind verletzt')).toBe('wieviele');
    expect(classifyQuestion('atmet die person normal')).toBe('zustand');
    expect(classifyQuestion('wie ist ihr name')).toBe('wer');
    expect(classifyQuestion('brennt es noch')).toBe('gefahr');
    expect(classifyQuestion('bleiben sie ruhig')).toBe('beruhigen');
    expect(classifyQuestion('drücken sie fest auf die brust')).toBe('tcpr');
    expect(classifyQuestion('hallo')).toBeNull();
  });
});

describe('Sprachmodell-Paket', () => {
  it('wandelt ein Vosk-ZIP in ein tar.gz mit Ordner model/ um', () => {
    const zip = zipSync({
      'vosk-model-small-de-0.15/am/final.mdl': new Uint8Array([1, 2, 3]),
      'vosk-model-small-de-0.15/conf/model.conf': new TextEncoder().encode('--x=1\n'),
    });
    const tar = gunzipSync(zipToModelTarGz(zip));
    const names: string[] = [];
    for (let off = 0; off + 512 <= tar.length; ) {
      const name = new TextDecoder().decode(tar.subarray(off, off + 100)).replace(/\0.*$/s, '');
      if (!name) break;
      names.push(name);
      const size = parseInt(new TextDecoder().decode(tar.subarray(off + 124, off + 136)).replace(/\0.*$/s, '').trim() || '0', 8);
      off += 512 + Math.ceil(size / 512) * 512;
    }
    expect(names).toContain('model/am/final.mdl');
    expect(names).toContain('model/conf/model.conf');
  });
  it('lehnt ZIPs ohne Modell ab', () => {
    expect(() => zipToModelTarGz(zipSync({ 'readme.txt': new Uint8Array([1]) }))).toThrow();
  });
});
