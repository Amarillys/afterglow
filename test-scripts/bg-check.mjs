// Real background tab (another tab activated, no faked document.hidden), no forced GC:
// does the audio graph grow, and does render load / heap creep up while the page sits in the background?
// Usage: node test-scripts/bg-check.mjs [seconds=600] [query]
import { launch, pageUrl, sleep } from "./cdp.mjs";

const SECS = +(process.argv[2] || 600), query = process.argv[3] || "";
const b = await launch({ port: 9341 });
await b.send("Emulation.setFocusEmulationEnabled", { enabled: false });
const ctxs = {}, live = new Map(), byType = {};
b.on("WebAudio.contextCreated", (p) => (ctxs[p.context.contextId] = p.context.contextType));
b.on("WebAudio.audioNodeCreated", ({ node }) => {
  if (ctxs[node.contextId] !== "realtime") return;
  live.set(node.nodeId, node.nodeType);
  byType[node.nodeType] = (byType[node.nodeType] || 0) + 1;
});
b.on("WebAudio.audioNodeWillBeDestroyed", ({ nodeId }) => {
  const t = live.get(nodeId);
  if (!t) return;
  live.delete(nodeId);
  byType[t]--;
});
await b.send("WebAudio.enable");
await b.send("Performance.enable");
const realtime = () => Object.keys(ctxs).find((k) => ctxs[k] === "realtime");

async function sample(label) {
  let cap = 0, n = 0, maxCap = 0;
  for (let i = 0; i < 5; i++) {
    const r = await b.send("WebAudio.getRealtimeData", { contextId: realtime() });
    if (r.result) (cap += r.result.realtimeData.renderCapacity), (maxCap = Math.max(maxCap, r.result.realtimeData.renderCapacity)), n++;
    await sleep(200);
  }
  const m = Object.fromEntries((await b.send("Performance.getMetrics")).result.metrics.map((x) => [x.name, x.value]));
  const st = JSON.parse(await b.eval(`JSON.stringify({ vis: document.visibilityState, hour: +Sekai.time.hour.toFixed(2),
    ticks: __ticks, frames: __frames, stats: Sekai.audio.ctx.playbackStats ? { u: Sekai.audio.ctx.playbackStats.underrunEvents,
    ms: +(Sekai.audio.ctx.playbackStats.underrunDuration * 1000).toFixed(1) } : null })`));
  const top = Object.entries(byType).filter(([, k]) => k > 0).sort((a, z) => z[1] - a[1]).slice(0, 5).map(([k, v]) => k.replace("Node", "") + ":" + v).join(" ");
  console.log(JSON.stringify({ t: Math.round((Date.now() - t0) / 1000), label, ...st, liveNodes: live.size,
    renderPct: +((cap / Math.max(1, n)) * 100).toFixed(1), heapMB: +(m.JSHeapUsedSize / 1048576).toFixed(1), top }));
  await b.eval("__ticks = 0; __frames = 0");
}

await b.go(pageUrl(query));
await b.eval(`window.__ticks = 0; window.__frames = 0;
  const si = window.setInterval; window.setInterval = (f, ms, ...a) => si(() => { if (ms === 50) __ticks++; f(...a); }, ms, ...a);
  const st = Sekai.time.update; Sekai.time.update = function () { __frames++; return st.apply(this, arguments); };`);
await b.click(640, 400);
await sleep(4000);
await b.eval("Sekai.reference.stop()");
const t0 = Date.now();
await sample("visible");

const tgt = await b.send("Target.createTarget", { url: "about:blank" });
await sleep(1500);
await sample("bg?");
while ((Date.now() - t0) / 1000 < SECS) {
  await sleep(30000);
  await sample("background");
}
await b.send("Target.closeTarget", { targetId: tgt.result.targetId });
await b.send("Page.bringToFront");
await sleep(3000);
await sample("back");
await b.send("HeapProfiler.collectGarbage");
await sleep(3000);
await sample("after GC");
console.log("--- page logs ---\n" + (b.logs.join("\n") || "(none)"));
b.close();
