// Klingelton, Signaltöne und Sprachausgabe ohne Audiodateien.
let ctx: AudioContext | null = null;
let muted = false;

function audio(): AudioContext | null {
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
  if (m) window.speechSynthesis?.cancel();
}

export function isMuted() {
  return muted;
}

function tone(freq: number, start: number, dur: number, vol = 0.08) {
  const c = audio();
  if (!c || muted) return;
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

/** Alarmton bei BMA */
export function alarmTone() {
  tone(880, 0, 0.25, 0.07);
  tone(660, 0.3, 0.25, 0.07);
}

export function speak(text: string) {
  if (muted || !('speechSynthesis' in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'de-DE';
  const voice = window.speechSynthesis.getVoices().find((v) => v.lang.startsWith('de'));
  if (voice) u.voice = voice;
  u.rate = 1.1;
  window.speechSynthesis.speak(u);
}
