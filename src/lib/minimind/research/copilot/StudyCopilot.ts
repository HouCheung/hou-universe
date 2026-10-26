// ============================================================
// MiniMind — research/copilot/StudyCopilot.ts
// ============================================================
// Phase 63: Study-aware copilot for reproducible research.
//
// Wraps BenchmarkCopilot.compareResults() to produce study-
// specific insights with the research question and hypothesis
// in scope.
//
// Design:
//   - Thin wrapper over BenchmarkCopilot
//   - Adds study context to copilot output
//   - Determines whether the hypothesis is supported based on
//     the copilot's objective metric comparison
//   - Browser-safe, no fs/path
// ============================================================

import { BenchmarkCopilot } from "./BenchmarkCopilot";
import type { ResearchBenchmarkResult } from "../benchmark/ResearchBenchmarkRunner";
import type { ResearchStudy, StudyConclusion } from "../ResearchStudy";
import {
  computeMetricSummary,
  compareMetricSummaries,
} from "../ResearchStudy";

// ============================================================
// Types
// ============================================================

/**
 * Result of comparing study experiments via the copilot.
 */
export interface StudyCopilotResult {
  /** The study definition */
  study: ResearchStudy;

  /** Raw copilot comparison between baseline and variant */
  copilotComparison: ReturnType<BenchmarkCopilot["compareResults"]>;

  /** Per-metric comparisons for gradient-related metrics */
  gradientComparisons: Record<
    string,
    ReturnType<typeof compareMetricSummaries>
  >;

  /** Stability verdict: whether the variant improved stability */
  stabilityVerdict: {
    maxNormReduced: boolean;
    maxNormChangePercent: number;
    varianceReduced: boolean;
    varianceChangePercent: number;
    divergencesAvoided: number;
    instabilitiesAvoided: number;
  };

  /** Convergence verdict: whether loss was not materially harmed */
  convergenceVerdict: {
    lossChangePercent: number;
    lossWorsenedSignificantly: boolean;
    lossChangeMeaningful: boolean;
  };

  /** Overall conclusion */
  conclusion: StudyConclusion;

  /** Human-readable summary */
  summary: string;
}

// ============================================================
// StudyCopilot
// ============================================================

/**
 * StudyCopilot — produces study-aware analysis from
 * completed benchmark results.
 *
 * Usage:
 *   const copilot = new StudyCopilot();
 *   const result = copilot.analyzeStudy(
 *     gradientClippingStudy,
 *     baselineResult,
 *     clippedResult,
 *   );
 *   console.log(result.conclusion.verdict);
 */
export class StudyCopilot {
  private benchmarkCopilot: BenchmarkCopilot;

  constructor() {
    this.benchmarkCopilot = new BenchmarkCopilot();
  }

  /**
   * Analyze a completed study by comparing baseline and variant
   * benchmark results through the copilot, then evaluating the
   * study's hypothesis.
   *
   * @param study — the study definition
   * @param baselineResult — the baseline benchmark result
   * @param variantResult — the primary variant benchmark result
   * @returns study-aware copilot analysis
   */
  analyzeStudy(
    study: ResearchStudy,
    baselineResult: ResearchBenchmarkResult,
    variantResult: ResearchBenchmarkResult,
  ): StudyCopilotResult {
    // Raw copilot comparison
    const copilotComparison = this.benchmarkCopilot.compareResults(
      baselineResult,
      variantResult,
      "Baseline",
      "Variant",
    );

    const blRuns = baselineResult.runs;
    const vaRuns = variantResult.runs;

    // ── Gradient comparisons ──
    const gradientComparisons: Record<
      string,
      ReturnType<typeof compareMetricSummaries>
    > = {};

    const gradientMetrics = [
      "meanGradientNorm",
      "maxGradientNorm",
      "gradientNormVariance",
    ] as const;

    for (const metric of gradientMetrics) {
      const bl = computeMetricSummary(
        metric,
        blRuns.map((r) => r[metric] as number),
      );
      const va = computeMetricSummary(
        metric,
        vaRuns.map((r) => r[metric] as number),
      );
      gradientComparisons[metric] = compareMetricSummaries(metric, bl, va);
    }

    // ── Stability verdict ──
    const maxNormComp = gradientComparisons["maxGradientNorm"]!;
    const varComp = gradientComparisons["gradientNormVariance"]!;
    const baselineDiv = blRuns.filter((r) => r.divergenceDetected).length;
    const variantDiv = vaRuns.filter((r) => r.divergenceDetected).length;
    const baselineIns = blRuns.filter((r) => r.instabilityDetected).length;
    const variantIns = vaRuns.filter((r) => r.instabilityDetected).length;

    const stabilityVerdict = {
      maxNormReduced:
        maxNormComp.direction === "decreased" && maxNormComp.isMeaningful,
      maxNormChangePercent: maxNormComp.relativeChange * 100,
      varianceReduced:
        varComp.direction === "decreased" && varComp.isMeaningful,
      varianceChangePercent: varComp.relativeChange * 100,
      divergencesAvoided: baselineDiv - variantDiv,
      instabilitiesAvoided: baselineIns - variantIns,
    };

    // ── Convergence verdict ──
    // copilotComparison.lossImprovement = (baseline - variant) / variant
    // Positive → baseline higher loss → variant is BETTER
    // Negative → variant higher loss → variant is WORSE
    const lossChangePercent = copilotComparison.lossImprovement * 100;
    const convergenceVerdict = {
      lossChangePercent,
      // Variant loss worsened: lossImprovement is negative by > 5%
      lossWorsenedSignificantly: lossChangePercent < -5,
      lossChangeMeaningful: Math.abs(lossChangePercent) > 1,
    };

    // ── Conclusion ──
    const hypothesisSupported =
      stabilityVerdict.maxNormReduced &&
      !convergenceVerdict.lossWorsenedSignificantly;

    const hypothesisRejected =
      convergenceVerdict.lossWorsenedSignificantly;

    let conclusion: StudyConclusion;

    if (hypothesisSupported) {
      conclusion = {
        verdict: "supported",
        summary:
          `Gradient clipping reduced max gradient norm by ` +
          `${Math.abs(stabilityVerdict.maxNormChangePercent).toFixed(1)}% ` +
          `without materially damaging convergence (loss ` +
          `${convergenceVerdict.lossChangePercent < 0 ? "improved" : "changed"} ` +
          `by ${Math.abs(convergenceVerdict.lossChangePercent).toFixed(1)}%). ` +
          `The hypothesis is SUPPORTED.`,
        detail:
          `Clipping effectively bounded gradient norms. ` +
          `${stabilityVerdict.divergencesAvoided > 0 ? `${stabilityVerdict.divergencesAvoided} divergence(s) avoided. ` : ""}` +
          `Loss change of ${convergenceVerdict.lossChangePercent.toFixed(1)}% ` +
          `is ${convergenceVerdict.lossChangeMeaningful ? "meaningful" : "within noise level"}.`,
        evidence: {
          lossImprovement: copilotComparison.lossImprovement,
          throughputChange: copilotComparison.throughputChange,
          maxNormChangePercent: stabilityVerdict.maxNormChangePercent,
          varianceChangePercent: stabilityVerdict.varianceChangePercent,
          baselineDivergences: baselineDiv,
          variantDivergences: variantDiv,
          baselineInstabilities: baselineIns,
          variantInstabilities: variantIns,
        },
        confidence: 0.85,
      };
    } else if (hypothesisRejected) {
      conclusion = {
        verdict: "rejected",
        summary:
          `Gradient clipping degraded convergence — loss worsened by ` +
          `${Math.abs(convergenceVerdict.lossChangePercent).toFixed(1)}%. ` +
          `The hypothesis is REJECTED.`,
        detail:
          `While clipping reduced gradient norms, it caused ` +
          `significant loss degradation.`,
        evidence: {
          lossImprovement: copilotComparison.lossImprovement,
          maxNormChangePercent: stabilityVerdict.maxNormChangePercent,
        },
        confidence: 0.9,
      };
    } else {
      conclusion = {
        verdict: "inconclusive",
        summary:
          `Results are inconclusive — gradient norms were reduced by ` +
          `${Math.abs(stabilityVerdict.maxNormChangePercent).toFixed(1)}% ` +
          `but convergence behavior is ambiguous.`,
        detail:
          `More runs or a larger model may be needed for statistical confidence.`,
        evidence: {
          lossImprovement: copilotComparison.lossImprovement,
          maxNormChangePercent: stabilityVerdict.maxNormChangePercent,
        },
        confidence: 0.3,
      };
    }

    // ── Summary ──
    const summaryParts: string[] = [];
    summaryParts.push(
      `Study: "${study.name}" — Verdict: ${conclusion.verdict.toUpperCase()}.`,
    );
    summaryParts.push(
      `Loss: ${convergenceVerdict.lossChangePercent > 0 ? "+" : ""}` +
        `${convergenceVerdict.lossChangePercent.toFixed(1)}%.`,
    );
    summaryParts.push(
      `Max Norm: ${stabilityVerdict.maxNormChangePercent > 0 ? "+" : ""}` +
        `${stabilityVerdict.maxNormChangePercent.toFixed(1)}%.`,
    );
    summaryParts.push(
      `Copilot recommendation: ${copilotComparison.recommendation}`,
    );

    return {
      study,
      copilotComparison,
      gradientComparisons,
      stabilityVerdict,
      convergenceVerdict,
      conclusion,
      summary: summaryParts.join(" "),
    };
  }
}
