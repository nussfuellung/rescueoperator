// Fahrzeugstatus-Tableau mit Bedienleiste für das ausgewählte Fahrzeug.
import { useState } from 'react';
import { FMS_COLOR, FMS_TEXT, formatDuration, shortCallsign } from '../../../shared/catalog';
import type { UnitState } from '../../../shared/types';
import { conn } from '../net';
import type { GameCtx } from './GameScreen';

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
};

export function UnitBoard({ ctx }: { ctx: GameCtx }) {
  const { scn, state } = ctx;
  const sel = state.units.find((u) => u.id === ctx.selectedUnit);
  return (
    <div className="panel unitboard">
      {sel ? <UnitControl ctx={ctx} u={sel} /> : <div className="muted small pad">Fahrzeug anklicken für Funk und Details.</div>}
      <div className="stations">
        {scn.stations.map((st) => (
          <div key={st.id} className="station-group">
            <div className="station-name" title={st.name}>
              {st.name}
            </div>
            <div className="tiles">
              {state.units
                .filter((u) => u.stationId === st.id)
                .map((u) => (
                  <button
                    key={u.id}
                    className={`tile ${u.status === 5 ? 'speak' : ''} ${u.id === ctx.selectedUnit ? 'selected' : ''} ${u.crewPlayerId ? 'manned' : ''}`}
                    style={{ background: FMS_COLOR[u.status] }}
                    title={`${u.callsign} – ${FMS_TEXT[u.status]}${u.crewPlayerId ? ' (Spieler)' : ''}`}
                    onClick={() => {
                      ctx.setSelectedUnit(u.id);
                      if (u.incidentId) ctx.setSelectedIncident(u.incidentId);
                      ctx.focus(u);
                    }}
                  >
                    <span className="st">{u.status}</span>
                    <span>{shortCallsign(u.callsign)}</span>
                  </button>
                ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function UnitControl({ ctx, u }: { ctx: GameCtx; u: UnitState }) {
  const { scn, state } = ctx;
  const [text, setText] = useState('');
  const inc = state.incidents.find((i) => i.id === u.incidentId);
  const type = scn.vehicleTypes.find((t) => t.id === u.type);
  const crew = state.players.find((p) => p.id === u.crewPlayerId);
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
          </div>
        </div>
        <button className="small-btn" onClick={() => ctx.setSelectedUnit(null)}>
          ✕
        </button>
      </div>
      <div className="row">
        {u.speak && !u.speak.answered && (
          <button className="primary" onClick={() => conn.send({ a: 'speakPermit', unitId: u.id })}>
            Sprechaufforderung (J)
          </button>
        )}
        {u.task === 'awaitHospital' && (
          <select
            defaultValue=""
            onChange={(e) => e.target.value && conn.send({ a: 'assignHospital', unitId: u.id, hospitalId: e.target.value })}
          >
            <option value="">Zielklinik zuweisen…</option>
            {scn.hospitals.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name} ({h.specialties.join(', ')})
              </option>
            ))}
          </select>
        )}
        {u.incidentId && !u.hasPatient && (
          <button onClick={() => conn.send({ a: 'releaseUnit', unitId: u.id })}>Aus Einsatz nehmen</button>
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
      </div>
    </div>
  );
}
