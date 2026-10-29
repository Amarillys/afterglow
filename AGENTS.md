# 千代世界 · Chiyo Sekai（time-travelling）

一个浅色、空旷、类似 Arcaea 光之世界的交互音乐网页。玩家点击 / 拖动 / 按键发出不同音调的声音，背景有缓慢的节奏和和声，天空按加速的昼夜循环变化，用来感受平静和时间流逝。名字只以很淡的小字出现。

当前版本见 `VERSION`，变更记录见 `CHANGELOG.md`，声音与画面的设计细节见 `docs/design.md`。

## 运行
- 直接双击 `index.html` 即可（file:// 可用，无构建、无依赖、无网络请求）。
- URL 参数（调试 / 想直接看某个时段时用）：
  - `?hour=17.5` 起始的世界时刻（默认 5.5，即黎明前）
  - `?day=1440` 一个世界日对应的真实秒数（默认 1440 = 24 分钟，现实 1 秒 ≈ 世界 1 分钟）

## 结构
```
index.html          页面骨架（canvas + HUD + 入口遮罩）
css/style.css       HUD / 入口 / 浮现文字样式
js/core.js          命名空间 window.Sekai、配置、数学/颜色/种子随机、事件、音阶、屏幕布局与透视
js/time.js          世界时间、日月位置、天空调色板关键帧
js/audio/engine.js  AudioContext、混响、乒乓延迟、压缩、每个声部的 strip()、heard() 听感时钟
js/audio/voices.js  一次性音色：bell（天空，预渲染缓冲区）、drop（水面）、chime（碎片）、pluck（拖动 Karplus-Strong）
js/audio/layers.js  持续音色：arc（拖动长音）、pad、tide（起落的潮声）、pulse（心跳）、tick（钟）
js/audio/conductor.js  和弦进行、提前调度（lookahead）、旋律随机游走、黎明/黄昏动机、扫弦、全局节拍 grid()
js/audio/analyze.js   参考音乐分析：节拍网格、onset → 四条轨道的音符、调性、响度（纯计算，无状态）
js/audio/reference.js 节奏主题：把曲子的节奏和调性交给世界自己的铃 / 心跳 / 钟 / pad 演奏（原曲不播放），循环、缓存、切换
js/scene/sky.js     天空渐变、星、日月、云、远处废墟、水面倒影
js/scene/floor.js   镜面地面、轨道、拍线、判定线、下落音符
js/scene/shards.js  漂浮玻璃碎片（可碰响）、尘埃
js/scene/effects.js 涟漪、菱形光爆、轨道命中、拖尾、飞向属性面板的光点、自绘光标
js/mood.js         平静 / 温柔 / 动力 三个属性：存储、左上角面板、玩法加点、给音乐和判定线的倾向
js/questions.js    问答：题库、答案卡从轨道浮现、点击 / 数字键选择、回应
js/ui.js            入口、HUD 时钟、空闲淡出、提示、按钮、低语文字、localStorage 停留记录
js/music.js         ♪ 节奏主题面板（主题列表、速度、密度）与拖放
js/input.js         指针 / 键盘 → 声音与特效
js/main.js          resize、帧循环（聚焦全速 / 失焦 3 fps / 隐藏只走时间不画）、进入世界
```

## 约定
- 普通 `<script>` 按顺序加载，共享 `window.Sekai`；**不要改成 ES module**（file:// 下会被 CORS 拦截）。
- 文件保持在 ~200 行内，按职责拆分。
- 白天保持浅色；夜晚可以明显变暗（暗靛紫，不是纯黑），天空足够暗时 `body.night` 让界面文字自动变浅。
- 不加分数、判定、失败这类有压力的机制。
- 用户偏好：节奏慢、声部稀、颜色偏暖、字不要太小（v0.2.0 按这个方向调过一次）。
- 所有玩家能发出的音都在 D 大调五声音阶里（`S.music`），所以随便按都不会和背景冲突。
- 画面与音频同步：音符和拍线用 `S.audio.heard()`（扣除输出延迟后的音频时钟）定位，不用 performance.now()。
- 帧率：页面可见且聚焦时 requestAnimationFrame 全速；失焦或隐藏时改用 3 fps 的定时器，隐藏时只更新世界时间不绘制（这样日出日落的动机照常触发）。动画要用 dt 或绝对时间，dt 上限 0.5 s。
- `S.cfg.lookahead` 必须大于 `S.cfg.travel`，否则音符会在轨道中途凭空出现。
- 节拍只有一个来源：`S.conductor.grid()`（参考音乐播放时返回歌曲的网格）；调性只有一个来源：`S.music.root`。不要另起平行的节拍或调性。
- 参考曲子只是节奏和调性的来源，**永远不播放原曲**，也不做成打音游。节奏主题播放时，它代替生成调度器驱动同一套乐器（`S.conductor.note / chordOn / melody`）；切换时等已调度的音符响完再开始，避免两个调重叠。

## 测试（Windows + Git Bash）
- 语法检查：`for f in js/*.js js/audio/*.js js/scene/*.js; do node --check "$f"; done`
- 冒烟测试（无头 Edge + CDP，会点击/拖动/按键，打印音量峰值/RMS、状态和页面报错，截图到 `test-screenshots/`）：
  `node test-scripts/smoke.mjs`
- 性能 / 泄露：`node test-scripts/leak-check.mjs [秒]`（长时间压力下的节点数、渲染负载、堆、各声部调用频率）、`node test-scripts/cost-check.mjs [轮数] [过滤]`（固定图各部分和各声部爆发的渲染成本）、`node test-scripts/ab-check.mjs`（上一次提交 vs 工作区，交替对比同样负载下的渲染负载）。改铃的音色后跑 `node test-scripts/bell-compare.mjs`（缓冲区铃 vs 振荡器铃的逐采样误差）。排查记录见 `docs/perf-investigation.md`。渲染负载测量噪声约 ±3 个百分点，对比要多轮、交替顺序。
- 铃（`V.bell`）按（音高, 长度）预渲染成缓冲区（`bellBuffer`，LRU 32 个）。它的低通是在 `bellBuffer` 里按 Web Audio 规范的公式用 JS 算的，不是 BiquadFilterNode；改铃的截止频率或 Q 要改那里。
- 卷积混响占固定图渲染成本的大头（约 12 个百分点），成本随冲激长度增长；冲激在 -60 dB 处结束，不要再缩短（会改变空间感）。
- 帧率：`node test-scripts/fps-check.mjs`（聚焦 / 失焦 / 隐藏三种状态的绘制帧率和 CPU 时间）。cdp.mjs 默认开启焦点模拟，让无头窗口按聚焦处理。
- 节奏主题：`node test-scripts/smoke-ref.mjs [song.flac]`（会检查原曲没有被播放）；只看分析结果：`node test-scripts/analyze-check.mjs`；独立的 numpy 测速对照：`python test-scripts/tempo_check.py song.flac`。
- 本机有 ffmpeg / ffprobe 和 numpy。浏览器能直接解码 24-bit FLAC，不需要转 wav。音频文件已在 `.gitignore`。
- 各时段画面：`node test-scripts/hours.mjs 5.5 12.5 17.6 23`
- Edge 路径：`C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe`（本机没有 Chrome）；Node 26 自带 WebSocket，无需安装依赖。
- 截图按 `VERSION` 分目录存放（`test-screenshots/0.2.0/`），方便前后对比。
- 问答截图：`node test-scripts/hours.mjs --ask 1.5 9`（强制出题）。冒烟测试也会各用键盘和点击答一题。
- localStorage：`chiyo-sekai`（来访记录）、`chiyo-sekai-mood`（属性）、`chiyo-sekai-asked`（已问过的题）、`chiyo-sekai-themes`（最近 6 首曲子的节奏主题、设置和当前选择）。
- `test-screenshots/`、`test-results/`（测试原始输出）、`test-scripts/.profile/`（无头浏览器临时配置）、`test-scripts/.ab/`（ab-check 解出的旧版本）已在 `.gitignore` 中。
- 参考电平（v0.3.0）：环境声 RMS ≈ 0.04–0.08，交互时峰值 ≈ 0.45，无削波。
