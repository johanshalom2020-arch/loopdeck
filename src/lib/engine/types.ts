/**
 * The PlayerEngine contract. The UI talks exclusively to this interface;
 * capability flags drive which settings are enabled per engine.
 */

import type { LibraryItem } from "@/lib/types";
import type { Unsubscribe } from "@/lib/utils/emitter";

export type LoopMode = "off" | "video" | "playlist" | "ab";

export const LOOP_MODE_LABELS: Record<LoopMode, string> = {
  off: "Off",
  video: "Loop video",
  playlist: "Loop playlist",
  ab: "A–B segment",
};

export interface LoopConfig {
  mode: LoopMode;
  a: number | null;
  b: number | null;
  /** 0 (or negative) = loop forever; N = repeat N additional times. */
  maxRepeats: number;
}

export const DEFAULT_LOOP_CONFIG: LoopConfig = { mode: "off", a: null, b: null, maxRepeats: 0 };

export type PlaybackStatus = "idle" | "buffering" | "playing" | "paused" | "ended" | "error";

export interface EngineCapabilities {
  /** Web Audio gain graph — impossible for cross-origin (YouTube) iframes. */
  supportsBoost: boolean;
  /** `<video>.requestPictureInPicture()` for local video elements. */
  supportsNativePiP: boolean;
  /** Document Picture-in-Picture windows (Chrome/Edge) for iframe content. */
  supportsDocumentPiP: boolean;
  supportsSpeed: boolean;
  supportsPlaylistNav: boolean;
  maxVolume: number;
}

export type EngineEvent =
  | { type: "status"; status: PlaybackStatus }
  | { type: "time"; currentTime: number; duration: number }
  | { type: "ended"; reason: "natural" | "loop-limit" }
  | { type: "loopcycle"; completed: number }
  | { type: "error"; message: string; recoverable: boolean }
  | { type: "playlist"; index: number; count: number }
  | { type: "track"; title: string | null }
  | { type: "pip"; active: boolean };

export interface EngineMountOptions {
  item: LibraryItem;
  /** Object URL for local files; ignored by the YouTube engine. */
  src: string | null;
  startAt: number;
  autoplay: boolean;
  volume: number;
  muted: boolean;
  rate: number;
  boost: number;
  loop: LoopConfig;
}

export interface PlayerEngine {
  readonly kind: "youtube" | "local";
  readonly capabilities: EngineCapabilities;

  mount(host: HTMLElement, options: EngineMountOptions): Promise<void>;
  play(): void;
  pause(): void;
  seekTo(seconds: number): void;
  setVolume(volumePercent: number): void;
  setMuted(muted: boolean): void;
  setPlaybackRate(rate: number): void;
  /** 0–400. Only meaningful when `capabilities.supportsBoost` is true. */
  setBoost(percent: number): void;
  setLoop(config: LoopConfig): void;
  /** YouTube playlist navigation; a no-op for local items. */
  nextInPlaylist(): void;
  previousInPlaylist(): void;
  /** Native `<video>` PiP. A no-op unless `supportsNativePiP`. */
  toggleNativePiP(): void;

  getCurrentTime(): number;
  getDuration(): number;
  onEvent(handler: (event: EngineEvent) => void): Unsubscribe;
  destroy(): void;
}
