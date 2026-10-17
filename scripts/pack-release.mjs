// Fasst die Builds für Windows, Linux und macOS mit Startdateien in einem Ordner und einer ZIP zusammen.
import { cpSync, chmodSync, existsSync, readFileSync, rmSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
const name = `Leitstellensimulator-${version}`;
const out = join('release', name);
rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'programm'), { recursive: true });

const parts = [
  ['release/win-unpacked', 'programm/windows'],
  ['release/linux-unpacked', 'programm/linux'],
  ['release/mac/Leitstellensimulator.app', 'programm/mac-intel/Leitstellensimulator.app'],
  ['release/mac-arm64/Leitstellensimulator.app', 'programm/mac-apple/Leitstellensimulator.app'],
];
for (const [from, to] of parts) {
  if (!existsSync(from)) throw new Error(`${from} fehlt – erst npm run dist:all bzw. die einzelnen Builds ausführen`);
  // verbatimSymlinks: die Frameworks im .app-Paket bestehen aus Symlinks
  cpSync(from, join(out, to), { recursive: true, verbatimSymlinks: true });
}
const files = [
  ['start-windows.bat', 'Start Windows.bat'],
  ['start-linux.sh', 'Start Linux.sh'],
  ['start-mac.command', 'Start Mac.command'],
  ['LIESMICH.txt', 'LIESMICH.txt'],
];
for (const [from, to] of files) cpSync(join('scripts/startdateien', from), join(out, to));
for (const f of ['Start Linux.sh', 'Start Mac.command', 'programm/linux/leitstellensimulator']) chmodSync(join(out, f), 0o755);

const zip = `${name}.zip`;
rmSync(join('release', zip), { force: true });
// -y behält Symlinks, Rechte (ausführbar) bleiben unter Linux und macOS erhalten
execFileSync('zip', ['-r', '-y', '-q', '-9', zip, name], { cwd: 'release', stdio: 'inherit' });
console.log(`release/${zip}`);
