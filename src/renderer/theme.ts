// Hell/Dunkel: setzt data-theme am <html> des Hauptfensters und aller ausgelagerten Fenster.
import { getSettings, subscribeSettings } from './settings';

const docs = new Set<Document>();
const media = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: light)') : null;

function resolved(): 'dark' | 'light' {
  const t = getSettings().theme;
  if (t === 'system') return media?.matches ? 'light' : 'dark';
  return t;
}

function apply(doc: Document) {
  const t = resolved();
  doc.documentElement.dataset.theme = t;
  doc.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'light' ? '#e9edf2' : '#11161d');
}

/** Hält das Farbschema eines Dokuments aktuell; Rückgabe meldet es wieder ab */
export function attachTheme(doc: Document) {
  docs.add(doc);
  apply(doc);
  return () => {
    docs.delete(doc);
  };
}

const update = () => docs.forEach(apply);
subscribeSettings(update);
media?.addEventListener('change', update);
