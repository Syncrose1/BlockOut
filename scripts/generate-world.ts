/**
 * Synamon Phase 8 (prep) — Tamagotchi world background generation.
 *
 * Generates 6 Luminal Reaches habitat scenes as cinematic single-plate backdrops
 * at 256×128 wide letterbox, plus 3 hero animated loops for the zones whose vibe
 * really needs motion (Aureum steam, Resonant Rift crystal pulse, Bioluminescent
 * Grotto vein pulse). Particles & day/night palette shifts are render-time.
 *
 * Pipeline:
 *   - Plates:    /create-image-pixflux  (sync, returns base64 immediately)
 *   - Hero seed: /map-objects basic mode (transparent canvas object)
 *   - Hero anim: /animate-with-text-v3 from seed (background job)
 *
 * Assets land under public/synamon/_world/<zone>/plate.png
 *                  and public/synamon/_world/<zone>/hero/{seed.png, frame0.png ...}
 * Registry: public/synamon/world.json (consumed by tamagotchi scene renderer)
 *
 * Usage:
 *   npx tsx scripts/generate-world.ts                          (generate everything missing)
 *   npx tsx scripts/generate-world.ts --resume                 (skip files that already exist)
 *   npx tsx scripts/generate-world.ts --zone aureum-basin      (single zone)
 *   npx tsx scripts/generate-world.ts --plates-only            (skip hero anims)
 *   npx tsx scripts/generate-world.ts --heroes-only            (skip plates)
 */

import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';

const API_KEY = 'f82b0da8-5d5f-45b3-a9c3-3bb53d725cea';
const API_BASE = 'https://api.pixellab.ai/v2';
const PUBLIC_DIR = path.resolve('public');
const OUT_DIR = path.resolve('public/synamon/_world');
const REGISTRY_FILE = path.resolve('public/synamon/world.json');

// Wide letterbox — one cinematic scene per zone, creature sits center-bottom.
const SCENE_W = 256;
const SCENE_H = 128;

// Hero loop canvas — sits in the midground at a fixed anchor, doesn't need to
// fill the full scene. Square keeps the API happy and gives flexibility.
const HERO_CANVAS = 96;
const HERO_FRAMES = 8;

// Pacing: layers are quick (basic-mode /map-objects). Hero anims are background
// jobs (animate-with-text-v3). Tier 1 friendly batching.
const BATCH_SIZE = 2;

// Style suffix for plate prompts — keeps things cohesive with creature art.
// Emphasise side-view with solid ground in the bottom third so creatures stand naturally.
const PLATE_STYLE_SUFFIX =
  ', pixel art landscape backdrop, side-view perspective with solid ground terrain filling the bottom quarter of the image, a creature could stand on the foreground ground, painterly atmospheric pixel art, soft gradient sky, depth via layered silhouettes, lineless, medium shading, low detail';

const HERO_SEED_SUFFIX = ', flat shading, transparent background, pixel art';
const HERO_ACTION_SUFFIX =
  ', smooth seamless loop, gentle ambient motion, returns to start state by the final frame';

// ─── Zone definitions ───────────────────────────────────────────────────────
interface HeroSpec {
  key: string;
  label: string;
  seedPrompt: string;
  actionPrompt: string;
  /** Anchor position within the 256×128 scene (top-left of hero canvas) */
  anchor: { x: number; y: number };
  /** Display scale for hero element (0.0–1.0, default 1.0 = full 96px) */
  displayScale: number;
}

interface ZoneDef {
  key: string;
  label: string;
  /** Creature ground-line in scene coordinates (where the sprite's feet rest) */
  groundY: number;
  /** Creature draw scale (0.0–1.0, default 0.7) */
  creatureScale: number;
  /** Suggested types this zone fits — used by the renderer to auto-pick a habitat */
  affinityTypes: string[];
  /** Single cinematic backdrop prompt — sky, midground, foreground all baked in */
  platePrompt: string;
  hero: HeroSpec | null;
}

const ZONES: ZoneDef[] = [
  {
    key: 'aureum-basin',
    label: 'Aureum Basin',
    groundY: 120,
    creatureScale: 0.65,
    affinityTypes: ['Aqua', 'Ignis', 'Spiritus'],
    platePrompt:
      'wide pixel art landscape of a geothermal hot spring shoreline at dawn, pale pink-orange sky with distant fog-shrouded coral cliffs on the horizon, steaming mineral pool in the mid-distance with pink rocky outcrops, wide flat pink-amber mineral-crusted rocky shore filling the foreground bottom third where a small creature could stand, warm pink and amber palette',
    hero: {
      key: 'hero-steam',
      label: 'Aureum steam plume',
      seedPrompt: 'small soft white steam wisp curling upward, cluster of vapor wisps',
      actionPrompt:
        'gentle steam plume rising lazily upward, soft wisps curling and dispersing, peaceful ambient motion',
      anchor: { x: 70, y: 30 },
      displayScale: 0.45,
    },
  },
  {
    key: 'salt-flats',
    label: 'Salt Flats Twilight',
    groundY: 114,
    creatureScale: 0.7,
    affinityTypes: ['Lux', 'Ventus', 'Spiritus'],
    platePrompt:
      'wide pixel art side-view landscape of a vast dry cracked salt flat desert at twilight, violet-to-gold gradient sky with first stars appearing, distant pale chalk mountains on the horizon, scattered pale mauve salt crystal formations in the mid distance, wide flat dry white cracked salt crust ground filling the entire bottom third of the image, no water, dry desert salt pan, mauve and gold palette',
    hero: null,
  },
  {
    key: 'resonant-rift',
    label: 'Resonant Rift',
    groundY: 112,
    creatureScale: 0.7,
    affinityTypes: ['Sonus', 'Arcanus', 'Lux'],
    platePrompt:
      'wide pixel art landscape of a deep crystal canyon, narrow strip of overcast sky between towering luminous crystal pillars rising on both sides, distant pillars receding into harmonic haze, glowing crystal pillars with cyan and violet vein stripes in the mid distance, wide flat cracked stone canyon floor with small fractured crystal shards filling the foreground bottom third, deep teal and violet palette with refractive shimmer',
    hero: {
      key: 'hero-crystal',
      label: 'Resonant Rift crystal pulse',
      seedPrompt:
        'tall glowing cyan-violet crystal pillar, pixel art crystal shape with luminous core',
      actionPrompt:
        'crystal pulsing gently with soft inner light, glow expanding and contracting in a slow harmonic rhythm, ambient magical pulse',
      anchor: { x: 150, y: 16 },
      displayScale: 0.5,
    },
  },
  {
    key: 'fossil-reef',
    label: 'Fossil Reef Grove',
    groundY: 122,
    creatureScale: 0.7,
    affinityTypes: ['Terra', 'Natura', 'Normal'],
    platePrompt:
      'wide pixel art side-view landscape of a sun-bleached fossil reef grove under a pale warm afternoon sky, distant petrified coral arches and spires on the horizon, fossilised coral formations in dusty cream stone in the mid distance, wide flat dry limestone ground with scattered fossil shells and small petrified plants in the foreground seen from a low side angle, the ground-line runs across the lower third of the image, cream and dusty rose palette',
    hero: null,
  },
  {
    key: 'bio-grotto',
    label: 'Bioluminescent Grotto',
    groundY: 112,
    creatureScale: 0.8,
    affinityTypes: ['Umbra', 'Natura', 'Spiritus'],
    platePrompt:
      'wide pixel art landscape of a dark underground cave interior, cave ceiling with stalactites and bioluminescent mineral veins of turquoise and violet glowing across the rock above, glowing cave formations and luminous mineral seams on dark rock walls in the mid distance, wide flat dark stone cave floor with glowing pebbles and patches of bioluminescent moss filling the foreground bottom third, atmospheric and mysterious with soft ambient cave glow',
    hero: {
      key: 'hero-veins',
      label: 'Grotto bioluminescent vein',
      seedPrompt:
        'glowing turquoise mineral vein pattern on dark cave rock, bright luminous seam',
      actionPrompt:
        'mineral vein pulsing in brightness, glow swelling and dimming in a slow steady rhythm, ambient bioluminescent breathing',
      anchor: { x: 8, y: 16 },
      displayScale: 0.4,
    },
  },
  {
    key: 'starlight-plateau',
    label: 'Starlight Plateau',
    groundY: 116,
    creatureScale: 0.7,
    affinityTypes: ['Spiritus', 'Lux', 'Ventus'],
    platePrompt:
      'wide pixel art side-view landscape of a mythic high-altitude plateau under a vast starry night sky, milky way arching overhead, distant mountain ridge silhouette at the horizon, a few standing stones in the mid distance, flat rocky plateau ground with sparse grass tufts and small stones in the foreground seen from a low side angle, the flat ground-line runs across the lower third of the image, deep navy-indigo with cool silver star points and slight starlight rim lighting',
    hero: null,
  },
];

// ─── CLI ────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const resume = args.includes('--resume');
const platesOnly = args.includes('--plates-only');
const heroesOnly = args.includes('--heroes-only');
const zoneArg =
  args.find(a => a.startsWith('--zone='))?.split('=')[1] ??
  (args.indexOf('--zone') >= 0 ? args[args.indexOf('--zone') + 1] : null);

if (platesOnly && heroesOnly) {
  console.error('Cannot combine --plates-only and --heroes-only');
  process.exit(1);
}

// ─── HTTP helpers ───────────────────────────────────────────────────────────
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

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// ─── Plate generation (/create-image-pixflux at 256×128, sync) ──────────────
async function generatePlate(zone: ZoneDef): Promise<string> {
  const dir = path.join(OUT_DIR, zone.key);
  fs.mkdirSync(dir, { recursive: true });
  const outPath = path.join(dir, 'plate.png');

  const body = {
    description: zone.platePrompt + PLATE_STYLE_SUFFIX,
    image_size: { width: SCENE_W, height: SCENE_H },
    no_background: false,
    outline: 'lineless',
    shading: 'medium shading',
    detail: 'low detail',
  };

  const res = await apiFetch('/create-image-pixflux', body);
  // pixflux is sync — image is in res.image immediately
  const img = res.image;
  if (!img) throw new Error(`No image in pixflux response: ${JSON.stringify(res).slice(0, 200)}`);

  if (img.base64) {
    fs.writeFileSync(outPath, Buffer.from(img.base64, 'base64'));
  } else if (img.url) {
    const r = await fetch(img.url);
    if (!r.ok) throw new Error(`Plate download failed: ${img.url}`);
    fs.writeFileSync(outPath, Buffer.from(await r.arrayBuffer()));
  } else {
    throw new Error(`Unknown pixflux image format: ${JSON.stringify(img).slice(0, 200)}`);
  }

  return outPath;
}

// ─── Transparent PNG (for hero loop tail-frame guarantee) ───────────────────
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
  ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc(h * (1 + w * 4));
  const idat = zlib.deflateSync(raw);
  return Buffer.concat([sig, pngChunk('IHDR', ihdr), pngChunk('IDAT', idat), pngChunk('IEND', Buffer.alloc(0))]);
}

// ─── Hero seed (/map-objects basic mode) ────────────────────────────────────
async function generateHeroSeed(zoneKey: string, hero: HeroSpec): Promise<string> {
  const dir = path.join(OUT_DIR, zoneKey, 'hero');
  fs.mkdirSync(dir, { recursive: true });
  const seedPath = path.join(dir, 'seed.png');

  const body = {
    description: hero.seedPrompt + HERO_SEED_SUFFIX,
    image_size: { width: HERO_CANVAS, height: HERO_CANVAS },
    view: 'side',
    outline: 'lineless',
    shading: 'basic shading',
    detail: 'low detail',
  };

  const res = await apiFetch('/map-objects', body);
  if (!res.background_job_id) {
    throw new Error(`No background_job_id from hero seed: ${JSON.stringify(res)}`);
  }

  const job = await pollJob(res.background_job_id);
  const lr = job.last_response ?? job;

  if (lr.storage_url) {
    const r = await fetch(lr.storage_url);
    if (!r.ok) throw new Error(`Hero seed download failed: ${lr.storage_url}`);
    fs.writeFileSync(seedPath, Buffer.from(await r.arrayBuffer()));
  } else if (lr.image) {
    fs.writeFileSync(seedPath, Buffer.from(lr.image, 'base64'));
  } else {
    throw new Error(`No image data in hero seed response`);
  }
  return seedPath;
}

// ─── Hero anim (/animate-with-text-v3 from seed) ────────────────────────────
async function generateHeroAnim(zoneKey: string, hero: HeroSpec): Promise<string[]> {
  const dir = path.join(OUT_DIR, zoneKey, 'hero');
  const seedPath = path.join(dir, 'seed.png');
  if (!fs.existsSync(seedPath)) throw new Error(`Hero seed missing: ${seedPath}`);

  const base64 = fs.readFileSync(seedPath).toString('base64');
  const body = {
    first_frame: { type: 'base64', base64, format: 'png' },
    action: hero.actionPrompt + HERO_ACTION_SUFFIX,
    frame_count: HERO_FRAMES,
    no_background: true,
  };

  let res = await apiFetch('/animate-with-text-v3', body);
  if (res.background_job_id) {
    const job = await pollJob(res.background_job_id);
    res = job.last_response ?? job;
  }

  const images: any[] = res.images ?? [];
  if (images.length === 0) throw new Error('No images in hero anim response');

  const paths: string[] = [];
  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    const outPath = path.join(dir, `frame${i}.png`);
    if (img.base64) {
      fs.writeFileSync(outPath, Buffer.from(img.base64, 'base64'));
    } else if (img.url || img.storage_url) {
      const url = img.url ?? img.storage_url;
      const r = await fetch(url);
      if (!r.ok) throw new Error(`Hero frame download failed: ${url}`);
      fs.writeFileSync(outPath, Buffer.from(await r.arrayBuffer()));
    } else {
      throw new Error(`Unknown hero image format at frame ${i}`);
    }
    paths.push(outPath);
  }
  return paths;
}

// ─── Registry ───────────────────────────────────────────────────────────────
interface ZoneEntry {
  key: string;
  label: string;
  groundY: number;
  creatureScale: number;
  affinityTypes: string[];
  plate: string | null;
  hero: {
    key: string;
    label: string;
    anchor: { x: number; y: number };
    displayScale: number;
    seed: string | null;
    frames: string[];
  } | null;
  prompts: { plate: string; hero?: { seed: string; action: string } };
}

interface WorldRegistry {
  sceneSize: { width: number; height: number };
  heroCanvas: number;
  zones: ZoneEntry[];
}

function toWebPath(absPath: string): string {
  return '/' + path.relative(PUBLIC_DIR, absPath).replace(/\\/g, '/');
}

function loadRegistry(): WorldRegistry {
  if (fs.existsSync(REGISTRY_FILE)) {
    return JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf8'));
  }
  return { sceneSize: { width: SCENE_W, height: SCENE_H }, heroCanvas: HERO_CANVAS, zones: [] };
}

function saveRegistry(reg: WorldRegistry) {
  fs.writeFileSync(REGISTRY_FILE, JSON.stringify(reg, null, 2));
}

function syncEntry(zone: ZoneDef) {
  const reg = loadRegistry();
  reg.sceneSize = { width: SCENE_W, height: SCENE_H };
  reg.heroCanvas = HERO_CANVAS;

  const dir = path.join(OUT_DIR, zone.key);
  const platePath = path.join(dir, 'plate.png');
  const plate = fs.existsSync(platePath) ? toWebPath(platePath) : null;

  let heroEntry: ZoneEntry['hero'] = null;
  if (zone.hero) {
    const heroDir = path.join(dir, 'hero');
    const seedPath = path.join(heroDir, 'seed.png');
    const frames: string[] = [];
    for (let i = 0; ; i++) {
      const fp = path.join(heroDir, `frame${i}.png`);
      if (!fs.existsSync(fp)) break;
      frames.push(toWebPath(fp));
    }
    heroEntry = {
      key: zone.hero.key,
      label: zone.hero.label,
      anchor: zone.hero.anchor,
      displayScale: zone.hero.displayScale,
      seed: fs.existsSync(seedPath) ? toWebPath(seedPath) : null,
      frames,
    };
  }

  const entry: ZoneEntry = {
    key: zone.key,
    label: zone.label,
    groundY: zone.groundY,
    creatureScale: zone.creatureScale,
    affinityTypes: zone.affinityTypes,
    plate,
    hero: heroEntry,
    prompts: {
      plate: zone.platePrompt + PLATE_STYLE_SUFFIX,
      ...(zone.hero
        ? {
            hero: {
              seed: zone.hero.seedPrompt + HERO_SEED_SUFFIX,
              action: zone.hero.actionPrompt + HERO_ACTION_SUFFIX,
            },
          }
        : {}),
    },
  };

  const idx = reg.zones.findIndex(z => z.key === zone.key);
  if (idx >= 0) reg.zones[idx] = entry;
  else reg.zones.push(entry);

  reg.zones.sort((a, b) => {
    const ia = ZONES.findIndex(z => z.key === a.key);
    const ib = ZONES.findIndex(z => z.key === b.key);
    return ia - ib;
  });

  saveRegistry(reg);
}

// ─── Batched execution with 429 retry ───────────────────────────────────────
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
  console.log('\n🌍 Synamon — Tamagotchi World Generation');
  console.log(`Scene: ${SCENE_W}×${SCENE_H}  hero: ${HERO_CANVAS}×${HERO_CANVAS}@${HERO_FRAMES}f  batch: ${BATCH_SIZE}`);
  if (resume) console.log('Mode: resume (skip existing)');
  if (platesOnly) console.log('Mode: plates only');
  if (heroesOnly) console.log('Mode: heroes only');
  if (zoneArg) console.log(`Filter: ${zoneArg}`);
  console.log();

  const targets = zoneArg ? ZONES.filter(z => z.key === zoneArg) : ZONES;
  if (targets.length === 0) {
    console.error(`✗ No zone matches '${zoneArg}'. Known: ${ZONES.map(z => z.key).join(', ')}`);
    process.exit(1);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });

  // ── Phase A: cinematic plates (one /create-image-pixflux per zone) ────────
  if (!heroesOnly) {
    const plateJobs = targets.filter(zone => {
      const p = path.join(OUT_DIR, zone.key, 'plate.png');
      if (resume && fs.existsSync(p)) {
        console.log(`  ✓ ${zone.key}/plate exists`);
        return false;
      }
      return true;
    });

    if (plateJobs.length > 0) {
      console.log(`\n🖼  Plates: generating ${plateJobs.length}\n`);
      const r = await runBatch(plateJobs, async (zone) => {
        process.stdout.write(`  ⏳ ${zone.key}/plate... `);
        await generatePlate(zone);
        console.log('✓');
        syncEntry(zone);
      });
      console.log(`\n  Plates done: ${r.done}  failed: ${r.failed}`);
    } else {
      console.log('\n🖼  Plates: nothing to do');
    }
  }

  // ── Phase B: hero seeds ──────────────────────────────────────────────────
  if (!platesOnly) {
    const heroZones = targets.filter(z => z.hero !== null);

    const seedJobs = heroZones.filter(zone => {
      const seedPath = path.join(OUT_DIR, zone.key, 'hero', 'seed.png');
      if (resume && fs.existsSync(seedPath)) {
        console.log(`  ✓ ${zone.key}/hero seed exists`);
        return false;
      }
      return true;
    });

    if (seedJobs.length > 0) {
      console.log(`\n🌱 Hero seeds: generating ${seedJobs.length}\n`);
      const r = await runBatch(seedJobs, async (zone) => {
        process.stdout.write(`  ⏳ ${zone.key}/hero seed... `);
        await generateHeroSeed(zone.key, zone.hero!);
        console.log('✓');
        syncEntry(zone);
      });
      console.log(`\n  Hero seeds done: ${r.done}  failed: ${r.failed}`);
    } else {
      console.log('\n🌱 Hero seeds: nothing to do');
    }

    // ── Phase C: hero anims ──────────────────────────────────────────────────
    const animJobs = heroZones.filter(zone => {
      const seedPath = path.join(OUT_DIR, zone.key, 'hero', 'seed.png');
      const firstFrame = path.join(OUT_DIR, zone.key, 'hero', 'frame0.png');
      if (!fs.existsSync(seedPath)) {
        console.log(`  ⚠ ${zone.key}: seed missing — skipping hero anim`);
        return false;
      }
      if (resume && fs.existsSync(firstFrame)) {
        console.log(`  ✓ ${zone.key}/hero anim exists`);
        return false;
      }
      return true;
    });

    if (animJobs.length > 0) {
      console.log(`\n🎬 Hero anims: generating ${animJobs.length}\n`);
      const r = await runBatch(animJobs, async (zone) => {
        process.stdout.write(`  ⏳ ${zone.key}/hero anim... `);
        const frames = await generateHeroAnim(zone.key, zone.hero!);
        console.log(`✓ ${frames.length} frames`);
        syncEntry(zone);
      });
      console.log(`\n  Hero anims done: ${r.done}  failed: ${r.failed}`);
    } else {
      console.log('\n🎬 Hero anims: nothing to do');
    }
  }

  // Final full sync
  console.log('\n📝 Syncing world.json...');
  for (const zone of ZONES) {
    syncEntry(zone);
  }
  const reg = loadRegistry();
  console.log(`  Registry zones: ${reg.zones.length} / ${ZONES.length}`);
  console.log('\n✅ Done');
}

main().catch(err => {
  console.error('\nFatal:', err);
  process.exit(1);
});
