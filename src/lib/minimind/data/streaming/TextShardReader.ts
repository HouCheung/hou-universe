// ============================================================
// MiniMind — data/streaming/TextShardReader.ts
// ============================================================
// TextShardReader — sequential shard file reader with
// byte-offset tracking and checkpointable state.
//
// Reads text from a directory of shard files (shard_000.txt,
// shard_001.txt, …) in order. Each shard is read in configurable
// byte chunks. Automatically switches to the next shard when
// the current one is exhausted.
//
// State (checkpointable):
//   { shardIndex, byteOffset }
//
// Features:
//   - Sequential shard reading with auto-advance
//   - Configurable chunk buffer size
//   - Progress tracking (current shard, bytes read)
//   - State save/restore for training resume
//
// Usage:
//   const reader = new TextShardReader("./dataset", { bufferSize: 65536 });
//   for (const chunk of reader) {
//     // chunk → raw text (may span word boundaries)
//   }
//
// Design:
//   - Node.js fs APIs for efficient file reading
//   - No external dependencies
//   - Stateless between nextChunk() calls except for position
//   - On restoreState: closes current fd, opens target shard, seeks
// ============================================================

import * as fs from "fs";
import * as path from "path";

// ============================================================
// Types
// ============================================================

/** Serializable state for checkpoint/resume */
export interface ShardReaderState {
  /** Index of the current shard file (0-based) */
  shardIndex: number;
  /** Byte offset within the current shard file */
  byteOffset: number;
}

/** Configuration options */
export interface TextShardReaderOptions {
  /** Read buffer size in bytes (default: 65536 = 64KB) */
  bufferSize?: number;
  /** File encoding (default: "utf-8") */
  encoding?: BufferEncoding;
  /** Shard file name pattern — "{i}" is replaced with the shard index (default: "shard_{i}.txt") */
  shardPattern?: string;
}

// ============================================================
// TextShardReader
// ============================================================

/**
 * TextShardReader — sequential shard file reader.
 *
 * Reads text from a directory of numbered shard files. Each shard
 * is read sequentially; when one shard is exhausted, the reader
 * automatically opens the next one.
 *
 * The reader is an iterator that yields raw text chunks. Chunks
 * may end mid-word — the consumer (StreamingDataset) is responsible
 * for handling text boundaries.
 */
export class TextShardReader {
  private shardDir: string;
  private options: Required<TextShardReaderOptions>;
  private shardFiles: string[];

  // Mutable state
  private _shardIndex: number;
  private _byteOffset: number;
  private _currentFd: number | null;
  private _exhausted: boolean;

  constructor(shardDir: string, options: TextShardReaderOptions = {}) {
    this.shardDir = path.resolve(shardDir);
    this.options = {
      bufferSize: options.bufferSize ?? 65536,
      encoding: options.encoding ?? "utf-8",
      shardPattern: options.shardPattern ?? "shard_{i}.txt",
    };

    // Discover shard files
    this.shardFiles = this.discoverShards();
    if (this.shardFiles.length === 0) {
      throw new Error(
        `TextShardReader: no shard files found in "${this.shardDir}". ` +
        `Expected pattern: ${this.options.shardPattern.replace("{i}", "000")}`
      );
    }

    // Sort to ensure sequential order
    this.shardFiles.sort();

    this._shardIndex = 0;
    this._byteOffset = 0;
    this._currentFd = null;
    this._exhausted = false;
  }

  // ============================================================
  // Public API — Iteration
  // ============================================================

  /**
   * [Symbol.iterator] — iterate over text chunks.
   *
   * Each chunk is a raw text string read from the current shard.
   * Chunks may end mid-word — consumers should handle text
   * boundary logic themselves.
   *
   * Yields null when all shards are exhausted.
   */
  [Symbol.iterator](): Iterator<string> {
    return this;
  }

  /**
   * next() — Iterator protocol.
   *
   * Reads the next chunk of text. Returns { done: true } when
   * all shards are exhausted.
   */
  next(): IteratorResult<string> {
    const chunk = this.nextChunk();
    if (chunk === null) {
      return { value: undefined as unknown as string, done: true };
    }
    return { value: chunk, done: false };
  }

  /**
   * nextChunk() — read the next text chunk.
   *
   * Reads up to bufferSize bytes from the current shard position.
   * Returns null when all shards are exhausted.
   * Automatically switches to the next shard when one is finished.
   */
  nextChunk(): string | null {
    if (this._exhausted) {
      return null;
    }

    // Ensure we have an open file descriptor
    if (this._currentFd === null) {
      if (!this.openCurrentShard()) {
        this._exhausted = true;
        this.closeCurrentFd();
        return null;
      }
    }

    // Read from current position
    const buffer = Buffer.alloc(this.options.bufferSize);
    let bytesRead: number;

    try {
      bytesRead = fs.readSync(
        this._currentFd!,
        buffer,
        0,
        buffer.length,
        this._byteOffset
      );
    } catch (err) {
      this.closeCurrentFd();
      this._exhausted = true;
      throw new Error(
        `TextShardReader: read error at shard ${this._shardIndex}, ` +
        `offset ${this._byteOffset}: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    if (bytesRead === 0) {
      // Current shard exhausted — advance to next
      this.closeCurrentFd();
      this._shardIndex++;
      this._byteOffset = 0;

      if (this._shardIndex >= this.shardFiles.length) {
        this._exhausted = true;
        return null;
      }

      if (!this.openCurrentShard()) {
        this._exhausted = true;
        return null;
      }

      // Try reading from the new shard
      return this.nextChunk();
    }

    // Update position
    this._byteOffset += bytesRead;

    // Convert to text
    return buffer.toString(this.options.encoding, 0, bytesRead);
  }

  /**
   * Reset the reader to the beginning of the first shard.
   * Useful for starting a new epoch.
   */
  reset(): void {
    this.closeCurrentFd();
    this._shardIndex = 0;
    this._byteOffset = 0;
    this._exhausted = false;
  }

  // ============================================================
  // Public API — State (checkpointing)
  // ============================================================

  /**
   * saveState() — capture current position for checkpointing.
   *
   * The returned state can be passed to restoreState() to resume
   * reading from the exact same byte position.
   */
  saveState(): ShardReaderState {
    return {
      shardIndex: this._shardIndex,
      byteOffset: this._byteOffset,
    };
  }

  /**
   * restoreState() — restore position from a checkpoint.
   *
   * Closes the current file descriptor, opens the target shard,
   * and seeks to the saved byte offset. The next nextChunk() call
   * will read from the exact same position.
   *
   * @param state — Previously saved state from saveState()
   */
  restoreState(state: ShardReaderState): void {
    this.closeCurrentFd();
    this._shardIndex = state.shardIndex;
    this._byteOffset = state.byteOffset;
    this._exhausted = false;

    // Validate shard index
    if (this._shardIndex >= this.shardFiles.length) {
      this._exhausted = true;
      return;
    }

    // Open the target shard
    if (!this.openCurrentShard()) {
      this._exhausted = true;
    }
  }

  // ============================================================
  // Public API — Progress
  // ============================================================

  /**
   * Progress information for UI display.
   */
  get progress(): {
    shardIndex: number;
    shardFile: string;
    byteOffset: number;
    totalShards: number;
    exhausted: boolean;
  } {
    return {
      shardIndex: this._shardIndex,
      shardFile: this._shardIndex < this.shardFiles.length
        ? this.shardFiles[this._shardIndex]
        : "",
      byteOffset: this._byteOffset,
      totalShards: this.shardFiles.length,
      exhausted: this._exhausted,
    };
  }

  /**
   * Whether all shards have been fully read.
   */
  get isExhausted(): boolean {
    return this._exhausted;
  }

  /**
   * Total number of shard files discovered.
   */
  get totalShards(): number {
    return this.shardFiles.length;
  }

  /**
   * Current shard index (0-based).
   */
  get currentShardIndex(): number {
    return this._shardIndex;
  }

  // ============================================================
  // Internal
  // ============================================================

  /**
   * Discover shard files matching the pattern in the shard directory.
   *
   * Scans for files matching "shard_*.txt" (or the configured pattern
   * with {i} replaced by *). Only returns files that exist and are
   * regular files.
   */
  private discoverShards(): string[] {
    if (!fs.existsSync(this.shardDir)) {
      return [];
    }

    if (!fs.statSync(this.shardDir).isDirectory()) {
      return [];
    }

    // Convert pattern to glob-like: "shard_{i}.txt" → /^shard_\d+\.txt$/
    const patternRegex = this.options.shardPattern
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&") // escape regex chars
      .replace("\\{i\\}", "(\\d+)");

    const regex = new RegExp(`^${patternRegex}$`);

    const entries = fs.readdirSync(this.shardDir);
    const shardFiles: string[] = [];

    for (const entry of entries) {
      const fullPath = path.join(this.shardDir, entry);
      try {
        const stat = fs.statSync(fullPath);
        if (stat.isFile() && regex.test(entry)) {
          shardFiles.push(fullPath);
        }
      } catch {
        // Skip unreadable files
      }
    }

    return shardFiles;
  }

  /**
   * Open the current shard file for reading.
   *
   * Returns true if the file was opened successfully,
   * false if the shard index is out of range.
   */
  private openCurrentShard(): boolean {
    if (this._shardIndex >= this.shardFiles.length) {
      return false;
    }

    const filePath = this.shardFiles[this._shardIndex];

    try {
      this._currentFd = fs.openSync(filePath, "r");
      return true;
    } catch (err) {
      throw new Error(
        `TextShardReader: cannot open shard "${filePath}": ` +
        `${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  /**
   * Close the current file descriptor if one is open.
   */
  private closeCurrentFd(): void {
    if (this._currentFd !== null) {
      try {
        fs.closeSync(this._currentFd);
      } catch {
        // Ignore close errors (fd may already be closed)
      }
      this._currentFd = null;
    }
  }
}
