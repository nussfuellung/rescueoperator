// Leitstellen-Bibliothek und Editor für eigene Leitstellen.
import { useEffect, useRef, useState } from 'react';
import { SPECIALTIES, orgPrefix } from '../../../shared/catalog';
import { RoadGraph, projectOnSegment, recomputeHouseNumbers, townAt, nearestTown } from '../../../shared/geo';
import { emptyScenario, generateScenario, newId, validateScenario } from '../../../shared/mapgen';
import type { MapObject, RoadType, Scenario, Station, Vec } from '../../../shared/types';
import { api, type ScenarioInfo } from '../api';
import { MapView, type Hit } from '../MapView';
import { OsmImportDialog } from './OsmImportDialog';
import { applyFleetText, assignFleet, ensureTmo } from '../../../shared/fleet';
import { applyLstsim } from '../../../shared/lstsim';
import type { TmoGroup } from '../../../shared/types';

export function EditorScreen({ onBack }: { onBack: () => void }) {
  const [list, setList] = useState<ScenarioInfo[]>([]);
  const [editing, setEditing] = useState<Scenario | null>(null);
  const [osm, setOsm] = useState(false);
  const [notes, setNotes] = useState<string[]>([]);
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
        }}
      />
    );
  }

  return (
    <div className="menu-bg">
      <div className="menu-card wide">
        <h2>Leitstellen-Editor</h2>
        <p className="muted">Baue eigene Leitstellenbereiche mit Orten, Straßen, Wachen, Fahrzeugen, Kliniken und Alarmierungsordnung.</p>
        <table className="lib">
          <tbody>
            {list.map((s) => (
              <tr key={s.id}>
                <td>
                  <b>{s.ilsName}</b>
                  <div className="muted small">
                    {s.towns} Orte · {s.vehicles} Fahrzeuge
                  </div>
                </td>
                <td className="right">
                  <button onClick={async () => setEditing(await api.loadScenario(s.id))}>Bearbeiten</button>
                  <button onClick={async () => api.exportScenario(await api.loadScenario(s.id))}>Exportieren</button>
                  <button
                    onClick={async () => {
                      const src = await api.loadScenario(s.id);
                      const copy = { ...structuredClone(src), id: newId('scn'), name: `${src.name} (Kopie)`, ilsName: `${src.ilsName} (Kopie)` };
                      await api.saveScenario(copy);
                      refresh();
                    }}
                  >
                    Kopieren
                  </button>
                  <button
                    className="danger"
                    onClick={async () => {
                      if (confirm(`${s.ilsName} wirklich löschen?`)) {
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
        <div className="menu-buttons">
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
          <button className="primary" onClick={() => setOsm(true)}>
            Neue Leitstelle aus echter Karte (OpenStreetMap)
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
            Importieren
          </button>
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
    </div>
  );
}

type Tool = 'select' | 'road' | 'town' | 'feuerwache' | 'rettungswache' | 'hospital' | 'object' | 'delete';
type Tab = 'props' | 'fleet' | 'aao' | 'types' | 'settings' | 'check';

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
        </div>
        <div className="editor-map">
          <MapView
            key={`${scn.geo?.mx0 ?? 'gen'}-${scn.width}-${scn.height}`}
            scenario={scn}
            version={version}
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
                ['fleet', 'Fahrzeuge/Funk'],
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
            {tab === 'props' && <Props scn={scn} sel={sel} changed={changed} callsignFor={callsignFor} onDelete={(h) => { deleteHit(h); changed(true); }} />}
            {tab === 'fleet' && <FleetTab scn={scn} changed={changed} />}
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
}

function Props({ scn, sel, changed, callsignFor, onDelete }: PropsArgs) {
  const [newType, setNewType] = useState(scn.vehicleTypes[0]?.id ?? '');
  if (!sel) {
    return (
      <div className="muted small">
        Wähle mit dem Auswahlwerkzeug ein Element auf der Karte aus.
        <ul>
          <li>{scn.towns.length} Orte</li>
          <li>{scn.roads.length} Straßenabschnitte</li>
          <li>{scn.stations.length} Wachen mit {scn.stations.reduce((n, s) => n + s.vehicles.length, 0)} Fahrzeugen</li>
          <li>{scn.hospitals.length} Krankenhäuser</li>
          <li>{scn.objects.length} Objekte</li>
        </ul>
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
          <div key={v.id} className="row">
            <input className="grow" value={v.callsign} onChange={(e) => { v.callsign = e.target.value; changed(); }} />
            <select value={v.type} onChange={(e) => { v.type = e.target.value; changed(); }}>
              {scn.vehicleTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
            <button className="small-btn danger" onClick={() => { st.vehicles = st.vehicles.filter((x) => x !== v); changed(); }}>
              ✕
            </button>
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
        {SPECIALTIES.map((s) => (
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

function AaoTab({ scn, changed }: { scn: Scenario; changed: () => void }) {
  return (
    <div className="aao">
      <p className="muted small">Pro Stichwort die Fahrzeuge der Alarm- und Ausrückeordnung. Daraus entsteht der Alarmierungsvorschlag.</p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Bezeichnung</th>
              {scn.vehicleTypes.map((t) => (
                <th key={t.id} title={t.label}>
                  {t.id}
                </th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {scn.stichworte.map((s, i) => (
              <tr key={i}>
                <td>
                  <input value={s.code} onChange={(e) => { s.code = e.target.value; changed(); }} className="code" />
                </td>
                <td>
                  <input value={s.label} onChange={(e) => { s.label = e.target.value; changed(); }} />
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
            ))}
          </tbody>
        </table>
      </div>
      <button
        onClick={() => {
          const code = prompt('Code des neuen Stichworts (z. B. "THL Wasser"):');
          if (!code) return;
          const cat = code.startsWith('RD') ? 'RD' : code.startsWith('B') ? 'B' : code.startsWith('THL') ? 'THL' : 'SONST';
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
              <th>Transport</th>
              <th>erfüllt</th>
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
                  <input type="checkbox" checked={!!t.transport} onChange={(e) => { t.transport = e.target.checked; changed(); }} />
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
  return (
    <div>
      {problems.length === 0 ? <p className="ok">Keine Probleme gefunden. Die Leitstelle ist spielbereit.</p> : null}
      <ul className="problems">
        {problems.map((p, i) => (
          <li key={i}>{p}</li>
        ))}
      </ul>
    </div>
  );
}
