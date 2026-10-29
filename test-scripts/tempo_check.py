# Independent tempo estimate (numpy, onset autocorrelation) to cross-check js/audio/analyze.js.
# Usage: python test-scripts/tempo_check.py song.flac
import subprocess, sys
import numpy as np
sr, hop, n = 11025, 128, 512
raw = subprocess.run(["ffmpeg", "-v", "quiet", "-i", sys.argv[1], "-ac", "1", "-ar", str(sr), "-f", "f32le", "-"],
                     capture_output=True, check=True).stdout
x = np.frombuffer(raw, dtype=np.float32)
frames = (len(x) - n) // hop
idx = np.arange(n)[None, :] + hop * np.arange(frames)[:, None]
mag = np.log1p(100 * np.abs(np.fft.rfft(x[idx] * np.hanning(n), axis=1)))
flux = np.maximum(0, np.diff(mag, axis=0)).sum(axis=1)
fps = sr / hop
onset = flux - np.convolve(flux, np.ones(int(fps * 0.8)) / int(fps * 0.8), mode="same")
onset = np.maximum(0, onset)
lags = np.arange(int(fps * 60 / 200), int(fps * 60 / 50))
ac = np.array([np.dot(onset[L:], onset[:-L]) / (len(onset) - L) for L in lags])
order = np.argsort(ac)[::-1]
seen = []
for i in order:
    bpm = 60 * fps / lags[i]
    if all(abs(bpm - s) > 3 for s in seen): seen.append(bpm)
    if len(seen) == 4: break
print(f"duration {len(x)/sr:.1f}s; top autocorrelation tempos (BPM): " + ", ".join(f"{b:.1f}" for b in seen))
