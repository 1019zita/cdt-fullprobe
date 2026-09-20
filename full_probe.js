// ============================================================
// full_probe.js
// 全探测变化觉察任务 (Full-Probe Change Detection Task)
// 基于 FullProbe.m (0630版) 实验规则
//
// 实验设计：
//   2×2 设计：2 set size (4,6) × 2 change (change, no-change)
//   每种条件 35 trial，共 140 trial，均分到 4 个 block（每 block 35 trial）
//   练习 20 trial（4 条件 × 5）
//
// 试次结构：
//   1. ITI              (500 ms)    显示注视点
//   2. 记忆阵列         (250 ms)    显示注视点
//   3. 保留间隔         (1000 ms)   不显示注视点
//   4. 测试阵列         (无时间限制) 显示注视点  Z=无变化, /=有变化
//
// 变化颜色规则：
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

// --- 实验参数（对应 FullProbe.m getPreferences） ---
const prefs = {
    setSizes: [4, 6],
    change: [0, 1],
    numBlocks: 4,
    numTrials: 35,
    nPerCond: 35,
    nPractice: 20,
    ITI: 500,                // ms
    stimulusDuration: 250,   // ms
    retentionInterval: 1000, // ms
    stimSize: 51,
    minDist: 51 * 2.5,
    fixationSize: 8,
    breakLength: 0.5,
    debugMode: false
};

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
    questionnaire: document.getElementById('questionnaire-phase'),
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

function updateSubjectID() {
    const idVal = realIdCard || idCardInput.value;
    const phoneVal = phoneInput.value;
    if (idVal.length >= 6 && phoneVal.length >= 4) {
        subjectIDInput.value = idVal.slice(-6) + phoneVal.slice(-4);
    } else {
        subjectIDInput.value = '';
    }
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
    p.subjectID = parseInt(subjectIDInput.value) || Date.now();
    p.rndSeed = p.subjectID; // 随机种子 = SubjectID（身份证后6位+手机后4位）
    p.saveLocal = document.getElementById('saveLocal').checked;

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
        prefs.numTrials = 5;
        prefs.nPerCond = 5;
        prefs.nPractice = 8;
        prefs.breakLength = 0;
        if (isAllOnes(p.subName) && isAllOnes(p.subAge) && isAllOnes(p.subIdCard) && isAllOnes(p.subPhone)) {
            p.subjectID = 1111;
            p.rndSeed = 1111;
            if (subjectIDInput) subjectIDInput.value = '1111';
        }
    }

    seedRandom(p.rndSeed);

    try {
        await window.CLTStorage.initializeStorage({ participant: p });
    } catch (err) {
        console.error("Storage init failed", err);
        document.getElementById('finished-text').innerText = '数据存储初始化失败，实验未开始。';
        switchScreen('finished');
        return;
    }

    try {
        if (document.documentElement.requestFullscreen) {
            await document.documentElement.requestFullscreen();
        }
    } catch (err) { console.log("Fullscreen denied."); }

    switchScreen('instructions');
    experimentPhase = 'instructions';
});

function switchScreen(screenName) {
    for (let key in screens) screens[key].classList.add('hidden');
    screens[screenName].classList.remove('hidden');
}

// --- 全局键盘监听 ---
window.addEventListener('keydown', (e) => {
    if (experimentPhase === 'instructions' && (e.code === 'Space' || e.key === ' ')) {
        e.preventDefault();
        startPractice();
    } else if (experimentPhase === 'practice_response') {
        if (e.key === 'z' || e.key === 'Z') { e.preventDefault(); recordPracticeResponse(0); }
        else if (e.key === '/') { e.preventDefault(); recordPracticeResponse(1); }
        else if (e.key === 'Escape') { finishExperiment(); }
    } else if (experimentPhase === 'practice_end' && (e.code === 'Space' || e.key === ' ')) {
        e.preventDefault();
        startFormal();
    } else if (experimentPhase === 'trial_response') {
        if (e.key === 'z' || e.key === 'Z') { e.preventDefault(); recordResponse(0); }
        else if (e.key === '/') { e.preventDefault(); recordResponse(1); }
        else if (e.key === 'Escape') { finishExperiment(); }
    } else if (experimentPhase === 'break_wait' && (e.code === 'Space' || e.key === ' ')) {
        e.preventDefault();
        nextBlock();
    } else if (experimentPhase === 'questionnaire') {
        if (['1', '2', '3', '4', '5'].includes(e.key)) {
            handleQuestionnaire(parseInt(e.key));
        }
    }
});

// ============================================================
//  练习阶段（20 trial，2×2 平衡设计）
// ============================================================
let practiceTrials = [];
let practiceTrialIdx = 0;
let practiceAcc = [];

function startPractice() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    let nPerCondPractice = prefs.nPractice / (prefs.setSizes.length * prefs.change.length);
    practiceTrials = [];
    for (let ss of prefs.setSizes) {
        for (let ch of prefs.change) {
            for (let i = 0; i < nPerCondPractice; i++) {
                practiceTrials.push({ setSize: ss, change: ch });
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
// FullProbe 专用：变化方块索引及新颜色
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
        setSize: condition.setSize, isChange: condition.change
    };

    // ITI
    drawBackground(); drawFixation();
    await wait(prefs.ITI);

    await showMemoryArrayPractice(condition);
}

async function showMemoryArrayPractice(condition) {
    let colorIndexArr = [0,1,2,3,4,5,6,7,8];
    shuffleArray(colorIndexArr);
    activeColors = colorIndexArr.slice(0, condition.setSize);
    activeLocs = getStimLocs(condition.setSize, canvas.width / 2, canvas.height / 2);

    drawBackground(); drawFixation();
    for (let i = 0; i < condition.setSize; i++) {
        drawSquare(activeLocs[i].x, activeLocs[i].y, colors_9[activeColors[i]]);
    }
    await wait(prefs.stimulusDuration);

    // 保留间隔
    drawBackground();
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

    showFullProbePractice(condition);
}

function showFullProbePractice(condition) {
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
    let rt = (performance.now() - responseStartTime) / 1000;
    practiceTrialData.rt = rt;
    practiceTrialData.response = responseType;
    practiceTrialData.changeItem = changeItemIdx;
    practiceTrialData.origColorIdx = activeColors[changeItemIdx];
    practiceTrialData.probeColorIdx = changeColorIdx;

    let correct = (practiceTrialData.isChange === responseType) ? 1 : 0;
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
    ctx.fillStyle = 'rgb(255,235,59)';
    ctx.fillText('按 空格键(Space) 开始正式实验', canvas.width / 2, canvas.height / 2 + 60);
}

// ============================================================
//  正式实验阶段
// ============================================================
function startFormal() {
    let allSS = [], allCH = [];
    for (let ss of prefs.setSizes) {
        for (let ch of prefs.change) {
            for (let i = 0; i < prefs.nPerCond; i++) {
                allSS.push(ss);
                allCH.push(ch);
            }
        }
    }
    let nTotal = allSS.length;
    let perm = [];
    for (let i = 0; i < nTotal; i++) perm.push(i);
    shuffleArray(perm);
    allSS = perm.map(i => allSS[i]);
    allCH = perm.map(i => allCH[i]);

    allFormalTrials = [];
    for (let b = 0; b < prefs.numBlocks; b++) {
        for (let t = 0; t < prefs.numTrials; t++) {
            let idx = b * prefs.numTrials + t;
            allFormalTrials.push({ setSize: allSS[idx], change: allCH[idx] });
        }
    }

    currentBlock = 1;
    startBlock();
}

let allFormalTrials = [];
let formalTrialGlobalIdx = 0;

function startBlock() {
    blockTrials = allFormalTrials.slice(
        (currentBlock - 1) * prefs.numTrials,
        currentBlock * prefs.numTrials
    );
    currentTrial = 0;
    formalTrialGlobalIdx = (currentBlock - 1) * prefs.numTrials;

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
        isChange: condition.change,
        experimentType: 'FullProbe'
    };

    // ITI
    drawBackground(); drawFixation();
    await wait(prefs.ITI);

    await showMemoryArray(condition);
}

async function showMemoryArray(condition) {
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
    await wait(prefs.stimulusDuration);

    // 保留间隔
    drawBackground();
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

    showFullProbe(condition);
}

function showFullProbe(condition) {
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
    let rt = (performance.now() - responseStartTime) / 1000;
    trialData.rt = rt;
    trialData.response = responseType;
    trialData.correctResponse = trialData.isChange === 1 ? 1 : 0;
    trialData.accuracy = (trialData.isChange === responseType) ? 1 : 0;

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
function endBlock() {
    window.CLTStorage.saveCheckpoint({
        block: currentBlock,
        completedTrials: stimData.length
    });

    if (currentBlock < prefs.numBlocks && !p.debugMode) {
        switchScreen('break');
        experimentPhase = 'break';

        let blockTrialsData = stimData.filter(d => d.block === currentBlock);
        let blockAcc = blockTrialsData.length > 0
            ? Math.round(blockTrialsData.reduce((s, d) => s + d.accuracy, 0) / blockTrialsData.length * 100)
            : 0;

        document.getElementById('block-progress').innerText =
            `已完成 Block ${currentBlock} / ${prefs.numBlocks}  |  正确率：${blockAcc}%`;

        let timeLeft = Math.round(prefs.breakLength * 60);
        document.getElementById('break-time').innerText = `剩余时间: ${timeLeft} 秒`;

        let timer = setInterval(() => {
            timeLeft--;
            document.getElementById('break-time').innerText = `剩余时间: ${timeLeft} 秒`;
            if (timeLeft <= 0) {
                clearInterval(timer);
                experimentPhase = 'break_wait';
                document.getElementById('break-time').innerText = '休息结束';
                document.getElementById('block-progress').innerText =
                    `已完成 Block ${currentBlock} / ${prefs.numBlocks}  |  按 空格键 继续`;
            }
        }, 1000);
    } else {
        startQuestionnaire();
    }
}

function nextBlock() {
    currentBlock++;
    startBlock();
}

// ============================================================
//  问卷阶段
// ============================================================
let qStep = 1;
function startQuestionnaire() {
    switchScreen('questionnaire');
    experimentPhase = 'questionnaire';
    qStep = 1;
    document.getElementById('q-tired').classList.remove('hidden');
    document.getElementById('q-attention').classList.add('hidden');
}

function handleQuestionnaire(value) {
    if (qStep === 1) {
        p.tired = value;
        document.getElementById('q-tired').classList.add('hidden');
        document.getElementById('q-attention').classList.remove('hidden');
        qStep++;
    } else if (qStep === 2) {
        p.attention = value;
        for (let d of stimData) {
            d.tired = p.tired;
            d.attention = p.attention;
            d.subName = p.subName;
            d.subGender = p.subGender;
            d.subAge = p.subAge;
            d.subIdCard = maskIdCard(p.subIdCard); // 导出掩蔽后的身份证号
            d.subPhone = p.subPhone;
            d.subjectID = p.subjectID;
            d.rndSeed = p.rndSeed;
        }
        finishExperiment();
    }
}

// ============================================================
//  数据保存
// ============================================================
async function finishExperiment() {
    const completedNormally = p.attention !== undefined;
    switchScreen('upload');
    experimentPhase = 'upload';

    let uploadMsg = "";
    let storageSucceeded = false;

    try {
        const result = await window.CLTStorage.saveFinalResult({
            trials: stimData,
            questionnaire: { tired: p.tired, attention: p.attention }
        });
        storageSucceeded = true;
        uploadMsg += result && result.message ? result.message : '数据已保存。';
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
            message: completedNormally ? 'Full-Probe completed' : 'Full-Probe ended early'
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

function downloadXLSX() {
    if (stimData.length === 0) return;

    // === Sheet 1: Trial Data ===
    const trialSheet = XLSX.utils.json_to_sheet(stimData);

    // === Sheet 2: K Values ===
    // FullProbe 公式: K = N × (Hit rate - False Alarm rate)
    // Hit = change 试次中正确判断"变化"的比例
    // FA  = no-change 试次中错误判断"变化"的比例
    const kData = [];
    for (let ss of prefs.setSizes) {
        let changeTrials = stimData.filter(d => d.setSize === ss && d.isChange === 1);
        let noChangeTrials = stimData.filter(d => d.setSize === ss && d.isChange === 0);

        let nHit = changeTrials.filter(d => d.accuracy === 1).length;
        let nFA = noChangeTrials.filter(d => d.response === 1).length;
        let hitRate = changeTrials.length > 0 ? nHit / changeTrials.length : 0;
        let faRate = noChangeTrials.length > 0 ? nFA / noChangeTrials.length : 0;
        let k = ss * (hitRate - faRate);

        kData.push({
            SubjectID: p.subjectID,
            ExperimentType: 'FullProbe',
            SetSize: ss,
            HitRate: hitRate.toFixed(4),
            FalseAlarmRate: faRate.toFixed(4),
            K: k.toFixed(4)
        });
    }
    const kSheet = XLSX.utils.json_to_sheet(kData);

    // === 生成 Excel 文件 ===
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, trialSheet, 'Trial Data');
    XLSX.utils.book_append_sheet(wb, kSheet, 'K Values');

    const fileName = `${p.subjectID}_FullProbe.xlsx`;
    XLSX.writeFile(wb, fileName);
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
    if (nItems === 4) {
        perQuad = [1, 1, 1, 1];
    } else if (nItems === 6) {
        perQuad = quadPatterns6[randInt(0, 5)];
    } else {
        throw new Error('getStimLocs: nItems must be 4 or 6, got ' + nItems);
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
