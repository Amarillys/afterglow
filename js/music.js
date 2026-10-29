(function () {
  "use strict";
  const S = window.Sekai, R = S.reference;
  const $ = (id) => document.getElementById(id);
  const panel = $("music"), btn = $("btn-music"), file = $("music-file"), list = $("music-list");
  const DENS = { calm: "稀疏", normal: "适中", dense: "密集" };
  const AUDIO = /\.(flac|mp3|wav|ogg|m4a|aac|opus)$/i;

  function item(id, name, sub, on) {
    const b = document.createElement("button");
    b.dataset.id = id;
    b.classList.toggle("sel", on);
    const n = document.createElement("span");
    n.className = "nm";
    n.textContent = name;
    const s = document.createElement("small");
    s.textContent = sub;
    b.append(n, s);
    return b;
  }

  function render() {
    const info = R.info(), active = R.active();
    $("music-title").textContent = R.listening ? "正在聆听… " + Math.round(R.progress * 100) + "%" : "节奏主题";
    let sub = "加入一首曲子，世界会用自己的铃、心跳和钟，照着它的节奏和调性演奏（原曲不播放）";
    if (R.error) sub = R.error;
    else if (R.listening) sub = "分析节奏与调性，第一次需要几秒";
    else if (info) sub = info.name + " · " + (info.beat ? info.bpm + " BPM · " : "节拍不稳定 · ") + info.key + " · " + DENS[info.density];
    $("music-sub").textContent = sub;
    list.replaceChildren(
      item("", "世界的节奏", S.cfg.bpm + " BPM · 默认", !active),
      ...R.list().map((t) => item(t.id, t.name, t.bpm + " BPM", t.id === active))
    );
    panel.classList.toggle("has", !!info);
    btn.classList.toggle("on", !!active);
    if (!info) return;
    panel.querySelectorAll("[data-m]").forEach((b) => b.classList.toggle("sel", +b.dataset.m === info.mult));
    panel.querySelectorAll("[data-d]").forEach((b) => b.classList.toggle("sel", b.dataset.d === info.density));
  }

  btn.addEventListener("click", () => {
    panel.classList.toggle("open");
    btn.blur();
  });
  file.addEventListener("change", () => {
    if (file.files[0]) R.load(file.files[0]);
    file.value = "";
  });
  panel.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.id === "music-pick") file.click();
    else if ("id" in b.dataset) b.dataset.id ? R.use(b.dataset.id) : R.stop();
    else if (b.dataset.m) R.set({ mult: +b.dataset.m });
    else if (b.dataset.d) R.set({ density: b.dataset.d });
    b.blur();
  });

  addEventListener("dragover", (e) => e.preventDefault());
  addEventListener("drop", (e) => {
    e.preventDefault();
    const f = [...(e.dataTransfer?.files || [])].find((x) => /^audio\//.test(x.type) || AUDIO.test(x.name));
    if (!f || !document.body.classList.contains("entered")) return;
    panel.classList.add("open");
    R.load(f);
  });

  S.on("reference", render);
  render();
})();
