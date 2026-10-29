// Smoke test: enter the world, play a bit, check audio levels / state / errors, take screenshots.
// Usage: node test-scripts/smoke.mjs
import { launch, pageUrl, sleep } from "./cdp.mjs";

const W = 1280, H = 800;
const b = await launch({ width: W, height: H });
await b.go(pageUrl());
await sleep(800);
await b.shot("01-gate");

await b.click(W / 2, H / 2);
await sleep(300);
const tap = `(() => {
  const A = Sekai.audio, an = A.ctx.createAnalyser();
  an.fftSize = 2048;
  A.master.connect(an);
  const buf = new Float32Array(an.fftSize);
  window.__lv = { peak: 0, sum: 0, n: 0, loud: 0 };
  setInterval(() => {
    an.getFloatTimeDomainData(buf);
    let p = 0, s = 0;
    for (const v of buf) { p = Math.max(p, Math.abs(v)); s += v * v; }
    const L = window.__lv;
    L.peak = Math.max(L.peak, p); L.sum += Math.sqrt(s / buf.length); L.n++;
    if (p > 0.98) L.loud++;
  }, 50);
  return A.ctx.state + " sr=" + A.ctx.sampleRate;
})()`;
console.log("audio:", await b.eval(tap));
const level = async (label) => {
  const r = await b.eval(`(() => { const L = __lv, o = { peak: +L.peak.toFixed(3), rms: +(L.sum / Math.max(1, L.n)).toFixed(4), clipped: L.loud }; __lv = { peak: 0, sum: 0, n: 0, loud: 0 }; return o; })()`);
  console.log("level", label, JSON.stringify(r));
};

await sleep(4000);
await level("ambient 0-4s");
await b.shot("02-entered");

// sky taps, floor taps, a drag across the sky and down to the floor
for (const [x, y] of [[300, 180], [900, 250], [400, 600], [800, 720]]) {
  await b.click(x, y);
  await sleep(350);
}
const pts = [];
for (let i = 0; i <= 40; i++) pts.push([200 + i * 22, 140 + i * 14 + Math.sin(i / 4) * 40]);
await b.drag(pts, 20);
await sleep(200);
await b.shot("03-interaction");
await level("interaction");

for (const k of ["KeyA", "KeyS", "KeyD", "KeyF", "KeyQ", "KeyZ"]) {
  await b.key(k, k.slice(3).toLowerCase());
  await sleep(180);
}
await b.key("Space", " ");
await sleep(500);
await b.shot("04-keys");
await level("keys");

// a question answered by key, then a second one answered by clicking the middle card
const v = await b.eval("({ w: Sekai.view.w, h: Sekai.view.h, hy: Sekai.view.hy, jy: Sekai.view.jy })");
console.log("viewport:", JSON.stringify(v));
await b.eval("Sekai.questions.start(0)");
await sleep(5600);
await b.shot("05-question");
console.log("question:", await b.eval("document.getElementById('question').textContent"));
await b.key("Digit2", "2");
await sleep(2600);
await b.shot("06-answered");
const qState = `({ busy: Sekai.questions.busy(), text: document.getElementById('question').textContent,
  mood: localStorage.getItem('chiyo-sekai-mood'), panel: [...document.querySelectorAll('#mood .val')].map((e) => e.textContent).join('/') })`;
console.log("after key:", JSON.stringify(await b.eval(qState)));
await sleep(1000);
await b.eval("Sekai.questions.start(0)");
await sleep(5600);
const fs = Math.min(19, Math.max(13, Math.min(v.w, v.h) / 40));
await b.click(v.w / 2, v.hy + (v.jy - v.hy) * 0.92 - 10 - fs * 1.2);
await sleep(3600);
console.log("after click:", JSON.stringify(await b.eval(qState)));
await sleep(16000);
await level("t 9-42s (questions, ticks, pulse)");
await b.shot("07-later");
console.log("state:", JSON.stringify(await b.eval(`({
  ctx: Sekai.audio.ctx.state, step: Sekai.conductor.step, chord: Sekai.conductor.chord.name,
  notes: Sekai.floor.noteCount(), fx: Sekai.fx.count(), clock: Sekai.time.clock(), day: Sekai.time.day,
  hud: document.getElementById('clock-sub').textContent, memory: localStorage.getItem('chiyo-sekai'),
})`)));
console.log("--- page logs ---\n" + (b.logs.join("\n") || "(none)"));
b.close();
