import { NextResponse, type NextRequest } from "next/server";

/**
 * Tiny server-side proxy for YouTube's oEmbed endpoint.
 * Keeps the browser free of CORS workarounds and adds a hard timeout and
 * day-long CDN caching. No API key required.
 */

const OEMBED_ENDPOINT = "https://www.youtube.com/oembed";
const REQUEST_TIMEOUT_MS = 6000;

const YOUTUBE_HOST = /(^|\.)youtube\.com$|(^|\.)youtu\.be$/i;

export async function GET(request: NextRequest) {
  const target = request.nextUrl.searchParams.get("url");
  if (!target) {
    return NextResponse.json({ error: "Missing 'url' query parameter." }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return NextResponse.json({ error: "Invalid URL." }, { status: 400 });
  }
  if (!YOUTUBE_HOST.test(parsed.hostname)) {
    return NextResponse.json({ error: "Only YouTube URLs are supported." }, { status: 400 });
  }

  try {
    const upstream = await fetch(
      `${OEMBED_ENDPOINT}?url=${encodeURIComponent(target)}&format=json`,
      {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        next: { revalidate: 60 * 60 * 24 },
        headers: { "User-Agent": "Loopdeck/1.0" },
      },
    );
    if (!upstream.ok) {
      return NextResponse.json({ error: "oEmbed lookup failed." }, { status: 502 });
    }
    const data: unknown = await upstream.json();
    const record = (typeof data === "object" && data !== null ? data : {}) as Record<string, unknown>;
    return NextResponse.json({
      title: typeof record.title === "string" ? record.title : null,
      author_name: typeof record.author_name === "string" ? record.author_name : null,
      thumbnail_url: typeof record.thumbnail_url === "string" ? record.thumbnail_url : null,
    });
  } catch {
    return NextResponse.json({ error: "oEmbed request failed." }, { status: 502 });
  }
}
