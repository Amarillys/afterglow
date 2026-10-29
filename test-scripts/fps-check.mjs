// Frame rate when focused / unfocused / hidden: draws per second, world-time ticks, and CPU time per second.
// Usage: node test-scripts/fps-check.mjs
import { launch, pageUrl, sleep } from "./cdp.mjs";

const b = await launch({ port: 9337 });
await b.send("Performance.enable");
await b.go(pageUrl());
await b.click(640, 400);
await sleep(4000);
await b.eval(`(() => {
  window.__n = { draw: 0, tick: 0 };
  const d = Sekai.sky.draw, u = Sekai.time.update;
  Sekai.sky.draw = function () { __n.draw++; return d.apply(this, arguments); };
  Sekai.time.update = function () { __n.tick++; return u.apply(this, arguments); };
})()`);
const metrics = async () => Object.fromEntries((await b.send("Performance.getMetrics")).result.metrics.map((m) => [m.name, m.value]));

async function phase(label, setup, secs = 4) {
  await b.eval(setup);
  await b.eval("__n = { draw: 0, tick: 0 }; window.__h0 = Sekai.time.hours");
  const m0 = await metrics();
  await sleep(secs * 1000);
  const m1 = await metrics();
  const n = await b.eval("({ ...__n, worldMin: Math.round((Sekai.time.hours - __h0) * 60) })");
  const per = (k) => (((m1[k] - m0[k]) / secs) * 1000).toFixed(1);
  console.log(label.padEnd(10), JSON.stringify({ drawFps: +(n.draw / secs).toFixed(1), tickHz: +(n.tick / secs).toFixed(1),
    worldMinutes: n.worldMin, scriptMsPerSec: +per("ScriptDuration"), taskMsPerSec: +per("TaskDuration") }));
}

await phase("focused", "0");
await phase("blurred", `Object.defineProperty(document, "hasFocus", { configurable: true, value: () => false });
  dispatchEvent(new Event("blur"))`);
await phase("hidden", `Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
  document.dispatchEvent(new Event("visibilitychange"))`);
await phase("refocused", `delete document.hidden; delete document.hasFocus;
  document.dispatchEvent(new Event("visibilitychange")); dispatchEvent(new Event("focus"))`);
console.log("--- page logs ---\n" + (b.logs.join("\n") || "(none)"));
b.close();
