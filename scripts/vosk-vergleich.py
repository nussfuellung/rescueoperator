# Erkennt WAV-Dateien mit Vosk (für scripts/sprache-vergleich.mjs) und gibt Text und Rechenzeit als JSON aus.
import json, sys, time, wave
from vosk import Model, KaldiRecognizer, SetLogLevel

SetLogLevel(-1)
model = Model(sys.argv[1])
out = []
for f in sys.argv[2:]:
    w = wave.open(f, 'rb')
    rec = KaldiRecognizer(model, w.getframerate())
    t0 = time.time()
    while True:
        data = w.readframes(4000)
        if not data:
            break
        rec.AcceptWaveform(data)
    text = json.loads(rec.FinalResult())['text']
    out.append({'text': text, 'ms': (time.time() - t0) * 1000})
print(json.dumps(out))
