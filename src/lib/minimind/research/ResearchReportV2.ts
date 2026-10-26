// ============================================================
// MiniMind — research/ResearchReportV2.ts
// ============================================================
// Phase 60: Research report v2 — extended report with next
// experiment suggestions derived from real results.
//
// Extends the Phase 59 ResearchReport with additional sections:
//   - Configuration detail
//   - Dataset summary
//   - Model architecture detail
//   - Convergence analysis
//   - Stability analysis
//   - Generation before/after comparison
//   - Checkpoint details
//   - Comparison (multi-experiment)
//   - Research insights
//   - Recommendations
//   - Limitations
//   - Next experiment suggestions (DERIVED from results, not random)
//
// Design principles:
//   - Next experiment suggestions are derived from real metrics
//   - Each suggestion includes rationale and evidence
//   - Deterministic — same input → same output
//   - Browser-safe — no Node.js dependencies
// ============================================================

import type { ResearchRun, RunAnalysis } from "./ResearchRun";
import type { ResearchExperiment } from "./ResearchExperiment";
import type { ResearchInsights, ResearchInsight } from "./copilot/ResearchInsightEngine";
import type { ResearchRecommendation } from "./copilot/RecommendationEngine";
import type { ExperimentComparisonResult } from "./copilot/ComparisonInsightEngine";
import type { ReproducibilityCertificateData } from "./ReproducibilityCertificate";

// ============================================================
// Next Experiment Suggestion
// ============================================================

/**
 * A suggestion for the next experiment, derived from current results.
 */
export interface NextExperimentSuggestion {
  /** Short title (e.g. "Increase training epochs") */
  title: string;
  /** Why this suggestion was made */
  rationale: string;
  /** Numerical evidence supporting this suggestion */
  evidence: Record<string, number>;
  /** Confidence in this suggestion (0-1) */
  confidence: number;
  /** Suggested config changes */
  suggestedChanges: {
    /** Config field path (e.g. "trainingConfig.epochs") */
    field: string;
    /** Current value */
    currentValue: number | string;
    /** Suggested value */
    suggestedValue: number | string;
  }[];
  /** Priority (high/medium/low) */
  priority: "high" | "medium" | "low";
}

// ============================================================
// Report v2 Data
// ============================================================

/**
 * Complete research report v2 data structure.
 */
export interface ResearchReportV2Data {
  /** Report metadata */
  meta: {
    title: string;
    generatedAt: string;
    engine: "MiniMind Research Report v2.0 (Phase 60)";
    experimentId: string;
    runId: string;
  };

  /** ── Experiment Summary ── */
  experimentSummary: {
    name: string;
    description: string;
    status: string;
    seed: number;
    tags: string[];
  };

  /** ── Configuration ── */
  configuration: {
    model: {
      name: string;
      label: string;
      dModel: number;
      numHeads: number;
      dFF: number;
      numLayers: number;
      maxSeqLen: number;
      estimatedParams: number;
    };
    training: {
      recipe: string;
      epochs: number;
      lr: number;
      weightDecay: number;
      optimizerType: string;
      gradientClipNorm: number | undefined;
      gradientAccumulationSteps: number;
    };
    dataset: {
      name: string;
      blockSize: number;
      batchSize: number;
      shuffle: boolean;
    };
    tokenizer: {
      type: string;
      vocabSize: number;
    };
    evaluation: {
      maxTokens: number;
      temperature: number;
    };
  };

  /** ── Dataset ── */
  dataset: {
    name: string;
    blockSize: number;
    batchSize: number;
    totalTokens: number;
  };

  /** ── Model ── */
  model: {
    architecture: string;
    parameters: number;
    layers: number;
    heads: number;
    dModel: number;
  };

  /** ── Training ── */
  training: {
    initialLoss: number;
    finalLoss: number;
    bestLoss: number;
    perplexity: number;
    tokensPerSecond: number;
    totalTokens: number;
    totalSteps: number;
    totalEpochs: number;
    durationMs: number;
    durationFormatted: string;
  };

  /** ── Evaluation ── */
  evaluation: {
    beforeSamples: Array<{ prompt: string; text: string }>;
    afterSamples: Array<{ prompt: string; text: string }>;
  };

  /** ── Generation Before/After ── */
  generationComparison: {
    prompts: string[];
    before: string[];
    after: string[];
  };

  /** ── Convergence Analysis ── */
  convergenceAnalysis: {
    converged: boolean;
    lossReductionPercent: number;
    description: string;
  };

  /** ── Stability Analysis ── */
  stabilityAnalysis: {
    score: number;
    description: string;
  };

  /** ── Reproducibility ── */
  reproducibility: {
    seed: number;
    fingerprint: string;
    reproducible: boolean;
    confidence: number;
    lossMatch: boolean;
    generationMatch: boolean;
    description: string;
  };

  /** ── Checkpoint ── */
  checkpoint: {
    available: boolean;
    id: string | undefined;
  };

  /** ── Comparison (optional) ── */
  comparison?: {
    winners: Array<{ label: string; winnerName: string; winningValue: number }>;
    summary: string;
  };

  /** ── Research Insights ── */
  researchInsights: {
    critical: ResearchInsight[];
    warning: ResearchInsight[];
    success: ResearchInsight[];
    info: ResearchInsight[];
    summary: string;
  };

  /** ── Recommendations ── */
  recommendations: {
    high: ResearchRecommendation[];
    medium: ResearchRecommendation[];
    low: ResearchRecommendation[];
    summary: string;
  };

  /** ── Limitations ── */
  limitations: string[];

  /** ── Next Experiment Suggestions ── */
  nextExperimentSuggestions: NextExperimentSuggestion[];
}

// ============================================================
// Report v2 Generator
// ============================================================

/**
 * ResearchReportV2 — generates extended research reports with
 * next-experiment suggestions derived from real results.
 *
 * Usage:
 *   const reportV2 = new ResearchReportV2();
 *   const data = reportV2.generate({
 *     experiment, run, insights, recommendations, certificate, comparison
 *   });
 *   const md = reportV2.generateMarkdown(data);
 */
export class ResearchReportV2 {
  /**
   * Generate a complete ResearchReportV2 data structure.
   */
  generate(params: {
    experiment: ResearchExperiment;
    run: ResearchRun;
    insights?: ResearchInsights;
    recommendations?: ResearchRecommendation[];
    certificate?: ReproducibilityCertificateData;
    comparison?: ExperimentComparisonResult;
  }): ResearchReportV2Data {
    const { experiment, run, insights, recommendations, certificate, comparison } =
      params;

    // ── Configuration ──
    const configuration = {
      model: {
        name: experiment.modelConfig.name,
        label: experiment.modelConfig.label,
        dModel: experiment.modelConfig.dModel ?? 0,
        numHeads: experiment.modelConfig.numHeads ?? 0,
        dFF: experiment.modelConfig.dFF ?? 0,
        numLayers: experiment.modelConfig.numLayers ?? 0,
        maxSeqLen: experiment.modelConfig.maxSeqLen ?? 0,
        estimatedParams: experiment.modelConfig.estimatedParams,
      },
      training: {
        recipe: experiment.trainingConfig.name,
        epochs: experiment.trainingConfig.epochs,
        lr: experiment.trainingConfig.optimizer.lr,
        weightDecay: experiment.trainingConfig.optimizer.weightDecay ?? 0,
        optimizerType: experiment.trainingConfig.optimizer.type,
        gradientClipNorm: experiment.trainingConfig.gradientClipNorm,
        gradientAccumulationSteps:
          experiment.trainingConfig.gradientAccumulation ?? 1,
      },
      dataset: {
        name: experiment.datasetConfig.name,
        blockSize: experiment.datasetConfig.blockSize,
        batchSize: experiment.datasetConfig.batchSize,
        shuffle: experiment.datasetConfig.shuffle,
      },
      tokenizer: {
        type: experiment.tokenizerConfig.type,
        vocabSize: experiment.tokenizerConfig.vocabSize,
      },
      evaluation: {
        maxTokens: experiment.evaluationConfig.maxTokens,
        temperature: experiment.evaluationConfig.temperature,
      },
    };

    // ── Training summary ──
    const durationFormatted = this.formatDuration(run.durationMs);
    const training = {
      initialLoss: Math.round(run.initialLoss * 10000) / 10000,
      finalLoss: Math.round(run.finalLoss * 10000) / 10000,
      bestLoss: Math.round(run.bestLoss * 10000) / 10000,
      perplexity: Number.isFinite(run.perplexity)
        ? Math.round(run.perplexity * 100) / 100
        : NaN,
      tokensPerSecond: Math.round(run.tokensPerSecond * 100) / 100,
      totalTokens: run.totalTokens,
      totalSteps: run.totalSteps,
      totalEpochs: run.totalEpochs,
      durationMs: run.durationMs,
      durationFormatted,
    };

    // ── Generation ──
    const generationComparison = {
      prompts: experiment.evaluationConfig.generationPrompts,
      before: run.generationBefore.map((g) => g.generatedText),
      after: run.generationAfter.map((g) => g.generatedText),
    };

    // ── Convergence analysis ──
    const convergenceAnalysis = this.buildConvergenceAnalysis(run);

    // ── Stability analysis ──
    const stabilityAnalysis = this.buildStabilityAnalysis(run);

    // ── Reproducibility ──
    const reproducibility = certificate
      ? {
          seed: certificate.seed,
          fingerprint: certificate.fingerprints.combined,
          reproducible: certificate.overall.reproducible,
          confidence: certificate.overall.confidence,
          lossMatch: certificate.matches.lossMatch,
          generationMatch: certificate.matches.generationMatch,
          description: certificate.overall.verdict,
        }
      : {
          seed: experiment.seed,
          fingerprint: "N/A",
          reproducible: false,
          confidence: 0,
          lossMatch: false,
          generationMatch: false,
          description: "Reproducibility not verified for this run.",
        };

    // ── Research insights ──
    const researchInsights = insights
      ? {
          critical: insights.insights.filter((i) => i.severity === "critical"),
          warning: insights.insights.filter((i) => i.severity === "warning"),
          success: insights.insights.filter((i) => i.severity === "success"),
          info: insights.insights.filter((i) => i.severity === "info"),
          summary: `${insights.summary.total} insights: ${insights.summary.critical} critical, ${insights.summary.warning} warnings, ${insights.summary.success} successes, ${insights.summary.info} info`,
        }
      : {
          critical: [],
          warning: [],
          success: [],
          info: [],
          summary: "No insights available.",
        };

    // ── Recommendations ──
    const recs = recommendations ?? [];
    const recommendationsSection = {
      high: recs.filter((r) => r.priority === "high"),
      medium: recs.filter((r) => r.priority === "medium"),
      low: recs.filter((r) => r.priority === "low"),
      summary:
        recs.length > 0
          ? `${recs.length} recommendations: ${recs.filter((r) => r.priority === "high").length} high, ${recs.filter((r) => r.priority === "medium").length} medium, ${recs.filter((r) => r.priority === "low").length} low`
          : "No recommendations.",
    };

    // ── Limitations ──
    const limitations = this.buildLimitations(experiment, run);

    // ── Next experiment suggestions ──
    const nextExperimentSuggestions = this.deriveNextExperimentSuggestions(
      experiment,
      run,
      insights
    );

    // ── Comparison ──
    const comparisonSection = comparison
      ? {
          winners: comparison.winners.map((w) => ({
            label: w.label,
            winnerName: w.winnerName,
            winningValue: w.winningValue,
          })),
          summary: comparison.summary,
        }
      : undefined;

    return {
      meta: {
        title: `MiniMind Research Report — ${experiment.name}`,
        generatedAt: new Date().toISOString(),
        engine: "MiniMind Research Report v2.0 (Phase 60)",
        experimentId: experiment.id,
        runId: run.runId,
      },
      experimentSummary: {
        name: experiment.name,
        description: experiment.description,
        status: run.status,
        seed: experiment.seed,
        tags: experiment.tags,
      },
      configuration,
      dataset: {
        name: experiment.datasetConfig.name,
        blockSize: experiment.datasetConfig.blockSize,
        batchSize: experiment.datasetConfig.batchSize,
        totalTokens: run.totalTokens,
      },
      model: {
        architecture: `${configuration.model.numLayers}L-${configuration.model.dModel}D-${configuration.model.numHeads}H`,
        parameters: configuration.model.estimatedParams,
        layers: configuration.model.numLayers,
        heads: configuration.model.numHeads,
        dModel: configuration.model.dModel,
      },
      training,
      evaluation: {
        beforeSamples: run.generationBefore.map((g) => ({
          prompt: g.prompt,
          text: g.generatedText,
        })),
        afterSamples: run.generationAfter.map((g) => ({
          prompt: g.prompt,
          text: g.generatedText,
        })),
      },
      generationComparison,
      convergenceAnalysis,
      stabilityAnalysis,
      reproducibility,
      checkpoint: {
        available: !!run.checkpointId,
        id: run.checkpointId,
      },
      comparison: comparisonSection,
      researchInsights,
      recommendations: recommendationsSection,
      limitations,
      nextExperimentSuggestions,
    };
  }

  // ============================================================
  // Analysis Builders
  // ============================================================

  private buildConvergenceAnalysis(run: ResearchRun): {
    converged: boolean;
    lossReductionPercent: number;
    description: string;
  } {
    const lossReductionPercent =
      run.initialLoss > 0
        ? ((run.initialLoss - run.finalLoss) / run.initialLoss) * 100
        : 0;

    const analysis = run.analysis;
    const converged = analysis?.converged ?? (lossReductionPercent > 80);

    let description: string;
    if (converged) {
      description =
        `Training converged with ${lossReductionPercent.toFixed(1)}% loss reduction. ` +
        `Final loss stabilized at ${run.finalLoss.toFixed(4)}.`;
    } else if (lossReductionPercent > 50) {
      description =
        `Training is progressing well (${lossReductionPercent.toFixed(1)}% reduction) ` +
        `but may benefit from more steps.`;
    } else {
      description =
        `Training has limited progress (${lossReductionPercent.toFixed(1)}% reduction). ` +
        `Consider adjusting hyperparameters.`;
    }

    return { converged, lossReductionPercent, description };
  }

  private buildStabilityAnalysis(run: ResearchRun): {
    score: number;
    description: string;
  } {
    const score = run.analysis?.stabilityScore ?? 0.5;

    let description: string;
    if (score > 0.8) {
      description = "Training is very stable with smooth loss reduction.";
    } else if (score > 0.5) {
      description = "Training is moderately stable with some variance.";
    } else {
      description = "Training shows significant instability. Consider reducing LR.";
    }

    return { score, description };
  }

  // ============================================================
  // Limitations Detection
  // ============================================================

  private buildLimitations(
    experiment: ResearchExperiment,
    run: ResearchRun
  ): string[] {
    const limitations: string[] = [];

    // Small model
    const params = experiment.modelConfig.estimatedParams;
    if (params < 1_000_000) {
      limitations.push(
        `Small model size (~${params.toLocaleString()} params) limits representational capacity. Results may not scale to larger models.`
      );
    }

    // Short training
    if (run.totalSteps < 100) {
      limitations.push(
        `Training only ran for ${run.totalSteps} steps — convergence may not be reached.`
      );
    }

    // Small dataset
    if (run.totalTokens < 100_000) {
      limitations.push(
        `Dataset is small (${run.totalTokens.toLocaleString()} tokens). Results may not generalize.`
      );
    }

    // No reproducibility check
    if (!run.reproducibility?.verified) {
      limitations.push(
        "Reproducibility was not verified for this run. Run at least twice with the same seed to confirm."
      );
    }

    // Single seed
    limitations.push(
      `Only tested with seed=${experiment.seed}. Multi-seed evaluation would strengthen conclusions.`
    );

    // No eval dataset
    limitations.push(
      "No separate evaluation dataset was used. Overfitting cannot be ruled out."
    );

    return limitations;
  }

  // ============================================================
  // Next Experiment Suggestions (DERIVED from results)
  // ============================================================

  /**
   * Derive next experiment suggestions from real training results.
   *
   * Each suggestion is backed by numerical evidence from the run.
   * NOT random. NOT LLM-generated.
   */
  deriveNextExperimentSuggestions(
    experiment: ResearchExperiment,
    run: ResearchRun,
    insights?: ResearchInsights
  ): NextExperimentSuggestion[] {
    const suggestions: NextExperimentSuggestion[] = [];

    // ── Check 1: Loss still decreasing → suggest more epochs ──
    const lossReductionPercent =
      run.initialLoss > 0
        ? ((run.initialLoss - run.finalLoss) / run.initialLoss) * 100
        : 0;

    const converged = run.analysis?.converged ?? (lossReductionPercent > 85);

    if (!converged && lossReductionPercent < 80 && run.totalSteps > 10) {
      suggestions.push({
        title: "Increase training epochs",
        rationale:
          `Loss reduced by only ${lossReductionPercent.toFixed(1)}% and training hasn't converged. ` +
          "Additional epochs would likely improve results.",
        evidence: {
          currentEpochs: experiment.trainingConfig.epochs,
          lossReductionPercent: Math.round(lossReductionPercent * 100) / 100,
          finalLoss: run.finalLoss,
        },
        confidence: Math.min(0.9, 0.5 + (1 - lossReductionPercent / 100)),
        suggestedChanges: [
          {
            field: "trainingConfig.epochs",
            currentValue: experiment.trainingConfig.epochs,
            suggestedValue: Math.min(
              experiment.trainingConfig.epochs * 2,
              100
            ),
          },
        ],
        priority: "high",
      });
    }

    // ── Check 2: Overfitting detected → suggest early stopping / regularization ──
    if (run.analysis && run.analysis.criticalFindings > 0) {
      const criticalInsights = insights?.insights.filter(
        (i) => i.severity === "critical"
      ) ?? [];

      const hasOverfitting = criticalInsights.some(
        (i) => i.type === "overfitting"
      );

      if (hasOverfitting) {
        suggestions.push({
          title: "Reduce epochs and add regularization",
          rationale:
            "Overfitting detected: training loss improves while evaluation loss degrades. " +
            "Shorter training with regularization should produce a more generalizable model.",
          evidence: {
            currentEpochs: experiment.trainingConfig.epochs,
            suggestedEpochs: Math.max(
              1,
              Math.floor(experiment.trainingConfig.epochs / 2)
            ),
            currentWeightDecay:
              experiment.trainingConfig.optimizer.weightDecay ?? 0,
          },
          confidence: 0.85,
          suggestedChanges: [
            {
              field: "trainingConfig.epochs",
              currentValue: experiment.trainingConfig.epochs,
              suggestedValue: Math.max(
                1,
                Math.floor(experiment.trainingConfig.epochs / 2)
              ),
            },
            {
              field: "trainingConfig.optimizer.weightDecay",
              currentValue:
                experiment.trainingConfig.optimizer.weightDecay ?? 0,
              suggestedValue: 0.1,
            },
          ],
          priority: "high",
        });
      }

      // ── Check 3: Training unstable → suggest lower LR ──
      const hasInstability = criticalInsights.some(
        (i) => i.type === "stability" || i.type === "divergence"
      );

      if (hasInstability) {
        suggestions.push({
          title: "Reduce learning rate for stability",
          rationale:
            "Training shows instability (spikes or divergence). " +
            "A lower learning rate should produce a smoother loss curve.",
          evidence: {
            currentLR: experiment.trainingConfig.optimizer.lr,
            suggestedLR: experiment.trainingConfig.optimizer.lr / 3,
            stabilityScore: run.analysis?.stabilityScore ?? 0,
          },
          confidence: 0.88,
          suggestedChanges: [
            {
              field: "trainingConfig.optimizer.lr",
              currentValue: experiment.trainingConfig.optimizer.lr,
              suggestedValue:
                Math.round(experiment.trainingConfig.optimizer.lr / 3 * 1e6) /
                1e6,
            },
            {
              field: "trainingConfig.gradientClipNorm",
              currentValue:
                experiment.trainingConfig.gradientClipNorm ?? 0,
              suggestedValue: 1.0,
            },
          ],
          priority: "high",
        });
      }
    }

    // ── Check 4: Loss decreasing slowly → suggest higher LR ──
    if (
      lossReductionPercent < 15 &&
      run.totalSteps > 20 &&
      run.finalLoss > 1.0
    ) {
      suggestions.push({
        title: "Increase learning rate",
        rationale:
          `Loss decreased only ${lossReductionPercent.toFixed(1)}% over ${run.totalSteps} steps, ` +
          "suggesting the learning rate may be too conservative.",
        evidence: {
          currentLR: experiment.trainingConfig.optimizer.lr,
          suggestedLR: experiment.trainingConfig.optimizer.lr * 3,
          lossReductionPercent: Math.round(lossReductionPercent * 100) / 100,
        },
        confidence: 0.7,
        suggestedChanges: [
          {
            field: "trainingConfig.optimizer.lr",
            currentValue: experiment.trainingConfig.optimizer.lr,
            suggestedValue:
              Math.round(experiment.trainingConfig.optimizer.lr * 3 * 1e6) /
              1e6,
          },
        ],
        priority: "medium",
      });
    }

    // ── Check 5: Attention scaling → suggest more heads/layers ──
    if (converged && lossReductionPercent > 70 && run.totalSteps > 50) {
      const currentLayers = experiment.modelConfig.numLayers ?? 2;
      const currentHeads = experiment.modelConfig.numHeads ?? 4;
      const currentDModel = experiment.modelConfig.dModel ?? 64;

      suggestions.push({
        title: "Scale up model capacity",
        rationale:
          "Training converged successfully with good loss reduction. " +
          "Scaling up model capacity (more layers, heads, or embedding dim) " +
          "could further reduce loss and improve generation quality.",
        evidence: {
          currentLayers,
          currentHeads,
          currentDModel,
          finalLoss: run.finalLoss,
          lossReductionPercent: Math.round(lossReductionPercent * 100) / 100,
        },
        confidence: 0.65,
        suggestedChanges: [
          {
            field: "modelConfig.numLayers",
            currentValue: currentLayers,
            suggestedValue: Math.min(currentLayers + 2, 24),
          },
          {
            field: "modelConfig.dModel",
            currentValue: currentDModel,
            suggestedValue: currentDModel * 2,
          },
        ],
        priority: "medium",
      });
    }

    // ── Check 6: Good generation → suggest temperature sweep ──
    if (
      run.generationAfter.length > 0 &&
      run.generationBefore.length > 0
    ) {
      const beforeTexts = run.generationBefore.map((g) => g.generatedText);
      const afterTexts = run.generationAfter.map((g) => g.generatedText);
      const hasMeaningfulChange = beforeTexts.some(
        (t, i) => t !== afterTexts[i]
      );

      if (hasMeaningfulChange) {
        suggestions.push({
          title: "Run generation temperature sweep",
          rationale:
            "Generation quality improved after training. " +
            "A temperature sweep (0.2, 0.5, 0.8, 1.0, 1.2) would characterize " +
            "the quality-diversity trade-off.",
          evidence: {
            currentTemperature: experiment.evaluationConfig.temperature,
          },
          confidence: 0.6,
          suggestedChanges: [
            {
              field: "evaluationConfig.temperature",
              currentValue: experiment.evaluationConfig.temperature,
              suggestedValue: "sweep: [0.2, 0.5, 0.8, 1.0, 1.2]",
            },
          ],
          priority: "low",
        });
      }
    }

    // ── Check 7: Seed sensitivity → suggest multi-seed ──
    suggestions.push({
      title: "Run multi-seed evaluation",
      rationale:
        "Single-seed results may not be representative. " +
        "Running the same experiment with seeds 42, 123, 456 would " +
        "quantify variance and strengthen conclusions.",
      evidence: {
        currentSeed: experiment.seed,
      },
      confidence: 0.75,
      suggestedChanges: [
        {
          field: "seed",
          currentValue: experiment.seed,
          suggestedValue: "multi: [42, 123, 456, 789]",
        },
      ],
      priority: "medium",
    });

    return suggestions;
  }

  // ============================================================
  // Markdown Generation
  // ============================================================

  /**
   * Generate a Markdown research report from the v2 data.
   */
  generateMarkdown(data: ResearchReportV2Data): string {
    const lines: string[] = [];

    // ── Title ──
    lines.push(`# ${data.meta.title}`);
    lines.push("");
    lines.push(`**Experiment ID:** ${data.meta.experimentId}`);
    lines.push(`**Run ID:** ${data.meta.runId}`);
    lines.push(`**Generated:** ${data.meta.generatedAt}`);
    lines.push(`**Engine:** ${data.meta.engine}`);
    lines.push("");

    // ── Experiment Summary ──
    lines.push("## Experiment Summary");
    lines.push("");
    lines.push(`| Field | Value |`);
    lines.push(`|-------|-------|`);
    lines.push(`| Name | ${data.experimentSummary.name} |`);
    lines.push(`| Description | ${data.experimentSummary.description || "N/A"} |`);
    lines.push(`| Status | ${data.experimentSummary.status} |`);
    lines.push(`| Seed | ${data.experimentSummary.seed} |`);
    if (data.experimentSummary.tags.length > 0) {
      lines.push(`| Tags | ${data.experimentSummary.tags.join(", ")} |`);
    }
    lines.push("");

    // ── Configuration ──
    lines.push("## Configuration");
    lines.push("");
    lines.push("### Model");
    lines.push("");
    lines.push(`| Field | Value |`);
    lines.push(`|-------|-------|`);
    lines.push(`| Name | ${data.configuration.model.name} |`);
    lines.push(`| Label | ${data.configuration.model.label} |`);
    lines.push(`| Architecture | ${data.model.architecture} |`);
    lines.push(`| Parameters | ${data.configuration.model.estimatedParams.toLocaleString()} |`);
    lines.push(`| Layers | ${data.configuration.model.numLayers} |`);
    lines.push(`| Heads | ${data.configuration.model.numHeads} |`);
    lines.push(`| dModel | ${data.configuration.model.dModel} |`);
    lines.push(`| dFF | ${data.configuration.model.dFF} |`);
    lines.push(`| Max Seq Len | ${data.configuration.model.maxSeqLen} |`);
    lines.push("");

    lines.push("### Training");
    lines.push("");
    lines.push(`| Field | Value |`);
    lines.push(`|-------|-------|`);
    lines.push(`| Recipe | ${data.configuration.training.recipe} |`);
    lines.push(`| Epochs | ${data.configuration.training.epochs} |`);
    lines.push(`| Learning Rate | ${data.configuration.training.lr} |`);
    lines.push(`| Weight Decay | ${data.configuration.training.weightDecay} |`);
    lines.push(`| Optimizer | ${data.configuration.training.optimizerType} |`);
    lines.push(`| Gradient Clip Norm | ${data.configuration.training.gradientClipNorm ?? "none"} |`);
    lines.push("");

    // ── Dataset ──
    lines.push("## Dataset");
    lines.push("");
    lines.push(`| Field | Value |`);
    lines.push(`|-------|-------|`);
    lines.push(`| Name | ${data.dataset.name} |`);
    lines.push(`| Block Size | ${data.dataset.blockSize} |`);
    lines.push(`| Batch Size | ${data.dataset.batchSize} |`);
    lines.push(`| Total Tokens | ${data.dataset.totalTokens.toLocaleString()} |`);
    lines.push("");

    // ── Training Results ──
    lines.push("## Training Results");
    lines.push("");
    lines.push(`| Metric | Value |`);
    lines.push(`|--------|-------|`);
    lines.push(`| Initial Loss | ${data.training.initialLoss.toFixed(4)} |`);
    lines.push(`| Final Loss | ${data.training.finalLoss.toFixed(4)} |`);
    lines.push(`| Best Loss | ${data.training.bestLoss.toFixed(4)} |`);
    lines.push(`| Perplexity | ${Number.isFinite(data.training.perplexity) ? data.training.perplexity.toFixed(2) : "N/A"} |`);
    lines.push(`| Throughput | ${data.training.tokensPerSecond.toFixed(1)} tok/s |`);
    lines.push(`| Total Steps | ${data.training.totalSteps} |`);
    lines.push(`| Total Epochs | ${data.training.totalEpochs} |`);
    lines.push(`| Duration | ${data.training.durationFormatted} |`);
    lines.push("");

    // ── Generation Before/After ──
    lines.push("## Generation Before/After");
    lines.push("");
    lines.push("| Prompt | Before | After |");
    lines.push("|--------|--------|-------|");
    for (let i = 0; i < data.generationComparison.prompts.length; i++) {
      const prompt = data.generationComparison.prompts[i];
      const before = data.generationComparison.before[i] ?? "N/A";
      const after = data.generationComparison.after[i] ?? "N/A";
      lines.push(
        `| ${prompt} | ${before.substring(0, 40)} | ${after.substring(0, 40)} |`
      );
    }
    lines.push("");

    // ── Convergence Analysis ──
    lines.push("## Convergence Analysis");
    lines.push("");
    lines.push(data.convergenceAnalysis.description);
    lines.push("");

    // ── Stability Analysis ──
    lines.push("## Stability Analysis");
    lines.push("");
    lines.push(
      `Stability score: ${(data.stabilityAnalysis.score * 100).toFixed(0)}% — ` +
      data.stabilityAnalysis.description
    );
    lines.push("");

    // ── Reproducibility ──
    lines.push("## Reproducibility");
    lines.push("");
    lines.push(`| Field | Value |`);
    lines.push(`|-------|-------|`);
    lines.push(`| Seed | ${data.reproducibility.seed} |`);
    lines.push(`| Fingerprint | ${data.reproducibility.fingerprint} |`);
    lines.push(`| Reproducible | ${data.reproducibility.reproducible ? "✅ Yes" : "❌ No"} |`);
    lines.push(`| Confidence | ${(data.reproducibility.confidence * 100).toFixed(0)}% |`);
    lines.push(`| Loss Match | ${data.reproducibility.lossMatch ? "✅" : "❌"} |`);
    lines.push(`| Generation Match | ${data.reproducibility.generationMatch ? "✅" : "❌"} |`);
    lines.push("");
    lines.push(data.reproducibility.description);
    lines.push("");

    // ── Checkpoint ──
    lines.push("## Checkpoint");
    lines.push("");
    lines.push(
      data.checkpoint.available
        ? `Checkpoint saved: \`${data.checkpoint.id}\``
        : "No checkpoint saved for this run."
    );
    lines.push("");

    // ── Comparison (if available) ──
    if (data.comparison) {
      lines.push("## Experiment Comparison");
      lines.push("");
      lines.push(data.comparison.summary);
      lines.push("");
      lines.push("### Winners");
      lines.push("");
      lines.push("| Metric | Winner | Value |");
      lines.push("|--------|--------|-------|");
      for (const w of data.comparison.winners) {
        lines.push(
          `| ${w.label} | ${w.winnerName} | ${w.winningValue.toFixed(4)} |`
        );
      }
      lines.push("");
    }

    // ── Research Insights ──
    lines.push("## Research Insights");
    lines.push("");
    lines.push(data.researchInsights.summary);
    lines.push("");

    if (data.researchInsights.critical.length > 0) {
      lines.push("### ⚠️ Critical");
      for (const i of data.researchInsights.critical) {
        lines.push(`- **${i.title}** (${(i.confidence * 100).toFixed(0)}% confidence)`);
        lines.push(`  ${i.description}`);
      }
      lines.push("");
    }

    if (data.researchInsights.warning.length > 0) {
      lines.push("### ⚡ Warnings");
      for (const i of data.researchInsights.warning) {
        lines.push(`- **${i.title}**`);
        lines.push(`  ${i.description}`);
      }
      lines.push("");
    }

    // ── Recommendations ──
    lines.push("## Recommendations");
    lines.push("");
    lines.push(data.recommendations.summary);
    lines.push("");

    if (data.recommendations.high.length > 0) {
      lines.push("### High Priority");
      for (const r of data.recommendations.high) {
        lines.push(`- **${r.title}**`);
        lines.push(`  ${r.rationale}`);
        for (const change of r.suggestedChanges) {
          lines.push(`  - ${change}`);
        }
      }
      lines.push("");
    }

    // ── Limitations ──
    lines.push("## Limitations");
    lines.push("");
    for (const limitation of data.limitations) {
      lines.push(`- ${limitation}`);
    }
    lines.push("");

    // ── Next Experiment Suggestions ──
    lines.push("## Next Experiment Suggestions");
    lines.push("");
    lines.push(
      "> These suggestions are derived from real training results, " +
      "not randomly generated."
    );
    lines.push("");

    for (let i = 0; i < data.nextExperimentSuggestions.length; i++) {
      const s = data.nextExperimentSuggestions[i];
      lines.push(
        `### ${i + 1}. [${s.priority.toUpperCase()}] ${s.title}`
      );
      lines.push("");
      lines.push(`**Rationale:** ${s.rationale}`);
      lines.push("");
      lines.push(`**Confidence:** ${(s.confidence * 100).toFixed(0)}%`);
      lines.push("");
      lines.push("**Suggested changes:**");
      for (const change of s.suggestedChanges) {
        lines.push(
          `- \`${change.field}\`: ${change.currentValue} → ${change.suggestedValue}`
        );
      }
      lines.push("");
      lines.push("**Evidence:**");
      for (const [key, value] of Object.entries(s.evidence)) {
        lines.push(`  - ${key}: ${value}`);
      }
      lines.push("");
    }

    return lines.join("\n");
  }

  // ============================================================
  // Helpers
  // ============================================================

  private formatDuration(ms: number): string {
    if (ms <= 0) return "N/A";
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }
}
