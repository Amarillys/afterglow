(function () {
  "use strict";
  const S = window.Sekai;
  const A = (S.audio = { ctx: null, ready: false, muted: false, level: 0.9 });

  function impulse(ctx, seconds, decay) {
    const rate = ctx.sampleRate, len = Math.floor(rate * seconds);
    const buf = ctx.createBuffer(2, len, rate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        const pre = Math.min(1, i / (rate * 0.02));
        d[i] = (Math.random() * 2 - 1) * pre * Math.pow(1 - t, decay);
      }
    }
    return buf;
  }

  // pink noise; the tail is crossfaded into the head so the loop has no seam
  function pinkNoise(ctx, seconds) {
    const rate = ctx.sampleRate, len = Math.floor(rate * seconds), fade = Math.floor(rate * 0.5);
    const tmp = new Float32Array(len + fade);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < tmp.length; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      tmp[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
    for (let i = 0; i < fade; i++) {
      const t = i / fade;
      tmp[i] = tmp[i] * t + tmp[len + i] * (1 - t);
    }
    const buf = ctx.createBuffer(1, len, rate);
    buf.getChannelData(0).set(tmp.subarray(0, len));
    return buf;
  }

  A.init = function () {
    if (A.ctx) return A.ctx;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    const ctx = (A.ctx = new Ctx({ latencyHint: "interactive" }));
    A.noise = pinkNoise(ctx, 6);

    A.master = ctx.createGain();
    A.master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 12;
    comp.ratio.value = 3;
    comp.attack.value = 0.01;
    comp.release.value = 0.4;
    A.bus = ctx.createGain();
    A.bus.gain.value = 1.3;
    A.bus.connect(comp);
    comp.connect(A.master);
    A.master.connect(ctx.destination);

    // long, soft reverb: the "empty space" of the world
    A.verb = ctx.createGain();
    const vHp = ctx.createBiquadFilter();
    vHp.type = "highpass";
    vHp.frequency.value = 180;
    const conv = ctx.createConvolver();
    conv.buffer = impulse(ctx, 6.5, 3.2);
    const vLp = ctx.createBiquadFilter();
    vLp.type = "lowpass";
    vLp.frequency.value = 5200;
    const vOut = ctx.createGain();
    vOut.gain.value = 0.9;
    A.verb.connect(vHp).connect(conv).connect(vLp).connect(vOut).connect(A.bus);

    // dotted-eighth ping-pong echo, each repeat a little darker
    const beat = 60 / S.cfg.bpm;
    A.echo = ctx.createGain();
    const dL = ctx.createDelay(4), dR = ctx.createDelay(4);
    dL.delayTime.value = dR.delayTime.value = beat * 0.75;
    const tone = ctx.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.value = 2600;
    const fb = ctx.createGain();
    fb.gain.value = 0.38;
    const merge = ctx.createChannelMerger(2);
    A.echo.connect(dL);
    dL.connect(merge, 0, 0);
    dL.connect(dR);
    dR.connect(merge, 0, 1);
    dR.connect(tone).connect(fb).connect(dL);
    const eOut = ctx.createGain();
    eOut.gain.value = 0.55;
    merge.connect(eOut).connect(A.bus);
    eOut.connect(A.verb);

    A.ready = true;
    return ctx;
  };

  // per-voice output: pan + dry level + reverb send + echo send
  A.strip = function (o = {}) {
    const ctx = A.ctx;
    const input = ctx.createGain();
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.max(-1, Math.min(1, o.pan || 0));
    input.connect(pan);
    const dry = ctx.createGain();
    dry.gain.value = o.dry ?? 1;
    pan.connect(dry).connect(A.bus);
    if (o.wet) {
      const w = ctx.createGain();
      w.gain.value = o.wet;
      pan.connect(w).connect(A.verb);
    }
    if (o.echo) {
      const e = ctx.createGain();
      e.gain.value = o.echo;
      pan.connect(e).connect(A.echo);
    }
    return { input, pan };
  };

  A.fadeTo = function (v, sec) {
    if (!A.ctx) return;
    const g = A.master.gain, t = A.ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(v, t + sec);
  };

  A.setMuted = function (m) {
    A.muted = m;
    A.fadeTo(m ? 0 : A.level, m ? 0.6 : 1.2);
  };

  A.resume = function () {
    if (A.ctx && A.ctx.state !== "running") A.ctx.resume().catch(() => {});
  };

  // audio-clock time of the sample reaching the speakers now; visuals sync to this
  let lastHeard = 0;
  A.heard = function () {
    const ctx = A.ctx;
    if (!ctx) return 0;
    let t = ctx.currentTime - (ctx.outputLatency || ctx.baseLatency || 0);
    if (ctx.state === "running" && ctx.getOutputTimestamp) {
      const ts = ctx.getOutputTimestamp();
      if (ts.contextTime > 0 && ts.performanceTime > 0) {
        t = ts.contextTime + (performance.now() - ts.performanceTime) / 1000;
      }
    }
    if (t < lastHeard && lastHeard - t < 0.1) t = lastHeard;
    lastHeard = t;
    return t;
  };
})();
