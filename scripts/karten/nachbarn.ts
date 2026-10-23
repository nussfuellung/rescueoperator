// Nachbarleitstellen der ILS Würzburg für die ESWL in die Musterleitstelle aufnehmen.
// Quellen: wiki.lstsim.de (ILS Schweinfurt, ILS Untermain/Fahrzeuge, ILS Ansbach), rth.info und StMI (Luftrettung).
// Standorte auf Ortsebene genähert, Dienstzeiten vereinfacht (fehlt die Angabe: rund um die Uhr).
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { latLonToLocal } from '../../shared/osmimport';
import type { Dienstzeit, NachbarLeitstelle } from '../../shared/types';

type Fz = [callsign: string, type: string, dienst?: string];
type Wache = [name: string, lat: number, lon: number, fahrzeuge: Fz[]];

const ILS: { id: string; name: string; ablehnung: number; wachen: Wache[] }[] = [
  {
    id: 'ils_sw',
    name: 'ILS Schweinfurt',
    ablehnung: 0.25,
    wachen: [
      ['BRK Rettungswache Schweinfurt', 50.056, 10.205, [['Rotkreuz Schweinfurt 71/1', 'RTW'], ['Rotkreuz Schweinfurt 71/2', 'RTW', '6-18'], ['Rotkreuz Schweinfurt 72/1', 'KTW', '8-16'], ['Rotkreuz Schweinfurt 76/1', 'NEF']]],
      ['ASB Rettungswache Schweinfurt', 50.042, 10.229, [['Sama Schweinfurt 71/1', 'RTW', '18-6']]],
      ['MHD Rettungswache Schweinfurt', 50.048, 10.22, [['Johannes Schweinfurt 71/1', 'RTW', '7-19']]],
      ['Stellplatz Werneck', 49.983, 10.099, [['Rotkreuz Werneck 71/1', 'RTW', '8-16']]],
      ['Rettungswache Gerolzhofen', 49.901, 10.346, [['Rotkreuz Gerolzhofen 71/1', 'RTW'], ['Rotkreuz Gerolzhofen 76/1', 'NEF']]],
      ['Rettungswache Hammelburg', 50.114, 9.884, [['Rotkreuz Hammelburg 71/1', 'RTW'], ['Rotkreuz Hammelburg 72/1', 'KTW', '8-14'], ['Rotkreuz Hammelburg 76/1', 'NEF']]],
      ['Rettungswache Bad Kissingen', 50.197, 10.075, [['Rotkreuz Bad Kissingen 71/1', 'RTW'], ['Rotkreuz Bad Kissingen 71/2', 'RTW', '6-22'], ['Rotkreuz Bad Kissingen 76/1', 'NEF']]],
      ['Rettungswache Bad Brückenau', 50.309, 9.788, [['Rotkreuz Bad Brückenau 71/1', 'RTW'], ['Rotkreuz Bad Brückenau 76/1', 'NEF']]],
      ['Rettungswache Münnerstadt', 50.249, 10.199, [['Rotkreuz Münnerstadt 71/1', 'RTW', '8-20']]],
      ['Rettungswache Haßfurt', 50.033, 10.505, [['Rotkreuz Haßfurt 71/1', 'RTW'], ['Rotkreuz Haßfurt 71/2', 'RTW', '6-18'], ['Rotkreuz Haßfurt 76/1', 'NEF']]],
      ['Rettungswache Eltmann', 49.972, 10.665, [['Rotkreuz Eltmann 71/1', 'RTW']]],
    ],
  },
  {
    id: 'ils_ab',
    name: 'ILS Bayerischer Untermain',
    ablehnung: 0.3,
    wachen: [
      ['BRK Rettungswache Aschaffenburg', 49.965, 9.165, [['Rotkreuz Aschaffenburg 71/1', 'RTW'], ['Rotkreuz Aschaffenburg 76/2', 'NEF']]],
      ['MHD Rettungswache Aschaffenburg', 49.977, 9.147, [['Johannes Aschaffenburg 71/1', 'RTW']]],
      ['Rettungswache Schöllkrippen', 50.085, 9.246, [['Rotkreuz Schöllkrippen 71/1', 'RTW']]],
      ['Rettungswache Weibersbrunn', 49.93, 9.365, [['Johannes Weibersbrunn 71/1', 'RTW']]],
      ['Stellplatz Hobbach', 49.856, 9.244, [['Rotkreuz Hobbach 71/1', 'RTW', '6-15']]],
      ['Rettungswache Südspessart (Stadtprozelten)', 49.783, 9.41, [['Rotkreuz Südspessart 71/1', 'RTW']]],
      ['Rettungswache Obernburg', 49.839, 9.144, [['Rotkreuz Obernburg 71/1', 'RTW']]],
      ['NEF-Standort Krankenhaus Erlenbach', 49.804, 9.16, [['Rotkreuz Obernburg 76/1', 'NEF']]],
      ['Rettungswache Miltenberg', 49.703, 9.255, [['Rotkreuz Miltenberg 71/1', 'RTW'], ['Rotkreuz Miltenberg 76/1', 'NEF']]],
    ],
  },
  {
    id: 'ils_an',
    name: 'ILS Ansbach',
    ablehnung: 0.3,
    wachen: [
      ['Rettungswache Scheinfeld', 49.669, 10.463, [['Rotkreuz Scheinfeld 71/1', 'RTW']]],
      ['Rettungswache Neustadt a. d. Aisch', 49.579, 10.61, [['Rotkreuz Neustadt/Aisch 71/1', 'RTW'], ['Rotkreuz Neustadt/Aisch 76/1', 'NEF']]],
      ['Rettungswache Uffenheim', 49.544, 10.234, [['Rotkreuz Uffenheim 71/1', 'RTW'], ['Rotkreuz Uffenheim 76/1', 'NEF']]],
      ['Rettungswache Bad Windsheim', 49.502, 10.415, [['Rotkreuz Bad Windsheim 71/1', 'RTW'], ['Rotkreuz Bad Windsheim 71/2', 'RTW', '7-19'], ['Rotkreuz Bad Windsheim 76/1', 'NEF']]],
      ['Rettungswache Rothenburg o. d. T.', 49.377, 10.186, [['Rotkreuz Rothenburg 71/1', 'RTW'], ['Rotkreuz Rothenburg 76/1', 'NEF']]],
      ['ADAC Luftrettung Dinkelsbühl', 49.0654, 10.4024, [['Christoph 65', 'RTH', 'sunset']]],
    ],
  },
  {
    id: 'ils_tbb',
    name: 'ILS Main-Tauber',
    ablehnung: 0.35,
    wachen: [
      ['DRK Rettungswache Wertheim', 49.764, 9.527, [['Rotkreuz Wertheim 83-1', 'RTW'], ['Rotkreuz Wertheim 82-1', 'NEF']]],
      ['DRK Rettungswache Tauberbischofsheim', 49.623, 9.66, [['Rotkreuz Tauberbischofsheim 83-1', 'RTW'], ['Rotkreuz Tauberbischofsheim 82-1', 'NEF']]],
      ['DRK Rettungswache Bad Mergentheim', 49.492, 9.774, [['Rotkreuz Bad Mergentheim 83-1', 'RTW'], ['Rotkreuz Bad Mergentheim 82-1', 'NEF']]],
    ],
  },
  {
    id: 'ils_fd',
    name: 'ZRLS Fulda',
    ablehnung: 0.3,
    wachen: [['ADAC Luftrettung Fulda (Klinikum)', 50.5461, 9.7046, [['Christoph 28', 'RTH', 'sunset']]]],
  },
  {
    id: 'ils_n',
    name: 'ILS Nürnberg',
    ablehnung: 0.35,
    wachen: [['DRF Luftrettung Flughafen Nürnberg', 49.4959, 11.0727, [['Christoph 27', 'RTH', 'sunset'], ['Christoph Nürnberg', 'RTH']]]],
  },
  {
    id: 'ils_bt',
    name: 'ILS Bayreuth/Kulmbach',
    ablehnung: 0.35,
    wachen: [['ADAC Luftrettung Bayreuth', 49.985, 11.639, [['Christoph 20', 'RTH', 'sunset']]]],
  },
  {
    id: 'ils_f',
    name: 'ZRLS Frankfurt',
    ablehnung: 0.4,
    wachen: [['Luftrettung BG Unfallklinik Frankfurt', 50.144, 8.705, [['Christoph 2', 'RTH', 'sunset']]]],
  },
  {
    id: 'ils_ma',
    name: 'ILS Rhein-Neckar',
    ablehnung: 0.4,
    wachen: [['DRF Luftrettung Mannheim', 49.473, 8.514, [['Christoph 53', 'RTH', 'sunset']]]],
  },
];

function dienst(s?: string): Dienstzeit[] | undefined {
  if (!s) return undefined;
  if (s === 'sunset') return [{ von: 420, bis: 1140, sunset: true }];
  const [von, bis] = s.split('-').map((h) => Number(h) * 60);
  return [{ von, bis }];
}

const f = new URL('../../assets/ils-wuerzburg.json.gz', import.meta.url);
const scn = JSON.parse(gunzipSync(readFileSync(f)).toString());
const nachbarn: NachbarLeitstelle[] = ILS.map((ils) => ({
  id: ils.id,
  name: ils.name,
  ablehnung: ils.ablehnung,
  fahrzeuge: ils.wachen.flatMap(([wache, lat, lon, fz], wi) => {
    const p = latLonToLocal(scn.geo, { lat, lon });
    return fz.map(([callsign, type, d], i) => ({
      id: `${ils.id}_${wi}_${i}`,
      callsign,
      type,
      wache,
      x: Math.round(p.x),
      y: Math.round(p.y),
      ...(dienst(d) ? { dienst: dienst(d) } : {}),
    }));
  }),
}));
scn.nachbarn = nachbarn;
writeFileSync(f, gzipSync(JSON.stringify(scn), { level: 9 }));
for (const n of nachbarn) console.log(n.name, n.fahrzeuge.length, 'Fahrzeuge');
