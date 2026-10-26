import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ROLE_LABEL, formatClock, formatDuration } from '../../../shared/catalog';
import { RoadGraph } from '../../../shared/geo';
import type { PublicState, Role, Scenario, UnitState, Vec } from '../../../shared/types';
import { conn, useNet } from '../net';
import { MapView, type Hit } from '../MapView';
import { alarmTone, beep, isMuted, ring, setMuted } from '../sound';
import { EswlMeldungen } from './EswlMeldungen';
import { IvenaMeldungen } from './IvenaMeldungen';
import { CallPanel, IncidentFormPanel } from './CallPanel';
import { IncidentPanel } from './IncidentPanel';
import { UnitBoard } from './UnitBoard';
import { RadioPanel } from './RadioPanel';
import { CrewView } from './CrewView';
import { PANEL_TITLES, Popout, type PanelId } from '../Popout';
import { SettingsModal, useSttAutoload } from '../SettingsModal';
import { getSettings, updateSettings, useSettings } from '../settings';
import { piperInfo, radioSpeech, say, stopSpeaking } from '../audio/tts';
import { attachPttKeys, speechInput } from '../audio/stt';
import { useGeraetSprache } from './geraetSprache';
import { buildVocab } from '../../../shared/speechfix';
import { radioName } from '../../../shared/catalog';
import { MicStatus } from '../audio/SpeechUi';
import { DeviceModal } from './DeviceModal';
import { IvenaModal } from './Ivena';
import { isoWeek } from '../../../shared/lstsim';
import { DwdButton } from './Dwd';
import { SitzungEinstellungen, SitzungKopf } from './OnlineSitzung';
import { HAEUFIGKEITEN, HAEUFIGKEIT_LABEL, SEASONS, SEASON_ICON, SEASON_LABEL, type Season } from '../../../shared/jahreszeit';

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
  /** Fahrzeug orten: auswählen, Karte hinzoomen und kurz markieren */
  locate?: (u: UnitState) => void;
  marker: Vec | null;
  setMarker: (p: Vec | null) => void;
  /** Kartenklick an das Einsatzformular weiterleiten */
  mapPickRef: React.MutableRefObject<((p: Vec) => void) | null>;
  /** Einsatzmaske ohne Anruf geöffnet */
  formManual: boolean;
  setFormManual: (v: boolean) => void;
  /** BMA-Anruf, zu dem die Einsatzmaske gehört */
  formCallId: string | null;
  /** Web-App auf Tablet oder Handy: keine Karte und keine Einsatzmaske */
  mobile?: boolean;
  setFormCallId: (id: string | null) => void;
  /** IVENA-Fenster öffnen (nicht auf Tablet/Handy) */
  openIvena?: () => void;
}

const POPPED_KEY = 'lst.popped';
const TON_AM_PC_KEY = 'lst.geraetTonAmPc';
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
  const settings = useSettings();
  const graph = useMemo(() => new RoadGraph(scn), [scn]);
  const [selectedIncident, setSelectedIncident] = useState<string | null>(null);
  const [selectedUnit, setSelectedUnit] = useState<string | null>(null);
  const [focusPt, setFocusPt] = useState<{ x: number; y: number; seq: number; scale?: number } | null>(null);
  const [marker, setMarker] = useState<Vec | null>(null);
  const [ping, setPing] = useState<{ unitId: string; until: number } | null>(null);
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
  // Fenster aufs Tablet ausgelagert, Ton und Vorlesen aber weiter am Rechner
  const [tonPc, setTonPc] = useState(() => {
    try {
      return localStorage.getItem(TON_AM_PC_KEY) === '1';
    } catch {
      return false;
    }
  });
  const tonAmPc = tonPc && remote.length > 0;
  const [showDevice, setShowDevice] = useState(false);
  const [showIvena, setShowIvena] = useState(false);

  useSounds(state, { calls: tonAmPc || !remote.includes('calls'), radio: tonAmPc || !remote.includes('radio') });
  useGeraetSprache(state, net.playerId, remote, tonAmPc);
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
  useReadAloud(state, net.playerId, scn.ilsName, { radio: tonAmPc || !remote.includes('radio'), caller: tonAmPc || !remote.includes('calls') });
  useEffect(() => {
    try {
      localStorage.setItem(TON_AM_PC_KEY, tonPc ? '1' : '0');
    } catch {
      /* egal */
    }
  }, [tonPc]);
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
    locate: (u) => {
      setSelectedUnit(u.id);
      setFocusPt({ x: u.x, y: u.y, seq: Date.now() + Math.random(), scale: 0.5 });
      setPing({ unitId: u.id, until: Date.now() + 6000 });
    },
    marker,
    setMarker,
    mapPickRef,
    formManual,
    setFormManual,
    formCallId,
    setFormCallId,
    openIvena: () => setShowIvena(true),
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
            ping,
          }}
          hitKinds={['unit', 'incident']}
          onClick={onMapClick}
          filter={{ hideStatus2: settings.mapHideStatus2, hideBuildings: settings.mapHideBuildings }}
        />
        <div className="map-filter">
          <label title="Fahrzeuge im Status 2 auf der Karte ausblenden; ausgewählte Fahrzeuge bleiben sichtbar">
            <input type="checkbox" checked={!settings.mapHideStatus2} onChange={(e) => updateSettings({ mapHideStatus2: !e.target.checked })} />
            <span className="switch" />
            Status 2
          </label>
          <label title="Wachen, Kliniken und Objekte auf der Karte ausblenden">
            <input type="checkbox" checked={!settings.mapHideBuildings} onChange={(e) => updateSettings({ mapHideBuildings: !e.target.checked })} />
            <span className="switch" />
            Gebäude
          </label>
        </div>
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
      {state.startDate && <div className="date small muted">{dayLabel(state.startDate, state.clockStart, state.time)}</div>}
      {state.setup && (
        <div className="small muted" title="Jahreszeit">
          {SEASON_ICON[state.setup.season]} {SEASON_LABEL[state.setup.season]}
        </div>
      )}
      {me?.role !== 'crew' && <DwdButton state={state} notify={state.started} />}
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
      {net.sitzung && <SitzungKopf sitzung={net.sitzung} />}
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
        <button
          onClick={() => setShowIvena(true)}
          title="IVENA: Patientenzuweisung nach PZC und An-/Abmeldestatus der Kliniken"
          className={state.units.some((u) => (u.task === 'awaitHospital' && !u.hospitalId && u.pzc) || (u.voranmeldung && u.voranmeldung.t === undefined)) ? 'attention' : ''}
        >
          🏥 IVENA{(() => {
            const n = state.units.filter((u) => (u.task === 'awaitHospital' && !u.hospitalId && u.pzc) || (u.voranmeldung && u.voranmeldung.t === undefined)).length;
            return n ? ` (${n})` : '';
          })()}
        </button>
      )}
      {me?.role !== 'crew' && (
        <button onClick={() => setShowDevice(true)} title="Telefon und Funk auf ein Tablet oder Handy auslagern">
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
      {showIvena && <IvenaModal ctx={ctx} onClose={() => setShowIvena(false)} />}
      {showDevice && <DeviceModal hostInfo={props.hostInfo} remote={remote} setRemote={setRemote} tonPc={tonPc} setTonPc={setTonPc} onClose={() => setShowDevice(false)} />}
      {me?.role !== 'crew' && (
        <div className="meldungen-stapel">
          <EswlMeldungen ctx={ctx} />
          <IvenaMeldungen ctx={ctx} />
        </div>
      )}
      {toasts}
    </div>
  );
}

/** Liest neue Funksprüche der Fahrzeuge und die Sätze des eigenen Anrufers vor */
export function useReadAloud(state: PublicState | undefined, me: string | undefined, ilsName: string, only: { radio?: boolean; caller?: boolean } = { radio: true, caller: true }) {
  const lastRadio = useRef<number | null>(null);
  const lastCaller = useRef(new Map<string, number>());
  // Beim Verbinden nachsehen, ob der Server Piper-Stimmen hat
  useEffect(() => {
    if (state) void piperInfo();
  }, [!!state]);
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
        if (m.from === ilsName && m.to === myCallsign) say(`Leitstelle: ${m.text}`, 'radio', false, ilsName);
      } else if (m.from !== ilsName) {
        say(radioSpeech(m.from, m.text), 'radio', false, m.from);
      }
    }
    lastRadio.current = maxId;
    for (const c of state.calls) {
      if (c.takerId !== me || c.kind !== '112') continue;
      const seen = lastCaller.current.get(c.id) ?? 0;
      c.transcript.forEach((l, i) => {
        if (i < seen || l.from !== 'caller' || !s.readCaller || !only.caller) return;
        const text = l.text.replace(/\([^)]*\)/g, '').trim();
        if (text) say(text, 'caller', false, c.id);
      });
      lastCaller.current.set(c.id, c.transcript.length);
    }
  }, [state]);
}

function Lobby({ ctx, hostInfo }: { ctx: GameCtx; hostInfo: { port: number; addresses: string[] } | null }) {
  const { state, scn } = ctx;
  const net = useNet();
  return (
    <div className="modal-bg">
      <div className="modal">
        <h2>Schichtbesprechung – {scn.ilsName}</h2>
        <p className="muted">
          {scn.towns.length} Orte · {scn.stations.length} Wachen ·{' '}
          {scn.stations.reduce((n, s) => n + s.vehicles.length, 0)} Fahrzeuge · {scn.hospitals.length} Kliniken · ca.{' '}
          {scn.settings.callsPerHour} Notrufe pro Stunde
        </p>
        {net.sitzung && <SitzungEinstellungen sitzung={net.sitzung} />}
        {hostInfo && (
          <p>
            Andere Spieler treten bei mit:{' '}
            <b>{hostInfo.addresses.map((a) => `${a}:${hostInfo.port}`).join(', ') || `localhost:${hostInfo.port}`}</b>
          </p>
        )}
        {state.setup && (
          <div className="setup-grid">
            <label>
              Uhrzeit bei Schichtbeginn
              <input
                type="time"
                value={hhmm(state.clockStart)}
                onChange={(e) => {
                  const [h, m] = e.target.value.split(':').map(Number);
                  if (isFinite(h) && isFinite(m)) conn.send({ a: 'setup', clock: h * 60 + m });
                }}
              />
            </label>
            <label>
              Jahreszeit
              <select value={state.setup.season} onChange={(e) => conn.send({ a: 'setup', season: e.target.value as Season })}>
                {SEASONS.map((s) => (
                  <option key={s} value={s}>
                    {SEASON_ICON[s]} {SEASON_LABEL[s]}
                  </option>
                ))}
              </select>
              {state.startDate && <span className="small muted">{dayLabel(state.startDate, state.clockStart, 0)}</span>}
            </label>
            <label>
              Großschadenslagen
              <select value={state.setup.gsl} onChange={(e) => conn.send({ a: 'setup', gsl: e.target.value as typeof HAEUFIGKEITEN[number] })}>
                {HAEUFIGKEITEN.map((h) => (
                  <option key={h} value={h}>
                    {HAEUFIGKEIT_LABEL[h]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Unwetter mit DWD-Warnung
              <select value={state.setup.unwetter} onChange={(e) => conn.send({ a: 'setup', unwetter: e.target.value as typeof HAEUFIGKEITEN[number] })}>
                {HAEUFIGKEITEN.map((h) => (
                  <option key={h} value={h}>
                    {HAEUFIGKEIT_LABEL[h]}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
        <p className="muted small">
          Je nach Jahreszeit gibt es andere Einsätze (Glätte, Kaminbrand und Rodelunfall im Winter, Badeunfall, Wespenstich und Flächenbrand im Sommer).
          Nachts kommen weniger Notrufe. Bei Unwetter bekommt die Leitstelle eine Warnung des DWD, danach steigen die Notrufe stark an.
        </p>
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
  const seenTermin = useRef(new Set<string>());
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
    // Erinnerung an Terminfahrten (30 min vorher und bei Fälligkeit)
    for (const i of state.incidents) {
      if (!i.terminMeldung) continue;
      const k = `${i.id}:${i.terminMeldung}:${i.termin}`;
      if (!seenTermin.current.has(k)) {
        seenTermin.current.add(k);
        if (onlyRef.current.radio) beep();
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

function hhmm(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

/** "Di 20.10. · KW 43" für die Kopfleiste (Dienstzeiten hängen von Wochentag und Kalenderwoche ab) */
function dayLabel(startDate: string, clockStart: number, time: number): string {
  const [y, m, d] = startDate.split('-').map(Number);
  const day = Math.floor((clockStart * 60 + time / 1000) / 86400);
  const date = new Date(y, m - 1, d + day);
  const wd = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'][date.getDay()];
  return `${wd} ${date.getDate()}.${date.getMonth() + 1}. · KW ${isoWeek(date)}`;
}
