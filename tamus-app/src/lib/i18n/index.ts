import { derived, get, writable } from 'svelte/store';
import { formatCount, translate, type Locale, type Parameters, type CountNoun } from './catalog';
export type { Locale, Parameters } from './catalog';

const STORAGE_KEY = 'tamus:locale:v1';
const language = writable<Locale>('ru');
export const locale = { subscribe: language.subscribe };
export const t = derived(
  language,
  (value) => (message: string, params?: Parameters) => translate(value, message, params),
);
export const count = derived(
  language,
  (value) => (noun: CountNoun, amount: number) => formatCount(value, noun, amount),
);

export function setLocale(value: Locale) {
  if (value !== 'ru' && value !== 'en') return;
  language.set(value);
  if (typeof document !== 'undefined') document.documentElement.lang = value;
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    /* Storage is optional. */
  }
}
export function initializeLocale() {
  let value: Locale = 'ru';
  try {
    if (localStorage.getItem(STORAGE_KEY) === 'en') value = 'en';
  } catch {
    /* Use Russian. */
  }
  setLocale(value);
}
// For transports outside Svelte components (native dialogs).
export function currentLocale(): Locale {
  return get(language);
}
