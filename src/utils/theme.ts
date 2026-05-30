// Theme: 'dark' (default, cool tech-blue) or 'light' ("Printed Matter" — warm
// editorial paper/ink/claret with a serif display). Persisted in localStorage
// and reflected as `data-theme` on <html>, which the CSS token layer overrides.

export type Theme = 'dark' | 'light';

const THEME_KEY = 'blockout-theme';
const listeners = new Set<(t: Theme) => void>();

export function getTheme(): Theme {
  // Light ("Printed Matter") is the default; only an explicit 'dark' opts out.
  return (localStorage.getItem(THEME_KEY) as Theme) === 'dark' ? 'dark' : 'light';
}

/** Apply to <html> (no persistence). Call as early as possible to avoid a flash. */
export function applyTheme(t: Theme): void {
  document.documentElement.dataset.theme = t;
}

export function setTheme(t: Theme): void {
  localStorage.setItem(THEME_KEY, t);
  applyTheme(t);
  listeners.forEach((fn) => fn(t));
}

export function toggleTheme(): Theme {
  const next: Theme = getTheme() === 'dark' ? 'light' : 'dark';
  setTheme(next);
  return next;
}

export function onThemeChange(fn: (t: Theme) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** True when the canvas/treemap should render for light mode. */
export function isLightTheme(): boolean {
  return document.documentElement.dataset.theme === 'light';
}
