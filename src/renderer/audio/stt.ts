// Offline-Spracherkennung (Vosk im Browser) für Notrufgespräche und Funk.
import { useEffect, useSyncExternalStore } from 'react';
import { getSettings, subscribeSettings } from '../settings';
import { onSpeaking, stopSpeaking } from './tts';
import type { Model, KaldiRecognizer } from 'vosk-browser';

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
      const { createModel } = await import('vosk-browser');
      this.model = await createModel(modelUrl);
      this.ctx = new AudioContext();
      const rec = new this.model.KaldiRecognizer(this.ctx.sampleRate);
      this.recognizer = rec;
      rec.on('result', (m) => {
        const text = (m as { result: { text: string } }).result.text.trim();
        this.set({ partial: '' });
        // Einzelne Silben und Geräusche ignorieren
        const clean = text.replace(/\[unk\]/g, '').trim();
        if (clean.length < 3 || !/[a-zäöüß]{2}/i.test(clean)) return;
        const t = this.activeTarget();
        this.set({ lastHeard: { text: clean, target: t?.id, at: Date.now() } });
        t?.onText(clean);
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

  /** Mikrofon (neu) öffnen, z. B. nach Gerätewechsel */
  async openMic() {
    if (!this.ctx || !this.recognizer) return;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.source?.disconnect();
    this.proc?.disconnect();
    const deviceId = getSettings().micDeviceId;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1, ...(deviceId ? { deviceId: { exact: deviceId } } : {}) },
      });
    } catch (e) {
      // Gewähltes Gerät gibt es nicht mehr: Standardmikrofon nehmen
      if (!deviceId) throw e;
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
    }
    const rec = this.recognizer;
    this.source = this.ctx.createMediaStreamSource(this.stream);
    const proc = this.ctx.createScriptProcessor(4096, 1, 1);
    this.proc = proc;
    proc.onaudioprocess = (e) => {
      const data = e.inputBuffer.getChannelData(0);
      let peak = 0;
      for (let i = 0; i < data.length; i += 16) peak = Math.max(peak, Math.abs(data[i]));
      if (Math.abs(peak - this.snap.level) > 0.03) this.set({ level: peak });
      if (this.snap.listening) rec.acceptWaveform(e.inputBuffer);
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
      // Beim Loslassen den Rest als Endergebnis abholen
      if (!want && this.snap.listening) this.recognizer?.retrieveFinalResult();
      this.set({ listening: want, targetId: t?.id });
    }
  }
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
