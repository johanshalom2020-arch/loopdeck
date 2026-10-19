"use client";

import {
  ListVideo,
  Loader2,
  Pause,
  PictureInPicture2,
  Play,
  Repeat,
  RotateCcw,
  Settings2,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume1,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { useRef, useState, type CSSProperties } from "react";
import { IconButton, Menu, MenuRadioItem } from "@/components/ui";
import { LOOP_MODE_LABELS, type LoopMode } from "@/lib/engine/types";
import { displayAuthor, displayTitle } from "@/lib/types";
import { formatTime } from "@/lib/utils/format";
import { useLibraryStore } from "@/store/library";
import { usePlayerStore } from "@/store/player";
import { PLAYBACK_RATES, useSettingsStore } from "@/store/settings";

// ------------------------------------------------------------------ seek row

function SeekRow({ disabled }: { disabled: boolean }) {
  const duration = usePlayerStore((s) => s.duration);
  const currentTime = usePlayerStore((s) => s.currentTime);
  const loopA = useSettingsStore((s) => s.loopA);
  const loopB = useSettingsStore((s) => s.loopB);
  const [scrub, setScrub] = useState<number | null>(null);
  const lastLiveSeek = useRef(0);

  const enabled = !disabled && duration > 0;
  const value = Math.min(scrub ?? currentTime, Math.max(duration, 0));

  const liveSeek = (v: number, commit: boolean) => {
    const now = performance.now();
    if (commit || now - lastLiveSeek.current > 160) {
      lastLiveSeek.current = now;
      usePlayerStore.getState().seekTo(v);
    }
  };

  const marker = (seconds: number, label: string) => (
    <span
      key={label}
      className="pointer-events-none absolute -top-0.5 flex -translate-x-1/2 items-center"
      style={{ left: `${(seconds / duration) * 100}%` }}
    >
      <span className="h-2 w-0.5 rounded-full bg-[var(--accent)]" />
      <span className="ml-0.5 text-[9px] font-bold fg-accent">{label}</span>
    </span>
  );

  return (
    <div className="mb-1 flex items-center gap-3">
      <div className="relative flex-1">
        <input
          type="range"
          className="ld-range"
          min={0}
          max={duration > 0 ? duration : 1}
          step={0.1}
          value={enabled ? value : 0}
          disabled={!enabled}
          aria-label="Seek"
          aria-valuetext={`${formatTime(value)} of ${formatTime(duration)}`}
          style={{ "--fill": `${(value / (duration > 0 ? duration : 1)) * 100}%` } as CSSProperties}
          onChange={(event) => {
            const v = Number(event.target.value);
            setScrub(v);
            liveSeek(v, false);
          }}
          onPointerUp={(event) => {
            const v = Number((event.target as HTMLInputElement).value);
            liveSeek(v, true);
            setScrub(null);
          }}
          onKeyUp={() => setScrub(null)}
          onBlur={() => setScrub(null)}
        />
        {enabled && loopA !== null && loopA < duration && marker(loopA, "A")}
        {enabled && loopB !== null && loopB <= duration && marker(loopB, "B")}
      </div>
      <span className="w-[104px] shrink-0 text-right text-[11px] tabular-nums fg-dim">
        {formatTime(value)}
        <span className="fg-faint"> / {formatTime(duration)}</span>
      </span>
    </div>
  );
}

// ----------------------------------------------------------------- transport

const LOOP_DESCRIPTIONS: Record<LoopMode, string> = {
  off: "Play through once",
  video: "Repeat the current item forever",
  playlist: "Repeat the whole queue",
  ab: "Repeat between A and B points",
};

function TransportCluster({ engineReady }: { engineReady: boolean }) {
  const status = usePlayerStore((s) => s.status);
  const shuffle = useSettingsStore((s) => s.shuffle);
  const loopMode = useSettingsStore((s) => s.loopMode);

  const playLabel =
    status === "ended" ? "Replay" : status === "playing" || status === "buffering" ? "Pause" : "Play";

  return (
    <div className="flex items-center gap-1">
      <IconButton
        aria-label={shuffle ? "Shuffle on" : "Shuffle off"}
        aria-pressed={shuffle}
        title="Shuffle"
        active={shuffle}
        onClick={() => {
          const next = !useSettingsStore.getState().shuffle;
          useSettingsStore.getState().setShuffle(next);
          usePlayerStore.getState().pushToast("info", next ? "Shuffle on" : "Shuffle off");
        }}
      >
        <Shuffle size={16} aria-hidden />
      </IconButton>

      <IconButton aria-label="Previous (Shift+N)" title="Previous" onClick={() => usePlayerStore.getState().playPrevious()}>
        <SkipBack size={17} aria-hidden />
      </IconButton>

      <button
        type="button"
        className="play-btn"
        aria-label={`${playLabel} (Space)`}
        disabled={!engineReady}
        onClick={() => {
          const player = usePlayerStore.getState();
          if (player.status === "ended") player.replay();
          else player.togglePlay();
        }}
      >
        {status === "buffering" ? (
          <Loader2 size={19} aria-hidden className="animate-spin" />
        ) : status === "ended" ? (
          <RotateCcw size={18} aria-hidden />
        ) : status === "playing" ? (
          <Pause size={19} aria-hidden />
        ) : (
          <Play size={19} aria-hidden className="translate-x-[1px]" />
        )}
      </button>

      <IconButton
        aria-label="Next (N)"
        title="Next"
        onClick={() => usePlayerStore.getState().playNext({ manual: true })}
      >
        <SkipForward size={17} aria-hidden />
      </IconButton>

      <Menu
        label="Loop mode"
        button={({ toggle }) => (
          <IconButton
            aria-label={`Loop mode: ${LOOP_MODE_LABELS[loopMode]}`}
            aria-pressed={loopMode !== "off"}
            title="Loop (L)"
            active={loopMode !== "off"}
            onClick={toggle}
          >
            {loopMode === "ab" ? <ListVideo size={16} aria-hidden /> : <Repeat size={16} aria-hidden />}
          </IconButton>
        )}
      >
        {(close) => (
          <>
            {(Object.keys(LOOP_MODE_LABELS) as LoopMode[]).map((mode) => (
              <MenuRadioItem
                key={mode}
                checked={loopMode === mode}
                description={LOOP_DESCRIPTIONS[mode]}
                onSelect={() => {
                  useSettingsStore.getState().setLoopMode(mode);
                  usePlayerStore.getState().pushToast("info", `Loop mode: ${LOOP_MODE_LABELS[mode]}`);
                  close();
                }}
              >
                {LOOP_MODE_LABELS[mode]}
              </MenuRadioItem>
            ))}
          </>
        )}
      </Menu>

      <AbControls disabled={!engineReady} />
    </div>
  );
}

function AbControls({ disabled }: { disabled: boolean }) {
  const loopA = useSettingsStore((s) => s.loopA);
  const loopB = useSettingsStore((s) => s.loopB);
  const loopMode = useSettingsStore((s) => s.loopMode);
  const active = loopMode === "ab";
  const cls = `ab-btn ${active ? "ab-btn--active" : ""}`;

  return (
    <div className="ml-1 flex items-center gap-0.5 rounded-lg border bd-soft p-0.5" role="group" aria-label="A–B loop points">
      <button
        type="button"
        className={cls}
        disabled={disabled}
        aria-label="Set loop point A at the current position"
        title="Set A at current position"
        onClick={() => usePlayerStore.getState().setLoopAFromCurrent()}
      >
        {loopA === null ? "A" : formatTime(loopA)}
      </button>
      <button
        type="button"
        className={cls}
        disabled={disabled}
        aria-label="Set loop point B at the current position"
        title="Set B at current position"
        onClick={() => usePlayerStore.getState().setLoopBFromCurrent()}
      >
        {loopB === null ? "B" : formatTime(loopB)}
      </button>
      {(loopA !== null || loopB !== null) && (
        <button
          type="button"
          className="ab-btn fg-danger"
          aria-label="Clear A–B points"
          title="Clear A–B points"
          onClick={() => useSettingsStore.getState().clearLoopPoints()}
        >
          <X size={11} aria-hidden />
        </button>
      )}
    </div>
  );
}

// ----------------------------------------------------------------- center

function CenterInfo() {
  const currentItemId = usePlayerStore((s) => s.currentItemId);
  const trackTitle = usePlayerStore((s) => s.trackTitle);
  const playlist = usePlayerStore((s) => s.playlist);
  const loopCompleted = usePlayerStore((s) => s.loopCompleted);
  const items = useLibraryStore((s) => s.items);
  const loopMode = useSettingsStore((s) => s.loopMode);
  const maxRepeats = useSettingsStore((s) => s.maxRepeats);

  const item = items.find((i) => i.id === currentItemId);
  if (!item) return <div className="min-w-0 flex-1" aria-hidden />;

  const pieces: string[] = [];
  const author = displayAuthor(item);
  if (author) pieces.push(author);
  if (playlist && playlist.count > 0) pieces.push(`video ${playlist.index + 1} of ${playlist.count}`);
  if (loopMode !== "off" && maxRepeats > 0) pieces.push(`repeat ${loopCompleted}/${maxRepeats}`);
  if (loopMode === "ab") pieces.push("A–B");

  return (
    <div className="hidden min-w-0 flex-1 px-3 md:block">
      <p className="truncate text-[13px] font-medium leading-tight">{trackTitle ?? displayTitle(item)}</p>
      <p className="truncate text-[11px] leading-tight fg-faint">{pieces.join(" · ") || " "}</p>
    </div>
  );
}

// -------------------------------------------------------------------- right

function RightCluster({ engineReady }: { engineReady: boolean }) {
  const rate = useSettingsStore((s) => s.rate);
  const volume = useSettingsStore((s) => s.volume);
  const muted = useSettingsStore((s) => s.muted);
  const pipMode = usePlayerStore((s) => s.pipMode);
  const nativePipActive = usePlayerStore((s) => s.nativePipActive);

  const VolumeIcon = muted || volume === 0 ? VolumeX : volume < 50 ? Volume1 : Volume2;
  const pipActive = pipMode !== "off" || nativePipActive;

  return (
    <div className="ml-auto flex items-center gap-1">
      <Menu
        label="Playback speed"
        align="right"
        button={({ toggle }) => (
          <button
            type="button"
            className="ghost-btn h-8 w-[60px] justify-center tabular-nums"
            aria-label={`Playback speed: ${rate}x`}
            title="Speed ([ and ])"
            onClick={toggle}
          >
            {rate}×
          </button>
        )}
      >
        {(close) => (
          <>
            {PLAYBACK_RATES.map((r) => (
              <MenuRadioItem
                key={r}
                checked={r === rate}
                onSelect={() => {
                  useSettingsStore.getState().setRate(r);
                  close();
                }}
              >
                {r}×
              </MenuRadioItem>
            ))}
          </>
        )}
      </Menu>

      <IconButton
        aria-label={muted ? "Unmute (M)" : "Mute (M)"}
        aria-pressed={muted}
        title="Mute (M)"
        onClick={() => useSettingsStore.getState().toggleMuted()}
      >
        <VolumeIcon size={17} aria-hidden />
      </IconButton>

      <input
        type="range"
        className="ld-range hidden w-20 lg:block"
        min={0}
        max={100}
        value={muted ? 0 : volume}
        aria-label="Volume"
        aria-valuetext={`${volume}%`}
        style={{ "--fill": `${muted ? 0 : volume}%` } as CSSProperties}
        onChange={(event) => {
          const v = Number(event.target.value);
          useSettingsStore.getState().setVolume(v);
          if (muted && v > 0) useSettingsStore.getState().setMuted(false);
        }}
      />

      <IconButton
        aria-label="Picture in Picture (P)"
        aria-pressed={pipActive}
        title="Picture in Picture (P)"
        active={pipActive}
        disabled={!engineReady}
        onClick={() => usePlayerStore.getState().togglePip()}
      >
        <PictureInPicture2 size={16} aria-hidden />
      </IconButton>

      <IconButton
        aria-label="Open settings"
        title="Settings"
        onClick={() => usePlayerStore.getState().setSettingsOpen(true)}
      >
        <Settings2 size={16} aria-hidden />
      </IconButton>
    </div>
  );
}

// ---------------------------------------------------------------------- bar

export function ControlsBar() {
  const engine = usePlayerStore((s) => s.engine);
  return (
    <footer aria-label="Playback controls" className="border-t bd-soft bg-panel px-3 pb-2.5 pt-1 sm:px-5">
      <SeekRow disabled={!engine} />
      <div className="flex items-center gap-x-1 gap-y-1.5 max-md:flex-wrap">
        <TransportCluster engineReady={Boolean(engine)} />
        <CenterInfo />
        <RightCluster engineReady={Boolean(engine)} />
      </div>
    </footer>
  );
}
