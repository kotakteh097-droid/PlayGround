import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { clamp, damp, lerp, rand } from './utils.js';

export const AGENTS = [
  {
    id: 'alok',
    name: 'ALOK',
    role: 'DJ / SPEED',
    bio: 'Drop the beat, outrun the storm. ALOK moves faster after every takedown.',
    skin: 0x9a5b3b,
    jacket: 0x11a6b4,
    jacketDark: 0x08717f,
    pants: 0x151b22,
    accent: 0xff7a18,
    hair: 0x171310,
    shoe: 0xf2f0e8,
    speed: '+6%',
    armor: '+10%',
    reload: '+5%',
    style: 'headphones',
  },
  {
    id: 'kelly',
    name: 'KELLY',
    role: 'TRACKSTAR',
    bio: 'Fastest feet on Bermuda. KELLY hits sprint speed before the first shot lands.',
    skin: 0xe0a477,
    jacket: 0xffc93c,
    jacketDark: 0xc58b08,
    pants: 0x223c72,
    accent: 0x5de4ff,
    hair: 0xf4cf67,
    shoe: 0x13263c,
    speed: '+10%',
    armor: '+4%',
    reload: '+3%',
    style: 'ponytail',
  },
  {
    id: 'hayato',
    name: 'HAYATO',
    role: 'BLADE / ARMOR',
    bio: 'A disciplined shadow. HAYATO takes less damage when the fight gets close.',
    skin: 0xd8a26f,
    jacket: 0x9e1f2e,
    jacketDark: 0x59111c,
    pants: 0x1a1a21,
    accent: 0xf3e9d2,
    hair: 0xf1eee3,
    shoe: 0x2b2b30,
    speed: '+3%',
    armor: '+14%',
    reload: '+2%',
    style: 'headband',
  },
];

const BOT_NAMES = ['VIPER', 'DRIFT', 'NOVA', 'RAZOR', 'MAKO', 'GHOST', 'BLAZE', 'ONYX', 'SABLE', 'ROOK', 'JINX'];
const BOT_PALETTES = [
  [0x3c4a5b, 0x222b36, 0xff4d3d], [0x5b3b78, 0x2b1d3c, 0xe2b73a], [0x2e5c3f, 0x1a3426, 0xf0772d],
  [0x7a3228, 0x3d1713, 0x6ce1ff], [0x4e4e54, 0x222226, 0xa6ff42], [0x245a74, 0x112c3b, 0xffc857],
  [0x826100, 0x3f2f00, 0xff6565], [0x334a2a, 0x1b2914, 0xff9f1c],
];

const mat = (color, { rough = 0.78, metal = 0.02, emissive = 0x000000, emissiveIntensity = 0 } = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, flatShading: true, emissive, emissiveIntensity });

const box = (w, h, d, material, radius = 0.035) => {
  const geo = radius > 0 ? new RoundedBoxGeometry(w, h, d, 2, radius) : new THREE.BoxGeometry(w, h, d);
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
};

const cyl = (rt, rb, h, material, seg = 8) => {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
};

function createGun(type = 'rifle') {
  const g = new THREE.Group();
  const dark = mat(0x1c2026, { rough: 0.5, metal: 0.72 });
  const mid = mat(0x343b45, { rough: 0.45, metal: 0.55 });
  const accent = mat(type === 'sniper' ? 0x56d9ff : 0xff7a18, { emissive: type === 'sniper' ? 0x1d95be : 0xb23c08, emissiveIntensity: 0.55 });
  const grip = mat(0x111419, { rough: 0.9 });

  const body = box(0.085, 0.12, 0.43, dark, 0.018);
  body.position.set(0, 0, 0);
  g.add(body);

  const upper = box(0.065, 0.07, 0.3, mid, 0.012);
  upper.position.set(0, 0.08, -0.06);
  g.add(upper);

  const barrelLen = type === 'smg' ? 0.25 : type === 'shotgun' ? 0.48 : type === 'sniper' ? 0.56 : 0.4;
  const barrel = cyl(0.021, 0.026, barrelLen, mid, 8);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.055, -0.21 - barrelLen / 2);
  g.add(barrel);

  // Muzzle device.
  const muzzle = cyl(0.03, 0.028, 0.075, dark, 8);
  muzzle.rotation.x = Math.PI / 2;
  muzzle.position.set(0, 0.055, -0.21 - barrelLen - 0.025);
  g.add(muzzle);

  // Handguard.
  const guard = box(0.075, 0.07, type === 'shotgun' ? 0.28 : 0.24, grip, 0.015);
  guard.position.set(0, 0.02, -0.28);
  g.add(guard);

  // Magazine.
  const mag = box(0.052, 0.19, 0.1, dark, 0.012);
  mag.position.set(0, -0.13, -0.025);
  mag.rotation.x = -0.18;
  g.add(mag);

  // Grip.
  const handle = box(0.052, 0.16, 0.065, grip, 0.014);
  handle.position.set(0, -0.115, 0.13);
  handle.rotation.x = -0.22;
  g.add(handle);

  // Stock.
  if (type !== 'smg') {
    const stock = box(0.072, 0.09, 0.2, mid, 0.02);
    stock.position.set(0, 0.01, 0.29);
    g.add(stock);
  }

  // Scope.
  if (type === 'sniper' || type === 'rifle') {
    const scope = cyl(0.035, 0.035, 0.16, dark, 10);
    scope.rotation.x = Math.PI / 2;
    scope.position.set(0, 0.16, -0.04);
    g.add(scope);
    const lensF = cyl(0.03, 0.03, 0.012, accent, 10);
    lensF.rotation.x = Math.PI / 2;
    lensF.position.set(0, 0.16, -0.125);
    g.add(lensF);
    const mount = box(0.022, 0.055, 0.055, dark, 0.006);
    mount.position.set(0, 0.115, -0.04);
    g.add(mount);
  }

  if (type === 'shotgun') {
    const pump = box(0.09, 0.075, 0.18, grip, 0.015);
    pump.position.set(0, -0.01, -0.3);
    g.add(pump);
  }

  const stripe = box(0.004, 0.036, 0.19, accent, 0.002);
  stripe.position.set(0.046, 0.03, -0.02);
  g.add(stripe);

  // Muzzle anchor and flash.
  const anchor = new THREE.Object3D();
  anchor.position.set(0, 0.055, -0.21 - barrelLen - 0.06);
  g.add(anchor);

  const flashMat = new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending });
  const flash = new THREE.Group();
  for (let i = 0; i < 2; i++) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.11), flashMat.clone());
    p.rotation.z = i * Math.PI / 2;
    flash.add(p);
  }
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 6), new THREE.MeshBasicMaterial({ color: 0xfff2c4 }));
  flash.add(core);
  flash.position.copy(anchor.position);
  flash.visible = false;
  g.add(flash);

  g.userData = { type, muzzle: anchor, flash, flashMat, basePos: new THREE.Vector3() };
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

export class Agent {
  constructor({ colors, style = 'headphones', agentData = null, isBot = false, name = 'PLAYER' } = {}) {
    this.isBot = isBot;
    this.name = name;
    this.agentData = agentData;
    const c = agentData || {
      skin: colors?.skin ?? 0xb87b54,
      jacket: colors?.jacket ?? 0x267f91,
      jacketDark: colors?.jacketDark ?? 0x17525e,
      pants: colors?.pants ?? 0x1a2028,
      accent: colors?.accent ?? 0xff7a18,
      hair: colors?.hair ?? 0x171310,
      shoe: colors?.shoe ?? 0xefece4,
      style,
    };
    this.colors = c;
    this.style = c.style || style;

    this.root = new THREE.Group();
    this.visual = new THREE.Group();
    this.root.add(this.visual);
    this.visual.rotation.y = 0;
    this.materials = [];

    const skin = this._material(c.skin, { rough: 0.85 });
    const jacket = this._material(c.jacket, { rough: 0.72 });
    const jacketDark = this._material(c.jacketDark, { rough: 0.8 });
    const pants = this._material(c.pants, { rough: 0.9 });
    const accent = this._material(c.accent, { rough: 0.55, emissive: c.accent, emissiveIntensity: 0.08 });
    const hair = this._material(c.hair, { rough: 0.95 });
    const shoe = this._material(c.shoe, { rough: 0.75 });
    const white = this._material(0xf2eee4, { rough: 0.7 });

    // Hips and torso.
    this.body = new THREE.Group();
    this.visual.add(this.body);
    const hips = box(0.38, 0.2, 0.25, pants, 0.06);
    hips.position.y = 0.99;
    this.body.add(hips);

    const torso = box(0.48, 0.52, 0.28, jacket, 0.08);
    torso.position.set(0, 1.31, 0);
    this.body.add(torso);

    const plate = box(0.37, 0.36, 0.07, jacketDark, 0.04);
    plate.position.set(0, 1.33, -0.155);
    this.body.add(plate);

    const chestStripe = box(0.15, 0.045, 0.015, accent, 0.005);
    chestStripe.position.set(-0.11, 1.45, -0.195);
    this.body.add(chestStripe);

    const belt = box(0.41, 0.065, 0.27, hair, 0.02);
    belt.position.set(0, 1.05, 0);
    this.body.add(belt);

    const buckle = box(0.07, 0.055, 0.02, accent, 0.01);
    buckle.position.set(0, 1.05, -0.145);
    this.body.add(buckle);

    // Backpack.
    const pack = box(0.34, 0.4, 0.2, jacketDark, 0.06);
    pack.position.set(0, 1.33, 0.22);
    this.body.add(pack);
    const packPocket = box(0.24, 0.17, 0.06, pants, 0.03);
    packPocket.position.set(0, 1.28, 0.33);
    this.body.add(packPocket);
    const packStrap = box(0.04, 0.34, 0.018, accent, 0.003);
    packStrap.position.set(-0.06, 1.34, 0.365);
    this.body.add(packStrap);

    // Neck and head.
    const neck = cyl(0.075, 0.085, 0.1, skin, 8);
    neck.position.y = 1.59;
    this.body.add(neck);

    this.head = new THREE.Group();
    this.head.position.y = 1.72;
    this.body.add(this.head);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.185, 12, 10), skin);
    skull.scale.set(0.95, 1.08, 0.94);
    skull.castShadow = true;
    this.head.add(skull);

    // Face details.
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x121317 });
    for (const sx of [-0.065, 0.065]) {
      const eye = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.018, 0.012), eyeMat);
      eye.position.set(sx, 0.035, -0.174);
      this.head.add(eye);
    }
    const brow = box(0.17, 0.018, 0.02, hair, 0.004);
    brow.position.set(0, 0.083, -0.175);
    this.head.add(brow);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.055, 4), skin);
    nose.rotation.x = -Math.PI / 2;
    nose.position.set(0, -0.005, -0.185);
    this.head.add(nose);
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.012, 0.01), mat(0x5b3029));
    mouth.position.set(0, -0.075, -0.176);
    this.head.add(mouth);

    // Hair cap and style.
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.192, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.58), hair);
    cap.position.y = 0.027;
    cap.castShadow = true;
    this.head.add(cap);

    if (this.style === 'headphones') {
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.205, 0.018, 6, 14, Math.PI), accent);
      band.rotation.z = Math.PI;
      band.position.y = 0.04;
      this.head.add(band);
      for (const sx of [-0.19, 0.19]) {
        const cup = cyl(0.065, 0.065, 0.055, jacketDark, 10);
        cup.rotation.z = Math.PI / 2;
        cup.position.set(sx, -0.015, 0);
        this.head.add(cup);
        const cupFace = cyl(0.046, 0.046, 0.058, accent, 10);
        cupFace.rotation.z = Math.PI / 2;
        cupFace.position.set(sx * 1.03, -0.015, 0);
        this.head.add(cupFace);
      }
      const mic = box(0.018, 0.13, 0.018, hair, 0.005);
      mic.position.set(-0.19, -0.08, -0.09);
      mic.rotation.x = 0.4;
      this.head.add(mic);
    } else if (this.style === 'ponytail') {
      const tail = box(0.16, 0.3, 0.14, hair, 0.06);
      tail.position.set(0, -0.11, 0.2);
      tail.rotation.x = 0.25;
      this.head.add(tail);
      const bandHair = box(0.23, 0.055, 0.18, accent, 0.025);
      bandHair.position.set(0, 0.15, 0.03);
      this.head.add(bandHair);
      const visor = box(0.24, 0.022, 0.09, white, 0.01);
      visor.position.set(0, 0.18, -0.14);
      this.head.add(visor);
    } else if (this.style === 'headband') {
      const band = box(0.39, 0.07, 0.39, accent, 0.02);
      band.position.set(0, 0.08, 0);
      this.head.add(band);
      const knot = box(0.08, 0.12, 0.04, accent, 0.015);
      knot.position.set(0, 0.05, 0.21);
      this.head.add(knot);
      const mask = box(0.27, 0.19, 0.05, jacketDark, 0.04);
      mask.position.set(0, -0.06, -0.17);
      this.head.add(mask);
      const blade = box(0.02, 1.05, 0.06, white, 0.006);
      blade.position.set(0.18, 1.15, 0.3);
      blade.rotation.z = -0.28;
      blade.rotation.x = 0.2;
      this.body.add(blade);
      const hilt = cyl(0.035, 0.035, 0.25, hair, 6);
      hilt.position.set(0.33, 1.62, 0.35);
      hilt.rotation.z = -0.28;
      this.body.add(hilt);
    }

    // Arms.
    this.leftArm = new THREE.Group();
    this.leftArm.position.set(0.31, 1.49, 0);
    this.body.add(this.leftArm);
    this.rightArm = new THREE.Group();
    this.rightArm.position.set(-0.31, 1.49, 0);
    this.body.add(this.rightArm);

    for (const [arm, side] of [[this.leftArm, 1], [this.rightArm, -1]]) {
      const upper = box(0.13, 0.31, 0.14, jacket, 0.04);
      upper.position.y = -0.15;
      arm.add(upper);
      const elbow = new THREE.Group();
      elbow.position.y = -0.3;
      arm.add(elbow);
      const fore = box(0.115, 0.28, 0.12, jacketDark, 0.035);
      fore.position.y = -0.13;
      elbow.add(fore);
      const hand = box(0.1, 0.1, 0.11, skin, 0.03);
      hand.position.y = -0.31;
      elbow.add(hand);
      arm.userData.elbow = elbow;
      arm.userData.side = side;
    }

    // Legs.
    this.leftLeg = new THREE.Group();
    this.leftLeg.position.set(0.125, 0.96, 0);
    this.visual.add(this.leftLeg);
    this.rightLeg = new THREE.Group();
    this.rightLeg.position.set(-0.125, 0.96, 0);
    this.visual.add(this.rightLeg);
    for (const leg of [this.leftLeg, this.rightLeg]) {
      const thigh = box(0.17, 0.43, 0.19, pants, 0.05);
      thigh.position.y = -0.2;
      leg.add(thigh);
      const shin = box(0.145, 0.38, 0.16, pants, 0.04);
      shin.position.y = -0.6;
      leg.add(shin);
      const boot = box(0.165, 0.14, 0.27, shoe, 0.035);
      boot.position.set(0, -0.82, -0.045);
      leg.add(boot);
      const strap = box(0.17, 0.03, 0.05, accent, 0.005);
      strap.position.set(0, -0.69, -0.1);
      leg.add(strap);
    }

    // Shoulder pads.
    for (const sx of [-0.34, 0.34]) {
      const pad = box(0.17, 0.12, 0.21, jacketDark, 0.04);
      pad.position.set(sx, 1.5, 0);
      this.body.add(pad);
    }

    // Weapon.
    this.weaponAnchor = new THREE.Group();
    this.weaponAnchor.position.set(0.18, 1.25, -0.26);
    this.body.add(this.weaponAnchor);
    this.weapon = createGun('rifle');
    this.weaponAnchor.add(this.weapon);
    this.weaponType = 'rifle';

    this.walkPhase = Math.random() * Math.PI * 2;
    this.recoil = 0;
    this.flashTime = 0;
    this.hitFlash = 0;
    this.dead = false;
    this.deathTime = 0;
    this.aiming = false;
    this.reloadAnim = 0;
    this.speedFactor = 0;
    this.grounded = true;
    this.time = rand(0, 10);

    this.root.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
  }

  _material(color, opts = {}) {
    const m = new THREE.MeshStandardMaterial({
      color,
      roughness: opts.rough ?? 0.8,
      metalness: opts.metal ?? 0.02,
      flatShading: true,
      emissive: opts.emissive ?? 0x000000,
      emissiveIntensity: opts.emissiveIntensity ?? 0,
    });
    this.materials.push(m);
    return m;
  }

  get position() { return this.root.position; }

  setWeapon(type) {
    if (this.weaponType === type) return;
    this.weaponType = type;
    this.weaponAnchor.remove(this.weapon);
    const old = this.weapon;
    old.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
    });
    this.weapon = createGun(type);
    this.weaponAnchor.add(this.weapon);
  }

  shootEffect() {
    this.recoil = 1;
    this.flashTime = 0.055;
    const flash = this.weapon.userData.flash;
    flash.visible = true;
    flash.rotation.z = Math.random() * Math.PI;
    flash.scale.setScalar(rand(0.7, 1.2));
  }

  flashHit() { this.hitFlash = 0.11; }

  die() {
    if (this.dead) return;
    this.dead = true;
    this.deathTime = 0;
  }

  update(dt, { speed = 0, aiming = false, reloading = false, grounded = true } = {}) {
    this.time += dt;
    this.aiming = aiming;
    this.speedFactor = damp(this.speedFactor, Math.min(1, speed / 7), 12, dt);
    this.recoil = Math.max(0, this.recoil - dt * 13);
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    if (this.flashTime > 0) {
      this.flashTime -= dt;
      if (this.flashTime <= 0) this.weapon.userData.flash.visible = false;
    }
    this.reloadAnim = damp(this.reloadAnim, reloading ? 1 : 0, 9, dt);

    if (this.dead) {
      this.deathTime += dt;
      const t = clamp(this.deathTime / 0.65, 0, 1);
      const e = 1 - Math.pow(1 - t, 3);
      this.visual.rotation.z = -e * Math.PI * 0.48;
      this.visual.position.y = -e * 0.2;
      this.visual.rotation.y = e * 0.45;
      if (this.deathTime > 6) this.root.visible = false;
      return;
    }

    const moving = this.speedFactor > 0.03;
    if (moving) this.walkPhase += dt * (5.2 + speed * 0.9);
    const swing = Math.sin(this.walkPhase) * 0.62 * this.speedFactor;
    const swing2 = Math.sin(this.walkPhase + Math.PI) * 0.62 * this.speedFactor;

    this.leftLeg.rotation.x = swing;
    this.rightLeg.rotation.x = swing2;
    this.leftLeg.rotation.z = 0.02;
    this.rightLeg.rotation.z = -0.02;

    const bob = Math.abs(Math.sin(this.walkPhase)) * 0.035 * this.speedFactor;
    this.body.position.y = bob + Math.sin(this.time * 1.6) * 0.006;
    this.body.rotation.z = Math.sin(this.walkPhase) * 0.03 * this.speedFactor;

    // Aim pose blends toward a shouldered rifle stance.
    const aimBlend = aiming ? 1 : 0;
    const baseRight = -0.15 + swing2 * 0.25;
    const baseLeft = 0.08 + swing * 0.28;
    this.rightArm.rotation.x = lerp(baseRight, -1.3, aimBlend);
    this.rightArm.rotation.z = lerp(-0.08, -0.24, aimBlend);
    this.leftArm.rotation.x = lerp(baseLeft, -1.46, aimBlend);
    this.leftArm.rotation.z = lerp(0.08, 0.48, aimBlend);
    this.rightArm.userData.elbow.rotation.x = lerp(-0.12, -0.32, aimBlend);
    this.leftArm.userData.elbow.rotation.x = lerp(-0.15, -0.8, aimBlend);

    const reloadKick = Math.sin(this.reloadAnim * Math.PI) * 0.35;
    this.body.rotation.x = -0.02 + reloadKick * 0.1;
    this.weaponAnchor.position.set(0.17, 1.27 - reloadKick * 0.12, -0.3 + this.recoil * 0.075);
    this.weaponAnchor.rotation.x = lerp(-0.02, 0.06, aimBlend) + reloadKick * 0.22;
    this.weaponAnchor.rotation.z = lerp(0.03, -0.02, aimBlend);
    this.weaponAnchor.rotation.y = lerp(-0.03, 0.02, aimBlend);

    if (this.hitFlash > 0) {
      for (const m of this.materials) {
        m.emissive.setHex(0xff2d44);
        m.emissiveIntensity = this.hitFlash * 5.5;
      }
    } else {
      for (const m of this.materials) {
        m.emissiveIntensity = 0;
      }
    }
  }
}

export function createAgent(opts) {
  return new Agent(opts);
}

export function randomBotAgent(i, name) {
  const p = BOT_PALETTES[i % BOT_PALETTES.length];
  return new Agent({
    isBot: true,
    name,
    colors: {
      skin: [0x9a5b3b, 0xd8a26f, 0x6e402b, 0xc58b63][i % 4],
      jacket: p[0],
      jacketDark: p[1],
      pants: 0x181b20,
      accent: p[2],
      hair: [0x171310, 0x2e1b12, 0xe6dfce, 0x3b3330][i % 4],
      shoe: 0x16191e,
    },
    style: ['headphones', 'ponytail', 'headband'][i % 3],
  });
}

export function getBotName(i) {
  return BOT_NAMES[i % BOT_NAMES.length];
}
