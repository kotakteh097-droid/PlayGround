import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clamp, rand, smoothstep, noiseTexture } from './utils.js';

export const PLAY_RADIUS = 82;
export const ISLAND_RADIUS = 80;

/** Rolling island height field. Sea level is y = 0. */
export function terrainHeight(x, z) {
  const d = Math.hypot(x, z);
  const e = smoothstep(ISLAND_RADIUS + 16, ISLAND_RADIUS - 26, d);
  const ridge =
    Math.sin(x * 0.073 + 1.3) * Math.cos(z * 0.087 - 0.8) * 0.95 +
    Math.sin((x + z) * 0.036 + 0.6) * 0.55 +
    Math.cos(x * 0.021 - z * 0.027) * 0.35;
  return -2.7 + e * 5.25 + ridge * e + Math.exp(-(d * d) / (2 * 30 * 30)) * 0.35;
}

const MAT = {
  concrete: new THREE.MeshStandardMaterial({ color: 0x7d817d, roughness: 0.94, metalness: 0.04, flatShading: true }),
  concreteDark: new THREE.MeshStandardMaterial({ color: 0x4d5353, roughness: 0.96, metalness: 0.03, flatShading: true }),
  metal: new THREE.MeshStandardMaterial({ color: 0x5c6670, roughness: 0.62, metalness: 0.42, flatShading: true }),
  rust: new THREE.MeshStandardMaterial({ color: 0x8d4c2f, roughness: 0.92, metalness: 0.12, flatShading: true }),
  olive: new THREE.MeshStandardMaterial({ color: 0x5c663b, roughness: 0.9, flatShading: true }),
  wood: new THREE.MeshStandardMaterial({ color: 0x76543a, roughness: 0.95, flatShading: true }),
  dark: new THREE.MeshStandardMaterial({ color: 0x242a2b, roughness: 0.86, flatShading: true }),
  glass: new THREE.MeshStandardMaterial({ color: 0x244454, roughness: 0.18, metalness: 0.55, emissive: 0x163542, emissiveIntensity: 0.7 }),
  glow: new THREE.MeshStandardMaterial({ color: 0xffb347, roughness: 0.5, emissive: 0xff7a18, emissiveIntensity: 0.7 }),
  sand: new THREE.MeshStandardMaterial({ color: 0xc6b081, roughness: 1, flatShading: true }),
};

function mesh(geometry, material, cast = true, receive = true) {
  const m = new THREE.Mesh(geometry, material);
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

function addBoxCollider(colliders, cx, cz, w, d, baseY, h, tag = 'solid') {
  colliders.push({
    kind: 'box',
    minX: cx - w / 2,
    maxX: cx + w / 2,
    minZ: cz - d / 2,
    maxZ: cz + d / 2,
    minY: baseY,
    maxY: baseY + h,
    tag,
  });
}

function addCircleCollider(colliders, x, z, r, baseY, h, tag = 'solid') {
  colliders.push({ kind: 'circle', x, z, r, minY: baseY, maxY: baseY + h, tag });
}

function box(scene, colliders, cx, cy, cz, w, h, d, material, { cast = true, collide = true, tag = 'solid' } = {}) {
  const m = mesh(new THREE.BoxGeometry(w, h, d), material, cast, true);
  m.position.set(cx, cy, cz);
  scene.add(m);
  if (collide) addBoxCollider(colliders, cx, cz, w, d, cy - h / 2, h, tag);
  return m;
}

function createBuilding(scene, colliders, buildings, lootSpots, def) {
  const { x, z, w, d, h, style = 'warehouse' } = def;
  const ground = terrainHeight(x, z);
  const group = new THREE.Group();
  group.position.set(x, ground, z);
  scene.add(group);

  // Concrete foundation.
  const pad = mesh(new THREE.BoxGeometry(w + 1.8, 0.22, d + 1.8), MAT.concreteDark);
  pad.position.y = 0.11;
  pad.receiveShadow = true;
  group.add(pad);

  const wallT = 0.34;
  const baseY = ground;
  const wall = (wx, wz, ww, dd) => {
    const m = mesh(new THREE.BoxGeometry(ww, h, dd), MAT.concrete);
    m.position.set(wx, h / 2, wz);
    group.add(m);
    addBoxCollider(colliders, x + wx, z + wz, ww, dd, baseY, h, 'wall');
    // Weathered lower band.
    const band = mesh(new THREE.BoxGeometry(ww + 0.02, 0.55, dd + 0.02), MAT.concreteDark);
    band.position.set(wx, 0.42, wz);
    group.add(band);
  };

  // Back and side walls.
  wall(0, -d / 2, w, wallT);
  wall(-w / 2, 0, wallT, d);
  wall(w / 2, 0, wallT, d);

  // Front wall with a doorway.
  const door = 3.0;
  const seg = (w - door) / 2;
  wall(-(door / 2 + seg / 2), d / 2, seg, wallT);
  wall(door / 2 + seg / 2, d / 2, seg, wallT);
  // Lintel above door.
  const lintel = mesh(new THREE.BoxGeometry(door, h - 2.7, wallT), MAT.concrete);
  lintel.position.set(0, 2.7 + (h - 2.7) / 2, d / 2);
  group.add(lintel);
  addBoxCollider(colliders, x, z + d / 2, door, wallT, baseY + 2.7, h - 2.7, 'wall');

  // Roof.
  const roof = mesh(new THREE.BoxGeometry(w + 0.9, 0.32, d + 0.9), style === 'ruin' ? MAT.rust : MAT.metal);
  roof.position.y = h + 0.16;
  group.add(roof);
  const rim = mesh(new THREE.BoxGeometry(w + 1.1, 0.18, d + 1.1), MAT.dark);
  rim.position.y = h + 0.36;
  group.add(rim);

  // Windows / emissive strips.
  const winMat = MAT.glass;
  const wins = style === 'ruin' ? 1 : 3;
  for (let i = 0; i < wins; i++) {
    const wx = -w / 4 + (i % 2) * (w / 2);
    const wz = -d / 2 + 0.19;
    const win = mesh(new THREE.BoxGeometry(1.45, 0.85, 0.08), winMat, false, false);
    win.position.set(wx, 2.15, wz);
    group.add(win);
    const glow = mesh(new THREE.BoxGeometry(1.7, 1.05, 0.04), new THREE.MeshBasicMaterial({ color: 0x5de4ff, transparent: true, opacity: 0.18, depthWrite: false }), false, false);
    glow.position.set(wx, 2.15, wz + 0.03);
    group.add(glow);
  }

  // Roof vents and antenna.
  for (let i = 0; i < 2; i++) {
    const vent = mesh(new THREE.BoxGeometry(1.1, 0.65, 1.0), MAT.metal);
    vent.position.set(-w * 0.22 + i * 2.4, h + 0.65, -d * 0.15);
    group.add(vent);
  }
  const antenna = mesh(new THREE.CylinderGeometry(0.03, 0.05, 3.1, 5), MAT.dark);
  antenna.position.set(w * 0.30, h + 1.6, d * 0.25);
  group.add(antenna);
  const beacon = mesh(new THREE.SphereGeometry(0.11, 6, 5), MAT.glow, false, false);
  beacon.position.set(w * 0.30, h + 3.2, d * 0.25);
  group.add(beacon);

  // Interior cover crates and loot points.
  if (style !== 'ruin') {
    const crate1 = mesh(new THREE.BoxGeometry(1.35, 1.35, 1.35), MAT.wood);
    crate1.position.set(-w * 0.24, 0.75, -d * 0.15);
    group.add(crate1);
    addBoxCollider(colliders, x - w * 0.24, z - d * 0.15, 1.35, 1.35, ground, 1.35, 'crate');
    const crate2 = mesh(new THREE.BoxGeometry(0.95, 0.95, 0.95), MAT.olive);
    crate2.position.set(w * 0.27, 0.55, d * 0.03);
    group.add(crate2);
    addBoxCollider(colliders, x + w * 0.27, z + d * 0.03, 0.95, 0.95, ground, 0.95, 'crate');
    lootSpots.push({ x: x - w * 0.22, z: z + d * 0.20, kind: 'weapon' });
    lootSpots.push({ x: x + w * 0.25, z: z - d * 0.25, kind: Math.random() > 0.5 ? 'armor' : 'health' });
    lootSpots.push({ x: x, z: z + d * 0.12, kind: 'ammo' });
  } else {
    lootSpots.push({ x: x, z: z - d * 0.18, kind: 'weapon' });
  }

  buildings.push({ x, z, w, d, h, style });
  return { group, ground };
}

function createTree(scene, colliders, x, z, pine, scale = 1) {
  const ground = terrainHeight(x, z);
  const trunkH = (pine ? 2.8 : 2.2) * scale;
  const trunk = mesh(new THREE.CylinderGeometry(0.16 * scale, 0.28 * scale, trunkH, 6), MAT.wood);
  trunk.position.set(x, ground + trunkH / 2, z);
  trunk.rotation.z = rand(-0.04, 0.04);
  scene.add(trunk);

  if (pine) {
    const greens = [0x2f5a32, 0x356738, 0x284d2b];
    for (let i = 0; i < 3; i++) {
      const r = (1.65 - i * 0.34) * scale;
      const cone = mesh(new THREE.ConeGeometry(r, (2.1 - i * 0.25) * scale, 7), new THREE.MeshStandardMaterial({ color: greens[i], roughness: 0.95, flatShading: true }));
      cone.position.set(x, ground + trunkH + i * 0.95 * scale, z);
      cone.rotation.y = rand(0, Math.PI);
      scene.add(cone);
    }
  } else {
    const greens = [0x3f6b34, 0x4a7739, 0x355d2e];
    for (let i = 0; i < 3; i++) {
      const blob = mesh(new THREE.IcosahedronGeometry((1.2 - i * 0.16) * scale, 0), new THREE.MeshStandardMaterial({ color: greens[i], roughness: 0.96, flatShading: true }));
      blob.position.set(x + rand(-0.8, 0.8) * scale, ground + trunkH + rand(0.2, 0.9) * scale, z + rand(-0.8, 0.8) * scale);
      blob.rotation.set(rand(0, 3), rand(0, 3), rand(0, 3));
      scene.add(blob);
    }
  }
  addCircleCollider(colliders, x, z, 0.45 * scale, ground, 2.2 * scale, 'tree');
}

function createRock(scene, colliders, x, z, s) {
  const ground = terrainHeight(x, z);
  const rock = mesh(new THREE.IcosahedronGeometry(s, 0), new THREE.MeshStandardMaterial({ color: 0x777a6e, roughness: 0.98, flatShading: true }));
  rock.position.set(x, ground + s * 0.38, z);
  rock.rotation.set(rand(0, 3), rand(0, 3), rand(0, 3));
  rock.scale.y = 0.72;
  scene.add(rock);
  addCircleCollider(colliders, x, z, s * 0.75, ground, s, 'rock');
}

function createContainer(scene, colliders, x, z, w, d, h, material, rot = 0) {
  const ground = terrainHeight(x, z);
  const c = mesh(new THREE.BoxGeometry(w, h, d), material);
  c.position.set(x, ground + h / 2, z);
  c.rotation.y = rot;
  scene.add(c);
  // Axis-aligned collider is a close approximation (rotations are tiny).
  addBoxCollider(colliders, x, z, Math.abs(w * Math.cos(rot)) + Math.abs(d * Math.sin(rot)), Math.abs(d * Math.cos(rot)) + Math.abs(w * Math.sin(rot)), ground, h, 'container');
  // Corrugation ribs.
  const ribs = Math.max(3, Math.floor(w / 1.1));
  for (let i = 0; i < ribs; i++) {
    const rib = mesh(new THREE.BoxGeometry(0.12, h * 0.82, d + 0.02), MAT.dark, false, true);
    rib.position.set(x - w / 2 + 0.5 + i * ((w - 1) / Math.max(1, ribs - 1)), ground + h / 2, z);
    rib.rotation.y = rot;
    scene.add(rib);
  }
  return c;
}

function createWatchtower(scene, colliders, x, z) {
  const g = terrainHeight(x, z);
  const legs = [[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]];
  for (const [ox, oz] of legs) {
    const leg = mesh(new THREE.CylinderGeometry(0.08, 0.13, 5.6, 5), MAT.wood);
    leg.position.set(x + ox, g + 2.8, z + oz);
    scene.add(leg);
  }
  const deck = mesh(new THREE.BoxGeometry(4.4, 0.3, 4.4), MAT.wood);
  deck.position.set(x, g + 5.5, z);
  scene.add(deck);
  const roof = mesh(new THREE.BoxGeometry(4.9, 0.25, 4.9), MAT.rust);
  roof.position.set(x, g + 8.2, z);
  scene.add(roof);
  for (const [ox, oz] of [[0, -2.1], [0, 2.1], [-2.1, 0], [2.1, 0]]) {
    const rail = mesh(new THREE.BoxGeometry(ox === 0 ? 4.4 : 0.16, 1.0, oz === 0 ? 4.4 : 0.16), MAT.wood, false, true);
    rail.position.set(x + ox, g + 6.1, z + oz);
    scene.add(rail);
  }
  addBoxCollider(colliders, x, z, 3.2, 3.2, g, 5.4, 'tower');
}

function createCloudTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 256, 128);
  for (let i = 0; i < 18; i++) {
    const x = rand(30, 226);
    const y = rand(40, 88);
    const r = rand(18, 44);
    const gr = ctx.createRadialGradient(x, y, 1, x, y, r);
    gr.addColorStop(0, 'rgba(255,255,255,.50)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createSky(scene) {
  const geo = new THREE.SphereGeometry(430, 32, 18);  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color(0x2f6f9f) },
      mid: { value: new THREE.Color(0x8fc2d4) },
      bottom: { value: new THREE.Color(0xf4d6a1) },
      sunDir: { value: new THREE.Vector3(0.45, 0.34, 0.82).normalize() },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vDir;
      uniform vec3 top; uniform vec3 mid; uniform vec3 bottom; uniform vec3 sunDir;
      void main() {
        float y = clamp(vDir.y * 0.5 + 0.5, 0.0, 1.0);
        vec3 col = mix(bottom, mid, smoothstep(0.36, 0.56, y));
        col = mix(col, top, smoothstep(0.55, 0.95, y));
        float sun = pow(max(dot(normalize(vDir), sunDir), 0.0), 220.0);
        float halo = pow(max(dot(normalize(vDir), sunDir), 0.0), 14.0) * 0.26;
        col += vec3(1.0, 0.78, 0.45) * (sun * 1.4 + halo);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const sky = new THREE.Mesh(geo, mat);
  sky.frustumCulled = false;
  scene.add(sky);
  return sky;
}

/**
 * Collapse every static prop sharing a material into one draw call.
 * Dynamic objects (terrain, water, sky, zone, birds) are marked noMerge.
 */
function mergeStaticMeshes(root) {
  root.updateMatrixWorld(true);
  const buckets = new Map();
  const remove = [];
  root.traverse((o) => {
    if (!o.isMesh || o.material?.isShaderMaterial) return;
    let parent = o.parent;
    while (parent) {
      if (parent.userData.noMerge) return;
      parent = parent.parent;
    }
    const key = `${o.material.uuid}|${o.castShadow ? 1 : 0}|${o.receiveShadow ? 1 : 0}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { geoms: [], material: o.material, cast: o.castShadow, receive: o.receiveShadow };
      buckets.set(key, bucket);
    }
    const geo = o.geometry.clone();
    geo.applyMatrix4(o.matrixWorld);
    bucket.geoms.push(geo);
    remove.push(o);
  });
  for (const o of remove) {
    o.parent?.remove(o);
    o.geometry.dispose();
  }
  for (const bucket of buckets.values()) {
    const merged = mergeGeometries(bucket.geoms, false);
    for (const g of bucket.geoms) g.dispose();
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, bucket.material);
    mesh.castShadow = bucket.cast;
    mesh.receiveShadow = bucket.receive;
    root.add(mesh);
  }
}

export function createWorld(scene) {
  const colliders = [];
  const solids = [];
  const buildings = [];
  const lootSpots = [];
  const botSpawns = [];

  scene.background = new THREE.Color(0x9dc6d6);
  scene.fog = new THREE.Fog(0xa9c9d2, 70, 185);

  // Lights.
  const hemi = new THREE.HemisphereLight(0xbfe6ff, 0x4f5a36, 1.25);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffe6bd, 2.25);
  sun.position.set(55, 90, 40);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -105;
  sun.shadow.camera.right = 105;
  sun.shadow.camera.top = 105;
  sun.shadow.camera.bottom = -105;
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 260;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.025;
  scene.add(sun);
  scene.add(sun.target);

  createSky(scene);

  // Ocean.
  const waterTex = noiseTexture('#5aa6b8', '#2d7b91', 256, 900);
  waterTex.repeat.set(28, 28);
  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x2d7f95,
    roughness: 0.22,
    metalness: 0.32,
    transparent: true,
    opacity: 0.9,
    map: waterTex,
  });
  const water = mesh(new THREE.PlaneGeometry(700, 700), waterMat, false, true);
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0;
  water.userData.noMerge = true;
  scene.add(water);

  // Sea floor tint.
  const deep = mesh(new THREE.PlaneGeometry(900, 900), new THREE.MeshBasicMaterial({ color: 0x173f4c }), false, false);
  deep.rotation.x = -Math.PI / 2;
  deep.position.y = -4.2;
  scene.add(deep);

  // Terrain.
  const terrainTex = noiseTexture('#dbe3c5', '#a9b78d', 256, 1300);
  terrainTex.repeat.set(30, 30);
  const geo = new THREE.PlaneGeometry(320, 320, 150, 150);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const sand = new THREE.Color(0xc9b483);
  const grassLow = new THREE.Color(0x687c3e);
  const grass = new THREE.Color(0x4d6b35);
  const grassHigh = new THREE.Color(0x3f5b2c);
  const rock = new THREE.Color(0x7c7b68);
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const y = terrainHeight(x, z);
    pos.setY(i, y);
    const slope =
      Math.abs(terrainHeight(x + 1, z) - terrainHeight(x - 1, z)) +
      Math.abs(terrainHeight(x, z + 1) - terrainHeight(x, z - 1));
    if (y < 0.42) tmp.copy(sand);
    else if (y < 1.15) tmp.copy(sand).lerp(grassLow, smoothstep(0.42, 1.15, y));
    else if (y < 3.2) tmp.copy(grassLow).lerp(grass, smoothstep(1.15, 3.2, y));
    else tmp.copy(grassHigh);
    if (slope > 1.35) tmp.lerp(rock, clamp((slope - 1.35) / 1.2, 0, 0.8));
    const n = Math.sin(x * 0.33) * Math.cos(z * 0.29) * 0.035;
    tmp.offsetHSL(0, 0, n);
    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const terrain = mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, map: terrainTex, roughness: 1, metalness: 0 }), false, true);
  terrain.position.y = 0;
  scene.add(terrain);

  // Beach / shoreline accent ring.
  const beach = mesh(new THREE.RingGeometry(66, 79, 96), new THREE.MeshStandardMaterial({ color: 0xc9b483, roughness: 1, transparent: true, opacity: 0.26, depthWrite: false }), false, true);
  beach.rotation.x = -Math.PI / 2;
  beach.position.y = 0.32;
  scene.add(beach);

  // Building compounds.
  const defs = [
    { x: 34, z: -26, w: 18, d: 12, h: 5.0, style: 'warehouse' },
    { x: -40, z: 16, w: 14, d: 10, h: 4.2, style: 'warehouse' },
    { x: 12, z: 42, w: 12, d: 9, h: 4.0, style: 'house' },
    { x: -32, z: -38, w: 13, d: 12, h: 3.2, style: 'ruin' },
    { x: 48, z: 26, w: 14, d: 14, h: 5.6, style: 'tower' },
    { x: -12, z: -50, w: 9, d: 7, h: 3.4, style: 'house' },
    { x: -58, z: -8, w: 11, d: 8, h: 3.8, style: 'warehouse' },
    { x: 48, z: -48, w: 10, d: 8, h: 3.6, style: 'ruin' },
  ];
  for (const def of defs) createBuilding(scene, colliders, buildings, lootSpots, def);

  // Shipping containers as cover.
  const containerDefs = [
    [2, 10, 8.2, 3.0, 2.7, MAT.rust, 0],
    [2, 16.5, 8.2, 3.0, 2.7, MAT.olive, 0],
    [-9, 4, 3.0, 7.5, 2.7, MAT.metal, 0],
    [22, 10, 7.0, 2.9, 2.6, MAT.olive, 0.12],
    [-20, -18, 7.4, 3.0, 2.7, MAT.rust, -0.08],
    [38, 6, 3.0, 8.0, 2.7, MAT.metal, 0],
  ];
  for (const [x, z, w, d, h, m, rot] of containerDefs) {
    createContainer(scene, colliders, x, z, w, d, h, m, rot);
    lootSpots.push({ x: x + rand(-3, 3), z: z + rand(3, 5), kind: Math.random() > 0.5 ? 'weapon' : 'ammo' });
  }

  // Watchtowers.
  createWatchtower(scene, colliders, 40, -2);
  createWatchtower(scene, colliders, -20, 48);

  // Crates & barrels scattered for cover.
  for (let i = 0; i < 24; i++) {
    const a = rand(0, Math.PI * 2);
    const r = rand(12, 66);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (buildings.some((b) => Math.abs(x - b.x) < b.w / 2 + 2.5 && Math.abs(z - b.z) < b.d / 2 + 2.5)) continue;
    const g = terrainHeight(x, z);
    const s = rand(0.7, 1.25);
    const mat = Math.random() > 0.45 ? MAT.wood : MAT.olive;
    const crate = box(scene, colliders, x, g + s / 2, z, s, s, s, mat);
    crate.rotation.y = rand(-0.35, 0.35);
    if (i % 5 === 0) lootSpots.push({ x: x + 1.5, z, kind: Math.random() > 0.5 ? 'health' : 'armor' });
  }

  // Trees.
  let treeCount = 0;
  for (let attempt = 0; attempt < 900 && treeCount < 78; attempt++) {
    const a = rand(0, Math.PI * 2);
    const r = rand(14, 72);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (terrainHeight(x, z) < 1.0) continue;
    if (buildings.some((b) => Math.abs(x - b.x) < b.w / 2 + 3.6 && Math.abs(z - b.z) < b.d / 2 + 3.6)) continue;
    if (Math.hypot(x, z - 42) < 7) continue;
    createTree(scene, colliders, x, z, Math.random() > 0.45, rand(0.8, 1.35));
    treeCount++;
  }

  // Rocks and bushes.
  for (let i = 0; i < 34; i++) {
    const a = rand(0, Math.PI * 2);
    const r = rand(20, 74);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (buildings.some((b) => Math.abs(x - b.x) < b.w / 2 + 2 && Math.abs(z - b.z) < b.d / 2 + 2)) continue;
    if (terrainHeight(x, z) < 0.7) continue;
    createRock(scene, colliders, x, z, rand(0.6, 2.0));
  }
  const bushGeo = new THREE.IcosahedronGeometry(0.55, 0);
  const bushMat = new THREE.MeshStandardMaterial({ color: 0x466a32, roughness: 1, flatShading: true });
  for (let i = 0; i < 110; i++) {
    const a = rand(0, Math.PI * 2);
    const r = rand(10, 72);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (terrainHeight(x, z) < 1.2) continue;
    const b = mesh(bushGeo, bushMat, false, true);
    b.position.set(x, terrainHeight(x, z) + 0.3, z);
    b.scale.setScalar(rand(0.5, 1.5));
    b.rotation.y = rand(0, 3);
    scene.add(b);
  }

  // Extra open-field loot.
  for (let i = 0; i < 14; i++) {
    const a = rand(0, Math.PI * 2);
    const r = rand(10, 64);
    lootSpots.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, kind: ['weapon', 'health', 'armor', 'ammo'][i % 4] });
  }

  // Bot spawn candidates.
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + rand(-0.28, 0.28);
    const r = rand(32, 68);
    botSpawns.push({ x: Math.cos(a) * r, z: Math.sin(a) * r });
  }

  // Distant clouds.
  const cloudTex = createCloudTexture();
  const clouds = [];
  for (let i = 0; i < 12; i++) {
    const mat = new THREE.SpriteMaterial({ map: cloudTex, transparent: true, opacity: rand(0.12, 0.27), depthWrite: false });
    const sprite = new THREE.Sprite(mat);
    const a = rand(0, Math.PI * 2);
    const r = rand(150, 310);
    sprite.position.set(Math.cos(a) * r, rand(78, 128), Math.sin(a) * r);
    sprite.scale.set(rand(38, 82), rand(11, 24), 1);
    scene.add(sprite);
    clouds.push(sprite);
  }

  // A few seagulls for sky life (tiny V shapes).
  const gullMat = new THREE.MeshBasicMaterial({ color: 0xf7f4ea, side: THREE.DoubleSide });
  const gulls = [];
  for (let i = 0; i < 8; i++) {
    const g = new THREE.Group();
    for (const s of [-1, 1]) {
      const wing = mesh(new THREE.PlaneGeometry(1.1, 0.22), gullMat, false, false);
      wing.rotation.z = s * 0.4;
      wing.position.x = s * 0.5;
      g.add(wing);
    }
    const a = rand(0, Math.PI * 2);
    const r = rand(60, 130);
    g.position.set(Math.cos(a) * r, rand(22, 38), Math.sin(a) * r);
    scene.add(g);
    gulls.push({ g, a, r, y: g.position.y, speed: rand(0.04, 0.09) });
  }

  // Zone visuals.
  const zoneMat = new THREE.MeshBasicMaterial({
    color: 0xff4a1f,
    transparent: true,
    opacity: 0.16,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const zoneWall = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 70, 96, 1, true), zoneMat);
  zoneWall.position.y = 32;
  zoneWall.renderOrder = 2;
  scene.add(zoneWall);

  const zoneRingMat = new THREE.MeshBasicMaterial({ color: 0xff7a18, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
  const zoneRing = new THREE.Mesh(new THREE.RingGeometry(0.985, 1.0, 128), zoneRingMat);
  zoneRing.rotation.x = -Math.PI / 2;
  zoneRing.position.y = 6.5;
  zoneRing.renderOrder = 2;
  scene.add(zoneRing);

  // Distant haze silhouettes are intentionally omitted: fog already closes the horizon.

  function update(dt, elapsed) {
    waterTex.offset.x += dt * 0.0035;
    waterTex.offset.y += dt * 0.0018;
    for (const c of clouds) {
      c.position.x += dt * 1.6;
      if (c.position.x > 280) c.position.x = -280;
    }
    for (const bird of gulls) {
      bird.a += dt * bird.speed;
      bird.g.position.set(Math.cos(bird.a) * bird.r, bird.y + Math.sin(elapsed * 0.7 + bird.r) * 0.6, Math.sin(bird.a) * bird.r);
      bird.g.rotation.y = -bird.a;
    }
    zoneWall.material.opacity = 0.11 + Math.sin(elapsed * 2.4) * 0.035;
  }

  return {
    terrain,
    water,
    colliders,
    solids: [],
    buildings,
    lootSpots,
    botSpawns,
    zoneWall,
    zoneRing,
    sun,
    update,
  };
}

/** True if a segment between two points is blocked by a world collider. */
export function segmentBlocked(colliders, ax, ay, az, bx, by, bz) {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const dist = Math.hypot(dx, dy, dz);
  if (dist < 0.001) return false;
  const steps = Math.min(36, Math.max(6, Math.ceil(dist / 2.2)));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = ax + dx * t;
    const y = ay + dy * t;
    const z = az + dz * t;
    for (const c of colliders) {
      if (y < c.minY || y > c.maxY) continue;
      if (c.kind === 'circle') {
        if ((x - c.x) ** 2 + (z - c.z) ** 2 < (c.r - 0.05) ** 2) return true;
      } else if (x > c.minX && x < c.maxX && z > c.minZ && z < c.maxZ) return true;
    }
  }
  return false;
}

/** Push a circle (player/bot radius) out of all world colliders. */
export function resolveCollisions(pos, radius, colliders) {
  for (let pass = 0; pass < 2; pass++) {
    for (const c of colliders) {
      if (pos.y > c.maxY + 0.1 || pos.y + 1.6 < c.minY) continue;
      if (c.kind === 'circle') {
        const dx = pos.x - c.x;
        const dz = pos.z - c.z;
        const d = Math.hypot(dx, dz);
        const min = c.r + radius;
        if (d < min && d > 0.0001) {
          const push = (min - d) / d;
          pos.x += dx * push;
          pos.z += dz * push;
        }
      } else {
        const nx = clamp(pos.x, c.minX, c.maxX);
        const nz = clamp(pos.z, c.minZ, c.maxZ);
        const dx = pos.x - nx;
        const dz = pos.z - nz;
        const d = Math.hypot(dx, dz);
        if (d < radius) {
          if (d > 0.0001) {
            const push = (radius - d) / d;
            pos.x += dx * push;
            pos.z += dz * push;
          } else {
            // Deep inside: push out along the shortest axis.
            const left = pos.x - c.minX;
            const right = c.maxX - pos.x;
            const back = pos.z - c.minZ;
            const front = c.maxZ - pos.z;
            const m = Math.min(left, right, back, front);
            if (m === left) pos.x = c.minX - radius;
            else if (m === right) pos.x = c.maxX + radius;
            else if (m === back) pos.z = c.minZ - radius;
            else pos.z = c.maxZ + radius;
          }
        }
      }
    }
  }
  // Keep everyone on the island.
  const d = Math.hypot(pos.x, pos.z);
  if (d > PLAY_RADIUS) {
    pos.x = (pos.x / d) * PLAY_RADIUS;
    pos.z = (pos.z / d) * PLAY_RADIUS;
  }
  return pos;
}

/** Approximate the first world-collider hit distance along a ray (3D). */
export function raycastWorld(colliders, origin, dir, maxDist) {
  let best = maxDist;
  const ox = origin.x;
  const oy = origin.y;
  const oz = origin.z;
  for (const c of colliders) {
    if (c.kind === 'circle') {
      const dx = dir.x;
      const dz = dir.z;
      const fx = ox - c.x;
      const fz = oz - c.z;
      const a = dx * dx + dz * dz;
      if (a < 0.00001) continue;
      const b = 2 * (fx * dx + fz * dz);
      const cc = fx * fx + fz * fz - c.r * c.r;
      const disc = b * b - 4 * a * cc;
      if (disc < 0) continue;
      const t = (-b - Math.sqrt(disc)) / (2 * a);
      if (t > 0.1 && t < best) {
        const y = oy + dir.y * t;
        if (y >= c.minY && y <= c.maxY) best = t;
      }
    } else {
      // Slab test in X/Z, then check Y at the entry distance.
      let tmin = 0.1;
      let tmax = best;
      let ok = true;
      for (const axis of ['x', 'z']) {
        const o = axis === 'x' ? ox : oz;
        const d = axis === 'x' ? dir.x : dir.z;
        const mn = axis === 'x' ? c.minX : c.minZ;
        const mx = axis === 'x' ? c.maxX : c.maxZ;
        if (Math.abs(d) < 0.00001) {
          if (o < mn || o > mx) { ok = false; break; }
        } else {
          let t1 = (mn - o) / d;
          let t2 = (mx - o) / d;
          if (t1 > t2) [t1, t2] = [t2, t1];
          tmin = Math.max(tmin, t1);
          tmax = Math.min(tmax, t2);
          if (tmin > tmax) { ok = false; break; }
        }
      }
      if (!ok) continue;
      const y = oy + dir.y * tmin;
      if (y >= c.minY && y <= c.maxY) best = tmin;
    }
  }
  return best;
}
