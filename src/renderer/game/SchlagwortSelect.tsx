// Auswahl des Schlagworts zu einem Einsatzstichwort, nach ABek-Kategorie gruppiert (z. B. RD 1: Atmung, Herz/Kreislauf, Neuro/Psych, Trauma …).
import { useMemo } from 'react';
import { findSchlagwort, formatSchlagwort, schlagworteNachKategorie } from '../../../shared/schlagworte';

export function SchlagwortSelect({
  stichwort,
  value,
  onChange,
  disabled,
}: {
  stichwort: string;
  value: string;
  onChange: (schlagwort: string) => void;
  disabled?: boolean;
}) {
  const groups = useMemo(() => schlagworteNachKategorie(stichwort), [stichwort]);
  if (!groups.length) return null;
  const hinweis = findSchlagwort(value)?.hinweis;
  return (
    <div className="em-sw-select">
      <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} className="grow">
        <option value="">– Schlagwort / Kategorie –</option>
        {groups.map(([kat, list]) => (
          <optgroup key={kat} label={kat}>
            {list.map((s) => (
              <option key={formatSchlagwort(s)} value={formatSchlagwort(s)} title={s.hinweis}>
                {s.nr} {s.text}
                {s.rtw ? ` (+${s.rtw} RTW)` : ''}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      {hinweis && <div className="small muted">{hinweis}</div>}
    </div>
  );
}
