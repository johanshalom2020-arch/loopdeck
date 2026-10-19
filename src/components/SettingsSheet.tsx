"use client";

import {
  Eye,
  Gauge,
  HardDrive,
  Info,
  Keyboard,
  Monitor,
  Moon,
  PictureInPicture2,
  Repeat,
  Sun,
  TriangleAlert,
  Volume2,
  X,
} from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { GhostButton, IconButton, Segmented, Slider, Switch } from "@/components/ui";
import { BOOST_SAFE_CEILING } from "@/lib/audio/boost";
import { LOOP_MODE_LABELS, type LoopMode } from "@/lib/engine/types";
import { isDocumentPiPSupported, isNativePiPSupported } from "@/lib/pip/pip";
import { isValidSegment } from "@/lib/utils/loopLogic";
import { usePlayerStore } from "@/store/player";
import { PLAYBACK_RATES, useSettingsStore, type ThemePreference } from "@/store/settings";

// ------------------------------------------------------------------ sections

function Section({ title, icon: Icon, children }: { title: string; icon: typeof Volume2; children: ReactNode }) {
  return (
    <section className="space-y-4 border-b bd-soft px-5 py-5">
      <h3 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] fg-faint">
        <Icon size={14} aria-hidden className="fg-accent" />
        {title}
      </h3>
      {children}
    </section>
  );
}

function Row({ label, hint, control }: { label: string; hint?: string; control: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm fg-base">{label}</p>
        {hint && <p className="mt-0.5 text-xs leading-relaxed fg-faint">{hint}</p>}
      </div>
      <div className="shrink-0 pt-0.5">{control}</div>
    </div>
  );
}

function SliderRow({
  label,
  display,
  children,
}: {
  label: string;
  display: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <p className="text-sm fg-base">{label}</p>
        <span className="text-xs tabular-nums fg-dim">{display}</span>
      </div>
      {children}
    </div>
  );
}

// -------------------------------------------------------------------- volume

function VolumeSection() {
  const volume = useSettingsStore((s) => s.volume);
  const muted = useSettingsStore((s) => s.muted);
  const boost = useSettingsStore((s) => s.boost);
  const engine = usePlayerStore((s) => s.engine);
  const supportsBoost = engine?.capabilities.supportsBoost ?? false;
  const boostDisabled = !supportsBoost;

  return (
    <Section title="Volume" icon={Volume2}>
      <SliderRow
        label="Master volume"
        display={`${volume}%`}
      >
        <Slider
          value={volume}
          min={0}
          max={100}
          label="Master volume"
          valueText={`${volume} percent`}
          onChange={(v) => useSettingsStore.getState().setVolume(v)}
        />
      </SliderRow>

      <Row
        label="Muted"
        control={
          <Switch
            checked={muted}
            onChange={(v) => useSettingsStore.getState().setMuted(v)}
            label="Mute"
          />
        }
      />

      <div className="group relative">
        <SliderRow label="Volume boost (local files)" display={`${boost}%`}>
          <div className={boostDisabled ? "opacity-45" : undefined}>
            <Slider
              value={boost}
              min={0}
              max={400}
              label="Volume boost percentage"
              valueText={`${boost} percent`}
              disabled={boostDisabled}
              dangerFrom={BOOST_SAFE_CEILING}
              onChange={(v) => useSettingsStore.getState().setBoost(v)}
            />
          </div>
        </SliderRow>
        {boostDisabled && (
          <p role="tooltip" className="mt-1 text-[11px] leading-relaxed fg-faint">
            Boost is unavailable for YouTube items: browsers block audio processing on cross-origin iframes.
            Play a local file to enable the gain graph (Web Audio → compressor), up to 400%.
          </p>
        )}
        {boost > BOOST_SAFE_CEILING && supportsBoost && (
          <p className="mt-2 flex items-start gap-2 rounded-lg bg-[var(--danger-soft)] p-2.5 text-xs leading-relaxed fg-danger">
            <TriangleAlert size={14} aria-hidden className="mt-0.5 shrink-0" />
            Above {BOOST_SAFE_CEILING}% audio will distort and can damage hearing. The built-in compressor
            catches most clipping — turn it down if it hurts.
          </p>
        )}
      </div>
    </Section>
  );
}

// ----------------------------------------------------------------------- pip

function PipSection() {
  const engine = usePlayerStore((s) => s.engine);
  const pipMode = usePlayerStore((s) => s.pipMode);
  const nativePipActive = usePlayerStore((s) => s.nativePipActive);
  const active = pipMode !== "off" || nativePipActive;

  return (
    <Section title="Picture in Picture" icon={PictureInPicture2}>
      <ul className="space-y-1.5 text-xs leading-relaxed fg-dim">
        <li>
          <span className="font-medium fg-base">Local videos:</span> native PiP
          {isNativePiPSupported() ? " (supported here)." : " (not supported by this browser)."}
        </li>
        <li>
          <span className="font-medium fg-base">YouTube:</span> Document Picture-in-Picture
          {isDocumentPiPSupported()
            ? " (supported here)."
            : " — not supported here, so Loopdeck falls back to a draggable in-page mini player."}
        </li>
        <li className="fg-faint">
          Moving the player reloads the iframe; Loopdeck restores your position and play state automatically.
        </li>
      </ul>
      <GhostButton className="w-full justify-center" disabled={!engine} onClick={() => usePlayerStore.getState().togglePip()}>
        <PictureInPicture2 size={14} aria-hidden />
        {active ? "Exit Picture-in-Picture" : "Enter Picture-in-Picture"}
      </GhostButton>
    </Section>
  );
}

// --------------------------------------------------------------------- looping

function LoopSection() {
  const loopMode = useSettingsStore((s) => s.loopMode);
  const loopA = useSettingsStore((s) => s.loopA);
  const loopB = useSettingsStore((s) => s.loopB);
  const maxRepeats = useSettingsStore((s) => s.maxRepeats);
  const loopCompleted = usePlayerStore((s) => s.loopCompleted);
  const engineReady = usePlayerStore((s) => s.engine !== null);

  const segmentValid = isValidSegment(loopA, loopB);

  return (
    <Section title="Looping" icon={Repeat}>
      <Segmented<LoopMode>
        ariaLabel="Loop mode"
        className="grid w-full grid-cols-2"
        value={loopMode}
        onChange={(mode) => useSettingsStore.getState().setLoopMode(mode)}
        options={(Object.keys(LOOP_MODE_LABELS) as LoopMode[]).map((mode) => ({
          value: mode,
          label: LOOP_MODE_LABELS[mode],
        }))}
      />

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <label className="mb-1 block text-xs fg-dim" htmlFor="loop-a">
              A point (seconds)
            </label>
            <input
              id="loop-a"
              type="number"
              min={0}
              step={0.1}
              value={loopA ?? ""}
              placeholder="—"
              className="num-input"
              onChange={(e) =>
                useSettingsStore.getState().setLoopA(e.target.value === "" ? null : Number(e.target.value))
              }
            />
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-xs fg-dim" htmlFor="loop-b">
              B point (seconds)
            </label>
            <input
              id="loop-b"
              type="number"
              min={0}
              step={0.1}
              value={loopB ?? ""}
              placeholder="—"
              className="num-input"
              onChange={(e) =>
                useSettingsStore.getState().setLoopB(e.target.value === "" ? null : Number(e.target.value))
              }
            />
          </div>
        </div>
        <div className="flex gap-2">
          <GhostButton className="flex-1 justify-center" disabled={!engineReady} onClick={() => usePlayerStore.getState().setLoopAFromCurrent()}>
            Set A to now
          </GhostButton>
          <GhostButton className="flex-1 justify-center" disabled={!engineReady} onClick={() => usePlayerStore.getState().setLoopBFromCurrent()}>
            Set B to now
          </GhostButton>
        </div>
        {loopA !== null && loopB !== null && !segmentValid && (
          <p role="alert" className="text-xs fg-danger">
            B must be greater than A for an A–B segment loop.
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <label className="text-sm fg-base" htmlFor="loop-repeats">
          Repeats
        </label>
        <input
          id="loop-repeats"
          type="number"
          min={0}
          max={999}
          step={1}
          value={maxRepeats}
          className="num-input w-28"
          onChange={(e) => useSettingsStore.getState().setMaxRepeats(Number(e.target.value))}
        />
        <p className="text-xs fg-faint">
          {maxRepeats === 0
            ? "0 = loop forever."
            : `${loopCompleted} of ${maxRepeats} repeats done (first play + ${maxRepeats} repeats).`}
        </p>
      </div>

      <p className="text-xs leading-relaxed fg-faint">
        For YouTube, single-video loops are re-triggered from the player’s ENDED event (the loop playerVar
        only works with playlists). A–B polling runs at ~100 ms while playing and stops with the player.
      </p>
    </Section>
  );
}

// ------------------------------------------------------------------ playback

function PlaybackSection() {
  const rate = useSettingsStore((s) => s.rate);
  const autoplayNext = useSettingsStore((s) => s.autoplayNext);
  const shuffle = useSettingsStore((s) => s.shuffle);
  const rememberPosition = useSettingsStore((s) => s.rememberPosition);
  const positions = useSettingsStore((s) => s.positions);
  const savedCount = Object.keys(positions).length;

  return (
    <Section title="Playback" icon={Gauge}>
      <div className="space-y-1.5">
        <p className="text-sm fg-base">Speed</p>
        <Segmented
          ariaLabel="Playback speed"
          className="grid w-full grid-cols-4"
          value={String(rate)}
          onChange={(v) => useSettingsStore.getState().setRate(Number(v))}
          options={PLAYBACK_RATES.map((r) => ({ value: String(r), label: `${r}×` }))}
        />
      </div>

      <Row
        label="Autoplay next"
        hint="Advance to the next library item when the current one ends."
        control={<Switch checked={autoplayNext} onChange={(v) => useSettingsStore.getState().setAutoplayNext(v)} label="Autoplay next" />}
      />
      <Row
        label="Shuffle"
        hint="Fisher–Yates shuffle; the current track keeps its place."
        control={<Switch checked={shuffle} onChange={(v) => useSettingsStore.getState().setShuffle(v)} label="Shuffle" />}
      />
      <Row
        label="Remember position"
        hint={`Resume each item where you left off. ${savedCount} position${savedCount === 1 ? "" : "s"} saved.`}
        control={<Switch checked={rememberPosition} onChange={(v) => useSettingsStore.getState().setRememberPosition(v)} label="Remember position" />}
      />
      {savedCount > 0 && (
        <GhostButton className="text-xs" onClick={() => useSettingsStore.getState().clearPositions()}>
          Clear saved positions
        </GhostButton>
      )}
    </Section>
  );
}

// --------------------------------------------------------------------- files

function FilesSection() {
  const persistLocalFiles = useSettingsStore((s) => s.persistLocalFiles);
  return (
    <Section title="Local files" icon={HardDrive}>
      <Row
        label="Keep files in IndexedDB"
        hint="Stores file blobs so they survive reloads. Off = only names/metadata persist and files must be re-attached after a reload."
        control={
          <Switch
            checked={persistLocalFiles}
            onChange={(v) => useSettingsStore.getState().setPersistLocalFiles(v)}
            label="Keep files in IndexedDB"
          />
        }
      />
    </Section>
  );
}

// --------------------------------------------------------------------- theme

function ThemeSection() {
  const theme = useSettingsStore((s) => s.theme);
  return (
    <Section title="Theme" icon={Eye}>
      <Segmented<ThemePreference>
        ariaLabel="Theme"
        className="grid w-full grid-cols-3"
        value={theme}
        onChange={(v) => useSettingsStore.getState().setTheme(v)}
        options={[
          { value: "system", label: <span className="inline-flex items-center gap-1.5"><Monitor size={13} aria-hidden />System</span> },
          { value: "light", label: <span className="inline-flex items-center gap-1.5"><Sun size={13} aria-hidden />Light</span> },
          { value: "dark", label: <span className="inline-flex items-center gap-1.5"><Moon size={13} aria-hidden />Dark</span> },
        ]}
      />
    </Section>
  );
}

// --------------------------------------------------------------------- about

const SHORTCUTS: Array<[string, string]> = [
  ["Space", "Play / pause"],
  ["← / →", "Seek 5 s"],
  ["Shift + ← / →", "Seek 10 s"],
  ["M", "Mute"],
  ["L", "Toggle loop"],
  ["P", "Picture in Picture"],
  ["N / Shift + N", "Next / previous"],
  ["[ / ]", "Speed down / up"],
];

function AboutSection() {
  return (
    <Section title="About" icon={Info}>
      <div className="space-y-1.5">
        <p className="flex items-center gap-2 text-sm fg-base">
          <Keyboard size={14} aria-hidden className="fg-faint" /> Keyboard shortcuts
        </p>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
          {SHORTCUTS.map(([keys, action]) => (
            <div key={keys} className="flex items-center justify-between gap-2">
              <dt className="fg-dim">{action}</dt>
              <dd>
                <kbd className="kbd">{keys}</kbd>
              </dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="rounded-xl border border-accent bg-[var(--accent-soft)] p-3 text-xs leading-relaxed fg-base">
        <p className="font-semibold">A note on ads</p>
        <p className="mt-1 fg-dim">
          Ads in YouTube playback are inserted and controlled by YouTube. Loopdeck does not block, hide, skip,
          or intercept ads — doing so would violate the YouTube Terms of Service. YouTube Premium removes ads
          everywhere, including embedded players.
        </p>
      </div>

      <p className="text-[11px] leading-relaxed fg-faint">
        Loopdeck plays YouTube content exclusively through the official IFrame Player API (privacy-enhanced
        youtube-nocookie host). No scraping, proxying, or unofficial extraction. YouTube playback remains
        subject to YouTube’s Terms of Service.
      </p>
      <p className="text-[11px] fg-faint">Loopdeck v1.0 · all data stays in your browser.</p>
    </Section>
  );
}

// --------------------------------------------------------------------- sheet

export function SettingsSheet() {
  const open = usePlayerStore((s) => s.settingsOpen);
  const setOpen = usePlayerStore((s) => s.setSettingsOpen);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, setOpen]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label="Settings">
      <button
        type="button"
        aria-label="Close settings"
        className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
        onClick={() => setOpen(false)}
      />
      <aside className="animate-slide-in absolute inset-y-0 right-0 flex w-[min(430px,100vw)] flex-col border-l bd-soft bg-panel shadow-2xl">
        <header className="flex h-14 shrink-0 items-center justify-between border-b bd-soft px-5">
          <h2 className="font-display text-base font-semibold tracking-tight">Settings</h2>
          <IconButton aria-label="Close settings" onClick={() => setOpen(false)}>
            <X size={16} aria-hidden />
          </IconButton>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <VolumeSection />
          <PipSection />
          <LoopSection />
          <PlaybackSection />
          <FilesSection />
          <ThemeSection />
          <AboutSection />
        </div>
      </aside>
    </div>
  );
}
