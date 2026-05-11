const state = { stage: 1, score: 0, count: 0, hp: 100, isSquatting: false };

// 1. 初始化 Pose 模型
const pose = new Pose({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
});

pose.setOptions({
    modelComplexity: 1,
    smoothLandmarks: true,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
});

// 2. 偵測回傳
pose.onResults((results) => {
    const canvas = document.getElementById('output_canvas');
    const ctx = canvas.getContext('2d');
    const hint = document.getElementById('hint-display');
    
    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    if (results.poseLandmarks) {
        // 繪製骨架連線
        drawConnectors(ctx, results.poseLandmarks, POSE_CONNECTIONS, {color: '#4ade80', lineWidth: 2});
        
        const hip = results.poseLandmarks[23];
        const knee = results.poseLandmarks[25];
        const ankle = results.poseLandmarks[27];
        
        if (hip && knee && ankle) {
            const angle = calculateAngle(hip, knee, ankle);
            hint.innerText = `準備就緒 - 膝蓋角度: ${Math.round(angle)}°`;

            if (angle < 120 && !state.isSquatting) {
                state.isSquatting = true;
                document.getElementById('player').style.transform = "scaleY(0.6)";
                hint.innerText = "⬇️ 蹲下了！站起來攻擊！";
            } else if (angle > 160 && state.isSquatting) {
                state.isSquatting = false;
                document.getElementById('player').style.transform = "scaleY(1)";
                attack();
            }
        }
    } else {
        hint.innerText = "⚠️ 找不到人體，請退後至全身入鏡";
    }
    ctx.restore();
});

function attack() {
    state.count++; state.score += 100; state.hp -= 20;
    const dmg = document.getElementById('dmg-text');
    dmg.classList.add('hit-anim');
    setTimeout(() => dmg.classList.remove('hit-anim'), 500);

    if (state.hp <= 0) { 
        state.hp = 100; state.stage++; 
        alert("恭喜擊敗 BOSS！進入第 " + state.stage + " 關");
    }
    updateUI();
}

function updateUI() {
    document.getElementById('ui-stage').innerText = state.stage;
    document.getElementById('ui-score').innerText = state.score;
    document.getElementById('ui-count').innerText = state.count;
    document.getElementById('hp-fill').style.width = state.hp + "%";
}

function calculateAngle(a, b, c) {
    const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
    let angle = Math.abs(radians * 180.0 / Math.PI);
    if (angle > 180.0) angle = 360 - angle;
    return angle;
}

// 3. 點擊按鈕啟動 (加入防呆與錯誤處理)
document.getElementById('start-btn').onclick = async function() {
    const btn = this;
    btn.disabled = true;
    btn.innerText = "啟動中...";

    try {
        const video = document.getElementById('webcam');
        
        // 切換畫面
        document.getElementById('start-screen').classList.remove('active');
        document.getElementById('game-screen').classList.add('active');

        // 啟動相機
        const camera = new Camera(video, {
            onFrame: async () => {
                await pose.send({image: video});
            },
            width: 640,
            height: 480
        });
        
        await camera.start();
        console.log("Camera started successfully");
    } catch (err) {
        console.error(err);
        alert("無法啟動遊戲：\n1. 請確保使用 HTTPS 網址\n2. 請允許相機權限\n3. 錯誤訊息：" + err.message);
        location.reload(); // 失敗就重整
    }
};