export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'tamus:ui:theme:v1';

export function readStoredTheme(): Theme {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
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
