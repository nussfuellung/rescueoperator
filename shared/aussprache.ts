// Aufbereitung von Text für die Sprachausgabe. sprechText gilt für alle Stimmen: Abkürzungen, Einheiten,
// Uhrzeiten und Codes so ausschreiben, wie man sie am Funk spricht. piperText gilt nur für Piper: Piper
// liest über espeak-ng, das zusammengesetzte Wörter oft nicht trennt ("einsatzbereit" mit langem e,
// "Kraftstoff" mit s-t statt scht) und manche Wörter falsch betont. Ein Bindestrich an der Wortfuge
// oder eine Lautschrift-Schreibung hilft dort.

const L = 'A-Za-zÄÖÜäöüß';
/** Ganzes Wort: kein Buchstabe oder Ziffer davor und dahinter */
const wort = (w: string, flags = 'g') => new RegExp(`(?<![${L}0-9])(?:${w})(?![${L}0-9])`, flags);

const EINER = ['', 'ein', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun'];
const ZEHNER = ['', 'zehn', 'zwanzig', 'dreißig', 'vierzig', 'fünfzig', 'sechzig', 'siebzig', 'achtzig', 'neunzig'];
const TEENS: Record<number, string> = { 10: 'zehn', 11: 'elf', 12: 'zwölf', 16: 'sechzehn', 17: 'siebzehn' };

/** Ordnungszahl ohne Endung: 1 -> "erst", 3 -> "dritt", 38 -> "achtunddreißigst" (bis 99) */
export function ordinalStamm(n: number): string | null {
  if (!Number.isInteger(n) || n < 1 || n > 99) return null;
  if (n === 1) return 'erst';
  if (n === 3) return 'dritt';
  if (n === 7) return 'siebt';
  if (n === 8) return 'acht';
  if (n < 10) return `${EINER[n]}t`;
  if (n < 20) return `${TEENS[n] ?? `${EINER[n - 10]}zehn`}t`;
  const e = n % 10;
  return `${e ? `${EINER[e]}und` : ''}${ZEHNER[Math.floor(n / 10)]}st`;
}

/** Endung der Ordnungszahl nach dem Wort davor: "im zweiten", "zwischen erstem", sonst "drittes" */
function ordinal(n: number, davor: string, weiblich = false): string | null {
  const s = ordinalStamm(n);
  if (!s) return null;
  const d = davor.toLowerCase();
  if (/^(?:im|vom|zum|beim|am|der|den|dem|ins|in|aus|ab|seit)$/.test(d)) return `${s}en`;
  if (/^(?:zwischen|mit|nach|von|zu|bei)$/.test(d)) return weiblich ? `${s}er` : `${s}em`;
  return weiblich ? `${s}e` : `${s}es`;
}

/** Abkürzungen mit Punkt */
const PUNKT: [RegExp, string][] = [
  [/(?<![A-Za-zÄÖÜäöüß])z\.\s?B\./g, 'zum Beispiel'],
  [/(?<![A-Za-zÄÖÜäöüß])u\.\s?a\./g, 'unter anderem'],
  [/(?<![A-Za-zÄÖÜäöüß])V\.\s?a\./g, 'Verdacht auf'],
  [/(?<![A-Za-zÄÖÜäöüß])v\.\s?a\./g, 'vor allem'],
  [/(?<![A-Za-zÄÖÜäöüß])ca\./g, 'circa'],
  [/(?<![A-Za-zÄÖÜäöüß])bzw\./g, 'beziehungsweise'],
  [/(?<![A-Za-zÄÖÜäöüß])ggf\./g, 'gegebenenfalls'],
  [/(?<![A-Za-zÄÖÜäöüß])evtl\./g, 'eventuell'],
  [/(?<![A-Za-zÄÖÜäöüß])inkl\./g, 'inklusive'],
  [/(?<![A-Za-zÄÖÜäöüß])Nr\.(?=\s?\d)/g, 'Nummer'],
  [/(?<![A-Za-zÄÖÜäöüß])Pat\./g, 'Patient'],
  [/(?<![A-Za-zÄÖÜäöüß])St\.\s?(?=[A-ZÄÖÜ])/g, 'Sankt '],
  [/([a-zäöüß])str\./g, '$1straße'],
  [/(?<![A-Za-zÄÖÜäöüß])Str\./g, 'Straße'],
];

/** Einheiten nach einer Zahl */
const EINHEITEN: [string, string][] = [
  ['km/h', 'Kilometer pro Stunde'],
  ['mg/dl', 'Milligramm pro Deziliter'],
  ['m²', 'Quadratmeter'],
  ['qm', 'Quadratmeter'],
  ['m³', 'Kubikmeter'],
  ['km', 'Kilometer'],
  ['cm', 'Zentimeter'],
  ['mm', 'Millimeter'],
  ['m', 'Meter'],
  ['kg', 'Kilo'],
  ['mg', 'Milligramm'],
  ['ml', 'Milliliter'],
  ['l', 'Liter'],
  ['t', 'Tonnen'],
  ['ha', 'Hektar'],
  ['°C', 'Grad'],
  ['°', 'Grad'],
];

/** Abkürzungen, die man Buchstabe für Buchstabe spricht, espeak-ng aber als Wort liest */
const BUCHSTABIEREN = ['ILS', 'ELW', 'NEF', 'SEG', 'OVD', 'EKG', 'COPD', 'SAB', 'OSG', 'ASB', 'JUH', 'CO', 'PA', 'ÖEL', 'UG', 'VU', 'OP', 'EL'];

/** Abkürzungen, die ausgeschrieben werden */
const AUSSCHREIBEN: [string, string][] = [
  ['KdoW', 'Kommandowagen'],
  ['KOF', 'Körperoberfläche'],
  ['NA', 'Notarzt'],
  ['SanEL', 'San-E-L'],
  ['SoSi', 'Sondersignal'],
];

const buchstabiert = (w: string) => [...w].join('-');

/** Text für jede Sprachausgabe aufbereiten */
export function sprechText(text: string): string {
  let t = text;
  for (const [re, ers] of PUNKT) t = t.replace(re, ers);

  // Uhrzeit: "14:30 Uhr" -> "14 Uhr 30", "14:00" -> "14 Uhr"
  t = t.replace(/(?<![\d:])([01]?\d|2[0-3]):([0-5]\d)(?![\d:])(\s?Uhr(?![A-Za-zäöü]))?/g, (_, h: string, m: string) => {
    const min = Number(m);
    return `${Number(h)} Uhr${min ? ` ${min}` : ''}`;
  });

  // Patientenzuweisungscode Ziffer für Ziffer, gegliedert wie am Funk: "PZC 345 83 3"
  t = t.replace(/\bPZC:?\s?(\d{3})\s?(\d{2})\s?(\d)\b/g, (_, a: string, b: string, c: string) => `PZC ${[...a].join(' ')}, ${[...b].join(' ')}, ${c}`);

  // "1x RTW" -> "1 RTW"
  t = t.replace(/(?<![\w])(\d+)\s?x\s(?=\S)/g, '$1 ');

  // Geschosse und Schwangerschaftswoche: "im 2. OG" -> "im zweiten Obergeschoss"
  t = t.replace(/(?:([A-Za-zÄÖÜäöüß]+)\s)?(\d{1,2})\.\s?(?:und\s(\d{1,2})\.\s?)?(OG|EG|UG|SSW|Grades)(?![A-Za-zÄÖÜäöü])/g, (all, davor: string | undefined, n: string, n2: string | undefined, was: string) => {
    const name = { OG: 'Obergeschoss', EG: 'Erdgeschoss', UG: 'Untergeschoss', SSW: 'Schwangerschaftswoche', Grades: 'Grades' }[was]!;
    // "2. Grades" (Genitiv) wie "im zweiten"
    const vor = was === 'Grades' ? 'im' : (davor ?? '');
    const o = ordinal(Number(n), vor, was === 'SSW');
    const o2 = n2 ? ordinal(Number(n2), vor, was === 'SSW') : '';
    if (!o || o2 === null) return all;
    return `${davor ? `${davor} ` : ''}${o}${o2 ? ` und ${o2}` : ''} ${name}`;
  });
  t = t.replace(wort('OG'), 'Obergeschoss').replace(wort('EG'), 'Erdgeschoss').replace(wort('SSW'), 'Schwangerschaftswoche');

  // Einheiten nur direkt hinter einer Zahl
  for (const [e, ers] of EINHEITEN) {
    const esc = e.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
    t = t.replace(new RegExp(`(\\d)\\s?${esc}(?![${L}0-9²³])`, 'g'), `$1 ${ers}`);
  }

  // Römische Zahlen (Grad III, Digitus II)
  t = t.replace(wort('III'), '3').replace(wort('II'), '2').replace(wort('IV'), '4');

  for (const [k, ers] of AUSSCHREIBEN) t = t.replace(wort(k), ers);
  t = t.replace(wort(BUCHSTABIEREN.join('|')), (w) => buchstabiert(w));
  return t;
}

/**
 * Wortfugen, an denen espeak-ng ohne Bindestrich falsch liest. Jeder Eintrag ist das hintere Wort
 * einer Zusammensetzung; mit mindestens drei Buchstaben davor wird es abgetrennt. Längere zuerst,
 * damit "Krampfanfall" an "anfall" und nicht an "fall" geteilt wird.
 */
const FUGEN = [
  'anmeldung', 'stillstand', 'versorgung', 'standort', 'änderung', 'zustand', 'meldung', 'berater', 'gerüst',
  'geruch', 'gerecht', 'gerannt', 'gerutscht', 'verein', 'bereit', 'ablage', 'anfall', 'unfall', 'kasten',
  'stelle', 'stoff', 'stich', 'hilfe', 'spur', 'arzt', 'bild', 'heim', 'fall',
];
/** Wortanfänge, die espeak-ng schon richtig liest oder die durch die Trennung falsch würden */
const NICHT_TRENNEN = ['notarzt', 'verunfall', 'erstversorgung'];
const FUGE = new RegExp(`(?<=[${L}]{3})(?<![Gg]e(?=fall))(${FUGEN.join('|')})(?=[a-zäöüß]*(?![${L}]))`, 'gi');

/** Ganze Wörter oder Wortanfänge, die espeak-ng falsch betont oder liest, in Lautschreibung */
const PIPER_WOERTER: [RegExp, string][] = [
  [wort('Patientin(nen)?'), 'Patsi-entin$1'],
  [wort('patientin(nen)?'), 'patsi-entin$1'],
  [wort('Malteser'), 'Malltéeser'],
  [wort('Samariter'), 'Sama-riter'],
  [wort('Hemiparese'), 'Hemipa-rese'],
  [wort('Stroke Unit'), 'Strook Junit'],
  [/(?<![A-Za-zÄÖÜäöüß])([Aa])llgemein/g, '$1ll-gemein'],
  [/(?<![A-Za-zÄÖÜäöüß])([Aa])tem(?=[a-zäöüß]{3})/g, '$1tem-'],
  [/(?<![A-Za-zÄÖÜäöüß])([Aa]u(?:ß|ss)er|[Ii]nner)orts/g, '$1-orts'],
  // -erei: "Schlägerei" mit Schwa statt langem e
  [/(?<=[a-zäöüß]{3})erei(?=(?:en)?(?![A-Za-zÄÖÜäöüß]))/g, 'e-rei'],
];

/** Text für Piper aufbereiten (zusätzlich zu sprechText, das schon in der Oberfläche läuft) */
export function piperText(text: string): string {
  let t = text;
  for (const [re, ers] of PIPER_WOERTER) t = t.replace(re, ers);
  return t.replace(FUGE, (teil: string, _g: string, off: number, all: string) => {
    if (all[off - 1] === '-') return teil;
    const start = all.slice(0, off).search(new RegExp(`[${L}]+$`));
    const w = all.slice(start).toLowerCase();
    return NICHT_TRENNEN.some((n) => w.startsWith(n)) ? teil : `-${teil}`;
  });
}

// ---------- Gefühlslage der Anrufer für thorsten_emotional ----------

/** Gefühlslage je Anrufer: wer panisch anfängt, behält bis zum Gesprächsende die emotionale Stimme */
const stilJeSprecher = new Map<string, string>();
const PANISCH = /schreit|weint|schluchzt|stockend|hektisch|aufgelöst|panisch/i;
const BERUHIGT = /ruhiger|tief durch/i;
/** Regieanweisung -> Stil von thorsten_emotional */
const STILE: [RegExp, string][] = [
  [/flüstert/i, 'whisper'],
  [/lallt|betrunken/i, 'drunk'],
  [/aufgebracht|wütend|brüllt|schimpft/i, 'angry'],
  [PANISCH, 'surprised'],
];
const stilAus = (regie: string) => STILE.find(([re]) => re.test(regie))?.[1];

/** Sprechstil aus den Regieanweisungen eines Anrufersatzes ("(schreit) …", "(atmet tief durch) …") */
export function stilFuer(speaker: string, roh: string): string | undefined {
  const regie = (roh.match(/\([^)]*\)/g) ?? []).join(' ');
  const bisher = stilJeSprecher.get(speaker);
  // Nur wer schon im ersten Satz panisch ist, wechselt die Stimme; später bliebe sie sonst nicht dieselbe
  if (bisher === undefined) {
    stilJeSprecher.set(speaker, stilAus(regie) ?? '');
    return stilJeSprecher.get(speaker) || undefined;
  }
  if (!bisher) return undefined;
  if (BERUHIGT.test(regie)) stilJeSprecher.set(speaker, 'neutral');
  else {
    const neu = stilAus(regie);
    if (neu) stilJeSprecher.set(speaker, neu);
  }
  return stilJeSprecher.get(speaker);
}
