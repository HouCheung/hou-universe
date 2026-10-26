// ============================================================
// MiniMind — data/streaming/StreamingDataLoader.ts
// ============================================================
// StreamingDataLoader — batch iterator over StreamingDataset
// with deterministic buffer shuffle and checkpoint resume.
//
// Wraps a StreamingDataset to produce batches of TextSample[].
// Supports configurable buffer-based shuffle for streaming data
// where full-dataset shuffle is impossible.
//
// Buffer shuffle algorithm:
//   1. Read shuffleBufferSize samples into a buffer
//   2. Shuffle the buffer using a seeded PRNG
//   3. Emit batches from the shuffled buffer
//   4. When the buffer is exhausted, refill and repeat
//
// Checkpoint resume guarantee:
//   After saveState() → pause → restoreState() → continue:
//   the next batch equals what would have been produced without
//   interruption. This is achieved by:
//     a. Saving dataset position at buffer-fill boundaries
//     b. Saving PRNG state before each shuffle
//     c. Replaying buffer fill + shuffle on restore
//     d. Skipping already-emitted samples in the restored buffer
//
// Usage:
//   const loader = new StreamingDataLoader(dataset, {
//     batchSize: 8,
//     shuffle: true,
//     shuffleBufferSize: 1000,
//     seed: 42,
//   });
//   for (const batch of loader) {
//     // batch → TextSample[] (length = batchSize)
//   }
//
// Design:
//   - Composes with StreamingDataset (dependency injection)
//   - Uses SeededRandom for deterministic shuffle
//   - State includes dataset position + rng state + buffer info
//   - Implements Iterator<TextSample[]> for for...of support
// ============================================================

import { SeededRandom } from "../../core/random/SeededRandom";
import { StreamingDataset } from "./StreamingDataset";
import type { StreamingDatasetState } from "./StreamingDataset";
import type { TextSample } from "../TextDataset";

// ============================================================
// Types
// ============================================================

/** Configuration options */
export interface StreamingDataLoaderOptions {
  /** Number of samples per batch (must be > 0) */
  batchSize: number;
  /** Whether to shuffle samples within each buffer, default false */
  shuffle?: boolean;
  /** Buffer size for shuffle (samples read before shuffling), default 1000 */
  shuffleBufferSize?: number;
  /** Random seed for deterministic shuffle, default 0 */
  seed?: number;
  /** Whether to discard the last incomplete batch, default true */
  dropLast?: boolean;
}

/** Serializable state for checkpoint/resume */
export interface StreamingDataLoaderState {
  /** Current epoch (0-based) */
  epoch: number;
  /** Total batches yielded in the current epoch */
  batchIndex: number;
  /** Total samples yielded */
  totalSamples: number;
  /** Dataset state at the start of the current buffer fill */
  datasetState: StreamingDatasetState;
  /** PRNG state BEFORE the buffer shuffle was applied */
  rngState: number[];
  /** Number of samples in the buffer when shuffled */
  bufferLength: number;
  /** Number of samples already emitted from the current buffer */
  emittedFromBuffer: number;
}

// ============================================================
// StreamingDataLoader
// ============================================================

/**
 * StreamingDataLoader — batch iterator with deterministic buffer shuffle.
 *
 * Reads samples lazily from StreamingDataset, optionally shuffles
 * them in configurable buffer windows, and yields batches.
 *
 * Checkpoint integration:
 *   saveState() captures everything needed to resume exactly.
 *   restoreState() replays buffer fill and shuffle, then skips
 *   already-emitted samples.
 */
export class StreamingDataLoader implements Iterator<TextSample[]> {
  private dataset: StreamingDataset;
  private options: Required<StreamingDataLoaderOptions>;

  // Shuffle PRNG — dedicated instance for this loader
  private rng: SeededRandom;

  // Buffer state
  private buffer: TextSample[];
  private emittedFromBuffer: number;

  // Checkpoint state — saved at buffer-fill boundaries
  private _datasetStateAtFill: StreamingDatasetState;
  private _rngStateBeforeShuffle: number[];
  private _bufferLengthAtFill: number;

  // Epoch tracking
  private _epoch: number;
  private _batchIndex: number;
  private _totalSamples: number;
  private _epochExhausted: boolean;

  constructor(
    dataset: StreamingDataset,
    options: StreamingDataLoaderOptions
  ) {
    if (options.batchSize <= 0) {
      throw new Error(
        `StreamingDataLoader: batchSize must be > 0, got ${options.batchSize}`
      );
    }

    this.dataset = dataset;
    this.options = {
      batchSize: options.batchSize,
      shuffle: options.shuffle ?? false,
      shuffleBufferSize: options.shuffleBufferSize ?? 1000,
      seed: options.seed ?? 0,
      dropLast: options.dropLast ?? true,
    };

    // Initialize dedicated PRNG with the user's seed
    this.rng = new SeededRandom(this.options.seed);

    // Initialize buffer
    this.buffer = [];
    this.emittedFromBuffer = 0;

    // Initialize checkpoint tracking
    this._datasetStateAtFill = this.dataset.saveState();
    this._rngStateBeforeShuffle = this.rng.saveState();
    this._bufferLengthAtFill = 0;

    // Epoch tracking
    this._epoch = 0;
    this._batchIndex = 0;
    this._totalSamples = 0;
    this._epochExhausted = false;
  }

  // ============================================================
  // Iterator protocol
  // ============================================================

  /**
   * [Symbol.iterator] — returns self (StreamingDataLoader is its own iterator).
   *
   * Note: Single-pass iterator. To re-iterate, reset the dataset
   * and create a new StreamingDataLoader instance.
   */
  [Symbol.iterator](): Iterator<TextSample[]> {
    return this;
  }

  /**
   * next() — produce the next batch of samples.
   *
   * If the buffer is empty or exhausted, fills and (optionally)
   * shuffles a new buffer from the dataset. Then extracts a batch
   * of batchSize samples.
   *
   * @returns IteratorResult with a batch of TextSample[], or done
   */
  next(): IteratorResult<TextSample[]> {
    // Check if epoch is exhausted
    if (this._epochExhausted) {
      return { value: undefined as unknown as TextSample[], done: true };
    }

    // Ensure buffer has samples
    if (this.emittedFromBuffer >= this.buffer.length) {
      if (!this.fillBuffer()) {
        this._epochExhausted = true;
        return { value: undefined as unknown as TextSample[], done: true };
      }
    }

    // Calculate batch size
    const remaining = this.buffer.length - this.emittedFromBuffer;
    let batchSize = Math.min(this.options.batchSize, remaining);

    // Handle dropLast
    if (this.options.dropLast && batchSize < this.options.batchSize) {
      // Check if there might be more data
      // (can't know for sure with streaming, so we drop and continue)
      // Actually — if this is the last buffer and the batch is incomplete,
      // drop it. Otherwise, try to fill more to complete the batch.
      const moreAvailable = !this.dataset.isExhausted;
      if (!moreAvailable) {
        // This is the last data — drop incomplete batch
        this._epochExhausted = true;
        return { value: undefined as unknown as TextSample[], done: true };
      }
      // There's more data — refill buffer to try to complete the batch
      // (This handles the case where buffer boundary cuts a batch)
      // Actually, for simplicity with streaming, if we have a short batch
      // and more data might exist, we just don't emit and try again.
      // But that loses data. Better: extend buffer with more samples.
      const extended = this.extendBuffer(this.options.batchSize - remaining);
      if (!extended) {
        // No more data, drop last
        this._epochExhausted = true;
        return { value: undefined as unknown as TextSample[], done: true };
      }
      batchSize = this.options.batchSize;
    } else if (!this.options.dropLast) {
      // Keep the short batch as-is
      batchSize = remaining;
    }

    // Extract batch
    const batch = this.buffer.slice(
      this.emittedFromBuffer,
      this.emittedFromBuffer + batchSize
    );
    this.emittedFromBuffer += batchSize;
    this._batchIndex++;
    this._totalSamples += batch.length;

    return { value: batch, done: false };
  }

  // ============================================================
  // Public API — Epoch management
  // ============================================================

  /**
   * Start a new epoch by resetting the dataset to the beginning
   * of the shard files.
   *
   * Resets the shard reader position, clears internal buffers,
   * and prepares for a fresh pass through the data.
   */
  newEpoch(): void {
    this.dataset.reader.reset();
    // Re-create the dataset (resets internal state)
    // Actually, we just need to reset the reader and clear buffers
    this.buffer = [];
    this.emittedFromBuffer = 0;
    this._epochExhausted = false;
    this._batchIndex = 0;
    this._epoch++;

    // Re-seed PRNG for the new epoch (epoch-dependent seed for variation)
    this.rng = new SeededRandom(this.options.seed + this._epoch * 1000000);
  }

  // ============================================================
  // Public API — State (checkpointing)
  // ============================================================

  /**
   * saveState() — capture full state for checkpoint resume.
   *
   * Returns a serializable state object that can be passed to
   * restoreState() to resume from the exact same batch position.
   *
   * Guarantee: after restoreState(state), the next next() call
   * returns the same batch as if training had never paused.
   */
  saveState(): StreamingDataLoaderState {
    return {
      epoch: this._epoch,
      batchIndex: this._batchIndex,
      totalSamples: this._totalSamples,
      datasetState: this._datasetStateAtFill,
      rngState: this._rngStateBeforeShuffle,
      bufferLength: this._bufferLengthAtFill,
      emittedFromBuffer: this.emittedFromBuffer,
    };
  }

  /**
   * restoreState() — restore from a checkpoint.
   *
   * Restores the dataset position, PRNG state, and buffer contents
   * to the exact state captured by saveState(). After restore,
   * the next next() call produces the same batch as the original run.
   *
   * Algorithm:
   *   1. Restore dataset to position at buffer-fill boundary
   *   2. Restore PRNG to state before shuffle
   *   3. Re-fill the buffer (same samples in same order)
   *   4. Re-play shuffle (same PRNG state → same shuffle result)
   *   5. Skip already-emitted samples
   *
   * @param state — Previously saved state from saveState()
   */
  restoreState(state: StreamingDataLoaderState): void {
    // 1. Restore epoch tracking
    this._epoch = state.epoch;
    this._batchIndex = state.batchIndex;
    this._totalSamples = state.totalSamples;
    this._epochExhausted = false;

    // 2. Restore dataset position
    this.dataset.restoreState(state.datasetState);

    // 3. Restore PRNG state (before shuffle)
    this.rng.restoreState(state.rngState);

    // 4. Re-fill buffer
    this.buffer = [];
    for (let i = 0; i < state.bufferLength; i++) {
      const result = this.dataset.next();
      if (result.done || result.value === undefined) {
        break;
      }
      this.buffer.push(result.value);
    }

    // 5. Re-play shuffle (same PRNG state → same result)
    if (this.options.shuffle && this.buffer.length > 0) {
      this.rng.shuffle(this.buffer);
    }

    // 6. Skip already-emitted samples
    this.emittedFromBuffer = state.emittedFromBuffer;

    // 7. Save the checkpoint tracking state
    this._datasetStateAtFill = state.datasetState;
    this._rngStateBeforeShuffle = state.rngState;
    this._bufferLengthAtFill = state.bufferLength;
  }

  // ============================================================
  // Public API — Info
  // ============================================================

  /** Current epoch (0-based) */
  get epoch(): number {
    return this._epoch;
  }

  /** Total batches yielded in the current epoch */
  get batchIndex(): number {
    return this._batchIndex;
  }

  /** Total samples yielded */
  get totalSamples(): number {
    return this._totalSamples;
  }

  /** Access the underlying dataset */
  get datasetRef(): StreamingDataset {
    return this.dataset;
  }

  /** Get the current configuration */
  get config(): Readonly<Required<StreamingDataLoaderOptions>> {
    return { ...this.options };
  }

  // ============================================================
  // Internal — Buffer management
  // ============================================================

  /**
   * fillBuffer() — read samples from dataset into the buffer.
   *
   * Saves checkpoint state BEFORE filling so that restore can
   * replay the exact same fill sequence.
   *
   * @returns true if buffer was filled with at least one sample,
   *          false if dataset is exhausted
   */
  private fillBuffer(): boolean {
    // Save checkpoint state BEFORE filling
    this._datasetStateAtFill = this.dataset.saveState();
    this._rngStateBeforeShuffle = this.rng.saveState();

    this.buffer = [];
    this.emittedFromBuffer = 0;

    // Read samples into buffer
    for (let i = 0; i < this.options.shuffleBufferSize; i++) {
      const result = this.dataset.next();
      if (result.done || result.value === undefined) {
        break;
      }
      this.buffer.push(result.value);
    }

    this._bufferLengthAtFill = this.buffer.length;

    if (this.buffer.length === 0) {
      return false;
    }

    // Shuffle if enabled (uses the dedicated PRNG — deterministic)
    if (this.options.shuffle && this.buffer.length > 1) {
      this.rng.shuffle(this.buffer);
    }

    return true;
  }

  /**
   * extendBuffer() — read additional samples into the buffer.
   *
   * Used when dropLast=true and the current buffer has fewer than
   * batchSize samples left, but more data may be available.
   *
   * @param count — minimum number of additional samples needed
   * @returns true if enough samples were added to complete a batch
   */
  private extendBuffer(count: number): boolean {
    // Save the remaining samples
    const remaining = this.buffer.slice(this.emittedFromBuffer);

    // Read more samples
    const additional: TextSample[] = [];
    for (let i = 0; i < count + this.options.shuffleBufferSize; i++) {
      const result = this.dataset.next();
      if (result.done || result.value === undefined) {
        break;
      }
      additional.push(result.value);
    }

    if (remaining.length + additional.length < this.options.batchSize) {
      // Not enough even with additional — can't complete a batch
      return false;
    }

    // Combine remaining + additional as the new buffer
    this.buffer = [...remaining, ...additional];
    this.emittedFromBuffer = 0;
    this._bufferLengthAtFill = this.buffer.length;

    // Shuffle the combined buffer if shuffle is enabled
    if (this.options.shuffle && this.buffer.length > 1) {
      // Save rng state for checkpoint
      this._rngStateBeforeShuffle = this.rng.saveState();
      this.rng.shuffle(this.buffer);
    }

    return true;
  }
}
