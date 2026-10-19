"use client";

/**
 * The player stage. Owns engine lifecycle and all PiP transitions.
 *
 * PiP transitions unmount the shell from the stage and remount it inside a
 * portal (Document-PiP window or the in-page mini player). Remounting
 * rebuilds the engine from the live position/state held in the player store,
 * which transparently solves the "moving an iframe reloads it" problem.
 */

import {
  CircleAlert,
  FileWarning,
  GripHorizontal,
  PictureInPicture2,
  Repeat,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { LocalMediaEngine } from "@/lib/engine/LocalMediaEngine";
import type { EngineMountOptions, PlayerEngine } from "@/lib/engine/types";
import { YouTubeEngine } from "@/lib/engine/YouTubeEngine";
import { loadLocalFileFromIdb, saveLocalFileToIdb } from "@/lib/files/idb";
import { FILE_INPUT_ACCEPT } from "@/lib/files/mediaFiles";
import { getRegisteredFile, registerFile } from "@/lib/files/registry";
import { requestDocumentPiPWindow } from "@/lib/pip/pip";
import { displayTitle, type LibraryItem, type LocalFileItem } from "@/lib/types";
import { clamp } from "@/lib/utils/format";
import { useLibraryStore } from "@/store/library";
import { usePlayerStore } from "@/store/player";
import { useSettingsStore } from "@/store/settings";

// --------------------------------------------------------------- doc PiP hook

function useDocumentPipContainer(active: boolean): HTMLElement | null {
  const [container, setContainer] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let pipWindow: Window | null = null;

    const onLeave = () => {
      setContainer(null);
      usePlayerStore.getState().setPipMode("off");
    };

    void (async () => {
      pipWindow = await requestDocumentPiPWindow();
      if (!pipWindow) {
        const player = usePlayerStore.getState();
        player.pushToast("warning", "Document Picture-in-Picture was blocked — using the in-page mini player.");
        player.setPipMode("mini");
        return;
      }
      if (cancelled) {
        pipWindow.close();
        return;
      }
      // Restore the player into the main window when the PiP window closes.
      pipWindow.addEventListener("pagehide", onLeave, { once: true });
      setContainer(pipWindow.document.querySelector<HTMLElement>("[data-pip-container]"));
    })();

    return () => {
      cancelled = true;
      setContainer(null);
      if (pipWindow && !pipWindow.closed) pipWindow.close();
    };
  }, [active]);

  return active ? container : null;
}

// -------------------------------------------------------------------- engine

function useEngineSettingsSync(engine: PlayerEngine | null): void {
  const volume = useSettingsStore((s) => s.volume);
  const muted = useSettingsStore((s) => s.muted);
  const rate = useSettingsStore((s) => s.rate);
  const boost = useSettingsStore((s) => s.boost);
  const loopMode = useSettingsStore((s) => s.loopMode);
  const loopA = useSettingsStore((s) => s.loopA);
  const loopB = useSettingsStore((s) => s.loopB);
  const maxRepeats = useSettingsStore((s) => s.maxRepeats);

  useEffect(() => {
    engine?.setVolume(volume);
  }, [engine, volume]);
  useEffect(() => {
    engine?.setMuted(muted);
  }, [engine, muted]);
  useEffect(() => {
    engine?.setPlaybackRate(rate);
  }, [engine, rate]);
  useEffect(() => {
    engine?.setBoost(boost);
  }, [engine, boost]);
  useEffect(() => {
    engine?.setLoop({ mode: loopMode, a: loopA, b: loopB, maxRepeats });
  }, [engine, loopMode, loopA, loopB, maxRepeats]);
}

function PlayerShell({ item }: { item: LibraryItem }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const reattachRef = useRef<HTMLInputElement>(null);
  const [engine, setEngine] = useState<PlayerEngine | null>(null);
  const [sourceMissing, setSourceMissing] = useState(false);
  const [nonce, setNonce] = useState(0);

  useEngineSettingsSync(engine);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    let created: PlayerEngine | null = null;
    let unsubscribe: (() => void) | null = null;

    const host = hostRef.current;
    if (!host) return;

    const boot = async () => {
      setSourceMissing(false);
      const settings = useSettingsStore.getState();
      const player = usePlayerStore.getState();

      let src: string | null = null;
      if (item.kind === "local-file") {
        const registered = getRegisteredFile(item.id);
        if (registered) {
          src = URL.createObjectURL(registered);
        } else if (item.storedInIdb) {
          const blob = await loadLocalFileFromIdb(item.id);
          if (blob) src = URL.createObjectURL(blob);
        }
        if (cancelled) {
          if (src) URL.revokeObjectURL(src);
          return;
        }
        if (!src) {
          setSourceMissing(true);
          return;
        }
        objectUrl = src;
      }

      // Prefer the live position (PiP remount); otherwise the stored resume point.
      const liveTime = player.currentItemId === item.id ? player.currentTime : 0;
      const resumeTime =
        liveTime > 0.5 ? liveTime : settings.rememberPosition ? (settings.positions[item.id] ?? 0) : 0;

      const options: EngineMountOptions = {
        item,
        src,
        startAt: resumeTime,
        autoplay: player.autoplayIntent,
        volume: settings.volume,
        muted: settings.muted,
        rate: settings.rate,
        boost: settings.boost,
        loop: {
          mode: settings.loopMode,
          a: settings.loopA,
          b: settings.loopB,
          maxRepeats: settings.maxRepeats,
        },
      };

      const instance: PlayerEngine =
        item.kind === "local-file" ? new LocalMediaEngine() : new YouTubeEngine();
      created = instance;
      unsubscribe = instance.onEvent((event) => usePlayerStore.getState().handleEngineEvent(event));
      try {
        await instance.mount(host, options);
      } catch (error) {
        const message = error instanceof Error ? error.message : "The player failed to initialize.";
        usePlayerStore.getState().handleEngineEvent({ type: "error", message, recoverable: false });
      }
      if (cancelled) {
        instance.destroy();
        return;
      }
      setEngine(instance);
      usePlayerStore.getState().setEngine(instance);
    };

    void boot();

    return () => {
      cancelled = true;
      unsubscribe?.();
      created?.destroy();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      const player = usePlayerStore.getState();
      if (created && player.engine === created) player.setEngine(null);
      setEngine(null);
    };
  }, [item, nonce]);

  const onReattach = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || item.kind !== "local-file") return;
    registerFile(item.id, file);
    if (useSettingsStore.getState().persistLocalFiles) {
      const ok = await saveLocalFileToIdb(item.id, file);
      useLibraryStore.getState().markStoredInIdb(item.id, ok);
    }
    setSourceMissing(false);
    setNonce((n) => n + 1);
  };

  return (
    <div className="group/shell relative h-full w-full overflow-hidden bg-black" data-player-shell>
      <div className="absolute inset-0" data-engine-shell>
        <div ref={hostRef} className="h-full w-full [&>iframe]:block [&>iframe]:h-full [&>iframe]:w-full" />
      </div>

      {item.kind === "local-file" && item.mediaType === "audio" && !sourceMissing && (
        <AudioBackdrop item={item} />
      )}

      <TopOverlay item={item} />
      <ErrorOverlay />

      {sourceMissing && item.kind === "local-file" && (
        <MissingSourceOverlay item={item} onPick={() => reattachRef.current?.click()} />
      )}

      <input
        ref={reattachRef}
        type="file"
        accept={FILE_INPUT_ACCEPT}
        className="hidden"
        aria-hidden
        onChange={onReattach}
      />
    </div>
  );
}

// ------------------------------------------------------------------ overlays

function TopOverlay({ item }: { item: LibraryItem }) {
  const trackTitle = usePlayerStore((s) => s.trackTitle);
  const status = usePlayerStore((s) => s.status);
  const playlist = usePlayerStore((s) => s.playlist);
  const loopCompleted = usePlayerStore((s) => s.loopCompleted);
  const maxRepeats = useSettingsStore((s) => s.maxRepeats);
  const rate = useSettingsStore((s) => s.rate);

  const kindLabel =
    item.kind === "youtube-playlist" ? "Playlist" : item.kind === "youtube-video" ? "YouTube" : item.mediaType === "audio" ? "Audio" : "Video";

  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-3 bg-gradient-to-b from-black/70 via-black/20 to-transparent p-3 opacity-0 transition-opacity duration-300 group-focus-within/shell:opacity-100 group-hover/shell:opacity-100 data-[show]:opacity-100"
      data-show={status === "paused" || undefined}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="shrink-0 rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white/90 backdrop-blur">
          {kindLabel}
        </span>
        <p className="truncate text-sm font-medium text-white">{trackTitle ?? displayTitle(item)}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5 text-[10px] font-semibold text-white/90">
        {playlist && playlist.count > 0 && (
          <span className="rounded-md bg-white/10 px-1.5 py-0.5 backdrop-blur tabular-nums">
            {playlist.index + 1}/{playlist.count}
          </span>
        )}
        {maxRepeats > 0 && (
          <span className="rounded-md bg-white/10 px-1.5 py-0.5 backdrop-blur tabular-nums">
            repeat {loopCompleted}/{maxRepeats}
          </span>
        )}
        {rate !== 1 && <span className="rounded-md bg-white/10 px-1.5 py-0.5 backdrop-blur tabular-nums">{rate}×</span>}
      </div>
    </div>
  );
}

function ErrorOverlay() {
  const errorMessage = usePlayerStore((s) => s.errorMessage);
  if (!errorMessage) return null;
  return (
    <div className="absolute inset-0 z-30 grid place-items-center bg-black/75 p-6 backdrop-blur-sm">
      <div className="max-w-sm space-y-3 text-center">
        <CircleAlert className="mx-auto fg-danger" size={30} aria-hidden />
        <p className="text-sm leading-relaxed text-white">{errorMessage}</p>
        <div className="flex justify-center gap-2">
          <button
            type="button"
            className="ghost-btn text-white"
            onClick={() => usePlayerStore.setState({ errorMessage: null })}
          >
            Dismiss
          </button>
          <button
            type="button"
            className="accent-btn"
            onClick={() => {
              usePlayerStore.setState({ errorMessage: null });
              usePlayerStore.getState().playNext({ manual: true });
            }}
          >
            Play next
          </button>
        </div>
      </div>
    </div>
  );
}

function AudioBackdrop({ item }: { item: LocalFileItem }) {
  const status = usePlayerStore((s) => s.status);
  return (
    <div className="absolute inset-0 z-[5] grid place-items-center overflow-hidden bg-app">
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background:
            "radial-gradient(60% 60% at 50% 45%, var(--accent-soft) 0%, transparent 70%), radial-gradient(40% 40% at 80% 80%, var(--accent-soft) 0%, transparent 70%)",
        }}
      />
      <div className="relative flex flex-col items-center gap-4 px-6 text-center">
        <span className="grid h-16 w-16 place-items-center rounded-3xl bg-elev fg-accent shadow-lg">
          <Repeat size={26} aria-hidden />
        </span>
        <div>
          <p className="max-w-md truncate text-base font-semibold fg-base">{displayTitle(item)}</p>
          <p className="mt-1 text-xs fg-faint">Local audio</p>
        </div>
        <span className="eq-bars eq-bars--lg" data-playing={status === "playing" || undefined} aria-hidden>
          <span />
          <span />
          <span />
          <span />
          <span />
        </span>
      </div>
    </div>
  );
}

function MissingSourceOverlay({ item, onPick }: { item: LocalFileItem; onPick: () => void }) {
  return (
    <div className="absolute inset-0 z-20 grid place-items-center bg-panel p-6">
      <div className="flex max-w-sm flex-col items-center gap-3 text-center">
        <FileWarning size={30} className="fg-danger" aria-hidden />
        <p className="text-sm font-semibold fg-base">This file isn’t available in this session</p>
        <p className="text-xs leading-relaxed fg-dim">
          Browsers can’t keep local files between visits. Re-attach “{item.fileName}” to play it — or enable
          IndexedDB persistence in Settings so files survive reloads.
        </p>
        <button type="button" className="accent-btn" onClick={onPick}>
          <Upload size={14} aria-hidden /> Re-attach file
        </button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ empty & pip

function EmptyStage() {
  return (
    <div className="grid h-full place-items-center overflow-hidden bg-app p-6">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(55% 55% at 30% 20%, var(--accent-soft) 0%, transparent 70%), radial-gradient(45% 45% at 75% 80%, var(--accent-soft) 0%, transparent 70%)",
        }}
      />
      <div className="relative flex max-w-lg flex-col items-center gap-5 text-center">
        <span className="grid h-16 w-16 place-items-center rounded-3xl bg-accent text-[var(--accent-ink)] shadow-xl">
          <Repeat size={28} aria-hidden />
        </span>
        <div className="space-y-2">
          <h1 className="font-display text-2xl font-bold tracking-tight fg-base sm:text-3xl">Loop anything.</h1>
          <p className="text-sm leading-relaxed fg-dim">
            Paste a YouTube video or playlist link, or drop audio/video files anywhere on the page. Loop whole
            tracks, playlists, or a precise A–B segment.
          </p>
        </div>
        <ul className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[11px] fg-faint">
          <li><kbd className="kbd">Space</kbd> play/pause</li>
          <li><kbd className="kbd">←/→</kbd> seek</li>
          <li><kbd className="kbd">L</kbd> loop</li>
          <li><kbd className="kbd">[ ]</kbd> speed</li>
          <li><kbd className="kbd">P</kbd> PiP</li>
          <li><kbd className="kbd">N</kbd> next</li>
        </ul>
      </div>
    </div>
  );
}

function PipDocked() {
  const setPipMode = usePlayerStore((s) => s.setPipMode);
  return (
    <div className="grid h-full place-items-center bg-panel p-6 text-center">
      <div className="flex flex-col items-center gap-3">
        <PictureInPicture2 size={28} className="fg-accent" aria-hidden />
        <p className="text-sm fg-dim">Playing in Picture-in-Picture.</p>
        <button type="button" className="accent-btn" onClick={() => setPipMode("off")}>
          Bring back to this tab
        </button>
      </div>
    </div>
  );
}

// --------------------------------------------------------------- mini player

function MiniPlayerFrame({ children }: { children: ReactNode }) {
  const setPipMode = usePlayerStore((s) => s.setPipMode);
  const [offset, setOffset] = useState({ x: 16, y: 96 });
  const dragState = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    baseX: number;
    baseY: number;
  } | null>(null);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragState.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      baseX: offset.x,
      baseY: offset.y,
    };
  };
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragState.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setOffset({
      x: clamp(drag.baseX - (event.clientX - drag.startX), 0, window.innerWidth - 260),
      y: clamp(drag.baseY - (event.clientY - drag.startY), 0, window.innerHeight - 140),
    });
  };
  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragState.current?.pointerId === event.pointerId) dragState.current = null;
  };

  return (
    <div
      role="dialog"
      aria-label="Mini player"
      className="fixed z-[70] w-[min(400px,calc(100vw-2rem))]"
      style={{ right: offset.x, bottom: offset.y }}
    >
      <div
        className="flex h-[250px] flex-col overflow-hidden rounded-xl border bd-soft bg-black shadow-2xl"
        style={{ resize: "both", minWidth: 280, minHeight: 200, maxWidth: "85vw", maxHeight: "75vh" }}
      >
        <div
          className="flex h-8 shrink-0 cursor-move touch-none select-none items-center gap-2 border-b bd-soft bg-panel px-2"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <GripHorizontal size={14} className="fg-faint" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-[11px] font-medium fg-dim">
            Mini player — drag me, resize from the corner
          </span>
          <button
            type="button"
            className="mini-btn"
            aria-label="Close mini player"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => setPipMode("off")}
          >
            <X size={13} aria-hidden />
          </button>
        </div>
        <div className="relative min-h-0 flex-1">{children}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------- stage

export function PlayerStage() {
  const items = useLibraryStore((s) => s.items);
  const currentItemId = usePlayerStore((s) => s.currentItemId);
  const pipMode = usePlayerStore((s) => s.pipMode);
  const item = items.find((i) => i.id === currentItemId) ?? null;

  const docPipContainer = useDocumentPipContainer(pipMode === "document");

  const shell = item ? <PlayerShell key={item.id} item={item} /> : <EmptyStage />;

  return (
    <div className="flex min-h-0 flex-1 flex-col px-3 pt-3 sm:px-5 sm:pt-4">
      <div className="min-h-0 flex-1 [container-type:size]">
        <div className="flex h-full w-full items-center justify-center">
          <div className="relative aspect-video w-[min(100cqw,177.78cqh)] max-w-full overflow-hidden rounded-2xl border bd-soft bg-black shadow-2xl">
            {pipMode === "off" ? shell : <PipDocked />}
          </div>
        </div>
      </div>

      {pipMode === "mini" && createPortal(<MiniPlayerFrame>{shell}</MiniPlayerFrame>, document.body)}
      {pipMode === "document" && docPipContainer ? createPortal(shell, docPipContainer) : null}
    </div>
  );
}
