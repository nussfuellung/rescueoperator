// Lädt Piper (neuronale Sprachausgabe) für alle Plattformen und die deutschen Stimmen nach vendor/.
// Wird von npm run dist:all aufgerufen; vorhandene Dateien werden nicht erneut geladen.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const PIPER = 'https://github.com/rhasspy/piper/releases/download/2023.11.14-2';
const VOICES = 'https://github.com/rhasspy/piper/releases/download/v0.0.2';
const HF = 'https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/de/de_DE';
const platforms = [
  ['win-x64', 'piper_windows_amd64.zip'],
  ['linux-x64', 'piper_linux_x86_64.tar.gz'],
];
// macOS: Die offiziellen Mac-Pakete taugen nicht (nur Intel, ohne Bibliotheken). Piper für den Mac baut scripts/piper-mac-bauen.sh.
// Thorsten und Kerstin: CC0; Karlsson und Eva: M-AILABS-Datensatz
// Thorsten in Qualität medium (gleich groß wie low, klingt klarer); die anderen deutschen Stimmen gibt es nur in low.
// thorsten_emotional (CC0) spricht in mehreren Stilen, z. B. aufgeregt für panische Anrufer.
const voices = ['kerstin-low', 'karlsson-low', 'eva_k-x-low'];
const hfVoices = [
  ['thorsten', 'medium'],
  ['thorsten_emotional', 'medium'],
];
// Ältere Stände luden Thorsten in low; die Datei würde sonst weiter mitverpackt
rmSync(join('vendor', 'stimmen', 'thorsten-low'), { recursive: true, force: true });

async function download(url, file) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
}

function extract(file, dir) {
  mkdirSync(dir, { recursive: true });
  // Windows bringt kein unzip mit, sein tar (bsdtar) entpackt aber auch ZIP-Dateien
  if (process.platform === 'win32') execFileSync('tar', ['-xf', file, '-C', dir]);
  else if (file.endsWith('.zip')) execFileSync('unzip', ['-q', '-o', file, '-d', dir]);
  else execFileSync('tar', ['xzf', file, '-C', dir]);
  rmSync(file);
}

const tmp = join('vendor', '.download');
mkdirSync(tmp, { recursive: true });
for (const [dir, asset] of platforms) {
  const target = join('vendor', 'piper', dir);
  if (existsSync(target) && readdirSync(target).length) continue;
  console.log(`Piper ${dir} …`);
  const f = join(tmp, asset);
  await download(`${PIPER}/${asset}`, f);
  extract(f, target);
}
for (const v of voices) {
  const target = join('vendor', 'stimmen', v);
  if (existsSync(target) && readdirSync(target).some((f) => f.endsWith('.onnx'))) continue;
  console.log(`Stimme ${v} …`);
  const f = join(tmp, `${v}.tar.gz`);
  await download(`${VOICES}/voice-de-${v}.tar.gz`, f);
  extract(f, target);
}
for (const [name, q] of hfVoices) {
  const target = join('vendor', 'stimmen', `${name}-${q}`);
  const file = `de_DE-${name}-${q}.onnx`;
  if (existsSync(join(target, file)) && existsSync(join(target, `${file}.json`))) continue;
  console.log(`Stimme ${name}-${q} …`);
  mkdirSync(target, { recursive: true });
  // Erst die Beschreibung, dann das Modell: Piper nimmt nur Modelle mit .json daneben
  await download(`${HF}/${name}/${q}/${file}.json`, join(target, `${file}.json`));
  await download(`${HF}/${name}/${q}/${file}`, join(target, file));
}
// rcodesign signiert die Mac-Apps unter Linux und Windows lokal (ad hoc), nur auf Linux-Build-Rechnern nötig
const RCODESIGN = 'https://github.com/indygreg/apple-platform-rs/releases/download/apple-codesign%2F0.29.0/apple-codesign-0.29.0-x86_64-unknown-linux-musl.tar.gz';
if (process.platform === 'linux' && !existsSync(join('vendor', 'rcodesign', 'rcodesign'))) {
  console.log('rcodesign …');
  const f = join(tmp, 'rcodesign.tar.gz');
  await download(RCODESIGN, f);
  extract(f, join(tmp, 'rcodesign'));
  mkdirSync(join('vendor', 'rcodesign'), { recursive: true });
  execFileSync('sh', ['-c', `cp "$(find ${join(tmp, 'rcodesign')} -name rcodesign -type f)" vendor/rcodesign/rcodesign && chmod +x vendor/rcodesign/rcodesign`]);
}
rmSync(tmp, { recursive: true, force: true });
console.log('Piper, Stimmen und rcodesign bereit.');
