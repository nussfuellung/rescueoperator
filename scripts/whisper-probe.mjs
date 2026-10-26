// Prüft im fertigen Linux-Paket, ob die Spracherkennung über Whisper funktioniert: Modell in den Benutzerordner legen,
// App starten und einen Funkspruch über dieselbe Schnittstelle erkennen lassen, die die Oberfläche benutzt.
// Aufruf: xvfb-run -a node scripts/whisper-probe.mjs <app> <funkspruch.wav> [ggml-base-q5_1.bin]
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { _electron } from 'playwright-core';

const [exe, wav, modell] = process.argv.slice(2);
const app = await _electron.launch({ executablePath: exe, args: ['--no-sandbox'], env: { ...process.env, LST_NO_UPDATE: '1' } });
try {
  if (modell) {
    const userData = await app.evaluate(({ app }) => app.getPath('userData'));
    mkdirSync(join(userData, 'sprachmodell'), { recursive: true });
    copyFileSync(modell, join(userData, 'sprachmodell', 'ggml-base-q5_1.bin'));
  }
  // Erst der Splash, dann das Spielfenster
  let win;
  for (let i = 0; i < 60 && !win; i++) {
    win = app.windows().find((w) => w.url().includes('index.html'));
    if (!win) await new Promise((r) => setTimeout(r, 500));
  }
  if (!win) throw new Error('Spielfenster nicht gefunden');
  const info = await win.evaluate(() => window.lst.whisperInfo());
  console.log('whisperInfo:', JSON.stringify(info));
  if (!info.available) throw new Error('whisper-server fehlt im Paket');
  if (modell) {
    const t0 = Date.now();
    const text = await win.evaluate(async (bytes) => {
      const b = new Uint8Array(bytes);
      const v = new DataView(b.buffer);
      const pcm = new Float32Array((b.length - 44) / 2);
      for (let i = 0; i < pcm.length; i++) pcm[i] = v.getInt16(44 + i * 2, true) / 32768;
      return window.lst.whisperTranscribe(pcm, 'base', 'Funkverkehr der Integrierten Leitstelle Würzburg.');
    }, [...readFileSync(wav)]);
    console.log(`Erkannt in ${Date.now() - t0} ms (mit Modellstart): ${text}`);
    if (!/rzburg/i.test(text) || !/status/i.test(text)) throw new Error('Funkspruch nicht erkannt');
  }
} finally {
  await app.close();
}
