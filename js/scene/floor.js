(function () {
  "use strict";
  const S = window.Sekai, M = S.m, V = S.view, T = S.time, L = S.layout;
  const floor = (S.floor = {});
  const TRAVEL = S.cfg.travel;
  const notes = [];
  const chords = [];
  const rnd = M.rng("chiyo sekai / floor");
  const glints = Array.from({ length: 46 }, () => ({
    u: (rnd() * 2 - 1) * 7, s: 0.06 + Math.pow(rnd(), 1.4) * 1.3, ph: rnd() * 6.28, sp: 0.4 + rnd(),
  }));

  S.on("note", (n) => notes.push({ ...n, hit: false }));
  S.on("chord", (c) => {
    chords.push(c.t);
    if (chords.length > 4) chords.shift();
  });

  function base(ctx) {
    const p = T.pal;
    const g = ctx.createLinearGradient(0, V.hy, 0, V.h);
    g.addColorStop(0, M.rgba(M.mix(p.hor, p.mid, 0.25), 1));
    g.addColorStop(0.35, M.rgba(M.mix(p.mid, p.top, 0.35), 1));
    g.addColorStop(1, M.rgba(M.mix(p.top, [236, 240, 252], 0.25), 1));
    ctx.fillStyle = g;
    ctx.fillRect(0, V.hy, V.w, V.h - V.hy);
  }

  function veil(ctx) {
    const g = ctx.createLinearGradient(0, V.hy, 0, V.h);
    g.addColorStop(0, M.rgba(T.pal.hor, 0.1));
    g.addColorStop(1, M.rgba(M.mix(T.pal.mid, [255, 255, 255], 0.3), 0.55));
    ctx.fillStyle = g;
    ctx.fillRect(0, V.hy, V.w, V.h - V.hy);
  }

  function glint(ctx, now) {
    ctx.fillStyle = "#fff";
    for (const g of glints) {
      const a = Math.pow(Math.max(0, Math.sin(now * 0.0007 * g.sp + g.ph)), 8);
      if (a < 0.02) continue;
      const x = L.floorX(g.u, g.s), y = L.floorY(g.s), r = 0.8 + g.s * 1.6;
      if (x < -10 || x > V.w + 10 || y > V.h) continue;
      ctx.globalAlpha = a * 0.85;
      ctx.beginPath();
      ctx.moveTo(x, y - r * 2);
      ctx.lineTo(x + r * 0.5, y);
      ctx.lineTo(x, y + r * 2);
      ctx.lineTo(x - r * 0.5, y);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function track(ctx, heard) {
    const sB = L.scaleAt(V.h), ink = T.pal.ink;
    let flash = 0;
    for (const t of chords) if (heard >= t) flash = Math.max(flash, Math.exp(-(heard - t) * 1.3));

    const fill = ctx.createLinearGradient(0, V.hy, 0, V.h);
    fill.addColorStop(0, "rgba(255,255,255,0)");
    fill.addColorStop(0.72, M.rgba([255, 255, 255], 0.42 + 0.14 * flash));
    fill.addColorStop(1, M.rgba([255, 255, 255], 0.3));
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(V.cx, V.hy);
    ctx.lineTo(L.floorX(1, sB), V.h);
    ctx.lineTo(L.floorX(-1, sB), V.h);
    ctx.closePath();
    ctx.fill();

    const line = (a) => {
      const g = ctx.createLinearGradient(0, V.hy, 0, V.h);
      g.addColorStop(0, M.rgba(ink, 0));
      g.addColorStop(0.75, M.rgba(ink, a));
      g.addColorStop(1, M.rgba(ink, a * 0.7));
      return g;
    };
    ctx.lineWidth = 1;
    [[[-1, 1], 0.42], [[-0.5, 0, 0.5], 0.2], [[-1.9, 1.9, -3.2, 3.2, -5.4, 5.4], 0.09]].forEach(([us, a]) => {
      ctx.strokeStyle = line(a);
      ctx.beginPath();
      for (const u of us) {
        ctx.moveTo(V.cx, V.hy);
        ctx.lineTo(L.floorX(u, sB), V.h);
      }
      ctx.stroke();
    });
  }

  function beats(ctx, heard) {
    const C = S.conductor;
    if (!C.running) return;
    const far = TRAVEL * 1.6;
    const b0 = Math.floor((heard - C.t0) / C.spb);
    ctx.strokeStyle = M.rgba(T.pal.ink, 1);
    for (let b = Math.max(0, b0); b <= b0 + Math.ceil(far / C.spb) + 1; b++) {
      const dt = C.t0 + b * C.spb - heard;
      if (dt < -0.15 || dt > far) continue;
      const s = L.depth(dt), y = L.floorY(s);
      ctx.globalAlpha = (b % 4 === 0 ? 0.42 : 0.16) * M.smooth(far, TRAVEL * 0.8, dt) * M.smooth(-0.15, 0.12, dt);
      ctx.lineWidth = (b % 4 === 0 ? 1.4 : 1) * Math.max(0.6, s);
      ctx.beginPath();
      ctx.moveTo(L.floorX(-1, s), y);
      ctx.lineTo(L.floorX(1, s), y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function hline(ctx, x0, x1, y) {
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(x1, y);
    ctx.stroke();
  }

  function judge(ctx, heard) {
    const C = S.conductor;
    let pulse = 0;
    if (C.running && heard > C.t0) pulse = Math.exp(-(((heard - C.t0) / C.spb) % 1) * C.spb * 5);
    const y = V.jy, x0 = L.floorX(-1, 1), x1 = L.floorX(1, 1);
    const wide = ctx.createLinearGradient(0, 0, V.w, 0);
    wide.addColorStop(0, "rgba(255,255,255,0)");
    wide.addColorStop(0.5, "rgba(255,255,255,0.55)");
    wide.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = wide;
    ctx.fillRect(0, y - 0.5, V.w, 1);
    ctx.lineCap = "round";
    ctx.strokeStyle = M.rgba([150, 210, 240], 0.16 + 0.3 * pulse);
    ctx.lineWidth = 8;
    hline(ctx, x0, x1, y);
    ctx.strokeStyle = "rgba(255,255,255,0.95)";
    ctx.lineWidth = 2;
    hline(ctx, x0, x1, y);
    ctx.strokeStyle = M.rgba(T.pal.ink, 0.22);
    ctx.lineWidth = 1;
    hline(ctx, x0, x1, y + 2.5);
    ctx.lineCap = "butt";
  }

  function rr(ctx, x, y, w, h, r) {
    r = Math.min(r, h / 2, w / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawNotes(ctx, heard) {
    for (let i = notes.length - 1; i >= 0; i--) {
      const n = notes[i], dt = n.t - heard;
      if (dt <= 0) {
        if (dt > -0.25) S.fx.laneHit(n.lane, n.motif);
        notes.splice(i, 1);
        continue;
      }
      if (dt > TRAVEL * 1.15) continue;
      const s = L.depth(dt), y = L.floorY(s), x = L.floorX(-0.75 + n.lane * 0.5, s);
      const hw = V.tw * 0.11 * s, hh = Math.max(1.4, 6 * s), pad = 4 * s;
      const a = M.smooth(TRAVEL * 1.15, TRAVEL * 0.9, dt);
      const col = n.motif ? [246, 168, 204] : [138, 166, 232];
      ctx.globalAlpha = a * 0.32;
      ctx.fillStyle = M.rgba(col, 1);
      rr(ctx, x - hw - pad, y - hh - pad, (hw + pad) * 2, (hh + pad) * 2, hh + pad);
      ctx.fill();
      ctx.globalAlpha = a;
      ctx.fillStyle = "#fff";
      ctx.strokeStyle = M.rgba(col, 0.9);
      ctx.lineWidth = Math.max(1, 1.5 * s);
      rr(ctx, x - hw, y - hh, hw * 2, hh * 2, hh);
      ctx.fill();
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function horizon(ctx) {
    const g = ctx.createLinearGradient(0, 0, V.w, 0);
    g.addColorStop(0, "rgba(255,255,255,0)");
    g.addColorStop(0.5, "rgba(255,255,255,0.9)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, V.hy - 0.5, V.w, 1.5);
  }

  floor.draw = function (ctx, now, heard) {
    base(ctx);
    S.sky.reflect(ctx, now);
    veil(ctx);
    glint(ctx, now);
    track(ctx, heard);
    beats(ctx, heard);
    judge(ctx, heard);
    drawNotes(ctx, heard);
    horizon(ctx);
  };
  floor.noteCount = () => notes.length;
})();
