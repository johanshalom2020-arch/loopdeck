/**
 * Typed wrapper around `YT.Player`.
 *
 * Exposes a narrow, promise-free command API plus a typed event emitter.
 * The controller owns the player lifecycle: callers must `destroy()` it on
 * unmount, which removes the injected iframe. All methods are guarded so a
 * call racing a destroy is a no-op rather than an exception.
 */

import { Emitter, type Unsubscribe } from "@/lib/utils/emitter";
import { clamp } from "@/lib/utils/format";
import { loadYouTubeIframeApi } from "@/lib/youtube/apiLoader";

export type YTControllerEvent =
  | { type: "ready" }
  | { type: "state"; state: YT.PlayerState }
  | { type: "error"; code: number };

export interface YTControllerConfig {
  /** Container element the iframe is injected into. */
  host: HTMLElement;
}

export class YTPlayerController {
  private rawPlayer: YT.Player | null = null;
  private mountNode: HTMLElement | null = null;
  private ready = false;
  private readonly emitter = new Emitter<YTControllerEvent>();
  private destroyed = false;

  private constructor() {}

  /**
   * The YT.Player object exists immediately, but its command methods
   * (playVideo, setVolume, ...) are only attached once `onReady` fires.
   * Calling them earlier throws "is not a function", so every command goes
   * through this guard and is a harmless no-op until the player is ready.
   */
  private get player(): YT.Player | null {
    return this.ready ? this.rawPlayer : null;
  }

  /**
   * Resolves once the IFrame API script is loaded and the player instance has
   * been created. Subscribe with `onEvent` *before* awaiting if you need the
   * first `ready` event.
   */
  static async create(config: YTControllerConfig): Promise<YTPlayerController> {
    // Load the API into the window that actually owns the host element
    // (the Document-PiP window when the player is popped out).
    const win = config.host.ownerDocument.defaultView ?? window;
    const yt = await loadYouTubeIframeApi(win);
    const controller = new YTPlayerController();
    controller.instantiate(yt, config);
    return controller;
  }

  private instantiate(yt: typeof YT, config: YTControllerConfig): void {
    type PlayerVars = YT.PlayerVars;
    const playerVars: PlayerVars = {
      rel: 0 as NonNullable<PlayerVars["rel"]>,
      modestbranding: 1 as NonNullable<PlayerVars["modestbranding"]>,
      playsinline: 1 as NonNullable<PlayerVars["playsinline"]>,
      enablejsapi: 1 as NonNullable<PlayerVars["enablejsapi"]>,
    };

    // YT.Player *replaces* the element it is given with an iframe. Give it a
    // disposable child so the React-owned host div is never swapped out.
    const mountNode = config.host.ownerDocument.createElement("div");
    config.host.appendChild(mountNode);
    this.mountNode = mountNode;

    this.rawPlayer = new yt.Player(mountNode, {
      width: "100%",
      height: "100%",
      // Privacy-enhanced mode host, per spec.
      host: "https://www.youtube-nocookie.com",
      playerVars,
      events: {
        onReady: () => {
          if (this.destroyed) return;
          this.ready = true;
          this.emitter.emit({ type: "ready" });
        },
        onStateChange: (event) => this.emitter.emit({ type: "state", state: event.data }),
        onError: (event) => this.emitter.emit({ type: "error", code: Number(event.data) }),
      },
    });
  }

  onEvent(handler: (event: YTControllerEvent) => void): Unsubscribe {
    return this.emitter.on(handler);
  }

  play(): void {
    this.player?.playVideo();
  }

  pause(): void {
    this.player?.pauseVideo();
  }

  seekTo(seconds: number): void {
    if (!this.player || !Number.isFinite(seconds)) return;
    this.player.seekTo(Math.max(0, seconds), true);
  }

  setVolume(volumePercent: number): void {
    this.player?.setVolume(Math.round(clamp(volumePercent, 0, 100)));
  }

  setMuted(muted: boolean): void {
    if (!this.player) return;
    if (muted) this.player.mute();
    else this.player.unMute();
  }

  setPlaybackRate(rate: number): void {
    this.player?.setPlaybackRate(rate);
  }

  /** Loads or cues a single video at an optional start offset. */
  loadVideo(videoId: string, startSeconds: number, autoplay: boolean): void {
    if (!this.player) return;
    const start = Math.max(0, Math.floor(startSeconds));
    if (autoplay) this.player.loadVideoById(videoId, start);
    else this.player.cueVideoById(videoId, start);
  }

  /** Loads or cues a YouTube playlist. */
  loadPlaylist(playlistId: string, index: number, startSeconds: number, autoplay: boolean): void {
    if (!this.player) return;
    const settings: YT.IPlaylistSettings = {
      list: playlistId,
      listType: "playlist" as NonNullable<YT.IPlaylistSettings["listType"]>,
      index: Math.max(0, Math.floor(index)),
      startSeconds: Math.max(0, Math.floor(startSeconds)),
    };
    if (autoplay) this.player.loadPlaylist(settings);
    else this.player.cuePlaylist(settings);
  }

  setPlaylistLoop(loopPlaylists: boolean): void {
    this.player?.setLoop(loopPlaylists);
  }

  playVideoAt(index: number): void {
    this.player?.playVideoAt(Math.max(0, Math.floor(index)));
  }

  nextVideo(): void {
    this.player?.nextVideo();
  }

  previousVideo(): void {
    this.player?.previousVideo();
  }

  getPlaylistIds(): string[] {
    try {
      return this.player?.getPlaylist() ?? [];
    } catch {
      return [];
    }
  }

  getPlaylistIndex(): number {
    try {
      return this.player?.getPlaylistIndex() ?? 0;
    } catch {
      return 0;
    }
  }

  getVideoData(): YT.VideoData | null {
    try {
      return this.player?.getVideoData() ?? null;
    } catch {
      return null;
    }
  }

  getCurrentTime(): number {
    try {
      return this.player?.getCurrentTime() ?? 0;
    } catch {
      return 0;
    }
  }

  getDuration(): number {
    try {
      return this.player?.getDuration() ?? 0;
    } catch {
      return 0;
    }
  }

  getPlayerState(): YT.PlayerState | null {
    try {
      return this.player?.getPlayerState() ?? null;
    } catch {
      return null;
    }
  }

  isDestroyed(): boolean {
    return this.destroyed;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.emitter.clear();
    try {
      this.rawPlayer?.destroy();
    } catch {
      // The iframe may already be detached from the DOM; that is fine.
    }
    this.mountNode?.remove();
    this.mountNode = null;
    this.rawPlayer = null;
    this.ready = false;
  }
}
