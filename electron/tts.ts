// Sprachausgabe über die Systemstimme: Windows (SAPI über PowerShell), macOS (say), Linux (spd-say/espeak).
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process';

const PS_SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.Speech
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$s.SetOutputToDefaultAudioDevice()
$de = @($s.GetInstalledVoices() | Where-Object { $_.Enabled -and $_.VoiceInfo.Culture.Name -like 'de*' })
[Console]::InputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Write-Output ('READY|' + $de.Count)
while ($true) {
  $line = [Console]::In.ReadLine()
  if ($line -eq $null) { break }
  $p = $line.Split('|', 4)
  try {
    if ($de.Count -gt 0) { $s.SelectVoice($de[[int]$p[1] % $de.Count].VoiceInfo.Name) }
    $s.Rate = [int]$p[2]
    $s.Speak($p[3])
  } catch {}
  Write-Output ('DONE|' + $p[0])
}
`;

let ps: ChildProcessWithoutNullStreams | null = null;
let seq = 0;
const pending = new Map<number, (ok: boolean) => void>();

function startPowerShell() {
  if (ps) return ps;
  const encoded = Buffer.from(PS_SCRIPT, 'utf16le').toString('base64');
  ps = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded], {
    windowsHide: true,
  });
  let buf = '';
  ps.stdout.setEncoding('utf8');
  ps.stdout.on('data', (d: string) => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      const m = line.match(/^DONE\|(\d+)/);
      if (m) {
        pending.get(Number(m[1]))?.(true);
        pending.delete(Number(m[1]));
      }
    }
  });
  ps.on('exit', () => {
    ps = null;
    for (const r of pending.values()) r(false);
    pending.clear();
  });
  return ps;
}

function has(cmd: string) {
  try {
    return spawnSync(process.platform === 'win32' ? 'where' : 'which', [cmd]).status === 0;
  } catch {
    return false;
  }
}

let linuxCmd: string | null | undefined;

export function systemTtsAvailable(): boolean {
  if (process.platform === 'win32' || process.platform === 'darwin') return true;
  if (linuxCmd === undefined) linuxCmd = has('spd-say') ? 'spd-say' : has('espeak-ng') ? 'espeak-ng' : has('espeak') ? 'espeak' : null;
  return !!linuxCmd;
}

/** Spricht einen Text; voice wählt bei mehreren deutschen Stimmen eine andere (z. B. für Anrufer) */
export function speakSystem(text: string, voice: number, rate: number): Promise<boolean> {
  const clean = text.replace(/[\r\n|]+/g, ' ').slice(0, 600);
  if (process.platform === 'win32') {
    return new Promise((resolve) => {
      const p = startPowerShell();
      const id = ++seq;
      pending.set(id, resolve);
      p.stdin.write(`${id}|${voice}|${rate}|${clean}\n`, 'utf8');
      setTimeout(() => {
        if (pending.has(id)) {
          pending.delete(id);
          resolve(false);
        }
      }, 30000);
    });
  }
  return new Promise((resolve) => {
    let child;
    if (process.platform === 'darwin') child = spawn('say', ['-v', 'Anna', '-r', String(180 + rate * 15 + voice * 10), clean]);
    else if (linuxCmd === 'spd-say') child = spawn('spd-say', ['-w', '-l', 'de', '-r', String(rate * 10), clean]);
    else if (linuxCmd) child = spawn(linuxCmd, ['-v', 'de', clean]);
    else return resolve(false);
    child.on('exit', (code) => resolve(code === 0));
    child.on('error', () => resolve(false));
  });
}

export function stopSystemSpeech() {
  if (ps) {
    ps.kill();
    ps = null;
  }
}
