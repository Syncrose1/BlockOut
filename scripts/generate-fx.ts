/**
 * Synamon Phase 5 — Battle FX overlay generation.
 *
 * Generates 21 shared battle effect animations. Each FX is a moment of IMPACT —
 * a volatile, dynamic burst played once on hit (not an ambient loop). Two stages:
 *   1. Seed particle via /map-objects (basic mode, no background image)
 *   2. 12-frame burst animation via /animate-with-text-v3 seeded with the particle.
 *      The final frame is hard-overwritten with a fully transparent PNG so the
 *      effect is guaranteed to vanish at the end (no lingering pixels).
 *
 * Assets land in public/synamon/_fx/<key>/{seed.png, frame0.png … frame12.png}
 * Registry written to public/synamon/fx.json and consumed by the Synadex FX tab
 * and (later) the Phase 7 battle renderer.
 *
 * Usage:
 *   npx tsx scripts/generate-fx.ts
 *   npx tsx scripts/generate-fx.ts --resume           (skip FX whose assets already exist)
 *   npx tsx scripts/generate-fx.ts --fx fx-burn       (single effect)
 *   npx tsx scripts/generate-fx.ts --seeds-only
 *   npx tsx scripts/generate-fx.ts --anims-only
 */

import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';

const API_KEY = 'f82b0da8-5d5f-45b3-a9c3-3bb53d725cea';
const API_BASE = 'https://api.pixellab.ai/v2';
const PUBLIC_DIR = path.resolve('public');
const OUT_DIR = path.resolve('public/synamon/_fx');
const REGISTRY_FILE = path.resolve('public/synamon/fx.json');

const CANVAS = 96;
const FRAME_COUNT = 12; // 12-frame burst = ~1.5s at 8fps; gives time to peak + dissipate
const BATCH_SIZE = 2;   // Tier 1 friendly — matches generate-animations.ts

const SEED_SUFFIX = ', flat shading, transparent background';
// Battle FX play once on hit — moments of IMPACT, not ambient idles. They peak
// early, dissipate progressively, and end on a fully empty/transparent frame
// (the script also hard-overwrites the final frame to guarantee this).
const ACTION_SUFFIX = ', violent impact burst, chaotic explosive motion, dramatic eruption, peaks early then progressively dissipates and fades to nothing, completely empty transparent canvas by the final frame';

interface FxDef {
  key: string;
  label: string;
  seedPrompt: string;
  actionPrompt: string;
  usedBy: string[];
}

const FX_DEFS: FxDef[] = [
  { key: 'fx-burn',       label: 'Burn',       seedPrompt: 'small orange pixel art flame particle',            actionPrompt: 'fire erupting and blasting outward aggressively, wild flames exploding in all directions with embers flying',                 usedBy: ['Ember Snap', 'Scorch Burst', 'Cinder Snap', 'Cinder Roar'] },
  { key: 'fx-explosion',  label: 'Explosion',  seedPrompt: 'bright yellow-orange blast core',                  actionPrompt: 'huge fireball detonating, rapidly expanding blast with shockwave rings and debris hurling outward',                          usedBy: ['Flame Lance', 'Depth Charge', 'Boulder Crash'] },
  { key: 'fx-bubble',     label: 'Bubble',     seedPrompt: 'cluster of blue water bubbles',                    actionPrompt: 'water bubbles violently bursting and exploding outward in every direction',                                                    usedBy: ['Bubble Barrage'] },
  { key: 'fx-splash',     label: 'Splash',     seedPrompt: 'huge water splash erupting outward with droplets and spray scattered in all directions',           actionPrompt: 'powerful water geyser erupting upward and outward, droplets scattering everywhere',                                            usedBy: ['Tidal Surge', 'Acid Splash'] },
  { key: 'fx-mist',       label: 'Mist',       seedPrompt: 'explosive billowing mist shockwave expanding across canvas with vapor wisps',                       actionPrompt: 'mist detonating outward in a shockwave, vapor billowing explosively',                                                          usedBy: ['Mist Veil', 'Spore Cloud', 'Ash Cloud'] },
  { key: 'fx-rocks',      label: 'Rocks',      seedPrompt: 'rocks smashing apart mid-air with debris and impact dust scattered everywhere',                     actionPrompt: 'rocks smashing together and ricocheting outward with heavy impact shockwaves',                                                 usedBy: ['Stone Toss', 'Boulder Crash'] },
  { key: 'fx-quake',      label: 'Quake',      seedPrompt: 'brown dust cloud at ground level',                 actionPrompt: 'violent ground rupture, dust and rubble erupting from cracked earth',                                                          usedBy: ['Quake Stomp'] },
  { key: 'fx-wind',       label: 'Wind',       seedPrompt: 'multiple sharp white wind slashes crisscrossing with motion lines and air swirls',                 actionPrompt: 'razor-sharp wind slash tearing through the air at high speed, whoosh streaks',                                                 usedBy: ['Gust Slash', 'Cyclone Cutter', 'Updraft'] },
  { key: 'fx-shadow',     label: 'Shadow',     seedPrompt: 'wispy dark purple tendril',                        actionPrompt: 'shadow tendrils striking violently outward, dark energy lashing and whipping aggressively',                                   usedBy: ['Shadow Lunge', 'Shade Wrap', 'Shadowmeld'] },
  { key: 'fx-dark-pulse', label: 'Dark Pulse', seedPrompt: 'multiple expanding dark purple shockwave rings with crackling void energy radiating outward',        actionPrompt: 'dark shockwave detonating, shadow energy rippling outward rapidly with crackling void rings',                                  usedBy: ['Void Pulse', 'Dark Echo'] },
  { key: 'fx-flash',      label: 'Flash',      seedPrompt: 'huge blinding white explosion with brilliant rays bursting outward, intense glow filling canvas',    actionPrompt: 'blinding flash detonation, brilliant white light exploding in all directions with searing rays',                               usedBy: ['Flash Burst', 'Radiant Beam', 'Halo Beam'] },
  { key: 'fx-prism',      label: 'Prism',      seedPrompt: 'rainbow refraction shard',                         actionPrompt: 'prismatic crystal shattering, rainbow shards and refracted beams bursting outward',                                            usedBy: ['Prism Strike', 'Aura Flare', 'Prism Cannon'] },
  { key: 'fx-sound-wave', label: 'Sound Wave', seedPrompt: 'multiple concentric cyan sonic rings rapidly expanding outward filling the canvas',                  actionPrompt: 'sonic boom detonating, concentric sound rings expanding outward at rapid speed',                                               usedBy: ['Resonance Wave', 'Bass Pulse', 'Echo Slam'] },
  { key: 'fx-screech',    label: 'Screech',    seedPrompt: 'jagged magenta lightning-like shard',              actionPrompt: 'jagged sonic blast, sharp magenta shards exploding and crackling outward',                                                     usedBy: ['Screech', 'Subsonic Roar'] },
  { key: 'fx-sigil',      label: 'Sigil',      seedPrompt: 'glowing blue geometric rune',                      actionPrompt: 'magical rune detonating, runic energy bursting outward in beams and arcane light',                                             usedBy: ['Sigil Bolt', 'Runic Seal', 'Sigil Brand'] },
  { key: 'fx-vine',       label: 'Vine',       seedPrompt: 'multiple green thorny vines lashing out in all directions with scattered leaves',                   actionPrompt: 'vines whipping and striking violently, fast thorny lash snapping outward',                                                     usedBy: ['Vine Whip', 'Root Lock'] },
  { key: 'fx-seed',       label: 'Seed',       seedPrompt: 'green seeds bursting outward like shrapnel, scattered across canvas with impact dust',               actionPrompt: 'seeds explosively scattering outward, bursting like shrapnel with impact dust',                                                usedBy: ['Seed Bomb'] },
  { key: 'fx-poison',     label: 'Poison',     seedPrompt: 'sickly green toxic droplet',                       actionPrompt: 'toxic gas eruption, sickly green cloud billowing outward violently with acidic spatter',                                       usedBy: ['Poison Fang', 'Toxic Cloud', 'Venom Burst', 'Spore Drift'] },
  { key: 'fx-iron',       label: 'Iron',       seedPrompt: 'burst of jagged grey metal shards scattered across canvas with impact sparks',                      actionPrompt: 'metal shards smashing and ricocheting outward with heavy clang impact sparks',                                                 usedBy: ['Iron Bash', 'Metal Storm'] },
  { key: 'fx-magnetise',  label: 'Magnetise',  seedPrompt: 'explosion of metal filings and red-blue magnetic energy arcs scattered chaotically',                actionPrompt: 'magnetic pulse detonating, metal filings and energy arcs snapping inward in chaotic bursts',                                   usedBy: ['Magnetise'] },
  { key: 'fx-ether',      label: 'Ether',      seedPrompt: 'explosion of pale blue ethereal wisps and spectral particles scattered across canvas',              actionPrompt: 'ethereal burst, ghostly wisps erupting violently and dissipating into spectral particles',                                     usedBy: ['Ether Touch', 'Soul Drain', 'Spectral Veil'] },
];

// ─── CLI args ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const resume = args.includes('--resume');
const seedsOnly = args.includes('--seeds-only');
const animsOnly = args.includes('--anims-only');
const fxArg =
  args.find(a => a.startsWith('--fx='))?.split('=')[1] ??
  (args.indexOf('--fx') >= 0 ? args[args.indexOf('--fx') + 1] : null);

if (seedsOnly && animsOnly) {
  console.error('Cannot combine --seeds-only and --anims-only');
  process.exit(1);
}

// ─── HTTP helpers (matches generate-animations.ts) ──────────────────────────
async function apiFetch(endpoint: string, body: object): Promise<any> {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${endpoint} failed ${res.status}: ${text}`);
  }
  return res.json();
}

async function apiGet(endpoint: string): Promise<any> {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    headers: { 'Authorization': `Bearer ${API_KEY}` },
  });
  if (!res.ok) throw new Error(`API GET ${endpoint} failed ${res.status}`);
  return res.json();
}

const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000;

async function pollJob(jobId: string): Promise<any> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    const result = await apiGet(`/background-jobs/${jobId}`);
    if (result.status === 'completed') return result;
    if (result.status === 'failed') {
      throw new Error(`Job ${jobId} failed: ${result.error ?? result.last_response?.error ?? 'unknown'}`);
    }
  }
  throw new Error(`Job ${jobId} timed out after 5 minutes`);
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

// ─── Seed generation (/map-objects basic mode) ──────────────────────────────
async function generateSeed(fx: FxDef): Promise<string> {
  const fxDir = path.join(OUT_DIR, fx.key);
  fs.mkdirSync(fxDir, { recursive: true });
  const seedPath = path.join(fxDir, 'seed.png');

  // Matches generate-synamon.ts body shape (image_size + view), proven working.
  const body = {
    description: fx.seedPrompt + SEED_SUFFIX,
    image_size: { width: CANVAS, height: CANVAS },
    view: 'side',
    outline: 'single color outline',
    shading: 'basic shading',
    detail: 'low detail',
  };

  const res = await apiFetch('/map-objects', body);
  if (!res.background_job_id) {
    throw new Error(`No background_job_id from /map-objects: ${JSON.stringify(res)}`);
  }

  const job = await pollJob(res.background_job_id);
  const lr = job.last_response ?? job;

  if (lr.storage_url) {
    const r = await fetch(lr.storage_url);
    if (!r.ok) throw new Error(`Seed download failed: ${lr.storage_url}`);
    fs.writeFileSync(seedPath, Buffer.from(await r.arrayBuffer()));
  } else if (lr.image) {
    fs.writeFileSync(seedPath, Buffer.from(lr.image, 'base64'));
  } else if (lr.base64) {
    fs.writeFileSync(seedPath, Buffer.from(lr.base64, 'base64'));
  } else {
    throw new Error(`No image data in seed response: ${JSON.stringify(lr).slice(0, 200)}`);
  }

  return seedPath;
}

// ─── Transparent PNG builder (no deps) ──────────────────────────────────────
// Used to hard-overwrite the final animation frame so battle FX vanish cleanly
// instead of risking a lingering pixel from the model's last guess.
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
function makeTransparentPng(w: number, h: number): Buffer {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type RGBA
  // raw scanlines: filter byte (0) + 4 bytes/pixel — all zeros = transparent black
  const raw = Buffer.alloc(h * (1 + w * 4));
  const idat = zlib.deflateSync(raw);
  return Buffer.concat([sig, pngChunk('IHDR', ihdr), pngChunk('IDAT', idat), pngChunk('IEND', Buffer.alloc(0))]);
}
const TRANSPARENT_FRAME = makeTransparentPng(CANVAS, CANVAS);

// ─── Animation generation (/animate-with-text-v3) ───────────────────────────
async function generateAnim(fx: FxDef): Promise<string[]> {
  const fxDir = path.join(OUT_DIR, fx.key);
  const seedPath = path.join(fxDir, 'seed.png');
  if (!fs.existsSync(seedPath)) {
    throw new Error(`Seed missing for ${fx.key}: ${seedPath}`);
  }

  const base64 = fs.readFileSync(seedPath).toString('base64');
  const body = {
    first_frame: { type: 'base64', base64, format: 'png' },
    action: fx.actionPrompt + ACTION_SUFFIX,
    frame_count: FRAME_COUNT,
    no_background: true,
  };

  let res = await apiFetch('/animate-with-text-v3', body);
  if (res.background_job_id) {
    const job = await pollJob(res.background_job_id);
    res = job.last_response ?? job;
  }

  const images: any[] = res.images ?? [];
  if (images.length === 0) throw new Error('No images in animate response');

  const paths: string[] = [];
  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    const outPath = path.join(fxDir, `frame${i}.png`);
    if (img.base64) {
      fs.writeFileSync(outPath, Buffer.from(img.base64, 'base64'));
    } else if (img.url || img.storage_url) {
      const url = img.url ?? img.storage_url;
      const r = await fetch(url);
      if (!r.ok) throw new Error(`Frame download failed: ${url}`);
      fs.writeFileSync(outPath, Buffer.from(await r.arrayBuffer()));
    } else {
      throw new Error(`Unknown image format at frame ${i}`);
    }
    paths.push(outPath);
  }

  // Hard-guarantee the burst is gone at the end: overwrite the final frame
  // with a fully transparent PNG. The model's prompt also asks it to fade,
  // so the second-to-last frames should already be near-empty for a smooth
  // dissipation rather than a hard cut.
  if (paths.length > 0) {
    fs.writeFileSync(paths[paths.length - 1], TRANSPARENT_FRAME);
  }

  return paths;
}

// ─── Registry I/O ───────────────────────────────────────────────────────────
interface FxEntry {
  key: string;
  label: string;
  seedPrompt: string;
  actionPrompt: string;
  usedBy: string[];
  seed: string | null;
  frames: string[];
}

interface FxRegistry {
  canvasSize: number;
  frameCount: number;
  fx: FxEntry[];
}

function toWebPath(absPath: string): string {
  return '/' + path.relative(PUBLIC_DIR, absPath).replace(/\\/g, '/');
}

function loadRegistry(): FxRegistry {
  if (fs.existsSync(REGISTRY_FILE)) {
    return JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf8'));
  }
  return { canvasSize: CANVAS, frameCount: FRAME_COUNT, fx: [] };
}

function saveRegistry(reg: FxRegistry) {
  fs.writeFileSync(REGISTRY_FILE, JSON.stringify(reg, null, 2));
}

function syncEntry(fx: FxDef) {
  const reg = loadRegistry();
  reg.canvasSize = CANVAS;
  reg.frameCount = FRAME_COUNT;

  const fxDir = path.join(OUT_DIR, fx.key);
  const seedPath = path.join(fxDir, 'seed.png');
  // List every generated frame — the API typically returns frame_count + 1 images,
  // and the Synadex's startAnimation helper skips frame0 as a static base so the
  // actual loop length is (frames.length - 1). Matches per-species convention.
  const framePaths: string[] = [];
  for (let i = 0; ; i++) {
    const fp = path.join(fxDir, `frame${i}.png`);
    if (!fs.existsSync(fp)) break;
    framePaths.push(fp);
  }

  const entry: FxEntry = {
    key: fx.key,
    label: fx.label,
    seedPrompt: fx.seedPrompt + SEED_SUFFIX,
    actionPrompt: fx.actionPrompt + ACTION_SUFFIX,
    usedBy: fx.usedBy,
    seed: fs.existsSync(seedPath) ? toWebPath(seedPath) : null,
    frames: framePaths.map(toWebPath),
  };

  const idx = reg.fx.findIndex(e => e.key === fx.key);
  if (idx >= 0) reg.fx[idx] = entry;
  else reg.fx.push(entry);

  // Preserve canonical FX_DEFS order so the Synadex renders consistently
  reg.fx.sort((a, b) => {
    const ia = FX_DEFS.findIndex(f => f.key === a.key);
    const ib = FX_DEFS.findIndex(f => f.key === b.key);
    return ia - ib;
  });

  saveRegistry(reg);
}

// ─── Batched execution with 429 retry (matches generate-animations.ts) ──────
async function runBatch<T>(
  items: T[],
  worker: (item: T) => Promise<void>,
): Promise<{ done: number; failed: number }> {
  let done = 0;
  let failed = 0;

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    await Promise.allSettled(batch.map(async (item) => {
      let attempts = 0;
      const MAX_RETRIES = 3;
      while (attempts < MAX_RETRIES) {
        try {
          await worker(item);
          done++;
          return;
        } catch (err: any) {
          const msg = err?.message ?? String(err);
          if (msg.includes('429') && attempts < MAX_RETRIES - 1) {
            attempts++;
            const wait = 30 * attempts;
            console.log(`    (429, retry ${attempts}/${MAX_RETRIES} in ${wait}s)`);
            await sleep(wait * 1000);
          } else {
            console.log(`    ✗ ${msg}`);
            failed++;
            return;
          }
        }
      }
    }));
  }

  return { done, failed };
}

// ─── Main ───────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n⚡ Synamon Phase 5 — Battle FX Generation');
  console.log(`Canvas: ${CANVAS}×${CANVAS}  frames: ${FRAME_COUNT}  batch: ${BATCH_SIZE}`);
  if (resume) console.log('Mode: resume (skip existing)');
  if (seedsOnly) console.log('Mode: seeds only');
  if (animsOnly) console.log('Mode: anims only');
  if (fxArg) console.log(`Filter: ${fxArg}`);
  console.log();

  const targets = fxArg ? FX_DEFS.filter(f => f.key === fxArg) : FX_DEFS;
  if (targets.length === 0) {
    console.error(`✗ No FX matches '${fxArg}'. Known keys: ${FX_DEFS.map(f => f.key).join(', ')}`);
    process.exit(1);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });

  // ── Phase A: seeds ────────────────────────────────────────────────────────
  if (!animsOnly) {
    const needsSeed = targets.filter(fx => {
      const p = path.join(OUT_DIR, fx.key, 'seed.png');
      if (resume && fs.existsSync(p)) {
        console.log(`  ✓ ${fx.key} seed exists`);
        return false;
      }
      return true;
    });

    if (needsSeed.length > 0) {
      console.log(`\n🌱 Seeds: generating ${needsSeed.length}\n`);
      const r = await runBatch(needsSeed, async (fx) => {
        process.stdout.write(`  ⏳ seed ${fx.key}... `);
        await generateSeed(fx);
        console.log('✓');
        syncEntry(fx);
      });
      console.log(`\n  Seeds done: ${r.done}  failed: ${r.failed}`);
    } else {
      console.log('\n🌱 Seeds: nothing to do');
    }
  }

  // ── Phase B: animations ───────────────────────────────────────────────────
  if (!seedsOnly) {
    const needsAnim = targets.filter(fx => {
      const seedPath = path.join(OUT_DIR, fx.key, 'seed.png');
      // Use frame0.png as the "anim exists" sentinel — it's always the first
      // frame the API returns, and checking for ANY frame keeps resume working
      // across frame_count changes (e.g. legacy 8-frame anims still skip).
      const firstFrame = path.join(OUT_DIR, fx.key, 'frame0.png');
      if (!fs.existsSync(seedPath)) {
        console.log(`  ⚠ ${fx.key}: seed missing — skipping anim`);
        return false;
      }
      if (resume && fs.existsSync(firstFrame)) {
        console.log(`  ✓ ${fx.key} anim exists`);
        return false;
      }
      return true;
    });

    if (needsAnim.length > 0) {
      console.log(`\n🎬 Anims: generating ${needsAnim.length}\n`);
      const r = await runBatch(needsAnim, async (fx) => {
        process.stdout.write(`  ⏳ anim ${fx.key}... `);
        const frames = await generateAnim(fx);
        console.log(`✓ ${frames.length} frames`);
        syncEntry(fx);
      });
      console.log(`\n  Anims done: ${r.done}  failed: ${r.failed}`);
    } else {
      console.log('\n🎬 Anims: nothing to do');
    }
  }

  // Final full sync — catch any entries whose files exist but registry is stale
  console.log('\n📝 Syncing fx.json...');
  for (const fx of FX_DEFS) {
    const seedPath = path.join(OUT_DIR, fx.key, 'seed.png');
    const anyFrame = path.join(OUT_DIR, fx.key, 'frame0.png');
    if (fs.existsSync(seedPath) || fs.existsSync(anyFrame)) {
      syncEntry(fx);
    }
  }

  const reg = loadRegistry();
  console.log(`  Registry entries: ${reg.fx.length} / ${FX_DEFS.length}`);
  console.log('\n✅ Done');
}

main().catch(err => {
  console.error('\nFatal:', err);
  process.exit(1);
});
