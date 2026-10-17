import { useEffect, useMemo, useRef, useState } from 'react';
import { ROLE_LABEL, formatClock, formatDuration } from '../../../shared/catalog';
import { RoadGraph } from '../../../shared/geo';
import type { PublicState, Role, Scenario, Vec } from '../../../shared/types';
import { conn, useNet } from '../net';
import { MapView, type Hit } from '../MapView';
import { alarmTone, beep, isMuted, ring, setMuted } from '../sound';
import { CallPanel } from './CallPanel';
import { IncidentPanel } from './IncidentPanel';
import { UnitBoard } from './UnitBoard';
import { RadioPanel } from './RadioPanel';
import { CrewView } from './CrewView';

export interface GameCtx {
  scn: Scenario;
  state: PublicState;
  me: string;
  graph: RoadGraph;
  selectedIncident: string | null;
  setSelectedIncident: (id: string | null) => void;
  selectedUnit: string | null;
  setSelectedUnit: (id: string | null) => void;
  focus: (p: Vec) => void;
  marker: Vec | null;
  setMarker: (p: Vec | null) => void;
  /** Kartenklick an das Einsatzformular weiterleiten */
  mapPickRef: React.MutableRefObject<((p: Vec) => void) | null>;
}

export function GameScreen(props: { hostInfo: { port: number; addresses: string[] } | null; onLeave: () => void }) {
  const net = useNet();
  const scn = net.scenario!;
  const state = net.state;
  const graph = useMemo(() => new RoadGraph(scn), [scn]);
  const [selectedIncident, setSelectedIncident] = useState<string | null>(null);
  const [selectedUnit, setSelectedUnit] = useState<string | null>(null);
  const [focusPt, setFocusPt] = useState<{ x: number; y: number; seq: number } | null>(null);
  const [marker, setMarker] = useState<Vec | null>(null);
  const [showScore, setShowScore] = useState(false);
  const [muted, setMutedState] = useState(isMuted());
  const [tts, setTts] = useState(conn.ttsEnabled);
  const mapPickRef = useRef<((p: Vec) => void) | null>(null);

  useSounds(state);

  if (!state) return <div className="menu-bg">Verbinde…</div>;
  const me = state.players.find((p) => p.id === net.playerId);

  const ctx: GameCtx = {
    scn,
    state,
    me: net.playerId!,
    graph,
    selectedIncident,
    setSelectedIncident,
    selectedUnit,
    setSelectedUnit,
    focus: (p) => setFocusPt({ x: p.x, y: p.y, seq: Date.now() }),
    marker,
    setMarker,
    mapPickRef,
  };

  const onMapClick = (p: Vec, hit: Hit | null) => {
    if (hit?.kind === 'incident') {
      setSelectedIncident(hit.id);
      return;
    }
    if (hit?.kind === 'unit') {
      setSelectedUnit(hit.id);
      const u = state.units.find((x) => x.id === hit.id);
      if (u?.incidentId) setSelectedIncident(u.incidentId);
      return;
    }
    mapPickRef.current?.(p);
  };

  const topBar = (
    <header className="topbar">
      <div className="brand">{scn.ilsName}</div>
      <div className="clock">{formatClock(state.clockStart, state.time)}</div>
      <div className="speed">
        <button
          onClick={() => conn.send(state.running ? { a: 'pause', paused: true } : state.started ? { a: 'pause', paused: false } : { a: 'start' })}
        >
          {state.running ? '⏸ Pause' : state.started ? '▶ Weiter' : '▶ Schicht starten'}
        </button>
        {[1, 2, 4].map((s) => (
          <button key={s} className={state.speed === s ? 'active' : ''} onClick={() => conn.send({ a: 'speed', speed: s })}>
            {s}×
          </button>
        ))}
      </div>
      <button className="score" onClick={() => setShowScore(true)} title="Wertung anzeigen">
        ★ {state.score.points} Punkte
      </button>
      <div className="spacer" />
      {props.hostInfo && (
        <div className="hostinfo" title="Andere Spieler im LAN treten mit dieser Adresse bei">
          Host: {props.hostInfo.addresses.map((a) => `${a}:${props.hostInfo!.port}`).join(' · ') || `localhost:${props.hostInfo.port}`}
        </div>
      )}
      <select
        value={me?.role ?? 'dispatcher'}
        onChange={(e) => conn.send({ a: 'setRole', role: e.target.value as Role })}
        title="Rolle wechseln"
      >
        {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
          <option key={r} value={r}>
            {ROLE_LABEL[r]}
          </option>
        ))}
      </select>
      <button
        onClick={() => {
          setMuted(!muted);
          setMutedState(!muted);
        }}
        title="Ton an/aus"
      >
        {muted ? '🔇' : '🔊'}
      </button>
      <button
        onClick={() => {
          conn.ttsEnabled = !tts;
          setTts(!tts);
        }}
        className={tts ? 'active' : ''}
        title="Funksprüche vorlesen"
      >
        Sprachausgabe
      </button>
      <button onClick={props.onLeave}>Verlassen</button>
    </header>
  );

  const toasts = (
    <div className="toasts">
      {net.toasts.map((t) => (
        <div key={t.id} className={`toast ${t.level}`}>
          {t.text}
        </div>
      ))}
    </div>
  );

  if (net.status === 'closed') {
    return (
      <div className="menu-bg">
        <div className="menu-card">
          <h2>Verbindung zum Server getrennt</h2>
          <button onClick={props.onLeave}>Zum Hauptmenü</button>
        </div>
      </div>
    );
  }

  return (
    <div className="game">
      {topBar}
      {me?.role === 'crew' ? (
        <CrewView ctx={ctx} />
      ) : (
        <div className="layout">
          <aside className="col-left">
            <CallPanel ctx={ctx} />
          </aside>
          <main className="col-center">
            <div className="map-wrap">
              <MapView
                scenario={scn}
                focus={focusPt}
                data={{
                  units: state.units,
                  incidents: state.incidents,
                  calls: state.calls,
                  selectedIncidentId: selectedIncident ?? undefined,
                  selectedUnitId: selectedUnit ?? undefined,
                  marker,
                }}
                hitKinds={['unit', 'incident']}
                onClick={onMapClick}
              />
              <div className="map-legend">
                Linksklick: auswählen bzw. Einsatzort setzen · Ziehen: verschieben · Mausrad: zoomen
              </div>
            </div>
            <UnitBoard ctx={ctx} />
          </main>
          <aside className="col-right">
            <IncidentPanel ctx={ctx} />
            <RadioPanel ctx={ctx} />
          </aside>
        </div>
      )}
      {!state.started && me?.role !== 'crew' && <Lobby ctx={ctx} hostInfo={props.hostInfo} />}
      {!state.started && me?.role === 'crew' && (
        <div className="crew-wait">
          Die Schicht hat noch nicht begonnen. Wähle schon dein Fahrzeug.{' '}
          <button className="primary" onClick={() => conn.send({ a: 'start' })}>
            Schicht starten
          </button>
        </div>
      )}
      {showScore && <ScoreModal state={state} onClose={() => setShowScore(false)} />}
      {toasts}
    </div>
  );
}

function Lobby({ ctx, hostInfo }: { ctx: GameCtx; hostInfo: { port: number; addresses: string[] } | null }) {
  const { state, scn } = ctx;
  return (
    <div className="modal-bg">
      <div className="modal">
        <h2>Schichtbesprechung – {scn.ilsName}</h2>
        <p className="muted">
          {scn.towns.length} Orte · {scn.stations.length} Wachen ·{' '}
          {scn.stations.reduce((n, s) => n + s.vehicles.length, 0)} Fahrzeuge · {scn.hospitals.length} Kliniken · ca.{' '}
          {scn.settings.callsPerHour} Notrufe pro Stunde
        </p>
        {hostInfo && (
          <p>
            Andere Spieler treten bei mit:{' '}
            <b>{hostInfo.addresses.map((a) => `${a}:${hostInfo.port}`).join(', ') || `localhost:${hostInfo.port}`}</b>
          </p>
        )}
        <h3>Im Dienst</h3>
        <ul className="players">
          {state.players.map((p) => (
            <li key={p.id}>
              <b>{p.name}</b> – {ROLE_LABEL[p.role]}
              {p.id === ctx.me ? ' (du)' : ''}
            </li>
          ))}
        </ul>
        <p className="muted small">
          Die Rolle kannst du jederzeit oben rechts wechseln. Calltaker nehmen Notrufe an und legen Einsätze an, Disponenten
          alarmieren Fahrzeuge und führen den Funk, die Fahrzeugbesatzung übernimmt ein Fahrzeug und meldet Status.
        </p>
        <button className="primary big" onClick={() => conn.send({ a: 'start' })}>
          Schicht starten
        </button>
      </div>
    </div>
  );
}

function ScoreModal({ state, onClose }: { state: PublicState; onClose: () => void }) {
  const s = state.score;
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <h2>Wertung: {s.points} Punkte</h2>
        <div className="stats">
          <div>
            <b>{s.callsAnswered}</b> Notrufe angenommen
          </div>
          <div>
            <b>{s.callsMissed}</b> verpasst
          </div>
          <div>
            <b>{formatDuration(s.avgAnswerSec * 1000)}</b> Ø bis Annahme
          </div>
          <div>
            <b>
              {s.stichwortCorrect}/{s.incidentsCreated}
            </b>{' '}
            Stichwort korrekt
          </div>
          <div>
            <b>
              {s.addressCorrect}/{s.incidentsCreated}
            </b>{' '}
            Einsatzort korrekt
          </div>
          <div>
            <b>
              {s.hilfsfristMet}/{s.hilfsfristTotal}
            </b>{' '}
            Hilfsfrist (12 min) eingehalten
          </div>
          <div>
            <b>{formatDuration(s.avgHilfsfristSec * 1000)}</b> Ø bis Eintreffen
          </div>
          <div>
            <b>{s.incidentsClosed}</b> Einsätze beendet
          </div>
        </div>
        <ul className="score-events">
          {s.events.map((e, i) => (
            <li key={i} className={e.points >= 0 ? 'pos' : 'neg'}>
              <span>{formatClock(state.clockStart, e.t)}</span>
              <span>{e.points > 0 ? `+${e.points}` : e.points}</span>
              <span>{e.text}</span>
            </li>
          ))}
        </ul>
        <button onClick={onClose}>Schließen</button>
      </div>
    </div>
  );
}

/** Klingeln bei offenen Notrufen, Signalton bei neuen Sprechwünschen */
function useSounds(state?: PublicState) {
  const ref = useRef(state);
  ref.current = state;
  const seenSpeak = useRef(new Set<string>());
  const seenBma = useRef(new Set<string>());
  useEffect(() => {
    const t = setInterval(() => {
      const s = ref.current;
      if (!s?.running) return;
      if (s.calls.some((c) => c.state === 'ringing' && c.kind === '112')) ring();
    }, 2200);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (!state) return;
    for (const u of state.units) {
      if (u.speak && !u.speak.answered) {
        const k = `${u.id}:${u.speak.since}`;
        if (!seenSpeak.current.has(k)) {
          seenSpeak.current.add(k);
          beep();
        }
      }
    }
    for (const c of state.calls) {
      if (c.kind === 'bma' && !seenBma.current.has(c.id)) {
        seenBma.current.add(c.id);
        alarmTone();
      }
    }
  }, [state]);
}
