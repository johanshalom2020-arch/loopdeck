/**
 * Fisher-Yates shuffle. Returns a new array; the input is not mutated.
 * An injectable RNG keeps the function deterministic under test.
 */
export function fisherYates<T>(input: readonly T[], rng: () => number = Math.random): T[] {
  const result = [...input];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = result[i];
    result[i] = result[j];
    result[j] = tmp;
  }
  return result;
}

/**
 * Builds a shuffled play order of indexes `0..length-1` where the currently
 * playing index keeps its place at the front of the order so the current
 * track is never interrupted when shuffle is enabled mid-playback.
 */
export function buildShuffleOrder(
  length: number,
  currentIndex: number,
  rng: () => number = Math.random,
): number[] {
  if (!Number.isInteger(length) || length <= 0) return [];
  const all = Array.from({ length }, (_, i) => i);
  if (currentIndex < 0 || currentIndex >= length) {
    return fisherYates(all, rng);
  }
  const rest = all.filter((i) => i !== currentIndex);
  return [currentIndex, ...fisherYates(rest, rng)];
}
