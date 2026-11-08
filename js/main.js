import { clamp, curveRaw, lerp, padScore, pick, rand } from './utils.js';
import { SoundEngine } from './audio.js';
import { Renderer } from './renderer.js';

const $ = (selector) => document.querySelector(selector);
const gameEl = $('#game');
const canvas = $('#canvas');

const view = {
  W: window.innerWidth,
  H: window.innerHeight,
  dpr: 1,
  halfW: 400,
  roadW: 800,
  playerY: 640,
  P: 13,
  A: 220,
  carW: 54,
  carH: 108,
  laneW: 160,
};

const player = {
  d: 0,
  x: 0,
  vx: 0,
  speed: 13,
  nitro: 100,
  health: 3,
  invuln: 0,
  w: 54,
  h: 108,
};

const traffic = [];
const pickups = [];
const particles = [];
const floaters = [];

const game = {
  mode: 'menu',
  time: 0,
  shake: 0,
  nitroActive: false,
  player,
  traffic,
  pickups,
  particles,
  floaters,
};

const input = {
  left: false,
  right: false,
  brake: false,
  nitro: false,
  throttle: false,
};

const TRAFFIC_CATALOG = [
  { style: 'mint', ratio: 2.02, scale: 1, speed: [19, 24] },
  { style: 'gold', ratio: 2.08, scale: 1.01, speed: [18, 23] },
  { style: 'violet', ratio: 1.97, scale: 0.98, speed: [20, 25] },
  { style: 'cream', ratio: 2.11, scale: 1.03, speed: [17, 22] },
  { style: 'van', ratio: 2.34, scale: 1.12, speed: [15, 18] },
  { style: 'rose', ratio: 2.04, scale: 1, speed: [19, 24] },
];

const LANES = [-0.4, -0.2, 0, 0.2, 0.4];
const BEST_KEY = 'sunsetRunBestV1';

let renderer;
let audio;
let score = 0;
let best = loadBest();
let nearMisses = 0;
let passedCars = 0;
let topSpeed = 0;
let combo = 0;
let comboTimer = 0;
let spawnTimer = 0.2;
let pickupTimer = 1.1;
let runTime = 0;
let nextSector = 1000;
let overTimer = null;
let wasNewBest = false;
let lastFrame = performance.now();
let hudCache = {};
let muted = false;

const ui = {
  distance: $('#distance'),
  score: $('#score'),
  speed: $('#speed'),
  speedFill: $('#speedFill'),
  nitroFill: $('#nitroFill'),
  nitroPct: $('#nitroPct'),
  armorPips: Array.from(document.querySelectorAll('#armorPips .pip')),
  combo: $('#combo'),
  comboValue: $('#comboValue'),
  comboFill: $('#comboFill'),
  callout: $('#callout'),
  startScreen: $('#startScreen'),
  gameOverScreen: $('#gameOverScreen'),
  pauseScreen: $('#pauseScreen'),
  startBtn: $('#startBtn'),
  restartBtn: $('#restartBtn'),
  menuBtn: $('#menuBtn'),
  resumeBtn: $('#resumeBtn'),
  quitBtn: $('#quitBtn'),
  pauseBtn: $('#pauseBtn'),
  soundBtn: $('#soundBtn'),
  menuBest: $('#menuBest'),
  finalScore: $('#finalScore'),
  finalDistance: $('#finalDistance'),
  finalSpeed: $('#finalSpeed'),
  finalNear: $('#finalNear'),
  newBest: $('#newBest'),
  goCopy: $('#goCopy'),
  flash: $('#flash'),
  touchControls: $('#touchControls'),
};

function loadBest() {
  try {
    const raw = localStorage.getItem(BEST_KEY);
    if (!raw) return 0;
    const value = JSON.parse(raw);
    return typeof value === 'number' ? value : Number(value?.score) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value, distance) {
  try {
    localStorage.setItem(BEST_KEY, JSON.stringify({ score: Math.floor(value), distance: Math.floor(distance) }));
  } catch {
    /* ignore */
  }
}

function setText(node, value) {
  if (node.textContent !== value) node.textContent = value;
}

function computeView() {
  const W = window.innerWidth;
  const H = window.innerHeight;
  view.W = W;
  view.H = H;
  view.dpr = Math.min(window.devicePixelRatio || 1, 2);
  view.halfW = Math.min(W * (W < 620 ? 0.425 : 0.292), 392);
  view.roadW = view.halfW * 2;
  view.playerY = clamp(H * (W < 620 ? 0.705 : 0.735), 250, H - 138);
  view.P = clamp(H / 68, 10.5, 14);
  view.A = W * 0.17;
  view.carW = clamp(W * 0.05, 37, 66);
  view.carH = view.carW * 2.02;
  view.laneW = view.roadW / 5;
}

function applyViewToCars() {
  player.w = view.carW;
  player.h = view.carH;
  const limit = view.halfW - player.w * 0.58;
  player.x = clamp(player.x, -limit, limit);
  for (const car of traffic) {
    car.w = view.carW * car.scale;
    car.h = car.w * car.ratio;
  }
}

function resize() {
  computeView();
  renderer.resize(view);
  applyViewToCars();
  updateHUD();
}

function clearInputs() {
  input.left = false;
  input.right = false;
  input.brake = false;
  input.nitro = false;
  input.throttle = false;
  document.querySelectorAll('.touch-btn.is-down').forEach((button) => button.classList.remove('is-down'));
}

function setMenuScene() {
  player.d = 0;
  player.x = view.halfW * 0.22;
  player.vx = 0;
  player.speed = 13;
  player.nitro = 100;
  player.health = 3;
  player.invuln = 0;
  traffic.length = 0;
  pickups.length = 0;
  particles.length = 0;
  floaters.length = 0;
  combo = 0;
  comboTimer = 0;
  game.time = 0;
  game.nitroActive = false;
  game.shake = 0;
  addTrafficCar(34, -0.4, 'mint', 13, 26);
  addTrafficCar(53, 0.2, 'van', 13, 52);
  addTrafficCar(72, -0.2, 'rose', 13, 81);
  addPickup(44, -0.2, 0.4);
  addPickup(49, -0.2, 1.2);
  addPickup(54, -0.2, 2.1);
  updateArmor();
}

function resetRun() {
  player.d = 0;
  player.x = 0;
  player.vx = 0;
  player.speed = 29;
  player.nitro = 100;
  player.health = 3;
  player.invuln = 0;
  traffic.length = 0;
  pickups.length = 0;
  particles.length = 0;
  floaters.length = 0;
  score = 0;
  nearMisses = 0;
  passedCars = 0;
  topSpeed = 0;
  combo = 0;
  comboTimer = 0;
  spawnTimer = 0.18;
  pickupTimer = 1.3;
  runTime = 0;
  nextSector = 1000;
  wasNewBest = false;
  game.shake = 0;
  game.nitroActive = false;
  game.time = 0;
  addTrafficCar(30, -0.4, 'mint', 20, 3);
  addTrafficCar(38, 0.2, 'gold', 19, 17);
  addTrafficCar(49, -0.2, 'violet', 21, 39);
  addTrafficCar(60, 0.4, 'van', 17, 57);
  addPickup(46, -0.2, 0.6);
  addPickup(52.5, -0.2, 1.6);
  addPickup(59, -0.2, 2.6);
  updateArmor();
  updateHUD();
}

function startRun() {
  clearTimeout(overTimer);
  overTimer = null;
  ui.startScreen.classList.add('is-hidden');
  ui.gameOverScreen.classList.add('is-hidden');
  ui.pauseScreen.classList.add('is-hidden');
  gameEl.classList.remove('is-menu', 'is-paused', 'is-over');
  clearInputs();
  resetRun();
  game.mode = 'playing';
  audio.init();
  audio.resume();
  audio.setPaused(false);
  audio.boost();
  triggerFlash();
  ui.startBtn.blur();
  lastFrame = performance.now();
}

function enterMenu() {
  clearTimeout(overTimer);
  overTimer = null;
  clearInputs();
  game.mode = 'menu';
  gameEl.classList.remove('is-paused', 'is-over');
  gameEl.classList.add('is-menu');
  ui.gameOverScreen.classList.add('is-hidden');
  ui.pauseScreen.classList.add('is-hidden');
  ui.startScreen.classList.remove('is-hidden');
  setMenuScene();
  ui.menuBest.textContent = padScore(best);
  ui.combo.classList.remove('is-active');
  audio.silenceEngine();
  lastFrame = performance.now();
}

function triggerFlash() {
  ui.flash.classList.remove('is-on');
  void ui.flash.offsetWidth;
  ui.flash.classList.add('is-on');
}

function showCallout(text, tone = '') {
  const element = ui.callout;
  element.className = 'callout';
  element.textContent = text;
  void element.offsetWidth;
  element.className = `callout is-show ${tone}`.trim();
}

function addTrafficCar(d, lane, style, speed, seed) {
  const catalog = TRAFFIC_CATALOG.find((item) => item.style === style) || TRAFFIC_CATALOG[0];
  const car = {
    d,
    lane,
    style,
    speed,
    ratio: catalog.ratio,
    scale: catalog.scale,
    w: view.carW * catalog.scale,
    h: view.carW * catalog.scale * catalog.ratio,
    scored: false,
    seed: seed ?? Math.random() * 100,
  };
  traffic.push(car);
  return car;
}

function addPickup(d, lane, phase = Math.random() * 6) {
  pickups.push({ d, lane, phase });
}

function spawnTrafficWave() {
  if (traffic.length > 11) return;
  const spawnD = player.d + (view.playerY + 75) / view.P;
  const free = LANES.filter((lane) => traffic.every((car) => car.lane !== lane || Math.abs(car.d - spawnD) > 27));
  if (!free.length) return;
  for (let i = free.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [free[i], free[j]] = [free[j], free[i]];
  }

  const count = player.d > 900 && free.length > 2 && Math.random() < 0.28 ? 2 : 1;
  for (let i = 0; i < count; i++) {
    const lane = free[i];
    const catalog = pick(TRAFFIC_CATALOG);
    const speed = rand(catalog.speed[0], catalog.speed[1]) + Math.min(5, player.d * 0.0006);
    addTrafficCar(spawnD + i * rand(4, 11) + rand(-2, 2), lane, catalog.style, speed, rand(0, 100));
  }
}

function spawnPickupWave() {
  if (pickups.length > 24) return;
  const start = player.d + (view.playerY + 50) / view.P + rand(0, 8);
  let lane = pick(LANES);
  const count = 3 + ((Math.random() * 3) | 0);
  const zigzag = Math.random() < 0.35;
  for (let i = 0; i < count; i++) {
    addPickup(start + i * 6.4, lane, rand(0, TAU));
    if (zigzag) lane = clamp(lane + (Math.random() < 0.5 ? -0.2 : 0.2), -0.4, 0.4);
  }
}

const TAU = Math.PI * 2;

function addSparks(x, y, count, colors, speed = 260, gravity = 320) {
  for (let i = 0; i < count; i++) {
    const angle = rand(0, TAU);
    const velocity = rand(speed * 0.3, speed);
    particles.push({
      type: 'spark',
      x,
      y,
      vx: Math.cos(angle) * velocity,
      vy: Math.sin(angle) * velocity,
      life: rand(0.2, 0.7),
      maxLife: 0.7,
      size: rand(1, 2.8),
      color: pick(colors),
      gravity,
      drag: 0.92,
    });
  }
}

function addSmoke(x, y, count = 6) {
  for (let i = 0; i < count; i++) {
    particles.push({
      type: 'smoke',
      x: x + rand(-6, 6),
      y: y + rand(-4, 4),
      vx: rand(-35, 35),
      vy: rand(-70, -10),
      life: rand(0.4, 0.9),
      maxLife: 0.9,
      size: rand(7, 16),
      color: pick(['#32252f', '#4b303a', '#5f3b40']),
      gravity: -12,
      drag: 0.94,
    });
  }
}

function addRing(x, y, color) {
  particles.push({ type: 'ring', x, y, vx: 0, vy: 0, life: 0.45, maxLife: 0.45, radius: 8, color, gravity: 0, drag: 1 });
}

function addFloater(text, x, y, color = '#ffe6aa', size = 15) {
  floaters.push({ text, x, y, life: 1.05, maxLife: 1.05, color, size });
}

function spawnExplosion(x, y) {
  addSparks(x, y, 26, ['#ffd36e', '#ff6b5f', '#fff1ce', '#ff3d7e'], 420, 260);
  addSmoke(x, y, 14);
  addRing(x, y, '#ff8168');
}

function handleCrash(x, y) {
  player.health -= 1;
  player.invuln = 2.4;
  player.speed = Math.max(13, player.speed * 0.52);
  combo = 0;
  comboTimer = 0;
  game.shake = 18;
  spawnExplosion(x, y);
  audio.crash();
  showCallout('HULL BREACH', 'is-warn');
  updateArmor();
  if (player.health <= 0) {
    endRun();
  }
}

function collectPickup(item, x, y) {
  score += 75;
  nearMisses += 0;
  player.nitro = clamp(player.nitro + 11, 0, 100);
  addSparks(x, y, 10, ['#6ffbe8', '#e9ffe0', '#51d9f1'], 180, 90);
  addRing(x, y, '#61f5e4');
  addFloater('+75', x, y - 12, '#8affea', 13);
  audio.coin(Math.min(4, Math.floor(player.nitro / 25)));
}

function handleNearMiss(car, sx, sy) {
  nearMisses += 1;
  combo += 1;
  comboTimer = 4.4;
  const multiplier = Math.min(8, combo + 1);
  const bonus = 100 * multiplier;
  score += bonus;
  player.nitro = clamp(player.nitro + 5, 0, 100);
  addSparks(sx, sy, 8, ['#ffd36e', '#fff1ce', '#ff8b5e'], 170, 80);
  addRing(sx, sy, '#ffc46a');
  addFloater(`+${bonus}`, sx, sy - 14, '#ffd784', 15);
  audio.whoosh();
  if (multiplier === 3 || multiplier === 5 || multiplier === 8) {
    showCallout(`${multiplier}x CHAIN`, 'is-good');
  }
}

function endRun() {
  if (game.mode !== 'playing') return;
  game.mode = 'over';
  game.nitroActive = false;
  gameEl.classList.add('is-over');
  clearInputs();
  const previousBest = best;
  wasNewBest = score > previousBest && score > 0;
  if (score > best) {
    best = Math.floor(score);
    saveBest(best, player.d);
  }
  ui.menuBest.textContent = padScore(best);
  audio.silenceEngine();
  bindResults();
  clearTimeout(overTimer);
  overTimer = setTimeout(() => {
    ui.gameOverScreen.classList.remove('is-hidden');
  }, 660);
}

function bindResults() {
  ui.finalScore.textContent = padScore(score);
  ui.finalDistance.textContent = (player.d / 1000).toFixed(2);
  ui.finalSpeed.textContent = String(Math.round(topSpeed * 3.6));
  ui.finalNear.textContent = String(nearMisses);
  ui.newBest.classList.toggle('is-hidden', !wasNewBest);
  ui.goCopy.textContent = wasNewBest
    ? 'A new personal best. The city remembers your name.'
    : pick([
      'The horizon got away this time.',
      'A little too close to the guardrail.',
      'The night drive is never over for long.',
    ]);
}

function togglePause() {
  if (game.mode === 'playing') {
    game.mode = 'paused';
    gameEl.classList.add('is-paused');
    ui.pauseScreen.classList.remove('is-hidden');
    clearInputs();
    audio.setPaused(true);
  } else if (game.mode === 'paused') {
    resumeRun();
  }
}

function resumeRun() {
  if (game.mode !== 'paused') return;
  game.mode = 'playing';
  gameEl.classList.remove('is-paused');
  ui.pauseScreen.classList.add('is-hidden');
  audio.setPaused(false);
  lastFrame = performance.now();
}

function quitToMenu() {
  if (score > best) {
    best = Math.floor(score);
    saveBest(best, player.d);
  }
  enterMenu();
}

function toggleSound() {
  audio.init();
  const isMuted = audio.toggleMuted();
  ui.soundBtn.classList.toggle('is-muted', isMuted);
  ui.soundBtn.setAttribute('aria-label', isMuted ? 'Unmute sound' : 'Mute sound');
  ui.soundBtn.title = isMuted ? 'Unmute sound' : 'Mute sound';
}

function updateArmor() {
  ui.armorPips.forEach((pip, index) => {
    pip.classList.toggle('is-on', index < player.health);
    pip.classList.toggle('is-hit', index >= player.health);
  });
}

function updateHUD() {
  const kmh = Math.round(player.speed * 3.6);
  const distance = player.d / 1000;
  const nitroPct = Math.round(player.nitro);
  const scoreValue = padScore(score);

  if (hudCache.kmh !== kmh) {
    setText(ui.speed, String(kmh).padStart(3, '0'));
    ui.speedFill.style.width = `${clamp(kmh / 260, 0, 1) * 100}%`;
    hudCache.kmh = kmh;
  }
  if (hudCache.distance !== distance) {
    setText(ui.distance, distance.toFixed(2));
    hudCache.distance = distance;
  }
  if (hudCache.score !== scoreValue) {
    setText(ui.score, scoreValue);
    hudCache.score = scoreValue;
  }
  if (hudCache.nitro !== nitroPct) {
    ui.nitroFill.style.transform = `scaleX(${clamp(player.nitro / 100, 0, 1)})`;
    setText(ui.nitroPct, `${nitroPct}%`);
    hudCache.nitro = nitroPct;
  }
  if (hudCache.health !== player.health) {
    updateArmor();
    hudCache.health = player.health;
  }

  const comboActive = game.mode === 'playing' && combo > 0;
  if (hudCache.comboActive !== comboActive) {
    ui.combo.classList.toggle('is-active', comboActive);
    hudCache.comboActive = comboActive;
  }
  if (comboActive) {
    const multiplier = Math.min(8, combo + 1);
    setText(ui.comboValue, String(multiplier));
    ui.comboFill.style.transform = `scaleX(${clamp(comboTimer / 4.4, 0, 1)})`;
  }
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) {
      particles.splice(i, 1);
      continue;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= Math.pow(p.drag, dt * 60);
    p.vy = p.vy * Math.pow(p.drag, dt * 60) + p.gravity * dt;
  }
  for (let i = floaters.length - 1; i >= 0; i--) {
    const f = floaters[i];
    f.life -= dt;
    f.y -= 34 * dt;
    if (f.life <= 0) floaters.splice(i, 1);
  }
}

function updateMenu(dt) {
  player.d += 13 * dt;
  player.speed = 13;
  player.x = view.halfW * 0.22;
  for (const car of traffic) car.d += 13 * dt;
  game.shake *= Math.pow(0.06, dt);
}

function updatePlaying(dt) {
  runTime += dt;
  player.invuln = Math.max(0, player.invuln - dt);

  const baseSpeed = 30 + Math.min(24, runTime * 0.21 + player.d * 0.0011);
  let target = baseSpeed;
  if (input.throttle) target += 5;
  if (input.brake) target -= 18;
  const canBoost = input.nitro && player.nitro > 2 && !input.brake;
  game.nitroActive = canBoost;
  if (canBoost) {
    target += 17;
    player.nitro = Math.max(0, player.nitro - 26 * dt);
  } else {
    player.nitro = Math.min(100, player.nitro + 4.8 * dt);
  }
  target = clamp(target, 13, 76);
  const accel = canBoost ? 27 : input.brake ? 38 : 14;
  const difference = target - player.speed;
  player.speed += clamp(difference, -accel * dt, accel * dt);
  player.speed = clamp(player.speed, 11, 78);
  topSpeed = Math.max(topSpeed, player.speed);
  player.d += player.speed * dt;

  const axis = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const maxVx = clamp(view.W * 0.38, 265, 525);
  const smoothing = axis !== 0 ? 9.5 : 14;
  player.vx += (axis * maxVx - player.vx) * Math.min(1, dt * smoothing);
  player.x += player.vx * dt;
  const limit = view.halfW - player.w * 0.58;
  if (Math.abs(player.x) > limit) {
    player.x = clamp(player.x, -limit, limit);
    if (Math.abs(player.vx) > 70) {
      const side = Math.sign(player.vx);
      addSparks(view.W / 2 + player.x + side * player.w * 0.42, view.playerY + player.h * 0.2, 5, ['#ffd46f', '#ff825f'], 130, 260);
      game.shake = Math.max(game.shake, 3.4);
      audio.whoosh();
    }
    player.vx *= -0.12;
    player.speed = Math.max(12, player.speed - 4 * dt);
  }

  if (Math.abs(player.vx) > 260 && Math.random() < dt * 12) {
    addSmoke(view.W / 2 + player.x - Math.sign(player.vx) * player.w * 0.28, view.playerY + player.h * 0.44, 1);
  }
  if ((canBoost || player.speed > 45) && Math.random() < dt * 24) {
    particles.push({
      type: 'streak',
      x: rand(view.W * 0.1, view.W * 0.9),
      y: rand(view.H * 0.25, view.H),
      vx: 0,
      vy: 480 + player.speed * 5,
      life: rand(0.1, 0.25),
      maxLife: 0.25,
      size: rand(12, 42),
      color: canBoost ? '#ffb07c' : '#9ce8dd',
      gravity: 0,
      drag: 1,
    });
  }

  score += player.speed * dt * 1.15;
  if (comboTimer > 0) {
    comboTimer -= dt;
    if (comboTimer <= 0) {
      combo = 0;
      comboTimer = 0;
    }
  }

  spawnTimer -= dt;
  if (spawnTimer <= 0) {
    spawnTrafficWave();
    const pressure = clamp(player.d / 5200, 0, 1);
    spawnTimer = lerp(1.35, 0.56, pressure) * rand(0.78, 1.18);
  }
  pickupTimer -= dt;
  if (pickupTimer <= 0) {
    spawnPickupWave();
    pickupTimer = rand(2.3, 4.1);
  }

  updateTraffic(dt);
  if (game.mode !== 'playing') return;
  updatePickups(dt);

  if (player.d >= nextSector) {
    const sector = Math.floor(player.d / 1000) + 1;
    showCallout(`SECTOR ${String(sector).padStart(2, '0')}`, '');
    nextSector += 1000;
  }

  game.shake = Math.max(0, game.shake - dt * 28);
  audio.updateEngine(player.speed * 3.6, canBoost);
  updateHUD();
}

function updateTraffic(dt) {
  const playerScreenX = view.W / 2 + player.x;
  for (let i = traffic.length - 1; i >= 0; i--) {
    const car = traffic[i];
    car.d += car.speed * dt;
    const sy = view.playerY - (car.d - player.d) * view.P;
    const center = view.W / 2 + (curveRaw(car.d) - curveRaw(player.d)) * view.A;
    const sx = center + car.lane * view.roadW;
    const dx = sx - playerScreenX;
    const dy = sy - view.playerY;

    if (sy > view.H + 150 || car.d < player.d - 90) {
      traffic.splice(i, 1);
      continue;
    }

    if (player.invuln <= 0 &&
      Math.abs(dx) < (car.w + player.w) * 0.43 &&
      Math.abs(dy) < (car.h + player.h) * 0.43) {
      traffic.splice(i, 1);
      handleCrash(sx, sy);
      if (game.mode !== 'playing') return;
      continue;
    }

    if (!car.scored && car.d < player.d - player.h * 0.17 / view.P) {
      car.scored = true;
      passedCars += 1;
      score += 25;
      if (Math.abs(dx) < (car.w + player.w) * 1.15 && Math.abs(dx) > (car.w + player.w) * 0.38) {
        handleNearMiss(car, sx, sy);
      }
    }
  }
}

function updatePickups(dt) {
  const playerScreenX = view.W / 2 + player.x;
  for (let i = pickups.length - 1; i >= 0; i--) {
    const item = pickups[i];
    const sy = view.playerY - (item.d - player.d) * view.P;
    const center = view.W / 2 + (curveRaw(item.d) - curveRaw(player.d)) * view.A;
    const sx = center + item.lane * view.roadW;
    if (sy > view.H + 60) {
      pickups.splice(i, 1);
      continue;
    }
    const dx = sx - playerScreenX;
    const dy = sy - view.playerY;
    if (Math.abs(dx) < (player.w * 0.46 + 12) && Math.abs(dy) < player.h * 0.46 + 14) {
      pickups.splice(i, 1);
      collectPickup(item, sx, sy);
    }
  }
}

function frame(now) {
  const dt = Math.min(0.038, Math.max(0.001, (now - lastFrame) / 1000));
  lastFrame = now;
  game.time += dt;
  updateParticles(dt);

  if (game.mode === 'menu') {
    updateMenu(dt);
  } else if (game.mode === 'playing') {
    updatePlaying(dt);
  } else if (game.mode === 'over') {
    game.shake = Math.max(0, game.shake - dt * 22);
  }

  renderer.render(game);
  requestAnimationFrame(frame);
}

function handleKeyDown(event) {
  const code = event.code;
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(code)) {
    event.preventDefault();
  }

  if (game.mode === 'menu' && (code === 'Enter' || code === 'Space')) {
    startRun();
    return;
  }
  if (game.mode === 'over' && !ui.gameOverScreen.classList.contains('is-hidden') && (code === 'Enter' || code === 'KeyR' || code === 'Space')) {
    startRun();
    return;
  }
  if (game.mode === 'paused' && (code === 'KeyP' || code === 'Escape')) {
    resumeRun();
    return;
  }
  if (game.mode === 'playing' && (code === 'KeyP' || code === 'Escape')) {
    togglePause();
    return;
  }
  if (code === 'KeyM') {
    toggleSound();
    return;
  }

  if (game.mode !== 'playing') return;
  if (code === 'ArrowLeft' || code === 'KeyA') input.left = true;
  if (code === 'ArrowRight' || code === 'KeyD') input.right = true;
  if (code === 'ArrowDown' || code === 'KeyS') input.brake = true;
  if (code === 'ArrowUp' || code === 'KeyW') input.throttle = true;
  if (code === 'Space' || code === 'ShiftLeft' || code === 'ShiftRight') input.nitro = true;
}

function handleKeyUp(event) {
  const code = event.code;
  if (code === 'ArrowLeft' || code === 'KeyA') input.left = false;
  if (code === 'ArrowRight' || code === 'KeyD') input.right = false;
  if (code === 'ArrowDown' || code === 'KeyS') input.brake = false;
  if (code === 'ArrowUp' || code === 'KeyW') input.throttle = false;
  if (code === 'Space' || code === 'ShiftLeft' || code === 'ShiftRight') input.nitro = false;
}

function bindTouchControls() {
  document.querySelectorAll('[data-control]').forEach((button) => {
    const control = button.dataset.control;
    const release = (event) => {
      if (control === 'left' || control === 'right' || control === 'brake' || control === 'nitro') input[control] = false;
      button.classList.remove('is-down');
      if (event && button.hasPointerCapture?.(event.pointerId)) {
        try { button.releasePointerCapture(event.pointerId); } catch { /* ignore */ }
      }
    };
    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      button.setPointerCapture?.(event.pointerId);
      input[control] = true;
      button.classList.add('is-down');
    });
    button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', release);
    button.addEventListener('lostpointercapture', () => release(null));
    button.addEventListener('contextmenu', (event) => event.preventDefault());
  });
}

function bindEvents() {
  window.addEventListener('resize', resize);
  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('keyup', handleKeyUp);
  window.addEventListener('blur', () => {
    if (game.mode === 'playing') togglePause();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && game.mode === 'playing') togglePause();
  });

  ui.startBtn.addEventListener('click', startRun);
  ui.restartBtn.addEventListener('click', startRun);
  ui.menuBtn.addEventListener('click', enterMenu);
  ui.resumeBtn.addEventListener('click', resumeRun);
  ui.quitBtn.addEventListener('click', quitToMenu);
  ui.pauseBtn.addEventListener('click', togglePause);
  ui.soundBtn.addEventListener('click', toggleSound);
  bindTouchControls();
}

function init() {
  computeView();
  renderer = new Renderer(canvas, view);
  audio = new SoundEngine();
  muted = audio.muted;
  ui.soundBtn.classList.toggle('is-muted', muted);
  ui.soundBtn.setAttribute('aria-label', muted ? 'Unmute sound' : 'Mute sound');
  applyViewToCars();
  bindEvents();
  setMenuScene();
  ui.menuBest.textContent = padScore(best);
  updateHUD();
  requestAnimationFrame(frame);
}

window.__sunsetRun = {
  start: startRun,
  end: endRun,
  menu: enterMenu,
  game,
  player,
  view,
  get score() { return score; },
  get best() { return best; },
};

init();
