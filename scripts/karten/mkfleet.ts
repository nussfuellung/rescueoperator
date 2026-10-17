// Würzburg: Fahrzeugbelegung und Rufgruppen auf das fertige Szenario anwenden.
// Aufruf: npx tsx scripts/karten/mkfleet.ts assets/ils-wuerzburg.json.gz
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { assignFleet, assignTmoBySeeds } from '../../shared/fleet';
import type { Scenario } from '../../shared/types';

const file = process.argv[2];
const scn = JSON.parse(gunzipSync(readFileSync(file)).toString()) as Scenario;

// Verwaltungsgemeinschaften sind keine Orte: Straßen dem nächsten echten Ort zuordnen
const vg = new Set(scn.towns.filter((t) => /^Verwaltungsgemeinschaft\b/.test(t.name)).map((t) => t.name));
scn.towns = scn.towns.filter((t) => !vg.has(t.name));
const nodes = new Map(scn.nodes.map((n) => [n.id, n]));
for (const r of scn.roads) {
  if (!r.town || !vg.has(r.town)) continue;
  const a = nodes.get(r.a)!;
  let best = scn.towns[0];
  for (const t of scn.towns) if ((t.x - a.x) ** 2 + (t.y - a.y) ** 2 < (best.x - a.x) ** 2 + (best.y - a.y) ** 2) best = t;
  r.town = best.name;
}
console.log('Verwaltungsgemeinschaften entfernt:', vg.size);

const notes = assignFleet(scn, {
  tier1: ['Kitzingen', 'Karlstadt', 'Lohr', 'Lohr am Main', 'Marktheidenfeld', 'Ochsenfurt', 'Gemünden am Main'],
  tier2: [
    'Volkach', 'Dettelbach', 'Iphofen', 'Marktbreit', 'Arnstein', 'Veitshöchheim', 'Höchberg', 'Eibelstadt', 'Zellingen', 'Rimpar',
    'Estenfeld', 'Giebelstadt', 'Wiesentheid', 'Frammersbach', 'Burgsinn', 'Gerbrunn', 'Randersacker', 'Rottendorf', 'Kürnach', 'Aub',
    'Röttingen', 'Bergtheim', 'Helmstadt', 'Marktsteft', 'Mainbernheim', 'Zell am Main', 'Margetshöchheim', 'Heidingsfeld', 'Würzburg',
  ],
  dlk: ['Volkach', 'Dettelbach', 'Iphofen', 'Marktbreit', 'Arnstein', 'Veitshöchheim', 'Höchberg', 'Würzburg'],
  nef: { Würzburg: 2, Kitzingen: 1, Ochsenfurt: 1, Marktheidenfeld: 1, Karlstadt: 1, 'Lohr am Main': 1, 'Gemünden am Main': 1 },
  rdBig: ['Würzburg', 'Kitzingen'],
  hvo: 5,
});

scn.tmoGroups = [
  { id: 'rd_wue', name: 'RD WÜ 1', use: 'RD' },
  { id: 'fw_wue', name: 'FW WÜ 1', use: 'FW' },
  { id: 'fw_kt', name: 'FW KT 1', use: 'FW' },
  { id: 'fw_msp', name: 'FW MSP 1', use: 'FW' },
  { id: 'ue', name: 'ILS WÜ Ü 1', use: 'Übergreifend' },
  { id: 'e1', name: 'WÜ EINS 1', use: 'Einsatz' },
  { id: 'e2', name: 'WÜ EINS 2', use: 'Einsatz' },
  { id: 'e3', name: 'WÜ EINS 3', use: 'Einsatz' },
];
for (const s of scn.stations) s.tmo = s.kind === 'rettungswache' ? 'rd_wue' : 'fw_wue';
assignTmoBySeeds(
  scn,
  [
    { group: 'fw_wue', places: ['Würzburg', 'Ochsenfurt', 'Aub', 'Rimpar', 'Bergtheim', 'Helmstadt', 'Giebelstadt', 'Röttingen', 'Estenfeld', 'Eibelstadt', 'Höchberg', 'Veitshöchheim', 'Zell am Main', 'Uettingen', 'Kist', 'Erlabrunn', 'Güntersleben', 'Gaukönigshofen'] },
    { group: 'fw_kt', places: ['Kitzingen', 'Volkach', 'Iphofen', 'Marktbreit', 'Dettelbach', 'Wiesentheid', 'Mainbernheim', 'Marktsteft', 'Rödelsee', 'Kleinlangheim', 'Sommerach', 'Obernbreit'] },
    { group: 'fw_msp', places: ['Karlstadt', 'Lohr am Main', 'Marktheidenfeld', 'Gemünden am Main', 'Arnstein', 'Burgsinn', 'Frammersbach', 'Zellingen', 'Kreuzwertheim', 'Hafenlohr', 'Urspringen', 'Remlingen', 'Retzbach', 'Thüngen'] },
  ],
  'FW',
);
const missing = ['Würzburg', 'Kitzingen', 'Karlstadt', 'Lohr am Main', 'Marktheidenfeld', 'Gemünden am Main', 'Ochsenfurt', 'Thüngen', 'Kist', 'Uettingen'].filter((t) => !scn.towns.some((x) => x.name === t));
if (missing.length) console.log('Orte fehlen:', missing.join(', '));
console.log(notes.join('\n'));
for (const st of scn.stations) console.log(st.kind[0], st.tmo, st.name, '|', st.vehicles.map((v) => v.callsign.replace(/^\S+ /, '')).join(', '));
writeFileSync(file, gzipSync(JSON.stringify(scn), { level: 9 }));
