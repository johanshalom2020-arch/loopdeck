/**
 * Web Audio volume boost for local media elements:
 *
 *   AudioContext → MediaElementSource → GainNode → DynamicsCompressor → destination
 *
 * Notes baked into the design:
 *  - `createMediaElementSource` throws when called twice for the same element,
 *    so graphs are memoized in a WeakMap keyed by the element.
 *  - The AudioContext starts suspended until a user gesture; `unlockAudioContext`
 *    is called from play/pause click handlers.
 *  - This is impossible for YouTube playback: the audio lives inside a
 *    cross-origin iframe, which browsers deliberately keep out of the Web
 *    Audio graph. The UI reflects that via capability flags.
 */

import { clamp } from "@/lib/utils/format";

export const BOOST_MIN = 0;
export const BOOST_MAX = 400;
export const BOOST_SAFE_CEILING = 150;

interface BoostGraph {
  gain: GainNode;
  compressor: DynamicsCompressorNode;
}

type AudioContextConstructor = new () => AudioContext;

let sharedContext: AudioContext | null = null;
const graphs = new WeakMap<HTMLMediaElement, BoostGraph>();

function audioContextConstructor(): AudioContextConstructor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    AudioContext?: AudioContextConstructor;
    webkitAudioContext?: AudioContextConstructor;
  };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

/** Returns the shared AudioContext, creating it lazily. Null on unsupported browsers. */
export function ensureAudioContext(): AudioContext | null {
  if (sharedContext) return sharedContext;
  const Ctor = audioContextConstructor();
  if (!Ctor) return null;
  try {
    sharedContext = new Ctor();
    return sharedContext;
  } catch {
    return null;
  }
}

/** Resume after a user gesture (autoplay policy). Safe to call any time. */
export function unlockAudioContext(): void {
  if (sharedContext && sharedContext.state === "suspended") {
    void sharedContext.resume().catch(() => undefined);
  }
}

/**
 * Attaches (once per element) the source → gain → compressor → destination
 * chain and returns the GainNode. Returns null when Web Audio is unavailable
 * or the element already has a source node owned elsewhere.
 */
export function attachBoostGraph(el: HTMLMediaElement): GainNode | null {
  const existing = graphs.get(el);
  if (existing) return existing.gain;

  const ctx = ensureAudioContext();
  if (!ctx) return null;

  try {
    const source = ctx.createMediaElementSource(el);
    const gain = ctx.createGain();
    const compressor = ctx.createDynamicsCompressor();
    // Compressor tuned to catch boosts without squashing normal playback.
    compressor.threshold.value = -6;
    compressor.knee.value = 12;
    compressor.ratio.value = 12;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.25;
    source.connect(gain);
    gain.connect(compressor);
    compressor.connect(ctx.destination);
    graphs.set(el, { gain, compressor });
    return gain;
  } catch {
    return null;
  }
}

export function elementHasBoostGraph(el: HTMLMediaElement): boolean {
  return graphs.has(el);
}

/**
 * Applies a boost percentage (100 = unity). The graph is only attached when
 * boost is actually requested, keeping unboosted playback on the plain path.
 */
export function setBoostPercent(el: HTMLMediaElement, percent: number): boolean {
  const normalized = clamp(percent, BOOST_MIN, BOOST_MAX);
  if (normalized === 100 && !graphs.has(el)) return true;
  const gain = attachBoostGraph(el);
  if (!gain) return false;
  gain.gain.value = normalized / 100;
  // Once an element is routed through Web Audio, a suspended context means
  // silence. Resume it (allowed after any prior user gesture).
  unlockAudioContext();
  return true;
}
