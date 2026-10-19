/**
 * Turns picked/dropped Files into library items, wiring the session file
 * registry and optional IndexedDB persistence.
 */

import { saveLocalFileToIdb } from "@/lib/files/idb";
import { isSupportedMediaFile, mediaTypeForFile } from "@/lib/files/mediaFiles";
import { registerFile, unregisterFile } from "@/lib/files/registry";
import type { LocalFileItem } from "@/lib/types";
import { createId } from "@/lib/utils/id";
import { useLibraryStore } from "@/store/library";
import { usePlayerStore } from "@/store/player";
import { useSettingsStore } from "@/store/settings";

export interface IngestResult {
  added: number;
  duplicates: number;
  rejected: number;
}

export async function ingestLocalFiles(fileList: Iterable<File>): Promise<IngestResult> {
  let rejected = 0;
  const candidates: File[] = [];
  for (const file of fileList) {
    if (isSupportedMediaFile(file)) candidates.push(file);
    else rejected += 1;
  }

  const items: LocalFileItem[] = candidates.map((file) => ({
    id: createId(),
    kind: "local-file",
    fileName: file.name,
    mediaType: mediaTypeForFile(file),
    mimeType: file.type,
    size: file.size,
    storedInIdb: false,
    customTitle: null,
    addedAt: Date.now(),
  }));
  const fileById = new Map<string, File>();
  items.forEach((item, index) => {
    const file = candidates[index];
    if (file) fileById.set(item.id, file);
  });

  for (const [id, file] of fileById) {
    registerFile(id, file);
  }

  const { added, duplicates } = useLibraryStore.getState().addItems(items);

  // Drop registry entries for items rejected as duplicates.
  const addedIds = new Set(added.map((item) => item.id));
  for (const item of items) {
    if (!addedIds.has(item.id)) unregisterFile(item.id);
  }

  if (useSettingsStore.getState().persistLocalFiles) {
    for (const item of added) {
      if (item.kind !== "local-file") continue;
      const file = fileById.get(item.id);
      if (!file) continue;
      const ok = await saveLocalFileToIdb(item.id, file);
      if (ok) {
        useLibraryStore.getState().markStoredInIdb(item.id, true);
      } else {
        usePlayerStore
          .getState()
          .pushToast("warning", `“${item.fileName}” could not be saved to IndexedDB (quota reached?).`);
      }
    }
  }

  return { added: added.length, duplicates, rejected };
}
