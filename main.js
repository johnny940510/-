import { PoseLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";

// 取得所有必要的元素
const startBtn = document.getElementById("start-btn");
const video = document.getElementById("video");
const statusText = document.getElementById("status");

let poseLandmarker;
let lastVideoTime = -1;

async function setup() {
    statusText.textContent = "載入 AI 模型中...";
    const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm");
    poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task" },
        runningMode: "VIDEO"
    });
    statusText.textContent = "模型載入完成，請開始深蹲！";
    update();
}

function update() {
    if (video.currentTime !== lastVideoTime) {
        lastVideoTime = video.currentTime;
        const results = poseLandmarker.detectForVideo(video, performance.now());
        if (results.landmarks && results.landmarks[0]) {
            const lm = results.landmarks[0];
            // 簡易角度計算邏輯
            const angle = Math.abs((Math.atan2(lm[27].y - lm[25].y, lm[27].x - lm[25].x) - Math.atan2(lm[23].y - lm[25].y, lm[23].x - lm[25].x)) * 180 / Math.PI);
            document.getElementById("knee-angle").textContent = `膝蓋角度：${Math.round(angle)}°`;
        }
    }
    requestAnimationFrame(update);
}

startBtn.addEventListener("click", async () => {
    document.getElementById("start-screen").style.display = "none";
    document.getElementById("game-screen").style.display = "block";
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    video.srcObject = stream;
    await setup();
});