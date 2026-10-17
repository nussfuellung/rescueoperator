// Sprachausgabe mit Warteschlange: Browser-Stimmen (Web Speech) oder Systemstimme über Electron.
import { getSettings } from '../settings';
import { isMuted } from '../sound';

export type Voice = 'radio' | 'caller';

interface Item {
  text: string;
  voice: Voice;
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

function chooseEngine(): 'browser' | 'system' | null {
  const s = getSettings();
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
    if (engine === 'browser') {
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

/** Liefert, welche Ausgabe zuletzt funktioniert hat ("browser", "system" oder "fehler") */
export function lastTtsResult() {
  return lastResult;
}

export function say(text: string, voice: Voice = 'radio', force = false) {
  const s = getSettings();
  if (!force && (!s.ttsEnabled || isMuted())) return;
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return;
  // Bei Rückstau alte Funksprüche verwerfen, damit die Ausgabe aktuell bleibt
  if (queue.length > 4) queue.splice(0, queue.length - 4);
  queue.push({ text: clean, voice });
  void pump();
}

export function stopSpeaking() {
  queue.length = 0;
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  window.lst?.ttsStop?.();
}

export function ttsInfo() {
  return {
    browserVoices: germanVoices().map((v) => v.name),
    allBrowserVoices: 'speechSynthesis' in window ? window.speechSynthesis.getVoices().length : 0,
    system: systemAvailable(),
  };
}

/** Funkkenner für die Sprachausgabe lesbar machen: "40/1" -> "40 1" */
export function radioSpeech(callsign: string, text: string) {
  return `${callsign.replace(/(\d+)\/(\d+)/, '$1 $2')}: ${text}`;
}
