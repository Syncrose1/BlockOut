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

  const tasks = useStore((s) => s.tasks);
  const categories = useStore((s) => s.categories);
  const timeBlocks = useStore((s) => s.timeBlocks);
  const activeBlockId = useStore((s) => s.activeBlockId);
  const showTimelessPool = useStore((s) => s.showTimelessPool);
  const toggleTask = useStore((s) => s.toggleTask);

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

  // Build treemap data
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
      const children: TreemapNode[] = catTasks.map((task) => ({
        id: task.id,
        name: task.title,
        value: task.weight,
        color: category.color,
        completed: task.completed,
        categoryId: category.id,
      }));

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

    // Draw category containers
    layout.forEach((catNode) => {
      const x = catNode.x!;
      const y = catNode.y!;
      const w = catNode.w!;
      const h = catNode.h!;

      // Category background
      ctx.fillStyle = catNode.color.replace('62%)', '12%)');
      ctx.beginPath();
      roundRect(ctx, x, y, w, h, 8);
      ctx.fill();

      // Category border
      ctx.strokeStyle = catNode.color.replace('62%)', '25%)');
      ctx.lineWidth = 1;
      ctx.beginPath();
      roundRect(ctx, x, y, w, h, 8);
      ctx.stroke();

      // Category label
      const headerH = Math.min(22, h * 0.25);
      ctx.fillStyle = catNode.color;
      ctx.font = '600 11px Inter, sans-serif';
      ctx.textBaseline = 'middle';
      const labelText = catNode.name.toUpperCase();
      if (w > 40 && h > 20) {
        ctx.fillText(labelText, x + 8, y + headerH / 2 + 2, w - 16);
      }

      // Draw task tiles (children)
      if (catNode.children) {
        catNode.children.forEach((taskNode) => {
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
            // Animated scale effect — draw slightly larger
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
              label = label.substring(0, maxChars - 1) + '…';
            }
            ctx.fillText(label, tx + 6, ty + th / 2, tw - 12);
          }

          // Completion checkmark
          if (taskNode.completed && tw > 20 && th > 20) {
            ctx.fillStyle = 'rgba(255,255,255,0.3)';
            ctx.font = '12px sans-serif';
            ctx.textBaseline = 'top';
            ctx.fillText('✓', tx + tw - 16, ty + 4);
          }
        });
      }
    });

    // Draw particles
    const now = Date.now();
    particles.forEach((p) => {
      const elapsed = now - p.startTime;
      const duration = 600;
      const progress = Math.min(elapsed / duration, 1);
      if (progress >= 1) return;

      const count = 8;
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2;
        const dist = progress * 40;
        const px = p.x + Math.cos(angle) * dist;
        const py = p.y + Math.sin(angle) * dist;
        const size = (1 - progress) * 4;
        ctx.fillStyle = p.color;
        ctx.globalAlpha = 1 - progress;
        ctx.beginPath();
        ctx.arc(px, py, size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    });

    // Clean up expired particles
    setParticles((prev) => prev.filter((p) => now - p.startTime < 600));
  }, [layout, size, hoveredId, particles, completingIds]);

  // Animation loop for particles
  useEffect(() => {
    if (particles.length === 0) return;
    const id = requestAnimationFrame(() => {
      // Force re-render to animate particles
      setParticles((p) => [...p]);
    });
    return () => cancelAnimationFrame(id);
  }, [particles]);

  // Hit testing
  const findNodeAt = useCallback(
    (mx: number, my: number): TreemapNode | null => {
      for (const catNode of layout) {
        if (catNode.children) {
          for (const child of catNode.children) {
            if (
              mx >= child.x! &&
              mx <= child.x! + child.w! &&
              my >= child.y! &&
              my <= child.y! + child.h!
            ) {
              return child;
            }
          }
        }
      }
      return null;
    },
    [layout]
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
        // Toggle task
        toggleTask(node.id);
        debouncedSave();

        // If completing (was not completed), show particles
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
      onDoubleClick={handleDoubleClick}
      onMouseLeave={handleMouseLeave}
    >
      <canvas
        ref={canvasRef}
        style={{ width: size.w, height: size.h }}
      />
    </div>
  );
}

// Helper to draw rounded rectangles
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  r = Math.min(r, w / 2, h / 2);
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
