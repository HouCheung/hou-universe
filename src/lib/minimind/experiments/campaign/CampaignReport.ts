// ============================================================
// CampaignReport — Campaign-level training report generation
// ============================================================
// Phase 55: Generates structured campaign reports in JSON and
// Markdown formats from TrainingCampaignResult data.
//
// Reports include:
//   - Model architecture and parameter count
//   - Training hyperparameters
//   - Loss curve (initial, final, best, per-step history)
//   - Perplexity metrics
//   - Gradient norm history
//   - Throughput (tokens/sec)
//   - Generation before/after comparison
//   - Reproducibility validation results
//   - Checkpoint metadata
//
// Output formats:
//   - JSON: Full structured data for programmatic consumption
//   - Markdown: Human-readable report for documentation
//
// Usage:
//   const report = CampaignReport.fromCampaignResult(result);
//   report.saveJSON("reports/tinystories-production.json");
//   report.saveMarkdown("reports/tinystories-production.md");
// ============================================================

import * as fs from "fs";
import * as path from "path";
import type { TrainingCampaignResult } from "./TrainingCampaign";

// ============================================================
// Types
// ============================================================

/**
 * Structured campaign report data — fully JSON-serializable.
 */
export interface CampaignReportData {
  /** Schema version */
  version: 1;

  /** Report metadata */
  metadata: {
    /** Campaign name */
    name: string;
    /** Campaign description */
    description?: string;
    /** When the campaign started (ISO 8601) */
    startedAt: string;
    /** When the campaign ended (ISO 8601) */
    endedAt: string;
    /** Total wall-clock duration in seconds */
    durationSeconds: number;
    /** Random seed for reproducibility */
    seed: number;
  };

  /** Model architecture */
  model: {
    /** Model class name */
    className: string;
    /** Vocabulary size */
    vocabSize: number;
    /** Hidden dimension */
    dModel: number;
    /** Number of attention heads */
    numHeads: number;
    /** Feed-forward hidden dimension */
    dFF: number;
    /** Number of transformer layers */
    numLayers: number;
    /** Maximum sequence length */
    maxSeqLen: number;
    /** Total parameter count */
    totalParams: number;
  };

  /** Dataset information */
  dataset: {
    /** Dataset type */
    type: string;
    /** Number of training samples */
    samples: number;
    /** Block size (sequence length) */
    blockSize: number;
    /** Batch size */
    batchSize: number;
    /** Tokenizer vocabulary size */
    tokenizerVocabSize: number;
    /** Tokenizer type */
    tokenizerType: string;
  };

  /** Training configuration */
  training: {
    /** Number of epochs */
    epochs: number;
    /** Optimizer type */
    optimizer: string;
    /** Learning rate */
    learningRate: number;
    /** Weight decay */
    weightDecay: number;
    /** Gradient accumulation steps */
    gradientAccumulationSteps: number;
    /** Maximum gradient norm */
    maxGradNorm: number;
    /** Warmup steps */
    warmupSteps: number;
    /** Scheduler type */
    scheduler: string;
  };

  /** Training results */
  results: {
    /** Total optimizer steps */
    totalSteps: number;
    /** Total tokens processed */
    totalTokens: number;
    /** Initial training loss */
    initialLoss: number;
    /** Final training loss */
    finalLoss: number;
    /** Best (minimum) loss */
    bestLoss: number;
    /** Final perplexity */
    finalPerplexity: number;
    /** Best perplexity */
    bestPerplexity: number;
    /** Loss decrease (absolute) */
    lossDecrease: number;
    /** Loss decrease (percentage) */
    lossDecreasePercent: number;
    /** Average gradient norm */
    averageGradientNorm: number;
    /** Max gradient norm observed */
    maxGradientNorm: number;
    /** Average tokens per second */
    tokensPerSecond: number;
    /** Training duration in seconds */
    durationSeconds: number;
  };

  /** Per-step loss history (for plotting) */
  lossHistory: Array<{
    step: number;
    epoch: number;
    loss: number;
    perplexity: number;
    gradientNorm?: number;
    learningRate?: number;
  }>;

  /** Generation evaluation */
  generation: {
    /** Prompts used for evaluation */
    prompts: string[];
    /** Before-training samples */
    before: Array<{
      prompt: string;
      text: string;
      avgLogProb: number;
      perplexity: number;
      tokenCount: number;
    }>;
    /** After-training samples */
    after: Array<{
      prompt: string;
      text: string;
      avgLogProb: number;
      perplexity: number;
      tokenCount: number;
    }>;
    /** Per-prompt comparison */
    comparison: Array<{
      prompt: string;
      beforeText: string;
      afterText: string;
      changed: boolean;
      logProbDelta: number;
      perplexityDelta: number;
    }>;
    /** Aggregate metrics */
    aggregate: {
      averageLossBefore: number;
      averageLossAfter: number;
      averagePerplexityBefore: number;
      averagePerplexityAfter: number;
      changedCount: number;
      totalPrompts: number;
    };
  };

  /** Reproducibility validation */
  reproducibility?: {
    /** Whether reproducibility was validated */
    validated: boolean;
    /** Whether the two runs produced identical results */
    identical: boolean;
    /** Maximum loss difference between runs */
    maxLossDiff: number;
    /** Whether checkpoints matched */
    checkpointsMatch: boolean;
    /** Whether generation outputs matched */
    generationsMatch: boolean;
  };

  /** Checkpoint information */
  checkpoint: {
    /** Path to saved checkpoint */
    path?: string;
    /** Step at save time */
    step: number;
    /** Loss at save time */
    loss: number;
  };

  /** System information */
  system: {
    platform: string;
    nodeVersion: string;
  };
}

// ============================================================
// CampaignReport
// ============================================================

export class CampaignReport {
  public readonly data: CampaignReportData;

  private constructor(data: CampaignReportData) {
    this.data = data;
  }

  // ============================================================
  // Factory
  // ============================================================

  /**
   * Create a CampaignReport from a TrainingCampaignResult.
   */
  static fromCampaignResult(
    result: TrainingCampaignResult,
    options?: {
      generationPrompts?: string[];
      reproducibility?: CampaignReportData["reproducibility"];
    }
  ): CampaignReport {
    const { config, metrics, modelConfig, durationMs, checkpoint } = result;

    const cfg = config.data;
    const dims = config.getModelDimensions();
    const startedAt = new Date(Date.now() - durationMs);
    const endedAt = new Date();
    const durationSeconds = durationMs / 1000;

    // Build loss history
    const lossHistory: CampaignReportData["lossHistory"] = [];
    for (const r of metrics.getRecords()) {
      lossHistory.push({
        step: r.step,
        epoch: r.epoch,
        loss: r.loss,
        perplexity: r.perplexity,
        gradientNorm: result.gradientNorms?.find(
          (g) => g.step === r.step
        )?.norm,
        learningRate: r.learningRate,
      });
    }

    // Build generation section
    const prompts = options?.generationPrompts ?? [];
    const generation: CampaignReportData["generation"] = {
      prompts,
      before: (result.generationBefore ?? []).map((g) => ({
        prompt: g.prompt,
        text: g.generatedText,
        avgLogProb: g.avgLogProb,
        perplexity: g.perplexity,
        tokenCount: g.tokenCount,
      })),
      after: (result.generationAfter ?? []).map((g) => ({
        prompt: g.prompt,
        text: g.generatedText,
        avgLogProb: g.avgLogProb,
        perplexity: g.perplexity,
        tokenCount: g.tokenCount,
      })),
      comparison: (result.generationComparison ?? []).map((c) => ({
        prompt: c.prompt,
        beforeText: c.beforeText,
        afterText: c.afterText,
        changed: c.changed,
        logProbDelta: c.logProbDelta,
        perplexityDelta: c.perplexityDelta,
      })),
      aggregate: computeAggregate(result),
    };

    // Token count
    const summary = metrics.summarize();
    const totalTokens =
      result.totalSteps *
      cfg.dataset.batchSize *
      cfg.dataset.blockSize;

    // Gradient norm stats
    const gradNorms = result.gradientNorms ?? [];
    let averageGradientNorm = 0;
    let maxGradientNorm = 0;
    if (gradNorms.length > 0) {
      let sum = 0;
      for (const g of gradNorms) {
        sum += g.norm;
        if (g.norm > maxGradientNorm) maxGradientNorm = g.norm;
      }
      averageGradientNorm = sum / gradNorms.length;
    }

    const tokensPerSecond =
      durationSeconds > 0 ? totalTokens / durationSeconds : 0;

    const data: CampaignReportData = {
      version: 1,
      metadata: {
        name: cfg.name,
        description: cfg.description,
        startedAt: startedAt.toISOString(),
        endedAt: endedAt.toISOString(),
        durationSeconds,
        seed: cfg.seed,
      },
      model: {
        className: "TensorMiniMindModel",
        vocabSize: dims.vocabSize,
        dModel: dims.dModel,
        numHeads: dims.numHeads,
        dFF: dims.dFF,
        numLayers: dims.numLayers,
        maxSeqLen: dims.maxSeqLen,
        totalParams: modelConfig.vocabSize * modelConfig.dModel, // approximate
      },
      dataset: {
        type: cfg.dataset.type,
        samples: 0, // filled by caller if available
        blockSize: cfg.dataset.blockSize,
        batchSize: cfg.dataset.batchSize,
        tokenizerVocabSize: dims.vocabSize,
        tokenizerType: cfg.tokenizer.type,
      },
      training: {
        epochs: cfg.training.epochs,
        optimizer: cfg.optimizer.type,
        learningRate: cfg.optimizer.lr,
        weightDecay: cfg.optimizer.weightDecay ?? 0,
        gradientAccumulationSteps:
          cfg.training.gradientAccumulationSteps ?? 1,
        maxGradNorm: cfg.training.gradientClipNorm ?? 0,
        warmupSteps:
          cfg.scheduler && typeof cfg.scheduler === "object" &&
          "warmupSteps" in cfg.scheduler
            ? (cfg.scheduler as { warmupSteps: number }).warmupSteps
            : 0,
        scheduler:
          cfg.scheduler && typeof cfg.scheduler === "object"
            ? (cfg.scheduler as { type: string }).type
            : "none",
      },
      results: {
        totalSteps: result.totalSteps,
        totalTokens,
        initialLoss: summary?.initialLoss ?? 0,
        finalLoss: result.finalLoss,
        bestLoss: result.bestLoss,
        finalPerplexity: result.perplexity,
        bestPerplexity: Math.exp(Math.min(result.bestLoss, 709)),
        lossDecrease: summary?.lossDecrease ?? 0,
        lossDecreasePercent: summary?.lossDecreasePercent ?? 0,
        averageGradientNorm,
        maxGradientNorm,
        tokensPerSecond,
        durationSeconds,
      },
      lossHistory,
      generation,
      reproducibility: options?.reproducibility,
      checkpoint: {
        path: result.checkpointPath,
        step: result.totalSteps,
        loss: result.finalLoss,
      },
      system: {
        platform: process.platform,
        nodeVersion: process.version,
      },
    };

    return new CampaignReport(data);
  }

  // ============================================================
  // JSON Export
  // ============================================================

  /**
   * Export report as a formatted JSON string.
   */
  toJSON(): string {
    return JSON.stringify(this.data, null, 2);
  }

  /**
   * Save report to a JSON file.
   * Creates parent directories if needed.
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
   * Load a campaign report from a JSON file.
   */
  static fromJSON(filePath: string): CampaignReport {
    if (!fs.existsSync(filePath)) {
      throw new Error(
        `CampaignReport.fromJSON: file not found: ${filePath}`
      );
    }
    const raw = fs.readFileSync(filePath, "utf-8");
    const data = JSON.parse(raw) as CampaignReportData;
    if (data.version !== 1) {
      throw new Error(
        `CampaignReport.fromJSON: unsupported version ${data.version}`
      );
    }
    return new CampaignReport(data);
  }

  // ============================================================
  // Markdown Export
  // ============================================================

  /**
   * Generate a Markdown report string.
   */
  toMarkdown(): string {
    const d = this.data;
    const lines: string[] = [];

    // Title
    lines.push(`# MiniMind Training Campaign — ${d.metadata.name}`);
    lines.push("");
    if (d.metadata.description) {
      lines.push(`> ${d.metadata.description}`);
      lines.push("");
    }
    lines.push(
      `**Generated:** ${new Date(d.metadata.endedAt).toLocaleString()} | ` +
        `**Seed:** ${d.metadata.seed} | ` +
        `**Duration:** ${d.metadata.durationSeconds.toFixed(1)}s`
    );
    lines.push("");

    // Model
    lines.push("## Model");
    lines.push("");
    lines.push("| Parameter | Value |");
    lines.push("|-----------|-------|");
    lines.push(`| Architecture | ${d.model.className} |`);
    lines.push(`| Parameters | ${d.model.totalParams.toLocaleString()} |`);
    lines.push(`| dModel | ${d.model.dModel} |`);
    lines.push(`| Heads | ${d.model.numHeads} |`);
    lines.push(`| Layers | ${d.model.numLayers} |`);
    lines.push(`| dFF | ${d.model.dFF} |`);
    lines.push(`| Vocab Size | ${d.model.vocabSize.toLocaleString()} |`);
    lines.push(`| Max Seq Len | ${d.model.maxSeqLen} |`);
    lines.push("");

    // Dataset
    lines.push("## Dataset");
    lines.push("");
    lines.push("| Parameter | Value |");
    lines.push("|-----------|-------|");
    lines.push(`| Type | ${d.dataset.type} |`);
    lines.push(`| Block Size | ${d.dataset.blockSize} |`);
    lines.push(`| Batch Size | ${d.dataset.batchSize} |`);
    lines.push(
      `| Tokenizer Vocab | ${d.dataset.tokenizerVocabSize.toLocaleString()} |`
    );
    lines.push(`| Tokenizer Type | ${d.dataset.tokenizerType} |`);
    lines.push("");

    // Training
    lines.push("## Training");
    lines.push("");
    lines.push("| Parameter | Value |");
    lines.push("|-----------|-------|");
    lines.push(`| Epochs | ${d.training.epochs} |`);
    lines.push(`| Optimizer | ${d.training.optimizer} |`);
    lines.push(
      `| Learning Rate | ${d.training.learningRate.toExponential(4)} |`
    );
    lines.push(`| Weight Decay | ${d.training.weightDecay} |`);
    lines.push(
      `| Grad Accum Steps | ${d.training.gradientAccumulationSteps} |`
    );
    lines.push(`| Max Grad Norm | ${d.training.maxGradNorm} |`);
    lines.push(`| Warmup Steps | ${d.training.warmupSteps} |`);
    lines.push(`| Scheduler | ${d.training.scheduler} |`);
    lines.push("");

    // Results
    lines.push("## Results");
    lines.push("");
    lines.push("| Metric | Value |");
    lines.push("|--------|-------|");
    lines.push(`| Total Steps | ${d.results.totalSteps.toLocaleString()} |`);
    lines.push(
      `| Total Tokens | ${d.results.totalTokens.toLocaleString()} |`
    );
    lines.push(
      `| Initial Loss | ${d.results.initialLoss.toFixed(4)} |`
    );
    lines.push(
      `| Final Loss | ${d.results.finalLoss.toFixed(4)} |`
    );
    lines.push(
      `| Best Loss | ${d.results.bestLoss.toFixed(4)} |`
    );
    lines.push(
      `| Loss Decrease | ${d.results.lossDecrease.toFixed(4)} ` +
        `(${d.results.lossDecreasePercent.toFixed(1)}%) |`
    );
    lines.push(
      `| Final Perplexity | ${d.results.finalPerplexity.toFixed(2)} |`
    );
    lines.push(
      `| Best Perplexity | ${d.results.bestPerplexity.toFixed(2)} |`
    );
    lines.push(
      `| Avg Gradient Norm | ${d.results.averageGradientNorm.toFixed(4)} |`
    );
    lines.push(
      `| Max Gradient Norm | ${d.results.maxGradientNorm.toFixed(4)} |`
    );
    lines.push(
      `| Throughput | ${d.results.tokensPerSecond.toFixed(0)} tokens/s |`
    );
    lines.push(
      `| Duration | ${d.results.durationSeconds.toFixed(1)}s |`
    );
    lines.push("");

    // Loss curve summary
    lines.push("### Loss Curve");
    lines.push("");
    if (d.lossHistory.length > 0) {
      const first = d.lossHistory[0];
      const last = d.lossHistory[d.lossHistory.length - 1];
      lines.push(
        `- **Start (step ${first.step}):** loss=${first.loss.toFixed(4)}, ` +
          `ppl=${first.perplexity.toFixed(2)}`
      );
      lines.push(
        `- **End (step ${last.step}):** loss=${last.loss.toFixed(4)}, ` +
          `ppl=${last.perplexity.toFixed(2)}`
      );
      lines.push(
        `- **Total records:** ${d.lossHistory.length}`
      );
    }
    lines.push("");

    // Generation
    if (d.generation.comparison.length > 0) {
      lines.push("## Generation Evaluation");
      lines.push("");

      // Aggregate
      const agg = d.generation.aggregate;
      lines.push("### Aggregate");
      lines.push("");
      lines.push("| Metric | Before | After | Delta |");
      lines.push("|--------|--------|-------|-------|");
      lines.push(
        `| Avg LogProb | ${(-agg.averageLossBefore).toFixed(4)} | ` +
          `${(-agg.averageLossAfter).toFixed(4)} | ` +
          `${((agg.averageLossBefore - agg.averageLossAfter)).toFixed(4)} |`
      );
      lines.push(
        `| Avg Perplexity | ${agg.averagePerplexityBefore.toFixed(2)} | ` +
          `${agg.averagePerplexityAfter.toFixed(2)} | ` +
          `${(agg.averagePerplexityAfter - agg.averagePerplexityBefore).toFixed(2)} |`
      );
      lines.push(
        `| Changed | — | — | ${agg.changedCount}/${agg.totalPrompts} |`
      );
      lines.push("");

      // Per-prompt
      lines.push("### Per-Prompt Comparison");
      lines.push("");
      for (const c of d.generation.comparison) {
        lines.push(`#### "${c.prompt}"`);
        lines.push("");
        lines.push("| Stage | Text |");
        lines.push("|-------|------|");
        lines.push(
          `| Before | ${escapeMarkdown(c.beforeText.substring(0, 100))} |`
        );
        lines.push(
          `| After | ${escapeMarkdown(c.afterText.substring(0, 100))} |`
        );
        lines.push("");
        lines.push(
          `Changed: ${c.changed ? "✅ Yes" : "❌ No"} | ` +
            `LogProb Δ: ${c.logProbDelta >= 0 ? "+" : ""}${c.logProbDelta.toFixed(4)} | ` +
            `Perplexity Δ: ${c.perplexityDelta >= 0 ? "+" : ""}${c.perplexityDelta.toFixed(2)}`
        );
        lines.push("");
      }
    }

    // Reproducibility
    if (d.reproducibility) {
      lines.push("## Reproducibility");
      lines.push("");
      lines.push("| Check | Result |");
      lines.push("|-------|--------|");
      lines.push(
        `| Loss curve identical | ${
          d.reproducibility.maxLossDiff < 1e-10 ? "✅" : "❌"
        } (max diff: ${d.reproducibility.maxLossDiff.toExponential(2)}) |`
      );
      lines.push(
        `| Checkpoints match | ${
          d.reproducibility.checkpointsMatch ? "✅" : "❌"
        } |`
      );
      lines.push(
        `| Generations match | ${
          d.reproducibility.generationsMatch ? "✅" : "❌"
        } |`
      );
      lines.push(
        `| Overall | ${
          d.reproducibility.identical ? "✅ Reproducible" : "❌ Not reproducible"
        } |`
      );
      lines.push("");
    }

    // System
    lines.push("## System");
    lines.push("");
    lines.push(`- **Platform:** ${d.system.platform}`);
    lines.push(`- **Node:** ${d.system.nodeVersion}`);
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
   * Generate a one-line summary string.
   */
  summarize(): string {
    const r = this.data.results;
    return (
      `[${this.data.metadata.name}] ` +
      `Loss: ${r.initialLoss.toFixed(2)} → ${r.finalLoss.toFixed(2)} ` +
      `(${r.lossDecreasePercent.toFixed(1)}%) | ` +
      `PPL: ${r.finalPerplexity.toFixed(2)} | ` +
      `${r.totalSteps} steps in ${r.durationSeconds.toFixed(1)}s | ` +
      `${r.tokensPerSecond.toFixed(0)} tok/s`
    );
  }
}

// ============================================================
// Helpers
// ============================================================

function computeAggregate(
  result: TrainingCampaignResult
): CampaignReportData["generation"]["aggregate"] {
  const before = result.generationBefore ?? [];
  const after = result.generationAfter ?? [];
  const comparison = result.generationComparison ?? [];

  let totalLossBefore = 0;
  let totalPerplexityBefore = 0;
  for (const g of before) {
    totalLossBefore += -g.avgLogProb;
    totalPerplexityBefore += g.perplexity;
  }
  const avgLossBefore = before.length > 0 ? totalLossBefore / before.length : 0;
  const avgPerplexityBefore =
    before.length > 0 ? totalPerplexityBefore / before.length : 0;

  let totalLossAfter = 0;
  let totalPerplexityAfter = 0;
  for (const g of after) {
    totalLossAfter += -g.avgLogProb;
    totalPerplexityAfter += g.perplexity;
  }
  const avgLossAfter = after.length > 0 ? totalLossAfter / after.length : 0;
  const avgPerplexityAfter =
    after.length > 0 ? totalPerplexityAfter / after.length : 0;

  let changedCount = 0;
  for (const c of comparison) {
    if (c.changed) changedCount++;
  }

  return {
    averageLossBefore: avgLossBefore,
    averageLossAfter: avgLossAfter,
    averagePerplexityBefore: avgPerplexityBefore,
    averagePerplexityAfter: avgPerplexityAfter,
    changedCount,
    totalPrompts: comparison.length,
  };
}

function escapeMarkdown(text: string): string {
  return text
    .replace(/\|/g, "\\|")
    .replace(/\n/g, " ")
    .replace(/\r/g, "");
}
