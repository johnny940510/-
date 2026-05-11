let state = { stage: 1, score: 0, count: 0, hp: 100, isSquatting: false };

const pose = new Pose({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
});

pose.setOptions({ modelComplexity: 1, smoothLandmarks: true, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });

pose.onResults((results) => {
    const canvas = document.getElementById('output_canvas');
    const ctx = canvas.getContext('2d');
    const hint = document.getElementById('hint-display');
    
    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    if (results.poseLandmarks) {
        drawConnectors(ctx, results.poseLandmarks, POSE_CONNECTIONS, {color: '#4ade80', lineWidth: 2});
        
        const hip = results.poseLandmarks[23];
        const knee = results.poseLandmarks[25];
        const ankle = results.poseLandmarks[27];
        const angle = calculateAngle(hip, knee, ankle);

        if (angle < 115 && !state.isSquatting) {
            state.isSquatting = true;
            hint.innerText = "⬇️ 蹲下了！站起來攻擊！";
            document.getElementById('player').style.transform = "scaleY(0.7)";
        } else if (angle > 155 && state.isSquatting) {
            state.isSquatting = false;
            hint.innerText = "✅ 擊中！";
            document.getElementById('player').style.transform = "scaleY(1)";
            processAttack();
        }
    } else {
        hint.innerText = "❌ 找不到人體，請站遠一點";
    }
    ctx.restore();
});

function processAttack() {
    state.count++; state.score += 100; state.hp -= 20;
    const monster = document.getElementById('monster');
    const dmg = document.getElementById('dmg-text');
    
    monster.style.transform = "translateX(20px) rotate(10deg)";
    setTimeout(() => monster.style.transform = "translateX(0)", 100);
    dmg.classList.add('hit-anim');
    setTimeout(() => dmg.classList.remove('hit-anim'), 600);

    if (state.hp <= 0) {
        state.hp = 100; state.stage++;
        alert("STAGE CLEAR!");
    }
    updateUI();
}

function updateUI() {
    document.getElementById('ui-stage').innerText = state.stage;
    document.getElementById('ui-score').innerText = state.score;
    document.getElementById('ui-count').innerText = state.count;
    document.getElementById('hp-fill').style.width = state.hp + "%";
    document.getElementById('hp-label').innerText = `BOSS HP: ${state.hp}/100`;
}

function calculateAngle(A, B, C) {
    let radians = Math.atan2(C.y - B.y, C.x - B.x) - Math.atan2(A.y - B.y, A.x - B.x);
    let angle = Math.abs(radians * 180.0 / Math.PI);
    if (angle > 180.0) angle = 360 - angle;
    return angle;
}

document.getElementById('start-btn').onclick = function() {
    document.getElementById('start-screen').classList.remove('active');
    document.getElementById('game-screen').classList.add('active');
    const video = document.getElementById('webcam');
    const camera = new Camera(video, {
        onFrame: async () => { await pose.send({image: video}); },
        width: 640, height: 480
    });
    camera.start();
};