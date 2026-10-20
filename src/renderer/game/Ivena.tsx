// IVENA: Zuweisung von Patienten an Zielkliniken per PZC und Übersicht, welche Klinik welchen Fachbereich an- oder abgemeldet hat.
import { useState } from 'react';
import { formatClock, radioName } from '../../../shared/catalog';
import { decodePzc, pzcText } from '../../../shared/pzc';
import type { Hospital, PublicState, UnitState } from '../../../shared/types';
import { conn } from '../net';
import type { GameCtx } from './GameScreen';

type Ab = NonNullable<PublicState['ivena']>['abmeldungen'][number];

const abmeldung = (state: PublicState, h: Hospital, fach: string): Ab | undefined =>
  state.ivena?.abmeldungen.find((a) => a.hospitalId === h.id && a.fach === fach);

/** Kliniken für einen Patienten: geeignet und angemeldet zuerst, dann nach Entfernung */
export function rankHospitals(ctx: GameCtx, u: UnitState) {
  const fach = u.pzc ? decodePzc(u.pzc)?.fach : undefined;
  return ctx.scn.hospitals
    .map((h) => {
      const has = !fach || h.specialties.includes(fach);
      const ab = fach ? abmeldung(ctx.state, h, fach) : undefined;
      const km = Math.hypot(h.x - u.x, h.y - u.y) / 1000;
      return { h, has, ab, km, ok: has && !ab };
    })
    .sort((a, b) => Number(b.ok) - Number(a.ok) || Number(b.has) - Number(a.has) || a.km - b.km);
}

/** Auswahlfeld Zielklinik mit IVENA-Status */
export function HospitalSelect({ ctx, u }: { ctx: GameCtx; u: UnitState }) {
  return (
    <select
      defaultValue=""
      title={u.pzc ? `PZC ${u.pzc}: ${pzcText(u.pzc)}` : undefined}
      onChange={(e) => e.target.value && conn.send({ a: 'assignHospital', unitId: u.id, hospitalId: e.target.value })}
    >
      <option value="">{u.pzc ? `PZC ${u.pzc} – Zielklinik…` : 'Zielklinik zuweisen…'}</option>
      {rankHospitals(ctx, u).map(({ h, has, ab, km }) => (
        <option key={h.id} value={h.id}>
          {ab ? '⛔' : has ? '✓' : '✗'} {h.name} · {km.toFixed(1)} km{ab ? ` · abgemeldet (${ab.grund})` : !has ? ' · Fachbereich fehlt' : ''}
        </option>
      ))}
    </select>
  );
}

export function IvenaModal({ ctx, onClose }: { ctx: GameCtx; onClose: () => void }) {
  const { scn, state } = ctx;
  const [tab, setTab] = useState<'zuweisung' | 'uebersicht'>('zuweisung');
  const clock = (t: number) => formatClock(scn.settings.startClock, t).slice(0, 5);
  const offen = state.units.filter((u) => u.task === 'awaitHospital' && !u.hospitalId);
  const fachs = [...new Set(scn.hospitals.flatMap((h) => h.specialties))];
  const zuw = [...(state.ivena?.zuweisungen ?? [])].reverse();
  const hname = (id: string) => scn.hospitals.find((h) => h.id === id)?.name ?? id;
  const lastHour = (id: string) => (state.ivena?.zuweisungen ?? []).filter((z) => z.hospitalId === id && state.time - z.t < 3600_000).length;

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal wide ivena" onClick={(e) => e.stopPropagation()}>
        <div className="row">
          <h2 className="grow">IVENA eHealth</h2>
          <button className={tab === 'zuweisung' ? 'primary' : ''} onClick={() => setTab('zuweisung')}>
            Zuweisung{offen.length ? ` (${offen.length})` : ''}
          </button>
          <button className={tab === 'uebersicht' ? 'primary' : ''} onClick={() => setTab('uebersicht')}>
            Behandlungskapazitäten
          </button>
        </div>

        {tab === 'zuweisung' && (
          <>
            <h3>Offene Patientenanmeldungen</h3>
            {!offen.length && <p className="muted small">Kein Rettungsmittel wartet auf eine Zielklinik.</p>}
            {offen.map((u) => {
              const d = u.pzc ? decodePzc(u.pzc) : undefined;
              const inc = state.incidents.find((i) => i.id === u.incidentId);
              const best = rankHospitals(ctx, u);
              return (
                <div key={u.id} className="ivena-anm">
                  <div className="ivena-pzc">
                    <b>{radioName(u.callsign)}</b>
                    {inc && <span className="muted"> · {inc.nr} · {inc.address}</span>}
                    <div>
                      <code>{u.pzc ?? '––––––'}</code> {u.pzc ? pzcText(u.pzc) : 'kein PZC gemeldet'}
                    </div>
                    {d && (
                      <div className="small muted">
                        Gruppe {d.eintrag?.gruppe ?? '?'} · benötigter Fachbereich: <b>{d.fach}</b>
                      </div>
                    )}
                  </div>
                  <div className="ivena-kliniken">
                    {best.map(({ h, has, ab, km, ok }) => (
                      <button
                        key={h.id}
                        className={ok ? 'ivena-ok' : ab ? 'ivena-ab' : 'ivena-no'}
                        title={ab ? `abgemeldet bis ${clock(ab.bis)}: ${ab.grund}` : !has ? 'Fachbereich nicht vorhanden' : 'aufnahmebereit'}
                        onClick={() => conn.send({ a: 'assignHospital', unitId: u.id, hospitalId: h.id })}
                      >
                        {h.name}
                        <span className="small"> {km.toFixed(1)} km</span>
                        {ab && <span className="small"> · ab bis {clock(ab.bis)}</span>}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
            <h3>Letzte Zuweisungen</h3>
            <table className="ivena-table small">
              <thead>
                <tr>
                  <th>Zeit</th>
                  <th>Rettungsmittel</th>
                  <th>Einsatz</th>
                  <th>PZC</th>
                  <th>Klinik</th>
                </tr>
              </thead>
              <tbody>
                {zuw.slice(0, 15).map((z, i) => (
                  <tr key={i}>
                    <td>{clock(z.t)}</td>
                    <td>{radioName(z.callsign)}</td>
                    <td>{z.nr ?? ''}</td>
                    <td title={z.pzc ? pzcText(z.pzc) : ''}>{z.pzc ?? ''}</td>
                    <td>
                      {hname(z.hospitalId)}
                      {z.trotzAbmeldung && <span className="warn"> trotz Abmeldung</span>}
                    </td>
                  </tr>
                ))}
                {!zuw.length && (
                  <tr>
                    <td colSpan={5} className="muted">
                      Noch keine Zuweisungen in dieser Schicht.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </>
        )}

        {tab === 'uebersicht' && (
          <>
            <p className="small muted">Grün: aufnahmebereit, rot: abgemeldet (Grund und Ende per Mauszeiger), grau: Fachbereich nicht vorhanden.</p>
            <div className="ivena-scroll">
              <table className="ivena-table ivena-grid">
                <thead>
                  <tr>
                    <th>Klinik</th>
                    {fachs.map((f) => (
                      <th key={f}>{f}</th>
                    ))}
                    <th title="Zuweisungen der letzten 60 Minuten">Zuw. 60 min</th>
                  </tr>
                </thead>
                <tbody>
                  {scn.hospitals.map((h) => (
                    <tr key={h.id}>
                      <td>{h.name}</td>
                      {fachs.map((f) => {
                        if (!h.specialties.includes(f)) return <td key={f} className="ivena-cell none" />;
                        const ab = abmeldung(state, h, f);
                        return (
                          <td key={f} className={`ivena-cell ${ab ? 'ab' : 'an'}`} title={ab ? `${ab.grund}, voraussichtlich bis ${clock(ab.bis)}` : 'angemeldet'}>
                            {ab ? `ab bis ${clock(ab.bis)}` : 'an'}
                          </td>
                        );
                      })}
                      <td>{lastHour(h.id)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        <div className="row">
          <span className="small muted grow">PZC = Rückmeldeindikation (3 Stellen) + Alter (2 Stellen) + Dringlichkeit (1 Notfall, 2 stationär, 3 ambulant)</span>
          <button className="primary" onClick={onClose}>
            Schließen
          </button>
        </div>
      </div>
    </div>
  );
}
