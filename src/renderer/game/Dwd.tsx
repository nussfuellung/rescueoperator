// Wetterwarnungen des Deutschen Wetterdienstes an die Leitstelle (wie per Fax bzw. FeWIS)
import { useEffect, useRef, useState } from 'react';
import { formatClock } from '../../../shared/catalog';
import type { DwdMeldung, PublicState } from '../../../shared/types';
import { alarmTone } from '../sound';

const STUFE_FARBE: Record<number, string> = { 1: '#ffeb3b', 2: '#fb8c00', 3: '#e53935', 4: '#8e24aa' };
const KIND_LABEL: Record<DwdMeldung['kind'], string> = { vorab: 'Vorabinformation', warnung: 'Warnung', aufhebung: 'Aufhebung' };

/** Warnung, die gerade gilt oder angekündigt ist (ohne aufgehobene) */
export function aktuelleWarnung(state: PublicState): DwdMeldung | undefined {
  const list = state.dwd ?? [];
  const last = list[list.length - 1];
  return last && last.kind !== 'aufhebung' ? last : undefined;
}

/** Knopf in der Kopfleiste; neue Meldungen öffnen das Fenster von selbst */
export function DwdButton({ state, notify }: { state: PublicState; notify: boolean }) {
  const [open, setOpen] = useState(false);
  const seen = useRef<number | null>(null);
  const list = state.dwd ?? [];
  useEffect(() => {
    if (seen.current === null) {
      seen.current = list.length;
      return;
    }
    if (list.length > seen.current) {
      seen.current = list.length;
      if (notify) {
        setOpen(true);
        alarmTone();
      }
    }
  }, [list.length, notify]);
  if (!list.length) return null;
  const w = aktuelleWarnung(state);
  const aktiv = w && state.time >= w.von && state.time < w.bis;
  return (
    <>
      <button
        className="dwd-btn"
        style={w ? { borderColor: STUFE_FARBE[w.stufe], color: STUFE_FARBE[w.stufe] } : undefined}
        onClick={() => setOpen(true)}
        title="Meldungen des Deutschen Wetterdienstes"
      >
        ⚠ DWD{w ? ` Stufe ${w.stufe}${aktiv ? '' : w.kind === 'vorab' ? ' (Vorab)' : ' (ab ' + formatClock(state.clockStart, w.von).slice(0, 5) + ')'}` : ''}
      </button>
      {open && <DwdModal state={state} onClose={() => setOpen(false)} />}
    </>
  );
}

export function DwdModal({ state, onClose }: { state: PublicState; onClose: () => void }) {
  const list = [...(state.dwd ?? [])].reverse();
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal wide dwd" onClick={(e) => e.stopPropagation()}>
        <h2>DWD-Wetterwarnungen</h2>
        {list.map((m, i) => (
          <div key={m.id} className={`dwd-msg ${i ? 'old' : ''}`} style={{ borderLeftColor: STUFE_FARBE[m.stufe] }}>
            <div className="dwd-head">
              <b>{KIND_LABEL[m.kind]}</b> · eingegangen {formatClock(state.clockStart, m.t).slice(0, 5)} Uhr
            </div>
            <pre>{m.text}</pre>
          </div>
        ))}
        <button className="primary" onClick={onClose}>
          Zur Kenntnis genommen
        </button>
      </div>
    </div>
  );
}
