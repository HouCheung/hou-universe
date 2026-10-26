// ============================================================
// Random — Global deterministic random singleton
// ============================================================
// Single entry point for all randomness in MiniMind.
// Call Random.setSeed(n) once at program start to make
// everything reproducible.
//
// Default behavior (before setSeed is called):
//   Uses a randomly-initialized SeededRandom, producing
//   non-deterministic output — backward compatible with
//   existing code that doesn't set seeds.
//
// Usage:
//   Random.setSeed(42);
//   const x = Random.randn();        // N(0, 1)
//   const y = Random.uniform(0, 1);  // U(0, 1)
//   Random.shuffle(myArray);         // in-place shuffle
//
// For isolated (non-global) shuffling:
//   Random.seededShuffle(arr, 123);  // doesn't affect global state
// ============================================================

import { SeededRandom } from "./SeededRandom";

let _instance: SeededRandom = new SeededRandom(Date.now() & 0xffffffff);

export const Random = {
  /**
   * Set global seed for deterministic randomness.
   * Resets the RNG state completely.
   *
   * Call this once at program start for reproducibility.
   */
  setSeed(seed: number): void {
    _instance = new SeededRandom(seed);
  },

  /**
   * Get [0, 1) uniform random number.
   * Drop-in replacement for Math.random().
   */
  random(): number {
    return _instance.next();
  },

  /**
   * Standard normal random number N(0, 1).
   * Box-Muller transform consuming 2 uniform values
   * (second value cached for zero-waste).
   */
  randn(): number {
    return _instance.randn();
  },

  /**
   * Uniform random number in [low, high).
   */
  uniform(low: number, high: number): number {
    return _instance.uniform(low, high);
  },

  /**
   * Fisher-Yates shuffle in-place using the global RNG.
   */
  shuffle<T>(arr: T[]): void {
    _instance.shuffle(arr);
  },

  /**
   * Shuffle an array using an isolated RNG with its own seed.
   * Does NOT affect the global RNG state.
   *
   * Use this when you need a one-shot seeded shuffle
   * without disrupting the global random sequence.
   */
  seededShuffle<T>(arr: T[], seed: number): void {
    const rng = new SeededRandom(seed);
    rng.shuffle(arr);
  },

  /**
   * Save full RNG state for checkpointing.
   * Returns an array that can be passed to restoreState().
   */
  saveState(): number[] {
    return _instance.saveState();
  },

  /**
   * Restore full RNG state from a previously saved snapshot.
   * Enables exact training resumption.
   */
  restoreState(state: number[]): void {
    _instance.restoreState(state);
  },

  /**
   * Get raw PRNG instance for use cases needing direct control
   * (e.g. creating independent RNG instances for parallel work).
   */
  getInstance(): SeededRandom {
    return _instance;
  },
};
