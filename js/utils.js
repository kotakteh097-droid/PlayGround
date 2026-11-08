export const TAU = Math.PI * 2;
export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (min, max) => min + Math.random() * (max - min);
export const pick = (array) => array[(Math.random() * array.length) | 0];
export const padScore = (n) => String(Math.max(0, Math.floor(n))).padStart(6, '0');

const hashCache = new Map();
export function hash(n) {
  const key = Math.round(n * 100) / 100;
  if (hashCache.has(key)) return hashCache.get(key);
  const value = Math.sin(key * 127.1 + 311.7) * 43758.5453123;
  const result = value - Math.floor(value);
  if (hashCache.size > 6000) hashCache.clear();
  hashCache.set(key, result);
  return result;
}

export function curveRaw(distance) {
  return (
    Math.sin(distance * 0.0104 + 0.35) * 0.92 +
    Math.sin(distance * 0.0041 + 1.85) * 0.62 +
    Math.sin(distance * 0.0019 + 4.1) * 0.36
  );
}

export function roadAngle(view, distance) {
  const epsilon = 0.35;
  const slope = (curveRaw(distance + epsilon) - curveRaw(distance - epsilon)) / (epsilon * 2);
  return Math.atan((view.A * slope) / view.P) * 0.82;
}

export function nowSeconds() {
  return performance.now() / 1000;
}
