# 千代世界 · Chiyo Sekai（time-travelling）

一个浅色、空旷、类似 Arcaea 光之世界的交互音乐网页。玩家点击 / 拖动 / 按键发出不同音调的声音，背景有缓慢的节奏和和声，天空按加速的昼夜循环变化，用来感受平静和时间流逝。名字只以很淡的小字出现。

当前版本见 `VERSION`，变更记录见 `CHANGELOG.md`，声音与画面的设计细节见 `docs/design.md`。

## 运行
- 直接双击 `index.html` 即可（file:// 可用，无构建、无依赖、无网络请求）。
- URL 参数（调试 / 想直接看某个时段时用）：
  - `?hour=17.5` 起始的世界时刻（默认 5.5，即黎明前）
  - `?day=720` 一个世界日对应的真实秒数（默认 720 = 12 分钟）

## 结构
```
index.html          页面骨架（canvas + HUD + 入口遮罩）
css/style.css       HUD / 入口 / 浮现文字样式
js/core.js          命名空间 window.Sekai、配置、数学/颜色/种子随机、事件、音阶、屏幕布局与透视
js/time.js          世界时间、日月位置、天空调色板关键帧
js/audio/engine.js  AudioContext、混响、乒乓延迟、压缩、每个声部的 strip()、heard() 听感时钟
js/audio/voices.js  一次性音色：bell（天空）、drop（水面）、chime（碎片）、pluck（拖动 Karplus-Strong）
js/audio/layers.js  持续音色：arc（拖动长音）、pad、wind、pulse（心跳）、tick（钟）
js/audio/conductor.js  和弦进行、提前调度（lookahead）、旋律随机游走、黎明/黄昏动机、扫弦
js/scene/sky.js     天空渐变、星、日月、云、远处废墟、水面倒影
js/scene/floor.js   镜面地面、轨道、拍线、判定线、下落音符
js/scene/shards.js  漂浮玻璃碎片（可碰响）、尘埃
js/scene/effects.js 涟漪、菱形光爆、轨道命中、拖尾、自绘光标
js/ui.js            入口、HUD 时钟、空闲淡出、提示、按钮、低语文字、localStorage 停留记录
js/input.js         指针 / 键盘 → 声音与特效
js/main.js          resize、帧循环、进入世界
```

## 约定
- 普通 `<script>` 按顺序加载，共享 `window.Sekai`；**不要改成 ES module**（file:// 下会被 CORS 拦截）。
- 文件保持在 ~200 行内，按职责拆分。
- 背景必须一直是浅色，夜晚也只是偏淡紫，不要做成深色。
- 不加分数、判定、失败这类有压力的机制。
- 所有玩家能发出的音都在 D 大调五声音阶里（`S.music`），所以随便按都不会和背景冲突。
- 画面与音频同步：音符和拍线用 `S.audio.heard()`（扣除输出延迟后的音频时钟）定位，不用 performance.now()。
- `S.cfg.lookahead` 必须大于 `S.cfg.travel`，否则音符会在轨道中途凭空出现。

## 测试（Windows + Git Bash）
- 语法检查：`for f in js/*.js js/audio/*.js js/scene/*.js; do node --check "$f"; done`
- 冒烟测试（无头 Edge + CDP，会点击/拖动/按键，打印音量峰值/RMS、状态和页面报错，截图到 `test-screenshots/`）：
  `node test-scripts/smoke.mjs`
- 各时段画面：`node test-scripts/hours.mjs 5.5 12.5 17.6 23`
- Edge 路径：`C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe`（本机没有 Chrome）；Node 26 自带 WebSocket，无需安装依赖。
- `test-screenshots/` 和 `test-scripts/.profile/`（无头浏览器临时配置）已在 `.gitignore` 中。
- 参考电平（v0.1.0）：环境声 RMS ≈ 0.04–0.07，交互时峰值 ≈ 0.4，无削波。
