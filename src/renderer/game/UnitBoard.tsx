// Fahrzeugstatus-Tableau mit Bedienleiste für das ausgewählte Fahrzeug.
import { HospitalSelect } from './Ivena';
import { useEffect, useRef, useState } from 'react';
import { FMS_COLOR, FMS_TEXT, formatDuration, radioName, shortCallsign } from '../../../shared/catalog';
import type { Station, UnitState } from '../../../shared/types';
import { dienstText } from '../../../shared/lstsim';
import { conn } from '../net';
import type { GameCtx } from './GameScreen';
import { useSpeechTarget } from '../audio/stt';
import { MicButton } from '../audio/SpeechUi';

const TASK_TEXT: Record<UnitState['task'], string> = {
  station: 'auf Wache',
  alarmed: 'alarmiert, rückt aus',
  toScene: 'Anfahrt zum Einsatzort',
  onScene: 'am Einsatzort',
  awaitHospital: 'wartet auf Zielklinik',
  toHospital: 'Transport ins Krankenhaus',
  atHospital: 'am Krankenhaus',
  returning: 'Rückfahrt zur Wache',
  free: 'frei',
  toCover: 'Fahrt zur Gebietsabsicherung',
  covering: 'Gebietsabsicherung',
};

/** Zur Gebietsabsicherung verlegbar: frei, ohne Einsatz und ohne Patient */
const canCover = (u: UnitState) => !u.incidentId && !u.hasPatient && !u.fremd && (u.baseStatus === 1 || u.baseStatus === 2);
/** H – Fahren Sie Wache an: nur außerhalb der Wache und ohne Patient */
const canSendHome = (u: UnitState) => !u.hasPatient && u.task !== 'returning' && (u.task !== 'station' || !!u.incidentId);

function locate(ctx: GameCtx, u: UnitState) {
  if (ctx.locate) ctx.locate(u);
  else {
    ctx.setSelectedUnit(u.id);
    ctx.focus(u, 0.5);
  }
}

export function UnitBoard({ ctx }: { ctx: GameCtx }) {
  const { scn, state } = ctx;
  const sel = state.units.find((u) => u.id === ctx.selectedUnit);
  const [q, setQ] = useState('');
  const [group, setGroup] = useState('');
  const [menu, setMenu] = useState<{ unitId: string; x: number; y: number } | null>(null);
  const [coverUnit, setCoverUnit] = useState<string | null>(null);
  const covering = state.units.filter((u) => u.cover && (u.task === 'covering' || u.task === 'toCover' || u.task === 'alarmed'));
  const ql = q.toLowerCase().trim();
  const shown = scn.stations.filter(
    (st) =>
      (!group || st.tmo === group) &&
      (!ql || st.name.toLowerCase().includes(ql) || st.vehicles.some((v) => v.callsign.toLowerCase().includes(ql))),
  );
  const fremd = state.units.filter((u) => u.fremd && (!ql || u.callsign.toLowerCase().includes(ql) || u.fremd.ils.toLowerCase().includes(ql)));
  const tile = (u: UnitState) => (
    <button
      key={u.id}
      className={`tile ${u.status === 5 ? 'speak' : ''} ${u.id === ctx.selectedUnit ? 'selected' : ''} ${u.crewPlayerId ? 'manned' : ''} ${u.cover ? 'covering' : ''}`}
      style={{ background: FMS_COLOR[u.status] }}
      title={`${u.callsign} – ${FMS_TEXT[u.status]}${u.cover ? ` – Gebietsabsicherung ${u.cover.name}` : ''}${u.desinfektion ? ' – Desinfektion nach Infektionstransport' : ''}${u.crewPlayerId ? ' (Spieler)' : ''}${u.fremd ? ` – ${u.fremd.ils}, ${u.fremd.wache}` : ''}`}
      onContextMenu={(e) => {
        e.preventDefault();
        ctx.setSelectedUnit(u.id);
        setMenu({ unitId: u.id, x: e.clientX, y: e.clientY });
      }}
      onClick={() => {
        ctx.setSelectedUnit(u.id);
        if (u.incidentId) ctx.setSelectedIncident(u.incidentId);
        ctx.focus(u);
      }}
    >
      <span className="st">{u.status}</span>
      <span>{u.fremd ? radioName(u.callsign) : shortCallsign(u.callsign)}</span>
    </button>
  );
  return (
    <div className="panel unitboard">
      {sel ? (
        <UnitControl ctx={ctx} u={sel} onCover={() => setCoverUnit(sel.id)} />
      ) : (
        <div className="muted small pad">Fahrzeug anklicken für Funk und Details, Rechtsklick für Orten, Gebietsabsicherung und H.</div>
      )}
      {covering.length > 0 && (
        <div className="cover-list small">
          <b>Gebietsabsicherung:</b>
          {covering.map((u) => (
            <button
              key={u.id}
              className="cover-chip"
              title={`${u.callsign} – ${TASK_TEXT[u.task]} ${u.cover!.name}`}
              onClick={() => locate(ctx, u)}
              onContextMenu={(e) => {
                e.preventDefault();
                setMenu({ unitId: u.id, x: e.clientX, y: e.clientY });
              }}
            >
              <span className="fms" style={{ background: FMS_COLOR[u.status] }}>
                {u.status}
              </span>
              {shortCallsign(u.callsign)} → {u.cover!.name}
            </button>
          ))}
        </div>
      )}
      <div className="row unit-filter">
        <input className="grow" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Wache oder Fahrzeug suchen…" />
        <select value={group} onChange={(e) => setGroup(e.target.value)} title="Nach Rufgruppe filtern">
          <option value="">Alle Rufgruppen</option>
          {(scn.tmoGroups ?? [])
            .filter((g) => g.use === 'FW' || g.use === 'RD')
            .map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
        </select>
      </div>
      <div className="stations">
        {fremd.length > 0 && (
          <div className="station-group eswl-group">
            <div className="station-name" title="Über die ESWL von Nachbarleitstellen angeforderte Rettungsmittel">
              ESWL – Fahrzeuge der Nachbarleitstellen
            </div>
            <div className="tiles">{fremd.map(tile)}</div>
          </div>
        )}
        {shown.map((st) => (
          <div key={st.id} className="station-group">
            <div className="station-name" title={st.name}>
              {st.name}
            </div>
            <div className="tiles">
              {state.units.filter((u) => u.stationId === st.id).map(tile)}
            </div>
          </div>
        ))}
      </div>
      {menu && (
        <UnitMenu
          ctx={ctx}
          u={state.units.find((x) => x.id === menu.unitId)}
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          onCover={(id) => setCoverUnit(id)}
        />
      )}
      {coverUnit && <CoverDialog ctx={ctx} unitId={coverUnit} onClose={() => setCoverUnit(null)} />}
    </div>
  );
}

/** Rechtsklick-Menü auf einem Fahrzeug der Statusliste */
function UnitMenu(props: { ctx: GameCtx; u?: UnitState; x: number; y: number; onClose: () => void; onCover: (id: string) => void }) {
  const { ctx, u, onClose } = props;
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== 'Escape') return;
      onClose();
    };
    // Das Menü kann in einem ausgelagerten Fenster stehen, deshalb dessen Fenster beobachten
    const win = ref.current?.ownerDocument.defaultView ?? window;
    const t = setTimeout(() => {
      win.addEventListener('mousedown', close);
      win.addEventListener('keydown', close);
      win.addEventListener('blur', close);
    }, 0);
    return () => {
      clearTimeout(t);
      win.removeEventListener('mousedown', close);
      win.removeEventListener('keydown', close);
      win.removeEventListener('blur', close);
    };
  }, [onClose]);
  if (!u) return null;
  const run = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    fn();
    onClose();
  };
  return (
    <div
      className="unit-menu"
      style={{ left: props.x, top: props.y }}
      ref={(el) => {
        ref.current = el;
        // Nicht über den Fensterrand hinausragen
        if (!el) return;
        const w = el.ownerDocument.defaultView ?? window;
        const r = el.getBoundingClientRect();
        if (r.right > w.innerWidth) el.style.left = `${Math.max(0, w.innerWidth - r.width - 4)}px`;
        if (r.bottom > w.innerHeight) el.style.top = `${Math.max(0, w.innerHeight - r.height - 4)}px`;
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="unit-menu-head">
        <span className="fms" style={{ background: FMS_COLOR[u.status] }}>
          {u.status}
        </span>
        {u.callsign}
      </div>
      <button onClick={run(() => locate(ctx, u))}>Fahrzeug orten</button>
      {u.speak && !u.speak.answered && <button onClick={run(() => conn.send({ a: 'speakPermit', unitId: u.id }))}>J – Sprechaufforderung</button>}
      <button disabled={!canCover(u)} title={canCover(u) ? '' : 'Nur freie Fahrzeuge ohne Einsatz'} onClick={run(() => props.onCover(u.id))}>
        {u.cover ? 'Absicherungsstandort ändern…' : 'Gebietsabsicherung…'}
      </button>
      <button
        disabled={!canSendHome(u)}
        title={canSendHome(u) ? 'FMS-Auftrag H an das Fahrzeug senden' : u.hasPatient ? 'Patient an Bord' : 'Fahrzeug ist auf der Wache oder bereits auf dem Rückweg'}
        onClick={run(() => conn.send({ a: 'sendHome', unitId: u.id }))}
      >
        H – Fahren Sie Wache an
      </button>
    </div>
  );
}

/** Gebietsabsicherung: Standort wählen (andere Wache oder Punkt auf der Karte) */
function CoverDialog({ ctx, unitId, onClose }: { ctx: GameCtx; unitId: string; onClose: () => void }) {
  const { scn, state } = ctx;
  const u = state.units.find((x) => x.id === unitId);
  const [q, setQ] = useState('');
  const [all, setAll] = useState(false);
  const [picking, setPicking] = useState(false);
  // Kartenklick setzt einen freien Bereitstellungsort; die Einsatzmaske bekommt ihren Klick danach zurück
  useEffect(() => {
    if (!picking) return;
    const prev = ctx.mapPickRef.current;
    const mine = (p: { x: number; y: number }) => {
      conn.send({ a: 'cover', unitIds: [unitId], x: Math.round(p.x), y: Math.round(p.y) });
      onClose();
    };
    ctx.mapPickRef.current = mine;
    return () => {
      if (ctx.mapPickRef.current === mine) ctx.mapPickRef.current = prev;
    };
  }, [picking]);
  if (!u) return null;
  const ql = q.toLowerCase().trim();
  const typeLabel = scn.vehicleTypes.find((t) => t.id === u.type)?.label ?? u.type;
  // Passende Wachen haben selbst Fahrzeuge dieses Typs; verwaist, wenn davon keines einsatzbereit auf der Wache steht
  const sameType = (st: Station) => st.vehicles.some((v) => v.type === u.type);
  const verwaist = (st: Station) => sameType(st) && !state.units.some((o) => o.stationId === st.id && o.type === u.type && o.task === 'station' && o.status === 2);
  const covered = (st: Station) => state.units.filter((o) => o.cover?.stationId === st.id).map((o) => shortCallsign(o.callsign));
  const list = scn.stations
    .filter((st) => st.id !== u.stationId && (all || sameType(st)) && (!ql || st.name.toLowerCase().includes(ql)))
    .map((st) => ({ st, km: Math.hypot(st.x - u.x, st.y - u.y) / 1000, leer: verwaist(st), cov: covered(st) }))
    .sort((a, b) => Number(b.leer) - Number(a.leer) || a.km - b.km)
    .slice(0, 60);
  // Bereitstellungsräume aus dem Editor stehen über den Wachen
  const org = scn.vehicleTypes.find((t) => t.id === u.type)?.org;
  const raeume = (scn.bereitstellungsraeume ?? [])
    .filter((b) => (all || !b.org || b.org === org) && (!ql || b.name.toLowerCase().includes(ql)))
    .map((b) => ({ b, km: Math.hypot(b.x - u.x, b.y - u.y) / 1000, cov: state.units.filter((o) => o.cover?.raumId === b.id).map((o) => shortCallsign(o.callsign)) }))
    .sort((a, b) => a.km - b.km);
  if (picking)
    return (
      <div className="cover-picking">
        Gebietsabsicherung {shortCallsign(u.callsign)}: Standort auf der Karte anklicken
        <button className="small-btn" onClick={onClose}>
          Abbrechen
        </button>
      </div>
    );
  return (
    <div className="modal-bg" onMouseDown={onClose}>
      <div className="modal cover-dialog" onMouseDown={(e) => e.stopPropagation()}>
        <h2>Gebietsabsicherung – {u.callsign}</h2>
        <p className="small muted">
          Das Fahrzeug rückt mit Status 3 aus, fährt mit Status 1 ohne Sondersignal zum Standort und bleibt dort auf Status 1, bis es mit H zur Wache
          zurückgeschickt oder zu einem Einsatz alarmiert wird. Angezeigt werden Wachen mit eigenem {typeLabel} (sonst „alle Wachen“), verwaiste stehen oben.
        </p>
        <div className="row">
          <input className="grow" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Wache oder Bereitstellungsraum suchen…" />
          <label className="small">
            <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> alle Wachen
          </label>
          {!ctx.mobile && <button onClick={() => setPicking(true)}>Punkt auf Karte…</button>}
        </div>
        <div className="cover-stations">
          {raeume.length > 0 && <div className="cover-head small muted">Bereitstellungsräume</div>}
          {raeume.map(({ b, km, cov }) => (
            <button
              key={b.id}
              className="cover-station"
              onClick={() => {
                conn.send({ a: 'cover', unitIds: [u.id], raumId: b.id });
                onClose();
              }}
            >
              <span className="tag br">BR</span>
              <span className="grow">{b.name}</span>
              {cov.length > 0 && <span className="tag">abgesichert: {cov.join(', ')}</span>}
              <span className="muted">{km.toFixed(1)} km</span>
            </button>
          ))}
          {raeume.length > 0 && <div className="cover-head small muted">Wachen</div>}
          {list.map(({ st, km, leer, cov }) => (
            <button
              key={st.id}
              className="cover-station"
              onClick={() => {
                conn.send({ a: 'cover', unitIds: [u.id], stationId: st.id });
                onClose();
              }}
            >
              <span className="grow">{st.name}</span>
              {leer && <span className="tag warn">verwaist</span>}
              {cov.length > 0 && <span className="tag">abgesichert: {cov.join(', ')}</span>}
              <span className="muted">{km.toFixed(1)} km</span>
            </button>
          ))}
          {!list.length && <div className="muted small pad">Keine passende Wache gefunden.</div>}
        </div>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button onClick={onClose}>Abbrechen</button>
        </div>
      </div>
    </div>
  );
}

function UnitControl({ ctx, u, onCover }: { ctx: GameCtx; u: UnitState; onCover: () => void }) {
  const { scn, state } = ctx;
  const [text, setText] = useState('');
  // Spricht der Disponent bei ausgewähltem Fahrzeug, geht das als Funkspruch an dieses Fahrzeug
  useSpeechTarget(`unit-${u.id}`, 30, (spoken) => conn.send({ a: 'radio', unitId: u.id, text: spoken }));
  const inc = state.incidents.find((i) => i.id === u.incidentId);
  const type = scn.vehicleTypes.find((t) => t.id === u.type);
  const crew = state.players.find((p) => p.id === u.crewPlayerId);
  const def = scn.stations.find((st) => st.id === u.stationId)?.vehicles.find((v) => v.id === u.id);
  return (
    <div className="unit-control">
      <div className="uc-head">
        <span className="fms big" style={{ background: FMS_COLOR[u.status] }}>
          {u.status}
        </span>
        <div>
          <b>{u.callsign}</b> <span className="muted">({type?.label})</span>
          {crew && <span className="manned-tag"> besetzt von {crew.name}</span>}
          <div className="small">
            {FMS_TEXT[u.status]} · {TASK_TEXT[u.task]}
            {u.eta ? ` · ETA ${formatDuration(u.eta - state.time)}` : ''}
            {inc ? ` · ${inc.nr} ${inc.stichwort} ${inc.address}` : ''}
            {u.cover && !inc ? ` · ${u.cover.name}` : ''}
            {u.infektion ? ' · Infektionstransport' : ''}
            {u.desinfektion ? ` · Desinfektion${u.desinfektion.bis !== undefined ? `, noch ${formatDuration(u.desinfektion.bis - state.time)}` : ' (Anfahrt Wache)'}` : ''}
          </div>
          {def?.dienst && <div className="small muted">Dienst: {dienstText(def.dienst)}</div>}
          {u.fremd && (
            <div className="small muted">
              ESWL: {u.fremd.ils}, {u.fremd.wache} · {u.fremd.imBereich ? 'im eigenen Bereich' : 'außerhalb des Bereichs'}
            </div>
          )}
        </div>
        <button className="small-btn" onClick={() => ctx.setSelectedUnit(null)}>
          ✕
        </button>
      </div>
      <div className="row small">
        <span className="muted">TMO</span>
        <select value={u.tmo ?? ''} onChange={(e) => conn.send({ a: 'setTmo', unitIds: [u.id], group: e.target.value })} title="Gruppenwechsel anweisen">
          {(scn.tmoGroups ?? []).map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </div>
      <div className="row">
        {u.speak && !u.speak.answered && (
          <button className="primary" onClick={() => conn.send({ a: 'speakPermit', unitId: u.id })}>
            Sprechaufforderung (J)
          </button>
        )}
        {u.task === 'awaitHospital' && (
          <HospitalSelect ctx={ctx} u={u} />
        )}
        {u.incidentId && !u.hasPatient && (
          <button onClick={() => conn.send({ a: 'releaseUnit', unitId: u.id })}>Aus Einsatz nehmen</button>
        )}
        <button className="small-btn" title="Fahrzeug auf der Karte zeigen" onClick={() => locate(ctx, u)}>
          Orten
        </button>
        {canCover(u) && (
          <button className="small-btn" title="Fahrzeug zur Gebietsabsicherung verlegen" onClick={onCover}>
            Absichern
          </button>
        )}
        {canSendHome(u) && !u.incidentId && (
          <button className="small-btn" title="FMS-Auftrag H – Fahren Sie Wache an" onClick={() => conn.send({ a: 'sendHome', unitId: u.id })}>
            H
          </button>
        )}
        <form
          className="row grow"
          onSubmit={(e) => {
            e.preventDefault();
            if (!text.trim()) return;
            conn.send({ a: 'radio', unitId: u.id, text });
            setText('');
          }}
        >
          <input className="grow" value={text} onChange={(e) => setText(e.target.value)} placeholder={`Funkspruch an ${shortCallsign(u.callsign)}…`} />
          <button type="submit">Senden</button>
        </form>
        <MicButton targetId={`unit-${u.id}`} label="Funken" />
      </div>
    </div>
  );
}
