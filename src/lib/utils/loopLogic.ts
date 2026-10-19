/**
 * Pure looping primitives shared by both engine implementations.
 * Kept free of DOM/browser APIs so they are trivially unit-testable.
 */

export interface SegmentPoints {
  a: number | null;
  b: number | null;
}

/** A segment is usable only when both points exist and B is strictly after A. */
export function isValidSegment(a: number | null, b: number | null): a is number {
  return (
    typeof a === "number" &&
    Number.isFinite(a) &&
    a >= 0 &&
    typeof b === "number" &&
    Number.isFinite(b) &&
    b > a
  );
}

/** True when playback has reached (or passed) the B point of a valid segment. */
export function shouldLoopSegment(currentTime: number, a: number | null, b: number | null): boolean {
  return isValidSegment(a, b) && Number.isFinite(currentTime) && currentTime >= (b as number);
}

export interface LoopAdvance {
  /** Number of loop repeats completed so far (after this end-of-media event). */
  completed: number;
  /** False when the configured repeat budget has been exhausted. */
  shouldContinue: boolean;
}

/**
 * Counts loop repeats. `maxRepeats <= 0` means "loop forever".
 * With `maxRepeats = N`, playback repeats N times after the first full play,
 * i.e. the media is heard N+1 times in total.
 */
export function advanceLoopCount(completed: number, maxRepeats: number): LoopAdvance {
  const next = completed + 1;
  if (!Number.isFinite(maxRepeats) || maxRepeats <= 0) {
    return { completed: next, shouldContinue: true };
  }
  return { completed: next, shouldContinue: next <= Math.floor(maxRepeats) };
}

/** Clamps a loop point into the valid `[0, duration]` window. */
export function clampLoopPoint(value: number, duration: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  if (!Number.isFinite(duration) || duration <= 0) return Math.max(0, value);
  return Math.min(duration, value);
}
