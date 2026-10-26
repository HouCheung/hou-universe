// ============================================================
// MiniMind — research/NextExperimentGenerator.ts
// ============================================================
// Phase 60: Next experiment generator.
//
// Derives concrete next-experiment configurations from the
// results of a completed experiment. Maps research insights
// and recommendations → specific config changes.
//
// The generator only PROPOSES changes — it never automatically
// modifies user configs or starts training. The user must
// confirm before the next experiment is created.
//
// Design principles:
//   - Deterministic — same input → same suggestions
//   - Evidence-backed — every suggestion has numerical support
//   - Advisory only — no automatic config modification
//   - Browser-safe — no Node.js dependencies
// ============================================================

import type { ResearchExperiment, DatasetConfig, TokenizerConfig, EvaluationConfig } from "./ResearchExperiment";
import { cloneResearchExperiment } from "./ResearchExperiment";
import type { ResearchRun } from "./ResearchRun";
import type { NextExperimentSuggestion } from "./ResearchReportV2";
import type { ResearchInsights } from "./copilot/ResearchInsightEngine";
import type { ResearchRecommendation } from "./copilot/RecommendationEngine";

// ============================================================
// Types
// ============================================================

/**
 * A pre-filled next experiment derived from current results.
 */
export interface PrefilledExperiment {
  /** The cloned experiment with suggested changes applied */
  experiment: ResearchExperiment;
  /** Which suggestion drove this config */
  source: NextExperimentSuggestion;
  /** Human-readable summary of what changed */
  changeSummary: string;
}

/**
 * Result of generating next experiments.
 */
export interface NextExperimentResult {
  /** The original experiment */
  sourceExperiment: ResearchExperiment;
  /** The original run */
  sourceRun: ResearchRun;
  /** All generated next-experiment proposals */
  proposals: PrefilledExperiment[];
  /** Summary for display */
  summary: string;
}

// ============================================================
// NextExperimentGenerator
// ============================================================

export class NextExperimentGenerator {
  /**
   * Generate next-experiment proposals from a completed experiment run.
   *
   * Each proposal is a fully-formed ResearchExperiment that the user
   * can review, modify, and then enqueue for execution.
   *
   * @param experiment — the source experiment
   * @param run — the completed run
   * @param suggestions — derived next-experiment suggestions
   * @param recommendations — optional recommendations for additional detail
   * @returns NextExperimentResult with all proposals
   */
  generate(params: {
    experiment: ResearchExperiment;
    run: ResearchRun;
    suggestions: NextExperimentSuggestion[];
    recommendations?: ResearchRecommendation[];
  }): NextExperimentResult {
    const { experiment, run, suggestions } = params;

    const proposals: PrefilledExperiment[] = [];

    for (const suggestion of suggestions) {
      const proposal = this.applySuggestion(experiment, suggestion);
      if (proposal) {
        proposals.push(proposal);
      }
    }

    const summary = this.buildSummary(experiment, run, proposals);

    return {
      sourceExperiment: experiment,
      sourceRun: run,
      proposals,
      summary,
    };
  }

  /**
   * Apply a single suggestion to create a pre-filled experiment.
   */
  private applySuggestion(
    experiment: ResearchExperiment,
    suggestion: NextExperimentSuggestion
  ): PrefilledExperiment | null {
    const changes: string[] = [];

    // Clone the experiment
    let next = cloneResearchExperiment(experiment, {
      name: `${experiment.name} — ${suggestion.title}`,
      description: `Auto-generated from experiment "${experiment.name}": ${suggestion.rationale}`,
    });

    // Apply each suggested change
    for (const change of suggestion.suggestedChanges) {
      const applied = this.applyFieldChange(next, change);
      if (applied) {
        next = applied.experiment;
        changes.push(applied.description);
      }
    }

    if (changes.length === 0) return null;

    // Mark as draft — user must review and confirm
    next = { ...next, status: "draft" as const };

    return {
      experiment: next,
      source: suggestion,
      changeSummary: changes.join("; "),
    };
  }

  /**
   * Apply a single field change to an experiment.
   */
  private applyFieldChange(
    experiment: ResearchExperiment,
    change: { field: string; currentValue: number | string; suggestedValue: number | string }
  ): { experiment: ResearchExperiment; description: string } | null {
    const { field, currentValue, suggestedValue } = change;

    // Parse the field path (e.g., "trainingConfig.epochs")
    const parts = field.split(".");

    // Handle top-level fields
    if (parts.length === 1) {
      if (field === "seed") {
        const seed = Number(suggestedValue);
        if (Number.isNaN(seed)) return null;
        return {
          experiment: { ...experiment, seed },
          description: `seed: ${currentValue} → ${seed}`,
        };
      }
      return null;
    }

    // Handle nested fields
    if (parts[0] === "trainingConfig") {
      return this.applyTrainingConfigChange(experiment, parts.slice(1), currentValue, suggestedValue);
    }

    if (parts[0] === "modelConfig") {
      return this.applyModelConfigChange(experiment, parts.slice(1), currentValue, suggestedValue);
    }

    if (parts[0] === "evaluationConfig") {
      return this.applyEvalConfigChange(experiment, parts.slice(1), currentValue, suggestedValue);
    }

    return null;
  }

  private applyTrainingConfigChange(
    experiment: ResearchExperiment,
    path: string[],
    currentValue: number | string,
    suggestedValue: number | string
  ): { experiment: ResearchExperiment; description: string } | null {
    const tc = { ...experiment.trainingConfig };

    if (path.length === 1 && path[0] === "epochs") {
      const val = Number(suggestedValue);
      if (Number.isNaN(val)) return null;
      const updated = { ...tc, epochs: val };
      return {
        experiment: { ...experiment, trainingConfig: updated },
        description: `epochs: ${currentValue} → ${val}`,
      };
    }

    if (path.length === 1 && path[0] === "gradientClipNorm") {
      const val = Number(suggestedValue);
      if (Number.isNaN(val)) return null;
      const updated = { ...tc, gradientClipNorm: val };
      return {
        experiment: { ...experiment, trainingConfig: updated },
        description: `gradientClipNorm: ${currentValue} → ${val}`,
      };
    }

    if (path[0] === "optimizer") {
      const opt = { ...tc.optimizer };
      if (path[1] === "lr") {
        const val = Number(suggestedValue);
        if (Number.isNaN(val)) return null;
        const updated = { ...tc, optimizer: { ...opt, lr: val } };
        return {
          experiment: { ...experiment, trainingConfig: updated },
          description: `lr: ${currentValue} → ${val}`,
        };
      }
      if (path[1] === "weightDecay") {
        const val = Number(suggestedValue);
        if (Number.isNaN(val)) return null;
        const updated = { ...tc, optimizer: { ...opt, weightDecay: val } };
        return {
          experiment: { ...experiment, trainingConfig: updated },
          description: `weightDecay: ${currentValue} → ${val}`,
        };
      }
    }

    return null;
  }

  private applyModelConfigChange(
    experiment: ResearchExperiment,
    path: string[],
    currentValue: number | string,
    suggestedValue: number | string
  ): { experiment: ResearchExperiment; description: string } | null {
    const mc = { ...experiment.modelConfig };
    const val = Number(suggestedValue);
    if (Number.isNaN(val)) return null;

    if (path.length === 1) {
      const key = path[0] as keyof typeof mc;
      if (typeof mc[key] === "number") {
        const updated = { ...mc, [key]: val };
        return {
          experiment: { ...experiment, modelConfig: updated },
          description: `${key}: ${currentValue} → ${val}`,
        };
      }
    }

    return null;
  }

  private applyEvalConfigChange(
    experiment: ResearchExperiment,
    path: string[],
    currentValue: number | string,
    suggestedValue: number | string
  ): { experiment: ResearchExperiment; description: string } | null {
    const ec = { ...experiment.evaluationConfig };

    if (path.length === 1 && path[0] === "temperature") {
      const val = Number(suggestedValue);
      if (Number.isNaN(val)) return null;
      const updated = { ...ec, temperature: val };
      return {
        experiment: { ...experiment, evaluationConfig: updated },
        description: `temperature: ${currentValue} → ${val}`,
      };
    }

    return null;
  }

  /**
   * Build a human-readable summary of the next-experiment proposals.
   */
  private buildSummary(
    experiment: ResearchExperiment,
    run: ResearchRun,
    proposals: PrefilledExperiment[]
  ): string {
    const lines: string[] = [];
    lines.push(`Based on experiment "${experiment.name}" (run ${run.runId}):`);
    lines.push("");
    lines.push(`Final loss: ${run.finalLoss.toFixed(4)}, Best loss: ${run.bestLoss.toFixed(4)}`);
    lines.push("");
    lines.push(`Generated ${proposals.length} follow-up experiment proposal(s):`);
    lines.push("");

    for (let i = 0; i < proposals.length; i++) {
      const p = proposals[i];
      lines.push(
        `  ${i + 1}. [${p.source.priority.toUpperCase()}] ${p.source.title}`
      );
      lines.push(`     Changes: ${p.changeSummary}`);
      lines.push(`     Confidence: ${(p.source.confidence * 100).toFixed(0)}%`);
      lines.push("");
    }

    lines.push("Review each proposal in the Research Workspace before running.");
    lines.push("Config changes are pre-filled but NOT automatically applied.");

    return lines.join("\n");
  }
}
