// IVENA: Zuweisung von Patienten an Zielkliniken per PZC und Übersicht, welche Klinik welchen Fachbereich an- oder abgemeldet hat.
import { useState } from 'react';
import { SPECIALTIES, formatClock, radioName } from '../../../shared/catalog';
import { DRINGLICHKEIT, PZC_LISTE, decodePzc, pzcFachbereich, pzcText, zielFach } from '../../../shared/pzc';
import { aufnahmepflicht, klinikKm } from '../../../shared/ivena';
import type { Hospital, PublicState, UnitState } from '../../../shared/types';
import { conn } from '../net';
import type { GameCtx } from './GameScreen';

/** Kurzbezeichnungen für die Spaltenköpfe der Kapazitätsübersicht */
const KURZ: Record<string, string> = {
  'Innere Medizin': 'Innere',
  Chirurgie: 'Chir.',
  Unfallchirurgie: 'UCH',
  'Kardiologie (HKL)': 'HKL',
  'Stroke Unit': 'Stroke',
  Pädiatrie: 'Päd.',
  Verbrennungen: 'Verbr.',
  Urologie: 'Uro',
  Gynäkologie: 'Gyn',
  Geburtshilfe: 'Geburt',
  HNO: 'HNO',
  Augenheilkunde: 'Auge',
  Psychiatrie: 'Psych.',
};

type Ab = NonNullable<PublicState['ivena']>['abmeldungen'][number];

const abmeldung = (state: PublicState, h: Hospital, fach: string): Ab | undefined =>
  state.ivena?.abmeldungen.find((a) => a.hospitalId === h.id && a.fach === fach);

/** Kliniken für einen Patienten: vereinbartes Verlegungsziel, dann geeignet und angemeldet (oder aufnahmepflichtig), dann nach Entfernung */
export function rankHospitals(ctx: GameCtx, u: UnitState) {
  const d = u.pzc ? decodePzc(u.pzc) : undefined;
  const fach = d ? zielFach(d.fach, ctx.scn.hospitals) : undefined;
  const ab = (id: string, f: string) => !!ctx.state.ivena?.abmeldungen.some((a) => a.hospitalId === id && a.fach === f);
  return ctx.scn.hospitals
    .map((h) => {
      const has = !fach || h.specialties.includes(fach);
      const abm = fach ? abmeldung(ctx.state, h, fach) : undefined;
      const km = Math.hypot(h.x - u.x, h.y - u.y) / 1000;
      const pflicht = !!abm && aufnahmepflicht(u.pzc, u, h, ctx.scn.hospitals, ab);
      const vereinbart = u.verlegungNach === h.id;
      const warte = ctx.state.ivena?.wartezeit?.[h.id];
      return { h, has, ab: abm, km, pflicht, vereinbart, warte, ok: has && (!abm || pflicht), rang: klinikKm(h, u) };
    })
    .sort((a, b) => Number(b.vereinbart) - Number(a.vereinbart) || Number(b.ok) - Number(a.ok) || Number(b.has) - Number(a.has) || a.rang - b.rang);
}

type Rang = ReturnType<typeof rankHospitals>[number];

/** Entfernung, bei Kliniken außerhalb der Karte mit Fahrzeit ab dem Kartenrand */
const entfernung = ({ h, km }: Rang) => `${km.toFixed(1)} km${h.ausserhalbMin ? ` + ${h.ausserhalbMin} min ab Kartenrand` : ''}`;

/** Zusatz zur Klinik: vereinbartes Ziel, Aufnahmepflicht, Abmeldung, fehlender Fachbereich, Übergabedauer */
const zusatz = (r: Rang) =>
  [
    r.vereinbart ? 'vereinbartes Ziel' : '',
    r.pflicht ? `Aufnahmepflicht trotz Abmeldung (${r.ab!.grund})` : r.ab ? `abgemeldet (${r.ab.grund})` : '',
    !r.has ? 'Fachbereich fehlt' : '',
    r.warte !== undefined ? `Übergabe ca. ${r.warte} min` : '',
  ]
    .filter(Boolean)
    .join(' · ');

/** Auswahlfeld Zielklinik mit IVENA-Status */
export function HospitalSelect({ ctx, u }: { ctx: GameCtx; u: UnitState }) {
  return (
    <select
      defaultValue=""
      title={u.pzc ? `PZC ${u.pzc}: ${pzcText(u.pzc)}` : undefined}
      onChange={(e) => e.target.value && conn.send({ a: 'assignHospital', unitId: u.id, hospitalId: e.target.value })}
    >
      <option value="">{u.pzc ? `PZC ${u.pzc} – Zielklinik…` : 'Zielklinik zuweisen…'}</option>
      {rankHospitals(ctx, u).map((r) => (
        <option key={r.h.id} value={r.h.id}>
          {r.vereinbart ? '★' : r.pflicht ? '⚠' : r.ab ? '⛔' : r.has ? '✓' : '✗'} {r.h.name} · {entfernung(r)}
          {zusatz(r) ? ` · ${zusatz(r)}` : ''}
        </option>
      ))}
    </select>
  );
}

/** Knopf für die Voranmeldung einer Tracerdiagnose in der Zielklinik */
export function VoranmeldenButton({ ctx, u }: { ctx: GameCtx; u: UnitState }) {
  const v = u.voranmeldung;
  if (!v) return null;
  const h = ctx.scn.hospitals.find((x) => x.id === v.hospitalId);
  if (v.t !== undefined) return <span className="small ok-text">✓ {v.art} vorangemeldet</span>;
  return (
    <button className="attention" title={`${v.art} im ${h?.name ?? 'Zielkrankenhaus'} voranmelden`} onClick={() => conn.send({ a: 'voranmelden', unitId: u.id })}>
      {v.art} voranmelden
    </button>
  );
}

/** Fahrzeuge mit Tracerpatient, deren Zielklinik noch nicht vorangemeldet ist */
export const offeneVoranmeldungen = (state: PublicState) => state.units.filter((u) => u.voranmeldung && u.voranmeldung.t === undefined);

export function IvenaModal({ ctx, onClose }: { ctx: GameCtx; onClose: () => void }) {
  const { scn, state } = ctx;
  const [tab, setTab] = useState<'zuweisung' | 'uebersicht' | 'pzc'>('zuweisung');
  const [suche, setSuche] = useState('');
  const clock = (t: number) => formatClock(state.clockStart, t).slice(0, 5);
  // Nur Patienten, deren PZC die Besatzung schon durchgegeben hat
  const offen = state.units.filter((u) => u.task === 'awaitHospital' && !u.hospitalId && u.pzc);
  const voran = offeneVoranmeldungen(state);
  const rang = (f: string) => (SPECIALTIES.indexOf(f) + 1 || 99);
  const fachs = [...new Set(scn.hospitals.flatMap((h) => h.specialties))].sort((a, b) => rang(a) - rang(b));
  const zuw = [...(state.ivena?.zuweisungen ?? [])].reverse();
  const hname = (id: string) => scn.hospitals.find((h) => h.id === id)?.name ?? id;
  const lastHour = (id: string) => (state.ivena?.zuweisungen ?? []).filter((z) => z.hospitalId === id && state.time - z.t < 3600_000).length;

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal wide ivena" onClick={(e) => e.stopPropagation()}>
        <div className="row">
          <h2 className="grow">IVENA eHealth</h2>
          <button className={tab === 'zuweisung' ? 'primary' : ''} onClick={() => setTab('zuweisung')}>
            Zuweisung{offen.length + voran.length ? ` (${offen.length + voran.length})` : ''}
          </button>
          <button className={tab === 'uebersicht' ? 'primary' : ''} onClick={() => setTab('uebersicht')}>
            Behandlungskapazitäten
          </button>
          <button className={tab === 'pzc' ? 'primary' : ''} onClick={() => setTab('pzc')}>
            PZC-Liste
          </button>
        </div>

        {tab === 'zuweisung' && (
          <>
            {voran.length > 0 && (
              <>
                <h3>Voranmeldung nötig</h3>
                {voran.map((u) => {
                  const inc = state.incidents.find((i) => i.id === u.incidentId);
                  return (
                    <div key={u.id} className="ivena-voran">
                      <b>{radioName(u.callsign)}</b>
                      <span className="grow small">
                        {inc ? `${inc.nr} · ` : ''}
                        {u.pzc ? `PZC ${u.pzc} ${pzcText(u.pzc)} · ` : ''}nach {hname(u.voranmeldung!.hospitalId)}
                      </span>
                      <VoranmeldenButton ctx={ctx} u={u} />
                    </div>
                  );
                })}
              </>
            )}
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
                      <div className="pzc-teile small">
                        <code>{d.pzc.slice(0, 3)}</code>
                        <span>
                          {d.eintrag?.text ?? 'unbekannte Rückmeldeindikation'} <span className="muted">(Gruppe {d.eintrag?.gruppe ?? '?'})</span>
                        </span>
                        <code>{d.pzc.slice(3, 5)}</code>
                        <span>Alter {d.alter === 0 ? 'unter 1 Jahr (Säugling)' : `${d.alter} Jahre`}</span>
                        <code>{d.pzc.slice(5)}</code>
                        <span>{DRINGLICHKEIT[d.dringlichkeit]}</span>
                        <span />
                        <span>
                          benötigter Fachbereich: <b>{d.fach}</b>
                          {zielFach(d.fach, scn.hospitals) !== d.fach && (
                            <span className="muted">
                              {' '}
                              (im Bereich nicht vorhanden: Erstversorgung {zielFach(d.fach, scn.hospitals)}, Weiterverlegung über die Zentrale Anlaufstelle)
                            </span>
                          )}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="ivena-kliniken">
                    {u.verlegungNach && (
                      <div className="small">
                        Verlegung: Zielklinik <b>{hname(u.verlegungNach)}</b> ist zwischen den Ärzten vereinbart.
                      </div>
                    )}
                    {best.some((r) => r.pflicht) && (
                      <div className="small warn">
                        Vitale Bedrohung: Die nächste geeignete Klinik muss trotz Abmeldung aufnehmen (Aufnahmepflicht), die nächste aufnahmebereite
                        ist deutlich weiter entfernt.
                      </div>
                    )}
                    {best.map((r) => (
                      <button
                        key={r.h.id}
                        className={r.vereinbart || r.ok ? 'ivena-ok' : r.ab ? 'ivena-ab' : 'ivena-no'}
                        title={
                          r.pflicht
                            ? `Aufnahmepflicht bei vitaler Bedrohung, abgemeldet bis ${clock(r.ab!.bis)}: ${r.ab!.grund}`
                            : r.ab
                              ? `abgemeldet bis ${clock(r.ab.bis)}: ${r.ab.grund}`
                              : !r.has
                                ? 'Fachbereich nicht vorhanden'
                                : 'aufnahmebereit'
                        }
                        onClick={() => conn.send({ a: 'assignHospital', unitId: u.id, hospitalId: r.h.id })}
                      >
                        {r.vereinbart && '★ '}
                        {r.h.name}
                        <span className="small"> {entfernung(r)}</span>
                        {r.warte !== undefined && <span className="small"> · Übergabe ca. {r.warte} min</span>}
                        {r.pflicht ? (
                          <span className="small"> · Aufnahmepflicht</span>
                        ) : (
                          r.ab && <span className="small"> · ab bis {clock(r.ab.bis)}</span>
                        )}
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
                      {z.aufnahmepflicht && <span className="muted"> Aufnahmepflicht</span>}
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
            <p className="small muted">
              Grün: aufnahmebereit, rot: abgemeldet (Grund und Ende per Mauszeiger), grau: Fachbereich nicht vorhanden. Spaltenname per Mauszeiger
              ausgeschrieben.
            </p>
            <div className="ivena-scroll">
              <table className="ivena-table ivena-grid">
                <thead>
                  <tr>
                    <th>Klinik</th>
                    {fachs.map((f) => (
                      <th key={f} title={f}>
                        {KURZ[f] ?? f}
                      </th>
                    ))}
                    <th title="Zuweisungen der letzten 60 Minuten">Zuw. 60 min</th>
                    <th title="Geschätzte Übergabedauer in der Notaufnahme">Übergabe</th>
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
                            {ab ? `ab –${clock(ab.bis)}` : 'an'}
                          </td>
                        );
                      })}
                      <td>{lastHour(h.id)}</td>
                      <td>{state.ivena?.wartezeit?.[h.id] !== undefined ? `${state.ivena.wartezeit[h.id]} min` : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        {tab === 'pzc' && (
          <>
            <p className="small muted">
              Die ersten drei Ziffern des PZC sind die Rückmeldeindikation (Erkrankungs- bzw. Verletzungsbild), danach folgen das Alter
              (zwei Stellen) und die Behandlungsdringlichkeit (1 Notfallversorgung, 2 stationär, 3 ambulant).
            </p>
            <input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Code oder Begriff suchen, z. B. 711 oder Kolik…" />
            <div className="ivena-scroll">
              <table className="ivena-table small pzc-liste">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Rückmeldeindikation</th>
                    <th>Fachbereich</th>
                  </tr>
                </thead>
                <tbody>
                  {PZC_LISTE.filter((p) => {
                    const q = suche.trim().toLowerCase();
                    return !q || p.code.startsWith(q) || `${p.text} ${p.gruppe} ${pzcFachbereich(p.code)}`.toLowerCase().includes(q);
                  }).flatMap((p, i, arr) => [
                    ...(i === 0 || arr[i - 1].gruppe !== p.gruppe
                      ? [
                          <tr key={`g${p.code}`} className="gruppe">
                            <td colSpan={3}>{p.gruppe}</td>
                          </tr>,
                        ]
                      : []),
                    <tr key={p.code}>
                      <td>{p.code}</td>
                      <td>{p.text}</td>
                      <td>{pzcFachbereich(p.code)}</td>
                    </tr>,
                  ])}
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
