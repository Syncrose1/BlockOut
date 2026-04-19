import { useEffect, useRef, useState, useCallback } from 'react';

// ─── Constants ──────────────────────────────────────────────────────────────
const SCENE_W = 400;
const SCENE_H = 180;
const HERO_FPS = 6;
const CREATURE_FPS = 8;
const PARTICLE_DT_CAP = 0.05;

// ─── Types ──────────────────────────────────────────────────────────────────
interface SceneSlot {
  x: number;
  y: number;
}

interface SceneData {
  key: string;
  name: string;
  plate: string;
  hero?: {
    frames: string[];
    anchor: { x: number; y: number };
    size: number;
  };
  particles?: {
    sprite: string;
    spawnRate: number;
    lifetime: [number, number];
    drift: { vx: [number, number]; vy: [number, number] };
    spawnArea: { x: [number, number]; y: [number, number] };
    alpha: number;
  };
  slots: SceneSlot[];
  filter?: string;
}

interface CreatureAtSlot {
  slotIndex: number;
  framePaths: string[];
  stage: number;
}

interface CoFocusSceneProps {
  sceneKey: string;
  creatures: CreatureAtSlot[];
  width: number;
  height: number;
  style?: React.CSSProperties;
}

// Image cache
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
  x: number; y: number;
  vx: number; vy: number;
  life: number; age: number;
  alpha: number;
}

// Scene data cache
let scenesCache: SceneData[] | null = null;
async function loadScenes(): Promise<SceneData[]> {
  if (scenesCache) return scenesCache;
  const res = await fetch('/cofocus/scenes.json');
  const json = await res.json();
  scenesCache = json.scenes;
  return scenesCache!;
}

export function CoFocusScene({
  sceneKey,
  creatures,
  width,
  height,
  style,
}: CoFocusSceneProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  const stateRef = useRef({
    scene: null as SceneData | null,
    plateImg: null as HTMLImageElement | null,
    heroFrames: [] as HTMLImageElement[],
    creatureSlots: [] as { frames: HTMLImageElement[]; stage: number; slot: SceneSlot; idx: number; acc: number }[],
    particleSprite: null as HTMLImageElement | null,
    livingParticles: [] as LiveParticle[],
    spawnAcc: 0,
    heroIdx: 0, heroAcc: 0,
    lastT: 0,
    loaded: false,
  });

  const [loaded, setLoaded] = useState(false);

  // Load scene data + plate + hero frames
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const scenes = await loadScenes();
      const scene = scenes.find(s => s.key === sceneKey);
      if (!scene || cancelled) return;

      const s = stateRef.current;
      s.scene = scene;

      // Load plate
      s.plateImg = await loadImage(scene.plate);

      // Load hero frames
      s.heroFrames = [];
      if (scene.hero?.frames?.length) {
        s.heroFrames = await Promise.all(scene.hero.frames.map(loadImage));
      }

      // Load particle sprite
      if (scene.particles?.sprite) {
        s.particleSprite = await loadImage(scene.particles.sprite);
      }

      s.livingParticles = [];
      s.spawnAcc = 0;
      s.heroIdx = 0; s.heroAcc = 0;

      if (!cancelled) { s.loaded = true; setLoaded(true); }
    })();
    return () => { cancelled = true; };
  }, [sceneKey]);

  // Load creature frames when creatures prop changes
  useEffect(() => {
    if (!loaded) return;
    const s = stateRef.current;
    const scene = s.scene;
    if (!scene) return;

    let cancelled = false;
    (async () => {
      const slots: typeof s.creatureSlots = [];
      for (const c of creatures) {
        if (c.slotIndex >= scene.slots.length) continue;
        const frames = await Promise.all(c.framePaths.map(loadImage));
        if (cancelled) return;
        slots.push({
          frames,
          stage: c.stage,
          slot: scene.slots[c.slotIndex],
          idx: 0,
          acc: 0,
        });
      }
      if (!cancelled) s.creatureSlots = slots;
    })();
    return () => { cancelled = true; };
  }, [loaded, creatures]);

  // Integer scaling
  const intScale = Math.max(1, Math.floor(Math.max(width / SCENE_W, height / SCENE_H)));
  const canvasPixelW = SCENE_W * intScale;
  const canvasPixelH = SCENE_H * intScale;

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
    ctx.setTransform(intScale, 0, 0, intScale, 0, 0);
    ctx.clearRect(0, 0, SCENE_W, SCENE_H);

    // 1) Plate background
    if (s.plateImg?.naturalWidth) {
      ctx.drawImage(s.plateImg, 0, 0, SCENE_W, SCENE_H);
    }

    // 2) Hero animation (campfire)
    if (s.heroFrames.length > 0 && s.scene?.hero) {
      s.heroAcc += dt;
      const interval = 1 / HERO_FPS;
      while (s.heroAcc >= interval) {
        s.heroAcc -= interval;
        s.heroIdx = (s.heroIdx + 1) % s.heroFrames.length;
      }
      const img = s.heroFrames[s.heroIdx];
      if (img?.naturalWidth) {
        const heroSize = s.scene.hero.size;
        ctx.drawImage(
          img,
          s.scene.hero.anchor.x, s.scene.hero.anchor.y,
          heroSize, heroSize,
        );
      }
    }

    // 3) Creatures at slot positions
    for (const cs of s.creatureSlots) {
      if (cs.frames.length === 0) continue;
      cs.acc += dt;
      const interval = 1 / CREATURE_FPS;
      while (cs.acc >= interval) {
        cs.acc -= interval;
        cs.idx = (cs.idx + 1) % cs.frames.length;
      }
      const img = cs.frames[cs.idx];
      if (img?.naturalWidth) {
        const stageScale = 0.85 + (cs.stage - 1) * 0.15;
        const drawW = Math.round(img.naturalWidth * stageScale);
        const drawH = Math.round(img.naturalHeight * stageScale);
        const x = Math.round(cs.slot.x - drawW / 2);
        const y = Math.round(cs.slot.y - drawH);
        ctx.drawImage(img, x, y, drawW, drawH);
      }
    }

    // 4) Particles
    if (s.particleSprite?.naturalWidth && s.scene?.particles) {
      const p = s.scene.particles;
      const cappedDt = Math.min(dt, PARTICLE_DT_CAP);

      // Spawn
      s.spawnAcc += cappedDt * p.spawnRate;
      while (s.spawnAcc >= 1) {
        s.spawnAcc -= 1;
        const px = p.spawnArea.x[0] + Math.random() * (p.spawnArea.x[1] - p.spawnArea.x[0]);
        const py = p.spawnArea.y[0] + Math.random() * (p.spawnArea.y[1] - p.spawnArea.y[0]);
        const vx = p.drift.vx[0] + Math.random() * (p.drift.vx[1] - p.drift.vx[0]);
        const vy = p.drift.vy[0] + Math.random() * (p.drift.vy[1] - p.drift.vy[0]);
        const life = p.lifetime[0] + Math.random() * (p.lifetime[1] - p.lifetime[0]);
        s.livingParticles.push({ x: px, y: py, vx, vy, life, age: 0, alpha: p.alpha });
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
        ctx.globalAlpha = inst.alpha * fade;
        ctx.drawImage(s.particleSprite!, Math.round(inst.x), Math.round(inst.y));
        alive.push(inst);
      }
      ctx.globalAlpha = 1;
      s.livingParticles = alive;
    }

    animRef.current = requestAnimationFrame(tick);
  }, [sceneKey, intScale]);

  useEffect(() => {
    stateRef.current.lastT = 0;
    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, [tick]);

  // CSS display
  const cssScale = Math.max(width / SCENE_W, height / SCENE_H);
  const canvasW = SCENE_W * cssScale;
  const canvasH = SCENE_H * cssScale;

  const scene = stateRef.current.scene;
  const filter = scene?.filter || 'blur(0.4px)';

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
        width={canvasPixelW}
        height={canvasPixelH}
        style={{
          width: canvasW,
          height: canvasH,
          imageRendering: 'pixelated',
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          filter,
        }}
      />
    </div>
  );
}
