import { currentLocale } from '$lib/i18n';
import { invoke, isTauri } from '@tauri-apps/api/core';

export const desktop = isTauri();

export interface RamusFile {
  name: string;
  data: Uint8Array;
}

export async function readFile(): Promise<RamusFile | null> {
  if (!desktop) return null;
  const result = await invoke<{ name: string; data: number[] } | null>('ramus_read_file', {
    locale: currentLocale(),
  });
  return result ? { name: result.name, data: new Uint8Array(result.data) } : null;
}

export async function writeFile(data: Uint8Array, fileName: string): Promise<string | null> {
  if (desktop) {
    return invoke<string | null>('ramus_write_file', {
      data: Array.from(data),
      fileName,
      locale: currentLocale(),
    });
  }
  const blob = new Blob([data as unknown as BlobPart], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return fileName;
}
