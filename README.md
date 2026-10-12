# CDT Full-Probe

全探测（Full-Probe）变化觉察工作记忆实验的静态网页版本。

## 在线运行

GitHub Pages 启用后，可从仓库首页对应的 Pages 地址进入；`index.html` 会跳转到 `exp1_fcdt.html`。

## 本地运行

在本目录启动任意静态 HTTP server，然后访问 `exp1_fcdt.html`。项目使用原生 HTML、CSS、JavaScript 和 Canvas，无需构建。

## 文件

- `exp1_fcdt.html`：实验页面与指导语
- `exp1_fcdt.js`：实验流程、刺激、响应、计分及 XLSX 导出
- `src/storage/`：**git submodule**，指向共享存储模板
  [1019zita/jatos-storage-template](https://github.com/1019zita/jatos-storage-template)；
  克隆本仓库后先执行 `git submodule update --init --recursive`，且不要在这里改存储层
- `style.css`：页面样式
- `index.html`：GitHub Pages 根入口

## 数据与隐私

本版本会要求输入姓名、性别、年龄、身份证号和手机号，并在浏览器端生成 XLSX。身份证号在导出前会被掩蔽，但姓名和手机号仍会写入导出数据。请仅在已经获得伦理审批、知情同意，并有适当数据保护措施的研究场景中使用。

源码中的 Supabase 地址与 key 是占位符；默认不会向服务器上传数据。不要把 service-role key、管理员密钥、真实被试数据或导出的 XLSX 提交到本仓库。

## 实验设计（2026-10-09 起）

| 项目 | 设置 |
|---|---|
| set size | 3 / 4 / 6 |
| 记忆阵列呈现时长（自变量） | 50 / 200 / 500 / 1000 / 2000 ms |
| 条件数 | 15（3 × 5），**每种条件 30 试次**，共 450 试次 |
| change / no-change | 对半分（每个条件内各 15 次，全局 225 / 225） |
| block 结构 | 9 个 block × 50 试次，block 间强制休息 30 秒 |
| 练习 | 18 试次（3 set size × 2 change × 3），呈现时长逐试次随机 |
| ITI / 保留间隔 | 500 ms / 1000 ms，**恒定，不随呈现时长变化** |
| 注视点 | 全程连续显示，任何时刻不消失、不闪烁（与 exp1_clt 完全一致） |
| 作答 | 鼠标左键 = 完全一致 (no-change)；鼠标右键 = 发生变化 (change) |
| 本地保存 | **默认始终开启**（setup 阶段不暴露点选卡；跑完自动下载 `exp1_fcdt_<SubjectID>.xlsx`） |
| 导出文件 | `exp1_fcdt_<SubjectID>.xlsx`（与 exp1_clt 命名规则一致；SubjectID 保留前导 0） |
| 防误触 | 实验进行中刷新 / 后退 / 关窗 / 快捷键 / 右键菜单 / 拖拽 / 缩放全部被拦截；仅 SPACE 与鼠标左右键有效。setup 阶段的表单输入与右键粘贴保留 |
| 断点续做 | 误触 / 关窗 / 后台被杀后重进，**不必从头做**：已完成 block 经 JATOS Batch Session 线上暂存，重进时从上次完成后的下一组继续（试次序列因 PRNG 基准固定而与首次完全一致）。指导语界面出现「继续 / 重新开始」选择条；仅 JATOS 后端生效，其它后端自动降级为从头开始。进度键名 = `exp1_fcdt:<subjectHash>`（被试编号的 SHA-256 前 16 位），**与被试绑定、不依赖链接类型**：同一个人换标签页 / 换设备都能续做，不同人天然隔离（2026-10-12 修正，此前用 `jatos.workerId`，在 General 链接下每次运行都变、续做永不触发） |
| 导出反应 | 记录「判断结果 (no-change / change)」与「正确判断」对齐，**不记录按了左键还是右键** |
| 容量 K | `K = N × (命中率 − 虚报率)` |

## 版本说明

这是 `Web_Version/exp1_fcdt` 的静态版本（范式名：exp1_fcdt；旧名 `Web_Version/Full_Probe` 仅作历史溯源）。发布准备增加了 Pages 入口、说明文件和忽略规则。
2026-10-09 之后按 `exp1_clt` 的改动同步更新了实验设计（set size、呈现时长、试次与 block 结构、
鼠标作答、休息屏与导出表），详见 `CHANGELOG.md`。色块颜色与位置的选取规则、计分规则与 K 公式保持不变。

## MindProbe/JATOS

迁移分支通过独立 storage adapter 将正式 trial 逐条追加到 JATOS，并在每个 block 写 checkpoint、正常结束写 final。练习数据仍只保留在浏览器内；设备端 XLSX 仍是便利副本。构建和部署说明见 `docs/MINDPROBE_DEPLOYMENT.md`。
