/**
 * Client-side helper for resolving YouTube metadata (title/author/thumbnail)
 * via YouTube's oEmbed endpoint — no API key required. The request goes
 * through our own `/api/oembed` route to avoid browser CORS restrictions.
 */

export interface OEmbedInfo {
  title: string;
  author: string | null;
  thumbnail: string | null;
}

export async function fetchOEmbedInfo(videoUrl: string, signal?: AbortSignal): Promise<OEmbedInfo | null> {
  try {
    const response = await fetch(`/api/oembed?url=${encodeURIComponent(videoUrl)}`, { signal });
    if (!response.ok) return null;
    const data: unknown = await response.json();
    if (typeof data !== "object" || data === null) return null;
    const record = data as Record<string, unknown>;
    if (typeof record.title !== "string" || record.title.length === 0) return null;
    return {
      title: record.title,
      author: typeof record.author_name === "string" ? record.author_name : null,
      thumbnail: typeof record.thumbnail_url === "string" ? record.thumbnail_url : null,
    };
  } catch {
    return null;
  }
}
