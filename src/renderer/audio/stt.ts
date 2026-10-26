// Offline-Spracherkennung für Notrufgespräche und Funk: Whisper in der Desktop-App, Vosk im Browser oder als Alternative.
import { useEffect, useSyncExternalStore } from 'react';
import { getSettings, subscribeSettings } from '../settings';
import { onSpeaking, stopSpeaking } from './tts';
import type { Model, KaldiRecognizer } from 'vosk-browser';
import { postProcess, type Vocab } from '../../../shared/speechfix';
import { WHISPER_RATE, type WhisperModell } from '../../../shared/whisper';

/** Audio vor dem Drücken der Sprechtaste mitnehmen (Anfang des ersten Worts) */
const PREROLL_BUFFERS = 4;
/** Nach dem Loslassen noch kurz weiterhören (Ende des letzten Worts) */
const POSTROLL_MS = 450;
/** Freisprechen mit Whisper: so lange Stille beendet eine Äußerung */
const PAUSE_MS = 800;
/** Längere Äußerungen werden zwischendurch erkannt */
const MAX_SEKUNDEN = 25;

export type SttStatus = 'aus' | 'lädt' | 'bereit' | 'fehler';

interface Target {
  id: string;
  priority: number;
  onText: (text: string) => void;
  /** Bei Freisprechen: Mikrofon offen, solange dieses Ziel aktiv ist */
  continuous?: boolean;
}

interface Snapshot {
  status: SttStatus;
  error?: string;
  listening: boolean;
  partial: string;
  level: number;
  targetId?: string;
  /** zuletzt erkannter Satz und wohin er ging */
  lastHeard?: { text: string; target?: string; at: number };
  /** Name des benutzten Mikrofons */
  device?: string;
}

class SpeechInput {
  snap: Snapshot = { status: 'aus', listening: false, partial: '', level: 0 };
  private listeners = new Set<() => void>();
  private model?: Model;
  private recognizer?: KaldiRecognizer;
  private ctx?: AudioContext;
  private stream?: MediaStream;
  private targets: Target[] = [];
  private pttHeld = false;
  private ttsSpeaking = false;
  private loadingUrl?: string;
  private source?: MediaStreamAudioSourceNode;
  private proc?: ScriptProcessorNode;
  private ring: AudioBuffer[] = [];
  private tailUntil = 0;
  private tailTimer?: ReturnType<typeof setTimeout>;
  private vocab?: Vocab;
  private funkNrs: number[] = [];
  private engine: 'vosk' | 'whisper' = 'vosk';
  private whisperModell: WhisperModell = 'small';
  /** Vorgabetext für Whisper mit Orten und Funkrufnamen der Karte */
  private prompt = '';
  /** Whisper: Audio der laufenden Äußerung */
  private aufnahme: Float32Array[] = [];
  private sprache = false;
  private stilleSeit = 0;
  private offen = 0;
  private kette: Promise<void> = Promise.resolve();

  /** Orts-, Straßen- und Funkrufnamen der aktuellen Karte für die Nachkorrektur */
  setVocabulary(vocab: Vocab | undefined, funkNrs: number[] = [], prompt = '') {
    this.vocab = vocab;
    this.funkNrs = funkNrs;
    this.prompt = prompt;
  }

  constructor() {
    onSpeaking((s) => {
      this.ttsSpeaking = s;
      this.update();
    });
    subscribeSettings(() => this.update());
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getSnapshot = () => this.snap;

  private set(patch: Partial<Snapshot>) {
    this.snap = { ...this.snap, ...patch };
    this.listeners.forEach((l) => l());
  }

  /** Lädt das Modell (einmalig) und öffnet das Mikrofon */
  async load(modelUrl: string) {
    if (this.loadingUrl === modelUrl && this.snap.status !== 'fehler') return;
    this.loadingUrl = modelUrl;
    this.set({ status: 'lädt', error: undefined });
    try {
      this.model?.terminate();
      this.engine = 'vosk';
      const { createModel } = await import('vosk-browser');
      this.model = await createModel(modelUrl);
      this.ctx = new AudioContext();
      const rec = new this.model.KaldiRecognizer(this.ctx.sampleRate);
      this.recognizer = rec;
      rec.on('result', (m) => {
        this.set({ partial: '' });
        this.ergebnis((m as { result: { text: string } }).result.text);
      });
      rec.on('partialresult', (m) => {
        const p = (m as { result: { partial: string } }).result.partial;
        if (p !== this.snap.partial) this.set({ partial: p });
      });
      await this.openMic();
      this.set({ status: 'bereit' });
      this.update();
    } catch (e) {
      this.set({ status: 'fehler', error: explain(e) });
    }
  }

  /** Whisper (Desktop-App): startet whisper-server mit dem Modell und öffnet das Mikrofon */
  async loadWhisper(m: WhisperModell) {
    const key = `whisper:${m}`;
    if (this.loadingUrl === key && this.snap.status !== 'fehler') return;
    this.loadingUrl = key;
    this.set({ status: 'lädt', error: undefined });
    try {
      this.model?.terminate();
      this.model = undefined;
      this.recognizer = undefined;
      this.engine = 'whisper';
      this.whisperModell = m;
      await window.lst!.whisperPrepare!(m);
      if (!this.ctx || this.ctx.state === 'closed') this.ctx = new AudioContext();
      await this.openMic();
      this.set({ status: 'bereit' });
      this.update();
    } catch (e) {
      this.set({ status: 'fehler', error: explain(e) });
    }
  }

  /** Erkannten Text an das aktive Ziel geben */
  private ergebnis(text: string) {
    // Einzelne Silben und Geräusche ignorieren
    const raw = text.replace(/\[unk\]/g, '').trim();
    if (raw.length < 3 || !/[a-zäöüß]{2}/i.test(raw)) return;
    const clean = postProcess(raw, this.vocab, this.funkNrs);
    const t = this.activeTarget();
    this.set({ lastHeard: { text: clean, target: t?.id, at: Date.now() } });
    t?.onText(clean);
  }

  /** Whisper: Audio sammeln; beim Freisprechen beendet eine Pause die Äußerung */
  private aufnehmen(data: Float32Array, rate: number) {
    this.aufnahme.push(new Float32Array(data));
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) sum += data[i] * data[i];
    const laut = Math.sqrt(sum / (data.length / 4)) > 0.015;
    const now = Date.now();
    if (laut) {
      this.sprache = true;
      this.stilleSeit = 0;
    } else if (this.sprache && !this.stilleSeit) this.stilleSeit = now;
    // Beim Freisprechen keine lange Stille vor der Äußerung mitschicken, nur den kurzen Vorlauf
    if (!this.sprache && !this.pttHeld && this.aufnahme.length > PREROLL_BUFFERS) this.aufnahme.shift();
    const pause = !this.pttHeld && this.sprache && this.stilleSeit && now - this.stilleSeit > PAUSE_MS;
    const lang = this.aufnahme.length * data.length > MAX_SEKUNDEN * rate;
    if (this.snap.listening && (pause || lang)) this.whisperAbschluss();
  }

  /** Whisper: gesammelte Äußerung erkennen lassen (der Reihe nach, damit die Reihenfolge stimmt) */
  private whisperAbschluss() {
    const teile = this.aufnahme;
    this.aufnahme = [];
    this.sprache = false;
    this.stilleSeit = 0;
    const ctx = this.ctx;
    const n = teile.reduce((a, t) => a + t.length, 0);
    if (!ctx || n < ctx.sampleRate * 0.3) return;
    const pcm = new Float32Array(n);
    let o = 0;
    for (const t of teile) {
      pcm.set(t, o);
      o += t.length;
    }
    let peak = 0;
    for (let i = 0; i < pcm.length; i += 8) peak = Math.max(peak, Math.abs(pcm[i]));
    // Nur Rauschen: Whisper würde sonst Untertitel-Floskeln erfinden
    if (peak < 0.03) return;
    const rate = ctx.sampleRate;
    const m = this.whisperModell;
    const prompt = this.prompt;
    this.offen++;
    this.set({ partial: '…' });
    this.kette = this.kette.then(async () => {
      try {
        this.ergebnis(await window.lst!.whisperTranscribe!(await auf16k(pcm, rate), m, prompt));
      } catch (e) {
        console.warn('Whisper', e);
      } finally {
        if (--this.offen === 0) this.set({ partial: '' });
      }
    });
  }

  /** Mikrofon (neu) öffnen, z. B. nach Gerätewechsel */
  async openMic() {
    if (!this.ctx || (this.engine === 'vosk' && !this.recognizer)) return;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.source?.disconnect();
    this.proc?.disconnect();
    const deviceId = getSettings().micDeviceId;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1, ...(deviceId ? { deviceId: { exact: deviceId } } : {}) },
      });
    } catch (e) {
      // Gewähltes Gerät gibt es nicht mehr: Standardmikrofon nehmen
      if (!deviceId) throw e;
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
    }
    this.source = this.ctx.createMediaStreamSource(this.stream);
    const proc = this.ctx.createScriptProcessor(4096, 1, 1);
    this.proc = proc;
    proc.onaudioprocess = (e) => {
      const data = e.inputBuffer.getChannelData(0);
      let peak = 0;
      for (let i = 0; i < data.length; i += 16) peak = Math.max(peak, Math.abs(data[i]));
      if (Math.abs(peak - this.snap.level) > 0.03) this.set({ level: peak });
      if (this.snap.listening || Date.now() < this.tailUntil) {
        if (this.engine === 'whisper') this.aufnehmen(data, e.inputBuffer.sampleRate);
        else this.recognizer?.acceptWaveform(e.inputBuffer);
      } else {
        // Ringpuffer: die letzten Blöcke vor dem Drücken der Sprechtaste
        const copy = this.ctx!.createBuffer(1, data.length, e.inputBuffer.sampleRate);
        copy.copyToChannel(data, 0);
        this.ring.push(copy);
        if (this.ring.length > PREROLL_BUFFERS) this.ring.shift();
      }
    };
    this.source.connect(proc);
    proc.connect(this.ctx.destination);
    // Ohne Nutzeraktion startet der Audio-Kontext manchmal angehalten
    if (this.ctx.state === 'suspended') await this.ctx.resume().catch(() => {});
    this.set({ device: this.stream.getAudioTracks()[0]?.label || 'Standardmikrofon' });
  }

  unload() {
    this.stream?.getTracks().forEach((t) => t.stop());
    void this.ctx?.close();
    this.model?.terminate();
    this.model = undefined;
    this.recognizer = undefined;
    this.loadingUrl = undefined;
    this.aufnahme = [];
    this.set({ status: 'aus', listening: false, partial: '' });
  }

  register(t: Target) {
    this.targets = [...this.targets.filter((x) => x.id !== t.id), t];
    this.update();
    return () => {
      this.targets = this.targets.filter((x) => x.id !== t.id);
      this.update();
    };
  }

  private activeTarget(): Target | undefined {
    return [...this.targets].sort((a, b) => b.priority - a.priority)[0];
  }

  setPtt(held: boolean) {
    this.pttHeld = held;
    if (held) {
      // Wer spricht, unterbricht die Sprachausgabe
      stopSpeaking();
      this.ttsSpeaking = false;
      if (this.ctx?.state === 'suspended') void this.ctx.resume();
    }
    this.update();
  }

  private update() {
    const t = this.activeTarget();
    const s = getSettings();
    const want =
      this.snap.status === 'bereit' &&
      (!this.ttsSpeaking || this.pttHeld) &&
      // Sprechtaste hört immer zu (auch ohne Ziel, damit man sieht, was erkannt wird)
      (this.pttHeld || (s.sttMode === 'continuous' && !!t?.continuous));
    if (want !== this.snap.listening || t?.id !== this.snap.targetId) {
      if (want && !this.snap.listening) {
        clearTimeout(this.tailTimer);
        this.tailUntil = 0;
        // Vorlauf einspeisen, damit das erste Wort nicht abgeschnitten wird
        if (this.engine === 'whisper') {
          this.aufnahme = this.ring.map((b) => new Float32Array(b.getChannelData(0)));
          this.sprache = false;
          this.stilleSeit = 0;
        } else for (const b of this.ring) this.recognizer?.acceptWaveform(b);
        this.ring = [];
      }
      if (!want && this.snap.listening) {
        // Nachlauf: kurz weiterhören, dann den Rest als Endergebnis abholen
        this.tailUntil = Date.now() + POSTROLL_MS;
        clearTimeout(this.tailTimer);
        this.tailTimer = setTimeout(() => {
          this.tailUntil = 0;
          if (this.snap.listening) return;
          if (this.engine === 'whisper') this.whisperAbschluss();
          else this.recognizer?.retrieveFinalResult();
        }, POSTROLL_MS + 50);
      }
      this.set({ listening: want, targetId: t?.id });
    }
  }
}

/** Whisper braucht 16 kHz, das Mikrofon liefert meist 48 kHz */
async function auf16k(pcm: Float32Array, rate: number): Promise<Float32Array> {
  if (rate === WHISPER_RATE) return pcm;
  const off = new OfflineAudioContext(1, Math.ceil((pcm.length * WHISPER_RATE) / rate), WHISPER_RATE);
  const buf = off.createBuffer(1, pcm.length, rate);
  buf.copyToChannel(pcm as Float32Array<ArrayBuffer>, 0);
  const src = off.createBufferSource();
  src.buffer = buf;
  src.connect(off.destination);
  src.start();
  return (await off.startRendering()).getChannelData(0);
}

/** Verständliche Fehlermeldung für Mikrofon- und Modellprobleme */
function explain(e: unknown): string {
  const err = e as { name?: string; message?: string };
  if (err?.name === 'NotAllowedError' || err?.name === 'SecurityError')
    return 'Mikrofonzugriff verweigert. Unter Windows: Einstellungen → Datenschutz und Sicherheit → Mikrofon → „Desktop-Apps Zugriff auf das Mikrofon erlauben“ einschalten.';
  if (err?.name === 'NotFoundError' || err?.name === 'OverconstrainedError') return 'Kein Mikrofon gefunden. Ist ein Headset oder Mikrofon angeschlossen?';
  if (err?.name === 'NotReadableError') return 'Das Mikrofon wird gerade von einem anderen Programm benutzt (z. B. Teams oder Discord).';
  return String(err?.message ?? e);
}

export const speechInput = new SpeechInput();

export function useSpeechInput(): Snapshot {
  return useSyncExternalStore(speechInput.subscribe, speechInput.getSnapshot);
}

/** Registriert ein Ziel für erkannten Text, solange die Komponente sichtbar ist */
export function useSpeechTarget(id: string, priority: number, onText: ((t: string) => void) | null, continuous = false) {
  useEffect(() => {
    if (!onText) return;
    return speechInput.register({ id, priority, onText, continuous });
  }, [id, priority, !!onText, continuous]);
}

/** Taste für Sprechen (Push-to-Talk) in allen Fenstern abhören */
export function attachPttKeys(win: Window) {
  const down = (e: KeyboardEvent) => {
    if (e.key === getSettings().pttKey && !e.repeat) {
      e.preventDefault();
      speechInput.setPtt(true);
    }
  };
  const up = (e: KeyboardEvent) => {
    if (e.key === getSettings().pttKey) {
      e.preventDefault();
      speechInput.setPtt(false);
    }
  };
  const blur = () => speechInput.setPtt(false);
  win.addEventListener('keydown', down);
  win.addEventListener('keyup', up);
  win.addEventListener('blur', blur);
  return () => {
    win.removeEventListener('keydown', down);
    win.removeEventListener('keyup', up);
    win.removeEventListener('blur', blur);
  };
}
