// Zugriff auf die Leitstellen-Bibliothek: über Electron (Dateien) oder im Browser (localStorage).
import { generateScenario } from '../../shared/mapgen';
import type { Scenario } from '../../shared/types';
import type { WhisperModell } from '../../shared/whisper';

export interface ScenarioInfo {
  id: string;
  name: string;
  ilsName: string;
  towns: number;
  vehicles: number;
  updated: number;
}

interface Bridge {
  listScenarios(): Promise<ScenarioInfo[]>;
  loadScenario(id: string): Promise<Scenario>;
  saveScenario(scn: Scenario): Promise<boolean>;
  deleteScenario(id: string): Promise<boolean>;
  exportScenario(scn: Scenario): Promise<boolean>;
  importScenario(): Promise<Scenario | null>;
  startHost(scenarioId: string, port: number): Promise<{ port: number; addresses: string[] }>;
  stopHost(): Promise<boolean>;
  hostStatus(): Promise<{ port: number; addresses: string[] } | null>;
  ttsAvailable?(): Promise<boolean>;
  ttsSpeak?(text: string, voice: number, rate: number): Promise<boolean>;
  ttsStop?(): Promise<void>;
  /** Piper-Stimmen dieses Rechners (für Online-Sitzungen) */
  piperInfo?(): Promise<{ available: boolean; stimmen: { id: string; name: string; geschlecht: 'm' | 'w' }[] } | null>;
  piperSynth?(text: string, stimme: string, tempo: number): Promise<Uint8Array | null>;
  sttInfo?(): Promise<ModelInfo>;
  sttDownload?(): Promise<ModelInfo>;
  sttImport?(): Promise<ModelInfo>;
  sttRemove?(): Promise<ModelInfo>;
  /** Whisper: ob whisper-server mitgeliefert ist und welche Modelle installiert sind */
  whisperInfo?(): Promise<WhisperInfo>;
  whisperDownload?(m: WhisperModell): Promise<WhisperInfo>;
  whisperRemove?(m: WhisperModell): Promise<WhisperInfo>;
  whisperPrepare?(m: WhisperModell): Promise<boolean>;
  whisperTranscribe?(pcm: Float32Array, m: WhisperModell, prompt: string): Promise<string>;
  onSttProgress?(fn: (p: { got: number; total: number; converting?: boolean }) => void): () => void;
  fetchText?(url: string, body?: string): Promise<string>;
}

export interface WhisperInfo {
  available: boolean;
  installed: WhisperModell[];
}

export interface ModelInfo {
  installed: boolean;
  url: string;
  size?: number;
}

/** Text von einem Kartendienst holen: in der Desktop-App über den Hauptprozess, sonst direkt */
export async function fetchText(url: string, body?: string): Promise<string> {
  if (window.lst?.fetchText) return window.lst.fetchText(url, body);
  const res = await fetch(url, body ? { method: 'POST', body, headers: { 'content-type': 'application/x-www-form-urlencoded' } } : {});
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  return text;
}

declare global {
  interface Window {
    lst?: Bridge;
  }
}

export const isDesktop = !!window.lst;

const KEY = 'lst.scenarios';
function readAll(): Record<string, Scenario> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}');
  } catch {
    return {};
  }
}
function writeAll(all: Record<string, Scenario>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // Speicher voll oder gesperrt: im Browser-Modus nicht kritisch
  }
}

const BUILTIN_ID = 'scn_ils_wuerzburg';
let builtin: Promise<Scenario | null> | null = null;
/** Musterleitstelle ILS Würzburg liegt gepackt neben der Seite (zu groß für den Browserspeicher) */
function loadBuiltin() {
  builtin ??= fetch('./ils-wuerzburg.json.gz')
    .then(async (r) => {
      if (!r.ok || !r.body) return null;
      const text = await new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).text();
      return JSON.parse(text) as Scenario;
    })
    .catch(() => null);
  return builtin;
}

const browserBridge: Bridge = {
  async listScenarios() {
    const all = readAll();
    const b = all[BUILTIN_ID] ? null : await loadBuiltin();
    if (!Object.keys(all).length && !b) {
      const scn = generateScenario({ seed: 4711, towns: 8, name: 'Musterland' });
      all[scn.id] = scn;
      writeAll(all);
    }
    return [...(b ? [b] : []), ...Object.values(all)].map((s) => ({
      id: s.id,
      name: s.name,
      ilsName: s.ilsName,
      towns: s.towns.length,
      vehicles: s.stations.reduce((n, st) => n + st.vehicles.length, 0),
      updated: 0,
    }));
  },
  async loadScenario(id) {
    return readAll()[id] ?? (id === BUILTIN_ID ? ((await loadBuiltin()) as Scenario) : undefined!);
  },
  async saveScenario(scn) {
    const all = readAll();
    all[scn.id] = scn;
    writeAll(all);
    return true;
  },
  async deleteScenario(id) {
    const all = readAll();
    delete all[id];
    writeAll(all);
    return true;
  },
  async exportScenario(scn) {
    const blob = new Blob([JSON.stringify(scn, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${scn.name}.leitstelle.json`;
    a.click();
    return true;
  },
  async importScenario() {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.onchange = async () => {
        const f = input.files?.[0];
        if (!f) return resolve(null);
        const scn = JSON.parse(await f.text()) as Scenario;
        await browserBridge.saveScenario(scn);
        resolve(scn);
      };
      input.click();
    });
  },
  async startHost() {
    throw new Error('Hosten geht nur in der Desktop-App. Im Browser bitte "npm run server" starten und beitreten.');
  },
  async stopHost() {
    return true;
  },
  async hostStatus() {
    return null;
  },
};

export const api: Bridge = window.lst ?? browserBridge;
