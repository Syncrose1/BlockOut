/**
 * Synamon transition animation generation script
 * Generates evolution and devolution animations using programmatic pixel dissolve.
 * No API calls — uses ImageMagick to composite start/end sprites.
 *
 * Effect (14 frames total):
 *   Frames 0–6:  start sprite dissolves out (pixels scatter away, top→bottom sweep)
 *   Frames 7–13: end sprite resolves in    (pixels scatter in,   top→bottom sweep)
 *
 * Usage:
 *   npx tsx scripts/generate-transitions.ts
 *   npx tsx scripts/generate-transitions.ts --resume
 *   npx tsx scripts/generate-transitions.ts --species cindrel
 *   npx tsx scripts/generate-transitions.ts --type evo
 *   npx tsx scripts/generate-transitions.ts --type devo
 */

import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import { execSync } from 'child_process';

const SPECIES_FILE = path.resolve('public/synamon/species.json');
const OUT_DIR      = path.resolve('public/synamon');
const STATE_FILE   = path.resolve('public/synamon/transition-state.json');

const TOTAL_FRAMES = 24;  // 12 dissolve-out + 12 dissolve-in
const DISSOLVE_FRAMES = Math.floor(TOTAL_FRAMES / 2);
const SPRITE_SIZE = 64;

// Type → accent colour for the particle flash at midpoint
const TYPE_COLOURS: Record<string, string> = {
  Ignis:   '#ff6633',
  Aqua:    '#33aaff',
  Terra:   '#88aa44',
  Ventus:  '#aaeeff',
  Umbra:   '#9933cc',
  Lux:     '#ffdd22',
  Sonus:   '#44ccaa',
  Arcanus: '#cc44ff',
  Flying:  '#88ccff',
  Ferrous: '#aaaacc',
  Venom:   '#aaee22',
  Natura:  '#44bb44',
};

// --- CLI args ---
const args = process.argv.slice(2);
const resume     = args.includes('--resume');
const speciesArg = args.find(a => a.startsWith('--species='))?.split('=')[1] ??
                   (args.indexOf('--species') >= 0 ? args[args.indexOf('--species') + 1] : null);
const typeArg    = args.find(a => a.startsWith('--type='))?.split('=')[1] ??
                   (args.indexOf('--type') >= 0 ? args[args.indexOf('--type') + 1] : null);

// --- PNG codec (pure Node) ---
function crc32(buf: Buffer): number {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])) >>> 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function rgbaToPng(rgba: Buffer, w: number, h: number): Buffer {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  const rowSize = w * 4;
  const filtered = Buffer.alloc(h * (rowSize + 1));
  for (let y = 0; y < h; y++) {
    filtered[y * (rowSize + 1)] = 0;
    rgba.copy(filtered, y * (rowSize + 1) + 1, y * rowSize, (y + 1) * rowSize);
  }
  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(filtered)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// Decode PNG to raw RGBA using ImageMagick (outputs raw RGBA to stdout)
function pngToRgba(filePath: string, w: number, h: number): Buffer {
  const raw = execSync(
    `magick "${filePath}" -depth 8 rgba:-`,
    { maxBuffer: w * h * 4 * 2 }
  );
  return raw;
}

// --- Dissolve effect ---
// progress 0.0 = fully visible, 1.0 = fully dissolved away
function dissolveOut(src: Buffer, w: number, h: number, progress: number, seed: number, band: number): Buffer {
  const out = Buffer.alloc(w * h * 4, 0);
  const rng = seededRng(seed);
  const BAND = band;

  for (let y = 0; y < h; y++) {
    const rowFrac = y / (h - 1); // 0 at top, 1 at bottom
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      // Per-pixel dissolve threshold: row position + small noise offset
      const jitter = (rng() - 0.5) * BAND;
      const pixelThreshold = rowFrac + jitter;

      if (progress < pixelThreshold) {
        // Not reached yet — pixel survives intact
        out[i]   = src[i];
        out[i+1] = src[i+1];
        out[i+2] = src[i+2];
        out[i+3] = src[i+3];
      } else if (progress < pixelThreshold + BAND) {
        // In the wave front — partially dissolved (fade alpha)
        const fade = 1 - (progress - pixelThreshold) / BAND;
        out[i]   = src[i];
        out[i+1] = src[i+1];
        out[i+2] = src[i+2];
        out[i+3] = Math.round(src[i+3] * fade);
      }
      // else: fully dissolved — stays transparent (0)
    }
  }
  return out;
}

// Dissolve in: pixels arrive top→bottom (same direction as dissolve-out).
// progress 0.0 = nothing visible, 1.0 = fully visible
function dissolveIn(dst: Buffer, w: number, h: number, progress: number, seed: number, band: number): Buffer {
  const out = Buffer.alloc(w * h * 4, 0);
  const rng = seededRng(seed);
  const BAND = band;

  for (let y = 0; y < h; y++) {
    const rowFrac = y / (h - 1); // 0 at top, 1 at bottom
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const jitter = (rng() - 0.5) * BAND;
      const pixelThreshold = rowFrac + jitter; // pixel arrives when progress exceeds its threshold

      if (progress > pixelThreshold + BAND) {
        // Fully arrived
        out[i]   = dst[i];
        out[i+1] = dst[i+1];
        out[i+2] = dst[i+2];
        out[i+3] = dst[i+3];
      } else if (progress > pixelThreshold) {
        // In the wave front — fading in
        const fade = (progress - pixelThreshold) / BAND;
        out[i]   = dst[i];
        out[i+1] = dst[i+1];
        out[i+2] = dst[i+2];
        out[i+3] = Math.round(dst[i+3] * fade);
      }
      // else: not arrived yet — stays transparent
    }
  }
  return out;
}

// Composite two RGBA buffers: wherever src has alpha, blend onto dst
function composite(bottom: Buffer, top: Buffer, size: number): Buffer {
  const out = Buffer.from(bottom);
  for (let i = 0; i < size * size * 4; i += 4) {
    const a = top[i + 3] / 255;
    if (a === 0) continue;
    out[i]   = Math.round(out[i]   * (1 - a) + top[i]   * a);
    out[i+1] = Math.round(out[i+1] * (1 - a) + top[i+1] * a);
    out[i+2] = Math.round(out[i+2] * (1 - a) + top[i+2] * a);
    out[i+3] = Math.min(255, out[i+3] + top[i+3]);
  }
  return out;
}

// Ease-out-in with shifted pause: fast start, nearly stalls at ~65%, accelerates hard to end
function easeIn(t: number, mid = 0.65): number {
  if (t < mid) {
    return 0.5 * (1 - Math.pow(1 - t / mid, 3));
  } else {
    return 0.5 + 0.5 * Math.pow((t - mid) / (1 - mid), 3);
  }
}

// Simple seeded PRNG (mulberry32)
function seededRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s += 0x6D2B79F5;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Add coloured sparks only near the dissolve wave front (around wavePos row)
function addWaveSparks(buf: Buffer, w: number, h: number, colour: string, wavePos: number, band: number): Buffer {
  const r = parseInt(colour.slice(1, 3), 16);
  const g = parseInt(colour.slice(3, 5), 16);
  const b = parseInt(colour.slice(5, 7), 16);
  const out = Buffer.from(buf);
  const rng = seededRng(Math.round(wavePos * 1000));
  const SPARK_BAND = band;

  for (let y = 0; y < h; y++) {
    const rowFrac = y / (h - 1);
    const distToWave = Math.abs(rowFrac - wavePos);
    if (distToWave > SPARK_BAND) continue; // outside spark zone

    const proximity = 1 - distToWave / SPARK_BAND; // 1 at wave, 0 at edge
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (out[i + 3] === 0 && rng() > 0.3) continue; // sparse sparks in empty space
      if (rng() < proximity * 0.6) {
        out[i] = r; out[i+1] = g; out[i+2] = b;
        out[i+3] = Math.round(255 * proximity * (0.5 + rng() * 0.5));
      }
    }
  }
  return out;
}

function parseColour(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1,3),16), parseInt(hex.slice(3,5),16), parseInt(hex.slice(5,7),16)];
}

function blendPixel(buf: Buffer, i: number, r: number, g: number, b: number, a: number, addAlpha = 0) {
  buf[i]   = Math.round(buf[i]   * (1-a) + r * a);
  buf[i+1] = Math.round(buf[i+1] * (1-a) + g * a);
  buf[i+2] = Math.round(buf[i+2] * (1-a) + b * a);
  buf[i+3] = Math.min(255, buf[i+3] + addAlpha);
}

function applyScanline(buf: Buffer, w: number, h: number, r: number, g: number, b: number, scanY: number, halfWidth: number, alpha: number) {
  for (let dy = -halfWidth; dy <= halfWidth; dy++) {
    const y = scanY + dy;
    if (y < 0 || y >= h) continue;
    const proximity = 1 - Math.abs(dy) / (halfWidth + 1);
    const a = alpha * proximity;
    for (let x = 0; x < w; x++) {
      blendPixel(buf, (y * w + x) * 4, r, g, b, a, Math.round(160 * a));
    }
  }
}

// --- Pre-transition: interference → lock-on scans → hold → flash ---
// Timing structure (13 frames total):
//   0–2:   sparse static noise — interference, system detecting
//   3–5:   slow scan pass (faint) — locking on
//   6–7:   fast scan pass (brighter) — acquiring
//   8:     hold — clean sprite, tension before release
//   9–10:  rapid double-flash scan (tight, bright) — lock confirmed
//   11:    hold — silence
//   12:    full accent flash — launch
function generateScanFrames(sprite: Buffer, w: number, h: number, colour: string): Buffer[] {
  const [r, g, b] = parseColour(colour);
  const frames: Buffer[] = [];

  const TOTAL_PRE = 13;

  // Helper: overlay floating particles on a buffer, decaying by frame index
  function addFloatingParticles(buf: Buffer, frameIdx: number) {
    const decay = Math.pow(1 - frameIdx / (TOTAL_PRE - 1), 2); // quadratic decay: full at 0, zero at last
    if (decay < 0.01) return;
    const density = 0.06 * decay;
    const rng = seededRng(frameIdx * 31337);
    for (let i = 0; i < w * h * 4; i += 4) {
      if (buf[i+3] === 0) continue;
      if (rng() < density) {
        const a = (0.3 + rng() * 0.5) * decay;
        blendPixel(buf, i, r, g, b, a, 0);
      }
    }
  }

  // 0–2: sparse noise flicker (particles most intense here)
  for (let f = 0; f < 3; f++) {
    const buf = Buffer.from(sprite);
    addFloatingParticles(buf, f);
    frames.push(buf);
  }

  // 3–5: slow scan pass (3 frames top→bottom, faint, 4px wide) + decaying particles
  for (let f = 0; f < 3; f++) {
    const buf = Buffer.from(sprite);
    addFloatingParticles(buf, 3 + f);
    const scanY = Math.round((f / 2) * (h - 1));
    applyScanline(buf, w, h, r, g, b, scanY, 4, 0.3);
    frames.push(buf);
  }

  // 6–7: fast scan pass (2 frames, brighter, tighter 2px) + fading particles
  for (let f = 0; f < 2; f++) {
    const buf = Buffer.from(sprite);
    addFloatingParticles(buf, 6 + f);
    const scanY = Math.round((f / 1) * (h - 1));
    applyScanline(buf, w, h, r, g, b, scanY, 2, 0.55);
    frames.push(buf);
  }

  // 8: hold — clean sprite with barely-there particles
  {
    const buf = Buffer.from(sprite);
    addFloatingParticles(buf, 8);
    frames.push(buf);
  }

  // 9–10: rapid double-flash alternating scanlines — fade in then fade out
  // f=0: ramp up (alpha 0.0→0.55), f=1: ramp down (0.55→0.0)
  for (let f = 0; f < 2; f++) {
    const scanAlpha = f === 0 ? 0.35 : 0.2; // fade in on first, softer on second
    const buf = Buffer.from(sprite);
    addFloatingParticles(buf, 9 + f);
    for (let y = 0; y < h; y += 3) {
      applyScanline(buf, w, h, r, g, b, y, 1, scanAlpha * (1 - y / h * 0.4));
    }
    frames.push(buf);
  }

  // 11: hold — almost no particles, silence
  {
    const buf = Buffer.from(sprite);
    addFloatingParticles(buf, 11);
    frames.push(buf);
  }

  // 12–14: silhouette fade-in — 3 frames: 25% → 85% → 100%
  for (let f = 0; f < 3; f++) {
    const blend = [0.25, 0.85, 1.0][f];
    const buf = Buffer.from(sprite);
    for (let i = 0; i < w * h * 4; i += 4) {
      if (buf[i+3] < 30) { buf[i+3] = 0; continue; }
      buf[i]   = Math.round(buf[i]   * (1 - blend) + r * blend);
      buf[i+1] = Math.round(buf[i+1] * (1 - blend) + g * blend);
      buf[i+2] = Math.round(buf[i+2] * (1 - blend) + b * blend);
      buf[i+3] = 255;
    }
    frames.push(buf);
  }

  return frames; // 15 frames
}

// --- Post-transition: confirm burst → collapse → edge glow fade ---
// Timing structure (10 frames):
//   0:     instant grid flash — all dots appear at full brightness (shock confirmation)
//   1–3:   outward scatter burst — dots fly out fast then slow (ease-out)
//   4:     hold on clean sprite — stillness
//   5–7:   dots collapse inward from scatter positions back to sprite (ease-in)
//   8:     hold — clean
//   9:     edge accent vignette fades (subtle, system powering down)
function generateDiagFrames(sprite: Buffer, w: number, h: number, colour: string): Buffer[] {
  const [r, g, b] = parseColour(colour);
  const frames: Buffer[] = [];

  // Build grid dot positions on non-transparent pixels
  const GRID = 4;
  const rngDots = seededRng(777);
  const dots: { x: number; y: number; angle: number; dist: number }[] = [];
  for (let y = 0; y < h; y += GRID) {
    for (let x = 0; x < w; x += GRID) {
      if (sprite[(y * w + x) * 4 + 3] > 20) {
        dots.push({
          x, y,
          angle: rngDots() * Math.PI * 2,
          dist:  3 + rngDots() * 9,
        });
      }
    }
  }

  function drawDots(base: Buffer, t: number, direction: 1 | -1, fade: number) {
    // direction 1 = scatter out, -1 = collapse in
    const buf = Buffer.from(base);
    for (const d of dots) {
      const sx = Math.round(d.x + Math.cos(d.angle) * d.dist * t * direction);
      const sy = Math.round(d.y + Math.sin(d.angle) * d.dist * t * direction);
      if (sx < 0 || sx >= w || sy < 0 || sy >= h) continue;
      const i = (sy * w + sx) * 4;
      blendPixel(buf, i, r, g, b, fade, Math.round(220 * fade));
    }
    return buf;
  }

  // 0: instant full grid flash
  {
    const buf = Buffer.from(sprite);
    for (const d of dots) {
      blendPixel(buf, (d.y * w + d.x) * 4, r, g, b, 0.9, 255);
    }
    frames.push(buf);
  }

  // 1–3: outward scatter (ease-out: fast then slow)
  for (let f = 0; f < 3; f++) {
    const tLinear = (f + 1) / 3;
    const t = 1 - Math.pow(1 - tLinear, 2); // ease-out
    const fade = 1 - tLinear * 0.6;
    frames.push(drawDots(sprite, t, 1, fade));
  }

  // 4: hold — clean sprite
  frames.push(Buffer.from(sprite));

  // 5–7: collapse inward (ease-in: slow start, accelerates home)
  for (let f = 0; f < 3; f++) {
    const tLinear = (f + 1) / 3;
    const t = 1 - Math.pow(tLinear, 2); // t goes 1→0, easing in
    const fade = (1 - tLinear) * 0.7;
    frames.push(drawDots(sprite, t, 1, fade));
  }

  // 8: hold — clean
  frames.push(Buffer.from(sprite));

  // 9: edge vignette — accent colour bleeds in from edges, fades to nothing
  {
    const buf = Buffer.from(sprite);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        if (buf[i+3] === 0) continue;
        // Edge proximity: how close to sprite boundary
        const edgeDist = Math.min(x, y, w-1-x, h-1-y) / (Math.min(w,h) / 4);
        const a = Math.max(0, 0.35 * (1 - edgeDist));
        if (a > 0) blendPixel(buf, i, r, g, b, a, 0);
      }
    }
    frames.push(buf);
  }

  return frames; // 10 frames
}

// --- Species JSON ---
function loadSpecies(): any[] {
  return JSON.parse(fs.readFileSync(SPECIES_FILE, 'utf8'));
}

function updateSpeciesJson(speciesId: string, transKey: string, framePaths: string[]) {
  const species = loadSpecies();
  const sp = species.find((s: any) => s.id === speciesId);
  if (!sp) return;
  if (!sp.transitions) sp.transitions = {};
  sp.transitions[transKey] = framePaths.map(p =>
    p.replace(path.resolve('public'), '').replace(/\\/g, '/')
  );
  fs.writeFileSync(SPECIES_FILE, JSON.stringify(species, null, 2));
}

// --- Core generation ---
function generateTransition(
  startPath: string,
  endPath: string,
  outDir: string,
  accentColour: string,
): string[] {
  const startRgba = pngToRgba(startPath, SPRITE_SIZE, SPRITE_SIZE);
  const endRgba   = pngToRgba(endPath,   SPRITE_SIZE, SPRITE_SIZE);

  fs.mkdirSync(outDir, { recursive: true });
  const allFrameBuffers: Buffer[] = [];

  // Build solid accent-colour silhouette of start sprite.
  // The creature "becomes pure data" — dissolves out as its type colour, not its original form.
  const [ar, ag, ab] = parseColour(accentColour);
  const silhouetteRgba = Buffer.from(startRgba);
  for (let i = 0; i < SPRITE_SIZE * SPRITE_SIZE * 4; i += 4) {
    if (silhouetteRgba[i+3] < 30) { silhouetteRgba[i+3] = 0; continue; }
    silhouetteRgba[i]   = ar;
    silhouetteRgba[i+1] = ag;
    silhouetteRgba[i+2] = ab;
    silhouetteRgba[i+3] = 255;
  }

  // --- Pre-transition: scanline sweep (8 frames + 1 flash) ---
  const scanFrames = generateScanFrames(startRgba, SPRITE_SIZE, SPRITE_SIZE, accentColour);
  allFrameBuffers.push(...scanFrames);

  // Both bands ride the same eased curve — dissolve-in trails by a fixed gap.
  // This keeps them moving in lockstep so they look like two rings on one sweep.
  const GAP = 0.18; // how far behind dissolve-in trails dissolve-out (0–1 in progress space)

  const DT = 1 / TOTAL_FRAMES;
  const BAND_MIN = 0.04;  // tightest band (at slowest point)
  const BAND_MAX = 0.12;  // widest band (at fastest point)
  const GAP_MIN  = 0.10;  // tightest entropy zone (at slowest point)
  const GAP_MAX  = 0.18;  // widest entropy zone (at fastest point)
  const MAX_SPEED = easeIn(DT);

  // --- Dissolve transition frames ---
  for (let f = 0; f < TOTAL_FRAMES; f++) {
    // Last dissolve frame: clean end sprite
    if (f === TOTAL_FRAMES - 1) {
      allFrameBuffers.push(Buffer.from(endRgba));
      continue;
    }

    const t = (f + 1) / TOTAL_FRAMES;
    const outProgress = easeIn(t);

    const speed = Math.abs(outProgress - easeIn(Math.max(0, t - DT)));
    const speedNorm = Math.min(1, speed / MAX_SPEED);
    const gap = GAP_MIN + (GAP_MAX - GAP_MIN) * speedNorm;
    const inProgress = Math.max(0, Math.min(1, outProgress - gap));
    const band = BAND_MIN + (BAND_MAX - BAND_MIN) * speedNorm;

    // Dissolve the silhouette (solid accent colour) — not the original sprite
    const outLayer = dissolveOut(silhouetteRgba, SPRITE_SIZE, SPRITE_SIZE, outProgress, f * 1337, band);
    let rgba: Buffer;
    if (inProgress > 0) {
      const inLayer = dissolveIn(endRgba, SPRITE_SIZE, SPRITE_SIZE, inProgress, f * 999, band);
      rgba = composite(outLayer, inLayer, SPRITE_SIZE);
    } else {
      rgba = outLayer;
    }
    if (outProgress > 0.01 && outProgress < 0.99)
      rgba = addWaveSparks(rgba, SPRITE_SIZE, SPRITE_SIZE, accentColour, outProgress, band);
    if (inProgress > 0.01 && inProgress < 0.99)
      rgba = addWaveSparks(rgba, SPRITE_SIZE, SPRITE_SIZE, accentColour, inProgress, band);

    allFrameBuffers.push(rgba);
  }

  // --- Post-transition: diagnostic grid + scatter (7 frames) ---
  const diagFrames = generateDiagFrames(endRgba, SPRITE_SIZE, SPRITE_SIZE, accentColour);
  allFrameBuffers.push(...diagFrames);

  // --- Final clean frame ---
  allFrameBuffers.push(Buffer.from(endRgba));

  // Write all frames
  const paths: string[] = [];
  for (let i = 0; i < allFrameBuffers.length; i++) {
    const outPath = path.join(outDir, `frame${i}.png`);
    fs.writeFileSync(outPath, rgbaToPng(allFrameBuffers[i], SPRITE_SIZE, SPRITE_SIZE));
    paths.push(outPath);
  }

  return paths;
}

// --- Job definition ---
interface TransJob {
  speciesId: string;
  transKey:  string;
  startPath: string;
  endPath:   string;
  accentColour: string;
  outDir:    string;
}

// --- Main ---
async function main() {
  console.log('\n✨ Synamon Phase 4 — Transition Animations (programmatic dissolve)');
  console.log(`Mode: ${resume ? 'resume' : 'fresh'}`);
  if (speciesArg) console.log(`Species: ${speciesArg}`);
  if (typeArg)    console.log(`Type: ${typeArg}`);
  console.log();

  const allSpecies = loadSpecies();
  const jobs: TransJob[] = [];

  for (const sp of allSpecies) {
    if (speciesArg && sp.id !== speciesArg) continue;
    if (sp.stages.length < 2) continue;

    const stages = [...sp.stages].sort((a: any, b: any) => a.stage - b.stage);
    const stageSprites: Record<number, string> = {};

    for (const st of stages) {
      if (!st.sprite) continue;
      const abs = path.resolve('public' + st.sprite);
      if (!fs.existsSync(abs)) { console.log(`  ⚠️  Missing: ${st.sprite}`); continue; }
      stageSprites[st.stage] = abs;
    }

    const stageNums = Object.keys(stageSprites).map(Number).sort();
    const baseStage = stageNums[0];
    const accentColour = TYPE_COLOURS[sp.type] ?? '#33aaff';

    // Evolution: consecutive pairs
    if (!typeArg || typeArg === 'evo') {
      for (let i = 0; i < stageNums.length - 1; i++) {
        const from = stageNums[i], to = stageNums[i + 1];
        const key = `stage${from}-to-stage${to}`;
        const outDir = path.join(OUT_DIR, sp.id, key);
        if (resume && fs.existsSync(outDir) && fs.readdirSync(outDir).some(f => f.endsWith('.png'))) {
          console.log(`  ✓  ${sp.id}/${key} already done`);
          continue;
        }
        jobs.push({ speciesId: sp.id, transKey: key, startPath: stageSprites[from], endPath: stageSprites[to], accentColour, outDir });
      }
    }

    // Devolution: all non-base stages back to base
    if (!typeArg || typeArg === 'devo') {
      for (const from of stageNums.slice(1)) {
        const key = `stage${from}-to-stage${baseStage}`;
        const outDir = path.join(OUT_DIR, sp.id, key);
        if (resume && fs.existsSync(outDir) && fs.readdirSync(outDir).some(f => f.endsWith('.png'))) {
          console.log(`  ✓  ${sp.id}/${key} already done`);
          continue;
        }
        jobs.push({ speciesId: sp.id, transKey: key, startPath: stageSprites[from], endPath: stageSprites[baseStage], accentColour, outDir });
      }
    }
  }

  console.log(`Generating ${jobs.length} transitions (instant, no API)...\n`);

  let done = 0, failed = 0;

  for (const job of jobs) {
    process.stdout.write(`  ${job.speciesId}/${job.transKey}... `);
    try {
      const framePaths = generateTransition(job.startPath, job.endPath, job.outDir, job.accentColour);
      updateSpeciesJson(job.speciesId, job.transKey, framePaths);
      console.log(`✓ ${framePaths.length} frames`);
      done++;
    } catch (err: any) {
      console.log(`✗ ${err.message}`);
      failed++;
    }
  }

  fs.writeFileSync(STATE_FILE, JSON.stringify({ done, failed, timestamp: new Date().toISOString() }, null, 2));
  console.log(`\n✅ Done: ${done}  ✗ Failed: ${failed}`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
