/**
 * Co-Focus scene plate animation generation script
 * Generates 16-frame looping animations for each scene plate using animate-with-text-v3 API.
 *
 * The API has a 256x256 max size limit, so plates (400x180) are downscaled to 256x115
 * before sending, and returned frames are upscaled back to 400x180 using ImageMagick.
 *
 * Usage:
 *   npx tsx scripts/generate-scene-anims.ts
 *   npx tsx scripts/generate-scene-anims.ts --scene campfire
 *   npx tsx scripts/generate-scene-anims.ts --resume   (skip scenes that already have frames)
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const API_KEY = 'f82b0da8-5d5f-45b3-a9c3-3bb53d725cea';
const API_BASE = 'https://api.pixellab.ai/v2';
const SCENES_DIR = path.resolve('public/cofocus/scenes');
const SCENES_JSON = path.resolve('public/cofocus/scenes.json');
const FRAME_COUNT = 16;
const POLL_INTERVAL_MS = 5000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000;

// API max = 256x256; 400x180 → 256x115 (preserving aspect ratio)
const API_W = 256;
const API_H = 115;
const OUT_W = 400;
const OUT_H = 180;

interface SceneAnimConfig {
  key: string;
  plateFile: string;
  action: string;
}

const SCENE_CONFIGS: SceneAnimConfig[] = [
  {
    key: 'campfire',
    plateFile: 'campfire-plate.png',
    action: 'gentle flickering campfire flames, embers floating upward, soft light dancing on trees',
  },
  {
    key: 'library',
    plateFile: 'library-plate.png',
    action: 'gentle rain streaks on window, warm candlelight flickering softly',
  },
  {
    key: 'ocean',
    plateFile: 'ocean-plate.png',
    action: 'gentle ocean waves lapping shore, sun shimmer on water',
  },
  {
    key: 'mountain',
    plateFile: 'mountain-plate.png',
    action: 'gentle aurora borealis undulating, soft snowfall, stars twinkling',
  },
];

// ─── Image helpers (ImageMagick) ─────────────────────────────────────────────

function downscaleToBase64(platePath: string): string {
  const tmpPath = `/tmp/scene-anim-downscaled-${Date.now()}.png`;
  execSync(`magick "${platePath}" -resize ${API_W}x${API_H}! "${tmpPath}"`);
  const data = fs.readFileSync(tmpPath);
  fs.unlinkSync(tmpPath);
  return data.toString('base64');
}

function upscaleAndSave(base64: string, outPath: string) {
  const tmpPath = `/tmp/scene-anim-upscale-${Date.now()}.png`;
  fs.writeFileSync(tmpPath, Buffer.from(base64, 'base64'));
  execSync(`magick "${tmpPath}" -resize ${OUT_W}x${OUT_H}! -filter point "${outPath}"`);
  fs.unlinkSync(tmpPath);
}

// ─── API helpers ─────────────────────────────────────────────────────────────

async function apiFetch(endpoint: string, body: any): Promise<any> {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${endpoint} ${res.status}: ${text}`);
  }
  return res.json();
}

async function apiGet(endpoint: string): Promise<any> {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    headers: { 'Authorization': `Bearer ${API_KEY}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API GET ${endpoint} ${res.status}: ${text}`);
  }
  return res.json();
}

async function pollJob(jobId: string): Promise<any> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    const result = await apiGet(`/background-jobs/${jobId}`);
    if (result.status === 'completed') return result;
    if (result.status === 'failed') throw new Error(`Job ${jobId} failed: ${result.error}`);
    process.stdout.write('.');
  }
  throw new Error(`Job ${jobId} timed out after 5 minutes`);
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

// ─── Core generation ─────────────────────────────────────────────────────────

async function generateSceneAnim(config: SceneAnimConfig, resume: boolean): Promise<string[] | null> {
  const platePath = path.join(SCENES_DIR, config.plateFile);
  if (!fs.existsSync(platePath)) {
    console.error(`  Plate not found: ${platePath}`);
    return null;
  }

  // Check if frames already exist
  if (resume) {
    const existing = fs.readdirSync(SCENES_DIR)
      .filter(f => f.startsWith(`${config.key}-frame-`) && f.endsWith('.png'));
    if (existing.length >= FRAME_COUNT) {
      console.log(`  Skipping ${config.key} (${existing.length} frames exist)`);
      return existing.sort().map(f => `/cofocus/scenes/${f}`);
    }
  }

  console.log(`  Downscaling ${config.plateFile} to ${API_W}x${API_H}...`);
  const base64 = downscaleToBase64(platePath);

  console.log(`  Generating ${FRAME_COUNT} frames for "${config.key}"...`);
  const body = {
    first_frame: { type: 'base64', base64, format: 'png' },
    action: config.action,
    frame_count: FRAME_COUNT,
    no_background: false,
  };

  let res = await apiFetch('/animate-with-text-v3', body);

  if (res.background_job_id) {
    process.stdout.write(`  Polling job ${res.background_job_id}`);
    const jobResult = await pollJob(res.background_job_id);
    res = jobResult.last_response ?? jobResult;
    console.log(' done');
  }

  const images: any[] = res.images ?? [];
  if (images.length === 0) {
    console.error(`  No images returned for ${config.key}`);
    return null;
  }

  console.log(`  Upscaling ${images.length} frames to ${OUT_W}x${OUT_H}...`);
  const framePaths: string[] = [];
  for (let i = 0; i < images.length; i++) {
    const frameNum = i.toString().padStart(2, '0');
    const fileName = `${config.key}-frame-${frameNum}.png`;
    const filePath = path.join(SCENES_DIR, fileName);
    upscaleAndSave(images[i].base64, filePath);
    framePaths.push(`/cofocus/scenes/${fileName}`);
  }

  console.log(`  Saved ${framePaths.length} frames for ${config.key}`);
  return framePaths;
}

// ─── Update scenes.json ──────────────────────────────────────────────────────

function updateScenesJson(sceneFrames: Record<string, string[]>) {
  const raw = fs.readFileSync(SCENES_JSON, 'utf-8');
  const data = JSON.parse(raw);

  for (const scene of data.scenes) {
    if (sceneFrames[scene.key]) {
      scene.plateFrames = sceneFrames[scene.key];
    }
  }

  fs.writeFileSync(SCENES_JSON, JSON.stringify(data, null, 2) + '\n');
  console.log('\nUpdated scenes.json with plateFrames arrays.');
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const resume = args.includes('--resume');
  const sceneIdx = args.indexOf('--scene');
  const targetScene = sceneIdx >= 0 ? args[sceneIdx + 1] : null;

  // Verify magick is available
  try {
    execSync('magick --version', { stdio: 'ignore' });
  } catch {
    console.error('Error: ImageMagick (magick) is required but not found. Install it first.');
    process.exit(1);
  }

  const configs = targetScene
    ? SCENE_CONFIGS.filter(c => c.key === targetScene)
    : SCENE_CONFIGS;

  if (configs.length === 0) {
    console.error(`Unknown scene: ${targetScene}`);
    process.exit(1);
  }

  console.log(`Generating scene animations for ${configs.length} scene(s)...`);
  const sceneFrames: Record<string, string[]> = {};

  for (const config of configs) {
    console.log(`\n[${config.key}]`);
    try {
      const frames = await generateSceneAnim(config, resume);
      if (frames) {
        sceneFrames[config.key] = frames;
      }
    } catch (err: any) {
      console.error(`  Error generating ${config.key}: ${err.message}`);
    }
    // Small delay between scenes to avoid rate limiting
    if (configs.indexOf(config) < configs.length - 1) {
      await sleep(2000);
    }
  }

  if (Object.keys(sceneFrames).length > 0) {
    updateScenesJson(sceneFrames);
  }

  console.log('\nDone!');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
