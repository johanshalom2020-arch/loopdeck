/**
 * Library item domain model shared by stores, engines and UI.
 */

export type YouTubeVideoItem = {
  id: string;
  kind: "youtube-video";
  videoId: string;
  title: string;
  author: string | null;
  thumbnail: string;
  customTitle: string | null;
  addedAt: number;
};

export type YouTubePlaylistItem = {
  id: string;
  kind: "youtube-playlist";
  playlistId: string;
  title: string;
  author: string | null;
  thumbnail: string | null;
  customTitle: string | null;
  addedAt: number;
};

export type LocalMediaType = "video" | "audio";

export type LocalFileItem = {
  id: string;
  kind: "local-file";
  fileName: string;
  mediaType: LocalMediaType;
  mimeType: string;
  size: number;
  /** True when the blob was persisted to IndexedDB and can survive reloads. */
  storedInIdb: boolean;
  customTitle: string | null;
  addedAt: number;
};

export type LibraryItem = YouTubeVideoItem | YouTubePlaylistItem | LocalFileItem;

export function isYouTubeItem(item: LibraryItem): item is YouTubeVideoItem | YouTubePlaylistItem {
  return item.kind === "youtube-video" || item.kind === "youtube-playlist";
}

export function displayTitle(item: LibraryItem): string {
  const custom = item.customTitle?.trim();
  if (custom) return custom;
  if (item.kind === "local-file") return item.fileName;
  return item.title;
}

export function displayAuthor(item: LibraryItem): string | null {
  if (item.kind === "local-file") return item.mediaType === "audio" ? "Local audio" : "Local video";
  return item.author;
}

/** Stable, content-based key used to deduplicate on add/import. */
export function itemKey(item: LibraryItem): string {
  switch (item.kind) {
    case "youtube-video":
      return `ytv:${item.videoId}`;
    case "youtube-playlist":
      return `ytp:${item.playlistId}`;
    case "local-file":
      return `local:${item.fileName}:${item.size}`;
  }
}
