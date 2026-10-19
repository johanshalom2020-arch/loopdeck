/**
 * PlayerEngine implementation for local files on an HTML5 media element.
 *
 *  - Full Web Audio boost support (gain → compressor) via the shared graph.
 *  - "Loop video" uses the native `el.loop = true` for infinite repeats and a
 *    manual ended→seek(0) cycle when a finite repeat budget is configured
 *    (so the loop counter stays accurate).
 *  - A–B segments piggy-back on the `timeupdate` event — no timers needed.
 *  - Native PiP: delegates to `video.requestPictureInPicture()` and mirrors
 *    enter/leave events into engine events.
 */

import { setBoostPercent, unlockAudioContext } from "@/lib/audio/boost";
import { isNativePiPSupported } from "@/lib/pip/pip";
import { Emitter, type Unsubscribe } from "@/lib/utils/emitter";
import { clamp } from "@/lib/utils/format";
import { advanceLoopCount, isValidSegment, shouldLoopSegment } from "@/lib/utils/loopLogic";
import type {
  EngineCapabilities,
  EngineEvent,
  EngineMountOptions,
  LoopConfig,
  PlaybackStatus,
  PlayerEngine,
} from "./types";
import { DEFAULT_LOOP_CONFIG } from "./types";

const MEDIA_ERROR_MESSAGES: Record<number, string> = {
  1: "Loading was aborted.",
  2: "A network error interrupted playback.",
  3: "The file could not be decoded — it may be corrupt or use an unsupported codec.",
  4: "This file format is not supported by your browser.",
};

export class LocalMediaEngine implements PlayerEngine {
  readonly kind = "local" as const;
  readonly capabilities: EngineCapabilities = {
    supportsBoost: true,
    supportsNativePiP: false, // finalised in mount() once the media type is known
    supportsDocumentPiP: false,
    supportsSpeed: true,
    supportsPlaylistNav: false,
    maxVolume: 100,
  };

  private el: HTMLMediaElement | null = null;
  private abort: AbortController | null = null;
  private readonly emitter = new Emitter<EngineEvent>();

  private options: EngineMountOptions | null = null;
  private loop: LoopConfig = { ...DEFAULT_LOOP_CONFIG };
  private loopCompleted = 0;
  private status: PlaybackStatus = "idle";
  private boostFailed = false;
  private destroyed = false;

  mount(host: HTMLElement, options: EngineMountOptions): Promise<void> {
    if (this.destroyed) return Promise.resolve();
    this.options = options;
    this.loop = { ...options.loop };

    if (!options.src) {
      this.setStatus("error");
      this.emitter.emit({
        type: "error",
        message: "No playable source is attached to this item.",
        recoverable: false,
      });
      return Promise.resolve();
    }

    const mediaType = options.item.kind === "local-file" ? options.item.mediaType : "video";
    this.capabilities.supportsNativePiP = mediaType === "video" && isNativePiPSupported();

    const el = document.createElement(mediaType === "audio" ? "audio" : "video");
    this.el = el;
    el.preload = "auto";
    if (el instanceof HTMLVideoElement) {
      el.playsInline = true;
      el.disablePictureInPicture = false;
    }
    el.src = options.src;
    el.className =
      mediaType === "audio" ? "hidden" : "absolute inset-0 h-full w-full object-contain bg-black";
    el.volume = clamp(options.volume, 0, 100) / 100;
    el.muted = options.muted;
    el.playbackRate = options.rate;
    this.applyLoopToElement();
    host.appendChild(el);

    const abort = new AbortController();
    this.abort = abort;
    const { signal } = abort;

    el.addEventListener("loadedmetadata", () => this.handleLoadedMetadata(), { signal });
    el.addEventListener(
      "play",
      () => {
        unlockAudioContext();
        this.setStatus("playing");
      },
      { signal },
    );
    el.addEventListener("playing", () => this.setStatus("playing"), { signal });
    el.addEventListener(
      "pause",
      () => {
        if (!el.ended) this.setStatus("paused");
      },
      { signal },
    );
    el.addEventListener("ended", () => this.handleEnded(), { signal });
    el.addEventListener("durationchange", () => this.emitTime(), { signal });
    el.addEventListener("timeupdate", () => this.handleTimeUpdate(), { signal });
    el.addEventListener("error", () => this.handleElementError(), { signal });
    el.addEventListener("enterpictureinpicture", () => this.emitter.emit({ type: "pip", active: true }), { signal });
    el.addEventListener("leavepictureinpicture", () => this.emitter.emit({ type: "pip", active: false }), { signal });

    return Promise.resolve();
  }

  onEvent(handler: (event: EngineEvent) => void): Unsubscribe {
    return this.emitter.on(handler);
  }

  // ---------------------------------------------------------------- lifecycle

  private handleLoadedMetadata(): void {
    const el = this.el;
    const options = this.options;
    if (!el || !options || this.destroyed) return;

    if (options.boost !== 100) {
      this.boostFailed = !setBoostPercent(el, options.boost);
    }

    const duration = el.duration;
    if (options.startAt > 0.5 && Number.isFinite(duration) && options.startAt < duration - 0.5) {
      el.currentTime = options.startAt;
    }
    this.emitTime();

    if (options.autoplay) {
      unlockAudioContext();
      void el.play().catch(() => {
        this.emitter.emit({
          type: "error",
          message: "Autoplay was blocked by the browser — press play to start.",
          recoverable: true,
        });
        this.setStatus("paused");
      });
    }
  }

  private handleEnded(): void {
    if (this.destroyed) return;
    if (this.loop.mode === "video") {
      // Only reached for finite loops — infinite loops use native el.loop.
      this.attemptLoop(() => {
        const el = this.el;
        if (!el) return;
        el.currentTime = 0;
        unlockAudioContext();
        void el.play().catch(() => this.setStatus("paused"));
      });
      return;
    }
    if (this.loop.mode === "ab" && isValidSegment(this.loop.a, this.loop.b)) {
      // B sits at (or past) the end of the media, so `ended` fires before
      // timeupdate can catch it — jump back to A instead of stopping.
      this.attemptLoop(() => {
        const el = this.el;
        if (!el) return;
        el.currentTime = this.loop.a ?? 0;
        void el.play().catch(() => this.setStatus("paused"));
      });
      return;
    }
    this.setStatus("ended");
    this.emitter.emit({ type: "ended", reason: "natural" });
  }

  private handleTimeUpdate(): void {
    const el = this.el;
    if (!el || this.destroyed) return;
    this.emitTime();
    if (this.loop.mode === "ab" && shouldLoopSegment(el.currentTime, this.loop.a, this.loop.b)) {
      this.attemptLoop(() => {
        if (this.el) this.el.currentTime = this.loop.a ?? 0;
      });
    }
  }

  private handleElementError(): void {
    const code = this.el?.error?.code ?? 0;
    this.setStatus("error");
    this.emitter.emit({
      type: "error",
      message: MEDIA_ERROR_MESSAGES[code] ?? "The media failed to load.",
      recoverable: false,
    });
  }

  private attemptLoop(restart: () => void): void {
    const advance = advanceLoopCount(this.loopCompleted, this.loop.maxRepeats);
    this.loopCompleted = advance.completed;
    this.emitter.emit({ type: "loopcycle", completed: advance.completed });
    if (advance.shouldContinue) {
      restart();
      return;
    }
    this.el?.pause();
    this.setStatus("ended");
    this.emitter.emit({ type: "ended", reason: "loop-limit" });
  }

  private emitTime(): void {
    const el = this.el;
    if (!el) return;
    this.emitter.emit({
      type: "time",
      currentTime: Number.isFinite(el.currentTime) ? el.currentTime : 0,
      duration: Number.isFinite(el.duration) ? el.duration : 0,
    });
  }

  private applyLoopToElement(): void {
    const el = this.el;
    if (!el) return;
    // Native loop for infinite repeats; manual (countable) cycle otherwise.
    el.loop = this.loop.mode === "video" && this.loop.maxRepeats <= 0;
  }

  private setStatus(status: PlaybackStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.emitter.emit({ type: "status", status });
  }

  // --------------------------------------------------------------- public API

  play(): void {
    const el = this.el;
    if (!el) return;
    unlockAudioContext();
    void el.play().catch(() => {
      this.emitter.emit({
        type: "error",
        message: "Playback was blocked. Interact with the page and try again.",
        recoverable: true,
      });
    });
  }

  pause(): void {
    this.el?.pause();
  }

  seekTo(seconds: number): void {
    const el = this.el;
    if (!el || !Number.isFinite(seconds)) return;
    const duration = Number.isFinite(el.duration) ? el.duration : Number.POSITIVE_INFINITY;
    el.currentTime = clamp(seconds, 0, duration);
  }

  setVolume(volumePercent: number): void {
    const el = this.el;
    if (!el) return;
    el.volume = clamp(volumePercent, 0, 100) / 100;
  }

  setMuted(muted: boolean): void {
    const el = this.el;
    if (el) el.muted = muted;
  }

  setPlaybackRate(rate: number): void {
    const el = this.el;
    if (el) el.playbackRate = rate;
  }

  setBoost(percent: number): void {
    const el = this.el;
    if (!el) return;
    const ok = setBoostPercent(el, percent);
    if (!ok && !this.boostFailed) {
      this.emitter.emit({
        type: "error",
        message: "Volume boost is unavailable in this browser for this element.",
        recoverable: true,
      });
    }
    this.boostFailed = !ok;
  }

  setLoop(config: LoopConfig): void {
    this.loop = { ...config };
    this.loopCompleted = 0;
    this.applyLoopToElement();
  }

  nextInPlaylist(): void {
    // Queue navigation is orchestrated at the app level for local items.
  }

  previousInPlaylist(): void {
    const el = this.el;
    if (el) el.currentTime = 0;
  }

  toggleNativePiP(): void {
    const el = this.el;
    if (!(el instanceof HTMLVideoElement) || !this.capabilities.supportsNativePiP) return;
    if (document.pictureInPictureElement === el) {
      void document.exitPictureInPicture().catch(() => undefined);
      return;
    }
    void el.requestPictureInPicture().catch(() => {
      this.emitter.emit({
        type: "error",
        message: "Picture-in-Picture was blocked by the browser.",
        recoverable: true,
      });
    });
  }

  getCurrentTime(): number {
    return this.el && Number.isFinite(this.el.currentTime) ? this.el.currentTime : 0;
  }

  getDuration(): number {
    return this.el && Number.isFinite(this.el.duration) ? this.el.duration : 0;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.abort?.abort();
    this.abort = null;
    const el = this.el;
    this.el = null;
    if (el) {
      el.pause();
      el.removeAttribute("src");
      el.load();
      el.remove();
    }
    this.emitter.clear();
  }
}
