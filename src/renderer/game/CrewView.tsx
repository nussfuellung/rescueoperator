// Ansicht für Spieler, die ein Fahrzeug besetzen: FMS-Bedienteil, Einsatzdaten, Funk.
import { useState } from 'react';
import { FMS_COLOR, FMS_TEXT, formatClock, formatDuration, shortCallsign } from '../../../shared/catalog';
import type { FmsStatus } from '../../../shared/types';
import { conn } from '../net';
import { MapView } from '../MapView';
import type { GameCtx } from './GameScreen';

const KEYS: FmsStatus[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];

export function CrewView({ ctx }: { ctx: GameCtx }) {
  const { state, scn } = ctx;
  const me = state.players.find((p) => p.id === ctx.me);
  const u = state.units.find((x) => x.id === me?.unitId);
  const [text, setText] = useState('');
  const [filter, setFilter] = useState('');

  if (!u) {
    const free = state.units.filter((x) => !x.crewPlayerId && x.callsign.toLowerCase().includes(filter.toLowerCase()));
    return (
      <div className="crew-pick">
        <h2>Fahrzeug besetzen</h2>
        <p className="muted">Wähle das Fahrzeug, das du als Besatzung fährst. Die Leitstelle alarmiert dich, du meldest Status und Lage über Funk.</p>
        <input placeholder="Suchen…" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <div className="crew-grid">
          {free.map((x) => (
            <button key={x.id} onClick={() => conn.send({ a: 'setRole', role: 'crew', unitId: x.id })}>
              <span className="fms" style={{ background: FMS_COLOR[x.status] }}>
                {x.status}
              </span>{' '}
              {x.callsign}
            </button>
          ))}
        </div>
      </div>
    );
  }

  const inc = state.incidents.find((i) => i.id === u.incidentId);
  const myRadio = state.radio.filter((m) => m.from === u.callsign || m.to === u.callsign || m.to === 'alle');

  return (
    <div className="crew">
      <div className="crew-left">
        <div className="fms-device">
          <div className="fms-display">
            <div className="fms-cs">{u.callsign}</div>
            <div className="fms-status" style={{ color: FMS_COLOR[u.status] }}>
              Status {u.status} – {FMS_TEXT[u.status]}
            </div>
            {u.eta && <div>Ankunft in {formatDuration(u.eta - state.time)}</div>}
          </div>
          <div className="fms-keys">
            {KEYS.map((k) => (
              <button key={k} className={u.status === k ? 'active' : ''} onClick={() => conn.send({ a: 'crewStatus', status: k })}>
                <b>{k}</b>
                <span>{FMS_TEXT[k]}</span>
              </button>
            ))}
          </div>
        </div>
        {u.hint && <div className="crew-hint">{u.hint}</div>}
        {inc && (
          <div className="crew-incident">
            <div className="panel-subtitle">Einsatzauftrag {inc.nr}</div>
            <div className="big-text">
              {inc.stichwort} – {inc.label}
            </div>
            <div>{inc.address}</div>
            {inc.note && <div className="note">{inc.note}</div>}
            {inc.lage && <div className="lage">Lage: {inc.lage}</div>}
            <div className="muted small">
              Mitalarmiert:{' '}
              {inc.unitIds
                .filter((id) => id !== u.id)
                .map((id) => shortCallsign(state.units.find((x) => x.id === id)?.callsign ?? ''))
                .join(', ') || '–'}
            </div>
          </div>
        )}
        {u.task === 'awaitHospital' && (
          <select
            defaultValue=""
            onChange={(e) => e.target.value && conn.send({ a: 'crewHospital', hospitalId: e.target.value })}
          >
            <option value="">Zielklinik selbst wählen…</option>
            {scn.hospitals.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name} ({h.specialties.join(', ')})
              </option>
            ))}
          </select>
        )}
        <div className="panel radio crew-radio">
          <div className="panel-title">Funk</div>
          <div className="radio-log">
            {myRadio.slice(-40).map((m) => (
              <div key={m.id} className={`radio-line ${m.kind}`}>
                <span className="muted">{formatClock(state.clockStart, m.t)}</span>{' '}
                <b>{m.from === scn.ilsName ? 'ILS' : shortCallsign(m.from)}</b>: {m.text}
              </div>
            ))}
          </div>
          <form
            className="row"
            onSubmit={(e) => {
              e.preventDefault();
              if (!text.trim()) return;
              conn.send({ a: 'crewRadio', text });
              setText('');
            }}
          >
            <input className="grow" value={text} onChange={(e) => setText(e.target.value)} placeholder="Funkspruch an die Leitstelle…" />
            <button type="submit">Senden</button>
          </form>
        </div>
        <button onClick={() => conn.send({ a: 'setRole', role: 'crew' })}>Fahrzeug verlassen</button>
      </div>
      <div className="crew-map">
        <MapView
          scenario={scn}
          focus={ctx.selectedUnit === u.id ? null : { x: u.x, y: u.y, seq: u.incidentId ? 1 : 0 }}
          data={{ units: state.units, incidents: inc ? [inc] : [], selectedUnitId: u.id, selectedIncidentId: inc?.id }}
          hitKinds={[]}
        />
      </div>
    </div>
  );
}
