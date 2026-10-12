# Changelog

## [Unreleased]

### Fixed（2026-10-12，进度键名改为与被试绑定：续做在 General 链接下原本永不触发）

MindProbe 实测：**General Single / Multiple 链接下 JATOS 每次运行都分配新的 workerId**
（同一条链接连续三次运行得到 1221113 / 1221129 / 1221133；cookie 里只有
`JATOS_ID_<studyResultId>`，没有 worker 级 cookie，`workerType=GeneralMultiple`）。
因此旧键名 `exp1_fcdt:<workerId>` 每次都不同：`loadProgress()` 永远读到空、**续做永不触发**，
还会在 Batch Session 留下垃圾键。Personal 链接下 workerId 稳定（JATOS 把 worker 绑在链接上），
所以旧写法只在 Personal 链接上碰巧可用。

- 键名改为 `exp1_fcdt:<subjectHash>`（被试编号的 SHA-256 前 16 位）：同一个人换标签页 / 关窗重进 /
  换设备都落到同一个键，不同的人天然落到不同键，**不依赖链接类型**。
- 进度记录里不再重复存身份字段（键名已表达归属），记录恒为
  `{completedBlocks, resumeCount, updatedAt}`。
- 拿不到 `crypto.subtle` 时不再"写 null 再拒绝读"，而是直接关闭续做能力（不写不读不落键）。
- 模板 `jatos-storage-template@9d2ed64`；本仓库子模块指针已推进。

### Verified（2026-10-12，MindProbe 生产环境 smoke test）

- 新建 smoke Study `29081 exp1-fcdt 2.0.0 smoke`（component 49943，entry `exp1_fcdt.html`），
  **不改动任何生产 Study**。来源：本地 JATOS 3.11.1 建 Study → 官方 export 成 JZIP（UUID 全新）→
  导入 MindProbe；导入后资产与本地构建 **adler32+size 逐字节一致**（`assets` 干跑 0 changed）。
- 用 General Multiple 链接跑 debug 全流程：18 练习 + 5 正式 → 结束页；console 无 error；
  导出 `exp1_fcdt_1111.xlsx`（34,112 字节，3 个 sheet，18 行 K 值，含 `responseLabel`）。
- MindProbe Result Data 实测 10 条 NDJSON：`session_start`×1、`trial`×5、`checkpoint`×1、
  `final`×1、`csv_upload_attempt`×1、`csv_upload_status`×1；CSV result file
  `participant_1111_1268573.csv`（2,394 字节）已上传；`final` 带 `experiment_version 2.0.0-jatos-m.1`、
  `git_commit c0720c4`。
- **已知限制（本轮新发现，未改代码）**：进度键名含 `workerId`，要求它跨运行稳定。
  General Single / Multiple 链接下 JATOS **每次运行都分配新的 workerId**
  （实测同一条链接连续运行得到 1221113 / 1221129 / 1221133），因此键名每次都不同：
  续做不会触发，且会在 Batch Session 留下用不到的进度记录。Personal Single/Multiple
  链接不存在该问题（JATOS 把 worker 绑定在链接上）。已写入 README。
- **时序数据不能当验收证据**：`wait()` 基于 `requestAnimationFrame`，标签页被节流时会整帧跳过量程
  （MindProbe 实测出现过 500→998 ms、1000→2000 ms 的越界）。正式采集前必须在目标设备做
  光电/高速摄像实测，并按 `studyDurationActual` 剔除异常试次。

### Fixed（2026-10-12，真实 JATOS 3.11.1 实测发现并修复：进度清除在真机上静默失效）

在真实 JATOS 3.11.1（本地实例，带捆绑 JRE）上跑完整流程后才发现的问题——桩接受任何路径写法，因此单测看不见：

- **`jatos.batchSession.remove(path)` 的路径必须带前导 `/`**，否则服务端回
  `Failed to apply patch: Missing leading slash`，删除**不生效**：进度会永久留在服务端，
  于是「正常做完 9 个 block」的被试下次打开链接会被误判为"上次没做完"，被提示从第 9 组续做。
  已改为 `remove('/' + key)`，失败重试一次，真失败时 `console.warn` 而不是静默吞掉。
- **同一时刻只接受一个 batch session patch**（并发会回
  `Can send only one batch session patch at a time`）：所有写/删经队列串行化。
- **批次为空时 `batchSession.get()` 会抛异常**（不是返回 `undefined`）：读取整体包 try/catch。
- 删掉 `add` / `set(key, null)` 两个删除兜底分支：实测都不可用。
- 顺带修掉一处自己引入的死锁：重试若再次入队会等自己（`main()` 永不完成且 node 静默以 0 退出）。

以上全部在 `jatos-storage-template@b63c5ca`，本仓库子模块指针已推进。
该模板新增 `testBatchSessionRealApiContract`（照抄实测契约）、并发超时兜底与
`process.on('exit')` 兜底（把"Promise 队列自等导致的静默退出"变成失败）。

### Verified（2026-10-12，真实 JATOS 3.11.1 浏览器 smoke test）

- 本地 JATOS 3.11.1 建 Study（entry `exp1_fcdt.html`）+ 上传构建资产，用**真实 jatos.js** 跑通
  debug 全流程：18 练习 + 5 正式 → 结束页，console 无 error，导出 `exp1_fcdt_1111.xlsx`（34,140 字节）。
- 真实 jatos.js 的 API 形状已核对：`onLoad / addJatosIds / appendResultData / uploadResultFile /
  showBeforeUnloadWarning / endStudyWithoutRedirect / endStudyAjax / batchSession.{get,set,remove,find,add,clear}` 均存在，
  与本层假设一致。
- 真实 Batch Session 实测：写入记录字段恰为 `completedBlocks / resumeCount / subjectHash / updatedAt`，
  `subjectHash` 为 16 位十六进制、**不含原始被试编号**；`clearProgress()` 后新开页面读到 `undefined`。
- 另：`batchSession.test()` 不能当作"键是否存在"的判断（实测删除后仍返回 true），一律以 `get()` 为准。
- MindProbe 上新建 smoke Study `29081 exp1-fcdt 2.0.0 smoke`（component 49943，entry `exp1_fcdt.html`），
  资产与本地构建逐字节一致（adler32+size 全等）；4 个生产 Study 未改动。

### Changed（2026-10-12，存储层抽成共享模板 + 进度身份改单向哈希 + 删赘余守卫）

- **存储层改为共享模板**：`src/storage/`（`index.js` / `jatos-storage.js` / `supabase-storage.js`）与它的测试
  已抽成独立仓库 [1019zita/jatos-storage-template](https://github.com/1019zita/jatos-storage-template)，
  以 **git submodule** 挂在 `src/storage`。此前同一份存储层被复制到 5 个仓库并各自分叉，
  上一轮查到的「进度键名退化」「`resumeCount` 不递增」都是只改了一处造成的。
  入口 HTML 与 `build_study_assets.py` 的 `src/storage/...` 路径**保持不变**，因此没有连带改动。
  克隆本仓库后必须执行 `git submodule update --init --recursive`；`build_study_assets.py`
  在子模块缺失时会直接报错并提示该命令。
- **进度身份字段改单向哈希**：`subjectTail`（`subjectID` 末 6 位 = 身份证后 2 位 + 手机后 4 位，
  属 PII 片段）→ `subjectHash`（`SHA-256(subjectID)` 前 16 位十六进制）。哈希与归属比对
  都改由存储层自己做，实验脚本既不传也不读，原始编号不再出现在第二个地方。
  拿不到 `crypto.subtle`（非 HTTPS / 非 localhost）时 `loadProgress()` 一律返回 `null`（fail closed）。
  强度边界（10 位数字空间可离线穷举）写在模板 README 里，不当作密码学匿名化。
- **删赘余守卫**：实验侧的 `ownerOk` 归属校验分支去掉（已下沉到存储层）；
  `saveProgress` 的 payload 不再传 `subjectTail`。
- **测试位置随存储层移动**：`tests/storage-adapters.test.js` 已随存储层进入模板仓库，
  本仓库不再保留副本。测试命令改为
  `node --test src/storage/tests/storage-adapters.test.js tests/scientific-invariants.test.js`；
  模板侧新增「不同被试读同一个键必须拿不到别人进度」与「无 crypto 时 fail closed」两条回归。
- 本轮未改动任何科研设计、trial 数、随机化、时序、计分或数据字段语义。

### Fixed（2026-10-12，交付版自审修复：进度键名 / 续做计数 / 死数据 + 测试与真实 schema 对齐）

- **Batch Session 进度键名不再是 `exp:<workerId>`**：`exp1_fcdt.js` 调用
  `CLTStorage.initializeStorage` 时漏传 `experiment`，存储层退回默认名 `'exp'`，
  与 README / 本文件宣称的 `exp1_fcdt:<workerId>` 不符——同一 JATOS Study 下不同实验
  会共用同一个进度键、互相覆盖。修法两层：
  1. 调用方显式传 `experiment: EXPERIMENT_NAME`；
  2. 存储层把 `experiment` 与 `workerId` 都设为必需，缺任意一个即关闭续做能力并
     `console.warn`（宁可没有进度，也不能落到同一个键上）。
  实测（JATOS 桩 + 构建产物）：键名为 `exp1_fcdt:w-77`。
- **`resumeCount` 落地为真实续做次数**：原实现只读回写、从不递增，导出字段恒为 0。
  现在检测到可续做进度时 `resumeCount = (进度里的值) + 1`，并随进度写回，
  语义统一为「未续做 = 0，第 1 次续做 = 1」。实测：seed `resumeCount: 1` 重进后为 2。
- **删除死数据 `nextBlockStartSeed`**：写入 Batch Session 但读取端从不使用；
  试次序列的可复现性由 `formalPrngBaseSeed = p.rndSeed + 7919` 保证，不需要该字段。
- **`tests/storage-adapters.test.js` 与真实 schema 对齐并补回归**：
  - 新增 `testProgressRequiresExperimentName`：漏传 `experiment` 时必须不写出任何
    Batch Session 键（在修复前的代码上该断言失败，已验证）。
  - `testJatosAdapter` 的 fixture 原先还停在旧 schema（`1.0.0-jatos-m.1`、
    `responseKey: 'right'`、`completedTrials: 35`、`experimentType: 'CLT'`），
    现改为本实验真实写入的字段（`2.0.0-jatos-m.1`、`studyDuration` /
    `studyDurationActual`、无 `responseKey`、`completedTrials: 50`、`exp1_fcdt`）。
  - CSV 用例不再断言 `tired / attention` 列存在（本实验已不传 questionnaire），
    与 exp1_clt 侧一致；通用层对 legacy `questionnaire` 的透传能力改由
    `testJatosAdapter` 的 final record 断言覆盖。
  - 进度 fixture 里的 `prngSeedBeforeBuild / subjectHash` 是从未写过的字段，改为实际
    写入的 `completedBlocks / resumeCount / subjectTail / updatedAt`。
- 本轮未改动任何科研设计、trial 数、随机化、时序、计分或数据字段语义。

### Added

- JATOS append-only storage adapter, versioned asset build, deployment scripts, tests, and deployment documentation.

### Changed（2026-10-10，断点续做：JATOS Batch Session 线上暂存已完成 block，误触重进不必从头做）

研究者诉求：误触 / 浏览器后台被杀 / 关窗后重进，不必从头做 450 试次。两版（fcdt / clt）实现完全一致。

**核心不变量（续做安全前提）**：`buildFormalTrials` 每次开头把 PRNG 重置到
`formalPrngBaseSeed = p.rndSeed + 7919` 的固定基准——因此"跳过练习直接续做"与
"正常做完练习再进正式"得到的 450 试次序列**逐字段完全一致**。被试在任何时间点
重新进入，看到的试次顺序都相同，不会因续做而乱序。

**机制**：
- 存储层 `src/storage/jatos-storage.js` 基于 **JATOS Batch Session** 新增
  `loadProgress / saveProgress / clearProgress` 三接口（`index.js` 暴露、supabase 后端 no-op 降级）。
  选 Batch Session 而非 Result Data：后者只能 append、浏览器端读不回来，撑不起续做；
  Batch Session 是 JATOS 里唯一既持久（跨浏览器关闭）又能读回的机制。
- 键名 = `实验名 + ':' + workerId`（同 worker 重开拿到同 workerId，续做依赖此隔离）。
- 每个 block 完成时 `saveProgress` 写进度；正常结束 `clearProgress`；"重新开始" 也 `clearProgress`。
- **隐私红线**：Batch Session 对同批次被试可见，只存匿名化进度（`completedBlocks /
  resumeCount / subjectTail(末6位) / updatedAt`），**绝不写姓名 / 身份证 / 手机号**。
- 主程序 `exp1_fcdt.js`：setup 阶段读进度 → 指导语界面出现「继续 / 重新开始」选择条 →
  续做时跳过练习、从上次完成后的下一组开始；每行试次新增 append-only 字段
  `resumedFromBlock` / `resumeCount`（0 = 非续做）。

**后端说明**：JATOS 部署时 `build_study_assets.py` 自动把 `CLT_STORAGE_BACKEND` 从
`'supabase'` 替换为 `'jatos'` 并注入 `jatos.js`，**线上暂存/续做天然生效**；
源码 HTML 保持现有 supabase 配置不动（本地静态跑时 `loadProgress` 等 no-op 降级，
被试仍可从本地继续，实验不报错）。

**验证**：
- `tests/storage-adapters.test.js` 新增 `testJatosProgress` / `testProgressGracefulDegradation`
  （进度读写、键名隔离、隐私红线、写入失败自动重试、无 Batch Session 优雅降级）。
- `D:\workbuddy\exp1-fcdt-check\verify.js` 新增「续做不变量」断言：连续 3 次
  `buildFormalTrials` 序列逐字段一致（450 试次、15 条件×30、change/no-change 各 225 不变）。
- `?v=20261010mj5` → `?v=20261010mj6`。

### Changed（2026-10-10，新增防误触层 guard rails：实验进行中除规定操作外一切无效）


目的：避免被试误触 / 浏览器默认行为导致实验中断或数据丢失。两版（fcdt / clt）实现完全一致。

**拦截清单**

| 类别 | 拦截对象 |
|---|---|
| 浏览器刷新 / 关窗 | `beforeunload`（实验进行中弹"离开将丢失数据"提示；setup / finished 阶段不拦） |
| 浏览器后退 / 前进 | Backspace、Alt+←、Alt+→、`popstate`（加载时压入 dummy 历史项，后退即推回） |
| 快捷键 | F1–F12（含 F5 刷新 / F12 开发者工具）、Ctrl/Cmd+R、Ctrl+W、Ctrl+T、Ctrl+N、Ctrl+P、Ctrl+F、Ctrl+S、Alt+F4 |
| 全屏 / 焦点 | Esc（退出全屏）、`blur`、`visibilitychange`（仅告警，不清空数据、不终止试次） |
| 鼠标 | 全局 `contextmenu`（右键菜单）、`dragstart` / `drag`、`selectstart`、`copy` |
| 触屏 / 缩放 | 多指 `touchstart`、Ctrl+滚轮 `wheel`、`gesturestart` |
| 其他 | `e.repeat`（长按重复触发） |

**关键例外（2026-10-10 修复的致命 bug）**

全局 `keydown` 注册在 **capture 阶段**，对所有非放行键调用 `preventDefault()`。
若不排除表单字段，`preventDefault()` 会阻止字符插入输入框——**被试将无法填写姓名 /
身份证 / 手机号，实验直接跑不起来**。因此加了 `inFormField` 判定，且必须排在
`ALLOWED_KEYS` 的 blanket 屏蔽**之前** return。同时 `contextmenu` 也保留 setup 阶段
输入框里的右键菜单（便于粘贴身份证号），实验阶段（canvas）仍全屏蔽。

**验证**

- 新增 `D:\workbuddy\exp1-fcdt-check\verify_guard.js`：从两版源码抽取防误触层真实代码，
  用 stub DOM 跑行为仿真，**两版各 39 项断言全部通过**（含"输入框能打字""F5 仍被拦"
  "实验进行中字母键被屏蔽""空格键放行"等）。
- `tests/scientific-invariants.test.js` 新增断言：锁死 `inFormField` 存在性及其与
  blanket 屏蔽的**先后顺序**（防止以后重构时把放行逻辑移到屏蔽之后）。
- `?v=20261010mj4` → `?v=20261010mj5`。

### Changed（2026-10-10，指导语界面第三个示意图面板加注视点：与 exp1_clt 对齐）

- **fcdt 指导语 SVG 第三个面板**（保留间隔 1000ms）补加 `<circle cx="75" cy="75" r="3" fill="#000000"/>`：
  原版只画了灰色背景 + "1000ms" 文字标签，缺中央注视点示意图；与第 1、2、4 面板不一致。
  与 exp1_clt 一致（clt 的第三个面板早有注视点）。
- 文献依据（检索 Vogel/Luck 1997/2001、zhao2023 change localization、Heyselaar 2011 等）：
  保留间隔的注视点"持续显示"是经典 change detection 范式的标准设计（"blank screen with
  the exception of the central fixation spot"）。
- 实验 canvas 阶段的所有空屏已在前几轮全部加上 `drawFixation()`，无遗漏：
  - ITI 500ms：注视点；
  - 保留间隔 1000ms：注视点（与 clt 一致）；
  - 试次间 setTimeout 50ms 间隔：注视点（`drawBackground(); drawFixation();`）；
  - 练习结束 / 正式结束屏：阶段结束文字屏，无注视点（被试在按 SPACE 启动下一阶段前不需注视点）。
- 页面脚本版本号 `?v=20261010mj3` → `?v=20261010mj4`。

### Changed（2026-10-10，指导语界面不再泄露 block / 试次 / 休息时长数字）

- **指导语删"实验共 9 个 block，每个 block 50 个试次（共 450 试次），block 间休息 30 秒"**：
  避免被试在指导语阶段预知流程长度，避免锚定效应 / 提前疲惫。
  与 exp1_clt 一致：clt 指导语本就不含任何 block / 试次数 / 休息时长的字样。
- `tests/scientific-invariants.test.js` 新增 4 条反向断言：
  - HTML 不再含"实验共 N 个 block" / "每个 block N 个试次"；
  - HTML 不再含"试次"作为研究数字的字样；
  - HTML 不再含"block 间休息"。
- 页面脚本版本号 `?v=20261010mj2` → `?v=20261010mj3`。

### Changed（2026-10-10，删除实验后问卷：与 exp1_clt 同步去问卷）

- **HTML 删 `#questionnaire-phase` 整块**：两道量表（疲劳度 / 专注度）UI 节点全部移除。
  页面阶段编号从 1-7 重排为 1-6（删问卷后顺序不变）。
- **JS 删 `qStep / startQuestionnaire / handleQuestionnaire` 三个函数**：
  - `screens` 字典不再含 `questionnaire` 键；
  - `endBlock()` 最后一个 block 跑完后直接调 `finishExperiment()`，不再经问卷阶段；
  - 全局键盘 listener 移除 `experimentPhase === 'questionnaire'` 分支（不再监听 1-5 数字键）；
  - `finishExperiment()` 不再依赖 `p.attention`，用 `stimData.length > 0` 判定是否正常完成；
  - `saveFinalResult()` 不再传 `questionnaire` 字段（CLTStorage 通用层兼容 `undefined`，无副作用）；
  - 删 `stimData` 每行写 `tired / attention` 的循环，仅保留被试人口统计学字段回填；
  - `CLTStorage.finishExperiment()` 的 `message` 改用 `EXPERIMENT_NAME` 常量。
- **CSS 删 `.questionnaire-card / .scale-desc` 孤儿样式**（无 HTML 引用了）。
- **docs/MINDPROBE_DEPLOYMENT.md** 部署文档同步：明确"实验不收集实验后问卷数据"。
- **tests/storage-adapters.test.js** 兼容更新：保留 `questionnaire` 字段 fixture 测
  CLTStorage 通用层对问卷 payload 的兼容能力（CLT 仍可能用），加注释说明
  "fcdt 已不再传 questionnaire"。
- **tests/scientific-invariants.test.js** 新增 7 条反向断言：
  - HTML 不再有 `#questionnaire-phase / #q-tired / #q-attention` 节点；
  - JS 不再有 `startQuestionnaire / handleQuestionnaire / p.tired / p.attention / handleQuestionnaire(parseInt(e.key))`。
- 页面脚本版本号 `?v=20261010mj1` → `?v=20261010mj2`。

### Changed（2026-10-10，UI 文案收尾：与 exp1_clt 完全一致）

- **结束阶段关闭语**：`.start-hint` 由"您可以关闭此页面了。"改为
  "请检查数据是否自动下载，如已下载请关闭此页面，如未自动下载，请点击下方链接。"
  （与本地保存默认开启、`#manual-download` 手动下载链接配套）。
- **指导语删 `no-change` / `change` 括注**：`完全一致（no-change）` / `发生变化（change）`
  改为 `完全一致` / `发生变化`，与 exp1_clt 指导语一致；指导语区上方注释同步。
- **练习结束提示同步**：`鼠标左键 = 完全一致 (no-change) ｜ 鼠标右键 = 发生变化 (change)`
  改为 `鼠标左键 = 完全一致 ｜ 鼠标右键 = 发生变化`。
- **检查并保持中间休息阶段不动**：研究者曾指示"中间休息时把 change/no change 的内容去掉"；
  经核查，fcdt 当前的休息阶段只有"您的正确率为 X% / 请继续认真进行实验 /
  您可以继续休息或按【SPACE】开始下一组实验"，与 exp1_clt 完全一致，**没有 change/no-change 文字**。
  与研究者确认后选择**保持现状不动**。
- `tests/scientific-invariants.test.js` 新增 5 条反向断言：
  - 源码中不再出现"完全一致 (no-change)" / "发生变化 (change)"；
  - HTML 中不再出现"完全一致（no-change）" / "发生变化（change）"；
  - HTML 中不再出现旧的"您可以关闭此页面"。

### Changed（2026-10-10，本地保存默认开启 + setup 阶段去掉点选卡）

- **本地 Excel 保存默认始终开启**（与 exp1_clt 完全一致）：
  - `exp1_fcdt.html` setup 阶段删除"保存数据到本地 (Save to local CSV)"复选框 + label；
  - `exp1_fcdt.js` 启动时由 `p.saveLocal = document.getElementById('saveLocal').checked;`
    改为 `p.saveLocal = true;`（与 exp1_clt 的硬编码保持一致）。
  - 行为：被试跑完即自动下载 `exp1_fcdt_<SubjectID>.xlsx`；
    服务器 / JATOS 上传逻辑不受影响（`saveFinalResult` 仍照常运行）。
- 检查 exp1_clt 版本：HTML setup 阶段已无 `saveLocal` 复选框，
  `exp1_clt.js` 中 `p.saveLocal = true;` 是硬编码（注释明确"复选框已隐藏"），
  **无需再改**，与本次要求一致。
- `tests/scientific-invariants.test.js` 新增断言：
  - 正向 `p.saveLocal = true;` 必须存在；
  - 反向 `p.saveLocal = document.getElementById('saveLocal').checked` 必须已消失。

### Changed（2026-10-10，对齐 exp1_clt 范式命名：将 `FullProbe` / `full_probe` 统一为 `exp1_fcdt`）

- **页面文件重命名**：`full_probe.html` → `exp1_fcdt.html`，`full_probe.js` → `exp1_fcdt.js`。
  `index.html` 跳转、`<script src>`、HTML 内禁止缓存注释、版本号 `?v=` 同步更新。
- **导出 / 数据 / 构建标识统一**：
  - `EXPERIMENT_NAME` 仍为 `'exp1_fcdt'`（上一轮已统一）；
  - `experimentType` 字段由硬编码 `'FullProbe'` 改为 `EXPERIMENT_NAME` 常量；
  - `build_study_assets.py` 的 `experiment_type` 由 `"FullProbe"` 改为 `"exp1_fcdt"`，`ENTRY` 由 `full_probe.html` 改为 `exp1_fcdt.html`，`FILES` 列表同步更新；
  - `tests/storage-adapters.test.js` 的两条 fixture 同步 `experimentType: 'exp1_fcdt'`。
- **K 公式与函数名注释**：`// FullProbe 公式: K = ...` 改为 `// exp1_fcdt 公式: K = ...`；
  `showFullProbe` / `showFullProbePractice` 重命名为 `showProbe` / `showProbePractice`，
  去掉范式前缀，与 `EXPERIMENT_NAME` 常量呼应。
- **文档同步**：`README.md` 改 `exp1_fcdt.html` 路径、标注 `Web_Version/Full_Probe` 为历史名；
  `docs/MINDPROBE_DEPLOYMENT.md` 改 `node --check`、构建入口、Study 描述；
  `tests/scientific-invariants.test.js` 改读 `exp1_fcdt.js`。
- **console 标签**：试次自检的两条 console 改为 `[' + EXPERIMENT_NAME + ']` 模板拼接。
- 页面脚本版本号 `?v=20261009mj2` → `?v=20261010mj1`。

### Preserved（有意保留的历史溯源 / 真实标识）

- **AGENTS.md 中的 `cdt-fullprobe`**：这是 GitHub 真实仓库名（`1019zita/cdt-fullprobe`），
  ROOT 政策明确把 GitHub repository 作为 source of truth，禁止改名。
- **JATOS Study 标题 `CDT Full-Probe`**：这是 MindProbe / JATOS 部署目标的真实 Study 标题，
  ROOT 政策要求"所有写操作前必须精确核对 Study title"，不能改。
- **MATLAB 原脚本名 `FullProbe.m` / 资源名 `instruct_image_FullProbe.png`**：
  注释里保留并标注"仅作历史溯源"，便于跨语言 / 跨版本检索。
- **目录名 `D:\SWU\论文\实验程序\exp1-fcdt`**：本会话工作目录被进程占用，
  按既定操作约定（进程释放后才能改路径）等会话结束后再用 automation 收尾。


### Changed（2026-10-09，对齐 exp1_clt 的改动，经研究者批准）

- **实验设计**：set size 由 `[4, 6]` 改为 `[3, 4, 6]`；新增自变量**记忆阵列呈现时长**
  `[50, 200, 500, 1000, 2000] ms`。共 15 种条件（3 × 5），**每种条件 30 试次**，
  合计 450 试次；15 种条件整体洗牌一次后随机分布到 **9 个 block，每 block 50 试次**。
- **change / no-change 对半**：每个 (set size × 呈现时长) 单元内 change 与 no-change 各 15 次，
  全局 225 / 225。
- **只操纵呈现时长**：ITI（500 ms）与保留间隔（1000 ms）在所有试次上恒定，不随条件变化。
  旧的固定 `stimulusDuration: 250` 已移除，改为按试次取 `condition.studyDuration`，
  并新增 `studyDuration` / `studyDurationActual` 两个数据字段。
- **作答方式**：键盘 `z` / `/` 改为**鼠标左键 = 完全一致（no-change）、鼠标右键 = 发生变化（change）**；
  屏蔽浏览器右键菜单；同一次试次内锁定反应阶段，防止左右键连击重复记录。
- **练习**：20 试次（4 条件 × 5）改为 18 试次（3 set size × 2 change × 3），呈现时长逐试次随机。
- **block 间休息**：改为强制 ≥30 秒倒计时 + 正确率反馈，倒计时结束后按 SPACE 进入下一组
  （`BREAK_MIN_SECONDS = 30`）。
- **导出**：`K Values` 由「只按 set size 汇总」改为「每个 (set size × 呈现时长) 组合一行，共 15 行 + 3 行汇总」；
  新增 `Grouped Trials` 工作表（按 呈现时长 → set size 分组重排，附 GroupIndex / GroupLabel）。
  公式仍为 `K = N × (Hit − FA)`，未改动。
- **位置生成**：`getStimLocs` 增加 set size = 3 支持（随机空出一个象限，其余三象限各放一个色块）；
  4 / 6 的生成规则完全不变。
- 调试模式改为只覆盖 `runtimeNumBlocks` / `runtimeNumTrials` / `runtimeBreakLength`，
  不再改写 `prefs`，以便正式试次自检始终按完整科研设计校验。
- `build-info.json` 的 `response_mode` 由 `keyboard` 改为 `mouse`；VERSION 升至 `2.0.0-jatos-m.1`。
- 页面加入禁止缓存头与脚本版本号，避免浏览器加载旧的 `exp1_fcdt.js`。

### Changed（2026-10-09 第二轮，对齐 exp1_clt 的命名 / 输出 / 反应语义）

- **注视点全程连续显示**：与 exp1_clt 完全一致，**任何时刻都不消失、不闪烁**。
  ITI、记忆阵列、保留间隔、测试阵列每个阶段都先 `drawBackground()` 再 `drawFixation()`。
  修正了之前保留间隔只调 `drawBackground()` 导致「色块消失、注视点也跟着消失」的闪烁。
- **导出文件命名规则**：与 exp1_clt 完全一致，改为 `exp1_fcdt_<SubjectID>.xlsx`。
  新增 `const EXPERIMENT_NAME = 'exp1_fcdt'` 常量，并在 `downloadXLSX()` 内构造
  `EXPERIMENT_NAME + '_' + p.subjectID + '.xlsx'`。同时改用 `saveWorkbookFile()`
  写出（与 exp1_clt 完全相同：xlsx MIME + PK 魔数校验 + 结束界面手动下载链接）。
- **SubjectID 字符串化**：放弃 `parseInt` 解析，改用与 exp1_clt 完全一致的
  `buildSubjectID()` 字符串生成器（身份证号后 6 位 + 手机号后 4 位），
  保留前导 0（避免 0701231234 被吞成 701231234）。调试模式补 `p.subjectID = '1111'` 保持一致。
- **反应记录语义化**：导出的 `response` / `correctResponse` 字段使用同一套
  语义编码（0 = no-change / 完全一致，1 = change / 发生变化），
  不再写入「按了左键还是右键」的物理按键信息。
  每行额外附加 `responseLabel` / `correctResponseLabel`（值为 `"no-change"` / `"change"`），
  便于人眼阅读与跨范式对比。
- 三个工作表的结构、`ExperimentType` 字段、文件名规则与反应语义，全部对齐 exp1_clt。
- HTML 指导语补 `no-change` / `change` 标签；练习结束提示同步为
  "鼠标左键 = 完全一致 (no-change) ｜ 鼠标右键 = 发生变化 (change)"。
- 页面脚本版本号 `?v=20261009mj1` → `?v=20261009mj2`。

### Preserved

- 色块颜色选取与变化规则（9 色调色板不重复随机取；change 时新颜色必须取「记忆阵列中未出现过的颜色」）、
  位置生成算法（极坐标四象限）、计分规则、K 公式、问卷、被试字段与浏览器端 XLSX 导出。
