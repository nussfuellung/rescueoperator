# Leitstellensimulator

Multiplayer-Leitstellensimulator nach dem Vorbild der bayerischen Integrierten Leitstellen (ILS). Mehrere Spieler besetzen gemeinsam eine Leitstelle im LAN: Notrufe annehmen und abfragen, Einsätze anlegen, Fahrzeuge nach Alarm- und Ausrückeordnung (AAO) alarmieren, Funkverkehr mit FMS-Status führen und Patienten in passende Kliniken bringen. Ein Editor erlaubt eigene Leitstellenbereiche mit simuliertem GIS.

Stand: erster Playtest-Build (Version 0.1.0).

## Schnellstart unter Windows

1. `release/Leitstellensimulator-0.1.0-win.zip` entpacken.
2. `Leitstellensimulator.exe` starten. Das Paket ist nicht signiert; Windows SmartScreen fragt deshalb einmal nach („Weitere Informationen“ → „Trotzdem ausführen“).
3. Namen eingeben, **Schicht hosten** → Leitstelle wählen → **Server starten**.
4. Beim ersten Hosten fragt die Windows-Firewall nach. Für Mitspieler im LAN „Private Netzwerke“ erlauben.

Mitspieler starten dieselbe App, wählen **Schicht beitreten** und geben die Adresse ein, die beim Host oben rechts und in der Schichtbesprechung steht (z. B. `192.168.0.23:4711`).

## Aus dem Quellcode starten

Voraussetzung: Node.js 20 oder neuer.

```bash
npm install
npm start          # baut alles und startet die Desktop-App
npm run dev        # Entwicklungsmodus mit Hot Reload (Vite + Electron)
npm test           # Simulation, GIS und 2-Stunden-Dauertest
npm run typecheck  # TypeScript-Prüfung
```

Pakete bauen:

```bash
npm run dist:win    # Windows-ZIP in release/
npm run dist:linux  # AppImage
npm run dist:mac    # DMG (nur auf macOS)
```

### Eigenständiger Server

Für eine dauerhaft laufende Schicht ohne Oberfläche, z. B. auf einem Rechner im Keller:

```bash
npm run server -- --port 4711 --scenario meine.leitstelle.json --autostart
```

Ohne `--scenario` wird die Beispiel-Leitstelle „ILS Musterland“ erzeugt. Alle Spieler treten dann über **Schicht beitreten** bei. Die Oberfläche läuft auch im Browser (`npx vite preview` nach `npm run build`); dort kann man beitreten und den Editor nutzen, aber nicht hosten.

## Spielablauf und Rollen

Die Rolle wird beim Start gewählt und kann jederzeit oben rechts gewechselt werden. Alle Leitstellenrollen sehen dieselbe Oberfläche; die Rolle zeigt den Mitspielern, wer was übernimmt.

**Calltaker (Notrufabfrage)**
- Klingelnde Notrufe annehmen (Button oder `F2`). Unbeantwortete Anrufe legen nach 90 s auf und rufen erneut an.
- Abfrage über die Fragen-Buttons (`Alt+1` bis `Alt+8`) oder frei getippte Fragen. Der Anrufer antwortet je nach Lage, manchmal ungenau oder aufgeregt.
- Einsatzort festlegen: Straße aus der Liste wählen, Hausnummer eingeben, **Suchen**. Alternativ in die Karte klicken oder bei Handyanrufen die **AML-Ortung** übernehmen (blauer Kreis, nur auf einige hundert Meter genau).
- Stichwort wählen (RD 1, RD 2, B 3, THL 3 …), Meldebild eintragen, **Einsatz anlegen**. Bei Herz-Kreislauf-Stillstand gibt es Punkte für die Telefonreanimation.
- Fehlanrufe (Hosentasche, Bereitschaftsdienst-Frage) ohne Einsatz beenden.
- BMA-Auslösungen kommen ohne Anrufer mit Objekt und Adresse herein.

**Disponent**
- Einsatz in der Liste rechts wählen. Der AAO-Vorschlag ist vorausgewählt und nach Fahrzeit sortiert; weitere Fahrzeuge lassen sich dazu wählen. **Alarmieren**.
- Fahrzeuge melden FMS-Status (3 Einsatz übernommen, 4 am Einsatzort, 7 Patient aufgenommen, 8 am Ziel, 1/2 frei).
- Status 5 heißt Sprechwunsch: mit `J` oder dem Button eine Sprechaufforderung geben. Dann kommt die Lagemeldung, eine Nachforderung oder die Bitte um eine Zielklinik.
- Nachforderungen selbst alarmieren. Unvollständige Kräfte arbeiten langsamer, nach 4 Minuten erinnert das Fahrzeug erneut.
- Zielklinik nach benötigter Fachrichtung zuweisen (Stroke Unit, HKL, Unfallchirurgie, Pädiatrie …).
- Falsch erfasster Einsatzort: Die Kräfte finden nichts, suchen einige Minuten und verlieren dabei Zeit.

**Fahrzeugbesatzung**
- Ein freies Fahrzeug besetzen. Bei Alarm Status 3 drücken, am Einsatzort Status 4.
- Die Lage vor Ort wird angezeigt. Per Funk (Textfeld) an die Leitstelle melden, Status 5 für einen Sprechwunsch.
- Mit Patient: Zielklinik von der Leitstelle bekommen oder selbst wählen, Status 7. Nach der Übergabe Status 1.

**Schichtführer**: wie Disponent, für den Überblick.

Oben links laufen Uhrzeit, Pause und Zeitraffer (1×, 2×, 4×). Die Funksprüche können per Sprachausgabe vorgelesen werden (Button „Sprachausgabe“, nutzt die deutsche Windows-Stimme).

### Wertung

Punkte gibt es für schnelle Annahme, richtiges Stichwort, genauen Einsatzort, schnelle Alarmierung, Einhaltung der Hilfsfrist (12 Minuten ab Notrufeingang), passende Zielklinik und abgeschlossene Einsätze. Abzüge gibt es für verpasste Notrufe, Einsätze zu Fehlanrufen, aufgelegte Gespräche ohne Einsatz und unbeantwortete Sprechwünsche. Ein Klick auf die Punktzahl zeigt die Statistik und jedes Ereignis.

## Leitstellen-Editor

Hauptmenü → **Leitstellen-Editor**. Eine neue Leitstelle entsteht entweder per Kartengenerator (Orte, Ortsstraßen, Staats-, Kreis- und Bundesstraßen, Autobahn, Wachen, Kliniken, Objekte) oder leer.

Werkzeuge links:
- **Auswählen**: Element anklicken und rechts bearbeiten; Knoten, Wachen, Kliniken, Objekte und Orte lassen sich ziehen.
- **Straße**: Klicks setzen Knoten und verbinden sie mit dem eingestellten Namen und Typ. Klick auf eine bestehende Straße teilt sie und schließt an. Rechtsklick oder `Esc` beendet den Straßenzug.
- **Ort**, **Feuerwache**, **Rettungswache**, **Krankenhaus**, **Objekt** (optional mit Brandmeldeanlage): per Klick setzen.
- **Löschen**: Element anklicken.

Reiter rechts:
- **Eigenschaften**: Namen, Fahrzeuge einer Wache mit Funkrufnamen, hauptamtlich/ehrenamtlich (Ausrückzeit), Fachrichtungen der Kliniken.
- **Stichworte/AAO**: Stichwortkatalog und Fahrzeuge je Stichwort.
- **Fahrzeugtypen**: Funkkenner-Nummer (40 = HLF, 71 = RTW …), Tempo, Transportfähigkeit und welche Anforderungen ein Typ erfüllt (HLF erfüllt auch LF).
- **Einstellungen**: Notrufe und BMA-Auslösungen pro Stunde, Uhrzeit bei Schichtbeginn.
- **Prüfen**: findet doppelte Funkrufnamen und nicht erreichbare Wachen oder Kliniken.

Hausnummern werden automatisch entlang gleichnamiger Straßenzüge vergeben. `Strg+S` speichert. Leitstellen liegen unter `%APPDATA%\Leitstellensimulator\leitstellen` (Windows) bzw. `~/.config/Leitstellensimulator/leitstellen` (Linux) und lassen sich als JSON exportieren und importieren, um sie weiterzugeben.

## Technik

- Electron, React und TypeScript; Vite für die Oberfläche, esbuild für Hauptprozess und Server.
- Der Host startet im Electron-Hauptprozess einen WebSocket-Server (Standardport 4711). Die Simulation läuft nur dort; Clients senden Aktionen und erhalten viermal pro Sekunde den Zustand. Verdeckte Informationen (die „Wahrheit“ hinter einem Notruf) verlassen den Server nie.
- Simuliertes GIS ohne externe Kartendienste: eigener Straßengraph, Routing mit Dijkstra, Geokodierung und Rückwärtsgeokodierung mit Hausnummern, Canvas-Karte.

```
shared/    Datenmodell, Katalog (Fahrzeuge, Stichworte, FMS), GIS, Kartengenerator, AAO-Logik
server/    Spielsimulation, Notruf-Vorlagen, WebSocket-Server, eigenständiger Server
electron/  Hauptprozess (Fenster, Leitstellen-Bibliothek, Host) und Preload
src/renderer/  Oberfläche: Menü, Leitstelle, Besatzung, Editor, Karte
tests/     Vitest: GIS, Einsatzablauf, 2-Stunden-Dauertest mit Bot-Disponent
```

## Bekannte Grenzen dieses Playtest-Builds

- Funk ist Text mit optionaler Sprachausgabe, kein Sprechfunk zwischen Spielern.
- Kein Verkehr, keine Polizei als eigene Organisation, keine Hubschrauber.
- Eine laufende Schicht wird nicht gespeichert; Verlassen beendet sie für den Host.
- Stichwortkatalog und Funkkenner sind an Bayern angelehnt, aber vereinfacht und im Editor anpassbar.
- Der Windows-Build ist nicht signiert.
