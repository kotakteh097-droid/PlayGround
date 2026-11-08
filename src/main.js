import * as THREE from 'three';
import { AGENTS, randomBotAgent, getBotName } from './character.js';
import {
  createWorld, terrainHeight, resolveCollisions, segmentBlocked, raycastWorld, PLAY_RADIUS,
} from './world.js';
import { AudioEngine } from './audio.js';
import { clamp, damp, lerp, rand, pick, angleLerp } from './utils.js';

/* ============================================================
   BERMUDA — Free Fire 3D
   A complete single-player battle royale built on Three.js.
   ============================================================ */

const $ = (id) => document.getElementById(id);
const canvas = $('gl');

const WEAPONS = {
  rifle: {
    key: 'rifle', name: 'SCAR · SHADOW', label: 'ASSAULT RIFLE',
    damage: 16, head: 2.15, rpm: 560, mag: 30, reserve: 120, reload: 2.15,
    spread: 0.014, adsSpread: 0.0045, range: 120, pellets: 1, auto: true,
    recoil: 0.0085, botDamage: 8, tint: 0xff7a18,
  },
  smg: {
    key: 'smg', name: 'MP40 · VENOM', label: 'SUBMACHINE GUN',
    damage: 11, head: 1.8, rpm: 820, mag: 35, reserve: 140, reload: 1.8,
    spread: 0.02, adsSpread: 0.008, range: 80, pellets: 1, auto: true,
    recoil: 0.007, botDamage: 6, tint: 0x6ce1ff,
  },
  shotgun: {
    key: 'shotgun', name: 'M1014 · BREACH', label: 'SHOTGUN',
    damage: 8, head: 1.5, rpm: 90, mag: 7, reserve: 36, reload: 2.9,
    spread: 0.078, adsSpread: 0.056, range: 42, pellets: 8, auto: false,
    recoil: 0.028, botDamage: 6, tint: 0xffc857,
  },
  sniper: {
    key: 'sniper', name: 'AWM · FROST', label: 'SNIPER RIFLE',
    damage: 82, head: 2.4, rpm: 45, mag: 5, reserve: 24, reload: 3.1,
    spread: 0.004, adsSpread: 0.0007, range: 240, pellets: 1, auto: false,
    recoil: 0.036, botDamage: 30, tint: 0x56d9ff,
  },
  pistol: {
    key: 'pistol', name: 'G18 · SIDEARM', label: 'PISTOL',
    damage: 13, head: 1.9, rpm: 420, mag: 12, reserve: 60, reload: 1.25,
    spread: 0.022, adsSpread: 0.011, range: 70, pellets: 1, auto: true,
    recoil: 0.01, botDamage: 5, tint: 0xffc857,
  },
};

const LOOT_WEAPONS = ['rifle', 'smg', 'shotgun', 'sniper', 'smg', 'rifle'];
const isCoarse = window.matchMedia('(pointer: coarse)').matches;

const ZONE_PHASES = [
  { wait: 40, shrink: 26, radius: 64 },
  { wait: 31, shrink: 23, radius: 43 },
  { wait: 26, shrink: 20, radius: 27 },
  { wait: 21, shrink: 17, radius: 15 },
  { wait: 16, shrink: 14, radius: 7 },
];

/* ---------------- scene ---------------- */

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isCoarse ? 1.5 : 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.06, 460);
camera.rotation.order = 'YXZ';
scene.add(camera);

const world = createWorld(scene);
const audio = new AudioEngine();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isCoarse ? 1.5 : 2));
  buildCompass();
});

/* ---------------- player & match state ---------------- */

const player = {
  pos: new THREE.Vector3(0, 0, 52),
  vel: new THREE.Vector3(),
  yaw: 0,
  pitch: -0.02,
  onGround: true,
  health: 100,
  armor: 100,
  maxHealth: 100,
  weapons: [
    { key: 'rifle', mag: 30, reserve: 120 },
    { key: 'pistol', mag: 12, reserve: 60 },
  ],
  slot: 0,
  reloading: 0,
  reloadTotal: 0,
  nextShot: 0,
  semiLatch: false,
  firing: false,
  aiming: false,
  alive: false,
  bobPhase: 0,
  moveAmount: 0,
  shake: 0,
  damageFlash: 0,
  recoil: 0,
  flashTimer: 0,
  kills: 0,
  damageDone: 0,
  deathTimer: 0,
  agent: AGENTS[0],
  speedMod: 1,
  armorMod: 1,
  reloadMod: 1,
};

const game = {
  state: 'lobby',
  elapsed: 0,
  matchTime: 0,
  killCount: 0,
  aliveBots: 0,
  victoryTimer: -1,
  pendingEnd: false,
  rank: 10,
  killer: 'the storm',
  nearestPickup: null,
  lobbyAngle: 0.8,
  endedAt: 0,
};

const input = {
  keys: new Set(),
  firing: false,
  aimHeld: false,
  mobileAim: false,
  stickX: 0,
  stickY: 0,
  jumpQueued: false,
};

const bots = [];
const pickups = [];
const tracers = [];
const sparks = [];
const enemyTags = [];
const tagElements = new Map();

let agentIndex = 0;
let viewModel = null;
let muzzleMesh = null;
let killFeedRows = 0;
let toastTimer = 0;
let pickupToastTimer = 0;
let announceTimer = 0;

const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);

/* ---------------- input events ---------------- */

window.addEventListener('pointerdown', () => audio.init(), { once: true });

window.addEventListener('keydown', (e) => {
  if (e.repeat) {
    if (['Space', 'KeyR', 'KeyE', 'Digit1', 'Digit2'].includes(e.code)) e.preventDefault();
    return;
  }
  if (game.state !== 'playing') return;
  if (['Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyR', 'KeyE', 'Digit1', 'Digit2', 'KeyQ'].includes(e.code)) e.preventDefault();
  input.keys.add(e.code);
  if (e.code === 'Space') input.jumpQueued = true;
  if (e.code === 'KeyR') startReload();
  if (e.code === 'KeyE') tryPickup();
  if (e.code === 'Digit1') switchSlot(0);
  if (e.code === 'Digit2') switchSlot(1);
  if (e.code === 'KeyQ') switchSlot(player.slot === 0 ? 1 : 0);
});

window.addEventListener('keyup', (e) => {
  input.keys.delete(e.code);
});

window.addEventListener('blur', () => {
  input.keys.clear();
  input.firing = false;
  input.aimHeld = false;
});

function enterPointerLock() {
  if (isCoarse || game.state !== 'playing') return;
  if (document.pointerLockElement === canvas) return;
  try {
    const result = canvas.requestPointerLock();
    if (result && typeof result.catch === 'function') result.catch(() => {});
  } catch {
    /* Browser may deny without a gesture; the hint stays up. */
  }
}

canvas.addEventListener('click', () => {
  if (game.state === 'playing' && !isCoarse && document.pointerLockElement !== canvas) enterPointerLock();
});

canvas.addEventListener('mousedown', (e) => {
  if (game.state !== 'playing' || !player.alive) return;
  if (!isCoarse && document.pointerLockElement !== canvas) {
    enterPointerLock();
    return;
  }
  audio.init();
  if (e.button === 0) {
    input.firing = true;
    player.semiLatch = false;
  }
  if (e.button === 2) input.aimHeld = true;
});

window.addEventListener('mouseup', (e) => {
  if (e.button === 0) input.firing = false;
  if (e.button === 2) input.aimHeld = false;
});

canvas.addEventListener('contextmenu', (e) => e.preventDefault());

document.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== canvas || game.state !== 'playing' || !player.alive) return;
  const sens = 0.0022;
  player.yaw -= e.movementX * sens;
  player.pitch = clamp(player.pitch - e.movementY * sens, -1.42, 1.38);
});

document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === canvas;
  $('pointerHint').classList.toggle('hidden', locked || isCoarse || game.state !== 'playing');
  if (!locked) {
    input.firing = false;
    input.aimHeld = false;
  }
});

$('pointerHint').addEventListener('click', () => enterPointerLock());

/* ---------------- mobile controls ---------------- */

function setupMobileControls() {
  const joystick = $('joystick');
  const knob = $('stickKnob');
  let stickId = null;
  let rect = null;
  const R = 42;

  const moveStick = (e) => {
    if (e.pointerId !== stickId) return;
    const dx = e.clientX - (rect.left + rect.width / 2);
    const dy = e.clientY - (rect.top + rect.height / 2);
    const len = Math.hypot(dx, dy);
    const scale = len > R ? R / len : 1;
    const px = dx * scale;
    const py = dy * scale;
    knob.style.transform = `translate(${px}px, ${py}px)`;
    input.stickX = px / R;
    input.stickY = py / R;
  };

  joystick.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    audio.init();
    stickId = e.pointerId;
    rect = joystick.getBoundingClientRect();
    joystick.setPointerCapture(e.pointerId);
    moveStick(e);
  });
  joystick.addEventListener('pointermove', moveStick);
  const endStick = (e) => {
    if (e.pointerId !== stickId) return;
    stickId = null;
    knob.style.transform = '';
    input.stickX = 0;
    input.stickY = 0;
  };
  joystick.addEventListener('pointerup', endStick);
  joystick.addEventListener('pointercancel', endStick);

  // Touch look on the canvas.
  let lookId = null;
  let lastX = 0;
  let lastY = 0;
  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch' || game.state !== 'playing' || !player.alive) return;
    lookId = e.pointerId;
    lastX = e.clientX;
    lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerId !== lookId) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    player.yaw -= dx * 0.004;
    player.pitch = clamp(player.pitch - dy * 0.0035, -1.42, 1.38);
  });
  const endLook = (e) => {
    if (e.pointerId === lookId) lookId = null;
  };
  canvas.addEventListener('pointerup', endLook);
  canvas.addEventListener('pointercancel', endLook);

  const fire = $('fireBtn');
  fire.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    audio.init();
    input.firing = true;
    player.semiLatch = false;
  });
  const stopFire = () => { input.firing = false; };
  fire.addEventListener('pointerup', stopFire);
  fire.addEventListener('pointercancel', stopFire);
  fire.addEventListener('pointerleave', stopFire);

  $('aimBtn').addEventListener('click', (e) => {
    e.preventDefault();
    input.mobileAim = !input.mobileAim;
    $('aimBtn').style.borderColor = input.mobileAim ? 'var(--amber)' : '';
    $('aimBtn').style.color = input.mobileAim ? 'var(--amber)' : '';
  });
  $('reloadBtn').addEventListener('click', (e) => { e.preventDefault(); startReload(); });
  $('jumpBtn').addEventListener('click', (e) => { e.preventDefault(); input.jumpQueued = true; });
  $('swapBtn').addEventListener('click', (e) => { e.preventDefault(); switchSlot(player.slot === 0 ? 1 : 0); });
}

setupMobileControls();

/* ---------------- lobby ---------------- */

function updateAgentLobby() {
  const a = AGENTS[agentIndex];
  $('agentIndex').textContent = String(agentIndex + 1).padStart(2, '0');
  $('agentName').textContent = a.name;
  $('agentRole').textContent = a.role;
  $('agentBio').textContent = a.bio;
  $('perkSpeed').textContent = a.speed;
  $('perkArmor').textContent = a.armor;
  $('perkReload').textContent = a.reload;
  const dots = $('agentDots').children;
  for (let i = 0; i < dots.length; i++) dots[i].classList.toggle('active', i === agentIndex);
  $('hudPlayerName').textContent = a.name;
  $('hudAvatarLetter').textContent = a.name[0];
}

$('prevAgent').addEventListener('click', () => {
  agentIndex = (agentIndex + AGENTS.length - 1) % AGENTS.length;
  updateAgentLobby();
});
$('nextAgent').addEventListener('click', () => {
  agentIndex = (agentIndex + 1) % AGENTS.length;
  updateAgentLobby();
});

$('settingsBtn').addEventListener('click', () => {
  audio.init();
  const muted = audio.toggleMute();
  toast(muted ? 'AUDIO MUTED' : 'AUDIO ENABLED');
});

$('startBtn').addEventListener('click', () => {
  audio.init();
  startMatch();
});

updateAgentLobby();

/* ---------------- utility UI ---------------- */

function toast(message) {
  const el = $('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
}

function announce(text, sub = '') {
  const el = $('centerAnnounce');
  el.innerHTML = `${text}${sub ? `<small>${sub}</small>` : ''}`;
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
  clearTimeout(announceTimer);
  announceTimer = setTimeout(() => el.classList.remove('show'), 2100);
}

function showPickupToast(message) {
  const el = $('pickupToast');
  el.textContent = message;
  el.classList.remove('hidden');
  clearTimeout(pickupToastTimer);
  pickupToastTimer = setTimeout(() => el.classList.add('hidden'), 1350);
}

function addKillFeed(killer, victim, weaponKey) {
  const feed = $('killfeed');
  const row = document.createElement('div');
  row.className = 'feed-row';
  const you = killer === 'YOU';
  row.innerHTML = `<b class="${you ? 'hl' : ''}">${killer}</b><i>⌖</i><span>${victim}</span>`;
  feed.prepend(row);
  killFeedRows++;
  while (feed.children.length > 5) feed.lastElementChild.remove();
  setTimeout(() => { row.remove(); killFeedRows = Math.max(0, killFeedRows - 1); }, 5200);
}

function showHitmarker(kill = false) {
  const el = $('hitmarker');
  el.classList.remove('show', 'kill');
  void el.offsetWidth;
  if (kill) el.classList.add('kill');
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 260);
}

function damagePopup(point, amount, head = false) {
  if (amount < 1) return;
  tmpV.copy(point).project(camera);
  if (tmpV.z > 1) return;
  const el = document.createElement('div');
  el.className = `dmg-pop${head ? ' head' : ''}`;
  el.textContent = `${head ? '!' : ''}${Math.round(amount)}`;
  el.style.left = `${(tmpV.x * 0.5 + 0.5) * window.innerWidth}px`;
  el.style.top = `${(-tmpV.y * 0.5 + 0.5) * window.innerHeight}px`;
  $('floaters').appendChild(el);
  setTimeout(() => el.remove(), 760);
}

function setDamageVignette(amount) {
  player.damageFlash = Math.max(player.damageFlash, amount);
}

function showHitDirection(source) {
  const dx = source.x - player.pos.x;
  const dz = source.z - player.pos.z;
  const fx = -Math.sin(player.yaw);
  const fz = -Math.cos(player.yaw);
  const len = Math.hypot(dx, dz) || 1;
  const cross = fx * (dz / len) - fz * (dx / len);
  const dot = fx * (dx / len) + fz * (dz / len);
  const deg = Math.atan2(cross, dot) * 180 / Math.PI;
  const el = $('hitDirection');
  el.style.transform = `rotate(${deg}deg)`;
  el.classList.add('show');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove('show'), 380);
}

/* ---------------- compass ---------------- */

function buildCompass() {
  const strip = $('compassStrip');
  strip.innerHTML = '';
  strip.style.left = '50%';
  const cardinals = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
  for (let cycle = -1; cycle <= 1; cycle++) {
    for (let d = 0; d < 360; d += 15) {
      const span = document.createElement('span');
      if (cardinals[d]) span.className = 'major';
      span.innerHTML = `<b>${cardinals[d] || d}</b>`;
      span.dataset.deg = String(cycle * 360 + d);
      strip.appendChild(span);
    }
  }
}
buildCompass();

function updateCompass() {
  const strip = $('compassStrip');
  let heading = (-player.yaw * 180 / Math.PI) % 360;
  if (heading < 0) heading += 360;
  strip.style.transform = `translateX(${-1102.5 - heading * 3}px)`;
}

/* ---------------- minimap ---------------- */

const mapBase = document.createElement('canvas');
mapBase.width = mapBase.height = 320;
const MAP_SCALE = 1.58;

function buildMapBase() {
  const ctx = mapBase.getContext('2d');
  ctx.fillStyle = '#14323c';
  ctx.fillRect(0, 0, 320, 320);
  for (let py = 0; py < 320; py += 2) {
    for (let px = 0; px < 320; px += 2) {
      const wx = (px - 160) / MAP_SCALE;
      const wz = (py - 160) / MAP_SCALE;
      const h = terrainHeight(wx, wz);
      if (h > 0.35) {
        const t = clamp((h - 0.35) / 4.5, 0, 1);
        const r = Math.round(lerp(126, 62, t));
        const g = Math.round(lerp(142, 94, t));
        const b = Math.round(lerp(82, 50, t));
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(px, py, 2, 2);
      } else if (h > -0.25) {
        ctx.fillStyle = '#9b8f67';
        ctx.fillRect(px, py, 2, 2);
      }
    }
  }
  // Beach contour.
  ctx.strokeStyle = 'rgba(220,203,154,.5)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(160, 160, 76 * MAP_SCALE, 0, Math.PI * 2);
  ctx.stroke();
  // Buildings.
  for (const b of world.buildings) {
    const x = 160 + b.x * MAP_SCALE;
    const y = 160 + b.z * MAP_SCALE;
    ctx.fillStyle = '#cbbf9d';
    ctx.strokeStyle = '#191d1b';
    ctx.lineWidth = 1.5;
    ctx.fillRect(x - (b.w * MAP_SCALE) / 2, y - (b.d * MAP_SCALE) / 2, b.w * MAP_SCALE, b.d * MAP_SCALE);
    ctx.strokeRect(x - (b.w * MAP_SCALE) / 2, y - (b.d * MAP_SCALE) / 2, b.w * MAP_SCALE, b.d * MAP_SCALE);
  }
  // Grid.
  ctx.strokeStyle = 'rgba(255,255,255,.055)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 8; i++) {
    const p = (i / 8) * 320;
    ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, 320); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(320, p); ctx.stroke();
  }
}
buildMapBase();

function updateMinimap() {
  const ctx = $('minimap').getContext('2d');
  ctx.clearRect(0, 0, 320, 320);
  ctx.drawImage(mapBase, 0, 0);
  const cx = 160 + game.zone.center.x * MAP_SCALE;
  const cy = 160 + game.zone.center.z * MAP_SCALE;
  // Safe zone.
  ctx.strokeStyle = 'rgba(255,122,24,.95)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, game.zone.radius * MAP_SCALE, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,122,24,.2)';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.arc(cx, cy, game.zone.radius * MAP_SCALE, 0, Math.PI * 2);
  ctx.stroke();

  // Nearby enemies.
  for (const bot of bots) {
    if (!bot.alive) continue;
    const d = Math.hypot(bot.pos.x - player.pos.x, bot.pos.z - player.pos.z);
    if (d > 52) continue;
    const x = 160 + bot.pos.x * MAP_SCALE;
    const y = 160 + bot.pos.z * MAP_SCALE;
    ctx.fillStyle = '#ff3b4e';
    ctx.beginPath();
    ctx.arc(x, y, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  // Nearby loot.
  for (const p of pickups) {
    if (p.taken) continue;
    const d = Math.hypot(p.mesh.position.x - player.pos.x, p.mesh.position.z - player.pos.z);
    if (d > 34) continue;
    const x = 160 + p.mesh.position.x * MAP_SCALE;
    const y = 160 + p.mesh.position.z * MAP_SCALE;
    ctx.fillStyle = p.kind === 'weapon' ? '#ffc857' : p.kind === 'health' ? '#b7ff3c' : '#5de4ff';
    ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
  }

  // Player arrow.
  const px = 160 + player.pos.x * MAP_SCALE;
  const py = 160 + player.pos.z * MAP_SCALE;
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(-player.yaw);
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(0, -7);
  ctx.lineTo(5, 5);
  ctx.lineTo(0, 2);
  ctx.lineTo(-5, 5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  const letters = 'ABCDEFGH';
  const gx = clamp(Math.floor((player.pos.x + 80) / 20), 0, 7);
  const gz = clamp(Math.floor((player.pos.z + 80) / 20), 0, 7);
  $('gridRef').textContent = `${letters[gx]}${gz + 1}`;
}

/* ---------------- first-person weapon ---------------- */

function disposeGroup(group) {
  group.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
      else o.material.dispose();
    }
  });
  while (group.children.length) group.remove(group.children[0]);
}

function buildViewModel(key) {
  if (viewModel) {
    camera.remove(viewModel);
    disposeGroup(viewModel);
  }
  const w = WEAPONS[key];
  const g = new THREE.Group();
  g.position.set(0.2, -0.19, -0.66);
  g.scale.setScalar(0.72);
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x20262d, roughness: 0.45, metalness: 0.6 });
  const metalMat = new THREE.MeshStandardMaterial({ color: 0x3b444f, roughness: 0.4, metalness: 0.55 });
  const gripMat = new THREE.MeshStandardMaterial({ color: 0x11151a, roughness: 0.9 });
  const accentMat = new THREE.MeshStandardMaterial({ color: w.tint, emissive: w.tint, emissiveIntensity: 0.7, roughness: 0.4 });
  const scopeMat = new THREE.MeshStandardMaterial({ color: 0x254d58, emissive: 0x3bb7d2, emissiveIntensity: 0.5, roughness: 0.15, metalness: 0.6 });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xb7825b, roughness: 0.8 });
  const gloveMat = new THREE.MeshStandardMaterial({ color: 0x2a3036, roughness: 0.85 });

  const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    m.renderOrder = 999;
    m.frustumCulled = false;
    g.add(m);
    return m;
  };

  add(new THREE.BoxGeometry(0.085, 0.11, 0.43), bodyMat, 0, 0, -0.04);
  add(new THREE.BoxGeometry(0.065, 0.065, 0.30), metalMat, 0, 0.075, -0.1);
  const barrelLen = key === 'smg' ? 0.26 : key === 'shotgun' ? 0.45 : key === 'sniper' ? 0.58 : 0.4;
  add(new THREE.CylinderGeometry(0.019, 0.024, barrelLen, 8), metalMat, 0, 0.06, -0.23 - barrelLen / 2, Math.PI / 2);
  add(new THREE.BoxGeometry(0.072, 0.065, key === 'shotgun' ? 0.3 : 0.23), gripMat, 0, 0.015, -0.31);
  add(new THREE.BoxGeometry(0.05, 0.2, 0.095), bodyMat, 0, -0.13, -0.01, -0.17);
  add(new THREE.BoxGeometry(0.055, 0.16, 0.065), gripMat, 0, -0.12, 0.14, -0.2);
  if (key !== 'smg' && key !== 'pistol') add(new THREE.BoxGeometry(0.07, 0.085, 0.2), metalMat, 0, 0.012, 0.28);
  if (key === 'sniper' || key === 'rifle') {
    add(new THREE.CylinderGeometry(0.034, 0.034, 0.17, 10), bodyMat, 0, 0.16, -0.04, Math.PI / 2);
    add(new THREE.CylinderGeometry(0.019, 0.019, 0.014, 10), scopeMat, 0, 0.16, -0.132, Math.PI / 2);
  }
  if (key === 'shotgun') add(new THREE.BoxGeometry(0.09, 0.07, 0.18), gripMat, 0, -0.012, -0.3);
  add(new THREE.BoxGeometry(0.005, 0.032, 0.18), accentMat, 0.045, 0.035, -0.03);

  // Gloved hands.
  add(new THREE.BoxGeometry(0.078, 0.075, 0.105), gloveMat, -0.03, -0.135, 0.145, -0.15);
  add(new THREE.BoxGeometry(0.072, 0.072, 0.11), gloveMat, 0.025, -0.1, -0.295, 0.12);
  add(new THREE.BoxGeometry(0.075, 0.05, 0.09), skinMat, -0.045, -0.17, 0.235, -0.2);
  add(new THREE.BoxGeometry(0.065, 0.05, 0.08), skinMat, 0.035, -0.135, -0.375, 0.15);

  // Muzzle flash.
  const flashMat = new THREE.MeshBasicMaterial({
    color: 0xffd99a, transparent: true, opacity: 0.95, depthWrite: false,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const flash = new THREE.Group();
  for (let i = 0; i < 2; i++) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.14), flashMat.clone());
    p.rotation.z = i * Math.PI / 2;
    p.renderOrder = 1000;
    flash.add(p);
  }
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 5), new THREE.MeshBasicMaterial({ color: 0xfff3c4 }));
  core.renderOrder = 1000;
  flash.add(core);
  flash.position.set(0, 0.06, -0.23 - barrelLen - 0.05);
  flash.visible = false;
  g.add(flash);

  g.traverse((o) => {
    if (!o.isMesh) return;
    o.renderOrder = 999;
    o.frustumCulled = false;
    if (o.material) {
      o.material.depthTest = false;
      o.material.depthWrite = false;
    }
  });

  viewModel = g;
  muzzleMesh = flash;
  camera.add(g);
  return g;
}

const zone = {
  center: new THREE.Vector3(0, 0, 0),
  radius: 92,
  targetRadius: 92,
  startRadius: 92,
  startCenter: new THREE.Vector3(),
  targetCenter: new THREE.Vector3(),
  phase: 0,
  timer: ZONE_PHASES[0].wait,
  shrinking: false,
  shrinkDuration: 0,
  tick: 0,
  announced: false,
};
game.zone = zone;

function setZoneVisual() {
  world.zoneWall.scale.set(zone.radius, 1, zone.radius);
  world.zoneWall.position.x = zone.center.x;
  world.zoneWall.position.z = zone.center.z;
  world.zoneRing.scale.set(zone.radius, zone.radius, 1);
  world.zoneRing.position.x = zone.center.x;
  world.zoneRing.position.z = zone.center.z;
}

function resetZone() {
  zone.center.set(0, 0, 0);
  zone.radius = 92;
  zone.targetRadius = 92;
  zone.startRadius = 92;
  zone.startCenter.copy(zone.center);
  zone.targetCenter.copy(zone.center);
  zone.phase = 0;
  zone.timer = ZONE_PHASES[0].wait;
  zone.shrinking = false;
  zone.shrinkDuration = 0;
  zone.tick = 0;
  setZoneVisual();
}

/* ---------------- loot pickups ---------------- */

const pickupGeo = {
  weapon: new THREE.BoxGeometry(0.72, 0.34, 0.34),
  health: new THREE.BoxGeometry(0.46, 0.4, 0.34),
  armor: new THREE.BoxGeometry(0.48, 0.44, 0.32),
  ammo: new THREE.BoxGeometry(0.38, 0.26, 0.28),
};
const pickupMats = {
  weapon: new THREE.MeshStandardMaterial({ color: 0x3a2b18, roughness: 0.55, metalness: 0.4, emissive: 0xff7a18, emissiveIntensity: 0.55 }),
  health: new THREE.MeshStandardMaterial({ color: 0x2a6d31, roughness: 0.6, emissive: 0x55ff66, emissiveIntensity: 0.32 }),
  armor: new THREE.MeshStandardMaterial({ color: 0x17495c, roughness: 0.42, metalness: 0.4, emissive: 0x5de4ff, emissiveIntensity: 0.42 }),
  ammo: new THREE.MeshStandardMaterial({ color: 0x5a491e, roughness: 0.72, emissive: 0xffc857, emissiveIntensity: 0.3 }),
};

function spawnPickup(x, z, kind, weaponKey = null) {
  if (kind === 'weapon' && !weaponKey) weaponKey = pick(LOOT_WEAPONS);
  const group = new THREE.Group();
  const ground = terrainHeight(x, z);
  group.position.set(x, ground + 0.9, z);

  const boxMesh = new THREE.Mesh(pickupGeo[kind] || pickupGeo.ammo, pickupMats[kind] || pickupMats.ammo);
  boxMesh.castShadow = true;
  group.add(boxMesh);

  if (kind === 'health') {
    const crossMat = new THREE.MeshBasicMaterial({ color: 0xd8ffd9 });
    const a = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.23, 0.36), crossMat);
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.09, 0.36), crossMat);
    group.add(a, b);
  } else if (kind === 'armor') {
    const shield = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.24, 0.35), new THREE.MeshBasicMaterial({ color: 0xc9f7ff }));
    group.add(shield);
  } else if (kind === 'weapon') {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.05, 0.36), new THREE.MeshBasicMaterial({ color: 0xffd48a }));
    group.add(stripe);
  } else {
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.3), new THREE.MeshBasicMaterial({ color: 0xffe4a1 }));
    group.add(cap);
  }

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.6, 0.72, 28),
    new THREE.MeshBasicMaterial({ color: kind === 'weapon' ? 0xffa53c : kind === 'health' ? 0x9dff5d : 0x5de4ff, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = -0.72;
  group.add(ring);

  scene.add(group);
  pickups.push({ mesh: group, kind, weaponKey, taken: false, phase: rand(0, Math.PI * 2), baseY: ground + 0.9 });
}

function spawnAllLoot() {
  const used = new Set();
  for (const spot of world.lootSpots) {
    const key = `${Math.round(spot.x / 2)}:${Math.round(spot.z / 2)}`;
    if (used.has(key)) continue;
    used.add(key);
    spawnPickup(spot.x, spot.z, spot.kind, spot.kind === 'weapon' ? pick(LOOT_WEAPONS) : null);
  }
}

function equipWeapon(key) {
  const w = WEAPONS[key];
  if (!w) return;
  if (player.weapons[0].key === key) {
    player.weapons[0].reserve += w.mag;
    showPickupToast(`${w.name} · +${w.mag} AMMO`);
    updateWeaponUI();
    return;
  }
  player.weapons[1] = { key, mag: w.mag, reserve: w.reserve };
  player.slot = 1;
  player.reloading = 0;
  $('reloadRing').classList.add('hidden');
  buildViewModel(key);
  updateWeaponUI();
  showPickupToast(`${w.name} ACQUIRED`);
}

function tryPickup() {
  if (game.state !== 'playing' || !player.alive) return;
  const p = game.nearestPickup;
  if (!p || p.taken) return;
  p.taken = true;
  scene.remove(p.mesh);
  disposeGroup(p.mesh);
  audio.pickup();
  if (p.kind === 'weapon') {
    equipWeapon(p.weaponKey);
  } else if (p.kind === 'health') {
    player.health = Math.min(player.maxHealth, player.health + 45);
    showPickupToast('MEDKIT · +45 HP');
    audio.heal();
    updateHealthUI();
  } else if (p.kind === 'armor') {
    player.armor = Math.min(100, player.armor + 50);
    showPickupToast('BODY ARMOR · +50');
    audio.heal();
    updateHealthUI();
  } else {
    for (const slot of player.weapons) {
      const w = WEAPONS[slot.key];
      slot.reserve += Math.round(w.mag * 1.6);
    }
    showPickupToast('AMMO CRATE · RESERVES FILLED');
    updateWeaponUI();
  }
  game.nearestPickup = null;
  $('lootPrompt').classList.add('hidden');
}

$('lootPrompt').style.pointerEvents = 'auto';
$('lootPrompt').addEventListener('click', (e) => { e.preventDefault(); tryPickup(); });

/* ---------------- bots ---------------- */

function raySphere(origin, dir, center, radius) {
  const ox = origin.x - center.x;
  const oy = origin.y - center.y;
  const oz = origin.z - center.z;
  const b = ox * dir.x + oy * dir.y + oz * dir.z;
  const c = ox * ox + oy * oy + oz * oz - radius * radius;
  const disc = b * b - c;
  if (disc < 0) return -1;
  const t = -b - Math.sqrt(disc);
  return t > 0.12 ? t : -1;
}

function spawnBots() {
  const names = ['VIPER', 'DRIFT', 'NOVA', 'RAZOR', 'MAKO', 'GHOST', 'BLAZE', 'ONYX', 'SABLE', 'ROOK', 'JINX'];
  for (let i = names.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [names[i], names[j]] = [names[j], names[i]];
  }
  const spawns = world.botSpawns.slice();
  for (let i = 0; i < 9; i++) {
    const agent = randomBotAgent(i, names[i] || getBotName(i));
    const weaponKey = pick(['rifle', 'smg', 'shotgun', 'rifle', 'smg']);
    agent.setWeapon(weaponKey);
    let sp = spawns[i] || { x: Math.cos(i) * 40, z: Math.sin(i) * 40 };
    let x = sp.x;
    let z = sp.z;
    if (Math.hypot(x - player.pos.x, z - player.pos.z) < 24) {
      x = -x;
      z = -z;
    }
    const pos = new THREE.Vector3(x, terrainHeight(x, z), z);
    resolveCollisions(pos, 0.48, world.colliders);
    pos.y = terrainHeight(pos.x, pos.z);
    agent.root.position.copy(pos);
    agent.root.rotation.y = rand(-Math.PI, Math.PI);
    scene.add(agent.root);

    const bot = {
      agent, name: agent.name, weaponKey,
      hp: 100, armor: rand(0, 46),
      alive: true,
      pos: agent.root.position,
      target: null,
      nextThink: rand(0.1, 0.9),
      nextShot: rand(1.0, 2.4),
      aimDelay: rand(0.4, 1.2),
      reload: 0,
      ammo: WEAPONS[weaponKey].mag,
      roam: new THREE.Vector3(),
      roamTimer: 0,
      strafe: Math.random() > 0.5 ? 1 : -1,
      strafeTimer: rand(0.8, 2.2),
      speed: rand(3.4, 4.7),
      skill: rand(0.68, 1.08),
      hitFlash: 0,
      zoneTick: 0,
      lastKiller: null,
    };
    bots.push(bot);

    const tag = document.createElement('div');
    tag.className = 'enemy-tag';
    tag.innerHTML = `<div class="tag-name">${bot.name}</div><div class="tag-hp"><i style="width:100%"></i></div><div class="tag-marker"></div>`;
    $('enemyTags').appendChild(tag);
    tagElements.set(bot, tag);
  }
  game.aliveBots = bots.filter((b) => b.alive).length;
  updateAliveUI();
}

function dropLootFor(bot) {
  if (Math.random() > 0.48) return;
  const r = rand(0, 1);
  if (r < 0.5) spawnPickup(bot.pos.x, bot.pos.z, 'weapon', pick(LOOT_WEAPONS));
  else if (r < 0.75) spawnPickup(bot.pos.x, bot.pos.z, 'health');
  else spawnPickup(bot.pos.x, bot.pos.z, 'armor');
}

function killBot(bot, source, weaponKey = 'rifle') {
  if (!bot.alive) return;
  bot.alive = false;
  bot.agent.die();
  dropLootFor(bot);
  const victim = bot.name;
  if (source === 'player') {
    player.kills++;
    game.killCount = player.kills;
    $('killCount').textContent = String(player.kills);
    addKillFeed('YOU', victim, weaponKey);
    showHitmarker(true);
    audio.kill();
    announce(`${victim} ELIMINATED`, `KILL CONFIRMED · ${player.kills} TOTAL`);
  } else if (source === 'zone') {
    addKillFeed('STORM', victim, weaponKey);
  } else {
    addKillFeed(source.name || 'ENEMY', victim, weaponKey);
  }
  game.aliveBots = bots.filter((b) => b.alive).length;
  updateAliveUI();
  if (game.aliveBots === 0 && player.alive && game.victoryTimer < 0) {
    game.victoryTimer = 1.15;
  }
}

function damageBot(bot, amount, head, point, source) {
  if (!bot.alive) return;
  let dmg = amount;
  if (bot.armor > 0) {
    const absorb = Math.min(bot.armor, dmg * 0.42);
    bot.armor -= absorb;
    dmg -= absorb;
  }
  bot.hp -= dmg;
  bot.agent.flashHit();
  bot.hitFlash = 0.18;
  if (source === 'player') {
    player.damageDone += Math.round(dmg);
    damagePopup(point, dmg, head);
    bot.alerted = 3;
    if (!bot.target || bot.target.kind !== 'player') {
      bot.target = { kind: 'player' };
      bot.aimDelay = Math.min(bot.aimDelay, 0.35);
    }
  }
  if (bot.hp <= 0) killBot(bot, source, source === 'player' ? currentWeapon().key : bot.weaponKey);
  else if (source !== 'player' && source !== 'zone' && !bot.target) {
    bot.target = source;
  }
}

function botShoot(bot, now) {
  if (!bot.target || bot.reload > 0) return;
  const w = WEAPONS[bot.weaponKey];
  if (now < bot.nextShot) return;
  if (bot.ammo <= 0) {
    bot.reload = w.reload * rand(0.9, 1.25);
    bot.ammo = w.mag;
    return;
  }
  bot.nextShot = now + (60 / w.rpm) * rand(1.65, 2.9);
  bot.ammo--;
  bot.agent.shootEffect();

  const origin = tmpV.set(bot.pos.x, bot.pos.y + 1.42, bot.pos.z);
  let tx;
  let ty;
  let tz;
  if (bot.target.kind === 'player') {
    if (!player.alive) { bot.target = null; return; }
    tx = player.pos.x;
    ty = player.pos.y + 1.36;
    tz = player.pos.z;
  } else {
    if (!bot.target.alive) { bot.target = null; return; }
    tx = bot.target.pos.x;
    ty = bot.target.pos.y + 1.32;
    tz = bot.target.pos.z;
  }
  const dir = tmpV2.set(tx - origin.x, ty - origin.y, tz - origin.z);
  const dist = dir.length();
  dir.normalize();
  const err = (0.022 + dist * 0.00105) * bot.skill;
  dir.x += rand(-err, err);
  dir.y += rand(-err, err) * 0.65;
  dir.z += rand(-err, err);
  dir.normalize();

  const worldT = raycastWorld(world.colliders, origin, dir, 95);
  let hitT = Infinity;
  let part = 'body';
  if (bot.target.kind === 'player') {
    const bodyC = { x: player.pos.x, y: player.pos.y + 1.22, z: player.pos.z };
    const headC = { x: player.pos.x, y: player.pos.y + 1.72, z: player.pos.z };
    const tb = raySphere(origin, dir, bodyC, 0.5);
    const th = raySphere(origin, dir, headC, 0.30);
    if (th > 0 && th < tb) { hitT = th; part = 'head'; }
    else if (tb > 0) hitT = tb;
  } else {
    const bodyC = { x: bot.target.pos.x, y: bot.target.pos.y + 1.2, z: bot.target.pos.z };
    hitT = raySphere(origin, dir, bodyC, 0.5);
  }

  const blocked = worldT < Math.min(hitT, 95);
  const hit = hitT < Infinity && !blocked;
  const endDist = hit ? hitT : Math.min(worldT, 80);
  const end = new THREE.Vector3(origin.x + dir.x * endDist, origin.y + dir.y * endDist, origin.z + dir.z * endDist);
  spawnTracer(origin.clone(), end, 0xff6d3d, 0.018, 0.09);
  if (hit) {
    if (bot.target.kind === 'player') {
      const base = w.botDamage * rand(0.82, 1.18) * (part === 'head' ? 1.55 : 1);
      damagePlayer(base, new THREE.Vector3(tx, ty, tz), bot.name);
      spawnSparks(end, 0xff4d58, 4);
    } else {
      damageBot(bot.target, w.botDamage * rand(0.75, 1.05), false, end, bot);
      spawnSparks(end, 0xffa260, 4);
    }
  }

  const pd = Math.hypot(bot.pos.x - player.pos.x, bot.pos.z - player.pos.z);
  if (pd < 105) audio.shot(bot.weaponKey, pd);
}

function pickRoamPoint(bot) {
  const angle = rand(0, Math.PI * 2);
  const r = rand(5, Math.max(8, zone.radius * 0.82));
  const cx = zone.center.x;
  const cz = zone.center.z;
  bot.roam.set(cx + Math.cos(angle) * r, 0, cz + Math.sin(angle) * r);
  bot.roamTimer = rand(6, 12);
}

function chooseBotTarget(bot) {
  let best = null;
  let bestScore = Infinity;
  if (player.alive) {
    const d = Math.hypot(player.pos.x - bot.pos.x, player.pos.z - bot.pos.z);
    if (d < 72) {
      const blocked = segmentBlocked(
        world.colliders,
        bot.pos.x, bot.pos.y + 1.5, bot.pos.z,
        player.pos.x, player.pos.y + 1.5, player.pos.z,
      );
      if (!blocked) { best = { kind: 'player' }; bestScore = d - 5; }
    }
  }
  for (const other of bots) {
    if (other === bot || !other.alive || other === best) continue;
    const d = Math.hypot(other.pos.x - bot.pos.x, other.pos.z - bot.pos.z);
    if (d > 64 || d >= bestScore) continue;
    const blocked = segmentBlocked(
      world.colliders,
      bot.pos.x, bot.pos.y + 1.5, bot.pos.z,
      other.pos.x, other.pos.y + 1.5, other.pos.z,
    );
    if (!blocked) { best = other; bestScore = d; }
  }
  if (best !== bot.target) bot.aimDelay = rand(0.35, 0.9);
  bot.target = best;
}

function updateBot(bot, dt, now) {
  if (!bot.alive) {
    bot.agent.update(dt, { speed: 0, aiming: false });
    return;
  }
  if (bot.reload > 0) {
    bot.reload -= dt;
    if (bot.reload <= 0) {
      bot.reload = 0;
      bot.ammo = WEAPONS[bot.weaponKey].mag;
    }
  }

  const zdx = bot.pos.x - zone.center.x;
  const zdz = bot.pos.z - zone.center.z;
  const zDist = Math.hypot(zdx, zdz);
  const outsideZone = zDist > zone.radius + 0.5;

  bot.nextThink -= dt;
  if (bot.nextThink <= 0) {
    bot.nextThink = rand(0.7, 1.5);
    if (bot.target) {
      const valid = bot.target.kind === 'player'
        ? player.alive
        : (bot.target.alive && bot.target !== bot);
      if (!valid) bot.target = null;
    }
    if (!outsideZone) chooseBotTarget(bot);
    bot.strafeTimer -= dt;
    if (bot.strafeTimer <= 0) {
      bot.strafe *= -1;
      bot.strafeTimer = rand(1.0, 2.5);
    }
  }
  if (bot.target) {
    const dist = bot.target.kind === 'player'
      ? Math.hypot(player.pos.x - bot.pos.x, player.pos.z - bot.pos.z)
      : Math.hypot(bot.target.pos.x - bot.pos.x, bot.target.pos.z - bot.pos.z);
    if (dist > 76) bot.target = null;
  }

  let moveX = 0;
  let moveZ = 0;
  let desiredSpeed = 0;

  if (outsideZone) {
    const toCx = zone.center.x - bot.pos.x;
    const toCz = zone.center.z - bot.pos.z;
    const len = Math.hypot(toCx, toCz) || 1;
    moveX = toCx / len;
    moveZ = toCz / len;
    desiredSpeed = 5.7;
  } else if (bot.target) {
    const tx = bot.target.kind === 'player' ? player.pos.x : bot.target.pos.x;
    const tz = bot.target.kind === 'player' ? player.pos.z : bot.target.pos.z;
    const dx = tx - bot.pos.x;
    const dz = tz - bot.pos.z;
    const dist = Math.hypot(dx, dz) || 1;
    const nx = dx / dist;
    const nz = dz / dist;
    if (dist > 31) {
      moveX = nx; moveZ = nz;
      desiredSpeed = bot.speed * 1.05;
    } else if (dist < 11) {
      moveX = -nx; moveZ = -nz;
      desiredSpeed = bot.speed * 0.8;
    } else {
      moveX = -nz * bot.strafe;
      moveZ = nx * bot.strafe;
      desiredSpeed = bot.speed * 0.7;
    }
  } else {
    bot.roamTimer -= dt;
    const rdx = bot.roam.x - bot.pos.x;
    const rdz = bot.roam.z - bot.pos.z;
    const rdist = Math.hypot(rdx, rdz);
    if (rdist < 2.2 || bot.roamTimer <= 0) pickRoamPoint(bot);
    const dx = bot.roam.x - bot.pos.x;
    const dz = bot.roam.z - bot.pos.z;
    const len = Math.hypot(dx, dz) || 1;
    moveX = dx / len;
    moveZ = dz / len;
    desiredSpeed = bot.speed;
  }

  const distToCenter = Math.hypot(bot.pos.x, bot.pos.z);
  if (distToCenter > PLAY_RADIUS - 1) {
    moveX -= (bot.pos.x / distToCenter) * 1.4;
    moveZ -= (bot.pos.z / distToCenter) * 1.4;
    const l = Math.hypot(moveX, moveZ) || 1;
    moveX /= l; moveZ /= l;
  }

  bot.pos.x += moveX * desiredSpeed * dt;
  bot.pos.z += moveZ * desiredSpeed * dt;
  resolveCollisions(bot.pos, 0.46, world.colliders);
  bot.pos.y = terrainHeight(bot.pos.x, bot.pos.z);

  // Gentle separation so bots do not merge into one blob.
  for (const other of bots) {
    if (other === bot || !other.alive) continue;
    const dx = bot.pos.x - other.pos.x;
    const dz = bot.pos.z - other.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 1.15 && d > 0.001) {
      bot.pos.x += (dx / d) * (1.15 - d) * 0.5;
      bot.pos.z += (dz / d) * (1.15 - d) * 0.5;
    }
  }

  let faceX = moveX;
  let faceZ = moveZ;
  let aiming = false;
  if (bot.target) {
    const tx = bot.target.kind === 'player' ? player.pos.x : bot.target.pos.x;
    const tz = bot.target.kind === 'player' ? player.pos.z : bot.target.pos.z;
    faceX = tx - bot.pos.x;
    faceZ = tz - bot.pos.z;
    aiming = true;
    bot.aimDelay -= dt;
    if (bot.aimDelay <= 0) botShoot(bot, now);
  }
  if (Math.abs(faceX) + Math.abs(faceZ) > 0.001) {
    const desiredYaw = Math.atan2(-faceX, -faceZ);
    bot.agent.root.rotation.y = angleLerp(bot.agent.root.rotation.y, desiredYaw, 1 - Math.exp(-7 * dt));
  }

  const horizontalSpeed = desiredSpeed * (Math.hypot(moveX, moveZ) > 0.05 ? 1 : 0);
  bot.agent.update(dt, {
    speed: horizontalSpeed,
    aiming,
    reloading: bot.reload > 0,
    grounded: true,
  });

  // Storm damage.
  if (outsideZone) {
    bot.zoneTick += dt * (3.2 + zone.phase * 1.15);
    bot.hp -= dt * (3.2 + zone.phase * 1.15);
    if (bot.hp <= 0) killBot(bot, 'zone', 'zone');
  }
}

/* ---------------- match lifecycle ---------------- */

function clearMatch() {
  for (const bot of bots) {
    scene.remove(bot.agent.root);
    disposeAgent(bot.agent);
    const tag = tagElements.get(bot);
    if (tag) tag.remove();
  }
  bots.length = 0;
  tagElements.clear();
  for (const p of pickups) {
    scene.remove(p.mesh);
    disposeGroup(p.mesh);
  }
  pickups.length = 0;
  for (const t of tracers) {
    scene.remove(t.mesh);
    t.mesh.material.dispose();
  }
  tracers.length = 0;
  for (const s of sparks) scene.remove(s.mesh);
  sparks.length = 0;
  $('killfeed').innerHTML = '';
  $('floaters').innerHTML = '';
  $('enemyTags').innerHTML = '';
  $('lootPrompt').classList.add('hidden');
  $('pickupToast').classList.add('hidden');
  $('zoneWarning').classList.remove('show');
  $('reloadRing').classList.add('hidden');
  game.nearestPickup = null;
  killFeedRows = 0;
}

function disposeAgent(agent) {
  agent.root.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
      else o.material.dispose();
    }
  });
}

function resetPlayer() {
  const a = AGENTS[agentIndex];
  player.agent = a;
  player.speedMod = 1 + parseFloat(a.speed.replace('+', '')) / 100;
  player.armorMod = 1 - parseFloat(a.armor.replace('+', '')) / 100;
  player.reloadMod = 1 - parseFloat(a.reload.replace('+', '')) / 100;
  player.health = 100;
  player.armor = 100;
  player.weapons = [
    { key: 'rifle', mag: 30, reserve: 120 },
    { key: 'pistol', mag: 12, reserve: 60 },
  ];
  player.slot = 0;
  player.reloading = 0;
  player.nextShot = 0;
  player.alive = true;
  player.kills = 0;
  player.damageDone = 0;
  player.yaw = 0;
  player.pitch = -0.03;
  player.vel.set(0, 0, 0);
  player.shake = 0;
  player.damageFlash = 0;
  player.deathTimer = 0;
  player.onGround = true;
  player.pos.set(0, terrainHeight(0, 52), 52);
  resolveCollisions(player.pos, 0.42, world.colliders);
  player.pos.y = terrainHeight(player.pos.x, player.pos.z);
  camera.rotation.z = 0;
  buildViewModel('rifle');
  $('hudPlayerName').textContent = a.name;
  $('hudAvatarLetter').textContent = a.name[0];
  updateWeaponUI();
  updateHealthUI();
  updateAliveUI();
}

function startMatch() {
  clearMatch();
  game.state = 'playing';
  game.matchTime = 0;
  game.killCount = 0;
  game.victoryTimer = -1;
  game.pendingEnd = false;
  game.rank = 10;
  game.killer = 'the storm';
  player.firing = false;
  input.firing = false;
  input.aimHeld = false;
  input.mobileAim = false;
  input.stickX = 0;
  input.stickY = 0;
  input.keys.clear();
  $('aimBtn').style.borderColor = '';
  $('aimBtn').style.color = '';

  resetZone();
  resetPlayer();
  spawnBots();
  spawnAllLoot();
  setZoneVisual();

  $('aliveCount').textContent = '10';
  $('killCount').textContent = '0';
  $('lobby').classList.add('dismissed');
  $('hud').classList.remove('hidden');
  $('resultOverlay').classList.add('hidden');
  $('resultCard').classList.remove('lose');
  $('pointerHint').classList.toggle('hidden', isCoarse);
  $('zoneWarning').classList.remove('show');

  setTimeout(() => {
    if (game.state === 'playing') greetMatch();
  }, 350);
  enterPointerLock();
}

function greetMatch() {
  announce('MATCH START', '10 FIGHTERS · ONE SURVIVOR');
  setTimeout(() => {
    if (game.state === 'playing') announce('SURVIVE THE STORM', 'LOOT UP · STAY INSIDE THE ZONE');
  }, 2200);
}

function finishMatch(win) {
  if (game.state === 'ended') return;
  game.state = 'ended';
  game.endedAt = performance.now();
  player.alive = false;
  player.firing = false;
  input.firing = false;
  input.aimHeld = false;
  closePointerLock();
  $('pointerHint').classList.add('hidden');

  const card = $('resultCard');
  card.classList.toggle('lose', !win);
  $('resultKicker').textContent = win ? 'MATCH COMPLETE · BOOYAH' : 'MATCH COMPLETE · DEFEAT';
  $('resultTitle').textContent = win ? 'BOOYAH!' : 'ELIMINATED';
  $('resultSub').textContent = win
    ? 'You are the last fighter standing on Bermuda.'
    : `Rank #${game.rank} of 10 · ${game.killer} got you.`;
  $('resultKills').textContent = String(player.kills);
  $('resultDamage').textContent = String(Math.round(player.damageDone));
  $('resultRank').textContent = win ? '#1' : `#${game.rank}`;
  $('resultOverlay').classList.remove('hidden');
  audio.announce(win);
}

function closePointerLock() {
  if (document.pointerLockElement === canvas) {
    try { document.exitPointerLock(); } catch { /* ignore */ }
  }
}

$('againBtn').addEventListener('click', () => {
  audio.init();
  $('resultOverlay').classList.add('hidden');
  startMatch();
});

$('lobbyBtn').addEventListener('click', () => {
  $('resultOverlay').classList.add('hidden');
  $('hud').classList.add('hidden');
  $('lobby').classList.remove('dismissed');
  game.state = 'lobby';
  player.alive = false;
  clearMatch();
  toast('RETURNED TO LOBBY');
});

/* ---------------- combat ---------------- */

function currentWeapon() {
  return WEAPONS[player.weapons[player.slot].key];
}

function currentSlot() {
  return player.weapons[player.slot];
}

function traceBots(origin, dir, maxDist) {
  let best = null;
  let bestT = maxDist;
  for (const bot of bots) {
    if (!bot.alive) continue;
    const headC = { x: bot.pos.x, y: bot.pos.y + 1.82, z: bot.pos.z };
    const bodyC = { x: bot.pos.x, y: bot.pos.y + 1.23, z: bot.pos.z };
    const legC = { x: bot.pos.x, y: bot.pos.y + 0.66, z: bot.pos.z };
    const th = raySphere(origin, dir, headC, 0.25);
    const tb = raySphere(origin, dir, bodyC, 0.44);
    const tl = raySphere(origin, dir, legC, 0.34);
    const tests = [
      { t: th, part: 'head' },
      { t: tb, part: 'body' },
      { t: tl, part: 'leg' },
    ];
    for (const test of tests) {
      if (test.t > 0 && test.t < bestT) {
        bestT = test.t;
        best = { bot, part: test.part, t: test.t };
      }
    }
  }
  return best;
}

function tryPlayerFire(now) {
  if (game.state !== 'playing' || !player.alive || player.reloading > 0) return;
  if (!player.firing) return;
  const w = currentWeapon();
  const slot = currentSlot();
  if (!w.auto && player.semiLatch) return;
  if (now < player.nextShot) return;
  if (slot.mag <= 0) {
    audio.empty();
    player.nextShot = now + 0.3;
    player.semiLatch = true;
    startReload();
    return;
  }

  player.nextShot = now + 60 / w.rpm;
  player.semiLatch = true;
  slot.mag--;
  audio.shot(w.key, 0);
  player.recoil = 1;
  player.flashTimer = 0.055;
  if (muzzleMesh) {
    muzzleMesh.visible = true;
    muzzleMesh.rotation.z = rand(0, Math.PI);
    muzzleMesh.scale.setScalar(rand(0.8, 1.25));
  }

  const origin = camera.position.clone();
  const baseDir = new THREE.Vector3();
  camera.getWorldDirection(baseDir);
  const moveBoost = 1 + player.moveAmount * 0.85;
  const spread = (player.aiming ? w.adsSpread : w.spread) * moveBoost;
  let anyHit = false;
  let headHit = false;

  for (let i = 0; i < w.pellets; i++) {
    const dir = baseDir.clone();
    dir.x += rand(-spread, spread);
    dir.y += rand(-spread, spread) * 0.8;
    dir.z += rand(-spread, spread);
    dir.normalize();
    const worldT = raycastWorld(world.colliders, origin, dir, w.range);
    const hit = traceBots(origin, dir, worldT);
    const endT = hit ? hit.t : worldT;
    const end = origin.clone().addScaledVector(dir, endT);
    spawnTracer(origin, end, 0xffd27a, 0.014, 0.075);
    if (hit) {
      anyHit = true;
      const head = hit.part === 'head';
      headHit = headHit || head;
      const dmg = w.damage * (head ? w.head : 1) * rand(0.94, 1.06);
      damageBot(hit.bot, dmg, head, end, 'player');
      spawnSparks(end, 0xff5a4a, 5);
    } else if (worldT < w.range) {
      spawnSparks(origin.clone().addScaledVector(dir, worldT), 0xffc071, 3);
    }
  }

  if (anyHit) {
    audio.hit(headHit);
    showHitmarker(false);
  }

  // Recoil is a nudge to the aim, not a hard snap.
  player.pitch = clamp(player.pitch + w.recoil * rand(0.7, 1.2), -1.42, 1.38);
  player.yaw += rand(-w.recoil * 0.4, w.recoil * 0.4);
  updateWeaponUI();

  if (slot.mag <= 0 && slot.reserve > 0) {
    setTimeout(() => {
      if (game.state === 'playing' && player.alive && slot.mag <= 0) startReload();
    }, 180);
  }
}

function damagePlayer(amount, sourcePos, sourceName) {
  if (game.state !== 'playing' || !player.alive) return;
  let dmg = amount * player.armorMod;
  if (player.armor > 0) {
    const absorb = Math.min(player.armor, dmg * 0.55);
    player.armor -= absorb;
    dmg -= absorb;
  }
  player.health -= dmg;
  player.shake = Math.min(1.6, player.shake + 0.35 + dmg * 0.01);
  setDamageVignette(0.55 + Math.min(0.4, dmg * 0.015));
  if (sourcePos) showHitDirection(sourcePos);
  audio.hurt();
  updateHealthUI();
  if (player.health <= 0) {
    player.health = 0;
    updateHealthUI();
    playerDie(sourceName || 'THE STORM');
  }
}

function playerDie(killerName) {
  if (!player.alive) return;
  player.alive = false;
  player.firing = false;
  input.firing = false;
  input.aimHeld = false;
  game.pendingEnd = true;
  game.endDelay = 1.45;
  game.rank = Math.max(1, game.aliveBots + 1);
  game.killer = killerName;
  closePointerLock();
  announce('ELIMINATED', `RANK #${game.rank} · ${killerName.toUpperCase()}`);
  if (viewModel) viewModel.visible = false;
}

function startReload() {
  if (game.state !== 'playing' || !player.alive) return;
  const w = currentWeapon();
  const slot = currentSlot();
  if (player.reloading > 0 || slot.mag >= w.mag || slot.reserve <= 0) return;
  player.reloadTotal = w.reload * player.reloadMod;
  player.reloading = player.reloadTotal;
  $('reloadRing').classList.remove('hidden');
  $('reloadArc').style.strokeDashoffset = '157';
  audio.reload();
}

function switchSlot(index) {
  if (game.state !== 'playing' || !player.alive) return;
  if (index === player.slot || !player.weapons[index]) return;
  player.slot = index;
  player.reloading = 0;
  player.semiLatch = false;
  $('reloadRing').classList.add('hidden');
  buildViewModel(player.weapons[index].key);
  updateWeaponUI();
  toast(WEAPONS[player.weapons[index].key].name);
}

/* ---------------- player simulation ---------------- */

function updatePlayer(dt, now) {
  if (!player.alive) return;

  const w = currentWeapon();
  const slot = currentSlot();
  if (player.reloading > 0) {
    player.reloading -= dt;
    const p = 1 - Math.max(0, player.reloading) / player.reloadTotal;
    $('reloadArc').style.strokeDashoffset = String(157 * (1 - p));
    if (player.reloading <= 0) {
      player.reloading = 0;
      const need = w.mag - slot.mag;
      const take = Math.min(need, slot.reserve);
      slot.mag += take;
      slot.reserve -= take;
      $('reloadRing').classList.add('hidden');
      audio.reload();
      updateWeaponUI();
    }
  }

  player.aiming = !isCoarse ? input.aimHeld : input.mobileAim;
  if (isCoarse && input.aimHeld) player.aiming = true;

  const forward = (input.keys.has('KeyW') ? 1 : 0) - (input.keys.has('KeyS') ? 1 : 0) - input.stickY;
  const strafe = (input.keys.has('KeyD') ? 1 : 0) - (input.keys.has('KeyA') ? 1 : 0) + input.stickX;
  let f = clamp(forward, -1, 1);
  let s = clamp(strafe, -1, 1);
  const mag = Math.hypot(f, s);
  if (mag > 1) { f /= mag; s /= mag; }
  const moving = mag > 0.08;

  const sprint = input.keys.has('ShiftLeft') || input.keys.has('ShiftRight') || (isCoarse && mag > 0.92 && !player.aiming);
  let speed = player.aiming ? 3.05 : sprint ? 7.7 : 5.05;
  speed *= player.speedMod;

  const fx = -Math.sin(player.yaw);
  const fz = -Math.cos(player.yaw);
  const rx = Math.cos(player.yaw);
  const rz = -Math.sin(player.yaw);
  const wishX = fx * f + rx * s;
  const wishZ = fz * f + rz * s;

  const accel = player.onGround ? 15 : 4.2;
  player.vel.x = damp(player.vel.x, wishX * speed, accel, dt);
  player.vel.z = damp(player.vel.z, wishZ * speed, accel, dt);

  if (input.jumpQueued && player.onGround) {
    player.vel.y = 8.2;
    player.onGround = false;
  }
  input.jumpQueued = false;

  player.vel.y -= 23.5 * dt;
  const oldX = player.pos.x;
  const oldZ = player.pos.z;
  player.pos.x += player.vel.x * dt;
  player.pos.z += player.vel.z * dt;
  player.pos.y += player.vel.y * dt;

  resolveCollisions(player.pos, 0.42, world.colliders);
  if (terrainHeight(player.pos.x, player.pos.z) < 0.28) {
    player.pos.x = oldX;
    player.pos.z = oldZ;
    player.vel.x *= -0.15;
    player.vel.z *= -0.15;
  }

  const ground = terrainHeight(player.pos.x, player.pos.z);
  if (player.pos.y <= ground) {
    player.pos.y = ground;
    player.vel.y = 0;
    player.onGround = true;
  } else if (player.pos.y > ground + 0.04) {
    player.onGround = false;
  }

  const actualSpeed = Math.hypot(player.vel.x, player.vel.z);
  player.moveAmount = damp(player.moveAmount, clamp(actualSpeed / 7.7, 0, 1), 9, dt);
  if (player.onGround && actualSpeed > 0.2) player.bobPhase += dt * (6.5 + actualSpeed * 0.7);

  if (player.aiming) {
    // Slow the bob while aiming.
    player.bobPhase += dt * actualSpeed * 0.05;
  }

  player.firing = input.firing;
  tryPlayerFire(now);

  player.recoil = Math.max(0, player.recoil - dt * 10);  if (player.flashTimer > 0) {
    player.flashTimer -= dt;
    if (player.flashTimer <= 0 && muzzleMesh) muzzleMesh.visible = false;
  }

  if (slot.mag <= 0 && player.reloading <= 0 && input.firing) startReload();

  if (player.health <= 0) playerDie(game.killer || 'THE STORM');
}

/* ---------------- camera & view model ---------------- */

function updateCamera(dt) {
  if (game.state === 'lobby') return;
  const ground = terrainHeight(player.pos.x, player.pos.z);
  let eye = ground + 1.72;
  if (!player.alive) eye = ground + 0.45;

  const bob = player.onGround && player.alive
    ? Math.sin(player.bobPhase * 2) * 0.035 * player.moveAmount * (player.aiming ? 0.3 : 1)
    : 0;
  const sway = Math.cos(player.bobPhase) * 0.018 * player.moveAmount * (player.aiming ? 0.25 : 1);

  player.shake = Math.max(0, player.shake - dt * 3.2);
  const sx = rand(-1, 1) * player.shake * 0.045;
  const sy = rand(-1, 1) * player.shake * 0.045;

  camera.position.set(player.pos.x + sway + sx, eye + bob + sy, player.pos.z);
  camera.rotation.y = player.yaw;
  camera.rotation.x = player.pitch;
  camera.rotation.z = damp(camera.rotation.z, player.alive ? 0 : 0.42, 5, dt);

  const targetFov = player.alive
    ? (player.aiming ? (currentWeapon().key === 'sniper' ? 36 : 51) : 72)
    : 76;
  camera.fov = damp(camera.fov, targetFov, 9, dt);
  camera.updateProjectionMatrix();

  $('crosshair').classList.toggle('aiming', player.aiming && player.alive);
  $('aimTag').classList.toggle('hidden', !player.aiming || !player.alive);
  if (player.aiming) $('aimTag').textContent = currentWeapon().key === 'sniper' ? 'SCOPE' : 'ADS';

  if (!viewModel) return;
  viewModel.visible = game.state === 'playing' && player.alive;
  if (!viewModel.visible) return;

  const aiming = player.aiming;
  const bx = aiming ? 0 : 0.2;
  const by = aiming ? -0.105 : -0.19;
  const bz = aiming ? -0.56 : -0.66;
  const swayX = Math.sin(player.bobPhase) * 0.012 * player.moveAmount * (aiming ? 0.2 : 1);
  const swayY = Math.cos(player.bobPhase * 2) * 0.008 * player.moveAmount * (aiming ? 0.2 : 1);
  viewModel.position.x = damp(viewModel.position.x, bx + swayX, 12, dt);
  viewModel.position.y = damp(viewModel.position.y, by + swayY, 12, dt);
  viewModel.position.z = damp(viewModel.position.z, bz + player.recoil * 0.06, 14, dt);
  viewModel.rotation.x = damp(viewModel.rotation.x, player.recoil * 0.07 + (player.reloading > 0 ? 0.3 : 0), 12, dt);
  viewModel.rotation.y = damp(viewModel.rotation.y, aiming ? 0 : 0.045, 10, dt);
  viewModel.rotation.z = damp(viewModel.rotation.z, aiming ? 0 : -0.02, 10, dt);

  const pulse = 0.06 + Math.sin(game.elapsed * 2) * 0.02;
  player.damageFlash = Math.max(0, player.damageFlash - dt * 1.7);
  $('damageVignette').style.opacity = String(Math.max(player.damageFlash, player.health <= 28 && player.alive ? pulse : 0));
}

/* ---------------- HUD ---------------- */

function updateHealthUI() {
  const hp = clamp(player.health, 0, 100);
  const ar = clamp(player.armor, 0, 100);
  $('healthBar').style.width = `${hp}%`;
  $('armorBar').style.width = `${ar}%`;
  $('healthText').textContent = String(Math.ceil(hp));
  $('armorText').textContent = String(Math.ceil(ar));
  $('healthBar').style.background = hp < 30
    ? 'linear-gradient(90deg, #ff3b4e, #ff8a52)'
    : 'linear-gradient(90deg, #70d445, #b7ff3c)';
}

function updateWeaponUI() {
  const w = currentWeapon();
  const slot = currentSlot();
  $('weaponType').textContent = w.label;
  $('weaponName').textContent = w.name;
  $('ammoMag').textContent = String(slot.mag);
  $('ammoReserve').textContent = String(slot.reserve);
  const spans = document.querySelectorAll('.weapon-slot span');
  spans.forEach((el, i) => {
    const active = i === player.slot;
    el.style.color = active ? '#111' : 'rgba(255,255,255,.45)';
    el.style.background = active ? 'var(--amber)' : 'rgba(4,7,11,.65)';
    el.style.borderColor = active ? 'var(--amber)' : 'rgba(255,255,255,.12)';
  });
  const icon = $('weaponIcon');
  icon.querySelectorAll('.accent').forEach((el) => { el.style.fill = `#${w.tint.toString(16).padStart(6, '0')}`; });
}

function updateAliveUI() {
  $('aliveCount').textContent = String(Math.max(0, game.aliveBots + (player.alive ? 1 : 0)));
}

function updateReloadUI() {
  if (player.reloading > 0) {
    $('reloadRing').classList.remove('hidden');
  } else {
    $('reloadRing').classList.add('hidden');
  }
}

function updateLootPrompt() {
  if (game.state !== 'playing' || !player.alive) {
    $('lootPrompt').classList.add('hidden');
    return;
  }
  let nearest = null;
  let nearestD = 2.6;
  for (const p of pickups) {
    if (p.taken) continue;
    const d = Math.hypot(p.mesh.position.x - player.pos.x, p.mesh.position.z - player.pos.z);
    if (d < nearestD) { nearestD = d; nearest = p; }
  }
  game.nearestPickup = nearest;
  if (!nearest) {
    $('lootPrompt').classList.add('hidden');
    return;
  }
  const verb = nearest.kind === 'weapon' ? 'EQUIP' : nearest.kind === 'health' ? 'USE' : nearest.kind === 'armor' ? 'EQUIP' : 'TAKE';
  const name = nearest.kind === 'weapon'
    ? WEAPONS[nearest.weaponKey].name
    : nearest.kind === 'health' ? 'MEDKIT' : nearest.kind === 'armor' ? 'BODY ARMOR' : 'AMMO CRATE';
  $('lootName').textContent = name;
  $('lootPrompt').querySelector('span').firstChild.textContent = isCoarse ? `${verb} ` : `${verb} `;
  $('lootPrompt').querySelector('b').textContent = isCoarse ? '↥' : 'E';
  $('lootPrompt').classList.remove('hidden');
}

function updateTags() {
  for (const bot of bots) {
    const tag = tagElements.get(bot);
    if (!tag) continue;
    if (!bot.alive || game.state !== 'playing') {
      tag.style.opacity = '0';
      continue;
    }
    const dist = Math.hypot(bot.pos.x - player.pos.x, bot.pos.z - player.pos.z);
    if (dist > 88) { tag.style.opacity = '0'; continue; }
    if (!bot._losAt || game.elapsed - bot._losAt > 0.2) {
      bot._losAt = game.elapsed;
      bot._los = !segmentBlocked(
        world.colliders,
        player.pos.x, player.pos.y + 1.6, player.pos.z,
        bot.pos.x, bot.pos.y + 1.6, bot.pos.z,
      );
    }
    if (!bot._los) { tag.style.opacity = '0'; continue; }
    tmpV.set(bot.pos.x, bot.pos.y + 2.04, bot.pos.z).project(camera);
    if (tmpV.z > 1 || Math.abs(tmpV.x) > 1.08 || Math.abs(tmpV.y) > 1.08) {
      tag.style.opacity = '0';
      continue;
    }
    tag.style.opacity = String(clamp(1.15 - dist / 100, 0.2, 0.92));
    tag.style.left = `${(tmpV.x * 0.5 + 0.5) * window.innerWidth}px`;
    tag.style.top = `${(-tmpV.y * 0.5 + 0.5) * window.innerHeight}px`;
    const hp = clamp(bot.hp / 100, 0, 1);
    tag.querySelector('.tag-hp i').style.width = `${hp * 100}%`;
  }
}

/* ---------------- storm ---------------- */

function updateZone(dt) {
  if (zone.phase < ZONE_PHASES.length) {
    zone.timer -= dt;
    if (!zone.shrinking) {
      if (zone.timer <= 0) {
        const phase = ZONE_PHASES[zone.phase];
        zone.startRadius = zone.radius;
        zone.startCenter.copy(zone.center);
        zone.targetRadius = phase.radius;
        const maxOffset = Math.max(0, zone.radius - phase.radius) * 0.68;
        const a = rand(0, Math.PI * 2);
        const off = rand(0, maxOffset);
        zone.targetCenter.set(
          zone.center.x + Math.cos(a) * off,
          0,
          zone.center.z + Math.sin(a) * off,
        );
        zone.shrinking = true;
        zone.shrinkDuration = phase.shrink;
        zone.timer = phase.shrink;
        audio.alert();
        announce('RESTRICTED AREA', 'THE PLAY ZONE IS CLOSING');
        $('zoneWarning').classList.add('show');
      }
    } else {
      const t = clamp(1 - zone.timer / Math.max(0.01, zone.shrinkDuration), 0, 1);
      const eased = t * t * (3 - 2 * t);
      zone.radius = lerp(zone.startRadius, zone.targetRadius, eased);
      zone.center.lerpVectors(zone.startCenter, zone.targetCenter, eased);
      if (zone.timer <= 0) {
        zone.radius = zone.targetRadius;
        zone.center.copy(zone.targetCenter);
        zone.shrinking = false;
        zone.phase++;
        if (zone.phase < ZONE_PHASES.length) {
          zone.timer = ZONE_PHASES[zone.phase].wait;
        } else {
          zone.timer = 999;
        }
      }
    }
  }
  setZoneVisual();

  const dist = Math.hypot(player.pos.x - zone.center.x, player.pos.z - zone.center.z);
  const outside = dist > zone.radius;
  if (outside && player.alive) {
    const dps = 4.4 + zone.phase * 1.5;
    player.health -= dps * dt;
    setDamageVignette(Math.max(player.damageFlash, 0.42));
    player.shake = Math.max(player.shake, 0.18);
    if (player.health <= 0) {
      player.health = 0;
      updateHealthUI();
      playerDie('THE STORM');
    } else {
      updateHealthUI();
    }
  }
  $('zoneWarning').classList.toggle('show', outside && player.alive && game.state === 'playing');

  const remain = Math.max(0, Math.ceil(zone.timer));
  const mm = String(Math.floor(remain / 60)).padStart(2, '0');
  const ss = String(remain % 60).padStart(2, '0');
  $('zoneTimer').textContent = `${mm}:${ss}`;
}

/* ---------------- effects ---------------- */

const tracerGeo = new THREE.CylinderGeometry(1, 1, 1, 4, 1, true);
const sparkGeo = new THREE.SphereGeometry(0.035, 3, 2);
const sparkMats = new Map();

function sparkMaterial(color) {
  if (!sparkMats.has(color)) {
    sparkMats.set(color, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }));
  }
  return sparkMats.get(color);
}

function spawnTracer(from, to, color, radius = 0.016, life = 0.08) {
  const delta = new THREE.Vector3().subVectors(to, from);
  const len = delta.length();
  if (len < 0.02) return;
  const mat = new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending,
    depthWrite: false, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(tracerGeo, mat);
  mesh.position.copy(from).addScaledVector(delta, 0.5);
  mesh.quaternion.setFromUnitVectors(UP, delta.normalize());
  mesh.scale.set(radius, len, radius);
  mesh.renderOrder = 3;
  scene.add(mesh);
  tracers.push({ mesh, material: mat, life, maxLife: life });
  if (tracers.length > 90) {
    const old = tracers.shift();
    scene.remove(old.mesh);
    old.material.dispose();
  }
}

function spawnSparks(pos, color, count) {
  const mat = sparkMaterial(color);
  for (let i = 0; i < count; i++) {
    const mesh = new THREE.Mesh(sparkGeo, mat);
    mesh.position.copy(pos);
    mesh.scale.setScalar(rand(0.6, 1.3));
    scene.add(mesh);
    sparks.push({
      mesh,
      vel: new THREE.Vector3(rand(-3.2, 3.2), rand(0.4, 4.2), rand(-3.2, 3.2)),
      life: rand(0.25, 0.55),
      maxLife: 0.55,
    });
  }
  if (sparks.length > 220) {
    const remove = sparks.splice(0, sparks.length - 220);
    for (const s of remove) scene.remove(s.mesh);
  }
}

function updateEffects(dt) {
  for (let i = tracers.length - 1; i >= 0; i--) {
    const t = tracers[i];
    t.life -= dt;
    t.material.opacity = Math.max(0, t.life / t.maxLife) * 0.9;
    if (t.life <= 0) {
      scene.remove(t.mesh);
      t.material.dispose();
      tracers.splice(i, 1);
    }
  }
  for (let i = sparks.length - 1; i >= 0; i--) {
    const s = sparks[i];
    s.life -= dt;
    s.vel.y -= 9.5 * dt;
    s.mesh.position.addScaledVector(s.vel, dt);
    s.mesh.scale.multiplyScalar(1 - dt * 1.8);
    if (s.life <= 0) {
      scene.remove(s.mesh);
      sparks.splice(i, 1);
    }
  }
}

function updatePickups(dt) {
  for (const p of pickups) {
    if (p.taken) continue;
    p.phase += dt;
    p.mesh.position.y = p.baseY + Math.sin(p.phase * 2.1) * 0.09;
    p.mesh.rotation.y += dt * 0.9;
  }
}

/* ---------------- main update ---------------- */

function updateGame(dt, now) {
  game.matchTime += dt;
  if (player.alive) updatePlayer(dt, now);
  updateZone(dt);

  for (const bot of bots) updateBot(bot, dt, now);
  updatePickups(dt);
  updateEffects(dt);
  updateCamera(dt);
  updateLootPrompt();
  updateTags();
  updateMinimap();
  updateCompass();
  updateAliveUI();
  updateReloadUI();

  if (game.victoryTimer >= 0 && player.alive) {
    game.victoryTimer -= dt;
    if (game.victoryTimer <= 0) {
      game.victoryTimer = -1;
      finishMatch(true);
      return;
    }
  }
  if (game.pendingEnd) {
    game.endDelay -= dt;
    if (game.endDelay <= 0) {
      game.pendingEnd = false;
      finishMatch(false);
    }
  }
}

/* ---------------- cinematic lobby camera ---------------- */

function updateLobbyCamera(dt) {
  game.lobbyAngle += dt * 0.035;
  const a = game.lobbyAngle;
  camera.position.set(Math.cos(a) * 104, 34 + Math.sin(a * 0.7) * 4, Math.sin(a) * 104);
  camera.lookAt(0, 3.5, 0);
  camera.fov = damp(camera.fov, 58, 2, dt);
  camera.updateProjectionMatrix();
  if (viewModel) viewModel.visible = false;
}

function updateEndedCamera(dt) {
  camera.fov = damp(camera.fov, 76, 3, dt);
  camera.updateProjectionMatrix();
  if (viewModel) viewModel.visible = false;
  player.damageFlash = Math.max(0, player.damageFlash - dt * 2);
  $('damageVignette').style.opacity = String(player.damageFlash);
}

/* ---------------- boot & loop ---------------- */

const clock = { last: performance.now(), elapsed: 0 };
let bootRemoved = false;

function removeBoot() {
  if (bootRemoved) return;
  bootRemoved = true;
  const boot = $('boot');
  boot.classList.add('gone');
  setTimeout(() => boot.remove(), 650);
}

setTimeout(removeBoot, 1000);

function frame(now) {
  const dt = Math.min(0.05, Math.max(0.0001, (now - clock.last) / 1000));
  clock.last = now;
  clock.elapsed += dt;
  game.elapsed = clock.elapsed;
  world.update(dt, clock.elapsed);

  if (game.state === 'playing') {
    updateGame(dt, now / 1000);
  } else if (game.state === 'lobby') {
    updateLobbyCamera(dt);
  } else if (game.state === 'ended') {
    updateEndedCamera(dt);
    updateEffects(dt);
  }

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

/* ---------------- debug hooks (useful for automated smoke tests) ---------------- */

window.__FF3D = {
  get state() { return game.state; },
  get player() { return player; },
  get bots() { return bots; },
  get zone() { return zone; },
  world,
  start: startMatch,
  finish: finishMatch,
  teleport(x, z, yaw = player.yaw) {
    player.pos.set(x, terrainHeight(x, z), z);
    player.yaw = yaw;
    player.vel.set(0, 0, 0);
  },
  face(yaw, pitch = 0) {
    player.yaw = yaw;
    player.pitch = pitch;
  },
  input,
  fire(ms = 350) {
    input.firing = true;
    player.firing = true;
    player.semiLatch = false;
    setTimeout(() => { input.firing = false; player.firing = false; }, ms);
  },
  aimAtBot(index = 0) {
    const bot = bots.filter((b) => b.alive)[index];
    if (!bot) return null;
    const dx = bot.pos.x - player.pos.x;
    const dz = bot.pos.z - player.pos.z;
    const dist = Math.hypot(dx, dz);
    player.yaw = Math.atan2(-dx, -dz);
    player.pitch = Math.atan2((bot.pos.y + 1.25) - (player.pos.y + 1.72), dist);
    return { name: bot.name, dist };
  },
  eliminateAll() {
    for (const bot of bots) if (bot.alive) killBot(bot, 'player', 'rifle');
  },
  setHealth(hp, armor) {
    player.health = hp;
    if (typeof armor === 'number') player.armor = armor;
    updateHealthUI();
  },
  get stats() {
    return {
      state: game.state, alive: game.aliveBots, kills: player.kills,
      hp: player.health, armor: player.armor, position: player.pos.toArray(),
      phase: zone.phase, radius: zone.radius,
    };
  },
};



