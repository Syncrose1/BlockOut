/**
 * Phase 5: Manifest Builder
 * Walks the output directory, reads generation-state.json and monsters.json,
 * and produces public/monsters/manifest.json with all asset paths and metadata.
 *
 * Usage:
 *   npx tsx ~/.claude/skills/generate-monsters/scripts/manifest.ts \
 *     --monsters ./monsters.json \
 *     --state ./generation-state.json \
 *     --output ./public/monsters
 */

import fs from 'fs/promises';
import path from 'path';
import { readJson, writeJson } from './pixellab-rest.js';

type Monster = {
  id: string;
  name: string;
  type: string;
  stages: Array<{ stage: number; name: string; evolveAt?: number }>;
  baseStats?: Record<string, number>;
  animations?: string[];
};

type ManifestEntry = {
  id: string;
  name: string;
  type: string;
  baseStats: Record<string, number>;
  stages: Array<{
    stage: number;
    name: string;
    evolveAt?: number;
    sprite: string | null;
    animations: Record<string, string[]>;
  }>;
};

async function fileExists(p: string): Promise<boolean> {
  try { await fs.access(p); return true; } catch { return false; }
}

async function getAnimationFrames(animDir: string): Promise<string[]> {
  try {
    const files = await fs.readdir(animDir);
    return files
      .filter(f => f.endsWith('.png'))
      .sort()
      .map(f => path.join(animDir, f));
  } catch { return []; }
}

async function main() {
  const args = process.argv.slice(2);
  const get = (flag: string) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : null; };

  const monstersPath = get('--monsters') ?? './monsters.json';
  const statePath = get('--state') ?? './generation-state.json';
  const outputDir = path.resolve(get('--output') ?? './public/monsters');

  const monsters = await readJson<Monster[]>(monstersPath);

  const manifest: {
    generatedAt: string;
    totalSpecies: number;
    totalSprites: number;
    totalAnimationFrames: number;
    missing: string[];
    species: Record<string, ManifestEntry>;
  } = {
    generatedAt: new Date().toISOString(),
    totalSpecies: monsters.length,
    totalSprites: 0,
    totalAnimationFrames: 0,
    missing: [],
    species: {},
  };

  for (const monster of monsters) {
    const entry: ManifestEntry = {
      id: monster.id,
      name: monster.name,
      type: monster.type,
      baseStats: monster.baseStats ?? { hp: 45, atk: 50, def: 45, spd: 50 },
      stages: [],
    };

    for (const stageMeta of monster.stages) {
      const stageDir = path.join(outputDir, monster.id, `stage-${stageMeta.stage}`);
      const spritePath = path.join(stageDir, 'sprite.png');
      const spriteExists = await fileExists(spritePath);

      const relSprite = spriteExists
        ? path.relative(outputDir, spritePath)
        : null;

      if (!spriteExists) {
        manifest.missing.push(`${monster.id}/stage-${stageMeta.stage}/sprite.png`);
      } else {
        manifest.totalSprites++;
      }

      const animations: Record<string, string[]> = {};
      for (const action of monster.animations ?? ['idle', 'attack']) {
        const animDir = path.join(stageDir, 'anims', action);
        const frames = await getAnimationFrames(animDir);
        if (frames.length > 0) {
          animations[action] = frames.map(f => path.relative(outputDir, f));
          manifest.totalAnimationFrames += frames.length;
        } else {
          manifest.missing.push(`${monster.id}/stage-${stageMeta.stage}/anims/${action}/ (empty)`);
        }
      }

      entry.stages.push({
        stage: stageMeta.stage,
        name: stageMeta.name,
        evolveAt: stageMeta.evolveAt,
        sprite: relSprite,
        animations,
      });
    }

    manifest.species[monster.id] = entry;
  }

  const manifestPath = path.join(outputDir, 'manifest.json');
  await writeJson(manifestPath, manifest);

  console.log('\n✓ Manifest generated:', manifestPath);
  console.log(`  Species: ${manifest.totalSpecies}`);
  console.log(`  Sprites: ${manifest.totalSprites}`);
  console.log(`  Animation frames: ${manifest.totalAnimationFrames}`);

  if (manifest.missing.length > 0) {
    console.log(`\n⚠ Missing assets (${manifest.missing.length}):`);
    manifest.missing.forEach(m => console.log(`    - ${m}`));
  } else {
    console.log('\n✓ All assets present — roster is complete!');
  }

  console.log('\nNext steps:');
  console.log('  1. Import manifest.json in your app: import manifest from "public/monsters/manifest.json"');
  console.log('  2. Use manifest.species[id].stages[n].sprite for sprite paths');
  console.log('  3. Use manifest.species[id].stages[n].animations.idle for animation frames');
}

main().catch(err => { console.error(err.message || err); process.exit(1); });
