// Online spielen: Sitzungen auf dem offiziellen Online-Server finden, per Code beitreten oder eine eigene Sitzung erstellen.
import { useEffect, useRef, useState } from 'react';
import { MAX_SPIELER_ONLINE, type Sichtbarkeit, type SitzungInfo, type SitzungListe } from '../../shared/protocol';
import type { Role } from '../../shared/types';
import { api, type ScenarioInfo } from './api';
import { conn } from './net';
import { clientId, ladeSitzungen, onlineServer, passendeVersion, serverUrls, szenarioFuerServer } from './online';
import { APP_VERSION } from './version';

type Tab = 'liste' | 'code' | 'neu';

export function OnlineForm(props: { name: string; role: Role; onBack: () => void; onJoined: () => void }) {
  const addr = onlineServer();
  const [liste, setListe] = useState<SitzungListe | null>(null);
  const [laedt, setLaedt] = useState(true);
  const [tab, setTab] = useState<Tab>('liste');
  const [err, setErr] = useState('');
  const [serverFehler, setServerFehler] = useState('');
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState('');

  const [scenarios, setScenarios] = useState<ScenarioInfo[]>([]);
  const [sel, setSel] = useState('');
  const [sitzungName, setSitzungName] = useState(`Schicht von ${props.name.trim()}`);
  const [sichtbarkeit, setSichtbarkeit] = useState<Sichtbarkeit>('offen');
  const [maxSpieler, setMaxSpieler] = useState(4);
  const [hochladen, setHochladen] = useState(false);

  useEffect(() => {
    api.listScenarios().then((l) => {
      setScenarios(l);
      if (l[0]) setSel(l[0].id);
    });
  }, []);

  // Nur die Antwort der jüngsten Abfrage zählt: eine späte alte darf die neue Liste nicht überschreiben
  const abfrage = useRef(0);
  const aktualisieren = async () => {
    const nr = ++abfrage.current;
    try {
      const l = await ladeSitzungen(addr);
      if (nr !== abfrage.current) return;
      setListe(l);
      setServerFehler(passendeVersion(l.version, APP_VERSION) ? '' : `Der Server läuft mit Version ${l.version}, dein Spiel ist Version ${APP_VERSION}. Bitte das Spiel aktualisieren.`);
    } catch {
      if (nr !== abfrage.current) return;
      setListe(null);
      setServerFehler('Der Online-Server ist gerade nicht erreichbar. Wir versuchen es weiter …');
    } finally {
      if (nr === abfrage.current) setLaedt(false);
    }
  };

  // Beim Öffnen laden, dann alle paar Sekunden neu (auch, wenn der Server gerade nicht erreichbar ist)
  useEffect(() => {
    void aktualisieren();
    const t = setInterval(() => void aktualisieren(), 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const verbinden = async (sitzung: NonNullable<Parameters<typeof conn.connect>[3]>['sitzung']) => {
    setBusy(true);
    setErr('');
    try {
      await conn.connect(serverUrls(addr).ws, props.name, props.role, { clientId: clientId(), version: APP_VERSION, sitzung });
      props.onJoined();
    } catch {
      // Fehlermeldung des Servers steht im Verbindungs-Store und wird im Menü angezeigt
      conn.close();
    } finally {
      setBusy(false);
    }
  };

  const erstellen = async () => {
    setBusy(true);
    setErr('');
    try {
      const scn = await api.loadScenario(sel);
      const daten = await szenarioFuerServer(addr, scn);
      setHochladen(!!daten.szenarioGz);
      await verbinden({ neu: { name: sitzungName.trim() || `Schicht von ${props.name.trim()}`, sichtbarkeit, maxSpieler, ...daten } });
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };

  const online = !!liste && !serverFehler;
  const spielerOnline = liste?.sitzungen.reduce((n, s) => n + s.spieler, 0) ?? 0;
  const gewaehlt = scenarios.find((s) => s.id === sel);

  return (
    <div className="online">
      <div className="online-kopf">
        <h2>Online spielen</h2>
        <span className={`online-status ${laedt ? 'pruefe' : online ? 'an' : 'aus'}`}>
          <i />
          {laedt ? 'Verbinde …' : liste ? `Online · ${liste.sitzungen.length} offene Sitzungen · ${spielerOnline} Spieler` : 'Server nicht erreichbar'}
        </span>
      </div>

      <div className="segment" role="tablist">
        <button role="tab" aria-selected={tab === 'liste'} className={tab === 'liste' ? 'an' : ''} onClick={() => setTab('liste')}>
          Sitzungen{liste ? ` (${liste.sitzungen.length})` : ''}
        </button>
        <button role="tab" aria-selected={tab === 'code'} className={tab === 'code' ? 'an' : ''} onClick={() => setTab('code')}>
          Mit Code beitreten
        </button>
        <button role="tab" aria-selected={tab === 'neu'} className={tab === 'neu' ? 'an' : ''} onClick={() => setTab('neu')}>
          Neue Sitzung
        </button>
      </div>

      {serverFehler && <p className="online-hinweis">{serverFehler}</p>}

      {tab === 'liste' && (
        <div className="sitzungen">
          {laedt && <p className="muted online-leer">Sitzungen werden geladen …</p>}
          {liste?.sitzungen.map((s) => <SitzungKarte key={s.code} s={s} busy={busy || !online} onJoin={() => void verbinden({ code: s.code })} />)}
          {liste && !liste.sitzungen.length && (
            <div className="online-leer">
              <div className="online-icon">🌐</div>
              <b>Gerade läuft keine offene Sitzung</b>
              <p className="muted">Erstelle eine eigene Schicht oder tritt einer privaten Sitzung mit ihrem Code bei.</p>
              <button className="primary" onClick={() => setTab('neu')}>
                Neue Sitzung erstellen
              </button>
            </div>
          )}
        </div>
      )}

      {tab === 'code' && (
        <div className="online-code">
          <p className="muted">Gib den sechsstelligen Code ein, den dir der Host der Sitzung genannt hat.</p>
          <input
            className="code-feld"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
            onKeyDown={(e) => e.key === 'Enter' && code.length >= 4 && online && void verbinden({ code })}
            placeholder="K7QX2M"
            maxLength={8}
            autoFocus
            aria-label="Beitrittscode"
          />
          <button className="primary gross" disabled={busy || code.length < 4 || !online} onClick={() => void verbinden({ code })}>
            Beitreten
          </button>
        </div>
      )}

      {tab === 'neu' && (
        <div className="online-neu">
          <label>
            Name der Sitzung
            <input value={sitzungName} onChange={(e) => setSitzungName(e.target.value)} maxLength={40} />
          </label>
          <label>
            Leitstelle
            <select value={sel} onChange={(e) => setSel(e.target.value)}>
              {scenarios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.ilsName}
                </option>
              ))}
            </select>
            {gewaehlt && (
              <span className="small muted">
                {gewaehlt.towns} Orte · {gewaehlt.vehicles} Fahrzeuge
              </span>
            )}
          </label>
          <div className="feld">
            <span className="feld-titel">Sichtbarkeit</span>
            <div className="wahl-karten">
              <button className={sichtbarkeit === 'offen' ? 'an' : ''} onClick={() => setSichtbarkeit('offen')}>
                <b>🌐 Offen</b>
                <span>Steht in der Liste, jeder kann beitreten</span>
              </button>
              <button className={sichtbarkeit === 'privat' ? 'an' : ''} onClick={() => setSichtbarkeit('privat')}>
                <b>🔒 Privat</b>
                <span>Nur mit dem Beitrittscode</span>
              </button>
            </div>
          </div>
          <div className="feld">
            <span className="feld-titel">Spieler höchstens</span>
            <div className="zahl-wahl">
              {Array.from({ length: MAX_SPIELER_ONLINE }, (_, i) => i + 1).map((n) => (
                <button key={n} className={maxSpieler === n ? 'an' : ''} onClick={() => setMaxSpieler(n)}>
                  {n}
                </button>
              ))}
            </div>
          </div>
          <button className="primary gross" disabled={busy || !sel || !online} onClick={() => void erstellen()}>
            {busy ? (hochladen ? 'Leitstelle wird hochgeladen …' : 'Sitzung wird erstellt …') : 'Sitzung erstellen'}
          </button>
        </div>
      )}

      {err && <p className="error">{err}</p>}
      <div className="menu-buttons">
        <button onClick={props.onBack}>Zurück</button>
      </div>
    </div>
  );
}

function SitzungKarte(props: { s: SitzungInfo; busy: boolean; onJoin: () => void }) {
  const { s } = props;
  const voll = s.spieler >= s.maxSpieler;
  return (
    <div className="sitzung-karte">
      <div className="grow">
        <div className="sitzung-titel">
          <b>{s.name}</b>
          <span className={`pille ${s.laeuft ? 'laeuft' : ''}`}>{s.laeuft ? 'Schicht läuft' : 'Schichtbesprechung'}</span>
        </div>
        <div className="muted small">
          {s.leitstelle} · Host {s.hostName}
        </div>
      </div>
      <div className="plaetze" title={`${s.spieler} von ${s.maxSpieler} Plätzen belegt`}>
        <span>
          {s.spieler}/{s.maxSpieler}
        </span>
        <div>
          {Array.from({ length: s.maxSpieler }, (_, i) => (
            <i key={i} className={i < s.spieler ? 'belegt' : ''} />
          ))}
        </div>
      </div>
      <button className="primary" disabled={props.busy || voll} onClick={props.onJoin}>
        {voll ? 'Voll' : 'Beitreten'}
      </button>
    </div>
  );
}
