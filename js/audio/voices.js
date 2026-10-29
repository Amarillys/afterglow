(function () {
  "use strict";
  const S = window.Sekai, A = S.audio;
  const V = (S.voices = {});

  // equal-loudness-ish trim so high notes don't pierce
  const trim = (f) => Math.min(1, Math.pow(520 / f, 0.32));

  function partial(t, dest, freq, amp, decay, attack = 0.004, type = "sine") {
    if (freq > 11000) return;
    const ctx = A.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(amp, t + attack);
    g.gain.setTargetAtTime(0, t + attack, decay / 4.6);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + attack + decay + 0.1);
  }

  function lowpass(dest, freq) {
    const f = A.ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = freq;
    f.connect(dest);
    return f;
  }

  const BELL = [[1, 1, 3.2], [2, 0.32, 1.7], [3.01, 0.12, 0.9], [4.2, 0.07, 0.5], [5.43, 0.04, 0.3]];
  const CHIME = [[1, 1, 2.6], [2.76, 0.42, 1.5], [5.4, 0.2, 0.8], [8.93, 0.08, 0.45]];

  // sky taps, background melody: soft glass bell
  V.bell = function (t, freq, o = {}) {
    if (!A.ready) return;
    const amp = 0.17 * (o.vel ?? 1) * trim(freq);
    const out = A.strip({ pan: o.pan, dry: o.dry ?? 0.9, wet: o.wet ?? 0.45, echo: o.echo ?? 0.18 });
    const lp = lowpass(out.input, Math.min(5600, freq * 6));
    const len = o.len ?? 1;
    BELL.forEach(([r, a, d]) => partial(t, lp, freq * r, amp * a, d * len, 0.006));
    partial(t, lp, freq * 1.003, amp * 0.25, 2.2 * len, 0.03);
  };

  // floor taps: a drop on still water (near = dry and bright, far = soft and distant)
  V.drop = function (t, freq, o = {}) {
    if (!A.ready) return;
    const near = o.near ?? 1;
    const amp = 0.24 * (o.vel ?? 1) * trim(freq) * (0.55 + 0.45 * near);
    const out = A.strip({ pan: o.pan, dry: 0.35 + 0.65 * near, wet: 0.65 - 0.3 * near, echo: 0.12 });
    const lp = lowpass(out.input, 1200 + 3400 * near);
    const ctx = A.ctx;
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(freq * 0.9, t);
    osc.frequency.exponentialRampToValueAtTime(freq, t + 0.035);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(amp, t + 0.004);
    g.gain.setTargetAtTime(0, t + 0.004, 0.32);
    osc.connect(g).connect(lp);
    osc.start(t);
    osc.stop(t + 2.2);
    partial(t, lp, freq * 2, amp * 0.22, 0.5, 0.002);
    partial(t, lp, freq * 4, amp * 0.06, 0.12, 0.001);
  };

  // floating shards: inharmonic, slightly different every time
  V.chime = function (t, freq, o = {}) {
    if (!A.ready) return;
    const amp = 0.12 * (o.vel ?? 1) * trim(freq);
    const out = A.strip({ pan: o.pan, dry: 0.7, wet: 0.7, echo: 0.25 });
    const lp = lowpass(out.input, 9000);
    CHIME.forEach(([r, a, d]) => {
      partial(t, lp, freq * r * (1 + (Math.random() - 0.5) * 0.006), amp * a, d, 0.006);
    });
  };

  // drag glissando: Karplus-Strong string, one cached buffer per pitch
  const ks = new Map();
  function ksBuffer(freq) {
    const key = Math.round(freq * 10);
    if (ks.has(key)) return ks.get(key);
    const ctx = A.ctx, rate = ctx.sampleRate;
    const N = Math.max(8, Math.round(rate / freq - 0.5));
    const len = Math.floor(rate * 1.8);
    const d = new Float32Array(len);
    let lp = 0, peak = 0;
    for (let i = 0; i < N; i++) {
      lp = lp * 0.55 + (Math.random() * 2 - 1) * 0.45;
      d[i] = lp;
      peak = Math.max(peak, Math.abs(lp));
    }
    const f0 = rate / (N + 0.5);
    const rho = Math.pow(0.001, 1 / (f0 * (0.8 + 260 / freq)));
    d[N] = rho * 0.5 * (d[0] + d[N - 1]);
    for (let i = N + 1; i < len; i++) d[i] = rho * 0.5 * (d[i - N] + d[i - N - 1]);
    const fade = Math.floor(rate * 0.2);
    for (let i = 0; i < fade; i++) d[len - 1 - i] *= i / fade;
    const buf = ctx.createBuffer(1, len, rate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = d[i] / (peak || 1);
    const item = { buf, rate: freq / f0 };
    ks.set(key, item);
    return item;
  }

  V.pluck = function (t, freq, o = {}) {
    if (!A.ready) return;
    const { buf, rate } = ksBuffer(freq);
    const ctx = A.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.value = 0.13 * (o.vel ?? 1) * trim(freq);
    const out = A.strip({ pan: o.pan, dry: 0.8, wet: 0.55, echo: 0.22 });
    src.connect(g).connect(lowpass(out.input, 3800));
    src.start(t);
  };
})();
