// Lädt Piper (neuronale Sprachausgabe) für alle Plattformen und die deutschen Stimmen nach vendor/.
// Wird von npm run dist:all aufgerufen; vorhandene Dateien werden nicht erneut geladen.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const PIPER = 'https://github.com/rhasspy/piper/releases/download/2023.11.14-2';
const VOICES = 'https://github.com/rhasspy/piper/releases/download/v0.0.2';
const platforms = [
  ['win-x64', 'piper_windows_amd64.zip'],
  ['linux-x64', 'piper_linux_x86_64.tar.gz'],
];
// macOS fehlt: Die Piper-Pakete für macOS enthalten die nötigen Bibliotheken nicht. Dort spricht die Systemstimme.
// Thorsten und Kerstin: CC0; Karlsson und Eva: M-AILABS-Datensatz
const voices = ['thorsten-low', 'kerstin-low', 'karlsson-low', 'eva_k-x-low'];

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
