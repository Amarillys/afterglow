// Rhythm theme: a song's rhythm and key drive the world's own instruments (the song itself is never played).
// Usage: node test-scripts/smoke-ref.mjs [song.flac]
import { launch, pageUrl, sleep } from "./cdp.mjs";

const song = process.argv[2] || "nerine.flac";
const W = 1280, H = 800;
const b = await launch({ width: W, height: H, port: 9336 });
const PROBE = `(() => {
  const A = Sekai.audio, V = Sekai.voices, an = A.ctx.createAnalyser(), buf = new Float32Array(2048);
  an.fftSize = 2048;
  A.limit.connect(an);
  window.__lv = { peak: 0, sum: 0, n: 0 };
  window.__c = { bell: 0, pulse: 0, tick: 0, pad: 0, src: 0 };
  for (const k of ["bell", "pulse", "tick", "pad"]) { const f = V[k]; V[k] = function () { __c[k]++; return f.apply(this, arguments); }; }
  const cs = A.ctx.createBufferSource.bind(A.ctx);
  A.ctx.createBufferSource = () => { const s = cs(); const st = s.start.bind(s); s.start = (...a) => { if (s.buffer && s.buffer.duration > 30) __c.src++; return st(...a); }; return s; };
  setInterval(() => {
    an.getFloatTimeDomainData(buf);
    let p = 0, s = 0;
    for (const v of buf) { p = Math.max(p, Math.abs(v)); s += v * v; }
    __lv.peak = Math.max(__lv.peak, p); __lv.sum += Math.sqrt(s / buf.length); __lv.n++;
  }, 50);
})()`;
const level = async (label) => console.log("level", label, JSON.stringify(await b.eval(
  `(() => { const o = { peak: +__lv.peak.toFixed(3), rms: +(__lv.sum / Math.max(1, __lv.n)).toFixed(4) }; __lv = { peak: 0, sum: 0, n: 0 }; return o; })()`)));
const counts = async (label) => console.log("plays", label, JSON.stringify(await b.eval(
  "(() => { const o = { ...__c }; for (const k in __c) __c[k] = 0; return o; })()")));
const state = () => b.eval(`({ st: Sekai.reference.state, info: Sekai.reference.info(), root: Sekai.music.root, grid: Sekai.conductor.grid(),
  quiet: +Sekai.conductor.quietAt().toFixed(2), list: Sekai.reference.list().length })`);
const waitFor = async (expr, ms) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms && !(await b.eval(expr))) await sleep(200);
  return Date.now() - t0;
};

await b.go(pageUrl());
await b.click(W / 2, H / 2);
await sleep(500);
await b.eval(PROBE);
await sleep(8000);
await level("world");
await counts("world 8s");

await b.eval("document.getElementById('btn-music').click()");
await b.upload("#music-file", song);
console.log("analysis -> theme ms:", await waitFor("Sekai.reference.state === 'playing'", 60000));
console.log("theme starts after ms:", await waitFor("Sekai.conductor.grid() && Sekai.audio.heard() > Sekai.conductor.grid().t0 + 0.5", 20000));
const s1 = await state();
console.log("theme:", JSON.stringify(s1));
await level("handover");
await counts("handover");
await sleep(10000);
await b.shot("theme-01-calm");
await level("theme calm");
await counts("theme calm 10s");
const s2 = await state();
console.log("world scheduler silent:", s2.quiet === s1.quiet);

await b.eval("Sekai.reference.set({ mult: 0.5 })");
await sleep(8000);
await counts("theme x1/2 8s");
console.log("x1/2 grid spb:", (await state()).grid.spb.toFixed(3));
await b.eval("Sekai.reference.set({ mult: 1, density: 'dense' })");
await b.key("KeyD", "d");
await b.key("Space", " ");
await sleep(8000);
await b.shot("theme-02-dense");
await level("theme dense");
await counts("theme dense 8s");
await b.eval("Sekai.reference.set({ density: 'calm' })");

await b.eval("document.querySelector('#music-list [data-id=\"\"]').click()");
await sleep(10000);
const s3 = await state();
console.log("back to world:", JSON.stringify({ st: s3.st, root: s3.root, spb: s3.grid && s3.grid.spb, worldResumed: s3.quiet > s2.quiet, list: s3.list }));
await counts("world again 10s");

await b.eval("document.querySelector('#music-list [data-id]:not([data-id=\"\"])').click()");
console.log("pick from list ms:", await waitFor("Sekai.reference.state === 'playing'", 5000));
await b.go(pageUrl());
await b.click(W / 2, H / 2);
await sleep(1500);
console.log("after reload:", JSON.stringify(await state()));
await b.eval("Sekai.reference.stop()");
console.log("--- page logs ---\n" + (b.logs.join("\n") || "(none)"));
b.close();
