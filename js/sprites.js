export const CAR_STYLES = {
  player: {
    type: 'coupe', body: '#ff5c52', light: '#ffae74', dark: '#8d2044',
    glass: '#102b40', trim: '#ffe8b8', stripe: '#ffdda0', tail: '#ff2d5d', rim: '#ffc56e',
  },
  mint: {
    type: 'coupe', body: '#48cec3', light: '#9bf5dc', dark: '#0d6d78',
    glass: '#0c2735', trim: '#d8fff2', stripe: '#97f6e2', tail: '#ff5373', rim: '#bfffe8',
  },
  gold: {
    type: 'sedan', body: '#e9b949', light: '#ffe28b', dark: '#8a5321',
    glass: '#1b2a38', trim: '#fff2c0', stripe: '#a14a2a', tail: '#ff485d', rim: '#ffe7a0',
  },
  violet: {
    type: 'coupe', body: '#9b79dd', light: '#d1b6ff', dark: '#503589',
    glass: '#15233d', trim: '#f1e2ff', stripe: '#38244f', tail: '#ff426b', rim: '#ddc5ff',
  },
  cream: {
    type: 'muscle', body: '#e8dfc9', light: '#fff9e8', dark: '#8c7b69',
    glass: '#1b2b37', trim: '#463a35', stripe: '#d34a42', tail: '#ff3d5e', rim: '#f6e5bb',
  },
  van: {
    type: 'van', body: '#4a89ca', light: '#8ec6f4', dark: '#244e81',
    glass: '#102638', trim: '#d3ecff', stripe: '#f2d063', tail: '#ff4f67', rim: '#b9dfff',
  },
  rose: {
    type: 'sedan', body: '#d36582', light: '#f5a3b8', dark: '#7c2b4b',
    glass: '#172333', trim: '#ffe1e7', stripe: '#522b3e', tail: '#ff335c', rim: '#f5c5d0',
  },
};

const cache = new Map();

function roundedRect(g, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + radius, y);
  g.lineTo(x + w - radius, y);
  g.quadraticCurveTo(x + w, y, x + w, y + radius);
  g.lineTo(x + w, y + h - radius);
  g.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  g.lineTo(x + radius, y + h);
  g.quadraticCurveTo(x, y + h, x, y + h - radius);
  g.lineTo(x, y + radius);
  g.quadraticCurveTo(x, y, x + radius, y);
  g.closePath();
}

function bodyPath(g, type) {
  g.beginPath();
  if (type === 'van') {
    g.moveTo(22, 11);
    g.quadraticCurveTo(23, 6, 30, 5);
    g.lineTo(70, 5);
    g.quadraticCurveTo(77, 6, 78, 11);
    g.lineTo(87, 42);
    g.lineTo(89, 177);
    g.quadraticCurveTo(89, 194, 76, 196);
    g.lineTo(24, 196);
    g.quadraticCurveTo(11, 194, 11, 177);
    g.lineTo(13, 42);
    g.closePath();
    return;
  }
  const shoulder = type === 'muscle' ? 9 : 14;
  const nose = type === 'muscle' ? 19 : 21;
  g.moveTo(34, 8);
  g.bezierCurveTo(42, 3, 58, 3, 66, 8);
  g.lineTo(80, 31);
  g.lineTo(100 - shoulder, 57);
  g.lineTo(101 - shoulder, 151);
  g.bezierCurveTo(101 - shoulder, 178, 91 - shoulder, 192, 66, 196);
  g.lineTo(34, 196);
  g.bezierCurveTo(9 + shoulder, 192, -1 + shoulder, 178, -1 + shoulder, 151);
  g.lineTo(shoulder, 57);
  g.lineTo(nose, 31);
  g.closePath();
}

function drawWheels(g, style) {
  g.fillStyle = '#090812';
  g.shadowColor = 'rgba(0,0,0,.55)';
  g.shadowBlur = 2;
  g.shadowOffsetY = 1;
  for (const x of [0.5, 81.5]) {
    roundedRect(g, x, 34, 18, 39, 8);
    g.fill();
    roundedRect(g, x, 137, 18, 43, 8);
    g.fill();
  }
  g.shadowColor = 'transparent';
  g.shadowBlur = 0;
  g.shadowOffsetY = 0;

  g.strokeStyle = 'rgba(255,255,255,.16)';
  g.lineWidth = 0.8;
  for (const x of [0.5, 81.5]) {
    g.beginPath();
    g.moveTo(x + 9, 39);
    g.lineTo(x + 9, 66);
    g.moveTo(x + 9, 143);
    g.lineTo(x + 9, 174);
    g.stroke();
  }
  g.fillStyle = style.rim;
  g.globalAlpha = 0.55;
  for (const y of [48, 152]) {
    g.fillRect(1.4, y, 2.2, 13);
    g.fillRect(96.4, y, 2.2, 13);
  }
  g.globalAlpha = 1;
}

function drawCanopy(g, style) {
  const type = style.type;
  const top = type === 'van' ? 57 : 64;
  const bottom = type === 'van' ? 121 : 127;
  const inset = type === 'muscle' ? 24 : 27;

  g.beginPath();
  g.moveTo(inset + 3, top);
  g.quadraticCurveTo(inset + 8, top - 7, 50, top - 8);
  g.quadraticCurveTo(100 - inset - 8, top - 7, 100 - inset - 3, top);
  g.lineTo(100 - inset, bottom - 9);
  g.quadraticCurveTo(100 - inset - 6, bottom + 1, 50, bottom + 2);
  g.quadraticCurveTo(inset + 6, bottom + 1, inset, bottom - 9);
  g.closePath();
  g.fillStyle = '#0a0c15';
  g.fill();

  const glassTop = top + 3;
  const glassBottom = bottom - 10;
  const gradient = g.createLinearGradient(28, glassTop, 75, glassBottom);
  gradient.addColorStop(0, style.glass);
  gradient.addColorStop(0.44, '#31556b');
  gradient.addColorStop(0.47, style.glass);
  gradient.addColorStop(1, '#0b1826');
  g.fillStyle = gradient;
  g.beginPath();
  g.moveTo(inset + 5, top + 2);
  g.quadraticCurveTo(inset + 9, top - 3, 50, top - 4);
  g.quadraticCurveTo(100 - inset - 9, top - 3, 100 - inset - 5, top + 2);
  g.lineTo(100 - inset - 5, glassTop + 13);
  g.quadraticCurveTo(50, glassTop + 18, inset + 5, glassTop + 13);
  g.closePath();
  g.fill();

  g.save();
  g.globalAlpha = 0.28;
  g.strokeStyle = '#dcffff';
  g.lineWidth = 2.2;
  g.beginPath();
  g.moveTo(36, glassTop + 2);
  g.lineTo(65, glassTop + 16);
  g.stroke();
  g.globalAlpha = 0.14;
  g.lineWidth = 5;
  g.beginPath();
  g.moveTo(31, glassTop + 1);
  g.lineTo(71, glassTop + 18);
  g.stroke();
  g.restore();

  g.fillStyle = style.body;
  g.beginPath();
  g.moveTo(inset + 4, glassTop + 15);
  g.quadraticCurveTo(50, glassTop + 20, 100 - inset - 4, glassTop + 15);
  g.lineTo(100 - inset - 4, glassBottom - 15);
  g.quadraticCurveTo(50, glassBottom - 10, inset + 4, glassBottom - 15);
  g.closePath();
  g.fill();
  g.fillStyle = 'rgba(255,255,255,.1)';
  g.fillRect(35, glassTop + 17, 30, 1.2);

  g.fillStyle = '#0b1724';
  g.beginPath();
  g.moveTo(inset + 5, glassBottom - 11);
  g.quadraticCurveTo(50, glassBottom - 6, 100 - inset - 5, glassBottom - 11);
  g.lineTo(100 - inset - 6, bottom - 9);
  g.quadraticCurveTo(50, bottom - 3, inset + 6, bottom - 9);
  g.closePath();
  g.fill();

  g.fillStyle = 'rgba(139, 224, 238, .13)';
  g.fillRect(inset + 7, glassBottom - 7, 36, 1.4);

  if (type === 'van') {
    g.strokeStyle = 'rgba(8, 22, 38, .22)';
    g.lineWidth = 1;
    for (let y = 133; y < 187; y += 14) {
      g.beginPath();
      g.moveTo(15, y);
      g.lineTo(85, y);
      g.stroke();
    }
    g.fillStyle = style.stripe;
    g.globalAlpha = 0.75;
    g.fillRect(11, 152, 78, 4);
    g.globalAlpha = 1;
  }
}

function drawBody(g, style) {
  bodyPath(g, style.type);
  const gradient = g.createLinearGradient(10, 20, 90, 190);
  gradient.addColorStop(0, style.light);
  gradient.addColorStop(0.22, style.body);
  gradient.addColorStop(0.68, style.body);
  gradient.addColorStop(1, style.dark);
  g.fillStyle = gradient;
  g.shadowColor = 'rgba(0,0,0,.6)';
  g.shadowBlur = 5;
  g.shadowOffsetY = 2;
  g.fill();
  g.shadowColor = 'transparent';
  g.shadowBlur = 0;
  g.shadowOffsetY = 0;

  g.strokeStyle = 'rgba(255,255,255,.2)';
  g.lineWidth = 0.8;
  g.stroke();

  g.save();
  bodyPath(g, style.type);
  g.clip();
  const shine = g.createLinearGradient(12, 0, 48, 0);
  shine.addColorStop(0, 'rgba(255,255,255,.28)');
  shine.addColorStop(0.35, 'rgba(255,255,255,.04)');
  shine.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = shine;
  g.fillRect(9, 0, 42, 200);
  g.fillStyle = 'rgba(24,7,20,.24)';
  g.fillRect(78, 0, 24, 200);

  if (style.stripe) {
    g.fillStyle = style.stripe;
    g.globalAlpha = style.type === 'muscle' ? 0.84 : 0.66;
    g.fillRect(43, 8, 3.5, 188);
    g.fillRect(53.5, 8, 3.5, 188);
    g.globalAlpha = 1;
  }

  g.strokeStyle = 'rgba(12,8,18,.35)';
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(17, 55);
  g.bezierCurveTo(27, 48, 73, 48, 83, 55);
  g.moveTo(16, 146);
  g.bezierCurveTo(30, 152, 70, 152, 84, 146);
  g.stroke();

  g.strokeStyle = 'rgba(255,255,255,.12)';
  g.beginPath();
  g.moveTo(28, 24);
  g.lineTo(24, 47);
  g.moveTo(72, 24);
  g.lineTo(76, 47);
  g.stroke();

  g.fillStyle = 'rgba(14,8,18,.42)';
  g.fillRect(39, 40, 22, 1.2);
  g.fillRect(39, 44, 22, 1.2);
  g.restore();

  g.fillStyle = style.trim;
  g.globalAlpha = 0.75;
  g.fillRect(36, 17, 8, 2.2);
  g.fillRect(56, 17, 8, 2.2);
  g.globalAlpha = 1;
}

function drawLights(g, style, type) {
  g.save();
  g.shadowBlur = 8;
  g.shadowColor = '#fff2c7';
  g.fillStyle = '#fff7d6';
  if (type === 'van') {
    roundedRect(g, 20, 8, 15, 5, 2);
    g.fill();
    roundedRect(g, 65, 8, 15, 5, 2);
    g.fill();
  } else {
    roundedRect(g, 20, 11, 17, 4.5, 2);
    g.fill();
    roundedRect(g, 63, 11, 17, 4.5, 2);
    g.fill();
  }
  g.restore();

  g.save();
  g.shadowBlur = 8;
  g.shadowColor = style.tail;
  g.fillStyle = style.tail;
  roundedRect(g, 18, 188, 20, 4.5, 2);
  g.fill();
  roundedRect(g, 62, 188, 20, 4.5, 2);
  g.fill();
  g.restore();

  g.fillStyle = 'rgba(240,241,220,.68)';
  roundedRect(g, 43, 189, 14, 5.5, 1.5);
  g.fill();
  g.fillStyle = 'rgba(14,12,20,.8)';
  g.fillRect(46, 191, 8, 1.1);

  if (type === 'muscle' || type === 'coupe') {
    g.fillStyle = 'rgba(9,8,14,.8)';
    g.fillRect(24, 194, 10, 3);
    g.fillRect(66, 194, 10, 3);
  }
}

function drawMirrors(g, style, type) {
  if (type === 'van') return;
  g.fillStyle = style.dark;
  roundedRect(g, 18, 61, 9, 5, 2);
  g.fill();
  roundedRect(g, 73, 61, 9, 5, 2);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,.18)';
  g.fillRect(20, 62, 5, 1);
  g.fillRect(75, 62, 5, 1);
}

function drawSpoiler(g, style) {
  if (style.type !== 'coupe' && style.type !== 'muscle') return;
  g.fillStyle = '#12101a';
  roundedRect(g, 17, 181, 66, 6, 3);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,.16)';
  g.fillRect(21, 182, 58, 1.2);
  g.fillStyle = '#0b0911';
  g.fillRect(26, 176, 5, 9);
  g.fillRect(69, 176, 5, 9);
}

function drawVanDetails(g, style) {
  if (style.type !== 'van') return;
  g.fillStyle = 'rgba(9, 20, 31, .34)';
  g.fillRect(15, 24, 70, 2);
  g.fillStyle = 'rgba(255,255,255,.13)';
  g.fillRect(18, 28, 64, 2);
  g.fillStyle = style.trim;
  g.globalAlpha = 0.38;
  g.font = '700 8px sans-serif';
  g.textAlign = 'center';
  g.fillText('SUNSET', 50, 142);
  g.globalAlpha = 1;
}

export function getCarSprite(key) {
  if (cache.has(key)) return cache.get(key);
  const style = CAR_STYLES[key] || CAR_STYLES.mint;
  const scale = 2.5;
  const sprite = document.createElement('canvas');
  sprite.width = 250;
  sprite.height = 500;
  const g = sprite.getContext('2d');
  g.scale(scale, scale);

  drawWheels(g, style);
  drawBody(g, style);
  drawSpoiler(g, style);
  drawCanopy(g, style);
  drawMirrors(g, style, style.type);
  drawLights(g, style, style.type);
  drawVanDetails(g, style);

  if (style.type !== 'van') {
    g.fillStyle = 'rgba(25,10,25,.32)';
    roundedRect(g, 42, 172, 16, 4, 2);
    g.fill();
  }

  cache.set(key, sprite);
  return sprite;
}
