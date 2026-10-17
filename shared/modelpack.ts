// Wandelt ein Vosk-Sprachmodell (ZIP) in das von vosk-browser erwartete tar.gz um.
import { gzipSync, unzipSync } from 'fflate';

function header(name: string, size: number, type: '0' | '5'): Uint8Array {
  const h = new Uint8Array(512);
  const enc = new TextEncoder();
  const put = (s: string, off: number, len: number) => h.set(enc.encode(s).slice(0, len), off);
  const oct = (n: number, len: number) => n.toString(8).padStart(len - 1, '0') + '\0';
  let prefix = '';
  let n = name;
  if (enc.encode(n).length > 100) {
    const cut = n.lastIndexOf('/', 154);
    prefix = n.slice(0, cut);
    n = n.slice(cut + 1);
  }
  put(n, 0, 100);
  put(oct(type === '5' ? 0o755 : 0o644, 8), 100, 8);
  put(oct(0, 8), 108, 8);
  put(oct(0, 8), 116, 8);
  put(oct(size, 12), 124, 12);
  put(oct(0, 12), 136, 12);
  put('        ', 148, 8);
  put(type, 156, 1);
  put('ustar\0', 257, 6);
  put('00', 263, 2);
  put(prefix, 345, 155);
  let sum = 0;
  for (const b of h) sum += b;
  put(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8);
  return h;
}

/**
 * Erzeugt aus den ZIP-Bytes ein tar.gz mit genau einem Wurzelordner "model/".
 * Ein vorhandener gemeinsamer Wurzelordner im ZIP wird ersetzt.
 */
export function zipToModelTarGz(zip: Uint8Array): Uint8Array {
  const files = unzipSync(zip);
  const names = Object.keys(files).filter((n) => !n.startsWith('__MACOSX'));
  const roots = new Set(names.map((n) => n.split('/')[0]));
  const strip = roots.size === 1 && names.every((n) => n.includes('/'));
  const parts: Uint8Array[] = [];
  const dirs = new Set<string>();
  const addDir = (d: string) => {
    if (!d || dirs.has(d)) return;
    const parent = d.slice(0, d.lastIndexOf('/', d.length - 2) + 1);
    if (parent) addDir(parent);
    dirs.add(d);
    parts.push(header(d, 0, '5'));
  };
  for (const raw of names.sort()) {
    const rel = strip ? raw.slice(raw.indexOf('/') + 1) : raw;
    if (!rel) continue;
    const path = `model/${rel}`;
    if (raw.endsWith('/')) {
      addDir(path);
      continue;
    }
    addDir(path.slice(0, path.lastIndexOf('/') + 1));
    const data = files[raw];
    parts.push(header(path, data.length, '0'), data);
    const pad = (512 - (data.length % 512)) % 512;
    if (pad) parts.push(new Uint8Array(pad));
  }
  parts.push(new Uint8Array(1024));
  const total = parts.reduce((s, p) => s + p.length, 0);
  const tar = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    tar.set(p, off);
    off += p.length;
  }
  if (!names.some((n) => /(^|\/)am\/final\.mdl$/.test(n) || /(^|\/)final\.mdl$/.test(n)))
    throw new Error('Das ZIP enthält kein Vosk-Modell (am/final.mdl fehlt).');
  return gzipSync(tar, { level: 1 });
}
