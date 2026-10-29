(function () {
  "use strict";
  const S = window.Sekai, M = S.m, V = S.view, T = S.time;
  const shards = (S.shards = {});
  const rnd = M.rng("chiyo sekai / shards");
  const TAU = Math.PI * 2;
  const COLORS = [[160, 204, 232], [242, 178, 200], [196, 178, 230], [246, 204, 172]];

  const list = Array.from({ length: 16 }, () => {
    const n = 3 + Math.floor(rnd() * 3);
    const verts = Array.from({ length: n }, (_, i) => {
      const a = (i / n) * TAU + (rnd() - 0.5) * 1.1;
      const r = 0.55 + rnd() * 0.45;
      return [Math.cos(a) * r, Math.sin(a) * r * (1.3 + rnd() * 0.8)];
    });
    return {
      x: rnd(), y: rnd(), z: 0.3 + Math.pow(rnd(), 1.6) * 0.7, verts,
      ph: rnd() * TAU, sp: 0.5 + rnd(), rot: rnd() * TAU, col: M.pick(COLORS, rnd),
      glow: 0, spin: 0, spinV: 0, cool: 0, sx: 0, sy: 0, r: 0,
    };
  });

  const motes = Array.from({ length: 70 }, () => ({
    x: rnd(), y: rnd(), vx: (rnd() - 0.5) * 0.004, vy: 0.002 + rnd() * 0.006, r: 0.5 + rnd() * 1.4, ph: rnd() * TAU,
  }));

  function drawShard(ctx, s, now, alpha) {
    const flip = Math.cos(now * 0.00016 * s.sp + s.ph);
    ctx.save();
    ctx.translate(s.sx, s.sy);
    ctx.rotate(s.rot + now * 0.000025 * s.sp + s.spin);
    ctx.scale(0.2 + 0.8 * Math.abs(flip), 1);
    ctx.beginPath();
    s.verts.forEach(([vx, vy]) => ctx.lineTo(vx * s.r, vy * s.r));
    ctx.closePath();
    const g = ctx.createLinearGradient(0, -s.r, 0, s.r);
    g.addColorStop(0, M.rgba([255, 255, 255], (0.55 + 0.4 * s.glow) * alpha));
    g.addColorStop(1, M.rgba(s.col, (0.18 + 0.5 * s.glow) * alpha));
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = M.rgba(M.mix(s.col, [140, 118, 150], 0.25), (0.45 + 0.4 * s.glow) * alpha);
    ctx.lineWidth = 1;
    ctx.stroke();
    if (s.glow > 0.02) {
      ctx.strokeStyle = M.rgba(s.col, 0.5 * s.glow * alpha);
      ctx.lineWidth = 5;
      ctx.stroke();
    }
    ctx.restore();
  }

  shards.draw = function (ctx, now, dt) {
    for (const s of list) {
      const rise = (s.y + now * 0.0000015 * (0.4 + s.z)) % 1;
      s.r = (6 + 16 * s.z) * Math.min(V.w, V.h) / 800;
      s.sx = s.x * V.w + Math.sin(now * 0.00007 * s.sp + s.ph) * 24 * s.z;
      s.sy = V.h * (1.06 - rise * 1.12);
      s.glow *= Math.exp(-dt * 1.1);
      s.spinV *= Math.exp(-dt * 0.9);
      s.spin += s.spinV * dt;
      const floorDim = s.sy > V.hy ? 0.55 : 1;
      drawShard(ctx, s, now, (0.35 + 0.65 * s.z) * floorDim * (0.75 + 0.25 * T.daylight));
    }
  };

  shards.drawMotes = function (ctx, now) {
    ctx.fillStyle = "#fff";
    for (const m of motes) {
      const x = (((m.x + now * 0.0006 * m.vx) % 1) + 1) % 1;
      const y = (((m.y - now * 0.0006 * m.vy) % 1) + 1) % 1;
      ctx.globalAlpha = 0.25 + 0.5 * (0.5 + 0.5 * Math.sin(now * 0.0007 + m.ph));
      ctx.beginPath();
      ctx.arc(x * V.w, y * V.h, m.r, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  };

  // returns the shard under (x, y) if it is ready to ring again
  shards.touch = function (x, y, now) {
    for (const s of list) {
      if (now < s.cool) continue;
      const dx = x - s.sx, dy = y - s.sy, r = s.r * 1.4 + 8;
      if (dx * dx + dy * dy < r * r) {
        s.cool = now + 900;
        s.glow = 1;
        s.spinV += (Math.random() < 0.5 ? -1 : 1) * (2 + Math.random() * 2);
        return s;
      }
    }
    return null;
  };
})();
