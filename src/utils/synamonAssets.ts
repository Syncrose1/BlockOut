/**
 * Static asset loaders for Synamon world, species, and particle data.
 * Fetches once on first call, then returns cached data.
 */

export interface WorldZone {
  key: string;
  label: string;
  plate: string;
  groundY: number;
  creatureScale?: number;
  hero?: {
    frames: string[];
    anchor: { x: number; y: number };
    displayScale?: number;
  };
}

export interface WorldData {
  heroCanvas: number;
  zones: WorldZone[];
}

export interface ParticleDef {
  key: string;
  sprite: string;
  zones: string[];
  spawnRate: number;
  lifetime: [number, number];
  drift: { vx: [number, number]; vy: [number, number] };
  alpha: number;
}

export interface ParticlesData {
  particles: ParticleDef[];
}

// ─── Cache ──────────────────────────────────────────────────────────────────

let worldCache: WorldData | null = null;
let speciesCache: any[] | null = null;
let particlesCache: ParticlesData | null = null;

export async function loadWorldData(): Promise<WorldData> {
  if (worldCache) return worldCache;
  const res = await fetch('/synamon/world.json');
  worldCache = await res.json();
  return worldCache!;
}

export async function loadSpeciesData(): Promise<any[]> {
  if (speciesCache) return speciesCache;
  const res = await fetch('/synamon/species.json');
  speciesCache = await res.json();
  return speciesCache!;
}

export async function loadParticlesData(): Promise<ParticlesData> {
  if (particlesCache) return particlesCache;
  const res = await fetch('/synamon/_world/particles.json');
  particlesCache = await res.json();
  return particlesCache!;
}

// Preload all three in parallel
export async function preloadSynamonAssets(): Promise<{
  world: WorldData;
  species: any[];
  particles: ParticlesData;
}> {
  const [world, species, particles] = await Promise.all([
    loadWorldData(),
    loadSpeciesData(),
    loadParticlesData(),
  ]);
  return { world, species, particles };
}
