# Leitstellensimulator

Multiplayer-Leitstellensimulator nach dem Vorbild der bayerischen Integrierten Leitstellen (ILS). Mehrere Spieler besetzen gemeinsam eine Leitstelle im LAN: Notrufe annehmen und abfragen, Einsätze anlegen, Fahrzeuge nach Alarm- und Ausrückeordnung (AAO) alarmieren, Funkverkehr mit FMS-Status führen und Patienten in passende Kliniken bringen. Ein Editor erlaubt eigene Leitstellenbereiche mit simuliertem GIS.

Stand: dritter Playtest-Build (Version 0.3.0). Neu: **ILS Würzburg** als mitgelieferte Musterleitstelle auf echter OpenStreetMap-Karte, realistischeres Routing (Tempolimits, Einbahnstraßen, Fahrt je Straße unterschiedlich schnell), sichtbare Fahrten auf der Karte, die Einsatzmaske als eigenes Fenster und eine überarbeitete Spracheingabe mit Mikrofonwahl und Pegelanzeige.

## Schnellstart unter Windows

1. `release/Leitstellensimulator-0.3.0-win.zip` entpacken.
2. `Leitstellensimulator.exe` starten. Das Paket ist nicht signiert; Windows SmartScreen fragt deshalb einmal nach („Weitere Informationen“ → „Trotzdem ausführen“).
3. Namen eingeben, **Schicht hosten** → Leitstelle wählen (vorinstalliert: **ILS Würzburg**) → **Server starten**.
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

Oben links laufen Uhrzeit, Pause und Zeitraffer (1×, 2×, 4×).

### Sprachausgabe

Unter **⚙ Einstellungen** (im Hauptmenü und oben rechts im Spiel) lässt sich die Sprachausgabe einschalten und mit **Stimme testen** prüfen. Vorgelesen werden die Funksprüche der Fahrzeuge und, im eigenen Notrufgespräch, die Sätze des Anrufers (mit anderer Stimme). Besatzungen hören die Leitstelle. Bei **Stimme: Automatisch** wird zuerst die Browser-Stimme von Chromium versucht; startet sie nicht, übernimmt die Systemstimme (Windows: deutsche SAPI-Stimme über PowerShell, macOS: `say`, Linux: `spd-say` oder `espeak`). Unter Windows muss eine deutsche Stimme installiert sein (Einstellungen → Zeit und Sprache → Sprache → Deutsch → Sprachausgabe). Der Lautsprecher-Knopf oben schaltet Töne und Sprache stumm.

### Musterleitstelle ILS Würzburg

Mitgeliefert ist der Bereich der ILS Würzburg (Stadt Würzburg, Landkreise Würzburg, Kitzingen und Main-Spessart) auf echter Karte: rund 60.000 Straßenabschnitte mit Namen, Tempolimits und Einbahnstraßen, gut 400 Orte, die Feuerwehren und Rettungswachen aus den Kartendaten (fehlende Rettungswachen in Kleinstädten ergänzt) und die Kliniken Universitätsklinikum, Juliusspital, König-Ludwig-Haus, Missioklinik, Main-Klinik Ochsenfurt und Klinik Kitzinger Land. Die Fahrzeugbelegung der Wachen ist geschätzt (Berufsfeuerwehr Würzburg voll ausgestattet, Ortsfeuerwehren mit HLF, größere Orte zusätzlich mit ELW, LF und DLK) und kann im Editor an die Wirklichkeit angepasst werden. Hausnummern sind entlang der Straßen geschätzt, weil die offenen Adressdaten Bayern noch nicht enthalten. Kartendaten © OpenStreetMap-Mitwirkende (ODbL), bezogen über Overture Maps.

Fahrzeuge fahren auf den echten Straßen: auf der Autobahn schnell, in der Altstadt langsam, Einbahnstraßen werden nur langsam mit Sonderrechten gegen die Richtung befahren, Autobahnen nie. Die restliche Route jedes fahrenden Fahrzeugs ist auf der Karte eingezeichnet (durchgezogen bei Einsatzfahrt, gestrichelt sonst).

### Spracheingabe (Mikrofon)

Notrufgespräche und Funk lassen sich sprechen statt tippen. Die Erkennung läuft offline auf dem PC (Vosk). In den Einstellungen einmal **Deutsches Modell herunterladen** (vosk-model-small-de-0.15, rund 45 MB) oder ein bereits heruntergeladenes ZIP über **Aus Datei…** laden, dann **Spracheingabe einschalten**. Mit **Test** im selben Dialog sieht man, was erkannt wird.

- **Sprechtaste** (Standard `F4`, einstellbar) gedrückt halten oder den 🎤-Knopf gedrückt halten und sprechen. Die Sprechtaste unterbricht die Sprachausgabe.
- Oben in der Leiste zeigt 🎤, ob die Erkennung bereit ist, ob gerade zugehört wird, was zuletzt erkannt wurde und wohin es ging. In den Einstellungen lässt sich das Mikrofon auswählen, ein Pegel zeigt, ob Ton ankommt.
- Klappt es nicht, steht der Grund in den Einstellungen unter „Status“. Häufigste Ursache unter Windows: Einstellungen → Datenschutz und Sicherheit → Mikrofon → „Desktop-Apps Zugriff auf das Mikrofon erlauben“ ist aus, oder ein anderes Programm (Teams, Discord) belegt das Mikrofon.
- **Freisprechen**: Während eines eigenen Notrufgesprächs ist das Mikrofon dauerhaft offen; jeder erkannte Satz geht als Frage an den Anrufer. Während die Sprachausgabe spricht, hört das Mikrofon nicht zu.
- Wohin das Gesagte geht: im Notrufgespräch an den Anrufer („Wo genau ist der Notfallort?“, „Atmet die Person?“), beim Disponenten mit ausgewähltem Fahrzeug als Funkspruch an dieses Fahrzeug, bei der Besatzung als Funkspruch an die Leitstelle. „Status drei“ setzt als Besatzung direkt den Status.

### Fenster auf mehrere Monitore verteilen

Jeder Bereich (Notrufabfrage, Einsatzmaske, Karte, Einsätze, Funk, Fahrzeugstatus) hat oben rechts den Knopf ⧉, der ihn in ein eigenes Fenster auslagert. Das Fenster lässt sich auf einen anderen Monitor ziehen; Position und Größe merkt sich die App. Die Einsatzmaske ist ein eigener Bereich: Sie kann z. B. neben dem Notrufgespräch auf einem zweiten Monitor liegen, der Kartenklick im Hauptfenster setzt trotzdem den Einsatzort. Im Menü **🗗 Fenster** gibt es **Kompakte Ansicht (alles in einem Fenster)**, die Aufteilungen **Mehrere Monitore** und **Zwei Monitore (Karte auf dem zweiten)** und das Wiederherstellen der letzten Aufteilung. Schließen eines ausgelagerten Fensters holt den Bereich zurück.

### Wertung

Punkte gibt es für schnelle Annahme, richtiges Stichwort, genauen Einsatzort, schnelle Alarmierung, Einhaltung der Hilfsfrist (12 Minuten ab Notrufeingang), passende Zielklinik und abgeschlossene Einsätze. Abzüge gibt es für verpasste Notrufe, Einsätze zu Fehlanrufen, aufgelegte Gespräche ohne Einsatz und unbeantwortete Sprechwünsche. Ein Klick auf die Punktzahl zeigt die Statistik und jedes Ereignis.

## Leitstellen-Editor

Hauptmenü → **Leitstellen-Editor**. Eine neue Leitstelle entsteht aus einer echten Karte (OpenStreetMap, empfohlen), per Fantasiekarten-Generator für Spiele ohne Internet (Orte, Ortsstraßen, Staats-, Kreis- und Bundesstraßen, Autobahn, Wachen, Kliniken, Objekte) oder leer.

### Echte Karte aus OpenStreetMap

**Neue Leitstelle aus echter Karte** (oder im Editor **Echte Karte laden…**): Ort suchen, Umkreis wählen (2 bis 15 km), **Karte importieren**. Übernommen werden:
- das Straßennetz mit Straßennamen und Typen (Autobahn, Bundes-, Staats-/Kreisstraße, Ortsstraße); gefahren und geroutet wird auf diesen echten Straßen,
- echte Hausnummern; Anrufer nennen echte Adressen, und die Adresssuche im Einsatzformular findet sie,
- Orte, Feuerwehren, Rettungswachen, Kliniken, Schulen, Seniorenheime und Kirchen.

Wachen bekommen eine sinnvolle Fahrzeugbelegung, die im Editor angepasst werden sollte. Fehlt etwas in den Kartendaten (z. B. keine Rettungswache im Gebiet), wird es ergänzt und oben im Editor gemeldet. Tempolimits und Einbahnstraßen werden übernommen; Abbiegeverbote nicht. Im Spiel liegt unter dem Straßennetz die OpenStreetMap-Karte als Hintergrund (abschaltbar in den Einstellungen, braucht Internet); ohne Internet zeigt die App ihre eigene Darstellung. Statt online zu laden, kann auch eine Overpass-JSON-Datei gewählt werden. Kartendaten © OpenStreetMap-Mitwirkende, ODbL.

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
- GIS: eigener Straßengraph, Routing mit Dijkstra, Geokodierung und Rückwärtsgeokodierung mit Hausnummern, Canvas-Karte. Echte Karten kommen über Nominatim (Ortssuche) und Overpass (Daten) aus OpenStreetMap und werden in lokale Meter umgerechnet (Web-Mercator mit cos(Breite) skaliert, damit OSM-Kacheln deckungsgleich darunter liegen).
- Sprachausgabe: Web Speech API mit Rückfall auf die Systemstimme im Hauptprozess. Spracheingabe: vosk-browser (WebAssembly), das Modell wird im Hauptprozess heruntergeladen, von ZIP in tar.gz umgepackt und über das eigene Protokoll `lstmodel://` bereitgestellt.
- Ausgelagerte Fenster sind React-Portale in eigene Fenster desselben Renderers; der Spielzustand bleibt dadurch überall gleich.

```
shared/    Datenmodell, Katalog (Fahrzeuge, Stichworte, FMS), GIS, Kartengenerator, AAO-Logik
server/    Spielsimulation, Notruf-Vorlagen, WebSocket-Server, eigenständiger Server
electron/  Hauptprozess (Fenster, Leitstellen-Bibliothek, Host) und Preload
src/renderer/  Oberfläche: Menü, Leitstelle, Besatzung, Editor, Karte
tests/     Vitest: GIS, Einsatzablauf, Spracherkennung, OSM-Import mit echten Daten (Liechtenstein), Dauertests mit Bot-Disponent
```

## Bekannte Grenzen dieses Playtest-Builds

- Funk zwischen Spielern ist Text bzw. erkannte Sprache mit Vorlesen, keine echte Sprachübertragung.
- Die Spracherkennung mit dem kleinen deutschen Modell versteht kurze, deutliche Sätze am besten; die Zuordnung zu den Abfragefragen läuft über Stichworte (wo, was passiert, atmet, wie viele …).
- Echte Karten: Sehr große Gebiete (über 15 km Umkreis) sind nicht vorgesehen. Hausnummern gibt es nur, wo OpenStreetMap sie kennt; sonst werden sie entlang der Straße geschätzt.
- Kein Verkehr, keine Polizei als eigene Organisation, keine Hubschrauber.
- Eine laufende Schicht wird nicht gespeichert; Verlassen beendet sie für den Host.
- Stichwortkatalog und Funkkenner sind an Bayern angelehnt, aber vereinfacht und im Editor anpassbar.
- Der Windows-Build ist nicht signiert.
