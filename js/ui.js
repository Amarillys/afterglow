(function () {
  "use strict";
  const S = window.Sekai, T = S.time;
  const ui = (S.ui = {});
  const $ = (id) => document.getElementById(id);
  const KEY = "chiyo-sekai";

  const load = () => {
    try {
      return JSON.parse(localStorage.getItem(KEY)) || {};
    } catch (e) {
      return {};
    }
  };
  const save = (d) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(d));
    } catch (e) {}
  };
  const human = (s) =>
    s < 60 ? "片刻"
      : s < 3600 ? Math.round(s / 60) + " 分钟"
      : Math.floor(s / 3600) + " 小时 " + Math.round((s % 3600) / 60) + " 分";

  const WHISPERS = [
    "风从很远的地方来", "时间在这里走得很慢", "光落在水面上", "什么也不必做",
    "听，钟在走", "一瞬也是千代", "云没有方向", "你来过这里", "这里一直都在", "影子慢慢变长",
  ];
  const AT_HOUR = { 6: "天亮了", 18: "日落了", 20: "星星出来了" };

  ui.initGate = function (onEnter) {
    const gate = $("gate"), mem = load();
    if (mem.visits) $("gate-memory").textContent = "来过 " + mem.visits + " 次 · 共停留 " + human(mem.total || 0);
    let done = false;
    const go = (e) => {
      if (done) return;
      if (e.type === "keydown" && (e.repeat || e.ctrlKey || e.metaKey || e.altKey || !(e.key === "Enter" || e.key.length === 1))) return;
      done = true;
      removeEventListener("keydown", go);
      gate.classList.add("leaving");
      setTimeout(() => (gate.style.display = "none"), 2800);
      onEnter();
      session();
      hint();
      whispers();
    };
    gate.addEventListener("click", go);
    addEventListener("keydown", go);
    buttons();
    idle();
  };

  function session() {
    const mem = load();
    mem.visits = (mem.visits || 0) + 1;
    const base = mem.total || 0, t0 = performance.now();
    const persist = () => {
      mem.total = base + (performance.now() - t0) / 1000;
      mem.last = Date.now();
      save(mem);
    };
    persist();
    setInterval(persist, 15000);
    addEventListener("pagehide", persist);
    document.addEventListener("visibilitychange", () => document.hidden && persist());
  }

  const clockEl = $("clock-time"), subEl = $("clock-sub");
  let lastClock = "", lastSub = "";
  let dark = false;
  ui.update = function () {
    const lum = T.pal.lum;
    if (dark ? lum > 0.64 : lum < 0.6) document.body.classList.toggle("night", (dark = !dark));
    const c = T.clock();
    if (c !== lastClock) clockEl.textContent = lastClock = c;
    const sub = "第 " + T.day + " 日 · 停留 " + T.duration(T.elapsed);
    if (sub !== lastSub) subEl.textContent = lastSub = sub;
  };

  function idle() {
    let timer = 0;
    const wake = () => {
      document.body.classList.remove("idle");
      clearTimeout(timer);
      timer = setTimeout(() => document.body.classList.add("idle"), 7000);
    };
    ["pointermove", "pointerdown", "keydown"].forEach((ev) => addEventListener(ev, wake, { passive: true }));
    S.on("mood", wake);
    wake();
  }

  function hint() {
    const el = $("hint");
    const show = setTimeout(() => el.classList.add("show"), 4500);
    const hide = () => {
      clearTimeout(show);
      el.classList.remove("show");
    };
    setTimeout(hide, 16000);
    S.on("played", () => setTimeout(hide, 2500));
    S.on("question", hide);
  }

  function buttons() {
    const snd = $("btn-sound"), full = $("btn-full"), de = document.documentElement;
    snd.addEventListener("click", () => {
      const m = !S.audio.muted;
      S.audio.setMuted(m);
      document.body.classList.toggle("muted", m);
      snd.blur();
    });
    if (!de.requestFullscreen) full.style.display = "none";
    full.addEventListener("click", () => {
      if (document.fullscreenElement) document.exitFullscreen();
      else de.requestFullscreen().catch(() => {});
      full.blur();
    });
  }

  function whispers() {
    const el = $("whisper");
    let busy = false, deck = [];
    const take = () => {
      if (!deck.length) deck = WHISPERS.slice().sort(() => Math.random() - 0.5);
      return deck.pop();
    };
    const show = (text) => {
      if (busy || document.hidden || S.questions.busy()) return;
      busy = true;
      el.textContent = text;
      el.style.left = 30 + Math.random() * 40 + "%";
      el.style.top = 14 + Math.random() * 14 + "%";
      requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add("show")));
      setTimeout(() => el.classList.remove("show"), 9000);
      setTimeout(() => (busy = false), 15000);
    };
    const loop = (delay) => setTimeout(() => (show(take()), loop(110000 + Math.random() * 70000)), delay);
    loop(55000);
    S.on("hour", (h) => AT_HOUR[h] && show(AT_HOUR[h]));
    S.on("question", () => el.classList.remove("show"));
  }
})();
