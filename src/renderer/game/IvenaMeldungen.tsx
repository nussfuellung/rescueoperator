// Benachrichtigung, wenn eine Klinik einen Fachbereich in IVENA abmeldet oder wieder anmeldet.
import { useEffect, useRef, useState } from 'react';
import { formatClock } from '../../../shared/catalog';
import type { IvenaAbmeldung } from '../../../shared/types';
import { beep } from '../sound';
import type { GameCtx } from './GameScreen';

interface Meldung {
  key: string;
  ab: boolean;
  titel: string;
  text: string;
}

const ANZEIGE_MS = 15_000;
const schluessel = (a: IvenaAbmeldung) => `${a.hospitalId}:${a.fach}:${a.seit ?? a.bis}`;

export function IvenaMeldungen({ ctx }: { ctx: GameCtx }) {
  const { state, scn } = ctx;
  const [list, setList] = useState<Meldung[]>([]);
  // Abmeldungen beim letzten Stand; beim Beitritt schon bestehende nicht melden
  const vorher = useRef<Map<string, IvenaAbmeldung> | null>(null);
  const abmeldungen = state.ivena?.abmeldungen;

  useEffect(() => {
    const jetzt = new Map((abmeldungen ?? []).map((a) => [schluessel(a), a]));
    const alt = vorher.current;
    vorher.current = jetzt;
    if (!alt) return;
    const name = (id: string) => scn.hospitals.find((h) => h.id === id)?.name ?? id;
    const clock = (t: number) => formatClock(state.clockStart, t).slice(0, 5);
    const neu: Meldung[] = [];
    for (const [key, a] of jetzt)
      if (!alt.has(key))
        neu.push({ key: `ab:${key}`, ab: true, titel: `IVENA: ${a.fach} abgemeldet`, text: `${name(a.hospitalId)} – ${a.grund}, voraussichtlich bis ${clock(a.bis)}` });
    for (const [key, a] of alt)
      if (!jetzt.has(key) && scn.hospitals.some((h) => h.id === a.hospitalId && h.specialties.includes(a.fach)))
        neu.push({ key: `an:${key}`, ab: false, titel: `IVENA: ${a.fach} wieder verfügbar`, text: `${name(a.hospitalId)} nimmt wieder auf` });
    if (!neu.length) return;
    beep();
    setList((l) => [...l, ...neu].slice(-4));
    for (const m of neu) setTimeout(() => setList((l) => l.filter((x) => x.key !== m.key)), ANZEIGE_MS);
  }, [abmeldungen, scn, state.clockStart]);

  if (!list.length) return null;
  return (
    <div className="eswl-meldungen">
      {list.map((m) => (
        <div
          key={m.key}
          className={`eswl-meldung ivena-meldung ${m.ab ? 'abgelehnt' : 'ok'}`}
          title="IVENA öffnen"
          onClick={() => {
            ctx.openIvena?.();
            setList((l) => l.filter((x) => x.key !== m.key));
          }}
        >
          <div className="eswl-meldung-titel">
            <b>
              {m.ab ? '⛔' : '✓'} {m.titel}
            </b>
            <button
              className="small-btn"
              onClick={(e) => {
                e.stopPropagation();
                setList((l) => l.filter((x) => x.key !== m.key));
              }}
            >
              ✕
            </button>
          </div>
          <div className="small">{m.text}</div>
        </div>
      ))}
    </div>
  );
}
