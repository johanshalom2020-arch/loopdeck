"use client";

import { PanelLeft, Repeat, Settings2, Upload } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ControlsBar } from "@/components/ControlsBar";
import { LibraryPanel } from "@/components/LibraryPanel";
import { PlayerStage } from "@/components/PlayerStage";
import { SettingsSheet } from "@/components/SettingsSheet";
import { Toaster } from "@/components/Toaster";
import { IconButton } from "@/components/ui";
import { useHydrated } from "@/hooks/useHydrated";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useMediaSession } from "@/hooks/useMediaSession";
import { useTheme } from "@/hooks/useTheme";
import { ingestLocalFiles } from "@/lib/files/ingest";
import { usePlayerStore } from "@/store/player";
import { useSettingsStore } from "@/store/settings";

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-accent text-[var(--accent-ink)] shadow-md">
        <Repeat size={15} aria-hidden />
      </span>
      <span className="font-display text-lg font-bold tracking-tight">Loopdeck</span>
      <span className="hidden rounded-md bg-elev px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest fg-faint sm:inline">
        media looper
      </span>
    </div>
  );
}

function SplashScreen() {
  return (
    <div className="grid h-dvh place-items-center bg-app">
      <div className="flex animate-pulse flex-col items-center gap-3">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-accent text-[var(--accent-ink)]">
          <Repeat size={20} aria-hidden />
        </span>
        <span className="font-display text-sm font-semibold tracking-wide fg-dim">Loopdeck</span>
      </div>
    </div>
  );
}

function Shell() {
  useKeyboardShortcuts();
  useMediaSession();

  const shuffle = useSettingsStore((s) => s.shuffle);
  const libraryOpen = usePlayerStore((s) => s.libraryOpen);
  const setLibraryOpen = usePlayerStore((s) => s.setLibraryOpen);
  const [dragging, setDragging] = useState(false);

  // Keep the shuffle order in sync with the shuffle toggle.
  useEffect(() => {
    if (shuffle) {
      usePlayerStore.getState().rebuildShuffleOrder();
    } else {
      usePlayerStore.setState({ shuffleOrder: null });
    }
  }, [shuffle]);

  const handleFiles = useCallback(async (files: Iterable<File>) => {
    const result = await ingestLocalFiles(files);
    const push = usePlayerStore.getState().pushToast;
    if (result.added > 0) push("info", `Added ${result.added} file${result.added === 1 ? "" : "s"} to the library.`);
    if (result.duplicates > 0) push("warning", `${result.duplicates} duplicate${result.duplicates === 1 ? "" : "s"} skipped.`);
    if (result.rejected > 0) push("warning", `${result.rejected} unsupported file${result.rejected === 1 ? "" : "s"} ignored.`);
  }, []);

  // App-wide drag & drop with an enter/leave depth counter.
  useEffect(() => {
    let depth = 0;
    const hasFiles = (event: DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes("Files");

    const onDragEnter = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      depth += 1;
      setDragging(true);
    };
    const onDragOver = (event: DragEvent) => {
      if (hasFiles(event)) event.preventDefault();
    };
    const onDragLeave = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const onDrop = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      depth = 0;
      setDragging(false);
      const files = event.dataTransfer?.files;
      if (files && files.length > 0) void handleFiles(Array.from(files));
    };

    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [handleFiles]);

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-app fg-base">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b bd-soft bg-panel px-3 sm:px-5">
        <IconButton
          className="lg:hidden"
          aria-label="Toggle library panel"
          onClick={() => setLibraryOpen(!libraryOpen)}
        >
          <PanelLeft size={17} aria-hidden />
        </IconButton>
        <Logo />
        <div className="ml-auto flex items-center gap-1">
          <IconButton aria-label="Open settings" onClick={() => usePlayerStore.getState().setSettingsOpen(true)}>
            <Settings2 size={17} aria-hidden />
          </IconButton>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-[330px] shrink-0 border-r bd-soft bg-panel lg:block xl:w-[370px]">
          <LibraryPanel />
        </aside>

        {libraryOpen && (
          <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Library">
            <button
              type="button"
              aria-label="Close library"
              className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
              onClick={() => setLibraryOpen(false)}
            />
            <div className="animate-slide-in-left absolute inset-y-0 left-0 w-[86vw] max-w-sm border-r bd-soft bg-panel shadow-2xl">
              <LibraryPanel />
            </div>
          </div>
        )}

        <main className="flex min-w-0 flex-1 flex-col">
          <PlayerStage />
          <ControlsBar />
        </main>
      </div>

      <SettingsSheet />
      <Toaster />

      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-[90] grid place-items-center bg-[var(--accent-soft)] backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3 rounded-3xl border-2 border-dashed border-accent bg-panel px-10 py-8 shadow-2xl">
            <Upload size={28} className="fg-accent" aria-hidden />
            <p className="font-display text-lg font-semibold">Drop media files to add them</p>
            <p className="text-xs fg-dim">mp4 · webm · mov · mp3 · m4a · ogg</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AppShell() {
  const hydrated = useHydrated();
  useTheme();
  if (!hydrated) return <SplashScreen />;
  return <Shell />;
}
