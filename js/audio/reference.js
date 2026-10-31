(function () {
  "use strict";
  const S = window.Sekai, A = S.audio, M = S.m, V = S.voices;
  const KEY = "chiyo-sekai-themes", KEEP = 6;
  const NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
  // minimum spacing (in song beats) between two hits of the same instrument
  const GAP = { note: 2, pulse: 2, tick: 1 };
  const DENSITY = { calm: 1, normal: 0.5, dense: 0.25 };
  const LANE_DEG = [8, 10, 12, 14]; // low onsets pull the bell melody down, bright ones up

  // a song the player brings is only a source of rhythm and key: the world plays it on its own instruments
  const R = (S.reference = { state: "idle", name: "", listening: false, progress: 0, error: "" });
  let store = { order: [], items: {}, active: null };
  try {
    store = Object.assign(store, JSON.parse(localStorage.getItem(KEY)) || {});
  } catch (e) {}
  let theme = null, prefs = null, seq = [], loopBeats = 16, ei = 0, loop = 0;
  let t0 = 0, lastEnd = 0, chordB = 0, chordI = 0, quiet = 0;

  const save = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(store));
    } catch (e) {}
  };
  const changed = () => S.emit("reference");
  const nameOf = (id, it) => (it && it.name) || id.split("|")[0].replace(/\.[^.]+$/, "");

  R.load = async function (file) {
    if (!A.ready || !file || R.listening) return;
    const id = file.name + "|" + file.size + "|" + file.lastModified;
    Object.assign(R, { listening: true, progress: 0, error: "" });
    changed();
    try {
      const hit = store.items[id];
      if (!hit || hit.theme.v !== S.analyze.version) {
        const buf = await A.ctx.decodeAudioData(await file.arrayBuffer());
        store.items[id] = { name: nameOf(file.name), theme: await S.analyze(buf, (p) => ((R.progress = p), changed())) };
      }
      store.order = [id].concat(store.order.filter((k) => k !== id));
      store.order.splice(KEEP).forEach((k) => delete store.items[k]);
      R.listening = false;
      R.use(id);
    } catch (e) {
      Object.assign(R, { listening: false, error: "这首曲子打不开（" + (e.name || "error") + "）" });
      changed();
    }
  };

  // switch to a saved theme; it starts once the notes already scheduled have rung out
  R.use = function (id) {
    const it = store.items[id];
    if (!A.ready || !it || (R.state === "playing" && store.active === id)) return;
    if (R.state === "playing") release();
    store.active = id;
    theme = it.theme;
    prefs = it.prefs = Object.assign({ mult: 1, density: "calm" }, it.prefs);
    save();
    R.name = nameOf(id, it);
    const now = A.ctx.currentTime;
    t0 = Math.max(now + 1.8, S.conductor.quietAt() + 1.2, quiet + 1.2);
    lastEnd = now;
    chordB = 0;
    chordI = theme.key.minor ? 1 : 0;
    build();
    seek(0);
    S.music.root = theme.key.root;
    S.conductor.hush();
    R.state = "playing";
    changed();
  };

  function release() {
    quiet = lastEnd;
    R.state = "idle";
    S.music.root = 0;
    S.conductor.hush();
  }

  R.stop = function () {
    if (R.state !== "playing") return;
    release();
    store.active = null;
    save();
    changed();
  };

  // the world's own scheduler stays quiet while a theme plays and until its last notes have rung
  R.busy = (t) => R.state === "playing" || (t ?? (A.ctx ? A.ctx.currentTime : 0)) < quiet;

  // the song's onsets as hits for bell / heartbeat / clock, in song beats from the first downbeat
  function build() {
    const spb = theme.spb, steady = theme.fit >= 1.5, k = DENSITY[prefs.density];
    const pts = theme.notes
      .map((n) => ({ b: (n.t - theme.downbeat) / spb, lane: n.lane, s: n.s }))
      .filter((n) => n.b >= 0)
      .map((n) => (steady ? { ...n, b: Math.round(n.b * 4) / 4 } : n));
    loopBeats = Math.max(16, Math.ceil((theme.dur - theme.downbeat) / spb / 16) * 16);
    const pick = (kind, from) => {
      const gap = GAP[kind] * k - 1e-6, keep = [];
      for (const n of from.slice().sort((a, b) => b.s - a.s)) if (keep.every((x) => Math.abs(x.b - n.b) >= gap)) keep.push(n);
      return keep.map((n) => ({ ...n, kind }));
    };
    const notes = pick("note", pts);
    const strong = notes.map((n) => n.s).sort((a, b) => a - b)[Math.floor(notes.length * 0.8)] ?? 1;
    notes.forEach((n) => (n.acc = n.s >= strong));
    seq = notes.concat(pick("pulse", pts.filter((n) => n.lane === 0)), pick("tick", pts.filter((n) => n.lane === 3)));
    seq.sort((a, b) => a.b - b.b);
  }

  function seek(b) {
    b = Math.max(0, b);
    loop = Math.floor(b / loopBeats);
    ei = seq.findIndex((e) => e.b >= b - loop * loopBeats);
    if (ei < 0) (ei = 0), loop++;
  }

  const spb = () => theme.spb / prefs.mult;
  const energyAt = (b) => theme.energy[Math.floor((theme.downbeat + (b % loopBeats) * theme.spb) * 2)] ?? 0.6;
  // about seven seconds per chord, whatever the song's tempo
  const chordBeats = () => 4 * 2 ** Math.max(0, Math.round(Math.log2(7 / (spb() * 4))));

  R.tick = function (now) {
    if (R.state !== "playing") return;
    const end = now + S.cfg.lookahead, p = spb(), per = chordBeats(), cutoff = now - 0.05;
    // After a stall, jump to the current beat without rebuilding expired chords or walking every missed loop.
    const first = (cutoff - t0) / p;
    if (cutoff > lastEnd) seek(first);
    const skipped = Math.max(0, Math.ceil((first - chordB) / per));
    chordB += skipped * per;
    chordI += skipped;
    if (skipped) S.conductor.chordState(t0 + (chordB - per) * p, S.conductor.PROG[(chordI - 1) % S.conductor.PROG.length]);
    for (;;) {
      const e = seq.length ? seq[ei] : null, eb = e ? e.b + loop * loopBeats : Infinity;
      const b = Math.min(chordB, eb), t = t0 + b * p;
      if (t >= end) break;
      if (chordB <= eb) {
        const chord = S.conductor.PROG[chordI++ % S.conductor.PROG.length];
        if (t > cutoff) S.conductor.chordOn(t, chord, per * p - 0.4);
        else S.conductor.chordState(t, chord);
        chordB += per;
        continue;
      }
      if (t > cutoff) fire(e, t, eb);
      if (++ei >= seq.length) (ei = 0), loop++;
    }
    lastEnd = end;
  };

  function fire(e, t, b) {
    const m = S.conductor.mood(), day = S.time.daylight, en = 0.45 + 0.55 * energyAt(b);
    const drive = 0.75 + 0.75 * m.drive, onBeat = Math.abs(b - Math.round(b)) < 0.01;
    if (e.kind === "pulse") V.pulse(t, (0.16 + 0.28 * e.s) * drive * en * (0.5 + 0.5 * day));
    else if (e.kind === "tick") {
      const high = onBeat && Math.round(b) % 2 === 0;
      V.tick(t, high, (0.06 + 0.08 * e.s) * drive * en * (0.6 + 0.4 * day), high ? -0.25 : 0.25);
    } else {
      if (S.questions.busy() && !e.acc && Math.random() < 0.5) return;
      const deg = S.conductor.melody(onBeat || e.acc, LANE_DEG[e.lane]);
      S.conductor.note(t, deg, e.acc, e.acc ? 1.4 : 1, (0.7 + 0.5 * e.s) * en);
    }
  }

  // tempo and density changes keep the beat that is about to play exactly where it was
  R.set = function (p) {
    if (!prefs) return;
    const frontier = (lastEnd - t0) / spb();
    if ("mult" in p && [0.5, 1, 2].includes(p.mult)) prefs.mult = p.mult;
    if ("density" in p && DENSITY[p.density]) prefs.density = p.density;
    save();
    if (R.state === "playing") {
      t0 = lastEnd - frontier * spb();
      build();
      seek(frontier);
    }
    changed();
  };

  // beat lines and on-beat sparkles follow the theme only when the song has a steady pulse
  R.grid = function () {
    if (R.state !== "playing" || theme.fit < 1.5) return null;
    const p = spb();
    return { t0, spb: p, bar: 4, every: p < 0.5 ? 2 : 1 };
  };

  R.info = function () {
    if (R.state !== "playing") return null;
    const k = theme.key;
    return {
      name: R.name, bpm: Math.round(theme.bpm * prefs.mult), beat: theme.fit >= 1.5, key: NAMES[k.tonic] + (k.minor ? " 小调" : " 大调"),
      dur: theme.dur, mult: prefs.mult, density: prefs.density, hits: seq.length,
    };
  };
  R.list = () => store.order.filter((id) => store.items[id]).map((id) => ({ id, name: nameOf(id, store.items[id]), bpm: Math.round(store.items[id].theme.bpm) }));
  R.active = () => (R.state === "playing" ? store.active : null);
  // the last chosen theme comes back on the next visit
  R.resume = () => store.active && store.items[store.active] && R.use(store.active);
})();
