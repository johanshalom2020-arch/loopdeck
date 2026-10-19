/**
 * Runtime (non-persisted) player state: the current engine, transport status,
 * queue navigation, PiP mode and toasts. Playback commands are issued here so
 * keyboard shortcuts, media keys and buttons all share one code path.
 */

import { create } from "zustand";
import type { EngineEvent, PlaybackStatus, PlayerEngine } from "@/lib/engine/types";
import type { LibraryItem } from "@/lib/types";
import { createId } from "@/lib/utils/id";
import { fisherYates } from "@/lib/utils/shuffle";
import { useLibraryStore } from "@/store/library";
import { useSettingsStore } from "@/store/settings";

export type PipMode = "off" | "document" | "mini";

export interface ToastItem {
  id: string;
  kind: "info" | "warning" | "error";
  message: string;
}

/** Throttle for persisting "remember position" writes. */
let lastPositionWriteAt = 0;

function resolveOrder(items: LibraryItem[], shuffleOrder: string[] | null): string[] {
  if (!shuffleOrder) return items.map((item) => item.id);
  const valid = new Set(items.map((item) => item.id));
  const kept = shuffleOrder.filter((id) => valid.has(id));
  const keptSet = new Set(kept);
  const appended = items.filter((item) => !keptSet.has(item.id)).map((item) => item.id);
  return [...kept, ...appended];
}

export interface PlayerState {
  currentItemId: string | null;
  status: PlaybackStatus;
  currentTime: number;
  duration: number;
  /** What the user last wanted; survives engine remounts (PiP moves). */
  autoplayIntent: boolean;
  engine: PlayerEngine | null;
  playlist: { index: number; count: number } | null;
  trackTitle: string | null;
  loopCompleted: number;
  shuffleOrder: string[] | null;
  pipMode: PipMode;
  nativePipActive: boolean;
  errorMessage: string | null;
  toasts: ToastItem[];
  settingsOpen: boolean;
  libraryOpen: boolean;

  playItem(id: string): void;
  clearCurrent(): void;
  setEngine(engine: PlayerEngine | null): void;
  handleEngineEvent(event: EngineEvent): void;

  togglePlay(): void;
  replay(): void;
  seekBy(deltaSeconds: number): void;
  seekTo(seconds: number): void;
  playNext(options?: { manual?: boolean }): void;
  playPrevious(): void;
  rebuildShuffleOrder(): void;
  togglePip(): void;
  setPipMode(mode: PipMode): void;

  setSettingsOpen(open: boolean): void;
  setLibraryOpen(open: boolean): void;
  pushToast(kind: ToastItem["kind"], message: string): void;
  dismissToast(id: string): void;

  setLoopAFromCurrent(): void;
  setLoopBFromCurrent(): void;
}

export const usePlayerStore = create<PlayerState>()((set, get) => ({
  currentItemId: null,
  status: "idle",
  currentTime: 0,
  duration: 0,
  autoplayIntent: false,
  engine: null,
  playlist: null,
  trackTitle: null,
  loopCompleted: 0,
  shuffleOrder: null,
  pipMode: "off",
  nativePipActive: false,
  errorMessage: null,
  toasts: [],
  settingsOpen: false,
  libraryOpen: false,

  playItem: (id) => {
    const exists = useLibraryStore.getState().items.some((item) => item.id === id);
    if (!exists) return;
    set({
      currentItemId: id,
      status: "idle",
      currentTime: 0,
      duration: 0,
      autoplayIntent: true,
      playlist: null,
      trackTitle: null,
      loopCompleted: 0,
      errorMessage: null,
      nativePipActive: false,
    });
  },

  clearCurrent: () => {
    get().engine?.destroy();
    set({
      currentItemId: null,
      status: "idle",
      currentTime: 0,
      duration: 0,
      autoplayIntent: false,
      engine: null,
      playlist: null,
      trackTitle: null,
      loopCompleted: 0,
      errorMessage: null,
      pipMode: "off",
      nativePipActive: false,
    });
  },

  setEngine: (engine) => set({ engine }),

  handleEngineEvent: (event) => {
    switch (event.type) {
      case "status": {
        set({ status: event.status });
        if (event.status === "playing") set({ autoplayIntent: true });
        if (event.status === "paused" || event.status === "ended") {
          // Keep intent untouched on buffering transitions.
          if (event.status === "paused") set({ autoplayIntent: false });
        }
        break;
      }
      case "time": {
        set({ currentTime: event.currentTime, duration: event.duration });
        const { rememberPosition } = useSettingsStore.getState();
        const currentItemId = get().currentItemId;
        if (rememberPosition && currentItemId && event.currentTime > 1) {
          const now = Date.now();
          if (now - lastPositionWriteAt > 1000) {
            lastPositionWriteAt = now;
            useSettingsStore.getState().setPosition(currentItemId, event.currentTime);
          }
        }
        break;
      }
      case "ended": {
        if (event.reason === "loop-limit") {
          get().pushToast("info", "Loop repeat limit reached.");
        }
        if (useSettingsStore.getState().autoplayNext) {
          get().playNext({ manual: false });
        }
        break;
      }
      case "loopcycle": {
        set({ loopCompleted: event.completed });
        break;
      }
      case "error": {
        if (event.recoverable) {
          get().pushToast("warning", event.message);
        } else {
          set({ errorMessage: event.message });
          get().pushToast("error", event.message);
        }
        break;
      }
      case "playlist": {
        set({ playlist: { index: event.index, count: event.count } });
        break;
      }
      case "track": {
        set({ trackTitle: event.title });
        break;
      }
      case "pip": {
        set({ nativePipActive: event.active });
        break;
      }
    }
  },

  togglePlay: () => {
    const { engine, status } = get();
    if (!engine) return;
    if (status === "playing" || status === "buffering") {
      engine.pause();
      set({ autoplayIntent: false });
    } else {
      engine.play();
      set({ autoplayIntent: true });
    }
  },

  replay: () => {
    const { engine } = get();
    if (!engine) return;
    engine.seekTo(0);
    engine.play();
    set({ autoplayIntent: true });
  },

  seekBy: (deltaSeconds) => {
    const { engine } = get();
    if (!engine) return;
    engine.seekTo(Math.max(0, engine.getCurrentTime() + deltaSeconds));
  },

  seekTo: (seconds) => {
    const { engine } = get();
    if (!engine) return;
    engine.seekTo(seconds);
    set({ currentTime: Math.max(0, seconds) });
  },

  playNext: (options) => {
    const manual = options?.manual ?? true;
    const { engine } = get();
    const currentItem = useLibraryStore
      .getState()
      .items.find((item) => item.id === get().currentItemId);

    // Inside a YouTube playlist, "next" walks the playlist itself first.
    if (manual && engine && currentItem?.kind === "youtube-playlist") {
      engine.nextInPlaylist();
      return;
    }

    const items = useLibraryStore.getState().items;
    if (items.length === 0) return;
    const order = resolveOrder(items, get().shuffleOrder);
    const currentIndex = order.indexOf(get().currentItemId ?? "");
    const nextIndex = currentIndex < 0 ? 0 : currentIndex + 1;

    if (nextIndex >= order.length) {
      const { loopMode } = useSettingsStore.getState();
      if (manual || loopMode === "playlist") {
        get().playItem(order[0]);
      } else {
        set({ status: "ended", autoplayIntent: false });
      }
      return;
    }
    get().playItem(order[nextIndex]);
  },

  playPrevious: () => {
    const { engine } = get();
    const currentItem = useLibraryStore
      .getState()
      .items.find((item) => item.id === get().currentItemId);

    if (engine && currentItem?.kind === "youtube-playlist") {
      engine.previousInPlaylist();
      return;
    }
    // Conventional behaviour: restart the track unless we are at its start.
    if (engine && engine.getCurrentTime() > 3) {
      engine.seekTo(0);
      return;
    }
    const items = useLibraryStore.getState().items;
    if (items.length === 0) return;
    const order = resolveOrder(items, get().shuffleOrder);
    const currentIndex = order.indexOf(get().currentItemId ?? "");
    const previousIndex = currentIndex <= 0 ? order.length - 1 : currentIndex - 1;
    const target = order[previousIndex];
    if (target) get().playItem(target);
  },

  rebuildShuffleOrder: () => {
    const items = useLibraryStore.getState().items;
    const currentId = get().currentItemId;
    const rest = items.map((item) => item.id).filter((id) => id !== currentId);
    set({
      shuffleOrder: currentId ? [currentId, ...fisherYates(rest)] : fisherYates(rest),
    });
  },

  togglePip: () => {
    const { engine, pipMode, nativePipActive } = get();
    if (!engine) return;
    if (pipMode !== "off") {
      set({ pipMode: "off" });
      return;
    }
    if (nativePipActive) {
      engine.toggleNativePiP(); // exits the native PiP window
      return;
    }
    if (engine.capabilities.supportsNativePiP) {
      engine.toggleNativePiP();
      return;
    }
    if (engine.kind === "youtube" && engine.capabilities.supportsDocumentPiP) {
      set({ pipMode: "document" });
      return;
    }
    // Local audio + YouTube on browsers without Document PiP: in-page mini player.
    set({ pipMode: "mini" });
  },

  setPipMode: (mode) => set({ pipMode: mode }),
  setSettingsOpen: (open) => set({ settingsOpen: open }),
  setLibraryOpen: (open) => set({ libraryOpen: open }),

  pushToast: (kind, message) =>
    set((s) => ({
      toasts: [...s.toasts.slice(-4), { id: createId(), kind, message }],
    })),

  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((toast) => toast.id !== id) })),

  setLoopAFromCurrent: () => {
    const { engine } = get();
    if (!engine) return;
    useSettingsStore.getState().setLoopA(engine.getCurrentTime());
  },

  setLoopBFromCurrent: () => {
    const { engine } = get();
    if (!engine) return;
    useSettingsStore.getState().setLoopB(engine.getCurrentTime());
  },
}));
