// Neuronale Sprachausgabe mit Piper (offline): Der Spielserver erzeugt WAV-Dateien, die Oberfläche und Tablets abspielen.
import { type ChildProcess, execFileSync, spawn } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { piperText } from '../shared/aussprache';

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

export const PLATFORM = `${process.platform === 'win32' ? 'win' : process.platform === 'darwin' ? 'mac' : 'linux'}-${process.arch}`;

/** Sucht einen Ordner ab den Startpunkten aufwärts (Entwicklung, entpacktes Programm, macOS-App) */
export function findUp(starts: string[], rel: string, depth = 6): string | undefined {
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

/** Qualitätsstufe aus dem Dateinamen (de_DE-thorsten-medium.onnx); ohne Angabe zählt sie wie low */
function qualitaet(model: string) {
  const base = model.split(/[\\/]/).pop()!;
  if (/-x[-_]low\./.test(base)) return 0;
  if (base.includes('-high.')) return 3;
  if (base.includes('-medium.')) return 2;
  return 1;
}

/** Höchstens so viele Stimmen bleiben gleichzeitig geladen (je Stimme etwa 100 MB Speicher) */
const MAX_PROZESSE = 4;
/** Nach so langer Ruhe wird ein Piper-Prozess beendet */
const RUHEZEIT = 10 * 60_000;

/** Nicht-ASCII-Zeichen als \u-Escape, damit die Eingabe unabhängig von der Konsolen-Codepage (Windows) reines ASCII ist */
const ascii = (s: string) => s.replace(/[\u007f-\uffff]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);

/**
 * Ein dauerhaft laufender Piper-Prozess: Das Modell wird nur einmal geladen, jeder Satz kommt als
 * JSON-Zeile über stdin, Piper meldet die fertige Datei auf stdout. Spart pro Satz das Laden des Modells.
 */
export class Sprecher {
  private p: ChildProcess;
  private offen: { resolve: () => void; reject: (e: Error) => void; timer: NodeJS.Timeout }[] = [];
  private rest = '';
  private ruhe?: NodeJS.Timeout;
  alive = true;

  constructor(exe: string, model: string, tempo: number) {
    this.p = spawn(exe, ['--model', model, '--json-input', '--length_scale', String(1 / tempo)], { cwd: dirname(exe), windowsHide: true });
    this.p.stdout!.setEncoding('utf8');
    this.p.stdout!.on('data', (d: string) => {
      const zeilen = (this.rest + d).split(/\r?\n/);
      this.rest = zeilen.pop()!;
      // Je fertigem Satz eine Zeile mit dem Dateinamen, in der Reihenfolge der Eingabe
      for (const z of zeilen) if (z.trim()) this.fertig()?.resolve();
    });
    this.p.stderr!.on('data', () => undefined);
    this.p.stdin!.on('error', () => undefined);
    this.p.on('error', (e) => this.ende(e));
    this.p.on('close', (code) => this.ende(new Error(`Piper beendet mit ${code}`)));
    this.warte();
  }

  private fertig() {
    const f = this.offen.shift();
    if (f) clearTimeout(f.timer);
    if (!this.offen.length) this.warte();
    return f;
  }

  private warte() {
    clearTimeout(this.ruhe);
    this.ruhe = setTimeout(() => this.stop(), RUHEZEIT);
    this.ruhe.unref?.();
  }

  private ende(e: Error) {
    this.alive = false;
    clearTimeout(this.ruhe);
    for (const f of this.offen.splice(0)) {
      clearTimeout(f.timer);
      f.reject(e);
    }
  }

  /** Spricht einen Satz in die Datei out */
  sprich(text: string, out: string): Promise<void> {
    if (!this.alive) return Promise.reject(new Error('Piper läuft nicht'));
    clearTimeout(this.ruhe);
    return new Promise((resolve, reject) => {
      // Hängt Piper, wird der Prozess beendet; der nächste Satz startet einen neuen
      const timer = setTimeout(() => this.stop(), 20000);
      this.offen.push({ resolve, reject, timer });
      this.p.stdin!.write(`${ascii(JSON.stringify({ text, output_file: out }))}\n`);
    });
  }

  stop() {
    if (!this.alive) return;
    this.alive = false;
    this.p.stdin!.end();
    this.p.kill();
  }
}

export class Piper {
  exe?: string;
  stimmen: Stimme[] = [];
  private cache = new Map<string, Buffer>();
  private running = 0;
  private waiting: (() => void)[] = [];
  broken = false;
  private seq = 0;
  private prozesse = new Map<string, Sprecher>();

  constructor(starts: string[] = []) {
    const all = [...starts, process.env.LST_PIPER ?? '', (process as { resourcesPath?: string }).resourcesPath ?? '', __dirname, process.cwd()].filter(Boolean);
    const bin = process.platform === 'win32' ? 'piper.exe' : 'piper';
    const dir = findUp(all, join('piper', PLATFORM)) ?? findUp(all, join('vendor', 'piper', PLATFORM));
    this.exe = (dir ? [join(dir, 'piper', bin), join(dir, bin)] : []).find((c) => existsSync(c) && statSync(c).isFile());
    if (this.exe && process.platform === 'darwin') {
      // Aus dem Internet geladen: macOS würde das mitgelieferte Programm sonst trotz freigegebener App blockieren
      try {
        execFileSync('xattr', ['-dr', 'com.apple.quarantine', dirname(this.exe)], { stdio: 'ignore' });
      } catch {
        // kein Schreibrecht oder kein Attribut: dann eben so versuchen, selfTest fällt notfalls auf die Systemstimme zurück
      }
    }
    const sdir = findUp(all, 'stimmen') ?? findUp(all, join('vendor', 'stimmen'));
    if (sdir) {
      for (const f of readdirSync(sdir, { recursive: true }) as string[]) {
        if (!f.endsWith('.onnx') || !existsSync(join(sdir, `${f}.json`))) continue;
        const base = f.split(/[\\/]/).pop()!.replace(/\.onnx$/, '');
        const key = Object.keys(NAMEN).find((k) => base.includes(k)) ?? base;
        const [name, geschlecht] = NAMEN[key] ?? [base, 'm'];
        if (statSync(join(sdir, f)).size < 1e6) continue;
        // Liegt eine Stimme in mehreren Qualitätsstufen vor (z. B. altes thorsten-low neben medium), gilt die beste
        const alt = this.stimmen.findIndex((s) => s.id === key);
        if (alt >= 0 && qualitaet(this.stimmen[alt].model) >= qualitaet(f)) continue;
        if (alt >= 0) this.stimmen.splice(alt, 1);
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
    const clean = piperText(text.replace(/\s+/g, ' ').trim()).slice(0, 600);
    const key = `${v.id}|${tempo}|${clean}`;
    const hit = this.cache.get(key);
    if (hit) return hit;
    // Höchstens zwei Sätze gleichzeitig
    if (this.running >= 2) await new Promise<void>((r) => this.waiting.push(r));
    this.running++;
    try {
      // Über eine Datei statt stdout: unter Windows würde die Konsole Binärdaten verändern
      const out = join(tmpdir(), `lst-tts-${process.pid}-${++this.seq}.wav`);
      await this.sprecher(v, tempo).sprich(clean, out);
      let wav: Buffer;
      try {
        wav = existsSync(out) ? readFileSync(out) : Buffer.alloc(0);
      } finally {
        rmSync(out, { force: true });
      }
      if (wav.length <= 44) throw new Error('Piper hat nichts gesprochen');
      this.cache.set(key, wav);
      if (this.cache.size > 200) this.cache.delete(this.cache.keys().next().value!);
      return wav;
    } finally {
      this.running--;
      this.waiting.shift()?.();
    }
  }

  /** Laufender Piper-Prozess für Stimme und Tempo; die zuletzt unbenutzten werden beendet */
  private sprecher(v: Stimme, tempo: number): Sprecher {
    const key = `${v.id}|${tempo}`;
    let s = this.prozesse.get(key);
    if (s && !s.alive) s = undefined;
    if (s) {
      this.prozesse.delete(key);
    } else {
      s = new Sprecher(this.exe!, v.model, tempo);
      while (this.prozesse.size >= MAX_PROZESSE) {
        const [alt, p] = this.prozesse.entries().next().value!;
        p.stop();
        this.prozesse.delete(alt);
      }
    }
    this.prozesse.set(key, s);
    return s;
  }

  /** Alle Piper-Prozesse beenden */
  stop() {
    for (const p of this.prozesse.values()) p.stop();
    this.prozesse.clear();
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
