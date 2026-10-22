import { useEffect, useState } from 'react';
import { DEFAULT_PORT } from '../../shared/protocol';
import type { Role } from '../../shared/types';
import { ROLE_LABEL } from '../../shared/catalog';
import { api, isDesktop, type ScenarioInfo } from './api';
import { conn, useNet } from './net';
import { GameScreen } from './game/GameScreen';
import { EditorScreen } from './editor/EditorScreen';
import { SettingsModal } from './SettingsModal';
import { MobileScreen } from './game/MobileScreen';
import { OnlineForm } from './OnlineForm';

type Screen = 'menu' | 'host' | 'join' | 'online' | 'editor' | 'game';

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

// Aufruf vom Tablet oder Handy über den QR-Code: http://<rechner>:4711/?geraet=<code>&bereiche=beide
const params = new URLSearchParams(location.search);
const deviceCode = params.get('geraet');
const deviceAreas = (() => {
  const b = params.get('bereiche') ?? 'beide';
  return b === 'telefon' ? (['telefon'] as const) : b === 'funk' ? (['funk'] as const) : (['telefon', 'funk'] as const);
})();

export function App() {
  if (deviceCode) return <MobileScreen code={deviceCode} areas={[...deviceAreas]} />;
  return <DesktopApp />;
}

function DesktopApp() {
  const [screen, setScreen] = useState<Screen>('menu');
  const [name, setName] = useState(() => store.get('lst.name', ''));
  const [role, setRole] = useState<Role>(() => store.get('lst.role', 'dispatcher') as Role);
  const [hostInfo, setHostInfo] = useState<{ port: number; addresses: string[] } | null>(null);
  const net = useNet();
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => store.set('lst.name', name), [name]);
  useEffect(() => store.set('lst.role', role), [role]);

  const leave = async () => {
    conn.close();
    if (hostInfo) await api.stopHost();
    setHostInfo(null);
    setScreen('menu');
  };

  if (screen === 'game' && net.scenario) {
    return <GameScreen hostInfo={hostInfo} onLeave={leave} />;
  }
  if (screen === 'editor') return <EditorScreen onBack={() => setScreen('menu')} />;

  return (
    <div className="menu-bg">
      <div className={`menu-card${screen === 'online' ? ' wide' : ''}`}>
        <h1>
          rescue<span>.Operator</span>
        </h1>
        <p className="muted">Leitstellensimulator für Feuerwehr und Rettungsdienst · Multiplayer im LAN und online</p>
        {screen === 'menu' && (
          <>
            <label>
              Dein Name
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Maggus" maxLength={24} />
            </label>
            <label>
              Rolle zum Start
              <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
                {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </select>
            </label>
            <div className="menu-buttons">
              <button className="primary" onClick={() => setScreen('host')} disabled={!name.trim()}>
                Schicht hosten
              </button>
              <button onClick={() => setScreen('join')} disabled={!name.trim()}>
                Schicht beitreten
              </button>
              <button onClick={() => setScreen('online')} disabled={!name.trim()}>
                Online spielen
              </button>
              <button onClick={() => setScreen('editor')}>Leitstellen-Editor</button>
              <button onClick={() => setShowSettings(true)}>Einstellungen (Darstellung, Sprache, Karte)</button>
            </div>
            {!name.trim() && <p className="muted small">Bitte zuerst einen Namen eingeben.</p>}
          </>
        )}
        {screen === 'host' && (
          <HostForm
            onBack={() => setScreen('menu')}
            onStarted={async (info) => {
              setHostInfo(info);
              await conn.connect(`ws://127.0.0.1:${info.port}`, name, role);
              setScreen('game');
            }}
          />
        )}
        {screen === 'join' && (
          <JoinForm
            onBack={() => setScreen('menu')}
            onJoin={async (addr) => {
              const url = addr.startsWith('ws') ? addr : `ws://${addr.includes(':') ? addr : `${addr}:${DEFAULT_PORT}`}`;
              await conn.connect(url, name, role);
              setScreen('game');
            }}
          />
        )}
        {screen === 'online' && <OnlineForm name={name} role={role} onBack={() => setScreen('menu')} onJoined={() => setScreen('game')} />}
        {net.error && <p className="error">{net.error}</p>}
      </div>
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  );
}

function HostForm(props: { onBack: () => void; onStarted: (i: { port: number; addresses: string[] }) => Promise<void> }) {
  const [list, setList] = useState<ScenarioInfo[]>([]);
  const [sel, setSel] = useState('');
  const [port, setPort] = useState(DEFAULT_PORT);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.listScenarios().then((l) => {
      setList(l);
      if (l[0]) setSel(l[0].id);
    });
  }, []);

  if (!isDesktop) {
    return (
      <div>
        <p>
          Hosten funktioniert nur in der Desktop-App. Im Browser kannst du einen eigenständigen Server mit{' '}
          <code>npm run server</code> starten und dann beitreten.
        </p>
        <button onClick={props.onBack}>Zurück</button>
      </div>
    );
  }

  return (
    <div className="form">
      <label>
        Leitstelle
        <select value={sel} onChange={(e) => setSel(e.target.value)}>
          {list.map((s) => (
            <option key={s.id} value={s.id}>
              {s.ilsName} ({s.towns} Orte, {s.vehicles} Fahrzeuge)
            </option>
          ))}
        </select>
      </label>
      <label>
        Port
        <input type="number" value={port} onChange={(e) => setPort(Number(e.target.value))} />
      </label>
      <div className="menu-buttons">
        <button
          className="primary"
          disabled={!sel || busy}
          onClick={async () => {
            setBusy(true);
            setErr('');
            try {
              const info = await api.startHost(sel, port);
              await props.onStarted(info);
            } catch (e) {
              setErr(String((e as Error).message ?? e));
            } finally {
              setBusy(false);
            }
          }}
        >
          Server starten
        </button>
        <button onClick={props.onBack}>Zurück</button>
      </div>
      {err && <p className="error">{err}</p>}
    </div>
  );
}

function JoinForm(props: { onBack: () => void; onJoin: (addr: string) => Promise<void> }) {
  const [addr, setAddr] = useState(() => store.get('lst.addr', `127.0.0.1:${DEFAULT_PORT}`));
  const [busy, setBusy] = useState(false);
  return (
    <div className="form">
      <label>
        Adresse des Hosts (IP:Port)
        <input value={addr} onChange={(e) => setAddr(e.target.value)} placeholder="192.168.0.23:4711" />
      </label>
      <div className="menu-buttons">
        <button
          className="primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            store.set('lst.addr', addr);
            try {
              await props.onJoin(addr.trim());
            } catch {
              /* Fehler steht im Store */
            } finally {
              setBusy(false);
            }
          }}
        >
          Beitreten
        </button>
        <button onClick={props.onBack}>Zurück</button>
      </div>
    </div>
  );
}
