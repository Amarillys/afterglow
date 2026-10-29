(function () {
  "use strict";
  const S = window.Sekai, M = S.m, V = S.view, T = S.time;
  const sky = (S.sky = {});
  const rnd = M.rng("chiyo sekai");
  const TAU = Math.PI * 2;

  const stars = Array.from({ length: 90 }, () => ({
    x: rnd(), y: Math.pow(rnd(), 1.5) * 0.9, r: 0.5 + rnd() * 1.1, ph: rnd() * TAU, sp: 0.5 + rnd() * 1.5,
  }));

  function cloudSprite(seed) {
    const r = M.rng(seed), c = document.createElement("canvas");
    c.width = 320;
    c.height = 110;
    const g = c.getContext("2d");
    for (let i = 0; i < 12; i++) {
      const x = 50 + r() * 220, y = 58 + (r() - 0.5) * 26, rad = 18 + r() * 34;
      const grd = g.createRadialGradient(x, y, 0, x, y, rad);
      grd.addColorStop(0, "rgba(255,251,246,0.55)");
      grd.addColorStop(1, "rgba(255,251,246,0)");
      g.fillStyle = grd;
      g.beginPath();
      g.arc(x, y, rad, 0, TAU);
      g.fill();
    }
    return c;
  }
  const sprites = [1, 2, 3, 4].map((i) => cloudSprite("cloud" + i));
  // y: 0 at the horizon, 1 at the top of the screen
  const clouds = Array.from({ length: 9 }, (_, i) => ({
    x: rnd(), y: 0.05 + Math.pow(rnd(), 1.3) * 0.62, sp: 0.5 + rnd(), k: i % 4, a: 0.45 + rnd() * 0.5,
  }));

  // x: offset from centre in half-widths; h: height in sky-heights; w: width in screen-widths
  const RUINS = [
    { k: "arch", x: 0, h: 0.34, w: 0.05 },
    { k: "pillar", x: -0.64, h: 0.25, w: 0.012, broken: true },
    { k: "pillar", x: -0.56, h: 0.14, w: 0.009 },
    { k: "pillar", x: 0.47, h: 0.31, w: 0.013 },
    { k: "pillar", x: 0.72, h: 0.12, w: 0.008, broken: true },
    { k: "cube", x: -0.31, h: 0.24, w: 0.011, rot: 0.5 },
    { k: "cube", x: 0.29, h: 0.4, w: 0.008, rot: 0.2 },
  ];

  // a gate snapped near the top right; its right leg stands on its own
  function arch(ctx, x, base, w, h) {
    const r = w / 2, t = w * 0.16, spring = base - h + r, a = Math.PI * 1.8, b = Math.PI * 1.74;
    ctx.beginPath();
    ctx.moveTo(x - r, base);
    ctx.lineTo(x - r, spring);
    ctx.arc(x, spring, r, Math.PI, a);
    ctx.lineTo(x + Math.cos(b) * (r - t), spring + Math.sin(b) * (r - t));
    ctx.arc(x, spring, r - t, b, Math.PI, true);
    ctx.lineTo(x - r + t, base);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x + r - t, base);
    ctx.lineTo(x + r - t, spring - r * 0.12);
    ctx.lineTo(x + r - t * 0.3, spring - r * 0.3);
    ctx.lineTo(x + r, spring - r * 0.08);
    ctx.lineTo(x + r, base);
    ctx.closePath();
    ctx.fill();
  }

  function pillar(ctx, x, base, w, h, broken) {
    const top = base - h;
    ctx.beginPath();
    ctx.moveTo(x - w / 2, base);
    ctx.lineTo(x - w / 2, top);
    if (broken) {
      ctx.lineTo(x - w * 0.1, top - w * 0.6);
      ctx.lineTo(x + w * 0.15, top + w * 0.3);
      ctx.lineTo(x + w / 2, top + h * 0.07);
    } else {
      ctx.lineTo(x - w * 0.8, top);
      ctx.lineTo(x - w * 0.8, top - w * 0.5);
      ctx.lineTo(x + w * 0.8, top - w * 0.5);
      ctx.lineTo(x + w * 0.8, top);
      ctx.lineTo(x + w / 2, top);
    }
    ctx.lineTo(x + w / 2, base);
    ctx.closePath();
    ctx.fill();
  }

  function cube(ctx, x, y, s, rot) {
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const a = rot + (i * Math.PI) / 2;
      ctx.lineTo(x + Math.cos(a) * s, y + Math.sin(a) * s);
    }
    ctx.closePath();
    ctx.fill();
  }

  sky.sunPos = () => ({ x: V.cx + T.sunAz * V.w * 0.42, y: V.hy - T.sunAlt * V.hy * 0.82 });
  sky.moonPos = () => ({ x: V.cx + T.moonAz * V.w * 0.42, y: V.hy - T.moonAlt * V.hy * 0.82 });

  function drawStars(ctx, now) {
    if (T.night < 0.02) return;
    ctx.fillStyle = "#fff";
    for (const s of stars) {
      const tw = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(now * 0.0006 * s.sp + s.ph));
      ctx.globalAlpha = T.night * tw * M.smooth(0.92, 0.6, s.y);
      ctx.beginPath();
      ctx.arc(s.x * V.w, s.y * V.hy, s.r, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawGlow(ctx) {
    const gx = T.sunAlt > -0.3 ? sky.sunPos().x : V.cx;
    const k = 0.3 + 0.7 * T.dawn, R = V.w * 0.6;
    ctx.save();
    ctx.translate(gx, V.hy);
    ctx.scale(1, 0.45);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
    g.addColorStop(0, M.rgba(T.pal.glow, 0.9 * k));
    g.addColorStop(0.4, M.rgba(T.pal.glow, 0.32 * k));
    g.addColorStop(1, M.rgba(T.pal.glow, 0));
    ctx.fillStyle = g;
    ctx.fillRect(-gx, -V.hy / 0.45, V.w, V.hy / 0.45);
    ctx.restore();
  }

  function drawSun(ctx, alpha) {
    if (T.sunAlt < -0.2) return;
    const { x, y } = sky.sunPos(), R = Math.min(V.w, V.h) * 0.03;
    const vis = M.smooth(-0.2, 0.02, T.sunAlt) * alpha;
    const warm = M.mix([255, 222, 192], [255, 244, 228], T.daylight);
    const g = ctx.createRadialGradient(x, y, 0, x, y, R * 9);
    g.addColorStop(0, M.rgba(warm, 0.6 * vis));
    g.addColorStop(0.22, M.rgba(warm, 0.22 * vis));
    g.addColorStop(1, M.rgba(warm, 0));
    ctx.fillStyle = g;
    ctx.fillRect(x - R * 9, y - R * 9, R * 18, R * 18);
    ctx.fillStyle = M.rgba(M.mix([255, 228, 208], [255, 253, 249], T.daylight), 0.95 * vis);
    ctx.strokeStyle = M.rgba([255, 196, 168], 0.35 * vis);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, R, 0, TAU);
    ctx.fill();
    ctx.stroke();
  }

  function drawMoon(ctx, alpha) {
    if (T.moonAlt < -0.15) return;
    const { x, y } = sky.moonPos(), R = Math.min(V.w, V.h) * 0.022;
    const vis = M.smooth(-0.15, 0.05, T.moonAlt) * (0.3 + 0.7 * T.night) * alpha;
    const g = ctx.createRadialGradient(x, y, 0, x, y, R * 6);
    g.addColorStop(0, M.rgba([255, 250, 240], 0.4 * vis));
    g.addColorStop(1, "rgba(255,250,240,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - R * 6, y - R * 6, R * 12, R * 12);
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, R, 0, TAU);
    ctx.clip();
    ctx.fillStyle = M.rgba([255, 252, 247], 0.12 * vis);
    ctx.fill();
    // lit part = disc minus an offset shadow disc; the clip keeps the shadow inside the moon
    ctx.beginPath();
    ctx.arc(x, y, R, 0, TAU);
    ctx.moveTo(x + R * 0.42 + R * 0.9, y - R * 0.22);
    ctx.arc(x + R * 0.42, y - R * 0.22, R * 0.9, 0, TAU);
    ctx.fillStyle = M.rgba([255, 252, 247], 0.95 * vis);
    ctx.fill("evenodd");
    ctx.restore();
  }

  function drawClouds(ctx, now, alpha) {
    for (const c of clouds) {
      const depth = 0.35 + c.y * 0.9;
      const w = V.w * 0.34 * depth, h = w * 0.34, span = V.w + w * 2;
      const x = ((c.x * span + now * 0.0000025 * V.w * c.sp * depth) % span) - w;
      ctx.globalAlpha = c.a * alpha * (0.6 + 0.4 * T.daylight) * (1 - 0.55 * T.night);
      ctx.drawImage(sprites[c.k], x, V.hy - c.y * V.hy - h * 0.5, w, h);
    }
    ctx.globalAlpha = 1;
  }

  function drawRuins(ctx, now, alpha) {
    const p = T.pal;
    ctx.fillStyle = M.rgba(M.mix(M.mix(p.hor, p.top, 0.6), M.mix([140, 120, 150], [62, 56, 92], T.night), 0.3 + 0.25 * T.night), (0.4 + 0.2 * T.night) * alpha);
    RUINS.forEach((r, i) => {
      const x = V.cx + r.x * V.w * 0.5, w = r.w * V.w, h = r.h * V.hy;
      if (r.k === "arch") arch(ctx, x, V.hy, w, h);
      else if (r.k === "pillar") pillar(ctx, x, V.hy, w, h, r.broken);
      else cube(ctx, x, V.hy - h + Math.sin(now * 0.00025 + i) * V.hy * 0.012, w, r.rot + now * 0.00002 * (i % 2 ? 1 : -1));
    });
  }

  function haze(ctx) {
    const top = V.hy * 0.88;
    const g = ctx.createLinearGradient(0, top, 0, V.hy);
    g.addColorStop(0, M.rgba(T.pal.hor, 0));
    g.addColorStop(1, M.rgba(T.pal.hor, 0.85));
    ctx.fillStyle = g;
    ctx.fillRect(0, top, V.w, V.hy - top);
  }

  sky.draw = function (ctx, now) {
    const p = T.pal;
    const g = ctx.createLinearGradient(0, 0, 0, V.hy);
    g.addColorStop(0, M.rgba(p.top, 1));
    g.addColorStop(0.62, M.rgba(p.mid, 1));
    g.addColorStop(1, M.rgba(p.hor, 1));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, V.w, V.hy + 1);
    drawStars(ctx, now);
    drawGlow(ctx);
    drawMoon(ctx, 1);
    drawSun(ctx, 1);
    drawClouds(ctx, now, 1);
    drawRuins(ctx, now, 1);
    haze(ctx);
  };

  // mirror of the sky on the still floor (y' = 2·horizon − y)
  sky.reflect = function (ctx, now) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, V.hy, V.w, V.h - V.hy);
    ctx.clip();
    ctx.translate(0, 2 * V.hy);
    ctx.scale(1, -1);
    drawSun(ctx, 0.45);
    drawMoon(ctx, 0.4);
    drawClouds(ctx, now, 0.35);
    drawRuins(ctx, now, 0.35);
    ctx.restore();
  };
})();
