// Leitstellen-Katalog: eigene Leitstellen veröffentlichen oder privat stellen, Leitstellen anderer Spieler herunterladen.
import { useEffect, useState } from 'react';
import type { KatalogEintrag, Sichtbarkeit } from '../../../shared/protocol';
import { newId, validateScenario } from '../../../shared/mapgen';
import type { Scenario } from '../../../shared/types';
import { api, type ScenarioInfo } from '../api';
import { KatalogFehler, entfernen, herunterladen, katalogServer, ladeKatalog, ladeMeine, setzeSichtbarkeit, veroeffentlichen } from '../katalog';

const BUILTIN_ID = 'scn_ils_wuerzburg';

function spielerName(): string {
  try {
    return localStorage.getItem('lst.name') ?? '';
  } catch {
    return '';
  }
}

const datum = (ms: number) => new Date(ms).toLocaleDateString('de-DE');

/** Eigene Leitstellen auf dem Server, nach Kennung */
export function useMeine(addr: string) {
  const [meine, setMeine] = useState<Map<string, KatalogEintrag>>(new Map());
  const [fehler, setFehler] = useState('');
  const laden = async () => {
    try {
      const l = await ladeMeine(addr);
      setMeine(new Map(l.leitstellen.map((e) => [e.id, e])));
      setFehler('');
    } catch (e) {
      setFehler((e as Error).message);
    }
  };
  useEffect(() => {
    void laden();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addr]);
  return { meine, fehler, laden };
}

export function StatusBadge({ e }: { e?: KatalogEintrag }) {
  if (!e) return <span className="badge kat-lokal">nur lokal</span>;
  return e.sichtbarkeit === 'offen' ? <span className="badge kat-offen">öffentlich</span> : <span className="badge kat-privat">privat auf Server</span>;
}

/**
 * Leitstelle hochladen, Sichtbarkeit ändern oder vom Server nehmen.
 * onSaved bekommt die Leitstelle zurück, wenn sie lokal geändert wurde (Autor, Beschreibung, neue Kennung als Kopie).
 */
export function VeroeffentlichenDialog(props: { scn: Scenario; eintrag?: KatalogEintrag; onClose: (changed: boolean) => void; onSaved?: (scn: Scenario) => void }) {
  const scn = props.scn;
  const addr = katalogServer();
  const [autor, setAutor] = useState(scn.autor || spielerName());
  const [beschreibung, setBeschreibung] = useState(scn.beschreibung ?? '');
  const [sicht, setSicht] = useState<Sichtbarkeit>(props.eintrag?.sichtbarkeit ?? 'offen');
  const [eintrag, setEintrag] = useState(props.eintrag);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [changed, setChanged] = useState(false);
  const probleme = validateScenario(scn);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setErr('');
    setOk('');
    try {
      await fn();
      setChanged(true);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const alsKopie = async () => {
    scn.id = newId('scn');
    scn.herkunft = undefined;
    await api.saveScenario(scn);
    props.onSaved?.(scn);
  };

  const hochladen = () =>
    run(async () => {
      if (!autor.trim()) throw new Error('Bitte einen Autorennamen angeben.');
      scn.autor = autor.trim();
      scn.beschreibung = beschreibung.trim();
      // Die mitgelieferte ILS Würzburg hat jeder: als eigene Kopie veröffentlichen
      if (scn.id === BUILTIN_ID) {
        if (!confirm('Die mitgelieferte ILS Würzburg wird als eigene Kopie mit neuer Kennung veröffentlicht. Fortfahren?')) return;
        await alsKopie();
      } else if (!/^[A-Za-z0-9_.-]{1,80}$/.test(scn.id)) {
        // Kennungen aus fremden Dateien, die der Server nicht annimmt
        await alsKopie();
      }
      await api.saveScenario(scn);
      props.onSaved?.(scn);
      let e: KatalogEintrag;
      try {
        e = await veroeffentlichen(addr, scn, sicht);
      } catch (x) {
        if (!(x instanceof KatalogFehler && x.status === 403)) throw x;
        const von = scn.herkunft?.autor ? ` (${scn.herkunft.autor})` : '';
        if (!confirm(`Diese Leitstelle gehört auf dem Server einem anderen Spieler${von}. Als eigene Kopie mit neuer Kennung veröffentlichen?`)) return;
        await alsKopie();
        e = await veroeffentlichen(addr, scn, sicht);
      }
      setEintrag(e);
      setOk(sicht === 'offen' ? 'Veröffentlicht. Alle Spieler finden die Leitstelle jetzt im Katalog.' : 'Hochgeladen. Die Leitstelle ist privat und nur für dich sichtbar.');
    });

  return (
    <div className="modal-bg">
      <div className="modal">
        <h2>Leitstelle veröffentlichen</h2>
        <p className="muted small">
          {scn.ilsName} · {scn.towns.length} Orte · {scn.stations.length} Wachen · {scn.stations.reduce((n, s) => n + s.vehicles.length, 0)} Fahrzeuge ·{' '}
          {scn.hospitals.length} Kliniken
        </p>
        <p className="small">
          Status: <StatusBadge e={eintrag} />
          {eintrag && <span className="muted"> · zuletzt hochgeladen {datum(eintrag.aktualisiert)} · {eintrag.downloads}× heruntergeladen</span>}
        </p>
        <label>
          Autor (wird im Katalog angezeigt)
          <input value={autor} maxLength={40} onChange={(e) => setAutor(e.target.value)} />
        </label>
        <label>
          Beschreibung
          <textarea rows={3} maxLength={1000} value={beschreibung} onChange={(e) => setBeschreibung(e.target.value)} placeholder="z. B. Landkreis und Stadt, Stand der Fahrzeuge, Besonderheiten" />
        </label>
        <label className="inline">
          <input type="radio" checked={sicht === 'offen'} onChange={() => setSicht('offen')} />
          Öffentlich: alle Spieler sehen die Leitstelle im Katalog und können sie herunterladen
        </label>
        <label className="inline">
          <input type="radio" checked={sicht === 'privat'} onChange={() => setSicht('privat')} />
          Privat: nur du siehst sie (als Sicherung auf dem Server)
        </label>
        {probleme.length > 0 && sicht === 'offen' && (
          <div className="import-notes small">
            <div>
              <b>Vor dem Veröffentlichen beheben (Reiter „Prüfen“):</b>
              {probleme.slice(0, 6).map((p, i) => (
                <div key={i}>{p}</div>
              ))}
              {probleme.length > 6 && <div>… und {probleme.length - 6} weitere</div>}
            </div>
          </div>
        )}
        <div className="menu-buttons">
          <button className="primary" disabled={busy || (sicht === 'offen' && probleme.length > 0)} onClick={hochladen}>
            {eintrag ? 'Neue Fassung hochladen' : 'Hochladen'}
          </button>
          {eintrag && eintrag.sichtbarkeit !== sicht && (
            <button
              disabled={busy || (sicht === 'offen' && probleme.length > 0)}
              onClick={() =>
                run(async () => {
                  setEintrag(await setzeSichtbarkeit(addr, eintrag.id, sicht));
                  setOk(sicht === 'offen' ? 'Die Leitstelle ist jetzt öffentlich.' : 'Die Leitstelle ist jetzt privat.');
                })
              }
            >
              Nur Sichtbarkeit ändern
            </button>
          )}
          {eintrag && (
            <button
              className="danger"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  if (!confirm('Leitstelle vom Server entfernen? Deine lokale Fassung bleibt erhalten.')) return;
                  await entfernen(addr, eintrag.id);
                  setEintrag(undefined);
                  setOk('Vom Server entfernt.');
                })
              }
            >
              Vom Server entfernen
            </button>
          )}
          <button onClick={() => props.onClose(changed)}>Schließen</button>
        </div>
        {busy && <p className="muted small">Bitte warten …</p>}
        {ok && <p className="ok small">{ok}</p>}
        {err && <p className="error small">{err}</p>}
      </div>
    </div>
  );
}

/** Öffentliche Leitstellen auf dem Online-Server durchsuchen und herunterladen */
export function KatalogListe(props: { lokal: ScenarioInfo[]; onGeladen: () => void }) {
  const addr = katalogServer();
  const [liste, setListe] = useState<KatalogEintrag[] | null>(null);
  const [suche, setSuche] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');
  const [ok, setOk] = useState('');
  const { meine, laden: ladeEigene } = useMeine(addr);

  const laden = async () => {
    setErr('');
    try {
      const l = await ladeKatalog(addr);
      setListe(l.leitstellen);
      void ladeEigene();
    } catch (e) {
      setListe(null);
      setErr((e as Error).message);
    }
  };
  useEffect(() => {
    void laden();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const q = suche.trim().toLowerCase();
  const gefiltert = (liste ?? [])
    .filter((e) => !q || `${e.ilsName} ${e.name} ${e.autor} ${e.beschreibung}`.toLowerCase().includes(q))
    .sort((a, b) => b.aktualisiert - a.aktualisiert);

  return (
    <div>
      <div className="row">
        <span className="grow muted small">Leitstellen auf dem Online-Server</span>
        <button onClick={laden}>Aktualisieren</button>
      </div>
      {liste && (
        <input className="kat-suche" value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Suchen nach Leitstelle, Ort, Autor …" />
      )}
      {err && <p className="error small">{err}</p>}
      {ok && <p className="ok small">{ok}</p>}
      {liste && gefiltert.length === 0 && <p className="muted small">{liste.length ? 'Nichts gefunden.' : 'Noch hat niemand eine Leitstelle veröffentlicht. Sei der Erste!'}</p>}
      <table className="lib">
        <tbody>
          {gefiltert.map((e) => {
            const lokal = props.lokal.find((s) => s.id === e.id);
            const eigen = meine.has(e.id);
            return (
              <tr key={e.id}>
                <td>
                  <b>{e.ilsName}</b> <span className="muted small">von {e.autor || 'unbekannt'}{eigen ? ' (du)' : ''}</span>
                  <div className="muted small">
                    {e.orte} Orte · {e.wachen} Wachen · {e.fahrzeuge} Fahrzeuge · {e.kliniken} Kliniken · {e.echteKarte ? 'echte Karte' : 'Fantasiekarte'} ·{' '}
                    {(e.groesse / 1048576).toFixed(1)} MB · {e.downloads}× geladen · Stand {datum(e.aktualisiert)}
                  </div>
                  {e.beschreibung && <div className="small kat-text">{e.beschreibung}</div>}
                </td>
                <td className="right">
                  <button
                    disabled={!!busy}
                    onClick={async () => {
                      if (lokal && !confirm(`${lokal.ilsName} liegt schon in deiner Bibliothek. Mit der Fassung aus dem Katalog ersetzen?`)) return;
                      setBusy(e.id);
                      setErr('');
                      setOk('');
                      try {
                        const scn = await herunterladen(addr, e.id);
                        await api.saveScenario(scn);
                        setOk(`${scn.ilsName} liegt jetzt in „Meine Leitstellen“ und kann gespielt und bearbeitet werden.`);
                        props.onGeladen();
                      } catch (x) {
                        setErr((x as Error).message);
                      } finally {
                        setBusy('');
                      }
                    }}
                  >
                    {busy === e.id ? 'Lädt …' : lokal ? 'Erneut laden' : 'Herunterladen'}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
