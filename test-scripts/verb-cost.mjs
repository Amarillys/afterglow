// Exploratory: convolver render cost vs impulse length (same (1 - t/6.5)^3.2 shape, truncated).
// Usage: node test-scripts/verb-cost.mjs [rounds]
import { launch, pageUrl, sleep } from "./cdp.mjs";

const ROUNDS = +(process.argv[2] || 2);
const b = await launch({ port: 9345 });
const ctxs = [];
b.on("WebAudio.contextCreated", (p) => p.context.contextType === "realtime" && ctxs.push(p.context.contextId));
await b.send("WebAudio.enable");
const MUTE = `for (const k of ["bell","tick","pulse","pad","pluck","chime","drop"]) Sekai.voices[k] = () => [];`;
const IR = (secs) => `(() => {
  const ctx = Sekai.audio.ctx, rate = ctx.sampleRate, len = Math.floor(rate * ${secs});
  const buf = ctx.createBuffer(2, len, rate);
  for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.min(1, i / (rate * 0.02)) * Math.pow(1 - i / (rate * 6.5), 3.2); }
  Sekai.audio.conv.buffer = buf;
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
const LENS = [6.5, 5.75, 5, 4, 3, 2, 1, 0.25];
const res = Object.fromEntries(LENS.map((l) => [l, []]));
for (let r = 0; r < ROUNDS; r++) {
  for (const L of r % 2 ? [...LENS].reverse() : LENS) {
    await b.go(pageUrl());
    await b.eval(MUTE);
    await b.click(640, 400);
    await sleep(4000);
    await b.eval(IR(L));
    await sleep(2000);
    res[L].push(await cap());
  }
}
for (const L of LENS) console.log(String(L).padEnd(6), res[L].map((x) => x.toFixed(1).padStart(5)).join("  "));
b.close();
