// Sound, synthesized live with WebAudio: no audio files ship with the game.
// Engine hum, police sirens, pickups, a mission jingle, crashes, and a quiet
// synthwave pad that loops under everything.
export function createAudio() {
  const audio = {
    ctx: null, muted: false, engineOsc: null, engineGain: null,
    engineSub: null, sirenOsc: null, sirenGain: null, sirenLfo: null,
    musicTimer: null, musicStep: 0,
  };

  function ensure() {
    if (audio.ctx) {
      if (audio.ctx.state === 'suspended') audio.ctx.resume();
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      audio.ctx = new AC();
    } catch {
      return false;
    }
    const ctx = audio.ctx;
    // Engine: a sawtooth plus a sub sine, pitch follows speed.
    audio.engineOsc = ctx.createOscillator();
    audio.engineOsc.type = 'sawtooth';
    audio.engineOsc.frequency.value = 55;
    audio.engineSub = ctx.createOscillator();
    audio.engineSub.type = 'sine';
    audio.engineSub.frequency.value = 30;
    audio.engineGain = ctx.createGain();
    audio.engineGain.gain.value = 0;
    const engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 420;
    audio.engineOsc.connect(engineFilter);
    audio.engineSub.connect(engineFilter);
    engineFilter.connect(audio.engineGain);
    audio.engineGain.connect(ctx.destination);
    audio.engineOsc.start();
    audio.engineSub.start();
    // Siren: a square wave wobbling between two tones.
    audio.sirenOsc = ctx.createOscillator();
    audio.sirenOsc.type = 'square';
    audio.sirenOsc.frequency.value = 780;
    audio.sirenGain = ctx.createGain();
    audio.sirenGain.gain.value = 0;
    audio.sirenLfo = ctx.createOscillator();
    audio.sirenLfo.type = 'square';
    audio.sirenLfo.frequency.value = 0.9;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 170;
    audio.sirenLfo.connect(lfoGain);
    lfoGain.connect(audio.sirenOsc.frequency);
    audio.sirenOsc.connect(audio.sirenGain);
    audio.sirenGain.connect(ctx.destination);
    audio.sirenOsc.start();
    audio.sirenLfo.start();
    startMusic(audio);
    return true;
  }

  function startMusic(a) {
    // A slow Am–F–C–G pad: two detuned triangles per chord, very quiet.
    const chords = [
      [110.0, 130.8, 164.8], [87.3, 130.8, 174.6],
      [130.8, 164.8, 196.0], [98.0, 146.8, 196.0],
    ];
    let chordNodes = [];
    const playChord = () => {
      for (const n of chordNodes) {
        try { n.gain.gain.linearRampToValueAtTime(0, a.ctx.currentTime + 0.8); n.osc.stop(a.ctx.currentTime + 0.9); } catch { /* already stopped */ }
      }
      chordNodes = [];
      const chord = chords[a.musicStep % chords.length];
      a.musicStep += 1;
      for (const f of chord) {
        const osc = a.ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = f;
        osc.detune.value = (Math.random() - 0.5) * 8;
        const gain = a.ctx.createGain();
        gain.gain.value = 0;
        gain.gain.linearRampToValueAtTime(0.016, a.ctx.currentTime + 1.2);
        osc.connect(gain);
        gain.connect(a.ctx.destination);
        osc.start();
        chordNodes.push({ osc, gain });
      }
    };
    playChord();
    a.musicTimer = window.setInterval(playChord, 4200);
  }

  function blip(freq, dur, type, vol, when = 0) {
    if (!audio.ctx || audio.muted) return;
    const ctx = audio.ctx;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol || 0.12, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  return {
    unlock() { ensure(); },
    setMuted(m) {
      audio.muted = m;
      if (audio.engineGain) audio.engineGain.gain.value = 0;
      if (audio.sirenGain) audio.sirenGain.gain.value = 0;
    },
    get muted() { return audio.muted; },
    setEngine(speedNorm, inCar) {
      if (!audio.ctx || audio.muted) return;
      const target = inCar ? 0.05 + speedNorm * 0.06 : 0;
      audio.engineGain.gain.setTargetAtTime(target, audio.ctx.currentTime, 0.1);
      const f = 52 + speedNorm * 130;
      audio.engineOsc.frequency.setTargetAtTime(f, audio.ctx.currentTime, 0.08);
      audio.engineSub.frequency.setTargetAtTime(f / 2, audio.ctx.currentTime, 0.08);
    },
    setSiren(on) {
      if (!audio.ctx) return;
      audio.sirenGain.gain.setTargetAtTime(on && !audio.muted ? 0.028 : 0, audio.ctx.currentTime, 0.2);
    },
    pickup() { blip(880, 0.12, 'sine', 0.14); blip(1318, 0.18, 'sine', 0.12, 0.09); },
    crash(strength) {
      if (!audio.ctx || audio.muted) return;
      const ctx = audio.ctx;
      const dur = 0.25;
      const buffer = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const gain = ctx.createGain();
      gain.gain.value = Math.min(0.4, 0.1 + strength * 0.012);
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 900;
      src.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      src.start();
      blip(70, 0.3, 'sine', 0.2);
    },
    punch() { blip(140, 0.12, 'square', 0.12); },
    jingle() {
      [523, 659, 784, 1046].forEach((f, i) => blip(f, 0.22, 'triangle', 0.13, i * 0.11));
    },
    fail() {
      [392, 330, 262].forEach((f, i) => blip(f, 0.3, 'sawtooth', 0.07, i * 0.16));
    },
    busted() {
      [660, 660, 520].forEach((f, i) => blip(f, 0.25, 'square', 0.08, i * 0.2));
    },
  };
}
