// Sprechtaste auf dem gekoppelten Tablet: Der Rechner hört über sein Mikrofon zu.
import { useEffect, useRef, useState } from 'react';
import type { PublicState } from '../../../shared/types';
import { speechInput, useSpeechInput, useSpeechTarget } from '../audio/stt';
import { useSettings } from '../settings';
import { conn } from '../net';
import type { PanelId } from '../Popout';

/** So lange gilt ein Drücken ohne Auffrischen vom Tablet (WLAN weg, Tablet gesperrt) */
const PTT_WATCHDOG_MS = 12000;
/** So oft frischt das Tablet eine gedrückte Sprechtaste auf */
export const PTT_REFRESH_MS = 4000;

/** Rechner-Seite: meldet dem Tablet, ob die Spracheingabe bereit ist, und folgt seiner Sprechtaste */
export function useGeraetSprache(state: PublicState | undefined, me: string | undefined, remote: PanelId[], tonAmPc: boolean) {
  const stt = useSpeechInput();
  const settings = useSettings();
  const bereit = settings.sttEnabled && stt.status === 'bereit';
  const g = state?.players.find((p) => p.id === me)?.geraet;
  const online = !!state;

  useEffect(() => {
    if (online) conn.send({ a: 'geraet', sttBereit: bereit });
  }, [bereit, online]);
  useEffect(() => {
    if (online) conn.send({ a: 'geraet', tonAmPc });
  }, [tonAmPc, online]);

  // Sprechtaste des Tablets; ohne Auffrischen lässt der Rechner sie selbst los
  const held = useRef(false);
  useEffect(() => {
    const on = !!g?.ptt;
    if (on !== held.current) {
      held.current = on;
      speechInput.setPtt(on);
    }
    if (!on) return;
    const t = setTimeout(() => {
      held.current = false;
      speechInput.setPtt(false);
    }, PTT_WATCHDOG_MS);
    return () => clearTimeout(t);
  }, [g?.ptt, g?.pttSeq]);
  useEffect(
    () => () => {
      if (held.current) speechInput.setPtt(false);
    },
    [],
  );

  // Liegt das Telefon auf dem Tablet, fehlt hier die Gesprächsmaske: Ziel für das laufende Gespräch selbst anmelden
  const call = remote.includes('calls') ? state?.calls.find((c) => c.state === 'active' && c.takerId === me && c.kind === '112') : undefined;
  useSpeechTarget(
    `call-${call?.id}`,
    50,
    call ? (spoken) => conn.send({ a: 'ask', callId: call.id, question: 'was', text: spoken }) : null,
    true,
  );
  // Auf dem Tablet gewähltes Fahrzeug bekommt den Funkspruch, solange dort gesprochen wird (plus Nachlauf der Erkennung)
  const [unitId, setUnitId] = useState<string | undefined>();
  useEffect(() => {
    if (g?.ptt) {
      setUnitId(g.pttUnitId);
      return;
    }
    const t = setTimeout(() => setUnitId(undefined), 2000);
    return () => clearTimeout(t);
  }, [g?.ptt, g?.pttUnitId]);
  useSpeechTarget(`geraet-unit-${unitId}`, 35, unitId ? (spoken) => conn.send({ a: 'radio', unitId, text: spoken }) : null);
}
