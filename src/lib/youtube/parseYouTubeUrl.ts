/**
 * Pure YouTube URL parser. No DOM or network access — safe to unit test.
 *
 * Supported shapes:
 *  - Video:    youtube.com/watch?v=ID, youtu.be/ID, youtube.com/shorts/ID,
 *              youtube.com/embed/ID (plus /live/ and /v/ aliases)
 *  - Playlist: youtube.com/playlist?list=ID and any watch URL carrying &list=
 */

export interface ParsedYouTubeUrl {
  type: "video" | "playlist";
  id: string;
}

const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const PLAYLIST_ID_PATTERN = /^[A-Za-z0-9_-]{2,}$/;
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;

function normalizeHost(hostname: string): string {
  const host = hostname.toLowerCase();
  for (const prefix of ["www.", "m.", "music."]) {
    if (host.startsWith(prefix)) return host.slice(prefix.length);
  }
  return host;
}

export function parseYouTubeUrl(rawInput: string): ParsedYouTubeUrl | null {
  if (typeof rawInput !== "string") return null;
  const input = rawInput.trim();
  if (!input) return null;

  let url: URL;
  try {
    url = new URL(HAS_SCHEME.test(input) ? input : `https://${input}`);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;

  const host = normalizeHost(url.hostname);

  const asVideo = (value: string | null | undefined): ParsedYouTubeUrl | null =>
    value && VIDEO_ID_PATTERN.test(value) ? { type: "video", id: value } : null;

  const asPlaylist = (value: string | null | undefined): ParsedYouTubeUrl | null =>
    value && PLAYLIST_ID_PATTERN.test(value) ? { type: "playlist", id: value } : null;

  if (host === "youtu.be") {
    const id = url.pathname.split("/").filter(Boolean)[0];
    return asVideo(id);
  }

  const isYouTube =
    host === "youtube.com" || host.endsWith(".youtube.com") || host === "youtube-nocookie.com";
  if (!isYouTube) return null;

  const segments = url.pathname.split("/").filter(Boolean);
  const section = segments[0];

  if (section === "playlist") {
    return asPlaylist(url.searchParams.get("list"));
  }

  if (section === "watch") {
    // Per spec, a watch URL carrying a list param resolves to the playlist.
    const list = url.searchParams.get("list");
    if (list) return asPlaylist(list);
    return asVideo(url.searchParams.get("v"));
  }

  if (section === "shorts" || section === "embed" || section === "live" || section === "v") {
    return asVideo(segments[1]);
  }

  return null;
}

export function youtubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

export function youtubeThumbnailUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}
