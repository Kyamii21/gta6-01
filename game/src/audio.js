// All sound is synthesized with WebAudio — no audio files, no network. A tiny
// synth helper (tone + filtered noise) plus an engine hum and a two-tone siren
// that follow the game state.
export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = false;
  let engineOsc = null;
  let engineOsc2 = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenTimer = 0;
  let sirenHigh = false;

  function ensure() {
    if (ctx) return true;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 60;
      engineOsc2 = ctx.createOscillator();
      engineOsc2.type = 'square';
      engineOsc2.frequency.value = 30;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(engineGain);
      engineOsc2.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      engineOsc2.start();
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'triangle';
      sirenOsc.frequency.value = 700;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
    } catch {
      ctx = null;
      return false;
    }
    return true;
  }

  function tone(freq, dur, type, vol, slideTo) {
    if (!ensure() || muted) return;
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol || 0.2, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function noise(dur, filterFreq, vol) {
    if (!ensure() || muted) return;
    const t0 = ctx.currentTime;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq || 1200;
    const gain = ctx.createGain();
    gain.gain.value = vol || 0.25;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start(t0);
  }

  return {
    /** Call from any user gesture; browsers block audio before one. */
    unlock() {
      if (ensure() && ctx.state === 'suspended') ctx.resume();
    },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    isMuted() {
      return muted;
    },
    click() { tone(660, 0.07, 'square', 0.12); },
    pickup() { tone(880, 0.1, 'sine', 0.2); tone(1320, 0.14, 'sine', 0.16); },
    coin() { tone(1180, 0.09, 'sine', 0.18, 1560); },
    punch() { noise(0.12, 500, 0.4); tone(120, 0.1, 'sine', 0.3, 60); },
    gunshot() { noise(0.16, 2600, 0.5); tone(180, 0.08, 'square', 0.2, 70); },
    crash() { noise(0.3, 700, 0.5); tone(90, 0.25, 'sine', 0.35, 45); },
    busted() { tone(392, 0.25, 'triangle', 0.25); tone(311, 0.4, 'triangle', 0.25); },
    wasted() { tone(220, 0.5, 'sawtooth', 0.2, 110); tone(165, 0.7, 'sawtooth', 0.2, 82); },
    success() {
      [523, 659, 784, 1046].forEach((f, i) => {
        setTimeout(() => tone(f, 0.22, 'triangle', 0.22), i * 110);
      });
    },
    missionStart() {
      [392, 523, 659].forEach((f, i) => {
        setTimeout(() => tone(f, 0.18, 'triangle', 0.2), i * 100);
      });
    },
    /** Continuous engine hum: `speed01` is 0..1 of top speed, `on` false silences it. */
    engine(speed01, on) {
      if (!ctx || muted) return;
      const target = on ? 0.05 + speed01 * 0.09 : 0;
      engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.08);
      const freq = 55 + speed01 * 130;
      engineOsc.frequency.setTargetAtTime(freq, ctx.currentTime, 0.1);
      engineOsc2.frequency.setTargetAtTime(freq / 2, ctx.currentTime, 0.1);
    },
    /** Continuous siren while any police car is close; call every frame. */
    siren(dt, on) {
      if (!ctx || muted) return;
      sirenGain.gain.setTargetAtTime(on ? 0.045 : 0, ctx.currentTime, 0.15);
      if (!on) return;
      sirenTimer += dt;
      if (sirenTimer > 0.42) {
        sirenTimer = 0;
        sirenHigh = !sirenHigh;
        sirenOsc.frequency.setTargetAtTime(sirenHigh ? 920 : 660, ctx.currentTime, 0.05);
      }
    },
  };
}
