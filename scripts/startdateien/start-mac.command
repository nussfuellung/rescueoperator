#!/bin/bash
# Startet den Leitstellensimulator auf dem Mac (Apple-Chip und Intel).
# Beim ersten Mal: Rechtsklick auf diese Datei, "Öffnen", dann nochmal "Öffnen" bestätigen.
cd "$(dirname "$0")" || exit 1
if [ "$(uname -m)" = "arm64" ]; then APP="programm/mac-apple/Leitstellensimulator.app"; else APP="programm/mac-intel/Leitstellensimulator.app"; fi
if [ ! -d "$APP" ]; then echo "$APP fehlt. Bitte die ZIP-Datei direkt auf dem Mac entpacken."; read -r; exit 1; fi

# Die App ist nicht von Apple beglaubigt: Download-Sperre entfernen und lokal signieren, damit macOS sie startet
xattr -dr com.apple.quarantine "$APP" 2>/dev/null
if ! codesign --verify "$APP" 2>/dev/null; then
  echo "Signiere die App lokal (einmalig)…"
  codesign --force --deep --sign - "$APP" || echo "Signieren fehlgeschlagen, versuche trotzdem zu starten."
fi
open "$APP"
