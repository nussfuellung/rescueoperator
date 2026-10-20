// Neuronale Sprachausgabe mit Piper (offline): Der Spielserver erzeugt WAV-Dateien, die Oberfläche und Tablets abspielen.
import { spawn } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

export interface Stimme {
  id: string;
  name: string;
  /** m = männlich, w = weiblich */
  geschlecht: 'm' | 'w';
  model: string;
}

const NAMEN: Record<string, [string, 'm' | 'w']> = {
  thorsten: ['Thorsten', 'm'],
  karlsson: ['Karlsson', 'm'],
  kerstin: ['Kerstin', 'w'],
  eva_k: ['Eva', 'w'],
  ramona: ['Ramona', 'w'],
  pavoque: ['Pavoque', 'm'],
};

const PLATFORM = `${process.platform === 'win32' ? 'win' : process.platform === 'darwin' ? 'mac' : 'linux'}-${process.arch}`;

/** Sucht einen Ordner ab den Startpunkten aufwärts (Entwicklung, entpacktes Programm, macOS-App) */
function findUp(starts: string[], rel: string, depth = 6): string | undefined {
  for (const s of starts) {
    let d = s;
    for (let i = 0; i <= depth; i++) {
      const p = join(d, rel);
      if (existsSync(p)) return p;
      const up = dirname(d);
      if (up === d) break;
      d = up;
    }
  }
  return undefined;
}

export class Piper {
  exe?: string;
  stimmen: Stimme[] = [];
  private cache = new Map<string, Buffer>();
  private running = 0;
  private waiting: (() => void)[] = [];
  broken = false;
  private seq = 0;

  constructor(starts: string[] = []) {
    const all = [...starts, process.env.LST_PIPER ?? '', (process as { resourcesPath?: string }).resourcesPath ?? '', __dirname, process.cwd()].filter(Boolean);
    const bin = process.platform === 'win32' ? 'piper.exe' : 'piper';
    const dir = findUp(all, join('piper', PLATFORM)) ?? findUp(all, join('vendor', 'piper', PLATFORM));
    this.exe = (dir ? [join(dir, 'piper', bin), join(dir, bin)] : []).find((c) => existsSync(c) && statSync(c).isFile());
    const sdir = findUp(all, 'stimmen') ?? findUp(all, join('vendor', 'stimmen'));
    if (sdir) {
      for (const f of readdirSync(sdir, { recursive: true }) as string[]) {
        if (!f.endsWith('.onnx') || !existsSync(join(sdir, `${f}.json`))) continue;
        const base = f.split(/[\\/]/).pop()!.replace(/\.onnx$/, '');
        const key = Object.keys(NAMEN).find((k) => base.includes(k)) ?? base;
        const [name, geschlecht] = NAMEN[key] ?? [base, 'm'];
        if (statSync(join(sdir, f)).size < 1e6) continue;
        this.stimmen.push({ id: key, name, geschlecht, model: join(sdir, f) });
      }
      this.stimmen.sort((a, b) => a.id.localeCompare(b.id));
    }
  }

  get available() {
    return !!this.exe && this.stimmen.length > 0 && !this.broken;
  }

  info() {
    return { available: this.available, stimmen: this.stimmen.map(({ id, name, geschlecht }) => ({ id, name, geschlecht })) };
  }

  /** Text mit einer Stimme sprechen; Tempo > 1 spricht schneller */
  async synth(text: string, stimme: string, tempo = 1): Promise<Buffer> {
    const v = this.stimmen.find((s) => s.id === stimme) ?? this.stimmen[0];
    if (!this.exe || !v) throw new Error('Piper nicht verfügbar');
    const clean = text.replace(/\s+/g, ' ').trim().slice(0, 600);
    const key = `${v.id}|${tempo}|${clean}`;
    const hit = this.cache.get(key);
    if (hit) return hit;
    // Höchstens zwei Piper-Prozesse gleichzeitig
    if (this.running >= 2) await new Promise<void>((r) => this.waiting.push(r));
    this.running++;
    try {
      // Über eine Datei statt stdout: unter Windows würde die Konsole Binärdaten verändern
      const out = join(tmpdir(), `lst-tts-${process.pid}-${++this.seq}.wav`);
      const wav = await new Promise<Buffer>((resolve, reject) => {
        const p = spawn(this.exe!, ['--model', v.model, '--output_file', out, '--length_scale', String(1 / tempo), '--quiet'], {
          cwd: dirname(this.exe!),
          windowsHide: true,
        });
        p.stdout.on('data', () => undefined);
        p.stderr.on('data', () => undefined);
        p.on('error', reject);
        const timer = setTimeout(() => p.kill(), 20000);
        p.on('close', (code) => {
          clearTimeout(timer);
          try {
            const buf = existsSync(out) ? readFileSync(out) : Buffer.alloc(0);
            rmSync(out, { force: true });
            if (code === 0 && buf.length > 44) resolve(buf);
            else reject(new Error(`Piper beendet mit ${code}`));
          } catch (e) {
            reject(e as Error);
          }
        });
        p.stdin.end(clean + '\n');
      });
      this.cache.set(key, wav);
      if (this.cache.size > 200) this.cache.delete(this.cache.keys().next().value!);
      return wav;
    } finally {
      this.running--;
      this.waiting.shift()?.();
    }
  }

  /** Einmal ausprobieren, ob Piper auf diesem Rechner läuft (z. B. fehlende Bibliotheken unter macOS) */
  async selfTest(): Promise<boolean> {
    if (!this.exe || !this.stimmen.length) return false;
    try {
      await this.synth('Test', this.stimmen[0].id);
      return true;
    } catch {
      this.broken = true;
      return false;
    }
  }
}
