/**
 * Generate Co-Focus campfire scene plate via PixelLab /create-image-pixflux.
 * Outputs: public/cofocus/scenes/campfire-plate.png (256x128)
 *
 * Usage: npx tsx scripts/generate-cofocus-plate.ts
 */

import * as fs from 'fs';
import * as path from 'path';

const API_KEY = 'f82b0da8-5d5f-45b3-a9c3-3bb53d725cea';
const API_BASE = 'https://api.pixellab.ai/v2';
const OUT_DIR = path.resolve('public/cofocus/scenes');

async function apiFetch(endpoint: string, body: Record<string, any>) {
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
    throw new Error(`API ${endpoint} failed (${res.status}): ${text.slice(0, 300)}`);
  }
  return res.json();
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outPath = path.join(OUT_DIR, 'campfire-plate.png');

  if (fs.existsSync(outPath)) {
    console.log('campfire-plate.png already exists — delete to regenerate');
    return;
  }

  console.log('Generating campfire plate (256x128)...');

  const body = {
    description: [
      'nighttime forest clearing with warm campfire glow in the center,',
      'dark blue starry sky above, silhouetted pine trees framing left and right edges,',
      'flat earthy ground filling bottom third, warm orange firelight illuminating nearby ground,',
      'cozy woodland atmosphere, side-view pixel art scene, no characters',
    ].join(' '),
    image_size: { width: 256, height: 128 },
    no_background: false,
    outline: 'lineless',
    shading: 'medium shading',
    detail: 'low detail',
  };

  const res = await apiFetch('/create-image-pixflux', body);
  const img = res.image;
  if (!img) throw new Error(`No image in response: ${JSON.stringify(res).slice(0, 200)}`);

  if (img.base64) {
    fs.writeFileSync(outPath, Buffer.from(img.base64, 'base64'));
  } else if (img.url) {
    const r = await fetch(img.url);
    if (!r.ok) throw new Error(`Download failed: ${img.url}`);
    fs.writeFileSync(outPath, Buffer.from(await r.arrayBuffer()));
  } else {
    throw new Error(`Unknown image format: ${JSON.stringify(img).slice(0, 200)}`);
  }

  console.log(`Saved: ${outPath}`);
}

main().catch(e => { console.error(e); process.exit(1); });
