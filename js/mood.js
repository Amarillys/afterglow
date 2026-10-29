(function () {
  "use strict";
  const S = window.Sekai, V = S.view;
  const mood = (S.mood = {});
  const KEY = "chiyo-sekai-mood";
  const KINDS = ["calm", "gentle", "drive"];
  const COL = (mood.COL = { calm: [143, 180, 220], gentle: [233, 154, 180], drive: [232, 178, 108] });

  const val = { calm: 0, gentle: 0, drive: 0 };
  try {
    const d = JSON.parse(localStorage.getItem(KEY)) || {};
    KINDS.forEach((k) => (val[k] = Math.max(0, d[k] | 0)));
  } catch (e) {}
  // the panel number only counts up when the flying light lands
  const shown = { ...val };
  const rows = {};
  KINDS.forEach((k) => {
    const el = document.querySelector('#mood [data-k="' + k + '"]');
    rows[k] = { el, val: el.querySelector(".val"), bar: el.querySelector("b"), text: "", width: "" };
  });
  const save = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(val));
    } catch (e) {}
  };

  // a small prior keeps the first few points from swinging the world too far
  mood.mix = function () {
    const c = val.calm + 3, g = val.gentle + 3, d = val.drive + 3, sum = c + g + d;
    return { calm: c / sum, gentle: g / sum, drive: d / sum };
  };
  mood.tint = function () {
    const m = mood.mix();
    return [0, 1, 2].map((i) => COL.calm[i] * m.calm + COL.gentle[i] * m.gentle + COL.drive[i] * m.drive);
  };

  function pulse(k) {
    const el = rows[k].el;
    el.classList.remove("pulse");
    void el.offsetWidth;
    el.classList.add("pulse");
  }

  mood.add = function (k, n, x, y) {
    if (!(k in val) || n <= 0) return;
    val[k] += n;
    save();
    S.emit("mood", { k, n });
    const r = rows[k].val.getBoundingClientRect();
    const tx = r.left + r.width / 2, ty = r.top + r.height / 2;
    for (let i = 0; i < n; i++) {
      setTimeout(() => {
        const sx = x + (Math.random() - 0.5) * 30, sy = y + (Math.random() - 0.5) * 20;
        S.fx.fly(sx, sy, tx, ty, COL[k], 1.5 + Math.random() * 0.5, () => {
          shown[k] = Math.min(val[k], shown[k] + 1);
          pulse(k);
        });
      }, i * 180);
    }
  };

  mood.update = function () {
    const max = Math.max(1, val.calm, val.gentle, val.drive);
    KINDS.forEach((k) => {
      const row = rows[k], text = String(shown[k]), width = ((val[k] / max) * 100).toFixed(1) + "%";
      if (text !== row.text) row.val.textContent = row.text = text;
      if (width !== row.width) row.bar.style.width = row.width = width;
    });
  };

  // how you play counts a little too: playing on the beat, slow drags and shards, or just listening
  const tally = { beat: 0, soft: 0 };
  let lastPlay = performance.now();
  S.on("played", () => (lastPlay = performance.now()));
  S.on("interact", (e) => {
    tally[e.kind] = (tally[e.kind] || 0) + 1;
    if (e.kind === "beat" && tally.beat % 10 === 0) mood.add("drive", 1, e.x, e.y);
    if (e.kind === "soft" && tally.soft % 6 === 0) mood.add("gentle", 1, e.x, e.y);
  });
  mood.start = function () {
    setInterval(() => {
      const now = performance.now();
      if (document.hidden || now - lastPlay < 90000) return;
      lastPlay = now;
      mood.add("calm", 1, V.w / 2, V.h * 0.3);
    }, 5000);
  };
})();
