// Zubuchen weiterer Fahrzeuge in der Einsatzmaske: Suche über Funkrufname, Fahrzeugtyp und Wache.
import { useEffect, useMemo, useRef, useState } from 'react';
import { formatDuration } from '../../../shared/catalog';
import type { Scenario, UnitState } from '../../../shared/types';

type Sicht = 'zeit' | 'wache';

export function ZubuchenDialog(props: {
  scn: Scenario;
  free: { u: UnitState; seconds: number }[];
  proposalIds: Set<string>;
  selected: Set<string>;
  onApply: (selected: Set<string>) => void;
  onClose: () => void;
}) {
  const { scn, free } = props;
  const [sel, setSel] = useState(() => new Set(props.selected));
  const [query, setQuery] = useState('');
  const [typ, setTyp] = useState('');
  const [sicht, setSicht] = useState<Sicht>('zeit');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);

  const types = useMemo(() => new Map(scn.vehicleTypes.map((t) => [t.id, t])), [scn]);
  const stations = useMemo(() => new Map(scn.stations.map((s) => [s.id, s])), [scn]);
  // Nur Typen anbieten, von denen gerade ein Fahrzeug frei ist
  const freeTypes = useMemo(() => [...new Set(free.map((x) => x.u.type))].map((id) => types.get(id)).filter(Boolean), [free, types]);

  const hits = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return free.filter((x) => {
      if (typ && x.u.type !== typ) return false;
      const hay = `${x.u.callsign} ${x.u.type} ${types.get(x.u.type)?.label ?? ''} ${stations.get(x.u.stationId)?.name ?? ''}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [free, query, typ, types, stations]);

  // Wachen nach ihrem schnellsten Fahrzeug sortiert
  const groups = useMemo(() => {
    const m = new Map<string, typeof hits>();
    for (const x of hits) {
      const g = m.get(x.u.stationId) ?? [];
      g.push(x);
      m.set(x.u.stationId, g);
    }
    return [...m.entries()];
  }, [hits]);

  const toggle = (id: string) => {
    const n = new Set(sel);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    setSel(n);
  };
  const toggleAll = (ids: string[]) => {
    const n = new Set(sel);
    const all = ids.every((id) => n.has(id));
    for (const id of ids) {
      if (all) n.delete(id);
      else n.add(id);
    }
    setSel(n);
  };
  const apply = () => props.onApply(sel);

  const row = (x: { u: UnitState; seconds: number }, wache: boolean) => (
    <label key={x.u.id} className={`zb-row ${sel.has(x.u.id) ? 'on' : ''} ${props.proposalIds.has(x.u.id) ? 'vorschlag' : ''}`}>
      <input type="checkbox" checked={sel.has(x.u.id)} onChange={() => toggle(x.u.id)} />
      <span className="cs">{x.u.callsign}</span>
      <span className="typ muted">{types.get(x.u.type)?.label ?? x.u.type}</span>
      {!wache && <span className="wache muted">{stations.get(x.u.stationId)?.name ?? ''}</span>}
      <span className="st" title={x.u.baseStatus === 2 ? 'Einsatzbereit auf Wache' : x.u.baseStatus === 8 ? 'Übergabe in der Klinik, fährt nach Abschluss von dort los' : 'Einsatzbereit über Funk'}>
        S{x.u.baseStatus}
      </span>
      {props.proposalIds.has(x.u.id) ? <span className="tag">AAO</span> : <span />}
      <span className="eta">{formatDuration(x.seconds * 1000)}</span>
    </label>
  );

  const added = [...sel].filter((id) => !props.proposalIds.has(id)).length;
  return (
    <div className="modal-bg" onClick={props.onClose}>
      <div
        className="modal zubuchen"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Escape') props.onClose();
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) apply();
        }}
      >
        <div className="zb-head">
          <h2>Fahrzeuge zubuchen</h2>
          <span className="muted small">freie Fahrzeuge, Ausrück- und Fahrzeit zum Einsatzort</span>
        </div>
        <div className="row">
          <input
            ref={input}
            className="grow"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Suchen: Funkrufname, Fahrzeugtyp oder Wache, z. B. „DLK“ oder „FW Musterstadt“"
            onKeyDown={(e) => {
              // Enter bucht den ersten Treffer zu bzw. wieder ab
              if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && hits.length) {
                e.preventDefault();
                toggle(hits[0].u.id);
              }
            }}
          />
          <select value={typ} onChange={(e) => setTyp(e.target.value)}>
            <option value="">Alle Typen</option>
            {freeTypes.map((t) => (
              <option key={t!.id} value={t!.id}>
                {t!.label}
              </option>
            ))}
          </select>
          <div className="zb-sicht">
            <button type="button" className={sicht === 'zeit' ? 'on' : ''} onClick={() => setSicht('zeit')}>
              Nach Fahrzeit
            </button>
            <button type="button" className={sicht === 'wache' ? 'on' : ''} onClick={() => setSicht('wache')}>
              Nach Wache
            </button>
          </div>
        </div>
        <div className="zb-list">
          {!hits.length && <div className="muted small zb-empty">{free.length ? 'Kein freies Fahrzeug passt zur Suche.' : 'Gerade ist kein Fahrzeug frei.'}</div>}
          {sicht === 'zeit'
            ? hits.map((x) => row(x, false))
            : groups.map(([sid, xs]) => {
                const ids = xs.map((x) => x.u.id);
                const all = ids.every((id) => sel.has(id));
                return (
                  <div key={sid} className="zb-group">
                    <div className="zb-ghead">
                      <b>{stations.get(sid)?.name ?? sid}</b>
                      <span className="muted small">
                        {xs.length} frei · ab {formatDuration(xs[0].seconds * 1000)}
                      </span>
                      <button type="button" className="small-btn" onClick={() => toggleAll(ids)}>
                        {all ? 'Keins' : 'Alle'}
                      </button>
                    </div>
                    {xs.map((x) => row(x, true))}
                  </div>
                );
              })}
        </div>
        <div className="row zb-foot">
          <span className="grow small muted">
            {sel.size} Fahrzeug{sel.size === 1 ? '' : 'e'} ausgewählt{added ? `, davon ${added} zugebucht` : ''}
          </span>
          <button type="button" onClick={props.onClose}>
            Abbrechen
          </button>
          <button type="button" className="primary" onClick={apply} title="Strg+Enter">
            Übernehmen
          </button>
        </div>
      </div>
    </div>
  );
}
