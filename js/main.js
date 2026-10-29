(function () {
  "use strict";
  const S = window.Sekai, A = S.audio;
  const canvas = document.getElementById("world");
  const ctx = canvas.getContext("2d", { alpha: false });
  let last = performance.now();

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, S.cfg.maxDpr);
    const w = window.innerWidth, h = window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    S.layout.resize(w, h, dpr);
  }

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    S.time.update(now);
    const heard = A.ready ? A.heard() : 0;
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
    requestAnimationFrame(frame);
  }

  function enter() {
    if (A.init()) {
      A.resume();
      A.fadeTo(A.level, 3);
      S.conductor.start();
    }
    S.time.start();
    S.input.bind(canvas);
    S.mood.start();
    S.questions.start(50000);
    document.body.classList.add("entered");
  }

  addEventListener("resize", resize);
  resize();
  S.ui.initGate(enter);
  requestAnimationFrame(frame);
})();
