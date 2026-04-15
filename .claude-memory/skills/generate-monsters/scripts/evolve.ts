/**
 * Phase 3: Evolution Generation
 * Uses Pixel Lab REST API edit-images-v2 to generate evolution sprites
 * from approved base sprites.
 *
 * Usage:
 *   npx tsx ~/.claude/skills/generate-monsters/scripts/evolve.ts \
 *     --species emberfox \
 *     --from-stage 1 \
 *     --to-stage 2 \
 *     --monsters ./monsters.json \
 *     --state ./generation-state.json \
 *     --output ./public/monsters
 *
 * Or evolve all pending species at once:
 *   npx tsx ~/.claude/skills/generate-monsters/scripts/evolve.ts \
 *     --all \
 *     --monsters ./monsters.json \
 *     --state ./generation-state.json \
 *     --output ./public/monsters
 */

import fs from 'fs/promises';
import path from 'path';
import {
  loadApiKey, apiPost, pollJob, imageFileToBase64,
  saveBase64Image, readJson, writeJson, loadState, saveState,
  sleep, type GenerationState
} from './pixellab-rest.js';

type MonsterStage = {
  stage: number;
  name: string;
  description?: string;
  editPrompt?: string;
  evolveAt?: number;
};

type Monster = {
  id: string;
  name: string;
  type: string;
  templateId?: string;
  stages: MonsterStage[];
  baseStats?: Record<string, number>;
  animations?: string[];
};

async function evolveSprite(
  baseSpritePath: string,
  editPrompt: string,
  imageSize: { width: number; height: number },
  apiKey: string,
): Promise<string> {
  console.log(`  Calling edit-images-v2...`);

  const baseImage = await imageFileToBase64(baseSpritePath);

  // edit-images-v2 is an async (Pro) endpoint
  const jobResponse = await apiPost('/edit-images-v2', {
    method: 'edit_with_text',
    edit_images: [{ image: baseImage, size: imageSize }],
    image_size: imageSize,
    description: editPrompt,
    no_background: true,
  }, apiKey);

  const jobId = jobResponse.background_job_id;
  if (!jobId) throw new Error(`No job ID returned: ${JSON.stringify(jobResponse)}`);

  console.log(`  Job started: ${jobId} — polling...`);
  const result = await pollJob(jobId, apiKey);
  console.log(' done');

  // Result should contain images array
  const images = result.data?.images || result.images;
  if (!images || images.length === 0) {
    throw new Error(`No images in result: ${JSON.stringify(result)}`);
  }

  return images[0].base64 as string;
}

async function main() {
  const args = process.argv.slice(2);
  const get = (flag: string) => {
    const i = args.indexOf(flag);
    return i !== -1 ? args[i + 1] : null;
  };
  const has = (flag: string) => args.includes(flag);

  const monstersPath = get('--monsters') ?? './monsters.json';
  const statePath = get('--state') ?? './generation-state.json';
  const outputDir = get('--output') ?? './public/monsters';
  const targetSpecies = get('--species');
  const fromStage = parseInt(get('--from-stage') ?? '1');
  const toStage = parseInt(get('--to-stage') ?? '2');
  const evolveAll = has('--all');

  const apiKey = loadApiKey();
  const monsters = await readJson<Monster[]>(monstersPath);
  const state = await loadState(statePath);

  // Load image size from style config if available
  let imageSize = { width: 64, height: 64 };
  try {
    const styleConfig = await readJson<any>('./style-config.json');
    if (styleConfig.image_size) imageSize = styleConfig.image_size;
  } catch {}

  const toProcess: Array<{ monster: Monster; fromStage: number; toStage: number }> = [];

  if (evolveAll) {
    for (const monster of monsters) {
      for (let s = 1; s < monster.stages.length; s++) {
        const fromS = monster.stages[s - 1].stage;
        const toS = monster.stages[s].stage;
        const fromKey = `stage${fromS}`;
        const toKey = `stage${toS}`;
        const fromState = state.species[monster.id]?.[fromKey];
        const toState = state.species[monster.id]?.[toKey];
        if (fromState?.status === 'approved' && (!toState || toState.status === 'pending')) {
          toProcess.push({ monster, fromStage: fromS, toStage: toS });
        }
      }
    }
  } else if (targetSpecies) {
    const monster = monsters.find(m => m.id === targetSpecies);
    if (!monster) throw new Error(`Species '${targetSpecies}' not found in monsters.json`);
    toProcess.push({ monster, fromStage, toStage });
  } else {
    console.error('Provide --species <id> or --all');
    process.exit(1);
  }

  if (toProcess.length === 0) {
    console.log('Nothing to evolve. Check that base sprites are marked as "approved" in generation-state.json');
    process.exit(0);
  }

  console.log(`\nEvolving ${toProcess.length} sprite(s)...\n`);

  for (const { monster, fromStage, toStage } of toProcess) {
    const fromKey = `stage${fromStage}`;
    const toKey = `stage${toStage}`;
    const stage = monster.stages.find(s => s.stage === toStage);
    if (!stage?.editPrompt) {
      console.warn(`  [${monster.id}] Stage ${toStage} has no editPrompt — skipping`);
      continue;
    }

    const baseSpritePath = path.join(outputDir, monster.id, `stage-${fromStage}`, 'sprite.png');
    try {
      await fs.access(baseSpritePath);
    } catch {
      console.warn(`  [${monster.id}] Base sprite not found at ${baseSpritePath} — skipping`);
      continue;
    }

    console.log(`[${monster.id}] ${stage.editPrompt.substring(0, 60)}...`);

    try {
      const base64 = await evolveSprite(baseSpritePath, stage.editPrompt, imageSize, apiKey);

      const outPath = path.join(outputDir, monster.id, `stage-${toStage}`, 'sprite.png');
      await saveBase64Image(base64, outPath);
      console.log(`  Saved → ${outPath}`);

      // Update state
      if (!state.species[monster.id]) state.species[monster.id] = {};
      state.species[monster.id][toKey] = {
        spritePath: outPath,
        status: 'generated',
        generationsUsed: 5, // approximate
      };
      state.totalGenerationsUsed += 5;
      await saveState(statePath, state);

    } catch (err) {
      console.error(`  [${monster.id}] Stage ${toStage} failed: ${err}`);
      if (!state.species[monster.id]) state.species[monster.id] = {};
      state.species[monster.id][toKey] = { status: 'pending' };
      await saveState(statePath, state);
    }

    // Brief pause between calls to be friendly to rate limits
    await sleep(2000);
  }

  console.log('\n✓ Evolution generation complete.');
  console.log(`Total generations used (approx): ${state.totalGenerationsUsed}`);
  console.log('\nNext: Run the review script to inspect results, then run animate.ts for animations.');
  console.log('  npx tsx ~/.claude/skills/generate-monsters/scripts/review.ts --phase 3 --output', outputDir);
}

main().catch(err => {
  console.error('\nFatal error:', err.message || err);
  process.exit(1);
});
