"use client";

import { useMemo } from "react";
import { loadYouTubeIframeApi } from "@/lib/youtube/apiLoader";

/**
 * Singleton loader hook. Returns the shared promise that resolves once
 * `window.YT.Player` is ready. Multiple mounts (StrictMode included) reuse
 * the same underlying promise — the script is fetched only once.
 */
export function useYouTubeApi(): Promise<typeof YT> {
  return useMemo(() => {
    if (typeof window === "undefined") {
      // Never resolves during SSR; engines only run on the client.
      return new Promise<typeof YT>(() => undefined);
    }
    return loadYouTubeIframeApi();
  }, []);
}
