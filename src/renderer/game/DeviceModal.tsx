// Kopplung eines Tablets oder Handys im selben Netz: QR-Code mit Link zur Web-App.
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { useNet } from '../net';
import type { PanelId } from '../Popout';

type Choice = 'beide' | 'telefon' | 'funk';
const PANELS: Record<Choice, PanelId[]> = { beide: ['calls', 'radio'], telefon: ['calls'], funk: ['radio'] };

export function DeviceModal(props: {
  hostInfo: { port: number; addresses: string[] } | null;
  remote: PanelId[];
  setRemote: (p: PanelId[]) => void;
  onClose: () => void;
}) {
  const net = useNet();
  const [choice, setChoice] = useState<Choice>('beide');
  const [hide, setHide] = useState(props.remote.length > 0);
  const [qr, setQr] = useState('');
  // Adressen, unter denen der Server im LAN erreichbar ist
  const server = net.url ? new URL(net.url.replace(/^ws/, 'http')) : null;
  const hosts = props.hostInfo
    ? props.hostInfo.addresses.map((a) => `${a}:${props.hostInfo!.port}`)
    : server
      ? [server.host]
      : [];
  const loopback = !!server && !props.hostInfo && /^(127\.|localhost)/.test(server.hostname);
  const [hostIdx, setHostIdx] = useState(0);
  const host = hosts[hostIdx] ?? hosts[0];
  // Online liefert der Sitzungs-Server die Web-App aus (auch über HTTPS), im LAN der Host-Rechner
  const online = !!net.sitzung;
  const proto = online && server ? server.protocol : 'http:';
  const link = host && net.linkCode ? `${proto}//${host}/?geraet=${net.linkCode}&bereiche=${choice}` : '';

  useEffect(() => {
    if (!link) return;
    QRCode.toDataURL(link, { margin: 1, width: 240, color: { dark: '#000000', light: '#ffffff' } })
      .then(setQr)
      .catch(() => setQr(''));
  }, [link]);

  useEffect(() => {
    props.setRemote(hide ? PANELS[choice] : []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hide, choice]);

  return (
    <div className="modal-bg" onClick={props.onClose}>
      <div className="modal device-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Tablet oder Handy koppeln</h2>
        <p className="small muted">
          Telefon und Funk lassen sich auf ein iPad, Android-Tablet oder Handy {online ? 'mit Internetzugang' : 'im selben WLAN'} auslagern. Das Gerät übernimmt deinen Platz: Ein dort
          angenommener Notruf erscheint hier in der Einsatzmaske, Funk und Sprechwünsche laufen über das Gerät.
        </p>
        <div className="row">
          {(
            [
              ['beide', 'Telefon und Funk'],
              ['telefon', 'Nur Telefon'],
              ['funk', 'Nur Funk'],
            ] as [Choice, string][]
          ).map(([c, label]) => (
            <label key={c} className="inline">
              <input type="radio" checked={choice === c} onChange={() => setChoice(c)} />
              {label}
            </label>
          ))}
        </div>
        {!link && (
          <p className="error small">
            {!net.linkCode
              ? 'Der Server kennt noch keine Kopplung. Bitte die Schicht neu betreten.'
              : 'Keine Netzwerkadresse gefunden. Ist der Rechner mit einem WLAN oder LAN verbunden?'}
          </p>
        )}
        {link && (
          <div className="device-pair">
            {qr && <img src={qr} alt="QR-Code zum Koppeln" width={240} height={240} />}
            <div className="device-steps small">
              <ol>
                <li>{online ? 'Tablet oder Handy mit dem Internet verbinden (WLAN oder Mobilfunk).' : 'Tablet oder Handy ins selbe WLAN wie diesen Rechner bringen.'}</li>
                <li>QR-Code mit der Kamera scannen oder die Adresse im Browser eingeben:</li>
              </ol>
              <code className="device-link">{link}</code>
              {loopback && (
                <p className="error">
                  {online
                    ? 'Du bist über localhost mit dem Online-Server verbunden. Für das Tablet die öffentliche Adresse des Servers verwenden.'
                    : 'Du bist über localhost verbunden. Für das Tablet die LAN-Adresse des Host-Rechners verwenden.'}
                </p>
              )}
              {hosts.length > 1 && (
                <label>
                  Netzwerk
                  <select value={hostIdx} onChange={(e) => setHostIdx(Number(e.target.value))}>
                    {hosts.map((h, i) => (
                      <option key={h} value={i}>
                        {h}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <p className="muted">
                {online ? '' : 'Fragt Windows nach der Firewall, „Private Netzwerke“ erlauben. '}Spracheingabe gibt es auf dem Gerät nicht (der Browser erlaubt das Mikrofon
                nur über HTTPS), die Sprachausgabe funktioniert.
              </p>
            </div>
          </div>
        )}
        <label className="inline">
          <input type="checkbox" checked={hide} onChange={(e) => setHide(e.target.checked)} />
          {choice === 'funk' ? 'Funk' : choice === 'telefon' ? 'Telefon' : 'Telefon und Funk'} hier am Rechner ausblenden (Ton und Vorlesen laufen dann nur
          auf dem Gerät)
        </label>
        <div className="row">
          <div className="spacer" />
          <button className="primary" onClick={props.onClose}>
            Fertig
          </button>
        </div>
      </div>
    </div>
  );
}
