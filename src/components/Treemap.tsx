import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { useStore } from '../store';
import { layoutTreemap } from '../utils/treemap';
import { TASK_GRAY } from '../utils/colors';
import { debouncedSave } from '../utils/persistence';
import type { TreemapNode, Task, Category } from '../types';

interface ParticleBurst {
  id: string;
  x: number;
  y: number;
  color: string;
  startTime: number;
}

export function Treemap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [particles, setParticles] = useState<ParticleBurst[]>([]);
  const [completingIds, setCompletingIds] = useState<Set<string>>(new Set());
  const [sparklePhase, setSparklePhase] = useState(0);

  const tasks = useStore((s) => s.tasks);
  const categories = useStore((s) => s.categories);
  const timeBlocks = useStore((s) => s.timeBlocks);
  const activeBlockId = useStore((s) => s.activeBlockId);
  const showTimelessPool = useStore((s) => s.showTimelessPool);
  const toggleTask = useStore((s) => s.toggleTask);
  const focusMode = useStore((s) => s.focusMode);
  const focusedCategoryId = useStore((s) => s.pomodoro.focusedCategoryId);
  const setDraggedTask = useStore((s) => s.setDraggedTask);

  // Idle sparkle animation
  useEffect(() => {
    const interval = setInterval(() => {
      setSparklePhase((p) => p + 1);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  // Determine which tasks to display
  const visibleTasks = useMemo(() => {
    if (showTimelessPool) {
      return Object.values(tasks);
    }
    if (activeBlockId && timeBlocks[activeBlockId]) {
      return timeBlocks[activeBlockId].taskIds
        .map((id) => tasks[id])
        .filter(Boolean);
    }
    return [];
  }, [tasks, timeBlocks, activeBlockId, showTimelessPool]);

  // Build treemap data with subcategory nesting
  const treemapData = useMemo(() => {
    const catMap = new Map<string, { category: Category; tasks: Task[] }>();

    visibleTasks.forEach((task) => {
      const cat = categories[task.categoryId];
      if (!cat) return;
      if (!catMap.has(cat.id)) {
        catMap.set(cat.id, { category: cat, tasks: [] });
      }
      catMap.get(cat.id)!.tasks.push(task);
    });

    const nodes: TreemapNode[] = [];
    catMap.forEach(({ category, tasks: catTasks }) => {
      // Group tasks by subcategory
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

      // Add subcategory groups
      subMap.forEach((subTasks, subId) => {
        const sub = category.subcategories.find((s) => s.id === subId);
        const subChildren: TreemapNode[] = subTasks.map((task) => ({
          id: task.id,
          name: task.title,
          value: task.weight,
          color: category.color,
          completed: task.completed,
          categoryId: category.id,
          subcategoryId: subId,
        }));

        children.push({
          id: subId,
          name: sub?.name || 'Unknown',
          value: subTasks.reduce((sum, t) => sum + t.weight, 0),
          color: category.color,
          completed: subTasks.every((t) => t.completed),
          children: subChildren,
          categoryId: category.id,
          depth: 1,
        });
      });

      // Add un-subcategorized tasks as direct children
      noSub.forEach((task) => {
        children.push({
          id: task.id,
          name: task.title,
          value: task.weight,
          color: category.color,
          completed: task.completed,
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
      if (entry) {
        setSize({ w: entry.contentRect.width, h: entry.contentRect.height });
      }
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Layout
  const layout = useMemo(() => {
    if (size.w === 0 || size.h === 0 || treemapData.length === 0) return [];
    return layoutTreemap(treemapData, size.w, size.h, 6);
  }, [treemapData, size]);

  // Collect all leaf task nodes (for hit-testing)
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

  // Canvas rendering
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = size.w * dpr;
    canvas.height = size.h * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, size.w, size.h);

    const isFocusing = focusMode && focusedCategoryId;

    // Draw category containers
    layout.forEach((catNode) => {
      const x = catNode.x!;
      const y = catNode.y!;
      const w = catNode.w!;
      const h = catNode.h!;

      const dimmed = isFocusing && catNode.id !== focusedCategoryId;
      const focused = isFocusing && catNode.id === focusedCategoryId;

      if (dimmed) {
        ctx.globalAlpha = 0.15;
      }

      // Category background
      ctx.fillStyle = catNode.color.replace('62%)', '12%)');
      ctx.beginPath();
      roundRect(ctx, x, y, w, h, 8);
      ctx.fill();

      // Category border — glow if focused
      if (focused) {
        ctx.shadowColor = catNode.color;
        ctx.shadowBlur = 12;
      }
      ctx.strokeStyle = focused
        ? catNode.color
        : catNode.color.replace('62%)', '25%)');
      ctx.lineWidth = focused ? 2 : 1;
      ctx.beginPath();
      roundRect(ctx, x, y, w, h, 8);
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Category label
      const headerH = Math.min(22, h * 0.25);
      ctx.fillStyle = catNode.color;
      ctx.font = '600 11px Inter, sans-serif';
      ctx.textBaseline = 'middle';
      const labelText = catNode.name.toUpperCase();
      if (w > 40 && h > 20) {
        ctx.fillText(labelText, x + 8, y + headerH / 2 + 2, w - 16);
      }

      // Draw children (tasks or subcategory groups)
      const drawLeafTile = (taskNode: TreemapNode) => {
        const tx = taskNode.x!;
        const ty = taskNode.y!;
        const tw = taskNode.w!;
        const th = taskNode.h!;

        if (tw < 2 || th < 2) return;

        const isHovered = hoveredId === taskNode.id;
        const isCompleting = completingIds.has(taskNode.id);

        // Tile fill
        if (taskNode.completed) {
          ctx.fillStyle = isHovered
            ? taskNode.color.replace('62%)', '70%)')
            : taskNode.color;
        } else {
          ctx.fillStyle = isHovered ? 'hsl(220, 10%, 28%)' : TASK_GRAY;
        }

        if (isCompleting) {
          const scale = 1.06;
          const dx = tw * (scale - 1) / 2;
          const dy = th * (scale - 1) / 2;
          ctx.beginPath();
          roundRect(ctx, tx - dx, ty - dy, tw + dx * 2, th + dy * 2, 4);
          ctx.fill();
        } else {
          ctx.beginPath();
          roundRect(ctx, tx, ty, tw, th, 4);
          ctx.fill();
        }

        // Tile border
        if (taskNode.completed) {
          ctx.strokeStyle = taskNode.color.replace('62%)', '45%)');
        } else {
          ctx.strokeStyle = isHovered ? 'hsl(220, 10%, 35%)' : 'hsl(220, 10%, 28%)';
        }
        ctx.lineWidth = 1;
        ctx.beginPath();
        roundRect(ctx, tx, ty, tw, th, 4);
        ctx.stroke();

        // Task label
        if (tw > 30 && th > 16) {
          ctx.fillStyle = taskNode.completed
            ? 'rgba(255,255,255,0.9)'
            : 'rgba(255,255,255,0.55)';
          ctx.font = '500 10px Inter, sans-serif';
          ctx.textBaseline = 'middle';
          const maxChars = Math.floor(tw / 6);
          let label = taskNode.name;
          if (label.length > maxChars) {
            label = label.substring(0, maxChars - 1) + '\u2026';
          }
          ctx.fillText(label, tx + 6, ty + th / 2, tw - 12);
        }

        // Completion checkmark
        if (taskNode.completed && tw > 20 && th > 20) {
          ctx.fillStyle = 'rgba(255,255,255,0.3)';
          ctx.font = '12px sans-serif';
          ctx.textBaseline = 'top';
          ctx.fillText('\u2713', tx + tw - 16, ty + 4);
        }

        // Idle sparkle on completed tiles
        if (taskNode.completed && tw > 15 && th > 15) {
          const sparkleHash = (taskNode.id.charCodeAt(0) + taskNode.id.charCodeAt(1)) % 5;
          if ((sparklePhase + sparkleHash) % 5 === 0) {
            const sx = tx + (tw * 0.3) + ((sparklePhase * 7) % (tw * 0.4));
            const sy = ty + (th * 0.3) + ((sparklePhase * 3) % (th * 0.4));
            ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
            ctx.beginPath();
            ctx.arc(sx, sy, 1.5, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      };

      if (catNode.children) {
        catNode.children.forEach((child) => {
          if (child.children && child.children.length > 0 && child.depth) {
            // Subcategory group — draw subtle label and recurse
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

      if (dimmed) {
        ctx.globalAlpha = 1;
      }
    });

    // Draw particles
    const now = Date.now();
    particles.forEach((p) => {
      const elapsed = now - p.startTime;
      const duration = 700;
      const progress = Math.min(elapsed / duration, 1);
      if (progress >= 1) return;

      const count = 12;
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2 + progress * 0.5;
        const dist = progress * 50;
        const px = p.x + Math.cos(angle) * dist;
        const py = p.y + Math.sin(angle) * dist;
        const psize = (1 - progress) * 3.5;
        ctx.fillStyle = p.color;
        ctx.globalAlpha = (1 - progress) * 0.8;
        ctx.beginPath();
        ctx.arc(px, py, psize, 0, Math.PI * 2);
        ctx.fill();
      }
      for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2 - progress;
        const dist = progress * 25;
        const px = p.x + Math.cos(angle) * dist;
        const py = p.y + Math.sin(angle) * dist;
        ctx.beginPath();
        ctx.arc(px, py, (1 - progress) * 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    });

    setParticles((prev) => prev.filter((p) => now - p.startTime < 700));
  }, [layout, size, hoveredId, particles, completingIds, focusMode, focusedCategoryId, sparklePhase]);

  // Animation loop for particles
  useEffect(() => {
    if (particles.length === 0) return;
    const id = requestAnimationFrame(() => {
      setParticles((p) => [...p]);
    });
    return () => cancelAnimationFrame(id);
  }, [particles]);

  // Hit testing using collected leaf nodes
  const findNodeAt = useCallback(
    (mx: number, my: number): TreemapNode | null => {
      for (const leaf of leafNodes) {
        if (
          mx >= leaf.x! &&
          mx <= leaf.x! + leaf.w! &&
          my >= leaf.y! &&
          my <= leaf.y! + leaf.h!
        ) {
          return leaf;
        }
      }
      return null;
    },
    [leafNodes]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const node = findNodeAt(e.clientX - rect.left, e.clientY - rect.top);
      setHoveredId(node?.id || null);
      if (containerRef.current) {
        containerRef.current.style.cursor = node ? 'pointer' : 'default';
      }
    },
    [findNodeAt]
  );

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const node = findNodeAt(mx, my);
      if (node) {
        toggleTask(node.id);
        debouncedSave();

        const task = tasks[node.id];
        if (task && !task.completed) {
          setParticles((prev) => [
            ...prev,
            {
              id: node.id + Date.now(),
              x: node.x! + node.w! / 2,
              y: node.y! + node.h! / 2,
              color: node.color,
              startTime: Date.now(),
            },
          ]);
          setCompletingIds((prev) => new Set(prev).add(node.id));
          setTimeout(() => {
            setCompletingIds((prev) => {
              const next = new Set(prev);
              next.delete(node.id);
              return next;
            });
          }, 400);
        }
      }
    },
    [findNodeAt, toggleTask, tasks]
  );

  // Drag start for tasks
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const node = findNodeAt(e.clientX - rect.left, e.clientY - rect.top);
      if (node && tasks[node.id]) {
        (containerRef.current as any).__pendingDragId = node.id;
      }
    },
    [findNodeAt, tasks]
  );

  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      const taskId = (containerRef.current as any)?.__pendingDragId;
      if (taskId) {
        setDraggedTask(taskId);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', taskId);
      }
    },
    [setDraggedTask]
  );

  const handleDragEnd = useCallback(() => {
    setDraggedTask(null);
  }, [setDraggedTask]);

  const handleMouseLeave = useCallback(() => {
    setHoveredId(null);
  }, []);

  if (visibleTasks.length === 0) {
    return (
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
    );
  }

  return (
    <div
      ref={containerRef}
      className="treemap-container"
      onMouseMove={handleMouseMove}
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
      onMouseLeave={handleMouseLeave}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      draggable
    >
      <canvas
        ref={canvasRef}
        style={{ width: size.w, height: size.h }}
      />
    </div>
  );
}

// Export treemap as PNG image
export function exportTreemapAsImage(): Promise<string | null> {
  const canvas = document.querySelector('.treemap-container canvas') as HTMLCanvasElement | null;
  if (!canvas) return Promise.resolve(null);
  return Promise.resolve(canvas.toDataURL('image/png'));
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
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
