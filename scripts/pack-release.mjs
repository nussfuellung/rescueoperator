// Packt die Builds als eine ZIP pro System: Windows (exe), Linux, Mac mit Apple-Chip und Mac mit Intel (je eine .app).
import { cpSync, chmodSync, existsSync, readFileSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';

const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
const name = `rescue.Operator-${version}`;
const work = join('release', 'pakete');
rmSync(work, { recursive: true, force: true });
const vorlage = (f) => readFileSync(join('scripts/startdateien', f), 'utf8');

function need(p) {
  if (!existsSync(p)) throw new Error(`${p} fehlt – erst npm run dist:all bzw. die einzelnen Builds ausführen`);
  return p;
}

function zip(dir, zipName, entries) {
  const file = resolve('release', zipName);
  rmSync(file, { force: true });
  // -y behält Symlinks (Frameworks im .app-Paket), Rechte (ausführbar) bleiben erhalten
  execFileSync('zip', ['-r', '-y', '-q', '-9', file, ...entries], { cwd: dir, stdio: 'inherit' });
  console.log(`release/${zipName}`);
}

// Windows und Linux: Programmordner mit der exe bzw. dem Startprogramm direkt darin, Stimmen unter resources/stimmen
for (const [os, from, readme] of [
  ['windows', 'release/win-unpacked', 'LIESMICH-windows.txt'],
  ['linux', 'release/linux-unpacked', 'LIESMICH-linux.txt'],
]) {
  const dir = join(work, os, name);
  cpSync(need(from), dir, { recursive: true, verbatimSymlinks: true });
  // Seit dem Installer-Build legt electron-builder die Stimmen selbst unter resources/stimmen ab
  if (existsSync('vendor/stimmen') && !existsSync(join(dir, 'resources', 'stimmen'))) cpSync('vendor/stimmen', join(dir, 'resources', 'stimmen'), { recursive: true });
  writeFileSync(join(dir, 'LIESMICH.txt'), vorlage(readme).replace(/\n/g, os === 'windows' ? '\r\n' : '\n'));
  if (os === 'linux') {
    cpSync('scripts/startdateien/start-linux.sh', join(dir, 'Start Linux.sh'));
    for (const f of ['rescue-operator', 'Start Linux.sh']) chmodSync(join(dir, f), 0o755);
    for (const f of ['piper', 'piper_phonemize', 'espeak-ng']) {
      const p = join(dir, 'resources/piper/linux-x64/piper', f);
      if (existsSync(p)) chmodSync(p, 0o755);
    }
  }
  zip(join(work, os), `${name}-${os}.zip`, [name]);
}

// Mac: die .app direkt in der ZIP, lokal (ad hoc) signiert, damit macOS sie nach "Trotzdem öffnen" startet.
// Eine Beglaubigung durch Apple bräuchte ein Entwicklerkonto.
const rcodesign = process.env.RCODESIGN ?? ['vendor/rcodesign/rcodesign'].find((p) => existsSync(p));
for (const [chip, from, label] of [
  ['apple-chip', 'release/mac-arm64/rescue.Operator.app', 'Apple-Chip (M1, M2, M3, M4)'],
  ['intel', 'release/mac/rescue.Operator.app', 'Intel-Prozessor'],
]) {
  const dir = join(work, `mac-${chip}`);
  const app = join(dir, 'rescue.Operator.app');
  cpSync(need(from), app, { recursive: true, verbatimSymlinks: true });
  if (rcodesign) execFileSync(rcodesign, ['sign', app], { stdio: 'ignore' });
  else console.warn('rcodesign fehlt (vendor/rcodesign): Mac-App bleibt unsigniert und startet auf Apple-Chips nicht');
  writeFileSync(join(dir, 'LIESMICH.txt'), vorlage('LIESMICH-mac.txt').replace('{CHIP}', label));
  zip(dir, `${name}-mac-${chip}.zip`, ['rescue.Operator.app', 'LIESMICH.txt']);
}
rmSync(work, { recursive: true, force: true });

// latest-mac.yml: damit die Update-Prüfung auf dem Mac eine neue Version erkennt (installiert wird dort von Hand)
const macFiles = ['apple-chip', 'intel'].map((chip) => {
  const url = `${name}-mac-${chip}.zip`;
  const buf = readFileSync(join('release', url));
  return { url, sha512: createHash('sha512').update(buf).digest('base64'), size: buf.length };
});
writeFileSync(
  join('release', 'latest-mac.yml'),
  [
    `version: ${version}`,
    'files:',
    ...macFiles.flatMap((f) => [`  - url: ${f.url}`, `    sha512: ${f.sha512}`, `    size: ${f.size}`]),
    `path: ${macFiles[0].url}`,
    `sha512: ${macFiles[0].sha512}`,
    `releaseDate: '${new Date().toISOString()}'`,
    '',
  ].join('\n'),
);

// Alles, was auf GitHub ins Release gehört, in einem Ordner sammeln
const gh = join('release', 'github');
rmSync(gh, { recursive: true, force: true });
mkdirSync(gh);
for (const f of [
  `rescue.Operator-Setup-${version}.exe`,
  `rescue.Operator-Setup-${version}.exe.blockmap`,
  'latest.yml',
  `rescue.Operator-${version}.AppImage`,
  'latest-linux.yml',
  `${name}-mac-apple-chip.zip`,
  `${name}-mac-intel.zip`,
  'latest-mac.yml',
]) {
  if (existsSync(join('release', f))) cpSync(join('release', f), join(gh, f));
  else console.warn(`${f} fehlt im Release`);
}
console.log(`GitHub-Release-Dateien: ${gh}`);
