"use client";

/**
 * Media Session API integration: OS-level media keys and lock-screen
 * controls (metadata + play/pause/next/previous/seekto action handlers).
 */

import { useEffect } from "react";
import { displayAuthor, displayTitle } from "@/lib/types";
import { useLibraryStore } from "@/store/library";
import { usePlayerStore } from "@/store/player";

function mediaSession(): MediaSession | null {
  return typeof navigator !== "undefined" && "mediaSession" in navigator
    ? navigator.mediaSession
    : null;
}

export function useMediaSession(): void {
  const currentItemId = usePlayerStore((s) => s.currentItemId);
  const trackTitle = usePlayerStore((s) => s.trackTitle);
  const status = usePlayerStore((s) => s.status);
  const items = useLibraryStore((s) => s.items);

  const item = items.find((i) => i.id === currentItemId) ?? null;

  // Metadata
  useEffect(() => {
    const session = mediaSession();
    if (!session) return;
    if (!item) {
      session.metadata = null;
      return;
    }
    const artwork: MediaImage[] =
      (item.kind === "youtube-video" || item.kind === "youtube-playlist") && item.thumbnail
        ? [{ src: item.thumbnail, sizes: "480x360", type: "image/jpeg" }]
        : [];
    session.metadata = new MediaMetadata({
      title: trackTitle ?? displayTitle(item),
      artist: displayAuthor(item) ?? "Loopdeck",
      album: "Loopdeck",
      artwork,
    });
  }, [item, trackTitle]);

  // Playback state
  useEffect(() => {
    const session = mediaSession();
    if (!session) return;
    session.playbackState =
      status === "playing" || status === "buffering"
        ? "playing"
        : status === "idle"
          ? "none"
          : "paused";
  }, [status]);

  // Action handlers
  useEffect(() => {
    const session = mediaSession();
    if (!session) return;

    const handlers: Array<[MediaSessionAction, MediaSessionActionHandler]> = [
      ["play", () => usePlayerStore.getState().togglePlay()],
      ["pause", () => usePlayerStore.getState().togglePlay()],
      [
        "previoustrack",
        () => {
          usePlayerStore.getState().playPrevious();
        },
      ],
      [
        "nexttrack",
        () => {
          usePlayerStore.getState().playNext({ manual: true });
        },
      ],
      [
        "seekto",
        (details) => {
          if (typeof details.seekTime === "number") {
            usePlayerStore.getState().seekTo(details.seekTime);
          }
        },
      ],
    ];

    for (const [action, handler] of handlers) {
      try {
        session.setActionHandler(action, handler);
      } catch {
        // Some actions are unsupported on certain platforms; ignore.
      }
    }
    return () => {
      for (const [action] of handlers) {
        try {
          session.setActionHandler(action, null);
        } catch {
          // ignore
        }
      }
    };
  }, []);
}
