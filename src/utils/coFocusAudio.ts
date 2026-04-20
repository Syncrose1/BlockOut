/**
 * Co-Focus Audio Engine — Web Audio API singleton for noise generation + procedural ambient.
 * No external dependencies; uses the same Web Audio API as pomodoroNotifications.ts.
 */

// ─── AudioContext singleton ─────────────────────────────────────────────────

let ctx: AudioContext | null = null;
function getContext(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

// ─── Noise Generation ───────────────────────────────────────────────────────

let noiseSource: AudioBufferSourceNode | null = null;
let noiseGain: GainNode | null = null;

function createWhiteNoiseBuffer(ac: AudioContext): AudioBuffer {
  const sr = ac.sampleRate;
  const len = sr * 10; // 10 seconds
  const buf = ac.createBuffer(1, len, sr);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

function createBrownNoiseBuffer(ac: AudioContext): AudioBuffer {
  const sr = ac.sampleRate;
  const len = sr * 10;
  const buf = ac.createBuffer(1, len, sr);
  const data = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02;
    data[i] = last * 3.5; // boost amplitude
  }
  return buf;
}

export function setNoiseType(type: 'off' | 'white' | 'brown') {
  // Stop existing
  if (noiseSource) {
    try { noiseSource.stop(); } catch (_) { /* already stopped */ }
    noiseSource.disconnect();
    noiseSource = null;
  }
  if (type === 'off') return;

  const ac = getContext();
  if (!noiseGain) {
    noiseGain = ac.createGain();
    noiseGain.connect(ac.destination);
  }

  const buf = type === 'white' ? createWhiteNoiseBuffer(ac) : createBrownNoiseBuffer(ac);
  noiseSource = ac.createBufferSource();
  noiseSource.buffer = buf;
  noiseSource.loop = true;
  noiseSource.connect(noiseGain);
  noiseSource.start();
}

export function setNoiseVolume(vol: number) {
  if (noiseGain) {
    noiseGain.gain.setTargetAtTime(vol, getContext().currentTime, 0.05);
  }
}

// ─── Procedural Ambient Layers ──────────────────────────────────────────────

export interface AmbientLayerConfig {
  type: 'crackle' | 'chirp' | 'rain' | 'wind' | 'waves';
  intensity?: number;
  frequency?: [number, number];
  interval?: [number, number];
}

let ambientGain: GainNode | null = null;
let ambientLayers: Array<{ cleanup: () => void }> = [];

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function createCrackleLayer(ac: AudioContext, dest: AudioNode, intensity: number) {
  let timer: number;
  let alive = true;

  function burst() {
    if (!alive) return;
    const duration = rand(0.05, 0.15);
    const noiseBuf = ac.createBuffer(1, Math.ceil(ac.sampleRate * duration), ac.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    const src = ac.createBufferSource();
    src.buffer = noiseBuf;
    const bp = ac.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = rand(800, 3000);
    bp.Q.value = 2;
    const gain = ac.createGain();
    gain.gain.value = intensity * 0.4;
    gain.gain.setTargetAtTime(0, ac.currentTime + duration * 0.7, duration * 0.1);

    src.connect(bp).connect(gain).connect(dest);
    src.start();
    src.onended = () => { src.disconnect(); bp.disconnect(); gain.disconnect(); };

    timer = window.setTimeout(burst, rand(100, 600));
  }

  burst();
  return { cleanup: () => { alive = false; clearTimeout(timer); } };
}

function createChirpLayer(ac: AudioContext, dest: AudioNode, intensity: number, freq?: [number, number], interval?: [number, number]) {
  let timer: number;
  let alive = true;
  const fRange = freq || [3000, 5000];
  const iRange = interval || [0.5, 3];

  function chirp() {
    if (!alive) return;
    const f = rand(fRange[0], fRange[1]);
    const dur = rand(0.03, 0.08);

    const osc = ac.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = f;
    osc.frequency.setTargetAtTime(f * 0.7, ac.currentTime, dur * 0.5);

    const gain = ac.createGain();
    gain.gain.value = intensity * 0.15;
    gain.gain.setTargetAtTime(0, ac.currentTime + dur * 0.6, dur * 0.15);

    osc.connect(gain).connect(dest);
    osc.start();
    osc.stop(ac.currentTime + dur);
    osc.onended = () => { osc.disconnect(); gain.disconnect(); };

    timer = window.setTimeout(chirp, rand(iRange[0], iRange[1]) * 1000);
  }

  chirp();
  return { cleanup: () => { alive = false; clearTimeout(timer); } };
}

function createRainLayer(ac: AudioContext, dest: AudioNode, intensity: number) {
  // Continuous highpass filtered white noise
  const sr = ac.sampleRate;
  const len = sr * 10;
  const buf = ac.createBuffer(1, len, sr);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

  const src = ac.createBufferSource();
  src.buffer = buf;
  src.loop = true;

  const hp = ac.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 1000;

  const gain = ac.createGain();
  gain.gain.value = intensity * 0.25;

  src.connect(hp).connect(gain).connect(dest);
  src.start();

  return {
    cleanup: () => {
      try { src.stop(); } catch (_) { /* */ }
      src.disconnect(); hp.disconnect(); gain.disconnect();
    },
  };
}

function createWindLayer(ac: AudioContext, dest: AudioNode, intensity: number) {
  // Brown noise with slow gain LFO
  const sr = ac.sampleRate;
  const len = sr * 10;
  const buf = ac.createBuffer(1, len, sr);
  const data = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    data[i] = last * 3.5;
  }

  const src = ac.createBufferSource();
  src.buffer = buf;
  src.loop = true;

  const gain = ac.createGain();
  gain.gain.value = intensity * 0.3;

  // LFO for wind gusts
  const lfo = ac.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = 1 / rand(4, 8);
  const lfoGain = ac.createGain();
  lfoGain.gain.value = intensity * 0.15;
  lfo.connect(lfoGain).connect(gain.gain);
  lfo.start();

  src.connect(gain).connect(dest);
  src.start();

  return {
    cleanup: () => {
      try { src.stop(); lfo.stop(); } catch (_) { /* */ }
      src.disconnect(); gain.disconnect(); lfo.disconnect(); lfoGain.disconnect();
    },
  };
}

function createWavesLayer(ac: AudioContext, dest: AudioNode, intensity: number) {
  // Brown noise through lowpass with slow gain LFO
  const sr = ac.sampleRate;
  const len = sr * 10;
  const buf = ac.createBuffer(1, len, sr);
  const data = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    data[i] = last * 3.5;
  }

  const src = ac.createBufferSource();
  src.buffer = buf;
  src.loop = true;

  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 400;

  const gain = ac.createGain();
  gain.gain.value = intensity * 0.35;

  // LFO for wave swell
  const lfo = ac.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = 1 / rand(6, 12);
  const lfoGain = ac.createGain();
  lfoGain.gain.value = intensity * 0.2;
  lfo.connect(lfoGain).connect(gain.gain);
  lfo.start();

  src.connect(lp).connect(gain).connect(dest);
  src.start();

  return {
    cleanup: () => {
      try { src.stop(); lfo.stop(); } catch (_) { /* */ }
      src.disconnect(); lp.disconnect(); gain.disconnect(); lfo.disconnect(); lfoGain.disconnect();
    },
  };
}

export function loadAmbientForScene(configs: AmbientLayerConfig[]) {
  // Cleanup existing
  for (const l of ambientLayers) l.cleanup();
  ambientLayers = [];

  if (!configs || configs.length === 0) return;

  const ac = getContext();
  if (!ambientGain) {
    ambientGain = ac.createGain();
    ambientGain.connect(ac.destination);
  }

  for (const cfg of configs) {
    const intensity = cfg.intensity ?? 0.5;
    switch (cfg.type) {
      case 'crackle':
        ambientLayers.push(createCrackleLayer(ac, ambientGain, intensity));
        break;
      case 'chirp':
        ambientLayers.push(createChirpLayer(ac, ambientGain, intensity, cfg.frequency, cfg.interval));
        break;
      case 'rain':
        ambientLayers.push(createRainLayer(ac, ambientGain, intensity));
        break;
      case 'wind':
        ambientLayers.push(createWindLayer(ac, ambientGain, intensity));
        break;
      case 'waves':
        ambientLayers.push(createWavesLayer(ac, ambientGain, intensity));
        break;
    }
  }
}

export function setAmbientOn(on: boolean) {
  if (ambientGain) {
    ambientGain.gain.setTargetAtTime(on ? 1 : 0, getContext().currentTime, 0.1);
  }
}

export function setAmbientVolume(vol: number) {
  if (ambientGain) {
    ambientGain.gain.setTargetAtTime(vol, getContext().currentTime, 0.05);
  }
}

export function cleanup() {
  // Stop noise
  if (noiseSource) {
    try { noiseSource.stop(); } catch (_) { /* */ }
    noiseSource.disconnect();
    noiseSource = null;
  }
  if (noiseGain) { noiseGain.disconnect(); noiseGain = null; }

  // Stop ambient layers
  for (const l of ambientLayers) l.cleanup();
  ambientLayers = [];
  if (ambientGain) { ambientGain.disconnect(); ambientGain = null; }
}
