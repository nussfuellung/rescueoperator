// Einsatzliste, Einsatzdetails und Disposition nach AAO.
import { useEffect, useMemo, useState } from 'react';
import { FMS_COLOR, FMS_TEXT, formatClock, formatDuration, shortCallsign } from '../../../shared/catalog';
import { computeProposal } from '../../../shared/dispatch';
import type { IncidentState } from '../../../shared/types';
import { conn } from '../net';
import type { GameCtx } from './GameScreen';

export function IncidentPanel({ ctx }: { ctx: GameCtx }) {
  const { state } = ctx;
  const list = [...state.incidents].sort((a, b) => {
    const order = { offen: 0, alarmiert: 1, laufend: 2, abgeschlossen: 3 };
    return order[a.status] - order[b.status] || b.createdAt - a.createdAt;
  });
  const sel = state.incidents.find((i) => i.id === ctx.selectedIncident);

  return (
    <div className="panel incidents">
      <div className="panel-title">Einsätze ({state.incidents.filter((i) => i.status !== 'abgeschlossen').length} aktiv)</div>
      <div className="incident-list">
        {list.length === 0 && <div className="muted small pad">Keine Einsätze.</div>}
        {list.map((i) => (
          <div
            key={i.id}
            className={`incident-row ${i.status} ${i.id === ctx.selectedIncident ? 'selected' : ''}`}
            onClick={() => {
              ctx.setSelectedIncident(i.id);
              ctx.focus(i);
            }}
          >
            <span className={`badge ${i.status}`}>{i.status}</span>
            <b>{i.stichwort}</b>
            <span className="addr">{i.address}</span>
            <span className="muted small">
              {i.unitIds.length} Fz · {formatDuration(state.time - i.createdAt)}
            </span>
          </div>
        ))}
      </div>
      {sel && <IncidentDetail ctx={ctx} inc={sel} />}
    </div>
  );
}

function IncidentDetail({ ctx, inc }: { ctx: GameCtx; inc: IncidentState }) {
  const { scn, state, graph } = ctx;
  const types = useMemo(() => new Map(scn.vehicleTypes.map((t) => [t.id, t])), [scn]);
  const sw = scn.stichworte.find((s) => s.code === inc.stichwort);
  const tick = Math.floor(state.time / 5000);
  const assignedKey = inc.unitIds.join(',');

  // AAO-Vorschlag und Fahrzeiten aller freien Fahrzeuge
  const { proposal, free } = useMemo(() => {
    const proposal = sw && !inc.firstArrival ? computeProposal(scn, graph, state.units, inc, sw.aao) : [];
    const start = graph.nearestNode(inc);
    const { time } = graph.dijkstra(start);
    const free = state.units
      .filter((u) => !u.incidentId && [1, 2].includes(u.baseStatus))
      .map((u) => {
        const n = graph.nearestNode(u);
        const t = types.get(u.type);
        const st = scn.stations.find((s) => s.id === u.stationId);
        const turnout = u.baseStatus === 2 ? (st?.career || t?.org === 'RD' ? 60 : 250) : 8;
        return { u, seconds: (n >= 0 ? time[n] : Infinity) / (1.2 * (t?.speedFactor ?? 1)) + turnout };
      })
      .sort((a, b) => a.seconds - b.seconds);
    return { proposal, free };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inc.id, inc.stichwort, inc.x, inc.y, tick, assignedKey, !!inc.firstArrival]);

  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState('');
  const proposalKey = proposal.map((p) => p.unitId).join(',');
  useEffect(() => {
    setChecked(new Set(proposal.map((p) => p.unitId)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inc.id, inc.stichwort, assignedKey, proposalKey]);

  const toggle = (id: string) => {
    const n = new Set(checked);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    setChecked(n);
  };

  const assigned = inc.unitIds.map((id) => state.units.find((u) => u.id === id)!).filter(Boolean);
  const shownFree = free.filter(
    (x) =>
      !filter ||
      x.u.type === filter ||
      x.u.callsign.toLowerCase().includes(filter.toLowerCase()),
  );

  return (
    <div className="incident-detail">
      <div className="detail-head">
        <div>
          <b>{inc.nr}</b> · {formatClock(state.clockStart, inc.createdAt)} · angelegt von {inc.createdBy}
        </div>
        <button className="small-btn" onClick={() => ctx.setSelectedIncident(null)}>
          ✕
        </button>
      </div>
      <div className="detail-addr">{inc.address}</div>
      <div className="row">
        <select
          value={inc.stichwort}
          onChange={(e) => conn.send({ a: 'updateIncident', incidentId: inc.id, stichwort: e.target.value })}
          disabled={inc.status === 'abgeschlossen'}
        >
          {scn.stichworte.map((s) => (
            <option key={s.code} value={s.code}>
              {s.code} – {s.label}
            </option>
          ))}
        </select>
        {inc.patients > 0 && <span className="muted small">{inc.patients} Pat.</span>}
      </div>
      {inc.note && <div className="note">{inc.note}</div>}
      {inc.lage && <div className="lage">Lage vor Ort: {inc.lage}</div>}

      {assigned.length > 0 && (
        <>
          <div className="panel-subtitle">Eingesetzte Fahrzeuge</div>
          <table className="units-table">
            <tbody>
              {assigned.map((u) => (
                <tr key={u.id} onClick={() => ctx.setSelectedUnit(u.id)} className={u.id === ctx.selectedUnit ? 'selected' : ''}>
                  <td>
                    <span className="fms" style={{ background: FMS_COLOR[u.status] }}>
                      {u.status}
                    </span>
                  </td>
                  <td>{u.callsign}</td>
                  <td className="muted small">
                    {u.task === 'alarmed'
                      ? 'alarmiert'
                      : u.eta
                        ? `ETA ${formatDuration(u.eta - state.time)}`
                        : u.task === 'awaitHospital'
                          ? 'wartet auf Zielklinik'
                          : FMS_TEXT[u.status]}
                  </td>
                  <td>
                    {!u.hasPatient && inc.status !== 'abgeschlossen' && (
                      <button
                        className="small-btn"
                        title="Fahrzeug aus dem Einsatz nehmen"
                        onClick={(e) => {
                          e.stopPropagation();
                          conn.send({ a: 'releaseUnit', unitId: u.id });
                        }}
                      >
                        Abziehen
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {inc.status !== 'abgeschlossen' && (
        <>
          <div className="panel-subtitle">
            Alarmierung {sw && Object.keys(sw.aao).length > 0 && <span className="muted small">AAO: {aaoText(sw.aao, types)}</span>}
          </div>
          <div className="row">
            <select value={filter} onChange={(e) => setFilter(e.target.value)} className="grow">
              <option value="">Alle freien Fahrzeuge</option>
              {scn.vehicleTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  nur {t.label}
                </option>
              ))}
            </select>
          </div>
          <div className="free-list">
            {shownFree.slice(0, 40).map(({ u, seconds }) => {
              const prop = proposal.find((p) => p.unitId === u.id);
              return (
                <label key={u.id} className={`free-row ${prop ? 'proposed' : ''}`}>
                  <input type="checkbox" checked={checked.has(u.id)} onChange={() => toggle(u.id)} />
                  <span className="fms" style={{ background: FMS_COLOR[u.status] }}>
                    {u.status}
                  </span>
                  <span className="cs">{u.callsign}</span>
                  <span className="muted small">{types.get(u.type)?.label}</span>
                  <span className="eta">{isFinite(seconds) ? formatDuration(seconds * 1000) : '–'}</span>
                </label>
              );
            })}
            {shownFree.length === 0 && <div className="muted small pad">Keine freien Fahrzeuge.</div>}
          </div>
          <div className="row">
            <button
              className="primary grow alarm-btn"
              disabled={checked.size === 0}
              onClick={() => conn.send({ a: 'alarm', incidentId: inc.id, unitIds: [...checked] })}
            >
              Alarmieren ({checked.size})
            </button>
            <button
              onClick={() => {
                if (confirm(`Einsatz ${inc.nr} abschließen?`)) conn.send({ a: 'closeIncident', incidentId: inc.id });
              }}
            >
              Abschließen
            </button>
          </div>
        </>
      )}

      <details className="log">
        <summary>Einsatzprotokoll ({inc.log.length})</summary>
        {inc.log.map((l, i) => (
          <div key={i} className="small">
            <span className="muted">{formatClock(state.clockStart, l.t)}</span> {l.text}
          </div>
        ))}
      </details>
    </div>
  );
}

function aaoText(aao: Record<string, number>, types: Map<string, { label: string }>) {
  return Object.entries(aao)
    .map(([t, n]) => `${n}× ${types.get(t)?.label ?? t}`)
    .join(', ');
}

export function unitShort(cs: string) {
  return shortCallsign(cs);
}
