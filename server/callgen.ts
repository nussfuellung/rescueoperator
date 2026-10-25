// Einsatzvorlagen und Anruferdialoge für simulierte Notrufe.
import type { MapObject, QuestionId, VehicleTypeId } from '../shared/types';
import { ABEK_VORLAGEN } from './vorlagen-abek';
import { FACH_VORLAGEN } from './vorlagen-fach';
import { POLIZEI_VORLAGEN } from './vorlagen-polizei';

export type LocationKind = 'wohnung' | 'strasse' | 'ausserorts' | 'objekt' | 'autobahn' | 'keine';

export interface IncidentTemplate {
  id: string;
  /** Richtiges Einsatzstichwort; leer = kein Einsatz nötig (Fehlanruf) */
  stichwort: string;
  /** Schlagwortnummer aus dem Katalog, z. B. '#B1515' */
  schlagwort?: string;
  /** Polizei muss verständigt werden (Verkehrsunfall, Wohnungsöffnung, Suizidgefahr, Absicherung) */
  polizei?: boolean;
  /** Anruf kommt von einer Streife, die schon an der Einsatzstelle ist und den Rettungsdienst nachfordert */
  polizeiVorOrt?: boolean;
  /** Fall für den ärztlichen Bereitschaftsdienst (116117): an die KVB weiterverbinden */
  kvb?: boolean;
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
  /** Wer anruft: Patient selbst, Angehörige, Passanten, Personal einer Einrichtung oder die Polizei */
  role?: CallerRole;
  /** Alter des Patienten (Standard 55–89) */
  age?: [number, number];
  sex?: 'm' | 'w';
}

export type CallerRole = 'selbst' | 'angehoerig' | 'passant' | 'personal' | 'polizei';

/** Erfundene Einzelheiten zum Anruf, damit Nachfragen stimmig beantwortet werden */
export interface CallerFacts {
  name: string;
  nachname: string;
  alter: number;
  sex: 'm' | 'w';
  role: CallerRole;
  floor: string;
  minutes: number;
  vorerkrankung: string;
}

export const FIRST_NAMES = ['Anna', 'Josef', 'Maria', 'Thomas', 'Sabine', 'Michael', 'Stefanie', 'Franz', 'Katharina', 'Andreas', 'Monika', 'Florian', 'Theresa', 'Sebastian', 'Lena', 'Georg'];
export const LAST_NAMES = ['Huber', 'Maier', 'Gruber', 'Bauer', 'Wimmer', 'Schmid', 'Hofmann', 'Brunner', 'Wagner', 'Fischer', 'Eder', 'Moser', 'Lechner', 'Steiner', 'Reiter', 'Kraus'];

export const TEMPLATES: IncidentTemplate[] = [
  {
    id: 'rd_cpr',
    role: 'angehoerig', sex: 'm',
    stichwort: 'RD 2',
    schlagwort: '#R3020',
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
    role: 'angehoerig', sex: 'w',
    stichwort: 'RD 2',
    schlagwort: '#R5010',
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
    role: 'selbst', age: [48, 76],
    stichwort: 'RD 2',
    schlagwort: '#R3010',
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
    role: 'angehoerig', sex: 'w', age: [74, 94],
    stichwort: 'RD 1',
    schlagwort: '#R6000',
    weight: 0.55,
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
    role: 'angehoerig', sex: 'm', age: [16, 18],
    stichwort: 'RD 2',
    schlagwort: '#R2010',
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
    role: 'angehoerig', sex: 'w', age: [1, 1],
    stichwort: 'RD 2-KIND',
    schlagwort: '#R7010',
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
    role: 'passant', sex: 'm', age: [35, 60],
    stichwort: 'RD 1',
    schlagwort: '#R0101',
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
    role: 'passant', sex: 'm', age: [19, 30],
    stichwort: 'RD 1',
    schlagwort: '#R6000',
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
    role: 'personal', sex: 'm', age: [78, 95],
    stichwort: 'RD KTP',
    schlagwort: '#R9010',
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
    schlagwort: '#B1014',
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
    schlagwort: '#B1510',
    polizei: true,
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
    schlagwort: '#B1013',
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
    stichwort: 'B 3 PERSON',
    schlagwort: '#B1124',
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
    schlagwort: '#B1412',
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
    schlagwort: '#T2719',
    polizei: true,
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
    schlagwort: '#T2711',
    polizei: true,
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
    role: 'passant', sex: 'w', age: [78, 92],
    stichwort: 'THL P EINGESCHLOSSEN',
    schlagwort: '#T2410',
    polizei: true,
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
    role: 'passant',
    stichwort: 'THL 3',
    schlagwort: '#T2911',
    polizei: true,
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
    role: 'passant', sex: 'w', age: [25, 60],
    stichwort: 'THL 2',
    schlagwort: '#T2810',
    polizei: true,
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
    role: 'passant',
    stichwort: 'THL 3',
    schlagwort: '#T2911',
    polizei: true,
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
    role: 'passant',
    stichwort: 'RD 3',
    schlagwort: '#R0410',
    polizei: true,
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
    id: 'rd_hypo',
    role: 'angehoerig',
    sex: 'm',
    age: [40, 75],
    stichwort: 'RD 2',
    schlagwort: '#R0110',
    weight: 0.6,
    where: 'wohnung',
    patients: [{ specialty: 'Innere Medizin', desc: 'Hypoglykämie, nach Glukosegabe wach' }],
    opening: ['Mein Mann ist ganz komisch, er schwitzt und redet wirres Zeug!', 'Hallo? Mein Mann ist Diabetiker und reagiert kaum noch!'],
    answers: {
      was: ['Er ist Diabetiker, spritzt Insulin. Heute Mittag hat er fast nichts gegessen.'],
      zustand: ['Er ist total verschwitzt und zittert, er macht die Augen auf, aber antwortet nicht richtig.'],
      bewusstsein: ['Er macht die Augen auf, aber er redet nur Unsinn.'],
      vorerkrankung: ['Zucker, Typ 1, seit zwanzig Jahren. Und Bluthochdruck.'],
      seitwann: ['Seit vielleicht einer Viertelstunde wird es immer schlimmer.'],
      gefahr: ['Nein. Soll ich ihm was Süßes geben?'],
    },
    lage: 'Patient mit Hypoglykämie (BZ 28 mg/dl), nach Glukosegabe wach und orientiert, Transport zur Abklärung.',
    workMin: [10, 15],
  },
  {
    id: 'rd_kollaps',
    role: 'passant',
    sex: 'w',
    age: [60, 85],
    stichwort: 'RD 1',
    schlagwort: '#R3000',
    weight: 0.8,
    where: 'strasse',
    patients: [{ specialty: 'Innere Medizin', desc: 'Synkope, jetzt wach' }],
    opening: ['Hallo, hier ist eine ältere Dame vor dem Bäcker umgekippt!', 'Grüß Gott, eine Frau ist hier gerade zusammengesackt, beim Einkaufen.'],
    answers: {
      was: ['Sie stand in der Schlange und ist einfach umgefallen, ganz langsam, nicht hart aufgeschlagen.'],
      zustand: ['Jetzt ist sie wieder wach, aber ganz blass und ein bisschen durcheinander.'],
      atmung: ['Ja, sie atmet ganz normal.'],
      seitwann: ['Gerade eben, vor zwei Minuten vielleicht.'],
      gefahr: ['Nein, sie sitzt jetzt auf einem Stuhl.'],
    },
    lage: 'Ältere Patientin nach kurzer Synkope, jetzt wach, RR niedrig, Transport zur Abklärung.',
    workMin: [12, 18],
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
  // ---- weitere Vorlagen für mehr Abwechslung ----
  {
    id: 'rd_bauch',
    role: 'selbst', age: [22, 70],
    stichwort: 'RD 1',
    schlagwort: '#R4000',
    weight: 0.8,
    where: 'wohnung',
    patients: [{ specialty: 'Chirurgie', desc: 'Akutes Abdomen, V. a. Appendizitis' }],
    opening: ['Hallo, ich hab so starke Bauchschmerzen, ich halt das nicht mehr aus.', 'Ja, grüß Gott, ich krümm mich hier vor Bauchweh.'],
    answers: {
      was: ['Seit heute früh, erst um den Nabel rum, jetzt rechts unten. Ich hab mich auch übergeben.'],
      zustand: ['Ich bin wach, aber jede Bewegung tut weh.'],
      seitwann: ['Seit heute Morgen, und es wird immer schlimmer.'],
      vorerkrankung: ['Eigentlich nichts, ich bin sonst gesund.'],
      gefahr: ['Nein, die Tür ist offen.'],
    },
    lage: 'Patient mit akutem Abdomen, Druckschmerz rechter Unterbauch, Transport in Chirurgie.',
    workMin: [10, 16],
  },
  {
    id: 'rd_krampf',
    role: 'angehoerig', sex: 'm', age: [18, 45],
    stichwort: 'RD 2',
    schlagwort: '#R5010',
    weight: 0.7,
    where: 'wohnung',
    patients: [{ specialty: 'Innere Medizin', desc: 'Generalisierter Krampfanfall, postiktal' }],
    opening: ['Mein Freund krampft! Er zuckt am ganzen Körper!', 'Hilfe, mein Sohn hat einen Anfall, er zittert total und reagiert nicht!'],
    answers: {
      was: ['Er ist auf einmal umgefallen und hat angefangen zu zucken, Schaum vorm Mund.'],
      zustand: ['Jetzt hat es aufgehört, aber er ist ganz benommen und schnarcht so.'],
      seitwann: ['Das ging vielleicht zwei, drei Minuten.'],
      vorerkrankung: ['Er hat Epilepsie, aber das war lange nicht mehr.'],
      atmung: ['Ja, jetzt atmet er wieder, aber laut.'],
      gefahr: ['Er hat sich am Kopf gestoßen, blutet ein bisschen.'],
    },
    lage: 'Patient nach generalisiertem Krampfanfall, postiktal, Kopfplatzwunde, kein erneuter Anfall.',
    workMin: [12, 18],
  },
  {
    id: 'rd_allergie',
    role: 'passant', sex: 'w', age: [20, 50],
    stichwort: 'RD 2',
    schlagwort: '#R3010',
    weight: 0.5,
    where: 'strasse',
    patients: [{ specialty: 'Innere Medizin', desc: 'Anaphylaxie nach Wespenstich' }],
    opening: ['Hier ist eine Frau von einer Wespe gestochen worden, sie kriegt keine Luft mehr!'],
    answers: {
      was: ['Sie wurde in den Hals gestochen, jetzt ist alles rot und dick, und sie röchelt.'],
      zustand: ['Sie ist wach, aber ganz panisch, und das Gesicht schwillt an.'],
      vorerkrankung: ['Sie sagt, sie ist allergisch, aber ihr Notfallset hat sie nicht dabei.'],
      atmung: ['Sie atmet ganz schwer, so pfeifend.'],
      gefahr: ['Nein, wir sind auf dem Gehweg.'],
    },
    lage: 'Anaphylaktische Reaktion Grad III nach Wespenstich, Adrenalin gegeben, Besserung.',
    workMin: [12, 18],
  },
  {
    id: 'rd_kind_fieber',
    role: 'angehoerig', sex: 'w', age: [1, 4],
    stichwort: 'RD 2-KIND',
    schlagwort: '#R7010',
    weight: 0.4,
    where: 'wohnung',
    patients: [{ specialty: 'Pädiatrie', desc: 'Fieberkrampf, Kleinkind' }],
    opening: ['Hilfe! Meine Tochter hat gekrampft, sie ist ganz heiß!', 'Bitte kommen Sie schnell, unsere Kleine hat einen Anfall gehabt!'],
    answers: {
      was: ['Sie hat seit gestern Fieber und eben hat sie auf einmal die Augen verdreht und gezuckt.'],
      zustand: ['Jetzt weint sie wieder, aber sie ist so schlapp.'],
      wieviele: ['Nur unsere Tochter, sie ist {alter}.'],
      seitwann: ['Das Zucken war eine Minute vielleicht, gerade eben.'],
      gefahr: ['Nein.'],
    },
    lage: 'Kleinkind nach erstmaligem Fieberkrampf, jetzt wach, Fieber 39,8 Grad, Transport Kinderklinik.',
    workMin: [12, 18],
  },
  {
    id: 'rd_schnitt',
    role: 'selbst', sex: 'm', age: [20, 65],
    stichwort: 'RD 1',
    schlagwort: '#R6000',
    weight: 0.5,
    where: 'wohnung',
    patients: [{ specialty: 'Chirurgie', desc: 'Tiefe Schnittverletzung Hand' }],
    opening: ['Ja, hallo, ich hab mich mit dem Messer übel geschnitten, das hört nicht auf zu bluten.'],
    answers: {
      was: ['Beim Gemüseschneiden abgerutscht, quer über die Handfläche, ziemlich tief.'],
      zustand: ['Mir ist ein bisschen schummrig, aber geht schon.'],
      gefahr: ['Nein. Ich drück ein Handtuch drauf.'],
      seitwann: ['Vor zehn Minuten.'],
    },
    lage: 'Tiefe Schnittverletzung linke Hand, Blutung mit Druckverband gestillt, Transport Handchirurgie.',
    workMin: [10, 14],
  },
  {
    id: 'rd_rad',
    role: 'passant', sex: 'm', age: [12, 70],
    stichwort: 'RD 1',
    schlagwort: '#R6001',
    weight: 0.7,
    where: 'strasse',
    patients: [{ specialty: 'Unfallchirurgie', desc: 'Fahrradsturz, V. a. Schlüsselbeinfraktur' }],
    opening: ['Hier ist ein Radfahrer gestürzt, der liegt auf der Straße.', 'Grüß Gott, ein Mann ist mit dem Fahrrad hingefallen, der kommt nicht hoch.'],
    answers: {
      was: ['Er ist an der Bordsteinkante hängen geblieben und über den Lenker geflogen.'],
      zustand: ['Er ist wach und redet, hält sich die Schulter. Einen Helm hatte er auf.'],
      gefahr: ['Er liegt halb auf der Fahrbahn, ich stell mich mal hin und sichere.'],
    },
    lage: 'Fahrradsturz, Patient wach, V. a. Klavikulafraktur rechts, keine Bewusstlosigkeit.',
    workMin: [10, 16],
  },
  {
    id: 'rd_psych',
    role: 'angehoerig', sex: 'm', age: [20, 50],
    stichwort: 'RD 2',
    schlagwort: '#R5110',
    polizei: true,
    weight: 0.4,
    where: 'wohnung',
    patients: [{ specialty: 'Innere Medizin', desc: 'Psychischer Ausnahmezustand, Intoxikation mit Tabletten unklar' }],
    opening: ['Mein Bruder hat Tabletten genommen, ich weiß nicht wie viele!', 'Bitte helfen Sie, mein Mann sagt, er will nicht mehr, und hat Tabletten geschluckt.'],
    answers: {
      was: ['Er hat eine Packung von seinen Schlaftabletten genommen, vor einer halben Stunde ungefähr.'],
      zustand: ['Er ist wach, aber ganz müde und weint.'],
      gefahr: ['Er hat sich im Schlafzimmer eingeschlossen, aber redet noch mit mir.'],
      vorerkrankung: ['Er hat Depressionen, ist in Behandlung.'],
    },
    lage: 'Intoxikation mit Benzodiazepinen in suizidaler Absicht, Patient somnolent, Polizei verständigt.',
    workMin: [15, 25],
  },
  {
    id: 'rd_heim_sturz',
    role: 'personal', sex: 'w', age: [82, 98],
    stichwort: 'RD 1',
    schlagwort: '#R6000',
    weight: 0.6,
    where: 'objekt',
    objectKinds: ['seniorenheim'],
    patients: [{ specialty: 'Unfallchirurgie', desc: 'Sturz mit Kopfplatzwunde, antikoaguliert' }],
    opening: ['Grüß Gott, hier ist die Pflege vom {objekt}, bei uns ist eine Bewohnerin gestürzt.'],
    answers: {
      was: ['Sie ist nachts auf dem Weg zur Toilette gestürzt und hat eine Platzwunde am Kopf.'],
      zustand: ['Sie ist wach, aber etwas verwirrter als sonst.'],
      vorerkrankung: ['Sie nimmt Blutverdünner, Marcumar.'],
      wieviele: ['Eine Bewohnerin, Frau {name}, {alter} Jahre.'],
      gefahr: ['Nein, Eingang ist hinten an der Pforte.'],
    },
    lage: 'Ältere Patientin nach Sturz, Kopfplatzwunde, unter Antikoagulation, Transport zur CT-Abklärung.',
    workMin: [10, 16],
  },
  {
    id: 'rd_schule',
    role: 'personal', sex: 'm', age: [11, 16],
    stichwort: 'RD 1',
    schlagwort: '#R6000',
    weight: 0.4,
    where: 'objekt',
    objectKinds: ['schule'],
    patients: [{ specialty: 'Unfallchirurgie', desc: 'Sportunfall, V. a. Sprunggelenksfraktur' }],
    opening: ['Hallo, hier ist das Sekretariat vom {objekt}. Ein Schüler hat sich im Sportunterricht verletzt.'],
    answers: {
      was: ['Beim Basketball umgeknickt, der Knöchel ist schon ganz dick.'],
      zustand: ['Er ist wach, hat starke Schmerzen, kann nicht auftreten.'],
      wieviele: ['Ein Schüler, {alter} Jahre.'],
      gefahr: ['Nein. Bitte zur Turnhalle hinten fahren.'],
    },
    lage: 'Schüler mit Supinationstrauma, V. a. Sprunggelenksfraktur, Eltern informiert.',
    workMin: [10, 15],
  },
  {
    id: 'rd_kirche',
    role: 'passant', sex: 'm', age: [65, 90],
    stichwort: 'RD 2',
    schlagwort: '#R1010',
    weight: 0.25,
    where: 'objekt',
    objectKinds: ['kirche'],
    patients: [{ specialty: 'Kardiologie (HKL)', desc: 'Synkope mit Herzrhythmusstörung' }],
    opening: ['Hier ist ein Mann in der Kirche zusammengebrochen, im {objekt}!'],
    answers: {
      was: ['Während der Messe ist er einfach von der Bank gerutscht.'],
      zustand: ['Er ist wieder ein bisschen zu sich gekommen, aber ganz grau im Gesicht.'],
      atmung: ['Ja, er atmet.'],
      gefahr: ['Nein, wir haben ihn hingelegt.'],
    },
    lage: 'Patient nach Synkope, bradykarde Rhythmusstörung, Transport in Kardiologie.',
    workMin: [14, 20],
  },
  {
    id: 'rd_ktp_dialyse',
    role: 'personal', sex: 'w', age: [60, 88],
    stichwort: 'RD KTP',
    schlagwort: '#R9016',
    weight: 0.6,
    where: 'wohnung',
    needs: { KTW: 1 },
    patients: [{ specialty: 'Innere Medizin', desc: 'Sitzendtransport zur Dialyse' }],
    opening: ['Guten Tag, hier ist der Pflegedienst. Wir bräuchten einen Krankentransport für eine Patientin.'],
    answers: {
      was: ['Sie muss heute noch ins Krankenhaus zur Aufnahme, der Hausarzt hat eine Verordnung geschrieben.'],
      zustand: ['Sie ist stabil, kann mit Hilfe ein paar Schritte gehen.'],
      wieviele: ['Eine Patientin, Frau {name}, {alter} Jahre.'],
      gefahr: ['Nein, wir sind im zweiten Stock, es gibt keinen Aufzug.'],
    },
    lage: 'Krankentransport, Patientin stabil, Tragestuhl benötigt.',
    workMin: [8, 12],
  },
  {
    id: 'b_container',
    role: 'passant',
    stichwort: 'B 1',
    schlagwort: '#B1014',
    weight: 0.5,
    where: 'strasse',
    opening: ['Hier brennt ein Altpapiercontainer!', 'Ja, grüß Gott, beim Wertstoffhof brennt ein Container.'],
    answers: {
      was: ['Ein Papiercontainer, da kommen Flammen oben raus.'],
      zustand: ['Verletzt ist niemand.'],
      gefahr: ['Daneben stehen noch zwei Container und ein Auto parkt ganz nah.'],
    },
    lage: 'Altpapiercontainer in Vollbrand, Ablöschen mit einem C-Rohr, keine Ausbreitung.',
    workMin: [15, 25],
  },
  {
    id: 'b_flaeche',
    role: 'passant',
    stichwort: 'B 2',
    schlagwort: '#B1013',
    weight: 0.4,
    where: 'ausserorts',
    opening: ['Hier brennt ein Feld! Das breitet sich ganz schnell aus!', 'Am Waldrand brennt die Wiese, das qualmt ordentlich.'],
    answers: {
      was: ['Ein Stoppelfeld, sicher schon so groß wie ein Fußballplatz.'],
      zustand: ['Der Bauer versucht mit dem Traktor eine Schneise zu ziehen.'],
      gefahr: ['Der Wind treibt es Richtung Wald!'],
    },
    lage: 'Flächenbrand ca. 5000 m², Ausbreitung Richtung Waldrand gestoppt, Nachlöscharbeiten.',
    workMin: [30, 45],
  },
  {
    id: 'b_kamin',
    role: 'selbst', sex: 'm', age: [40, 80],
    stichwort: 'B 2',
    schlagwort: '#B1115',
    weight: 0.35,
    where: 'wohnung',
    opening: ['Bei uns brennt der Kamin, da kommen Funken oben raus und es knistert ganz laut!'],
    answers: {
      was: ['Wir haben den Ofen angemacht und jetzt dröhnt der Kamin, und oben fliegen Funken raus.'],
      zustand: ['Uns geht es gut, wir sind alle draußen.'],
      gefahr: ['Im Dachboden ist es ganz warm geworden.'],
    },
    lage: 'Kaminbrand, Schornsteinfeger verständigt, Kontrolle Dachboden mit Wärmebildkamera, keine Ausbreitung.',
    workMin: [30, 45],
  },
  {
    id: 'b_keller',
    role: 'angehoerig',
    stichwort: 'B 3 PERSON',
    schlagwort: '#B1117',
    weight: 0.35,
    where: 'wohnung',
    needs: { ELW: 1, HLF: 2, DLK: 1, RTW: 1 },
    patients: [{ specialty: 'Innere Medizin', desc: 'Leichte Rauchgasintoxikation' }],
    opening: ['Bei uns im Keller brennt es! Das ganze Haus riecht nach Rauch!'],
    answers: {
      was: ['Im Keller, da wo die Waschmaschine steht, kommt dicker schwarzer Rauch hoch.'],
      zustand: ['Mein Mann hat versucht zu löschen und hustet jetzt ganz schlimm.'],
      wieviele: ['Wir sind zu dritt draußen, oben wohnt noch eine Familie, ich weiß nicht, ob die da sind.'],
      gefahr: ['Das Treppenhaus wird schon grau.'],
    },
    lage: 'Kellerbrand, Treppenhaus verraucht, Entrauchung, eine Person mit leichter Rauchgasintoxikation.',
    workMin: [35, 50],
  },
  {
    id: 'thl_wasser',
    role: 'selbst',
    stichwort: 'THL 1',
    schlagwort: '#T2721',
    weight: 0.4,
    where: 'wohnung',
    opening: ['Bei uns steht der ganze Keller unter Wasser!', 'Hallo, da ist ein Wasserrohr geplatzt, das spritzt überall!'],
    answers: {
      was: ['Ein Rohr im Keller ist geplatzt, das Wasser steht schon knöchelhoch.'],
      zustand: ['Nein, verletzt ist keiner.'],
      gefahr: ['Da unten ist auch der Sicherungskasten!'],
    },
    lage: 'Wasserschaden im Keller nach Rohrbruch, Hauptwasserhahn abgedreht, Wasser abgepumpt, Strom freigeschaltet.',
    workMin: [20, 35],
  },
  {
    id: 'thl_tier',
    role: 'passant',
    stichwort: 'THL 1',
    schlagwort: '#T2730',
    weight: 0.3,
    where: 'ausserorts',
    opening: ['Hier ist ein Reh in einen Zaun gesprungen und hängt fest.', 'Grüß Gott, da ist eine Kuh in den Bach gefallen und kommt nicht mehr raus.'],
    answers: {
      was: ['Das Tier hängt fest und zappelt, ich komm da nicht ran.'],
      zustand: ['Es lebt noch, ist aber ganz erschöpft.'],
      gefahr: ['Nein, nur das Tier.'],
    },
    lage: 'Tier befreit, Jagdpächter bzw. Tierhalter informiert.',
    workMin: [15, 25],
  },
  {
    id: 'thl_aufzug',
    role: 'personal',
    stichwort: 'THL P AUFZUG',
    schlagwort: '#T1910',
    weight: 0.3,
    where: 'objekt',
    objectKinds: ['seniorenheim', 'schule'],
    needs: { HLF: 1 },
    opening: ['Hallo, hier im {objekt} steckt ein Aufzug fest, da sind Leute drin.'],
    answers: {
      was: ['Der Aufzug ist zwischen zwei Stockwerken stehen geblieben, seit zwanzig Minuten.'],
      zustand: ['Den Leuten geht es gut, eine ältere Dame wird langsam nervös.'],
      wieviele: ['Drei Personen.'],
      gefahr: ['Der Notdienst der Aufzugsfirma braucht über eine Stunde.'],
    },
    lage: 'Aufzug zwischen 1. und 2. OG festgefahren, drei Personen unverletzt befreit.',
    workMin: [15, 25],
  },
  {
    id: 'abc_gas',
    role: 'selbst',
    stichwort: 'ABC 1',
    schlagwort: '#A1013',
    weight: 0.35,
    where: 'wohnung',
    opening: ['Grüß Gott, bei uns im Treppenhaus riecht es ganz stark nach Gas!', 'Hallo, in unserer Wohnung stinkt es nach Gas, was soll ich machen?'],
    answers: {
      was: ['Das riecht so faulig, wie Gas halt. Im ganzen Treppenhaus.'],
      zustand: ['Nein, uns geht es gut, nur ein bisschen Kopfweh.'],
      wieviele: ['Im Haus wohnen sechs Parteien.'],
      gefahr: ['Ich hab kein Licht angemacht. Sollen wir raus?'],
    },
    lage: 'Gasgeruch im Treppenhaus, Messung positiv an undichter Gasleitung im Keller, Haus geräumt, Versorger verständigt.',
    workMin: [25, 40],
  },
  {
    id: 'abc_kraftstoff',
    role: 'passant',
    stichwort: 'ABC KRAFTSTOFF',
    schlagwort: '#A1110',
    polizei: true,
    weight: 0.3,
    where: 'strasse',
    opening: ['Hier läuft aus einem Auto Benzin aus, das ist eine richtige Pfütze!'],
    answers: {
      was: ['Der Tank ist wohl aufgerissen, nachdem er über den Bordstein gefahren ist. Das tropft die ganze Zeit.'],
      zustand: ['Verletzt ist keiner.'],
      wieviele: ['Keiner.'],
      gefahr: ['Es riecht stark nach Benzin, und da raucht einer daneben!'],
    },
    lage: 'Kraftstoffaustritt aus Pkw-Tank, ca. 20 l, Bindemittel ausgebracht, Tank abgedichtet.',
    workMin: [15, 25],
  },
  {
    id: 'abc_heizoel',
    role: 'selbst',
    stichwort: 'ABC ÖL LAND',
    schlagwort: '#A2110',
    weight: 0.2,
    where: 'wohnung',
    opening: ['Bei uns im Keller läuft Heizöl aus dem Tank aus!'],
    answers: {
      was: ['Unten am Tank ist es undicht, da steht schon eine Lache im Kellerraum.'],
      zustand: ['Nein, keiner verletzt, aber es stinkt fürchterlich.'],
      gefahr: ['Da ist ein Gully im Boden, ich weiß nicht, ob das da reinläuft.'],
    },
    lage: 'Undichter Heizöltank, ca. 50 l ausgelaufen, Leck abgedichtet, Öl gebunden, Wasserwirtschaftsamt informiert.',
    workMin: [30, 45],
  },
  {
    id: 'b_lkw',
    role: 'passant',
    stichwort: 'B 3',
    schlagwort: '#B1515',
    polizei: true,
    weight: 0.2,
    where: 'ausserorts',
    opening: ['Hier brennt ein Lastwagen auf der Landstraße! Das Führerhaus steht in Flammen!'],
    answers: {
      was: ['Ein Sattelzug, der Fahrer ist rausgesprungen, vorne brennt alles.'],
      zustand: ['Der Fahrer ist draußen, der hustet nur.'],
      wieviele: ['Nur der Fahrer, und der ist raus.'],
      gefahr: ['Was der geladen hat, weiß ich nicht. Hinten steht nichts drauf.'],
    },
    lage: 'Sattelzug Führerhaus im Vollbrand, Ladung Paletten nicht betroffen, Brand mit 2 C-Rohren unter PA gelöscht, Straße gesperrt.',
    workMin: [35, 50],
  },
  {
    id: 'rd_sturz_hand',
    role: 'selbst', age: [55, 85],
    stichwort: 'RD 1',
    schlagwort: '#R6000',
    weight: 0.35,
    where: 'strasse',
    patients: [{ specialty: 'Unfallchirurgie', desc: 'Sturz auf die Hand, V. a. distale Radiusfraktur' }],
    opening: ['Hallo, ich bin auf dem Gehweg hingefallen, mein Handgelenk sieht ganz schief aus.', 'Grüß Gott, ich bin gestolpert und auf die Hand gefallen, das tut furchtbar weh.'],
    answers: {
      was: ['Ich bin über eine Bordsteinkante gestolpert und hab mich mit der Hand abgefangen. Das Handgelenk ist ganz dick.'],
      zustand: ['Mir ist ein bisschen schwindlig vor Schmerz, aber sonst geht es.'],
      wieviele: ['Nur ich.'],
      gefahr: ['Nein, ich sitze auf einer Bank.'],
    },
    lage: 'Patient nach Sturz auf die Hand, Fehlstellung Handgelenk rechts, geschient, Vitalwerte stabil.',
    workMin: [10, 16],
  },
  {
    id: 'rd_sturz_treppe',
    role: 'angehoerig', age: [60, 90],
    stichwort: 'RD 2',
    schlagwort: '#R6010',
    weight: 0.3,
    where: 'wohnung',
    patients: [{ specialty: 'Unfallchirurgie', desc: 'Treppensturz, SHT mit kurzer Bewusstlosigkeit' }],
    opening: ['Mein Mann ist die Kellertreppe runtergefallen! Er blutet am Kopf!', 'Hilfe, mein Vater ist die Treppe runtergestürzt und war kurz weg!'],
    answers: {
      was: ['Er ist die ganze Treppe runter, mit dem Kopf gegen die Wand. Er war kurz bewusstlos.'],
      zustand: ['Jetzt ist er wieder wach, aber er weiß nicht, was passiert ist, und er erbricht.'],
      wieviele: ['Nur er, er ist {alter}.'],
      gefahr: ['Nein, aber er liegt unten im Keller.'],
    },
    lage: 'Patient nach Treppensturz, SHT mit Amnesie und Erbrechen, HWS immobilisiert, Transport in Klinik mit CT.',
    workMin: [14, 22],
  },
  {
    id: 'rd_sturz_glatteis',
    role: 'passant', age: [35, 75],
    stichwort: 'RD 1',
    schlagwort: '#R6000',
    weight: 0.3,
    where: 'strasse',
    patients: [{ specialty: 'Chirurgie', desc: 'Sturz auf den Rücken, Prellung, Rippenschmerz' }],
    opening: ['Hier ist ein Mann auf dem Parkplatz ausgerutscht und liegt am Boden.', 'Grüß Gott, hier ist eine Frau gestürzt und kommt nicht mehr hoch.'],
    answers: {
      was: ['Ausgerutscht und voll auf den Rücken gefallen. Jetzt hält er sich die Seite.'],
      zustand: ['Er ist wach und spricht, er hat Schmerzen beim Atmen.'],
      wieviele: ['Einer.'],
      gefahr: ['Es ist ziemlich glatt hier, aufpassen beim Aussteigen.'],
    },
    lage: 'Patient nach Sturz, Thoraxprellung rechts, keine Atemnot, Vitalwerte stabil.',
    workMin: [10, 15],
  },
  {
    id: 'rd_sturz_leiter',
    role: 'angehoerig', sex: 'm', age: [40, 75],
    stichwort: 'RD 2',
    schlagwort: '#R6010',
    weight: 0.25,
    where: 'wohnung',
    patients: [{ specialty: 'Unfallchirurgie', desc: 'Sturz von der Leiter aus 3 m, V. a. Wirbelsäulenverletzung' }],
    opening: ['Mein Mann ist von der Leiter gefallen, beim Dachrinne putzen!'],
    answers: {
      was: ['Aus bestimmt drei Metern, er ist auf den Rücken gefallen.'],
      zustand: ['Er ist wach, aber er sagt, seine Beine kribbeln komisch.'],
      wieviele: ['Nur er, er ist {alter}.'],
      gefahr: ['Er liegt im Garten hinterm Haus.'],
    },
    lage: 'Patient nach Sturz aus ca. 3 m, Rückenschmerz und Parästhesien, achsengerecht immobilisiert, Transport in Traumazentrum.',
    workMin: [16, 25],
  },
  {
    id: 'kvb_fieber',
    role: 'angehoerig', age: [25, 70],
    stichwort: 'RD 1',
    kvb: true,
    weight: 0.3,
    where: 'wohnung',
    patients: [{ specialty: 'Innere Medizin', desc: 'Fieberhafter Infekt seit zwei Tagen' }],
    opening: ['Ja, grüß Gott, mein Mann hat seit zwei Tagen hohes Fieber und der Hausarzt hat zu.', 'Hallo, ich bräuchte einen Arzt, ich hab seit gestern Fieber und Halsschmerzen.'],
    answers: {
      was: ['Fieber um die 39, Gliederschmerzen, Husten. Fiebersaft hilft immer nur kurz.'],
      zustand: ['Er liegt im Bett, ist schlapp, aber ganz klar.'],
      atmung: ['Normal, nur der Husten halt.'],
      bewusstsein: ['Ja, er ist ganz klar.'],
      wieviele: ['Nur er.'],
      gefahr: ['Nein.'],
    },
    lage: 'Patient mit fieberhaftem Infekt, Vitalwerte stabil, Vorstellung beim Hausarzt empfohlen, kein Transport erforderlich.',
    workMin: [10, 15],
  },
  {
    id: 'kvb_ruecken',
    role: 'selbst', age: [30, 70],
    stichwort: 'RD 1',
    kvb: true,
    weight: 0.25,
    where: 'wohnung',
    patients: [{ specialty: 'Chirurgie', desc: 'Rückenschmerzen seit Tagen, mobil' }],
    opening: ['Hallo, ich hab seit drei Tagen so Rückenschmerzen, es wird einfach nicht besser.'],
    answers: {
      was: ['Unten im Kreuz, seit ich am Samstag Getränkekisten getragen hab. Ich kann laufen, aber nur langsam.'],
      zustand: ['Mir geht es sonst gut, es tut halt weh.'],
      atmung: ['Ja, ganz normal.'],
      bewusstsein: ['Ja.'],
      wieviele: ['Nur ich.'],
      gefahr: ['Nein.'],
    },
    lage: 'Lumbago ohne neurologische Ausfälle, Patient mobil, Hausarzt empfohlen.',
    workMin: [8, 12],
  },
  {
    id: 'kvb_harnweg',
    role: 'selbst', sex: 'w', age: [20, 75],
    stichwort: 'RD 1',
    kvb: true,
    weight: 0.2,
    where: 'wohnung',
    patients: [{ specialty: 'Innere Medizin', desc: 'Harnwegsinfekt' }],
    opening: ['Entschuldigung, ich weiß nicht, ob ich hier richtig bin. Ich hab so ein Brennen beim Wasserlassen.'],
    answers: {
      was: ['Seit gestern brennt es beim Wasserlassen und ich muss ständig. Fieber hab ich keins.'],
      zustand: ['Eigentlich geht es mir gut.'],
      atmung: ['Ja.'],
      bewusstsein: ['Ja, natürlich.'],
      wieviele: ['Nur ich.'],
      gefahr: ['Nein.'],
    },
    lage: 'Verdacht auf Harnwegsinfekt, Vitalwerte unauffällig, ärztlicher Bereitschaftsdienst empfohlen.',
    workMin: [8, 12],
  },
  {
    id: 'kvb_ohr',
    role: 'angehoerig', age: [3, 9],
    stichwort: 'RD 1',
    kvb: true,
    weight: 0.2,
    where: 'wohnung',
    patients: [{ specialty: 'Pädiatrie', desc: 'Kind mit Ohrenschmerzen' }],
    opening: ['Hallo, meine Tochter hat ganz schlimme Ohrenschmerzen und weint die ganze Zeit.'],
    answers: {
      was: ['Seit heute Abend, sie hält sich das rechte Ohr. Sie hatte die Woche Schnupfen.'],
      zustand: ['Sie weint, aber sie spielt zwischendurch auch.'],
      atmung: ['Ja, ganz normal.'],
      bewusstsein: ['Ja, sie ist ganz wach.'],
      wieviele: ['Nur sie, sie ist {alter}.'],
      gefahr: ['Nein.'],
    },
    lage: 'Kind mit Otitis-Verdacht, Allgemeinzustand gut, Vorstellung beim Kinderarzt bzw. Bereitschaftsdienst.',
    workMin: [8, 12],
  },
  {
    id: 'fehl_kind',
    stichwort: '',
    weight: 0.3,
    where: 'keine',
    opening: ['(Kinderstimme) Hallo? ... (Kichern, dann aufgelegt)', '(Kinderstimme) Ist da die Feuerwehr? Hihi.'],
    answers: {
      wo: ['(Kichern)'],
      was: ['Nix. Wir spielen nur.'],
      wer: ['(Kichern, dann aufgelegt)'],
    },
    lage: '',
    workMin: [1, 1],
  },
  ...ABEK_VORLAGEN,
  ...FACH_VORLAGEN,
  ...POLIZEI_VORLAGEN,
];

/** Meldebilder, mit denen die KVB (116117) einen Einsatz an die ILS übergibt */
export const KVB_UEBERGABE: Record<string, string> = {
  rd_chest: 'Brustschmerz seit 30 Minuten, ausstrahlend in den linken Arm, kaltschweißig',
  rd_breath: 'zunehmende Atemnot, Asthmatiker, Spray hilft nicht',
  rd_stroke: 'plötzliche Sprachstörung und hängender Mundwinkel',
  rd_bauch: 'stärkste Bauchschmerzen rechts unten, Erbrechen',
  rd_fall: 'Sturz in der Wohnung, kann nicht aufstehen, Hüftschmerz',
  rd_hypo: 'Diabetiker, verwirrt und kaltschweißig',
  rd_krampf: 'Krampfanfall, jetzt nicht richtig ansprechbar',
  rd_ktp: 'Einweisung durch den Bereitschaftsarzt, Liegendtransport',
};

export const BMA_TEMPLATE: IncidentTemplate = {
  id: 'bma',
  stichwort: 'B BMA',
  schlagwort: '#B1710',
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
  wer: 'Wie ist Ihr Name?',
  wieviele: 'Wie viele Personen sind betroffen oder verletzt?',
  zustand: 'Wie geht es der Person gerade?',
  gefahr: 'Gibt es besondere Gefahren, zum Beispiel Feuer, Rauch oder eingeklemmte Personen?',
  tcpr: 'Ich leite Sie jetzt zur Herzdruckmassage an: Legen Sie Ihre Hände in die Brustmitte und drücken Sie fest und schnell, zweimal pro Sekunde.',
  beruhigen: 'Bleiben Sie ruhig, wir kümmern uns. Atmen Sie einmal tief durch.',
  alter: 'Wie alt ist die Person?',
  atmung: 'Atmet die Person normal?',
  bewusstsein: 'Ist die Person wach und ansprechbar?',
  seitwann: 'Seit wann geht das so?',
  vorerkrankung: 'Hat die Person Vorerkrankungen oder nimmt sie Medikamente?',
  zugang: 'In welchem Stock, und wie kommen die Einsatzkräfte zu Ihnen?',
  rueckruf: 'Unter welcher Nummer erreichen wir Sie, falls die Verbindung abbricht?',
  ortbestaetigen: 'Ich wiederhole die Adresse: Stimmt das so?',
  verabschieden: 'Ich schicke Ihnen jemanden, die Einsatzkräfte sind auf dem Weg. Wenn sich etwas ändert, rufen Sie sofort wieder die 112 an.',
};

export function questionText(q: QuestionId): string {
  return QUESTION_TEXT[q];
}

/** Gesprochenen oder getippten Text vereinheitlichen (Kleinschrift, Umlaute, Satzzeichen) */
export function normalizeSpoken(text: string): string {
  return ` ${text
    .toLowerCase()
    .replace(/ae/g, 'ä')
    .replace(/oe/g, 'ö')
    .replace(/ue/g, 'ü')
    .replace(/[.,!?;:"„“]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()} `;
}

// Reihenfolge zählt: spezifische Fragen vor allgemeinen
const RULES: [QuestionId, RegExp][] = [
  ['tcpr', /reanimation|herzdruck|drücken sie|fest drücken|cpr|massage|hände auf die brust|brustmitte/],
  // "Ich wiederhole" ist die Rückbestätigung, "wiederholen Sie die Adresse" dagegen eine Frage nach dem Ort
  ['ortbestaetigen', /ich wiederhole|wiederhole ich|wiederhole (die|ihre) adresse|stimmt (das|die adresse)|ist das richtig|habe ich (das )?richtig|korrekt/],
  ['rueckruf', /rückruf|zurückrufen|(ihre|eine|welche[rn]?|die) (telefon|handy)?nummer|erreichen wir sie|erreichbar|telefonnummer/],
  // Hilfe zusagen und das Gespräch beenden
  ['verabschieden', /(ich |wir )?schicke[n]? (ihnen )?(jetzt )?(jemand|hilfe|einen|den|die|rettungsdienst|feuerwehr|polizei)|(einsatzkräfte|rettungsdienst|feuerwehr|kollegen) (sind|ist|kommen|kommt) (schon )?(auf dem weg|unterwegs)|auf wiederhören|wiederhören|ich lege (jetzt )?auf/],
  ['beruhigen', /ruhig|beruhig|keine angst|keine sorge|hilfe (ist|kommt) (unterwegs|organisiert)|tief durchatmen/],
  ['alter', /wie alt|alter |jahre alt|geburtsjahr|welches alter/],
  ['vorerkrankung', /vorerkrank|krankheit|medikament|tabletten|diabet|zucker|herzkrank|blutverdünn|allergi|krank (ist|war)/],
  ['seitwann', /seit wann|wie lange (schon|geht)|wann (ist|hat|war) (das|es)|wann (hat|fing) es|seit wie viel/],
  ['zugang', /stock|etage|klingel|zugang|eingang|haustür|tür (offen|auf)|wie komm|einweis|hinterhaus|aufzug|zufahrt|winken|hund/],
  ['atmung', /atme|atmung|luft (holen|bekommen|kriegen)|schnapp|röchel/],
  ['bewusstsein', /ansprechbar|bewusst|wach |reagier|augen (auf|offen)|antwortet/],
  ['wieviele', /wie ?viele|anzahl|mehrere|noch (jemand|weitere|andere)|wer (ist )?(noch )?(verletzt|betroffen)|verletzte/],
  ['gefahr', /feuer|rauch|qualm|gefahr|eingeklemmt|brennt|brand|gas |strom|flammen|ausl(ä|a)uf|explosion|benzin|verkehr/],
  ['zustand', /zustand|wie geht|blut|schmerz|verletz|bewegt sich|blass|schwitz|kalt|farbe/],
  ['wer', /name|wer sind|wer ist am|mit wem spreche|wie heißen|ihr name/],
  ['wo', / wo |adresse|straße|hausnummer|welche[mrn]? ort|ortschaft|notfallort|einsatzort|wohin|befinden sie|genau|in welche[mr]|wie heißt die/],
  ['was', / was |passiert| los |geschehen|vorgefallen|notfall|erzählen|beschreiben/],
];

/** Ordnet eine frei getippte oder gesprochene Frage einem Fragentyp zu */
export function classifyQuestion(text: string): QuestionId | null {
  return classifyAll(text)[0] ?? null;
}

/** Alle Fragen in einem Satz, z. B. "Wie alt ist er und atmet er?" -> alter, atmung */
export function classifyAll(text: string): QuestionId[] {
  const out: QuestionId[] = [];
  const parts = text.split(/\?|\bund\b|\bsowie\b/i).filter((p) => p.trim().length > 2);
  for (const part of parts.length ? parts : [text]) {
    const t = normalizeSpoken(part);
    const hit = RULES.find(([, re]) => re.test(t));
    if (hit && !out.includes(hit[0])) out.push(hit[0]);
  }
  return out.slice(0, 2);
}

/** Ja/Nein-Frage, die keinem Thema zugeordnet werden kann ("Ist er gestürzt?") */
export function isYesNoQuestion(text: string): boolean {
  return /^\s*(ist|hat|haben|sind|kann|können|gibt|war|waren|liegt|sitzt|steht|blutet|hört|sieht|braucht|wissen|wurde)\b/i.test(text);
}

const SELF: Partial<Record<QuestionId, string[]>> = {
  alter: ['Ich bin {alter}.', '{alter} Jahre.'],
  atmung: ['Ich krieg schon Luft, ja... aber schwer.', 'Atmen geht, ja.'],
  bewusstsein: ['Ich red doch mit Ihnen!', 'Ja, ich bin wach.'],
  vorerkrankung: ['Ich hab Bluthochdruck, dafür nehm ich Tabletten.', 'Eigentlich nichts. Nur was mit dem Blutdruck.'],
  zustand: ['Mir geht es nicht gut, ehrlich gesagt.'],
};

const RELATIVE: Partial<Record<QuestionId, string[]>> = {
  alter: ['{Er} ist {alter}.', '{alter} Jahre alt.', 'Äh... {alter}. Ja, {alter}.'],
  atmung: ['Ja, {er} atmet normal.', 'Ja, man sieht, wie sich der Brustkorb hebt.'],
  bewusstsein: ['Ja, {er} ist wach und redet mit mir.', 'Ja, {er} macht die Augen auf, wenn ich {ihn} anspreche.'],
  vorerkrankung: [
    '{Er} hat Bluthochdruck und nimmt Tabletten.',
    'Zucker hat {er}, und was mit dem Herzen.',
    '{Er} nimmt Blutverdünner, Marcumar glaub ich.',
    'Nein, eigentlich ist {er} gesund.',
    'COPD, {er} hat ein Sauerstoffgerät daheim.',
  ],
};

const BYSTANDER: Partial<Record<QuestionId, string[]>> = {
  alter: ['Keine Ahnung, so um die {alterRund}.', 'Schwer zu sagen... vielleicht {alterRund}?'],
  atmung: ['Ich glaub schon, ja.', 'Ja, {er} atmet.'],
  bewusstsein: ['{Er} reagiert, wenn man {ihn} anspricht.', 'Ja, {er} hat die Augen offen.'],
  vorerkrankung: ['Keine Ahnung, ich kenn {ihn} nicht.', 'Das weiß ich nicht, ich bin nur vorbeigekommen.'],
  wer: ['{name}, ich bin nur zufällig vorbeigekommen.', 'Mein Name ist {name}.'],
};

const STAFF: Partial<Record<QuestionId, string[]>> = {
  alter: ['Herr {nachnameP} ist {alter}.', '{alter} Jahre, Moment, ich schau in die Akte... ja, {alter}.'],
  vorerkrankung: ['Er hat Herzinsuffizienz, Diabetes und eine Demenz. Die Medikamentenliste geben wir mit.'],
  atmung: ['Er atmet etwas schnell, Sättigung 91 Prozent.'],
  bewusstsein: ['Er ist wach, aber wie immer etwas verwirrt.'],
  zugang: ['Haupteingang, dann zweiter Stock, Station B. Ich warte am Eingang.'],
  wer: ['Schwester {vorname} vom {objekt}.', 'Pfleger {vorname}, Station B.'],
};

const POLICE: Partial<Record<QuestionId, string[]>> = {
  alter: ['Laut Ausweis {alter} Jahre.', 'Geschätzt {alterRund}, einen Ausweis hat {er} nicht dabei.'],
  atmung: ['Ja, {er} atmet.', 'Atmung ist da, ja.'],
  bewusstsein: ['{Er} ist ansprechbar.', 'Ja, {er} reagiert auf Ansprache.'],
  vorerkrankung: ['Ist uns nicht bekannt.', 'Dazu können wir nichts sagen.'],
  wer: ['Polizeiobermeister {nachname}, Streife {streife}.', 'Polizeihauptmeisterin {nachname}, Streife {streife}.'],
  zugang: ['Unser Streifenwagen steht mit Blaulicht vor Ort, Sie sehen uns.', 'Wir weisen ein, ein Kollege steht an der Straße.'],
  gefahr: ['Nein, die Lage ist sicher, wir bleiben vor Ort.'],
  seitwann: ['Wir sind seit ein paar Minuten vor Ort.', 'Wir sind seit etwa {min} Minuten da.'],
  rueckruf: ['Über unsere Einsatzzentrale oder direkt unter {phone}.', 'Über die Einsatzzentrale, die erreicht uns jederzeit über Funk.'],
  ortbestaetigen: ['Korrekt.', 'Ja, richtig.', 'Ja, das passt.'],
  beruhigen: ['Danke, wir haben das im Griff.', 'Alles gut, wir warten auf den RTW.'],
  tcpr: ['Momentan nicht nötig, {er} atmet. Wir melden uns, wenn sich was ändert.'],
  verabschieden: ['Verstanden, danke. Wir warten auf den RTW.', 'Alles klar, wir weisen ein. Servus.'],
};

const NO_PATIENT: Partial<Record<QuestionId, string[]>> = {
  alter: ['Es ist doch niemand verletzt.', 'Wieso? Es geht doch um keinen Menschen.'],
  atmung: ['Verletzt ist niemand, zum Glück.'],
  bewusstsein: ['Es ist niemand verletzt.'],
  vorerkrankung: ['Es ist doch niemand verletzt.'],
};

const BY_PLACE: Partial<Record<LocationKind, string[]>> = {
  wohnung: ['{floor}, bei {nachname} klingeln.', 'Im {floor}. Ich mach unten die Haustür auf.', '{floor}, die Wohnungstür ist offen.'],
  strasse: ['Wir sind direkt am Gehweg, Sie sehen uns.', 'Ich stell mich an die Straße und winke.'],
  ausserorts: ['Ich bleib an der Straße stehen und mach das Warnblinklicht an.', 'Ich steh am Straßenrand, Sie sehen das Auto.'],
  autobahn: ['Ich stehe hinter der Leitplanke, das Warndreieck ist aufgestellt.'],
  objekt: ['Am Haupteingang, da wartet jemand von uns.'],
};

/** Standardantworten, wenn die Vorlage nichts Eigenes vorsieht */
export function fallbackAnswers(q: QuestionId, tpl: IncidentTemplate, role: CallerRole): string[] {
  const hasPatient = !!tpl.patients?.length || tpl.stichwort.startsWith('RD');
  if (!hasPatient && NO_PATIENT[q]) return NO_PATIENT[q]!;
  const byRole = { selbst: SELF, angehoerig: RELATIVE, passant: BYSTANDER, personal: STAFF, polizei: POLICE }[role];
  if (byRole[q]) return byRole[q]!;
  if (q === 'zugang') return BY_PLACE[tpl.where] ?? ['Sie sehen uns, wir warten draußen.'];
  if (q === 'seitwann') {
    if (tpl.stichwort.startsWith('B')) return ['Hab es gerade eben gesehen.', 'Vielleicht seit fünf Minuten, ich weiß nicht genau.'];
    if (tpl.stichwort.startsWith('THL')) return ['Gerade eben passiert.', 'Vor ein paar Minuten.'];
    return ['Seit ungefähr {min} Minuten.', 'Das ging vor vielleicht {min} Minuten los.'];
  }
  if (q === 'rueckruf') return ['Ja, unter {phone}.', 'Das ist meine Nummer, {phone}.', 'Hier unter dieser Nummer, {phone}.'];
  if (q === 'ortbestaetigen') return ['Ja, genau.', 'Ja, richtig. Bitte beeilen Sie sich!', 'Ja, stimmt.'];
  if (q === 'atmung' || q === 'bewusstsein') return RELATIVE[q]!;
  return DEFAULT_ANSWERS[q];
}

export const DEFAULT_ANSWERS: Record<QuestionId, string[]> = {
  wo: ['{wo}'],
  was: ['Das hab ich doch schon gesagt!'],
  wer: ['Mein Name ist {name}.', '{name}. Ich bin unter dieser Nummer erreichbar.'],
  wieviele: ['Ich glaub, nur eine Person.'],
  zustand: ['Das weiß ich nicht genau.'],
  gefahr: ['Nein, ich glaube nicht.', 'Nein, nichts Besonderes.'],
  tcpr: ['Was? Wieso denn? Das ist doch nicht nötig!'],
  beruhigen: ['Okay... okay. Ich versuch es.', 'Ja... danke. Bitte beeilen Sie sich.'],
  alter: ['Ich weiß es nicht genau.'],
  atmung: ['Ich glaube schon.'],
  bewusstsein: ['Ja.'],
  seitwann: ['Gerade eben.'],
  vorerkrankung: ['Keine Ahnung.'],
  zugang: ['Sie sehen uns, wir warten draußen.'],
  rueckruf: ['Unter dieser Nummer, {phone}.'],
  ortbestaetigen: ['Ja, genau.'],
  verabschieden: ['Okay, danke! Bis gleich.', 'Ja, danke. Ich warte draußen.', 'Danke, bitte beeilen Sie sich!', 'Okay. Vielen Dank!'],
};

/** Rückbestätigung, bevor der Anrufer überhaupt einen Ort genannt hat */
export const ADDRESS_NOT_YET_SAID = [
  'Welche Adresse? Ich hab doch noch gar nichts gesagt! {wo}',
  'Nein, Moment: {wo}',
  'Ich hab Ihnen noch keine Adresse gesagt. {wo}',
];

export const NOT_UNDERSTOOD = ['Wie bitte? Ich versteh Sie nicht.', 'Was meinen Sie?', 'Das weiß ich nicht.', 'Bitte, schicken Sie einfach jemanden!', 'Hä? Nochmal bitte.'];
export const YES_NO = ['Ja, schon.', 'Nein, ich glaube nicht.', 'Das kann ich nicht sagen.', 'Ich glaub nicht, nein.'];
export const FLOORS = ['Erdgeschoss', 'erster Stock', 'zweiter Stock', 'dritter Stock', 'Dachgeschoss', 'erster Stock links', 'zweiter Stock rechts'];
