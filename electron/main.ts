// Electron-Hauptprozess: Fenster, Leitstellen-Bibliothek, Host-Server.
import { app, BrowserWindow, dialog, ipcMain, net, session, shell, systemPreferences } from 'electron';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync, statSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';
import { recomputeHouseNumbers } from '../shared/geo';
import { generateScenario } from '../shared/mapgen';
import type { Scenario } from '../shared/types';
import { GameServer, lanAddresses } from '../server/server';
import { Piper } from '../server/tts';
import { speakSystem, stopSystemSpeech, systemTtsAvailable } from './tts';
import { updateSplash } from './updater';
import { downloadModel, handleModelProtocol, installModelFromBytes, modelInfo, registerModelScheme, removeModel } from './stt';
import { downloadWhisper, prepareWhisper, removeWhisper, stopWhisper, transcribeWhisper, whisperInfo } from './whisper';
import type { WhisperModell } from '../shared/whisper';

registerModelScheme();

// Bis 0.8 hieß das Spiel Leitstellensimulator: Leitstellen, Einstellungen und Sprachmodell einmalig übernehmen
{
  const alt = join(app.getPath('appData'), 'Leitstellensimulator');
  const neu = app.getPath('userData');
  if (alt !== neu && existsSync(alt) && !existsSync(neu)) {
    try {
      cpSync(alt, neu, { recursive: true });
    } catch (e) {
      console.error('Übernahme der alten Daten fehlgeschlagen', e);
    }
  }
}

const UA = `rescue.Operator/${app.getVersion()} (Desktop-Spiel; https://github.com)`;
const ALLOWED_HOSTS = ['overpass-api.de', 'overpass.kumi.systems', 'overpass.private.coffee', 'nominatim.openstreetmap.org'];

let win: BrowserWindow | null = null;
let host: GameServer | null = null;
/** Solange der Splash läuft, gibt es noch kein Hauptfenster: dann nicht beenden */
let starting = true;

const libDir = () => {
  const dir = join(app.getPath('userData'), 'leitstellen');
  mkdirSync(dir, { recursive: true });
  return dir;
};
const fileFor = (id: string) => join(libDir(), `${id.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`);

function listScenarios() {
  const dir = libDir();
  // Musterleitstelle ILS Würzburg einmal je Datenstand in die Bibliothek legen (nicht erneut, wenn gelöscht)
  const marker = join(dir, '.wuerzburg-installiert');
  const WUE_DATA = '7';
  if (!existsSync(marker) || readFileSync(marker, 'utf8').trim() !== WUE_DATA) {
    try {
      const scn = gunzipSync(readFileSync(join(__dirname, '../assets/ils-wuerzburg.json.gz')));
      writeFileSync(fileFor('scn_ils_wuerzburg'), scn);
      writeFileSync(marker, WUE_DATA);
    } catch (e) {
      console.error('Musterleitstelle fehlt', e);
    }
  }
  let files = readdirSync(dir).filter((f) => f.endsWith('.json'));
  if (!files.length) {
    const scn = generateScenario({ seed: 4711, towns: 8, name: 'Musterland' });
    writeFileSync(fileFor(scn.id), JSON.stringify(scn));
    files = readdirSync(dir).filter((f) => f.endsWith('.json'));
  }
  return files
    .map((f) => {
      try {
        const scn = JSON.parse(readFileSync(join(dir, f), 'utf8')) as Scenario;
        return {
          id: scn.id,
          name: scn.name,
          ilsName: scn.ilsName,
          towns: scn.towns.length,
          vehicles: scn.stations.reduce((n, s) => n + s.vehicles.length, 0),
          updated: statSync(join(dir, f)).mtimeMs,
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => b!.updated - a!.updated);
}

function loadScenario(id: string): Scenario {
  return JSON.parse(readFileSync(fileFor(id), 'utf8'));
}

function createWindow() {
  win = new BrowserWindow({
    width: 1680,
    height: 1000,
    minWidth: 1200,
    minHeight: 750,
    backgroundColor: '#11161d',
    title: 'rescue.Operator',
    icon: join(__dirname, '../renderer/icon.png'),
    autoHideMenuBar: true,
    webPreferences: { preload: join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  const dev = process.env.LST_DEV_URL;
  if (dev) win.loadURL(dev);
  else win.loadFile(join(__dirname, '../renderer/index.html'));
  win.webContents.setWindowOpenHandler(({ url, frameName }) => {
    // Ausgelagerte Fenster der Oberfläche (React-Portale in leere Fenster)
    if (url === 'about:blank' && frameName.startsWith('lst-')) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: { autoHideMenuBar: true, backgroundColor: '#11161d', minWidth: 300, minHeight: 200 },
      };
    }
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
}

ipcMain.handle('scenarios:list', () => listScenarios());
ipcMain.handle('scenarios:load', (_e, id: string) => loadScenario(id));
ipcMain.handle('scenarios:save', (_e, scn: Scenario) => {
  writeFileSync(fileFor(scn.id), JSON.stringify(scn));
  return true;
});
ipcMain.handle('scenarios:delete', (_e, id: string) => {
  unlinkSync(fileFor(id));
  return true;
});
ipcMain.handle('scenarios:export', async (_e, scn: Scenario) => {
  const res = await dialog.showSaveDialog(win!, {
    title: 'Leitstelle exportieren',
    defaultPath: `${scn.name}.leitstelle.json`,
    filters: [{ name: 'Leitstelle', extensions: ['json'] }],
  });
  if (res.canceled || !res.filePath) return false;
  writeFileSync(res.filePath, JSON.stringify(scn, null, 1));
  return true;
});
ipcMain.handle('scenarios:import', async () => {
  const res = await dialog.showOpenDialog(win!, {
    title: 'Leitstelle importieren',
    filters: [{ name: 'Leitstelle', extensions: ['json'] }],
    properties: ['openFile'],
  });
  if (res.canceled || !res.filePaths[0]) return null;
  const scn = JSON.parse(readFileSync(res.filePaths[0], 'utf8')) as Scenario;
  if (scn.version !== 1 || !Array.isArray(scn.roads)) throw new Error('Keine gültige Leitstellen-Datei');
  writeFileSync(fileFor(scn.id), JSON.stringify(scn));
  return scn;
});
ipcMain.handle('host:start', async (_e, scenarioId: string, port: number) => {
  if (host) await host.stop();
  const scn = loadScenario(scenarioId);
  recomputeHouseNumbers(scn);
  host = new GameServer(scn);
  host.staticDir = join(__dirname, '../renderer');
  const p = await host.start(port);
  return { port: p, addresses: lanAddresses() };
});
ipcMain.handle('host:stop', async () => {
  await host?.stop();
  host = null;
  return true;
});
ipcMain.handle('host:status', () => (host ? { port: host.port, addresses: lanAddresses() } : null));

// Piper-Stimmen dieses Rechners, wenn kein eigener Host-Server sie liefert (Online-Sitzungen)
let piper: Piper | null = null;
let piperTest: Promise<boolean> | null = null;
const lokalesPiper = async () => {
  piper ??= new Piper([join(__dirname, '../renderer')]);
  piperTest ??= piper.selfTest();
  return (await piperTest) && piper.available ? piper : null;
};
ipcMain.handle('piper:info', async () => (await lokalesPiper())?.info() ?? null);
ipcMain.handle('piper:synth', async (_e, text: string, stimme: string, tempo: number) => {
  const p = await lokalesPiper();
  if (!p || !text) return null;
  try {
    return new Uint8Array(await p.synth(String(text), String(stimme), Math.max(0.6, Math.min(1.6, Number(tempo) || 1))));
  } catch {
    return null;
  }
});

ipcMain.handle('tts:available', () => systemTtsAvailable());
ipcMain.handle('tts:speak', (_e, text: string, voice: number, rate: number) => speakSystem(text, voice, rate));
ipcMain.handle('tts:stop', () => stopSystemSpeech());

ipcMain.handle('stt:info', () => modelInfo());
ipcMain.handle('stt:download', (e) => downloadModel(e.sender));
ipcMain.handle('stt:remove', () => removeModel());
ipcMain.handle('stt:import', async () => {
  const res = await dialog.showOpenDialog(win!, {
    title: 'Vosk-Sprachmodell wählen (ZIP oder tar.gz)',
    filters: [{ name: 'Sprachmodell', extensions: ['zip', 'gz', 'tgz'] }],
    properties: ['openFile'],
  });
  if (res.canceled || !res.filePaths[0]) return modelInfo();
  return installModelFromBytes(new Uint8Array(readFileSync(res.filePaths[0])), res.filePaths[0]);
});

ipcMain.handle('whisper:info', () => whisperInfo());
ipcMain.handle('whisper:download', (e, m: WhisperModell) => downloadWhisper(e.sender, m));
ipcMain.handle('whisper:remove', (_e, m: WhisperModell) => removeWhisper(m));
ipcMain.handle('whisper:prepare', (_e, m: WhisperModell) => prepareWhisper(m));
ipcMain.handle('whisper:transcribe', (_e, pcm: Float32Array, m: WhisperModell, prompt: string) => transcribeWhisper(pcm, m, String(prompt ?? '')));

// Kartendaten von OpenStreetMap (Overpass, Nominatim) mit korrekter Kennung abrufen
ipcMain.handle('net:fetchText', async (_e, url: string, body?: string) => {
  const host = new URL(url).hostname;
  if (!ALLOWED_HOSTS.includes(host)) throw new Error(`Host nicht erlaubt: ${host}`);
  const res = await net.fetch(url, {
    method: body ? 'POST' : 'GET',
    body,
    headers: { 'user-agent': UA, ...(body ? { 'content-type': 'application/x-www-form-urlencoded' } : {}) },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  return text;
});

app.whenReady().then(async () => {
  handleModelProtocol();
  // Mikrofon für die Spracheingabe ausdrücklich erlauben (eigene Oberfläche, keine fremden Seiten)
  const ownPage = (url: string) => url.startsWith('file:') || url.startsWith('http://localhost') || url === '' || url.startsWith('about:blank');
  session.defaultSession.setPermissionRequestHandler((wc, permission, cb, details) => {
    void permission;
    const url = details.requestingUrl ?? wc.getURL();
    cb(ownPage(url) || permission === 'clipboard-sanitized-write');
  });
  session.defaultSession.setPermissionCheckHandler((_wc, permission, origin) => ownPage(origin ?? '') || permission !== 'media');
  if (process.platform === 'darwin') await systemPreferences.askForMediaAccess('microphone').catch(() => false);
  // Kartenkacheln von OpenStreetMap verlangen eine Kennung und einen Referer
  session.defaultSession.webRequest.onBeforeSendHeaders({ urls: ['https://*.openstreetmap.org/*', 'https://*.openstreetmap.de/*'] }, (details, cb) => {
    details.requestHeaders['User-Agent'] = UA;
    details.requestHeaders['Referer'] = 'https://rescue-operator.local/';
    cb({ requestHeaders: details.requestHeaders });
  });
  await updateSplash();
  createWindow();
  starting = false;
});
app.on('will-quit', () => stopWhisper());
app.on('window-all-closed', async () => {
  if (starting) return;
  stopWhisper();
  await host?.stop();
  app.quit();
});
