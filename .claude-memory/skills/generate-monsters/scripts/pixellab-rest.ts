/**
 * Pixel Lab REST API client
 * Used for endpoints not covered by the MCP server (primarily evolutions via edit-images-v2)
 */

import fs from 'fs/promises';
import path from 'path';

const API_BASE = 'https://api.pixellab.ai/v2';
const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export function loadApiKey(): string {
  // Try env var first
  if (process.env.PIXELLAB_API_KEY) return process.env.PIXELLAB_API_KEY;

  // Try .env file in cwd or parent directories
  const envPaths = ['.env', '../.env', '../../.env'];
  for (const envPath of envPaths) {
    try {
      const content = require('fs').readFileSync(path.resolve(envPath), 'utf-8');
      const match = content.match(/PIXELLAB_API_KEY=([^\n]+)/);
      if (match) return match[1].trim();
    } catch {}
  }

  throw new Error(
    'PIXELLAB_API_KEY not found.\n' +
    'Add it to your .env file: PIXELLAB_API_KEY=your_token_here\n' +
    'Or set it as an environment variable: export PIXELLAB_API_KEY=your_token'
  );
}

function headers(apiKey: string) {
  return {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
}

export async function apiPost(endpoint: string, body: object, apiKey: string): Promise<any> {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: 'POST',
    headers: headers(apiKey),
    body: JSON.stringify(body),
  });

  if (res.status === 402) throw new Error('Insufficient Pixel Lab credits (402). Top up at pixellab.ai/account');
  if (res.status === 429) throw new Error('Rate limit hit (429). Wait a moment and try again.');
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error ${res.status}: ${text}`);
  }

  return res.json();
}

export async function apiGet(endpoint: string, apiKey: string): Promise<any> {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    headers: { 'Authorization': `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

/** Poll a background job until complete or timeout */
export async function pollJob(jobId: string, apiKey: string): Promise<any> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    const result = await apiGet(`/background-jobs/${jobId}`, apiKey);
    if (result.status === 'completed') return result;
    if (result.status === 'failed') throw new Error(`Job ${jobId} failed: ${result.error}`);
    process.stdout.write('.');
  }
  throw new Error(`Job ${jobId} timed out after 5 minutes`);
}

export function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

/** Load a PNG file and return as base64 */
export async function imageFileToBase64(filePath: string): Promise<{ type: 'base64'; base64: string; format: string }> {
  const buf = await fs.readFile(filePath);
  return {
    type: 'base64',
    base64: buf.toString('base64'),
    format: path.extname(filePath).slice(1).toLowerCase() || 'png',
  };
}

/** Save a base64 image to disk */
export async function saveBase64Image(base64: string, outPath: string): Promise<void> {
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  const buf = Buffer.from(base64, 'base64');
  await fs.writeFile(outPath, buf);
}

/** Read and parse a JSON file */
export async function readJson<T>(filePath: string): Promise<T> {
  const text = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(text) as T;
}

/** Write JSON file with pretty formatting */
export async function writeJson(filePath: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2));
}

export type GenerationState = {
  phase: number;
  styleConfig?: object;
  species: Record<string, {
    [stageKey: string]: {
      characterId?: string;
      spritePath?: string;
      status: 'pending' | 'generated' | 'approved' | 'rejected';
      generationsUsed?: number;
    };
  }>;
  totalGenerationsUsed: number;
};

export async function loadState(statePath: string): Promise<GenerationState> {
  try {
    return await readJson<GenerationState>(statePath);
  } catch {
    return { phase: 0, species: {}, totalGenerationsUsed: 0 };
  }
}

export async function saveState(statePath: string, state: GenerationState): Promise<void> {
  await writeJson(statePath, state);
}
