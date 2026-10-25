// Einstellungen: Darstellung, Sprachausgabe, Spracheingabe und Kartenhintergrund.
import { useEffect, useState } from 'react';
import { zipToModelTarGz } from '../../shared/modelpack';
import { isDesktop, type ModelInfo } from './api';
import { DEFAULT_TILE_URL, updateSettings, useSettings, type Theme, type TtsEngine } from './settings';
import { lastTtsResult, say, ttsInfo } from './audio/tts';
import { speechInput, useSpeechInput, useSpeechTarget } from './audio/stt';
import { MicButton } from './audio/SpeechUi';

let browserModelUrl: string | null = null;

/** Liefert die Modell-URL für die Spracherkennung (Desktop: installiertes Modell, Browser: gewählte Datei) */
export async function currentModelUrl(): Promise<string | null> {
  if (window.lst?.sttInfo) {
    const info = await window.lst.sttInfo();
    return info.installed ? info.url : null;
  }
  return browserModelUrl;
}

/** Lädt die Spracherkennung, wenn sie eingeschaltet und ein Modell vorhanden ist */
export function useSttAutoload() {
  const s = useSettings();
  useEffect(() => {
    if (!s.sttEnabled) {
      if (speechInput.snap.status !== 'aus') speechInput.unload();
      return;
    }
    void currentModelUrl().then((url) => {
      if (url) void speechInput.load(url);
    });
  }, [s.sttEnabled]);
}

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const s = useSettings();
  const stt = useSpeechInput();
  const [info, setInfo] = useState(ttsInfo());
  const [ttsResult, setTtsResult] = useState<string | null>(null);
  const [model, setModel] = useState<ModelInfo | null>(null);
  const [progress, setProgress] = useState<string>('');
  const [err, setErr] = useState('');
  const [heard, setHeard] = useState<string[]>([]);
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  useEffect(() => {
    // Gerätenamen gibt es erst nach erteilter Freigabe
    navigator.mediaDevices
      ?.enumerateDevices()
      .then((d) => setMics(d.filter((x) => x.kind === 'audioinput')))
      .catch(() => {});
  }, [stt.status]);

  useEffect(() => {
    const t = setInterval(() => setInfo(ttsInfo()), 1000);
    window.lst?.sttInfo?.().then(setModel);
    const off = window.lst?.onSttProgress?.((p) =>
      setProgress(p.converting ? 'Entpacke Modell…' : `${Math.round(p.got / 1e6)} von ${Math.round(p.total / 1e6) || '?'} MB geladen`),
    );
    return () => {
      clearInterval(t);
      off?.();
    };
  }, []);

  // Während die Einstellungen offen sind, landet erkannter Text hier
  useSpeechTarget('settings-test', 100, (text) => setHeard((h) => [text, ...h].slice(0, 5)), true);

  const loadModel = async (url: string | null) => {
    if (!url) return;
    updateSettings({ sttEnabled: true });
    await speechInput.unload();
    await speechInput.load(url);
  };

  const testTts = () => {
    setTtsResult('…');
    say('Florian Ammerbach 40 1 für Leitstelle. Status 4, am Einsatzort.', 'radio', true);
    setTimeout(() => setTtsResult(lastTtsResult()), 6000);
  };

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal wide settings" onClick={(e) => e.stopPropagation()}>
        <h2>Einstellungen</h2>

        <h3>Darstellung</h3>
        <label>
          Farbschema
          <select value={s.theme} onChange={(e) => updateSettings({ theme: e.target.value as Theme })}>
            <option value="dark">Dunkel</option>
            <option value="light">Hell</option>
            <option value="system">Wie das Betriebssystem</option>
          </select>
        </label>

        <h3>Sprachausgabe</h3>
        <label className="inline">
          <input type="checkbox" checked={s.ttsEnabled} onChange={(e) => updateSettings({ ttsEnabled: e.target.checked })} />
          Sprachausgabe einschalten
        </label>
        <label className="inline">
          <input type="checkbox" checked={s.readRadio} onChange={(e) => updateSettings({ readRadio: e.target.checked })} />
          Funksprüche der Fahrzeuge vorlesen
        </label>
        <label className="inline">
          <input type="checkbox" checked={s.readCaller} onChange={(e) => updateSettings({ readCaller: e.target.checked })} />
          Anrufer im eigenen Notrufgespräch sprechen lassen
        </label>
        <label className="inline">
          <input type="checkbox" checked={s.ringtone} onChange={(e) => updateSettings({ ringtone: e.target.checked })} />
          Klingelton und Signaltöne
        </label>
        <div className="row">
          <label className="grow">
            Stimme
            <select value={s.ttsEngine} onChange={(e) => updateSettings({ ttsEngine: e.target.value as TtsEngine })}>
              <option value="auto">Automatisch</option>
              <option value="piper" disabled={!info.piper}>
                Piper, natürliche Stimmen {info.piper ? `(${info.piper.join(', ')})` : '(nicht gefunden)'}
              </option>
              <option value="browser">Browser-Stimme ({info.browserVoices.length} deutsche Stimmen)</option>
              <option value="system" disabled={!info.system}>
                Systemstimme {isDesktop ? '(Windows/macOS/Linux)' : '(nur Desktop-App)'}
              </option>
            </select>
          </label>
          <button onClick={testTts}>Stimme testen</button>
        </div>
        {ttsResult && (
          <p className="small muted">
            Letzte Ausgabe: {ttsResult === 'piper' ? 'Piper' : ttsResult === 'browser' ? 'Browser-Stimme' : ttsResult === 'system' ? 'Systemstimme' : ttsResult === 'fehler' ? 'fehlgeschlagen' : ttsResult}
            {ttsResult === 'fehler' && ' – bitte andere Stimme wählen oder unter Windows eine deutsche Sprachausgabe installieren.'}
          </p>
        )}

        <h3>Spracheingabe (Mikrofon)</h3>
        <p className="small muted">
          Die Erkennung läuft offline auf diesem PC mit einem deutschen Vosk-Modell (ca. 45 MB, einmaliger Download). Im Notrufgespräch
          wird das Gesagte als Frage an den Anrufer übernommen, im Funk als Funkspruch.
        </p>
        {isDesktop ? (
          <div className="row">
            <span className={model?.installed ? 'ok' : 'muted'}>
              {model?.installed ? `Modell installiert (${Math.round((model.size ?? 0) / 1e6)} MB)` : 'Kein Modell installiert'}
            </span>
            <button
              onClick={async () => {
                setErr('');
                setProgress('Starte Download…');
                try {
                  const m = await window.lst!.sttDownload!();
                  setModel(m);
                  setProgress('');
                  await loadModel(m.url);
                } catch (e) {
                  setProgress('');
                  setErr(`Download fehlgeschlagen: ${String((e as Error).message ?? e)}. Alternativ das ZIP von alphacephei.com/vosk/models herunterladen und über „Aus Datei“ laden.`);
                }
              }}
            >
              {model?.installed ? 'Neu herunterladen' : 'Deutsches Modell herunterladen'}
            </button>
            <button
              onClick={async () => {
                setErr('');
                try {
                  const m = await window.lst!.sttImport!();
                  setModel(m);
                  if (m.installed) await loadModel(m.url);
                } catch (e) {
                  setErr(String((e as Error).message ?? e));
                }
              }}
            >
              Aus Datei…
            </button>
          </div>
        ) : (
          <div className="row">
            <span className="small muted">Modell-ZIP (z. B. vosk-model-small-de-0.15.zip):</span>
            <input
              type="file"
              accept=".zip,.gz,.tgz"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                setErr('');
                setProgress('Entpacke Modell…');
                try {
                  const bytes = new Uint8Array(await f.arrayBuffer());
                  const tgz = /\.(tar\.gz|tgz)$/i.test(f.name) ? bytes : zipToModelTarGz(bytes);
                  if (browserModelUrl) URL.revokeObjectURL(browserModelUrl);
                  browserModelUrl = URL.createObjectURL(new Blob([tgz as Uint8Array<ArrayBuffer>], { type: 'application/gzip' }));
                  setProgress('');
                  await loadModel(browserModelUrl);
                } catch (er) {
                  setProgress('');
                  setErr(String((er as Error).message ?? er));
                }
              }}
            />
          </div>
        )}
        {progress && <p className="small">{progress}</p>}
        {err && <p className="error small">{err}</p>}
        <label className="inline">
          <input
            type="checkbox"
            checked={s.sttEnabled}
            onChange={async (e) => {
              updateSettings({ sttEnabled: e.target.checked });
              if (e.target.checked) await loadModel(await currentModelUrl());
            }}
          />
          Spracheingabe einschalten
        </label>
        <div className="row">
          <label className="grow">
            Mikrofon-Modus
            <select value={s.sttMode} onChange={(e) => updateSettings({ sttMode: e.target.value as 'ptt' | 'continuous' })}>
              <option value="ptt">Sprechtaste gedrückt halten</option>
              <option value="continuous">Freisprechen während eines Notrufgesprächs</option>
            </select>
          </label>
          <label>
            Sprechtaste
            <input
              value={s.pttKey}
              readOnly
              onKeyDown={(e) => {
                e.preventDefault();
                updateSettings({ pttKey: e.key });
              }}
              title="Hier klicken und die gewünschte Taste drücken"
              className="num"
            />
          </label>
        </div>
        <label>
          Mikrofon
          <select
            value={s.micDeviceId}
            onChange={async (e) => {
              updateSettings({ micDeviceId: e.target.value });
              await speechInput.openMic().catch(() => {});
            }}
          >
            <option value="">Standardmikrofon von Windows</option>
            {mics
              .filter((m) => m.deviceId && m.deviceId !== 'default' && m.deviceId !== 'communications')
              .map((m) => (
                <option key={m.deviceId} value={m.deviceId}>
                  {m.label || 'Mikrofon'}
                </option>
              ))}
          </select>
        </label>
        <p className="small">
          Status: <b>{stt.status}</b>
          {stt.error ? ` – ${stt.error}` : ''}
          {stt.device && stt.status === 'bereit' ? ` · ${stt.device}` : ''}
        </p>
        {stt.status === 'bereit' && (
          <div className="mic-meter" title="Pegel des Mikrofons">
            <span style={{ width: `${Math.min(100, stt.level * 250)}%` }} />
          </div>
        )}
        {stt.status === 'aus' && s.sttEnabled && <p className="small muted">Noch kein Modell geladen. Bitte zuerst das deutsche Modell herunterladen.</p>}
        {stt.status === 'bereit' && (
          <div className="stt-test">
            <MicButton targetId="settings-test" label="Test: gedrückt halten und sprechen" />
            {heard.map((h, i) => (
              <div key={i} className="small">
                erkannt: „{h}“
              </div>
            ))}
          </div>
        )}

        <h3>Karte</h3>
        <label className="inline">
          <input type="checkbox" checked={s.mapTiles} onChange={(e) => updateSettings({ mapTiles: e.target.checked })} />
          Kartenhintergrund von OpenStreetMap anzeigen (bei importierten echten Karten, braucht Internet)
        </label>
        <label>
          Kachel-Server
          <input value={s.tileUrl} onChange={(e) => updateSettings({ tileUrl: e.target.value || DEFAULT_TILE_URL })} />
        </label>
        <label>
          Zoomgeschwindigkeit (Mausrad und Touchpad)
          <select value={s.zoomSpeed} onChange={(e) => updateSettings({ zoomSpeed: Number(e.target.value) })}>
            <option value={0.5}>Langsam</option>
            <option value={1}>Normal</option>
            <option value={2}>Schnell</option>
            <option value={4}>Sehr schnell</option>
          </select>
        </label>

        <div className="row">
          <div className="spacer" />
          <button className="primary" onClick={onClose}>
            Schließen
          </button>
        </div>
      </div>
    </div>
  );
}
