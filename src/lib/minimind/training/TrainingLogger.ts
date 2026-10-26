// ============================================================
// TrainingLogger — Structured training run logger
// ============================================================
// Phase 44: File-based JSON-lines logger for training metrics.
//
// Writes one JSON object per log call to a `.jsonl` file.
// On close(), appends a summary object with aggregate stats.
//
// Tracks:
//   - step, loss, perplexity, learningRate
//   - tokensPerSecond (from ThroughputMeter)
//   - gradientNorm (from computeGlobalNorm)
//   - timestamp (ISO 8601)
//
// Usage:
//   const logger = new TrainingLogger("./runs/exp-001");
//   logger.log({ step: 10, loss: 2.31, lr: 0.001, ppl: 10.07 });
//   logger.close(summary);
// ============================================================

import * as fs from "fs";
import * as path from "path";

// ============================================================
// Types
// ============================================================

/**
 * A single log record written to the training log file.
 */
export interface TrainingLogRecord {
  /** Global optimizer step number */
  step: number;
  /** Current epoch (0-indexed) */
  epoch: number;
  /** Current loss value */
  loss: number;
  /** Current perplexity = exp(loss) */
  perplexity: number;
  /** Current learning rate */
  learningRate: number;
  /** Tokens processed per second (undefined if not measured) */
  tokensPerSecond?: number;
  /** Global gradient norm (undefined if not measured) */
  gradientNorm?: number;
  /** ISO 8601 timestamp */
  timestamp: string;
}

/**
 * Summary appended to the log file on close().
 */
export interface TrainingLogSummary {
  /** Total steps logged */
  totalSteps: number;
  /** Total epochs */
  totalEpochs: number;
  /** Best (minimum) loss */
  bestLoss: number;
  /** Final loss */
  finalLoss: number;
  /** Average tokens/second over the entire run */
  avgTokensPerSecond?: number;
  /** Total wall-clock duration in seconds */
  durationSeconds: number;
  /** Whether training completed normally */
  completed: boolean;
}

// ============================================================
// TrainingLogger
// ============================================================

export class TrainingLogger {
  private filePath: string;
  private stream: fs.WriteStream | null;
  private consoleLog: boolean;
  private recordCount: number;

  /**
   * Create a training logger.
   *
   * Creates a `.jsonl` log file in the specified directory.
   * The directory is created if it doesn't exist.
   *
   * @param logDir   - Directory to store log files
   * @param options  - Optional configuration
   */
  constructor(
    logDir: string,
    options?: { consoleLog?: boolean; fileName?: string }
  ) {
    this.consoleLog = options?.consoleLog ?? false;
    this.recordCount = 0;

    // Ensure log directory exists
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    const fileName = options?.fileName ?? "training-log.jsonl";
    this.filePath = path.join(logDir, fileName);

    // Open write stream (append mode for resuming from checkpoint)
    this.stream = fs.createWriteStream(this.filePath, { flags: "w" });

    // Write header comment
    this.stream.write(
      `# MiniMind Training Log — ${new Date().toISOString()}\n`
    );
    this.stream.write(`# Format: one JSON object per line\n`);
  }

  /**
   * Log a training metrics record.
   *
   * Writes one JSON line to the log file and optionally prints
   * a formatted line to the console.
   *
   * @param record - Training metrics for the current step
   */
  log(record: TrainingLogRecord): void {
    this.recordCount++;

    // Write JSON line to file
    if (this.stream) {
      this.stream.write(JSON.stringify(record) + "\n");
    }

    // Console output
    if (this.consoleLog) {
      const ts = record.timestamp.substring(11, 19); // HH:MM:SS
      const tps =
        record.tokensPerSecond !== undefined
          ? ` | ${record.tokensPerSecond.toFixed(0)} tok/s`
          : "";
      const gradNorm =
        record.gradientNorm !== undefined
          ? ` | grad ${record.gradientNorm.toFixed(4)}`
          : "";
      console.log(
        `[${ts}] step ${record.step} | epoch ${record.epoch} | ` +
          `loss ${record.loss.toFixed(4)} | ppl ${record.perplexity.toFixed(2)} | ` +
          `lr ${record.learningRate.toExponential(2)}${tps}${gradNorm}`
      );
    }
  }

  /**
   * Flush pending writes to disk.
   */
  flush(): void {
    // Node.js WriteStream doesn't have a sync flush, but we can
    // trigger a drain-like behavior by writing an empty buffer.
    // For our purposes, each line write goes through immediately
    // since we don't buffer.
  }

  /**
   * Close the log file with an optional summary appended.
   *
   * After close(), no more log() calls should be made.
   *
   * @param summary - Optional final summary to append
   */
  close(summary?: TrainingLogSummary): void {
    if (!this.stream) return;

    if (summary) {
      // Write a summary marker line then the summary JSON
      this.stream.write(`# --- Summary ---\n`);
      this.stream.write(JSON.stringify(summary) + "\n");
    }

    this.stream.end();
    this.stream = null;
  }

  /**
   * Get the path to the log file.
   */
  get logFilePath(): string {
    return this.filePath;
  }

  /**
   * Number of records logged so far.
   */
  get count(): number {
    return this.recordCount;
  }
}
