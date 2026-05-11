import {
  PoseLandmarker,
  FilesetResolver
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";

const startScreen = document.getElementById("start-screen");
const gameScreen = document.getElementById("game-screen");
const resultScreen = document.getElementById("result-screen");

const startBtn = document.getElementById("start-btn");
const restartBtn = document.getElementById("restart-btn");

const resultTitle = document.getElementById("result-title");
const resultDesc = document.getElementById("result-desc");
const resultScore = document.getElementById("result-score");

const nameInput = document.getElementById("player-name");
const playerDisplayName = document.getElementById("player-display-name");

const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const statusText = document.getElementById("status");
const hintText = document.getElementById("hint");
const countText = document.getElementById("count");
const hpFill = document.getElementById("hp-fill");
const hpText = document.getElementById("hp-text");
const damageText = document.getElementById("damage-text");
const kneeAngleText = document.getElementById("knee-angle");
const depthStatusText = document.getElementById("depth-status");

const scoreText = document.getElementById("score");
const comboText = document.getElementById("combo");
const squatNumText = document.getElementById("squat-num");

const player = document.getElementById("player");
const monster = document.getElementById("monster");
const battleArea = document.getElementById("battle-area");

const levelTransition = document.getElementById("level-transition");
const levelSmallText = document.getElementById("level-small-text");
const levelTitle = document.getElementById("level-title");
const levelDesc = document.getElementById("level-desc");
const levelMonster = document.getElementById("level-monster");
const levelCountdown = document.getElementById("level-countdown");

let poseLandmarker;
let lastVideoTime = -1;
let animationId = null;

let playerName = "玩家";
let squatCount = 0;
let monsterHp = 100;
let maxHp = 100;
let level = 1;
let score = 0;
let combo = 0;
let maxCombo = 0;
let lastSquatTime = 0;

let gameRunning = false;
let cameraReady = false;
let modelReady = false;
let state = "stand";

let squatLocked = false;
let lastDownTime = 0;

const MAX_LEVEL = 10;
const VISIBILITY_THRESHOLD = 0.35;

const STAND_KNEE_MIN = 155;
const SQUAT_KNEE_MAX = 105;
const PERFECT_KNEE_ANGLE = 90;
const HIP_DEPTH_MARGIN = -0.02;
const MIN_SQUAT_TIME = 600;

const BASE_DAMAGE = 10;
const COMBO_TIMEOUT = 2500;
const CRITICAL_RATE = 0.2;

const MONSTER_LIST = ["👾", "👹", "🧟", "🐲", "🦖", "👺", "🦂", "🦹", "💀", "🔥"];

const POSE_CONNECTIONS = [
  [11, 12],
  [11, 13],
  [13, 15],
  [12, 14],
  [14, 16],
  [11, 23],
  [12, 24],
  [23, 24],
  [23, 25],
  [25, 27],
  [24, 26],
  [26, 28]
];

function showScreen(screen) {
  [startScreen, gameScreen, resultScreen].forEach((s) => {
    s.classList.remove("active");
  });
  screen.classList.add("active");
}

function getLevelHp(lv) {
  return 100 + (lv - 1) * 40;
}

function updateLevelUI() {
  const hpPercent = Math.max(0, (monsterHp / maxHp) * 100);
  hpFill.style.width = `${hpPercent}%`;
  hpText.textContent = `第 ${level} / ${MAX_LEVEL} 關　怪物血量：${monsterHp} / ${maxHp}`;
}

function resetGameData() {
  squatCount = 0;
  level = 1;
  maxHp = getLevelHp(level);
  monsterHp = maxHp;
  score = 0;
  combo = 0;
  maxCombo = 0;
  lastSquatTime = 0;
  squatLocked = false;
  lastDownTime = 0;

  gameRunning = false;
  state = "stand";

  countText.textContent = "深蹲次數：0";
  squatNumText.textContent = "0";
  scoreText.textContent = "0";
  comboText.textContent = "x0";

  levelTransition.classList.add("hidden");

  updateLevelUI();

  statusText.textContent = "準備開始";
  hintText.textContent = "提示：請先站穩並讓全身入鏡";
  damageText.textContent = "";
  damageText.classList.remove("show");

  kneeAngleText.textContent = "膝蓋角度：--";
  depthStatusText.textContent = "動作品質：--";

  player.classList.remove("attack");
  monster.classList.remove("hit");
  battleArea.classList.remove("shake");
}

async function setupCamera() {
  if (cameraReady) return;

  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "user" },
    audio: false
  });

  video.srcObject = stream;

  await new Promise((resolve) => {
    video.onloadedmetadata = () => {
      video.play();
      resolve();
    };
  });

  cameraReady = true;
}

async function createPoseLandmarker() {
  if (modelReady) return;

  statusText.textContent = "AI 模型載入中...";

  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
  );

  poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task"
    },
    runningMode: "VIDEO",
    numPoses: 1
  });

  modelReady = true;
}

function pointVisible(pt) {
  return pt && (pt.visibility === undefined || pt.visibility >= VISIBILITY_THRESHOLD);
}

function getMidPoint(a, b) {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2
  };
}

function calculateAngle(a, b, c) {
  const abx = a.x - b.x;
  const aby = a.y - b.y;
  const cbx = c.x - b.x;
  const cby = c.y - b.y;

  const dot = abx * cbx + aby * cby;
  const magAB = Math.hypot(abx, aby);
  const magCB = Math.hypot(cbx, cby);

  if (magAB === 0 || magCB === 0) return 180;

  let cos = dot / (magAB * magCB);
  cos = Math.min(1, Math.max(-1, cos));

  return Math.acos(cos) * (180 / Math.PI);
}

function getPoseData(landmarks) {
  const leftHip = landmarks[23];
  const rightHip = landmarks[24];
  const leftKnee = landmarks[25];
  const rightKnee = landmarks[26];
  const leftAnkle = landmarks[27];
  const rightAnkle = landmarks[28];

  const requiredPoints = [
    leftHip,
    rightHip,
    leftKnee,
    rightKnee,
    leftAnkle,
    rightAnkle
  ];

  if (!requiredPoints.every(pointVisible)) {
    return null;
  }

  const hipMid = getMidPoint(leftHip, rightHip);
  const kneeMid = getMidPoint(leftKnee, rightKnee);

  const leftKneeAngle = calculateAngle(leftHip, leftKnee, leftAnkle);
  const rightKneeAngle = calculateAngle(rightHip, rightKnee, rightAnkle);
  const avgKneeAngle = (leftKneeAngle + rightKneeAngle) / 2;

  return {
    hipMid,
    kneeMid,
    avgKneeAngle
  };
}

function isDeepEnough(poseData) {
  const kneeOK = poseData.avgKneeAngle <= SQUAT_KNEE_MAX;
  const hipOK = poseData.hipMid.y >= poseData.kneeMid.y + HIP_DEPTH_MARGIN;

  return kneeOK && hipOK;
}

function isStanding(poseData) {
  return poseData.avgKneeAngle >= STAND_KNEE_MIN;
}

function getQualityText(poseData) {
  if (poseData.avgKneeAngle <= PERFECT_KNEE_ANGLE) {
    return "動作品質：完美深蹲";
  }

  if (poseData.avgKneeAngle <= SQUAT_KNEE_MAX) {
    return "動作品質：標準";
  }

  if (poseData.avgKneeAngle <= 125) {
    return "動作品質：接近標準，再低一點";
  }

  return "動作品質：尚未達標";
}

function drawSkeleton(landmarks) {
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#22c55e";
  ctx.fillStyle = "#facc15";

  POSE_CONNECTIONS.forEach(([start, end]) => {
    const a = landmarks[start];
    const b = landmarks[end];

    if (!a || !b) return;

    ctx.beginPath();
    ctx.moveTo(a.x * canvas.width, a.y * canvas.height);
    ctx.lineTo(b.x * canvas.width, b.y * canvas.height);
    ctx.stroke();
  });

  landmarks.forEach((p) => {
    if (!p) return;

    ctx.beginPath();
    ctx.arc(p.x * canvas.width, p.y * canvas.height, 5, 0, Math.PI * 2);
    ctx.fill();
  });
}

function updateCombo() {
  const now = Date.now();

  if (now - lastSquatTime <= COMBO_TIMEOUT) {
    combo += 1;
  } else {
    combo = 1;
  }

  lastSquatTime = now;
  maxCombo = Math.max(maxCombo, combo);
  comboText.textContent = `x${combo}`;
}

function calculateDamage() {
  let damage = BASE_DAMAGE + combo * 2;
  const critical = Math.random() < CRITICAL_RATE;

  if (critical) {
    damage *= 2;
  }

  return {
    damage,
    critical
  };
}

function showDamageText(damage, critical) {
  damageText.textContent = critical
    ? `💥 暴擊 -${damage}`
    : `-${damage}`;

  damageText.classList.remove("show");
  void damageText.offsetWidth;
  damageText.classList.add("show");
}

function playAttackAnimation(damage, critical) {
  player.classList.add("attack");

  setTimeout(() => {
    monster.classList.add("hit");
    battleArea.classList.add("shake");
    showDamageText(damage, critical);
  }, 120);

  setTimeout(() => {
    player.classList.remove("attack");
    monster.classList.remove("hit");
    battleArea.classList.remove("shake");
  }, 420);
}

function showLevelTransition() {
  if (level >= MAX_LEVEL) {
    setTimeout(endGame, 650);
    return;
  }

  gameRunning = false;

  const currentLevel = level;
  const nextLevelNumber = level + 1;
  const nextMonster = MONSTER_LIST[nextLevelNumber - 1] || "👾";

  levelTransition.classList.remove("hidden");
  levelSmallText.textContent = "STAGE CLEAR";
  levelTitle.textContent = `第 ${currentLevel} 關通過`;
  levelDesc.textContent = `第 ${nextLevelNumber} 關怪物即將登場`;
  levelMonster.textContent = nextMonster;

  let count = 3;
  levelCountdown.textContent = count;

  const timer = setInterval(() => {
    count -= 1;

    if (count > 0) {
      levelCountdown.textContent = count;
    } else {
      clearInterval(timer);

      level += 1;
      maxHp = getLevelHp(level);
      monsterHp = maxHp;
      combo = 0;
      comboText.textContent = "x0";
      state = "stand";
      squatLocked = false;

      updateLevelUI();

      levelSmallText.textContent = "BOSS APPROACHING";
      levelTitle.textContent = `第 ${level} 關開始`;
      levelDesc.textContent = "準備標準深蹲攻擊！";
      levelMonster.textContent = MONSTER_LIST[level - 1] || "👾";
      levelCountdown.textContent = "GO!";

      setTimeout(() => {
        levelTransition.classList.add("hidden");
        statusText.textContent = `第 ${level} 關開始！`;
        hintText.textContent = "請完成標準深蹲：蹲下到位，再完整站起";
        gameRunning = true;
      }, 700);
    }
  }, 1000);
}

function updateMonster(damage, critical) {
  monsterHp = Math.max(0, monsterHp - damage);

  updateLevelUI();
  playAttackAnimation(damage, critical);

  if (monsterHp <= 0) {
    score += level * 50;
    scoreText.textContent = score;

    statusText.textContent = `第 ${level} 關通過！`;
    hintText.textContent = level >= MAX_LEVEL ? "全部關卡完成！" : "準備進入下一關";

    setTimeout(showLevelTransition, 700);
  }
}

function updateMetrics(poseData) {
  kneeAngleText.textContent = `膝蓋角度：${poseData.avgKneeAngle.toFixed(1)}°`;
  depthStatusText.textContent = getQualityText(poseData);
}

function completeSquat(result) {
  squatCount += 1;
  updateCombo();

  score += 10 * combo + result.damage + level * 5;

  countText.textContent = `深蹲次數：${squatCount}`;
  squatNumText.textContent = squatCount;
  scoreText.textContent = score;

  statusText.textContent = "標準深蹲成功，角色攻擊！";
  hintText.textContent = result.critical
    ? "暴擊！傷害加倍！"
    : `目前第 ${level} 關，保持標準動作`;

  updateMonster(result.damage, result.critical);
}

function processSquat(poseData) {
  const deepEnough = isDeepEnough(poseData);
  const standingRecovered = isStanding(poseData);

  if (state === "stand") {
    if (deepEnough && !squatLocked) {
      state = "down";
      squatLocked = true;
      lastDownTime = Date.now();

      statusText.textContent = "已達標準深蹲深度";
      hintText.textContent = "請穩定後再站起，完成一次標準深蹲";
    } else {
      statusText.textContent = "尚未達標準深蹲";
      hintText.textContent = "請蹲低一點，膝蓋角度需接近 105° 以下";
    }
  } else if (state === "down") {
    if (standingRecovered && squatLocked) {
      const duration = Date.now() - lastDownTime;

      if (duration < MIN_SQUAT_TIME) {
        state = "stand";
        squatLocked = false;
        combo = 0;
        comboText.textContent = "x0";

        statusText.textContent = "太快了，動作無效";
        hintText.textContent = "請完整蹲下並穩定站起，不要用晃動觸發";
        return;
      }

      state = "stand";
      squatLocked = false;

      const result = calculateDamage();
      completeSquat(result);
    } else {
      statusText.textContent = "請完整站起";
      hintText.textContent = "膝蓋伸直到接近站姿，才會計算一次";
    }
  }
}

function drawPose(results) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (results.landmarks && results.landmarks.length > 0) {
    const landmarks = results.landmarks[0];

    drawSkeleton(landmarks);

    const poseData = getPoseData(landmarks);

    if (!poseData) {
      statusText.textContent = "請讓全身完整入鏡";
      hintText.textContent = "至少要拍到髖部、膝蓋、腳踝";
      kneeAngleText.textContent = "膝蓋角度：--";
      depthStatusText.textContent = "動作品質：--";
      return;
    }

    updateMetrics(poseData);

    if (gameRunning && monsterHp > 0) {
      processSquat(poseData);
    }
  } else {
    statusText.textContent = "請站到鏡頭前";
    hintText.textContent = "讓身體完整入鏡";
    kneeAngleText.textContent = "膝蓋角度：--";
    depthStatusText.textContent = "動作品質：--";
  }
}

function predictWebcam() {
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  if (video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;

    const results = poseLandmarker.detectForVideo(
      video,
      performance.now()
    );

    drawPose(results);
  }

  animationId = requestAnimationFrame(predictWebcam);
}

function endGame() {
  gameRunning = false;

  showScreen(resultScreen);

  resultTitle.textContent = "十關挑戰成功！";
  resultDesc.textContent = `${playerName} 成功通過 ${MAX_LEVEL} 關，共完成 ${squatCount} 次標準深蹲，最高 Combo x${maxCombo}`;
  resultScore.textContent = `總分：${score}`;
}

async function startGame() {
  resetGameData();

  playerName = nameInput.value.trim() || "玩家";
  playerDisplayName.textContent = `玩家：${playerName}`;

  await setupCamera();
  await createPoseLandmarker();

  showScreen(gameScreen);

  if (!animationId) {
    predictWebcam();
  }

  gameRunning = true;
  statusText.textContent = "開始遊戲";
  hintText.textContent = `第 ${level} 關開始，請完成標準深蹲攻擊怪物`;
}

startBtn.addEventListener("click", async () => {
  try {
    await startGame();
  } catch (err) {
    console.error(err);
    alert("啟動失敗：" + err.message);
  }
});

restartBtn.addEventListener("click", async () => {
  try {
    await startGame();
  } catch (err) {
    console.error(err);
    alert("重新開始失敗：" + err.message);
  }
});

showScreen(startScreen);