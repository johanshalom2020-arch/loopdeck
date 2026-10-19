/**
 * The media library: a flat, reorderable list of items persisted to
 * localStorage. Includes JSON import/export with shape validation.
 */

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  displayTitle,
  itemKey,
  type LibraryItem,
  type LocalMediaType,
} from "@/lib/types";
import { createId } from "@/lib/utils/id";

export interface AddItemsResult {
  added: LibraryItem[];
  duplicates: number;
}

function arrayMove<T>(list: T[], from: number, to: number): T[] {
  const next = [...list];
  const [moved] = next.splice(from, 1);
  if (moved === undefined) return list;
  next.splice(clampIndex(to, next.length), 0, moved);
  return next;
}

function clampIndex(index: number, length: number): number {
  return Math.max(0, Math.min(index, length));
}

export interface LibraryState {
  items: LibraryItem[];

  addItems(incoming: LibraryItem[]): AddItemsResult;
  updateItem(id: string, patch: Partial<LibraryItem>): void;
  removeItem(id: string): void;
  renameItem(id: string, title: string): void;
  moveItem(fromIndex: number, toIndex: number): void;
  markStoredInIdb(id: string, stored: boolean): void;
  clearLibrary(): void;
  importJson(text: string): { added: number; skipped: number };
}

export const useLibraryStore = create<LibraryState>()(
  persist(
    (set, get) => ({
      items: [],

      addItems: (incoming) => {
        const existing = new Set(get().items.map(itemKey));
        const added: LibraryItem[] = [];
        let duplicates = 0;
        for (const item of incoming) {
          const key = itemKey(item);
          if (existing.has(key)) {
            duplicates += 1;
            continue;
          }
          existing.add(key);
          added.push(item);
        }
        if (added.length > 0) {
          set((s) => ({ items: [...added, ...s.items] }));
        }
        return { added, duplicates };
      },

      updateItem: (id, patch) =>
        set((s) => ({
          items: s.items.map((item) => (item.id === id ? ({ ...item, ...patch } as LibraryItem) : item)),
        })),

      removeItem: (id) => set((s) => ({ items: s.items.filter((item) => item.id !== id) })),

      renameItem: (id, title) =>
        set((s) => ({
          items: s.items.map((item) =>
            item.id === id ? { ...item, customTitle: title.trim() === "" ? null : title.trim() } : item,
          ),
        })),

      moveItem: (fromIndex, toIndex) =>
        set((s) => ({ items: arrayMove(s.items, fromIndex, toIndex) })),

      markStoredInIdb: (id, stored) =>
        set((s) => ({
          items: s.items.map((item) =>
            item.id === id && item.kind === "local-file" ? { ...item, storedInIdb: stored } : item,
          ),
        })),

      clearLibrary: () => set({ items: [] }),

      importJson: (text) => {
        const { items: parsed, invalid } = parseLibraryJsonDetailed(text);
        if (parsed.length === 0) return { added: 0, skipped: invalid };
        const { added, duplicates } = get().addItems(parsed);
        return { added: added.length, skipped: duplicates + invalid };
      },
    }),
    {
      name: "loopdeck:library",
      storage: createJSONStorage(() => localStorage),
      version: 1,
    },
  ),
);

// ------------------------------------------------------------ JSON (de)serial

interface LibraryExportFile {
  app: "loopdeck";
  version: 1;
  exportedAt: string;
  items: LibraryItem[];
}

export function serializeLibrary(items: LibraryItem[]): string {
  const payload: LibraryExportFile = {
    app: "loopdeck",
    version: 1,
    exportedAt: new Date().toISOString(),
    items,
  };
  return JSON.stringify(payload, null, 2);
}

function str(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function optStr(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function num(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Validates an arbitrary JSON payload, returning the well-formed subset. */
export function parseLibraryJson(text: string): LibraryItem[] {
  return parseLibraryJsonDetailed(text).items;
}

export interface ParsedLibraryFile {
  items: LibraryItem[];
  invalid: number;
}

function parseLibraryJsonDetailed(text: string): ParsedLibraryFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { items: [], invalid: 0 };
  }

  const candidateItems: unknown[] = Array.isArray(raw)
    ? raw
    : typeof raw === "object" && raw !== null && Array.isArray((raw as { items?: unknown }).items)
      ? ((raw as { items: unknown[] }).items)
      : [];

  const out: LibraryItem[] = [];
  let invalid = 0;
  for (const candidate of candidateItems) {
    if (typeof candidate !== "object" || candidate === null) {
      invalid += 1;
      continue;
    }
    const o = candidate as Record<string, unknown>;
    const base = {
      id: str(o.id) ? o.id : createId(),
      customTitle: optStr(o.customTitle),
      addedAt: num(o.addedAt) ? o.addedAt : Date.now(),
    };
    if (o.kind === "youtube-video" && str(o.videoId) && str(o.title)) {
      out.push({
        ...base,
        kind: "youtube-video",
        videoId: o.videoId,
        title: o.title,
        author: optStr(o.author),
        thumbnail: str(o.thumbnail) ? o.thumbnail : "",
      });
    } else if (o.kind === "youtube-playlist" && str(o.playlistId)) {
      out.push({
        ...base,
        kind: "youtube-playlist",
        playlistId: o.playlistId,
        title: str(o.title) ? o.title : "YouTube playlist",
        author: optStr(o.author),
        thumbnail: optStr(o.thumbnail),
      });
    } else if (o.kind === "local-file" && str(o.fileName)) {
      out.push({
        ...base,
        kind: "local-file",
        fileName: o.fileName,
        mediaType: o.mediaType === "audio" ? ("audio" as LocalMediaType) : ("video" as LocalMediaType),
        mimeType: str(o.mimeType) ? o.mimeType : "",
        size: num(o.size) ? o.size : 0,
        storedInIdb: false, // blobs never travel inside JSON exports
      });
    } else {
      invalid += 1;
    }
  }
  return { items: out, invalid };
}

/** Convenience used by tests and devtools. */
export function libraryTitles(items: LibraryItem[]): string[] {
  return items.map(displayTitle);
}
