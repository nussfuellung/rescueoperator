// Web-App für Tablet oder Handy: übernimmt Telefon und/oder Funk eines Platzes am Rechner.
import { useEffect, useMemo, useRef, useState } from 'react';
import { formatClock } from '../../../shared/catalog';
import { RoadGraph } from '../../../shared/geo';
import type { Vec } from '../../../shared/types';
import { conn, useNet } from '../net';
import { unlockAudio, isMuted, setMuted } from '../sound';
import { stopSpeaking } from '../audio/tts';
import { CallPanel } from './CallPanel';
import { RadioPanel } from './RadioPanel';
import { useReadAloud, useSounds, type GameCtx } from './GameScreen';
import { PTT_REFRESH_MS } from './geraetSprache';

type Tab = 'telefon' | 'funk';

export function MobileScreen({ code, areas }: { code: string; areas: Tab[] }) {
  const net = useNet();
  const [started, setStarted] = useState(false);
  const [tab, setTab] = useState<Tab>(areas[0] ?? 'telefon');
  const [muted, setMutedState] = useState(isMuted());
  const [selectedUnit, setSelectedUnit] = useState<string | null>(null);
  const [selectedIncident, setSelectedIncident] = useState<string | null>(null);
  const [formCallId, setFormCallId] = useState<string | null>(null);
  const mapPickRef = useRef<((p: Vec) => void) | null>(null);
  const retry = useRef(0);

  const connect = () =>
    conn.connect(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`, 'Tablet', 'dispatcher', { link: code, lite: true }).then(
      () => (retry.current = 0),
      () => undefined,
    );
  useEffect(() => {
    if (started) void connect();
    return () => conn.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started]);
  // WLAN-Aussetzer: Verbindung wieder aufbauen, solange der Code gültig ist
  useEffect(() => {
    if (!started || net.status !== 'closed' || /code/i.test(net.error ?? '')) return;
    const t = setTimeout(() => void connect(), Math.min(10000, 1000 * 2 ** retry.current++));
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [net.status, started]);

  // Graph wird nur von der Einsatzmaske gebraucht, die es hier nicht gibt
  const graph = useMemo(() => (net.scenario ? ({} as RoadGraph) : null), [net.scenario]);
  // Hat der Rechner „Ton am Rechner“ gewählt, bleibt das Gerät stumm
  const geraet = net.state?.players.find((p) => p.id === net.playerId)?.geraet;
  const ton = !geraet?.tonAmPc;
  useSounds(net.state, { calls: ton && areas.includes('telefon'), radio: ton && areas.includes('funk') });
  useReadAloud(net.state, net.playerId, net.scenario?.ilsName ?? '', { caller: ton && areas.includes('telefon'), radio: ton && areas.includes('funk') });

  const ringing = net.state?.calls.filter((c) => c.state === 'ringing').length ?? 0;
  const speak = net.state?.units.filter((u) => u.speak && !u.speak.answered).length ?? 0;

  if (!started) {
    return (
      <div className="mobile-start">
        <h1>
          rescue<span>.Operator</span>
        </h1>
        <p>{areas.length > 1 ? 'Telefon und Funk' : areas[0] === 'funk' ? 'Funk' : 'Telefon'} auf diesem Gerät</p>
        <button
          className="primary big"
          onClick={() => {
            unlockAudio();
            setStarted(true);
          }}
        >
          Tippen zum Start
        </button>
        <p className="muted small">Der Ton für Klingeln und Vorlesen wird mit diesem Tippen freigeschaltet.</p>
      </div>
    );
  }

  if (net.error && /code/i.test(net.error) && net.status !== 'online') {
    return (
      <div className="mobile-start">
        <h2>Keine Verbindung</h2>
        <p>{net.error}</p>
        <p className="muted small">Am Rechner über „📱 Tablet“ einen neuen QR-Code anzeigen und erneut scannen.</p>
        <button onClick={() => void connect()}>Erneut versuchen</button>
      </div>
    );
  }

  const scn = net.scenario;
  const state = net.state;
  if (!scn || !state || !graph || !net.playerId) return <div className="mobile-start">Verbinde mit {location.host}…</div>;

  const ctx: GameCtx = {
    scn,
    state,
    me: net.playerId,
    graph,
    selectedIncident,
    setSelectedIncident,
    selectedUnit,
    setSelectedUnit,
    focus: () => undefined,
    marker: null,
    setMarker: () => undefined,
    mapPickRef,
    formManual: false,
    setFormManual: () => undefined,
    formCallId,
    setFormCallId,
    mobile: true,
  };
  const me = state.players.find((p) => p.id === net.playerId);

  return (
    <div className={`mobile ${net.status !== 'online' ? 'offline' : ''}`}>
      <header className="mobile-bar">
        <div className="brand">{scn.ilsName}</div>
        <div className="clock">{formatClock(state.clockStart, state.time)}</div>
        <div className="spacer" />
        <span className="small muted">{me?.name}</span>
        <button
          onClick={() => {
            setMuted(!muted);
            setMutedState(!muted);
            if (!muted) stopSpeaking();
          }}
        >
          {muted ? '🔇' : '🔊'}
        </button>
        {geraet?.tonAmPc && <span className="small muted">Ton am Rechner</span>}
      </header>
      {net.status !== 'online' && <div className="mobile-offline">Verbindung unterbrochen, verbinde neu…</div>}
      {!state.running && <div className="mobile-offline">{state.started ? 'Schicht pausiert' : 'Schicht noch nicht gestartet'}</div>}
      <main className="mobile-body">
        {tab === 'telefon' && <CallPanel ctx={ctx} />}
        {tab === 'funk' && <RadioPanel ctx={ctx} />}
      </main>
      <Sprechtaste bereit={!!geraet?.sttBereit && net.status === 'online'} unitId={tab === 'funk' ? selectedUnit : null} />
      {areas.length > 1 && (
        <nav className="mobile-tabs">
          <button className={tab === 'telefon' ? 'active' : ''} onClick={() => setTab('telefon')}>
            ☎ Telefon{ringing ? <span className="badge">{ringing}</span> : null}
          </button>
          <button className={tab === 'funk' ? 'active' : ''} onClick={() => setTab('funk')}>
            📻 Funk{speak ? <span className="badge">{speak}</span> : null}
          </button>
        </nav>
      )}
      <div className="toasts">
        {net.toasts.map((t) => (
          <div key={t.id} className={`toast ${t.level}`}>
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Sprechtaste für das Mikrofon am Rechner: halten zum Sprechen, kurz tippen schaltet dauerhaft ein, erneut tippen aus */
function Sprechtaste({ bereit, unitId }: { bereit: boolean; unitId: string | null }) {
  const [an, setAn] = useState(false);
  const [dauer, setDauer] = useState(false);
  const downAt = useRef(0);
  const anRef = useRef(false);
  const senden = (on: boolean) => {
    anRef.current = on;
    setAn(on);
    if (!on) setDauer(false);
    conn.send(on ? { a: 'geraet', ptt: true, pttUnitId: unitId } : { a: 'geraet', ptt: false });
  };
  // Gedrückt halten: regelmäßig auffrischen, sonst lässt der Rechner die Taste selbst los
  useEffect(() => {
    if (!an) return;
    const t = setInterval(() => conn.send({ a: 'geraet', ptt: true }), PTT_REFRESH_MS);
    return () => clearInterval(t);
  }, [an]);
  // Gerät gesperrt, App gewechselt oder Seite verlassen: Taste loslassen
  useEffect(() => {
    const weg = () => {
      if (document.hidden && anRef.current) senden(false);
    };
    document.addEventListener('visibilitychange', weg);
    return () => {
      document.removeEventListener('visibilitychange', weg);
      if (anRef.current) conn.send({ a: 'geraet', ptt: false });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!bereit && anRef.current) senden(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bereit]);

  const druecken = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!bereit) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    if (dauer) {
      downAt.current = 0;
      senden(false);
      return;
    }
    downAt.current = Date.now();
    senden(true);
  };
  const loslassen = () => {
    if (!downAt.current) return;
    const kurz = Date.now() - downAt.current < 350;
    downAt.current = 0;
    if (kurz) setDauer(true);
    else senden(false);
  };

  return (
    <div className="mobile-ptt">
      <button
        type="button"
        className={`mobile-ptt-btn ${an ? 'live' : ''}`}
        disabled={!bereit}
        onPointerDown={druecken}
        onPointerUp={loslassen}
        onPointerCancel={loslassen}
        onContextMenu={(e) => e.preventDefault()}
      >
        🎤 {!bereit ? 'Spracheingabe am Rechner aus' : an ? (dauer ? 'Rechner hört zu – tippen zum Beenden' : 'Rechner hört zu…') : 'Halten zum Sprechen (Mikrofon am Rechner)'}
      </button>
    </div>
  );
}
