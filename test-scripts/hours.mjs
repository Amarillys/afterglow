// Palette check: enter the world at several hours and screenshot each; also captures a sky-tap burst.
// Usage: node test-scripts/hours.mjs [hour ...]
import { launch, pageUrl, sleep } from "./cdp.mjs";

const W = 1280, H = 800;
const hours = process.argv.slice(2).map(Number);
const b = await launch({ width: W, height: H, port: 9334 });
for (const h of hours.length ? hours : [5.5, 9, 12.5, 17.6, 19, 23]) {
  await b.go(pageUrl("?hour=" + h));
  await b.click(W / 2, H / 2);
  await sleep(3200);
  await b.click(330, 170);
  await b.click(860, 640);
  await sleep(160);
  await b.shot("hour-" + String(h).replace(".", "_"));
}
console.log("--- page logs ---\n" + (b.logs.join("\n") || "(none)"));
b.close();
