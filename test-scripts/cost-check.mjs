// Audio-thread cost (WebAudio renderCapacity) of the fixed graph, piece by piece, and of bursts of voices.
// Every case runs on a fresh page with all one-shot voices muted from before entry, so no earlier pad or
// reverb tail leaks into the measurement. Each case runs ROUNDS times; the median and the spread are printed.
// Headless numbers are only good for comparing; a real sound card gives different absolute values.
// Process-tree CPU is printed as well, because the convolver does most of a long reverb on a background thread.
// Usage: node test-scripts/cost-check.mjs [rounds] [only-cases-containing]
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { launch, pageUrl, sleep } from "./cdp.mjs";

const ROUNDS = +(process.argv[2] || 2);
const ONLY = process.argv[3] || "";
const b = await launch({ port: 9339 });
const ctxs = [];
b.on("WebAudio.contextCreated", (p) => p.context.contextType === "realtime" && ctxs.push(p.context.contextId));
await b.send("WebAudio.enable");
const MUTE = `window.__orig = {}; for (const k of ["bell","tick","pulse","pad","pluck","chime","drop"]) { __orig[k] = Sekai.voices[k]; Sekai.voices[k] = () => []; }`;

// CPU seconds of the whole browser process tree: also sees the audio thread and the convolver's background thread
const PS = resolve(import.meta.dirname, "tree-cpu.ps1");
const treeCpu = () => +execFileSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", PS, String(b.pid)], { encoding: "utf8" }).trim();

// [render capacity %, process-tree CPU % of one core]
async function cap(secs = 6) {
  const id = ctxs[ctxs.length - 1];
  const v = [];
  const c0 = treeCpu(), w0 = performance.now();
  for (let i = 0; i < secs * 4; i++) {
    const r = await b.send("WebAudio.getRealtimeData", { contextId: id });
    if (r.result) v.push(r.result.realtimeData.renderCapacity * 100);
    await sleep(250);
  }
  const cpu = ((treeCpu() - c0) / ((performance.now() - w0) / 1000)) * 100;
  return [v.length ? v.reduce((a, x) => a + x, 0) / v.length : NaN, cpu];
}
async function fresh(pre = "") {
  await b.go(pageUrl());
  await b.eval(MUTE + pre);
  await b.click(640, 400);
  await sleep(6000);
}
const every = (ms, call) => `window.__b = setInterval(() => { const t = Sekai.audio.ctx.currentTime + 0.01; ${call} }, ${ms})`;
const deg = "Sekai.music.freq(5 + Math.floor(Math.random() * 12))";
const pan = "pan: Math.random() - 0.5";
const bells = (ms) => every(ms, `__orig.bell(t, ${deg}, { vel: 0.3, ${pan} });`);

// [label, setup after entry, settle ms, setup before entry]
const AU = "Sekai.audio";
const CASES = [
  ["fixed graph (tide, reverb, echo)", "", 1000],
  ["  tide off", "", 1000, "Sekai.voices.tide = () => [];"],
  ["  reverb off (convolver cut)", `${AU}.conv.disconnect()`, 1000],
  ["  echo off (loop output cut)", `${AU}.echo.disconnect(); ${AU}.echoOut.disconnect()`, 1000],
  ["  tide, reverb, echo off", `${AU}.conv.disconnect(); ${AU}.echo.disconnect(); ${AU}.echoOut.disconnect()`, 1000, "Sekai.voices.tide = () => [];"],
  ["  limiter bypassed", `${AU}.master.disconnect(); ${AU}.master.connect(${AU}.ctx.destination)`, 1000],
  ["  bus cut (compressors only)", `${AU}.bus.disconnect()`, 1000],
  ["empty AudioContext", `${AU}.ctx.suspend(); window.__empty = new AudioContext()`, 1500],
  ["+ pad, tick, pulse (world rhythm)", "for (const k of ['pad', 'tick', 'pulse']) Sekai.voices[k] = __orig[k]", 12000],
  ["+ 5 bells/s", bells(200), 6000],
  ["+ 15 bells/s", bells(67), 6000],
  ["+ 15 drops/s", every(67, `__orig.drop(t, ${deg}, { vel: 0.3, near: Math.random(), ${pan} });`), 6000],
  ["+ 15 chimes/s", every(67, `__orig.chime(t, ${deg}, { vel: 0.3, ${pan} });`), 6000],
  ["+ 15 bells/s, stopped 8s", bells(67) + "; setTimeout(() => clearInterval(__b), 6000)", 14000],
].filter(([l]) => l.includes(ONLY));

const res = new Map(CASES.map(([l]) => [l, []]));
for (let r = 0; r < ROUNDS; r++) {
  for (const [label, setup, settle, pre] of r % 2 ? [...CASES].reverse() : CASES) {
    await fresh(pre);
    if (setup) await b.eval(setup);
    await sleep(settle);
    res.get(label).push(await cap());
    await b.eval("window.__b && clearInterval(__b); window.__empty && __empty.close()");
  }
}
const med = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
const fmt = (v) => (med(v).toFixed(1) + "%").padStart(6) + "  [" + v.map((x) => x.toFixed(1)).join(", ") + "]";
console.log("case".padEnd(34), "render capacity".padEnd(26), "process-tree CPU (% of a core)");
for (const [label, v] of res) {
  console.log(label.padEnd(34), fmt(v.map((x) => x[0])).padEnd(26), fmt(v.map((x) => x[1])));
}
console.log("--- page logs ---\n" + (b.logs.join("\n") || "(none)"));
b.close();
