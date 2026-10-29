(function () {
  "use strict";
  const S = window.Sekai, M = S.m, V = S.view, L = S.layout;
  const Q = (S.questions = {});
  const FONT = '300 {px}px "Segoe UI Variable Display", "Segoe UI", "PingFang SC", "Microsoft YaHei UI", sans-serif';
  const COME = 4.2, HOLD = 0.92, WAIT = 45, KEY = "chiyo-sekai-asked";
  const fine = matchMedia("(pointer: fine)").matches;

  // each answer leans toward one attribute; none of them is right or wrong
  const POOL = [
    ["风从远处吹来，你想到了什么？", [["远方", "calm"], ["某个人", "gentle"], ["出发", "drive"]]],
    ["如果时间可以停下一秒，你想停在哪里？", [["日落的时候", "calm"], ["相遇的那一刻", "gentle"], ["起跑之前", "drive"]]],
    ["现在最想听见什么声音？", [["雨声", "calm"], ["一句晚安", "gentle"], ["心跳", "drive"]]],
    ["一个人走路的时候，你会想什么？", [["什么也不想", "calm"], ["想念的人", "gentle"], ["下一步", "drive"]]],
    ["这一刻是什么颜色的？", [["淡蓝", "calm"], ["浅粉", "gentle"], ["金色", "drive"]]],
    ["如果可以变成一种东西？", [["一片云", "calm"], ["一盏灯", "gentle"], ["一阵风", "drive"]]],
    ["累了的时候，你会？", [["安静待着", "calm"], ["找人说说话", "gentle"], ["换个方向继续", "drive"]]],
    ["有人在远处等你，你会？", [["慢慢走过去", "calm"], ["挥挥手", "gentle"], ["跑过去", "drive"]]],
    ["哪一种光更像你？", [["月光", "calm"], ["烛光", "gentle"], ["晨光", "drive"]]],
    ["想给明天的自己留一句话吗？", [["不着急", "calm"], ["辛苦了", "gentle"], ["继续走", "drive"]]],
    ["下雨了。", [["听雨", "calm"], ["给谁撑伞", "gentle"], ["淋着跑回家", "drive"]]],
    ["这条路一直往前，会通向哪里？", [["海边", "calm"], ["家", "gentle"], ["没去过的地方", "drive"]]],
    ["一天里你最喜欢的时刻？", [["深夜", "calm"], ["黄昏", "gentle"], ["清晨", "drive"]]],
    ["如果能对过去的自己说一句话？", [["没关系", "calm"], ["谢谢你", "gentle"], ["别停下", "drive"]]],
    ["听见钟声了吗？", [["听见了", "calm"], ["想起一个人", "gentle"], ["该出发了", "drive"]]],
    ["你在等什么？", [["什么也不等", "calm"], ["一封信", "gentle"], ["一个开始", "drive"]]],
  ];
  const REPLY = {
    calm: ["嗯，慢慢来。", "就这样，也很好。", "风会记得的。"],
    gentle: ["会有人听见的。", "那一定很温暖。", "谢谢你告诉我。"],
    drive: ["那就出发吧。", "前面还有很远。", "光在前面。"],
  };

  const el = document.getElementById("question");
  let cur = null, nextAt = Infinity, hover = -1, token = 0, asked = [];
  try {
    asked = JSON.parse(localStorage.getItem(KEY)) || [];
  } catch (e) {}
  if (!Array.isArray(asked)) asked = [];

  function say(text) {
    const my = ++token;
    el.classList.remove("show");
    if (!text) return;
    setTimeout(() => {
      if (my !== token) return;
      el.textContent = text;
      el.classList.add("show");
    }, el.textContent ? 1400 : 0);
  }

  function ask(now) {
    let free = POOL.map((_, i) => i).filter((i) => !asked.includes(i));
    if (!free.length) {
      asked = [];
      free = POOL.map((_, i) => i);
    }
    const id = M.pick(free), [text, opts] = POOL[id];
    cur = { id, state: "come", t0: now, opts: opts.map(([label, k]) => ({ label, k, rect: null })) };
    cur.opts.sort(() => Math.random() - 0.5);
    hover = -1;
    say(text);
    S.emit("question");
  }

  function choose(i) {
    if (!cur || cur.state !== "come" || !cur.opts[i] || !cur.opts[i].rect) return false;
    const o = cur.opts[i], now = performance.now();
    cur.state = "chosen";
    cur.pick = i;
    cur.t1 = now;
    hover = -1;
    asked.push(cur.id);
    try {
      localStorage.setItem(KEY, JSON.stringify(asked));
    } catch (e) {}
    const x = o.rect.x + o.rect.w / 2, y = o.rect.y + o.rect.h / 2;
    S.mood.add(o.k, 3, x, y);
    S.fx.burst(x, y, S.mood.COL[o.k]);
    phrase(o.k, x);
    say(M.pick(REPLY[o.k]));
    const my = token;
    setTimeout(() => my === token && say(""), 8000);
    nextAt = now + 120000 + Math.random() * 60000;
    S.emit("played");
    return true;
  }

  function phrase(k, x) {
    if (!S.audio.ready) return;
    const t = S.audio.ctx.currentTime + 0.02, c = S.conductor.chordAt(t);
    let notes = c.notes.map((m) => m + 12);
    if (k === "calm") notes = notes.reverse();
    else if (k === "gentle") notes = [notes[0], notes[2], notes[1], notes[3]];
    else notes = notes.concat(notes[0] + 12);
    const pan = M.clamp((x / V.w) * 2 - 1, -1, 1) * 0.6, gap = k === "drive" ? 0.11 : 0.17;
    notes.forEach((m, i) =>
      S.voices.bell(t + i * gap, S.music.mtof(m), { vel: 0.5, pan, wet: 0.65, echo: 0.24, len: 1.3 })
    );
  }

  function leave(now) {
    cur.state = "leave";
    cur.t1 = now;
    hover = -1;
    say("");
    nextAt = now + 70000 + Math.random() * 40000;
  }

  // three answers side by side, shrunk together on narrow screens
  function layout(ctx) {
    let fs = M.clamp(Math.min(V.w, V.h) / 40, 13, 19);
    ctx.font = FONT.replace("{px}", fs);
    let ws = cur.opts.map((o) => ctx.measureText(o.label).width + fs * 2.6);
    const gap = fs * 1.6, total = ws.reduce((a, b) => a + b, 0) + gap * 2, k = Math.min(1, (V.w * 0.92) / total);
    fs *= k;
    ws = ws.map((w) => w * k);
    const xs = [V.cx - ws[1] / 2 - gap * k - ws[0] / 2, V.cx, V.cx + ws[1] / 2 + gap * k + ws[2] / 2];
    return { fs, ws, xs, h: fs * 2.4 };
  }

  function pill(ctx, x, y, w, h) {
    const r = Math.min(h / 2, w / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // each answer rises from the horizon like a note and settles just before the judge line
  function card(ctx, o, i, lay, now) {
    o.rect = null;
    const age = (now - cur.t0) / 1000 - i * 0.35;
    if (age <= 0) return;
    const p = M.clamp(age / COME, 0, 1), e = 1 - Math.pow(1 - p, 3);
    const s = L.depth(M.lerp(S.cfg.travel * 1.3, L.timeAt(HOLD), e)) / HOLD;
    let a = M.smooth(0, 0.25, p), lift = 0;
    if (cur.state === "chosen") {
      const q = (now - cur.t1) / 1000;
      if (i === cur.pick) {
        a *= 1 - M.smooth(0.3, 1.6, q);
        lift = q * 40;
      } else a *= 1 - M.smooth(0, 0.7, q);
    } else if (cur.state === "leave") a *= 1 - M.smooth(0, 1.4, (now - cur.t1) / 1000);
    if (a <= 0.01) return;
    const w = lay.ws[i] * s, h = lay.h * s, cx = V.cx + (lay.xs[i] - V.cx) * s;
    const base = L.floorY(s * HOLD), bob = p >= 1 && cur.state === "come" ? Math.sin(now * 0.0012 + i * 2) * 3 : 0;
    const x = cx - w / 2, y = base - h - 10 * s + bob - lift;
    if (cur.state === "come" && p > 0.55) o.rect = { x, y, w, h };
    const hot = hover === i || (cur.state === "chosen" && i === cur.pick);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.save();
    ctx.translate(cx, base);
    ctx.scale(1, 0.28);
    const pr = w * 0.75, g = ctx.createRadialGradient(0, 0, 0, 0, 0, pr);
    g.addColorStop(0, hot ? "rgba(246,196,212,0.6)" : "rgba(255,250,246,0.5)");
    g.addColorStop(1, "rgba(255,250,246,0)");
    ctx.fillStyle = g;
    ctx.fillRect(-pr, -pr, pr * 2, pr * 2);
    ctx.restore();
    ctx.fillStyle = hot ? "rgba(246,186,206,0.24)" : "rgba(196,176,226,0.16)";
    pill(ctx, x - 5 * s, y - 5 * s, w + 10 * s, h + 10 * s);
    ctx.fill();
    ctx.fillStyle = hot ? "rgba(255,248,250,0.97)" : "rgba(255,251,247,0.93)";
    ctx.strokeStyle = hot ? "rgba(226,140,170,0.85)" : "rgba(160,138,180,0.5)";
    ctx.lineWidth = 1;
    pill(ctx, x, y, w, h);
    ctx.fill();
    ctx.stroke();
    if (s > 0.35) {
      ctx.globalAlpha = a * M.smooth(0.35, 0.6, s);
      ctx.fillStyle = "#6e607c";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = FONT.replace("{px}", (lay.fs * s).toFixed(1));
      ctx.fillText(o.label, cx, y + h / 2 + 0.5);
      if (fine && s > 0.9) {
        ctx.globalAlpha = a * 0.6;
        ctx.fillStyle = M.rgba(S.time.pal.ink, 1);
        ctx.font = FONT.replace("{px}", (lay.fs * 0.7).toFixed(1));
        ctx.fillText(String(i + 1), cx, y + h + 10 * s + lay.fs * 0.55);
      }
    }
    ctx.restore();
  }

  Q.draw = function (ctx, now) {
    if (!cur) {
      if (now >= nextAt) ask(now);
      return;
    }
    if (cur.state === "come" && now - cur.t0 > WAIT * 1000) leave(now);
    if (cur.state !== "come" && now - cur.t1 > 2200) {
      cur = null;
      return;
    }
    const lay = layout(ctx);
    cur.opts.forEach((o, i) => card(ctx, o, i, lay, now));
  };

  Q.hover = function (x, y) {
    hover = -1;
    if (!cur || cur.state !== "come") return false;
    cur.opts.forEach((o, i) => {
      const r = o.rect;
      if (r && x >= r.x - 6 && x <= r.x + r.w + 6 && y >= r.y - 8 && y <= r.y + r.h + 8) hover = i;
    });
    return hover >= 0;
  };
  Q.hit = (x, y) => Q.hover(x, y) && choose(hover);
  Q.key = function (code) {
    const m = /^(?:Digit|Numpad)([1-3])$/.exec(code);
    return !!m && choose(+m[1] - 1);
  };
  Q.busy = () => !!cur;
  Q.start = (delay) => (nextAt = performance.now() + delay);
})();
