(function () {
  "use strict";
  const S = (window.Sekai = {});
  const q = new URLSearchParams(location.search);
  const num = (k, d) => {
    const v = parseFloat(q.get(k));
    return Number.isFinite(v) ? v : d;
  };

  S.cfg = {
    bpm: 72,
    dayLength: num("day", 720),        // real seconds per world day
    startHour: num("hour", 5.5) % 24,
    travel: 2.4,                       // seconds a note takes from horizon to judge line
    lookahead: 3.2,                    // must exceed travel so notes are known before they appear
    maxDpr: 2,
  };

  // ---------- math ----------
  const M = (S.m = {});
  M.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  M.lerp = (a, b, t) => a + (b - a) * t;
  M.smooth = (a, b, v) => {
    const t = M.clamp((v - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };
  M.mix = (c1, c2, t) => [M.lerp(c1[0], c2[0], t), M.lerp(c1[1], c2[1], t), M.lerp(c1[2], c2[2], t)];
  M.rgba = (c, a) =>
    "rgba(" + (c[0] | 0) + "," + (c[1] | 0) + "," + (c[2] | 0) + "," + M.clamp(a, 0, 1).toFixed(3) + ")";
  M.hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  M.hash = (str) => {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
    return h >>> 0;
  };
  // world layout (ruins, shards, stars) is seeded from the name, so it is the same on every visit
  M.rng = (seed) => {
    let a = typeof seed === "string" ? M.hash(seed) : seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  M.pick = (arr, r = Math.random) => arr[Math.floor(r() * arr.length)];

  // ---------- events ----------
  const subs = {};
  S.on = (name, fn) => (subs[name] || (subs[name] = [])).push(fn);
  S.emit = (name, data) => (subs[name] || []).forEach((fn) => fn(data));

  // ---------- music ----------
  // D major pentatonic, degree 0 = D3. Every note the player can make is in this scale,
  // so nothing clashes with the pad.
  const PENTA = [0, 2, 4, 7, 9];
  S.music = {
    DEG_MAX: 18,
    midi(deg) {
      const d = Math.round(deg);
      const o = Math.floor(d / 5);
      return 50 + o * 12 + PENTA[((d % 5) + 5) % 5];
    },
    freq(deg) {
      return 440 * Math.pow(2, (S.music.midi(deg) - 69) / 12);
    },
    mtof: (m) => 440 * Math.pow(2, (m - 69) / 12),
  };

  // ---------- screen layout ----------
  const V = (S.view = { w: 1, h: 1, dpr: 1, cx: 0.5, hy: 0.44, jy: 0.86, tw: 0.4 });
  S.layout = {
    resize(w, h, dpr) {
      V.w = w;
      V.h = h;
      V.dpr = dpr;
      V.cx = w / 2;
      V.hy = Math.round(h * 0.44);
      V.jy = Math.round(h * 0.86);
      V.tw = w >= h ? Math.min(w * 0.36, h * 0.82) : w * 0.86;
    },
    // higher on screen = higher pitch; the horizon sits on D5
    degAt: (y) => M.clamp(S.music.DEG_MAX * (1 - y / V.h), 0, S.music.DEG_MAX),
    yOfDeg: (d) => M.clamp((1 - d / S.music.DEG_MAX) * V.h, V.h * 0.04, V.h * 0.97),
    // perspective scale of a floor point at screen y (1 at the judge line)
    scaleAt: (y) => Math.max(0.0001, (y - V.hy) / (V.jy - V.hy)),
    // perspective scale of a note that is `dt` seconds away from the judge line
    depth: (dt) => 1 / (1 + (4.5 * Math.max(dt, 0)) / S.cfg.travel),
    floorX: (u, s) => V.cx + u * V.tw * 0.5 * s,
    floorY: (s) => V.hy + (V.jy - V.hy) * s,
  };
})();
