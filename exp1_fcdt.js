// ============================================================
// exp1_fcdt.js
// 全探测变化觉察任务 (Full-Probe Change Detection Task)
// 范式名：exp1_fcdt（与导出文件名 / ExperimentType 字段一致）
// 基于 FullProbe.m (0630版) 实验规则（MATLAB 原脚本名仅作历史溯源保留）
//
// 实验设计（2026-10-09 对齐 exp1_clt 的改动）：
//   3 set size (3,4,6) × 5 呈现时长 (50/200/500/1000/2000 ms) = 15 种条件
//   每种条件 30 trial（change / no-change 各 15），共 450 trial
//   均分到 9 个 block（每 block 50 trial），block 间强制休息 30 秒
//   练习 18 trial（3 set size × 2 change × 3，呈现时长逐试次随机）
//
// 试次结构：
//   1. ITI              (500 ms)                   显示注视点
//   2. 记忆阵列         (50~2000 ms，按条件变化)    显示注视点
//   3. 保留间隔         (1000 ms，恒定)             显示注视点
//      注意：本实验只操纵「记忆阵列呈现时长」，
//            ITI 与保留间隔在所有试次上完全相同，不随条件变化。
//            注视点从 ITI 起一直到测试阵列全程连续显示，任何时刻都不消失、不闪烁
//            （与 exp1_clt 完全一致：每一帧重绘都先 drawBackground() 再 drawFixation()）。
//   4. 测试阵列         (无时间限制)                显示注视点
//      鼠标左键 = 完全一致(no-change)；鼠标右键 = 发生变化(change)
//
// 变化颜色规则（保持不变）：
//   change=1：被选方块变为一个 **未在记忆阵列中出现过的** 新颜色
//             （若所有颜色均已使用，则选不同于该方块原色的任意颜色）
//   change=0：所有方块保持原色
// ============================================================

let p = {};
let stimData = [];
let practiceData = [];
let currentBlock = 1;
let currentTrial = 0;
let blockTrials = [];
let experimentPhase = 'setup';

// --- 断点续做：PRNG 基准与续做状态（2026-10-10）---
// buildFormalTrials 每次都先把 PRNG 重置回正式试次基准起点，
// 这样无论是否跳过练习，450 试次的顺序都完全一致。
// formalPrngBaseSeed：练习开始前记录的 seed 值（即"正式试次"应有的 PRNG 起点）。
let formalPrngBaseSeed = 0;
// 本次进入实验时是否从断点恢复；用于导出时给每行试次打续做标记（append-only 字段）
let isResumedSession = false;
let resumedFromBlock = 0;   // 0 = 非续做；N = 从第 N 组（block）续做
let resumeCount = 0;        // 本被试累计续做次数（第 1 次续做 = 1）

// --- 实验参数（对应 FullProbe.m getPreferences；MATLAB 原脚本名仅作历史溯源） ---
const prefs = {
    setSizes: [3, 4, 6],
    studyDurations: [50, 200, 500, 1000, 2000],  // ms，记忆阵列呈现时长（本实验的自变量）
    change: [0, 1],                              // 0 = no-change，1 = change
    numBlocks: 9,
    numTrials: 50,
    nEachCondition: 30,      // 每个 set size × 呈现时长 组合 30 trial（change / no-change 各 15）
    nPractice: 18,           // 练习 18 trial：3 set size × 2 change × 3
    ITI: 500,                // ms（恒定，不随条件变化）
    retentionInterval: 1000, // ms（恒定，不随条件变化）
    stimSize: 51,
    minDist: 51 * 2.5,
    fixationSize: 8,
    breakLength: 0.5,        // 分钟 = 30 秒
    debugMode: false
};

// 调试模式只缩短实际运行的正式实验；prefs 始终保留完整科研设计参数，便于自检。
let runtimeNumBlocks = prefs.numBlocks;
let runtimeNumTrials = prefs.numTrials;
let runtimeBreakLength = prefs.breakLength;

// 实验名称：与 exp1_clt 同规则，用于
//   1) 导出文件名   exp1_fcdt_<SubjectID>.xlsx
//   2) 数据中的 experimentType / ExperimentType 字段
const EXPERIMENT_NAME = 'exp1_fcdt';

// 反应编码：与「正确反应」使用同一套编码，便于逐行直接比对
//   0 = no-change（完全一致）   1 = change（发生变化）
const RESP_NO_CHANGE = 0;
const RESP_CHANGE = 1;
const RESP_LABEL = { 0: 'no-change', 1: 'change' };

const colors_9 = [
    [255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 0],
    [255, 0, 255], [0, 255, 255], [255, 255, 255], [0, 0, 0], [255, 128, 0]
];

// --- PRNG ---
let seed = 1;
function seedRandom(s) { seed = s; }
function random() {
    let x = Math.sin(seed++) * 10000;
    return x - Math.floor(x);
}
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}
function randInt(min, max) {
    return Math.floor(random() * (max - min + 1)) + min;
}

// --- 高精度计时器 ---
function wait(ms) {
    return new Promise(resolve => {
        const start = performance.now();
        function check(time) {
            if (time - start >= ms) { resolve(); }
            else { requestAnimationFrame(check); }
        }
        requestAnimationFrame(check);
    });
}

// --- DOM 元素 ---
const screens = {
    setup: document.getElementById('setup-phase'),
    instructions: document.getElementById('instructions-phase'),
    experiment: document.getElementById('experiment-phase'),
    break: document.getElementById('break-phase'),
    // questionnaire: 阶段已删除（2026-10-10 与 exp1_clt 同步去问卷）
    upload: document.getElementById('upload-phase'),
    finished: document.getElementById('finished-phase')
};
const canvas = document.getElementById('expCanvas');
const ctx = canvas.getContext('2d', { alpha: false });

// --- 身份证号掩蔽 & SubjectID 自动生成 ---
let realIdCard = ''; // 存储真实身份证号（掩蔽显示时仍保留原值）

const idCardInput = document.getElementById('subIdCard');
const phoneInput = document.getElementById('subPhone');
const subjectIDInput = document.getElementById('subjectID');

// 身份证号：输入时更新真实值
idCardInput.addEventListener('input', () => {
    realIdCard = idCardInput.value;
    updateSubjectID();
});
// 聚焦时恢复真实值便于编辑
idCardInput.addEventListener('focus', () => {
    idCardInput.value = realIdCard;
});
// 失焦时掩蔽显示（前4位 + * + 后6位）
idCardInput.addEventListener('blur', () => {
    realIdCard = idCardInput.value;
    if (realIdCard.length > 10) {
        idCardInput.value = realIdCard.substring(0, 4)
            + '*'.repeat(realIdCard.length - 10)
            + realIdCard.substring(realIdCard.length - 6);
    }
});

// 手机号变化时更新 SubjectID
phoneInput.addEventListener('input', updateSubjectID);

// 调试模式复选框监听：勾选时自动填充默认调试信息
const debugModeCheckbox = document.getElementById('debugMode');
if (debugModeCheckbox) {
    debugModeCheckbox.addEventListener('change', (e) => {
        if (e.target.checked) {
            const nameEl = document.getElementById('subName');
            const genderEl = document.getElementById('subGender');
            const ageEl = document.getElementById('subAge');
            if (nameEl) nameEl.value = '1';
            if (genderEl) genderEl.value = '女';
            if (ageEl) ageEl.value = '1';
            realIdCard = '111111111111111111';
            if (idCardInput) idCardInput.value = '1111********111111';
            if (phoneInput) phoneInput.value = '11111111111';
            if (subjectIDInput) subjectIDInput.value = '1111';
        }
    });
}

function updateSubjectID() {
    subjectIDInput.value = buildSubjectID();
}

// 按规则生成被试编号：身份证号后 6 位 + 手机号后 4 位（纯字符串，保留前导 0）
// 直接读取输入框当前值，不依赖 input 事件（浏览器自动填充、程序赋值等场景同样正确）
// 与 exp1_clt 的 buildSubjectID() 完全一致；严禁对结果做 parseInt
// （否则前导 0 会被吞掉：0701231234 会被写成 701231234）
function buildSubjectID() {
    const idVal = realIdCard || idCardInput.value || '';
    const phoneVal = phoneInput.value || '';
    if (idVal.length >= 6 && phoneVal.length >= 4) {
        return idVal.slice(-6) + phoneVal.slice(-4);
    }
    return '';
}

// 掩蔽身份证号（用于数据导出，保护隐私）
function maskIdCard(idCard) {
    if (idCard.length > 10) {
        return idCard.substring(0, 4)
            + '*'.repeat(idCard.length - 10)
            + idCard.substring(idCard.length - 6);
    }
    return idCard;
}

// --- 设置表单 ---
document.getElementById('start-btn').addEventListener('click', async () => {
    const form = document.getElementById('setup-form');
    if (!form.reportValidity()) return;

    p.subName = document.getElementById('subName').value;
    p.subGender = document.getElementById('subGender').value;
    p.subAge = document.getElementById('subAge').value;
    p.subIdCard = realIdCard || idCardInput.value; // 使用真实身份证号
    p.subPhone = document.getElementById('subPhone').value;
    // 被试编号：点击开始时按规则由当前输入框的值重新生成一次
    // （不依赖 input 事件，浏览器自动填充 / 程序赋值也能正确生成）
    if (buildSubjectID()) subjectIDInput.value = buildSubjectID();
    // 严格按「身份证后6位 + 手机后4位」的原始数字字符串保存，不做 parseInt
    // （否则前导 0 会被吞掉，如 0701231234 变成 701231234）
    const generatedID = String(subjectIDInput.value || '').trim();
    p.subjectID = generatedID || String(Date.now());
    if (!generatedID) {
        // 身份证号不足 6 位或手机号不足 4 位时无法按规则生成编号，
        // 只能退回时间戳。明确告警，避免事后把「一串数字」误当成随机种子。
        console.warn('[' + EXPERIMENT_NAME + '] 被试编号无法按规则生成（身份证号需 ≥6 位、手机号需 ≥4 位），' +
            '已退回时间戳：' + p.subjectID);
    }
    // 随机种子：用字符串编号派生（Number 转换仅用于 PRNG 内部，不影响编号本身）
    const seedNum = Number(p.subjectID);
    p.rndSeed = Number.isFinite(seedNum) ? seedNum : Date.now();
    // 本地保存 Excel 始终开启（与 exp1_clt 一致：默认行为，setup 阶段不提供点选卡，
    //   避免被试误关导致数据丢失；服务器 / JATOS 上传逻辑照常运行）
    p.saveLocal = true;

    const normalizeOnes = (v) => String(v == null ? '' : v)
        .trim()
        .replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFF10 + 0x30));
    const isAllOnes = (v) => /^1+$/.test(normalizeOnes(v));
    const checkDebugBox = document.getElementById('debugMode') ? document.getElementById('debugMode').checked : false;
    p.debugMode = checkDebugBox || (
        isAllOnes(p.subName) && isAllOnes(p.subAge) &&
        isAllOnes(p.subIdCard) && isAllOnes(p.subPhone)
    );

    if (p.debugMode) {
        runtimeNumBlocks = 1;
        runtimeNumTrials = 5;
        runtimeBreakLength = 0;
        p.subjectID = '1111';   // 字符串，与正式编号同类型，文件名拼接结果一致
        p.rndSeed = 1111;
        if (subjectIDInput) subjectIDInput.value = '1111';
    }

    seedRandom(p.rndSeed);

    // 正式试次序列使用专属 PRNG 种子，与练习阶段完全解耦：
    //   练习消耗的随机数（shuffle / randInt）不进入正式序列，
    //   因此无论练习是否执行、是否跳过，buildFormalTrials 输出的 450 试次顺序恒定。
    //   续做时跳过练习直接进入第 N block，重新生成的正式试次序列与首次完全一致，
    //   保证被试在不同时间点续做时看到的是同一条试次序列。
    formalPrngBaseSeed = p.rndSeed + 7919;   // 7919 = 质数偏移，避免与练习流撞车

    try {
        // experiment 决定 Batch Session 的进度键名（exp1_fcdt:<workerId>），
        // 必须传，否则续做会退化成所有实验共用一个键
        await window.CLTStorage.initializeStorage({ participant: p, experiment: EXPERIMENT_NAME });
    } catch (err) {
        console.error("Storage init failed", err);
        document.getElementById('finished-text').innerText = '数据存储初始化失败，实验未开始。';
        switchScreen('finished');
        return;
    }

    // 检查是否有可续做的进度（仅 JATOS Batch Session 后端提供；其它后端返回 null，
    // 等价于"从头开始"，不影响正常流程）。续做从上次完成后的下一组继续，
    // 试次序列因 PRNG 基准固定而与首次完全一致。
    // 归属校验（这条进度是否属于当前被试）已在存储层完成：不属于、或无法校验时返回 null。
    try {
        const saved = await window.CLTStorage.loadProgress();
        if (saved && saved.completedBlocks > 0 && saved.completedBlocks < runtimeNumBlocks) {
            resumeStartBlock = saved.completedBlocks + 1;
            isResumedSession = true;
            resumedFromBlock = resumeStartBlock;
            // 本次续做计入累计次数：进度里记的是"此前续做过几次"，本次 +1 后再随进度
            // 写回；导出时该被试的每一行都带同一数值（一次做完的被试为 0）
            resumeCount = (saved.resumeCount || 0) + 1;
            console.log('[' + EXPERIMENT_NAME + '] 检测到未完成的进度（已完成 ' +
                saved.completedBlocks + ' 组），将从第 ' + resumeStartBlock + ' 组续做。');
        }
    } catch (err) {
        // 读进度失败不影响实验本身，回退为从头开始
        console.warn('[' + EXPERIMENT_NAME + '] 读取续做进度失败，将从头开始：', err);
    }

    try {
        if (document.documentElement.requestFullscreen) {
            await document.documentElement.requestFullscreen();
        }
    } catch (err) { console.log("Fullscreen denied."); }

    switchScreen('instructions');
    experimentPhase = 'instructions';

    // 检测到可续做进度时，显示"继续 / 重新开始"选择条；否则正常隐藏。
    const resumeNotice = document.getElementById('resume-notice');
    if (resumeNotice) {
        if (resumeStartBlock > 1) {
            resumeNotice.classList.remove('hidden');
        } else {
            resumeNotice.classList.add('hidden');
        }
    }

    // 选择"继续上次进度"：保持 resumeStartBlock 不变，进入练习/正式流程
    const btnResume = document.getElementById('btn-resume');
    if (btnResume) {
        btnResume.addEventListener('click', () => {
            resumeNotice.classList.add('hidden');
            // 让指导语照常读完，SPACE 键会按 resumeStartBlock 分流
        });
    }
    // 选择"从头重新开始"：清掉线上进度，强制从第 1 组开始
    const btnRestart = document.getElementById('btn-restart');
    if (btnRestart) {
        btnRestart.addEventListener('click', () => {
            resumeStartBlock = 1;
            isResumedSession = false;
            resumedFromBlock = 0;
            resumeCount = 0;
            window.CLTStorage.clearProgress();
            resumeNotice.classList.add('hidden');
            console.log('[' + EXPERIMENT_NAME + '] 被试选择从头重新开始，已清除线上进度。');
        });
    }
});

function switchScreen(screenName) {
    for (let key in screens) screens[key].classList.add('hidden');
    screens[screenName].classList.remove('hidden');
}

// --- 全局键盘监听 ---
// 作答已改为鼠标（左键=完全一致 / 右键=发生变化），键盘只负责流程推进：
//   指导语 → 练习：SPACE；练习结束 → 正式：SPACE；休息倒计时结束 → 下一组：SPACE
window.addEventListener('keydown', (e) => {
    if (e.repeat) return;

    if (experimentPhase === 'instructions' && (e.code === 'Space' || e.key === ' ')) {
        e.preventDefault();
        // 续做（resumeStartBlock > 1）：被试已在首次做过练习，跳过直接进正式，
        // 从上次完成的下一组继续；否则正常走练习 → 正式流程。
        if (resumeStartBlock > 1) startFormal();
        else startPractice();
    } else if (experimentPhase === 'practice_end' && (e.code === 'Space' || e.key === ' ')) {
        e.preventDefault();
        startFormal();
    } else if (experimentPhase === 'break_countdown' || experimentPhase === 'break_wait') {
        // 休息阶段：强制倒计时期间按 SPACE 无效；倒计时结束后按 SPACE 进入下一组
        if (experimentPhase === 'break_wait' && (e.code === 'Space' || e.key === ' ')) {
            e.preventDefault();
            nextBlock();
        }
    }
    // questionnaire 阶段已删除，键盘不再处理 1-5 量表输入
});

// ============================================================
//  防误触层（guard rails）
//  目的：避免被试或浏览器在实验进行中触发以下操作导致实验中断 / 数据丢失：
//   1) 浏览器刷新、关闭、离开（beforeunload）
//   2) 浏览器后退 / 前进（Backspace、Alt+← / Alt+→、popstate）
//   3) 快捷键被劫持（F5 / Ctrl+R / Ctrl+W / Ctrl+T / F12 / DevTools）
//   4) Esc 退出全屏（屏蔽 Esc）
//   5) 鼠标长按 → 系统右键菜单 / 拖拽（mousedown 持续触发、dragstart、selectstart）
//   6) 触屏 / 滚轮 / 缩放（touchstart、wheel、gesturestart）
//   7) 页面失焦 / 切到后台（visibilitychange 给出告警但不清空数据）
//   8) 页面被 resize（仅在 #experiment-phase 锁住尺寸，避免破坏注视点位置）
//  实验进行中：仅按每个阶段规定的"有效键"（SPACE / 鼠标左右键）才生效；
//  其他任何键 / 鼠标 / 触屏 / 系统事件一律被静默 preventDefault，实验流程不受影响。
// ============================================================

// 每个阶段被允许的键盘按键集合（其他键一律屏蔽）
const ALLOWED_KEYS = new Set([' ', 'Space', 'Spacebar']);

// 实验中需要拦截的系统级组合键（不拦截时浏览器会触发默认行为）
const BLOCKED_SHORTCUTS = new Set([
    'F5', 'F12',                                                  // 刷新 / 开发者工具
    'F1', 'F2', 'F3', 'F4', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11' // 其他功能键
]);
function isBlockedShortcut(e) {
    if (BLOCKED_SHORTCUTS.has(e.key)) return true;
    if (e.ctrlKey || e.metaKey) {
        // 拦截 Ctrl/Cmd + R / W / T / N / P / F / S / Shift+Delete 等
        if (/^[rwnpfst]$/i.test(e.key)) return true;
        if (e.key === 'F4' && e.altKey) return true;   // Alt+F4 关窗
    }
    if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Backspace')) {
        return true;                                       // Alt+←/→ 浏览器后退 / 前进
    }
    return false;
}

// (1) 全局 keydown 第二层：仅放行 ALLOWED_KEYS，其余静默屏蔽
window.addEventListener('keydown', (e) => {
    if (e.repeat) return;                                 // 防止长按重复触发

    // 关键例外：焦点落在输入框 / 下拉框里时（setup 阶段填姓名 / 性别 / 年龄 /
    // 身份证 / 手机号），防误触层必须放行普通按键——在 capture 阶段对 keydown
    // 调用 preventDefault() 会阻止字符被插入输入框，被试将一个字都打不进去。
    const inFormField = (e.target instanceof HTMLInputElement)
        || (e.target instanceof HTMLTextAreaElement)
        || (e.target instanceof HTMLSelectElement);

    if (isBlockedShortcut(e)) {
        e.preventDefault();
        e.stopPropagation();
        return;
    }
    if (inFormField) return;                               // 表单输入：放行所有普通按键
    if (e.key === 'Escape') {                              // 屏蔽 Esc 退出全屏
        e.preventDefault();
        return;
    }
    if (e.key === 'Backspace' && !(e.target instanceof HTMLInputElement)) {
        // Backspace 在非输入框下被浏览器解读为"后退" → 屏蔽
        e.preventDefault();
        return;
    }
    // 其他所有非放行键：静默屏蔽（不 preventDefault，让浏览器继续处理也不影响实验，因为没有绑定）
    if (!ALLOWED_KEYS.has(e.key) && !ALLOWED_KEYS.has(e.code) && e.key !== 'Tab') {
        e.preventDefault();
    }
}, true);                                                  // capture 阶段优先

// (2) 屏蔽所有元素的右键菜单（不仅 canvas）
//     实验阶段 canvas 上的右键是作答键（fcdt），必须屏蔽菜单遮挡刺激；
//     但 setup 阶段表单里的右键菜单保留（便于粘贴身份证号 / 手机号），
//     文本输入框的右键菜单里没有任何导航项，不会导致实验中断。
window.addEventListener('contextmenu', (e) => {
    const t = e.target;
    if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) return;
    e.preventDefault();
});

// (3) 屏蔽拖拽 / 选中 / 复制（避免误选文字拖出浏览器）
window.addEventListener('dragstart', (e) => e.preventDefault());
window.addEventListener('selectstart', (e) => {
    // 允许在 setup 阶段（输入框）选中文字；其他阶段屏蔽
    const phase = experimentPhase;
    if (phase !== 'setup' && phase !== 'instructions') {
        if (!(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
            e.preventDefault();
        }
    }
});
window.addEventListener('copy', (e) => {
    if (!(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
    }
});

// (4) 屏蔽滚轮 / 触屏手势（避免页面缩放 / 滚动 / 系统菜单）
window.addEventListener('wheel', (e) => {
    if (e.ctrlKey) e.preventDefault();                    // Ctrl+滚轮 = 缩放
}, { passive: false });
window.addEventListener('touchstart', (e) => {
    if (e.touches.length > 1) e.preventDefault();         // 多指 = 缩放手势
}, { passive: false });
window.addEventListener('gesturestart', (e) => e.preventDefault());

// (5) 屏蔽全屏切换 / 重新加载（beforeunload）：实验进行中给出离开提示
window.addEventListener('beforeunload', (e) => {
    const phase = experimentPhase;
    if (phase === 'setup' || phase === 'finished') return;  // 未开始 / 已结束：允许直接离开
    e.preventDefault();
    e.returnValue = '实验正在进行中，关闭或刷新页面将导致数据丢失。确定要离开吗？';
    return e.returnValue;
});

// (6) 页面失焦 / 切到后台：给出告警，但**不**清空数据、不终止试次
let visibilityWarned = false;
document.addEventListener('visibilitychange', () => {
    if (document.hidden && !visibilityWarned) {
        visibilityWarned = true;
        console.warn('[' + EXPERIMENT_NAME + '] 页面失焦：被试切到其他窗口 / 标签页。');
    } else if (!document.hidden) {
        visibilityWarned = false;
    }
});
window.addEventListener('blur', () => {
    if (experimentPhase === 'trial_response' || experimentPhase === 'practice_response') {
        console.warn('[' + EXPERIMENT_NAME + '] 实验进行中窗口失焦，请保持页面在前台。');
    }
});

// (7) popstate（浏览器后退 / 前进）：压入 dummy 历史项并屏蔽后退
history.pushState({ phase: 'experiment' }, '');
window.addEventListener('popstate', () => {
    const phase = experimentPhase;
    if (phase !== 'setup' && phase !== 'finished') {
        // 实验进行中：阻止后退，立即推回一项
        history.pushState({ phase: 'experiment' }, '');
        console.warn('[' + EXPERIMENT_NAME + '] 浏览器后退被屏蔽（实验进行中）。');
    }
});

// (8) 屏蔽浏览器对鼠标的默认处理（防止长按出系统菜单、拖拽光标、指针变化）。
//     mousedown 一次按下只触发一次，浏览器在按住期间不会自动 repeat mousedown；
//     右键菜单已由 (2) contextmenu preventDefault 屏蔽；
//     这里额外阻止 mousedown 的默认光标变化 / 文本选中，并屏蔽 canvas dragstart。
canvas.addEventListener('mousedown', (e) => {
    // 在所有阶段都阻止默认行为（除 setup 阶段输入框，但 canvas 不在输入框里）
    e.preventDefault();
}, true);
canvas.addEventListener('dragstart', (e) => e.preventDefault());
canvas.addEventListener('drag', (e) => e.preventDefault());

// --- 鼠标作答 ---
// 右键用于作答，必须屏蔽浏览器右键菜单，否则菜单会遮挡刺激。
// （已由上面的 (2) 全局 contextmenu 屏蔽）

canvas.addEventListener('mousedown', (e) => {
    const phase = experimentPhase;
    if (phase !== 'practice_response' && phase !== 'trial_response') return;

    // 按键 → 判断结果的映射（整个程序只在此处出现一次）：
    //   鼠标左键 = 完全一致 → no-change (RESP_NO_CHANGE = 0)
    //   鼠标右键 = 发生变化 → change    (RESP_CHANGE    = 1)
    // 中键等其他按键忽略，不记为反应。
    // 导出的数据里只记录「判断结果 (no-change / change)」，不记录按的是左键还是右键。
    if (e.button !== 0 && e.button !== 2) return;
    e.preventDefault();

    const responseType = (e.button === 0) ? RESP_NO_CHANGE : RESP_CHANGE;

    if (phase === 'practice_response') recordPracticeResponse(responseType);
    else recordResponse(responseType);
});

// ============================================================
//  练习阶段（18 trial：3 set size × 2 change × 3，呈现时长逐试次随机）
// ============================================================
let practiceTrials = [];
let practiceTrialIdx = 0;
let practiceAcc = [];

function startPractice() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const nPerCellPractice = prefs.nPractice / (prefs.setSizes.length * prefs.change.length);
    practiceTrials = [];
    for (let ss of prefs.setSizes) {
        for (let ch of prefs.change) {
            for (let i = 0; i < nPerCellPractice; i++) {
                practiceTrials.push({
                    setSize: ss,
                    change: ch,
                    // 练习阶段不操纵呈现时长：从 5 个水平里随机取一个，
                    // 让被试提前适应「有的试次一闪而过、有的试次停留较久」
                    studyDuration: prefs.studyDurations[randInt(0, prefs.studyDurations.length - 1)]
                });
            }
        }
    }
    shuffleArray(practiceTrials);
    practiceTrialIdx = 0;
    practiceAcc = [];
    practiceData = [];

    switchScreen('experiment');
    runPracticeTrial();
}

let activeColors = [];
let activeLocs = [];
let trialData = {};
let practiceTrialData = {};
let responseStartTime = 0;
// exp1_fcdt 专用：变化方块索引及新颜色
let changeItemIdx = 0;
let changeColorIdx = 0;

async function runPracticeTrial() {
    if (practiceTrialIdx >= practiceTrials.length) {
        endPractice();
        return;
    }

    experimentPhase = 'practice_running';
    let condition = practiceTrials[practiceTrialIdx];
    practiceTrialData = {
        block: 0, trial: practiceTrialIdx + 1,
        setSize: condition.setSize,
        studyDuration: condition.studyDuration,
        isChange: condition.change
    };

    // ITI
    drawBackground(); drawFixation();
    await wait(prefs.ITI);

    await showMemoryArrayPractice(condition);
}

async function showMemoryArrayPractice(condition) {
    // 色块颜色与位置的选取规则保持不变：
    //   颜色 = 从 9 色调色板中不重复随机取 setSize 个
    //   位置 = getStimLocs 极坐标四象限生成（已支持 3 / 4 / 6）
    let colorIndexArr = [0,1,2,3,4,5,6,7,8];
    shuffleArray(colorIndexArr);
    activeColors = colorIndexArr.slice(0, condition.setSize);
    activeLocs = getStimLocs(condition.setSize, canvas.width / 2, canvas.height / 2);

    drawBackground(); drawFixation();
    for (let i = 0; i < condition.setSize; i++) {
        drawSquare(activeLocs[i].x, activeLocs[i].y, colors_9[activeColors[i]]);
    }

    // 记忆阵列呈现时长：本试次所属条件的时长（50 / 200 / 500 / 1000 / 2000 ms）
    const studyStartTime = performance.now();
    await wait(condition.studyDuration);
    practiceTrialData.studyDurationActual = (performance.now() - studyStartTime).toFixed(2);

    // 保留间隔：恒定 1000 ms，不随呈现时长变化（本实验只操纵呈现时长）
    // 注视点全程固定显示、不消失（与 exp1_clt 一致）：先铺背景再画注视点，
    // 避免记忆阵列消失后出现「空屏无注视点」的闪烁
    drawBackground(); drawFixation();
    await wait(prefs.retentionInterval);

    // 确定变化方块及新颜色
    changeItemIdx = randInt(0, condition.setSize - 1);
    let sColor = activeColors[changeItemIdx];
    let usedColors = [...new Set(activeColors)];
    let newColorPool = [0,1,2,3,4,5,6,7,8].filter(c => !usedColors.includes(c));
    if (newColorPool.length === 0) {
        newColorPool = [0,1,2,3,4,5,6,7,8].filter(c => c !== sColor);
    }
    changeColorIdx = newColorPool[randInt(0, newColorPool.length - 1)];

    showProbePractice(condition);
}

function showProbePractice(condition) {
    drawBackground(); drawFixation();

    // 绘制全部方块（change=1 时变化方块用新颜色）
    for (let i = 0; i < condition.setSize; i++) {
        if (condition.change === 1 && i === changeItemIdx) {
            drawSquare(activeLocs[i].x, activeLocs[i].y, colors_9[changeColorIdx]);
        } else {
            drawSquare(activeLocs[i].x, activeLocs[i].y, colors_9[activeColors[i]]);
        }
    }

    experimentPhase = 'practice_response';
    responseStartTime = performance.now();
}

function recordPracticeResponse(responseType) {
    // 同正式试次：锁定反应阶段，防止左右键连击重复记录
    if (experimentPhase !== 'practice_response') return;
    experimentPhase = 'practice_locked';

    let rt = (performance.now() - responseStartTime) / 1000;

    // 反应按「判断结果」记录：0 = no-change（完全一致），1 = change（发生变化）
    // 与 correctResponse 使用同一套编码，逐行可直接比对；不记录按了左键还是右键
    const correctResponse = practiceTrialData.isChange === 1 ? RESP_CHANGE : RESP_NO_CHANGE;

    practiceTrialData.rt = rt;
    practiceTrialData.response = responseType;
    practiceTrialData.responseLabel = RESP_LABEL[responseType];
    practiceTrialData.correctResponse = correctResponse;
    practiceTrialData.correctResponseLabel = RESP_LABEL[correctResponse];
    practiceTrialData.changeItem = changeItemIdx;
    practiceTrialData.origColorIdx = activeColors[changeItemIdx];
    practiceTrialData.probeColorIdx = changeColorIdx;

    let correct = (responseType === correctResponse) ? 1 : 0;
    practiceTrialData.accuracy = correct;
    practiceAcc.push(correct);
    practiceData.push(Object.assign({}, practiceTrialData));

    drawBackground(); drawFixation();
    practiceTrialIdx++;
    setTimeout(() => runPracticeTrial(), 50);
}

function endPractice() {
    let accPct = Math.round(practiceAcc.reduce((a, b) => a + b, 0) / practiceAcc.length * 100);
    experimentPhase = 'practice_end';
    drawBackground();

    ctx.fillStyle = 'rgb(255,255,255)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 36px Inter, sans-serif';
    ctx.fillText('练习结束', canvas.width / 2, canvas.height / 2 - 80);
    ctx.font = '28px Inter, sans-serif';
    ctx.fillText(`正确率：${accPct}%`, canvas.width / 2, canvas.height / 2 - 20);
    ctx.font = '20px Inter, sans-serif';
    ctx.fillText('鼠标左键 = 完全一致　|　鼠标右键 = 发生变化',
        canvas.width / 2, canvas.height / 2 + 24);
    ctx.font = '20px Inter, sans-serif';
    ctx.fillStyle = 'rgb(255,235,59)';
    ctx.fillText('按 空格键(Space) 开始正式实验', canvas.width / 2, canvas.height / 2 + 72);
}

// ============================================================
//  正式实验阶段
// ============================================================
// 生成完整正式试次序列：
//   15 种条件（3 set size × 5 呈现时长）各 30 次；
//   每个条件内部 change / no-change 对半（各 15 次）；
//   整体只洗牌一次 → 15 种条件随机分布到 9 个 block。
// 关键不变量：本函数开头把 PRNG 重置回 formalPrngBaseSeed，
// 因此"跳过练习直接续做"与"正常做完练习再进正式"得到的 450 试次序列完全相同。
// 若正式基准起点尚未捕获（formalPrngBaseSeed 为 0），退回用 p.rndSeed 作为起点，
// 保证首次进入也确定可复现。
function buildFormalTrials() {
    const baseSeed = formalPrngBaseSeed !== 0 ? formalPrngBaseSeed : p.rndSeed;
    seedRandom(baseSeed);
    const trials = [];
    const nPerChange = Math.round(prefs.nEachCondition / prefs.change.length); // 30 / 2 = 15
    for (let ss of prefs.setSizes) {
        for (let duration of prefs.studyDurations) {
            for (let ch of prefs.change) {
                for (let i = 0; i < nPerChange; i++) {
                    trials.push({ setSize: ss, studyDuration: duration, change: ch });
                }
            }
        }
    }
    shuffleArray(trials);
    return trials;
}

// 生成后自检：总数、各条件计数、change/no-change 对半、block 结构都必须符合设计。
function verifyFormalTrials(trials) {
    const expectedTotal = prefs.setSizes.length * prefs.studyDurations.length * prefs.nEachCondition;
    const nPerChange = Math.round(prefs.nEachCondition / prefs.change.length);

    const condCounts = new Map();    // "setSize|呈现时长"        → 期望 30
    const cellCounts = new Map();    // "setSize|呈现时长|change" → 期望 15
    for (let t of trials) {
        const ck = t.setSize + '|' + t.studyDuration;
        condCounts.set(ck, (condCounts.get(ck) || 0) + 1);
        const hk = ck + '|' + t.change;
        cellCounts.set(hk, (cellCounts.get(hk) || 0) + 1);
    }

    let countsValid = true;
    for (let ss of prefs.setSizes) {
        for (let duration of prefs.studyDurations) {
            const ck = ss + '|' + duration;
            if (condCounts.get(ck) !== prefs.nEachCondition) countsValid = false;
            for (let ch of prefs.change) {
                if (cellCounts.get(ck + '|' + ch) !== nPerChange) countsValid = false;
            }
        }
    }

    const blocks = [];
    for (let start = 0; start < trials.length; start += prefs.numTrials) {
        blocks.push(trials.slice(start, start + prefs.numTrials));
    }
    const blocksValid = blocks.length === prefs.numBlocks &&
        blocks.every(block => block.length === prefs.numTrials);
    const valid = trials.length === expectedTotal && countsValid && blocksValid;

    if (!valid) {
        console.error('[' + EXPERIMENT_NAME + '] 正式试次生成自检未通过（不应发生）：', {
            total: trials.length,
            expectedTotal: expectedTotal,
            conditionCounts: Object.fromEntries(condCounts),
            changeCounts: Object.fromEntries(cellCounts),
            blockSizes: blocks.map(block => block.length),
            expectedBlocks: prefs.numBlocks,
            expectedTrialsPerBlock: prefs.numTrials
        });
    } else {
        console.log('[' + EXPERIMENT_NAME + '] 正式试次生成自检通过：15 种条件各 30 次（change/no-change 各 15），共 450 次，9 个 block × 50 次');
    }
    return valid;
}

// 续做起点：若检测到上次未完成的进度，从第 N 组（block）继续，而不是从 1 开始。
// 首次（或"重新开始"）时为 1。buildFormalTrials 每次都重置 PRNG 到同一基准，
// 所以无论从哪组开始，整条 450 试次序列都完全一致，只是被试从中间接上。
let resumeStartBlock = 1;

function startFormal() {
    allFormalTrials = buildFormalTrials();
    verifyFormalTrials(allFormalTrials);

    // 续做：跳过练习、从上次完成后的下一组开始；否则正常从第 1 组开始。
    currentBlock = Math.min(resumeStartBlock, runtimeNumBlocks);
    if (currentBlock > 1) {
        console.log('[' + EXPERIMENT_NAME + '] 从第 ' + currentBlock + ' 组续做（上次已完成 ' + (currentBlock - 1) + ' 组）');
    }
    startBlock();
}

let allFormalTrials = [];
let formalTrialGlobalIdx = 0;

function startBlock() {
    blockTrials = allFormalTrials.slice(
        (currentBlock - 1) * runtimeNumTrials,
        currentBlock * runtimeNumTrials
    );
    currentTrial = 0;
    formalTrialGlobalIdx = (currentBlock - 1) * runtimeNumTrials;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    switchScreen('experiment');
    runTrial();
}

async function runTrial() {
    if (currentTrial >= blockTrials.length) {
        endBlock();
        return;
    }

    experimentPhase = 'trial_running';
    let condition = blockTrials[currentTrial];
    trialData = {
        subjectID: p.subjectID,
        subName: p.subName,
        block: currentBlock,
        trial: currentTrial + 1,
        setSize: condition.setSize,
        studyDuration: condition.studyDuration,   // 本试次的记忆阵列呈现时长（计划的）
        isChange: condition.change,
        // 与 exp1_clt 一致：实验类型字段直接写实验名称（exp1_fcdt）
        experimentType: EXPERIMENT_NAME
    };

    // ITI
    drawBackground(); drawFixation();
    await wait(prefs.ITI);

    await showMemoryArray(condition);
}

async function showMemoryArray(condition) {
    // 色块颜色与位置的选取规则保持不变：
    //   颜色 = 从 9 色调色板中不重复随机取 setSize 个
    //   位置 = getStimLocs 极坐标四象限生成（已支持 3 / 4 / 6）
    let colorIndexArr = [0,1,2,3,4,5,6,7,8];
    shuffleArray(colorIndexArr);
    activeColors = colorIndexArr.slice(0, condition.setSize);
    activeLocs = getStimLocs(condition.setSize, canvas.width / 2, canvas.height / 2);

    trialData.itemLocs = JSON.stringify(activeLocs.map(l => [Math.round(l.x), Math.round(l.y)]));
    trialData.itemColors = JSON.stringify(activeColors);

    drawBackground(); drawFixation();
    for (let i = 0; i < condition.setSize; i++) {
        drawSquare(activeLocs[i].x, activeLocs[i].y, colors_9[activeColors[i]]);
    }

    // 记忆阵列呈现时长：本试次所属条件的时长（50 / 200 / 500 / 1000 / 2000 ms）
    const studyStartTime = performance.now();
    await wait(condition.studyDuration);
    trialData.studyDurationActual = (performance.now() - studyStartTime).toFixed(2);

    // 保留间隔：恒定 1000 ms，不随呈现时长变化（本实验只操纵呈现时长）
    // 注视点全程固定显示、不消失（与 exp1_clt 一致）：先铺背景再画注视点，
    // 避免记忆阵列消失后出现「空屏无注视点」的闪烁
    drawBackground(); drawFixation();
    await wait(prefs.retentionInterval);

    // 确定变化方块及新颜色
    changeItemIdx = randInt(0, condition.setSize - 1);
    let sColor = activeColors[changeItemIdx];
    let usedColors = [...new Set(activeColors)];
    let newColorPool = [0,1,2,3,4,5,6,7,8].filter(c => !usedColors.includes(c));
    if (newColorPool.length === 0) {
        newColorPool = [0,1,2,3,4,5,6,7,8].filter(c => c !== sColor);
    }
    changeColorIdx = newColorPool[randInt(0, newColorPool.length - 1)];

    trialData.origColorIdx = sColor;
    trialData.probeColorIdx = changeColorIdx;
    trialData.changeItem = changeItemIdx;

    showProbe(condition);
}

function showProbe(condition) {
    drawBackground(); drawFixation();

    for (let i = 0; i < condition.setSize; i++) {
        if (condition.change === 1 && i === changeItemIdx) {
            drawSquare(activeLocs[i].x, activeLocs[i].y, colors_9[changeColorIdx]);
        } else {
            drawSquare(activeLocs[i].x, activeLocs[i].y, colors_9[activeColors[i]]);
        }
    }

    experimentPhase = 'trial_response';
    responseStartTime = performance.now();
}

function recordResponse(responseType) {
    // 立即锁定反应阶段：防止同一次试次内左右键连击触发第二次记录
    if (experimentPhase !== 'trial_response') return;
    experimentPhase = 'trial_locked';

    let rt = (performance.now() - responseStartTime) / 1000;

    // 反应按「判断结果」记录：0 = no-change（完全一致），1 = change（发生变化）
    // 与 correctResponse 使用同一套编码，逐行可直接比对；不记录按了左键还是右键
    const correctResponse = trialData.isChange === 1 ? RESP_CHANGE : RESP_NO_CHANGE;

    trialData.rt = rt;
    trialData.response = responseType;
    trialData.responseLabel = RESP_LABEL[responseType];
    trialData.correctResponse = correctResponse;
    trialData.correctResponseLabel = RESP_LABEL[correctResponse];
    trialData.accuracy = (responseType === correctResponse) ? 1 : 0;

    const completedRow = prepareStorageRow(trialData);
    stimData.push(completedRow);
    window.CLTStorage.saveTrial(completedRow);

    // ITI
    drawBackground(); drawFixation();

    currentTrial++;
    formalTrialGlobalIdx++;
    setTimeout(() => { runTrial(); }, 50);
}

// ============================================================
//  Block 间休息
// ============================================================
let breakTimer = null;
const BREAK_MIN_SECONDS = 30;   // block 间强制休息至少 30 秒

// 计算某个 block 的正确率（%）
function blockAccuracyPct(blockNo) {
    let rows = stimData.filter(d => d.block === blockNo);
    if (rows.length === 0) return 0;
    return Math.round(rows.reduce((s, d) => s + d.accuracy, 0) / rows.length * 100);
}

function endBlock() {
    const blockAcc = blockAccuracyPct(currentBlock);

    window.CLTStorage.saveCheckpoint({
        block: currentBlock,
        blockAccuracy: blockAcc,
        completedTrials: stimData.length,
        nextBlock: currentBlock < runtimeNumBlocks ? currentBlock + 1 : null
    });

    // 线上暂存：每完成一个 block 就把进度写进 JATOS Batch Session（仅 JATOS 后端实现）。
    // 只存"完成到第几组"；身份哈希由存储层自己注入，这里不传任何个人信息。
    if (currentBlock < runtimeNumBlocks) {
        window.CLTStorage.saveProgress({
            completedBlocks: currentBlock,
            resumeCount: isResumedSession ? resumeCount : 0,
            updatedAt: new Date().toISOString()
        });
    }

    if (currentBlock < runtimeNumBlocks) {
        showBreakScreen(blockAcc);
    } else {
        // 问卷阶段已删除：最后一个 block 结束后直接进入 finishExperiment
        finishExperiment();
    }
}

function showBreakScreen(blockAcc) {
    switchScreen('break');
    experimentPhase = 'break_countdown';
    document.getElementById('rest-acc').innerText = `您的正确率为 ${blockAcc}%`;
    startBreakCountdown();
}

// 强制休息倒计时（结束后显示等待提示，按 SPACE 进入下一组）
function startBreakCountdown() {
    clearInterval(breakTimer);
    breakTimer = null;

    const cdEl = document.getElementById('rest-countdown');
    const waitEl = document.getElementById('rest-wait');
    let timeLeft = Math.max(BREAK_MIN_SECONDS, Math.round(runtimeBreakLength * 60));

    experimentPhase = 'break_countdown';
    cdEl.innerText = timeLeft;
    cdEl.classList.remove('hidden');
    waitEl.classList.add('hidden');

    breakTimer = setInterval(() => {
        timeLeft--;
        if (timeLeft <= 0) {
            clearInterval(breakTimer);
            breakTimer = null;
            cdEl.classList.add('hidden');
            waitEl.classList.remove('hidden');
            experimentPhase = 'break_wait';   // 此时按 SPACE 进入下一组
        } else {
            cdEl.innerText = timeLeft;
        }
    }, 1000);
}

function nextBlock() {
    clearInterval(breakTimer);
    breakTimer = null;
    currentBlock++;
    startBlock();
}

// ============================================================
//  数据保存
// ============================================================
// 问卷阶段已删除：endBlock() 在最后一个 block 跑完后直接调用本函数。
// 仍保留被试人口统计学字段回填（subName / subGender / subAge / subIdCard / subPhone / subjectID / rndSeed），
// 仅去掉 tired / attention 量表字段的回填。
async function finishExperiment() {
    // 问卷已去：实验只要走到这里就算正常完成；调试模式仍会通过其它流程提前退出。
    const completedNormally = stimData.length > 0;
    switchScreen('upload');
    experimentPhase = 'upload';

    let uploadMsg = "";
    let storageSucceeded = false;

    // 被试人口统计学字段回填到每一行（问卷字段不再回填）
    for (let d of stimData) {
        d.subName = p.subName;
        d.subGender = p.subGender;
        d.subAge = p.subAge;
        d.subIdCard = maskIdCard(p.subIdCard); // 导出掩蔽后的身份证号
        d.subPhone = p.subPhone;
        d.subjectID = p.subjectID;
        d.rndSeed = p.rndSeed;
        // 断点续做标记（append-only，不改现有字段语义）：
        //   resumedFromBlock = 本次是从第几组续做的（0 表示非续做，即从头开始）
        //   resumeCount      = 该被试历史上第几次续做（未续做 = 0，第 1 次续做 = 1）
        // 便于事后分析时区分"一次做完"与"分多次做完"的被试。
        d.resumedFromBlock = isResumedSession ? resumedFromBlock : 0;
        d.resumeCount = isResumedSession ? resumeCount : 0;
    }

    try {
        const result = await window.CLTStorage.saveFinalResult({
            trials: stimData
            // questionnaire 字段已删除：CLTStorage 通用层仍能正常序列化（payload.questionnaire 为 undefined）
        });
        storageSucceeded = true;
        uploadMsg += result && result.message ? result.message : '数据已保存。';
        // 实验正常完成：清掉 Batch Session 里的进度，避免下次误判为"上次没做完"
        await window.CLTStorage.clearProgress();
    } catch (error) {
        console.error("Storage Error:", error);
        uploadMsg += "服务器保存失败: " + error.message + "。";
    }

    if (p.saveLocal && stimData.length > 0) {
        downloadXLSX();
        uploadMsg += "本地 Excel 已生成下载。";
    }

    document.getElementById('upload-status').innerText = uploadMsg;
    document.getElementById('finished-text').innerText = uploadMsg;
    setTimeout(() => { switchScreen('finished'); }, 2000);

    try {
        await window.CLTStorage.finishExperiment({
            successful: storageSucceeded && completedNormally,
            message: completedNormally ? (EXPERIMENT_NAME + ' completed') : (EXPERIMENT_NAME + ' ended early')
        });
    } catch (error) {
        console.error('Study finish failed:', error);
    }

    try { if (document.exitFullscreen) document.exitFullscreen(); } catch (e) {}
}

function prepareStorageRow(row) {
    return {
        ...row,
        subName: p.subName,
        subGender: p.subGender,
        subAge: p.subAge,
        subIdCard: maskIdCard(p.subIdCard),
        subPhone: p.subPhone,
        subjectID: p.subjectID,
        rndSeed: p.rndSeed
    };
}

// ============================================================
//  统计一组试次的结果行：总数 / 击中率 / 虚报率 / 正确试次平均反应时 / 容量 K
//  durationLabel：该组对应的呈现时长（ms）；传「汇总」表示跨全部时长
//  exp1_fcdt 公式: K = N × (Hit rate - False Alarm rate)
//    Hit = change 试次中正确判断"变化"的比例
//    FA  = no-change 试次中错误判断"变化"的比例
// ============================================================
function buildKRow(ss, durationLabel, rows) {
    const changeTrials = rows.filter(d => Number(d.isChange) === 1);
    const noChangeTrials = rows.filter(d => Number(d.isChange) === 0);

    const nHit = changeTrials.filter(d => d.accuracy === 1).length;
    const nFA = noChangeTrials.filter(d => d.response === 1).length;
    const hitRate = changeTrials.length > 0 ? nHit / changeTrials.length : 0;
    const faRate = noChangeTrials.length > 0 ? nFA / noChangeTrials.length : 0;
    const k = ss * (hitRate - faRate);

    const correctRTs = rows.filter(d => d.accuracy === 1 && typeof d.rt === 'number').map(d => d.rt);
    const rtMean = correctRTs.length > 0
        ? correctRTs.reduce((s, v) => s + v, 0) / correctRTs.length
        : '';

    return {
        SubjectID: p.subjectID,
        // 与 exp1_clt 一致：ExperimentType 直接写实验名称（exp1_fcdt），便于跨范式统计
        ExperimentType: EXPERIMENT_NAME,
        SetSize: ss,
        StudyDuration: durationLabel,
        TotalTrials: rows.length,
        HitRate: hitRate.toFixed(4),
        FalseAlarmRate: faRate.toFixed(4),
        MeanRT: rtMean === '' ? '' : rtMean.toFixed(4),
        K: k.toFixed(4)
    };
}

// ============================================================
//  按「呈现时长 → set size」分组重排试次
//  分组顺序：呈现时长升序 → set size 升序；组内保持原始实验顺序（不再排序）
//  行首附加 GroupIndex（分组序号，1 起）与 GroupLabel（如 50ms-SS3）两列
//  末尾兜底追加无法归类的行，确保不丢数据
// ============================================================
function groupTrialsByCondition(rows) {
    const durations = prefs.studyDurations.slice().sort((a, b) => a - b);
    const setSizes = prefs.setSizes.slice().sort((a, b) => a - b);

    const grouped = [];
    const placed = new Set();
    let groupIndex = 0;

    for (const duration of durations) {
        for (const ss of setSizes) {
            groupIndex++;
            const groupLabel = duration + 'ms-SS' + ss;
            for (const d of rows) {
                // 用 Number() 比较：字段恒为数字，但避免个别行被写成字符串时漏掉
                if (Number(d.studyDuration) === duration && Number(d.setSize) === ss) {
                    grouped.push(Object.assign({ GroupIndex: groupIndex, GroupLabel: groupLabel }, d));
                    placed.add(d);
                }
            }
        }
    }

    // 兜底：条件无法归类的行（正常不应发生）追加在末尾，避免静默丢数据
    for (const d of rows) {
        if (!placed.has(d)) {
            grouped.push(Object.assign({ GroupIndex: 0, GroupLabel: '未归类' }, d));
        }
    }
    return grouped;
}

function downloadXLSX() {
    if (stimData.length === 0) return;

    // ============================================================
    //  Sheet 1: Trial Data（对齐 exp1_clt：包含全部试次及被试人口统计学字段）
    //  反应字段：response / responseLabel 记录「no-change / change」，
    //            correctResponse / correctResponseLabel 记录「本试次的正确判断」，
    //            不再记录按了左键还是右键（具体物理按键在导出版本中已脱敏）。
    // ============================================================
    const trialSheet = XLSX.utils.json_to_sheet(stimData);

    // ============================================================
    //  Sheet 2: K Values（对齐 exp1_clt 的列结构与口径）
    //  呈现时长是本实验的自变量，因此不再只按 set size 汇总，
    //  而是每个 (set size × 呈现时长) 组合单独统计一行，共 15 行；
    //  末尾再补每个 set size 的跨时长汇总行，便于与旧版口径对照。
    //  exp1_fcdt 公式: K = N × (Hit rate - False Alarm rate)
    // ============================================================
    const kData = [];
    const sortedDurations = prefs.studyDurations.slice().sort((a, b) => a - b);
    for (let ss of prefs.setSizes) {
        for (let duration of sortedDurations) {
            const rows = stimData.filter(d => d.setSize === ss && Number(d.studyDuration) === duration);
            kData.push(buildKRow(ss, duration, rows));
        }
    }
    // 每个 set size 的汇总行（跨全部呈现时长，StudyDuration 记为「汇总」）
    for (let ss of prefs.setSizes) {
        const rows = stimData.filter(d => d.setSize === ss);
        kData.push(buildKRow(ss, '汇总', rows));
    }
    const kSheet = XLSX.utils.json_to_sheet(kData);

    // ============================================================
    //  Sheet 3: Grouped Trials（对齐 exp1_clt）
    //  列与 Sheet1 完全相同（前面多 GroupIndex / GroupLabel 两列标识分组），
    //  但按「呈现时长 → set size」分组重排：同一条件的试次在表中连续排列，
    //  组内仍保持原始实验顺序，不做二次排序。
    // ============================================================
    const groupedSheet = XLSX.utils.json_to_sheet(groupTrialsByCondition(stimData));

    // === 生成 Excel 文件 ===
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, trialSheet, 'Trial Data');
    XLSX.utils.book_append_sheet(wb, kSheet, 'K Values');
    XLSX.utils.book_append_sheet(wb, groupedSheet, 'Grouped Trials');

    // 文件名规则与 exp1_clt 完全一致：实验名称_被试编号（如 exp1_fcdt_0701231234.xlsx）
    // SubjectID 为字符串（身份证后 6 位 + 手机后 4 位），保留前导 0
    const fileName = EXPERIMENT_NAME + '_' + p.subjectID + '.xlsx';
    console.log('[' + EXPERIMENT_NAME + '] 导出模式=' + (p.debugMode ? '调试' : '正式') +
        ' 被试编号=' + p.subjectID + ' 文件名=' + fileName);
    saveWorkbookFile(wb, fileName);
}

// ============================================================
//  写出 Excel 文件
//  与 exp1_clt 的 saveWorkbookFile 完全一致：
//   1) 用正确的 xlsx MIME + 明确的文件名触发下载；
//   2) 校验 zip 魔数 'PK'，确保写出的是合法 xlsx（防止空表 / 异常格式）；
//   3) 在结束界面保留一个手动下载链接，避免某些浏览器 / 内嵌预览不遵循
//      download 属性导致文件被存成随机名或没有扩展名。
// ============================================================
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
let lastExport = null;   // { url, fileName, size }

function saveWorkbookFile(wb, fileName) {
    if (typeof XLSX === 'undefined') {
        throw new Error('Excel 导出库 (xlsx) 未加载');
    }
    const bytes = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const u8 = (bytes instanceof Uint8Array) ? bytes : new Uint8Array(bytes);
    // 校验 zip 魔数 'PK'，确保写出的是合法 xlsx（而不是被当成其它格式）
    if (u8[0] !== 0x50 || u8[1] !== 0x4B) {
        throw new Error('生成的 Excel 内容异常');
    }

    const blob = new Blob([u8], { type: XLSX_MIME });
    const url = URL.createObjectURL(blob);
    lastExport = { url: url, fileName: fileName, size: u8.length };

    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();

    console.log('[' + EXPERIMENT_NAME + '] 已导出 ' + fileName + '（' + u8.length + ' 字节，' +
        wb.SheetNames.length + ' 个 sheet）');
    showManualDownload(fileName, url);
}

// 结束界面上的手动下载入口（文件名与自动下载一致）
function showManualDownload(fileName, url) {
    const box = document.getElementById('manual-download');
    if (!box) return;
    const link = document.getElementById('manual-download-link');
    if (link) {
        link.href = url;
        link.download = fileName;
        link.innerText = fileName;
    }
    box.classList.remove('hidden');
}

// ============================================================
//  Canvas 绘图工具
// ============================================================
function drawBackground() {
    ctx.fillStyle = 'rgb(128,128,128)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function drawFixation() {
    ctx.fillStyle = 'rgb(0,0,0)';
    ctx.beginPath();
    ctx.arc(canvas.width / 2, canvas.height / 2, prefs.fixationSize, 0, Math.PI * 2);
    ctx.fill();
}

function drawSquare(x, y, colorArr) {
    ctx.fillStyle = `rgb(${colorArr[0]},${colorArr[1]},${colorArr[2]})`;
    const half = prefs.stimSize / 2;
    ctx.fillRect(x - half, y - half, prefs.stimSize, prefs.stimSize);
}

// ============================================================
//  getStimLocs — 极坐标四象限位置生成（对应 MATLAB getStimLocs）
// ============================================================
function getStimLocs(nItems, cx, cy) {
    const S = prefs.stimSize;
    const canvasSize = 768;
    const canvasR = canvasSize / 2;
    const ringCenter = 220;
    const ringHalfWidth = 20;
    let minR = ringCenter - ringHalfWidth;
    let maxR = ringCenter + ringHalfWidth;
    if (maxR > canvasR - S) maxR = canvasR - S;
    if (minR < S * 2.0) minR = S * 2.0;

    const minDist = S * 2.5;
    const relaxDist = S * 2.0;
    const axisMargin = 20 * Math.PI / 180;

    const quadPatterns6 = [
        [2,2,1,1], [1,2,1,2], [1,1,2,2], [1,2,2,1], [2,1,1,2], [2,1,2,1]
    ];

    let perQuad;
    if (nItems === 3) {
        // SS3 随机空出一个象限，其余三个象限各放一个色块；沿用同一 PRNG 保证可复现。
        // 位置生成规则本身与 SS4 / SS6 完全一致，只是本试次只用 3 个象限。
        perQuad = [1, 1, 1, 0];
        shuffleArray(perQuad);
    } else if (nItems === 4) {
        perQuad = [1, 1, 1, 1];
    } else if (nItems === 6) {
        perQuad = quadPatterns6[randInt(0, 5)];
    } else {
        throw new Error('getStimLocs: nItems must be 3, 4, or 6, got ' + nItems);
    }

    const qLo = [
        axisMargin, Math.PI / 2 + axisMargin,
        Math.PI + axisMargin, 3 * Math.PI / 2 + axisMargin
    ];
    const qHi = [
        Math.PI / 2 - axisMargin, Math.PI - axisMargin,
        3 * Math.PI / 2 - axisMargin, 2 * Math.PI - axisMargin
    ];

    const nCandidates = 30;
    let bestScore = -Infinity;
    let bestXPos = [], bestYPos = [];

    for (let cand = 0; cand < nCandidates; cand++) {
        let xPos_c = new Array(nItems).fill(0);
        let yPos_c = new Array(nItems).fill(0);
        let idx = 0;

        for (let q = 0; q < 4; q++) {
            const k = perQuad[q];
            if (k === 0) continue;
            const qRange = qHi[q] - qLo[q];

            for (let i = 0; i < k; i++) {
                let thetaC, subLo, subHi;
                if (k === 1) {
                    thetaC = qLo[q] + qRange * 0.5;
                    let jit = qRange * 0.15 * (random() - 0.5) * 2;
                    subLo = thetaC + jit - qRange * 0.05;
                    subHi = thetaC + jit + qRange * 0.05;
                } else {
                    thetaC = qLo[q] + qRange * (0.15 + 0.70 * i / (k - 1));
                    let jit = qRange * 0.05 * (random() - 0.5) * 2;
                    subLo = thetaC + jit - qRange * 0.03;
                    subHi = thetaC + jit + qRange * 0.03;
                }

                let placed = false;

                for (let att = 0; att < 500 && !placed; att++) {
                    let r = minR + (maxR - minR) * Math.sqrt(random());
                    let theta = subLo + (subHi - subLo) * random();
                    let xi = cx + r * Math.cos(theta);
                    let yi = cy + r * Math.sin(theta);
                    if (Math.abs(xi - cx) < S || Math.abs(yi - cy) < S) continue;
                    let tooClose = false;
                    for (let j = 0; j < idx; j++) {
                        if (Math.hypot(xi - xPos_c[j], yi - yPos_c[j]) < minDist) { tooClose = true; break; }
                    }
                    if (!tooClose) { xPos_c[idx] = xi; yPos_c[idx] = yi; placed = true; }
                }

                if (!placed) {
                    for (let att = 0; att < 800 && !placed; att++) {
                        let r = minR + (maxR - minR) * Math.sqrt(random());
                        let theta = qLo[q] + qRange * random();
                        let xi = cx + r * Math.cos(theta);
                        let yi = cy + r * Math.sin(theta);
                        if (Math.abs(xi - cx) < S || Math.abs(yi - cy) < S) continue;
                        let tooClose = false;
                        for (let j = 0; j < idx; j++) {
                            if (Math.hypot(xi - xPos_c[j], yi - yPos_c[j]) < minDist) { tooClose = true; break; }
                        }
                        if (!tooClose) { xPos_c[idx] = xi; yPos_c[idx] = yi; placed = true; }
                    }
                }

                if (!placed) {
                    for (let att = 0; att < 1000 && !placed; att++) {
                        let r = minR + (maxR - minR) * Math.sqrt(random());
                        let theta = qLo[q] + qRange * random();
                        let xi = cx + r * Math.cos(theta);
                        let yi = cy + r * Math.sin(theta);
                        if (Math.abs(xi - cx) < S || Math.abs(yi - cy) < S) continue;
                        let tooClose = false;
                        for (let j = 0; j < idx; j++) {
                            if (Math.hypot(xi - xPos_c[j], yi - yPos_c[j]) < relaxDist) { tooClose = true; break; }
                        }
                        if (!tooClose) { xPos_c[idx] = xi; yPos_c[idx] = yi; placed = true; }
                    }
                }

                if (!placed) {
                    let bestMinD = -1, bestXi = 0, bestYi = 0;
                    for (let att = 0; att < 2000; att++) {
                        let r = minR + (maxR - minR) * Math.sqrt(random());
                        let theta = qLo[q] + qRange * random();
                        let xi = cx + r * Math.cos(theta);
                        let yi = cy + r * Math.sin(theta);
                        if (Math.abs(xi - cx) < S || Math.abs(yi - cy) < S) continue;
                        let minD = Infinity;
                        for (let j = 0; j < idx; j++) {
                            let d = Math.hypot(xi - xPos_c[j], yi - yPos_c[j]);
                            if (d < minD) minD = d;
                        }
                        if (minD > bestMinD) { bestMinD = minD; bestXi = xi; bestYi = yi; }
                    }
                    xPos_c[idx] = bestXi; yPos_c[idx] = bestYi;
                }
                idx++;
            }
        }

        let dists = [];
        for (let a = 0; a < nItems - 1; a++) {
            for (let b = a + 1; b < nItems; b++) {
                dists.push(Math.hypot(xPos_c[a] - xPos_c[b], yPos_c[a] - yPos_c[b]));
            }
        }
        let angles = [];
        for (let i = 0; i < nItems; i++) {
            angles.push(Math.atan2(yPos_c[i] - cy, xPos_c[i] - cx));
        }
        angles = angles.map(a => (a + 2 * Math.PI) % (2 * Math.PI));
        angles.sort((a, b) => a - b);
        let angularGaps = [];
        for (let i = 0; i < nItems; i++) {
            let next = i < nItems - 1 ? angles[i + 1] : angles[0] + 2 * Math.PI;
            angularGaps.push(next - angles[i]);
        }

        let minD = Math.min(...dists);
        let meanD = dists.reduce((s, d) => s + d, 0) / dists.length;
        let stdD = Math.sqrt(dists.reduce((s, d) => s + (d - meanD) ** 2, 0) / (dists.length - 1));
        let meanG = angularGaps.reduce((s, g) => s + g, 0) / angularGaps.length;
        let stdG = Math.sqrt(angularGaps.reduce((s, g) => s + (g - meanG) ** 2, 0) / (angularGaps.length - 1));

        let score = minD - 0.4 * stdD - 40 * stdG;
        if (score > bestScore) {
            bestScore = score;
            bestXPos = [...xPos_c];
            bestYPos = [...yPos_c];
        }
    }

    let locs = [];
    for (let i = 0; i < nItems; i++) {
        locs.push({ x: bestXPos[i], y: bestYPos[i] });
    }
    return locs;
}
