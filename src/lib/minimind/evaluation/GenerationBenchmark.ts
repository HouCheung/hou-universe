// ============================================================
// GenerationBenchmark — Structured generation evaluation
// benchmark for before/after training comparison
// ============================================================
// Phase 46: Wraps GenerationEvaluator to provide a benchmark-
// style interface for comparing generation quality before and
// after training. Supports multiple prompt suites and computes
// aggregate metrics across all prompts.
//
// Usage:
//   const benchmark = new GenerationBenchmark(model, tokenizer);
//   const beforeResults = benchmark.run("default");
//   // ... train model ...
//   const afterResults = benchmark.run("default");
//   const comparison = benchmark.compare(beforeResults, afterResults);
//   console.log(benchmark.summarizeComparison(comparison));
// ============================================================

import type { TensorMiniMindModel } from "../model/TensorMiniMindModel";
import type { BPETokenizer } from "../tokenizer/BPETokenizer";
import { GenerationEvaluator } from "./GenerationEvaluator";
import type {
  GenerationEvalResult,
  GenerationComparison,
  GenerationEvalOptions,
} from "./GenerationEvaluator";
import {
  getPromptSuite,
  type PromptSuiteName,
} from "./PromptSuite";

// ============================================================
// Types
// ============================================================

/**
 * Result of a generation benchmark run.
 */
export interface GenerationBenchmarkResult {
  /** Which prompt suite was used */
  suiteName: string;
  /** Per-prompt generation results */
  results: GenerationEvalResult[];
  /** Aggregate metrics */
  aggregate: GenerationBenchmarkAggregate;
  /** When the benchmark was run */
  timestamp: string;
}

/**
 * Aggregate metrics across all prompts in a benchmark run.
 */
export interface GenerationBenchmarkAggregate {
  /** Number of prompts evaluated */
  promptCount: number;
  /** Average tokens generated per prompt */
  avgTokenCount: number;
  /** Average log-probability across all prompts */
  avgLogProb: number;
  /** Average perplexity across all prompts */
  avgPerplexity: number;
  /** Number of generations that hit EOS */
  eosCount: number;
  /** Number of generations that hit maxTokens */
  maxTokensCount: number;
}

/**
 * Comparison between two benchmark runs (before/after training).
 */
export interface GenerationBenchmarkComparison {
  /** Suite name */
  suiteName: string;
  /** Per-prompt comparisons */
  comparisons: GenerationComparison[];
  /** Number of prompts that produced different output */
  changedCount: number;
  /** Total number of prompts */
  totalCount: number;
  /** Change ratio (changedCount / totalCount) */
  changeRatio: number;
  /** Average log-probability delta */
  avgLogProbDelta: number;
  /** Average perplexity delta */
  avgPerplexityDelta: number;
  /** Aggregate before metrics */
  beforeAggregate: GenerationBenchmarkAggregate;
  /** Aggregate after metrics */
  afterAggregate: GenerationBenchmarkAggregate;
}

/**
 * Options for running a generation benchmark.
 */
export interface GenerationBenchmarkOptions extends GenerationEvalOptions {
  /** Which prompt suite to use (name or custom prompts) */
  suite?: PromptSuiteName | string[];
}

// ============================================================
// GenerationBenchmark
// ============================================================

export class GenerationBenchmark {
  private evaluator: GenerationEvaluator;

  /**
   * @param model     - Model to benchmark generation from
   * @param tokenizer - BPETokenizer for encode/decode
   */
  constructor(model: TensorMiniMindModel, tokenizer: BPETokenizer) {
    this.evaluator = new GenerationEvaluator(model, tokenizer);
  }

  /**
   * Run a generation benchmark on a prompt suite.
   *
   * @param options - Benchmark configuration
   * @returns Benchmark result with per-prompt and aggregate metrics
   */
  run(options?: GenerationBenchmarkOptions): GenerationBenchmarkResult {
    const { suite = "default", ...genOptions } = options ?? {};

    // Resolve prompts
    const prompts: string[] = Array.isArray(suite)
      ? suite
      : [...getPromptSuite(suite)];

    const suiteName = Array.isArray(suite) ? "custom" : suite;

    // Run generation evaluation
    const results = this.evaluator.evaluate(prompts, genOptions);

    // Compute aggregate
    const aggregate = GenerationBenchmark.computeAggregate(results);

    return {
      suiteName,
      results,
      aggregate,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Compare two benchmark runs (typically before/after training).
   *
   * @param before - Benchmark result before training
   * @param after  - Benchmark result after training
   * @returns Structured comparison
   */
  compare(
    before: GenerationBenchmarkResult,
    after: GenerationBenchmarkResult
  ): GenerationBenchmarkComparison {
    const comparisons = this.evaluator.compare(
      before.results,
      after.results
    );

    const changedCount = comparisons.filter((c) => c.changed).length;

    const totalLogProbDelta = comparisons.reduce(
      (sum, c) => sum + c.logProbDelta,
      0
    );
    const totalPerplexityDelta = comparisons.reduce(
      (sum, c) => sum + c.perplexityDelta,
      0
    );

    return {
      suiteName: before.suiteName,
      comparisons,
      changedCount,
      totalCount: comparisons.length,
      changeRatio:
        comparisons.length > 0
          ? changedCount / comparisons.length
          : 0,
      avgLogProbDelta:
        comparisons.length > 0
          ? totalLogProbDelta / comparisons.length
          : 0,
      avgPerplexityDelta:
        comparisons.length > 0
          ? totalPerplexityDelta / comparisons.length
          : 0,
      beforeAggregate: before.aggregate,
      afterAggregate: after.aggregate,
    };
  }

  /**
   * Generate a human-readable summary of the comparison.
   */
  summarizeComparison(
    comparison: GenerationBenchmarkComparison
  ): string {
    const lines: string[] = [
      `${"=".repeat(60)}`,
      `Generation Benchmark: ${comparison.suiteName}`,
      `${"=".repeat(60)}`,
      `Prompts evaluated: ${comparison.totalCount}`,
      `Changed: ${comparison.changedCount}/${comparison.totalCount} (${(comparison.changeRatio * 100).toFixed(0)}%)`,
      ``,
      `Before training:`,
      `  Avg log-prob: ${comparison.beforeAggregate.avgLogProb.toFixed(4)}`,
      `  Avg perplexity: ${comparison.beforeAggregate.avgPerplexity.toFixed(2)}`,
      `  EOS rate: ${comparison.beforeAggregate.eosCount}/${comparison.beforeAggregate.promptCount}`,
      ``,
      `After training:`,
      `  Avg log-prob: ${comparison.afterAggregate.avgLogProb.toFixed(4)}`,
      `  Avg perplexity: ${comparison.afterAggregate.avgPerplexity.toFixed(2)}`,
      `  EOS rate: ${comparison.afterAggregate.eosCount}/${comparison.afterAggregate.promptCount}`,
      ``,
      `Delta:`,
      `  Log-prob Δ: ${comparison.avgLogProbDelta >= 0 ? "+" : ""}${comparison.avgLogProbDelta.toFixed(4)}`,
      `  Perplexity Δ: ${comparison.avgPerplexityDelta >= 0 ? "+" : ""}${comparison.avgPerplexityDelta.toFixed(2)}`,
      ``,
      `Per-prompt details:`,
    ];

    for (const c of comparison.comparisons) {
      const status = c.changed ? "✓" : "✗";
      lines.push(
        `  ${status} "${c.prompt}" | ` +
          `logProb Δ: ${c.logProbDelta >= 0 ? "+" : ""}${c.logProbDelta.toFixed(3)} | ` +
          `ppl Δ: ${c.perplexityDelta >= 0 ? "+" : ""}${c.perplexityDelta.toFixed(1)}`
      );
      if (c.changed) {
        lines.push(
          `    Before: "${c.beforeText.substring(0, 60)}..."`
        );
        lines.push(
          `    After:  "${c.afterText.substring(0, 60)}..."`
        );
      }
    }

    lines.push(`${"=".repeat(60)}`);
    return lines.join("\n");
  }

  // ============================================================
  // Static Helpers
  // ============================================================

  /**
   * Compute aggregate metrics from generation results.
   */
  static computeAggregate(
    results: GenerationEvalResult[]
  ): GenerationBenchmarkAggregate {
    const promptCount = results.length;

    if (promptCount === 0) {
      return {
        promptCount: 0,
        avgTokenCount: 0,
        avgLogProb: 0,
        avgPerplexity: 0,
        eosCount: 0,
        maxTokensCount: 0,
      };
    }

    const totalTokens = results.reduce(
      (sum, r) => sum + r.tokenCount,
      0
    );
    const totalLogProb = results.reduce(
      (sum, r) => sum + r.avgLogProb,
      0
    );
    const totalPerplexity = results.reduce(
      (sum, r) => sum + r.perplexity,
      0
    );
    const eosCount = results.filter(
      (r) => r.stopReason === "eos"
    ).length;
    const maxTokensCount = results.filter(
      (r) => r.stopReason === "maxTokens"
    ).length;

    return {
      promptCount,
      avgTokenCount: totalTokens / promptCount,
      avgLogProb: totalLogProb / promptCount,
      avgPerplexity: totalPerplexity / promptCount,
      eosCount,
      maxTokensCount,
    };
  }
}
