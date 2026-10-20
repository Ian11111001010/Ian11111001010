// ============================================================
// SERPENTINE — Procedural Audio Engine (WebAudio, no assets)
// Синтезированные звуки: шипение, поедание, удары, эмбиом-дроны
// ============================================================

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.sfxGain = null;
    this.musicGain = null;
    this.enabled = true;
    this.noiseBuffer = null;
    this.drones = [];
    this.heartbeatTimer = null;
  }

  init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.9;
      this.masterGain.connect(this.ctx.destination);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 0.8;
      this.sfxGain.connect(this.masterGain);

      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.5;
      this.musicGain.connect(this.masterGain);

      // белый шум для "шипения" и сыра
      const len = this.ctx.sampleRate * 2;
      this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    } catch (e) {
      this.enabled = false;
    }
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  setVolume(v) {
    if (this.masterGain) this.masterGain.gain.value = v;
  }

  _now() { return this.ctx.currentTime; }

  // ---------- БАЗОВЫЕ СИНТЕЗАТОРЫ ----------
  tone(freq, dur, type = 'sine', vol = 0.3, slideTo = null, dest = null) {
    if (!this.enabled || !this.ctx) return;
    const t = this._now();
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(dest || this.sfxGain);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  noise(dur, filterFreq, vol = 0.3, q = 1, sweepTo = null) {
    if (!this.enabled || !this.ctx) return;
    const t = this._now();
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(filterFreq, t);
    if (sweepTo) filter.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    filter.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter); filter.connect(g); g.connect(this.sfxGain);
    src.start(t); src.stop(t + dur + 0.05);
  }

  // ---------- ИГРОВЫЕ СОБЫТИЯ ----------
  hiss(intensity = 1) {
    this.noise(0.35 * intensity, 3200, 0.12 * intensity, 0.7, 1400);
  }

  eat(pitchStep = 0) {
    // влажный "хрум" + восходящий тон (комбо растёт по высоте)
    const base = 220 * Math.pow(1.0595, Math.min(pitchStep, 24));
    this.noise(0.08, 900, 0.25, 2);
    this.tone(base, 0.18, 'triangle', 0.28, base * 1.6);
    setTimeout(() => this.tone(base * 1.5, 0.14, 'sine', 0.2, base * 2.2), 60);
  }

  goldenEat() {
    this.eat(4);
    [523, 659, 784, 1047].forEach((f, i) =>
      setTimeout(() => this.tone(f, 0.3, 'sine', 0.18), i * 70));
  }

  poisonEat() {
    this.tone(160, 0.5, 'sawtooth', 0.3, 60);
    this.noise(0.5, 400, 0.2, 1, 100);
  }

  hitWall() {
    this.noise(0.25, 200, 0.5, 0.8, 60);
    this.tone(90, 0.3, 'square', 0.35, 40);
  }

  biteSelf() {
    this.noise(0.15, 1500, 0.3, 3);
    this.tone(300, 0.2, 'sawtooth', 0.25, 120);
  }

  hurt() {
    this.tone(140, 0.35, 'sawtooth', 0.3, 70);
    this.noise(0.3, 600, 0.25, 1);
  }

  dash() {
    this.noise(0.25, 800, 0.2, 1.5, 2600);
  }

  levelComplete() {
    const notes = [392, 523, 659, 784, 1047];
    notes.forEach((f, i) => setTimeout(() => {
      this.tone(f, 0.5, 'triangle', 0.22);
      this.tone(f * 2, 0.4, 'sine', 0.1);
    }, i * 130));
  }

  gameOver() {
    const notes = [330, 294, 262, 196, 131];
    notes.forEach((f, i) => setTimeout(() => this.tone(f, 0.7, 'sawtooth', 0.18, f * 0.7), i * 220));
    this.noise(1.4, 300, 0.12, 0.5, 60);
  }

  uiClick() { this.tone(880, 0.06, 'square', 0.08, 660); }
  uiHover() { this.tone(1320, 0.04, 'sine', 0.05); }

  heartbeat(on) {
    if (on && !this.heartbeatTimer) {
      const beat = () => {
        this.tone(55, 0.12, 'sine', 0.4, 40);
        setTimeout(() => this.tone(50, 0.1, 'sine', 0.28, 38), 140);
      };
      beat();
      this.heartbeatTimer = setInterval(beat, 900);
    } else if (!on && this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  countdownBeep(final = false) {
    this.tone(final ? 880 : 440, final ? 0.4 : 0.15, 'square', 0.15);
  }

  // ---------- ЭМБИОМ-МУЗЫКА (настраивается под биом) ----------
  startAmbient(config) {
    this.stopAmbient();
    if (!this.enabled || !this.ctx) return;
    const { root = 110, scale = [0, 3, 5, 7, 10], color = 'minor', tempo = 0.0004 } = config || {};
    // Дрон: два расстроенных осциллятора + низкочастотный фильтр
    for (const detune of [-6, 6, 0]) {
      const osc = this.ctx.createOscillator();
      osc.type = color === 'major' ? 'triangle' : 'sawtooth';
      osc.frequency.value = root / 2;
      osc.detune.value = detune;
      const filt = this.ctx.createBiquadFilter();
      filt.type = 'lowpass'; filt.frequency.value = 320; filt.Q.value = 2;
      const g = this.ctx.createGain(); g.gain.value = 0.05;
      // медленная модуляция громкости — "дыхание"
      const lfo = this.ctx.createOscillator();
      const lfoG = this.ctx.createGain();
      lfo.frequency.value = 0.07 + Math.random() * 0.05;
      lfoG.gain.value = 0.03;
      lfo.connect(lfoG); lfoG.connect(g.gain);
      osc.connect(filt); filt.connect(g); g.connect(this.musicGain);
      osc.start(); lfo.start();
      this.drones.push(osc, lfo, g);
    }
    // Случайные редкие ноты из гаммы биома
    const playNote = () => {
      if (!this.ctx) return;
      const semi = scale[Math.floor(Math.random() * scale.length)] + 12 * (Math.random() < 0.3 ? 12 : 0);
      const f = root * Math.pow(2, semi / 12) * (Math.random() < 0.5 ? 2 : 1);
      this.tone(f, 2.2 + Math.random() * 2, 'sine', 0.07 + Math.random() * 0.05, null, this.musicGain);
      if (Math.random() < 0.35) this.tone(f * 1.5, 1.8, 'triangle', 0.04, null, this.musicGain);
      this._noteTimer = setTimeout(playNote, 1500 + Math.random() * 4500);
    };
    this._noteTimer = setTimeout(playNote, 800);
  }

  stopAmbient() {
    if (this._noteTimer) clearTimeout(this._noteTimer);
    for (const n of this.drones) { try { n.stop ? n.stop() : n.disconnect(); } catch (e) {} }
    this.drones = [];
  }
}

export const audio = new AudioEngine();
