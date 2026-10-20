// Übernimmt die lstsim.de-Liste (Rettungswachen, NEF-Standorte, HvO, BF) in eine Leitstelle.
// Aufruf: npx tsx scripts/karten/mklstsim.ts assets/ils-wuerzburg.json.gz scripts/karten/wue-lstsim-rd.txt
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { applyLstsim } from '../../shared/lstsim';
import { validateScenario } from '../../shared/mapgen';

const [file, list] = process.argv.slice(2);
const scn = JSON.parse(gunzipSync(readFileSync(file)).toString('utf8'));
const r = applyLstsim(scn, readFileSync(list, 'utf8'));
console.log(r.notes.join('\n'));
const problems = validateScenario(scn);
if (problems.length) console.log('Prüfung:', problems.slice(0, 10));
writeFileSync(file, gzipSync(JSON.stringify(scn), { level: 9 }));
