// Perceptually uniform color palette using OKLCH-inspired hues
// These are vibrant, distinguishable, and look great on dark backgrounds

const PALETTE_HUES = [
  210, // blue
  160, // teal
  280, // purple
  340, // pink/rose
  30,  // orange
  120, // green
  50,  // amber
  190, // cyan
  250, // indigo
  0,   // red
  90,  // lime
  310, // magenta
];

export function getCategoryColor(index: number): string {
  const hue = PALETTE_HUES[index % PALETTE_HUES.length];
  return `hsl(${hue}, 72%, 62%)`;
}

export function getCategoryColorDim(index: number): string {
  const hue = PALETTE_HUES[index % PALETTE_HUES.length];
  return `hsl(${hue}, 40%, 25%)`;
}

export function getCategoryColorGlow(index: number): string {
  const hue = PALETTE_HUES[index % PALETTE_HUES.length];
  return `hsl(${hue}, 80%, 50%)`;
}

export function colorFromHsl(color: string, opacity: number): string {
  return color.replace(')', `, ${opacity})`).replace('hsl(', 'hsla(');
}

// For task tiles: gray when incomplete, category color when done
export const TASK_GRAY = 'hsl(220, 10%, 22%)';
export const TASK_GRAY_HOVER = 'hsl(220, 10%, 28%)';
export const TASK_GRAY_BORDER = 'hsl(220, 10%, 30%)';

/** Extract the hue from an `hsl(H, S%, L%)` string (fallback 220). */
function hueOf(color: string): string {
  const m = color.match(/hsl\(\s*([\d.]+)/);
  return m ? m[1] : '220';
}

/**
 * Incomplete tasks are rendered as a DARK, MUTED tint of their category hue
 * rather than neutral grey — so a tile's category is legible at a glance and
 * the board doesn't read as dead grey, while completed tiles (full saturated
 * colour) stay dramatically more vivid (the "fills with colour" reward).
 */
export function incompleteTint(color: string): string {
  return `hsl(${hueOf(color)}, 20%, 16%)`;
}
export function incompleteTintHover(color: string): string {
  return `hsl(${hueOf(color)}, 22%, 21%)`;
}
export function incompleteBorder(color: string): string {
  return `hsl(${hueOf(color)}, 22%, 27%)`;
}
