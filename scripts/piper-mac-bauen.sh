#!/usr/bin/env bash
# Baut Piper (neuronale Sprachausgabe) nativ für den Mac, auf dem es läuft (arm64 oder x86_64).
# Die offiziellen Mac-Pakete von Piper sind nur für Intel gebaut und ohne Bibliotheken, deshalb bauen wir selbst.
# Ergebnis: vendor/piper/mac-<arch>/piper/ mit piper, Bibliotheken und espeak-ng-data, lokal signiert.
# Aufruf auf macOS: bash scripts/piper-mac-bauen.sh
set -euo pipefail

PIPER_VERSION=2023.11.14-2
case "$(uname -m)" in
  arm64) ARCH=arm64 ;;
  x86_64) ARCH=x64 ;;
  *) echo "Unbekannte Architektur $(uname -m)"; exit 1 ;;
esac
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$ROOT/vendor/.piper-mac-build"
OUT="$ROOT/vendor/piper/mac-$ARCH/piper"

rm -rf "$WORK" "$OUT"
mkdir -p "$WORK" "$OUT"
git clone --quiet --depth 1 --branch "$PIPER_VERSION" https://github.com/rhasspy/piper "$WORK/src"
cmake -S "$WORK/src" -B "$WORK/build" -DCMAKE_BUILD_TYPE=Release -DCMAKE_INSTALL_PREFIX="$WORK/install" >/dev/null
cmake --build "$WORK/build" --config Release -j "$(sysctl -n hw.ncpu)"
cmake --install "$WORK/build" >/dev/null

# Programm, Daten und alle Bibliotheken (Symlinks aufgelöst) flach in einen Ordner
cp "$WORK/install/piper" "$OUT/"
cp -R "$WORK/install/espeak-ng-data" "$OUT/"
for lib in "$WORK"/install/*.dylib; do
  cp -L "$lib" "$OUT/$(basename "$lib")"
done

# Verweise auf Bibliotheken auf den eigenen Ordner umstellen (@loader_path), damit nichts außerhalb gesucht wird
fix() {
  local f="$1"
  for dep in $(otool -L "$f" | tail -n +2 | awk '{print $1}'); do
    local base
    base="$(basename "$dep")"
    if [ -f "$OUT/$base" ] && [ "$dep" != "@loader_path/$base" ]; then
      install_name_tool -change "$dep" "@loader_path/$base" "$f" 2>/dev/null
    fi
  done
}
for f in "$OUT"/*.dylib; do
  install_name_tool -id "@loader_path/$(basename "$f")" "$f" 2>/dev/null
  fix "$f"
done
fix "$OUT/piper"
install_name_tool -add_rpath "@loader_path" "$OUT/piper" 2>/dev/null || true

# Nach install_name_tool sind die Signaturen ungültig: lokal (ad hoc) neu signieren, sonst startet nichts auf Apple-Chips
for f in "$OUT"/*.dylib "$OUT/piper"; do
  codesign --force --sign - "$f"
done

echo "Abhängigkeiten von piper:"
otool -L "$OUT/piper"
file "$OUT/piper"
rm -rf "$WORK"
