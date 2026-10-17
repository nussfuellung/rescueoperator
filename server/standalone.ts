// Eigenständiger Server ohne Oberfläche: node dist/server/standalone.js [--port 4711] [--scenario datei.json | --seed 4711]
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { DEFAULT_PORT } from '../shared/protocol';
import { generateScenario } from '../shared/mapgen';
import { recomputeHouseNumbers } from '../shared/geo';
import type { Scenario } from '../shared/types';
import { GameServer, lanAddresses } from './server';

const args = process.argv.slice(2);
const arg = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const port = Number(arg('port') ?? DEFAULT_PORT);
let scenario: Scenario;
const file = arg('scenario');
if (file) {
  scenario = JSON.parse(readFileSync(file, 'utf8'));
  recomputeHouseNumbers(scenario);
} else if (!arg('seed') && existsSync(join(__dirname, '../assets/ils-wuerzburg.json.gz'))) {
  // Standard: Musterleitstelle ILS Würzburg (echte Karte)
  scenario = JSON.parse(gunzipSync(readFileSync(join(__dirname, '../assets/ils-wuerzburg.json.gz'))).toString('utf8'));
} else {
  scenario = generateScenario({ seed: Number(arg('seed') ?? 4711), towns: 8 });
}

const server = new GameServer(scenario);
server.start(port).then((p) => {
  console.log(`${scenario.ilsName} läuft auf Port ${p}`);
  for (const ip of lanAddresses()) console.log(`  Im LAN beitreten: ${ip}:${p}`);
  if (args.includes('--autostart')) server.game.started = server.game.running = true;
});

process.on('SIGINT', () => server.stop().then(() => process.exit(0)));
