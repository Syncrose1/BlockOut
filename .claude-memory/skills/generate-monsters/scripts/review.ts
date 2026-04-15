/**
 * Review Page Generator
 * Generates a visual HTML review page for a given phase's output.
 * Open in browser to review sprites before proceeding to next phase.
 *
 * Usage:
 *   npx tsx ~/.claude/skills/generate-monsters/scripts/review.ts \
 *     --phase 2 \
 *     --output ./public/monsters \
 *     --monsters ./monsters.json \
 *     --state ./generation-state.json
 */

import fs from 'fs/promises';
import path from 'path';
import { readJson } from './pixellab-rest.js';

type Monster = {
  id: string;
  name: string;
  type: string;
  stages: Array<{ stage: number; name: string }>;
};

type GenerationState = {
  species: Record<string, Record<string, { status: string; spritePath?: string }>>;
};

const TYPE_COLORS: Record<string, string> = {
  fire: '#ff6b35', water: '#4a90d9', grass: '#5cb85c',
  electric: '#f0ad4e', dark: '#6f42c1', light: '#ffd700',
  earth: '#8b5e3c', wind: '#5bc0de', poison: '#9b59b6', psychic: '#e91e63',
};

async function getPhaseSprites(outputDir: string, monsters: Monster[], phase: number) {
  const entries: Array<{
    monsterId: string; monsterName: string; type: string;
    stage: number; stageName: string; spritePath: string; exists: boolean;
  }> = [];

  for (const monster of monsters) {
    const stagesToShow = phase === 2 ? [1] : phase === 3 ? monster.stages.map(s => s.stage) : monster.stages.map(s => s.stage);

    for (const stageNum of stagesToShow) {
      const stageMeta = monster.stages.find(s => s.stage === stageNum);
      if (!stageMeta) continue;

      const spritePath = path.join(outputDir, monster.id, `stage-${stageNum}`, 'sprite.png');
      let exists = false;
      try { await fs.access(spritePath); exists = true; } catch {}

      entries.push({
        monsterId: monster.id,
        monsterName: monster.name,
        type: monster.type,
        stage: stageNum,
        stageName: stageMeta.name,
        spritePath: path.relative(outputDir, spritePath),
        exists,
      });
    }
  }

  return entries;
}

async function generateAnimationEntries(outputDir: string, monsters: Monster[]) {
  const entries: Array<{
    monsterId: string; monsterName: string; stage: number;
    action: string; frameCount: number; framePaths: string[];
  }> = [];

  for (const monster of monsters) {
    for (const stageMeta of monster.stages) {
      for (const action of ['idle', 'attack']) {
        const animDir = path.join(outputDir, monster.id, `stage-${stageMeta.stage}`, 'anims', action);
        try {
          const files = (await fs.readdir(animDir))
            .filter(f => f.endsWith('.png'))
            .sort()
            .map(f => path.relative(outputDir, path.join(animDir, f)));
          if (files.length > 0) {
            entries.push({ monsterId: monster.id, monsterName: monster.name, stage: stageMeta.stage, action, frameCount: files.length, framePaths: files });
          }
        } catch {}
      }
    }
  }
  return entries;
}

async function main() {
  const args = process.argv.slice(2);
  const get = (flag: string) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : null; };

  const phase = parseInt(get('--phase') ?? '2');
  const outputDir = path.resolve(get('--output') ?? './public/monsters');
  const monstersPath = get('--monsters') ?? './monsters.json';
  const statePath = get('--state') ?? './generation-state.json';

  const monsters = await readJson<Monster[]>(monstersPath);
  let state: GenerationState = { species: {} };
  try { state = await readJson<GenerationState>(statePath); } catch {}

  const sprites = await getPhaseSprites(outputDir, monsters, phase);
  const animations = phase === 4 ? await generateAnimationEntries(outputDir, monsters) : [];

  const phaseLabels: Record<number, string> = {
    1: 'Style Reference', 2: 'Base Sprites', 3: 'Evolutions', 4: 'Animations', 5: 'Manifest',
  };

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Monster Review — Phase ${phase}: ${phaseLabels[phase] ?? ''}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #1a1a2e; color: #e0e0e0; font-family: 'Courier New', monospace; padding: 24px; }
  h1 { font-size: 22px; margin-bottom: 6px; color: #7fbfff; }
  .subtitle { font-size: 13px; color: #888; margin-bottom: 28px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 16px; }
  .card { background: #16213e; border: 1px solid #2a2a4a; border-radius: 10px; padding: 16px; text-align: center; transition: border-color 0.2s; }
  .card:hover { border-color: #7fbfff; }
  .card.approved { border-color: #4caf50; }
  .card.rejected { border-color: #f44336; opacity: 0.5; }
  .sprite-wrap { width: 96px; height: 96px; margin: 0 auto 12px; display: flex; align-items: center; justify-content: center; background: #0d0d1a; border-radius: 8px; image-rendering: pixelated; }
  .sprite-wrap img { width: 80px; height: 80px; object-fit: contain; image-rendering: pixelated; }
  .sprite-wrap .missing { font-size: 28px; color: #444; }
  .monster-name { font-size: 13px; font-weight: bold; color: #e0e0e0; margin-bottom: 2px; }
  .stage-name { font-size: 11px; color: #888; margin-bottom: 6px; }
  .type-badge { display: inline-block; font-size: 10px; font-weight: 700; text-transform: uppercase; padding: 2px 7px; border-radius: 10px; letter-spacing: 0.5px; margin-bottom: 10px; }
  .status { font-size: 10px; padding: 4px 8px; border-radius: 4px; cursor: pointer; border: none; width: 100%; }
  .status.pending { background: #333; color: #aaa; }
  .status.generated { background: #1a3a5c; color: #7fbfff; }
  .status.approved { background: #1a4a1a; color: #4caf50; }
  .status.rejected { background: #4a1a1a; color: #f44336; }
  .anim-card { background: #16213e; border: 1px solid #2a2a4a; border-radius: 10px; padding: 16px; margin-bottom: 12px; }
  .anim-title { font-size: 13px; font-weight: bold; margin-bottom: 10px; color: #7fbfff; }
  .frames { display: flex; gap: 4px; flex-wrap: wrap; }
  .frame img { width: 64px; height: 64px; object-fit: contain; image-rendering: pixelated; background: #0d0d1a; border-radius: 4px; }
  .section-title { font-size: 16px; font-weight: bold; color: #aaa; margin: 28px 0 14px; text-transform: uppercase; letter-spacing: 1px; }
  .summary { background: #16213e; border-radius: 8px; padding: 16px; margin-bottom: 24px; font-size: 13px; line-height: 1.8; }
  .summary span { color: #7fbfff; font-weight: bold; }
  .instructions { background: #0d1a2e; border: 1px solid #2a3a5a; border-radius: 8px; padding: 14px; margin-bottom: 24px; font-size: 12px; line-height: 1.8; color: #aaa; }
  .instructions strong { color: #7fbfff; }
</style>
</head>
<body>
<h1>Monster Review — Phase ${phase}: ${phaseLabels[phase] ?? ''}</h1>
<p class="subtitle">Generated: ${new Date().toLocaleString()}</p>

<div class="instructions">
  <strong>How to review:</strong> Look through each sprite below. Check that the art style is consistent, the proportions are correct, and evolutions look like the same species.<br>
  When you're done, tell Claude which cards to approve, reject, or regenerate.<br>
  Rejected sprites will be queued for regeneration in the next run.
</div>

<div class="summary">
  Total sprites: <span>${sprites.length}</span> &nbsp;|&nbsp;
  Present: <span>${sprites.filter(s => s.exists).length}</span> &nbsp;|&nbsp;
  Missing: <span>${sprites.filter(s => !s.exists).length}</span>
  ${Object.entries(
    sprites.reduce((acc, s) => { acc[s.type] = (acc[s.type] || 0) + 1; return acc; }, {} as Record<string, number>)
  ).map(([t, n]) => `&nbsp;|&nbsp; <span style="color:${TYPE_COLORS[t] || '#aaa'}">${t}</span>: ${n}`).join('')}
</div>

<div class="section-title">Sprites</div>
<div class="grid">
${sprites.map(s => {
  const stateKey = `stage${s.stage}`;
  const itemState = state.species[s.monsterId]?.[stateKey];
  const status = itemState?.status ?? 'pending';
  const typeColor = TYPE_COLORS[s.type] || '#aaa';
  return `  <div class="card ${status === 'approved' ? 'approved' : status === 'rejected' ? 'rejected' : ''}" id="${s.monsterId}-stage${s.stage}">
    <div class="sprite-wrap">
      ${s.exists
        ? `<img src="${s.spritePath}" alt="${s.stageName}" />`
        : `<span class="missing">?</span>`}
    </div>
    <div class="monster-name">${s.monsterName}</div>
    <div class="stage-name">${s.stageName} (Stage ${s.stage})</div>
    <span class="type-badge" style="background:${typeColor}22;color:${typeColor}">${s.type}</span>
    <div class="status ${status}">${status.toUpperCase()}</div>
  </div>`;
}).join('\n')}
</div>

${animations.length > 0 ? `
<div class="section-title">Animations</div>
${animations.map(a => `
<div class="anim-card">
  <div class="anim-title">${a.monsterName} — Stage ${a.stage} — ${a.action} (${a.frameCount} frames)</div>
  <div class="frames">
    ${a.framePaths.map(fp => `<div class="frame"><img src="${fp}" /></div>`).join('')}
  </div>
</div>`).join('\n')}` : ''}

</body>
</html>`;

  const outPath = path.join(outputDir, `review-phase${phase}.html`);
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(outPath, html);
  console.log(`\n✓ Review page generated: ${outPath}`);
  console.log(`  Open in browser: file://${outPath}`);
}

main().catch(err => { console.error(err.message || err); process.exit(1); });
