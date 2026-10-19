"use client";

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Download, Link2, ListMusic, Loader2, Search, Upload, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { LibraryRow } from "@/components/LibraryRow";
import { FILE_INPUT_ACCEPT } from "@/lib/files/mediaFiles";
import { ingestLocalFiles } from "@/lib/files/ingest";
import { displayAuthor, displayTitle, type YouTubePlaylistItem, type YouTubeVideoItem } from "@/lib/types";
import { createId } from "@/lib/utils/id";
import { fetchOEmbedInfo } from "@/lib/youtube/oembed";
import { parseYouTubeUrl, youtubeThumbnailUrl, youtubeWatchUrl } from "@/lib/youtube/parseYouTubeUrl";
import { serializeLibrary, useLibraryStore } from "@/store/library";
import { usePlayerStore } from "@/store/player";

// ------------------------------------------------------------- URL quick add

function AddUrlForm() {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const submit = () => {
    const input = value.trim();
    setError(null);
    if (!input) return;

    const parsed = parseYouTubeUrl(input);
    if (!parsed) {
      setError("Not a supported YouTube link. Paste a video or playlist URL.");
      return;
    }

    if (parsed.type === "playlist") {
      const item: YouTubePlaylistItem = {
        id: createId(),
        kind: "youtube-playlist",
        playlistId: parsed.id,
        title: "YouTube playlist",
        author: null,
        thumbnail: null,
        customTitle: null,
        addedAt: Date.now(),
      };
      const { added } = useLibraryStore.getState().addItems([item]);
      if (added.length === 0) {
        setError("This playlist is already in your library.");
        return;
      }
      setValue("");
      usePlayerStore.getState().pushToast("info", "Playlist added — its videos resolve on first play.");
      return;
    }

    const item: YouTubeVideoItem = {
      id: createId(),
      kind: "youtube-video",
      videoId: parsed.id,
      title: `YouTube video · ${parsed.id}`,
      author: null,
      thumbnail: youtubeThumbnailUrl(parsed.id),
      customTitle: null,
      addedAt: Date.now(),
    };
    const { added } = useLibraryStore.getState().addItems([item]);
    if (added.length === 0) {
      setError("This video is already in your library.");
      return;
    }
    setValue("");

    // Resolve title/author via oEmbed (no API key). Failure keeps fallback title.
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setResolving(true);
    void fetchOEmbedInfo(youtubeWatchUrl(parsed.id), controller.signal)
      .then((info) => {
        if (controller.signal.aborted || !info) return;
        useLibraryStore.getState().updateItem(item.id, { title: info.title, author: info.author });
      })
      .finally(() => {
        if (!controller.signal.aborted) setResolving(false);
      });
  };

  return (
    <form
      className="space-y-1.5"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Link2 size={14} aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 fg-faint" />
          <input
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              if (error) setError(null);
            }}
            aria-label="Paste a YouTube URL"
            placeholder="Paste a YouTube video or playlist URL…"
            spellCheck={false}
            className="h-9 w-full rounded-lg border bd-soft bg-app pl-8 pr-8 text-sm fg-base placeholder:fg-faint focus:border-accent focus:outline-none"
          />
          {resolving && (
            <Loader2 size={14} aria-hidden className="absolute right-2.5 top-1/2 -translate-y-1/2 animate-spin fg-faint" />
          )}
        </div>
        <button type="submit" className="accent-btn h-9 px-3.5" disabled={value.trim() === ""}>
          Add
        </button>
      </div>
      {error && (
        <p role="alert" className="text-xs fg-danger">
          {error}
        </p>
      )}
    </form>
  );
}

// ------------------------------------------------------------- file actions

function LibraryActions() {
  const importRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);

  const onExport = () => {
    const items = useLibraryStore.getState().items;
    const blob = new Blob([serializeLibrary(items)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "loopdeck-library.json";
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    usePlayerStore.getState().pushToast("info", `Exported ${items.length} item${items.length === 1 ? "" : "s"}.`);
  };

  const onImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const text = await file.text();
    const { added, skipped } = useLibraryStore.getState().importJson(text);
    if (added === 0 && skipped === 0) {
      usePlayerStore.getState().pushToast("warning", "No importable items found in that file.");
    } else {
      usePlayerStore
        .getState()
        .pushToast("info", `Imported ${added} item${added === 1 ? "" : "s"}${skipped > 0 ? `, skipped ${skipped}` : ""}.`);
    }
  };

  const onUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files ? Array.from(event.target.files) : [];
    event.target.value = "";
    if (files.length === 0) return;
    const result = await ingestLocalFiles(files);
    const push = usePlayerStore.getState().pushToast;
    if (result.added > 0) push("info", `Added ${result.added} local file${result.added === 1 ? "" : "s"}.`);
    if (result.duplicates > 0) push("warning", `${result.duplicates} duplicate${result.duplicates === 1 ? "" : "s"} skipped.`);
    if (result.rejected > 0) push("warning", `${result.rejected} unsupported file${result.rejected === 1 ? "" : "s"} ignored.`);
  };

  return (
    <div className="flex items-center gap-1.5">
      <button type="button" className="ghost-btn flex-1" onClick={() => uploadRef.current?.click()}>
        <Upload size={14} aria-hidden /> Files
      </button>
      <button type="button" className="ghost-btn flex-1" onClick={() => importRef.current?.click()} title="Import library JSON">
        <Download size={14} aria-hidden /> Import
      </button>
      <button type="button" className="ghost-btn flex-1" onClick={onExport} title="Export library as JSON">
        <Upload size={14} aria-hidden className="rotate-180" /> Export
      </button>
      <input ref={importRef} type="file" accept="application/json,.json" className="hidden" aria-hidden onChange={onImport} />
      <input ref={uploadRef} type="file" accept={FILE_INPUT_ACCEPT} multiple className="hidden" aria-hidden onChange={onUpload} />
    </div>
  );
}

// ------------------------------------------------------------------- panel

export function LibraryPanel() {
  const [query, setQuery] = useState("");
  const items = useLibraryStore((s) => s.items);
  const setLibraryOpen = usePlayerStore((s) => s.setLibraryOpen);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (item) =>
        displayTitle(item).toLowerCase().includes(q) ||
        (displayAuthor(item) ?? "").toLowerCase().includes(q),
    );
  }, [items, query]);

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const all = useLibraryStore.getState().items;
    const from = all.findIndex((item) => item.id === active.id);
    const to = all.findIndex((item) => item.id === over.id);
    if (from >= 0 && to >= 0) useLibraryStore.getState().moveItem(from, to);
  };

  return (
    <div className="flex h-full flex-col" onClickCapture={(e) => {
      // Close the mobile drawer when a row is played.
      if ((e.target as HTMLElement).closest("[data-row-play]")) setLibraryOpen(false);
    }}>
      <div className="space-y-3 border-b bd-soft p-4">
        <AddUrlForm />
        <LibraryActions />
        <div className="relative">
          <Search size={14} aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 fg-faint" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Filter library"
            placeholder="Filter library…"
            className="h-9 w-full rounded-lg border bd-soft bg-app pl-8 pr-8 text-sm fg-base placeholder:fg-faint focus:border-accent focus:outline-none"
          />
          {query !== "" && (
            <button
              type="button"
              aria-label="Clear filter"
              className="absolute right-2 top-1/2 -translate-y-1/2 fg-faint hover:fg-base"
              onClick={() => setQuery("")}
            >
              <X size={14} aria-hidden />
            </button>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2" data-lenis-prevent>
        {filtered.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-elev fg-faint">
              <ListMusic size={22} aria-hidden />
            </span>
            <p className="text-sm fg-dim">
              {items.length === 0
                ? "Your library is empty. Paste a YouTube link, upload files, or drop media anywhere."
                : "Nothing matches your filter."}
            </p>
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={filtered.map((item) => item.id)} strategy={verticalListSortingStrategy}>
              <ul className="space-y-1" aria-label="Library items">
                {filtered.map((item) => (
                  <LibraryRow key={item.id} item={item} sortable={query.trim() === ""} />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        )}
      </div>

      <p className="border-t bd-soft px-4 py-2 text-[11px] fg-faint">
        {items.length} item{items.length === 1 ? "" : "s"} · drag to reorder
      </p>
    </div>
  );
}
