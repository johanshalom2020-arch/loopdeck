"use client";

/**
 * Global keyboard shortcuts:
 *   Space        play/pause          ←/→         seek 5s (Shift: 10s)
 *   M            mute                L           toggle loop
 *   P            Picture-in-Picture  N / ⇧N      next / previous
 *   [ / ]        playback speed down / up
 */

import { useEffect } from "react";
import { unlockAudioContext } from "@/lib/audio/boost";
import { LOOP_MODE_LABELS } from "@/lib/engine/types";
import { usePlayerStore } from "@/store/player";
import { useSettingsStore } from "@/store/settings";

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

export function useKeyboardShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isEditableTarget(event.target)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const player = usePlayerStore.getState();
      const settings = useSettingsStore.getState();

      switch (event.key) {
        case " ":
          event.preventDefault();
          unlockAudioContext();
          player.togglePlay();
          break;
        case "ArrowRight":
          event.preventDefault();
          player.seekBy(event.shiftKey ? 10 : 5);
          break;
        case "ArrowLeft":
          event.preventDefault();
          player.seekBy(event.shiftKey ? -10 : -5);
          break;
        case "m":
        case "M":
          settings.toggleMuted();
          break;
        case "l":
        case "L": {
          settings.toggleLoop();
          const mode = useSettingsStore.getState().loopMode;
          player.pushToast("info", `Loop mode: ${LOOP_MODE_LABELS[mode]}`);
          break;
        }
        case "p":
        case "P":
          player.togglePip();
          break;
        case "n":
          player.playNext({ manual: true });
          break;
        case "N":
          player.playPrevious();
          break;
        case "[":
          settings.stepRate(-1);
          break;
        case "]":
          settings.stepRate(1);
          break;
        default:
          break;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
