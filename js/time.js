(function () {
  "use strict";
  const S = window.Sekai, M = S.m, hex = M.hex;

  // sky keyframes by world hour; night stays pale so the page is always light
  const KEYS = [
    { h: 0,    top: "#c9cfe8", mid: "#d8dcf0", hor: "#e7e6f3", glow: "#eef0fb" },
    { h: 4.6,  top: "#cdd1ea", mid: "#dcdcf0", hor: "#ece4f0", glow: "#f2eef6" },
    { h: 5.8,  top: "#d6daf1", mid: "#ead9ea", hor: "#fbdcd6", glow: "#ffe7d3" },
    { h: 7.2,  top: "#cfe2f7", mid: "#e4ecf8", hor: "#fbeee6", glow: "#fff4e4" },
    { h: 11,   top: "#c9e1f7", mid: "#e2eefa", hor: "#f5f8fd", glow: "#ffffff" },
    { h: 15,   top: "#cfe0f6", mid: "#e6eef9", hor: "#f9f4ee", glow: "#fff6ea" },
    { h: 17.4, top: "#d6d6f0", mid: "#f1dde6", hor: "#fddccc", glow: "#ffe2c8" },
    { h: 18.8, top: "#cdcfec", mid: "#e2d7ec", hor: "#f1dde6", glow: "#f6e8ee" },
    { h: 20.5, top: "#c9cfe8", mid: "#d8dcf0", hor: "#e7e6f3", glow: "#eef0fb" },
  ].map((k) => ({ h: k.h, top: hex(k.top), mid: hex(k.mid), hor: hex(k.hor), glow: hex(k.glow) }));

  const T = (S.time = {
    running: false,
    t0: 0,
    elapsed: 0,
    hours: S.cfg.startHour,   // continuous world hours since day 1 00:00
    hour: S.cfg.startHour,    // 0..24
    day: 1,
    sunAlt: 0, sunAz: 0, moonAlt: 0, moonAz: 0,
    daylight: 0, night: 0, dawn: 0,
    pal: { top: [0, 0, 0], mid: [0, 0, 0], hor: [0, 0, 0], glow: [0, 0, 0], ink: [0, 0, 0] },
  });
  let lastWhole = Math.floor(T.hours);

  T.start = function () {
    T.t0 = performance.now();
    T.running = true;
  };

  T.update = function (now) {
    if (T.running) T.elapsed = (now - T.t0) / 1000;
    T.hours = S.cfg.startHour + (T.elapsed / S.cfg.dayLength) * 24;
    T.hour = T.hours % 24;
    T.day = 1 + Math.floor(T.hours / 24);

    // sun rises at 06:00 on the left, sets at 18:00 on the right
    const a = ((T.hour - 6) / 24) * Math.PI * 2;
    T.sunAlt = Math.sin(a);
    T.sunAz = -Math.cos(a);
    T.moonAlt = -T.sunAlt;
    T.moonAz = -T.sunAz;
    T.daylight = M.smooth(-0.12, 0.4, T.sunAlt);
    T.night = 1 - M.smooth(-0.28, 0.05, T.sunAlt);
    T.dawn = 1 - M.smooth(0, 0.35, Math.abs(T.sunAlt + 0.02)); // 1 when the sun is on the horizon
    palette(T.hour);

    const whole = Math.floor(T.hours);
    if (whole !== lastWhole) {
      lastWhole = whole;
      if (T.running) S.emit("hour", whole % 24);
    }
  };

  function palette(h) {
    let i = 0;
    while (i < KEYS.length - 1 && KEYS[i + 1].h <= h) i++;
    const a = KEYS[i];
    const b = KEYS[i + 1] || { ...KEYS[0], h: 24 };
    const t = M.smooth(0, 1, (h - a.h) / (b.h - a.h));
    const p = T.pal;
    p.top = M.mix(a.top, b.top, t);
    p.mid = M.mix(a.mid, b.mid, t);
    p.hor = M.mix(a.hor, b.hor, t);
    p.glow = M.mix(a.glow, b.glow, t);
    p.ink = M.mix([93, 102, 136], p.top, 0.25);
  }

  const pad = (n) => String(n).padStart(2, "0");
  T.clock = function () {
    const mins = Math.floor(T.hour * 60);
    return pad(Math.floor(mins / 60)) + ":" + pad(mins % 60);
  };
  T.duration = function (sec) {
    sec = Math.floor(sec);
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return (h ? h + ":" + pad(m) : m) + ":" + pad(s);
  };
})();
