/**
 * Synamon animation generation script
 * Generates idle and attack animations for all species using animate-with-text-v3 API.
 *
 * Usage:
 *   npx tsx scripts/generate-animations.ts
 *   npx tsx scripts/generate-animations.ts --resume         (skip already generated)
 *   npx tsx scripts/generate-animations.ts --species cindrel
 *   npx tsx scripts/generate-animations.ts --anim idle      (only idle)
 *   npx tsx scripts/generate-animations.ts --anim attack    (only attack)
 *   npx tsx scripts/generate-animations.ts --stage 1        (only stage 1 of each species)
 */

import * as fs from 'fs';
import * as path from 'path';

const API_KEY = 'f82b0da8-5d5f-45b3-a9c3-3bb53d725cea';
const API_BASE = 'https://api.pixellab.ai/v2';
const SPECIES_FILE = path.resolve('public/synamon/species.json');
const OUT_DIR = path.resolve('public/synamon');
const STATE_FILE = path.resolve('public/synamon/animation-state.json');

const FRAME_COUNT = 6;  // frames per animation (not counting the static first frame)
const BATCH_SIZE = 3;   // concurrent jobs — animate API is heavier than sprite gen

// Base animation prompts — applied to all species unless overridden below
const ANIM_PROMPTS: Record<string, string> = {
  idle:   'very subtle breathing idle, minimal movement, tiny weight shift, eyes stay open no blinking, mouth stays closed',
  attack: 'attack animation, quick decisive strike or lunge forward, clearly different from idle, return to stance',
};

// Per-species prompt overrides: speciesId → { idle?, attack? }
// Use these when the default prompts produce bad results for a specific species
const SPECIES_OVERRIDES: Record<string, Partial<Record<string, string>>> = {
  cindrel: {
    idle:   'very subtle breathing, tiny belly and tail rise and fall, minimal movement, mouth stays closed',
    attack: 'quick bite lunge forward with open mouth, eyes stay round and open, return to stance, clearly aggressive action',
  },
  murkling: {
    idle:   'very subtle body sway, eyes stay open as two white dots, mouth stays closed, face does not change, shadow wisps shift slightly',
    attack: 'quick lunge forward, eyes stay open as two white dots, face does not change, shadow wisps flare out, return to stance',
  },
  voidrath: {
    idle:   'very subtle body sway, crescent eyes stay open and unchanged, no facial animation, star-field in body shimmers slightly',
    attack: 'quick powerful lunge, crescent eyes stay open and unchanged, shadow tendrils flare, return to proud stance',
  },
};

// --- CLI args ---
const args = process.argv.slice(2);
const resume   = args.includes('--resume');
const speciesArg = args.find(a => a.startsWith('--species='))?.split('=')[1] ??
                   (args.indexOf('--species') >= 0 ? args[args.indexOf('--species') + 1] : null);
const animArg  = args.find(a => a.startsWith('--anim='))?.split('=')[1] ??
                 (args.indexOf('--anim') >= 0 ? args[args.indexOf('--anim') + 1] : null);
const stageArg = args.find(a => a.startsWith('--stage='))?.split('=')[1] ??
                 (args.indexOf('--stage') >= 0 ? args[args.indexOf('--stage') + 1] : null);

// --- State ---
interface AnimJobState {
  jobId: string;
  speciesId: string;
  stageKey: string;
  animName: string;
  outDir: string;
  status: 'pending' | 'done' | 'failed';
  error?: string;
}

interface AnimState {
  done: number;
  failed: number;
  jobs: AnimJobState[];
}

function loadState(): AnimState {
  if (fs.existsSync(STATE_FILE)) {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  }
  return { done: 0, failed: 0, jobs: [] };
}

function saveState(state: AnimState) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// --- Species JSON ---
function loadSpecies(): any[] {
  return JSON.parse(fs.readFileSync(SPECIES_FILE, 'utf8'));
}

function updateSpeciesJson(speciesId: string, stageKey: string, animName: string, framePaths: string[]) {
  const species = loadSpecies();
  const sp = species.find((s: any) => s.id === speciesId);
  if (!sp) return;
  const stageNum = parseInt(stageKey.replace('stage', ''));
  const stage = sp.stages.find((s: any) => s.stage === stageNum);
  if (!stage) return;

  // Store as web paths
  const webPaths = framePaths.map(p => p.replace(path.resolve('public'), '').replace(/\\/g, '/'));

  if (animName === 'idle')   stage.idleFrames   = webPaths;
  if (animName === 'attack') stage.attackFrames = webPaths;

  // Also update animations map on the species level
  if (!sp.animations) sp.animations = {};
  sp.animations[`${stageKey}-${animName}`] = webPaths;

  fs.writeFileSync(SPECIES_FILE, JSON.stringify(species, null, 2));
}

// --- HTTP helpers ---
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

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

// --- Core generation ---
// animate-with-text-v3 returns images directly in the response (no background job).
async function generateAnimation(spritePath: string, animName: string, outDir: string, speciesId?: string): Promise<string[]> {
  const spriteData = fs.readFileSync(spritePath);
  const base64 = spriteData.toString('base64');

  const prompt = (speciesId && SPECIES_OVERRIDES[speciesId]?.[animName])
    ?? ANIM_PROMPTS[animName];

  const body = {
    first_frame: { type: 'base64', base64, format: 'png' },
    action: prompt,
    frame_count: FRAME_COUNT,
    no_background: true,
  };

  const res = await apiFetch('/animate-with-text-v3', body);
  const images: any[] = res.images ?? [];

  if (images.length === 0) throw new Error('No images in response');

  fs.mkdirSync(outDir, { recursive: true });
  const paths: string[] = [];

  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    const outPath = path.join(outDir, `frame${i}.png`);

    if (img.base64) {
      fs.writeFileSync(outPath, Buffer.from(img.base64, 'base64'));
    } else if (img.url || img.storage_url) {
      const url = img.url ?? img.storage_url;
      const r = await fetch(url);
      if (!r.ok) throw new Error(`Download failed: ${url}`);
      fs.writeFileSync(outPath, Buffer.from(await r.arrayBuffer()));
    } else {
      throw new Error(`Unknown image format at index ${i}`);
    }

    paths.push(outPath);
  }

  return paths;
}

// --- Main ---
async function main() {
  const animNames = animArg ? [animArg] : Object.keys(ANIM_PROMPTS);
  const stageFilter = stageArg ? parseInt(stageArg) : null;

  console.log('\n🎬 Synamon Phase 3 — Animation Generation');
  console.log(`Mode: ${resume ? 'resume' : 'fresh'}`);
  console.log(`Animations: ${animNames.join(', ')}`);
  if (speciesArg) console.log(`Species: ${speciesArg}`);
  if (stageFilter) console.log(`Stage: ${stageFilter}`);
  console.log();

  const allSpecies = loadSpecies();
  const state = loadState();

  // Build job list
  interface Job {
    speciesId: string;
    stageKey: string;
    animName: string;
    spritePath: string;
    outDir: string;
  }

  const jobs: Job[] = [];

  for (const sp of allSpecies) {
    if (speciesArg && sp.id !== speciesArg) continue;

    for (const stage of sp.stages) {
      if (stageFilter && stage.stage !== stageFilter) continue;
      if (!stage.sprite) continue;

      const spritePath = path.resolve('public' + stage.sprite);
      if (!fs.existsSync(spritePath)) {
        console.log(`  ⚠️  Sprite missing: ${stage.sprite} — skipping`);
        continue;
      }

      const stageKey = `stage${stage.stage}`;

      for (const animName of animNames) {
        const animOutDir = path.join(OUT_DIR, sp.id, `${stageKey}-${animName}`);

        // Skip if already done (resume mode)
        if (resume) {
          const existingFrames = fs.existsSync(animOutDir)
            ? fs.readdirSync(animOutDir).filter(f => f.endsWith('.png'))
            : [];
          if (existingFrames.length > 0) {
            console.log(`  ✓  ${sp.id}/${stageKey}-${animName} already done (${existingFrames.length} frames)`);
            continue;
          }
        }

        jobs.push({ speciesId: sp.id, stageKey, animName, spritePath, outDir: animOutDir });
      }
    }
  }

  console.log(`Generating ${jobs.length} animations in batches of ${BATCH_SIZE}...\n`);

  let done = 0, failed = 0;

  for (let i = 0; i < jobs.length; i += BATCH_SIZE) {
    const batch = jobs.slice(i, i + BATCH_SIZE);

    await Promise.allSettled(batch.map(async (job) => {
      process.stdout.write(`  ⏳ ${job.speciesId}/${job.stageKey}-${job.animName}... `);
      try {
        const framePaths = await generateAnimation(job.spritePath, job.animName, job.outDir, job.speciesId);
        updateSpeciesJson(job.speciesId, job.stageKey, job.animName, framePaths);
        console.log(`✓ ${framePaths.length} frames`);
        done++;
      } catch (err: any) {
        console.log(`✗ ${err.message}`);
        failed++;
      }
    }));

    state.done = done;
    state.failed = failed;
    saveState(state);
  }

  console.log(`\n✅ Done: ${done}  ✗ Failed: ${failed}`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
