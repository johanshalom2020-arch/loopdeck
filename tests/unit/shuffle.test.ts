import { describe, expect, it } from "vitest";
import { buildShuffleOrder, fisherYates } from "@/lib/utils/shuffle";

/** Deterministic Park-Miller RNG for reproducible tests. */
function seededRng(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

describe("fisherYates", () => {
  it("returns a permutation without mutating the input", () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const copy = [...input];
    const result = fisherYates(input, seededRng(42));
    expect(input).toEqual(copy);
    expect([...result].sort((a, b) => a - b)).toEqual(copy);
  });

  it("is deterministic with a seeded rng", () => {
    const input = Array.from({ length: 20 }, (_, i) => i);
    expect(fisherYates(input, seededRng(7))).toEqual(fisherYates(input, seededRng(7)));
  });

  it("differs across seeds", () => {
    const input = Array.from({ length: 20 }, (_, i) => i);
    expect(fisherYates(input, seededRng(1))).not.toEqual(fisherYates(input, seededRng(2)));
  });

  it("handles empty and singleton arrays", () => {
    expect(fisherYates([], seededRng(1))).toEqual([]);
    expect(fisherYates([9], seededRng(1))).toEqual([9]);
  });
});

describe("buildShuffleOrder", () => {
  it("keeps the current track first and contains every index exactly once", () => {
    const order = buildShuffleOrder(10, 4, seededRng(11));
    expect(order[0]).toBe(4);
    expect([...order].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("shuffles the tail after the current track", () => {
    const a = buildShuffleOrder(12, 0, seededRng(3));
    const b = buildShuffleOrder(12, 0, seededRng(4));
    expect(a.slice(1)).not.toEqual(b.slice(1));
  });

  it("handles edge cases", () => {
    expect(buildShuffleOrder(0, 0)).toEqual([]);
    expect(buildShuffleOrder(-3, 0)).toEqual([]);
    expect(buildShuffleOrder(1, 0, seededRng(1))).toEqual([0]);
    const order = buildShuffleOrder(5, 99, seededRng(2)); // invalid current index
    expect([...order].sort((x, y) => x - y)).toEqual([0, 1, 2, 3, 4]);
  });
});
