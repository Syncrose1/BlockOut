import type { TreemapNode } from '../types';

// Squarified treemap layout algorithm
// Attempt to produce tiles with aspect ratios as close to 1:1 as possible

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function worst(row: number[], w: number, totalArea: number): number {
  if (row.length === 0) return Infinity;
  const s = row.reduce((a, b) => a + b, 0);
  const rMax = Math.max(...row);
  const rMin = Math.min(...row);
  const s2 = s * s;
  const w2 = w * w;
  return Math.max((w2 * rMax) / s2, s2 / (w2 * rMin));
}

function layoutRow(row: number[], indices: number[], rect: Rect, isHorizontal: boolean): Rect[] {
  const totalRowArea = row.reduce((a, b) => a + b, 0);
  const results: Rect[] = [];

  if (isHorizontal) {
    const rowWidth = totalRowArea / rect.h;
    let y = rect.y;
    for (let i = 0; i < row.length; i++) {
      const h = row[i] / rowWidth;
      results.push({ x: rect.x, y, w: rowWidth, h });
      y += h;
    }
  } else {
    const rowHeight = totalRowArea / rect.w;
    let x = rect.x;
    for (let i = 0; i < row.length; i++) {
      const w = row[i] / rowHeight;
      results.push({ x, y: rect.y, w, h: rowHeight });
      x += w;
    }
  }

  return results;
}

function getRemainingRect(row: number[], rect: Rect, isHorizontal: boolean): Rect {
  const totalRowArea = row.reduce((a, b) => a + b, 0);

  if (isHorizontal) {
    const rowWidth = totalRowArea / rect.h;
    return {
      x: rect.x + rowWidth,
      y: rect.y,
      w: rect.w - rowWidth,
      h: rect.h,
    };
  } else {
    const rowHeight = totalRowArea / rect.w;
    return {
      x: rect.x,
      y: rect.y + rowHeight,
      w: rect.w,
      h: rect.h - rowHeight,
    };
  }
}

export function squarify(
  areas: number[],
  rect: Rect
): Rect[] {
  if (areas.length === 0) return [];
  if (areas.length === 1) return [rect];

  const totalArea = areas.reduce((a, b) => a + b, 0);
  const scale = (rect.w * rect.h) / totalArea;
  const scaledAreas = areas.map((a) => a * scale);

  const results: Rect[] = new Array(areas.length);
  const indices = scaledAreas.map((_, i) => i);

  // Sort by descending area for better layout
  indices.sort((a, b) => scaledAreas[b] - scaledAreas[a]);

  let currentRect = { ...rect };
  let row: number[] = [];
  let rowIndices: number[] = [];
  let remaining = [...indices];

  while (remaining.length > 0) {
    const isHorizontal = currentRect.w > currentRect.h;
    const shorter = isHorizontal ? currentRect.h : currentRect.w;

    const nextIdx = remaining[0];
    const nextArea = scaledAreas[nextIdx];

    const testRow = [...row, nextArea];
    if (row.length === 0 || worst(testRow, shorter, 0) <= worst(row, shorter, 0)) {
      row.push(nextArea);
      rowIndices.push(nextIdx);
      remaining = remaining.slice(1);
    } else {
      // Lay out current row
      const rects = layoutRow(row, rowIndices, currentRect, isHorizontal);
      for (let i = 0; i < rects.length; i++) {
        results[rowIndices[i]] = rects[i];
      }
      currentRect = getRemainingRect(row, currentRect, isHorizontal);
      row = [];
      rowIndices = [];
    }
  }

  // Lay out final row
  if (row.length > 0) {
    const isHorizontal = currentRect.w > currentRect.h;
    const rects = layoutRow(row, rowIndices, currentRect, isHorizontal);
    for (let i = 0; i < rects.length; i++) {
      results[rowIndices[i]] = rects[i];
    }
  }

  return results;
}

// Build treemap layout for a list of nodes
export function layoutTreemap(
  nodes: TreemapNode[],
  width: number,
  height: number,
  padding: number = 4
): TreemapNode[] {
  if (nodes.length === 0) return [];

  const areas = nodes.map((n) => Math.max(n.value, 0.1));
  const rects = squarify(areas, { x: 0, y: 0, w: width, h: height });

  return nodes.map((node, i) => {
    const r = rects[i];
    // Round to integer pixels for crisp rendering
    const result: TreemapNode = {
      ...node,
      x: Math.round(r.x + padding / 2),
      y: Math.round(r.y + padding / 2),
      w: Math.round(r.w - padding),
      h: Math.round(r.h - padding),
    };

    // Recursively layout children within this tile
    if (node.children && node.children.length > 0) {
      const innerPad = 2;
      const headerHeight = Math.min(24, result.h! * 0.25);
      result.children = layoutTreemap(
        node.children,
        result.w! - innerPad * 2,
        result.h! - headerHeight - innerPad * 2,
        3
      ).map((child) => ({
        ...child,
        x: Math.round(child.x! + result.x! + innerPad),
        y: Math.round(child.y! + result.y! + headerHeight + innerPad),
      }));
    }

    return result;
  });
}
