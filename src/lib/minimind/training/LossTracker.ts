// ============================================================
// LossTracker — Running loss accumulator for training
// ============================================================
// Phase 41: Tracks per-batch and epoch-level loss statistics.
//
// Supports:
//   - Per-step loss recording
//   - Running average over a configurable window
//   - Epoch-level aggregation (reset between epochs)
//   - Full history access
//
// Usage:
//   const tracker = new LossTracker(100); // window size = 100
//   tracker.add(2.31);
//   tracker.add(2.29);
//   console.log(tracker.runningAverage()); // ~2.30
//   console.log(tracker.epochAverage());   // average of all since last reset
//   tracker.resetEpoch(); // clear epoch accumulator
// ============================================================

/**
 * LossTracker — accumulates and aggregates loss values.
 *
 * Maintains three levels of aggregation:
 *   1. Full history — every loss value ever added
 *   2. Epoch accumulator — average since last resetEpoch()
 *   3. Running window — rolling average over the last N values
 */
export class LossTracker {
  /** Every loss value recorded, in order */
  private history: number[];

  /** Sum of losses in the current epoch window */
  private epochSum: number;

  /** Count of losses in the current epoch window */
  private epochCount: number;

  /** Circular buffer for running window average */
  private window: number[];

  /** Current write position in the circular buffer */
  private windowPos: number;

  /** Number of values currently in the window (≤ maxWindow) */
  private windowCount: number;

  /** Maximum size of the running window */
  private maxWindow: number;

  /**
   * @param maxWindow - Number of recent values for running average (default: 100)
   */
  constructor(maxWindow: number = 100) {
    if (maxWindow <= 0) {
      throw new Error(
        `LossTracker: maxWindow must be positive, got ${maxWindow}`
      );
    }
    this.history = [];
    this.epochSum = 0;
    this.epochCount = 0;
    this.window = new Array(maxWindow).fill(0);
    this.windowPos = 0;
    this.windowCount = 0;
    this.maxWindow = maxWindow;
  }

  /**
   * Record a loss value.
   */
  add(loss: number): void {
    this.history.push(loss);

    // Epoch accumulator
    this.epochSum += loss;
    this.epochCount++;

    // Running window (circular buffer)
    this.window[this.windowPos] = loss;
    this.windowPos = (this.windowPos + 1) % this.maxWindow;
    if (this.windowCount < this.maxWindow) {
      this.windowCount++;
    }
  }

  /**
   * Average of all values in the running window.
   * Returns 0 if no values have been recorded.
   */
  runningAverage(): number {
    if (this.windowCount === 0) return 0;
    let sum = 0;
    for (let i = 0; i < this.windowCount; i++) {
      sum += this.window[i];
    }
    return sum / this.windowCount;
  }

  /**
   * Average of all values since the last resetEpoch().
   * Returns 0 if no values recorded this epoch.
   */
  epochAverage(): number {
    if (this.epochCount === 0) return 0;
    return this.epochSum / this.epochCount;
  }

  /**
   * Reset the epoch accumulator.
   * Call at the start of each epoch.
   */
  resetEpoch(): void {
    this.epochSum = 0;
    this.epochCount = 0;
  }

  /**
   * Get a copy of the full loss history.
   */
  getHistory(): number[] {
    return [...this.history];
  }

  /**
   * Get the most recent loss value.
   * Returns 0 if no values recorded.
   */
  latest(): number {
    if (this.history.length === 0) return 0;
    return this.history[this.history.length - 1];
  }

  /**
   * Get the minimum loss value recorded.
   * Returns Infinity if no values recorded.
   */
  minimum(): number {
    if (this.history.length === 0) return Infinity;
    let min = Infinity;
    for (const v of this.history) {
      if (v < min) min = v;
    }
    return min;
  }

  /**
   * Number of values recorded in total.
   */
  get count(): number {
    return this.history.length;
  }

  /**
   * Reset everything — clears all history and accumulators.
   */
  reset(): void {
    this.history = [];
    this.epochSum = 0;
    this.epochCount = 0;
    this.window.fill(0);
    this.windowPos = 0;
    this.windowCount = 0;
  }
}
