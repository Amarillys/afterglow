// Which part of a one-shot voice costs the audio thread the most: renderCapacity at 15 bells/s for
// variants of the bell graph (same partials and envelopes, parts removed or replaced). Exploratory.
// "oscbell" is the v0.5.1 bell (an oscillator per partial, live lowpass); "current" is Sekai.voices.bell.
// Usage: node test-scripts/voice-cost.mjs [rounds]
import { launch, pageUrl, sleep } from "./cdp.mjs";

const ROUNDS = +(process.argv[2] || 2);
const b = await launch({ port: 9341 });
const ctxs = [];
b.on("WebAudio.contextCreated", (p) => p.context.contextType === "realtime" && ctxs.push(p.context.contextId));
await b.send("WebAudio.enable");
const MUTE = `window.__orig = {}; for (const k of ["bell","tick","pulse","pad","pluck","chime","drop"]) { __orig[k] = Sekai.voices[k]; Sekai.voices[k] = () => []; }`;

// page-side variants; each plays one bell at t with frequency f
const LIB = `(() => {
  const A = Sekai.audio, ctx = A.ctx;
  const P = [[1, 1, 3.2], [2, 0.32, 1.7], [3.01, 0.12, 0.9], [4.2, 0.07, 0.5], [5.43, 0.04, 0.3], [1.003, 0.25, 2.2, 0.03]];
  const parts = (t, dest, f, amp) => P.forEach(([r, a, d, at = 0.006]) => {
    const o = ctx.createOscillator(); o.frequency.value = f * r;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(amp * a, t + at); g.gain.setTargetAtTime(0, t + at, d / 4.6);
    o.connect(g).connect(dest); o.start(t); o.stop(t + at + d + 0.1);
  });
  const lp = (dest, f) => { const x = ctx.createBiquadFilter(); x.frequency.value = Math.min(5600, f * 6); x.connect(dest); return x; };
  const full = (pan) => A.strip({ pan, dry: 0.9, wet: 0.45, echo: 0.18 }).input;
  const bufs = new Map();
  const buf = (f) => {
    const k = Math.round(f);
    if (bufs.has(k)) return bufs.get(k);
    const rate = ctx.sampleRate, len = Math.ceil(rate * 3.4), d = new Float32Array(len);
    for (const [r, a, dd, at = 0.006] of P) {
      const w = 2 * Math.PI * f * r / rate, n = Math.ceil(rate * (at + dd + 0.1)), na = rate * at, tau = rate * dd / 4.6;
      for (let i = 0; i < n; i++) d[i] += Math.sin(w * i) * a * (i < na ? i / na : Math.exp(-(i - na) / tau));
    }
    const bb = ctx.createBuffer(1, len, rate); bb.getChannelData(0).set(d); bufs.set(k, bb); return bb;
  };
  window.__V = {
    current: (t, f, pan) => __orig.bell(t, f, { vel: 0.3, pan }),
    oscbell: (t, f, pan) => parts(t, lp(full(pan), f), f, 0.05),
    nolp: (t, f, pan) => parts(t, full(pan), f, 0.05),
    dryonly: (t, f, pan) => parts(t, lp(A.strip({ pan, dry: 0.9 }).input, f), f, 0.05),
    nostrip: (t, f, pan) => parts(t, lp(A.bus, f), f, 0.05),
    oscsonly: (t, f, pan) => parts(t, A.bus, f, 0.05),
    buffer: (t, f, pan) => {
      const s = ctx.createBufferSource(); s.buffer = buf(f);
      const g = ctx.createGain(); g.gain.value = 0.05;
      s.connect(g).connect(lp(full(pan), f)); s.start(t);
    },
    buffernolp: (t, f, pan) => {
      const s = ctx.createBufferSource(); s.buffer = buf(f);
      const g = ctx.createGain(); g.gain.value = 0.05;
      s.connect(g).connect(full(pan)); s.start(t);
    },
  };
  for (let d = 5; d < 17; d++) buf(Sekai.music.freq(d));
})()`;

async function cap(secs = 6) {
  const id = ctxs[ctxs.length - 1];
  let s = 0, n = 0;
  for (let i = 0; i < secs * 4; i++) {
    const r = await b.send("WebAudio.getRealtimeData", { contextId: id });
    if (r.result) (s += r.result.realtimeData.renderCapacity * 100), n++;
    await sleep(250);
  }
  return s / n;
}
const NAMES = ["idle", "current", "oscbell", "nolp", "dryonly", "nostrip", "oscsonly", "buffer", "buffernolp"];
const res = Object.fromEntries(NAMES.map((n) => [n, []]));
for (let r = 0; r < ROUNDS; r++) {
  for (const name of r % 2 ? [...NAMES].reverse() : NAMES) {
    await b.go(pageUrl());
    await b.eval(MUTE);
    await b.click(640, 400);
    await sleep(5000);
    await b.eval(LIB);
    if (name !== "idle") {
      await b.eval(`window.__b = setInterval(() => __V.${name}(Sekai.audio.ctx.currentTime + 0.01,
        Sekai.music.freq(5 + Math.floor(Math.random() * 12)), Math.random() - 0.5), 67)`);
    }
    await sleep(6000);
    res[name].push(await cap());
    await b.eval("window.__b && clearInterval(__b)");
  }
}
for (const n of NAMES) console.log(n.padEnd(12), res[n].map((x) => x.toFixed(1).padStart(5)).join("  "));
console.log("--- page logs ---\n" + (b.logs.join("\n") || "(none)"));
b.close();
