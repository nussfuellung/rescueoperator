// Notrufabfrage: Anrufliste, Gesprächsführung und Einsatzformular.
import { useEffect, useMemo, useRef, useState } from 'react';
import { formatDuration } from '../../../shared/catalog';
import { geocode, nearestObject, nearestTown, reverseGeocode, searchObjects, streetDirectory } from '../../../shared/geo';
import type { AddressHit, ObjectHit } from '../../../shared/geo';
import { computeProposal, freeUnitTimes } from '../../../shared/dispatch';
import { aaoMitSchlagwort, findSchlagwort, formatSchlagwort, schlagwortByNr, searchSchlagworte } from '../../../shared/schlagworte';
import { SchlagwortSelect } from './SchlagwortSelect';
import { HospitalSelect } from './Ivena';
import { ZubuchenDialog } from './ZubuchenDialog';
import { S8Tag } from './S8Tag';
import { decodePzc, pzcText, zielFach } from '../../../shared/pzc';
import type { CallState, IncidentState, QuestionId, Vec } from '../../../shared/types';
import { conn } from '../net';
import type { GameCtx } from './GameScreen';
import { useSpeechTarget } from '../audio/stt';
import { MicButton } from '../audio/SpeechUi';

const QUESTIONS: { id: QuestionId; label: string; key: string }[] = [
  { id: 'wo', label: 'Wo?', key: '1' },
  { id: 'was', label: 'Was ist passiert?', key: '2' },
  { id: 'wieviele', label: 'Wie viele?', key: '3' },
  { id: 'zustand', label: 'Zustand?', key: '4' },
  { id: 'gefahr', label: 'Gefahren?', key: '5' },
  { id: 'wer', label: 'Name?', key: '6' },
  { id: 'tcpr', label: 'T-Reanimation', key: '7' },
  { id: 'beruhigen', label: 'Beruhigen', key: '8' },
  { id: 'alter', label: 'Alter?', key: '9' },
  { id: 'atmung', label: 'Atmung?', key: 'q' },
  { id: 'bewusstsein', label: 'Wach?', key: 'w' },
  { id: 'seitwann', label: 'Seit wann?', key: 'e' },
  { id: 'vorerkrankung', label: 'Vorerkrankungen?', key: 'r' },
  { id: 'zugang', label: 'Stockwerk / Zugang', key: 't' },
  { id: 'rueckruf', label: 'Rückrufnummer', key: 'z' },
  { id: 'ortbestaetigen', label: 'Adresse rückbestätigen', key: '0' },
  { id: 'verabschieden', label: 'Ich schicke Ihnen jemand', key: 'u' },
];

export function CallPanel({ ctx }: { ctx: GameCtx }) {
  const { state } = ctx;
  const calls = state.calls;
  const ringing = calls.filter((c) => c.state === 'ringing').sort((a, b) => a.ringStart - b.ringStart);
  const mine = calls.find((c) => c.state === 'active' && c.takerId === ctx.me && c.kind === '112');
  const myBma = calls.filter((c) => c.state === 'active' && c.takerId === ctx.me && (c.kind === 'bma' || c.kind === 'kvb') && !c.incidentId);
  const myRtw = calls.filter((c) => c.state === 'active' && c.takerId === ctx.me && c.kind === 'rtw');
  const others = calls.filter((c) => c.state === 'active' && c.takerId !== ctx.me);
  const setBmaCall = ctx.setFormCallId;

  // Leertaste nimmt den ältesten Anruf an
  const firstRinging = ringing[0];
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'F2' && firstRinging) {
        e.preventDefault();
        conn.send({ a: 'answerCall', callId: firstRinging.id });
        if (firstRinging.kind === 'bma' || firstRinging.kind === 'kvb') setBmaCall(firstRinging.id);
        if (firstRinging.kvb) ctx.focus(firstRinging.kvb, 0.6);
        if (firstRinging.aml) ctx.focus(firstRinging.aml, Math.max(0.15, Math.min(1.5, 90 / firstRinging.aml.acc)));
        if (firstRinging.bma) ctx.focus(firstRinging.bma, 0.6);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [firstRinging?.id]);

  return (
    <div className="panel calls">
      <div className="panel-title">
        Notrufabfrage <span className="muted small">F2 = Anruf annehmen</span>
      </div>
      <div className="call-list">
        {ringing.length === 0 && !mine && <div className="muted small pad">Keine wartenden Anrufe.</div>}
        {ringing.map((c) => (
          <div key={c.id} className={`call-row ringing ${c.kind}${c.polizei ? ' pol' : ''}`}>
            <div>
              <b>{c.kind === 'bma' ? 'BMA' : c.kind === 'kvb' ? 'KVB' : c.kind === 'rtw' ? 'RTW' : c.polizei ? 'POL' : '112'}</b>{' '}
              {c.kind === 'bma' ? c.bma?.text : c.kind === 'kvb' ? c.kvb?.text : c.kind === 'rtw' ? `${c.phone} · Patientenanmeldung` : c.phone}
              <div className="muted small">
                klingelt seit {formatDuration(state.time - c.ringStart)}
                {c.aml ? ' · AML-Ortung vorhanden' : ''}
                {c.polizei ? ' · Streife vor Ort' : ''}
                {c.transcript[0]?.from === 'system' && c.kind === '112' ? ' · Wiederholungsanruf' : ''}
              </div>
            </div>
            <button
              className="primary"
              onClick={() => {
                conn.send({ a: 'answerCall', callId: c.id });
                if (c.kind === 'bma' || c.kind === 'kvb') setBmaCall(c.id);
                if (c.kvb) ctx.focus(c.kvb, 0.6);
                if (c.aml) ctx.focus(c.aml, Math.max(0.15, Math.min(1.5, 90 / c.aml.acc)));
                if (c.bma) ctx.focus(c.bma, 0.6);
              }}
            >
              Annehmen
            </button>
          </div>
        ))}
        {myBma.map((c) => (
          <div key={c.id} className="call-row bma">
            <div>
              <b>{c.kind === 'kvb' ? 'KVB' : 'BMA'}</b> {c.bma?.address ?? c.kvb?.address}
            </div>
            {c.kind === 'kvb' && ctx.mobile ? (
              <span className="small muted">Einsatz am Rechner anlegen</span>
            ) : ctx.mobile ? (
              <button
                className="primary"
                onClick={() =>
                  conn.send({
                    a: 'createIncident',
                    callId: c.id,
                    stichwort: 'B BMA',
                    schlagwort: formatSchlagwort(schlagwortByNr('#B1710')!),
                    address: c.bma!.address,
                    x: c.bma!.x,
                    y: c.bma!.y,
                    objekt: c.bma!.text.replace(/^BMA-Auslösung\s*/, '').replace(/,.*$/, ''),
                    note: '',
                    patients: 0,
                    alarmAao: true,
                  })
                }
              >
                Anlegen und alarmieren
              </button>
            ) : (
              <button onClick={() => setBmaCall(c.id)}>Einsatz anlegen</button>
            )}
          </div>
        ))}
        {myRtw.map((c) => {
          const u = ctx.state.units.find((x) => x.id === c.rtw!.unitId);
          const d = decodePzc(c.rtw!.pzc);
          return (
            <div key={c.id} className="call-row rtw">
              <div className="grow">
                <b>{c.phone}</b>
                <div className="transcript small">
                  {c.transcript
                    .filter((l) => l.from !== 'system')
                    .map((l, i) => (
                      <div key={i} className={`line ${l.from}`}>
                        {l.text}
                      </div>
                    ))}
                  {c.typing && <div className="line caller typing">Besatzung spricht…</div>}
                </div>
                <div className="small">
                  PZC <code>{c.rtw!.pzc}</code> {pzcText(c.rtw!.pzc)}
                  {d && <span className="muted"> · benötigt {zielFach(d.fach, ctx.scn.hospitals)}</span>}
                </div>
                <div className="row">
                  {u && u.task === 'awaitHospital' && !u.hospitalId && <HospitalSelect ctx={ctx} u={u} />}
                  {u?.hospitalId && <span className="small">Zielklinik: {ctx.scn.hospitals.find((h) => h.id === u.hospitalId)?.name}</span>}
                  {ctx.openIvena && <button onClick={ctx.openIvena}>IVENA öffnen</button>}
                  <button className="danger" onClick={() => conn.send({ a: 'endCall', callId: c.id })}>
                    Auflegen
                  </button>
                </div>
              </div>
            </div>
          );
        })}
        {others.map((c) => (
          <div key={c.id} className="call-row other">
            <div className="small">
              Gespräch {c.phone} bei {state.players.find((p) => p.id === c.takerId)?.name ?? '–'}
            </div>
          </div>
        ))}
      </div>

      {mine && <Conversation ctx={ctx} call={mine} />}
    </div>
  );
}

/** Einsatzmaske: eigenständiger Bereich, lässt sich getrennt von der Notrufabfrage auslagern */
export function IncidentFormPanel({ ctx }: { ctx: GameCtx }) {
  const calls = ctx.state.calls;
  const mine = calls.find((c) => c.state === 'active' && c.takerId === ctx.me && c.kind === '112');
  // Eine am Tablet angenommene BMA öffnet die Einsatzmaske am Rechner
  const formCall =
    (mine && !mine.incidentId ? mine : undefined) ??
    calls.find((c) => c.id === ctx.formCallId && !c.incidentId) ??
    calls.find((c) => (c.kind === 'bma' || c.kind === 'kvb') && c.state === 'active' && c.takerId === ctx.me && !c.incidentId);
  const showForm = !!formCall || ctx.formManual;
  return (
    <div className="panel einsatzmaske">
      <div className="panel-title">Einsatzmaske</div>
      {!showForm && (
        <button className="manual-btn" onClick={() => ctx.setFormManual(true)}>
          + Einsatz ohne Anruf anlegen
        </button>
      )}
      {showForm && (
        <IncidentForm
          key={formCall?.id ?? 'manual'}
          ctx={ctx}
          call={formCall}
          onDone={() => {
            ctx.setFormManual(false);
            ctx.setFormCallId(null);
          }}
        />
      )}
    </div>
  );
}

function Conversation({ ctx, call }: { ctx: GameCtx; call: CallState }) {
  const [text, setText] = useState('');
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    box.current?.scrollTo(0, box.current.scrollHeight);
  }, [call.transcript.length, call.typing]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const q = QUESTIONS.find((x) => x.key === e.key);
      if (q && e.altKey) conn.send({ a: 'ask', callId: call.id, question: q.id });
    };
    const win = box.current?.ownerDocument.defaultView ?? window;
    win.addEventListener('keydown', onKey);
    return () => win.removeEventListener('keydown', onKey);
  }, [call.id]);

  // Gesprochene Fragen gehen direkt an den Anrufer
  useSpeechTarget(`call-${call.id}`, 50, (spoken) => conn.send({ a: 'ask', callId: call.id, question: 'was', text: spoken }), true);

  return (
    <div className="conversation">
      <div className="conv-head">
        <span>
          Gespräch mit <b>{call.phone}</b> · {formatDuration(ctx.state.time - (call.answeredAt ?? call.ringStart))}
        </span>
        {call.aml && (
          <button className="small-btn" onClick={() => ctx.focus(call.aml!, Math.max(0.15, Math.min(1.5, 90 / call.aml!.acc)))}>
            AML zeigen (±{call.aml.acc} m)
          </button>
        )}
      </div>
      <div className="transcript" ref={box}>
        {call.transcript.map((l, i) => (
          <div key={i} className={`line ${l.from}`}>
            {l.text}
          </div>
        ))}
        {call.typing && <div className="line caller typing">Anrufer spricht…</div>}
      </div>
      {call.incidentId && (
        <div className="ok small">
          Einsatz {ctx.state.incidents.find((i) => i.id === call.incidentId)?.nr} angelegt. Gespräch kann beendet werden.
        </div>
      )}
      <div className="questions">
        {QUESTIONS.map((q) => (
          <button
            key={q.id}
            className={call.asked.includes(q.id) ? 'asked' : ''}
            title={`Alt+${q.key}`}
            onClick={() => conn.send({ a: 'ask', callId: call.id, question: q.id })}
          >
            {q.label}
          </button>
        ))}
      </div>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim()) return;
          conn.send({ a: 'ask', callId: call.id, question: 'was', text });
          setText('');
        }}
      >
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Eigene Frage an den Anrufer…" />
        <button type="submit">Fragen</button>
      </form>
      <MicButton targetId={`call-${call.id}`} label="Frage sprechen" />
      {!call.incidentId && (
        <button onClick={() => conn.send({ a: 'transferKvb', callId: call.id })} title="Kein Notfall: an den ärztlichen Bereitschaftsdienst weiterverbinden">
          An KVB 116117
        </button>
      )}
      <button className="danger" onClick={() => conn.send({ a: 'endCall', callId: call.id })}>
        Gespräch beenden
      </button>
    </div>
  );
}

function IncidentForm({ ctx, call, onDone }: { ctx: GameCtx; call?: CallState; onDone: () => void }) {
  const { scn, graph, state } = ctx;
  const streets = useMemo(() => streetDirectory(scn), [scn]);
  const [street, setStreet] = useState('');
  const [number, setNumber] = useState('');
  const [address, setAddress] = useState('');
  const [pos, setPos] = useState<Vec | null>(null);
  const [posSource, setPosSource] = useState('');
  const [zusatz, setZusatz] = useState('');
  const [objekt, setObjekt] = useState('');
  // Trefferliste der Objektsuche nur beim Tippen ins Objektfeld zeigen
  const [objOpen, setObjOpen] = useState(false);
  const [objSel, setObjSel] = useState(0);
  // Objekt wurde automatisch aus dem Einsatzort vorgeschlagen und darf ersetzt werden
  const objAuto = useRef(true);
  const [stichwort, setStichwort] = useState('');
  const [swQuery, setSwQuery] = useState('');
  const [schlagwort, setSchlagwort] = useState('');
  const [sondersignal, setSondersignal] = useState(true);
  // Polizei gleich mit dem ersten Alarm verständigen; ruft die Streife selbst an, ist sie schon vor Ort
  const [polizei, setPolizei] = useState(false);
  const polizeiVorOrt = !!call?.polizei;
  const [patients, setPatients] = useState(0);
  const [patient, setPatient] = useState('');
  const [melder, setMelder] = useState(call?.polizei ? `Polizei, Streife ${call.polizei}` : '');
  const [rueckruf, setRueckruf] = useState(call && call.kind === '112' ? call.phone : '');
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [unchecked, setUnchecked] = useState<Set<string>>(new Set());
  // Zusätzlich zum Vorschlag zugebuchte Fahrzeuge
  const [extra, setExtra] = useState<string[]>([]);
  const [zubuchen, setZubuchen] = useState(false);
  const codes = useMemo(() => new Set(scn.stichworte.map((s) => s.code)), [scn]);
  const swHits = useMemo(() => searchSchlagworte(swQuery, codes), [swQuery, codes]);
  const objHits = useMemo(() => (objOpen ? searchObjects(scn, objekt) : []), [scn, objekt, objOpen]);
  // Bei echten Karten gibt es tausende Straßen: nur passende Vorschläge anbieten
  const streetOptions = useMemo(() => {
    const q = street.toLowerCase().trim();
    if (streets.length < 400) return streets;
    if (q.length < 2) return [];
    return streets.filter((s) => s.label.toLowerCase().includes(q)).slice(0, 60);
  }, [streets, street]);

  // Straße/Nr. aus Ortung oder Kartenklick lösen keine erneute Adresssuche aus
  const skipAutoSearch = useRef(false);
  const fillAddress = (hit: AddressHit) => {
    const s = hit.road.type === 'ortsstrasse' || hit.houseNumber ? `${hit.street}, ${hit.town}` : hit.street;
    const n = hit.houseNumber ?? (hit.number ? String(hit.number) : '');
    // Nur sperren, wenn sich die Felder wirklich ändern, sonst bliebe die Sperre für die nächste Eingabe stehen
    if (s === street && n === number) return;
    skipAutoSearch.current = true;
    setStreet(s);
    setNumber(n);
  };
  const applyPos = (p: Vec, source: string, label?: string) => {
    const hit = reverseGeocode(scn, p);
    const point = hit && hit.distance < 300 ? hit.point : p;
    setPos(point);
    setPosSource(source);
    setAddress(label ?? hit?.text ?? `${Math.round(p.x)}/${Math.round(p.y)}`);
    if (hit) fillAddress(hit);
    // Objekt in der Nähe vorschlagen (am angeklickten bzw. georteten Punkt, nicht an der Hausnummer);
    // ein von Hand eingetragenes Objekt bleibt stehen
    if (objAuto.current) setObjekt(nearestObject(scn, p)?.name ?? '');
    ctx.setMarker(point);
    ctx.focus(point, 0.6);
  };

  // Objekt aus der Suche übernehmen: Einsatzort ist das Objekt selbst, Adresse dazu aus der Umgebung
  const pickObject = (h: ObjectHit) => {
    const p = { x: h.obj.x, y: h.obj.y };
    const hit = reverseGeocode(scn, p);
    objAuto.current = false;
    setObjekt(h.obj.name);
    setObjOpen(false);
    setErr('');
    setPos(p);
    setPosSource('Objektsuche');
    setAddress(`${h.obj.name}, ${hit && hit.distance < 300 ? hit.text : h.town}`);
    if (hit && hit.distance < 300) fillAddress(hit);
    ctx.setMarker(p);
    ctx.focus(p, 0.6);
  };

  const takeAml = () => call?.aml && applyPos(call.aml, `AML ±${call.aml.acc} m`);

  // BMA: Daten aus der Alarmübertragung übernehmen; AML: Karte springt zur Ortung
  useEffect(() => {
    if (call?.bma) {
      applyPos(call.bma, 'BMA-Übertragung', call.bma.address);
      setStichwort('B BMA');
      setSchlagwort(formatSchlagwort(schlagwortByNr('#B1710')!));
      setObjekt(call.bma.text.replace(/^BMA-Auslösung\s*/, '').replace(/,.*$/, ''));
      objAuto.current = false;
    } else if (call?.kvb) {
      applyPos(call.kvb, 'KVB-Übergabe', call.kvb.address);
      setNote(call.kvb.text.replace(/^Übergabe KVB 116117:\s*/, ''));
      setMelder('KVB 116117');
      setRueckruf('116117');
    } else if (call?.aml) {
      ctx.focus(call.aml, Math.max(0.15, Math.min(1.5, 90 / call.aml.acc)));
    } else if (call?.landline) {
      ctx.focus(call.landline, 0.6);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [call?.id, !!call?.aml]);

  // Kartenklick setzt den Einsatzort, solange das Formular offen ist; Alt+A übernimmt die AML, Alt+Z bucht Fahrzeuge zu
  const posRef = useRef(pos);
  posRef.current = pos;
  useEffect(() => {
    ctx.mapPickRef.current = (p) => applyPos(p, 'Kartenklick');
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault();
        takeAml();
      }
      if (e.altKey && (e.key === 'z' || e.key === 'Z') && posRef.current) {
        e.preventDefault();
        setZubuchen(true);
      }
      if (e.altKey && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        setPolizei((x) => !x);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      ctx.mapPickRef.current = null;
      ctx.setMarker(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [call?.aml]);

  const search = (silent = false) => {
    const [s, town] = street.split(',').map((x) => x.trim());
    if (!s) return;
    const hit = geocode(scn, s, town ?? '', number.trim() || undefined);
    if (!hit) {
      if (!silent) setErr('Adresse nicht gefunden. Straße aus der Liste wählen oder in die Karte klicken.');
      return;
    }
    setErr('');
    setPos(hit.point);
    setPosSource('Adresssuche');
    setAddress(hit.text);
    if (objAuto.current) setObjekt(nearestObject(scn, hit.point)?.name ?? '');
    ctx.setMarker(hit.point);
    ctx.focus(hit.point, 0.6);
  };

  // Sobald eine bekannte Straße (und ggf. Hausnummer) dasteht, Einsatzort ohne Enter setzen
  useEffect(() => {
    if (skipAutoSearch.current) {
      skipAutoSearch.current = false;
      return;
    }
    const label = street.trim().toLowerCase();
    const known = streets.some((s) => s.label.toLowerCase() === label) || streets.filter((s) => s.street.toLowerCase() === label).length === 1;
    if (!label || !known) return;
    const t = setTimeout(() => search(true), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [street, number]);

  // Zuständigkeit und mögliche Doppelalarmierung
  const area = useMemo(() => {
    if (!pos) return null;
    const near = (kind: 'feuerwache' | 'rettungswache') =>
      scn.stations.filter((s) => s.kind === kind).sort((a, b) => Math.hypot(a.x - pos.x, a.y - pos.y) - Math.hypot(b.x - pos.x, b.y - pos.y))[0];
    const town = nearestTown(scn.towns, pos)?.name;
    const dup = state.incidents.filter((i) => i.status !== 'abgeschlossen' && Math.hypot(i.x - pos.x, i.y - pos.y) < 300);
    return { fw: near('feuerwache'), rw: near('rettungswache'), town, dup };
  }, [pos, scn, state.incidents.length]);

  // Alarmierungsvorschlag schon vor dem Anlegen
  const sw = scn.stichworte.find((s) => s.code === stichwort);
  const proposal = useMemo(() => {
    if (!pos || !sw) return [];
    const draft = { id: '_entwurf', x: pos.x, y: pos.y } as IncidentState;
    return computeProposal(scn, graph, state.units, draft, aaoMitSchlagwort(sw.aao, schlagwort), state.time);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos, stichwort, schlagwort, Math.floor(state.time / 10000)]);
  // Freie Fahrzeuge mit Fahrzeit, nur solange gebucht wird oder Zugebuchte angezeigt werden
  const free = useMemo(() => {
    if (!pos || (!zubuchen && !extra.length)) return [];
    return freeUnitTimes(scn, graph, state.units, pos, state.time);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos, zubuchen, extra.length > 0, Math.floor(state.time / 10000)]);
  const proposalIds = new Set(proposal.map((p) => p.unitId));
  // Zwischenzeitlich anderweitig gebundene Fahrzeuge fallen heraus
  const extraRows = free.filter((x) => extra.includes(x.u.id) && !proposalIds.has(x.u.id));
  const alarmIds = [...proposal.map((p) => p.unitId).filter((id) => !unchecked.has(id)), ...extraRows.map((x) => x.u.id)];
  const applyZubuchen = (sel: Set<string>) => {
    setUnchecked(new Set([...proposalIds].filter((id) => !sel.has(id))));
    setExtra([...sel].filter((id) => !proposalIds.has(id)));
    setZubuchen(false);
  };

  const submit = (withAlarm: boolean) => {
    if (!pos) return setErr('Bitte Einsatzort festlegen (Adresse suchen, AML übernehmen oder in die Karte klicken).');
    if (!stichwort) return setErr('Bitte ein Einsatzstichwort wählen.');
    conn.send({
      a: 'createIncident',
      callId: call?.id,
      stichwort,
      schlagwort: schlagwort || undefined,
      address: address || street,
      x: pos.x,
      y: pos.y,
      note,
      patients,
      zusatz,
      objekt,
      melder,
      rueckruf,
      patient,
      sondersignal,
      polizei: polizei && !polizeiVorOrt,
      alarmUnitIds: withAlarm ? alarmIds : undefined,
    });
    // Neuen Einsatz auswählen, sobald er im Zustand auftaucht
    const before = new Set(ctx.state.incidents.map((i) => i.id));
    const t = setInterval(() => {
      const fresh = conn.snap.state?.incidents.find((i) => !before.has(i.id));
      if (fresh) {
        ctx.setSelectedIncident(fresh.id);
        clearInterval(t);
      }
    }, 150);
    setTimeout(() => clearInterval(t), 3000);
    onDone();
  };

  const groups = ['RD', 'B', 'THL', 'ABC', 'SONST'] as const;
  const unitsById = new Map(state.units.map((u) => [u.id, u]));
  return (
    <>
      <form
        className="incident-form em"
        onSubmit={(e) => e.preventDefault()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            submit(true);
          }
          // Im ausgelagerten Fenster kommt der Tastendruck nur hier an
          if (e.altKey && (e.key === 'a' || e.key === 'A') && e.currentTarget.ownerDocument !== document) {
            e.preventDefault();
            takeAml();
          }
          if (e.altKey && (e.key === 'z' || e.key === 'Z') && pos) {
            e.preventDefault();
            setZubuchen(true);
          }
          if (e.altKey && (e.key === 'p' || e.key === 'P') && e.currentTarget.ownerDocument !== document) {
            e.preventDefault();
            setPolizei((x) => !x);
          }
        }}
      >
        <div className="em-head">
          <span className="em-title">Neuer Einsatz</span>
          <span className="muted small">
            {call ? (call.kind === 'bma' ? 'BMA-Auslösung' : call.kind === 'kvb' ? 'Übergabe KVB 116117' : `Notruf ${call.phone} · ${formatDuration(state.time - (call.answeredAt ?? call.ringStart))}`) : 'ohne Anruf'}
          </span>
        </div>

        {call && call.kind === '112' && (
          <div className={`em-locate ${call.aml || call.polizei ? 'has' : ''}`}>
            {call.polizei ? (
              <>
                <span className="em-badge pol">POL</span>
                <span className="grow small">Streife {call.polizei} ist vor Ort und fordert den Rettungsdienst nach.</span>
              </>
            ) : call.aml ? (
              <>
                <span className="em-badge aml">AML</span>
                <span className="grow small">Handyortung ±{call.aml.acc} m</span>
                <button type="button" className="small-btn" onClick={() => ctx.focus(call.aml!, Math.max(0.15, Math.min(1.5, 90 / call.aml!.acc)))}>
                  Zeigen
                </button>
                <button type="button" className="small-btn primary" onClick={takeAml} title="Alt+A">
                  Übernehmen
                </button>
              </>
            ) : call.landline ? (
              <>
                <span className="em-badge fest">Festnetz</span>
                <span className="grow small">Anschluss: {call.landline.address}</span>
                <button type="button" className="small-btn primary" onClick={() => applyPos(call.landline!, 'Festnetzanschluss', call.landline!.address)}>
                  Übernehmen
                </button>
              </>
            ) : (
              <span className="muted small">Keine Ortung übermittelt, Einsatzort erfragen.</span>
            )}
          </div>
        )}

        <fieldset>
          <legend>Einsatzort</legend>
          <div className="row">
            <input
              list="streets"
              value={street}
              onChange={(e) => setStreet(e.target.value)}
              placeholder="Straße, Ort"
              className="grow"
              onKeyDown={(e) => e.key === 'Enter' && !e.ctrlKey && !e.metaKey && search()}
            />
            <input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="Nr." className="num" onKeyDown={(e) => e.key === 'Enter' && !e.ctrlKey && !e.metaKey && search()} />
            <button type="button" onClick={() => search()}>
              Suchen
            </button>
          </div>
          <datalist id="streets">
            {streetOptions.map((s) => (
              <option key={s.label} value={s.label} />
            ))}
          </datalist>
          <div className="row">
            <div className="em-obj-search grow">
              <input
                value={objekt}
                onChange={(e) => {
                  setObjekt(e.target.value);
                  objAuto.current = !e.target.value.trim();
                  setObjOpen(true);
                  setObjSel(0);
                }}
                onBlur={() => setTimeout(() => setObjOpen(false), 150)}
                onKeyDown={(e) => {
                  if (!objHits.length || e.ctrlKey || e.metaKey) return;
                  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                    e.preventDefault();
                    setObjSel((i) => (i + (e.key === 'ArrowDown' ? 1 : objHits.length - 1)) % objHits.length);
                  } else if (e.key === 'Enter') {
                    e.preventDefault();
                    pickObject(objHits[Math.min(objSel, objHits.length - 1)]);
                  } else if (e.key === 'Escape') {
                    setObjOpen(false);
                  }
                }}
                placeholder="Objekt suchen, z. B. Seniorenheim, Grundschule…"
              />
              {objHits.length > 0 && (
                <div className="em-sw-hits em-obj-hits">
                  {objHits.map((h, i) => (
                    <button
                      type="button"
                      key={h.obj.id}
                      className={i === objSel ? 'sel' : ''}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => pickObject(h)}
                    >
                      {h.obj.name}
                      <span className="muted">
                        {' '}
                        · {h.kind} · {[h.street, h.town].filter(Boolean).join(', ')}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="row">
            <input value={zusatz} onChange={(e) => setZusatz(e.target.value)} placeholder="Zusatz: Stockwerk, Hinterhaus, Klingel…" className="grow" />
          </div>
          <div className={`em-pos small ${pos ? 'ok' : 'muted'}`}>
            {pos ? (
              <>
                📍 {address}
                <span className="muted"> · {posSource}</span>
              </>
            ) : (
              'Kein Einsatzort: Adresse suchen, Ortung übernehmen oder in die Karte klicken'
            )}
          </div>
          {area && (
            <div className="em-area small muted">
              {area.town && <>Gemeinde {area.town} · </>}
              {area.fw && <>FW-Bereich {area.fw.name} · </>}
              {area.rw && <>RD-Bereich {area.rw.name}</>}
            </div>
          )}
          {area?.dup.map((i) => (
            <div key={i.id} className="em-warn small">
              ⚠ Offener Einsatz {i.nr} ({i.stichwort}) {Math.round(Math.hypot(i.x - pos!.x, i.y - pos!.y))} m entfernt: {i.address}
            </div>
          ))}
        </fieldset>

        <fieldset>
          <legend>Einsatz</legend>
          <div className="em-sw-search">
            <input value={swQuery} onChange={(e) => setSwQuery(e.target.value)} placeholder="Schlagwort suchen, z. B. Atemnot, Ölspur, VU…" />
            {swHits.length > 0 && (
              <div className="em-sw-hits">
                {swHits.map((h) => (
                  <button
                    type="button"
                    key={formatSchlagwort(h)}
                    onClick={() => {
                      setStichwort(h.code);
                      setSchlagwort(formatSchlagwort(h));
                      setSwQuery('');
                    }}
                  >
                    <b>{h.nr}</b> <b>{h.code}</b> #{h.kat}#{h.text}
                    {h.rtw ? <span className="muted"> · +{h.rtw} RTW</span> : null}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="row">
            <select
              value={stichwort}
              onChange={(e) => {
                setStichwort(e.target.value);
                if (findSchlagwort(schlagwort)?.code !== e.target.value) setSchlagwort('');
              }}
              className="grow"
            >
              <option value="">– Einsatzstichwort –</option>
              {groups.map((g) => (
                <optgroup key={g} label={{ RD: 'Rettungsdienst', B: 'Brand', THL: 'Technische Hilfe', ABC: 'ABC / Gefahrstoffe', SONST: 'Sonstiges' }[g]}>
                  {scn.stichworte
                    .filter((s) => s.category === g)
                    .map((s) => (
                      <option key={s.code} value={s.code}>
                        {s.code} – {s.label}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
            <label className="inline small">
              <input type="checkbox" checked={sondersignal} onChange={(e) => setSondersignal(e.target.checked)} />
              Sondersignal
            </label>
          </div>
          {stichwort && <SchlagwortSelect stichwort={stichwort} value={schlagwort} onChange={setSchlagwort} />}
          {schlagwort && (
            <div className="em-schlagwort">
              <code>{schlagwort}</code>
              {findSchlagwort(schlagwort)?.rtw ? <span className="small muted"> Anzahl (RTW): {findSchlagwort(schlagwort)!.rtw}</span> : null}
              <button type="button" className="small" title="Schlagwort entfernen" onClick={() => setSchlagwort('')}>
                ×
              </button>
            </div>
          )}
          <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Meldebild / Hinweise für die Einsatzkräfte" rows={2} />
        </fieldset>

        <div className="em-two">
          <fieldset>
            <legend>Patient</legend>
            <div className="row">
              <label className="inline small">
                Anzahl
                <input type="number" min={0} max={50} value={patients} onChange={(e) => setPatients(Number(e.target.value))} className="num" />
              </label>
            </div>
            <input value={patient} onChange={(e) => setPatient(e.target.value)} placeholder="Name, Alter, m/w" />
          </fieldset>
          <fieldset>
            <legend>Meldender</legend>
            <input value={melder} onChange={(e) => setMelder(e.target.value)} placeholder="Name" />
            <input value={rueckruf} onChange={(e) => setRueckruf(e.target.value)} placeholder="Rückrufnummer" />
          </fieldset>
        </div>

        {pos && (
          <fieldset>
            <legend>Alarmierungsvorschlag</legend>
            <div className="em-proposal">
              {proposal.map((p) => {
                const u = unitsById.get(p.unitId);
                if (!u) return null;
                return (
                  <label key={p.unitId} className="free-row proposed">
                    <input
                      type="checkbox"
                      checked={!unchecked.has(p.unitId)}
                      onChange={() => {
                        const n = new Set(unchecked);
                        if (n.has(p.unitId)) n.delete(p.unitId);
                        else n.add(p.unitId);
                        setUnchecked(n);
                      }}
                    />
                    <span className="cs">
                      {u.callsign} {p.s8 && <S8Tag />}
                    </span>
                    <span className="eta">{formatDuration(p.seconds * 1000)}</span>
                  </label>
                );
              })}
              {extraRows.map((x) => (
                <label key={x.u.id} className="free-row extra" title="Zugebucht">
                  <input type="checkbox" checked onChange={() => setExtra(extra.filter((id) => id !== x.u.id))} />
                  <span className="cs">
                    {x.u.callsign} <span className="em-zb-tag">zugebucht</span>
                  </span>
                  <span className="eta">{formatDuration(x.seconds * 1000)}</span>
                </label>
              ))}
              {!proposal.length && !extraRows.length && <div className="muted small">{sw ? 'Kein freies Fahrzeug für die AAO gefunden.' : 'Einsatzstichwort wählen oder Fahrzeuge zubuchen.'}</div>}
              {polizeiVorOrt ? (
                <div className="free-row pol" title="Die Polizei hat angerufen und ist bereits an der Einsatzstelle">
                  <span className="polizei-tag">Polizei vor Ort</span>
                  <span className="muted small">Streife {call!.polizei}</span>
                </div>
              ) : (
                <label className="free-row pol" title="Polizei (110) gleich mit dem Anlegen verständigen · Alt+P">
                  <input type="checkbox" checked={polizei} onChange={(e) => setPolizei(e.target.checked)} />
                  <span className="cs">🚓 Polizei verständigen</span>
                  <span className="eta muted">110</span>
                </label>
              )}
            </div>
            <button type="button" className="small-btn em-zb-btn" onClick={() => setZubuchen(true)} title="Alt+Z">
              + Fahrzeuge zubuchen…
            </button>
          </fieldset>
        )}

        {err && <div className="error small">{err}</div>}
        <div className="row">
          <button type="button" className="primary grow alarm-btn" onClick={() => submit(true)} title="Strg+Enter" disabled={!alarmIds.length}>
            Anlegen und alarmieren ({alarmIds.length})
          </button>
          <button type="button" onClick={() => submit(false)}>
            Nur anlegen
          </button>
          {!call && (
            <button type="button" onClick={onDone}>
              Abbrechen
            </button>
          )}
        </div>
      </form>
      {zubuchen && (
        <ZubuchenDialog
          scn={scn}
          free={free}
          proposalIds={proposalIds}
          selected={new Set(alarmIds)}
          onApply={applyZubuchen}
          onClose={() => setZubuchen(false)}
        />
      )}
    </>
  );
}
