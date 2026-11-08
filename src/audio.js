const clamp01 = (v) => Math.max(0, Math.min(1, v));

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.noiseBuffer = null;
    this.ambient = null;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.34;
    this.master.connect(this.ctx.destination);

    const len = Math.floor(this.ctx.sampleRate * 1.2);
    this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    // Low ocean wind bed.
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    const g = this.ctx.createGain();
    g.gain.value = 0.055;
    src.connect(filter).connect(g).connect(this.master);
    src.start();
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.08;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 0.025;
    lfo.connect(lfoGain).connect(g.gain);
    lfo.start();
    this.ambient = { src, g };
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.setTargetAtTime(muted ? 0 : 0.34, this.ctx.currentTime, 0.05);
  }

  toggleMute() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  _noise(duration, gain, filterFreq, filterType = 'lowpass', q = 0.7) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.playbackRate.value = 1;
    const filter = this.ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(filterFreq, t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(60, filterFreq * 0.22), t + duration);
    filter.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    src.connect(filter).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + duration + 0.02);
  }

  _tone(freq, endFreq, duration, gain, type = 'sine', when = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t + duration);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + duration + 0.02);
  }

  shot(key = 'rifle', distance = 0) {
    if (!this.ctx) return;
    const near = clamp01(1 - distance / 90);
    const vol = 0.06 + near * 0.42;
    if (key === 'shotgun') {
      this._noise(0.24, vol * 0.95, 2600);
      this._tone(120, 34, 0.19, vol * 0.55, 'sine');
    } else if (key === 'sniper') {
      this._noise(0.32, vol * 1.0, 4200);
      this._tone(190, 40, 0.26, vol * 0.48, 'triangle');
      this._noise(0.06, vol * 0.5, 6000, 'highpass');
    } else if (key === 'smg') {
      this._noise(0.085, vol * 0.7, 3600);
      this._tone(170, 62, 0.07, vol * 0.3, 'square');
    } else if (key === 'pistol') {
      this._noise(0.1, vol * 0.72, 3200);
      this._tone(210, 70, 0.08, vol * 0.3, 'square');
    } else {
      this._noise(0.14, vol * 0.85, 3000);
      this._tone(150, 48, 0.11, vol * 0.4, 'triangle');
    }
  }

  hit(head = false) {
    if (!this.ctx) return;
    this._tone(head ? 1550 : 980, head ? 620 : 460, 0.055, head ? 0.15 : 0.09, 'square');
  }

  kill() {
    if (!this.ctx) return;
    this._tone(440, 880, 0.16, 0.11, 'triangle');
    this._tone(660, 1320, 0.24, 0.09, 'triangle', 0.08);
  }

  reload() {
    if (!this.ctx) return;
    this._noise(0.035, 0.06, 1800, 'bandpass', 4);
    this._tone(320, 180, 0.035, 0.035, 'square', 0.12);
    this._noise(0.05, 0.07, 1200, 'bandpass', 3);
  }

  empty() {
    if (!this.ctx) return;
    this._tone(520, 300, 0.03, 0.05, 'square');
  }

  pickup() {
    if (!this.ctx) return;
    this._tone(660, 990, 0.09, 0.08, 'sine');
    this._tone(990, 1320, 0.12, 0.06, 'sine', 0.08);
  }

  hurt() {
    if (!this.ctx) return;
    this._noise(0.18, 0.16, 700);
    this._tone(90, 44, 0.2, 0.18, 'sawtooth');
  }

  heal() {
    if (!this.ctx) return;
    this._tone(440, 660, 0.12, 0.07, 'sine');
    this._tone(660, 880, 0.16, 0.06, 'sine', 0.1);
  }

  alert() {
    if (!this.ctx) return;
    this._tone(720, 480, 0.22, 0.06, 'square');
  }

  announce(win) {
    if (!this.ctx) return;
    const seq = win ? [523, 659, 784, 1046] : [392, 330, 262, 196];
    seq.forEach((f, i) => this._tone(f, f * 1.01, 0.34, 0.09, 'triangle', i * 0.14));
  }
}
