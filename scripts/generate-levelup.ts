/**
 * Synamon levelup animation generation — fully procedural, no API calls.
 *
 * Generates an 18-frame levelup animation per species using their type accent
 * colour. The creature stays in its base form throughout. Pipeline:
 *   Frames 0–2:    underglow rises from the sprite's base, faint
 *   Frames 3–9:    rising sparkle column erupts from the sprite outline
 *   Frames 10–13:  peak — full accent-tint flash + halo + sparks above
 *   Frames 14–17:  sparks dissipate, glow shrinks back, returns to clean sprite
 *
 * Generated per stage 1 only (matches tamagotchi convention — only base forms
 * have lifecycle anims). Frames written to:
 *   public/synamon/<species>/stage1-levelup/frame{0..17}.png
 * and registered into species.json under animations["stage1-levelup"].
 *
 * Usage:
 *   npx tsx scripts/generate-levelup.ts                        (all species)
 *   npx tsx scripts/generate-levelup.ts --resume               (skip existing)
 *   npx tsx scripts/generate-levelup.ts --species cindrel
 */

import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import { execSync } from 'child_process';

const SPECIES_FILE = path.resolve('public/synamon/species.json');
const OUT_DIR = path.resolve('public/synamon');

const SPRITE_SIZE = 64;
const FRAMES = 18;

// ─── Type → accent colour (extended from transitions to cover all 14 types) ──
const TYPE_COLOURS: Record<string, string> = {
  Ignis:    '#ff6633',
  Aqua:     '#33aaff',
  Terra:    '#88aa44',
  Ventus:   '#aaeeff',
  Umbra:    '#9933cc',
  Lux:      '#ffdd22',
  Sonus:    '#44ccaa',
  Arcanus:  '#cc44ff',
  Spiritus: '#ddccff',
  Normal:   '#e0d8b0',
  Flying:   '#88ccff',
  Ferrous:  '#aaaacc',
  Venom:    '#aaee22',
  Natura:   '#44bb44',
};

// ─── CLI ────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const resume = args.includes('--resume');
const speciesArg =
  args.find(a => a.startsWith('--species='))?.split('=')[1] ??
  (args.indexOf('--species') >= 0 ? args[args.indexOf('--species') + 1] : null);

// ─── PNG codec (no deps) ─────────────────────────────────────────────────────
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
  ihdr[8] = 8; ihdr[9] = 6;
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
function pngToRgba(filePath: string, w: number, h: number): Buffer {
  return execSync(`magick "${filePath}" -depth 8 rgba:-`, { maxBuffer: w * h * 4 * 2 });
}

// ─── helpers ────────────────────────────────────────────────────────────────
function parseColour(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}
function seededRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s += 0x6D2B79F5;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function blendPixel(buf: Buffer, i: number, r: number, g: number, b: number, a: number, addAlpha = 0) {
  if (i < 0 || i + 3 >= buf.length) return;
  buf[i]     = Math.round(buf[i]     * (1 - a) + r * a);
  buf[i + 1] = Math.round(buf[i + 1] * (1 - a) + g * a);
  buf[i + 2] = Math.round(buf[i + 2] * (1 - a) + b * a);
  buf[i + 3] = Math.min(255, buf[i + 3] + addAlpha);
}

// ─── sprite analysis ────────────────────────────────────────────────────────
interface SpriteInfo {
  outline: { x: number; y: number }[];   // pixels on the visible outline (alpha boundary)
  baseY: number;                          // bottom-most opaque row
  topY: number;                           // top-most opaque row
  centerX: number;                        // weighted x centroid
}

function analyseSprite(rgba: Buffer, w: number, h: number): SpriteInfo {
  const outline: { x: number; y: number }[] = [];
  let topY = h, baseY = 0, sumX = 0, count = 0;

  const isOpaque = (x: number, y: number) => {
    if (x < 0 || x >= w || y < 0 || y >= h) return false;
    return rgba[(y * w + x) * 4 + 3] > 30;
  };

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!isOpaque(x, y)) continue;
      sumX += x; count++;
      if (y < topY) topY = y;
      if (y > baseY) baseY = y;
      // outline = opaque pixel adjacent to a transparent neighbour
      if (!isOpaque(x - 1, y) || !isOpaque(x + 1, y) ||
          !isOpaque(x, y - 1) || !isOpaque(x, y + 1)) {
        outline.push({ x, y });
      }
    }
  }
  return {
    outline,
    baseY: count ? baseY : h - 1,
    topY: count ? topY : 0,
    centerX: count ? Math.round(sumX / count) : Math.floor(w / 2),
  };
}

// ─── effects ────────────────────────────────────────────────────────────────
/** Soft halo: dilates the sprite outline outward by `radius` px in accent colour. */
function addHalo(buf: Buffer, w: number, h: number, sprite: Buffer, r: number, g: number, b: number, radius: number, alpha: number) {
  if (alpha <= 0 || radius <= 0) return;
  const isOpaque = (x: number, y: number) =>
    x >= 0 && x < w && y >= 0 && y < h && sprite[(y * w + x) * 4 + 3] > 30;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (buf[i + 3] > 30) continue; // don't paint over the sprite itself
      // Find the closest opaque sprite pixel within `radius`
      let bestDist = radius + 1;
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (dx * dx + dy * dy > radius * radius) continue;
          if (isOpaque(x + dx, y + dy)) {
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d < bestDist) bestDist = d;
          }
        }
      }
      if (bestDist > radius) continue;
      const falloff = 1 - bestDist / radius;
      const a = alpha * falloff * falloff;
      blendPixel(buf, i, r, g, b, a, Math.round(220 * a));
    }
  }
}

/**
 * Rising sparkle column. Spawns particles from the sprite's outline and lets
 * them rise upward, fading as they reach the top. `progress` is 0..1 where 0
 * = column just starting, 1 = column at peak emission.
 */
function addRisingSparkles(
  buf: Buffer, w: number, h: number,
  info: SpriteInfo, r: number, g: number, b: number,
  progress: number, intensity: number, frameSeed: number,
) {
  if (intensity <= 0) return;
  const rng = seededRng(frameSeed);
  // Spawn ~N particles per frame, scaled by intensity. Each particle has a
  // life position 0..1 along its rise from sprite base to above the head.
  const particleCount = Math.round(40 * intensity);
  const riseSpan = info.baseY - info.topY + 12; // can rise just above the head

  for (let n = 0; n < particleCount; n++) {
    // Pick an outline point near the top half of the sprite (so sparks come
    // FROM the body upward, not from the feet).
    const outlinePool = info.outline.filter(p => p.y < info.baseY - 4);
    if (outlinePool.length === 0) continue;
    const origin = outlinePool[Math.floor(rng() * outlinePool.length)];

    // Each particle's life position is offset by progress + jitter
    const life = (rng() * 0.6 + progress * 0.6) % 1;
    const px = origin.x + Math.round((rng() - 0.5) * 4);
    const py = origin.y - Math.round(life * riseSpan);

    if (py < 0 || py >= h || px < 0 || px >= w) continue;

    // Fade out as life progresses (peaks early, dies near the top)
    const fade = (1 - life) * (0.6 + rng() * 0.4) * intensity;
    const i = (py * w + px) * 4;
    blendPixel(buf, i, r, g, b, fade, Math.round(220 * fade));

    // Occasional 2-pixel sparkle for visual punch
    if (rng() < 0.25) {
      blendPixel(buf, i + 4, r, g, b, fade * 0.6, Math.round(140 * fade));
    }
  }
}

/** Tints the sprite's opaque pixels toward the accent colour. */
function tintSprite(buf: Buffer, w: number, h: number, r: number, g: number, b: number, blend: number) {
  if (blend <= 0) return;
  for (let i = 0; i < w * h * 4; i += 4) {
    if (buf[i + 3] < 30) continue;
    buf[i]     = Math.round(buf[i]     * (1 - blend) + r * blend);
    buf[i + 1] = Math.round(buf[i + 1] * (1 - blend) + g * blend);
    buf[i + 2] = Math.round(buf[i + 2] * (1 - blend) + b * blend);
  }
}

// ─── per-frame composer ─────────────────────────────────────────────────────
/**
 * Frame schedule (18 frames at 8fps = 2.25s):
 *   0–2:   anticipation — faint underglow rises around the feet
 *   3–9:   build — sparkle column rises through silhouette, halo grows
 *   10–13: peak — full tint flash + max halo + sparks above
 *   14–16: dissipate — sparks fade, halo shrinks
 *   17:    clean sprite (loop point)
 */
function buildFrame(spriteRgba: Buffer, info: SpriteInfo, accent: string, frame: number): Buffer {
  const [r, g, b] = parseColour(accent);
  const buf = Buffer.from(spriteRgba);

  // Easing curves (all 0..1 at the relevant frames, 0 elsewhere)
  // - haloRadius: 0 → max → back, peaks frame 11
  // - sparkIntensity: ramps in frames 3-9, holds 10-13, fades 14-16
  // - tintBlend: peaks frames 10-13
  // - underglowAlpha: peaks frames 0-2 then folds into halo

  let haloRadius = 0, haloAlpha = 0;
  let sparkProgress = 0, sparkIntensity = 0;
  let tintBlend = 0;
  let underglowAlpha = 0;

  if (frame <= 2) {
    // Anticipation — soft underglow only
    underglowAlpha = (frame + 1) / 3 * 0.4;
  } else if (frame <= 9) {
    // Build phase — sparks emerge, halo grows
    const t = (frame - 3) / 6; // 0..1 across frames 3-9
    haloRadius = Math.round(2 + t * 4); // 2 → 6 px
    haloAlpha = 0.25 + t * 0.4;
    sparkIntensity = 0.4 + t * 0.6;
    sparkProgress = t;
    underglowAlpha = 0.4 * (1 - t);
  } else if (frame <= 13) {
    // Peak — full flash, max sparks
    const t = (frame - 10) / 3; // 0..1
    haloRadius = 7;
    haloAlpha = 0.8 - t * 0.1;
    sparkIntensity = 1.0;
    sparkProgress = 1.0;
    // Tint pulses 0 → 0.55 → 0
    tintBlend = Math.sin(t * Math.PI) * 0.55;
  } else if (frame <= 16) {
    // Dissipate
    const t = (frame - 14) / 2; // 0..1
    haloRadius = Math.round(7 - t * 6);
    haloAlpha = 0.5 * (1 - t);
    sparkIntensity = 0.6 * (1 - t);
    sparkProgress = 1.0;
  }
  // frame === 17 → clean sprite, all values 0

  // Apply tint to sprite
  tintSprite(buf, SPRITE_SIZE, SPRITE_SIZE, r, g, b, tintBlend);

  // Add halo around the sprite (uses the original sprite mask so tint doesn't shift it)
  addHalo(buf, SPRITE_SIZE, SPRITE_SIZE, spriteRgba, r, g, b, haloRadius, haloAlpha);

  // Underglow — small dilated halo only along the bottom rows
  if (underglowAlpha > 0) {
    // Build a "feet-only" version of the sprite for the underglow source
    const feetMask = Buffer.alloc(SPRITE_SIZE * SPRITE_SIZE * 4);
    const feetCutoff = Math.max(info.baseY - 12, Math.round((info.baseY + info.topY) / 2));
    for (let y = feetCutoff; y < SPRITE_SIZE; y++) {
      for (let x = 0; x < SPRITE_SIZE; x++) {
        const i = (y * SPRITE_SIZE + x) * 4;
        feetMask[i + 3] = spriteRgba[i + 3];
      }
    }
    addHalo(buf, SPRITE_SIZE, SPRITE_SIZE, feetMask, r, g, b, 4, underglowAlpha);
  }

  // Add rising sparkles
  if (sparkIntensity > 0) {
    addRisingSparkles(buf, SPRITE_SIZE, SPRITE_SIZE, info, r, g, b, sparkProgress, sparkIntensity, frame * 7919);
  }

  return buf;
}

// ─── species json I/O ───────────────────────────────────────────────────────
function loadSpecies(): any[] {
  return JSON.parse(fs.readFileSync(SPECIES_FILE, 'utf8'));
}

function updateSpeciesJson(speciesId: string, animKey: string, framePaths: string[]) {
  const species = loadSpecies();
  const sp = species.find((s: any) => s.id === speciesId);
  if (!sp) return;
  if (!sp.animations) sp.animations = {};
  sp.animations[animKey] = framePaths.map(p =>
    p.replace(path.resolve('public'), '').replace(/\\/g, '/'),
  );
  fs.writeFileSync(SPECIES_FILE, JSON.stringify(species, null, 2));
}

// ─── main ───────────────────────────────────────────────────────────────────
function main() {
  console.log('\n✨ Synamon — Procedural Levelup Animation Generation');
  if (resume) console.log('Mode: resume (skip existing)');
  if (speciesArg) console.log(`Species: ${speciesArg}`);
  console.log();

  const allSpecies = loadSpecies();
  let done = 0, failed = 0, skipped = 0;

  for (const sp of allSpecies) {
    if (speciesArg && sp.id !== speciesArg) continue;

    const accent = TYPE_COLOURS[sp.type] ?? '#33aaff';

    for (const stageEntry of (sp.stages ?? [])) {
      const stageNum = stageEntry.stage ?? 1;
      if (!stageEntry.sprite) {
        console.log(`  ⚠ ${sp.id} stage${stageNum}: no sprite — skipping`);
        continue;
      }

      const spritePath = path.resolve('public' + stageEntry.sprite);
      if (!fs.existsSync(spritePath)) {
        console.log(`  ⚠ ${sp.id} stage${stageNum}: sprite missing at ${spritePath}`);
        failed++;
        continue;
      }

      const animKey = `stage${stageNum}-levelup`;
      const outDir = path.join(OUT_DIR, sp.id, animKey);
      if (resume && fs.existsSync(outDir) && fs.readdirSync(outDir).some(f => f.endsWith('.png'))) {
        console.log(`  ✓ ${sp.id} stage${stageNum} already done`);
        skipped++;
        continue;
      }

      fs.mkdirSync(outDir, { recursive: true });
      process.stdout.write(`  ⏳ ${sp.id} stage${stageNum} (${sp.type}, ${accent})... `);

      try {
        const spriteRgba = pngToRgba(spritePath, SPRITE_SIZE, SPRITE_SIZE);
        const info = analyseSprite(spriteRgba, SPRITE_SIZE, SPRITE_SIZE);

        const paths: string[] = [];
        for (let f = 0; f < FRAMES; f++) {
          const frameBuf = buildFrame(spriteRgba, info, accent, f);
          const outPath = path.join(outDir, `frame${f}.png`);
          fs.writeFileSync(outPath, rgbaToPng(frameBuf, SPRITE_SIZE, SPRITE_SIZE));
          paths.push(outPath);
        }
        updateSpeciesJson(sp.id, animKey, paths);
        console.log(`✓ ${FRAMES} frames`);
        done++;
      } catch (err: any) {
        console.log(`✗ ${err.message}`);
        failed++;
      }
    }
  }

  console.log(`\n  Done: ${done}  Skipped: ${skipped}  Failed: ${failed}`);
}

main();
