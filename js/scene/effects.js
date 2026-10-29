(function () {
  "use strict";
  const S = window.Sekai, M = S.m, V = S.view, L = S.layout, T = S.time;
  const fx = (S.fx = {});
  const TAU = Math.PI * 2;
  const CYAN = [132, 192, 228], PINK = [240, 156, 186], GOLD = [246, 200, 150], WHITE = [255, 255, 255];
  const items = [], sparks = [], trails = [];
  fx.CYAN = CYAN;
  fx.PINK = PINK;

  function spray(x, y, n, speed, cols) {
    for (let i = 0; i < n && sparks.length < 260; i++) {
      const a = Math.random() * TAU, v = speed * (0.3 + Math.random() * 0.7);
      sparks.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - speed * 0.25,
        age: 0, life: 1 + Math.random(), r: 1 + Math.random() * 1.8, col: M.pick(cols),
      });
    }
  }

  fx.ripple = (x, y, s, col) => items.push({ k: "ripple", x, y, s, col, age: 0, life: 3 });
  fx.burst = (x, y, col) => {
    items.push({ k: "burst", x, y, col, age: 0, life: 1.6, rot: Math.random() * 0.4 });
    spray(x, y, 8, 80, [col, WHITE, GOLD]);
  };
  fx.laneHit = (lane, motif) => {
    const x = L.floorX(-0.75 + lane * 0.5, 1);
    items.push({ k: "lane", x, y: V.jy, col: motif ? PINK : CYAN, age: 0, life: 1.1 });
    spray(x, V.jy, motif ? 6 : 3, 50, [motif ? PINK : CYAN, WHITE]);
  };
  fx.wave = () => items.push({ k: "wave", x: V.cx, y: V.jy, age: 0, life: 3.4 });
  fx.sparkle = (x, y, col) => spray(x, y, 5, 45, [col || WHITE, WHITE]);

  fx.trailStart = (x, y, col) => {
    const tr = { pts: [{ x, y, t: 0 }], col, live: true, clock: 0 };
    trails.push(tr);
    return tr;
  };
  fx.trailAdd = (tr, x, y) => {
    const last = tr.pts[tr.pts.length - 1];
    if (Math.hypot(x - last.x, y - last.y) > 3) tr.pts.push({ x, y, t: tr.clock });
  };
  fx.trailEnd = (tr) => (tr.live = false);

  function drawRipple(ctx, it) {
    const sc = Math.max(0.25, it.s);
    for (let i = 0; i < 3; i++) {
      const a = it.age - i * 0.24;
      if (a <= 0) continue;
      const t = a / it.life, e = 1 - Math.pow(1 - Math.min(1, t), 3);
      const rx = (12 + e * V.tw * 0.28) * sc * (1 - i * 0.18), ry = rx * 0.32;
      const alpha = (1 - t) * (1 - i * 0.28);
      if (alpha <= 0) continue;
      ctx.lineWidth = Math.max(0.8, 1.6 * sc);
      ctx.strokeStyle = M.rgba(it.col, 0.6 * alpha);
      ctx.beginPath();
      ctx.ellipse(it.x, it.y, rx, ry, 0, 0, TAU);
      ctx.stroke();
      ctx.strokeStyle = M.rgba(WHITE, 0.9 * alpha);
      ctx.beginPath();
      ctx.ellipse(it.x, it.y - 1, rx, ry, 0, 0, TAU);
      ctx.stroke();
    }
  }

  function diamond(ctx, x, y, r) {
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + r, y);
    ctx.lineTo(x, y + r);
    ctx.lineTo(x - r, y);
    ctx.closePath();
  }

  function drawBurst(ctx, it) {
    const t = it.age / it.life, e = 1 - Math.pow(1 - t, 3);
    ctx.save();
    ctx.translate(it.x, it.y);
    ctx.rotate(it.rot + e * 0.5);
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = M.rgba(it.col, 0.85 * (1 - t));
    diamond(ctx, 0, 0, 10 + e * 46);
    ctx.stroke();
    ctx.strokeStyle = M.rgba(WHITE, 0.9 * (1 - t));
    diamond(ctx, 0, 0, 6 + e * 26);
    ctx.stroke();
    ctx.restore();
    const f = Math.max(0, 1 - t * 3);
    if (f > 0) {
      const g = ctx.createRadialGradient(it.x, it.y, 0, it.x, it.y, 34);
      g.addColorStop(0, M.rgba(WHITE, 0.95 * f));
      g.addColorStop(0.3, M.rgba(it.col, 0.5 * f));
      g.addColorStop(1, M.rgba(it.col, 0));
      ctx.fillStyle = g;
      ctx.fillRect(it.x - 34, it.y - 34, 68, 68);
    }
    ctx.strokeStyle = M.rgba(it.col, 0.35 * (1 - t));
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(it.x, it.y, 18 + e * 90, 0, TAU);
    ctx.stroke();
  }

  function drawLane(ctx, it) {
    const t = it.age / it.life, a = 1 - t, w = V.tw * 0.12, h = V.h * 0.32 * (0.6 + 0.4 * t);
    const g = ctx.createLinearGradient(0, it.y - h, 0, it.y);
    g.addColorStop(0, M.rgba(it.col, 0));
    g.addColorStop(1, M.rgba(it.col, 0.22 * a));
    ctx.fillStyle = g;
    ctx.fillRect(it.x - w, it.y - h, w * 2, h);
    ctx.save();
    ctx.translate(it.x, it.y);
    ctx.scale(1, 0.55);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = M.rgba(WHITE, 0.95 * a);
    diamond(ctx, 0, 0, 8 + t * 34);
    ctx.stroke();
    ctx.strokeStyle = M.rgba(it.col, 0.7 * a);
    diamond(ctx, 0, 0, 4 + t * 20);
    ctx.stroke();
    ctx.restore();
  }

  function drawWave(ctx, it) {
    const t = it.age / it.life, e = 1 - Math.pow(1 - t, 2);
    for (let i = 0; i < 2; i++) {
      const rx = (0.1 + e * 0.9) * V.w * (1 - i * 0.3);
      ctx.strokeStyle = M.rgba(i ? CYAN : WHITE, 0.7 * (1 - t));
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(it.x, it.y, rx, rx * 0.12, 0, 0, TAU);
      ctx.stroke();
    }
  }

  const DRAW = { ripple: drawRipple, burst: drawBurst, lane: drawLane, wave: drawWave };

  function drawTrail(ctx, tr, dt) {
    tr.clock += dt;
    const keep = 1.8;
    while (tr.pts.length > 1 && tr.clock - tr.pts[0].t > keep) tr.pts.shift();
    if (!tr.live && (tr.pts.length < 2 || tr.clock - tr.pts[tr.pts.length - 1].t > keep)) return false;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    [[14, 0.08], [6, 0.22], [2.2, 0.75]].forEach(([w, a]) => {
      for (let i = 1; i < tr.pts.length; i++) {
        const p = tr.pts[i - 1], q = tr.pts[i];
        const k = 1 - (tr.clock - q.t) / keep;
        if (k <= 0) continue;
        ctx.strokeStyle = M.rgba(w < 3 ? M.mix(tr.col, WHITE, 0.35) : tr.col, a * k);
        ctx.lineWidth = w * (0.35 + 0.65 * k);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(q.x, q.y);
        ctx.stroke();
      }
    });
    ctx.lineCap = "butt";
    return true;
  }

  fx.draw = function (ctx, dt) {
    for (let i = trails.length - 1; i >= 0; i--) if (!drawTrail(ctx, trails[i], dt)) trails.splice(i, 1);
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      it.age += dt;
      if (it.age >= it.life) items.splice(i, 1);
      else DRAW[it.k](ctx, it);
    }
    for (let i = sparks.length - 1; i >= 0; i--) {
      const p = sparks[i];
      p.age += dt;
      if (p.age >= p.life) {
        sparks.splice(i, 1);
        continue;
      }
      p.vx *= Math.exp(-dt * 1.8);
      p.vy = p.vy * Math.exp(-dt * 1.8) - 8 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const a = 1 - p.age / p.life;
      ctx.fillStyle = M.rgba(p.col, a);
      diamond(ctx, p.x, p.y, p.r * (0.6 + a));
      ctx.fill();
    }
  };

  fx.drawCursor = function (ctx, c) {
    if (!c || !c.visible) return;
    const r = c.down ? 7 : 11;
    ctx.strokeStyle = M.rgba(T.pal.ink, 0.45);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(c.x, c.y, r, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.beginPath();
    ctx.arc(c.x, c.y, 2.2, 0, TAU);
    ctx.fill();
  };

  fx.count = () => items.length + sparks.length + trails.length;
})();
