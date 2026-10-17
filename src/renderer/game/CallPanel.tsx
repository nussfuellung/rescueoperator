// Notrufabfrage: Anrufliste, Gesprächsführung und Einsatzformular.
import { useEffect, useMemo, useRef, useState } from 'react';
import { formatDuration } from '../../../shared/catalog';
import { geocode, reverseGeocode, streetDirectory } from '../../../shared/geo';
import type { CallState, QuestionId, Vec } from '../../../shared/types';
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
  { id: 'wer', label: 'Name / Rückruf', key: '6' },
  { id: 'tcpr', label: 'T-Reanimation', key: '7' },
  { id: 'beruhigen', label: 'Beruhigen', key: '8' },
];

export function CallPanel({ ctx }: { ctx: GameCtx }) {
  const { state } = ctx;
  const calls = state.calls;
  const ringing = calls.filter((c) => c.state === 'ringing').sort((a, b) => a.ringStart - b.ringStart);
  const mine = calls.find((c) => c.state === 'active' && c.takerId === ctx.me && c.kind === '112');
  const myBma = calls.filter((c) => c.state === 'active' && c.takerId === ctx.me && c.kind === 'bma' && !c.incidentId);
  const others = calls.filter((c) => c.state === 'active' && c.takerId !== ctx.me);
  const [manual, setManual] = useState(false);
  const [bmaCall, setBmaCall] = useState<string | null>(null);
  const formCall = (mine && !mine.incidentId ? mine : undefined) ?? calls.find((c) => c.id === bmaCall && !c.incidentId);
  const showForm = !!formCall || manual;

  // Leertaste nimmt den ältesten Anruf an
  const firstRinging = ringing[0];
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'F2' && firstRinging) {
        e.preventDefault();
        conn.send({ a: 'answerCall', callId: firstRinging.id });
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
          <div key={c.id} className={`call-row ringing ${c.kind}`}>
            <div>
              <b>{c.kind === 'bma' ? 'BMA' : '112'}</b> {c.kind === 'bma' ? c.bma?.text : c.phone}
              <div className="muted small">
                klingelt seit {formatDuration(state.time - c.ringStart)}
                {c.aml ? ' · AML-Ortung vorhanden' : ''}
                {c.transcript[0]?.from === 'system' && c.kind === '112' ? ' · Wiederholungsanruf' : ''}
              </div>
            </div>
            <button
              className="primary"
              onClick={() => {
                conn.send({ a: 'answerCall', callId: c.id });
                if (c.kind === 'bma') setBmaCall(c.id);
                if (c.aml) ctx.focus(c.aml);
                if (c.bma) ctx.focus(c.bma);
              }}
            >
              Annehmen
            </button>
          </div>
        ))}
        {myBma.map((c) => (
          <div key={c.id} className="call-row bma">
            <div>
              <b>BMA</b> {c.bma?.address}
            </div>
            <button onClick={() => setBmaCall(c.id)}>Einsatz anlegen</button>
          </div>
        ))}
        {others.map((c) => (
          <div key={c.id} className="call-row other">
            <div className="small">
              Gespräch {c.phone} bei {state.players.find((p) => p.id === c.takerId)?.name ?? '–'}
            </div>
          </div>
        ))}
      </div>

      {mine && <Conversation ctx={ctx} call={mine} />}
      {!showForm && (
        <button className="manual-btn" onClick={() => setManual(true)}>
          + Einsatz ohne Anruf anlegen
        </button>
      )}
      {showForm && (
        <IncidentForm
          key={formCall?.id ?? 'manual'}
          ctx={ctx}
          call={formCall}
          onDone={() => {
            setManual(false);
            setBmaCall(null);
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
          <button className="small-btn" onClick={() => ctx.focus(call.aml!)}>
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
      <button className="danger" onClick={() => conn.send({ a: 'endCall', callId: call.id })}>
        Gespräch beenden
      </button>
    </div>
  );
}

function IncidentForm({ ctx, call, onDone }: { ctx: GameCtx; call?: CallState; onDone: () => void }) {
  const { scn } = ctx;
  const streets = useMemo(() => streetDirectory(scn), [scn]);
  const [street, setStreet] = useState('');
  const [number, setNumber] = useState('');
  const [address, setAddress] = useState('');
  const [pos, setPos] = useState<Vec | null>(null);
  const [stichwort, setStichwort] = useState('');
  const [patients, setPatients] = useState(0);
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');

  const applyPos = (p: Vec, label?: string) => {
    const hit = reverseGeocode(scn, p);
    setPos(hit && hit.distance < 300 ? hit.point : p);
    setAddress(label ?? hit?.text ?? `${Math.round(p.x)}/${Math.round(p.y)}`);
    if (hit) {
      setStreet(hit.road.type === 'ortsstrasse' ? `${hit.street}, ${hit.town}` : hit.street);
      setNumber(hit.houseNumber ?? (hit.number ? String(hit.number) : ''));
    }
    ctx.setMarker(hit && hit.distance < 300 ? hit.point : p);
  };

  // BMA: Daten aus der Alarmübertragung übernehmen
  useEffect(() => {
    if (call?.bma) {
      applyPos(call.bma, call.bma.address);
      setStichwort('B BMA');
    }
  }, [call?.id]);

  // Kartenklick setzt den Einsatzort, solange das Formular offen ist
  useEffect(() => {
    ctx.mapPickRef.current = (p) => applyPos(p);
    return () => {
      ctx.mapPickRef.current = null;
      ctx.setMarker(null);
    };
  }, []);

  const search = () => {
    const [s, town] = street.split(',').map((x) => x.trim());
    const hit = geocode(scn, s, town ?? '', number.trim() || undefined);
    if (!hit) {
      setErr('Adresse nicht gefunden. Straße aus der Liste wählen oder in die Karte klicken.');
      return;
    }
    setErr('');
    setPos(hit.point);
    setAddress(hit.text);
    ctx.setMarker(hit.point);
    ctx.focus(hit.point);
  };

  const submit = () => {
    if (!pos) return setErr('Bitte Einsatzort festlegen (Adresse suchen oder in die Karte klicken).');
    if (!stichwort) return setErr('Bitte ein Einsatzstichwort wählen.');
    conn.send({
      a: 'createIncident',
      callId: call?.id,
      stichwort,
      address: address || street,
      x: pos.x,
      y: pos.y,
      note,
      patients,
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

  const groups = ['RD', 'B', 'THL', 'SONST'] as const;
  return (
    <div className="incident-form">
      <div className="panel-subtitle">
        Einsatz anlegen{call ? (call.kind === 'bma' ? ' (BMA)' : ` zu Anruf ${call.phone}`) : ' (ohne Anruf)'}
      </div>
      <div className="row">
        <input
          list="streets"
          value={street}
          onChange={(e) => setStreet(e.target.value)}
          placeholder="Straße, Ort"
          className="grow"
        />
        <input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="Nr." className="num" />
        <button onClick={search}>Suchen</button>
      </div>
      <datalist id="streets">
        {streets.map((s) => (
          <option key={s.label} value={s.label} />
        ))}
      </datalist>
      <div className="row small">
        <span className={pos ? 'ok' : 'muted'}>{pos ? `📍 ${address}` : 'Kein Einsatzort – Adresse suchen oder Karte anklicken'}</span>
        {call?.aml && (
          <button className="small-btn" onClick={() => applyPos(call.aml!)}>
            AML übernehmen
          </button>
        )}
      </div>
      <select value={stichwort} onChange={(e) => setStichwort(e.target.value)}>
        <option value="">– Einsatzstichwort wählen –</option>
        {groups.map((g) => (
          <optgroup key={g} label={{ RD: 'Rettungsdienst', B: 'Brand', THL: 'Technische Hilfe', SONST: 'Sonstiges' }[g]}>
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
      <div className="row">
        <label className="inline">
          Patienten
          <input type="number" min={0} max={50} value={patients} onChange={(e) => setPatients(Number(e.target.value))} className="num" />
        </label>
      </div>
      <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Meldebild / Bemerkung für die Einsatzkräfte" rows={2} />
      {err && <div className="error small">{err}</div>}
      <div className="row">
        <button className="primary grow" onClick={submit}>
          Einsatz anlegen
        </button>
        {!call && <button onClick={onDone}>Abbrechen</button>}
      </div>
    </div>
  );
}
