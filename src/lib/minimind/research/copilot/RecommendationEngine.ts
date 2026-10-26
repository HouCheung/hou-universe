// ============================================================
// MiniMind — research/copilot/RecommendationEngine.ts
// ============================================================
// Phase 59: Deterministic recommendation engine.
//
// Maps ResearchInsights + config context → actionable
// recommendations. Every recommendation includes:
//
//   - category      (optimization, data, model, training, etc.)
//   - priority      (high, medium, low)
//   - title         (one-line summary)
//   - rationale     (why this recommendation)
//   - evidence      (numerical support)
//   - suggestedChanges (concrete actions)
//
// NO automatic config modification — recommendations are
// advisory only. The user decides whether to apply them.
//
// Design principles:
//   - Pure functions — no side effects
//   - Every recommendation has numerical evidence
//   - Deterministic — same input always gives same output
//   - No fake metrics, no LLM output
// ============================================================

import type { ResearchInsight, ResearchInsights } from "./ResearchInsightEngine";
import type { ModelConfigEntry } from "../../experiments/ModelRegistry";
import type { TrainingRecipe } from "../../experiments/TrainingRecipe";

// ============================================================
// Types
// ============================================================

/**
 * Recommendation category.
 */
export type RecommendationCategory =
  | "optimization"
  | "data"
  | "model"
  | "training"
  | "regularization"
  | "performance";

/**
 * Recommendation priority.
 */
export type RecommendationPriority = "high" | "medium" | "low";

/**
 * A single research recommendation.
 */
export interface ResearchRecommendation {
  /** Which area this recommendation targets */
  category: RecommendationCategory;
  /** How urgent/important this recommendation is */
  priority: RecommendationPriority;
  /** One-line summary (≤ 80 chars recommended) */
  title: string;
  /** Why this recommendation makes sense */
  rationale: string;
  /** Numerical evidence supporting the recommendation */
  evidence: Record<string, number>;
  /** Concrete suggested changes */
  suggestedChanges: string[];
}

/**
 * Complete set of recommendations for a training run.
 */
export interface RecommendationSet {
  /** Record ID these recommendations were derived from */
  recordId: string;
  /** Unix timestamp when computed */
  computedAt: number;
  /** All recommendations sorted by priority */
  recommendations: ResearchRecommendation[];
  /** Quick counts */
  summary: {
    total: number;
    high: number;
    medium: number;
    low: number;
  };
}

// ============================================================
// Individual Recommendation Generators
// ============================================================

/**
 * Recommend changes based on loss behavior.
 */
function recommendFromConvergence(
  insights: ResearchInsight[],
  trainingConfig: TrainingRecipe
): ResearchRecommendation[] {
  const recommendations: ResearchRecommendation[] = [];

  const convergenceInsight = insights.find((i) => i.type === "convergence");
  if (!convergenceInsight) return recommendations;

  const severity = convergenceInsight.severity;
  const evidence = convergenceInsight.evidence;

  // Loss decreasing slowly
  if (
    severity === "warning" &&
    evidence.lossReductionPercent !== undefined &&
    evidence.lossReductionPercent < 15
  ) {
    recommendations.push({
      category: "training",
      priority: "high",
      title: "Increase training epochs",
      rationale:
        `Loss decreased only ${evidence.lossReductionPercent.toFixed(1)}%, indicating the model needs more training steps to converge. Current recipe uses ${trainingConfig.epochs} epochs.`,
      evidence: {
        currentEpochs: trainingConfig.epochs,
        lossReductionPercent: evidence.lossReductionPercent,
        suggestedEpochs: Math.min(trainingConfig.epochs * 3, 100),
      },
      suggestedChanges: [
        `Increase epochs from ${trainingConfig.epochs} to ${Math.min(trainingConfig.epochs * 3, 100)}`,
        "Monitor loss curve for plateauing",
      ],
    });
  }

  // Training still improving
  if (severity === "info" && evidence.lossReductionPercent !== undefined) {
    const reduction = evidence.lossReductionPercent;
    if (reduction > 30 && reduction < 80 && evidence.convergenceStep === -1) {
      recommendations.push({
        category: "training",
        priority: "medium",
        title: "Continue training for more steps",
        rationale:
          `Loss reduced ${reduction.toFixed(1)}% but hasn't converged yet. Additional steps could improve results further.`,
        evidence: {
          lossReductionPercent: reduction,
          currentEpochs: trainingConfig.epochs,
          suggestedEpochs: Math.min(trainingConfig.epochs * 2, 100),
        },
        suggestedChanges: [
          `Increase epochs from ${trainingConfig.epochs} to ${Math.min(trainingConfig.epochs * 2, 100)}`,
          "Use checkpointing to resume from current best",
        ],
      });
    }
  }

  return recommendations;
}

/**
 * Recommend based on optimizer issues.
 */
function recommendFromOptimization(
  insights: ResearchInsight[],
  trainingConfig: TrainingRecipe
): ResearchRecommendation[] {
  const recommendations: ResearchRecommendation[] = [];

  const lrInsight = insights.find(
    (i) => i.type === "optimization" && i.title.includes("Learning rate decays")
  );
  const gradInsight = insights.find(
    (i) => i.type === "optimization" && i.title.includes("gradient explosion")
  );
  const slowInsight = insights.find(
    (i) => i.type === "optimization" && i.title.includes("slowly")
  );

  // LR decays too quickly
  if (lrInsight) {
    recommendations.push({
      category: "optimization",
      priority: "medium",
      title: "Extend scheduler warmup or increase minimum learning rate",
      rationale:
        "The learning rate decays to near-zero early in training, which may prevent the model from reaching optimal performance.",
      evidence: lrInsight.evidence,
      suggestedChanges: [
        "If using cosine scheduler: set minLRRatio to 0.1 (currently may decay to 0)",
        "If using linear scheduler: increase warmupSteps or switch to cosine",
        "Consider a constant LR phase before decay",
      ],
    });
  }

  // Gradient explosion
  if (gradInsight) {
    const currentClip = trainingConfig.gradientClipNorm ?? 0;
    recommendations.push({
      category: "optimization",
      priority: "high",
      title: "Enable or tighten gradient clipping",
      rationale:
        "Gradient norms frequently exceed stable thresholds, causing loss spikes. Gradient clipping prevents individual batches from destabilizing training.",
      evidence: {
        ...gradInsight.evidence,
        currentGradientClipNorm: currentClip,
        suggestedGradientClipNorm: currentClip > 0 ? Math.max(0.1, currentClip / 2) : 1.0,
      },
      suggestedChanges: [
        currentClip > 0
          ? `Reduce gradientClipNorm from ${currentClip} to ${Math.max(0.1, currentClip / 2)}`
          : "Set gradientClipNorm to 1.0",
        "Monitor gradient norms after clipping",
      ],
    });
  }

  // Loss decreases slowly
  if (slowInsight && slowInsight.evidence.lossReductionPercent !== undefined) {
    const currentLR = trainingConfig.optimizer.lr;
    recommendations.push({
      category: "optimization",
      priority: "medium",
      title: "Increase learning rate",
      rationale:
        `Loss decreased only ${slowInsight.evidence.lossReductionPercent.toFixed(1)}% over ${slowInsight.evidence.totalSteps} steps, suggesting the learning rate may be too conservative.`,
      evidence: {
        currentLR,
        suggestedLR: currentLR * 3,
        lossReductionPercent: slowInsight.evidence.lossReductionPercent,
      },
      suggestedChanges: [
        `Increase learning rate from ${currentLR} to ${currentLR * 3}`,
        "Run a small LR sweep to find optimal value",
        "Add linear warmup for first 5-10% of steps",
      ],
    });
  }

  return recommendations;
}

/**
 * Recommend based on stability issues.
 */
function recommendFromStability(
  insights: ResearchInsight[]
): ResearchRecommendation[] {
  const recommendations: ResearchRecommendation[] = [];

  const instabilityInsight = insights.find(
    (i) => i.type === "stability" && i.severity !== "info"
  );

  if (instabilityInsight) {
    const evidence = instabilityInsight.evidence;

    if (
      evidence.spikeCount !== undefined &&
      Number(evidence.spikeCount) >= 2
    ) {
      recommendations.push({
        category: "optimization",
        priority: "high",
        title: "Reduce learning rate to improve stability",
        rationale:
          `Training shows ${evidence.spikeCount} loss spikes with high variance, indicating the learning rate may be too high. Reducing it can smooth the loss curve.`,
        evidence,
        suggestedChanges: [
          "Reduce learning rate by 2-5×",
          "Enable gradient clipping if not already active",
          "Increase batch size to reduce gradient noise",
        ],
      });
    }

    if (evidence.coefficientOfVariation !== undefined) {
      const cv = evidence.coefficientOfVariation;
      if (cv > 2.0) {
        recommendations.push({
          category: "regularization",
          priority: "medium",
          title: "Increase batch size to reduce gradient noise",
          rationale:
            `High loss variance (CV: ${cv.toFixed(2)}) may be caused by noisy gradient estimates from small batches. A larger batch size provides more stable gradient estimates.`,
          evidence,
          suggestedChanges: [
            "Double the batch size if GPU memory allows",
            "Enable gradient accumulation to simulate larger batches",
            "Consider using batch normalization",
          ],
        });
      }
    }
  }

  return recommendations;
}

/**
 * Recommend based on overfitting.
 */
function recommendFromOverfitting(
  insights: ResearchInsight[],
  trainingConfig: TrainingRecipe,
  modelConfig: ModelConfigEntry
): ResearchRecommendation[] {
  const recommendations: ResearchRecommendation[] = [];

  const overfittingInsight = insights.find((i) => i.type === "overfitting");
  if (!overfittingInsight) return recommendations;

  const evidence = overfittingInsight.evidence;

  // Reduce training duration
  recommendations.push({
    category: "training",
    priority: "high",
    title: "Reduce training duration or increase regularization",
    rationale:
      "The evaluation loss is increasing while training loss decreases, a classic sign of overfitting. The model is memorizing training data instead of learning generalizable patterns.",
    evidence: {
      currentEpochs: trainingConfig.epochs,
      suggestedEpochs: Math.max(1, Math.floor(trainingConfig.epochs / 2)),
      trainEvalGap: evidence.trainEvalGap ?? 0,
    },
    suggestedChanges: [
      `Reduce epochs from ${trainingConfig.epochs} to ${Math.max(1, Math.floor(trainingConfig.epochs / 2))}`,
      "Enable early stopping with patience=3",
      "Add dropout to transformer layers",
    ],
  });

  // Add regularization
  recommendations.push({
    category: "regularization",
    priority: "high",
    title: "Add weight decay or dropout",
    rationale:
      "Regularization techniques help prevent overfitting by constraining model capacity or adding noise during training.",
    evidence: {
      currentWeightDecay: trainingConfig.optimizer.weightDecay ?? 0,
      modelParams: modelConfig.estimatedParams,
      suggestedWeightDecay: 0.01,
    },
    suggestedChanges: [
      trainingConfig.optimizer.weightDecay
        ? `Increase weightDecay from ${trainingConfig.optimizer.weightDecay} to 0.1`
        : "Add weightDecay: 0.01 to optimizer config",
      "Consider adding dropout (0.1) to attention and FFN layers",
      "Use data augmentation if applicable",
    ],
  });

  return recommendations;
}

/**
 * Recommend based on throughput / performance.
 */
function recommendFromThroughput(
  insights: ResearchInsight[],
  trainingConfig: TrainingRecipe
): ResearchRecommendation[] {
  const recommendations: ResearchRecommendation[] = [];

  const throughputInsight = insights.find((i) => i.type === "efficiency");
  if (!throughputInsight || throughputInsight.severity === "success") {
    return recommendations;
  }

  const evidence = throughputInsight.evidence;

  recommendations.push({
    category: "performance",
    priority: throughputInsight.severity === "warning" ? "medium" : "low",
    title: "Reduce sequence length or batch size",
    rationale:
      `Training throughput (${evidence.averageThroughput} tok/s) is below expected levels. Reducing computational load per step can improve throughput.`,
    evidence: {
      ...evidence,
      currentBlockSize: evidence.blockSize ?? 0,
      currentBatchSize: evidence.batchSize ?? 0,
      suggestedBlockSize: Math.max(8, Math.floor((evidence.blockSize ?? 256) / 2)),
    },
    suggestedChanges: [
      `Reduce blockSize from ${evidence.blockSize ?? "?"} to ${Math.max(8, Math.floor((evidence.blockSize ?? 256) / 2))}`,
      "Check for disk I/O bottlenecks in data loading",
      "Ensure GPU acceleration is enabled",
      "Use mixed-precision training if available",
    ],
  });

  return recommendations;
}

/**
 * Recommend based on divergence.
 */
function recommendFromDivergence(
  insights: ResearchInsight[]
): ResearchRecommendation[] {
  const recommendations: ResearchRecommendation[] = [];

  const divergenceInsight = insights.find((i) => i.type === "divergence");
  if (!divergenceInsight) return recommendations;

  recommendations.push({
    category: "optimization",
    priority: "high",
    title: "Reduce learning rate to prevent divergence",
    rationale:
      "The loss is increasing instead of decreasing, indicating the learning rate is too high and the optimizer is overshooting the minimum.",
    evidence: divergenceInsight.evidence,
    suggestedChanges: [
      "Reduce learning rate by 5-10×",
      "Enable gradient clipping (norm ≤ 1.0)",
      "Check training data for corruption or extreme values",
      "Reinitialize model weights and restart training",
    ],
  });

  return recommendations;
}

// ============================================================
// Main Engine
// ============================================================

/**
 * RecommendationEngine — generates deterministic, evidence-backed
 * recommendations from research insights.
 *
 * Usage:
 *   const engine = new RecommendationEngine();
 *   const recs = engine.recommend(insights, trainingConfig, modelConfig);
 *   console.log(recs.summary.high, "high-priority recommendations");
 */
export class RecommendationEngine {
  /**
   * Generate recommendations from research insights and config context.
   *
   * @param insights       — the ResearchInsights output from ResearchInsightEngine
   * @param trainingConfig — the training recipe used for this run
   * @param modelConfig    — the model config used for this run
   * @returns RecommendationSet with prioritized, evidence-backed recommendations
   */
  recommend(
    insights: ResearchInsights,
    trainingConfig: TrainingRecipe,
    modelConfig: ModelConfigEntry
  ): RecommendationSet {
    const { insightList } = { insightList: insights.insights };

    const allRecommendations: ResearchRecommendation[] = [
      ...recommendFromConvergence(insightList, trainingConfig),
      ...recommendFromOptimization(insightList, trainingConfig),
      ...recommendFromStability(insightList),
      ...recommendFromOverfitting(insightList, trainingConfig, modelConfig),
      ...recommendFromThroughput(insightList, trainingConfig),
      ...recommendFromDivergence(insightList),
    ];

    // Sort by priority: high → medium → low
    const priorityOrder: Record<RecommendationPriority, number> = {
      high: 0,
      medium: 1,
      low: 2,
    };
    allRecommendations.sort(
      (a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]
    );

    const high = allRecommendations.filter((r) => r.priority === "high").length;
    const medium = allRecommendations.filter((r) => r.priority === "medium").length;
    const low = allRecommendations.filter((r) => r.priority === "low").length;

    return {
      recordId: insights.recordId,
      computedAt: Date.now(),
      recommendations: allRecommendations,
      summary: {
        total: allRecommendations.length,
        high,
        medium,
        low,
      },
    };
  }

  /**
   * Get only high-priority recommendations.
   */
  getCriticalRecommendations(set: RecommendationSet): ResearchRecommendation[] {
    return set.recommendations.filter((r) => r.priority === "high");
  }

  /**
   * Get recommendations for a specific category.
   */
  getByCategory(
    set: RecommendationSet,
    category: RecommendationCategory
  ): ResearchRecommendation[] {
    return set.recommendations.filter((r) => r.category === category);
  }
}
