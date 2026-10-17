// Einsatzvorlagen und Anruferdialoge für simulierte Notrufe.
import type { MapObject, QuestionId, VehicleTypeId } from '../shared/types';

export type LocationKind = 'wohnung' | 'strasse' | 'ausserorts' | 'objekt' | 'autobahn' | 'keine';

export interface IncidentTemplate {
  id: string;
  /** Richtiges Einsatzstichwort; leer = kein Einsatz nötig (Fehlanruf) */
  stichwort: string;
  weight: number;
  where: LocationKind;
  /** Nur Objekte dieser Art (bei where = 'objekt') */
  objectKinds?: MapObject['kind'][];
  /** Tatsächlich benötigte Kräfte; Standard ist die AAO des Stichworts */
  needs?: Record<VehicleTypeId, number>;
  /** Patienten mit Transport und benötigter Fachrichtung */
  patients?: { specialty: string; desc: string }[];
  opening: string[];
  answers: Partial<Record<QuestionId, string[]>>;
  /** Lagemeldung des ersten Fahrzeugs an der Einsatzstelle */
  lage: string;
  workMin: [number, number];
  tcpr?: boolean;
}

export const FIRST_NAMES = ['Anna', 'Josef', 'Maria', 'Thomas', 'Sabine', 'Michael', 'Stefanie', 'Franz', 'Katharina', 'Andreas', 'Monika', 'Florian', 'Theresa', 'Sebastian', 'Lena', 'Georg'];
export const LAST_NAMES = ['Huber', 'Maier', 'Gruber', 'Bauer', 'Wimmer', 'Schmid', 'Hofmann', 'Brunner', 'Wagner', 'Fischer', 'Eder', 'Moser', 'Lechner', 'Steiner', 'Reiter', 'Kraus'];

export const TEMPLATES: IncidentTemplate[] = [
  {
    id: 'rd_cpr',
    stichwort: 'RD 2',
    weight: 1,
    where: 'wohnung',
    patients: [{ specialty: 'Kardiologie (HKL)', desc: 'Z. n. Reanimation, ROSC' }],
    tcpr: true,
    opening: ['Hilfe! Mein Mann ist einfach umgefallen, er rührt sich nicht mehr!', 'Bitte schnell, mein Vater liegt am Boden und reagiert nicht!'],
    answers: {
      was: ['Er hat sich an die Brust gefasst und ist dann im Wohnzimmer zusammengebrochen.'],
      zustand: ['Er reagiert gar nicht, und er atmet so komisch, nur so ein Schnappen ab und zu!'],
      wieviele: ['Nur er, er ist {alter} Jahre alt.'],
      gefahr: ['Nein, wir sind allein in der Wohnung.'],
      tcpr: ['Okay... Hände auf die Brustmitte... ich drücke jetzt... eins, zwei, drei, vier... ich mache weiter!'],
    },
    lage: 'Patient reanimationspflichtig, Reanimation läuft, Laienreanimation war eingeleitet.',
    workMin: [20, 30],
  },
  {
    id: 'rd_stroke',
    stichwort: 'RD 2',
    weight: 1,
    where: 'wohnung',
    patients: [{ specialty: 'Stroke Unit', desc: 'V. a. Schlaganfall, Symptombeginn vor 40 Minuten' }],
    opening: ['Grüß Gott, meine Mutter spricht auf einmal ganz verwaschen, irgendwas stimmt nicht.'],
    answers: {
      was: ['Ihr hängt der Mundwinkel runter und sie kann den rechten Arm nicht mehr heben. Das hat vor einer halben Stunde angefangen.'],
      zustand: ['Sie ist wach, aber ganz durcheinander. Atmen tut sie normal.'],
      wieviele: ['Nur meine Mutter, {alter} Jahre.'],
      gefahr: ['Nein, nichts.'],
    },
    lage: 'Patientin mit Hemiparese rechts und Aphasie, Lyse-Zeitfenster offen, Stroke Unit erforderlich.',
    workMin: [12, 18],
  },
  {
    id: 'rd_chest',
    stichwort: 'RD 2',
    weight: 1.2,
    where: 'wohnung',
    patients: [{ specialty: 'Kardiologie (HKL)', desc: 'V. a. Herzinfarkt (STEMI)' }],
    opening: ['Ja, hallo... ich hab so einen Druck auf der Brust... ich krieg schlecht Luft.'],
    answers: {
      was: ['Seit einer halben Stunde, es zieht in den linken Arm und in den Kiefer. Ich schwitze total.'],
      zustand: ['Mir ist schlecht und schwindlig, aber ich bin wach.'],
      wieviele: ['Nur ich. Ich bin {alter}.'],
      gefahr: ['Nein... die Haustür ist zu, ich weiß nicht, ob ich noch aufmachen kann.'],
    },
    lage: 'Patient mit akutem Koronarsyndrom, im EKG Hebungen, Transport in HKL.',
    workMin: [12, 18],
  },
  {
    id: 'rd_fall',
    stichwort: 'RD 1',
    weight: 1.4,
    where: 'wohnung',
    patients: [{ specialty: 'Unfallchirurgie', desc: 'V. a. Oberschenkelhalsfraktur' }],
    opening: ['Ja, guten Tag, meine Oma ist im Bad gestürzt und kommt nicht mehr hoch.'],
    answers: {
      was: ['Sie ist ausgerutscht und hat jetzt starke Schmerzen in der Hüfte, das Bein liegt so komisch.'],
      zustand: ['Sie ist wach und redet ganz normal, hat halt Schmerzen.'],
      wieviele: ['Nur meine Oma, sie ist {alter}.'],
      gefahr: ['Nein.'],
    },
    lage: 'Ältere Patientin, gestürzt, V. a. Schenkelhalsfraktur links, Vitalwerte stabil.',
    workMin: [12, 20],
  },
  {
    id: 'rd_breath',
    stichwort: 'RD 2',
    weight: 0.9,
    where: 'wohnung',
    patients: [{ specialty: 'Innere Medizin', desc: 'Schwerer Asthmaanfall' }],
    opening: ['Mein Sohn kriegt keine Luft! Er hat Asthma und das Spray hilft nicht!'],
    answers: {
      was: ['Er hat einen Anfall, das Spray hat er schon dreimal genommen. Er pfeift beim Atmen.'],
      zustand: ['Er ist wach, aber ganz blass und kann kaum sprechen.'],
      wieviele: ['Nur er, er ist 17.'],
      gefahr: ['Nein.'],
    },
    lage: 'Jugendlicher mit schwerem Asthmaanfall, SpO2 84 Prozent, Therapie eingeleitet.',
    workMin: [12, 20],
  },
  {
    id: 'rd_child',
    stichwort: 'RD 2',
    weight: 0.6,
    where: 'wohnung',
    patients: [{ specialty: 'Pädiatrie', desc: 'Fieberkrampf, jetzt wach' }],
    opening: ['Bitte helfen Sie mir, mein Baby krampft! Es zuckt am ganzen Körper!'],
    answers: {
      was: ['Sie hat seit gestern Fieber und jetzt auf einmal hat sie angefangen zu zucken.'],
      zustand: ['Jetzt hört es auf... sie ist ganz schlapp, aber sie atmet.'],
      wieviele: ['Meine Tochter, sie ist eineinhalb.'],
      gefahr: ['Nein, nein.'],
    },
    lage: 'Kleinkind nach Fieberkrampf, aktuell wach und stabil, Transport in Kinderklinik.',
    workMin: [12, 18],
  },
  {
    id: 'rd_hilflos',
    stichwort: 'RD 1',
    weight: 0.8,
    where: 'strasse',
    patients: [{ specialty: 'Innere Medizin', desc: 'Hilflose Person, stark alkoholisiert' }],
    opening: ['Servus, da liegt ein Mann auf dem Gehweg, der schaut nicht gut aus.'],
    answers: {
      was: ['Keine Ahnung, er liegt halt da. Riecht nach Alkohol, glaub ich.'],
      zustand: ['Er brummelt was, wenn man ihn anspricht. Atmen tut er.'],
      wieviele: ['Nur der eine.'],
      gefahr: ['Nein, er liegt neben der Straße, nicht auf der Fahrbahn.'],
    },
    lage: 'Stark alkoholisierte Person, unterkühlt, ansprechbar, Transport zur Überwachung.',
    workMin: [10, 15],
  },
  {
    id: 'rd_sport',
    stichwort: 'RD 1',
    weight: 0.7,
    where: 'strasse',
    patients: [{ specialty: 'Chirurgie', desc: 'Sprunggelenksverletzung' }],
    opening: ['Ja hallo, wir sind beim Fußballtraining, ein Spieler hat sich am Knöchel verletzt.'],
    answers: {
      was: ['Er ist umgeknickt, der Knöchel ist dick und er kann nicht auftreten.'],
      zustand: ['Er ist wach, hat aber starke Schmerzen.'],
      wieviele: ['Einer, 24 Jahre.'],
      gefahr: ['Nein.'],
    },
    lage: 'Patient mit Distorsion OSG, V. a. Fraktur, Transport in Chirurgie.',
    workMin: [10, 15],
  },
  {
    id: 'rd_ktp',
    stichwort: 'RD KTP',
    weight: 0.8,
    where: 'objekt',
    objectKinds: ['seniorenheim'],
    needs: { KTW: 1 },
    patients: [{ specialty: 'Innere Medizin', desc: 'Liegendtransport zur stationären Aufnahme' }],
    opening: ['Grüß Gott, hier ist die Pflege vom {objekt}. Wir bräuchten einen Krankentransport.'],
    answers: {
      was: ['Der Hausarzt hat eine Einweisung geschrieben, Verdacht auf Lungenentzündung. Liegend, bitte.'],
      zustand: ['Er ist stabil, wach, hat etwas Fieber.'],
      wieviele: ['Ein Bewohner, Herr {name}, {alter} Jahre.'],
      gefahr: ['Nein.'],
    },
    lage: 'Krankentransport, Patient stabil, Transport nach Einweisung.',
    workMin: [8, 12],
  },
  {
    id: 'b_muell',
    stichwort: 'B 1',
    weight: 0.9,
    where: 'strasse',
    opening: ['Da brennt eine Mülltonne bei uns vorm Haus!'],
    answers: {
      was: ['Eine Papiertonne brennt, steht direkt am Gehweg.'],
      zustand: ['Verletzt ist niemand.'],
      wieviele: ['Niemand verletzt.'],
      gefahr: ['Die steht etwa zwei Meter von der Garage weg.'],
    },
    lage: 'Brennende Mülltonne, Löschangriff mit Schnellangriff, keine Ausbreitung.',
    workMin: [10, 15],
  },
  {
    id: 'b_pkw',
    stichwort: 'B 2',
    weight: 0.7,
    where: 'strasse',
    opening: ['Hier brennt ein Auto! Da kommt richtig Qualm raus!'],
    answers: {
      was: ['Ein geparktes Auto, aus dem Motorraum kommen Flammen.'],
      zustand: ['Es sitzt keiner drin, glaub ich.'],
      wieviele: ['Niemand verletzt.'],
      gefahr: ['Daneben stehen noch andere Autos!'],
    },
    lage: 'Pkw-Brand im Motorraum, Brandbekämpfung unter PA, keine Personen betroffen.',
    workMin: [15, 25],
  },
  {
    id: 'b_hecke',
    stichwort: 'B 2',
    weight: 0.5,
    where: 'wohnung',
    opening: ['Beim Nachbarn brennt die Hecke! Der wollte Unkraut abflämmen!'],
    answers: {
      was: ['Die Thujenhecke brennt, ungefähr zehn Meter lang.'],
      zustand: ['Der Nachbar hat sich die Hand verbrannt, aber nicht schlimm.'],
      wieviele: ['Keiner richtig verletzt.'],
      gefahr: ['Das Feuer ist schon fast am Gartenhaus!'],
    },
    lage: 'Heckenbrand ca. 10 m, droht auf Gartenhaus überzugreifen, Riegelstellung aufgebaut.',
    workMin: [15, 25],
  },
  {
    id: 'b_wohnung',
    stichwort: 'B 3',
    weight: 0.6,
    where: 'wohnung',
    patients: [{ specialty: 'Innere Medizin', desc: 'Rauchgasintoxikation' }],
    opening: ['Hilfe, es brennt! Aus der Wohnung unter uns kommt ganz viel Rauch!'],
    answers: {
      was: ['Im ersten Stock, da kommt schwarzer Rauch aus dem Fenster, ich glaub die Küche.'],
      zustand: ['Ich weiß nicht, ob die Nachbarin noch drin ist!'],
      wieviele: ['Die alte Frau aus dem ersten Stock hab ich noch nicht gesehen.'],
      gefahr: ['Das Treppenhaus ist schon voller Rauch, wir kommen nicht mehr runter!'],
    },
    lage: 'Küchenbrand 1. OG, Treppenhaus verraucht, eine Person durch Trupp unter PA gerettet, Bewohner 2. OG über DLK.',
    workMin: [30, 45],
  },
  {
    id: 'b_scheune',
    stichwort: 'B 4',
    weight: 0.3,
    where: 'ausserorts',
    opening: ['Da brennt eine Scheune! Die steht schon komplett in Flammen!'],
    answers: {
      was: ['Eine große Scheune neben einem Bauernhof, das Dach brennt schon voll.'],
      zustand: ['Der Bauer ist draußen, der hat nichts.'],
      wieviele: ['Keine Verletzten, aber da sind noch Kühe im Stall daneben!'],
      gefahr: ['Daneben ist das Wohnhaus und der Stall, und da stehen Gasflaschen!'],
    },
    lage: 'Scheune in Vollbrand, Übergreifen auf Stall und Wohnhaus droht, Wasserversorgung über lange Wegstrecke nötig.',
    workMin: [45, 60],
  },
  {
    id: 'thl_oel',
    stichwort: 'THL 1',
    weight: 0.7,
    where: 'strasse',
    opening: ['Ja, guten Tag, da ist eine riesige Ölspur auf der Straße.'],
    answers: {
      was: ['Da hat wohl ein Traktor Öl verloren, die ganze Straße entlang, sicher hundert Meter.'],
      zustand: ['Verletzt ist niemand.'],
      wieviele: ['Keiner.'],
      gefahr: ['Ein Motorradfahrer wäre fast gestürzt!'],
    },
    lage: 'Ölspur ca. 150 m, Bindemittel ausgebracht, Straße abgesichert.',
    workMin: [15, 25],
  },
  {
    id: 'thl_baum',
    stichwort: 'THL 1',
    weight: 0.6,
    where: 'ausserorts',
    opening: ['Da liegt ein Baum quer über der Straße!'],
    answers: {
      was: ['Ein großer Baum ist umgestürzt, die Straße ist komplett blockiert.'],
      zustand: ['Nein, es ist keiner drunter.'],
      wieviele: ['Keine Verletzten.'],
      gefahr: ['Die Autos kommen da in der Kurve angefahren, das ist gefährlich.'],
    },
    lage: 'Baum über Fahrbahn, Beseitigung mit Motorsäge, Straße einseitig gesperrt.',
    workMin: [20, 30],
  },
  {
    id: 'thl_tuer',
    stichwort: 'THL Person',
    weight: 0.8,
    where: 'wohnung',
    patients: [{ specialty: 'Innere Medizin', desc: 'Hilflose Person in Wohnung, exsikkiert' }],
    opening: ['Grüß Gott, ich mach mir Sorgen um meine Nachbarin, die macht nicht auf.'],
    answers: {
      was: ['Die Zeitung von gestern liegt noch vor der Tür, und ich hab sie rufen hören, aber sie macht nicht auf.'],
      zustand: ['Ich hab so ein Wimmern gehört, glaube ich.'],
      wieviele: ['Sie wohnt allein, sie ist {alter}.'],
      gefahr: ['Die Tür ist abgeschlossen, ich hab keinen Schlüssel.'],
    },
    lage: 'Wohnungsöffnung erfolgt, ältere Patientin nach Sturz am Boden, exsikkiert, Übergabe an RD.',
    workMin: [12, 20],
  },
  {
    id: 'thl_vu_klemm',
    stichwort: 'THL 3',
    weight: 0.5,
    where: 'ausserorts',
    needs: { ELW: 1, HLF: 2, RW: 1, RTW: 2, NEF: 1 },
    patients: [
      { specialty: 'Unfallchirurgie', desc: 'Polytrauma, eingeklemmt gewesen' },
      { specialty: 'Chirurgie', desc: 'Leichtverletzt, HWS-Trauma' },
    ],
    opening: ['Hier ist ein schwerer Unfall! Zwei Autos sind zusammengestoßen!'],
    answers: {
      was: ['Frontal, ein Auto liegt im Graben, das andere steht quer auf der Straße.'],
      zustand: ['Der Fahrer im Graben bewegt sich, aber er schreit, er kommt nicht raus, die Tür ist total eingedrückt!'],
      wieviele: ['Zwei Verletzte, der andere Fahrer sitzt am Straßenrand.'],
      gefahr: ['Es läuft irgendwas aus, aber es brennt nicht.'],
    },
    lage: 'VU zwei Pkw, eine Person eingeklemmt, Rettung über große Seitenöffnung, zwei Patienten.',
    workMin: [35, 50],
  },
  {
    id: 'thl_vu_leicht',
    stichwort: 'THL 2',
    weight: 0.7,
    where: 'strasse',
    needs: { HLF: 1, RTW: 1 },
    patients: [{ specialty: 'Chirurgie', desc: 'HWS-Distorsion' }],
    opening: ['Ja, hier hat es gekracht, ein Auffahrunfall.'],
    answers: {
      was: ['Zwei Autos, einer ist hinten drauf gefahren. Da läuft Kühlwasser aus.'],
      zustand: ['Eine Frau hat Nackenschmerzen, sie sitzt noch im Auto, kann aber aussteigen.'],
      wieviele: ['Eine Verletzte.'],
      gefahr: ['Es läuft was aus, die Straße ist halb blockiert.'],
    },
    lage: 'Auffahrunfall zwei Pkw, eine leichtverletzte Person, auslaufende Betriebsstoffe.',
    workMin: [20, 30],
  },
  {
    id: 'thl_ab_vu',
    stichwort: 'THL 3',
    weight: 0.35,
    where: 'autobahn',
    needs: { ELW: 1, HLF: 2, RW: 1, RTW: 1, NEF: 1 },
    patients: [{ specialty: 'Unfallchirurgie', desc: 'Polytrauma' }],
    opening: ['Ich bin auf der Autobahn, hier ist ein Lkw auf ein Auto drauf!'],
    answers: {
      was: ['Ein Lkw ist auf das Stauende aufgefahren, das Auto ist total zusammengedrückt.'],
      zustand: ['Da sitzt noch jemand drin, die Person bewegt sich nicht richtig!'],
      wieviele: ['Im Auto einer, der Lkw-Fahrer ist ausgestiegen.'],
      gefahr: ['Die Autos fahren noch an uns vorbei, total gefährlich!'],
    },
    lage: 'Lkw auf Pkw aufgefahren, Fahrer eingeklemmt, Absicherung der Einsatzstelle durch Polizei angefordert.',
    workMin: [40, 55],
  },
  {
    id: 'rd_manv',
    stichwort: 'RD MANV',
    weight: 0.15,
    where: 'ausserorts',
    needs: { RTW: 3, NEF: 1, HLF: 1 },
    patients: [
      { specialty: 'Unfallchirurgie', desc: 'Schweres Thoraxtrauma' },
      { specialty: 'Chirurgie', desc: 'Unterarmfraktur' },
      { specialty: 'Chirurgie', desc: 'Platzwunde, Prellungen' },
    ],
    opening: ['Ein Kleinbus ist in den Graben gefahren und umgekippt! Da sind ganz viele Leute drin!'],
    answers: {
      was: ['Der ist von der Straße abgekommen und liegt auf der Seite im Feld.'],
      zustand: ['Einer blutet stark am Kopf, ein paar laufen herum, eine Frau hält sich die Brust.'],
      wieviele: ['Ich glaub acht Leute, drei sind verletzt, mindestens.'],
      gefahr: ['Es brennt nicht. Aber der Bus liegt instabil.'],
    },
    lage: 'Kleinbus verunfallt, 8 Betroffene, 3 Verletzte, davon 1 schwer, Sichtung durchgeführt.',
    workMin: [30, 45],
  },
  {
    id: 'fehl_tasche',
    stichwort: '',
    weight: 0.5,
    where: 'keine',
    opening: ['(Rascheln, gedämpfte Stimmen, Musik im Hintergrund – niemand meldet sich)'],
    answers: {
      wo: ['(Rascheln… ein Lachen im Hintergrund)'],
      was: ['(Niemand antwortet)'],
      wer: ['(Rascheln)'],
    },
    lage: '',
    workMin: [1, 1],
  },
  {
    id: 'fehl_info',
    stichwort: '',
    weight: 0.4,
    where: 'keine',
    opening: ['Grüß Gott, ich hätte nur mal eine Frage: welcher Arzt hat denn heute Bereitschaftsdienst?'],
    answers: {
      wo: ['Ich bin daheim, aber es ist kein Notfall. Ich hab nur seit drei Tagen Halsweh.'],
      was: ['Halsweh und ein bisschen Fieber. Ich wollt nur wissen, wo ich hin kann.'],
      zustand: ['Mir geht es so weit gut.'],
      wer: ['{name}.'],
    },
    lage: '',
    workMin: [1, 1],
  },
];

export const BMA_TEMPLATE: IncidentTemplate = {
  id: 'bma',
  stichwort: 'B BMA',
  weight: 0,
  where: 'objekt',
  opening: [],
  answers: {},
  lage: 'BMA ausgelöst, Erkundung läuft: Täuschungsalarm durch Wasserdampf, Anlage zurückgestellt.',
  workMin: [10, 15],
};

export const BMA_REAL_LAGE = 'BMA ausgelöst, Entstehungsbrand in einem Technikraum, mit Kleinlöschgerät abgelöscht, Belüftung läuft.';

const QUESTION_TEXT: Record<QuestionId, string> = {
  wo: 'Wo genau ist der Notfallort? Straße, Hausnummer, Ort?',
  was: 'Was ist genau passiert?',
  wer: 'Wie ist Ihr Name und unter welcher Nummer erreichen wir Sie?',
  wieviele: 'Wie viele Personen sind betroffen oder verletzt?',
  zustand: 'Ist die Person wach und ansprechbar? Atmet sie normal?',
  gefahr: 'Gibt es besondere Gefahren, zum Beispiel Feuer, Rauch oder eingeklemmte Personen?',
  tcpr: 'Ich leite Sie jetzt zur Herzdruckmassage an: Legen Sie Ihre Hände in die Brustmitte und drücken Sie fest und schnell, zweimal pro Sekunde.',
  beruhigen: 'Bleiben Sie ruhig, Hilfe ist organisiert. Ich bleibe bei Ihnen am Telefon.',
};

export function questionText(q: QuestionId): string {
  return QUESTION_TEXT[q];
}

/** Ordnet eine frei getippte Frage einem Fragentyp zu */
export function classifyQuestion(text: string): QuestionId | null {
  const t = ` ${text.toLowerCase().replace(/[.,!?;:]+/g, ' ').replace(/\s+/g, ' ')} `;
  if (/reanimation|herzdruck|drücken|cpr|massage/.test(t)) return 'tcpr';
  if (/ruhig|beruhig|keine angst/.test(t)) return 'beruhigen';
  if (/wie ?viele|anzahl|verletzte|personen|betroffen/.test(t)) return 'wieviele';
  if (/name|wer sind|wer ist am|mit wem|rückruf|nummer|telefon/.test(t)) return 'wer';
  if (/atmet|atmung|ansprechbar|bewusst|zustand|wach|blut|schmerz|reagiert/.test(t)) return 'zustand';
  if (/feuer|rauch|gefahr|eingeklemmt|brennt|gas|strom|flammen/.test(t)) return 'gefahr';
  if (/ wo |adresse|straße|hausnummer|welche[mrn]? ort|ortschaft|notfallort|einsatzort|wohin|befinden sie|genau/.test(t)) return 'wo';
  if (/ was |passiert| los |geschehen|vorgefallen|notfall/.test(t)) return 'was';
  return null;
}

export const DEFAULT_ANSWERS: Record<QuestionId, string[]> = {
  wo: ['{wo}'],
  was: ['Das hab ich doch schon gesagt!'],
  wer: ['Mein Name ist {name}, Sie erreichen mich unter dieser Nummer.'],
  wieviele: ['Ich glaub, nur eine Person.'],
  zustand: ['Das weiß ich nicht genau.'],
  gefahr: ['Nein, ich glaube nicht.'],
  tcpr: ['Was? Wieso denn? Das ist doch nicht nötig!'],
  beruhigen: ['Okay... okay. Ich versuch es.'],
};
