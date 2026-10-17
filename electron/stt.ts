// Verwaltung des deutschen Spracherkennungsmodells (Vosk) für die Spracheingabe.
import { app, net, protocol, type WebContents } from 'electron';
import { existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { zipToModelTarGz } from '../shared/modelpack';

export const MODEL_URL = 'https://alphacephei.com/vosk/models/vosk-model-small-de-0.15.zip';

const modelDir = () => {
  const d = join(app.getPath('userData'), 'sprachmodell');
  mkdirSync(d, { recursive: true });
  return d;
};
const modelFile = () => join(modelDir(), 'vosk-de.tar.gz');

/** Muss vor app.ready aufgerufen werden */
export function registerModelScheme() {
  protocol.registerSchemesAsPrivileged([
    { scheme: 'lstmodel', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
  ]);
}

export function handleModelProtocol() {
  protocol.handle('lstmodel', async () => {
    if (!existsSync(modelFile())) return new Response('Kein Modell installiert', { status: 404 });
    return new Response(readFileSync(modelFile()), {
      headers: { 'content-type': 'application/gzip', 'access-control-allow-origin': '*' },
    });
  });
}

export function modelInfo() {
  const f = modelFile();
  if (!existsSync(f)) return { installed: false, url: '' };
  const st = statSync(f);
  // Die URL ändert sich mit dem Modell, damit vosk-browser nicht die alte Kopie aus dem Cache nimmt
  return { installed: true, url: `lstmodel://de/${Math.round(st.mtimeMs)}/model.tar.gz`, size: st.size };
}

export function installModelFromBytes(bytes: Uint8Array, name: string) {
  const tgz = /\.(tar\.gz|tgz)$/i.test(name) ? bytes : zipToModelTarGz(bytes);
  writeFileSync(modelFile(), tgz);
  return modelInfo();
}

export function removeModel() {
  if (existsSync(modelFile())) unlinkSync(modelFile());
  return modelInfo();
}

export async function downloadModel(sender: WebContents) {
  const res = await net.fetch(MODEL_URL, { headers: { 'user-agent': 'Leitstellensimulator' } });
  if (!res.ok || !res.body) throw new Error(`Download fehlgeschlagen (HTTP ${res.status})`);
  const total = Number(res.headers.get('content-length') ?? 0);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let got = 0;
  let lastSent = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    got += value.length;
    if (Date.now() - lastSent > 250) {
      lastSent = Date.now();
      sender.send('stt:progress', { got, total });
    }
  }
  sender.send('stt:progress', { got, total, converting: true });
  const zip = new Uint8Array(got);
  let off = 0;
  for (const c of chunks) {
    zip.set(c, off);
    off += c.length;
  }
  return installModelFromBytes(zip, 'model.zip');
}
