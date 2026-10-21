// Schlagwortkatalog wie im Einsatzleitsystem der bayerischen ILS: "#B1515 - B3 - #Verkehr#LKW / Bus außerorts".
// Quelle ist die Anlage zu Nr. 2.1.4 der Alarmierungsbekanntmachung (ABek). Die Schlagwortnummer setzt sich aus
// Kennbuchstabe, Hauptgruppe und Untergruppe zusammen (#R3010 = Rettungsdienst, Gruppe 30 Herz/Kreislauf, 10 vitale Bedrohung).
// Weggelassen sind nur Stichworte ohne passende Fahrzeuge im Simulator (Bergwacht, Wasserwacht, ITW/ITH, VEF, Flugzeug, Schiff, CBRN).
import { compactStichwort } from './catalog';

export interface Schlagwort {
  /** z. B. "#B1515" */
  nr: string;
  /** Einsatzstichwort nach ABek, z. B. "B 3" */
  code: string;
  /** Kategorie, z. B. "Verkehr" oder "Herz/Kreislauf" */
  kat: string;
  /** Meldebild, z. B. "LKW / Bus außerorts" */
  text: string;
  /** Zusätzliche RTW über die AAO des Stichworts hinaus ("Anzahl (RTW): 1") */
  rtw?: number;
  /** Anmerkung aus der ABek: wann das Schlagwort passt */
  hinweis?: string;
  /** Suchbegriffe, die nicht im Text stehen (z. B. "Herzinfarkt" für #R3010) */
  such?: string;
}

interface Extra {
  rtw?: number;
  hinweis?: string;
  such?: string;
}

const S = (nr: string, code: string, kat: string, text: string, extra?: number | Extra): Schlagwort => {
  const e: Extra = typeof extra === 'number' ? { rtw: extra } : (extra ?? {});
  return { nr, code, kat, text, ...(e.rtw ? { rtw: e.rtw } : {}), ...(e.hinweis ? { hinweis: e.hinweis } : {}), ...(e.such ? { such: e.such } : {}) };
};

export const SCHLAGWORTE: Schlagwort[] = [
  // ---- ABC ----
  S('#A1010', 'ABC 1', 'Geruch', 'undefinierbarer Geruch'),
  S('#A1011', 'ABC 1', 'Geruch', 'Geruch nach Ammoniak'),
  S('#A1012', 'ABC 1', 'Geruch', 'Geruch nach Chlor'),
  S('#A1013', 'ABC 1', 'Geruch', 'Geruch nach Erdgas / Gas'),
  S('#A1110', 'ABC KRAFTSTOFF', 'Gefahrstoff', 'auslaufender Kraftstoff', { such: 'Benzin Diesel Tank' }),
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
  S('#A1910', 'ABC EXPLOSION', 'Gefahrstoff', 'Explosion / Verpuffung'),
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
  S('#B1599', 'B 2 PERSON', 'Alarmstufenerhöhung', 'auf B2 PERSON', 1),
  S('#B1527', 'B 3', 'Alarmstufenerhöhung', 'auf B3'),
  S('#B0000', 'B 3 PERSON', 'Alarmstufenerhöhung', 'auf B3 PERSON', 1),
  S('#B0000', 'B 4', 'Alarmstufenerhöhung', 'auf B4'),
  S('#B1219', 'B 5', 'Alarmstufenerhöhung', 'auf B5'),
  S('#B0000', 'B 6', 'Alarmstufenerhöhung', 'auf B6'),
  S('#B1010', 'B 1', 'im Freien', 'Brandgeruch'),
  S('#B1011', 'B 1', 'im Freien', 'Rauchentwicklung'),
  S('#B1012', 'B 1', 'im Freien', 'Freifläche klein (< 100 m²)', { such: 'Wiese Feld Böschung' }),
  S('#B1014', 'B 1', 'im Freien', 'Abfall-, Müll-, Papiercontainer', { such: 'Mülltonne' }),
  S('#B1024', 'B 1', 'im Freien', 'Kleinbrand'),
  S('#B1118', 'B 1', 'im Gebäude', 'Nachschau', { such: 'Brandnachschau Glutnest' }),
  S('#B1514', 'B 1', 'Verkehr', 'Motorrad'),
  S('#B1013', 'B 2', 'im Freien', 'Wald, klein (< 1000 m²)'),
  S('#B1013', 'B 2', 'im Freien', 'Freifläche groß (> 100 m²)', { such: 'Feld Wiese Hecke Böschung Stoppelfeld' }),
  S('#B1017', 'B 2', 'im Freien', 'Bahndamm'),
  S('#B1018', 'B 2', 'im Freien', 'Bau-, Wohncontainer'),
  S('#B1020', 'B 2', 'im Freien', 'Gartenhütte, Schuppen'),
  S('#B1115', 'B 2', 'im Gebäude', 'Kamin', { such: 'Kaminbrand Schornstein' }),
  S('#B1122', 'B 2', 'im Gebäude', 'überhitzter Ofen / Ölofen'),
  S('#B1510', 'B 2', 'Verkehr', 'PKW', { such: 'Auto Fahrzeugbrand' }),
  S('#B1511', 'B 2', 'Verkehr', 'PKW auf BAB', { such: 'Autobahn' }),
  S('#B1515', 'B 2', 'Verkehr', 'LKW / Bus innerorts'),
  S('#B1019', 'B 2 PERSON', 'im Freien', 'Bau-, Wohncontainer (Person in Gefahr)', 1),
  S('#B1021', 'B 2 PERSON', 'im Freien', 'Gartenhütte / Schuppen (Person in Gefahr)', 1),
  S('#B1022', 'B 2 PERSON', 'im Freien', 'Person', 1),
  S('#B1512', 'B 2 PERSON', 'Verkehr', 'PKW (Person in Gefahr)', 1),
  S('#B1513', 'B 2 PERSON', 'Verkehr', 'PKW auf BAB (Person in Gefahr)', 1),
  S('#B1015', 'B 3', 'im Freien', 'am Gebäude'),
  S('#B1110', 'B 3', 'im Gebäude', 'Brandgeruch'),
  S('#B1111', 'B 3', 'im Gebäude', 'Dachstuhl'),
  S('#B1113', 'B 3', 'im Gebäude', 'Dehnfuge'),
  S('#B1114', 'B 3', 'im Gebäude', 'Garage'),
  S('#B1116', 'B 3', 'im Gebäude', 'Keller'),
  S('#B1119', 'B 3', 'im Gebäude', 'Rauchentwicklung'),
  S('#B1123', 'B 3', 'im Gebäude', 'Zimmer', { such: 'Wohnung Küche' }),
  S('#B1528', 'B 3', 'im Gebäude', 'überhitzter Heustock'),
  S('#B1414', 'B 3', 'Landwirtschaft', 'Fahrzeug / Maschine', { such: 'Traktor Mähdrescher' }),
  S('#B1515', 'B 3', 'Verkehr', 'LKW / Bus außerorts'),
  S('#B1516', 'B 3', 'Verkehr', 'LKW / Bus auf BAB'),
  S('#B1112', 'B 3 PERSON', 'im Gebäude', 'Dachstuhl (Person in Gefahr)', 1),
  S('#B1114', 'B 3 PERSON', 'im Gebäude', 'Garage (Person in Gefahr)', 1),
  S('#B1117', 'B 3 PERSON', 'im Gebäude', 'Keller (Person in Gefahr)', 1),
  S('#B1120', 'B 3 PERSON', 'im Gebäude', 'Rauchentwicklung (Person in Gefahr)', 1),
  S('#B1124', 'B 3 PERSON', 'im Gebäude', 'Zimmer (Person in Gefahr)', { rtw: 1, such: 'Wohnung Küche' }),
  S('#B1517', 'B 3 PERSON', 'Verkehr', 'LKW (Person in Gefahr)', 1),
  S('#B1518', 'B 3 PERSON', 'Verkehr', 'LKW auf BAB (Person in Gefahr)', 1),
  S('#B1120', 'B 4', 'im Gebäude', 'ausgedehnt / hoch bis 6. OG', 1),
  S('#B1121', 'B 4', 'im Gebäude', 'Tiefgarage'),
  S('#B1211', 'B 4', 'Gebäude hohe Personenzahl', 'Hochhaus ab 7. OG', 1),
  S('#B1212', 'B 4', 'Gebäude hohe Personenzahl', 'Hotel', 1),
  S('#B1214', 'B 4', 'Gebäude hohe Personenzahl', 'Supermarkt', 1),
  S('#B1215', 'B 4', 'Gebäude hohe Personenzahl', 'Kindergarten', 1),
  S('#B1216', 'B 4', 'Gebäude hohe Personenzahl', 'Kino', 1),
  S('#B1217', 'B 4', 'Gebäude hohe Personenzahl', 'Kirche', 1),
  S('#B1219', 'B 4', 'Gebäude hohe Personenzahl', 'Schule', 1),
  S('#B1220', 'B 4', 'Gebäude hohe Personenzahl', 'Theater', 1),
  S('#B1221', 'B 4', 'Gebäude hohe Personenzahl', 'Zirkus', 1),
  S('#B1233', 'B 4', 'Gebäude hohe Personenzahl', 'Wohnheim', 1),
  S('#B1234', 'B 4', 'Gebäude hohe Personenzahl', 'Behinderteneinrichtung', 1),
  S('#B1313', 'B 4', 'Gewerbe / Industrie', 'Sägewerk / Schreinerei', 1),
  S('#B1314', 'B 4', 'Gewerbe / Industrie', 'Industriegebäude', 1),
  S('#B1315', 'B 4', 'Gewerbe / Industrie', 'Lagerhalle', 1),
  S('#B1316', 'B 4', 'Gewerbe / Industrie', 'Silo (kein Gefahrstoff)'),
  S('#B1320', 'B 4', 'Gewerbe / Industrie', 'große Höhe – Turm'),
  S('#B1320', 'B 4', 'Gewerbe / Industrie', 'große Höhe – Windrad'),
  S('#B1410', 'B 4', 'Landwirtschaft', 'Bauernhof'),
  S('#B1412', 'B 4', 'Landwirtschaft', 'Stall / Scheune', { such: 'Heu Stadel' }),
  S('#B1413', 'B 4', 'Landwirtschaft', 'Aussiedlerhof'),
  S('#B1210', 'B 5', 'Gebäude hohe Personenzahl', 'Pflege- / Altenheim', 1),
  S('#B1213', 'B 5', 'Gebäude hohe Personenzahl', 'Kaufhaus', 1),
  S('#B1218', 'B 5', 'Gebäude hohe Personenzahl', 'Krankenhaus', 1),
  S('#B1710', 'B BMA', 'Meldeanlage', 'Brandmeldeanlage', { such: 'BMA Feuermelder' }),
  S('#B1713', 'B BMA', 'Meldeanlage', 'Rauchwarnmelder über Hausnotruf'),
  S('#B1715', 'B BMA', 'Meldeanlage', 'Rauchwarnmelder', { such: 'Heimrauchmelder piept' }),
  S('#B1520', 'B BOOT', 'Verkehr', 'Boot / Yacht / Floß'),
  S('#B1312', 'B ELEKTROANLAGE', 'Gewerbe / Industrie', 'Elektroanlage / Trafo'),
  S('#B1023', 'B WALD', 'im Freien', 'Wald groß (> 1000 m²)'),
  S('#B1024', 'B WALD', 'im Freien', 'Bergwald'),
  S('#B1523', 'B ZUG', 'Verkehr', 'Personenzug', 1),
  S('#B1524', 'B ZUG', 'Verkehr', 'Güterzug'),
  S('#B1525', 'B ZUG', 'Verkehr', 'Zug nur Lokomotive'),
  S('#B1528', 'B ZUG', 'Verkehr', 'Straßenbahn', 1),

  // ---- Technische Hilfe ----
  S('#T1110', 'THL BELEUCHTUNG', 'klein', 'Einsatzstelle ausleuchten'),
  S('#T1310', 'THL BOMBENFUND', 'Bombe / Amok', 'Bombenfund', { such: 'Fliegerbombe Weltkriegsbombe Munition' }),
  S('#T1410', 'THL ERKUNDUNG', 'klein', 'Erkundung'),
  S('#T1510', 'THL FIRST RESPONDER', 'RD', 'First Responder', { such: 'HvO Helfer vor Ort' }),
  S('#T1610', 'THL GEBÄUDEEINSTURZ', 'Einsturz / Umsturz', 'Gebäude eingestürzt'),
  S('#T1710', 'THL GROßTIERRETTUNG', 'Tier', 'Rettung Großtier (z. B. Kuh, Pferd)'),
  S('#T1810', 'THL HUBSCHRAUBERLANDUNG', 'Rettung', 'Hubschrauberlandung sichern', { such: 'RTH Landeplatz' }),
  S('#T1910', 'THL P AUFZUG', 'Rettung', 'Aufzug öffnen akut', { such: 'Fahrstuhl steckengeblieben' }),
  S('#T2011', 'THL P RETTUNG H / T', 'Absturz / Höhe', 'Person droht zu springen', { such: 'Suizid Brücke Dach' }),
  S('#T2012', 'THL P RETTUNG H / T', 'Absturz / Höhe', 'Person absturzgefährdet'),
  S('#T2013', 'THL P RETTUNG H / T', 'Absturz / Höhe', 'Person in Höhe'),
  S('#T2014', 'THL P RETTUNG H / T', 'Absturz / Höhe', 'Person aus Tiefe / Schacht', { such: 'Grube Brunnen' }),
  S('#T2015', 'THL P RETTUNG H / T', 'Absturz / Höhe', 'schwergewichtiger Patient'),
  S('#T2016', 'THL P RETTUNG H / T', 'Absturz / Höhe', 'Person auf Windrad / Kran'),
  S('#T2017', 'THL P RETTUNG H / T', 'Absturz / Höhe', 'Paraglider / Fallschirmspringer / Drachenflieger'),
  S('#T2110', 'THL P STRAßENBAHN', 'VU', 'Person unter Straßenbahn', { such: 'Tram' }),
  S('#T2111', 'THL P STRAßENBAHN', 'VU', 'Straßenbahn', { such: 'Tram' }),
  S('#T2210', 'THL P STROM', 'Rettung', 'Person Stromunfall', { such: 'Stromschlag' }),
  S('#T2311', 'THL P VERSCHÜTTET', 'Rettung', 'Person verschüttet / Tiefbauunfall', { such: 'Graben Baugrube' }),
  S('#T2312', 'THL P VERSCHÜTTET', 'Rettung', 'Person in Silo'),
  S('#T2410', 'THL P EINGESCHLOSSEN', 'Rettung', 'Wohnung öffnen akut', { such: 'Türöffnung Tür hilflose Person' }),
  S('#T2411', 'THL P EINGESCHLOSSEN', 'Rettung', 'Fahrzeug öffnen akut', { such: 'Kind im Auto Tier im Auto' }),
  S('#T2510', 'THL P ZUG', 'VU', 'Person unter Zug', { such: 'Bahn Personenunfall' }),
  S('#T2511', 'THL P ZUG', 'VU', 'Person unter S-Bahn'),
  S('#T2512', 'THL P ZUG', 'VU', 'Person vom Zug erfasst', { such: 'Bahn Personenunfall' }),
  S('#T2610', 'THL RETTUNGSKORB', 'RD', 'Drehleiter', { hinweis: 'Drehleiter mit Krankentragenhalterung', such: 'DLK Krankentragenhalterung' }),
  S('#T2710', 'THL 1', 'klein', 'allgemein'),
  S('#T2711', 'THL 1', 'klein', 'Baum auf Straße'),
  S('#T2712', 'THL 1', 'klein', 'Baum auf Schiene'),
  S('#T2713', 'THL 1', 'klein', 'Dach räumen', { such: 'Schnee' }),
  S('#T2714', 'THL 1', 'klein', 'Fahrzeug öffnen'),
  S('#T2715', 'THL 1', 'klein', 'Fahrzeug sichern'),
  S('#T2716', 'THL 1', 'klein', 'Wohnung öffnen', { hinweis: 'nicht akut' }),
  S('#T2717', 'THL 1', 'klein', 'Gebäude sichern'),
  S('#T2718', 'THL 1', 'klein', 'Gegenstand / Teil sichern', { such: 'Dachziegel' }),
  S('#T2719', 'THL 1', 'klein', 'Straße reinigen', { such: 'Ölspur Betriebsmittel' }),
  S('#T2720', 'THL 1', 'klein', 'Straße überschwemmt'),
  S('#T2721', 'THL 1', 'klein', 'Wasser im Keller', { such: 'Wasserschaden Rohrbruch' }),
  S('#T2722', 'THL 1', 'klein', 'Wasser in Gebäude', { such: 'Wasserschaden Rohrbruch' }),
  S('#T2723', 'THL 1', 'RD', 'Unterstützung'),
  S('#T2724', 'THL 1', 'Rettung', 'Personensuche', { such: 'vermisst' }),
  S('#T2725', 'THL 1', 'VU', 'mit Motorrad', { hinweis: 'ohne eingeklemmte Person' }),
  S('#T2726', 'THL 1', 'VU', 'mit PKW', { hinweis: 'ohne eingeklemmte Person', such: 'Unfall Auto' }),
  S('#T2727', 'THL 1', 'Tier', 'Insekten (Gefahr für Personen)', { such: 'Wespen Hornissen Bienen' }),
  S('#T2728', 'THL 1', 'Tier', 'Rettung Kleintier', { such: 'Katze Hund Baum' }),
  S('#T2729', 'THL 1', 'Tier', 'Bergung Kleintier'),
  S('#T2730', 'THL 1', 'Tier', 'Bergung Großtier (z. B. Kuh, Pferd)'),
  S('#T2731', 'THL 1', 'Rettung', 'Waldunfall ohne eingeklemmte Person'),
  S('#T2732', 'THL 1', 'klein', 'Verkehrslenkung'),
  S('#T2810', 'THL 2', 'VU', 'mehrere PKW', { hinweis: 'ohne eingeklemmte Person', such: 'Unfall Auffahrunfall' }),
  S('#T2811', 'THL 2', 'VU', 'LKW / Bus (leer), ohne eingeklemmte Person'),
  S('#T2910', 'THL 3', 'Rettung', 'Person eingeklemmt (nicht VU)', { such: 'Maschine Arbeitsunfall' }),
  S('#T2911', 'THL 3', 'VU', '1 oder 2 PKW, Person eingeklemmt', { such: 'Unfall eingeklemmt' }),
  S('#T2912', 'THL 3', 'VU', 'Bus (besetzt)', 1),
  S('#T2913', 'THL 3', 'Einsturz / Umsturz', 'Gerüst umgestürzt'),
  S('#T2914', 'THL 3', 'Einsturz / Umsturz', 'Stromleitungsmast umgestürzt'),
  S('#T2915', 'THL 3', 'Einsturz / Umsturz', 'Kran umgestürzt'),
  S('#T2916', 'THL 3', 'Rettung', 'Waldunfall mit eingeklemmter Person', { such: 'Baum Forst' }),
  S('#T3010', 'THL 4', 'VU', 'mehrere PKW, Personen eingeklemmt'),
  S('#T3011', 'THL 4', 'VU', 'LKW / Bus (leer), Person eingeklemmt'),
  S('#T3110', 'THL 5', 'VU', 'Massenkarambolage, Personen eingeklemmt'),
  S('#T3111', 'THL 5', 'VU', 'Bus besetzt mit eingeklemmten Personen'),
  S('#T3110', 'THL 5', 'VU', 'mehrere LKW mit eingeklemmten Personen'),
  S('#T3210', 'THL SCHIENE', 'klein', 'Hilfeleistung Straßenbahn', { such: 'Tram entgleist' }),
  S('#T3211', 'THL SCHIENE', 'klein', 'Hilfeleistung S-Bahn'),
  S('#T3310', 'THL WASSER', 'Wasser', 'Bergung Sache / Leiche'),
  S('#T3311', 'THL WASSER', 'Wasser', 'Rettung Tier'),
  S('#T3312', 'THL WASSER', 'Wasser', 'Rettung Person', { such: 'ertrinken Main Fluss' }),
  S('#T3410', 'THL TRAGEHILFE', 'RD', 'Tragehilfe'),
  S('#T3510', 'THL UNWETTER', 'Unwetter', 'Baum / Ast droht zu fallen'),
  S('#T3511', 'THL UNWETTER', 'Unwetter', 'Baum / Ast auf Fahrbahn'),
  S('#T3512', 'THL UNWETTER', 'Unwetter', 'Baum / Ast auf Schiene'),
  S('#T3513', 'THL UNWETTER', 'Unwetter', 'Baum / Ast auf Gebäude'),
  S('#T3514', 'THL UNWETTER', 'Unwetter', 'Baum / Ast auf Stromleitung'),
  S('#T3515', 'THL UNWETTER', 'Unwetter', 'Baum / Ast auf PKW / LKW'),
  S('#T3516', 'THL UNWETTER', 'Unwetter', 'Baum umgestürzt', { such: 'Sturm' }),
  S('#T3517', 'THL UNWETTER', 'Unwetter', 'Bauteil / Gegenstand droht zu fallen'),
  S('#T3518', 'THL UNWETTER', 'Unwetter', 'Gebäude sichern'),
  S('#T3519', 'THL UNWETTER', 'Unwetter', 'Bauzaun sichern'),
  S('#T3520', 'THL UNWETTER', 'Unwetter', 'Fahrbahn / Gehweg überschwemmt'),
  S('#T3521', 'THL UNWETTER', 'Unwetter', 'Gebäude unter Wasser'),
  S('#T3522', 'THL UNWETTER', 'Unwetter', 'Keller unter Wasser', { such: 'Starkregen' }),
  S('#T3523', 'THL UNWETTER', 'Unwetter', 'Fahrzeug / sonstigen Gegenstand sichern'),
  S('#T3524', 'THL UNWETTER', 'Unwetter', 'Erkundung nicht zeitkritisch'),
  S('#T3525', 'THL UNWETTER', 'Unwetter', 'sonstiger Schaden'),
  S('#T3910', 'THL VU ZUG', 'VU', 'Zug', { such: 'Bahnunfall Bahnübergang entgleist' }),

  // ---- Rettungsdienst ----
  S('#R1000', 'RD 1', 'Bewusstsein', 'Bewusstsein', {
    hinweis: 'neu aufgetretene, nicht zunehmende Bewusstseinsstörung',
    such: 'verwirrt benommen schläfrig hilflose Person',
  }),
  S('#R1010', 'RD 2', 'Bewusstsein', 'vitale Bedrohung', {
    hinweis: 'rasch zunehmende Bewusstseinsstörung oder Bewusstlosigkeit (keine Reaktion auf Ansprache, Rütteln, Schmerzreiz)',
    such: 'bewusstlos nicht ansprechbar reagiert nicht',
  }),
  S('#R1090', 'RD 2', 'Bewusstsein', 'Nachforderung NA'),
  S('#R2000', 'RD 1', 'Atmung', 'Atmung', { hinweis: 'neu aufgetretene, nicht zunehmende Atembeschwerden', such: 'Atemnot Husten Luftnot' }),
  S('#R2010', 'RD 2', 'Atmung', 'vitale Bedrohung', {
    hinweis: 'rasch zunehmende Atemstörung, ausgeprägte Atemnot mit Zyanose, Stridor, Aspiration, Atemstillstand',
    such: 'Atemnot Asthma Erstickung Bolus verschluckt Zyanose COPD',
  }),
  S('#R2090', 'RD 2', 'Atmung', 'Nachforderung NA'),
  S('#R3000', 'RD 1', 'Herz/Kreislauf', 'Herz/Kreislauf', {
    hinweis: 'nicht zunehmende Herz-/Kreislaufbeschwerden, Blutdruckentgleisung ohne Symptome (nur Messwert)',
    such: 'Kollaps Synkope Blutdruck Schwindel Kreislauf umgekippt',
  }),
  S('#R3010', 'RD 2', 'Herz/Kreislauf', 'vitale Bedrohung', {
    hinweis: 'akuter Brustschmerz, Schockzeichen, Rhythmusstörung oder Blutdruckentgleisung mit Symptomen, schwere allergische Reaktion',
    such: 'Brustschmerz Herzinfarkt ACS Schock Allergie Anaphylaxie Rhythmusstörung Schrittmacher',
  }),
  S('#R3020', 'RD 2', 'Herz/Kreislauf', 'Kreislaufstillstand/Reanimation', {
    hinweis: 'Bewusstlosigkeit und keine oder keine normale Atmung, Schnappatmung',
    such: 'Reanimation CPR Herzstillstand leblos Schnappatmung',
  }),
  S('#R3090', 'RD 2', 'Herz/Kreislauf', 'Nachforderung NA'),
  S('#R4000', 'RD 1', 'Schmerzen', 'Schmerzen', { hinweis: 'neu aufgetretene, nicht zunehmende Schmerzen', such: 'Bauchschmerz Rückenschmerz Kopfschmerz' }),
  S('#R4010', 'RD 2', 'Schmerzen', 'Schmerzen – stark', {
    hinweis: 'stärkste Schmerzen, schlagartige stärkste Kopfschmerzen, kolikartige Schmerzen',
    such: 'Kolik Bauchschmerz Vernichtungskopfschmerz',
  }),
  S('#R4090', 'RD 2', 'Schmerzen', 'Schmerzen – Nachforderung NA'),
  S('#R5000', 'RD 1', 'Neuro/Psych', 'Neuro', {
    hinweis: 'nicht zunehmende neurologische Ausfälle ohne Bewusstseinsstörung, Z. n. einmaligem Krampfanfall',
    such: 'Schlaganfall Lähmung Sprachstörung Krampfanfall Stroke',
  }),
  S('#R5010', 'RD 2', 'Neuro/Psych', 'Neuro – vitale Bedrohung', {
    hinweis: 'neurologische Ausfälle mit Bewusstseinsstörung, anhaltender Krampfanfall, mehrere Krampfanfälle in Folge',
    such: 'Schlaganfall Krampfanfall Status Epilepsie Stroke',
  }),
  S('#R5090', 'RD 2', 'Neuro/Psych', 'Neuro – Nachforderung NA'),
  S('#R5100', 'RD 1', 'Neuro/Psych', 'Psych', { hinweis: 'psychiatrischer Zustand ohne erhebliche Gefährdung', such: 'psychisch Panik Angst Psychose' }),
  S('#R5110', 'RD 2', 'Neuro/Psych', 'Psych – vitale Bedrohung', {
    hinweis: 'erhebliche Selbst- oder Fremdgefährdung, Suizid/-versuch',
    such: 'Suizid Suizidversuch Selbstgefährdung',
  }),
  S('#R5111', 'RD 2', 'Neuro/Psych', 'Psych – vitale Bedrohung – mit Polizei', {
    hinweis: 'Suizid(versuch) im öffentlichen Bereich oder mit möglicher Fremdgefährdung',
    such: 'Suizid Fremdgefährdung aggressiv',
  }),
  S('#R5190', 'RD 2', 'Neuro/Psych', 'Psych – Nachforderung NA'),
  S('#R6000', 'RD 1', 'Trauma', 'Trauma', {
    hinweis: 'akute Verletzung ohne Anhalt für vitale Gefährdung, Stromunfall ohne Symptome',
    such: 'Sturz Verletzung Fraktur Bruch Schnittwunde Platzwunde',
  }),
  S('#R6001', 'RD 1', 'Trauma', 'Verkehrsunfall (VU) nur RD', { hinweis: 'VU ohne Anhalt für vitale Gefährdung, keine Feuerwehr nötig', such: 'Unfall Fahrrad Radfahrer' }),
  S('#R6010', 'RD 2', 'Trauma', 'vitale Bedrohung – Person verletzt schwer', {
    hinweis: 'Sturz > 3 m, Hochrasanztrauma, Fußgänger-/Zweiradkollision, penetrierende Verletzung, Stromunfall mit Symptomen',
    such: 'Sturz Höhe Leiter Treppe Polytrauma',
  }),
  S('#R6011', 'RD 2', 'Trauma', 'vitale Bedrohung – Verkehrsunfall (VU) nur RD', { such: 'Unfall Fußgänger Motorrad Radfahrer' }),
  S('#R6020', 'RD 2', 'Trauma', 'vitale Bedrohung – Arbeitsunfall', { such: 'Baustelle Maschine' }),
  S('#R6030', 'RD 2', 'Trauma', 'vitale Bedrohung – Starke Blutung', { such: 'Blutung Schnitt Amputation' }),
  S('#R6040', 'RD 2', 'Trauma', 'vitale Bedrohung – Unfall (Schule, Kindergarten, Kita)'),
  S('#R6090', 'RD 2', 'Trauma', 'Nachforderung NA'),
  S('#R7000', 'RD 1', 'Kind', '(bis 12 Jahre) Erkrankt', { such: 'Kind Fieber Vergiftung' }),
  S('#R7001', 'RD 1', 'Kind', '(bis 12 Jahre) Trauma', { such: 'Kind Sturz verletzt' }),
  S('#R7002', 'RD 1', 'Kind', 'Inkubator – Intensiv'),
  S('#R7003', 'RD 1', 'Kind', 'Neugeborenen-Holdienst (NHD)'),
  S('#R7010', 'RD 2-KIND', 'Kind', '(bis 12 Jahre) Erkrankt – vitale Bedrohung', {
    hinweis: 'Stridor, generalisierter Krampfanfall, Dehydratation mit Vigilanzminderung, Vergiftung mit Symptomen',
    such: 'Kind Fieberkrampf Krampf Pseudokrupp Atemnot',
  }),
  S('#R7011', 'RD 2-KIND', 'Kind', '(bis 12 Jahre) Trauma – vitale Bedrohung', { such: 'Kind schwer verletzt' }),
  S('#R7020', 'RD 2-KIND', 'Kind', '(bis 12 Jahre) Kreislaufstillstand/Reanimation', { such: 'Kind Reanimation' }),
  S('#R7030', 'RD 2-KIND', 'Kind', '(bis 1 Jahr) Kreislaufstillstand/Reanimation', { such: 'Säugling Baby Reanimation' }),
  S('#R7090', 'RD 2-KIND', 'Kind', '(bis 12 Jahre) Nachforderung NA'),
  S('#R9010', 'RD KTP', 'KTP', 'KTP – Transport zum Krankenhaus', { such: 'Einweisung Krankentransport' }),
  S('#R9011', 'RD KTP', 'KTP', 'KTP – Verlegung'),
  S('#R9012', 'RD KTP', 'KTP', 'KTP – Heimfahrt'),
  S('#R9013', 'RD KTP', 'KTP', 'KTP – Ambulanzfahrt'),
  S('#R9014', 'RD KTP', 'KTP', 'KTP – Unterbringung', { hinweis: 'Einweisung nach Unterbringungsgesetz' }),
  S('#R9015', 'RD KTP', 'KTP', 'KTP – Inkubator'),
  S('#R9016', 'RD KTP', 'KTP', 'KTP – Dialyse'),
  S('#R9017', 'RD KTP', 'KTP', 'KTP – nicht disponibel (Prio 2)', { hinweis: 'vom nächsten freien KTW bedient' }),
  S('#R9018', 'RD KTP', 'KTP', 'KTP – Wohnungswechsel'),
  S('#R9019', 'RD KTP', 'KTP', 'KTP – sonstiger Transport'),
  S('#R9020', 'RD KTP/RTW', 'KTP', 'KTP – Übernahme Landeplatz'),
  S('#R9021', 'RD KTP/RTW', 'KTP', 'KTP – mit RTW', { hinweis: 'Ausstattung oder Qualifikation nur auf dem RTW' }),
  S('#R9022', 'RD KTP/RTW', 'KTP', 'KTP – Schwergewichtiger Patient', { hinweis: 'über 150 kg oder extreme Körperbreite' }),
  S('#R9201', 'RD KTP', 'Verlegung', 'Verlegung – nicht disponibel mit KTW (Prio 1)'),
  S('#R9202', 'RD 1', 'Verlegung', 'Verlegung – Notfalltransport mit RTW'),
  S('#R9203', 'RD 2', 'Verlegung', 'Verlegung – Notfalltransport mit NA'),
  S('#R0100', 'RD 1', 'Sonstige', 'Sonstiges Ereignis/Zustand', {
    hinweis: 'Stoffwechselentgleisung ohne Symptome, Blutung (Magen-Darm, gynäkologisch, Nase), Temperaturentgleisung',
    such: 'Diabetes Zucker Nasenbluten Fieber Unterkühlung Erbrechen',
  }),
  S('#R0101', 'RD 1', 'Sonstige', 'Sonstiges Ereignis/Zustand – Intoxikation', {
    hinweis: 'Vergiftung ohne Hinweis auf Störung von Herz, Kreislauf oder Bewusstsein',
    such: 'Vergiftung Alkohol Drogen Tabletten betrunken',
  }),
  S('#R0102', 'RD 1', 'Sonstige', 'Sonstiges Ereignis/Zustand – Geburt/Entbindung', {
    hinweis: 'Wehen, Blasensprung, Geburt nicht unmittelbar bevorstehend',
    such: 'Wehen Schwangerschaft Fruchtwasser Blasensprung',
  }),
  S('#R0110', 'RD 2', 'Sonstige', 'Sonstiges Ereignis/Zustand – vitale Bedrohung', {
    hinweis: 'Stoffwechselentgleisung mit Symptomen, Blutung oder Temperaturentgleisung mit Vitalbedrohung',
    such: 'Unterzucker Hypoglykämie Diabetes Blutung Hitzschlag Unterkühlung',
  }),
  S('#R0111', 'RD 2', 'Sonstige', 'Sonstiges Ereignis/Zustand – vitale Bedrohung – Intoxikation', { such: 'Vergiftung Überdosis Drogen Tabletten' }),
  S('#R0112', 'RD 2', 'Sonstige', 'Sonstiges Ereignis/Zustand – Geburt/Entbindung akut', {
    hinweis: 'Wehenabstand unter 3 Minuten, einsetzende Geburt, Blutung in der Schwangerschaft',
    such: 'Geburt Wehen Pressdrang',
  }),
  S('#R0190', 'RD 2', 'Sonstige', 'Sonstiges Ereignis/Zustand – vitale Bedrohung – Nachforderung NA'),
  S('#R0200', 'RD 1', 'Ärger', 'Ärger', { hinweis: 'verletzt nach Schlägerei ohne akute Vitalbedrohung', such: 'Schlägerei Körperverletzung Streit' }),
  S('#R0210', 'RD 2', 'Ärger', 'Ärger – vitale Bedrohung', { hinweis: 'verletzt nach Schlägerei mit akuter Vitalbedrohung', such: 'Schlägerei' }),
  S('#R0220', 'RD 2', 'Ärger', 'Ärger – Geiselnahme'),
  S('#R0230', 'RD 2', 'Ärger', 'Ärger – Schuss, Hieb- und Stichverletzung(en)', { such: 'Messer Stich Schuss Waffe' }),
  S('#R0290', 'RD 2', 'Ärger', 'Ärger – vitale Bedrohung – Nachforderung NA'),
  S('#R0300', 'RD 1', 'Sonstige', 'Hausnotruf aktiver Alarm', { such: 'Hausnotruf Notrufknopf' }),
  S('#R0410', 'RD 3', 'Sonstige', '2 oder 3 verletzte/erkrankte Personen', { such: 'MANV mehrere Verletzte' }),
  S('#R0420', 'RD 4', 'Sonstige', '4 oder 5 verletzte/erkrankte Personen', { such: 'MANV mehrere Verletzte' }),
  S('#R0430', 'RD 5', 'Sonstige', '6 bis 9 verletzte/erkrankte Personen', { such: 'MANV mehrere Verletzte' }),
  S('#R0440', 'RD MANV 10 – 15', 'Sonstige', '10 bis 15 verletzte/erkrankte Personen', { such: 'MANV Massenanfall' }),
  S('#R0441', 'RD MANV 16 – 25', 'Sonstige', '16 bis 25 verletzte/erkrankte Personen', { such: 'MANV Massenanfall' }),
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

/** Schlagworte, die zu einer Eingabe passen: Nummer ("1515"), Stichwort ("B3"), Kategorie, Meldebild oder Suchbegriff ("Herzinfarkt") */
export function searchSchlagworte(q: string, codes?: Set<string>, limit = 10): Schlagwort[] {
  const words = fold(q).trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return SCHLAGWORTE.filter((s) => {
    if (codes && !codes.has(s.code)) return false;
    const hay = fold(`${s.nr} ${s.code} ${compactStichwort(s.code)} ${s.kat} ${s.text} ${s.such ?? ''} ${s.hinweis ?? ''}`);
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

/** Schlagworte eines Stichworts nach Kategorie gruppiert, z. B. RD 1 -> Bewusstsein, Atmung, Herz/Kreislauf, … */
export function schlagworteNachKategorie(code: string): [string, Schlagwort[]][] {
  const groups = new Map<string, Schlagwort[]>();
  for (const s of SCHLAGWORTE) {
    if (s.code !== code) continue;
    if (!groups.has(s.kat)) groups.set(s.kat, []);
    groups.get(s.kat)!.push(s);
  }
  return [...groups];
}
