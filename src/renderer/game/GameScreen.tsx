import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ROLE_LABEL, formatClock, formatDuration } from '../../../shared/catalog';
import { RoadGraph } from '../../../shared/geo';
import type { PublicState, Role, Scenario, Vec } from '../../../shared/types';
import { conn, useNet } from '../net';
import { MapView, type Hit } from '../MapView';
import { alarmTone, beep, isMuted, ring, setMuted } from '../sound';
import { CallPanel, IncidentFormPanel } from './CallPanel';
import { IncidentPanel } from './IncidentPanel';
import { UnitBoard } from './UnitBoard';
import { RadioPanel } from './RadioPanel';
import { CrewView } from './CrewView';
import { PANEL_TITLES, Popout, type PanelId } from '../Popout';
import { SettingsModal, useSttAutoload } from '../SettingsModal';
import { getSettings } from '../settings';
import { radioSpeech, say, stopSpeaking } from '../audio/tts';
import { attachPttKeys, speechInput } from '../audio/stt';
import { buildVocab } from '../../../shared/speechfix';
import { radioName } from '../../../shared/catalog';
import { MicStatus } from '../audio/SpeechUi';
import { DeviceModal } from './DeviceModal';

export interface GameCtx {
  scn: Scenario;
  state: PublicState;
  me: string;
  graph: RoadGraph;
  selectedIncident: string | null;
  setSelectedIncident: (id: string | null) => void;
  selectedUnit: string | null;
  setSelectedUnit: (id: string | null) => void;
  /** Karte auf einen Punkt setzen, optional mit Maßstab (Pixel je Meter) */
  focus: (p: Vec, scale?: number) => void;
  marker: Vec | null;
  setMarker: (p: Vec | null) => void;
  /** Kartenklick an das Einsatzformular weiterleiten */
  mapPickRef: React.MutableRefObject<((p: Vec) => void) | null>;
  /** Einsatzmaske ohne Anruf geöffnet */
  formManual: boolean;
  setFormManual: (v: boolean) => void;
  /** BMA-Anruf, zu dem die Einsatzmaske gehört */
  formCallId: string | null;
  setFormCallId: (id: string | null) => void;
}

const POPPED_KEY = 'lst.popped';
const ALL_PANELS: PanelId[] = ['calls', 'form', 'map', 'incidents', 'radio', 'units'];

function loadPopped(): PanelId[] {
  try {
    return JSON.parse(localStorage.getItem(POPPED_KEY) ?? '[]');
  } catch {
    return [];
  }
}

export function GameScreen(props: { hostInfo: { port: number; addresses: string[] } | null; onLeave: () => void }) {
  const net = useNet();
  const scn = net.scenario!;
  const state = net.state;
  const graph = useMemo(() => new RoadGraph(scn), [scn]);
  const [selectedIncident, setSelectedIncident] = useState<string | null>(null);
  const [selectedUnit, setSelectedUnit] = useState<string | null>(null);
  const [focusPt, setFocusPt] = useState<{ x: number; y: number; seq: number; scale?: number } | null>(null);
  const [marker, setMarker] = useState<Vec | null>(null);
  const [showScore, setShowScore] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showWindows, setShowWindows] = useState(false);
  const [muted, setMutedState] = useState(isMuted());
  // Ausgelagerte Fenster werden nicht automatisch wieder geöffnet (Popup-Sperre), nur gemerkt
  const [popped, setPopped] = useState<PanelId[]>([]);
  const mapPickRef = useRef<((p: Vec) => void) | null>(null);
  const [formManual, setFormManual] = useState(false);
  const [formCallId, setFormCallId] = useState<string | null>(null);
  const [remote, setRemote] = useState<PanelId[]>([]);
  const [showDevice, setShowDevice] = useState(false);

  useSounds(state, { calls: !remote.includes('calls'), radio: !remote.includes('radio') });
  useSttAutoload();
  useEffect(() => attachPttKeys(window), []);
  // Wortschatz der Karte für die Nachkorrektur der Spracherkennung
  useEffect(() => {
    const places = new Set<string>([...scn.towns].sort((a, b) => b.radius - a.radius).map((t) => t.name));
    for (const st of scn.stations) for (const v of st.vehicles) places.add(radioName(v.callsign).replace(/\s+\d.*$/, ''));
    const streets = new Set<string>();
    for (const r of scn.roads) if (r.name && r.type !== 'autobahn') streets.add(r.name);
    for (const a of scn.addresses ?? []) streets.add(a.street);
    speechInput.setVocabulary(buildVocab([...places, ...streets, ...scn.hospitals.map((h) => h.name)], [...places]), [
      ...new Set(scn.vehicleTypes.map((t) => t.funkNr)),
    ]);
    return () => speechInput.setVocabulary(undefined);
  }, [scn]);
  useReadAloud(state, net.playerId, scn.ilsName, { radio: !remote.includes('radio'), caller: !remote.includes('calls') });
  useEffect(() => {
    try {
      localStorage.setItem(POPPED_KEY, JSON.stringify(popped));
    } catch {
      /* egal */
    }
  }, [popped]);

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
    focus: (p, scale) => setFocusPt({ x: p.x, y: p.y, seq: Date.now() + Math.random(), scale }),
    marker,
    setMarker,
    mapPickRef,
    formManual,
    setFormManual,
    formCallId,
    setFormCallId,
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

  const togglePanel = (id: PanelId) => setPopped((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const isPopped = (id: PanelId) => popped.includes(id);

  const panels: Record<PanelId, ReactNode> = {
    calls: <CallPanel ctx={ctx} />,
    form: <IncidentFormPanel ctx={ctx} />,
    map: (
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
        <div className="map-legend">Linksklick: auswählen bzw. Einsatzort setzen · Ziehen: verschieben · Mausrad: zoomen</div>
      </div>
    ),
    incidents: <IncidentPanel ctx={ctx} />,
    radio: <RadioPanel ctx={ctx} />,
    units: <UnitBoard ctx={ctx} />,
  };

  /** Panel im Hauptfenster mit Auslager-Knopf */
  // Bereiche, die ein gekoppeltes Tablet übernommen hat, fehlen am Rechner
  const isAway = (id: PanelId) => isPopped(id) || remote.includes(id);
  const dock = (id: PanelId, className = '') =>
    isAway(id) ? null : (
      <div className={`dock dock-${id} ${className}`}>
        <button className="popout-btn" title={`${PANEL_TITLES[id]} in eigenes Fenster auslagern`} onClick={() => togglePanel(id)}>
          ⧉
        </button>
        {panels[id]}
      </div>
    );

  const leftVisible = !isAway('calls') || !isAway('form');
  const rightVisible = !isAway('incidents') || !isAway('radio');
  const centerVisible = !isAway('map') || !isAway('units');
  const columns = [leftVisible ? '370px' : null, centerVisible ? '1fr' : null, rightVisible ? (centerVisible ? '430px' : '1fr') : null]
    .filter(Boolean)
    .join(' ');

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
      <MicStatus />
      {props.hostInfo && (
        <div className="hostinfo" title="Andere Spieler im LAN treten mit dieser Adresse bei">
          Host: {props.hostInfo.addresses.map((a) => `${a}:${props.hostInfo!.port}`).join(' · ') || `localhost:${props.hostInfo.port}`}
        </div>
      )}
      <select value={me?.role ?? 'dispatcher'} onChange={(e) => conn.send({ a: 'setRole', role: e.target.value as Role })} title="Rolle wechseln">
        {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
          <option key={r} value={r}>
            {ROLE_LABEL[r]}
          </option>
        ))}
      </select>
      {me?.role !== 'crew' && (
        <div className="menu-anchor">
          <button onClick={() => setShowWindows(!showWindows)} title="Fenster auslagern oder zurückholen">
            🗗 Fenster
          </button>
          {showWindows && (
            <div className="dropdown" onMouseLeave={() => setShowWindows(false)}>
              {ALL_PANELS.map((id) => (
                <label key={id} className="inline">
                  <input type="checkbox" checked={isPopped(id)} onChange={() => togglePanel(id)} />
                  {PANEL_TITLES[id]} auslagern
                </label>
              ))}
              <hr />
              <button onClick={() => setPopped([])}>Kompakte Ansicht (alles in einem Fenster)</button>
              <button onClick={() => setPopped(['calls', 'form', 'incidents', 'radio', 'units'])}>Mehrere Monitore (nur Karte bleibt)</button>
              <button onClick={() => setPopped(['map'])}>Zwei Monitore (Karte auf dem zweiten)</button>
              {loadPopped().length > 0 && popped.length === 0 && (
                <button onClick={() => setPopped(loadPopped())}>Letzte Fensteraufteilung wiederherstellen</button>
              )}
            </div>
          )}
        </div>
      )}
      <button
        onClick={() => {
          setMuted(!muted);
          setMutedState(!muted);
          if (!muted) stopSpeaking();
        }}
        title="Ton an/aus"
      >
        {muted ? '🔇' : '🔊'}
      </button>
      {me?.role !== 'crew' && (
        <button onClick={() => setShowDevice(true)} title="Telefon und Funk auf ein Tablet oder Handy im selben Netz auslagern">
          📱 Tablet{remote.length ? ' ✓' : ''}
        </button>
      )}
      <button onClick={() => setShowSettings(true)} title="Sprachausgabe, Spracheingabe, Karte">
        ⚙ Einstellungen
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
        <div className="layout" style={{ gridTemplateColumns: columns || '1fr' }}>
          {leftVisible && (
            <aside className="col-left">
              {dock('calls', 'grow-panel')}
              {dock('form', isAway('calls') ? 'grow-panel' : '')}
            </aside>
          )}
          {centerVisible && (
            <main className="col-center">
              {dock('map', 'grow-panel')}
              {dock('units', isAway('map') ? 'grow-panel' : '')}
            </main>
          )}
          {rightVisible && (
            <aside className="col-right">
              {dock('incidents', 'grow-panel')}
              {dock('radio', 'grow-panel')}
            </aside>
          )}
          {!leftVisible && !centerVisible && !rightVisible && (
            <div className="all-popped">Alle Bereiche sind in eigene Fenster ausgelagert. Über „🗗 Fenster“ holst du sie zurück.</div>
          )}
        </div>
      )}
      {me?.role !== 'crew' &&
        popped.map((id) => (
          <Popout key={id} id={id} title={PANEL_TITLES[id]} onClose={() => setPopped((p) => p.filter((x) => x !== id))}>
            <div className={`popout-panel dock-${id}`}>
              <div className="popout-head">
                <span>
                  {scn.ilsName} · {PANEL_TITLES[id]}
                </span>
                <span className="clock small-clock">{formatClock(state.clockStart, state.time)}</span>
                <button onClick={() => togglePanel(id)} title="Zurück ins Hauptfenster">
                  ⇲ Zurückholen
                </button>
              </div>
              {panels[id]}
            </div>
          </Popout>
        ))}
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
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      {showDevice && <DeviceModal hostInfo={props.hostInfo} remote={remote} setRemote={setRemote} onClose={() => setShowDevice(false)} />}
      {toasts}
    </div>
  );
}

/** Liest neue Funksprüche der Fahrzeuge und die Sätze des eigenen Anrufers vor */
export function useReadAloud(state: PublicState | undefined, me: string | undefined, ilsName: string, only: { radio?: boolean; caller?: boolean } = { radio: true, caller: true }) {
  const lastRadio = useRef<number | null>(null);
  const lastCaller = useRef(new Map<string, number>());
  useEffect(() => {
    if (!state) return;
    const s = getSettings();
    const maxId = state.radio.length ? state.radio[state.radio.length - 1].id : 0;
    if (lastRadio.current === null) lastRadio.current = maxId;
    const myUnit = state.players.find((p) => p.id === me)?.unitId;
    const myCallsign = state.units.find((u) => u.id === myUnit)?.callsign;
    for (const m of state.radio) {
      if (m.id <= lastRadio.current) continue;
      if (!s.readRadio || !only.radio || m.kind !== 'voice') continue;
      // Eigene Funksprüche nicht vorlesen; Besatzungen hören die Leitstelle
      if (myCallsign) {
        if (m.from === ilsName && m.to === myCallsign) say(`Leitstelle: ${m.text}`, 'radio');
      } else if (m.from !== ilsName) {
        say(radioSpeech(m.from, m.text), 'radio');
      }
    }
    lastRadio.current = maxId;
    for (const c of state.calls) {
      if (c.takerId !== me || c.kind !== '112') continue;
      const seen = lastCaller.current.get(c.id) ?? 0;
      c.transcript.forEach((l, i) => {
        if (i < seen || l.from !== 'caller' || !s.readCaller || !only.caller) return;
        const text = l.text.replace(/\([^)]*\)/g, '').trim();
        if (text) say(text, 'caller');
      });
      lastCaller.current.set(c.id, c.transcript.length);
    }
  }, [state]);
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
export function useSounds(state?: PublicState, only: { calls?: boolean; radio?: boolean } = { calls: true, radio: true }) {
  const ref = useRef(state);
  ref.current = state;
  const onlyRef = useRef(only);
  onlyRef.current = only;
  const seenSpeak = useRef(new Set<string>());
  const seenBma = useRef(new Set<string>());
  useEffect(() => {
    const t = setInterval(() => {
      const s = ref.current;
      if (!s?.running) return;
      if (onlyRef.current.calls && s.calls.some((c) => c.state === 'ringing' && c.kind === '112')) ring();
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
          if (onlyRef.current.radio) beep();
        }
      }
    }
    for (const c of state.calls) {
      if (c.kind === 'bma' && !seenBma.current.has(c.id)) {
        seenBma.current.add(c.id);
        if (onlyRef.current.calls) alarmTone();
      }
    }
  }, [state]);
}
