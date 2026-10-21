#!/usr/bin/env bash
# Startet den Leitstellensimulator unter Linux (getestet für Arch-basierte Systeme wie CachyOS, läuft auch unter Ubuntu/Fedora).
# Doppelklick im Dateimanager ("Ausführen") oder im Terminal: ./"Start Linux.sh"
cd "$(dirname "$(readlink -f "$0")")" || exit 1
chmod +x leitstellensimulator chrome_crashpad_handler chrome-sandbox 2>/dev/null

# Electron nutzt die Chromium-Sandbox. Ohne Benutzer-Namensräume (selten, z. B. gehärtete Kernel) startet es nur ohne Sandbox.
START=$SECONDS
./leitstellensimulator "$@"
CODE=$?
if [ $CODE -ne 0 ] && [ $((SECONDS - START)) -lt 5 ]; then
  echo "Start mit Sandbox fehlgeschlagen (Code $CODE), versuche es ohne Sandbox…"
  exec ./leitstellensimulator --no-sandbox "$@"
fi
exit $CODE
