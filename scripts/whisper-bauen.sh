#!/usr/bin/env bash
# Baut whisper-server (whisper.cpp) für die Spracherkennung nach vendor/whisper/<plattform>.
# Aufruf: bash scripts/whisper-bauen.sh linux-x64|win-x64|mac-arm64|mac-x64
# Für x64 entstehen mehrere CPU-Varianten, whisper-server wählt beim Start die passende für den Rechner.
set -euo pipefail

VERSION=v1.9.5
PLAT=$1
SRC=vendor/.whisper-src
OUT=vendor/whisper/$PLAT

rm -rf "$SRC" "$OUT"
git clone -q --depth 1 -b "$VERSION" https://github.com/ggml-org/whisper.cpp "$SRC"

ARGS=(-DCMAKE_BUILD_TYPE=Release -DWHISPER_BUILD_TESTS=OFF -DWHISPER_SDL2=OFF -DGGML_NATIVE=OFF)
case "$PLAT" in
  linux-x64)
    ARGS+=(-DBUILD_SHARED_LIBS=ON -DGGML_BACKEND_DL=ON -DGGML_CPU_ALL_VARIANTS=ON '-DCMAKE_INSTALL_RPATH=$ORIGIN' -DCMAKE_BUILD_WITH_INSTALL_RPATH=ON)
    ;;
  win-x64)
    ARGS+=(-A x64 -DBUILD_SHARED_LIBS=ON -DGGML_BACKEND_DL=ON -DGGML_CPU_ALL_VARIANTS=ON)
    ;;
  mac-arm64)
    # Apple-Chips rechnen über Metal auf der Grafikeinheit
    ARGS+=(-DBUILD_SHARED_LIBS=OFF -DGGML_METAL=ON -DGGML_METAL_EMBED_LIBRARY=ON -DCMAKE_OSX_ARCHITECTURES=arm64 -DCMAKE_OSX_DEPLOYMENT_TARGET=12.0)
    ;;
  mac-x64)
    # Intel-Macs ab 2013 (Haswell) haben AVX2
    ARGS+=(-DBUILD_SHARED_LIBS=OFF -DGGML_METAL=OFF -DGGML_AVX=ON -DGGML_AVX2=ON -DGGML_FMA=ON -DGGML_F16C=ON -DCMAKE_OSX_ARCHITECTURES=x86_64 -DCMAKE_OSX_DEPLOYMENT_TARGET=12.0)
    ;;
  *)
    echo "Unbekannte Plattform: $PLAT" >&2
    exit 1
    ;;
esac

cmake -S "$SRC" -B "$SRC/build" "${ARGS[@]}"
cmake --build "$SRC/build" --config Release --target whisper-server -j 4

mkdir -p "$OUT"
BIN="$SRC/build/bin"
[ -d "$BIN/Release" ] && BIN="$BIN/Release"
case "$PLAT" in
  win-x64)
    cp "$BIN"/whisper-server.exe "$BIN"/*.dll "$OUT"/
    ;;
  linux-x64)
    # Nur die Namen, unter denen die Bibliotheken geladen werden, und ohne symbolische Links (die übersteht das Paketieren nicht)
    cp "$BIN"/whisper-server "$OUT"/
    for f in "$BIN"/libwhisper.so.1 "$BIN"/libggml.so.0 "$BIN"/libggml-base.so.0 "$BIN"/libggml-cpu-*.so; do cp -L "$f" "$OUT"/; done
    ;;
  mac-*)
    cp "$BIN"/whisper-server "$OUT"/
    ;;
esac
rm -rf "$SRC"
ls -la "$OUT"
