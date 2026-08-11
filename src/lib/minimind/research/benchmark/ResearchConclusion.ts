// ============================================================
// MiniMind — research/benchmark/ResearchConclusion.ts
// ============================================================
// Phase 62: Research conclusion engine.
//
// Analyzes benchmark results and produces structured, evidence-backed
// conclusions. Each conclusion is a single claim backed by specific
// metrics from real benchmark data.
//
// Conclusion categories:
//   - performance    — which config performs best on a metric
//   - scaling        — how a parameter change affects metrics
//   - tradeoff        — when improving one metric degrades another
//   - convergence    — whether training converged sufficiently
//   - reproducibility — how consistent results are across runs
//   - recommendation — actionable next steps
//
// Design principles:
//   - Evidence-backed — every conclusion cites specific numbers
//   - Deterministic — rule-based, no LLM, same input → same output
//   - Statistical awareness — uses std to assess confidence
//   - Browser-safe — pure computation, no fs/path
// ============================================================

import type {
  BenchmarkSuiteResult,
  SuiteComparison,
} from "./BenchmarkSuite";
import type {
  ResearchBenchmarkResult,
  BenchmarkMetricStats,
} from "./ResearchBenchmarkRunner";

// ============================================================
// Conclusion Types
// ============================================================

/**
 * Category of a research conclusion.
 */
export type ConclusionCategory =
  | "performance"
  | "scaling"
  | "tradeoff"
  | "convergence"
  | "reproducibility"
  | "recommendation";

/**
 * Severity / importance of a conclusion.
 */
export type ConclusionSeverity =
  | "critical"
  | "important"
  | "notable"
  | "info";

/**
 * A single research conclusion — one claim backed by evidence.
 */
export interface ResearchConclusion {
  /** Unique conclusion ID */
  id: string;
  /** Category */
  category: ConclusionCategory;
  /** Single-line human-readable statement */
  statement: string;
  /** Supporting metric evidence */
  evidence: Record<string, number>;
  /** Confidence in this conclusion (0-1) */
  confidence: number;
  /** Severity / importance */
  severity: ConclusionSeverity;
  /** Which suite members or runs this applies to */
  relatedKeys: string[];
  /** Longer explanation (optional) */
  detail?: string;
}

/**
 * A structured set of conclusions from a benchmark analysis.
 */
export interface ResearchConclusions {
  /** Source benchmark name */
  source: string;
  /** When these conclusions were generated */
  generatedAt: number;
  /** All conclusions */
  conclusions: ResearchConclusion[];
  /** Executive summary (1-2 sentences) */
  summary: string;
}

// ============================================================
// Statistical Significance
// ============================================================

/**
 * Significance level of a metric comparison.
 */
export type SignificanceLevel = "high" | "medium" | "low" | "none";

/**
 * Assess whether a difference between two metrics is statistically
 * significant given their standard deviations.
 *
 * Uses Cohen's d-like approach: |diff| / pooled_std.
 *   - >= 2.0 → "high" (large effect)
 *   - >= 1.0 → "medium"
 *   - >= 0.5 → "low"
 *   - < 0.5  → "none"
 */
export function assessSignificance(
  statsA: BenchmarkMetricStats,
  statsB: BenchmarkMetricStats
): { level: SignificanceLevel; effectSize: number } {
  const diff = Math.abs(statsA.mean - statsB.mean);
  const pooledStd = Math.sqrt(
    (statsA.std ** 2 + statsB.std ** 2) / 2
  );

  if (pooledStd === 0) {
    return { level: "none", effectSize: 0 };
  }

  const effectSize = diff / pooledStd;

  let level: SignificanceLevel;
  if (effectSize >= 2.0) {
    level = "high";
  } else if (effectSize >= 1.0) {
    level = "medium";
  } else if (effectSize >= 0.5) {
    level = "low";
  } else {
    level = "none";
  }

  return { level, effectSize };
}

// ============================================================
// Conclusion Generation
// ============================================================

/**
 * Generate research conclusions from a benchmark suite result.
 *
 * Applies deterministic analysis rules to the benchmark data,
 * producing a structured set of conclusions with evidence,
 * confidence, and severity ratings.
 *
 * @param suiteResult — the completed benchmark suite result
 * @returns structured conclusions with summary
 */
export function generateConclusions(
  suiteResult: BenchmarkSuiteResult
): ResearchConclusions {
  const conclusions: ResearchConclusion[] = [];
  let conclusionIndex = 0;

  const members = suiteResult.members;
  if (members.length === 0) {
    return {
      source: suiteResult.name,
      generatedAt: Date.now(),
      conclusions: [],
      summary: "No benchmark data available.",
    };
  }

  // ── 1. Best performance (lowest loss) ──
  if (suiteResult.comparison.byBestLoss.length >= 2) {
    const best = suiteResult.comparison.byBestLoss[0];
    const second = suiteResult.comparison.byBestLoss[1];
    const improvement =
      second.value > 0
        ? ((second.value - best.value) / second.value) * 100
        : 0;

    conclusions.push({
      id: `conc-${++conclusionIndex}`,
      category: "performance",
      statement:
        improvement > 0.5
          ? `"${best.label}" achieves the best loss (${best.value.toFixed(4)}), ` +
            `${Math.abs(improvement).toFixed(1)}% lower than "${second.label}"`
          : `"${best.label}" has the best loss (${best.value.toFixed(4)}), ` +
            `but the margin over "${second.label}" is small`,
      evidence: {
        bestLoss: best.value,
        secondBestLoss: second.value,
        improvementPercent: improvement,
      },
      confidence: Math.min(0.95, Math.abs(improvement) / 5),
      severity: improvement > 1 ? "important" : "notable",
      relatedKeys: [best.key, second.key],
    });
  }

  // ── 2. Fastest throughput ──
  if (suiteResult.comparison.byThroughput.length >= 2) {
    const fastest = suiteResult.comparison.byThroughput[0];
    const slowest =
      suiteResult.comparison.byThroughput[
        suiteResult.comparison.byThroughput.length - 1
      ];

    const speedRatio =
      slowest.value > 0 ? fastest.value / slowest.value : 1;

    if (speedRatio > 1.1) {
      conclusions.push({
        id: `conc-${++conclusionIndex}`,
        category: "performance",
        statement:
          `"${fastest.label}" is the fastest (${fastest.value.toFixed(0)} tok/s), ` +
          `${speedRatio.toFixed(1)}× faster than "${slowest.label}"`,
        evidence: {
          fastestThroughput: fastest.value,
          slowestThroughput: slowest.value,
          speedRatio,
        },
        confidence: 0.9,
        severity: speedRatio > 2 ? "important" : "notable",
        relatedKeys: [fastest.key, slowest.key],
      });
    }
  }

  // ── 3. Baseline improvements ──
  if (suiteResult.baseline) {
    const bl = suiteResult.baseline;
    const blLoss = bl.report.metrics.bestLoss.mean;

    for (const imp of suiteResult.comparison.improvements) {
      if (imp.key === bl.member.key) continue;

      const absImprovement = Math.abs(imp.lossImprovement);
      const direction = imp.lossImprovement < 0 ? "improves" : "degrades";

      if (absImprovement > 0.01) {
        conclusions.push({
          id: `conc-${++conclusionIndex}`,
          category: "scaling",
          statement:
            `"${imp.label}" ${direction} loss by ` +
            `${(absImprovement * 100).toFixed(1)}% vs baseline`,
          evidence: {
            baselineLoss: blLoss,
            variantLossImprovement: imp.lossImprovement,
            throughputImprovement: imp.throughputImprovement,
          },
          confidence:
            absImprovement > 0.05
              ? 0.85
              : absImprovement > 0.02
                ? 0.7
                : 0.5,
          severity:
            absImprovement > 0.05
              ? "important"
              : absImprovement > 0.02
                ? "notable"
                : "info",
          relatedKeys: [imp.key, bl.member.key],
        });
      }
    }
  }

  // ── 4. Trade-off detection ──
  // A trade-off exists when the best-loss config is NOT the fastest.
  if (
    suiteResult.comparison.byBestLoss.length >= 2 &&
    suiteResult.comparison.byThroughput.length >= 2
  ) {
    const bestLoss = suiteResult.comparison.byBestLoss[0];
    const fastest = suiteResult.comparison.byThroughput[0];

    if (bestLoss.key !== fastest.key) {
      const lossMember = members.find(
        (m) => m.member.key === bestLoss.key
      );
      const speedMember = members.find(
        (m) => m.member.key === fastest.key
      );

      if (lossMember && speedMember) {
        const lossDiff =
          speedMember.report.metrics.bestLoss.mean > 0
            ? ((bestLoss.value - speedMember.report.metrics.bestLoss.mean) /
                speedMember.report.metrics.bestLoss.mean) *
              100
            : 0;

        conclusions.push({
          id: `conc-${++conclusionIndex}`,
          category: "tradeoff",
          statement:
            `Trade-off: "${bestLoss.label}" has best loss but "${fastest.label}" ` +
            `is faster. Choosing "${bestLoss.label}" costs ` +
            `${Math.abs(lossDiff).toFixed(1)}% loss vs "${fastest.label}".`,
          evidence: {
            bestLossValue: bestLoss.value,
            fastestThroughput: fastest.value,
            lossDifferencePercent: lossDiff,
            throughputRatio:
              fastest.value /
              (suiteResult.comparison.byThroughput.find(
                (r) => r.key === bestLoss.key
              )?.value ?? fastest.value),
          },
          confidence: 0.8,
          severity: "notable",
          relatedKeys: [bestLoss.key, fastest.key],
        });
      }
    }
  }

  // ── 5. Convergence analysis ──
  for (const mr of members) {
    const conv = mr.report.convergence;
    if (!conv || conv.totalRuns === 0) continue;

    const convergenceRate = conv.runsConverged / conv.totalRuns;

    if (convergenceRate === 0 && conv.totalRuns > 0) {
      conclusions.push({
        id: `conc-${++conclusionIndex}`,
        category: "convergence",
        statement:
          `"${mr.member.label}" did NOT converge in any run. ` +
          `Consider increasing epochs or adjusting learning rate.`,
        evidence: {
          runsConverged: 0,
          totalRuns: conv.totalRuns,
          lossReduction: conv.avgLossReduction,
        },
        confidence: 0.9,
        severity: "critical",
        relatedKeys: [mr.member.key],
      });
    } else if (convergenceRate < 1.0 && conv.totalRuns > 1) {
      conclusions.push({
        id: `conc-${++conclusionIndex}`,
        category: "convergence",
        statement:
          `"${mr.member.label}" converged in ${conv.runsConverged}/` +
          `${conv.totalRuns} runs (${(convergenceRate * 100).toFixed(0)}%). ` +
          `Results may be inconsistent.`,
        evidence: {
          runsConverged: conv.runsConverged,
          totalRuns: conv.totalRuns,
          lossReduction: conv.avgLossReduction,
        },
        confidence: 0.7,
        severity: "notable",
        relatedKeys: [mr.member.key],
      });
    }
  }

  // ── 6. Diminishing returns detection ──
  detectDiminishingReturns(conclusions, suiteResult, ++conclusionIndex);

  // ── 7. Reproducibility assessment ──
  assessReproducibility(conclusions, suiteResult, ++conclusionIndex);

  // ── 8. Recommendations ──
  generateRecommendations(conclusions, suiteResult, ++conclusionIndex);

  // Build summary
  const summary = buildSummary(conclusions, suiteResult.name);

  return {
    source: suiteResult.name,
    generatedAt: Date.now(),
    conclusions,
    summary,
  };
}

// ============================================================
// Specialized Detectors
// ============================================================

/**
 * Detect diminishing returns: each successive variant in a scale
 * suite should improve less than the previous one.
 */
function detectDiminishingReturns(
  conclusions: ResearchConclusion[],
  result: BenchmarkSuiteResult,
  startIndex: number
): void {
  const members = result.members;
  if (members.length < 3) return;

  // Sort by loss improvement over baseline
  const improvements = result.comparison.improvements
    .filter((imp) => imp.key !== result.baseline?.member.key)
    .sort((a, b) => a.lossImprovement - b.lossImprovement);

  if (improvements.length < 2) return;

  // Check if each successive improvement is smaller than the
  // marginal improvement from the previous step
  for (let i = 1; i < improvements.length; i++) {
    const current = Math.abs(improvements[i].lossImprovement);
    const previous = Math.abs(improvements[i - 1].lossImprovement);

    // If current improvement < previous improvement, diminishing returns
    if (current < previous * 0.7 && current > 0.01) {
      conclusions.push({
        id: `conc-${startIndex}`,
        category: "scaling",
        statement:
          `Diminishing returns: "${improvements[i].label}" ` +
          `(${(previous * 100).toFixed(1)}% improvement) yields less gain ` +
          `than "${improvements[i - 1].label}" ` +
          `(${(current * 100).toFixed(1)}%). Consider whether further ` +
          `scaling is worthwhile.`,
        evidence: {
          previousImprovement: previous,
          currentImprovement: current,
        },
        confidence: 0.75,
        severity: "notable",
        relatedKeys: [
          improvements[i].key,
          improvements[i - 1].key,
        ],
        detail:
          `Marginal improvement dropped from ${(previous * 100).toFixed(1)}% ` +
          `to ${(current * 100).toFixed(1)}%.`,
      });
      break; // Report only the first instance
    }
  }
}

/**
 * Assess reproducibility based on within-profile variance.
 *
 * High std relative to mean indicates poor reproducibility.
 */
function assessReproducibility(
  conclusions: ResearchConclusion[],
  result: BenchmarkSuiteResult,
  startIndex: number
): void {
  for (const mr of result.members) {
    const lossStats = mr.report.metrics.bestLoss;
    if (lossStats.values.length < 2) continue;

    const cv = lossStats.mean > 0 ? lossStats.std / lossStats.mean : 0;

    if (cv > 0.1) {
      conclusions.push({
        id: `conc-${startIndex}`,
        category: "reproducibility",
        statement:
          `"${mr.member.label}" shows high variance across runs ` +
          `(CV=${(cv * 100).toFixed(1)}%). Consider increasing numRuns ` +
          `or checking seed sensitivity.`,
        evidence: {
          lossMean: lossStats.mean,
          lossStd: lossStats.std,
          coefficientOfVariation: cv,
          numRuns: lossStats.values.length,
        },
        confidence: 0.8,
        severity: cv > 0.2 ? "important" : "notable",
        relatedKeys: [mr.member.key],
      });
    }
  }
}

/**
 * Generate actionable recommendations based on conclusions.
 */
function generateRecommendations(
  conclusions: ResearchConclusion[],
  result: BenchmarkSuiteResult,
  startIndex: number
): void {
  const members = result.members;

  // If any config didn't converge, recommend increasing epochs
  const nonConverged = conclusions.filter(
    (c) => c.category === "convergence" && c.severity === "critical"
  );
  if (nonConverged.length > 0) {
    conclusions.push({
      id: `conc-${startIndex}`,
      category: "recommendation",
      statement:
        "Increase epochs or adjust learning rate for non-converging configurations.",
      evidence: {
        nonConvergedCount: nonConverged.length,
      },
      confidence: 0.9,
      severity: "critical",
      relatedKeys: nonConverged.map((c) => c.relatedKeys[0]).filter(Boolean),
    });
  }

  // If a clear winner exists, recommend it for production
  const performanceConclusions = conclusions.filter(
    (c) => c.category === "performance"
  );
  if (performanceConclusions.length > 0 && members.length >= 2) {
    conclusions.push({
      id: `conc-${startIndex + 1}`,
      category: "recommendation",
      statement:
        `Based on benchmark results, ` +
        `use the best-performing configuration for further experiments.`,
      evidence: {
        memberCount: members.length,
        conclusionCount: performanceConclusions.length,
      },
      confidence: 0.7,
      severity: "notable",
      relatedKeys: members.map((m) => m.member.key),
    });
  }
}

// ============================================================
// Summary Builder
// ============================================================

/**
 * Build a concise executive summary from a set of conclusions.
 */
function buildSummary(
  conclusions: ResearchConclusion[],
  sourceName: string
): string {
  const critical = conclusions.filter((c) => c.severity === "critical");
  const important = conclusions.filter((c) => c.severity === "important");
  const byCategory: Record<string, ResearchConclusion[]> = {};
  for (const c of conclusions) {
    if (!byCategory[c.category]) byCategory[c.category] = [];
    byCategory[c.category].push(c);
  }

  const parts: string[] = [];

  // Best performance highlight
  const perf = conclusions.filter((c) => c.category === "performance");
  if (perf.length > 0) {
    parts.push(perf[0].statement);
  }

  // Critical issues
  if (critical.length > 0) {
    parts.push(`${critical.length} critical issue(s) found.`);
  }

  // Key findings count
  const findingsCount = conclusions.length - critical.length;
  if (findingsCount > 0) {
    parts.push(`${findingsCount} additional finding(s).`);
  }

  const categories = Object.keys(byCategory).join(", ");
  parts.push(`Categories: ${categories}.`);

  return parts.join(" ");
}

// ============================================================
// Formatting
// ============================================================

/**
 * Format research conclusions as a human-readable string.
 */
export function formatConclusions(
  result: ResearchConclusions
): string {
  const lines: string[] = [];
  lines.push("=".repeat(70));
  lines.push("RESEARCH CONCLUSIONS");
  lines.push("=".repeat(70));
  lines.push(`Source: ${result.source}`);
  lines.push(`Generated: ${new Date(result.generatedAt).toISOString()}`);
  lines.push("");
  lines.push("SUMMARY");
  lines.push(result.summary);
  lines.push("");

  const severityOrder: ConclusionSeverity[] = [
    "critical",
    "important",
    "notable",
    "info",
  ];

  for (const severity of severityOrder) {
    const group = result.conclusions.filter(
      (c) => c.severity === severity
    );
    if (group.length === 0) continue;

    const label = severity.toUpperCase();
    lines.push(`─ ${label} (${group.length}) ─`);
    for (const c of group) {
      const icon =
        severity === "critical"
          ? "🔴"
          : severity === "important"
            ? "🟠"
            : severity === "notable"
              ? "🟡"
              : "🔵";
      lines.push(`  ${icon} [${c.category}] ${c.statement}`);
      if (c.evidence && Object.keys(c.evidence).length > 0) {
        const ev = Object.entries(c.evidence)
          .map(([k, v]) => `${k}=${typeof v === "number" ? v.toFixed(4) : v}`)
          .join(", ");
        lines.push(`     Evidence: ${ev}`);
      }
      if (c.detail) {
        lines.push(`     Detail: ${c.detail}`);
      }
    }
    lines.push("");
  }

  lines.push("=".repeat(70));
  return lines.join("\n");
}
