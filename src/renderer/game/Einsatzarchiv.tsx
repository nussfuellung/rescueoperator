// Einsatzarchiv: abgeschlossene Einsätze suchen und bei Bedarf wieder eröffnen.
import { useMemo, useState } from 'react';
import { formatClock } from '../../../shared/catalog';
import type { ArchivEintrag } from '../../../shared/types';
import { conn } from '../net';
import type { GameCtx } from './GameScreen';

export function Einsatzarchiv({ ctx, onClose }: { ctx: GameCtx; onClose: () => void }) {
  const { state } = ctx;
  const [q, setQ] = useState('');
  // noch in der Liste stehende abgeschlossene Einsätze und die bereits archivierten, neueste zuerst
  const alle = useMemo(() => {
    const inListe = new Set<string>();
    const eintraege: (ArchivEintrag & { inListe: boolean })[] = [];
    for (const i of state.incidents) {
      if (i.status !== 'abgeschlossen') continue;
      inListe.add(i.id);
      eintraege.push({ ...i, inListe: true });
    }
    for (const a of state.archiv ?? []) if (!inListe.has(a.id)) eintraege.push({ ...a, inListe: false });
    return eintraege.sort((a, b) => (b.closedAt ?? b.createdAt) - (a.closedAt ?? a.createdAt));
  }, [state.incidents, state.archiv]);
  const such = q.trim().toLowerCase();
  const treffer = such ? alle.filter((a) => [a.nr, a.stichwort, a.label, a.schlagwort ?? '', a.address].some((t) => t.toLowerCase().includes(such))) : alle;

  return (
    <div className="einsatzarchiv">
      <div className="row archiv-head">
        <input
          className="grow"
          autoFocus
          placeholder="Suchen: Einsatznummer, Stichwort, Adresse"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && onClose()}
        />
        <button className="small-btn" title="Archiv schließen" onClick={onClose}>
          ✕
        </button>
      </div>
      <div className="archiv-list">
        {treffer.length === 0 && <div className="muted small pad">{alle.length ? 'Kein Treffer.' : 'Noch keine abgeschlossenen Einsätze.'}</div>}
        {treffer.map((a) => (
          <div
            key={a.id}
            className={`archiv-row ${a.id === ctx.selectedIncident ? 'selected' : ''}`}
            title={a.inListe ? 'Einsatz anzeigen' : 'Einsatzort auf der Karte zeigen'}
            onClick={() => {
              if (a.inListe) ctx.setSelectedIncident(a.id);
              ctx.focus(a);
            }}
          >
            <span className="muted small">{a.nr}</span>
            <span>
              <b>{a.stichwort}</b> <span className="muted small">{a.label}</span>
            </span>
            <span className="addr">{a.address}</span>
            <span className="muted small row">
              {a.closedAt !== undefined ? formatClock(state.clockStart, a.closedAt).slice(0, 5) : ''}
              <button
                className="small-btn"
                title="Einsatz wieder eröffnen, z. B. zur Nachalarmierung"
                onClick={(e) => {
                  e.stopPropagation();
                  if (!confirm(`Einsatz ${a.nr} wieder eröffnen?`)) return;
                  conn.send({ a: 'reopenIncident', incidentId: a.id });
                  ctx.setSelectedIncident(a.id);
                  onClose();
                }}
              >
                Wiedereröffnen
              </button>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
