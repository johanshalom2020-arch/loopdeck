/**
 * Session-only registry of picked/dropped File objects.
 *
 * File handles cannot go into localStorage, so picked files live here for the
 * lifetime of the tab. When IndexedDB persistence is enabled the blob is
 * additionally written to IDB and rehydrated into object URLs on demand.
 */

const registry = new Map<string, File>();

export function registerFile(id: string, file: File): void {
  registry.set(id, file);
}

export function getRegisteredFile(id: string): File | null {
  return registry.get(id) ?? null;
}

export function unregisterFile(id: string): void {
  registry.delete(id);
}

export function hasRegisteredFile(id: string): boolean {
  return registry.has(id);
}
