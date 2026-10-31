// Deterministic regressions for hidden-note retention and scheduler recovery; no browser or audio file needed.
// Usage: node test-scripts/recovery-check.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
const source = (name) => readFileSync(new URL("../js/" + name + ".js", import.meta.url), "utf8");

function world({ theme = true, mult = 1, minor = false, empty = false } = {}) {
  const callbacks = [], pads = [], chords = [], notes = [], hits = [];
  const song = { v: 1, spb: 0.5, bpm: 120, fit: 2, downbeat: 0, dur: 32,
    key: { root: 3, tonic: 5, minor }, energy: Array(64).fill(0.5),
    notes: empty ? [] : Array.from({ length: 64 }, (_, i) => ({ t: i * 0.5, lane: i % 4, s: 0.8 })) };
  const store = { order: ["fixture"], active: theme ? "fixture" : null,
    items: { fixture: { name: "fixture", theme: song, prefs: { mult, density: "dense" } } } };
  const math = Object.create(Math);
  math.random = () => 0.2;
  const context = vm.createContext({ window: {}, location: { search: "" }, URLSearchParams, Math: math,
    localStorage: { getItem: () => JSON.stringify(store), setItem() {} }, setInterval: (fn) => callbacks.push(fn) });
  vm.runInContext(source("core"), context);
  const S = context.window.Sekai;
  Object.assign(S, {
    audio: { ready: true, ctx: { currentTime: 100 } },
    voices: { tide: () => [], pad: (t, chord, dur) => { pads.push({ t, chord: chord.name, dur }); return []; },
      bell() {}, tick() {}, pulse() {} },
    mood: { mix: () => ({ calm: 1 / 3, gentle: 1 / 3, drive: 1 / 3 }) },
    time: { daylight: 1, night: 0, elapsed: 100 }, questions: { busy: () => false },
    fx: { laneHit: (...args) => hits.push(args) },
  });
  for (const file of ["audio/reference", "audio/conductor", "scene/floor"]) vm.runInContext(source(file), context);
  S.on("chord", (c) => chords.push({ t: c.t, name: c.chord.name }));
  S.on("note", (n) => notes.push({ ...n }));
  S.conductor.start();
  S.reference.resume();
  context.tick = callbacks[0];
  const tick = (t, bounded = false) => {
    S.audio.ctx.currentTime = t;
    if (bounded) vm.runInContext("tick()", context, { timeout: 1000 });
    else callbacks[0]();
  };
  const clear = () => { pads.length = chords.length = notes.length = 0; };
  tick(100);
  return { S, pads, chords, notes, hits, tick, clear };
}

// A pause must not replay elapsed chords, restart the progression, or duplicate already scheduled events.
for (const mult of [0.5, 1, 2]) for (const minor of [false, true]) {
  const reference = world({ mult, minor });
  for (let i = 1; i <= 12400; i++) reference.tick(100 + i * 0.05);
  const expected = reference.chords.filter((c) => c.t > 699.95);
  const resumed = world({ mult, minor });
  resumed.clear();
  resumed.tick(700);
  assert.ok(resumed.pads.length <= 1, "a ten-minute pause must not construct expired pads");
  assert.ok(resumed.pads.every((p) => p.t >= 700), "recovered pads start with a fresh fade-in");
  assert.ok(resumed.notes.every((n) => n.t > 699.95), "missed notes are skipped");
  for (let i = 1; i <= 400; i++) resumed.tick(700 + i * 0.05);
  assert.deepEqual(resumed.chords, expected, "recovery preserves chord times and progression");
  const counts = [resumed.pads.length, resumed.notes.length];
  resumed.tick(720);
  assert.deepEqual([resumed.pads.length, resumed.notes.length], counts, "same-time ticks do not replay notes");
}

// At a nearly due chord, the nominal pad pre-roll is in the past; it must fade in instead of jumping in.
const late = world();
late.clear();
late.tick(109.79);
assert.equal(late.chords.length, 1);
assert.ok(Math.abs(late.chords[0].t - 109.8) < 1e-6);
assert.ok(late.pads[0].t >= 109.8);

// If the next chord is outside lookahead, harmony still follows the current (skipped) chord without sounding it.
const harmony = world();
harmony.clear();
harmony.tick(160);
assert.equal(harmony.pads.length, 0);
assert.equal(harmony.S.conductor.chord.name, "Asus4");
assert.equal(harmony.S.conductor.chordAt(160).name, "Asus4");
assert.equal(harmony.S.conductor.chord.bass, 48, "seeking preserves the theme's transposition");

// Exact cutoff, empty themes, day-long pauses, and world mode must all remain bounded.
for (const options of [{}, { empty: true }, { theme: false }]) {
  const w = world(options);
  w.clear();
  w.tick(86500, true);
  assert.ok(w.pads.length <= 1);
  assert.ok(w.pads.every((p) => p.t >= 86500));
  assert.ok(w.notes.every((n) => n.t > 86499.95));
}
const boundary = world();
boundary.clear();
boundary.tick(109.85);
assert.equal(boundary.chords.length, 0, "a chord at the expired cutoff is skipped");

// Tempo/density edits retain their scheduled frontier, even if a pause immediately follows.
const runChange = (pause) => {
  const w = world({ minor: true });
  for (let i = 1; i <= 400; i++) w.tick(100 + i * 0.05);
  w.S.reference.set({ mult: 2, density: "calm" });
  w.clear();
  if (pause) w.tick(180);
  else for (let i = 1; i <= 1200; i++) w.tick(120 + i * 0.05);
  for (let i = 1; i <= 400; i++) w.tick(180 + i * 0.05);
  return w.chords.filter((c) => c.t > 179.95);
};
assert.deepEqual(runChange(true), runChange(false));

// Use heard time, not the ahead-of-speakers audio clock; preserve future and out-of-order notes.
const w = world({ theme: false });
w.S.floor.update(1000, false);
for (const t of [10.2, 9.7, 10, 11, 9.9]) w.S.emit("note", { t, lane: 0, motif: false });
w.S.audio.ctx.currentTime = 1000;
w.S.floor.update(10, true);
assert.equal(w.S.floor.noteCount(), 2);
assert.equal(w.hits.length, 2);
w.S.floor.update(10, true);
assert.equal(w.hits.length, 2, "each note flashes at most once");
w.S.floor.update(10.2, false);
assert.equal(w.S.floor.noteCount(), 1);
assert.equal(w.hits.length, 2, "hidden notes never produce hit effects");
w.S.floor.update(12, true);
assert.equal(w.S.floor.noteCount(), 0);
assert.equal(w.hits.length, 2, "stale notes do not flash on return");

// One hour at eight notes/s, with cleanup at ~3 Hz, retains only the upcoming lookahead window.
let maxNotes = 0;
for (let i = 0; i < 28800; i++) {
  const now = 1000 + i / 8;
  w.S.emit("note", { t: now + 4.4, lane: i % 4, motif: false });
  if (i % 3 === 0) w.S.floor.update(now, false);
  maxNotes = Math.max(maxNotes, w.S.floor.noteCount());
}
assert.ok(maxNotes <= 39, "hidden notes remain bounded across an hour");
w.S.floor.update(5000, false);
assert.equal(w.S.floor.noteCount(), 0);
assert.equal(w.hits.length, 2);
console.log("PASS: normal/recovered chord progression, tempo changes, late fade-in, cutoff and empty themes");
console.log("PASS: heard-clock cleanup, no hidden/stale flashes, one hour of dense notes; peak queue =", maxNotes);
