// Hilfen für die Spracherkennung mit Whisper: Modelle, WAV-Aufbereitung, Vorgabetext und Filter für typische Fehlerkennungen.

export const WHISPER_MODELLE = {
  // Zeiten auf einem Rechner mit 4 Kernen je Funkspruch: base ~2 s, small ~7 s, turbo über 30 s (Workflow „Whisper“)
  base: { name: 'Schnell, empfohlen', datei: 'ggml-base-q5_1.bin', mb: 60 },
  small: { name: 'Genau (schneller PC)', datei: 'ggml-small-q5_1.bin', mb: 190 },
  turbo: { name: 'Sehr genau (sehr langsam)', datei: 'ggml-large-v3-turbo-q5_0.bin', mb: 550 },
} as const;
export type WhisperModell = keyof typeof WHISPER_MODELLE;

export const whisperUrl = (m: WhisperModell) => `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${WHISPER_MODELLE[m].datei}`;

/** Whisper erwartet 16 kHz */
export const WHISPER_RATE = 16000;

/** Mono-PCM (−1…1) als 16-Bit-WAV */
export function wavAusPcm(pcm: Float32Array, rate = WHISPER_RATE): Uint8Array {
  const out = new Uint8Array(44 + pcm.length * 2);
  const v = new DataView(out.buffer);
  const text = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  text(0, 'RIFF');
  v.setUint32(4, 36 + pcm.length * 2, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  text(36, 'data');
  v.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i++) {
    const s = Math.max(-1, Math.min(1, pcm[i]));
    v.setInt16(44 + i * 2, Math.round(s < 0 ? s * 0x8000 : s * 0x7fff), true);
  }
  return out;
}

/**
 * Vorgabetext für Whisper: Er beeinflusst Schreibweise und Wortwahl, damit Orte und Funkrufnamen der Karte erkannt werden.
 * Whisper nutzt davon höchstens 224 Token, deshalb nur die größten Orte.
 */
export function whisperPrompt(ilsName: string, rufnamen: string[], orte: string[]): string {
  const r = rufnamen.slice(0, 6).join(', ');
  const o = orte.slice(0, 40).join(', ');
  return `Funkverkehr und Notrufe der ${ilsName}. Status 3, Status 4. ${r}. ${o}.`.slice(0, 900);
}

/** Bekannte Fehlerkennungen von Whisper bei Stille oder Rauschen (aus Untertiteln gelernt) */
const HALLUZINATIONEN = [/untertitel/i, /amara\.org/i, /\bzdf\b/i, /vielen dank (fürs|für's|für das) zuschauen/i, /^\W*(musik|applaus|stille)\W*$/i, /^\s*[.…!?\s]*$/];

/** Erkannten Text bereinigen; leer, wenn es nur eine Fehlerkennung war */
export function whisperText(text: string): string {
  const t = text
    .replace(/\[[^\]]*\]|\([^)]*\)|\*[^*]*\*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return HALLUZINATIONEN.some((h) => h.test(t)) ? '' : t;
}
