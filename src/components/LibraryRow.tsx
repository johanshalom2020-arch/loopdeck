"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import clsx from "clsx";
import { Check, Film, GripVertical, ListVideo, Music2, Pencil, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { removeLocalFileFromIdb } from "@/lib/files/idb";
import { unregisterFile } from "@/lib/files/registry";
import { displayAuthor, displayTitle, type LibraryItem } from "@/lib/types";
import { formatBytes } from "@/lib/utils/format";
import { useLibraryStore } from "@/store/library";
import { usePlayerStore } from "@/store/player";
import { useSettingsStore } from "@/store/settings";

const KIND_BADGES: Record<LibraryItem["kind"], string> = {
  "youtube-video": "YouTube",
  "youtube-playlist": "Playlist",
  "local-file": "Local",
};

function Thumb({ item }: { item: LibraryItem }) {
  if ((item.kind === "youtube-video" || item.kind === "youtube-playlist") && item.thumbnail) {
    // eslint-disable-next-line @next/next/no-img-element -- remote thumbnails
    return <img src={item.thumbnail} alt="" loading="lazy" className="h-10 w-16 rounded-md object-cover" />;
  }
  const Icon =
    item.kind === "youtube-playlist"
      ? ListVideo
      : item.kind === "local-file"
        ? item.mediaType === "audio"
          ? Music2
          : Film
        : Film;
  return (
    <span className="grid h-10 w-16 place-items-center rounded-md bg-elev fg-dim">
      <Icon size={16} aria-hidden />
    </span>
  );
}

export function LibraryRow({ item, sortable }: { item: LibraryItem; sortable: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled: !sortable,
  });
  const currentItemId = usePlayerStore((s) => s.currentItemId);
  const status = usePlayerStore((s) => s.status);
  const isActive = currentItemId === item.id;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const commitRename = () => {
    useLibraryStore.getState().renameItem(item.id, draft);
    setEditing(false);
  };

  const remove = () => {
    const player = usePlayerStore.getState();
    if (player.currentItemId === item.id) player.clearCurrent();
    if (item.kind === "local-file") {
      unregisterFile(item.id);
      void removeLocalFileFromIdb(item.id);
      useLibraryStore.getState().markStoredInIdb(item.id, false);
    }
    useSettingsStore.getState().removePosition(item.id);
    useLibraryStore.getState().removeItem(item.id);
    player.pushToast("info", `Removed “${displayTitle(item)}”.`);
  };

  const subtitle =
    item.kind === "local-file"
      ? `${displayAuthor(item)} · ${formatBytes(item.size)}`
      : displayAuthor(item) ?? KIND_BADGES[item.kind];

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition: transition ?? undefined }}
      className={clsx("lib-row group", isDragging && "opacity-70 shadow-lg")}
      data-active={isActive || undefined}
    >
      <button
        type="button"
        aria-label={`Drag to reorder ${displayTitle(item)}`}
        className={clsx("lib-grip", !sortable && "invisible")}
        {...attributes}
        {...listeners}
      >
        <GripVertical size={14} aria-hidden />
      </button>

      <button
        type="button"
        data-row-play
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
        onClick={() => usePlayerStore.getState().playItem(item.id)}
        aria-label={`Play ${displayTitle(item)}`}
        aria-current={isActive || undefined}
      >
        <span className="relative shrink-0">
          <Thumb item={item} />
          {isActive && (
            <span className="eq-bars" data-playing={status === "playing" || undefined} aria-hidden>
              <span />
              <span />
              <span />
            </span>
          )}
        </span>
        <span className="min-w-0 flex-1">
          {editing ? (
            <span className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
              <input
                ref={inputRef}
                value={draft}
                aria-label="New title"
                className="h-7 w-full rounded-md border bd-soft bg-app px-2 text-sm fg-base"
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitRename();
                  if (e.key === "Escape") setEditing(false);
                }}
              />
              <button type="button" aria-label="Save name" className="mini-btn" onClick={commitRename}>
                <Check size={13} aria-hidden />
              </button>
              <button type="button" aria-label="Cancel rename" className="mini-btn" onClick={() => setEditing(false)}>
                <X size={13} aria-hidden />
              </button>
            </span>
          ) : (
            <>
              <span className="block truncate text-sm font-medium leading-tight">{displayTitle(item)}</span>
              <span className="mt-0.5 flex items-center gap-1.5 text-[11px] fg-faint">
                <span className="truncate">{subtitle}</span>
                <span className="lib-badge">{KIND_BADGES[item.kind]}</span>
              </span>
            </>
          )}
        </span>
      </button>

      <span className="flex shrink-0 items-center opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
        <button
          type="button"
          aria-label={`Rename ${displayTitle(item)}`}
          className="mini-btn"
          onClick={() => {
            setDraft(displayTitle(item));
            setEditing(true);
          }}
        >
          <Pencil size={13} aria-hidden />
        </button>
        <button type="button" aria-label={`Remove ${displayTitle(item)}`} className="mini-btn" onClick={remove}>
          <Trash2 size={13} aria-hidden />
        </button>
      </span>
    </li>
  );
}
