(function () {
  "use strict";
  const S = window.Sekai, A = S.audio, V = S.voices;

  // sustained hum while dragging; glides to the pitch under the pointer
  V.arc = function (freq, pan) {
    const ctx = A.ctx, t = ctx.currentTime;
    const out = A.strip({ pan, dry: 0.7, wet: 0.6, echo: 0.2 });
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1300;
    lp.Q.value = 0.4;
    const g = ctx.createGain();
    g.gain.value = 0;
    lp.connect(g).connect(out.input);
    const oscs = [-6, 6].map((cents) => {
      const o = ctx.createOscillator();
      o.type = "triangle";
      o.frequency.value = freq;
      o.detune.value = cents;
      o.connect(lp);
      o.start(t);
      return o;
    });
    const vib = ctx.createOscillator();
    vib.frequency.value = 4;
    const vibAmt = ctx.createGain();
    vibAmt.gain.value = 4;
    vib.connect(vibAmt);
    oscs.forEach((o) => vibAmt.connect(o.detune));
    vib.start(t);
    let done = false;
    return {
      set(f, p, level) {
        if (done) return;
        const n = ctx.currentTime;
        oscs.forEach((o) => o.frequency.setTargetAtTime(f, n, 0.05));
        out.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, p)), n, 0.08);
        g.gain.setTargetAtTime(level * 0.07, n, 0.09);
      },
      release() {
        if (done) return;
        done = true;
        const n = ctx.currentTime;
        g.gain.cancelScheduledValues(n);
        g.gain.setValueAtTime(g.gain.value, n);
        g.gain.setTargetAtTime(0, n, 0.35);
        [...oscs, vib].forEach((o) => o.stop(n + 2.5));
      },
    };
  };

  // background chord: detuned saws through a slow lowpass swell
  V.pad = function (t, chord, dur, bright) {
    if (!A.ready) return;
    const ctx = A.ctx, fadeIn = 3.2, fadeOut = 3.6, end = t + dur + fadeOut;
    const cut = 650 + 750 * bright;
    const env = (peak, dest) => {
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(peak, t + fadeIn);
      g.gain.setValueAtTime(peak, t + dur);
      g.gain.linearRampToValueAtTime(0, end);
      g.connect(dest);
      return g;
    };
    [-0.45, 0.45].forEach((pan, side) => {
      const out = A.strip({ pan, dry: 0.75, wet: 0.7 });
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.Q.value = 0.5;
      lp.frequency.setValueAtTime(cut * 0.6, t);
      lp.frequency.linearRampToValueAtTime(cut, t + dur * 0.5);
      lp.frequency.linearRampToValueAtTime(cut * 0.7, end);
      lp.connect(out.input);
      const g = env(0.022, lp);
      chord.notes.forEach((m, i) => {
        const o = ctx.createOscillator();
        o.type = "sawtooth";
        o.frequency.value = S.music.mtof(m);
        o.detune.value = (side ? 7 : -7) + (i % 2 ? 3 : -3);
        o.connect(g);
        o.start(t);
        o.stop(end + 0.1);
      });
    });
    const sub = ctx.createOscillator();
    sub.frequency.value = S.music.mtof(chord.bass);
    const subOut = A.strip({ dry: 1, wet: 0.15 });
    sub.connect(env(0.075, subOut.input));
    sub.start(t);
    sub.stop(end + 0.1);
  };

  // two bands of moving air
  V.wind = function () {
    const ctx = A.ctx, t = ctx.currentTime;
    return [-0.6, 0.6].map((pan, i) => {
      const src = ctx.createBufferSource();
      src.buffer = A.noise;
      src.loop = true;
      src.playbackRate.value = i ? 0.93 : 1.07;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = i ? 900 : 520;
      bp.Q.value = 0.8;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.3, t + 6);
      src.connect(bp).connect(g).connect(A.strip({ pan, dry: 0.8, wet: 0.5 }).input);
      src.start(t, i * 2.3);
      return { bp, g };
    });
  };

  // soft heartbeat on the downbeat
  V.pulse = function (t, vel) {
    if (!A.ready) return;
    const ctx = A.ctx;
    const out = A.strip({ dry: 1, wet: 0.2 });
    [[80, 46, 0.36, "sine"], [160, 110, 0.04, "triangle"]].forEach(([f0, f1, amp, type]) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(f1, t + 0.18);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(amp * vel, t + 0.014);
      g.gain.setTargetAtTime(0, t + 0.016, 0.16);
      o.connect(g).connect(out.input);
      o.start(t);
      o.stop(t + 0.9);
    });
  };

  // the clock: high "tick", lower "tock"
  V.tick = function (t, high, vel, pan) {
    if (!A.ready) return;
    const ctx = A.ctx;
    const out = A.strip({ pan, dry: 0.8, wet: 0.35, echo: 0.1 });
    const src = ctx.createBufferSource();
    src.buffer = A.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = high ? 2600 : 1900;
    bp.Q.value = 5;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.45 * vel, t + 0.002);
    g.gain.setTargetAtTime(0, t + 0.003, 0.016);
    src.connect(bp).connect(g).connect(out.input);
    src.start(t, Math.random() * 5, 0.12);
    const o = ctx.createOscillator();
    o.frequency.value = high ? 880 : 587.33;
    const og = ctx.createGain();
    og.gain.setValueAtTime(0, t);
    og.gain.linearRampToValueAtTime(0.05 * vel, t + 0.002);
    og.gain.setTargetAtTime(0, t + 0.003, 0.05);
    o.connect(og).connect(out.input);
    o.start(t);
    o.stop(t + 0.4);
  };
})();
