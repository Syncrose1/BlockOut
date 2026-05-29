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

function light(): boolean {
  return typeof document !== 'undefined' && document.documentElement.dataset.theme === 'light';
}

/**
 * Incomplete tasks render as a MUTED tint of their category hue (dark in the
 * dark theme, a light paper-tint in the light theme) — so a tile's category is
 * legible while completed tiles (full saturated colour) stay dramatically more
 * vivid (the "fills with colour" reward).
 */
export function incompleteTint(color: string): string {
  const h = hueOf(color);
  return light() ? `hsl(${h}, 42%, 90%)` : `hsl(${h}, 20%, 16%)`;
}
export function incompleteTintHover(color: string): string {
  const h = hueOf(color);
  return light() ? `hsl(${h}, 48%, 85%)` : `hsl(${h}, 22%, 21%)`;
}
export function incompleteBorder(color: string): string {
  const h = hueOf(color);
  return light() ? `hsl(${h}, 34%, 76%)` : `hsl(${h}, 22%, 27%)`;
}

// ── Category-container transforms (canvas), theme-aware ──
/** Category frame fill. */
export function categoryFill(color: string): string {
  const h = hueOf(color);
  return light() ? `hsl(${h}, 40%, 93%)` : color.replace('62%)', '12%)');
}
/** Category frame border. */
export function categoryBorder(color: string): string {
  const h = hueOf(color);
  return light() ? `hsl(${h}, 34%, 72%)` : color.replace('62%)', '25%)');
}
/** Subcategory box fill. */
export function subcatFill(color: string): string {
  const h = hueOf(color);
  return light() ? `hsl(${h}, 38%, 88%)` : color.replace('62%)', '16%)');
}
/** Subcategory box border. */
export function subcatBorder(color: string): string {
  const h = hueOf(color);
  return light() ? `hsl(${h}, 32%, 74%)` : color.replace('62%)', '20%)');
}
/** Header / label text drawn in the category hue — darken for paper contrast. */
export function categoryInk(color: string): string {
  const h = hueOf(color);
  return light() ? `hsl(${h}, 55%, 38%)` : color;
}
/** Task-label ink: white-on-dark vs ink-on-paper. `active` = completed (always
 *  sits on a saturated tile, so light text reads in both themes). */
export function taskLabelInk(activeOrCompleted: boolean): string {
  if (activeOrCompleted) return 'rgba(255,255,255,0.95)';
  return light() ? 'rgba(36,34,28,0.78)' : 'rgba(255,255,255,0.82)';
}
