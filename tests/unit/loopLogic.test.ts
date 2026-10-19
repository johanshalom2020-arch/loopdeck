import { describe, expect, it } from "vitest";
import {
  advanceLoopCount,
  clampLoopPoint,
  isValidSegment,
  shouldLoopSegment,
} from "@/lib/utils/loopLogic";

describe("isValidSegment", () => {
  it("accepts segments where B is strictly after A", () => {
    expect(isValidSegment(0, 10)).toBe(true);
    expect(isValidSegment(2.5, 10.1)).toBe(true);
  });

  it("rejects missing, inverted or malformed segments", () => {
    expect(isValidSegment(null, 10)).toBe(false);
    expect(isValidSegment(10, null)).toBe(false);
    expect(isValidSegment(null, null)).toBe(false);
    expect(isValidSegment(10, 10)).toBe(false);
    expect(isValidSegment(10, 5)).toBe(false);
    expect(isValidSegment(-2, 5)).toBe(false);
    expect(isValidSegment(Number.NaN, 5)).toBe(false);
  });
});

describe("shouldLoopSegment", () => {
  it("fires once playback reaches B", () => {
    expect(shouldLoopSegment(9.99, 2, 10)).toBe(false);
    expect(shouldLoopSegment(10, 2, 10)).toBe(true);
    expect(shouldLoopSegment(10.4, 2, 10)).toBe(true);
  });

  it("never fires for invalid segments", () => {
    expect(shouldLoopSegment(100, null, 10)).toBe(false);
    expect(shouldLoopSegment(100, 10, 5)).toBe(false);
    expect(shouldLoopSegment(100, 0, null)).toBe(false);
  });
});

describe("advanceLoopCount", () => {
  it("loops forever when maxRepeats is 0 or negative", () => {
    expect(advanceLoopCount(0, 0)).toEqual({ completed: 1, shouldContinue: true });
    expect(advanceLoopCount(999, 0)).toEqual({ completed: 1000, shouldContinue: true });
    expect(advanceLoopCount(5, -3)).toEqual({ completed: 6, shouldContinue: true });
  });

  it("allows exactly N repeats after the first play", () => {
    // maxRepeats = 2 → the FIRST play + two repeats, then stop.
    expect(advanceLoopCount(0, 2)).toEqual({ completed: 1, shouldContinue: true });
    expect(advanceLoopCount(1, 2)).toEqual({ completed: 2, shouldContinue: true });
    expect(advanceLoopCount(2, 2)).toEqual({ completed: 3, shouldContinue: false });
  });

  it("stops after one repeat when maxRepeats is 1", () => {
    expect(advanceLoopCount(0, 1)).toEqual({ completed: 1, shouldContinue: true });
    expect(advanceLoopCount(1, 1)).toEqual({ completed: 2, shouldContinue: false });
  });
});

describe("clampLoopPoint", () => {
  it("clamps into the [0, duration] window", () => {
    expect(clampLoopPoint(-5, 100)).toBe(0);
    expect(clampLoopPoint(50, 100)).toBe(50);
    expect(clampLoopPoint(500, 100)).toBe(100);
    expect(clampLoopPoint(Number.NaN, 100)).toBe(0);
  });
});
