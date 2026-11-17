// Solmar — all sound is synthesized live with WebAudio: no audio files.
// Engine hum, police siren, a small synthwave music loop and one-shot effects.

class SolmarAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.engineOsc1 = null;
    this.engineOsc2 = null;
    this.engineGain = null;
    this.engineFilter = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenLfo = null;
    this.musicTimer = null;
    this.musicStep = 0;
    this.muted = false;
    this.started = false;
  }

  // Called from the Start button (a user gesture), so the context is allowed.
  start() {
    if (this.started) return;
    this.started = true;
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    this._buildEngine();
    this._buildSiren();
    this._startMusic();
  }

  _buildEngine() {
    const ctx = this.ctx;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0.0;
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 420;
    this.engineOsc1 = ctx.createOscillator();
    this.engineOsc1.type = 'sawtooth';
    this.engineOsc1.frequency.value = 55;
    this.engineOsc2 = ctx.createOscillator();
    this.engineOsc2.type = 'square';
    this.engineOsc2.frequency.value = 28;
    const g2 = ctx.createGain(); g2.gain.value = 0.5;
    this.engineOsc1.connect(this.engineFilter);
    this.engineOsc2.connect(g2); g2.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc1.start();
    this.engineOsc2.start();
  }

  // Engine pitch and loudness follow the driven car's speed (0..1).
  setEngine(speedNorm, driving) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const target = driving ? 0.05 + speedNorm * 0.11 : 0.0;
    this.engineGain.gain.setTargetAtTime(target, t, 0.08);
    const freq = 52 + speedNorm * 165;
    this.engineOsc1.frequency.setTargetAtTime(freq, t, 0.06);
    this.engineOsc2.frequency.setTargetAtTime(freq * 0.5, t, 0.06);
    this.engineFilter.frequency.setTargetAtTime(380 + speedNorm * 900, t, 0.1);
  }

  _buildSiren() {
    const ctx = this.ctx;
    this.sirenGain = ctx.createGain();
    this.sirenGain.gain.value = 0.0;
    this.sirenOsc = ctx.createOscillator();
    this.sirenOsc.type = 'triangle';
    this.sirenOsc.frequency.value = 780;
    this.sirenLfo = ctx.createOscillator();
    this.sirenLfo.type = 'square';
    this.sirenLfo.frequency.value = 0.55;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 170;
    this.sirenLfo.connect(lfoGain);
    lfoGain.connect(this.sirenOsc.frequency);
    this.sirenOsc.connect(this.sirenGain);
    this.sirenGain.connect(this.master);
    this.sirenOsc.start();
    this.sirenLfo.start();
  }

  // The siren fades in with the wanted level.
  setSiren(wanted) {
    if (!this.ctx) return;
    const target = wanted > 0 ? 0.028 + wanted * 0.006 : 0.0;
    this.sirenGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.4);
  }

  _startMusic() {
    // A slow synthwave loop: Am – F – C – G, bass roots plus a sparkle arp.
    const roots = [110.0, 87.31, 130.81, 98.0];
    const chords = [[220, 261.63, 329.63], [174.61, 220, 261.63], [196, 246.94, 293.66], [164.81, 196, 246.94]];
    const arpNotes = [440, 523.25, 659.25, 880, 659.25, 523.25];
    const stepDur = 0.22;
    let step = 0;
    const tick = () => {
      if (!this.ctx) return;
      const bar = Math.floor(step / 16) % 4;
      const inBar = step % 16;
      const now = this.ctx.currentTime;
      if (inBar === 0) this._note(roots[bar], now, stepDur * 15, 'sine', 0.10);
      if (inBar % 4 === 0) this._note(chords[bar][inBar / 4 % 3], now, stepDur * 3, 'triangle', 0.035);
      if (step % 2 === 0) this._note(arpNotes[(step / 2 | 0) % arpNotes.length] * 2, now, stepDur * 0.9, 'sine', 0.018);
      if (step % 4 === 2) this._hat(now);
      step++;
    };
    this.musicTimer = setInterval(tick, stepDur * 1000);
  }

  _note(freq, when, dur, type, vol) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(Math.max(vol, 0.0002), when + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    o.connect(g); g.connect(this.master);
    o.start(when); o.stop(when + dur + 0.05);
  }

  _hat(when) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * 0.04);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 7000;
    const g = ctx.createGain(); g.gain.value = 0.05;
    src.connect(hp); hp.connect(g); g.connect(this.master);
    src.start(when);
  }

  // One-shot effects -------------------------------------------------
  blip(freq, dur, type, vol) {
    if (!this.ctx) return;
    this._note(freq || 880, this.ctx.currentTime, dur || 0.12, type || 'sine', vol || 0.12);
  }
  cash() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [880, 1174.66, 1567.98].forEach((f, i) => this._note(f, t + i * 0.07, 0.16, 'triangle', 0.12));
  }
  thud() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(160, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(45, ctx.currentTime + 0.14);
    g.gain.setValueAtTime(0.35, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.16);
    o.connect(g); g.connect(this.master);
    o.start(); o.stop(ctx.currentTime + 0.2);
  }
  crash() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * 0.25);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 900;
    const g = ctx.createGain(); g.gain.value = 0.4;
    src.connect(lp); lp.connect(g); g.connect(this.master);
    src.start();
  }
  boom() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(120, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(30, ctx.currentTime + 0.7);
    g.gain.setValueAtTime(0.6, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.75);
    o.connect(g); g.connect(this.master);
    o.start(); o.stop(ctx.currentTime + 0.8);
    this.crash();
  }
  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
    return this.muted;
  }
}
