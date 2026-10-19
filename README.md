# Loopdeck

A production-quality, browser-based media player for **looping YouTube videos, playlists, and local audio/video files** — with A–B segment loops, playback speed, Web Audio volume boost, Picture-in-Picture, Media Session integration, and full keyboard control.

Built with Next.js 16 (App Router) · TypeScript (strict) · Tailwind CSS v4 · Zustand (persist) · the official YouTube IFrame Player API. **No backend database is required**: all state is client-side (localStorage + optional IndexedDB). Deploys to Vercel with zero config.

---

## Quick start

```bash
npm install
npm run dev          # http://localhost:3000
```

Production:

```bash
npm run build
npm run start
```

Quality gates:

```bash
npm run typecheck    # tsc --noEmit (strict)
npm run lint         # ESLint (eslint-config-next core-web-vitals)
npm run test         # Vitest unit tests
npx playwright install && npm run test:e2e   # Playwright smoke test
npm run format       # Prettier
```

### Deploy to Vercel

Zero configuration — it is a stock Next.js app:

```bash
npx vercel          # preview
npx vercel --prod   # production
```

or connect the Git repository in the Vercel dashboard and push.

---

## Feature matrix

| Feature                            | YouTube videos | YouTube playlists | Local files (mp4/webm/mov/mp3/m4a/ogg) |
| ---------------------------------- | -------------- | ----------------- | -------------------------------------- |
| Add by URL (oEmbed metadata)       | ✅             | ✅ (IDs resolve via IFrame API on play) | — (drag & drop / picker) |
| Transport: play/pause/seek, keys   | ✅             | ✅                | ✅ |
| Next / previous                    | library queue  | in-playlist, then queue | library queue |
| Volume 0–100% + mute               | ✅ (`setVolume`) | ✅           | ✅ + **boost 0–400%** (Web Audio gain → compressor) |
| Playback speed 0.25–2×             | ✅             | ✅                | ✅ |
| Loop video (manual seek-to-0 loop) | ✅             | per-video         | ✅ (`el.loop` for ∞, countable manual loop for finite) |
| Loop playlist                      | loops the library queue | `player.setLoop(true)` + manual fallback | loops the library queue |
| A–B segment loop                   | ✅ (~100 ms poll) | ✅ (per video) | ✅ (`timeupdate`-driven) |
| Repeat budget N + counter          | ✅             | ✅ (manual)     | ✅ (manual) |
| Shuffle (Fisher–Yates, keeps current) | library queue | library queue | library queue |
| Autoplay next                      | ✅             | ✅                | ✅ |
| Remember position per item         | ✅             | ✅                | ✅ |
| Picture-in-Picture                 | Document PiP (Chrome/Edge) → mini-player fallback | same | native PiP (video) / mini-player (audio) |
| Fullscreen experience              | via YouTube controls | via YouTube controls | via element controls |
| Media Session (media keys)         | ✅             | ✅ (live track title) | ✅ |
| Import / export library JSON       | ✅             | ✅                | metadata only (blobs never exported) |
| Survives reload                    | ✅             | ✅                | metadata always; blob only with IndexedDB toggle (else re-attach prompt) |

---

## Architecture

```
src/
├── app/
│   ├── layout.tsx / page.tsx / globals.css
│   └── api/oembed/route.ts        # server-side proxy for YouTube oEmbed (CORS-free, 6s timeout, CDN-cached)
├── lib/
│   ├── youtube/
│   │   ├── parseYouTubeUrl.ts     # pure, unit-tested URL parser
│   │   ├── apiLoader.ts           # singleton IFrame-API script loader (StrictMode-safe)
│   │   ├── YTPlayerController.ts  # typed wrapper over YT.Player (events via emitter)
│   │   ├── errors.ts              # codes 2/5/100/101/150 → messages + auto-skip rules
│   │   └── oembed.ts
│   ├── audio/boost.ts             # AudioContext → MediaElementSource → Gain → Compressor
│   ├── pip/pip.ts                 # Document PiP + style copy + feature detection
│   ├── files/                     # registry (session File handles), idb (idb-keyval), ingest, mediaFiles
│   ├── engine/
│   │   ├── types.ts               # PlayerEngine interface + capabilities + events
│   │   ├── YouTubeEngine.ts
│   │   └── LocalMediaEngine.ts
│   └── utils/                     # emitter, shuffle (Fisher–Yates), loopLogic (pure), format, id
├── store/
│   ├── library.ts                 # persisted items, dnd reorder, JSON import/export
│   ├── settings.ts                # persisted settings + remembered positions
│   └── player.ts                  # runtime state: engine, status, queue, PiP, toasts
├── hooks/                         # useYouTubeApi, useKeyboardShortcuts, useMediaSession, useTheme, useHydrated
└── components/                    # AppShell, LibraryPanel/Row, PlayerStage, ControlsBar, SettingsSheet, ui, Toaster
```

### The `PlayerEngine` contract

The UI talks to **one interface** (`load(mount)`, `play`, `pause`, `seekTo`, `setVolume`, `setMuted`, `setPlaybackRate`, `setBoost`, `setLoop`, `destroy`) with two implementations. Capability flags (`supportsBoost`, `supportsNativePiP`, `supportsDocumentPiP`, …) drive enabled/disabled states in Settings, so the panel works identically across both engines.

### Key implementation decisions (ambiguity → default)

- **oEmbed without an API key.** `youtube.com/oembed` has no CORS headers, so the browser calls own route `/api/oembed`, which server-fetches with a 6 s timeout and caches for 24 h. Still zero-config on Vercel; a graceful fallback title (`YouTube video · <id>`) is used when it fails.
- **Loop video on YouTube** is implemented by hand from `onStateChange` (`ENDED → seekTo(0) + playVideo()`), not the `loop` playerVar — per spec, that flag only works with a playlist parameter.
- **Loop playlist on a YouTube playlist** applies `player.setLoop(true)` *and* a manual index-0 fallback; finite repeat budgets always use the manual path so the counter stays exact. For single items, “playlist” means the Loopdeck library queue.
- **Repeat budget semantics**: `Repeats = N` means the first play **plus N repeats** (`0` = infinite). The counter shows `completed/N`.
- **Infinite local loops** use the native `el.loop = true`; finite local loops use a manual ended→seek cycle so they are countable.
- **PiP transitions reload iframes.** Instead of fighting the reload, the shell is unmounted/remounted through a React portal and the engine rebuilds from the live position/intent in the player store — position and play state are preserved across moves.
- **Boost is pre-load.** The Web Audio graph attaches lazily (per element, memoized in a WeakMap — `createMediaElementSource` throws on duplicates) and only when boost ≠ 100%; a DynamicsCompressor catches clipping. Above 150% the UI shows a distortion/hearing warning. For YouTube the slider is disabled with an explanation, since cross-origin iframes cannot enter the Web Audio graph.
- **Positions** are remembered per item (throttled to 1 write/s) and cleared from Settings.
- **Pruning vs. StrictMode**: every engine mounts inside effects with `cancelled` flags, all timers/subscriptions are cleaned on unmount, the YT script loads once via a shared promise, and object URLs are revoked with their effect. Mount/unmount cycles (e.g. PiP toggling or 50 rapid item switches) do not leak players.
- **`repeat count`/`shuffle order`** are runtime; everything else persists.
- **Hydration**: persisted (localStorage) UI renders after mount to avoid SSR mismatches; a tiny inline script applies the saved theme pre-paint.

---

## Keyboard shortcuts

| Key | Action | Key | Action |
| --- | --- | --- | --- |
| `Space` | Play / pause | `M` | Mute |
| `←` / `→` | Seek 5 s | `L` | Toggle loop (off ↔ last loop mode) |
| `Shift + ←/→` | Seek 10 s | `P` | Picture-in-Picture |
| `[` / `]` | Speed down / up | `N` / `Shift + N` | Next / previous |

Shortcuts are ignored while typing in inputs. A native `<input type="range">` seek slider keeps screen-reader slider semantics (`aria-label`, `aria-valuetext`), all icon buttons have `aria-label`s, focus rings are visible everywhere, and both themes meet WCAG AA contrast.

**Media Session**: `play` / `pause` / `nexttrack` / `previoustrack` / `seekto` handlers plus metadata (with thumbnail) are registered, so OS media keys and lock-screen controls work.

---

## Library

- **Add by URL**: watch / youtu.be / shorts / embed (+ live) links → video; `playlist?list=` or any watch URL with `&list=` → playlist. Titles/thumbnails come from oEmbed (videos). Playlists resolve their video list through the IFrame API on first play (`getPlaylist()`), and the UI shows the live `index/count` and current track title.
- **Local upload**: drag & drop anywhere (page-wide overlay) or the Files button. Metadata persists; blobs live in a session registry, in IndexedDB when the toggle is on, or get a “Re-attach file” prompt otherwise.
- Drag-and-drop reorder (dnd-kit, disabled while filtering), inline rename (pencil), remove, live search filter, JSON import/export (validated, deduped by content key).

---

## Known browser limitations

- **Document Picture-in-Picture** is Chromium-only (Chrome/Edge ≥ 116). On Safari/Firefox, YouTube items fall back to the draggable, resizable in-page mini player; the mini player cannot float above *other apps* (no web API for that).
- **Native PiP** for local video depends on `document.pictureInPictureEnabled` (Safari needs the Fullscreen→PiP path on iOS; feature-detected); local *audio* uses the mini player because PiP needs video frames.
- **Volume boost** requires Web Audio around a *same-origin* media element — physically impossible for YouTube iframes. The AudioContext resumes on the first user gesture (autoplay policy).
- **`mov` (QuickTime)** support varies by browser/codec; decode failures surface a readable error.
- **A–B precision** on YouTube is bounded by `getCurrentTime()` granularity and the 100 ms poll (±~150 ms); local files use `timeupdate` (~250 ms cadence).
- **iOS** may autoplay muted-only and forces fullscreen for inline `<video>` unless `playsinline` (set).
- Storage quotas: IndexedDB persistence fails soft with a toast when quota is exceeded.

---

## Legal note

Loopdeck plays YouTube content **exclusively through the official YouTube IFrame Player API** (privacy-enhanced `youtube-nocookie.com` host). It does not block, hide, skip, or intercept ads; it does not scrape, proxy, or extract streams. Ads in YouTube playback are inserted and controlled by YouTube — **YouTube Premium** removes them everywhere, including in embedded players. All YouTube playback remains subject to the [YouTube Terms of Service](https://www.youtube.com/t/terms) and [API Services Terms](https://developers.google.com/youtube/terms/api-services-terms-of-service). Local files you play are your own; you are responsible for having the rights to use them.
