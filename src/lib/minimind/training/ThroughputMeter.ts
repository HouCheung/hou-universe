// ============================================================
// ThroughputMeter — Tokens-per-second measurement
// ============================================================
// Phase 44: Lightweight throughput tracker for training.
//
// Tracks total tokens processed and elapsed wall-clock time
// to compute tokens/second at per-sample and overall granularity.
//
// Usage:
//   const meter = new ThroughputMeter();
//   meter.start();
//   // ... in training loop ...
//   meter.addTokens(batchSize * blockSize);
//   const tps = meter.sample(); // tokens/sec since last sample
//   const avg = meter.averageTokensPerSecond;
// ============================================================

// ============================================================
// ThroughputMeter
// ============================================================

export class ThroughputMeter {
  private _totalTokens: number;
  private _startTime: number;
  private _lastSampleTime: number;
  private _lastSampleTokens: number;
  private _samples: number[];

  constructor() {
    this._totalTokens = 0;
    this._startTime = 0;
    this._lastSampleTime = 0;
    this._lastSampleTokens = 0;
    this._samples = [];
  }

  /**
   * Start (or restart) the throughput measurement.
   *
   * Records the start time and resets all counters.
   * Call this before the training loop begins.
   */
  start(): void {
    this._totalTokens = 0;
    this._startTime = performance.now();
    this._lastSampleTime = this._startTime;
    this._lastSampleTokens = 0;
    this._samples = [];
  }

  /**
   * Record that `count` tokens have been processed.
   *
   * Call this after each batch: `meter.addTokens(batchSize * blockSize)`.
   *
   * @param count - Number of tokens processed in this batch
   */
  addTokens(count: number): void {
    this._totalTokens += count;
  }

  /**
   * Sample the instantaneous throughput since the last sample() call.
   *
   * Returns tokens/second computed from tokens added since the
   * previous sample() call divided by elapsed time since that call.
   * Records the sample internally for later analysis.
   *
   * @returns tokens/sec, or 0 if called before any tokens added
   */
  sample(): number {
    const now = performance.now();
    const elapsedMs = now - this._lastSampleTime;
    const tokensSinceLastSample = this._totalTokens - this._lastSampleTokens;

    let tps = 0;
    if (elapsedMs > 0 && tokensSinceLastSample > 0) {
      tps = (tokensSinceLastSample / elapsedMs) * 1000;
    }

    // Record for moving average
    if (tps > 0) {
      this._samples.push(tps);
    }

    // Update sample anchors
    this._lastSampleTime = now;
    this._lastSampleTokens = this._totalTokens;

    return tps;
  }

  /**
   * Overall average tokens per second since start() was called.
   */
  get averageTokensPerSecond(): number {
    const elapsedMs = performance.now() - this._startTime;
    if (elapsedMs <= 0 || this._totalTokens <= 0) return 0;
    return (this._totalTokens / elapsedMs) * 1000;
  }

  /**
   * Total tokens processed since start().
   */
  get totalTokens(): number {
    return this._totalTokens;
  }

  /**
   * Elapsed time in milliseconds since start().
   */
  get elapsedMs(): number {
    return performance.now() - this._startTime;
  }

  /**
   * Elapsed time in seconds since start().
   */
  get elapsedSeconds(): number {
    return this.elapsedMs / 1000;
  }

  /**
   * Reset all counters (same as start()).
   */
  reset(): void {
    this.start();
  }
}
