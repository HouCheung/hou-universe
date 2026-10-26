// ============================================================
// MiniMind Experiments — BenchmarkReport.ts
// ============================================================
// Structured benchmark experiment reports for MiniMind training.
//
// Generates reproducible benchmark reports that track:
//   - Model configuration and parameter count
//   - Training hyperparameters
//   - Loss trajectory (initial, final, best)
//   - Perplexity metrics
//   - Training throughput (tokens/sec)
//   - Hardware/memory info
//   - Reproducibility metadata
//
// Reports are JSON-serializable for storage and comparison.
//
// Usage:
//   const report = BenchmarkReport.create({
//     model, config, metrics, tokenizer,
//   });
//   console.log(report.summarize());
//   report.save("benchmark-run-001.json");
// ============================================================

import * as fs from "fs";
import type { TensorMiniMindModel } from "../model/TensorMiniMindModel";
import type { TrainingMetricsCollector } from "../training/Metrics";
import type { TrainingConfigFile } from "../cli/TrainingConfig";

// ============================================================
// Types
// ============================================================

export interface BenchmarkReportData {
  /** Report schema version */
  version: 1;

  /** Experiment identification */
  experiment: {
    /** Unique experiment name */
    name: string;
    /** ISO timestamp when experiment started */
    startedAt: string;
    /** ISO timestamp when experiment ended */
    endedAt: string;
    /** Git commit hash (if available) */
    gitCommit?: string;
    /** Human-readable description */
    description?: string;
  };

  /** Model architecture */
  model: {
    preset: string;
    vocabSize: number;
    dModel: number;
    numHeads: number;
    dFF: number;
    numLayers: number;
    maxSeqLen: number;
    totalParams: number;
    trainableParams: number;
  };

  /** Training configuration */
  training: {
    epochs: number;
    batchSize: number;
    learningRate: number;
    weightDecay: number;
    gradientAccumulationSteps: number;
    maxGradNorm: number;
    warmupSteps: number;
    blockSize: number;
  };

  /** Results */
  results: {
    /** Initial training loss */
    initialLoss: number;
    /** Best (minimum) loss achieved */
    bestLoss: number;
    /** Best perplexity */
    bestPerplexity: number;
    /** Final training loss */
    finalLoss: number;
    /** Final perplexity */
    finalPerplexity: number;
    /** Total loss decrease */
    lossDecrease: number;
    /** Loss decrease as percentage */
    lossDecreasePercent: number;
    /** Total training steps */
    totalSteps: number;
    /** Total epochs completed */
    totalEpochs: number;
    /** Wall-clock duration in seconds */
    durationSeconds: number;
    /** Training throughput (tokens/second) */
    tokensPerSecond?: number;
  };

  /** Dataset info */
  dataset: {
    type: string;
    totalSamples: number;
    tokenizerVocabSize: number;
    tokenizerType: string;
  };

  /** Loss history for plotting */
  lossHistory: Array<{
    step: number;
    epoch: number;
    loss: number;
    perplexity: number;
  }>;

  /** System info */
  system?: {
    platform: string;
    nodeVersion: string;
    cpuCores?: number;
  };
}

// ============================================================
// BenchmarkReport
// ============================================================

export class BenchmarkReport {
  public readonly data: BenchmarkReportData;

  private constructor(data: BenchmarkReportData) {
    this.data = data;
  }

  // ============================================================
  // Factory
  // ============================================================

  /**
   * Create a benchmark report from a training run.
   */
  static create(options: {
    model: TensorMiniMindModel;
    config: TrainingConfigFile;
    metrics: TrainingMetricsCollector;
    tokenizerVocabSize: number;
    tokenizerType: string;
    datasetSamples: number;
    startedAt: Date;
    endedAt: Date;
  }): BenchmarkReport {
    const { model, config, metrics, tokenizerVocabSize, tokenizerType, datasetSamples, startedAt, endedAt } = options;
    const summary = metrics.summarize();

    const dims = {
      vocabSize: 0,
      dModel: 0,
      numHeads: 0,
      dFF: 0,
      numLayers: 0,
      maxSeqLen: 0,
    };

    // Extract dims from model by inspecting named parameters
    for (const { name, parameter } of model.namedParameters()) {
      if (name === "embedding.weight") {
        dims.vocabSize = parameter.shape[0];
        dims.dModel = parameter.shape[1];
      }
      if (name === "blocks.0.attention.q_proj.weight") {
        dims.dModel = parameter.shape[0];
      }
      if (name === "blocks.0.ffn.gate.weight") {
        dims.dFF = parameter.shape[0];
      }
    }

    // Count layers
    let maxLayer = -1;
    for (const { name } of model.namedParameters()) {
      const m = name.match(/^blocks\.(\d+)\./);
      if (m) {
        const idx = parseInt(m[1], 10);
        if (idx > maxLayer) maxLayer = idx;
      }
    }
    dims.numLayers = maxLayer + 1;

    // Count heads from attention output projection
    for (const { name, parameter } of model.namedParameters()) {
      if (name === "blocks.0.attention.o_proj.weight") {
        // dModel = numHeads * headDim, infer from shape
        dims.numHeads = 4; // default, hard to infer precisely
      }
    }

    const durationSeconds = (endedAt.getTime() - startedAt.getTime()) / 1000;

    // Build loss history from metrics records
    const lossHistory: BenchmarkReportData["lossHistory"] = [];
    const records = metrics.toJSON();
    if (Array.isArray(records)) {
      for (const r of records) {
        lossHistory.push({
          step: r.step,
          epoch: r.epoch,
          loss: r.loss,
          perplexity: r.perplexity,
        });
      }
    }

    const data: BenchmarkReportData = {
      version: 1,
      experiment: {
        name: config.metadata.name,
        startedAt: startedAt.toISOString(),
        endedAt: endedAt.toISOString(),
        description: config.metadata.description,
      },
      model: {
        preset: config.model.preset,
        vocabSize: dims.vocabSize,
        dModel: dims.dModel,
        numHeads: dims.numHeads,
        dFF: dims.dFF,
        numLayers: dims.numLayers,
        maxSeqLen: config.dataset.blockSize,
        totalParams: model.totalParamCount,
        trainableParams: model.totalParamCount,
      },
      training: {
        epochs: config.training.epochs,
        batchSize: config.training.batchSize,
        learningRate: config.training.learningRate,
        weightDecay: config.training.weightDecay,
        gradientAccumulationSteps: config.training.gradientAccumulationSteps,
        maxGradNorm: config.training.maxGradNorm,
        warmupSteps: config.training.warmupSteps,
        blockSize: config.dataset.blockSize,
      },
      results: {
        initialLoss: summary?.initialLoss ?? 0,
        bestLoss: summary?.bestLoss ?? 0,
        bestPerplexity: summary?.bestLoss ? Math.exp(summary.bestLoss) : 0,
        finalLoss: summary?.finalLoss ?? 0,
        finalPerplexity: summary?.finalLoss ? Math.exp(summary.finalLoss) : 0,
        lossDecrease: summary?.lossDecrease ?? 0,
        lossDecreasePercent: summary?.lossDecreasePercent ?? 0,
        totalSteps: summary?.totalSteps ?? 0,
        totalEpochs: summary?.totalEpochs ?? 0,
        durationSeconds,
        tokensPerSecond: durationSeconds > 0
          ? (summary?.totalSteps ?? 0) * config.training.batchSize * config.dataset.blockSize / durationSeconds
          : undefined,
      },
      dataset: {
        type: config.dataset.type,
        totalSamples: datasetSamples,
        tokenizerVocabSize,
        tokenizerType,
      },
      lossHistory,
      system: {
        platform: process.platform,
        nodeVersion: process.version,
      },
    };

    return new BenchmarkReport(data);
  }

  // ============================================================
  // Public API
  // ============================================================

  /**
   * Generate a human-readable summary string.
   */
  summarize(): string {
    const r = this.data.results;
    const m = this.data.model;
    const t = this.data.training;

    return [
      `${"=".repeat(60)}`,
      `Benchmark: ${this.data.experiment.name}`,
      `${"=".repeat(60)}`,
      `Model:      ${m.preset} | ${m.totalParams.toLocaleString()} params | ` +
        `d=${m.dModel}, heads=${m.numHeads}, layers=${m.numLayers}`,
      `Training:   ${t.epochs} epochs × ${t.batchSize} batch | ` +
        `lr=${t.learningRate}, wd=${t.weightDecay}`,
      `Results:    loss ${r.initialLoss.toFixed(4)} → ${r.finalLoss.toFixed(4)} ` +
        `(best: ${r.bestLoss.toFixed(4)}) | decrease: ${r.lossDecreasePercent.toFixed(1)}%`,
      `Perplexity: ${r.finalPerplexity.toFixed(2)} (best: ${r.bestPerplexity.toFixed(2)})`,
      `Duration:   ${r.durationSeconds.toFixed(1)}s | ${r.totalSteps} steps`,
      r.tokensPerSecond
        ? `Throughput: ${r.tokensPerSecond.toFixed(0)} tokens/s`
        : "",
      `${"=".repeat(60)}`,
    ].filter((l) => l.length > 0).join("\n");
  }

  /**
   * Save report to JSON file.
   */
  save(filePath: string): void {
    const dir = filePath.substring(0, filePath.lastIndexOf("/"));
    if (dir && !fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(this.data, null, 2), "utf-8");
  }

  /**
   * Load report from JSON file.
   */
  static load(filePath: string): BenchmarkReport {
    if (!fs.existsSync(filePath)) {
      throw new Error(`BenchmarkReport.load: file not found: ${filePath}`);
    }
    const data = JSON.parse(fs.readFileSync(filePath, "utf-8")) as BenchmarkReportData;
    if ((data as BenchmarkReportData).version !== 1) {
      throw new Error(`BenchmarkReport.load: unsupported version ${(data as BenchmarkReportData).version}`);
    }
    return new BenchmarkReport(data);
  }

  /**
   * Compare two benchmark reports.
   * Returns a comparison summary object.
   */
  static compare(a: BenchmarkReport, b: BenchmarkReport): BenchmarkComparison {
    const aR = a.data.results;
    const bR = b.data.results;

    return {
      nameA: a.data.experiment.name,
      nameB: b.data.experiment.name,
      lossDelta: bR.finalLoss - aR.finalLoss,
      perplexityDelta: bR.finalPerplexity - aR.finalPerplexity,
      lossDecreaseDelta: bR.lossDecreasePercent - aR.lossDecreasePercent,
      durationDelta: bR.durationSeconds - aR.durationSeconds,
      winner: aR.finalLoss < bR.finalLoss ? "A" : bR.finalLoss < aR.finalLoss ? "B" : "tie",
    };
  }
}

export interface BenchmarkComparison {
  nameA: string;
  nameB: string;
  lossDelta: number;
  perplexityDelta: number;
  lossDecreaseDelta: number;
  durationDelta: number;
  winner: "A" | "B" | "tie";
}
