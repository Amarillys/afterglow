(function () {
  "use strict";
  const S = window.Sekai, M = S.m;
  const SR = 22050, N = 1024, HOP = 256;
  // spectral bands (Hz) that become the four lanes, low to high
  const BANDS = [[30, 150], [150, 600], [600, 2500], [2500, 9000]];
  const pause = () => new Promise((r) => setTimeout(r, 0));

  function fftPlan(n) {
    const rev = new Uint32Array(n), cos = new Float32Array(n / 2), sin = new Float32Array(n / 2);
    const bits = Math.log2(n);
    for (let i = 0; i < n; i++) {
      let r = 0;
      for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
      rev[i] = r;
    }
    for (let i = 0; i < n / 2; i++) {
      cos[i] = Math.cos((2 * Math.PI * i) / n);
      sin[i] = -Math.sin((2 * Math.PI * i) / n);
    }
    return { n, rev, cos, sin };
  }

  function fft(p, re, im) {
    const n = p.n;
    for (let i = 0; i < n; i++) {
      const j = p.rev[i];
      if (j > i) {
        let t = re[i]; re[i] = re[j]; re[j] = t;
        t = im[i]; im[i] = im[j]; im[j] = t;
      }
    }
    for (let size = 2; size <= n; size <<= 1) {
      const half = size >> 1, step = n / size;
      for (let i = 0; i < n; i += size) {
        for (let j = 0; j < half; j++) {
          const k = j * step, a = i + j, b = a + half;
          const tr = re[b] * p.cos[k] - im[b] * p.sin[k], ti = re[b] * p.sin[k] + im[b] * p.cos[k];
          re[b] = re[a] - tr; im[b] = im[a] - ti;
          re[a] += tr; im[a] += ti;
        }
      }
    }
  }

  async function mono(buf) {
    const len = Math.ceil(buf.duration * SR);
    const off = new OfflineAudioContext(1, len, SR);
    const src = off.createBufferSource();
    src.buffer = buf;
    src.connect(off.destination);
    src.start();
    return (await off.startRendering()).getChannelData(0);
  }

  // per-frame onset strength in each band (positive log-magnitude flux) and frame energy
  async function spectral(x, progress) {
    const p = fftPlan(N), frames = Math.max(1, Math.floor((x.length - N) / HOP));
    const win = new Float32Array(N).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
    const edges = BANDS.map(([a, b]) => [Math.max(1, Math.round((a * N) / SR)), Math.min(N / 2, Math.round((b * N) / SR))]);
    const flux = BANDS.map(() => new Float32Array(frames)), rms = new Float32Array(frames);
    const re = new Float32Array(N), im = new Float32Array(N);
    let prev = new Float32Array(N / 2), cur = new Float32Array(N / 2);
    for (let f = 0; f < frames; f++) {
      const o = f * HOP;
      let e = 0;
      for (let i = 0; i < N; i++) {
        const v = x[o + i];
        e += v * v;
        re[i] = v * win[i];
        im[i] = 0;
      }
      rms[f] = Math.sqrt(e / N);
      fft(p, re, im);
      for (let k = 0; k < N / 2; k++) cur[k] = Math.log1p(100 * Math.hypot(re[k], im[k]));
      edges.forEach(([a, b], bi) => {
        let s = 0;
        for (let k = a; k < b; k++) {
          const d = cur[k] - prev[k];
          if (d > 0) s += d;
        }
        flux[bi][f] = s / (b - a);
      });
      const t = prev;
      prev = cur;
      cur = t;
      if (f % 3000 === 0) {
        progress(0.2 + 0.55 * (f / frames));
        await pause();
      }
    }
    return { frames, flux, rms };
  }

  function smooth(a, w) {
    const n = a.length, out = new Float32Array(n), c = new Float64Array(n + 1);
    for (let i = 0; i < n; i++) c[i + 1] = c[i] + a[i];
    for (let i = 0; i < n; i++) {
      const lo = Math.max(0, i - w), hi = Math.min(n, i + w + 1);
      out[i] = (c[hi] - c[lo]) / (hi - lo);
    }
    return out;
  }

  function envelope(flux, frames) {
    const means = flux.map((b) => b.reduce((s, v) => s + v, 0) / frames || 1);
    const wts = [1.2, 1, 0.8, 0.6], env = new Float32Array(frames);
    for (let f = 0; f < frames; f++) for (let b = 0; b < 4; b++) env[f] += (wts[b] * flux[b][f]) / means[b];
    return env;
  }

  // global beat grid: autocorrelation picks the period, folding the whole song refines period and phase
  function tempo(env, flux) {
    const fps = SR / HOP, n = env.length, base = smooth(env, Math.round(fps * 0.4));
    const on = env.map((v, i) => Math.max(0, v - base[i]));
    const lo = Math.round((fps * 60) / 200), hi = Math.round((fps * 60) / 50);
    const score = new Float32Array(hi + 2);
    for (let L = lo; L <= hi + 1; L++) {
      let s = 0;
      for (let i = L; i < n; i++) s += on[i] * on[i - L];
      score[L] = (s / (n - L)) * Math.exp(-0.5 * (Math.log2(L / fps / 0.55) / 0.9) ** 2);
    }
    let best = lo;
    for (let L = lo; L <= hi; L++) if (score[L] > score[best]) best = L;
    const a = score[best - 1] || 0, b = score[best], c = score[best + 1] || 0;
    const den = a - 2 * b + c, coarse = best + (den !== 0 ? M.clamp((0.5 * (a - c)) / den, -0.5, 0.5) : 0);

    let fit = 0, period = coarse, phase = 0;
    for (let P = coarse * 0.97; P <= coarse * 1.03; P += 0.004 * coarse) {
      const bins = Math.max(8, Math.round(P)), h = new Float32Array(bins);
      for (let i = 0; i < n; i++) if (on[i] > 0) h[Math.floor(((i % P) / P) * bins) % bins] += on[i];
      let mean = 0;
      for (let k = 0; k < bins; k++) mean += h[k] / bins;
      for (let k = 0; k < bins; k++) {
        const v = h[(k + bins - 1) % bins] + 2 * h[k] + h[(k + 1) % bins];
        if (mean > 0 && v / (4 * mean) > fit) {
          fit = v / (4 * mean);
          period = P;
          phase = ((k + 0.5) / bins) * P;
        }
      }
    }
    const spb = period / fps, t0 = (phase * HOP + N / 2) / SR;
    const ds = [0, 0, 0, 0];
    for (let k = 0, f = phase; f < n; k++, f += period) {
      let m = 0;
      for (let j = Math.max(0, Math.round(f) - 3); j <= Math.min(n - 1, Math.round(f) + 3); j++) m = Math.max(m, flux[0][j]);
      ds[k % 4] += m;
    }
    const down = ds.indexOf(Math.max(...ds));
    return { spb, bpm: 60 / spb, t0, downbeat: t0 + down * spb, fit };
  }

  // onset peaks become note candidates; on a clear beat they snap to the 1/16 grid
  function notes(env, flux, g) {
    const fps = SR / HOP, thr = smooth(env, Math.round(fps * 0.75)), means = flux.map((b) => b.reduce((s, v) => s + v, 0) / b.length || 1);
    const out = [], grid = g.spb / 4, gap = Math.round(fps * 0.09);
    for (let f = 2; f < env.length - 2; f++) {
      const v = env[f];
      if (v <= thr[f] * 1.35 || v < env[f - 1] || v < env[f + 1] || v < env[f - 2] || v < env[f + 2]) continue;
      if (out.length && f - out[out.length - 1].f < gap) continue;
      let t = (f * HOP + N / 2) / SR;
      if (g.fit >= 1.5) {
        const q = g.downbeat + Math.round((t - g.downbeat) / grid) * grid;
        if (Math.abs(q - t) < grid * 0.4) t = q;
      }
      let w = 0, c = 0;
      for (let b = 0; b < 4; b++) {
        const z = flux[b][f] / means[b];
        w += z;
        c += b * z;
      }
      out.push({ f, t, c: c / (w || 1), s: v - thr[f] });
    }
    // lanes are quartiles of spectral centroid: low sounds left, bright sounds right, evenly spread
    const cs = out.map((n) => n.c).sort((a, b) => a - b), q = [0.25, 0.5, 0.75].map((p) => cs[Math.floor(cs.length * p)] ?? 0);
    const sorted = out.map((n) => n.s).sort((a, b) => a - b);
    const p95 = sorted[Math.floor(sorted.length * 0.95)] || 1, p90 = sorted[Math.floor(sorted.length * 0.9)] || 1;
    return out.map((n) => ({ t: +n.t.toFixed(3), lane: q.filter((x) => n.c > x).length, s: +Math.min(1, n.s / p95).toFixed(3), acc: n.s >= p90 }));
  }

  const MAJ = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
  const MIN = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
  function pearson(a, b) {
    const ma = a.reduce((s, v) => s + v, 0) / 12, mb = b.reduce((s, v) => s + v, 0) / 12;
    let num = 0, da = 0, db = 0;
    for (let i = 0; i < 12; i++) {
      num += (a[i] - ma) * (b[i] - mb);
      da += (a[i] - ma) ** 2;
      db += (b[i] - mb) ** 2;
    }
    return num / Math.sqrt(da * db || 1);
  }

  async function key(x) {
    const n = 4096, p = fftPlan(n), re = new Float32Array(n), im = new Float32Array(n), chroma = new Float32Array(12);
    const win = new Float32Array(n).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n));
    const pc = new Int8Array(n / 2).map((_, k) => {
      const hz = (k * SR) / n;
      return hz < 80 || hz > 2000 ? -1 : ((Math.round(12 * Math.log2(hz / 440)) % 12) + 12 + 9) % 12;
    });
    for (let o = 0, c = 0; o + n <= x.length; o += n, c++) {
      for (let i = 0; i < n; i++) (re[i] = x[o + i] * win[i]), (im[i] = 0);
      fft(p, re, im);
      for (let k = 0; k < n / 2; k++) if (pc[k] >= 0) chroma[pc[k]] += Math.log1p(10 * Math.hypot(re[k], im[k]));
      if (c % 200 === 0) await pause();
    }
    let best = { r: -2, tonic: 0, minor: false };
    for (let t = 0; t < 12; t++) {
      const rot = (prof) => Array.from({ length: 12 }, (_, i) => prof[(i - t + 12) % 12]);
      const rM = pearson(chroma, rot(MAJ)), rm = pearson(chroma, rot(MIN));
      if (rM > best.r) best = { r: rM, tonic: t, minor: false };
      if (rm > best.r) best = { r: rm, tonic: t, minor: true };
    }
    const major = best.minor ? (best.tonic + 3) % 12 : best.tonic;
    return { ...best, root: ((major - 2 + 18) % 12) - 6 };
  }

  function energy(rms) {
    const per = Math.round((SR / HOP) * 0.5), out = [];
    for (let i = 0; i < rms.length; i += per) {
      let s = 0, c = 0;
      for (let j = i; j < Math.min(rms.length, i + per); j++) (s += rms[j] * rms[j]), c++;
      out.push(Math.sqrt(s / c));
    }
    const p95 = out.slice().sort((a, b) => a - b)[Math.floor(out.length * 0.95)] || 1;
    return out.map((v) => +Math.min(1, v / p95).toFixed(2));
  }

  function loudness(buf) {
    let s = 0, c = 0, peak = 0;
    for (let ch = 0; ch < buf.numberOfChannels; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < d.length; i += 4) {
        const v = d[i];
        s += v * v;
        c++;
        if (v > peak) peak = v;
        else if (-v > peak) peak = -v;
      }
    }
    return { rms: Math.sqrt(s / Math.max(1, c)), peak };
  }

  // decoded song -> rhythm theme (beat grid, chart notes, key, loudness); bump `v` when the output changes
  S.analyze = async function (buf, progress = () => {}) {
    progress(0.05);
    const x = await mono(buf);
    progress(0.2);
    const { frames, flux, rms } = await spectral(x, progress);
    const env = envelope(flux, frames), g = tempo(env, flux);
    progress(0.8);
    const k = await key(x);
    progress(0.95);
    const loud = loudness(buf);
    return {
      v: S.analyze.version, dur: +buf.duration.toFixed(2), bpm: +g.bpm.toFixed(2), spb: g.spb, downbeat: +g.downbeat.toFixed(4), fit: +g.fit.toFixed(2),
      key: { tonic: k.tonic, minor: k.minor, root: k.root, r: +k.r.toFixed(3) },
      gain: +M.clamp(0.09 / Math.max(loud.rms, 1e-4), 0.2, Math.min(1.6, 0.85 / Math.max(loud.peak, 1e-4))).toFixed(3),
      notes: notes(env, flux, g),
      energy: energy(rms),
    };
  };
  S.analyze.version = 1;
})();
