// ============================================================
// SeededRandom — xoshiro128++ PRNG engine
// ============================================================
// High-quality 32-bit PRNG with 128-bit state.
// Passes PractRand, fast, minimal. Used as the sole RNG
// source for all MiniMind randomness.
//
// Algorithm: xoshiro128++ 1.0 by David Blackman and Sebastiano Vigna
// Paper: https://prng.di.unimi.it/
//
// Properties:
//   - 128-bit state (4 × 32-bit)
//   - Period: 2^128 - 1
//   - Returns values in [0, 1)
//   - State is fully serializable for checkpoint reproducibility
// ============================================================

// ── Internal helpers ──

/** Rotate-left for 32-bit unsigned integers */
function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}

/**
 * SplitMix32 — seed expansion.
 * Expands a single 32-bit seed into full 128-bit state
 * for xoshiro128++ initialization.
 */
function splitmix32(state: number): number {
  let z = (state + 0x9e3779b9) >>> 0;
  z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
  z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
  return (z ^ (z >>> 16)) >>> 0;
}

// ============================================================
// SeededRandom
// ============================================================

export class SeededRandom {
  private s: Uint32Array;

  /** Box-Muller spare value cache */
  private _hasSpare: boolean = false;
  private _spare: number = 0;

  /**
   * Initialize PRNG from a numeric seed.
   * Uses SplitMix32 to expand the seed into full 128-bit state.
   */
  constructor(seed: number) {
    this.s = new Uint32Array(4);
    const z = (seed | 0) >>> 0;
    this.s[0] = splitmix32(z);
    this.s[1] = splitmix32(this.s[0]);
    this.s[2] = splitmix32(this.s[1]);
    this.s[3] = splitmix32(this.s[2]);
  }

  /**
   * Generate next random number in [0, 1).
   *
   * Uses the upper 24 bits of the xoshiro128++ result for
   * high-quality mantissa precision.
   */
  next(): number {
    const result = rotl(this.s[0] + this.s[3], 7) + this.s[0];
    const t = this.s[1] << 9;

    this.s[2] ^= this.s[0];
    this.s[3] ^= this.s[1];
    this.s[1] ^= this.s[2];
    this.s[0] ^= this.s[3];

    this.s[2] ^= t;
    this.s[3] = rotl(this.s[3], 11);

    // Convert to [0, 1) — upper 24 bits for mantissa quality
    return (result >>> 8) / 16777216;
  }

  /**
   * Generate standard normal random number N(0, 1).
   *
   * Uses Box-Muller transform. Consumes 2 uniform values
   * per call; caches the second value for the next call
   * (zero waste).
   */
  randn(): number {
    if (this._hasSpare) {
      this._hasSpare = false;
      return this._spare;
    }
    const u1 = this.next();
    const u2 = this.next();
    // Guard against log(0) — u1 is never exactly 0 from xoshiro128++
    const r = Math.sqrt(-2 * Math.log(u1 || 1e-15));
    const theta = 2 * Math.PI * u2;
    this._spare = r * Math.sin(theta);
    this._hasSpare = true;
    return r * Math.cos(theta);
  }

  /**
   * Generate uniform random number in [low, high).
   */
  uniform(low: number, high: number): number {
    return low + this.next() * (high - low);
  }

  /**
   * Fisher-Yates shuffle — in-place, deterministic.
   */
  shuffle<T>(arr: T[]): void {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
  }

  /**
   * Save full RNG state for checkpoint reproducibility.
   *
   * Returns: [s0, s1, s2, s3, hasSpare, spare]
   */
  saveState(): number[] {
    return [
      this.s[0],
      this.s[1],
      this.s[2],
      this.s[3],
      this._hasSpare ? 1 : 0,
      this._spare,
    ];
  }

  /**
   * Restore full RNG state from a previously saved snapshot.
   */
  restoreState(state: number[]): void {
    this.s[0] = state[0];
    this.s[1] = state[1];
    this.s[2] = state[2];
    this.s[3] = state[3];
    this._hasSpare = state[4] === 1;
    this._spare = state[5];
  }

  /**
   * Create an independent clone with identical state.
   * The clone produces the same future sequence as the original
   * from this point — useful for verification.
   */
  clone(): SeededRandom {
    const c = new SeededRandom(0);
    c.s[0] = this.s[0];
    c.s[1] = this.s[1];
    c.s[2] = this.s[2];
    c.s[3] = this.s[3];
    c._hasSpare = this._hasSpare;
    c._spare = this._spare;
    return c;
  }
}
