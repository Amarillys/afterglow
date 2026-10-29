(function () {
  "use strict";
  const S = window.Sekai, A = S.audio, M = S.m;
  const KEY = "chiyo-sekai-themes", KEEP = 6;
  const NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
  const GAP = { calm: 2, normal: 1, dense: 0.5 }; // minimum note spacing in beats

  // a song the player brings: its beat drives the track, its onsets become the falling notes
  const R = (S.reference = { state: "idle", name: "", progress: 0, error: "" });
  let buf = null, theme = null, prefs = null, id = "", src = null, gain = null, start = 0, quiet = 0;
  let list = [], li = 0, flashAt = -1, token = 0;

  function cache() {
    try {
      return JSON.parse(localStorage.getItem(KEY)) || { order: [], items: {} };
    } catch (e) {
      return { order: [], items: {} };
    }
  }
  function remember() {
    const c = cache();
    c.items[id] = { theme, prefs };
    c.order = [id].concat(c.order.filter((k) => k !== id));
    c.order.splice(KEEP).forEach((k) => delete c.items[k]);
    try {
      localStorage.setItem(KEY, JSON.stringify(c));
    } catch (e) {}
  }
  const changed = () => S.emit("reference");

  R.load = async function (file) {
    if (!A.ready || !file) return;
    R.stop();
    const my = ++token;
    Object.assign(R, { state: "listening", name: file.name.replace(/\.[^.]+$/, ""), progress: 0, error: "" });
    id = file.name + "|" + file.size + "|" + file.lastModified;
    S.conductor.hush();
    changed();
    try {
      const data = await file.arrayBuffer();
      const decoded = await A.ctx.decodeAudioData(data);
      if (my !== token) return;
      const hit = cache().items[id];
      const fresh = hit && hit.theme.v === S.analyze.version;
      theme = fresh ? hit.theme : await S.analyze(decoded, (p) => my === token && ((R.progress = p), changed()));
      if (my !== token) return;
      buf = decoded;
      prefs = Object.assign({ mult: 1, offset: 0, density: "calm" }, fresh ? hit.prefs : {});
      remember();
      R.play();
    } catch (e) {
      if (my !== token) return;
      Object.assign(R, { state: "idle", error: "这首曲子打不开（" + (e.name || "error") + "）" });
      buf = theme = null;
      changed();
    }
  };

  // starts once the world's already-scheduled notes have rung out, so two keys never overlap
  R.play = function () {
    if (!buf || R.state === "playing") return;
    const ctx = A.ctx, now = ctx.currentTime;
    start = Math.max(now + 0.6, S.conductor.quietAt() + 0.3);
    gain = ctx.createGain();
    gain.gain.value = 0;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(theme.gain, start + 0.8);
    const send = ctx.createGain();
    send.gain.value = 0.06;
    gain.connect(A.master);
    gain.connect(send).connect(A.verb);
    const s = (src = ctx.createBufferSource());
    s.buffer = buf;
    s.connect(gain);
    s.start(start);
    s.onended = () => s === src && finish();
    S.music.root = theme.key.root;
    R.state = "playing";
    flashAt = -1;
    rebuild(true);
    S.conductor.hush();
    changed();
  };

  function finish() {
    src = null;
    R.state = buf ? "ready" : "idle";
    S.music.root = 0;
    changed();
  }

  R.stop = function () {
    if (!src) return;
    const s = src, n = A.ctx.currentTime;
    src = null;
    gain.gain.cancelScheduledValues(n);
    gain.gain.setValueAtTime(gain.gain.value, n);
    gain.gain.linearRampToValueAtTime(0, n + 1.2);
    try {
      s.stop(n + 1.3);
    } catch (e) {}
    finish();
  };

  R.busy = () => R.state === "listening" || R.state === "playing";

  // a beat grid is only offered when the song has a clear, steady pulse
  R.grid = function () {
    if (R.state !== "playing" || theme.fit < 1.5) return null;
    const spb = theme.spb / prefs.mult;
    return { t0: start + theme.downbeat + prefs.offset, spb, bar: 4 * prefs.mult, every: spb < 0.5 ? 2 : 1 };
  };

  // the strongest onsets that are at least GAP beats apart; the top fifth are accents
  function rebuild(fromStart) {
    const gap = GAP[prefs.density] * (theme.spb / prefs.mult) * 0.98, keep = [];
    for (const n of theme.notes.slice().sort((a, b) => b.s - a.s)) {
      if (keep.every((k) => Math.abs(k.t - n.t) >= gap)) keep.push(n);
    }
    keep.sort((a, b) => a.t - b.t);
    const strong = keep.map((n) => n.s).sort((a, b) => a - b)[Math.floor(keep.length * 0.8)] ?? 1;
    list = keep.map((n) => ({ t: n.t, lane: n.lane, acc: n.s >= strong }));
    li = 0;
    if (!fromStart) {
      const done = A.ctx.currentTime + S.cfg.lookahead - start - prefs.offset;
      while (li < list.length && list[li].t < done) li++;
    }
  }

  R.tick = function (now) {
    if (R.state !== "playing") return;
    const horizon = now + S.cfg.lookahead;
    while (li < list.length && start + list[li].t + prefs.offset < horizon) {
      const n = list[li++];
      S.emit("note", { t: start + n.t + prefs.offset, lane: n.lane, motif: n.acc, ref: true });
    }
    const g = R.grid();
    if (g) {
      const k = Math.floor((horizon - g.t0) / (g.spb * g.bar * 4));
      if (k > flashAt && k >= 0) {
        flashAt = k;
        S.emit("chord", { t: g.t0 + k * g.spb * g.bar * 4 });
      }
    }
  };

  R.set = function (p) {
    if (!prefs) return;
    if ("mult" in p) prefs.mult = M.clamp(p.mult, 0.5, 2);
    if ("offset" in p) prefs.offset = M.clamp(Math.round(p.offset * 100) / 100, -0.3, 0.3);
    if ("density" in p && GAP[p.density]) prefs.density = p.density;
    remember();
    if (R.state === "playing") rebuild(false);
    changed();
  };

  R.info = function () {
    if (!theme) return null;
    const k = theme.key;
    return {
      bpm: Math.round(theme.bpm * prefs.mult), beat: theme.fit >= 1.5, key: NAMES[k.tonic] + (k.minor ? " 小调" : " 大调"),
      dur: theme.dur, notes: list.length, ...prefs,
    };
  };

  // strum / answer phrase while a song plays: a pentatonic cluster in the song's key
  R.chord = () => ({ notes: [57, 59, 62, 64].map((m) => m + S.music.root), bass: 38 + S.music.root, tones: [0, 1, 2, 3, 4] });
})();
