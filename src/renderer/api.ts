// Zugriff auf die Leitstellen-Bibliothek: über Electron (Dateien) oder im Browser (localStorage).
import { generateScenario } from '../../shared/mapgen';
import type { Scenario } from '../../shared/types';

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

const browserBridge: Bridge = {
  async listScenarios() {
    const all = readAll();
    if (!Object.keys(all).length) {
      const scn = generateScenario({ seed: 4711, towns: 8, name: 'Musterland' });
      all[scn.id] = scn;
      writeAll(all);
    }
    return Object.values(all).map((s) => ({
      id: s.id,
      name: s.name,
      ilsName: s.ilsName,
      towns: s.towns.length,
      vehicles: s.stations.reduce((n, st) => n + st.vehicles.length, 0),
      updated: 0,
    }));
  },
  async loadScenario(id) {
    return readAll()[id];
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
