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
