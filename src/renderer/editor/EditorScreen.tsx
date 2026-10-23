// Leitstellen-Bibliothek und Editor für eigene Leitstellen.
import { useEffect, useRef, useState } from 'react';
import { SPECIALTIES, ensureStichworte, orgPrefix } from '../../../shared/catalog';
import { editorHinweise } from '../../../shared/editorpruefung';
import { RoadGraph, projectOnSegment, recomputeHouseNumbers, townAt, nearestTown } from '../../../shared/geo';
import { emptyScenario, generateScenario, newId, validateScenario } from '../../../shared/mapgen';
import type { Dienstzeit, MapObject, NachbarFahrzeug, NachbarLeitstelle, RoadType, Scenario, Station, Stichwort, Vec } from '../../../shared/types';
import { api, type ScenarioInfo } from '../api';
import { MapView, type Hit } from '../MapView';
import { OsmImportDialog } from './OsmImportDialog';
import { KatalogListe, StatusBadge, VeroeffentlichenDialog, useMeine } from './Katalog';
import { katalogServer } from '../katalog';
import { applyFleetText, assignFleet, ensureTmo } from '../../../shared/fleet';
import { applyLstsim, dienstText } from '../../../shared/lstsim';
import type { TmoGroup } from '../../../shared/types';

export function EditorScreen({ onBack }: { onBack: () => void }) {
  const [list, setList] = useState<ScenarioInfo[]>([]);
  const [editing, setEditing] = useState<Scenario | null>(null);
  const [osm, setOsm] = useState(false);
  const [notes, setNotes] = useState<string[]>([]);
  const [ansicht, setAnsicht] = useState<'eigene' | 'katalog'>('eigene');
  const [publish, setPublish] = useState<Scenario | null>(null);
  const { meine, fehler: meineFehler, laden: ladeMeine } = useMeine(katalogServer());
  const refresh = () => api.listScenarios().then(setList);
  useEffect(() => {
    refresh();
  }, []);

  if (editing) {
    return (
      <Editor
        initial={editing}
        notes={notes}
        onClose={() => {
          setNotes([]);
          setEditing(null);
          refresh();
          void ladeMeine();
        }}
      />
    );
  }

  return (
    <div className="menu-bg">
      <div className="menu-card wide">
        <h2>Leitstellen-Editor</h2>
        <p className="muted">
          Baue eigene Leitstellenbereiche mit Orten, Straßen, Wachen, Fahrzeugen samt Dienstzeiten, Kliniken mit Fachrichtungen, Funk-Rufgruppen und
          Alarmierungsordnung. Fertige Leitstellen kannst du für andere Spieler veröffentlichen.
        </p>
        <div className="tabs kat-tabs">
          <button className={ansicht === 'eigene' ? 'active' : ''} onClick={() => setAnsicht('eigene')}>
            Meine Leitstellen
          </button>
          <button className={ansicht === 'katalog' ? 'active' : ''} onClick={() => setAnsicht('katalog')}>
            Leitstellen anderer Spieler
          </button>
        </div>
        {ansicht === 'katalog' && <KatalogListe lokal={list} onGeladen={refresh} />}
        {ansicht === 'eigene' && (
          <>
            <table className="lib">
              <tbody>
                {list.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <b>{s.ilsName}</b> <StatusBadge e={meine.get(s.id)} />
                      <div className="muted small">
                        {s.towns} Orte · {s.vehicles} Fahrzeuge
                      </div>
                    </td>
                    <td className="right">
                      <button onClick={async () => setEditing(await api.loadScenario(s.id))}>Bearbeiten</button>
                      <button onClick={async () => setPublish(await api.loadScenario(s.id))}>Veröffentlichen…</button>
                      <button onClick={async () => api.exportScenario(await api.loadScenario(s.id))}>Exportieren</button>
                      <button
                        onClick={async () => {
                          const src = await api.loadScenario(s.id);
                          const copy = { ...structuredClone(src), id: newId('scn'), name: `${src.name} (Kopie)`, ilsName: `${src.ilsName} (Kopie)`, herkunft: undefined };
                          await api.saveScenario(copy);
                          refresh();
                        }}
                      >
                        Kopieren
                      </button>
                      <button
                        className="danger"
                        onClick={async () => {
                          const online = meine.get(s.id) ? ' Die Fassung auf dem Online-Server bleibt bestehen, bis du sie dort entfernst.' : '';
                          if (confirm(`${s.ilsName} wirklich löschen?${online}`)) {
                            await api.deleteScenario(s.id);
                            refresh();
                          }
                        }}
                      >
                        Löschen
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {meineFehler && <p className="muted small">Veröffentlichungsstatus nicht abrufbar: {meineFehler}</p>}
            <div className="menu-buttons">
              <button className="primary" onClick={() => setOsm(true)}>
                Neue Leitstelle aus echter Karte (OpenStreetMap)
              </button>
              <button
                onClick={() => {
                  const seed = Math.floor(Math.random() * 1e6);
                  const scn = generateScenario({ seed, towns: 8, name: `Landkreis ${seed % 1000}` });
                  scn.id = newId('scn');
                  setEditing(scn);
                }}
              >
                Fantasiekarte generieren (ohne Internet)
              </button>
              <button onClick={() => setEditing(emptyScenario('Neue Leitstelle'))}>Neue leere Leitstelle</button>
              <button
                onClick={async () => {
                  try {
                    const scn = await api.importScenario();
                    if (scn) refresh();
                  } catch (e) {
                    alert(String(e));
                  }
                }}
              >
                Datei importieren
              </button>
            </div>
          </>
        )}
        <div className="menu-buttons">
          <button onClick={onBack}>Zurück</button>
        </div>
      </div>
      {osm && (
        <OsmImportDialog
          onCancel={() => setOsm(false)}
          onDone={(scn, n) => {
            setOsm(false);
            setNotes(n);
            setEditing(scn);
          }}
        />
      )}
      {publish && (
        <VeroeffentlichenDialog
          scn={publish}
          eintrag={meine.get(publish.id)}
          onSaved={() => refresh()}
          onClose={(changed) => {
            setPublish(null);
            if (changed) {
              refresh();
              void ladeMeine();
            }
          }}
        />
      )}
    </div>
  );
}

type Tool = 'select' | 'road' | 'town' | 'feuerwache' | 'rettungswache' | 'hospital' | 'object' | 'delete';
type Tab = 'props' | 'liste' | 'fleet' | 'eswl' | 'aao' | 'types' | 'settings' | 'check';

const TOOLS: { id: Tool; label: string; hint: string }[] = [
  { id: 'select', label: '↖ Auswählen', hint: 'Klicken zum Auswählen, Ziehen zum Verschieben' },
  { id: 'road', label: '╱ Straße', hint: 'Klicken setzt Knoten und verbindet sie. Rechtsklick oder Esc beendet den Straßenzug. Klick auf eine Straße teilt sie.' },
  { id: 'town', label: '◯ Ort', hint: 'Klicken legt einen Ort an' },
  { id: 'feuerwache', label: 'FW Feuerwache', hint: 'Klicken legt eine Feuerwache an' },
  { id: 'rettungswache', label: 'RW Rettungswache', hint: 'Klicken legt eine Rettungswache an' },
  { id: 'hospital', label: 'H Krankenhaus', hint: 'Klicken legt ein Krankenhaus an' },
  { id: 'object', label: '◆ Objekt', hint: 'Klicken legt ein Objekt an (optional mit Brandmeldeanlage)' },
  { id: 'delete', label: '✕ Löschen', hint: 'Klicken löscht das Element unter dem Mauszeiger' },
];

const ROAD_LABEL: Record<RoadType, string> = {
  ortsstrasse: 'Ortsstraße',
  landstrasse: 'Staats-/Kreisstraße',
  bundesstrasse: 'Bundesstraße',
  autobahn: 'Autobahn',
};

function Editor({ initial, onClose, notes = [] }: { initial: Scenario; onClose: () => void; notes?: string[] }) {
  const scnRef = useRef<Scenario>(structuredClone(initial));
  const scn = scnRef.current;
  const [version, setVersion] = useState(0);
  const [tool, setTool] = useState<Tool>('select');
  const [tab, setTab] = useState<Tab>('props');
  const [sel, setSel] = useState<Hit | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [roadName, setRoadName] = useState('Neue Straße');
  const [roadType, setRoadType] = useState<RoadType>('ortsstrasse');
  const [dirty, setDirty] = useState(notes.length > 0);
  const [msg, setMsg] = useState('');
  const [importNotes, setImportNotes] = useState<string[]>(notes);
  const [osm, setOsm] = useState(false);
  const [publish, setPublish] = useState(false);
  /** ESWL: nächster Klick in die Karte setzt den Standort dieses Nachbarfahrzeugs */
  const [pick, setPick] = useState<NachbarFahrzeug | null>(null);
  const [focus, setFocus] = useState<{ x: number; y: number; seq: number; scale?: number } | null>(null);
  const zeige = (h: Hit, p: Vec) => {
    setTool('select');
    setSel(h);
    setTab('props');
    setFocus({ x: p.x, y: p.y, seq: Date.now(), scale: 0.6 });
  };

  const changed = (renumber = false) => {
    if (renumber) recomputeHouseNumbers(scn);
    setVersion((v) => v + 1);
    setDirty(true);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPending(null);
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        save();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const save = async () => {
    recomputeHouseNumbers(scn);
    await api.saveScenario(scn);
    setDirty(false);
    setMsg('Gespeichert.');
    setTimeout(() => setMsg(''), 2000);
  };

  const addNode = (p: Vec) => {
    const n = { id: newId('n'), x: Math.round(p.x), y: Math.round(p.y) };
    scn.nodes.push(n);
    return n;
  };

  const splitRoad = (roadId: string, p: Vec) => {
    const r = scn.roads.find((x) => x.id === roadId)!;
    const a = scn.nodes.find((n) => n.id === r.a)!;
    const b = scn.nodes.find((n) => n.id === r.b)!;
    const pr = projectOnSegment(p, a, b);
    const n = addNode(pr.point);
    scn.roads.push({ ...r, id: newId('r'), a: n.id, b: r.b });
    r.b = n.id;
    return n;
  };

  const townName = (p: Vec) => (townAt(scn.towns, p) ?? nearestTown(scn.towns, p))?.name ?? 'Neustadt';

  const callsignFor = (st: Station, typeId: string) => {
    const t = scn.vehicleTypes.find((x) => x.id === typeId)!;
    const town = st.name.replace(/^(FF|BRK Rettungswache|Feuerwache|Rettungswache)\s+/, '');
    const taken = new Set(scn.stations.flatMap((s) => s.vehicles.map((v) => v.callsign)));
    let k = 1;
    while (taken.has(`${orgPrefix(t.org)} ${town} ${t.funkNr}/${k}`)) k++;
    return `${orgPrefix(t.org)} ${town} ${t.funkNr}/${k}`;
  };

  const onClick = (p: Vec, hit: Hit | null) => {
    if (pick) {
      pick.x = Math.round(p.x);
      pick.y = Math.round(p.y);
      setPick(null);
      changed();
      return;
    }
    switch (tool) {
      case 'select':
        setSel(hit);
        if (hit) setTab('props');
        return;
      case 'road': {
        let node = hit?.kind === 'node' ? scn.nodes.find((n) => n.id === hit.id)! : null;
        if (!node && hit?.kind === 'road') node = splitRoad(hit.id, p);
        if (!node) node = addNode(p);
        if (pending && pending !== node.id) {
          scn.roads.push({ id: newId('r'), a: pending, b: node.id, name: roadName || 'Unbenannt', type: roadType });
        }
        setPending(node.id);
        changed(true);
        return;
      }
      case 'town': {
        const t = { id: newId('t'), name: `Neuer Ort ${scn.towns.length + 1}`, x: Math.round(p.x), y: Math.round(p.y), radius: 800 };
        scn.towns.push(t);
        setSel({ kind: 'town', id: t.id });
        setTab('props');
        changed(true);
        return;
      }
      case 'feuerwache':
      case 'rettungswache': {
        const fw = tool === 'feuerwache';
        const st: Station = {
          id: newId('s'),
          name: `${fw ? 'FF' : 'BRK Rettungswache'} ${townName(p)}`,
          kind: tool,
          career: !fw,
          x: Math.round(p.x),
          y: Math.round(p.y),
          vehicles: [],
        };
        const typeId = fw ? 'HLF' : 'RTW';
        if (scn.vehicleTypes.some((t) => t.id === typeId)) st.vehicles.push({ id: newId('v'), type: typeId, callsign: callsignFor(st, typeId) });
        scn.stations.push(st);
        setSel({ kind: 'station', id: st.id });
        setTab('props');
        changed();
        return;
      }
      case 'hospital': {
        const h = { id: newId('h'), name: `Krankenhaus ${townName(p)}`, x: Math.round(p.x), y: Math.round(p.y), specialties: ['Innere Medizin', 'Chirurgie'] };
        scn.hospitals.push(h);
        setSel({ kind: 'hospital', id: h.id });
        setTab('props');
        changed();
        return;
      }
      case 'object': {
        const o: MapObject = { id: newId('o'), name: `Objekt ${townName(p)}`, kind: 'gewerbe', x: Math.round(p.x), y: Math.round(p.y), bma: true };
        scn.objects.push(o);
        setSel({ kind: 'object', id: o.id });
        setTab('props');
        changed();
        return;
      }
      case 'delete':
        if (hit) {
          deleteHit(hit);
          changed(true);
        }
        return;
    }
  };

  const deleteHit = (hit: Hit) => {
    switch (hit.kind) {
      case 'node':
        scn.nodes = scn.nodes.filter((n) => n.id !== hit.id);
        scn.roads = scn.roads.filter((r) => r.a !== hit.id && r.b !== hit.id);
        break;
      case 'road':
        scn.roads = scn.roads.filter((r) => r.id !== hit.id);
        break;
      case 'town':
        scn.towns = scn.towns.filter((t) => t.id !== hit.id);
        break;
      case 'station':
        scn.stations = scn.stations.filter((s) => s.id !== hit.id);
        break;
      case 'hospital':
        scn.hospitals = scn.hospitals.filter((s) => s.id !== hit.id);
        break;
      case 'object':
        scn.objects = scn.objects.filter((s) => s.id !== hit.id);
        break;
    }
    // verwaiste Knoten entfernen
    const used = new Set(scn.roads.flatMap((r) => [r.a, r.b]));
    scn.nodes = scn.nodes.filter((n) => used.has(n.id) || n.id === pending);
    if (sel?.id === hit.id) setSel(null);
  };

  const onDrag = (hit: Hit, p: Vec) => {
    const target =
      hit.kind === 'node'
        ? scn.nodes.find((n) => n.id === hit.id)
        : hit.kind === 'station'
          ? scn.stations.find((n) => n.id === hit.id)
          : hit.kind === 'hospital'
            ? scn.hospitals.find((n) => n.id === hit.id)
            : hit.kind === 'object'
              ? scn.objects.find((n) => n.id === hit.id)
              : hit.kind === 'town'
                ? scn.towns.find((n) => n.id === hit.id)
                : undefined;
    if (!target) return;
    target.x = Math.round(p.x);
    target.y = Math.round(p.y);
    setDirty(true);
  };

  const generate = () => {
    const seed = Number(prompt('Zufallszahl (Seed) für die Karte:', String(Math.floor(Math.random() * 1e6))));
    if (!isFinite(seed)) return;
    const towns = Number(prompt('Anzahl Orte (2–14):', '8'));
    if (!isFinite(towns)) return;
    if (!confirm('Die aktuelle Karte samt Wachen und Kliniken wird ersetzt. Fortfahren?')) return;
    const g = generateScenario({ seed, towns, name: scn.name });
    Object.assign(scn, { ...g, id: scn.id, name: scn.name, ilsName: scn.ilsName, stichworte: scn.stichworte, vehicleTypes: scn.vehicleTypes, settings: scn.settings, geo: undefined, addresses: undefined });
    setSel(null);
    changed(true);
  };

  return (
    <div className="editor">
      <header className="topbar">
        <input className="name-input" value={scn.name} onChange={(e) => { scn.name = e.target.value; changed(); }} title="Name" />
        <input className="name-input" value={scn.ilsName} onChange={(e) => { scn.ilsName = e.target.value; changed(); }} title="Name der Leitstelle" />
        <button className="primary" onClick={save}>
          Speichern{dirty ? ' *' : ''}
        </button>
        <button
          onClick={async () => {
            await save();
            setPublish(true);
          }}
        >
          Veröffentlichen…
        </button>
        <button onClick={() => api.exportScenario(scn)}>Exportieren</button>
        <button onClick={generate}>Karte generieren…</button>
        <button onClick={() => setOsm(true)}>Echte Karte laden…</button>
        <span className="ok small">{msg}</span>
        <div className="spacer" />
        <button
          onClick={() => {
            if (!dirty || confirm('Ungespeicherte Änderungen verwerfen?')) onClose();
          }}
        >
          Schließen
        </button>
      </header>
      {importNotes.length > 0 && (
        <div className="import-notes">
          <div>
            {importNotes.map((n, i) => (
              <div key={i}>{n}</div>
            ))}
            <div className="muted">Noch nicht gespeichert. Prüfe Wachen und Fahrzeuge, dann „Speichern“.</div>
          </div>
          <button className="small-btn" onClick={() => setImportNotes([])}>
            ✕
          </button>
        </div>
      )}
      {publish && <VeroeffentlichenDialog scn={scn} onClose={() => { setPublish(false); setVersion((v) => v + 1); }} />}
      {osm && (
        <OsmImportDialog
          onCancel={() => setOsm(false)}
          onDone={(g, n) => {
            setOsm(false);
            if (!confirm('Die aktuelle Karte samt Wachen und Kliniken wird ersetzt. Fortfahren?')) return;
            Object.assign(scn, { ...g, id: scn.id, name: scn.name, ilsName: scn.ilsName, stichworte: scn.stichworte, vehicleTypes: [...scn.vehicleTypes, ...g.vehicleTypes.filter((t) => !scn.vehicleTypes.some((x) => x.id === t.id))], settings: scn.settings, tmoGroups: undefined });
            ensureTmo(scn);
            setImportNotes(n);
            setSel(null);
            changed();
          }}
        />
      )}
      <div className="editor-body">
        <div className="tools">
          {TOOLS.map((t) => (
            <button
              key={t.id}
              className={tool === t.id ? 'active' : ''}
              title={t.hint}
              onClick={() => {
                setTool(t.id);
                setPending(null);
              }}
            >
              {t.label}
            </button>
          ))}
          {tool === 'road' && (
            <div className="road-opts">
              <label>
                Straßenname
                <input value={roadName} onChange={(e) => setRoadName(e.target.value)} />
              </label>
              <label>
                Typ
                <select value={roadType} onChange={(e) => setRoadType(e.target.value as RoadType)}>
                  {(Object.keys(ROAD_LABEL) as RoadType[]).map((t) => (
                    <option key={t} value={t}>
                      {ROAD_LABEL[t]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
          <p className="muted small">{TOOLS.find((t) => t.id === tool)?.hint}</p>
          {pick && (
            <p className="pick-hint small">
              Klicke in die Karte, um den Standort von {pick.callsign} zu setzen.{' '}
              <button className="small-btn" onClick={() => setPick(null)}>
                Abbrechen
              </button>
            </p>
          )}
        </div>
        <div className="editor-map">
          <MapView
            key={`${scn.geo?.mx0 ?? 'gen'}-${scn.width}-${scn.height}`}
            scenario={scn}
            version={version}
            focus={focus}
            editor={{ selected: sel, pendingNodeId: pending, showNodes: tool === 'road' || tool === 'select' || tool === 'delete' }}
            hitKinds={
              tool === 'road'
                ? ['node', 'road']
                : tool === 'select' || tool === 'delete'
                  ? ['station', 'hospital', 'object', 'node', 'town', 'road']
                  : []
            }
            onClick={onClick}
            onContext={() => setPending(null)}
            canDrag={(h) => tool === 'select' && ['node', 'station', 'hospital', 'object', 'town'].includes(h.kind)}
            onDrag={onDrag}
            onDragEnd={(h) => {
              if (h.kind === 'node' || h.kind === 'town') changed(true);
              else changed();
            }}
          />
        </div>
        <div className="editor-side">
          <div className="tabs">
            {(
              [
                ['props', 'Eigenschaften'],
                ['liste', 'Suchen'],
                ['fleet', 'Fahrzeuge/Funk'],
                ['eswl', 'Nachbarn/ESWL'],
                ['aao', 'Stichworte/AAO'],
                ['types', 'Fahrzeugtypen'],
                ['settings', 'Einstellungen'],
                ['check', 'Prüfen'],
              ] as [Tab, string][]
            ).map(([id, label]) => (
              <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
                {label}
              </button>
            ))}
          </div>
          <div className="tab-body">
            {tab === 'props' && <Props scn={scn} sel={sel} changed={changed} callsignFor={callsignFor} onDelete={(h) => { deleteHit(h); changed(true); }} onTab={setTab} />}
            {tab === 'liste' && <ListTab scn={scn} onPick={zeige} />}
            {tab === 'fleet' && <FleetTab scn={scn} changed={changed} />}
            {tab === 'eswl' && <EswlTab scn={scn} changed={changed} pick={pick} setPick={setPick} />}
            {tab === 'aao' && <AaoTab scn={scn} changed={changed} />}
            {tab === 'types' && <TypesTab scn={scn} changed={changed} />}
            {tab === 'settings' && <SettingsTab scn={scn} changed={changed} />}
            {tab === 'check' && <CheckTab scn={scn} />}
          </div>
        </div>
      </div>
    </div>
  );
}

interface PropsArgs {
  scn: Scenario;
  sel: Hit | null;
  changed: (renumber?: boolean) => void;
  callsignFor: (st: Station, typeId: string) => string;
  onDelete: (h: Hit) => void;
  onTab: (t: Tab) => void;
}

function Props({ scn, sel, changed, callsignFor, onDelete, onTab }: PropsArgs) {
  const [newType, setNewType] = useState(scn.vehicleTypes[0]?.id ?? '');
  const [newFach, setNewFach] = useState('');
  const [offenDienst, setOffenDienst] = useState<string | null>(null);
  if (!sel) {
    const fahrzeuge = scn.stations.reduce((n, s) => n + s.vehicles.length, 0);
    const schritte: [boolean, string, string, Tab | null][] = [
      [scn.roads.length > 0 && scn.towns.length > 0, 'Karte', `${scn.towns.length} Orte, ${scn.roads.length} Straßenabschnitte. „Echte Karte laden…“ holt Straßen, Orte, Wachen und Kliniken aus OpenStreetMap.`, null],
      [scn.stations.length > 0, 'Wachen', `${scn.stations.length} Wachen. Werkzeug „Feuerwache“ oder „Rettungswache“ wählen und in die Karte klicken.`, null],
      [fahrzeuge > 0, 'Fahrzeuge und Funk', `${fahrzeuge} Fahrzeuge. Pro Wache hinzufügen, Dienstzeiten festlegen oder eine Fahrzeugliste einfügen.`, 'fleet'],
      [scn.hospitals.length > 0, 'Kliniken', `${scn.hospitals.length} Krankenhäuser mit Fachrichtungen für IVENA.`, null],
      [scn.stichworte.length > 0, 'Stichworte und AAO', `${scn.stichworte.length} Stichworte mit Alarm- und Ausrückeordnung.`, 'aao'],
      [validateScenario(scn).length === 0, 'Prüfen', 'Zeigt Fehler und Hinweise, bevor die Leitstelle gespielt wird.', 'check'],
    ];
    return (
      <div className="small">
        <p className="muted">Wähle mit dem Auswahlwerkzeug ein Element auf der Karte aus oder suche es im Reiter „Suchen“.</p>
        <h4>So entsteht eine Leitstelle</h4>
        <ol className="schritte">
          {schritte.map(([fertig, titel, text, t]) => (
            <li key={titel} className={fertig ? 'fertig' : ''}>
              <b>{fertig ? '✓ ' : ''}{titel}</b>
              {t && (
                <button className="small-btn" onClick={() => onTab(t)}>
                  öffnen
                </button>
              )}
              <div className="muted">{text}</div>
            </li>
          ))}
          <li>
            <b>Veröffentlichen</b>
            <div className="muted">Oben auf „Veröffentlichen…“: öffentlich für alle Spieler oder privat auf dem Online-Server.</div>
          </li>
        </ol>
        <p className="muted">{scn.objects.length} Objekte, davon {scn.objects.filter((o) => o.bma).length} mit Brandmeldeanlage.</p>
      </div>
    );
  }
  const del = (
    <button className="danger" onClick={() => onDelete(sel)}>
      Löschen
    </button>
  );
  if (sel.kind === 'road') {
    const r = scn.roads.find((x) => x.id === sel.id);
    if (!r) return null;
    return (
      <div className="form">
        <h3>Straßenabschnitt</h3>
        <label>
          Name
          <input value={r.name} onChange={(e) => { r.name = e.target.value; changed(true); }} />
        </label>
        <button
          onClick={() => {
            const neu = prompt('Neuer Name für den ganzen Straßenzug:', r.name);
            if (!neu) return;
            const old = r.name;
            const town = r.town;
            for (const x of scn.roads) if (x.name === old && x.town === town) x.name = neu;
            changed(true);
          }}
        >
          Ganzen Straßenzug umbenennen
        </button>
        <label>
          Typ
          <select value={r.type} onChange={(e) => { r.type = e.target.value as RoadType; changed(true); }}>
            {(Object.keys(ROAD_LABEL) as RoadType[]).map((t) => (
              <option key={t} value={t}>
                {ROAD_LABEL[t]}
              </option>
            ))}
          </select>
        </label>
        <p className="muted small">
          Ort: {r.town || 'außerorts'} · Hausnummern {r.numA ?? '–'} bis {r.numB ?? '–'}
        </p>
        {del}
      </div>
    );
  }
  if (sel.kind === 'node') {
    const n = scn.nodes.find((x) => x.id === sel.id);
    if (!n) return null;
    const roads = scn.roads.filter((r) => r.a === n.id || r.b === n.id);
    return (
      <div className="form">
        <h3>Knoten</h3>
        <p className="small">Verbunden mit: {[...new Set(roads.map((r) => r.name))].join(', ') || '–'}</p>
        {del}
      </div>
    );
  }
  if (sel.kind === 'town') {
    const t = scn.towns.find((x) => x.id === sel.id);
    if (!t) return null;
    return (
      <div className="form">
        <h3>Ort</h3>
        <label>
          Name
          <input value={t.name} onChange={(e) => { t.name = e.target.value; changed(true); }} />
        </label>
        <label>
          Radius: {t.radius} m
          <input type="range" min={200} max={3000} step={50} value={t.radius} onChange={(e) => { t.radius = Number(e.target.value); changed(true); }} />
        </label>
        {del}
      </div>
    );
  }
  if (sel.kind === 'station') {
    const st = scn.stations.find((x) => x.id === sel.id);
    if (!st) return null;
    return (
      <div className="form">
        <h3>{st.kind === 'feuerwache' ? 'Feuerwache' : 'Rettungswache'}</h3>
        <label>
          Name
          <input value={st.name} onChange={(e) => { st.name = e.target.value; changed(); }} />
        </label>
        <label>
          Art
          <select value={st.kind} onChange={(e) => { st.kind = e.target.value as Station['kind']; changed(); }}>
            <option value="feuerwache">Feuerwache (Feuerwehrhaus)</option>
            <option value="rettungswache">Rettungswache, NEF-Standort, HvO, Luftrettung</option>
          </select>
        </label>
        <label className="inline">
          <input type="checkbox" checked={st.career} onChange={(e) => { st.career = e.target.checked; changed(); }} />
          Hauptamtlich besetzt (kurze Ausrückzeit)
        </label>
        <label>
          TMO-Rufgruppe
          <select value={st.tmo ?? ''} onChange={(e) => { st.tmo = e.target.value; changed(); }}>
            {ensureTmo(scn).map((g) => (
              <option key={g.id} value={g.id}>
                {g.name} ({g.use})
              </option>
            ))}
          </select>
        </label>
        <h4>Fahrzeuge</h4>
        {st.vehicles.map((v) => (
          <div key={v.id} className="fz">
            <div className="row">
              <input className="grow" value={v.callsign} onChange={(e) => { v.callsign = e.target.value; changed(); }} />
              <select value={v.type} onChange={(e) => { v.type = e.target.value; changed(); }}>
                {scn.vehicleTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
              <button className="small-btn danger" title="Fahrzeug entfernen" onClick={() => { st.vehicles = st.vehicles.filter((x) => x !== v); changed(); }}>
                ✕
              </button>
            </div>
            <button className="linkish small" onClick={() => setOffenDienst(offenDienst === v.id ? null : v.id)}>
              Dienst: {dienstText(v.dienst)} {offenDienst === v.id ? '▴' : '▾'}
            </button>
            {offenDienst === v.id && <DienstEditor v={v} changed={changed} />}
          </div>
        ))}
        <div className="row">
          <select value={newType} onChange={(e) => setNewType(e.target.value)} className="grow">
            {scn.vehicleTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
          <button
            onClick={() => {
              st.vehicles.push({ id: newId('v'), type: newType, callsign: callsignFor(st, newType) });
              changed();
            }}
          >
            + Fahrzeug
          </button>
        </div>
        {del}
      </div>
    );
  }
  if (sel.kind === 'hospital') {
    const h = scn.hospitals.find((x) => x.id === sel.id);
    if (!h) return null;
    return (
      <div className="form">
        <h3>Krankenhaus</h3>
        <label>
          Name
          <input value={h.name} onChange={(e) => { h.name = e.target.value; changed(); }} />
        </label>
        <h4>Fachrichtungen</h4>
        <p className="muted small">Steuern, welche Patienten die Klinik in IVENA annimmt (z. B. PZC 332 STEMI nur mit Kardiologie (HKL)).</p>
        {[...new Set([...SPECIALTIES, ...scn.hospitals.flatMap((x) => x.specialties)])].map((s) => (
          <label key={s} className="inline">
            <input
              type="checkbox"
              checked={h.specialties.includes(s)}
              onChange={(e) => {
                h.specialties = e.target.checked ? [...h.specialties, s] : h.specialties.filter((x) => x !== s);
                changed();
              }}
            />
            {s}
          </label>
        ))}
        <div className="row">
          <input className="grow" value={newFach} onChange={(e) => setNewFach(e.target.value)} placeholder="Weitere Fachrichtung, z. B. Neurochirurgie" />
          <button
            disabled={!newFach.trim()}
            onClick={() => {
              const f = newFach.trim();
              if (!h.specialties.includes(f)) h.specialties.push(f);
              setNewFach('');
              changed();
            }}
          >
            +
          </button>
        </div>
        {del}
      </div>
    );
  }
  if (sel.kind === 'object') {
    const o = scn.objects.find((x) => x.id === sel.id);
    if (!o) return null;
    return (
      <div className="form">
        <h3>Objekt</h3>
        <label>
          Name
          <input value={o.name} onChange={(e) => { o.name = e.target.value; changed(); }} />
        </label>
        <label>
          Art
          <select value={o.kind} onChange={(e) => { o.kind = e.target.value as MapObject['kind']; changed(); }}>
            <option value="schule">Schule</option>
            <option value="seniorenheim">Seniorenheim</option>
            <option value="gewerbe">Gewerbe / Industrie</option>
            <option value="kirche">Kirche</option>
            <option value="sonstiges">Sonstiges</option>
          </select>
        </label>
        <label className="inline">
          <input type="checkbox" checked={o.bma} onChange={(e) => { o.bma = e.target.checked; changed(); }} />
          Brandmeldeanlage aufgeschaltet
        </label>
        {del}
      </div>
    );
  }
  return null;
}

const TAGE = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const hm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const parseHm = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

/** Schichten eines Fahrzeugs: ohne Eintrag rund um die Uhr besetzt */
function DienstEditor({ v, changed }: { v: { dienst?: Dienstzeit[] }; changed: () => void }) {
  const list = v.dienst ?? [];
  const set = (d: Dienstzeit[]) => {
    v.dienst = d.length ? d : undefined;
    changed();
  };
  return (
    <div className="dienst">
      <label className="inline">
        <input type="checkbox" checked={!list.length} onChange={(e) => set(e.target.checked ? [] : [{ von: 7 * 60, bis: 19 * 60 }])} />
        Rund um die Uhr besetzt
      </label>
      {list.map((d, i) => (
        <div key={i} className="schicht">
          <div className="row">
            <input type="time" value={hm(d.von)} onChange={(e) => { d.von = parseHm(e.target.value); changed(); }} />
            bis
            {d.sunset ? (
              <span className="muted">Sonnenuntergang</span>
            ) : (
              <input type="time" value={hm(d.bis)} onChange={(e) => { d.bis = parseHm(e.target.value); changed(); }} />
            )}
            <button className="small-btn danger" title="Schicht entfernen" onClick={() => set(list.filter((x) => x !== d))}>
              ✕
            </button>
          </div>
          <div className="row tage">
            {TAGE.map((t, wd) => {
              const on = !d.tage || d.tage.includes(wd);
              return (
                <button
                  key={t}
                  className={`small-btn${on ? ' active' : ''}`}
                  onClick={() => {
                    const cur = d.tage ?? [0, 1, 2, 3, 4, 5, 6];
                    const next = on ? cur.filter((x) => x !== wd) : [...cur, wd].sort();
                    d.tage = next.length === 7 ? undefined : next;
                    changed();
                  }}
                >
                  {t}
                </button>
              );
            })}
          </div>
          <div className="row">
            <select value={d.kw ?? ''} onChange={(e) => { d.kw = (e.target.value || undefined) as Dienstzeit['kw']; changed(); }}>
              <option value="">jede Woche</option>
              <option value="gerade">nur gerade Kalenderwochen</option>
              <option value="ungerade">nur ungerade Kalenderwochen</option>
            </select>
            <label className="inline">
              <input type="checkbox" checked={!!d.sunset} onChange={(e) => { d.sunset = e.target.checked || undefined; changed(); }} />
              Ende bei Sonnenuntergang
            </label>
          </div>
        </div>
      ))}
      {list.length > 0 && (
        <button className="small-btn" onClick={() => set([...list, { von: 19 * 60, bis: 7 * 60 }])}>
          + Schicht
        </button>
      )}
      <p className="muted small">Ende vor Beginn heißt über Mitternacht. Wochentage gelten für den Schichtbeginn.</p>
    </div>
  );
}

/** Wachen, Fahrzeuge, Kliniken, Objekte und Orte durchsuchen und auf der Karte zeigen */
function ListTab({ scn, onPick }: { scn: Scenario; onPick: (h: Hit, p: Vec) => void }) {
  const [q, setQ] = useState('');
  const [art, setArt] = useState<'alle' | 'station' | 'vehicle' | 'hospital' | 'object' | 'town'>('alle');
  const s = q.trim().toLowerCase();
  type Row = { key: string; hit: Hit; p: Vec; text: string; sub: string; art: typeof art };
  const rows: Row[] = [];
  const match = (t: string) => !s || t.toLowerCase().includes(s);
  for (const st of scn.stations) {
    if ((art === 'alle' || art === 'station') && match(st.name))
      rows.push({ key: st.id, hit: { kind: 'station', id: st.id }, p: st, text: st.name, sub: `${st.vehicles.length} Fahrzeuge`, art: 'station' });
    if (art === 'alle' || art === 'vehicle')
      for (const v of st.vehicles)
        if (match(`${v.callsign} ${v.type}`))
          rows.push({ key: v.id, hit: { kind: 'station', id: st.id }, p: st, text: v.callsign, sub: `${scn.vehicleTypes.find((t) => t.id === v.type)?.label ?? v.type} · ${st.name} · ${dienstText(v.dienst)}`, art: 'vehicle' });
  }
  if (art === 'alle' || art === 'hospital')
    for (const h of scn.hospitals) if (match(`${h.name} ${h.specialties.join(' ')}`)) rows.push({ key: h.id, hit: { kind: 'hospital', id: h.id }, p: h, text: h.name, sub: h.specialties.join(', '), art: 'hospital' });
  if (art === 'alle' || art === 'object')
    for (const o of scn.objects) if (match(o.name)) rows.push({ key: o.id, hit: { kind: 'object', id: o.id }, p: o, text: o.name, sub: o.bma ? 'mit BMA' : o.kind, art: 'object' });
  if (art === 'alle' || art === 'town')
    for (const t of scn.towns) if (match(t.name)) rows.push({ key: t.id, hit: { kind: 'town', id: t.id }, p: t, text: t.name, sub: 'Ort', art: 'town' });
  const shown = rows.slice(0, 200);
  return (
    <div className="form">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, Funkrufname, Fachrichtung …" autoFocus />
      <select value={art} onChange={(e) => setArt(e.target.value as typeof art)}>
        <option value="alle">Alles</option>
        <option value="station">Wachen</option>
        <option value="vehicle">Fahrzeuge</option>
        <option value="hospital">Kliniken</option>
        <option value="object">Objekte</option>
        <option value="town">Orte</option>
      </select>
      <div className="trefferliste">
        {shown.map((r) => (
          <button key={r.key} className="treffer" onClick={() => onPick(r.hit, r.p)}>
            <b>{r.text}</b>
            <span className="muted small">{r.sub}</span>
          </button>
        ))}
      </div>
      <p className="muted small">{rows.length > shown.length ? `${shown.length} von ${rows.length} Treffern, Suche verfeinern.` : `${rows.length} Treffer`}</p>
    </div>
  );
}

/** Typ aus dem Funkrufnamen: Kennzahl wie bei eigenen Fahrzeugen, "Christoph …" ist ein RTH */
function typAusRufname(scn: Scenario, cs: string): string | undefined {
  if (/^christoph\b/i.test(cs.trim())) return scn.vehicleTypes.find((t) => t.air)?.id;
  const m = /(\d+)\/\d+\s*$/.exec(cs);
  return m ? scn.vehicleTypes.find((t) => t.funkNr === Number(m[1]))?.id : undefined;
}

/** Nachbarleitstellen für die ESWL: Rettungsmittel außerhalb des eigenen Bereichs, die nach Typ angefordert werden */
function EswlTab({ scn, changed, pick, setPick }: { scn: Scenario; changed: () => void; pick: NachbarFahrzeug | null; setPick: (f: NachbarFahrzeug | null) => void }) {
  const nachbarn = (scn.nachbarn ??= []);
  const [offen, setOffen] = useState<string | null>(nachbarn[0]?.id ?? null);
  const rd = ensureTmo(scn).filter((g) => g.use === 'RD' || g.use === 'Übergreifend');
  const rdTypen = scn.vehicleTypes.filter((t) => t.org === 'RD');
  return (
    <div className="form">
      <h3>Nachbarleitstellen (ESWL)</h3>
      <p className="small muted">
        Über die ESWL fordert der Disponent bei einer Nachbar-ILS ein Rettungsmittel nach Typ an, z. B. einen RTW oder einen RTH. Die Nachbar-ILS lehnt ab, wenn
        nichts frei ist. Fahrzeuge melden sich beim Ein- und Ausfahren in der gewählten Rufgruppe. Standorte dürfen außerhalb der Karte liegen.
      </p>
      {nachbarn.map((n) => (
        <div key={n.id} className="nachbar">
          <div className="row">
            <button className="small-btn" onClick={() => setOffen(offen === n.id ? null : n.id)}>
              {offen === n.id ? '▾' : '▸'}
            </button>
            <input className="grow" value={n.name} onChange={(e) => { n.name = e.target.value; changed(); }} />
            <span className="small muted">{n.fahrzeuge.length} Fz.</span>
            <button
              className="small-btn danger"
              title="Nachbarleitstelle entfernen"
              onClick={() => {
                if (!confirm(`${n.name} mit allen Fahrzeugen entfernen?`)) return;
                scn.nachbarn = nachbarn.filter((x) => x !== n);
                changed();
              }}
            >
              ✕
            </button>
          </div>
          {offen === n.id && (
            <div className="nachbar-body">
              <label>
                Lehnt ab: {Math.round(n.ablehnung * 100)} % der Anforderungen
                <input type="range" min={0} max={100} step={5} value={Math.round(n.ablehnung * 100)} onChange={(e) => { n.ablehnung = Number(e.target.value) / 100; changed(); }} />
              </label>
              <label>
                Rufgruppe für An- und Abmeldung
                <select value={n.tmo ?? ''} onChange={(e) => { n.tmo = e.target.value || undefined; changed(); }}>
                  <option value="">Rufgruppe der nächsten Rettungswache</option>
                  {rd.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </label>
              <h4>Rettungsmittel</h4>
              {n.fahrzeuge.map((f) => (
                <div key={f.id} className="fz">
                  <div className="row">
                    <input
                      className="grow"
                      value={f.callsign}
                      title="Funkrufname"
                      onChange={(e) => {
                        f.callsign = e.target.value;
                        const t = typAusRufname(scn, f.callsign);
                        if (t) f.type = t;
                        changed();
                      }}
                    />
                    <select value={f.type} onChange={(e) => { f.type = e.target.value; changed(); }}>
                      {(rdTypen.some((t) => t.id === f.type) ? rdTypen : [...rdTypen, ...scn.vehicleTypes.filter((t) => t.id === f.type)]).map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                    <button className="small-btn danger" title="Fahrzeug entfernen" onClick={() => { n.fahrzeuge = n.fahrzeuge.filter((x) => x !== f); changed(); }}>
                      ✕
                    </button>
                  </div>
                  <div className="row">
                    <input className="grow" value={f.wache} placeholder="Wache / Standort" onChange={(e) => { f.wache = e.target.value; changed(); }} />
                    <button className={`small-btn${pick === f ? ' active' : ''}`} title="Standort per Klick in die Karte setzen" onClick={() => setPick(pick === f ? null : f)}>
                      ⌖ {Math.round(f.x / 100) / 10} / {Math.round(f.y / 100) / 10} km
                    </button>
                  </div>
                  <details>
                    <summary className="small muted">Dienst: {dienstText(f.dienst)}</summary>
                    <DienstEditor v={f} changed={changed} />
                  </details>
                </div>
              ))}
              <button
                onClick={() => {
                  const last = n.fahrzeuge[n.fahrzeuge.length - 1];
                  const f: NachbarFahrzeug = {
                    id: newId('nf'),
                    callsign: '',
                    type: rdTypen.find((t) => t.id === 'RTW')?.id ?? rdTypen[0]?.id ?? scn.vehicleTypes[0].id,
                    wache: last?.wache ?? n.name.replace(/^ILS\s+/, 'RW '),
                    x: last?.x ?? -2000,
                    y: last?.y ?? Math.round(scn.height / 2),
                  };
                  n.fahrzeuge.push(f);
                  changed();
                }}
              >
                + Rettungsmittel
              </button>
            </div>
          )}
        </div>
      ))}
      <button
        onClick={() => {
          const n: NachbarLeitstelle = { id: newId('nb'), name: `ILS Nachbar ${nachbarn.length + 1}`, fahrzeuge: [], ablehnung: 0.25 };
          nachbarn.push(n);
          setOffen(n.id);
          changed();
        }}
      >
        + Nachbarleitstelle
      </button>
    </div>
  );
}

const KATEGORIEN: [Stichwort['category'], string][] = [
  ['RD', 'Rettungsdienst'],
  ['B', 'Brand'],
  ['THL', 'Techn. Hilfe'],
  ['ABC', 'Gefahrstoff'],
  ['SONST', 'Sonstiges'],
];

function AaoTab({ scn, changed }: { scn: Scenario; changed: () => void }) {
  const [filter, setFilter] = useState('');
  const f = filter.trim().toLowerCase();
  return (
    <div className="aao">
      <p className="muted small">
        Pro Stichwort die Fahrzeuge der Alarm- und Ausrückeordnung. Daraus entsteht der Alarmierungsvorschlag. Die Schlagworte des Einsatzleitsystems (z. B.
        #R3010) verweisen auf diese Stichworte.
      </p>
      <div className="row">
        <input className="grow" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Stichwort filtern" />
        <button
          title="Fehlende Stichworte aus der Standard-AAO ergänzen"
          onClick={() => {
            const n = scn.stichworte.length;
            ensureStichworte(scn);
            alert(scn.stichworte.length - n ? `${scn.stichworte.length - n} Stichworte ergänzt.` : 'Alle Standard-Stichworte sind schon vorhanden.');
            changed();
          }}
        >
          Standard ergänzen
        </button>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Bezeichnung</th>
              <th>Art</th>
              {scn.vehicleTypes.map((t) => (
                <th key={t.id} title={t.label}>
                  {t.id}
                </th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {scn.stichworte.map((s, i) => (f && !`${s.code} ${s.label}`.toLowerCase().includes(f) ? null : (
              <tr key={i}>
                <td>
                  <input value={s.code} onChange={(e) => { s.code = e.target.value; changed(); }} className="code" />
                </td>
                <td>
                  <input value={s.label} onChange={(e) => { s.label = e.target.value; changed(); }} />
                </td>
                <td>
                  <select value={s.category} onChange={(e) => { s.category = e.target.value as Stichwort['category']; changed(); }}>
                    {KATEGORIEN.map(([k, l]) => (
                      <option key={k} value={k}>
                        {l}
                      </option>
                    ))}
                  </select>
                </td>
                {scn.vehicleTypes.map((t) => (
                  <td key={t.id}>
                    <input
                      type="number"
                      min={0}
                      max={9}
                      className="tiny"
                      value={s.aao[t.id] ?? 0}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        if (n > 0) s.aao[t.id] = n;
                        else delete s.aao[t.id];
                        changed();
                      }}
                    />
                  </td>
                ))}
                <td>
                  <button className="small-btn danger" onClick={() => { scn.stichworte.splice(i, 1); changed(); }}>
                    ✕
                  </button>
                </td>
              </tr>
            )))}
          </tbody>
        </table>
      </div>
      <button
        onClick={() => {
          const code = prompt('Code des neuen Stichworts (z. B. "THL Wasser"):');
          if (!code) return;
          if (scn.stichworte.some((s) => s.code === code)) return alert(`${code} gibt es schon.`);
          const cat = code.startsWith('RD') ? 'RD' : code.startsWith('B') ? 'B' : code.startsWith('THL') ? 'THL' : code.startsWith('ABC') ? 'ABC' : 'SONST';
          scn.stichworte.push({ code, label: code, category: cat, aao: {} });
          changed();
        }}
      >
        + Stichwort
      </button>
    </div>
  );
}

function TypesTab({ scn, changed }: { scn: Scenario; changed: () => void }) {
  return (
    <div className="aao">
      <p className="muted small">
        Funkkenner-Nummer und „erfüllt“ steuern Funkrufnamen und AAO-Ersatz (z. B. ein HLF erfüllt auch eine LF-Anforderung).
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Bezeichnung</th>
              <th>Org</th>
              <th>Nr.</th>
              <th>Tempo</th>
              <th title="Kann Patienten transportieren">Transport</th>
              <th title="Luftfahrzeug: fliegt in gerader Linie, nur tagsüber">Luft</th>
              <th>erfüllt</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {scn.vehicleTypes.map((t) => (
              <tr key={t.id}>
                <td>{t.id}</td>
                <td>
                  <input value={t.label} onChange={(e) => { t.label = e.target.value; changed(); }} />
                </td>
                <td>
                  <select value={t.org} onChange={(e) => { t.org = e.target.value as 'FW' | 'RD'; changed(); }}>
                    <option value="FW">FW</option>
                    <option value="RD">RD</option>
                  </select>
                </td>
                <td>
                  <input type="number" className="tiny" value={t.funkNr} onChange={(e) => { t.funkNr = Number(e.target.value); changed(); }} />
                </td>
                <td>
                  <input type="number" step={0.05} className="tiny" value={t.speedFactor} onChange={(e) => { t.speedFactor = Number(e.target.value) || 1; changed(); }} />
                </td>
                <td>
                  <input type="checkbox" checked={!!t.transport} onChange={(e) => { t.transport = e.target.checked || undefined; changed(); }} />
                </td>
                <td>
                  <input type="checkbox" checked={!!t.air} onChange={(e) => { t.air = e.target.checked || undefined; changed(); }} />
                </td>
                <td>
                  <input
                    value={t.fills.join(',')}
                    onChange={(e) => {
                      t.fills = e.target.value.split(',').map((x) => x.trim()).filter(Boolean);
                      if (!t.fills.includes(t.id)) t.fills.unshift(t.id);
                      changed();
                    }}
                  />
                </td>
                <td>
                  <button
                    className="small-btn danger"
                    title="Fahrzeugtyp löschen"
                    onClick={() => {
                      const n = scn.stations.reduce((k, s) => k + s.vehicles.filter((v) => v.type === t.id).length, 0);
                      if (n) return alert(`${n} Fahrzeuge haben den Typ ${t.label}. Bitte zuerst umstellen oder entfernen.`);
                      if (!confirm(`Fahrzeugtyp ${t.label} löschen? Er wird auch aus der AAO entfernt.`)) return;
                      scn.vehicleTypes = scn.vehicleTypes.filter((x) => x !== t);
                      for (const sw of scn.stichworte) delete sw.aao[t.id];
                      for (const x of scn.vehicleTypes) x.fills = x.fills.filter((id) => id !== t.id);
                      changed();
                    }}
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        onClick={() => {
          const id = prompt('Kürzel des neuen Fahrzeugtyps (z. B. "GWL"):')?.toUpperCase().replace(/[^A-Z0-9]/g, '');
          if (!id || scn.vehicleTypes.some((t) => t.id === id)) return;
          scn.vehicleTypes.push({ id, label: id, org: 'FW', funkNr: 50, fills: [id], speedFactor: 0.9 });
          changed();
        }}
      >
        + Fahrzeugtyp
      </button>
    </div>
  );
}

function FleetTab({ scn, changed }: { scn: Scenario; changed: () => void }) {
  const [text, setText] = useState('');
  const [out, setOut] = useState<string[]>([]);
  const groups = ensureTmo(scn);
  const count = scn.stations.reduce((n, s) => n + s.vehicles.length, 0);
  return (
    <div className="form">
      <h3>Fahrzeugbelegung</h3>
      <p className="small muted">
        {scn.stations.length} Wachen, {count} Fahrzeuge. Funkrufnamen folgen den bayerischen Fahrzeugkennzahlen (z. B. 40 = HLF 20, 46 = TSF-W, 71 = RTW,
        76 = NEF).
      </p>
      <button
        onClick={() => {
          if (!confirm('Alle Fahrzeuge aller Wachen werden neu verteilt. Fortfahren?')) return;
          setOut(assignFleet(scn));
          changed();
        }}
      >
        Nach bayerischem Muster neu verteilen
      </button>
      <h4>Fahrzeugliste einfügen</h4>
      <p className="small muted">
        Liste mit Funkrufnamen hier einfügen, z. B. von lstsim.de die Fahrzeugübersicht der Leitstelle markieren und kopieren. Erkannt wird alles wie
        „Florian Kitzingen 40/1“ oder „Rotkreuz Würzburg 71/3“, der Typ ergibt sich aus der Kennzahl. Genannte Wachen bekommen genau diese Fahrzeuge, fehlende
        Wachen werden am Ortsmittelpunkt angelegt. Die Wachenliste von lstsim.de mit Koordinaten und Dienstzeiten wird erkannt: Sie ersetzt Rettungswachen,
        NEF-Standorte, HvO und Berufsfeuerwehr samt Schichtplan.
      </p>
      <textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder={'Florian Kitzingen 12/1\nFlorian Kitzingen 40/1\nRotkreuz Kitzingen 71/1\n…'} />
      <button
        disabled={!text.trim()}
        onClick={() => {
          // Wachenliste von lstsim.de (mit Koordinaten und Dienstzeiten) oder einfache Funkrufnamen
          setOut(/^Koordinaten:/m.test(text) ? applyLstsim(scn, text).notes : applyFleetText(scn, text));
          changed();
        }}
      >
        Liste übernehmen
      </button>
      {out.length > 0 && (
        <div className="import-notes small">
          <div>
            {out.map((n, i) => (
              <div key={i}>{n}</div>
            ))}
          </div>
        </div>
      )}
      <h3>TMO-Rufgruppen</h3>
      <p className="small muted">Jede Wache funkt in ihrer Rufgruppe. Einsatzgruppen kann der Disponent einem Einsatz zuweisen.</p>
      {groups.map((g) => (
        <div key={g.id} className="row">
          <input className="grow" value={g.name} onChange={(e) => { g.name = e.target.value; changed(); }} />
          <select value={g.use} onChange={(e) => { g.use = e.target.value as TmoGroup['use']; changed(); }}>
            {(['RD', 'FW', 'Einsatz', 'Übergreifend'] as const).map((u) => (
              <option key={u}>{u}</option>
            ))}
          </select>
          <span className="small muted">{scn.stations.filter((s) => s.tmo === g.id).length} Wachen</span>
          <button
            className="small-btn"
            disabled={groups.length <= 1}
            onClick={() => {
              scn.tmoGroups = groups.filter((x) => x !== g);
              ensureTmo(scn);
              changed();
            }}
          >
            ✕
          </button>
        </div>
      ))}
      <button
        onClick={() => {
          groups.push({ id: newId('tmo'), name: `Gruppe ${groups.length + 1}`, use: 'FW' });
          changed();
        }}
      >
        + Rufgruppe
      </button>
    </div>
  );
}

function SettingsTab({ scn, changed }: { scn: Scenario; changed: () => void }) {
  const s = scn.settings;
  const clock = `${String(Math.floor(s.startClock / 60)).padStart(2, '0')}:${String(s.startClock % 60).padStart(2, '0')}`;
  return (
    <div className="form">
      <h3>Leitstelle</h3>
      <label>
        Autor
        <input value={scn.autor ?? ''} maxLength={40} onChange={(e) => { scn.autor = e.target.value; changed(); }} />
      </label>
      <label>
        Beschreibung für den Katalog
        <textarea rows={3} maxLength={1000} value={scn.beschreibung ?? ''} onChange={(e) => { scn.beschreibung = e.target.value; changed(); }} />
      </label>
      {scn.herkunft && (
        <p className="muted small">
          Aus dem Katalog von {scn.herkunft.autor || 'unbekannt'} ({scn.herkunft.server}).
        </p>
      )}
      <h3>Einsatzaufkommen</h3>
      <label>
        Notrufe pro Stunde: {s.callsPerHour}
        <input type="range" min={0} max={60} value={s.callsPerHour} onChange={(e) => { s.callsPerHour = Number(e.target.value); changed(); }} />
      </label>
      <label>
        BMA-Auslösungen pro Stunde: {s.bmaPerHour}
        <input type="range" min={0} max={10} step={0.5} value={s.bmaPerHour} onChange={(e) => { s.bmaPerHour = Number(e.target.value); changed(); }} />
      </label>
      <label>
        Uhrzeit bei Schichtbeginn
        <input
          type="time"
          value={clock}
          onChange={(e) => {
            const [h, m] = e.target.value.split(':').map(Number);
            s.startClock = h * 60 + m;
            changed();
          }}
        />
      </label>
    </div>
  );
}

function CheckTab({ scn }: { scn: Scenario }) {
  const problems = validateScenario(scn);
  // Erreichbarkeit aller Wachen, Kliniken und Objekte prüfen
  if (scn.stations.length && scn.roads.length) {
    const g = new RoadGraph(scn);
    const { time } = g.dijkstra(g.nearestNode(scn.stations[0]));
    for (const p of [...scn.stations, ...scn.hospitals, ...scn.objects]) {
      const n = g.nearestNode(p);
      if (n < 0 || !isFinite(time[n])) problems.push(`${p.name} ist vom Straßennetz der ersten Wache nicht erreichbar.`);
      else if (Math.hypot(g.nodes[n].x - p.x, g.nodes[n].y - p.y) > 500) problems.push(`${p.name} liegt weit (> 500 m) von der nächsten Straße entfernt.`);
    }
  }
  const hinweise = editorHinweise(scn);
  return (
    <div>
      {problems.length === 0 ? <p className="ok">Keine Fehler gefunden. Die Leitstelle ist spielbereit.</p> : <h4>Fehler</h4>}
      <ul className="problems">
        {problems.map((p, i) => (
          <li key={i}>{p}</li>
        ))}
      </ul>
      {hinweise.length > 0 && (
        <>
          <h4>Hinweise</h4>
          <ul className="hinweise small">
            {hinweise.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
