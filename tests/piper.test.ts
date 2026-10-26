import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { Piper } from '../server/tts';

// Ein Ersatz-Piper als Shell-Skript: liest JSON-Zeilen, schreibt eine "WAV" und meldet die Datei wie Piper auf stdout.
// Jede Zeile hängt die Prozessnummer an ein Protokoll an, so lässt sich prüfen, dass der Prozess weiterläuft.
const dir = mkdtempSync(join(tmpdir(), 'lst-piper-'));
const log = join(dir, 'aufrufe.txt');
const PLATFORM = `${process.platform === 'win32' ? 'win' : process.platform === 'darwin' ? 'mac' : 'linux'}-${process.arch}`;

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe.skipIf(process.platform === 'win32')('Piper-Anbindung', () => {
  const exeDir = join(dir, 'piper', PLATFORM, 'piper');
  mkdirSync(exeDir, { recursive: true });
  const exe = join(exeDir, 'piper');
  writeFileSync(
    exe,
    `#!/bin/sh
while IFS= read -r line; do
  out=$(printf '%s' "$line" | sed 's/.*"output_file":"\\([^"]*\\)".*/\\1/')
  printf '%s\\n' "$line" >> "${log}.$$"
  head -c 200 /dev/zero > "$out"
  echo "$$" >> "${log}"
  echo "$out"
done
`,
  );
  chmodSync(exe, 0o755);
  for (const [sub, file] of [
    ['thorsten-low', 'de-thorsten-low.onnx'],
    ['thorsten-medium', 'de_DE-thorsten-medium.onnx'],
    ['kerstin-low', 'de-kerstin-low.onnx'],
  ]) {
    mkdirSync(join(dir, 'stimmen', sub), { recursive: true });
    writeFileSync(join(dir, 'stimmen', sub, file), Buffer.alloc(1.1e6));
    writeFileSync(join(dir, 'stimmen', sub, `${file}.json`), '{}');
  }

  it('nimmt von einer Stimme die beste Qualität', () => {
    const p = new Piper([dir]);
    expect(p.stimmen.map((s) => [s.id, s.model.split(/[\\/]/).pop()])).toEqual([
      ['kerstin', 'de-kerstin-low.onnx'],
      ['thorsten', 'de_DE-thorsten-medium.onnx'],
    ]);
  });

  it('lässt Piper laufen und schickt jeden Satz als ASCII-JSON-Zeile', async () => {
    const p = new Piper([dir]);
    try {
      const wavs = await Promise.all(['Erster Satz.', 'Grüße aus Würzburg.', 'Dritter Satz.'].map((t) => p.synth(t, 'thorsten')));
      expect(wavs.every((w) => w.length === 200)).toBe(true);
      await p.synth('Noch ein Satz.', 'thorsten');
      const pids = readFileSync(log, 'utf8').trim().split('\n');
      expect(pids).toHaveLength(4);
      expect(new Set(pids).size).toBe(1);
      const zeilen = readFileSync(`${log}.${pids[0]}`, 'utf8');
      expect(zeilen).toContain('Gr\\u00fc\\u00dfe aus W\\u00fcrzburg');
      expect(/[^\x00-\x7f]/.test(zeilen)).toBe(false);
    } finally {
      p.stop();
    }
  });
});
