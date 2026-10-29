// The pre-rendered bell must sound the same as the oscillator-per-partial bell it replaced.
// Renders both offline, dry and mono, at several pitches and lengths, and prints the difference
// in dB below the signal (sample by sample) plus the bake time of each buffer.
// Usage: node test-scripts/bell-compare.mjs
import { launch, pageUrl, sleep } from "./cdp.mjs";

const b = await launch({ port: 9347 });
await b.go(pageUrl());
await b.click(640, 400);
await sleep(2000);
const out = await b.eval(`(async () => {
  const A = Sekai.audio, live = A.ctx, rate = live.sampleRate, rows = [];
  const BELL = [[1, 1, 3.2], [2, 0.32, 1.7], [3.01, 0.12, 0.9], [4.2, 0.07, 0.5], [5.43, 0.04, 0.3]];
  for (const [freq, len] of [[146.83, 1], [293.66, 1], [440, 1.4], [659.25, 1.8], [987.77, 0.8], [1975.5, 0.8], [2637, 1.2]]) {
    const secs = 3.2 * len + 0.4;
    // the old bell, verbatim, into an offline context
    const o1 = new OfflineAudioContext(1, Math.ceil(rate * secs), rate);
    const lp = o1.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = Math.min(5600, freq * 6); lp.connect(o1.destination);
    const partial = (t, dest, f, amp, decay, attack) => {
      if (f > 11000) return;
      const o = o1.createOscillator(); o.frequency.value = f;
      const g = o1.createGain();
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(amp, t + attack); g.gain.setTargetAtTime(0, t + attack, decay / 4.6);
      o.connect(g).connect(dest); o.start(t); o.stop(t + attack + decay + 0.1);
    };
    BELL.forEach(([r, a, d]) => partial(0, lp, freq * r, a, d * len, 0.006));
    partial(0, lp, freq * 1.003, 0.25, 2.2 * len, 0.03);
    const ref = (await o1.startRendering()).getChannelData(0);
    // the new bell: the page's buffer, played the same way
    const tb = performance.now();
    let buf;
    const orig = A.ctx.createBufferSource.bind(A.ctx);
    A.ctx.createBufferSource = () => { const s = orig(); const st = s.start.bind(s);
      s.start = (t) => { buf = s.buffer; s.disconnect(); }; return s; };
    Sekai.voices.bell(live.currentTime + 1, freq, { len });
    A.ctx.createBufferSource = orig;
    const bake = performance.now() - tb;
    const o2 = new OfflineAudioContext(1, ref.length, rate);
    const s = o2.createBufferSource(); s.buffer = o2.createBuffer(1, buf.length, rate);
    s.buffer.getChannelData(0).set(buf.getChannelData(0)); s.connect(o2.destination); s.start(0);
    const got = (await o2.startRendering()).getChannelData(0);
    let es = 0, ed = 0, peak = 0, peakDiff = 0;
    for (let i = 0; i < ref.length; i++) {
      const d = got[i] - ref[i]; es += ref[i] * ref[i]; ed += d * d;
      peak = Math.max(peak, Math.abs(ref[i])); peakDiff = Math.max(peakDiff, Math.abs(d));
    }
    rows.push({ freq, len, bakeMs: +bake.toFixed(1), samples: buf.length,
      diffDb: +(10 * Math.log10(ed / es)).toFixed(1), peakDiffDb: +(20 * Math.log10(peakDiff / peak)).toFixed(1) });
  }
  return JSON.stringify(rows);
})()`);
for (const r of JSON.parse(out)) console.log(JSON.stringify(r));
console.log("--- page logs ---\n" + (b.logs.join("\n") || "(none)"));
b.close();
