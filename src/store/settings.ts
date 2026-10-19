/**
 * Persisted user settings (volume, loop, speed, theme...) plus the
 * remembered playback positions per library item.
 * Storage key: `loopdeck:settings` in localStorage.
 */

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { LoopMode } from "@/lib/engine/types";
import { BOOST_MAX, BOOST_MIN } from "@/lib/audio/boost";
import { clamp } from "@/lib/utils/format";

export type ThemePreference = "system" | "light" | "dark";

export const PLAYBACK_RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;

export interface SettingsState {
  volume: number;
  muted: boolean;
  boost: number;

  loopMode: LoopMode;
  /** Last non-off mode — the target of the "toggle loop" shortcut. */
  lastLoopMode: LoopMode;
  loopA: number | null;
  loopB: number | null;
  maxRepeats: number;

  rate: number;
  autoplayNext: boolean;
  shuffle: boolean;
  rememberPosition: boolean;

  theme: ThemePreference;
  persistLocalFiles: boolean;

  /** Seconds per library item id, only when rememberPosition is on. */
  positions: Record<string, number>;

  setVolume(volume: number): void;
  setMuted(muted: boolean): void;
  toggleMuted(): void;
  setBoost(boost: number): void;

  setLoopMode(mode: LoopMode): void;
  toggleLoop(): void;
  setLoopA(seconds: number | null): void;
  setLoopB(seconds: number | null): void;
  clearLoopPoints(): void;
  setMaxRepeats(repeats: number): void;

  setRate(rate: number): void;
  stepRate(direction: 1 | -1): void;
  setAutoplayNext(enabled: boolean): void;
  setShuffle(enabled: boolean): void;
  setRememberPosition(enabled: boolean): void;

  setTheme(theme: ThemePreference): void;
  setPersistLocalFiles(enabled: boolean): void;

  setPosition(itemId: string, seconds: number): void;
  removePosition(itemId: string): void;
  clearPositions(): void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      volume: 80,
      muted: false,
      boost: 100,

      loopMode: "off",
      lastLoopMode: "video",
      loopA: null,
      loopB: null,
      maxRepeats: 0,

      rate: 1,
      autoplayNext: true,
      shuffle: false,
      rememberPosition: true,

      theme: "system",
      persistLocalFiles: false,
      positions: {},

      setVolume: (volume) => set({ volume: clamp(Math.round(volume), 0, 100) }),
      setMuted: (muted) => set({ muted }),
      toggleMuted: () => set((s) => ({ muted: !s.muted })),
      setBoost: (boost) => set({ boost: clamp(Math.round(boost), BOOST_MIN, BOOST_MAX) }),

      setLoopMode: (mode) =>
        set((s) => ({
          loopMode: mode,
          lastLoopMode: mode !== "off" ? mode : s.lastLoopMode,
        })),
      toggleLoop: () =>
        set((s) => ({
          loopMode: s.loopMode === "off" ? s.lastLoopMode : "off",
        })),
      setLoopA: (seconds) =>
        set({ loopA: seconds === null ? null : Math.max(0, seconds) }),
      setLoopB: (seconds) =>
        set({ loopB: seconds === null ? null : Math.max(0, seconds) }),
      clearLoopPoints: () => set({ loopA: null, loopB: null }),
      setMaxRepeats: (repeats) =>
        set({ maxRepeats: Number.isFinite(repeats) ? clamp(Math.floor(repeats), 0, 999) : 0 }),

      setRate: (rate) => set({ rate: clamp(rate, 0.25, 2) }),
      stepRate: (direction) => {
        const current = get().rate;
        const rates = PLAYBACK_RATES;
        let nextIndex = 0;
        let best = Number.POSITIVE_INFINITY;
        rates.forEach((r, i) => {
          const d = Math.abs(r - current);
          if (d < best) {
            best = d;
            nextIndex = i;
          }
        });
        nextIndex = clamp(nextIndex + direction, 0, rates.length - 1);
        set({ rate: rates[nextIndex] });
      },
      setAutoplayNext: (enabled) => set({ autoplayNext: enabled }),
      setShuffle: (enabled) => set({ shuffle: enabled }),
      setRememberPosition: (enabled) => set({ rememberPosition: enabled }),

      setTheme: (theme) => set({ theme }),
      setPersistLocalFiles: (enabled) => set({ persistLocalFiles: enabled }),

      setPosition: (itemId, seconds) =>
        set((s) => ({
          positions: {
            ...s.positions,
            [itemId]: Number.isFinite(seconds) && seconds > 0 ? seconds : 0,
          },
        })),
      removePosition: (itemId) =>
        set((s) => {
          if (!(itemId in s.positions)) return s;
          const positions = { ...s.positions };
          delete positions[itemId];
          return { positions };
        }),
      clearPositions: () => set({ positions: {} }),
    }),
    {
      name: "loopdeck:settings",
      storage: createJSONStorage(() => localStorage),
      version: 1,
    },
  ),
);
