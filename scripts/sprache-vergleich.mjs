// Vergleicht die Spracherkennung (Whisper-Modelle mit und ohne Karten-Vokabular, Vosk) an typischen Funk- und Notrufsätzen.
// Die Sätze spricht Piper. Läuft im Workflow „Whisper“ und schreibt eine Tabelle in die Zusammenfassung des Laufs.
// Aufruf: node --experimental-strip-types scripts/sprache-vergleich.mjs <whisper-server> <modell-ordner> <piper> <stimme.onnx> [vosk-modellordner]
import { spawn, execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { postProcess, buildVocab } from '../shared/speechfix.ts';
import { whisperPrompt, whisperText, WHISPER_MODELLE } from '../shared/whisper.ts';

const [exe, modelDir, piper, stimme, voskModel] = process.argv.slice(2);

const SAETZE = [
  'Leitstelle Würzburg, Rotkreuz Würzburg 71/1, Status 4 am Einsatzort.',
  'Florian Ochsenfurt 40/1, wir sind an der Einsatzstelle in der Hauptstraße in Randersacker.',
  'Notarzt abkömmlich, Patient wird ins Klinikum Main-Spessart nach Lohr gebracht.',
  'Wo genau ist der Notfallort? Nennen Sie mir bitte die Adresse.',
  'Ist der Patient ansprechbar und atmet er normal?',
  'Rotkreuz Kitzingen 83/2, Einsatz in Marktbreit, Verkehrsunfall mit eingeklemmter Person.',
  'Bleiben Sie bei dem Patienten, ich schicke Ihnen jemand.',
  'Christoph 18, Landung in Veitshöchheim am Sportplatz.',
];
const ORTE = ['Würzburg', 'Kitzingen', 'Ochsenfurt', 'Lohr am Main', 'Marktheidenfeld', 'Karlstadt', 'Randersacker', 'Marktbreit', 'Veitshöchheim', 'Höchberg', 'Gerbrunn', 'Dettelbach'];
const vocab = buildVocab([...ORTE, 'Hauptstraße', 'Klinikum Main-Spessart', 'Sportplatz'], ORTE);
const FUNK = [71, 40, 83, 18];
const prompt = whisperPrompt('Integrierten Leitstelle Würzburg', ['Rotkreuz Würzburg 71/1', 'Florian Ochsenfurt 40/1', 'Christoph 18'], ORTE);

const norm = (s) =>
  postProcess(s, vocab, FUNK)
    .toLowerCase()
    .replace(/[/-]/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .split(/\s+/)
    .filter(Boolean);

/** Wortfehlerrate: Levenshtein-Abstand auf Wortebene */
function wer(ref, hyp) {
  const r = norm(ref);
  const h = norm(hyp);
  const d = Array.from({ length: r.length + 1 }, (_, i) => [i, ...Array(h.length).fill(0)]);
  for (let j = 1; j <= h.length; j++) d[0][j] = j;
  for (let i = 1; i <= r.length; i++)
    for (let j = 1; j <= h.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (r[i - 1] === h[j - 1] ? 0 : 1));
  return d[r.length][h.length] / r.length;
}

mkdirSync('vergleich', { recursive: true });
const wavs = SAETZE.map((s, i) => {
  const f = join('vergleich', `satz${i}.wav`);
  execFileSync(piper, ['--model', stimme, '--output_file', f], { input: s.replace(/(\d+)\/(\d+)/g, '$1 $2'), stdio: ['pipe', 'ignore', 'ignore'] });
  return f;
});

async function whisperLauf(datei, mitPrompt) {
  const port = 8090;
  const proc = spawn(exe, ['-m', datei, '-l', 'de', '-t', '4', '--host', '127.0.0.1', '--port', String(port)], { stdio: 'ignore' });
  try {
    for (let i = 0; i < 300; i++) {
      try {
        if ((await fetch(`http://127.0.0.1:${port}/`)).ok) break;
      } catch {}
      await new Promise((r) => setTimeout(r, 200));
    }
    const ergebnisse = [];
    for (const [i, f] of wavs.entries()) {
      const form = new FormData();
      form.append('file', new Blob([readFileSync(f)], { type: 'audio/wav' }), 'a.wav');
      form.append('response_format', 'json');
      form.append('temperature', '0');
      form.append('language', 'de');
      if (mitPrompt) form.append('prompt', prompt);
      const t0 = performance.now();
      const res = await fetch(`http://127.0.0.1:${port}/inference`, { method: 'POST', body: form });
      const { text = '' } = await res.json();
      const ms = performance.now() - t0;
      ergebnisse.push({ text: whisperText(text), ms, wer: wer(SAETZE[i], whisperText(text)) });
    }
    return ergebnisse;
  } finally {
    proc.kill();
    await new Promise((r) => setTimeout(r, 500));
  }
}

const zeilen = [];
const beispiele = [];
for (const m of Object.keys(WHISPER_MODELLE)) {
  const datei = join(modelDir, WHISPER_MODELLE[m].datei);
  if (!existsSync(datei)) continue;
  for (const mitPrompt of [false, true]) {
    const e = await whisperLauf(datei, mitPrompt);
    const name = `Whisper ${m}${mitPrompt ? ' + Karten-Vokabular' : ''}`;
    zeilen.push([name, e]);
    if (mitPrompt) beispiele.push([name, e]);
  }
}
if (voskModel && existsSync(voskModel)) {
  const v = JSON.parse(execFileSync('python3', ['scripts/vosk-vergleich.py', voskModel, ...wavs], { encoding: 'utf8' }));
  const e = v.map((x, i) => ({ text: x.text, ms: x.ms, wer: wer(SAETZE[i], x.text) }));
  zeilen.push(['Vosk small-de (bisher)', e]);
  beispiele.push(['Vosk small-de (bisher)', e]);
}

const avg = (e, k) => e.reduce((a, x) => a + x[k], 0) / e.length;
let md = '## Spracherkennung im Vergleich\n\nSätze von Piper (Thorsten) gesprochen, Rechner: GitHub-Runner mit 4 Kernen.\n\n';
md += 'Vosk erkennt schon während des Sprechens, seine Zeit fällt im Spiel also kaum auf. Whisper rechnet erst nach dem Loslassen der Sprechtaste.\n\n';
md += '| Erkennung | Wortfehler | Zeit je Satz |\n|---|---|---|\n';
for (const [n, e] of zeilen) md += `| ${n} | ${Math.round(avg(e, 'wer') * 100)} % | ${(avg(e, 'ms') / 1000).toFixed(2)} s |\n`;
md += '\n### Erkannte Sätze\n';
for (const [i, s] of SAETZE.entries()) {
  md += `\n**${s}**\n`;
  for (const [n, e] of beispiele) md += `- ${n}: ${postProcess(e[i].text, vocab, FUNK)}\n`;
}
console.log(md);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
