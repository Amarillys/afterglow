// Long-run check for audio-node / memory leaks and audio-thread load.
// Stresses the voices far harder than a person would (several sounds per second, a fast day, a dense 2x rhythm theme).
// Usage: node test-scripts/leak-check.mjs [seconds=420] [song.flac]
import { launch, pageUrl, sleep } from "./cdp.mjs";

const SECS = +(process.argv[2] || 420), song = process.argv[3] || "nerine.flac";
const b = await launch({ port: 9338 });
const ctxs = {}, live = new Map(), byType = {};
let created = 0, destroyed = 0, params = 0;
b.on("WebAudio.contextCreated", (p) => (ctxs[p.context.contextId] = p.context.contextType));
b.on("WebAudio.audioNodeCreated", ({ node }) => {
  if (ctxs[node.contextId] !== "realtime") return;
  created++;
  live.set(node.nodeId, node.nodeType);
  byType[node.nodeType] = (byType[node.nodeType] || 0) + 1;
});
b.on("WebAudio.audioNodeWillBeDestroyed", ({ nodeId }) => {
  const t = live.get(nodeId);
  if (!t) return;
  destroyed++;
  live.delete(nodeId);
  byType[t]--;
});
b.on("WebAudio.audioParamCreated", () => params++);
b.on("WebAudio.audioParamWillBeDestroyed", () => params--);
await b.send("WebAudio.enable");
await b.send("Performance.enable");

const realtime = () => Object.keys(ctxs).find((k) => ctxs[k] === "realtime");
async function render() {
  let cap = 0, n = 0, varc = 0;
  for (let i = 0; i < 5; i++) {
    const r = await b.send("WebAudio.getRealtimeData", { contextId: realtime() });
    if (r.result) (cap += r.result.realtimeData.renderCapacity), (varc += r.result.realtimeData.callbackIntervalVariance), n++;
    await sleep(200);
  }
  return { cap: +((cap / Math.max(1, n)) * 100).toFixed(1), jitterUs: +((varc / Math.max(1, n)) * 1e6).toFixed(1) };
}
const t0 = Date.now(), rows = [];
async function sample(label) {
  const m = Object.fromEntries((await b.send("Performance.getMetrics")).result.metrics.map((x) => [x.name, x.value]));
  const r = await render();
  const row = { t: Math.round((Date.now() - t0) / 1000), label, liveNodes: live.size, created, params, renderPct: r.cap, jitterUs: r.jitterUs,
    heapMB: +(m.JSHeapUsedSize / 1048576).toFixed(1), dom: m.Nodes, listeners: m.JSEventListeners };
  rows.push(row);
  console.log(JSON.stringify(row));
}
const gc = async () => {
  await b.send("HeapProfiler.collectGarbage");
  await sleep(1500);
};
const top = () => Object.entries(byType).filter(([, n]) => n > 0).sort((a, z) => z[1] - a[1]).slice(0, 6).map(([k, n]) => k + ":" + n).join(" ");

await b.go(pageUrl("?day=120"));
await b.click(640, 400);
await sleep(3000);
await b.eval(`window.__stress = setInterval(() => {
  const S = Sekai, V = S.voices, t = S.audio.ctx.currentTime + 0.01, f = S.music.freq(Math.floor(Math.random() * 19));
  [V.bell, V.drop, V.pluck, V.chime][Math.floor(Math.random() * 4)](t, f, { pan: Math.random() * 2 - 1, vel: 0.5 });
  if (Math.random() < 0.15) { const a = V.arc(f, 0); a.set(f * 1.5, 0.3, 0.6); setTimeout(() => a.release(), 600 + Math.random() * 900); }
  if (Math.random() < 0.05) S.conductor.strum();
}, 500)`);
await sample("start");

const half = SECS * 0.45;
while ((Date.now() - t0) / 1000 < half) {
  await sleep(18000);
  await sample("world+taps");
}
await gc();
await sample("world after GC");
const mark = { live: live.size, types: { ...byType } };

await b.upload("#music-file", song);
for (let i = 0; i < 40 && !(await b.eval("Sekai.reference.state === 'playing'")); i++) await sleep(250);
await b.eval("Sekai.reference.set({ mult: 2, density: 'dense' })");
while ((Date.now() - t0) / 1000 < SECS - 25) {
  await sleep(18000);
  await sample("theme 2x dense");
}
await b.eval("clearInterval(__stress); Sekai.reference.stop()");
await sleep(15000);
await gc();
await sample("end after GC");

const grew = Object.keys(byType).filter((k) => byType[k] - (mark.types[k] || 0) > 20).map((k) => k + " +" + (byType[k] - (mark.types[k] || 0)));
console.log("live node types at end:", top() || "(none)");
console.log("types grown >20 since mid-run GC:", grew.join(", ") || "none");
console.log("--- page logs ---\n" + (b.logs.join("\n") || "(none)"));
b.close();
