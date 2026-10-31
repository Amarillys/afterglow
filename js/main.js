(function () {
  "use strict";
  const S = window.Sekai, A = S.audio;
  const canvas = document.getElementById("world");
  const ctx = canvas.getContext("2d", { alpha: false });
  const IDLE_FPS = 3;
  let last = performance.now(), raf = 0, timer = 0, active = !document.hidden;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, S.cfg.maxDpr);
    const w = window.innerWidth, h = window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    S.layout.resize(w, h, dpr);
  }

  // full rate whenever the page is visible, focused or not; in a background tab or a minimized window
  // no drawing; world time and expired-note cleanup keep running at about 3 Hz
  function frame(now) {
    const dt = Math.min(0.5, (now - last) / 1000);
    last = now;
    S.time.update(now);
    const heard = A.ready ? A.heard() : 0;
    S.floor.update(heard, !document.hidden);
    if (!document.hidden) draw(now, dt, heard);
    schedule();
  }

  function schedule() {
    if (active) raf = requestAnimationFrame(frame);
    else timer = setTimeout(() => frame(performance.now()), 1000 / IDLE_FPS);
  }

  function setActive() {
    const on = !document.hidden;
    if (on === active) return;
    active = on;
    cancelAnimationFrame(raf);
    clearTimeout(timer);
    schedule();
  }

  function draw(now, dt, heard) {
    ctx.setTransform(S.view.dpr, 0, 0, S.view.dpr, 0, 0);
    S.sky.draw(ctx, now);
    S.floor.draw(ctx, now, heard);
    S.shards.draw(ctx, now, dt);
    S.shards.drawMotes(ctx, now);
    S.questions.draw(ctx, now);
    S.fx.draw(ctx, dt);
    S.input.update(now);
    S.fx.drawCursor(ctx, S.input.cursor);
    if (S.time.running) {
      S.ui.update();
      S.mood.update();
    }
  }

  function enter() {
    if (A.init()) {
      A.resume();
      A.fadeTo(A.level, 3);
      S.conductor.start();
      S.reference.resume();
    }
    S.time.start();
    S.input.bind(canvas);
    S.mood.start();
    S.questions.start(50000);
    document.body.classList.add("entered");
  }

  addEventListener("resize", resize);
  document.addEventListener("visibilitychange", setActive);
  resize();
  S.ui.initGate(enter);
  schedule();
})();
