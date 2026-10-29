// Run Sekai.analyze on a song in headless Edge and print the theme summary.
// Usage: node test-scripts/analyze-check.mjs [song.flac]
import { launch, pageUrl, sleep } from "./cdp.mjs";

const song = process.argv[2] || "nerine.flac";
const b = await launch({ port: 9335 });
await b.go(pageUrl());
await b.click(640, 400);
await sleep(500);
await b.eval(`(() => {
  const inp = document.createElement("input");
  inp.type = "file";
  inp.id = "probe";
  document.body.appendChild(inp);
  window.__an = { state: "wait" };
  inp.onchange = async () => {
    try {
      const t0 = performance.now();
      const buf = await Sekai.audio.ctx.decodeAudioData(await inp.files[0].arrayBuffer());
      const t1 = performance.now();
      const th = await Sekai.analyze(buf);
      __an = { state: "done", decodeMs: Math.round(t1 - t0), analyzeMs: Math.round(performance.now() - t1), th };
    } catch (e) { __an = { state: "error", msg: String(e) }; }
  };
})()`);
await b.upload("#probe", song);
let r;
for (let i = 0; i < 120; i++) {
  await sleep(500);
  r = await b.eval("__an");
  if (r.state !== "wait") break;
}
if (r.state === "done") {
  const { th } = r;
  const lanes = [0, 1, 2, 3].map((l) => th.notes.filter((n) => n.lane === l).length);
  console.log(JSON.stringify({ decodeMs: r.decodeMs, analyzeMs: r.analyzeMs, dur: th.dur, bpm: th.bpm, downbeat: th.downbeat, fit: th.fit,
    key: th.key, gain: th.gain, notes: th.notes.length, lanes, accents: th.notes.filter((n) => n.acc).length,
    first: th.notes.slice(0, 6), energy: th.energy.length, json: JSON.stringify(th).length }, null, 1));
} else console.log(JSON.stringify(r));
console.log("--- page logs ---\n" + (b.logs.join("\n") || "(none)"));
b.close();
