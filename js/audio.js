import { clamp } from './utils.js';

const STORAGE_KEY = 'sunsetRunMuted';

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.engineGain = null;
    this.engineFilter = null;
    this.oscA = null;
    this.oscB = null;
    this.noiseBuffer = null;
    this.ready = false;
    this.muted = false;
    this.paused = false;
    try {
      this.muted = localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      this.muted = false;
    }
  }

  init() {
    if (this.ready) {
      this.resume();
      return;
    }
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.36;
      this.master.connect(this.ctx.destination);

      this.engineFilter = this.ctx.createBiquadFilter();
      this.engineFilter.type = 'lowpass';
      this.engineFilter.frequency.value = 520;
      this.engineFilter.Q.value = 2.2;

      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0;

      this.oscA = this.ctx.createOscillator();
      this.oscA.type = 'sawtooth';
      this.oscA.frequency.value = 44;
      this.oscB = this.ctx.createOscillator();
      this.oscB.type = 'triangle';
      this.oscB.frequency.value = 88;

      const sub = this.ctx.createGain();
      sub.gain.value = 0.6;
      this.oscB.connect(sub);
      sub.connect(this.engineFilter);
      this.oscA.connect(this.engineFilter);
      this.engineFilter.connect(this.engineGain);
      this.engineGain.connect(this.master);
      this.oscA.start();
      this.oscB.start();

      const length = Math.floor(this.ctx.sampleRate * 1.2);
      this.noiseBuffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;

      this.ready = true;
    } catch {
      this.ready = false;
    }
  }

  resume() {
    if (this.ctx?.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  setMuted(muted) {
    this.muted = muted;
    try {
      localStorage.setItem(STORAGE_KEY, muted ? '1' : '0');
    } catch {
      /* ignore */
    }
    if (this.master && this.ctx) {
      this.master.gain.cancelScheduledValues(this.ctx.currentTime);
      this.master.gain.linearRampToValueAtTime(muted ? 0 : 0.36, this.ctx.currentTime + 0.08);
    }
  }

  toggleMuted() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  setPaused(paused) {
    this.paused = paused;
    if (!this.engineGain || !this.ctx) return;
    const target = paused ? 0.002 : this.engineTarget ?? 0.03;
    this.engineGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.08);
  }

  updateEngine(kmh, nitro) {
    if (!this.ready || !this.ctx) return;
    const speed = clamp(kmh / 260, 0, 1.3);
    const target = this.paused ? 0.002 : 0.025 + speed * 0.018 + (nitro ? 0.012 : 0);
    this.engineTarget = target;
    this.engineGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.08);
    this.oscA.frequency.setTargetAtTime(38 + speed * 58 + (nitro ? 12 : 0), this.ctx.currentTime, 0.08);
    this.oscB.frequency.setTargetAtTime(76 + speed * 116 + (nitro ? 24 : 0), this.ctx.currentTime, 0.08);
    this.engineFilter.frequency.setTargetAtTime(360 + speed * 720 + (nitro ? 260 : 0), this.ctx.currentTime, 0.1);
  }

  silenceEngine() {
    if (!this.engineGain || !this.ctx) return;
    this.engineGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.15);
  }

  tone(frequency, duration, type = 'sine', volume = 0.08, slide = 0) {
    if (!this.ready || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, frequency + slide), t + duration);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(volume, t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + duration + 0.03);
  }

  coin(step = 0) {
    this.tone(760 + step * 90, 0.12, 'sine', 0.055, 140);
    setTimeout(() => this.tone(1180 + step * 120, 0.1, 'triangle', 0.035), 34);
  }

  whoosh() {
    if (!this.ready || this.muted) return;
    const t = this.ctx.currentTime;
    const source = this.ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 1.4;
    filter.frequency.setValueAtTime(300, t);
    filter.frequency.exponentialRampToValueAtTime(1900, t + 0.22);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.07, t + 0.035);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    source.start(t);
    source.stop(t + 0.34);
  }

  crash() {
    if (!this.ready || this.muted) return;
    const t = this.ctx.currentTime;
    const source = this.ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2100, t);
    filter.frequency.exponentialRampToValueAtTime(160, t + 0.55);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, t);
    gain.gain.exponentialRampToValueAtTime(0.38, t + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    source.start(t);
    source.stop(t + 0.75);

    const osc = this.ctx.createOscillator();
    const og = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(92, t);
    osc.frequency.exponentialRampToValueAtTime(28, t + 0.4);
    og.gain.setValueAtTime(0.22, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    osc.connect(og);
    og.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.5);
  }

  boost() {
    this.tone(180, 0.32, 'sawtooth', 0.04, 320);
  }
}
