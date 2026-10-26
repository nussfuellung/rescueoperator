// Sprachausgabe mit Warteschlange: Piper-Stimmen vom Spielserver, Browser-Stimmen (Web Speech) oder Systemstimme über Electron.
import { sprechText } from '../../../shared/aussprache';
import { conn } from '../net';
import { getSettings } from '../settings';
import { audio, isMuted } from '../sound';

export type Voice = 'radio' | 'caller';

interface Item {
  text: string;
  voice: Voice;
  /** Sprecher (Funkrufname oder Anruf), damit jeder seine eigene Stimme behält */
  speaker?: string;
  /** Geschlecht des Sprechers: Piper wählt dann nur passende Stimmen */
  geschlecht?: 'm' | 'w';
  /** Vorab angeforderte Piper-Ausgabe */
  wav?: Promise<ArrayBuffer | null>;
}

// ---------- Piper (neuronale Stimmen, erzeugt vom Spielserver) ----------
interface PiperInfo {
  available: boolean;
  stimmen: { id: string; name: string; geschlecht: 'm' | 'w' }[];
}
let piper: { base: string; info: Promise<PiperInfo | null>; value?: PiperInfo | null } | null = null;

function httpBase(): string | null {
  const url = conn.snap.url;
  return url ? url.replace(/^ws/, 'http').replace(/\/+$/, '') : null;
}

/** Online-Sitzung in der Desktop-App: Piper-Stimmen dieses Rechners statt des Servers */
const LOKAL = 'lokal';
function piperBase(): string | null {
  if (conn.snap.sitzung && window.lst?.piperSynth) return LOKAL;
  return httpBase();
}

/** Fragt den Server einmal, ob Piper-Stimmen bereitstehen */
export function piperInfo(): Promise<PiperInfo | null> {
  const base = piperBase();
  if (!base) return Promise.resolve(null);
  if (piper?.base !== base) {
    const p: NonNullable<typeof piper> = {
      base,
      info: (base === LOKAL
        ? window.lst!.piperInfo!()
        : fetch(`${base}/tts/info`).then((r) => (r.ok ? (r.json() as Promise<PiperInfo>) : null))
      )
        .catch(() => null)
        .then((v) => (p.value = v)),
    };
    piper = p;
  }
  return piper.info;
}

function piperReady() {
  return !!piper && piper.base === piperBase() && !!piper.value?.available;
}

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function pickStimme(item: Item): string {
  const alle = piper?.value?.stimmen ?? [];
  const passend = item.geschlecht ? alle.filter((v) => v.geschlecht === item.geschlecht) : [];
  const all = passend.length ? passend : alle;
  if (!all.length) return '';
  const key = item.speaker ?? item.voice;
  return all[hash(key) % all.length].id;
}

function fetchPiper(item: Item): Promise<ArrayBuffer | null> {
  const base = piperBase();
  if (!base) return Promise.resolve(null);
  if (base === LOKAL) {
    return window
      .lst!.piperSynth!(item.text, pickStimme(item), item.voice === 'radio' ? 1.1 : 1)
      .then((u) => (u ? (u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer) : null))
      .catch(() => null);
  }
  const q = new URLSearchParams({ text: item.text, stimme: pickStimme(item), tempo: item.voice === 'radio' ? '1.1' : '1' });
  return fetch(`${base}/tts?${q}`)
    .then((r) => (r.ok ? r.arrayBuffer() : null))
    .catch(() => null);
}

let currentSource: AudioBufferSourceNode | null = null;

/** Spielt die WAV ab; Funk klingt nach Funkgerät, Anrufer nach Telefon */
async function playWav(data: ArrayBuffer, voice: Voice): Promise<boolean> {
  const c = audio();
  if (!c) return false;
  const buf = await c.decodeAudioData(data.slice(0)).catch(() => null);
  if (!buf) return false;
  const src = c.createBufferSource();
  src.buffer = buf;
  const hp = c.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = voice === 'radio' ? 350 : 300;
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = voice === 'radio' ? 2800 : 3400;
  const gain = c.createGain();
  gain.gain.value = 0.9;
  let node: AudioNode = src.connect(hp).connect(lp);
  if (voice === 'radio') {
    // leichte Übersteuerung wie beim Handfunkgerät
    const shaper = c.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const x = (i / 255) * 2 - 1;
      curve[i] = Math.tanh(x * 2.2) / Math.tanh(2.2);
    }
    shaper.curve = curve;
    node = node.connect(shaper);
    squelch(c, c.currentTime);
  }
  node.connect(gain).connect(c.destination);
  const start = c.currentTime + (voice === 'radio' ? 0.12 : 0);
  src.start(start);
  currentSource = src;
  return new Promise((resolve) => {
    src.onended = () => {
      if (voice === 'radio') squelch(c, c.currentTime);
      if (currentSource === src) currentSource = null;
      resolve(true);
    };
  });
}

/** Kurzes Rauschen beim Drücken und Loslassen der Sprechtaste */
function squelch(c: AudioContext, at: number) {
  const len = Math.floor(c.sampleRate * 0.09);
  const b = c.createBuffer(1, len, c.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * 0.05 * (1 - i / len);
  const s = c.createBufferSource();
  s.buffer = b;
  s.connect(c.destination);
  s.start(at);
}

const queue: Item[] = [];
let busy = false;
let browserBroken = false;
const speakingListeners = new Set<(speaking: boolean) => void>();

/** Wird aufgerufen, wenn die Ausgabe startet oder endet (z. B. um das Mikrofon stumm zu schalten) */
export function onSpeaking(fn: (speaking: boolean) => void) {
  speakingListeners.add(fn);
  return () => speakingListeners.delete(fn);
}

function setBusy(b: boolean) {
  busy = b;
  speakingListeners.forEach((l) => l(b));
}

function germanVoices(): SpeechSynthesisVoice[] {
  if (!('speechSynthesis' in window)) return [];
  return window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith('de'));
}

// Stimmen werden in Chromium asynchron geladen
if ('speechSynthesis' in window) {
  window.speechSynthesis.getVoices();
  window.speechSynthesis.addEventListener?.('voiceschanged', () => window.speechSynthesis.getVoices());
}

function systemAvailable() {
  return !!window.lst?.ttsSpeak;
}

function chooseEngine(): 'piper' | 'browser' | 'system' | null {
  const s = getSettings();
  if (s.ttsEngine === 'piper') return piperReady() ? 'piper' : null;
  if (s.ttsEngine === 'auto' && piperReady()) return 'piper';
  const hasBrowser = 'speechSynthesis' in window && germanVoices().length > 0 && !browserBroken;
  if (s.ttsEngine === 'browser') return 'speechSynthesis' in window ? 'browser' : null;
  if (s.ttsEngine === 'system') return systemAvailable() ? 'system' : null;
  if (hasBrowser) return 'browser';
  if (systemAvailable()) return 'system';
  return 'speechSynthesis' in window ? 'browser' : null;
}

function speakBrowser(item: Item): Promise<boolean> {
  return new Promise((resolve) => {
    const synth = window.speechSynthesis;
    const u = new SpeechSynthesisUtterance(item.text);
    const voices = germanVoices();
    u.lang = 'de-DE';
    if (voices.length) u.voice = item.voice === 'caller' && voices.length > 1 ? voices[1] : voices[0];
    u.rate = item.voice === 'radio' ? 1.15 : 1.0;
    u.pitch = item.voice === 'caller' && voices.length < 2 ? 1.25 : 1.0;
    let started = false;
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      clearInterval(keepAlive);
      resolve(ok);
    };
    u.onstart = () => (started = true);
    u.onend = () => finish(true);
    u.onerror = () => finish(started);
    // Chromium bleibt bei langen Texten manchmal hängen: regelmäßig fortsetzen
    const keepAlive = setInterval(() => {
      if (synth.paused) synth.resume();
    }, 5000);
    // Startet die Ausgabe nicht, gilt die Browser-Stimme als defekt
    setTimeout(() => {
      if (!started && !done) {
        synth.cancel();
        finish(false);
      }
    }, 2500);
    // Sicherheitsnetz gegen fehlende onend-Ereignisse
    setTimeout(() => finish(true), 4000 + item.text.length * 120);
    (window as unknown as { __lstUtterance?: SpeechSynthesisUtterance }).__lstUtterance = u;
    synth.speak(u);
  });
}

async function speakSystem(item: Item): Promise<boolean> {
  try {
    return await window.lst!.ttsSpeak!(item.text, item.voice === 'caller' ? 1 : 0, item.voice === 'radio' ? 2 : 0);
  } catch {
    return false;
  }
}

async function pump() {
  if (busy) return;
  const item = queue.shift();
  if (!item) return;
  setBusy(true);
  try {
    const engine = chooseEngine();
    let ok = false;
    if (engine === 'piper') {
      const wav = await (item.wav ?? fetchPiper(item));
      ok = !!wav && (await playWav(wav, item.voice));
      // Server liefert nichts: auf Browser- oder Systemstimme ausweichen
      if (!ok && getSettings().ttsEngine === 'auto') {
        if (piper) piper.value = null;
        ok = systemAvailable() ? await speakSystem(item) : await speakBrowser(item);
      }
    } else if (engine === 'browser') {
      ok = await speakBrowser(item);
      if (!ok && getSettings().ttsEngine === 'auto') {
        browserBroken = true;
        if (systemAvailable()) ok = await speakSystem(item);
      }
    } else if (engine === 'system') {
      ok = await speakSystem(item);
    }
    lastResult = ok ? engine : 'fehler';
  } finally {
    setBusy(false);
    if (queue.length) void pump();
  }
}

let lastResult: string | null = null;

/** Liefert, welche Ausgabe zuletzt funktioniert hat ("piper", "browser", "system" oder "fehler") */
export function lastTtsResult() {
  return lastResult;
}

export function say(text: string, voice: Voice = 'radio', force = false, speaker?: string, geschlecht?: 'm' | 'w') {
  const s = getSettings();
  if (!force && (!s.ttsEnabled || isMuted())) return;
  const clean = sprechText(text.replace(/\s+/g, ' ').trim());
  if (!clean) return;
  // Bei Rückstau alte Funksprüche verwerfen, damit die Ausgabe aktuell bleibt
  if (queue.length > 4) queue.splice(0, queue.length - 4);
  const item: Item = { text: clean, voice, speaker, geschlecht };
  void piperInfo();
  // Piper-Ausgabe schon anfordern, während noch etwas anderes gesprochen wird
  if (piperReady() && getSettings().ttsEngine !== 'browser' && getSettings().ttsEngine !== 'system') item.wav = fetchPiper(item);
  queue.push(item);
  void pump();
}

export function stopSpeaking() {
  queue.length = 0;
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  try {
    currentSource?.stop();
  } catch {
    /* schon beendet */
  }
  window.lst?.ttsStop?.();
}

export function ttsInfo() {
  void piperInfo();
  return {
    browserVoices: germanVoices().map((v) => v.name),
    allBrowserVoices: 'speechSynthesis' in window ? window.speechSynthesis.getVoices().length : 0,
    system: systemAvailable(),
    piper: piperReady() ? (piper?.value?.stimmen ?? []).map((v) => v.name) : null,
  };
}

/** Funkkenner für die Sprachausgabe lesbar machen: "40/1" -> "40 1" */
export function radioSpeech(callsign: string, text: string) {
  return `${callsign.replace(/(\d+)\/(\d+)/, '$1 $2')}: ${text}`;
}
