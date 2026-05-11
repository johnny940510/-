import { PoseLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";

// 取得 HTML 元素
const startScreen = document.getElementById("start-screen");
const gameScreen = document.getElementById("game-screen");
const resultScreen = document.getElementById("result-screen");
const startBtn = document.getElementById("start-btn");
const restartBtn = document.getElementById("restart-btn");
const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

// 數據顯示元素
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

// 遊戲邏輯變數
let poseLandmarker;
let lastVideoTime = -1;
let playerName = "玩家";
let squatCount = 0;
let monsterHp = 100;
let maxHp = 100;
let level = 1;
let score = 0;
let combo = 0;
let gameRunning = false;
let state = "stand";

const MONSTER_LIST = ["👾", "👹", "🧟", "🐲", "🦖", "👺", "🦂", "🦹", "💀", "🔥"];

async function createPoseLandmarker() {
    const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm");
    poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task" },
        runningMode: "VIDEO",
        numPoses: 1
    });
}

function calculateAngle(a, b, c) {
    const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
    let angle = Math.abs(radians * 180.0 / Math.PI);
    if (angle > 180.0) angle = 360 - angle;
    return angle;
}

function updateGame() {
    if (video.currentTime !== lastVideoTime) {
        lastVideoTime = video.currentTime;
        const results = poseLandmarker.detectForVideo(video, performance.now());
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (results.landmarks && results.landmarks[0]) {
            const lm = results.landmarks[0];
            const angle = calculateAngle(lm[23], lm[25], lm[27]); // 左髖-左膝-左踝
            kneeAngleText.textContent = `膝蓋角度：${Math.round(angle)}°`;

            if (gameRunning) {
                if (state === "stand" && angle < 105) {
                    state = "down";
                    statusText.textContent = "蹲下成功！";
                } else if (state === "down" && angle > 150) {
                    state = "stand";
                    squatCount++;
                    score += 10;
                    monsterHp -= 20;
                    squatNumText.textContent = squatCount;
                    scoreText.textContent = score;
                    hpFill.style.width = `${(monsterHp / maxHp) * 100}%`;
                    statusText.textContent = "起身，攻擊！";
                }
            }
        }
    }
    requestAnimationFrame(updateGame);
}

startBtn.addEventListener("click", async () => {
    playerName = document.getElementById("player-name").value || "英雄";
    document.getElementById("player-display-name").textContent = `玩家：${playerName}`;
    startScreen.classList.remove("active");
    gameScreen.classList.add("active");
    
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    video.srcObject = stream;
    await createPoseLandmarker();
    gameRunning = true;
    updateGame();
});