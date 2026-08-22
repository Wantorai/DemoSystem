# transcribe.py
# usage: python3 transcribe.py /path/to/file.wav
import sys, os, json, wave
from vosk import Model, KaldiRecognizer

MODEL_PATH = os.path.expanduser(os.environ.get('VOSK_MODEL_PATH', "~/vosk-models/vosk-model-small-ru-0.22"))
# MODEL_PATH = os.path.expanduser(os.environ.get('VOSK_MODEL_PATH', "~/vosk-models/vosk-model-ru-0.42"))

if not os.path.exists(MODEL_PATH):
    print("ERROR: model not found: " + MODEL_PATH, file=sys.stderr)
    sys.exit(2)

if len(sys.argv) < 2:
    print("Usage: transcribe.py path/to/file.wav", file=sys.stderr)
    sys.exit(2)

wav_path = sys.argv[1]
if not os.path.exists(wav_path):
    print("ERROR: file not found: " + wav_path, file=sys.stderr)
    sys.exit(2)

wf = wave.open(wav_path, "rb")
# model expects WAV PCM 16kHz mono (or at least same sample rate as we pass)
rec = KaldiRecognizer(Model(MODEL_PATH), wf.getframerate())
rec.SetWords(True)

text_parts = []
while True:
    data = wf.readframes(4000)
    if len(data) == 0:
        break
    if rec.AcceptWaveform(data):
        r = json.loads(rec.Result())
        if r.get("text"):
            text_parts.append(r.get("text"))

r = json.loads(rec.FinalResult())
if r.get("text"):
    text_parts.append(r.get("text"))

result = " ".join(p for p in text_parts).strip()
# выводим в stdout — Node прочитает результат
print(result)
