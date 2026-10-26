import { describe, expect, it } from 'vitest';
import { ordinalStamm, piperText, sprechText, stilFuer } from '../shared/aussprache';

describe('Aufbereitung für die Sprachausgabe', () => {
  it('schreibt Abkürzungen mit Punkt aus', () => {
    expect(sprechText('Heckenbrand ca. 10 m, z. B. am Zaun')).toBe('Heckenbrand circa 10 Meter, zum Beispiel am Zaun');
    expect(sprechText('Ältere Patientin, V. a. Schenkelhalsfraktur')).toBe('Ältere Patientin, Verdacht auf Schenkelhalsfraktur');
    expect(sprechText('Hauptstr. 12 bzw. Bahnhofstr. 3')).toBe('Hauptstraße 12 beziehungsweise Bahnhofstraße 3');
    expect(sprechText('Klinikum St. Josef')).toBe('Klinikum Sankt Josef');
  });

  it('liest Uhrzeiten wie gesprochen', () => {
    expect(sprechText('Dienstende 14:30 Uhr.')).toBe('Dienstende 14 Uhr 30.');
    expect(sprechText('Termin um 08:00')).toBe('Termin um 8 Uhr');
    expect(sprechText('ab 9:05 Uhr')).toBe('ab 9 Uhr 5');
  });

  it('gliedert den PZC und nennt Fahrzeuge ohne "x"', () => {
    expect(sprechText('Patient transportbereit, PZC 345833, erbitten Zielklinik.')).toBe('Patient transportbereit, PZC 3 4 5, 8 3, 3, erbitten Zielklinik.');
    expect(sprechText('Wir fordern nach: 1x RTW, 2x HLF 20.')).toBe('Wir fordern nach: 1 RTW, 2 HLF 20.');
  });

  it('buchstabiert Abkürzungen, die sonst als Wort gelesen würden', () => {
    expect(sprechText('NEF und ELW zur ILS')).toBe('N-E-F und E-L-W zur I-L-S');
    expect(sprechText('CO-Intoxikation, Trupp unter PA')).toBe('C-O-Intoxikation, Trupp unter P-A');
    expect(sprechText('Nachalarmierung ÖEL und UG-SanEL')).toBe('Nachalarmierung Ö-E-L und U-G-San-E-L');
    // Wörter, die nur so anfangen, bleiben
    expect(sprechText('Neffe, Ilse, Coburg, Papa')).toBe('Neffe, Ilse, Coburg, Papa');
  });

  it('schreibt Einheiten, Geschosse und römische Zahlen aus', () => {
    expect(sprechText('Flächenbrand ca. 5000 m², 20 l ausgelaufen, 15 % KOF')).toBe('Flächenbrand circa 5000 Quadratmeter, 20 Liter ausgelaufen, 15 % Körperoberfläche');
    expect(sprechText('BZ 28 mg/dl, Tempo 50 km/h')).toBe('BZ 28 Milligramm pro Deziliter, Tempo 50 Kilometer pro Stunde');
    expect(sprechText('Brand im 2. OG, Patient ca. 150 kg, 3. OG ohne Aufzug')).toBe('Brand im zweiten Obergeschoss, Patient circa 150 Kilo, drittes Obergeschoss ohne Aufzug');
    expect(sprechText('Schwangere in der 38. SSW')).toBe('Schwangere in der achtunddreißigsten Schwangerschaftswoche');
    expect(sprechText('Brand im EG')).toBe('Brand im Erdgeschoss');
    expect(sprechText('Aufzug zwischen 1. und 2. OG festgefahren')).toBe('Aufzug zwischen erstem und zweitem Obergeschoss festgefahren');
    expect(sprechText('Verbrennung 2. Grades, Waldbrand ca. 4 ha')).toBe('Verbrennung zweiten Grades, Waldbrand circa 4 Hektar');
    expect(sprechText('Schmerztherapie durch NA')).toBe('Schmerztherapie durch Notarzt');
    expect(sprechText('Anaphylaktische Reaktion Grad III')).toBe('Anaphylaktische Reaktion Grad 3');
    // "2 C-Rohre" ist keine Einheit
    expect(sprechText('mit 2 C-Rohren')).toBe('mit 2 C-Rohren');
  });

  it('bildet Ordnungszahlen', () => {
    expect([1, 2, 3, 7, 8, 11, 16, 19, 20, 38].map(ordinalStamm)).toEqual(['erst', 'zweit', 'dritt', 'siebt', 'acht', 'elft', 'sechzehnt', 'neunzehnt', 'zwanzigst', 'achtunddreißigst']);
  });

  it('lässt Funksprüche ohne Abkürzungen unverändert', () => {
    const t = 'Florian Ammerbach 40 1 für Leitstelle. Status 4, am Einsatzort.';
    expect(sprechText(t)).toBe(t);
  });
});

describe('Aussprachehilfen für Piper', () => {
  it('trennt Zusammensetzungen an der Wortfuge', () => {
    expect(piperText('Fahrzeug einsatzbereit, Lagemeldung folgt')).toBe('Fahrzeug einsatz-bereit, Lage-meldung folgt');
    expect(piperText('Kraftstoff auf der Fahrspur nach Verkehrsunfall')).toBe('Kraft-stoff auf der Fahr-spur nach Verkehrs-unfall');
    expect(piperText('Krampfanfall im Pflegeheim')).toBe('Krampf-anfall im Pflege-heim');
    expect(piperText('Einsatzstellen')).toBe('Einsatz-stellen');
  });

  it('lässt Wörter, die schon richtig klingen oder falsch getrennt würden', () => {
    expect(piperText('Notarzt, verunfallt, Erstversorgung, Transportschein, hingefallen')).toBe('Notarzt, verunfallt, Erstversorgung, Transportschein, hingefallen');
    expect(piperText('Status 3, Kommen')).toBe('Status 3, Kommen');
    expect(piperText('Leitstelle, Veränderung, zerstochen')).toBe('Leitstelle, Veränderung, zerstochen');
    expect(piperText('Ölspur auf der Fahrbahn')).toBe('Öl-spur auf der Fahrbahn');
  });

  it('korrigiert Betonung und Lautung einzelner Wörter', () => {
    expect(piperText('Ältere Patientin mit Atemnot')).toBe('Ältere Patsi-entin mit Atem-not');
    expect(piperText('Malteser Hilfsdienst und Arbeiter-Samariter-Bund')).toBe('Malltéeser Hilfsdienst und Arbeiter-Sama-riter-Bund');
    expect(piperText('Schlägerei außerorts')).toBe('Schläge-rei außer-orts');
  });

  it('trennt nicht doppelt', () => {
    const einmal = piperText('Lageänderung an der Unfallstelle');
    expect(einmal).toBe('Lage-änderung an der Unfall-stelle');
    expect(piperText(einmal)).toBe(einmal);
  });
});

describe('Sprechstil der Anrufer', () => {
  it('folgt den Regieanweisungen, solange der erste Satz eine hatte', () => {
    expect(stilFuer('a', '(schreit) Hilfe, mein Mann!')).toBe('surprised');
    expect(stilFuer('a', 'Ich weiß nicht!')).toBe('surprised');
    expect(stilFuer('a', '(atmet tief durch) Okay.')).toBe('neutral');
    expect(stilFuer('a', '(schluchzt) Er atmet.')).toBe('surprised');
    expect(stilFuer('b', '(flüstert) Er ist noch in der Wohnung.')).toBe('whisper');
    expect(stilFuer('c', '(lallt) Mein Kumpel wacht nicht auf.')).toBe('drunk');
    expect(stilFuer('d', '(aufgebracht) So ein Idiot!')).toBe('angry');
    // Ohne Regieanweisung am Anfang bleibt die normale Stimme, auch wenn später eine kommt
    expect(stilFuer('e', 'Mein Vater ist gestürzt.')).toBeUndefined();
    expect(stilFuer('e', '(weint) Bitte schnell.')).toBeUndefined();
  });
});
