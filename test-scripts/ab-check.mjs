// A/B audio-thread load: the last commit (extracted with git archive) against the working tree, alternating,
// under the same dense load (2x dense rhythm theme plus leak-check's random taps). Measured with drawing on
// and with the page hidden (no canvas work competing with the audio thread).
// Usage: node test-scripts/ab-check.mjs [rounds=3] [song.flac] [ref=HEAD]
import { execSync } from "node:child_process";
import { mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { launch, sleep } from "./cdp.mjs";

const ROUNDS = +(process.argv[2] || 3), song = process.argv[3] || "nerine.flac", REF = process.argv[4] || "HEAD";
const ROOT = resolve(import.meta.dirname, "..");
const OLD = resolve(ROOT, "test-scripts/.ab", execSync(`git rev-parse --short ${REF}`, { cwd: ROOT }).toString().trim());
if (!existsSync(OLD)) {
  mkdirSync(OLD, { recursive: true });
  execSync(`git archive ${REF} | tar -x -C "${OLD.replace(/\\/g, "/")}"`, { cwd: ROOT, shell: "bash" });
}
const SIDES = { [REF]: OLD, working: ROOT };
const url = (root) => pathToFileURL(resolve(root, "index.html")).href + "?day=120";

const b = await launch({ port: 9349 });
const ctxs = [];
b.on("WebAudio.contextCreated", (p) => p.context.contextType === "realtime" && ctxs.push(p.context.contextId));
await b.send("WebAudio.enable");
const STRESS = `window.__stress = setInterval(() => {
  const S = Sekai, V = S.voices, t = S.audio.ctx.currentTime + 0.01, f = S.music.freq(Math.floor(Math.random() * 19));
  [V.bell, V.drop, V.pluck, V.chime][Math.floor(Math.random() * 4)](t, f, { pan: Math.random() * 2 - 1, vel: 0.5 });
  if (Math.random() < 0.15) { const a = V.arc(f, 0); a.set(f * 1.5, 0.3, 0.6); setTimeout(() => a.release(), 600 + Math.random() * 900); }
  if (Math.random() < 0.05) S.conductor.strum();
}, 500)`;
const HIDE = `Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
  document.dispatchEvent(new Event("visibilitychange"))`;
const playing = () => b.eval("Sekai.reference.state === 'playing'");

async function load(root, hidden) {
  await b.go(url(root));
  await b.click(640, 400);
  for (let i = 0; i < 40 && !(await playing()); i++) await sleep(250);
  if (!(await playing())) {
    await b.upload("#music-file", song);
    for (let i = 0; i < 80 && !(await playing()); i++) await sleep(250);
  }
  await b.eval("Sekai.reference.set({ mult: 2, density: 'dense' })");
  await b.eval(STRESS);
  if (hidden) await b.eval(HIDE);
}
async function cap(secs) {
  const id = ctxs[ctxs.length - 1];
  const v = [];
  for (let i = 0; i < secs * 4; i++) {
    const r = await b.send("WebAudio.getRealtimeData", { contextId: id });
    if (r.result) v.push(r.result.realtimeData.renderCapacity * 100);
    await sleep(250);
  }
  return v.reduce((a, x) => a + x, 0) / v.length;
}

const res = {};
for (let r = 0; r < ROUNDS; r++) {
  for (const hidden of [false, true]) {
    const names = r % 2 ? Object.keys(SIDES).reverse() : Object.keys(SIDES);
    for (const name of names) {
      await load(SIDES[name], hidden);
      await sleep(8000);
      const v = await cap(20);
      const key = name + (hidden ? " hidden" : " drawn");
      (res[key] ||= []).push(v);
      console.log(`round ${r + 1}`, key.padEnd(16), v.toFixed(1) + "%", "playing:", await playing());
    }
  }
}
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
console.log("--- render capacity, mean of rounds ---");
for (const [k, v] of Object.entries(res)) console.log(k.padEnd(16), mean(v).toFixed(1) + "%", "[" + v.map((x) => x.toFixed(1)).join(", ") + "]");
console.log("--- page logs ---\n" + (b.logs.join("\n") || "(none)"));
b.close();
