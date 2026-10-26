import { describe, expect, it } from 'vitest';
import { wavAusPcm, whisperPrompt, whisperText } from '../shared/whisper';

describe('Whisper-Hilfen', () => {
  it('schreibt 16-Bit-Mono-WAV mit korrektem Kopf', () => {
    const wav = wavAusPcm(new Float32Array([0, 1, -1, 0.5]));
    const v = new DataView(wav.buffer);
    expect(String.fromCharCode(...wav.slice(0, 4))).toBe('RIFF');
    expect(String.fromCharCode(...wav.slice(8, 12))).toBe('WAVE');
    expect(v.getUint32(24, true)).toBe(16000);
    expect(v.getUint16(34, true)).toBe(16);
    expect(v.getUint32(40, true)).toBe(8);
    expect(v.getInt16(46, true)).toBe(32767);
    expect(v.getInt16(48, true)).toBe(-32768);
    expect(wav.length).toBe(44 + 8);
  });

  it('verwirft typische Fehlerkennungen bei Stille', () => {
    expect(whisperText(' Untertitel im Auftrag des ZDF, 2021')).toBe('');
    expect(whisperText('Untertitelung des ZDF für funk, 2017')).toBe('');
    expect(whisperText(' [Musik] ')).toBe('');
    expect(whisperText(' ...')).toBe('');
    expect(whisperText(' Vielen Dank fürs Zuschauen!')).toBe('');
  });

  it('lässt echte Funksprüche stehen und entfernt Geräuschmarken', () => {
    expect(whisperText(' Rotkreuz Würzburg 71/1, Status 4. (Rauschen)')).toBe('Rotkreuz Würzburg 71/1, Status 4.');
  });

  it('baut den Vorgabetext aus Rufnamen und den größten Orten', () => {
    const orte = Array.from({ length: 60 }, (_, i) => `Ort${i}`);
    const p = whisperPrompt('Integrierten Leitstelle Würzburg', ['Rotkreuz Würzburg 71/1'], orte);
    expect(p).toContain('Integrierten Leitstelle Würzburg');
    expect(p).toContain('Rotkreuz Würzburg 71/1');
    expect(p).toContain('Ort39');
    expect(p).not.toContain('Ort40');
  });
});
