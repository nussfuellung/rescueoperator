// Online-Sitzung im Spiel: Beitrittscode anzeigen, der Host stellt Sichtbarkeit und Spielerzahl ein.
import { useState } from 'react';
import { MAX_SPIELER_ONLINE, type Sichtbarkeit, type SitzungInfo } from '../../../shared/protocol';
import { conn, useNet } from '../net';

/** Einstellungen der Sitzung; nur der Host kann sie ändern */
export function SitzungEinstellungen({ sitzung }: { sitzung: SitzungInfo }) {
  const net = useNet();
  const istHost = !!net.playerId && net.playerId === sitzung.hostId;
  const [kopiert, setKopiert] = useState(false);
  return (
    <div>
      <div className="row">
        Beitrittscode: <b style={{ fontFamily: 'Consolas, monospace', fontSize: 16, letterSpacing: 1 }}>{sitzung.code}</b>
        <button
          className="small-btn"
          onClick={() => {
            void navigator.clipboard?.writeText(sitzung.code).then(() => {
              setKopiert(true);
              setTimeout(() => setKopiert(false), 1500);
            });
          }}
        >
          {kopiert ? 'Kopiert ✓' : 'Kopieren'}
        </button>
      </div>
      <div className="row">
        <label className="grow">
          Sichtbarkeit
          <select
            value={sitzung.sichtbarkeit}
            disabled={!istHost}
            onChange={(e) => conn.sitzungAendern({ sichtbarkeit: e.target.value as Sichtbarkeit })}
          >
            <option value="offen">Offen: in der Liste, jeder kann beitreten</option>
            <option value="privat">Privat: nur mit Beitrittscode</option>
          </select>
        </label>
        <label>
          Max. Spieler
          <select value={sitzung.maxSpieler} disabled={!istHost} onChange={(e) => conn.sitzungAendern({ maxSpieler: Number(e.target.value) })}>
            {Array.from({ length: MAX_SPIELER_ONLINE }, (_, i) => i + 1)
              .filter((n) => n >= sitzung.spieler)
              .map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
          </select>
        </label>
      </div>
      <p className="small muted">
        {sitzung.spieler} von {sitzung.maxSpieler} Plätzen belegt · Host: {sitzung.hostName}
        {!istHost && ' (nur der Host kann die Einstellungen ändern)'}
      </p>
    </div>
  );
}

/** Kurzinfo in der Kopfleiste mit aufklappbaren Einstellungen */
export function SitzungKopf({ sitzung }: { sitzung: SitzungInfo }) {
  const [offen, setOffen] = useState(false);
  return (
    <div className="menu-anchor">
      <button onClick={() => setOffen(!offen)} title="Online-Sitzung: Beitrittscode und Einstellungen">
        🌐 {sitzung.code} · {sitzung.spieler}/{sitzung.maxSpieler}
        {sitzung.sichtbarkeit === 'privat' ? ' 🔒' : ''}
      </button>
      {offen && (
        <div className="dropdown" style={{ minWidth: 360 }}>
          <b>{sitzung.name}</b>
          <SitzungEinstellungen sitzung={sitzung} />
          <button onClick={() => setOffen(false)}>Schließen</button>
        </div>
      )}
    </div>
  );
}
