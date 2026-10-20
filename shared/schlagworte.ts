// Schlagwortkatalog wie im Einsatzleitsystem der bayerischen ILS: "#B1515 - B3 - #Verkehr#LKW / Bus außerorts".
// Brand und ABC folgen der Liste aus dem Leitsystem (von Melvin), THL und RD sind nach dem Aufbau der ABek ergänzt;
// deren Nummern (eigen: true) sind selbst vergeben und noch nicht mit dem echten Katalog abgeglichen.
import { compactStichwort } from './catalog';

export interface Schlagwort {
  /** z. B. "#B1515" */
  nr: string;
  /** Einsatzstichwort nach ABek, z. B. "B 3" */
  code: string;
  /** Kategorie, z. B. "Verkehr" */
  kat: string;
  /** Meldebild, z. B. "LKW / Bus außerorts" */
  text: string;
  /** Zusätzliche RTW über die AAO des Stichworts hinaus ("Anzahl (RTW): 1") */
  rtw?: number;
  /** Nummer selbst vergeben, nicht aus dem echten Katalog */
  eigen?: boolean;
}

const S = (nr: string, code: string, kat: string, text: string, rtw?: number, eigen?: boolean): Schlagwort => ({
  nr,
  code,
  kat,
  text,
  ...(rtw ? { rtw } : {}),
  ...(eigen ? { eigen } : {}),
});

export const SCHLAGWORTE: Schlagwort[] = [
  // ---- ABC ----
  S('#A1010', 'ABC 1', 'Geruch', 'undefinierbarer Geruch'),
  S('#A1011', 'ABC 1', 'Geruch', 'Geruch nach Ammoniak'),
  S('#A1012', 'ABC 1', 'Geruch', 'Geruch nach Chlor'),
  S('#A1013', 'ABC 1', 'Geruch', 'Geruch nach Erdgas/Gas'),
  S('#A1110', 'ABC KRAFTSTOFF', 'Gefahrstoff', 'auslaufender Kraftstoff'),
  S('#A1210', 'ABC 2', 'Gefahrstoff', 'verdächtiger Stoff'),
  S('#A1211', 'ABC 2', 'Gefahrstoff', 'undefinierbare Flüssigkeit'),
  S('#A1212', 'ABC 2', 'Gefahrstoff', 'undefinierbarer Gegenstand'),
  S('#A1213', 'ABC 2', 'Gefahrstoff', 'kleine Menge'),
  S('#A1213', 'ABC 2', 'Gefahrstoff', 'undefinierbares Pulver'),
  S('#A1214', 'ABC 2', 'Gefahrstoff', 'Gasaustritt im Freien'),
  S('#A1310', 'ABC 3', 'Gefahrstoff', 'große Menge'),
  S('#A1311', 'ABC 3', 'Gefahrstoff', 'Gasaustritt brennbar'),
  S('#A1312', 'ABC 3', 'Gefahrstoff', 'Gasaustritt im Gebäude'),
  S('#A1510', 'ABC B', 'Gefahrstoff', 'Brand Tankstelle'),
  S('#A1511', 'ABC B', 'Gefahrstoff', 'Brand Biogasanlage'),
  S('#A1512', 'ABC B', 'Gefahrstoff', 'Brand Raffinerie'),
  S('#A1513', 'ABC B', 'Gefahrstoff', 'Brand Tanklager'),
  S('#A1514', 'ABC B', 'Gefahrstoff', 'Brand Tankwagen'),
  S('#A1910', 'ABC EXPLOSION', 'Gefahrstoff', 'Explosion/Verpuffung'),
  S('#A2010', 'ABC ÖL WASSER', 'Gefahrstoff', 'Öl auf fließendem Gewässer'),
  S('#A2011', 'ABC ÖL WASSER', 'Gefahrstoff', 'Öl auf stehendem Gewässer'),
  S('#A2110', 'ABC ÖL LAND', 'Gefahrstoff', 'undichter Heizöltank'),
  S('#A2111', 'ABC ÖL LAND', 'Gefahrstoff', 'ausgedehnter Ölschaden'),
  S('#A2210', 'ABC GEFAHRSTOFFMELDEANLAGE', 'GMA', 'Meldeanlage Ammoniak'),
  S('#A2211', 'ABC GEFAHRSTOFFMELDEANLAGE', 'GMA', 'Meldeanlage Chlor'),
  S('#A2212', 'ABC GEFAHRSTOFFMELDEANLAGE', 'GMA', 'Meldeanlage Stickstoff'),
  S('#A2213', 'ABC GEFAHRSTOFFMELDEANLAGE', 'GMA', 'Meldeanlage CO2'),
  S('#A2214', 'ABC GEFAHRSTOFFMELDEANLAGE', 'GMA', 'Meldeanlage Butan'),
  S('#A2215', 'ABC GEFAHRSTOFFMELDEANLAGE', 'GMA', 'Meldeanlage Propan'),
  S('#A2216', 'ABC GEFAHRSTOFFMELDEANLAGE', 'GMA', 'Meldeanlage undefiniert'),

  // ---- Brand ----
  S('#B0000', 'B 2', 'Alarmstufenerhöhung', 'auf B2'),
  S('#B0000', 'B 3 PERSON', 'Alarmstufenerhöhung', 'auf B3 PERSON', 1),
  S('#B0000', 'B 4', 'Alarmstufenerhöhung', 'auf B4'),
  S('#B1219', 'B 5', 'Alarmstufenerhöhung', 'auf B5'),
  S('#B0000', 'B 6', 'Alarmstufenerhöhung', 'auf B6'),
  S('#B1010', 'B 1', 'Im Freien', 'Brandgeruch'),
  S('#B1011', 'B 1', 'Im Freien', 'Rauchentwicklung'),
  S('#B1012', 'B 1', 'Im Freien', 'Freifläche klein (<100qm)'),
  S('#B1013', 'B 2', 'Im Freien', 'Freifläche groß (>100qm)'),
  S('#B1013', 'B 2', 'Im Freien', 'Wald, klein (<1000qm)'),
  S('#B1014', 'B 1', 'Im Freien', 'Abfall-, Müll-, Papiercontainer'),
  S('#B1015', 'B 3', 'Im Freien', 'am Gebäude'),
  S('#B1017', 'B 2', 'Im Freien', 'Bahndamm'),
  S('#B1018', 'B 2', 'Im Freien', 'Bau-, Wohncontainer'),
  S('#B1019', 'B 2 PERSON', 'Im Freien', 'Bau-, Wohncontainer (Person in Gefahr)', 1),
  S('#B1020', 'B 2', 'Im Freien', 'Gartenhütte, Schuppen'),
  S('#B1021', 'B 2 PERSON', 'Im Freien', 'Gartenhütte/Schuppen (Person in Gefahr)', 1),
  S('#B1022', 'B 2 PERSON', 'Im Freien', 'Person', 1),
  S('#B1023', 'B WALD', 'Im Freien', 'Wald groß (>1000 qm)'),
  S('#B1024', 'B WALD', 'Im Freien', 'Bergwald'),
  S('#B1024', 'B 1', 'Im Freien', 'Kleinbrand'),
  S('#B1110', 'B 3', 'im Gebäude', 'Brandgeruch'),
  S('#B1111', 'B 2', 'im Gebäude', 'Kamin', undefined, true),
  S('#B1113', 'B 3', 'im Gebäude', 'Dachstuhl', undefined, true),
  S('#B1112', 'B 3 PERSON', 'im Gebäude', 'Dachstuhl (Person in Gefahr)', 1),
  S('#B1114', 'B 3', 'im Gebäude', 'Garage'),
  S('#B1114', 'B 3 PERSON', 'im Gebäude', 'Garage (Person in Gefahr)', 1),
  S('#B1116', 'B 3', 'im Gebäude', 'Keller'),
  S('#B1117', 'B 3 PERSON', 'im Gebäude', 'Keller (Person in Gefahr)', 1),
  S('#B1119', 'B 3', 'im Gebäude', 'Rauchentwicklung'),
  S('#B1120', 'B 3 PERSON', 'im Gebäude', 'Rauchentwicklung (Person in Gefahr)', 1),
  S('#B1121', 'B 4', 'im Gebäude', 'Tiefgarage'),
  S('#B1122', 'B 2', 'Im Gebäude', 'überhitzter Ofen, Ölofen'),
  S('#B1123', 'B 3', 'im Gebäude', 'Zimmer'),
  S('#B1124', 'B 3 PERSON', 'im Gebäude', 'Zimmer (Person in Gefahr)', 1),
  S('#B1210', 'B 5', 'Gebäude hohe Personenzahl', 'Pflege- / Altenheim'),
  S('#B1211', 'B 4', 'Gebäude hohe Personenzahl', 'Hochhaus ab 7. OG', 1),
  S('#B1212', 'B 4', 'Gebäude hohe Personenzahl', 'Hotel', 1),
  S('#B1213', 'B 5', 'Gebäude hohe Personenzahl', 'Kaufhaus', 1),
  S('#B1214', 'B 4', 'Gebäude hohe Personenzahl', 'Supermarkt', 1),
  S('#B1215', 'B 4', 'Gebäude hohe Personenzahl', 'Kindergarten', 1),
  S('#B1216', 'B 4', 'Gebäude hohe Personenzahl', 'Kino', 1),
  S('#B1217', 'B 4', 'Gebäude hohe Personenzahl', 'Kirche', 1),
  S('#B1218', 'B 5', 'Gebäude hohe Personenzahl', 'Krankenhaus'),
  S('#B1219', 'B 4', 'Gebäude hohe Personenzahl', 'Schule', 1),
  S('#B1220', 'B 4', 'Gebäude hohe Personenzahl', 'Theater', 1),
  S('#B1221', 'B 4', 'Gebäude hohe Personenzahl', 'Zirkus', 1),
  S('#B1233', 'B 4', 'Gebäude hohe Personenzahl', 'Wohnheim', 1),
  S('#B1234', 'B 4', 'Gebäude hohe Personenzahl', 'Behinderteneinrichtung', 1),
  S('#B1312', 'B ELEKTROANLAGE', 'Gewerbe/Industrie', 'Elektroanlage/Trafo'),
  S('#B1313', 'B 4', 'Gewerbe/Industrie', 'Sägewerk/Schreinerei', 1),
  S('#B1314', 'B 4', 'Gewerbe/Industrie', 'Industriegebäude', 1),
  S('#B1315', 'B 4', 'Gewerbe/Industrie', 'Lagerhalle', 1),
  S('#B1316', 'B 4', 'Gewerbe/Industrie', 'Silo (kein Gefahrstoff)'),
  S('#B1320', 'B 4', 'Gewerbe/Industrie', 'große Höhe - Turm'),
  S('#B1320', 'B 4', 'Gewerbe/Industrie', 'große Höhe - Windrad'),
  S('#B1410', 'B 4', 'Landwirtschaft', 'Bauernhof'),
  S('#B1412', 'B 4', 'Landwirtschaft', 'Stall / Scheune'),
  S('#B1413', 'B 4', 'Landwirtschaft', 'Aussiedlerhof'),
  S('#B1414', 'B 3', 'Landwirtschaft', 'Fahrzeug/Maschine'),
  S('#B1510', 'B 2', 'Verkehr', 'PKW'),
  S('#B1511', 'B 2', 'Verkehr', 'PKW auf BAB'),
  S('#B1512', 'B 2 PERSON', 'Verkehr', 'PKW (Person in Gefahr)', 1),
  S('#B1513', 'B 2 PERSON', 'Verkehr', 'PKW auf BAB (Person in Gefahr)', 1),
  S('#B1514', 'B 1', 'Verkehr', 'Motorrad'),
  S('#B1515', 'B 2', 'Verkehr', 'LKW / Bus innerorts'),
  S('#B1515', 'B 3', 'Verkehr', 'LKW / Bus außerorts'),
  S('#B1516', 'B 3', 'Verkehr', 'LKW / Bus auf BAB'),
  S('#B1517', 'B 3 PERSON', 'Verkehr', 'LKW (Person in Gefahr)', 1),
  S('#B1518', 'B 3 PERSON', 'Verkehr', 'LKW auf BAB (Person in Gefahr)', 1),
  S('#B1520', 'B BOOT', 'Verkehr', 'Boot/Yacht/Floß'),
  S('#B1610', 'B BMA', 'Meldeanlage', 'Brandmeldeanlage', undefined, true),
  S('#B1611', 'B BMA', 'Meldeanlage', 'Rauchwarnmelder', undefined, true),

  // ---- Technische Hilfe (Nummern selbst vergeben) ----
  S('#T1010', 'THL 1', 'klein', 'allgemein', undefined, true),
  S('#T1011', 'THL 1', 'klein', 'Baum auf Straße/Schiene', undefined, true),
  S('#T1012', 'THL 1', 'klein', 'Straße reinigen / Ölspur', undefined, true),
  S('#T1013', 'THL 1', 'klein', 'Wasser im Keller/in Gebäude', undefined, true),
  S('#T1014', 'THL 1', 'klein', 'Wohnung öffnen (nicht akut)', undefined, true),
  S('#T1015', 'THL 1', 'klein', 'Gegenstand sichern', undefined, true),
  S('#T1016', 'THL 1', 'Tier', 'Kleintier / Großtier', undefined, true),
  S('#T1017', 'THL 1', 'klein', 'RD-Unterstützung', undefined, true),
  S('#T1018', 'THL 1', 'VU', 'VU mit Motorrad/PKW (keine eingeklemmte Person)', undefined, true),
  S('#T1110', 'THL 2', 'VU', 'mehrere PKW', undefined, true),
  S('#T1111', 'THL 2', 'VU', 'LKW/Bus (leer) ohne eingeklemmte Person', undefined, true),
  S('#T1210', 'THL 3', 'VU', '1 oder 2 PKW, Person eingeklemmt', undefined, true),
  S('#T1211', 'THL 3', 'Person eingeklemmt', 'Person eingeklemmt (nicht VU)', undefined, true),
  S('#T1212', 'THL 3', 'VU', 'Bus besetzt', 1, true),
  S('#T1213', 'THL 3', 'Wald', 'Waldunfall, Person eingeklemmt', undefined, true),
  S('#T1310', 'THL 4', 'VU', 'mehrere PKW, Personen eingeklemmt', undefined, true),
  S('#T1311', 'THL 4', 'VU', 'LKW/Bus (leer), Person eingeklemmt', undefined, true),
  S('#T1410', 'THL 5', 'VU', 'Massenkarambolage', undefined, true),
  S('#T1411', 'THL 5', 'VU', 'Bus besetzt, Personen eingeklemmt', undefined, true),
  S('#T1510', 'THL P EINGESCHLOSSEN', 'Person', 'Wohnung öffnen akut', undefined, true),
  S('#T1511', 'THL P EINGESCHLOSSEN', 'Person', 'Fahrzeug öffnen akut (Kind/Tier im Auto)', undefined, true),
  S('#T1512', 'THL P AUFZUG', 'Person', 'Aufzug öffnen akut', undefined, true),
  S('#T1513', 'THL P RETTUNG H/T', 'Absturz/Höhe', 'Person in Höhe / absturzgefährdet', undefined, true),
  S('#T1514', 'THL P RETTUNG H/T', 'Absturz/Höhe', 'Person aus Tiefe/Schacht', undefined, true),
  S('#T1515', 'THL P STROM', 'Person', 'Stromunfall', undefined, true),
  S('#T1610', 'THL UNWETTER', 'Unwetter', 'Baum umgestürzt', undefined, true),
  S('#T1611', 'THL UNWETTER', 'Unwetter', 'Keller unter Wasser', undefined, true),
  S('#T1612', 'THL UNWETTER', 'Unwetter', 'Fahrbahn überschwemmt', undefined, true),
  S('#T1710', 'THL WASSER', 'Wasser', 'Rettung Person', undefined, true),
  S('#T1711', 'THL WASSER', 'Wasser', 'Rettung Tier', undefined, true),
  S('#T1810', 'THL GROßTIERRETTUNG', 'Tier', 'Großtier (Kuh, Pferd)', undefined, true),
  S('#T1910', 'THL TRAGEHILFE', 'RD', 'Tragehilfe', undefined, true),
  S('#T1911', 'THL RETTUNGSKORB', 'RD', 'Drehleiter mit Krankentragenhalterung', undefined, true),

  // ---- Rettungsdienst (Gruppen nach ABek: 10 Bewusstsein, 20 Atmung, 30 Herz/Kreislauf, 40 Schmerzen,
  //      50 Neuro/Psych, 60 Trauma, 70 Kind, 90 KTP; xx00 ohne NA, xx10 mit NA) ----
  S('#R1000', 'RD 1', 'Bewusstsein', 'Bewusstseinsstörung, nicht zunehmend', undefined, true),
  S('#R1010', 'RD 2', 'Bewusstsein', 'bewusstlos / vitale Bedrohung', undefined, true),
  S('#R2000', 'RD 1', 'Atmung', 'Atemnot, nicht zunehmend', undefined, true),
  S('#R2010', 'RD 2', 'Atmung', 'akute Atemnot / vitale Bedrohung', undefined, true),
  S('#R3000', 'RD 1', 'Herz/Kreislauf', 'Kollaps, wieder wach', undefined, true),
  S('#R3010', 'RD 2', 'Herz/Kreislauf', 'Brustschmerz / V. a. Herzinfarkt', undefined, true),
  S('#R3011', 'RD 2', 'Herz/Kreislauf', 'Kreislaufstillstand / Reanimation', undefined, true),
  S('#R4000', 'RD 1', 'Schmerzen', 'akute Schmerzen, nicht zunehmend', undefined, true),
  S('#R4010', 'RD 2', 'Schmerzen', 'stärkste Schmerzen', undefined, true),
  S('#R5000', 'RD 1', 'Neuro', 'neurologische Ausfälle ohne Bewusstseinsstörung', undefined, true),
  S('#R5010', 'RD 2', 'Neuro', 'V. a. Schlaganfall', undefined, true),
  S('#R5011', 'RD 2', 'Neuro', 'Krampfanfall', undefined, true),
  S('#R5100', 'RD 1', 'Psych', 'psychischer Ausnahmezustand', undefined, true),
  S('#R5110', 'RD 2', 'Psych', 'Suizidversuch / Selbstgefährdung', undefined, true),
  S('#R6000', 'RD 1', 'Trauma', 'Sturz / Verletzung, keine vitale Gefährdung', undefined, true),
  S('#R6001', 'RD 1', 'Trauma', 'VU ohne vitale Gefährdung (nur RD)', undefined, true),
  S('#R6010', 'RD 2', 'Trauma', 'schwer verletzt / Sturz aus Höhe', undefined, true),
  S('#R6011', 'RD 2', 'Trauma', 'starke Blutung', undefined, true),
  S('#R7000', 'RD 1', 'Kind', 'Kind erkrankt / verletzt', undefined, true),
  S('#R7010', 'RD 2', 'Kind', 'Kind vitale Bedrohung / Fieberkrampf', undefined, true),
  S('#R0100', 'RD 1', 'Sonstige', 'Intoxikation ohne Vitalbedrohung', undefined, true),
  S('#R0110', 'RD 2', 'Sonstige', 'allergische Reaktion schwer / Anaphylaxie', undefined, true),
  S('#R0111', 'RD 2', 'Sonstige', 'Unterzucker, nicht ansprechbar', undefined, true),
  S('#R0120', 'RD 1', 'Sonstige', 'hilflose Person', undefined, true),
  S('#R0410', 'RD 3', 'MANV', '2 oder 3 Verletzte', undefined, true),
  S('#R0420', 'RD 4', 'MANV', '4 oder 5 Verletzte', undefined, true),
  S('#R0430', 'RD 5', 'MANV', '6 bis 9 Verletzte', undefined, true),
  S('#R0440', 'RD MANV', 'MANV', 'ab 10 Verletzte', undefined, true),
  S('#R9010', 'RD KTP', 'Krankentransport', 'Krankenhaus / Einweisung', undefined, true),
  S('#R9011', 'RD KTP', 'Krankentransport', 'Verlegung', undefined, true),
  S('#R9012', 'RD KTP', 'Krankentransport', 'Dialyse / Heimfahrt', undefined, true),
  S('#R9020', 'RD KTP/RTW', 'Krankentransport', 'schwergewichtiger Patient / KTP mit RTW', undefined, true),
];

/** Anzeige wie im Einsatzleitsystem: "#B1515 - B3 - #Verkehr#LKW / Bus außerorts" */
export function formatSchlagwort(s: Schlagwort): string {
  return `${s.nr} - ${compactStichwort(s.code)} - #${s.kat}#${s.text}`;
}

/** Schlagwort aus dem formatierten Text wiederfinden */
export function findSchlagwort(text?: string): Schlagwort | undefined {
  return text ? SCHLAGWORTE.find((s) => formatSchlagwort(s) === text) : undefined;
}

const fold = (s: string) =>
  s
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss');

/** Schlagworte, die zu einer Eingabe passen: Nummer ("1515"), Stichwort ("B3"), Kategorie oder Meldebild */
export function searchSchlagworte(q: string, codes?: Set<string>, limit = 10): Schlagwort[] {
  const words = fold(q).trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return SCHLAGWORTE.filter((s) => {
    if (codes && !codes.has(s.code)) return false;
    const hay = fold(`${s.nr} ${s.code} ${compactStichwort(s.code)} ${s.kat} ${s.text}`);
    return words.every((w) => hay.includes(w));
  }).slice(0, limit);
}

/** Schlagwort zu Nummer und Stichwort (Nummern wie #B1515 gibt es für mehrere Stichworte) */
export function schlagwortByNr(nr?: string, code?: string): Schlagwort | undefined {
  if (!nr) return undefined;
  return SCHLAGWORTE.find((s) => s.nr === nr && (!code || s.code === code)) ?? SCHLAGWORTE.find((s) => s.nr === nr);
}

/** AAO des Stichworts plus die zusätzlichen RTW des gewählten Schlagworts */
export function aaoMitSchlagwort(aao: Record<string, number>, schlagwort?: string): Record<string, number> {
  const s = findSchlagwort(schlagwort);
  if (!s?.rtw) return aao;
  return { ...aao, RTW: (aao.RTW ?? 0) + s.rtw };
}
