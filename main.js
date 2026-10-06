// ==================== 0. Firebase 初始化 ====================
// 請替換為你專案的真實 Config 設定
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "excercise-278da.firebaseapp.com",
  projectId: "excercise-278da",
  storageBucket: "excercise-278da.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// 初始化 Firebase & Firestore
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore();

// ==================== 1. 全域資料與初始化 ====================
const defaultData = {
  name: "勇者", coins: 1000, stage: 1, score: 0, energy: 0, combo: 0, squat: 0,
  roleLevel: 1, roleAttack: 10, dailyDay: 1, lastClaim: "", walkDistance: 0.0,
  shop: [
    { id: "weapon_1", name: "鏽鐵短劍", icon: "🗡️", level: 1, baseStat: 3, cost: 100, desc: "新手必備基礎短劍" },
    { id: "weapon_2", name: "王者之劍", icon: "⚔️", level: 0, baseStat: 8, cost: 250, desc: "大幅強化揮斬威力" },
    { id: "weapon_3", name: "龍牙巨劍", icon: "🐉", level: 0, baseStat: 18, cost: 600, desc: "龍骨打造終極利刃" },
    { id: "shield_1", name: "木製圓盾", icon: "🪵", level: 0, baseStat: 2, cost: 120, desc: "稍微提升防禦力" },
    { id: "shield_2", name: "聖光光盾", icon: "🛡️", level: 0, baseStat: 6, cost: 400, desc: "獲得額外代幣加成" },
    { id: "boots_1", name: "皮製長靴", icon: "🥾", level: 0, baseStat: 2, cost: 150, desc: "優化走路收益" }
  ],
  pets: [
    { id: 1, name: "光靈幼獸", icon: "🐾", rarity: "稀有", level: 1, attack: 12, owned: true, active: true },
    { id: 2, name: "焰火狐", icon: "🔥", rarity: "史詩", level: 1, attack: 25, owned: false, active: false },
    { id: 3, name: "星辰貓", icon: "🌙", rarity: "傳說", level: 1, attack: 45, owned: false, active: false }
  ]
};

let data = JSON.parse(JSON.stringify(defaultData));
let bossHp = 100, maxBossHp = 100, currentBattleStage = 1;
let squatState = "up", lastAttackTime = 0, lastPosition = null, isSettling = false;
let globalPose = null, globalCamera = null, isCameraRunning = false;
let smoothedLandmarks = null;
const SMOOTHING_ALPHA = 0.25; // EMA 平滑濾波

const MIN_SPEED_KMH = 3.0, MAX_SPEED_KMH = 15.0;
const screens = ["loginScreen", "lobbyScreen", "mapScreen", "petScreen", "roleScreen", "gachaScreen", "dailyScreen", "gameScreen"];

window.addEventListener("DOMContentLoaded", () => {
  const startBtn = document.getElementById("startBtn");
  if (startBtn) startBtn.addEventListener("click", startGame);

  const nameInput = document.getElementById("nameInput");
  if (nameInput) nameInput.addEventListener("keydown", (e) => { if (e.key === "Enter") startGame(); });

  refreshTop();
});

// 本地存檔 + 自動同步 Firebase 雲端資料庫
async function save() { 
  localStorage.setItem("squatRPG", JSON.stringify(data)); 
  refreshTop(); 

  // 當使用者有設定玩家名稱時，上傳進度至 Firestore (以角色名稱作為 Document ID)
  if (data.name && data.name !== "勇者") {
    try {
      await db.collection("players").doc(data.name).set(data, { merge: true });
      console.log("☁ Firebase 雲端存檔同步成功！");
    } catch (err) {
      console.error("☁ Firebase 存檔失敗：", err);
    }
  }
}

// 載入雲端進度 (當登入名稱時觸發，僅當記錄存在時才覆蓋資料)
async function loadCloudData(playerName) {
  try {
    const doc = await db.collection("players").doc(playerName).get();
    if (doc.exists) {
      data = doc.data();
      localStorage.setItem("squatRPG", JSON.stringify(data));
      console.log("☁ 已成功載入 Firebase 雲端進度！");
    } else {
      console.log("🆕 偵測到新勇者，使用初始預設值（硬幣 1000）！");
    }
    refreshTop();
  } catch (err) {
    console.error("☁ 讀取雲端進度失敗：", err);
  }
}

function showScreen(id) {
  screens.forEach(s => { const el = document.getElementById(s); if(el) el.classList.remove("active"); });
  const target = document.getElementById(id); if(target) target.classList.add("active");
  refreshTop();
}

async function startGame() {
  const nameInput = document.getElementById("nameInput");
  const name = nameInput ? nameInput.value.trim() : "";
  if (name === "") { alert("請先輸入勇者名稱"); return; }
  
  // 1. 每次輸入名字，先還原成乾淨的預設資料 (初始硬幣 1000)
  data = JSON.parse(JSON.stringify(defaultData));
  data.name = name;

  // 2. 若雲端/資料庫存在該名字的紀錄，則讀取並覆蓋
  await loadCloudData(name);

  // 3. 儲存最新狀態並進入大廳
  save();
  
  showScreen("lobbyScreen");
  initMobileGps();
}

function refreshTop() {
  if (document.getElementById("lobbyName")) document.getElementById("lobbyName").textContent = data.name;
  if (document.getElementById("coinText")) document.getElementById("coinText").textContent = "🪙 " + data.coins;
  if (document.getElementById("playerLevelText")) document.getElementById("playerLevelText").textContent = "LV." + data.roleLevel + " 聖殿騎士";
  if (document.getElementById("lobbyWalkDist")) document.getElementById("lobbyWalkDist").textContent = Number(data.walkDistance || 0).toFixed(2);

  const mainWeapon = data.shop ? data.shop.find(i => i.id.startsWith("weapon") && i.level > 0) : null;
  if (document.getElementById("battleWeaponText") && mainWeapon) {
    document.getElementById("battleWeaponText").textContent = `裝備: ${mainWeapon.name} Lv.${mainWeapon.level}`;
  }
}

// ==================== 2. GPS 遠征邏輯 ====================
function initMobileGps() {
  if (!navigator.geolocation) return;
  navigator.geolocation.watchPosition((position) => {
    const coords = position.coords; const speedMps = coords.speed;
    let currentSpeedKmh = (speedMps !== null && speedMps >= 0) ? speedMps * 3.6 : 0;

    if ((speedMps === null || currentSpeedKmh === 0) && lastPosition) {
      const dMeters = calcDistanceMeters(lastPosition.latitude, lastPosition.longitude, coords.latitude, coords.longitude);
      currentSpeedKmh = dMeters * 3.6;
    }

    if (document.getElementById("lobbyWalkSpeed")) document.getElementById("lobbyWalkSpeed").textContent = currentSpeedKmh.toFixed(1);
    const msgEl = document.getElementById("lobbyWalkMsg");

    if (currentSpeedKmh < MIN_SPEED_KMH) {
      if(msgEl) { msgEl.textContent = "💤 原地休憩中 (低於 3km/h 不計距離)"; msgEl.className = "walk-msg"; }
      lastPosition = coords; return;
    }
    if (currentSpeedKmh > MAX_SPEED_KMH) {
      if(msgEl) { msgEl.textContent = "⚠ 速度過快！遠征暫停計算"; msgEl.className = "walk-msg warn"; }
      lastPosition = coords; return;
    }

    if (lastPosition) {
      const distMeters = calcDistanceMeters(lastPosition.latitude, lastPosition.longitude, coords.latitude, coords.longitude);
      if (distMeters > 2 && distMeters < 100) {
        data.walkDistance = (data.walkDistance || 0) + (distMeters / 1000);
        data.coins += Math.floor(distMeters / 10) * 5; 
        save();
      }
    }
    if(msgEl) { msgEl.textContent = "🟢 聖騎士全速行軍中！"; msgEl.className = "walk-msg ok"; }
    lastPosition = coords;
  }, null, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
}

function calcDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371e3; const φ1 = lat1 * Math.PI / 180; const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180; const Δλ = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ/2) * Math.sin(Δλ/2);
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
}

// ==================== 3. 鐵匠鋪裝備 ====================
function openRole() {
  const titleEl = document.getElementById("roleTitle");
  const descEl = document.getElementById("roleDesc");
  if(titleEl) titleEl.textContent = "殿堂騎士階級 Lv." + data.roleLevel;
  if(descEl) descEl.textContent = "基礎攻擊力：" + data.roleAttack;
  renderShop(); 
  showScreen("roleScreen");
}

function upgradeRole() {
  const cost = data.roleLevel * 300; 
  if (data.coins < cost) { alert("健身幣不足！"); return; }
  data.coins -= cost; data.roleLevel++; data.roleAttack += 6; 
  save(); openRole();
}

function renderShop() {
  const box = document.getElementById("shopItems"); if(!box) return; box.innerHTML = "";
  data.shop.forEach(item => {
    const card = document.createElement("div"); card.className = "shop-item-card";
    card.innerHTML = `
      <div>
        <strong>${item.icon} ${item.name} <span style="color:#eab308">Lv.${item.level}</span></strong>
        <div style="font-size:0.8rem; color:#aaa;">${item.desc} (+${item.level * item.baseStat})</div>
      </div>
      <button class="small-btn" onclick="buyShopItem('${item.id}')">鍛造 (${item.cost}🪙)</button>
    `;
    box.appendChild(card);
  });
}

function buyShopItem(id) {
  const item = data.shop.find(i => i.id === id); 
  if (!item) return;
  if (data.coins < item.cost) { alert("健身幣餘額不足！"); return; }
  data.coins -= item.cost; item.level++; item.cost = Math.floor(item.cost * 1.6); 
  save(); renderShop();
}

// ==================== 4. 戰寵與抽卡 ====================
function activePet() { 
  if(!data.pets || data.pets.length === 0) return defaultData.pets[0]; 
  return data.pets.find(p => p.active && p.owned) || data.pets[0]; 
}

function openPets() {
  const box = document.getElementById("petList"); if(!box) return; box.innerHTML = "";
  data.pets.forEach(p => {
    const div = document.createElement("div"); div.className = "feature-card";
    div.innerHTML = `
      <div>
        <strong>${p.icon} ${p.name} <span style="font-size:0.8rem; color:#38bdf8;">[${p.rarity}]</span></strong>
        <div style="font-size:0.8rem; color:#aaa;">Lv.${p.level} | 攻擊力: +${p.attack} (${p.owned ? '✅已解鎖' : '🔒未解鎖'})</div>
      </div>
      <button class="small-btn" onclick="setPet(${p.id})">${p.active ? '⚔️出擊中' : '配置'}</button>
    `;
    box.appendChild(div);
  });
  showScreen("petScreen");
}

function setPet(id) {
  const pet = data.pets.find(p => p.id === id); 
  if (!pet || !pet.owned) { alert("尚未解鎖此戰寵！"); return; }
  data.pets.forEach(p => p.active = false); 
  pet.active = true; 
  save(); openPets();
}

function openGacha() { 
  const resultEl = document.getElementById("gachaResult");
  if(resultEl) resultEl.textContent = ""; 
  showScreen("gachaScreen"); 
}

function drawGacha() {
  if (data.coins < 300) { alert("健身幣不足！"); return; }
  data.coins -= 300;
  const pet = data.pets[Math.floor(Math.random() * data.pets.length)];
  pet.owned = true;
  const resultEl = document.getElementById("gachaResult");
  if(resultEl) resultEl.innerHTML = `🔮 獲得：${pet.icon} 【${pet.name}】(${pet.rarity})`; 
  save();
}

// ==================== 5. 地圖與每日簽到 ====================
function openMap() { renderMap(); showScreen("mapScreen"); }

function renderMap() {
  const box = document.getElementById("mapNodes"); if(!box) return; box.innerHTML = "";
  for (let i = 1; i <= 10; i++) {
    const btn = document.createElement("button");
    btn.textContent = `Stage ${i} ${i <= data.stage ? '🔓' : '🔒'}`;
    btn.onclick = () => { if (i <= data.stage) startBattle(i); };
    box.appendChild(btn);
  }
}

function openDaily() {
  const box = document.getElementById("dailyList"); if(!box) return; box.innerHTML = "";
  for(let i=0; i<7; i++) {
    box.innerHTML += `<div class="feature-card"><span>第 ${i + 1} 天簽到</span><strong>🪙 ${(i+1)*120}</strong></div>`;
  }
  showScreen("dailyScreen");
}

function claimDaily() {
  const dStr = new Date().toISOString().slice(0, 10);
  if (data.lastClaim === dStr) { alert("今日已簽到領取過囉！"); return; }
  data.coins += (data.dailyDay * 120);
  data.dailyDay = data.dailyDay === 7 ? 1 : data.dailyDay + 1;
  data.lastClaim = dStr; 
  save(); openDaily();
}

// ==================== 6. MediaPipe 體感 AI (EMA 防抖動) ====================
async function startCameraAndPose() {
  const video = document.getElementById("webcam"); 
  const canvas = document.getElementById("canvas");
  if (!video || !canvas) return;

  const ctx = canvas.getContext("2d"); 
  const statusText = document.getElementById("cameraStatus");

  if (!globalPose) {
    globalPose = new Pose({ locateFile: (file) => "https://cdn.jsdelivr.net/npm/@mediapipe/pose/" + file });
    globalPose.setOptions({ modelComplexity: 1, smoothLandmarks: true, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
    globalPose.onResults((results) => {
      canvas.width = video.videoWidth || 480; canvas.height = video.videoHeight || 640; 
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (results.poseLandmarks) {
        const filtered = applyEmaSmoothing(results.poseLandmarks);
        drawConnectors(ctx, filtered, POSE_CONNECTIONS, { color: "#38bdf8", lineWidth: 3 });
        drawLandmarks(ctx, filtered, { color: "#ca8a04", lineWidth: 1.5 });
        checkLiveSquat(filtered);
      }
    });
  }

  if (!globalCamera) {
    globalCamera = new Camera(video, { onFrame: async () => { if(globalPose) await globalPose.send({ image: video }); }, width: 480, height: 640 });
  }

  if (!isCameraRunning) {
    try {
      if(statusText) statusText.textContent = "📷 啟動聖光鏡頭...";
      await globalCamera.start(); 
      isCameraRunning = true;
      if(statusText) statusText.textContent = "🛡️ 領主血條";
    } catch (err) { 
      console.error(err); 
      if(statusText) statusText.textContent = "⚠️ 鏡頭啟動失敗";
    }
  }
}

function applyEmaSmoothing(raw) {
  if (!smoothedLandmarks || smoothedLandmarks.length !== raw.length) {
    smoothedLandmarks = raw.map(lm => ({ x: lm.x, y: lm.y, z: lm.z, visibility: lm.visibility }));
    return smoothedLandmarks;
  }
  for (let i = 0; i < raw.length; i++) {
    smoothedLandmarks[i].x += SMOOTHING_ALPHA * (raw[i].x - smoothedLandmarks[i].x);
    smoothedLandmarks[i].y += SMOOTHING_ALPHA * (raw[i].y - smoothedLandmarks[i].y);
    smoothedLandmarks[i].z += SMOOTHING_ALPHA * (raw[i].z - smoothedLandmarks[i].z);
    smoothedLandmarks[i].visibility = raw[i].visibility;
  }
  return smoothedLandmarks;
}

function checkLiveSquat(lm) {
  const lh = lm[23], lk = lm[25], la = lm[27], rh = lm[24], rk = lm[26], ra = lm[28];
  if (!lh || !lk || !la || !rh || !rk || !ra) return;
  if (lk.visibility < 0.5 || la.visibility < 0.5 || rk.visibility < 0.5 || ra.visibility < 0.5) return;

  const minAngle = Math.min(calcAngle(lh, lk, la), calcAngle(rh, rk, ra));
  const debugEl = document.getElementById("debug");
  if(debugEl) debugEl.textContent = `膝蓋角度：${Math.round(minAngle)}° (${squatState === 'up' ? '站立' : '深蹲中'})`;

  if (squatState === "up" && minAngle < 125) squatState = "down";
  if (squatState === "down" && minAngle > 160) {
    const now = Date.now();
    if (now - lastAttackTime > 800) { onSquatSuccess(); lastAttackTime = now; }
    squatState = "up";
  }
}

function calcAngle(a, b, c) {
  const ab = { x: a.x - b.x, y: a.y - b.y }, cb = { x: c.x - b.x, y: c.y - b.y };
  const dot = ab.x * cb.x + ab.y * cb.y;
  const len = Math.sqrt(ab.x**2 + ab.y**2) * Math.sqrt(cb.x**2 + cb.y**2);
  return len === 0 ? 180 : Math.acos(Math.min(1, Math.max(-1, dot / len))) * 180 / Math.PI;
}

// ==================== 7. 戰鬥核心 ====================
function startBattle(stageNum) {
  isSettling = false; currentBattleStage = parseInt(stageNum);
  maxBossHp = 80 + currentBattleStage * 20; bossHp = maxBossHp;

  const stageEl = document.getElementById("stageText");
  if(stageEl) stageEl.textContent = "地城 STAGE " + currentBattleStage;
  
  const pet = activePet();
  if (document.getElementById("battlePetLabel")) {
    document.getElementById("battlePetLabel").textContent = `${pet.icon} ${pet.name}`;
  }

  updateBattleUI();
  showScreen("gameScreen");
  startCameraAndPose();
}

function onSquatSuccess() {
  if (isSettling) return;
  const pet = activePet();
  let shopBonus = 0;
  if(data.shop) data.shop.forEach(i => { shopBonus += (i.level * i.baseStat); });

  const dmg = data.roleAttack + pet.attack + shopBonus;
  bossHp = Math.max(0, bossHp - dmg);

  data.combo++; data.coins += 6;
  const floatEl = document.getElementById("floatingText");
  if(floatEl) floatEl.textContent = `⚔️ -${dmg}`;
  
  updateBattleUI(); 
  save();

  if (bossHp <= 0) {
    isSettling = true;
    setTimeout(() => {
      alert(`🎉 擊殺 STAGE ${currentBattleStage} 怪物！`);
      if (currentBattleStage === data.stage) data.stage++;
      data.combo = 0; 
      save(); 
      showScreen("mapScreen");
    }, 300);
  }
}

function updateBattleUI() {
  const hpText = document.getElementById("hpText");
  const hpFill = document.getElementById("hpFill");
  const combo = document.getElementById("combo");

  if(hpText) hpText.textContent = `${bossHp} / ${maxBossHp}`;
  if(hpFill) hpFill.style.width = `${(bossHp / maxBossHp) * 100}%`;
  if(combo) combo.textContent = `COMBO x${data.combo}`;
}
