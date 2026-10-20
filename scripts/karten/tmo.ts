// Rufgruppen der ILS Würzburg nach Melvins Angaben: RD Stadt 3737, RD Land 3713, FW Stadt 3772, FW Landkreis 3782,
// Wasserrettung 3775, Sondergruppen 3701 bis 3705. Kitzingen und Main-Spessart behalten vorerst ihre FW-Gruppen.
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';

const f = new URL('../../assets/ils-wuerzburg.json.gz', import.meta.url);
const scn = JSON.parse(gunzipSync(readFileSync(f)).toString());
const STADT = ['Würzburg', 'Heidingsfeld', 'Lengfeld', 'Rottenbauer', 'Unterdürrbach', 'Oberdürrbach', 'Versbach', 'Zellerau', 'Heuchelhof'];
const keep = scn.tmoGroups.filter((g: { id: string }) => g.id === 'fw_kt' || g.id === 'fw_msp');
scn.tmoGroups = [
  { id: 'rd_wue', name: '3737 RD_WÜ', use: 'RD' },
  { id: 'rd_wue_l', name: '3713 RD_WÜ#', use: 'RD' },
  { id: 'fw_wue', name: '3772 FW_WÜ', use: 'FW' },
  { id: 'fw_wue_l', name: '3782 FW_WÜ#', use: 'FW' },
  ...keep,
  { id: 'wr_wue', name: '3775 WR_WÜ', use: 'RD' },
  ...[1, 2, 3, 4, 5].map((i) => ({ id: `e${i}`, name: `370${i} SONDER`, use: 'Einsatz' })),
];
const inStadt = (name: string, callsigns: string[]) =>
  STADT.some((p) => new RegExp(`\\b${p}\\b`).test(name.replace(/bei Würzburg/, ""))) || callsigns.some((c) => / Würzburg \d/.test(c.replace(/bei Würzburg/, "")));
const n: Record<string, number> = {};
for (const s of scn.stations) {
  const cs = s.vehicles.map((v: { callsign: string }) => v.callsign);
  if (s.kind === 'rettungswache') {
    if (/Wasserwacht/.test(s.name) || cs.every((c: string) => /^(Wasserwacht|Pelikan) /.test(c))) s.tmo = 'wr_wue';
    else s.tmo = inStadt(s.name, cs) ? 'rd_wue' : 'rd_wue_l';
  } else if (s.tmo === 'fw_wue' || s.tmo === 'fw_wue_l') {
    s.tmo = inStadt(s.name, cs.filter((c: string) => !/ Würzburg-Land /.test(c))) ? 'fw_wue' : 'fw_wue_l';
  }
  n[s.tmo] = (n[s.tmo] ?? 0) + 1;
}
writeFileSync(f, gzipSync(JSON.stringify(scn), { level: 9 }));
console.log(n);
