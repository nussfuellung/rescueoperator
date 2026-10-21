// Jahreszeitliche Einsätze, Unwetter mit DWD-Warnungen und Großschadenslagen.
import type { Season } from '../shared/jahreszeit';
import type { DwdMeldung, WetterArt } from '../shared/types';
import { TEMPLATES, type IncidentTemplate } from './callgen';

export interface LageTemplate extends IncidentTemplate {
  /** Kommt nur in diesen Jahreszeiten vor */
  seasons?: Season[];
  /** Typischer Einsatz bei diesem Wetter (Unwetter) */
  wetter?: WetterArt[];
  /** Eröffnungssätze weiterer Anrufer zur selben Lage (Großschadenslage) */
  weitere?: string[];
  /** Weitere Stichworte, die ebenso als richtig gewertet werden */
  auchRichtig?: string[];
}

/** Häufigkeit vorhandener Einsätze je Jahreszeit (fehlt = 1) */
export const SAISON_FAKTOR: Record<string, Partial<Record<Season, number>>> = {
  rd_sturz_glatteis: { winter: 3, herbst: 0.5, fruehling: 0.3, sommer: 0 },
  b_kamin: { winter: 2.5, herbst: 1.4, fruehling: 0.6, sommer: 0.1 },
  b_flaeche: { sommer: 2.5, fruehling: 1.3, herbst: 0.6, winter: 0.05 },
  b_hecke: { sommer: 1.6, fruehling: 1.6, herbst: 0.5, winter: 0.1 },
  rd_rad: { sommer: 1.6, fruehling: 1.3, herbst: 0.8, winter: 0.3 },
  rd_sport: { sommer: 1.3, fruehling: 1.1, winter: 0.6 },
  thl_baum: { herbst: 1.5, winter: 1.2, sommer: 0.8 },
  rd_breath: { fruehling: 1.3, winter: 1.2 },
  rd_kind_fieber: { winter: 1.6, herbst: 1.3, sommer: 0.6 },
  kvb_fieber: { winter: 1.6, herbst: 1.2, sommer: 0.6 },
  rd_kollaps: { sommer: 1.4 },
  thl_wasser: { winter: 1.4 },
};

/** Vorhandene Einsätze, die bei bestimmtem Wetter gehäuft auftreten */
const WETTER_VORHANDEN: Record<string, WetterArt[]> = {
  thl_baum: ['sturm', 'gewitter', 'schnee'],
  rd_sturz_glatteis: ['glatteis', 'schnee'],
  thl_vu_leicht: ['glatteis', 'schnee', 'starkregen'],
  rd_kollaps: ['hitze'],
};

// ---------- Einsätze, die nur zu bestimmten Jahreszeiten vorkommen ----------
export const SAISON_TEMPLATES: LageTemplate[] = [
  {
    id: 'sz_co',
    seasons: ['winter', 'herbst'],
    role: 'angehoerig', age: [30, 70],
    stichwort: 'RD 3',
    schlagwort: '#R0410',
    auchRichtig: ['ABC 3', 'RD 2'],
    weight: 0.3,
    where: 'wohnung',
    needs: { RTW: 2, NEF: 1, HLF: 1 },
    patients: [
      { specialty: 'Innere Medizin', desc: 'CO-Intoxikation, Kopfschmerz, Übelkeit, Hyperbare Oxygenierung prüfen' },
      { specialty: 'Innere Medizin', desc: 'CO-Intoxikation, leichte Symptome' },
    ],
    opening: ['Bei uns piept der Kohlenmonoxid-Melder und meinem Mann und mir ist total schlecht!', 'Hallo, uns ist allen schwindlig und der CO-Warner im Bad schlägt an!'],
    answers: {
      was: ['Wir haben die Gastherme im Bad, seit heute früh haben wir Kopfweh, jetzt ist mir richtig schlecht.'],
      zustand: ['Mein Mann ist ganz benommen, er sitzt auf der Couch. Ich bin auch wackelig.'],
      wieviele: ['Wir sind zu zweit in der Wohnung.'],
      gefahr: ['Der Melder piept immer noch. Sollen wir raus?'],
    },
    lage: 'CO-Austritt aus defekter Gastherme, Messung 180 ppm, Wohnung belüftet, zwei Patienten mit CO-Intoxikation, Gasversorger verständigt.',
    workMin: [25, 40],
  },
  {
    id: 'sz_rodel',
    seasons: ['winter'],
    role: 'angehoerig', age: [7, 12],
    stichwort: 'RD 1',
    schlagwort: '#R7001',
    weight: 0.3,
    where: 'ausserorts',
    patients: [{ specialty: 'Unfallchirurgie', desc: 'Kind, Rodelunfall gegen Baum, V. a. Unterschenkelfraktur' }],
    opening: ['Mein Sohn ist mit dem Schlitten gegen einen Baum gefahren und schreit vor Schmerzen!'],
    answers: {
      was: ['Am Rodelhang, er ist voll gegen den Baum, jetzt kann er das Bein nicht bewegen.'],
      zustand: ['Er ist wach und weint. Am Kopf hat er nichts, er hatte einen Helm auf.'],
      wieviele: ['Nur er, er ist {alter}.'],
      gefahr: ['Es ist steil hier und glatt, der Rettungswagen kommt nur bis zum Parkplatz.'],
    },
    lage: 'Kind nach Rodelunfall, geschlossene Unterschenkelfraktur, Tragestrecke vom Hang ca. 200 m.',
    workMin: [20, 30],
  },
  {
    id: 'sz_eis',
    seasons: ['winter'],
    role: 'passant', age: [10, 16],
    stichwort: 'THL WASSER',
    schlagwort: '#T3312',
    weight: 0.12,
    where: 'ausserorts',
    needs: { HLF: 1, GWW: 1, RTW: 1, NEF: 1 },
    patients: [{ specialty: 'Pädiatrie', desc: 'Kind nach Eiseinbruch, Unterkühlung' }],
    tcpr: false,
    opening: ['Hilfe! Ein Kind ist auf dem Weiher ins Eis eingebrochen!'],
    answers: {
      was: ['Der wollte übers Eis laufen und ist mittendrin eingebrochen, er hält sich am Rand fest!'],
      zustand: ['Er schreit noch, aber er wird immer langsamer!'],
      wieviele: ['Ein Junge, vielleicht zwölf.'],
      gefahr: ['Ich trau mich nicht aufs Eis, das knackt überall!'],
    },
    lage: 'Kind aus Eis gerettet, Kerntemperatur 33 Grad, wach, Wärmeerhalt, Transport.',
    workMin: [25, 35],
  },
  {
    id: 'sz_unterkuehlung',
    seasons: ['winter'],
    role: 'passant', sex: 'm', age: [45, 70],
    stichwort: 'RD 1',
    schlagwort: '#R0100',
    weight: 0.3,
    where: 'strasse',
    patients: [{ specialty: 'Innere Medizin', desc: 'Unterkühlung, Alkoholeinfluss' }],
    opening: ['Hier liegt ein Mann an der Bushaltestelle, der ist ganz kalt und zittert nur noch.'],
    answers: {
      was: ['Der liegt da im Schnee, ich weiß nicht, wie lange schon. Riecht nach Alkohol.'],
      zustand: ['Er murmelt was, aber er kann nicht aufstehen. Die Hände sind eiskalt.'],
      wieviele: ['Einer.'],
      gefahr: ['Nein, nur verdammt kalt hier.'],
    },
    lage: 'Patient mit Unterkühlung, Körpertemperatur 34 Grad, Alkoholeinfluss, ansprechbar.',
    workMin: [12, 18],
  },
  {
    id: 'sz_adventskranz',
    seasons: ['winter'],
    role: 'selbst', sex: 'w', age: [60, 85],
    stichwort: 'B 3',
    schlagwort: '#B1123',
    weight: 0.2,
    where: 'wohnung',
    opening: ['Mein Adventskranz brennt, das Feuer ist schon auf der Tischdecke!'],
    answers: {
      was: ['Die Kerzen sind runtergebrannt und jetzt brennt der ganze Kranz und die Decke.'],
      zustand: ['Mir geht es gut, ich bin im Flur.'],
      wieviele: ['Ich bin allein.'],
      gefahr: ['Das ganze Wohnzimmer ist voller Rauch!'],
    },
    lage: 'Kleinbrand im Wohnzimmer, mit einem C-Rohr abgelöscht, Wohnung belüftet, Bewohnerin unverletzt.',
    workMin: [20, 30],
  },
  {
    id: 'sz_dach_schnee',
    seasons: ['winter'],
    role: 'angehoerig', sex: 'm', age: [45, 75],
    stichwort: 'RD 2',
    schlagwort: '#R6010',
    weight: 0.15,
    where: 'wohnung',
    patients: [{ specialty: 'Unfallchirurgie', desc: 'Sturz vom Garagendach beim Schneeräumen, V. a. Wirbelsäulenverletzung' }],
    opening: ['Mein Mann ist beim Schneeschaufeln vom Garagendach gefallen!'],
    answers: {
      was: ['Er wollte den Schnee vom Dach schieben und ist abgerutscht, bestimmt drei Meter.'],
      zustand: ['Er ist wach, aber er sagt, er spürt die Beine so komisch.'],
      wieviele: ['Nur mein Mann, {alter} Jahre.'],
      gefahr: ['Nein, er liegt im Hof.'],
    },
    lage: 'Patient nach Sturz aus 3 m, Kribbelparästhesien beider Beine, Immobilisation, Transport in Unfallchirurgie.',
    workMin: [20, 30],
  },
  {
    id: 'sz_motorrad',
    seasons: ['fruehling', 'sommer', 'herbst'],
    role: 'passant', sex: 'm', age: [20, 60],
    stichwort: 'RD 2',
    schlagwort: '#R6011',
    polizei: true,
    weight: 0.4,
    where: 'ausserorts',
    needs: { RTW: 1, NEF: 1, HLF: 1 },
    patients: [{ specialty: 'Unfallchirurgie', desc: 'Motorradunfall, Polytrauma' }],
    opening: ['Hier ist ein Motorradfahrer in der Kurve gestürzt, der liegt im Graben!'],
    answers: {
      was: ['Der ist in der Kurve weggerutscht und gegen die Leitplanke, das Motorrad liegt auf der Straße.'],
      zustand: ['Er bewegt sich, aber er stöhnt nur. Den Helm hat er noch auf.'],
      wieviele: ['Nur der Fahrer.'],
      gefahr: ['Da läuft Benzin aus, und die Autos kommen schnell um die Kurve!'],
    },
    lage: 'Motorradfahrer nach Sturz gegen Leitplanke, Becken- und Oberschenkelverletzung, Kraftstoff abgebunden, Straße gesperrt.',
    workMin: [25, 35],
  },
  {
    id: 'sz_kettensaege',
    seasons: ['fruehling', 'herbst'],
    role: 'angehoerig', sex: 'm', age: [40, 75],
    stichwort: 'RD 2',
    schlagwort: '#R6030',
    weight: 0.25,
    where: 'wohnung',
    patients: [{ specialty: 'Chirurgie', desc: 'Schnittverletzung Oberschenkel durch Kettensäge, starke Blutung' }],
    opening: ['Mein Mann hat sich mit der Motorsäge ins Bein geschnitten, das blutet ganz schlimm!'],
    answers: {
      was: ['Er hat im Garten Äste geschnitten, dann ist die Säge abgerutscht. Am Oberschenkel.'],
      zustand: ['Er ist ganz blass. Ich drück ein Handtuch drauf, aber das ist schon durch.'],
      wieviele: ['Nur er.'],
      gefahr: ['Die Säge ist aus.'],
    },
    lage: 'Tiefe Schnittverletzung Oberschenkel, Blutung mit Tourniquet gestillt, Patient kreislaufstabil.',
    workMin: [15, 25],
  },
  {
    id: 'sz_wespe',
    seasons: ['sommer'],
    role: 'angehoerig', age: [20, 70],
    stichwort: 'RD 2',
    schlagwort: '#R3010',
    weight: 0.4,
    where: 'wohnung',
    patients: [{ specialty: 'Innere Medizin', desc: 'Anaphylaxie nach Wespenstich' }],
    opening: ['Meine Frau ist von einer Wespe gestochen worden und kriegt keine Luft mehr!', 'Hilfe, mein Mann hat einen Wespenstich und schwillt im Gesicht ganz an!'],
    answers: {
      was: ['Beim Kaffeetrinken auf der Terrasse, in den Hals. Jetzt hat {er} überall rote Flecken.'],
      zustand: ['{Er} ringt nach Luft und ist ganz weiß im Gesicht.'],
      wieviele: ['Eine Person, {alter} Jahre.'],
      gefahr: ['Da ist noch ein Wespennest unterm Dach.'],
    },
    lage: 'Anaphylaktische Reaktion Grad III nach Wespenstich, Adrenalin verabreicht, Besserung.',
    workMin: [15, 22],
  },
  {
    id: 'sz_badeunfall',
    seasons: ['sommer'],
    role: 'passant', age: [14, 60],
    stichwort: 'THL WASSER',
    schlagwort: '#T3312',
    weight: 0.25,
    where: 'ausserorts',
    needs: { HLF: 1, GWW: 1, RTW: 1, NEF: 1 },
    patients: [{ specialty: 'Innere Medizin', desc: 'Beinahe-Ertrinken, Wasser aspiriert' }],
    tcpr: true,
    opening: ['Hilfe! Da ist einer beim Baden untergegangen und nicht mehr hochgekommen!'],
    answers: {
      was: ['Der ist zur Mitte rausgeschwommen und dann war er weg! Seit ein, zwei Minuten!'],
      zustand: ['Jetzt haben sie ihn rausgezogen, er atmet nicht richtig!'],
      wieviele: ['Ein junger Mann.'],
      gefahr: ['Da ist starke Strömung.'],
      tcpr: ['Ja, ich drücke... eins, zwei, drei... er spuckt Wasser!'],
    },
    lage: 'Person nach Badeunfall aus dem Wasser gerettet, Laienreanimation erfolgreich, Spontanatmung, Transport mit Notarzt.',
    workMin: [25, 35],
  },
  {
    id: 'sz_grill',
    seasons: ['sommer', 'fruehling'],
    role: 'angehoerig', sex: 'm', age: [25, 55],
    stichwort: 'RD 2',
    schlagwort: '#R6010',
    weight: 0.25,
    where: 'wohnung',
    patients: [{ specialty: 'Verbrennungen', desc: 'Verbrennung 2. Grades Gesicht, Arme, ca. 15 % KOF' }],
    opening: ['Mein Freund hat Spiritus in den Grill gekippt, da hat es eine Stichflamme gegeben!'],
    answers: {
      was: ['Die Flamme ist ihm voll ins Gesicht und auf die Arme, die Haare sind angesengt.'],
      zustand: ['Er schreit vor Schmerzen, die Haut ist ganz rot und hat Blasen.'],
      wieviele: ['Nur er.'],
      gefahr: ['Der Grill brennt noch, aber wir halten Abstand.'],
    },
    lage: 'Verbrennung 2. Grades Gesicht und Unterarme, ca. 15 % KOF, keine Inhalationszeichen, Transport Verbrennungszentrum erwägen.',
    workMin: [15, 25],
  },
  {
    id: 'sz_kind_auto',
    seasons: ['sommer'],
    role: 'passant',
    stichwort: 'THL P EINGESCHLOSSEN',
    schlagwort: '#T2411',
    weight: 0.15,
    where: 'strasse',
    needs: { HLF: 1, RTW: 1 },
    patients: [{ specialty: 'Pädiatrie', desc: 'Kleinkind im überhitzten Pkw, Exsikkose' }],
    opening: ['Hier sitzt ein kleines Kind allein im Auto in der prallen Sonne, und das Auto ist zu!'],
    answers: {
      was: ['Auf dem Parkplatz vom Supermarkt. Das Kind ist knallrot und weint nicht mehr.'],
      zustand: ['Es ist ganz schlapp, die Augen fallen ihm zu.'],
      wieviele: ['Ein Kleinkind, vielleicht zwei.'],
      gefahr: ['Nein, aber es ist sicher fünfzig Grad im Auto!'],
    },
    lage: 'Kleinkind aus überhitztem Pkw befreit (Scheibe eingeschlagen), Exsikkose, Kühlung, Transport Kinderklinik.',
    workMin: [15, 20],
  },
  {
    id: 'sz_maehdrescher',
    seasons: ['sommer'],
    role: 'passant',
    stichwort: 'B 3',
    schlagwort: '#B1414',
    weight: 0.2,
    where: 'ausserorts',
    opening: ['Hier brennt ein Mähdrescher mitten auf dem Feld!'],
    answers: {
      was: ['Der Mähdrescher steht in Flammen, und das Feld fängt drumherum auch an.'],
      zustand: ['Der Fahrer ist rausgesprungen, dem geht es gut.'],
      wieviele: ['Keine Verletzten.'],
      gefahr: ['Das Getreide ist knochentrocken, das breitet sich aus!'],
    },
    lage: 'Mähdrescher im Vollbrand, angrenzende Fläche ca. 2000 m² betroffen, Brandbekämpfung mit zwei Rohren.',
    workMin: [35, 55],
  },
  {
    id: 'sz_hitze',
    seasons: ['sommer'],
    role: 'passant', age: [60, 90],
    stichwort: 'RD 1',
    schlagwort: '#R0100',
    weight: 0.35,
    where: 'strasse',
    patients: [{ specialty: 'Innere Medizin', desc: 'Hitzeerschöpfung, Exsikkose' }],
    opening: ['Hier sitzt eine ältere Frau am Straßenrand, der geht es gar nicht gut in der Hitze.'],
    answers: {
      was: ['Sie war einkaufen und ist dann einfach zusammengesackt. Sie hat nichts zu trinken dabei.'],
      zustand: ['Sie ist wach, aber ganz verwirrt und heiß.'],
      wieviele: ['Eine Frau, so um die {alterRund}.'],
      gefahr: ['Nein, wir sitzen im Schatten.'],
    },
    lage: 'Patientin mit Hitzeerschöpfung und Exsikkose, Infusion, Transport.',
    workMin: [12, 18],
  },
  {
    id: 'sz_wild',
    seasons: ['herbst', 'winter', 'fruehling'],
    role: 'selbst', age: [20, 65],
    stichwort: 'RD 1',
    schlagwort: '#R6001',
    polizei: true,
    weight: 0.35,
    where: 'ausserorts',
    patients: [{ specialty: 'Chirurgie', desc: 'Wildunfall, Prellungen, HWS-Distorsion' }],
    opening: ['Mir ist gerade ein Wildschwein ins Auto gelaufen, ich bin im Graben gelandet.'],
    answers: {
      was: ['Das kam aus dem Wald, ich hab noch gebremst, dann hat es gekracht und ich bin von der Straße.'],
      zustand: ['Mir tut der Nacken weh und die Brust vom Gurt. Sonst geht es.'],
      wieviele: ['Nur ich.'],
      gefahr: ['Das Wildschwein liegt noch auf der Straße. Es ist stockdunkel hier.'],
    },
    lage: 'Wildunfall, Fahrerin leicht verletzt (HWS-Distorsion, Gurtprellung), Wild verendet, Polizei und Jagdpächter verständigt.',
    workMin: [15, 22],
  },
  {
    id: 'sz_pilz',
    seasons: ['herbst'],
    role: 'angehoerig', age: [30, 75],
    stichwort: 'RD 1',
    schlagwort: '#R0101',
    weight: 0.2,
    where: 'wohnung',
    patients: [{ specialty: 'Innere Medizin', desc: 'V. a. Pilzvergiftung, Erbrechen, Durchfall' }],
    opening: ['Wir haben heute Mittag selbst gesammelte Pilze gegessen und jetzt ist meinem Mann ganz übel.'],
    answers: {
      was: ['Er muss ständig erbrechen und hat Durchfall. Ich hab die Pilze noch da.'],
      zustand: ['Er ist wach, aber ganz schwach und blass.'],
      wieviele: ['Ich hab nur ein bisschen gegessen, mir geht es noch gut.'],
      gefahr: ['Nein.'],
    },
    lage: 'Patient mit gastrointestinaler Symptomatik nach Pilzmahlzeit, Pilzreste gesichert, Giftnotruf kontaktiert.',
    workMin: [12, 18],
  },
  {
    id: 'sz_nebel_vu',
    seasons: ['herbst', 'winter'],
    role: 'passant',
    stichwort: 'THL 2',
    schlagwort: '#T2810',
    polizei: true,
    weight: 0.3,
    where: 'ausserorts',
    needs: { HLF: 1, RTW: 2 },
    patients: [
      { specialty: 'Chirurgie', desc: 'HWS-Distorsion nach Auffahrunfall' },
      { specialty: 'Chirurgie', desc: 'Prellungen, Platzwunde Stirn' },
    ],
    opening: ['Hier im Nebel sind drei Autos aufeinander aufgefahren!'],
    answers: {
      was: ['Man sieht keine fünfzig Meter, einer hat gebremst und die anderen sind drauf.'],
      zustand: ['Zwei sind verletzt, aber alle sind ausgestiegen.'],
      wieviele: ['Zwei Verletzte, glaub ich.'],
      gefahr: ['Die nächsten Autos sehen uns gar nicht, das ist gefährlich!'],
    },
    lage: 'Auffahrunfall drei Pkw bei Nebel, zwei Leichtverletzte, Absicherung, Betriebsstoffe abgebunden.',
    workMin: [25, 35],
  },
];

// ---------- Unwettereinsätze (nur während einer Unwetterlage) ----------
export const UNWETTER_TEMPLATES: LageTemplate[] = [
  {
    id: 'uw_baum',
    wetter: ['sturm', 'gewitter', 'schnee'],
    role: 'passant',
    stichwort: 'THL UNWETTER',
    schlagwort: '#T3511',
    auchRichtig: ['THL 1'],
    weight: 1,
    where: 'ausserorts',
    opening: ['Hier hat es einen Baum umgehauen, der liegt quer über der Straße!', 'Da ist ein Baum auf die Fahrbahn gestürzt, man kommt nicht mehr durch.'],
    answers: {
      was: ['Der Wind hat den einfach umgeknickt, die ganze Straße ist zu.'],
      zustand: ['Nein, es ist keiner drunter, zum Glück.'],
      wieviele: ['Keine Verletzten.'],
      gefahr: ['Da hängt noch ein großer Ast lose oben drin.'],
    },
    lage: 'Baum über Fahrbahn, mit Motorsäge beseitigt, Straße wieder frei.',
    workMin: [15, 30],
  },
  {
    id: 'uw_keller',
    wetter: ['gewitter', 'starkregen'],
    role: 'selbst',
    stichwort: 'THL UNWETTER',
    schlagwort: '#T3522',
    auchRichtig: ['THL 1'],
    weight: 1.2,
    where: 'wohnung',
    opening: ['Bei uns läuft das Wasser durch das Kellerfenster rein, der Keller steht schon unter Wasser!', 'Hallo, unser Keller ist voll Wasser, das kommt aus dem Gully hoch!'],
    answers: {
      was: ['Der Regen ist so stark, das Wasser drückt von außen rein. Schon zwanzig Zentimeter.'],
      zustand: ['Uns geht es gut, wir sind oben.'],
      wieviele: ['Keine Verletzten.'],
      gefahr: ['Unten ist die Heizung und der Sicherungskasten!'],
    },
    lage: 'Keller ca. 30 cm unter Wasser, Strom freigeschaltet, Tauchpumpe eingesetzt.',
    workMin: [25, 45],
  },
  {
    id: 'uw_strasse',
    wetter: ['gewitter', 'starkregen'],
    role: 'passant',
    stichwort: 'THL UNWETTER',
    schlagwort: '#T3520',
    auchRichtig: ['THL 1'],
    weight: 0.6,
    where: 'strasse',
    opening: ['Die Unterführung ist voll Wasser gelaufen, da steckt ein Auto drin fest!'],
    answers: {
      was: ['Das Wasser steht bis an die Türen, der Fahrer sitzt noch drin, aber er kommt raus.'],
      zustand: ['Er ist auf das Autodach geklettert, verletzt ist er nicht.'],
      wieviele: ['Nur der Fahrer.'],
      gefahr: ['Das Wasser steigt noch!'],
    },
    lage: 'Unterführung überflutet, Pkw im Wasser, Fahrer unverletzt gerettet, Unterführung gesperrt, Polizei informiert.',
    workMin: [20, 35],
  },
  {
    id: 'uw_dach',
    wetter: ['sturm', 'gewitter'],
    role: 'selbst',
    stichwort: 'THL 1',
    schlagwort: '#T2718',
    weight: 0.6,
    where: 'wohnung',
    needs: { HLF: 1, DLK: 1 },
    opening: ['Bei uns hat der Sturm das halbe Dach abgedeckt, die Ziegel fliegen auf den Gehweg!'],
    answers: {
      was: ['Die Ziegel lösen sich und fallen runter, unten laufen Leute vorbei.'],
      zustand: ['Uns geht es gut, wir sind im Haus.'],
      wieviele: ['Verletzt ist keiner.'],
      gefahr: ['Da hängen noch mehr Ziegel locker, und das Blech an der Dachrinne klappert.'],
    },
    lage: 'Dach teilweise abgedeckt, lose Ziegel mit Drehleiter gesichert, Gehweg abgesperrt, Plane aufgebracht.',
    workMin: [30, 45],
  },
  {
    id: 'uw_blitz',
    wetter: ['gewitter'],
    role: 'angehoerig',
    stichwort: 'B 3',
    schlagwort: '#B1111',
    weight: 0.3,
    where: 'wohnung',
    needs: { ELW: 1, HLF: 2, DLK: 1 },
    opening: ['Bei uns hat der Blitz eingeschlagen, jetzt raucht es aus dem Dach!'],
    answers: {
      was: ['Es hat furchtbar geknallt, und jetzt kommt oben aus dem Dach Rauch raus.'],
      zustand: ['Wir sind alle draußen.'],
      wieviele: ['Keiner verletzt, wir sind vier.'],
      gefahr: ['Ich seh oben schon Flammen am Giebel!'],
    },
    lage: 'Dachstuhlbrand nach Blitzeinschlag, Brandbekämpfung über Drehleiter und Innenangriff, Ausbreitung verhindert.',
    workMin: [45, 70],
  },
  {
    id: 'uw_baum_auto',
    wetter: ['sturm', 'gewitter'],
    role: 'passant',
    stichwort: 'THL 3',
    schlagwort: '#T2910',
    polizei: true,
    weight: 0.15,
    where: 'ausserorts',
    needs: { ELW: 1, HLF: 2, RW: 1, RTW: 1, NEF: 1 },
    patients: [{ specialty: 'Unfallchirurgie', desc: 'Pkw-Fahrer von umstürzendem Baum getroffen, eingeklemmt' }],
    opening: ['Ein Baum ist auf ein fahrendes Auto gestürzt! Da ist noch jemand drin!'],
    answers: {
      was: ['Der Baum liegt mitten auf dem Auto, das Dach ist eingedrückt.'],
      zustand: ['Der Fahrer ruft um Hilfe, er kommt nicht raus, er blutet am Kopf.'],
      wieviele: ['Ich seh nur den Fahrer.'],
      gefahr: ['Es stürmt immer noch, da können noch mehr Bäume kommen!'],
    },
    lage: 'Baum auf Pkw, Fahrer eingeklemmt, Baum mit Motorsäge und Hebekissen entfernt, technische Rettung über Dach.',
    workMin: [35, 50],
  },
  {
    id: 'uw_leitung',
    wetter: ['sturm', 'schnee'],
    role: 'passant',
    stichwort: 'THL 1',
    schlagwort: '#T2710',
    weight: 0.35,
    where: 'strasse',
    opening: ['Hier hängt eine Stromleitung runter bis auf die Straße, da sprühen Funken!'],
    answers: {
      was: ['Ein Ast hat die Leitung abgerissen, die liegt jetzt halb auf dem Gehweg.'],
      zustand: ['Nein, verletzt ist keiner.'],
      wieviele: ['Keine Verletzten.'],
      gefahr: ['Die Kinder von nebenan wollen schon hin, ich halte sie zurück!'],
    },
    lage: 'Freileitung abgerissen, Bereich abgesperrt, Netzbetreiber verständigt, Abschaltung erfolgt.',
    workMin: [20, 40],
  },
  {
    id: 'uw_glaette_vu',
    wetter: ['glatteis', 'schnee'],
    role: 'passant',
    stichwort: 'THL 2',
    schlagwort: '#T2810',
    polizei: true,
    weight: 1,
    where: 'ausserorts',
    needs: { HLF: 1, RTW: 1 },
    patients: [{ specialty: 'Chirurgie', desc: 'Prellungen nach Glätteunfall' }],
    opening: ['Hier sind zwei Autos auf dem Glatteis ineinander gerutscht!', 'Hier ist ein Auto auf der glatten Straße in den Graben gerutscht und hat sich überschlagen!'],
    answers: {
      was: ['Die Straße ist spiegelglatt, die sind einfach weggerutscht.'],
      zustand: ['Eine Fahrerin hält sich den Arm, die anderen sind ausgestiegen.'],
      wieviele: ['Eine Verletzte, glaub ich.'],
      gefahr: ['Hier rutscht gleich der Nächste rein, es ist überall Eis!'],
    },
    lage: 'Glätteunfall, eine Leichtverletzte, Unfallstelle abgesichert, Streudienst angefordert.',
    workMin: [20, 35],
  },
  {
    id: 'uw_glaette_sturz',
    wetter: ['glatteis'],
    role: 'passant', age: [55, 90],
    stichwort: 'RD 1',
    schlagwort: '#R6000',
    weight: 0.8,
    where: 'strasse',
    patients: [{ specialty: 'Unfallchirurgie', desc: 'Sturz auf Glatteis, V. a. Handgelenksfraktur' }],
    opening: ['Hier ist eine ältere Frau auf dem Glatteis hingefallen und kommt nicht mehr hoch.'],
    answers: {
      was: ['Die ist auf dem Gehweg ausgerutscht und hat sich mit der Hand abgefangen.'],
      zustand: ['Sie ist wach, das Handgelenk sieht ganz schief aus.'],
      wieviele: ['Eine Frau, um die {alterRund}.'],
      gefahr: ['Vorsicht, hier ist alles spiegelglatt.'],
    },
    lage: 'Sturz auf Glatteis, distale Radiusfraktur, Schienung, Transport.',
    workMin: [12, 18],
  },
  {
    id: 'uw_lkw_quer',
    wetter: ['schnee', 'glatteis'],
    role: 'selbst',
    stichwort: 'THL 1',
    schlagwort: '#T2710',
    polizei: true,
    weight: 0.4,
    where: 'ausserorts',
    opening: ['Ich steh mit meinem Lkw quer am Berg, ich komm weder vor noch zurück.'],
    answers: {
      was: ['Schnee und Eis, der Auflieger ist weggerutscht, jetzt ist die ganze Straße blockiert.'],
      zustand: ['Mir geht es gut.'],
      wieviele: ['Keiner verletzt.'],
      gefahr: ['Hinter mir staut sich alles, und die Autos rutschen auch.'],
    },
    lage: 'Lkw quer auf Steigungsstrecke, Straße gesperrt, Abschleppdienst und Streudienst angefordert.',
    workMin: [30, 50],
  },
  {
    id: 'uw_hitzschlag',
    wetter: ['hitze'],
    role: 'passant', sex: 'm', age: [25, 60],
    stichwort: 'RD 2',
    schlagwort: '#R0110',
    weight: 0.6,
    where: 'strasse',
    patients: [{ specialty: 'Innere Medizin', desc: 'Hitzschlag, Bewusstseinsstörung' }],
    opening: ['Hier ist ein Bauarbeiter in der Hitze umgekippt, der ist ganz heiß und redet wirres Zeug!'],
    answers: {
      was: ['Der hat den ganzen Tag in der Sonne auf dem Dach gearbeitet und ist dann zusammengebrochen.'],
      zustand: ['Er ist kaum ansprechbar, die Haut ist knallrot und trocken.'],
      wieviele: ['Einer.'],
      gefahr: ['Nein, wir haben ihn in den Schatten gelegt.'],
    },
    lage: 'Hitzschlag, Körpertemperatur 40,5 Grad, GCS 12, aktive Kühlung, Transport mit Notarzt.',
    workMin: [15, 22],
  },
  {
    id: 'uw_hitze_heim',
    wetter: ['hitze'],
    role: 'personal', age: [80, 96],
    stichwort: 'RD 1',
    schlagwort: '#R0100',
    weight: 0.6,
    where: 'objekt',
    objectKinds: ['seniorenheim'],
    patients: [{ specialty: 'Innere Medizin', desc: 'Exsikkose, Verwirrtheit bei Hitze' }],
    opening: ['Hier ist das {objekt}, eine Bewohnerin ist bei der Hitze völlig ausgetrocknet und verwirrt.'],
    answers: {
      was: ['Sie trinkt seit zwei Tagen kaum, heute ist sie ganz verwirrt und hat Fieber.'],
      zustand: ['Sie ist wach, aber erkennt uns nicht mehr.'],
      wieviele: ['Eine Bewohnerin, {alter} Jahre.'],
      gefahr: ['Nein.'],
    },
    lage: 'Bewohnerin mit Exsikkose und Delir bei Hitze, Infusion, Transport.',
    workMin: [12, 18],
  },
];

// ---------- Großschadenslagen ----------
export const GSL_TEMPLATES: LageTemplate[] = [
  {
    id: 'gsl_bus_bab',
    role: 'passant',
    stichwort: 'THL 5',
    schlagwort: '#T3111',
    auchRichtig: ['RD MANV 10 – 15', 'THL 4'],
    polizei: true,
    weight: 1,
    where: 'autobahn',
    needs: { ELW: 2, HLF: 4, RW: 2, RTW: 8, NEF: 3, KTW: 2 },
    patients: [
      { specialty: 'Unfallchirurgie', desc: 'Polytrauma, eingeklemmt' },
      { specialty: 'Unfallchirurgie', desc: 'Schädel-Hirn-Trauma, bewusstlos' },
      { specialty: 'Unfallchirurgie', desc: 'Beckenfraktur' },
      { specialty: 'Unfallchirurgie', desc: 'Oberschenkelfraktur' },
      { specialty: 'Chirurgie', desc: 'Thoraxprellung, Rippenfrakturen' },
      { specialty: 'Chirurgie', desc: 'Unterarmfraktur' },
      { specialty: 'Chirurgie', desc: 'Platzwunde, Gehirnerschütterung' },
      { specialty: 'Chirurgie', desc: 'Schnittwunden durch Glas' },
      { specialty: 'Chirurgie', desc: 'HWS-Distorsion' },
      { specialty: 'Chirurgie', desc: 'Prellungen' },
    ],
    opening: ['Auf der Autobahn ist ein Reisebus umgekippt! Da sind ganz viele Leute drin, Hilfe!'],
    weitere: [
      'Ich fahr gerade an einem umgestürzten Bus auf der Autobahn vorbei, da liegen Leute auf der Fahrbahn!',
      'Hallo, hier ist ein Reisebus von der Fahrbahn abgekommen, der liegt auf der Seite. Wissen Sie das schon?',
      'Wir stehen im Stau hinter einem Busunfall, da schreien Leute, es sind viele Verletzte!',
      'Ich bin Ersthelfer am Bus, da sind mindestens zehn Verletzte, einige sind eingeklemmt!',
    ],
    answers: {
      was: ['Der Bus ist ins Schleudern gekommen und auf die Seite gekippt, er liegt quer über zwei Spuren.'],
      zustand: ['Viele sind rausgeklettert und bluten, ein paar liegen noch drin und rühren sich nicht!'],
      wieviele: ['Das ist ein voller Reisebus, sicher vierzig Leute! Viele Verletzte!'],
      gefahr: ['Die Autos fahren noch vorbei, und es riecht nach Diesel!'],
    },
    lage: 'Reisebus auf der Seite, 42 Betroffene, 10 Verletzte, davon 4 schwer, 2 eingeklemmt. Patientenablage eingerichtet, Sichtung läuft. Nachalarmierung ÖEL und UG-SanEL empfohlen.',
    workMin: [90, 130],
  },
  {
    id: 'gsl_karambolage',
    seasons: ['herbst', 'winter'],
    role: 'passant',
    stichwort: 'THL 5',
    schlagwort: '#T3110',
    auchRichtig: ['RD MANV 10 – 15', 'RD 5', 'THL 4'],
    polizei: true,
    weight: 1,
    where: 'autobahn',
    needs: { ELW: 2, HLF: 4, RW: 1, RTW: 6, NEF: 2 },
    patients: [
      { specialty: 'Unfallchirurgie', desc: 'Polytrauma, eingeklemmt' },
      { specialty: 'Unfallchirurgie', desc: 'Beckenfraktur' },
      { specialty: 'Chirurgie', desc: 'Thoraxprellung' },
      { specialty: 'Chirurgie', desc: 'Unterschenkelfraktur' },
      { specialty: 'Chirurgie', desc: 'HWS-Distorsion' },
      { specialty: 'Chirurgie', desc: 'Platzwunde, Prellungen' },
    ],
    opening: ['Auf der Autobahn sind im Nebel ganz viele Autos ineinander gekracht, das hört gar nicht auf!'],
    weitere: [
      'Hier ist eine Massenkarambolage auf der Autobahn, bestimmt zwanzig Autos!',
      'Ich steck mitten in dem Unfall auf der Autobahn, vor mir brennt ein Auto noch nicht, aber da qualmt es!',
      'Hallo, Massenunfall auf der Autobahn, da sind Leute in den Autos eingeklemmt!',
    ],
    answers: {
      was: ['Man sieht nichts, und es kracht immer wieder, die fahren hinten noch rein!'],
      zustand: ['Da laufen Verletzte zwischen den Autos rum, einer ist eingeklemmt.'],
      wieviele: ['Keine Ahnung, sicher fünf, sechs Verletzte, wahrscheinlich mehr!'],
      gefahr: ['Die nachfolgenden Autos sehen die Unfallstelle nicht!'],
    },
    lage: 'Massenkarambolage, ca. 20 Fahrzeuge, 6 Verletzte, eine Person eingeklemmt, Autobahn voll gesperrt. Abschnittsbildung, Nachalarmierung UG-SanEL empfohlen.',
    workMin: [80, 120],
  },
  {
    id: 'gsl_heim',
    role: 'personal',
    stichwort: 'B 5',
    schlagwort: '#B1210',
    auchRichtig: ['B 4', 'B 6'],
    weight: 1,
    where: 'objekt',
    objectKinds: ['seniorenheim'],
    needs: { ELW: 2, HLF: 4, LF: 2, DLK: 2, TLF: 1, RTW: 5, NEF: 2 },
    patients: [
      { specialty: 'Innere Medizin', desc: 'Rauchgasintoxikation, bewusstseinsgetrübt' },
      { specialty: 'Verbrennungen', desc: 'Verbrennungen Hände und Gesicht' },
      { specialty: 'Innere Medizin', desc: 'Rauchgasintoxikation' },
      { specialty: 'Innere Medizin', desc: 'Rauchgasintoxikation, leicht' },
      { specialty: 'Innere Medizin', desc: 'Atemnot, COPD-Exazerbation durch Rauch' },
    ],
    opening: ['Hier ist das {objekt}, bei uns brennt es im zweiten Stock, der ganze Flur ist voller Rauch!'],
    weitere: [
      'Aus dem {objekt} kommt ganz schwarzer Rauch, da stehen Leute an den Fenstern!',
      'Ich bin Pfleger im {objekt}, wir bekommen die Bewohner im zweiten Stock nicht raus!',
    ],
    answers: {
      was: ['Es hat in einem Zimmer angefangen, jetzt ist der ganze Flur verraucht. Die Brandmeldeanlage läuft.'],
      zustand: ['Wir haben schon Bewohner rausgebracht, einige husten stark, eine Frau reagiert kaum.'],
      wieviele: ['Im Stockwerk wohnen zwanzig Bewohner, viele sind bettlägerig!'],
      gefahr: ['Der Rauch zieht ins Treppenhaus, wir kommen da nicht mehr hoch!'],
    },
    lage: 'Zimmerbrand im 2. OG eines Seniorenheims, Flur verraucht, 20 Bewohner betroffen, 5 Verletzte, horizontale Evakuierung, Menschenrettung über Drehleiter.',
    workMin: [80, 120],
  },
  {
    id: 'gsl_lagerhalle',
    role: 'passant',
    stichwort: 'B 4',
    schlagwort: '#B1315',
    auchRichtig: ['B 5', 'B 6'],
    weight: 1,
    where: 'objekt',
    objectKinds: ['gewerbe'],
    needs: { ELW: 2, HLF: 4, LF: 2, DLK: 2, TLF: 2, RTW: 1 },
    patients: [{ specialty: 'Innere Medizin', desc: 'Mitarbeiter mit Rauchgasintoxikation' }],
    opening: ['Bei der {objekt} brennt eine riesige Halle, die Flammen schlagen schon aus dem Dach!'],
    weitere: [
      'Man sieht eine riesige schwarze Rauchwolke über der {objekt}, brennt da was?',
      'Hallo, ich wohn neben der {objekt}, da brennt alles, der Rauch zieht genau zu uns rüber!',
      'Bei der {objekt} brennt es lichterloh, da explodiert immer wieder was!',
    ],
    answers: {
      was: ['Die ganze Lagerhalle steht in Flammen, das Dach ist schon eingebrochen.'],
      zustand: ['Ein Mitarbeiter hustet stark, die anderen sind draußen.'],
      wieviele: ['Ein Verletzter, glaub ich.'],
      gefahr: ['Da stehen Gasflaschen drin, es knallt immer wieder!'],
    },
    lage: 'Lagerhalle im Vollbrand, Dach eingestürzt, Gasflaschen im Gebäude, Riegelstellung zu Nachbargebäuden, Warnung der Bevölkerung wegen Rauchgas (Fenster und Türen schließen).',
    workMin: [100, 150],
  },
  {
    id: 'gsl_explosion',
    role: 'passant',
    stichwort: 'ABC EXPLOSION',
    schlagwort: '#A1910',
    auchRichtig: ['B 4', 'RD 4', 'RD 5'],
    polizei: true,
    weight: 0.8,
    where: 'wohnung',
    needs: { ELW: 1, HLF: 3, RW: 1, DLK: 1, RTW: 4, NEF: 2 },
    patients: [
      { specialty: 'Verbrennungen', desc: 'Verbrennungen 30 % KOF nach Gasexplosion' },
      { specialty: 'Unfallchirurgie', desc: 'Polytrauma, verschüttet' },
      { specialty: 'Chirurgie', desc: 'Schnittverletzungen durch Glas' },
      { specialty: 'Chirurgie', desc: 'Knalltrauma, Prellungen' },
    ],
    opening: ['Hier ist ein Haus explodiert! Es hat einen riesigen Knall gegeben, die ganze Fassade ist weg!'],
    weitere: [
      'Bei uns in der Straße hat es gerade furchtbar geknallt, bei den Nachbarn sind alle Fenster raus!',
      'Hallo, da ist eine Explosion in einem Mehrfamilienhaus, da liegen Leute unter den Trümmern!',
    ],
    answers: {
      was: ['Eine Explosion, wahrscheinlich Gas, eine Hauswand ist eingestürzt und es brennt im Erdgeschoss.'],
      zustand: ['Ein Mann ist schwer verbrannt, eine Frau liegt unter Trümmern, viele bluten durch Glassplitter.'],
      wieviele: ['Das ist ein Mehrfamilienhaus mit acht Parteien, ich weiß nicht, wer noch drin ist!'],
      gefahr: ['Es riecht noch nach Gas und das Haus sieht aus, als würde es einstürzen!'],
    },
    lage: 'Gasexplosion im Mehrfamilienhaus, Teileinsturz, Brand im EG, 4 Verletzte, eine Person verschüttet, Gasversorgung abgesperrt, Einsturzgefahr, Fachberater THW angefordert.',
    workMin: [90, 140],
  },
  {
    id: 'gsl_waldbrand',
    seasons: ['sommer', 'fruehling'],
    role: 'passant',
    stichwort: 'B WALD',
    schlagwort: '#B1023',
    auchRichtig: ['B 4'],
    weight: 1,
    where: 'ausserorts',
    needs: { ELW: 2, HLF: 3, LF: 4, TLF: 3 },
    opening: ['Der Wald brennt! Da ist eine riesige Feuerwand, das breitet sich wahnsinnig schnell aus!'],
    weitere: [
      'Man sieht von hier eine riesige Rauchsäule über dem Wald, brennt da was?',
      'Hallo, ich bin Jäger, hier brennt der Wald auf mindestens drei Hektar!',
      'Der Rauch vom Waldbrand zieht in unseren Ort, man kann kaum atmen!',
    ],
    answers: {
      was: ['Es brennt am Boden und schon in den Baumkronen, der Wind treibt es weiter.'],
      zustand: ['Ich glaub, es ist keiner verletzt, die Spaziergänger sind weg.'],
      wieviele: ['Keine Verletzten, soweit ich weiß.'],
      gefahr: ['Das läuft direkt auf die Häuser am Ortsrand zu!'],
    },
    lage: 'Waldbrand ca. 4 ha, Vollfeuer in Teilen, Ausbreitung Richtung Ortsrand, Wasserversorgung über lange Wegstrecke, Abschnittsbildung.',
    workMin: [120, 180],
  },
  {
    id: 'gsl_schule',
    seasons: ['fruehling', 'herbst', 'winter'],
    role: 'personal', age: [9, 15],
    stichwort: 'RD 5',
    schlagwort: '#R0430',
    auchRichtig: ['RD MANV 10 – 15', 'ABC 3', 'RD 4'],
    weight: 0.8,
    where: 'objekt',
    objectKinds: ['schule'],
    needs: { ELW: 1, HLF: 1, RTW: 5, NEF: 2 },
    patients: [
      { specialty: 'Pädiatrie', desc: 'Kind mit Atemwegsreizung, Atemnot' },
      { specialty: 'Pädiatrie', desc: 'Kind mit Atemwegsreizung' },
      { specialty: 'Pädiatrie', desc: 'Kind mit Augenreizung, Husten' },
      { specialty: 'Pädiatrie', desc: 'Kind mit Hyperventilation' },
      { specialty: 'Pädiatrie', desc: 'Kind mit Übelkeit, Husten' },
      { specialty: 'Pädiatrie', desc: 'Kind mit Kopfschmerzen, Husten' },
    ],
    opening: ['Hier ist die {objekt}, bei uns haben auf einmal ganz viele Kinder Atemnot und Husten, jemand hat Pfefferspray versprüht!'],
    weitere: [
      'Ich bin Lehrerin an der {objekt}, wir haben das Gebäude geräumt, aber viele Kinder husten und weinen!',
      'Hallo, mein Kind hat mich aus der {objekt} angerufen, da ist irgendein Gas, was ist da los?',
    ],
    answers: {
      was: ['In der Pause hat ein Schüler Pfefferspray in der Aula versprüht, jetzt husten alle.'],
      zustand: ['Viele Kinder husten und haben tränende Augen, ein Mädchen bekommt richtig schlecht Luft.'],
      wieviele: ['Bestimmt zwanzig Kinder haben Beschwerden, sechs geht es richtig schlecht.'],
      gefahr: ['Wir haben alle rausgebracht, in der Aula riecht es noch scharf.'],
    },
    lage: 'Reizgas in Schulaula, 25 Betroffene, 6 Kinder behandlungsbedürftig, Patientenablage im Pausenhof, Sichtung, Eltern werden informiert.',
    workMin: [60, 90],
  },
  {
    id: 'gsl_tribuene',
    seasons: ['sommer', 'fruehling'],
    role: 'passant', age: [16, 70],
    stichwort: 'RD MANV 10 – 15',
    schlagwort: '#R0440',
    auchRichtig: ['RD 5', 'THL 5'],
    weight: 0.7,
    where: 'ausserorts',
    needs: { ELW: 1, HLF: 2, RW: 1, RTW: 8, NEF: 3, KTW: 2 },
    patients: [
      { specialty: 'Unfallchirurgie', desc: 'Wirbelsäulentrauma nach Sturz' },
      { specialty: 'Unfallchirurgie', desc: 'Beckenfraktur' },
      { specialty: 'Unfallchirurgie', desc: 'Schädel-Hirn-Trauma' },
      { specialty: 'Chirurgie', desc: 'Unterschenkelfraktur' },
      { specialty: 'Chirurgie', desc: 'Unterarmfraktur' },
      { specialty: 'Chirurgie', desc: 'Sprunggelenksfraktur' },
      { specialty: 'Chirurgie', desc: 'Platzwunde, Prellungen' },
      { specialty: 'Chirurgie', desc: 'Prellungen, Schürfwunden' },
      { specialty: 'Chirurgie', desc: 'Rippenprellung' },
      { specialty: 'Innere Medizin', desc: 'Kreislaufkollaps, Schock' },
    ],
    opening: ['Beim Sportfest ist eine Zuschauertribüne eingestürzt! Da liegen überall Verletzte!'],
    weitere: [
      'Hallo, auf dem Sportplatz ist die Tribüne zusammengebrochen, wir brauchen ganz viele Krankenwagen!',
      'Ich bin Sanitäter vom Sportverein, wir haben mindestens zehn Verletzte, das schaffen wir nicht allein!',
      'Da ist was Schlimmes auf dem Festplatz passiert, die Tribüne ist weg, Kinder schreien!',
    ],
    answers: {
      was: ['Die Stahltribüne ist während des Spiels einfach eingeknickt, die Leute sind drei Meter tief gefallen.'],
      zustand: ['Einige liegen unter den Trümmern, viele haben gebrochene Beine, einer bewegt sich gar nicht.'],
      wieviele: ['Auf der Tribüne waren über hundert Leute, sicher zehn, fünfzehn Verletzte!'],
      gefahr: ['Der Rest der Tribüne wackelt noch!'],
    },
    lage: 'Tribüneneinsturz, ca. 120 Betroffene, 10 Verletzte, davon 3 schwer, Patientenablage eingerichtet, Sichtung, Restkonstruktion gesichert. Nachalarmierung ÖEL und UG-SanEL empfohlen.',
    workMin: [80, 120],
  },
];

/** Alle Vorlagen nach Kennung (für feste Notrufe in Tests und KVB-Übergaben) */
export const ALLE_VORLAGEN: LageTemplate[] = [...TEMPLATES, ...SAISON_TEMPLATES, ...UNWETTER_TEMPLATES, ...GSL_TEMPLATES];

/** Unwettereinsätze inkl. passender alltäglicher Vorlagen für die gegebene Wetterlage */
export function wetterVorlagen(art: WetterArt): LageTemplate[] {
  return [...UNWETTER_TEMPLATES.filter((t) => t.wetter?.includes(art)), ...TEMPLATES.filter((t) => WETTER_VORHANDEN[t.id]?.includes(art))];
}

// ---------- Wetterlagen und DWD-Meldungen ----------

/** Welche Wetterlagen in welcher Jahreszeit auftreten (relative Häufigkeit) */
export const WETTER_JE_SAISON: Record<Season, [WetterArt, number][]> = {
  fruehling: [['gewitter', 0.35], ['sturm', 0.35], ['starkregen', 0.3]],
  sommer: [['gewitter', 0.6], ['starkregen', 0.15], ['hitze', 0.25]],
  herbst: [['sturm', 0.55], ['starkregen', 0.3], ['gewitter', 0.15]],
  winter: [['glatteis', 0.35], ['schnee', 0.35], ['sturm', 0.3]],
};

/** Unwetter sind im Sommer häufiger (Gewitter), im Frühling seltener */
export const WETTER_SAISON_FAKTOR: Record<Season, number> = { fruehling: 0.8, sommer: 1.5, herbst: 1, winter: 1 };

interface WetterStufe {
  /** Ereignis in Großbuchstaben wie in der Überschrift des DWD */
  ereignis: string;
  beschreibung: string;
}

/** Mögliche Warnstufen je Wetterlage mit Wahrscheinlichkeit */
export const WETTER_STUFEN: Record<WetterArt, [2 | 3 | 4, number, WetterStufe][]> = {
  gewitter: [
    [2, 0.35, { ereignis: 'STARKEM GEWITTER', beschreibung: 'Es treten Gewitter mit Sturmböen um 85 km/h, Starkregen mit Niederschlagsmengen um 20 l/m² pro Stunde und Hagel mit Korngrößen um 1 cm auf.' }],
    [3, 0.55, { ereignis: 'SCHWEREM GEWITTER mit ORKANBÖEN, HEFTIGEM STARKREGEN und HAGEL', beschreibung: 'Es treten schwere Gewitter mit Orkanböen um 110 km/h, heftigem Starkregen mit Niederschlagsmengen zwischen 25 l/m² und 40 l/m² pro Stunde und Hagel mit Korngrößen um 3 cm auf.' }],
    [4, 0.1, { ereignis: 'EXTREM HEFTIGEM GEWITTER mit ORKANBÖEN, EXTREM HEFTIGEM STARKREGEN und HAGEL', beschreibung: 'Es treten extrem schwere Gewitter mit Orkanböen um 130 km/h, extrem heftigem Starkregen mit Niederschlagsmengen über 50 l/m² pro Stunde und großkörnigem Hagel um 5 cm auf.' }],
  ],
  sturm: [
    [2, 0.35, { ereignis: 'STURMBÖEN', beschreibung: 'Es treten Sturmböen mit Geschwindigkeiten zwischen 70 km/h und 85 km/h aus westlicher Richtung auf. In exponierten Lagen muss mit schweren Sturmböen um 95 km/h gerechnet werden.' }],
    [3, 0.5, { ereignis: 'ORKANARTIGEN BÖEN', beschreibung: 'Es treten orkanartige Böen mit Geschwindigkeiten zwischen 105 km/h und 115 km/h aus westlicher Richtung auf. In exponierten Lagen muss mit Orkanböen um 125 km/h gerechnet werden.' }],
    [4, 0.15, { ereignis: 'EXTREMEN ORKANBÖEN', beschreibung: 'Es treten extreme Orkanböen mit Geschwindigkeiten um 140 km/h aus westlicher Richtung auf.' }],
  ],
  starkregen: [
    [2, 0.4, { ereignis: 'STARKREGEN', beschreibung: 'Es tritt Starkregen mit Niederschlagsmengen zwischen 15 l/m² und 25 l/m² pro Stunde auf.' }],
    [3, 0.5, { ereignis: 'HEFTIGEM STARKREGEN', beschreibung: 'Es tritt heftiger Starkregen mit Niederschlagsmengen zwischen 25 l/m² und 35 l/m² pro Stunde auf. Örtlich sind bis 50 l/m² in zwei Stunden möglich.' }],
    [4, 0.1, { ereignis: 'EXTREM HEFTIGEM STARKREGEN', beschreibung: 'Es tritt extrem heftiger Starkregen mit Niederschlagsmengen über 40 l/m² pro Stunde auf. Örtlich sind über 70 l/m² in drei Stunden möglich.' }],
  ],
  glatteis: [
    [3, 1, { ereignis: 'GLATTEIS', beschreibung: 'Es tritt verbreitet Glatteis durch gefrierenden Regen auf. Straßen und Gehwege sind spiegelglatt.' }],
  ],
  schnee: [
    [2, 0.45, { ereignis: 'SCHNEEFALL', beschreibung: 'Es tritt Schneefall mit Mengen zwischen 5 cm und 10 cm auf. In Staulagen werden Mengen bis 15 cm erreicht. Verbreitet wird es glatt.' }],
    [3, 0.45, { ereignis: 'STARKEM SCHNEEFALL', beschreibung: 'Es tritt starker Schneefall mit Mengen zwischen 15 cm und 25 cm auf. In Staulagen werden Mengen bis 30 cm erreicht. Es besteht Schneebruchgefahr.' }],
    [4, 0.1, { ereignis: 'EXTREM STARKEM SCHNEEFALL', beschreibung: 'Es tritt extrem starker Schneefall mit Mengen über 40 cm auf. Verbreitet besteht Schneebruchgefahr.' }],
  ],
  hitze: [
    [2, 0.7, { ereignis: 'STARKER HITZE', beschreibung: 'Es wird eine starke Wärmebelastung erwartet. Gefühlte Temperatur am Nachmittag über 32 °C, nachts kaum Abkühlung.' }],
    [3, 0.3, { ereignis: 'EXTREMER HITZE', beschreibung: 'Es wird eine extreme Wärmebelastung erwartet. Gefühlte Temperatur am Nachmittag über 38 °C.' }],
  ],
};

/** Dauer einer Wetterlage in Minuten */
export const WETTER_DAUER: Record<WetterArt, [number, number]> = {
  gewitter: [60, 150],
  sturm: [120, 240],
  starkregen: [90, 180],
  glatteis: [120, 240],
  schnee: [180, 300],
  hitze: [240, 480],
};

/** Mehr Notrufe während der Lage je Warnstufe; Hitze belastet vor allem den Rettungsdienst */
export function wetterRate(art: WetterArt, stufe: number): number {
  if (art === 'hitze') return stufe >= 3 ? 1.4 : 1.2;
  return stufe >= 4 ? 3.5 : stufe === 3 ? 2.5 : 1.6;
}

/** Anteil der wetterbedingten Einsätze an allen Notrufen während der Lage */
export function wetterAnteil(art: WetterArt, stufe: number): number {
  if (art === 'hitze') return stufe >= 3 ? 0.35 : 0.25;
  return stufe >= 4 ? 0.75 : stufe === 3 ? 0.6 : 0.4;
}

const HINWEISE: Record<WetterArt, Record<number, string>> = {
  gewitter: {
    2: 'Hinweis auf mögliche Gefahren: Örtlich kann es Blitzschlag geben. Bei Blitzschlag besteht Lebensgefahr! Bäume können entwurzelt werden und Dachziegel, Äste oder Gegenstände herabstürzen. Rasch ansteigende Pegel von Bächen und kleineren Flüssen sowie Überflutungen von Kellern und Straßen sind möglich.',
    3: 'ACHTUNG! Hinweis auf mögliche Gefahren: Verbreitet schwere Schäden an Gebäuden möglich. Bäume können entwurzelt werden und Dachziegel, Äste oder Gegenstände herabstürzen. Hagelschlag und Überflutungen von Kellern und Straßen sind möglich. Schließen Sie alle Fenster und Türen! Halten Sie sich von Fenstern fern! Meiden Sie den Aufenthalt im Freien!',
    4: 'ACHTUNG! Hinweis auf mögliche Gefahren: Es besteht Lebensgefahr durch zahlreiche umstürzende Bäume und herabstürzende Gegenstände. Verbreitet extreme Schäden an Gebäuden und Infrastruktur. Großflächige Überflutungen möglich. Bleiben Sie in den Gebäuden!',
  },
  sturm: {
    2: 'Hinweis auf mögliche Gefahren: Es können zum Beispiel einzelne Äste herabstürzen. Achten Sie besonders auf herabfallende Gegenstände.',
    3: 'ACHTUNG! Hinweis auf mögliche Gefahren: Verbreitet schwere Schäden an Gebäuden möglich. Bäume können entwurzelt werden und Dachziegel, Äste oder Gegenstände herabstürzen. Schließen Sie alle Fenster und Türen! Sichern Sie Gegenstände im Freien! Halten Sie insbesondere Abstand von Gebäuden, Bäumen, Gerüsten und Hochspannungsleitungen.',
    4: 'ACHTUNG! Hinweis auf mögliche Gefahren: Es besteht Lebensgefahr! Verbreitet extreme Schäden an Wäldern und Gebäuden. Bleiben Sie in den Gebäuden und meiden Sie Fahrten in Waldgebiete!',
  },
  starkregen: {
    2: 'Hinweis auf mögliche Gefahren: Lokal kann es Blitzschlag geben. Überflutungen von Kellern und Straßen sowie Aquaplaning sind möglich.',
    3: 'ACHTUNG! Hinweis auf mögliche Gefahren: Es können zum Beispiel Erdrutsche auftreten. Überflutungen von Kellern und Straßen, Unterführungen und Tiefgaragen sind wahrscheinlich. Meiden Sie Unterführungen und tief gelegene Bereiche!',
    4: 'ACHTUNG! Hinweis auf mögliche Gefahren: Es besteht Lebensgefahr durch extreme Überflutungen und Sturzfluten. Verlassen Sie gefährdete Keller und Erdgeschosse!',
  },
  glatteis: {
    3: 'ACHTUNG! Hinweis auf mögliche Gefahren: Es besteht erhöhte Unfallgefahr. Verbreitet erhebliche Verkehrsbehinderungen. Vermeiden Sie nach Möglichkeit Autofahrten und passen Sie Ihre Fahrweise an!',
  },
  schnee: {
    2: 'Hinweis auf mögliche Gefahren: Es kann zu Verkehrsbehinderungen kommen. Passen Sie Ihre Fahrweise an!',
    3: 'ACHTUNG! Hinweis auf mögliche Gefahren: Es kann zu erheblichen Verkehrsbehinderungen kommen. Äste oder Bäume können unter der Schneelast abbrechen. Vermeiden Sie nach Möglichkeit Autofahrten!',
    4: 'ACHTUNG! Hinweis auf mögliche Gefahren: Verkehr kann großflächig zum Erliegen kommen. Schneebruch an Bäumen und Dächern wahrscheinlich. Bleiben Sie in den Gebäuden!',
  },
  hitze: {
    2: 'Hinweis auf mögliche Gefahren: Eine starke Wärmebelastung kann vor allem bei älteren und pflegebedürftigen Menschen sowie Kleinkindern zu Kreislaufproblemen und Austrocknung führen. Trinken Sie ausreichend!',
    3: 'ACHTUNG! Hinweis auf mögliche Gefahren: Extreme Wärmebelastung. Gefahr von Hitzschlag und Austrocknung, vor allem für ältere und kranke Menschen. Vermeiden Sie Anstrengungen im Freien!',
  },
};

const WOCHENTAG = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

/** "Dienstag, 21.10.2026, 16:00 Uhr" für eine Spielzeit */
export function dwdZeit(startDate: Date, clockStart: number, t: number): string {
  const min = clockStart + Math.round(t / 60000);
  const d = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + Math.floor(min / 1440));
  const m = ((min % 1440) + 1440) % 1440;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${WOCHENTAG[d.getDay()]}, ${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}, ${p(Math.floor(m / 60))}:${p(m % 60)} Uhr`;
}

export interface WetterLage {
  art: WetterArt;
  stufe: 2 | 3 | 4;
  info: WetterStufe;
  von: number;
  bis: number;
}

/** Überschrift wie in den amtlichen Warnungen des DWD */
export function dwdTitel(kind: DwdMeldung['kind'], lage: WetterLage): string {
  const e = lage.info.ereignis;
  if (kind === 'vorab') return `VORABINFORMATION UNWETTER vor ${e}`;
  if (kind === 'aufhebung') return `Aufhebung der ${lage.stufe >= 3 ? 'UNWETTERWARNUNG' : 'WARNUNG'} vor ${e}`;
  if (lage.art === 'hitze') return `Amtliche WARNUNG vor ${e}`;
  return lage.stufe === 3 ? `Amtliche UNWETTERWARNUNG vor ${e}` : `Amtliche WARNUNG vor ${e}`;
}

/** Vollständiger Meldungstext, wie er in der Leitstelle per Fax bzw. FeWIS eingeht */
export function dwdText(kind: DwdMeldung['kind'], lage: WetterLage, gebiet: string, zeit: (t: number) => string, jetzt: number): string {
  const kopf = `DEUTSCHER WETTERDIENST – Regionale Wetterwarnzentrale München\nan: ${gebiet.startsWith('ILS') ? gebiet : 'Integrierte Leitstelle ' + gebiet}`;
  const fuss = `ausgegeben vom Deutschen Wetterdienst am ${zeit(jetzt)}\nDWD / RWZ München`;
  const titel = dwdTitel(kind, lage);
  const region = `für ${gebiet.replace(/^ILS\s+/, 'Stadt und Landkreis ')}`;
  if (kind === 'vorab') {
    return [
      kopf,
      '',
      titel,
      region,
      `voraussichtlich von ${zeit(lage.von)} bis ${zeit(lage.bis)}`,
      '',
      `${lage.info.beschreibung}`,
      '',
      'Die Vorabinformation dient dem frühzeitigen Hinweis auf eine sich anbahnende Unwetterlage. Die Prognose ist noch unsicher. Sie wird spätestens bei Eintreten durch eine amtliche Unwetterwarnung ersetzt.',
      '',
      fuss,
    ].join('\n');
  }
  if (kind === 'aufhebung') {
    return [kopf, '', titel, region, '', 'Die Unwetter- bzw. Wettergefahr ist vorüber. Die Warnung wird hiermit aufgehoben.', '', fuss].join('\n');
  }
  const stufeText = { 2: 'Warnstufe 2 (markantes Wetter, orange)', 3: 'Warnstufe 3 (Unwetter, rot)', 4: 'Warnstufe 4 (extremes Unwetter, violett)' }[lage.stufe];
  return [
    kopf,
    '',
    titel,
    region,
    `gültig von ${zeit(lage.von)}`,
    `bis ${zeit(lage.bis)}`,
    stufeText,
    '',
    lage.info.beschreibung,
    '',
    HINWEISE[lage.art][lage.stufe] ?? HINWEISE[lage.art][3] ?? '',
    '',
    fuss,
  ].join('\n');
}
