(function () {
  "use strict";
  const S = window.Sekai, A = S.audio, V = S.voices, M = S.m;

  // two bars per chord; `tones` are the pentatonic pitch classes (degree % 5) that are chord tones
  const PROG = [
    { name: "Dmaj9",   bass: 38, notes: [57, 61, 64, 66], tones: [0, 1, 2, 3] },
    { name: "Bm9",     bass: 35, notes: [57, 61, 62, 66], tones: [4, 0, 2, 3] },
    { name: "Gmaj13",  bass: 43, notes: [54, 57, 59, 64], tones: [4, 0, 2] },
    { name: "Em9",     bass: 40, notes: [55, 59, 62, 66], tones: [1, 4, 0, 2] },
    { name: "D/F#",    bass: 42, notes: [57, 61, 62, 64], tones: [2, 3, 0, 1] },
    { name: "Gmaj9",   bass: 43, notes: [54, 57, 59, 62], tones: [4, 0, 2, 3] },
    { name: "Bm11",    bass: 35, notes: [54, 57, 62, 64], tones: [4, 0, 2] },
    { name: "Asus4",   bass: 45, notes: [52, 59, 62, 64], tones: [3, 1, 4, 0] },
  ];
  // [beat, degree, length]; dawn rises, dusk answers and comes home
  const MOTIF = [[0, 10, 1], [1, 8, 1], [2, 11, 1], [3, 12, 1.8]];
  const DUSK = [[0, 12, 1], [1, 11, 1], [2, 8, 1], [3, 10, 1.8]];
  const STEPS = [-1, -1, 1, 1, -2, 2, 0, 0];

  const C = (S.conductor = { running: false, t0: 0, spb: 60 / S.cfg.bpm, step: 0, chord: PROG[0] });
  const log = [];
  let motifQueue = null, motifBar = -1, arpDeg = 10, tide = null, mood = null, pads = [], lastGen = 0;

  C.start = function () {
    if (C.running || !A.ready) return;
    const now = A.ctx.currentTime;
    C.t0 = now + 1.8;
    C.step = 0;
    C.running = true;
    tide = V.tide();
    const toDawn = (((6 - S.cfg.startHour + 24) % 24) / 24) * S.cfg.dayLength;
    const dawnBar = Math.round((toDawn - 1.8) / (C.spb * 4));
    motifQueue = { bar: dawnBar >= 2 && dawnBar <= 16 ? dawnBar : 4, notes: MOTIF };
    setInterval(tick, 50);
  };

  function tick() {
    const now = A.ctx.currentTime;
    mood = S.mood.mix();
    C.step = Math.max(C.step, Math.ceil(((now - 0.05 - C.t0) * 2) / C.spb));
    for (;;) {
      const t = C.t0 + (C.step * C.spb) / 2;
      if (t >= now + S.cfg.lookahead) break;
      if (t > now - 0.05) play(C.step, t);
      C.step++;
    }
    waves(now);
    S.reference.tick(now);
    A.sweep();
  }

  function play(step, t) {
    if (S.reference.busy(t)) return;
    lastGen = t;
    const spb = C.spb, bar = Math.floor(step / 8), pos = step % 8;
    const day = S.time.daylight;
    const drive = 0.75 + 0.75 * mood.drive; // 1 when the attributes are balanced
    const thin = bar % 32 >= 20; // the rhythm rests for 12 bars in every 32

    if (pos === 0 && bar % 2 === 0) chordOn(t, PROG[(bar / 2) % PROG.length], spb * 8 - 0.4);

    if (pos === 0 && motifQueue && bar >= motifQueue.bar) {
      motifQueue.notes.forEach(([b, deg, len]) => note(t + b * spb, deg, true, len));
      motifQueue = null;
      motifBar = bar;
    }

    if (!thin && bar >= 4 && pos % 2 === 0 && Math.random() < 0.85) {
      const beat = pos / 2, grow = Math.min(1, (bar - 4) / 12);
      V.tick(t, beat % 2 === 0, (beat % 2 ? 0.1 : 0.14) * grow * drive * (0.6 + 0.4 * day), beat % 2 ? 0.25 : -0.25);
    }

    if (!thin && bar >= 8 && pos === 0) {
      const grow = Math.min(1, (bar - 8) / 12);
      V.pulse(t, 0.6 * grow * drive * (0.5 + 0.5 * day));
    }

    if (bar >= 2 && bar !== motifBar && (bar % 4 !== 3 || pos < 4)) {
      const growth = Math.min(1, 0.12 + (bar - 2) / 36);
      const swell = 0.55 + 0.45 * Math.sin((bar / 40) * Math.PI * 2);
      const density = growth * swell * (0.55 + 0.45 * day) * (thin ? 0.6 : 1) * drive * (S.questions.busy() ? 0.5 : 1);
      const p = (pos % 4 === 0 ? 0.7 : pos % 2 === 0 ? 0.36 : 0.12) * density;
      if (Math.random() < p) {
        arpDeg = nextDeg(arpDeg, pos % 4 === 0);
        note(t, arpDeg, false, 1);
      }
    }
  }

  // Follow harmony without creating a voice when seeking past missed chords.
  function chordState(t, base) {
    const r = S.music.root, chord = { ...base, bass: base.bass + r, notes: base.notes.map((m) => m + r) };
    C.chord = chord;
    log.push({ t, chord });
    if (log.length > 6) log.shift();
    return chord;
  }

  // the pad chord, moved into the current key (the rhythm-theme player uses this too)
  function chordOn(t, base, dur) {
    const chord = chordState(t, base);
    // A late chord still fades in from silence instead of starting halfway through its envelope.
    const start = Math.max(t - 1.6, A.ctx.currentTime + 0.01);
    pads.push(V.pad(start, chord, dur, S.time.daylight * (1.25 - 0.75 * mood.gentle)));
    if (pads.length > 3) pads.shift();
    S.emit("chord", { t, chord });
  }

  function note(t, deg, motif, len, vel = 1) {
    const lane = M.clamp(Math.floor((deg - 7) / 2.25), 0, 3);
    V.bell(t, S.music.freq(deg), {
      vel: (motif ? 0.85 : 0.45 + Math.random() * 0.2) * vel,
      pan: (lane - 1.5) * 0.36,
      wet: (motif ? 0.6 : 0.5) + 0.3 * (mood.calm - 1 / 3),
      echo: motif ? 0.26 : 0.18,
      len,
    });
    S.emit("note", { t, lane, deg, motif });
  }

  function nextDeg(d, strong, target) {
    let n = d + M.pick(STEPS);
    if (target != null) n += Math.round((target - n) * 0.4);
    if (n < 7) n = 14 - n;
    if (n > 15) n = 30 - n;
    if (!strong) return n;
    for (const off of [0, 1, -1, 2, -2]) {
      const c = n + off;
      if (c >= 7 && c <= 15 && C.chord.tones.includes(c % 5)) return c;
    }
    return n;
  }

  // keep the next wave on each shore scheduled; nights are a little stronger
  function waves(now) {
    for (const w of tide) {
      if (w.next > now + 1) continue;
      w.next = Math.max(w.next, now + 0.1);
      const dur = 6 + Math.random() * 5, k = 0.8 + 0.4 * S.time.night;
      V.wave(w, w.next, dur, (0.12 + Math.random() * 0.1) * k, 240 + Math.random() * 60, 480 + Math.random() * 260);
      w.next += dur + 0.05 + Math.random() * 2.5;
    }
  }

  S.on("hour", (h) => {
    if (!C.running || S.time.elapsed < 60 || S.reference.busy()) return;
    if (h === 6 || h === 18) motifQueue = { bar: Math.floor(C.step / 8) + 1, notes: h === 6 ? MOTIF : DUSK };
  });

  // signed distance (s) from audio time t to the nearest beat
  // the beat everyone follows: the reference song's grid while it plays, otherwise our own
  C.grid = function () {
    const r = S.reference.grid();
    if (r || S.reference.busy()) return r;
    return C.running ? { t0: C.t0, spb: C.spb, bar: 4, every: 1 } : null;
  };
  C.beatOffset = function (t) {
    const g = C.grid();
    if (!g) return 1;
    const b = (t - g.t0) / g.spb;
    return (b - Math.round(b)) * g.spb;
  };
  C.quietAt = () => lastGen;
  C.PROG = PROG;
  C.chordState = chordState;
  C.chordOn = chordOn;
  C.note = note;
  C.mood = () => mood;
  C.melody = (strong, target) => (arpDeg = nextDeg(arpDeg, strong, target));
  C.hush = function () {
    const n = A.ctx.currentTime;
    pads.forEach((gs) => gs.forEach((g) => {
      g.gain.cancelScheduledValues(n);
      g.gain.setValueAtTime(g.gain.value, n);
      g.gain.linearRampToValueAtTime(0, n + 2);
    }));
    pads = [];
  };

  C.chordAt = function (t) {
    let c = PROG[0];
    for (const e of log) if (e.t <= t + 0.5) c = e.chord;
    return c;
  };

  C.strum = function () {
    if (!A.ready) return;
    const t = A.ctx.currentTime + 0.01;
    const c = C.chordAt(t);
    const notes = c.notes.map((m) => m + 12).concat(c.notes[0] + 24);
    notes.forEach((m, i) =>
      V.bell(t + i * 0.09, S.music.mtof(m), {
        vel: 0.42, pan: -0.6 + (1.2 * i) / (notes.length - 1), wet: 0.6, echo: 0.2, len: 1.2,
      })
    );
  };
})();
