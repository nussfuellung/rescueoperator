// Benachrichtigung, wenn eine Nachbarleitstelle auf eine ESWL-Anforderung antwortet (Zusage oder Ablehnung).
import { useEffect, useRef, useState } from 'react';
import { alarmTone, beep } from '../sound';
import type { GameCtx } from './GameScreen';

interface Meldung {
  key: string;
  incidentId: string;
  ok: boolean;
  titel: string;
  text: string;
}

const ANZEIGE_MS = 20_000;

export function EswlMeldungen({ ctx }: { ctx: GameCtx }) {
  const { state, scn } = ctx;
  const [list, setList] = useState<Meldung[]>([]);
  // Antworten, die beim Beitritt schon vorlagen, nicht noch einmal melden
  const seen = useRef<Set<string> | null>(null);

  useEffect(() => {
    const neu: Meldung[] = [];
    const first = !seen.current;
    seen.current ??= new Set();
    for (const inc of state.incidents)
      for (const r of inc.eswl ?? []) {
        if (r.status === 'angefragt') continue;
        const key = `${inc.id}:${r.id}`;
        if (seen.current.has(key)) continue;
        seen.current.add(key);
        if (first) continue;
        const label = scn.vehicleTypes.find((t) => t.id === r.type)?.label ?? r.type;
        neu.push(
          r.status === 'zugesagt'
            ? { key, incidentId: inc.id, ok: true, titel: `ESWL zugesagt – ${r.ils}`, text: `${r.callsign} (${label}) kommt zu ${inc.nr}, ${inc.address}${r.text ? ` – ${r.text}` : ''}` }
            : { key, incidentId: inc.id, ok: false, titel: `ESWL abgelehnt – ${r.ils}`, text: `Kein ${label} für ${inc.nr}, ${inc.address}${r.text ? ` – ${r.text}` : ''}. Bitte anderweitig disponieren.` },
        );
      }
    if (!neu.length) return;
    if (neu.some((m) => !m.ok)) alarmTone();
    else beep();
    setList((l) => [...l, ...neu].slice(-5));
    for (const m of neu) setTimeout(() => setList((l) => l.filter((x) => x.key !== m.key)), ANZEIGE_MS);
  }, [state.incidents, scn]);

  if (!list.length) return null;
  return (
    <div className="eswl-meldungen">
      {list.map((m) => (
        <div
          key={m.key}
          className={`eswl-meldung ${m.ok ? 'ok' : 'abgelehnt'}`}
          title="Zum Einsatz springen"
          onClick={() => {
            ctx.setSelectedIncident(m.incidentId);
            const inc = state.incidents.find((i) => i.id === m.incidentId);
            if (inc) ctx.focus(inc);
            setList((l) => l.filter((x) => x.key !== m.key));
          }}
        >
          <div className="eswl-meldung-titel">
            <b>{m.ok ? '✓' : '✕'} {m.titel}</b>
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
