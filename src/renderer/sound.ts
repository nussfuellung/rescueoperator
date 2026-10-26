// Klingelton, Signaltöne und Sprachausgabe ohne Audiodateien.
import { getSettings } from './settings';

let ctx: AudioContext | null = null;
let muted = false;

export function audio(): AudioContext | null {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

export function setMuted(m: boolean) {
  muted = m;
}

export function isMuted() {
  return muted;
}

function tone(freq: number, start: number, dur: number, vol = 0.08) {
  const c = audio();
  if (!c || muted || !getSettings().ringtone) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = 'sine';
  o.frequency.value = freq;
  g.gain.setValueAtTime(0, c.currentTime + start);
  g.gain.linearRampToValueAtTime(vol, c.currentTime + start + 0.02);
  g.gain.setValueAtTime(vol, c.currentTime + start + dur - 0.03);
  g.gain.linearRampToValueAtTime(0, c.currentTime + start + dur);
  o.connect(g).connect(c.destination);
  o.start(c.currentTime + start);
  o.stop(c.currentTime + start + dur + 0.05);
}

/** Telefonklingeln (ein Klingelzyklus) */
export function ring() {
  for (let i = 0; i < 6; i++) {
    tone(440, i * 0.1, 0.08);
    tone(480, i * 0.1, 0.08);
  }
}

/** Kurzer Doppelton für Status 5 / Sprechwunsch */
export function beep() {
  tone(1200, 0, 0.12, 0.06);
  tone(900, 0.16, 0.12, 0.06);
}

/** Schneller Dreifachton für Status 0 / priorisierter Sprechwunsch */
export function prioTone() {
  for (let i = 0; i < 3; i++) tone(1400, i * 0.14, 0.09, 0.08);
}

/** Alarmton bei BMA */
export function alarmTone() {
  tone(880, 0, 0.25, 0.07);
  tone(660, 0.3, 0.25, 0.07);
}


/** Auf Tablets und Handys darf Ton erst nach einer Berührung starten */
export function unlockAudio() {
  const c = audio();
  if (c) {
    const b = c.createBuffer(1, 1, 22050);
    const s = c.createBufferSource();
    s.buffer = b;
    s.connect(c.destination);
    s.start(0);
  }
  try {
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    speechSynthesis.speak(u);
  } catch {
    /* kein Vorlesen im Browser */
  }
}
