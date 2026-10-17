// Nachbearbeitung der Spracherkennung: Zahlwörter, Funkrufnamen und Orts-/Straßennamen der Karte.

const UNITS: Record<string, number> = {
  null: 0, ein: 1, eins: 1, eine: 1, einen: 1, zwei: 2, zwo: 2, drei: 3, vier: 4, fünf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9,
};
const TEENS: Record<string, number> = {
  zehn: 10, elf: 11, zwölf: 12, dreizehn: 13, vierzehn: 14, fünfzehn: 15, sechzehn: 16, siebzehn: 17, achtzehn: 18, neunzehn: 19,
};
const TENS: Record<string, number> = { zwanzig: 20, dreißig: 30, vierzig: 40, fünfzig: 50, sechzig: 60, siebzig: 70, achtzig: 80, neunzig: 90 };

/** Deutsches Zahlwort (auch zusammengesetzt wie "zweiundvierzig" oder "hundertzwölf") in eine Zahl */
export function parseNumberWord(w: string): number | null {
  w = w.toLowerCase().replace(/ss/g, 'ß');
  if (w === 'ein' || w === 'eine' || w === 'einen') return null; // als Artikel zu häufig
  if (w in UNITS) return UNITS[w];
  if (w in TEENS) return TEENS[w];
  if (w in TENS) return TENS[w];
  let rest = w;
  let total = 0;
  const h = rest.match(/^(ein|zwei|drei|vier|fünf|sechs|sieben|acht|neun)?hundert/);
  if (h) {
    total += (h[1] ? UNITS[h[1]] : 1) * 100;
    rest = rest.slice(h[0].length).replace(/^und/, '');
    if (!rest) return total;
  }
  if (rest in TEENS) return total + TEENS[rest];
  if (rest in TENS) return total + TENS[rest];
  if (rest in UNITS && total) return total + UNITS[rest];
  const m = rest.match(/^(ein|zwei|drei|vier|fünf|sechs|sieben|acht|neun)und(zwanzig|dreißig|vierzig|fünfzig|sechzig|siebzig|achtzig|neunzig)$/);
  if (m) return total + UNITS[m[1]] + TENS[m[2]];
  return null;
}

/** Zahlwörter durch Ziffern ersetzen, "vierzig strich eins" zu "40/1" */
export function numbersToDigits(text: string, funkNrs: number[] = []): string {
  const words = text.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const n = parseNumberWord(words[i]);
    if (n === null) {
      out.push(words[i]);
      continue;
    }
    // Funkrufname: "vierzig strich eins", "vierzig schrägstrich eins" oder "vierzig eins"
    const sep = /^(strich|schrägstrich|schräg)$/i.test(words[i + 1] ?? '');
    const next = parseNumberWord(words[i + (sep ? 2 : 1)] ?? '');
    if (next !== null && next < 10 && n >= 10 && n < 100 && (sep || funkNrs.includes(n))) {
      out.push(`${n}/${next}`);
      i += sep ? 2 : 1;
      continue;
    }
    out.push(String(n));
  }
  return out.join(' ');
}

/** Kölner Phonetik: lautähnliche deutsche Wörter bekommen den gleichen Code */
export function koelnerPhonetik(word: string): string {
  const w = word
    .toLowerCase()
    .replace(/ä/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u')
    .replace(/ß/g, 's')
    .replace(/[^a-z]/g, '');
  let codes = '';
  for (let i = 0; i < w.length; i++) {
    const c = w[i];
    // Platzhalter statt Leerstring: ''.includes('') wäre immer wahr
    const prev = w[i - 1] ?? '#';
    const next = w[i + 1] ?? '#';
    let d = '';
    if ('aeijouy'.includes(c)) d = '0';
    else if (c === 'h') d = '';
    else if (c === 'b') d = '1';
    else if (c === 'p') d = next === 'h' ? '3' : '1';
    else if (c === 'd' || c === 't') d = 'csz'.includes(next) ? '8' : '2';
    else if ('fvw'.includes(c)) d = '3';
    else if ('gkq'.includes(c)) d = '4';
    else if (c === 'c') {
      if (i === 0) d = 'ahkloqrux'.includes(next) ? '4' : '8';
      else d = 'sz'.includes(prev) ? '8' : 'ahkoqux'.includes(next) ? '4' : '8';
    } else if (c === 'x') d = 'ckq'.includes(prev) ? '8' : '48';
    else if (c === 'l') d = '5';
    else if (c === 'm' || c === 'n') d = '6';
    else if (c === 'r') d = '7';
    else if (c === 's' || c === 'z') d = '8';
    codes += d;
  }
  // Doppelte zusammenfassen, Nullen außer am Anfang entfernen
  let out = '';
  for (const ch of codes) if (ch !== out[out.length - 1]) out += ch;
  return out[0] + out.slice(1).replace(/0/g, '');
}

const STOP = new Set(
  (
    'der die das den dem des ein eine einer einem einen und oder aber in im am an auf aus bei mit nach von vor zu zum zur über unter ' +
    'ist sind war hat haben wird werden kann können soll sollen ich du er sie es wir ihr mein meine ihre ihr sein seine nicht kein keine ' +
    'ja nein bitte danke hallo wo was wer wie wann warum welche welcher welches noch schon auch nur sehr gut jetzt hier dort da ' +
    'person patient patientin mann frau kind leute straße weg platz gasse hausnummer nummer stock etage notfall unfall brand feuer ' +
    'atmet atmung wach alt jahre seit minuten kommen kommt fahren fahrzeug leitstelle status einsatz verstanden ende'
  ).split(' '),
);

export interface Vocab {
  /** zusammengeschriebene, normalisierte Form -> Originalschreibweise */
  exact: Map<string, string>;
  /** Kölner Phonetik -> Originalschreibweise (nur eindeutige, ausreichend lange Namen) */
  phonetic: Map<string, string>;
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]/g, '');

/** Wortschatz aus Ortsnamen, Straßen und Funkrufnamen der Karte */
export function buildVocab(names: string[], phoneticNames: string[] = names): Vocab {
  const exact = new Map<string, string>();
  for (const n of names) {
    const k = norm(n);
    if (k.length >= 4 && !exact.has(k)) exact.set(k, n);
  }
  // Bei gleichem Code gewinnt der zuerst genannte (wichtigere) Name
  const phonetic = new Map<string, string>();
  for (const n of phoneticNames) {
    if (n.length < 5 || /\s/.test(n)) continue;
    const c = koelnerPhonetik(n);
    if (c.length >= 3 && !phonetic.has(c)) phonetic.set(c, n);
  }
  return { exact, phonetic };
}

/** Getrennt erkannte oder falsch geschriebene Namen auf die Schreibweise der Karte bringen */
export function fixNames(text: string, vocab: Vocab): string {
  const words = text.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < words.length; ) {
    let done = false;
    // Längste Wortfolge zuerst: "julius promenade" -> "Juliuspromenade"
    for (let n = Math.min(3, words.length - i); n >= 1 && !done; n--) {
      const seq = words.slice(i, i + n);
      if (seq.every((w) => STOP.has(w.toLowerCase()) || /^\d/.test(w))) continue;
      const joined = norm(seq.join(''));
      const hit = vocab.exact.get(joined);
      if (hit && (n > 1 || hit !== seq[0])) {
        out.push(hit);
        i += n;
        done = true;
        break;
      }
      if (joined.length >= 6 && !seq.some((w) => STOP.has(w.toLowerCase()))) {
        const ph = vocab.phonetic.get(koelnerPhonetik(joined));
        // Gleich klingend reicht nicht: auch die Schreibung muss nah dran sein ("kizingen" ja, "schmerzen" nicht)
        if (ph && norm(ph) !== joined && levenshtein(norm(ph), joined) <= Math.max(1, Math.floor(joined.length * 0.25))) {
          out.push(ph);
          i += n;
          done = true;
        }
      }
    }
    if (!done) out.push(words[i++]);
  }
  return out.join(' ');
}

function levenshtein(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

/** Komplette Nachbearbeitung eines erkannten Satzes */
export function postProcess(text: string, vocab?: Vocab, funkNrs: number[] = []): string {
  let t = numbersToDigits(text.replace(/\[unk\]/g, ' ').replace(/\s+/g, ' ').trim(), funkNrs);
  if (vocab) t = fixNames(t, vocab);
  return t;
}
