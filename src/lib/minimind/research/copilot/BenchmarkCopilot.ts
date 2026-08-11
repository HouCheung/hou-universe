// ============================================================
// MiniMind — research/copilot/BenchmarkCopilot.ts
// ============================================================
// Phase 62: Benchmark-aware research copilot.
//
// Integrates benchmark results into the existing copilot pipeline.
// Wraps the ResearchConclusion engine to produce structured insights
// and recommendations from benchmark suite data.
//
// The copilot now covers TWO data sources:
//   1. Training metrics → ResearchInsightEngine (existing)
//   2. Benchmark suite results → BenchmarkCopilot (new)
//
// Both feed into the same insight/recommendation pipeline, giving
// the user a unified research intelligence experience.
//
// Design principles:
//   - Deterministic — rule-based, not LLM
//   - Evidence-backed — every insight cites specific metrics
//   - Browser-safe — no fs/path
//   - Reuse > Rewrite — wraps existing conclusion engine
// ============================================================

import type { BenchmarkSuiteResult, SuiteMemberResult } from "../benchmark/BenchmarkSuite";
import type { ResearchBenchmarkResult } from "../benchmark/ResearchBenchmarkRunner";
import {
  generateConclusions,
  assessSignificance,
} from "../benchmark/ResearchConclusion";
import type {
  ResearchConclusion,
  ResearchConclusions,
  ConclusionCategory,
  ConclusionSeverity,
} from "../benchmark/ResearchConclusion";

// ============================================================
// Copilot Types
// ============================================================

/**
 * A benchmark insight — adapted from ResearchConclusion for the copilot.
 */
export interface BenchmarkInsight {
  /** Unique insight ID */
  id: string;
  /** Category */
  category: ConclusionCategory;
  /** Human-readable statement */
  statement: string;
  /** Supporting evidence (key → numeric value) */
  evidence: Record<string, number>;
  /** Confidence (0-1) */
  confidence: number;
  /** Severity */
  severity: ConclusionSeverity;
  /** Which configurations this applies to */
  relatedConfigs: string[];
}

/**
 * A set of benchmark insights, grouped by category.
 */
export interface BenchmarkInsights {
  /** Source benchmark name */
  source: string;
  /** All insights */
  insights: BenchmarkInsight[];
  /** Grouped by category */
  byCategory: Record<string, BenchmarkInsight[]>;
  /** Executive summary */
  summary: string;
  /** Counts by severity */
  counts: {
    critical: number;
    important: number;
    notable: number;
    info: number;
    total: number;
  };
}

/**
 * A benchmark recommendation — actionable next step.
 */
export interface BenchmarkRecommendation {
  /** What action to take */
  action: string;
  /** Why this is recommended */
  rationale: string;
  /** Priority (high/medium/low) */
  priority: "high" | "medium" | "low";
  /** Which configuration this applies to */
  targetConfig: string;
}

// ============================================================
// BenchmarkCopilot
// ============================================================

/**
 * BenchmarkCopilot — generates insights and recommendations from
 * benchmark suite results.
 *
 * Usage:
 *   const copilot = new BenchmarkCopilot();
 *   const insights = copilot.analyze(suiteResult);
 *   const recs = copilot.recommend(insights);
 */
export class BenchmarkCopilot {
  /**
   * Analyze a benchmark suite result and produce structured insights.
   *
   * @param suiteResult — completed benchmark suite result
   * @returns categorized insights with summary and counts
   */
  analyze(suiteResult: BenchmarkSuiteResult): BenchmarkInsights {
    const conclusions = generateConclusions(suiteResult);

    const insights: BenchmarkInsight[] = conclusions.conclusions.map(
      (c) => ({
        id: c.id,
        category: c.category,
        statement: c.statement,
        evidence: c.evidence,
        confidence: c.confidence,
        severity: c.severity,
        relatedConfigs: c.relatedKeys,
      })
    );

    // Group by category
    const byCategory: Record<string, BenchmarkInsight[]> = {};
    for (const insight of insights) {
      if (!byCategory[insight.category]) {
        byCategory[insight.category] = [];
      }
      byCategory[insight.category].push(insight);
    }

    // Count by severity
    const counts = {
      critical: insights.filter((i) => i.severity === "critical").length,
      important: insights.filter((i) => i.severity === "important").length,
      notable: insights.filter((i) => i.severity === "notable").length,
      info: insights.filter((i) => i.severity === "info").length,
      total: insights.length,
    };

    return {
      source: suiteResult.name,
      insights,
      byCategory,
      summary: conclusions.summary,
      counts,
    };
  }

  /**
   * Generate actionable recommendations from benchmark insights.
   *
   * @param insights — benchmark insights from analyze()
   * @returns prioritized recommendations
   */
  recommend(
    insights: BenchmarkInsights
  ): BenchmarkRecommendation[] {
    const recs: BenchmarkRecommendation[] = [];

    // Critical convergence issues → highest priority
    const convergenceIssues = insights.byCategory["convergence"] ?? [];
    for (const c of convergenceIssues.filter(
      (i) => i.severity === "critical"
    )) {
      recs.push({
        action: "Increase training epochs or adjust learning rate",
        rationale: c.statement,
        priority: "high",
        targetConfig: c.relatedConfigs.join(", "),
      });
    }

    // Performance winners → recommend adoption
    const performanceInsights =
      insights.byCategory["performance"] ?? [];
    for (const p of performanceInsights) {
      recs.push({
        action: `Adopt best-performing configuration for further experiments`,
        rationale: p.statement,
        priority: "medium",
        targetConfig: p.relatedConfigs.join(", "),
      });
    }

    // Trade-offs → recommend investigation
    const tradeoffs = insights.byCategory["tradeoff"] ?? [];
    for (const t of tradeoffs) {
      recs.push({
        action: "Investigate trade-off between loss and throughput",
        rationale: t.statement,
        priority: "medium",
        targetConfig: t.relatedConfigs.join(", "),
      });
    }

    // Scaling insights → recommend scaling direction
    const scaling = insights.byCategory["scaling"] ?? [];
    for (const s of scaling) {
      if (s.severity === "important") {
        recs.push({
          action: "Continue scaling in the direction that improved loss",
          rationale: s.statement,
          priority: "medium",
          targetConfig: s.relatedConfigs.join(", "),
        });
      }
    }

    // Reproducibility issues
    const reproducibility = insights.byCategory["reproducibility"] ?? [];
    for (const r of reproducibility) {
      recs.push({
        action: "Increase number of runs for better statistical confidence",
        rationale: r.statement,
        priority: "low",
        targetConfig: r.relatedConfigs.join(", "),
      });
    }

    // Deduplicate by action + target
    const seen = new Set<string>();
    return recs.filter((r) => {
      const key = `${r.action}|${r.targetConfig}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /**
   * Analyze and recommend in one call.
   *
   * @param suiteResult — completed benchmark suite result
   * @returns insights with recommendations attached
   */
  analyzeAndRecommend(suiteResult: BenchmarkSuiteResult): {
    insights: BenchmarkInsights;
    recommendations: BenchmarkRecommendation[];
  } {
    const insights = this.analyze(suiteResult);
    const recommendations = this.recommend(insights);
    return { insights, recommendations };
  }

  /**
   * Quick analysis of a single benchmark result.
   *
   * @param result — a single benchmark result
   * @param name — label for the result
   * @returns basic insights
   */
  quickAnalyze(
    result: ResearchBenchmarkResult,
    name?: string
  ): {
    bestLoss: { mean: number; std: number };
    throughput: { mean: number; std: number };
    params: number;
    runsCompleted: number;
    summary: string;
  } {
    const m = result.aggregate;
    const p = result.profile;

    return {
      bestLoss: { mean: m.bestLoss.mean, std: m.bestLoss.std },
      throughput: { mean: m.throughput.mean, std: m.throughput.std },
      params: m.totalParams,
      runsCompleted: m.runsCompleted,
      summary:
        `${name ?? p.name}: loss=${m.bestLoss.mean.toFixed(4)} ± ${m.bestLoss.std.toFixed(4)}, ` +
        `${m.throughput.mean.toFixed(0)} ± ${m.throughput.std.toFixed(0)} tok/s, ` +
        `${m.totalParams.toLocaleString()} params, ${m.runsCompleted} runs`,
    };
  }

  /**
   * Compare two benchmark results and produce insights.
   */
  compareResults(
    a: ResearchBenchmarkResult,
    b: ResearchBenchmarkResult,
    labelA: string = "A",
    labelB: string = "B"
  ): {
    lossImprovement: number;
    throughputChange: number;
    summary: string;
    recommendation: string;
  } {
    const lossA = a.aggregate.bestLoss;
    const lossB = b.aggregate.bestLoss;
    const tpsA = a.aggregate.throughput;
    const tpsB = b.aggregate.throughput;

    const lossImprovement =
      lossB.mean > 0
        ? (lossA.mean - lossB.mean) / lossB.mean
        : 0;

    const throughputChange =
      tpsB.mean > 0
        ? (tpsA.mean - tpsB.mean) / tpsB.mean
        : 0;

    const lossDir = lossImprovement < 0 ? "better" : "worse";
    const tpsDir = throughputChange > 0 ? "faster" : "slower";

    // Assess significance
    const lossSig = assessSignificance(lossA, lossB);
    const tpsSig = assessSignificance(tpsA, tpsB);

    let recommendation: string;
    if (lossImprovement < -0.05 && throughputChange > -0.1) {
      recommendation = `${labelA} is clearly better — lower loss without significant speed penalty.`;
    } else if (lossImprovement > 0.05) {
      recommendation = `${labelB} has better loss. Prefer ${labelA} only if throughput is critical.`;
    } else if (Math.abs(lossImprovement) < 0.02) {
      recommendation = `Comparable performance. Choose based on other factors (params, simplicity).`;
    } else {
      recommendation = `Trade-off: ${lossDir} loss but ${tpsDir} speed. Profile your use case.`;
    }

    return {
      lossImprovement,
      throughputChange,
      summary:
        `${labelA} vs ${labelB}: ` +
        `loss ${lossDir} by ${Math.abs(lossImprovement * 100).toFixed(1)}% ` +
        `(${lossSig.level} significance), ` +
        `${Math.abs(throughputChange * 100).toFixed(1)}% ${tpsDir} ` +
        `(${tpsSig.level} significance).`,
      recommendation,
    };
  }

  /**
   * Get a concise status badge for a benchmark result.
   */
  getStatusBadge(result: ResearchBenchmarkResult): {
    label: string;
    color: "green" | "yellow" | "red";
    detail: string;
  } {
    const m = result.aggregate;
    const loss = m.bestLoss;

    if (loss.std / Math.max(loss.mean, 1e-6) > 0.1) {
      return {
        label: "HIGH VARIANCE",
        color: "yellow",
        detail: `CV=${((loss.std / loss.mean) * 100).toFixed(1)}% — consider more runs`,
      };
    }

    if (m.runsCompleted < 2) {
      return {
        label: "SINGLE RUN",
        color: "yellow",
        detail: "Multiple runs needed for statistical confidence",
      };
    }

    if (loss.mean < 1.0) {
      return {
        label: "GOOD",
        color: "green",
        detail: `Loss=${loss.mean.toFixed(4)} ± ${loss.std.toFixed(4)}`,
      };
    }

    return {
      label: "OK",
      color: "green",
      detail: `${m.runsCompleted} runs completed`,
    };
  }
}
