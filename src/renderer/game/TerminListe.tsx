// Terminfahrten: bestellte Krankentransporte mit Abholzeit, die noch nicht disponiert sind.
import { useState } from 'react';
import { formatHhmm, formatMinuten, terminAusUhrzeit } from '../../../shared/catalog';
import type { IncidentState, PublicState } from '../../../shared/types';
import { conn } from '../net';
import { confirmHier } from '../Popout';
import type { GameCtx } from './GameScreen';

/** Geplant und noch ohne Fahrzeug: steht in der Terminliste statt in der Einsatzliste */
export function istGeplant(i: IncidentState) {
  return i.termin !== undefined && i.status === 'offen' && !i.unitIds.length;
}

function stand(state: PublicState, i: IncidentState) {
  const rest = i.termin! - state.time;
  if (rest <= 0) return { cls: 'faellig', text: `fällig seit ${formatMinuten(-rest)}` };
  return { cls: rest <= 30 * 60_000 ? 'bald' : '', text: `in ${formatMinuten(rest)}` };
}

export function TerminListe({ ctx }: { ctx: GameCtx }) {
  const { state } = ctx;
  const list = state.incidents.filter(istGeplant).sort((a, b) => a.termin! - b.termin!);
  if (!list.length) return null;
  return (
    <div className="termin-liste">
      <div className="termin-kopf small">🕑 Terminfahrten ({list.length})</div>
      {list.map((i) => {
        const s = stand(state, i);
        return (
          <div
            key={i.id}
            className={`incident-row termin-row ${s.cls} ${i.id === ctx.selectedIncident ? 'selected' : ''}`}
            title="Geplanter Krankentransport: Erinnerung 30 Minuten vor der Abholzeit und bei Fälligkeit"
            onClick={() => {
              ctx.setSelectedIncident(i.id);
              ctx.focus(i);
            }}
          >
            <span className={`badge termin ${s.cls}`}>{formatHhmm(state.clockStart, i.termin!)}</span>
            <span className="inc-sw">
              <b>{i.stichwort}</b>
              {i.patient && <span className="muted small">{i.patient}</span>}
            </span>
            <span className="addr">{i.objekt && !i.address.startsWith(i.objekt) ? `${i.objekt}, ${i.address}` : i.address}</span>
            <span className="muted small">{s.text}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Abholzeit in den Einsatzdetails anzeigen und ändern */
export function TerminZeile({ ctx, inc }: { ctx: GameCtx; inc: IncidentState }) {
  const { state } = ctx;
  const [edit, setEdit] = useState<string | null>(null);
  const offen = inc.status !== 'abgeschlossen' && !inc.firstArrival;
  if (inc.termin === undefined && !offen) return null;
  if (edit !== null) {
    const t = terminAusUhrzeit(state.clockStart, state.time, edit);
    return (
      <form
        className="termin-zeile row small"
        onSubmit={(e) => {
          e.preventDefault();
          conn.send({ a: 'updateIncident', incidentId: inc.id, termin: edit ? t : null });
          setEdit(null);
        }}
      >
        🕑 Abholung um
        <input type="time" value={edit} onChange={(e) => setEdit(e.target.value)} autoFocus />
        <button type="submit" className="small-btn primary" disabled={(!edit && inc.termin === undefined) || (!!edit && t === undefined)}>
          {edit || inc.termin === undefined ? 'Übernehmen' : 'Termin aufheben'}
        </button>
        <button type="button" className="small-btn" onClick={() => setEdit(null)}>
          Abbrechen
        </button>
      </form>
    );
  }
  if (inc.termin === undefined) {
    if (!inc.stichwort.startsWith('RD KTP')) return null;
    return (
      <div className="termin-zeile small">
        <button className="small-btn" onClick={() => setEdit('')}>
          🕑 Als Terminfahrt planen
        </button>
      </div>
    );
  }
  const s = stand(state, inc);
  return (
    <div className={`termin-zeile small ${offen ? s.cls : ''}`}>
      🕑 Terminfahrt, Abholung <b>{formatHhmm(state.clockStart, inc.termin)} Uhr</b>
      {offen && <span className="muted"> · {s.text}</span>}
      {offen && (
        <button className="small-btn" onClick={() => setEdit(formatHhmm(state.clockStart, inc.termin!))}>
          ändern
        </button>
      )}
      {offen && (
        <button
          className="small-btn danger"
          title="Abgesagte Terminfahrt stornieren; bereits alarmierte Fahrzeuge werden frei"
          onClick={(e) => {
            if (confirmHier(e.currentTarget, `Terminfahrt ${inc.nr} stornieren?${inc.unitIds.length ? ' Alarmierte Fahrzeuge werden frei.' : ''}`)) conn.send({ a: 'closeIncident', incidentId: inc.id });
          }}
        >
          stornieren
        </button>
      )}
    </div>
  );
}
