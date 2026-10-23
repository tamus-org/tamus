import { currentLocale } from '$lib/i18n';
import { invoke, isTauri } from '@tauri-apps/api/core';
import {
  clone,
  createExample,
  reduceProject,
  validateProject,
  type Command,
  type Project,
  type Snapshot,
} from '$lib/domain/project';

export const desktop = isTauri();
const STORAGE_KEY = 'tamus:preview-project:v1';
let previewProject = createExample();
let saved = clone(previewProject);
let revision = 0;
let undo: Project[] = [];
let redo: Project[] = [];

function snapshot(): Snapshot {
  return {
    project: clone(previewProject),
    revision: String(revision),
    path: null,
    dirty: JSON.stringify(previewProject) !== JSON.stringify(saved),
    canUndo: undo.length > 0,
    canRedo: redo.length > 0,
  };
}

export async function initialize(): Promise<Snapshot> {
  if (desktop) return invoke('project_initialize', { project: createExample() });
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const value: unknown = JSON.parse(raw);
      validateProject(value);
      previewProject = value;
    }
  } catch {
    /* Corrupt browser preview data must not prevent opening the application. */
  }
  saved = clone(previewProject);
  return snapshot();
}

export async function execute(command: Command, expectedRevision: string): Promise<Snapshot> {
  if (desktop) return invoke('project_execute', { command, expectedRevision });
  if (String(revision) !== expectedRevision) throw new Error('Проект уже изменён.');
  const next = reduceProject(previewProject, command);
  if (JSON.stringify(next) !== JSON.stringify(previewProject)) {
    undo.push(clone(previewProject));
    if (undo.length > 100) undo.shift();
    previewProject = next;
    redo = [];
    revision++;
  }
  return snapshot();
}

export async function replace(project: Project, expectedRevision: string): Promise<Snapshot> {
  if (desktop) return invoke('project_replace', { project, expectedRevision });
  if (String(revision) !== expectedRevision) throw new Error('Проект уже изменён.');
  validateProject(project);
  previewProject = clone(project);
  saved = clone(project);
  undo = [];
  redo = [];
  revision++;
  return snapshot();
}

export async function history(
  direction: 'undo' | 'redo',
  expectedRevision: string,
): Promise<Snapshot> {
  if (desktop) return invoke(`project_${direction}`, { expectedRevision });
  if (String(revision) !== expectedRevision) throw new Error('Проект уже изменён.');
  const source = direction === 'undo' ? undo : redo;
  const target = direction === 'undo' ? redo : undo;
  const next = source.pop();
  if (next) {
    target.push(previewProject);
    previewProject = next;
    revision++;
  }
  return snapshot();
}

export async function open(expectedRevision: string): Promise<Snapshot | null> {
  if (desktop) return invoke('project_open', { expectedRevision, locale: currentLocale() });
  // The browser picker is handled by the page's accessible file input.
  return null;
}

export async function openPath(path: string, expectedRevision: string): Promise<Snapshot | null> {
  if (!desktop) return null;
  return invoke('project_open_path', { expectedRevision, path });
}

export async function save(expectedRevision: string, saveAs = false): Promise<Snapshot | null> {
  if (desktop) return invoke('project_save', { expectedRevision, saveAs, locale: currentLocale() });
  const json = JSON.stringify(previewProject, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  if (blob.size > 16 * 1024 * 1024) throw new Error('Размер проекта превышает 16 МБ.');
  try {
    localStorage.setItem(STORAGE_KEY, json);
  } catch {
    /* Export still works if browser storage is full. */
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${previewProject.name}.tamus.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  saved = clone(previewProject);
  return snapshot();
}
