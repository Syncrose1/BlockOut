import { useRef, useEffect, useState, useCallback, useMemo, useLayoutEffect } from 'react';
import { useStore } from '../store';
import { layoutTreemap } from '../utils/treemap';
import { TASK_GRAY } from '../utils/colors';
import { debouncedSave } from '../utils/persistence';
import type { TreemapNode, Task, Category } from '../types';

// ─── Animation types ──────────────────────────────────────────────────────────

interface Particle {
  id: string;
  cx: number; cy: number;          // burst origin (tile center)
  tx: number; ty: number; tw: number; th: number; // clip bounds
  color: string;
  startTime: number;
}

interface Dissolve {
  startTime: number;
  fromColor: string; // TASK_GRAY
  toColor: string;   // category color
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Smooth HSL interpolation between two hsl(…) strings */
function lerpHsl(from: string, to: string, t: number): string {
  const parse = (s: string) => {
    const m = s.match(/hsl\((\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?)%,\s*(\d+(?:\.\d+)?)%\)/);
    return m ? [parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3])] : [0, 0, 0];
  };
  const [h1, s1, l1] = parse(from);
  const [h2, s2, l2] = parse(to);
  const e = 1 - Math.pow(1 - t, 2); // ease-out quad
  const lerp = (a: number, b: number) => a + (b - a) * e;
  return `hsl(${lerp(h1, h2).toFixed(0)}, ${lerp(s1, s2).toFixed(1)}%, ${lerp(l1, l2).toFixed(1)}%)`;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
) {
  r = Math.min(r, w / 2, h / 2);
  if (r < 0) r = 0;
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ─── Component ────────────────────────────────────────────────────────────────

export function Treemap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  // Animation state in plain refs — zero React re-renders during animation
  const hoveredIdRef = useRef<string | null>(null);
  const hoverTransitionsRef = useRef<Map<string, { startTime: number; entering: boolean; progress: number }>>(new Map());
  const particlesRef = useRef<Particle[]>([]);
  const dissolvingRef = useRef<Map<string, Dissolve>>(new Map());
  const sparkleCounterRef = useRef(0);
  const lastSparkleRef = useRef(0);
  const rafRef = useRef(0);

  // Store selectors
  const tasks = useStore((s) => s.tasks);
  const categories = useStore((s) => s.categories);
  const timeBlocks = useStore((s) => s.timeBlocks);
  const activeBlockId = useStore((s) => s.activeBlockId);
  const showTimelessPool = useStore((s) => s.showTimelessPool);
  const toggleTask = useStore((s) => s.toggleTask);
  const focusMode = useStore((s) => s.focusMode);
  const focusedCategoryId = useStore((s) => s.pomodoro.focusedCategoryId);
  const setDraggedTask = useStore((s) => s.setDraggedTask);
  const setEditingTaskId = useStore((s) => s.setEditingTaskId);

  const isTaskLocked = (taskId: string): boolean => {
    const task = tasks[taskId];
    if (!task?.dependsOn || task.dependsOn.length === 0) return false;
    return task.dependsOn.some((depId) => !tasks[depId]?.completed);
  };

  const visibleTasks = useMemo(() => {
    if (showTimelessPool) return Object.values(tasks);
    if (activeBlockId && timeBlocks[activeBlockId]) {
      return timeBlocks[activeBlockId].taskIds.map((id) => tasks[id]).filter(Boolean);
    }
    return [];
  }, [tasks, timeBlocks, activeBlockId, showTimelessPool]);

  const treemapData = useMemo(() => {
    const catMap = new Map<string, { category: Category; tasks: Task[] }>();
    visibleTasks.forEach((task) => {
      const cat = categories[task.categoryId];
      if (!cat) return;
      if (!catMap.has(cat.id)) catMap.set(cat.id, { category: cat, tasks: [] });
      catMap.get(cat.id)!.tasks.push(task);
    });

    const nodes: TreemapNode[] = [];
    catMap.forEach(({ category, tasks: catTasks }) => {
      const subMap = new Map<string, Task[]>();
      const noSub: Task[] = [];
      catTasks.forEach((task) => {
        if (task.subcategoryId) {
          if (!subMap.has(task.subcategoryId)) subMap.set(task.subcategoryId, []);
          subMap.get(task.subcategoryId)!.push(task);
        } else {
          noSub.push(task);
        }
      });

      const children: TreemapNode[] = [];
      subMap.forEach((subTasks, subId) => {
        const sub = category.subcategories.find((s) => s.id === subId);
        children.push({
          id: subId,
          name: sub?.name || 'Unknown',
          value: subTasks.reduce((sum, t) => sum + t.weight, 0),
          color: category.color,
          completed: subTasks.every((t) => t.completed),
          children: subTasks.map((task) => ({
            id: task.id,
            name: task.title,
            value: task.weight,
            color: category.color,
            completed: task.completed,
            locked: isTaskLocked(task.id),
            categoryId: category.id,
            subcategoryId: subId,
          })),
          categoryId: category.id,
          depth: 1,
        });
      });

      noSub.forEach((task) => {
        children.push({
          id: task.id,
          name: task.title,
          value: task.weight,
          color: category.color,
          completed: task.completed,
          locked: isTaskLocked(task.id),
          categoryId: category.id,
        });
      });

      nodes.push({
        id: category.id,
        name: category.name,
        value: catTasks.reduce((sum, t) => sum + t.weight, 0),
        color: category.color,
        completed: catTasks.every((t) => t.completed),
        children,
      });
    });
    return nodes;
  }, [visibleTasks, categories]);

  // Resize observer
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setSize({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const layout = useMemo(() => {
    if (size.w === 0 || size.h === 0 || treemapData.length === 0) return [];
    return layoutTreemap(treemapData, size.w, size.h, 6);
  }, [treemapData, size]);

  const leafNodes = useMemo(() => {
    const leaves: TreemapNode[] = [];
    const collect = (nodes: TreemapNode[]) => {
      nodes.forEach((node) => {
        if (node.children && node.children.length > 0) {
          node.children.forEach((child) => {
            if (child.children && child.children.length > 0) {
              collect(child.children);
            } else if (child.x !== undefined) {
              leaves.push(child);
            }
          });
        }
      });
    };
    collect(layout);
    return leaves;
  }, [layout]);

  // ── Data refs: kept in sync so the RAF loop always reads the latest values ──
  const layoutRef = useRef(layout);
  const sizeRef = useRef(size);
  const tasksRef = useRef(tasks);
  const focusModeRef = useRef(focusMode);
  const focusedCatRef = useRef(focusedCategoryId);
  const leafNodesRef = useRef(leafNodes);
  const setEditingRef = useRef(setEditingTaskId);

  useLayoutEffect(() => { layoutRef.current = layout; }, [layout]);
  useLayoutEffect(() => { sizeRef.current = size; }, [size]);
  useLayoutEffect(() => { tasksRef.current = tasks; }, [tasks]);
  useLayoutEffect(() => { focusModeRef.current = focusMode; }, [focusMode]);
  useLayoutEffect(() => { focusedCatRef.current = focusedCategoryId; }, [focusedCategoryId]);
  useLayoutEffect(() => { leafNodesRef.current = leafNodes; }, [leafNodes]);
  useLayoutEffect(() => { setEditingRef.current = setEditingTaskId; }, [setEditingTaskId]);

  // ── Single draw call — reads exclusively from refs, no React state deps ─────
  const drawFrame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { w, h } = sizeRef.current;
    if (w === 0 || h === 0) return;

    const dpr = window.devicePixelRatio || 1;
    const targetW = Math.round(w * dpr);
    const targetH = Math.round(h * dpr);
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    
    // Enable crisp rendering
    ctx.imageSmoothingEnabled = false;

    const now = Date.now();
    const currLayout = layoutRef.current;
    const hoveredId = hoveredIdRef.current;
    const isFocusing = focusModeRef.current && focusedCatRef.current;
    const sparkle = sparkleCounterRef.current;
    const dissolving = dissolvingRef.current;
    const currTasks = tasksRef.current;

    const drawLeafTile = (taskNode: TreemapNode) => {
      const tx = taskNode.x!;
      const ty = taskNode.y!;
      const tw = taskNode.w!;
      const th = taskNode.h!;
      if (tw < 2 || th < 2) return;

      const isHovered = hoveredId === taskNode.id;
      const isLocked = taskNode.locked;
      const dissolve = dissolving.get(taskNode.id);

      // ── Tile fill ───────────────────────────────────────────────────────────
      let fillColor: string;
      if (isLocked) {
        fillColor = isHovered ? 'hsl(30, 25%, 18%)' : 'hsl(30, 20%, 14%)';
      } else if (dissolve) {
        const progress = Math.min(1, (now - dissolve.startTime) / 600);
        fillColor = lerpHsl(dissolve.fromColor, dissolve.toColor, progress);
      } else if (taskNode.completed) {
        fillColor = isHovered ? taskNode.color.replace('62%)', '70%)') : taskNode.color;
      } else {
        fillColor = isHovered ? 'hsl(220, 10%, 28%)' : TASK_GRAY;
      }

      ctx.fillStyle = fillColor;
      ctx.beginPath();
      roundRect(ctx, tx, ty, tw, th, 4);
      ctx.fill();

      // ── Border ──────────────────────────────────────────────────────────────
      if (isLocked) {
        ctx.strokeStyle = 'hsl(30, 40%, 28%)';
      } else if (taskNode.completed || dissolve) {
        ctx.strokeStyle = taskNode.color.replace('62%)', '45%)');
      } else {
        ctx.strokeStyle = isHovered ? 'hsl(220, 10%, 35%)' : 'hsl(220, 10%, 28%)';
      }
      ctx.lineWidth = isLocked ? 1.5 : 1;
      ctx.beginPath();
      roundRect(ctx, tx, ty, tw, th, 4);
      ctx.stroke();

      // ── Locked crosshatch ───────────────────────────────────────────────────
      if (isLocked && tw > 8 && th > 8) {
        ctx.save();
        ctx.beginPath();
        roundRect(ctx, tx, ty, tw, th, 4);
        ctx.clip();
        ctx.strokeStyle = 'rgba(180, 120, 40, 0.15)';
        ctx.lineWidth = 1;
        for (let x = tx - th; x < tx + tw + th; x += 8) {
          ctx.beginPath();
          ctx.moveTo(x, ty);
          ctx.lineTo(x + th, ty + th);
          ctx.stroke();
        }
        ctx.restore();
      }

      // ── Label — proportional font size ──────────────────────────────────────
      if (tw > 22 && th > 12) {
        // Scale font based on tile dimensions, more responsive to size changes
        // Use both width and height to determine appropriate size
        const minDim = Math.min(tw, th);
        const scaleFactor = Math.min(tw, th * 2) / 120; // Reference size for scaling
        const baseSize = Math.max(8, Math.min(16, minDim * 0.12));
        const responsiveSize = baseSize * Math.max(0.8, Math.min(1.3, scaleFactor));
        const fontSize = Math.max(8, Math.min(18, responsiveSize));
        const isActive = taskNode.completed || !!dissolve;
        ctx.font = `${isActive ? '600' : '500'} ${fontSize.toFixed(0)}px Inter, sans-serif`;
        ctx.textBaseline = 'middle';
        ctx.fillStyle = isLocked
          ? 'rgba(180, 120, 40, 0.6)'
          : isActive
          ? 'rgba(255,255,255,0.92)'
          : 'rgba(255,255,255,0.65)';

        // Center the text in the tile, account for lock icon if present
        const centerX = tx + tw / 2;
        const labelMaxW = isLocked ? tw - 24 : tw - 12;

        // Accurate ellipsis using measureText
        const truncate = (text: string, font: string, maxW: number): string => {
          ctx.font = font;
          if (ctx.measureText(text).width <= maxW) return text;
          let lo = 0, hi = text.length;
          while (lo < hi) {
            const mid = (lo + hi + 1) >> 1;
            if (ctx.measureText(text.slice(0, mid) + '\u2026').width <= maxW) lo = mid;
            else hi = mid - 1;
          }
          return text.slice(0, lo) + '\u2026';
        };

        const titleFont = `${isActive ? '600' : '500'} ${fontSize.toFixed(0)}px Inter, sans-serif`;
        const label = truncate(taskNode.name, titleFont, labelMaxW);

        // Handle hover transitions for smooth animations
        const task = currTasks[taskNode.id];
        const hasNotes = !!task?.notes && task.notes.trim() !== '';
        const canShowNotes = th > 54 && tw > 58 && hasNotes;
        
        // Get or create hover transition state
        let hoverTrans = hoverTransitionsRef.current.get(taskNode.id);
        if (!hoverTrans) {
          // Initialize: start at 0 for hidden state, 1 for visible state
          const initialProgress = isHovered ? 0 : 0;
          hoverTrans = { startTime: now, entering: isHovered, progress: initialProgress };
          hoverTransitionsRef.current.set(taskNode.id, hoverTrans);
        }
        
        // Update transition when hover state changes
        if (hoverTrans.entering !== isHovered) {
          hoverTrans.startTime = now;
          hoverTrans.entering = isHovered;
          // When starting a new animation, begin from the opposite end
          // If we're entering, start from 0; if leaving, start from 1
          hoverTrans.progress = isHovered ? 0 : 1;
        }
        
        // Calculate animation progress (200ms duration for snappier feel)
        const HOVER_ANIM_DURATION = 200;
        const elapsed = now - hoverTrans.startTime;
        const animProgress = Math.min(1, elapsed / HOVER_ANIM_DURATION);
        
        // Calculate current visual progress
        // When entering: progress 0->1, when leaving: progress 1->0
        const currentProgress = isHovered ? animProgress : (1 - animProgress);
        hoverTrans.progress = currentProgress;
        
        const easedProgress = 1 - Math.pow(1 - currentProgress, 3); // ease-out-cubic
        
        // Animate notes in/out based on transition progress
        const notesOpacity = canShowNotes ? easedProgress : 0;
        
        // Animate label position: moves up when notes appear, down when leaving
        const baseLabelY = ty + th / 2;
        const notesLabelY = ty + th * 0.38;
        const labelY = canShowNotes 
          ? baseLabelY - (baseLabelY - notesLabelY) * easedProgress
          : baseLabelY;
        
        ctx.font = titleFont;
        ctx.textAlign = 'center';
        ctx.fillText(label, centerX, labelY);

        // Draw notes with fade animation
        if (canShowNotes && notesOpacity > 0.01 && task.notes) {
          const noteSize = Math.max(8, fontSize - 1.5);
          const noteFont = `400 ${noteSize.toFixed(0)}px Inter, sans-serif`;
          const note = truncate(task.notes, noteFont, labelMaxW);
          ctx.font = noteFont;
          ctx.fillStyle = `rgba(255,255,255,${0.32 * notesOpacity})`;
          ctx.fillText(note, centerX, ty + th * 0.62);
        }
      }

      // ── Lock icon ───────────────────────────────────────────────────────────
      if (isLocked && tw > 16 && th > 16) {
        ctx.fillStyle = 'rgba(200, 150, 60, 0.7)';
        ctx.font = `${Math.min(12, tw * 0.4, th * 0.4)}px sans-serif`;
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        ctx.fillText('\uD83D\uDD12', tx + 3, ty + th / 2);
        ctx.textAlign = 'left';
      }

      // ── Completion checkmark (only after dissolve finishes) ─────────────────
      if (taskNode.completed && !dissolve && tw > 20 && th > 20) {
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.font = '12px sans-serif';
        ctx.textBaseline = 'top';
        ctx.fillText('\u2713', tx + tw - 16, ty + 4);
      }

      // ── Idle sparkle on completed tiles ─────────────────────────────────────
      if (taskNode.completed && !dissolve && tw > 15 && th > 15) {
        const sparkleHash = (taskNode.id.charCodeAt(0) + taskNode.id.charCodeAt(1)) % 5;
        if ((sparkle + sparkleHash) % 5 === 0) {
          const sx = tx + tw * 0.3 + (sparkle * 7) % (tw * 0.4);
          const sy = ty + th * 0.3 + (sparkle * 3) % (th * 0.4);
          ctx.fillStyle = 'rgba(255,255,255,0.6)';
          ctx.beginPath();
          ctx.arc(sx, sy, 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      
      // Reset text alignment so it doesn't affect other elements
      ctx.textAlign = 'left';
    };

    // ── Category containers + children ────────────────────────────────────────
    currLayout.forEach((catNode) => {
      const x = catNode.x!;
      const y = catNode.y!;
      const w = catNode.w!;
      const h = catNode.h!;

      const dimmed = isFocusing && catNode.id !== focusedCatRef.current;
      const focused = isFocusing && catNode.id === focusedCatRef.current;

      if (dimmed) ctx.globalAlpha = 0.15;

      ctx.fillStyle = catNode.color.replace('62%)', '12%)');
      ctx.beginPath();
      roundRect(ctx, x, y, w, h, 8);
      ctx.fill();

      if (focused) { ctx.shadowColor = catNode.color; ctx.shadowBlur = 12; }
      ctx.strokeStyle = focused ? catNode.color : catNode.color.replace('62%)', '25%)');
      ctx.lineWidth = focused ? 2 : 1;
      ctx.beginPath();
      roundRect(ctx, x, y, w, h, 8);
      ctx.stroke();
      ctx.shadowBlur = 0;

      const headerH = Math.min(22, h * 0.25);
      ctx.fillStyle = catNode.color;
      ctx.font = '600 11px Inter, sans-serif';
      ctx.textBaseline = 'middle';
      if (w > 40 && h > 20) ctx.fillText(catNode.name.toUpperCase(), x + 8, y + headerH / 2 + 2, w - 16);

      if (catNode.children) {
        catNode.children.forEach((child) => {
          if (child.children && child.children.length > 0 && child.depth) {
            if (child.x !== undefined && child.w! > 30 && child.h! > 20) {
              ctx.fillStyle = catNode.color.replace('62%)', '16%)');
              ctx.beginPath();
              roundRect(ctx, child.x!, child.y!, child.w!, child.h!, 5);
              ctx.fill();
              ctx.strokeStyle = catNode.color.replace('62%)', '20%)');
              ctx.lineWidth = 0.5;
              ctx.beginPath();
              roundRect(ctx, child.x!, child.y!, child.w!, child.h!, 5);
              ctx.stroke();
              if (child.w! > 50 && child.h! > 25) {
                ctx.fillStyle = catNode.color.replace('72%', '50%').replace('62%)', '50%)');
                ctx.font = '500 9px Inter, sans-serif';
                ctx.textBaseline = 'top';
                ctx.fillText(child.name.toLowerCase(), child.x! + 4, child.y! + 3, child.w! - 8);
              }
            }
            child.children.forEach(drawLeafTile);
          } else {
            drawLeafTile(child);
          }
        });
      }

      if (dimmed) ctx.globalAlpha = 1;
    });

    // ── Contained particles — clipped to tile bounds ──────────────────────────
    const PARTICLE_DURATION = 700;
    particlesRef.current.forEach((p) => {
      const elapsed = now - p.startTime;
      const progress = Math.min(elapsed / PARTICLE_DURATION, 1);
      if (progress >= 1) return;

      const maxDist = Math.min(p.tw, p.th) * 0.36; // spread proportional to tile, stays inside

      ctx.save();
      ctx.beginPath();
      roundRect(ctx, p.tx, p.ty, p.tw, p.th, 4);
      ctx.clip();

      const count = 10;
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2 + progress * 0.9;
        const dist = progress * maxDist;
        const px = p.cx + Math.cos(angle) * dist;
        const py = p.cy + Math.sin(angle) * dist;
        ctx.fillStyle = p.color;
        ctx.globalAlpha = (1 - progress) * 0.9;
        ctx.beginPath();
        ctx.arc(px, py, (1 - progress) * 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
      // Smaller inner ring rotating opposite
      for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2 - progress * 2.5;
        const dist = progress * maxDist * 0.5;
        const px = p.cx + Math.cos(angle) * dist;
        const py = p.cy + Math.sin(angle) * dist;
        ctx.globalAlpha = (1 - progress) * 0.55;
        ctx.beginPath();
        ctx.arc(px, py, (1 - progress) * 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    });
  }, []); // empty deps — all data via refs

  // ── Persistent RAF loop — started once, runs forever ─────────────────────────
  useEffect(() => {
    const loop = (timestamp: number) => {
      if (timestamp - lastSparkleRef.current > 2000) {
        sparkleCounterRef.current++;
        lastSparkleRef.current = timestamp;
      }
      const now = Date.now();
      drawFrame();
      // Cleanup expired animations
      particlesRef.current = particlesRef.current.filter((p) => now - p.startTime < 700);
      dissolvingRef.current.forEach((v, k) => {
        if (now - v.startTime > 600) dissolvingRef.current.delete(k);
      });
      // Cleanup completed hover transitions
      hoverTransitionsRef.current.forEach((trans, id) => {
        const isHovered = hoveredIdRef.current === id;
        // Calculate current progress (same logic as in drawFrame)
        const elapsed = now - trans.startTime;
        const animProgress = Math.min(1, elapsed / 200);
        const currentProgress = isHovered ? animProgress : (1 - animProgress);
        
        // Remove if animation complete and not currently hovered
        if (currentProgress <= 0.01 && !isHovered) {
          hoverTransitionsRef.current.delete(id);
        }
      });
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [drawFrame]);

  // ── Hit testing ───────────────────────────────────────────────────────────────
  // Get CSS zoom factor to adjust mouse coordinates (zoom affects getBoundingClientRect but not canvas layout)
  const getZoomFactor = useCallback((): number => {
    const html = document.documentElement;
    const zoom = (html as any).style?.zoom || getComputedStyle(html).zoom;
    return zoom ? parseFloat(zoom) : 1;
  }, []);

  const findNodeAt = useCallback((mx: number, my: number): TreemapNode | null => {
    const zoom = getZoomFactor();
    const adjustedMx = mx / zoom;
    const adjustedMy = my / zoom;
    for (const leaf of leafNodesRef.current) {
      if (adjustedMx >= leaf.x! && adjustedMx <= leaf.x! + leaf.w! && adjustedMy >= leaf.y! && adjustedMy <= leaf.y! + leaf.h!) {
        return leaf;
      }
    }
    return null;
  }, [getZoomFactor]);

  // ── Event handlers ────────────────────────────────────────────────────────────
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const node = findNodeAt(e.clientX - rect.left, e.clientY - rect.top);
    hoveredIdRef.current = node?.id ?? null;
    if (containerRef.current) {
      containerRef.current.style.cursor = node ? 'pointer' : 'default';
    }
  }, [findNodeAt]);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const node = findNodeAt(e.clientX - rect.left, e.clientY - rect.top);
    if (!node) return;

    const task = tasksRef.current[node.id];
    if (task?.dependsOn?.length) {
      const allMet = task.dependsOn.every((id) => tasksRef.current[id]?.completed);
      if (!allMet) return;
    }

    const wasCompleted = task?.completed ?? false;
    toggleTask(node.id);
    debouncedSave();

    if (!wasCompleted) {
      const now = Date.now();
      // Start dissolve: tile color transitions from gray → category color
      dissolvingRef.current.set(node.id, {
        startTime: now,
        fromColor: TASK_GRAY,
        toColor: node.color,
      });
      // Contained particle burst clipped to the tile
      particlesRef.current.push({
        id: node.id + now,
        cx: node.x! + node.w! / 2,
        cy: node.y! + node.h! / 2,
        tx: node.x!, ty: node.y!, tw: node.w!, th: node.h!,
        color: node.color,
        startTime: now,
      });
    }
  }, [findNodeAt, toggleTask]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const node = findNodeAt(e.clientX - rect.left, e.clientY - rect.top);
    if (node && tasksRef.current[node.id]) {
      setEditingRef.current(node.id);
    }
  }, [findNodeAt]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const node = findNodeAt(e.clientX - rect.left, e.clientY - rect.top);
    if (node && tasksRef.current[node.id]) {
      (containerRef.current as any).__pendingDragId = node.id;
    }
  }, [findNodeAt]);

  const handleDragStart = useCallback((e: React.DragEvent) => {
    const taskId = (containerRef.current as any)?.__pendingDragId;
    if (taskId) {
      setDraggedTask(taskId);
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', taskId);
    }
  }, [setDraggedTask]);

  const handleDragEnd = useCallback(() => setDraggedTask(null), [setDraggedTask]);
  const handleMouseLeave = useCallback(() => { hoveredIdRef.current = null; }, []);

  return (
    <div
      ref={containerRef}
      className="treemap-container"
      onMouseMove={handleMouseMove}
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
      onContextMenu={handleContextMenu}
      onMouseLeave={handleMouseLeave}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      draggable
    >
      {visibleTasks.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">&#x2B22;</div>
          <h3>No tasks here yet</h3>
          <p>
            {showTimelessPool
              ? 'Add categories and tasks to start building your task pool.'
              : activeBlockId
              ? 'Assign tasks from the pool to this block, or create new ones.'
              : 'Select a time block or view the task pool to get started.'}
          </p>
        </div>
      ) : (
        <canvas ref={canvasRef} style={{ width: size.w, height: size.h }} />
      )}
    </div>
  );
}

// Export treemap as PNG image
export function exportTreemapAsImage(): Promise<string | null> {
  const canvas = document.querySelector('.treemap-container canvas') as HTMLCanvasElement | null;
  if (!canvas) return Promise.resolve(null);
  return Promise.resolve(canvas.toDataURL('image/png'));
}
