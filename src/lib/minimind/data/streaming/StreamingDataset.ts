// ============================================================
// MiniMind — data/streaming/StreamingDataset.ts
// ============================================================
// StreamingDataset — lazy tokenized sample generator.
//
// Wraps a TextShardReader and an ITokenizer to produce TextSample
// objects on-demand without loading the entire corpus into memory.
//
// Data flow:
//   TextShardReader → raw text chunk → boundary handling →
//   ITokenizer.encode() → token buffer → TextSample yield
//
// Key features:
//   - Lazy: tokens are generated as consumed, not stored
//   - Handles word-boundary splits across chunk boundaries
//   - Configurable blockSize and stride
//   - State save/restore for checkpoint resume
//   - Reuses existing ITokenizer and TextSample interfaces
//
// Usage:
//   const reader = new TextShardReader("./dataset");
//   const dataset = new StreamingDataset({
//     shardReader: reader,
//     tokenizer: myTokenizer,
//     blockSize: 256,
//   });
//   for (const sample of dataset) {
//     // sample.inputIds, sample.targetIds
//   }
//
// Design:
//   - Does NOT extend Dataset<TextSample> — streaming semantics
//     (no length(), no random access) are incompatible
//   - Implements Iterator<TextSample> for for...of support
//   - Text boundary handling: accumulates incomplete text across
//     chunks, splits at whitespace boundaries for clean tokenization
// ============================================================

import type { ITokenizer } from "../ITokenizer";
import type { TextSample } from "../TextDataset";
import type { ShardReaderState } from "./TextShardReader";
import { TextShardReader } from "./TextShardReader";

// ============================================================
// Types
// ============================================================

/** Configuration options */
export interface StreamingDatasetOptions {
  /** TextShardReader instance (dependency injection) */
  shardReader: TextShardReader;
  /** Tokenizer instance (MiniTokenizer or BPETokenizer) */
  tokenizer: ITokenizer;
  /** Number of tokens per sample (must be >= 2) */
  blockSize: number;
  /** Sliding window stride (default: blockSize = non-overlapping) */
  stride?: number;
  /** Maximum token buffer size before forcing a yield (default: blockSize * 10) */
  maxTokenBuffer?: number;
  /** Maximum text accumulation before forcing tokenization (default: 1MB) */
  maxTextBuffer?: number;
}

/** Serializable state for checkpoint/resume */
export interface StreamingDatasetState {
  /** Total number of samples yielded so far */
  sampleIndex: number;
  /** TextShardReader position when the state was captured */
  shardReaderState: ShardReaderState;
  /** Snapshot of token buffer (tokens not yet formed into samples) */
  tokenBufferSnapshot: number[];
  /** Incomplete text not yet tokenized */
  textRemainder: string;
}

// ============================================================
// StreamingDataset
// ============================================================

/**
 * StreamingDataset — lazy tokenized sample generator.
 *
 * Reads text from shards via TextShardReader, tokenizes it using
 * the injected ITokenizer, and yields TextSample objects on demand.
 *
 * The dataset is an iterator — each call to next() (or each iteration
 * in a for...of loop) triggers reading and tokenizing just enough text
 * to produce one more sample. No full-corpus loading occurs.
 *
 * Text boundary handling:
 *   Text chunks from the shard reader may split words. The dataset
 *   accumulates text and splits at whitespace boundaries before
 *   tokenization. Incomplete trailing text is prepended to the next
 *   chunk.
 *
 * Token buffering:
 *   Tokenized IDs accumulate in an internal buffer. When the buffer
 *   has at least blockSize + 1 tokens, a TextSample is extracted
 *   and stride tokens are removed from the front of the buffer.
 */
export class StreamingDataset implements Iterator<TextSample> {
  private shardReader: TextShardReader;
  private tokenizer: ITokenizer;
  private blockSize: number;
  private stride: number;
  private maxTokenBuffer: number;
  private maxTextBuffer: number;

  // Internal state
  private tokenBuffer: number[];
  private textRemainder: string;
  private _sampleIndex: number;
  private _exhausted: boolean;
  private _lastSafeReaderState: ShardReaderState | null = null;

  constructor(options: StreamingDatasetOptions) {
    if (options.blockSize < 2) {
      throw new Error(
        `StreamingDataset: blockSize must be >= 2, got ${options.blockSize}`
      );
    }

    this.shardReader = options.shardReader;
    this.tokenizer = options.tokenizer;
    this.blockSize = options.blockSize;
    this.stride = options.stride ?? options.blockSize;

    if (this.stride <= 0) {
      throw new Error(
        `StreamingDataset: stride must be > 0, got ${this.stride}`
      );
    }

    this.maxTokenBuffer = options.maxTokenBuffer ?? this.blockSize * 10;
    this.maxTextBuffer = options.maxTextBuffer ?? 1048576; // 1MB

    this.tokenBuffer = [];
    this.textRemainder = "";
    this._sampleIndex = 0;
    this._exhausted = false;
  }

  // ============================================================
  // Iterator protocol
  // ============================================================

  /**
   * [Symbol.iterator] — returns self (StreamingDataset is its own iterator).
   *
   * Note: StreamingDataset is single-pass. To re-iterate, reset the
   * shard reader and create a new StreamingDataset instance.
   */
  [Symbol.iterator](): Iterator<TextSample> {
    return this;
  }

  /**
   * next() — produces the next TextSample.
   *
   * Reads text from shards and tokenizes on-demand until enough
   * tokens are available to form a sample. Returns { done: true }
   * when all shards are exhausted and the token buffer is empty.
   */
  next(): IteratorResult<TextSample> {
    if (this._exhausted && this.tokenBuffer.length < this.blockSize + 1) {
      return { value: undefined as unknown as TextSample, done: true };
    }

    // Ensure we have enough tokens for at least one sample
    if (this.tokenBuffer.length < this.blockSize + 1) {
      this.fillTokenBuffer();
    }

    // Check if we have enough after filling
    if (this.tokenBuffer.length < this.blockSize + 1) {
      this._exhausted = true;
      return { value: undefined as unknown as TextSample, done: true };
    }

    // Extract sample
    const inputIds = this.tokenBuffer.slice(0, this.blockSize);
    const targetIds = this.tokenBuffer.slice(1, this.blockSize + 1);

    // Remove stride tokens from the front of the buffer
    this.tokenBuffer = this.tokenBuffer.slice(this.stride);

    const sample: TextSample = {
      inputIds: [...inputIds],
      targetIds: [...targetIds],
    };

    this._sampleIndex++;

    return { value: sample, done: false };
  }

  // ============================================================
  // Public API — State (checkpointing)
  // ============================================================

  /**
   * saveState() — capture complete internal state for checkpointing.
   *
   * Captures the shard reader position, token buffer contents, and
   * text remainder so that restoreState() can reconstruct the exact
   * internal state and continue producing identical samples.
   */
  saveState(): StreamingDatasetState {
    return {
      sampleIndex: this._sampleIndex,
      shardReaderState: this.shardReader.saveState(),
      tokenBufferSnapshot: [...this.tokenBuffer],
      textRemainder: this.textRemainder,
    };
  }

  /**
   * restoreState() — restore complete internal state from a checkpoint.
   *
   * Restores the shard reader position, token buffer, and text remainder
   * to the exact state captured by saveState(). After restore, the
   * next next() call produces the same sample as the original run.
   *
   * @param state — Previously saved state from saveState()
   */
  restoreState(state: StreamingDatasetState): void {
    this.shardReader.restoreState(state.shardReaderState);
    this._sampleIndex = state.sampleIndex;
    this.tokenBuffer = [...state.tokenBufferSnapshot];
    this.textRemainder = state.textRemainder;
    this._exhausted = false;
    this._lastSafeReaderState = state.shardReaderState;
  }

  // ============================================================
  // Public API — Info
  // ============================================================

  /** Number of samples yielded so far */
  get sampleIndex(): number {
    return this._sampleIndex;
  }

  /** Whether the underlying shard reader is exhausted and the token buffer is empty */
  get isExhausted(): boolean {
    return this._exhausted && this.tokenBuffer.length < this.blockSize + 1;
  }

  /** Access the underlying shard reader */
  get reader(): TextShardReader {
    return this.shardReader;
  }

  /** Access the tokenizer */
  get tokenizerRef(): ITokenizer {
    return this.tokenizer;
  }

  /** Get the configured block size */
  get blockSizeValue(): number {
    return this.blockSize;
  }

  // ============================================================
  // Internal — Token buffering
  // ============================================================

  /**
   * fillTokenBuffer() — read text from shards and tokenize until
   * the token buffer has enough tokens for at least one sample,
   * or until all shards are exhausted.
   */
  private fillTokenBuffer(): void {
    while (
      this.tokenBuffer.length < this.blockSize + 1 &&
      this.tokenBuffer.length < this.maxTokenBuffer
    ) {
      const text = this.getNextCompleteText();
      if (text === null) {
        // No more text available
        this._exhausted = true;
        return;
      }

      // Tokenize the complete text segment
      const ids = this.tokenizer.encode(text);

      // Append to token buffer
      if (ids.length > 0) {
        this.tokenBuffer.push(...ids);
      }
    }
  }

  /**
   * getNextCompleteText() — get the next complete text segment.
   *
   * Reads chunks from the shard reader and accumulates text until
   * a whitespace boundary is found. Returns the complete portion
   * and keeps the incomplete remainder for the next call.
   *
   * This ensures the tokenizer always receives complete words,
   * even when chunk boundaries split words.
   *
   * @returns Complete text segment, or null if exhausted
   */
  private getNextCompleteText(): string | null {
    while (true) {
      // Check if we already have complete text in the remainder
      if (this.textRemainder.length > 0) {
        const lastWs = this.findLastWhitespace(this.textRemainder);

        if (lastWs > 0) {
          // Split at whitespace
          const complete = this.textRemainder.substring(0, lastWs);
          this.textRemainder = this.textRemainder.substring(lastWs);
          if (complete.trim().length > 0) {
            return complete;
          }
          // If only whitespace, continue to get more text
        }

        // Check if remainder is too large (very long word / no whitespace)
        if (this.textRemainder.length >= this.maxTextBuffer) {
          const text = this.textRemainder;
          this.textRemainder = "";
          return text;
        }
      }

      // Read next chunk from shard reader
      const chunk = this.shardReader.nextChunk();
      if (chunk === null) {
        // No more chunks — flush remaining text
        if (this.textRemainder.length > 0) {
          const text = this.textRemainder;
          this.textRemainder = "";
          return text.trim().length > 0 ? text : null;
        }
        return null;
      }

      // Append chunk to remainder
      this.textRemainder += chunk;
    }
  }

  /**
   * findLastWhitespace() — find the position of the last whitespace
   * character in a string.
   *
   * Used to find safe text boundaries for tokenization.
   */
  private findLastWhitespace(text: string): number {
    // Search from the end for efficiency
    for (let i = text.length - 1; i >= 0; i--) {
      const ch = text[i];
      if (ch === " " || ch === "\n" || ch === "\t" || ch === "\r") {
        return i;
      }
    }
    return -1;
  }
}
