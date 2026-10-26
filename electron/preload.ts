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
  ttsAvailable: () => ipcRenderer.invoke('tts:available'),
  ttsSpeak: (text: string, voice: number, rate: number) => ipcRenderer.invoke('tts:speak', text, voice, rate),
  ttsStop: () => ipcRenderer.invoke('tts:stop'),
  piperInfo: () => ipcRenderer.invoke('piper:info'),
  piperSynth: (text: string, stimme: string, tempo: number) => ipcRenderer.invoke('piper:synth', text, stimme, tempo),
  sttInfo: () => ipcRenderer.invoke('stt:info'),
  sttDownload: () => ipcRenderer.invoke('stt:download'),
  sttImport: () => ipcRenderer.invoke('stt:import'),
  sttRemove: () => ipcRenderer.invoke('stt:remove'),
  whisperInfo: () => ipcRenderer.invoke('whisper:info'),
  whisperDownload: (m: string) => ipcRenderer.invoke('whisper:download', m),
  whisperRemove: (m: string) => ipcRenderer.invoke('whisper:remove', m),
  whisperPrepare: (m: string) => ipcRenderer.invoke('whisper:prepare', m),
  whisperTranscribe: (pcm: Float32Array, m: string, prompt: string) => ipcRenderer.invoke('whisper:transcribe', pcm, m, prompt),
  onSttProgress: (fn: (p: { got: number; total: number; converting?: boolean }) => void) => {
    const h = (_e: unknown, p: { got: number; total: number; converting?: boolean }) => fn(p);
    ipcRenderer.on('stt:progress', h);
    return () => ipcRenderer.removeListener('stt:progress', h);
  },
  fetchText: (url: string, body?: string) => ipcRenderer.invoke('net:fetchText', url, body),
});
