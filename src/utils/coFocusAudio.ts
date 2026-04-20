/**
 * Co-Focus Audio Engine — Web Audio API singleton for noise generation + procedural/sample ambient.
 * No external dependencies; uses the same Web Audio API as pomodoroNotifications.ts.
 */

// ─── AudioContext singleton ─────────────────────────────────────────────────

let ctx: AudioContext | null = null;
function getContext(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

// ─── Gain caps ──────────────────────────────────────────────────────────────
// Prevents dangerously loud output even at full slider
const NOISE_GAIN_CAP = 0.04;    // full slider = 0.04 gain
const AMBIENT_GAIN_CAP = 0.15;  // full slider = 0.15 gain

// ─── Noise Generation ───────────────────────────────────────────────────────

let noiseSource: AudioBufferSourceNode | null = null;
let noiseGain: GainNode | null = null;
let noiseFilter: BiquadFilterNode | null = null;

export interface NoiseParams {
  color: 'white' | 'brown' | 'pink';
  lowCut: number;   // highpass frequency (20–2000 Hz)
  highCut: number;  // lowpass frequency (200–20000 Hz)
}

let currentNoiseParams: NoiseParams = { color: 'white', lowCut: 20, highCut: 20000 };

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

function createPinkNoiseBuffer(ac: AudioContext): AudioBuffer {
  // Voss-McCartney algorithm for pink noise (1/f)
  const sr = ac.sampleRate;
  const len = sr * 10;
  const buf = ac.createBuffer(1, len, sr);
  const data = buf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.96900 * b2 + white * 0.1538520;
    b3 = 0.86650 * b3 + white * 0.3104856;
    b4 = 0.55000 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.0168980;
    data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
    b6 = white * 0.115926;
  }
  return buf;
}

export function setNoiseType(type: 'off' | 'white' | 'brown' | 'pink') {
  // Stop existing
  if (noiseSource) {
    try { noiseSource.stop(); } catch (_) { /* already stopped */ }
    noiseSource.disconnect();
    noiseSource = null;
  }
  if (noiseFilter) {
    noiseFilter.disconnect();
    noiseFilter = null;
  }
  if (type === 'off') return;

  currentNoiseParams.color = type;
  rebuildNoise();
}

function rebuildNoise() {
  // Stop existing source
  if (noiseSource) {
    try { noiseSource.stop(); } catch (_) { /* */ }
    noiseSource.disconnect();
    noiseSource = null;
  }
  if (noiseFilter) {
    noiseFilter.disconnect();
    noiseFilter = null;
  }

  const ac = getContext();
  if (!noiseGain) {
    noiseGain = ac.createGain();
    noiseGain.connect(ac.destination);
  }

  const buf = currentNoiseParams.color === 'white'
    ? createWhiteNoiseBuffer(ac)
    : currentNoiseParams.color === 'pink'
    ? createPinkNoiseBuffer(ac)
    : createBrownNoiseBuffer(ac);

  noiseSource = ac.createBufferSource();
  noiseSource.buffer = buf;
  noiseSource.loop = true;

  // Apply filters for fine-grained control
  const hp = ac.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = currentNoiseParams.lowCut;
  hp.Q.value = 0.7;

  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = currentNoiseParams.highCut;
  lp.Q.value = 0.7;

  noiseSource.connect(hp).connect(lp).connect(noiseGain);
  noiseFilter = hp; // keep ref for cleanup
  noiseSource.start();
}

export function setNoiseParams(params: Partial<NoiseParams>) {
  const changed = (
    (params.lowCut !== undefined && params.lowCut !== currentNoiseParams.lowCut) ||
    (params.highCut !== undefined && params.highCut !== currentNoiseParams.highCut) ||
    (params.color !== undefined && params.color !== currentNoiseParams.color)
  );
  if (params.lowCut !== undefined) currentNoiseParams.lowCut = params.lowCut;
  if (params.highCut !== undefined) currentNoiseParams.highCut = params.highCut;
  if (params.color !== undefined) currentNoiseParams.color = params.color;

  // If noise is active, rebuild with new params
  if (changed && noiseSource) {
    rebuildNoise();
  }
}

export function setNoiseVolume(vol: number) {
  if (noiseGain) {
    const actualGain = vol * NOISE_GAIN_CAP;
    noiseGain.gain.setTargetAtTime(actualGain, getContext().currentTime, 0.05);
  }
}

// ─── Procedural & Sample Ambient Layers ─────────────────────────────────────

export interface AmbientVariant {
  src: string;
  label: string;
}

export interface AmbientLayerConfig {
  type: 'crackle' | 'chirp' | 'rain' | 'wind' | 'waves' | 'sample';
  intensity?: number;
  frequency?: [number, number];
  interval?: [number, number];
  src?: string; // for sample type
  variants?: AmbientVariant[]; // selectable audio variants
}

let ambientGain: GainNode | null = null;
let ambientLayers: Array<{ cleanup: () => void }> = [];
let ambientMasterVolume = 0.5;

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

function createSampleLayer(ac: AudioContext, dest: AudioNode, intensity: number, src: string) {
  let sourceNode: AudioBufferSourceNode | null = null;
  let gainNode: GainNode | null = null;
  let alive = true;

  // Load the MP3 and play it looped
  fetch(src)
    .then(res => res.arrayBuffer())
    .then(buf => ac.decodeAudioData(buf))
    .then(audioBuf => {
      if (!alive) return;
      sourceNode = ac.createBufferSource();
      sourceNode.buffer = audioBuf;
      sourceNode.loop = true;

      gainNode = ac.createGain();
      gainNode.gain.value = intensity;

      sourceNode.connect(gainNode).connect(dest);
      sourceNode.start();
    })
    .catch(() => { /* failed to load sample */ });

  return {
    cleanup: () => {
      alive = false;
      if (sourceNode) {
        try { sourceNode.stop(); } catch (_) { /* */ }
        sourceNode.disconnect();
      }
      if (gainNode) gainNode.disconnect();
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
      case 'sample':
        if (cfg.src) {
          ambientLayers.push(createSampleLayer(ac, ambientGain, intensity, cfg.src));
        }
        break;
    }
  }
}

export function setAmbientOn(on: boolean) {
  if (ambientGain) {
    ambientGain.gain.setTargetAtTime(on ? ambientMasterVolume * AMBIENT_GAIN_CAP : 0, getContext().currentTime, 0.1);
  }
}

export function setAmbientVolume(vol: number) {
  ambientMasterVolume = vol;
  if (ambientGain) {
    const actualGain = vol * AMBIENT_GAIN_CAP;
    ambientGain.gain.setTargetAtTime(actualGain, getContext().currentTime, 0.05);
  }
}

export function cleanup() {
  // Stop noise
  if (noiseSource) {
    try { noiseSource.stop(); } catch (_) { /* */ }
    noiseSource.disconnect();
    noiseSource = null;
  }
  if (noiseFilter) { noiseFilter.disconnect(); noiseFilter = null; }
  if (noiseGain) { noiseGain.disconnect(); noiseGain = null; }

  // Stop ambient layers
  for (const l of ambientLayers) l.cleanup();
  ambientLayers = [];
  if (ambientGain) { ambientGain.disconnect(); ambientGain = null; }
}
