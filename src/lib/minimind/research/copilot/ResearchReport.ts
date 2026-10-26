// ============================================================
// MiniMind — research/copilot/ResearchReport.ts
// ============================================================
// Phase 59: Research report generator.
//
// Generates structured JSON and Markdown reports from
// research insights, recommendations, and training data.
//
// Report structure:
//   # MiniMind Research Report
//   ## Experiment
//   ## Training Summary
//   ## Findings
//   ## Problems Detected
//   ## Recommendations
//   ## Evidence
//   ## Reproducibility
//
// Design principles:
//   - Pure functions — report generation only, no analysis
//   - JSON output is machine-readable
//   - Markdown output is suitable for docs/research/reports/
//   - No fabricated conclusions
// ============================================================

import type { ResearchInsights, ResearchInsight } from "./ResearchInsightEngine";
import type { ResearchRecommendation } from "./RecommendationEngine";
import type { ExperimentComparisonResult } from "./ComparisonInsightEngine";

// ============================================================
// Types
// ============================================================

/**
 * Structured JSON research report.
 */
export interface ResearchReportData {
  /** Report metadata */
  meta: {
    /** Report title */
    title: string;
    /** When the report was generated */
    generatedAt: string;
    /** Software version marker */
    engine: "MiniMind Research Copilot v1.0 (Phase 59)";
    /** Important disclaimer */
    disclaimer: string;
  };

  /** Experiment identity */
  experiment: {
    name: string;
    recordId: string;
    model: string;
    modelParams: number;
    dataset: string;
    datasetBlockSize: number;
    datasetBatchSize: number;
    seed: number;
  };

  /** Training summary metrics */
  trainingSummary: {
    initialLoss: number;
    finalLoss: number;
    bestLoss: number;
    perplexity: number;
    averageThroughput: number;
    totalSteps: number;
    totalEpochs: number;
    durationMs: number;
    durationFormatted: string;
    status: string;
  };

  /** All findings grouped by severity */
  findings: {
    critical: ResearchInsight[];
    warning: ResearchInsight[];
    success: ResearchInsight[];
    info: ResearchInsight[];
  };

  /** Detected problems */
  problemsDetected: ResearchInsight[];

  /** Recommendations */
  recommendations: {
    high: ResearchRecommendation[];
    medium: ResearchRecommendation[];
    low: ResearchRecommendation[];
    all: ResearchRecommendation[];
  };

  /** All numerical evidence */
  evidence: Record<string, number>;

  /** Reproducibility info */
  reproducibility: {
    seed: number;
    modelConfigSummary: string;
    trainingConfigSummary: string;
    datasetSummary: string;
    checkpointAvailable: boolean;
  };

  /** Optional: experiment comparison */
  comparison?: ExperimentComparisonResult;
}

// ============================================================
// Helpers
// ============================================================

function formatDuration(ms: number): string {
  if (ms <= 0) return "N/A";
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

function formatTimestamp(ts: number): string {
  return new Date(ts).toISOString();
}

function collectAllEvidence(
  insights: ResearchInsights,
  recs: ResearchRecommendation[]
): Record<string, number> {
  const evidence: Record<string, number> = {};

  for (const insight of insights.insights) {
    for (const [key, value] of Object.entries(insight.evidence)) {
      if (typeof value === "number" && Number.isFinite(value)) {
        evidence[`${insight.type}.${key}`] = value;
      }
    }
  }

  for (const rec of recs) {
    for (const [key, value] of Object.entries(rec.evidence)) {
      if (typeof value === "number" && Number.isFinite(value)) {
        evidence[`recommendation.${key}`] = Math.round(value * 10000) / 10000;
      }
    }
  }

  return evidence;
}

// ============================================================
// Report Generator
// ============================================================

/**
 * ResearchReport — deterministic report generation.
 *
 * Usage:
 *   const report = new ResearchReport();
 *   const json = report.generateJSON(insights, recs, record);
 *   const md = report.generateMarkdown(insights, recs, record);
 */
export class ResearchReport {
  /**
   * Generate a structured JSON research report.
   *
   * @param insights     — research insights from ResearchInsightEngine
   * @param recommendations — recommendation set from RecommendationEngine
   * @param record       — (via adapter data) training run summary info
   * @param comparison   — optional experiment comparison result
   * @returns ResearchReportData
   */
  generateJSON(params: {
    insights: ResearchInsights;
    recommendations: ResearchRecommendation[];
    experimentName: string;
    recordId: string;
    modelLabel: string;
    modelParams: number;
    datasetName: string;
    datasetBlockSize: number;
    datasetBatchSize: number;
    seed: number;
    initialLoss: number;
    finalLoss: number;
    bestLoss: number;
    perplexity: number;
    averageThroughput: number;
    totalSteps: number;
    totalEpochs: number;
    durationMs: number;
    status: string;
    comparison?: ExperimentComparisonResult;
  }): ResearchReportData {
    const {
      insights,
      recommendations,
      experimentName,
      recordId,
      modelLabel,
      modelParams,
      datasetName,
      datasetBlockSize,
      datasetBatchSize,
      seed,
      initialLoss,
      finalLoss,
      bestLoss,
      perplexity,
      averageThroughput,
      totalSteps,
      totalEpochs,
      durationMs,
      status,
      comparison,
    } = params;

    const critical = insights.insights.filter((i) => i.severity === "critical");
    const warning = insights.insights.filter((i) => i.severity === "warning");
    const success = insights.insights.filter((i) => i.severity === "success");
    const info = insights.insights.filter((i) => i.severity === "info");

    const high = recommendations.filter((r) => r.priority === "high");
    const medium = recommendations.filter((r) => r.priority === "medium");
    const low = recommendations.filter((r) => r.priority === "low");

    const problemsDetected = [...critical, ...warning];
    const evidence = collectAllEvidence(insights, recommendations);

    return {
      meta: {
        title: `MiniMind Research Report — ${experimentName}`,
        generatedAt: formatTimestamp(Date.now()),
        engine: "MiniMind Research Copilot v1.0 (Phase 59)",
        disclaimer:
          "This is a deterministic research-analysis engine, not an LLM. " +
          "All findings are derived from real training metrics and numerical analysis.",
      },
      experiment: {
        name: experimentName,
        recordId,
        model: modelLabel,
        modelParams,
        dataset: datasetName,
        datasetBlockSize,
        datasetBatchSize,
        seed,
      },
      trainingSummary: {
        initialLoss: Math.round(initialLoss * 10000) / 10000,
        finalLoss: Math.round(finalLoss * 10000) / 10000,
        bestLoss: Math.round(bestLoss * 10000) / 10000,
        perplexity: Math.round(perplexity * 100) / 100,
        averageThroughput: Math.round(averageThroughput * 100) / 100,
        totalSteps,
        totalEpochs,
        durationMs,
        durationFormatted: formatDuration(durationMs),
        status,
      },
      findings: { critical, warning, success, info },
      problemsDetected,
      recommendations: { high, medium, low, all: recommendations },
      evidence,
      reproducibility: {
        seed,
        modelConfigSummary: `${modelLabel} (~${modelParams.toLocaleString()} params)`,
        trainingConfigSummary: `${totalEpochs} epochs, ${totalSteps} steps`,
        datasetSummary: `${datasetName} (block=${datasetBlockSize}, batch=${datasetBatchSize})`,
        checkpointAvailable: status === "completed",
      },
      comparison,
    };
  }

  /**
   * Generate a Markdown research report suitable for docs/research/reports/.
   */
  generateMarkdown(params: {
    insights: ResearchInsights;
    recommendations: ResearchRecommendation[];
    experimentName: string;
    recordId: string;
    modelLabel: string;
    modelParams: number;
    datasetName: string;
    datasetBlockSize: number;
    datasetBatchSize: number;
    seed: number;
    initialLoss: number;
    finalLoss: number;
    bestLoss: number;
    perplexity: number;
    averageThroughput: number;
    totalSteps: number;
    totalEpochs: number;
    durationMs: number;
    status: string;
    comparison?: ExperimentComparisonResult;
  }): string {
    const {
      insights,
      recommendations,
      experimentName,
      recordId,
      modelLabel,
      modelParams,
      datasetName,
      datasetBlockSize,
      datasetBatchSize,
      seed,
      initialLoss,
      finalLoss,
      bestLoss,
      perplexity,
      averageThroughput,
      totalSteps,
      totalEpochs,
      durationMs,
      status,
      comparison,
    } = params;

    const lines: string[] = [];

    // ── Title ──
    lines.push(`# MiniMind Research Report`);
    lines.push("");
    lines.push(`**Experiment:** ${experimentName}`);
    lines.push(`**Generated:** ${formatTimestamp(Date.now())}`);
    lines.push(`**Engine:** MiniMind Research Copilot v1.0 (Phase 59)`);
    lines.push("");
    lines.push(
      "> **Disclaimer:** This is a deterministic research-analysis engine, " +
      "not an LLM. All findings are derived from real training metrics " +
      "and numerical analysis."
    );
    lines.push("");

    // ── Experiment ──
    lines.push("## Experiment");
    lines.push("");
    lines.push(`| Field | Value |`);
    lines.push(`|-------|-------|`);
    lines.push(`| Name | ${experimentName} |`);
    lines.push(`| ID | ${recordId} |`);
    lines.push(`| Model | ${modelLabel} (~${modelParams.toLocaleString()} params) |`);
    lines.push(`| Dataset | ${datasetName} |`);
    lines.push(`| Block Size | ${datasetBlockSize} |`);
    lines.push(`| Batch Size | ${datasetBatchSize} |`);
    lines.push(`| Seed | ${seed} |`);
    lines.push("");

    // ── Training Summary ──
    lines.push("## Training Summary");
    lines.push("");
    lines.push(`| Metric | Value |`);
    lines.push(`|--------|-------|`);
    lines.push(`| Initial Loss | ${initialLoss.toFixed(4)} |`);
    lines.push(`| Final Loss | ${finalLoss.toFixed(4)} |`);
    lines.push(`| Best Loss | ${bestLoss.toFixed(4)} |`);
    lines.push(`| Perplexity | ${Number.isFinite(perplexity) ? perplexity.toFixed(2) : "N/A"} |`);
    lines.push(`| Throughput | ${averageThroughput.toFixed(1)} tok/s |`);
    lines.push(`| Steps | ${totalSteps} |`);
    lines.push(`| Epochs | ${totalEpochs} |`);
    lines.push(`| Duration | ${formatDuration(durationMs)} |`);
    lines.push(`| Status | ${status} |`);
    lines.push("");

    // ── Findings ──
    lines.push("## Findings");
    lines.push("");

    const critical = insights.insights.filter((i) => i.severity === "critical");
    const warning = insights.insights.filter((i) => i.severity === "warning");
    const success = insights.insights.filter((i) => i.severity === "success");
    const info = insights.insights.filter((i) => i.severity === "info");

    if (critical.length > 0) {
      lines.push("### Critical");
      lines.push("");
      for (const f of critical) {
        lines.push(`- **${f.title}** (confidence: ${(f.confidence * 100).toFixed(0)}%)`);
        lines.push(`  ${f.description}`);
        lines.push("");
      }
    }

    if (warning.length > 0) {
      lines.push("### Warnings");
      lines.push("");
      for (const f of warning) {
        lines.push(`- **${f.title}** (confidence: ${(f.confidence * 100).toFixed(0)}%)`);
        lines.push(`  ${f.description}`);
        lines.push("");
      }
    }

    if (success.length > 0) {
      lines.push("### Successes");
      lines.push("");
      for (const f of success) {
        lines.push(`- **${f.title}**`);
        lines.push(`  ${f.description}`);
        lines.push("");
      }
    }

    if (info.length > 0) {
      lines.push("### Info");
      lines.push("");
      for (const f of info) {
        lines.push(`- **${f.title}**`);
        lines.push(`  ${f.description}`);
        lines.push("");
      }
    }

    // ── Problems Detected ──
    const problems = [...critical, ...warning];
    if (problems.length > 0) {
      lines.push("## Problems Detected");
      lines.push("");
      for (const p of problems) {
        lines.push(`- **${p.title}** (${p.type}, ${p.severity})`);
        lines.push(`  ${p.description}`);
        lines.push("");
        lines.push("  Evidence:");
        for (const [key, value] of Object.entries(p.evidence)) {
          if (typeof value === "number") {
            lines.push(`    - ${key}: ${value}`);
          }
        }
        lines.push("");
      }
    } else {
      lines.push("## Problems Detected");
      lines.push("");
      lines.push("No critical or warning-level problems detected.");
      lines.push("");
    }

    // ── Recommendations ──
    lines.push("## Recommendations");
    lines.push("");

    if (recommendations.length === 0) {
      lines.push("No specific recommendations. Training appears to be running well.");
      lines.push("");
    } else {
      const high = recommendations.filter((r) => r.priority === "high");
      const medium = recommendations.filter((r) => r.priority === "medium");
      const low = recommendations.filter((r) => r.priority === "low");

      let recNum = 1;
      for (const rec of [...high, ...medium, ...low]) {
        lines.push(`### ${recNum}. [${rec.priority.toUpperCase()}] ${rec.title}`);
        lines.push("");
        lines.push(`**Category:** ${rec.category}`);
        lines.push("");
        lines.push(`**Rationale:** ${rec.rationale}`);
        lines.push("");
        lines.push("**Evidence:**");
        for (const [key, value] of Object.entries(rec.evidence)) {
          if (typeof value === "number") {
            lines.push(`  - ${key}: ${Math.round(value * 10000) / 10000}`);
          }
        }
        lines.push("");
        lines.push("**Suggested Changes:**");
        for (const change of rec.suggestedChanges) {
          lines.push(`  - ${change}`);
        }
        lines.push("");
        recNum++;
      }
    }

    // ── Evidence ──
    lines.push("## Evidence");
    lines.push("");
    lines.push("All numerical evidence supporting findings:");
    lines.push("");

    const allEvidence = collectAllEvidence(insights, recommendations);
    if (Object.keys(allEvidence).length > 0) {
      lines.push("| Key | Value |");
      lines.push("|-----|-------|");
      for (const [key, value] of Object.entries(allEvidence)) {
        lines.push(`| ${key} | ${Math.round(value * 10000) / 10000} |`);
      }
    } else {
      lines.push("No numerical evidence available.");
    }
    lines.push("");

    // ── Reproducibility ──
    lines.push("## Reproducibility");
    lines.push("");
    lines.push(`| Aspect | Detail |`);
    lines.push(`|--------|--------|`);
    lines.push(`| Seed | ${seed} |`);
    lines.push(`| Model | ${modelLabel} (~${modelParams.toLocaleString()} params) |`);
    lines.push(`| Recipe | ${totalEpochs} epochs, ${totalSteps} steps |`);
    lines.push(`| Dataset | ${datasetName} (block=${datasetBlockSize}, batch=${datasetBatchSize}) |`);
    lines.push(`| Checkpoint | ${status === "completed" ? "Available" : "Not available"} |`);
    lines.push("");

    // ── Comparison (optional) ──
    if (comparison) {
      lines.push("## Experiment Comparison");
      lines.push("");
      lines.push(comparison.summary);
      lines.push("");
      lines.push("### Winners by Metric");
      lines.push("");
      lines.push("| Metric | Winner | Value |");
      lines.push("|--------|--------|-------|");
      for (const w of comparison.winners) {
        lines.push(`| ${w.label} | ${w.winnerName} | ${w.winningValue.toFixed(4)} |`);
      }
      lines.push("");

      if (comparison.tradeoffs.length > 0) {
        lines.push("### Trade-offs");
        lines.push("");
        for (const t of comparison.tradeoffs) {
          lines.push(`- **${t.advantage}:** ${t.detail}`);
        }
        lines.push("");
      }
    }

    return lines.join("\n");
  }
}
