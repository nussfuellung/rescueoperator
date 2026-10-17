// Funkverkehr: Sprechwunsch-Warteschlange und Funkprotokoll.
import { useEffect, useRef } from 'react';
import { formatClock, formatDuration, shortCallsign } from '../../../shared/catalog';
import { conn } from '../net';
import type { GameCtx } from './GameScreen';

export function RadioPanel({ ctx }: { ctx: GameCtx }) {
  const { state, scn } = ctx;
  const queue = state.units.filter((u) => u.speak && !u.speak.answered).sort((a, b) => a.speak!.since - b.speak!.since);
  const waitingHospital = state.units.filter((u) => u.task === 'awaitHospital' && !u.hospitalId && !(u.speak && !u.speak.answered));
  const log = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);

  useEffect(() => {
    if (atBottom.current) log.current?.scrollTo(0, log.current.scrollHeight);
  }, [state.radio.length]);

  // Taste J: ältesten Sprechwunsch annehmen
  const first = queue[0];
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if ((e.key === 'j' || e.key === 'J') && first) {
        conn.send({ a: 'speakPermit', unitId: first.id });
        ctx.setSelectedUnit(first.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [first?.id]);

  return (
    <div className="panel radio">
      <div className="panel-title">
        Funk <span className="muted small">J = Sprechaufforderung</span>
      </div>
      {(queue.length > 0 || waitingHospital.length > 0) && (
        <div className="speak-queue">
          {queue.map((u) => (
            <div key={u.id} className="speak-row">
              <span className="blink-dot" />
              <b>{shortCallsign(u.callsign)}</b>
              <span className="muted small">Status 5 seit {formatDuration(state.time - u.speak!.since)}</span>
              <button
                className="primary small-btn"
                onClick={() => {
                  conn.send({ a: 'speakPermit', unitId: u.id });
                  ctx.setSelectedUnit(u.id);
                }}
              >
                J
              </button>
            </div>
          ))}
          {waitingHospital.map((u) => (
            <div key={u.id} className="speak-row hospital">
              <b>{shortCallsign(u.callsign)}</b>
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
            </div>
          ))}
        </div>
      )}
      <div
        className="radio-log"
        ref={log}
        onScroll={(e) => {
          const el = e.currentTarget;
          atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 30;
        }}
      >
        {state.radio.map((m) => (
          <div key={m.id} className={`radio-line ${m.kind} ${m.from === scn.ilsName ? 'out' : 'in'}`}>
            <span className="muted">{formatClock(state.clockStart, m.t)}</span>{' '}
            <b>{m.from === scn.ilsName ? 'ILS' : shortCallsign(m.from)}</b>
            {m.to !== scn.ilsName && <> → {shortCallsign(m.to)}</>}: {m.text}
          </div>
        ))}
      </div>
    </div>
  );
}
