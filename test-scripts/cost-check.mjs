// Audio-thread cost (WebAudio renderCapacity) of the fixed graph, piece by piece, and of bursts of voices.
// Headless numbers are only good for comparing; a real sound card gives different absolute values.
// Usage: node test-scripts/cost-check.mjs
import { launch, pageUrl, sleep } from "./cdp.mjs";

const b = await launch({ port: 9339 });
const ctxs = [];
b.on("WebAudio.contextCreated", (p) => p.context.contextType === "realtime" && ctxs.push(p.context.contextId));
await b.send("WebAudio.enable");
const MUTE = `window.__orig = {}; for (const k of ["bell","tick","pulse","pad","pluck","chime","drop"]) { __orig[k] = Sekai.voices[k]; Sekai.voices[k] = () => []; }`;

async function cap(label, secs = 6) {
  const id = ctxs[ctxs.length - 1];
  let s = 0, n = 0;
  for (let i = 0; i < secs * 4; i++) {
    const r = await b.send("WebAudio.getRealtimeData", { contextId: id });
    if (r.result) (s += r.result.realtimeData.renderCapacity), n++;
    await sleep(250);
  }
  console.log(label.padEnd(34), n ? ((s / n) * 100).toFixed(1) + "%" : "n/a");
}
async function fresh() {
  await b.go(pageUrl());
  await b.click(640, 400);
  await sleep(4000);
  await b.eval(MUTE);
  await sleep(12000);
}

await fresh();
await cap("fixed graph (tide, reverb, echo)");
await b.eval("Sekai.audio.verb.disconnect()");
await cap("  reverb cut");
await b.eval("Sekai.audio.echo.disconnect()");
await cap("  + echo cut");
await b.eval("Sekai.audio.bus.disconnect()");
await cap("  + tide cut (compressors only)");
await b.eval("window.__empty = new AudioContext()");
await sleep(1500);
await cap("empty AudioContext");
await b.eval("__empty.close()");

await fresh();
const burst = (rate) => `window.__b = setInterval(() => { const t = Sekai.audio.ctx.currentTime + 0.01;
  __orig.bell(t, Sekai.music.freq(5 + Math.floor(Math.random() * 12)), { vel: 0.3, pan: Math.random() - 0.5 }); }, ${1000 / rate})`;
await cap("fixed graph again");
await b.eval(burst(5));
await sleep(5000);
await cap("+ 5 bells/s");
await b.eval("clearInterval(__b)");
await b.eval(burst(15));
await sleep(5000);
await cap("+ 15 bells/s");
await b.eval("clearInterval(__b)");
await sleep(6000);
await cap("bells stopped 6s");
console.log("--- page logs ---\n" + (b.logs.join("\n") || "(none)"));
b.close();
