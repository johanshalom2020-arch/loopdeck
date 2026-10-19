/**
 * Optional IndexedDB persistence for local file blobs (idb-keyval).
 * Every function fails soft: storage quota errors or private-mode rejections
 * must never break playback.
 */

import { del, get, set } from "idb-keyval";

const keyFor = (id: string): string => `loopdeck:file:${id}`;

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof indexedDB !== "undefined";
}

export async function saveLocalFileToIdb(id: string, blob: Blob): Promise<boolean> {
  if (!isBrowser()) return false;
  try {
    await set(keyFor(id), blob);
    return true;
  } catch {
    return false;
  }
}

export async function loadLocalFileFromIdb(id: string): Promise<Blob | null> {
  if (!isBrowser()) return null;
  try {
    const value = await get<Blob>(keyFor(id));
    return value ?? null;
  } catch {
    return null;
  }
}

export async function removeLocalFileFromIdb(id: string): Promise<void> {
  if (!isBrowser()) return;
  try {
    await del(keyFor(id));
  } catch {
    // Best-effort cleanup only.
  }
}
