// ============================================================
// TrainingMetrics — Training run metrics with JSON/CSV export
// ============================================================
// Phase 42: Structured training metrics recording with
// serialization support for AI Lab Dashboard integration.
//
// Each TrainingMetric record captures the full state of
// training at a single logging point:
//   - step, epoch, loss, learning rate, perplexity
//   - tokens per second, timestamp
//
// Export formats:
//   - JSON: full structured data for dashboard consumption
//   - CSV: tabular format for spreadsheet analysis
//
// Usage:
//   const metrics = new TrainingMetricsCollector();
//   metrics.record({ step: 10, epoch: 0, loss: 2.31, learningRate: 0.001, ... });
//   const json = metrics.toJSON();
//   const csv = metrics.toCSV();
// ============================================================

// ============================================================
// Types
// ============================================================

/**
 * A single training metrics record.
 *
 * Captured at each logging interval during training.
 */
export interface TrainingMetricsRecord {
  /** Global optimizer step number */
  step: number;
  /** Current epoch (0-indexed) */
  epoch: number;
  /** Current loss value (running average or per-step) */
  loss: number;
  /** Current learning rate */
  learningRate: number;
  /** Perplexity = exp(loss) */
  perplexity: number;
  /** Tokens processed per second (optional — computed if timing info available) */
  tokensPerSecond?: number;
  /** Unix timestamp (milliseconds since epoch) when this record was created */
  timestamp: number;
}

/**
 * Aggregated summary of a training run.
 */
export interface TrainingMetricsSummary {
  /** Total number of records */
  totalRecords: number;
  /** Total training steps */
  totalSteps: number;
  /** Total epochs completed */
  totalEpochs: number;
  /** Best (minimum) loss achieved */
  bestLoss: number;
  /** Step at which best loss was achieved */
  bestStep: number;
  /** Final loss */
  finalLoss: number;
  /** Initial loss */
  initialLoss: number;
  /** Total loss decrease */
  lossDecrease: number;
  /** Loss decrease as a fraction of initial loss */
  lossDecreasePercent: number;
  /** Start timestamp */
  startTime: number;
  /** End timestamp */
  endTime: number;
  /** Total wall-clock duration in milliseconds */
  durationMs: number;
}

// ============================================================
// TrainingMetricsCollector
// ============================================================

/**
 * Collects and exports training metrics records.
 *
 * Records are stored in insertion order. Export methods
 * produce JSON and CSV formatted strings.
 *
 * Example:
 *   const collector = new TrainingMetricsCollector();
 *   // In training loop:
 *   collector.record({
 *     step: globalStep,
 *     epoch,
 *     loss: runningAvg,
 *     learningRate: optimizer.lr,
 *     perplexity: Perplexity.fromLoss(runningAvg),
 *     tokensPerSecond: tokens / elapsedSeconds,
 *     timestamp: Date.now(),
 *   });
 *   // After training:
 *   fs.writeFileSync("metrics.json", collector.toJSON());
 *   fs.writeFileSync("metrics.csv", collector.toCSV());
 */
export class TrainingMetricsCollector {
  private records: TrainingMetricsRecord[];

  constructor() {
    this.records = [];
  }

  /**
   * Record a training metrics entry.
   *
   * @param record - Metrics for the current step
   */
  record(record: TrainingMetricsRecord): void {
    this.records.push({ ...record });
  }

  /**
   * Record a training metrics entry from primitive values.
   *
   * Convenience method — constructs the record object internally.
   * `tokensPerSecond` is optional and defaults to undefined.
   *
   * @param step          - Global step number
   * @param epoch         - Current epoch
   * @param loss          - Current loss
   * @param learningRate  - Current learning rate
   * @param tokensPerSec  - Optional tokens/second
   */
  recordSimple(
    step: number,
    epoch: number,
    loss: number,
    learningRate: number,
    tokensPerSec?: number
  ): void {
    this.record({
      step,
      epoch,
      loss,
      learningRate,
      perplexity: Math.exp(Math.min(loss, 709)),
      tokensPerSecond: tokensPerSec,
      timestamp: Date.now(),
    });
  }

  /**
   * Get all recorded metrics.
   */
  getRecords(): readonly TrainingMetricsRecord[] {
    return this.records;
  }

  /**
   * Number of records collected.
   */
  get count(): number {
    return this.records.length;
  }

  /**
   * Clear all recorded metrics.
   */
  reset(): void {
    this.records = [];
  }

  /**
   * Get the latest record, or undefined if no records.
   */
  latest(): TrainingMetricsRecord | undefined {
    if (this.records.length === 0) return undefined;
    return this.records[this.records.length - 1];
  }

  // ============================================================
  // Summary
  // ============================================================

  /**
   * Compute a summary of the training run from recorded metrics.
   *
   * Returns null if no records have been collected.
   */
  summarize(): TrainingMetricsSummary | null {
    if (this.records.length === 0) return null;

    const first = this.records[0];
    const last = this.records[this.records.length - 1];

    let bestLoss = Infinity;
    let bestStep = 0;
    let maxEpoch = 0;

    for (const r of this.records) {
      if (r.loss < bestLoss) {
        bestLoss = r.loss;
        bestStep = r.step;
      }
      if (r.epoch > maxEpoch) {
        maxEpoch = r.epoch;
      }
    }

    return {
      totalRecords: this.records.length,
      totalSteps: last.step,
      totalEpochs: maxEpoch + 1, // epochs are 0-indexed
      bestLoss,
      bestStep,
      finalLoss: last.loss,
      initialLoss: first.loss,
      lossDecrease: first.loss - last.loss,
      lossDecreasePercent: first.loss > 0
        ? ((first.loss - last.loss) / first.loss) * 100
        : 0,
      startTime: first.timestamp,
      endTime: last.timestamp,
      durationMs: last.timestamp - first.timestamp,
    };
  }

  // ============================================================
  // Export — JSON
  // ============================================================

  /**
   * Export metrics as a formatted JSON string.
   *
   * Includes both the records array and a summary section
   * for convenient consumption by dashboards.
   *
   * @param pretty - Whether to pretty-print with indentation (default: true)
   */
  toJSON(pretty: boolean = true): string {
    const summary = this.summarize();

    const output = {
      version: 1,
      generatedAt: new Date().toISOString(),
      summary,
      records: this.records,
    };

    return JSON.stringify(output, null, pretty ? 2 : 0);
  }

  /**
   * Export metrics as a JSON-compatible object.
   *
   * Useful for programmatic consumption (e.g., in API responses).
   */
  toObject(): { summary: TrainingMetricsSummary | null; records: TrainingMetricsRecord[] } {
    return {
      summary: this.summarize(),
      records: [...this.records],
    };
  }

  // ============================================================
  // Export — CSV
  // ============================================================

  /**
   * Export metrics as a CSV string.
   *
   * Columns: step, epoch, loss, learningRate, perplexity, tokensPerSecond, timestamp
   *
   * The first row is a header. Values are formatted with appropriate precision.
   *
   * @returns CSV-formatted string
   */
  toCSV(): string {
    if (this.records.length === 0) {
      return "step,epoch,loss,learningRate,perplexity,tokensPerSecond,timestamp\n";
    }

    const header = "step,epoch,loss,learningRate,perplexity,tokensPerSecond,timestamp";
    const rows = this.records.map((r) => {
      const tps = r.tokensPerSecond !== undefined
        ? r.tokensPerSecond.toFixed(2)
        : "";
      return [
        r.step,
        r.epoch,
        r.loss.toFixed(6),
        r.learningRate.toExponential(6),
        r.perplexity.toFixed(4),
        tps,
        r.timestamp,
      ].join(",");
    });

    return header + "\n" + rows.join("\n") + "\n";
  }

  // ============================================================
  // Static helpers
  // ============================================================

  /**
   * Parse a JSON metrics export back into a TrainingMetricsCollector.
   *
   * @param json - JSON string previously produced by toJSON()
   */
  static fromJSON(json: string): TrainingMetricsCollector {
    const parsed = JSON.parse(json);

    if (!parsed.records || !Array.isArray(parsed.records)) {
      throw new Error(
        "TrainingMetricsCollector.fromJSON: invalid format — missing records array"
      );
    }

    const collector = new TrainingMetricsCollector();
    for (const r of parsed.records) {
      collector.record(r as TrainingMetricsRecord);
    }

    return collector;
  }

  /**
   * Parse a CSV metrics export back into a TrainingMetricsCollector.
   *
   * @param csv - CSV string previously produced by toCSV()
   */
  static fromCSV(csv: string): TrainingMetricsCollector {
    const lines = csv.trim().split("\n");

    if (lines.length < 2) {
      return new TrainingMetricsCollector();
    }

    // Validate header
    const expectedHeader = "step,epoch,loss,learningRate,perplexity,tokensPerSecond,timestamp";
    if (lines[0].trim() !== expectedHeader) {
      throw new Error(
        `TrainingMetricsCollector.fromCSV: unexpected header "${lines[0]}"`
      );
    }

    const collector = new TrainingMetricsCollector();
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(",");
      if (cols.length >= 6) {
        collector.record({
          step: parseInt(cols[0], 10),
          epoch: parseInt(cols[1], 10),
          loss: parseFloat(cols[2]),
          learningRate: parseFloat(cols[3]),
          perplexity: parseFloat(cols[4]),
          tokensPerSecond: cols[5] ? parseFloat(cols[5]) : undefined,
          timestamp: parseInt(cols[6], 10),
        });
      }
    }

    return collector;
  }
}
