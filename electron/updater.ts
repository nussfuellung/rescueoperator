// Splashscreen beim Start: prüft GitHub-Releases auf eine neue Version und installiert sie, wo das ohne Apple-Signatur geht.
// Windows (Setup.exe-Installation) und Linux (AppImage) aktualisieren sich selbst, sonst zeigt der Splash nur die Download-Seite an.
import { app, BrowserWindow, shell } from 'electron';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { autoUpdater, type UpdateInfo } from 'electron-updater';
import pkg from '../package.json';

const PRUEF_TIMEOUT = 8000;
const publish = (pkg.build as { publish?: { provider: string; owner?: string; repo?: string } }).publish;
const repo = publish?.owner && !publish.owner.startsWith('<') ? `${publish.owner}/${publish.repo}` : undefined;
const releasesUrl = repo ? `https://github.com/${repo}/releases/latest` : undefined;

type Zustand = { text: string; sub?: string; progress?: number; buttons?: boolean };

const SPLASH_HTML = `<!doctype html><html lang="de"><head><meta charset="utf-8"><style>
html,body{margin:0;height:100%;background:#11161d;color:#e6edf3;font:14px system-ui,'Segoe UI',sans-serif;user-select:none;-webkit-app-region:drag}
body{display:flex;flex-direction:column;justify-content:center;padding:0 32px;box-sizing:border-box;border:1px solid #2b3540}
.logo{font-size:24px;font-weight:700;letter-spacing:.5px}.logo span{color:#e5484d}
.ver{color:#8b98a5;font-size:12px;margin:2px 0 26px}.claim{color:#8b98a5;font-size:12px;margin-top:2px}
#text{min-height:20px}#sub{color:#8b98a5;font-size:12px;min-height:16px;margin-top:4px}
.bar{height:6px;background:#222c36;border-radius:3px;margin-top:12px;overflow:hidden}
#fill{height:100%;width:0;background:#e5484d;transition:width .2s}
.bar.busy #fill{width:30%;animation:busy 1.2s ease-in-out infinite}
@keyframes busy{0%{margin-left:-30%}100%{margin-left:100%}}
#btns{display:none;gap:8px;margin-top:14px;-webkit-app-region:no-drag}
a{padding:6px 14px;border-radius:4px;background:#222c36;color:#e6edf3;text-decoration:none}a.p{background:#e5484d}
</style></head><body>
<div class="logo">rescue<span>.Operator</span></div><div class="claim">Leitstellensimulator</div><div class="ver">Version ${app.getVersion()}</div>
<div id="text">Suche nach Updates…</div><div id="sub"></div>
<div class="bar busy" id="bar"><div id="fill"></div></div>
<div id="btns"><a class="p" href="lst:download">Herunterladen</a><a href="lst:weiter">Jetzt spielen</a></div>
<script>window.set=(s)=>{text.textContent=s.text;sub.textContent=s.sub||'';
const b=document.getElementById('bar');if(s.progress==null){b.classList.add('busy');fill.style.width=''}else{b.classList.remove('busy');fill.style.width=s.progress+'%'}
b.style.display=s.buttons?'none':'';btns.style.display=s.buttons?'flex':'none'}</script>
</body></html>`;

/** Kann sich diese Installation selbst ersetzen? */
function selbstUpdateMoeglich() {
  if (process.platform === 'win32') {
    // Nur eine Installation per Setup.exe hat den Uninstaller neben der exe, eine entpackte ZIP nicht
    return existsSync(join(dirname(process.execPath), `Uninstall ${app.getName()}.exe`));
  }
  if (process.platform === 'linux') return !!process.env.APPIMAGE;
  return false; // macOS verlangt für Selbst-Updates eine Apple-Signatur
}

/**
 * Zeigt den Splash, sucht nach Updates und installiert sie gegebenenfalls.
 * Löst auf, sobald das Spiel starten soll; bei einer Installation startet die App neu und die Promise bleibt offen.
 */
export async function updateSplash(): Promise<void> {
  const testUrl = process.env.LST_UPDATE_URL;
  const aktiv = (app.isPackaged || !!testUrl) && (!!repo || !!testUrl) && !process.env.LST_NO_UPDATE;
  const splash = new BrowserWindow({
    width: 440,
    height: 230,
    frame: false,
    resizable: false,
    show: false,
    center: true,
    backgroundColor: '#11161d',
    title: 'rescue.Operator',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  await splash.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(SPLASH_HTML)}`);
  splash.show();
  const set = (s: Zustand) => {
    if (!splash.isDestroyed()) void splash.webContents.executeJavaScript(`set(${JSON.stringify(s)})`).catch(() => undefined);
  };
  const fertig = (ms = 0) =>
    new Promise<void>((r) =>
      setTimeout(() => {
        if (!splash.isDestroyed()) splash.destroy();
        r();
      }, ms),
    );

  if (!aktiv) {
    set({ text: 'Starte…', progress: 100 });
    return fertig(app.isPackaged ? 700 : 0);
  }

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.logger = null;
  if (testUrl) autoUpdater.setFeedURL({ provider: 'generic', url: testUrl });
  else autoUpdater.setFeedURL({ provider: 'github', owner: publish!.owner!, repo: publish!.repo! });
  if (testUrl) autoUpdater.forceDevUpdateConfig = true;

  let info: UpdateInfo | undefined;
  try {
    const res = await Promise.race([
      autoUpdater.checkForUpdates(),
      new Promise<null>((r) => setTimeout(() => r(null), PRUEF_TIMEOUT)),
    ]);
    if (res?.isUpdateAvailable) info = res.updateInfo;
  } catch {
    // Kein Internet, GitHub nicht erreichbar oder noch kein Release: einfach starten
  }
  if (!info) {
    set({ text: 'Du hast die neueste Version.', progress: 100 });
    return fertig(500);
  }

  if (!selbstUpdateMoeglich() && !process.env.LST_UPDATE_FORCE_INSTALL) {
    // Download-Seite anbieten (Mac, entpackte ZIP); ohne Klick geht es nach 15 s weiter
    set({ text: `Version ${info.version} ist verfügbar.`, sub: 'Bitte die neue Version herunterladen und die alte ersetzen.', buttons: true });
    return new Promise<void>((resolve) => {
      const weiter = () => {
        clearTimeout(t);
        void fertig().then(resolve);
      };
      const t = setTimeout(weiter, 15000);
      splash.webContents.on('will-navigate', (e, url) => {
        e.preventDefault();
        if (url === 'lst:download') void shell.openExternal(testUrl ?? releasesUrl!);
        weiter();
      });
      splash.on('closed', weiter);
    });
  }

  set({ text: `Lade Version ${info.version}…`, progress: 0 });
  autoUpdater.on('download-progress', (p) => {
    set({ text: `Lade Version ${info!.version}…`, sub: `${Math.round(p.transferred / 1e6)} von ${Math.round(p.total / 1e6)} MB`, progress: p.percent });
  });
  try {
    await autoUpdater.downloadUpdate();
  } catch (e) {
    set({ text: 'Update konnte nicht geladen werden.', sub: String((e as Error).message ?? e).slice(0, 120), progress: 100 });
    return fertig(3000);
  }
  set({ text: 'Installiere Update, das Spiel startet gleich neu…', progress: 100 });
  setTimeout(() => autoUpdater.quitAndInstall(true, true), 800);
  return new Promise<void>(() => undefined);
}
