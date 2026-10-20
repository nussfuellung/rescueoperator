// Funkverkehr: Sprechwunsch-Warteschlange und Funkprotokoll.
import { HospitalSelect } from './Ivena';
import { useEffect, useRef, useState } from 'react';
import { formatClock, formatDuration, radioName } from '../../../shared/catalog';
import { conn } from '../net';
import type { GameCtx } from './GameScreen';

export function RadioPanel({ ctx }: { ctx: GameCtx }) {
  const { state, scn } = ctx;
  const queue = state.units.filter((u) => u.speak && !u.speak.answered).sort((a, b) => a.speak!.since - b.speak!.since);
  const waitingHospital = state.units.filter((u) => u.task === 'awaitHospital' && !u.hospitalId && !(u.speak && !u.speak.answered));
  const log = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const groups = scn.tmoGroups ?? [];
  // Mitgehörte Rufgruppen (leer = alle)
  const [muted, setMuted] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(`lst.tmo.${scn.id}`) ?? '[]');
    } catch {
      return [];
    }
  });
  const [callGroup, setCallGroup] = useState(groups.find((g) => g.use === 'Übergreifend')?.id ?? groups[0]?.id ?? '');
  const [callText, setCallText] = useState('');
  const toggleGroup = (id: string) => {
    const n = muted.includes(id) ? muted.filter((x) => x !== id) : [...muted, id];
    setMuted(n);
    try {
      localStorage.setItem(`lst.tmo.${scn.id}`, JSON.stringify(n));
    } catch {
      /* egal */
    }
  };
  const groupName = new Map(groups.map((g) => [g.id, g.name]));
  const lines = state.radio.filter((m) => !m.group || !muted.includes(m.group));

  useEffect(() => {
    if (atBottom.current) log.current?.scrollTo(0, log.current.scrollHeight);
  }, [lines.length]);

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
      {groups.length > 0 && (
        <div className="tmo-bar">
          {groups.map((g) => {
            const busy = state.radio.some((m) => m.group === g.id && state.time - m.t < 15000);
            return (
              <button
                key={g.id}
                className={`tmo-chip ${muted.includes(g.id) ? 'off' : 'on'} ${busy ? 'busy' : ''} ${g.use}`}
                title={muted.includes(g.id) ? 'Rufgruppe mithören' : 'Rufgruppe ausblenden'}
                onClick={() => toggleGroup(g.id)}
              >
                {g.name}
              </button>
            );
          })}
        </div>
      )}
      {(queue.length > 0 || waitingHospital.length > 0) && (
        <div className="speak-queue">
          {queue.map((u) => (
            <div key={u.id} className="speak-row">
              <span className="blink-dot" />
              <b>{radioName(u.callsign)}</b>
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
              <b>{radioName(u.callsign)}</b>
              <HospitalSelect ctx={ctx} u={u} />
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
        {lines.map((m) => (
          <div key={m.id} className={`radio-line ${m.kind} ${m.from === scn.ilsName ? 'out' : 'in'}`}>
            <span className="muted">{formatClock(state.clockStart, m.t)}</span>{' '}
            {m.group && <span className="tmo-tag">{groupName.get(m.group) ?? m.group}</span>}{' '}
            <b>{m.from === scn.ilsName ? 'ILS' : radioName(m.from)}</b>
            {m.to !== scn.ilsName && <> → {radioName(m.to)}</>}: {m.text}
          </div>
        ))}
      </div>
      {groups.length > 0 && (
        <form
          className="row group-call"
          onSubmit={(e) => {
            e.preventDefault();
            if (!callText.trim()) return;
            conn.send({ a: 'groupCall', group: callGroup, text: callText });
            setCallText('');
          }}
        >
          <select value={callGroup} onChange={(e) => setCallGroup(e.target.value)}>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
          <input className="grow" value={callText} onChange={(e) => setCallText(e.target.value)} placeholder="Gruppenruf an alle in der Rufgruppe…" />
          <button type="submit">Senden</button>
        </form>
      )}
    </div>
  );
}
