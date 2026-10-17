// Bedienelemente für die Spracheingabe: Sprechtaste und Live-Anzeige.
import { useSettings } from '../settings';
import { speechInput, useSpeechInput } from './stt';

/** Gedrückt halten zum Sprechen; zeigt den gerade erkannten Text */
export function MicButton({ targetId, label = 'Sprechen' }: { targetId: string; label?: string }) {
  const s = useSpeechInput();
  const settings = useSettings();
  if (!settings.sttEnabled) return null;
  const mine = s.targetId === targetId;
  const live = mine && s.listening;
  return (
    <div className="mic">
      <button
        type="button"
        className={`mic-btn ${live ? 'live' : ''}`}
        disabled={s.status !== 'bereit'}
        title={s.status === 'bereit' ? `Gedrückt halten oder Taste ${settings.pttKey}` : `Spracheingabe: ${s.status}${s.error ? ' – ' + s.error : ''}`}
        onMouseDown={() => speechInput.setPtt(true)}
        onMouseUp={() => speechInput.setPtt(false)}
        onMouseLeave={() => speechInput.setPtt(false)}
      >
        🎤 {s.status === 'bereit' ? (live ? 'Höre zu…' : label) : s.status === 'lädt' ? 'Modell lädt…' : 'Spracheingabe aus'}
        {live && <span className="level" style={{ width: `${Math.min(100, s.level * 250)}%` }} />}
      </button>
      {mine && s.partial && <span className="partial">„{s.partial}“</span>}
    </div>
  );
}
