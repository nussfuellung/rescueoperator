// Für GitHub Actions auf macOS: Apps lokal (ad hoc) signieren, je Chip zippen und latest-mac.yml für die Update-Prüfung schreiben.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
const out = join('release', 'github');
mkdirSync(out, { recursive: true });
const liesmich = readFileSync('scripts/startdateien/LIESMICH-mac.txt', 'utf8');

const files = [];
for (const [chip, from, label] of [
  ['apple-chip', 'release/mac-arm64/rescue.Operator.app', 'Apple-Chip (M1, M2, M3, M4)'],
  ['intel', 'release/mac/rescue.Operator.app', 'Intel-Prozessor'],
]) {
  const dir = join('release', `paket-${chip}`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir);
  execFileSync('ditto', [from, join(dir, 'rescue.Operator.app')]);
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', join(dir, 'rescue.Operator.app')], { stdio: 'inherit' });
  // Piper und Stimmen müssen in der App liegen; auf dem passenden Chip einmal probesprechen
  const res = join(dir, 'rescue.Operator.app', 'Contents', 'Resources');
  const arch = chip === 'apple-chip' ? 'arm64' : 'x64';
  const piper = join(res, 'piper', `mac-${arch}`, 'piper', 'piper');
  const stimme = join(res, 'stimmen', 'thorsten-low', 'de-thorsten-low.onnx');
  for (const f of [piper, stimme]) if (!existsSync(f)) throw new Error(`${f} fehlt in der Mac-App`);
  if (arch === process.arch) {
    const wav = join('release', `probe-${arch}.wav`);
    execFileSync(piper, ['--model', stimme, '--output_file', wav, '--quiet'], { input: 'Probe für den Funk.\n' });
    if (statSync(wav).size < 10000) throw new Error('Piper in der Mac-App hat nichts gesprochen');
    console.log(`Piper in der App (${arch}) spricht: ${statSync(wav).size} Bytes`);
  }
  writeFileSync(join(dir, 'LIESMICH.txt'), liesmich.replace('{CHIP}', label));
  const url = `rescue.Operator-${version}-mac-${chip}.zip`;
  // zip -y behält die Symlinks der Frameworks
  execFileSync('zip', ['-r', '-y', '-q', '-9', join('..', 'github', url), 'rescue.Operator.app', 'LIESMICH.txt'], { cwd: dir });
  const buf = readFileSync(join(out, url));
  files.push({ url, sha512: createHash('sha512').update(buf).digest('base64'), size: buf.length });
}
writeFileSync(
  join(out, 'latest-mac.yml'),
  [
    `version: ${version}`,
    'files:',
    ...files.flatMap((f) => [`  - url: ${f.url}`, `    sha512: ${f.sha512}`, `    size: ${f.size}`]),
    `path: ${files[0].url}`,
    `sha512: ${files[0].sha512}`,
    `releaseDate: '${new Date().toISOString()}'`,
    '',
  ].join('\n'),
);
console.log(files.map((f) => f.url).join('\n'));
