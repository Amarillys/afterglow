// Browser integration: hidden-frame cleanup and recovery after a real main-thread scheduler pause.
// Usage: node test-scripts/recovery-smoke.mjs
import assert from "node:assert/strict";
import { launch, pageUrl, sleep } from "./cdp.mjs";
const b = await launch({ port: 9346 });
try {
  // A synthetic theme only inside this page; preserve the test profile's saved theme library.
  const fixture = { order: ["recovery"], active: "recovery", items: { recovery: { name: "recovery fixture",
    theme: { v: 1, spb: 0.5, bpm: 120, fit: 2, downbeat: 0, dur: 32,
      key: { root: 0, tonic: 2, minor: false }, energy: Array(64).fill(0.5),
      notes: Array.from({ length: 64 }, (_, i) => ({ t: i * 0.5, lane: i % 4, s: 0.8 })) } } } };
  await b.send("Page.addScriptToEvaluateOnNewDocument", { source: `
    const get = Storage.prototype.getItem, set = Storage.prototype.setItem;
    Storage.prototype.getItem = function (k) { return k === 'chiyo-sekai-themes' ? ${JSON.stringify(JSON.stringify(fixture))} : get.call(this, k); };
    Storage.prototype.setItem = function (k, v) { if (k !== 'chiyo-sekai-themes') set.call(this, k, v); };
    const interval = window.setInterval;
    window.setInterval = function (fn, ms, ...args) {
      const id = interval(fn, ms, ...args);
      if (ms === 50 && fn.name === 'tick') window.__scheduler = { fn, id };
      return id;
    };` });
  await b.go(pageUrl());
  await b.eval(`(() => {
    const S = Sekai, draw = S.sky.draw, hit = S.fx.laneHit, pad = S.voices.pad;
    window.__probe = { draws: 0, hits: 0, pads: [], chords: [] };
    S.sky.draw = function (...a) { __probe.draws++; return draw.apply(this, a); };
    S.fx.laneHit = function (...a) { __probe.hits++; return hit.apply(this, a); };
    S.voices.pad = function (...a) { __probe.pads.push({ t: a[0], now: S.audio.ctx.currentTime }); return pad.apply(this, a); };
    S.on('chord', c => __probe.chords.push({ t: c.t, now: S.audio.ctx.currentTime }));
  })()`);
  await b.click(640, 400);
  await sleep(3000);
  assert.equal(await b.eval("Sekai.reference.state"), "playing");
  await b.eval(`Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
    __probe.draws = __probe.hits = 0;
    const heard = Sekai.audio.heard();
    for (let i = 0; i < 1000; i++) Sekai.emit('note', { t: heard - 100 - i, lane: i % 4 });
    for (let i = 0; i < 4; i++) Sekai.emit('note', { t: heard + 30, lane: i });`);
  await sleep(1100);
  const hidden = await b.eval("({ notes: Sekai.floor.noteCount(), draws: __probe.draws, hits: __probe.hits })");
  assert.ok(hidden.notes >= 4 && hidden.notes < 30, JSON.stringify(hidden));
  assert.equal(hidden.draws, 0);
  assert.equal(hidden.hits, 0);
  console.log("hidden cleanup:", JSON.stringify(hidden));
  await b.eval("delete document.hidden; document.dispatchEvent(new Event('visibilitychange'))");
  await sleep(500);
  assert.ok(await b.eval("__probe.draws > 0"));

  // Pause only the JS scheduler: the actual AudioContext clock and renderer keep running.
  await b.eval("clearInterval(__scheduler.id)");
  await sleep(15000);
  const recovery = await b.eval(`(() => {
    __probe.pads = []; __probe.chords = [];
    __scheduler.fn();
    __scheduler.id = setInterval(__scheduler.fn, 50);
    const C = Sekai.conductor, now = Sekai.audio.ctx.currentTime;
    const expected = Math.floor((now + 0.5 - C.grid().t0) / 8) % C.PROG.length;
    return { state: Sekai.audio.ctx.state, pads: __probe.pads, chords: __probe.chords,
      harmony: C.chordAt(now).name, expectedHarmony: C.PROG[expected].name };
  })()`);
  assert.equal(recovery.state, "running");
  assert.ok(recovery.pads.length <= 1, JSON.stringify(recovery));
  assert.ok(recovery.pads.every(p => p.t >= p.now));
  assert.ok(recovery.chords.every(c => c.t > c.now - 0.05));
  assert.equal(recovery.harmony, recovery.expectedHarmony);
  await sleep(2000);
  assert.deepEqual(b.logs, []);
  console.log("scheduler recovery:", JSON.stringify(recovery));
  console.log("PASS: hidden cleanup runs without drawing, future notes survive, browser recovery has no expired pads or errors");
} finally { b.close(); }
