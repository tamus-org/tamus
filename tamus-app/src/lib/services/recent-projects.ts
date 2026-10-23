import { validateProject, type Project, type Snapshot } from '$lib/domain/project';

export type RecentNotation = 'IDEF0' | 'DFD' | 'mixed' | 'empty';

export interface RecentProject {
  id: string;
  projectId: string;
  name: string;
  path: string | null;
  notation: RecentNotation;
  updatedAt: number;
}

const LIST_KEY = 'tamus:recent-projects:v1';
const CACHE_PREFIX = 'tamus:recent-project:v1:';
const LIMIT = 6;
const NOTATIONS: RecentNotation[] = ['IDEF0', 'DFD', 'mixed', 'empty'];

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function notationOf(project: Project): RecentNotation {
  const notations = new Set(project.models.map((model) => model.notation));
  if (notations.size === 1) return [...notations][0] as 'IDEF0' | 'DFD';
  return notations.size > 1 ? 'mixed' : 'empty';
}

function isRecent(value: unknown): value is RecentProject {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === 'string' &&
    !!item.id &&
    typeof item.projectId === 'string' &&
    !!item.projectId &&
    typeof item.name === 'string' &&
    (item.path === null || typeof item.path === 'string') &&
    typeof item.updatedAt === 'number' &&
    Number.isFinite(item.updatedAt) &&
    NOTATIONS.includes(item.notation as RecentNotation)
  );
}

function cacheKey(id: string) {
  return `${CACHE_PREFIX}${id}`;
}

function writeList(store: Storage, entries: RecentProject[]) {
  try {
    store.setItem(LIST_KEY, JSON.stringify(entries));
  } catch {
    /* A full storage must not block project creation or opening. */
  }
}

function removeCache(store: Storage, id: string) {
  try {
    store.removeItem(cacheKey(id));
  } catch {
    /* Storage is optional. */
  }
}

export function readRecentProjects(): RecentProject[] {
  const store = storage();
  if (!store) return [];
  try {
    const parsed: unknown = JSON.parse(store.getItem(LIST_KEY) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(isRecent)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, LIMIT);
  } catch {
    return [];
  }
}

export function rememberProject(snapshot: Snapshot): RecentProject[] {
  const store = storage();
  if (!store) return [];
  const project = snapshot.project;
  const id = snapshot.path ?? `local:${project.id}`;
  const previous = readRecentProjects();
  const entry: RecentProject = {
    id,
    projectId: project.id,
    name: project.name,
    path: snapshot.path,
    notation: notationOf(project),
    updatedAt: Date.now(),
  };
  for (const item of previous) {
    if (item.id === id || (item.projectId === project.id && (item.path === null || !entry.path)))
      removeCache(store, item.id);
  }
  const entries = [
    entry,
    ...previous.filter(
      (item) =>
        item.id !== id &&
        !(item.projectId === project.id && (item.path === null || !snapshot.path)),
    ),
  ].slice(0, LIMIT);
  try {
    if (snapshot.path) store.removeItem(cacheKey(id));
    else store.setItem(cacheKey(id), JSON.stringify(project));
  } catch {
    /* The file still opens from its path in desktop mode. */
  }
  writeList(store, entries);
  return entries;
}

export function loadRecentProject(entry: RecentProject): Project | null {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(cacheKey(entry.id));
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    validateProject(value);
    return value;
  } catch {
    return null;
  }
}

export function removeRecentProject(id: string): RecentProject[] {
  const store = storage();
  if (!store) return [];
  const entries = readRecentProjects().filter((entry) => entry.id !== id);
  removeCache(store, id);
  writeList(store, entries);
  return entries;
}
