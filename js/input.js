(function () {
  "use strict";
  const S = window.Sekai, M = S.m, V = S.view, L = S.layout, A = S.audio, Vo = S.voices;
  const input = (S.input = { cursor: { x: 0, y: 0, visible: false, down: false } });
  const ptrs = new Map();
  const panAt = (x) => M.clamp((x / V.w) * 2 - 1, -1, 1) * 0.85;

  // one note at screen (x, y): sky rings a bell, the floor drops into water
  function strike(x, y, deg, col) {
    const t = A.ctx.currentTime + 0.005, f = S.music.freq(deg), pan = panAt(x);
    const onBeat = Math.abs(S.conductor.beatOffset(A.heard() + 0.01)) < 0.07;
    if (y < V.hy) {
      Vo.bell(t, f, { pan, vel: 0.75, wet: 0.6, echo: 0.24 });
      S.fx.burst(x, y, col);
    } else {
      const s = L.scaleAt(y);
      Vo.drop(t, f, { pan, near: M.clamp(s * 0.8, 0, 1) });
      S.fx.ripple(x, y, s, col);
    }
    if (onBeat) {
      Vo.bell(t + 0.02, f * 2, { pan, vel: 0.25, wet: 0.7, echo: 0.3, len: 0.8 });
      S.fx.sparkle(x, y, col);
      S.emit("interact", { kind: "beat", x, y });
    }
    S.emit("played");
  }

  function chime(s) {
    const deg = Math.min(19, Math.round(L.degAt(s.sy)) + 4);
    Vo.chime(A.ctx.currentTime + 0.005, S.music.freq(deg), { pan: panAt(s.sx), vel: 0.8 });
    S.fx.sparkle(s.sx, s.sy, s.col);
    S.emit("interact", { kind: "soft", x: s.sx, y: s.sy });
  }

  function down(e) {
    A.resume();
    const x = e.clientX, y = e.clientY;
    if (S.questions.hit(x, y)) return;
    const col = x < V.w / 2 ? S.fx.CYAN : S.fx.PINK;
    const deg = Math.round(L.degAt(y));
    strike(x, y, deg, col);
    const hit = S.shards.touch(x, y, performance.now());
    if (hit) chime(hit);
    ptrs.set(e.pointerId, {
      x, y, deg, t: e.timeStamp, t0: e.timeStamp, moved: e.timeStamp, set: 0, level: 0, dist: 0,
      trail: S.fx.trailStart(x, y, col),
      arc: Vo.arc(S.music.freq(deg), panAt(x)),
    });
    try {
      e.target.setPointerCapture(e.pointerId);
    } catch (err) {}
  }

  function move(e) {
    const c = input.cursor;
    c.x = e.clientX;
    c.y = e.clientY;
    c.visible = e.pointerType === "mouse";
    const p = ptrs.get(e.pointerId);
    if (!p) {
      if (c.visible && S.questions.hover(c.x, c.y)) return;
      const hit = S.shards.touch(c.x, c.y, performance.now());
      if (hit) chime(hit);
      return;
    }
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
    for (const ev of evs.length ? evs : [e]) step(p, ev.clientX, ev.clientY, ev.timeStamp || e.timeStamp);
  }

  function step(p, x, y, ts) {
    const dist = Math.hypot(x - p.x, y - p.y), dt = Math.max(1, ts - p.t);
    p.x = x;
    p.y = y;
    p.t = ts;
    if (dist < 0.5) return;
    p.moved = ts;
    p.dist += dist;
    S.fx.trailAdd(p.trail, x, y);
    const deg = Math.round(L.degAt(y));
    if (deg !== p.deg) {
      const dir = deg > p.deg ? 1 : -1, n = Math.min(5, Math.abs(deg - p.deg)), t = A.ctx.currentTime + 0.005;
      for (let i = 1; i <= n; i++) Vo.pluck(t + (i - 1) * 0.045, S.music.freq(p.deg + dir * i), { pan: panAt(x), vel: 0.6 });
      p.deg = deg;
    }
    const hit = S.shards.touch(x, y, performance.now());
    if (hit) chime(hit);
    p.level = M.lerp(p.level, M.clamp(dist / dt / 1.2, 0.15, 1), 0.3);
    if (ts - p.set > 30) {
      p.set = ts;
      p.arc.set(S.music.freq(deg), panAt(x), p.level);
    }
  }

  function up(e) {
    const p = ptrs.get(e.pointerId);
    if (!p) return;
    const held = (e.timeStamp || p.t) - p.t0;
    if (p.dist > 160 && p.dist / Math.max(1, held) < 0.6) S.emit("interact", { kind: "soft", x: p.x, y: p.y });
    p.arc.release();
    S.fx.trailEnd(p.trail);
    ptrs.delete(e.pointerId);
    if (e.pointerType !== "mouse") input.cursor.visible = false;
  }

  // the hum fades when the pointer is held still
  input.update = function (now) {
    for (const p of ptrs.values()) {
      if (now - p.moved > 140 && p.level > 0.05) {
        p.level *= 0.9;
        if (now - p.set > 60) {
          p.set = now;
          p.arc.set(S.music.freq(p.deg), panAt(p.x), p.level);
        }
      }
    }
    input.cursor.down = ptrs.size > 0;
  };

  // three keyboard rows, an octave apart: bottom row on the water, top row in the sky
  const ROWS = [
    ["KeyZ", "KeyX", "KeyC", "KeyV", "KeyB", "KeyN", "KeyM", "Comma", "Period", "Slash"],
    ["KeyA", "KeyS", "KeyD", "KeyF", "KeyG", "KeyH", "KeyJ", "KeyK", "KeyL", "Semicolon"],
    ["KeyQ", "KeyW", "KeyE", "KeyR", "KeyT", "KeyY", "KeyU", "KeyI", "KeyO", "KeyP"],
  ];
  const KEYS = {};
  ROWS.forEach((row, r) => row.forEach((code, i) => (KEYS[code] = { deg: r * 5 + i, i, n: row.length })));

  function key(e) {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target && e.target.closest && e.target.closest("button")) return;
    if (S.questions.key(e.code)) return;
    if (e.code === "Space") {
      e.preventDefault();
      A.resume();
      S.conductor.strum();
      S.fx.wave();
      S.emit("played");
      return;
    }
    const k = KEYS[e.code];
    if (!k) return;
    A.resume();
    const x = V.w * (0.1 + (0.8 * k.i) / (k.n - 1)) + (Math.random() - 0.5) * 16;
    const y = L.yOfDeg(k.deg) + (Math.random() - 0.5) * 10;
    strike(x, y, k.deg, k.i < k.n / 2 ? S.fx.CYAN : S.fx.PINK);
  }

  function releaseAll() {
    for (const [id] of ptrs) up({ pointerId: id, pointerType: "mouse" });
  }

  input.bind = function (canvas) {
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
    canvas.addEventListener("pointerleave", (e) => {
      if (!ptrs.has(e.pointerId)) input.cursor.visible = false;
    });
    canvas.addEventListener("pointerover", (e) => document.body.classList.toggle("fine", e.pointerType === "mouse"));
    addEventListener("keydown", key);
    addEventListener("blur", releaseAll);
  };
})();
