import { clamp, curveRaw, hash, roadAngle, TAU } from './utils.js';
import { getCarSprite } from './sprites.js';

const LANE_RATIOS = [-0.4, -0.2, 0, 0.2, 0.4];

export class Renderer {
  constructor(canvas, view) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.view = view;
    this.background = null;
    this.glow = null;
    this.resize(view);
  }

  resize(view) {
    this.view = view;
    const { ctx, canvas } = this;
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    canvas.width = Math.floor(view.W * view.dpr);
    canvas.height = Math.floor(view.H * view.dpr);

    const background = ctx.createLinearGradient(0, 0, 0, view.H);
    background.addColorStop(0, '#21102f');
    background.addColorStop(0.34, '#150c29');
    background.addColorStop(1, '#080510');
    this.background = background;

    const glow = ctx.createRadialGradient(view.W * 0.58, -view.H * 0.12, 0, view.W * 0.58, -view.H * 0.12, view.H * 0.85);
    glow.addColorStop(0, 'rgba(255, 96, 103, .34)');
    glow.addColorStop(0.36, 'rgba(198, 58, 128, .12)');
    glow.addColorStop(1, 'rgba(33, 10, 47, 0)');
    this.glow = glow;
  }

  centerFor(distance, playerDistance) {
    return this.view.W / 2 + (curveRaw(distance) - curveRaw(playerDistance)) * this.view.A;
  }

  screenY(distance, playerDistance) {
    return this.view.playerY - (distance - playerDistance) * this.view.P;
  }

  render(game) {
    const { ctx, view } = this;
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.fillStyle = '#080510';
    ctx.fillRect(0, 0, view.W, view.H);

    ctx.save();
    if (game.shake > 0.1) {
      const mag = game.shake;
      ctx.translate((Math.random() - 0.5) * mag, (Math.random() - 0.5) * mag);
    }

    this.drawBackground(game);
    this.drawTerrain(game);
    this.drawScenery(game);
    this.drawRoad(game);
    this.drawLamps(game);
    this.drawPickups(game);
    this.drawTraffic(game);
    this.drawPlayer(game);
    this.drawParticles(game);
    this.drawFloaters(game);
    ctx.restore();

    this.drawAtmosphere(game);
  }

  drawBackground(game) {
    const { ctx, view } = this;
    ctx.fillStyle = this.background;
    ctx.fillRect(-30, -30, view.W + 60, view.H + 60);
    ctx.fillStyle = this.glow;
    ctx.fillRect(-30, -30, view.W + 60, view.H + 60);

    const lower = ctx.createRadialGradient(view.W * 0.08, view.H * 0.93, 0, view.W * 0.08, view.H * 0.93, view.H * 0.7);
    lower.addColorStop(0, 'rgba(20, 176, 175, .07)');
    lower.addColorStop(1, 'rgba(20, 176, 175, 0)');
    ctx.fillStyle = lower;
    ctx.fillRect(0, 0, view.W, view.H);
  }

  drawTerrain(game) {
    const { ctx, view } = this;
    const p = game.player;
    const spacing = 23;
    const first = Math.floor((p.d - 20) / spacing) * spacing;
    const last = p.d + (view.playerY + 80) / view.P;

    ctx.save();
    ctx.lineWidth = 1;
    for (let d = first; d < last; d += spacing) {
      const y = this.screenY(d, p.d);
      if (y < -40 || y > view.H + 40) continue;
      const major = Math.round(d / spacing) % 4 === 0;
      ctx.strokeStyle = major ? 'rgba(255, 68, 142, .09)' : 'rgba(255, 86, 157, .035)';
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(view.W, y);
      ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(255, 241, 208, .025)';
    for (let x = 30; x < view.W; x += 96) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + 36, view.H);
      ctx.stroke();
    }

    const glow = ctx.createRadialGradient(view.W * 0.5, view.playerY * 0.2, 0, view.W * 0.5, view.playerY * 0.2, view.W * 0.55);
    glow.addColorStop(0, 'rgba(255, 116, 104, .035)');
    glow.addColorStop(1, 'rgba(255, 116, 104, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, view.W, view.H);
    ctx.restore();
  }

  drawScenery(game) {
    const { ctx, view } = this;
    const p = game.player;
    const spacing = 9;
    const first = Math.floor((p.d - 10) / spacing) * spacing;
    const last = p.d + (view.playerY + 90) / view.P + 10;

    for (let d = first; d < last; d += spacing) {
      const k = Math.round(d / spacing);
      const y = this.screenY(d, p.d);
      if (y < -70 || y > view.H + 70) continue;
      const h1 = hash(k * 1.31 + 2.2);
      if (h1 < 0.34) continue;
      const side = hash(k * 4.73) > 0.5 ? 1 : -1;
      const spread = Math.min(view.W * 0.34, 430);
      const offset = view.halfW + 27 + hash(k * 7.17 + 4) * spread;
      const x = this.centerFor(d, p.d) + side * offset;
      if (x < -80 || x > view.W + 80) continue;
      const size = 8 + hash(k * 9.9 + 1) * 22;
      const type = hash(k * 6.4 + 8.8);

      ctx.save();
      ctx.translate(x, y);
      if (type < 0.4) this.drawRock(ctx, size, k);
      else if (type < 0.7) this.drawPalm(ctx, size, k);
      else if (type < 0.86) this.drawCactus(ctx, size, k);
      else this.drawCrystal(ctx, size, k);
      ctx.restore();
    }
  }

  drawRock(ctx, size, seed) {
    ctx.fillStyle = 'rgba(7, 4, 14, .34)';
    ctx.beginPath();
    ctx.ellipse(4, 5, size * 1.15, size * 0.8, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#24152f';
    ctx.beginPath();
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU;
      const r = size * (0.6 + hash(seed * 1.7 + i) * 0.55);
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r * 0.75;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 119, 145, .2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-size * 0.42, -size * 0.2);
    ctx.lineTo(-size * 0.08, -size * 0.48);
    ctx.lineTo(size * 0.3, -size * 0.24);
    ctx.stroke();
  }

  drawPalm(ctx, size, seed) {
    ctx.strokeStyle = 'rgba(6, 11, 20, .65)';
    ctx.lineWidth = size * 0.2;
    ctx.lineCap = 'round';
    for (let i = 0; i < 9; i++) {
      const angle = (i / 9) * TAU + hash(seed + i) * 0.5;
      const len = size * (1.25 + hash(seed * 3 + i) * 0.7);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(Math.cos(angle - 0.3) * len * 0.55, Math.sin(angle - 0.3) * len * 0.55, Math.cos(angle) * len, Math.sin(angle) * len);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(86, 226, 198, .17)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 4; i++) {
      const angle = -0.6 + i * 0.42;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(angle) * size * 1.55, Math.sin(angle) * size * 1.55);
      ctx.stroke();
    }
    ctx.fillStyle = '#071d22';
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.28, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(120, 255, 222, .2)';
    ctx.beginPath();
    ctx.arc(-1, -1, size * 0.12, 0, TAU);
    ctx.fill();
  }

  drawCactus(ctx, size, seed) {
    ctx.fillStyle = 'rgba(5, 24, 23, .88)';
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.36, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(5, 24, 23, .88)';
    ctx.lineWidth = size * 0.28;
    ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const a = hash(seed + i * 2.3) * TAU;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * size * 0.65, Math.sin(a) * size * 0.65);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(89, 195, 140, .26)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-size * 0.22, -size * 0.18);
    ctx.lineTo(size * 0.12, -size * 0.38);
    ctx.stroke();
  }

  drawCrystal(ctx, size, seed) {
    const warm = hash(seed * 4.1) > 0.52;
    const color = warm ? '255, 76, 143' : '74, 242, 228';
    ctx.shadowColor = `rgba(${color}, .55)`;
    ctx.shadowBlur = 15;
    ctx.fillStyle = `rgba(${color}, .48)`;
    for (let i = 0; i < 3; i++) {
      const angle = -0.7 + i * 0.7 + hash(seed + i) * 0.3;
      const h = size * (0.55 + hash(seed * 2 + i) * 0.85);
      ctx.save();
      ctx.rotate(angle);
      ctx.beginPath();
      ctx.moveTo(0, 4);
      ctx.lineTo(-size * 0.16, -h * 0.35);
      ctx.lineTo(0, -h);
      ctx.lineTo(size * 0.16, -h * 0.35);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.shadowBlur = 0;
  }

  roadSamples(game) {
    const { view } = this;
    const p = game.player;
    const samples = [];
    for (let y = -40; y <= view.H + 40; y += 9) {
      const d = p.d + (view.playerY - y) / view.P;
      samples.push({ y, d, x: this.centerFor(d, p.d) });
    }
    return samples;
  }

  roadPath(ctx, samples, offset = 0, inset = 0) {
    const { view } = this;
    ctx.beginPath();
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      const x = s.x + offset + (offset >= 0 ? -inset : inset);
      if (i === 0) ctx.moveTo(x, s.y); else ctx.lineTo(x, s.y);
    }
    for (let i = samples.length - 1; i >= 0; i--) {
      const s = samples[i];
      const x = s.x - offset + (offset >= 0 ? inset : -inset);
      if (i === samples.length - 1) ctx.lineTo(x, s.y); else ctx.lineTo(x, s.y);
    }
    ctx.closePath();
  }

  drawRoad(game) {
    const { ctx, view } = this;
    const p = game.player;
    const samples = this.roadSamples(game);

    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, .48)';
    ctx.beginPath();
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      const x = s.x - view.halfW - 16;
      if (i === 0) ctx.moveTo(x, s.y + 12); else ctx.lineTo(x, s.y + 12);
    }
    for (let i = samples.length - 1; i >= 0; i--) {
      const s = samples[i];
      ctx.lineTo(s.x + view.halfW + 16, s.y + 12);
    }
    ctx.closePath();
    ctx.fill();

    const asphalt = ctx.createLinearGradient(0, 0, 0, view.H);
    asphalt.addColorStop(0, '#2a2735');
    asphalt.addColorStop(0.28, '#23212f');
    asphalt.addColorStop(0.75, '#1a1926');
    asphalt.addColorStop(1, '#171522');
    this.roadPath(ctx, samples, view.halfW);
    ctx.fillStyle = asphalt;
    ctx.fill();

    ctx.fillStyle = 'rgba(255, 102, 108, .035)';
    const wash = ctx.createLinearGradient(0, 0, 0, view.H * 0.55);
    wash.addColorStop(0, 'rgba(255, 120, 96, .08)');
    wash.addColorStop(1, 'rgba(255, 120, 96, 0)');
    ctx.fillStyle = wash;
    ctx.fill();

    const shoulder = ctx.createLinearGradient(view.W / 2 - view.halfW, 0, view.W / 2 + view.halfW, 0);
    shoulder.addColorStop(0, 'rgba(86, 242, 228, .055)');
    shoulder.addColorStop(0.5, 'rgba(0, 0, 0, 0)');
    shoulder.addColorStop(1, 'rgba(255, 78, 116, .06)');
    this.roadPath(ctx, samples, view.halfW);
    ctx.fillStyle = shoulder;
    ctx.fill();

    const first = Math.floor((p.d - 6) / 3.1) * 3.1;
    const last = p.d + (view.playerY + 60) / view.P;
    for (let side = -1; side <= 1; side += 2) {
      for (let d = first; d < last; d += 3.1) {
        const y1 = this.screenY(d, p.d);
        const y2 = this.screenY(d + 3.1, p.d);
        if (y2 > view.H + 20 || y1 < -20) continue;
        const x1 = this.centerFor(d, p.d) + side * view.halfW;
        const x2 = this.centerFor(d + 3.1, p.d) + side * view.halfW;
        const index = Math.round(d / 3.1);
        ctx.fillStyle = index % 2 === 0 ? 'rgba(255, 111, 91, .76)' : 'rgba(255, 232, 189, .58)';
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x1 + side * 9, y1);
        ctx.lineTo(x2 + side * 9, y2);
        ctx.lineTo(x2, y2);
        ctx.closePath();
        ctx.fill();
      }
    }

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const [side, color] of [[-1, 'rgba(80, 247, 235, .95)'], [1, 'rgba(255, 83, 119, .95)']]) {
      ctx.save();
      ctx.shadowColor = color;
      ctx.shadowBlur = 12;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      for (let i = 0; i < samples.length; i++) {
        const s = samples[i];
        const x = s.x + side * (view.halfW - 1);
        if (i === 0) ctx.moveTo(x, s.y); else ctx.lineTo(x, s.y);
      }
      ctx.stroke();
      ctx.restore();
    }

    const dashPeriod = 13;
    const dashFirst = Math.floor((p.d - 5) / dashPeriod) * dashPeriod;
    for (const ratio of [-0.3, -0.1, 0.1, 0.3]) {
      for (let d = dashFirst; d < last; d += dashPeriod) {
        ctx.beginPath();
        for (let step = 0; step <= 2; step++) {
          const dd = d + step * 2.4;
          const y = this.screenY(dd, p.d);
          const x = this.centerFor(dd, p.d) + ratio * view.roadW;
          if (step === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = 'rgba(255, 236, 195, .34)';
        ctx.lineWidth = 2.1;
        ctx.stroke();
      }
    }

    for (let d = first; d < last; d += 4.2) {
      const y = this.screenY(d, p.d);
      if (y < -10 || y > view.H + 10) continue;
      const center = this.centerFor(d, p.d);
      const n = 3;
      for (let i = 0; i < n; i++) {
        const h = hash(Math.round(d * 13) + i * 9.1);
        const x = center + (h - 0.5) * view.roadW * 0.94;
        ctx.fillStyle = `rgba(255, 241, 208, ${0.025 + h * 0.05})`;
        ctx.fillRect(x, y + h * 3, 1.4, 1.2);
      }
    }

    ctx.restore();
  }

  drawLamps(game) {
    const { ctx, view } = this;
    const p = game.player;
    const spacing = 18;
    const first = Math.floor((p.d - 8) / spacing) * spacing;
    const last = p.d + (view.playerY + 60) / view.P;
    for (let d = first; d < last; d += spacing) {
      const k = Math.round(d / spacing);
      const side = k % 2 === 0 ? -1 : 1;
      const y = this.screenY(d, p.d);
      if (y < -60 || y > view.H + 60) continue;
      const x = this.centerFor(d, p.d) + side * (view.halfW + 15);
      const flicker = 0.92 + Math.sin(game.time * 3 + k) * 0.08;
      const glow = ctx.createRadialGradient(x, y, 0, x, y, 82);
      glow.addColorStop(0, `rgba(255, 193, 119, ${0.19 * flicker})`);
      glow.addColorStop(0.35, `rgba(255, 150, 88, ${0.08 * flicker})`);
      glow.addColorStop(1, 'rgba(255, 150, 88, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(x - 84, y - 84, 168, 168);

      ctx.save();
      ctx.shadowColor = '#ffc87a';
      ctx.shadowBlur = 12;
      ctx.fillStyle = '#ffe3aa';
      ctx.beginPath();
      ctx.arc(x, y, 2.4, 0, TAU);
      ctx.fill();
      ctx.restore();

      ctx.fillStyle = 'rgba(255, 217, 157, .4)';
      ctx.fillRect(x - side * 4, y - 1, side * 4, 1);
    }
  }

  drawPickups(game) {
    const { ctx, view } = this;
    const p = game.player;
    for (const item of game.pickups) {
      const y = this.screenY(item.d, p.d);
      if (y < -50 || y > view.H + 40) continue;
      const x = this.centerFor(item.d, p.d) + item.lane * view.roadW + Math.sin(game.time * 1.8 + item.phase) * 4;
      const bob = Math.cos(game.time * 2.2 + item.phase) * 2;
      const pulse = 0.78 + Math.sin(game.time * 4 + item.phase) * 0.22;
      ctx.save();
      ctx.translate(x, y + bob);

      const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, 27);
      glow.addColorStop(0, `rgba(98, 255, 234, ${0.3 * pulse})`);
      glow.addColorStop(0.45, `rgba(57, 221, 220, ${0.1 * pulse})`);
      glow.addColorStop(1, 'rgba(57, 221, 220, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(-28, -28, 56, 56);

      ctx.rotate(game.time * 0.7 + item.phase);
      ctx.shadowColor = '#59ffe8';
      ctx.shadowBlur = 16;
      ctx.fillStyle = '#43e9d8';
      ctx.beginPath();
      ctx.moveTo(0, -12);
      ctx.lineTo(8, 0);
      ctx.lineTo(0, 12);
      ctx.lineTo(-8, 0);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#eaffd6';
      ctx.beginPath();
      ctx.moveTo(0, -6.5);
      ctx.lineTo(3.6, 0);
      ctx.lineTo(0, 6.5);
      ctx.lineTo(-3.6, 0);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(176, 255, 243, .7)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-15, 0);
      ctx.lineTo(-11, 0);
      ctx.moveTo(15, 0);
      ctx.lineTo(11, 0);
      ctx.stroke();
      ctx.restore();
    }
  }

  drawTraffic(game) {
    const { view } = this;
    const sorted = [...game.traffic].sort((a, b) => this.screenY(a.d, game.player.d) - this.screenY(b.d, game.player.d));
    for (const car of sorted) {
      const y = this.screenY(car.d, game.player.d);
      if (y < -130 || y > view.H + 80) continue;
      const x = this.centerFor(car.d, game.player.d) + car.lane * view.roadW;
      const angle = roadAngle(view, car.d);
      this.drawVehicle({ x, y, w: car.w, h: car.h, angle, style: car.style, beam: true, beamScale: 0.55 });
    }
  }

  drawPlayer(game) {
    const { view } = this;
    const p = game.player;
    const bob = Math.sin(game.time * 17) * clamp(p.speed / 90, 0, 1) * 0.9;
    const steer = clamp(p.vx / 520, -1, 1);
    const angle = roadAngle(view, p.d) + steer * 0.27;
    let alpha = 1;
    if (p.invuln > 0) alpha = Math.sin(game.time * 27) > 0 ? 0.42 : 1;
    this.drawVehicle({
      x: view.W / 2 + p.x,
      y: view.playerY + bob,
      w: p.w,
      h: p.h,
      angle,
      style: 'player',
      beam: true,
      beamScale: 1,
      player: true,
      alpha,
      nitro: game.nitroActive,
      time: game.time,
    });
  }

  drawVehicle({ x, y, w, h, angle, style, beam = false, beamScale = 1, player = false, alpha = 1, nitro = false, time = 0 }) {
    const { ctx } = this;
    ctx.save();
    ctx.translate(x, y);

    ctx.save();
    ctx.rotate(angle);
    ctx.globalAlpha = 0.38 * alpha;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(0, 9, w * 0.62, h * 0.47, 0, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 0.2 * alpha;
    ctx.beginPath();
    ctx.ellipse(2, 13, w * 0.8, h * 0.54, 0, 0, TAU);
    ctx.fill();
    ctx.restore();

    if (beam) {
      ctx.save();
      ctx.rotate(angle);
      ctx.globalCompositeOperation = 'lighter';
      const length = (player ? 285 : 150) * beamScale;
      const beamGradient = ctx.createLinearGradient(0, -h * 0.45, 0, -h * 0.45 - length);
      beamGradient.addColorStop(0, `rgba(255, 239, 184, ${player ? 0.19 : 0.07})`);
      beamGradient.addColorStop(0.55, `rgba(255, 226, 162, ${player ? 0.06 : 0.025})`);
      beamGradient.addColorStop(1, 'rgba(255, 226, 162, 0)');
      ctx.fillStyle = beamGradient;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(side * w * 0.27, -h * 0.43);
        ctx.lineTo(side * w * 0.6 - w * 0.18, -h * 0.43 - length);
        ctx.lineTo(side * w * 0.6 + w * 0.27, -h * 0.43 - length);
        ctx.lineTo(side * w * 0.1, -h * 0.43);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }

    if (player) {
      ctx.save();
      ctx.rotate(angle);
      ctx.globalCompositeOperation = 'lighter';
      const glow = ctx.createRadialGradient(0, 7, 0, 0, 7, w * 1.25);
      glow.addColorStop(0, 'rgba(255, 76, 92, .19)');
      glow.addColorStop(0.5, 'rgba(255, 65, 110, .06)');
      glow.addColorStop(1, 'rgba(255, 65, 110, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(-w * 1.4, -h * 0.1, w * 2.8, h * 1.4);
      ctx.restore();

      if (nitro) {
        ctx.save();
        ctx.rotate(angle);
        ctx.globalCompositeOperation = 'lighter';
        for (const side of [-1, 1]) {
          const flicker = 0.72 + Math.sin(time * 32 + side) * 0.28;
          const flame = ctx.createRadialGradient(side * w * 0.2, h * 0.51, 0, side * w * 0.2, h * 0.51, 28 * flicker);
          flame.addColorStop(0, 'rgba(255, 244, 196, .9)');
          flame.addColorStop(0.35, 'rgba(255, 127, 67, .75)');
          flame.addColorStop(1, 'rgba(255, 49, 99, 0)');
          ctx.fillStyle = flame;
          ctx.beginPath();
          ctx.ellipse(side * w * 0.2, h * 0.53 + 12 * flicker, w * 0.11, 22 * flicker, 0, 0, TAU);
          ctx.fill();
        }
        ctx.restore();
      }
    }

    ctx.globalAlpha = alpha;
    ctx.rotate(angle);
    const sprite = getCarSprite(style);
    ctx.drawImage(sprite, -w / 2, -h / 2, w, h);
    ctx.restore();
  }

  drawParticles(game) {
    const { ctx } = this;
    for (const p of game.particles) {
      const t = clamp(p.life / p.maxLife, 0, 1);
      if (p.type === 'spark') {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = t;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.size;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.025, p.y - p.vy * 0.025);
        ctx.stroke();
        ctx.restore();
      } else if (p.type === 'ring') {
        ctx.save();
        ctx.globalAlpha = t * 0.75;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius + (1 - t) * 32, 0, TAU);
        ctx.stroke();
        ctx.restore();
      } else if (p.type === 'streak') {
        ctx.save();
        ctx.globalAlpha = t * 0.35;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x, p.y + p.size);
        ctx.stroke();
        ctx.restore();
      } else {
        ctx.save();
        ctx.globalAlpha = t * 0.4;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.4 + (1 - t) * 1.2), 0, TAU);
        ctx.fill();
        ctx.restore();
      }
    }
  }

  drawFloaters(game) {
    const { ctx } = this;
    for (const f of game.floaters) {
      const t = clamp(f.life / f.maxLife, 0, 1);
      ctx.save();
      ctx.globalAlpha = Math.min(1, t * 2.2);
      ctx.translate(f.x, f.y);
      ctx.font = `800 ${f.size}px "SFMono-Regular", "Liberation Mono", monospace`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(8, 4, 15, .65)';
      ctx.strokeText(f.text, 0, 0);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, 0, 0);
      ctx.restore();
    }
  }

  drawAtmosphere(game) {
    const { ctx, view } = this;
    if (game.nitroActive && game.mode === 'playing') {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const side = ctx.createLinearGradient(0, 0, view.W, 0);
      side.addColorStop(0, 'rgba(255, 74, 103, .11)');
      side.addColorStop(0.13, 'rgba(255, 74, 103, 0)');
      side.addColorStop(0.87, 'rgba(255, 74, 103, 0)');
      side.addColorStop(1, 'rgba(255, 74, 103, .11)');
      ctx.fillStyle = side;
      ctx.fillRect(0, 0, view.W, view.H);

      const top = ctx.createLinearGradient(0, 0, 0, view.H * 0.3);
      top.addColorStop(0, 'rgba(255, 172, 105, .1)');
      top.addColorStop(1, 'rgba(255, 172, 105, 0)');
      ctx.fillStyle = top;
      ctx.fillRect(0, 0, view.W, view.H * 0.3);
      ctx.restore();
    }

    const vignette = ctx.createRadialGradient(view.W / 2, view.H * 0.56, Math.min(view.W, view.H) * 0.26, view.W / 2, view.H * 0.56, Math.max(view.W, view.H) * 0.78);
    vignette.addColorStop(0, 'rgba(5, 2, 12, 0)');
    vignette.addColorStop(0.74, 'rgba(5, 2, 12, .12)');
    vignette.addColorStop(1, 'rgba(5, 2, 12, .55)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, view.W, view.H);
  }
}
