import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('lst', {
  listScenarios: () => ipcRenderer.invoke('scenarios:list'),
  loadScenario: (id: string) => ipcRenderer.invoke('scenarios:load', id),
  saveScenario: (scn: unknown) => ipcRenderer.invoke('scenarios:save', scn),
  deleteScenario: (id: string) => ipcRenderer.invoke('scenarios:delete', id),
  exportScenario: (scn: unknown) => ipcRenderer.invoke('scenarios:export', scn),
  importScenario: () => ipcRenderer.invoke('scenarios:import'),
  startHost: (scenarioId: string, port: number) => ipcRenderer.invoke('host:start', scenarioId, port),
  stopHost: () => ipcRenderer.invoke('host:stop'),
  hostStatus: () => ipcRenderer.invoke('host:status'),
});
