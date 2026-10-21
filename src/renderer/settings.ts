// Lokale Einstellungen pro Arbeitsplatz (Ton, Sprache, Fenster, Karte, Farbschema).
import { useSyncExternalStore } from 'react';

export type TtsEngine = 'auto' | 'piper' | 'browser' | 'system';
export type Theme = 'dark' | 'light' | 'system';

export interface Settings {
  ttsEnabled: boolean;
  ttsEngine: TtsEngine;
  readRadio: boolean;
  readCaller: boolean;
  ringtone: boolean;
  sttEnabled: boolean;
  sttMode: 'continuous' | 'ptt';
  pttKey: string;
  /** gewähltes Mikrofon, leer = Standardgerät */
  micDeviceId: string;
  mapTiles: boolean;
  tileUrl: string;
  theme: Theme;
}

export const DEFAULT_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

const DEFAULTS: Settings = {
  ttsEnabled: true,
  ttsEngine: 'auto',
  readRadio: true,
  readCaller: true,
  ringtone: true,
  sttEnabled: false,
  sttMode: 'ptt',
  pttKey: 'F4',
  micDeviceId: '',
  mapTiles: true,
  tileUrl: DEFAULT_TILE_URL,
  theme: 'dark',
};

const KEY = 'lst.settings';
let current: Settings = load();
const listeners = new Set<() => void>();

function load(): Settings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return { ...DEFAULTS };
  }
}

export function getSettings(): Settings {
  return current;
}

export function updateSettings(patch: Partial<Settings>) {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* nicht kritisch */
  }
  listeners.forEach((l) => l());
}

export function useSettings(): Settings {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => current,
  );
}

export function subscribeSettings(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
