// Aufbereitung von Funksprüchen der Leitstelle an ein Fahrzeug: Rufnamen und Anrufformel abtrennen,
// Fragen erkennen und genannte Kliniken oder Rufgruppen finden. Funktioniert mit getipptem Text
// und mit der Spracherkennung (klein geschrieben, ohne Satzzeichen).

export interface Funkspruch {
  /** Inhalt ohne Rufnamen, "von Leitstelle …" und Schlussformel, klein geschrieben */
  text: string;
  /** Endet mit "kommen" (Antwort erwartet) */
  kommen: boolean;
  /** Endet mit "Ende" (keine Antwort erwartet) */
  ende: boolean;
  /** Fragezeichen im Original */
  fragezeichen: boolean;
}

const ORGS = 'florian|rotkreuz|rot kreuz|johannes|akkon|malteser|sama|samariter|kater|heros|pelikan|christoph|wasserwacht|bergwacht';

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Kleinschreibung, Satzzeichen weg ("/" in Funkrufnamen bleibt), Leerraum zusammenfassen */
export function funkNorm(s: string): string {
  return s
    .toLowerCase()
    .replace(/(\d)\s*\/\s*(\d)/g, '$1/$2')
    .replace(/[.,!?;:"'()„“”–—-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Zerlegt einen Funkspruch an ein Fahrzeug */
export function zerlegeFunkspruch(raw: string, callsign: string, ilsName = ''): Funkspruch {
  const fragezeichen = /\?/.test(raw);
  let t = ` ${funkNorm(raw)} `;

  // Rufname des Fahrzeugs: "Rotkreuz Arnstein 71/1", "71 1", "71 strich 1", "711" – Organisation und Ort davor fallen mit weg
  const m = callsign.match(/(\d+)\/(\d+)\s*$/);
  if (m) {
    const nr = `(?:${m[1]}\\s*(?:/|strich|schrägstrich|schräg)?\\s*${m[2]})`;
    t = t.replace(new RegExp(`(?:\\s(?:${ORGS}))?(?:\\s[^\\s\\d]+){0,3}?\\s${nr}(?=\\s)`, 'g'), (hit) => {
      // Ortsnamen nur mitnehmen, wenn sie zum Rufnamen gehören oder eine Organisation davor steht
      const words = hit.trim().split(' ');
      const own = new Set(funkNorm(callsign).split(' '));
      if (new RegExp(`^(?:${ORGS})$`).test(words[0]) || words.slice(0, -1).every((w) => own.has(w) || /^\d|strich|schräg/.test(w))) return ' ';
      // Fremde Wörter davor stehen lassen, nur die Nummer entfernen
      return ' ' + hit.trim().replace(new RegExp(`${nr}$`), '') + ' ';
    });
  } else {
    // Rufname ohne Nummer (z. B. Hubschrauber "Christoph 18")
    t = t.replace(new RegExp(`\\s${esc(funkNorm(callsign))}(?=\\s)`, 'g'), ' ');
  }
  // Nur die Organisation mit Ort am Anfang ("Rotkreuz Arnstein von Leitstelle")
  const place = funkNorm(callsign).replace(new RegExp(`^(?:${ORGS})\\s+`), '').replace(/\s*\d.*$/, '');
  if (place) t = t.replace(new RegExp(`^\\s(?:(?:${ORGS})\\s)?${esc(place)}(?=\\s)`), ' ');

  // Absender: "von Leitstelle Würzburg", "hier ist die Integrierte Leitstelle", "ILS Würzburg für …"
  const ils = funkNorm(ilsName).replace(/^(?:ils|leitstelle|integrierte leitstelle)\s*/, '');
  const ort = ils ? `(?:\\s${esc(ils)})?` : '';
  t = t.replace(new RegExp(`(?:\\s(?:von|hier|hier ist|für))?(?:\\s(?:der|die))?(?:\\s(?:integrierten?|ils))?\\s(?:leitstelle|ils)${ort}(?:\\s(?:für|an))?(?=\\s)`, 'g'), ' ');
  t = t.replace(/^\s(?:von|hier|für|an)(?=\s)/, ' ');

  // Schlussformel
  let kommen = false;
  let ende = false;
  for (;;) {
    const before = t;
    t = t.replace(/\s(?:kommen|komm)\s*$/, () => ((kommen = true), ' '));
    t = t.replace(/\s(?:ende|over)\s*$/, () => ((ende = true), ' '));
    t = t.replace(/\s(?:bitte|danke)\s*$/, (s) => (kommen || ende ? ' ' : s));
    if (t === before) break;
  }
  return { text: t.replace(/\s+/g, ' ').trim(), kommen, ende, fragezeichen };
}

/** Frage auch ohne Fragezeichen erkennen (Spracherkennung liefert keine Satzzeichen) */
export function istFrage(f: Funkspruch): boolean {
  if (f.fragezeichen) return true;
  return /^(?:und |also |mal |noch mal |frage |kurze frage )?(?:wo|wie|wann|was|wer|welche[nrms]?|wohin|woher|warum|wieso|weshalb|wieviel\w*|habt|haben|hast|seid|sind|bist|ist|könnt|können|kannst|braucht|brauchen|benötigt|benötigen|gibt|gibts|wisst|wissen|wird|werden|wollt|wollen|dürft|fahrt|fahren sie schon|seit wann)\b/.test(
    f.text,
  ) || /\b(?:oder|richtig|korrekt|stimmt das)$/.test(f.text);
}

/** Nur eine Quittung ("verstanden", "danke", "alles klar") ohne neuen Inhalt */
export function istQuittung(text: string): boolean {
  return /^(?:(?:ja|jawohl|ok|okay|gut|super|prima|perfekt|alles klar|klar|verstanden|habe verstanden|hab verstanden|danke|vielen dank|danke schön|dankeschön|danke sehr|in ordnung|quittiert|richtig|korrekt|passt|wunderbar|roger|so weit|soweit|dann|für die (?:info|information|meldung|rückmeldung)|das war'?s|das wäre es|das wars|mehr nicht|nichts weiter)\s*)+$/.test(text);
}

const GENERISCH = new Set(['klinik', 'klinikum', 'kliniken', 'krankenhaus', 'spital', 'haus', 'der', 'die', 'das', 'und', 'am', 'an', 'im', 'in', 'bei', 'st', 'sankt', 'über', 'a', 'außerhalb', 'land', 'main', 'zentrum', 'medizinisches', 'kreisklinik']);
const kurz = (s: string) =>
  s
    .toLowerCase()
    .replace(/ä/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]/g, '');

/** Schlüsselwörter eines Kliniknamens, z. B. "Juliusspital" -> juliusspital, julius */
function klinikWoerter(name: string): string[] {
  const out = new Set<string>();
  for (const w of name.replace(/\(.*?\)/g, ' ').split(/[\s\-/]+/)) {
    const k = kurz(w);
    if (k.length < 3 || GENERISCH.has(w.toLowerCase())) continue;
    out.add(k);
    const stamm = k.replace(/(?:klinikum|kliniken|klinik|krankenhaus|spital)$/, '');
    if (stamm !== k && stamm.length >= 4) out.add(stamm);
  }
  if (/universit/i.test(name)) out.add('uni');
  return [...out];
}

/** Im Funkspruch genannte Klinik; bei Gleichstand mehrerer Kliniken keine */
export function findeKlinik<H extends { id: string; name: string }>(text: string, hospitals: H[]): H | undefined {
  const words = text.split(' ').map(kurz).filter(Boolean);
  const joined = words.join('');
  let best: H | undefined;
  let bestScore = 0;
  let tie = false;
  for (const h of hospitals) {
    let score = 0;
    for (const k of klinikWoerter(h.name)) {
      if (k === 'uni') {
        if (words.some((w) => /^uni(?:klinik|klinikum|versit)?/.test(w))) score += 8;
      } else if (k.length >= 4 ? joined.includes(k) : words.includes(k)) score += k.length;
    }
    if (joined.includes(kurz(h.name.replace(/\(.*?\)/g, '')))) score += 20;
    if (score > bestScore) {
      best = h;
      bestScore = score;
      tie = false;
    } else if (score && score === bestScore) tie = true;
  }
  return tie || bestScore < 4 ? undefined : best;
}

/** Genannte Rufgruppe: "3737 RD_WÜ" passt zu "3737", "37 37" oder "rd wü" */
export function findeRufgruppe<G extends { id: string; name: string }>(text: string, groups: G[]): G | undefined {
  const digits = text.replace(/[^\d\s]/g, ' ').replace(/\s+/g, ' ');
  const joined = kurz(text);
  for (const g of groups) {
    const nr = g.name.match(/^\d{3,5}/)?.[0];
    if (nr && (new RegExp(`(?:^|\\s)${nr}(?:\\s|$)`).test(digits) || new RegExp(`(?:^|\\s)${nr.slice(0, 2)} ${nr.slice(2)}(?:\\s|$)`).test(digits))) return g;
  }
  // Ohne Nummer nur über den vollständigen Namen ("FW KT 1"), der längste Treffer gewinnt
  const hits = groups.filter((g) => {
    const k = kurz(g.name.replace(/^\d+\s*/, ''));
    return k.length >= 3 && joined.includes(k);
  });
  return hits.sort((a, b) => kurz(b.name).length - kurz(a.name).length)[0];
}

const ADRESS_GENERISCH = new Set(['straße', 'strasse', 'str', 'weg', 'platz', 'gasse', 'allee', 'ring', 'höhe', 'bei', 'nach', 'zwischen', 'richtung', 'und', 'der', 'die', 'das', 'am', 'an', 'im', 'in', 'auf', 'ortsteil']);

/**
 * Im Funkspruch genannter Einsatz: über Einsatznummer, Straße oder Ort der Adresse und Stichwort.
 * Bei Gleichstand keiner; ohne jeden Hinweis nur, wenn es genau einen Kandidaten gibt.
 */
export function findeEinsatz<I extends { nr: string; address: string; stichwort: string; label?: string; schlagwort?: string }>(text: string, incidents: I[]): I | undefined {
  const words = text.split(' ').filter(Boolean);
  const joined = words.map(kurz).join('');
  let best: I | undefined;
  let bestScore = 0;
  let tie = false;
  for (const inc of incidents) {
    let score = 0;
    // Einsatznummer "E-000123": "einsatz 123" oder "nummer 123"
    const nr = inc.nr.replace(/\D/g, '').replace(/^0+/, '');
    if (nr && words.includes(nr)) score += 20;
    for (const w of inc.address.split(/[\s,/()-]+/)) {
      const k = kurz(w);
      if (k.length < 4 || ADRESS_GENERISCH.has(w.toLowerCase()) || /^\d/.test(k)) continue;
      // "Hauptstraße" passt auch zu gesprochenem "haupt straße"
      const stamm = k.replace(/(?:strasse|str|weg|platz|gasse|allee|ring)$/, '');
      if (joined.includes(k)) score += k.length;
      else if (stamm.length >= 4 && joined.includes(stamm)) score += stamm.length;
    }
    const sw = funkNorm(inc.stichwort);
    if (sw && new RegExp(`(?:^|\\s)${sw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s*')}(?:\\s|$)`).test(text)) score += 3;
    if (score > bestScore) {
      best = inc;
      bestScore = score;
      tie = false;
    } else if (score && score === bestScore) tie = true;
  }
  if (bestScore === 0) return incidents.length === 1 ? incidents[0] : undefined;
  return tie ? undefined : best;
}
