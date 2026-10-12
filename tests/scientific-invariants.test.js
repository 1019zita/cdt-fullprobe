'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.resolve(__dirname, '..', 'exp1_fcdt.js'), 'utf8');

// --- 实验设计参数（2026-10-09 对齐 exp1_clt 的改动） ---
assert.match(source, /setSizes:\s*\[3,\s*4,\s*6\]/);
assert.match(source, /studyDurations:\s*\[50,\s*200,\s*500,\s*1000,\s*2000\]/);
assert.match(source, /change:\s*\[0,\s*1\]/);
assert.match(source, /numBlocks:\s*9/);
assert.match(source, /numTrials:\s*50/);
assert.match(source, /nEachCondition:\s*30/);
assert.match(source, /nPractice:\s*18/);
assert.match(source, /ITI:\s*500/);
assert.match(source, /retentionInterval:\s*1000/);
assert.match(source, /breakLength:\s*0\.5/);          // 0.5 分钟 = 30 秒

// --- 只操纵「记忆阵列呈现时长」，ITI 与保留间隔在所有试次上恒定 ---
assert.match(source, /await wait\(prefs\.ITI\)/);
assert.match(source, /await wait\(prefs\.retentionInterval\)/);
assert.match(source, /await wait\(condition\.studyDuration\)/);
assert.doesNotMatch(source, /prefs\.stimulusDuration/);   // 旧的固定 250ms 常量必须已移除

// --- change / no-change 对半（每条件 30 次 = 各 15 次） ---
assert.match(source, /const nPerChange = Math\.round\(prefs\.nEachCondition \/ prefs\.change\.length\)/);

// --- 鼠标作答：左键=完全一致(no-change)，右键=发生变化(change)；
//     导出的数据里只记录「判断结果」与「正确判断」，
//     不再区分按了左键还是右键（已脱敏为 RESP_NO_CHANGE/RESP_CHANGE 常量） ---
assert.match(source, /const responseType = \(e\.button === 0\) \? RESP_NO_CHANGE : RESP_CHANGE;/);
// 防误触层（2026-10-10）：contextmenu 已升级为 window 级全局屏蔽
// （带表单例外：setup 阶段输入框里保留右键菜单以便粘贴身份证号）
assert.match(source, /window\.addEventListener\('contextmenu', \(e\) => \{/);
// canvas 拖拽屏蔽（防止把色块拖出浏览器）
assert.match(source, /canvas\.addEventListener\('dragstart', \(e\) => e\.preventDefault\(\)\)/);

// --- 注视点全程显示：保留间隔也必须 drawBackground + drawFixation，不能留空屏 ---
assert.match(source, /drawBackground\(\); drawFixation\(\);\s*\n\s*await wait\(prefs\.retentionInterval\)/);

// --- 文件名规则：EXPERIMENT_NAME + '_' + subjectID + '.xlsx'（与 exp1_clt 完全一致） ---
assert.match(source, /const fileName = EXPERIMENT_NAME \+ '_' \+ p\.subjectID \+ '\.xlsx';/);
assert.match(source, /const EXPERIMENT_NAME = 'exp1_fcdt';/);

// --- SubjectID 必须用 buildSubjectID() 字符串生成（不解析为 parseInt） ---
assert.match(source, /function buildSubjectID\(\)/);
assert.match(source, /p\.subjectID = generatedID \|\| String\(Date\.now\(\)\)/);
assert.doesNotMatch(source, /p\.subjectID = parseInt\(/);   // 旧版解析前导 0 的 bug 必须已修复

// --- 评分与容量公式 ---
assert.match(source, /experimentType:\s*EXPERIMENT_NAME/);
assert.match(source, /ExperimentType:\s*EXPERIMENT_NAME/);
assert.match(source, /trialData\.accuracy\s*=\s*\(responseType === correctResponse\)\s*\?\s*1\s*:\s*0/);
assert.match(source, /const k = ss \* \(hitRate - faRate\)/);

// --- 反应记录同时写出「判断结果」与「正确判断」两份语义相同的字段：
//     数值（0/1）便于脚本处理、Label（no-change/change）便于人眼阅读 ---

// --- 断点续做（2026-10-10，与 exp1_clt 一致）：
//     ① buildFormalTrials 每次重置 PRNG 到固定基准 formalPrngBaseSeed，
//        保证跳过练习续做与正常流程的 450 试次序列完全一致；
//     ② 续做标记为 append-only 字段，不改动现有列语义 ---
assert.match(source, /const baseSeed = formalPrngBaseSeed !== 0 \? formalPrngBaseSeed : p\.rndSeed;\s*seedRandom\(baseSeed\);/);
assert.match(source, /formalPrngBaseSeed = p\.rndSeed \+ 7919/);
assert.match(source, /d\.resumedFromBlock = isResumedSession \? resumedFromBlock : 0/);
assert.match(source, /d\.resumeCount = isResumedSession \? resumeCount : 0/);
// 进度读写走 storage 通用层接口（Batch Session 仅 jatos 后端实现）
assert.match(source, /window\.CLTStorage\.loadProgress\(\)/);
assert.match(source, /window\.CLTStorage\.saveProgress\(/);
assert.match(source, /window\.CLTStorage\.clearProgress\(\)/);
assert.match(source, /trialData\.responseLabel = RESP_LABEL\[responseType\]/);
assert.match(source, /trialData\.correctResponseLabel = RESP_LABEL\[correctResponse\]/);

// --- 颜色规则不变：新颜色必须从「记忆阵列未使用过的颜色」里挑 ---
assert.match(source, /filter\(c => !usedColors\.includes\(c\)\)/);

// --- 存储与 block 流转 ---
assert.match(source, /window\.CLTStorage\.saveTrial\(completedRow\)/);
assert.match(source, /window\.CLTStorage\.saveCheckpoint/);
assert.match(source, /window\.CLTStorage\.saveFinalResult/);
assert.match(source, /currentBlock < runtimeNumBlocks/);

// --- 本地保存默认始终开启（与 exp1_clt 一致）：setup 阶段不暴露点选卡，
//     被试跑完即自动下载 exp1_fcdt_<SubjectID>.xlsx；
//     反向断言 setup 阶段不得再读取 #saveLocal.checked ---
assert.match(source, /p\.saveLocal = true;/);
assert.doesNotMatch(source, /p\.saveLocal = document\.getElementById\('saveLocal'\)\.checked/);

// --- 用户可见 UI 不暴露 no-change / change 数据列标签（与 exp1_clt 一致）：
//     指导语、练习结束提示、结束阶段都只写物理按键含义，不写数据列名。
//     反向断言：HTML 与 exp1_fcdt.js 中不再出现 "完全一致 (no-change)" / "发生变化 (change)" 之类括注 ---
const html = fs.readFileSync(path.resolve(__dirname, '..', 'exp1_fcdt.html'), 'utf8');
assert.doesNotMatch(source, /完全一致 \(no-change\)/);
assert.doesNotMatch(source, /发生变化 \(change\)/);
assert.doesNotMatch(html, /完全一致（no-change）/);
assert.doesNotMatch(html, /发生变化（change）/);
assert.doesNotMatch(html, /您可以关闭此页面/);

// --- 问卷阶段已删除（与 exp1_clt 同步去问卷）：
//     HTML 中不再有 #questionnaire-phase / q-tired / q-attention 节点；
//     JS 中不再有 startQuestionnaire / handleQuestionnaire / qStep / p.tired / p.attention。
//     最后一个 block 跑完后直接调用 finishExperiment，键盘不再处理 1-5 量表输入。
assert.doesNotMatch(html, /id="questionnaire-phase"/);
assert.doesNotMatch(html, /id="q-tired"/);
assert.doesNotMatch(html, /id="q-attention"/);
assert.doesNotMatch(source, /function startQuestionnaire\(/);
assert.doesNotMatch(source, /function handleQuestionnaire\(/);
assert.doesNotMatch(source, /p\.tired\s*=/);
assert.doesNotMatch(source, /p\.attention\s*=/);
assert.doesNotMatch(source, /handleQuestionnaire\(parseInt\(e\.key\)\)/);

// --- 指导语不再泄露"实验共 N 个 block、每个 block N 个试次"等研究设计数字（2026-10-10）：
//     避免被试在指导语阶段就预知流程长度、产生锚定效应或提前疲惫。
//     与 exp1_clt 一致：clt 指导语亦无任何 block / 试次数 / 休息时长的字样。
assert.doesNotMatch(html, /实验共\s*\d+\s*个\s*block/);
assert.doesNotMatch(html, /每个\s*block\s*\d+\s*个\s*试次/);
assert.doesNotMatch(html, /\d+\s*试次/);
assert.doesNotMatch(html, /block\s*间\s*休息/);

// --- 防误触层（2026-10-10）：实验进行中仅允许每个阶段规定的键 / 鼠标按键，
//     其他一切系统 / 浏览器事件一律被静默屏蔽。
//     关键防护措施在源码中必须存在：
//   - 屏蔽 Backspace / Alt+←→ 浏览器后退
//   - 屏蔽 F5 / F12 / Ctrl+R / Ctrl+W 等快捷键
//   - 屏蔽 beforeunload（实验进行中关窗 / 刷新提示）
//   - 屏蔽 popstate（浏览器后退）
//   - 屏蔽拖拽（dragstart / drag / selectstart）
//   - 屏蔽多指 / 滚轮缩放（touchstart / wheel / gesturestart）
//   - 屏蔽 visibilitychange 时的数据丢失
assert.match(source, /e\.key === 'Backspace' && !\(e\.target instanceof HTMLInputElement\)/);
assert.match(source, /isBlockedShortcut\(e\)/);
assert.match(source, /BLOCKED_SHORTCUTS\s*=\s*new Set\(\[\s*'F5',\s*'F12'/);
assert.match(source, /window\.addEventListener\('beforeunload'/);
assert.match(source, /history\.pushState\(\{ phase: 'experiment' \}, ''\)/);
assert.match(source, /window\.addEventListener\('popstate'/);
assert.match(source, /window\.addEventListener\('dragstart', \(e\) => e\.preventDefault\(\)\)/);
assert.match(source, /window\.addEventListener\('wheel', \(e\) => \{[\s\S]*?if \(e\.ctrlKey\) e\.preventDefault\(\)/);
assert.match(source, /window\.addEventListener\('touchstart', \(e\) => \{[\s\S]*?if \(e\.touches\.length > 1\)/);
assert.match(source, /document\.addEventListener\('visibilitychange'/);
// EXPERIMENT_NAME 与防误触层日志一致
assert.match(source, /\[' \+ EXPERIMENT_NAME \+ '\] 浏览器后退被屏蔽/);
assert.match(source, /\[' \+ EXPERIMENT_NAME \+ '\] 页面失焦/);

// --- 防误触层的关键例外（2026-10-10 修复的致命 bug，必须锁死）：
//     全局 keydown 走 capture 阶段并对非放行键 preventDefault()，
//     若不对表单字段放行，setup 阶段被试将无法输入姓名 / 身份证 / 手机号
//     （preventDefault 会阻止字符插入输入框），整个实验直接跑不起来。
//     因此 inFormField 判定必须存在，且必须在" blanket 屏蔽"之前 return。
assert.match(source, /const inFormField = \(e\.target instanceof HTMLInputElement\)/);
assert.match(source, /if \(inFormField\) return;/);
// 顺序断言：inFormField 的 return 必须出现在 ALLOWED_KEYS 的 blanket 屏蔽之前，
// 否则先被 preventDefault 就再也来不及放行了。
const guardBlock = source.slice(source.indexOf('// (1) 全局 keydown 第二层'));
const idxBlanket = guardBlock.indexOf('!ALLOWED_KEYS.has(e.key)');
const idxFormReturn = guardBlock.indexOf('if (inFormField) return;');
assert.ok(idxBlanket > 0, '必须存在 ALLOWED_KEYS 的 blanket 屏蔽');
assert.ok(idxFormReturn > 0, '必须存在 inFormField 放行');
assert.ok(
    idxFormReturn < idxBlanket,
    '表单放行必须排在 blanket 屏蔽之前（否则 setup 阶段无法输入）'
);

// --- 右键菜单：实验阶段（canvas）全屏蔽，但 setup 表单里保留（便于粘贴身份证号）；
//     文本输入框的右键菜单没有任何导航项，不会导致实验中断。
assert.match(
    source,
    /window\.addEventListener\('contextmenu', \(e\) => \{[\s\S]*?HTMLInputElement[\s\S]*?e\.preventDefault\(\);[\s\S]*?\}\);/
);

console.log('scientific-invariants.test.js: PASS');
