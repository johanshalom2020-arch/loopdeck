/**
 * PlayerEngine implementation backed by the official YouTube IFrame API.
 *
 * Looping notes:
 *  - "Loop video" is implemented manually in the ENDED state with
 *    seekTo(0) + playVideo(), because the `loop` playerVar only takes effect
 *    together with a playlist parameter.
 *  - "Loop playlist" applies player.setLoop(true) *and* keeps a manual
 *    fallback (jump to index 0) so a repeat budget can be enforced.
 *  - A–B segments poll getCurrentTime() on a ~100ms interval while playing.
 */

import { advanceLoopCount, shouldLoopSegment } from "@/lib/utils/loopLogic";
import { Emitter, type Unsubscribe } from "@/lib/utils/emitter";
import { clamp } from "@/lib/utils/format";
import { describeYouTubeError, isAutoSkippableError } from "@/lib/youtube/errors";
import { isDocumentPiPSupported } from "@/lib/pip/pip";
import { loadYouTubeIframeApi } from "@/lib/youtube/apiLoader";
import { YTPlayerController } from "@/lib/youtube/YTPlayerController";
import type {
  EngineCapabilities,
  EngineEvent,
  EngineMountOptions,
  LoopConfig,
  PlaybackStatus,
  PlayerEngine,
} from "./types";
import { DEFAULT_LOOP_CONFIG } from "./types";

/** Mirror of YT.PlayerState so we never touch the global at runtime. */
const PS = { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 } as const;

const TICK_MS = 250;
const AB_TICK_MS = 100;
const PLAYLIST_INFO_EVERY_N_TICKS = 4;
const AUTO_SKIP_DELAY_MS = 900;
const MAX_CONSECUTIVE_SKIPS = 8;

export class YouTubeEngine implements PlayerEngine {
  readonly kind = "youtube" as const;
  readonly capabilities: EngineCapabilities = {
    supportsBoost: false,
    supportsNativePiP: false,
    supportsDocumentPiP: isDocumentPiPSupported(),
    supportsSpeed: true,
    supportsPlaylistNav: true,
    maxVolume: 100,
  };

  private controller: YTPlayerController | null = null;
  private unsubscribeController: Unsubscribe | null = null;
  private readonly emitter = new Emitter<EngineEvent>();

  private options: EngineMountOptions | null = null;
  private loop: LoopConfig = { ...DEFAULT_LOOP_CONFIG };
  private loopCompleted = 0;
  private status: PlaybackStatus = "idle";
  private lastTime = 0;
  private lastTrackTitle: string | null = null;

  private readyOnce = false;
  private ticker: number | null = null;
  private abTimer: number | null = null;
  private skipTimer: number | null = null;
  private tickCount = 0;
  private consecutiveSkips = 0;
  private destroyed = false;

  async mount(host: HTMLElement, options: EngineMountOptions): Promise<void> {
    if (this.destroyed) return;
    this.options = options;
    this.loop = { ...options.loop };

    // Wait for the API first so a player is never created for an engine that
    // was already torn down (StrictMode / fast item switches / PiP moves).
    await loadYouTubeIframeApi(host.ownerDocument.defaultView ?? window);
    if (this.destroyed) return;

    const controller = await YTPlayerController.create({ host });
    if (this.destroyed) {
      controller.destroy();
      return;
    }
    this.controller = controller;
    this.unsubscribeController = controller.onEvent((event) => {
      if (event.type === "ready") this.handleReady();
      else if (event.type === "state") this.handleStateChange(event.state);
      else this.handleError(event.code);
    });
    this.startTicker();
  }

  onEvent(handler: (event: EngineEvent) => void): Unsubscribe {
    return this.emitter.on(handler);
  }

  // ---------------------------------------------------------------- lifecycle

  private handleReady(): void {
    if (!this.controller || !this.options || this.destroyed) return;
    if (!this.readyOnce) {
      this.readyOnce = true;
      this.applyOutputSettings();
      this.loadForCurrentOptions(this.options.startAt, this.options.autoplay);
      return;
    }
    // A subsequent ready means the iframe reloaded (e.g. it was moved for a
    // Document-PiP transition) — resume at the last known position/state.
    const wasPlaying = this.status === "playing" || this.status === "buffering";
    this.loadForCurrentOptions(this.lastTime, wasPlaying);
  }

  private loadForCurrentOptions(startAt: number, autoplay: boolean): void {
    const item = this.options?.item;
    if (!this.controller || !item) return;
    if (item.kind === "youtube-video") {
      this.controller.loadVideo(item.videoId, startAt, autoplay);
    } else if (item.kind === "youtube-playlist") {
      this.controller.setPlaylistLoop(this.loop.mode === "playlist");
      this.controller.loadPlaylist(item.playlistId, 0, startAt, autoplay);
      this.emitPlaylistInfo();
    }
    this.applyAbWatcher();
  }

  private applyOutputSettings(): void {
    if (!this.options || !this.controller) return;
    this.controller.setVolume(this.options.volume);
    this.controller.setMuted(this.options.muted);
    this.controller.setPlaybackRate(this.options.rate);
  }

  // -------------------------------------------------------------- state logic

  private handleStateChange(state: YT.PlayerState): void {
    if (this.destroyed) return;
    if (state === PS.PLAYING) {
      this.consecutiveSkips = 0;
      this.setStatus("playing");
      this.emitTrackInfo();
      this.emitPlaylistInfo();
    } else if (state === PS.PAUSED) {
      this.setStatus("paused");
    } else if (state === PS.BUFFERING) {
      this.setStatus("buffering");
    } else if (state === PS.ENDED) {
      this.handleEnded();
    }
  }

  private handleEnded(): void {
    const item = this.options?.item;

    if (this.loop.mode === "video") {
      this.attemptLoop(() => {
        this.controller?.seekTo(0);
        this.controller?.play();
      });
      return;
    }

    if (this.loop.mode === "playlist" && item?.kind === "youtube-playlist") {
      // Manual fallback: jump back to the first video when the playlist ends.
      this.attemptLoop(() => {
        this.controller?.playVideoAt(0);
        this.controller?.play();
      });
      return;
    }

    if (this.loop.mode === "ab" && shouldLoopSegment(Number.MAX_SAFE_INTEGER, this.loop.a, this.loop.b)) {
      this.attemptLoop(() => {
        this.controller?.seekTo(this.loop.a ?? 0);
        this.controller?.play();
      });
      return;
    }

    this.setStatus("ended");
    this.emitter.emit({ type: "ended", reason: "natural" });
  }

  private attemptLoop(restart: () => void): void {
    const advance = advanceLoopCount(this.loopCompleted, this.loop.maxRepeats);
    this.loopCompleted = advance.completed;
    this.emitter.emit({ type: "loopcycle", completed: advance.completed });
    if (advance.shouldContinue) {
      restart();
      return;
    }
    this.setStatus("ended");
    this.emitter.emit({ type: "ended", reason: "loop-limit" });
  }

  private handleError(code: number): void {
    if (this.destroyed) return;
    const message = describeYouTubeError(code);
    const isPlaylist = this.options?.item.kind === "youtube-playlist";

    if (isPlaylist && isAutoSkippableError(code) && this.consecutiveSkips < MAX_CONSECUTIVE_SKIPS) {
      this.consecutiveSkips += 1;
      this.emitter.emit({ type: "error", message: `${message} Skipping to the next video…`, recoverable: true });
      if (this.skipTimer !== null) window.clearTimeout(this.skipTimer);
      this.skipTimer = window.setTimeout(() => {
        this.skipTimer = null;
        this.controller?.nextVideo();
      }, AUTO_SKIP_DELAY_MS);
      return;
    }

    this.setStatus("error");
    this.emitter.emit({ type: "error", message, recoverable: false });
  }

  // ------------------------------------------------------------------ timers

  private startTicker(): void {
    this.stopTicker();
    this.ticker = window.setInterval(() => {
      if (!this.controller || this.destroyed) return;
      if (!this.readyOnce && this.controller.getDuration() > 0) {
        // Safety net in case the ready event escaped a late subscriber.
        this.handleReady();
        return;
      }
      const t = this.controller.getCurrentTime();
      const d = this.controller.getDuration();
      this.lastTime = t;
      if (Number.isFinite(t) && Number.isFinite(d)) {
        this.emitter.emit({ type: "time", currentTime: t, duration: d });
      }
      this.tickCount += 1;
      if (this.tickCount % PLAYLIST_INFO_EVERY_N_TICKS === 0) this.emitPlaylistInfo();
    }, TICK_MS);
  }

  private stopTicker(): void {
    if (this.ticker !== null) {
      window.clearInterval(this.ticker);
      this.ticker = null;
    }
  }

  private applyAbWatcher(): void {
    this.stopAbWatcher();
    const { mode, a, b } = this.loop;
    if (mode !== "ab" || a === null || b === null || b <= a) return;
    this.abTimer = window.setInterval(() => {
      if (!this.controller || this.destroyed) return;
      if (this.controller.getPlayerState() !== PS.PLAYING) return;
      const t = this.controller.getCurrentTime();
      if (shouldLoopSegment(t, a, b)) {
        this.attemptLoop(() => this.controller?.seekTo(a));
      }
    }, AB_TICK_MS);
  }

  private stopAbWatcher(): void {
    if (this.abTimer !== null) {
      window.clearInterval(this.abTimer);
      this.abTimer = null;
    }
  }

  // ------------------------------------------------------------------ events

  private emitPlaylistInfo(): void {
    if (!this.controller || this.options?.item.kind !== "youtube-playlist") return;
    const ids = this.controller.getPlaylistIds();
    if (ids.length === 0) return;
    this.emitter.emit({ type: "playlist", index: this.controller.getPlaylistIndex(), count: ids.length });
  }

  private emitTrackInfo(): void {
    if (!this.controller) return;
    const title = this.controller.getVideoData()?.title ?? null;
    if (title && title !== this.lastTrackTitle) {
      this.lastTrackTitle = title;
      this.emitter.emit({ type: "track", title });
    }
  }

  private setStatus(status: PlaybackStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.emitter.emit({ type: "status", status });
  }

  // --------------------------------------------------------------- public API

  play(): void {
    this.controller?.play();
  }

  pause(): void {
    this.controller?.pause();
  }

  seekTo(seconds: number): void {
    this.controller?.seekTo(seconds);
  }

  setVolume(volumePercent: number): void {
    const volume = clamp(volumePercent, 0, 100);
    if (this.options) this.options.volume = volume;
    this.controller?.setVolume(volume);
  }

  setMuted(muted: boolean): void {
    if (this.options) this.options.muted = muted;
    this.controller?.setMuted(muted);
  }

  setPlaybackRate(rate: number): void {
    if (this.options) this.options.rate = rate;
    this.controller?.setPlaybackRate(rate);
  }

  setBoost(): void {
    // No-op: browser security keeps cross-origin iframe audio out of Web Audio.
  }

  setLoop(config: LoopConfig): void {
    this.loop = { ...config };
    this.loopCompleted = 0;
    if (this.options?.item.kind === "youtube-playlist") {
      this.controller?.setPlaylistLoop(config.mode === "playlist");
    }
    this.applyAbWatcher();
  }

  nextInPlaylist(): void {
    this.controller?.nextVideo();
  }

  previousInPlaylist(): void {
    const ids = this.controller?.getPlaylistIds() ?? [];
    if (ids.length > 0 && (this.controller?.getPlaylistIndex() ?? 0) > 0) {
      this.controller?.previousVideo();
    } else if (ids.length > 0) {
      this.controller?.seekTo(0);
    }
  }

  toggleNativePiP(): void {
    // YouTube PiP is handled at the UI layer via Document PiP / mini player.
  }

  getCurrentTime(): number {
    return this.controller?.getCurrentTime() ?? this.lastTime;
  }

  getDuration(): number {
    return this.controller?.getDuration() ?? 0;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.stopTicker();
    this.stopAbWatcher();
    if (this.skipTimer !== null) {
      window.clearTimeout(this.skipTimer);
      this.skipTimer = null;
    }
    this.unsubscribeController?.();
    this.unsubscribeController = null;
    this.controller?.destroy();
    this.controller = null;
    this.emitter.clear();
  }
}
