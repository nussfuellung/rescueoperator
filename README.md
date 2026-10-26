# rescue.Operator

rescue.Operator ist ein Multiplayer-Leitstellensimulator nach dem Vorbild der bayerischen Integrierten Leitstellen (ILS). Mehrere Spieler besetzen gemeinsam eine Leitstelle im LAN: Notrufe annehmen und abfragen, Einsätze anlegen, Fahrzeuge nach Alarm- und Ausrückeordnung (AAO) alarmieren, Funkverkehr mit FMS-Status führen und Patienten in passende Kliniken bringen. Ein Editor erlaubt eigene Leitstellenbereiche mit simuliertem GIS.

Stand: sechster Playtest-Build (Version 0.6.0). Neu: Rettungsdienst, NEF-Standorte, HvO und Berufsfeuerwehr der ILS Würzburg nach der lstsim.de-Liste mit echten Standorten und Dienstzeiten, Fahrzeuge antworten im Funk passend, 19 neue Einsatzarten mit weniger Wiederholungen, häufiger AML-Ortung und ein Adressvorschlag ohne zweites Enter. Seit 0.5.0: Telefon und Funk auf Tablet oder Handy und Startdateien für Windows, Linux und macOS.

## Schnellstart

Pro System gibt es eine eigene ZIP in `release/` (erzeugt mit `npm run dist:all`), jeweils mit einer `LIESMICH.txt`:

- **Windows** (`…-windows.zip`): entpacken, `rescue.Operator.exe` doppelklicken. Das Programm ist nicht signiert; SmartScreen fragt deshalb einmal nach („Weitere Informationen“ → „Trotzdem ausführen“).
- **Linux** (`…-linux.zip`): entpacken, Rechtsklick auf `Start Linux.sh` → Ausführen. Die Piper-Stimmen sind dabei.
- **macOS** (`…-mac-apple-chip.zip` bzw. `…-mac-intel.zip`): Die ZIP enthält direkt `rescue.Operator.app`, lokal (ad hoc) signiert. Nicht von Apple beglaubigt, daher beim ersten Start unter macOS 15 Systemeinstellungen → Datenschutz & Sicherheit → „Trotzdem öffnen“, bei älteren Versionen Rechtsklick → Öffnen.

Danach:
1. Namen eingeben, **Schicht hosten** → Leitstelle wählen (vorinstalliert: **ILS Würzburg**) → **Server starten**.
2. Beim ersten Hosten fragt die Windows-Firewall nach. Für Mitspieler im LAN „Private Netzwerke“ erlauben.

Mitspieler starten dieselbe App, wählen **Schicht beitreten** und geben die Adresse ein, die beim Host oben rechts und in der Schichtbesprechung steht (z. B. `192.168.0.23:4711`).

### Online spielen

Über **Online spielen** treffen sich Spieler auf dem offiziellen Online-Server statt im LAN. Das Spiel verbindet sich von selbst; man tritt einer offenen Sitzung aus der Liste beitreten, einer privaten Sitzung mit **Beitrittscode** beitreten oder eine **neue Sitzung** erstellen (Leitstelle, offen oder privat, 1 bis 8 Spieler). Der Host kann Sichtbarkeit und Spielerzahl im Spiel über den 🌐-Knopf ändern. Jeder Spieler ist höchstens in einer Sitzung; verlässt der letzte Spieler eine Sitzung, wird sie geschlossen. Spiel und Server müssen dieselbe Hauptversion haben (z. B. beide 0.11). Der Online-Server selbst ist nicht Teil dieses Repos.

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
npm run dist:all    # Windows (Setup.exe und ZIP), Linux (AppImage und ZIP) und macOS (ZIP je Chip) in release/, GitHub-Dateien in release/github/
npm run dist:win    # nur Windows-ZIP
npm run dist:linux  # nur Linux-Ordner
npm run dist:mac    # nur macOS-Apps (Intel und Apple-Chip, unsigniert)
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
- Krankentransporte kommen über die **19222** (in der Anrufliste als „19222 KTP“). Pflegeheime, Kliniken und Patienten bestellen dort auch **Terminfahrten** für eine bestimmte Uhrzeit (Dialyse, CT, Herzkatheter, Ambulanztermin, Heimfahrt). Zusätzliche Fragen: Abholzeit, Ziel, liegend oder sitzend. Bei Stichwort RD KTP hat die Einsatzmaske das Feld **Abholung um**; mit Uhrzeit wird der Einsatz als Terminfahrt angelegt statt sofort alarmiert. Eine Abholzeit, die schon mehr als 30 Minuten vorbei ist, gilt als morgen.

**Disponent**
- Einsatz in der Liste rechts wählen. Der AAO-Vorschlag ist vorausgewählt und nach Fahrzeit sortiert; weitere Fahrzeuge lassen sich dazu wählen. Fahrzeuge in Status 8 (Übergabe in der Klinik) kommen ebenfalls in Frage und sind mit „nach Übergabe“ markiert: Ihre Zeit rechnet die Restdauer der Übergabe (1 bis 5 Minuten) plus die Anfahrt von der Klinik. Werden sie alarmiert, schließen sie die Übergabe ab, melden per Funk, in wie vielen Minuten sie losfahren, und fahren dann von der Klinik los. **Alarmieren**.
- Fahrzeuge melden FMS-Status (3 Einsatz übernommen, 4 am Einsatzort, 7 Patient aufgenommen, 8 am Ziel, 1/2 frei).
- Status 5 heißt Sprechwunsch: mit `J` oder dem Button eine Sprechaufforderung geben. Dann kommt die Lagemeldung, eine Nachforderung oder die Bitte um eine Zielklinik.
- Bei Status 1 melden sich die Fahrzeuge an der Einsatzstelle oder am Krankenhaus per Sprechfunk frei. Fahrzeuge mit Schichtplan melden sich bei Dienstbeginn per Sprechwunsch mit ihrem Dienstende an und bei Dienstschluss ab. Im Einsatz meldet sich niemand ab, das passiert erst nach der Rückkehr auf die Wache.
- Nachforderungen selbst alarmieren. Unvollständige Kräfte arbeiten langsamer, nach 4 Minuten erinnert das Fahrzeug erneut.
- Zielklinik nach benötigter Fachrichtung zuweisen (Stroke Unit, HKL, Unfallchirurgie, Pädiatrie …).
- **ESWL**: Reicht der eigene Rettungsdienst nicht, im Einsatz unter „ESWL“ eine Nachbarleitstelle und einen Fahrzeugtyp wählen und anfordern. Die Nachbar-ILS antwortet nach etwa einer Minute: Sie entsendet ihr nächstes freies Fahrzeug des Typs oder lehnt ab, wenn keines verfügbar ist. Fremdfahrzeuge melden sich beim Einfahren in den eigenen Bereich in der RD-Rufgruppe an, beim Verlassen ab, und fahren nach dem Einsatz zurück zu ihrer Wache. Die ILS Würzburg kennt die Rettungsmittel der ILS Schweinfurt, Bayerischer Untermain, Ansbach und Main-Tauber sowie die Rettungshubschrauber Christoph 2, 20, 27, 28, 53, 65 und Christoph Nürnberg.
- **Terminfahrten** stehen oben in der Einsatzliste, nach Abholzeit sortiert. 30 Minuten vor der Abholzeit und bei Fälligkeit kommt eine Erinnerung mit Signalton an alle Leitstellenplätze, solange noch kein Fahrzeug disponiert ist. Die Abholzeit lässt sich in den Einsatzdetails ändern, eine Terminfahrt dort auch stornieren. Manchmal ruft der Besteller über die 19222 zurück und sagt den Transport ab oder verschiebt ihn, auch wenn der KTW schon unterwegs ist. Wer das nicht einträgt, schickt den KTW auf eine Leerfahrt bzw. lässt ihn warten. Gewertet wird die Pünktlichkeit statt der Hilfsfrist; ein zu früh eintreffender KTW wartet, bis der Patient fertig ist.
- Falsch erfasster Einsatzort: Die Kräfte finden nichts, suchen einige Minuten und verlieren dabei Zeit.

**Fahrzeugbesatzung**
- Ein freies Fahrzeug besetzen. Bei Alarm Status 3 drücken, am Einsatzort Status 4.
- Die Lage vor Ort wird angezeigt. Per Funk (Textfeld) an die Leitstelle melden, Status 5 für einen Sprechwunsch.
- Mit Patient: Zielklinik von der Leitstelle bekommen oder selbst wählen, Status 7. Nach der Übergabe Status 1.

**Schichtführer**: wie Disponent, für den Überblick.

Oben links laufen Uhrzeit, Pause und Zeitraffer (1×, 2×, 4×).

### Sprachausgabe

Unter **⚙ Einstellungen** (im Hauptmenü und oben rechts im Spiel) lässt sich die Sprachausgabe einschalten und mit **Stimme testen** prüfen. Vorgelesen werden die Funksprüche der Fahrzeuge und, im eigenen Notrufgespräch, die Sätze des Anrufers (mit anderer Stimme). Besatzungen hören die Leitstelle. Unter Windows und Linux spricht **Piper**, eine neuronale Sprachausgabe, die offline auf dem Host läuft: vier deutsche Stimmen (Thorsten, Karlsson, Kerstin, Eva) und Thorsten emotional für panische, flüsternde, betrunkene oder wütende Anrufer, jedes Fahrzeug und jeder Anrufer behält seine Stimme, Funk klingt nach Funkgerät mit Rauschen beim Tasten, Anrufer nach Telefon. Tablets und Mitspieler bekommen die Piper-Stimmen vom Host. Gibt es Piper nicht (macOS als Host, Entwicklungsstand ohne `node scripts/piper-holen.mjs`), wird bei **Stimme: Automatisch** zuerst die Browser-Stimme von Chromium versucht; startet sie nicht, übernimmt die Systemstimme (Windows: deutsche SAPI-Stimme über PowerShell, macOS: `say`, Linux: `spd-say` oder `espeak`). Unter Windows muss eine deutsche Stimme installiert sein (Einstellungen → Zeit und Sprache → Sprache → Deutsch → Sprachausgabe). Der Lautsprecher-Knopf oben schaltet Töne und Sprache stumm.

### Musterleitstelle ILS Würzburg

Mitgeliefert ist der Bereich der ILS Würzburg (Stadt Würzburg, Landkreise Würzburg, Kitzingen und Main-Spessart) auf echter Karte: rund 60.000 Straßenabschnitte mit Namen, Tempolimits und Einbahnstraßen, gut 400 Orte, die Feuerwehren und Rettungswachen aus den Kartendaten (fehlende Rettungswachen in Kleinstädten ergänzt) und die Kliniken Universitätsklinikum, Juliusspital, König-Ludwig-Haus, Missioklinik, Main-Klinik Ochsenfurt und Klinik Kitzinger Land. Die Fahrzeuge tragen Funkrufnamen nach den bayerischen Fahrzeugkennzahlen (10 KdoW, 11 MZF, 12 ELW 1, 21 TLF 3000, 30 DLK, 40 HLF 20, 42 HLF 10, 43 LF 10, 44 TSF, 46 TSF-W, 47 MLF, 56 GW-L2, 61 RW, 71 RTW, 72 KTW, 76 NEF, 79 First Responder). Rettungsdienst, Notarztstandorte, Helfer vor Ort, First-Responder-Gruppen und die Berufsfeuerwehr stammen aus der Wachenliste von lstsim.de: echte Standorte, Funkrufnamen wie Rotkreuz Arnstein 71/1, Akkon Würzburg 71/2 oder Johannes Uettingen 71/1 und Dienstzeiten mit Wochentagen und geraden/ungeraden Kalenderwochen. Außerhalb seiner Schicht steht ein Fahrzeug auf Status 6; ein laufender Einsatz wird zu Ende gefahren. NEF, die je nach Woche an verschiedenen Standorten stehen, sind immer nur an einem Ort im Dienst. Oben neben der Uhr stehen Wochentag und Kalenderwoche, in der Fahrzeugleiste beim ausgewählten Fahrzeug die Dienstzeiten. Der Rettungshubschrauber Christoph 18 (ADAC Luftrettung Ochsenfurt) fliegt von 7:00 bis Sonnenuntergang in Luftlinie mit rund 220 km/h und taucht im Vorschlag auf, wenn er schneller als ein NEF beim Patienten ist. Nicht übernommen sind inaktive Einheiten (ELRD, OrgL, LNA, Bereitschaftszüge), SEG und UG-Rett ohne festen Standort und Absicherungs-Platzhalter. Die freiwilligen Feuerwehren folgen weiter dem bayerischen Muster und sind geschätzt: Kreisstädte (Kitzingen, Karlstadt, Lohr, Marktheidenfeld, Ochsenfurt, Gemünden) voll ausgestattet, Stützpunktwehren mit MZF, HLF und teils DLK, Ortsteilwehren mit TSF, TSF-W oder MLF, Notärzte in Würzburg, Kitzingen, Ochsenfurt, Marktheidenfeld, Karlstadt, Lohr und Gemünden. Die echte Belegung lässt sich im Editor einfügen (siehe „Fahrzeuge/Funk“).

Funk läuft in den TMO-Rufgruppen der ILS Würzburg: 3737 RD_WÜ (Rettungsdienst Stadt), 3713 RD_WÜ# (Rettungsdienst Land), 3772 FW_WÜ (Feuerwehr Stadt), 3782 FW_WÜ# (Feuerwehr Landkreis Würzburg), FW KT 1 und FW MSP 1 (Kitzingen, Main-Spessart), 3775 WR_WÜ (Wasserrettung) und 3701 bis 3705 als Sondergruppen für Einsätze. Hausnummern sind entlang der Straßen geschätzt, weil die offenen Adressdaten Bayern noch nicht enthalten. Kartendaten © OpenStreetMap-Mitwirkende (ODbL), bezogen über Overture Maps.

Fahrzeuge fahren auf den echten Straßen: auf der Autobahn schnell, in der Altstadt langsam, Einbahnstraßen werden nur langsam mit Sonderrechten gegen die Richtung befahren, Autobahnen nie. Die restliche Route jedes fahrenden Fahrzeugs ist auf der Karte eingezeichnet (durchgezogen bei Einsatzfahrt, gestrichelt sonst).

### Spracheingabe (Mikrofon)

Notrufgespräche und Funk lassen sich sprechen statt tippen. Die Erkennung läuft offline auf dem PC (Vosk). In den Einstellungen einmal **Deutsches Modell herunterladen** (vosk-model-small-de-0.15, rund 45 MB) oder ein bereits heruntergeladenes ZIP über **Aus Datei…** laden, dann **Spracheingabe einschalten**. Mit **Test** im selben Dialog sieht man, was erkannt wird.

- **Sprechtaste** (Standard `F4`, einstellbar) gedrückt halten oder den 🎤-Knopf gedrückt halten und sprechen. Die Sprechtaste unterbricht die Sprachausgabe.
- Oben in der Leiste zeigt 🎤, ob die Erkennung bereit ist, ob gerade zugehört wird, was zuletzt erkannt wurde und wohin es ging. In den Einstellungen lässt sich das Mikrofon auswählen, ein Pegel zeigt, ob Ton ankommt.
- Klappt es nicht, steht der Grund in den Einstellungen unter „Status“. Häufigste Ursache unter Windows: Einstellungen → Datenschutz und Sicherheit → Mikrofon → „Desktop-Apps Zugriff auf das Mikrofon erlauben“ ist aus, oder ein anderes Programm (Teams, Discord) belegt das Mikrofon.
- **Freisprechen**: Während eines eigenen Notrufgesprächs ist das Mikrofon dauerhaft offen; jeder erkannte Satz geht als Frage an den Anrufer. Während die Sprachausgabe spricht, hört das Mikrofon nicht zu.
- Wohin das Gesagte geht: im Notrufgespräch an den Anrufer („Wo genau ist der Notfallort?“, „Atmet die Person?“), beim Disponenten mit ausgewähltem Fahrzeug als Funkspruch an dieses Fahrzeug, bei der Besatzung als Funkspruch an die Leitstelle. „Status drei“ setzt als Besatzung direkt den Status.
- Genauigkeit: Die Sprechtaste nimmt einen kurzen Vorlauf mit und hört nach dem Loslassen noch einen Moment weiter, damit erstes und letztes Wort nicht abgeschnitten werden. Zahlwörter werden zu Ziffern („vierzig strich eins“ → 40/1, „zwölf“ → 12), getrennt oder leicht falsch erkannte Orts- und Straßennamen der Karte werden korrigiert („julius promenade“ → Juliuspromenade, „kizingen“ → Kitzingen).
- Der Anrufer versteht neben den Grundfragen auch Alter, Atmung, Bewusstsein, seit wann, Vorerkrankungen und Medikamente, Stockwerk und Zugang, Rückrufnummer und das Wiederholen der Adresse, auch zwei Fragen in einem Satz („Wie alt ist er und atmet er normal?“). Angehörige, Passanten und Pflegepersonal antworten unterschiedlich.

### Einsatzmaske

Die Einsatzmaske ist an ELDIS III angelehnt, aber aufgeräumt:
- **Ortung**: Bei Handy-Notrufen mit AML springt die Karte beim Annehmen auf die Ortung (Kreis mit Genauigkeit). **Übernehmen** (oder `Alt+A`) setzt den Einsatzort auf die nächste Adresse. Bei Festnetz kommt die Anschlussadresse mit, die meist, aber nicht immer der Notfallort ist.
- **Einsatzort**: Straße und Hausnummer suchen, Zusatz (Stockwerk, Hinterhaus), Objekt. Darunter Gemeinde und zuständige Feuerwehr und Rettungswache. Liegt ein offener Einsatz in weniger als 300 m, erscheint eine Warnung (Doppelmeldung?).
- **Einsatz**: Stichworte nach der Alarmierungsbekanntmachung Bayern (ABek): RD 1–5, RD MANV, RD KTP, B 1–6, B … PERSON, B BMA/WALD/ELEKTROANLAGE/BOOT, THL 1–5, THL P …, THL UNWETTER/WASSER/…, ABC 1–3, ABC KRAFTSTOFF/ÖL/EXPLOSION/GMA. Die Schlagwortsuche nimmt Nummer, Stichwort oder Meldebild („b1515“, „b3 person keller“, „lkw außerorts“, „atem“) und setzt das Schlagwort im Format des Leitsystems, z. B. `#B1515 - B3 - #Verkehr#LKW / Bus außerorts`. Schlagworte mit „Anzahl (RTW)“ geben zusätzliche RTW in den Vorschlag. Alarmierung und Fahrzeuganzeige zeigen das Schlagwort. Brand- und ABC-Schlagworte stammen aus einem echten Leitsystem, THL- und RD-Nummern sind selbst vergeben.
- **Patient** und **Meldender** mit Rückrufnummer (vom Anruf vorbelegt).
- **Alarmierungsvorschlag** schon vor dem Anlegen. **Anlegen und alarmieren** (`Strg+Enter`) erledigt beides auf einmal, **Nur anlegen** überlässt die Alarmierung dem Disponenten.

### Funk und TMO-Rufgruppen

Computergesteuerte Fahrzeuge antworten auf Funksprüche passend: Anruf („Arnstein 71/1 von Leitstelle“, mit oder ohne „kommen“; Antwort „Arnstein 71/1 hört“), Standort („Wo befinden Sie sich?“), Eintreffzeit, Status und Einsatzbereitschaft, Lage vor Ort, Nachforderung, Patient, Besatzung, Sondersignal und Notarzt. Wie im heutigen Sprechfunk üblich, hängen Fahrzeuge und Leitstelle kein „kommen“ mehr an; gesprochen oder getippt wird es weiter verstanden. Rufname, „von Leitstelle Würzburg“ und „kommen“/„Ende“ werden abgetrennt, Fragen auch ohne Fragezeichen erkannt (wichtig für die Spracheingabe), reine Quittungen wie „Verstanden, Ende“ bleiben unbeantwortet. Per Funk lassen sich auch Aufträge geben: Ein Anruf an ein Fahrzeug mit Sprechwunsch gilt als Sprechaufforderung, „Fahren Sie das Juliusspital an“ weist die Zielklinik zu, „Rücken Sie ein“ schickt das Fahrzeug zur Wache, „Einsatzabbruch“ nimmt es aus dem Einsatz und „Wechseln Sie in 3737“ schaltet die Rufgruppe um. „Bitte wiederholen“ wiederholt die letzte Meldung.

Bei einem PZC mit Arztbegleitung (letzte Ziffer 1) fährt der Notarzt im RTW mit: Das NEF folgt in Status 7 zur Klinik, meldet dort Status 8 und ist erst nach der Übergabe wieder frei. Auf „Ist der Notarzt abkömmlich?“ (an das NEF oder an das RTW, in dem er mitfährt) antwortet die Besatzung je nach Lage: auf der Anfahrt mit Eintreffzeit und dem Hinweis aufs Umdisponieren, in der Versorgung mit der voraussichtlichen Restzeit, bei Begleitung mit Zielklinik und wann er nach der Übergabe frei ist. Wird er vor Ort nicht mehr gebraucht oder ist die Übergabe fast fertig, meldet sich das NEF frei (Status 1) und steht für den nächsten Einsatz bereit.

Fahrzeuge lassen sich auch per Sprechfunk alarmieren: „71/1, übernehmen Sie den Einsatz Hauptstraße“ (Einsatz über Straße, Ort, Einsatznummer oder Stichwort erkannt). Ein Fahrzeug auf der Anfahrt (Status 3) oder an einer Einsatzstelle ohne Patient lässt sich so auch umdisponieren („Brechen Sie ab, übernehmen Sie den Einsatz Bahnhofstraße“); der alte Einsatz bekommt einen Protokolleintrag. Ist der Einsatz nicht eindeutig, fragt die Besatzung nach.

**Status 0** ist der priorisierte Sprechwunsch: Besatzungen drücken ihn bei Gefahr für die Einsatzkräfte (Bedrohung, Gewalt) und wenn für eine lebensbedrohliche Lage noch Kräfte fehlen, etwa ein Notarzt. Er steht rot und blinkend ganz oben in der Sprechwunschliste, ist im Funkprotokoll rot hinterlegt, hat einen eigenen Ton und muss innerhalb von 45 Sekunden beantwortet werden. Ein offener Status 5 kann zu Status 0 hochgestuft werden. Als Besatzung gibt es die Taste 0 bzw. „Status null“.

Infektionstransporte (PZC 371, 372, 375–378, z. B. Meningitis, TBC, Covid-19 oder Noroviren) meldet die Besatzung mit der Transportbereitschaft an. Nach der Übergabe kann das Fahrzeug nicht aus Status 8 neu alarmiert werden: Es fährt in Status 6 zur Desinfektion auf die Wache, steht dort 30 bis 60 Minuten außer Dienst und meldet sich danach mit Status 2 einsatzbereit.

Jede Wache funkt in ihrer Rufgruppe. Oben im Funkbereich lassen sich Gruppen ein- und ausblenden (eine grün hinterlegte Gruppe ist gerade belegt), unten geht ein Gruppenruf an alle in einer Gruppe. Im Einsatz kann der Disponent eine Einsatzgruppe (z. B. WÜ EINS 1) zuweisen: Alle Fahrzeuge des Einsatzes bekommen die Anweisung zum Gruppenwechsel und melden sich dort, nachalarmierte Fahrzeuge schalten direkt um, nach dem Einsatz geht es zurück in die Heimatgruppe. Einzelne Fahrzeuge lassen sich in der Fahrzeugleiste umschalten. FMS-Status laufen unabhängig von der Gruppe. In der Fahrzeugleiste filtern Suche und Rufgruppe die vielen Wachen.

### Polizei, Nachforderungen und KVB

Im Einsatz verständigt **🚓 Polizei** die Polizei (nach einigen Minuten „Polizei vor Ort“). Schon beim Anlegen geht das über den Haken **🚓 Polizei verständigen** unter dem Alarmierungsvorschlag in der Einsatzmaske (standardmäßig aus, Alt+P): Die Polizei wird dann zusammen mit dem ersten Alarm verständigt. Bei Verkehrsunfällen, Wohnungsöffnungen, Suizidgefahr, Ölspuren und Bränden auf der Straße erwarten die Kräfte die Polizei: Sie bitten in der Lagemeldung darum und erinnern nach einigen Minuten. Ohne Polizei gibt es am Ende Punktabzug. Vor Ort kann sich die Lage entwickeln: Der Patient trübt ein und braucht doch einen Notarzt, ein schwerer Patient im 3. OG braucht eine Tragehilfe der Feuerwehr, oder bei einem Gebäudebrand stehen Personen am Fenster und eine Drehleiter muss nach. Die Fahrzeuge fordern das per Sprechwunsch nach.

Manchmal ruft die Polizei selbst an: Eine Streife steht schon an der Einsatzstelle (hilflose Person, Radunfall, Festnahme nach Schlägerei, Wohnungsöffnung, häusliche Gewalt, psychischer Ausnahmezustand, Bodypacker, Motorradunfall) und fordert den Rettungsdienst nach. Der Anruf erscheint als **POL** mit dem Funkrufnamen der Streife (z. B. „Main 15/4“), die Kollegen nennen den Einsatzort gleich mit. Der Einsatz entsteht mit „Polizei vor Ort“, die Lagemeldungen der Fahrzeuge gehen davon aus.

Nicht jeder Anrufer braucht den Rettungsdienst: Fieber seit Tagen, Rückenschmerzen oder ein Harnwegsinfekt sind Fälle für den ärztlichen Bereitschaftsdienst. **An KVB 116117** im Notrufgespräch verbindet weiter (Punkte, wenn es passt; einen echten Notfall an die KVB zu geben, kostet viel). Umgekehrt übergibt die KVB über die Schnittstelle Fälle an die ILS: Sie erscheinen als **KVB** in der Notrufabfrage mit Meldebild und Adresse, die Einsatzmaske ist vorbelegt.

### IVENA und Zielkliniken

Hat ein Rettungsmittel den Patienten versorgt, meldet es einen Patientenzuweisungscode (PZC nach der Liste Bayern V 1.3): Rückmeldeindikation, Alter und Dringlichkeit, z. B. `345833` = Hypertensiver Notfall, 83 Jahre, ambulant. Der Knopf **IVENA** oben zeigt die offenen Anmeldungen mit entschlüsseltem PZC und benötigtem Fachbereich und die Kliniken nach Eignung und Entfernung; ein Klick weist zu. Unter **Behandlungskapazitäten** steht, welche Klinik welchen Fachbereich an- oder abgemeldet hat (z. B. Herzkatheterlabor belegt, CT ausgefallen). Eine Zuweisung an eine abgemeldete Klinik kostet Punkte, solange eine andere Klinik aufnahmebereit ist. Wie oft und wie lange abgemeldet wird, schwankt zufällig mit der Auslastung der Klinik (meist 20 bis 90 Minuten, mal nur eine Viertelstunde, mal mehrere Stunden). Jede Ab- und Wiederanmeldung erscheint bei allen Disponenten als Meldung über der Karte; ein Klick öffnet IVENA.

Ab und zu meldet eine Besatzung ihren Patienten nicht über Funk, sondern per Telefon an (Anruf **RTW** in der Notrufabfrage). Nach dem Annehmen nennt sie PZC und Verdachtsdiagnose; die Zielklinik lässt sich direkt in der Anrufzeile oder in IVENA zuweisen, danach legt sie auf. Wer nicht abnimmt, bekommt die Anmeldung über Funk. Der Reiter **PZC-Liste** zeigt alle Rückmeldeindikationen (die ersten drei Ziffern) mit Gruppe und Fachbereich und lässt sich nach Code oder Begriff durchsuchen.

**Voranmeldung:** Tracerdiagnosen mit Notfallversorgung (Polytrauma und andere Schockraumpatienten, STEMI, kardiogener Schock, Reanimation, Schlaganfall) meldet die Leitstelle nach der Zuweisung in der Zielklinik voran, über IVENA, die Anrufzeile oder die Funkleiste („Schockraum voranmelden“). Ohne Voranmeldung gibt es Punktabzug und die Übergabe dauert länger; vorangemeldete Patienten übernimmt das Schockraumteam sofort.

**Aufnahmepflicht:** Bei vitaler Bedrohung (Dringlichkeit 1) muss die nächstgelegene geeignete Klinik auch dann aufnehmen, wenn sie den Fachbereich abgemeldet hat, sofern die nächste aufnahmebereite Klinik mehr als 10 km weiter weg ist. IVENA markiert das; eine solche Zuweisung kostet keine Punkte. Die zwangsbelegte Klinik versorgt den Patienten nur erst: 30 bis 90 Minuten nach der Übergabe ruft sie in der Leitstelle an und meldet eine Notfallverlegung mit Notarzt in eine aufnahmebereite Klinik an (sicher, solange sie noch abgemeldet ist, sonst in der Hälfte der Fälle).

**Übergabe:** Wie lange ein Fahrzeug in Status 8 an der Klinik steht, hängt von der Wartezeit der Notaufnahme ab: Größe der Klinik, Zuweisungen der letzten Stunde, Tageszeit (mittags und abends voller, nachts ruhiger) und Auslastung. IVENA zeigt die geschätzte Übergabedauer je Klinik.

**Verlegungen:** Kliniken ohne den nötigen Fachbereich melden Notfallverlegungen an, z. B. einen STEMI ins Herzkatheterlabor, einen Schlaganfall zur Thrombektomie, ein Kind in die Kinderklinik oder einen Schwerbrandverletzten ins Brandverletztenzentrum (RD 2 mit Notarzt, Harnstau in die Urologie als RD 1). Die Zielklinik ist zwischen den Ärzten vereinbart, die Besatzung nennt sie bei der Anmeldung, und IVENA stellt sie mit ★ an den Anfang. Eine andere Klinik kostet Punkte, eine Abmeldung spielt dabei keine Rolle. Bei Terminfahrten in eine Klinik gilt das genannte Ziel genauso.

Fachbereiche: Innere Medizin, Chirurgie, Unfallchirurgie, Kardiologie (HKL), Stroke Unit, Pädiatrie, Verbrennungen, Urologie, Gynäkologie, Geburtshilfe, HNO, Augenheilkunde und Psychiatrie. Die Musterleitstelle Würzburg hat dazu die Kliniken mit den Fachabteilungen, die sie auf ihren Webseiten angeben, einschließlich Klinikum Main-Spessart und Bezirkskrankenhaus in Lohr (`scripts/karten/kliniken.ts`). Kliniken außerhalb des Bereichs sitzen am Kartenrand auf der Autobahn, über die man sie erreicht; ab dort kommt ihre Fahrzeit dazu (in IVENA „+ X min ab Kartenrand“). Das sind das Leopoldina-Krankenhaus Schweinfurt und der Rhön-Klinikum Campus Bad Neustadt (über die A 7), das Klinikum Aschaffenburg-Alzenau sowie für Schwerbrandverletzte die BG Unfallklinik Frankfurt und das Sana Klinikum Offenbach (über die A 3). Hat keine Klinik einer Karte den benötigten Fachbereich, gilt die Erstversorgung in der Unfallchirurgie als richtig; IVENA weist darauf hin.

### Telefon und Funk auf Tablet oder Handy

Oben rechts auf **📱 Tablet** klicken, wählen, ob das Gerät Telefon, Funk oder beides übernimmt, und den QR-Code mit dem iPad, Tablet oder Handy scannen (oder die angezeigte Adresse im Browser eingeben). Rechner und Gerät müssen im selben WLAN sein; die Windows-Firewall muss „Private Netzwerke“ erlauben. Auf dem Gerät einmal **Tippen zum Start**, damit Klingeln und Vorlesen freigeschaltet werden. Das Gerät übernimmt deinen Platz: Ein dort angenommener Notruf öffnet am Rechner die Einsatzmaske mit AML, Sprechwünsche und Gruppenrufe laufen auf dem Gerät. Mit dem Haken „hier am Rechner ausblenden“ verschwinden die ausgelagerten Bereiche am Rechner, und Ton und Vorlesen kommen nur noch vom Gerät. Bricht das WLAN kurz ab, verbindet sich das Gerät von selbst neu. Die Spracheingabe gibt es auf dem Gerät nicht, weil Browser das Mikrofon nur über HTTPS freigeben; sie bleibt am Rechner.

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
- **Eigenschaften**: Namen, Fahrzeuge einer Wache mit Funkrufnamen, hauptamtlich/ehrenamtlich (Ausrückzeit), TMO-Rufgruppe, Fachrichtungen der Kliniken.
- **Fahrzeuge/Funk**: alle Wachen nach bayerischem Muster neu belegen, eine Fahrzeugliste einfügen (z. B. von lstsim.de markiert und kopiert: erkannt wird alles wie „Florian Kitzingen 40/1“ oder „Rotkreuz Würzburg 71/3“, der Typ folgt aus der Kennzahl, genannte Wachen bekommen genau diese Fahrzeuge, fehlende werden angelegt) und die TMO-Rufgruppen bearbeiten.
- **Stichworte/AAO**: Stichwortkatalog und Fahrzeuge je Stichwort.
- **Fahrzeugtypen**: Funkkenner-Nummer (40 = HLF, 71 = RTW …), Tempo, Transportfähigkeit und welche Anforderungen ein Typ erfüllt (HLF erfüllt auch LF).
- **Einstellungen**: Notrufe und BMA-Auslösungen pro Stunde, Uhrzeit bei Schichtbeginn.
- **Prüfen**: findet doppelte Funkrufnamen und nicht erreichbare Wachen oder Kliniken.

Hausnummern werden automatisch entlang gleichnamiger Straßenzüge vergeben. `Strg+S` speichert. Leitstellen liegen unter `%APPDATA%\rescue.Operator\leitstellen` (Windows) bzw. `~/.config/rescue.Operator/leitstellen` (Linux) und lassen sich als JSON exportieren und importieren, um sie weiterzugeben.

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
- Die Spracherkennung mit dem kleinen deutschen Modell versteht kurze, deutliche Sätze am besten; die Zuordnung zu den Abfragefragen läuft über Stichworte (wo, was passiert, atmet, wie alt, seit wann …).
- Die Fahrzeuge der freiwilligen Feuerwehren in Würzburg sind nach bayerischem Muster geschätzt; Rettungsdienst und Berufsfeuerwehr stammen aus der lstsim-Liste.
- Echte Karten: Sehr große Gebiete (über 15 km Umkreis) sind nicht vorgesehen. Hausnummern gibt es nur, wo OpenStreetMap sie kennt; sonst werden sie entlang der Straße geschätzt.
- Kein Verkehr; die Polizei wird nur verständigt und nicht als eigene Organisation disponiert.
- Eine laufende Schicht wird nicht gespeichert; Verlassen beendet sie für den Host.
- Stichwortkatalog und Funkkenner sind an Bayern angelehnt, aber vereinfacht und im Editor anpassbar.
- Die Builds sind nicht signiert. Die Mac-Version wurde unter Linux gebaut und nur bis zum Paket geprüft, nicht auf einem echten Mac gestartet.
- Auf dem Tablet gibt es keine Spracheingabe (Browser erlauben das Mikrofon nur über HTTPS).
