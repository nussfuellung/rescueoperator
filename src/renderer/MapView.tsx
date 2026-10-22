// Canvas-Karte des simulierten GIS: Straßen, Orte, Wachen, Kliniken, Fahrzeuge, Einsätze.
import { useEffect, useMemo, useRef } from 'react';
import { FMS_COLOR, shortCallsign } from '../../shared/catalog';
import { projectOnSegment } from '../../shared/geo';
import { localToMercator, mercatorToLocal } from '../../shared/osmimport';
import { getSettings } from './settings';
import type { CallState, IncidentState, RoadType, Scenario, UnitState, Vec } from '../../shared/types';

export type HitKind = 'unit' | 'incident' | 'station' | 'hospital' | 'object' | 'town' | 'node' | 'road';
export interface Hit {
  kind: HitKind;
  id: string;
}

export interface MapData {
  units?: UnitState[];
  incidents?: IncidentState[];
  calls?: CallState[];
  selectedIncidentId?: string;
  selectedUnitId?: string;
  marker?: Vec | null;
  highlightUnitIds?: string[];
  /** Fahrzeug orten: pulsierender Ring um das Fahrzeug bis zum Zeitpunkt until (Date.now) */
  ping?: { unitId: string; until: number } | null;
}

export interface EditorOverlay {
  selected?: Hit | null;
  pendingNodeId?: string | null;
  showNodes: boolean;
}

interface Props {
  scenario: Scenario;
  version?: number;
  data?: MapData;
  editor?: EditorOverlay;
  focus?: { x: number; y: number; seq: number; scale?: number } | null;
  onClick?: (p: Vec, hit: Hit | null, ev: MouseEvent) => void;
  onContext?: (p: Vec, hit: Hit | null) => void;
  /** Gibt true zurück, wenn das Objekt verschoben werden darf */
  canDrag?: (hit: Hit) => boolean;
  onDrag?: (hit: Hit, p: Vec) => void;
  onDragEnd?: (hit: Hit) => void;
  hitKinds?: HitKind[];
}

const ROAD_STYLE: Record<RoadType, { casing: string; fill: string; width: number; minPx: number }> = {
  ortsstrasse: { casing: '#b9b2a3', fill: '#ffffff', width: 9, minPx: 1.2 },
  landstrasse: { casing: '#c9a74a', fill: '#ffe9a8', width: 12, minPx: 2 },
  bundesstrasse: { casing: '#c98a1a', fill: '#ffd166', width: 15, minPx: 2.6 },
  autobahn: { casing: '#24467f', fill: '#5b8ee6', width: 22, minPx: 3.2 },
};
const ROAD_ORDER: RoadType[] = ['ortsstrasse', 'landstrasse', 'bundesstrasse', 'autobahn'];

export function MapView(props: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  const view = useRef({ cx: 0, cy: 0, scale: 0.05, init: false });
  // Zwischengespeicherte Grundkarte (Straßen ändern sich selten, Fahrzeuge ständig)
  const layer = useRef<HTMLCanvasElement | null>(null);
  const layerState = useRef<{ other: string; view: string; tiles: number; cx: number; cy: number; scale: number; t: number } | null>(null);
  const lastView = useRef({ key: '', t: 0 });
  const segVersion = useRef(0);
  const layerTiles = useRef(false);
  // Weich gleitende Fahrzeugpositionen zwischen den Server-Updates
  const glide = useRef(new Map<string, { fx: number; fy: number; tx: number; ty: number; t0: number }>());

  // Straßenbeschriftungen einmal pro Szenario-Version berechnen
  const labels = useMemo(() => {
    const scn = props.scenario;
    const nodeById = new Map(scn.nodes.map((n) => [n.id, n]));
    const best = new Map<string, { x: number; y: number; angle: number; len: number; name: string; type: RoadType }>();
    for (const r of scn.roads) {
      const a = nodeById.get(r.a);
      const b = nodeById.get(r.b);
      if (!a || !b) continue;
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const key = `${r.town}|${r.name}|${r.type === 'ortsstrasse' ? '' : Math.round(a.x / 4000) + ':' + Math.round(a.y / 4000)}`;
      const cur = best.get(key);
      if (!cur || len > cur.len) {
        let angle = Math.atan2(b.y - a.y, b.x - a.x);
        if (angle > Math.PI / 2) angle -= Math.PI;
        if (angle < -Math.PI / 2) angle += Math.PI;
        best.set(key, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, angle, len, name: r.name, type: r.type });
      }
    }
    return [...best.values()];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.scenario, props.version]);
  const labelsRef = useRef(labels);
  labelsRef.current = labels;

  // Straßenabschnitte als Zahlenfelder je Straßentyp: schnell zu zeichnen, auch bei echten Karten
  const segments = useMemo(() => {
    const scn = props.scenario;
    const nodeById = new Map(scn.nodes.map((n) => [n.id, n]));
    const out = {} as Record<RoadType, Float64Array>;
    for (const type of ROAD_ORDER) {
      const list = scn.roads.filter((r) => r.type === type);
      const arr = new Float64Array(list.length * 4);
      let k = 0;
      for (const r of list) {
        const a = nodeById.get(r.a);
        const b = nodeById.get(r.b);
        if (!a || !b) continue;
        arr[k++] = a.x;
        arr[k++] = a.y;
        arr[k++] = b.x;
        arr[k++] = b.y;
      }
      out[type] = arr.subarray(0, k);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.scenario, props.version]);
  const segmentsRef = useRef(segments);
  if (segmentsRef.current !== segments) segVersion.current++;
  segmentsRef.current = segments;

  // Fokus setzen (z. B. auf ausgewählten Einsatz)
  useEffect(() => {
    if (props.focus) {
      view.current.cx = props.focus.x;
      view.current.cy = props.focus.y;
      view.current.scale = props.focus.scale ?? Math.max(view.current.scale, 0.18);
    }
  }, [props.focus?.seq]);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    // Die Karte kann in einem ausgelagerten Fenster liegen
    const win = canvas.ownerDocument.defaultView ?? window;
    let raf = 0;
    let dragging: { sx: number; sy: number; cx: number; cy: number; moved: boolean; hit: Hit | null; drag: boolean } | null = null;

    const toWorld = (sx: number, sy: number): Vec => {
      const v = view.current;
      return { x: v.cx + (sx - canvas.clientWidth / 2) / v.scale, y: v.cy + (sy - canvas.clientHeight / 2) / v.scale };
    };
    const toScreen = (p: Vec): [number, number] => {
      const v = view.current;
      return [(p.x - v.cx) * v.scale + canvas.clientWidth / 2, (p.y - v.cy) * v.scale + canvas.clientHeight / 2];
    };

    const fit = () => {
      const scn = propsRef.current.scenario;
      const w = canvas.clientWidth || 800;
      const h = canvas.clientHeight || 600;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const n of scn.nodes) {
        minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x);
        minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y);
      }
      if (!isFinite(minX)) {
        minX = 0; minY = 0; maxX = scn.width; maxY = scn.height;
      }
      view.current.cx = (minX + maxX) / 2;
      view.current.cy = (minY + maxY) / 2;
      view.current.scale = Math.min(w / (maxX - minX + 1000), h / (maxY - minY + 1000));
      // Große echte Karten: auf den größten Ort zoomen statt den ganzen Bereich winzig zu zeigen
      if (maxX - minX > 30000 && scn.towns[0]) {
        const big = [...scn.towns].sort((a, b) => b.radius - a.radius)[0];
        view.current.cx = big.x;
        view.current.cy = big.y;
        view.current.scale = Math.min(w, h) / 14000;
      }
      view.current.init = true;
    };

    const hitTest = (sx: number, sy: number): Hit | null => {
      const p = propsRef.current;
      const scn = p.scenario;
      const kinds = p.hitKinds;
      const allow = (k: HitKind) => !kinds || kinds.includes(k);
      const near = (q: Vec, r = 12) => {
        const [x, y] = toScreen(q);
        return Math.hypot(x - sx, y - sy) <= r;
      };
      if (allow('unit')) {
        for (const u of [...(p.data?.units ?? [])].reverse()) {
          if (u.task === 'station' && view.current.scale < (scn.stations.length > 40 ? 0.3 : 0.12)) continue;
          if (near(unitDrawPos(u, scn, p.data?.units ?? [], view.current.scale), 14)) return { kind: 'unit', id: u.id };
        }
      }
      if (allow('incident')) for (const i of p.data?.incidents ?? []) if (i.status !== 'abgeschlossen' && near(i, 14)) return { kind: 'incident', id: i.id };
      if (allow('station')) for (const s of scn.stations) if (near(s)) return { kind: 'station', id: s.id };
      if (allow('hospital')) for (const h of scn.hospitals) if (near(h)) return { kind: 'hospital', id: h.id };
      if (allow('object')) for (const o of scn.objects) if (near(o, 9)) return { kind: 'object', id: o.id };
      if (allow('node') && p.editor?.showNodes && view.current.scale > 0.1) for (const n of scn.nodes) if (near(n, 7)) return { kind: 'node', id: n.id };
      if (allow('town')) for (const t of scn.towns) if (near(t, 14)) return { kind: 'town', id: t.id };
      if (allow('road')) {
        const nodeById = new Map(scn.nodes.map((n) => [n.id, n]));
        const w = toWorld(sx, sy);
        const tol = 7 / view.current.scale;
        for (const r of scn.roads) {
          const a = nodeById.get(r.a);
          const b = nodeById.get(r.b);
          if (a && b && projectOnSegment(w, a, b).d < tol) return { kind: 'road', id: r.id };
        }
      }
      return null;
    };

    const onDown = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const hit = e.button === 0 ? hitTest(sx, sy) : null;
      const drag = !!(hit && propsRef.current.canDrag?.(hit));
      dragging = { sx, sy, cx: view.current.cx, cy: view.current.cy, moved: false, hit, drag };
    };
    const onMove = (e: MouseEvent) => {
      if (!dragging) return;
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      if (Math.hypot(sx - dragging.sx, sy - dragging.sy) > 4) dragging.moved = true;
      if (!dragging.moved) return;
      if (dragging.drag && dragging.hit) {
        propsRef.current.onDrag?.(dragging.hit, toWorld(sx, sy));
      } else {
        view.current.cx = dragging.cx - (sx - dragging.sx) / view.current.scale;
        view.current.cy = dragging.cy - (sy - dragging.sy) / view.current.scale;
      }
    };
    const onUp = (e: MouseEvent) => {
      if (!dragging) return;
      const d = dragging;
      dragging = null;
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      if (d.moved && d.drag && d.hit) propsRef.current.onDragEnd?.(d.hit);
      if (!d.moved && e.button === 0) propsRef.current.onClick?.(toWorld(sx, sy), d.hit, e);
    };
    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      propsRef.current.onContext?.(toWorld(sx, sy), hitTest(sx, sy));
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const before = toWorld(sx, sy);
      // Mausrad liefert ca. 100 px pro Raste, Touchpads viele kleine Schritte; Pinch-Gesten kommen als Rad mit Strg
      // und sehr kleinen Werten und brauchen deshalb eine deutlich höhere Empfindlichkeit.
      let dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? canvas.clientHeight : 1);
      if (e.ctrlKey) dy *= 8;
      const zoom = Math.max(-0.7, Math.min(0.7, -dy * 0.0025 * getSettings().zoomSpeed));
      const f = Math.exp(zoom);
      view.current.scale = Math.max(0.01, Math.min(3, view.current.scale * f));
      const after = toWorld(sx, sy);
      view.current.cx += before.x - after.x;
      view.current.cy += before.y - after.y;
    };

    canvas.addEventListener('mousedown', onDown);
    win.addEventListener('mousemove', onMove);
    win.addEventListener('mouseup', onUp);
    canvas.addEventListener('contextmenu', onContextMenu);
    canvas.addEventListener('wheel', onWheel, { passive: false });

    const draw = () => {
      raf = win.requestAnimationFrame(draw);
      const dpr = win.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (!w || !h) return;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      if (!view.current.init) fit();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const p = propsRef.current;
      const scn = p.scenario;
      const v = view.current;
      const now = performance.now();

      const drawBase = (ctx: CanvasRenderingContext2D): boolean => {
        ctx.fillStyle = '#e9e5da';
        ctx.fillRect(0, 0, w, h);

        // Echte Karte: Kacheln von OpenStreetMap als Hintergrund
        const settings = getSettings();
        const tiles: boolean = !!scn.geo && settings.mapTiles && drawTiles(ctx, scn, v, w, h, settings.tileUrl, toScreen);

        // Orte
        if (!tiles) {
          ctx.fillStyle = '#ddd3bf';
          for (const t of scn.towns) {
            const [x, y] = toScreen(t);
            ctx.beginPath();
            ctx.arc(x, y, t.radius * v.scale * 1.08, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        // Straßen (über Kacheln nur dezent, damit das befahrbare Netz sichtbar bleibt)
        const segs = segmentsRef.current;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        if (tiles) ctx.globalAlpha = 0.35;
        const x0 = v.cx - w / 2 / v.scale - 20 / v.scale;
        const x1 = v.cx + w / 2 / v.scale + 20 / v.scale;
        const y0 = v.cy - h / 2 / v.scale - 20 / v.scale;
        const y1 = v.cy + h / 2 / v.scale + 20 / v.scale;
        const ox = w / 2 - v.cx * v.scale;
        const oy = h / 2 - v.cy * v.scale;
        for (const pass of tiles ? (['fill'] as const) : (['casing', 'fill'] as const)) {
          for (const type of ROAD_ORDER) {
            const st = ROAD_STYLE[type];
            // Bei weit herausgezoomten großen Netzen Ortsstraßen ohne Rand zeichnen
            if (pass === 'casing' && type === 'ortsstrasse' && v.scale < 0.06 && segs[type].length > 20000) continue;
            // Ganz weit draußen bei großen echten Karten nur das überörtliche Netz
            if (type === 'ortsstrasse' && v.scale < 0.02 && segs[type].length > 20000) continue;
            const width = Math.max(st.minPx, st.width * v.scale);
            const arr = segs[type];
            ctx.beginPath();
            for (let i = 0; i < arr.length; i += 4) {
              const ax = arr[i], ay = arr[i + 1], bx = arr[i + 2], by = arr[i + 3];
              if ((ax < x0 && bx < x0) || (ax > x1 && bx > x1) || (ay < y0 && by < y0) || (ay > y1 && by > y1)) continue;
              ctx.moveTo(ax * v.scale + ox, ay * v.scale + oy);
              ctx.lineTo(bx * v.scale + ox, by * v.scale + oy);
            }
            if (pass === 'casing') {
              ctx.strokeStyle = st.casing;
              ctx.lineWidth = width + 2;
            } else {
              ctx.strokeStyle = tiles ? '#1f6feb' : st.fill;
              ctx.lineWidth = tiles ? Math.max(1.5, width * 0.5) : width;
            }
            ctx.stroke();
          }
        }
        ctx.globalAlpha = 1;

        // Editor: ausgewählte Straße
        if (p.editor?.selected?.kind === 'road') {
          const r = scn.roads.find((x) => x.id === p.editor!.selected!.id);
          const a = r && scn.nodes.find((n) => n.id === r.a);
          const b = r && scn.nodes.find((n) => n.id === r.b);
          if (a && b) {
            ctx.strokeStyle = '#ff006e';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.moveTo(...toScreen(a));
            ctx.lineTo(...toScreen(b));
            ctx.stroke();
          }
        }

        // Straßennamen (die Kacheln bringen eigene mit)
        if (tiles) {
          // nichts
        } else if (v.scale > 0.28) {
          ctx.font = `${Math.min(13, 9 + v.scale * 4)}px "Segoe UI", sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          for (const l of labelsRef.current) {
            const [x, y] = toScreen(l);
            if (x < -100 || x > w + 100 || y < -50 || y > h + 50) continue;
            if (l.len * v.scale < l.name.length * 5) continue;
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(l.angle);
            ctx.fillStyle = '#4b4536';
            ctx.strokeStyle = 'rgba(255,255,255,0.85)';
            ctx.lineWidth = 3;
            ctx.strokeText(l.name, 0, 0);
            ctx.fillText(l.name, 0, 0);
            ctx.restore();
          }
        } else if (v.scale > 0.04) {
          // Überlandstraßen-Nummern als Schilder
          ctx.font = 'bold 10px "Segoe UI", sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          for (const l of labelsRef.current) {
            if (l.type === 'ortsstrasse') continue;
            // Nur Straßennummern (B 16, ST 2084) als Schild, keine langen Namen
            if (l.name.length > 9 || !/\d/.test(l.name)) continue;
            const [x, y] = toScreen(l);
            const tw = ctx.measureText(l.name).width + 6;
            ctx.fillStyle = l.type === 'autobahn' ? '#1d4fa3' : l.type === 'bundesstrasse' ? '#f2c230' : '#fff';
            ctx.fillRect(x - tw / 2, y - 7, tw, 14);
            ctx.strokeStyle = '#333';
            ctx.lineWidth = 1;
            ctx.strokeRect(x - tw / 2, y - 7, tw, 14);
            ctx.fillStyle = l.type === 'autobahn' ? '#fff' : '#222';
            ctx.fillText(l.name, x, y + 0.5);
          }
        }
        return tiles;
      };

      const isSel = (kind: HitKind, id: string) => p.editor?.selected?.kind === kind && p.editor.selected.id === id;

      // Ortsnamen, Objekte, Kliniken und Wachen: ändern sich nur mit der Ansicht (außer im Editor)
      const drawStatic = (ctx: CanvasRenderingContext2D) => {
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        // Ortsnamen
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (const t of scn.towns) {
          const [x, y] = toScreen(t);
          const big = t.radius > 1200;
          ctx.font = `${big ? 'bold ' : ''}${big ? 17 : 14}px "Segoe UI", sans-serif`;
          ctx.lineWidth = 4;
          ctx.strokeStyle = 'rgba(255,255,255,0.9)';
          const ty = y - t.radius * v.scale * (v.scale > 0.28 ? 0.85 : 1.08) - 10;
          ctx.strokeText(t.name, x, ty);
          ctx.fillStyle = '#2b2b2b';
          ctx.fillText(t.name, x, ty);
          if (p.editor?.selected?.kind === 'town' && p.editor.selected.id === t.id) {
            ctx.strokeStyle = '#ff006e';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(x, y, t.radius * v.scale, 0, Math.PI * 2);
            ctx.stroke();
          }
        }

        // Objekte
        for (const o of scn.objects) {
          const [x, y] = toScreen(o);
          ctx.fillStyle = o.bma ? '#9d4edd' : '#7a7a7a';
          ctx.beginPath();
          ctx.moveTo(x, y - 6);
          ctx.lineTo(x + 6, y);
          ctx.lineTo(x, y + 6);
          ctx.lineTo(x - 6, y);
          ctx.closePath();
          ctx.fill();
          if (isSel('object', o.id)) ring(ctx, x, y, 10);
          if (v.scale > 0.35) label(ctx, o.name, x, y + 14, '#3c096c');
        }

        // Kliniken
        for (const hsp of scn.hospitals) {
          const [x, y] = toScreen(hsp);
          ctx.fillStyle = '#0353a4';
          ctx.fillRect(x - 9, y - 9, 18, 18);
          ctx.fillStyle = '#fff';
          ctx.font = 'bold 13px sans-serif';
          ctx.fillText('H', x, y + 1);
          if (isSel('hospital', hsp.id)) ring(ctx, x, y, 14);
          if (v.scale > 0.12) label(ctx, hsp.name, x, y + 18, '#023e7d');
        }

        // Wachen
        for (const s of scn.stations) {
          const [x, y] = toScreen(s);
          const fw = s.kind === 'feuerwache';
          ctx.fillStyle = fw ? '#c1121f' : '#ffffff';
          ctx.strokeStyle = fw ? '#780000' : '#c1121f';
          ctx.lineWidth = 2;
          ctx.fillRect(x - 11, y - 8, 22, 16);
          ctx.strokeRect(x - 11, y - 8, 22, 16);
          ctx.fillStyle = fw ? '#fff' : '#c1121f';
          ctx.font = 'bold 9px sans-serif';
          ctx.fillText(fw ? 'FW' : 'RW', x, y + 1);
          if (isSel('station', s.id)) ring(ctx, x, y, 15);
          if (v.scale > 0.2) label(ctx, s.name, x, y - 16, '#7a0000');
        }
      };

      // Hintergrund, Straßen, Straßennamen und Wachen liegen in einer zwischengespeicherten Ebene. Beim Verschieben und
      // Zoomen wird diese Ebene nur verschoben bzw. skaliert und erst neu gezeichnet, wenn die Bewegung kurz ruht.
      const settings0 = getSettings();
      const otherKey = [w, h, dpr, segVersion.current, labelsRef.current.length, settings0.mapTiles, settings0.tileUrl, p.editor?.selected?.id, scn.stations.length, scn.hospitals.length, scn.objects.length].join('|');
      const viewKey = `${v.cx}|${v.cy}|${v.scale}`;
      if (viewKey !== lastView.current.key) lastView.current = { key: viewKey, t: now };
      const moving = now - lastView.current.t < 160;
      if (!layer.current || layer.current.width !== canvas.width || layer.current.height !== canvas.height) {
        layer.current = canvas.ownerDocument.createElement('canvas');
        layer.current.width = canvas.width;
        layer.current.height = canvas.height;
        layerState.current = null;
      }
      const ls = layerState.current;
      // Neu geladene Kacheln höchstens alle 120 ms einarbeiten, damit viele gleichzeitig eintreffende Kacheln nicht jeden Frame neu zeichnen
      const tilesNew = !!ls && ls.tiles !== tileVersion && now - ls.t >= 120;
      const stale = !ls || ls.other !== otherKey || ls.view !== viewKey || tilesNew;
      const fast = !!ls && ls.other === otherKey && moving && !p.editor;
      if (stale && !fast) {
        const lctx = layer.current.getContext('2d')!;
        lctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        layerTiles.current = drawBase(lctx);
        if (!p.editor) drawStatic(lctx);
        layerState.current = { other: otherKey, view: viewKey, tiles: tileVersion, cx: v.cx, cy: v.cy, scale: v.scale, t: now };
      }
      const tiles = layerTiles.current;
      const L = layerState.current!;
      if (L.view === viewKey) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(layer.current, 0, 0);
      } else {
        // Ebene der letzten Ansicht passend verschoben und skaliert
        const k = v.scale / L.scale;
        const tx = w / 2 - (k * w) / 2 + (L.cx - v.cx) * v.scale;
        const ty = h / 2 - (k * h) / 2 + (L.cy - v.cy) * v.scale;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = '#e9e5da';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * tx, dpr * ty);
        ctx.drawImage(layer.current, 0, 0, w, h);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Editor: Knoten
      if (p.editor?.showNodes && v.scale > 0.1) {
        for (const n of scn.nodes) {
          const [x, y] = toScreen(n);
          if (x < -5 || x > w + 5 || y < -5 || y > h + 5) continue;
          const sel = (p.editor.selected?.kind === 'node' && p.editor.selected.id === n.id) || p.editor.pendingNodeId === n.id;
          ctx.fillStyle = sel ? '#ff006e' : '#5a6b7d';
          ctx.beginPath();
          ctx.arc(x, y, sel ? 5 : 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      if (p.editor) drawStatic(ctx);

      // Handyortung (AML) und BMA-Positionen
      for (const c of p.data?.calls ?? []) {
        if (c.state === 'ended') continue;
        if (c.aml) {
          const [x, y] = toScreen(c.aml);
          ctx.fillStyle = 'rgba(0,119,182,0.15)';
          ctx.strokeStyle = 'rgba(0,119,182,0.8)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(x, y, Math.max(6, c.aml.acc * v.scale), 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          label(ctx, `AML ${c.phone}`, x, y - Math.max(6, c.aml.acc * v.scale) - 8, '#023e7d');
        }
      }

      // Weiche Fahrzeugbewegung: zwischen zwei Server-Updates gleiten
      const gl = glide.current;
      const shown = new Map<string, Vec>();
      for (const u of p.data?.units ?? []) {
        let g = gl.get(u.id);
        if (!g) {
          g = { fx: u.x, fy: u.y, tx: u.x, ty: u.y, t0: now };
          gl.set(u.id, g);
        }
        const f = Math.min(1, (now - g.t0) / 260);
        const cx = g.fx + (g.tx - g.fx) * f;
        const cy = g.fy + (g.ty - g.fy) * f;
        if (g.tx !== u.x || g.ty !== u.y) {
          // Große Sprünge (Wache, Neustart) nicht animieren
          const jump = Math.hypot(u.x - cx, u.y - cy) > 3000;
          g.fx = jump ? u.x : cx;
          g.fy = jump ? u.y : cy;
          g.tx = u.x;
          g.ty = u.y;
          g.t0 = now;
        }
        shown.set(u.id, { x: cx, y: cy });
      }

      // Fahrwege: Rest der Route jedes fahrenden Fahrzeugs auf den Straßen
      for (const u of p.data?.units ?? []) {
        if (!u.route?.length) continue;
        const sel = p.data?.selectedUnitId === u.id || p.data?.highlightUnitIds?.includes(u.id);
        ctx.strokeStyle = FMS_COLOR[u.status] ?? '#333';
        ctx.globalAlpha = sel ? 0.9 : 0.55;
        ctx.lineWidth = sel ? 4 : 2.5;
        ctx.setLineDash(u.status === 3 || u.status === 7 ? [] : [7, 5]);
        ctx.beginPath();
        ctx.moveTo(...toScreen(shown.get(u.id) ?? u));
        for (let k = u.routeIdx + 1; k < u.route.length; k++) ctx.lineTo(...toScreen(u.route[k]));
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.setLineDash([]);

      // Einsätze
      const pulse = (Math.sin(now / 250) + 1) / 2;
      for (const i of p.data?.incidents ?? []) {
        if (i.status === 'abgeschlossen') continue;
        const [x, y] = toScreen(i);
        const sel = p.data?.selectedIncidentId === i.id;
        const r = sel ? 13 : 10;
        if (i.status === 'offen') {
          ctx.fillStyle = `rgba(208,0,0,${0.15 + pulse * 0.25})`;
          ctx.beginPath();
          ctx.arc(x, y, r + 10, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = i.stichwort.startsWith('RD') ? '#e85d04' : i.stichwort.startsWith('THL') ? '#0077b6' : i.stichwort.startsWith('ABC') ? '#b08900' : '#d00000';
        ctx.strokeStyle = sel ? '#000' : '#fff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, y - r);
        ctx.lineTo(x + r, y + r * 0.8);
        ctx.lineTo(x - r, y + r * 0.8);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 10px sans-serif';
        ctx.fillText('!', x, y + 2);
        label(ctx, `${i.stichwort}`, x, y + r + 10, '#6a040f', true);
      }

      // Fahrzeuge
      const units = p.data?.units ?? [];
      for (const u of units) {
        if (u.task === 'station' && v.scale < (scn.stations.length > 40 ? 0.3 : 0.12)) continue;
        const pos = u.task === 'station' ? unitDrawPos(u, scn, units, v.scale) : shown.get(u.id) ?? u;
        const [x, y] = toScreen(pos);
        if (x < -60 || x > w + 60 || y < -20 || y > h + 20) continue;
        const text = shortCallsign(u.callsign);
        ctx.font = 'bold 10px "Segoe UI", sans-serif';
        const tw = ctx.measureText(text).width + 16;
        const sel = p.data?.selectedUnitId === u.id || p.data?.highlightUnitIds?.includes(u.id);
        const blink = u.status === 5 && pulse > 0.5;
        ctx.fillStyle = blink ? '#ffffff' : FMS_COLOR[u.status] ?? '#333';
        roundRect(ctx, x - tw / 2, y - 8, tw, 16, 4);
        ctx.fill();
        ctx.strokeStyle = sel ? '#000' : 'rgba(0,0,0,0.45)';
        ctx.lineWidth = sel ? 2.5 : 1;
        ctx.stroke();
        ctx.fillStyle = blink ? '#ff2d55' : '#fff';
        ctx.textAlign = 'left';
        ctx.fillText(String(u.status), x - tw / 2 + 4, y + 1);
        ctx.textAlign = 'center';
        ctx.fillText(text, x + 5, y + 1);
      }

      // Fahrzeug orten
      const ping = p.data?.ping;
      if (ping && Date.now() < ping.until) {
        const u = units.find((x) => x.id === ping.unitId);
        if (u) {
          const [x, y] = toScreen(u.task === 'station' ? unitDrawPos(u, scn, units, v.scale) : shown.get(u.id) ?? u);
          const k = (now % 1200) / 1200;
          ctx.strokeStyle = `rgba(31,111,235,${1 - k})`;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(x, y, 14 + k * 30, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      // Marker (vom Calltaker gesetzter Einsatzort)
      if (p.data?.marker) {
        const [x, y] = toScreen(p.data.marker);
        ctx.strokeStyle = '#ff006e';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(x, y, 10, 0, Math.PI * 2);
        ctx.moveTo(x - 16, y);
        ctx.lineTo(x + 16, y);
        ctx.moveTo(x, y - 16);
        ctx.lineTo(x, y + 16);
        ctx.stroke();
      }

      if (tiles) {
        ctx.font = '11px "Segoe UI", sans-serif';
        const txt = '© OpenStreetMap-Mitwirkende';
        const tw = ctx.measureText(txt).width;
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.fillRect(w - tw - 12, 0, tw + 12, 17);
        ctx.fillStyle = '#333';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(txt, w - tw - 6, 9);
      }

      // Maßstab
      const targetPx = 120;
      const meters = niceNumber(targetPx / v.scale);
      const px = meters * v.scale;
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.fillRect(10, h - 28, px + 60, 20);
      ctx.strokeStyle = '#222';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(16, h - 14);
      ctx.lineTo(16 + px, h - 14);
      ctx.stroke();
      ctx.fillStyle = '#222';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(meters >= 1000 ? `${meters / 1000} km` : `${meters} m`, 22 + px, h - 14);
    };
    draw();

    return () => {
      win.cancelAnimationFrame(raf);
      canvas.removeEventListener('mousedown', onDown);
      win.removeEventListener('mousemove', onMove);
      win.removeEventListener('mouseup', onUp);
      canvas.removeEventListener('contextmenu', onContextMenu);
      canvas.removeEventListener('wheel', onWheel);
    };
  }, []);

  return <canvas ref={canvasRef} className="map-canvas" />;
}

/** Fahrzeuge auf der Wache nebeneinander unter dem Wachensymbol anordnen */
// Position der Fahrzeuge auf der Wache: einmal je Zustandsstand berechnen statt für jedes Fahrzeug alle zu durchsuchen
const slotCache = new WeakMap<UnitState[], { idx: Map<string, number>; stations: Map<string, Vec> }>();
function unitDrawPos(u: UnitState, scn: Scenario, all: UnitState[], scale: number): Vec {
  if (u.task !== 'station') return u;
  let c = slotCache.get(all);
  if (!c) {
    const idx = new Map<string, number>();
    const count = new Map<string, number>();
    for (const x of all) {
      if (x.task !== 'station') continue;
      const n = count.get(x.stationId) ?? 0;
      idx.set(x.id, n);
      count.set(x.stationId, n + 1);
    }
    c = { idx, stations: new Map(scn.stations.map((s) => [s.id, s])) };
    slotCache.set(all, c);
  }
  const st = c.stations.get(u.stationId);
  if (!st) return u;
  const i = c.idx.get(u.id) ?? 0;
  const col = i % 3;
  const row = Math.floor(i / 3);
  return { x: st.x + ((col - 1) * 58) / scale, y: st.y + (24 + row * 19) / scale };
}

function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, bold = false) {
  ctx.font = `${bold ? 'bold ' : ''}11px "Segoe UI", sans-serif`;
  ctx.textAlign = 'center';
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

function ring(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.strokeStyle = '#ff006e';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function niceNumber(x: number): number {
  const exp = Math.pow(10, Math.floor(Math.log10(x)));
  const f = x / exp;
  return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * exp;
}

// ---------- Kartenkacheln ----------
type Tile = { img: HTMLImageElement; ok: boolean; fails: number; retryAt: number; used: number };
const tileCache = new Map<string, Tile>();
let tileUse = 0;
/** Wird bei jeder fertig geladenen Kachel erhöht, damit die zwischengespeicherte Kartenebene neu gezeichnet wird */
let tileVersion = 0;
const EARTH = 2 * Math.PI * 6378137;

function loadTile(url: string, t: Tile) {
  const img = new Image();
  img.onload = () => {
    if (t.img !== img) return;
    t.ok = true;
    t.fails = 0;
    tileVersion++;
  };
  img.onerror = () => {
    if (t.img !== img) return;
    // Später erneut versuchen (2 s, 4 s, 8 s … höchstens 1 min), statt die Kachel für immer leer zu lassen
    t.fails++;
    t.retryAt = performance.now() + Math.min(60000, 1000 * 2 ** t.fails);
  };
  t.img = img;
  img.src = url;
}

function getTile(url: string) {
  let t = tileCache.get(url);
  if (!t) {
    t = { img: null as unknown as HTMLImageElement, ok: false, fails: 0, retryAt: 0, used: 0 };
    loadTile(url, t);
    tileCache.set(url, t);
    if (tileCache.size > 800) {
      // Am längsten unbenutzte Kacheln verwerfen
      const old = [...tileCache.entries()].sort((a, b) => a[1].used - b[1].used).slice(0, 200);
      for (const [k] of old) tileCache.delete(k);
    }
  } else if (!t.ok && t.retryAt && performance.now() >= t.retryAt) {
    t.retryAt = 0;
    loadTile(url, t);
  }
  t.used = ++tileUse;
  return t;
}

/** Bereits geladene Kachel aus dem Zwischenspeicher, ohne einen Download anzustoßen */
function peekTile(url: string) {
  const t = tileCache.get(url);
  if (!t?.ok) return null;
  t.used = ++tileUse;
  return t.img;
}

function tileUrl(tpl: string, z: number, x: number, y: number) {
  const n = 2 ** z;
  x = ((x % n) + n) % n;
  const sub = 'abc'[(x + y) % 3];
  return tpl.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y)).replace('{s}', sub);
}

/** Zeichnet OSM-Kacheln passend zur lokalen Projektion; false, wenn das Szenario keinen Erdbezug hat */
function drawTiles(
  ctx: CanvasRenderingContext2D,
  scn: Scenario,
  v: { cx: number; cy: number; scale: number },
  w: number,
  h: number,
  tpl: string,
  toScreen: (p: Vec) => [number, number],
): boolean {
  const geo = scn.geo;
  if (!geo) return false;
  const k = Math.cos((geo.lat0 * Math.PI) / 180);
  // Bildschirmpixel pro Mercator-Meter = scale / k; Kachelpixel pro Mercator-Meter = 256 * 2^z / EARTH
  const z = Math.max(1, Math.min(19, Math.round(Math.log2((v.scale / k) * EARTH / 256))));
  const n = 2 ** z;
  const tl = localToMercator(geo, { x: v.cx - w / 2 / v.scale, y: v.cy - h / 2 / v.scale });
  const br = localToMercator(geo, { x: v.cx + w / 2 / v.scale, y: v.cy + h / 2 / v.scale });
  const tx = (mx: number) => ((mx + EARTH / 2) / EARTH) * n;
  const ty = (my: number) => ((EARTH / 2 - my) / EARTH) * n;
  const xs = Math.floor(tx(tl.mx));
  const xe = Math.floor(tx(br.mx));
  const ys = Math.floor(ty(tl.my));
  const ye = Math.floor(ty(br.my));
  if ((xe - xs + 1) * (ye - ys + 1) > 120) return false;

  // Bildschirmrechteck einer Kachel (z, x, y)
  const rect = (zz: number, x: number, y: number) => {
    const tileM = EARTH / 2 ** zz;
    const mx = x * tileM - EARTH / 2;
    const my = EARTH / 2 - y * tileM;
    const [sx, sy] = toScreen(mercatorToLocal(geo, mx, my));
    const [ex, ey] = toScreen(mercatorToLocal(geo, mx + tileM, my - tileM));
    return [sx, sy, ex - sx + 0.5, ey - sy + 0.5] as const;
  };

  let drawn = 0;
  let pending = false;
  for (let x = xs; x <= xe; x++) {
    for (let y = ys; y <= ye; y++) {
      if (y < 0 || y >= n) continue;
      const t = getTile(tileUrl(tpl, z, x, y));
      const [dx, dy, dw, dh] = rect(z, x, y);
      if (t.ok) {
        ctx.drawImage(t.img, dx, dy, dw, dh);
        drawn++;
        continue;
      }
      if (!t.fails) pending = true;
      // Solange die Kachel noch lädt: vergrößerten Ausschnitt einer gröberen Zoomstufe zeigen …
      let filled = false;
      for (let d = 1; d <= 6 && z - d >= 1 && !filled; d++) {
        const f = 2 ** d;
        const px = Math.floor(x / f);
        const py = Math.floor(y / f);
        const img = peekTile(tileUrl(tpl, z - d, px, py));
        if (!img) continue;
        const s = 256 / f;
        ctx.drawImage(img, (x - px * f) * s, (y - py * f) * s, s, s, dx, dy, dw, dh);
        filled = true;
      }
      // … oder die feineren Kacheln, die beim Herauszoomen schon da sind
      if (!filled && z < 19) {
        for (let i = 0; i < 4; i++) {
          const cx = x * 2 + (i & 1);
          const cy = y * 2 + (i >> 1);
          const img = peekTile(tileUrl(tpl, z + 1, cx, cy));
          if (!img) continue;
          const [cx0, cy0, cw, ch] = rect(z + 1, cx, cy);
          ctx.drawImage(img, cx0, cy0, cw, ch);
          filled = true;
        }
      }
      if (filled) drawn++;
    }
  }
  // Ohne Internet bleibt die eigene Kartendarstellung; während des ersten Ladens nicht auf sie umspringen
  return drawn > 0 || pending;
}
