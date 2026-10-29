(function () {
  "use strict";
  const S = window.Sekai, M = S.m, hex = M.hex;

  // sky keyframes by world hour; night stays pale so the page is always light
  const KEYS = [
    { h: 0,    top: "#5d5f90", mid: "#7c7aa6", hor: "#a495b6", glow: "#c3b2c8" },
    { h: 4.6,  top: "#66679a", mid: "#8a83ac", hor: "#b9a3b8", glow: "#d9bcc0" },
    { h: 5.8,  top: "#dcd6ee", mid: "#efd9e4", hor: "#fddcd0", glow: "#ffe6cf" },
    { h: 7.2,  top: "#d6e0f3", mid: "#ebeaf3", hor: "#fdeee2", glow: "#fff3e0" },
    { h: 11,   top: "#d2e0f2", mid: "#e9eef6", hor: "#f9f6f2", glow: "#fffcf6" },
    { h: 15,   top: "#d6dff1", mid: "#ecedf4", hor: "#fcf2e8", glow: "#fff5e6" },
    { h: 17.4, top: "#dcd5ec", mid: "#f4dde1", hor: "#fed9c4", glow: "#ffe0c2" },
    { h: 18.8, top: "#8f8bba", mid: "#b7a6c6", hor: "#e1bfc4", glow: "#f0d0cc" },
    { h: 20.5, top: "#5d5f90", mid: "#7c7aa6", hor: "#a495b6", glow: "#c3b2c8" },
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
    pal: { top: [0, 0, 0], mid: [0, 0, 0], hor: [0, 0, 0], glow: [0, 0, 0], ink: [0, 0, 0], lum: 1 },
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
    p.lum = (0.2126 * p.top[0] + 0.7152 * p.top[1] + 0.0722 * p.top[2]) / 255;
    // lines and text turn pale once the sky is dark enough
    p.ink = M.mix(M.mix([110, 96, 124], [236, 228, 240], M.smooth(0.66, 0.5, p.lum)), p.top, 0.25);
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
