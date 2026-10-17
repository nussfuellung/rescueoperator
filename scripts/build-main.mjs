// Bündelt Electron-Hauptprozess, Preload und eigenständigen Server.
import { build } from 'esbuild';

const common = {
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  sourcemap: true,
  external: ['electron', 'bufferutil', 'utf-8-validate'],
  logLevel: 'info',
};

await build({ ...common, entryPoints: ['electron/main.ts'], outfile: 'dist/electron/main.js' });
await build({ ...common, entryPoints: ['electron/preload.ts'], outfile: 'dist/electron/preload.js' });
await build({ ...common, entryPoints: ['server/standalone.ts'], outfile: 'dist/server/standalone.js' });
