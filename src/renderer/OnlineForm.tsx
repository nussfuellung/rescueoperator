// Online spielen: Sitzungen auf dem Multiplayer-Server finden, per Code beitreten oder eine eigene Sitzung erstellen.
import { useEffect, useState } from 'react';
import { MAX_SPIELER_ONLINE, type Sichtbarkeit, type SitzungListe } from '../../shared/protocol';
import type { Role } from '../../shared/types';
import { api, isDesktop, type ScenarioInfo } from './api';
import { conn } from './net';
import { clientId, ladeSitzungen, passendeVersion, serverUrls, szenarioFuerServer } from './online';
import { APP_VERSION } from './version';

const store = {
  get(k: string, d: string) {
    try {
      return localStorage.getItem(k) ?? d;
    } catch {
      return d;
    }
  },
  set(k: string, v: string) {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* egal */
    }
  },
};

type Tab = 'liste' | 'code' | 'neu';

export function OnlineForm(props: { name: string; role: Role; onBack: () => void; onJoined: () => void }) {
  // Im Browser vom Online-Server geöffnet: dieser Server ist vorbelegt
  const [addr, setAddr] = useState(() => store.get('lst.online', !isDesktop && /^https?:$/.test(location.protocol) ? location.origin : ''));
  const [liste, setListe] = useState<SitzungListe | null>(null);
  const [tab, setTab] = useState<Tab>('liste');
  const [err, setErr] = useState('');
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

  const aktualisieren = async (a = addr) => {
    if (!a.trim()) return;
    setErr('');
    try {
      const l = await ladeSitzungen(a);
      setListe(l);
      store.set('lst.online', a.trim());
      if (!passendeVersion(l.version, APP_VERSION)) {
        setErr(`Der Server läuft mit Version ${l.version}, dein Spiel ist Version ${APP_VERSION}. Bitte Spiel oder Server aktualisieren.`);
      }
    } catch (e) {
      setListe(null);
      setErr((e as Error).message);
    }
  };

  useEffect(() => {
    if (addr.trim()) void aktualisieren();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Offene Sitzungen alle paar Sekunden neu laden
  useEffect(() => {
    if (!liste || tab !== 'liste') return;
    const t = setInterval(() => void aktualisieren(), 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liste !== null, tab, addr]);

  const verbinden = async (sitzung: NonNullable<Parameters<typeof conn.connect>[3]>['sitzung']) => {
    setBusy(true);
    setErr('');
    try {
      await conn.connect(serverUrls(addr).ws, props.name, props.role, { clientId: clientId(), version: APP_VERSION, sitzung });
      store.set('lst.online', addr.trim());
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

  return (
    <div className="form">
      <label>
        Online-Server (Adresse oder Domain)
        <div className="row">
          <input
            className="grow"
            value={addr}
            onChange={(e) => setAddr(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void aktualisieren()}
            placeholder="z. B. lst.meinserver.de oder 203.0.113.7:4800"
          />
          <button onClick={() => void aktualisieren()} disabled={!addr.trim()}>
            Verbinden
          </button>
        </div>
      </label>
      {liste && (
        <>
          <p className="small muted">
            Verbunden mit <b>{liste.serverName}</b> (Server-Version {liste.version})
          </p>
          <div className="tabs">
            <button className={tab === 'liste' ? 'active' : ''} onClick={() => setTab('liste')}>
              Offene Sitzungen ({liste.sitzungen.length})
            </button>
            <button className={tab === 'code' ? 'active' : ''} onClick={() => setTab('code')}>
              Mit Code beitreten
            </button>
            <button className={tab === 'neu' ? 'active' : ''} onClick={() => setTab('neu')}>
              Neue Sitzung erstellen
            </button>
          </div>
          {tab === 'liste' &&
            (liste.sitzungen.length ? (
              <div className="table-scroll">
                <table className="lib">
                  <tbody>
                    {liste.sitzungen.map((s) => (
                      <tr key={s.code}>
                        <td>
                          <b>{s.name}</b>
                          <div className="muted small">
                            {s.leitstelle} · Host {s.hostName} · {s.laeuft ? 'Schicht läuft' : 'Schichtbesprechung'}
                          </div>
                        </td>
                        <td className="right">
                          {s.spieler}/{s.maxSpieler}
                          <button disabled={busy || s.spieler >= s.maxSpieler} onClick={() => void verbinden({ code: s.code })}>
                            {s.spieler >= s.maxSpieler ? 'Voll' : 'Beitreten'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="muted">Gerade gibt es keine offenen Sitzungen. Erstelle eine eigene oder tritt einer privaten Sitzung mit Code bei.</p>
            ))}
          {tab === 'code' && (
            <>
              <label>
                Beitrittscode
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                  onKeyDown={(e) => e.key === 'Enter' && code.length >= 4 && void verbinden({ code })}
                  placeholder="z. B. K7QX2M"
                  maxLength={8}
                />
              </label>
              <div className="menu-buttons">
                <button className="primary" disabled={busy || code.length < 4} onClick={() => void verbinden({ code })}>
                  Beitreten
                </button>
              </div>
            </>
          )}
          {tab === 'neu' && (
            <>
              <label>
                Name der Sitzung
                <input value={sitzungName} onChange={(e) => setSitzungName(e.target.value)} maxLength={40} />
              </label>
              <label>
                Leitstelle
                <select value={sel} onChange={(e) => setSel(e.target.value)}>
                  {scenarios.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.ilsName} ({s.towns} Orte, {s.vehicles} Fahrzeuge)
                    </option>
                  ))}
                </select>
              </label>
              <div className="row">
                <label className="grow">
                  Sichtbarkeit
                  <select value={sichtbarkeit} onChange={(e) => setSichtbarkeit(e.target.value as Sichtbarkeit)}>
                    <option value="offen">Offen: in der Liste, jeder kann beitreten</option>
                    <option value="privat">Privat: nur mit Beitrittscode</option>
                  </select>
                </label>
                <label>
                  Max. Spieler
                  <select value={maxSpieler} onChange={(e) => setMaxSpieler(Number(e.target.value))}>
                    {Array.from({ length: MAX_SPIELER_ONLINE }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="menu-buttons">
                <button className="primary" disabled={busy || !sel} onClick={() => void erstellen()}>
                  {busy ? (hochladen ? 'Leitstelle wird hochgeladen …' : 'Sitzung wird erstellt …') : 'Sitzung erstellen'}
                </button>
              </div>
            </>
          )}
        </>
      )}
      <div className="menu-buttons">
        <button onClick={props.onBack}>Zurück</button>
      </div>
      {err && <p className="error">{err}</p>}
    </div>
  );
}
