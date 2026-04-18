import { useEffect, useRef, useState, useCallback } from 'react';
import {
  loadWorldData, loadParticlesData,
  type WorldData, type WorldZone, type ParticlesData, type ParticleDef,
} from '../utils/synamonAssets';

// ─── Constants ──────────────────────────────────────────────────────────────
const SCENE_W = 256;
const SCENE_H = 128;
const HERO_FPS = 6;
const CREATURE_FPS = 8;
const PARTICLE_DT_CAP = 0.05;

// ─── Types ──────────────────────────────────────────────────────────────────
interface SynamonSceneProps {
  zoneKey: string;
  speciesId: string;
  stage: number;
  animation?: string;       // e.g. "idle", "happy" — defaults to "idle"
  timeOfDay?: 'day' | 'dusk' | 'night';
  width: number;
  height: number;
  showParticles?: boolean;
  showHero?: boolean;
  creatureFramePaths?: string[];  // override: supply frame paths directly
  style?: React.CSSProperties;
}

// Image cache across instances
const imageCache = new Map<string, HTMLImageElement>();
function loadImage(src: string): Promise<HTMLImageElement> {
  const cached = imageCache.get(src);
  if (cached && cached.complete && cached.naturalWidth > 0) return Promise.resolve(cached);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => { imageCache.set(src, img); resolve(img); };
    img.onerror = () => resolve(img);
    img.src = src;
  });
}

interface LiveParticle {
  key: string;
  x: number; y: number;
  vx: number; vy: number;
  life: number; age: number;
  alpha: number;
}

export function SynamonScene({
  zoneKey,
  speciesId,
  stage,
  animation = 'idle',
  timeOfDay = 'day',
  width,
  height,
  showParticles = true,
  showHero = true,
  creatureFramePaths,
  style,
}: SynamonSceneProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  // Persistent state across renders (not React state — no re-renders needed)
  const stateRef = useRef({
    world: null as WorldData | null,
    particles: null as ParticlesData | null,
    zone: null as WorldZone | null,
    plateImg: null as HTMLImageElement | null,
    heroFrames: [] as HTMLImageElement[],
    creatureFrames: [] as HTMLImageElement[],
    particleSprites: {} as Record<string, HTMLImageElement>,
    livingParticles: [] as LiveParticle[],
    spawnAcc: {} as Record<string, number>,
    heroIdx: 0, heroAcc: 0,
    cretIdx: 0, cretAcc: 0,
    lastT: 0,
    loaded: false,
  });

  // Load world + particles data once
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [world, particles] = await Promise.all([loadWorldData(), loadParticlesData()]);
      if (cancelled) return;
      const s = stateRef.current;
      s.world = world;
      s.particles = particles;
      // Preload particle sprites
      for (const p of particles.particles) {
        loadImage(p.sprite).then(img => { s.particleSprites[p.key] = img; });
      }
      setLoaded(true);
      s.loaded = true;
    })();
    return () => { cancelled = true; };
  }, []);

  // When zone/species/stage/animation changes, load zone assets + creature frames
  useEffect(() => {
    if (!loaded) return;
    const s = stateRef.current;
    const zone = s.world?.zones.find(z => z.key === zoneKey) ?? null;
    s.zone = zone;
    s.livingParticles = [];
    s.spawnAcc = {};
    s.heroIdx = 0; s.heroAcc = 0;
    s.cretIdx = 0; s.cretAcc = 0;

    let cancelled = false;

    (async () => {
      // Load plate
      if (zone?.plate) {
        s.plateImg = await loadImage(zone.plate);
      } else {
        s.plateImg = null;
      }

      // Load hero
      s.heroFrames = [];
      if (showHero && zone?.hero?.frames?.length) {
        const frames = await Promise.all(zone.hero.frames.map(loadImage));
        if (!cancelled) s.heroFrames = frames;
      }

      // Load creature frames — use override paths if provided
      s.creatureFrames = [];
      if (creatureFramePaths?.length) {
        const frames = await Promise.all(creatureFramePaths.map(loadImage));
        if (!cancelled) s.creatureFrames = frames;
      }
    })();

    return () => { cancelled = true; };
  }, [loaded, zoneKey, showHero, creatureFramePaths]);

  // Render loop
  const tick = useCallback((now: number) => {
    const s = stateRef.current;
    if (!s.loaded) { animRef.current = requestAnimationFrame(tick); return; }

    const canvas = canvasRef.current;
    if (!canvas) { animRef.current = requestAnimationFrame(tick); return; }
    const ctx = canvas.getContext('2d');
    if (!ctx) { animRef.current = requestAnimationFrame(tick); return; }

    let dt = s.lastT ? (now - s.lastT) / 1000 : 0;
    s.lastT = now;
    if (dt > 0.25) dt = 0.25;

    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, SCENE_W, SCENE_H);

    // 1) Plate background
    if (s.plateImg && s.plateImg.naturalWidth) {
      ctx.save();
      // Day/night filter via globalAlpha + compositing
      // We apply filters in CSS on the canvas itself instead
      ctx.drawImage(s.plateImg, 0, 0, SCENE_W, SCENE_H);
      ctx.restore();
    }

    // 2) Hero animation
    if (s.heroFrames.length > 0 && s.zone?.hero) {
      s.heroAcc += dt;
      const interval = 1 / HERO_FPS;
      while (s.heroAcc >= interval) {
        s.heroAcc -= interval;
        s.heroIdx = (s.heroIdx + 1) % s.heroFrames.length;
      }
      const heroImg = s.heroFrames[s.heroIdx];
      if (heroImg?.naturalWidth) {
        const heroCanvas = s.world?.heroCanvas ?? 96;
        ctx.drawImage(
          heroImg,
          s.zone.hero.anchor.x, s.zone.hero.anchor.y,
          heroCanvas, heroCanvas,
        );
      }
    }

    // 3) Creature animation
    if (s.creatureFrames.length > 0) {
      s.cretAcc += dt;
      const interval = 1 / CREATURE_FPS;
      while (s.cretAcc >= interval) {
        s.cretAcc -= interval;
        s.cretIdx = (s.cretIdx + 1) % s.creatureFrames.length;
      }
      const img = s.creatureFrames[s.cretIdx];
      if (img?.naturalWidth) {
        const groundY = s.zone?.groundY ?? 108;
        const stageScale = 0.7 + (stage - 1) * 0.15;
        const drawW = Math.round(img.naturalWidth * stageScale);
        const drawH = Math.round(img.naturalHeight * stageScale);
        const x = Math.round((SCENE_W - drawW) / 2);
        const y = Math.round(groundY - drawH);
        ctx.drawImage(img, x, y, drawW, drawH);
      }
    }

    // 4) Particles
    if (showParticles && s.particles) {
      const cappedDt = Math.min(dt, PARTICLE_DT_CAP);
      const applicable = s.particles.particles.filter(p => p.zones.includes(zoneKey));

      // Spawn
      for (const p of applicable) {
        s.spawnAcc[p.key] = (s.spawnAcc[p.key] || 0) + cappedDt * p.spawnRate;
        while (s.spawnAcc[p.key] >= 1) {
          s.spawnAcc[p.key] -= 1;
          const px = Math.random() * SCENE_W;
          const py = 12 + Math.random() * (SCENE_H * 0.65);
          const vx = p.drift.vx[0] + Math.random() * (p.drift.vx[1] - p.drift.vx[0]);
          const vy = p.drift.vy[0] + Math.random() * (p.drift.vy[1] - p.drift.vy[0]);
          const life = p.lifetime[0] + Math.random() * (p.lifetime[1] - p.lifetime[0]);
          s.livingParticles.push({ key: p.key, x: px, y: py, vx, vy, life, age: 0, alpha: p.alpha });
        }
      }

      // Update & draw
      const alive: LiveParticle[] = [];
      for (const inst of s.livingParticles) {
        inst.age += cappedDt;
        if (inst.age >= inst.life) continue;
        inst.x += inst.vx * cappedDt;
        inst.y += inst.vy * cappedDt;
        const t = inst.age / inst.life;
        const fade = t < 0.15 ? t / 0.15 : t > 0.85 ? (1 - t) / 0.15 : 1;
        const sprite = s.particleSprites[inst.key];
        if (sprite?.naturalWidth) {
          ctx.globalAlpha = inst.alpha * fade;
          ctx.drawImage(sprite, Math.round(inst.x), Math.round(inst.y));
        }
        alive.push(inst);
      }
      ctx.globalAlpha = 1;
      s.livingParticles = alive;
    }

    animRef.current = requestAnimationFrame(tick);
  }, [zoneKey, stage, showParticles]);

  useEffect(() => {
    stateRef.current.lastT = 0;
    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, [tick]);

  // Compute scale from desired size to native scene size
  const scaleX = width / SCENE_W;
  const scaleY = height / SCENE_H;

  // Day/night CSS filter on the canvas
  const filterMap = {
    day: 'brightness(1) saturate(1)',
    dusk: 'brightness(0.85) saturate(0.95) hue-rotate(-8deg) sepia(0.15)',
    night: 'brightness(0.55) saturate(0.7) hue-rotate(15deg)',
  };

  return (
    <div
      style={{
        width, height,
        overflow: 'hidden',
        position: 'relative',
        imageRendering: 'pixelated',
        ...style,
      }}
    >
      <canvas
        ref={canvasRef}
        width={SCENE_W}
        height={SCENE_H}
        style={{
          width: SCENE_W * Math.max(scaleX, scaleY),
          height: SCENE_H * Math.max(scaleX, scaleY),
          imageRendering: 'pixelated',
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          filter: filterMap[timeOfDay],
        }}
      />
    </div>
  );
}
