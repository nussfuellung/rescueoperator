// Dialog: Leitstellenbereich aus echten OpenStreetMap-Daten erzeugen.
import { useState } from 'react';
import { OVERPASS_URLS, bboxAround, importOsm, nominatimUrl, overpassQuery, parseNominatim, type PlaceHit } from '../../../shared/osmimport';
import { newId } from '../../../shared/mapgen';
import type { Scenario } from '../../../shared/types';
import { fetchText } from '../api';

export function OsmImportDialog({ onDone, onCancel }: { onDone: (scn: Scenario, notes: string[]) => void; onCancel: () => void }) {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<PlaceHit[]>([]);
  const [place, setPlace] = useState<PlaceHit | null>(null);
  const [radius, setRadius] = useState(5);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');

  const search = async () => {
    if (!query.trim()) return;
    setErr('');
    setBusy('Suche Ort…');
    try {
      const list = parseNominatim(await fetchText(nominatimUrl(query)));
      setHits(list);
      if (!list.length) setErr('Nichts gefunden. Anderen Ortsnamen versuchen.');
      if (list.length) choose(list[0]);
    } catch (e) {
      setErr(`Suche fehlgeschlagen: ${(e as Error).message}. Ist der PC mit dem Internet verbunden?`);
    }
    setBusy('');
  };

  const choose = (p: PlaceHit) => {
    setPlace(p);
    setName(p.name.split(',')[0].trim());
  };

  const finish = (json: string, bbox: ReturnType<typeof bboxAround>, areaName = name) => {
    setBusy('Baue Straßennetz…');
    // Dem Browser Zeit zum Anzeigen der Meldung geben
    setTimeout(() => {
      try {
        const { scenario, notes } = importOsm(json, { name: areaName || 'Echte Karte', bbox });
        scenario.id = newId('scn');
        onDone(scenario, notes);
      } catch (e) {
        setErr(String((e as Error).message ?? e));
        setBusy('');
      }
    }, 30);
  };

  const run = async () => {
    if (!place) return;
    setErr('');
    const bbox = bboxAround(place, radius);
    const body = `data=${encodeURIComponent(overpassQuery(bbox))}`;
    let lastErr = '';
    for (const url of OVERPASS_URLS) {
      setBusy(`Lade Kartendaten von ${new URL(url).hostname}… (kann bei großen Gebieten eine Minute dauern)`);
      try {
        const json = await fetchText(url, body);
        finish(json, bbox);
        return;
      } catch (e) {
        lastErr = (e as Error).message;
      }
    }
    setErr(`Kartendaten konnten nicht geladen werden: ${lastErr}`);
    setBusy('');
  };

  const fromFile = async (f: File) => {
    setErr('');
    const text = await f.text();
    // Begrenzung aus den Daten selbst ableiten
    try {
      const data = JSON.parse(text) as { elements: { lat?: number; lon?: number }[] };
      let south = 90, north = -90, west = 180, east = -180;
      for (const e of data.elements)
        if (e.lat !== undefined && e.lon !== undefined) {
          south = Math.min(south, e.lat);
          north = Math.max(north, e.lat);
          west = Math.min(west, e.lon);
          east = Math.max(east, e.lon);
        }
      if (south > north) throw new Error('Die Datei enthält keine Koordinaten.');
      const areaName = name || f.name.replace(/\.[^.]+$/, '');
      setName(areaName);
      finish(text, { south, north, west, east }, areaName);
    } catch (e) {
      setErr(`Datei nicht lesbar: ${(e as Error).message}`);
    }
  };

  return (
    <div className="modal-bg">
      <div className="modal wide settings">
        <h2>Leitstelle aus echter Karte</h2>
        <p className="small muted">
          Straßen, Hausnummern, Orte, Feuerwehren, Rettungswachen und Kliniken kommen aus OpenStreetMap. Fahrzeuge werden je Wache
          sinnvoll vorbelegt und lassen sich danach im Editor anpassen. Gefahren wird auf dem echten Straßennetz.
        </p>
        <div className="row">
          <input
            className="grow"
            value={query}
            placeholder="Ort suchen, z. B. Freising oder Landkreis Erding"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && search()}
            autoFocus
          />
          <button onClick={search} disabled={!!busy}>
            Suchen
          </button>
        </div>
        {hits.length > 0 && (
          <div className="osm-hits">
            {hits.map((h, i) => (
              <label key={i} className="inline">
                <input type="radio" checked={place === h} onChange={() => choose(h)} />
                <span className="small">{h.name}</span>
              </label>
            ))}
          </div>
        )}
        {place && (
          <>
            <div className="row">
              <label className="grow">
                Name des Bereichs
                <input value={name} onChange={(e) => setName(e.target.value)} />
              </label>
              <label>
                Umkreis
                <select value={radius} onChange={(e) => setRadius(Number(e.target.value))}>
                  {[2, 3, 5, 8, 12, 15].map((r) => (
                    <option key={r} value={r}>
                      {r} km
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {radius >= 12 && <p className="small muted">Große Gebiete brauchen länger zum Laden und machen die Karte im Spiel träger.</p>}
          </>
        )}
        {busy && <p className="small">{busy}</p>}
        {err && <p className="error small">{err}</p>}
        <div className="row">
          <label className="small muted file-pick">
            Oder Overpass-JSON aus Datei:{' '}
            <input type="file" accept=".json" onChange={(e) => e.target.files?.[0] && fromFile(e.target.files[0])} disabled={!!busy} />
          </label>
          <div className="spacer" />
          <button onClick={onCancel} disabled={!!busy && !err}>
            Abbrechen
          </button>
          <button className="primary" onClick={run} disabled={!place || !!busy}>
            Karte importieren
          </button>
        </div>
        <p className="small muted">Kartendaten © OpenStreetMap-Mitwirkende, ODbL.</p>
      </div>
    </div>
  );
}
