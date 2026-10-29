// Auslagerbare Fenster: Inhalte werden per React-Portal in ein eigenes Fenster gerendert.
import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { attachPttKeys } from './audio/stt';
import { attachTheme } from './theme';

export type PanelId = 'calls' | 'form' | 'map' | 'incidents' | 'radio' | 'units';

export const PANEL_TITLES: Record<PanelId, string> = {
  calls: 'Notrufabfrage',
  form: 'Einsatzmaske',
  map: 'Karte',
  incidents: 'Einsätze',
  radio: 'Funk',
  units: 'Fahrzeugstatus',
};

const GEOM_KEY = 'lst.popoutGeometry';

function loadGeometry(): Record<string, { x: number; y: number; w: number; h: number }> {
  try {
    return JSON.parse(localStorage.getItem(GEOM_KEY) ?? '{}');
  } catch {
    return {};
  }
}

function copyStyles(from: Document, to: Document) {
  for (const sheet of Array.from(from.styleSheets)) {
    try {
      const css = Array.from(sheet.cssRules)
        .map((r) => r.cssText)
        .join('\n');
      const style = to.createElement('style');
      style.textContent = css;
      to.head.appendChild(style);
    } catch {
      if (sheet.href) {
        const link = to.createElement('link');
        link.rel = 'stylesheet';
        link.href = sheet.href;
        to.head.appendChild(link);
      }
    }
  }
}

/** Rendert die Kinder in ein eigenes Fenster; onClose, wenn der Nutzer es schließt */
/** Rückfrage im Fenster des Knopfs zeigen, damit sie bei ausgelagerten Bereichen nicht hinter dem Hauptfenster aufgeht */
export function confirmHier(el: Element, text: string) {
  return (el.ownerDocument.defaultView ?? window).confirm(text);
}

export function Popout({ id, title, onClose, children }: { id: PanelId; title: string; onClose: () => void; children: ReactNode }) {
  const [container, setContainer] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const g = loadGeometry()[id] ?? { x: 80, y: 80, w: id === 'map' ? 1100 : 520, h: id === 'map' ? 800 : 700 };
    const w = window.open('', `lst-${id}`, `width=${g.w},height=${g.h},left=${g.x},top=${g.y}`);
    if (!w) {
      onClose();
      return;
    }
    w.document.head.innerHTML = '<meta charset="utf-8">';
    w.document.title = `${title} – rescue.Operator`;
    copyStyles(document, w.document);
    const detachTheme = attachTheme(w.document);
    w.document.body.innerHTML = '';
    w.document.body.className = 'popout-body';
    const root = w.document.createElement('div');
    root.className = 'popout-root';
    w.document.body.appendChild(root);
    setContainer(root);
    const detachPtt = attachPttKeys(w);
    // Tastenkürzel (F2, J, Alt+Zahl) an das Hauptfenster weiterreichen
    const forward = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      window.dispatchEvent(new KeyboardEvent('keydown', { key: e.key, altKey: e.altKey, ctrlKey: e.ctrlKey, shiftKey: e.shiftKey }));
    };
    w.addEventListener('keydown', forward);
    const save = () => {
      const all = loadGeometry();
      all[id] = { x: w.screenX, y: w.screenY, w: w.outerWidth, h: w.outerHeight };
      try {
        localStorage.setItem(GEOM_KEY, JSON.stringify(all));
      } catch {
        /* egal */
      }
    };
    let closedByUs = false;
    const onUnload = () => {
      save();
      if (!closedByUs) {
        closedByUs = true;
        onClose();
      }
    };
    w.addEventListener('beforeunload', onUnload);
    // Nicht jedes Schließen löst beforeunload aus: zusätzlich nachsehen
    const poll = setInterval(() => {
      if (w.closed && !closedByUs) {
        clearInterval(poll);
        closedByUs = true;
        onClose();
      }
    }, 400);
    const mainUnload = () => w.close();
    window.addEventListener('beforeunload', mainUnload);
    return () => {
      clearInterval(poll);
      detachPtt();
      detachTheme();
      window.removeEventListener('beforeunload', mainUnload);
      closedByUs = true;
      save();
      w.close();
    };
  }, []);

  return container ? createPortal(children, container) : null;
}
