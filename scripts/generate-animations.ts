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

const FRAME_COUNT_DEFAULT = 6;   // frames for idle/attack
const FRAME_COUNT_LONG    = 16;  // frames for focused/celebrating and other expressive anims
const BATCH_SIZE = 3;            // concurrent jobs — animate API is heavier than sprite gen

// Per-animation frame counts (overrides FRAME_COUNT_DEFAULT)
const ANIM_FRAME_COUNTS: Record<string, number> = {
  idle:        6,
  attack:      6,
  focused:     16,
  celebrating: 16,
  happy:       10,
  feed:        10,
  pet:         10,
  sleep:       16,
  play:        12,
  excited:     12,
  sad:         10,
  hungry:      10,
  sick:        10,
  levelup:     12,
};

// Tamagotchi animations only apply to stage 1 (base form).
// Any anim listed here will be skipped for stage 2+.
const TAMAGOTCHI_ANIMS = new Set([
  'focused', 'celebrating', 'happy', 'excited',
  'feed', 'pet', 'play', 'sleep',
  'sad', 'hungry', 'sick', 'levelup',
]);

// Base animation prompts — applied to all species unless overridden below
const ANIM_PROMPTS: Record<string, string> = {
  idle:        'very subtle breathing idle, minimal movement, tiny weight shift, eyes stay open no blinking, mouth stays closed',
  attack:      'attack animation, quick decisive strike or lunge forward, clearly different from idle, return to stance',
  focused:     'calm attentive pose, settle into stillness, eyes forward and alert, slight forward lean, breathing slows, clearly engaged with a task, purposeful and different from idle',
  celebrating: 'burst of joyful energy, jump or spin or shake with excitement, celebratory reaction, clearly triumphant, high energy contrast to idle, return to upright',
};

// Per-species prompt overrides: speciesId → { idle?, attack?, focused?, celebrating?, ... }
// Use these when the default prompts produce bad results for a specific species
const SPECIES_OVERRIDES: Record<string, Partial<Record<string, string>>> = {
  cindrel: {
    idle:        'very subtle breathing, tiny belly and tail rise and fall, minimal movement, mouth stays closed',
    attack:      'quick bite lunge forward with open mouth, eyes stay round and open, return to stance, clearly aggressive action',
    focused:     'settles reluctantly into stillness, tail tip flickers with restrained energy, eyes lock forward intensely, slight crouch like coiled spring, clearly holding back',
    celebrating: 'explosive burst of energy, jumps and spins with tail flaring, mouth opens in triumphant roar, lands back in proud stance',
  },
  aquill: {
    focused:     'sinks into a calm resting pose, flippers tucked, collar frill slows its pulse, eyes soft and forward, breathing visibly slows, peaceful and content',
    celebrating: 'wiggles whole body with delight, flippers clap together, collar frill flashes bright, bounces in place with joy',
  },
  brezzet: {
    focused:     'ears rotate forward and lock, body stills mid-fidget, eyes widen with sudden attention, tail wraps around body, poised and alert',
    celebrating: 'ears spin like propellers, leaps into the air, twirls, lands with a happy yip, tail wagging wildly',
  },
  glowick: {
    focused:     'abdomen glow steadies to a calm constant pulse, antennae lower gently, body settles close to ground, eyes half-close in peaceful concentration',
    celebrating: 'abdomen flares bright, hops in small excited circles, antennae wave rapidly, glow pulses in happy bursts',
  },
  murkling: {
    idle:        'very subtle body sway, eyes stay open as two white dots, mouth stays closed, face does not change, shadow wisps shift slightly',
    attack:      'quick lunge forward, eyes stay open as two white dots, face does not change, shadow wisps flare out, return to stance',
    focused:     'shadow wisps settle and still, eyes stay open as two white dots, body becomes slightly more defined and solid, eerie calm, face does not change',
    celebrating: 'shadow wisps explode outward in all directions, body flickers and reforms, eyes stay open as two white dots, unsettling joyful shimmer',
  },
  peblix: {
    focused:     'curls slightly inward, shell plates shift to a locked position, eyes half-close, body becomes very still and heavy, rock-solid concentration',
    celebrating: 'uncurls with a thud, stamps feet twice, shell plates clatter open briefly, shakes head with slow satisfaction',
  },
  humtick: {
    focused:     'wing-cases clamp shut mid-vibration, antennae point straight forward, body freezes except for tiny leg taps, buzzing quiets to near-silence',
    celebrating: 'wing-cases blast open, body vibrates intensely, shoots upward briefly, lands with a triumphant chirp-buzz',
  },
  crystub: {
    focused:     'gem-eyes focus to a single bright point, quartz shards on back settle, sits very still with paws together, soft steady inner glow',
    celebrating: 'gem-eyes flash rainbow colours, quartz shards chime as it bounces, spins once with arms out, gentle sparkle shower',
  },
  cloakrit: {
    focused:     'carapace seals flat, claws fold in, body goes preternaturally still and dark, only the tiny eyes visible, ambush-ready concentration',
    celebrating: 'claws spread wide, carapace briefly pulses visible, does a small sideways victory shuffle, returns to dark stillness with satisfied pause',
  },
  ashpaw: {
    focused:     'drops into a low aggressive crouch, pawpads glow brighter, eyes narrow, ember glow steadies, restrained power, clearly ready',
    celebrating: 'rears up on hind legs, slams paws down releasing ember burst, roars with mouth open, stands tall and proud',
  },
  driftull: {
    focused:     'sinks lower, eyes droop to a warm half-close, steam venting slows to a gentle wisp, body settles like a warm stone, deeply comfortable',
    celebrating: 'releases a big happy steam blast, body jiggles with laughter, rolls slightly side to side, settles back with a contented exhale',
  },
  buzzlit: {
    focused:     'wings slow to a hover-still, body drops into a focused crouch, big eyes zoom forward, antennae lock on target, vibrating with contained energy',
    celebrating: 'wings blast to full speed, shoots upward in a loop, crashes back down in a happy tumble, gets back up wiggling',
  },
  galecub: {
    focused:     'windsock tail wraps around body to stop it blowing, nostrils flare and lock forward, body drops low, focused pounce stance, barely contained',
    celebrating: 'zoomies — dashes left and right rapidly, tail streaming behind, skids to a stop, jumps once with all four paws off ground',
  },
  sporik: {
    focused:     'cap lowers slightly, body sinks into an even deeper stillness, eyes close fully, spore release pauses entirely, meditative absorption',
    celebrating: 'releases a slow gentle puff of celebratory spores, sways once left then right, eyes open briefly with warm satisfaction, resettles',
  },
  spectrix: {
    focused:     'crystal body brightens to a steady clear light, legs lock delicately in place, internal geometry slows to a calm rhythm, eyes forward and luminous',
    celebrating: 'internal crystal structure flashes in a cascade of light, prances lightly in a small joyful circle, chimes softly, stills with a warm glow',
  },
  flintlet: {
    focused:     'scales click once and then go silent, body presses low to the surface, eyes narrow and lock, tail stills, scrappy readiness',
    celebrating: 'scales click-clack rapidly in celebration, does a quick spin, stamps tail twice, stands up straight with proud chest out',
  },
  glintfin: {
    focused:     'glides to a graceful near-stop, fins arrange perfectly, iridescent underside dims to an elegant steady sheen, composed and regal',
    celebrating: 'iridescent underside flashes full spectrum, performs a graceful celebratory spin, fins spread wide, settles back with satisfied elegance',
  },
  runekit: {
    focused:     'sigils on fur slow and converge toward chest, eyes glow steady, sits upright with deliberate stillness, one paw raised slightly, thinking',
    celebrating: 'sigils scatter and spin outward in a burst, leaps once with all paws, lands neatly, sigils reform in a satisfied pattern',
  },
  windmite: {
    focused:     'sail-fin folds flat, rolls into a partial ball, locks still, very slow measured breathing, patient and immovable',
    celebrating: 'sail-fin snaps open to full extension, rolls in a quick happy circle, unfurls completely and stands tall',
  },
  duskrat: {
    focused:     'big ears rotate forward and flatten slightly, body freezes mid-tremble, eyes wide and locked forward, shadow-fur steadies, anxious focus',
    celebrating: 'ears flap rapidly in excitement, hops three times in place, spins once, squeaks and stills with wide happy eyes',
  },
  bassolt: {
    focused:     'chest cavity dims its resonance, body goes very still, eyes close to a grumpy squint, clearly concentrating but refuses to look enthusiastic',
    celebrating: 'delivers one enormous satisfied belly thump, the shockwave visible around it, grunts in approval, crosses arms with a gruff nod',
  },
  glassling: {
    focused:     'drifting slows to a near-stop, tentacles arrange gently downward, body dims to a soft even glow, dreamily absorbed, perfectly calm',
    celebrating: 'tentacles spread wide and ripple with light, drifts upward slightly, glows brightly for a sustained moment, settles back softly',
  },
  tidepup: {
    idle:        'gentle breathing, body rises and falls softly, resting pose',
    attack:      'quick lunge forward, return to stance',
    focused:     'brine crust settles, body stills in an eager locked pose, eyes wide and forward, stubby tail stops wagging, fully locked in',
    celebrating: 'tail wags furiously, whole back half wiggles, bounces forward and back, lets out a happy open-mouthed pant',
  },
  fluxling: {
    idle:        'gentle breathing, body rises and falls softly, resting pose',
    attack:      'quick lunge forward, return to stance',
    focused:     'heat-shimmer aura briefly stabilises, erratic movements pause, eyes lock forward, one ear up one ear down, unpredictable stillness',
    celebrating: 'aura flares wildly, spins twice rapidly, bounces off the ground, lands in a random but delighted pose',
  },
  lumenox: {
    focused:     'inner glow steadies to a warm constant light, body settles low, eyes close halfway, breathing slow and even, radiating calm focus',
    celebrating: 'inner glow surges bright, does a small happy wriggle, tail sweeps a full arc, glow pulses twice and settles warm',
  },
  scaldit: {
    idle:        'gentle breathing, body rises and falls softly, resting pose',
    attack:      'quick lunge forward, return to stance',
    focused:     'steam venting slows to a controlled trickle, body straightens with territorial pride, eyes narrow and lock, deliberate and self-assured',
    celebrating: 'releases a triumphant steam burst, stamps once, lifts head high with pride, settles back with territorial satisfaction',
  },
  darkspore: {
    focused:     'spore release pauses entirely, shadow body becomes slightly more defined, drifts to a near-stop, watches with eerie quiet attention',
    celebrating: 'releases a cloud of dark celebratory spores, body bobs once, drifts in a slow happy spiral, resettles in eerie calm',
  },
  chuffin: {
    focused:     'ruffled feathers smooth down all at once, chest puffs out, beak points forward with purpose, performs a single dramatic focus pose',
    celebrating: 'feathers explode outward then settle, does a theatrical spin, bows, pops back up with a smug satisfied expression',
  },
  tremlet: {
    focused:     'stone-plate horns lower slightly, body shrinks into a careful still crouch, eyes wide and gentle, breathing very quiet, delicate focus',
    celebrating: 'does a small surprised happy hop, stone horns clatter gently, shakes head with joy, nuzzles forward and pulls back shyly',
  },
  omenix: {
    focused:     'becomes completely still, the half-lit half-dark face locks forward, presence feels heavier, neither side of the face changes expression, unsettling absolute attention',
    celebrating: 'a slow deliberate single nod, the moon-face shifts almost imperceptibly, a faint luminous ripple passes through the body, returns to stillness — regal acknowledgement',
  },
  lunveil: {
    focused:     'obsidian armour plates settle and lock, wings fold completely still, eyes open to full luminous slits, the dark side of the moon utterly present, vast quiet power',
    celebrating: 'a single slow wing extension to full span, held for a beat, then folds back, one low resonant exhale visible as a shimmer in the air — ancient satisfaction',
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

  const frameCount = ANIM_FRAME_COUNTS[animName] ?? FRAME_COUNT_DEFAULT;

  const body = {
    first_frame: { type: 'base64', base64, format: 'png' },
    action: prompt,
    frame_count: frameCount,
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
        // Tamagotchi anims are base form only — skip stage 2+
        if (TAMAGOTCHI_ANIMS.has(animName) && stage.stage !== 1) continue;

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
