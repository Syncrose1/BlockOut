import { useEffect, useRef, useState, useCallback } from 'react';

// ─── Constants ──────────────────────────────────────────────────────────────
const SCENE_W = 400;
const SCENE_H = 180;
const HERO_FPS = 6;
const CREATURE_FPS = 8;
const PLATE_FPS = 4;
const PARTICLE_DT_CAP = 0.05;
const SCENE_CENTER_X = 200;

// ─── Types ──────────────────────────────────────────────────────────────────
interface SceneSlot {
  x: number;
  y: number;
}

interface SceneData {
  key: string;
  name: string;
  plate: string;
  plateFrames?: string[];
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

export interface CreatureAtSlot {
  slotIndex: number;
  framePaths: string[];
  stage: number;
  displayName?: string;
  isRunning?: boolean;
  lastTaskCompletedAt?: number;
}

interface CoFocusSceneProps {
  sceneKey: string;
  creatures: CreatureAtSlot[];
  width: number;
  height: number;
  sceneBlur?: number;
  creatureBlurEnabled?: boolean;
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

/** Extract color-only portion from filter string (remove any blur) */
function extractColorFilter(filter?: string): string {
  if (!filter) return '';
  return filter.replace(/blur\([^)]*\)/g, '').trim();
}

export function CoFocusScene({
  sceneKey,
  creatures,
  width,
  height,
  sceneBlur = 0.4,
  creatureBlurEnabled = false,
  style,
}: CoFocusSceneProps) {
  const bgCanvasRef = useRef<HTMLCanvasElement>(null);
  const creatureCanvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  const stateRef = useRef({
    scene: null as SceneData | null,
    plateImg: null as HTMLImageElement | null,
    plateFrameImgs: [] as HTMLImageElement[],
    plateFrameIdx: 0, plateFrameAcc: 0,
    heroFrames: [] as HTMLImageElement[],
    creatureSlots: [] as {
      frames: HTMLImageElement[];
      stage: number;
      slot: SceneSlot;
      idx: number;
      acc: number;
      displayName?: string;
      isRunning?: boolean;
      lastTaskCompletedAt?: number;
    }[],
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

      // Load plate (single or animated)
      s.plateImg = await loadImage(scene.plate);
      s.plateFrameImgs = [];
      s.plateFrameIdx = 0;
      s.plateFrameAcc = 0;
      if (scene.plateFrames?.length) {
        s.plateFrameImgs = await Promise.all(scene.plateFrames.map(loadImage));
      }

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
          displayName: c.displayName,
          isRunning: c.isRunning,
          lastTaskCompletedAt: c.lastTaskCompletedAt,
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

  // Render loop — draws background on bgCanvas, creatures on creatureCanvas
  const tick = useCallback((now: number) => {
    const s = stateRef.current;
    if (!s.loaded) { animRef.current = requestAnimationFrame(tick); return; }

    const bgCanvas = bgCanvasRef.current;
    const crCanvas = creatureCanvasRef.current;
    if (!bgCanvas || !crCanvas) { animRef.current = requestAnimationFrame(tick); return; }
    const bgCtx = bgCanvas.getContext('2d');
    const crCtx = crCanvas.getContext('2d');
    if (!bgCtx || !crCtx) { animRef.current = requestAnimationFrame(tick); return; }

    let dt = s.lastT ? (now - s.lastT) / 1000 : 0;
    s.lastT = now;
    if (dt > 0.25) dt = 0.25;

    // ─── Background canvas ─────────────────────────────────────────────
    bgCtx.imageSmoothingEnabled = false;
    bgCtx.setTransform(intScale, 0, 0, intScale, 0, 0);
    bgCtx.clearRect(0, 0, SCENE_W, SCENE_H);

    // 1) Plate background (animated or static)
    if (s.plateFrameImgs.length > 0) {
      s.plateFrameAcc += dt;
      const interval = 1 / PLATE_FPS;
      while (s.plateFrameAcc >= interval) {
        s.plateFrameAcc -= interval;
        s.plateFrameIdx = (s.plateFrameIdx + 1) % s.plateFrameImgs.length;
      }
      const frameImg = s.plateFrameImgs[s.plateFrameIdx];
      if (frameImg?.naturalWidth) {
        bgCtx.drawImage(frameImg, 0, 0, SCENE_W, SCENE_H);
      }
    } else if (s.plateImg?.naturalWidth) {
      bgCtx.drawImage(s.plateImg, 0, 0, SCENE_W, SCENE_H);
    }

    // 2) Hero animation (campfire overlay)
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
        bgCtx.drawImage(
          img,
          s.scene.hero.anchor.x, s.scene.hero.anchor.y,
          heroSize, heroSize,
        );
      }
    }

    // 3) Particles (drawn on background canvas)
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
        bgCtx.globalAlpha = inst.alpha * fade;
        bgCtx.drawImage(s.particleSprite!, Math.round(inst.x), Math.round(inst.y));
        alive.push(inst);
      }
      bgCtx.globalAlpha = 1;
      s.livingParticles = alive;
    }

    // ─── Creature canvas ───────────────────────────────────────────────
    crCtx.imageSmoothingEnabled = false;
    crCtx.setTransform(intScale, 0, 0, intScale, 0, 0);
    crCtx.clearRect(0, 0, SCENE_W, SCENE_H);

    const nowMs = Date.now();
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
        // Smaller scale: 0.35 / 0.43 / 0.51
        const stageScale = 0.35 + (cs.stage - 1) * 0.08;
        const drawW = Math.round(img.naturalWidth * stageScale);
        const drawH = Math.round(img.naturalHeight * stageScale);

        // Flip logic: creatures left of center face right (toward center)
        const shouldFlip = cs.slot.x < SCENE_CENTER_X - 10;

        crCtx.save();
        if (shouldFlip) {
          crCtx.translate(cs.slot.x, 0);
          crCtx.scale(-1, 1);
          crCtx.translate(-cs.slot.x, 0);
        }
        const x = Math.round(cs.slot.x - drawW / 2);
        const y = Math.round(cs.slot.y - drawH);
        crCtx.drawImage(img, x, y, drawW, drawH);
        crCtx.restore();

        // ─── Labels ───────────────────────────────────────────────────
        if (cs.displayName) {
          crCtx.save();
          crCtx.font = '7px sans-serif';
          crCtx.textAlign = 'center';
          crCtx.textBaseline = 'bottom';
          crCtx.fillStyle = 'rgba(0,0,0,0.7)';
          crCtx.fillText(cs.displayName, cs.slot.x + 1, y - 3);
          crCtx.fillStyle = 'white';
          crCtx.fillText(cs.displayName, cs.slot.x, y - 4);
          crCtx.restore();
        }

        // Status text below creature
        crCtx.save();
        crCtx.font = '6px sans-serif';
        crCtx.textAlign = 'center';
        crCtx.textBaseline = 'top';
        const statusY = cs.slot.y + 2;

        if (cs.lastTaskCompletedAt && (nowMs - cs.lastTaskCompletedAt) < 120_000) {
          crCtx.fillStyle = 'rgba(0,0,0,0.7)';
          crCtx.fillText('Completed a Task!', cs.slot.x + 1, statusY + 1);
          crCtx.fillStyle = 'hsl(142, 72%, 50%)';
          crCtx.fillText('Completed a Task!', cs.slot.x, statusY);
        } else if (cs.isRunning) {
          crCtx.fillStyle = 'rgba(0,0,0,0.7)';
          crCtx.fillText('Focusing...', cs.slot.x + 1, statusY + 1);
          crCtx.fillStyle = 'white';
          crCtx.fillText('Focusing...', cs.slot.x, statusY);
        } else {
          crCtx.fillStyle = 'rgba(0,0,0,0.5)';
          crCtx.fillText('Resting...', cs.slot.x + 1, statusY + 1);
          crCtx.fillStyle = 'rgba(255,255,255,0.5)';
          crCtx.fillText('Resting...', cs.slot.x, statusY);
        }
        crCtx.restore();
      }
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
  const colorFilter = extractColorFilter(scene?.filter);
  const bgFilter = `${colorFilter} blur(${sceneBlur}px)`.trim();
  const crFilter = creatureBlurEnabled ? `${colorFilter} blur(${sceneBlur}px)`.trim() : colorFilter;

  const canvasBase: React.CSSProperties = {
    width: canvasW,
    height: canvasH,
    imageRendering: 'pixelated',
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
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
      {/* Background canvas: plate + hero + particles */}
      <canvas
        ref={bgCanvasRef}
        width={canvasPixelW}
        height={canvasPixelH}
        style={{
          ...canvasBase,
          filter: bgFilter || undefined,
        }}
      />
      {/* Creature canvas: creatures + labels */}
      <canvas
        ref={creatureCanvasRef}
        width={canvasPixelW}
        height={canvasPixelH}
        style={{
          ...canvasBase,
          filter: crFilter || undefined,
        }}
      />
    </div>
  );
}
