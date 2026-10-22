export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'tamus:ui:theme:v1';

function systemTheme(): Theme {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function readStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    /* Fall back to the operating system preference. */
  }
  return systemTheme();
}

export function applyTheme(value: Theme) {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = value;
  document.documentElement.style.colorScheme = value;
  document.documentElement.style.backgroundColor = value === 'dark' ? '#14181f' : '';
}

export function saveTheme(value: Theme) {
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    /* Storage is optional. */
  }
}
