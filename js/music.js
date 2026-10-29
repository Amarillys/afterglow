(function () {
  "use strict";
  const S = window.Sekai, R = S.reference;
  const $ = (id) => document.getElementById(id);
  const panel = $("music"), btn = $("btn-music"), file = $("music-file");
  const fmt = (s) => Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0");
  const AUDIO = /\.(flac|mp3|wav|ogg|m4a|aac|opus)$/i;

  function render() {
    const info = R.info(), listening = R.state === "listening";
    $("music-title").textContent = listening ? "正在聆听… " + Math.round(R.progress * 100) + "%" : R.name || "参考音乐";
    let sub = "拖入或选择一首曲子（flac / mp3 / wav），轨道和节拍会跟着它走";
    if (R.error) sub = R.error;
    else if (listening) sub = "分析节拍与调性，第一次需要几秒";
    else if (info) sub = (info.beat ? info.bpm + " BPM · " : "没有稳定的节拍 · ") + info.key + " · " + fmt(info.dur);
    $("music-sub").textContent = sub;
    panel.classList.toggle("has", !!info && !listening);
    btn.classList.toggle("on", R.state === "playing");
    $("music-play").textContent = R.state === "playing" ? "停止" : "播放";
    $("music-pick").textContent = info ? "换一首" : "选择曲子";
    if (!info) return;
    $("music-off").textContent = (info.offset > 0 ? "+" : "") + Math.round(info.offset * 1000) + " ms";
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
    else if (b.id === "music-play") R.state === "playing" ? R.stop() : R.play();
    else if (b.dataset.m) R.set({ mult: +b.dataset.m });
    else if (b.dataset.d) R.set({ density: b.dataset.d });
    else if (b.dataset.o && R.info()) R.set({ offset: R.info().offset + +b.dataset.o });
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
