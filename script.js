/* ========================================================
   可自行調整的設定區
   ======================================================== */
const CONFIG = {
  gameSeconds: 60,
  holeCount: 9,
  baseUpTime: 900,
  baseSpawnGap: 850,
  speedStepScore: 5,
  speedFactorPerStep: 0.90,
  targetTypes: [
    { id: 'plus1', points: 1, emoji: '🐹', image: 'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Hamster/3D/hamster_3d.png', weight: 45, badge: '+1' },
    { id: 'plus2', points: 2, emoji: '🐰', image: 'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Rabbit/3D/rabbit_3d.png', weight: 15, badge: '+2' },
    { id: 'minus1', points: -1, emoji: '🦔', image: 'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Hedgehog/3D/hedgehog_3d.png', weight: 25, badge: '-1' },
    { id: 'minus2', points: -2, emoji: '💣', image: 'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Bomb/3D/bomb_3d.png', weight: 15, badge: '-2' },
  ]
};

/* ======================================================== */

const stageRoot = document.getElementById('stageRoot');
const board = document.getElementById('board');
const legend = document.getElementById('legend');
const footlights = document.getElementById('footlights');
const scoreVal = document.getElementById('scoreVal');
const timeVal = document.getElementById('timeVal');
const speedVal = document.getElementById('speedVal');
const startBtn = document.getElementById('startBtn');
const overlay = document.getElementById('overlay');
const finalScore = document.getElementById('finalScore');
const hitStats = document.getElementById('hitStats');
const playAgainBtn = document.getElementById('playAgainBtn');
const hammer = document.getElementById('hammer');
const settingsBtn = document.getElementById('settingsBtn');
const settingsOverlay = document.getElementById('settingsOverlay');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');
const applyImgBtn = document.getElementById('applyImgBtn');
const resetImgBtn = document.getElementById('resetImgBtn');
const durationInput = document.getElementById('durationInput');
const applyDurationBtn = document.getElementById('applyDurationBtn');
const debugToggleBtn = document.getElementById('debugToggleBtn');
const imgInputs = {
  plus1: document.getElementById('plus1ImgUrl'),
  plus2: document.getElementById('plus2ImgUrl'),
  minus1: document.getElementById('minus1ImgUrl'),
  minus2: document.getElementById('minus2ImgUrl'),
};

const DEBUG_PASSWORD = 'gboyfenix';
let debugMode = false;

let holes = [];
let score = 0;
let timeLeft = CONFIG.gameSeconds;
let running = false;
let timerId = null;
let spawnTimeoutId = null;
let hitCounts = {};

function resetHitCounts() {
  hitCounts = {};
  CONFIG.targetTypes.forEach(t => hitCounts[t.id] = 0);
}
resetHitCounts();

function typeById(id) { return CONFIG.targetTypes.find(t => t.id === id); }

function buildLegend() {
  legend.innerHTML = '';
  CONFIG.targetTypes.forEach(t => {
    const item = document.createElement('div');
    item.className = 'legend-item ' + t.id;
    const icon = document.createElement('div');
    icon.className = 'icon';
    icon.innerHTML = t.image
      ? `<img src="${t.image}" alt="" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"><span class="emoji-fallback" style="display:none;">${t.emoji}</span>`
      : t.emoji;
    const val = document.createElement('span');
    val.className = 'val';
    val.textContent = t.badge;
    item.appendChild(icon);
    item.appendChild(val);
    legend.appendChild(item);
  });
}
buildLegend();

function buildFootlights() {
  footlights.innerHTML = '';
  for (let i = 0; i < 14; i++) {
    footlights.appendChild(document.createElement('span'));
  }
}
buildFootlights();

function buildBoard() {
  board.querySelectorAll('.hole').forEach(h => h.remove());
  holes = [];
  for (let i = 0; i < CONFIG.holeCount; i++) {
    const hole = document.createElement('div');
    hole.className = 'hole';
    hole.dataset.type = 'plus1';
    const target = document.createElement('div');
    target.className = 'target';
    renderTarget(target, CONFIG.targetTypes[0]);
    hole.appendChild(target);
    hole.addEventListener('pointerdown', (e) => onHit(hole, e));
    board.insertBefore(hole, footlights);
    holes.push({ el: hole, target, up: false, timeoutId: null });
  }
  requestAnimationFrame(fitToScreen);
}
buildBoard();

function renderTarget(target, type) {
  target.innerHTML = type.image
    ? `<img src="${type.image}" alt="" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"><span class="emoji-fallback" style="display:none;">${type.emoji}</span>`
    : type.emoji;
}

function pickType() {
  const total = CONFIG.targetTypes.reduce((s, t) => s + t.weight, 0);
  let r = Math.random() * total;
  for (const t of CONFIG.targetTypes) {
    if (r < t.weight) return t;
    r -= t.weight;
  }
  return CONFIG.targetTypes[0];
}

function currentTimings() {
  const level = Math.floor(score / CONFIG.speedStepScore);
  const factor = Math.pow(CONFIG.speedFactorPerStep, level);
  const upTime = Math.max(320, CONFIG.baseUpTime * factor);
  const gap = Math.max(220, CONFIG.baseSpawnGap * factor);
  speedVal.textContent = 'x' + (1 / factor).toFixed(1);
  return { upTime, gap };
}

function popScore(hole, delta) {
  const rect = hole.getBoundingClientRect();
  const p = document.createElement('div');
  p.className = 'popup ' + (delta > 0 ? 'good' : 'bad');
  p.textContent = (delta > 0 ? '+' : '') + delta;
  p.style.left = (rect.left + rect.width / 2 - 12) + 'px';
  p.style.top = (rect.top) + 'px';
  document.body.appendChild(p);
  setTimeout(() => p.remove(), 700);
}

const HAMMER_IMAGE = 'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Hammer/3D/hammer_3d.png';

function spawnHammerStrike(x, y) {
  const s = document.createElement('div');
  s.className = 'hammer-strike';
  s.innerHTML = `<img src="${HAMMER_IMAGE}" alt="" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';"><span class="emoji-fallback-hammer">🔨</span>`;
  s.style.left = x + 'px';
  s.style.top = y + 'px';
  document.body.appendChild(s);
  setTimeout(() => s.remove(), 320);
}

function onHit(hole, e) {
  if (!running) return;
  const h = holes.find(x => x.el === hole);
  if (!h || !h.up) return;
  if (h.el.classList.contains('hit') || h.el.classList.contains('miss')) return;

  const type = typeById(hole.dataset.type);
  h.up = false;
  clearTimeout(h.timeoutId);

  const rectFallback = hole.getBoundingClientRect();
  const cx = e && typeof e.clientX === 'number' ? e.clientX : (rectFallback.left + rectFallback.width / 2);
  const cy = e && typeof e.clientY === 'number' ? e.clientY : (rectFallback.top + rectFallback.height / 2);
  spawnHammerStrike(cx, cy);

  hole.classList.remove('up');
  hole.classList.add(type.points > 0 ? 'hit' : 'miss');
  score = Math.max(0, score + type.points);

  hitCounts[type.id] = (hitCounts[type.id] || 0) + 1;

  popScore(hole, type.points);

  scoreVal.textContent = score;
  scoreVal.style.transform = 'scale(1.3)';
  setTimeout(() => scoreVal.style.transform = 'scale(1)', 150);

  setTimeout(() => { hole.classList.remove('hit', 'miss', 'up'); }, 320);
}

function popUp() {
  if (!running) return;
  const idlePool = holes.filter(h => !h.up);
  if (idlePool.length === 0) { scheduleNext(); return; }
  const h = idlePool[Math.floor(Math.random() * idlePool.length)];
  const type = pickType();
  h.el.dataset.type = type.id;
  renderTarget(h.target, type);
  h.up = true;
  h.el.classList.add('up');

  const { upTime } = currentTimings();
  h.timeoutId = setTimeout(() => {
    if (h.up) { h.up = false; h.el.classList.remove('up'); }
  }, upTime);

  scheduleNext();
}

function scheduleNext() {
  if (!running) return;
  const { gap } = currentTimings();
  spawnTimeoutId = setTimeout(popUp, gap * (0.6 + Math.random() * 0.8));
}

function renderHitStats(){
  hitStats.innerHTML = '';
  CONFIG.targetTypes.forEach(t=>{
    const item = document.createElement('div');
    item.className = 'hitStat ' + t.id;
    const icon = document.createElement('div');
    icon.className = 'icon';
    icon.innerHTML = t.image
      ? `<img src="${t.image}" alt="" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"><span class="emoji-fallback" style="display:none;">${t.emoji}</span>`
      : t.emoji;
    const count = document.createElement('span');
    count.className = 'count';
    count.textContent = (hitCounts[t.id] || 0) + ' 次';
    item.appendChild(icon);
    item.appendChild(count);
    hitStats.appendChild(item);
  });
}

function startGame() {
  score = 0;
  timeLeft = CONFIG.gameSeconds;
  running = true;
  resetHitCounts();
  scoreVal.textContent = 0;
  timeVal.textContent = timeLeft;
  speedVal.textContent = 'x1.0';
  overlay.classList.add('hidden');
  startBtn.textContent = '表演中…';
  startBtn.disabled = true;
  holes.forEach(h => {
    h.up = false;
    h.el.classList.remove('up', 'hit', 'miss');
    clearTimeout(h.timeoutId);
  });

  clearInterval(timerId);
  clearTimeout(spawnTimeoutId);

  timerId = setInterval(() => {
    timeLeft -= 1;
    timeVal.textContent = timeLeft;
    if (timeLeft <= 0) { endGame(); }
  }, 1000);

  popUp();
}

function endGame() {
  running = false;
  clearInterval(timerId);
  clearTimeout(spawnTimeoutId);
  holes.forEach(h => {
    clearTimeout(h.timeoutId);
    h.up = false;
    h.el.classList.remove('up');
  });
  finalScore.textContent = score;
  renderHitStats();
  overlay.classList.remove('hidden');
  startBtn.textContent = '開始表演';
  startBtn.disabled = false;
}

function resetToIdle() {
  running = false;
  clearInterval(timerId);
  clearTimeout(spawnTimeoutId);
  score = 0;
  timeLeft = CONFIG.gameSeconds;
  scoreVal.textContent = 0;
  timeVal.textContent = timeLeft;
  speedVal.textContent = 'x1.0';
  holes.forEach(h => {
    h.up = false;
    h.el.classList.remove('up', 'hit', 'miss');
    clearTimeout(h.timeoutId);
  });
  overlay.classList.add('hidden');
  startBtn.textContent = '開始表演';
  startBtn.disabled = false;
}

startBtn.addEventListener('click', startGame);
playAgainBtn.addEventListener('click', resetToIdle);

/* 偵測是否為滑鼠(hover)裝置，決定是否顯示跟隨槌子 */
if (window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
  document.body.classList.add('has-hover');
}
window.addEventListener('pointermove', (e) => {
  hammer.style.left = e.clientX + 'px';
  hammer.style.top = e.clientY + 'px';
});
window.addEventListener('pointerdown', () => { hammer.classList.add('swing'); });
window.addEventListener('pointerup', () => { hammer.classList.remove('swing'); });

/* 槌子大小同步為洞口的一半 */
function syncHammerSize() {
  const holeEl = holes[0] && holes[0].el;
  if (!holeEl) return;
  const w = holeEl.getBoundingClientRect().width;
  if (w <= 0) return;
  const size = Math.max(30, Math.round(w / 2));
  document.documentElement.style.setProperty('--hammer-size', size + 'px');
}

/* ===== 整個畫面依螢幕大小等比例縮放,置中顯示,完全不需捲動 ===== */
function fitToScreen() {
  stageRoot.style.transform = 'translate(0,0) scale(1)';
  const refW = stageRoot.getBoundingClientRect().width;
  const refH = stageRoot.getBoundingClientRect().height;
  if (refW === 0 || refH === 0) return;

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const margin = 0.96;
  const scale = Math.min(vw / refW, vh / refH) * margin;

  const left = (vw - refW * scale) / 2;
  const top = (vh - refH * scale) / 2;
  stageRoot.style.transform = `translate(${left}px, ${top}px) scale(${scale})`;

  syncHammerSize();
}

let resizeTimer = null;
function scheduleFit() {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(fitToScreen, 80);
}
window.addEventListener('resize', scheduleFit);
window.addEventListener('orientationchange', scheduleFit);
window.addEventListener('load', fitToScreen);
requestAnimationFrame(fitToScreen);
setTimeout(fitToScreen, 300); // 字型載入後再校正一次

/* debug 模式切換：輸入密碼正確才會開啟/關閉，自訂圖片按鈕僅在 debug 模式下顯示 */
debugToggleBtn.addEventListener('click', ()=>{
  if(debugMode){
    debugMode = false;
    document.body.classList.remove('debug-mode');
    settingsOverlay.classList.add('hidden');
    return;
  }
  const input = window.prompt('請輸入 debug 模式密碼：');
  if(input === null) return;
  if(input === DEBUG_PASSWORD){
    debugMode = true;
    document.body.classList.add('debug-mode');
  } else {
    window.alert('密碼錯誤');
  }
});

/* Debug 設定彈出視窗 */
settingsBtn.addEventListener('click', () => {
  imgInputs.plus1.value = typeById('plus1').image;
  imgInputs.plus2.value = typeById('plus2').image;
  imgInputs.minus1.value = typeById('minus1').image;
  imgInputs.minus2.value = typeById('minus2').image;
  durationInput.value = CONFIG.gameSeconds;
  settingsOverlay.classList.remove('hidden');
});
closeSettingsBtn.addEventListener('click', () => {
  settingsOverlay.classList.add('hidden');
});
applyImgBtn.addEventListener('click', () => {
  typeById('plus1').image = imgInputs.plus1.value.trim();
  typeById('plus2').image = imgInputs.plus2.value.trim();
  typeById('minus1').image = imgInputs.minus1.value.trim();
  typeById('minus2').image = imgInputs.minus2.value.trim();
  buildLegend();
});
resetImgBtn.addEventListener('click', () => {
  CONFIG.targetTypes.forEach(t => t.image = '');
  Object.values(imgInputs).forEach(inp => inp.value = '');
  buildLegend();
});
applyDurationBtn.addEventListener('click', ()=>{
  const val = parseInt(durationInput.value, 10);
  if(!Number.isFinite(val) || val < 5 || val > 600){
    window.alert('請輸入 5～600 之間的整數秒數');
    return;
  }
  CONFIG.gameSeconds = val;
  if(!running){
    timeLeft = CONFIG.gameSeconds;
    timeVal.textContent = timeLeft;
  }
  window.alert('遊戲時間已設定為 ' + val + ' 秒，切換回一般模式後也會套用這個時間唷！');
});

/* 演唱會場景裝飾：星光與五彩紙屑 */
(function makeStageDecor() {
  const stage = document.getElementById('stageBg');
  const sparklePositions = [
    { top: '8%', left: '20%' }, { top: '5%', left: '70%' }, { top: '12%', left: '45%' },
    { top: '20%', left: '85%' }, { top: '16%', left: '10%' }
  ];
  sparklePositions.forEach((p, i) => {
    const el = document.createElement('div');
    el.className = 'sparkle';
    el.textContent = '✦';
    el.style.top = p.top;
    el.style.left = p.left;
    el.style.animationDelay = (i * 0.3) + 's';
    stage.appendChild(el);
  });

  const colors = ['#ff4fd8', '#4ff0ff', '#ffe066', '#8bff8b', '#c99bff'];
  for (let i = 0; i < 18; i++) {
    const c = document.createElement('div');
    c.className = 'confetti';
    c.style.left = Math.random() * 100 + '%';
    c.style.background = colors[i % colors.length];
    c.style.animationDuration = (5 + Math.random() * 5) + 's';
    c.style.animationDelay = (Math.random() * 6) + 's';
    c.style.transform = `scale(${0.6 + Math.random() * 0.7})`;
    stage.appendChild(c);
  }
})();
