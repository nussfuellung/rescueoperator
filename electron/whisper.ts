// Spracherkennung mit whisper.cpp: whisper-server läuft lokal und hält das Modell im Speicher, die Oberfläche schickt jede Äußerung als WAV.
import { app, net, type WebContents } from 'electron';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, renameSync, statSync, unlinkSync } from 'node:fs';
import { createServer } from 'node:net';
import { availableParallelism } from 'node:os';
import { dirname, join } from 'node:path';
import { findUp, PLATFORM } from '../server/tts';
import { WHISPER_MODELLE, wavAusPcm, whisperText, whisperUrl, type WhisperModell } from '../shared/whisper';

const modelDir = () => {
  const d = join(app.getPath('userData'), 'sprachmodell');
  mkdirSync(d, { recursive: true });
  return d;
};
const modelFile = (m: WhisperModell) => join(modelDir(), WHISPER_MODELLE[m].datei);

let exe: string | undefined | null = null;
function whisperExe() {
  if (exe === null) {
    const starts = [process.resourcesPath, __dirname, process.cwd()].filter(Boolean);
    const dir = findUp(starts, join('whisper', PLATFORM)) ?? findUp(starts, join('vendor', 'whisper', PLATFORM));
    const f = dir && join(dir, process.platform === 'win32' ? 'whisper-server.exe' : 'whisper-server');
    exe = f && existsSync(f) ? f : undefined;
    if (exe && process.platform === 'darwin') {
      // Aus dem Internet geladen: macOS würde das mitgelieferte Programm sonst blockieren (wie bei Piper)
      try {
        execFileSync('xattr', ['-dr', 'com.apple.quarantine', dirname(exe)], { stdio: 'ignore' });
      } catch {
        // kein Schreibrecht oder kein Attribut
      }
    }
  }
  return exe;
}

export function whisperInfo() {
  const installed = (Object.keys(WHISPER_MODELLE) as WhisperModell[]).filter((m) => existsSync(modelFile(m)));
  return { available: !!whisperExe(), installed };
}

export async function downloadWhisper(sender: WebContents, m: WhisperModell) {
  if (!(m in WHISPER_MODELLE)) throw new Error(`Unbekanntes Modell: ${m}`);
  const res = await net.fetch(whisperUrl(m), { headers: { 'user-agent': 'rescue.Operator' } });
  if (!res.ok || !res.body) throw new Error(`Download fehlgeschlagen (HTTP ${res.status})`);
  const total = Number(res.headers.get('content-length') ?? 0);
  const part = `${modelFile(m)}.part`;
  const out = createWriteStream(part);
  const reader = res.body.getReader();
  let got = 0;
  let lastSent = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!out.write(value)) await new Promise<void>((r) => out.once('drain', () => r()));
      got += value.length;
      if (Date.now() - lastSent > 250) {
        lastSent = Date.now();
        sender.send('stt:progress', { got, total });
      }
    }
    await new Promise<void>((r, j) => out.end((e?: Error | null) => (e ? j(e) : r())));
  } catch (e) {
    out.destroy();
    if (existsSync(part)) unlinkSync(part);
    throw e;
  }
  if (total && statSync(part).size !== total) {
    unlinkSync(part);
    throw new Error('Download unvollständig');
  }
  if (server?.modell === m) stopWhisper();
  renameSync(part, modelFile(m));
  return whisperInfo();
}

export function removeWhisper(m: WhisperModell) {
  if (server?.modell === m) stopWhisper();
  if (existsSync(modelFile(m))) unlinkSync(modelFile(m));
  return whisperInfo();
}

let server: { proc: ChildProcess; port: number; modell: WhisperModell; ready: Promise<void> } | null = null;

function freierPort() {
  return new Promise<number>((resolve, reject) => {
    const s = createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const port = (s.address() as { port: number }).port;
      s.close(() => resolve(port));
    });
  });
}

async function starte(m: WhisperModell) {
  if (server?.modell === m && server.proc.exitCode === null) return server;
  stopWhisper();
  const bin = whisperExe();
  if (!bin) throw new Error('whisper-server fehlt in dieser Installation');
  if (!existsSync(modelFile(m))) throw new Error('Whisper-Modell ist nicht installiert');
  const port = await freierPort();
  const threads = Math.max(2, Math.min(8, availableParallelism() - 1));
  const proc = spawn(bin, ['-m', modelFile(m), '-l', 'de', '-t', String(threads), '--host', '127.0.0.1', '--port', String(port)], {
    stdio: 'ignore',
    windowsHide: true,
  });
  const ready = (async () => {
    const bis = Date.now() + 60000;
    while (Date.now() < bis) {
      if (proc.exitCode !== null) throw new Error(`whisper-server beendet (Code ${proc.exitCode})`);
      try {
        if ((await fetch(`http://127.0.0.1:${port}/`)).ok) return;
      } catch {
        // lädt noch das Modell
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error('whisper-server antwortet nicht');
  })();
  const s = { proc, port, modell: m, ready };
  server = s;
  proc.once('exit', () => {
    if (server === s) server = null;
  });
  return s;
}

/** Startet den Server vorab, damit die erste Äußerung nicht aufs Laden des Modells warten muss */
export async function prepareWhisper(m: WhisperModell) {
  await (await starte(m)).ready;
  return true;
}

/** 16-kHz-Mono-PCM erkennen; der Vorgabetext lenkt Whisper auf Orte und Funkrufnamen */
export async function transcribeWhisper(pcm: Float32Array, m: WhisperModell, prompt = '') {
  const s = await starte(m);
  await s.ready;
  const form = new FormData();
  form.append('file', new Blob([wavAusPcm(pcm) as Uint8Array<ArrayBuffer>], { type: 'audio/wav' }), 'sprache.wav');
  form.append('response_format', 'json');
  form.append('temperature', '0');
  form.append('language', 'de');
  if (prompt) form.append('prompt', prompt);
  const res = await fetch(`http://127.0.0.1:${s.port}/inference`, { method: 'POST', body: form });
  if (!res.ok) throw new Error(`Whisper: HTTP ${res.status}`);
  const { text = '' } = (await res.json()) as { text?: string };
  return whisperText(text);
}

export function stopWhisper() {
  server?.proc.kill();
  server = null;
}
