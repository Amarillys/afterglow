// Reference music: load a song through the panel, check it drives the track, then return to the world's own music.
// Usage: node test-scripts/smoke-ref.mjs [song.flac]
import { launch, pageUrl, sleep } from "./cdp.mjs";

const song = process.argv[2] || "nerine.flac";
const W = 1280, H = 800;
const b = await launch({ width: W, height: H, port: 9336 });
await b.go(pageUrl());
await b.click(W / 2, H / 2);
await sleep(6000);
await b.eval(`(() => {
  const A = Sekai.audio, an = A.ctx.createAnalyser(), buf = new Float32Array(2048);
  an.fftSize = 2048;
  A.limit.connect(an);
  window.__lv = { peak: 0, sum: 0, n: 0 };
  window.__ref = 0;
  Sekai.on("note", (n) => n.ref && __ref++);
  setInterval(() => {
    an.getFloatTimeDomainData(buf);
    let p = 0, s = 0;
    for (const v of buf) { p = Math.max(p, Math.abs(v)); s += v * v; }
    __lv.peak = Math.max(__lv.peak, p); __lv.sum += Math.sqrt(s / buf.length); __lv.n++;
  }, 50);
})()`);
const level = async (label) => console.log("level", label, JSON.stringify(await b.eval(
  `(() => { const o = { peak: +__lv.peak.toFixed(3), rms: +(__lv.sum / Math.max(1, __lv.n)).toFixed(4) }; __lv = { peak: 0, sum: 0, n: 0 }; return o; })()`)));
const state = () => b.eval(`({ st: Sekai.reference.state, info: Sekai.reference.info(), root: Sekai.music.root, grid: Sekai.conductor.grid(),
  quiet: +Sekai.conductor.quietAt().toFixed(2), now: +Sekai.audio.ctx.currentTime.toFixed(2), refNotes: __ref })`);
const waitFor = async (expr, ms) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms && !(await b.eval(expr))) await sleep(200);
  return Date.now() - t0;
};

await sleep(3000);
await level("world before song");
await b.eval("document.getElementById('btn-music').click()");
await b.upload("#music-file", song);
console.log("analysis + start ms:", await waitFor("Sekai.reference.state === 'playing'", 60000));
console.log("song audible after ms:", await waitFor("Sekai.conductor.grid() && Sekai.audio.heard() > Sekai.conductor.grid().t0", 15000));
const s1 = await state();
console.log("playing:", JSON.stringify(s1));
await level("analysis + hush gap");
await sleep(8000);
await b.shot("ref-01-playing");
await level("song playing (calm)");
const s2 = await state();
console.log("world silent while song plays:", s2.quiet === s1.quiet, "| ref notes so far:", s2.refNotes, "| music root:", s2.root);

await b.eval("Sekai.reference.set({ density: 'dense' })");
await b.key("KeyD", "d");
await b.key("Space", " ");
await sleep(3000);
await b.shot("ref-02-dense");
console.log("dense:", JSON.stringify((await state()).info));
await b.eval("Sekai.reference.set({ density: 'calm', mult: 0.5 })");
console.log("x1/2 grid:", JSON.stringify((await state()).grid));

await b.eval("Sekai.reference.stop()");
await sleep(9000);
const s3 = await state();
console.log("after stop:", JSON.stringify({ st: s3.st, root: s3.root, grid: s3.grid, quietMovedOn: s3.quiet > s2.quiet }));
await b.shot("ref-03-after");
await level("after stop");

await b.upload("#music-file", song);
console.log("cached reload ms:", await waitFor("Sekai.reference.state === 'playing'", 20000), JSON.stringify((await state()).info));
await b.eval("Sekai.reference.stop()");
console.log("--- page logs ---\n" + (b.logs.join("\n") || "(none)"));
b.close();
