/**
 * Synamon Phase 8 (prep) — Tamagotchi ambient particle atlas.
 *
 * Pure procedural — no API calls. Emits 5 tiny particle sprites and a JSON
 * manifest the renderer uses to spawn drifting ambient particles per zone.
 *
 * Each particle is an 8×8 RGBA PNG with a soft pixel-art shape (single value-step
 * core + lighter halo). Reused across zones via a per-zone affinity manifest.
 *
 * Output:
 *   public/synamon/_world/_particles/<key>.png
 *   public/synamon/_world/particles.json
 *
 * Run:
 *   npx tsx scripts/generate-particles.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';

const OUT_DIR = path.resolve('public/synamon/_world/_particles');
const REGISTRY_FILE = path.resolve('public/synamon/_world/particles.json');
const PUBLIC_DIR = path.resolve('public');
const SIZE = 8;

// ─── Tiny PNG codec (zlib + manual CRC32) ───────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c >>> 0;
  }
  return t;
})();
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}
function rgbaToPng(w: number, h: number, rgba: Uint8Array): Buffer {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  const stride = w * 4;
  const raw = Buffer.alloc(h * (1 + stride));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + stride)] = 0; // filter byte (none)
    for (let x = 0; x < stride; x++) {
      raw[y * (1 + stride) + 1 + x] = rgba[y * stride + x];
    }
  }
  const idat = zlib.deflateSync(raw);
  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ─── Drawing helpers ────────────────────────────────────────────────────────
type RGBA = [number, number, number, number];
const W = SIZE, H = SIZE;
function blank(): Uint8Array {
  return new Uint8Array(W * H * 4);
}
function setPx(buf: Uint8Array, x: number, y: number, c: RGBA) {
  if (x < 0 || x >= W || y < 0 || y >= H) return;
  const i = (y * W + x) * 4;
  buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2]; buf[i + 3] = c[3];
}

// ─── Particle definitions ───────────────────────────────────────────────────
interface ParticleDef {
  key: string;
  label: string;
  /** Suggested drift behaviour for the renderer */
  drift: { vx: [number, number]; vy: [number, number] }; // px per sec range
  /** Spawn rate per second across the 256-wide scene */
  spawnRate: number;
  /** Lifetime range in seconds */
  lifetime: [number, number];
  /** Suggested base alpha (0-1) — renderer can fade in/out */
  alpha: number;
  /** Zones this particle plays well in */
  zones: string[];
  draw: (buf: Uint8Array) => void;
}

const PARTICLES: ParticleDef[] = [
  {
    key: 'dust-mote',
    label: 'Warm dust mote',
    drift: { vx: [-3, 3], vy: [-2, 1] },
    spawnRate: 0.6,
    lifetime: [4, 8],
    alpha: 0.5,
    zones: ['aureum-basin', 'fossil-reef'],
    draw: (b) => {
      // soft beige speck — single core pixel + faint halo
      setPx(b, 4, 4, [240, 220, 180, 220]);
      setPx(b, 3, 4, [240, 220, 180, 80]);
      setPx(b, 5, 4, [240, 220, 180, 80]);
      setPx(b, 4, 3, [240, 220, 180, 80]);
      setPx(b, 4, 5, [240, 220, 180, 80]);
    },
  },
  {
    key: 'sparkle-glint',
    label: 'Twinkle sparkle',
    drift: { vx: [-1, 1], vy: [-1, 1] },
    spawnRate: 0.4,
    lifetime: [1.2, 2.4],
    alpha: 0.9,
    zones: ['salt-flats', 'starlight-plateau', 'resonant-rift'],
    draw: (b) => {
      // 4-point star, bright core
      setPx(b, 4, 4, [255, 255, 255, 255]);
      setPx(b, 3, 4, [220, 230, 255, 200]);
      setPx(b, 5, 4, [220, 230, 255, 200]);
      setPx(b, 4, 3, [220, 230, 255, 200]);
      setPx(b, 4, 5, [220, 230, 255, 200]);
      setPx(b, 2, 4, [180, 200, 240, 110]);
      setPx(b, 6, 4, [180, 200, 240, 110]);
      setPx(b, 4, 2, [180, 200, 240, 110]);
      setPx(b, 4, 6, [180, 200, 240, 110]);
    },
  },
  {
    key: 'ember',
    label: 'Drifting ember',
    drift: { vx: [-2, 2], vy: [-6, -2] },
    spawnRate: 0.5,
    lifetime: [2, 4],
    alpha: 0.85,
    zones: ['aureum-basin', 'resonant-rift'],
    draw: (b) => {
      // hot orange core with red halo
      setPx(b, 4, 4, [255, 200, 80, 255]);
      setPx(b, 3, 4, [255, 120, 40, 200]);
      setPx(b, 5, 4, [255, 120, 40, 200]);
      setPx(b, 4, 3, [255, 120, 40, 200]);
      setPx(b, 4, 5, [255, 120, 40, 200]);
      setPx(b, 3, 3, [200, 60, 30, 100]);
      setPx(b, 5, 3, [200, 60, 30, 100]);
      setPx(b, 3, 5, [200, 60, 30, 100]);
      setPx(b, 5, 5, [200, 60, 30, 100]);
    },
  },
  {
    key: 'bio-spore',
    label: 'Bioluminescent spore',
    drift: { vx: [-1, 1], vy: [-3, -1] },
    spawnRate: 0.7,
    lifetime: [3, 6],
    alpha: 0.8,
    zones: ['bio-grotto'],
    draw: (b) => {
      // cyan core with violet halo
      setPx(b, 4, 4, [180, 255, 230, 255]);
      setPx(b, 3, 4, [120, 220, 220, 180]);
      setPx(b, 5, 4, [120, 220, 220, 180]);
      setPx(b, 4, 3, [120, 220, 220, 180]);
      setPx(b, 4, 5, [120, 220, 220, 180]);
      setPx(b, 3, 3, [160, 120, 220, 100]);
      setPx(b, 5, 3, [160, 120, 220, 100]);
      setPx(b, 3, 5, [160, 120, 220, 100]);
      setPx(b, 5, 5, [160, 120, 220, 100]);
    },
  },
  {
    key: 'firefly',
    label: 'Firefly glow',
    drift: { vx: [-4, 4], vy: [-3, 3] },
    spawnRate: 0.25,
    lifetime: [4, 8],
    alpha: 0.85,
    zones: ['bio-grotto', 'aureum-basin', 'fossil-reef'],
    draw: (b) => {
      // warm yellow-green pulse
      setPx(b, 4, 4, [240, 255, 160, 255]);
      setPx(b, 3, 4, [200, 240, 100, 200]);
      setPx(b, 5, 4, [200, 240, 100, 200]);
      setPx(b, 4, 3, [200, 240, 100, 200]);
      setPx(b, 4, 5, [200, 240, 100, 200]);
      setPx(b, 3, 3, [160, 200, 60, 90]);
      setPx(b, 5, 3, [160, 200, 60, 90]);
      setPx(b, 3, 5, [160, 200, 60, 90]);
      setPx(b, 5, 5, [160, 200, 60, 90]);
      setPx(b, 4, 2, [200, 240, 100, 80]);
      setPx(b, 4, 6, [200, 240, 100, 80]);
    },
  },
];

// ─── Main ───────────────────────────────────────────────────────────────────
function toWebPath(absPath: string): string {
  return '/' + path.relative(PUBLIC_DIR, absPath).replace(/\\/g, '/');
}

function main() {
  console.log('\n✨ Synamon — Particle atlas generation');
  console.log(`Particles: ${PARTICLES.length}  size: ${W}×${H}\n`);

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const manifest = {
    size: SIZE,
    particles: [] as Array<{
      key: string;
      label: string;
      sprite: string;
      drift: ParticleDef['drift'];
      spawnRate: number;
      lifetime: [number, number];
      alpha: number;
      zones: string[];
    }>,
  };

  for (const p of PARTICLES) {
    const buf = blank();
    p.draw(buf);
    const png = rgbaToPng(W, H, buf);
    const outPath = path.join(OUT_DIR, `${p.key}.png`);
    fs.writeFileSync(outPath, png);
    console.log(`  ✓ ${p.key}  (${png.length}B)`);
    manifest.particles.push({
      key: p.key,
      label: p.label,
      sprite: toWebPath(outPath),
      drift: p.drift,
      spawnRate: p.spawnRate,
      lifetime: p.lifetime,
      alpha: p.alpha,
      zones: p.zones,
    });
  }

  fs.writeFileSync(REGISTRY_FILE, JSON.stringify(manifest, null, 2));
  console.log(`\n📝 Wrote ${path.relative(process.cwd(), REGISTRY_FILE)}`);
  console.log('\n✅ Done');
}

main();
