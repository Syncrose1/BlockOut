/**
 * Synamon sprite generation script
 * Generates front sprites for all species using create_map_object REST API
 * with style reference images passed as background_image for consistency.
 *
 * Usage:
 *   npx tsx scripts/generate-synamon.ts
 *   npx tsx scripts/generate-synamon.ts --resume   (skip already generated)
 *   npx tsx scripts/generate-synamon.ts --species cindrel  (single species)
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const API_KEY = 'f82b0da8-5d5f-45b3-a9c3-3bb53d725cea';
const API_BASE = 'https://api.pixellab.ai/v2';
const OUT_DIR = path.resolve('public/synamon');
const STATE_FILE = path.resolve('public/synamon/generation-state.json');
const SPECIES_FILE = path.resolve('public/synamon/species.json');

// Style reference images (used as background_image for style consistency)
const STYLE_REFS = {
  default:  path.resolve('public/synamon/_review/chuffin-mo.png'),   // cute/small
  mid:      path.resolve('public/synamon/_review/scaldrix.png'),      // upright/angular
  final:    path.resolve('public/synamon/_review/pyrathon-v3.png'),   // large/battle
  umbra:    path.resolve('public/synamon/_review/murkling-mo.png'),   // shadow/lineless
};

// Per-species prompt data
const PROMPTS: Record<string, { stage: number; description: string; ref?: keyof typeof STYLE_REFS; outline?: string; shading?: string; detail?: string }[]> = {
  cindrel: [
    { stage: 1, description: 'Cindrel, a small flat wide-bodied gecko lizard with charcoal-grey scales and ember-orange underbelly markings, four wide-set splayed legs close to the ground, tiny wisps of smoke from flared nostrils, bright curious eyes, stubby thick tail with glowing red tip, chibi pokemon-style, pixel art, transparent background', ref: 'default' },
    { stage: 2, description: 'Scaldrix, a teenage bipedal lizard standing upright with confidence, slate-black scales with molten orange underbelly, a ridge of small flame vents running down its spine, lean angular body, sharp determined eyes, long tail, pixel art, transparent background', ref: 'default' },
    { stage: 3, description: 'Pyrathon, a massive wingless serpentine dragon with no legs and no wings, snake-like body rearing up tall in battle stance, neck raised high, sinuous body coiling at the base, magma-cracked dark armour plates with glowing orange lava fissures, dorsal eruption vents along spine, fierce narrow eyes, full body filling the canvas vertically, pixel art, transparent background', ref: 'default' },
  ],
  aquill: [
    { stage: 1, description: 'Aquill, a roly-poly walrus pup with stubby flippers and a frilled collar that pulses blue, round pudgy body, big wet eyes, perpetually damp-looking, friendly expression, chibi pokemon-style, pixel art, transparent background', ref: 'default' },
    { stage: 2, description: 'Tidecrest, a confident upright sea-lion with broad shoulders, deep navy blue fur, a glowing bioluminescent stripe running down its chest, wide flippers held out ready, bright playful eyes, pixel art, transparent background', ref: 'default' },
    { stage: 3, description: 'Abyssant, a massive evolved Tidecrest, a huge armoured seal body visibly larger and more powerful than Tidecrest, thick smooth armour plates grown over its body, broad armoured chest, two enormous front flippers, same rounded head as Tidecrest now with a helmet-like armoured brow, big bright eyes, deep navy with bioluminescent blue markings along armour seams, fills the canvas completely, pixel art, transparent background', refPath: 'public/synamon/aquill/stage2.png' },
  ],
  brezzet: [
    { stage: 1, description: 'Brezzet, a tiny fox with enormous oversized ears that act as wind scoops, permanently wind-ruffled fur streaming sideways, big round eyes, compact chibi body, tail trailing in the breeze, pixel art, transparent background', ref: 'default' },
    { stage: 2, description: 'Galekin, a sleek fox standing tall with huge swept-back ears like wings, fur tips dissolving into wind-wisps, bright alert eyes, one paw raised mid-stride, energetic confident pose, pixel art, transparent background', ref: 'default' },
    { stage: 3, description: 'Stormveil, an enormous winged fox with vast feathered wings spread wide filling the canvas, a mane of whipping wind-fur, fierce glowing eyes, taloned forepaws raised in battle stance, compressed air vortex swirling below, pixel art, transparent background', ref: 'default' },
  ],
  glowick: [
    { stage: 1, description: 'Glowick, a fat round cave cricket with a softly glowing bioluminescent abdomen lantern, wide white pupil-less eyes, stubby antennae, chubby legs, gentle warm light emanating from belly, chibi pokemon-style, pixel art, transparent background', ref: 'default' },
    { stage: 2, description: 'Lanternis, a chubby round glowing bug, round body with a very bright amber-gold glowing belly, six stubby legs, two white dot eyes, two short antennae, no wings, warm light spilling from its underside, chibi pokemon-style, pixel art, transparent background', refPath: 'public/synamon/glowick/stage1.png' },
  ],
  murkling: [
    { stage: 1, description: 'Murkling, a small shadowy ferret-like creature made entirely of living darkness, wispy blurry edges like smoke, only two tiny glowing white dot eyes visible, indistinct silhouette, pixel art, transparent background', ref: 'umbra', outline: 'lineless', shading: 'flat shading', detail: 'low detail' },
    { stage: 2, description: 'Voidrath, a large panther-shaped shadow creature, body filled with tiny white stars like a night sky visible within the darkness, four powerful legs in a proud standing pose, bright white crescent-shaped eyes, no red mane or red details, shadow wisps trailing from tail, pixel art, transparent background', ref: 'umbra', outline: 'lineless', shading: 'flat shading', detail: 'low detail' },
  ],
  peblix: [
    { stage: 1, description: 'Peblix, a round armadillo pup with a completely smooth river-tumbled grey rock exterior, tiny curious eyes peering through gaps in its stone-plate face, compact sphere-like body, chibi pokemon-style, pixel art, transparent background', ref: 'default' },
    { stage: 2, description: 'Crustone, a sturdy bipedal rock armadillo slightly larger than Peblix, smooth grey stone plates on its back with a few mossy patches starting to form, stubby arms and legs, round friendly face peeking out, confident upright stance, pixel art, transparent background', ref: 'default' },
    { stage: 3, description: 'Castellus, a huge bipedal armadillo warrior with a shell built like crenellated fortress walls, thick stone-plate arms raised in battle stance, patches of lichen across its back, enormous and imposing, full body filling the canvas, pixel art, transparent background', ref: 'default' },
  ],
  humtick: [
    { stage: 1, description: 'Humtick, a walnut-sized cicada-beetle with wing-cases that visibly vibrate, small round body, large compound eyes, six stubby legs, chibi insect creature, pixel art, transparent background', ref: 'default' },
    { stage: 2, description: 'Resonar, an evolution of Humtick, a larger rounder cricket-beetle with a big spherical body, same brown-yellow colour scheme as Humtick, chubby stylised legs, two large round compound eyes, short antennae, small wings on its back showing vibration shimmer, friendly sitting pose, chibi proportions, pixel art, transparent background', refPath: 'public/synamon/humtick/stage1.png' },
  ],
  crystub: [
    { stage: 1, description: 'Crystub, a chubby bear cub with faceted gem eyes and small quartz crystal shards sprouting from its back like new teeth, slightly clumsy sitting pose, refracts nearby light, chibi pokemon-style, pixel art, transparent background', ref: 'default' },
    { stage: 2, description: 'Gemlash, a stocky adolescent bear standing on all fours, a full ridge of large quartz crystal spines running from neck to tail, gem-faceted claws, confident wide stance, sunlight refracting off crystals into rainbow flecks, pixel art, transparent background', ref: 'default' },
    { stage: 3, description: 'Prismark, a massive crystal-armoured bear rearing up on hind legs in battle stance, body encrusted with interlocking gem plates that split light into rainbow shards, enormous paws raised, broad chest, filling the canvas vertically, pixel art, transparent background', ref: 'default' },
  ],
  cloakrit: [
    { stage: 1, description: 'Cloakrit, a crab with a carapace that absorbs all light making it appear as a black void, only its legs reliably visible, crouching low, chibi pokemon-style, pixel art, transparent background', ref: 'umbra', outline: 'lineless', shading: 'flat shading', detail: 'low detail' },
    { stage: 2, description: 'Wraithel, a large crab-mantis with a void-black body, shadow-cloak spreading behind it like a dark wave, six visible pale legs, two glowing violet eyes, rearing up tall with claws raised, pixel art, transparent background', ref: 'umbra', outline: 'lineless', shading: 'flat shading', detail: 'low detail' },
  ],
  ashpaw: [
    { stage: 1, description: 'Ashpaw, a sooty ash-grey bear cub with ember-glowing orange pawpads, leaving faint scorch marks, wide affectionate eyes, chubby chibi body, sitting pose, pixel art, transparent background', ref: 'default' },
    { stage: 2, description: 'Cinderox, a lean adolescent bear-like creature on all fours, slender build not bulky, ashy dark grey fur with visible texture, glowing ember-orange pawpads and ear-tips, small ridge of embers along spine, confident low stance, pixel art, transparent background', ref: 'default' },
    { stage: 3, description: 'Emberlord, a large bear rearing on hind legs in battle stance, ashy grey fur, smouldering cinder patches on its chest and shoulders, glowing pawpads, simple clean design consistent with chibi pixel art style, fills the canvas vertically, pixel art, transparent background', ref: 'default' },
  ],
  driftull: [
    { stage: 1, description: 'Driftull, a roly-poly manatee-piglet hybrid with a permanently sleepy smile, steam venting from two tiny ear-holes and its rounded back, hot-spring pink skin, tiny flippers, floating pose, chibi pokemon-style, pixel art, transparent background', ref: 'default' },
    { stage: 2, description: 'Misthorn, a large rotund manatee-unicorn with soft pink skin matching Driftull, a long hollow spiral steam-horn on its brow, thick warm steam pouring from the horn tip, big sleepy eyes, standing upright with gentle dignity, pixel art, transparent background', ref: 'default' },
  ],
  buzzlit: [
    { stage: 1, description: 'Buzzlit, a bumblebee with an exaggerated round body, wings beating so fast they are invisible, emits low frequency hum, tiny antennae, chibi insect creature, pixel art, transparent background', ref: 'default' },
    { stage: 2, description: 'Echorex, a chunky flying beetle with a round striped body, two pairs of broad wings open showing visible vibration blur, a large resonating horn on its head, six legs tucked under, hovering in a confident pose, pixel art, transparent background', ref: 'default' },
    { stage: 3, description: 'Stridion, a massive beetle-dragon with a huge armoured body filling the canvas, four enormous wings spread wide, a prominent resonating horn, thick legs planted wide in battle stance, sonic rings radiating outward from its wings, pixel art, transparent background', ref: 'default' },
  ],
  galecub: [
    { stage: 1, description: 'Galecub, a chubby ferret with a windsock-shaped prehensile tail streaming behind it, enormous round nostrils twitching, tiny paws, big curious eyes, sniffing-the-air pose, chibi pokemon-style, pixel art, transparent background', ref: 'default' },
    { stage: 2, description: 'Tempestris, a larger sleek ferret with aerodynamic swept-back ears and a long streamlined body, fur tips dissolving into wind-wisps, standing on all four paws with body low and nose pointed forward like it is about to sprint, clearly related to Galecub, pixel art, transparent background', ref: 'default' },
  ],
  sporik: [
    { stage: 1, description: 'Sporik, a stumpy mushroom-toad with stone-textured skin and a mushroom cap that releases puffs of mineral spores, wide set low body, dopey friendly expression, chibi pokemon-style, pixel art, transparent background', ref: 'default' },
    { stage: 2, description: 'Mycorath, a large upright toad-salamander with a broad mushroom canopy growing from its back, chunky mossy body, wide friendly face, four sturdy legs in a planted stance, visible spore trails drifting from cap edges, pixel art, transparent background', ref: 'default' },
    { stage: 3, description: 'Terrafung, a colossal toad creature with an enormous mushroom colony growing across its entire back forming a landscape, giant body filling the canvas, wide low battle stance, mossy stone-textured skin, face visible at the front looking imposing, pixel art, transparent background', ref: 'default' },
  ],
  spectrix: [
    { stage: 1, description: 'Spectrix, a small deer fawn made of translucent crystal-glass, internal structure visible but strangely arranged, light bending slightly around it, delicate chibi pose, pixel art, transparent background', ref: 'default' },
    { stage: 2, description: 'Auraveil, a full-grown crystal deer standing tall, fractal antlers branching wide with light glowing at every tip, translucent body refracting light, elegant proud stance facing forward, pixel art, transparent background', ref: 'default' },
  ],
  flintlet: [
    { stage: 1, description: 'Flintlet, a small chubby red salamander with smooth rounded flint-stone scales that occasionally spark, tiny bright eyes, four stubby legs, compact friendly chibi body, pixel art, transparent background', ref: 'default' },
    { stage: 2, description: 'Scorchback, a confident upright lizard with broad shoulders and a wide fin-crest along its back that glows orange like hot metal, red-orange scales, two strong legs and stubby arms, bold stance, pixel art, transparent background', ref: 'default' },
  ],
  glintfin: [
    { stage: 1, description: 'Glintfin, a small manta-pup gliding above the ground, iridescent underbelly catching light and reflecting it upward, round body with wing-like fins, gentle gliding pose, chibi pokemon-style, pixel art, transparent background', ref: 'default' },
    { stage: 2, description: 'Prismaray, a manta ray seen from a three-quarter side angle gliding diagonally, iridescent wing-panels splitting light into rainbow colours, body clearly related to Glintfin, facing to the side not straight at the camera, elegant trailing fins, pixel art, transparent background', ref: 'default' },
    { stage: 3, description: 'Aurorant, an enormous manta ray seen from a three-quarter side angle with vast wings spread filling the canvas, body clearly descended from Glintfin and Prismaray, each wing blazing with aurora light bands, tilted in a battle-ready banking pose, pixel art, transparent background', ref: 'default' },
  ],
  runekit: [
    { stage: 1, description: 'Runekit, a kitten with glowing geometric sigils drifting slowly across its fur like floating script, curious sitting pose, chibi pokemon-style, pixel art, transparent background', ref: 'default' },
    { stage: 2, description: 'Cipherast, a large elegant cat sitting upright with composed authority, glowing rune-sigils carved into its fur in neat rows, eyes like glowing golden lenses, tail curled neatly, ancient and knowing expression, pixel art, transparent background', ref: 'default' },
  ],
  windmite: [
    { stage: 1, description: 'Windmite, a pill bug with a small sail-fin that unfurls to catch wind, rolled into a ball with sail visible, chibi insect creature, pixel art, transparent background', ref: 'default' },
    { stage: 2, description: 'Cyclorid, a large armadillo with three articulated sail-plates fanned open on its back like a windmill, sturdy legs planted wide, body tilted as if leaning into a gale, confident sturdy pose, pixel art, transparent background', ref: 'default' },
    { stage: 3, description: 'Vortecis, a huge disk-shaped creature hovering in battle stance, eight sail-plates extended radially like a compass rose, thick armoured body, a visible wind funnel spinning beneath it, filling the canvas, pixel art, transparent background', ref: 'default' },
  ],
  duskrat: [
    { stage: 1, description: 'Duskrat, a large-eared rat with shadow-shimmer fur that makes it hard to focus on, dark iridescent coat, sneaky crouching pose, chibi pokemon-style, pixel art, transparent background', ref: 'umbra', outline: 'lineless', shading: 'flat shading', detail: 'low detail' },
    { stage: 2, description: 'Penumbrix, a large shadow wolf with tall pointed ears, body of layered deep violet and black shadow with darker patches suggesting fur texture, four distinct detailed legs, two vivid violet crescent-shaped eyes, upright proud stance, a full curling shadowy tail, pixel art, transparent background', ref: 'umbra', outline: 'lineless', shading: 'flat shading', detail: 'low detail' },
  ],
  bassolt: [
    { stage: 1, description: 'Bassolt, a round grumpy mole with a resonating chest cavity, wide set stocky body, small eyes, large digging claws, chibi pokemon-style, pixel art, transparent background', ref: 'default' },
    { stage: 2, description: 'Tremovox, a stocky bipedal badger-mole slightly larger than Bassolt, broad chest with a visible resonating cavity, powerful shoulders, short arms with thick digging claws, gruff determined face, planted upright stance, pixel art, transparent background', ref: 'default' },
    { stage: 3, description: 'Resonarch, a massive upright bear-mole with an enormous hollow barrel chest, mouth thrown open in a thunderous silent roar, thick arms spread wide, huge claws, fills the canvas in battle stance, pixel art, transparent background', ref: 'default' },
  ],
  glassling: [
    { stage: 1, description: 'Glassling, a small ethereal jellyfish floating gently, body of translucent glass with no visible internal structure, drifting tentacles, softly pulsing, chibi creature, pixel art, transparent background', ref: 'default' },
    { stage: 2, description: 'Vitramor, a large friendly jellyfish floating upright, bell-shaped translucent glass body with a soft internal glow, four broad frilled tentacles spread wide, big cute round eyes visible through the glass, pixel art, transparent background', ref: 'default' },
  ],
  tidepup: [
    { stage: 1, description: 'Tidepup, a round pudgy aquatic puppy with smooth wet fur, floppy ears, big dark eyes, a wide blunt snout that is not flat or pug-like, four stubby webbed feet, salt crystals sparkling along its back, compact friendly chibi body, pixel art, transparent background', ref: 'default' },
    { stage: 2, description: 'Saltwort, a stocky dog-seal standing upright with confidence, smooth brine-wet fur, chunky body, salt crystal formations sprouting from its back like a dorsal fin, wide paws, friendly face, pixel art, transparent background', ref: 'default' },
    { stage: 3, description: 'Brinelord, a huge quadruped sea-dog with a shell of accumulated salt-crystal architecture on its back forming towers and arches, enormous heavy body filling the canvas, thick legs planted wide in battle stance, ancient and imposing, pixel art, transparent background', ref: 'default' },
  ],
  fluxling: [
    { stage: 1, description: 'Fluxling, a small bright orange kangaroo-mouse with a warm golden heat-shimmer glow around its body, big shining eyes, large round ears, long tail, sitting upright with a cheerful energetic expression, chibi pokemon-style, pixel art, transparent background', ref: 'default' },
    { stage: 2, description: 'Miragent, a bipedal fox-like creature with a heat-shimmer body that makes edges waver, visible but distorted limbs, bright core eyes seen through the shimmer, upright alert stance, flame-like aura around it, pixel art, transparent background', ref: 'default' },
  ],
  lumenox: [
    { stage: 1, description: 'Lumenox, a salamander glowing dimly from within as if lit by a small candle inside its chest, soft warm inner light, affectionate chibi pose, pixel art, transparent background', ref: 'default' },
    { stage: 2, description: 'Halorath, an upright lizard with a body blazing from within, bright light spilling through seams in its scales, eye-slots glowing warm, standing tall with arms held wide, radiating warmth, pixel art, transparent background', ref: 'default' },
    { stage: 3, description: 'Solance, a towering upright lizard-deity, body a pillar of controlled radiant light with a solid glowing core visible inside, arms raised wide in battle stance, fills the canvas with warm brilliance, pixel art, transparent background', ref: 'default' },
  ],
  scaldit: [
    { stage: 1, description: 'Scaldit, a steam-venting newt living in hot spring shallows, permanently flushed red, heat-hardened scaly skin, vents along its back leaking steam, chibi pokemon-style, pixel art, transparent background', ref: 'default' },
    { stage: 2, description: 'Steamback, a squat tank-like quadruped lizard with thick stubby legs, a wide armoured body, three large steam-vent chimneys along its spine billowing jets of steam, flushed deep red scales, low powerful battle-ready stance, pixel art, transparent background', ref: 'default' },
  ],
  darkspore: [
    { stage: 1, description: 'Darkspore, a shadowy dandelion-sphere creature floating low to the ground, releases shadow-spore puffs when disturbed, soft dark wispy form, chibi creature, pixel art, transparent background', ref: 'umbra', outline: 'lineless', shading: 'flat shading', detail: 'low detail' },
    { stage: 2, description: 'Noctiveil, an upright orchid-creature with a large open shadow-petal collar framing its face, slender dark body, four long thin arms, glowing pale eyes at the centre, graceful eerie stance, pixel art, transparent background', ref: 'umbra', outline: 'lineless', shading: 'flat shading', detail: 'low detail' },
    { stage: 3, description: 'Eclipsus, a tall dark bloom creature filling the canvas, a broad layered shadow-petal canopy overhead, slender humanoid body below, twin pale eyes visible at the centre, radiating darkness, battle stance, pixel art, transparent background', ref: 'umbra', outline: 'lineless', shading: 'flat shading', detail: 'low detail' },
  ],
  chuffin: [
    { stage: 1, description: 'Chuffin, a comically fat round puffin bird, permanently windswept ruffled feathers, huge surprised circular eyes, bright orange beak, tiny stubby wings held out, chibi pokemon-style, pixel art, transparent background', ref: 'default' },
    { stage: 2, description: 'Galestride, a stocky broad-chested penguin-like bird standing upright, wide body not lanky, sleek black-and-white plumage, yellow chest patch, bright orange beak, small wings pressed against its wide sides, confident dignified pose, pixel art, transparent background', refPath: 'public/synamon/chuffin/stage1.png' },
  ],
  tremlet: [
    { stage: 1, description: 'Tremlet, a tiny stocky rock-bull calf with a thick square body, stubby legs, two small stone nubs on its head it has not grown into yet, determined squinting eyes, compact powerful chibi body, pixel art, transparent background', ref: 'default' },
    { stage: 2, description: 'Quakehorn, a powerful bull standing broad and low, enormous geological-scale stone horns curving forward, hooves cracking the ground, head lowered ready to charge, muscular compact body, pixel art, transparent background', ref: 'default' },
  ],
  omenix: [
    { stage: 1, description: 'Omenix, a legendary white dragon with smooth pearlescent white scales, elegant swept-back silver horns, broad white wings spread wide, slender graceful body rearing up tall in battle stance filling the canvas, soft silver glow around its edges, serene and powerful, pixel art, transparent background', ref: 'default' },
  ],
  lunveil: [
    { stage: 1, description: 'Lunveil, a colossal bipedal dragon with a massive thick body filling the canvas top to bottom, pure black scales covering everything including underbelly and wings, wings folded close to body not spread, enormous bulk and presence, a single silver eye glowing in its black angular head, faint silver crescent markings barely visible on its black chest, aggressive forward-leaning battle stance, pixel art, transparent background', ref: 'default' },
  ],
};

// ─── State management ──────────────────────────────────────────────────────

interface GenerationState {
  phase: number;
  species: Record<string, Record<string, { objectId?: string; jobId?: string; status: 'pending' | 'queued' | 'done' | 'failed'; file?: string }>>;
}

function loadState(): GenerationState {
  if (fs.existsSync(STATE_FILE)) {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  }
  return { phase: 2, species: {} };
}

function saveState(state: GenerationState) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// ─── API helpers ───────────────────────────────────────────────────────────

function apiPost(endpoint: string, body: object): any {
  const json = JSON.stringify(body);
  const result = execSync(
    `curl -s -X POST "${API_BASE}${endpoint}" \
      -H "Authorization: Bearer ${API_KEY}" \
      -H "Content-Type: application/json" \
      -d '${json.replace(/'/g, "'\\''")}'`,
    { maxBuffer: 10 * 1024 * 1024 }
  );
  return JSON.parse(result.toString());
}

function apiPostWithImage(endpoint: string, body: object, imagePath: string): any {
  const imageB64 = execSync(`base64 -w 0 "${imagePath}"`).toString().trim();
  const fullBody = { ...body, background_image: { base64: imageB64 } };
  const json = JSON.stringify(fullBody);
  const tmpFile = `/tmp/pixellab-payload-${Date.now()}.json`;
  fs.writeFileSync(tmpFile, json);
  const result = execSync(
    `curl -s -X POST "${API_BASE}${endpoint}" \
      -H "Authorization: Bearer ${API_KEY}" \
      -H "Content-Type: application/json" \
      -d @"${tmpFile}"`,
    { maxBuffer: 10 * 1024 * 1024 }
  );
  fs.unlinkSync(tmpFile);
  return JSON.parse(result.toString());
}

function apiGet(endpoint: string): any {
  const result = execSync(
    `curl -s "${API_BASE}${endpoint}" -H "Authorization: Bearer ${API_KEY}"`,
    { maxBuffer: 10 * 1024 * 1024 }
  );
  return JSON.parse(result.toString());
}

function downloadFile(url: string, dest: string) {
  execSync(`curl --fail -s -o "${dest}" "${url}"`);
}

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

async function pollAndDownload(
  batch: { speciesId: string; stageKey: string; objectId: string }[],
  state: any
) {
  console.log(`\n⏳ Waiting 90s for ${batch.length} sprites to generate...`);
  await sleep(90000);

  let attempts = 0;
  const maxAttempts = 15;
  const remaining = [...batch];

  while (remaining.length > 0 && attempts < maxAttempts) {
    attempts++;
    const stillWaiting: typeof batch = [];

    for (const item of remaining) {
      const { speciesId, stageKey, objectId } = item;
      try {
        const result = apiGet(`/background-jobs/${objectId}`);

        if (result.status === 'processing' || result.status === 'queued') {
          stillWaiting.push(item);
          continue;
        }

        if (result.status === 'completed' && result.last_response) {
          const lr = result.last_response;
          const outFile = path.join(OUT_DIR, speciesId, `${stageKey}.png`);
          if (lr.storage_url) {
            downloadFile(lr.storage_url, outFile);
          } else if (lr.image) {
            fs.writeFileSync(outFile, Buffer.from(lr.image, 'base64'));
          } else {
            throw new Error('No image data in response');
          }
          state.species[speciesId][stageKey] = { jobId: objectId, status: 'done', file: outFile };
          saveState(state);
          console.log(`  ✓ ${speciesId} ${stageKey} → ${outFile}`);
        } else {
          console.log(`  ✗ ${speciesId} ${stageKey} failed:`, result.status, result.last_response?.error ?? '');
          state.species[speciesId][stageKey] = { jobId: objectId, status: 'failed' };
          saveState(state);
        }
      } catch (e) {
        stillWaiting.push(item);
      }
    }

    remaining.splice(0, remaining.length, ...stillWaiting);
    if (remaining.length > 0) {
      console.log(`  ${remaining.length} still processing, waiting 30s...`);
      await sleep(30000);
    }
  }
}

function updateSpeciesJson(state: GenerationState) {
  const species: any[] = JSON.parse(fs.readFileSync(SPECIES_FILE, 'utf8'));
  for (const sp of species) {
    const spState = state.species[sp.id];
    if (!spState) continue;
    for (const stage of sp.stages) {
      const stageKey = `stage${stage.stage}`;
      if (spState[stageKey]?.status === 'done') {
        stage.sprite = `/synamon/${sp.id}/${stageKey}.png`;
      }
    }
  }
  fs.writeFileSync(SPECIES_FILE, JSON.stringify(species, null, 2));
  console.log(`  📄 Updated species.json`);
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const resume = args.includes('--resume');
  const onlySpecies = args.find(a => a.startsWith('--species='))?.split('=')[1];

  const state = loadState();
  console.log(`\n🎨 Synamon Phase 2 — Base Sprite Generation`);
  console.log(`Mode: ${resume ? 'resume' : 'fresh'}`);

  const speciesToProcess = onlySpecies
    ? { [onlySpecies]: PROMPTS[onlySpecies] }
    : PROMPTS;

  // Build the full work list first
  const workList: { speciesId: string; stageKey: string; stageData: any }[] = [];
  for (const [speciesId, stages] of Object.entries(speciesToProcess)) {
    if (!state.species[speciesId]) state.species[speciesId] = {};
    for (const stageData of stages) {
      const stageKey = `stage${stageData.stage}`;
      if (resume && state.species[speciesId][stageKey]?.status === 'done') {
        console.log(`  ✓ ${speciesId} ${stageKey} already done, skipping`);
        continue;
      }
      fs.mkdirSync(path.join(OUT_DIR, speciesId), { recursive: true });
      workList.push({ speciesId, stageKey, stageData });
    }
  }

  if (workList.length === 0) {
    console.log('\n✓ Nothing to generate.');
    return;
  }

  // Process in batches of 10 to stay within concurrent job limit
  const BATCH_SIZE = 5;
  let totalDone = 0;
  let totalFailed = 0;

  for (let i = 0; i < workList.length; i += BATCH_SIZE) {
    const batch = workList.slice(i, i + BATCH_SIZE);
    console.log(`\n📦 Batch ${Math.floor(i/BATCH_SIZE)+1}/${Math.ceil(workList.length/BATCH_SIZE)} — submitting ${batch.length} sprites...`);

    const queued: { speciesId: string; stageKey: string; objectId: string }[] = [];

    for (const { speciesId, stageKey, stageData } of batch) {
      const refKey = stageData.ref ?? 'default';
      const refImage = stageData.refPath
        ? path.resolve(stageData.refPath)
        : STYLE_REFS[refKey];
      const body = {
        description: stageData.description,
        image_size: { width: 64, height: 64 },
        view: 'side',
        outline: stageData.outline ?? 'single color outline',
        shading: stageData.shading ?? 'medium shading',
        detail: stageData.detail ?? 'medium detail',
      };

      console.log(`  ⏳ Queuing ${speciesId} ${stageKey}...`);
      const response = apiPostWithImage('/map-objects', body, refImage);

      if (!response.background_job_id) {
        console.error(`  ✗ Failed to queue ${speciesId} ${stageKey}:`, response);
        state.species[speciesId][stageKey] = { status: 'failed' };
        saveState(state);
        totalFailed++;
        continue;
      }

      state.species[speciesId][stageKey] = { jobId: response.background_job_id, status: 'queued' };
      queued.push({ speciesId, stageKey, objectId: response.background_job_id });
      saveState(state);
      await sleep(300);
    }

    if (queued.length > 0) {
      await pollAndDownload(queued, state);
      totalDone += queued.filter(q => state.species[q.speciesId][q.stageKey]?.status === 'done').length;
      totalFailed += queued.filter(q => state.species[q.speciesId][q.stageKey]?.status === 'failed').length;
      updateSpeciesJson(state);
    }
  }

  // Report
  console.log(`\n✅ Done: ${totalDone} sprites generated`);
  if (totalFailed > 0) console.log(`⚠️  Failed: ${totalFailed} (run with --resume to retry)`);
}

main().catch(console.error);
