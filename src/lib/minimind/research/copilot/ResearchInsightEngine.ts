// ============================================================
// MiniMind — research/copilot/ResearchInsightEngine.ts
// ============================================================
// Phase 59: Deterministic research insight engine.
//
// Analyzes a completed or running training run and produces
// typed, evidence-backed insights across 8 dimensions:
//
//   convergence   — is the loss converging?
//   divergence    — is the loss diverging?
//   stability     — is training numerically stable?
//   overfitting   — is there evidence of overfitting?
//   optimization  — is the optimizer behaving well?
//   efficiency    — is training throughput reasonable?
//   generalization— is the model likely to generalize?
//   reproducibility— can results be reproduced?
//
// Every insight contains numerical evidence derived from the
// real data. No fake metrics, no LLM-generated conclusions.
//
// Design principles:
//   - Pure functions — no side effects, no state
//   - Orchestrates existing TrainingAnalyzer primitives
//   - All insights backed by concrete numerical evidence
//   - Browser-safe — no Node.js dependencies
// ============================================================

import {
  analyzeTrainingRun,
  detectConvergence,
  detectDivergence,
  detectUnstableLoss,
  detectOverfitting,
  computeStabilityScore,
  computeTrainingEfficiency,
} from "../../training/observatory/TrainingAnalyzer";

import type {
  TrainingRunRecord,
  LossHistoryPoint,
} from "../../training/observatory/TrainingRunRecord";

// ============================================================
// Insight Types
// ============================================================

/**
 * Severity level for a research insight.
 */
export type InsightSeverity = "info" | "success" | "warning" | "critical";

/**
 * Insight category (analysis dimension).
 */
export type InsightType =
  | "convergence"
  | "divergence"
  | "stability"
  | "overfitting"
  | "optimization"
  | "efficiency"
  | "generalization"
  | "reproducibility";

/**
 * A single research insight with numerical evidence.
 */
export interface ResearchInsight {
  /** The analysis dimension */
  type: InsightType;
  /** How important/urgent this finding is */
  severity: InsightSeverity;
  /** One-line summary (≤ 80 chars recommended) */
  title: string;
  /** Human-readable explanation */
  description: string;
  /** Numerical evidence supporting this insight */
  evidence: Record<string, number>;
  /** Confidence score 0–1 (higher = more certain) */
  confidence: number;
}

/**
 * Complete set of insights from analyzing one training run.
 */
export interface ResearchInsights {
  /** The record ID these insights were derived from */
  recordId: string;
  /** Experiment name */
  experimentName: string;
  /** Unix timestamp (ms) when insights were computed */
  computedAt: number;
  /** Status at time of analysis */
  recordStatus: "running" | "completed" | "failed";
  /** All generated insights */
  insights: ResearchInsight[];
  /** Quick summary counts */
  summary: {
    total: number;
    critical: number;
    warning: number;
    success: number;
    info: number;
  };
}

// ============================================================
// Math helpers
// ============================================================

function mean(values: number[]): number {
  if (values.length === 0) return NaN;
  let sum = 0;
  for (let i = 0; i < values.length; i++) sum += values[i];
  return sum / values.length;
}

function stddev(values: number[], avg?: number): number {
  if (values.length < 2) return 0;
  const m = avg ?? mean(values);
  let sumSq = 0;
  for (let i = 0; i < values.length; i++) {
    const d = values[i] - m;
    sumSq += d * d;
  }
  return Math.sqrt(sumSq / (values.length - 1));
}

function linearSlope(xs: number[], ys: number[]): number {
  if (xs.length < 2) return 0;
  const n = xs.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += xs[i];
    sumY += ys[i];
    sumXY += xs[i] * ys[i];
    sumX2 += xs[i] * xs[i];
  }
  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return 0;
  return (n * sumXY - sumX * sumY) / denom;
}

// ============================================================
// Individual Detectors
// ============================================================

/**
 * Detect underfitting: loss remains high and isn't decreasing
 * meaningfully. Training may need more steps or higher LR.
 */
function detectUnderfitting(
  lossHistory: LossHistoryPoint[],
  initialLoss: number,
  finalLoss: number
): ResearchInsight | null {
  if (lossHistory.length < 4) return null;

  const losses = lossHistory.map((p) => p.loss);
  const n = losses.length;

  // Check last 25% for a plateau at a high level
  const lateStart = Math.floor(n * 0.75);
  const lateLosses = losses.slice(lateStart);
  const lateMean = mean(lateLosses);

  // Loss reduction in the second half
  const halfIdx = Math.floor(n / 2);
  const secondHalfLosses = losses.slice(halfIdx);
  const secondHalfSlope = linearSlope(
    secondHalfLosses.map((_, i) => i),
    secondHalfLosses
  );

  const lossReduction = initialLoss - finalLoss;
  const lossReductionPercent =
    initialLoss > 0 ? (lossReduction / initialLoss) * 100 : 0;

  // Underfitting: loss reduction < 5% AND late mean > 1.0 (still poor)
  // AND slope in second half is effectively flat
  const isUnderfitting =
    lossReductionPercent < 5 && lateMean > 1.0 && secondHalfSlope > -0.0001;

  if (!isUnderfitting) return null;

  return {
    type: "convergence",
    severity: "warning",
    title: "Training may be underfitting",
    description:
      "The loss has barely decreased and remains high, suggesting the model is not learning effectively. Consider increasing learning rate or training for more steps.",
    evidence: {
      initialLoss,
      finalLoss,
      lossReductionPercent: Math.round(lossReductionPercent * 100) / 100,
      latePhaseMeanLoss: Math.round(lateMean * 10000) / 10000,
      secondHalfSlope: Math.round(secondHalfSlope * 1000000) / 1000000,
    },
    confidence: Math.min(0.85, 0.5 + (1 - lossReductionPercent / 100)),
  };
}

/**
 * Detect overfitting: train loss decreases but eval gap grows
 * or train loss drops suspiciously fast.
 */
function detectOverfittingIssue(
  lossHistory: LossHistoryPoint[],
  record: TrainingRunRecord,
  stabilityScore: number
): ResearchInsight | null {
  const overfittingResult = detectOverfitting(lossHistory);

  if (!overfittingResult.overfitting) return null;

  const losses = lossHistory.map((p) => p.loss);
  const n = losses.length;
  const firstHalfLosses = losses.slice(0, Math.floor(n / 2));
  const secondHalfLosses = losses.slice(Math.floor(n / 2));
  const firstHalfMean = mean(firstHalfLosses);
  const secondHalfMean = mean(secondHalfLosses);
  const reduction = firstHalfMean - secondHalfMean;

  return {
    type: "overfitting",
    severity: "critical",
    title: "Overfitting detected",
    description:
      "The evaluation loss is increasing while training loss decreases, indicating the model is memorizing training data rather than learning generalizable patterns. Consider reducing training duration, increasing regularization, or using a smaller model.",
    evidence: {
      trainLossTrend: Math.round(overfittingResult.trainLossTrend * 1000000) / 1000000,
      evalLossTrend: overfittingResult.evalLossTrend !== null
        ? Math.round(overfittingResult.evalLossTrend * 1000000) / 1000000
        : 0,
      trainEvalGap: overfittingResult.trainEvalGap !== null
        ? Math.round(overfittingResult.trainEvalGap * 10000) / 10000
        : 0,
      lossReductionFirstVsSecondHalf: Math.round(reduction * 10000) / 10000,
      stabilityScore: Math.round(stabilityScore * 100) / 100,
    },
    confidence: Math.min(
      0.92,
      0.6 + Math.abs(overfittingResult.trainEvalGap ?? 0) / 5
    ),
  };
}

/**
 * Detect divergence: loss increases significantly.
 */
function detectDivergenceIssue(
  lossHistory: LossHistoryPoint[],
  initialLoss: number
): ResearchInsight | null {
  const divergenceResult = detectDivergence(lossHistory);

  if (!divergenceResult.diverged) return null;

  return {
    type: "divergence",
    severity: "critical",
    title: "Training is diverging",
    description:
      `The final loss (${divergenceResult.divergenceRatio.toFixed(2)}× initial) is significantly higher than the initial loss, indicating the model parameters are destabilizing. Reduce learning rate, enable gradient clipping, or check for data issues.`,
    evidence: {
      initialLoss,
      divergenceRatio: Math.round(divergenceResult.divergenceRatio * 10000) / 10000,
      divergenceStep: divergenceResult.divergenceStep,
    },
    confidence: Math.min(
      0.95,
      0.6 + (divergenceResult.divergenceRatio - 1) * 0.3
    ),
  };
}

/**
 * Detect loss spikes: sudden large increases in loss.
 */
function detectLossSpikeIssue(
  lossHistory: LossHistoryPoint[]
): ResearchInsight | null {
  const unstableResult = detectUnstableLoss(lossHistory);

  if (unstableResult.spikeCount === 0) return null;

  const severity: InsightSeverity =
    unstableResult.spikeCount >= 5 ? "critical" : "warning";

  return {
    type: "stability",
    severity,
    title:
      unstableResult.spikeCount === 1
        ? "Loss spike detected"
        : `${unstableResult.spikeCount} loss spikes detected`,
    description:
      "Sudden spikes in the loss curve suggest numerical instability. This can be caused by a learning rate that is too high, poor weight initialization, or problematic data batches. Consider reducing the learning rate or increasing gradient clipping.",
    evidence: {
      spikeCount: unstableResult.spikeCount,
      coefficientOfVariation: Math.round(unstableResult.coefficientOfVariation * 10000) / 10000,
      spikeSteps: unstableResult.spikeSteps.join(",") as unknown as number,
    },
    confidence: Math.min(0.9, 0.5 + unstableResult.spikeCount * 0.1),
  };
}

/**
 * Detect learning rate issues:
 * - Too high: loss unstable, frequent spikes
 * - Too low: loss decreases very slowly
 * - Decays too quickly: LR drops near zero early
 */
function detectLearningRateIssue(
  lossHistory: LossHistoryPoint[],
  learningRateHistory: Array<{ step: number; learningRate: number }>,
  initialLoss: number,
  finalLoss: number
): ResearchInsight | null {
  if (lossHistory.length < 4) return null;

  const losses = lossHistory.map((p) => p.loss);
  const n = losses.length;

  // Check if LR decays too fast
  if (learningRateHistory.length >= 4) {
    const lrs = learningRateHistory.map((p) => p.learningRate);
    const lrN = lrs.length;
    const firstQuarterMean = mean(lrs.slice(0, Math.floor(lrN * 0.25)));
    const lastQuarterMean = mean(lrs.slice(Math.floor(lrN * 0.75)));

    if (firstQuarterMean > 0 && lastQuarterMean / firstQuarterMean < 0.1) {
      const lossReduction = initialLoss - finalLoss;
      const lossReductionPercent =
        initialLoss > 0 ? (lossReduction / initialLoss) * 100 : 0;

      // Only flag if loss hasn't converged AND LR is near zero
      if (lossReductionPercent < 80) {
        return {
          type: "optimization",
          severity: "warning",
          title: "Learning rate decays too quickly",
          description:
            "The learning rate decays to near-zero early in training, which may prevent further loss reduction. Consider extending scheduler warmup or increasing the minimum learning rate.",
          evidence: {
            initialLR: Math.round(firstQuarterMean * 1000000) / 1000000,
            finalLR: Math.round(lastQuarterMean * 1000000) / 1000000,
            lrDecayRatio: Math.round((lastQuarterMean / firstQuarterMean) * 10000) / 10000,
            lossReductionPercent: Math.round(lossReductionPercent * 100) / 100,
          },
          confidence: Math.min(0.88, 0.5 + (1 - lastQuarterMean / firstQuarterMean)),
        };
      }
    }
  }

  // Check if loss decreases too slowly (potential LR too low)
  const lossReduction = initialLoss - finalLoss;
  const lossReductionPercent =
    initialLoss > 0 ? (lossReduction / initialLoss) * 100 : 0;

  const halfIdx = Math.floor(n / 2);
  const secondHalfLosses = losses.slice(halfIdx);
  const secondHalfSlope = linearSlope(
    secondHalfLosses.map((_, i) => i),
    secondHalfLosses
  );

  if (
    lossReductionPercent < 15 &&
    n > 20 &&
    secondHalfSlope > -0.001 &&
    finalLoss > 1.0
  ) {
    return {
      type: "optimization",
      severity: "warning",
      title: "Loss decreases very slowly",
      description:
        "The loss is decreasing extremely slowly, suggesting the learning rate may be too low. Consider increasing the learning rate or using a warmup schedule.",
      evidence: {
        initialLoss: Math.round(initialLoss * 10000) / 10000,
        finalLoss: Math.round(finalLoss * 10000) / 10000,
        lossReductionPercent: Math.round(lossReductionPercent * 100) / 100,
        secondHalfSlope: Math.round(secondHalfSlope * 1000000) / 1000000,
        totalSteps: n,
      },
      confidence: 0.7,
    };
  }

  return null;
}

/**
 * Detect gradient explosion: gradient norms that are excessively high.
 */
function detectGradientExplosion(
  record: TrainingRunRecord
): ResearchInsight | null {
  // Check throughputHistory for gradient norm data — we look at
  // the loss history for indicators of gradient explosion (spikes)
  const unstableResult = detectUnstableLoss(record.lossHistory);

  // Multiple large spikes + diverging trend = potential gradient explosion
  if (
    unstableResult.spikeCount >= 3 &&
    unstableResult.coefficientOfVariation > 2.0
  ) {
    return {
      type: "optimization",
      severity: "critical",
      title: "Possible gradient explosion",
      description:
        "Multiple large loss spikes with high variance suggest gradients are exploding. Enable or tighten gradient clipping, reduce the learning rate, or check weight initialization.",
      evidence: {
        spikeCount: unstableResult.spikeCount,
        coefficientOfVariation: Math.round(unstableResult.coefficientOfVariation * 10000) / 10000,
        finalToInitialLossRatio:
          record.initialLoss > 0
            ? Math.round((record.finalLoss / record.initialLoss) * 10000) / 10000
            : 1,
      },
      confidence: Math.min(
        0.85,
        0.4 + unstableResult.spikeCount * 0.1 + unstableResult.coefficientOfVariation * 0.05
      ),
    };
  }

  return null;
}

/**
 * Detect low throughput: tokens/sec is significantly below
 * reasonable expectations for the model size.
 */
function detectLowThroughput(
  record: TrainingRunRecord,
  averageThroughput: number
): ResearchInsight | null {
  if (record.status !== "completed" && record.status !== "running") return null;
  if (averageThroughput <= 0) return null;

  // Heuristic: < 100 tokens/sec is low for a tiny model
  // < 1000 tokens/sec might be low for larger models
  const modelParams = record.modelConfig.estimatedParams ?? 0;
  let threshold: number;
  if (modelParams < 1_000_000) threshold = 100;
  else if (modelParams < 15_000_000) threshold = 500;
  else threshold = 1000;

  if (averageThroughput >= threshold) return null;

  const severity: InsightSeverity =
    averageThroughput < threshold / 2 ? "warning" : "info";

  return {
    type: "efficiency",
    severity,
    title: "Training throughput is low",
    description:
      `At ${averageThroughput.toFixed(1)} tokens/sec, training throughput is below the expected range for a model with ~${modelParams.toLocaleString()} parameters. Consider reducing sequence length or batch size, or check for CPU bottlenecks.`,
    evidence: {
      averageThroughput: Math.round(averageThroughput * 100) / 100,
      threshold,
      estimatedParams: modelParams,
      batchSize: record.trainingConfig.dataset?.batchSize ?? 0,
      blockSize: record.trainingConfig.dataset?.blockSize ?? 0,
    },
    confidence: 0.78,
  };
}

/**
 * Detect training instability: high variance in loss.
 */
function detectTrainingInstability(
  lossHistory: LossHistoryPoint[],
  stabilityScore: number
): ResearchInsight | null {
  const unstableResult = detectUnstableLoss(lossHistory);

  if (unstableResult.unstable) {
    return {
      type: "stability",
      severity: "warning",
      title: "Training is unstable",
      description:
        `The loss curve shows high variance (coefficient of variation: ${unstableResult.coefficientOfVariation.toFixed(2)}), indicating unstable training. This may be caused by a learning rate that is too high, small batch size, or noisy gradient estimates.`,
      evidence: {
        coefficientOfVariation: Math.round(unstableResult.coefficientOfVariation * 10000) / 10000,
        spikeCount: unstableResult.spikeCount,
        stabilityScore: Math.round(stabilityScore * 100) / 100,
      },
      confidence: Math.min(
        0.9,
        0.5 + unstableResult.coefficientOfVariation * 0.1
      ),
    };
  }

  return null;
}

/**
 * Detect insufficient training: loss is still decreasing
 * meaningfully, suggesting more epochs would help.
 */
function detectInsufficientTraining(
  lossHistory: LossHistoryPoint[],
  convergenceResult: ReturnType<typeof detectConvergence>,
  lossReductionPercent: number
): ResearchInsight | null {
  if (lossHistory.length < 8) return null;

  const losses = lossHistory.map((p) => p.loss);
  const n = losses.length;

  // Check last 10% slope
  const lateStart = Math.floor(n * 0.9);
  const lateLosses = losses.slice(lateStart);
  const lateSteps = lateLosses.map((_, i) => i);
  const lateSlope = linearSlope(lateSteps, lateLosses);

  // If loss is still decreasing (>2% per equivalent step) and not yet converged
  const lateMean = mean(lateLosses);
  const relativeSlope = lateMean > 0 ? Math.abs(lateSlope) / lateMean : 0;

  if (
    !convergenceResult.converged &&
    lateSlope < -0.0005 &&
    relativeSlope > 0.002 &&
    lossReductionPercent < 95
  ) {
    return {
      type: "convergence",
      severity: "info",
      title: "Training may benefit from more steps",
      description:
        "The loss is still decreasing meaningfully and hasn't plateaued. Increasing the number of training steps or epochs could yield better results.",
      evidence: {
        lossReductionPercent: Math.round(lossReductionPercent * 100) / 100,
        latePhaseSlope: Math.round(lateSlope * 1000000) / 1000000,
        relativeDecreaseRate: Math.round(relativeSlope * 10000) / 10000,
        convergenceStep: convergenceResult.convergenceStep,
      },
      confidence: Math.min(0.85, 0.4 + relativeSlope * 50),
    };
  }

  return null;
}

// ============================================================
// Convergence & Generalization Insights
// ============================================================

/**
 * Generate convergence insight: training is converging well.
 */
function buildConvergenceInsight(
  analysis: ReturnType<typeof analyzeTrainingRun>
): ResearchInsight {
  const { convergence, lossReductionPercent, initialLoss, finalLoss, bestLoss } =
    analysis;

  if (convergence.converged) {
    return {
      type: "convergence",
      severity: "success",
      title: "Training is converging",
      description:
        `Loss decreased from ${initialLoss.toFixed(2)} to ${finalLoss.toFixed(2)} (${lossReductionPercent.toFixed(1)}% reduction), and training has reached a stable plateau.`,
      evidence: {
        initialLoss: Math.round(initialLoss * 10000) / 10000,
        finalLoss: Math.round(finalLoss * 10000) / 10000,
        bestLoss: Math.round(bestLoss * 10000) / 10000,
        reductionPercent: Math.round(lossReductionPercent * 100) / 100,
        convergenceStep: convergence.convergenceStep,
        plateauFraction: Math.round(convergence.plateauFraction * 100) / 100,
      },
      confidence: Math.min(0.94, 0.6 + lossReductionPercent / 200),
    };
  }

  if (lossReductionPercent > 30) {
    return {
      type: "convergence",
      severity: "info",
      title: "Training is progressing but not yet converged",
      description:
        `Loss decreased ${lossReductionPercent.toFixed(1)}% but training hasn't reached a stable plateau. More steps may improve results further.`,
      evidence: {
        initialLoss: Math.round(initialLoss * 10000) / 10000,
        finalLoss: Math.round(finalLoss * 10000) / 10000,
        reductionPercent: Math.round(lossReductionPercent * 100) / 100,
        convergenceRate: Math.round(analysis.convergenceRate * 1000000) / 1000000,
      },
      confidence: 0.75,
    };
  }

  return {
    type: "convergence",
    severity: "info",
    title: "Training progress is limited",
    description:
      `Loss decreased only ${lossReductionPercent.toFixed(1)}%. Consider adjusting hyperparameters or increasing training duration.`,
    evidence: {
      initialLoss: Math.round(initialLoss * 10000) / 10000,
      finalLoss: Math.round(finalLoss * 10000) / 10000,
      reductionPercent: Math.round(lossReductionPercent * 100) / 100,
    },
    confidence: 0.65,
  };
}

/**
 * Build generalization insight based on overfitting analysis.
 */
function buildGeneralizationInsight(
  lossHistory: LossHistoryPoint[],
  stabilityScore: number
): ResearchInsight | null {
  const overfittingResult = detectOverfitting(lossHistory);

  if (overfittingResult.overfitting) {
    return null; // Handled by detectOverfittingIssue
  }

  // If training is stable and loss is decreasing, generalization looks good
  if (
    stabilityScore > 0.7 &&
    overfittingResult.trainLossTrend < -0.001
  ) {
    return {
      type: "generalization",
      severity: "success",
      title: "Training patterns suggest good generalization",
      description:
        "The loss curve is stable and decreasing smoothly, with no evidence of overfitting. This typically indicates the model is learning generalizable patterns.",
      evidence: {
        stabilityScore: Math.round(stabilityScore * 100) / 100,
        trainLossTrend: Math.round(overfittingResult.trainLossTrend * 1000000) / 1000000,
        trainEvalGap: overfittingResult.trainEvalGap !== null
          ? Math.round(overfittingResult.trainEvalGap * 10000) / 10000
          : 0,
      },
      confidence: overfittingResult.evalLossTrend !== null ? 0.8 : 0.55,
    };
  }

  return null;
}

/**
 * Build optimization insight based on stability and efficiency.
 */
function buildOptimizationInsight(
  analysis: ReturnType<typeof analyzeTrainingRun>,
  gradientClipNorm: number | undefined
): ResearchInsight {
  const { stabilityScore, trainingEfficiency } = analysis;

  const clipNorm = gradientClipNorm ?? 0;

  if (stabilityScore > 0.8 && trainingEfficiency > 0.1) {
    return {
      type: "optimization",
      severity: "success",
      title: "Optimizer is working effectively",
      description:
        `Training is stable (score: ${(stabilityScore * 100).toFixed(0)}%) and efficient. The optimizer configuration appears well-tuned for this model and dataset.`,
      evidence: {
        stabilityScore: Math.round(stabilityScore * 100) / 100,
        trainingEfficiency: Math.round(trainingEfficiency * 10000) / 10000,
        gradientClipNorm: clipNorm,
        convergenceRate: Math.round(analysis.convergenceRate * 1000000) / 1000000,
      },
      confidence: 0.82,
    };
  }

  return {
    type: "optimization",
    severity: "info",
    title: "Optimization may benefit from tuning",
    description:
      `Stability score (${(stabilityScore * 100).toFixed(0)}%) and training efficiency (${trainingEfficiency.toFixed(4)}) suggest there's room for hyperparameter improvement.`,
    evidence: {
      stabilityScore: Math.round(stabilityScore * 100) / 100,
      trainingEfficiency: Math.round(trainingEfficiency * 10000) / 10000,
      gradientClipNorm: clipNorm,
    },
    confidence: 0.6,
  };
}

/**
 * Build reproducibility insight.
 */
function buildReproducibilityInsight(record: TrainingRunRecord): ResearchInsight {
  return {
    type: "reproducibility",
    severity: "info",
    title: "Reproducibility information",
    description:
      `This run used seed=${record.trainingConfig.seed ?? "unspecified"}. To reproduce these results, use the same model config, training recipe, dataset, and seed.`,
    evidence: {
      seed: record.trainingConfig.seed ?? 0,
      blockSize: record.trainingConfig.dataset?.blockSize ?? 0,
      batchSize: record.trainingConfig.dataset?.batchSize ?? 0,
      totalSteps: record.totalSteps,
      totalEpochs: record.totalEpochs,
    },
    confidence: 0.9,
  };
}

// ============================================================
// Main Engine
// ============================================================

/**
 * ResearchInsightEngine — deterministic training run analysis.
 *
 * Usage:
 *   const engine = new ResearchInsightEngine();
 *   const insights = engine.analyze(trainingRunRecord);
 *   console.log(insights.summary.critical, "critical issues");
 */
export class ResearchInsightEngine {
  /**
   * Analyze a training run record and generate all insights.
   *
   * @param record — a complete or in-progress TrainingRunRecord
   * @returns ResearchInsights with all detected findings
   */
  analyze(record: TrainingRunRecord): ResearchInsights {
    const { lossHistory, learningRateHistory, initialLoss, finalLoss } = record;

    // ── Run existing analyzer for core metrics ──
    const analysis = analyzeTrainingRun(record);

    const insights: ResearchInsight[] = [];

    // ── Convergence ──
    const convergenceInsight = buildConvergenceInsight(analysis);
    insights.push(convergenceInsight);

    // ── Underfitting check ──
    const underfittingInsight = detectUnderfitting(
      lossHistory,
      initialLoss,
      finalLoss
    );
    if (underfittingInsight) insights.push(underfittingInsight);

    // ── Divergence ──
    const divergenceInsight = detectDivergenceIssue(lossHistory, initialLoss);
    if (divergenceInsight) insights.push(divergenceInsight);

    // ── Loss spikes ──
    const spikeInsight = detectLossSpikeIssue(lossHistory);
    if (spikeInsight) insights.push(spikeInsight);

    // ── Overfitting ──
    const overfittingInsight = detectOverfittingIssue(
      lossHistory,
      record,
      analysis.stabilityScore
    );
    if (overfittingInsight) insights.push(overfittingInsight);

    // ── Learning rate issues ──
    const lrInsight = detectLearningRateIssue(
      lossHistory,
      learningRateHistory,
      initialLoss,
      finalLoss
    );
    if (lrInsight) insights.push(lrInsight);

    // ── Gradient explosion ──
    const gradExplosionInsight = detectGradientExplosion(record);
    if (gradExplosionInsight) insights.push(gradExplosionInsight);

    // ── Low throughput ──
    const throughputInsight = detectLowThroughput(record, analysis.averageThroughput);
    if (throughputInsight) insights.push(throughputInsight);

    // ── Training instability ──
    const instabilityInsight = detectTrainingInstability(
      lossHistory,
      analysis.stabilityScore
    );
    if (instabilityInsight) insights.push(instabilityInsight);

    // ── Insufficient training ──
    const insufficientInsight = detectInsufficientTraining(
      lossHistory,
      analysis.convergence,
      analysis.lossReductionPercent
    );
    if (insufficientInsight) insights.push(insufficientInsight);

    // ── Generalization ──
    const generalizationInsight = buildGeneralizationInsight(
      lossHistory,
      analysis.stabilityScore
    );
    if (generalizationInsight) insights.push(generalizationInsight);

    // ── Optimization ──
    const optInsight = buildOptimizationInsight(
      analysis,
      record.trainingConfig.gradientClipNorm
    );
    insights.push(optInsight);

    // ── Reproducibility ──
    const reproInsight = buildReproducibilityInsight(record);
    insights.push(reproInsight);

    // ── Compute summary counts ──
    const critical = insights.filter((i) => i.severity === "critical").length;
    const warning = insights.filter((i) => i.severity === "warning").length;
    const success = insights.filter((i) => i.severity === "success").length;
    const info = insights.filter((i) => i.severity === "info").length;

    return {
      recordId: record.id,
      experimentName: record.experimentName,
      computedAt: Date.now(),
      recordStatus: record.status,
      insights,
      summary: {
        total: insights.length,
        critical,
        warning,
        success,
        info,
      },
    };
  }

  /**
   * Get only critical and warning insights.
   */
  getCriticalFindings(insights: ResearchInsights): ResearchInsight[] {
    return insights.insights.filter(
      (i) => i.severity === "critical" || i.severity === "warning"
    );
  }

  /**
   * Get only success insights.
   */
  getSuccessFindings(insights: ResearchInsights): ResearchInsight[] {
    return insights.insights.filter((i) => i.severity === "success");
  }
}
