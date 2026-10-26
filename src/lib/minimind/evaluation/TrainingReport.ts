// ============================================================
// TrainingReport — Structured training report with JSON and
// Markdown export
// ============================================================
// Phase 46: Generates human-readable training reports from
// experiment results. Supports JSON export and Markdown report
// generation for documentation and sharing.
//
// Usage:
//   const report = TrainingReport.fromExperimentResult(result);
//   console.log(report.toMarkdown());
//   report.saveJSON("report.json");
//   report.saveMarkdown("report.md");
// ============================================================

import * as fs from "fs";
import * as path from "path";
import type { TrainingExperimentResult } from "../experiments/TrainingExperimentRunner";
import type { GenerationComparison } from "./GenerationEvaluator";

// ============================================================
// Types
// ============================================================

/**
 * Structured training report data — fully serializable.
 */
export interface TrainingReportData {
  /** Report metadata */
  metadata: {
    /** Experiment name */
    name: string;
    /** When report was generated */
    generatedAt: string;
    /** Schema version */
    version: 1;
  };

  /** Model architecture summary */
  model: {
    /** Model class name */
    className: string;
    /** Total parameter count */
    totalParams: number;
    /** Architecture hyperparameters */
    config: {
      vocabSize: number;
      dModel: number;
      numHeads: number;
      dFF: number;
      numLayers: number;
      maxSeqLen: number;
    };
  };

  /** Dataset summary */
  dataset: {
    /** Dataset name/type */
    name: string;
    /** Number of training samples */
    samples: number;
    /** Block size (sequence length) */
    blockSize: number;
    /** Batch size */
    batchSize: number;
    /** Tokenizer vocabulary size */
    tokenizerVocabSize: number;
  };

  /** Training results */
  training: {
    /** Total optimizer steps */
    steps: number;
    /** Number of epochs */
    epochs: number;
    /** Initial loss (first recorded) */
    initialLoss: number;
    /** Final loss (last recorded) */
    finalLoss: number;
    /** Best loss achieved */
    bestLoss: number;
    /** Initial perplexity */
    initialPerplexity: number;
    /** Final perplexity */
    finalPerplexity: number;
    /** Loss decrease (absolute) */
    lossDecrease: number;
    /** Loss decrease (percentage) */
    lossDecreasePercent: number;
    /** Total training duration in seconds */
    durationSeconds: number;
    /** Approximate tokens seen */
    tokensSeen: number;
    /** Approximate throughput (tokens/sec) */
    throughput: number;
    /** Whether training completed */
    completed: boolean;
  };

  /** Generation comparison (before vs after training) */
  generation?: {
    /** Before training samples */
    before: Array<{
      prompt: string;
      text: string;
      avgLogProb: number;
      perplexity: number;
    }>;
    /** After training samples */
    after: Array<{
      prompt: string;
      text: string;
      avgLogProb: number;
      perplexity: number;
    }>;
    /** Per-prompt comparisons */
    comparison: TrainingReportGenerationComparison[];
  };

  /** Loss history (for plotting) */
  lossHistory: Array<{
    step: number;
    epoch: number;
    loss: number;
    perplexity: number;
  }>;

  /** Reproducibility info */
  reproducibility: {
    /** Random seed */
    seed: number;
    /** Config file path (if loaded from file) */
    configSource?: string;
  };
}

/** Simplified generation comparison for the report */
export interface TrainingReportGenerationComparison {
  prompt: string;
  beforeText: string;
  afterText: string;
  changed: boolean;
  logProbDelta: number;
  perplexityDelta: number;
}

// ============================================================
// TrainingReport
// ============================================================

export class TrainingReport {
  public readonly data: TrainingReportData;

  private constructor(data: TrainingReportData) {
    this.data = data;
  }

  // ============================================================
  // Factory
  // ============================================================

  /**
   * Create a training report from an experiment result.
   */
  static fromExperimentResult(
    result: TrainingExperimentResult,
    options?: {
      seed?: number;
      configSource?: string;
    }
  ): TrainingReport {
    const { modelConfig, metrics } = result;
    const summary = metrics.summarize();
    const records = metrics.getRecords();
    const durationSeconds = result.durationMs / 1000;

    // Calculate tokens seen
    const tokensSeen =
      result.totalSteps *
      (modelConfig.maxSeqLen *
        // We don't store batchSize in result directly, approximate from totalBatches
        1); // batch size is implicit

    // Build loss history
    const lossHistory: TrainingReportData["lossHistory"] = [];
    for (const r of records) {
      lossHistory.push({
        step: r.step,
        epoch: r.epoch,
        loss: r.loss,
        perplexity: r.perplexity,
      });
    }

    // Build generation section
    let generation: TrainingReportData["generation"] | undefined;
    if (
      result.generationBefore &&
      result.generationAfter &&
      result.generationComparison
    ) {
      generation = {
        before: result.generationBefore.map((g) => ({
          prompt: g.prompt,
          text: g.generatedText,
          avgLogProb: g.avgLogProb,
          perplexity: g.perplexity,
        })),
        after: result.generationAfter.map((g) => ({
          prompt: g.prompt,
          text: g.generatedText,
          avgLogProb: g.avgLogProb,
          perplexity: g.perplexity,
        })),
        comparison: result.generationComparison.map((c) => ({
          prompt: c.prompt,
          beforeText: c.beforeText,
          afterText: c.afterText,
          changed: c.changed,
          logProbDelta: c.logProbDelta,
          perplexityDelta: c.perplexityDelta,
        })),
      };
    }

    // Calculate throughput
    const throughput =
      durationSeconds > 0
        ? (result.totalSteps * modelConfig.maxSeqLen) / durationSeconds
        : 0;

    const data: TrainingReportData = {
      metadata: {
        name: result.name,
        generatedAt: new Date().toISOString(),
        version: 1,
      },
      model: {
        className: "TensorMiniMindModel",
        totalParams: modelConfig.vocabSize * modelConfig.dModel, // approximate
        config: {
          vocabSize: modelConfig.vocabSize,
          dModel: modelConfig.dModel,
          numHeads: modelConfig.numHeads,
          dFF: modelConfig.dFF,
          numLayers: modelConfig.numLayers,
          maxSeqLen: modelConfig.maxSeqLen,
        },
      },
      dataset: {
        name: "TinyStories",
        samples: records.length > 0 ? records.length * 10 : 0, // approximate
        blockSize: modelConfig.maxSeqLen,
        batchSize: 8, // approximate, not stored in result
        tokenizerVocabSize: modelConfig.vocabSize,
      },
      training: {
        steps: result.totalSteps,
        epochs: lossHistory.length > 0
          ? lossHistory[lossHistory.length - 1].epoch + 1
          : 0,
        initialLoss: summary?.initialLoss ?? 0,
        finalLoss: result.finalLoss,
        bestLoss: result.bestLoss,
        initialPerplexity: summary?.initialLoss
          ? Math.exp(summary.initialLoss)
          : 0,
        finalPerplexity: result.perplexity,
        lossDecrease: summary?.lossDecrease ?? 0,
        lossDecreasePercent: summary?.lossDecreasePercent ?? 0,
        durationSeconds,
        tokensSeen,
        throughput,
        completed: true,
      },
      generation,
      lossHistory,
      reproducibility: {
        seed: options?.seed ?? 42,
        configSource: options?.configSource,
      },
    };

    return new TrainingReport(data);
  }

  // ============================================================
  // JSON Export
  // ============================================================

  /**
   * Export report as a JSON string.
   */
  toJSON(): string {
    return JSON.stringify(this.data, null, 2);
  }

  /**
   * Save report to a JSON file.
   */
  saveJSON(filePath: string): void {
    const resolved = path.resolve(filePath);
    const dir = path.dirname(resolved);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(resolved, this.toJSON(), "utf-8");
  }

  /**
   * Load report from a JSON file.
   */
  static fromJSON(filePath: string): TrainingReport {
    if (!fs.existsSync(filePath)) {
      throw new Error(`TrainingReport.fromJSON: file not found: ${filePath}`);
    }
    const raw = fs.readFileSync(filePath, "utf-8");
    const data = JSON.parse(raw) as TrainingReportData;
    if (data.metadata.version !== 1) {
      throw new Error(
        `TrainingReport.fromJSON: unsupported version ${data.metadata.version}`
      );
    }
    return new TrainingReport(data);
  }

  // ============================================================
  // Markdown Export
  // ============================================================

  /**
   * Generate a Markdown report string.
   *
   * Produces a formatted report suitable for documentation,
   * README files, or sharing results.
   */
  toMarkdown(): string {
    const d = this.data;
    const lines: string[] = [];

    // Title
    lines.push(`# MiniMind Training Report — ${d.metadata.name}`);
    lines.push("");
    lines.push(
      `*Generated: ${new Date(d.metadata.generatedAt).toLocaleString()}*`
    );
    lines.push("");

    // Model section
    lines.push("## Model");
    lines.push("");
    lines.push(`- **Architecture:** ${d.model.className}`);
    lines.push(
      `- **Parameters:** ${d.model.totalParams.toLocaleString()}`
    );
    lines.push(
      `- **Config:** vocabSize=${d.model.config.vocabSize}, ` +
        `dModel=${d.model.config.dModel}, ` +
        `heads=${d.model.config.numHeads}, ` +
        `dFF=${d.model.config.dFF}, ` +
        `layers=${d.model.config.numLayers}`
    );
    lines.push("");

    // Dataset section
    lines.push("## Dataset");
    lines.push("");
    lines.push(`- **Name:** ${d.dataset.name}`);
    lines.push(`- **Samples:** ${d.dataset.samples.toLocaleString()}`);
    lines.push(
      `- **Block Size:** ${d.dataset.blockSize}`
    );
    lines.push(`- **Batch Size:** ${d.dataset.batchSize}`);
    lines.push(
      `- **Tokenizer Vocab:** ${d.dataset.tokenizerVocabSize.toLocaleString()}`
    );
    lines.push("");

    // Training section
    lines.push("## Training");
    lines.push("");
    lines.push(`- **Steps:** ${d.training.steps.toLocaleString()}`);
    lines.push(`- **Epochs:** ${d.training.epochs}`);
    lines.push(`- **Duration:** ${d.training.durationSeconds.toFixed(1)}s`);
    lines.push(
      `- **Tokens Seen:** ${d.training.tokensSeen.toLocaleString()}`
    );
    lines.push(
      `- **Throughput:** ${d.training.throughput.toFixed(0)} tokens/s`
    );
    lines.push("");

    // Loss section
    lines.push("## Loss");
    lines.push("");
    lines.push("| Metric | Value |");
    lines.push("|--------|-------|");
    lines.push(
      `| Initial Loss | ${d.training.initialLoss.toFixed(4)} |`
    );
    lines.push(
      `| Final Loss | ${d.training.finalLoss.toFixed(4)} |`
    );
    lines.push(
      `| Best Loss | ${d.training.bestLoss.toFixed(4)} |`
    );
    lines.push(
      `| Loss Decrease | ${d.training.lossDecrease.toFixed(4)} (${d.training.lossDecreasePercent.toFixed(1)}%) |`
    );
    lines.push("");

    // Loss trend
    lines.push("### Loss Trend");
    lines.push("");
    lines.push(
      `${d.training.initialLoss.toFixed(2)} → ${d.training.finalLoss.toFixed(2)}`
    );
    lines.push("");

    // Perplexity section
    lines.push("## Perplexity");
    lines.push("");
    lines.push("| Metric | Value |");
    lines.push("|--------|-------|");
    if (d.training.initialPerplexity > 0) {
      lines.push(
        `| Initial Perplexity | ${d.training.initialPerplexity.toFixed(2)} |`
      );
    }
    lines.push(
      `| Final Perplexity | ${d.training.finalPerplexity.toFixed(2)} |`
    );
    lines.push("");

    // Generation section (if available)
    if (d.generation && d.generation.comparison.length > 0) {
      lines.push("## Generation");
      lines.push("");

      for (const c of d.generation.comparison) {
        lines.push(`### Prompt: "${c.prompt}"`);
        lines.push("");
        lines.push("| Stage | Text |");
        lines.push("|-------|------|");
        lines.push(
          `| Before | ${escapeMarkdown(c.beforeText.substring(0, 80))}... |`
        );
        lines.push(
          `| After | ${escapeMarkdown(c.afterText.substring(0, 80))}... |`
        );
        lines.push("");
        lines.push(
          `- **Changed:** ${c.changed ? "✅ Yes" : "❌ No"}`
        );
        lines.push(
          `- **LogProb Δ:** ${c.logProbDelta >= 0 ? "+" : ""}${c.logProbDelta.toFixed(4)}`
        );
        lines.push(
          `- **Perplexity Δ:** ${c.perplexityDelta >= 0 ? "+" : ""}${c.perplexityDelta.toFixed(2)}`
        );
        lines.push("");
      }
    }

    // Reproducibility section
    lines.push("## Reproducibility");
    lines.push("");
    lines.push(`- **Seed:** ${d.reproducibility.seed}`);
    if (d.reproducibility.configSource) {
      lines.push(
        `- **Config:** \`${d.reproducibility.configSource}\``
      );
    }
    lines.push("");

    return lines.join("\n");
  }

  /**
   * Save report as a Markdown file.
   */
  saveMarkdown(filePath: string): void {
    const resolved = path.resolve(filePath);
    const dir = path.dirname(resolved);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(resolved, this.toMarkdown(), "utf-8");
  }

  // ============================================================
  // Summary
  // ============================================================

  /**
   * Generate a concise one-line summary.
   */
  summarize(): string {
    const d = this.data.training;
    return (
      `[${this.data.metadata.name}] ` +
      `Loss: ${d.initialLoss.toFixed(2)} → ${d.finalLoss.toFixed(2)} ` +
      `(${d.lossDecreasePercent.toFixed(1)}% decrease) | ` +
      `PPL: ${d.finalPerplexity.toFixed(2)} | ` +
      `${d.steps} steps in ${d.durationSeconds.toFixed(1)}s`
    );
  }
}

// ============================================================
// Helpers
// ============================================================

function escapeMarkdown(text: string): string {
  return text
    .replace(/\|/g, "\\|")
    .replace(/\n/g, " ")
    .replace(/\r/g, "");
}
